"""HTTP API for the Ask page:  uvicorn atlas.api:app --host 127.0.0.1 --port 8000

POST /ask      {"question": "...", "last_org_id": "..."}  ->  answer, language, route, citations, tools called, whether verified
POST /contact  {"kind": "error|suggestion|question|cooperation", "message": "...", "email": "..."}  ->  {"status": "ok"}
GET  /health

Safeguards (plan section 5, Safety): request size cap, per-client rate limit, at most `max_concurrency` questions in flight
(config/models.yaml; one more waits briefly, then gets 503), loopback binding by default. Questions are never stored or logged
(only route, language, timing and whether the answer was verified). Tools are read-only.

The one thing that is stored is a message sent from the contact form: it is appended as one JSON line to data/contact_messages.jsonl
(or ATLAS_CONTACT_FILE), readable by the owner only (mode 600). The optional e-mail address is in that file and nowhere else; the
sender's address (IP) is used for the rate limit in memory only and is not stored, and the text of a message is never logged.
"""
from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import os
import re
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from atlas.ask import Asker
from atlas.config import max_concurrency

log = logging.getLogger("atlas.api")
MAX_QUESTION_CHARS = int(os.environ.get("ATLAS_MAX_QUESTION_CHARS", "500"))
RATE_LIMIT = int(os.environ.get("ATLAS_RATE_LIMIT_PER_MIN", "20"))
QUEUE_WAIT_S = float(os.environ.get("ATLAS_QUEUE_WAIT_S", "20"))
# Behind nginx or a tunnel every request comes from the proxy. With ATLAS_TRUST_PROXY=1 the client is taken from the last
# X-Forwarded-For entry (the one the proxy itself added), but only when the direct peer is a loopback or private address.
TRUST_PROXY = os.environ.get("ATLAS_TRUST_PROXY") == "1"
# Contact form: where the messages go, how long one may be, how many one client may send in 10 minutes, and when the file counts as full.
CONTACT_FILE = Path(os.environ.get("ATLAS_CONTACT_FILE", str(Path(__file__).resolve().parent.parent / "data" / "contact_messages.jsonl")))
CONTACT_MAX_CHARS = 1500
CONTACT_RATE = int(os.environ.get("ATLAS_CONTACT_RATE_PER_10MIN", "5"))
CONTACT_FILE_MAX_BYTES = int(os.environ.get("ATLAS_CONTACT_FILE_MAX_BYTES", str(5 * 1024 * 1024)))
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def client_id(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    if TRUST_PROXY:
        try:
            ip = ipaddress.ip_address(peer)
        except ValueError:
            return peer
        fwd = request.headers.get("x-forwarded-for", "").split(",")[-1].strip()
        if fwd and (ip.is_loopback or ip.is_private):
            return fwd
    return peer


class AskRequest(BaseModel):
    question: str = Field(..., max_length=MAX_QUESTION_CHARS)
    last_org_id: Optional[str] = Field(None, max_length=64)
    lang: Optional[str] = Field(None, pattern="^(hr|en)$")      # language of the page the question was typed on


class ContactRequest(BaseModel):
    kind: Literal["error", "suggestion", "question", "cooperation"]
    message: str = Field(..., max_length=CONTACT_MAX_CHARS)
    email: Optional[str] = Field(None, max_length=200)
    page: Optional[str] = Field(None, max_length=200)          # the page the form was on, e.g. /hr/contact/
    lang: Optional[str] = Field(None, pattern="^(hr|en)$")
    website: Optional[str] = Field(None, max_length=200)       # a field people never see: only a robot fills it in

    @field_validator("message")
    @classmethod
    def _message_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("message is empty")
        return v

    @field_validator("email")
    @classmethod
    def _email_shape(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        if not v:
            return None
        if not EMAIL_RE.match(v):
            raise ValueError("not an e-mail address")
        return v


def create_app(asker: Optional[Asker] = None, contact_file: Optional[Path] = None) -> FastAPI:
    app = FastAPI(title="Erasmus+ Kompas Ask", docs_url=None, redoc_url=None)
    state = {"asker": asker, "sem": None, "hits": defaultdict(deque), "contact_hits": defaultdict(deque), "contact_lock": threading.Lock()}
    contact_path = contact_file or CONTACT_FILE

    def get_asker() -> Asker:
        if state["asker"] is None:                       # built on first use so importing the module never loads data or models
            state["asker"] = Asker()
        return state["asker"]

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post("/ask")
    async def ask(req: AskRequest, request: Request):
        client = client_id(request)
        now = time.time()
        q = state["hits"][client]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= RATE_LIMIT:
            raise HTTPException(429, "too many questions, wait a minute")
        q.append(now)
        if state["sem"] is None:
            state["sem"] = asyncio.Semaphore(max_concurrency())
        try:
            await asyncio.wait_for(state["sem"].acquire(), QUEUE_WAIT_S)
        except asyncio.TimeoutError:
            raise HTTPException(503, "busy, try again shortly")
        try:
            result = await asyncio.to_thread(get_asker().ask, req.question, req.last_org_id, req.lang)
        finally:
            state["sem"].release()
        log.info("ask route=%s lang=%s verified=%s fallback=%s total_s=%s", result["route"], result["lang"], result["verified"],
                 result["fallback"], result["timings"].get("total_s"))
        return {k: result[k] for k in ("answer", "lang", "route", "citations", "tools", "verified", "fallback", "last_org_id")}

    def write_contact(record: dict) -> None:
        """Append one JSON line; the file is created readable by the owner only, and refuses to grow past the cap."""
        line = (json.dumps(record, ensure_ascii=False) + "\n").encode("utf-8")
        with state["contact_lock"]:
            contact_path.parent.mkdir(parents=True, exist_ok=True)
            if (contact_path.stat().st_size if contact_path.exists() else 0) + len(line) > CONTACT_FILE_MAX_BYTES:
                raise HTTPException(503, "the mailbox is full, try again later")
            fd = os.open(contact_path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
            try:
                os.write(fd, line)
            finally:
                os.close(fd)

    @app.post("/contact")
    async def contact(req: ContactRequest, request: Request):
        if req.website:                                  # a robot filled in the hidden field: say thanks and keep nothing
            return {"status": "ok"}
        client = client_id(request)
        now = time.time()
        q = state["contact_hits"][client]
        while q and now - q[0] > 600:
            q.popleft()
        if len(q) >= CONTACT_RATE:
            raise HTTPException(429, "too many messages, wait a few minutes")
        q.append(now)
        record = {"received": datetime.now(timezone.utc).isoformat(timespec="seconds"), "kind": req.kind, "lang": req.lang, "page": req.page,
                  "email": req.email, "message": req.message}
        await asyncio.to_thread(write_contact, record)
        log.info("contact kind=%s lang=%s chars=%s", req.kind, req.lang, len(req.message))        # never the text or the address
        return {"status": "ok"}

    return app


app = create_app()

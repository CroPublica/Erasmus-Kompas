"""HTTP API for the Ask page:  uvicorn atlas.api:app --host 127.0.0.1 --port 8000

POST /ask    {"question": "...", "last_org_id": "..."}  ->  answer, language, route, citations, tools called, whether verified
GET  /health

Safeguards (plan section 5, Safety): request size cap, per-client rate limit, at most `max_concurrency` questions in flight
(config/models.yaml; one more waits briefly, then gets 503), loopback binding by default, no personal data is stored or logged
(only route, language, timing and whether the answer was verified). Tools are read-only.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from collections import defaultdict, deque
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

from atlas.ask import Asker
from atlas.config import max_concurrency

log = logging.getLogger("atlas.api")
MAX_QUESTION_CHARS = int(os.environ.get("ATLAS_MAX_QUESTION_CHARS", "500"))
RATE_LIMIT = int(os.environ.get("ATLAS_RATE_LIMIT_PER_MIN", "20"))
QUEUE_WAIT_S = float(os.environ.get("ATLAS_QUEUE_WAIT_S", "20"))


class AskRequest(BaseModel):
    question: str = Field(..., max_length=MAX_QUESTION_CHARS)
    last_org_id: Optional[str] = Field(None, max_length=64)


def create_app(asker: Optional[Asker] = None) -> FastAPI:
    app = FastAPI(title="KA2 Atlas Ask", docs_url=None, redoc_url=None)
    state = {"asker": asker, "sem": None, "hits": defaultdict(deque)}

    def get_asker() -> Asker:
        if state["asker"] is None:                       # built on first use so importing the module never loads data or models
            state["asker"] = Asker()
        return state["asker"]

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post("/ask")
    async def ask(req: AskRequest, request: Request):
        client = request.client.host if request.client else "unknown"
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
            result = await asyncio.to_thread(get_asker().ask, req.question, req.last_org_id)
        finally:
            state["sem"].release()
        log.info("ask route=%s lang=%s verified=%s fallback=%s total_s=%s", result["route"], result["lang"], result["verified"],
                 result["fallback"], result["timings"].get("total_s"))
        return {k: result[k] for k in ("answer", "lang", "route", "citations", "tools", "verified", "fallback", "last_org_id")}

    return app


app = create_app()

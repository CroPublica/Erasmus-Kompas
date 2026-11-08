import pytest
from fastapi.testclient import TestClient

from atlas import api


class FakeAsker:
    def ask(self, question, last_org_id=None, lang_hint=None):
        return {"answer": f"echo: {question}", "lang": "hr", "route": "national", "citations": [], "tools": [], "verified": True,
                "fallback": False, "last_org_id": last_org_id, "timings": {"total_s": 0.01}}


def client(**kw):
    return TestClient(api.create_app(FakeAsker()), **kw)


def test_health_and_ask():
    c = client()
    assert c.get("/health").json() == {"status": "ok"}
    r = c.post("/ask", json={"question": "Koliko projekata?", "last_org_id": "X"})
    assert r.status_code == 200 and r.json()["answer"] == "echo: Koliko projekata?" and r.json()["last_org_id"] == "X"


def test_request_size_cap_and_missing_field():
    c = client()
    assert c.post("/ask", json={"question": "x" * (api.MAX_QUESTION_CHARS + 1)}).status_code == 422
    assert c.post("/ask", json={}).status_code == 422


def test_rate_limit(monkeypatch):
    monkeypatch.setattr(api, "RATE_LIMIT", 3)
    c = client()
    codes = [c.post("/ask", json={"question": "a"}).status_code for _ in range(5)]
    assert codes == [200, 200, 200, 429, 429]


def test_rate_limit_per_client_behind_proxy(monkeypatch):
    monkeypatch.setattr(api, "RATE_LIMIT", 2)
    monkeypatch.setattr(api, "TRUST_PROXY", True)
    c = client(client=("127.0.0.1", 5000))
    def post(ip):
        return c.post("/ask", json={"question": "a"}, headers={"X-Forwarded-For": f"6.6.6.6, {ip}"}).status_code
    assert [post("1.1.1.1"), post("1.1.1.1"), post("1.1.1.1"), post("2.2.2.2")] == [200, 200, 429, 200]   # a spoofed first entry changes nothing


def test_forwarded_header_ignored_unless_trusted(monkeypatch):
    monkeypatch.setattr(api, "RATE_LIMIT", 1)
    c = client(client=("8.8.8.8", 5000))
    monkeypatch.setattr(api, "TRUST_PROXY", True)
    codes = [c.post("/ask", json={"question": "a"}, headers={"X-Forwarded-For": f"9.9.9.{i}"}).status_code for i in range(2)]
    assert codes == [200, 429]                                    # public peer: header not believed


def test_no_internal_fields_leak():
    r = client().post("/ask", json={"question": "a"}).json()
    assert set(r) == {"answer", "lang", "route", "citations", "tools", "verified", "fallback", "last_org_id"}


# ---- POST /contact: the message goes into a file, nothing else happens ----
import json as _json


def contact_client(tmp_path, **kw):
    path = tmp_path / "contact.jsonl"
    return TestClient(api.create_app(FakeAsker(), contact_file=path), **kw), path


def test_contact_message_is_written_as_one_json_line(tmp_path):
    c, path = contact_client(tmp_path)
    r = c.post("/contact", json={"kind": "error", "message": "  U tablici ima greška: č, ć, š  ", "email": " ana@example.com ", "page": "/hr/contact/", "lang": "hr"})
    assert r.status_code == 200 and r.json() == {"status": "ok"}
    lines = path.read_text(encoding="utf-8").splitlines()
    rec = _json.loads(lines[0])
    assert len(lines) == 1 and rec["message"] == "U tablici ima greška: č, ć, š" and rec["email"] == "ana@example.com"
    assert rec["kind"] == "error" and rec["lang"] == "hr" and rec["page"] == "/hr/contact/" and rec["received"].endswith("+00:00")
    assert set(rec) == {"received", "kind", "lang", "page", "email", "message"}, "nothing about the sender (no address, no browser) is stored"
    c.post("/contact", json={"kind": "question", "message": "second"})
    assert len(path.read_text(encoding="utf-8").splitlines()) == 2, "messages are appended"
    assert oct(path.stat().st_mode & 0o777) == "0o600", "readable by the owner only"


def test_contact_email_is_optional(tmp_path):
    c, path = contact_client(tmp_path)
    assert c.post("/contact", json={"kind": "suggestion", "message": "hello", "email": ""}).status_code == 200
    assert _json.loads(path.read_text(encoding="utf-8"))["email"] is None


@pytest.mark.parametrize("body", [
    {"kind": "error", "message": ""},
    {"kind": "error", "message": "   "},
    {"kind": "error"},
    {"kind": "spam", "message": "hello"},
    {"kind": "error", "message": "x" * (api.CONTACT_MAX_CHARS + 1)},
    {"kind": "error", "message": "hello", "email": "not-an-address"},
    {"kind": "error", "message": "hello", "lang": "de"},
])
def test_contact_rejects_bad_input_and_writes_nothing(tmp_path, body):
    c, path = contact_client(tmp_path)
    assert c.post("/contact", json=body).status_code == 422
    assert not path.exists()


def test_contact_hidden_field_means_a_robot_and_nothing_is_kept(tmp_path):
    c, path = contact_client(tmp_path)
    assert c.post("/contact", json={"kind": "error", "message": "buy now", "website": "http://spam.example"}).json() == {"status": "ok"}
    assert not path.exists()


def test_contact_rate_limit_and_full_mailbox(tmp_path, monkeypatch):
    c, path = contact_client(tmp_path)
    monkeypatch.setattr(api, "CONTACT_RATE", 2)
    assert [c.post("/contact", json={"kind": "error", "message": f"m{i}"}).status_code for i in range(3)] == [200, 200, 429]
    assert len(path.read_text(encoding="utf-8").splitlines()) == 2
    c2, path2 = contact_client(tmp_path / "other")
    monkeypatch.setattr(api, "CONTACT_FILE_MAX_BYTES", 200)
    monkeypatch.setattr(api, "CONTACT_RATE", 99)
    codes = [c2.post("/contact", json={"kind": "error", "message": "x" * 40}).status_code for _ in range(4)]
    assert codes[0] == 200 and 503 in codes, "the file stops growing at the cap"
    assert path2.stat().st_size <= 200


def test_contact_text_is_not_logged(tmp_path, caplog):
    c, _ = contact_client(tmp_path)
    with caplog.at_level("INFO", logger="atlas.api"):
        c.post("/contact", json={"kind": "error", "message": "SECRET-TEXT", "email": "secret@example.com"})
    assert "SECRET-TEXT" not in caplog.text and "secret@example.com" not in caplog.text and "contact kind=error" in caplog.text

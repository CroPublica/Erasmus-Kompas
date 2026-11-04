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

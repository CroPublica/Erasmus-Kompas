import pytest
from fastapi.testclient import TestClient

from atlas import api


class FakeAsker:
    def ask(self, question, last_org_id=None):
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


def test_no_internal_fields_leak():
    r = client().post("/ask", json={"question": "a"}).json()
    assert set(r) == {"answer", "lang", "route", "citations", "tools", "verified", "fallback", "last_org_id"}

"""The Ask flow without any model server: fake router and writer models, real tools and data."""
import pytest

from atlas.ask import Asker, Plan, detect_language, hr_plural, verify_answer
from atlas.tools import DB_PATH, Toolbox

pytestmark = pytest.mark.skipif(not DB_PATH.exists(), reason="data/atlas.duckdb not built")


class FakeRouter:
    def __init__(self, **plan):
        self.plan = Plan(**plan)

    def invoke(self, _messages):
        return self.plan


class FakeWriter:
    def __init__(self, *texts):
        self.texts, self.calls = list(texts), 0

    def invoke(self, _messages):
        self.calls += 1
        text = self.texts[min(self.calls - 1, len(self.texts) - 1)]
        return type("Msg", (), {"content": text})()


@pytest.fixture(scope="module")
def tb():
    return Toolbox()


def asker(tb, router, writer=None, mode="template"):
    return Asker(toolbox=tb, router=router, writer=writer or FakeWriter("x"), mode=mode)


def test_language_detection():
    assert detect_language("Koliko je KA2 projekata imala Gimnazija Metković?") == "hr"
    assert detect_language("How many KA2 projects does the University of Dubrovnik have?") == "en"
    assert detect_language("How many projekata ima Sveučilište u Splitu") == "hr"          # mixed input follows the Croatian words
    assert detect_language("Which counties are above the national rate in Varaždinska?") == "en"   # names do not count


def test_croatian_number_forms():
    assert [hr_plural(n, "projekt", "projekta", "projekata") for n in (1, 2, 5, 11, 12, 21, 22, 25, 151)] == \
        ["projekt", "projekta", "projekata", "projekata", "projekata", "projekt", "projekta", "projekata", "projekt"]


def test_verifier_catches_invented_numbers_and_citations(tb):
    res = [tb.organisation_profile("MZO-19-049-502").as_dict()]
    assert verify_answer("Gimnazija ima 22 projekta, 1 kao koordinator, 120.000 €.", res, "hr") == []
    assert verify_answer("Gimnazija ima 23 projekta.", res, "hr")
    assert verify_answer("Grants: 120,000 €", res, "en") == []
    assert verify_answer("Vrijednost je 3,27 mil. €", res, "hr") == []                     # millions are allowed roundings
    assert verify_answer("See [project:NOPE-1]", res, "en")
    assert verify_answer("Nema dokaza u podacima.", res, "hr")                              # says no evidence while rows exist
    assert verify_answer("The school has taken part in many projects and coordinated one of them last year.", res, "hr")  # wrong language


def test_template_mode_answers_from_the_tools(tb):
    a = asker(tb, FakeRouter(route="organisation", organisation="Gimnazija Metković"))
    r = a.ask("Koliko je KA2 projekata imala Gimnazija Metković?")
    assert r["route"] == "organisation" and "22" in r["answer"] and "120.000" in r["answer"] and "Biljna pozornica" in r["answer"]
    assert "org:MZO-19-049-502" in r["citations"] and r["last_org_id"] == "MZO-19-049-502"
    assert [t["tool"] for t in r["tools"]] == ["find_organisation", "organisation_profile"]


def test_follow_up_uses_the_previous_organisation(tb):
    a = asker(tb, FakeRouter(route="national"))
    r = a.ask("A koliko ih je koordinirala?", last_org_id="MZO-19-049-502")
    assert r["route"] == "organisation" and "1 kao koordinator" in r["answer"]


def test_router_cannot_invent_a_county_or_period(tb):
    a = asker(tb, FakeRouter(route="coverage", county="Zagrebsko", period="2014-2020"))
    r = a.ask("Je li Zagrebačka županija ispod očekivanja?")
    assert r["plan"]["county"] == "Zagrebačka" and r["plan"]["period"] == "all" and "10 od 69" in r["answer"]


def test_refusals_and_limits(tb):
    for q, route in [("Tko je ravnatelj Gimnazije Metković?", "out_of_scope"), ("Koliko KA1 mobilnosti ima Gimnazija Metković?", "limits"),
                     ("Koji je najbolji recept za sarmu?", "out_of_scope"), ("Zbroji vrijednost projekata svih županija.", "out_of_scope")]:
        r = asker(tb, FakeRouter(route="organisation" if "ravnatelj" in q or "KA1" in q else "concepts")).ask(q)
        assert r["route"] == route and not r["tools"], q


def test_unknown_school_gets_no_evidence_not_a_guess(tb):
    r = asker(tb, FakeRouter(route="organisation", organisation="Gimnazija Atlantida")).ask("Koliko KA2 projekata ima Gimnazija Atlantida?")
    assert "Nema dokaza" in r["answer"]


def test_empty_question(tb):
    r = asker(tb, FakeRouter(route="national")).ask("   ")
    assert r["route"] == "out_of_scope" and not r["tools"]


def test_llm_mode_accepts_a_faithful_answer(tb):
    w = FakeWriter("Gimnazija Metković je imala 22 KA2 projekta, od toga 1 kao koordinator.")
    r = asker(tb, FakeRouter(route="organisation", organisation="Gimnazija Metković"), w, mode="llm").ask("Koliko je KA2 projekata imala Gimnazija Metković?")
    assert r["verified"] and not r["fallback"] and w.calls == 1


def test_llm_mode_retries_then_falls_back_to_the_template(tb):
    w = FakeWriter("Gimnazija Metković je imala 99 KA2 projekata.")                       # invented number, twice
    r = asker(tb, FakeRouter(route="organisation", organisation="Gimnazija Metković"), w, mode="llm").ask("Koliko je KA2 projekata imala Gimnazija Metković?")
    assert w.calls == 2 and r["fallback"] and not r["verified"] and "22" in r["answer"] and "99" not in r["answer"]


def test_llm_mode_never_calls_the_model_when_nothing_was_found(tb):
    w = FakeWriter("Gimnazija Atlantida ima 99 projekata.")
    r = asker(tb, FakeRouter(route="organisation", organisation="Gimnazija Atlantida"), w, mode="llm").ask("Koliko KA2 projekata ima Gimnazija Atlantida?")
    assert w.calls == 0 and "Nema dokaza" in r["answer"] and "99" not in r["answer"]

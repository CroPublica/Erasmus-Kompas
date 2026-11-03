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


def test_verifier_flags_serbian_forms_in_croatian_text(tb):
    res = [tb.organisation_profile("MZO-19-049-502").as_dict()]
    assert verify_answer("Gimnazija ima tačno 22 projekta.", res, "hr")
    assert verify_answer("Gimnazija ima točno 22 projekta.", res, "hr") == []
    assert verify_answer("Gimnazija ima 22 hiljade projekata.", res, "hr")
    assert verify_answer("It has exactly 22 projects.", res, "en") == []              # only Croatian answers are checked


def test_polish_mode_keeps_every_figure_or_falls_back_to_the_draft(tb):
    plan = FakeRouter(route="organisation", organisation="Gimnazija Metković")
    good = FakeWriter("Gimnazija Metković ima 22 KA2 projekta (10 u 2014.–2020., 12 u 2021.–2026.), jedan kao koordinator (Biljna pozornica, 2023), a koordinirani projekti vrijede 120.000 €; "
                      "ukupna vrijednost svih projekata je 3.273.111 €. Najčešće surađuje s Italijom (11), Turskom (9) i Španjolskom (8).")
    r = asker(tb, plan, good, mode="polish").ask("Koliko je KA2 projekata imala Gimnazija Metković?")
    assert r["verified"] and not r["fallback"] and good.calls == 1
    dropped = FakeWriter("Gimnazija Metković ima 22 KA2 projekta.")                       # leaves out the grants
    r = asker(tb, plan, dropped, mode="polish").ask("Koliko je KA2 projekata imala Gimnazija Metković?")
    assert dropped.calls == 2 and r["fallback"] and "120.000" in r["answer"] and "3.273.111" in r["answer"]
    assert asker(tb, FakeRouter(route="organisation", organisation="Gimnazija Atlantida"), FakeWriter("x"), mode="polish").ask("Koliko KA2 projekata ima Gimnazija Atlantida?")["answer"].startswith("Nema dokaza")


def test_polish_may_answer_part_of_the_draft_but_not_use_other_numbers(tb):
    plan = FakeRouter(route="organisation", organisation="Gimnazija Metković")
    focused = FakeWriter("Da, Gimnazija Metković je koordinirala jedan projekt, a u ukupno 22 projekta sudjeluje, od toga 10 u razdoblju 2014.–2020.")
    r = asker(tb, plan, focused, mode="polish").ask("Je li Gimnazija Metković ikada koordinirala KA2 projekt?")
    assert r["verified"] and not r["fallback"] and focused.calls == 1
    eu_total = FakeWriter("Gimnazija Metković sudjeluje u 46526 projekata, od toga 22 njezinih.")           # a real number from the tool output, but not from the draft
    r = asker(tb, plan, eu_total, mode="polish").ask("Koliko KA2 projekata ima Gimnazija Metković?")
    assert r["fallback"] and "46526" not in r["answer"]


def test_success_rate_route_needs_keywords_and_answers_from_the_table(tb):
    a = asker(tb, FakeRouter(route="national"))
    r = a.ask("Kolika je bila stopa prolaznosti KA2 prijava u Hrvatskoj 2023.?")
    assert r["route"] == "success" and "405" in r["answer"] and "49" in r["answer"] and "12,1" in r["answer"]
    r = asker(tb, FakeRouter(route="success")).ask("Koji će projekti biti odobreni 2027.?")       # the router said success, the words do not
    assert r["route"] == "out_of_scope"
    r = asker(tb, FakeRouter(route="success")).ask("Koliko je KA2 projekata s hrvatskim sudionicima bilo 2014.–2020.?")
    assert r["route"] == "national" and "2.040" in r["answer"]


def test_verifier_flags_cannot_determine_claims_when_data_exists(tb):
    res = [tb.national_stats().as_dict()]
    assert verify_answer("Iz sažetka nije moguće izdvojiti ukupan broj projekata.", res, "hr")
    assert verify_answer("It is not possible to determine the number of projects.", res, "en")
    assert verify_answer("3.830 KA2 projekata ima hrvatskog sudionika.", res, "hr") == []


def test_concepts_route_answers_from_the_concept_tools(tb):
    a = asker(tb, FakeRouter(route="concepts"))
    r = a.ask("Koje su najčešće metode u KA2 projektima?")
    assert "tools=['common_concepts']" in " ".join(r["trace"]) and "radionice" in r["answer"]
    r = a.ask("Which groups of concepts occur together in KA2 projects?")
    assert "community_overview" in " ".join(r["trace"]) and "projects" in r["answer"] and "projekata" not in r["answer"]
    for q in ("Which problems do KA2 projects address most often?", "Koje probleme KA2 projekti najčešće rješavaju?"):   # the example questions on the Ask page
        r = a.ask(q)
        assert "tools=['common_concepts']" in " ".join(r["trace"]) and "problem" in r["answer"].lower() and "problem-based" not in r["answer"]
    r = a.ask("Što znamo o vršnjačkom nasilju u projektima?")
    assert "concept_profile" in " ".join(r["trace"]) and "donja granica" in r["answer"]


def test_list_questions_narrowed_by_a_concept_use_that_concept(tb):
    a = asker(tb, FakeRouter(route="concepts"))
    r = a.ask("Which approaches work best for students with fewer opportunities?")           # the qualifier must not be dropped
    assert "tools=['search_concepts', 'concept_profile']" in " ".join(r["trace"]) and "students with fewer opportunities" in r["answer"]
    r = a.ask("Koji se pristupi najčešće koriste za rad s učenicima s manje mogućnosti?")
    assert "concept_profile" in " ".join(r["trace"]) and "manje mogućnosti" in r["answer"]
    r = a.ask("Koje su najčešće metode u KA2 projektima?")                                    # nothing to narrow: the overall list
    assert "tools=['common_concepts']" in " ".join(r["trace"])


def test_unknown_qualifier_is_said_not_ignored(tb):
    r = asker(tb, FakeRouter(route="concepts")).ask("Most common approaches for zzyzx widgets in projects")
    assert "common_concepts" in " ".join(r["trace"]) and "zzyzx" in r["answer"] and "overall list" in r["answer"]


def test_concepts_route_without_a_match_says_there_is_no_evidence(tb):
    r = asker(tb, FakeRouter(route="concepts")).ask("Kakvi su projekti o kvantnom računanju u vrtićima?")
    assert r["answer"].startswith("Nema dokaza")


def test_organisation_route_without_a_name_but_with_a_county_becomes_a_county_question(tb):
    r = asker(tb, FakeRouter(route="organisation")).ask("Koliko iznose KA2 potpore za projekte koje koordiniraju organizacije iz Dubrovačko-neretvanske županije?")
    assert r["plan"]["route"] == "county" and "3,72" in r["answer"].replace(".", ",") or "3.719.625" in r["answer"] or "3,72" in r["answer"]


def test_trend_and_connection_questions_use_their_tools(tb):
    a = asker(tb, FakeRouter(route="concepts"))
    r = a.ask("Kako su se teme promijenile između 2014.–2020. i 2021.–2026.?")
    assert "concept_trends" in " ".join(r["trace"]) and "Rastu" in r["answer"]
    r = a.ask("Which concepts connect the most different themes?")
    assert "connected_concepts" in " ".join(r["trace"]) and "neighbours" in r["answer"]
    r = a.ask("What are the main clusters of themes in KA2 projects with Croatian participants?")
    assert "community_overview" in " ".join(r["trace"])


def test_yes_no_questions_start_with_yes_or_no(tb):
    a = asker(tb, FakeRouter(route="organisation", organisation="Gimnazija Metković"))
    assert a.ask("Je li Gimnazija Metković ikada koordinirala KA2 projekt?")["answer"].startswith("Da. ")
    assert a.ask("Has Gimnazija Metković ever coordinated a KA2 project?")["answer"].startswith("Yes. ")
    assert not a.ask("Koliko projekata ima Gimnazija Metković?")["answer"].startswith(("Da", "Ne"))        # not a yes/no question
    a2 = asker(tb, FakeRouter(route="organisation", organisation="Gimnazija Dubrovnik"))
    assert a2.ask("Je li Gimnazija Dubrovnik sudjelovala u nekom KA2 projektu od 2014.?")["answer"].startswith("Ne. ")

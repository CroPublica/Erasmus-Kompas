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


def test_question_about_a_first_topic_gets_the_common_topics_and_says_why(tb):
    a = asker(tb, FakeRouter(route="concepts"))
    r = a.ask("what was the first topic of every erasmus+ project")
    assert "common_concepts" in " ".join(r["trace"]) and "no “first” topic" in r["answer"] and r["verified"]
    r = a.ask("Tell me about quantum entanglement in projects")
    assert r["answer"].startswith("No evidence") and "Try a specific theme" in r["answer"]            # says what can be asked instead


def test_language_follows_the_words_not_the_names(tb):
    from atlas.ask import detect_language
    assert detect_language("Has Ustanova za obrazovanje odraslih Dante ever coordinated a KA2 project?") == "en"      # Croatian names inside an English question
    assert detect_language("How many schools in Koprivničko-križevačka županija take part in KA2?") == "en"
    assert detect_language("Which countries does Srednja škola Metković work with most?") == "en"
    assert detect_language("Koliko KA2 projekata ima Gimnazija Metković?") == "hr"
    assert detect_language("Koliko škola u Koprivničko-križevačka županija sudjeluje u KA2?") == "hr"


def test_english_answers_use_english_county_names_and_croatian_ones_keep_theirs(tb):
    from atlas.ask import _label, EN_COUNTY
    assert _label("en", "Varaždinska županija") == "Varaždin County" and _label("en", "Grad Zagreb") == "City of Zagreb"
    assert _label("hr", "Varaždinska županija") == "Varaždinska županija"
    assert len(EN_COUNTY) == 21 and not any("ska County" in v or "ška County" in v for v in EN_COUNTY.values())      # no 'Varaždinska County' hybrids


def test_titles_are_quoted_as_names_and_lists_have_a_lead_sentence(tb):
    from atlas.ask import quote_title
    assert quote_title("Biljna pozornica", 2023) == "„Biljna pozornica” (2023)" and quote_title("A title", 2020, lang="en") == "“A title” (2020)"
    assert quote_title("word " * 40, None, 30).endswith("…”") and len(quote_title("word " * 40, None, 30)) < 40       # cut at a word, never mid-word
    a = asker(tb, FakeRouter(route="top_organisations", county="Istarska"))
    r = a.ask("Koje su najaktivnije organizacije u Istarska županija?")
    assert r["answer"].startswith("Najaktivnije organizacije (Istarska županija), broj KA2 projekata:")
    r = asker(tb, FakeRouter(route="organisation", organisation="Gimnazija Metković")).ask("Koliko projekata ima Gimnazija Metković?")
    assert "izvorni naslov" in r["answer"] and "„Biljna pozornica” (2023)" in r["answer"]


def test_an_organisation_named_in_the_question_beats_the_country_ranking(tb):
    r = asker(tb, FakeRouter(route="organisation", organisation="Srednja škola Metković")).ask("Which countries does Srednja škola Metković work with most?")   # the word 'countries' must not override the router
    assert r["route"] == "organisation" and "Works most with" in r["answer"]


@pytest.mark.parametrize("question,wrong_route", [("Koje županije imaju najviše projekata?", "county"), ("Which counties have the most projects?", "county"),
                                                    ("Koje županije imaju najviše projekata?", "national")])
def test_ranking_of_counties_is_answered_whatever_the_router_says(tb, question, wrong_route):
    r = asker(tb, FakeRouter(route=wrong_route)).ask(question)
    assert r["route"] == "county_ranking" and ("Grad Zagreb" in r["answer"] or "City of Zagreb" in r["answer"]) and "1.445" in r["answer"].replace(",", ".") and r["citations"]
    assert r["tools"][0]["tool"] == "county_ranking" and "Nema dokaza" not in r["answer"] and "No evidence" not in r["answer"]


@pytest.mark.parametrize("question,wrong_route", [("S kojim državama Hrvatska surađuje?", "coverage"), ("Which countries does Croatia partner with?", "country_ranking"),
                                                    ("S kojim državama Hrvatska surađuje?", "county")])
def test_partner_countries_are_not_confused_with_coordinators_or_schools(tb, question, wrong_route):
    r = asker(tb, FakeRouter(route=wrong_route)).ask(question)
    assert r["route"] == "partner_countries" and r["tools"][0]["tool"] == "partner_countries"
    assert ("Italija" in r["answer"] or "Italy" in r["answer"]) and "škola" not in r["answer"]


def test_a_named_county_still_goes_to_the_county_route(tb):
    r = asker(tb, FakeRouter(route="county", county="Splitsko-dalmatinska")).ask("Koliko projekata ima Splitsko-dalmatinska županija?")
    assert r["route"] == "county" and "320" in r["answer"]


def test_page_language_decides_for_bare_names():
    from atlas.ask import detect_language
    assert detect_language("Varaždinska", "en") == "en"
    assert detect_language("Sveučilište u Zagrebu", "en") == "en"
    assert detect_language("Varaždinska", "hr") == "hr"
    assert detect_language("Which counties have the most projects?", "hr") == "en"
    assert detect_language("Koliko projekata ima Splitsko-dalmatinska županija?", "en") == "hr"
    assert detect_language("Varaždinska") == "hr"


@pytest.mark.parametrize("question,lang,expect", [
    ("what was the first topic of very first project in Grad Zagreb", "en", ("MANUCULTURA", "Creativity and culture")),
    ("Koji je prvi projekt u Gradu Zagrebu i koja mu je tema?", "hr", ("MANUCULTURA", "Teme prema izvoru")),
    ("What is the 5th project in Istria County?", "en", ("EH-CMap", "Energy and resources")),
    ("What is the last project in Varaždin County?", "en", ("last", "2026"))])
def test_nth_project_of_a_county_with_its_topics(tb, question, lang, expect):
    r = asker(tb, FakeRouter(route="out_of_scope")).ask(question)
    assert r["route"] == "county_project" and r["tools"][0]["tool"] == "county_project" and r["verified"], r["problems"]
    assert r["lang"] == lang and all(x in r["answer"] for x in expect)
    assert r["citations"] and r["citations"][0].startswith("project:")


def test_nth_project_beyond_the_end_says_so(tb):
    res = tb.county_project("Istarska", 9999)
    assert res.rows[0]["total"] < 9999 and "only" in res.notes[0]


def test_english_county_names_resolve(tb):
    assert tb.resolve_county("projects in Split-Dalmatia County") == "Splitsko-dalmatinska"
    assert tb.resolve_county("Istria") == "Istarska" and tb.resolve_county("City of Zagreb") == "Grad Zagreb"


@pytest.mark.parametrize("question,route,expect", [
    ("What does coordinator mean?", "glossary", "submits the application"),
    ("Što znači koordinator?", "glossary", "podnosi prijavu"),
    ("How many projects were there in 2023?", "year_count", "328"),
    ("Koliko je projekata bilo 2023.?", "year_count", "328"),
    ("What is the total value of the projects?", "value", "million"),
    ("Who coordinates the most projects in Osijek-Baranja County?", "top_organisations", "Osijek"),
    ("Which topics are the most common?", "concepts", "topics")])
def test_suggested_questions_of_the_ask_page(tb, question, route, expect):
    r = asker(tb, FakeRouter(route="county_ranking" if route == "top_organisations" else "out_of_scope")).ask(question)   # the small router sends the county question to the ranking
    assert r["route"] == route and r["verified"], (r["route"], r["problems"])
    assert expect.lower() in r["answer"].lower() or route == "concepts"


def test_coordinator_question_ranks_by_coordinations(tb):
    a = asker(tb, FakeRouter(route="top_organisations")).ask("Who coordinates the most projects?")
    b = asker(tb, FakeRouter(route="top_organisations")).ask("Which organisations have the most projects?")
    assert a["tools"][0]["args"]["role"] == "coordinator" and b["tools"][0]["args"]["role"] == "any"
    assert "coordinate the most" in a["answer"] and a["answer"] != b["answer"] and a["verified"]
    rows = tb.top_organisations(None, "all", 5, "coordinator").rows
    assert [r["coordinated"] for r in rows] == sorted((r["coordinated"] for r in rows), reverse=True)


def test_english_money_and_percent_style_and_croatian_terms(tb):
    from atlas.ask import en_style
    assert en_style("worth 952.7 million € (7,340,431 €), 24 %") == "worth €952.7 million (€7,340,431), 24%"
    r = asker(tb, FakeRouter(route="organisation", organisation="Gimnazija Metković")).ask("Koliko KA2 projekata ima Gimnazija Metković?")
    assert "Bespovratna sredstva projekata koje koordinira" in r["answer"] and "Potpore" not in r["answer"]
    p = asker(tb, FakeRouter(route="partner_countries")).ask("S kojim državama Hrvatska surađuje?")
    assert "zemlje" not in p["answer"]


@pytest.mark.parametrize("question,expected", [
    ("Koje je godine bilo najmanje projekata?", "Najmanje projekata bilo je 2014. (113)"),
    ("Koja je godina imala najveći pad broja projekata?", "2021. (-212"),
    ("Koja je godina imala najveći međugodišnji rast?", "2020. (+215"),
    ("Koliki je prosječan godišnji broj projekata od 2014. do 2020.?", "iznosi 291"),
    ("Koliko je projekata više bilo 2020. nego 2014.?", "razlika je +491"),
    ("Je li hrvatsko sudjelovanje u KA2 raslo?", "rastao je s 113 u 2014. na 604 u 2020."),
])
def test_questions_about_years_without_one_year_are_answered_from_the_series(tb, question, expected):
    """These used to crash (no year in the question) or answer only the first year named."""
    r = asker(tb, FakeRouter(route="year_count")).ask(question)
    assert r["route"] == "year_count" and expected in r["answer"] and r["tools"][-1]["tool"] == "year_series"


def test_single_year_question_still_answers_that_year(tb):
    r = asker(tb, FakeRouter(route="year_count")).ask("Koliko je projekata bilo 2018. godine?")
    assert r["tools"][-1]["tool"] == "year_projects" and "346" in r["answer"]


def test_a_range_of_years_is_answered_by_period_not_by_the_first_year(tb):
    r = asker(tb, FakeRouter(route="year_count")).ask("Koliko je KA2 projekata s hrvatskim sudionicima bilo 2014.–2020., a koliko 2021.–2026.?")
    assert r["route"] == "national" and "2.040" in r["answer"] and "1.790" in r["answer"]


@pytest.mark.parametrize("question,expected", [
    ("Kolika je prosječna vrijednost projekta?", "249.015"),
    ("Kolika je prosječna vrijednost projekata koje koordiniraju hrvatske organizacije?", "184.463"),
    ("Koji je najskuplji projekt s hrvatskim sudionikom?", "14.400.000"),
    ("Koji projekt ima najmanju dodijeljenu vrijednost?", "750"),
    ("Koliko projekata ima vrijednost veću od milijun eura?", "56 od"),
    ("How many projects have a grant above 500,000 euros?", "153"),
])
def test_value_questions_use_the_project_values_tool(tb, question, expected):
    r = asker(tb, FakeRouter(route="value")).ask(question)
    assert r["tools"][-1]["tool"] == "project_values" and expected in r["answer"]


def test_total_value_still_uses_the_national_total(tb):
    r = asker(tb, FakeRouter(route="value")).ask("Kolika je ukupna vrijednost projekata s hrvatskim sudionicima?")
    assert r["tools"][-1]["tool"] == "national_stats" and "952,7" in r["answer"]


@pytest.mark.parametrize("question", ["Bok!", "Što mogu pitati?", "Možeš li mi pomoći?", "Hello, what can you do?"])
def test_greetings_and_help_get_examples_not_a_refusal(tb, question):
    r = asker(tb, FakeRouter(route="out_of_scope")).ask(question)
    assert r["tools"] == [] and ("Na primjer" in r["answer"] or "For example" in r["answer"])


def test_counts_and_shares_are_numbers_not_rankings(tb):
    a = asker(tb, FakeRouter(route="top_organisations"))
    assert "1.498" in a.ask("Koliko ukupno organizacija iz Hrvatske sudjeluje u KA2?")["answer"]
    assert "15,8 %" in a.ask("Koliki postotak projekata s hrvatskim sudionicima koordiniraju hrvatske organizacije?")["answer"]
    assert "21" in asker(tb, FakeRouter(route="county_ranking")).ask("Koliko županija sudjeluje u KA2?")["answer"]


def test_school_type_in_the_question_filters_the_coverage(tb):
    a = asker(tb, FakeRouter(route="coverage", county="Splitsko-dalmatinska"))
    assert "od 99 škola" in a.ask("Koliko osnovnih škola u Splitsko-dalmatinskoj županiji sudjeluje u KA2?")["answer"]


@pytest.mark.parametrize("question,expected", [
    ("Koje organizacije iz Pule sudjeluju u KA2 projektima?", "Sveučilište Jurja Dobrile u Puli"),
    ("Koje organizacije iz Cavtata sudjeluju u KA2?", "Muzeji i galerije Konavala"),
    ("Koje organizacije iz Gospića sudjeluju u Erasmus+ projektima?", "Gimnazija Gospić"),
    ("Koje škole iz Metkovića sudjeluju u KA2?", "Srednja škola Metković"),
    ("Which organisations in Rijeka take part in KA2?", "organisations take part"),
])
def test_questions_about_a_town_list_its_organisations(tb, question, expected):
    r = asker(tb, FakeRouter(route="organisation")).ask(question)
    assert r["route"] == "town" and r["tools"][-1]["tool"] == "town_organisations" and expected in r["answer"]


def test_town_tool_counts_match_the_data(tb):
    rows = tb.town_organisations("Gospić").rows
    assert rows[0]["organisations"] == 4 and rows[0]["projects"] == 12 and rows[1]["name"] == "Gimnazija Gospić"
    assert tb.resolve_town("iz Zadra") == "Zadar" and tb.resolve_town("u Rijeci") is None or tb.resolve_town("iz Rijeke") == "Rijeka"


def test_a_county_name_is_not_taken_for_a_town(tb):
    r = asker(tb, FakeRouter(route="county", county="Splitsko-dalmatinska")).ask("Koliko škola u Splitsko-dalmatinskoj županiji još nije sudjelovalo u KA2?")
    assert r["route"] == "coverage"


def test_partner_countries_of_a_town_and_of_a_remembered_organisation(tb):
    a = asker(tb, FakeRouter(route="partner_countries"))
    r = a.ask("S kojim zemljama surađuju organizacije iz Zadra?")
    assert r["tools"][-1]["args"]["town"] == "Zadar" and "Zadar" in r["answer"]
    first = asker(tb, FakeRouter(route="organisation", organisation="Gimnazija Metković")).ask("Koliko KA2 projekata ima Gimnazija Metković?")
    r = a.ask("A s kojim zemljama surađuje?", first["last_org_id"])
    assert r["tools"][-1]["args"]["org_id"] == first["last_org_id"] and "Gimnazija Metković" in r["answer"]


def test_county_with_most_organisations_ranks_by_organisations(tb):
    r = asker(tb, FakeRouter(route="county_ranking")).ask("Koja županija ima najviše organizacija u KA2?")
    assert "broju organizacija" in r["answer"] and r["tools"][-1]["args"]["order_by"] == "organisations"


def test_how_to_apply_is_refused_not_answered_with_a_project(tb):
    r = asker(tb, FakeRouter(route="project_search", topic="natječaj")).ask("Kako se prijaviti na KA2 natječaj?")
    assert r["route"] == "out_of_scope"


def test_county_answer_names_the_period_it_was_filtered_to(tb):
    r = asker(tb, FakeRouter(route="county", county="Međimurska", period="2021-2027")).ask("Koliko projekata koordiniraju organizacije iz Međimurske županije 2021.–2026.?")
    assert r["answer"].startswith("Razdoblje 2021.–2026.") and "67" in r["answer"]


def test_two_named_countries_are_compared(tb):
    r = asker(tb, FakeRouter(route="country_ranking")).ask("Koliko KA2 projekata koordinira Hrvatska u odnosu na Sloveniju?")
    assert r["tools"][-1]["tool"] == "country_compare" and "Hrvatska: 606" in r["answer"] and "Slovenija: 636" in r["answer"]


def test_year_question_without_the_word_project_survives_a_wrong_router_route(tb):
    r = asker(tb, FakeRouter(route="success")).ask("Koja je godina imala najveći međugodišnji rast?")
    assert r["route"] == "year_count" and "2020. (+215" in r["answer"]


def test_coordinator_share_follow_up_without_an_organisation_is_national(tb):
    r = asker(tb, FakeRouter(route="top_organisations")).ask("U koliko je tih projekata koordinator hrvatska organizacija?")
    assert r["route"] == "national" and "606" in r["answer"]


def test_ordinary_words_are_not_taken_for_short_town_names(tb):
    assert tb.resolve_towns("Dubrovnik i Split: tko ima više projekata?") == ["Dubrovnik", "Split"]      # 'više' is not Vis
    assert tb.resolve_towns("bol u leđima") == [] and tb.resolve_towns("Organizacije na Visu") == ["Vis"]


@pytest.mark.parametrize("question,expected", [
    ("Dubrovnik i Split: tko ima više projekata?", "Najviše projekata ima Split"),
    ("Koliko projekata ima Pula u odnosu na Zadar?", "Najviše projekata ima Zadar"),
    ("Which has more projects, Rijeka or Osijek?", "Rijeka has the most projects"),
])
def test_towns_can_be_compared(tb, question, expected):
    r = asker(tb, FakeRouter(route="top_organisations")).ask(question)
    assert r["route"] == "town" and r["tools"][-1]["tool"] == "town_compare" and expected in r["answer"]


def test_who_has_a_town_worked_with_is_answered_by_partner_countries(tb):
    r = asker(tb, FakeRouter(route="organisation")).ask("Who has Osijek worked with?")
    assert r["tools"][-1]["tool"] == "partner_countries" and r["tools"][-1]["args"]["town"] == "Osijek"

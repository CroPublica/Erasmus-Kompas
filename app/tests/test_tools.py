"""The Ask tools against the regression numbers (plan section 4 and eval/qa_hr.jsonl). Needs data/atlas.duckdb (run ./run_pipeline.sh)."""
import pytest

from atlas.tools import DB_PATH, Toolbox

pytestmark = pytest.mark.skipif(not DB_PATH.exists(), reason="data/atlas.duckdb not built")


@pytest.fixture(scope="module")
def tb():
    return Toolbox()


def top(tb, name):
    r = tb.find_organisation(name)
    assert r.rows, name
    return r.rows[0]


def test_gimnazija_metkovic(tb):                                   # A01, A02, A04, A05, A09, I01
    o = top(tb, "Gimnazija Metković")
    assert (o["projects"], o["coordinated"]) == (22, 1)
    assert top(tb, "gimnazija metkovic")["org_id"] == o["org_id"]
    p = tb.organisation_profile(o["org_id"]).rows[0]
    assert (p["projects_2014_2020"], p["projects_2021_2027"]) == (10, 12)
    assert p["grants_coordinated_eur"] == 120000 and round(p["value_involved_eur"]) == 3273111 and p["good_practice"] == 3
    assert [c for c, _ in p["partner_countries"][:2]] == ["IT", "TR"] and len(p["partner_countries"]) == 21
    assert any(x["title"] == "Biljna pozornica" and x["call_year"] == 2023 for x in p["coordinated_projects"])
    assert top(tb, "srednja skola metkovic")["projects"] == 19


def test_university_of_dubrovnik_in_either_language(tb):           # A03, I06
    for q in ("Sveučilište u Dubrovniku", "University of Dubrovnik"):
        o = top(tb, q)
        assert (o["projects"], o["coordinated"]) == (34, 6), q


def test_career_centre_and_school_that_never_took_part(tb):        # A06, A07
    assert (top(tb, "Centar za karijere mladih Dubrovnik")["projects"], top(tb, "Centar za karijere mladih Dubrovnik")["coordinated"]) == (12, 2)
    g = top(tb, "Gimnazija Dubrovnik")
    assert g["projects"] == 0 and g["org_id"] is None and g["county"] == "Dubrovačko-neretvanska"


def test_unknown_and_ambiguous_names(tb):
    assert tb.find_organisation("Zzyzx Qwerty").notes == ["no organisation or registry school with that name"]
    assert any("ambiguous" in n for n in tb.find_organisation("Osnovna škola").notes)


def test_national_numbers(tb):                                     # B01-B04, B10
    a = tb.national_stats().rows[0]
    assert (a["projects"], a["coordinated"]) == (3830, 606)
    assert (tb.national_stats("2014-2020").rows[0]["projects"], tb.national_stats("2021-2027").rows[0]["projects"]) == (2040, 1790)
    assert round(a["share_of_eu_ka2_projects"] * 100) == 8
    assert tb.national_stats("2021-2027").rows[0]["coordinating_organisation_classes"][0]["org_class"] == "ngo"


def test_country_ranking(tb):                                      # B08, B09
    rows = tb.country_stats("2021-2027").rows
    assert (rows[0]["country"], rows[0]["coordinated_projects"]) == ("DE", 2024)
    hr = next(r for r in rows if r["country"] == "HR")
    assert (hr["rank"], hr["coordinated_projects"]) == (21, 354)


def test_dubrovnik_neretva_county(tb):                             # B12, B13, A10, I03; the spec says 150 projects, we find 151 (check 4)
    for name in ("Dubrovačko-neretvanska", "Dubrovačko-neretvanskoj županiji", "Dubrovacko-neretvanska zupanija"):
        r = tb.county_stats(name).rows[0]
        assert (r["organisations"], r["projects_involved"], r["projects_coordinated"]) == (33, 151, 17), name
        assert round(r["grants_coordinated_eur"] / 1e6, 2) == 3.72
    assert tb.county_stats("Dubrovnik županija").rows[0]["county"] == "Dubrovačko-neretvanska"
    assert tb.top_organisations("Dubrovačko-neretvanska").rows[0]["org_name"] == "Sveučilište u Dubrovniku"


def test_zagreb_is_not_zagrebacka(tb):
    assert tb.resolve_county("Zagreb") == "Grad Zagreb" and tb.resolve_county("Zagrebačkoj županiji") == "Zagrebačka"


def test_school_coverage(tb):                                      # C01-C06 (450 of 1,356 after the manual review of the 51 loose matches)
    r = tb.coverage().rows
    assert (r[0]["national"]["participating"], r[0]["national"]["schools"]) == (450, 1356)
    assert r[1]["county"] == "Varaždinska" and (r[1]["participating"], r[1]["schools"]) == (33, 58)
    assert {x["county"] for x in r[1:] if x["vs_national"] == "above"} == {"Varaždinska", "Međimurska"}
    assert {x["county"] for x in r[1:] if x["vs_national"] == "below"} == {"Zagrebačka"}
    z = tb.coverage("Zagrebačka").rows[1]
    assert (z["participating"], z["schools"], round(z["expected"])) == (10, 69, 22)
    d = tb.coverage("Dubrovačko-neretvanska").rows[1]
    assert (d["participating"], d["schools"], round(d["expected"])) == (14, 48, 16)
    assert tb.coverage("Ličko-senjska").rows[1]["not_yet"] == 16
    assert tb.coverage(school_type="kindergarten").rows[0]["national"]["schools"] == 885


def test_coverage_filters_change_the_answer(tb):
    base = tb.coverage().rows[0]["national"]["participating"]
    assert tb.coverage(role="coordinator").rows[0]["national"]["participating"] < base
    assert tb.coverage(period="2014-2020").rows[0]["national"]["participating"] < base


def test_similar_organisations_same_county_same_kind(tb):          # A08
    names = [x["name"] for x in tb.similar_organisations("MZO-19-049-502").rows]
    assert names[0] == "Srednja škola Metković" and len(names) == 4


def test_bad_arguments_are_reported_not_raised(tb):
    assert tb.county_stats("Atlantida").notes == ["unknown county"]
    assert tb.coverage(school_type="x").notes == ["bad argument"]
    assert tb.national_stats("1999").notes == ["unknown period"]


def test_citations_exist_and_every_money_figure_is_named(tb):
    r = tb.organisation_profile("MZO-19-049-502")
    ids = {x for x in r.citations if x.startswith("project:")}
    assert len(ids) == 22
    assert any("grants_coordinated_eur" in n and "value_involved_eur" in n for n in r.notes)
    for pid in list(ids)[:5]:
        assert tb.con.execute("select count(*) from project where project_id = ?", [pid.split(":", 1)[1]]).fetchone()[0] == 1


def test_project_search_is_accent_insensitive(tb):
    assert tb.search_projects("Biljna pozornica").rows[0]["title"] == "Biljna pozornica"
    assert tb.search_projects("biljna  POZORNICA").rows[0]["title"] == "Biljna pozornica"
    assert tb.search_projects("").notes == ["empty query"]


def test_success_rate_matches_the_published_tables(tb):             # B05, B06, B07
    r = tb.success_rate("2021-2027", 2023).rows[0]
    assert (r["applications"], r["contracted"], round(r["rate"] * 100, 1)) == (405, 49, 12.1)
    rates = {x["call_year"]: round(x["rate"] * 100, 1) for x in tb.success_rate("2021-2027").rows if x["call_year"] != "total"}
    assert rates[2021] == 33.2 and rates[2024] == 10.2
    total = tb.success_rate("2021-2027").rows[-1]
    assert (total["call_year"], total["applications"], total["contracted"]) == ("total", 2106, 322)
    old = tb.success_rate("2014-2020").rows[-1]                      # one figure for all actions: no KA split exists before 2021
    assert (old["applications"], old["contracted"]) == (5277, 2111)
    assert "all actions together" in " ".join(tb.success_rate("2014-2020").notes)
    assert tb.success_rate("1999").notes == ["period must be 2014-2020 or 2021-2027"]
    assert tb.success_rate("2021-2027", sector="Mladi").rows[0]["applications"] == 68      # one sector only


def test_many_threads_can_use_one_toolbox_at_once(tb):                  # found by the load test: a shared DuckDB connection refused overlapping calls
    from concurrent.futures import ThreadPoolExecutor
    names = ["Gimnazija Metković", "Sveučilište u Dubrovniku", "Srednja skola Metkovic", "Centar za karijere mladih Dubrovnik"] * 8
    with ThreadPoolExecutor(16) as ex:
        out = list(ex.map(lambda n: (tb.find_organisation(n).rows[0]["projects"], tb.national_stats().rows[0]["projects"],
                                     tb.coverage("Zagrebačka").rows[1]["schools"]), names))
    assert {o[1] for o in out} == {3830} and {o[2] for o in out} == {69}
    assert sorted({o[0] for o in out}) == [12, 19, 22, 34]


# ---------------------------------------------------------------- concepts (steps 51, 52, 60)
def test_search_concepts_finds_croatian_and_english_names(tb):
    en = tb.search_concepts("early school leaving")
    hr = tb.search_concepts("rano napuštanje školovanja")
    assert en.rows and hr.rows
    assert "early school leaving" in en.rows[0]["label_en"].lower()
    assert any("school leaving" in x["label_en"].lower() for x in hr.rows)
    assert tb.search_concepts("kakvo je vrijeme").rows == []


def test_concept_profile_numbers_are_consistent(tb):
    node = tb.search_concepts("peer learning", "approach").rows[0]["node_id"]
    p = tb.concept_profile(node)
    r = p.rows[0]
    assert r["n_projects"] == r["n_2014_2020"] + r["n_2021_2027"]
    assert 0 <= r["good_practice_low"] <= r["good_practice_rate"] <= r["good_practice_high"] <= 1
    assert 1 <= len(r["examples"]) <= 3 and all(c in p.citations for c in [f"project:{x['project_id']}" for x in r["examples"]])
    assert tb.concept_profile("nope").notes == ["unknown concept"]


def test_common_concepts_are_sorted_and_bad_arguments_reported(tb):
    rows = tb.common_concepts("approach", "all", 5).rows
    assert len(rows) == 5 and [x["projects"] for x in rows] == sorted((x["projects"] for x in rows), reverse=True)
    assert all(0 < x["share"] <= 1 for x in rows)
    assert tb.common_concepts("nonsense").notes == ["bad argument"]
    assert tb.common_concepts("approach", "1999").notes == ["unknown period"]


def test_community_overview_lists_reportable_communities_only(tb):
    rows = tb.community_overview().rows
    assert rows and all(r["n_projects"] >= 20 for r in rows)
    assert tb.community_overview("C99").notes[0] == "no such community"


def test_concept_trends_split_growing_and_fading(tb):
    r = tb.concept_trends("approach", 4)
    assert {x["trend"] for x in r.rows} == {"growing", "fading"}
    for x in r.rows:
        hi, lo = ("share_2021_2027", "share_2014_2020") if x["trend"] == "growing" else ("share_2014_2020", "share_2021_2027")
        assert x[hi] >= 1.5 * x[lo]
    assert tb.concept_trends("nonsense").notes == ["bad argument"]


def test_connected_concepts_report_neighbours_and_bridging_groups(tb):
    r = tb.connected_concepts(5)
    assert {x["measure"] for x in r.rows} == {"neighbours", "groups"}
    assert all(x["neighbours"] >= 1 for x in r.rows)

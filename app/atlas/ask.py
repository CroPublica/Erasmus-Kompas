"""Ask: question -> route -> deterministic tools -> answer -> verification (plan section 5), as a LangGraph flow.

The model does three things only: pick a route and arguments (structured output), phrase the answer from the tool results,
and nothing else. Numbers come from the tools. A verifier checks that every number in the phrased answer occurs in the tool
output and that every cited id was returned by a tool; if the check fails twice, a deterministic template answer is used.
Citations shown to the reader are appended by the program, not written by the model.

Routes that need the concept layer (problem/solution questions, graph paths, themes) are not built yet and are answered
with a clear "not available yet" message, not with a guess.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any, Literal, Optional, TypedDict

from langgraph.graph import END, StateGraph
from pydantic import BaseModel, Field

import os

from atlas.config import make_chat_model
from atlas.countries import country_name
from atlas.tools import Toolbox, ToolResult

Route = Literal["limits", "organisation", "county", "national", "coverage", "country_ranking", "top_organisations",
                "project_search", "concepts", "out_of_scope"]


class Plan(BaseModel):
    """What the router returns. Keep it small: a 3B model fills a few fields reliably."""
    route: Route
    organisation: Optional[str] = Field(None, description="organisation or school name exactly as written in the question")
    county: Optional[str] = Field(None, description="county name as written in the question")
    period: Literal["all", "2014-2020", "2021-2027"] = "all"
    school_type: Literal["both", "primary", "secondary", "kindergarten"] = "both"
    role: Literal["any", "coordinator"] = "any"
    topic: Optional[str] = Field(None, description="topic words for project_search")
    follow_up: bool = Field(False, description="true if the question refers to an organisation mentioned earlier (it, they, its, ih, ona)")


ROUTER_PROMPT = """You route questions about Croatian participation in Erasmus+ KA2 partnerships (2014-2026). Questions are in Croatian or English.
Choose exactly one route:
- organisation: facts about one named organisation or school (projects, coordinator role, grants, partner countries, similar schools)
- county: facts about one county (organisations, projects, grants coordinated)
- national: Croatia as a whole (number of projects, coordinated, share of EU projects, types of organisations)
- coverage: share of schools (or kindergartens) that took part, by county, against the national rate or expectation
- country_ranking: which country coordinates most / where Croatia ranks among countries
- top_organisations: the most active organisations (nationally or in a county)
- project_search: find projects about a topic given in plain words (give the topic words in 'topic')
- concepts: problems, solutions, approaches, themes, connections between concepts
- out_of_scope: anything else (other programmes, weather, opinions, personal data about people, forecasts)
period: "2014-2020" or "2021-2027" only if the question names that period (2021-2026 means 2021-2027), otherwise "all".
role: "coordinator" only if the question is about coordinating.
school_type: primary / secondary / kindergarten only if named, otherwise "both".
Copy names exactly as written. Set follow_up true only if the question points back to something said earlier.

Examples (the answer is always one JSON object):
"Koliko je KA2 projekata imala Gimnazija Metković?" -> {"route": "organisation", "organisation": "Gimnazija Metković"}
"A koliko ih je koordinirala?" -> {"route": "organisation", "follow_up": true}
"How many KA2 projects does the University of Dubrovnik have?" -> {"route": "organisation", "organisation": "University of Dubrovnik"}
"Koliko organizacija iz Dubrovačko-neretvanske županije sudjeluje u KA2?" -> {"route": "county", "county": "Dubrovačko-neretvanska"}
"Koliko je KA2 projekata s hrvatskim sudionicima bilo 2014.–2020.?" -> {"route": "national", "period": "2014-2020"}
"Koliki postotak osnovnih i srednjih škola sudjeluje u KA2?" -> {"route": "coverage"}
"Koliko škola u Ličko-senjskoj županiji još nije sudjelovalo?" -> {"route": "coverage", "county": "Ličko-senjska"}
"Koja zemlja najčešće koordinira KA2 projekte u EU?" -> {"route": "country_ranking"}
"Koja hrvatska organizacija ima najviše projekata?" -> {"route": "top_organisations"}
"Koji projekti rješavaju nedostatak digitalnih vještina u Slavoniji?" -> {"route": "concepts"}
"Pokaži projekte o robotici" -> {"route": "project_search", "topic": "robotika"}
"Kakvo će biti vrijeme sutra?" -> {"route": "out_of_scope"}"""

ANSWER_PROMPT = """{lang_rule}
Answer the question using ONLY the tool results below. Rules:
- Use only numbers that appear in the tool results. Do not calculate new numbers, do not round differently.
- When you give a grant amount, say which measure it is (grants coordinated = full grants of projects it coordinates; value of projects involved in = full grants of all projects it takes part in).
- If the notes say the question is ambiguous, ask which organisation is meant and list the candidates.
- If there is no result, say clearly that no evidence was found; never guess.
- Maximum 120 words. No lists longer than 6 items. Do not write identifiers or links; sources are added automatically.
{lang_rule}

Question: {question}

Tool results (JSON):
{results}"""

POLISH_PROMPT = """{lang_rule}
Below is a DRAFT answer built directly from the data. Rewrite it as a short, natural answer to the question.
Rules:
- Keep EVERY number, name and unit of the draft exactly as written. Do not add numbers, do not round, do not convert (no fractions, no new percentages).
- Do not add facts that are not in the draft. If the draft says there is no evidence, say that.
- Standard Croatian (or English if the question is English): ijekavian forms, correct diacritics, no Serbian forms (tačno, hiljada, opština).
- Answer the question first; at most 90 words; plain text, no lists unless the draft has one.
{lang_rule}

Question: {question}

DRAFT:
{draft}"""

LANG_RULE = {"hr": "Odgovori isključivo na hrvatskom jeziku. Koristi samo podatke iz alata. Ako nema dokaza, reci to.",
             "en": "Answer in English only. Use only data from the tools. If there is no evidence, say so."}

REFUSAL = {"hr": "Na to pitanje ne mogu odgovoriti: bavim se samo podacima o hrvatskom sudjelovanju u Erasmus+ KA2 partnerstvima 2014.–2026.",
           "en": "I can't answer that: I only cover Croatian participation in Erasmus+ KA2 partnerships, 2014–2026."}
LIMITS = {"hr": "Taj dio nije u podacima: ovdje su samo KA2 partnerstva (bez KA1 mobilnosti i drugih akcija).",
          "en": "That is not in the data: only KA2 partnerships are covered (no KA1 mobility or other actions)."}
NOT_BUILT = {"hr": "Pitanja o problemima, rješenjima i vezama među temama još nisu dostupna: za njih treba sloj pojmova koji se tek gradi.",
             "en": "Questions about problems, solutions and links between themes are not available yet: they need the concept layer, which is still being built."}

_HR_WORDS = {"je", "li", "koliko", "koji", "koja", "koje", "što", "sto", "se", "na", "za", "ima", "od", "kako", "kolika", "sudjeluje",
             "projekata", "projekta", "škola", "skola", "županija", "zupanija", "ih", "iz", "su", "bilo", "najviše", "najvise", "koju",
             "postavi", "pitanje", "hrvatskom", "sudjelovanju", "partnerstvima", "nema", "dokaza", "podacima", "ne", "mogu", "nije", "nisu", "ili", "jasno", "iznad", "ispod"}
_EN_WORDS = {"the", "how", "which", "what", "many", "is", "of", "in", "did", "has", "have", "does", "do", "are", "was", "were", "projects",
             "schools", "county", "more", "most", "than", "to", "and"}


def detect_language(text: str) -> str:
    t = re.sub(r"\b[A-ZČĆŽŠĐ]\w*", " ", text.lstrip()[:1] + text[1:] if False else text)   # capitalised words are names (Varaždinska, Zagreb)
    t = (text.split(None, 1)[0].lower() + " " if text.split(None, 1) and text.split(None, 1)[0][:1].isupper() else "") + t.lower()
    words = set(re.findall(r"[a-zčćžšđ]+", t))
    hr = len(words & _HR_WORDS) + 2 * len(re.findall(r"[čćžšđ]", t))
    en = len(words & _EN_WORDS)
    return "hr" if hr >= en and hr > 0 else ("hr" if not text.strip() else "en")


def enrich_plan(plan: dict, question: str, tb) -> dict:
    """Fill arguments the small router often drops, from the question text itself (never overrides a value it gave)."""
    q = question.lower()
    plan = dict(plan)
    if plan["route"] in ("county", "coverage", "top_organisations"):
        # the text decides; a county the model invented ("Zagrebsko") is dropped
        plan["county"] = tb.resolve_county(question)
    # period comes from the question's years only (a 3B model invents periods)
    years = sorted(int(y) for y in re.findall(r"20[12]\d", q))
    plan["period"] = "all"
    if len(years) >= 2 and years[0] >= 2014 and years[-1] <= 2020:
        plan["period"] = "2014-2020"
    elif len(years) >= 2 and years[0] >= 2021:
        plan["period"] = "2021-2027"
    # keyword rules that the small router misses (they only ever move a question to a safer or more specific route)
    school_words = re.search(r"škol|skol|school|vrti[ćc]|kindergarten|postot|udio|share|pokrivenost|očekiv|ocekiv|participation rate|iznad|ispod|above|below", q)
    if re.search(r"ravnatelj|director|principal|e-?mail|telefon|phone|zbroji|sum up|add up|total across", q):
        plan["route"] = "out_of_scope"
    elif re.search(r"\bka\s?1\b|\bka\s?3\b|mobilnost", q):
        plan["route"] = "limits"
    elif re.search(r"koja zemlja|koje zemlje|na kojem je mjestu|which country|which countries|\brank", q):
        plan["route"] = "country_ranking"
    elif re.search(r"vrste organizacija|types? of organi[sz]ations|koje organizacije najčešće koordin", q):
        plan["route"] = "national"
    elif plan["route"] == "coverage" and plan.get("county") and not school_words:
        plan["route"] = "county"
    elif plan["route"] == "county" and school_words:
        plan["route"] = "coverage"
    elif plan["route"] == "concepts" and not re.search(r"projekt|škol|skol|erasmus|ka2|organiz|tem[aeu]\b|problem|vještin|vjestin|digital|project|school|theme|skill|educat|obrazov|učenik|nastavn|sustav|partner", q):
        plan["route"] = "out_of_scope"
    if plan.get("school_type", "both") == "both":
        if re.search(r"vrti[ćc]|kindergarten|preschool", q):
            plan["school_type"] = "kindergarten"
    if plan.get("role", "any") == "any" and re.search(r"koordinator|koordinira|coordinat", q) and plan["route"] == "coverage":
        plan["role"] = "coordinator"
    return plan


def looks_like_follow_up(question: str, plan: dict) -> bool:
    """A short question that names nothing, asked after an organisation answer ("A koliko ih je koordinirala?", "and its grants?")."""
    words = re.findall(r"\w+", question)
    named = bool(plan.get("organisation") or plan.get("county")) or any(w[:1].isupper() for w in words[1:])
    return len(words) <= 8 and not named and plan["route"] in ("national", "organisation", "county", "coverage", "top_organisations", "project_search")


# ---------------------------------------------------------------------------------------------------- number checking
# a number: digits with thousands groups (3.830, 3,830, 120 000) or a decimal part; a comma or full stop after a number is punctuation
_NUM = re.compile(r"\d{1,3}(?:[.,\u00a0 ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?")


def _parse_numbers(text: str) -> set[float]:
    """Every number in a text, read in both Croatian (3.830 / 29,4) and English (3,830 / 29.4) conventions."""
    out: set[float] = set()
    for m in _NUM.finditer(text):
        raw = m.group(0).replace(" ", "").replace(" ", "")
        cands = {raw.replace(".", "").replace(",", ""),                       # grouping only
                 raw.replace(".", "").replace(",", "."),                     # hr: 3.830,5
                 raw.replace(",", "")}                                       # en: 3,830.5
        for c in cands:
            try:
                out.add(float(c))
            except ValueError:
                pass
    return out


def _numbers_in(obj: Any) -> set[float]:
    """Numbers an answer may legitimately use: leaves of the tool output, their percentages, millions and roundings."""
    out: set[float] = set()

    def add(x: float):
        out.add(x)
        for d in (0, 1, 2):
            out.add(round(x, d))
        if abs(x) <= 1:
            for d in (0, 1, 2):
                out.add(round(x * 100, d))
        if abs(x) >= 1e5:
            for d in (1, 2):
                out.add(round(x / 1e6, d))
            out.add(round(x / 1e3))

    def walk(o):
        if isinstance(o, bool) or o is None:
            return
        if isinstance(o, (int, float)):
            add(float(o))
        elif isinstance(o, str):
            out.update(_parse_numbers(o))
        elif isinstance(o, dict):
            for k, v in o.items():
                if k not in ("citations", "args", "score"):          # identifiers, arguments and match scores are not facts
                    walk(v)
        elif isinstance(o, (list, tuple)):
            out.add(float(len(o)))
            for v in o:
                walk(v)
    walk(obj)
    return out


# Serbian and ekavian forms that small models let slip into Croatian text (the Croatian forms are in brackets); a short, conservative list
SERBIAN_FORMS = re.compile(r"\b(tačn\w*|hiljad\w*|opštin\w*|gde|ovde|vreme|mleko|dete|deca|lepo|uvek|reč|reči|razumeti|videti|sedmic\w*|univerzitet\w*|ukupno broj)\b", re.I)
SERBIAN_HINT = {"tačn": "točn", "hiljad": "tisuć", "opštin": "općin", "gde": "gdje", "ovde": "ovdje", "vreme": "vrijeme", "mleko": "mlijeko",
                "dete": "dijete", "deca": "djeca", "lepo": "lijepo", "uvek": "uvijek", "reč": "riječ", "univerzitet": "sveučilište"}


def verify_answer(answer: str, results: list[dict], lang: Optional[str] = None) -> list[str]:
    """Problems found in an answer: numbers that no tool returned, or ids that no tool returned. Empty list = ok."""
    allowed = _numbers_in(results) | {float(y) for y in range(2014, 2028)} | {1.0, 2.0, 3.0, 4.0, 5.0, 6.0}
    problems = []
    body = re.sub(r"\[(?:project|org|county):[^\]]*\]", " ", answer)
    for m in _NUM.finditer(body):
        vals = _parse_numbers(m.group(0))
        if vals and not (vals & allowed):
            problems.append(f"number not in tool output: {m.group(0).strip()}")
    rows = any(r.get("rows") for r in results)
    if rows and re.search(r"nema dokaza|no evidence|nisu dostupni|not available|nije pronađen|no data", answer.lower()):
        problems.append("says there is no evidence although the tools returned data")
    cited = set(re.findall(r"\[((?:project|org|county):[^\]]*)\]", answer))
    known = {c for r in results for c in r.get("citations", [])}
    problems += [f"unknown citation: {c}" for c in cited - known]
    if lang == "hr":
        for m in SERBIAN_FORMS.finditer(answer):
            problems.append(f"Serbian/ekavian form in Croatian text: {m.group(0)}")
    if lang and len(answer) > 40 and detect_language(answer) != lang:
        problems.append(f"answer is not in {lang}")
    return problems


def check_polish(draft: str, answer: str) -> list[str]:
    """A polished answer may answer only part of the draft, but every number in it must come from the draft (same value),
    and it must keep at least two of the draft's figures (one when the draft has only one)."""
    def figures(text):
        return [vals for m in _NUM.finditer(text) if (vals := _parse_numbers(m.group(0)))]
    d, a = figures(draft), figures(answer)
    d_all = set().union(*d) if d else set()
    out = [f"number not in the draft: {sorted(v)[0]:g}" for v in a if not (v & d_all) and max(v) > 6]
    big = [v for v in d if max(v) > 6]
    kept = sum(1 for v in big if any(v & w for w in a))
    if big and kept < min(2, len(big)):
        out.append("keeps too few figures of the draft")
    return out


# ---------------------------------------------------------------------------------------------------- deterministic fallbacks
def _fmt(lang: str, x: float, d: int = 0) -> str:
    s = f"{x:,.{d}f}"
    return s.replace(",", " ").replace(".", ",").replace(" ", ".") if lang == "hr" else s


def hr_plural(n, one: str, few: str, many: str) -> str:
    """Croatian noun form after a number: 1 projekt, 2-4 projekta, 5+ projekata (11-14 take the many form; 21 is like 1)."""
    n = int(round(n))
    if n % 10 == 1 and n % 100 != 11:
        return one
    if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14):
        return few
    return many


def _label(lang: str, label: str) -> str:
    return label.replace(" županija", " County") if lang == "en" else label


CLASS_NAMES = {"ngo": ("nevladine organizacije", "non-governmental organisations"), "higher_education": ("visoka učilišta", "higher education institutions"),
               "school_vocational": ("strukovne škole", "vocational schools"), "school_primary": ("osnovne škole", "primary schools"),
               "adult_education": ("obrazovanje odraslih", "adult education"), "school_secondary_general": ("gimnazije i opće srednje škole", "general secondary schools"),
               "public_body": ("javna tijela", "public bodies"), "sme_business": ("poduzeća", "businesses"), "school_preprimary": ("predškolske ustanove", "pre-primary"),
               "other": ("ostalo", "other"), "research": ("istraživački centri", "research bodies")}


def template_answer(lang: str, route: str, results: list[dict]) -> str:
    """Plain answer assembled by code from the first tool results; used when the model's answer cannot be verified."""
    hr = lang == "hr"
    if not results or not any(r["rows"] for r in results):
        return "Nema dokaza u podacima za ovo pitanje." if hr else "No evidence found in the data for this question."
    last = next(x for x in reversed(results) if x["rows"])
    results = results[:results.index(last) + 1]
    r = last["rows"][0]
    t = last["tool"]
    f = lambda x, d=0: _fmt(lang, x, d)
    if t == "similar_organisations":
        names = "; ".join(f"{x['name']} ({x['town']}" + (f", {x['projects']} KA2" if x["projects"] else "") + ")" for x in last["rows"])
        return (f"Slične ustanove u istoj županiji (prvo isto mjesto): {names}." if hr else f"Similar institutions in the same county (same town first): {names}.")
    if t == "organisation_profile":
        cp = [f"{x['title']} ({x['call_year']})" for x in r["coordinated_projects"][:3]]
        cc = [f"{country_name(c, lang)} ({n})" for c, n in r["partner_countries"][:3]]
        if hr:
            s = (f"{r['name']} ({r['town']}): {f(r['projects'])} KA2 {hr_plural(r['projects'], 'projekt', 'projekta', 'projekata')} ({f(r['projects_2014_2020'])} u 2014.–2020., {f(r['projects_2021_2027'])} u 2021.–2026.), "
                 f"od toga {f(r['coordinated'])} kao koordinator" + (f" ({'; '.join(cp)})" if cp else "") + ". "
                 f"Potpore projekata koje koordinira: {f(r['grants_coordinated_eur'] or 0)} €; vrijednost svih projekata u kojima sudjeluje: {f(r['value_involved_eur'] or 0)} €."
                 + (f" Najčešće surađuje s: {', '.join(cc)}." if cc else ""))
        else:
            s = (f"{r['name']} ({r['town']}): {f(r['projects'])} KA2 projects ({f(r['projects_2014_2020'])} in 2014–2020, {f(r['projects_2021_2027'])} in 2021–2026), "
                 f"{f(r['coordinated'])} as coordinator" + (f" ({'; '.join(cp)})" if cp else "") + ". "
                 f"Grants of projects it coordinates: {f(r['grants_coordinated_eur'] or 0)} €; value of all projects it takes part in: {f(r['value_involved_eur'] or 0)} €."
                 + (f" Works most with: {', '.join(cc)}." if cc else ""))
        return s
    if t == "find_organisation":
        top1 = results[-1]["rows"][0]
        if len(results[-1]["rows"]) == 1 or not any("ambiguous" in n for n in results[-1]["notes"]):
            if top1.get("projects", 0) == 0:
                return (f"{top1['name']} ({top1['town']}) nije sudjelovala ni u jednom KA2 projektu od 2014. (nema KA2 projekata)." if hr
                        else f"{top1['name']} ({top1['town']}) has not taken part in any KA2 project since 2014.")
        names = "; ".join(f"{x['name']} ({x['town']})" for x in results[-1]["rows"][:5])
        return (f"Našao sam: {names}. Koju misliš?" if hr else f"I found: {names}. Which one do you mean?")
    if t == "county_stats":
        return (f"{r['label']}: {f(r['organisations'])} {hr_plural(r['organisations'], 'organizacija', 'organizacije', 'organizacija')}, {f(r['projects_involved'])} {hr_plural(r['projects_involved'], 'projekt', 'projekta', 'projekata')}, od toga {f(r['projects_coordinated'])} koordiniranih; "
                f"potpore koordiniranih projekata {f(r['grants_coordinated_eur'])} € ({f(r['grants_coordinated_eur'] / 1e6, 2)} mil. €)." if hr else
                f"{r['label']}: {f(r['organisations'])} organisations, {f(r['projects_involved'])} projects, {f(r['projects_coordinated'])} coordinated; "
                f"grants of coordinated projects {f(r['grants_coordinated_eur'])} € ({f(r['grants_coordinated_eur'] / 1e6, 2)} million €).")
    if t == "national_stats":
        cls = r.get("coordinating_organisation_classes", [])[:4]
        ctext = ", ".join(f"{CLASS_NAMES.get(x['org_class'], (x['org_class'],) * 2)[0 if hr else 1]} {f(x['projects_coordinated'])}" for x in cls)
        return (f"{f(r['projects'])} KA2 {hr_plural(r['projects'], 'projekt', 'projekta', 'projekata')} ima hrvatskog sudionika ({f(r['projects_2014_2020'])} u 2014.–2020., {f(r['projects_2021_2027'])} u 2021.–2026.), a {f(r['coordinated'])} ih koordinira hrvatska organizacija ({f(r['share_of_eu_ka2_projects'] * 100, 1)} % svih KA2 projekata u EU). Koordiniraju najčešće: {ctext}."
                if hr else f"{f(r['projects'])} KA2 projects have a Croatian participant ({f(r['projects_2014_2020'])} in 2014–2020, {f(r['projects_2021_2027'])} in 2021–2026) and {f(r['coordinated'])} are coordinated from Croatia ({f(r['share_of_eu_ka2_projects'] * 100, 1)} % of all EU KA2 projects). Most frequent coordinators: {ctext}.")
    if t == "coverage":
        nat = last["rows"][0]["national"]
        if last["args"].get("county") and len(last["rows"]) > 1:
            c = last["rows"][1]
            verdict_hr = {"above": "jasno iznad državnog udjela", "below": "jasno ispod državnog udjela", "not clearly different": "bez jasne razlike od državnog udjela"}[c["vs_national"]]
            verdict_en = {"above": "clearly above the national share", "below": "clearly below the national share", "not clearly different": "not clearly different from the national share"}[c["vs_national"]]
            c = {**c, "label": _label(lang, c["label"])} if not hr else c
            return (f"{c['label']}: {f(c['participating'])} od {f(c['schools'])} {hr_plural(c['schools'], 'škole', 'škola', 'škola')} sudjelovalo je u KA2 ({f(c['rate'] * 100, 1)} %, raspon {f(c['rate_low'] * 100)}–{f(c['rate_high'] * 100)} %); "
                    f"još ih nije uključeno {f(c['not_yet'])}. Prema sastavu škola očekivalo bi se oko {f(c['expected'])}, državni udio je {f(nat['rate'] * 100, 1)} %: {verdict_hr}."
                    if hr else
                    f"{c['label']}: {f(c['participating'])} of {f(c['schools'])} schools took part in KA2 ({f(c['rate'] * 100, 1)} %, range {f(c['rate_low'] * 100)}–{f(c['rate_high'] * 100)} %); "
                    f"{f(c['not_yet'])} are not yet involved. About {f(c['expected'])} would be expected given the school mix; the national share is {f(nat['rate'] * 100, 1)} %: {verdict_en}.")
        above = [_label(lang, x["label"]) for x in last["rows"][1:] if x["vs_national"] == "above"]
        below = [_label(lang, x["label"]) for x in last["rows"][1:] if x["vs_national"] == "below"]
        hi = last["rows"][1]
        if hr:
            return (f"{f(nat['participating'])} od {f(nat['schools'])} škola sudjelovalo je u KA2 ({f(nat['rate'] * 100, 1)} %). "
                    f"Najveći udio ima {hi['label']} ({f(hi['participating'])} od {f(hi['schools'])}). "
                    + (f"Jasno iznad državnog udjela: {', '.join(above)}. " if above else "") + (f"Jasno ispod: {', '.join(below)}." if below else ""))
        return (f"{f(nat['participating'])} of {f(nat['schools'])} schools took part in KA2 ({f(nat['rate'] * 100, 1)} %). "
                f"The highest share is in {_label(lang, hi['label'])} ({f(hi['participating'])} of {f(hi['schools'])}). "
                + (f"Clearly above the national share: {', '.join(above)}. " if above else "") + (f"Clearly below: {', '.join(below)}." if below else ""))
    if t == "country_stats":
        top = results[-1]["rows"][0]
        hrr = next((x for x in results[-1]["rows"] if x["country"] == "HR"), None)
        tail_hr = (f" Hrvatska je na {hrr['rank']}. mjestu od {hrr['countries_total']} zemalja koordinatora u {'2014.–2020.' if hrr['period'] == '2014-2020' else '2021.–2026.'} ({f(hrr['coordinated_projects'])} projekata)." if hr else f" Croatia ranks {hrr['rank']} of {hrr['countries_total']} coordinating countries in {'2014–2020' if hrr['period'] == '2014-2020' else '2021–2026'} ({f(hrr['coordinated_projects'])} projects).") if hrr else ""
        return (f"Najviše KA2 projekata koordinira {country_name(top['country'], lang)} ({f(top['coordinated_projects'])})." if hr else
                f"Most KA2 projects are coordinated from {country_name(top['country'], lang)} ({f(top['coordinated_projects'])}).") + tail_hr
    if t == "top_organisations":
        rows = results[-1]["rows"][:5]
        return "; ".join(f"{x['org_name']}: {f(x['projects'])}" for x in rows)
    if t == "search_projects":
        return "; ".join(x["title"] for x in results[-1]["rows"][:5])
    return "Nema dokaza u podacima za ovo pitanje." if hr else "No evidence found in the data for this question."


# ---------------------------------------------------------------------------------------------------- the graph
class State(TypedDict, total=False):
    question: str
    lang: str
    last_org_id: Optional[str]
    plan: Optional[dict]
    results: list[dict]
    answer: str
    draft: str
    problems: list[str]
    attempts: int
    fallback: bool
    done: bool
    trace: list[str]
    timings: dict


class Asker:
    def __init__(self, toolbox: Optional[Toolbox] = None, profile: Optional[str] = None, router=None, writer=None, mode: Optional[str] = None):
        # mode "template": facts are phrased by code from the tool results (default until a model passes the bake-off);
        # mode "llm": the model phrases them and the verifier checks, with the template as fallback.
        self.mode = mode or os.environ.get("ATLAS_ANSWER_MODE", "template")
        self.tb = toolbox or Toolbox()
        self.profile = profile
        self._router = router
        self._writer = writer
        self.graph = self._build()

    # models are created lazily so tests that use fakes never import or contact Ollama
    @property
    def router(self):
        if self._router is None:
            self._router = make_chat_model("ask_router", self.profile).with_structured_output(Plan, method="json_schema")
        return self._router

    @property
    def writer(self):
        if self._writer is None:
            self._writer = make_chat_model("ask_answer", self.profile)
        return self._writer

    # -- nodes
    def n_language(self, s: State) -> State:
        lang = detect_language(s["question"])
        base = {"lang": lang, "attempts": 0, "trace": [], "timings": {}}
        if not s["question"].strip():
            base.update(done=True, plan={"route": "out_of_scope"}, results=[], trace=["empty question"],
                        answer="Postavi pitanje o hrvatskom sudjelovanju u KA2 partnerstvima." if lang == "hr" else "Please ask a question about Croatian participation in KA2 partnerships.")
        return base

    def _rule_plan(self, question: str) -> Plan:
        """Last resort when the router model returns nothing valid: named organisation, then county, else out of scope."""
        if self.tb.find_organisation_in_text(question).rows:
            return Plan(route="organisation")
        if self.tb.resolve_county(question):
            return Plan(route="coverage" if re.search(r"škol|skol|school", question.lower()) else "county")
        return Plan(route="out_of_scope")

    def n_route(self, s: State) -> State:
        t0 = time.time()
        plan: Plan | None = None
        for _ in range(2):                                     # one retry if the model returns invalid JSON
            try:
                out = self.router.invoke([("system", ROUTER_PROMPT), ("human", s["question"])])
                plan = out if isinstance(out, Plan) else Plan(**out)
                break
            except Exception as e:                             # noqa: BLE001
                s["trace"].append(f"router error: {type(e).__name__}")
        timings = {**s["timings"], "route_s": round(time.time() - t0, 2)}
        if plan is None:                                       # no usable router output: decide from the question text alone
            plan = self._rule_plan(s["question"])
            return {"plan": plan.model_dump(), "timings": timings, "trace": s["trace"] + ["router failed; rules used"]}
        return {"plan": plan.model_dump(), "timings": timings, "trace": s["trace"] + [f"route={plan.route}"]}

    def n_tools(self, s: State) -> State:
        plan = s.get("plan")
        results: list[ToolResult] = []
        if plan is not None:
            plan = enrich_plan(plan, s["question"], self.tb)
            if s.get("last_org_id") and not plan.get("organisation") and looks_like_follow_up(s["question"], plan):
                plan.update(route="organisation", follow_up=True)
        if plan is None or plan["route"] == "out_of_scope":
            return {"plan": plan or {"route": "out_of_scope"}, "results": [], "done": True, "answer": REFUSAL[s["lang"]], "trace": s["trace"] + ["refused"]}
        if plan["route"] == "limits":
            return {"plan": plan, "results": [], "done": True, "answer": LIMITS[s["lang"]], "trace": s["trace"] + ["limits"]}
        if plan["route"] == "concepts":
            return {"plan": plan, "results": [], "done": True, "answer": NOT_BUILT[s["lang"]], "trace": s["trace"] + ["concepts not built"]}
        r = plan["route"]
        tb = self.tb
        if r == "organisation":
            org_id = None
            if plan["follow_up"] and s.get("last_org_id") and not plan["organisation"]:
                org_id = s["last_org_id"]
            else:
                found = tb.find_organisation_in_text(s["question"])
                if not found.rows and plan["organisation"]:
                    found = tb.find_organisation(plan["organisation"])
                results.append(found)
                top = found.rows[0] if found.rows else None
                ambiguous = any("ambiguous" in n for n in found.notes)
                if top and top.get("org_id") and not ambiguous:
                    org_id = top["org_id"]
            if org_id:
                results.append(tb.organisation_profile(org_id))
                if re.search(r"slične|slicne|similar|sličn", s["question"].lower()):
                    results.append(tb.similar_organisations(org_id))
        elif r == "county" and plan["county"]:
            results.append(tb.county_stats(plan["county"], plan["period"]))
        elif r == "national":
            results.append(tb.national_stats(plan["period"]))
        elif r == "coverage":
            results.append(tb.coverage(plan["county"], plan["school_type"], plan["period"], plan["role"]))
        elif r == "country_ranking":
            results.append(tb.country_stats("2021-2027" if plan["period"] == "all" else plan["period"]))
        elif r == "top_organisations":
            results.append(tb.top_organisations(plan["county"], plan["period"]))
        elif r == "project_search" and plan["topic"]:
            results.append(tb.search_projects(plan["topic"], plan["period"]))
        used = [x.as_dict() for x in results]
        out = {"plan": plan, "results": used, "trace": s["trace"] + [f"tools={[x['tool'] for x in used]}"]}
        if self.mode == "polish":
            out["draft"] = template_answer(s["lang"], r, used)
        if self.mode == "template" or not any(x["rows"] for x in used):      # nothing found: the "no evidence" text comes from code, never from the model
            out.update(done=True, answer=template_answer(s["lang"], r, used), trace=out["trace"] + ["template answer"])
        return out

    def n_compose(self, s: State) -> State:
        t0 = time.time()
        lang = s["lang"]
        if self.mode == "polish":
            prompt = POLISH_PROMPT.format(lang_rule=LANG_RULE[lang], question=s["question"], draft=s["draft"])
        else:
            prompt = ANSWER_PROMPT.format(lang_rule=LANG_RULE[lang], question=s["question"],
                                          results=json.dumps(_trim(s["results"]), ensure_ascii=False, default=str))
        text = self.writer.invoke([("human", prompt)]).content.strip()
        timings = {**s["timings"], "compose_s": round(s["timings"].get("compose_s", 0) + time.time() - t0, 2)}
        return {"answer": text, "attempts": s["attempts"] + 1, "timings": timings}

    def n_verify(self, s: State) -> State:
        problems = verify_answer(s["answer"], s["results"], s["lang"])
        if self.mode == "polish":
            problems += check_polish(s["draft"], s["answer"])
        if not problems:
            return {"problems": [], "done": True, "trace": s["trace"] + ["verified"]}
        if s["attempts"] < 2:
            return {"problems": problems, "trace": s["trace"] + [f"retry: {problems[:2]}"]}
        return {"problems": problems, "fallback": True, "done": True,
                "answer": template_answer(s["lang"], s["plan"]["route"], s["results"]), "trace": s["trace"] + [f"fallback: {problems[:2]}"]}

    # -- wiring
    def _build(self):
        g = StateGraph(State)
        g.add_node("language", self.n_language); g.add_node("route", self.n_route); g.add_node("tools", self.n_tools)
        g.add_node("compose", self.n_compose); g.add_node("verify", self.n_verify)
        g.set_entry_point("language")
        g.add_conditional_edges("language", lambda s: "end" if s.get("done") else "route", {"end": END, "route": "route"})
        g.add_edge("route", "tools")
        g.add_conditional_edges("tools", lambda s: "end" if s.get("done") else "compose", {"end": END, "compose": "compose"})
        g.add_edge("compose", "verify")
        g.add_conditional_edges("verify", lambda s: "end" if s.get("done") else "compose", {"end": END, "compose": "compose"})
        return g.compile()

    def ask(self, question: str, last_org_id: Optional[str] = None) -> dict:
        t0 = time.time()
        s = self.graph.invoke({"question": question, "last_org_id": last_org_id})
        results = s.get("results", [])
        cites = []
        for r in results:
            for c in r["citations"]:
                if c not in cites:
                    cites.append(c)
        org = next((r["args"].get("org_id") for r in results if r["tool"] == "organisation_profile"), None)
        return {"answer": s["answer"], "lang": s["lang"], "route": (s.get("plan") or {}).get("route"), "plan": s.get("plan"),
                "tools": [{"tool": r["tool"], "args": r["args"], "notes": r["notes"]} for r in results],
                "citations": cites[:12], "verified": not s.get("problems") and not s.get("fallback"),
                "fallback": bool(s.get("fallback")), "problems": s.get("problems", []), "last_org_id": org or last_org_id,
                "trace": s["trace"], "timings": {**s["timings"], "total_s": round(time.time() - t0, 2)}}


def _trim(results: list[dict], max_rows: int = 8) -> list[dict]:
    """Keep the prompt short: at most max_rows rows per tool, long lists cut, no summaries."""
    def cut(o):
        if isinstance(o, list):
            return [cut(x) for x in o[:max_rows]]
        if isinstance(o, dict):
            return {k: cut(v) for k, v in o.items() if k not in ("recent_projects", "summary_start")}
        return o
    return [{"tool": r["tool"], "args": r["args"], "rows": cut(r["rows"]), "notes": r["notes"], "citations": r["citations"][:6]} for r in results]

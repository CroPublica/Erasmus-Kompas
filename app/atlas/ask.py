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
from atlas.countries import country_name, countries_in_text
from atlas.tools import EN_COUNTY, Toolbox, ToolResult

VALUE_DETAIL = re.compile(r"prosje[čc]n\w* (vrijednost|iznos|bespovratn|grant)|average (value|grant|funding|project value)|najskuplj|najjeftinij|most expensive|cheapest|najmanj\w* (dodijeljen|vrijednost|iznos)|smallest (grant|value|project)|"
                         r"(vrijednost|iznos|grant)\w* (ve[ćc]\w*|manj\w*|iznad|ispod) od|(more|less) than [\d.,]+ ?(million|mil|thousand)|medijan|median|vrijednost\w* (ve[ćc]u|manju)|"
                         r"koliko projekata ima vrijednost|how many projects .*(grant|value) (above|over|more|below|under|less)")
YEAR_TREND_WORDS = re.compile(r"koje je godine|koja (je )?godin|u kojoj (je )?godin|which year|what year|međugodišnj|medjugodisnj|year[- ]on[- ]year|prosječan godišnji|prosjecan godisnji|average (annual|per year)|"
                         r"po godinama|per year|by year|rast[ao]|rasl[ao]|rasla|padal|pad\b|opao|grew|grow|increas|decreas|declin|trend|mijenjao|mijenjal|changed over|najmanje projekata|najviše projekata u godini")


Route = Literal["limits", "success", "organisation", "county", "national", "coverage", "country_ranking", "county_ranking", "partner_countries", "town", "county_project", "glossary", "year_count", "value", "top_organisations",
                "project_search", "concepts", "out_of_scope"]


class Plan(BaseModel):
    """What the router returns. Keep it small: a 3B model fills a few fields reliably."""
    route: Route
    organisation: Optional[str] = Field(None, description="organisation or school name exactly as written in the question")
    county: Optional[str] = Field(None, description="county name as written in the question")
    towns: Optional[list[str]] = Field(None, description="two or more towns compared with each other")
    town: Optional[str] = Field(None, description="town or city name when the question asks about the organisations of one town")
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
- success: success rate of Croatian applications (applications received, projects contracted, pass rate) by call year
- town: organisations / schools of one town or city (not a county), e.g. "Koje organizacije iz Pule sudjeluju u KA2?"
- country_ranking: which country coordinates most / where Croatia ranks among countries
- county_ranking: which counties have the most projects (a ranking of counties, no single county named)
- partner_countries: which countries Croatian organisations partner with / cooperate with
- county_project: the first / second / n-th / last project of one named county, and its topics
- glossary: what a term means (coordinator, partner, KA2, call year, good practice, grant)
- year_count: how many projects in one call year
- value: the total value (grants) of the projects
- top_organisations: the most active organisations (nationally or in a county)
- project_search: find projects about a topic given in plain words (give the topic words in 'topic')
- concepts: the content of projects: most common methods, approaches, target groups, outputs or problems; what projects do about a problem or theme; what to expect in a typical project; groups of related concepts
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
"Koje organizacije iz Pule sudjeluju u KA2?" -> {"route": "town"}
"Koja hrvatska organizacija ima najviše projekata?" -> {"route": "top_organisations"}
"Koje županije imaju najviše projekata?" -> {"route": "county_ranking"}
"What does coordinator mean?" -> {"route": "glossary"}
"How many projects were there in 2023?" -> {"route": "year_count"}
"What is the total value of the projects?" -> {"route": "value"}
"What was the topic of the first project in Grad Zagreb?" -> {"route": "county_project", "county": "Grad Zagreb"}
"S kojim državama Hrvatska surađuje?" -> {"route": "partner_countries"}
"Koji projekti rješavaju nedostatak digitalnih vještina u Slavoniji?" -> {"route": "concepts"}
"Koje su najčešće metode u KA2 projektima?" -> {"route": "concepts"}
"What do projects do about early school leaving?" -> {"route": "concepts"}
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

HELP_WORDS = re.compile(r"^(bok|bog|pozdrav|dobar dan|dobro jutro|dobra večer|zdravo|hej|hello|hi|hey|good (morning|afternoon|evening))\b|"
                        r"što (sve )?(mogu|možeš|možete|znaš|znate) (pitati|učiniti|napraviti)|šta mogu pitati|mo[zž]e[sš]? li[a-z]* (mi )?pomo[ćc]i|can you help|what can (i ask|you do)|how (do|can) i use|kako (se )?koristi")
HELP = {"hr": "Pomažem s podacima o hrvatskom sudjelovanju u Erasmus+ KA2 partnerstvima (2014.–2026.). Na primjer: „Koliko KA2 projekata ima Sveučilište u Splitu?”, „Koje su tri najaktivnije organizacije u Primorsko-goranskoj županiji?”, "
              "„S kojim zemljama Hrvatska najčešće surađuje?”, „Koliko škola u Splitsko-dalmatinskoj županiji još nije sudjelovalo u KA2?” ili „Koji projekti govore o umjetnoj inteligenciji?”. Ne mogu odgovarati na pitanja o KA1 mobilnostima, prijavama ni o osobnim podacima.",
        "en": "I help with data on Croatian participation in Erasmus+ KA2 partnerships (2014–2026). For example: “How many KA2 projects does the University of Split have?”, “Which are the three most active organisations in Primorje-Gorski Kotar County?”, "
              "“Which countries does Croatia work with most?”, “How many schools in Split-Dalmatia County have not yet taken part in KA2?” or “Which projects are about artificial intelligence?”. I cannot answer questions about KA1 mobility, how to apply, or personal data."}
REFUSAL = {"hr": "Na to pitanje ne mogu odgovoriti: bavim se samo podacima o hrvatskom sudjelovanju u Erasmus+ KA2 partnerstvima 2014.–2026.",
           "en": "I can't answer that: I only cover Croatian participation in Erasmus+ KA2 partnerships, 2014–2026."}
LIMITS = {"hr": "Taj dio nije u podacima: ovdje su samo KA2 partnerstva (bez KA1 mobilnosti i drugih akcija).",
          "en": "That is not in the data: only KA2 partnerships are covered (no KA1 mobility or other actions)."}
NOT_BUILT = {"hr": "Pitanja o problemima, rješenjima i vezama među temama još nisu dostupna: za njih treba sloj pojmova koji se tek gradi.",
             "en": "Questions about problems, solutions and links between themes are not available yet: they need the concept layer, which is still being built."}

_HR_WORDS = {"je", "li", "koliko", "koji", "koja", "koje", "što", "sto", "se", "na", "za", "ima", "od", "kako", "kolika", "sudjeluje",
             "projekata", "projekta", "škola", "skola", "županija", "zupanija", "ih", "iz", "su", "bilo", "najviše", "najvise", "koju",
             "prijava", "prijave", "ugovoreno", "ugovoreni", "hrvatskoj", "projekti", "postavi", "pitanje", "hrvatskom", "sudjelovanju", "partnerstvima", "nema", "dokaza", "podacima", "ne", "mogu", "nije", "nisu", "ili", "jasno", "iznad", "ispod"}
_EN_WORDS = {"the", "how", "which", "what", "many", "is", "of", "in", "did", "has", "have", "does", "do", "are", "was", "were", "projects",
             "schools", "county", "more", "most", "than", "to", "and", "who", "where", "when", "why", "give", "tell", "show", "find", "about", "there",
             "ever", "any", "all", "with", "from", "by", "for", "that", "this", "work", "works", "take", "took", "part", "coordinate", "coordinated",
             "coordinates", "countries", "country", "organisations", "organisation", "total", "number", "share", "rate", "value", "similar", "approaches",
             "problems", "themes", "topics", "concepts", "project", "school", "students", "teachers", "growing", "fading", "typical", "can", "you", "me",
             "it", "if", "or", "on", "at", "an", "be", "been", "will", "would", "could", "should", "also", "other", "than", "between", "among", "over"}
_EN_WORDS -= {"on", "it", "me"}                      # also Croatian words (on = he, me, ...): they must not count for English


def detect_language(text: str, hint: Optional[str] = None) -> str:
    """Language of the question. `hint` is the language of the page the question came from: a bare name
    (Varaždinska, Sveučilište u Zagrebu) says nothing, so it keeps the page language unless the question
    is clearly a sentence in the other one (two or more function words)."""
    if hint in ("hr", "en"):
        tl = re.sub(r"\S+-\S+", " ", text.lower())
        words = set(re.findall(r"[a-zčćžšđ]+", tl))
        other = (_EN_WORDS if hint == "hr" else _HR_WORDS)
        own = (_HR_WORDS if hint == "hr" else _EN_WORDS)
        o, w = len(words & other), len(words & own)
        return ("en" if hint == "hr" else "hr") if o >= 2 and o > w else hint
    t = re.sub(r"\b[A-ZČĆŽŠĐ]\w*", " ", text.lstrip()[:1] + text[1:] if False else text)   # capitalised words are names (Varaždinska, Zagreb)
    t = (text.split(None, 1)[0].lower() + " " if text.split(None, 1) and text.split(None, 1)[0][:1].isupper() else "") + t.lower()
    t = re.sub(r"\S+-\S+", " ", t)                    # hyphenated names (Koprivničko-križevačka županija): not wording
    words = set(re.findall(r"[a-zčćžšđ]+", t))
    en_words, hr_words = len(words & _EN_WORDS), len(words & _HR_WORDS)
    if en_words >= 2 and en_words > hr_words:            # several English function words and fewer Croatian ones: English, whatever Croatian names it contains
        return "en"
    hr = hr_words + 2 * len(re.findall(r"[čćžšđ]", t))
    en = en_words
    return "hr" if hr >= en and hr > 0 else ("hr" if not text.strip() else "en")


CONCEPT_WORDS = re.compile(r"(which|what) (are the )?(most )?(common |frequent |popular )?topics|topics (are )?(the )?most|najčešće tem|koje su (najčešće )?tem|koje tem\w* (su )?najčešć|najčešć\w* (metod|pristup|aktivnost|rezultat|ishod|ciljn|problem|izazov)|najcesc\w* (metod|pristup|aktivnost|rezultat|ishod|ciljn|problem|izazov)|"
                           r"most (common|frequent)\w* (method|approach|activit|output|result|target|problem|challenge)|common (method|approach|activit|output|target|problem)|"
                           r"tipičn\w* projekt|typical project|što (se )?(može )?očekivati|what (can|to|should) (you |one |someone )?expect|od nule|from scratch|"
                           r"koje (metode|pristupe|aktivnosti|probleme|izazove)|which (methods|approaches|activities|problems|challenges|outputs)|što rade projekti|what do projects do|"
                           r"skupin\w* (pojmova|tema)|groups of (concepts|themes)|clusters?\b|"
                           r"primjer\w* dobre prakse|examples? of good practice|glavn\w+ tem|main (themes|topics)|prevladava|promijeni\w* (se )?tem|tem\w* (su se )?promijeni\w*|how (have )?(the )?(themes|topics|methods|approaches)|"
                           r"najpovezaniji|most connected|connect(s)? the most|kroz vrijeme|over time|trend")
COMMON_WORDS = re.compile(r"glavn\w+ tem|prevladava|main (themes|topics)|najčešć|najcesc|most (common|frequent|often)|common|usually|obično|tipičn|typical|uobičajen|očekivati|expect|od nule|from scratch|početnik|beginner")
EXPECT_WORDS = re.compile(r"očekivati|expect|od nule|from scratch|početnik|beginner|tipičn\w* projekt|typical project")
TREND_WORDS = re.compile(r"promijeni|changed|kroz vrijeme|over time|trend|rast\w+|growing|nestaj|fading|declin")
CONNECT_WORDS = re.compile(r"najpovezaniji|most connected|connect(s)? the most|povezuje|bridge")
COMMUNITY_WORDS = re.compile(r"skupin\w* (pojmova|tema)|groups of (concepts|themes)|clusters?\b|vrste projekata|types of projects")
KIND_WORDS = [("topic", re.compile(r"glavn\w+ tem|\btem[aeui]\b|themes?|topics?")), ("target_group", re.compile(r"ciljn\w* skupin|target group|za koga|for whom")), ("output", re.compile(r"rezultat|ishod|proizvod|output|result|deliverable")),
              ("problem", re.compile(r"problem|izazov|potreb|challenge|\bneeds?\b")), ("approach", re.compile(r"pristup|metod|aktivnost|approach|method|activit|što rade|what do projects do"))]
SUCCESS_WORDS = re.compile(r"prolaznost|stopa (uspje|odobr)|uspje\w* prijav|success rate|pass rate|prijava (je )?(odobren|podnesen)|applications? (were|was)? ?(received|submitted|approved)|broj prijava|zaprimljen|podnesen\w* prijav|prijava podneseno")


_QUAL_DROP = re.compile(r"\b(ka\s?2|erasmus\+?|projek\w*|projects?|rad|radu|programm?e?\w*|koji|koje|koja|koju|kojih|su|se|je|što|sto|what|which|are|is|do|does|the|of|in|on|at|by|with|and|to|how|work|works|best|used|use|koriste|koristi|koriste|najbolje|rješava\w*|rjesava\w*|rješavaju|solve\w*|address\w*|rade|radi|hrvatsk\w*|croatia\w*|croatian)\b|[?.,!;:\"“”„]")


def concept_qualifier(question: str) -> str:
    """What a list question is narrowed to, e.g. 'students with fewer opportunities' in 'Which approaches work for students with fewer opportunities?'.
    The generic words (the kind asked for, 'most common', 'projects', 'KA2') are removed; what remains is looked up as a concept."""
    q = question.lower()
    for rx in (CONCEPT_WORDS, COMMON_WORDS, *[r for _, r in KIND_WORDS]):
        q = rx.sub(" ", q)
    q = _QUAL_DROP.sub(" ", q)
    words = [w for w in q.split() if len(w) > 2 or w in ("za", "o")]
    words = [w for w in words if w not in ("za", "o", "pri", "kod", "oko", "for", "about", "from", "into")]
    return " ".join(words)


YES_NO_Q = re.compile(r"^\W*(je li|jesu li|da li|ima li|imaju li|has|have|did|does|do|is|are|was|were)\b", re.I)
COORD_Q = re.compile(r"koordin|coordinat", re.I)


def yes_no_lead(question: str, lang: str, results: list[dict]) -> str:
    """'Da. ' / 'Ne. ' for a yes/no question about one organisation (taking part, coordinating), read from the tool results; '' when it is not that kind of question.
    The raters of the answer sheet asked for it: a yes/no question should be answered yes or no first."""
    if not YES_NO_Q.search(question or ""):
        return ""
    yes, no = ("Da. ", "Ne. ") if lang == "hr" else ("Yes. ", "No. ")
    prof = next((x for x in results if x["tool"] == "organisation_profile" and x["rows"]), None)
    if prof:
        r = prof["rows"][0]
        return yes if (r["coordinated"] if COORD_Q.search(question) else r["projects"]) else no
    found = next((x for x in results if x["tool"] == "find_organisation" and x["rows"] and not any("ambiguous" in n for n in x["notes"])), None)
    if found and found["rows"][0].get("projects", 1) == 0:
        return no
    return ""


_ORD = {"first": 1, "1st": 1, "prvi": 1, "prvog": 1, "prva": 1, "prvu": 1, "second": 2, "2nd": 2, "drugi": 2, "drugog": 2, "third": 3, "3rd": 3, "treći": 3, "treceg": 3, "trećeg": 3, "treci": 3,
        "fourth": 4, "četvrti": 4, "cetvrti": 4, "fifth": 5, "peti": 5, "sixth": 6, "šesti": 6, "sesti": 6, "seventh": 7, "sedmi": 7, "eighth": 8, "osmi": 8, "ninth": 9, "deveti": 9, "tenth": 10, "deseti": 10}
_LAST = ("last", "latest", "newest", "most recent", "zadnji", "posljednji", "najnoviji")


def ordinal_request(q: str) -> Optional[tuple[int, str]]:
    """(n, 'first'|'last') when the question asks for the n-th / first / last project; None otherwise."""
    q = q.lower()
    if not re.search(r"projek|project", q):
        return None
    if any(re.search(rf"\b{w}\b", q) for w in _LAST):
        return 1, "last"
    if re.search(r"\b(earliest|oldest|najstariji|najraniji)\b", q):
        return 1, "first"
    m = re.search(r"\b(\d{1,3})(?:st|nd|rd|th)\b|\b(\d{1,3})\.\s*projekt", q)
    if m:
        return int(m.group(1) or m.group(2)), "first"
    for w, n in _ORD.items():
        if re.search(rf"\b{w}\b", q):
            return n, "first"
    m = re.search(r"\bproject (?:number |no\.? |#)(\d{1,3})\b|\bprojekt (?:broj |br\. )(\d{1,3})\b", q)
    return (int(m.group(1) or m.group(2)), "first") if m else None


COORD_RANK = re.compile(r"koordinira\w*|koordinator\w*|coordinat\w*", re.I)


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
    if plan["route"] == "success" and not SUCCESS_WORDS.search(q):         # the small router over-uses this route: only keywords may select it
        plan["route"] = "county" if tb.resolve_county(question) else ("national" if re.search(r"koliko|how many|number of", q) else "out_of_scope")
    school_words = re.search(r"škol|skol|school|vrti[ćc]|kindergarten|postot|udio|share|pokrivenost|očekiv|ocekiv|participation rate|iznad|ispod|above|below", q)
    no_county_word = not re.search(r"župani|zupani|county", q)
    towns = tb.resolve_towns(question) if no_county_word else []
    town = towns[0] if len(towns) == 1 else None
    if len(towns) >= 2 and re.search(r"vi[šs]e|manje|usporedi|razlik|više|more|fewer|less|compare|versus|\bvs\b|odnosu|naspram|ili|or\b|tko ima|who has", q):
        plan["towns"] = towns[:4]
    specific_org = re.search(r"\bgimnazija\b|\bsveu[čc]ili[šs]te\b|osnovna škola|srednja škola|dječji vrtić|\bfakultet\b|\bpu[čc]ko\b|\bu[čc]ili[šs]te\b|\bcentar\b|\budruga\b", q)
    if re.search(r"ravnatelj|director|principal|e-?mail|telefon|phone|zbroji|sum up|add up|total across|kako (se )?prijavi|how (do i|to|can i) (apply|submit)|natje[čc]aj\w* (za|za prijavu)", q):
        plan["route"] = "out_of_scope"
    elif plan.get("towns"):
        plan["route"] = "town"
    elif town and not specific_org and re.search(
            r"organi[sz]acij|ustanov|škol|skol|vrti[ćc]|organi[sz]ation|school|institution|kindergarten|tko |who |koje su|which|surađ|suradi|cooperat|worked with|partner", q) \
            and not CONCEPT_WORDS.search(q) and not SUCCESS_WORDS.search(q) and not re.search(r"još nije|nije sudjel|not yet|not taken|pokrivenost|udio|postotak|koliko (škola|osnovn|srednj|vrti)|how many (schools|primary|secondary|kindergarten)", q):
        plan["town"] = town
        plan["route"] = "partner_countries" if re.search(r"kojim (dr[zž]avama|zemljama)|partnersk\w* (dr[zž]av|zemlj)|partner countr|which countries|what countries|worked with|collaborat\w+ with|cooperat\w+ with|s kim (je|su) .*(surađ|suradi)", q) else "town"
    elif re.search(r"what (does|do|is|are) (an? |the )?[\w\s+-]{2,30}( mean)?\??$|što (znači|je|su)\b|\bmeaning of\b|\bdefin", q) and tb.glossary(question).rows:
        plan["route"] = "glossary"
    elif re.search(r"\b20[12]\d\s*\.?\s*[–-]\s*20[12]\d", q) and re.search(r"koliko|how many", q) and re.search(r"projek|project", q) and not YEAR_TREND_WORDS.search(q) \
            and not tb.resolve_county(question) and not tb.find_organisation_in_text(question).rows and not SUCCESS_WORDS.search(q):
        plan["route"] = "national"                  # a range of years is a programme period: the national figures give both periods
    elif re.search(r"razlik\w* .*(razdoblj|period)|difference between (the )?(two )?(programme )?periods", q) and not tb.resolve_county(question):
        plan["route"] = "national"
    elif YEAR_TREND_WORDS.search(q) and re.search(r"projek|project|sudjelovanj|participation|međugodišnj|medjugodisnj|year[- ]on[- ]year|koje je godine|koja (je )?godin|which year", q) and not SUCCESS_WORDS.search(q) and not tb.resolve_county(question) \
            and not tb.find_organisation_in_text(question).rows and not CONCEPT_WORDS.search(q):
        plan["route"] = "year_count"
    elif len(set(years)) == 1 and 2014 <= years[0] <= 2026 and re.search(r"koliko|how many|number of", q) and re.search(r"projek|project", q) and not tb.resolve_county(question) \
            and not tb.find_organisation_in_text(question).rows and not SUCCESS_WORDS.search(q):
        plan["route"] = "year_count"
    elif re.search(r"(postotak|udio|posto|percent|share|proportion)\b.*(koordin|coordinat)|(koordin|coordinat).*(postotak|udio|percent|share)", q) and not tb.resolve_county(question) \
            and not tb.find_organisation_in_text(question).rows and not SUCCESS_WORDS.search(q) and not re.search(r"eu\b|europsk|all eu|u eu", q):
        plan["route"] = "national"
    elif re.search(r"u koliko .*koordinator|koliko .*koordinira hrvatska|how many .*coordinated by (a )?croatian", q) and not tb.resolve_county(question) and not town \
            and not tb.find_organisation_in_text(question).rows and len(countries_in_text(question)) < 2:
        plan["route"] = "national"
    elif re.search(r"^koliko (ukupno |je )?(različitih |razlicitih )?(hrvatskih )?(organizacija|ustanova)|^how many (different |croatian )*organi[sz]ations", q.strip()) \
            and re.search(r"ukupno|razli[čc]it|hrvatskih|iz hrvatske|u hrvatskoj|croatian|different|in croatia|from croatia", q) \
            and not re.search(r"najaktivnij|najvi[šs]e|most|top|\bu\b [a-zčćšžđ]+ž?upanij|county|škol|school|vrti", q) and not tb.resolve_county(question) and not tb.find_organisation_in_text(question).rows:
        plan["route"] = "national"
    elif VALUE_DETAIL.search(q) and not tb.resolve_county(question) and not tb.find_organisation_in_text(question).rows:
        plan["route"] = "value"
    elif re.search(r"(total|ukupn\w*) (value|vrijednost|worth|grants?)|vrijednost (svih )?projekata|value of (all )?(the )?projects|how much (money|funding)|koliko (novca|sredstava)", q) and not tb.resolve_county(question) \
            and not tb.find_organisation_in_text(question).rows:
        plan["route"] = "value"
    elif ordinal_request(q) and tb.resolve_county(question):
        plan["route"] = "county_project"
        plan["county"] = tb.resolve_county(question)
    elif SUCCESS_WORDS.search(q):
        plan["route"] = "success"
    elif CONCEPT_WORDS.search(q):
        plan["route"] = "concepts"
    elif re.search(r"\bka\s?1\b|\bka\s?3\b|mobilnost", q):
        plan["route"] = "limits"
    elif re.search(r"kojim (dr[zž]avama|zemljama)|partnersk\w* (dr[zž]av|zemlj)|partner countr|(which|what) countries .*(partner|work|cooperat|collaborat)|(surađ|suradj|partner)\w* (s|sa) (kojim|kojima)", q) and not tb.find_organisation_in_text(question).rows:
        plan["route"] = "partner_countries"
    elif re.search(r"(koje|koja|which)\s+([\wčćšžđ]+\s+)?(županij|zupanij|countie)", q) and not tb.resolve_county(question):
        plan["route"] = "county_ranking"
    elif plan["route"] == "county_ranking" and tb.resolve_county(question):      # a county is named: it is not a ranking of counties
        plan["county"] = tb.resolve_county(question)
        plan["route"] = "top_organisations" if re.search(r"\bwho\b|organi[sz]ation|school|tko|organizacij|škol|ustanov", q) else "county"
    elif len(countries_in_text(question)) >= 2 and re.search(r"koordin|coordinat|projek|project", q) and not tb.find_organisation_in_text(question).rows:
        plan["route"] = "country_ranking"
    elif re.search(r"koja zemlja|koje zemlje|na kojem je mjestu|which country|which countries|\brank", q) and not tb.find_organisation_in_text(question).rows:
        plan["route"] = "country_ranking"
    elif re.search(r"vrste organizacija|types? of organi[sz]ations|koje organizacije najčešće koordin", q):
        plan["route"] = "national"
    elif plan["route"] == "coverage" and plan.get("county") and not school_words:
        plan["route"] = "county"
    elif plan["route"] == "national" and tb.resolve_county(question) and not school_words:
        plan["route"] = "county"
        plan["county"] = tb.resolve_county(question)
    elif plan["route"] == "county" and school_words:
        plan["route"] = "coverage"
    elif plan["route"] == "concepts" and not re.search(r"projekt|škol|skol|erasmus|ka2|organiz|tem[aeu]\b|problem|vještin|vjestin|digital|project|school|theme|skill|educat|obrazov|učenik|nastavn|sustav|partner|teacher|student|pupil|youth|learner|učitelj|mladi|učenic|roditelj|parent|inclusion|uključi|bullying|nasilj|methods?\b|metod|approach|pristup", q):
        plan["route"] = "out_of_scope"
    if plan.get("school_type", "both") == "both" and plan["route"] in ("coverage", "county"):
        if re.search(r"osnovn\w* škol|osnovn\w* skol|primary school", q):
            plan["school_type"] = "primary"
        elif re.search(r"srednj\w* škol|srednj\w* skol|secondary school|gimnazij\w* i strukovn", q):
            plan["school_type"] = "secondary"
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
    return len(words) <= 8 and not named and plan["route"] in ("national", "organisation", "county", "coverage", "top_organisations", "project_search", "partner_countries")


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
    if rows and re.search(r"nema dokaza|no evidence|nisu dostupni|not available|nije pronađen|no data|nije moguće|ne može se|ne mogu (se )?(izdvojiti|odrediti|utvrditi)|not possible to|cannot be determined|unable to", answer.lower()):
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
    if x is None:                                  # a missing figure must never crash an answer
        return "–"
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
    """County name in the answer's language: the English names of the counties are Varaždin County, Istria County, City of Zagreb (never 'Varaždinska County')."""
    if lang != "en":
        return label
    stem = label.replace(" županija", "").replace(" County", "").strip()
    return EN_COUNTY.get(stem, label.replace(" županija", " County"))


def _town(t) -> str:
    """'RIJEKA' -> 'Rijeka': the EU export writes some towns in capitals."""
    t = str(t or "")
    return t.title() if t.isupper() and len(t) > 3 else t


def quote_title(title: str, year=None, limit: int = 90, lang: str = "hr") -> str:
    """A project title as the name it is: quoted, cut at a word, never as part of the sentence. Titles are in the language the applicants wrote them in."""
    t = " ".join(str(title).split())
    if len(t) > limit:
        t = t[:limit].rsplit(" ", 1)[0].rstrip(",;:-– ") + "…"
    q = ("„", "”") if lang == "hr" else ("“", "”")
    return f"{q[0]}{t}{q[1]}" + (f" ({year})" if year else "")


CLASS_NAMES = {"ngo": ("nevladine organizacije", "non-governmental organisations"), "higher_education": ("visoka učilišta", "higher education institutions"),
               "school_vocational": ("strukovne škole", "vocational schools"), "school_primary": ("osnovne škole", "primary schools"),
               "adult_education": ("obrazovanje odraslih", "adult education"), "school_secondary_general": ("gimnazije i opće srednje škole", "general secondary schools"),
               "public_body": ("javna tijela", "public bodies"), "sme_business": ("poduzeća", "businesses"), "school_preprimary": ("predškolske ustanove", "pre-primary"),
               "other": ("ostalo", "other"), "research": ("istraživački centri", "research bodies")}


def en_style(text: str) -> str:
    """English usage: €952.7 million, €7,340,431, 24% (the Croatian text keeps 952,7 milijuna € and 24 %)."""
    text = re.sub(r"(\d[\d,]*(?:\.\d+)?) million €", r"€\1 million", text)
    text = re.sub(r"(?<![\d,.])(\d[\d,]*(?:\.\d+)?) €", r"€\1", text)
    return re.sub(r"(\d) %", r"\1%", text)


def template_answer(lang: str, route: str, results: list[dict]) -> str:
    out = _template_answer(lang, route, results)
    last = results[-1] if results else None
    per = (last or {}).get("args", {}).get("period") if last and last.get("tool") in ("county_stats", "town_organisations") else None
    if per in ("2014-2020", "2021-2027") and out:
        label = "2014.–2020." if per == "2014-2020" else "2021.–2026."
        out = (f"Razdoblje {label}: " if lang == "hr" else f"Period {label.replace('.', '')}: ") + out
    return en_style(out) if lang == "en" else out


def _template_answer(lang: str, route: str, results: list[dict]) -> str:
    """Plain answer assembled by code from the first tool results; used when the model's answer cannot be verified."""
    hr = lang == "hr"
    if not results or not any(r["rows"] for r in results):
        if route == "concepts":
            return ("Nema dokaza u podacima za ovo pitanje. Pitajte o određenoj temi ili pojmu (npr. „rano napuštanje školovanja”), o najčešćim pristupima, rezultatima ili problemima, ili o tome što ide uz neki pojam." if hr else
                    "No evidence found in the data for this question. Try a specific theme or concept (e.g. “early school leaving”), the most common approaches, outputs or problems, or what goes with a concept.")
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
        cp = [quote_title(x["title"], x["call_year"], lang=lang) for x in r["coordinated_projects"][:3]]
        cc = [f"{country_name(c, lang)} ({n})" for c, n in r["partner_countries"][:3]]
        if hr:
            s = (f"{r['name']} ({_town(r['town'])}): {f(r['projects'])} KA2 {hr_plural(r['projects'], 'projekt', 'projekta', 'projekata')} ({f(r['projects_2014_2020'])} u 2014.–2020., {f(r['projects_2021_2027'])} u 2021.–2026.), "
                 f"od toga {f(r['coordinated'])} kao koordinator" + (f" ({hr_plural(len(cp), 'izvorni naslov', 'izvorna naslova', 'izvornih naslova') if r['coordinated'] <= len(cp) else 'primjeri izvornih naslova'}: {'; '.join(cp)})" if cp else "") + ". "
                 f"Bespovratna sredstva projekata koje koordinira: {f(r['grants_coordinated_eur'] or 0)} €; vrijednost svih projekata u kojima sudjeluje: {f(r['value_involved_eur'] or 0)} €."
                 + (f" Najčešće partnerske države: {', '.join(cc)}." if cc else ""))
        else:
            s = (f"{r['name']} ({_town(r['town'])}): {f(r['projects'])} KA2 projects ({f(r['projects_2014_2020'])} in 2014–2020, {f(r['projects_2021_2027'])} in 2021–2026), "
                 f"{f(r['coordinated'])} as coordinator" + (f" ({'original ' + ('title' if len(cp) == 1 else 'titles') if r['coordinated'] <= len(cp) else 'examples of original titles'}: {'; '.join(cp)})" if cp else "") + ". "
                 f"Grants of projects it coordinates: {f(r['grants_coordinated_eur'] or 0)} €; value of all projects it takes part in: {f(r['value_involved_eur'] or 0)} €."
                 + (f" Works most with: {', '.join(cc)}." if cc else ""))
        return s
    if t == "find_organisation":
        top1 = results[-1]["rows"][0]
        if len(results[-1]["rows"]) == 1 or not any("ambiguous" in n for n in results[-1]["notes"]):
            if top1.get("projects", 0) == 0:
                return (f"{top1['name']} ({_town(top1['town'])}) nije sudjelovala ni u jednom KA2 projektu od 2014. (nema KA2 projekata)." if hr
                        else f"{top1['name']} ({_town(top1['town'])}) has not taken part in any KA2 project since 2014.")
        names = "; ".join(f"{x['name']} ({_town(x['town'])})" for x in results[-1]["rows"][:5])
        return (f"Našao sam: {names}. Koju misliš?" if hr else f"I found: {names}. Which one do you mean?")
    if t == "county_stats":
        return (f"{r['label']}: {f(r['organisations'])} {hr_plural(r['organisations'], 'organizacija', 'organizacije', 'organizacija')}, {f(r['projects_involved'])} {hr_plural(r['projects_involved'], 'projekt', 'projekta', 'projekata')}, od toga {f(r['projects_coordinated'])} koordiniranih; "
                f"bespovratna sredstva koordiniranih projekata {f(r['grants_coordinated_eur'] or 0)} € ({f((r['grants_coordinated_eur'] or 0) / 1e6, 2)} mil. €)." if hr else
                f"{_label(lang, r['label'])}: {f(r['organisations'])} organisations, {f(r['projects_involved'])} projects, {f(r['projects_coordinated'])} coordinated; "
                f"grants of coordinated projects {f(r['grants_coordinated_eur'] or 0)} € ({f((r['grants_coordinated_eur'] or 0) / 1e6, 2)} million €).")
    if t == "project_values":
        rows = results[-1]["rows"]; r = rows[0]; top = rows[1:]
        eur = lambda v: f"{f(v)} €"
        fc = r.get("focus")
        title = lambda x: quote_title(x["title"], None, 110, lang)
        if fc in ("max", "min"):
            lst = "; ".join(f"{title(x)} ({x['call_year']}): {eur(x['grant_eur'])}" for x in top)
            return ((f"Najskuplji KA2 projekti s hrvatskim sudionikom: {lst}." if fc == "max" else f"Projekti s najmanjom dodijeljenom vrijednošću: {lst}.") if hr else
                    (f"Most expensive KA2 projects with a Croatian participant: {lst}." if fc == "max" else f"Projects with the smallest grant: {lst}.")) + \
                   (" Vrijednost je puni iznos bespovratnih sredstava projekta, ne hrvatski dio." if hr else " The value is the full grant of the project, not the Croatian share.")
        if fc in ("above", "below"):
            w_hr, w_en = ("većom", "above") if fc == "above" else ("manjom", "below")
            return (f"Projekata s hrvatskim sudionikom s vrijednošću {w_hr} od {eur(r['amount'])} ima {f(r['count_threshold'])} od {f(r['projects'])}." if hr else
                    f"{f(r['count_threshold'])} of {f(r['projects'])} KA2 projects with a Croatian participant have a grant {w_en} {eur(r['amount'])}.")
        if fc == "average_coordinated":
            return (f"Prosječna vrijednost projekata koje koordinira hrvatska organizacija je {eur(r['average_coordinated'])} ({f(r['coordinated'])} projekata)." if hr else
                    f"The average grant of projects coordinated by a Croatian organisation is {eur(r['average_coordinated'])} ({f(r['coordinated'])} projects).")
        if fc == "median":
            return f"Medijan vrijednosti projekta je {eur(r['median'])}." if hr else f"The median project grant is {eur(r['median'])}."
        return (f"Prosječna vrijednost KA2 projekta s hrvatskim sudionikom je {eur(r['average'])} (medijan {eur(r['median'])}; {f(r['projects'])} projekata, ukupno {f(r['total'] / 1e6, 1)} mil. €). Projekti koje koordinira hrvatska organizacija: prosječno {eur(r['average_coordinated'])}. Vrijednost je puni iznos bespovratnih sredstava projekta." if hr else
                f"The average grant of a KA2 project with a Croatian participant is {eur(r['average'])} (median {eur(r['median'])}; {f(r['projects'])} projects, {f(r['total'] / 1e6, 1)} million € in all). Projects coordinated by a Croatian organisation: {eur(r['average_coordinated'])} on average. The value is the full grant of the project.")
    if route == "value" and t == "national_stats":
        r = results[-1]["rows"][0]
        mil = r["value_involved_eur"] / 1e6
        return (f"Ukupna vrijednost svih KA2 projekata s hrvatskim sudionikom je {f(mil, 1)} milijuna € ({f(r['projects'])} projekata). To je puni iznos bespovratnih sredstava svakog projekta, ne samo hrvatski dio." if hr else
                f"The total value of all KA2 projects with a Croatian participant is {f(mil, 1)} million € ({f(r['projects'])} projects). This is the full grant of each project, not only the Croatian share.")
    if t == "national_stats" and results[-1]["rows"] and results[-1]["rows"][0].get("focus"):
        r = results[-1]["rows"][0]; fc = r["focus"]
        if fc == "organisations":
            return (f"U KA2 projektima sudjelovalo je {f(r['organisations'])} različitih organizacija iz Hrvatske u {f(r['projects'])} projekata." if hr else
                    f"{f(r['organisations'])} different Croatian organisations took part in {f(r['projects'])} KA2 projects.")
        if fc == "coordinated_share":
            return (f"Hrvatska organizacija koordinira {f(r['coordinated'])} od {f(r['projects'])} KA2 projekata s hrvatskim sudionikom, to jest {f(r['coordinated_share_of_projects'] * 100, 1)} %." if hr else
                    f"A Croatian organisation coordinates {f(r['coordinated'])} of {f(r['projects'])} KA2 projects with a Croatian participant, that is {f(r['coordinated_share_of_projects'] * 100, 1)}%.")
        return (f"Hrvatska organizacija koordinira {f(r['coordinated'])} od {f(r['projects'])} KA2 projekata s hrvatskim sudionikom." if hr else
                f"A Croatian organisation coordinates {f(r['coordinated'])} of {f(r['projects'])} KA2 projects with a Croatian participant.")
    if t == "national_stats":
        cls = r.get("coordinating_organisation_classes", [])[:4]
        ctext = ", ".join(f"{CLASS_NAMES.get(x['org_class'], (x['org_class'],) * 2)[0 if hr else 1]} {f(x['projects_coordinated'])}" for x in cls)
        if any(x["org_class"] == "ngo" for x in cls):      # the class is wider than what the EU export types as NGO (no numbers here: the verifier checks every number against the tool output)
            ctext += (". Nevladine organizacije uključuju organizacije kojima je prazna vrsta dopunjena iz drugih zapisa i europske organizacije civilnog društva" if hr else
                      ". Non-governmental organisations include organisations whose blank type was filled from other records and European civil-society organisations")
        return (f"{f(r['projects'])} KA2 {hr_plural(r['projects'], 'projekt', 'projekta', 'projekata')} ima hrvatskog sudionika ({f(r['projects_2014_2020'])} u 2014.–2020., {f(r['projects_2021_2027'])} u 2021.–2026.), a {f(r['coordinated'])} ih koordinira hrvatska organizacija ({f(r['share_of_eu_ka2_projects'] * 100, 1)} % svih KA2 projekata u EU-u). Koordiniraju najčešće: {ctext}."
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
    if t == "success_rate":
        rows = last["rows"]
        a = last["args"]
        scope = (f"{a['action']}, " if a["period"] == "2021-2027" else "") 
        def line(r):
            y = r["call_year"]
            lab = ("ukupno" if hr else "total") if y == "total" else f"{y}."
            if not hr and y != "total":
                lab = str(y)
            return (f"{lab}: {f(r['applications'])} prijava, {f(r['contracted'])} ugovoreno ({f(r['rate'] * 100, 1)} %)" if hr
                    else f"{lab}: {f(r['applications'])} applications, {f(r['contracted'])} contracted ({f(r['rate'] * 100, 1)} %)")
        head = (f"Prijave i ugovoreni projekti u Hrvatskoj ({scope.strip(', ')}): " if hr else f"Applications and contracted projects in Croatia ({scope.strip(', ')}): ")
        return head + "; ".join(line(r) for r in rows) + "."
    if t == "country_compare":
        rows = results[-1]["rows"]
        parts = [f"{country_name(x['country'], lang)}: {f(x['coordinated_projects'])} ({x['rank']}. {'mjesto' if hr else 'place'})" if hr else f"{country_name(x['country'], lang)}: {f(x['coordinated_projects'])} (rank {x['rank']})" for x in rows]
        return (f"KA2 projekti koordinirani iz pojedine države, 2014.–2026.: " + "; ".join(parts) + f". Poredak je među {f(rows[0]['countries_total'])} država." if hr else
                f"KA2 projects coordinated from each country, 2014–2026: " + "; ".join(parts) + f". Rank is among {f(rows[0]['countries_total'])} countries.")
    if t == "country_stats":
        top = results[-1]["rows"][0]
        hrr = next((x for x in results[-1]["rows"] if x["country"] == "HR"), None)
        tail_hr = (f" Hrvatska je na {hrr['rank']}. mjestu od {hrr['countries_total']} država koordinatora u {'2014.–2020.' if hrr['period'] == '2014-2020' else '2021.–2026.'} ({f(hrr['coordinated_projects'])} projekata)." if hr else f" Croatia ranks {hrr['rank']} of {hrr['countries_total']} coordinating countries in {'2014–2020' if hrr['period'] == '2014-2020' else '2021–2026'} ({f(hrr['coordinated_projects'])} projects).") if hrr else ""
        return (f"Najviše KA2 projekata koordinira {country_name(top['country'], lang)} ({f(top['coordinated_projects'])})." if hr else
                f"Most KA2 projects are coordinated from {country_name(top['country'], lang)} ({f(top['coordinated_projects'])}).") + tail_hr
    if t == "county_project":
        r = results[-1]["rows"][0] if results[-1]["rows"] else None
        if r is None:
            return "Nisam našao taj projekt." if hr else "I could not find that project."
        place = _label(lang, r["label"]) if lang == "en" else r["label"]
        if "title" not in r:
            return (f"{place} ima samo {f(r['total'])} projekata, pa {r['n']}. ne postoji." if hr else f"{place} has only {f(r['total'])} projects, so there is no number {r['n']}.")
        which = (("zadnji" if r["rank"] == 1 else f"{r['rank']}. od kraja") if r["order"] == "last" else f"{r['rank']}.") if hr else \
                (("last" if r["rank"] == 1 else f"{r['rank']}th from last") if r["order"] == "last" else {1: "first", 2: "second", 3: "third"}.get(r["rank"], f"{r['rank']}th"))
        topics = r["topics"] or []
        ct = [(x[1] if hr and x[1] else x[0]) for x in r["concept_topics"]]
        top = "; ".join(topics) if topics else ""
        cts = ", ".join(ct)
        yr = r["call_year"]
        if hr:
            s = f"{which.capitalize() if r['order'] == 'last' else which + ' projekt'} ({place}, poziv {yr}.): {quote_title(r['title'], None, 110, lang)}."
            s += f" Teme prema izvoru: {top}." if top else " Izvor ne navodi teme."
            s += f" Pojmovi tema izdvojeni iz sažetka: {cts}." if cts else ""
            s += f" Projekti su poredani po godini poziva i šifri; {f(r['same_year'])} projekata iz županije dijeli godinu {yr}., pa „{'zadnji' if r['order'] == 'last' else 'prvi'}” znači {'zadnji' if r['order'] == 'last' else 'prvi'} u tom redoslijedu." if r["same_year"] > 1 else ""
            return s
        s = f"The {which} project ({place}, {yr} call): {quote_title(r['title'], None, 110, lang)}."
        s += f" Topics in the source: {top}." if top else " The source lists no topics."
        s += f" Topic concepts found in the summary: {cts}." if cts else ""
        s += f" Projects are ordered by call year and then by project id; {f(r['same_year'])} projects from the county share the {yr} call, so “{r['order']}” means {r['order']} in that order." if r["same_year"] > 1 else ""
        return s
    if t == "glossary":
        r = results[-1]["rows"][0] if results[-1]["rows"] else None
        return (r["hr"] if hr else r["en"]) if r else ("Taj pojam nije u rječniku." if hr else "That term is not in the glossary.")
    if t == "year_series":
        rows = [x for x in results[-1]["rows"] if not x.get("summary")]
        sm = next((x for x in results[-1]["rows"] if x.get("summary")), None)
        line = "; ".join(f"{x['year']}.: {f(x['projects'])}" if hr else f"{x['year']}: {f(x['projects'])}" for x in rows)
        if not sm:
            return line
        fc = sm.get("focus")
        lead = ""
        sg = lambda v: ("+" if v > 0 else "") + f(v)
        if fc == "lowest": lead = f"Najmanje projekata bilo je {sm['lowest_year']}. ({f(sm['lowest_projects'])}). " if hr else f"The fewest projects were in {sm['lowest_year']} ({f(sm['lowest_projects'])}). "
        elif fc == "highest": lead = f"Najviše projekata bilo je {sm['highest_year']}. ({f(sm['highest_projects'])}). " if hr else f"The most projects were in {sm['highest_year']} ({f(sm['highest_projects'])}). "
        elif fc == "rise": lead = f"Najveći međugodišnji rast bio je {sm['biggest_rise_year']}. ({sg(sm['biggest_rise'])} projekata). " if hr else f"The biggest year-on-year rise was in {sm['biggest_rise_year']} ({sg(sm['biggest_rise'])} projects). "
        elif fc == "fall": lead = f"Najveći međugodišnji pad bio je {sm['biggest_fall_year']}. ({f(sm['biggest_fall'])} projekata). " if hr else f"The biggest year-on-year fall was in {sm['biggest_fall_year']} ({f(sm['biggest_fall'])} projects). "
        elif fc == "average": lead = f"Prosječan broj projekata po godini od {sm['avg_from']}. do {sm['avg_to']}. iznosi {f(sm['avg'])}. " if hr else f"The average number of projects per year from {sm['avg_from']} to {sm['avg_to']} is {f(sm['avg'])}. "
        elif fc == "diff": lead = (f"{sm['diff_a']}. godine bilo je {f(sm['diff_a_projects'])} projekata, a {sm['diff_b']}. {f(sm['diff_b_projects'])}: razlika je {sg(sm['diff'])}. " if hr else
                                    f"There were {f(sm['diff_a_projects'])} projects in {sm['diff_a']} and {f(sm['diff_b_projects'])} in {sm['diff_b']}: a difference of {sg(sm['diff'])}. ")
        elif fc == "trend": lead = (f"Da: broj projekata rastao je s {f(sm['trend_first'])} u 2014. na {f(sm['trend_last'])} u 2020., a u 2021.–2025. kretao se između {f(sm['trend_after_min'])} i {f(sm['trend_after_max'])} godišnje. " if hr else
                                     f"Yes: the number of projects grew from {f(sm['trend_first'])} in 2014 to {f(sm['trend_last'])} in 2020, and in 2021–2025 stayed between {f(sm['trend_after_min'])} and {f(sm['trend_after_max'])} a year. ")
        if hr:
            return lead + (f"KA2 projekata s hrvatskim sudionikom po godini poziva: {line}. Najviše: {sm['highest_year']}. ({f(sm['highest_projects'])}), najmanje: {sm['lowest_year']}. ({f(sm['lowest_projects'])}). "
                    f"Najveći međugodišnji rast: {sm['biggest_rise_year']}. ({'+' if sm['biggest_rise'] >= 0 else ''}{f(sm['biggest_rise'])}), najveći pad: {sm['biggest_fall_year']}. ({f(sm['biggest_fall'])}). "
                    f"Prosjek po godini: {f(sm['average_2014_2020'])} u 2014.–2020. i {f(sm['average_2021_2025'])} u 2021.–2025. Odabir za 2026. još nije potpun pa se ne uspoređuje.")
        return lead + (f"KA2 projects with a Croatian participant per call year: {line}. Highest: {sm['highest_year']} ({f(sm['highest_projects'])}), lowest: {sm['lowest_year']} ({f(sm['lowest_projects'])}). "
                f"Biggest year-on-year rise: {sm['biggest_rise_year']} ({'+' if sm['biggest_rise'] >= 0 else ''}{f(sm['biggest_rise'])}), biggest fall: {sm['biggest_fall_year']} ({f(sm['biggest_fall'])}). "
                f"Average per year: {f(sm['average_2014_2020'])} in 2014–2020 and {f(sm['average_2021_2025'])} in 2021–2025. The 2026 selection is not complete, so it is not compared.")
    if t == "year_projects":
        r = results[-1]["rows"][0] if results[-1]["rows"] else None
        if not r:
            return "Za tu godinu poziva nema projekata s hrvatskim sudionikom." if hr else "There are no projects with a Croatian participant in that call year."
        tail = (" Odabir za 2026. još nije potpun." if hr else " The 2026 selection is not complete.") if r["year"] == 2026 else ""
        return (f"U pozivu {r['year']}. odabrano je {f(r['projects'])} KA2 {hr_plural(r['projects'], 'projekt', 'projekta', 'projekata')} s hrvatskim sudionikom, a Hrvatska je koordinirala {f(r['coordinated'])}." + tail if hr else
                f"In the {r['year']} call, {f(r['projects'])} KA2 projects with a Croatian participant were selected, and Croatia coordinated {f(r['coordinated'])}." + tail)
    if t == "county_ranking" and results[-1]["rows"] and results[-1]["args"].get("count_only"):
        n = results[-1]["rows"][0]["counties_total"]
        return f"U KA2 projektima sudjeluju organizacije iz svih {f(n)} županija (uključujući Grad Zagreb)." if hr else f"Organisations from all {f(n)} counties (including the City of Zagreb) take part in KA2 projects."
    if t == "town_compare":
        rows = results[-1]["rows"]
        if len(rows) < 2:
            return "Nije moguće usporediti: gradovi nisu u podacima." if hr else "Cannot compare: the towns are not in the data."
        line = "; ".join(f"{x['town']}: {f(x['projects'])} {hr_plural(x['projects'], 'projekt', 'projekta', 'projekata')}, {f(x['organisations'])} {hr_plural(x['organisations'], 'organizacija', 'organizacije', 'organizacija')}, koordiniranih {f(x['coordinated'])}" if hr else
                         f"{x['town']}: {f(x['projects'])} projects, {f(x['organisations'])} organisations, {f(x['coordinated'])} coordinated" for x in rows)
        best = max(rows, key=lambda x: x["projects"])
        tie = sum(1 for x in rows if x["projects"] == best["projects"]) > 1
        tail = "" if tie else (f" Najviše projekata ima {best['town']}." if hr else f" {best['town']} has the most projects.")
        return (f"KA2 projekti s organizacijom iz grada – " if hr else "KA2 projects with an organisation from the town – ") + line + "." + tail
    if t == "town_organisations":
        rows = results[-1]["rows"]
        if not rows:
            return "Taj grad nije u podacima." if hr else "That town is not in the data."
        sm, top = rows[0], rows[1:]
        if not sm["organisations"]:
            return (f"Nijedna organizacija iz mjesta {sm['town']} nije sudjelovala u KA2 projektu (u registru škola ima {f(sm['registry_institutions'])} ustanova)." if hr else
                    f"No organisation from {sm['town']} has taken part in a KA2 project ({f(sm['registry_institutions'])} institutions in the school register).")
        lst = "; ".join(f"{x['name']} ({f(x['projects'])})" for x in top)
        return (f"{sm['town']}: u KA2 projektima sudjeluje {f(sm['organisations'])} {hr_plural(sm['organisations'], 'organizacija', 'organizacije', 'organizacija')}; projekata: {f(sm['projects'])}, od toga koordiniranih: {f(sm['coordinated'])}. Najaktivnije (broj projekata): {lst}." if hr else
                f"{sm['town']}: {f(sm['organisations'])} organisations take part in KA2 projects; projects: {f(sm['projects'])}, of which coordinated: {f(sm['coordinated'])}. Most active (number of projects): {lst}.")
    if t == "county_ranking":
        rows = results[-1]["rows"]
        names = lambda r: _label(lang, r["label"]) if lang == "en" else r["label"]
        if results[-1]["args"].get("order_by") == "organisations":
            return ((f"Županije prema broju organizacija koje sudjeluju u KA2: " + "; ".join(f"{names(x)}: {f(x['organisations'])}" for x in rows) + ".") if hr else
                    (f"Counties by number of organisations taking part in KA2: " + "; ".join(f"{names(x)}: {f(x['organisations'])}" for x in rows) + "."))
        return ((f"Županije prema broju KA2 projekata sa sudionikom iz županije: " + "; ".join(f"{names(x)}: {f(x['projects_involved'])}" for x in rows) + ". Projekt s organizacijama iz dvije županije broji se u obje.") if hr else
                (f"Counties by number of KA2 projects with a participant from the county: " + "; ".join(f"{names(x)}: {f(x['projects_involved'])}" for x in rows) + ". A project with organisations from two counties counts in both."))
    if t == "partner_countries":
        rows = results[-1]["rows"]
        who_hr = f" – {rows[0]['subject']}" if rows and rows[0].get("subject") else " s hrvatskim sudionikom"
        who_en = f" – {rows[0]['subject']}" if rows and rows[0].get("subject") else " with a Croatian participant"
        if not rows:
            return "Za to nema partnerskih država u podacima." if hr else "There are no partner countries for that in the data."
        return ((f"Najčešće partnerske države u KA2 projektima{who_hr} (broj projekata): " + "; ".join(f"{country_name(x['country'], lang)}: {f(x['projects'])}" for x in rows) + f". Ukupno {f(rows[0]['countries_total'])} država, {f(rows[0]['projects_total'])} projekata.") if hr else
                (f"Most frequent partner countries in KA2 projects{who_en} (number of projects): " + "; ".join(f"{country_name(x['country'], lang)}: {f(x['projects'])}" for x in rows) + f". {f(rows[0]['countries_total'])} countries in all, {f(rows[0]['projects_total'])} projects."))
    if t == "top_organisations":
        rows = results[-1]["rows"][:5]
        county = results[-1]["args"].get("county")
        where = (f" ({_label(lang, str(county))})" if lang == "en" else f" ({county}{'' if county == 'Grad Zagreb' else ' županija'})") if county else (" u Hrvatskoj" if hr else " in Croatia")
        if results[-1]["args"].get("role") == "coordinator":
            head = f"Organizacije koje koordiniraju najviše KA2 projekata{where}, broj koordiniranih projekata: " if hr else f"Organisations that coordinate the most KA2 projects{where}, number of coordinated projects: "
            return head + "; ".join(f"{x['org_name']}: {f(x['coordinated'])}" for x in rows) + "."
        head = f"Najaktivnije organizacije{where}, broj KA2 projekata: " if hr else f"Most active organisations{where}, number of KA2 projects: "
        return head + "; ".join(f"{x['org_name']}: {f(x['projects'])}" for x in rows) + "."
    if t == "search_projects":
        head = "Projekti koji odgovaraju pretrazi (izvorni naslovi): " if hr else "Projects matching the search (original titles): "
        return head + "; ".join(quote_title(x["title"], x.get("call_year"), 100, lang) for x in results[-1]["rows"][:5]) + "."
    if t in ("common_concepts", "concept_profile", "community_overview", "search_concepts", "concept_trends", "connected_concepts"):
        return _concept_answer(lang, results)
    return "Nema dokaza u podacima za ovo pitanje." if hr else "No evidence found in the data for this question."


KIND_NAMES = {"approach": ("pristupi i aktivnosti", "approaches and activities"), "target_group": ("ciljne skupine", "target groups"), "output": ("rezultati", "outputs"),
              "problem": ("problemi", "problems"), "topic": ("teme EU programa", "EU programme topics")}
CONCEPT_CAVEAT = {"hr": "Pojmovi su izdvojeni jezičnim modelom iz sažetaka projekata, pa su brojevi donja granica; zajedničko pojavljivanje u istim projektima ne znači uzrok.",
                  "en": "The concepts were extracted from project summaries by a language model, so the counts are lower bounds; occurring in the same projects does not mean cause and effect."}


def _concept_answer(lang: str, results: list[dict]) -> str:
    text = _concept_answer_core(lang, results)
    if any(x["tool"] == "search_concepts" and x["args"].get("by_meaning") and x["rows"] for x in results):    # the closest concept by meaning, not by wording
        text = ("Nisam našao pojam s istim riječima; najbliži po značenju je ovaj. " if lang == "hr" else "No concept uses those words; this is the closest one by meaning. ") + text
    return text


def _concept_answer_core(lang: str, results: list[dict]) -> str:
    hr = lang == "hr"
    f = lambda x, d=0: _fmt(lang, x, d)
    name = lambda x: (x.get("label_hr") or x["label_en"]) if hr else x["label_en"]
    commons = [x for x in results if x["tool"] == "common_concepts" and x["rows"]]
    if commons:
        parts = []
        for c in commons:
            kn = KIND_NAMES[c["args"]["kind"]][0 if hr else 1]
            items = "; ".join(f"{name(x)} ({f(x['projects'])}, {f(x['share'] * 100)} %)" for x in c["rows"])
            parts.append(f"{kn[:1].upper() + kn[1:]}: {items}.")
        head = "Najčešće u KA2 projektima s hrvatskim sudionikom (broj projekata, udio): " if hr else "Most common in KA2 projects with a Croatian participant (projects, share): "
        if commons[0]["args"].get("topic_note"):
            head = ("Podaci nemaju „prvu” temu projekta: svaki projekt ima jednu ili više tema EU-a. Najčešće teme (broj projekata, udio): " if hr else
                    "The data has no “first” topic per project: each project has one or more EU programme topics. The most common topics (projects, share): ")
        miss = commons[0]["args"].get("qualifier_not_found")
        if miss:
            head = (f"Nisam našao pojam koji odgovara „{miss}”, pa pokazujem opću ljestvicu. " if hr else f"I found no concept matching “{miss}”, so this is the overall list. ") + head
        return head + " ".join(parts) + " " + CONCEPT_CAVEAT[lang]
    last = next(x for x in reversed(results) if x["rows"])
    if last["tool"] == "concept_trends":
        pc = lambda r, k: f(r[k] * 100)
        def part(tr):
            rs = [r for r in last["rows"] if r["trend"] == tr]
            return "; ".join(f"{name(r)} ({pc(r, 'share_2014_2020')} % → {pc(r, 'share_2021_2027')} %)" for r in rs)
        up, down = part("growing"), part("fading")
        kn = KIND_NAMES[last["args"]["kind"]][0 if hr else 1]
        if hr:
            return (f"{kn[:1].upper() + kn[1:]} — udio projekata 2014.–2020. → 2021.–2026. Rastu: {up or 'nema'}. Opadaju: {down or 'nema'}. "
                    "Dio promjene dolazi iz vrste poziva (npr. školska razmjena uglavnom je do 2020.), a ne iz struke. " + CONCEPT_CAVEAT[lang])
        return (f"{kn[:1].upper() + kn[1:]} — share of projects 2014–2020 → 2021–2026. Growing: {up or 'none'}. Fading: {down or 'none'}. "
                "Part of the change comes from the call design (for example school exchange was mainly an action of 2014–2020), not from the field. " + CONCEPT_CAVEAT[lang])
    if last["tool"] == "connected_concepts":
        nb = "; ".join(f"{name(r)} ({f(r['neighbours'])})" for r in last["rows"] if r["measure"] == "neighbours")
        br = "; ".join(f"{name(r)} ({f(r['groups'])})" for r in last["rows"] if r["measure"] == "groups")
        if hr:
            return f"Pojmovi koji se javljaju uz najviše drugih pojmova (broj): {nb}. Pojmovi čiji susjedi pripadaju najviše različitih skupina (broj skupina): {br}. Popularni pojmovi imaju mnogo susjeda jer su u mnogo projekata. " + CONCEPT_CAVEAT[lang]
        return f"Concepts that occur with the most other concepts (count): {nb}. Concepts whose neighbours lie in the most different groups (number of groups): {br}. Popular concepts have many neighbours because they are in many projects. " + CONCEPT_CAVEAT[lang]
    if last["tool"] == "community_overview":
        items = []
        for r in last["rows"][:4]:
            k = lambda key: ", ".join(r[key + ("_hr" if hr else "")][:2])
            items.append(f"{r['community_id']}: {f(r['n_projects'])} {hr_plural(r['n_projects'], 'projekt', 'projekta', 'projekata') if hr else 'projects'} ({f(r['share'] * 100)} %); "
                         + (f"ciljne skupine {k('top_target_group')}; pristupi {k('top_approach')}" if hr else f"target groups {k('top_target_group')}; approaches {k('top_approach')}"))
        return ((f"Skupine pojmova koji se često javljaju u istim projektima: " if hr else "Groups of concepts that often occur in the same projects: ") + "; ".join(items) + ". " + CONCEPT_CAVEAT[lang])
    if last["tool"] == "concept_profile":
        r = last["rows"][0]
        kn = {"approach": ("pristup", "approach"), "target_group": ("ciljna skupina", "target group"), "output": ("rezultat", "output"),
              "problem": ("problem", "problem"), "topic": ("tema EU-a", "EU topic")}[r["kind"]][0 if hr else 1]
        rel = []
        focus = last["args"].get("focus")
        for kd in sorted(("target_group", "approach", "output", "problem", "topic"), key=lambda k: k != focus):
            items = [name(x) for x in r["related"].get(kd, [])[:(5 if kd == focus else 3)]]
            if items:
                rel.append(f"{KIND_NAMES[kd][0 if hr else 1]}: {', '.join(items)}")
        ex = "; ".join(quote_title(x["title"], x["call_year"], 80, lang) for x in r["examples"][:2])
        if hr:
            s = (f"{name(r)} ({kn}): {f(r['n_projects'])} {hr_plural(r['n_projects'], 'projekt', 'projekta', 'projekata')} ({f(r['n_2014_2020'])} u 2014.–2020., {f(r['n_2021_2027'])} u 2021.–2026.). "
                 f"Oznaku dobre prakse ima {f(r['good_practice'])} od njih ({f(r['good_practice_rate'] * 100)} %; među svim projektima {f(r['good_practice_rate_all'] * 100)} %). ")
            s += ("Najčešće u istim projektima: " + "; ".join(rel) + ". ") if rel else ""
            s += (f"Primjeri projekata (izvorni naslovi): {ex}. " if ex else "")
        else:
            s = (f"{name(r)} ({kn}): {f(r['n_projects'])} projects ({f(r['n_2014_2020'])} in 2014–2020, {f(r['n_2021_2027'])} in 2021–2026). "
                 f"{f(r['good_practice'])} of them carry the good-practice label ({f(r['good_practice_rate'] * 100)} %; among all projects {f(r['good_practice_rate_all'] * 100)} %). ")
            s += ("Most often in the same projects: " + "; ".join(rel) + ". ") if rel else ""
            s += (f"Example projects (original titles): {ex}. " if ex else "")
        return s + CONCEPT_CAVEAT[lang]
    items = "; ".join(name(x) for x in last["rows"][:5])
    return (f"Pronašao sam pojmove: {items}." if hr else f"I found these concepts: {items}.")


# ---------------------------------------------------------------------------------------------------- the graph
class State(TypedDict, total=False):
    question: str
    lang: str
    lang_hint: Optional[str]
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
        lang = detect_language(s["question"], s.get("lang_hint"))
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
                plan.update(follow_up=True) if plan["route"] == "partner_countries" else plan.update(route="organisation", follow_up=True)
        if plan is not None and plan["route"] == "organisation" and not plan.get("organisation") and not s.get("last_org_id") \
                and not self.tb.find_organisation_in_text(s["question"]).rows:
            county = self.tb.resolve_county(s["question"])      # "organisation" with no organisation named anywhere: a county question if a county is named, else a national one
            plan["route"], plan["county"] = ("county", county) if county else ("national", plan.get("county"))
        if HELP_WORDS.search(s["question"].strip().lower()) and len(s["question"]) < 70:
            return {"plan": {"route": "limits"}, "results": [], "done": True, "answer": HELP[s["lang"]], "trace": s["trace"] + ["help"]}
        if plan is None or plan["route"] == "out_of_scope":
            return {"plan": plan or {"route": "out_of_scope"}, "results": [], "done": True, "answer": REFUSAL[s["lang"]], "trace": s["trace"] + ["refused"]}
        if plan["route"] == "limits":
            return {"plan": plan, "results": [], "done": True, "answer": LIMITS[s["lang"]], "trace": s["trace"] + ["limits"]}
        r = plan["route"]
        tb = self.tb
        if r == "concepts":
            q = s["question"].lower()
            kind = next((k for k, rx in KIND_WORDS if rx.search(q)), None)
            if CONNECT_WORDS.search(q):
                results.append(tb.connected_concepts())
            elif TREND_WORDS.search(q):
                results.append(tb.concept_trends(kind or "approach"))
            elif COMMUNITY_WORDS.search(q):
                results.append(tb.community_overview())
            elif COMMON_WORDS.search(q) and not EXPECT_WORDS.search(q) and (qual := concept_qualifier(s["question"])) and (found := tb.search_concepts(qual)).rows and kind != "topic":
                results.append(found)                                          # "which approaches work for X": what goes with X, of the kind asked for
                results.append(tb.concept_profile(found.rows[0]["node_id"], kind or "approach"))
            elif COMMON_WORDS.search(q):
                qual = "" if EXPECT_WORDS.search(q) or kind == "topic" else concept_qualifier(s["question"])
                for kd in (("approach", "output", "target_group") if EXPECT_WORDS.search(q) and not kind else (kind or "approach",)):
                    results.append(tb.common_concepts(kd, plan["period"], 6 if EXPECT_WORDS.search(q) and not kind else 8))
                    if qual:
                        results[-1].args["qualifier_not_found"] = qual
            else:
                found = tb.search_concepts(s["question"])
                if not found.rows and kind == "topic":                          # "what was the first topic of every project": the data has several EU topics per project, no first one
                    found = tb.common_concepts("topic", plan["period"], 8)
                    found.args["topic_note"] = True
                results.append(found)
                if found.rows and found.tool == "search_concepts":
                    results.append(tb.concept_profile(found.rows[0]["node_id"], kind))
            used = [x.as_dict() for x in results]
            out = {"plan": plan, "results": used, "trace": s["trace"] + [f"tools={[x['tool'] for x in used]}"]}
            if self.mode == "polish":
                out["draft"] = template_answer(s["lang"], r, used)
            if self.mode == "template" or not any(x["rows"] for x in used):
                out.update(done=True, answer=template_answer(s["lang"], r, used), trace=out["trace"] + ["template answer"])
            return out
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
            results.append(tb.national_stats(plan["period"], s["question"]))
        elif r == "coverage":
            results.append(tb.coverage(plan["county"], plan["school_type"], plan["period"], plan["role"]))
        elif r == "success":
            ys = sorted({int(y) for y in re.findall(r"20[12]\d", s["question"])})
            per = "2014-2020" if ys and ys[-1] <= 2020 else "2021-2027"
            results.append(tb.success_rate(per, ys[0] if len(ys) == 1 else None, "KA1" if re.search(r"\bka\s?1\b", s["question"].lower()) else "KA2"))
        elif r == "county_ranking":
            by_orgs = bool(re.search(r"najvi[šs]e organizacij|most organi[sz]ations|najvi[šs]e ustanova|broj organizacija", s["question"].lower()))
            results.append(tb.county_ranking(plan["period"], order_by="organisations" if by_orgs else "projects"))
            if re.search(r"^koliko (je )?[\wčćšžđ]*\s*županij\w*|^how many counties", s["question"].lower().strip()) and not re.search(r"najvi|najmanj|most|least|top", s["question"].lower()):
                results[-1].args["count_only"] = True
        elif r == "glossary":
            results.append(tb.glossary(s["question"]))
        elif r == "year_count":
            ys = {int(y) for y in re.findall(r"20[12]\d", s["question"])}
            results.append(tb.year_projects(ys.pop()) if len(ys) == 1 and not YEAR_TREND_WORDS.search(s["question"].lower()) else tb.year_series(s["question"]))
        elif r == "value":
            results.append(tb.project_values(s["question"], plan["period"]) if VALUE_DETAIL.search(s["question"].lower()) else tb.national_stats(plan["period"]))
        elif r == "county_project" and plan["county"]:
            n, order = ordinal_request(s["question"]) or (1, "first")
            results.append(tb.county_project(plan["county"], n, order, plan["period"]))
        elif r == "town" and plan.get("towns"):
            results.append(tb.town_compare(plan["towns"], plan["period"]))
        elif r == "town" and plan.get("town"):
            results.append(tb.town_organisations(plan["town"], plan["period"]))
        elif r == "partner_countries":
            org_id = s.get("last_org_id") if plan.get("follow_up") else None
            results.append(tb.partner_countries(plan["period"], org_id=org_id, town=None if org_id else plan.get("town")))
        elif r == "country_ranking" and len(countries_in_text(s["question"])) >= 2:
            results.append(tb.country_compare(countries_in_text(s["question"])))
        elif r == "country_ranking":
            results.append(tb.country_stats("2021-2027" if plan["period"] == "all" else plan["period"]))
        elif r == "top_organisations":
            results.append(tb.top_organisations(plan["county"], plan["period"], 5, "coordinator" if COORD_RANK.search(s["question"]) else "any"))
        elif r == "project_search" and plan["topic"]:
            results.append(tb.search_projects(plan["topic"], plan["period"]))
            if not results[-1].rows:                      # no keyword hit (summaries are mostly English): try the concept names, which also exist in Croatian
                found = tb.search_concepts(plan["topic"])
                if found.rows:
                    results.append(tb.concept_profile(found.rows[0]["node_id"]))
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

    def ask(self, question: str, last_org_id: Optional[str] = None, lang_hint: Optional[str] = None) -> dict:
        t0 = time.time()
        s = self.graph.invoke({"question": question, "last_org_id": last_org_id, "lang_hint": lang_hint})
        results = s.get("results", [])
        cites = []
        for r in results:
            for c in r["citations"]:
                if c not in cites:
                    cites.append(c)
        org = next((r["args"].get("org_id") for r in results if r["tool"] == "organisation_profile"), None)
        lead = yes_no_lead(question, s["lang"], results) if (s.get("plan") or {}).get("route") == "organisation" else ""
        answer = s["answer"] if not lead or re.match(r"\s*(da|ne|yes|no)\b", s["answer"], re.I) else lead + s["answer"]
        return {"answer": answer, "lang": s["lang"], "route": (s.get("plan") or {}).get("route"), "plan": s.get("plan"),
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

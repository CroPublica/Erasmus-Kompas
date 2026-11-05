"""Read-only, deterministic tools for the Ask page (plan section 5).

The model never writes SQL and never does arithmetic: it picks a tool and arguments, and phrases the result. Every tool
returns a ToolResult whose rows carry the identifiers that may be cited (`project:<id>`, `org:<id>`, `county:<stem>`).
Money is always one of three named measures (grants_coordinated_eur, value_involved_eur, participations); they are never
added together across places. Nothing here returns a personal name or an e-mail address (the data has none).

Not built yet: tools that need the concept layer (search_concepts, solutions_for_problem, neighbours, shortest_path,
community_summary, concept_card, concept_centrality), success_rate (tablica 8/9), and the embedding side of search_projects.
"""
from __future__ import annotations

import json
import math
import re
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import duckdb

from pipeline.names import norm_name, strip_diacritics

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "atlas.duckdb"
PERIODS = ("all", "2014-2020", "2021-2027")
SCHOOL_TYPES = {"both": ("primary", "secondary", "combined"), "primary": ("primary",), "secondary": ("secondary",),
                "kindergarten": ("kindergarten",)}
_SMALL = {"u", "of", "the", "and", "na", "za", "i"}      # dropped from name matching ("i." the numeral is kept: it ends in a dot)


EN_COUNTY = {"Bjelovarsko-bilogorska": "Bjelovar-Bilogora County", "Brodsko-posavska": "Brod-Posavina County", "Dubrovačko-neretvanska": "Dubrovnik-Neretva County",
             "Grad Zagreb": "City of Zagreb", "Istarska": "Istria County", "Karlovačka": "Karlovac County", "Koprivničko-križevačka": "Koprivnica-Križevci County",
             "Krapinsko-zagorska": "Krapina-Zagorje County", "Ličko-senjska": "Lika-Senj County", "Međimurska": "Međimurje County", "Osječko-baranjska": "Osijek-Baranja County",
             "Požeško-slavonska": "Požega-Slavonia County", "Primorsko-goranska": "Primorje-Gorski Kotar County", "Sisačko-moslavačka": "Sisak-Moslavina County",
             "Splitsko-dalmatinska": "Split-Dalmatia County", "Varaždinska": "Varaždin County", "Virovitičko-podravska": "Virovitica-Podravina County",
             "Vukovarsko-srijemska": "Vukovar-Syrmia County", "Zadarska": "Zadar County", "Zagrebačka": "Zagreb County", "Šibensko-kninska": "Šibenik-Knin County"}

GLOSSARY = {   # term -> (words that select it, Croatian, English); the same wording as the Glossary page
    "coordinator": ("koordinator|coordinator", "Koordinator je organizacija koja podnosi prijavu, vodi projekt i prima grant. Hrvatska je koordinator kada je vodeća organizacija iz Hrvatske.",
                    "The coordinator is the organisation that submits the application, leads the project and receives the grant. Croatia is the coordinator when the lead organisation is Croatian."),
    "partner": ("partner", "Partner je organizacija koja sudjeluje u projektu koji netko drugi koordinira.", "A partner is an organisation that takes part in a project that someone else coordinates."),
    "erasmus+": (r"erasmus\+?\s*\??$|što je erasmus|sto je erasmus|what is erasmus", "Erasmus+ je program Europske unije za obrazovanje, osposobljavanje, mlade i sport. Ovaj atlas prikazuje samo njegova KA2 partnerstva (suradnja organizacija) s hrvatskim sudionicima, 2014.–2026.",
                  "Erasmus+ is the European Union programme for education, training, youth and sport. This atlas shows only its KA2 partnerships (cooperation between organisations) with Croatian participants, 2014–2026."),
    "ka2": (r"ka\s?2|ka\s?1|partnerstv|partnership", "KA1 su mobilnosti pojedinaca (učenje u inozemstvu), a KA2 suradnja organizacija i razmjena dobrih praksi kroz partnerstva. Ovaj atlas prikazuje samo KA2.",
            "KA1 is mobility of individuals (learning abroad) and KA2 is cooperation between organisations and the exchange of good practice through partnerships. This atlas shows KA2 only."),
    "call year": ("godina poziva|call year", "Godina poziva je godina natječaja na kojem je projekt odabran. Godina 2026. još traje, pa je prikazana kao nepotpuna.",
                  "The call year is the year of the call in which the project was selected. 2026 is still running, so it is shown as incomplete."),
    "grant": ("grant|potpor|vrijednost projekt|project value", "Vrijednost projekta je okvirni iznos bespovratnih sredstava dodijeljen projektu pri odabiru. Bilježi se po projektu i ne dijeli se među partnere.",
              "Project value is the indicative amount awarded to the project at selection. It is recorded per project and is not split between partners."),
    "good practice": ("dobra praksa|dobre prakse|good practice", "Dobra praksa je oznaka koju Europska komisija dodjeljuje projektima izdvojenima kao primjeri. Nije ocjena kvalitete projekata bez te oznake.",
                      "Good practice is a label the European Commission gives to projects it picks out as examples. It is not a quality rating of projects without the label."),
    "coverage": ("pokrivenost|coverage", "Pokrivenost škola je udio osnovnih i srednjih škola u županiji koje su sudjelovale u barem jednom KA2 projektu. Škole su s registrom povezane prema nazivu i poštanskom broju, pa je udio procjena.",
                 "School coverage is the share of primary and secondary schools in a county that took part in at least one KA2 project. Schools are matched to the register by name and postcode, so the share is an estimate."),
}


@dataclass
class ToolResult:
    tool: str
    args: dict
    rows: list[dict] = field(default_factory=list)
    citations: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)       # caveats the answer must carry (measure names, partial year, estimates)

    def as_dict(self) -> dict:
        return {"tool": self.tool, "args": self.args, "rows": self.rows, "citations": self.citations, "notes": self.notes}


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return 0.0, 0.0
    p, d = k / n, 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return max(0.0, c - h), min(1.0, c + h)


def _fold(s: str) -> str:
    return " ".join(strip_diacritics(s or "").lower().replace("-", " ").split())


def _tokens(s: str) -> list[str]:
    n = norm_name(s) or ""
    return [t for t in n.split() if t not in _SMALL]


def _tok_match(a: str, b: str) -> bool:
    """Same word, allowing Croatian case endings (metkovic / metkovicu): equal, or one is a prefix of the other (>= 5 letters)."""
    if a == b:
        return True
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    return len(short) >= 5 and long_.startswith(short) and len(long_) - len(short) <= 3


def _prefix_match(a: str, b: str) -> bool:
    """Same word or the same word plus a short ending (pismenost / pismenosti); a changed ending (uporaba / uporabi) is not enough."""
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    return a == b or (len(short) >= 5 and long_.startswith(short) and len(long_) - len(short) <= 2)


def _stem_match(a: str, b: str) -> bool:
    """Croatian/English word forms that differ only in the last letters (nasilje / nasilju, skill / skills): same stem of the first n-2 letters."""
    if a == b:
        return True
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    if len(short) >= 4 and long_.startswith(short) and len(long_) - len(short) <= 2:        # rano / ranom, skill / skills
        return True
    sa, sb = (a[:-2] if len(a) >= 6 else a), (b[:-2] if len(b) >= 6 else b)
    return sa == sb


class Toolbox:
    def __init__(self, db_path: Optional[Path] = None):
        self.con = duckdb.connect(str(db_path or DB_PATH), read_only=True)
        self._local = threading.local()                  # one cursor per thread: a DuckDB connection refuses overlapping calls
        self._names: Optional[list[tuple[str, str, Optional[str], str]]] = None
        self._sem: Any = None                            # concept name vectors, loaded on first use: (ids, matrix) or False when not available
        self._embed: Any = None
        self._qvec: dict[str, Any] = {}
        self._counties = {r[0]: r[1] for r in self._cur().execute("select stem, label from county").fetchall()}

    # ------------------------------------------------------------------ helpers
    def _cur(self):
        c = getattr(self._local, "cur", None)
        if c is None:
            c = self._local.cur = self.con.cursor()
        return c

    def _rows(self, sql: str, params: Optional[list] = None) -> list[dict]:
        cur = self._cur().execute(sql, params or [])
        names = [d[0] for d in cur.description]
        return [dict(zip(names, r)) for r in cur.fetchall()]

    def resolve_county(self, text: str) -> Optional[str]:
        """County stem from free text in either language / with or without diacritics and case endings, or None."""
        t = _fold(text)
        if t in ("zagreb", "grad zagreb", "city of zagreb"):
            return "Grad Zagreb"
        if re.search(r"\b(grad zagreb|gradu zagrebu|grada zagreba|gradom zagrebom|city of zagreb)\b", t):      # the city, not the county of Zagreb and not the university
            return "Grad Zagreb"
        for stem, en in EN_COUNTY.items():                  # English names: Split-Dalmatia, Istria, Varaždin County
            if stem != "Grad Zagreb" and re.search(rf"\b{re.escape(_fold(en.replace(' County', '')))}\b", t):
                return stem
        best = None
        for stem in self._counties:
            s = _fold(stem)
            if s == "grad zagreb":
                continue
            if s[:-2] in t and (best is None or len(s) > len(_fold(best))):
                best = stem
        if best is None:                                   # a town name ("Dubrovnik županija", "Pula") when it sits in one county only
            towns = self._rows("select distinct county from place where county is not null and lower(strip_accents(town)) = ?", [t.split(" zupan")[0].strip()])
            if len(towns) == 1:
                best = towns[0]["county"]
        return best

    def _town_index(self):
        """(folded town, display name, pattern for the town and its Croatian case forms) for towns that have organisations, longest names first."""
        if getattr(self, "_towns", None) is None:
            rows = self._rows("select lower(strip_accents(town)) key, town, count(*) n from organisation where town is not null and trim(town) <> '' group by 1, 2")
            best = {}
            for r in rows:
                k = r["key"].replace("-", " ").strip()
                nice = r["town"] if not r["town"].isupper() else r["town"].title()
                if k not in best or r["n"] > best[k][1]:
                    best[k] = (nice, r["n"])
            out = []
            for k, (nice, _n) in best.items():
                if len(k) < 3 or k in ("grad zagreb",):
                    continue
                if k[-1] in "aeiou":
                    alts = [k[:-1] + e for e in ("a", "e", "i", "u", "o", "om", "ama", "")]
                else:
                    alts = [k + e for e in (("", "a", "u", "om", "i") if len(k) <= 4 else ("", "a", "u", "e", "om", "i", "ima"))]
                    if k.endswith("ar"):                                       # Zadar -> Zadra, Zadru
                        alts += [k[:-2] + "r" + e for e in ("a", "u", "om")]
                if k.endswith("ka"):                                           # Rijeka -> Rijeci
                    alts.append(k[:-2] + "ci")
                out.append((k, nice, re.compile(r"(?<![a-z0-9])(" + "|".join(re.escape(a) for a in alts) + r")(?![a-z0-9])")))
            out.sort(key=lambda x: -len(x[0]))
            self._towns = out
        return self._towns

    def _town_hits(self, text: str) -> list[tuple[int, str, str]]:
        """(position, key, name) of towns in the text; names of four letters or fewer (Vis, Bol, Pula) must be written with a capital letter."""
        t = _fold(text)
        plain = " ".join(strip_diacritics(text or "").replace("-", " ").split())
        hits = []
        for k, nice, pat in self._town_index():
            m = pat.search(t)
            if not m:
                continue
            if len(k) <= 4:
                caps = re.search(r"(?<![A-Za-z0-9])" + re.escape(k[0].upper() + k[1:-1] if k[-1] in "aeiou" else k[0].upper() + k[1:]) + r"[a-z]{0,2}(?![A-Za-z0-9])", plain)
                if not caps:
                    continue
            hits.append((m.start(), k, nice))
        return hits

    def resolve_town(self, text: str) -> Optional[str]:
        """Town name (as written in the register) found in free text with Croatian case endings, or None. Zagreb is left to the county logic."""
        hits = self._town_hits(text)
        return max(hits, key=lambda h: len(h[1]))[2] if hits else None

    def count_towns(self, text: str) -> int:
        """How many different towns the text names (a question comparing two towns is not a single-town question)."""
        keys = [h[1] for h in self._town_hits(text)]
        return len([k for k in keys if not any(k != o and k in o for o in keys)])

    def resolve_towns(self, text: str) -> list[str]:
        """Every town named in the text, in the order they appear (a town whose name sits inside a longer matched name is dropped)."""
        hits = self._town_hits(text)
        keys = [h[1] for h in hits]
        return [nice for _pos, k, nice in sorted(hits) if not any(k != o and k in o for o in keys)]

    def town_compare(self, towns: list[str], period: str = "all") -> ToolResult:
        """Organisations, projects and coordinated projects of two or more towns side by side."""
        res = ToolResult("town_compare", {"towns": towns, "period": period})
        for town in towns:
            one = self.town_organisations(town, period, limit=1)
            if one.rows:
                s = one.rows[0]
                res.rows.append({"town": s["town"], "organisations": s["organisations"], "projects": s["projects"], "coordinated": s["coordinated"],
                                 "top_organisation": one.rows[1]["name"] if len(one.rows) > 1 else None})
                res.citations += one.citations
        res.notes.append("a project with organisations from two towns counts in both; organisations are placed in a town by the address in the EU export")
        return res

    def _town_org_ids(self, town: str) -> list[str]:
        key = _fold(town)
        return [r["org_id"] for r in self._rows("select org_id from organisation where replace(lower(strip_accents(town)), '-', ' ') = ?", [key])]

    def town_organisations(self, town: str, period: str = "all", limit: int = 8) -> ToolResult:
        """KA2 organisations of one town: how many, in how many projects, and the most active ones."""
        res = ToolResult("town_organisations", {"town": town, "period": period, "limit": limit})
        if period != "all" and period not in PERIODS:
            res.notes.append("unknown period")
            return res
        ids = self._town_org_ids(town)
        if not ids:
            res.notes.append("unknown town")
            return res
        pw, params = ("", []) if period == "all" else (" and x.period = ?", [period])
        ph = ",".join("?" * len(ids))
        s = self._rows(f"select count(distinct x.org_id) organisations, count(distinct x.project_id) projects, "
                       f"count(distinct case when x.role = 'coordinator' then x.project_id end) coordinated from participation x where x.org_id in ({ph}){pw}", ids + params)[0]
        reg = self._rows(f"select count(*) n from institution where replace(lower(strip_accents(town)), '-', ' ') = ?", [_fold(town)])[0]["n"]
        top = self._rows(f"select o.org_id, o.name, count(distinct x.project_id) projects, count(distinct case when x.role = 'coordinator' then x.project_id end) coordinated "
                         f"from participation x join organisation o using (org_id) where x.org_id in ({ph}){pw} group by 1, 2 order by 3 desc, 2 limit ?", ids + params + [limit])
        county = self._rows("select county from organisation where org_id = ?", [ids[0]])[0]["county"]
        res.rows = [{"summary": True, "town": town, "county": county, "organisations": s["organisations"], "projects": s["projects"], "coordinated": s["coordinated"], "registry_institutions": reg}] + \
                   [{"org_id": r["org_id"], "name": r["name"], "projects": r["projects"], "coordinated": r["coordinated"]} for r in top]
        res.citations = [f"org:{r['org_id']}" for r in top]
        res.notes.append("organisations are placed in a town by the address in the EU export; a project with organisations from two towns counts in both; "
                         "registry_institutions = schools and kindergartens of the town in the school register, whether or not they took part")
        return res

    def _name_index(self):
        """(search name, id, org_id or None, source) for organisations (with aliases) and registry institutions."""
        if self._names is None:
            idx = []
            for r in self._rows("select org_id, name from organisation"):
                idx.append((r["name"], r["org_id"], r["org_id"], "organisation"))
            for r in self._rows("select org_id, name_raw name from org_alias"):
                idx.append((r["name"], r["org_id"], r["org_id"], "organisation"))
            for r in self._rows("select inst_id, name, org_id from institution where register_kind <> 'higher_education'"):
                idx.append((r["name"], r["inst_id"], r["org_id"], "registry"))
            self._names = idx
        return self._names

    # ------------------------------------------------------------------ tools
    def find_organisation(self, query: str, limit: int = 5) -> ToolResult:
        """Organisations (and registry schools that never took part) matching a name, best first. Several close
        scores with different organisations means the question is ambiguous and the answer should ask which one."""
        q = _tokens(query)
        res = ToolResult("find_organisation", {"query": query, "limit": limit})
        if not q:
            res.notes.append("empty query")
            return res
        scored: dict[str, tuple[float, str, Optional[str], str, str]] = {}
        for name, key, org_id, source in self._name_index():
            n = _tokens(name)
            if not n:
                continue
            hit = sum(1 for t in q if any(_tok_match(t, u) for u in n))
            cover = hit / len(q)
            if cover < 0.75:
                continue
            score = cover + 0.5 * (hit / len(n)) - (0.01 if source == "registry" else 0)
            ident = org_id or key
            if ident not in scored or score > scored[ident][0]:
                scored[ident] = (score, name, org_id, source, key)
        best = sorted(scored.values(), key=lambda x: -x[0])[:limit]
        for score, name, org_id, source, key in best:
            if org_id:
                o = self._rows("select o.org_id, o.name, o.town, o.county, coalesce(v.projects, 0) projects, coalesce(v.coordinated, 0) coordinated "
                               "from organisation o left join v_org_ka2 v on v.org_id = o.org_id and v.period = 'all' where o.org_id = ?", [org_id])[0]
                res.rows.append({**o, "score": round(score, 2), "matched_name": name})
                res.citations.append(f"org:{org_id}")
            else:                                   # a registry school with no KA2 participation
                i = self._rows("select inst_id, name, town, county from institution where inst_id = ?", [key])[0]
                res.rows.append({"org_id": None, "inst_id": i["inst_id"], "name": i["name"], "town": i["town"], "county": i["county"],
                                 "projects": 0, "coordinated": 0, "score": round(score, 2), "matched_name": name})
        if not res.rows:
            res.notes.append("no organisation or registry school with that name")
        elif len(res.rows) > 1 and res.rows[0]["score"] - res.rows[1]["score"] < 0.2:
            res.notes.append("ambiguous: several organisations match about equally well")
        return res

    def find_organisation_in_text(self, text: str, limit: int = 5) -> ToolResult:
        """Organisations whose whole name (two or more words) occurs in a question, longest name first. Used because a small
        router model often copies the name badly; the question text itself is the reliable source."""
        q = _tokens(text)
        res = ToolResult("find_organisation", {"query": text, "limit": limit, "mode": "in_text"})
        found: dict[str, tuple[float, str, Optional[str], str, str]] = {}
        for name, key, org_id, source in self._name_index():
            n = _tokens(name)
            if len(n) < 2 or not all(any(_tok_match(t, u) for u in q) for t in n):
                continue
            score = len(n) - (0.01 if source == "registry" else 0)
            ident = org_id or key
            if ident not in found or score > found[ident][0]:
                found[ident] = (score, name, org_id, source, key)
        best = sorted(found.values(), key=lambda x: -x[0])[:limit]
        for score, name, org_id, source, key in best:
            res.rows.append(self._org_row(score, name, org_id, key))
            if org_id:
                res.citations.append(f"org:{org_id}")
        if not res.rows:
            res.notes.append("no organisation or registry school with that name")
        elif len(res.rows) > 1 and res.rows[0]["score"] - res.rows[1]["score"] < 0.5:
            res.notes.append("ambiguous: several organisations match about equally well")
        return res

    def _org_row(self, score: float, name: str, org_id: Optional[str], key: str) -> dict:
        if org_id:
            o = self._rows("select o.org_id, o.name, o.town, o.county, coalesce(v.projects, 0) projects, coalesce(v.coordinated, 0) coordinated "
                           "from organisation o left join v_org_ka2 v on v.org_id = o.org_id and v.period = 'all' where o.org_id = ?", [org_id])[0]
            return {**o, "score": round(score, 2), "matched_name": name}
        i = self._rows("select inst_id, name, town, county from institution where inst_id = ?", [key])[0]
        return {"org_id": None, "inst_id": i["inst_id"], "name": i["name"], "town": i["town"], "county": i["county"],
                "projects": 0, "coordinated": 0, "score": round(score, 2), "matched_name": name}

    def organisation_profile(self, org_id: str) -> ToolResult:
        res = ToolResult("organisation_profile", {"org_id": org_id})
        o = self._rows("select * from organisation where org_id = ?", [org_id])
        if not o:
            res.notes.append("unknown organisation")
            return res
        o = o[0]
        per = {r["period"]: r for r in self._rows("select * from v_org_ka2 where org_id = ?", [org_id])}
        projects = self._rows("""select p.project_id, p.call_year, p.title, p.action_type, x.role, p.status, p.good_practice,
                                        split_part(p.countries, ',', 1) lead_country
                                 from participation x join project p using (project_id) where x.org_id = ?
                                 order by p.call_year desc, p.project_id""", [org_id])
        countries: dict[str, int] = {}
        for r in self._rows("select p.countries from participation x join project p using (project_id) where x.org_id = ?", [org_id]):
            for c in set((r["countries"] or "").split(",")):
                if c and c != "HR":
                    countries[c] = countries.get(c, 0) + 1
        tot = per.get("all", {})
        res.rows.append({
            "org_id": org_id, "name": o["name"], "town": o["town"], "county": o["county"], "type": o["eu_org_type"],
            "projects": tot.get("projects", 0), "coordinated": tot.get("coordinated", 0), "partner_only": tot.get("partner_only", 0),
            "projects_2014_2020": per.get("2014-2020", {}).get("projects", 0), "projects_2021_2027": per.get("2021-2027", {}).get("projects", 0),
            "grants_coordinated_eur": tot.get("grants_coordinated_eur"), "value_involved_eur": tot.get("value_involved_eur"),
            "good_practice": sum(1 for p in projects if p["good_practice"]),
            "partner_countries": sorted(countries.items(), key=lambda kv: (-kv[1], kv[0])),
            "coordinated_projects": [p for p in projects if p["role"] == "coordinator"],
            "recent_projects": projects[:10]})
        res.citations = [f"org:{org_id}"] + [f"project:{p['project_id']}" for p in projects]
        res.notes.append("grants_coordinated_eur = full grants of projects it coordinates; value_involved_eur = full grants of all projects it takes part in "
                         "(grants are per project, not split between partners)")
        return res

    def similar_organisations(self, org_id: str, limit: int = 4) -> ToolResult:
        """Same kind of institution in the same county, same town first; no distances (there are no coordinates)."""
        res = ToolResult("similar_organisations", {"org_id": org_id, "limit": limit})
        me = self._rows("select inst_id, town, county, register_kind from institution where org_id = ?", [org_id])
        if not me:
            res.notes.append("organisation is not a registry school or kindergarten")
            return res
        me = me[0]
        rows = self._rows("""select i.inst_id, i.org_id, i.name, i.town, coalesce(v.projects, 0) projects
                             from institution i left join v_org_ka2 v on v.org_id = i.org_id and v.period = 'all'
                             where i.county = ? and i.register_kind = ? and i.inst_id <> ?""", [me["county"], me["register_kind"], me["inst_id"]])
        rows.sort(key=lambda r: (r["town"] != me["town"], -r["projects"], r["name"]))
        res.rows = rows[:limit]
        res.citations = [f"org:{r['org_id']}" for r in res.rows if r["org_id"]]
        return res

    def county_stats(self, county: str, period: str = "all") -> ToolResult:
        res = ToolResult("county_stats", {"county": county, "period": period})
        stem = self.resolve_county(county)
        if not stem or period not in PERIODS:
            res.notes.append("unknown county" if not stem else "unknown period")
            return res
        r = self._rows("select * from v_county_ka2 where county = ? and period = ?", [stem, period])
        if r:
            res.rows.append({**r[0], "label": self._counties[stem]})
        top = self._rows("select org_id, org_name, projects, coordinated from v_org_ka2 where county = ? and period = ? "
                         "order by projects desc, org_name limit 5", [stem, period])
        res.rows.append({"top_organisations": top})
        res.citations = [f"county:{stem}"] + [f"org:{t['org_id']}" for t in top]
        res.notes.append("projects_involved = projects with an organisation from here (each once); grants_coordinated_eur = full grants of projects coordinated from here; "
                         "value_involved_eur = full grants of all projects involved in (never add across counties); organisations counted by county of registered postcode")
        return res

    def glossary(self, text: str) -> ToolResult:
        res = ToolResult("glossary", {"text": text})
        low = text.lower()
        for term, (pat, hr, en) in GLOSSARY.items():
            if re.search(pat, low):
                res.rows.append({"term": term, "hr": hr, "en": en})
                res.citations.append(f"glossary:{term.replace(' ', '-')}")
                break
        if not res.rows:
            res.notes.append("no such term in the glossary")
        return res

    def year_projects(self, year: int) -> ToolResult:
        """KA2 projects of one call year that have a Croatian participant (each once), and how many of them Croatia coordinated."""
        res = ToolResult("year_projects", {"year": year})
        r = self._rows("select count(distinct project_id) projects, count(distinct case when role = 'coordinator' then project_id end) coordinated "
                       "from participation x where call_year = ?", [year])
        res.rows = [{"year": year, "projects": r[0]["projects"], "coordinated": r[0]["coordinated"]}] if r and r[0]["projects"] else []
        if not res.rows:
            res.notes.append("no projects with a Croatian participant in that call year")
        elif year == 2026:
            res.notes.append("2026 selection is not complete")
        return res

    def year_series(self, question: str = "") -> ToolResult:
        """KA2 projects with a Croatian participant per call year, with the figures that questions about trends ask for (highest, lowest, biggest rise and fall, averages)."""
        res = ToolResult("year_series", {"question": question})
        rows = self._rows("select call_year as yr, count(distinct project_id) projects, count(distinct case when role = 'coordinator' then project_id end) coordinated "
                          "from participation group by call_year order by call_year", [])
        res.rows = [{"year": int(r["yr"]), "projects": r["projects"], "coordinated": r["coordinated"]} for r in rows]
        full = [r for r in res.rows if r["year"] <= 2025]               # 2026 is not a complete selection: it is shown, never ranked
        if len(full) >= 2:
            by = {r["year"]: r["projects"] for r in full}
            steps = [(y, by[y] - by[y - 1]) for y in sorted(by) if y - 1 in by]
            hi, lo = max(full, key=lambda r: r["projects"]), min(full, key=lambda r: r["projects"])
            up, down = max(steps, key=lambda s: s[1]), min(steps, key=lambda s: s[1])
            avg = lambda a, b: round(sum(by[y] for y in range(a, b + 1) if y in by) / max(1, len([y for y in range(a, b + 1) if y in by])), 1)
            res.rows.append({"summary": True, "highest_year": hi["year"], "highest_projects": hi["projects"], "lowest_year": lo["year"], "lowest_projects": lo["projects"],
                             "biggest_rise_year": up[0], "biggest_rise": up[1], "biggest_fall_year": down[0], "biggest_fall": down[1],
                             "average_2014_2020": avg(2014, 2020), "average_2021_2025": avg(2021, 2025)})
        q = question.lower()
        ys = sorted({int(y) for y in re.findall(r"20[12]\d", q)})
        by_all = {r["year"]: r["projects"] for r in res.rows if not r.get("summary")}
        if res.rows and res.rows[-1].get("summary"):
            sm = res.rows[-1]
            if re.search(r"(najve[ćc]\w*|biggest|largest|greatest)( \w+)? (pad|fall|drop|decline|decrease)|pad broja|(godina|year) .*(pad|fall|drop)", q):
                sm["focus"] = "fall"
            elif re.search(r"(najve[ćc]\w*|biggest|largest|greatest)( \w+)? (rast|rise|growth|increase)|međugodišnj\w* rast|year[- ]on[- ]year (rise|growth)", q):
                sm["focus"] = "rise"
            elif re.search(r"prosje[čc]an|average|mean", q) and len(ys) == 2 and all(y in by_all for y in ys):
                span = [by_all[y] for y in range(ys[0], ys[1] + 1) if y in by_all]
                sm["focus"], sm["avg_from"], sm["avg_to"], sm["avg"] = "average", ys[0], ys[1], round(sum(span) / len(span), 1)
            elif re.search(r"koliko .*(vi[šs]e|manje|more|fewer)|how many (more|fewer)|razlik", q) and len(ys) == 2 and all(y in by_all for y in ys):
                sm["focus"], sm["diff_a"], sm["diff_b"], sm["diff_a_projects"], sm["diff_b_projects"], sm["diff"] = "diff", ys[1], ys[0], by_all[ys[1]], by_all[ys[0]], by_all[ys[1]] - by_all[ys[0]]
            elif re.search(r"najmanje|least|fewest|lowest", q):
                sm["focus"] = "lowest"
            elif re.search(r"najvi[šs]e|most|highest|largest|najve[ćc]", q):
                sm["focus"] = "highest"
            elif re.search(r"prije 2020|before 2020|rast[ao]|rasl[ao]|grew|grow|increas|declin|padal|trend|changed|mijenjao", q):
                pre = [by_all[y] for y in range(2014, 2021) if y in by_all]
                sm["focus"] = "trend"
                sm["trend_first"], sm["trend_last"], sm["trend_peak_year"] = by_all[2014], by_all[2020], 2020
                after = [by_all[y] for y in range(2021, 2026) if y in by_all]
                sm["trend_after_min"], sm["trend_after_max"] = min(after), max(after)
        res.notes.append("2026 selection is not complete: it is not used for highest, lowest, rise, fall or averages")
        return res

    def project_values(self, question: str = "", period: str = "all") -> ToolResult:
        """Grants of the KA2 projects with a Croatian participant: average, median, most and least expensive, and how many are above an amount.

        The grant is the full grant of the project, not the Croatian share. The question decides which figure leads (focus) and the amount for "more than N"."""
        res = ToolResult("project_values", {"question": question, "period": period})
        if period not in PERIODS:
            res.notes.append("unknown period")
            return res
        q = question.lower()
        pw, params = ("", []) if period == "all" else (" and x.period = ?", [period])
        base = "from project p where p.project_id in (select x.project_id from participation x where 1 = 1" + pw + ") and p.grant_eur > 0"
        s = self._rows("select count(*) projects, sum(grant_eur) total, avg(grant_eur) average, median(grant_eur) median, "
                       "avg(case when hr_coordinated then grant_eur end) average_coordinated, count(case when hr_coordinated then 1 end) coordinated, "
                       "count(case when grant_not_comparable then 1 end) not_comparable " + base, params)[0]
        row = {k: (round(v, 0) if isinstance(v, float) else v) for k, v in s.items()}
        row["summary"] = True
        m = re.search(r"(\d+(?:[.,]\d+)?)\s*(milijun\w*|mil\b|million\w*|tisu[ćc]\w*|thousand|k\b)", q)
        amount = None
        if m:
            num = float(m.group(1).replace(",", "."))
            amount = num * (1e6 if m.group(2).startswith(("mil", "milijun")) else 1e3)
        elif re.search(r"milijun|million", q):
            amount = 1e6
        else:
            m2 = re.search(r"\b(\d{1,3}(?:[.,\s]\d{3})+)\b", q)
            amount = float(re.sub(r"[.,\s]", "", m2.group(1))) if m2 else None
        if re.search(r"najskuplj|most expensive|highest|largest|biggest|najve[ćc]u|najvi[šs]u", q):
            row["focus"] = "max"
        elif re.search(r"najjeftinij|cheapest|lowest|smallest|najmanj\w*", q):
            row["focus"] = "min"
        elif amount and re.search(r"ve[ćc]u|više od|vise od|iznad|preko|more than|above|over|exceed|manju|manje od|ispod|less than|below|under", q):
            row["focus"] = "below" if re.search(r"manju|manje od|ispod|less than|below|under", q) else "above"
        elif re.search(r"prosje[čc]n|average|mean", q):
            row["focus"] = "average_coordinated" if re.search(r"koordin|coordinat", q) else "average"
        elif re.search(r"medijan|median", q):
            row["focus"] = "median"
        if row.get("focus") in ("above", "below"):
            op = ">" if row["focus"] == "above" else "<"
            row["amount"] = amount
            row["count_threshold"] = self._rows("select count(*) n " + base + f" and p.grant_eur {op} ?", params + [amount])[0]["n"]
        if row.get("focus") in ("max", "min"):
            order = "desc" if row["focus"] == "max" else "asc"
            top = self._rows("select p.project_id, p.title, p.call_year, p.grant_eur, p.hr_coordinated " + base + f" order by p.grant_eur {order}, p.project_id limit 3", params)
            res.rows = [row] + [{"rank": i, "project_id": r["project_id"], "title": r["title"], "call_year": r["call_year"], "grant_eur": r["grant_eur"], "hr_coordinated": r["hr_coordinated"]}
                                for i, r in enumerate(top, 1)]
            res.citations = [f"project:{r['project_id']}" for r in top]
        else:
            res.rows = [row]
        res.notes.append("the grant is the full grant of each project, not the Croatian share; projects with a grant of 0 are left out; a few grants are flagged as not comparable between programmes")
        return res

    def county_project(self, county: str, n: int = 1, order: str = "first", period: str = "all") -> ToolResult:
        """The n-th KA2 project (by call year, then project id) with an organisation from the county, counted from the start ("first") or the end ("last"), with its topics."""
        res = ToolResult("county_project", {"county": county, "n": n, "order": order, "period": period})
        stem = self.resolve_county(county)
        if not stem or period not in PERIODS or order not in ("first", "last") or n < 1:
            res.notes.append("unknown county" if not stem else "bad argument")
            return res
        where, params = ["o.county = ?"], [stem]
        if period != "all":
            where.append("p.period = ?"); params.append(period)
        rows = self._rows("select p.project_id, p.call_year, p.period, p.action_type, p.title, p.topics_raw, p.grant_eur from project p "
                          "where p.project_id in (select x.project_id from participation x join organisation o using (org_id) where " + " and ".join(where).replace("p.period", "x.period") + ") "
                          "order by p.call_year " + ("asc" if order == "first" else "desc") + ", p.project_id " + ("asc" if order == "first" else "desc"), params)
        total = len(rows)
        if n > total:
            res.notes.append(f"the county has only {total} projects")
            res.rows = [{"total": total, "label": self._counties[stem], "n": n}]
            return res
        r = rows[n - 1]
        concepts = self._rows("select g.kind, g.label_en, l.label_hr from project_concept pc join graph_node g on g.node_id = pc.concept_id "
                              "left join concept_label l on l.node_id = g.node_id where pc.project_id = ? order by g.n_projects desc", [r["project_id"]])
        same_year = sum(1 for x in rows if x["call_year"] == r["call_year"])
        res.rows = [{**r, "rank": n, "order": order, "total": total, "label": self._counties[stem], "same_year": same_year,
                     "topics": [x.strip() for x in (r["topics_raw"] or "").replace(";", ",").split(",") if x.strip()],
                     "concept_topics": [[c["label_en"], c["label_hr"]] for c in concepts if c["kind"] == "topic"],
                     "concept_other": [[c["label_en"], c["label_hr"]] for c in concepts if c["kind"] != "topic"][:5]}]
        res.citations = [f"project:{r['project_id']}", f"county:{stem}"]
        res.notes.append("projects are ordered by call year, then project id: several projects share a call year, so 'first' means first in that order, not by date of submission; "
                         "a project with organisations from several counties is in each of them")
        return res

    def top_organisations(self, county: Optional[str] = None, period: str = "all", limit: int = 5, role: str = "any") -> ToolResult:
        """Organisations ranked by the KA2 projects they take part in (role "any") or only by those they coordinate (role "coordinator")."""
        res = ToolResult("top_organisations", {"county": county, "period": period, "limit": limit, "role": role})
        stem = self.resolve_county(county) if county else None
        if county and not stem:
            res.notes.append("unknown county")
            return res
        where, params = ["period = ?"], [period]
        if stem:
            where.append("county = ?"); params.append(stem)
        res.rows = self._rows(f"select org_id, org_name, county, projects, coordinated from v_org_ka2 where {' and '.join(where)} "
                              f"order by {'coordinated' if role == 'coordinator' else 'projects'} desc, projects desc, org_name limit {int(limit)}", params)
        res.citations = [f"org:{r['org_id']}" for r in res.rows]
        res.notes.append("coordinated = KA2 projects the organisation leads; projects = all KA2 projects it takes part in (as coordinator or partner)" if role == "coordinator"
                         else "projects = KA2 projects the organisation takes part in (as coordinator or partner)")
        return res

    def national_stats(self, period: str = "all", question: str = "") -> ToolResult:
        res = ToolResult("national_stats", {"period": period, "question": question})
        if period not in PERIODS:
            res.notes.append("unknown period")
            return res
        r = self._rows("select * from v_hr_participation where period = ?", [period])[0]
        types = self._rows("""select m.org_class, count(*) projects_coordinated
                              from participation x join organisation o using (org_id) join org_class_map m on m.eu_org_type = o.eu_org_type
                              where x.role = 'coordinator' and (? = 'all' or x.period = ?) group by 1 order by 2 desc""", [period, period])
        eu = sum(self._cur().execute(f"select count(*) from {t}").fetchone()[0]
                 for t in ("stg_ka2_2014_2020", "stg_ka2_2021_2027")
                 if period == "all" or t.endswith(period.replace("-", "_")))
        by_period = {x["period"]: x["projects"] for x in self._rows("select period, projects from v_hr_participation")}
        res.rows = [{**r, "projects_2014_2020": by_period.get("2014-2020"), "projects_2021_2027": by_period.get("2021-2027"), "eu_ka2_projects": eu, "share_of_eu_ka2_projects": r["projects"] / eu,
                     "coordinating_organisation_classes": types}]
        orgs = self._rows("select count(distinct org_id) n from participation where (? = 'all' or period = ?)", [period, period])[0]["n"]
        res.rows[0]["organisations"] = orgs
        res.rows[0]["coordinated_share_of_projects"] = r["coordinated"] / r["projects"] if r["projects"] else 0
        q = question.lower()
        if re.search(r"koliko (ukupno |je )?(razli[čc]itih )?(hrvatskih )?(organizacija|ustanova)|how many (different |croatian )*organi[sz]ations", q):
            res.rows[0]["focus"] = "organisations"
        elif re.search(r"postotak|udio|posto|percent|share|proportion", q) and re.search(r"koordin|coordinat", q):
            res.rows[0]["focus"] = "coordinated_share"
        elif re.search(r"koliko .*koordin|how many .*coordinat|u koliko .*koordinator", q):
            res.rows[0]["focus"] = "coordinated"
        res.notes.append("projects with at least one Croatian participant; 2026 selection is not complete; organisation classes group the EU organisation types (ngo includes civil society organisations at European level)")
        return res

    def county_ranking(self, period: str = "all", limit: int = 5, order_by: str = "projects") -> ToolResult:
        """Counties by number of KA2 projects with a participant from the county (a project with organisations from two counties counts in both)."""
        res = ToolResult("county_ranking", {"period": period, "limit": limit, "order_by": order_by})
        if period not in PERIODS:
            res.notes.append("unknown period")
            return res
        rows = self._rows("select county, projects_involved, projects_coordinated, organisations from v_county_ka2 where period = ? "
                          "order by " + ("organisations desc, projects_involved desc" if order_by == "organisations" else "projects_involved desc") + ", county", [period])
        for i, r in enumerate(rows, 1):
            r["rank"], r["label"], r["counties_total"] = i, self._counties.get(r["county"], r["county"]), len(rows)
        res.rows = rows[:limit]
        res.citations = [f"county:{r['county']}" for r in res.rows]
        res.notes.append("projects_involved = projects with an organisation from the county (each once); a project with organisations from two counties counts in both, so the counts do not add up to the national total")
        return res

    def partner_countries(self, period: str = "all", limit: int = 8, org_id: Optional[str] = None, town: Optional[str] = None) -> ToolResult:
        """Countries whose organisations are partners in the same KA2 projects as Croatian organisations (projects counted once per country)."""
        res = ToolResult("partner_countries", {"period": period, "limit": limit, "org_id": org_id, "town": town})
        if period != "all" and period not in PERIODS:
            res.notes.append("unknown period")
            return res
        where, params = ("", []) if period == "all" else (" where period = ?", [period])
        subject = None
        if org_id or town:
            ids = [org_id] if org_id else self._town_org_ids(town)
            if not ids:
                res.notes.append("unknown organisation or town")
                return res
            subject = (self._rows("select name from organisation where org_id = ?", [org_id])[0]["name"] if org_id else town)
            ph = ",".join("?" * len(ids))
            where += (" and " if where else " where ") + f"project_id in (select project_id from participation where org_id in ({ph}))"
            params = params + ids
        rows = self._rows(f"select countries from project{where}", params)
        from collections import Counter
        cc = Counter(c for r in rows for c in set((r["countries"] or "").split(",")) if c and c != "HR")
        total = len(rows)
        res.rows = [{"country": c, "projects": n, "rank": i, "countries_total": len(cc), "projects_total": total, **({"subject": subject} if subject else {})} for i, (c, n) in enumerate(cc.most_common(limit), 1)]
        res.notes.append("number of KA2 projects with a Croatian participant that also have a partner from the country; country codes are Erasmus+ codes (EL = Greece)")
        return res

    def country_compare(self, codes: list[str]) -> ToolResult:
        """KA2 projects coordinated from the named countries in the whole EU export (both programme periods), with each country's rank."""
        res = ToolResult("country_compare", {"countries": codes})
        rows = self._rows("""select c country, sum(n) coordinated_projects from (
                               select "Coordinator's country" c, count(*) n from stg_ka2_2014_2020 where "Coordinator's country" is not null group by 1
                               union all
                               select "Coordinator's country" c, count(*) n from stg_ka2_2021_2027 where "Coordinator's country" is not null group by 1) group by 1 order by 2 desc""")
        for i, r in enumerate(rows, 1):
            r["rank"], r["countries_total"] = i, len(rows)
            r["coordinated_projects"] = int(r["coordinated_projects"])
        res.rows = [r for c in codes for r in rows if r["country"] == c]
        res.notes.append("count of KA2 projects coordinated from each country in the EU export, 2014-2026 together; country codes are Erasmus+ codes (EL = Greece)")
        return res

    def country_stats(self, period: str = "2021-2027", limit: int = 10) -> ToolResult:
        """Coordinating countries across all KA2 projects in the EU export (not only Croatian ones)."""
        res = ToolResult("country_stats", {"period": period, "limit": limit})
        t = {"2014-2020": "stg_ka2_2014_2020", "2021-2027": "stg_ka2_2021_2027"}.get(period)
        if not t:
            res.notes.append("period must be 2014-2020 or 2021-2027")
            return res
        rows = self._rows(f"""select "Coordinator's country" country, count(*) coordinated_projects from {t}
                              where "Coordinator's country" is not null group by 1 order by 2 desc""")
        for i, r in enumerate(rows, 1):
            r["rank"] = i
        hr = next((r for r in rows if r["country"] == "HR"), None)
        if hr:
            hr["countries_total"] = len(rows)
            hr["period"] = period
        res.rows = rows[:limit] + ([hr] if hr and hr["rank"] > limit else [])
        res.notes.append("count of KA2 projects coordinated from each country in the EU export; country codes are Erasmus+ codes (EL = Greece)")
        return res

    def success_rate(self, period: str = "2021-2027", year: Optional[int] = None, action: str = "KA2", sector: Optional[str] = None) -> ToolResult:
        """Applications received and projects contracted in Croatia per call year (tablica 3 and 9), with rate = contracted / applications.
        2014-2020 has one figure for all actions together (the published table has no KA split); 2021-2027 has KA1 and KA2."""
        res = ToolResult("success_rate", {"period": period, "year": year, "action": action, "sector": sector})
        if period not in ("2014-2020", "2021-2027"):
            res.notes.append("period must be 2014-2020 or 2021-2027")
            return res
        act = "all" if period == "2014-2020" else action
        where, params = ["period = ?", "action = ?"], [period, act]
        if year:
            where.append("call_year = ?"); params.append(int(year))
        if sector:
            where.append("lower(sector) like ?"); params.append(f"%{sector.lower()}%")
        res.rows = self._rows(f"""select call_year, sum(applications) applications, sum(contracted) contracted,
                                         sum(contracted) * 1.0 / nullif(sum(applications), 0) rate
                                  from application_result where {' and '.join(where)} group by 1 order by 1""", params)
        for r in res.rows:
            r["rate"] = r["rate"] if r["rate"] is not None else 0.0
        if len(res.rows) > 1:
            a, c = sum(r["applications"] for r in res.rows), sum(r["contracted"] for r in res.rows)
            res.rows.append({"call_year": "total", "applications": a, "contracted": c, "rate": c / a if a else 0.0})
        if not res.rows:
            res.notes.append("no application figures for those arguments")
        res.notes.append("applications received by the Croatian National Agency and projects contracted; rate = contracted / applications. "
                         + ("2014-2020: all actions together (no KA split is published). " if period == "2014-2020" else f"{act} only. ")
                         + "The 2026 call is partial.")
        return res

    def coverage(self, county: Optional[str] = None, school_type: str = "both", period: str = "all", role: str = "any") -> ToolResult:
        """Share of schools with at least one KA2 partnership, Wilson 95 % range, and the number expected from the national rate."""
        res = ToolResult("coverage", {"county": county, "school_type": school_type, "period": period, "role": role})
        if school_type not in SCHOOL_TYPES or period not in PERIODS or role not in ("any", "coordinator"):
            res.notes.append("bad argument")
            return res
        sel = self._rows("select * from coverage_scenario where period = ? and role = ?", [period, role])
        nat = {}
        for ty in {r["school_type"] for r in sel}:
            rs = [r for r in sel if r["school_type"] == ty]
            nat[ty] = sum(r["participating"] for r in rs) / sum(r["institutions"] for r in rs)
        types = SCHOOL_TYPES[school_type]
        rows = []
        for stem, label in self._counties.items():
            cs = [r for r in sel if r["county"] == stem and r["school_type"] in types]
            n, k = sum(r["institutions"] for r in cs), sum(r["participating"] for r in cs)
            lo, hi = wilson(k, n)
            rows.append({"county": stem, "label": label, "schools": n, "participating": k, "not_yet": n - k,
                         "rate": k / n if n else 0.0, "rate_low": lo, "rate_high": hi,
                         "expected": sum(r["institutions"] * nat[r["school_type"]] for r in cs)})
        N, K = sum(r["schools"] for r in rows), sum(r["participating"] for r in rows)
        national = K / N if N else 0.0
        for r in rows:
            r["vs_national"] = "above" if r["rate_low"] > national else "below" if r["rate_high"] < national else "not clearly different"
        rows.sort(key=lambda r: -r["rate"])
        stem = self.resolve_county(county) if county else None
        if county and not stem:
            res.notes.append("unknown county")
            return res
        res.rows = [{"national": {"schools": N, "participating": K, "rate": national}}] + ([r for r in rows if r["county"] == stem] if stem else rows)
        res.citations = [f"county:{stem}"] if stem else []
        res.notes.append("matches of KA2 participants to the school registry are by name and postcode; the 51 non-exact matches were checked by hand. "
                         "KA1 mobility is not included, so a school active only in KA1 counts as not taking part. "
                         "Expected = schools x national rate for the school type. Primary and secondary schools only unless school_type=kindergarten.")
        return res

    def search_projects(self, text: str, period: str = "all", limit: int = 8) -> ToolResult:
        """Keyword search over titles and summaries (accent- and case-insensitive); the embedding side comes later."""
        res = ToolResult("search_projects", {"text": text, "period": period, "limit": limit})
        words = [w for w in _fold(text).split() if len(w) >= 3]
        if not words:
            res.notes.append("empty query")
            return res
        score = " + ".join("(case when strip_accents(lower(title)) like ? then 3 else 0 end + case when strip_accents(lower(summary)) like ? then 1 else 0 end)" for _ in words)
        params: list[Any] = [x for w in words for x in (f"%{w}%", f"%{w}%")]
        where = "" if period == "all" else " and period = ?"
        if where:
            params.append(period)
        res.rows = self._rows(f"select project_id, call_year, title, action_type, left(summary, 300) summary_start, ({score}) score from project "
                              f"where ({score}) > 0{where} order by score desc, call_year desc limit {int(limit)}",
                              params[: 2 * len(words)] + params[: 2 * len(words)] + params[2 * len(words):])
        res.citations = [f"project:{r['project_id']}" for r in res.rows]
        if not res.rows:
            res.notes.append("no project matches those words")
        res.notes.append("keyword match only; summaries are in the language they were submitted in")
        return res

    # ------------------------------------------------------------------ concepts (steps 51, 52, 60)
    _CONCEPT_STOP = {"koji", "koje", "koja", "kakve", "kakvi", "koliko", "projekti", "projekata", "projekte", "projekt", "erasmus", "ka2", "najcesce", "cesto",
                     "what", "which", "projects", "project", "how", "many", "about", "with", "used", "most", "common", "commonly", "usually", "that", "does",
                     "kako", "sto", "gdje", "tipicni", "tipicne", "tipican", "uobicajeni", "uobicajene", "metode", "metoda", "aktivnosti", "rezultati", "ciljne", "skupine", "pristupi", "pristup", "koriste", "koristi", "rade", "problemi", "znamo", "approaches", "approach", "outputs", "target", "groups", "know", "tell", "methods", "activities", "results", "pristupili", "proizveli", "navedi", "primjere", "primjeri", "postoji", "hrvatski", "hrvatskim", "hrvatske", "sudionicima", "sudjeluju", "rjesavanje", "rjesavaju", "kojim", "bave", "najcesce", "zajedno", "examples", "example", "croatian", "croatia", "address", "produce", "dobre", "prakse", "practice", "good", "ponovnoj", "ovim", "ovom", "ovih", "ovog"}

    SEM_MIN, SEM_BAND = 0.67, 0.05      # a concept must be this close in meaning, and within SEM_BAND of the best one (checked on Croatian and English questions)

    def _semantic(self, text: str, kind: Optional[str], limit: int) -> list[dict]:
        """Concepts whose name is close in meaning to `text` (embedding search over concept_vec); [] when the vectors or the embedding model are not available."""
        import numpy as np
        if self._sem is None:
            try:
                got = self._cur().execute("select node_id, vec from concept_vec").fetchall()
                m = np.array([g[1] for g in got], dtype=np.float32)
                self._sem = ([g[0] for g in got], m / np.linalg.norm(m, axis=1, keepdims=True)) if len(got) else False
            except Exception:
                self._sem = False
        if not self._sem:
            return []
        words = [w for w in re.findall(r"\w+", text.lower()) if _fold(w) not in self._CONCEPT_STOP and len(w) >= 3]
        text = " ".join(words) if words else text                # the topic words only: a whole question ("how many projects deal with ...") dilutes the meaning
        key = text.strip().lower()
        if key not in self._qvec:
            try:
                if self._embed is None:
                    from atlas.config import make_embeddings
                    self._embed = make_embeddings()
                v = np.array(self._embed.embed_query(text), dtype=np.float32)
                self._qvec[key] = v / np.linalg.norm(v)
            except Exception:
                return []                                  # no embedding model on this machine: the word search alone
            if len(self._qvec) > 500:
                self._qvec.pop(next(iter(self._qvec)))
        ids, mat = self._sem
        sim = mat @ self._qvec[key]
        order = np.argsort(-sim)
        info = {r["node_id"]: r for r in self._rows("select n.node_id, n.kind, n.label_en, l.label_hr, n.n_projects from graph_node n left join concept_label l using(node_id)")}
        out = []
        for i in order[:40]:
            r = info.get(ids[i])
            if not r or (kind and r["kind"] != kind):
                continue
            if not out and sim[i] < self.SEM_MIN:
                break
            if sim[i] < out[0]["similarity"] - self.SEM_BAND if out else False:
                break
            out.append({**r, "similarity": round(float(sim[i]), 2)})
            if len(out) >= limit:
                break
        return out

    def search_concepts(self, text: str, kind: Optional[str] = None, limit: int = 5) -> ToolResult:
        """Concepts (approaches, target groups, outputs, problems) and EU topics whose English or Croatian name matches the words of `text`."""
        res = ToolResult("search_concepts", {"text": text, "kind": kind, "limit": limit})
        words = [w for w in re.findall(r"[a-z0-9]+", _fold(text)) if len(w) >= 4 and w not in self._CONCEPT_STOP]
        if not words:
            res.notes.append("no searchable words")
            return self._by_meaning(res, text, kind, limit)
        rows = self._rows("select n.node_id, n.kind, n.label_en, l.label_hr, n.n_projects from graph_node n left join concept_label l using(node_id)"
                          + (" where n.kind = ?" if kind else ""), [kind] if kind else [])
        tokset = [set(re.findall(r"[a-z0-9]+", _fold(r["label_en"]))) | set(re.findall(r"[a-z0-9]+", _fold(r["label_hr"] or ""))) for r in rows]
        vocab = set().union(*tokset) if tokset else set()
        n_asked = len(words)
        kept = [w for w in words if any(_stem_match(w, t) for t in vocab)]        # words no concept name contains are noise ("znamo", "tell")
        lone_guess = len(kept) == 1 and len(words) > 1                              # one word left out of several: only an exact word counts, not a similar ending
        words = kept
        if not words:
            res.notes.append("no concept matches those words")
            return self._by_meaning(res, text, kind, limit)
        df = {w: sum(1 for toks in tokset if any(_stem_match(w, t) for t in toks)) for w in words}     # in how many concept names each word occurs
        scored = []
        for r, toks in zip(rows, tokset):
            matched = [w for w in words if any((_prefix_match(w, t) if lone_guess else _stem_match(w, t)) for t in toks)]
            hit = len(matched)
            if len(words) <= 2:        # every specific word must match; a word that occurs in many concept names ("obrazovanje") may be missing
                ok = hit >= 1 and all(w in matched or df[w] > 20 for w in words)
            else:
                ok = hit >= 2 and hit / len(words) >= 0.3
            if ok:
                scored.append((hit / len(words), r["n_projects"], r))
        scored.sort(key=lambda x: (-x[0], -x[1]))
        if scored and (scored[0][0] < 1.0 or lone_guess or len(kept) < n_asked):          # only some of the words matched: a concept close in meaning is the better answer if there is one
            by_meaning = self._by_meaning(ToolResult("search_concepts", dict(res.args)), text, kind, limit)
            if by_meaning.rows:
                return by_meaning
        res.rows = [x[2] for x in scored[:limit]]
        res.citations = [f"concept:{r['node_id']}" for r in res.rows]
        if not res.rows:
            res.notes.append("no concept matches those words")
            return self._by_meaning(res, text, kind, limit)
        return res

    def _by_meaning(self, res: "ToolResult", text: str, kind: Optional[str], limit: int) -> "ToolResult":
        res.rows = self._semantic(text, kind, limit)
        if res.rows:
            res.notes = ["matched by meaning, not by the words of the question"]
            res.args["by_meaning"] = True
            res.citations = [f"concept:{r['node_id']}" for r in res.rows]
        return res

    def _node_projects(self, node_id: str) -> list[str]:
        if node_id.startswith("TOP:"):
            return [r["project_id"] for r in self._rows("select project_id from project_topic where topic = ?", [node_id[4:]])]
        return [r["project_id"] for r in self._rows(
            "select distinct pc.project_id from project_concept pc left join concept_theme t using(concept_id) where coalesce(t.theme_id, pc.concept_id) = ?", [node_id])]

    def concept_profile(self, node_id: str, focus: Optional[str] = None) -> ToolResult:
        """One concept: how many projects use it, by period, the share of good-practice projects against all projects, the community it belongs
        to, the concepts that most often occur in the same projects (by kind), and example projects."""
        res = ToolResult("concept_profile", {"node_id": node_id, "focus": focus})
        n = self._rows("select n.*, l.label_hr from graph_node n left join concept_label l using(node_id) where n.node_id = ?", [node_id])
        if not n:
            res.notes.append("unknown concept")
            return res
        n = n[0]
        total = self._rows("select count(distinct project_id) c from project_concept")[0]["c"]
        gp_all = self._rows("select avg(good_practice::int) a from project where project_id in (select project_id from project_concept)")[0]["a"]
        rel = self._rows("""select o.node_id, o.kind, o.label_en, l.label_hr, e.n_projects together, e.lift, e.cosine from graph_edge e
                            join graph_node o on o.node_id = case when e.a = ? then e.b else e.a end left join concept_label l on l.node_id = o.node_id
                            where e.a = ? or e.b = ? order by e.cosine desc""", [node_id, node_id, node_id])
        related = {}
        for kd in ("target_group", "approach", "output", "problem", "topic"):
            related[kd] = [{k: (round(v, 2) if isinstance(v, float) else v) for k, v in r.items() if k != "kind" and k != "cosine"} for r in rel if r["kind"] == kd][:(6 if kd == focus else 4)]
        pids = self._node_projects(node_id)
        ex = self._rows(f"select project_id, call_year, title from project where project_id in ({','.join('?' * len(pids))}) order by good_practice desc, results_available desc, call_year desc limit 3", pids) if pids else []
        comm = self._rows("select community_id, label_en, n_projects, reportable from community where community_id = ?", [n["community_id"]]) if n["community_id"] else []
        res.rows = [{"node_id": node_id, "kind": n["kind"], "label_en": n["label_en"], "label_hr": n["label_hr"], "n_projects": n["n_projects"],
                     "share_of_projects": n["n_projects"] / total, "n_2014_2020": n["n_2014_2020"], "n_2021_2027": n["n_2021_2027"],
                     "good_practice": n["good_practice"], "good_practice_rate": n["gp_rate"], "good_practice_low": n["gp_lo"], "good_practice_high": n["gp_hi"],
                     "good_practice_rate_all": gp_all, "community": comm[0] if comm else None, "related": related, "examples": ex}]
        res.citations = [f"concept:{node_id}"] + [f"project:{x['project_id']}" for x in ex]
        res.notes += ["concepts were extracted from project summaries by a language model, so counts are lower bounds and wording varies",
                      "'together' means the same projects, not cause and effect; good practice is the EU's label, not a measure of success of this method"]
        return res

    def common_concepts(self, kind: str = "approach", period: str = "all", limit: int = 8) -> ToolResult:
        """The concepts of one kind used by most projects (nationally, or in one period)."""
        res = ToolResult("common_concepts", {"kind": kind, "period": period, "limit": limit})
        if kind not in ("approach", "target_group", "output", "problem", "topic"):
            res.notes.append("bad argument")
            return res
        col = {"all": "n_projects", "2014-2020": "n_2014_2020", "2021-2027": "n_2021_2027"}.get(period)
        if not col:
            res.notes.append("unknown period")
            return res
        total = self._rows("select count(distinct project_id) c from project_concept" if period == "all" else
                           "select count(distinct pc.project_id) c from project_concept pc join project p using(project_id) where p.period = ?", [] if period == "all" else [period])[0]["c"]
        res.rows = self._rows(f"select n.node_id, n.label_en, l.label_hr, n.{col} projects, n.{col} * 1.0 / {int(total)} share from graph_node n left join concept_label l using(node_id) "
                              f"where n.kind = ? and n.{col} > 0 order by n.{col} desc, n.label_en limit {int(limit)}", [kind])
        res.citations = [f"concept:{r['node_id']}" for r in res.rows]
        res.notes += [f"share = projects using the concept / {total} projects with extracted concepts",
                      "concepts were extracted from project summaries by a language model, so counts are lower bounds and wording varies"]
        return res

    def community_overview(self, community_id: Optional[str] = None) -> ToolResult:
        """The groups of concepts that tend to occur in the same projects: the larger ones with their typical approaches, target groups, outputs and topics."""
        res = ToolResult("community_overview", {"community_id": community_id})
        rows = self._rows("select * from community where reportable" + (" and community_id = ?" if community_id else "") + " order by n_projects desc", [community_id] if community_id else [])
        for r in rows:
            prof = json.loads(r.pop("profile"))
            r.update({k: prof[k][:3] for k in ("top_approach", "top_target_group", "top_output", "top_topic")})
            r["families"] = prof["families"]
        hr = {r["label_en"]: r["label_hr"] for r in self._rows("select n.label_en, l.label_hr from graph_node n join concept_label l using(node_id)")}
        for r in rows:
            for k in ("top_approach", "top_target_group", "top_output", "top_topic"):
                r[k + "_hr"] = [hr.get(x, x) for x in r[k]]
        res.rows = rows[: (1 if community_id else 6)]
        if not res.rows:
            res.notes.append("no such community")
        res.notes.append("a community is a group of concepts that often occur in the same projects; it is found by a graph algorithm and is not an official category; a project can match several")
        return res

    def concept_trends(self, kind: str = "approach", limit: int = 6) -> ToolResult:
        """Concepts of one kind whose share of projects grew or fell between 2014-2020 and 2021-2027 by at least 1.5 times (each used by 10+ projects in the stronger period)."""
        res = ToolResult("concept_trends", {"kind": kind, "limit": limit})
        if kind not in ("approach", "target_group", "output", "problem", "topic"):
            res.notes.append("bad argument")
            return res
        per = {r["period"]: r["c"] for r in self._rows("select p.period, count(distinct pc.project_id) c from project_concept pc join project p using(project_id) group by 1")}
        p1, p2 = per.get("2014-2020", 0), per.get("2021-2027", 0)
        rows = self._rows("select n.node_id, n.label_en, l.label_hr, n.n_2014_2020 n1, n.n_2021_2027 n2 from graph_node n left join concept_label l using(node_id) where n.kind = ? and n.n_projects >= 20", [kind])
        for r in rows:
            r["share_2014_2020"], r["share_2021_2027"] = r["n1"] / p1, r["n2"] / p2
        up = sorted((r for r in rows if r["n2"] >= 10 and r["share_2021_2027"] >= 1.5 * r["share_2014_2020"]), key=lambda r: -r["n2"])[:limit]
        down = sorted((r for r in rows if r["n1"] >= 10 and r["share_2014_2020"] >= 1.5 * r["share_2021_2027"]), key=lambda r: -r["n1"])[:limit]
        res.rows = [{**r, "trend": "growing"} for r in up] + [{**r, "trend": "fading"} for r in down]
        res.citations = [f"concept:{r['node_id']}" for r in res.rows]
        res.notes += ["share = projects using the concept / projects of that period with extracted concepts",
                      "part of a change can come from the call design (for example school exchange partnerships were mainly a 2014-2020 action type), not from the field",
                      "concepts were extracted from project summaries by a language model, so counts are lower bounds"]
        if not res.rows:
            res.notes.append("no change of that size")
        return res

    def connected_concepts(self, limit: int = 8) -> ToolResult:
        """The concepts that occur together with the most other concepts, and those whose neighbours lie in the most different groups of concepts (bridges)."""
        res = ToolResult("connected_concepts", {"limit": limit})
        rows = self._rows(f"""with e as (select a node, b other from graph_edge union all select b, a from graph_edge)
                              select n.node_id, n.kind, n.label_en, l.label_hr, n.n_projects, count(*) neighbours, count(distinct o.community_id) filter (where o.community_id <> '') groups
                              from e join graph_node n on n.node_id = e.node join graph_node o on o.node_id = e.other left join concept_label l on l.node_id = n.node_id
                              group by 1, 2, 3, 4, 5 order by neighbours desc limit {int(limit)}""")
        bridges = self._rows(f"""with e as (select a node, b other from graph_edge union all select b, a from graph_edge)
                              select n.node_id, n.kind, n.label_en, l.label_hr, n.n_projects, count(*) neighbours, count(distinct o.community_id) filter (where o.community_id <> '') groups
                              from e join graph_node n on n.node_id = e.node join graph_node o on o.node_id = e.other left join concept_label l on l.node_id = n.node_id
                              where n.kind <> 'topic' group by 1, 2, 3, 4, 5 having count(*) >= 20 order by groups desc, neighbours desc limit {int(limit)}""")
        res.rows = [{**r, "measure": "neighbours"} for r in rows] + [{**r, "measure": "groups"} for r in bridges]
        res.citations = [f"concept:{r['node_id']}" for r in res.rows]
        res.notes += ["neighbours = other concepts that occur in the same projects more often than chance; groups = how many different groups of concepts those neighbours belong to",
                      "popular concepts have many neighbours because they appear in many projects"]
        return res


TOOLS = ["find_organisation", "organisation_profile", "similar_organisations", "county_stats", "top_organisations",
         "national_stats", "country_stats", "coverage", "search_projects", "success_rate",
         "search_concepts", "concept_profile", "common_concepts", "community_overview", "concept_trends", "connected_concepts"]

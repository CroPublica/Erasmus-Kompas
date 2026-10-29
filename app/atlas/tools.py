"""Read-only, deterministic tools for the Ask page (plan section 5).

The model never writes SQL and never does arithmetic: it picks a tool and arguments, and phrases the result. Every tool
returns a ToolResult whose rows carry the identifiers that may be cited (`project:<id>`, `org:<id>`, `county:<stem>`).
Money is always one of three named measures (grants_coordinated_eur, value_involved_eur, participations); they are never
added together across places. Nothing here returns a personal name or an e-mail address (the data has none).

Not built yet: tools that need the concept layer (search_concepts, solutions_for_problem, neighbours, shortest_path,
community_summary, concept_card, concept_centrality), success_rate (tablica 8/9), and the embedding side of search_projects.
"""
from __future__ import annotations

import math
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


class Toolbox:
    def __init__(self, db_path: Optional[Path] = None):
        self.con = duckdb.connect(str(db_path or DB_PATH), read_only=True)
        self._names: Optional[list[tuple[str, str, Optional[str], str]]] = None
        self._counties = {r[0]: r[1] for r in self.con.execute("select stem, label from county").fetchall()}

    # ------------------------------------------------------------------ helpers
    def _rows(self, sql: str, params: Optional[list] = None) -> list[dict]:
        cur = self.con.execute(sql, params or [])
        names = [d[0] for d in cur.description]
        return [dict(zip(names, r)) for r in cur.fetchall()]

    def resolve_county(self, text: str) -> Optional[str]:
        """County stem from free text in either language / with or without diacritics and case endings, or None."""
        t = _fold(text)
        if t in ("zagreb", "grad zagreb", "city of zagreb"):
            return "Grad Zagreb"
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

    def top_organisations(self, county: Optional[str] = None, period: str = "all", limit: int = 5) -> ToolResult:
        res = ToolResult("top_organisations", {"county": county, "period": period, "limit": limit})
        stem = self.resolve_county(county) if county else None
        if county and not stem:
            res.notes.append("unknown county")
            return res
        where, params = ["period = ?"], [period]
        if stem:
            where.append("county = ?"); params.append(stem)
        res.rows = self._rows(f"select org_id, org_name, county, projects, coordinated from v_org_ka2 where {' and '.join(where)} "
                              f"order by projects desc, org_name limit {int(limit)}", params)
        res.citations = [f"org:{r['org_id']}" for r in res.rows]
        res.notes.append("projects = KA2 projects the organisation takes part in (as coordinator or partner)")
        return res

    def national_stats(self, period: str = "all") -> ToolResult:
        res = ToolResult("national_stats", {"period": period})
        if period not in PERIODS:
            res.notes.append("unknown period")
            return res
        r = self._rows("select * from v_hr_participation where period = ?", [period])[0]
        types = self._rows("""select m.org_class, count(*) projects_coordinated
                              from participation x join organisation o using (org_id) join org_class_map m on m.eu_org_type = o.eu_org_type
                              where x.role = 'coordinator' and (? = 'all' or x.period = ?) group by 1 order by 2 desc""", [period, period])
        eu = sum(self.con.execute(f"select count(*) from {t}").fetchone()[0]
                 for t in ("stg_ka2_2014_2020", "stg_ka2_2021_2027")
                 if period == "all" or t.endswith(period.replace("-", "_")))
        by_period = {x["period"]: x["projects"] for x in self._rows("select period, projects from v_hr_participation")}
        res.rows = [{**r, "projects_2014_2020": by_period.get("2014-2020"), "projects_2021_2027": by_period.get("2021-2027"), "eu_ka2_projects": eu, "share_of_eu_ka2_projects": r["projects"] / eu,
                     "coordinating_organisation_classes": types}]
        res.notes.append("projects with at least one Croatian participant; 2026 selection is not complete; organisation classes group the EU organisation types (ngo includes civil society organisations at European level)")
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


TOOLS = ["find_organisation", "organisation_profile", "similar_organisations", "county_stats", "top_organisations",
         "national_stats", "country_stats", "coverage", "search_projects"]

"""Step 70: export what the website shows as static JSON in site/src/data/.

Registry part only (organisations, counties, coverage). Concept and graph exports are added after steps 50-60.
Every figure carries its measure name; e-mail addresses are never exported (the registries are loaded without them).

Output
  meta.json       counts, generation date, source note
  orgs.json       one row per organisation that took part in a KA2 project (index and search)
  orgs_full.json  per-organisation page data, keyed by org_id (used at build time to create pages)
  counties.json   21 counties: KA2 figures per period, coverage per school type
  coverage.json   counts per county, school type, period and role (the coverage page filters)
  projects_full.json  per-project page data (summary, countries, topics, Croatian participants)
"""
import json
import sys
from collections import Counter
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import connect  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "site" / "src" / "data"


def rows(con, sql, params=None):
    cur = con.execute(sql, params or [])
    names = [d[0] for d in cur.description]
    return [dict(zip(names, r)) for r in cur.fetchall()]


def write(name, obj):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  {name:16s} {(OUT / name).stat().st_size / 1024:8.0f} KB")


def main():
    con = connect(read_only=True)

    # ---- organisations
    per = {}
    for r in rows(con, "select * from v_org_ka2"):
        per.setdefault(r["org_id"], {})[r["period"]] = {
            k: r[k] for k in ("projects", "coordinated", "partner_only", "grants_coordinated_eur",
                              "value_involved_eur", "first_year", "last_year")}
    orgs = {o["org_id"]: o for o in rows(con, "select org_id, name, postcode, town, county, eu_org_type, register_kind, "
                                              "identity_basis, n_name_variants from organisation")}
    topics = {}
    for r in rows(con, "select x.org_id, t.topic, count(distinct t.project_id) n from participation x "
                       "join project_topic t using(project_id) group by 1, 2"):
        topics.setdefault(r["org_id"], []).append((r["n"], r["topic"]))
    parts = {}
    for r in rows(con, """select x.org_id, x.project_id, x.role, p.period, p.call_year, p.action_type, p.title, p.status,
                                 p.good_practice, p.grant_eur, p.countries, p.family
                          from participation x join project p using(project_id) order by p.call_year desc, p.project_id"""):
        parts.setdefault(r["org_id"], []).append(r)

    index, full = [], {}
    for oid, byp in per.items():
        o = orgs.get(oid)
        if not o:
            continue
        tot = byp.get("all", {})
        plist = parts.get(oid, [])
        cc = Counter(c for p in plist for c in set((p["countries"] or "").split(",")) if c and c != "HR")
        top = sorted(topics.get(oid, []), reverse=True)[:8]
        index.append({"id": oid, "name": o["name"], "town": o["town"], "county": o["county"], "type": o["eu_org_type"],
                      "projects": tot.get("projects", 0), "coordinated": tot.get("coordinated", 0)})
        full[oid] = {
            **o, "periods": byp,
            "good_practice": sum(1 for p in plist if p["good_practice"]),
            "countries": cc.most_common(),
            "topics": [[t, n] for n, t in top],
            "projects": [{"id": p["project_id"], "year": p["call_year"], "title": p["title"], "type": p["action_type"],
                          "role": p["role"], "status": p["status"], "good_practice": bool(p["good_practice"]),
                          "lead": (p["countries"] or "").split(",")[0] or None, "period": p["period"]} for p in plist],
        }
    index.sort(key=lambda r: (-r["projects"], r["name"]))
    write("orgs.json", index)
    pub = OUT.parent.parent / "public"
    pub.mkdir(exist_ok=True)
    (pub / "search.json").write_text(json.dumps([[o["id"], o["name"], o["town"] or ""] for o in index], ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # ---- similar organisations: same register kind in the same county, same town first (no coordinates, so no distances)
    inst = rows(con, """select i.inst_id, i.name, i.town, i.county, i.register_kind, i.org_id,
                               coalesce((select projects from v_org_ka2 v where v.org_id = i.org_id and v.period = 'all'), 0) projects
                        from institution i where i.register_kind in ('primary', 'secondary', 'primary,secondary', 'kindergarten') and i.county is not null""")
    by_county = {}
    for i in inst:
        by_county.setdefault((i["county"], i["register_kind"]), []).append(i)
    for oid, o in full.items():
        mine = next((i for i in inst if i["org_id"] == oid), None)
        if not mine:
            o["similar"] = []
            continue
        pool = [i for i in by_county[(mine["county"], mine["register_kind"])] if i["inst_id"] != mine["inst_id"]]
        pool.sort(key=lambda i: (i["town"] != mine["town"], -i["projects"], i["name"]))
        o["similar"] = [{"id": i["org_id"], "name": i["name"], "town": i["town"], "projects": i["projects"],
                         "same_town": i["town"] == mine["town"]} for i in pool[:4]]
        o["register_kind"] = mine["register_kind"]
    write("orgs_full.json", full)

    write("coverage.json", rows(con, "select period, role, county, school_type, institutions, participating from coverage_scenario"))

    pt = {}
    for r in rows(con, "select project_id, topic from project_topic"):
        pt.setdefault(r["project_id"], []).append(r["topic"])
    hp = {}
    for r in rows(con, "select x.project_id, x.org_id, o.name, x.role from participation x join organisation o using (org_id) order by x.role desc, o.name"):
        hp.setdefault(r["project_id"], []).append({"id": r["org_id"], "name": r["name"], "role": r["role"]})
    projs = {}
    for r in rows(con, "select project_id, period, call_year, action_type, family, title, summary, status, grant_eur, grant_not_comparable, "
                       "good_practice, results_available, management, countries from project"):
        projs[r["project_id"]] = {**r, "countries": [c for c in (r["countries"] or "").split(",") if c],
                                  "topics": pt.get(r["project_id"], []), "hr": hp.get(r["project_id"], [])}
    write("projects_full.json", projs)

    # ---- counties
    counties = {}
    for c in rows(con, "select stem, label from county"):
        counties[c["stem"]] = {"stem": c["stem"], "label": c["label"], "ka2": {}, "coverage": []}
    for r in rows(con, "select * from v_county_ka2"):
        if r["county"] in counties:
            counties[r["county"]]["ka2"][r["period"]] = {k: r[k] for k in r if k not in ("county", "period")}
    for r in rows(con, "select * from v_coverage"):
        if r["county"] in counties:
            counties[r["county"]]["coverage"].append({k: r[k] for k in r if k != "county"})
    write("counties.json", list(counties.values()))

    n_proj, n_coord = con.execute("select count(*), sum(hr_coordinated::int) from project").fetchone()
    write("meta.json", {"generated": date.today().isoformat(), "projects": n_proj, "coordinated": int(n_coord),
                        "organisations": len(index), "counties": len(counties),
                        "sources": "Erasmus+ Project Results Platform, KA2 exports 2014-2020 and 2021-2027; "
                                   "Croatian Agency for Mobility and EU Programmes (data.gov.hr); "
                                   "Ministry of Science and Education school registers"})
    con.close()


if __name__ == "__main__":
    main()

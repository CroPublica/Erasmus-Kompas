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
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import connect  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from atlas.tools import EN_COUNTY, Toolbox  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "site" / "src" / "data"


def rows(con, sql, params=None):
    cur = con.execute(sql, params or [])
    names = [d[0] for d in cur.description]
    return [dict(zip(names, r)) for r in cur.fetchall()]


def topic_labels_hr():
    """Croatian topic names: the owner's reviewed wording, else my draft (data/review/topic_labels_hr.csv)."""
    import csv
    with open(Path(__file__).resolve().parent.parent / "data" / "review" / "topic_labels_hr.csv", encoding="utf-8", newline="") as f:
        return {r["topic"]: (r["label_hr_reviewed"].strip() or r["label_hr_draft"].strip()) for r in csv.DictReader(f)}


EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")


def scrub(text):
    """E-mail addresses are not published (owner decision, 2026-10-29); applicants sometimes write one into their summary."""
    return EMAIL.sub("[e-mail removed]", text) if text else text


def write(name, obj):
    OUT.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    if name == "graph.json":      # the site writes British English (organisation); the concept labels come from the model with both spellings
        text = text.replace("organization", "organisation").replace("Organization", "Organisation")
    (OUT / name).write_text(text, encoding="utf-8")
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

    classes = dict(con.execute("select eu_org_type, org_class from org_class_map").fetchall())
    index, full = [], {}
    for oid, byp in per.items():
        o = orgs.get(oid)
        if not o:
            continue
        tot = byp.get("all", {})
        plist = parts.get(oid, [])
        cc = Counter(c for p in plist for c in set((p["countries"] or "").split(",")) if c and c != "HR")
        top = sorted(topics.get(oid, []), reverse=True)[:8]
        p1, p2 = byp.get("2014-2020", {}), byp.get("2021-2027", {})
        index.append({"id": oid, "name": o["name"], "town": o["town"], "county": o["county"], "type": o["eu_org_type"],
                      "cls": classes.get(o["eu_org_type"]),
                      "projects": tot.get("projects", 0), "coordinated": tot.get("coordinated", 0),
                      "p1": p1.get("projects", 0), "p2": p2.get("projects", 0), "c1": p1.get("coordinated", 0), "c2": p2.get("coordinated", 0)})
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
    pcon = {}                                      # project -> a few of its graph concepts (the specific ones used by 5+ projects), for links into the graph page
    if con.execute("select count(*) from information_schema.tables where table_name = 'graph_node'").fetchone()[0]:
        picked = {}
        for r in rows(con, """select pc.project_id, n.node_id, n.kind, n.n_projects from project_concept pc left join concept_theme th using (concept_id)
                              join graph_node n on n.node_id = coalesce(th.theme_id, pc.concept_id) where n.kind <> 'topic' group by all"""):
            picked.setdefault(r["project_id"], {}).setdefault(r["kind"], []).append((r["n_projects"], r["node_id"]))
        for pid, kinds in picked.items():
            pcon[pid] = [nid for kd in ("approach", "target_group", "output", "problem") for _, nid in sorted(kinds.get(kd, []))[:2]]
    hp = {}
    for r in rows(con, "select x.project_id, x.org_id, o.name, x.role from participation x join organisation o using (org_id) order by x.role desc, o.name"):
        hp.setdefault(r["project_id"], []).append({"id": r["org_id"], "name": r["name"], "role": r["role"]})
    projs = {}
    for r in rows(con, "select project_id, period, call_year, action_type, family, title, summary, status, grant_eur, grant_not_comparable, "
                       "good_practice, results_available, management, countries, results_card_url, project_website from project"):
        projs[r["project_id"]] = {**r, "summary": scrub(r["summary"]), "countries": [c for c in (r["countries"] or "").split(",") if c],
                                  "topics": pt.get(r["project_id"], []), "concepts": pcon.get(r["project_id"], []), "hr": hp.get(r["project_id"], [])}
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

    # ---- national overview (same figures the Ask tools give)
    tb = Toolbox()
    nat = {"periods": {}, "countries": {}}
    for per in ("all", "2014-2020", "2021-2027"):
        r = tb.national_stats(per).rows[0]
        nat["periods"][per] = {k: r[k] for k in ("projects", "coordinated", "eu_ka2_projects", "share_of_eu_ka2_projects", "value_involved_eur", "central_projects")}
        nat["periods"][per]["classes"] = r["coordinating_organisation_classes"]
        # how many of the coordinators are typed NGO in the EU export itself (the class count also fills blank types and adds European civil-society organisations)
        nat["periods"][per]["ngo_typed_in_eu_export"] = con.execute(
            "select count(*) from stg_hr_appearance where role = 'coordinator' and org_type like 'Non-governmental%'" + ("" if per == "all" else " and period = ?"),
            [] if per == "all" else [per]).fetchone()[0]
    for per in ("2014-2020", "2021-2027"):
        rows_ = tb.country_stats(per, limit=15).rows
        nat["countries"][per] = rows_
    write("national.json", nat)

    # ---- project index for the search page (titles, not summaries: the whole file is sent to the browser)
    pidx = rows(con, "select project_id id, title, call_year as yr, period, action_type as type_, status, good_practice as gp, countries, grant_not_comparable ncomp from project order by call_year desc, project_id")
    topics_of = {}
    for r in rows(con, "select project_id, topic from project_topic"):
        topics_of.setdefault(r["project_id"], []).append(r["topic"])
    for r in pidx:
        r["countries"] = [c for c in (r["countries"] or "").split(",") if c]
        r["topics"] = topics_of.get(r["id"], [])
        r["gp"] = bool(r["gp"])
        del r["ncomp"]
    (OUT.parent.parent / "public" / "projects.json").write_text(json.dumps(pidx, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  projects.json (public) {(OUT.parent.parent / 'public' / 'projects.json').stat().st_size / 1024:6.0f} KB")

    # ---- the search box of the pages: counties (c: stem, Croatian name, English name), organisations (o: id, name, town), projects (p: id, title, year)
    search = {"c": [[c["stem"], c["label"], EN_COUNTY.get(c["stem"], c["label"])] for c in counties.values()],
              "o": [[o["id"], o["name"], o["town"] or ""] for o in index],
              "p": [[r["id"], r["title"] or "", r["yr"]] for r in pidx]}
    (pub / "search.json").write_text(json.dumps(search, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  search.json            {(pub / 'search.json').stat().st_size / 1024:6.0f} KB  ({len(search['c'])} counties, {len(search['o'])} organisations, {len(search['p'])} projects)")

    # ---- topics over time: the labels as the source gives them for each period (no crosswalk); only names that occur in both
    # topic lists are continuous across the 2020/2021 break
    years = list(range(2014, 2027))
    per_year, seen = {y: 0 for y in years}, {}
    for yr, per, raw in con.execute("select call_year, period, topics_raw from project where topics_raw is not null").fetchall():
        names = {x.strip() for x in raw.split(";") if x.strip()}
        if not names or yr not in per_year:
            continue
        per_year[yr] += 1
        for nme in names:
            d = seen.setdefault(nme, {"counts": {}, "periods": set()})
            d["counts"][yr] = d["counts"].get(yr, 0) + 1
            d["periods"].add(per)
    hr_names = topic_labels_hr()
    write("topic_labels.json", hr_names)
    tops = []
    for nme, d in seen.items():
        old, new = "2014-2020" in d["periods"], "2021-2027" in d["periods"]
        tops.append({"name": nme, "hr": hr_names.get(nme), "scope": "both" if old and new else "old" if old else "new",
                     "counts": {str(y): d["counts"].get(y, 0) for y in years}, "total": sum(d["counts"].values())})
    tops.sort(key=lambda t: (-t["total"], t["name"]))
    write("topics_by_year.json", {"years": years, "projects_with_topics": {str(y): per_year[y] for y in years}, "topics": tops})

    # ---- concepts: the graph page and the methods page (steps 51, 52, 60). Nodes are indexed in the edge list to keep the file small.
    if con.execute("select count(*) from information_schema.tables where table_name = 'graph_node'").fetchone()[0]:
        tot = con.execute("select count(distinct project_id) from project_concept").fetchone()[0]
        per = dict(con.execute("select p.period, count(distinct pc.project_id) from project_concept pc join project p using(project_id) group by 1").fetchall())
        gp_all = con.execute("select avg(good_practice::int) from project where project_id in (select project_id from project_concept)").fetchone()[0]
        hr_of = dict(con.execute("select node_id, label_hr from concept_label").fetchall())
        gn = con.execute("select node_id, kind, label_en, n_projects, n_2014_2020, n_2021_2027, good_practice, gp_lo, gp_hi, community_id from graph_node "
                         "order by n_projects desc, node_id").fetchall()
        index_of = {r[0]: i for i, r in enumerate(gn)}
        comms = []
        names = {r[0]: [r[1], r[2]] for r in con.execute("select community_id, label_en, label_hr from community_name").fetchall()} \
            if con.execute("select count(*) from information_schema.tables where table_name = 'community_name'").fetchone()[0] else {}   # step 61, reviewed by the owner
        for r in rows(con, "select * from community where reportable order by n_projects desc"):
            prof = json.loads(r.pop("profile"))
            hr_by_en = {x[2]: hr_of.get(x[0]) for x in gn}
            comms.append({"id": r["community_id"], "name": names.get(r["community_id"]), "n": r["n_projects"], "share": r["share"], "p1": r["n_2014_2020"], "p2": r["n_2021_2027"], "gp": r["good_practice"],
                          "gp_lo": r["gp_lo"], "gp_hi": r["gp_hi"], "grant": r["median_grant"], "families": prof["families"],
                          **{k: [[x, hr_by_en.get(x)] for x in prof[k]] for k in ("top_approach", "top_target_group", "top_output", "top_problem", "top_topic")}})
        write("graph.json", {"projects": tot, "p1": per.get("2014-2020", 0), "p2": per.get("2021-2027", 0), "gp_rate_all": gp_all, "communities": comms,
                             "nodes": [[r[0], r[1], r[2], hr_of.get(r[0]), r[3], r[4], r[5], r[6], round(r[7], 3), round(r[8], 3), r[9] or ""] for r in gn],
                             "edges": [[index_of[a], index_of[b], n, round(l, 1)] for a, b, n, l in con.execute(
                                 "select a, b, n_projects, lift from graph_edge where a in (select node_id from graph_node) order by cosine desc").fetchall()]})

        # the Croatian organisations with the most projects on each graph concept (top 5), for the concept panel; counts are projects per organisation
        top_orgs = {}
        for r in con.execute("""
                with m as (select coalesce(th.theme_id, pc.concept_id) node_id, pc.project_id from project_concept pc left join concept_theme th using (concept_id)
                           union select 'TOP:' || topic, project_id from project_topic),
                c as (select m.node_id, x.org_id, count(distinct m.project_id) n from m join participation x using (project_id)
                      where m.node_id in (select node_id from graph_node) group by all),
                r as (select c.*, o.name, row_number() over (partition by c.node_id order by c.n desc, o.name) k, count(*) over (partition by c.node_id) norg from c join organisation o using (org_id))
                select node_id, org_id, name, n, norg from r where k <= 5 order by node_id, k""").fetchall():
            e = top_orgs.setdefault(r[0], {"n": r[4], "top": []})            # n = how many different organisations; top = the five with most projects
            e["top"].append([r[1], r[2], r[3]])
        write("concept_orgs.json", top_orgs)

    n_proj, n_coord = con.execute("select count(*), sum(hr_coordinated::int) from project").fetchone()
    write("meta.json", {"generated": date.today().isoformat(), "projects": n_proj, "coordinated": int(n_coord),
                        "organisations": len(index), "counties": len(counties),
                        "sources": "Erasmus+ Project Results Platform, KA2 exports 2014-2020 and 2021-2027; "
                                   "Croatian Agency for Mobility and EU Programmes (data.gov.hr); "
                                   "Ministry of Science, Education and Youth school registers"})
    con.close()


if __name__ == "__main__":
    main()

"""Combine the processed datasets into one knowledge-graph JSON file.

Output: Data/processed/knowledge_graph.json  ->  {"meta": ..., "nodes": [...], "edges": [...]}

Uses only the standard library (csv, json). Run from anywhere:
    python 22_build_knowledge_graph.py
"""
import csv
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

PROC = Path(__file__).resolve().parent.parent / "Data" / "processed"
OUT = PROC / "knowledge_graph.json"

nodes = {}   # id -> node dict
edges = []   # list of edge dicts
edge_keys = set()


def read(name):
    with open(PROC / name, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower().replace("đ", "d"))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", s)).strip()


def num(x):
    if x in (None, ""):
        return None
    f = float(x)
    return int(f) if f.is_integer() else f


def clean(d):
    return {k: v for k, v in d.items() if v not in (None, "")}


def add_node(nid, label, **props):
    if nid in nodes:
        for k, v in clean(props).items():
            nodes[nid].setdefault(k, v)
        return nodes[nid]
    nodes[nid] = {"id": nid, "label": label, **clean(props)}
    return nodes[nid]


def add_edge(src, rel, dst, **props):
    key = (src, rel, dst, json.dumps(props, sort_keys=True, default=str))
    if key in edge_keys:
        return
    edge_keys.add(key)
    edges.append({"source": src, "type": rel, "target": dst, **clean(props)})


def ref(label, name):
    nid = f"{label.lower()}:{name}"
    add_node(nid, label, name=name)
    return nid


# ---------------------------------------------------------------- institutions
reg = read("ustanove_registar.csv")
part = read("ustanove_erasmus_sudjelovanje.csv")
ka2p = {r["ID ustanove"]: r for r in read("ustanove_ka2_sudjelovanje.csv")}
assert len(reg) == len(part) == 2387
for a, b in zip(reg, part):  # same row order; guard against drift
    assert a["Naziv"] == b["Naziv"] and a["Vrsta registra"] == b["Vrsta registra"]

higher_by_name = {}
parent_of = []
for a, b in zip(reg, part):
    iid = "institution:" + b["ID ustanove"]
    k = ka2p[b["ID ustanove"]]
    if iid in nodes:  # 13 schools listed in two registers
        nodes[iid]["registers"].append(a["Vrsta registra"])
        continue
    add_node(
        iid, "Institution", name=a["Naziv"], registers=[a["Vrsta registra"]],
        address=a["Adresa"], postal_code=a["Poštanski broj"], place=a["Mjesto"],
        county=a["Županija"], school_code=a["Šifra ustanove"], mbu=a["MBU"],
        founder=a["Osnivač"], institution_type=a["Tip ustanove"],
        register_entry=a["Upisnik"], website=a["Web"],
        na_projects_2014_2020=num(b["Broj projekata 2014-2020"]),
        na_projects_2021_2027=num(b["Broj projekata 2021-2027"]),
        na_amount_eur_2014_2020=num(b["Iznos 2014-2020 (EUR)"]),
        na_amount_eur_2021_2027=num(b["Iznos 2021-2027 (EUR)"]),
        ka2_coordinator_2014_2020=num(k["KA2 koordinator 2014-2020"]),
        ka2_partner_2014_2020=num(k["KA2 partner 2014-2020"]),
        ka2_coordinator_2021_2027=num(k["KA2 koordinator 2021-2027"]),
        ka2_partner_2021_2027=num(k["KA2 partner 2021-2027"]),
    )
    if a["Vrsta registra"] == "Visoko učilište":
        higher_by_name[a["Naziv"]] = iid
    if a["Nadređena ustanova"]:
        parent_of.append((iid, a["Nadređena ustanova"]))

for iid, parent in parent_of:
    if parent in higher_by_name:
        add_edge(iid, "PART_OF", higher_by_name[parent])

for iid, n in list(nodes.items()):
    if n["label"] != "Institution":
        continue
    if n.get("place"):
        pid = ref("Place", n["place"])
        add_edge(iid, "LOCATED_IN", pid)
        if n.get("county"):
            add_edge(pid, "IN_COUNTY", ref("County", n["county"]))
    if n.get("county"):
        add_edge(iid, "IN_COUNTY", ref("County", n["county"]))
    if n.get("founder"):
        add_edge(iid, "FOUNDED_BY", ref("Founder", n["founder"]))

# ---------------------------------------------------------------- organisations
org_ids = {}  # (norm name, location key) -> organisation node id


def org_node(name, org_type, place, postal, linked_id, country="HR"):
    """Linked beneficiaries are the Institution node; the rest become Organisation nodes."""
    if linked_id:
        return "institution:" + linked_id
    key = (norm(name), postal or norm(place))
    if key not in org_ids:
        nid = f"organisation:{len(org_ids)}"
        org_ids[key] = nid
        add_node(nid, "Organisation", name=name, organisation_type=org_type,
                 place=place.title() if place else None, postal_code=postal, country=country)
        if place:
            add_edge(nid, "LOCATED_IN", ref("Place", place.title()))
    elif org_type:
        nodes[org_ids[key]].setdefault("organisation_type", org_type)
    return org_ids[key]


# ---------------------------------------------------------------- NA project lists
na = read("erasmus_registar_poveznice.csv")


def pkey(pid):  # same normalisation as the NA<->KA2 cross-check (report section 5.2)
    return re.sub(r"_\d+$", "", pid).replace("-", "")


na_key_to_id = {}
for r in na:
    pid = "project:" + r["Projektni broj"]
    amount = num(r["Iznos (EUR)"])
    if pid not in nodes:
        add_node(pid, "Project", project_id=r["Projektni broj"], period=r["Razdoblje"],
                 call_year=num(r["Natječajna godina"]), key_action=r["Ključna aktivnost"],
                 action_code=r["Šifra ključne aktivnosti"], source="National Agency list")
        nodes[pid]["amount_eur"] = 0
    nodes[pid]["amount_eur"] = round(nodes[pid]["amount_eur"] + (amount or 0), 2)
    na_key_to_id[pkey(r["Projektni broj"])] = pid
    add_edge(pid, "IN_SECTOR", ref("Sector", r["Sektor"]))
    add_edge(pid, "IN_CALL_YEAR", ref("CallYear", r["Natječajna godina"]))
    add_edge(pid, "HAS_ACTION", ref("Action", r["Šifra ključne aktivnosti"]))
    link_id = r["ID ustanove"]
    org = org_node(r["Naziv korisnika"], None, r["Mjesto (očišćeno)"], r["Poštanski broj (očišćen)"], link_id)
    add_edge(org, "RECEIVED_GRANT", pid, amount_eur=amount,
             link_tier=r["Razina povezivanja"] if link_id else None)

# ---------------------------------------------------------------- KA2 (EU-wide, Croatian orgs)
ka2 = read("ka2_hr_organizacije_poveznice.csv")
merged = 0
for r in ka2:
    key = pkey(r["Identifikator projekta"])
    if key in na_key_to_id:
        pid = na_key_to_id[key]
        if "ka2_identifier" not in nodes[pid]:
            merged += 1
        nodes[pid]["ka2_identifier"] = r["Identifikator projekta"]
        nodes[pid]["source"] = "National Agency list + KA2 EU file"
    else:
        pid = "project:" + r["Identifikator projekta"]
        add_node(pid, "Project", project_id=r["Identifikator projekta"], period=r["Razdoblje"],
                 call_year=num(r["Natječajna godina"]), key_action="KA2", source="KA2 EU file")
        add_edge(pid, "IN_CALL_YEAR", ref("CallYear", r["Natječajna godina"]))
    nodes[pid]["ka2_action_type"] = r["Vrsta aktivnosti"]
    nodes[pid]["ka2_total_grant_eur"] = num(r["Iznos EU potpore projekta (EUR)"])  # whole project, not HR share
    add_edge(pid, "HAS_ACTION", ref("Action", r["Vrsta aktivnosti"]))
    link_id = r["ID ustanove"]
    org = org_node(r["Naziv organizacije"], r["Vrsta organizacije"], r["Mjesto (iz adrese)"],
                   r["Poštanski broj (iz adrese)"], link_id)
    rel = "COORDINATES" if r["Uloga"] == "koordinator" else "PARTNERS_IN"
    add_edge(org, rel, pid, link_tier=r["Razina povezivanja"] if link_id else None)

# ---------------------------------------------------------------- aggregate statistics
n_stats = 0
for fname, kind in [("finance_2014-2020_long.csv", "finance"), ("finance_2021-2027_long.csv", "finance"),
                    ("applications_2014-2020_long.csv", "applications"),
                    ("applications_2021-2027_long.csv", "applications")]:
    period = re.search(r"\d{4}-\d{4}", fname).group()
    for r in read(fname):
        if r["Vrijednost"] == "":
            continue
        sid = f"statistic:{n_stats}"
        n_stats += 1
        add_node(sid, "Statistic", table=kind, period=period, item=r["Stavka"],
                 key_action=r["Ključna aktivnost"], value=num(r["Vrijednost"]),
                 is_percentage=r["Stavka"].startswith("%"))
        year = r["Natječajna godina"]
        if year.isdigit():
            add_edge(sid, "ABOUT_CALL_YEAR", ref("CallYear", year))
        else:
            nodes[sid]["scope"] = year  # e.g. Sveukupno
        if r["Sektor"] != "Ukupno":
            add_edge(sid, "ABOUT_SECTOR", ref("Sector", r["Sektor"]))

# ---------------------------------------------------------------- write
node_list = list(nodes.values())
meta = {
    "description": "Erasmus+ Croatia knowledge graph: institutions, organisations, projects, sectors, "
                   "locations and aggregate statistics.",
    "sources": sorted(p.name for p in PROC.glob("*.csv")),
    "node_counts": dict(Counter(n["label"] for n in node_list)),
    "edge_counts": dict(Counter(e["type"] for e in edges)),
    "notes": [
        "Beneficiaries linked to a register are the Institution node; the others are Organisation nodes "
        "(merged by normalised name + postal code, or place when no postal code).",
        "Project.amount_eur is the sum of National Agency grant lines; RECEIVED_GRANT.amount_eur is per line.",
        "ka2_total_grant_eur is the whole KA2 project grant, not the Croatian share.",
        "KA2 projects also in the National Agency list are merged into one Project node.",
        "Registers contain no personal contact data; Founder nodes keep the register text as given.",
    ],
}
OUT.write_text(json.dumps({"meta": meta, "nodes": node_list, "edges": edges},
                          ensure_ascii=False, indent=1), encoding="utf-8")
print(f"NA/KA2 projects merged: {merged}")
print(json.dumps(meta["node_counts"], indent=1, ensure_ascii=False))
print(json.dumps(meta["edge_counts"], indent=1))
print(f"wrote {OUT} ({OUT.stat().st_size/1e6:.1f} MB)")

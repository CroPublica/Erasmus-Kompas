"""Graph analysis on the extracted concepts (run after 23_extract_summary_concepts.py).

Adds to Data/processed/knowledge_graph.json:
  * project_ids on every ADDRESSED_BY and CO_OCCURS edge (so any aggregated claim can cite its projects)
  * hub flag (concept in > HUB_SHARE of projects) and, for non-hubs, pagerank + community (Louvain, seed 0) + community_label (Topic/Problem/TargetGroup/Approach/Output)
  * meta.communities: id, label (top concepts by weighted degree), size, n_projects, share of Croatian-coordinated projects

Louvain (networkx) is used because igraph/leidenalg are not installed; communities are labelled by their most
connected concepts, not by an LLM. Safe to re-run.
"""
import json
from collections import Counter, defaultdict
from pathlib import Path

import networkx as nx

GRAPH = Path(__file__).resolve().parent.parent / "Data" / "processed" / "knowledge_graph.json"
CONCEPTS = {"Topic", "Problem", "TargetGroup", "Approach", "Output"}
PROJECT_EDGES = {"TAGGED", "ADDRESSES", "TARGETS", "USES", "PRODUCES"}
HUB_SHARE = 0.20   # concepts in more than this share of projects are 'hubs': left out of communities/PageRank
RESOLUTION = 2.0   # Louvain resolution; 1.0 gave 7 giant communities, 2.0 gives ~13 balanced ones

g = json.loads(GRAPH.read_text(encoding="utf-8"))
by_id = {n["id"]: n for n in g["nodes"]}

members = defaultdict(set)  # concept id -> project ids
for e in g["edges"]:
    if e["type"] in PROJECT_EDGES:
        members[e["target"]].add(e["source"])

# project ids as evidence on aggregated edges
for e in g["edges"]:
    if e["type"] in ("ADDRESSED_BY", "CO_OCCURS"):
        e["project_ids"] = sorted(members[e["source"]] & members[e["target"]])

# PMI-weighted concept graph
n_projects = len({p for ps in members.values() for p in ps})
hubs = {c for c, ps in members.items() if len(ps) / n_projects > HUB_SHARE}
G = nx.Graph()
for e in g["edges"]:
    if e["type"] == "CO_OCCURS" and e["source"] not in hubs and e["target"] not in hubs:
        G.add_edge(e["source"], e["target"], weight=e["pmi"])
pr = nx.pagerank(G, weight="weight")
comms = nx.community.louvain_communities(G, weight="weight", seed=0, resolution=RESOLUTION)
comms = sorted(comms, key=len, reverse=True)

hr_coord = {e["target"] for e in g["edges"] if e["type"] == "COORDINATES"}  # only Croatian orgs are in the graph

summary = []
for i, c in enumerate(comms):
    wdeg = {n: G.degree(n, weight="weight") for n in c}
    top = sorted(c, key=wdeg.get, reverse=True)[:3]
    label = " / ".join(by_id[n]["name"] for n in top)
    projs = set().union(*(members[n] for n in c))
    for n in c:
        by_id[n]["community"] = i
        by_id[n]["community_label"] = label
    summary.append({
        "community": i, "label": label, "size": len(c), "n_projects": len(projs),
        "by_type": dict(Counter(by_id[n]["label"] for n in c)),
        "hr_coordinated_projects": len(projs & hr_coord),
    })
for n, v in pr.items():
    by_id[n]["pagerank"] = round(v, 5)
for n in g["nodes"]:
    if n["label"] in CONCEPTS:
        n["hub"] = n["id"] in hubs
        n.setdefault("community", None)

g["meta"]["communities"] = summary
GRAPH.write_text(json.dumps(g, ensure_ascii=False, indent=1), encoding="utf-8")

print(f"concept graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(comms)} communities")
for s in summary:
    print(f"  #{s['community']} size {s['size']:3d}  projects {s['n_projects']:4d}  {s['label']}  {s['by_type']}")
print("\ntop PageRank:", [(by_id[n]["name"], round(v, 3)) for n, v in sorted(pr.items(), key=lambda x: -x[1])[:8]])
print(f"hub concepts (> {HUB_SHARE:.0%} of projects, excluded): {sorted(by_id[h]['name'] for h in hubs)}")
print(f"non-hub concepts without a community: {[n['name'] for n in g['nodes'] if n['label'] in CONCEPTS and not n['hub'] and n['community'] is None]}")

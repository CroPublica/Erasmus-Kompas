"""Step 60: the concept graph and its communities (BUILD_PLAN §6).

Reads   project, project_topic, concept, project_concept, concept_theme   (steps 40, 51)
Writes  graph_node         one row per node (with its community): a frequent concept (used by >= MIN_PROJECTS projects) or an EU topic
        graph_edge         two nodes that occur together in >= MIN_PAIR projects more often than chance (lift), with cosine weight
        community          Leiden communities of the graph, with a short profile (size, periods, good-practice share, grants)
        project_community  project -> its best-matching community (>= MIN_OVERLAP member nodes)

A concept used by fewer projects is counted under its theme (concept_theme) when it has one, so near-synonyms add up.
Edges only say "occur in the same projects"; they are not causal and not a recommendation.
Usage: python pipeline/60_graph.py [--resolution 2.0] [--min-projects 5] [--dry]
"""
import argparse
import csv
import json
import math
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import connect  # noqa: E402

MIN_PROJECTS = 5       # a node must be used by this many projects
MIN_PAIR = 3           # two nodes must occur together in this many projects
MIN_LIFT = 2.0         # and at least this many times more often than chance
MIN_COSINE = 0.06
MIN_COMMUNITY = 8      # smaller communities are folded into "other"
MIN_REPORT = 20        # communities matched by fewer projects are kept in the tables but not shown as a profile (reportable = false)
MIN_OVERLAP = 4        # a project belongs to a community when it contains this many of its nodes


def wilson(k, n, z=1.96):
    if n == 0:
        return 0.0, 0.0
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (c - h) / d, (c + h) / d


def bulk_insert(con, table, rows):
    with tempfile.NamedTemporaryFile("w", suffix=".csv", newline="", encoding="utf-8", delete=False) as f:
        csv.writer(f).writerows(rows)
    try:
        con.execute(f"insert into {table} select * from read_csv('{f.name}', header=false, nullstr='')")
    finally:
        Path(f.name).unlink()


def load(con, min_projects):
    projects = {r[0]: dict(period=r[1], year=r[2], gp=bool(r[3]), grant=r[4], family=r[5], scale=r[6]) for r in con.execute(
        "select project_id, period, call_year, good_practice, grant_eur, family, scale from project").fetchall()}
    has = {r[0] for r in con.execute("select distinct project_id from project_concept").fetchall()}
    projects = {k: v for k, v in projects.items() if k in has}
    label = {r[0]: (r[1], r[2]) for r in con.execute("select concept_id, kind, label_en from concept").fetchall()}
    label = {k: (v[0], v[1]) for k, v in label.items()}
    theme = dict(con.execute("select concept_id, theme_id from concept_theme").fetchall())
    inc = defaultdict(set)                                       # project -> node ids
    for pid, cid in con.execute("select project_id, concept_id from project_concept").fetchall():
        if pid in projects:
            inc[pid].add(theme.get(cid, cid))
    for pid, t in con.execute("select project_id, topic from project_topic").fetchall():
        if pid in projects:
            inc[pid].add("TOP:" + t)
    count = Counter(n for s in inc.values() for n in s)
    nodes = sorted(n for n, c in count.items() if c >= min_projects)
    kinds, labels = {}, {}
    for n in nodes:
        if n.startswith("TOP:"):
            kinds[n], labels[n] = "topic", n[4:]
        else:
            kinds[n], labels[n] = label[n][0], label[n][1]
    return projects, inc, nodes, kinds, labels


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--resolution", type=float, default=2.0)
    ap.add_argument("--min-projects", type=int, default=MIN_PROJECTS)
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    con = connect(read_only=a.dry)
    projects, inc, nodes, kinds, labels = load(con, a.min_projects)
    pids = sorted(projects)
    idx = {n: i for i, n in enumerate(nodes)}
    N = len(pids)
    X = np.zeros((N, len(nodes)), dtype=np.float32)
    for r, pid in enumerate(pids):
        for n in inc[pid]:
            if n in idx:
                X[r, idx[n]] = 1
    n_i = X.sum(0)
    M = X.T @ X
    print(f"{N:,} projects, {len(nodes):,} nodes ({Counter(kinds.values())})")

    # ---- edges
    edges = []
    for i in range(len(nodes)):
        for j in range(i + 1, len(nodes)):
            nij = M[i, j]
            if nij < MIN_PAIR:
                continue
            lift = nij * N / (n_i[i] * n_i[j])
            cos = nij / math.sqrt(n_i[i] * n_i[j])
            if lift >= MIN_LIFT and cos >= MIN_COSINE:
                edges.append((i, j, int(nij), float(lift), float(cos)))
    print(f"{len(edges):,} edges")

    # ---- communities (Leiden)
    import igraph as ig
    import leidenalg
    g = ig.Graph(n=len(nodes), edges=[(i, j) for i, j, *_ in edges])
    g.es["weight"] = [e[4] for e in edges]
    part = leidenalg.find_partition(g, leidenalg.RBConfigurationVertexPartition, weights="weight", resolution_parameter=a.resolution, seed=7)
    comm = {}
    sizes = Counter(part.membership)
    order = [c for c, _ in sizes.most_common() if sizes[c] >= MIN_COMMUNITY]
    for new, old in enumerate(order, 1):
        comm[old] = f"C{new:02d}"
    member = {nodes[i]: comm.get(c) for i, c in enumerate(part.membership)}
    print(f"{len(order)} communities of >= {MIN_COMMUNITY} nodes; {sum(1 for v in member.values() if v is None)} nodes in none; sizes {[sizes[c] for c in order]}")

    # ---- project -> community
    cnodes = defaultdict(list)
    for n, c in member.items():
        if c:
            cnodes[c].append(n)
    pc = {}
    for pid in pids:
        ov = Counter(member.get(n) for n in inc[pid] if member.get(n))
        if ov:
            c, k = ov.most_common(1)[0]
            if k >= MIN_OVERLAP:
                pc[pid] = (c, k)
    base_gp = sum(projects[p]["gp"] for p in pids) / N

    # ---- community profiles
    comms = []
    for c in sorted(cnodes):
        ps = [p for p, (cc, _) in pc.items() if cc == c]
        k = sum(projects[p]["gp"] for p in ps)
        lo, hi = wilson(k, len(ps))
        by_kind = {kd: sorted(((n_i[idx[n]], n) for n in cnodes[c] if kinds[n] == kd), reverse=True) for kd in ("target_group", "approach", "output", "problem", "topic")}
        top = lambda kd, m=3: [labels[n] for _, n in by_kind[kd][:m]]
        grants = sorted(projects[p]["grant"] for p in ps if projects[p]["grant"] and projects[p]["scale"] != "school")
        comms.append(dict(
            community_id=c, n_nodes=len(cnodes[c]), n_projects=len(ps), share=len(ps) / N,
            n_2014_2020=sum(projects[p]["period"] == "2014-2020" for p in ps), n_2021_2027=sum(projects[p]["period"] == "2021-2027" for p in ps),
            good_practice=k, gp_rate=k / len(ps) if ps else 0.0, gp_lo=lo, gp_hi=hi, gp_baseline=base_gp,
            median_grant=float(np.median(grants)) if grants else None,
            label_en=" · ".join((top("approach", 2) + top("target_group", 1) + top("topic", 1))[:4]),
            top_approach=top("approach", 5), top_target_group=top("target_group", 5), top_output=top("output", 5), top_problem=top("problem", 5), top_topic=top("topic", 4),
            families=[f for f, _ in Counter(projects[p]["family"] for p in ps).most_common(3)],
        ))
    for c in comms:
        print(f"\n{c['community_id']}  nodes {c['n_nodes']:3d}  projects {c['n_projects']:4d} ({100 * c['share']:.0f}%)  2014-20/2021-27 {c['n_2014_2020']}/{c['n_2021_2027']}  good practice {100 * c['gp_rate']:.0f}% (all {100 * base_gp:.0f}%)")
        print("   ", c["label_en"])
        for kd in ("target_group", "approach", "output", "problem", "topic"):
            print(f"    {kd:12s}", "; ".join(c["top_" + kd][:4]))
    if a.dry:
        return

    con.execute("create or replace table graph_node(node_id varchar, kind varchar, label_en varchar, n_projects integer, n_2014_2020 integer, n_2021_2027 integer, "
                "good_practice integer, gp_rate double, gp_lo double, gp_hi double, community_id varchar)")
    rows = []
    for n in nodes:
        r = X[:, idx[n]] > 0
        ps = [pids[i] for i in np.nonzero(r)[0]]
        k = sum(projects[p]["gp"] for p in ps)
        lo, hi = wilson(k, len(ps))
        rows.append((n, kinds[n], labels[n], len(ps), sum(projects[p]["period"] == "2014-2020" for p in ps), sum(projects[p]["period"] == "2021-2027" for p in ps),
                     k, k / len(ps), lo, hi, member[n] or ""))
    bulk_insert(con, "graph_node", rows)
    con.execute("create or replace table graph_edge(a varchar, b varchar, n_projects integer, lift double, cosine double)")
    bulk_insert(con, "graph_edge", [(nodes[i], nodes[j], n, round(l, 3), round(c, 4)) for i, j, n, l, c in edges])
    con.execute("create or replace table community(community_id varchar, n_nodes integer, n_projects integer, share double, n_2014_2020 integer, n_2021_2027 integer, "
                "good_practice integer, gp_rate double, gp_lo double, gp_hi double, gp_baseline double, median_grant double, label_en varchar, profile varchar, reportable boolean)")
    bulk_insert(con, "community", [(c["community_id"], c["n_nodes"], c["n_projects"], round(c["share"], 4), c["n_2014_2020"], c["n_2021_2027"], c["good_practice"], round(c["gp_rate"], 4),
                                    round(c["gp_lo"], 4), round(c["gp_hi"], 4), round(c["gp_baseline"], 4), c["median_grant"] or "", c["label_en"],
                                    json.dumps({k: c[k] for k in ("top_approach", "top_target_group", "top_output", "top_problem", "top_topic", "families")}, ensure_ascii=False),
                                    c["n_projects"] >= MIN_REPORT) for c in comms])
    con.execute("create or replace table project_community(project_id varchar, community_id varchar, overlap integer)")
    bulk_insert(con, "project_community", [(p, c, k) for p, (c, k) in pc.items()])
    print(f"\nwrote graph_node {len(nodes)}, graph_edge {len(edges)}, community {len(comms)}, project_community {len(pc)}")


if __name__ == "__main__":
    main()

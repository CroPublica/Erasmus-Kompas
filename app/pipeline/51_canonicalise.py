"""Step 51: merge near-duplicate concepts and prepare Croatian labels.

Reads the extraction (data/extraction_cache.jsonl, tag given by --tag) and groups phrases of the same kind that mean the same thing:
'peer learning', 'peer-to-peer learning' and 'peer learning among teachers' become one concept. Method (no model writes anything here):
  1. phrases are lower-cased and cleaned; identical cleaned phrases are one unit
  2. each unit is embedded with bge-m3 (config role `embeddings`)
  3. leader clustering by frequency: the most frequent unit starts a concept; a later unit joins the first concept whose leader it
     matches with cosine >= TAU (the leader keeps its label), else it starts its own concept
Writes (tables) concept(concept_id, kind, label_en, n_projects, n_mentions, generic_share),
                concept_map(kind, phrase, concept_id), project_concept(project_id, concept_id, n_mentions, status)
and a review file data/review/concept_labels_hr.csv (label_en, label_hr draft empty until the labelling step, label_hr_reviewed empty).
Generic administration items (flag from step 50) stay in the tables with generic = true.

Usage: python pipeline/51_canonicalise.py [--tag "qwen3.5:9b-q8_0|v2"] [--tau 0.86] [--sample 25] [--dry]   (--dry: print clusters only)
"""
import argparse
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from atlas.config import make_embeddings  # noqa: E402
from atlas.countries import NAMES as COUNTRIES  # noqa: E402
from common import APP_DIR, connect  # noqa: E402

KINDS = {"problem": "problems", "approach": "approaches", "output": "outputs", "target_group": "target_groups"}
CACHE = APP_DIR / "data" / "extraction_cache.jsonl"
HR_REVIEW = APP_DIR / "data" / "review" / "concept_labels_hr.csv"
TAU = 0.86


def clean_phrase(t: str) -> str:
    t = re.sub(r"[\"“”‘’]", "", (t or "").lower())
    t = re.sub(r"\s+", " ", t).strip(" .;:,-")
    return re.sub(r"^(the|a|an) ", "", t)


STOP = {"of", "the", "and", "or", "for", "in", "on", "to", "a", "an", "with", "among", "by", "at", "from", "through", "as", "their", "its", "who", "that", "is", "are"}
OPPOSITES = [{"public", "private"}, {"men", "women"}, {"boys", "girls"}, {"male", "female"}, {"primary", "secondary"}, {"urban", "rural"}, {"increase", "decrease"},
             {"increased", "decreased"}, {"improved", "reduced"}, {"more", "less"}, {"high", "low"}, {"teachers", "students"}, {"teachers", "pupils"}, {"online", "offline"},
             {"young", "older"}, {"before", "after"}, {"lack", "excess"}, {"physical", "mental"}, {"virtual", "physical"}, {"master", "bachelor"}, {"photo", "video"}]
PLACES = {w for en, _ in COUNTRIES.values() for w in re.findall(r"[a-z]+", en.lower()) if len(w) > 3} | {"balkans", "europe", "european", "croatian", "croatia"}
MAX_TOKENS = 6                 # longer phrases are project-specific wording, not candidates for merging
HIGH = 0.93                    # above this similarity an addition of more than two words may still merge
SUBST = 0.97                   # a word replaced by another merges only when the phrases are almost identical (spelling variants)


def stem(w):
    return re.sub(r"(ing|ed|es|s|e|d)$", "", w) if len(w) > 4 else w                           # crude folding: issue/issues, increase/increased


def tokens(t):
    return {stem(w) for w in re.findall(r"[a-z0-9\u00c0-\u024f]+", t) if w not in STOP}


OPPOSITES = [{stem(w) for w in pair} for pair in OPPOSITES]


def compatible(a: str, b: str, sim: float) -> bool:
    """Whether two phrases that are close in meaning may be one concept. Guards the cases where embeddings over-merge."""
    ta, tb = tokens(a), tokens(b)
    if len(ta) > MAX_TOKENS or len(tb) > MAX_TOKENS:
        return False
    if {w for w in ta if w.isdigit()} != {w for w in tb if w.isdigit()}:
        return False
    for pair in OPPOSITES:
        if (ta & pair) and (tb & pair) and (ta & pair) != (tb & pair):
            return False
    if (ta ^ tb) & PLACES and not (ta <= tb or tb <= ta):          # the same phrase for two countries is two concepts
        return False
    added = ta <= tb or tb <= ta                    # one phrase is the other plus extra words ("peer learning" / "peer learning activities")
    if added:
        return len(ta ^ tb) <= 1 or sim >= HIGH
    return sim >= SUBST                             # a word replaced by another word ("water issues" / "soil issues"): only when almost identical


def leader_clusters(units, vectors, tau, ok=None):
    """units: [(phrase, count)] sorted by count desc; vectors: unit-length rows aligned with units. Returns [(leader index, [member indices])].
    `ok(leader_phrase, phrase, sim)` can veto a merge; the next most similar leader is tried."""
    leaders, members = [], []
    n, d = (vectors.shape if len(vectors) else (0, 0))
    L = np.zeros((min(n, 1024), d), dtype=np.float32)            # leader vectors; grown by doubling, never copied per leader
    vectors = vectors.astype(np.float32, copy=False)
    for i, v in enumerate(vectors):
        if leaders:
            sim = L[:len(leaders)] @ v
            joined = False
            top = np.argpartition(-sim, min(5, len(sim)) - 1)[:5] if len(sim) > 5 else np.arange(len(sim))
            for j in top[np.argsort(-sim[top])]:
                if sim[j] < tau:
                    break
                if ok is None or ok(units[leaders[j]][0], units[i][0], float(sim[j])):
                    members[j].append(i)
                    joined = True
                    break
            if joined:
                continue
        if len(leaders) == len(L):
            L = np.vstack([L, np.zeros_like(L)])
        L[len(leaders)] = v
        leaders.append(i)
        members.append([i])
    return list(zip(leaders, members))


def load_mentions(tag):
    out = []                                   # (project_id, kind, phrase, status, generic)
    from importlib import import_module
    sys.path.insert(0, str(APP_DIR / "pipeline"))
    generic = import_module("50_extract_concepts").is_generic
    for line in CACHE.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        if r["extractor"] != tag:
            continue
        for kind, key in KINDS.items():
            for it in r.get(key, []):
                text = it if isinstance(it, str) else it["text"]
                ph = clean_phrase(text)
                if ph:
                    out.append((r["project_id"], kind, ph, None if isinstance(it, str) else it.get("status"), kind in ("approach", "output") and generic(text)))
    return out


def build(mentions, embed, tau):
    """-> concepts {(kind, cid): dict}, phrase_map {(kind, phrase): (kind, cid)}"""
    concepts, pmap = {}, {}
    for kind in KINDS:
        cnt = Counter(m[2] for m in mentions if m[1] == kind)
        units = sorted(cnt.items(), key=lambda kv: (-kv[1], len(kv[0]), kv[0]))
        if not units:
            continue
        vecs = embed([u for u, _ in units])
        for k, (lead, mem) in enumerate(leader_clusters(units, vecs, tau, compatible)):
            cid = f"{kind[:3]}{k:05d}"
            concepts[(kind, cid)] = {"kind": kind, "concept_id": cid, "label_en": units[lead][0], "phrases": [units[i][0] for i in mem]}
            for i in mem:
                pmap[(kind, units[i][0])] = cid
    return concepts, pmap


def bulk_insert(con, table, rows):
    """executemany runs one statement per row (about 300,000 rows here took half an hour); a CSV copy takes seconds."""
    import tempfile
    with tempfile.NamedTemporaryFile("w", suffix=".csv", newline="", encoding="utf-8", delete=False) as f:
        csv.writer(f).writerows(rows)
    try:
        con.execute(f"insert into {table} select * from read_csv('{f.name}', header=false, all_varchar=false, nullstr='')")
    finally:
        Path(f.name).unlink()


THEME_KINDS = {"approach": 0.75, "target_group": 0.75}   # problems and outputs are worded too specifically: attaching them was wrong too often
THEME_SEED_MIN = 5                                        # a theme is a concept used by at least this many projects


def attach_themes(concepts, stat, embed):
    """-> rows (kind, concept_id, theme_id, similarity): each concept used by fewer than THEME_SEED_MIN projects points at the most similar
    frequent concept of its kind, when the similarity reaches the kind's threshold. The concept itself is never changed."""
    rows = []
    for kind, thr in THEME_KINDS.items():
        have = [(cid, c) for (k, cid), c in concepts.items() if k == kind and (k, cid) in stat]
        seeds = [(cid, c) for cid, c in have if len(stat[(kind, cid)]["proj"]) >= THEME_SEED_MIN]
        rest = [(cid, c) for cid, c in have if len(stat[(kind, cid)]["proj"]) < THEME_SEED_MIN]
        S, R = embed([c["label_en"] for _, c in seeds]), embed([c["label_en"] for _, c in rest])
        for lo in range(0, len(rest), 2000):
            sc = R[lo:lo + 2000] @ S.T
            j, b = sc.argmax(1), sc.max(1)
            rows += [(kind, rest[lo + i][0], seeds[j[i]][0], round(float(b[i]), 4)) for i in range(len(j)) if b[i] >= thr]
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="qwen3.5:9b-q8_0|v2")
    ap.add_argument("--tau", type=float, default=TAU)
    ap.add_argument("--sample", type=int, default=0, help="print N of the largest merged concepts per kind")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    mentions = load_mentions(a.tag)
    projects = {m[0] for m in mentions}
    print(f"{len(mentions):,} mentions from {len(projects):,} projects ({a.tag})")
    emb = make_embeddings()

    cache_file = APP_DIR / "data" / "concept_embedding_cache.npz"          # phrase -> vector, so a re-run with another tau is quick
    cache = {}
    if cache_file.exists():
        z = np.load(cache_file, allow_pickle=False)
        cache = dict(zip(z["phrases"].tolist(), z["vectors"]))

    def embed(texts):
        todo = [t for t in dict.fromkeys(texts) if t not in cache]
        for i in range(0, len(todo), 256):
            for t, v in zip(todo[i:i + 256], emb.embed_documents(todo[i:i + 256])):
                cache[t] = np.asarray(v, dtype=np.float32)
        if todo:
            np.savez(cache_file, phrases=np.array(list(cache)), vectors=np.array(list(cache.values())))
        v = np.array([cache[t] for t in texts])
        return v / np.linalg.norm(v, axis=1, keepdims=True)

    concepts, pmap = build(mentions, embed, a.tau)
    per = defaultdict(lambda: [0, 0])
    for (kind, cid), c in concepts.items():
        per[kind][0] += 1
        per[kind][1] += len(c["phrases"])
    for kind, (nc, nu) in per.items():
        print(f"  {kind:13s} {nu:6,} distinct phrases -> {nc:6,} concepts")
    if a.sample:
        for kind in KINDS:
            big = sorted((c for (k, _), c in concepts.items() if k == kind and len(c["phrases"]) > 1), key=lambda c: -len(c["phrases"]))[:a.sample]
            print(f"\n== largest merged {kind} concepts")
            for c in big:
                print(f"  [{len(c['phrases']):3d}] {c['label_en']}  <-  " + " | ".join(c["phrases"][1:6]))
    if a.dry:
        return
    stat = defaultdict(lambda: {"proj": set(), "n": 0, "gen": 0})
    pc = defaultdict(lambda: [0, Counter()])
    for pid, kind, ph, status, gen in mentions:
        cid = pmap[(kind, ph)]
        s = stat[(kind, cid)]
        s["proj"].add(pid); s["n"] += 1; s["gen"] += int(gen)
        pc[(pid, cid)][0] += 1
        if status:
            pc[(pid, cid)][1][status] += 1
    con = connect()
    con.execute("create or replace table concept(concept_id varchar, kind varchar, label_en varchar, n_projects integer, n_mentions integer, generic_share double)")
    bulk_insert(con, "concept", [
        (c["concept_id"], kind, c["label_en"], len(stat[(kind, cid)]["proj"]), stat[(kind, cid)]["n"], stat[(kind, cid)]["gen"] / max(stat[(kind, cid)]["n"], 1))
        for (kind, cid), c in concepts.items() if (kind, cid) in stat])
    con.execute("create or replace table concept_map(kind varchar, phrase varchar, concept_id varchar)")
    bulk_insert(con, "concept_map", [(k, ph, cid) for (k, ph), cid in pmap.items()])
    con.execute("create or replace table project_concept(project_id varchar, concept_id varchar, n_mentions integer, status varchar)")
    bulk_insert(con, "project_concept", [(pid, cid, n, (st.most_common(1)[0][0] if st else "")) for (pid, cid), (n, st) in pc.items()])
    con.execute("create or replace table concept_theme(kind varchar, concept_id varchar, theme_id varchar, similarity double)")
    bulk_insert(con, "concept_theme", attach_themes(concepts, stat, embed))
    print("  concept_theme:", con.execute("select kind, count(*) from concept_theme group by 1 order by 1").fetchall())
    con.close()
    HR_REVIEW.parent.mkdir(parents=True, exist_ok=True)
    old = {}
    if HR_REVIEW.exists():
        old = {r["concept_id"]: r for r in csv.DictReader(HR_REVIEW.open(encoding="utf-8"))}
    with HR_REVIEW.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["concept_id", "kind", "label_en", "n_projects", "label_hr_draft", "label_hr_reviewed", "note"])
        for (kind, cid), c in sorted(concepts.items(), key=lambda kv: -len(stat[kv[0]]["proj"]) if kv[0] in stat else 0):
            if (kind, cid) in stat and len(stat[(kind, cid)]["proj"]) >= 3:                    # only concepts seen in at least 3 projects need a Croatian label
                o = old.get(cid, {})
                w.writerow([cid, kind, c["label_en"], len(stat[(kind, cid)]["proj"]), o.get("label_hr_draft", ""), o.get("label_hr_reviewed", ""), o.get("note", "")])
    print(f"wrote concept, concept_map, project_concept and {HR_REVIEW.name}")


if __name__ == "__main__":
    main()

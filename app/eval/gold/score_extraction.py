"""Score an extraction run (cache of pipeline/50_extract_concepts.py) against the gold set (eval/gold/gold.jsonl).

  python eval/gold/score_extraction.py "qwen3.5:9b-q8_0|v2"          score one extractor tag (model|prompt version)
  python eval/gold/score_extraction.py "gemma4:latest|v1" "qwen3.5:9b-q8_0|v2"

Gold items are the reviewer's: proposed items they kept plus items they added. An extracted item matches a gold item of the same kind in
the same project when the bge-m3 embedding cosine of the two phrases is at least TAU (default 0.72; the table also shows 0.65 and 0.80).
recall = gold items matched / gold items. 'extra' = extracted items that match no gold item: not necessarily wrong (the gold lists only what
reviewers kept or added), so they are counted and a sample is printed for reading. Recall is reported on the thorough reviews
(eval/gold/review_depth.json) and on all reviewed projects. Caveat: the gold set is small (25 projects) and the matching is approximate.
"""
import json, sys
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT))
from atlas.config import make_embeddings  # noqa: E402

KEY = {"problem": "problems", "approach": "approaches", "output": "outputs", "target_group": "target_groups"}


def load_cache(tag):
    out = {}
    for line in (ROOT / "data" / "extraction_cache.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            r = json.loads(line)
            if r["extractor"] == tag:
                out[r["project_id"]] = r
    return out


def items(rec, kind):
    xs = rec.get(KEY[kind], [])
    return [x if isinstance(x, str) else x["text"] for x in xs]


def recall_at(gold_texts, ext_texts, embed, tau):
    """Number of gold phrases that have an extracted phrase with cosine similarity >= tau. `embed(list) -> unit-length rows`."""
    if not gold_texts or not ext_texts:
        return 0
    sim = embed(gold_texts) @ embed(ext_texts).T
    return int((sim.max(axis=1) >= tau).sum())


def main(tags, taus=(0.65, 0.72, 0.80)):
    gold = [json.loads(l) for l in (HERE / "gold.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    emb = make_embeddings()
    cache_vec = {}

    def vec(texts):
        new = [t for t in set(texts) if t not in cache_vec]
        if new:
            for t, v in zip(new, emb.embed_documents(new)):
                cache_vec[t] = np.array(v) / np.linalg.norm(v)
        return np.array([cache_vec[t] for t in texts]) if texts else np.zeros((0, 1))

    for tag in tags:
        ext = load_cache(tag)
        have = [g for g in gold if g["project_id"] in ext]
        print(f"\n== {tag}: {len(have)} of {len(gold)} gold projects extracted")
        if not have:
            continue
        for depth in ("thorough", "all"):
            sub = [g for g in have if depth == "all" or g["review_depth"] == "thorough"]
            print(f"  recall, {depth} reviews ({len(sub)} projects), at cosine >= " + " / ".join(f"{t:.2f}" for t in taus))
            tot = defaultdict(lambda: [0, [0] * len(taus), 0, 0])        # kind -> gold n, matched per tau, extracted n, extra at middle tau
            for g in sub:
                for kind in KEY:
                    gi = [i["text"] for i in g["items"] if i["kind"] == kind and i["correct"]]
                    ei = items(ext[g["project_id"]], kind)
                    G, E = vec(gi), vec(ei)
                    sim = G @ E.T if len(gi) and len(ei) else np.zeros((len(gi), len(ei)))
                    t = tot[kind]
                    t[0] += len(gi)
                    for k, tau in enumerate(taus):
                        t[1][k] += int((sim.max(axis=1) >= tau).sum()) if len(ei) else 0
                    t[2] += len(ei)
                    t[3] += int((sim.max(axis=0) < taus[1]).sum()) if len(gi) and len(ei) else len(ei)
            for kind, (n, m, ne, ex) in tot.items():
                print(f"    {kind:13s} gold {n:3d}  " + "  ".join(f"{(x / n if n else float('nan')):4.0%}" for x in m) + f"   extracted {ne:3d} ({ne / len(sub):.1f}/project), unmatched extras {ex}")
        # a few unmatched gold items (the misses) for reading
        miss = []
        for g in have:
            if g["review_depth"] != "thorough":
                continue
            for kind in ("problem", "approach", "output"):
                gi = [i["text"] for i in g["items"] if i["kind"] == kind and i["correct"]]
                ei = items(ext[g["project_id"]], kind)
                if gi and ei:
                    sim = vec(gi) @ vec(ei).T
                    miss += [(kind, t) for t, s in zip(gi, sim.max(axis=1)) if s < taus[1]]
                elif gi:
                    miss += [(kind, t) for t in gi]
        print(f"  gold items still missed (thorough reviews): {len(miss)}")
        for kind, t in miss[:12]:
            print(f"     - {kind:8s} {t[:110]}")


if __name__ == "__main__":
    main(sys.argv[1:] or ["gemma4:latest|v1"])

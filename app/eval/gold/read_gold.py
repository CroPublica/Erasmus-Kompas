"""Read corrected batch files (batch_NN.md) into gold.jsonl and score the extractor.

  python eval/gold/read_gold.py          scores every batch whose projects have 'Reviewed by' filled in

Per concept kind: proposed items, items the reviewer kept (precision = kept / proposed), items the reviewer added
(recall = kept / (kept + added)). Items are compared as written, so only the reviewer's own marks are used, not string matching.
Projects without a 'Reviewed by' name are skipped. Caveat: reviewers tend to accept proposals, so precision is optimistic.
"""
import json
import re
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
KINDS = {"Problems": "problem", "Target groups": "target_group", "Approaches": "approach", "Outputs": "output"}


def parse(path):
    for block in re.split(r"\n---\n", path.read_text(encoding="utf-8"))[1:]:
        m = re.search(r"^## (.+)$", block, re.M)
        if not m:
            continue
        rev = re.search(r"^Reviewed by:[ \t]*(\S.*)$", block, re.M)
        rec = {"project_id": m.group(1).strip(), "reviewer": rev.group(1).strip() if rev else None, "items": []}
        kind = None
        for line in block.splitlines():
            h = re.match(r"\*\*(Problems|Target groups|Approaches|Outputs)", line)
            if h:
                kind = KINDS[h.group(1)]
            elif kind and (c := re.match(r"- \[( |x)\] (.+?)(?:\s*<!--.*-->)?\s*$", line)):
                rec["items"].append({"kind": kind, "text": re.sub(r" \((planned|reported)\)$", "", c.group(2)), "proposed": True, "correct": c.group(1) == "x"})
            elif kind and (a := re.match(r"\+ (\S.*)$", line)):
                rec["items"].append({"kind": kind, "text": a.group(1).strip(), "proposed": False, "correct": True})
        yield rec


def main():
    gold, skipped = [], 0
    for path in sorted(HERE.glob("batch_*.md")):
        for rec in parse(path):
            if rec["reviewer"]:
                gold.append(rec)
            else:
                skipped += 1
    (HERE / "gold.jsonl").write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in gold) + ("\n" if gold else ""), encoding="utf-8")
    print(f"{len(gold)} reviewed projects ({skipped} not yet reviewed) -> gold.jsonl")
    if not gold:
        return
    stat = defaultdict(lambda: [0, 0, 0])      # kind -> proposed, kept, added
    for r in gold:
        for it in r["items"]:
            s = stat[it["kind"]]
            if it["proposed"]:
                s[0] += 1
                s[1] += it["correct"]
            else:
                s[2] += 1
    print(f"{'kind':14s} {'proposed':>8} {'kept':>5} {'added':>5} {'precision':>10} {'recall':>7}")
    for kind in KINDS.values():
        p, k, a = stat[kind]
        print(f"{kind:14s} {p:>8} {k:>5} {a:>5} {k / p if p else float('nan'):>10.0%} {k / (k + a) if k + a else float('nan'):>7.0%}")


if __name__ == "__main__":
    main()

"""Prepare a batch of summaries for hand annotation of the concept extractor (BUILD_PLAN §7, "gold set").

  python eval/gold/make_batch.py N_2021 N_2014 [BATCH]   e.g. 15 10 1   -> eval/gold/batch_01.md (+ batch_01_ids.txt)

Picks projects at random (seed 11) from the Croatian KA2 projects of each period, runs the extractor on them (pipeline/50,
skipped for projects already cached), and writes a Markdown file where each project shows its summary and the model's
PROPOSED items as checkboxes. A person then:
  * unticks items that are wrong:                  - [ ] ...
  * adds missing items on lines starting with '+': + peer mentoring
  * leaves the 'reviewed by' line filled in.
read_gold.py turns the corrected file into gold.jsonl and scores the extractor against it.
Proposed items are bias: they make the reviewer agree too easily. Missing-item lines are the check on recall; look for them.
"""
import json
import random
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE.parent.parent
sys.path.insert(0, str(APP / "pipeline"))
from common import connect  # noqa: E402

KINDS = [("problem", "Problems the project addresses"), ("target_group", "Target groups"),
         ("approach", "Approaches (what it does or uses)"), ("output", "Outputs (products, results)")]


def main():
    n21, n14 = int(sys.argv[1]), int(sys.argv[2])
    batch = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    con = connect(read_only=True)
    rng = random.Random(11)
    ids = []
    for period, n in (("2021-2027", n21), ("2014-2020", n14)):
        pool = [r[0] for r in con.execute("select project_id from project where period = ? and length(summary) > 400 order by project_id", [period]).fetchall()]
        ids += rng.sample(pool, n)
    con.close()
    ids_file = HERE / f"batch_{batch:02d}_ids.txt"
    ids_file.write_text("\n".join(ids) + "\n", encoding="utf-8")
    subprocess.run([sys.executable, str(APP / "pipeline" / "50_extract_concepts.py"), "--ids", str(ids_file)], check=True)

    con = connect(read_only=True)
    out = [f"# Gold set, batch {batch:02d}\n",
           "Instructions: untick (`- [ ]`) proposed items that are wrong or not supported by the summary; add missing items as lines "
           "starting with `+ `; fill in `Reviewed by` at the end of each project. Do not edit the `##` heading lines.\n"]
    for pid in ids:
        title, period, status, summary = con.execute("select title, period, status, summary from project where project_id = ?", [pid]).fetchone()
        out.append(f"\n---\n\n## {pid}\n\n**{title}**  \n{period} · {status}\n\n> " + (summary or "").strip().replace("\n", "\n> ") + "\n")
        for kind, label in KINDS:
            out.append(f"\n**{label}**\n")
            for text, st, ev, ok in con.execute("select text, status, evidence, evidence_verified from concept_mention where project_id = ? and kind = ? order by text", [pid, kind]).fetchall():
                note = f" ({st})" if st else ""
                out.append(f"- [x] {text}{note}" + ("" if ok in (True, None) else "  <!-- evidence quote not found in the text -->"))
            out.append("+ ")
        out.append("\nReviewed by: \n")
    path = HERE / f"batch_{batch:02d}.md"
    path.write_text("\n".join(out), encoding="utf-8")
    print(f"wrote {path} ({len(ids)} projects)")


if __name__ == "__main__":
    main()

"""Native-speaker rating of Croatian answers, summarised per system (the sheet is blind: the key maps item -> system).

  python eval/gold/summarise_rating.py                 reads rating_sheet_rated_combined.csv and ../native_rating/key_DO_NOT_SHOW_RATERS.csv
Prints, for each system, the mean scores of each rater separately (the raters differ in strictness, see interrater_agreement.py),
the counts of items flagged 'yes' by at least one rater, and writes eval/results/native_rating_summary.md.
"""
import csv
import statistics as st
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
SHEET = HERE / "rating_sheet_rated_combined.csv"
KEY = HERE.parent / "native_rating" / "key_DO_NOT_SHOW_RATERS.csv"
OUT = HERE.parent / "results" / "native_rating_summary.md"
C = {"spell": "spelling_and_grammar_1to5", "nat": "sounds_natural_1to5", "ekav": "serbian_or_ekavian_forms(yes/no)",
     "diac": "missing_or_wrong_diacritics(yes/no)", "wrong": "meaning_wrong(yes/no)"}


def main():
    rows = list(csv.DictReader(open(SHEET, encoding="utf-8-sig", newline="")))
    key = {r["item"]: r["system"] for r in csv.DictReader(open(KEY, encoding="utf-8", newline=""))}
    raters = sorted({c.rsplit("_", 1)[1] for c in rows[0] if c.startswith(C["nat"] + "_")})
    by = defaultdict(list)
    for r in rows:
        by[key[r["item"]]].append(r)
    head = ["system", "items"] + [f"natural {n}" for n in raters] + [f"spelling {n}" for n in raters] + ["ekavian", "diacritics", "meaning wrong"]
    table = []
    for s, rs in by.items():
        line = [s, str(len(rs))]
        for c in ("nat", "spell"):
            line += [f"{st.mean(float(r[f'{C[c]}_{n}']) for r in rs):.2f}" for n in raters]
        line += [str(sum(1 for r in rs if any(r[f"{C[c]}_{n}"].strip().lower() == "yes" for n in raters))) for c in ("ekav", "diac", "wrong")]
        table.append(line)
    table.sort(key=lambda l: -sum(float(x) for x in l[2:2 + len(raters)]))
    md = "| " + " | ".join(head) + " |\n|" + "---|" * len(head) + "\n" + "\n".join("| " + " | ".join(l) + " |" for l in table)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("# Native-speaker rating by system\n\nMeans per rater (1-5); counts are items (of the system's items) that at least one rater flagged 'yes'. "
                   "Items per system are few, so differences of a few tenths are not reliable.\n\n" + md + "\n", encoding="utf-8")
    print(md)
    print(f"-> {OUT}")


if __name__ == "__main__":
    main()

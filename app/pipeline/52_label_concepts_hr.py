"""Step 52: draft Croatian names for the concepts in data/review/concept_labels_hr.csv (column label_hr_draft).

The model (config role `translation`, profile gemma31b_q8) translates the English concept label in batches. It is given the owner's
reviewed Croatian topic names as a glossary so the same terms are used the same way. Results are cached in
data/concept_labels_hr_cache.jsonl (resumable). Rows that already have a label_hr_reviewed are left alone.
This is a draft for the owner to review, not a final text.

Usage: python pipeline/52_label_concepts_hr.py [--profile gemma31b_q8] [--limit N] [--batch 40] [--load-only]
--load-only copies the CSV (reviewed wording first, else the draft) into the table concept_label; run it again after the owner's review.
"""
import argparse
import csv
import json
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlas.config import load_profile, _ollama_url  # noqa: E402
from common import connect  # noqa: E402

APP = Path(__file__).resolve().parent.parent
LABELS = APP / "data" / "review" / "concept_labels_hr.csv"
TOPICS = APP / "data" / "review" / "topic_labels_hr.csv"
CACHE = APP / "data" / "concept_labels_hr_cache.jsonl"

SYSTEM = """You translate short English labels from Erasmus+ education projects into Croatian for a public website.
Rules:
- Standard Croatian (hrvatski standardni jezik), ijekavian, never Serbian forms. Formal register.
- Keep the label short and as a noun phrase, like the English one; no full stops, no quotation marks.
- Use correct diacritics (č ć š ž đ).
- Use the glossary terms when the English wording matches: the same English term must get the same Croatian term.
- Keep proper names and acronyms (eTwinning, ECVET, STEM, ICT -> IKT is allowed) as they are in Croatian use.
- Do not explain. Reply with JSON only: {"<id>": "<Croatian label>", ...} with exactly the ids you were given."""


def glossary():
    rows = list(csv.DictReader(open(TOPICS, encoding="utf-8")))
    return "\n".join(f"{r['topic']} = {r['label_hr_reviewed'] or r['label_hr_draft']}" for r in rows[:40])


def ask(url, model, system, user, num_ctx):
    body = {"model": model, "stream": False, "think": False, "format": "json", "keep_alive": "30m",
            "options": {"temperature": 0.0, "num_ctx": num_ctx},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    req = urllib.request.Request(url + "/api/chat", json.dumps(body).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=900) as r:
        return json.loads(json.loads(r.read())["message"]["content"])


def load_into_db():
    """Table concept_label(node_id, label_hr): the owner's reviewed wording, else the draft; EU topics are named 'TOP:<English name>'."""
    out = [(r["concept_id"], r["label_hr_reviewed"].strip() or r["label_hr_draft"].strip()) for r in csv.DictReader(open(LABELS, encoding="utf-8"))]
    out += [("TOP:" + r["topic"], r["label_hr_reviewed"].strip() or r["label_hr_draft"].strip()) for r in csv.DictReader(open(TOPICS, encoding="utf-8"))]
    out = [x for x in out if x[1]]
    con = connect()
    con.execute("create or replace table concept_label(node_id varchar, label_hr varchar)")
    con.executemany("insert into concept_label values (?,?)", out)         # about 2,400 rows
    con.close()
    print(f"concept_label: {len(out)} Croatian names in the database")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="gemma31b_q8")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--batch", type=int, default=40)
    ap.add_argument("--load-only", action="store_true", help="only copy the names in the CSV into the database table concept_label")
    a = ap.parse_args()
    if a.load_only:
        load_into_db()
        return
    spec = load_profile(a.profile)["translation"]
    url = _ollama_url(spec)
    rows = list(csv.DictReader(open(LABELS, encoding="utf-8")))
    cache = {}
    if CACHE.exists():
        for line in CACHE.open(encoding="utf-8"):
            d = json.loads(line)
            cache[d["concept_id"]] = d["hr"]
    todo = [r for r in rows if r["concept_id"] not in cache and not r["label_hr_reviewed"]]
    if a.limit:
        todo = todo[:a.limit]
    system = SYSTEM + "\n\nGlossary (English = Croatian):\n" + glossary()
    print(f"{len(rows)} concepts, {len(cache)} already drafted, {len(todo)} to do ({spec.model})")
    t0 = time.time()
    for lo in range(0, len(todo), a.batch):
        chunk = todo[lo:lo + a.batch]
        user = "Translate these labels:\n" + json.dumps({r["concept_id"]: r["label_en"] for r in chunk}, ensure_ascii=False)
        try:
            out = ask(url, spec.model, system, user, 8192)
        except Exception as e:                                   # one bad batch must not stop a long run
            print("  batch failed:", repr(e)[:120])
            continue
        with CACHE.open("a", encoding="utf-8") as f:
            for r in chunk:
                hr = out.get(r["concept_id"])
                if isinstance(hr, str) and hr.strip():
                    cache[r["concept_id"]] = hr.strip()
                    f.write(json.dumps({"concept_id": r["concept_id"], "hr": hr.strip()}, ensure_ascii=False) + "\n")
        done = lo + len(chunk)
        print(f"  {done}/{len(todo)}  {time.time() - t0:.0f}s", flush=True)
    for r in rows:
        if r["concept_id"] in cache:
            r["label_hr_draft"] = cache[r["concept_id"]]
    with open(LABELS, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print(f"drafted {sum(1 for r in rows if r['label_hr_draft'])} of {len(rows)} -> {LABELS.name}")
    load_into_db()


if __name__ == "__main__":
    main()

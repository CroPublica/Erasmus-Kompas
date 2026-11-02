"""Step 61: short names for the concept groups (communities from step 60), drafted by the model for the owner to review.

Reads   community (profile with the top concepts of each group)
Writes  data/review/community_names.csv   community_id, label_en_draft, label_hr_draft, label_en_reviewed, label_hr_reviewed, top_concepts
        table community_name              the reviewed name when there is one, else the draft
The model sees only the group's top approaches, target groups, outputs, problems and EU topics; it names what they have in common.
A name describes content; it does not say a group is good or bad. Rows with a reviewed name are not redrafted.
Usage: python pipeline/61_name_communities.py [--profile gemma31b_q8] [--load-only]
"""
import argparse
import csv
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlas.config import load_profile, _ollama_url  # noqa: E402
from common import connect  # noqa: E402

APP = Path(__file__).resolve().parent.parent
OUT = APP / "data" / "review" / "community_names.csv"
FIELDS = ["community_id", "label_en_draft", "label_hr_draft", "label_en_reviewed", "label_hr_reviewed", "top_concepts"]

SYSTEM = """You name groups of related concepts from Erasmus+ education projects, for a public website.
You get the most frequent approaches, target groups, outputs, problems and EU topics of one group.
Reply with JSON only: {"en": "<name>", "hr": "<name>"}.
Rules:
- 3 to 6 words, a noun phrase that says what the projects in the group are about or do; no full stop, no quotation marks.
- Neutral and descriptive. Never say a group is good, successful, best or typical.
- Use the concepts you are given; do not invent topics that are not there.
- Croatian: standard Croatian (ijekavian), correct diacritics (č ć š ž đ), formal register."""


def sentence_case(s):
    """'Innovative Teaching Materials' -> 'Innovative teaching materials'; acronyms (ICT) and names with inner capitals are kept."""
    words = s.split()
    return " ".join((w if sum(c.isupper() for c in w) >= 2 or i == 0 else w.lower()) if i else (w[:1].upper() + (w[1:] if sum(c.isupper() for c in w) >= 2 else w[1:].lower())) for i, w in enumerate(words))


def ask(url, model, user):
    body = {"model": model, "stream": False, "think": False, "format": "json", "keep_alive": "30m", "options": {"temperature": 0.0, "num_ctx": 4096},
            "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}]}
    req = urllib.request.Request(url + "/api/chat", json.dumps(body).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(json.loads(r.read())["message"]["content"])


def summary_of(prof):
    top = json.loads(prof)
    flat = lambda k: "; ".join(x[0] if isinstance(x, list) else x for x in top[k][:5])
    return f"Approaches: {flat('top_approach')}\nTarget groups: {flat('top_target_group')}\nOutputs: {flat('top_output')}\nProblems: {flat('top_problem')}\nEU topics: {flat('top_topic')}"


def load_into_db():
    rows = list(csv.DictReader(open(OUT, encoding="utf-8", newline="")))
    con = connect()
    now = {cid: summary_of(prof).replace("\n", " | ") for cid, prof in con.execute("select community_id, profile from community").fetchall()}
    stale = [r["community_id"] for r in rows if now.get(r["community_id"]) != r["top_concepts"]]
    if stale:      # step 60 was run again and the groups changed: a name must not stay on a different group
        print(f"WARNING: {len(stale)} groups no longer match their names ({', '.join(stale)}); they get no name until step 61 is run again with --llm")
    out = [(r["community_id"], (r["label_en_reviewed"] or r["label_en_draft"]).strip(), (r["label_hr_reviewed"] or r["label_hr_draft"]).strip()) for r in rows if r["community_id"] not in stale]
    con.execute("create or replace table community_name(community_id varchar, label_en varchar, label_hr varchar)")
    con.executemany("insert into community_name values (?,?,?)", out)
    con.close()
    print(f"community_name: {len(out)} names in the database")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="gemma31b_q8")
    ap.add_argument("--load-only", action="store_true")
    a = ap.parse_args()
    if a.load_only:
        load_into_db()
        return
    spec = load_profile(a.profile)["translation"]
    url = _ollama_url(spec)
    con = connect(read_only=True)
    comms = con.execute("select community_id, profile from community order by community_id").fetchall()
    con.close()
    old = {r["community_id"]: r for r in csv.DictReader(open(OUT, encoding="utf-8", newline=""))} if OUT.exists() else {}
    rows = []
    for cid, prof in comms:
        summary = summary_of(prof)
        r = old.get(cid) or dict.fromkeys(FIELDS, "")
        r.update(community_id=cid, top_concepts=summary.replace("\n", " | "))
        if not r["label_en_reviewed"] or not r["label_hr_reviewed"]:
            try:
                got = ask(url, spec.model, summary)
                r["label_en_draft"], r["label_hr_draft"] = sentence_case(str(got.get("en", "")).strip()), sentence_case(str(got.get("hr", "")).strip())
            except Exception as e:
                print(f"  {cid}: failed {e!r:.100}")
        print(f"  {cid}: {r['label_en_draft']}  /  {r['label_hr_draft']}")
        rows.append(r)
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    load_into_db()


if __name__ == "__main__":
    main()

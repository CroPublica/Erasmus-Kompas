"""Step 50: extract problems, target groups, approaches and outputs from project summaries with an LLM (BUILD_PLAN §7).

For each project with a summary, the model (config role `extraction`, via Ollama) returns JSON with a fixed schema:
  problems       [{text, evidence}]            what need or problem the project says it addresses
  target_groups  [text]                        who it is aimed at
  approaches     [{text, evidence}]            what the project does or uses
  outputs        [{text, status, evidence}]    products and results; status planned | reported
`evidence` is a short verbatim quote from the summary. It is checked against the text: quotes that do not occur there are
kept but flagged evidence_verified = false, so a model cannot cite invented sentences without it showing.
Acronyms defined in the text are expanded in the prompt ("RC" -> "repair cafe"); project names and programme boilerplate
are excluded. Output language is English; Croatian labels come in step 51.

Results are cached per project in data/extraction_cache.jsonl (resumable) and loaded into the table concept_mention.

Usage: python pipeline/50_extract_concepts.py [--limit N] [--profile NAME] [--period 2021-2027|2014-2020] [--reload]
  --limit N   only N projects (spread evenly through the list); use for tests
  --ids FILE  only the project ids listed in FILE (one per line); overrides --limit
  --reload    do not call the model, only rebuild the table from the cache
"""
import argparse
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from atlas.config import load_profile, max_concurrency            # noqa: E402
from common import APP_DIR, connect                                # noqa: E402

CACHE = APP_DIR / "data" / "extraction_cache.jsonl"
PROMPT_VERSION = "v2"          # v1 = first prompt (capped lists, products only); v2 follows the gold-set corrections of 2026-10/11
MAX_CHARS = 7000

SCHEMA = {
    "type": "object",
    "properties": {
        "problems": {"type": "array", "items": {"type": "object", "properties": {
            "text": {"type": "string"}, "evidence": {"type": "string"}}, "required": ["text", "evidence"]}},
        "target_groups": {"type": "array", "items": {"type": "string"}},
        "approaches": {"type": "array", "items": {"type": "object", "properties": {
            "text": {"type": "string"}, "evidence": {"type": "string"}}, "required": ["text", "evidence"]}},
        "outputs": {"type": "array", "items": {"type": "object", "properties": {
            "text": {"type": "string"}, "status": {"type": "string", "enum": ["planned", "reported"]},
            "evidence": {"type": "string"}}, "required": ["text", "status", "evidence"]}},
    },
    "required": ["problems", "target_groups", "approaches", "outputs"],
}

INSTRUCTIONS_V1 = """You read the summary of an Erasmus+ cooperation project and extract structured facts.
Answer in English with JSON only, following the schema. Rules:
- problems: the need, gap or problem the project says it addresses (max 4). Short noun phrase, e.g. "lack of practical repair skills".
- target_groups: who the project is for (max 5), e.g. "secondary school teachers", "young people with fewer opportunities".
- approaches: what the project actually does or uses, e.g. "peer mentoring", "repair cafe", "gamified online course" (max 6).
- outputs: concrete products or results (max 6), e.g. "toolkit for teachers", "mobile app". status: "planned" if it is described as something
  to be made or expected, "reported" if the text says it was made or achieved.
- evidence: copy a short exact quote (at most 25 words) from the summary that supports the item. Never invent a quote.
- Expand abbreviations that the text defines (write "library of things", not "LoT").
- Do not list the project's own name, the partner organisations, or generic programme wording (for example "European added value",
  "Erasmus+", "dissemination", "project management").
- If the summary says nothing for a field, return an empty list for it.
Project status: {status}.

SUMMARY:
{text}"""


INSTRUCTIONS_V2 = """You read the summary of an Erasmus+ cooperation project and extract structured facts.
Answer in English with JSON only, following the schema. Be thorough: list every distinct item the text states or clearly implies, one item per idea
(do not merge two ideas, do not repeat one idea in other words). Rules:
- problems (up to 8): every need, gap, challenge or problem the project addresses, including needs that are only implied by the objectives, e.g.
  "need to upgrade trainers' skills and teaching methods", "limited inclusion of students from disadvantaged backgrounds", "low media literacy
  among young people", "polarisation". Short noun phrase.
- target_groups (up to 8): every group the project is for or works with, e.g. "secondary school teachers", "young people with fewer opportunities".
- approaches (up to 12): every activity, method or way of working the project carries out or uses: needs research or assessment, workshops,
  pilot sessions, training and training of trainers, student or staff mobilities and exchanges, peer learning, exchange of practices, co-creation,
  mentoring, experiential learning, and any named method (e.g. "restorative practices", "animal-assisted interventions", "eTwinning collaboration").
  Short noun phrase.
- outputs (up to 12): both (a) concrete products (toolkit, course, curriculum with its level, platform, handbook, videos) and (b) expected or achieved
  results for people (e.g. "improved English language skills of students", "reduced peer bullying", "decreased prejudice towards other nationalities").
  status: "planned" if described as something to be made or expected, "reported" if the text says it was made or achieved.
- evidence: copy a short exact quote (at most 25 words) from the summary that supports the item. Never invent a quote.
- Expand abbreviations that the text defines (write "library of things", not "LoT").
- Do not list the project's own name, the partner organisations, or generic programme wording (for example "European added value",
  "Erasmus+", "dissemination", "project management").
- If the summary says nothing for a field, return an empty list for it.
Project status: {status}.

SUMMARY:
{text}"""
INSTRUCTIONS = {"v1": INSTRUCTIONS_V1, "v2": INSTRUCTIONS_V2}


def clean(text: str) -> str:
    text = re.sub(r"https?://\S+|www\.\S+", " ", text or "")
    return re.sub(r"[ \t]+", " ", re.sub(r"\n{3,}", "\n\n", text)).strip()[:MAX_CHARS]


def squash(s: str) -> str:
    return re.sub(r"[^\w]+", " ", s.lower()).strip()


def call_model(client, spec, text, status):
    options = {"temperature": spec.temperature, "num_ctx": spec.num_ctx or 8192}
    resp = client.chat(model=spec.model, messages=[{"role": "user", "content": INSTRUCTIONS[PROMPT_VERSION].format(status=status, text=text)}],
                       format=SCHEMA, options=options, think=False, keep_alive="10m")
    return json.loads(resp["message"]["content"])


def verify(result: dict, text: str) -> dict:
    hay = squash(text)
    for key in ("problems", "approaches", "outputs"):
        for item in result.get(key, []):
            q = squash(item.get("evidence", ""))
            item["evidence_verified"] = bool(q) and q in hay
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--profile")
    ap.add_argument("--period")
    ap.add_argument("--ids")
    ap.add_argument("--reload", action="store_true")
    ap.add_argument("--prompt", choices=sorted(INSTRUCTIONS), help="prompt version (default: the current PROMPT_VERSION)")
    args = ap.parse_args()
    global PROMPT_VERSION
    if args.prompt:
        PROMPT_VERSION = args.prompt

    spec = load_profile(args.profile)["extraction"]
    tag = f"{spec.model}|{PROMPT_VERSION}"
    done = {}
    if CACHE.exists():
        for line in CACHE.read_text(encoding="utf-8").splitlines():
            if line.strip():
                r = json.loads(line)
                done[(r["project_id"], r["extractor"])] = r

    con = connect()
    rows = con.execute("select project_id, period, status, summary from project where summary is not null "
                       + (f"and period = '{args.period}' " if args.period else "") + "order by project_id").fetchall()
    rows = [r for r in rows if len(clean(r[3])) > 80]
    if args.ids:
        wanted = {l.strip() for l in Path(args.ids).read_text(encoding="utf-8").splitlines() if l.strip()}
        rows = [r for r in rows if r[0] in wanted]
    elif args.limit:
        rows = rows[:: max(1, len(rows) // args.limit)][: args.limit]

    todo = [r for r in rows if (r[0], tag) not in done]
    if not args.reload and todo:
        import ollama
        client = ollama.Client(host=load_url())
        workers = max_concurrency()
        print(f"{len(rows)} projects, {len(todo)} to extract with {spec.model} ({workers} parallel)", flush=True)
        t0 = time.time()

        def work(r):
            pid, period, status, summary = r
            text = clean(summary)
            try:
                res = verify(call_model(client, spec, text, status or "unknown"), text)
            except Exception as e:                       # keep going; failed projects are listed at the end
                return pid, None, str(e)[:200]
            return pid, res, None

        failed = []
        with ThreadPoolExecutor(workers) as ex, open(CACHE, "a", encoding="utf-8") as out:
            for i, (pid, res, err) in enumerate(ex.map(work, todo), 1):
                if res is None:
                    failed.append((pid, err))
                    continue
                rec = {"project_id": pid, "extractor": tag, **res}
                out.write(json.dumps(rec, ensure_ascii=False) + "\n")
                out.flush()
                done[(pid, tag)] = rec
                if i % 10 == 0 or i == len(todo):
                    print(f"  {i}/{len(todo)}  {time.time() - t0:.0f}s ({(time.time() - t0) / i:.1f}s per project)", flush=True)
        if failed:
            print(f"{len(failed)} failed, e.g. {failed[:3]}")

    # ---- table
    con.execute("create or replace table concept_mention(project_id varchar, kind varchar, text varchar, status varchar, "
                "evidence varchar, evidence_verified boolean, extractor varchar)")
    ins = []
    for (pid, ex_tag), r in done.items():
        if ex_tag != tag:
            continue
        for kind, key in (("problem", "problems"), ("approach", "approaches"), ("output", "outputs")):
            for it in r.get(key, []):
                ins.append((pid, kind, it["text"].strip(), it.get("status"), it.get("evidence"), it.get("evidence_verified"), tag))
        for t in r.get("target_groups", []):
            ins.append((pid, "target_group", t.strip(), None, None, None, tag))
    con.executemany("insert into concept_mention values (?,?,?,?,?,?,?)", ins)
    n_proj = len({pid for (pid, ex_tag) in done if ex_tag == tag})
    print(f"concept_mention: {len(ins):,} rows for {n_proj:,} projects ({tag})")
    for kind, n, v in con.execute("select kind, count(*), avg(evidence_verified::int) from concept_mention group by 1 order by 1").fetchall():
        print(f"  {kind:13s} {n:>6,}   evidence found in the text: " + (f"{v:.0%}" if v is not None else "n/a"))
    con.close()


def load_url():
    from atlas.config import _ollama_url
    return _ollama_url(load_profile()["extraction"])


if __name__ == "__main__":
    main()

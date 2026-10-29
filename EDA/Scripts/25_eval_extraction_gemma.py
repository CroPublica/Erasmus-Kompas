"""Check the regex concept extraction (23_extract_summary_concepts.py) against a local LLM (Ollama, gemma4).

For a seeded sample of projects, Gemma is shown the summary plus the SAME fixed concept lists the regexes use and
asked, one concept type per call, which concepts apply (answers are concept names). Agreement with the graph's edges is reported per concept type and per concept.
Gemma is an imperfect reference, so numbers are agreement, not true precision/recall.

Usage: python 25_eval_extraction_gemma.py [n_structured] [n_unstructured]     (defaults 60 40)
Writes Data/processed/extraction_eval_gemma.json (raw answers) and Reports/extraction_eval_gemma.md.
Needs a running Ollama with the model below. Resumable: answers already in the json are reused.
"""
import importlib.util
import json
import random
import re
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
PROC = ROOT / "Data" / "processed"
MODEL = "gemma4:latest"
KINDS = {"Problem": "ADDRESSES", "TargetGroup": "TARGETS", "Approach": "USES", "Output": "PRODUCES"}
KIND_HELP = {
    "Problem": "problems/needs the project says it addresses",
    "TargetGroup": "groups the project is aimed at or works with",
    "Approach": "methods/approaches the project actually uses or implements",
    "Output": "concrete outputs/products/results the project produces",
}

# reuse the vocabularies from script 23 without running it (its top level processes data)
src = (Path(__file__).parent / "23_extract_summary_concepts.py").read_text(encoding="utf-8")
head = src[src.index("PROBLEMS = {"):src.index("SECTIONS = (")]
ns = {}
exec(head, ns)  # defines PROBLEMS, TARGET_GROUPS, APPROACHES, OUTPUTS
VOCAB = {"Problem": list(ns["PROBLEMS"]), "TargetGroup": list(ns["TARGET_GROUPS"]),
         "Approach": list(ns["APPROACHES"]), "Output": list(ns["OUTPUTS"])}

graph = json.loads((PROC / "knowledge_graph.json").read_text(encoding="utf-8"))
by_id = {n["id"]: n for n in graph["nodes"]}
pred = defaultdict(lambda: defaultdict(set))  # project id -> kind -> concept names
rel2kind = {v: k for k, v in KINDS.items()}
for e in graph["edges"]:
    if e["type"] in rel2kind:
        pred[e["source"]][rel2kind[e["type"]]].add(by_id[e["target"]]["name"])

ka2 = pd.concat([pd.read_parquet(PROC / f"ka2_{p}.parquet", columns=["Project Identifier", "Project Summary"])
                 for p in ("2014-2020", "2021-2027")])
ka2["Project Identifier"] = ka2["Project Identifier"].str.strip()
summary_of = dict(zip(ka2["Project Identifier"], ka2["Project Summary"]))

projects = [n for n in graph["nodes"] if n["label"] == "Project" and "summary_structured" in n]
kid = lambda n: n.get("ka2_identifier") or n["project_id"]
n_s, n_u = (int(a) for a in sys.argv[1:3]) if len(sys.argv) > 2 else (60, 40)
rng = random.Random(7)
structured = [n for n in projects if n["summary_structured"]]
unstructured = [n for n in projects if not n["summary_structured"]]
sample = rng.sample(structured, n_s) + rng.sample(unstructured, n_u)

OUT = PROC / "extraction_eval_gemma.json"
answers = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}


def prompt(kind, text):
    names = "\n".join(f"- {n}" for n in VOCAB[kind])
    return (f"Read this Erasmus+ project summary. Which of the following {kind} concepts ({KIND_HELP[kind]}) clearly "
            "apply to it? Choose only concepts the summary clearly supports; choose none if unsure. Copy the "
            'names exactly from the list. Answer with JSON only: {"concepts": ["name", ...]}.\n\n'
            f"{kind} concepts:\n{names}\n\nSUMMARY:\n{text[:7000]}")


def ask(kind, text):
    body = json.dumps({"model": MODEL, "stream": False, "think": False, "format": "json", "keep_alive": "30m",
                       "options": {"temperature": 0, "num_ctx": 8192},
                       "messages": [{"role": "user", "content": prompt(kind, text)}]}).encode()
    req = urllib.request.Request("http://localhost:11434/api/chat", body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(json.loads(r.read())["message"]["content"])


t0 = time.time()
for i, n in enumerate(sample):
    k = kid(n)
    if k in answers:
        continue
    text = re.sub(r"https?://\S+", " ", summary_of[k])
    try:
        ans = {}
        for kind in VOCAB:
            lookup = {v.lower(): v for v in VOCAB[kind]}
            got = ask(kind, text).get("concepts", [])
            ans[kind] = sorted({lookup[c.strip().lower()] for c in got if isinstance(c, str) and c.strip().lower() in lookup})
        answers[k] = ans
    except Exception as ex:  # keep going; failed projects are reported
        print("failed", k, ex)
        continue
    OUT.write_text(json.dumps(answers, ensure_ascii=False, indent=1), encoding="utf-8")
    if i % 10 == 0:
        print(f"{i + 1}/{len(sample)}  {time.time() - t0:.0f}s", flush=True)

# ---------------------------------------------------------------- compare
def score(subset):
    tp, fp, fn = defaultdict(int), defaultdict(int), defaultdict(int)
    per = defaultdict(lambda: [0, 0, 0])  # concept -> tp, fp, fn
    for n in subset:
        k = kid(n)
        if k not in answers:
            continue
        for kind in VOCAB:
            a, g = pred[n["id"]][kind], set(answers[k][kind])
            tp[kind] += len(a & g); fp[kind] += len(a - g); fn[kind] += len(g - a)
            for c in a & g: per[(kind, c)][0] += 1
            for c in a - g: per[(kind, c)][1] += 1
            for c in g - a: per[(kind, c)][2] += 1
    return tp, fp, fn, per


def pct(a, b):
    return f"{a / b:.0%}" if b else "–"


lines = ["# Extraction check against a local LLM (gemma4 8B via Ollama)", "",
         f"Sample: {n_s} projects with labelled sections + {n_u} without, seed 7 "
         f"({sum(1 for n in sample if kid(n) in answers)} answered). Gemma was shown the same fixed concept lists "
         "as the regexes. **Agreement, not ground truth**: Gemma also makes mistakes. 'Regex precision' = share of "
         "regex edges Gemma also chose; 'regex recall' = share of Gemma's choices the regex also found.", ""]
for title, subset in [("All sampled projects", sample),
                      ("Labelled sections", [n for n in sample if n["summary_structured"]]),
                      ("No sections (whole text matched)", [n for n in sample if not n["summary_structured"]])]:
    tp, fp, fn, per = score(subset)
    lines += [f"## {title}", "", "| Concept type | Regex edges | Gemma edges | Both | Regex precision | Regex recall |",
              "|---|---:|---:|---:|---:|---:|"]
    for kind in VOCAB:
        lines.append(f"| {kind} | {tp[kind] + fp[kind]} | {tp[kind] + fn[kind]} | {tp[kind]} | "
                     f"{pct(tp[kind], tp[kind] + fp[kind])} | {pct(tp[kind], tp[kind] + fn[kind])} |")
    lines.append("")
    if title == "All sampled projects":
        weak = sorted(((c, t, f, m) for (_, c), (t, f, m) in per.items() if t + f >= 8),
                      key=lambda x: x[1] / (x[1] + x[2]))
        lines += ["### Concepts the regex over-assigns (≥ 8 regex edges, lowest agreement first)", "",
                  "| Concept | Regex edges | Gemma agrees | Agreement |", "|---|---:|---:|---:|"]
        lines += [f"| {c} | {t + f} | {t} | {pct(t, t + f)} |" for c, t, f, m in weak[:10]]
        missed = sorted(((c, t, f, m) for (_, c), (t, f, m) in per.items() if t + m >= 8),
                        key=lambda x: x[1] / (x[1] + x[3]))
        lines += ["", "### Concepts the regex misses (≥ 8 Gemma edges, lowest recall first)", "",
                  "| Concept | Gemma edges | Regex finds | Recall |", "|---|---:|---:|---:|"]
        lines += [f"| {c} | {t + m} | {t} | {pct(t, t + m)} |" for c, t, f, m in missed[:10]]
        lines.append("")
(ROOT / "Reports" / "extraction_eval_gemma.md").write_text("\n".join(lines), encoding="utf-8")
print("\n".join(lines))

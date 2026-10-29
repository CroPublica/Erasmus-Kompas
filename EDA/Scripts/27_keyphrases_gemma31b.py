"""LLM keyphrase pass with google/gemma-4-31B-it (local HF cache, loaded 4-bit with bitsandbytes).

For every Project with a KA2 summary, asks the model for 6-8 specific topical keyphrases and stores them as
`keyphrases_llm` on the Project node of knowledge_graph.json. The spaCy `keyphrases` (26) and TF-IDF `keywords` (23)
are left untouched. Answers are cached in Data/processed/keyphrases_llm.json, so the run is resumable; the graph is
re-read and written only at the very end.

Usage: python 27_keyphrases_gemma31b.py [limit]      # limit = only the first N projects (smoke test)
"""
import json
import re
import sys
import time
from pathlib import Path

import pandas as pd
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

PROC = Path(__file__).resolve().parent.parent / "Data" / "processed"
GRAPH = PROC / "knowledge_graph.json"
CACHE = PROC / "keyphrases_llm.json"
MODEL = "google/gemma-4-31B-it"
BATCH, MAX_CHARS, MAX_NEW = 8, 6000, 100
limit = int(sys.argv[1]) if len(sys.argv) > 1 else None

graph = json.loads(GRAPH.read_text(encoding="utf-8"))
ka2 = pd.concat([pd.read_parquet(PROC / f"ka2_{p}.parquet", columns=["Project Identifier", "Project Summary"])
                 for p in ("2014-2020", "2021-2027")])
ka2["Project Identifier"] = ka2["Project Identifier"].str.strip()
summary_of = dict(zip(ka2["Project Identifier"], ka2["Project Summary"]))
projects = [n for n in graph["nodes"] if n["label"] == "Project" and "summary_structured" in n]
kid = lambda n: n.get("ka2_identifier") or n["project_id"]
if limit:
    projects = projects[:: max(1, len(projects) // limit)][:limit]
clean = lambda t: re.sub(r"\s+", " ", re.sub(r"<<[^>]*>>|https?://\S+|www\.\S+", " ", t or "")).strip()[:MAX_CHARS]

cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
todo = sorted((n for n in projects if kid(n) not in cache and len(clean(summary_of[kid(n)])) > 40),
              key=lambda n: len(clean(summary_of[kid(n)])))  # similar lengths per batch
print(f"{len(projects)} projects, {len(todo)} to do", flush=True)

tok = AutoTokenizer.from_pretrained(MODEL)
tok.padding_side = "left"
t0 = time.time()
model = AutoModelForCausalLM.from_pretrained(
    MODEL, device_map={"": 0}, torch_dtype=torch.bfloat16,
    quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                                           bnb_4bit_compute_dtype=torch.bfloat16))
model.eval()
print(f"model loaded in {time.time() - t0:.0f}s, GPU {torch.cuda.memory_allocated() / 1e9:.1f} GB", flush=True)

INSTR = ("Extract 6 to 8 keyphrases that describe what this Erasmus+ project is about. Rules: each keyphrase is a "
         "specific topical noun phrase of 1-4 words, in English, lower case (e.g. \"trauma-informed care\", \"peer "
         "mentoring\", \"circular economy\"); cover the problem, the target group, the method and the outputs; no "
         "organisation, place or person names; no generic words like project, partners, activities, results, "
         "training or learning on their own. Answer with a JSON list of strings only.\n\nSUMMARY:\n")


def build(text):
    msgs = [{"role": "user", "content": INSTR + text}]
    try:
        return tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, enable_thinking=False)
    except TypeError:
        return tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)


def parse(out):
    m = re.search(r"\[.*?\]", out, re.S)
    try:
        items = json.loads(m.group(0)) if m else []
    except json.JSONDecodeError:
        items = re.findall(r'"([^"]{3,60})"', out)
    seen, res = set(), []
    for x in items:
        if isinstance(x, str):
            x = re.sub(r"\s+", " ", x.strip().lower())
            if 3 <= len(x) <= 60 and x not in seen:
                seen.add(x)
                res.append(x)
    return res[:8]


t0 = time.time()
for b in range(0, len(todo), BATCH):
    batch = todo[b:b + BATCH]
    enc = tok([build(clean(summary_of[kid(n)])) for n in batch], return_tensors="pt", padding=True).to("cuda")
    with torch.no_grad():
        gen = model.generate(**enc, max_new_tokens=MAX_NEW, do_sample=False)
    outs = tok.batch_decode(gen[:, enc["input_ids"].shape[1]:], skip_special_tokens=True)
    for n, o in zip(batch, outs):
        cache[kid(n)] = parse(o)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    done = b + len(batch)
    print(f"{done}/{len(todo)}  {time.time() - t0:.0f}s  ({(time.time() - t0) / done:.1f}s/project)", flush=True)

# merge into the graph (re-read: another script may have updated it meanwhile)
graph = json.loads(GRAPH.read_text(encoding="utf-8"))
n_set = 0
for n in graph["nodes"]:
    if n["label"] == "Project" and "summary_structured" in n and kid(n) in cache:
        n["keyphrases_llm"] = cache[kid(n)]
        n_set += 1
if not limit:
    GRAPH.write_text(json.dumps(graph, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"keyphrases_llm set on {n_set} projects" + (" (smoke test: graph not written)" if limit else ""))
for n in projects[: 5]:
    if kid(n) in cache:
        print(kid(n), "\n  spaCy:", n.get("keyphrases"), "\n  LLM  :", cache[kid(n)])

"""Add `keyphrases` to Project nodes of knowledge_graph.json (run after 23_extract_summary_concepts.py).

Method: spaCy noun chunks -> lemmatised, stop words/numbers/determiners removed -> leading filler adjectives stripped, generic head nouns dropped -> keep phrases of >= 2 words
that do not overlap a named entity (places, organisations, people) -> rank by tf * idf over all summaries (x2.5 if the phrase shares a word with the project's TF-IDF `keywords`)
(phrases in < MIN_DF or > MAX_DF_SHARE of summaries are dropped) -> top 8, no phrase contained in a better one.
The older TF-IDF `keywords` property is left untouched for comparison. Safe to re-run.
"""
import json
import math
import re
from collections import Counter
from pathlib import Path

import pandas as pd
import spacy

PROC = Path(__file__).resolve().parent.parent / "Data" / "processed"
GRAPH = PROC / "knowledge_graph.json"
MIN_DF, MAX_DF_SHARE, TOP = 2, 0.08, 8
ENT_DROP = {"GPE", "ORG", "PERSON", "LOC", "NORP", "FAC", "PRODUCT", "WORK_OF_ART", "LANGUAGE", "DATE", "CARDINAL"}
GENERIC = {"project", "partner", "partnership", "activity", "result", "objective", "organisation", "organization",
           "participant", "country", "background", "implementation", "year", "number", "way", "order", "end",
           "part", "level", "use", "time", "meeting", "event", "dissemination", "multiplier", "consortium",
           "website", "social medium", "erasmus", "eu", "european union", "intellectual output", "work package"}

HEAD_GENERIC = {"outcome", "development", "set", "way", "event", "challenge", "activity", "issue", "aspect", "factor",
                "goal", "aim", "purpose", "opportunity", "step", "role", "example", "field", "area", "kind", "type",
                "variety", "range", "number", "part", "phase", "stage", "need", "benefit", "value", "step", "case",
                "situation", "context", "approach", "action", "task", "output", "impact", "change", "improvement"}
FILLER_ADJ = {"key", "main", "right", "certain", "rapid", "relevant", "external", "internal", "direct", "visible",
              "unpredictable", "horizontal", "specific", "general", "different", "various", "several", "further",
              "additional", "other", "similar", "overall", "final", "initial", "first", "second", "major", "important",
              "significant", "broad", "wide", "new", "innovative", "concrete", "real", "common", "own", "same", "high",
              "large", "long", "short", "full", "whole", "great", "good", "better", "best", "strong", "particular",
              "potential", "possible", "necessary", "positive", "successful", "effective", "practical", "useful"}
KEYWORD_BOOST = 2.5   # multiplier for phrases sharing a word (5-letter prefix) with the project's TF-IDF keywords

graph = json.loads(GRAPH.read_text(encoding="utf-8"))
ka2 = pd.concat([pd.read_parquet(PROC / f"ka2_{p}.parquet", columns=["Project Identifier", "Project Summary"])
                 for p in ("2014-2020", "2021-2027")])
ka2["Project Identifier"] = ka2["Project Identifier"].str.strip()
summary_of = dict(zip(ka2["Project Identifier"], ka2["Project Summary"]))

projects = [n for n in graph["nodes"] if n["label"] == "Project" and "summary_structured" in n]
texts = [re.sub(r"<<[^>]*>>|https?://\S+|www\.\S+", " ", summary_of[n.get("ka2_identifier") or n["project_id"]])[:20000]
         for n in projects]

nlp = spacy.load("en_core_web_sm")
nlp.max_length = 50000


def phrases(doc):
    out = Counter()
    ent_tokens = {t.i for e in doc.ents if e.label_ in ENT_DROP for t in e}
    for ch in doc.noun_chunks:
        if any(t.i in ent_tokens for t in ch):
            continue
        toks = [t for t in ch if t.is_alpha and not t.is_stop and t.pos_ in ("NOUN", "ADJ", "PROPN")]
        while toks and toks[0].lemma_.lower() in FILLER_ADJ:  # 'broad societal issue' -> 'societal issue'
            toks = toks[1:]
        if toks and toks[-1].lemma_.lower() in HEAD_GENERIC:
            continue
        if len(toks) < 2 or len(toks) > 4 or toks[-1].pos_ not in ("NOUN", "PROPN"):
            continue
        ph = " ".join(t.lemma_.lower() for t in toks)
        if len(ph) < 6 or ph in GENERIC or all(w in GENERIC for w in ph.split()):
            continue
        out[ph] += 1
    return out


counts = [phrases(d) for d in nlp.pipe(texts, batch_size=32, n_process=4)]
N = len(counts)
df = Counter(p for c in counts for p in c)
keep = {p for p, d in df.items() if MIN_DF <= d <= MAX_DF_SHARE * N}

stem = lambda w: w[:5]
for n, c in zip(projects, counts):
    kw = {stem(w) for k in n.get("keywords", []) for w in k.lower().split()}
    boost = lambda p: KEYWORD_BOOST if any(stem(w) in kw for w in p.split()) else 1.0
    scored = sorted(((tf * math.log(N / df[p]) * boost(p), p) for p, tf in c.items() if p in keep), reverse=True)
    chosen = []
    for _, p in scored:
        if not any(p in q or q in p for q in chosen):
            chosen.append(p)
        if len(chosen) == TOP:
            break
    n["keyphrases"] = chosen

GRAPH.write_text(json.dumps(graph, ensure_ascii=False, indent=1), encoding="utf-8")
have = sum(1 for n in projects if n["keyphrases"])
print(f"{have}/{N} projects with keyphrases; {len(keep)} distinct phrases kept (of {len(df)})")
for n in projects[200:2200:400]:
    print(n["project_id"], "\n  keywords  :", n.get("keywords"), "\n  keyphrases:", n["keyphrases"])

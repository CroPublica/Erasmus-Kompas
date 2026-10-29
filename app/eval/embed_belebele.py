"""Croatian question -> English passage retrieval on Belebele (facebook/belebele, CC BY-SA 4.0), to choose the embedding model.

  python eval/embed_belebele.py bge-m3 qwen3-embedding:0.6b embeddinggemma:300m
For each of the 900 Croatian questions, rank the unique English passages by cosine similarity; the right passage is the one of the
same Belebele row. Reports recall@1/5/10, MRR and seconds. Data: eval/data/hrv_Latn.jsonl and eng_Latn.jsonl (downloaded from
https://huggingface.co/datasets/facebook/belebele/resolve/main/data/). Models are served by Ollama (127.0.0.1).
"""
import json, sys, time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
from atlas.config import _ollama_url, ModelSpec  # noqa: E402

# models that need a prefix on queries and/or documents (their model cards)
PREFIX = {
    "qwen3-embedding": ("Instruct: Given a question, retrieve the passage that answers it\nQuery: ", ""),
    "embeddinggemma": ("task: search result | query: ", "title: none | text: "),
}


def load(name):
    return [json.loads(l) for l in open(ROOT / "data" / f"{name}.jsonl", encoding="utf-8")]


def embed(model, texts, batch=32):
    from langchain_ollama import OllamaEmbeddings
    emb = OllamaEmbeddings(model=model, base_url=_ollama_url(ModelSpec(provider="ollama", model=model)))
    out = []
    for i in range(0, len(texts), batch):
        out += emb.embed_documents(texts[i:i + batch])
    m = np.array(out, dtype="float32")
    return m / np.linalg.norm(m, axis=1, keepdims=True)


def main(models):
    hr, en_all = load("hrv_Latn"), load("eng_Latn")
    key = lambda r: (r["link"], r["question_number"])       # the files are NOT in the same order: align by article and question number
    en_by = {key(r): r for r in en_all}
    hr = [r for r in hr if key(r) in en_by]
    en = [en_by[key(r)] for r in hr]
    assert len(hr) > 800, len(hr)
    passages = sorted({r["flores_passage"] for r in en})
    index = {p: i for i, p in enumerate(passages)}
    gold = np.array([index[r["flores_passage"]] for r in en])
    questions = [r["question"] for r in hr]
    print(f"{len(questions)} Croatian questions, {len(passages)} English passages")
    for model in models:
        qp, dp = next((v for k, v in PREFIX.items() if model.startswith(k)), ("", ""))
        t0 = time.time()
        D = embed(model, [dp + p for p in passages])
        Q = embed(model, [qp + q for q in questions])
        ranks = (-(Q @ D.T)).argsort(axis=1)
        pos = np.array([int(np.where(ranks[i] == gold[i])[0][0]) for i in range(len(gold))])
        print(f"{model:28s} R@1 {np.mean(pos < 1):.3f}  R@5 {np.mean(pos < 5):.3f}  R@10 {np.mean(pos < 10):.3f}  MRR {np.mean(1 / (pos + 1)):.3f}  {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main(sys.argv[1:] or ["bge-m3"])

"""Run eval/qa_hr.jsonl through the Ask flow and score what can be scored today (plan 5b, quality side).

  python eval/run_ask.py                      template answers (no answer model), router from the active profile
  python eval/run_ask.py --mode llm           the model phrases the answers; the verifier checks them
  python eval/run_ask.py --profile gemma8b --out eval/results/x.json
Questions whose expected tools are not built yet (concept tools, success_rate) or that need the concept layer are listed as skipped.
Grading follows eval/README.md: route, tools, expected facts, language, refusal. Citations are checked inside the flow.
"""
import argparse, json, re, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from atlas.ask import Asker, detect_language  # noqa: E402
from atlas.tools import TOOLS  # noqa: E402

ROUTE_OK = {"lookup": {"organisation", "county", "top_organisations"}, "statistics": {"national", "county", "country_ranking", "top_organisations"},
            "coverage": {"coverage"}, "refuse": None, "limits": None}


def variants(x: str) -> list[str]:
    """An expected string in the forms an answer may use (3.830 / 3,830; 29,4 / 29.4)."""
    v = {x, x.replace(".", ","), x.replace(",", "."), x.replace(".", " "), x.replace(",", " "), x.replace(".", "\u00a0")}
    if re.fullmatch(r"\d{1,3}([.,]\d{3})+", x):
        v.add(re.sub(r"[.,]", "", x))
        v.add(re.sub(r"[.,]", ".", x)); v.add(re.sub(r"[.,]", ",", x))
    out = [t.lower() for t in v]
    if re.fullmatch(r"[^\W\d_]+", x) and len(x) >= 6:                  # a plain word: accept Croatian case endings (Italija -> Italijom)
        out.append(strip_acc(x)[: len(x) - 2])
    return out


def rescore(path):
    """Re-grade a saved results file (after a scoring change) without calling any model."""
    qs = {q["id"]: q for q in (json.loads(l) for l in open(ROOT / "eval" / "qa_hr.jsonl", encoding="utf-8"))}
    d = json.loads(Path(path).read_text())
    for r in d["results"]:
        q = qs[r["id"]]
        text = strip_acc(r["answer"]).replace("\u00a0", " ")
        miss = [e for e in (q["expected"] or []) if not any(strip_acc(v) in text for v in variants(e))]
        r["missing"], r["checks"]["facts"] = miss, (not miss if q["expected"] else None)
    Path(path).write_text(json.dumps(d, ensure_ascii=False, indent=1))
    v = [r["checks"]["facts"] for r in d["results"] if r["checks"]["facts"] is not None]
    print(f"{Path(path).name}: facts {sum(v)}/{len(v)}")


def strip_acc(s: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFKD", s.replace("đ", "d").replace("Đ", "D")) if not unicodedata.combining(c)).lower()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", default=None); ap.add_argument("--profile", default=None); ap.add_argument("--out", default=None)
    ap.add_argument("--only", default=None, help="comma-separated question ids")
    ap.add_argument("--rescore", nargs="+", help="re-grade saved results files, no model calls")
    a = ap.parse_args()
    if a.rescore:
        for f in a.rescore:
            rescore(f)
        return
    qs = [json.loads(l) for l in open(ROOT / "eval" / "qa_hr.jsonl", encoding="utf-8")]
    if a.only:
        qs = [q for q in qs if q["id"] in a.only.split(",")]
    asker = Asker(profile=a.profile, mode=a.mode)
    last = {}
    results, skipped = [], []
    for q in qs:
        need = set(q["tools"])
        buildable = need <= set(TOOLS) and q["route"] not in ("local", "global", "path", "explain")
        if not buildable and q["answerable"]:
            skipped.append((q["id"], sorted(need - set(TOOLS)) or q["route"])); continue
        t0 = time.time()
        r = asker.ask(q["question"], last_org_id=last.get(q.get("follow_up_of")))
        last[q["id"]] = r["last_org_id"]
        text = strip_acc(r["answer"])
        miss = [e for e in (q["expected"] or []) if not any(strip_acc(v) in text for v in variants(e))]
        checks = {
            "route": True if ROUTE_OK.get(q["route"], 1) is None else r["route"] in ROUTE_OK.get(q["route"], {r["route"]}),
            "facts": not miss if q["expected"] else None,
            "language": detect_language(r["answer"]) == q["lang"] if len(r["answer"]) > 40 else True,
            "refusal": (r["route"] in ("out_of_scope", "limits") or bool(re.search(r"nema dokaza|no evidence|ne mogu|can.t answer|nije u podacima|not in the data|nema ka2|has not taken part", text))) if not q["answerable"] else None,
        }
        results.append({"id": q["id"], "question": q["question"], "route": r["route"], "answer": r["answer"], "checks": checks,
                        "missing": miss, "seconds": round(time.time() - t0, 1), "verified": r["verified"], "fallback": r["fallback"]})
    def rate(k):
        v = [x["checks"][k] for x in results if x["checks"][k] is not None]
        return f"{sum(v)}/{len(v)}"
    print(f"graded {len(results)} questions, skipped {len(skipped)} (concept tools / success_rate not built)")
    print(f"route {rate('route')} | facts {rate('facts')} | language {rate('language')} | refusal {rate('refusal')} | "
          f"median {sorted(x['seconds'] for x in results)[len(results) // 2]} s")
    for x in results:
        bad = [k for k, v in x["checks"].items() if v is False]
        if bad:
            print(f"  {x['id']} {bad} route={x['route']} missing={x['missing']} | {x['question'][:70]}\n      -> {x['answer'][:150]}")
    if a.out:
        Path(a.out).write_text(json.dumps({"mode": asker.mode, "profile": a.profile, "results": results, "skipped": skipped}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()

"""Second-source check of the school matches in data/review/school_matches_to_check.csv against the public EU organisation register.

For each school, the name as written in the EU export is looked up (Simple Search, Croatian results only). A match is
'supported' when exactly one Croatian entry has the registry's town and a similar name; 'conflict' when entries exist
but none are in that town; otherwise 'unclear'. The verdict is a suggestion for the reviewer, written to new columns.
Usage:  python tools/check_school_matches.py   (needs Node and site/node_modules; see README)
"""
import csv, json, subprocess, sys
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
from names import norm_name, norm_place  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CSV = ROOT / "data" / "review" / "school_matches_to_check.csv"
CACHE = ROOT / "data" / "esc_cache.json"
HR = "20000911"                       # country code of Croatia in the register's answers


GENERIC = {"osnovna", "skola", "os", "srednja", "ss", "gimnazija", "sk", "i", "ii", "iii", "iv", "v"}


def queries(r):
    """The name as in the EU export, then (as a fallback) its distinctive words plus the town."""
    name = r["names_in_EU_export"].split(" | ")[0]
    words = [w for w in norm_name(name).split() if w not in GENERIC]
    return [name, " ".join(words + [norm_place(r["town"])])]


def tokens(x):
    return frozenset(norm_place(x or "").split())


def main():
    rows = list(csv.DictReader(open(CSV, encoding="utf-8")))
    terms = sorted({t for r in rows for t in queries(r)})
    q = ROOT / "data" / "esc_queries.json"
    q.write_text(json.dumps(terms, ensure_ascii=False))
    subprocess.run(["node", str(ROOT / "tools" / "esc_lookup.mjs"), str(q), str(CACHE)], check=True)
    cache = json.loads(CACHE.read_text())
    out = []
    for r in rows:
        town = tokens(r["town"])
        hits, used = [], None
        for term in queries(r):
            raw = cache.get(term)
            h = [x for x in raw if isinstance(x, dict) and x.get("country") == HR] if isinstance(raw, list) else []
            if h:
                hits, used = h, term
                break
        same = [h for h in hits if tokens(h.get("city")) == town]
        distinct = {norm_name(h.get("legalName") or "") for h in same}
        best = max(same, key=lambda h: SequenceMatcher(None, norm_name(h.get("legalName") or ""), norm_name(r["registry_name"])).ratio(), default=None)
        if len(distinct) == 1:
            verdict = "supported"
        elif len(distinct) > 1:
            verdict = "unclear (several different entries in the town)"
        elif hits:
            verdict = "conflict (entries found, none in the registry town)"
        else:
            verdict = "unclear (nothing found)"
        r.update({"esc_query_used": used or "", "esc_hits_croatia": len(hits), "esc_best_name": best.get("legalName") if best else "",
                  "esc_city": best.get("city") if best else "", "esc_oid": best.get("organisationId") if best else "",
                  "esc_website": best.get("website") if best else "", "esc_registration_no": best.get("registration") if best else "",
                  "esc_verdict": verdict})
        out.append(r)
    fields = list(out[0].keys())
    with open(CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fields); w.writeheader(); w.writerows(out)
    from collections import Counter
    print(Counter(r["esc_verdict"] for r in out))


if __name__ == "__main__":
    main()

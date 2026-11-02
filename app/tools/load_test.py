"""Send N questions at once to the Ask API and report latency and status codes.

  python tools/load_test.py [URL] [N] [--rate]      default http://127.0.0.1:8000/ask, N = 10
With --rate: send 25 questions one after the other from this client to show the per-minute limit (429).
"""
import json, statistics, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

QS = ["Koliko je KA2 projekata imala Gimnazija Metković?", "Koliko organizacija iz Dubrovačko-neretvanske županije sudjeluje u KA2?",
      "Koliki postotak osnovnih i srednjih škola sudjeluje u KA2?", "Kolika je bila stopa prolaznosti KA2 prijava u Hrvatskoj 2023.?",
      "Which country coordinates the most KA2 projects?", "How many KA2 projects does the University of Dubrovnik have?",
      "Koliko KA2 projekata ima Sveučilište u Splitu?", "Je li Zagrebačka županija ispod očekivanja?", "Koja hrvatska organizacija ima najviše projekata?",
      "Koliko je KA2 projekata s hrvatskim sudionicima bilo 2014.–2020.?",
      "Koje su najčešće metode u KA2 projektima?", "What do projects do about early school leaving?", "Which groups of concepts occur together?"]


def one(url, q):
    t0 = time.time()
    req = urllib.request.Request(url, data=json.dumps({"question": q}).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, time.time() - t0
    except urllib.error.HTTPError as e:
        return e.code, time.time() - t0
    except Exception:
        return 0, time.time() - t0


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    url = args[0] if args else "http://127.0.0.1:8000/ask"
    n = int(args[1]) if len(args) > 1 else 10
    if "--rate" in sys.argv:
        codes = [one(url, QS[i % len(QS)])[0] for i in range(25)]
        print("25 questions in a row:", {c: codes.count(c) for c in sorted(set(codes))})
        return
    t0 = time.time()
    with ThreadPoolExecutor(n) as ex:
        res = list(ex.map(lambda i: one(url, QS[i % len(QS)]), range(n)))
    lat = sorted(t for _, t in res)
    print(f"{n} at once: statuses {dict((c, [r[0] for r in res].count(c)) for c in sorted({r[0] for r in res}))}; "
          f"wall {time.time() - t0:.1f}s; latency median {statistics.median(lat):.1f}s, slowest {lat[-1]:.1f}s")


if __name__ == "__main__":
    main()

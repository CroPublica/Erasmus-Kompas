"""Inter-rater agreement between two raters of the Croatian answer-quality rating sheet.

  python eval/gold/interrater_agreement.py                                   reads rating_sheet_rated_combined.csv
  python eval/gold/interrater_agreement.py path/to/sheet.csv

The sheet is either wide (one row per item, rating columns suffixed with the rater, e.g. sounds_natural_1to5_matea) or long
(one row per item and rater, with a rater_name column). Criteria named *_1toN are scored as ordinal scales, *(yes/no) as binary;
comment columns are ignored. Items where either rater left a criterion blank are dropped for that criterion only.

Scales: exact agreement, agreement within one point, Cohen's kappa (unweighted and quadratic-weighted), Krippendorff's alpha
(ordinal and interval), and the mean score of each rater, since a systematic offset between raters shows up there and not in
the agreement figures. Binary: agreement, Cohen's kappa, Krippendorff's alpha (nominal) and Gwet's AC1. Caveat: when 'yes' is
rare, kappa and alpha are low even if the raters almost always agree (the kappa paradox); AC1 is less affected by this.
"""
import csv
import itertools
import re
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
SHARED = ("item", "question", "answer")


def load(path):
    """-> (raters, {criterion: [(rating_a, rating_b), ...]}) with ratings as strings, one pair per item."""
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        header, rows = reader.fieldnames, list(reader)
    ratings = defaultdict(dict)  # (item, criterion) -> {rater: value}
    if "rater_name" in header:
        for r in rows:
            for c in header:
                if c not in SHARED and c not in ("rater_name", "comment"):
                    ratings[(r["item"], c)][r["rater_name"].strip()] = r[c].strip()
    else:
        for r in rows:
            for c in header:
                if c not in SHARED and not c.startswith("comment_"):
                    crit, rater = c.rsplit("_", 1)
                    ratings[(r["item"], crit)][rater] = r[c].strip()
    raters = sorted({rt for v in ratings.values() for rt in v})
    if len(raters) != 2:
        sys.exit(f"expected exactly two raters, found {raters}")
    pairs = defaultdict(list)
    for (item, crit), v in ratings.items():
        a, b = v.get(raters[0], ""), v.get(raters[1], "")
        if a and b:
            pairs[crit].append((a, b))
    return raters, pairs


def cohen_kappa(pairs, cats, quadratic=False):
    k, n, idx = len(cats), len(pairs), {c: i for i, c in enumerate(cats)}
    obs = [[0] * k for _ in range(k)]
    for a, b in pairs:
        obs[idx[a]][idx[b]] += 1
    row = [sum(r) for r in obs]
    col = [sum(obs[i][j] for i in range(k)) for j in range(k)]
    w = (lambda i, j: (i - j) ** 2 / (k - 1) ** 2) if quadratic else (lambda i, j: float(i != j))
    d_obs = sum(w(i, j) * obs[i][j] for i in range(k) for j in range(k)) / n
    d_exp = sum(w(i, j) * row[i] * col[j] for i in range(k) for j in range(k)) / n ** 2
    return 1 - d_obs / d_exp if d_exp else float("nan")


def kripp_alpha(pairs, delta):
    """Krippendorff's alpha for two raters and no missing values within a pair. `delta(x, y)` is the squared distance."""
    values = [v for p in pairs for v in p]
    d_obs = sum(delta(a, b) for a, b in pairs) / len(pairs)
    d_exp = sum(delta(x, y) for x, y in itertools.permutations(values, 2)) / (len(values) * (len(values) - 1))
    return 1 - d_obs / d_exp if d_exp else float("nan")


def ordinal_delta(pairs, cats):
    """Krippendorff's ordinal distance: squared count of values ranked between x and y (halving the end categories)."""
    freq = {c: 0 for c in cats}
    for a, b in pairs:
        freq[a] += 1
        freq[b] += 1
    pos = {c: i for i, c in enumerate(cats)}

    def delta(x, y):
        lo, hi = sorted((pos[x], pos[y]))
        return (sum(freq[cats[g]] for g in range(lo, hi + 1)) - (freq[x] + freq[y]) / 2) ** 2
    return delta


def gwet_ac1(pairs, cats):
    n = len(pairs)
    p_obs = sum(a == b for a, b in pairs) / n
    share = [sum((a == c) + (b == c) for a, b in pairs) / (2 * n) for c in cats]
    p_exp = sum(p * (1 - p) for p in share) / (len(cats) - 1)
    return (p_obs - p_exp) / (1 - p_exp)


def main(path):
    raters, pairs = load(path)
    ra, rb = raters
    print(f"{path.name}: raters {ra} and {rb}\n")
    scales = {c: int(m.group(1)) for c in pairs if (m := re.search(r"1to(\d+)$", c))}
    binary = [c for c in pairs if c.endswith("(yes/no)")]

    if scales:
        print(f"{'scale':30} {'n':>3} {'exact':>6} {'±1':>6} {'kappa':>6} {'qw-kap':>6} {'a-ord':>6} {'a-int':>6} "
              f"{'mean ' + ra:>12} {'mean ' + rb:>12} {rb + ' higher':>12} {ra + ' higher':>12}")
        for c, top in scales.items():
            p = [(int(a), int(b)) for a, b in pairs[c]]
            cats, n = list(range(1, top + 1)), len(p)
            print(f"{c:30} {n:3} {sum(a == b for a, b in p) / n:6.1%} {sum(abs(a - b) <= 1 for a, b in p) / n:6.1%} "
                  f"{cohen_kappa(p, cats):6.2f} {cohen_kappa(p, cats, quadratic=True):6.2f} "
                  f"{kripp_alpha(p, ordinal_delta(p, cats)):6.2f} {kripp_alpha(p, lambda x, y: (x - y) ** 2):6.2f} "
                  f"{sum(a for a, _ in p) / n:12.2f} {sum(b for _, b in p) / n:12.2f} "
                  f"{sum(b > a for a, b in p):12} {sum(a > b for a, b in p):12}")
        print()
    if binary:
        print(f"{'yes/no':40} {'n':>3} {'agree':>6} {'kappa':>6} {'alpha':>6} {'AC1':>6} {'yes ' + ra:>10} {'yes ' + rb:>10}")
        for c in binary:
            p, cats, n = pairs[c], ["no", "yes"], len(pairs[c])
            print(f"{c:40} {n:3} {sum(a == b for a, b in p) / n:6.1%} {cohen_kappa(p, cats):6.2f} "
                  f"{kripp_alpha(p, lambda x, y: float(x != y)):6.2f} {gwet_ac1(p, cats):6.2f} "
                  f"{sum(a == 'yes' for a, _ in p):10} {sum(b == 'yes' for _, b in p):10}")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "rating_sheet_rated_combined.csv")

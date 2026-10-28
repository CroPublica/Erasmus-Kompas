"""Step 20: independent verification of section 5 (KA2) of report_erasmus_registri.md.

Reads the outputs of 19_link_ka2_registri.py with Python's csv module (no pandas),
recomputes the numbers quoted in section 5 and compares them with the report (EXPECTED).
Consistency checks:
  * HR appearances per period/role equal the KA2 totals established in the period reports
    and independently verified by 13_verify_ka2.py (252/2,053 and 354/1,730)
  * KA2 counts per institution in ustanove_ka2_sudjelovanje.csv equal the linked rows
  * NA project counts in ustanove_ka2_sudjelovanje.csv equal those in ustanove_erasmus_sudjelovanje.csv

Usage: python 20_verify_ka2_registri.py
"""
import csv
from collections import Counter, defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
P = BASE / "Data" / "processed"


def read(name):
    with open(P / name, encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


ka = read("ka2_hr_organizacije_poveznice.csv")
part = read("ustanove_ka2_sudjelovanje.csv")
na_part = read("ustanove_erasmus_sudjelovanje.csv")
got = {}
num = lambda v: float(v) if v not in ("", None) else 0.0

got["appearances (period, role)"] = dict(Counter((r["Razdoblje"], r["Uloga"]) for r in ka))
got["linked (period, role)"] = dict(Counter((r["Razdoblje"], r["Uloga"]) for r in ka if r["ID ustanove"]))
got["postal code parsed"] = sum(1 for r in ka if r["Poštanski broj (iz adrese)"])
got["linked by register"] = dict(Counter(r["Registar"] or "(not linked)" for r in ka))

# per-institution counts == linked rows
cnt = defaultdict(Counter)
for r in ka:
    if r["ID ustanove"]:
        role = "koordinator" if r["Uloga"] == "koordinator" else "partner"
        cnt[r["ID ustanove"]][f"KA2 {role} {r['Razdoblje']}"] += 1
got["participation file KA2 counts == linked rows"] = all(
    all(int(num(r[c])) == cnt.get(r["ID ustanove"], Counter())[c] for c in
        ["KA2 koordinator 2014-2020", "KA2 partner 2014-2020", "KA2 koordinator 2021-2027", "KA2 partner 2021-2027"])
    for r in part)
got["NA counts identical to ustanove_erasmus_sudjelovanje.csv"] = all(
    (a["ID ustanove"], a["Broj projekata 2014-2020"], a["Broj projekata 2021-2027"]) ==
    (b["ID ustanove"], b["Broj projekata 2014-2020"], b["Broj projekata 2021-2027"]) for a, b in zip(part, na_part)) \
    and len(part) == len(na_part)

REGS = ["Dječji vrtić", "Osnovna škola", "Srednja škola", "Visoko učilište"]
res = {}
for g in REGS:
    rr = [r for r in part if r["Vrsta registra"] == g]
    na = [num(r["Broj projekata 2014-2020"]) + num(r["Broj projekata 2021-2027"]) > 0 for r in rr]
    co = [num(r["KA2 koordinator 2014-2020"]) + num(r["KA2 koordinator 2021-2027"]) > 0 for r in rr]
    pa = [num(r["KA2 partner 2014-2020"]) + num(r["KA2 partner 2021-2027"]) > 0 for r in rr]
    anyk = [a or b for a, b in zip(co, pa)]
    res[g] = (len(rr), sum(na), sum(anyk), sum(co), sum(pa), sum(a or b for a, b in zip(na, anyk)),
              sum(b and not a for a, b in zip(na, anyk)),
              sum(b and not a and not c for a, b, c in zip(na, anyk, co)))
got["participation (entries, NA, KA2 any, coord, partner, NA or KA2, KA2 only, KA2 only & never coordinator)"] = res

county = defaultdict(lambda: [0, 0, 0])
for r in part:
    if r["Vrsta registra"] in ("Osnovna škola", "Srednja škola"):
        na = num(r["Broj projekata 2014-2020"]) + num(r["Broj projekata 2021-2027"]) > 0
        k2 = sum(num(r[c]) for c in ["KA2 koordinator 2014-2020", "KA2 partner 2014-2020",
                                      "KA2 koordinator 2021-2027", "KA2 partner 2021-2027"]) > 0
        c = county[(r["Županija"], r["Vrsta registra"])]
        c[0] += 1
        c[1] += na
        c[2] += na or k2
got["county (selected): % NA, % NA or KA2"] = {k: (round(100 * v[1] / v[0], 1), round(100 * v[2] / v[0], 1))
                                              for k, v in county.items() if k in [
    ("Međimurska županija", "Osnovna škola"), ("Varaždinska županija", "Osnovna škola"),
    ("Ličko-senjska županija", "Osnovna škola"), ("Istarska županija", "Srednja škola"),
    ("Grad Zagreb", "Osnovna škola"), ("Grad Zagreb", "Srednja škola")]}

EXPECTED = {
    "appearances (period, role)": {("2014-2020", "koordinator"): 252, ("2014-2020", "partner"): 2053,
                                   ("2021-2027", "koordinator"): 354, ("2021-2027", "partner"): 1730},
    "linked (period, role)": {("2014-2020", "koordinator"): 127, ("2014-2020", "partner"): 1117,
                              ("2021-2027", "koordinator"): 110, ("2021-2027", "partner"): 726},
    "postal code parsed": 4354,
    "linked by register": {"Srednja škola": 754, "Osnovna škola": 647, "Visoko učilište": 588, "Dječji vrtić": 76,
                           "Osnovna škola + Srednja škola": 15, "(not linked)": 2309},
    "participation file KA2 counts == linked rows": True,
    "NA counts identical to ustanove_erasmus_sudjelovanje.csv": True,
    "participation (entries, NA, KA2 any, coord, partner, NA or KA2, KA2 only, KA2 only & never coordinator)": {
        "Dječji vrtić": (885, 58, 42, 8, 38, 82, 24, 23), "Osnovna škola": (926, 277, 258, 43, 252, 406, 129, 129),
        "Srednja škola": (443, 283, 225, 58, 213, 335, 52, 52), "Visoko učilište": (133, 54, 42, 17, 40, 65, 11, 8)},
    "county (selected): % NA, % NA or KA2": {
        ("Međimurska županija", "Osnovna škola"): (29.0, 61.3), ("Varaždinska županija", "Osnovna škola"): (33.3, 59.5),
        ("Ličko-senjska županija", "Osnovna škola"): (0.0, 6.7), ("Istarska županija", "Srednja škola"): (47.8, 82.6),
        ("Grad Zagreb", "Osnovna škola"): (38.3, 53.4), ("Grad Zagreb", "Srednja škola"): (52.6, 66.3)},
}
problems = [(k, EXPECTED[k], got[k]) for k in EXPECTED if got[k] != EXPECTED[k]]
print(f"Checked {len(EXPECTED)} statements / consistency checks of section 5: {len(problems)} differ")
for k, e, g in problems:
    print(f"DIFFERS: {k}\n   report    : {e}\n   recomputed: {g}")

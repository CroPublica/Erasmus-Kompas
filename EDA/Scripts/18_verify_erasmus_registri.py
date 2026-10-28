"""Step 18: independent verification of report_erasmus_registri.md.

Reads the outputs of 17_link_registri_erasmus.py with Python's csv module (no pandas),
recomputes the numbers quoted in the report and compares them with the report (EXPECTED).
Also checks internal consistency:
  * every project row of both project lists appears exactly once in the link file
  * project amounts in the link file sum to the project-list totals
  * per-register project counts in the participation file equal the linked project rows
  * every linked row's 'Povezano kao' name equals the normalised register name or a
    normalised variant of it (re-implemented here, independently of script 17)

Usage: python 18_verify_erasmus_registri.py
"""
import csv
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
P = BASE / "Data" / "processed"


def read(name):
    with open(P / name, encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


links = read("erasmus_registar_poveznice.csv")
part = read("ustanove_erasmus_sudjelovanje.csv")
reg = read("ustanove_registar.csv")
pl = {p: read(f"project_list_{p}.csv") for p in ["2014-2020", "2021-2027"]}
got = {}
f = lambda v: float(v) if v not in ("", None) else 0.0

# ---------------- consistency ----------------
got["link rows per period == project-list rows"] = all(
    sum(1 for r in links if r["Razdoblje"] == p) == len(pl[p]) for p in pl)
got["(period, project, beneficiary) keys identical"] = all(
    Counter((r["Projektni broj"], r["Naziv korisnika"]) for r in links if r["Razdoblje"] == p)
    == Counter((r["Projektni broj"], r["Naziv korisnika"]) for r in pl[p]) for p in pl)
got["amount totals equal project lists"] = all(
    abs(sum(f(r["Iznos (EUR)"]) for r in links if r["Razdoblje"] == p) - sum(f(r["Iznos (EUR)"]) for r in pl[p])) < 0.01
    for p in pl)
got["linked rows have register name and ID"] = all(
    (r["ID ustanove"] != "") == (r["Naziv u registru"] != "") for r in links)
# participation file: projects per institution must equal linked rows (count once per institution)
inst_proj = defaultdict(Counter)
for r in links:
    if r["ID ustanove"]:
        inst_proj[r["ID ustanove"]][r["Razdoblje"]] += 1
ok = True
for r in part:
    c = inst_proj.get(r["ID ustanove"], Counter())
    if int(float(r["Broj projekata 2014-2020"])) != c["2014-2020"] or int(float(r["Broj projekata 2021-2027"])) != c["2021-2027"]:
        ok = False
got["participation counts == linked project rows per institution"] = ok
got["participation rows == register rows"] = len(part) == len(reg)


# ---------------- independent name check ----------------
def strip_diacritics(s):
    s = s.replace("đ", "d").replace("Đ", "D")
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def n(s):
    s = strip_diacritics(s).lower()
    s = re.sub(r"[\"'„“”«»˝`´]", "", s)
    s = re.sub(r"^o\.?\s*s\.?\s+", "osnovna skola ", s)
    s = re.sub(r"^s\.?\s*s\.?\s+", "srednja skola ", s)
    s = re.sub(r"^d\.?\s*v\.?\s+", "djecji vrtic ", s)
    s = re.sub(r"^l\.\s*", "i. ", s)
    s = re.sub(r"^(prva|druga|treca|cetvrta)\b", lambda m: {"prva": "i.", "druga": "ii.", "treca": "iii.", "cetvrta": "iv."}[m.group(1)], s)
    s = re.sub(r"[.,;:()\-–/]", " ", s)
    return " ".join(s.split())


bad = []
for r in links:
    if not r["ID ustanove"]:
        continue
    rn, place = n(r["Naziv u registru"]), " ".join(strip_diacritics(r["Mjesto u registru"]).lower().split())
    ok_names = {rn}
    for suf in (f" grad {place}", f" {place}"):
        if rn.endswith(suf):
            ok_names.add(rn[: -len(suf)].strip())
    if r["Povezano kao (normalizirani naziv)"] not in ok_names:
        bad.append((r["Naziv korisnika"], r["Povezano kao (normalizirani naziv)"], r["Naziv u registru"]))
# for the 13 combined schools the other register row may carry the matched name; check both names
names_by_id = defaultdict(set)
for r in reg:
    key = "S:" + r["Šifra ustanove"] if r["Šifra ustanove"] else None
    if key:
        names_by_id[key].add(n(r["Naziv"]))
bad = [b for b in bad if not any(b[1] in names_by_id[k] for k in names_by_id)]
got["linked rows whose matched name is not the (normalised) register name"] = len(bad)

# ---------------- report numbers ----------------
tiers = Counter((r["Razdoblje"], r["Razina povezivanja"]) for r in links)
got["tier counts"] = {k: v for k, v in sorted(tiers.items())}
for p in pl:
    rows = [r for r in links if r["Razdoblje"] == p]
    lk = [r for r in rows if r["ID ustanove"]]
    got[f"{p} linked rows / amount linked"] = (len(lk), round(sum(f(r["Iznos (EUR)"]) for r in lk)))
    by = defaultdict(lambda: [0, 0.0])
    for r in rows:
        k = r["Registar"] or "(not in registers)"
        by[k][0] += 1
        by[k][1] += f(r["Iznos (EUR)"])
    got[f"{p} by register (projects, EUR)"] = {k: (v[0], round(v[1])) for k, v in by.items()}
    sec = defaultdict(lambda: [0, 0])
    for r in rows:
        sec[r["Sektor"]][0] += 1
        sec[r["Sektor"]][1] += bool(r["ID ustanove"])
    got[f"{p} % linked by sector"] = {k: round(100 * v[1] / v[0], 1) for k, v in sec.items()}

REGS = ["Dječji vrtić", "Osnovna škola", "Srednja škola", "Visoko učilište"]
rates = {}
for g in REGS:
    rr = [r for r in part if r["Vrsta registra"] == g]
    p14 = [float(r["Broj projekata 2014-2020"]) > 0 for r in rr]
    p21 = [float(r["Broj projekata 2021-2027"]) > 0 for r in rr]
    rates[g] = (len(rr), sum(p14), sum(p21), sum(a or b for a, b in zip(p14, p21)), sum(a and b for a, b in zip(p14, p21)))
got["participation (entries, 2014-20, 2021-27, either, both)"] = rates
county = defaultdict(lambda: [0, 0])
for r in part:
    if r["Vrsta registra"] in REGS[:3]:
        k = (r["Županija"], r["Vrsta registra"])
        county[k][0] += 1
        county[k][1] += (float(r["Broj projekata 2014-2020"]) + float(r["Broj projekata 2021-2027"])) > 0
got["county participation (selected)"] = {k: (v[1], round(100 * v[1] / v[0], 1)) for k, v in county.items() if k in [
    ("Koprivničko-križevačka županija", "Osnovna škola"), ("Ličko-senjska županija", "Osnovna škola"),
    ("Istarska županija", "Osnovna škola"), ("Varaždinska županija", "Srednja škola"),
    ("Istarska županija", "Srednja škola"), ("Grad Zagreb", "Osnovna škola"), ("Grad Zagreb", "Srednja škola"),
    ("Primorsko-goranska županija", "Dječji vrtić")]}


def kind(fo):
    if "županija" in fo.lower():
        return "county"
    if fo.startswith("Općina "):
        return "municipality"
    if fo.startswith("Grad "):
        return "town"
    return "other"


fk = defaultdict(lambda: [0, 0])
for r in part:
    if r["Vrsta registra"] in ("Osnovna škola", "Srednja škola"):
        k = (kind(r["Osnivač"]), r["Vrsta registra"])
        fk[k][0] += 1
        fk[k][1] += (float(r["Broj projekata 2014-2020"]) + float(r["Broj projekata 2021-2027"])) > 0
got["founder participation % (entries)"] = {k: (round(100 * v[1] / v[0], 1), v[0]) for k, v in sorted(fk.items())}

EXPECTED = {
    "link rows per period == project-list rows": True,
    "(period, project, beneficiary) keys identical": True,
    "amount totals equal project lists": True,
    "linked rows have register name and ID": True,
    "participation counts == linked project rows per institution": True,
    "participation rows == register rows": True,
    "linked rows whose matched name is not the (normalised) register name": None,  # informative, see below
    "2014-2020 linked rows / amount linked": (1018, 104584763),
    "2021-2027 linked rows / amount linked": (1948, 182232718),
    "2014-2020 by register (projects, EUR)": {"Visoko učilište": (365, 65296636), "Srednja škola": (425, 30630731),
                                              "Osnovna škola": (193, 7839676), "Osnovna škola + Srednja škola": (1, 26085),
                                              "Dječji vrtić": (34, 791635), "(not in registers)": (1043, 41013373)},
    "2021-2027 by register (projects, EUR)": {"Visoko učilište": (308, 99297873), "Srednja škola": (935, 60352911),
                                              "Osnovna škola": (582, 19320349), "Osnovna škola + Srednja škola": (6, 239506),
                                              "Dječji vrtić": (117, 3022079), "(not in registers)": (1133, 66158773)},
    "2014-2020 % linked by sector": {"Odgoj i opće obrazovanje": 90.5, "Strukovno obrazovanje i osposobljavanje": 85.6,
                                     "Visoko obrazovanje": 80.8, "Obrazovanje odraslih": 6.6, "Mladi": 2.1},
    "2021-2027 % linked by sector": {"Odgoj i opće obrazovanje": 93.0, "Strukovno obrazovanje i osposobljavanje": 92.6,
                                     "Visoko obrazovanje": 76.2, "Obrazovanje odraslih": 2.7, "Mladi": 5.2, "Sport": 0.0},
    "participation (entries, 2014-20, 2021-27, either, both)": {
        "Dječji vrtić": (885, 20, 52, 58, 14), "Osnovna škola": (926, 110, 235, 277, 68),
        "Srednja škola": (443, 172, 253, 283, 142), "Visoko učilište": (133, 50, 39, 54, 35)},
    "county participation (selected)": {
        ("Koprivničko-križevačka županija", "Osnovna škola"): (13, 48.1), ("Ličko-senjska županija", "Osnovna škola"): (0, 0.0),
        ("Istarska županija", "Osnovna škola"): (6, 12.5), ("Varaždinska županija", "Srednja škola"): (16, 94.1),
        ("Istarska županija", "Srednja škola"): (11, 47.8), ("Grad Zagreb", "Osnovna škola"): (51, 38.3),
        ("Grad Zagreb", "Srednja škola"): (50, 52.6), ("Primorsko-goranska županija", "Dječji vrtić"): (8, 17.0)},
    "founder participation % (entries)": {
        ("county", "Osnovna škola"): (24.0, 534), ("county", "Srednja škola"): (73.1, 301),
        ("municipality", "Osnovna škola"): (100.0, 1), ("other", "Osnovna škola"): (17.9, 39),
        ("other", "Srednja škola"): (17.5, 63), ("town", "Osnovna škola"): (40.1, 352), ("town", "Srednja škola"): (65.8, 79)},
}
TIERS_EXPECTED = {("2014-2020", "1 name+postal"): 593, ("2021-2027", "1 name+postal"): 1462,
                  ("2014-2020", "2 name+place"): 361, ("2021-2027", "2 name+place"): 354,
                  ("2014-2020", "3 unique name"): 10, ("2021-2027", "3 unique name"): 19,
                  ("2014-2020", "4 name variant (name+postal)"): 29, ("2021-2027", "4 name variant (name+postal)"): 107,
                  ("2014-2020", "4 name variant (name+place)"): 25, ("2021-2027", "4 name variant (name+place)"): 6,
                  ("2014-2020", "name not unique, place/postal differ"): 4,
                  ("2014-2020", "no name match"): 1039, ("2021-2027", "no name match"): 1133}
EXPECTED["tier counts"] = TIERS_EXPECTED

problems = [(k, EXPECTED[k], got[k]) for k in EXPECTED if EXPECTED[k] is not None and got[k] != EXPECTED[k]]
print(f"Checked {sum(v is not None for v in EXPECTED.values())} report statements / consistency checks: "
      f"{len(problems)} differ\n")
for k, e, g in problems:
    print(f"DIFFERS: {k}\n   report    : {e}\n   recomputed: {g}\n")
print(f"Linked rows whose matched name is neither the register name nor the register name without its place: "
      f"{len(bad)}")
for b in sorted(set(bad))[:40]:
    print(f"   {b[0][:55]!r} matched as {b[1]!r} -> register {b[2][:55]!r}")

"""Step 21: independent verification of the KA2 extraction, parsing and linking in
19_link_ka2_registri.py (checks that 20_verify_ka2_registri.py cannot do, because 20 only
recomputes numbers from 19's outputs).

  A. Extraction: HR coordinator/partner appearances re-extracted from the ORIGINAL .xls files
     with xlrd (cell by cell, no pandas, no parquet cache) and compared row by row with
     ka2_hr_organizacije_poveznice.csv on (project id, role, partner slot, name, address).
  B. Postal-code parsing re-implemented differently (comma-separated tokens) and compared;
     parsed postal codes and places checked against those known from the registers and the
     NA project lists.
  C. Link evidence: for every linked row, the matched name must equal the (independently)
     normalised register name (or that name without its place); a tier-1 link must have the
     register's postal code, a tier-2 link the register's place.
  D. Duplicate project IDs in the NA links that could affect the KA2-vs-NA comparison.

Usage: python 21_verify_ka2_extraction.py
"""
import csv
import re
import unicodedata
from collections import Counter
from pathlib import Path

import xlrd

BASE = Path(__file__).resolve().parent.parent
P = BASE / "Data" / "processed"


def read(name):
    with open(P / name, encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def text(v):
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


out = read("ka2_hr_organizacije_poveznice.csv")
reg = read("ustanove_registar.csv")
problems = 0

# ---------------------------------------------------------------- A. extraction
xls_rows = []
for period in ["2014-2020", "2021-2027"]:
    path = next((BASE / "Data" / period).glob("ErasmusPlus_KA2_*.xls"))
    sh = xlrd.open_workbook(path).sheet_by_index(0)
    hdr = [str(h).strip() for h in sh.row_values(0)]
    col = {h: i for i, h in enumerate(hdr)}
    partners = sorted({int(m.group(1)) for h in hdr if (m := re.fullmatch(r"Partner (\d+) country", h))})
    for r in range(1, sh.nrows):
        row = sh.row_values(r)
        pid = text(row[col["Project Identifier"]]).strip()
        if text(row[col["Coordinator's country"]]) == "HR":
            xls_rows.append((period, pid, "koordinator", "0", text(row[col["Coordinating organisation name"]]).strip(),
                             text(row[col["Coordinator's address"]]).strip()))
        for n in partners:
            if text(row[col[f"Partner {n} country"]]) == "HR":
                xls_rows.append((period, pid, "partner", str(n), text(row[col[f"Partner {n} name"]]).strip(),
                                 text(row[col[f"Partner {n} address"]]).strip()))
out_rows = [(r["Razdoblje"], r["Identifikator projekta"].strip(), r["Uloga"], str(int(float(r["Partner br."]))),
             r["Naziv organizacije"].strip(), r["Adresa"].strip()) for r in out]
a, b = Counter(xls_rows), Counter(out_rows)
print("A. Extraction (period, project id, role, partner slot, name, address)")
print(f"   rows from .xls: {len(xls_rows)}, rows in output: {len(out_rows)}, identical multisets: {a == b}")
if a != b:
    problems += 1
    print("   only in .xls:", list((a - b).items())[:5])
    print("   only in output:", list((b - a).items())[:5])
print(f"   appearances with an empty name: {sum(1 for x in xls_rows if not x[4])}")


# ---------------------------------------------------------------- B. postal code / place parsing
def postal_by_tokens(addr):
    """Last comma-separated token that is a 5-digit number (also '10 000' or '48267 OREHOVEC')."""
    found = None
    for tok in addr.split(","):
        for m in re.finditer(r"(?<!\d)(\d{2}) ?(\d{3})(?!\d)", tok):
            found = m.group(1) + m.group(2)
    return found


diff = [(r["Adresa"], r["Poštanski broj (iz adrese)"], postal_by_tokens(r["Adresa"]))
        for r in out if (r["Poštanski broj (iz adrese)"] or None) != postal_by_tokens(r["Adresa"])]
print("\nB. Postal codes: script 19 vs token-based re-implementation")
print(f"   differences: {len(diff)}")
for d in diff[:10]:
    print("     ", d)
if diff:
    problems += 1


def strip_d(s):
    s = s.replace("đ", "d").replace("Đ", "D")
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def np_(s):
    s = " ".join(strip_d(s).lower().split())
    return "zagreb" if s == "grad zagreb" else s


known_pc = {r["Poštanski broj"] for r in reg if r["Poštanski broj"]}
known_place = {np_(r["Mjesto"]) for r in reg if r["Mjesto"]}
for p in ["2014-2020", "2021-2027"]:
    for r in read(f"project_list_{p}_enriched.csv"):
        if r.get("Poštanski broj (očišćen)"):
            known_pc.add(r["Poštanski broj (očišćen)"])
        if r.get("Mjesto (očišćeno)"):
            known_place.add(np_(r["Mjesto (očišćeno)"]))
pcs = [r["Poštanski broj (iz adrese)"] for r in out if r["Poštanski broj (iz adrese)"]]
unknown_pc = Counter(pc for pc in pcs if pc not in known_pc)
print(f"   parsed postal codes: {len(pcs)}; not seen in registers or NA lists: {sum(unknown_pc.values())} "
      f"({len(unknown_pc)} distinct): {unknown_pc.most_common(12)}")
places = [np_(r["Mjesto (iz adrese)"]) for r in out if r["Mjesto (iz adrese)"]]
unknown_pl = Counter(pl for pl in places if pl not in known_place)
print(f"   parsed places: {len(places)}; not seen in registers or NA lists: {sum(unknown_pl.values())} "
      f"({len(unknown_pl)} distinct); most frequent: {unknown_pl.most_common(12)}")


# ---------------------------------------------------------------- C. link evidence
def nn(s):
    s = strip_d(s).lower()
    s = re.sub(r"[\"'„“”«»˝`´]", "", s)
    s = re.sub(r"^o\.?\s*s\.?\s+", "osnovna skola ", s)
    s = re.sub(r"^s\.?\s*s\.?\s+", "srednja skola ", s)
    s = re.sub(r"^d\.?\s*v\.?\s+", "djecji vrtic ", s)
    s = re.sub(r"^l\.\s*", "i. ", s)
    s = re.sub(r"^(prva|druga|treca|cetvrta)\b",
               lambda m: {"prva": "i.", "druga": "ii.", "treca": "iii.", "cetvrta": "iv."}[m.group(1)], s)
    s = re.sub(r"[.,;:()\-–/]", " ", s)
    return " ".join(s.split())


by_inst = {}
for i, r in enumerate(reg):
    iid = "S:" + r["Šifra ustanove"] if r["Šifra ustanove"] else f"R:{i}"
    by_inst.setdefault(iid, []).append(r)
bad_name, bad_t1, bad_t2 = [], [], []
for r in out:
    if not r["ID ustanove"]:
        continue
    entries = by_inst[r["ID ustanove"]]
    ok = set()
    for e in entries:
        n, pl = nn(e["Naziv"]), np_(e["Mjesto"])
        ok.add(n)
        for suf in (f" grad {pl}", f" {pl}"):
            if n.endswith(suf):
                ok.add(n[: -len(suf)].strip())
    if r["Povezano kao (normalizirani naziv)"] not in ok:
        bad_name.append((r["Naziv organizacije"], r["Povezano kao (normalizirani naziv)"], entries[0]["Naziv"]))
    if r["Razina povezivanja"].endswith("name+postal") or r["Razina povezivanja"] == "1 name+postal":
        if r["Poštanski broj (iz adrese)"] not in {e["Poštanski broj"] for e in entries}:
            bad_t1.append((r["Naziv organizacije"], r["Poštanski broj (iz adrese)"], entries[0]["Poštanski broj"]))
    if r["Razina povezivanja"].endswith("name+place)") or r["Razina povezivanja"] == "2 name+place":
        if np_(r["Mjesto (iz adrese)"]) not in {np_(e["Mjesto"]) for e in entries}:
            bad_t2.append((r["Naziv organizacije"], r["Mjesto (iz adrese)"], entries[0]["Mjesto"]))
linked = sum(1 for r in out if r["ID ustanove"])
print("\nC. Link evidence for", linked, "linked rows")
print(f"   matched name is not the register name (or name without place): {len(bad_name)}")
print(f"   'name+postal' links whose postal code differs from the register: {len(bad_t1)}")
print(f"   'name+place' links whose place differs from the register: {len(bad_t2)}")
for x in (bad_name + bad_t1 + bad_t2)[:10]:
    print("     ", x)
problems += bool(bad_name or bad_t1 or bad_t2)

# ---------------------------------------------------------------- D. duplicate NA IDs
na = read("erasmus_registar_poveznice.csv")
key = lambda x: re.sub(r"_\d+$", "", x.strip()).replace("-", "")
dup = Counter(key(r["Projektni broj"]) for r in na)
dups = {k: v for k, v in dup.items() if v > 1}
ka2_keys = {key(r["Identifikator projekta"]) for r in out if r["Uloga"] == "koordinator"}
print("\nD. NA project IDs that occur more than once (after the same key normalisation as script 19):")
print(f"   {len(dups)} keys; of which also HR-coordinated KA2 projects: {len(set(dups) & ka2_keys)}")
for k in dups:
    rows = [r for r in na if key(r["Projektni broj"]) == k]
    print(f"     {k}: {[(r['Projektni broj'], r['Šifra ključne aktivnosti'], r['ID ustanove']) for r in rows]}")
problems += bool(set(dups) & ka2_keys)

print(f"\nChecks with problems: {problems}")

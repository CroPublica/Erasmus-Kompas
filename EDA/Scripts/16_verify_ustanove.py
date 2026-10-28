"""Step 16: independent verification of report_obrazovne_ustanove.md.

Reads the four raw CSV files with Python's csv module (no pandas, none of the code
in 15_eda_ustanove.py), recomputes every number quoted in the report and compares
it with the value written in the report (EXPECTED below). Also checks the
processed register Data/processed/ustanove_registar.csv against the raw files.

Usage: python 16_verify_ustanove.py
"""
import csv
import re
from collections import Counter, defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
D = BASE / "Data" / "obrazovne_ustanove"
REG = BASE / "Data" / "processed" / "ustanove_registar.csv"


def norm(v):
    """Trim + collapse all whitespace; empty -> None."""
    v = " ".join(v.split())
    return v or None


def load(name):
    with open(D / name, encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    return [{k: norm(v) for k, v in r.items()} for r in rows]


kg, os_, ss, vu = (load(f) for f in ["djecji_vrtici.csv", "osnovne_skole.csv", "srednje_skole.csv",
                                     "ustanove_visoko_obrazovanje.csv"])
county = lambda v: "Grad Zagreb" if v == "Grad Zagreb županija" else v
for r in kg:
    r["_c"] = county(r["Zupanija"])
for r in os_:
    r["_c"] = county(r["Župnija"])
for r in ss:
    r["_c"] = county(r["Županija"])
got = {}

# --- sizes, counties ------------------------------------------------------------------------
got["rows"] = (len(kg), len(os_), len(ss), len(vu))
got["distinct counties"] = tuple(len({r["_c"] for r in f}) for f in (kg, os_, ss))
got["same county set in 3 files"] = {r["_c"] for r in kg} == {r["_c"] for r in os_} == {r["_c"] for r in ss}
got["kg county values with leading/trailing spaces (raw)"] = None  # filled below from raw text
with open(D / "djecji_vrtici.csv", encoding="utf-8", newline="") as fh:
    got["kg county values with leading/trailing spaces (raw)"] = sum(
        1 for r in csv.DictReader(fh) if r["Zupanija"] != r["Zupanija"].strip())
per_county = {name: Counter(r["_c"] for r in f) for name, f in [("kg", kg), ("os", os_), ("ss", ss)]}
total_by_county = Counter()
for c in per_county.values():
    total_by_county.update(c)
got["Grad Zagreb (kg, os, ss, total)"] = (per_county["kg"]["Grad Zagreb"], per_county["os"]["Grad Zagreb"],
                                         per_county["ss"]["Grad Zagreb"], total_by_county["Grad Zagreb"])
got["% Grad Zagreb (kg, os, ss, total)"] = tuple(round(x, 1) for x in (
    100 * per_county["kg"]["Grad Zagreb"] / len(kg), 100 * per_county["os"]["Grad Zagreb"] / len(os_),
    100 * per_county["ss"]["Grad Zagreb"] / len(ss), 100 * total_by_county["Grad Zagreb"] / (len(kg) + len(os_) + len(ss))))
got["county table"] = {c: (per_county["kg"][c], per_county["os"][c], per_county["ss"][c], total_by_county[c])
                       for c in total_by_county}
got["counties kg > os"] = sorted(c for c in total_by_county if per_county["kg"][c] > per_county["os"][c])
got["counties kg == os"] = sorted(c for c in total_by_county if per_county["kg"][c] == per_county["os"][c])

# --- places ------------------------------------------------------------------------------------
got["distinct places (case-sensitive; vu title-cased)"] = (
    len({r["Mjesto"] for r in kg}), len({r["Mjesto"] for r in os_}), len({r["Mjesto"] for r in ss}),
    len({r["Mjesto"].title() for r in vu}))
got["distinct places (case-insensitive)"] = tuple(len({r["Mjesto"].lower() for r in f}) for f in (kg, os_, ss, vu))
got["top places kg"] = Counter(r["Mjesto"] for r in kg).most_common(6)
got["top places os"] = Counter(r["Mjesto"] for r in os_).most_common(6)
got["top places ss"] = Counter(r["Mjesto"] for r in ss).most_common(5)
vu_places = Counter(r["Mjesto"].title() for r in vu)
got["vu places top7"] = vu_places.most_common(7)
got["vu places with 1 institution"] = sum(1 for v in vu_places.values() if v == 1)
got["vu in 4 university cities"] = sum(vu_places[c] for c in ["Zagreb", "Split", "Rijeka", "Osijek"])

# --- postal codes ---------------------------------------------------------------------------------
got["postal not 5 digits"] = sum(1 for f, k in [(kg, "PostanskiBroj"), (os_, "PoštanskiBroj"), (ss, "PoštanskiBroj")]
                                 for r in f if not re.fullmatch(r"\d{5}", r[k] or ""))

# --- codes -----------------------------------------------------------------------------------------
schools = [("os", r) for r in os_] + [("ss", r) for r in ss]
codes = [r["Šifra"] for _, r in schools]
got["codes total / standard format"] = (len(codes), sum(bool(re.fullmatch(r"\d{2}-\d{3}-\d{3}", c)) for c in codes))
got["non-standard codes"] = [c for c in codes if not re.fullmatch(r"\d{2}-\d{3}-\d{3}", c)]
got["codes unique within file"] = (len({r["Šifra"] for r in os_}) == len(os_), len({r["Šifra"] for r in ss}) == len(ss))
prefix_c = defaultdict(Counter)
for _, r in schools:
    prefix_c[r["Šifra"][:2]][r["_c"]] += 1
got["prefixes / mapping to exactly one county"] = (len(prefix_c), sum(1 for v in prefix_c.values() if len(v) == 1))
got["prefix 02"] = dict(prefix_c["02"])
got["prefix 21"] = dict(prefix_c["21"])
last = {k: [int(r["Šifra"].split("-")[2]) for kk, r in schools if kk == k] for k in ("os", "ss")}
got["last part range (os, ss)"] = ((min(last["os"]), max(last["os"])), (min(last["ss"]), max(last["ss"])))

# --- overlap ---------------------------------------------------------------------------------------
both = {r["Šifra"] for r in os_} & {r["Šifra"] for r in ss}
name_os = {r["Šifra"]: r["Naziv"] for r in os_}
name_ss = {r["Šifra"]: r["Naziv"] for r in ss}
got["overlap codes / identical names / distinct schools"] = (len(both), sum(name_os[c] == name_ss[c] for c in both),
                                                             len(os_) + len(ss) - len(both))

# --- types -----------------------------------------------------------------------------------------
got["os type only 'Osnovna škola'"] = sum(r["TipUstanove"] == "Osnovna škola" for r in os_)
got["ss type only 'Srednja škola'"] = sum(r["TipUstanove"] == "Srednja škola" for r in ss)
got["os single types"] = dict(Counter(t for r in os_ for t in r["TipUstanove"].split(", ")))
got["ss single types"] = dict(Counter(t for r in ss for t in r["TipUstanove"].split(", ")))


# --- founders (same keyword rules as written in the report) ---------------------------------------
def founder_kind(f):
    lf = f.lower()
    if "republika hrvatska" in lf:
        return "RH"
    if "županija" in lf:
        return "county"
    if f.startswith("Općina "):
        return "municipality"
    if f.startswith("Grad "):
        return "town"
    if re.search(r"d\.o\.o|s\.r\.o|gimnazija|srednja škola|centar za", lf):
        return "company/private school/centre"
    if re.search(r"udrug|društv", lf):
        return "association"
    if re.search(r"biskupij|nadbiskupij|provincij|crkv|zajednic|eparhij|mešihat|družb|islamsk", lf):
        return "religious"
    if "ministarstvo" in lf:
        return "ministry"
    return "other"


got["founder kinds os"] = dict(Counter(founder_kind(r["Osnivač"]) for r in os_))
got["founder kinds ss"] = dict(Counter(founder_kind(r["Osnivač"]) for r in ss))
got["% county founder (os, ss)"] = (round(100 * got["founder kinds os"]["county"] / len(os_), 1),
                                   round(100 * got["founder kinds ss"]["county"] / len(ss), 1))
got["ministry 'demografiju' schools (os+ss)"] = sum("demografiju" in r["Osnivač"] for _, r in schools)
gz = [(r["Osnivač"] == "Grad Zagreb", r["_c"] == "Grad Zagreb") for _, r in schools]
got["GZ county: founder GZ / other; founder GZ outside GZ"] = (
    sum(1 for f, c in gz if f and c), sum(1 for f, c in gz if c and not f), sum(1 for f, c in gz if f and not c))
# rows where the order of keyword rules matters (match more than one category)
multi = []
for _, r in schools:
    lf = r["Osnivač"].lower()
    hits = [k for k, pat in [("religious", r"biskupij|nadbiskupij|provincij|crkv|zajednic|eparhij|mešihat|družb|islamsk"),
                             ("association", r"udrug|društv"), ("company", r"d\.o\.o|s\.r\.o|gimnazija|srednja škola|centar za"),
                             ("ministry", r"ministarstvo"), ("county", r"županija")] if re.search(pat, lf)]
    if len(hits) > 1:
        multi.append((hits, founder_kind(r["Osnivač"])))
got["founders matching >1 keyword category (categories -> chosen)"] = Counter((tuple(h), k) for h, k in multi)

# --- names -----------------------------------------------------------------------------------------
for key, f, nk in [("kg", kg, "Naziv"), ("os", os_, "Naziv"), ("ss", ss, "Naziv"), ("vu", vu, "NazivUstanove")]:
    c = Counter(r[nk].lower() for r in f)
    shared = {n: v for n, v in c.items() if v > 1}
    got[f"names {key}: distinct / shared names / rows covered"] = (len(c), len(shared), sum(shared.values()))
got["kg names not starting 'dječji vrtić'"] = sum(not r["Naziv"].lower().startswith("dječji vrtić") for r in kg)
got["kg first two words (non-DV) top7"] = Counter(" ".join(r["Naziv"].lower().split()[:2]) for r in kg
                                                  if not r["Naziv"].lower().startswith("dječji vrtić")).most_common(7)

# --- higher education ------------------------------------------------------------------------------
got["vu type x upisnik"] = dict(Counter((r["VrstaUstanove"], r["Upisnik"]) for r in vu))
got["vu parent"] = dict(Counter(r["NadredjenaUstanova"] for r in vu if r["NadredjenaUstanova"]))
got["vu with parent / types with parent"] = (sum(1 for r in vu if r["NadredjenaUstanova"]),
                                            sorted({r["VrstaUstanove"] for r in vu if r["NadredjenaUstanova"]}))
got["vu shared URL"] = {u: n for u, n in Counter(r["URL"].lower().rstrip("/") for r in vu).items() if n > 1}
mbu = [int(r["mbu"]) for r in vu]
got["mbu unique / min / max"] = (len(set(mbu)) == len(mbu), min(mbu), max(mbu))

# --- completeness / junk websites ------------------------------------------------------------------
filled = lambda f, k: sum(1 for r in f if r[k])
got["web filled (os, ss)"] = (filled(os_, "Web"), filled(ss, "Web"))
got["web without a letter (os, ss)"] = ([r["Web"] for r in os_ if r["Web"] and not re.search("[a-zA-Z]", r["Web"])],
                                        [r["Web"] for r in ss if r["Web"] and not re.search("[a-zA-Z]", r["Web"])])
got["address filled os"] = filled(os_, "Adresa")
got["principal filled (os, ss)"] = (filled(os_, "Ravnatelj"), filled(ss, "Ravnatelj"))

# ============================== processed register =================================================
with open(REG, encoding="utf-8-sig", newline="") as fh:
    reg = list(csv.DictReader(fh))
got["register rows"] = len(reg)
got["register columns"] = list(reg[0].keys())
personal = {"Ravnatelj", "Čelnik", "Celnik", "ePošta", "ePosta", "Telefon", "Faks"}
got["register personal columns present"] = sorted(personal & set(reg[0]))
src_rows = ([("Dječji vrtić", r["Naziv"], r["Mjesto"], r["_c"]) for r in kg] +
            [("Osnovna škola", r["Naziv"], r["Mjesto"], r["_c"]) for r in os_] +
            [("Srednja škola", r["Naziv"], r["Mjesto"], r["_c"]) for r in ss] +
            [("Visoko učilište", r["NazivUstanove"], r["Mjesto"].title(), None) for r in vu])
reg_rows = [(r["Vrsta registra"], r["Naziv"], r["Mjesto"], r["Županija"] or None) for r in reg]
got["register rows identical to cleaned source (type, name, place, county)"] = Counter(src_rows) == Counter(reg_rows)

# ============================== compare with the report ============================================
CT = {  # county table in section 6 of the report
    "Grad Zagreb": (199, 133, 95, 427), "Splitsko-dalmatinska županija": (74, 101, 51, 226),
    "Primorsko-goranska županija": (47, 62, 36, 145), "Osječko-baranjska županija": (36, 74, 30, 140),
    "Istarska županija": (58, 48, 23, 129), "Zagrebačka županija": (53, 51, 17, 121),
    "Vukovarsko-srijemska županija": (47, 55, 15, 117), "Zadarska županija": (56, 38, 21, 115),
    "Varaždinska županija": (47, 42, 17, 106), "Međimurska županija": (45, 31, 8, 84),
    "Krapinsko-zagorska županija": (35, 34, 11, 80), "Sisačko-moslavačka županija": (20, 37, 15, 72),
    "Bjelovarsko-bilogorska županija": (28, 27, 15, 70), "Dubrovačko-neretvanska županija": (22, 32, 16, 70),
    "Karlovačka županija": (21, 29, 14, 64), "Koprivničko-križevačka županija": (25, 27, 10, 62),
    "Brodsko-posavska županija": (14, 33, 12, 59), "Šibensko-kninska županija": (15, 24, 13, 52),
    "Virovitičko-podravska županija": (18, 18, 11, 47), "Požeško-slavonska županija": (14, 15, 8, 37),
    "Ličko-senjska županija": (11, 15, 5, 31)}
EXPECTED = {
    "rows": (885, 926, 443, 133),
    "distinct counties": (21, 21, 21),
    "same county set in 3 files": True,
    "kg county values with leading/trailing spaces (raw)": 686,
    "Grad Zagreb (kg, os, ss, total)": (199, 133, 95, 427),
    "% Grad Zagreb (kg, os, ss, total)": (22.5, 14.4, 21.4, 18.9),
    "county table": CT,
    "counties kg > os": sorted(["Grad Zagreb", "Istarska županija", "Zadarska županija", "Međimurska županija",
                                "Varaždinska županija", "Zagrebačka županija", "Krapinsko-zagorska županija",
                                "Bjelovarsko-bilogorska županija"]),
    "counties kg == os": ["Virovitičko-podravska županija"],
    "distinct places (case-sensitive; vu title-cased)": (435, 577, 117, 28),
    "top places kg": [("Zagreb", 183), ("Zadar", 25), ("Pula", 23), ("Split", 22), ("Varaždin", 14), ("Čakovec", 14)],
    "top places os": [("Zagreb", 117), ("Split", 28), ("Rijeka", 28), ("Osijek", 19), ("Zadar", 11), ("Pula", 11)],
    "top places ss": [("Zagreb", 93), ("Split", 28), ("Rijeka", 23), ("Osijek", 19), ("Zadar", 16)],
    "vu places top7": [("Zagreb", 50), ("Split", 19), ("Rijeka", 18), ("Osijek", 18), ("Pula", 3), ("Dubrovnik", 2),
                       ("Varaždin", 2)],
    "vu places with 1 institution": 21,
    "vu in 4 university cities": 105,
    "postal not 5 digits": 0,
    "codes total / standard format": (1369, 1368),
    "non-standard codes": ["14-060-24"],
    "codes unique within file": (True, True),
    "prefixes / mapping to exactly one county": (21, 20),
    "prefix 02": {"Krapinsko-zagorska županija": 45, "Grad Zagreb": 1},
    "prefix 21": {"Grad Zagreb": 227},
    "last part range (os, ss)": ((1, 632), (2, 636)),
    "overlap codes / identical names / distinct schools": (13, 13, 1356),
    "os type only 'Osnovna škola'": 874,
    "ss type only 'Srednja škola'": 380,
    "founder kinds os": {"county": 534, "town": 352, "municipality": 1, "ministry": 12, "religious": 10,
                         "association": 7, "company/private school/centre": 5, "other": 5},
    "founder kinds ss": {"county": 301, "town": 79, "ministry": 12, "religious": 16, "association": 3,
                         "company/private school/centre": 8, "other": 24},
    "% county founder (os, ss)": (57.7, 67.9),
    "ministry 'demografiju' schools (os+ss)": 21,
    "GZ county: founder GZ / other; founder GZ outside GZ": (180, 48, 0),
    "names kg: distinct / shared names / rows covered": (780, 55, 160),
    "names os: distinct / shared names / rows covered": (835, 53, 144),
    "names ss: distinct / shared names / rows covered": (430, 10, 23),
    "names vu: distinct / shared names / rows covered": (133, 0, 0),
    "kg names not starting 'dječji vrtić'": 274,
    "vu with parent / types with parent": (83, ["Fakultet", "Sveučilišni odjel", "Umjetnička akademija"]),
    "vu parent": {"Sveučilište u Zagrebu": 34, "Sveučilište Josipa Jurja Strossmayera u Osijeku": 17,
                  "Sveučilište u Splitu": 16, "Sveučilište u Rijeci": 16},
    "vu shared URL": {"www.uniri.hr": 2, "www.vern.hr": 2},
    "mbu unique / min / max": (True, 6, 368),
    "web filled (os, ss)": (559, 302),
    "address filled os": 924,
    "principal filled (os, ss)": (910, 429),
    "register rows": 2387,
    "register personal columns present": [],
    "register rows identical to cleaned source (type, name, place, county)": True,
}

problems = [(k, EXPECTED[k], got.get(k)) for k in EXPECTED if got.get(k) != EXPECTED[k]]
print(f"Checked {len(EXPECTED)} report statements against an independent recomputation: {len(problems)} differ\n")
for k, exp, g in problems:
    print(f"DIFFERS: {k}\n   report : {exp}\n   recomputed: {g}\n")
print("Additional facts (not compared automatically):")
for k in ["distinct places (case-insensitive)", "os single types", "ss single types", "web without a letter (os, ss)",
          "vu type x upisnik", "kg first two words (non-DV) top7",
          "founders matching >1 keyword category (categories -> chosen)", "register columns"]:
    print(f"- {k}: {got[k]}")

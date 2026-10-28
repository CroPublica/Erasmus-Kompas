"""Step 15: clean + describe the registers of educational institutions
(Data/obrazovne_ustanove/) and build one combined register.

Cleaning (text only, nothing is guessed):
  * leading/trailing whitespace removed, repeated spaces collapsed, in every column
  * county names harmonised: 'Grad Zagreb županija' -> 'Grad Zagreb'
    (the only variant left after the whitespace cleaning; checked below)
  * the primary-school column 'Župnija' holds county names and is treated as 'Županija'
  * place names: higher-education file is upper case ('ZAGREB') -> title case for comparisons

Personal / contact data (principals, heads, e-mail, phone, fax) are only counted
for completeness and are NOT written to the processed register.

Output: Data/processed/ustanove_registar.csv (Croatian headers, UTF-8 with BOM)
Charts: Reports/figures/obrazovne_ustanove/
Usage:  python 15_eda_ustanove.py
"""
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from nazivi_stupaca import CSV_ENCODING

BASE = Path(__file__).resolve().parent.parent
D = BASE / "Data" / "obrazovne_ustanove"
OUT = BASE / "Data" / "processed" / "ustanove_registar.csv"
FIG = BASE / "Reports" / "figures" / "obrazovne_ustanove"
FIG.mkdir(parents=True, exist_ok=True)
PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]
plt.rcParams.update({"axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
                     "grid.color": "#e4e3df", "grid.linewidth": 0.6, "axes.axisbelow": True,
                     "axes.edgecolor": "#8a8984", "font.size": 9})

FILES = {  # register type -> file
    "Dječji vrtić": "djecji_vrtici.csv",
    "Osnovna škola": "osnovne_skole.csv",
    "Srednja škola": "srednje_skole.csv",
    "Visoko učilište": "ustanove_visoko_obrazovanje.csv",
}
# source column -> common column (Croatian), per file
COMMON = {
    "Dječji vrtić": {"Naziv": "Naziv", "Adresa": "Adresa", "Mjesto": "Mjesto", "PostanskiBroj": "Poštanski broj",
                     "Zupanija": "Županija", "ePosta": "_ePošta", "Telefon": "_Telefon"},
    "Osnovna škola": {"Naziv": "Naziv", "Adresa": "Adresa", "Mjesto": "Mjesto", "PoštanskiBroj": "Poštanski broj",
                      "Župnija": "Županija", "Šifra": "Šifra ustanove", "Osnivač": "Osnivač",
                      "TipUstanove": "Tip ustanove", "Web": "Web", "ePošta": "_ePošta", "Telefon": "_Telefon",
                      "Faks": "_Faks", "Ravnatelj": "_Ravnatelj"},
    "Srednja škola": {"Naziv": "Naziv", "Adresa": "Adresa", "Mjesto": "Mjesto", "PoštanskiBroj": "Poštanski broj",
                      "Županija": "Županija", "Šifra": "Šifra ustanove", "Osnivač": "Osnivač",
                      "TipUstanove": "Tip ustanove", "Web": "Web", "ePošta": "_ePošta", "Telefon": "_Telefon",
                      "Faks": "_Faks", "Ravnatelj": "_Ravnatelj"},
    "Visoko učilište": {"NazivUstanove": "Naziv", "Adresa": "Adresa", "Mjesto": "Mjesto", "mbu": "MBU",
                        "VrstaUstanove": "Tip ustanove", "Upisnik": "Upisnik", "NadredjenaUstanova": "Nadređena ustanova",
                        "URL": "Web", "ePosta": "_ePošta", "Telefon": "_Telefon", "Faks": "_Faks", "Celnik": "_Čelnik"},
}


def md(frame, floatfmt=",.0f"):
    print(frame.to_markdown(floatfmt=floatfmt))
    print()


def clean_text(s):
    return s.str.strip().str.replace(r"\s+", " ", regex=True)


frames = []
for reg, fname in FILES.items():
    raw = pd.read_csv(D / fname, dtype=str, keep_default_na=False, na_values=[""])
    assert set(COMMON[reg]) == set(raw.columns), (fname, set(raw.columns) ^ set(COMMON[reg]))
    df = raw.rename(columns=COMMON[reg]).apply(clean_text)
    df = df.replace("", pd.NA)
    df.insert(0, "Vrsta registra", reg)
    frames.append(df)
reg_all = pd.concat(frames, ignore_index=True)

# ---------------- counties ----------------
print("# Counties")
print("Distinct county values per register after whitespace cleaning (before harmonising):")
md(reg_all.groupby("Vrsta registra")["Županija"].nunique().to_frame("distinct"))
variants = sorted(reg_all["Županija"].dropna().unique())
print("All distinct county values across registers:", variants, "\n")
reg_all["Županija"] = reg_all["Županija"].replace({"Grad Zagreb županija": "Grad Zagreb"})
counties = sorted(reg_all["Županija"].dropna().unique())
print(f"After harmonising: {len(counties)} distinct county values:", counties, "\n")
print("Higher-education file has no county column; county is not derived for it.\n")

# ---------------- counts ----------------
print("# Number of institutions per register")
md(reg_all["Vrsta registra"].value_counts().reindex(FILES).to_frame("rows"))

print("## Institutions per county (higher education has no county column)")
ct = pd.crosstab(reg_all["Županija"], reg_all["Vrsta registra"]).reindex(columns=list(FILES)[:3])
ct["Ukupno"] = ct.sum(axis=1)
ct = ct.sort_values("Ukupno", ascending=False)
md(ct)
print("Share of each register located in Grad Zagreb (county):")
md((ct.loc["Grad Zagreb"] / ct.sum() * 100).to_frame("% in Grad Zagreb"), floatfmt=".1f")

# ---------------- places ----------------
reg_all["Mjesto"] = reg_all["Mjesto"].where(reg_all["Vrsta registra"] != "Visoko učilište",
                                            reg_all["Mjesto"].str.title())
print("# Places (Mjesto)")
md(reg_all.groupby("Vrsta registra")["Mjesto"].nunique().reindex(FILES).to_frame("distinct places"))
for reg in FILES:
    print(f"Top 10 places — {reg}:")
    md(reg_all.loc[reg_all["Vrsta registra"] == reg, "Mjesto"].value_counts().head(10).to_frame("institutions"))

# ---------------- postal codes ----------------
print("# Postal codes")
pc = reg_all["Poštanski broj"]
print(f"filled: {pc.notna().sum()} of {len(reg_all)} (higher education has no postal-code column: "
      f"{(reg_all['Vrsta registra'] == 'Visoko učilište').sum()} rows)")
bad = pc.dropna()[~pc.dropna().str.fullmatch(r"\d{5}")]
print(f"not 5 digits: {len(bad)} -> {bad.tolist()[:10]}\n")

# ---------------- codes (Šifra) ----------------
print("# Institution code 'Šifra' (primary + secondary)")
sch = reg_all[reg_all["Vrsta registra"].isin(["Osnovna škola", "Srednja škola"])].copy()
print("formats (digits -> 9):")
md(sch["Šifra ustanove"].str.replace(r"\d", "9", regex=True).value_counts().to_frame("rows"))
sch["Šifra prefix"] = sch["Šifra ustanove"].str[:2]
pref = sch.groupby("Šifra prefix")["Županija"].agg(["nunique", lambda s: sorted(s.unique())]).rename(
    columns={"nunique": "distinct counties", "<lambda_0>": "counties"})
print(f"Does the 2-digit prefix map to exactly one county? prefixes: {len(pref)}, "
      f"prefixes with >1 county: {(pref['distinct counties'] > 1).sum()}; "
      f"counties with >1 prefix: {(sch.groupby('Županija')['Šifra prefix'].nunique() > 1).sum()}")
md(pref)
odd = sch[~sch["Šifra ustanove"].str.fullmatch(r"\d{2}-\d{3}-\d{3}")]
print(f"Codes not in the format 99-999-999: {len(odd)}")
md(odd[["Vrsta registra", "Šifra ustanove", "Naziv", "Županija"]])
parts = sch["Šifra ustanove"].str.extract(r"^(\d{2})-(\d{3})-(\d+)$").astype(int)
print("Last part of Šifra (after the second '-'): range by register")
md(parts[2].groupby(sch["Vrsta registra"]).agg(["min", "max"]))
print("Prefix 02 vs county (rows):")
md(pd.crosstab(sch.loc[sch["Šifra prefix"].isin(["02", "21"]), "Šifra prefix"],
               sch.loc[sch["Šifra prefix"].isin(["02", "21"]), "Županija"]))

# ---------------- overlap between primary and secondary files ----------------
print("# Institutions present in both the primary- and the secondary-school file (same Šifra)")
os_ids = set(reg_all.loc[reg_all["Vrsta registra"] == "Osnovna škola", "Šifra ustanove"])
ss_ids = set(reg_all.loc[reg_all["Vrsta registra"] == "Srednja škola", "Šifra ustanove"])
both = os_ids & ss_ids
print(f"Šifra in both files: {len(both)}")
if both:
    b = reg_all[reg_all["Šifra ustanove"].isin(both)].sort_values(["Šifra ustanove", "Vrsta registra"])
    same_name = b.groupby("Šifra ustanove")["Naziv"].nunique().eq(1).sum()
    print(f"  of which the name is identical in both files: {same_name}")
    print("  'Tip ustanove' of these rows (as given in each file):")
    md(b.groupby(["Vrsta registra", "Tip ustanove"]).size().to_frame("rows"))

# ---------------- type of institution ----------------
print("# 'Tip ustanove' (primary + secondary): full values")
md(sch.groupby(["Vrsta registra", "Tip ustanove"]).size().to_frame("rows"))
print("Single types after splitting on ', ':")
md(sch.assign(t=sch["Tip ustanove"].str.split(", ")).explode("t").groupby(["t", "Vrsta registra"]).size()
   .unstack(fill_value=0))

# ---------------- founders ----------------
print("# Founder ('Osnivač', primary + secondary)")
f = sch["Osnivač"]
kind = pd.Series("other", index=f.index)
kind[f.str.startswith("Grad ")] = "Grad (town)"
kind[f.str.startswith("Općina ")] = "Općina (municipality)"
kind[f.str.contains("županija", case=False)] = "Županija (county)"
kind[f.str.contains("Republika Hrvatska", case=False)] = "Republika Hrvatska"
sch["founder kind"] = kind
md(pd.crosstab(sch["founder kind"], sch["Vrsta registra"]))
# Sub-classify the remaining founders by words in the name. Names of private persons are NOT printed.
oth = f[kind == "other"]
sub = pd.Series("other (no keyword; includes private persons)", index=oth.index)
sub[oth.str.contains(r"ministarstvo", case=False)] = "ministry"
sub[oth.str.contains(r"biskupij|nadbiskupij|provincij|crkv|zajednic|eparhij|mešihat|družb|islamsk", case=False)] = \
    "religious body"
sub[oth.str.contains(r"udrug|društv", case=False)] = "association / society"
sub[oth.str.contains(r"d\.o\.o|s\.r\.o|gimnazija|srednja škola|centar za", case=False)] = \
    "company / private school / centre"
print("Founders not matching Grad / Općina / županija / Republika Hrvatska, by keyword category:")
md(pd.crosstab(sub, sch.loc[oth.index, "Vrsta registra"], margins=True, margins_name="Ukupno"))
print("Ministries as founders:")
md(oth[sub == "ministry"].value_counts().to_frame("rows"))
print("Founder of 'Grad Zagreb' schools vs county 'Grad Zagreb':")
md(pd.crosstab(sch["Osnivač"].eq("Grad Zagreb"), sch["Županija"].eq("Grad Zagreb")))

# ---------------- names ----------------
print("# Names")
for reg in FILES:
    n = reg_all.loc[reg_all["Vrsta registra"] == reg, "Naziv"]
    norm = n.str.lower()
    dup = norm.value_counts()
    print(f"{reg}: {len(n)} rows, distinct names (case-insensitive) {norm.nunique()}, "
          f"names used by more than one row: {(dup > 1).sum()} (covering {dup[dup > 1].sum()} rows)")
    same_place = reg_all.loc[reg_all["Vrsta registra"] == reg].assign(nn=norm).duplicated(["nn", "Mjesto"], keep=False)
    print(f"   rows sharing both name and place with another row: {same_place.sum()}")
print()
kg = reg_all[reg_all["Vrsta registra"] == "Dječji vrtić"]
print("Kindergarten rows sharing name AND place AND address with another row:",
      kg.assign(nn=kg["Naziv"].str.lower()).duplicated(["nn", "Mjesto", "Adresa"], keep=False).sum())
print("Kindergarten rows whose name does not start with 'Dječji vrtić' (case-insensitive):",
      (~kg["Naziv"].str.lower().str.startswith("dječji vrtić")).sum())
md(kg.loc[~kg["Naziv"].str.lower().str.startswith("dječji vrtić"), "Naziv"]
   .str.split().str[:2].str.join(" ").str.lower().value_counts().head(10).to_frame("first two words"))

# ---------------- higher education ----------------
hei = reg_all[reg_all["Vrsta registra"] == "Visoko učilište"]
print("# Higher education")
md(pd.crosstab(hei["Tip ustanove"], hei["Upisnik"], margins=True, margins_name="Ukupno"))
print("Parent institution ('Nadređena ustanova') by type:")
md(pd.crosstab(hei["Tip ustanove"], hei["Nadređena ustanova"].fillna("(none)")))
print("Places:")
md(hei["Mjesto"].value_counts().to_frame("institutions"))
print("'Web' values used by more than one institution:")
md(hei["Web"].str.lower().str.rstrip("/").value_counts().loc[lambda s: s > 1].to_frame("rows"))
print("MBU: all numeric?", hei["MBU"].str.fullmatch(r"\d+").all(), "| range:",
      hei["MBU"].astype(int).min(), "-", hei["MBU"].astype(int).max())

# ---------------- completeness ----------------
print("# Completeness of columns (filled rows / all rows), per register")
cols = ["Naziv", "Adresa", "Mjesto", "Poštanski broj", "Županija", "Šifra ustanove", "Osnivač", "Tip ustanove",
        "Web", "_ePošta", "_Telefon", "_Faks", "_Ravnatelj", "_Čelnik", "MBU", "Upisnik", "Nadređena ustanova"]
comp = pd.DataFrame({reg: [(f"{reg_all.loc[reg_all['Vrsta registra'] == reg, c].notna().sum()}"
                            f"/{(reg_all['Vrsta registra'] == reg).sum()}"
                            if c in COMMON[reg].values() else "–") for c in cols] for reg in FILES}, index=cols)
md(comp)
web = reg_all.loc[reg_all["Vrsta registra"].isin(["Osnovna škola", "Srednja škola"]), "Web"].dropna()
print(f"Web values (primary+secondary) without a letter (junk such as ','): {(~web.str.contains('[a-zA-Z]')).sum()}\n")

# ---------------- processed register ----------------
keep = ["Vrsta registra", "Naziv", "Adresa", "Mjesto", "Poštanski broj", "Županija", "Šifra ustanove", "MBU",
        "Osnivač", "Tip ustanove", "Upisnik", "Nadređena ustanova", "Web"]
reg_all[keep].to_csv(OUT, index=False, encoding=CSV_ENCODING)
print(f"Saved {len(reg_all)} rows x {len(keep)} columns to {OUT} (personal/contact columns excluded)")

# ---------------- chart: institutions per county ----------------
order = ct.sort_values("Ukupno").index
fig, ax = plt.subplots(figsize=(8, 6.2))
left = pd.Series(0.0, index=order)
for i, reg in enumerate(list(FILES)[:3]):
    vals = ct.loc[order, reg]
    ax.barh(order, vals, left=left, color=PALETTE[i], label=reg, edgecolor="white", linewidth=1.2, height=0.7)
    left += vals
for y, total in left.items():
    ax.text(total + 4, y, f"{int(total)}", va="center", fontsize=8, color="#52514e")
ax.set_xlabel("Broj ustanova")
ax.set_title("Dječji vrtići, osnovne i srednje škole po županiji", loc="left")
ax.legend(frameon=False, fontsize=8, loc="lower right")
ax.grid(axis="y", visible=False)
fig.tight_layout()
fig.savefig(FIG / "ustanove_po_zupaniji.png", dpi=150)
print("Chart saved to", FIG)

"""Step 17: link the registers of educational institutions (ustanove_registar.csv, step 15)
to the Erasmus+ project lists (project_list_<period>_enriched.csv, steps 05/06).

There is no shared ID, so beneficiaries are matched to register entries by NAME and
LOCATION, conservatively (exact matches after normalisation only - no fuzzy matching):

  normalisation of names: lower case, diacritics removed (č->c, š->s, ...), quotes and
  punctuation removed, whitespace collapsed, leading abbreviations expanded
  ('OŠ' -> 'osnovna skola', 'SŠ' -> 'srednja skola', 'DV' -> 'djecji vrtic'), a leading
  'l.' (letter L) read as 'I.', leading ordinal words as Roman numerals ('Druga' -> 'II.').

  Tier 1  same normalised name + same postal code
  Tier 2  same normalised name + same place
  Tier 3  same normalised name, and that name occurs only once in all registers
          (generic names such as 'Tehnička škola' are never matched by name alone)

  Tier 4  a well-defined name variant (place suffix removed; part inside parentheses or
          before/after ' - ' / ', '), linked via tier 1 or 2 only (tier 3 only if the
          project row has no location at all). Most specific variant first.

Matching is to INSTITUTIONS: schools listed in both the primary and the secondary register
(same 'Šifra') are one institution. A beneficiary is linked only if the tier yields exactly
ONE institution; ambiguous cases are counted and left unlinked. Each project row is linked
independently.

Outputs (Croatian headers, UTF-8 with BOM):
  Data/processed/erasmus_registar_poveznice.csv   one row per project with its link
  Data/processed/ustanove_erasmus_sudjelovanje.csv one row per register entry with project counts
Charts: Reports/figures/erasmus_registri/
Matching code: povezivanje.py (shared with 19_link_ka2_registri.py).
Usage:   python 17_link_registri_erasmus.py
"""
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from nazivi_stupaca import CSV_ENCODING, read_project_list
from povezivanje import Linker, load_register, norm_name, norm_place

BASE = Path(__file__).resolve().parent.parent
P = BASE / "Data" / "processed"
FIG = BASE / "Reports" / "figures" / "erasmus_registri"
FIG.mkdir(parents=True, exist_ok=True)
PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]
REGS = ["Dječji vrtić", "Osnovna škola", "Srednja škola", "Visoko učilište"]
plt.rcParams.update({"axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
                     "grid.color": "#e4e3df", "grid.linewidth": 0.6, "axes.axisbelow": True,
                     "axes.edgecolor": "#8a8984", "font.size": 9})


def md(frame, floatfmt=",.0f"):
    print(frame.to_markdown(floatfmt=floatfmt))
    print()


reg = load_register(P / "ustanove_registar.csv")
link = Linker(reg).link


rows = []
for period in ["2014-2020", "2021-2027"]:
    pl = read_project_list(P / f"project_list_{period}_enriched.csv")
    pl["period"] = period
    pl["n_name"] = pl["beneficiary"].map(norm_name)
    pl["n_place"] = pl["city"].map(norm_place)
    pl["n_pc"] = pl["postal_code"].where(pl["postal_code"].astype(str).str.fullmatch(r"\d{5}"))
    res = [link(raw, n, pl_, pc) for raw, n, pl_, pc in zip(pl["beneficiary"], pl["n_name"], pl["n_place"], pl["n_pc"])]
    pl["inst_id"] = [r[0] for r in res]
    pl["tier"] = [r[1] for r in res]
    pl["matched_as"] = [r[2] for r in res]
    rows.append(pl)
links = pd.concat(rows, ignore_index=True)

# one descriptive row per institution (for schools in both registers: 'Osnovna škola + Srednja škola')
inst = reg.groupby("inst_id").agg(registers=("Vrsta registra", lambda s: " + ".join(sorted(s, key=REGS.index))),
                                  reg_naziv=("Naziv", "first"), reg_mjesto=("Mjesto", "first"),
                                  zupanija=("Županija", "first"), osnivac=("Osnivač", "first"),
                                  tip=("Tip ustanove", "first"), sifra=("Šifra ustanove", "first"), mbu=("MBU", "first"))
links = links.merge(inst, left_on="inst_id", right_index=True, how="left")
links["linked"] = links["inst_id"].notna()

# ======================================= 1. link quality =========================================
print("# 1. Link result per period (project rows)")
md(pd.crosstab(links["tier"], links["period"], margins=True, margins_name="Ukupno"))
lk = links.groupby("period").agg(rows=("linked", "size"), linked=("linked", "sum"),
                                 amount=("amount_eur", "sum"),
                                 amount_linked=("amount_eur", lambda s: s[links.loc[s.index, "linked"]].sum()))
lk["% rows linked"] = lk["linked"] / lk["rows"] * 100
lk["% amount linked"] = lk["amount_linked"] / lk["amount"] * 100
md(lk, floatfmt=",.1f")
print("## % of project rows linked, by project sector")
md((pd.crosstab(links["sector"], links["period"], values=links["linked"], aggfunc="mean") * 100), floatfmt=".1f")
print("## Linked rows by register of the linked institution and project sector")
md(pd.crosstab(links["sector"], links["registers"].fillna("(not linked)")))
school_like = links["n_name"].str.contains(r"skola|vrtic|gimnazij|fakultet|sveuciliste|veleuciliste|ucilist", na=False)
unl = links[~links["linked"] & school_like]
print(f"## Unlinked rows whose name contains a school-like word: {len(unl)} rows, {unl['n_name'].nunique()} distinct names")
first_word = unl["n_name"].str.extract(r"^(pucko otvoreno uciliste|uciliste|ustanova za obrazovanje odraslih|"
                                       r"osnovna skola|srednja skola|djecji vrtic|visoka skola|veleuciliste|"
                                       r"sveuciliste|gimnazija|glazbena skola)")[0].fillna("(other start)")
md(first_word.value_counts().to_frame("rows"))
t34 = links[links["tier"].str[0].isin(["3", "4"])].drop_duplicates(["n_name", "inst_id"])
print(f"## All tier-3 and tier-4 links ({len(t34)} distinct name -> institution pairs; reviewed manually)")
for r in t34.itertuples():
    print(f"  [{r.tier}] {r.beneficiary[:55]!r} ({r.city}) -> {r.reg_naziv[:55]!r} ({r.reg_mjesto})")
print()
print("## Random sample of 25 tier-1/2 links (for review)")
for r in links[links["tier"].str[0].isin(["1", "2"])].sample(25, random_state=3).itertuples():
    print(f"  [{r.tier}] {r.beneficiary[:55]!r} ({r.city}) -> {r.reg_naziv[:55]!r} ({r.reg_mjesto})")
print()

# ===================================== 2. projects and money ======================================
print("# 2. Projects and amounts going to registered institutions")
links["reg_group"] = links["registers"].fillna("(not in registers)")
g = links.groupby(["period", "reg_group"])["amount_eur"].agg(projects="count", total_eur="sum").unstack("period")
md(g)
print("## Share of each period's amount (%)")
md(links.pivot_table(index="reg_group", columns="period", values="amount_eur", aggfunc="sum")
   .div(links.groupby("period")["amount_eur"].sum()) * 100, floatfmt=".1f")

# ===================================== 3. participation rates =====================================
print("# 3. Participation: register entries with >= 1 linked project")
per_inst = links[links["linked"]].groupby(["inst_id", "period"]).agg(projects=("project_id", "count"),
                                                                     amount=("amount_eur", "sum")).unstack("period")
per_inst.columns = [f"{a}_{b}" for a, b in per_inst.columns]
part = reg.merge(per_inst, left_on="inst_id", right_index=True, how="left")
for c in ["projects_2014-2020", "projects_2021-2027", "amount_2014-2020", "amount_2021-2027"]:
    part[c] = part[c].fillna(0)
part["p14"] = part["projects_2014-2020"] > 0
part["p21"] = part["projects_2021-2027"] > 0
part["any"] = part["p14"] | part["p21"]
part["both"] = part["p14"] & part["p21"]
rate = part.groupby("Vrsta registra").agg(entries=("reg_id", "count"), in_2014_2020=("p14", "sum"),
                                          in_2021_2027=("p21", "sum"), either=("any", "sum"), both=("both", "sum"))
rate = rate.reindex(REGS)
for c in ["in_2014_2020", "in_2021_2027", "either", "both"]:
    rate[f"% {c}"] = rate[c] / rate["entries"] * 100
md(rate, floatfmt=",.1f")
print("## Number of linked projects per participating entry (both periods), by register")
npj = part[part["any"]].assign(n=lambda d: d["projects_2014-2020"] + d["projects_2021-2027"])
md(npj.groupby("Vrsta registra")["n"].describe()[["count", "mean", "50%", "max"]].reindex(REGS), floatfmt=",.1f")

print("## Participation by county (% of register entries with >= 1 project, 2014-2026)")
cty = part[part["Vrsta registra"] != "Visoko učilište"].pivot_table(index="Županija", columns="Vrsta registra",
                                                                     values="any", aggfunc="mean") * 100
cnt = part[part["Vrsta registra"] != "Visoko učilište"].pivot_table(index="Županija", columns="Vrsta registra",
                                                                     values="any", aggfunc="sum")
cty = cty[REGS[:3]].sort_values("Osnovna škola", ascending=False)
md(cty.join(cnt[REGS[:3]].add_prefix("n "))[[*REGS[:3], *("n " + r for r in REGS[:3])]], floatfmt=".1f")

print("## Participation by founder kind (primary + secondary schools)")
f = part["Osnivač"].fillna("")
kind = pd.Series("other", index=part.index)
kind[f.str.startswith("Grad ")] = "town"
kind[f.str.startswith("Općina ")] = "municipality"
kind[f.str.contains("županija", case=False)] = "county"
part["founder_kind"] = kind
sch = part[part["Vrsta registra"].isin(["Osnovna škola", "Srednja škola"])]
md((sch.pivot_table(index="founder_kind", columns="Vrsta registra", values="any", aggfunc="mean") * 100)
   .join(sch.pivot_table(index="founder_kind", columns="Vrsta registra", values="any", aggfunc="size")
         .add_prefix("n entries ")), floatfmt=".1f")

print("## Higher education: participation by type")
hei = part[part["Vrsta registra"] == "Visoko učilište"]
md(hei.groupby("Tip ustanove").agg(entries=("reg_id", "count"), participating=("any", "sum"))
   .assign(pct=lambda d: d["participating"] / d["entries"] * 100), floatfmt=",.1f")

print("## Kindergarten register: participation of entries named 'Dječji vrtić' vs other entries")
kg = part[part["Vrsta registra"] == "Dječji vrtić"]
is_dv = kg["Naziv"].str.lower().str.startswith("dječji vrtić")
md(kg.groupby(is_dv.map({True: "named 'Dječji vrtić…'", False: "other names"}))["any"].agg(["size", "sum", "mean"])
   .assign(mean=lambda d: d["mean"] * 100), floatfmt=",.1f")

print("## Top 15 register entries by number of linked projects (2014-2026)")
top = part.assign(n=part["projects_2014-2020"] + part["projects_2021-2027"],
                  amt=part["amount_2014-2020"] + part["amount_2021-2027"])
md(top.sort_values(["n", "amt"], ascending=False)[["Vrsta registra", "Naziv", "Mjesto", "projects_2014-2020",
                                                   "projects_2021-2027", "amt"]].head(15))

# ===================================== outputs ====================================================
out_links = links.rename(columns={
    "period": "Razdoblje", "project_id": "Projektni broj", "call_year": "Natječajna godina", "sector": "Sektor",
    "key_action": "Ključna aktivnost", "ka_code": "Šifra ključne aktivnosti", "beneficiary": "Naziv korisnika",
    "city": "Mjesto (očišćeno)", "postal_code": "Poštanski broj (očišćen)", "amount_eur": "Iznos (EUR)",
    "tier": "Razina povezivanja", "matched_as": "Povezano kao (normalizirani naziv)", "inst_id": "ID ustanove",
    "registers": "Registar", "reg_naziv": "Naziv u registru", "reg_mjesto": "Mjesto u registru",
    "zupanija": "Županija", "osnivac": "Osnivač", "tip": "Tip ustanove", "sifra": "Šifra ustanove", "mbu": "MBU"})
cols_links = ["Razdoblje", "Projektni broj", "Natječajna godina", "Sektor", "Ključna aktivnost",
              "Šifra ključne aktivnosti", "Naziv korisnika", "Mjesto (očišćeno)", "Poštanski broj (očišćen)",
              "Iznos (EUR)", "Razina povezivanja", "Povezano kao (normalizirani naziv)", "ID ustanove", "Registar",
              "Naziv u registru", "Mjesto u registru", "Županija", "Šifra ustanove", "MBU", "Osnivač", "Tip ustanove"]
out_links[cols_links].to_csv(P / "erasmus_registar_poveznice.csv", index=False, encoding=CSV_ENCODING)
out_part = part.rename(columns={
    "inst_id": "ID ustanove", "projects_2014-2020": "Broj projekata 2014-2020",
    "projects_2021-2027": "Broj projekata 2021-2027", "amount_2014-2020": "Iznos 2014-2020 (EUR)",
    "amount_2021-2027": "Iznos 2021-2027 (EUR)"})
cols_part = ["Vrsta registra", "ID ustanove", "Naziv", "Adresa", "Mjesto", "Poštanski broj", "Županija",
             "Šifra ustanove", "MBU", "Osnivač", "Tip ustanove", "Broj projekata 2014-2020", "Broj projekata 2021-2027",
             "Iznos 2014-2020 (EUR)", "Iznos 2021-2027 (EUR)"]
out_part[cols_part].to_csv(P / "ustanove_erasmus_sudjelovanje.csv", index=False, encoding=CSV_ENCODING)
print(f"Saved {len(out_links)} project rows and {len(out_part)} register rows to {P}")

# ===================================== chart ======================================================
order = cty.sort_values("Osnovna škola").index
fig, axes = plt.subplots(1, 3, figsize=(11, 6.2), sharey=True)
for ax, r, col in zip(axes, REGS[:3], PALETTE):
    ax.barh(order, cty.loc[order, r], color=col, height=0.7)
    for y, v in zip(order, cty.loc[order, r]):
        ax.text(v + 1, y, f"{v:.0f}%", va="center", fontsize=7, color="#52514e")
    ax.set_title(r, loc="left")
    ax.set_xlim(0, 100)
    ax.grid(axis="y", visible=False)
axes[1].set_xlabel("% ustanova iz registra s barem jednim Erasmus+ projektom (2014.–2026.)")
fig.suptitle("Sudjelovanje u Erasmus+ (popisi projekata NA) po županiji", x=0.01, ha="left")
fig.tight_layout()
fig.savefig(FIG / "sudjelovanje_po_zupaniji.png", dpi=150)
print("Chart saved to", FIG)

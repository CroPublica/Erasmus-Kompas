"""Step 19: link Croatian organisations in the EU-wide KA2 files (coordinators AND partners)
to the registers of educational institutions, with the same matching rules as step 17
(povezivanje.py), and compare with the National Agency (NA) project lists.

KA2 rows: every appearance of an organisation whose country is HR, as coordinator
('Coordinator's country' == HR) or as partner ('Partner N country' == HR).
Location: KA2 has only an address string ('street, postal code, PLACE'); the postal
code is the last 5-digit number (also '10 000'), the place is the last comma-separated
part. Organisation names are trimmed (as in 09_eda_ka2.py).

Checks:
  * KA2 'organisation type' vs the register the organisation was linked to
  * HR-coordinated KA2 projects vs the NA project lists by project ID; for projects in both,
    whether the two linkings (17 and 19) point to the same institution

Outputs (Croatian headers, UTF-8 with BOM):
  Data/processed/ka2_hr_organizacije_poveznice.csv  one row per HR organisation appearance in KA2
  Data/processed/ustanove_ka2_sudjelovanje.csv       one row per register entry: KA2 + NA counts
Chart: Reports/figures/erasmus_registri/
Usage: python 19_link_ka2_registri.py
"""
import re
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from nazivi_stupaca import CSV_ENCODING, read_ka2, read_project_list
from povezivanje import Linker, load_register, norm_name, norm_place

BASE = Path(__file__).resolve().parent.parent
P = BASE / "Data" / "processed"
FIG = BASE / "Reports" / "figures" / "erasmus_registri"
REGS = ["Dječji vrtić", "Osnovna škola", "Srednja škola", "Visoko učilište"]
PALETTE = ["#2a78d6", "#eb6834"]
plt.rcParams.update({"axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
                     "grid.color": "#e4e3df", "grid.linewidth": 0.6, "axes.axisbelow": True,
                     "axes.edgecolor": "#8a8984", "font.size": 9})


def md(frame, floatfmt=",.0f"):
    print(frame.to_markdown(floatfmt=floatfmt))
    print()


# ------------------------------------------ HR appearances ------------------------------------------
apps = []
for period in ["2014-2020", "2021-2027"]:
    df = read_ka2(P / f"ka2_{period}.parquet")
    grant = next(c for c in df.columns if c.startswith("EU Grant"))
    base = df[["Project Identifier", "Call year", "Action Type", grant]].set_axis(
        ["project_id", "call_year", "action_type", "grant_eur"], axis=1)
    m = df["Coordinator's country"] == "HR"
    apps.append(base[m].assign(period=period, role="coordinator", slot=0,
                               name=df.loc[m, "Coordinating organisation name"],
                               org_type=df.loc[m, "Coordinating organisation type"],
                               address=df.loc[m, "Coordinator's address"], region=df.loc[m, "Coordinator's region"]))
    for c in [c for c in df.columns if c.startswith("Partner ") and c.endswith(" country")]:
        pre = c[: -len("country")]
        m = df[c] == "HR"
        apps.append(base[m].assign(period=period, role="partner", slot=int(pre.split()[1]),
                                   name=df.loc[m, pre + "name"], org_type=df.loc[m, pre + "organisation type"],
                                   address=df.loc[m, pre + "address"], region=df.loc[m, pre + "region"]))
ka = pd.concat(apps, ignore_index=True)
ka["name"] = ka["name"].str.strip()
ka["grant_eur"] = pd.to_numeric(ka["grant_eur"])
ka["postal_code"] = ka["address"].str.findall(r"\b(\d{2}\s?\d{3})\b").str[-1].str.replace(" ", "")
ka["place"] = ka["address"].str.split(",").str[-1].str.replace(r"\d", "", regex=True).str.strip().replace("", pd.NA)

print("# KA2: Croatian organisation appearances")
md(pd.crosstab(ka["role"], ka["period"], margins=True, margins_name="Ukupno"))
print(f"postal code parsed: {ka['postal_code'].notna().sum()} of {len(ka)}; place parsed: {ka['place'].notna().sum()}\n")

# ------------------------------------------ linking -------------------------------------------------
reg = load_register(P / "ustanove_registar.csv")
link = Linker(reg).link
ka["n_name"] = ka["name"].map(norm_name)
ka["n_place"] = ka["place"].map(norm_place)
res = [link(r, n, pl, pc) for r, n, pl, pc in zip(ka["name"], ka["n_name"], ka["n_place"], ka["postal_code"])]
ka["inst_id"] = [r[0] for r in res]
ka["tier"] = [r[1] for r in res]
ka["matched_as"] = [r[2] for r in res]
inst = reg.groupby("inst_id").agg(registers=("Vrsta registra", lambda s: " + ".join(sorted(s, key=REGS.index))),
                                  reg_naziv=("Naziv", "first"), reg_mjesto=("Mjesto", "first"),
                                  zupanija=("Županija", "first"))
ka = ka.merge(inst, left_on="inst_id", right_index=True, how="left")
ka["linked"] = ka["inst_id"].notna()

print("# 1. Link result (HR appearances)")
md(pd.crosstab(ka["tier"], [ka["period"], ka["role"]], margins=True, margins_name="Ukupno"))
print("## Linked appearances by register")
md(pd.crosstab(ka["registers"].fillna("(not linked)"), [ka["period"], ka["role"]], margins=True, margins_name="Ukupno"))

# ---- check: KA2 organisation type vs register ----
def type_group(t):
    if pd.isna(t):
        return "(empty)"
    t = t.lower()
    if "pre-primary" in t:
        return "pre-primary"
    if "primary level" in t:
        return "primary"
    if "secondary level" in t:
        return "secondary"
    if "higher education" in t or "tertiary level" in t:
        return "tertiary"
    return "other type"


ka["type_group"] = ka["org_type"].map(type_group)
print("## Check: KA2 organisation type vs register of the linked institution (appearances)")
md(pd.crosstab(ka["type_group"], ka["registers"].fillna("(not linked)"), margins=True, margins_name="Ukupno"))
expected = {"Dječji vrtić": {"pre-primary"}, "Osnovna škola": {"primary"}, "Srednja škola": {"secondary"},
            "Osnovna škola + Srednja škola": {"primary", "secondary"}, "Visoko učilište": {"tertiary"}}
lk = ka[ka["linked"] & ~ka["type_group"].isin(["(empty)"])]
agree = [tg in expected.get(r, set()) for tg, r in zip(lk["type_group"], lk["registers"])]
print(f"Linked appearances with a school/HEI-level KA2 type or 'other': {len(lk)}; "
      f"type consistent with the register: {sum(agree)} ({100 * sum(agree) / len(lk):.1f}%)")
mis = lk[[not a for a in agree]]
print(f"Inconsistent: {len(mis)}; by (KA2 type group, register):")
md(mis.groupby(["type_group", "registers"]).size().to_frame("appearances"))
def name_level(n):
    """School level stated by the (normalised) KA2 name itself."""
    if n is None:
        return None
    if re.search(r"djecji vrtic|kindergarten", n):
        return "pre-primary"
    if re.search(r"osnovna skola|primary school|^os ", n):
        return "primary"
    if re.search(r"fakultet|sveuciliste|veleuciliste|visoka|university|faculty", n):
        return "tertiary"
    if re.search(r"gimnazij|srednja|skola|school", n):
        return "secondary"
    return None


mis = mis.assign(name_level=mis["n_name"].map(name_level))
mis["name agrees with register"] = [nl in expected.get(r, set()) for nl, r in zip(mis["name_level"], mis["registers"])]
print("Inconsistent appearances: does the KA2 NAME state the same level as the register? (the KA2 type is self-reported)")
md(mis["name agrees with register"].value_counts().to_frame("appearances"))
print("Inconsistent appearances whose name does NOT agree (or states no level):")
for r in mis[~mis["name agrees with register"]].drop_duplicates(["n_name", "inst_id"]).itertuples():
    print(f"  {r.name[:55]!r} [{str(r.org_type)[:45]}] -> {r.reg_naziv[:50]!r} ({r.registers}, {r.tier})")
print()
print("All inconsistent distinct (KA2 name, KA2 type) -> register entry:")
for r in mis.drop_duplicates(["n_name", "inst_id"]).itertuples():
    print(f"  {r.name[:55]!r} [{str(r.org_type)[:50]}] -> {r.reg_naziv[:50]!r} ({r.registers}, {r.tier})")
print()

# ---- tier 3/4 pairs for manual review ----
t34 = ka[ka["tier"].str[0].isin(["3", "4"])].drop_duplicates(["n_name", "inst_id"])
print(f"## All tier-3/4 links ({len(t34)} distinct name -> institution pairs; reviewed manually)")
for r in t34.itertuples():
    print(f"  [{r.tier}] {r.name[:55]!r} ({r.place}) -> {r.reg_naziv[:55]!r} ({r.reg_mjesto})")
print()

# ---- unlinked appearances with a school/HEI type ----
unl = ka[~ka["linked"] & ka["type_group"].isin(["pre-primary", "primary", "secondary", "tertiary"])]
print(f"## Unlinked appearances whose KA2 type is pre-primary/primary/secondary/tertiary: {len(unl)} "
      f"({unl['n_name'].nunique()} distinct names)")
md(pd.crosstab(unl["type_group"], unl["period"]))
print("Most frequent unlinked names with such a type (top 25):")
md(unl.groupby(["name", "place", "type_group"]).size().sort_values(ascending=False).head(25).to_frame("appearances"))

# ------------------------------------------ cross-check with NA lists -------------------------------
print("# 2. HR-coordinated KA2 projects vs the NA project lists (by project ID)")
na = pd.concat([read_project_list(P / f"project_list_{p}.csv").assign(na_period=p) for p in ["2014-2020", "2021-2027"]])
na_links = pd.read_csv(P / "erasmus_registar_poveznice.csv", encoding=CSV_ENCODING, dtype=str)
def id_key(x):
    """Compare IDs without hyphens and without the '_N' suffix used in the NA list for some
    2015/2016 KA219 projects (e.g. '2015-1-HR01-KA219-013043_1')."""
    return re.sub(r"_\d+$", "", str(x).strip()).replace("-", "")


na["id_key"] = na["project_id"].map(id_key)
na_ids = set(na["id_key"])
co = ka[ka["role"] == "coordinator"].copy()
co["id_key"] = co["project_id"].map(id_key)
co["na_format"] = co["project_id"].str.contains(r"-HR01-KA\d{3}")
co["in_na"] = co["id_key"].isin(na_ids)
md(pd.crosstab([co["period"], co["na_format"]], co["in_na"], margins=True, margins_name="Ukupno"))
print("NA-format HR-coordinated KA2 projects NOT found in the NA lists:")
md(co[co["na_format"] & ~co["in_na"]][["period", "project_id", "action_type", "name"]])
na_ka2 = na[na["key_action"] == "KA2"]
ka2_ids = set(ka["project_id"].map(id_key))
print(f"NA-list KA2 projects (key action KA2): {len(na_ka2)}; their ID found anywhere in the KA2 files: "
      f"{na_ka2['id_key'].isin(ka2_ids).sum()}; found as HR-coordinated: "
      f"{na_ka2['id_key'].isin(set(co['id_key'])).sum()}")
print("NA-list KA2 projects not in the KA2 files:")
md(na_ka2[~na_ka2["id_key"].isin(ka2_ids)][["na_period", "project_id", "ka_code", "beneficiary"]])
na_links["id_key"] = na_links["Projektni broj"].map(id_key)
both = co[co["in_na"]].merge(na_links[["id_key", "ID ustanove"]].drop_duplicates("id_key"), on="id_key", how="left")
both["na_inst"] = both["ID ustanove"]
cmp = pd.Series("both unlinked", index=both.index)
cmp[both["inst_id"].notna() & both["na_inst"].notna() & (both["inst_id"] == both["na_inst"])] = "same institution"
cmp[both["inst_id"].notna() & both["na_inst"].notna() & (both["inst_id"] != both["na_inst"])] = "DIFFERENT institution"
cmp[both["inst_id"].notna() & both["na_inst"].isna()] = "linked only via KA2"
cmp[both["inst_id"].isna() & both["na_inst"].notna()] = "linked only via NA list"
print("Projects in both sources: do the two linkings (17 vs 19) agree on the coordinator's institution?")
md(cmp.value_counts().to_frame("projects"))
if (cmp == "DIFFERENT institution").any():
    names = reg.drop_duplicates("inst_id").set_index("inst_id")
    d = both[cmp == "DIFFERENT institution"].copy()
    d["KA2 -> register"] = d["inst_id"].map(names["Naziv"])
    d["NA -> register"] = d["na_inst"].map(names["Naziv"])
    d["parent of NA entry"] = d["na_inst"].map(names["Nadređena ustanova"])
    d["NA entry is a constituent of the KA2 institution"] = d["parent of NA entry"] == d["KA2 -> register"]
    md(d[["project_id", "KA2 -> register", "NA -> register", "parent of NA entry",
          "NA entry is a constituent of the KA2 institution"]])

# ------------------------------------------ participation -------------------------------------------
print("# 3. Participation including KA2")
cnt = ka[ka["linked"]].groupby(["inst_id", "period", "role"]).size().unstack(["period", "role"], fill_value=0)
cnt.columns = [f"ka2_{r}_{p}" for p, r in cnt.columns]
part = pd.read_csv(P / "ustanove_erasmus_sudjelovanje.csv", encoding=CSV_ENCODING, dtype={"Šifra ustanove": str})
part = part.merge(cnt, left_on="ID ustanove", right_index=True, how="left")
kcols = [c for c in part.columns if c.startswith("ka2_")]
part[kcols] = part[kcols].fillna(0).astype(int)
part["NA"] = (part["Broj projekata 2014-2020"] + part["Broj projekata 2021-2027"]) > 0
part["KA2 any"] = part[kcols].sum(axis=1) > 0
part["KA2 coordinator"] = part[[c for c in kcols if "coordinator" in c]].sum(axis=1) > 0
part["KA2 partner"] = part[[c for c in kcols if "partner" in c]].sum(axis=1) > 0
part["NA or KA2"] = part["NA"] | part["KA2 any"]
part["KA2 only"] = part["KA2 any"] & ~part["NA"]
summ = part.groupby("Vrsta registra")[["NA", "KA2 any", "KA2 coordinator", "KA2 partner", "NA or KA2", "KA2 only"]] \
    .sum().reindex(REGS)
summ.insert(0, "entries", part.groupby("Vrsta registra").size().reindex(REGS))
md(summ)
print("Same as % of entries:")
md(summ.drop(columns="entries").div(summ["entries"], axis=0) * 100, floatfmt=".1f")
print("## By period (KA2 any role), % of entries")
for p in ["2014-2020", "2021-2027"]:
    part[f"KA2 {p}"] = part[[c for c in kcols if c.endswith(p)]].sum(axis=1) > 0
md(part.groupby("Vrsta registra")[["KA2 2014-2020", "KA2 2021-2027"]].mean().reindex(REGS) * 100, floatfmt=".1f")
print("## Combined participation (NA or KA2) by county, % of entries")
cty = part[part["Vrsta registra"] != "Visoko učilište"].pivot_table(index="Županija", columns="Vrsta registra",
                                                                     values="NA or KA2", aggfunc="mean") * 100
cty_na = part[part["Vrsta registra"] != "Visoko učilište"].pivot_table(index="Županija", columns="Vrsta registra",
                                                                        values="NA", aggfunc="mean") * 100
out = pd.concat({"NA or KA2": cty[REGS[:3]], "NA only (sect. 4.1)": cty_na[REGS[:3]]}, axis=1)
md(out.sort_values(("NA or KA2", "Osnovna škola"), ascending=False), floatfmt=".1f")
print("## Institutions with the most KA2 appearances (both periods)")
part["ka2_total"] = part[kcols].sum(axis=1)
md(part.drop_duplicates("ID ustanove").sort_values("ka2_total", ascending=False)
   [["Vrsta registra", "Naziv", "Mjesto", *kcols, "ka2_total"]].head(12))

# ------------------------------------------ outputs -------------------------------------------------
out_ka = ka.rename(columns={
    "period": "Razdoblje", "project_id": "Identifikator projekta", "call_year": "Natječajna godina",
    "action_type": "Vrsta aktivnosti", "role": "Uloga", "slot": "Partner br.", "name": "Naziv organizacije",
    "org_type": "Vrsta organizacije", "address": "Adresa", "region": "Regija", "postal_code": "Poštanski broj (iz adrese)",
    "place": "Mjesto (iz adrese)", "grant_eur": "Iznos EU potpore projekta (EUR)", "tier": "Razina povezivanja",
    "matched_as": "Povezano kao (normalizirani naziv)", "inst_id": "ID ustanove", "registers": "Registar",
    "reg_naziv": "Naziv u registru", "reg_mjesto": "Mjesto u registru", "zupanija": "Županija"})
out_ka["Uloga"] = out_ka["Uloga"].map({"coordinator": "koordinator", "partner": "partner"})
cols = ["Razdoblje", "Identifikator projekta", "Natječajna godina", "Vrsta aktivnosti", "Uloga", "Partner br.",
        "Naziv organizacije", "Vrsta organizacije", "Adresa", "Regija", "Poštanski broj (iz adrese)", "Mjesto (iz adrese)",
        "Iznos EU potpore projekta (EUR)", "Razina povezivanja", "Povezano kao (normalizirani naziv)", "ID ustanove",
        "Registar", "Naziv u registru", "Mjesto u registru", "Županija"]
out_ka[cols].to_csv(P / "ka2_hr_organizacije_poveznice.csv", index=False, encoding=CSV_ENCODING)
ren = {f"ka2_{r}_{p}": f"KA2 {'koordinator' if r == 'coordinator' else 'partner'} {p}"
       for p in ["2014-2020", "2021-2027"] for r in ["coordinator", "partner"]}
part.rename(columns=ren)[["Vrsta registra", "ID ustanove", "Naziv", "Mjesto", "Županija", "Šifra ustanove", "MBU",
                          "Broj projekata 2014-2020", "Broj projekata 2021-2027", *[ren[c] for c in kcols if c in ren]]] \
    .to_csv(P / "ustanove_ka2_sudjelovanje.csv", index=False, encoding=CSV_ENCODING)
print(f"Saved {len(out_ka)} KA2 appearance rows and {len(part)} register rows")

# ------------------------------------------ chart ---------------------------------------------------
fig, ax = plt.subplots(figsize=(8, 3.8))
x = range(len(REGS))
na_pct = summ["NA"] / summ["entries"] * 100
all_pct = summ["NA or KA2"] / summ["entries"] * 100
ax.bar([i - 0.2 for i in x], na_pct, width=0.38, color=PALETTE[0], label="Popisi projekata NA")
ax.bar([i + 0.2 for i in x], all_pct, width=0.38, color=PALETTE[1], label="NA ili KA2 (uklj. partnere)")
for i, (a, b) in enumerate(zip(na_pct, all_pct)):
    ax.text(i - 0.2, a + 1, f"{a:.0f}%", ha="center", fontsize=8, color="#52514e")
    ax.text(i + 0.2, b + 1, f"{b:.0f}%", ha="center", fontsize=8, color="#52514e")
ax.set_xticks(list(x), REGS)
ax.set_ylim(0, 100)
ax.set_ylabel("% ustanova iz registra")
ax.set_title("Udio ustanova s barem jednim Erasmus+ projektom (2014.–2026.)", loc="left")
ax.legend(frameon=False, fontsize=8, loc="upper left")
ax.grid(axis="x", visible=False)
fig.tight_layout()
fig.savefig(FIG / "sudjelovanje_na_vs_ka2.png", dpi=150)
print("Chart saved to", FIG)

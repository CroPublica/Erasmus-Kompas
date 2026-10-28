"""Step 6: descriptive EDA of the funded-project list of one period (parsed by step 5).

Prints summary tables (as Markdown) and saves charts to Reports/figures/<period>/.

Usage: python 06_eda_project_list.py [2014-2020|2021-2027]
"""
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from nazivi_stupaca import CSV_ENCODING, PROJECT_LIST_HR, read_project_list

PERIOD = sys.argv[1] if len(sys.argv) > 1 else "2014-2020"
BASE = Path(__file__).resolve().parent.parent
PROJ = BASE / "Data" / "processed" / f"project_list_{PERIOD}.csv"
FIG = BASE / "Reports" / "figures" / PERIOD
FIG.mkdir(parents=True, exist_ok=True)
TABLE = {"2014-2020": "tablica_1", "2021-2027": "tablica_7"}[PERIOD]

# Reference categorical palette (light mode), fixed order: one slot per sector
PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
ALL_SECTORS = ["Odgoj i opće obrazovanje", "Strukovno obrazovanje i osposobljavanje",
               "Visoko obrazovanje", "Obrazovanje odraslih", "Mladi", "Sport"]
plt.rcParams.update({"axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
                     "grid.color": "#e4e3df", "grid.linewidth": 0.6, "axes.axisbelow": True,
                     "axes.edgecolor": "#8a8984", "text.color": "#0b0b0b", "font.size": 9})

df = read_project_list(PROJ)
SECTOR_ORDER = [s for s in ALL_SECTORS if s in set(df["sector"])]


def md(frame, floatfmt=",.0f"):
    print(frame.to_markdown(floatfmt=floatfmt))
    print()


def agg(g):
    return g["amount_eur"].agg(projects="count", total_eur="sum", mean_eur="mean", median_eur="median")


print(f"# {TABLE} ({PERIOD})")
print(f"## Overview\nrows: {len(df)}, unique project_id: {df['project_id'].nunique()}, "
      f"total amount_eur: {df['amount_eur'].sum():,.2f}\n")

print("## Amount distribution (EUR)")
md(df["amount_eur"].describe().to_frame().T, floatfmt=",.1f")

print("## By call year")
md(agg(df.groupby("call_year")))

print("## By sector")
md(agg(df.groupby("sector")).reindex(SECTOR_ORDER))

print("## By key action (from KA code)")
md(agg(df.groupby("key_action")))

print("## By KA code (from project ID)")
md(agg(df.groupby("ka_code")).sort_values("total_eur", ascending=False))

print("## KA code x sector (project counts)")
md(pd.crosstab(df["ka_code"], df["sector"]).reindex(columns=SECTOR_ORDER))

print("## KA code x year (project counts)")
md(pd.crosstab(df["ka_code"], df["call_year"]))

print("## Sector x year: total EUR")
sy_sum = df.pivot_table(index="sector", columns="call_year", values="amount_eur", aggfunc="sum").reindex(SECTOR_ORDER)
md(sy_sum)
print("## Sector x year: project counts")
sy_cnt = df.pivot_table(index="sector", columns="call_year", values="amount_eur", aggfunc="count").reindex(SECTOR_ORDER)
md(sy_cnt)

print("## Call round (digit after year in project ID) x year (counts)")
md(pd.crosstab(df["round"], df["call_year"]))

print("## Field code in project ID x sector (counts)")
md(pd.crosstab(df["field"].fillna("(none)"), df["sector"]).reindex(columns=SECTOR_ORDER))

print("## 10 smallest and 10 largest grants")
cols = ["call_year", "sector", "ka_code", "project_id", "beneficiary", "amount_eur"]
md(df.nsmallest(10, "amount_eur")[cols])
md(df.nlargest(10, "amount_eur")[cols])

print("## Most frequent grant amounts (top 10)")
md(df["amount_eur"].value_counts().head(10).to_frame("projects"))

# Beneficiaries: names are used as-is (no normalisation), so spelling variants count separately
print(f"## Beneficiaries\nunique beneficiary strings: {df['beneficiary'].nunique()}\n")
ben = df.groupby("beneficiary")["amount_eur"].agg(projects="count", total_eur="sum")
print("Distribution of projects per beneficiary string:")
md(ben["projects"].value_counts().sort_index().to_frame("beneficiaries"))

# Case- and whitespace-insensitive grouping (only lowercases and collapses spaces; nothing else)
df["beneficiary_norm"] = df["beneficiary"].str.lower().str.replace(r"\s+", " ", regex=True).str.strip()
print(f"unique beneficiaries after lowercasing + collapsing whitespace: {df['beneficiary_norm'].nunique()}\n")
ben_n = df.groupby("beneficiary_norm")["amount_eur"].agg(projects="count", total_eur="sum")
print("Top 15 by total amount (normalised name):")
md(ben_n.sort_values("total_eur", ascending=False).head(15))
print("Top 15 by number of projects (normalised name):")
md(ben_n.sort_values(["projects", "total_eur"], ascending=False).head(15))
print(f"Share of total amount going to top 10 normalised beneficiaries: "
      f"{ben_n['total_eur'].nlargest(10).sum() / df['amount_eur'].sum():.1%}\n")

# ---- Location ----
if df["city_col"].notna().any():
    # 2021-2027: dedicated 'Mjesto' and 'Poštanski broj' columns
    df["city"] = df["city_col"].str.strip().str.title()
    # 139 values are written with a space ('10 000'); remove whitespace before converting
    df["postal_code"] = pd.to_numeric(df["postal_code_col"].str.replace(r"\s+", "", regex=True), errors="coerce") \
        .astype("Int64").astype(str).replace("<NA>", pd.NA)
    source = "'Mjesto' / 'Poštanski broj' columns"
else:
    # 2014-2020: parse from address text (postal code = last 5-digit number, allowing '10 000')
    df["postal_code"] = df["address"].str.extract(r"(\d{2}\s?\d{3})\D*$")[0].str.replace(" ", "")
    df["city"] = df["address"].str.extract(r"\d{2}\s?\d{3},?\s*([^\d,]+?)\s*$")[0].str.strip().str.title()
    source = "parsed from address text"
print(f"## Location ({source})\npostal code found: {df['postal_code'].notna().sum()} / {len(df)}; "
      f"city found: {df['city'].notna().sum()} / {len(df)}\n")
bad_pc = df["postal_code"].notna() & ~df["postal_code"].astype(str).str.fullmatch(r"\d{5}")
print(f"postal codes that are not 5 digits: {bad_pc.sum()} -> {df.loc[bad_pc, 'postal_code'].tolist()[:15]}\n")
print("Top 15 cities by projects:")
md(df.groupby("city")["amount_eur"].agg(projects="count", total_eur="sum")
   .sort_values("projects", ascending=False).head(15))
print("By first two digits of postal code, top 15:")
pc2 = df.groupby(df["postal_code"].str[:2])["amount_eur"].agg(projects="count", total_eur="sum") \
    .sort_values("projects", ascending=False)
pc2["share_amount_pct"] = pc2["total_eur"] / df["amount_eur"].sum() * 100
md(pc2.head(15), floatfmt=",.1f")

print("Normalised names that appear with more than one city (could be different organisations "
      "with the same name, or address variants), top 10 by amount:")
multi = df.groupby("beneficiary_norm").agg(cities=("city", lambda s: sorted(s.dropna().unique())),
                                           projects=("amount_eur", "count"), total_eur=("amount_eur", "sum"))
multi = multi[multi["cities"].str.len() > 1].sort_values("total_eur", ascending=False)
print(f"count: {len(multi)}")
md(multi.head(10))

df.rename(columns=PROJECT_LIST_HR).to_csv(BASE / "Data" / "processed" / f"project_list_{PERIOD}_enriched.csv",
                                          index=False, encoding=CSV_ENCODING)


# ---- Charts ----
def stacked(table, ylabel, title, fname, scale=1.0, fmt="{:.1f}", pad=0.2):
    fig, ax = plt.subplots(figsize=(8, 4.2))
    bottom = pd.Series(0.0, index=table.columns)
    for i, sector in enumerate(SECTOR_ORDER):
        vals = table.loc[sector].fillna(0) / scale
        ax.bar(table.columns, vals, bottom=bottom, width=0.6, color=PALETTE[ALL_SECTORS.index(sector)],
               label=sector, edgecolor="white", linewidth=1.5)
        bottom += vals
    for x, total in bottom.items():
        ax.text(x, total + pad, fmt.format(total), ha="center", va="bottom", fontsize=8, color="#52514e")
    ax.set_xticks(list(table.columns))
    ax.set_ylabel(ylabel)
    ax.set_title(title, loc="left")
    ax.legend(frameon=False, fontsize=8, loc="upper left")
    ax.grid(axis="x", visible=False)
    fig.tight_layout()
    fig.savefig(FIG / fname, dpi=150)


stacked(sy_sum, "Ukupni iznos potpore (mil. EUR)", f"{TABLE}: iznos financiranih projekata po godini i sektoru",
        "projects_amount_by_year_sector.png", scale=1e6, pad=sy_sum.sum().max() / 1e6 * 0.01)
stacked(sy_cnt, "Broj projekata", f"{TABLE}: broj financiranih projekata po godini i sektoru",
        "projects_count_by_year_sector.png", fmt="{:.0f}", pad=sy_cnt.sum().max() * 0.01)

fig, ax = plt.subplots(figsize=(8, 3.6))
amounts = df["amount_eur"][df["amount_eur"] > 0]
bins = pd.Series(range(0, 41)).map(lambda i: 10 ** (2 + i * 0.1))
ax.hist(amounts, bins=bins, color=PALETTE[0], edgecolor="white", linewidth=1)
ax.set_xscale("log")
ax.set_xlabel("Iznos potpore po projektu (EUR, log skala)")
ax.set_ylabel("Broj projekata")
ax.set_title(f"{TABLE}: distribucija iznosa potpore ({PERIOD})", loc="left")
ax.grid(axis="x", visible=False)
fig.tight_layout()
fig.savefig(FIG / "projects_amount_distribution.png", dpi=150)
print("Charts saved to", FIG)

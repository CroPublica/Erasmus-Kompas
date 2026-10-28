"""Step 9: EDA of the EU-wide Erasmus+ KA2 project overview of one period (cached by
step 8), first for all projects, then for projects with Croatian (HR) participation.

Usage: python 09_eda_ka2.py [2014-2020|2021-2027]

Multi-value fields: 'Participating countries' is comma-separated 2-letter codes,
'Topics' is '; '-separated.
"""
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from nazivi_stupaca import read_ka2

PERIOD = sys.argv[1] if len(sys.argv) > 1 else "2014-2020"
BASE = Path(__file__).resolve().parent.parent
FIG = BASE / "Reports" / "figures" / PERIOD
FIG.mkdir(parents=True, exist_ok=True)
df = read_ka2(BASE / "Data" / "processed" / f"ka2_{PERIOD}.parquet")
GRANT = next(c for c in df.columns if c.startswith("EU Grant"))
df["grant_eur"] = pd.to_numeric(df[GRANT], errors="coerce")
df["call_year"] = pd.to_numeric(df["Call year"], errors="coerce").astype("Int64")
df["countries"] = df["Participating countries"].fillna("").str.split(",").apply(lambda l: [c.strip() for c in l if c.strip()])
df["n_countries"] = df["countries"].str.len()
partner_name_cols = [c for c in df.columns if c.startswith("Partner ") and c.endswith(" name")]
partner_country_cols = [c for c in df.columns if c.startswith("Partner ") and c.endswith(" country")]
df["n_partners"] = df[partner_name_cols].notna().sum(axis=1)
# Some organisation names carry leading/trailing spaces ('Youth Organisation Veles ' vs '... Veles');
# strip them so the same name is not counted as two organisations (found by 13_verify_ka2.py)
name_cols_all = ["Coordinating organisation name"] + partner_name_cols
df[name_cols_all] = df[name_cols_all].apply(lambda s: s.str.strip())

PALETTE = ["#2a78d6", "#eb6834", "#1baf7a"]
plt.rcParams.update({"axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
                     "grid.color": "#e4e3df", "grid.linewidth": 0.6, "axes.axisbelow": True,
                     "axes.edgecolor": "#8a8984", "font.size": 9})


def md(frame, floatfmt=",.0f"):
    print(frame.to_markdown(floatfmt=floatfmt))
    print()


def grant_agg(g):
    return g["grant_eur"].agg(projects="count", total_eur="sum", mean_eur="mean", median_eur="median")


# ================= ALL PROJECTS =================
print(f"# KA2 {PERIOD}, all projects (EU-wide)")
for c in [c for c in df.columns if c.startswith("Unnamed")]:
    print(f"Unnamed column {c!r}: non-null {df[c].notna().sum()}, values: {df[c].dropna().unique()[:10].tolist()}")
print("Rows with missing Coordinator's country:")
print(df.loc[df["Coordinator's country"].isna(), ["Project Identifier", "Action Type", "Coordinating organisation name",
                                                   "Coordinator's address", "Participating countries"]].to_string())
print(f"rows: {len(df)}, unique Project Identifier: {df['Project Identifier'].nunique()}")
print(f"grant non-numeric: {df['grant_eur'].isna().sum()}, call year non-numeric: {df['call_year'].isna().sum()}\n")
for c in ["Programme", "Key Action", "Project Status", "Is Good Practice", "Results Available"]:
    print(f"## {c}")
    md(df[c].value_counts(dropna=False).to_frame("projects"))

print("## Missing values in the first 21 (non-partner) columns")
first = df.columns[:21]
md(df[first].isna().sum().to_frame("missing").assign(pct=lambda x: x["missing"] / len(df) * 100), floatfmt=",.1f")

print("## Grant (EUR) distribution")
md(df["grant_eur"].describe().to_frame().T, floatfmt=",.1f")
print(f"grants == 0: {(df['grant_eur'] == 0).sum()}\n")

print("## By call year")
md(grant_agg(df.groupby("call_year")))
print("## By action type")
md(grant_agg(df.groupby("Action Type")).sort_values("projects", ascending=False))

print("## Partners per project (non-empty 'Partner N name') and countries per project")
md(df[["n_partners", "n_countries"]].describe().T, floatfmt=",.2f")

print("## Coordinator's country, top 20 by projects")
cc = grant_agg(df.groupby("Coordinator's country")).sort_values("projects", ascending=False)
cc["share_projects_pct"] = cc["projects"] / len(df) * 100
md(cc.head(20), floatfmt=",.1f")
print(f"HR rank among {len(cc)} coordinator countries by projects: "
      f"{cc.index.get_loc('HR') + 1 if 'HR' in cc.index else 'not present'}\n")

print("## Coordinating organisation type, top 15")
md(df["Coordinating organisation type"].value_counts().head(15).to_frame("projects"))

topics = df["Topics"].dropna().str.split(";").explode().str.strip()
print(f"## Topics: {topics.nunique()} distinct, top 15")
md(topics.value_counts().head(15).to_frame("projects"))

# ================= CROATIA =================
df["hr_coord"] = df["Coordinator's country"].eq("HR")
df["hr_participates"] = df["countries"].apply(lambda l: "HR" in l)
df["hr_partner_count"] = (df[partner_country_cols] == "HR").sum(axis=1)
print("# Croatian participation")
print(f"HR in 'Participating countries': {df['hr_participates'].sum()} projects")
print(f"HR as coordinator country: {df['hr_coord'].sum()} projects")
print(f"Projects with >=1 partner whose country is HR: {(df['hr_partner_count'] > 0).sum()}")
print(f"Consistency: HR coordinator or HR partner, but HR not in Participating countries: "
      f"{((df['hr_coord'] | (df['hr_partner_count'] > 0)) & ~df['hr_participates']).sum()}")
print(f"Consistency: HR in Participating countries, but neither coordinator nor partner is HR: "
      f"{(df['hr_participates'] & ~df['hr_coord'] & (df['hr_partner_count'] == 0)).sum()}\n")

hr = df[df["hr_participates"]]
print("## HR-participating projects by call year (grant = whole-project grant, not the HR share)")
by_year = grant_agg(hr.groupby("call_year"))
by_year["hr_coordinated"] = hr.groupby("call_year")["hr_coord"].sum()
by_year["share_of_all_projects_pct"] = by_year["projects"] / df.groupby("call_year").size() * 100
md(by_year, floatfmt=",.1f")

print("## HR-participating projects by action type")
at = hr.groupby("Action Type").agg(projects=("grant_eur", "count"), hr_coordinated=("hr_coord", "sum"))
md(at.sort_values("projects", ascending=False))

hrc = df[df["hr_coord"]]
print(f"## HR-coordinated projects ({len(hrc)})")
md(grant_agg(hrc.groupby("call_year")))
print("Top 15 HR coordinating organisations (by projects):")
md(grant_agg(hrc.groupby("Coordinating organisation name")).sort_values(["projects", "total_eur"], ascending=False).head(15))
print("HR coordinator organisation types:")
md(hrc["Coordinating organisation type"].value_counts().to_frame("projects"))
print("HR coordinator region:")
md(hrc["Coordinator's region"].value_counts(dropna=False).to_frame("projects"))

# HR organisations appearing as partners
name_cols = [c.replace(" country", " name") for c in partner_country_cols]
hr_partners = pd.concat([df.loc[df[cc_] == "HR", [nc, cc_.replace(" country", " organisation type")]]
                         .set_axis(["name", "type"], axis=1) for cc_, nc in zip(partner_country_cols, name_cols)])
print(f"## HR partner appearances: {len(hr_partners)} (distinct names: {hr_partners['name'].nunique()})")
print("Top 15 HR partner organisations by number of projects:")
md(hr_partners["name"].value_counts().head(15).to_frame("projects"))
print("HR partner organisation types:")
md(hr_partners["type"].value_counts().head(10).to_frame("appearances"))

print("## Countries most often together with HR in HR-participating projects (top 15)")
co = hr["countries"].explode()
md(co[co != "HR"].value_counts().head(15).to_frame("projects"))

hr_topics = hr["Topics"].dropna().str.split(";").explode().str.strip()
print("## Topics in HR-participating projects, top 10")
md(hr_topics.value_counts().head(10).to_frame("projects"))

# ---- chart: HR-participating projects per year, split coordinated vs partner-only ----
fig, ax = plt.subplots(figsize=(8, 4.2))
coord = by_year["hr_coordinated"]
partner_only = by_year["projects"] - coord
ax.bar(by_year.index.astype(str), coord, width=0.6, color=PALETTE[0], label="HR koordinator",
       edgecolor="white", linewidth=1.5)
ax.bar(by_year.index.astype(str), partner_only, bottom=coord, width=0.6, color=PALETTE[1],
       label="HR samo partner", edgecolor="white", linewidth=1.5)
for x, t in zip(by_year.index.astype(str), by_year["projects"]):
    ax.text(x, t + 5, f"{int(t)}", ha="center", va="bottom", fontsize=8, color="#52514e")
ax.set_ylabel("Broj projekata")
ax.set_title(f"KA2 {PERIOD}: projekti s hrvatskim sudjelovanjem po godini poziva", loc="left")
ax.legend(frameon=False, fontsize=8, loc="upper left")
ax.grid(axis="x", visible=False)
fig.tight_layout()
fig.savefig(FIG / "ka2_hr_projects_by_year.png", dpi=150)
print("Chart saved to", FIG)

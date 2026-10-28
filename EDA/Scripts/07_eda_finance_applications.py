"""Step 7: tidy + describe the financial overview and the received-vs-contracted
tables of one period, and cross-check them against the project list (step 5).

  2014-2020: tablica_2 (finance), tablica_3 (applications)
  2021-2027: tablica_8 (finance), tablica_9 (applications, additionally split by KA1/KA2)

Layout of both sheets: year label in column 0 (only on the first row of each
block), optional KA label, item label, one column per sector, total column.
Columns are located from the header row ('Natječajna godina' in column 0).
Asterisks in labels (footnote markers) are stripped and kept in *_raw columns.

Usage: python 07_eda_finance_applications.py [2014-2020|2021-2027]
"""
import re
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from nazivi_stupaca import CSV_ENCODING, LONG_HR, read_project_list

PERIOD = sys.argv[1] if len(sys.argv) > 1 else "2014-2020"
BASE = Path(__file__).resolve().parent.parent
D = BASE / "Data" / PERIOD
OUT = BASE / "Data" / "processed"
FIG = BASE / "Reports" / "figures" / PERIOD
FIG.mkdir(parents=True, exist_ok=True)
FIN = next(p for p in D.glob("tablica_*.xlsx") if "financijskih" in p.name)
APP = next(p for p in D.glob("tablica_*.xlsx") if "zaprimljenih" in p.name)
ALL_SECTORS = ["Odgoj i opće obrazovanje", "Strukovno obrazovanje i osposobljavanje",
               "Visoko obrazovanje", "Obrazovanje odraslih", "Mladi", "Sport"]
PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"]
plt.rcParams.update({"axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
                     "grid.color": "#e4e3df", "grid.linewidth": 0.6, "axes.axisbelow": True,
                     "axes.edgecolor": "#8a8984", "font.size": 9})


def md(frame, floatfmt=",.0f"):
    print(frame.to_markdown(floatfmt=floatfmt))
    print()


def strip_marks(s):
    return re.sub(r"\*+", "", str(s)).strip()


def tidy(path):
    raw = pd.read_excel(path, header=None)
    hdr_idx = raw.index[raw[0].astype(str).str.strip() == "Natječajna godina"][0]
    hdr = raw.loc[hdr_idx]
    sector_cols = {c: strip_marks(v) for c, v in hdr.items() if pd.notna(v) and strip_marks(v) in ALL_SECTORS}
    total_col = next(c for c, v in hdr.items() if pd.notna(v) and str(v).strip().startswith("Ukupno"))
    item_col = min(sector_cols) - 1
    body = raw.iloc[hdr_idx + 1:].copy()
    ka_col = item_col - 1 if body[item_col - 1].astype(str).str.match(r"^KA\d").any() else None
    body = body[body[item_col].notna()]
    body["year"] = body[0].ffill().astype(str).str.strip().str.rstrip(".")
    body["ka"] = body[ka_col].ffill().astype(str).str.strip() if ka_col is not None else "all"
    body.loc[~body["year"].str.isdigit(), "ka"] = "all"  # overall total rows have no KA split
    body["item_raw"] = body[item_col].astype(str).str.strip()
    body["item"] = body["item_raw"].map(strip_marks)
    body = body.rename(columns={**sector_cols, total_col: "Ukupno"})
    sectors = list(sector_cols.values())
    long = body.melt(id_vars=["year", "ka", "item", "item_raw"], value_vars=sectors + ["Ukupno"],
                     var_name="sector", value_name="value")
    long["value"] = pd.to_numeric(long["value"], errors="coerce")
    print(f"Header row r{hdr_idx}; sector columns: {sectors}; KA column: {ka_col}")
    print(f"Year labels: {body['year'].unique().tolist()}")
    print(f"Item labels (raw): {body['item_raw'].unique().tolist()}")
    notes = raw.iloc[:, 0].dropna().astype(str).str.strip()
    notes = notes[notes.str.startswith("*") | notes.str.startswith("Datum")]
    print("Footnotes / update date:")
    for n in notes:
        print("  ", n.strip())
    print()
    return long, sectors


def checks(long, sectors, label):
    w = long.pivot_table(index=["year", "ka", "item"], columns="sector", values="value")
    w = w[~w.index.get_level_values("item").str.startswith("%")]
    complete = w.dropna(subset=sectors + ["Ukupno"], how="any")
    sec = [s for s in sectors]
    diff = (complete[sec].fillna(0).sum(axis=1) - complete["Ukupno"]).abs()
    print(f"[{label}] sum of sector columns vs 'Ukupno': {len(w)} non-% rows, "
          f"rows with a missing cell: {len(w) - len(w.dropna(subset=['Ukupno']))} (Ukupno missing); "
          f"max abs diff on rows with Ukupno = {(w[sec].fillna(0).sum(axis=1) - w['Ukupno']).abs().max():,.2f}")
    years = [y for y in long["year"].unique() if y.isdigit()]
    tot_label = [y for y in long["year"].unique() if not y.isdigit()][0]
    yr = long[long["year"].isin(years) & ~long["item"].str.startswith("%")].groupby(["item", "sector"])["value"].sum(min_count=1)
    tt = long[(long["year"] == tot_label) & ~long["item"].str.startswith("%")].groupby(["item", "sector"])["value"].sum(min_count=1)
    cmp = pd.concat([yr.rename("sum_of_years"), tt.rename("total_row")], axis=1)
    cmp["diff"] = cmp["sum_of_years"] - cmp["total_row"]
    print(f"[{label}] sum of yearly rows vs '{tot_label}' row: max abs diff = {cmp['diff'].abs().max():,.2f}")
    if cmp["diff"].abs().max() > 0.01:
        md(cmp[cmp["diff"].abs() > 0.01])
    print()


# ---------------- finance ----------------
print(f"# {FIN.name}")
fin, fin_sectors = tidy(FIN)
fin.rename(columns=LONG_HR).to_csv(OUT / f"finance_{PERIOD}_long.csv", index=False, encoding=CSV_ENCODING)
cols = fin_sectors + ["Ukupno"]
for item in ["Raspoloživo", "Ugovoreno", "Realizirano"]:
    print(f"## {item} (EUR) by year x sector")
    md(fin[fin["item"] == item].pivot(index="year", columns="sector", values="value")[cols])
for item in [i for i in fin["item"].unique() if i.startswith("%")]:
    print(f"## {item} by year x sector")
    md(fin[fin["item"] == item].pivot(index="year", columns="sector", values="value")[cols], floatfmt=".3f")
print("## Missing cells per item (all year x sector cells, incl. Ukupno)")
md(fin.groupby("item")["value"].apply(lambda s: s.isna().sum()).to_frame("missing_cells"))
checks(fin, fin_sectors, "finance")

# ---------------- applications ----------------
print(f"# {APP.name}")
app, app_sectors = tidy(APP)
app.rename(columns=LONG_HR).to_csv(OUT / f"applications_{PERIOD}_long.csv", index=False, encoding=CSV_ENCODING)
cols = app_sectors + ["Ukupno"]
has_ka = (app["ka"] != "all").any()
for ka in app["ka"].unique():
    for item in app["item"].unique():
        sub = app[(app["ka"] == ka) & (app["item"] == item)]
        if sub.empty:
            continue
        print(f"## {item} by year x sector" + (f" — {ka}" if ka != "all" else ""))
        md(sub.pivot(index="year", columns="sector", values="value")[cols],
           floatfmt=".3f" if item.startswith("%") else ",.0f")
if has_ka:
    print("## KA1 + KA2 combined, by year x sector (sums; % recomputed = Ugovoreni / Prijave)")
    yrs = app[app["ka"] != "all"]
    comb = yrs[~yrs["item"].str.startswith("%")].groupby(["year", "item", "sector"])["value"].sum(min_count=1).unstack("sector")[cols]
    for item in ["Prijave", "Ugovoreni"]:
        print(f"### {item}")
        md(comb.xs(item, level="item"))
    print("### % prolaznosti (recomputed)")
    md(comb.xs("Ugovoreni", level="item") / comb.xs("Prijave", level="item"), floatfmt=".3f")
checks(app, app_sectors, "applications")

# ---------------- cross-check with the project list ----------------
print("# Cross-check: project list vs finance 'Ugovoreno' and applications 'Ugovoreni'")
pl = read_project_list(OUT / f"project_list_{PERIOD}.csv")
pl["year"] = pl["call_year"].astype(str)
pl_sectors = [s for s in ALL_SECTORS if s in set(pl["sector"])]
pl_sum = pl.pivot_table(index="year", columns="sector", values="amount_eur", aggfunc="sum")[pl_sectors]
pl_cnt = pl.pivot_table(index="year", columns="sector", values="amount_eur", aggfunc="count")[pl_sectors]
ugov = fin[fin["item"] == "Ugovoreno"].pivot(index="year", columns="sector", values="value")[pl_sectors]
print("## project-list sum / finance Ugovoreno (ratio)")
md(pl_sum / ugov.loc[pl_sum.index], floatfmt=".3f")
ugov_n = app[(app["item"] == "Ugovoreni") & (app["year"].str.isdigit())] \
    .groupby(["year", "sector"])["value"].sum(min_count=1).unstack()[pl_sectors]
print("## project-list count - applications Ugovoreni (difference; KA1+KA2 summed where split)")
md(pl_cnt - ugov_n.loc[pl_cnt.index], floatfmt=".0f")
if has_ka:
    for ka in ["KA1", "KA2"]:
        sub = pl[pl["key_action"] == ka]
        cnt = sub.pivot_table(index="year", columns="sector", values="amount_eur", aggfunc="count") \
            .reindex(columns=pl_sectors).fillna(0)
        ref = app[(app["item"] == "Ugovoreni") & (app["ka"] == ka)].pivot(index="year", columns="sector", values="value") \
            .reindex(columns=pl_sectors)
        print(f"## {ka}: project-list count - applications Ugovoreni")
        md(cnt - ref.loc[cnt.index], floatfmt=".0f")

# ---------------- charts ----------------
years = sorted(y for y in app["year"].unique() if y.isdigit())
panels = [k for k in app["ka"].unique() if k != "all"] or ["all"]
fig, axes = plt.subplots(1, len(panels), figsize=(8 if len(panels) == 1 else 11, 4.2), sharey=True, squeeze=False)
for ax, ka in zip(axes[0], panels):
    rate = app[(app["item"] == "% prolaznosti") & (app["ka"] == ka) & app["year"].isin(years)] \
        .pivot(index="year", columns="sector", values="value")
    for s in app_sectors:
        if s in rate and rate[s].notna().any():
            ax.plot(rate.index, rate[s] * 100, color=PALETTE[ALL_SECTORS.index(s)], linewidth=2, marker="o",
                    markersize=5, label=s)
    ax.set_ylim(0, 105)
    ax.set_title(f"{APP.name.split('_')[0]}_{APP.name.split('_')[1]}: stopa prolaznosti" + (f" — {ka}" if ka != "all" else ""),
                 loc="left")
axes[0][0].set_ylabel("% prolaznosti (ugovoreni / prijave)")
handles = {}
for ax in axes[0]:  # collect series from all panels (Sport only appears in KA1)
    for h, lab in zip(*ax.get_legend_handles_labels()):
        handles.setdefault(lab, h)
labels = [s for s in app_sectors if s in handles]
axes[0][-1].legend([handles[s] for s in labels], labels, frameon=False, fontsize=8,
                   loc="lower right" if len(panels) == 1 else "upper right")
fig.tight_layout()
fig.savefig(FIG / "success_rate.png", dpi=150)

money = fin[(fin["sector"] == "Ukupno") & fin["year"].str.isdigit()].pivot(index="year", columns="item", values="value")
fig, ax = plt.subplots(figsize=(8, 4.2))
x = range(len(money))
for j, item in enumerate(["Raspoloživo", "Ugovoreno", "Realizirano"]):
    ax.bar([k + (j - 1) * 0.26 for k in x], money[item] / 1e6, width=0.24, color=PALETTE[j], label=item)
ax.set_xticks(list(x), money.index)
ax.set_ylabel("mil. EUR")
ax.set_title(f"{FIN.name.split('_')[0]}_{FIN.name.split('_')[1]}: raspoloživo, ugovoreno i realizirano (Ukupno)",
             loc="left")
ax.legend(frameon=False, fontsize=8, loc="upper left")
ax.grid(axis="x", visible=False)
fig.tight_layout()
fig.savefig(FIG / "budget_by_year.png", dpi=150)
print("Charts saved to", FIG)

"""Step 13: independent verification of the KA2 tables produced by 09_eda_ka2.py.

Two independent paths compute the same statistics and are compared value by value:

  INDEPENDENT: the original .xls read cell by cell with xlrd (no pandas, no parquet
               cache, no NA conversion) and aggregated in plain Python
               (collections.Counter, statistics.median).
  PIPELINE:    the parquet cache from 08_load_cache_ka2.py aggregated with the same
               pandas expressions as 09_eda_ka2.py.

Full distributions are compared (e.g. every coordinator country, every topic, every
HR partner name), not only the top-N rows shown in the reports.

Usage: python 13_verify_ka2.py [2014-2020|2021-2027]
"""
import statistics
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
from nazivi_stupaca import read_ka2
import xlrd

PERIOD = sys.argv[1] if len(sys.argv) > 1 else "2014-2020"
BASE = Path(__file__).resolve().parent.parent
SRC = next((BASE / "Data" / PERIOD).glob("ErasmusPlus_KA2_*.xls"))


# ============================ INDEPENDENT (xlrd + plain Python) ============================
def text(v):
    """Cell value as text; integral floats without '.0' (xlrd returns numbers as float)."""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


t0 = time.time()
sh = xlrd.open_workbook(SRC).sheet_by_index(0)
hdr = [str(h).strip() for h in sh.row_values(0)]
col = {h: i for i, h in enumerate(hdr)}
GRANT = next(h for h in hdr if h.startswith("EU Grant"))
p_name = [i for i, h in enumerate(hdr) if h.startswith("Partner ") and h.endswith(" name")]
p_country = [i for i, h in enumerate(hdr) if h.startswith("Partner ") and h.endswith(" country")]
p_type = [i for i, h in enumerate(hdr) if h.startswith("Partner ") and h.endswith(" organisation type")]
assert len(p_name) == len(p_country) == len(p_type)

ind = {}
rows = [sh.row_values(r) for r in range(1, sh.nrows)]
print(f"xlrd read {len(rows)} rows x {len(hdr)} cols in {time.time() - t0:.0f}s")


def get(r, name):
    v = r[col[name]]
    return "" if v == "" else text(v).strip() if isinstance(v, str) else text(v)


grants = [float(r[col[GRANT]]) for r in rows]
years = [int(float(r[col["Call year"]])) for r in rows]
ind["rows"] = len(rows)
ind["unique_ids"] = len({get(r, "Project Identifier") for r in rows})
for c in ["Project Status", "Is Good Practice", "Results Available", "Action Type"]:
    ind[f"count:{c}"] = dict(Counter(get(r, c) for r in rows))
for c in hdr[:21]:
    ind[f"missing:{c}"] = sum(1 for r in rows if r[col[c]] == "")
ind["grant:sum"] = sum(grants)
ind["grant:mean"] = sum(grants) / len(grants)
ind["grant:median"] = statistics.median(grants)
ind["grant:min"], ind["grant:max"] = min(grants), max(grants)
ind["grant:zero"] = sum(g == 0 for g in grants)

by_year = defaultdict(list)
by_type = defaultdict(list)
by_cc = defaultdict(list)
for r, g, y in zip(rows, grants, years):
    by_year[y].append(g)
    by_type[get(r, "Action Type")].append(g)
    by_cc[get(r, "Coordinator's country")].append(g)
for name, d in [("year", by_year), ("action_type", by_type), ("coord_country", by_cc)]:
    ind[f"{name}:n"] = {k: len(v) for k, v in d.items()}
    ind[f"{name}:sum"] = {k: sum(v) for k, v in d.items()}
    ind[f"{name}:median"] = {k: statistics.median(v) for k, v in d.items()}

countries = [[c.strip() for c in get(r, "Participating countries").split(",") if c.strip()] for r in rows]
n_partners = [sum(1 for i in p_name if r[i] != "") for r in rows]
n_countries = [len(c) for c in countries]
ind["partners:mean"], ind["partners:median"], ind["partners:max"] = \
    sum(n_partners) / len(rows), statistics.median(n_partners), max(n_partners)
ind["countries:mean"], ind["countries:median"], ind["countries:max"] = \
    sum(n_countries) / len(rows), statistics.median(n_countries), max(n_countries)
ind["coord_type"] = dict(Counter(get(r, "Coordinating organisation type") for r in rows
                                 if r[col["Coordinating organisation type"]] != ""))

topic_lists = [[t.strip() for t in get(r, "Topics").split(";")] for r in rows if r[col["Topics"]] != ""]
ind["topics"] = dict(Counter(t for l in topic_lists for t in l))

# Croatia
hr_part = [("HR" in c) for c in countries]
hr_coord = [get(r, "Coordinator's country") == "HR" for r in rows]
hr_pcount = [sum(1 for i in p_country if text(r[i]) == "HR") for r in rows]
ind["hr:participates"] = sum(hr_part)
ind["hr:coordinates"] = sum(hr_coord)
ind["hr:has_hr_partner"] = sum(1 for n in hr_pcount if n > 0)
ind["hr:partner_appearances"] = sum(hr_pcount)
ind["hr:inconsistent"] = sum(1 for a, b, n in zip(hr_part, hr_coord, hr_pcount) if a != (b or n > 0))
hr_rows = [(r, g, y, c) for r, g, y, c, p in zip(rows, grants, years, hr_coord, hr_part) if p]
ind["hr_year:n"] = dict(Counter(y for _, _, y, _ in hr_rows))
ind["hr_year:coord"] = dict(Counter(y for _, _, y, c in hr_rows if c))
ind["hr_year:sum"] = {y: sum(g for _, g, yy, _ in hr_rows if yy == y) for y in ind["hr_year:n"]}
ind["hr_year:median"] = {y: statistics.median([g for _, g, yy, _ in hr_rows if yy == y]) for y in ind["hr_year:n"]}
ind["hr_type:n"] = dict(Counter(get(r, "Action Type") for r, _, _, _ in hr_rows))
ind["hr_type:coord"] = dict(Counter(get(r, "Action Type") for r, _, _, c in hr_rows if c))
hrc = [(r, g, y) for r, g, y, c in zip(rows, grants, years, hr_coord) if c]
ind["hrc_year:n"] = dict(Counter(y for _, _, y in hrc))
ind["hrc_year:sum"] = {y: sum(g for _, g, yy in hrc if yy == y) for y in ind["hrc_year:n"]}
ind["hrc_org:n"] = dict(Counter(get(r, "Coordinating organisation name") for r, _, _ in hrc))
ind["hrc_org:sum"] = {k: sum(g for r, g, _ in hrc if get(r, "Coordinating organisation name") == k)
                      for k in ind["hrc_org:n"]}
ind["hrc_type"] = dict(Counter(get(r, "Coordinating organisation type") for r, _, _ in hrc
                               if r[col["Coordinating organisation type"]] != ""))
ind["hrc_region"] = dict(Counter(get(r, "Coordinator's region") or "<empty>" for r, _, _ in hrc))
hr_partner_names, hr_partner_types = Counter(), Counter()
for r in rows:
    for ni, ci, ti in zip(p_name, p_country, p_type):
        if text(r[ci]) == "HR":
            hr_partner_names[text(r[ni]).strip()] += 1
            if r[ti] != "":
                hr_partner_types[text(r[ti]).strip()] += 1
ind["hr_partner_names"] = dict(hr_partner_names)
ind["hr_partner_types"] = dict(hr_partner_types)
ind["hr_co_countries"] = dict(Counter(c for cl, p in zip(countries, hr_part) if p for c in cl if c != "HR"))
ind["hr_topics"] = dict(Counter(t.strip() for r, _, _, _ in hr_rows if r[col["Topics"]] != ""
                                for t in get(r, "Topics").split(";")))

# ============================ PIPELINE (parquet + pandas, as in 09) ============================
df = read_ka2(BASE / "Data" / "processed" / f"ka2_{PERIOD}.parquet")
df["grant_eur"] = pd.to_numeric(df[GRANT], errors="coerce")
df["call_year"] = pd.to_numeric(df["Call year"], errors="coerce").astype("Int64")
df["countries"] = df["Participating countries"].fillna("").str.split(",").apply(lambda l: [c.strip() for c in l if c.strip()])
pn = [c for c in df.columns if c.startswith("Partner ") and c.endswith(" name")]
pc = [c for c in df.columns if c.startswith("Partner ") and c.endswith(" country")]
df["n_partners"] = df[pn].notna().sum(axis=1)
name_cols_all = ["Coordinating organisation name"] + pn
df[name_cols_all] = df[name_cols_all].apply(lambda s: s.str.strip())  # as in 09_eda_ka2.py
df["n_countries"] = df["countries"].str.len()


def dd(s):
    # keys: call years come as numpy ints -> int; everything else (incl. names that are digits) stays text
    return {(int(k) if isinstance(k, (int, np.integer)) else k): (float(v) if isinstance(v, float) else int(v))
            for k, v in s.items()}


pip = {"rows": len(df), "unique_ids": df["Project Identifier"].nunique()}
for c in ["Project Status", "Is Good Practice", "Results Available", "Action Type"]:
    pip[f"count:{c}"] = dd(df[c].value_counts())
for c in df.columns[:21]:
    pip[f"missing:{c}"] = int(df[c].isna().sum())
g = df["grant_eur"]
pip.update({"grant:sum": g.sum(), "grant:mean": g.mean(), "grant:median": g.median(), "grant:min": g.min(),
            "grant:max": g.max(), "grant:zero": int((g == 0).sum())})
for name, key in [("year", "call_year"), ("action_type", "Action Type"), ("coord_country", "Coordinator's country")]:
    grp = df.groupby(key)["grant_eur"]
    pip[f"{name}:n"], pip[f"{name}:sum"], pip[f"{name}:median"] = dd(grp.count()), dd(grp.sum()), dd(grp.median())
pip["partners:mean"], pip["partners:median"], pip["partners:max"] = \
    df["n_partners"].mean(), df["n_partners"].median(), df["n_partners"].max()
pip["countries:mean"], pip["countries:median"], pip["countries:max"] = \
    df["n_countries"].mean(), df["n_countries"].median(), df["n_countries"].max()
pip["coord_type"] = dd(df["Coordinating organisation type"].value_counts())
pip["topics"] = dd(df["Topics"].dropna().str.split(";").explode().str.strip().value_counts())
df["hr_coord"] = df["Coordinator's country"].eq("HR")
df["hr_participates"] = df["countries"].apply(lambda l: "HR" in l)
df["hr_partner_count"] = (df[pc] == "HR").sum(axis=1)
pip["hr:participates"] = int(df["hr_participates"].sum())
pip["hr:coordinates"] = int(df["hr_coord"].sum())
pip["hr:has_hr_partner"] = int((df["hr_partner_count"] > 0).sum())
pip["hr:partner_appearances"] = int(df["hr_partner_count"].sum())
pip["hr:inconsistent"] = int((df["hr_participates"] != (df["hr_coord"] | (df["hr_partner_count"] > 0))).sum())
hr = df[df["hr_participates"]]
pip["hr_year:n"] = dd(hr.groupby("call_year").size())
pip["hr_year:coord"] = dd(hr.groupby("call_year")["hr_coord"].sum().loc[lambda s: s > 0])
pip["hr_year:sum"] = dd(hr.groupby("call_year")["grant_eur"].sum())
pip["hr_year:median"] = dd(hr.groupby("call_year")["grant_eur"].median())
pip["hr_type:n"] = dd(hr.groupby("Action Type").size())
pip["hr_type:coord"] = dd(hr.groupby("Action Type")["hr_coord"].sum().loc[lambda s: s > 0])
hrc_df = df[df["hr_coord"]]
pip["hrc_year:n"] = dd(hrc_df.groupby("call_year").size())
pip["hrc_year:sum"] = dd(hrc_df.groupby("call_year")["grant_eur"].sum())
pip["hrc_org:n"] = dd(hrc_df.groupby("Coordinating organisation name").size())
pip["hrc_org:sum"] = dd(hrc_df.groupby("Coordinating organisation name")["grant_eur"].sum())
pip["hrc_type"] = dd(hrc_df["Coordinating organisation type"].value_counts())
pip["hrc_region"] = dd(hrc_df["Coordinator's region"].fillna("<empty>").value_counts())
name_cols = [c.replace(" country", " name") for c in pc]
hp = pd.concat([df.loc[df[c] == "HR", [n, c.replace(" country", " organisation type")]].set_axis(["name", "type"], axis=1)
                for c, n in zip(pc, name_cols)])
pip["hr_partner_names"] = dd(hp["name"].value_counts())
pip["hr_partner_types"] = dd(hp["type"].value_counts())
co = hr["countries"].explode()
pip["hr_co_countries"] = dd(co[co != "HR"].value_counts())
pip["hr_topics"] = dd(hr["Topics"].dropna().str.split(";").explode().str.strip().value_counts())

# ============================ COMPARE ============================
def close(a, b):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) <= 1e-6 * max(1.0, abs(a), abs(b))
    return a == b


n_values, problems = 0, []
for k in ind:
    a, b = ind[k], pip.get(k)
    if isinstance(a, dict):
        b = b or {}
        for kk in set(a) | set(b):
            n_values += 1
            if not close(a.get(kk), b.get(kk)):
                problems.append((k, kk, a.get(kk), b.get(kk)))
    else:
        n_values += 1
        if not close(a, b):
            problems.append((k, None, a, b))
print(f"\n{PERIOD}: compared {len(ind)} statistics / {n_values} individual values; mismatches: {len(problems)}")
print("Mismatches per statistic:", dict(Counter(p[0] for p in problems)))
for p in problems[:60]:
    print(f"  MISMATCH {p[0]} [{p[1]!r}]: independent={p[2]!r} pipeline={p[3]!r}")

print("\nHeadline values (independent path):")
for k in ["rows", "unique_ids", "grant:median", "grant:max", "grant:zero", "partners:mean", "partners:median",
          "countries:median", "hr:participates", "hr:coordinates", "hr:has_hr_partner", "hr:partner_appearances",
          "hr:inconsistent"]:
    print(f"  {k}: {ind[k]}")
print(f"  coordinator countries: {len(ind['coord_country:n'])}; HR rank by projects: "
      f"{sorted(ind['coord_country:n'], key=lambda c: -ind['coord_country:n'][c]).index('HR') + 1}")
print(f"  distinct topics: {len(ind['topics'])}; distinct HR partner names: {len(ind['hr_partner_names'])}")
print(f"  HR projects by year: {dict(sorted(ind['hr_year:n'].items()))}")
print(f"  HR-coordinated by year: {dict(sorted(ind['hr_year:coord'].items()))}")

"""Step 12: independent checks for bugs in the processing (05, 07, 09).

  A. Project list: reconcile parsed projects with the subtotal rows printed in the
     sheets ('Ukupno' / 'subtotal'): sum of project amounts since the previous
     subtotal-like row vs the subtotal value.
  B. Project list: rows that look like projects (beneficiary + amount) but were not
     parsed because the first cell is not a project ID (would be silently dropped).
  C. Project list: IDs with a '_N' suffix - does the same ID also exist without it?
  D. Finance / applications: raw non-empty cells that became NaN in the long files.
  E. KA2: country codes repeated within one project's 'Participating countries'.

Usage: python 12_verify.py [2014-2020|2021-2027]
"""
import re
import sys
import warnings
from pathlib import Path

import pandas as pd
from nazivi_stupaca import read_ka2, read_long, read_project_list

warnings.filterwarnings("ignore", message="Print area cannot be set")
PERIOD = sys.argv[1] if len(sys.argv) > 1 else "2014-2020"
BASE = Path(__file__).resolve().parent.parent
D = BASE / "Data" / PERIOD
P = BASE / "Data" / "processed"
PROJECT_LIST = next(p for p in D.glob("tablica_*.xlsx") if "popis" in p.name)
ID_START = re.compile(r"^\d{4}-\d-HR01-KA\d{3}")
LEAF_SUBTOTAL = re.compile(r"^(ukupno|subtotal)$", re.IGNORECASE)
ANY_TOTAL = re.compile(r"^(ukupno|subtotal)$|total$|sveukupno$", re.IGNORECASE)


def header(t):
    print("\n" + "=" * 100 + f"\n{t}\n" + "=" * 100)


pl = read_project_list(P / f"project_list_{PERIOD}.csv")
parsed = {(str(r.sheet), int(r.row)): r.amount_eur for r in pl.itertuples()}

# A + B -----------------------------------------------------------------------------------
header(f"A. Subtotal reconciliation in {PROJECT_LIST.name}")
mismatches, n_checked, suspicious = [], 0, []
for sheet_raw, df in pd.read_excel(PROJECT_LIST, sheet_name=None, header=None).items():
    sheet = sheet_raw.strip()
    df = df.iloc[:, :8]
    amount_col, acc, n_proj = None, 0.0, 0
    acc_hdr, n_hdr = 0.0, 0  # projects since the last section-header row
    prev_totals = []  # values of earlier subtotal-like rows in the same sector block
    prev_segment_sum = None  # sum of parsed projects before the previous subtotal-like row
    for idx, row in df.dropna(how="all").iterrows():
        c0 = re.sub(r"\s+", " ", str(row[0]).strip()) if pd.notna(row[0]) else ""
        if c0 == "Projektni broj":
            amount_col = next(c for c, h in row.items() if pd.notna(h) and "iznos" in str(h).lower())
            continue
        if c0.startswith("FINANCIRANI"):
            acc, n_proj, acc_hdr, n_hdr, prev_totals = 0.0, 0, 0.0, 0, []
            continue
        if (sheet, idx) in parsed:
            acc += parsed[(sheet, idx)]
            n_proj += 1
            acc_hdr += parsed[(sheet, idx)]
            n_hdr += 1
            continue
        if ANY_TOTAL.search(c0):
            if LEAF_SUBTOTAL.match(c0) and amount_col is not None:
                n_checked += 1
                printed = pd.to_numeric(row[amount_col], errors="coerce")
                if pd.isna(printed) or abs(printed - acc) > 0.5:
                    if printed == 0 and n_proj > 0:
                        why = f"sheet subtotal is 0 although {n_proj} parsed projects precede it"
                    elif n_proj == 0 and any(abs(printed - t) < 0.5 for t in prev_totals):
                        why = "no projects since previous total; repeats an earlier total in the block (higher-level total)"
                    elif n_proj == 0 and prev_segment_sum is not None and abs(printed - prev_segment_sum) < 0.5:
                        why = "no projects since previous total; equals the projects above the previous (0) subtotal"
                    elif abs(printed - acc_hdr) < 0.5:
                        why = (f"equals the {n_hdr} projects since the last section header -> the sheet has no "
                               f"subtotal for the section(s) before that header")
                    else:
                        why = "UNEXPLAINED"
                    mismatches.append({"sheet": sheet, "row": idx, "label": c0, "printed": printed,
                                       "sum_since_prev_total": acc, "n": n_proj, "explanation": why})
            if amount_col is not None and pd.notna(pd.to_numeric(row[amount_col], errors="coerce")):
                prev_totals.append(float(pd.to_numeric(row[amount_col], errors="coerce")))
            prev_segment_sum = acc if n_proj > 0 else prev_segment_sum
            acc, n_proj, acc_hdr, n_hdr = 0.0, 0, 0.0, 0
            continue
        if not ID_START.match(c0) and row.iloc[1:].isna().all() and c0:
            acc_hdr, n_hdr = 0.0, 0  # a section header (sub-action / deadline / key action) starts a new section
        # B: not parsed, not a total - does it look like a project row?
        if amount_col is not None and pd.notna(row.get(amount_col)) and row.iloc[1:amount_col].notna().sum() >= 2:
            suspicious.append({"sheet": sheet, "row": idx, "cells": [str(v)[:40] for v in row.dropna().tolist()]})
print(f"Leaf subtotal rows ('Ukupno'/'subtotal') checked: {n_checked}; mismatches: {len(mismatches)}; "
      f"unexplained: {sum(m['explanation'] == 'UNEXPLAINED' for m in mismatches)}")
if mismatches:
    print(pd.DataFrame(mismatches).to_string())

header("B. Unparsed rows that look like project rows (have an amount and >= 2 other cells)")
print(f"count: {len(suspicious)}")
for s in suspicious:
    print(f"  sheet {s['sheet']} r{s['row']}: {s['cells']}")

# C ---------------------------------------------------------------------------------------
header("C. IDs with a '_N' suffix")
suffixed = pl[pl["project_id"].str.contains(r"_\d+$")]
base_ids = suffixed["project_id"].str.replace(r"_\d+$", "", regex=True)
print(f"suffixed IDs: {len(suffixed)}; of which the un-suffixed ID also exists: {base_ids.isin(pl['project_id']).sum()}")
also_num = pl[~pl["project_id"].str.contains(r"_\d+$")]["num"].astype(str)
print(f"suffixed IDs whose number also occurs in another (un-suffixed) row: {suffixed['num'].astype(str).isin(also_num).sum()}")

# D ---------------------------------------------------------------------------------------
header("D. Raw non-empty cells that became NaN in the long finance / applications files")
for key, long_name in [("financijskih", "finance"), ("zaprimljenih", "applications")]:
    path = next(p for p in D.glob("tablica_*.xlsx") if key in p.name)
    raw = pd.read_excel(path, header=None)
    hdr_idx = raw.index[raw[0].astype(str).str.strip() == "Natječajna godina"][0]
    value_cols = [c for c, v in raw.loc[hdr_idx].items()
                  if pd.notna(v) and c >= 3 and str(v).strip() not in ("Stavka",)]
    body = raw.iloc[hdr_idx + 1:, :]
    cells = body[value_cols]
    non_numeric = cells.apply(lambda s: s.map(lambda v: pd.notna(v) and pd.isna(pd.to_numeric(v, errors="coerce"))))
    bad = [(i, c, raw.at[i, c]) for i in cells.index for c in value_cols if non_numeric.at[i, c]]
    print(f"{path.name}: value columns {value_cols}; non-empty but non-numeric cells: {len(bad)} -> {bad[:10]}")
    long = read_long(P / f"{long_name}_{PERIOD}_long.csv")
    n_raw_values = int(body[body[value_cols[0] - 1].notna()][value_cols].notna().sum().sum())
    print(f"  non-empty value cells in item rows (raw): {n_raw_values}; non-NaN values in long file: {long['value'].notna().sum()}")

# E ---------------------------------------------------------------------------------------
header("E. KA2: repeated country codes inside 'Participating countries'")
ka2 = read_ka2(P / f"ka2_{PERIOD}.parquet", columns=["Participating countries", "Coordinator's country"])
lists = ka2["Participating countries"].str.split(",")
rep = lists.apply(lambda l: len(l) != len(set(l)))
print(f"projects with a repeated country code: {rep.sum()} of {len(ka2)}")
if rep.any():
    print(ka2.loc[rep, "Participating countries"].head(10).to_string())
in_list = [c in l for c, l in zip(ka2["Coordinator's country"], lists)]
print(f"coordinator country not in 'Participating countries': {len(ka2) - sum(in_list)}")

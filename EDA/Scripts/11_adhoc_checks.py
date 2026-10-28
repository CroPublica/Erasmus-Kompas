"""Step 11: checks that were first run as one-off commands, collected here so that
every finding in the reports can be reproduced from Scripts/.

  1. Full title texts and project-ID formats in the project list
     (informed the parser in 05_parse_project_list.py)
  2. Example values of the multi-value KA2 fields (separators of Topics and
     Participating countries)
  3. Full row dump of the finance and applications tables (footnotes, KA column)
  4. Placeholder project summaries and cells equal to 'NA' (Namibia) in the KA2 file
  5. Postal codes that are not plain 5-digit numbers in the project list

Requires the outputs of 05 (project list) and 08 (KA2 parquet) for the period.

Usage: python 11_adhoc_checks.py [2014-2020|2021-2027]
"""
import re
import sys
import warnings
from pathlib import Path

import pandas as pd
from nazivi_stupaca import read_ka2, read_project_list

warnings.filterwarnings("ignore", message="Print area cannot be set")  # openpyxl, harmless
PERIOD = sys.argv[1] if len(sys.argv) > 1 else "2014-2020"
BASE = Path(__file__).resolve().parent.parent
D = BASE / "Data" / PERIOD
P = BASE / "Data" / "processed"
PROJECT_LIST = next(p for p in D.glob("tablica_*.xlsx") if "popis" in p.name)


def header(title):
    print("\n" + "=" * 100 + f"\n{title}\n" + "=" * 100)


# 1. Title texts and project-ID formats -------------------------------------------------------
header(f"1. Title texts and project-ID formats in {PROJECT_LIST.name}")
sheets = pd.read_excel(PROJECT_LIST, sheet_name=None, header=None)
first_col = pd.concat([df.iloc[:, 0].dropna().astype(str).str.strip().to_frame("c0").assign(sheet=name.strip())
                       for name, df in sheets.items()])
titles = first_col.loc[first_col["c0"].str.startswith("FINANCIRANI"), "c0"].str.replace(r"\s+", " ", regex=True)
print(f"Title rows: {len(titles)}; distinct sector part (text after 'PODRUČJE') -> count:")
print(titles.str.replace(r"^.*PODRUČJE\s*", "", regex=True).value_counts().to_string())
print("\nDistinct full title texts with the year replaced by YYYY -> count:")
print(titles.str.replace(r"\b20\d\d\b", "YYYY", regex=True).value_counts().to_string())
ids = first_col.loc[first_col["c0"].str.match(r"^\d{4}-\d-HR"), "c0"]
print(f"\nCells starting like a project ID: {len(ids)}; formats (digits -> 9):")
print(ids.str.replace(r"\d", "9", regex=True).value_counts().to_string())

# 2. Multi-value KA2 fields --------------------------------------------------------------------
ka2 = read_ka2(P / f"ka2_{PERIOD}.parquet")
header(f"2. KA2 {PERIOD}: example values of multi-value / categorical fields")
for c in ["Topics", "Participating countries", "Call year", "Project Status", "Is Good Practice",
          "Results Available", "Coordinator's country", "Key Action", "Programme"]:
    print(f"--- {c}: {ka2[c].dropna().sample(4, random_state=1).tolist()}")
topics = ka2["Topics"].dropna()
print(f"\nTopics cells containing ';': {topics.str.contains(';').sum()} of {len(topics)}; "
      f"containing ',': {topics.str.contains(',').sum()} (commas also occur inside topic names)")
pc = ka2["Participating countries"].dropna()
print(f"Participating countries cells matching 'XX(,XX)*': {pc.str.fullmatch(r'[A-Z]{2}(,[A-Z]{2})*').sum()} of {len(pc)}")

# 3. Full dump of finance and applications tables ----------------------------------------------
for key in ["financijskih", "zaprimljenih"]:
    path = next(p for p in D.glob("tablica_*.xlsx") if key in p.name)
    header(f"3. Full row dump of {path.name}")
    for name, raw in pd.read_excel(path, sheet_name=None, header=None).items():
        print(f"-- sheet {name!r}")
        for i, r in raw.iterrows():
            cells = [f"[{c}] " + (str(v).replace("\n", " ")[:200] if isinstance(v, str)
                                  else str(round(v, 3) if isinstance(v, float) else v))
                     for c, v in r.items() if pd.notna(v)]
            if cells:
                print(f"r{i}: " + " | ".join(cells))

# 4. Placeholder summaries and 'NA' cells in KA2 ----------------------------------------------
header(f"4. KA2 {PERIOD}: placeholder project summaries and cells equal to 'NA'")
s = ka2["Project Summary"]
print(f"Project Summary empty: {s.isna().sum()}")
short = s[s.str.len() <= 5]
print(f"Project Summary with <= 5 characters: {len(short)}")
print(short.value_counts().to_string())
na_cells = {c: int((ka2[c] == "NA").sum()) for c in ka2.columns if (ka2[c] == "NA").any()}
print(f"\nCells equal to 'NA': {sum(na_cells.values())} -> by column: {na_cells}")
country_cols = [c for c in ka2.columns if c.endswith("country")]
na_country = sum(int((ka2[c] == "NA").sum()) for c in country_cols)
print(f"...of which in country columns (coordinator + partners): {na_country}")
# Is 'NA' in a country column Namibia or a missing value? Show the same organisation's other fields.
rows = []
for c in country_cols:
    prefix = c[: -len("country")]  # "Coordinator's " or "Partner N "
    name_col = "Coordinating organisation name" if prefix.startswith("Coordinator") else prefix + "name"
    for i in ka2.index[ka2[c] == "NA"]:
        rows.append({"column": c, "name": ka2.at[i, name_col], "region": ka2.at[i, prefix + "region"],
                     "address": str(ka2.at[i, prefix + "address"])[-45:]})
if rows:
    na_df = pd.DataFrame(rows)
    print("\n'NA' country cells with the organisation's name, region and end of address:")
    print(na_df.to_string())
    print("\nRegion values for these cells:")
    print(na_df["region"].value_counts(dropna=False).to_string())

# 5. Postal codes that are not plain 5 digits ---------------------------------------------------
header(f"5. Postal codes in project_list_{PERIOD}.csv")
pl = read_project_list(P / f"project_list_{PERIOD}.csv")
col = pl["postal_code_col"]
if col.notna().any():
    print(f"'Poštanski broj' (postal_code_col): filled {col.notna().sum()} of {len(pl)}")
    bad = col[col.notna() & ~col.str.fullmatch(r"\d{5}")]
    print(f"not plain 5 digits: {len(bad)}")
    ok_without_space = bad.str.replace(r"\s+", "", regex=True).str.fullmatch(r"\d{5}")
    print(f"  of which 5 digits once whitespace is removed: {ok_without_space.sum()}")
    other = bad[~ok_without_space]
    print(f"  other values: {other.tolist()}")
    print("  most frequent:")
    print(bad.value_counts().head(10).to_string())
else:
    # 2014-2020 has no postal-code column; the code is inside the address text
    addr = pl["address"]
    found = addr.str.extract(r"(\d{2}\s?\d{3})\D*$")[0]
    print(f"No 'Poštanski broj' column in this period. Postal code parsed from address: {found.notna().sum()} of {len(pl)}")
    print(f"  written with a space (e.g. '10 000'): {found.str.contains(' ', na=False).sum()}")
    print("  addresses where no 5-digit code was found (first 15):")
    print(addr[found.isna()].head(15).to_string())

"""Step 10: column inventory for the data dictionary in the reports.

For the KA2 file: every non-partner column with non-null count, number of
distinct values and up to 3 example values; partner columns are summarised
per field. For the tablica files: the distinct column-header rows / item labels.

Usage: python 10_column_inventory.py [2014-2020|2021-2027]
"""
import sys
import warnings
from pathlib import Path

import pandas as pd
from nazivi_stupaca import read_ka2

warnings.filterwarnings("ignore", message="Print area cannot be set")
PERIOD = sys.argv[1] if len(sys.argv) > 1 else "2014-2020"
BASE = Path(__file__).resolve().parent.parent

ka2 = read_ka2(BASE / "Data" / "processed" / f"ka2_{PERIOD}.parquet")  # original (English) column names
print(f"# KA2 {PERIOD}: {ka2.shape}")
partner = ka2.columns.str.startswith("Partner ")
for c in ka2.columns[~partner]:
    s = ka2[c].dropna()
    ex = [str(v)[:70] for v in s.drop_duplicates().head(3)]
    print(f"- {c[:60]!r}: non-null {len(s)}, distinct {s.nunique()}, e.g. {ex}")
fields = pd.Series(ka2.columns[partner]).str.replace(r"Partner \d+ ", "", regex=True)
print("\nPartner fields (Partner N <field>), N range and non-null of Partner 1:")
for f in fields.unique():
    cols = [c for c in ka2.columns[partner] if c.endswith(" " + f) and c.split()[1].isdigit()]
    nums = [int(c.split()[1]) for c in cols]
    first = ka2[f"Partner 1 {f}"].dropna()
    print(f"- {f}: N={min(nums)}..{max(nums)}, Partner 1 non-null {len(first)}, e.g. "
          f"{[str(v)[:50] for v in first.drop_duplicates().head(2)]}")

print(f"\n# tablica files {PERIOD}")
for p in sorted((BASE / "Data" / PERIOD).glob("tablica_*.xlsx")):
    print(f"\n## {p.name}")
    for sheet, raw in pd.read_excel(p, sheet_name=None, header=None).items():
        raw = raw.iloc[:, :12]
        hdr = raw[raw[0].astype(str).str.strip().isin(["Projektni broj", "Natječajna godina"])]
        for row in hdr.drop_duplicates().itertuples(index=False):
            print(f"  sheet {sheet!r}: {[str(v).replace(chr(10), ' ') for v in row if pd.notna(v)]}")

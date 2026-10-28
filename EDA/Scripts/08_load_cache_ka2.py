"""Step 8: load the EU-wide Erasmus+ KA2 projects .xls of one period once, cache
it as parquet (Data/processed/ka2_<period>.parquet) and print its column inventory.

Usage: python 08_load_cache_ka2.py [2014-2020|2021-2027]
"""
import sys
import time
from pathlib import Path

import pandas as pd
from nazivi_stupaca import read_ka2

BASE = Path(__file__).resolve().parent.parent
PERIOD = sys.argv[1] if len(sys.argv) > 1 else "2014-2020"
SRC = next((BASE / "Data" / PERIOD).glob("ErasmusPlus_KA2_*.xls"))
OUT = BASE / "Data" / "processed" / f"ka2_{PERIOD}.parquet"

t0 = time.time()
# all as text (numeric conversion done later explicitly); only empty cells are missing, so that the
# country code 'NA' (Namibia) is not turned into NaN by pandas' default NA strings
df = pd.read_excel(SRC, engine="xlrd", dtype=str, keep_default_na=False, na_values=[""])
print(f"cells equal to 'NA': {(df == 'NA').sum().sum()}")
print(f"Loaded {SRC.name}: {df.shape} in {time.time() - t0:.0f}s")
df.columns = [c.strip() for c in df.columns]
df.to_parquet(OUT, index=False)  # original English headers of the EU file
print(f"Cached to {OUT}\n")

nonnull = df.notna().sum()
print(f"{len(df.columns)} columns. Columns with name + non-null count (first 30):")
for c in df.columns[:30]:
    print(f"  {c[:90]!r}: {nonnull[c]}")
print("\nRemaining columns, grouped by name with digits removed:")
pattern = pd.Series(df.columns[30:]).str.replace(r"\d+", "N", regex=True)
print(pattern.value_counts().to_string())
print("\nLast 6 column names:", list(df.columns[-6:]))

other = {"2014-2020": "2021-2027", "2021-2027": "2014-2020"}[PERIOD]
other_path = BASE / "Data" / "processed" / f"ka2_{other}.parquet"
if other_path.exists():
    other_cols = read_ka2(other_path).columns
    print(f"\nColumns only in {PERIOD}: {[c for c in df.columns if c not in other_cols]}")
    print(f"Columns only in {other}: {[c for c in other_cols if c not in df.columns]}")

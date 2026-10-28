"""Step 2: probe the '2016' sheet of tablica_1, which has ~16k non-empty columns."""
from pathlib import Path

import pandas as pd

PATH = (Path(__file__).resolve().parent.parent / "Data" / "2014-2020"
        / "tablica_1_popis_financiranih_projekata_erasmus_2014_2020_.xlsx")

raw = pd.read_excel(PATH, sheet_name="2016", header=None)
nn = raw.notna().sum()
print("Non-null count per column, first 10 columns:")
print(nn.head(10).to_string())
extra = raw.iloc[:, 5:]
print(f"\nColumns 5+: {extra.shape[1]} columns, total non-null cells: {int(extra.notna().sum().sum())}")
print("Distribution of non-null counts among columns 5+:")
print(extra.notna().sum().value_counts().sort_index().to_string())
vals = extra.stack()
print(f"\nDistinct values in columns 5+ (top 20):")
print(vals.astype(str).value_counts().head(20).to_string())
print("\nRows holding values in columns 5+ (row index -> count):")
print(extra.notna().sum(axis=1).loc[lambda s: s > 0].to_string())

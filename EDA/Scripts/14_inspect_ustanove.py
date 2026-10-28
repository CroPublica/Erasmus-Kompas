"""Step 14: inspect the structure of the registers of educational institutions in
Data/obrazovne_ustanove/ (kindergartens, primary schools, secondary schools,
higher-education institutions).

All values are read as text and only empty cells count as missing (as for the
KA2 file). For every column: fill count, number of distinct values, cells with
leading/trailing whitespace, and example values. Columns holding personal data
(names of principals/heads, e-mail, phone, fax) are reported without values.

Usage: python 14_inspect_ustanove.py
"""
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent.parent
D = BASE / "Data" / "obrazovne_ustanove"
PERSONAL = {"Ravnatelj", "Celnik", "ePosta", "ePošta", "Telefon", "Faks"}  # values not printed

for path in sorted(D.glob("*.csv")):
    df = pd.read_csv(path, dtype=str, keep_default_na=False, na_values=[""])
    print("=" * 100)
    print(f"{path.name}: {df.shape[0]} rows x {df.shape[1]} columns")
    print(f"fully duplicated rows: {df.duplicated().sum()}")
    for c in df.columns:
        s = df[c].dropna()
        ws = (s != s.str.strip()).sum()
        multi_space = s.str.contains(r"\s{2,}").sum()
        line = f"- {c!r}: filled {len(s)}/{len(df)}, distinct {s.nunique()}, leading/trailing spaces {ws}, double spaces {multi_space}"
        if c in PERSONAL:
            line += "  [personal/contact data - values not shown]"
        else:
            vc = s.str.strip().value_counts()
            line += f"\n    top values: {[(k[:50], v) for k, v in vc.head(6).items()]}"
        print(line)

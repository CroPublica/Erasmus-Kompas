"""Step 1: inspect raw structure of the tablica_*.xlsx files of one period
(argument: 2014-2020 [default] or 2021-2027).

Reads every sheet with header=None so nothing is assumed about header rows,
drops rows/columns that are completely empty (reporting how many), and prints
the first/last rows of each sheet compactly (column index -> value).

Note: sheet '2016' of tablica_1 has ~16k extra columns that only contain the
repeated text 'Rok 26.4.2016.' (see 02_probe_2016_sheet.py), so for tablica_1
only the first 5 columns are shown.
"""
import sys
from pathlib import Path

import pandas as pd

PERIOD = sys.argv[1] if len(sys.argv) > 1 else "2014-2020"  # e.g. python 01_... 2021-2027
DATA_DIR = Path(__file__).resolve().parent.parent / "Data" / PERIOD
N_HEAD, N_TAIL, MAXLEN = 12, 4, 45


def fmt_row(idx, row):
    cells = [f"[{c}] {str(v).replace(chr(10), ' ')[:MAXLEN]}" for c, v in row.items() if pd.notna(v)]
    return f"r{idx}: " + " | ".join(cells)


for path in sorted(DATA_DIR.glob("tablica_*.xlsx")):
    print("=" * 100)
    print(path.name)
    sheets = pd.read_excel(path, sheet_name=None, header=None)
    for name, raw in sheets.items():
        df = raw.dropna(how="all").dropna(axis=1, how="all")
        print("-" * 100)
        print(f"Sheet: {name!r}  raw shape: {raw.shape}  non-empty shape: {df.shape}")
        if path.name.startswith("tablica_1"):
            df = df.iloc[:, :5]
        elif df.shape[1] > 20:
            print(f"  (sheet has {df.shape[1]} non-empty columns; showing first 20)")
            df = df.iloc[:, :20]
        for idx, row in df.head(N_HEAD).iterrows():
            print(fmt_row(idx, row))
        print("...")
        for idx, row in df.tail(N_TAIL).iterrows():
            print(fmt_row(idx, row))

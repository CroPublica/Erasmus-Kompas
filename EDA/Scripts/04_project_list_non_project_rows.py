"""Step 4: list every row of the project-list workbook (tablica_1 for 2014-2020,
tablica_7 for 2021-2027) whose first column is NOT a project number, i.e.
titles, column headers, section headers, subtotals.

Usage: python 04_project_list_non_project_rows.py [2014-2020|2021-2027]
"""
import re
import sys
from pathlib import Path

import pandas as pd

PERIOD = sys.argv[1] if len(sys.argv) > 1 else "2014-2020"
DATA_DIR = Path(__file__).resolve().parent.parent / "Data" / PERIOD
PATH = next(p for p in DATA_DIR.glob("tablica_*.xlsx") if "popis" in p.name)
PROJECT_ID = re.compile(r"^\d{4}-\d-HR01-KA\d{3}")
TITLE = "FINANCIRANI PROJEKTI U OKVIRU POZIVA NA DOSTAVU PROJEKTNIH PRIJEDLOGA ZA PROGRAM ERASMUS +"

print(PATH.name)
sheets = pd.read_excel(PATH, sheet_name=None, header=None, usecols=range(5))
for name, df in sheets.items():
    df = df.dropna(how="all")
    is_proj = df[0].astype(str).str.strip().str.match(PROJECT_ID)
    print("=" * 80)
    print(f"Sheet {name!r}: {is_proj.sum()} project rows, {(~is_proj).sum()} other rows")
    for idx, row in df[~is_proj].iterrows():
        if str(row[0]).strip() == "Projektni broj":
            continue
        cells = [f"[{c}] {str(v).replace(chr(10), ' ').replace(TITLE, 'TITLE')[:110]}"
                 for c, v in row.items() if pd.notna(v)]
        print(f"  r{idx}: " + " | ".join(cells))

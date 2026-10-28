"""Step 3: peek into the large ErasmusPlus KA2 2014-2020 .xls file.

Lists sheets with their dimensions and prints the first rows of each sheet,
without assuming where the header is.
"""
import sys
import time
from pathlib import Path

import xlrd

PERIOD = sys.argv[1] if len(sys.argv) > 1 else "2014-2020"
DATA_DIR = Path(__file__).resolve().parent.parent / "Data" / PERIOD
PATH = next(DATA_DIR.glob("ErasmusPlus_KA2_*.xls"))
N_ROWS, MAXLEN = 8, 60

t0 = time.time()
book = xlrd.open_workbook(PATH, on_demand=True)
print(f"Opened {PATH.name} in {time.time() - t0:.1f}s")
print(f"Sheets: {book.sheet_names()}")
for name in book.sheet_names():
    sh = book.sheet_by_name(name)
    print("-" * 100)
    print(f"Sheet {name!r}: {sh.nrows} rows x {sh.ncols} cols")
    for r in range(min(N_ROWS, sh.nrows)):
        cells = [f"[{c}] {str(v).replace(chr(10), ' ')[:MAXLEN]}"
                 for c, v in enumerate(sh.row_values(r)) if v not in ("", None)]
        print(f"r{r}: " + " | ".join(cells))
    book.unload_sheet(name)
print(f"Total time {time.time() - t0:.1f}s")

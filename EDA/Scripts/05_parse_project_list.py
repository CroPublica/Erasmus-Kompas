"""Step 5: parse the list of funded projects into a tidy table.

  2014-2020: tablica_1_popis_financiranih_projekata_...xlsx
  2021-2027: tablica_7_popis-financiranih-projekata-...xlsx

Each year sheet consists of blocks (one per sector), each starting with a
title row 'FINANCIRANI PROJEKTI ... ZA PODRUČJE <SECTOR>', followed by a column
header row ('Projektni broj', ...). Inside a block there are section header
rows ('Ključna aktivnost ...', sub-action names, 'Rok ...'), project rows and
subtotal rows ('Ukupno', 'subtotal', '... total').

Only rows whose first cell starts with a Croatian project number
(YYYY-R-HR01-KAxxx...) are kept as projects. Columns are mapped by the header
names, because the column layout differs between years (2021-2027 adds
'Mjesto' and 'Poštanski broj'; 'Rok' only exists in some years). Only the
first 8 columns are used (sheet '2016' of tablica_1 has thousands of junk
columns, see 02_probe_2016_sheet.py).

The key action (KA1/KA2/KA3) is derived from the KA code in the project ID,
because section headers are not present for every block in 2021-2027.

Usage: python 05_parse_project_list.py [2014-2020|2021-2027]
Output: Data/processed/project_list_<period>.csv
"""
import re
import sys
import warnings
from datetime import datetime
from pathlib import Path

import pandas as pd
from nazivi_stupaca import CSV_ENCODING, PROJECT_LIST_HR

warnings.filterwarnings("ignore", message="Print area cannot be set")  # openpyxl, harmless
PERIOD = sys.argv[1] if len(sys.argv) > 1 else "2014-2020"
BASE = Path(__file__).resolve().parent.parent
PATH = next(p for p in (BASE / "Data" / PERIOD).glob("tablica_*.xlsx") if "popis" in p.name)
OUT = BASE / "Data" / "processed" / f"project_list_{PERIOD}.csv"

# hyphen before the number is optional: 4 IDs in 2024 lack it (e.g. ...-KA210-ADU000280988); flagged as id_malformed
ID_RE = re.compile(r"^(?P<call_year>\d{4})-(?P<round>\d)-HR01-(?P<ka_code>KA\d{3})(?:-(?P<field>[A-Z]+))?(?P<sep>-?)(?P<num>\d+)(?:_\d+)?$")
SECTORS = {  # keyword in title -> sector name as used in the financial / application tables
    "OPĆEG": "Odgoj i opće obrazovanje",  # 'OPĆEG ODGOJA' (2014-20) / 'ODGOJA I OPĆEG' (2021-27)
    "STRUKOVNOG": "Strukovno obrazovanje i osposobljavanje",
    "VISOKOG": "Visoko obrazovanje",
    "ODRASLIH": "Obrazovanje odraslih",
    "MLADIH": "Mladi",
    "SPORT": "Sport",
}
HEADER_FIELDS = {  # substring of header (lowercase) -> output field
    "naziv": "beneficiary", "adresa": "address", "mjesto": "city", "poštanski": "postal_code",
    "rok": "deadline", "iznos": "amount",
}
SUBTOTAL_RE = re.compile(r"^(ukupno|subtotal)$|total$|sveukupno$", re.IGNORECASE)
DEADLINE_ROW_RE = re.compile(r"^(\d\.\s*)?rok\b", re.IGNORECASE)  # 'Rok 2.2.2016.', 'Rok (1)', '2. rok', 'Rok, 8. ...'


def sector_from_title(text):
    for key, name in SECTORS.items():
        if key in text.upper():
            return name
    raise ValueError(f"Unknown sector in title: {text}")


def parse_deadline(v):
    if isinstance(v, (datetime, pd.Timestamp)):
        return pd.Timestamp(v).normalize()
    return pd.to_datetime(re.sub(r"\s+", "", str(v)).rstrip("."), format="%d.%m.%Y", errors="coerce")


def parse_amount(v):
    """Numbers pass through; text like '180.147,00 EUR' (Croatian format) is converted."""
    if isinstance(v, (int, float)):
        return float(v)
    txt = re.sub(r"[^\d,.]", "", str(v)).replace(".", "").replace(",", ".")
    return pd.to_numeric(txt, errors="coerce")


def clean(v):
    return str(v).strip() if pd.notna(v) else None


records, skipped, headers_seen, titles = [], [], set(), {}
sheets = pd.read_excel(PATH, sheet_name=None, header=None)
for sheet_raw, df in sheets.items():
    sheet = sheet_raw.strip()
    df = df.iloc[:, :8]
    sector = key_action = sub_action = None
    colmap = {}
    for idx, row in df.dropna(how="all").iterrows():
        c0 = str(row[0]).strip() if pd.notna(row[0]) else ""
        c0_flat = re.sub(r"\s+", " ", c0)
        m = ID_RE.match(c0)
        if c0.startswith("FINANCIRANI PROJEKTI"):
            sector, key_action, sub_action = sector_from_title(c0_flat), None, None
            title_key = re.sub(r"^.*PODRUČJE\s*", "", c0_flat)
            titles[title_key] = sector
        elif c0 == "Projektni broj":
            colmap = {}
            for ci, h in row.items():
                for key, field in HEADER_FIELDS.items():
                    if pd.notna(h) and key in str(h).lower():
                        colmap[field] = ci
            headers_seen.add(tuple(clean(h) for h in row.dropna()))
        elif m:
            raw_amount = row[colmap["amount"]]
            raw_deadline = row[colmap["deadline"]] if "deadline" in colmap else None
            records.append({
                "sheet": sheet, "row": idx, "sector": sector,
                "key_action_header": key_action, "sub_action_header": sub_action,
                "project_id": c0, **m.groupdict(),
                "beneficiary": clean(row[colmap["beneficiary"]]),
                "address": clean(row[colmap["address"]]),
                "city_col": clean(row[colmap["city"]]) if "city" in colmap else None,
                "postal_code_col": clean(row[colmap["postal_code"]]) if "postal_code" in colmap else None,
                "deadline_raw": raw_deadline,
                "deadline": parse_deadline(raw_deadline) if pd.notna(raw_deadline) else pd.NaT,
                "amount_raw": raw_amount,
                "amount_eur": parse_amount(raw_amount) if pd.notna(raw_amount) else None,
            })
        elif c0_flat.startswith("Ključna aktivnost"):
            key_action, sub_action = c0_flat, None
        elif c0.startswith("Datum ažuriranja") or SUBTOTAL_RE.search(c0) or DEADLINE_ROW_RE.match(c0) \
                or str(row[1]).strip().startswith("Rok") or c0 == "":
            skipped.append((sheet, idx, c0_flat[:60] or str(row[1])))
        elif row.iloc[1:].isna().all():
            sub_action = c0_flat  # e.g. 'Razmjene mladih', 'Mala partnerstva (KA210)'
        else:
            skipped.append((sheet, idx, c0_flat[:60]))
            print(f"UNCLASSIFIED row kept out: sheet {sheet} r{idx}: {row.dropna().tolist()}")

proj = pd.DataFrame(records)
proj["call_year"] = proj["call_year"].astype(int)
proj["round"] = proj["round"].astype(int)
proj["key_action"] = proj["ka_code"].str[:3]  # KA1 / KA2 / KA3
proj["id_malformed"] = proj.pop("sep").eq("")
OUT.parent.mkdir(parents=True, exist_ok=True)
proj.drop(columns=["deadline_raw", "amount_raw"]).rename(columns=PROJECT_LIST_HR) \
    .to_csv(OUT, index=False, encoding=CSV_ENCODING)  # Croatian headers, see nazivi_stupaca.py

print(f"File: {PATH.name}")
print("Distinct column header rows seen:")
for h in sorted(headers_seen):
    print("  ", h)
print("\nTitle (text after 'PODRUČJE') -> sector:")
for t, sec in titles.items():
    print(f"   {t!r} -> {sec}")
print(f"\nProject rows parsed: {len(proj)}")
print(f"Non-project rows skipped: {len(skipped)}")
print(f"\nSheet vs call year from ID (rows where they differ): {(proj['sheet'].astype(int) != proj['call_year']).sum()}")
print("\nProject ID formats (digits -> 9):")
print(proj["project_id"].str.replace(r"\d", "9", regex=True).value_counts().to_string())
print(f"\nMalformed IDs (no hyphen before number): {proj['id_malformed'].sum()}")
print(proj.loc[proj["id_malformed"], ["sheet", "row", "project_id"]].to_string())
print("\nNull counts:")
print(proj.isna().sum().to_string())
print("\nKey action from header vs from KA code (rows with a header):")
hdr_ka = proj["key_action_header"].str.extract(r"Ključna aktivnost (\d)")[0].map(lambda k: f"KA{k}", na_action="ignore")
print(pd.crosstab(hdr_ka.fillna("no header"), proj["key_action"]).to_string())
print("\nRows with missing address:")
print(proj[proj["address"].isna()][["sheet", "row", "sector", "project_id", "beneficiary"]].to_string())
print("\nRows with non-numeric / missing amount:")
print(proj[proj["amount_eur"].isna()][["sheet", "row", "project_id", "beneficiary", "amount_raw"]].to_string())
print("\nUnparsed deadline values (raw value -> count), only where a deadline column exists:")
print(proj.loc[proj["deadline"].isna() & proj["deadline_raw"].notna(), "deadline_raw"].astype(str).value_counts().to_string())
dup = proj[proj.duplicated("project_id", keep=False)].sort_values("project_id")
print(f"\nDuplicated project_id rows: {len(dup)}")
print(dup[["sheet", "row", "sector", "sub_action_header", "project_id", "beneficiary", "amount_eur"]].to_string())
print("\nText amounts converted:")
txt = proj[proj["amount_raw"].apply(lambda v: isinstance(v, str))]
print(txt[["sheet", "row", "project_id", "amount_raw", "amount_eur"]].to_string())
print(f"\nSaved to {OUT}")

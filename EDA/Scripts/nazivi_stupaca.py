"""Croatian column names for the processed datasets in Data/processed/
(project lists, finance and applications tables). The KA2 parquet files keep the
original English headers of the EU source file.

The scripts work with short internal (English) names; the processed files are
written with the Croatian names defined here and translated back when read.
Where the source tables have a Croatian header, the same wording is used.

  write: df.rename(columns=PROJECT_LIST_HR)          read: read_project_list(path)
         df.rename(columns=LONG_HR)                         read_long(path)
         (KA2: no renaming)                                 read_ka2(path)
"""
import pandas as pd

CSV_ENCODING = "utf-8-sig"  # BOM so that Excel shows č, ć, š, ž, đ correctly

# project_list_<period>.csv and project_list_<period>_enriched.csv
PROJECT_LIST_HR = {
    "sheet": "List",
    "row": "Redak",
    "sector": "Sektor",
    "key_action_header": "Zaglavlje ključne aktivnosti",
    "sub_action_header": "Zaglavlje podaktivnosti",
    "project_id": "Projektni broj",
    "call_year": "Natječajna godina",
    "round": "Krug natječaja",
    "ka_code": "Šifra ključne aktivnosti",
    "field": "Šifra područja",
    "num": "Redni broj projekta",
    "beneficiary": "Naziv korisnika",
    "address": "Adresa korisnika",
    "city_col": "Mjesto",
    "postal_code_col": "Poštanski broj",
    "deadline": "Rok",
    "amount_eur": "Iznos (EUR)",
    "key_action": "Ključna aktivnost",
    "id_malformed": "Neispravan projektni broj",
    # added in the _enriched file
    "beneficiary_norm": "Naziv korisnika (normaliziran)",
    "postal_code": "Poštanski broj (očišćen)",
    "city": "Mjesto (očišćeno)",
}

# finance_<period>_long.csv and applications_<period>_long.csv
LONG_HR = {
    "year": "Natječajna godina",
    "ka": "Ključna aktivnost",
    "item": "Stavka",
    "item_raw": "Stavka (izvorno)",
    "sector": "Sektor",
    "value": "Vrijednost",
}

def _inverse(mapping):
    return {v: k for k, v in mapping.items()}


def read_project_list(path, **kw):
    """Read a project_list CSV (Croatian headers) and return it with internal names."""
    df = pd.read_csv(path, encoding=CSV_ENCODING, dtype={"Poštanski broj": str, "Poštanski broj (očišćen)": str,
                            "Redni broj projekta": str},  # keep leading zeros (000015035)
                     parse_dates=["Rok"], **kw)
    return df.rename(columns=_inverse(PROJECT_LIST_HR))


def read_long(path):
    return pd.read_csv(path, encoding=CSV_ENCODING, dtype={"Natječajna godina": str}).rename(columns=_inverse(LONG_HR))


def read_ka2(path, columns=None):
    """ka2_<period>.parquet keeps the original English headers of the EU file (no renaming)."""
    return pd.read_parquet(path, columns=columns)

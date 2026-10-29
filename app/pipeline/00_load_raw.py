"""Step 00: load the raw files into DuckDB staging tables (stg_*), unchanged except for the notes below.

Everything is read as text (all_varchar) so nothing is silently converted; empty cells are NULL, but the text 'NA'
(Namibia) is kept. Cleaning and typing happen in later steps.

Deliberately NOT loaded (privacy, BUILD_PLAN §4.12): principals'/deans' names, phone and fax numbers, and e-mail
addresses from the registries. Organisational e-mails are added later by a filtered step that re-reads the raw files.
KA1 participant tables (tablica 6) are not loaded: the site covers KA2 only.

Known gaps in the raw CSVs (the .xlsx versions are fuller; the EDA parsed those):
  * tablica_7 CSV has call years 2024-2026 only (1,856 rows); the .xlsx has 2021-2026 (3,081 rows).
  * tablica_1 CSV has 2,058 rows; the .xlsx parse gave 2,061 (2016 differs by 3).
National lists are reconciliation-only (BUILD_PLAN §4.7), so grants come from the EU KA2 export and this does not block.
The KA2 CSVs have 621 columns (up to 100 partners); the .xls the EDA used stopped at 38 partners.

Usage: python pipeline/00_load_raw.py
"""
from pathlib import Path
import json
import time
from datetime import datetime, timezone

from common import DB_PATH, RAW_DIR, connect, find_raw, sha256

# (table, glob relative to RAW_DIR, reader options)
EU = dict(delim=",", header=True)
NA = dict(delim=";", header=True)
GRID_SEMI = dict(delim=";", header=False, null_padding=True, parallel=False)    # report-style tables, interpreted later
GRID_COMMA = dict(delim=",", header=False, null_padding=True, parallel=False)
REG = dict(delim=",", header=True)

SOURCES = [
    ("stg_ka2_2014_2020", "2014-2020/ErasmusPlus_KA2_2014-2020_*Projects_Overview*.csv", EU),
    ("stg_ka2_2021_2027", "ErasmusPlus_KA2_2021-2027_*Projects_Overview*.csv", EU),
    ("stg_na_projects_2014_2020", "2014-2020/tablica_1_*csv.csv", NA),
    ("stg_na_projects_2021_2027", "tablica_7_*.csv", NA),
    ("stg_finance_2014_2020", "2014-2020/tablica_2_*csv.csv", GRID_SEMI),
    ("stg_applications_2014_2020", "2014-2020/tablica_3_*.csv", GRID_COMMA),
    ("stg_finance_2021_2027", "tablica_8_*.csv", GRID_SEMI),
    ("stg_applications_2021_2027", "tablica_9_*.csv", GRID_SEMI),
    ("stg_oid_orgs_2014_2020", "2014-2020/tablica_4_*.csv", NA),
    ("stg_county_counts_2014_2020", "2014-2020/tablica_5_*.csv", NA),
]

# registries: only these columns are kept (no persons, phones, faxes, e-mails)
REGISTRIES = [
    ("stg_registry_kindergarten", "Dječji vrtići.csv", "Dječji vrtić",
     ["Naziv", "Adresa", "Mjesto", "Zupanija", "PostanskiBroj"]),
    ("stg_registry_primary", "Osnovne škole.csv", "Osnovna škola",
     ["Naziv", "Adresa", "Mjesto", "Šifra", "Osnivač", "Župnija", "TipUstanove", "PoštanskiBroj", "Web"]),
    ("stg_registry_secondary", "Srednje škole.csv", "Srednja škola",
     ["Naziv", "Adresa", "Mjesto", "Šifra", "Osnivač", "Županija", "TipUstanove", "PoštanskiBroj", "Web"]),
    ("stg_registry_higher", "Ustanove iz sustava visokog obrazovanja.csv", "Visoko učilište",
     ["mbu", "Adresa", "Mjesto", "Upisnik", "NazivUstanove", "VrstaUstanove", "NadredjenaUstanova", "URL"]),
]


def opts(o: dict) -> str:
    parts = ["all_varchar=true", "nullstr=''", "max_line_size=20000000", "strict_mode=false", "sample_size=-1"]
    for k, v in o.items():
        parts.append(f"{k}={str(v).lower() if isinstance(v, bool) else repr(v)}")
    return ", ".join(parts)


def main():
    t0 = time.time()
    con = connect()
    con.execute("create table if not exists meta_load(table_name varchar, source_file varchar, sha256 varchar, "
                "rows bigint, columns integer, loaded_at varchar)")
    con.execute("delete from meta_load")
    print(f"raw folder: {RAW_DIR}\ndatabase:   {DB_PATH}\n")
    log = []

    def record(table, path, note=""):
        rows, cols = con.execute(f'select count(*), (select count(*) from information_schema.columns '
                                 f"where table_name = '{table}') from \"{table}\"").fetchone()
        con.execute("insert into meta_load values (?,?,?,?,?,?)",
                    [table, path.name, sha256(path), rows, cols, datetime.now(timezone.utc).isoformat(timespec="seconds")])
        print(f"  {table:32s} {rows:>8,} rows x {cols:>3} cols   {path.name[:60]}{note}")
        log.append(table)

    for table, pattern, o in SOURCES:
        path = find_raw(pattern)
        con.execute(f'create or replace table "{table}" as select * from read_csv(\'{path}\', {opts(o)})')
        record(table, path)

    for table, name, register, cols in REGISTRIES:
        path = find_raw(name)
        select = ", ".join(f'"{c}"' for c in cols)
        con.execute(f'create or replace table "{table}" as select \'{register}\' as register, {select} '
                    f"from read_csv('{path}', {opts(REG)})")
        record(table, path, "  (personal and contact columns not loaded)")

    # optional hand-filled rows for projects missing from the tablica 1 CSV (data/review/tablica1_supplement.csv)
    sup = Path(__file__).resolve().parent.parent / "data" / "review" / "tablica1_supplement.csv"
    if sup.exists():
        n = con.execute(f"""insert into stg_na_projects_2014_2020 select
              {", ".join(f'cast(s."{c}" as varchar)' for c in [x[0] for x in con.execute("describe stg_na_projects_2014_2020").fetchall()])}
            from read_csv('{sup}', all_varchar=true, header=true) s
            where trim(coalesce(s."Projektni broj", '')) <> ''
              and trim(s."Projektni broj") not in (select trim("Projektni broj") from stg_na_projects_2014_2020)""").fetchone()[0]
        print(f"\ntablica 1 supplement: {n} row(s) added from {sup.name}")

    # sanity: the 250-column KA2 files must keep their full width and the NA (Namibia) country code
    for t in ("stg_ka2_2014_2020", "stg_ka2_2021_2027"):
        n = con.execute(f'select count(*) from information_schema.columns where table_name = \'{t}\'').fetchone()[0]
        assert n >= 249, f"{t} has {n} columns, expected 249 or 250"
    na = con.execute('select count(*) from stg_ka2_2021_2027 where "Coordinator\'s country" = \'NA\'').fetchone()[0]
    print(f"\ncheck: coordinator country 'NA' (Namibia) kept as text in 2021-2027: {na} row(s)")
    con.close()
    print(f"\n{len(log)} tables loaded in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()

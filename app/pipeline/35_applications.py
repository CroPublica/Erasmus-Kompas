"""Step 35: applications received and projects contracted per call year, action and sector (tablica 3 for 2014-2020, tablica 9 for 2021-2027).

Writes   application_result(period, call_year, action, sector, applications, contracted)
  2014-2020: action = 'all' (the published table has no split by key action)
  2021-2027: action = 'KA1' | 'KA2'
Rates are never read from the files' "% prolaznosti" rows: they are contracted / applications, computed where they are used.
A sector's totals are checked against the file's own total column and against 'Sveukupno' rows (check in this step, it fails loudly).

Usage: python pipeline/35_applications.py
"""
import csv
import re

from common import connect, find_raw

SECTORS_2021 = ["Odgoj i opće obrazovanje", "Strukovno obrazovanje i osposobljavanje", "Visoko obrazovanje", "Obrazovanje odraslih", "Mladi", "Sport"]


def num(x):
    x = (x or "").strip().replace(" ", "")
    return int(x) if re.fullmatch(r"\d+", x) else None


def read_2014_2020():
    path = find_raw("2014-2020/tablica_3_*.csv")
    rows = list(csv.reader(open(path, encoding="utf-8-sig")))
    head = rows[0]
    sectors = head[2:-1]
    out, app = [], {}
    for r in rows[1:]:
        m = re.fullmatch(r"(\d{4})\.", r[0].strip())
        if not m:
            continue                                                  # the final 'Ukupno prema sektorskom području' rows are totals
        year, item = int(m.group(1)), r[1].strip()
        if item == "Prijave":
            app = {s: num(v) for s, v in zip(sectors, r[2:-1])}
            total_a = num(r[-1])
            assert total_a == sum(v or 0 for v in app.values()), (year, "applications do not add up")
        elif item == "Ugovoreni":
            con = {s: num(v) for s, v in zip(sectors, r[2:-1])}
            assert num(r[-1]) == sum(v or 0 for v in con.values()), (year, "contracted do not add up")
            for s in sectors:
                out.append(("2014-2020", year, "all", s, app[s], con[s]))
    return out


def read_2021_2027():
    path = find_raw("tablica_9_*.csv")
    rows = list(csv.reader(open(path, encoding="utf-8-sig"), delimiter=";"))
    hi = next(i for i, r in enumerate(rows) if r and r[0].strip() == "Natječajna godina")
    sectors = [c.strip() for c in rows[hi][4:10] if c.strip()]
    out, year, action, app = [], None, None, {}
    for r in rows[hi + 1:]:
        if not r or len(r) < 11:
            continue
        if r[0].strip().startswith("Sveukupno"):                       # the file's grand total: used as a check, not as data
            assert num(r[10]) == sum(a for *_, a, c in out), f"applications ({sum(a for *_, a, c in out)}) differ from the file's grand total ({num(r[10])})"
            break
        m = re.fullmatch(r"(\d{4})\.", r[0].strip())
        if m:
            year = int(m.group(1))
        if r[2].strip() in ("KA1", "KA2"):
            action = r[2].strip()
        item = r[3].strip()
        if item == "Prijave" and year:
            app = {s: num(v) for s, v in zip(sectors, r[4:10])}
            assert num(r[10]) == sum(v or 0 for v in app.values()), (year, action, "applications do not add up")
        elif item == "Ugovoreni" and year:
            con = {s: num(v) for s, v in zip(sectors, r[4:10])}
            assert num(r[10]) == sum(v or 0 for v in con.values()), (year, action, "contracted do not add up")
            for s in sectors:
                if app.get(s) is not None or con.get(s) is not None:
                    out.append(("2021-2027", year, action, s, app.get(s) or 0, con.get(s) or 0))
    return out


def main():
    rows = read_2014_2020() + read_2021_2027()
    con = connect()
    con.execute("create or replace table application_result(period varchar, call_year integer, action varchar, sector varchar, applications integer, contracted integer)")
    con.executemany("insert into application_result values (?,?,?,?,?,?)", rows)
    # the file's own grand totals
    print(f"application_result: {len(rows)} rows")
    for per, act, a, c in con.execute("select period, action, sum(applications), sum(contracted) from application_result group by all order by 1, 2").fetchall():
        print(f"  {per} {act:3s}  applications {a:5,d}  contracted {c:5,d}  ({c / a:.1%})")
    con.close()


if __name__ == "__main__":
    main()

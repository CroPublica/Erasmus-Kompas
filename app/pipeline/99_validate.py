"""Step 99: regression checks from BUILD_PLAN §4. Run after any rebuild.

Each check is PASS, FAIL, or NOT BUILT (the table it needs does not exist yet). Exit code 1 if anything FAILS;
with --strict, NOT BUILT also counts as a failure. Checks marked [staging] only need the staging steps (00, 05); the others need the
resolved tables from later steps and show NOT BUILT until those exist.

Usage: python pipeline/99_validate.py [--strict]
"""
import sys

from common import DB_PATH, connect, find_col, table_exists

PASS, FAIL, NOT_BUILT = "PASS", "FAIL", "NOT BUILT"


def hr_projects(con):
    """[staging] KA2 projects with a Croatian participant / coordinator, per period, straight from the EU exports."""
    out = {}
    for period, t in (("2014-2020", "stg_ka2_2014_2020"), ("2021-2027", "stg_ka2_2021_2027")):
        part = find_col(con, t, "Participating countries")
        coord = find_col(con, t, "Coordinator's country")
        n, c = con.execute(
            f'select count(*) filter (where list_contains(string_split(replace("{part}", \' \', \'\'), \',\'), \'HR\')), '
            f'count(*) filter (where "{coord}" = \'HR\') from "{t}"').fetchone()
        out[period] = (n, c)
    return out


def check_1(con):
    got = hr_projects(con)
    total = sum(n for n, _ in got.values())
    coordinated = sum(c for _, c in got.values())
    detail = ", ".join(f"{p}: {n:,} / {c}" for p, (n, c) in got.items())
    ok = (total, coordinated) == (3830, 606)
    return (PASS if ok else FAIL), f"{total:,} projects with a Croatian participant, {coordinated} coordinated (want 3,830 / 606); {detail}"


def check_5(con):
    """[staging] National list KA2 grants (tablica 7 CSV, call years 2024-2026) equal the EU-export grants."""
    grant = find_col(con, "stg_ka2_2021_2027", "EU Grant")
    row = con.execute(f"""
        with na as (
          select replace(regexp_replace(trim("Projektni broj"), '_[0-9]+$', ''), '-', '') k,
                 try_cast(replace(replace(replace("Iznos odobrenih bespovratnih sredstava", ' EUR', ''), '.', ''), ',', '.') as double) amt
          from stg_na_projects_2021_2027
          where regexp_extract("Projektni broj", '-(KA[0-9])', 1) = 'KA2'),   -- key action from the project CODE (§4.4)
        eu as (select replace(trim("Project Identifier"), '-', '') k, try_cast("{grant}" as double) g from stg_ka2_2021_2027)
        select (select count(*) from na), count(*), count(*) filter (where abs(na.amt - eu.g) < 0.5)
        from na join eu using (k)""").fetchone()
    in_na, matched, same = row
    ok = matched == 139 and same == 139
    return (PASS if ok else FAIL), (f"{in_na} KA2 rows in tablica 7 (2024-2026), {matched} found in the EU export, "
                                    f"{same} with identical grant (want 139 of 139)")


def needs(*tables):
    def deco(fn):
        def run(con):
            missing = [t for t in tables if not table_exists(con, t)]
            if missing:
                return NOT_BUILT, f"needs {', '.join(missing)}"
            return fn(con)
        return run
    return deco


def org_projects(con, where):
    """(distinct projects, distinct projects as coordinator, organisations) for organisations matching a SQL condition."""
    return con.execute(f"""select count(distinct p.project_id), count(distinct p.project_id) filter (where p.role = 'coordinator'),
        count(distinct o.org_id) from participation p join organisation o using (org_id) where {where}""").fetchone()


@needs("organisation", "participation")
def check_2(con):
    n, c, k = org_projects(con, "o.name ilike '%gimnazija metkovi%'")
    return (PASS if (n, c, k) == (22, 1, 1) else FAIL), f"{n} projects, {c} coordinated, {k} organisation record(s) (want 22 / 1 / 1)"


@needs("organisation", "participation")
def check_3(con):
    n, c, k = org_projects(con, "o.org_id = 'OID-E10205911'")        # Sveučilište u Dubrovniku (tablica 4 OID)
    return (PASS if (n, c) == (34, 6) else FAIL), f"{n} projects, {c} coordinated, name variants merged into one organisation (want 34 / 6)"


@needs("organisation", "participation", "place")
def check_4(con):
    n, c, k = org_projects(con, "o.county = 'Dubrovačko-neretvanska'")
    grants = con.execute("""select sum(g) from (select distinct p.project_id, p.project_grant_eur g from participation p
        join organisation o using (org_id) where o.county = 'Dubrovačko-neretvanska' and p.role = 'coordinator')""").fetchone()[0] or 0
    ok = (n, c) == (150, 17) and round(grants / 1e6, 2) == 3.72
    return (PASS if ok else FAIL), (f"{n} projects involved, {c} coordinated, grants coordinated EUR {grants:,.0f}, {k} organisations "
                                    f"(want 150 / 17 / 3.72M; screenshot shows 33 organisations)")


COUNTY_TOLERANCE = 3   # "within a few per county" (BUILD_PLAN §4): at most this many projects apart


@needs("place", "county", "stg_na_projects_2014_2020")
def check_6(con):
    """Tablica 1 projects placed in counties by postcode, against the county counts printed in tablica 5."""
    rows = con.execute("""
        with mine as (
          select p.county, count(*) n from stg_na_projects_2014_2020 s
          join place p on p.postcode = regexp_replace(s."Poštanski broj", '\\s', '', 'g') group by 1)
        select c.stem, c.projects_2014_2020_tablica5, coalesce(m.n, 0), coalesce(m.n, 0) - c.projects_2014_2020_tablica5
        from county c left join mine m on m.county = c.stem""").fetchall()
    total_t5 = sum(r[1] for r in rows)
    total_mine = sum(r[2] for r in rows)
    off = sorted((r for r in rows if abs(r[3]) > COUNTY_TOLERANCE), key=lambda r: r[3])
    detail = (f"{total_mine:,} projects placed vs {total_t5:,} in tablica 5 (shortfall {total_t5 - total_mine}); "
              f"{len(rows) - len(off)} of {len(rows)} counties within {COUNTY_TOLERANCE}")
    if off:
        detail += "; off: " + ", ".join(f"{r[0]} {r[3]:+d}" for r in off)
    return (FAIL if off else PASS), detail


def check_7(con):
    """[staging] Croatian organisation appearances in the EU KA2 exports: 4,389, as counted in the EDA."""
    if not table_exists(con, "stg_hr_appearance"):
        return NOT_BUILT, "needs stg_hr_appearance (step 05)"
    got = dict(((p, r), n) for p, r, n in con.execute(
        "select period, role, count(*) from stg_hr_appearance group by all").fetchall())
    want = {("2014-2020", "coordinator"): 252, ("2014-2020", "partner"): 2053,
            ("2021-2027", "coordinator"): 354, ("2021-2027", "partner"): 1730}
    return (PASS if got == want else FAIL), f"{sum(got.values()):,} appearances; {got} (want {want})"


CHECKS = [
    ("1  HR projects: 3,830 involved, 606 coordinated   [staging]", check_1),
    ("2  Gimnazija Metković: 22 projects, 1 coordinated", check_2),
    ("3  Sveučilište u Dubrovniku: 34 projects", check_3),
    ("4  Dubrovačko-neretvanska: 150 / 17 / EUR 3.72M", check_4),
    ("5  Tablica 7 KA2 grants = EU export: 139 of 139   [staging]", check_5),
    ("6  Tablica 1 by postcode ~ tablica 5 county counts", check_6),
    ("7  HR appearances in KA2: 4,389 (252+2,053, 354+1,730)   [staging]", check_7),
]


def main():
    strict = "--strict" in sys.argv
    if not DB_PATH.exists():
        print(f"{DB_PATH} not found; run pipeline/00_load_raw.py first")
        return 1
    con = connect(read_only=True)
    results = []
    for name, fn in CHECKS:
        status, detail = fn(con)
        results.append(status)
        print(f"[{status:9s}] {name}\n             {detail}")
    n = {s: results.count(s) for s in (PASS, FAIL, NOT_BUILT)}
    print(f"\n{n[PASS]} passed, {n[FAIL]} failed, {n[NOT_BUILT]} not built yet")
    return 1 if n[FAIL] or (strict and n[NOT_BUILT]) else 0


if __name__ == "__main__":
    sys.exit(main())

"""Step 05: one row per Croatian organisation appearance in the EU KA2 exports (coordinator or partner).

Unpivots the coordinator columns and the 100 partner slots of both KA2 staging tables and keeps rows whose country is HR.
Raw values only (names, addresses and regions are cleaned in later steps). Output table: stg_hr_appearance.

The KA2 CSVs hold up to 100 partners per project; the .xls used in the earlier EDA stopped at 38. The step prints
how many appearances sit in slots above 38, so the effect of that difference is visible.

Usage: python pipeline/05_hr_appearances.py
"""
from common import connect, find_col

PERIODS = [("2014-2020", "stg_ka2_2014_2020"), ("2021-2027", "stg_ka2_2021_2027")]
N_PARTNERS = 100


def main():
    con = connect()
    parts = []
    for period, t in PERIODS:
        pid, year, action = "Project Identifier", "Call year", "Action Type"
        grant = find_col(con, t, "EU Grant")
        parts.append(f"""select '{period}' as period, "{pid}" as project_id, "{year}" as call_year, "{action}" as action_type,
            try_cast("{grant}" as double) as project_grant_eur, 'coordinator' as role, 0 as slot,
            "Coordinating organisation name" as org_name, "Coordinating organisation type" as org_type,
            "Coordinator's address" as address, "Coordinator's region" as region, "Coordinator's country" as country
            from "{t}" where "Coordinator's country" = 'HR'""")
        for i in range(1, N_PARTNERS + 1):
            parts.append(f"""select '{period}', "{pid}", "{year}", "{action}", try_cast("{grant}" as double), 'partner', {i},
                "Partner {i} name", "Partner {i} organisation type", "Partner {i} address", "Partner {i} region", "Partner {i} country"
                from "{t}" where "Partner {i} country" = 'HR'""")
    con.execute("create or replace table stg_hr_appearance as " + " union all ".join(parts))
    con.execute("update stg_hr_appearance set org_name = trim(org_name), address = trim(address)")

    print("appearances by period and role:")
    for r in con.execute("select period, role, count(*), count(distinct project_id), "
                         "count(*) filter (where slot > 38) from stg_hr_appearance group by all order by 1, 2").fetchall():
        print(f"  {r[0]}  {r[1]:11s} {r[2]:>6,} appearances in {r[3]:>6,} projects   (in partner slots above 38: {r[4]})")
    total = con.execute("select count(*) from stg_hr_appearance").fetchone()[0]
    nameless = con.execute("select count(*) from stg_hr_appearance where org_name is null or org_name = ''").fetchone()[0]
    print(f"total {total:,}; without a name: {nameless}")
    con.close()


if __name__ == "__main__":
    main()

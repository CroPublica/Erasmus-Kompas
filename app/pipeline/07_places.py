"""Step 07: postcode -> town and county, by majority vote across sources (BUILD_PLAN §4.3).

County comes from sources that state a county together with a postcode:
  * the kindergarten, primary and secondary school registers,
  * tablica 4 (unique beneficiary organisations 2014-2020, field 'Region').
It never comes from the free-text region fields of the KA2 exports (they hold errors and NUTS-2 regions).
Postcodes with no direct vote get the county of their town when that town maps to exactly one county.
Postcodes seen only in the national lists or KA2 addresses are kept (town only) so that gaps are visible.

Tables written:
  county  one row per county (21): stem, label, tablica 5 project count
  place   one row per postcode: town, county, county_basis (postcode_vote | town_vote | none), votes, conflict, county_alt

Usage: python pipeline/07_places.py
"""
from common import APP_DIR, connect

DATA_DIR = APP_DIR / "data"
REVIEW_DIR = DATA_DIR / "review"

def main():
    con = connect()
    # normalised county stem: 'Splitsko-dalmatinska županija' -> 'Splitsko-dalmatinska'; 'Grad Zagreb županija' -> 'Grad Zagreb'
    con.execute("""create or replace macro county_stem(x) as
        case when x is null or trim(x) = '' then null
             when lower(trim(x)) like 'grad zagreb%' then 'Grad Zagreb'
             else regexp_replace(regexp_replace(trim(x), '\\s+', ' ', 'g'), '\\s*[Žž]upanija$', '') end""")
    con.execute("""create or replace macro postcode5(x) as
        case when regexp_replace(coalesce(x, ''), '\\s', '', 'g') ~ '^[0-9]{5}$' then regexp_replace(x, '\\s', '', 'g') end""")
    con.execute("""create or replace macro title_case(x) as
        array_to_string(list_transform(string_split(lower(x), ' '), lambda w: upper(w[1:1]) || w[2:]), ' ')""")
    con.execute("""create or replace macro town_key(x) as
        lower(trim(regexp_replace(regexp_replace(coalesce(x, ''), '\\s+', ' ', 'g'), '^Grad ', '')))""")

    # ---- votes: (postcode, town, county, source)
    con.execute("""create or replace temp table votes as
        select postcode5("PostanskiBroj") pc, trim(Mjesto) town, county_stem(Zupanija) county, 'registry_kindergarten' src from stg_registry_kindergarten
        union all select postcode5("PoštanskiBroj"), trim(Mjesto), county_stem("Župnija"), 'registry_primary' from stg_registry_primary
        union all select postcode5("PoštanskiBroj"), trim(Mjesto), county_stem("Županija"), 'registry_secondary' from stg_registry_secondary
        union all select postcode5("PostalCode"), trim("City"), county_stem("Region"), 'tablica_4' from stg_oid_orgs_2014_2020 where "Organisation OID" is not null""")
    con.execute("delete from votes where pc is null or county is null")

    # county list, validated against tablica 5
    con.execute("""create or replace table county as
        select county_stem("Naziv županije") as stem,
               case when county_stem("Naziv županije") = 'Grad Zagreb' then 'Grad Zagreb' else county_stem("Naziv županije") || ' županija' end as label,
               try_cast(replace("Broj_Erasmus+ projekata_2014.-2020.", '.', '') as integer) as projects_2014_2020_tablica5
        from stg_county_counts_2014_2020 where "Naziv županije" <> 'Ukupno'""")
    unknown = con.execute("select distinct county from votes where county not in (select stem from county)").fetchall()
    assert not unknown, f"county values not in tablica 5: {unknown}"

    # ---- majority vote per postcode
    con.execute("""create or replace temp table pc_county as
        select pc, county, count(*) votes from votes group by all""")
    con.execute("""create or replace temp table pc_best as
        select pc, arg_max(county, votes) county, max(votes) votes, sum(votes) total_votes,
               count(*) n_counties, string_agg(county, ', ' order by votes desc) filter (where true) all_counties
        from pc_county group by pc""")
    # postcode universe: every postcode seen anywhere
    con.execute("""create or replace temp table pc_all as
        select postcode5("Poštanski broj") pc, trim("Grad") town, 'na_2014_2020' src from stg_na_projects_2014_2020
        union all select postcode5("Poštanski broj"), trim("Mjesto"), 'na_2021_2027' from stg_na_projects_2021_2027
        union all select pc, town, 'registry_or_tablica4' from votes
        union all select regexp_extract(address, '(?:^|[^0-9])([0-9]{2} ?[0-9]{3})(?:[^0-9]|$)', 1), regexp_extract(address, '[0-9]{2} ?[0-9]{3},? *(.*)$', 1), 'ka2_address' from stg_hr_appearance""")
    con.execute("update pc_all set pc = postcode5(pc)")
    con.execute("delete from pc_all where pc is null")
    # town per postcode: registries / tablica 4 first, then national lists, then KA2 addresses; ALL CAPS -> Title Case
    con.execute("""create or replace temp table pc_town as
        select pc, case when town = upper(town) then title_case(town) else town end town from (
          select pc, town, row_number() over (partition by pc order by prio, n desc) rk from (
            select pc, town, count(*) n, min(case src when 'registry_or_tablica4' then 1 when 'ka2_address' then 3 else 2 end) prio
            from pc_all where town is not null and trim(town) <> '' group by pc, town)) where rk = 1""")
    # town -> county where unambiguous (from direct votes)
    con.execute("""create or replace temp table town_county as
        select town_key(v.town) tk, any_value(b.county) county from votes v join pc_best b using (pc)
        where v.town is not null group by 1 having count(distinct b.county) = 1""")

    con.execute("""create or replace table place as
        select a.pc as postcode,
               t.town,
               coalesce(b.county, tc.county) as county,
               case when b.county is not null then 'postcode_vote' when tc.county is not null then 'town_vote' else 'none' end as county_basis,
               coalesce(b.votes, 0) as votes,
               coalesce(b.n_counties, 0) > 1 as conflict,
               case when b.n_counties > 1 then b.all_counties end as county_alt
        from (select distinct pc from pc_all) a
        left join pc_best b using (pc) left join pc_town t using (pc)
        left join town_county tc on tc.tk = town_key(t.town)""")

    # ---- stored human decisions: data/review/place_overrides.csv (postcode,county,reason); regenerated conflicts list for review
    overrides = REVIEW_DIR / "place_overrides.csv"
    if overrides.exists():
        con.execute(f"""create or replace temp table ov as select postcode, county_stem(county) county from read_csv('{overrides}', header=true, all_varchar=true)""")
        bad = con.execute("select county from ov where county not in (select stem from county)").fetchall()
        assert not bad, f"place_overrides.csv: unknown county {bad}"
        con.execute("""update place set county = ov.county, county_basis = 'review_override'
                       from ov where place.postcode = ov.postcode""")
        print(f"applied {con.execute('select count(*) from ov').fetchone()[0]} place override(s)")
    con.execute(f"copy (select postcode, town, county, county_alt, votes from place where conflict order by postcode) "
                f"to '{DATA_DIR / 'place_conflicts.csv'}' (header, delimiter ',')")

    # ---- report
    n, direct, town, none, conf = con.execute("""select count(*), count(*) filter (where county_basis='postcode_vote'),
        count(*) filter (where county_basis='town_vote'), count(*) filter (where county_basis='none'), count(*) filter (where conflict) from place""").fetchone()
    print(f"postcodes: {n:,}  county from postcode vote {direct:,}, from town {town:,}, unresolved {none:,}; with conflicting votes {conf}")
    for label, query in [
        ("KA2 HR appearances (postcode parsed from address)", """select count(*), count(p.postcode) filter (where p.county is not null) from
            (select regexp_replace(regexp_extract(address, '(?:^|[^0-9])([0-9]{2} ?[0-9]{3})(?:[^0-9]|$)', 1), ' ', '') pc from stg_hr_appearance) a left join place p on p.postcode = a.pc"""),
        ("national list 2014-2020 rows", """select count(*), count(p.postcode) filter (where p.county is not null) from stg_na_projects_2014_2020 s left join place p on p.postcode = postcode5(s."Poštanski broj")"""),
        ("national list 2021-2027 rows", """select count(*), count(p.postcode) filter (where p.county is not null) from stg_na_projects_2021_2027 s left join place p on p.postcode = postcode5(s."Poštanski broj")""")]:
        total, placed = con.execute(query).fetchone()
        print(f"  {label:52s} {placed:>6,} of {total:>6,} placed in a county ({placed / total:.1%})")
    print("conflicting postcodes:", con.execute("select postcode, town, county, county_alt from place where conflict order by votes desc limit 8").fetchall())
    print("top unresolved postcodes:", con.execute("""select p.postcode, p.town, count(*) n from place p join
        (select regexp_replace(regexp_extract(address, '(?:^|[^0-9])([0-9]{2} ?[0-9]{3})(?:[^0-9]|$)', 1), ' ', '') pc from stg_hr_appearance) a on a.pc = p.postcode
        where p.county is null group by all order by n desc limit 8""").fetchall())
    con.close()


if __name__ == "__main__":
    main()

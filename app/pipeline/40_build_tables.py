"""Step 40: final tables and views for the site (BUILD_PLAN §5).

Tables
  project          one row per KA2 project with a Croatian participant (3,830): title, action family, management, grant, status,
                   good-practice flag, summary, raw topic list
  project_topic    project x current topic (old 2014-2020 topics are translated through topic_map; source says which vocabulary)
Views
  v_org_ka2        per organisation and period: projects, coordinated, partner-only, grants coordinated, value of projects involved in
  v_county_ka2     per county and period: organisations, projects involved, coordinated, the three money measures (BUILD_PLAN §4.2)
  v_coverage       per county and school type: institutions, participating, rate, Wilson 95% interval, expected from the national rate
  v_hr_participation  national totals per period

Money (BUILD_PLAN §4.2): three named measures, never mixed.
  grants_coordinated_eur   sum of full grants of projects coordinated from here (each project once)
  value_involved_eur       sum of full grants of projects with a participant from here (each project once; never add across places)
  participations           organisation-project pairs, no money

Usage: python pipeline/40_build_tables.py
"""
from common import connect, find_col


def main():
    con = connect()

    # ---- project
    pieces = []
    for period, t in (("2014-2020", "stg_ka2_2014_2020"), ("2021-2027", "stg_ka2_2021_2027")):
        grant = find_col(con, t, "EU Grant")
        pieces.append(f"""select '{period}' period, "Project Identifier" project_id, try_cast("Call year" as integer) call_year,
            "Action Type" action_type, "Project Title" title, "Project Summary" summary, "Project Status" status,
            try_cast("{grant}" as double) grant_eur, ("Is Good Practice" = 'Yes') good_practice,
            ("Results Available" = 'Yes') results_available, "Topics" topics_raw, "Participating countries" countries
            from "{t}" """)
    con.execute(f"""create or replace table project as
        select p.*, a.family, a.field, a.scale, coalesce(a.grant_not_comparable, false) grant_not_comparable,
               case when regexp_matches(p.project_id, '^[0-9]{{4}}-[0-9]-[A-Z]{{2}}[0-9]{{2}}-KA') then 'national agency'
                    else 'central (EU level)' end management,
               (select count(*) > 0 from participation x where x.project_id = p.project_id and x.role = 'coordinator') hr_coordinated,
               array_length(string_split(p.countries, ',')) n_countries
        from ({' union all '.join(pieces)}) p
        left join action_map a on a.period = p.period and a.action_type = p.action_type
        where p.project_id in (select project_id from participation)""")

    # ---- project_topic
    con.execute("""create or replace table project_topic as
        with raw as (select project_id, period, trim(t) old_or_new from project, unnest(string_split(topics_raw, ';')) u(t)
                     where topics_raw is not null and trim(t) <> '')
        select project_id, topic.topic topic, 'listed (2021-2027)' source from raw join topic on topic.topic = raw.old_or_new
               where raw.period = '2021-2027'
        union all
        select project_id, m.new_topic, 'translated from 2014-2020' from raw join topic_map m on m.old_topic = raw.old_or_new
               where raw.period = '2014-2020'""")
    con.execute("""create or replace table project_topic as select distinct * from project_topic""")

    # ---- views
    con.execute("""create or replace view v_participation as
        select distinct p.org_id, o.name org_name, o.county, p.project_id, p.period, p.role, pr.grant_eur, pr.call_year
        from participation p join organisation o using (org_id) join project pr using (project_id)""")

    con.execute("""create or replace view v_org_ka2 as
        with base as (select org_id, org_name, county, project_id, period, grant_eur, call_year,
                             bool_or(role = 'coordinator') over (partition by org_id, project_id) as coordinated
                      from v_participation),
        one as (select distinct org_id, org_name, county, project_id, period, grant_eur, call_year, coordinated from base)
        select org_id, org_name, county, period, count(*) projects, count(*) filter (where coordinated) coordinated,
               count(*) filter (where not coordinated) partner_only,
               sum(grant_eur) filter (where coordinated) grants_coordinated_eur, sum(grant_eur) value_involved_eur,
               min(call_year) first_year, max(call_year) last_year
        from (select * from one union all select org_id, org_name, county, project_id, 'all', grant_eur, call_year, coordinated from one)
        group by all""")

    con.execute("""create or replace view v_county_ka2 as
        with pc as (select distinct county, project_id, period, grant_eur, org_id,
                           bool_or(role = 'coordinator') over (partition by county, project_id) coordinated_here
                    from v_participation where county is not null),
        pc_all as (select * from pc union all select county, project_id, 'all', grant_eur, org_id, coordinated_here from pc),
        proj as (select distinct county, project_id, period, grant_eur, coordinated_here from pc_all)
        select county, period,
               (select count(distinct org_id) from pc_all x where x.county = proj.county and x.period = proj.period) organisations,
               count(*) projects_involved, count(*) filter (where coordinated_here) projects_coordinated,
               sum(grant_eur) filter (where coordinated_here) grants_coordinated_eur,
               sum(grant_eur) value_involved_eur,
               (select count(distinct (org_id, project_id)) from pc_all x where x.county = proj.county and x.period = proj.period) participations
        from proj group by county, period""")

    con.execute("""create or replace view v_hr_participation as
        select period, count(*) projects, count(*) filter (where hr_coordinated) coordinated, sum(grant_eur) value_involved_eur,
               count(*) filter (where management = 'central (EU level)') central_projects
        from (select * from project union all select * replace ('all' as period) from project) group by period""")

    # coverage: school-type groups; programme providers and dual-listed schools handled as in BUILD_PLAN §4.11
    con.execute("""create or replace view v_coverage as
        with inst as (
          select county, case register_kind when 'primary' then 'primary' when 'secondary' then 'secondary'
                              when 'primary,secondary' then 'primary+secondary school' end school_type,
                 (org_id is not null) participates
          from institution where register_kind in ('primary', 'secondary', 'primary,secondary') and county is not null),
        by_type as (select school_type, count(*) n, count(*) filter (where participates) k from inst group by 1),
        county_type as (select county, school_type, count(*) n, count(*) filter (where participates) k from inst group by all)
        select c.county, c.school_type, c.n institutions, c.k participating, c.k * 1.0 / c.n rate,
               -- Wilson 95% interval
               (c.k + 1.9208) / (c.n + 3.8416) - 1.96 * sqrt(c.k * 1.0 / c.n * (1 - c.k * 1.0 / c.n) / c.n + 0.9604 / (c.n * c.n)) / (1 + 3.8416 / c.n) rate_low,
               (c.k + 1.9208) / (c.n + 3.8416) + 1.96 * sqrt(c.k * 1.0 / c.n * (1 - c.k * 1.0 / c.n) / c.n + 0.9604 / (c.n * c.n)) / (1 + 3.8416 / c.n) rate_high,
               c.n * t.k * 1.0 / t.n expected, t.k * 1.0 / t.n national_rate
        from county_type c join by_type t using (school_type)""")

    # coverage by period and role (the coverage page's filters): counts only, rates and intervals are computed by the site
    con.execute("""create or replace table coverage_scenario as
        with inst as (
          select i.inst_id, i.org_id, i.county, case i.register_kind when 'primary,secondary' then 'combined' else i.register_kind end school_type
          from institution i where i.register_kind in ('primary', 'secondary', 'primary,secondary', 'kindergarten') and i.county is not null),
        scen as (select * from (values ('all', 'any'), ('2014-2020', 'any'), ('2021-2027', 'any'),
                                       ('all', 'coordinator'), ('2014-2020', 'coordinator'), ('2021-2027', 'coordinator')) v(period, role))
        select s.period, s.role, i.county, i.school_type, count(*) institutions,
               count(*) filter (where exists (select 1 from participation x where x.org_id = i.org_id
                   and (s.period = 'all' or x.period = s.period) and (s.role = 'any' or x.role = s.role))) participating
        from inst i cross join scen s group by all""")

    # ---- report
    n = con.execute("select count(*), count(*) filter (where hr_coordinated) from project").fetchone()
    print(f"project: {n[0]:,} rows, {n[1]} coordinated from Croatia")
    for r in con.execute("select management, count(*) from project group by 1").fetchall():
        print(f"  management: {r[0]:20s} {r[1]:,}")
    no_topic = con.execute("select count(*) from project where project_id not in (select project_id from project_topic)").fetchone()[0]
    no_raw = con.execute("select count(*) from project where topics_raw is null").fetchone()[0]
    print(f"project_topic: {con.execute('select count(*) from project_topic').fetchone()[0]:,} rows; projects without a current topic: "
          f"{no_topic} ({no_raw} have no topic at all in the source)")
    print("projects without an action family:", con.execute("select count(*) from project where family is null").fetchone()[0])
    sch = con.execute("select sum(institutions), sum(participating) from v_coverage").fetchone()
    print(f"school coverage: {sch[1]:,.0f} of {sch[0]:,.0f} institution rows participate")
    con.close()


if __name__ == "__main__":
    main()

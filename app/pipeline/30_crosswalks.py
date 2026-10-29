"""Step 30: vocabularies and crosswalks (BUILD_PLAN Phase 0b).

Tables written
  topic            the current (2021-2027) topic list, 76 values; Croatian labels are filled in later (label_hr empty)
  topic_map        every 2014-2020 topic -> one or more current topics, with confidence and review status
                   (identical names map to themselves; the rest come from data/review/topic_crosswalk.csv)
  org_class_map    EU organisation type (free text, 40+ values) -> a small class used by the site
  action_map       KA2 action type (2014-2020 and 2021-2027 names) -> family, field, scale, and the money caveat

The step fails if a topic, organisation type or action type used by a Croatian project is not covered, so a new export
with new values cannot slip through unnoticed.

Usage: python pipeline/30_crosswalks.py
"""
import csv
import re

from common import APP_DIR, connect

REVIEW = APP_DIR / "data" / "review" / "topic_crosswalk.csv"

# ---- organisation type -> class (first matching rule wins)
ORG_RULES = [
    ("higher_education", r"^Higher education institution|Associations of Higher Education|tertiary level"),
    ("school_preprimary", r"pre-primary"),
    ("school_primary", r"primary level"),
    ("school_secondary_general", r"General education \(secondary"),
    ("school_vocational", r"Vocational Training \(secondary"),
    ("adult_education", r"Adult education"),
    ("school_other", r"Film School|^School/Institute"),
    ("ngo", r"(?i)non-governmental|civil society|european ngo|foundation|youth organisation|national youth council|association|social enterprise|non-profit"),
    ("sme_business", r"Small and medium|Large enterprise|Multimedia|Television"),
    ("public_body", r"public body|Public body|Public service|European grouping|Accreditation"),
    ("research", r"Research Institute"),
    ("social_partner", r"Social partner"),
    ("culture", r"cultural|Cultural|Art association"),
    ("sport", r"sport|Sport"),
    ("counselling", r"Counselling"),
    ("other", r"^Other"),
]

# ---- action type -> (family, field, scale)
ACTION_RULES = [
    (r"School Exchange Partnerships", "school_exchange", "school", "small"),          # each school gets its own grant
    (r"Strategic Partnerships for adult", "cooperation", "adult", "standard"),
    (r"Strategic Partnerships for (school|Schools)", "cooperation", "school", "standard"),
    (r"Strategic Partnerships for vocational", "cooperation", "vet", "standard"),
    (r"Strategic Partnerships for youth", "cooperation", "youth", "standard"),
    (r"Strategic Partnerships for higher", "cooperation", "higher_education", "standard"),
    (r"Strategic Partnerships addressing more than one", "cooperation", "multi", "standard"),
    (r"Digital Education Readiness|Partnerships for Creativity", "cooperation", "school", "standard"),
    (r"Small-scale partnerships\s+in school", "small_scale", "school", "small"),
    (r"Small-scale partnerships\s+in youth", "small_scale", "youth", "small"),
    (r"Small-scale partnerships\s+in adult", "small_scale", "adult", "small"),
    (r"Small-scale partnerships\s+in vocational", "small_scale", "vet", "small"),
    (r"Cooperation [Pp]artnerships in school", "cooperation", "school", "standard"),
    (r"Cooperation [Pp]artnerships in youth|Cooperation Partnerships in the field of Youth", "cooperation", "youth", "standard"),
    (r"Cooperation [Pp]artnerships in higher", "cooperation", "higher_education", "standard"),
    (r"Cooperation [Pp]artnerships in vocational", "cooperation", "vet", "standard"),
    (r"Cooperation [Pp]artnerships in adult", "cooperation", "adult", "standard"),
    (r"Cooperation Partnerships in the field of Education and Training", "cooperation", "multi", "standard"),
    (r"Capacity Building (for youth|in the field of Youth)", "capacity_building", "youth", "large"),
    (r"Capacity Building in higher", "capacity_building", "higher_education", "large"),
    (r"Capacity Building in Vocational", "capacity_building", "vet", "large"),
    (r"Knowledge Alliances|Sector Skills Alliances|Alliances for", "alliance", "multi", "large"),
    (r"European Universities", "university_network", "higher_education", "large"),
    (r"Erasmus Mundus", "joint_degree", "higher_education", "large"),
    (r"Teacher Academies", "teacher_academy", "school", "large"),
    (r"Centers of Vocational Excellence", "vet_excellence", "vet", "large"),
    (r"Forward-Looking", "policy_experimentation", "multi", "large"),
]


def main():
    con = connect()

    # ---- topics
    new_topics = [r[0] for r in con.execute("""select distinct trim(x) from (select unnest(string_split("Topics", ';')) x
        from stg_ka2_2021_2027 where "Topics" is not null) where trim(x) <> '' order by 1""").fetchall()]
    old_topics = [r[0] for r in con.execute("""select distinct trim(x) from (select unnest(string_split("Topics", ';')) x
        from stg_ka2_2014_2020 where "Topics" is not null) where trim(x) <> '' order by 1""").fetchall()]
    con.execute("create or replace table topic(topic varchar, label_en varchar, label_hr varchar)")
    con.executemany("insert into topic values (?,?,?)", [(t, t, None) for t in new_topics])

    pairs = {}
    for o in old_topics:
        if o in new_topics:
            pairs[(o, o)] = ("high", "true", "identical name in both vocabularies")
    with open(REVIEW, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            assert r["new_topic"] in new_topics, f"topic_crosswalk.csv: unknown current topic {r['new_topic']!r}"
            assert r["old_topic"] in old_topics, f"topic_crosswalk.csv: unknown old topic {r['old_topic']!r}"
            pairs[(r["old_topic"], r["new_topic"])] = (r["confidence"], r["reviewed"], r["note"])
    unmapped = [o for o in old_topics if not any(k[0] == o for k in pairs)]
    assert not unmapped, f"2014-2020 topics without a mapping: {unmapped}"
    con.execute("create or replace table topic_map(old_topic varchar, new_topic varchar, confidence varchar, reviewed boolean, note varchar)")
    con.executemany("insert into topic_map values (?,?,?,?,?)", [(o, n, c, rv == "true", note) for (o, n), (c, rv, note) in pairs.items()])

    # ---- organisation classes
    types = [r[0] for r in con.execute("select distinct org_type from stg_hr_appearance where org_type is not null").fetchall()]
    rows, unknown = [], []
    for t in types:
        hit = next((cls for cls, rx in ORG_RULES if re.search(rx, t)), None)
        (rows if hit else unknown).append((t, hit) if hit else t)
    assert not unknown, f"organisation types without a class: {unknown}"
    con.execute("create or replace table org_class_map(eu_org_type varchar, org_class varchar)")
    con.executemany("insert into org_class_map values (?,?)", rows)

    # ---- action types
    actions = con.execute("select distinct period, action_type from stg_hr_appearance").fetchall()
    out, unknown = [], []
    for period, a in actions:
        hit = next(((fam, field, scale) for rx, fam, field, scale in ACTION_RULES if re.search(rx, a or "")), None)
        if hit:
            out.append((period, a, *hit, hit[0] == "school_exchange"))
        else:
            unknown.append(a)
    assert not unknown, f"action types without a family: {unknown}"
    con.execute("create or replace table action_map(period varchar, action_type varchar, family varchar, field varchar, scale varchar, "
                "grant_not_comparable boolean)")
    con.executemany("insert into action_map values (?,?,?,?,?,?)", out)

    n_ident = sum(1 for k in pairs if k[0] == k[1])
    print(f"topics: {len(new_topics)} current, {len(old_topics)} old ({n_ident} identical names, "
          f"{len(pairs) - n_ident} proposed mappings, none reviewed by a person)")
    print(f"organisation types: {len(types)} -> classes {sorted({c for _, c in rows})}")
    print(f"action types: {len(actions)} (period, name) pairs -> families {sorted({o[2] for o in out})}")
    low = con.execute("select count(*) from topic_map where confidence = 'low'").fetchone()[0]
    print(f"low-confidence topic mappings: {low}")
    con.close()


if __name__ == "__main__":
    main()

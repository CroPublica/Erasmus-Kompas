"""Step 10: resolve Croatian organisation mentions in KA2 projects to organisations (BUILD_PLAN §4.5, §4.6).

Reads   stg_hr_appearance (step 05), place (step 07), the registries and tablica 4 (step 00)
Writes  institution    one row per registry entry (coverage denominators; schools listed twice are one row)
        organisation   one row per resolved organisation that appears in a KA2 project
        org_alias      every spelling/address seen for an organisation, with counts
        participation  one row per appearance, linked to an organisation (link_method, score)
        data/review_queue.csv   uncertain pairs for a human (generated each run, not committed)

Identity (BUILD_PLAN §4.6): OID-<oid> (tablica 4) > MZO-<school code> / MBU-<higher-ed number> (registries) >
H-<hash of normalised name + postcode>. An organisation found in both tablica 4 and a registry keeps the OID id and
records the registry key.

Matching a mention to an organisation, in order (never on the name alone, §4.5):
  1 exact normalised name + postcode          4 fuzzy name within the SAME postcode: >= AUTO accepted, >= REVIEW queued
  2 exact normalised name + place             5 stored alias (data/review/org_aliases.csv)
  3 same, after removing the place from the name
Faculties/departments/academies are never merged with a university automatically (they go to the queue), and two
sub-units whose names differ (score < 99) are treated as different organisations.

Human decisions, read on every run:
  data/review/org_aliases.csv    alias,target      alias = a name as written; target = org id (OID-/MZO-/MBU-/H-) or a name+postcode
                                                    in the form 'normalised name|postcode'; maps the alias to that organisation
  data/review/org_oids.csv       org_id,eu_oid,...  EU organisation IDs found by hand for organisations that tablica 4 does not list (column eu_oid)
  data/review/org_decisions.csv  mention_key,org_id,decision,note     decision = merge | separate; mention_key = 'normalised name|postcode'

Usage: python pipeline/10_orgs_resolve.py
"""
import csv
import hashlib
import re
from collections import Counter, defaultdict

from rapidfuzz import fuzz

from common import APP_DIR, connect
from names import display_name, he_canon, with_university, norm_name, norm_place, parse_address, strip_place

AUTO, REVIEW = 95, 88          # fuzzy thresholds (token_sort_ratio on normalised names)
REVIEW_DIR = APP_DIR / "data" / "review"
SUBUNIT = re.compile(r"\b(fakultet|akademija|odjel|odsjek|institut)\b")   # higher-education sub-units
SHORT_PROGRAMME = re.compile(r"^(program|kraci program|udruga|drustvo|talijanski djecji)\b")  # not real kindergartens


def short_hash(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:10]


def read_csv_rows(path):
    if not path.exists():
        return []
    with open(path, encoding="utf-8", newline="") as f:
        return [r for r in csv.DictReader(f) if r and any(r.values())]


def is_subunit(n):
    return bool(n) and bool(SUBUNIT.search(n))


class Org:
    __slots__ = ("id", "name", "norm", "postcode", "place", "kind", "oid", "registry_key", "anchored", "mentions")

    def __init__(self, id, name, postcode, place, kind=None, oid=None, registry_key=None, anchored=False):
        self.id, self.name, self.postcode, self.place = id, name, postcode, place
        self.norm, self.kind, self.oid, self.registry_key, self.anchored = norm_name(name), kind, oid, registry_key, anchored
        self.mentions = Counter()


def main():
    con = connect()
    place_county = dict(con.execute("select postcode, county from place").fetchall())

    # ---------------------------------------------------------------- registry institutions
    inst = {}    # id -> dict
    for table, kind, code_col, pc_col, county_col in [
            ("stg_registry_kindergarten", "kindergarten", None, "PostanskiBroj", "Zupanija"),
            ("stg_registry_primary", "primary", "Šifra", "PoštanskiBroj", "Župnija"),
            ("stg_registry_secondary", "secondary", "Šifra", "PoštanskiBroj", "Županija")]:
        cols = [r[0] for r in con.execute(f'describe "{table}"').fetchall()]
        for rec in con.execute(f'select * from "{table}"').fetchall():
            d = dict(zip(cols, rec))
            code = d.get(code_col) if code_col else None
            pc = (d.get(pc_col) or "").replace(" ", "") or None
            nid = f"MZO-{code}" if code else f"KG-{short_hash(str(norm_name(d['Naziv'])) + '|' + str(pc))}"
            if nid in inst:                              # school listed in both the primary and the secondary register
                inst[nid]["kinds"].add(kind)
                continue
            inst[nid] = dict(id=nid, name=display_name(" ".join(d["Naziv"].split())), kinds={kind}, postcode=pc, place=d.get("Mjesto"),
                             county=place_county.get(pc), school_code=code, mbu=None, founder=d.get("Osnivač"),
                             parent=None, itype=d.get("TipUstanove"))
    for rec in con.execute('select mbu, NazivUstanove, Mjesto, VrstaUstanove, NadredjenaUstanova from stg_registry_higher').fetchall():
        mbu, name, town, vt, parent = rec
        inst[f"MBU-{mbu}"] = dict(id=f"MBU-{mbu}", name=display_name(" ".join(name.split())), kinds={"higher_education"}, postcode=None,
                                  place=town and town.title(), county=None, school_code=None, mbu=mbu, founder=None,
                                  parent=parent, itype=vt)

    # ---------------------------------------------------------------- organisations: anchors
    orgs = {}                      # id -> Org
    by_name_pc = defaultdict(list)    # (norm, postcode) -> [org id]
    by_name_place = defaultdict(list)
    by_pc = defaultdict(list)         # postcode -> [org id]

    def register(o: Org):
        orgs[o.id] = o
        if o.norm and o.postcode:
            by_name_pc[(o.norm, o.postcode)].append(o.id)
            by_pc[o.postcode].append(o.id)
        if o.norm and o.place:
            by_name_place[(o.norm, norm_place(o.place))].append(o.id)

    # tablica 4 first: OID anchors (2014-2020 national beneficiaries)
    for oid, name, typ, city, pc in con.execute(
            'select "Organisation OID", "Organisation Name", "Organisation Type (prj)", "City", "PostalCode" '
            'from stg_oid_orgs_2014_2020 where "Organisation OID" is not null').fetchall():
        register(Org(f"OID-{oid}", " ".join(name.split()), (pc or "").replace(" ", "") or None, city, kind=typ, oid=oid, anchored=True))
    # registry anchors; an OID organisation with the same name + postcode takes the registry key instead of a new org
    for i in inst.values():
        n = norm_name(i["name"])
        hit = by_name_pc.get((n, i["postcode"])) if i["postcode"] else None
        if hit and len(hit) == 1:
            orgs[hit[0]].registry_key = i["id"]
            orgs[hit[0]].name = i["name"]    # registry spelling (with diacritics) beats the EU export's
            i["org_id"] = hit[0]
        else:
            o = Org(i["id"], i["name"], i["postcode"], i["place"], kind=",".join(sorted(i["kinds"])),
                    registry_key=i["id"], anchored=True)
            register(o)
            i["org_id"] = o.id
    # higher-education registry entries have no postcode, so name+postcode never links them. Link them by name + town instead:
    # an MBU entry whose key matches exactly one other organisation (e.g. one known from tablica 4) is that organisation's registry
    # entry; otherwise it stays an organisation of its own. Mentions are matched against the same key below (method 6).
    he_index = defaultdict(list)                                 # (he_canon, town) -> [org id]
    for oid_, o in orgs.items():
        k = he_canon(o.name, o.place) if o.place else None
        if k and not oid_.startswith("MBU-"):
            he_index[(k, norm_place(o.place))].append(oid_)
    he_unified = []
    for oid_ in [i for i in orgs if i.startswith("MBU-")]:
        o = orgs[oid_]
        k = he_canon(o.name, o.place) if o.place else None
        hits = he_index.get((k, norm_place(o.place))) if k else None
        if hits and len(set(hits)) == 1:
            twin = orgs[hits[0]]
            twin.registry_key = oid_
            twin.name = o.name
            he_unified.append((oid_, o.name, twin.id))
            by_name_place[(o.norm, norm_place(o.place))].remove(oid_)
            for i in inst.values():
                if i["id"] == oid_:
                    i["org_id"] = twin.id
            del orgs[oid_]
        elif k:
            he_index[(k, norm_place(o.place))].append(oid_)
    n_anchor = len(orgs)

    # ---------------------------------------------------------------- human input
    aliases = {}
    for r in read_csv_rows(REVIEW_DIR / "org_aliases.csv"):
        aliases[norm_name(r["alias"])] = r["target"].strip()
    decisions = {(r["mention_key"], r["org_id"]): r["decision"] for r in read_csv_rows(REVIEW_DIR / "org_decisions.csv")}
    forced = {k: o for (k, o), d in decisions.items() if d == "merge"}
    barred = {(k, o) for (k, o), d in decisions.items() if d == "separate"}

    # ---------------------------------------------------------------- mentions
    cols = ["period", "project_id", "call_year", "action_type", "project_grant_eur", "role", "slot", "org_name",
            "org_type", "address", "region"]
    apps = [dict(zip(cols, r)) for r in con.execute(f"select {', '.join(cols)} from stg_hr_appearance").fetchall()]
    mentions = defaultdict(list)   # key -> appearance indices
    for i, a in enumerate(apps):
        a["postcode"], a["place_raw"] = parse_address(a["address"])
        a["norm"] = norm_name(a["org_name"])
        a["place"] = norm_place(a["place_raw"])
        mentions[(a["norm"], a["postcode"])].append(i)

    queue = []                     # review rows
    resolved = {}                  # mention key -> (org id, method, score)

    def candidates_same_postcode(norm, pc, place):
        pool = by_pc.get(pc, []) if pc else []
        if not pool and place:
            pool = [oid for (n, pl), ids in by_name_place.items() if pl == place for oid in ids]
        return pool

    for key in sorted(mentions, key=lambda k: -len(mentions[k])):     # most common spelling first
        norm, pc = key
        idxs = mentions[key]
        sample = apps[idxs[0]]
        place = sample["place"]
        mkey = f"{norm}|{pc or ''}"
        target = None

        if mkey in forced and forced[mkey] in orgs:
            target = (forced[mkey], "decision", 100)
        elif norm in aliases and (aliases[norm] in orgs or aliases[norm].count("|")):
            t = aliases[norm]
            if t not in orgs:                                         # 'normalised name|postcode' form
                n2, _, pc2 = t.partition("|")
                ids = by_name_pc.get((n2, pc2)) or []
                t = ids[0] if len(ids) == 1 else None
            if t:
                target = (t, "alias", 100)
        if target is None and norm:
            for method, hits in (("1 name+postcode", by_name_pc.get((norm, pc)) if pc else None),
                                 ("2 name+place", by_name_place.get((norm, place)) if place else None)):
                if hits and len(set(hits)) == 1 and (mkey, hits[0]) not in barred:
                    target = (hits[0], method, 100)
                    break
            if target is None and place:
                stripped = strip_place(norm, place)
                if stripped:
                    for method, hits in (("3 name-without-place+postcode", by_name_pc.get((stripped, pc)) if pc else None),
                                         ("3 name-without-place+place", by_name_place.get((stripped, place)))):
                        if hits and len(set(hits)) == 1 and (mkey, hits[0]) not in barred:
                            target = (hits[0], method, 100)
                            break
        if target is None and norm and place and (mkey, "he") not in barred:      # 6: higher-education name + town (registry has no postcode)
            k = he_canon(sample["org_name"], sample["place_raw"])
            hits = he_index.get((k, place)) if k else None
            if hits and len(set(hits)) == 1 and (mkey, hits[0]) not in barred:
                target = (hits[0], "6 higher-ed name+town", 100)
        if target is None and norm:                                   # 4: fuzzy within the same postcode
            best = (0, None)
            for oid in set(candidates_same_postcode(norm, pc, place)):
                o = orgs[oid]
                if not o.norm or (mkey, oid) in barred:
                    continue
                s = fuzz.token_sort_ratio(norm, o.norm)
                if s < 99 and is_subunit(norm) and is_subunit(o.norm):
                    continue            # two different faculties/departments are different organisations, not typos
                if s > best[0]:
                    best = (s, oid)
            score, oid = best
            if oid and score >= REVIEW:
                o = orgs[oid]
                mixed_level = is_subunit(norm) != is_subunit(o.norm)
                if score >= AUTO and not mixed_level:
                    target = (oid, "4 fuzzy same postcode", score)
                else:
                    queue.append(dict(mention_key=mkey, mention=sample["org_name"], candidate_org=oid,
                                      candidate_name=o.name, score=score, n_mentions=len(idxs),
                                      reason="faculty/university level differs" if mixed_level else "score below auto threshold"))
        if target is None:                                            # new unanchored organisation
            display = Counter(apps[i]["org_name"] for i in idxs).most_common(1)[0][0]
            oid = f"H-{short_hash(f'{norm}|{pc or place or ''}')}"
            if oid not in orgs:
                register(Org(oid, " ".join(display.split()), pc, sample["place_raw"], anchored=False))
            target = (oid, "new", 0)
        resolved[key] = target

    # ---------------------------------------------------------------- write tables
    for key, (oid, method, score) in resolved.items():
        for i in mentions[key]:
            apps[i]["org_id"], apps[i]["link_method"], apps[i]["link_score"] = oid, method, score
            orgs[oid].mentions[(apps[i]["org_name"], apps[i]["address"])] += 1

    con.execute("drop table if exists participation")
    con.execute("create table participation(org_id varchar, project_id varchar, period varchar, call_year integer, role varchar, "
                "slot integer, action_type varchar, project_grant_eur double, org_name_raw varchar, address_raw varchar, "
                "postcode varchar, link_method varchar, link_score double)")
    con.executemany("insert into participation values (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    [(a["org_id"], a["project_id"], a["period"], int(a["call_year"]) if a["call_year"] else None, a["role"], a["slot"],
                      a["action_type"], a["project_grant_eur"], a["org_name"], a["address"], a["postcode"], a["link_method"], a["link_score"])
                     for a in apps])

    used = {a["org_id"] for a in apps}
    con.execute("drop table if exists organisation")
    con.execute("create table organisation(org_id varchar, name varchar, postcode varchar, town varchar, county varchar, "
                "eu_org_type varchar, register_kind varchar, oid varchar, registry_key varchar, identity_basis varchar, "
                "n_mentions integer, n_name_variants integer, eu_oid varchar)")
    extra_oid = {r["org_id"]: r["eu_oid"].strip() for r in read_csv_rows(REVIEW_DIR / "org_oids.csv")}   # OIDs looked up by hand for organisations tablica 4 does not list
    for i in inst.values():                       # a faculty is shown with its university (owner decision 2026-11-03); matching above used the plain names
        if "higher_education" in i["kinds"] and i.get("parent") and i.get("org_id") in orgs:
            orgs[i["org_id"]].name = with_university(i["name"], i["parent"], i["place"])
    for o in orgs.values():                       # 'Gimnazija METKOVIĆ' -> 'Gimnazija Metković': the town written in capitals inside an otherwise normal name
        if o.place and o.name != o.name.upper():
            town = " ".join(o.place.split())
            if len(town) >= 4 and town.upper() != town.lower():
                o.name = re.sub(rf"(?<![\wČĆŽŠĐ]){re.escape(town.upper())}(?![\wČĆŽŠĐ])", town.title(), o.name)
    rows = []
    for oid in sorted(used):
        o = orgs[oid]
        types = Counter(a["org_type"] for a in apps if a["org_id"] == oid and a["org_type"])
        pcs = Counter(a["postcode"] for a in apps if a["org_id"] == oid and a["postcode"])
        pc = o.postcode or (pcs.most_common(1)[0][0] if pcs else None)
        basis = "OID" if o.oid else ("registry" if o.registry_key else "name+postcode hash")
        rows.append((oid, o.name, pc, o.place, place_county.get(pc), types.most_common(1)[0][0] if types else None,
                     o.kind if o.registry_key else None, o.oid, o.registry_key, basis, sum(o.mentions.values()),
                     len({norm_name(n) for n, _ in o.mentions}), o.oid or extra_oid.get(oid)))
    con.executemany("insert into organisation values (?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)

    con.execute("drop table if exists org_alias")
    con.execute("create table org_alias(org_id varchar, name_raw varchar, address_raw varchar, n integer)")
    con.executemany("insert into org_alias values (?,?,?,?)",
                    [(oid, n, ad, c) for oid in used for (n, ad), c in orgs[oid].mentions.items()])

    con.execute("drop table if exists institution")
    con.execute("create table institution(inst_id varchar, name varchar, register_kind varchar, postcode varchar, town varchar, "
                "county varchar, school_code varchar, mbu varchar, founder varchar, parent_name varchar, institution_type varchar, "
                "is_programme_provider boolean, org_id varchar)")
    con.executemany("insert into institution values (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    [(i["id"], i["name"], ",".join(sorted(i["kinds"])), i["postcode"], i["place"], i["county"], i["school_code"],
                      i["mbu"], i["founder"], i["parent"], i["itype"],
                      "kindergarten" in i["kinds"] and bool(SHORT_PROGRAMME.match(norm_name(i["name"]) or "")),
                      i["org_id"] if i["org_id"] in used else None) for i in inst.values()])

    with open(APP_DIR / "data" / "review_queue.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, ["mention_key", "mention", "candidate_org", "candidate_name", "score", "n_mentions", "reason"])
        w.writeheader()
        w.writerows(sorted(queue, key=lambda r: -r["n_mentions"]))

    # ---------------------------------------------------------------- report
    methods = Counter(a["link_method"].split(" ")[0] if a["link_method"][0].isdigit() else a["link_method"] for a in apps)
    print(f"{len(mentions):,} distinct (name, postcode) mentions -> {len(used):,} organisations "
          f"({sum(1 for o in used if orgs[o].anchored):,} anchored in a registry or tablica 4, "
          f"{sum(1 for o in used if not orgs[o].anchored):,} new)")
    print("appearances by match method:", dict(methods))
    with open(APP_DIR / "data" / "higher_ed_links_to_check.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["kind", "name_as_written_in_EU_export", "linked_to_org_id", "linked_org_name", "appearances", "projects"])
        for oid_, nm, twin in he_unified:
            w.writerow(["registry entry joined to existing organisation", nm, twin, orgs[twin].name, "", ""])
        seen = defaultdict(lambda: [set(), 0])
        for a in apps:
            if a["link_method"] == "6 higher-ed name+town":
                seen[(a["org_name"], a["org_id"])][0].add(a["project_id"]); seen[(a["org_name"], a["org_id"])][1] += 1
        for (nm, oid_), (pr, n) in sorted(seen.items(), key=lambda kv: kv[0][1]):
            w.writerow(["mention linked by name + town", nm, oid_, orgs[oid_].name, n, len(pr)])
    print(f"higher-education links: {len(he_unified)} registry entries joined, {len(seen)} spellings linked -> data/higher_ed_links_to_check.csv")
    print(f"review queue: {len(queue)} pairs covering {sum(q['n_mentions'] for q in queue)} appearances -> data/review_queue.csv")
    print(f"institutions: {len(inst):,} ({con.execute('select count(*) from institution where org_id is not null').fetchone()[0]} with a KA2 organisation)")
    con.close()


if __name__ == "__main__":
    main()

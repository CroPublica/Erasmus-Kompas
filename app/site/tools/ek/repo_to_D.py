"""Pretvara izvoz podataka stvarne stranice (app/site) u data/D.json koji prototip koristi.

Pokretanje:  python3 tools/repo_to_D.py <putanja do app/site> [izlaz.json]
Čita:  src/data/{meta,national,counties,coverage,orgs,topics_by_year,graph}.json  i  public/projects.json
Nakon ./run_pipeline.sh (koji osvježi te datoteke) dovoljno je ponoviti ovu naredbu i `python3 build.py`.
Skripta provjerava oblik podataka i staje s jasnom porukom ako se nešto promijenilo.
"""
import collections, json, os, sys

SITE = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'D.json')
r = lambda f: json.load(open(os.path.join(SITE, f), encoding='utf-8'))

def need(obj, keys, where):
    miss = [k for k in keys if k not in obj]
    if miss:
        sys.exit(f'GREŠKA: u {where} nedostaju polja {miss}. Oblik izvoza se promijenio; prilagodi tools/repo_to_D.py.')

def sector(t):
    t = t.lower()
    if any(k in t for k in ['higher education', 'european universities', 'mundus']): return 'visoko'
    if 'vocational' in t: return 'strukovno'
    if 'adult' in t: return 'odrasli'
    if 'youth' in t: return 'mladi'
    if 'school' in t: return 'skolsko'
    return 'ostalo'

def kind(t):
    l = t.lower()
    if 'school exchange' in l: return 'razmjena'
    if 'small-scale' in l: return 'mala'
    if l.startswith('strategic partnerships'): return 'strateska'
    if 'cooperation partnerships' in l: return 'suradnja'
    if 'capacity building' in l: return 'kapaciteti'
    return 'ostalo'

P = r('public/projects.json'); nat = r('src/data/national.json'); meta = r('src/data/meta.json')
need(meta, ['generated', 'projects', 'coordinated', 'organisations', 'counties'], 'meta.json')
need(nat, ['periods', 'countries'], 'national.json')
if P:
    need(P[0], ['id', 'title', 'yr', 'period', 'type_', 'status', 'gp', 'countries'], 'public/projects.json')
st = {'finalized': 0, 'ongoing': 1, 'terminated': 2}
rows = collections.Counter((p['yr'], p['period'], sector(p['type_']), kind(p['type_'])) for p in P)
pr = [[p['id'], p['title'], p['yr'], p['period'], sector(p['type_']), kind(p['type_']), st.get(p['status'], 0), 1 if p['gp'] else 0, ','.join(p['countries'])] for p in P]
O = r('src/data/orgs.json')
if O: need(O[0], ['id', 'name', 'town', 'county', 'cls', 'projects', 'coordinated', 'p1', 'p2', 'c1', 'c2'], 'orgs.json')
orgs = [[o['id'], o['name'], o['town'], o['county'], o['cls'], o['projects'], o['coordinated'], o['p1'], o['p2'], o['c1'], o['c2']] for o in O]
g = r('src/data/graph.json'); need(g, ['nodes', 'edges', 'communities'], 'graph.json')
C = r('src/data/coverage.json'); need(C[0], ['period', 'role', 'county', 'school_type', 'institutions', 'participating'], 'coverage.json')
cov = [[c['period'], c['role'], c['county'], c['school_type'], c['institutions'], c['participating']] for c in C]
counties = r('src/data/counties.json'); need(counties[0], ['stem', 'label', 'ka2', 'coverage'], 'counties.json')
D = dict(meta=meta, periods=nat['periods'], countries=nat['countries']['2021-2027'], rows=[list(k) + [v] for k, v in rows.items()],
         counties=counties, coverage=cov, projects=pr, orgs=orgs, topics=r('src/data/topics_by_year.json'), graph=g)
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
json.dump(D, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('OK', os.path.abspath(OUT), f"{os.path.getsize(OUT)//1024} KB:", len(pr), 'projekata,', len(orgs), 'organizacija,', len(counties), 'županija')

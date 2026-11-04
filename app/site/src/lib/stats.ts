import cov from '../data/coverage.json';
import counties from '../data/counties.json';

export type TypeFilter = 'both' | 'primary' | 'secondary' | 'kindergarten';
export type Period = 'all' | '2014-2020' | '2021-2027';
export type Role = 'any' | 'coordinator';
export interface State { type: TypeFilter; period: Period; role: Role }

const TYPES: Record<TypeFilter, string[]> = {
  both: ['primary', 'secondary', 'combined'], primary: ['primary'], secondary: ['secondary'], kindergarten: ['kindergarten'],
};

/** Wilson score interval for k of n, 95 %. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0];
  const p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export interface CountyCoverage {
  stem: string; label: string; n: number; k: number; rate: number; lo: number; hi: number;
  expected: number; flag: 'above' | 'below' | null;
}
type Row = { period: string; role: string; county: string; school_type: string; institutions: number; participating: number };

export function coverage(st: State): { rows: CountyCoverage[]; n: number; k: number; national: number } {
  const sel = (cov as Row[]).filter((r) => r.period === st.period && r.role === st.role);
  // national rate per school type, for "expected"
  const natType: Record<string, number> = {};
  for (const ty of new Set(sel.map((r) => r.school_type))) {
    const rs = sel.filter((r) => r.school_type === ty);
    natType[ty] = rs.reduce((s, r) => s + r.participating, 0) / rs.reduce((s, r) => s + r.institutions, 0);
  }
  const types = TYPES[st.type];
  const rows = (counties as any[]).map((c) => {
    const cs = sel.filter((r) => r.county === c.stem && types.includes(r.school_type));
    const n = cs.reduce((s, r) => s + r.institutions, 0);
    const k = cs.reduce((s, r) => s + r.participating, 0);
    const expected = cs.reduce((s, r) => s + r.institutions * natType[r.school_type], 0);
    const [lo, hi] = wilson(k, n);
    return { stem: c.stem, label: c.label, n, k, rate: n ? k / n : 0, lo, hi, expected, flag: null as any };
  });
  const N = rows.reduce((s, r) => s + r.n, 0);
  const K = rows.reduce((s, r) => s + r.k, 0);
  const national = N ? K / N : 0;
  for (const r of rows) r.flag = r.lo > national ? 'above' : r.hi < national ? 'below' : null;
  return { rows, n: N, k: K, national };
}

/** Tile positions (column, row), roughly geographic. */
export const TILES: Record<string, [number, number]> = {
  'Međimurska': [3, 0],
  'Varaždinska': [2, 1], 'Koprivničko-križevačka': [3, 1],
  'Krapinsko-zagorska': [1, 2], 'Grad Zagreb': [2, 2], 'Bjelovarsko-bilogorska': [3, 2], 'Virovitičko-podravska': [4, 2],
  'Istarska': [0, 3], 'Primorsko-goranska': [1, 3], 'Zagrebačka': [2, 3], 'Sisačko-moslavačka': [3, 3],
  'Požeško-slavonska': [4, 3], 'Osječko-baranjska': [5, 3],
  'Ličko-senjska': [1, 4], 'Karlovačka': [2, 4], 'Brodsko-posavska': [4, 4], 'Vukovarsko-srijemska': [5, 4],
  'Zadarska': [1, 5], 'Šibensko-kninska': [2, 5],
  'Splitsko-dalmatinska': [3, 6],
  'Dubrovačko-neretvanska': [4, 7],
};

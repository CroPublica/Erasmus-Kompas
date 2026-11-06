// Renders the coverage page's tiles and ranking as HTML strings: used at build time (default view) and in the browser (filters).
import { num, pct, pctUnit, slug, t, type Lang } from './i18n';
import { coverage, TILES, type State } from './stats';

const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
// colour bands are relative to the national rate, so every filter combination uses the whole scale
const CUTS = [0.6, 0.85, 1.1, 1.4];
const ramp = (r: number, nat: number) => 1 + CUTS.filter((c) => r >= c * nat).length;
const short = (l: string) => l.replace(/ županija$/, '');

export function renderCoverage(lang: Lang, st: State, base: string) {
  const s = t(lang);
  const d = coverage(st);
  const summary = (r: (typeof d.rows)[number]) =>
    `${s.tookPart(num(lang, r.k), r.n, pct(lang, r.rate), pct(lang, r.lo, 0), pct(lang, r.hi, 0))} ${s.wouldExpect(num(lang, r.expected, 0))}`;
  const tiles = d.rows.map((r) => {
    const [c, row] = TILES[r.stem];
    const mark = r.flag === 'above' ? '▲' : r.flag === 'below' ? '▼' : '';
    return `<button type="button" class="tile" data-r="${ramp(r.rate, d.national)}" data-county="${esc(r.stem)}" data-label="${esc(r.label)}"
      data-summary="${esc(summary(r))}" data-href="${base}/${lang}/places/${slug(r.stem)}/" data-out="${num(lang, r.n - r.k)}"
      style="left:calc(${c} * 100% / 6 + 2px);top:calc(${row} * 100% / 8 + 2px)" aria-pressed="false">
      <span>${esc(short(r.label))}</span><strong>${pct(lang, r.rate, 0)}${pctUnit(lang)} ${mark}</strong>
      <span class="sr"> ${num(lang, r.k)} / ${num(lang, r.n)}</span></button>`;
  }).join('');
  const sorted = [...d.rows].sort((a, b) => b.rate - a.rate);
  const max = Math.max(0.7, ...d.rows.map((r) => r.hi));
  const rank = sorted.map((r) => `<div class="rank" role="listitem" data-rank="${esc(r.stem)}" data-county="${esc(r.stem)}">
    <span><a class="linkish" href="${base}/${lang}/places/${slug(r.stem)}/">${esc(short(r.label))}</a></span>
    <span class="range ${r.flag ? 'flag' : ''}"><i class="nat" style="left:${(d.national / max) * 100}%"></i>
      <i class="bar" style="left:${(r.lo / max) * 100}%;width:${((r.hi - r.lo) / max) * 100}%"></i>
      <i class="dot" style="left:${(r.rate / max) * 100}%"></i></span>
    <span class="n mono">${num(lang, r.k)}/${num(lang, r.n)}</span>
    <span class="n mono">≈${num(lang, r.expected, r.expected < 10 ? 1 : 0)}</span></div>`).join('');
  const axis = `0${pctUnit(lang)} · ${s.national} ${pct(lang, d.national)}${pctUnit(lang)} · ${Math.round(max * 100)}${pctUnit(lang)}`;
  const f = (x: number) => num(lang, x * d.national * 100, 0);
  const labels = [`<${f(CUTS[0])}${pctUnit(lang)}`, `${f(CUTS[0])}–${f(CUTS[1])}`, `${f(CUTS[1])}–${f(CUTS[2])}`, `${f(CUTS[2])}–${f(CUTS[3])}`, `${f(CUTS[3])}${pctUnit(lang)}+`];
  const legend = labels.map((l, i) => `<span><i style="background:var(--ramp-${i + 1})"></i> ${l}</span>`).join('') +
    `<span>▲▼ ${s.above} / ${s.below}</span>`;
  const headline = `<div class="big-n">${pct(lang, d.national)}${pctUnit(lang)}</div>
    <div class="lead" style="text-align:right">${num(lang, d.k)} / ${num(lang, d.n)} ${s.schoolsNationally}</div>`;
  return { tiles, rank, axis, headline, legend };
}

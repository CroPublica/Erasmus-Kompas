(function(){
"use strict";
const D = window.__EK_D;

/* jezik sučelja: 'hr' ili 'en' (prijevodi su u i18n.js) */
let LANG = document.documentElement.lang === 'en' ? 'en' : 'hr';
let tr = (s) => s;

/* ============ pomoćne funkcije ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, LANG === 'en' ? ',' : '.');
const dec = (x, d = 1) => { const s = x.toFixed(d); return LANG === 'en' ? s : s.replace('.', ','); };
const pct = (x, d = 1) => dec(x * 100, d);
const eur = (n) => LANG === 'en' ? '€' + fmt(n) : fmt(n) + ' €';
const mil = (n) => LANG === 'en' ? '€' + dec(n / 1e6) + 'M' : dec(n / 1e6) + ' mil. €';
/* naziv iz dvojezičnog podatka: [engleski, hrvatski] */
const bi = (en, hr) => LANG === 'en' ? (en || hr) : (hr || en);
const fold = (x) => String(x).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');
let regionNames = (() => { try { return new Intl.DisplayNames(['hr'], { type: 'region' }); } catch (e) { return null; } })();
const country = (c) => { const m = { EL: 'GR', UK: 'GB' }[c] || c; try { return (regionNames && regionNames.of(m)) || c; } catch (e) { return c; } };
const fdate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return LANG === 'en' ? new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : `${d}. ${m}. ${y}.`; };
const LL = (hr, en) => (LANG === 'en' ? en : hr);
const PL = (k) => (LANG === 'en' ? LAB.period[k].replace(/\./g, '') : LAB.period[k]);
const collator = () => new Intl.Collator(LANG === 'en' ? 'en' : 'hr');
const wilson = (k, n, z = 1.96) => { if (!n) return [0, 0]; const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), r = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - r) / d, (c + r) / d]; };
const shortCounty = (c) => c.label.replace(' županija', '');
const countyBy = (stem) => D.counties.find((c) => c.stem === stem);
const sum = (a) => a.reduce((x, y) => x + y, 0);

const LAB = {
  period: { all: '2014.–2026.', '2014-2020': '2014.–2020.', '2021-2027': '2021.–2027.' },
  sector: { skolsko: 'Školsko obrazovanje', strukovno: 'Strukovno obrazovanje (VET)', visoko: 'Visoko obrazovanje', odrasli: 'Obrazovanje odraslih', mladi: 'Mladi', ostalo: 'Ostalo' },
  kind: { suradnja: 'Partnerstva za suradnju', mala: 'Mala partnerstva', strateska: 'Strateška partnerstva', razmjena: 'Razmjena škola', kapaciteti: 'Izgradnja kapaciteta', ostalo: 'Savezi i ostale akcije' },
  cls: { ngo: 'Nevladine organizacije', higher_education: 'Visoka učilišta', school_primary: 'Osnovne škole', school_vocational: 'Strukovne škole', school_secondary_general: 'Gimnazije i opće srednje škole', public_body: 'Javna tijela', adult_education: 'Obrazovanje odraslih', sme_business: 'Poduzeća (MSP)', school_preprimary: 'Predškolske ustanove', other: 'Ostalo', sport: 'Sport', culture: 'Kultura', research: 'Istraživačke organizacije', counselling: 'Savjetovanje' },
  status: ['Završen', 'U tijeku', 'Prekinut']
};
const SECTOR_COL = { skolsko: '#004494', strukovno: '#0f8b8d', visoko: '#f8ae21', odrasli: '#a23e87', mladi: '#6a8bc4', ostalo: '#9aa5b8' };
const KIND_COL = { suradnja: '#004494', mala: '#f8ae21', strateska: '#0f8b8d', razmjena: '#a23e87', kapaciteti: '#6a8bc4', ostalo: '#9aa5b8' };

/* ============ navigacija ============ */
const ICON = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  dash: '<path d="M4 20V10M10 20V4M16 20v-8M21 20H3"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>'
};
/* ============ zajednički gradivni blokovi ============ */
const head = (kicker, title, lead) => `<header class="pagehead"><div class="kicker">${kicker}</div><h1>${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}</header>`;
const seg = (id, label, opts, cur) => `<div class="f"><span class="lab">${label}</span><div class="seg" id="${id}" role="group" aria-label="${label}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div></div>`;
const resetBtn = '<button class="reset" id="reset" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8"/><path d="M3 3v5h5"/></svg>Poništi filtre</button>';

/* poredak s trakama napretka.
   items: [{label, sub, v, text, st, href, key, hl}] ; o: {cls, pick, sel, max, nonum} */
const rank = (items, o = {}) => {
  const max = o.max || Math.max(1, ...items.map((i) => i.v));
  return `<ol class="rank ${o.cls || ''}${o.nonum ? ' nonum' : ''}">${items.map((it, k) => {
    const T = it.href ? 'a' : (o.pick ? 'button' : 'div');
    const at = (it.href ? `href="${it.href}"` : '') + (o.pick ? ` type="button" data-k="${esc(it.key)}" aria-pressed="${o.sel === it.key}"` : '');
    return `<li><${T} class="rk${it.hl ? ' hl' : ''}" ${at}><span class="n">${k + 1}</span><span class="nm">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span><span class="bar" aria-hidden="true"><i style="--w:${Math.max(.8, it.v / max * 100).toFixed(1)}%${it.col ? `;background:${it.col}` : ''}"></i></span><span class="val">${it.text}${it.st ? `<small>${it.st}</small>` : ''}</span></${T}></li>`;
  }).join('')}</ol>`;
};
const niceMax = (v) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };

/* stupčasti graf po godinama; data: [{x, y, part}] ; o: {mark: godina nakon koje je granica programa} */
function colChart(data, o = {}) {
  const W = innerWidth < 600 ? 400 : 720, H = o.h || 280, ml = 46, mr = 10, mt = 26, mb = 32, n = data.length;
  if (!n) return '<div class="empty">Nema podataka za odabrane filtre.</div>';
  const top = niceMax(Math.max(...data.map((d) => d.y))), step = (W - ml - mr) / n, bw = Math.min(46, step * .64), Y = (v) => mt + (1 - v / top) * (H - mt - mb), X = (i) => ml + step * i + step / 2;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || 'Graf po godinama')}">`;
  for (let k = 0; k <= 4; k++) { const v = top * k / 4; s += `<line class="ch-grid" x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ch-ax" x="${ml - 8}" y="${Y(v) + 4}" text-anchor="end">${fmt(v)}</text>`; }
  data.forEach((d, i) => {
    const h = Math.max(1, H - mb - Y(d.y));
    s += `<rect class="ch-bar${d.part ? ' part' : ''}" x="${X(i) - bw / 2}" y="${Y(d.y)}" width="${bw}" height="${h}" rx="2"><title>${d.x}: ${fmt(d.y)}${d.part ? ' (godina još traje)' : ''}</title></rect>`;
    if (n <= 14 && (W > 500 || n <= 8)) s += `<text class="ch-lbl" x="${X(i)}" y="${Y(d.y) - 7}">${fmt(d.y)}</text>`;
    s += `<text class="ch-ax" x="${X(i)}" y="${H - 10}" text-anchor="middle">${n > 10 && innerWidth < 560 ? "'" + String(d.x).slice(2) : d.x}${d.part ? '*' : ''}</text>`;
  });
  if (o.mark) { const i = data.findIndex((d) => d.x === o.mark + 1); if (i > 0) { const bx = ml + step * i; s += `<line class="ch-mark" x1="${bx}" x2="${bx}" y1="${mt - 6}" y2="${H - mb}"/><text class="ch-mark-t" x="${bx + 6}" y="${mt + 4}">novi program od ${o.mark + 1}.</text>`; } }
  return s + '</svg>';
}
/* složeni stupčasti graf; series: [{key,label,color,vals:{godina:broj}}] */
function stackChart(years, series, o = {}) {
  const W = innerWidth < 600 ? 400 : 720, H = o.h || 320, ml = 46, mr = 10, mt = 18, mb = 32, n = years.length;
  const tot = years.map((y) => sum(series.map((s) => s.vals[y] || 0))), top = niceMax(Math.max(1, ...tot)), step = (W - ml - mr) / n, bw = Math.min(46, step * .64), Y = (v) => mt + (1 - v / top) * (H - mt - mb), X = (i) => ml + step * i + step / 2;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || 'Graf po godinama')}">`;
  for (let k = 0; k <= 4; k++) { const v = top * k / 4; s += `<line class="ch-grid" x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ch-ax" x="${ml - 8}" y="${Y(v) + 4}" text-anchor="end">${fmt(v)}</text>`; }
  years.forEach((y, i) => { let acc = 0; for (const se of series) { const v = se.vals[y] || 0; if (!v) continue; const y1 = Y(acc + v), y0 = Y(acc); s += `<rect x="${X(i) - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(.5, y0 - y1)}" fill="${se.color}" stroke="#fff" stroke-width=".8"><title>${y}, ${esc(se.label)}: ${fmt(v)}</title></rect>`; acc += v; }
    s += `<text class="ch-ax" x="${X(i)}" y="${H - 10}" text-anchor="middle">${innerWidth < 560 ? "'" + String(y).slice(2) : y}${y >= 2026 ? '*' : ''}</text>`; });
  const bi = years.indexOf(2021); if (bi > 0) { const bx = ml + step * bi; s += `<line class="ch-mark" x1="${bx}" x2="${bx}" y1="${mt - 4}" y2="${H - mb}"/><text class="ch-mark-t" x="${bx + 6}" y="${mt + 6}">novi program od 2021.</text>`; }
  return s + '</svg>';
}
const legendHTML = (items) => `<div class="legend">${items.map(([l, c]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join('')}</div>`;
/* broj projekata po godini iz D.rows, uz filtre {period, sector, kind} */
const byYear = (f = {}) => { const m = {}; for (const r of D.rows) { if (f.period && f.period !== 'all' && r[1] !== f.period) continue; if (f.sector && r[2] !== f.sector) continue; if (f.kind && r[3] !== f.kind) continue; m[r[0]] = (m[r[0]] || 0) + r[4]; } return m; };
const yearData = (m) => Object.keys(m).map(Number).sort((a, b) => a - b).map((x) => ({ x, y: m[x], part: x >= 2026 }));
/* partnerske države iz popisa projekata */
const partnerCounts = (f = {}) => { const m = {}; for (const p of D.projects) { if (f.period && f.period !== 'all' && p[3] !== f.period) continue; if (f.sector && p[4] !== f.sector) continue; for (const c of p[8].split(',').filter(Boolean)) if (c !== 'HR') m[c] = (m[c] || 0) + 1; } return m; };

/* ============ karta županija (samo uz interaktivne stranice) ============ */
function tileMap(box, legendBox, items, selected, onPick, unit, dim) {
  const vals = items.map((i) => i.v).sort((a, b) => a - b), q = (f) => vals[Math.min(vals.length - 1, Math.floor(f * vals.length))];
  const th = [q(.2), q(.4), q(.6), q(.8)];
  const bucket = (v) => v > th[3] ? 4 : v > th[2] ? 3 : v > th[1] ? 2 : v > th[0] ? 1 : 0;
  const byStem = new Map(items.map((i) => [i.stem, i])), G = D.geo, NS = 'http://www.w3.org/2000/svg';
  box.classList.add('geomap'); box.classList.toggle('dim', !!dim); box.innerHTML = '';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', G.vb || '0 15 1000 985'); svg.setAttribute('role', 'group'); svg.setAttribute('aria-label', 'Karta županija. Odaberite županiju za pojedinosti.');
  const info = document.createElement('div'); info.className = 'geoinfo'; info.setAttribute('aria-live', 'polite');
  const label = (stem) => { const it = byStem.get(stem); return it ? `${countyBy(stem).label}: ${it.text}` : countyBy(stem).label; };
  const showInfo = (stem) => { const c = countyBy(stem), it = byStem.get(stem); info.innerHTML = stem ? `<b>${esc(c.label)}</b><span>${it ? it.text : 'nema podataka'}</span>` : '<span class="hintx">Zadržite pokazivač ili odaberite županiju na karti</span>'; };
  const gAll = document.createElementNS(NS, 'g'), gSel = document.createElementNS(NS, 'g'), gTxt = document.createElementNS(NS, 'g');
  const bind = (el, stem) => { el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button'); el.setAttribute('aria-pressed', String(selected === stem)); el.setAttribute('aria-label', label(stem));
    el.addEventListener('click', () => onPick(stem)); el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(stem); } });
    for (const ev of ['mouseenter', 'focus']) el.addEventListener(ev, () => showInfo(stem)); for (const ev of ['mouseleave', 'blur']) el.addEventListener(ev, () => showInfo(selected || '')); };
  const OFF = { 'Međimurska': [64, -8, 1], 'Varaždinska': [-16, 26], 'Krapinsko-zagorska': [-22, 8], 'Koprivničko-križevačka': [14, 0], 'Dubrovačko-neretvanska': [-95, -5, 1], 'Splitsko-dalmatinska': [-100, 10, 1] };
  for (const stem of Object.keys(G.paths)) {
    const it = byStem.get(stem), path = document.createElementNS(NS, 'path'); path.setAttribute('d', G.paths[stem]);
    path.setAttribute('class', 'c' + (selected === stem ? ' sel' : '') + (it ? '' : ' none')); if (it) path.dataset.b = bucket(it.v); bind(path, stem);
    (selected === stem ? gSel : gAll).append(path);
    if (it && stem !== 'Grad Zagreb') { const off = OFF[stem] || [0, 0, 0], x = G.cent[stem][0] + off[0], y = G.cent[stem][1] + off[1], t = document.createElementNS(NS, 'text'); t.setAttribute('x', x); t.setAttribute('y', y + 10); t.setAttribute('class', 'v t' + (off[2] ? 'x' : bucket(it.v))); t.innerHTML = `<tspan class="val" x="${x}">${it.map || it.text}</tspan>`; gTxt.append(t); }
  }
  const zg = byStem.get('Grad Zagreb'), [zx, zy] = G.cent['Grad Zagreb'];
  if (zg) { const cg = document.createElementNS(NS, 'g'); cg.setAttribute('class', 'zg' + (selected === 'Grad Zagreb' ? ' sel' : '')); bind(cg, 'Grad Zagreb');
    cg.innerHTML = `<line x1="${zx}" y1="${zy}" x2="190" y2="150"/><circle class="c" data-b="${bucket(zg.v)}" cx="190" cy="150" r="64"/><text class="v t${bucket(zg.v)}" text-anchor="middle"><tspan x="190" y="136" font-size="19" font-weight="600">Zagreb</tspan><tspan class="val" x="190" y="172">${zg.text}</tspan></text>`; gTxt.append(cg); }
  svg.append(gAll, gSel, gTxt); box.append(svg, info); showInfo(selected || '');
  const f = unit === '%' ? (x) => Math.round(x * 100) : fmt;
  const rng = [`do ${f(th[0])}`, `${f(th[0])}–${f(th[1])}`, `${f(th[1])}–${f(th[2])}`, `${f(th[2])}–${f(th[3])}`, `više od ${f(th[3])}`];
  if (legendBox) legendBox.innerHTML = rng.map((t, i) => `<span><i style="background:var(--r${i + 1})"></i>${t}${unit === '%' ? ' %' : ''}</span>`).join('');
}
/* nepomična karta s označenom jednom županijom */
function miniMap(stem) {
  const G = D.geo; return `<div class="geomap mini"><svg viewBox="${G.vb || '0 15 1000 985'}" role="img" aria-label="Položaj županije na karti Hrvatske">${Object.keys(G.paths).map((s) => `<path class="c${s === stem ? ' on' : ''}" d="${G.paths[s]}"/>`).join('')}</svg></div>`;
}
const mapCard = (title, lead) => `<h3>${title}</h3><p class="lead">${lead}</p><div class="geomap" id="tiles"></div><div class="maplegend" id="legend"></div>`;

/* ============ pretraga: traka u glavnom dijelu stranice ============ */
let gsN = 0;
const searchHTML = (cls = '') => {
  const id = 'gs' + (++gsN);
  return `<div class="gsearch ${cls}" role="search"><svg class="gi" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><label class="sr" for="${id}">Pretraži atlas</label><input id="${id}" type="search" placeholder="Pretraži županije, organizacije, projekte…" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="${id}-r"><kbd aria-hidden="true">/</kbd><div class="gres" id="${id}-r" hidden></div></div>`;
};
let PIDX = null;
function initSearch(root) {
  $$('.gsearch', root).forEach((w) => {
    if (w._i) return; w._i = 1;
    const input = $('input', w), box = $('.gres', w);
    const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); };
    const open = () => { box.hidden = false; input.setAttribute('aria-expanded', 'true'); };
    const grp = (t, items) => items.length ? `<span class="gl">${t}</span>${items.join('')}` : '';
    const item = (href, t, s, extra = '', raw = false) => `<a href="${href}" ${extra}><span>${raw ? t : esc(t)}</span>${s ? `<small>${esc(s)}</small>` : ''}</a>`;
    function run() {
      const raw = input.value.trim(), q = fold(raw);
      if (q.length < 2) {
        const quick = (typeof PAGES !== 'undefined' ? PAGES : []).filter((p) => ['#/pregled', '#/mjesta', '#/pokrivenost', '#/drzave', '#/projekti', '#/pitajte'].includes(p[0]));
        box.innerHTML = grp('Prečaci', quick.map((p) => item(p[0], p[1], p[2] || '')));
        box.hidden = !quick.length; if (quick.length) open(); return;
      }
      PIDX ||= D.projects.map((p) => fold(p[1]));
      const pgs = (typeof PAGES !== 'undefined' ? PAGES : []).filter((p) => fold(p[1] + ' ' + (p[2] || '') + ' ' + tr(p[1]) + ' ' + tr(p[2] || '')).includes(q)).slice(0, 3);
      const cs = D.counties.filter((c) => fold(c.label + ' ' + tr(c.label)).includes(q)).slice(0, 3);
      const os = D.orgs.filter((o) => fold(o[1] + ' ' + (o[2] || '')).includes(q)).slice(0, 4);
      const ps = []; for (let i = 0; i < PIDX.length && ps.length < 4; i++) if (PIDX[i].includes(q)) ps.push(D.projects[i]);
      box.innerHTML = grp('Stranice', pgs.map((p) => item(p[0], p[1], p[2] || ''))) + grp('Županije', cs.map((c) => item('#/mjesta/' + encodeURIComponent(c.stem), c.label, `${fmt(c.ka2.all.projects_involved)} projekata`)))
        + grp('Organizacije', os.map((o) => item('#/organizacije/' + encodeURIComponent(o[0]), o[1], o[2] || '')))
        + grp('Projekti', ps.map((p) => item('#/projekti/' + encodeURIComponent(p[0]), p[1], `${p[2]}.`)).concat(item('#/projekti', `Svi projekti za „<span translate="no">${esc(raw)}</span>”`, 'otvori popis s filterom', `data-pq="${esc(raw)}"`, true)))
        + grp('Asistent', [item('#/pitajte', `Pitaj asistenta: „<span translate="no">${esc(raw)}</span>”`, 'odgovor iz podataka atlasa', `data-ask="${esc(raw)}"`, true)]);
      open();
    }
    input.addEventListener('input', run); input.addEventListener('focus', run);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (input.value) input.value = ''; close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (box.hidden) run(); box.querySelector('a')?.focus(); }
      else if (e.key === 'Enter') { const a = box.querySelector('a:not([data-ask])') || box.querySelector('a'); if (a && !box.hidden) { e.preventDefault(); a.click(); } }
    });
    box.addEventListener('keydown', (e) => {
      const as = [...box.querySelectorAll('a')], i = as.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); as[Math.min(i + 1, as.length - 1)]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (i <= 0 ? input : as[i - 1]).focus(); }
      else if (e.key === 'Escape') { close(); input.focus(); }
    });
    box.addEventListener('click', (e) => {
      const a = e.target.closest('a'); if (!a) return;
      if (a.dataset.pq) window.__pre = { sel: '#q', value: a.dataset.pq };
      if (a.dataset.ask) { e.preventDefault(); Assistant.ask(a.dataset.ask); }
      input.value = ''; close();
    });
  });
}
document.addEventListener('click', (e) => $$('.gsearch').forEach((w) => { if (!w.contains(e.target)) { const b = $('.gres', w); if (!b.hidden) { b.hidden = true; $('input', w).setAttribute('aria-expanded', 'false'); } } }));
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target, tag = t.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
  const i = $('#view .gsearch input'); if (i) { e.preventDefault(); i.focus(); }
});

/* ============ moderni filteri: čipovi za kratke popise, pretraživi odabir za dugačke ============ */
const CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const splitOpt = (t) => { const m = /^(.*?)\s*\((\d[\d.,]*)\)$/.exec(t); return m ? [m[1], m[2]] : [t, '']; };
let pickN = 0;
function upgradeSelect(sel) {
  if (sel._u) return; sel._u = true;
  const f = sel.closest('label.f');
  if (f) { const d = document.createElement('div'); d.className = f.className; while (f.firstChild) d.append(f.firstChild); f.replaceWith(d); }
  const wrap = sel.closest('.f'), lab = wrap && $('.lab', wrap), uid = 'pk' + (++pickN);
  if (lab) lab.id = uid + '-l';
  const host = document.createElement('div'); host.className = 'pick'; sel.after(host);
  sel.classList.add('sr'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
  const choose = (v) => { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); };
  let popOpen = false;
  function build() {
    const opts = [...sel.options], dis = sel.disabled, cur = sel.value, labelled = lab ? ` aria-labelledby="${uid}-l"` : '';
    host.title = sel.title || ''; host.classList.toggle('dis', dis);
    if (wrap) { wrap.classList.toggle('has-chips', opts.length <= 7); wrap.classList.toggle('few', opts.length <= 5); }
    if (opts.length <= 7) {
      host.dataset.mode = 'chips';
      host.innerHTML = `<div class="chipset" role="radiogroup"${labelled}>${opts.map((o) => { const [n, c] = splitOpt(o.text); return `<button type="button" role="radio" aria-checked="${o.value === cur}" data-v="${esc(o.value)}"${dis ? ' disabled' : ''}>${esc(n)}${c ? `<em>${c}</em>` : ''}</button>`; }).join('')}</div>`;
      return;
    }
    host.dataset.mode = 'pop';
    const o = opts.find((x) => x.value === cur) || opts[0], [vn] = splitOpt(o ? o.text : '');
    host.innerHTML = `<button type="button" class="pickbtn${cur ? ' set' : ''}" aria-haspopup="listbox" aria-expanded="${popOpen}"${dis ? ' disabled' : ''}${labelled}><span class="v">${esc(vn)}</span>${CHEV}</button><div class="pop" role="dialog" aria-label="${esc(lab ? lab.textContent : 'Odabir')}"${popOpen ? '' : ' hidden'}><div class="popsearch"><input type="search" placeholder="Pretraži popis…" autocomplete="off" aria-label="Pretraži popis"></div><ul role="listbox" class="poplist">${opts.map((x) => { const [n, c] = splitOpt(x.text); return `<li role="presentation" data-n="${esc(fold(n + ' ' + tr(n)))}"><button type="button" role="option" aria-selected="${x.value === cur}" data-v="${esc(x.value)}">${CHECK}<span>${esc(n)}</span>${c ? `<em>${c}</em>` : ''}</button></li>`; }).join('')}</ul><p class="popnone" hidden>Nema rezultata.</p></div>`;
    if (popOpen) $('.popsearch input', host)?.focus();
  }
  host.addEventListener('click', (e) => {
    const chip = e.target.closest('.chipset button'); if (chip) { choose(chip.dataset.v); return; }
    const optb = e.target.closest('.poplist button'); if (optb) { popOpen = false; choose(optb.dataset.v); build(); $('.pickbtn', host)?.focus(); return; }
    const btn = e.target.closest('.pickbtn'); if (btn) { popOpen = !popOpen; build(); }
  });
  host.addEventListener('input', (e) => {
    if (!e.target.matches('.popsearch input')) return;
    const q = fold(e.target.value.trim()); let n = 0;
    $$('.poplist li', host).forEach((li) => { const hide = !!q && !li.dataset.n.includes(q); li.hidden = hide; if (!hide) n++; });
    $('.popnone', host).hidden = n > 0;
  });
  host.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && popOpen) { popOpen = false; build(); $('.pickbtn', host)?.focus(); e.stopPropagation(); return; }
    if (e.target.matches('.popsearch input')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); $$('.poplist li:not([hidden]) button', host)[0]?.focus(); }
      else if (e.key === 'Enter') { e.preventDefault(); $$('.poplist li:not([hidden]) button', host)[0]?.click(); }
    } else if (e.target.closest('.poplist') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault(); const bs = $$('.poplist li:not([hidden]) button', host), i = bs.indexOf(document.activeElement);
      if (e.key === 'ArrowUp' && i <= 0) $('.popsearch input', host).focus(); else bs[Math.max(0, Math.min(bs.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    } else if (e.target.closest('.chipset') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const bs = $$('.chipset button:not([disabled])', host), i = bs.indexOf(document.activeElement); if (i < 0) return;
      e.preventDefault(); bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length].focus();
    }
  });
  const outside = (e) => { if (!host.isConnected) { document.removeEventListener('click', outside); return; } if (popOpen && !e.composedPath().includes(host)) { popOpen = false; build(); } };
  document.addEventListener('click', outside);
  new MutationObserver(build).observe(sel, { childList: true, attributes: true, attributeFilter: ['disabled', 'title'] });
  sel._sync = build; build();
}
function modernSelects(view) {
  $$('.filters select', view).forEach(upgradeSelect);
  /* checkbox -> prekidač */
  $$('.filters label.chk', view).forEach((l) => l.classList.add('switch'));
}
let syncQ = 0;
const syncPicks = () => { cancelAnimationFrame(syncQ); syncQ = requestAnimationFrame(() => $$('#view .filters select').forEach((s) => s._sync && s._sync())); };
document.addEventListener('click', (e) => { if (e.target.closest('#view .filters')) setTimeout(syncPicks, 0); });

/* ============ izvoz filtriranih podataka: CSV, Excel (.xlsx), PDF ============
   Svaki prikaz daje getData() -> { id, title, filters:[[naziv, vrijednost]], cols:[{h, t}], rows:[[...]] }
   t: 'int' (cijeli broj), 'dec' (1 decimala), 'pct' (već u postocima), 'year' (godina), inače tekst. */
const Xport = (() => {
  const today = () => new Date().toISOString().slice(0, 10);
  const stamp = () => { const [y, m, d] = today().split('-'); return LANG === 'en' ? `${+d} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+m - 1]} ${y}` : `${+d}. ${+m}. ${y}.`; };
  const fname = (d, ext) => `erasmus-kompas_${fold(d.id).replace(/[^a-z0-9]+/g, '-')}_${today()}.${ext}`;
  const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 800); };
  const shown = (c, v) => v == null || v === '' ? '' : c.t === 'int' ? fmt(Math.round(v)) : c.t === 'dec' ? dec(v) : c.t === 'pct' ? dec(v) + ' %' : String(v);
  const SRC = () => tr('Izvor: Erasmus+ Kompas (erasmus-plus.ec.europa.eu, data.gov.hr, MZO). Neovisan projekt, nije službena stranica Europske komisije.');

  /* ---- CSV ---- */
  const cell = (v) => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const toCSV = (d) => new Blob(['\uFEFF' + [d.cols.map((c) => cell(c.h)).join(','), ...d.rows.map((r) => r.map(cell).join(','))].join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });

  /* ---- XLSX (OOXML u ZIP-u bez kompresije) ---- */
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u) => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = crcT[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
    for (const [name, str] of files) {
      const nb = enc.encode(name), data = enc.encode(str), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
      parts.push(new Uint8Array(lh.buffer), nb, data);
      const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
      cd.push(new Uint8Array(ch.buffer), nb); off += 30 + nb.length + data.length;
    }
    const size = cd.reduce((a, p) => a + p.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...cd, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const xe = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const colL = (i) => { let s = '', n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const sstr = (ref, v, s = 0) => `<c r="${ref}" t="inlineStr"${s ? ` s="${s}"` : ''}><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
  function toXLSX(d) {
    const nc = d.cols.length, nr = d.rows.length, ST = { int: 2, dec: 3, pct: 3 };
    const widths = d.cols.map((c, i) => Math.min(60, Math.max(String(c.h).length + 2, ...d.rows.slice(0, 300).map((r) => String(shown(c, r[i])).length + 2), 8)));
    let rows = `<row r="1" ht="30" customHeight="1">${d.cols.map((c, i) => sstr(colL(i) + 1, c.h, 1)).join('')}</row>`;
    d.rows.forEach((r, ri) => { rows += `<row r="${ri + 2}">${d.cols.map((c, i) => { const v = r[i], ref = colL(i) + (ri + 2); if (v == null || v === '') return ''; return typeof v === 'number' && c.t !== undefined ? `<c r="${ref}"${ST[c.t] ? ` s="${ST[c.t]}"` : ''}><v>${v}</v></c>` : sstr(ref, v); }).join('')}</row>`; });
    const sheet1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" tabSelected="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="16"/><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData>${nr ? `<autoFilter ref="A1:${colL(nc - 1)}${nr + 1}"/>` : ''}</worksheet>`;
    const info = [[d.title, 4], ['', 0], [tr('Primijenjeni filteri'), 5], ...d.filters.map(([k, v]) => [`${k}: ${v}`, 0]), ['', 0], [`${tr('Broj redaka')}: ${fmt(nr)}`, 0], [`${tr('Izvezeno')}: ${stamp()}`, 0], [SRC(), 0]];
    const sheet2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="110" customWidth="1"/></cols><sheetData>${info.map(([t, s], i) => t === '' ? `<row r="${i + 1}"/>` : `<row r="${i + 1}">${sstr('A' + (i + 1), t, s)}</row>`).join('')}</sheetData></worksheet>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="165" formatCode="0.0"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="15"/><color rgb="FF0B2A5B"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF004494"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF004494"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    const NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    return zip([
      ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS}"><sheets><sheet name="${xe(tr('Podaci'))}" sheetId="1" r:id="rId1"/><sheet name="${xe(tr('O izvozu'))}" sheetId="2" r:id="rId2"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${NS}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${NS}/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml', styles], ['xl/worksheets/sheet1.xml', sheet1], ['xl/worksheets/sheet2.xml', sheet2]
    ]);
  }

  /* ---- PDF (Helvetica, vlastiti pisač; bez vanjskih biblioteka) ---- */
  const HW = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  const M1 = { 'č': 1, 'ć': 2, 'đ': 3, 'Č': 4, 'Ć': 5, 'Đ': 6 };
  const WIN = { '€': 0x80, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, 'Š': 0x8A, 'š': 0x9A, 'Ž': 0x8E, 'ž': 0x9E, 'Œ': 0x8C, 'œ': 0x9C };
  const bytes = (s) => { let o = ''; for (const ch of String(s).normalize('NFC')) { const c = ch.codePointAt(0); let b; if (M1[ch]) b = M1[ch]; else if (WIN[ch]) b = WIN[ch]; else if (c >= 32 && c < 127) b = c; else if (c >= 160 && c < 256) b = c; else if (ch === '→') { o += '->'; continue; } else { const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); b = base !== ch && base.length === 1 && base.charCodeAt(0) < 127 ? base.charCodeAt(0) : 63; } o += String.fromCharCode(b); } return o; };
  const bw = (b, size) => { let w = 0; for (let i = 0; i < b.length; i++) { const c = b.charCodeAt(i); w += c >= 32 && c < 127 ? HW[c - 32] : 556; } return w * size / 1000; };
  const lit = (b) => '(' + b.replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, (c) => '\\' + c.charCodeAt(0).toString(8).padStart(3, '0')) + ')';
  const wrap = (txt, w, size, maxLines) => {
    const words = bytes(txt).split(/(?<= )/), lines = []; let cur = '';
    for (let wd of words) {
      while (bw(wd, size) > w) { let k = wd.length; while (k > 1 && bw(wd.slice(0, k) + '-', size) > w) k--; if (cur) { lines.push(cur); cur = ''; } lines.push(wd.slice(0, k) + '-'); wd = wd.slice(k); }
      if (bw(cur + wd, size) > w && cur) { lines.push(cur.trimEnd()); cur = wd; } else cur += wd;
    }
    if (cur || !lines.length) lines.push(cur.trimEnd());
    if (lines.length > maxLines) { lines.length = maxLines; let l = lines[maxLines - 1]; while (l.length && bw(l + '\x85', size) > w) l = l.slice(0, -1); lines[maxLines - 1] = l + '\x85'; }
    return lines;
  };
  function toPDF(d) {
    const land = d.cols.length > 5, W = land ? 842 : 595, H = land ? 595 : 842, M = 38, fs = 8.5, lh = 11, avail = W - 2 * M, MAXR = 3000;
    const rows = d.rows.slice(0, MAXR);
    /* širine stupaca: najmanje najdulja riječ, željeno prema sadržaju, ostatak se raspodjeljuje */
    const isNum = (c) => c.t === 'int' || c.t === 'dec' || c.t === 'pct';
    const wordsW = (t) => Math.max(0, ...bytes(t).split(/\s+/).filter(Boolean).map((w) => bw(w, fs)));
    const sample = rows.slice(0, 300);
    const minW = d.cols.map((c, i) => Math.max(isNum(c) || c.t === 'year' ? Math.max(0, ...sample.map((r) => bw(bytes(shown(c, r[i])), fs))) : Math.min(80, Math.max(0, ...sample.map((r) => wordsW(shown(c, r[i]))))), wordsW(c.h) * 1.08, 24) + 12);
    const prefW = d.cols.map((c, i) => { const vals = sample.map((r) => bw(bytes(shown(c, r[i])), fs)); const mx = Math.max(0, ...vals), avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; return Math.max(minW[i], (isNum(c) || c.t === 'year' ? mx : Math.min(mx, Math.max(avg * 1.25, 70), 250)) + 12); });
    const sMin = minW.reduce((a, b) => a + b, 0), sPref = prefW.reduce((a, b) => a + b, 0);
    let cw; if (sPref <= avail) { const extra = avail - sPref; cw = prefW.map((w) => w + extra * w / sPref); } else if (sMin >= avail) cw = minW.map((w) => w * avail / sMin); else { const f = (avail - sMin) / (sPref - sMin); cw = minW.map((w, i) => w + (prefW[i] - w) * f); }
    const cx = []; cw.reduce((x, w, i) => (cx[i] = x, x + w), M);
    const hl = d.cols.map((c, i) => wrap(c.h, cw[i] - 8, fs * 1.08, 3)), hn = Math.max(...hl.map((l) => l.length)), hH = hn * lh + 9;
    const pages = []; let cur = null, y = 0;
    const T = (x, yy, b, size, bold) => `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${lit(b)} Tj ET\n`;
    const hdr = () => { let o = `0 0.267 0.58 rg ${M} ${y - hH} ${avail} ${hH} re f\n1 1 1 rg `; hl.forEach((ls, i) => ls.forEach((l, j) => { const x = isNum(d.cols[i]) ? cx[i] + cw[i] - 4 - bw(l, fs * 1.08) : cx[i] + 4; o += T(x, y - 12 - j * lh, l, fs, true); })); y -= hH; return o; };
    const newPage = (first) => {
      cur = ''; pages.push(cur); y = H - M;
      if (first) {
        cur += '0 0.267 0.58 rg ' + `${M} ${H - M - 4} 22 4 re f\n` + '1 0.839 0.09 rg ' + `${M + 22} ${H - M - 4} 10 4 re f\n`;
        cur += '0.043 0.165 0.357 rg ' + T(M + 40, H - M - 5, bytes('Erasmus+ Kompas'), 9, true); y -= 26;
        const tl = wrap(d.title, avail, 17, 2); cur += '0.043 0.165 0.357 rg '; for (const l of tl) { cur += T(M, y - 12, l, 17, true); y -= 21; }
        y -= 4; cur += '0.337 0.404 0.51 rg ';
        const meta = [`${tr('Izvezeno')}: ${stamp()} · ${fmt(d.rows.length)} ${tr('redaka')}${d.rows.length > MAXR ? (LANG === 'en' ? ` (only the first ${fmt(MAXR)} in the PDF)` : ` (u PDF-u prvih ${fmt(MAXR)})`) : ''}`, ...d.filters.map(([a, b]) => `${a}: ${b}`)];
        for (const m of meta) for (const l of wrap(m, avail, 9, 2)) { cur += T(M, y - 9, l, 9, false); y -= 12; }
        y -= 8;
      }
      cur += hdr();
    };
    newPage(true);
    rows.forEach((r, ri) => {
      const cells = d.cols.map((c, i) => wrap(shown(c, r[i]), cw[i] - 8, fs, c.t ? 1 : 3)), n = Math.max(...cells.map((x) => x.length)), rh = n * lh + 5;
      if (y - rh < M + 22) newPage(false);
      if (ri % 2) cur += `0.949 0.961 0.976 rg ${M} ${y - rh} ${avail} ${rh} re f\n`;
      cur += '0.114 0.165 0.267 rg '; cells.forEach((ls, i) => { const c = d.cols[i], num = c.t === 'int' || c.t === 'dec' || c.t === 'pct'; ls.forEach((l, j) => { const x = num ? cx[i] + cw[i] - 4 - bw(l, fs) : cx[i] + 4; cur += T(x, y - 10 - j * lh, l, fs, false); }); });
      cur += `0.85 0.88 0.925 RG 0.4 w ${M} ${y - rh} m ${M + avail} ${y - rh} l S\n`;
      y -= rh; pages[pages.length - 1] = cur;
    });
    pages[pages.length - 1] = cur;
    const N = pages.length, src = bytes(SRC());
    pages.forEach((p, i) => { pages[i] = p + '0.337 0.404 0.51 rg ' + T(M, 22, wrap(SRC(), avail - 80, 7, 1)[0], 7, false) + T(W - M - 60, 22, bytes(`${tr('Stranica')} ${i + 1}/${N}`), 7, false); });
    const objs = [];
    const enc = '<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [1 /ccaron /cacute /dcroat /Ccaron /Cacute /Dcroat] >>';
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding ${enc} >>`;
    objs[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding ${enc} >>`;
    const kids = []; pages.forEach((p, i) => { const po = 5 + i * 2, co = po + 1; kids.push(`${po} 0 R`); objs[po] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${co} 0 R >>`; objs[co] = `<< /Length ${p.length} >>\nstream\n${p}endstream`; });
    objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${N} >>`;
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'; const off = [];
    for (let i = 1; i < objs.length; i++) { off[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
    const xr = out.length; out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + off.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info << /Title ${lit(bytes(d.title))} /Producer (Erasmus+ Kompas) >> >>\nstartxref\n${xr}\n%%EOF`;
    const u = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) u[i] = out.charCodeAt(i) & 255;
    return new Blob([u], { type: 'application/pdf' });
  }

  const FORMATS = { csv: ['CSV', toCSV, 'csv'], xlsx: ['Excel', toXLSX, 'xlsx'], pdf: ['PDF', toPDF, 'pdf'] };
  /* u engleskom sučelju prevode se naslov, zaglavlja, filteri i tekstualne ćelije (nazivi iz podataka ostaju) */
  const trData = (d) => LANG !== 'en' ? d : { ...d, title: tr(d.title), cols: d.cols.map((c) => ({ ...c, h: tr(c.h) })), filters: d.filters.map(([k, v]) => [tr(k), tr(String(v))]), rows: d.rows.map((r) => r.map((v) => (typeof v === 'string' ? tr(v) : v))) };
  const run = (fmtKey, d0) => { const [, f, ext] = FORMATS[fmtKey], d = trData(d0); save(f(d), fname(d0, ext)); };
  const ICON = { csv: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/>', xlsx: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 10h16M4 15h16M10 4v16"/>', pdf: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 17c2-1 3-3 3-5 0-1-1-1-1 0 0 2 2 4 4 4"/>' };
  const BTN = { csv: ['CSV', 'Za analizu i uvoz u druge alate'], xlsx: ['Excel', 'Tablica za izvješća (.xlsx)'], pdf: ['PDF', 'Pregledno izvješće za ispis'] };

  function bar(id) {
    const el = document.createElement('div'); el.className = 'exportbar'; el.setAttribute('role', 'group'); el.setAttribute('aria-labelledby', id + '-t');
    el.innerHTML = `<div class="xinfo"><b id="${id}-t">Izvoz podataka</b><span class="xcount" aria-live="polite"></span></div><div class="xbtns">${Object.keys(BTN).map((k) => `<button type="button" data-f="${k}"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg><span><b>${BTN[k][0]}</b><small>${BTN[k][1]}</small></span></button>`).join('')}</div>`;
    return el;
  }
  let n = 0;
  /* mount(root, getData, { after: selektor, into: element }) */
  function mount(root, get, o = {}) {
    const el = bar('xb' + (++n)), anchor = o.into || $(o.after || '.filters', root);
    if (o.into) o.into.append(el); else if (anchor) anchor.after(el); else root.prepend(el);
    const info = $('.xcount', el), btns = $$('button', el);
    const upd = () => { let d; try { d = get(); } catch (e) { return; } const nr = d.rows.length; info.textContent = nr ? `${fmt(nr)} ${tr('redaka prema trenutnim filterima')}` : tr('Nema redaka za izvoz'); btns.forEach((b) => { b.disabled = !nr; }); };
    let q = 0; const soon = () => { clearTimeout(q); q = setTimeout(upd, 0); };
    ['click', 'input', 'change'].forEach((ev) => root.addEventListener(ev, soon));
    el.addEventListener('click', (e) => { const b = e.target.closest('button[data-f]'); if (!b || b.disabled) return; const d = get(); run(b.dataset.f, d); info.textContent = `${tr('Preuzimanje')} ${FORMATS[b.dataset.f][0]}: ${fmt(d.rows.length)} ${tr('redaka')}`; });
    upd(); soon(); return { update: upd, el };
  }
  return { mount, run, toCSV, toXLSX, toPDF, fname, stamp };
})();

/* ============ jezik sučelja (HR / EN) ============
   Tekstovi u prikazima pisani su hrvatski. Za engleski ih prevodi ovaj sloj nad DOM-om:
   svaki tekstualni čvor (i atributi placeholder, aria-label, title, alt) pretvara se u ključ
   u kojem su brojevi {N}, a nazivi županija, sektora, vrsta projekata i organizacija {E}.
   Ključ se traži u rječniku EN_DICT (i18n-en.js). Brojevi, nazivi država i podaci iz izvora
   ne prolaze kroz rječnik: formatira ih izvor (fmt, dec, country) prema LANG. */
const VIEWROOT = () => document.getElementById('view') || document.body;
const I18N = (() => {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT']);
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  const recT = new WeakMap(), recA = new WeakMap();
  const missing = new Set();
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let entRe = null, entList = [];
  const hasL = (s) => /\p{L}{2,}/u.test(s);

  function buildEnts() {
    const set = new Set([...Object.keys(EN_ENT), ...EN_CTRY]);
    for (const c of D.counties) { set.add(shortCounty(c)); set.add(c.label); }
    for (const g of ['sector', 'kind', 'cls']) for (const v of Object.values(LAB[g])) set.add(v);
    for (const v of LAB.status) set.add(v);
    entList = [...set].sort((a, b) => b.length - a.length);
    entRe = new RegExp('(?<![\\p{L}\\p{N}-])(?:' + entList.map(escRe).join('|') + ')(?![\\p{L}\\p{N}-])', 'gu');
  }
  const enEnt = (hr) => {
    if (EN_ENT[hr]) return EN_ENT[hr];
    if (hr.endsWith(' županija')) { const s = hr.slice(0, -9); return `${EN_ENT[s] || s} County`; }
    return hr;
  };
  const numEN = (t) => /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, ',') : /^\d+,\d{1,2}$/.test(t) ? t.replace(',', '.') : t;

  const norm = (t) => t.replace(/\s+/g, ' ').trim().replace(/(\d{4})\.\s?[–-]\s?(\d{4})\.?/g, '$1–$2').replace(/(\d)\s%/g, '$1%');
  function parse(raw) {
    if (!entRe) buildEnts();
    let t = norm(raw);
    const e = []; t = t.replace(entRe, (m) => (e.push(m), '{E}'));
    const n = []; t = t.replace(/\d+(?:[.,]\d+)*/g, (m) => (n.push(m), '{N}'));
    return { key: t, n, e };
  }
  /* prijevod jednog odsječka: iz rječnika, ili (kad nema slova osim imena i brojeva) zamjenom imena */
  function one(txt) {
    const p = parse(txt), bare = p.key.replace(/\{[NE]\}/g, '');
    let v = EN_DICT[p.key];
    if (v == null) {
      if (!hasL(bare) && p.e.length) { let i = 0, j = 0; v = p.key.replace(/\{E\}/g, () => `{E${++i}}`).replace(/\{N\}/g, () => `{N${++j}}`); } else return null;
    }
    return v.replace(/\{N(\d)\}/g, (_, i) => numEN(p.n[i - 1] ?? '')).replace(/\{E(\d)\}/g, (_, i) => enEnt(p.e[i - 1] ?? ''));
  }
  function translate(raw) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw); if (!m[2]) return raw;
    const p = parse(m[2]), bare = p.key.replace(/\{[NE]\}/g, '');
    if (!hasL(bare) && !p.e.length) { const nn = norm(m[2]); return nn === m[2] ? raw : m[1] + nn + m[3]; }
    let out = one(m[2]);
    if (out == null && m[2].includes(' · ')) {                       /* „Zagreb · Visoka učilišta”: prevodi se svaki dio posebno */
      let any = false;
      const parts = m[2].split(' · ').map((seg) => { const r = one(seg); if (r == null) { if (hasL(parse(seg).key.replace(/\{[NE]\}/g, ''))) missing.add(parse(seg).key); return seg; } any = true; return r; });
      if (any) out = parts.join(' · ');
    }
    if (out == null) { if (hasL(bare)) missing.add(p.key); return raw; }
    return m[1] + out + m[3];
  }
  const keyOf = (raw) => parse(raw).key;

  function tNode(n) {
    const r = recT.get(n);
    if (r && n.data === r.en) return;
    const en = translate(n.data);
    if (en !== n.data) { recT.set(n, { hr: n.data, en }); n.data = en; } else if (r) recT.delete(n);
  }
  function aNode(el) {
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a), rec = recA.get(el) || {}, r = rec[a];
      if (r && cur === r.en) continue;
      const en = translate(cur);
      if (en !== cur) { rec[a] = { hr: cur, en }; recA.set(el, rec); el.setAttribute(a, en); } else if (r) delete rec[a];
    }
  }
  const walk = (root, fn) => {
    if (root.nodeType === 3) { fn.t(root); return; }
    if (root.nodeType !== 1) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.nodeType === 1 && (SKIP.has(n.tagName) || n.getAttribute('translate') === 'no') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    if (root.nodeType === 1 && !SKIP.has(root.tagName)) fn.a(root);
    for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? fn.t(n) : fn.a(n);
  };
  const toEN = (root) => walk(root, { t: tNode, a: aNode });
  const toHR = (root) => walk(root, {
    t: (n) => { const r = recT.get(n); if (r && n.data === r.en) n.data = r.hr; recT.delete(n); },
    a: (el) => { const rec = recA.get(el); if (!rec) return; for (const a in rec) if (el.getAttribute(a) === rec[a].en) el.setAttribute(a, rec[a].hr); recA.delete(el); }
  });

  const obs = new MutationObserver((recs) => {
    if (LANG !== 'en') return;
    for (const r of recs) {
      if (r.type === 'characterData') tNode(r.target);
      else if (r.type === 'attributes') aNode(r.target);
      else r.addedNodes.forEach((n) => toEN(n));
    }
    obs.takeRecords();
  });
  /* za izradu rječnika i provjeru: ključevi svih tekstova i atributa pod čvorom */
  function collect(root = VIEWROOT()) {
    const out = new Map();
    const add = (raw, where) => { const m = /^\s*([\s\S]*?)\s*$/.exec(raw); if (!m[1]) return; const p = parse(m[1]); if (hasL(p.key.replace(/\{[NE]\}/g, ''))) { if (!out.has(p.key)) out.set(p.key, { raw: m[1], where }); } };
    walk(root, { t: (n) => add(n.data, (n.parentElement && (n.parentElement.closest('[id],[class]') || n.parentElement).tagName + '.' + (n.parentElement.className || '')).slice(0, 60)), a: (el) => { for (const a of ATTRS) if (el.hasAttribute(a)) add(el.getAttribute(a), '@' + a); } });
    return [...out].map(([key, v]) => ({ key, ...v }));
  }
  const watch = () => obs.observe(VIEWROOT(), { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });

  function setLang(l, opts = {}) {
    if (l === LANG && !opts.force) return;
    obs.disconnect();
    if (l === 'hr') toHR(VIEWROOT());
    LANG = l; document.documentElement.lang = l;
    tr = l === 'en' ? (s) => (typeof s === 'string' ? translate(s) : s) : (s) => s;
    try { regionNames = new Intl.DisplayNames([l], { type: 'region' }); } catch (e) { /* ostaje prethodni */ }
    try { localStorage.setItem('ek-lang', l); } catch (e) { /* privatni način ili ograničenje */ }
    if (l === 'en') toEN(VIEWROOT());
    watch();
  }
  const init = () => {
    $$('.lang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
    let saved = null; try { saved = localStorage.getItem('ek-lang'); } catch (e) { /* bez pohrane */ }
    const qs = /[?&]lang=(en|hr)/.exec(location.search + location.hash);
    const want = qs ? qs[1] : saved;
    if (want === 'en') setLang('en', { force: true }); else watch();
  };
  return { init, setLang, translate, keyOf, parse, collect, missing, toEN, toHR, ent: (hr) => (LANG === 'en' ? enEnt(hr) : hr), get dict() { return EN_DICT; } };
})();

/* engleski rječnik: generira se iz i18n/*.py (python3 i18n/gen.py) */
const EN_ENT = {
 "Grad Zagreb": "City of Zagreb",
 "Splitsko-dalmatinska": "Split-Dalmatia",
 "Osječko-baranjska": "Osijek-Baranja",
 "Primorsko-goranska": "Primorje-Gorski Kotar",
 "Istarska": "Istria",
 "Zagrebačka": "Zagreb",
 "Brodsko-posavska": "Brod-Posavina",
 "Varaždinska": "Varaždin",
 "Šibensko-kninska": "Šibenik-Knin",
 "Karlovačka": "Karlovac",
 "Vukovarsko-srijemska": "Vukovar-Syrmia",
 "Koprivničko-križevačka": "Koprivnica-Križevci",
 "Međimurska": "Međimurje",
 "Sisačko-moslavačka": "Sisak-Moslavina",
 "Zadarska": "Zadar",
 "Požeško-slavonska": "Požega-Slavonia",
 "Dubrovačko-neretvanska": "Dubrovnik-Neretva",
 "Bjelovarsko-bilogorska": "Bjelovar-Bilogora",
 "Virovitičko-podravska": "Virovitica-Podravina",
 "Krapinsko-zagorska": "Krapina-Zagorje",
 "Ličko-senjska": "Lika-Senj",
 "Školsko obrazovanje": "School education",
 "Strukovno obrazovanje (VET)": "Vocational education and training (VET)",
 "Visoko obrazovanje": "Higher education",
 "Obrazovanje odraslih": "Adult education",
 "Mladi": "Youth",
 "Ostalo": "Other",
 "Partnerstva za suradnju": "Cooperation partnerships",
 "Mala partnerstva": "Small-scale partnerships",
 "Strateška partnerstva": "Strategic partnerships",
 "Razmjena škola": "School exchange partnerships",
 "Izgradnja kapaciteta": "Capacity building",
 "Savezi i ostale akcije": "Alliances and other actions",
 "Nevladine organizacije": "Non-governmental organisations (NGOs)",
 "Visoka učilišta": "Higher education institutions",
 "Osnovne škole": "Primary schools",
 "Strukovne škole": "Vocational schools",
 "Gimnazije i opće srednje škole": "Grammar and general secondary schools",
 "Javna tijela": "Public bodies",
 "Poduzeća (MSP)": "Businesses (SMEs)",
 "Predškolske ustanove": "Pre-primary institutions",
 "Sport": "Sport",
 "Kultura": "Culture",
 "Istraživačke organizacije": "Research organisations",
 "Savjetovanje": "Counselling",
 "Završen": "Completed",
 "U tijeku": "Ongoing",
 "Prekinut": "Terminated",
 "Otok Uzašašća": "Ascension Island",
 "Andora": "Andorra",
 "Ujedinjeni Arapski Emirati": "United Arab Emirates",
 "Afganistan": "Afghanistan",
 "Antigva i Barbuda": "Antigua & Barbuda",
 "Angvila": "Anguilla",
 "Albanija": "Albania",
 "Armenija": "Armenia",
 "Curaçao": "Curaçao",
 "Angola": "Angola",
 "Antarktika": "Antarctica",
 "Argentina": "Argentina",
 "Američka Samoa": "American Samoa",
 "Austrija": "Austria",
 "Australija": "Australia",
 "Aruba": "Aruba",
 "Ålandski otoci": "Åland Islands",
 "Azerbajdžan": "Azerbaijan",
 "Bosna i Hercegovina": "Bosnia & Herzegovina",
 "Barbados": "Barbados",
 "Bangladeš": "Bangladesh",
 "Belgija": "Belgium",
 "Burkina Faso": "Burkina Faso",
 "Bugarska": "Bulgaria",
 "Bahrein": "Bahrain",
 "Burundi": "Burundi",
 "Benin": "Benin",
 "Saint Barthélemy": "St. Barthélemy",
 "Bermudi": "Bermuda",
 "Brunej": "Brunei",
 "Bolivija": "Bolivia",
 "Karipski otoci Nizozemske": "Caribbean Netherlands",
 "Brazil": "Brazil",
 "Bahami": "Bahamas",
 "Butan": "Bhutan",
 "Mjanmar (Burma)": "Myanmar (Burma)",
 "Otok Bouvet": "Bouvet Island",
 "Bocvana": "Botswana",
 "Bjelorusija": "Belarus",
 "Belize": "Belize",
 "Kanada": "Canada",
 "Kokosovi (Keelingovi) Otoci": "Cocos (Keeling) Islands",
 "Kongo - Kinshasa": "Congo - Kinshasa",
 "Srednjoafrička Republika": "Central African Republic",
 "Kongo - Brazzaville": "Congo - Brazzaville",
 "Švicarska": "Switzerland",
 "Obala Bjelokosti": "Côte d’Ivoire",
 "Cookovi Otoci": "Cook Islands",
 "Čile": "Chile",
 "Kamerun": "Cameroon",
 "Kina": "China",
 "Kolumbija": "Colombia",
 "Otok Clipperton": "Clipperton Island",
 "Sark": "Sark",
 "Kostarika": "Costa Rica",
 "Srbija": "Serbia",
 "Kuba": "Cuba",
 "Zelenortska Republika": "Cape Verde",
 "Božićni Otok": "Christmas Island",
 "Cipar": "Cyprus",
 "Češka": "Czechia",
 "Njemačka": "Germany",
 "Diego Garcia": "Diego Garcia",
 "Džibuti": "Djibouti",
 "Danska": "Denmark",
 "Dominika": "Dominica",
 "Dominikanska Republika": "Dominican Republic",
 "Alžir": "Algeria",
 "Ceuta i Melilla": "Ceuta & Melilla",
 "Ekvador": "Ecuador",
 "Estonija": "Estonia",
 "Egipat": "Egypt",
 "Zapadna Sahara": "Western Sahara",
 "Eritreja": "Eritrea",
 "Španjolska": "Spain",
 "Etiopija": "Ethiopia",
 "Europska unija": "European Union",
 "eurozona": "Eurozone",
 "Finska": "Finland",
 "Fidži": "Fiji",
 "Falklandski Otoci": "Falkland Islands",
 "Mikronezija": "Micronesia",
 "Farski Otoci": "Faroe Islands",
 "Francuska": "France",
 "Gabon": "Gabon",
 "Ujedinjeno Kraljevstvo": "United Kingdom",
 "Grenada": "Grenada",
 "Gruzija": "Georgia",
 "Francuska Gijana": "French Guiana",
 "Guernsey": "Guernsey",
 "Gana": "Ghana",
 "Gibraltar": "Gibraltar",
 "Grenland": "Greenland",
 "Gambija": "Gambia",
 "Gvineja": "Guinea",
 "Guadalupe": "Guadeloupe",
 "Ekvatorska Gvineja": "Equatorial Guinea",
 "Grčka": "Greece",
 "Južna Georgia i Otoci Južni Sandwich": "South Georgia & South Sandwich Islands",
 "Gvatemala": "Guatemala",
 "Guam": "Guam",
 "Gvineja Bisau": "Guinea-Bissau",
 "Gvajana": "Guyana",
 "PUP Hong Kong Kina": "Hong Kong SAR China",
 "Otoci Heard i McDonald": "Heard & McDonald Islands",
 "Honduras": "Honduras",
 "Hrvatska": "Croatia",
 "Haiti": "Haiti",
 "Mađarska": "Hungary",
 "Kanari": "Canary Islands",
 "Indonezija": "Indonesia",
 "Irska": "Ireland",
 "Izrael": "Israel",
 "Otok Man": "Isle of Man",
 "Indija": "India",
 "Britanski Indijskooceanski Teritorij": "British Indian Ocean Territory",
 "Irak": "Iraq",
 "Iran": "Iran",
 "Island": "Iceland",
 "Italija": "Italy",
 "Jersey": "Jersey",
 "Jamajka": "Jamaica",
 "Jordan": "Jordan",
 "Japan": "Japan",
 "Kenija": "Kenya",
 "Kirgistan": "Kyrgyzstan",
 "Kambodža": "Cambodia",
 "Kiribati": "Kiribati",
 "Komori": "Comoros",
 "Sveti Kristofor i Nevis": "St. Kitts & Nevis",
 "Sjeverna Koreja": "North Korea",
 "Južna Koreja": "South Korea",
 "Kuvajt": "Kuwait",
 "Kajmanski Otoci": "Cayman Islands",
 "Kazahstan": "Kazakhstan",
 "Laos": "Laos",
 "Libanon": "Lebanon",
 "Sveta Lucija": "St. Lucia",
 "Lihtenštajn": "Liechtenstein",
 "Šri Lanka": "Sri Lanka",
 "Liberija": "Liberia",
 "Lesoto": "Lesotho",
 "Litva": "Lithuania",
 "Luksemburg": "Luxembourg",
 "Latvija": "Latvia",
 "Libija": "Libya",
 "Maroko": "Morocco",
 "Monako": "Monaco",
 "Moldavija": "Moldova",
 "Crna Gora": "Montenegro",
 "Saint Martin": "St. Martin",
 "Madagaskar": "Madagascar",
 "Maršalovi Otoci": "Marshall Islands",
 "Sjeverna Makedonija": "North Macedonia",
 "Mali": "Mali",
 "Mongolija": "Mongolia",
 "PUP Makao Kina": "Macao SAR China",
 "Sjevernomarijanski Otoci": "Northern Mariana Islands",
 "Martinik": "Martinique",
 "Mauretanija": "Mauritania",
 "Montserrat": "Montserrat",
 "Malta": "Malta",
 "Mauricijus": "Mauritius",
 "Maldivi": "Maldives",
 "Malavi": "Malawi",
 "Meksiko": "Mexico",
 "Malezija": "Malaysia",
 "Mozambik": "Mozambique",
 "Namibija": "Namibia",
 "Nova Kaledonija": "New Caledonia",
 "Niger": "Niger",
 "Otok Norfolk": "Norfolk Island",
 "Nigerija": "Nigeria",
 "Vanuatu": "Vanuatu",
 "Nikaragva": "Nicaragua",
 "Nizozemska": "Netherlands",
 "Norveška": "Norway",
 "Nepal": "Nepal",
 "Nauru": "Nauru",
 "Niue": "Niue",
 "Novi Zeland": "New Zealand",
 "Oman": "Oman",
 "Panama": "Panama",
 "Peru": "Peru",
 "Francuska Polinezija": "French Polynesia",
 "Papua Nova Gvineja": "Papua New Guinea",
 "Filipini": "Philippines",
 "Pakistan": "Pakistan",
 "Poljska": "Poland",
 "Sveti Petar i Mikelon": "St. Pierre & Miquelon",
 "Pitcairnovi Otoci": "Pitcairn Islands",
 "Portoriko": "Puerto Rico",
 "Palestinsko područje": "Palestinian Territories",
 "Portugal": "Portugal",
 "Palau": "Palau",
 "Paragvaj": "Paraguay",
 "Katar": "Qatar",
 "Vanjska područja Oceanije": "Outlying Oceania",
 "Réunion": "Réunion",
 "Zimbabve": "Zimbabwe",
 "Rumunjska": "Romania",
 "Rusija": "Russia",
 "Ruanda": "Rwanda",
 "Saudijska Arabija": "Saudi Arabia",
 "Salomonovi Otoci": "Solomon Islands",
 "Sejšeli": "Seychelles",
 "Sudan": "Sudan",
 "Švedska": "Sweden",
 "Singapur": "Singapore",
 "Sveta Helena": "St. Helena",
 "Slovenija": "Slovenia",
 "Svalbard i Jan Mayen": "Svalbard & Jan Mayen",
 "Slovačka": "Slovakia",
 "Sijera Leone": "Sierra Leone",
 "San Marino": "San Marino",
 "Senegal": "Senegal",
 "Somalija": "Somalia",
 "Surinam": "Suriname",
 "Južni Sudan": "South Sudan",
 "Sveti Toma i Princip": "São Tomé & Príncipe",
 "Salvador": "El Salvador",
 "Sint Maarten": "Sint Maarten",
 "Sirija": "Syria",
 "Esvatini": "Eswatini",
 "Tristan da Cunha": "Tristan da Cunha",
 "Otoci Turks i Caicos": "Turks & Caicos Islands",
 "Čad": "Chad",
 "Francuski Južni Teritoriji": "French Southern Territories",
 "Togo": "Togo",
 "Tajland": "Thailand",
 "Tadžikistan": "Tajikistan",
 "Tokelau": "Tokelau",
 "Timor-Leste": "Timor-Leste",
 "Turkmenistan": "Turkmenistan",
 "Tunis": "Tunisia",
 "Tonga": "Tonga",
 "Turska": "Türkiye",
 "Trinidad i Tobago": "Trinidad & Tobago",
 "Tuvalu": "Tuvalu",
 "Tajvan": "Taiwan",
 "Tanzanija": "Tanzania",
 "Ukrajina": "Ukraine",
 "Uganda": "Uganda",
 "Mali udaljeni otoci SAD-a": "U.S. Outlying Islands",
 "Ujedinjeni narodi": "United Nations",
 "Sjedinjene Američke Države": "United States",
 "Urugvaj": "Uruguay",
 "Uzbekistan": "Uzbekistan",
 "Vatikan": "Vatican City",
 "Sveti Vincent i Grenadini": "St. Vincent & Grenadines",
 "Vijetnam": "Vietnam",
 "Venezuela": "Venezuela",
 "Britanski Djevičanski Otoci": "British Virgin Islands",
 "Američki Djevičanski Otoci": "U.S. Virgin Islands",
 "Wallis i Futuna": "Wallis & Futuna",
 "Samoa": "Samoa",
 "pseudo naglasci": "Pseudo-Accents",
 "pseudo bidi": "Pseudo-Bidi",
 "Kosovo": "Kosovo",
 "Jemen": "Yemen",
 "Mayotte": "Mayotte",
 "Južnoafrička Republika": "South Africa",
 "Zambija": "Zambia",
 "nepoznato područje": "Unknown Region"
};
const EN_CTRY = ["Afghanistan", "Albania", "Algeria", "American Samoa", "Andorra", "Angola", "Anguilla", "Antarctica", "Antigua & Barbuda", "Argentina", "Armenia", "Aruba", "Ascension Island", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bermuda", "Bhutan", "Bolivia", "Bosnia & Herzegovina", "Botswana", "Bouvet Island", "Brazil", "British Indian Ocean Territory", "British Virgin Islands", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada", "Canary Islands", "Cape Verde", "Caribbean Netherlands", "Cayman Islands", "Central African Republic", "Ceuta & Melilla", "Chad", "Chile", "China", "Christmas Island", "Clipperton Island", "Cocos (Keeling) Islands", "Colombia", "Comoros", "Congo - Brazzaville", "Congo - Kinshasa", "Cook Islands", "Costa Rica", "Croatia", "Cuba", "Curaçao", "Cyprus", "Czechia", "Côte d’Ivoire", "Denmark", "Diego Garcia", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "European Union", "Eurozone", "Falkland Islands", "Faroe Islands", "Fiji", "Finland", "France", "French Guiana", "French Polynesia", "French Southern Territories", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Gibraltar", "Greece", "Greenland", "Grenada", "Guadeloupe", "Guam", "Guatemala", "Guernsey", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Heard & McDonald Islands", "Honduras", "Hong Kong SAR China", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Isle of Man", "Israel", "Italy", "Jamaica", "Japan", "Jersey", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Macao SAR China", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Martinique", "Mauritania", "Mauritius", "Mayotte", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Montserrat", "Morocco", "Mozambique", "Myanmar (Burma)", "Namibia", "Nauru", "Nepal", "Netherlands", "New Caledonia", "New Zealand", "Nicaragua", "Niger", "Nigeria", "Niue", "Norfolk Island", "North Korea", "North Macedonia", "Northern Mariana Islands", "Norway", "Oman", "Outlying Oceania", "Pakistan", "Palau", "Palestinian Territories", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Pitcairn Islands", "Poland", "Portugal", "Pseudo-Accents", "Pseudo-Bidi", "Puerto Rico", "Qatar", "Romania", "Russia", "Rwanda", "Réunion", "Samoa", "San Marino", "Sark", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Sint Maarten", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Georgia & South Sandwich Islands", "South Korea", "South Sudan", "Spain", "Sri Lanka", "St. Barthélemy", "St. Helena", "St. Kitts & Nevis", "St. Lucia", "St. Martin", "St. Pierre & Miquelon", "St. Vincent & Grenadines", "Sudan", "Suriname", "Svalbard & Jan Mayen", "Sweden", "Switzerland", "Syria", "São Tomé & Príncipe", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tokelau", "Tonga", "Trinidad & Tobago", "Tristan da Cunha", "Tunisia", "Turkmenistan", "Turks & Caicos Islands", "Tuvalu", "Türkiye", "U.S. Outlying Islands", "U.S. Virgin Islands", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United Nations", "United States", "Unknown Region", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Wallis & Futuna", "Western Sahara", "Yemen", "Zambia", "Zimbabwe", "Åland Islands"];
const EN_DICT = {
"Preskoči na sadržaj": "Skip to content",
"Izbornik": "Menu",
"Zatvori izbornik": "Close menu",
"Erasmus+ Kompas, početna stranica": "Erasmus+ Kompas, home page",
"Erasmus+ Kompas": "Erasmus+ Kompas",
"Atlas KA{N} partnerstava": "Atlas of KA{N1} partnerships",
"Jezik": "Language",
"Glavna navigacija": "Main navigation",
"Početna": "Home",
"Istraži": "Explore",
"Pregled": "Overview",
"Županije": "Counties",
"Teme i metode": "Topics and methods",
"Pretraži": "Search",
"Projekti i organizacije": "Projects and organisations",
"Pitajte": "Ask",
"Asistent": "Assistant",
"Informacije": "Information",
"O podacima": "About the data",
"Imate pitanje?": "Have a question?",
"Asistent odgovara samo iz podataka atlasa i uz odgovor navodi izvore.": "The assistant answers only from the atlas data and cites its sources.",
"Pitaj asistenta": "Ask the assistant",
"Neovisni projekt otvorenih podataka. Nije službena stranica Europske komisije.": "An independent open-data project. Not an official European Commission website.",
"Otvori asistenta": "Open the assistant",
"Erasmus+ KA{N} partnerstva · {N}–{N}": "Erasmus+ KA{N1} partnerships · {N2}–{N3}",
"Gdje i s kim {E} surađuje kroz Erasmus+": "Where and with whom {E1} cooperates through Erasmus+",
"Otvoreni podaci o {N} partnerstava s hrvatskim sudionicima: tko ih koordinira, u kojim se županijama provode, s kojim državama i o kojim temama.": "Open data on {N1} partnerships with Croatian participants: who coordinates them, in which counties they take place, with which countries and on which topics.",
"Pretraži atlas": "Search the atlas",
"Pretraži županije, organizacije, projekte…": "Search counties, organisations, projects…",
"Prečaci": "Shortcuts",
"Karta županija": "County map",
"Pokrivenost škola": "School coverage",
"Partnerske države": "Partner countries",
"Projekti": "Projects",
"Otvori pregled": "Open overview",
"Ažurirano": "Updated",
" · {N} organizacija · {N} županija": " · {N1} organisations · {N2} counties",
"· {N} organizacija · {N} županija": "· {N1} organisations · {N2} counties",
"{E} u brojkama": "{E1} in numbers",
"Ključni pokazatelji za odabrano programsko razdoblje.": "Key indicators for the selected programme period.",
"Razdoblje": "Period",
"Projekata": "Projects",
"KA{N} s hrvatskim sudionikom": "KA{N1} with Croatian participants",
"Koordinirano": "Coordinated",
"{N}% projekata": "{N1}% of projects",
"Vrijednost": "Value",
"svih tih projekata": "across all these projects",
"Udio u EU": "Share of the EU",
"od {N} KA{N} projekata": "of {N1} KA{N2} projects",
"Kroz godine": "Over the years",
"Koliko je KA{N} projekata s hrvatskim sudionikom odabrano po godini poziva.": "How many KA{N1} projects with a Croatian participant were selected per call year.",
"Podjela po sektoru i vrsti →": "Breakdown by sector and type →",
"Projekti po godini poziva": "Projects by call year",
"{N}: {N} (godina još traje)": "{N1}: {N2} (year still in progress)",
"novi program od {N}.": "new programme since {N1}",
"godina s najviše projekata: {N}": "year with the most projects: {N1}",
"projekata u programu {N}–{N} i dosad u programu {N}–{N}": "projects in the {N1}–{N2} programme and so far in the {N3}–{N4} programme",
"svih KA{N} projekata u EU ima hrvatskog partnera": "of all KA{N1} projects in the EU have a Croatian partner",
"Županije s najviše projekata": "Counties with the most projects",
"KA{N} projekti sa sudionikom iz županije, {N}–{N}": "KA{N1} projects with a participant from the county, {N2}–{N3}",
"{N} od {N} županije": "{N1} of {N2} counties",
"Karta i cijeli poredak →": "Map and full ranking →",
"Tko koordinira iz Hrvatske": "Who coordinates from Croatia",
"Koordinirani projekti po vrsti organizacije ({N} ukupno).": "Coordinated projects by organisation type ({N1} in total).",
"Pregled s filtrima →": "Overview with filters →",
"S kojim državama surađujemo": "Which countries we work with",
"Broj zajedničkih projekata s organizacijama iz države.": "Number of joint projects with organisations from the country.",
"Sve države →": "All countries →",
"Što možete saznati": "What you can find out",
"Svaki odjeljak odgovara na jedno praktično pitanje.": "Each section answers one practical question.",
"Koliko ima projekata i tko ih koordinira?": "How many projects are there and who coordinates them?",
"Brojke, godišnji graf i poredak uz filtre.": "Figures, annual chart and ranking with filters.",
"{N} projekata →": "{N1} projects →",
"Gdje je aktivnost najgušća?": "Where is activity densest?",
"Interaktivna karta i poredak županija.": "Interactive map and county ranking.",
"Najviše: {E}, {N} →": "Most: {E1}, {N1} →",
"Sudjeluje li dovoljno škola u mojoj županiji?": "Do enough schools take part in my county?",
"Udio škola koje sudjeluju u KA{N} projektima.": "Share of schools taking part in KA{N1} projects.",
"{N}% škola na razini države →": "{N1}% of schools nationwide →",
"S kim {E} surađuje?": "Who does {E1} work with?",
"Države s kojima dijelimo projekte.": "Countries we share projects with.",
"{N} država, najčešće {E} →": "{N1} countries, most often {E1} →",
"Raste li broj projekata?": "Is the number of projects growing?",
"Po godinama, sektoru i vrsti projekta.": "By year, sector and project type.",
"Vrhunac {N}.: {N} projekata →": "Peak in {N1}: {N2} projects →",
"Koji projekti postoje u mom sektoru?": "Which projects exist in my sector?",
"Pretraga po temi, sektoru, državi i statusu.": "Search by topic, sector, country and status.",
"{N} projekata u popisu →": "{N1} projects in the list →",
"Tko sve sudjeluje?": "Who takes part?",
"Pretraga po nazivu, mjestu i županiji.": "Search by name, place and county.",
"{N} organizacija →": "{N1} organisations →",
"Koje se teme šire, a koje nestaju?": "Which topics are spreading and which are fading?",
"Teme kroz vrijeme, pristupi i mreža pojmova.": "Topics over time, approaches and the concept network.",
"{N} tema, {N} pojmova →": "{N1} topics, {N2} concepts →",
"Kako se razlikuju dvije županije?": "How do two counties differ?",
"Do četiri županije jedna uz drugu.": "Up to four counties side by side.",
"Pet pokazatelja odjednom →": "Five indicators at once →",
"Imate pitanje o podacima?": "Have a question about the data?",
"Poseban asistent odgovara na pitanja o projektima, organizacijama, županijama i temama. Odgovara samo iz podataka atlasa i uz svaki odgovor navodi izvor.": "A dedicated assistant answers questions about projects, organisations, counties and topics. It answers only from the atlas data and cites a source with every answer.",
"Pitanje": "Question",
"Npr. Koje županije imaju najviše projekata?": "E.g. Which counties have the most projects?",
"Pitaj": "Ask",
"Koje županije imaju najviše projekata?": "Which counties have the most projects?",
"Tko koordinira najviše projekata?": "Who coordinates the most projects?",
"S kojim državama {E} surađuje?": "Which countries does {E1} work with?",
"Izvori:": "Sources:",
"Stranica županije": "County page",
"Usporedba županija": "Compare counties",
"Odakle podaci": "Where the data comes from",
"Svi izvori su javni. Atlas ih povezuje i izračunava pokazatelje, ništa se ne unosi ručno.": "All sources are public. The atlas links them and calculates the indicators; nothing is entered by hand.",
"Izvori i ograničenja →": "Sources and limitations →",
"Erasmus+ Project Results Platform": "Erasmus+ Project Results Platform",
"Europska komisija": "European Commission",
"KA{N} projekti {N}–{N} i {N}–{N}: naslovi, vrste, države i iznosi.": "KA{N1} projects {N2}–{N3} and {N4}–{N5}: titles, types, countries and amounts.",
"Portal otvorenih podataka": "Open Data Portal",
"Agencija za mobilnost i programe EU": "Agency for Mobility and EU Programmes",
"Hrvatski sudionici i organizacije u projektima.": "Croatian participants and organisations in projects.",
"Registri škola": "School registers",
"Popis škola po županijama, za izračun pokrivenosti.": "List of schools by county, used to calculate coverage.",
"Kompas asistent": "Kompas assistant",
"Odgovara samo iz podataka atlasa": "Answers only from the atlas data",
"Novi razgovor": "New conversation",
"Otvori na cijeloj stranici": "Open full page",
"Zatvori asistenta": "Close the assistant",
"Zatvori": "Close",
"Gledate:": "You are viewing:",
"Što vas zanima?": "What would you like to know?",
"Odgovaram na pitanja o projektima, organizacijama, županijama, državama i temama. Brojke računam iz podataka atlasa i uz odgovor navodim izvor.": "I answer questions about projects, organisations, counties, countries and topics. I calculate the figures from the atlas data and cite the source with each answer.",
"Koje su teme najčešće?": "Which topics are the most common?",
"Pitanje asistentu": "Question for the assistant",
"Pošalji": "Send",
"Asistent može pogriješiti. Provjerite izvore ispod odgovora.": "The assistant can make mistakes. Check the sources below the answer.",
"Atlas sudjelovanja Hrvatske u Erasmus+ KA{N} partnerstvima: tko ih koordinira, gdje se provode i koje teme biraju.": "Atlas of Croatia's participation in Erasmus+ KA{N1} partnerships: who coordinates them, where they take place and which topics they choose.",
"Izvori podataka": "Data sources",
"Europska komisija. KA{N} projekti {N}–{N} i {N}–{N}": "European Commission. KA{N1} projects {N2}–{N3} and {N4}–{N5}",
"Portal otvorenih podataka (data.gov.hr)": "Open Data Portal (data.gov.hr)",
"Agencija za mobilnost i programe EU. Hrvatski sudionici i organizacije.": "Agency for Mobility and EU Programmes. Croatian participants and organisations.",
"Registri škola, za izračun pokrivenosti po županijama.": "School registers, used to calculate coverage by county.",
"Obuhvat": "Scope",
"KA{N} partnerstva. KA{N} mobilnosti nisu uključene.": "KA{N1} partnerships. KA{N2} mobility is not included.",
"Izračun": "Calculation",
"Udjeli škola su procjene jer se sudionici s registrom škola povezuju prema nazivu i poštanskom broju.": "School shares are estimates because participants are matched to the school register by name and postcode.",
"Atlas": "Atlas",
"Rječnik pojmova": "Glossary",
"Preuzimanje podataka": "Data download",
"Pristupačnost": "Accessibility",
"Kontakt": "Contact",
"Mapa stranice": "Site map",
"Izvorni kod (GitHub)": "Source code (GitHub)",
"Brojke su preuzete iz navedenih javnih izvora i izračunate u ovom projektu. Ovo je neovisan projekt i nije službena stranica Europske komisije ni Agencije za mobilnost i programe EU. Prototip sučelja: karta županija je shematska.": "The figures are taken from the public sources listed and calculated in this project. This is an independent project and not an official website of the European Commission or the Agency for Mobility and EU Programmes. Interface prototype: the county map is schematic.",
"Tražim u podacima…": "Searching the data…",
"Brojke, godišnji graf i poredak uz filtre": "Figures, annual chart and ranking with filters",
"S kojim državama {E} najviše surađuje": "Which countries {E1} works with most",
"Interaktivna karta i poredak županija": "Interactive map and county ranking",
"Udio škola koje sudjeluju, po županijama": "Share of participating schools, by county",
"Pretraga projekata po temi, sektoru i državi": "Search projects by topic, sector and country",
"Pitanja običnim jezikom, odgovori uz izvore": "Plain-language questions, answers with sources",
"Svi projekti za „": "All projects for “",
"Pitaj asistenta: „": "Ask the assistant: “",
"otvori popis s filterom": "open the list with the filter",
"odgovor iz podataka atlasa": "answer from the atlas data",
"Putanja": "Breadcrumb",
"Odjeljci": "Sections",
"Kroz vrijeme": "Over time",
"Istraži · Pregled": "Explore · Overview",
"Sudjelovanje Hrvatske u Erasmus+ KA{N} partnerstvima": "Croatia's participation in Erasmus+ KA{N1} partnerships",
"Koliko ima projekata, tko ih koordinira i gdje su. Suzite prikaz razdobljem, sektorom, vrstom projekta ili županijom.": "How many projects there are, who coordinates them and where they are. Narrow the view by period, sector, project type or county.",
"Filteri": "Filters",
"Sektor": "Sector",
"Svi sektori": "All sectors",
"Vrsta projekta": "Project type",
"Sve vrste": "All types",
"Županija": "County",
"Sve županije": "All counties",
"Pretraži popis…": "Search the list…",
"Pretraži popis": "Search the list",
"Nema rezultata.": "No results.",
"Poništi filtre": "Reset filters",
"Prikaži rezultate": "Show results",
"Izvoz podataka": "Export data",
"{N} redaka prema trenutnim filterima": "{N1} rows matching the current filters",
"CSV": "CSV",
"Za analizu i uvoz u druge alate": "For analysis and import into other tools",
"Excel": "Excel",
"Tablica za izvješća (.xlsx)": "Spreadsheet for reports (.xlsx)",
"PDF": "PDF",
"Pregledno izvješće za ispis": "Clear report for printing",
"projekata": "projects",
"KA{N} projekata s hrvatskim sudionikom": "KA{N1} projects with Croatian participants",
"svih KA{N} projekata u EU ({N})": "all KA{N1} projects in the EU ({N2})",
"Koordinirano iz Hrvatske": "Coordinated from Croatia",
"{N}% tih projekata": "{N1}% of those projects",
"Vrijednost tih projekata": "Value of those projects",
"Broj KA{N} projekata s hrvatskim sudionikom po godini poziva. Prazan stupac označava godinu koja još traje.": "Number of KA{N1} projects with Croatian participants per call year. An empty column marks a year still in progress.",
"Projekti koje koordiniraju hrvatske organizacije, po vrsti organizacije.": "Projects coordinated by Croatian organisations, by organisation type.",
"Županije po broju projekata": "Counties by number of projects",
"Projekti u kojima sudjeluje barem jedna organizacija iz županije. Kliknite županiju za filtriranje.": "Projects with at least one organisation from the county. Click a county to filter.",
"Prikaži svih {N}": "Show all {N1}",
"Otvori kartu županija →": "Open the county map →",
"Koliko je projekata koordinirano iz Hrvatske?": "How many projects were coordinated from Croatia?",
"Kolika je ukupna vrijednost projekata?": "What is the total value of the projects?",
"Koji sektor ima najviše projekata?": "Which sector has the most projects?",
"Vrijednost svih projekata u kojima sudjeluje": "Value of all projects it takes part in",
"Nije dostupno uz odabrani sektor ili vrstu projekta": "Not available with the selected sector or project type",
"Ukloni filter: {E}": "Remove filter: {E1}",
"Ukloni filter": "Remove filter",
"{N}% svih hrvatskih KA{N} projekata": "{N1}% of all Croatian KA{N2} projects",
"Nije dostupno po sektoru ili vrsti projekta": "Not available by sector or project type",
"Raspodjela po vrsti organizacije dostupna je samo za cijelu Hrvatsku. Poništite filtre županije, sektora i vrste projekta da je vidite.": "The breakdown by organisation type is available only for Croatia as a whole. Reset the county, sector and project type filters to see it.",
"Podjela po županijama nije dostupna uz sektor ili vrstu projekta.": "The breakdown by county is not available with a sector or project type.",
"{E}: sudjelovanje u Erasmus+ KA{N} partnerstvima": "{E1}: participation in Erasmus+ KA{N1} partnerships",
"Nije dostupno uz odabranu županiju": "Not available with the selected county",
"KA{N} projekata s sudionikom iz županije": "KA{N1} projects with a participant from the county",
"{N} organizacija sudjeluje": "{N1} organisations take part",
"Godišnji prikaz trenutno je dostupan samo za cijelu Hrvatsku. Poništite filter županije.": "The annual view is currently available only for Croatia as a whole. Reset the county filter.",
"Prikaži samo prvih {N}": "Show only the first {N1}",
"Istraži · Kroz vrijeme": "Explore · Over time",
"Kako se broj projekata mijenjao": "How the number of projects has changed",
"Broj KA{N} projekata s hrvatskim sudionikom po godini poziva, podijeljen po sektoru ili vrsti projekta. Godina {N}. još traje.": "Number of KA{N1} projects with Croatian participants per call year, split by sector or project type. The year {N2} is still in progress.",
"Podijeli po": "Split by",
"Sektoru": "Sector",
"Vrsti projekta": "Project type",
"Svaki stupac je jedna godina; boje su dijelovi po odabranoj podjeli.": "Each column is one year; the colours are the parts of the chosen breakdown.",
"Projekti po godini i sektoru": "Projects by year and sector",
"Udio po sektoru": "Share by sector",
"Ukupno {N}–{N}": "Total {N1}–{N2}",
"Što se uočava": "What stands out",
"najzastupljeniji ({N}% svih projekata)": "most common ({N1}% of all projects)",
"Tablica podataka": "Data table",
"Godina": "Year",
"Ukupno": "Total",
"Projekti po godini i vrsti projekta": "Projects by year and project type",
"Udio po vrsti projekta": "Share by project type",
"Istraži · Partnerske države": "Explore · Partner countries",
"S kojim državama {E} surađuje": "Which countries {E1} works with",
"Države čije su organizacije partneri u istim KA{N} projektima kao i hrvatske organizacije. Brojimo projekte, a ne organizacije.": "Countries whose organisations are partners in the same KA{N1} projects as Croatian organisations. We count projects, not organisations.",
"Država": "Country",
"Npr. {E}…": "E.g. {E1}…",
"Zajednički projekti po državi": "Joint projects by country",
"{N} država. Brojke su projekti s hrvatskim sudionikom u kojima sudjeluje i organizacija iz navedene države.": "{N1} countries. The figures are projects with a Croatian participant in which an organisation from the named country also takes part.",
"Prikaži još ({N})": "Show more ({N1})",
"{E} među državama": "{E1} among countries",
"Projekti koje su koordinirale organizacije iz države, {N}–{N} (prvih {N} država).": "Projects coordinated by organisations from the country, {N1}–{N2} (top {N3} countries).",
"Nema redaka za izvoz": "No rows to export",
"Nijedna država ne odgovara pretrazi.": "No country matches the search.",
"Prikaži još (-{N})": "Show more (-{N1})",
"Usporedba": "Comparison",
"Istraži · Županije": "Explore · Counties",
"Županije u KA{N} partnerstvima": "Counties in KA{N1} partnerships",
"Gdje su organizacije i projekti. Odaberite županiju na karti ili u poretku da vidite njezine brojke i najaktivnije organizacije.": "Where the organisations and projects are. Select a county on the map or in the ranking to see its figures and most active organisations.",
"Prikaži": "Show",
"Karta županija. Odaberite županiju za pojedinosti.": "County map. Select a county for details.",
"Zadržite pokazivač ili odaberite županiju na karti": "Hover over or select a county on the map",
"do {N}": "up to {N1}",
"više od {N}": "more than {N1}",
"Poredak županija": "County ranking",
"Projekti, {N}–{N} Redak se može odabrati.": "Projects, {N1}–{N2}. A row can be selected.",
"Otvori stranicu županije": "Open county page",
"Koliko projekata ima {E}?": "How many projects does {E1} have?",
"Koje županije imaju najbolju pokrivenost škola?": "Which counties have the best school coverage?",
"Koordinirano, {N}–{N} Redak se može odabrati.": "Coordinated, {N1}–{N2}. A row can be selected.",
"Organizacije, {N}–{N} Redak se može odabrati.": "Organisations, {N1}–{N2}. A row can be selected.",
"Brojevi na karti su milijuni eura.": "The numbers on the map are millions of euros.",
"Vrijednost, {N}–{N} Redak se može odabrati.": "Value, {N1}–{N2}. A row can be selected.",
"{N} projekata, od toga {N} koordiniranih. {N} organizacija. Po odabranom prikazu je {N}. od {N} županija.": "{N1} projects, of which {N2} coordinated. {N3} organisations. In the selected view it ranks {N4} of {N5} counties.",
"Županije · Usporedba": "Counties · Comparison",
"Odaberite do četiri županije i usporedite ih po broju projekata, koordinacijama, organizacijama, vrijednosti i pokrivenosti škola.": "Select up to four counties and compare them by number of projects, coordinations, organisations, value and school coverage.",
"Odabir županija": "Choose counties",
"Dodaj županiju": "Add a county",
"Odaberite županiju…": "Choose a county…",
"Odabrano (najviše {N})": "Selected (up to {N1})",
"Ukloni: {E}": "Remove: {E1}",
"Projekti sa sudionikom iz županije": "Projects with a participant from the county",
"Broj KA{N} projekata u kojima sudjeluje barem jedna organizacija iz županije.": "Number of KA{N1} projects with at least one organisation from the county.",
"Koordinirani projekti": "Coordinated projects",
"Projekti koje je koordinirala organizacija iz županije.": "Projects coordinated by an organisation from the county.",
"Broj različitih organizacija iz županije u projektima.": "Number of distinct organisations from the county in projects.",
"Vrijednost projekata": "Project value",
"Ukupna vrijednost projekata sa sudionikom iz županije.": "Total value of projects with a participant from the county.",
"Pokrivenost osnovnih i srednjih škola": "Coverage of primary and secondary schools",
"Udio škola koje su sudjelovale u barem jednom projektu.": "Share of schools that took part in at least one project.",
"Usporedna tablica": "Comparison table",
"Pokazatelj": "Indicator",
"Najviše četiri županije": "Up to four counties",
"Županije · Pokrivenost škola": "Counties · School coverage",
"Koje škole sudjeluju?": "Which schools take part?",
"Udio osnovnih i srednjih škola u svakoj županiji koje su sudjelovale u barem jednom KA{N} partnerstvu, kao koordinator ili partner.": "Share of primary and secondary schools in each county that took part in at least one KA{N1} partnership, as coordinator or partner.",
"Ustanove": "Institutions",
"Osnovne + srednje": "Primary + secondary",
"Osnovne": "Primary",
"Srednje": "Secondary",
"Vrtići": "Kindergartens",
"Uloga": "Role",
"Bilo koja": "Any",
"Koordinator": "Coordinator",
"{N} od {N} ustanova na razini države sudjelovalo je u KA{N} projektima": "{N1} of {N2} institutions nationwide have taken part in KA{N3} projects",
"Boja je udio škola koje sudjeluju. Zagreb je uvećan u kutu. Odaberite županiju za pojedinosti.": "The colour shows the share of participating schools. Zagreb is enlarged in the corner. Select a county for details.",
"do {N}%": "up to {N1}%",
"više od {N}%": "more than {N1}%",
"Udio škola po županiji": "Share of schools by county",
"Koliki dio škola u županiji sudjeluje u KA{N} projektima. Redak se može odabrati.": "What share of schools in the county take part in KA{N1} projects. A row can be selected.",
"{N} od {N}": "{N1} of {N2}",
"Metoda: sudionici KA{N} povezani su s registrom škola prema nazivu i poštanskom broju; to je procjena dok se podudaranja ne pregledaju. Udjeli su procjene. KA{N} mobilnost nije uključena.": "Method: KA{N1} participants are matched to the school register by name and postcode; this is an estimate until the matches are reviewed. Shares are estimates. KA{N2} mobility is not included.",
"{N} od {N} škola sudjelovalo je u KA{N} projektima ({N}%). Državni prosjek je {N}%.": "{N1} of {N2} schools took part in KA{N3} projects ({N4}%). The national average is {N5}%.",
"Županija · {N}. od {N} po broju projekata": "County · {N1} of {N2} by number of projects",
"Sudjelovanje organizacija iz županije u KA{N} partnerstvima, {N}–{N}": "Participation of organisations from the county in KA{N1} partnerships, {N2}–{N3}",
"Organizacija": "Organisation",
"{N} + {N} po razdobljima": "{N1} + {N2} by period",
"Projekata sa sudionikom": "Projects with a participant",
"Grantovi: €{N}M": "Grants: €{N1}M",
"svih projekata sa sudionikom": "of all projects with a participant",
"Najaktivnije organizacije": "Most active organisations",
"Po broju KA{N} projekata. Odaberite organizaciju za pojedinosti.": "By number of KA{N1} projects. Select an organisation for details.",
"{N} koord.": "{N1} coord.",
"Sve organizacije u županiji →": "All organisations in the county →",
"Pokrivenost po vrsti škole": "Coverage by school type",
"Udio škola u županiji koje su sudjelovale u KA{N} projektima.": "Share of schools in the county that took part in KA{N1} projects.",
"Osnovne i srednje škole": "Primary and secondary schools",
"Srednje škole": "Secondary schools",
"Položaj": "Location",
"Položaj županije na karti Hrvatske": "Location of the county on the map of Croatia",
"Karta županija →": "County map →",
"Po razdobljima": "By period",
"Projekti sa sudionikom iz županije.": "Projects with a participant from the county.",
"Koordinirani projekti.": "Coordinated projects.",
"Usporedite s drugim županijama": "Compare with other counties",
"Postavite ovu županiju uz druge po svim pokazateljima.": "Place this county next to others across all indicators.",
"Otvori usporedbu": "Open comparison",
"Teme kroz vrijeme": "Topics over time",
"Pristupi i ciljne skupine": "Approaches and target groups",
"Mreža pojmova": "Concept network",
"Teme i metode · Teme kroz vrijeme": "Topics and methods · Topics over time",
"Kako se mijenjaju teme": "How topics change",
"Udio projekata s odabranom temom po godini poziva. Odaberite do osam tema.": "Share of projects with the selected topic by call year. Select up to eight topics.",
"Popis tema promijenjen je {N}., pa se crte ne spajaju preko te granice.": "The topic list changed in {N1}, so the lines do not connect across that boundary.",
"Udio projekata s temom": "Share of projects with the topic",
"Postotak projekata godine koji imaju odabranu temu.": "Percentage of the year's projects that have the selected topic.",
"Udio projekata po temi i godini": "Share of projects by topic and year",
"popis tema promijenjen": "topic list changed",
"(u oba popisa)": "(in both lists)",
"(popis {N}–{N})": "(list {N1}–{N2})",
"Odaberite barem jednu temu.": "Select at least one topic.",
"{N}. je nepotpuna godina (prazna točka).": "{N1} is an incomplete year (empty point).",
"Odaberite teme": "Select topics",
"Najviše osam odjednom.": "Up to eight at a time.",
"Filtriraj teme": "Filter topics",
"Filtriraj teme…": "Filter topics…",
"U oba popisa": "In both lists",
"Popis {N}–{N}": "List {N1}–{N2}",
"Koliko je projekata bilo {N}.?": "How many projects were there in {N1}?",
"Teme i metode · Pristupi": "Topics and methods · Approaches",
"Pristupi, rezultati i ciljne skupine": "Approaches, results and target groups",
"Što projekti tipično rade, za koga i što proizvode, izvučeno iz sažetaka projekata.": "What projects typically do, for whom and what they produce, extracted from project summaries.",
"Obrada je automatska, pa treba čitati obrasce, a ne točne brojke pojedinog pojma. Izvor podataka:": "The processing is automatic, so read patterns rather than the exact figures for an individual concept. Data source:",
"Pristupi": "Approaches",
"Rezultati": "Results",
"Ciljne skupine": "Target groups",
"Pretražite pristupe": "Search approaches",
"Prikaz": "View",
"Najčešći": "Most common",
"Rastu": "Growing",
"Slabe": "Fading",
"Rjeđi": "Rarer",
"Filtriraj": "Filter",
"Filtriraj pristupe…": "Filter approaches…",
"Pristupi poredani po broju projekata.": "Approaches ranked by number of projects.",
"{N} / {N} prikazano": "{N1} / {N2} shown",
"Pristup": "Approach",
"Udio {N}–{N}": "Share {N1}–{N2}",
"Kretanje": "Trend",
"stabilno": "stable",
"slabi": "fading",
"raste": "growing",
"Prikaži još": "Show more",
"Udio u {N}–{N} barem {N} puta veći nego u {N}–{N}": "Share in {N1}–{N2} at least {N3} times higher than in {N4}–{N5}",
"Pristupi s manje projekata.": "Approaches with fewer projects.",
"Teme i metode · Mreža pojmova": "Topics and methods · Concept network",
"Pojmovi koji se u projektima pojavljuju zajedno: pristupi, ciljne skupine, rezultati, problemi i teme. Veći krug znači više projekata, a crta znači zajedničke projekte.": "Concepts that appear together in projects: approaches, target groups, results, problems and topics. A larger circle means more projects, and a line means joint projects.",
"Ovo su pojmovi izdvojeni iz sažetaka projekata automatskom obradom pa je to pregled obrazaca, a ne službena klasifikacija.": "These are concepts extracted from project summaries by automatic processing, so this is an overview of patterns, not an official classification.",
"Pretraži pojmove": "Search concepts",
"npr. učitelji, digitalne vještine…": "e.g. teachers, digital skills…",
"Ciljna skupina": "Target group",
"Rezultat": "Result",
"Problem": "Problem",
"Tema": "Topic",
"Mreža najčešćih pojmova": "Network of the most common concepts",
"Prikazano je {N} najčešćih pojmova od {N}. Kliknite pojam za detalje.": "Showing the {N1} most common concepts out of {N2}. Click a concept for details.",
"Odabrani pojam": "Selected concept",
"Odaberite pojam u mreži ili ga potražite iznad.": "Select a concept in the network or search for it above.",
"Skupine projekata ({N})": "Project groups ({N1})",
"Projekti se prirodno grupiraju prema pojmovima koje dijele. Otvorite skupinu za detalje.": "Projects naturally group by the concepts they share. Open a group for details.",
"· {N} projekata ({N}%)": "· {N1} projects ({N2}%)",
"Problemi": "Problems",
"Teme": "Topics",
"· Tema · {N}": "· Topic · {N1}",
"· Pristup · {N}": "· Approach · {N1}",
"· Ciljna skupina · {N}": "· Target group · {N1}",
"Pretraži · Projekti": "Search · Projects",
"KA{N} projekti": "KA{N1} projects",
"Pretražite projekte s hrvatskim sudionikom i suzite ih po razdoblju, sektoru, vrsti, partnerskoj državi i statusu.": "Search projects with a Croatian participant and narrow them by period, sector, type, partner country and status.",
"Pretraga": "Search",
"Naziv projekta…": "Project name…",
"Sva razdoblja": "All periods",
"Partnerska država": "Partner country",
"Sve države": "All countries",
"Status": "Status",
"Svi statusi": "All statuses",
"Samo dobra praksa": "Good practice only",
"pronađenih projekata": "projects found",
"u tijeku": "ongoing",
"Koje organizacije imaju najviše projekata?": "Which organisations have the most projects?",
"Ukloni filter: {N}–{N}": "Remove filter: {N1}–{N2}",
"dobra praksa": "good practice",
"Nijedan projekt ne odgovara ovim filtrima.": "No project matches these filters.",
"Projekt · {E}": "Project · {E1}",
"Poziv {N}. · {E} · {E}": "Call {N1} · {E1} · {E2}",
"Osnovni podaci": "Basic information",
"Oznaka projekta": "Project code",
"Godina poziva": "Call year",
"Programsko razdoblje": "Programme period",
"KA{N}": "KA{N1}",
"VET": "VET",
"Vodeća država": "Lead country",
"Dobra praksa": "Good practice",
"Nije označen": "Not designated",
"Sažetak projekta, popis sudionika i dodijeljeni iznos čitaju se iz datoteke": "The project summary, list of participants and awarded amount are read from the file",
"projects_full.json": "projects_full.json",
", koja se generira u pipelineu i nije u ovom prototipu. Prikazani su podaci koji postoje u popisu projekata.": ", which is generated in the pipeline and is not in this prototype. The data available in the project list is shown.",
"Države u projektu": "Countries in the project",
"{N} država, od toga {N} uz Hrvatsku.": "{N1} countries, {N2} of them besides Croatia.",
"Slični projekti": "Similar projects",
"Ista godina poziva i ista vrsta projekta.": "Same call year and same project type.",
"← Natrag na projekte": "← Back to projects",
"Projekt": "Project",
"Pretraži · Organizacije": "Search · Organisations",
"Organizacije u KA{N} partnerstvima": "Organisations in KA{N1} partnerships",
"Pretražite hrvatske organizacije po nazivu ili mjestu i suzite ih po županiji i vrsti.": "Search Croatian organisations by name or place and narrow them by county and type.",
"Naziv ili mjesto…": "Name or place…",
"Vrsta organizacije": "Organisation type",
"Sva": "All",
"Poredak": "Ranking",
"Po broju projekata": "By number of projects",
"Po koordinacijama": "By coordinations",
"Po nazivu": "By name",
"Samo koordinatori": "Coordinators only",
"/ {N} prikazano": "/ {N1} shown",
"Naziv": "Name",
"Mjesto": "Place",
"Vrsta": "Type",
"Organizacija · {E}": "Organisation · {E1}",
"KA{N} projekata, {N}–{N}": "KA{N1} projects, {N2}–{N3}",
"koordinator": "coordinator",
"{N} kao partner": "{N1} as partner",
"Koordinacije po razdoblju": "Coordinations by period",
"Grantovi, dobra praksa": "Grants, good practice",
"Dolazi iz orgs_full.json": "Comes from orgs_full.json",
"Detaljni dijelovi (vremenska crta, popis projekata, partneri, teme) čitaju se iz": "Detailed sections (timeline, project list, partners, topics) are read from",
"orgs_full.json": "orgs_full.json",
", koji se generira u pipelineu. Ispod je raspored; pun primjer vidi se na organizaciji „Gimnazija Metković”.": ", which is generated in the pipeline. The layout is shown below; a full example can be seen on the organisation “Gimnazija Metković”.",
"Sudjelovanje kroz vrijeme": "Participation over time",
"Partner": "Partner",
"Izbor za {N}. još traje pa je zadnja godina nepotpuna. Granica razdoblja: popisi tema {N}–{N} i {N}–{N} razlikuju se.": "Selection for {N1} is still in progress, so the last year is incomplete. Period boundary: the topic lists for {N2}–{N3} and {N4}–{N5} differ.",
"Svi {N}": "All {N1}",
"Koordinator {N}": "Coordinator {N1}",
"Partner {N}": "Partner {N1}",
"Vodi": "Leads",
"Popis projekata organizacije dolazi iz datoteke orgs_full.json.": "The organisation's project list comes from the file orgs_full.json.",
"Najčešće surađuje s": "Most often works with",
"Države u zajedničkim projektima (broj projekata).": "Countries in joint projects (number of projects).",
"Popis partnerskih država dolazi iz datoteke orgs_full.json.": "The list of partner countries comes from the file orgs_full.json.",
"Teme koje se ponavljaju": "Recurring topics",
"Teme organizacije dolaze iz datoteke orgs_full.json.": "The organisation's topics come from the file orgs_full.json.",
"Slične organizacije": "Similar organisations",
"Ista vrsta organizacije u istoj županiji, po broju projekata.": "Same organisation type in the same county, by number of projects.",
"{N} KA{N} projekata": "{N1} KA{N2} projects",
"Pitajte · Asistent": "Ask · Assistant",
"Asistent za pitanja o podacima": "Assistant for questions about the data",
"Poseban asistent koji odgovara na pitanja o ovim podacima: projektima, organizacijama, županijama, državama i temama. Odgovara samo iz podataka atlasa i uz svaki odgovor navodi izvore.": "A dedicated assistant that answers questions about this data: projects, organisations, counties, countries and topics. It answers only from the atlas data and cites sources with every answer.",
"Razgovor s asistentom": "Conversation with the assistant",
"Odgovara iz podataka atlasa, uz izvore": "Answers from the atlas data, with sources",
"Što možete pitati": "What you can ask",
"Države i teme": "Countries and topics",
"Brojke i pojmovi": "Figures and terms",
"Što znači koordinator?": "What does coordinator mean?",
"Asistent ne zna ništa izvan ovih podataka i može pogriješiti. Provjerite izvore ispod odgovora.": "The assistant knows nothing beyond this data and can be wrong. Check the sources below the answers.",
"O atlasu": "About the atlas",
"Rječnik": "Glossary",
"Informacije · O podacima": "Information · About the data",
"Odakle podaci dolaze i što znače": "Where the data comes from and what it means",
"Kratko objašnjenje izvora, obuhvata i ograničenja, da brojke možete čitati s razumijevanjem.": "A short explanation of the sources, scope and limitations, so you can read the figures with understanding.",
"Što atlas prikazuje": "What the atlas shows",
"KA{N} partnerstva Erasmus+ programa u kojima sudjeluje barem jedna hrvatska organizacija, od {N}. do {N}. godine. Trenutno je to {N} projekata, što je {N}% svih KA{N} projekata u EU. Podaci su ažurirani": "KA{N1} partnerships of the Erasmus+ programme with at least one Croatian organisation, from {N2} to {N3}. That is currently {N4} projects, which is {N5}% of all KA{N6} projects in the EU. The data was updated on",
"Izvori": "Sources",
"Europska komisija. Skupovi podataka o KA{N} projektima za {N}–{N} i {N}–{N}": "European Commission. Datasets on KA{N1} projects for {N2}–{N3} and {N4}–{N5}",
"Agencija za mobilnost i programe EU. Popisi projekata i organizacija.": "Agency for Mobility and EU Programmes. Lists of projects and organisations.",
"Što brojke ne obuhvaćaju": "What the figures do not cover",
"Samo KA{N} projekte. KA{N} mobilnosti nisu uključene.": "Only KA{N1} projects. KA{N2} mobility is not included.",
"Odabir za {N}. još traje, pa je posljednja godina nepotpuna.": "Selection for {N1} is still in progress, so the last year is incomplete.",
"Iznosi su okvirne potpore dodijeljene pri odabiru. Bilježe se po projektu i nisu podijeljeni među partnere.": "The amounts are indicative grants awarded at selection. They are recorded per project and are not split between partners.",
"Škole iz projekata povezuju se s registrom škola prema nazivu i poštanskom broju, pa su udjeli pokrivenosti procjene.": "Schools from projects are matched to the school register by name and postcode, so coverage shares are estimates.",
"Nacionalni popis projekata {N}–{N} ima {N} projekta, {N} manje od županijskog sažetka iste agencije ({N}). Brojke u atlasu dolaze iz izvoza EU-a i ne ovise o tom popisu.": "The national project list for {N1}–{N2} has {N3} projects, {N4} fewer than the same agency's county summary ({N5}). The figures in the atlas come from the EU export and do not depend on that list.",
"Vrsta organizacije ponegdje je nadopunjena iz drugih zapisa iste organizacije.": "The organisation type has in places been supplemented from other records of the same organisation.",
"Teme, pristupi i pojmovi": "Topics, approaches and concepts",
"Jezični model pročitao je sažetak svakog projekta i izdvojio pristupe, ciljne skupine, rezultate i probleme, a slični izrazi grupirani su po značenju. Brojevi su donja granica: projekt koji nešto radi, ali to ne spominje, nije izbrojen. Čitajte obrasce, a ne točne brojke pojedinog pojma. „Dobra praksa” je oznaka EU-a za projekte odabrane kao primjere.": "A language model read the summary of every project and extracted approaches, target groups, results and problems, and similar expressions were grouped by meaning. The numbers are a lower bound: a project that does something but does not mention it is not counted. Read the patterns, not the exact figures for an individual concept. “Good practice” is an EU label for projects selected as examples.",
"Kako se podaci osvježavaju": "How the data is refreshed",
"Kad se u izvore dodaju novi projekti, obrada se ponovno pokrene i izračuna brojke, a stranica se izgradi iznova. Ništa se ne unosi ručno.": "When new projects are added to the sources, the processing is run again, the figures are recalculated and the site is rebuilt. Nothing is entered by hand.",
"Odakle dolaze podaci?": "Where does the data come from?",
"Informacije · Rječnik": "Information · Glossary",
"Kratka objašnjenja izraza koji se koriste u atlasu, da brojke možete čitati s razumijevanjem.": "Short explanations of the terms used in the atlas, so you can read the figures with understanding.",
"Npr. koordinator…": "E.g. coordinator…",
"KA{N} i KA{N}": "KA{N1} and KA{N2}",
"Ključne aktivnosti programa Erasmus+. KA{N} su mobilnosti pojedinaca (učenje u inozemstvu), a KA{N} suradnja organizacija i razmjena dobrih praksi kroz partnerstva. Ovaj atlas prikazuje samo KA{N}.": "Key actions of the Erasmus+ programme. KA{N1} is the mobility of individuals (learning abroad), and KA{N2} is cooperation between organisations and the exchange of good practice through partnerships. This atlas shows only KA{N3}.",
"Partnerstvo": "Partnership",
"Projekt u kojem organizacije iz više država zajedno razvijaju rezultate, metode ili materijale. U podacima ga brojimo kao jedan projekt, bez obzira na broj partnera.": "A project in which organisations from several countries jointly develop results, methods or materials. In the data we count it as one project, regardless of the number of partners.",
"Vrsta KA{N} projekata u razdoblju {N}–{N} za organizacije koje žele razviti i podijeliti nove prakse, na europskoj razini.": "A type of KA{N1} project in {N2}–{N3} for organisations that want to develop and share new practices at European level.",
"Jednostavnija i manja KA{N} partnerstva iz razdoblja {N}–{N}, namijenjena novim i manjim organizacijama.": "Simpler and smaller KA{N1} partnerships from {N2}–{N3}, intended for new and smaller organisations.",
"Naziv za KA{N} partnerstva u razdoblju {N}–{N} Obuhvaćaju i razmjene škola, koje atlas prikazuje kao zasebnu vrstu.": "The name for KA{N1} partnerships in {N2}–{N3}. They also include school exchanges, which the atlas shows as a separate type.",
"Organizacija koja podnosi prijavu, vodi projekt i prima grant. {E} je koordinator kada je vodeća organizacija iz Hrvatske.": "The organisation that submits the application, leads the project and receives the grant. {E1} is the coordinator when the lead organisation is from Croatia.",
"Organizacija koja sudjeluje u projektu koji netko drugi koordinira.": "An organisation that takes part in a project coordinated by someone else.",
"Projekt sa sudionikom iz županije": "Project with a participant from the county",
"Projekt u kojem sudjeluje barem jedna organizacija iz te županije. Projekt s organizacijama iz dvije županije broji se u obje.": "A project in which at least one organisation from that county takes part. A project with organisations from two counties is counted in both.",
"Dva višegodišnja financijska okvira programa: {N}–{N} i {N}–{N} Popisi tema i vrste projekata razlikuju se između njih, pa se neki grafovi ne spajaju preko {N}.": "Two multi-year financial frameworks of the programme: {N1}–{N2} and {N3}–{N4}. The lists of topics and project types differ between them, so some charts do not connect across {N5}.",
"Godina natječaja na kojem je projekt odabran. Godina {N}. još traje, pa je u grafovima prikazana kao nepotpuna.": "The year of the call in which the project was selected. The year {N1} is still in progress, so it is shown as incomplete in the charts.",
"Oznaka koju Europska komisija dodjeljuje projektima izdvojenima kao primjeri. Nije ocjena kvalitete projekata bez te oznake.": "A label the European Commission gives to projects singled out as examples. It is not a quality rating of projects without this label.",
"Okvirni iznos potpore dodijeljen projektu pri odabiru. Bilježi se po projektu i ne dijeli se među partnere.": "The indicative grant awarded to a project at selection. It is recorded per project and is not split between partners.",
"Udio osnovnih i srednjih škola u županiji koje su sudjelovale u barem jednom KA{N} projektu. Škole su s registrom povezane prema nazivu i poštanskom broju, pa je udio procjena.": "Share of primary and secondary schools in the county that took part in at least one KA{N1} project. Schools are matched to the register by name and postcode, so the share is an estimate.",
"Koliki dio svih KA{N} projekata u Europskoj uniji ima barem jednog hrvatskog partnera.": "What share of all KA{N1} projects in the European Union has at least one Croatian partner.",
"Prikaz pojmova koje je jezični model izdvojio iz sažetaka projekata (pristupi, ciljne skupine, rezultati, problemi, teme). Brojevi su donja granica, pa pokazuju obrasce, a ne točne brojke.": "A view of the concepts the language model extracted from project summaries (approaches, target groups, results, problems, topics). The numbers are a lower bound, so they show patterns, not exact figures.",
"Nijedan pojam ne odgovara pretrazi.": "No concept matches the search.",
"Informacije · Preuzimanje podataka": "Information · Data download",
"Preuzmite otvorene podatke": "Download the open data",
"Skupovi podataka na kojima se temelji atlas. Preuzimanje u prototipu stvara CSV izravno iz podataka koje stranica već sadrži.": "The datasets the atlas is based on. In the prototype, downloading creates a CSV directly from the data the page already contains.",
"{N} KA{N} projekata s hrvatskim sudionikom: oznaka, naslov, godina, razdoblje, sektor, vrsta, status, dobra praksa i države.": "{N1} KA{N2} projects with a Croatian participant: code, title, year, period, sector, type, status, good practice and countries.",
"projekti.csv": "projects.csv",
"Preuzmi CSV": "Download CSV",
"{N} hrvatskih organizacija: mjesto, županija, vrsta, broj projekata i koordinacija po razdobljima.": "{N1} Croatian organisations: place, county, type, number of projects and coordinations by period.",
"organizacije.csv": "organisations.csv",
"Pokazatelji za {N} županiju po razdobljima: organizacije, projekti, koordinacije i vrijednost projekata.": "Indicators for {N1} counties by period: organisations, projects, coordinations and project value.",
"zupanije.csv": "counties.csv",
"Projekti po godinama": "Projects by year",
"Broj projekata po godini poziva, razdoblju, sektoru i vrsti projekta.": "Number of projects by call year, period, sector and project type.",
"projekti-po-godinama.csv": "projects-by-year.csv",
"Kako koristiti podatke": "How to use the data",
"Navedite izvor: Erasmus+ Project Results Platform, Agencija za mobilnost i programe EU, Ministarstvo znanosti i obrazovanja.": "Cite the source: Erasmus+ Project Results Platform, Agency for Mobility and EU Programmes, Ministry of Science and Education.",
"Provjerite uvjete korištenja u izvoru; atlas ne mijenja licence izvornih skupova.": "Check the terms of use at the source; the atlas does not change the licences of the original datasets.",
"Pročitajte": "Read the",
"ograničenja podataka": "data limitations",
"prije usporedbi.": "before making comparisons.",
"Za programere": "For developers",
"U pravoj aplikaciji isti su podaci dostupni kao JSON, a pitanja se šalju asistentu.": "In the real application the same data is available as JSON, and questions are sent to the assistant.",
"Preuzeto ✓": "Downloaded ✓",
"Informacije · Pristupačnost": "Information · Accessibility",
"Izjava o pristupačnosti": "Accessibility statement",
"Cilj je da atlas mogu koristiti svi, bez obzira na uređaj, vid, motoriku ili način rada s računalom.": "The aim is for everyone to be able to use the atlas, regardless of device, vision, motor ability or way of working with a computer.",
"Ciljana razina": "Target level",
"Sučelje se izrađuje prema smjernicama WCAG {N}, razina AA. Neovisna provjera pristupačnosti još nije provedena, pa ovo opisuje cilj i provedene mjere, a ne potvrđenu sukladnost.": "The interface is being built to WCAG {N1} level AA. An independent accessibility audit has not yet been carried out, so this describes the goal and the measures taken, not confirmed compliance.",
"Što je napravljeno": "What has been done",
"Cijelo sučelje može se koristiti tipkovnicom, uz jasno vidljiv žuti okvir fokusa.": "The whole interface can be used with a keyboard, with a clearly visible yellow focus outline.",
"Boje i kontrasti temelje se na paleti Europa Component Library; informacija se ne prenosi samo bojom.": "Colours and contrasts are based on the Europa Component Library palette; information is not conveyed by colour alone.",
"Svaki graf ima tekstualni ekvivalent: brojke uz stupce, popis ili tablicu podataka.": "Every chart has a text equivalent: numbers beside the bars, a list or a data table.",
"Stranice imaju strukturu naslova i oznake područja (izbornik, glavni sadržaj, podnožje), a veza „Preskoči na sadržaj” prva je na stranici.": "Pages have a heading structure and landmark regions (menu, main content, footer), and the “Skip to content” link is the first on the page.",
"Raspored se prilagođava od {N} px do širokih zaslona i uvećanja teksta do {N}%.": "The layout adapts from {N1} px to wide screens and text enlargement of up to {N2}%.",
"Animacije se isključuju kada je u sustavu odabrano smanjeno kretanje.": "Animations are switched off when reduced motion is selected in the system.",
"Poznata ograničenja": "Known limitations",
"Karta županija je shematska i služi pregledu; isti podaci uvijek su dostupni u poretku pored karte.": "The county map is schematic and serves as an overview; the same data is always available in the ranking next to the map.",
"Mreža pojmova je vizualni prikaz; za čitanje bez miša koristite pretragu pojmova iznad nje.": "The concept network is a visual display; to read it without a mouse, use the concept search above it.",
"Pojmovi u mreži izdvojeni su automatski, pa naziv pojedinog pojma ne mora biti idealno lektoriran.": "Concepts in the network were extracted automatically, so the name of an individual concept may not be perfectly edited.",
"Prijava problema": "Reporting a problem",
"Ako naiđete na prepreku, javite nam preko": "If you run into a barrier, let us know via",
"obrasca za kontakt": "the contact form",
". Navedite stranicu, uređaj i pomoćnu tehnologiju ako je koristite.": ". Include the page, the device and the assistive technology if you use one.",
"Informacije · Kontakt": "Information · Contact",
"Kontakt i povratne informacije": "Contact and feedback",
"Prijavite grešku u podacima, predložite poboljšanje ili postavite pitanje o projektu.": "Report a data error, suggest an improvement or ask a question about a project.",
"Vrsta poruke": "Message type",
"Greška u podacima": "Data error",
"Prijedlog poboljšanja": "Suggestion for improvement",
"Suradnja": "Cooperation",
"Poruka": "Message",
"E-pošta": "Email",
"(nije obavezna, samo ako želite odgovor)": "(optional, only if you want a reply)",
"Pošalji poruku": "Send message",
"Hvala.": "Thank you.",
"U ovom prototipu poruka se ne šalje nikamo. U pravoj aplikaciji stigla bi na adresu projekta i u popis zadataka na GitHubu.": "In this prototype the message is not sent anywhere. In the real application it would reach the project's address and the task list on GitHub.",
"Drugi načini": "Other ways",
"Prijava na GitHubu": "Report on GitHub",
"za greške i prijedloge s tehničkim detaljima.": "for errors and suggestions with technical details.",
"Pitajte asistenta": "Ask the assistant",
"za brza pitanja o podacima.": "for quick questions about the data.",
"objašnjava većinu izraza u atlasu.": "explains most terms in the atlas.",
"Upišite poruku.": "Enter a message.",
"Informacije · Mapa stranice": "Information · Site map",
"Sve stranice atlasa": "All pages of the atlas",
"Popis svih stranica prototipa, grupiran po odjeljcima.": "A list of all prototype pages, grouped by section.",
"Početak": "Start",
"Uvod u atlas, ključne brojke i poredak županija": "Introduction to the atlas, key figures and county ranking",
"Broj projekata po godinama, sektoru i vrsti": "Number of projects by year, sector and type",
"Do četiri županije jedna uz drugu": "Up to four counties side by side",
"Detalj županije (primjer)": "County detail (example)",
"Brojke, organizacije i pokrivenost jedne županije": "Figures, organisations and coverage of one county",
"Udio tema u projektima po godini": "Share of topics in projects by year",
"Što projekti rade, za koga i što proizvode": "What projects do, for whom and what they produce",
"Pojmovi koji se pojavljuju zajedno u projektima": "Concepts that appear together in projects",
"Detalj projekta (primjer)": "Project detail (example)",
"Osnovni podaci i države jednog projekta": "Basic information and countries of one project",
"Pretraga hrvatskih organizacija u KA{N} projektima": "Search Croatian organisations in KA{N1} projects",
"Detalj organizacije (primjer)": "Organisation detail (example)",
"Sudjelovanje, projekti i partneri jedne organizacije": "Participation, projects and partners of one organisation",
"Izvori, obuhvat i ograničenja": "Sources, scope and limitations",
"Objašnjenja stručnih izraza": "Explanations of technical terms",
"Otvoreni skupovi podataka u CSV i JSON formatu": "Open datasets in CSV and JSON format",
"Izjava o pristupačnosti i poznata ograničenja": "Accessibility statement and known limitations",
"Prijava greške u podacima, prijedlozi, pitanja": "Reporting a data error, suggestions, questions",
"Popis svih stranica atlasa": "List of all atlas pages",
"Stranica nije pronađena": "Page not found",
"Adresa možda više ne postoji ili je pogrešno upisana. Probajte pretragu u izborniku ili otvorite jednu od ovih stranica.": "The address may no longer exist or was typed incorrectly. Try the search in the menu or open one of these pages.",
"Kako je izračunano": "How it was calculated",
"{N} projekata": "{N1} projects",
"Organizacije": "Organisations",
"Ministarstvo znanosti i obrazovanja": "Ministry of Science and Education",
"redaka prema trenutnim filterima": "rows matching the current filters",
"Preuzimanje": "Download",
"redaka": "rows",
"Primijenjeni filteri": "Applied filters",
"Broj redaka": "Number of rows",
"Izvezeno": "Exported",
"O izvozu": "About the export",
"Podaci": "Data",
"Stranica": "Page",
"Izvor: Erasmus+ Kompas (erasmus-plus.ec.europa.eu, data.gov.hr, MZO). Neovisan projekt, nije službena stranica Europske komisije.": "Source: Erasmus+ Kompas (erasmus-plus.ec.europa.eu, data.gov.hr, MZO). An independent project, not an official European Commission website.",
"Države koje surađuju s Hrvatskom u KA{N} projektima": "Countries cooperating with Croatia in KA{N1} projects",
"Države sudionice": "Participating countries",
"Godina {N}. još traje": "The year {N1} is still in progress",
"ID organizacije": "Organisation ID",
"ID projekta": "Project ID",
"KA{N} projekti po godini poziva i sektoru": "KA{N1} projects by call year and sector",
"KA{N} projekti po godini poziva i vrsti projekta": "KA{N1} projects by call year and project type",
"KA{N} projekti po godini poziva": "KA{N1} projects by call year",
"KA{N} projekti s hrvatskim sudionikom": "KA{N1} projects with a Croatian participant",
"Kod države": "Country code",
"Napomena": "Note",
"Naslov": "Title",
"Odabrane teme": "Selected topics",
"Podijeljeno po": "Split by",
"Pokrivenost škola (%)": "School coverage (%)",
"Poredano po": "Ordered by",
"Udio (%)": "Share (%)",
"Udio projekata s odabranom temom po godini poziva": "Share of projects with the selected topic by call year",
"Udio ustanova koje sudjeluju u KA{N} projektima, po županijama": "Share of institutions taking part in KA{N1} projects, by county",
"Ustanova koje sudjeluju": "Participating institutions",
"Ustanova ukupno": "Total institutions",
"Vrijednost projekata (EUR)": "Project value (EUR)",
"Vrijednost projekata (mil. €)": "Project value (€ million)",
"Zajedničkih projekata": "Joint projects",
"Županija: {E}": "County: {E1}",
"Broj projekata": "Number of projects",
"u oba popisa": "in both lists",
"—": "—",
"{N} mil. €": "€{N1}M",
"{N}–{N}: {N} mil. €": "{N1}–{N2}: €{N3}M",
"{N}–{N}: {N} mil. € · {N}–{N}: {N} mil. €": "{N1}–{N2}: €{N3}M · {N4}–{N5}: €{N6}M",
"Grantovi: {N} mil. €": "Grants: €{N1}M",
"Svaki Erasmus+ projekt počinje s": "Every Erasmus+ project starts with",
"pravim partnerom": "the right partner",
"Erasmus+ Kompas je otvoreni atlas partnerstava hrvatskih škola, udruga i ustanova. Pokazuje tko već surađuje, gdje i na kojim temama, da lakše pronađete partnera, ideju ili prazninu koju vaš projekt može popuniti.": "Erasmus+ Kompas is an open atlas of partnerships involving Croatian schools, associations and institutions. It shows who is already working together, where and on which topics, so you can more easily find a partner, an idea or a gap your project could fill.",
"Istražite atlas": "Explore the atlas",
"Karta Europe: lukovi suradnje od Hrvatske prema partnerskim državama": "Map of Europe: cooperation arcs from Croatia to partner countries",
"zajedničkih projekata": "joint projects",
"manje": "fewer",
"više zajedničkih projekata": "more joint projects",
"Prikazano {N} od {N} partnerskih država.": "Showing {N1} of {N2} partner countries.",
"{N}. najčešći partner": "#{N1} most frequent partner",
"partnerstava": "partnerships",
"država partnera": "partner countries",
"organizacija": "organisations",
"županija": "counties",
"Što radimo": "What we do",
"Podaci o Erasmus+ projektima objavljeni su na više mjesta i u oblicima koje je teško čitati zajedno. Mi ih spajamo na jedno mjesto i pretvaramo u odgovore na praktična pitanja.": "Data on Erasmus+ projects is published in several places and in forms that are hard to read together. We bring it together in one place and turn it into answers to practical questions.",
"Prikupljamo": "We collect",
"Javne podatke Europske komisije, Agencije za mobilnost i programe EU i školskih registara, od {N}. do danas.": "Public data from the European Commission, the Agency for Mobility and EU Programmes and school registers, from {N1} to today.",
"Povezujemo": "We connect",
"Spajamo projekte, organizacije, županije, države i teme. Svaki projekt možete pratiti od naslova do partnera i mjesta.": "We join projects, organisations, counties, countries and topics. You can follow any project from its title to its partners and place.",
"Pojašnjavamo": "We explain",
"Pokazatelji, karte i poredak uz jednostavne filtre. Rezultate izvozite u CSV, Excel ili PDF, a asistent odgovara samo iz podataka i navodi izvor.": "Indicators, maps and rankings with simple filters. Export results to CSV, Excel or PDF; the assistant answers only from the data and names its source.",
"Kome koristi": "Who it is for",
"Školama": "Schools",
"Saznajte tko u vašoj županiji već provodi projekte i s kime surađuje.": "Find out who in your county already runs projects and who they work with.",
"Udrugama i mladima": "Associations and young people",
"Pronađite partnere u državama i temama koje vas zanimaju.": "Find partners in the countries and on the topics that interest you.",
"Gradovima i županijama": "Cities and counties",
"Uočite gdje je sudjelovanje slabo i gdje je potrebna potpora.": "Spot where participation is low and where support is needed.",
"Novinarima i istraživačima": "Journalists and researchers",
"Otvoreni podaci s navedenim izvorima i izvozom za daljnju analizu.": "Open data with named sources and export for further analysis.",
"Tko provodi projekte u mom sektoru i mjestu?": "Who runs projects in my sector and place?",
"Pretraga po temi, sektoru, državi, nazivu i mjestu.": "Search by topic, sector, country, name and place.",
"{N} projekata, {N} organizacija →": "{N1} projects, {N2} organisations →",
"Koji se pojmovi pojavljuju zajedno?": "Which concepts appear together?",
"Pristupi, ciljne skupine, rezultati i problemi povezani u mrežu.": "Approaches, target groups, results and problems linked in a network.",
"{N} pojmova →": "{N1} concepts →",
"Teme kroz vrijeme i pristupi.": "Topics over time and approaches.",
"{N} tema →": "{N1} topics →",
"Previše upita u kratkom vremenu. Pričekajte minutu i pokušajte ponovno.": "Too many questions in a short time. Please wait a minute and try again.",
"Asistent je trenutno zauzet. Pokušajte ponovno za nekoliko trenutaka.": "The assistant is busy right now. Please try again in a few moments.",
"Asistent s modelom trenutno nije dostupan. Prikazan je odgovor izračunan izravno iz podataka.": "The model-based assistant is not available right now. This answer was computed directly from the data.",
"Odgovor nije u potpunosti potvrđen podacima.": "This answer could not be fully verified against the data.",
"Prikazan je uzorak od {N} projekata; pun popis dolazi iz datoteke": "A sample of {N1} projects is shown; the full list comes from the file",
"Sažetak": "Summary",
"Sažetak je preuzet iz javnih podataka EU-a i nije lektoriran.": "The summary comes from public EU data and has not been proofread.",
"Dodijeljeni iznos": "Awarded amount",
"nije usporediv": "not comparable",
"Poveznice EU-a": "EU links",
"Kartica projekta na platformi EU-a": "Project card on the EU platform",
"Mrežna stranica projekta": "Project website",
"Hrvatski sudionici": "Croatian participants",
"Pojmovi iz mreže": "Concepts from the network",
"vodeća": "lead",
"Grantovi koordiniranih projekata": "Grants of coordinated projects",
"Vrijednost svih projekata:": "Value of all projects:",
"{N} s oznakom dobre prakse": "{N1} marked as good practice",
"Nema partnerskih država u podacima.": "No partner countries in the data.",
"Nema tema u podacima.": "No topics in the data.",
"Prikaži sve {N}": "Show all {N1}",
"godina još traje": "year still in progress",
"da": "yes",
"ne": "no",
"Svi izvori su javni otvoreni podaci. Atlas ih povezuje i izračunava pokazatelje, ništa se ne unosi ručno.": "All sources are public open data. The atlas links them and computes the indicators; nothing is entered by hand.",
"Popisi KA{N} projekata za {N}.–{N}. i {N}.–{N}.": "Lists of KA{N1} projects for {N2}–{N3} and {N4}–{N5}",
"Popisi KA{N} projekata {N}.–{N}. i {N}.–{N}.": "Lists of KA{N1} projects {N2}–{N3} and {N4}–{N5}",
"Program Erasmus+ za razdoblje od {N}. do {N}. godine": "The Erasmus+ programme for {N1}–{N2}",
"Program Erasmus+ {N}.–{N}.": "Erasmus+ programme {N1}–{N2}",
"Program Erasmus+ {N}.–{N}. (data.gov.hr)": "Erasmus+ programme {N1}–{N2} (data.gov.hr)",
"Agencija za mobilnost i programe EU, data.gov.hr. Hrvatski sudionici i organizacije u projektima.": "Agency for Mobility and EU Programmes, data.gov.hr. Croatian participants and organisations in the projects.",
"Dječji vrtići": "Kindergartens",
"Osnovne škole": "Primary schools",
"Ustanove iz sustava visokog obrazovanja": "Higher education institutions",
"Ministarstvo znanosti i obrazovanja, data.gov.hr. Registri ustanova, za izračun pokrivenosti po županijama.": "Ministry of Science and Education, data.gov.hr. Institution registers, used to compute coverage by county.",
"Registri ustanova (data.gov.hr)": "Institution registers (data.gov.hr)",
"Registri ustanova": "Institution registers",
"Ministarstvo znanosti i obrazovanja: dječji vrtići, osnovne i srednje škole, visoko obrazovanje.": "Ministry of Science and Education: kindergartens, primary and secondary schools, higher education.",
"Agencija za mobilnost i programe EU · data.gov.hr": "Agency for Mobility and EU Programmes · data.gov.hr",
"Ministarstvo znanosti i obrazovanja · data.gov.hr": "Ministry of Science and Education · data.gov.hr",
"Dječji vrtići, osnovne i srednje škole te visoko obrazovanje, za izračun pokrivenosti.": "Kindergartens, primary and secondary schools and higher education, used to compute coverage.",
"Za AI asistente (MCP)": "For AI assistants (MCP)",
"Isti sloj upita dostupan je i kao MCP poslužitelj, pa asistenti poput Claudea mogu pretraživati projekte, otvoriti profil organizacije, izračunati pokrivenost i pronaći slične organizacije — iz istih podataka i s istim izvorima.": "The same query layer is also available as an MCP server, so assistants such as Claude can search projects, open an organisation profile, compute coverage and find similar organisations — from the same data and with the same sources.",
"Pretraga projekata i profil organizacije.": "Project search and organisation profile.",
"Pokrivenost po županiji i prvi projekti po sektoru.": "Coverage by county and first projects by sector.",
"Slične organizacije u istom sektoru i blizini.": "Similar organisations in the same sector and nearby.",
"Navedite izvore: Erasmus+ Project Results Platform (Europska komisija), Program Erasmus+ {N}.–{N}. i registri ustanova na data.gov.hr (Agencija za mobilnost i programe EU, Ministarstvo znanosti i obrazovanja).": "Cite the sources: Erasmus+ Project Results Platform (European Commission), the Erasmus+ programme {N1}–{N2} and the institution registers on data.gov.hr (Agency for Mobility and EU Programmes, Ministry of Science and Education).",
"Ključni pokazatelji": "Key indicators",
"Karta i poredak": "Map and ranking",
"Teme i problemi": "Topics and problems",
"Problemi i rješenja": "Problems and solutions",
"Teme kroz vrijeme, problemi i rješenja.": "Topics over time, problems and solutions.",
"Koje probleme projekti navode i što uz njih rade": "Which problems projects state and what they do about them",
"Koje probleme projekti navode i što uz njih najčešće rade: pristupe, ciljne skupine i rezultate.": "Which problems projects state and what they most often do about them: approaches, target groups and results.",
"Program Erasmus+ {N}–{N}": "Erasmus+ programme {N1}–{N2}",
"Program Erasmus+ {N}–{N} (data.gov.hr)": "Erasmus+ programme {N1}–{N2} (data.gov.hr)",
"Europska komisija. Popisi KA{N} projekata {N}–{N} i {N}–{N}": "European Commission. Lists of KA{N1} projects {N2}–{N3} and {N4}–{N5}",
"Navedite izvore: Erasmus+ Project Results Platform (Europska komisija), Program Erasmus+ {N}–{N} i registri ustanova na data.gov.hr (Agencija za mobilnost i programe EU, Ministarstvo znanosti i obrazovanja).": "Cite the sources: Erasmus+ Project Results Platform (European Commission), the Erasmus+ programme {N1}–{N2} and the institution registers on data.gov.hr (Agency for Mobility and EU Programmes, Ministry of Science and Education).",
"{E} ima {N} KA{N} projekata sa sudionikom iz županije ({N}. od {N}), od toga {N} koordiniranih. U projektima sudjeluje {N} organizacija, a vrijednost projekata je {N} mil. €.": "{E1} has {N1} KA{N2} projects with a participant from the county (rank {N3} of {N4}), of which {N5} were coordinated from it. {N6} organisations take part, and the projects are worth €{N7}M.",
"Odaberite područje, a zatim označite teme. Najviše osam odjednom.": "Choose an area, then tick topics. Up to eight at a time.",
"Područje": "Area",
"Najčešće": "Most common",
"Okoliš i energija": "Environment and energy",
"Digitalno i znanost": "Digital and science",
"Poučavanje i kvaliteta": "Teaching and quality",
"Inkluzija i jednakost": "Inclusion and equality",
"Zdravlje i dobrobit": "Health and well-being",
"Posao i poduzetništvo": "Work and entrepreneurship",
"{E} i identitet": "{E1} and identity",
"Društvo i mladi": "Society and youth",
"Brzi odabir": "Quick selection",
"↗ Najviše rastu": "↗ Fastest growing",
"↘ Najviše slabe": "↘ Fastest declining",
"Zadano": "Default",
"Očisti odabir": "Clear selection",
"Ukloni": "Remove",
"Najviše osam tema odjednom. Uklonite neku da dodate novu.": "Up to eight topics at a time. Remove one to add another.",
"Pojmovi su izdvojeni automatskom obradom sažetaka projekata s hrvatskim sudionikom. Prikaz pokazuje što projekti uz neki problem najčešće rade, a ne dokazuje da to problem i rješava. Rješenja iz drugih zemalja EU-a nisu u ovom skupu podataka, a brojevi su donja granica.": "The terms were extracted automatically from the summaries of projects with a Croatian participant. The view shows what projects most often do alongside a problem; it does not prove that this solves the problem. Solutions from other EU countries are not in this dataset, and the numbers are a lower bound.",
"{N}. Odaberite problem": "{N1}. Choose a problem",
"Najprije područje, zatim izraz koji najbolje odgovara.": "First the area, then the expression that fits best.",
"Područje problema": "Problem area",
"Svi problemi": "All problems",
"Napuštanje školovanja": "Leaving school early",
"Nezaposlenost mladih": "Youth unemployment",
"Klima i okoliš": "Climate and environment",
"Isključenost i nejednakost": "Exclusion and inequality",
"Diskriminacija i netolerancija": "Discrimination and intolerance",
"Vršnjačko nasilje": "Bullying",
"Strani jezici": "Foreign languages",
"Digitalne vještine i mediji": "Digital skills and media",
"Motivacija i samopouzdanje": "Motivation and self-confidence",
"Poduzetničke vještine": "Entrepreneurial skills",
"Poučavanje i rad s mladima": "Teaching and youth work",
"Mentalno zdravlje": "Mental health",
"Odabrani problem": "Selected problem",
"{N} projekata ({N}%)": "{N1} projects ({N2}%)",
"{N} projekata ({N}%) · {N}–{N}: {N} · {N}–{N}: {N}": "{N1} projects ({N2}%) · {N3}–{N4}: {N5} · {N6}–{N7}: {N8}",
"Slični izrazi:": "Similar terms:",
"Što se uz to radi": "What is done alongside",
"broj zajedničkih projekata": "number of joint projects",
"što se radi": "what is done",
"za koga": "for whom",
"što nastaje": "what comes out",
"Teme EU-a": "EU topics",
"uz koju temu": "under which topic",
"Broj uz pojam znači koliko projekata navodi i taj problem i taj pojam.": "The number next to a term is how many projects state both that problem and that term.",
"Otvori mrežu pojmova": "Open the term network",
"{N}. Svi pristupi, rezultati i ciljne skupine": "{N1}. All approaches, results and target groups",
"Što projekti uopće rade, bez obzira na problem. Trend uspoređuje udio projekata u dva programska razdoblja.": "What projects do in general, regardless of the problem. The trend compares the share of projects in the two programme periods.",
"Vrsta pojma": "Type of term",
"Filtriraj popis": "Filter the list",
"Npr. mentorstvo, učitelji…": "E.g. mentoring, teachers…",
"Poredano po broju projekata.": "Sorted by number of projects.",
"↘ slabi": "↘ declining",
"↗ raste": "↗ growing",
"Nema dovoljno zajedničkih projekata (najmanje {N}).": "Not enough joint projects (at least {N1}).",
"Nema pojmova za odabrane filtre.": "No terms for the selected filters.",
"Hrvatske organizacije u projektima s ovim pojmom": "Croatian organisations in projects with this term"
};

/* ============ view: Projekti ============ */
function viewProjekti(root) {
  const P = D.projects; // [id,title,yr,period,sector,kind,status,gp,countries]
  let st = { q: '', period: '', sector: '', kind: '', country: '', gp: false, status: '' }, shown = 40, lastHits = [];
  const idx = P.map((p) => fold(p[1]));
  const countries = [...new Set(P.flatMap((p) => p[8].split(',').filter(Boolean)))].filter((c) => c !== 'HR').sort((a, b) => country(a).localeCompare(country(b), LANG));
  root.innerHTML = `${head('Pretraži · Projekti', 'KA2 projekti', 'Pretražite projekte s hrvatskim sudionikom i suzite ih po razdoblju, sektoru, vrsti, partnerskoj državi i statusu.')}
  <section class="filters" aria-label="Filteri"><label class="f"><span class="lab">Pretraga</span><input id="q" type="search" placeholder="Naziv projekta…" autocomplete="off"></label><label class="f"><span class="lab">Razdoblje</span><select id="fp"></select></label><label class="f"><span class="lab">Sektor</span><select id="fs"></select></label><label class="f"><span class="lab">Vrsta projekta</span><select id="fk"></select></label><label class="f"><span class="lab">Partnerska država</span><select id="fc"></select></label><label class="f"><span class="lab">Status</span><select id="ft"></select></label><label class="chk"><input id="fg" type="checkbox">Samo dobra praksa</label>${resetBtn}</section>
  <div class="chips" id="chips" aria-live="polite"></div><p class="summary" id="count" aria-live="polite"></p><ul class="res" id="res"></ul><div class="more-wrap"><button class="more" id="more" type="button" hidden>Prikaži još</button></div>`;
  const ok = (p, skip) => (skip === 'period' || !st.period || p[3] === st.period) && (skip === 'sector' || !st.sector || p[4] === st.sector) && (skip === 'kind' || !st.kind || p[5] === st.kind) && (skip === 'status' || st.status === '' || String(p[6]) === st.status) && (skip === 'country' || !st.country || p[8].split(',').includes(st.country)) && (!st.gp || p[7]) && (!st.q || st.q.split(/\s+/).every((w) => idx[P.indexOf(p)].includes(w)));
  const opts = (sel, ph, list, cur) => { sel.innerHTML = ''; sel.append(new Option(ph, '')); for (const [v, l, n] of list) if (n) sel.append(new Option(`${l} (${fmt(n)})`, v)); sel.value = cur; };
  const count = (skip, i, f = (x) => x) => { const m = {}; for (const p of P) if (ok(p, skip)) for (const k of [].concat(f(p[i]))) m[k] = (m[k] || 0) + 1; return m; };
  function paint() {
    const per = count('period', 3), sec = count('sector', 4), kin = count('kind', 5), sta = count('status', 6), cou = count('country', 8, (x) => x.split(',').filter(Boolean));
    opts($('#fp', root), 'Sva razdoblja', [['2014-2020', '2014.–2020.', per['2014-2020']], ['2021-2027', '2021.–2027.', per['2021-2027']]], st.period);
    opts($('#fs', root), 'Svi sektori', Object.keys(LAB.sector).map((k) => [k, LAB.sector[k], sec[k]]), st.sector);
    opts($('#fk', root), 'Sve vrste', Object.keys(LAB.kind).map((k) => [k, LAB.kind[k], kin[k]]), st.kind);
    opts($('#ft', root), 'Svi statusi', LAB.status.map((l, i) => [String(i), l, sta[i]]), st.status);
    opts($('#fc', root), 'Sve države', countries.map((c) => [c, country(c), cou[c]]), st.country);
    const hits = P.filter((p) => ok(p)).sort((a, b) => b[2] - a[2]); lastHits = hits;
    $('#count', root).innerHTML = `<b>${fmt(hits.length)}</b> pronađenih projekata`;
    const ch = (k, t) => `<button type="button" class="chip" data-k="${k}" aria-label="${esc(tr('Ukloni filter'))}: ${esc(tr(t))}">${esc(t)}<i aria-hidden="true">×</i></button>`;
    $('#chips', root).innerHTML = [st.q && ch('q', '„' + $('#q', root).value.trim() + '”'), st.period && ch('period', LAB.period[st.period]), st.sector && ch('sector', LAB.sector[st.sector]), st.kind && ch('kind', LAB.kind[st.kind]), st.country && ch('country', country(st.country)), st.status !== '' && ch('status', LAB.status[+st.status]), st.gp && ch('gp', 'Dobra praksa')].filter(Boolean).join('');
    $('#res', root).innerHTML = hits.slice(0, shown).map((p) => `<li><a class="t" href="#/projekti/${encodeURIComponent(p[0])}">${esc(p[1])}</a><div class="meta"><span class="pill">${p[2]}</span><span class="pill blue">${LAB.kind[p[5]]}</span><span class="pill">${LAB.sector[p[4]]}</span>${p[7] ? '<span class="pill green">dobra praksa</span>' : ''}${p[6] === 1 ? '<span class="pill warm">u tijeku</span>' : ''}<small class="mono">${p[8].split(',').filter(Boolean).slice(0, 6).map(country).join(', ')}</small></div></li>`).join('') || '<li class="empty">Nijedan projekt ne odgovara ovim filtrima.</li>';
    $('#more', root).hidden = hits.length <= shown;
  }
  $('#q', root).oninput = (e) => { st.q = fold(e.target.value.trim()); shown = 40; paint(); };
  [['fp', 'period'], ['fs', 'sector'], ['fk', 'kind'], ['fc', 'country'], ['ft', 'status']].forEach(([id, k]) => $('#' + id, root).onchange = (e) => { st[k] = e.target.value; shown = 40; paint(); });
  $('#fg', root).onchange = (e) => { st.gp = e.target.checked; shown = 40; paint(); };
  $('#more', root).onclick = () => { shown += 40; paint(); };
  Xport.mount(root, () => ({ id: 'projekti', title: 'KA2 projekti s hrvatskim sudionikom', filters: [['Pretraga', $('#q', root).value.trim() || '—'], ['Razdoblje', st.period ? LAB.period[st.period] : 'Sva razdoblja'], ['Sektor', st.sector ? LAB.sector[st.sector] : 'Svi sektori'], ['Vrsta projekta', st.kind ? LAB.kind[st.kind] : 'Sve vrste'], ['Partnerska država', st.country ? country(st.country) : 'Sve države'], ['Status', st.status !== '' ? LAB.status[+st.status] : 'Svi statusi'], ['Samo dobra praksa', st.gp ? 'da' : 'ne']], cols: [{ h: 'ID projekta' }, { h: 'Naslov' }, { h: 'Godina poziva', t: 'year' }, { h: 'Razdoblje' }, { h: 'Sektor' }, { h: 'Vrsta projekta' }, { h: 'Status' }, { h: 'Dobra praksa' }, { h: 'Države sudionice' }], rows: lastHits.map((p) => [p[0], p[1], p[2], LAB.period[p[3]] || p[3], LAB.sector[p[4]] || p[4], LAB.kind[p[5]] || p[5], LAB.status[p[6]] ?? '', p[7] ? 'da' : 'ne', p[8].split(',').filter(Boolean).map(country).join(', ')]) }));
  $('#chips', root).onclick = (e) => { const b = e.target.closest('.chip[data-k]'); if (!b) return; const k = b.dataset.k; if (k === 'q') { st.q = ''; $('#q', root).value = ''; } else if (k === 'gp') { st.gp = false; $('#fg', root).checked = false; } else st[k] = ''; shown = 40; paint(); };
  $('#reset', root).onclick = () => { st = { q: '', period: '', sector: '', kind: '', country: '', gp: false, status: '' }; $('#q', root).value = ''; $('#fg', root).checked = false; shown = 40; paint(); };
  paint();
}

/* ============ view: Teme ============ */
/* tematska područja: svaka tema iz oba popisa (2014.–2020. i 2021.–2027.) razvrstana je u jedno područje */
const TOPIC_AREAS = [['okolis', 'Okoliš i energija'], ['digitalno', 'Digitalno i znanost'], ['poucavanje', 'Poučavanje i kvaliteta'], ['inkluzija', 'Inkluzija i jednakost'], ['zdravlje', 'Zdravlje i dobrobit'], ['posao', 'Posao i poduzetništvo'], ['kultura', 'Kultura i identitet'], ['drustvo', 'Društvo i mladi']];
const TOPIC_AREA = {"Environment and climate change": "okolis", "Green skills": "okolis", "Energy and resources": "okolis", "Agriculture, forestry and fisheries": "okolis", "Natural sciences": "okolis", "Transport and mobility": "okolis", "Green transport and mobility": "okolis", "Disaster prevention, preparedness and recovery": "okolis", "ICT - new technologies - digital competences": "digitalno", "Digital skills and competences": "digitalno", "Digital content, technologies and practices": "digitalno", "Artificial Intelligence (AI) and data usage": "digitalno", "Digital youth work": "digitalno", "Digital transformation planning and implementation": "digitalno", "Digital safety": "digitalno", "Information and communication technologies (ICT)": "digitalno", "Digital skills": "digitalno", "Science, technology, engineering and mathematics (STEM)": "digitalno", "Media literacy and tackling disinformation": "digitalno", "Open and distance learning": "digitalno", "Research and innovation": "digitalno", "Support for European and regional innovation and smart specialisation strategies": "digitalno", "New innovative curricula/educational methods/development of training courses": "poucavanje", "New learning and teaching methods and approaches": "poucavanje", "Creating new, innovative or joint curricula or courses": "poucavanje", "Development of training courses": "poucavanje", "Pedagogy and didactics": "poucavanje", "Key Competences (incl. mathematics and literacy) - basic skills": "poucavanje", "Key competences development": "poucavanje", "Basic skills and key competences": "poucavanje", "Teaching and learning of foreign languages": "poucavanje", "Initial and continuous training for teachers, trainers and other education staff": "poucavanje", "Quality Improvement Institutions and/or methods (incl. school development)": "poucavanje", "Quality assurance": "poucavanje", "Early childhood education and care": "poucavanje", "Soft skills": "poucavanje", "Graduate tracking systems": "poucavanje", "Recognition, transparency, certification": "poucavanje", "Recognition (non-formal and informal learning/credits)": "poucavanje", "Micro-credentials": "poucavanje", "Work-based learning": "poucavanje", "Quality and Relevance of Higher Education in Partner Countries": "poucavanje", "Inclusion - equity": "inkluzija", "Inclusion, promoting equality and non-discrimination": "inkluzija", "Access for disadvantaged": "inkluzija", "Disabilities - special needs": "inkluzija", "Disabilities": "inkluzija", "Inclusion of marginalised young people": "inkluzija", "Gender equality / equal opportunities": "inkluzija", "Promoting gender equality": "inkluzija", "Roma and/or other minorities": "inkluzija", "Migrants' issues": "inkluzija", "Integration of refugees": "inkluzija", "Reception and integration of refugees and migrants": "inkluzija", "Preventing racism and discrimination": "inkluzija", "Promoting LGBT+ equality": "inkluzija", "Early School Leaving / combating failure in education": "inkluzija", "Preventing early school leaving and failure in education": "inkluzija", "Prevention of bullying": "inkluzija", "Combat violence and tackle racism, discrimination and intolerance in sport": "inkluzija", "Bridging intercultural, intergenerational and social divide": "inkluzija", "Intercultural/intergenerational education and (lifelong)learning": "inkluzija", "Health and wellbeing": "zdravlje", "Physical and mental health, well-being": "zdravlje", "Healthy lifestyle, active ageing": "zdravlje", "Active ageing": "zdravlje", "Social assistance and welfare": "zdravlje", "Entrepreneurial learning - entrepreneurship education": "posao", "Enterprise, industry, SMEs and entrepreneurship": "posao", "Cooperation between educational institutions and business": "posao", "Labour market issues incl. career guidance / youth unemployment": "posao", "Employability": "posao", "Youth employability": "posao", "Career guidance": "posao", "Overcoming skills mismatch and addressing the needs of the labour market": "posao", "Overcoming skills mismatches (basic/transversal)": "posao", "Equal access and transition to labour market": "posao", "Social dialogue": "posao", "Social entrepreneurship / social innovation": "posao", "Social innovation": "posao", "Economic and financial affairs (including funding issues)": "posao", "Creativity and culture": "kultura", "Creativity, arts and culture": "kultura", "Cultural heritage": "kultura", "EU Citizenship, EU awareness and Democracy": "kultura", "European identity and values": "kultura", "Awareness about the European Union": "kultura", "Ethics, religion and philosophy (incl. Inter-religious dialogue)": "kultura", "Youth (Participation, Youth Work, Youth Policy)": "drustvo", "Quality and innovation of youth work": "drustvo", "Youth policy development": "drustvo", "Civic engagement / responsible citizenship": "drustvo", "Democracy and inclusive democratic participation": "drustvo", "Promotion of alternative forms of participation": "drustvo", "Human rights and rule of law": "drustvo", "Home and justice affairs (human rights & rule of law)": "drustvo", "Reaching the policy level/dialogue with decision makers": "drustvo", "Community development": "drustvo", "Social responsibility of educational institutions": "drustvo", "International cooperation, international relations, development cooperation": "drustvo", "International relations and development cooperation": "drustvo", "Inter-regional cooperation": "drustvo", "Regional dimension and cooperation": "drustvo", "Development of disadvantaged rural and urban areas": "drustvo", "Rural development and urbanisation": "drustvo", "Tackling geographical remoteness and involving rural areas": "drustvo", "Preventing radicalisation": "drustvo", "Prevention of conflicts, post-conflict rehabilitation": "drustvo", "Post-conflict/post-disaster rehabilitation": "drustvo"};
/* hrvatski nazivi tema iz starog popisa (u izvoru ih nema) */
const TOPIC_HR_OLD = {"New innovative curricula/educational methods/development of training courses": "Novi inovativni kurikulumi, obrazovne metode i razvoj tečajeva", "ICT - new technologies - digital competences": "IKT – nove tehnologije – digitalne kompetencije", "Creativity and culture": "Kreativnost i kultura", "Inclusion - equity": "Uključivanje – pravednost", "Key Competences (incl. mathematics and literacy) - basic skills": "Ključne kompetencije (uklj. matematiku i pismenost) – osnovne vještine", "EU Citizenship, EU awareness and Democracy": "Građanstvo EU-a, svijest o EU-u i demokracija", "International cooperation, international relations, development cooperation": "Međunarodna suradnja, međunarodni odnosi, razvojna suradnja", "Intercultural/intergenerational education and (lifelong)learning": "Međukulturno i međugeneracijsko obrazovanje i cjeloživotno učenje", "Early School Leaving / combating failure in education": "Rano napuštanje školovanja / borba protiv neuspjeha u obrazovanju", "Health and wellbeing": "Zdravlje i dobrobit", "Youth (Participation, Youth Work, Youth Policy)": "Mladi (sudjelovanje, rad s mladima, politika za mlade)", "Labour market issues incl. career guidance / youth unemployment": "Tržište rada, uklj. profesionalno usmjeravanje i nezaposlenost mladih", "Access for disadvantaged": "Pristup za osobe u nepovoljnom položaju", "Disabilities - special needs": "Invaliditet – posebne potrebe", "Civic engagement / responsible citizenship": "Građanski angažman / odgovorno građanstvo", "Quality Improvement Institutions and/or methods (incl. school development)": "Unaprjeđenje kvalitete ustanova i metoda (uklj. razvoj škole)", "Gender equality / equal opportunities": "Rodna ravnopravnost / jednake mogućnosti", "Social dialogue": "Socijalni dijalog", "Natural sciences": "Prirodne znanosti", "Overcoming skills mismatches (basic/transversal)": "Nadvladavanje neusklađenosti vještina (osnovne/prijenosne)", "Migrants' issues": "Pitanja migranata", "Integration of refugees": "Integracija izbjeglica", "Social entrepreneurship / social innovation": "Društveno poduzetništvo / društvene inovacije", "Regional dimension and cooperation": "Regionalna dimenzija i suradnja", "Rural development and urbanisation": "Ruralni razvoj i urbanizacija", "Quality and Relevance of Higher Education in Partner Countries": "Kvaliteta i relevantnost visokog obrazovanja u partnerskim zemljama", "Recognition (non-formal and informal learning/credits)": "Priznavanje (neformalnog i informalnog učenja, bodova)", "Transport and mobility": "Promet i mobilnost", "Ethics, religion and philosophy (incl. Inter-religious dialogue)": "Etika, religija i filozofija (uklj. međureligijski dijalog)", "Home and justice affairs (human rights & rule of law)": "Unutarnji poslovi i pravosuđe (ljudska prava i vladavina prava)", "Post-conflict/post-disaster rehabilitation": "Obnova nakon sukoba i katastrofa", "Combat violence and tackle racism, discrimination and intolerance in sport": "Borba protiv nasilja, rasizma, diskriminacije i netolerancije u sportu", "Digital skills": "Digitalne vještine", "Healthy lifestyle, active ageing": "Zdrav način života, aktivno starenje"};
function viewTeme(root) {
  const T = D.topics, years = T.years, byName = new Map(T.topics.map((x) => [x.name, x]));
  const defaults = ['Environment and climate change', 'Entrepreneurial learning - entrepreneurship education', 'Artificial Intelligence (AI) and data usage', 'Digital skills and competences', 'ICT - new technologies - digital competences'];
  const PAL = ['#004494', '#d98a00', '#0f8b8d', '#a23e87', '#6a8bc4', '#b3121d', '#6b7f1a', '#555d6e'], MAXSEL = 8;
  const nm = (x) => bi(x.name, x.hr || TOPIC_HR_OLD[x.name]), areaOf = (x) => TOPIC_AREA[x.name] || 'drustvo';
  const SCT = { both: '', new: '2021.–2027.', old: '2014.–2020.' };
  const share = (t, y) => 100 * t.counts[String(y)] / T.projects_with_topics[String(y)], inRange = (t, y) => t.scope === 'both' || (t.scope === 'old' ? y <= 2020 : y >= 2021);
  /* brzi odabiri: najčešće i kretanje (samo teme koje postoje u oba popisa, jer su jedino one usporedive kroz sve godine) */
  const top12 = [...T.topics].sort((a, b) => b.total - a.total).slice(0, 12).map((x) => x.name);
  const avg = (t, ys) => ys.reduce((s, y) => s + share(t, y), 0) / ys.length;
  const trend = T.topics.filter((t) => t.scope === 'both' && t.total >= 40).map((t) => [t.name, avg(t, years.filter((y) => y >= 2021 && y <= 2025)) - avg(t, years.filter((y) => y <= 2020))]).sort((a, b) => b[1] - a[1]);
  const PRE = { grow: trend.slice(0, 5).map((x) => x[0]), fade: trend.slice(-5).reverse().map((x) => x[0]), def: defaults, clear: [] };
  const AREAS = [['top', 'Najčešće'], ...TOPIC_AREAS], cnt = (k) => k === 'top' ? top12.length : T.topics.filter((x) => areaOf(x) === k).length;
  let sel = new Set(defaults), area = 'top', lastChosen = [], tmo = 0;
  root.innerHTML = `${head('Teme i problemi · Teme kroz vrijeme', 'Kako se mijenjaju teme', 'Udio projekata s odabranom temom po godini poziva. Odaberite do osam tema.')}<p class="lead">Popis tema promijenjen je 2021., pa se crte ne spajaju preko te granice.</p>
  <div class="grid two"><section class="card"><h2>Udio projekata s temom</h2><p class="lead">Postotak projekata godine koji imaju odabranu temu.</p><div class="chartbox" id="chart" role="img" aria-label="Udio projekata po temi i godini"></div><div class="chips" id="legend"></div><p class="lead small" id="none" hidden style="margin-top:8px">Odaberite barem jednu temu.</p><p class="lead small" style="margin-top:10px">2026. je nepotpuna godina (prazna točka).</p><details style="margin-top:10px"><summary>Tablica podataka</summary><div style="overflow-x:auto"><table id="dtable"></table></div></details></section>
  <section class="card" id="tcard"><div class="tphead"><h2>Odaberite teme</h2><span class="pill blue mono" id="tcount" translate="no" aria-live="polite"></span></div><p class="lead">Odaberite područje, a zatim označite teme. Najviše osam odjednom.</p>
    <div class="chipset" id="areas" role="radiogroup" aria-label="Područje">${AREAS.map(([k, l]) => `<button type="button" role="radio" data-a="${k}" aria-checked="${k === area}">${l}<em translate="no">${cnt(k)}</em></button>`).join('')}</div>
    <div class="tquick" role="group" aria-label="Brzi odabir"><button type="button" data-q="grow">↗ Najviše rastu</button><button type="button" data-q="fade">↘ Najviše slabe</button><button type="button" data-q="def">Zadano</button><button type="button" data-q="clear">Očisti odabir</button></div>
    <p class="lead small tmax" id="tmax" role="status" hidden>Najviše osam tema odjednom. Uklonite neku da dodate novu.</p>
    <div class="thead" aria-hidden="true"><span>Tema</span><span>Projekata</span></div><div class="picker" id="picker"></div></section></div>`;
  const picker = $('#picker', root);
  function paintPicker() {
    $$('#areas button', root).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.a === area)));
    const list = area === 'top' ? top12.map((n) => byName.get(n)) : T.topics.filter((x) => areaOf(x) === area).sort((a, b) => b.total - a.total);
    picker.innerHTML = list.map((x) => `<label class="trow"><input type="checkbox" value="${esc(x.name)}"${sel.has(x.name) ? ' checked' : ''}><span class="tn">${esc(nm(x))}${SCT[x.scope] ? `<small>${SCT[x.scope]}</small>` : ''}</span><span class="tc mono" translate="no">${fmt(x.total)}</span></label>`).join('');
  }
  function draw() {
    const chosen = [...sel].map((n) => byName.get(n)); lastChosen = chosen; $('#none', root).hidden = chosen.length > 0; $('#tcount', root).textContent = `${sel.size} / ${MAXSEL}`;
    const W = innerWidth < 600 ? 420 : 680, H = innerWidth < 600 ? 320 : 340, ml = 44, mr = 16, mt = 16, mb = 36, X = (y) => ml + (y - years[0]) / (years.at(-1) - years[0]) * (W - ml - mr);
    const top = Math.ceil(Math.max(10, ...chosen.flatMap((t) => years.filter((y) => inRange(t, y)).map((y) => share(t, y)))) / 10) * 10, Y = (v) => mt + (1 - v / top) * (H - mt - mb);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="presentation" font-size="12">`;
    for (let v = 0; v <= top; v += top > 40 ? 20 : 10) svg += `<line x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}" stroke="#d9e0ec"/><text x="${ml - 6}" y="${Y(v) + 4}" text-anchor="end" fill="#566782">${v} %</text>`;
    for (const y of years) svg += `<text x="${X(y)}" y="${H - 12}" text-anchor="middle" fill="#566782">${String(y).slice(2)}${y === 2026 ? '*' : ''}</text>`;
    const bx = (X(2020) + X(2021)) / 2; svg += `<line x1="${bx}" x2="${bx}" y1="${mt}" y2="${H - mb}" stroke="#f8ae21" stroke-width="2" stroke-dasharray="5 4"/><text x="${bx + 6}" y="${mt + 12}" fill="#8a4a00">popis tema promijenjen</text>`;
    chosen.forEach((t, i) => { const c = PAL[i % 8], segs = []; let cur = []; for (const y of years) { if (inRange(t, y)) cur.push(y); else if (cur.length) { segs.push(cur); cur = []; } } if (cur.length) segs.push(cur);
      for (const sg of segs) { svg += `<polyline fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round" points="${sg.map((y) => `${X(y)},${Y(share(t, y))}`).join(' ')}"/>`; for (const y of sg) svg += `<circle cx="${X(y)}" cy="${Y(share(t, y))}" r="3.6" fill="${y === 2026 ? '#fff' : c}" stroke="${c}" stroke-width="1.6"><title>${esc(nm(t))}, ${y}: ${dec(share(t, y))} % (${t.counts[y]})</title></circle>`; } });
    $('#chart', root).innerHTML = svg + '</svg>';
    $('#legend', root).innerHTML = chosen.map((t, i) => `<button type="button" class="chip" data-n="${esc(t.name)}" style="border-color:${PAL[i % 8]}"><span style="color:${PAL[i % 8]}" aria-hidden="true">●</span> ${esc(nm(t))} <small>${SCT[t.scope] ? `(${SCT[t.scope]})` : ''}</small><i aria-hidden="true">×</i><span class="sr">Ukloni</span></button>`).join('');
    $$('#legend button', root).forEach((b) => b.onclick = () => { sel.delete(b.dataset.n); paintPicker(); draw(); });
    $('#dtable', root).innerHTML = `<thead><tr><th>Godina</th>${chosen.map((t) => `<th class="num">${esc(nm(t))}</th>`).join('')}</tr></thead><tbody>${years.map((y) => `<tr><td class="mono">${y}</td>${chosen.map((t) => `<td class="num">${inRange(t, y) ? `${dec(share(t, y))} % (${t.counts[y]})` : '–'}</td>`).join('')}</tr>`).join('')}</tbody>`;
  }
  picker.onchange = (e) => {
    const n = e.target.value;
    if (e.target.checked) { if (sel.size >= MAXSEL) { e.target.checked = false; const m = $('#tmax', root); m.hidden = false; clearTimeout(tmo); tmo = setTimeout(() => { m.hidden = true; }, 3500); return; } sel.add(n); } else sel.delete(n);
    draw();
  };
  $$('#areas button', root).forEach((b) => b.onclick = () => { area = b.dataset.a; paintPicker(); });
  $$('.tquick button', root).forEach((b) => b.onclick = () => { sel = new Set(PRE[b.dataset.q]); $('#tmax', root).hidden = true; paintPicker(); draw(); });
  paintPicker(); draw();
  Xport.mount(root, () => ({ id: 'teme-kroz-vrijeme', title: 'Udio projekata s odabranom temom po godini poziva', filters: [['Odabrane teme', lastChosen.map(nm).join('; ') || '—']], cols: [{ h: 'Godina poziva', t: 'year' }, ...lastChosen.map((t) => ({ h: nm(t) + ' (%)', t: 'dec' }))], rows: years.map((y) => [y, ...lastChosen.map((t) => inRange(t, y) ? +share(t, y).toFixed(1) : '')]) }), { after: '.grid.two' });
}

/* ============ view: Organizacije ============ */
const O = () => D.orgs.map((o) => ({ id: o[0], name: o[1], town: o[2], county: o[3], cls: o[4], projects: o[5], coordinated: o[6], p1: o[7], p2: o[8], c1: o[9], c2: o[10] }));
function viewOrganizacije(root) {
  const orgs = O(), counties = [...new Set(orgs.map((o) => o.county).filter(Boolean))].sort((a, b) => a.localeCompare(b, LANG)), classes = [...new Set(orgs.map((o) => o.cls).filter(Boolean))].sort((a, b) => (LAB.cls[a] || a).localeCompare(LAB.cls[b] || b, LANG));
  let st = { q: '', county: '', cls: '', period: '', coord: false, sort: 'p' }, shownO = 25, lastList = [], lastVal = (o) => ({ pj: o.projects, cd: o.coordinated });
  root.innerHTML = `${head('Pretraži · Organizacije', 'Organizacije u KA2 partnerstvima', 'Pretražite hrvatske organizacije po nazivu ili mjestu i suzite ih po županiji i vrsti.')}
  <section class="filters" aria-label="Filteri"><label class="f"><span class="lab">Pretraga</span><input id="q" type="search" placeholder="Naziv ili mjesto…" autocomplete="off"></label><label class="f"><span class="lab">Županija</span><select id="c"><option value="">Sve županije</option>${counties.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label><label class="f"><span class="lab">Vrsta organizacije</span><select id="k"><option value="">Sve vrste</option>${classes.map((c) => `<option value="${c}">${LAB.cls[c] || c}</option>`).join('')}</select></label>${seg('s-per', 'Razdoblje', [['', 'Sva'], ['1', '2014.–2020.'], ['2', '2021.–2027.']], '')}<label class="f"><span class="lab">Poredak</span><select id="o"><option value="p">Po broju projekata</option><option value="c">Po koordinacijama</option><option value="n">Po nazivu</option></select></label><label class="chk"><input id="co" type="checkbox">Samo koordinatori</label>${resetBtn}</section>
  <p class="summary" id="count" aria-live="polite"></p><div class="tablewrap"><table><thead><tr><th>Naziv</th><th>Mjesto</th><th>Županija</th><th>Vrsta</th><th class="num">Projekata</th><th class="num">Koordinirano</th></tr></thead><tbody id="rows"></tbody></table></div><div class="more-wrap"><button class="more" id="omore" type="button" hidden>Prikaži još</button></div>`;
  function paint() {
    $$('#s-per button', root).forEach((b) => b.setAttribute('aria-pressed', String(st.period === b.dataset.v)));
    const val = (o) => ({ pj: st.period ? o['p' + st.period] : o.projects, cd: st.period ? o['c' + st.period] : o.coordinated }); lastVal = val;
    const needle = fold(st.q), list = orgs.filter((o) => { const v = val(o); return v.pj > 0 && (!st.coord || v.cd > 0) && (!needle || fold(o.name + ' ' + (o.town || '')).includes(needle)) && (!st.county || o.county === st.county) && (!st.cls || o.cls === st.cls); });
    list.sort((a, b) => { const x = val(a), y = val(b); if (st.sort === 'n') return a.name.localeCompare(b.name, LANG); return (st.sort === 'c' ? y.cd - x.cd || y.pj - x.pj : y.pj - x.pj || y.cd - x.cd) || a.name.localeCompare(b.name, LANG); });
    lastList = list;
    $('#count', root).innerHTML = `<b>${Math.min(list.length, shownO)}</b> / ${fmt(list.length)} prikazano`; $('#omore', root).hidden = list.length <= shownO;
    $('#rows', root).innerHTML = list.slice(0, shownO).map((o) => { const v = val(o); return `<tr class="click" data-id="${esc(o.id)}"><td><a href="#/organizacije/${encodeURIComponent(o.id)}">${esc(o.name)}</a></td><td>${esc(o.town || '')}</td><td>${esc(o.county || '')}</td><td><span class="pill">${LAB.cls[o.cls] || o.cls || ''}</span></td><td class="num">${fmt(v.pj)}</td><td class="num">${fmt(v.cd)}</td></tr>`; }).join('');
    $$('#rows tr', root).forEach((r) => r.onclick = (e) => { if (e.target.tagName !== 'A') go('#/organizacije/' + encodeURIComponent(r.dataset.id)); });
  }
  $('#q', root).oninput = (e) => { st.q = e.target.value; shownO = 25; paint(); }; $('#c', root).onchange = (e) => { st.county = e.target.value; shownO = 25; paint(); }; $('#k', root).onchange = (e) => { st.cls = e.target.value; shownO = 25; paint(); }; $('#o', root).onchange = (e) => { st.sort = e.target.value; paint(); }; $('#omore', root).onclick = () => { shownO += 25; paint(); }; $('#co', root).onchange = (e) => { st.coord = e.target.checked; paint(); };
  $$('#s-per button', root).forEach((b) => b.onclick = () => { st.period = b.dataset.v; paint(); });
  Xport.mount(root, () => ({ id: 'organizacije', title: 'Organizacije u KA2 partnerstvima', filters: [['Pretraga', st.q.trim() || '—'], ['Županija', st.county || 'Sve županije'], ['Vrsta organizacije', st.cls ? (LAB.cls[st.cls] || st.cls) : 'Sve vrste'], ['Razdoblje', st.period === '1' ? LAB.period['2014-2020'] : st.period === '2' ? LAB.period['2021-2027'] : 'Sva razdoblja'], ['Samo koordinatori', st.coord ? 'da' : 'ne']], cols: [{ h: 'ID organizacije' }, { h: 'Naziv' }, { h: 'Mjesto' }, { h: 'Županija' }, { h: 'Vrsta organizacije' }, { h: 'Projekata', t: 'int' }, { h: 'Koordinirano', t: 'int' }], rows: lastList.map((o) => { const v = lastVal(o); return [o.id, o.name, o.town || '', o.county || '', LAB.cls[o.cls] || o.cls || '', v.pj, v.cd]; }) }));
  $('#reset', root).onclick = () => { st = { q: '', county: '', cls: '', period: '', coord: false, sort: 'p' }; $('#q', root).value = ''; $('#c', root).value = ''; $('#k', root).value = ''; $('#o', root).value = 'p'; $('#co', root).checked = false; paint(); };
  paint();
}

/* ============ view: Organizacija (detalj) ============ */
const SAMPLE = { name: 'Gimnazija Metković', years: { 2014: [0], 2015: [0, 'g'], 2018: [0], 2019: [0], 2020: [0, 0, 'g'], 2022: [0], 2023: [0, 0, 0, 'c', 0, 'g'], 2024: [0], 2025: [0], 2026: [0] },
  projects: [[2026, 'Tracing Ancient Paths for Health, Wellness and European Digital Heritage', 'Suradnja', 'P', 'IT', 'U tijeku'], [2025, 'Each Young Excluded is a New Potential', 'Mala partnerstva', 'P', 'RO', 'U tijeku'], [2024, 'Mémoires unies : éclairer l’avenir à travers l’histoire', 'Mala partnerstva', 'P', 'FR', 'U tijeku'], [2023, 'Biljna pozornica', 'Suradnja', 'K', 'HR', 'Završen'], [2023, 'Big Data unites the Sciences and the Arts', 'Suradnja (VET)', 'P', 'ES', 'Završen · dobra praksa']],
  countries: [['Italija', 11], ['Turska', 9], ['Španjolska', 8], ['Poljska', 8], ['Rumunjska', 6], ['Francuska', 5], ['Portugal', 5]], topics: [['Digitalne vještine i kompetencije', 8], ['Okoliš i klimatske promjene', 7], ['Građanstvo EU-a i demokracija', 3], ['Učenje stranih jezika', 3]] };
/* neobavezni potpuni podaci: orgs_full.json / projects_full.json (pipeline ih generira u site/src/data; ovdje se čitaju uz stranicu,
   npr. iz mape data/ pokraj HTML-a). Bez njih (file://, nema datoteka) prikazuju se podaci iz popisa i uzorak. */
const FULL = (() => {
  const cache = {}, idx = {};
  const base = () => window.EK_DATA_BASE;
  const load = (name) => cache[name] || (cache[name] = /^https?:$/.test(location.protocol) ? fetch(base() + name).then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null));
  const find = async (name, key, id) => { const one = await fetch(window.EK_DATA_BASE + (name[0] === 'p' ? 'p/' : 'o/') + EK_SLUG(id) + '.json').then((r) => (r.ok ? r.json() : null)).catch(() => null); if (one) return one; return null; };
  const findOld = async (name, key, id) => { const all = await load(name); if (!all) return null; if (!idx[name]) idx[name] = all[id] ? all : Object.fromEntries(Object.values(all).map((x) => [x[key], x])); return idx[name][id] || all[id] || null; };
  return { org: (id) => find('orgs_full.json', 'org_id', id), project: (id) => find('projects_full.json', 'project_id', id) };
})();
const STATUS_API = { finalized: 0, ongoing: 1, terminated: 2 };
const statusHr = (s) => (s in STATUS_API ? LAB.status[STATUS_API[s]] : s || '');
const topicLab = (name) => { const t = D.topics.topics.find((x) => x.name === name); return t ? bi(t.name, t.hr) : name; };
const orgFromFull = (f) => {
  const pr = f.periods || {}, ps = f.projects || [];
  return { full: true, all: pr.all || {}, p1: pr['2014-2020'] || {}, p2: pr['2021-2027'] || {}, eu: f.eu_org_type || '', reg: f.register_kind || '',
    projects: ps.map((p) => ({ id: p.id, year: p.year, title: p.title, type: p.type || '', coord: p.role === 'coordinator', lead: p.lead || '', status: statusHr(p.status) + (p.good_practice ? ' · dobra praksa' : ''), gp: !!p.good_practice })),
    countries: (f.countries || []).map(([c, n]) => [country(c), n]), topics: (f.topics || []).map(([t, n]) => [topicLab(t), n]), gp: f.good_practice || 0, similar: f.similar || null };
};
const orgFromSample = () => ({ full: false, sample: true, projects: SAMPLE.projects.map((p) => ({ id: '', year: p[0], title: p[1], type: p[2], coord: p[3] === 'K', lead: p[4], status: p[5], gp: /dobra praksa/.test(p[5]) })), countries: SAMPLE.countries, topics: SAMPLE.topics, years: SAMPLE.years });
function viewOrganizacija(root, id) {
  const orgs = O(), o = orgs.find((x) => x.id === id);
  if (!o) { root.innerHTML = head('Organizacija', 'Organizacija nije pronađena', '') + '<p><a href="#/organizacije">← Natrag na popis</a></p>'; return; }
  const county = D.counties.find((c) => c.stem === o.county), isSample = o.name === SAMPLE.name;
  const sim = orgs.filter((x) => x.id !== o.id && x.county === o.county && x.cls === o.cls).sort((a, b) => b.projects - a.projects).slice(0, 4);
  const eurf = (v) => (v == null ? '—' : v >= 1e6 ? mil(v) : fmt(v) + ' €');
  let X = isSample ? orgFromSample() : null, role = '', allRows = false, seq = 0;
  function paint() {
    const full = X && X.full, has = !!X, ps = has ? X.projects : [];
    const nK = has ? ps.filter((p) => p.coord).length : 0, nP = has ? ps.length - nK : 0;
    const years = has ? (X.years ? Object.keys(X.years).map(Number) : (() => { const ys = ps.map((p) => p.year).filter(Boolean); const out = []; for (let y = Math.min(...ys); y <= Math.max(...ys); y++) out.push(y); return out; })()) : [];
    const dots = has ? years.map((y) => { const tk = X.years ? X.years[y] : ps.filter((p) => p.year === y).map((p) => (p.coord ? 'c' : '') + (p.gp ? 'g' : '')); return `<div class="col">${tk.map((t) => `<i class="dot ${/c/.test(String(t)) ? 'c' : ''} ${/g/.test(String(t)) ? 'g' : ''}"></i>`).join('')}<span>'${String(y).slice(2)}${y >= 2026 && full ? '*' : ''}</span></div>`; }).join('') : '';
    const rows = ps.filter((p) => !role || (role === 'coordinator') === p.coord), shown = allRows || !full ? rows : rows.slice(0, 12);
    const a = full ? X.all : {}, kpi4 = full ? `<article class="card kpi plain"><small>Grantovi koordiniranih projekata</small><div class="big">${eurf(a.grants_coordinated_eur)}</div><small>Vrijednost svih projekata: <span translate="no">${eurf(a.value_involved_eur)}</span></small><small>${fmt(X.gp)} s oznakom dobre prakse</small></article>` : `<article class="card kpi plain"><small>Grantovi, dobra praksa</small><div class="big na">—</div><small>Dolazi iz orgs_full.json</small></article>`;
    const k2 = full && a.coordinated != null ? [a.coordinated, a.partner_only != null ? a.partner_only : o.projects - a.coordinated] : [o.coordinated, o.projects - o.coordinated];
    const simList = full && X.similar ? X.similar.map((x) => ({ id: x.id, name: x.name, town: x.town, projects: x.projects })) : sim.map((x) => ({ id: x.id, name: x.name, town: x.town, projects: x.projects }));
    root.innerHTML = `<nav class="crumbs" aria-label="Putanja"><a href="#/organizacije">Organizacije</a>${county ? `<a href="#/mjesta/${encodeURIComponent(county.stem)}">${esc(o.county)}</a>` : ''}<span>${esc(o.town || '')}</span></nav>
  <header class="pagehead"><div class="kicker">Organizacija · ${LAB.cls[o.cls] || o.cls || ''}</div><h1>${esc(o.name)}</h1><p class="lead">${esc([o.town, o.county].filter(Boolean).join(' · '))}</p>
  <div class="chips"><span class="pill blue">${LAB.cls[o.cls] || o.cls || ''}</span>${full && X.reg ? `<span class="pill">${esc(X.reg)}</span>` : ''}</div></header>
  <div class="grid kpis4"><article class="card kpi plain"><small>KA2 projekata, 2014.–2026.</small><div class="big">${fmt(o.projects)}</div><small>${fmt(o.p1)} u 2014.–2020. · ${fmt(o.p2)} u 2021.–2027.</small></article>
  <article class="card kpi plain"><small>Uloga</small><div class="big">${fmt(k2[0])} <span>koordinator</span></div><small>${fmt(k2[1])} kao partner</small></article>
  <article class="card kpi plain"><small>Koordinacije po razdoblju</small><div class="big">${fmt(o.c1)} <span>/</span> ${fmt(o.c2)}</div><small>2014.–2020. / 2021.–2027.</small></article>
  ${kpi4}</div>
  ${has ? '' : '<div class="note">Detaljni dijelovi (vremenska crta, popis projekata, partneri, teme) čitaju se iz <span class="mono">orgs_full.json</span>, koji se generira u pipelineu. Ispod je raspored; pun primjer vidi se na organizaciji „Gimnazija Metković”.</div>'}
  <div class="grid two"><div class="stack">
  <section class="card"><div class="head"><h2>Sudjelovanje kroz vrijeme</h2><div class="keys"><span><i class="dot c"></i>Koordinator</span><span><i class="dot"></i>Partner</span><span><i class="dot g"></i>Dobra praksa</span></div></div>
  ${has && years.length ? `<div class="dots" role="img" aria-label="Sudjelovanje po godinama">${dots}</div>` : `<div style="margin-top:12px">${rank([{ label: '2014.–2020.', v: o.p1, text: fmt(o.p1) }, { label: '2021.–2027.', v: o.p2, text: fmt(o.p2) }], { nonum: true, max: Math.max(1, o.p1, o.p2) })}</div>`}
  <p class="lead small" style="margin-top:10px">Izbor za 2026. još traje pa je zadnja godina nepotpuna. Granica razdoblja: popisi tema 2014.–2020. i 2021.–2027. razlikuju se.</p></section>
  <section class="card"><div class="head"><h2>Projekti</h2>${has ? `<div class="seg" role="group" aria-label="Uloga"><button type="button" data-role="" aria-pressed="${role === ''}">Svi ${fmt(ps.length)}</button><button type="button" data-role="coordinator" aria-pressed="${role === 'coordinator'}">Koordinator ${fmt(nK)}</button><button type="button" data-role="partner" aria-pressed="${role === 'partner'}">Partner ${fmt(nP)}</button></div>` : ''}</div>
  <div class="tablewrap"><table><thead><tr><th>Godina</th><th>Projekt</th><th>Vrsta</th><th>Uloga</th><th>Vodi</th><th>Status</th></tr></thead><tbody id="prows">${has ? shown.map((p) => `<tr data-role="${p.coord ? 'coordinator' : 'partner'}"><td class="mono">${p.year}</td><td>${p.id ? `<a href="#/projekti/${encodeURIComponent(p.id)}">${esc(p.title)}</a>` : `<a href="#/projekti/uzorak">${esc(p.title)}</a>`}</td><td>${esc(p.type)}</td><td>${p.coord ? '<span class="badge">Koordinator</span>' : 'Partner'}</td><td class="mono" title="${esc(p.lead ? country(p.lead) : '')}">${esc(p.lead)}</td><td>${esc(p.status)}</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty">Popis projekata organizacije dolazi iz datoteke orgs_full.json.</div></td></tr>'}</tbody></table></div>
  ${has && !full ? `<p class="lead small" style="margin-top:10px">Prikazan je uzorak od ${ps.length} projekata; pun popis dolazi iz datoteke <span class="mono">orgs_full.json</span>.</p>` : ''}
  ${full && rows.length > shown.length ? `<p><button type="button" class="btn" id="omore2">Prikaži sve ${fmt(rows.length)}</button></p>` : ''}</section></div>
  <div class="stack"><section class="card"><h2>Najčešće surađuje s</h2><p class="lead small">Države u zajedničkim projektima (broj projekata).</p>${has && X.countries.length ? rank(X.countries.slice(0, 9).map(([c, n]) => ({ label: c, v: n, text: String(n) })), { nonum: true, cls: 'alt compact', max: Math.max(1, ...X.countries.map((c) => c[1])) }) : has ? '<div class="empty">Nema partnerskih država u podacima.</div>' : '<div class="empty">Popis partnerskih država dolazi iz datoteke orgs_full.json.</div>'}</section>
  <section class="card"><h2>Teme koje se ponavljaju</h2><div style="margin-top:10px">${has && X.topics.length ? X.topics.map(([t, n]) => `<span class="tag">${esc(t)}<b>${n}</b></span>`).join('') : has ? '<div class="empty">Nema tema u podacima.</div>' : '<div class="empty">Teme organizacije dolaze iz datoteke orgs_full.json.</div>'}</div></section></div></div>
  ${simList.length ? `<section><h2 class="sh">Slične organizacije</h2><p class="lead small">Ista vrsta organizacije u istoj županiji, po broju projekata.</p><div class="grid kpis4">${simList.map((x) => `<${x.id ? 'a' : 'div'} class="card kpi plain" ${x.id ? `style="text-decoration:none" href="#/organizacije/${encodeURIComponent(x.id)}"` : ''}><div class="kicker">${esc(x.town || '')}</div><h3>${esc(x.name)}</h3><strong>${fmt(x.projects)} KA2 projekata</strong></${x.id ? 'a' : 'div'}>`).join('')}</div></section>` : ''}`;
    $$('.seg [data-role]', root).forEach((b) => b.onclick = () => { role = b.dataset.role; allRows = false; paint(); });
    const m2 = $('#omore2', root); if (m2) m2.onclick = () => { allRows = true; paint(); };
  }
  paint();
  const my = ++seq;
  FULL.org(id).then((f) => { if (f && root.isConnected && my === seq && true) { X = orgFromFull(f); paint(); } });
}

/* ============ view: Graf ============ */
let CONCEPT_ORGS = null;
function ekPartners(n, box) {
  const draw = (all) => { const c = all && all[n[0]]; if (!c || !c.top || !c.top.length || !box.isConnected) return; const s = document.createElement('section'); s.className = 'partners'; s.innerHTML = `<div class="kicker">${tr('Hrvatske organizacije u projektima s ovim pojmom')}</div><ul class="check-list" style="margin-top:8px">${c.top.map(([id, nm, k]) => `<li><a href="#/organizacije/${encodeURIComponent(id)}">${esc(nm)}</a> <span class="mono small">· ${k} ${tr('projekata')}</span></li>`).join('')}</ul>`; box.append(s); };
  if (CONCEPT_ORGS) draw(CONCEPT_ORGS); else fetch(window.EK_DATA_BASE + 'concept_orgs.json').then((r) => (r.ok ? r.json() : null)).then((j) => { CONCEPT_ORGS = j || {}; draw(CONCEPT_ORGS); }).catch(() => { CONCEPT_ORGS = {}; });
}
function viewGraf(root) {
  const g = D.graph, N = g.nodes, KIND = { approach: ['Pristup', '#2a78d6'], target_group: ['Ciljna skupina', '#eb6834'], output: ['Rezultat', '#1baf7a'], problem: ['Problem', '#4b5563'], topic: ['Tema', '#7d7d77'] };
  const name = (n) => bi(n[2], n[3]), neigh = new Map();
  for (const [a, b, n] of g.edges) for (const [x, y] of [[a, b], [b, a]]) { if (!neigh.has(x)) neigh.set(x, []); neigh.get(x).push([y, n, n / Math.sqrt(N[x][4] * N[y][4])]); }
  root.innerHTML = `${head('Teme i problemi · Mreža pojmova', 'Mreža pojmova', 'Pojmovi koji se u projektima pojavljuju zajedno: pristupi, ciljne skupine, rezultati, problemi i teme. Veći krug znači više projekata, a crta znači zajedničke projekte.')}
  <div class="note">Ovo su pojmovi izdvojeni iz sažetaka projekata automatskom obradom pa je to pregled obrazaca, a ne službena klasifikacija.</div>
  <section class="card" style="margin-top:12px"><label for="cs" class="small">Pretraži pojmove</label><input id="cs" class="field s" type="search" autocomplete="off" placeholder="npr. učitelji, digitalne vještine…" style="width:100%;margin:8px 0"><ul id="cres" style="list-style:none;padding:0;margin:0 0 8px;max-height:200px;overflow:auto"></ul><div style="margin:6px 0 10px">${Object.values(KIND).map(([l, c]) => `<span class="gv-key"><i style="background:${c}"></i>${l}</span>`).join('')}</div><div class="gv"><svg id="gsvg" viewBox="0 0 900 560" role="img" aria-label="Mreža najčešćih pojmova"></svg></div><p class="lead small" style="margin-top:8px">Prikazano je 120 najčešćih pojmova od ${fmt(N.length)}. Kliknite pojam za detalje.</p></section>
  <section class="card" id="cpanel" aria-live="polite" style="margin-top:14px"><div class="kicker">Odabrani pojam</div><p class="lead" id="chint" style="margin-top:6px">Odaberite pojam u mreži ili ga potražite iznad.</p><div id="cbody" hidden></div></section>
  <details class="fold"><summary>Skupine projekata (${g.communities.length})</summary><p class="lead small">Projekti se prirodno grupiraju prema pojmovima koje dijele. Otvorite skupinu za detalje.</p><div class="grid" id="comms"></div></details>`;
  const svg = $('#gsvg', root), idx = N.map((_, i) => i).sort((a, b) => N[b][4] - N[a][4]).slice(0, 120), inSet = new Set(idx), ed = g.edges.filter(([a, b]) => inSet.has(a) && inSet.has(b));
  const pos = new Map(idx.map((i, k) => [i, { x: 450 + 220 * Math.cos(k * 2.4), y: 280 + 150 * Math.sin(k * 2.4), vx: 0, vy: 0 }]));
  for (let it = 0; it < 320; it++) { const cool = 1 - it / 320;
    for (const a of idx) for (const b of idx) { if (a >= b) continue; const p = pos.get(a), q = pos.get(b); let dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy + .01, f = 7000 / d2, d = Math.sqrt(d2); dx /= d; dy /= d; p.vx += dx * f; p.vy += dy * f; q.vx -= dx * f; q.vy -= dy * f; }
    for (const [a, b, n] of ed) { const p = pos.get(a), q = pos.get(b); const dx = q.x - p.x, dy = q.y - p.y, d = Math.sqrt(dx * dx + dy * dy) + .01, f = (d - 70) * .004 * Math.min(3, Math.log(n + 1)); p.vx += dx / d * f * d * .05; p.vy += dy / d * f * d * .05; q.vx -= dx / d * f * d * .05; q.vy -= dy / d * f * d * .05; }
    for (const i of idx) { const p = pos.get(i); p.vx += (450 - p.x) * .004; p.vy += (280 - p.y) * .006; p.x += Math.max(-14, Math.min(14, p.vx)) * cool; p.y += Math.max(-14, Math.min(14, p.vy)) * cool; p.vx *= .55; p.vy *= .55; } }
  const xs = idx.map((i) => pos.get(i).x), ys = idx.map((i) => pos.get(i).y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const px = (v) => 50 + (v - x0) / (x1 - x0 || 1) * 800, py = (v) => 40 + (v - y0) / (y1 - y0 || 1) * 480, maxN = N[idx[0]][4], rad = (i) => 5 + Math.sqrt(N[i][4] / maxN) * 22;
  let sel = -1;
  function draw() {
    const near = sel >= 0 ? new Set([sel, ...(neigh.get(sel) || []).map((x) => x[0])]) : null;
    let s = ed.map(([a, b, n]) => { const on = near && (a === sel || b === sel); return `<line x1="${px(pos.get(a).x)}" y1="${py(pos.get(a).y)}" x2="${px(pos.get(b).x)}" y2="${py(pos.get(b).y)}" stroke="${on ? '#0f1b3a' : '#5a6785'}" stroke-opacity="${near ? (on ? .85 : .05) : .22}" stroke-width="${on ? 1.8 : .8}"/>`; }).join('');
    for (const i of idx) { const p = pos.get(i), dim = near && !near.has(i), lab = i === sel || (!near && idx.indexOf(i) < 12) || (near && near.has(i) && idx.indexOf(i) < 40);
      s += `<g class="gn" data-i="${i}" tabindex="0" role="button" aria-label="${esc(name(N[i]))}, ${N[i][4]} ${tr('projekata')}" style="cursor:pointer;opacity:${dim ? .25 : 1}"><circle cx="${px(p.x)}" cy="${py(p.y)}" r="${rad(i)}" fill="${N[i][1] === 'topic' ? '#fff' : KIND[N[i][1]][1]}" stroke="${i === sel ? '#0f1b3a' : (N[i][1] === 'topic' ? KIND.topic[1] : '#fff')}" stroke-width="${i === sel ? 3.5 : 2}"/>${lab ? `<text x="${px(p.x)}" y="${py(p.y) - rad(i) - 5}" text-anchor="middle" font-size="11.5" fill="#0f1b3a" stroke="#fff" stroke-width="3.5" paint-order="stroke" style="pointer-events:none">${esc(name(N[i]).slice(0, 28))}</text>` : ''}</g>`; }
    svg.innerHTML = s; $$('.gn', svg).forEach((e) => { e.onclick = () => show(+e.dataset.i); e.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); show(+e.dataset.i); } }; });
  }
  function show(i) {
    sel = i; draw(); const n = N[i], rel = (neigh.get(i) || []).sort((a, b) => b[2] - a[2]), comm = g.communities.find((k) => k.id === n[10]);
    const groups = ['target_group', 'approach', 'output', 'problem', 'topic'].map((kd) => { const it = rel.filter((r) => N[r[0]][1] === kd).slice(0, 5); return it.length ? `<div><div class="kicker" style="color:var(--muted)">${KIND[kd][0]}</div><ul style="padding-left:18px;margin:6px 0 10px">${it.map((r) => `<li><button type="button" class="linkish" data-i="${r[0]}">${esc(name(N[r[0]]))}</button> <span class="mono small">· zajedno ${fmt(r[1])}</span></li>`).join('')}</ul></div>` : ''; }).join('');
    $('#cbody', root).innerHTML = `<h3 style="margin:4px 0">${esc(name(n))}</h3><p class="lead" style="margin:0 0 8px">${KIND[n[1]][0]} · ${fmt(n[4])} projekata (${Math.round(n[4] / g.projects * 100)} %)</p><p class="lead small" style="margin:0 0 8px">Razdoblja: 2014.–2020. ${fmt(n[5])} · 2021.–2027. ${fmt(n[6])}</p>${comm ? `<p class="lead small" style="margin:0 0 8px">Skupina: ${esc(comm.name[1] || comm.name[0])}</p>` : ''}<div class="grid three" style="margin-top:6px">${groups}</div>`;
    ekPartners(n, $('#cbody', root));
    $('#cbody', root).hidden = false; $('#chint', root).hidden = true; $$('#cbody button[data-i]', root).forEach((b) => b.onclick = () => show(+b.dataset.i));
  }
  $('#cs', root).oninput = (e) => { const q = fold(e.target.value.trim()), ul = $('#cres', root); ul.innerHTML = ''; if (q.length < 2) return; let k = 0; for (let i = 0; i < N.length && k < 12; i++) if (fold(N[i][2] + ' ' + (N[i][3] || '')).includes(q)) { k++; const li = document.createElement('li'); li.innerHTML = `<button type="button" class="linkish" data-i="${i}">${esc(name(N[i]))}</button> <span class="mono small">· ${KIND[N[i][1]][0]} · ${fmt(N[i][4])}</span>`; li.querySelector('button').onclick = () => show(i); ul.append(li); } };
  $('#comms', root).innerHTML = g.communities.map((k) => `<details class="card"><summary><b>${esc(bi(k.name[0], k.name[1]))}</b> <span class="mono small"> · ${fmt(k.n)} projekata (${Math.round(k.share * 100)} %)</span></summary><p class="lead small" style="margin:8px 0">2014.–2020.: ${fmt(k.p1)} · 2021.–2027.: ${fmt(k.p2)}</p><div class="grid three">${[['top_approach', 'Pristupi'], ['top_target_group', 'Ciljne skupine'], ['top_output', 'Rezultati'], ['top_problem', 'Problemi'], ['top_topic', 'Teme']].filter(([key]) => k[key].length).map(([key, l]) => `<div><div class="kicker" style="color:var(--muted)">${l}</div><ul style="padding-left:18px;margin:6px 0 0">${k[key].slice(0, 5).map((a) => `<li>${esc(bi(a[0], a[1]))}</li>`).join('')}</ul></div>`).join('')}</div></details>`).join('');
  draw();
  /* links from the assistant: graph/#<concept id> opens the concept, graph/#group-C01 opens the group */
  const hh = decodeURIComponent(location.hash.slice(1));
  if (hh.startsWith('group-')) { const k = g.communities.findIndex((c) => c.id === hh.slice(6)); const d = $$('#comms details', root)[k]; if (d) { const f = $('details.fold', root); if (f) f.open = true; d.open = true; setTimeout(() => d.scrollIntoView({ block: 'center' }), 50); } }
  else if (hh) { const i = N.findIndex((x) => x[0] === hh); if (i >= 0) { show(i); setTimeout(() => $('#cpanel', root).scrollIntoView({ block: 'start' }), 50); } }
}

/* ============ view: Problemi i rješenja ============ */
/* grupiranje bliskih izraza problema (npr. tri načina da se kaže „nezaposlenost mladih") u područja; pravila se primjenjuju redom */
const PROBLEM_AREAS = [['skola', 'Napuštanje školovanja'], ['zaposl', 'Nezaposlenost mladih'], ['okolis', 'Klima i okoliš'], ['isklj', 'Isključenost i nejednakost'], ['diskr', 'Diskriminacija i netolerancija'], ['nasilje', 'Vršnjačko nasilje'], ['jezici', 'Strani jezici'], ['digital', 'Digitalne vještine i mediji'], ['motiv', 'Motivacija i samopouzdanje'], ['poduz', 'Poduzetničke vještine'], ['pouc', 'Poučavanje i rad s mladima'], ['zdrav', 'Mentalno zdravlje']];
const PROBLEM_RULES = [['skola', /school leaving|dropout/], ['diskr', /discriminat|xenophob|racism|hate speech|intoleran|stereotyp|polaris|gender inequality/], ['zaposl', /unemploy|employab/], ['okolis', /climate|environment|pollution|biodiversity|eco-/], ['isklj', /exclusion|isolation|inclusion|disadvantage|poverty|inequalit|special needs/], ['nasilje', /bullying/], ['jezici', /language/], ['digital', /digital|ict skills|media literacy/], ['poduz', /entrepreneur/], ['pouc', /teaching methods|trainers|youth work/], ['zdrav', /mental health/], ['motiv', /motivation|self-confidence|self-esteem|critical thinking|communication skills/]];
function viewProblemi(root) {
  const g = D.graph, N = g.nodes, nm = (n) => bi(n[2], n[3]), neigh = new Map();
  for (const [a, b, n] of g.edges) for (const [x, y] of [[a, b], [b, a]]) { if (!neigh.has(x)) neigh.set(x, []); neigh.get(x).push([y, n]); }
  const areaOf = (n) => (PROBLEM_RULES.find(([, re]) => re.test(n[2].toLowerCase())) || ['ostalo'])[0];
  const probs = N.map((n, i) => [n, i]).filter(([n]) => n[1] === 'problem').sort((a, b) => b[0][4] - a[0][4]);
  const cnt = (k) => k === 'sve' ? probs.length : probs.filter(([n]) => areaOf(n) === k).length;
  const AREAS = [['sve', 'Svi problemi'], ...PROBLEM_AREAS, ['ostalo', 'Ostalo']].filter(([k]) => k === 'sve' || cnt(k) > 0);
  let area = 'sve', cur = probs[0][1], shownP = 8, kind = 'approach', view = 'all', q = '', shownM = 12;
  const KD = [['approach', 'Pristupi', 'što se radi'], ['target_group', 'Ciljne skupine', 'za koga'], ['output', 'Rezultati', 'što nastaje'], ['topic', 'Teme EU-a', 'uz koju temu']];
  root.innerHTML = `${head('Teme i problemi · Problemi i rješenja', 'Problemi i rješenja', 'Koje probleme projekti navode i što uz njih najčešće rade: pristupe, ciljne skupine i rezultate.')}
  <div class="note">Pojmovi su izdvojeni automatskom obradom sažetaka projekata s hrvatskim sudionikom. Prikaz pokazuje što projekti uz neki problem najčešće rade, a ne dokazuje da to problem i rješava. Rješenja iz drugih zemalja EU-a nisu u ovom skupu podataka, a brojevi su donja granica.</div>
  <div class="grid two prob"><section class="card" id="pchoose"><h2>1. Odaberite problem</h2><p class="lead">Najprije područje, zatim izraz koji najbolje odgovara.</p>
    <div class="chipset" id="pareas" role="radiogroup" aria-label="Područje problema">${AREAS.map(([k, l]) => `<button type="button" role="radio" data-a="${k}" aria-checked="${k === area}">${l}<em translate="no">${cnt(k)}</em></button>`).join('')}</div>
    <div id="plist"></div><div class="more-wrap"><button class="more" id="pmore" type="button" hidden>Prikaži još</button></div></section>
  <section class="card" id="pdetail" aria-live="polite"></section></div>
  <section class="card pall"><h2>2. Svi pristupi, rezultati i ciljne skupine</h2><p class="lead">Što projekti uopće rade, bez obzira na problem. Trend uspoređuje udio projekata u dva programska razdoblja.</p>
    <div class="filters pf">${seg('pkind', 'Vrsta pojma', [['approach', 'Pristupi'], ['output', 'Rezultati'], ['target_group', 'Ciljne skupine']], kind)}${seg('pview', 'Prikaz', [['all', 'Najčešći'], ['growing', 'Rastu'], ['fading', 'Slabe'], ['rare', 'Rjeđi']], view)}<label class="f"><span class="lab">Filtriraj popis</span><input id="mf" type="search" placeholder="Npr. mentorstvo, učitelji…" autocomplete="off"></label></div>
    <p class="summary" id="viewnote"></p><p class="summary" id="count" style="margin-top:0"></p><div id="mlist"></div><div class="more-wrap"><button class="more" id="mmore" type="button" hidden>Prikaži još</button></div></section>`;
  const inArea = () => probs.filter(([n]) => area === 'sve' || areaOf(n) === area);
  function paintList() {
    const l = inArea(), mx = Math.max(1, ...l.map(([n]) => n[4]));
    $('#plist', root).innerHTML = rank(l.slice(0, shownP).map(([n, i]) => ({ label: nm(n), v: n[4], text: fmt(n[4]), key: String(i) })), { pick: true, sel: String(cur), nonum: true, max: mx, cls: 'compact' }) || '';
    $('#pmore', root).hidden = l.length <= shownP;
    $$('#pareas button', root).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.a === area)));
    $$('#plist button.rk', root).forEach((b) => b.onclick = () => { cur = +b.dataset.k; paintList(); paintDetail(); if (innerWidth < 1000) $('#pdetail', root).scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  const related = (i, k) => (neigh.get(i) || []).filter(([y]) => N[y][1] === k).sort((a, b) => b[1] - a[1]);
  function paintDetail() {
    const n = N[cur], pr = n[4] / g.projects, a = areaOf(n), sib = probs.filter(([m, j]) => j !== cur && areaOf(m) === a).slice(0, 4);
    const blocks = KD.map(([k, l, sub]) => { const r = related(cur, k).slice(0, 6); return `<div class="pblock"><h3>${l} <small>${sub}</small></h3>${r.length ? rank(r.map(([y, c]) => ({ label: nm(N[y]), v: c, text: fmt(c) })), { nonum: true, cls: 'alt compact', max: r[0][1] }) : '<p class="lead small">Nema dovoljno zajedničkih projekata (najmanje 3).</p>'}</div>`; }).join('');
    $('#pdetail', root).innerHTML = `<div class="kicker">Odabrani problem</div><h2 style="margin:6px 0 4px">${esc(nm(n))}</h2><p class="lead">${fmt(n[4])} projekata (${dec(pr * 100)} %) · 2014.–2020.: ${fmt(n[5])} · 2021.–2027.: ${fmt(n[6])}</p>
    ${sib.length ? `<p class="small sib"><span class="muted">Slični izrazi:</span> ${sib.map(([m, j]) => `<button type="button" class="linkish" data-j="${j}">${esc(nm(m))}</button>`).join(' · ')}</p>` : ''}
    <h3 class="sh2">Što se uz to radi <small>broj zajedničkih projekata</small></h3><div class="pblocks">${blocks}</div>
    <p class="small muted" style="margin-top:14px">Broj uz pojam znači koliko projekata navodi i taj problem i taj pojam.</p><p style="margin-top:10px"><a class="btn sm" href="#/graf">Otvori mrežu pojmova</a></p>`;
    $$('#pdetail button[data-j]', root).forEach((b) => b.onclick = () => { cur = +b.dataset.j; area = areaOf(N[cur]) === area || area === 'sve' ? area : areaOf(N[cur]); paintList(); paintDetail(); });
  }
  /* popis svih pojmova s trendom */
  const VNOTE = { all: 'Poredano po broju projekata.', growing: 'Udio u 2021.–2027. barem 1,5 puta veći nego u 2014.–2020.', fading: 'Udio u 2014.–2020. barem 1,5 puta veći nego u 2021.–2027.', rare: 'Pojmovi s manje od 20 projekata.' };
  const mrows = () => N.filter((n) => n[1] === kind).map((n) => { const s1 = n[5] / g.p1, s2 = n[6] / g.p2; return { n, s1, s2, label: nm(n), tr: n[6] >= 10 && s2 >= 1.5 * s1 ? 'growing' : n[5] >= 10 && s1 >= 1.5 * s2 ? 'fading' : '' }; });
  function paintAll() {
    $$('#pkind button', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === kind))); $$('#pview button', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === view)));
    $('#viewnote', root).textContent = VNOTE[view]; const needle = fold(q);
    const list = mrows().filter((r) => (view === 'all' || (view === 'rare' ? r.n[4] < 20 : r.tr === view)) && (!needle || fold(r.label).includes(needle))).sort((a, b) => b.n[4] - a.n[4]);
    $('#count', root).textContent = `${Math.min(list.length, shownM)} / ${fmt(list.length)} prikazano`; $('#mmore', root).hidden = list.length <= shownM;
    $('#mlist', root).innerHTML = list.length ? rank(list.slice(0, shownM).map((r) => ({ label: r.label, v: r.n[4], text: fmt(r.n[4]), st: r.tr === 'growing' ? '↗ raste' : r.tr === 'fading' ? '↘ slabi' : '', hl: false })), { nonum: true, max: list[0].n[4], cls: 'compact' }) : '<div class="empty">Nema pojmova za odabrane filtre.</div>';
  }
  $$('#pareas button', root).forEach((b) => b.onclick = () => { area = b.dataset.a; shownP = 8; const l = inArea(); if (l.length && !l.some(([, i]) => i === cur)) { cur = l[0][1]; paintDetail(); } paintList(); });
  $('#pmore', root).onclick = () => { shownP += 8; paintList(); };
  $$('#pkind button', root).forEach((b) => b.onclick = () => { kind = b.dataset.v; shownM = 12; paintAll(); });
  $$('#pview button', root).forEach((b) => b.onclick = () => { view = b.dataset.v; shownM = 12; paintAll(); });
  $('#mf', root).oninput = (e) => { q = e.target.value; shownM = 12; paintAll(); }; $('#mmore', root).onclick = () => { shownM += 25; paintAll(); };
  paintList(); paintDetail(); paintAll();
  Xport.mount(root, () => { const n = N[cur], rows = KD.flatMap(([k, l]) => related(cur, k).map(([y, c]) => [l, nm(N[y]), c])); return { id: 'problemi-rjesenja', title: 'Problem i povezani pojmovi', filters: [['Problem', nm(n)], ['Projekata s problemom', fmt(n[4])]], cols: [{ h: 'Vrsta pojma' }, { h: 'Pojam' }, { h: 'Zajedničkih projekata', t: 'int' }], rows }; }, { after: '.grid.two.prob' });
}

function viewOPodacima(root) {
  const nat = D.periods.all;
  root.innerHTML = `${head('Informacije · O podacima', 'Odakle podaci dolaze i što znače', 'Kratko objašnjenje izvora, obuhvata i ograničenja, da brojke možete čitati s razumijevanjem.')}
  <div class="doc">
  <h2>Što atlas prikazuje</h2><p>KA2 partnerstva Erasmus+ programa u kojima sudjeluje barem jedna hrvatska organizacija, od 2014. do 2026. godine. Trenutno je to ${fmt(nat.projects)} projekata, što je ${pct(nat.share_of_eu_ka2_projects)} % svih KA2 projekata u EU. Podaci su ažurirani <time translate="no" datetime="${D.meta.generated}">${fdate(D.meta.generated)}</time>.</p>
  <h2>Izvori</h2><ul class="srcl">
    <li><a href="https://erasmus-plus.ec.europa.eu/projects" target="_blank" rel="noopener">Erasmus+ Project Results Platform</a><br><span class="small">Europska komisija. Skupovi podataka o KA2 projektima za 2014.–2020. i 2021.–2027.</span></li>
    <li><a href="https://data.gov.hr" target="_blank" rel="noopener">Portal otvorenih podataka (data.gov.hr)</a><br><span class="small">Agencija za mobilnost i programe EU. Popisi projekata i organizacija.</span></li>
    <li><a href="https://mzo.gov.hr" target="_blank" rel="noopener">Ministarstvo znanosti i obrazovanja</a><br><span class="small">Registri škola, za izračun pokrivenosti po županijama.</span></li></ul>
  <h2>Što brojke ne obuhvaćaju</h2><ul>
    <li>Samo KA2 projekte. KA1 mobilnosti nisu uključene.</li>
    <li>Odabir za 2026. još traje, pa je posljednja godina nepotpuna.</li>
    <li>Iznosi su okvirne potpore dodijeljene pri odabiru. Bilježe se po projektu i nisu podijeljeni među partnere.</li>
    <li>Škole iz projekata povezuju se s registrom škola prema nazivu i poštanskom broju, pa su udjeli pokrivenosti procjene.</li>
    <li>Nacionalni popis projekata 2014.–2020. ima 2.061 projekta, 50 manje od županijskog sažetka iste agencije (2.111). Brojke u atlasu dolaze iz izvoza EU-a i ne ovise o tom popisu.</li>
    <li>Vrsta organizacije ponegdje je nadopunjena iz drugih zapisa iste organizacije.</li></ul>
  <h2>Teme, pristupi i pojmovi</h2><p>Jezični model pročitao je sažetak svakog projekta i izdvojio pristupe, ciljne skupine, rezultate i probleme, a slični izrazi grupirani su po značenju. Brojevi su donja granica: projekt koji nešto radi, ali to ne spominje, nije izbrojen. Čitajte obrasce, a ne točne brojke pojedinog pojma. „Dobra praksa” je oznaka EU-a za projekte odabrane kao primjere.</p>
  <h2>Kako se podaci osvježavaju</h2><p>Kad se u izvore dodaju novi projekti, obrada se ponovno pokrene i izračuna brojke, a stranica se izgradi iznova. Ništa se ne unosi ručno.</p>
  </div>`;
}

/* ============ prikaz: Pregled ============ */
function viewPregled(root) {
  let st = { period: 'all', sector: '', kind: '', county: '' }, notice = '', lastProjects = 0, showAll = false;
  root.innerHTML = `${head('Istraži · Pregled', 'Sudjelovanje Hrvatske u Erasmus+ KA2 partnerstvima', 'Koliko ima projekata, tko ih koordinira i gdje su. Suzite prikaz razdobljem, sektorom, vrstom projekta ili županijom.')}
  <section class="filters" aria-label="Filteri">
    <div class="f"><span class="lab">Razdoblje</span><div class="seg" id="seg-period" role="group" aria-label="Razdoblje"></div></div>
    <label class="f"><span class="lab">Sektor</span><select id="f-sector"></select></label>
    <label class="f"><span class="lab">Vrsta projekta</span><select id="f-kind"></select></label>
    <label class="f"><span class="lab">Županija</span><select id="f-county"></select></label>${resetBtn}
  </section>
  <div class="chips" id="summary" aria-live="polite"></div><p class="hint" id="hint" hidden></p>
  <section class="grid kpis">
    <article class="card kpi"><h2 id="k1t">KA2 projekata s hrvatskim sudionikom</h2><div class="num" id="k1">–</div><div class="sub" id="k1s"></div></article>
    <article class="card kpi"><h2>Koordinirano iz Hrvatske</h2><div class="num" id="k2">–</div><div class="sub" id="k2s"></div></article>
    <article class="card kpi"><h2>Vrijednost tih projekata</h2><div class="num" id="k3">–</div><div class="sub" id="k3s"></div></article>
  </section>
  <section class="card" style="margin-top:24px"><div class="head"><h2>Projekti po godini poziva</h2></div><p class="lead" id="ch-lead"></p><div class="chartbox" id="chart"></div></section>
  <section class="grid cols">
    <article class="card"><h2>Tko koordinira iz Hrvatske</h2><p class="lead">Projekti koje koordiniraju hrvatske organizacije, po vrsti organizacije.</p><div id="who"></div></article>
    <article class="card"><h2>Županije po broju projekata</h2><p class="lead">Projekti u kojima sudjeluje barem jedna organizacija iz županije. Kliknite županiju za filtriranje.</p><div id="cr"></div><div class="cardfoot"><button type="button" class="linkish" id="crmore"></button><a href="#/mjesta">Otvori kartu županija →</a></div></article>
  </section>`;
  const rows = (over = {}) => { const f = { ...st, ...over }; return D.rows.filter((r) => (f.period === 'all' || r[1] === f.period) && (!f.sector || r[2] === f.sector) && (!f.kind || r[3] === f.kind)); };
  const tot = (rs) => rs.reduce((a, r) => a + r[4], 0);
  const county = () => countyBy(st.county);
  const normalise = () => { if (st.sector && tot(rows()) === 0) st.sector = ''; if (st.kind && tot(rows()) === 0) st.kind = ''; };
  function setFilter(k, v) {
    notice = ''; st[k] = v;
    if (k === 'county' && v && (st.sector || st.kind)) { st.sector = ''; st.kind = ''; notice = 'Sektor i vrsta projekta isključeni su jer se u ovim podacima ne mogu kombinirati sa županijom.'; }
    if ((k === 'sector' || k === 'kind') && v && st.county) { st.county = ''; notice = 'Županija je isključena jer se u ovim podacima ne može kombinirati sa sektorom i vrstom projekta.'; }
    if (k === 'sector' && v && st.kind && tot(rows()) === 0) st.kind = '';
    if (k === 'kind' && v && st.sector && tot(rows()) === 0) st.sector = '';
    normalise(); render();
  }
  function buildSel(sel, dim, labels, ph) {
    const idx = dim === 'sector' ? 2 : 3, counts = {};
    for (const r of rows({ [dim]: '' })) counts[r[idx]] = (counts[r[idx]] || 0) + r[4];
    sel.innerHTML = ''; sel.append(new Option(ph, ''));
    for (const k of Object.keys(labels)) if (counts[k]) sel.append(new Option(`${labels[k]} (${fmt(counts[k])})`, k));
    sel.value = st[dim]; sel.disabled = !!st.county; sel.title = st.county ? 'Nije dostupno uz odabranu županiju' : '';
  }
  function controls() {
    const sg = $('#seg-period', root); sg.innerHTML = '';
    for (const p of Object.keys(LAB.period)) { const b = document.createElement('button'); b.type = 'button'; b.textContent = LAB.period[p]; b.setAttribute('aria-pressed', String(st.period === p)); b.onclick = () => { notice = ''; st.period = p; normalise(); render(); }; sg.append(b); }
    buildSel($('#f-sector', root), 'sector', LAB.sector, 'Svi sektori'); buildSel($('#f-kind', root), 'kind', LAB.kind, 'Sve vrste');
    const cs = $('#f-county', root); cs.innerHTML = ''; cs.append(new Option('Sve županije', ''));
    for (const c of [...D.counties].sort((a, b) => a.label.localeCompare(b.label, LANG))) cs.append(new Option(shortCounty(c), c.stem));
    cs.value = st.county; cs.disabled = !!(st.sector || st.kind); cs.title = cs.disabled ? 'Nije dostupno uz odabrani sektor ili vrstu projekta' : '';
  }
  function kpis() {
    const nat = D.periods[st.period], c = county(), typed = st.sector || st.kind; let projects, coord = null, value = null;
    if (c) { const k = c.ka2[st.period]; projects = k.projects_involved; coord = k.projects_coordinated; value = k.value_involved_eur; }
    else if (typed) projects = tot(rows()); else { projects = nat.projects; coord = nat.coordinated; value = nat.value_involved_eur; }
    lastProjects = projects; $('#k1', root).textContent = fmt(projects);
    $('#k1t', root).textContent = c ? 'KA2 projekata s sudionikom iz županije' : 'KA2 projekata s hrvatskim sudionikom';
    if (c) $('#k1s', root).textContent = `${fmt(c.ka2[st.period].organisations)} organizacija sudjeluje`;
    else if (typed) $('#k1s', root).textContent = `${pct(projects / nat.projects)} % svih hrvatskih KA2 projekata`;
    else $('#k1s', root).innerHTML = `<b>${pct(nat.projects / nat.eu_ka2_projects)} %</b> svih KA2 projekata u EU (${fmt(nat.eu_ka2_projects)})`;
    const na = (e, s, w) => { e.textContent = '—'; e.classList.add('na'); s.textContent = w; }, ok = (e) => e.classList.remove('na');
    if (coord == null) na($('#k2', root), $('#k2s', root), 'Nije dostupno po sektoru ili vrsti projekta'); else { ok($('#k2', root)); $('#k2', root).textContent = fmt(coord); $('#k2s', root).textContent = `${pct(coord / (projects || 1))} % tih projekata`; }
    if (value == null) na($('#k3', root), $('#k3s', root), 'Nije dostupno po sektoru ili vrsti projekta');
    else { ok($('#k3', root)); $('#k3', root).textContent = mil(value); $('#k3s', root).textContent = (!c && st.period === 'all') ? `2014.–2020.: ${fmt(D.periods['2014-2020'].value_involved_eur / 1e6)} mil. € · 2021.–2027.: ${fmt(D.periods['2021-2027'].value_involved_eur / 1e6)} mil. €` : 'Vrijednost svih projekata u kojima sudjeluje'; }
  }
  function chart() {
    const box = $('#chart', root);
    if (st.county) { box.innerHTML = '<div class="empty">Godišnji prikaz trenutno je dostupan samo za cijelu Hrvatsku. Poništite filter županije.</div>'; $('#ch-lead', root).textContent = ''; return; }
    const d = yearData(byYear({ period: st.period, sector: st.sector, kind: st.kind }));
    $('#ch-lead', root).textContent = 'Broj KA2 projekata s hrvatskim sudionikom po godini poziva. Prazan stupac označava godinu koja još traje.';
    box.innerHTML = colChart(d, { mark: 2020, label: 'Projekti po godini poziva' });
  }
  function who() {
    const box = $('#who', root);
    if (st.county || st.sector || st.kind) { box.innerHTML = '<div class="empty">Raspodjela po vrsti organizacije dostupna je samo za cijelu Hrvatsku. Poništite filtre županije, sektora i vrste projekta da je vidite.</div>'; return; }
    const cl = D.periods[st.period].classes.slice(0, 8), tt = D.periods[st.period].coordinated;
    box.innerHTML = rank(cl.map((c) => ({ label: LAB.cls[c.org_class] || c.org_class, v: c.projects_coordinated, text: fmt(c.projects_coordinated), st: pct(c.projects_coordinated / tt, 0) + ' %' })), { nonum: true });
  }
  function counties() {
    const box = $('#cr', root), more = $('#crmore', root);
    if (st.sector || st.kind) { box.innerHTML = '<div class="empty">Podjela po županijama nije dostupna uz sektor ili vrstu projekta.</div>'; more.hidden = true; return; }
    more.hidden = false;
    const all = [...D.counties].sort((a, b) => b.ka2[st.period].projects_involved - a.ka2[st.period].projects_involved);
    const list = showAll ? all : all.slice(0, 8);
    box.innerHTML = rank(list.map((c) => ({ key: c.stem, label: shortCounty(c), v: c.ka2[st.period].projects_involved, text: fmt(c.ka2[st.period].projects_involved) })), { pick: true, sel: st.county, max: all[0].ka2[st.period].projects_involved, cls: 'compact' });
    more.textContent = showAll ? 'Prikaži samo prvih 8' : `Prikaži svih ${all.length}`;
    $$('button.rk', box).forEach((b) => b.onclick = () => setFilter('county', st.county === b.dataset.k ? '' : b.dataset.k));
  }
  function render() {
    controls(); kpis(); chart(); who(); counties();
    const c = county(); $('.pagehead h1', root).textContent = c ? `${shortCounty(c)}: sudjelovanje u Erasmus+ KA2 partnerstvima` : 'Sudjelovanje Hrvatske u Erasmus+ KA2 partnerstvima';
    const chip = (k, t) => `<button type="button" class="chip" data-k="${k}" aria-label="${esc(tr('Ukloni filter'))}: ${esc(tr(t))}">${esc(t)}<i aria-hidden="true">×</i></button>`;
    $('#summary', root).innerHTML = `<span class="chip static">${LAB.period[st.period]}</span>${st.sector ? chip('sector', LAB.sector[st.sector]) : ''}${st.kind ? chip('kind', LAB.kind[st.kind]) : ''}${c ? chip('county', c.label) : ''}<span class="cnt"><b>${fmt(lastProjects)}</b> projekata</span>`;
    const h = $('#hint', root); h.hidden = !notice; h.textContent = notice;
  }
  $('#f-sector', root).onchange = (e) => setFilter('sector', e.target.value); $('#f-kind', root).onchange = (e) => setFilter('kind', e.target.value); $('#f-county', root).onchange = (e) => setFilter('county', e.target.value);
  $('#reset', root).onclick = () => { notice = ''; st = { period: 'all', sector: '', kind: '', county: '' }; render(); };
  $('#summary', root).onclick = (e) => { const b = e.target.closest('.chip[data-k]'); if (b) setFilter(b.dataset.k, ''); };
  $('#crmore', root).onclick = () => { showAll = !showAll; counties(); };
  Xport.mount(root, () => { const c = county(), fl = [['Razdoblje', LAB.period[st.period]], ['Sektor', st.sector ? LAB.sector[st.sector] : 'Svi sektori'], ['Vrsta projekta', st.kind ? LAB.kind[st.kind] : 'Sve vrste'], ['Županija', c ? c.label : 'Sve županije']];
    if (c) return { id: 'pregled-zupanija', title: `Županija: ${c.label}`, filters: fl, cols: [{ h: 'Razdoblje' }, { h: 'Projekata sa sudionikom', t: 'int' }, { h: 'Koordinirano', t: 'int' }, { h: 'Organizacija', t: 'int' }, { h: 'Vrijednost projekata (EUR)', t: 'int' }], rows: Object.keys(LAB.period).map((p) => { const k = c.ka2[p]; return [LAB.period[p], k.projects_involved, k.projects_coordinated, k.organisations, Math.round(k.value_involved_eur)]; }) };
    return { id: 'pregled-po-godinama', title: 'KA2 projekti po godini poziva', filters: fl, cols: [{ h: 'Godina poziva', t: 'year' }, { h: 'Broj projekata', t: 'int' }, { h: 'Napomena' }], rows: yearData(byYear({ period: st.period, sector: st.sector, kind: st.kind })).map((d) => [d.x, d.y, d.part ? 'godina još traje' : '']) }; });
  render();
}

/* ============ prikaz: Pokrivenost škola (interaktivna karta) ============ */
function viewPokrivenost(root) {
  let st = { type: 'both', period: 'all', role: 'any', county: '' };
  const TYPES = { both: ['primary', 'secondary', 'combined'], primary: ['primary'], secondary: ['secondary'], kindergarten: ['kindergarten'] };
  root.innerHTML = `${head('Županije · Pokrivenost škola', 'Koje škole sudjeluju?', 'Udio osnovnih i srednjih škola u svakoj županiji koje su sudjelovale u barem jednom KA2 partnerstvu, kao koordinator ili partner.')}
  <section class="filters" aria-label="Filteri">${seg('s-type', 'Ustanove', [['both', 'Osnovne + srednje'], ['primary', 'Osnovne'], ['secondary', 'Srednje'], ['kindergarten', 'Vrtići']], st.type)}${seg('s-period', 'Razdoblje', Object.entries(LAB.period), st.period)}${seg('s-role', 'Uloga', [['any', 'Bilo koja'], ['coordinator', 'Koordinator']], st.role)}${resetBtn}</section>
  <div class="headline" id="headline" aria-live="polite"></div>
  <div class="grid eq"><section class="card sticky">${mapCard('Karta županija', 'Boja je udio škola koje sudjeluju. Zagreb je uvećan u kutu. Odaberite županiju za pojedinosti.')}</section>
  <section class="card"><h3>Udio škola po županiji</h3><p class="lead">Koliki dio škola u županiji sudjeluje u KA2 projektima. Redak se može odabrati.</p><div id="rk"></div></section></div>
  <div class="sel" id="sel" hidden aria-live="polite"><div><div class="kicker" id="sel-name"></div><p id="sel-text" style="margin-top:8px"></p></div><a class="btn" id="sel-open" href="#/mjesta">Otvori stranicu županije</a></div>
  <p class="foot-note">Metoda: sudionici KA2 povezani su s registrom škola prema nazivu i poštanskom broju; to je procjena dok se podudaranja ne pregledaju. Udjeli su procjene. KA1 mobilnost nije uključena.</p>`;
  const sel = (id, k) => $$(`#${id} button`, root).forEach((b) => b.onclick = () => { st[k] = b.dataset.v; paint(); });
  sel('s-type', 'type'); sel('s-period', 'period'); sel('s-role', 'role');
  $('#reset', root).onclick = () => { st = { type: 'both', period: 'all', role: 'any', county: '' }; paint(); };
  const TL = { both: 'Osnovne + srednje', primary: 'Osnovne', secondary: 'Srednje', kindergarten: 'Vrtići' };
  Xport.mount(root, () => ({ id: 'pokrivenost-skola', title: 'Udio ustanova koje sudjeluju u KA2 projektima, po županijama', filters: [['Ustanove', TL[st.type]], ['Razdoblje', LAB.period[st.period]], ['Uloga', st.role === 'any' ? 'Bilo koja' : 'Koordinator']], cols: [{ h: 'Županija' }, { h: 'Ustanova ukupno', t: 'int' }, { h: 'Ustanova koje sudjeluju', t: 'int' }, { h: 'Udio (%)', t: 'pct' }], rows: calc().rows.filter((r) => r.inst > 0).sort((a, b) => b.rate - a.rate).map((r) => [countyBy(r.stem).label, r.inst, r.part, +(r.rate * 100).toFixed(1)]) }));
  function calc() {
    const use = TYPES[st.type], by = {}, nat = {};
    for (const r of D.coverage) { if (r[0] !== st.period || r[1] !== st.role || !use.includes(r[3])) continue; const c = (by[r[2]] ||= { inst: 0, part: 0 }); c.inst += r[4]; c.part += r[5]; }
    let I = 0, P = 0; for (const k in by) { I += by[k].inst; P += by[k].part; }
    return { rows: D.counties.map((c) => { const x = by[c.stem] || { inst: 0, part: 0 }; return { stem: c.stem, inst: x.inst, part: x.part, rate: x.inst ? x.part / x.inst : 0 }; }), I, P, rate: I ? P / I : 0 };
  }
  function paint() {
    $$('.seg button', root).forEach((b) => { const k = b.parentElement.id === 's-type' ? 'type' : b.parentElement.id === 's-period' ? 'period' : 'role'; b.setAttribute('aria-pressed', String(st[k] === b.dataset.v)); });
    const { rows, I, P, rate } = calc();
    $('#headline', root).innerHTML = `<b>${pct(rate)} %</b><span>${fmt(P)} od ${fmt(I)} ustanova na razini države sudjelovalo je u KA2 projektima</span>`;
    const it = rows.filter((r) => r.inst > 0).map((r) => ({ stem: r.stem, v: r.rate, text: Math.round(r.rate * 100) + ' %', map: String(Math.round(r.rate * 100)) }));
    tileMap($('#tiles', root), $('#legend', root), it, st.county, (s) => { st.county = st.county === s ? '' : s; paint(); }, '%');
    const list = [...rows].filter((r) => r.inst > 0).sort((x, y) => y.rate - x.rate);
    $('#rk', root).innerHTML = rank(list.map((r) => ({ key: r.stem, label: shortCounty(countyBy(r.stem)), v: r.rate, text: Math.round(r.rate * 100) + ' %', st: `${r.part} od ${r.inst}` })), { pick: true, sel: st.county, max: Math.max(.01, ...list.map((r) => r.rate)), cls: 'compact' });
    $$('#rk button.rk', root).forEach((e) => e.onclick = () => { st.county = st.county === e.dataset.k ? '' : e.dataset.k; paint(); });
    const s = st.county ? rows.find((r) => r.stem === st.county) : null; $('#sel', root).hidden = !s;
    if (s) { const c = countyBy(s.stem); $('#sel-name', root).textContent = c.label; $('#sel-text', root).textContent = `${s.part} od ${s.inst} škola sudjelovalo je u KA2 projektima (${pct(s.rate)} %). Državni prosjek je ${pct(rate)} %.`; $('#sel-open', root).href = '#/mjesta/' + encodeURIComponent(s.stem); }
  }
  paint();
}

/* ============ prikaz: Županije (interaktivna karta + poredak) ============ */
function viewMjesta(root) {
  let st = { metric: 'projects_involved', period: 'all', county: '' };
  const M = { projects_involved: ['Projekti', (k) => fmt(k.projects_involved)], projects_coordinated: ['Koordinirano', (k) => fmt(k.projects_coordinated)], organisations: ['Organizacije', (k) => fmt(k.organisations)], value_involved_eur: ['Vrijednost', (k) => mil(k.value_involved_eur)] };
  root.innerHTML = `${head('Istraži · Županije', 'Županije u KA2 partnerstvima', 'Gdje su organizacije i projekti. Odaberite županiju na karti ili u poretku da vidite njezine brojke i najaktivnije organizacije.')}
  <section class="filters" aria-label="Filteri">${seg('s-metric', 'Prikaži', Object.entries(M).map(([k, v]) => [k, v[0]]), st.metric)}${seg('s-period', 'Razdoblje', Object.entries(LAB.period), st.period)}</section>
  <div class="grid eq"><section class="card sticky">${mapCard('Karta županija', '')}</section>
  <section class="card"><h3>Poredak županija</h3><p class="lead" id="rk-lead"></p><div id="rk"></div></section></div>
  <div class="sel" id="sel" hidden aria-live="polite"><div><div class="kicker" id="sel-name"></div><p id="sel-text" style="margin-top:8px"></p></div><a class="btn primary" id="sel-open" href="#/mjesta">Otvori stranicu županije</a></div>`;
  $$('#s-metric button', root).forEach((b) => b.onclick = () => { st.metric = b.dataset.v; paint(); });
  $$('#s-period button', root).forEach((b) => b.onclick = () => { st.period = b.dataset.v; paint(); });
  Xport.mount(root, () => ({ id: 'zupanije', title: 'Županije u KA2 partnerstvima', filters: [['Poredano po', M[st.metric][0]], ['Razdoblje', LAB.period[st.period]]], cols: [{ h: 'Županija' }, { h: 'Projekata sa sudionikom', t: 'int' }, { h: 'Koordinirano', t: 'int' }, { h: 'Organizacija', t: 'int' }, { h: 'Vrijednost projekata (EUR)', t: 'int' }], rows: [...D.counties].sort((a, b) => (b.ka2[st.period][st.metric] || 0) - (a.ka2[st.period][st.metric] || 0)).map((c) => { const k = c.ka2[st.period]; return [c.label, k.projects_involved, k.projects_coordinated, k.organisations, Math.round(k.value_involved_eur)]; }) }));
  function paint() {
    $$('#s-metric button', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.metric))); $$('#s-period button', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.period)));
    const [lab, f] = M[st.metric], val = (c) => c.ka2[st.period][st.metric] || 0;
    const sorted = [...D.counties].sort((a, b) => val(b) - val(a));
    $('#rk-lead', root).textContent = `${lab}, ${LAB.period[st.period]} Redak se može odabrati.`;
    tileMap($('#tiles', root), $('#legend', root), D.counties.map((c) => ({ stem: c.stem, v: val(c), text: st.metric === 'value_involved_eur' ? fmt(val(c) / 1e6) : fmt(val(c)) })), st.county, (s) => { st.county = st.county === s ? '' : s; paint(); });
    $('#legend', root).insertAdjacentHTML('beforeend', st.metric === 'value_involved_eur' ? '<span class="mapnote" style="width:100%;text-align:center;margin:0">Brojevi na karti su milijuni eura.</span>' : '');
    $('#rk', root).innerHTML = rank(sorted.map((c) => ({ key: c.stem, label: shortCounty(c), v: val(c), text: f(c.ka2[st.period]) })), { pick: true, sel: st.county, cls: 'compact' });
    $$('#rk button.rk', root).forEach((e) => e.onclick = () => { st.county = st.county === e.dataset.k ? '' : e.dataset.k; paint(); });
    const c = st.county ? countyBy(st.county) : null; $('#sel', root).hidden = !c;
    if (c) { const k = c.ka2[st.period], pos = sorted.findIndex((x) => x.stem === c.stem) + 1; $('#sel-name', root).textContent = c.label; $('#sel-text', root).innerHTML = `${fmt(k.projects_involved)} projekata, od toga ${fmt(k.projects_coordinated)} koordiniranih. ${fmt(k.organisations)} organizacija. Po odabranom prikazu je ${pos}. od ${sorted.length} županija.`; $('#sel-open', root).href = '#/mjesta/' + encodeURIComponent(c.stem); }
  }
  paint();
}

/* ============ prikaz: Županija (detalj) ============ */
function viewZupanija(root, stem) {
  const c = countyBy(stem); if (!c) { root.innerHTML = head('Županije', 'Županija nije pronađena', 'Provjerite adresu ili se vratite na popis županija.') + '<p><a class="btn" href="#/mjesta">← Sve županije</a></p>'; return; }
  const a = c.ka2.all || {}, p1 = c.ka2['2014-2020'] || {}, p2 = c.ka2['2021-2027'] || {};
  const order = [...D.counties].sort((x, y) => y.ka2.all.projects_involved - x.ka2.all.projects_involved), pos = order.findIndex((x) => x.stem === stem) + 1;
  const top = D.orgs.filter((o) => o[3] === stem).sort((x, y) => y[5] - x[5]).slice(0, 10);
  const TN = { primary: 'Osnovne škole', secondary: 'Srednje škole', 'primary+secondary school': 'Osnovne i srednje škole', combined: 'Osnovne i srednje škole', kindergarten: 'Vrtići' };
  const pair = (lab, k) => rank([{ label: '2014.–2020.', v: p1[k] || 0, text: fmt(p1[k] || 0) }, { label: '2021.–2027.', v: p2[k] || 0, text: fmt(p2[k] || 0) }], { nonum: true, cls: 'compact', max: Math.max(1, p1[k] || 0, p2[k] || 0) });
  root.innerHTML = `<nav class="crumbs" aria-label="Putanja"><a href="#/mjesta">Županije</a><span>${esc(c.label)}</span></nav>
  ${head(`Županija · ${pos}. od ${order.length} po broju projekata`, esc(c.label), `Sudjelovanje organizacija iz županije u KA2 partnerstvima, 2014.–2026.`)}
  <div class="grid kpis4" style="margin-top:0">
    <article class="card kpi"><small>Organizacija</small><div class="big">${fmt(a.organisations || 0)}</div><small>${fmt(p1.organisations || 0)} + ${fmt(p2.organisations || 0)} po razdobljima</small></article>
    <article class="card kpi"><small>Projekata sa sudionikom</small><div class="big">${fmt(a.projects_involved || 0)}</div><small>${fmt(p1.projects_involved || 0)} + ${fmt(p2.projects_involved || 0)} po razdobljima</small></article>
    <article class="card kpi"><small>Koordinirano</small><div class="big">${fmt(a.projects_coordinated || 0)}</div><small>Grantovi: ${mil(a.grants_coordinated_eur || 0)}</small></article>
    <article class="card kpi"><small>Vrijednost projekata</small><div class="big">${mil(a.value_involved_eur || 0)}</div><small>svih projekata sa sudionikom</small></article>
  </div>
  <div class="grid two">
    <div class="stack">
      <section class="card"><h2>Najaktivnije organizacije</h2><p class="lead">Po broju KA2 projekata. Odaberite organizaciju za pojedinosti.</p>${top.length ? rank(top.map((o) => ({ label: o[1], sub: o[2] || '', v: o[5], text: fmt(o[5]), st: `${fmt(o[6])} koord.`, href: '#/organizacije/' + encodeURIComponent(o[0]) })), { cls: 'wide' }) : '<div class="empty">Nema organizacija u podacima.</div>'}<div class="cardfoot"><span></span><a href="#/organizacije" id="co-all">Sve organizacije u županiji →</a></div></section>
      <section class="card"><h2>Pokrivenost po vrsti škole</h2><p class="lead">Udio škola u županiji koje su sudjelovale u KA2 projektima.</p>${(c.coverage || []).length ? rank(c.coverage.map((x) => ({ label: TN[x.school_type] || x.school_type, v: x.rate, text: Math.round(x.rate * 100) + ' %', st: `${x.participating} od ${x.institutions}` })), { nonum: true, max: 1 }) : '<div class="empty">Nema podataka o pokrivenosti.</div>'}</section>
    </div>
    <div class="stack">
      <section class="card"><h2>Položaj</h2>${miniMap(stem)}<div class="cardfoot"><span>${esc(c.label)}</span><a href="#/mjesta">Karta županija →</a></div></section>
      <section class="card"><h2>Po razdobljima</h2><p class="lead">Projekti sa sudionikom iz županije.</p>${pair('Projekti', 'projects_involved')}<p class="lead" style="margin-top:18px">Koordinirani projekti.</p>${pair('Koordinirano', 'projects_coordinated')}</section>
      <section class="card accent"><h2>Usporedite s drugim županijama</h2><p class="lead">Postavite ovu županiju uz druge po svim pokazateljima.</p><a class="btn primary" href="#/usporedba" id="cmp-go">Otvori usporedbu</a></section>
    </div>
  </div>`;
  $('#co-all', root).onclick = () => { window.__pre = { sel: '#c', value: stem, ev: 'change' }; };
  $('#cmp-go', root).onclick = () => { window.__cmp = [stem, ...order.filter((x) => x.stem !== stem).slice(0, 2).map((x) => x.stem)]; };
}

/* ============ prikaz: Usporedba županija ============ */
function viewUsporedba(root) {
  let sel = (window.__cmp && window.__cmp.length ? window.__cmp : [...D.counties].sort((x, y) => y.ka2.all.projects_involved - x.ka2.all.projects_involved).slice(0, 3).map((c) => c.stem)).slice(0, 4), period = 'all';
  window.__cmp = null;
  const COL = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'];
  const cov = (c) => { const rows = D.coverage.filter((r) => r[0] === period && r[1] === 'any' && r[2] === c.stem && ['primary', 'secondary', 'combined'].includes(r[3])), i = sum(rows.map((r) => r[4])), p = sum(rows.map((r) => r[5])); return i ? p / i : 0; };
  const METRICS = [['Projekti sa sudionikom iz županije', (c) => c.ka2[period].projects_involved, fmt, 'Broj KA2 projekata u kojima sudjeluje barem jedna organizacija iz županije.'], ['Koordinirani projekti', (c) => c.ka2[period].projects_coordinated, fmt, 'Projekti koje je koordinirala organizacija iz županije.'], ['Organizacije', (c) => c.ka2[period].organisations, fmt, 'Broj različitih organizacija iz županije u projektima.'], ['Vrijednost projekata', (c) => c.ka2[period].value_involved_eur, mil, 'Ukupna vrijednost projekata sa sudionikom iz županije.'], ['Pokrivenost osnovnih i srednjih škola', cov, (v) => Math.round(v * 100) + ' %', 'Udio škola koje su sudjelovale u barem jednom projektu.']];
  root.innerHTML = `${head('Županije · Usporedba', 'Usporedba županija', 'Odaberite do četiri županije i usporedite ih po broju projekata, koordinacijama, organizacijama, vrijednosti i pokrivenosti škola.')}
  <section class="filters" aria-label="Odabir županija"><div class="f"><span class="lab">Dodaj županiju</span><select id="add"></select></div>${seg('s-period', 'Razdoblje', Object.entries(LAB.period), period)}<div class="f" style="flex:1 1 100%;order:3"><span class="lab">Odabrano (najviše 4)</span><div class="chips" id="picked" style="margin:0"></div></div></section>
  <div class="grid cols" id="blocks"></div>
  <h2 class="sh">Usporedna tablica</h2><div class="tablewrap"><table id="tbl"></table></div>`;
  function paint() {
    $$('#s-period button', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === period)));
    const add = $('#add', root); add.innerHTML = ''; add.append(new Option(sel.length >= 4 ? 'Najviše četiri županije' : 'Odaberite županiju…', ''));
    for (const c of [...D.counties].sort((a, b) => a.label.localeCompare(b.label, LANG))) if (!sel.includes(c.stem)) add.append(new Option(shortCounty(c), c.stem)); add.disabled = sel.length >= 4;
    $('#picked', root).innerHTML = sel.map((s, i) => `<button type="button" class="chip" data-s="${esc(s)}" style="border-color:${COL[i]}" aria-label="Ukloni: ${esc(countyBy(s).label)}"><span style="width:10px;height:10px;border-radius:2px;background:${COL[i]}"></span>${esc(shortCounty(countyBy(s)))}<i aria-hidden="true">×</i></button>`).join('') || '<span class="muted">Nijedna županija nije odabrana.</span>';
    const cs = sel.map((s) => countyBy(s));
    $('#blocks', root).innerHTML = cs.length ? METRICS.map(([t, g, f, d]) => { const max = Math.max(1e-9, ...cs.map(g)); return `<section class="card"><h3>${t}</h3><p class="lead" style="margin-bottom:10px">${d}</p>${rank(cs.map((c, i) => ({ label: shortCounty(c), v: g(c), text: f(g(c)), col: COL[i] })), { nonum: true, max })}</section>`; }).join('') : '<div class="empty">Odaberite barem jednu županiju.</div>';
    $('#tbl', root).innerHTML = `<thead><tr><th>Pokazatelj</th>${cs.map((c) => `<th class="num">${esc(shortCounty(c))}</th>`).join('')}</tr></thead><tbody>${METRICS.map(([t, g, f]) => `<tr><td>${t}</td>${cs.map((c) => `<td class="num">${f(g(c))}</td>`).join('')}</tr>`).join('')}</tbody>`;
  }
  $('#add', root).onchange = (e) => { if (e.target.value && sel.length < 4) sel.push(e.target.value); paint(); };
  $('#picked', root).onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { sel = sel.filter((s) => s !== b.dataset.s); paint(); } };
  $$('#s-period button', root).forEach((b) => b.onclick = () => { period = b.dataset.v; paint(); });
  Xport.mount(root, () => ({ id: 'usporedba-zupanija', title: 'Usporedba županija', filters: [['Razdoblje', LAB.period[period]]], cols: [{ h: 'Županija' }, { h: 'Projekata sa sudionikom', t: 'int' }, { h: 'Koordinirano', t: 'int' }, { h: 'Organizacija', t: 'int' }, { h: 'Vrijednost projekata (EUR)', t: 'int' }, { h: 'Pokrivenost škola (%)', t: 'pct' }], rows: sel.map((s) => countyBy(s)).map((c) => [c.label, ...METRICS.map(([, g], i) => i === 3 ? Math.round(g(c)) : i === 4 ? +(g(c) * 100).toFixed(1) : g(c))]) }));
  paint();
}

/* ============ prikaz: Kroz vrijeme ============ */
function viewKronologija(root) {
  let group = 'sector', lastS = [], lastY = [];
  root.innerHTML = `${head('Istraži · Kroz vrijeme', 'Kako se broj projekata mijenjao', 'Broj KA2 projekata s hrvatskim sudionikom po godini poziva, podijeljen po sektoru ili vrsti projekta. Godina 2026. još traje.')}
  <section class="filters" aria-label="Filteri">${seg('s-group', 'Podijeli po', [['sector', 'Sektoru'], ['kind', 'Vrsti projekta']], group)}</section>
  <section class="card" style="margin-top:24px"><h2>Projekti po godini poziva</h2><p class="lead">Svaki stupac je jedna godina; boje su dijelovi po odabranoj podjeli.</p><div class="chartbox" id="chart"></div><div id="legend"></div></section>
  <div class="grid cols"><section class="card"><h2 id="rk-h">Udio po sektoru</h2><p class="lead">Ukupno 2014.–2026.</p><div id="rk"></div></section>
  <section class="card"><h2>Što se uočava</h2><div class="insight" id="ins"></div></section></div>
  <details class="fold"><summary>Tablica podataka</summary><div class="tablewrap" style="margin-top:12px"><table id="tbl"></table></div></details>`;
  function paint() {
    $$('#s-group button', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === group)));
    const idx = group === 'sector' ? 2 : 3, LB = group === 'sector' ? LAB.sector : LAB.kind, CL = group === 'sector' ? SECTOR_COL : KIND_COL;
    const years = [...new Set(D.rows.map((r) => r[0]))].sort((a, b) => a - b);
    const series = Object.keys(LB).map((k) => { const vals = {}; for (const r of D.rows) if (r[idx] === k) vals[r[0]] = (vals[r[0]] || 0) + r[4]; return { key: k, label: LB[k], color: CL[k], vals, total: sum(Object.values(vals)) }; }).filter((s) => s.total > 0).sort((a, b) => b.total - a.total);
    lastS = series; lastY = years;
    $('#chart', root).innerHTML = stackChart(years, series, { label: 'Projekti po godini i ' + (group === 'sector' ? 'sektoru' : 'vrsti projekta') });
    $('#legend', root).innerHTML = legendHTML(series.map((s) => [s.label, s.color]));
    const all = sum(series.map((s) => s.total));
    $('#rk-h', root).textContent = group === 'sector' ? 'Udio po sektoru' : 'Udio po vrsti projekta';
    $('#rk', root).innerHTML = rank(series.map((s) => ({ label: s.label, v: s.total, text: fmt(s.total), st: pct(s.total / all, 0) + ' %', col: s.color })), { nonum: true });
    const tot = years.map((y) => [y, sum(series.map((s) => s.vals[y] || 0))]), peak = [...tot].filter((t) => t[0] < 2026).sort((a, b) => b[1] - a[1])[0], p1 = sum(tot.filter((t) => t[0] <= 2020).map((t) => t[1])), p2 = sum(tot.filter((t) => t[0] >= 2021).map((t) => t[1]));
    $('#ins', root).innerHTML = `<div class="fact"><b>${peak[0]}.</b><span>godina s najviše projekata: ${fmt(peak[1])}</span></div><div class="fact"><b>${fmt(p1)} → ${fmt(p2)}</b><span>projekata u programu 2014.–2020. i dosad u programu 2021.–2027.</span></div><div class="fact"><b>${series[0].label}</b><span>najzastupljeniji (${pct(series[0].total / all, 0)} % svih projekata)</span></div>`;
    $('#tbl', root).innerHTML = `<thead><tr><th>Godina</th>${series.map((s) => `<th class="num">${esc(s.label)}</th>`).join('')}<th class="num">Ukupno</th></tr></thead><tbody>${years.map((y) => `<tr><td class="mono">${y}${y >= 2026 ? '*' : ''}</td>${series.map((s) => `<td class="num">${fmt(s.vals[y] || 0)}</td>`).join('')}<td class="num"><b>${fmt(sum(series.map((s) => s.vals[y] || 0)))}</b></td></tr>`).join('')}</tbody>`;
  }
  $$('#s-group button', root).forEach((b) => b.onclick = () => { group = b.dataset.v; paint(); });
  paint();
  Xport.mount(root, () => ({ id: 'projekti-kroz-vrijeme', title: 'KA2 projekti po godini poziva i ' + (group === 'sector' ? 'sektoru' : 'vrsti projekta'), filters: [['Podijeljeno po', group === 'sector' ? 'Sektoru' : 'Vrsti projekta'], ['Napomena', 'Godina 2026. još traje']], cols: [{ h: 'Godina poziva', t: 'year' }, ...lastS.map((s) => ({ h: s.label, t: 'int' })), { h: 'Ukupno', t: 'int' }], rows: lastY.map((y) => [y, ...lastS.map((s) => s.vals[y] || 0), sum(lastS.map((s) => s.vals[y] || 0))]) }));
}

/* ============ prikaz: Partnerske države ============ */
function viewDrzave(root) {
  let st = { period: 'all', sector: '', q: '' }, shown = 12, lastL = [], lastM = {};
  root.innerHTML = `${head('Istraži · Partnerske države', 'S kojim državama Hrvatska surađuje', 'Države čije su organizacije partneri u istim KA2 projektima kao i hrvatske organizacije. Brojimo projekte, a ne organizacije.')}
  <section class="filters" aria-label="Filteri">${seg('s-period', 'Razdoblje', Object.entries(LAB.period), st.period)}<label class="f"><span class="lab">Sektor</span><select id="f-sector"></select></label><label class="f"><span class="lab">Država</span><input id="q" type="search" placeholder="Npr. Italija…" autocomplete="off"></label>${resetBtn}</section>
  <div class="grid two">
    <section class="card"><h2>Zajednički projekti po državi</h2><p class="lead" id="lead"></p><div id="rk"></div><div class="more-wrap"><button class="more" id="more" type="button" hidden>Prikaži još</button></div></section>
    <div class="stack"><section class="card accent"><h2>Hrvatska među državama</h2><p class="lead">Projekti koje su koordinirale organizacije iz države, 2021.–2027. (prvih 16 država).</p><div id="co"></div></section></div>
  </div>`;
  const sec = $('#f-sector', root); sec.append(new Option('Svi sektori', '')); for (const k of Object.keys(LAB.sector)) sec.append(new Option(LAB.sector[k], k));
  function paint() {
    $$('#s-period button', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.period)));
    const m = partnerCounts(st), needle = fold(st.q), list = Object.keys(m).filter((c) => !needle || fold(country(c)).includes(needle)).sort((a, b) => m[b] - m[a] || country(a).localeCompare(country(b), LANG)), all = Object.keys(m).length, top = m[Object.keys(m).sort((a, b) => m[b] - m[a])[0]] || 1;
    lastL = list; lastM = m;
    $('#lead', root).textContent = `${all} država. Brojke su projekti s hrvatskim sudionikom u kojima sudjeluje i organizacija iz navedene države.`;
    $('#rk', root).innerHTML = list.length ? rank(list.slice(0, shown).map((c) => ({ label: country(c), v: m[c], text: fmt(m[c]) })), { max: top, cls: 'alt compact' }) : '<div class="empty">Nijedna država ne odgovara pretrazi.</div>';
    $('#more', root).hidden = list.length <= shown; $('#more', root).textContent = `Prikaži još (${list.length - shown})`;
  }
  const cm = Math.max(...D.countries.map((r) => r.coordinated_projects));
  $('#co', root).innerHTML = rank([...D.countries].sort((a, b) => b.coordinated_projects - a.coordinated_projects).map((r) => ({ label: country(r.country), v: r.coordinated_projects, text: fmt(r.coordinated_projects), hl: r.country === 'HR' })), { max: cm, cls: 'compact' });
  $$('#s-period button', root).forEach((b) => b.onclick = () => { st.period = b.dataset.v; shown = 12; paint(); });
  sec.onchange = (e) => { st.sector = e.target.value; shown = 12; paint(); };
  $('#q', root).oninput = (e) => { st.q = e.target.value; shown = 12; paint(); };
  $('#more', root).onclick = () => { shown += 15; paint(); };
  Xport.mount(root, () => ({ id: 'partnerske-drzave', title: 'Države koje surađuju s Hrvatskom u KA2 projektima', filters: [['Razdoblje', LAB.period[st.period]], ['Sektor', st.sector ? LAB.sector[st.sector] : 'Svi sektori'], ['Država', st.q.trim() || '—']], cols: [{ h: 'Država' }, { h: 'Kod države' }, { h: 'Zajedničkih projekata', t: 'int' }], rows: lastL.map((c) => [country(c), c, lastM[c]]) }));
  $('#reset', root).onclick = () => { st = { period: 'all', sector: '', q: '' }; sec.value = ''; $('#q', root).value = ''; shown = 12; paint(); };
  paint();
}

/* ============ filteri: na malim zaslonima postaju ladica ============ */
function enhance() {
  const view = $('#view');
  modernSelects(view);
  $$('.filters select', view).forEach((s) => s.classList.toggle('set', s.value !== ''));
  $$('.filters', view).forEach((f) => {
    let n = 0;
    $$('.seg', f).forEach((s) => { const bs = $$('button', s), pr = bs.findIndex((x) => x.getAttribute('aria-pressed') === 'true'); if (pr > 0) n++; });
    $$('select', f).forEach((s) => { if (s.value !== '') n++; }); $$('input[type=checkbox]', f).forEach((c) => { if (c.checked) n++; }); $$('input[type=search]', f).forEach((c) => { if (c.value.trim()) n++; });
    let btn = f.previousElementSibling; if (!btn || !btn.classList.contains('fbtn')) {
      btn = document.createElement('button'); btn.type = 'button'; btn.className = 'fbtn'; btn.setAttribute('aria-haspopup', 'dialog');
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg><span>Filteri</span><b class="badge2"></b>';
      f.before(btn); const done = document.createElement('button'); done.type = 'button'; done.className = 'sheet-done'; done.textContent = 'Prikaži rezultate'; f.append(done);
      const bd = document.createElement('div'); bd.className = 'backdrop'; bd.hidden = true; document.body.append(bd);
      const close = () => { f.classList.remove('open'); bd.hidden = true; document.body.classList.remove('noscroll'); btn.focus(); };
      btn.onclick = () => { f.classList.add('open'); bd.hidden = false; document.body.classList.add('noscroll'); f.querySelector('button,select,input')?.focus(); };
      done.onclick = close; bd.onclick = close; f.addEventListener('keydown', (e) => { if (e.key === 'Escape' && f.classList.contains('open')) close(); });
    }
    const bdg = $('.badge2', btn); bdg.textContent = n || ''; bdg.hidden = !n;
  });
}
let enhQ = 0; const enhSoon = () => { cancelAnimationFrame(enhQ); enhQ = requestAnimationFrame(enhance); };
if ($('#view')) new MutationObserver(enhSoon).observe($('#view'), { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed'] });
if ($('#view')) { $('#view').addEventListener('change', enhSoon); $('#view').addEventListener('input', enhSoon); } window.addEventListener('resize', enhSoon);

/* karta Europe za početnu: Natural Earth 1:50m (javna domena), konusna projekcija, pojednostavljeno */
const HEROMAP = {"w":760,"h":620,"land":[["IM","M200.4,208.9L197.7,210.6L197.0,210.0L196.0,209.9L196.7,209.2L197.6,207.4L198.7,206.9L200.3,205.3L201.3,204.9L201.5,207.6L200.8,208.2Z"],["UK","M207.9,258.7L207.0,259.2L204.2,259.3L202.9,259.8L200.5,261.1L197.2,260.0L195.6,257.2L194.4,256.0L193.2,255.9L191.8,255.8L190.5,255.4L191.5,254.6L192.5,254.2L190.6,253.3L189.6,252.0L188.1,251.5L185.8,252.1L183.5,252.6L181.4,250.5L181.5,248.6L181.4,247.6L182.0,246.1L183.2,245.5L185.7,245.3L189.6,244.3L191.7,244.0L193.9,243.0L194.8,242.3L195.7,241.3L196.6,240.0L197.6,239.0L196.8,237.6L197.2,236.7L197.6,234.9L197.4,233.7L198.0,232.1L196.6,231.8L195.2,231.7L193.8,232.0L192.4,232.6L191.3,232.4L192.2,231.1L193.7,230.2L195.2,229.5L196.4,228.1L197.2,227.6L199.2,226.7L202.8,226.0L204.5,226.5L205.7,226.6L206.9,226.3L208.0,226.5L210.1,228.6L209.9,226.1L211.1,225.7L212.2,228.3L214.0,228.6L213.1,228.0L212.0,226.6L211.5,224.2L211.9,222.9L212.8,221.7L213.9,220.7L212.9,219.7L213.1,218.4L213.5,217.4L215.1,216.7L215.8,215.3L216.4,213.7L215.0,212.8L213.6,213.3L211.8,210.9L211.3,209.3L210.3,206.1L210.5,204.3L212.7,200.9L215.3,199.1L217.8,198.8L213.8,197.6L212.6,197.6L211.2,198.3L209.9,198.4L208.4,199.3L206.5,199.1L205.6,198.7L205.0,197.6L203.1,198.3L201.9,198.5L200.7,197.6L199.3,196.2L198.2,197.3L197.6,198.7L196.7,197.1L196.1,195.1L196.0,194.0L196.3,192.8L197.5,193.0L199.2,190.4L202.0,187.2L202.9,186.3L203.7,185.0L203.9,184.1L203.7,183.2L202.5,181.0L202.9,179.5L203.5,177.9L204.2,177.1L206.6,177.5L205.9,176.8L204.6,174.9L205.5,173.1L204.7,173.7L203.6,175.1L201.8,175.4L201.2,176.2L200.2,176.8L200.4,174.7L200.9,173.6L201.6,172.8L203.9,171.3L202.9,171.7L200.4,173.0L199.1,174.0L198.4,175.1L198.3,177.4L197.9,178.4L194.4,184.6L193.5,185.5L192.4,185.1L192.3,184.0L194.3,180.2L194.8,179.4L195.5,178.7L196.9,177.5L195.9,177.3L197.1,172.8L198.0,171.5L198.7,169.5L199.7,167.9L200.5,166.8L201.4,165.3L202.2,164.7L202.6,163.7L203.6,162.6L204.5,161.5L200.0,163.9L198.9,164.3L197.8,163.8L197.0,163.2L196.5,162.2L196.6,160.7L195.1,159.9L196.4,159.2L198.0,159.3L199.7,158.4L198.7,157.2L200.2,156.5L202.3,154.4L203.2,152.2L202.8,150.9L201.7,149.0L201.7,147.9L202.6,147.0L204.5,146.6L203.7,145.9L203.5,144.5L204.6,142.2L205.9,140.6L208.3,141.3L210.1,141.8L208.7,138.3L209.5,136.6L209.8,135.4L210.8,134.9L212.8,135.5L213.2,134.7L213.0,133.8L213.4,132.5L213.7,131.2L214.6,130.0L215.6,129.8L216.6,130.4L217.2,131.7L219.1,131.2L219.8,132.4L222.3,132.1L225.4,132.6L227.4,132.5L229.3,132.8L231.3,132.6L233.1,133.3L232.1,135.3L231.8,136.8L231.3,137.7L230.3,138.6L228.1,139.6L223.9,142.1L221.4,143.2L220.5,145.0L221.7,145.5L221.6,146.5L219.4,148.0L218.4,149.7L219.8,149.9L221.0,149.9L223.6,149.3L225.9,149.1L226.9,149.3L228.8,150.4L230.2,150.4L236.8,152.1L238.5,152.1L239.5,152.8L240.1,154.1L240.5,156.4L239.7,157.6L238.5,158.6L237.3,160.1L236.8,161.0L236.5,161.9L236.0,162.8L233.4,166.6L231.2,168.6L230.1,170.2L228.9,171.3L227.8,171.9L226.8,172.3L224.0,172.2L222.1,173.0L221.0,173.1L222.2,173.4L223.3,173.2L225.4,173.5L227.3,175.5L226.8,176.6L225.7,177.3L223.6,176.9L221.1,178.5L220.1,178.9L219.1,179.0L217.9,178.6L216.0,177.5L215.2,176.7L215.8,177.9L216.6,178.6L221.9,181.1L224.3,180.2L226.7,180.8L230.7,184.0L231.6,186.0L232.9,188.8L233.7,190.0L234.3,191.0L234.5,192.4L234.4,196.8L234.6,201.2L234.9,206.0L235.3,207.3L235.9,208.4L239.6,211.2L240.3,212.1L241.5,214.4L242.7,216.7L243.8,218.6L245.1,220.2L244.2,220.7L243.5,221.7L243.6,223.2L244.0,224.7L244.8,227.1L245.4,229.7L244.7,229.0L243.6,228.7L242.6,227.7L241.8,226.6L239.7,226.6L238.6,226.2L237.7,226.0L239.4,226.9L241.4,227.4L245.1,232.2L246.2,234.9L246.5,238.2L245.6,239.5L244.5,240.2L243.4,241.1L242.3,242.1L244.5,244.3L245.6,244.2L247.5,242.5L249.6,242.2L250.9,242.5L252.2,243.1L253.3,243.2L255.6,244.2L256.7,245.0L259.2,248.0L259.6,249.5L259.6,251.3L259.3,253.2L258.5,254.9L257.7,256.5L256.9,258.5L256.1,259.7L254.2,261.1L253.0,261.6L252.1,261.2L252.4,262.5L252.2,263.5L251.1,264.1L250.1,264.2L248.6,263.6L246.1,264.6L247.6,265.6L247.1,267.7L246.0,268.1L244.8,268.1L243.6,268.0L242.6,268.1L241.6,268.6L242.8,268.5L243.8,270.1L246.4,271.4L247.8,271.7L250.5,271.9L251.8,272.1L252.1,273.4L251.5,275.6L247.1,277.3L246.1,278.6L243.7,278.8L242.5,279.5L240.7,279.8L239.3,280.1L237.8,280.6L236.7,280.7L232.3,278.9L229.5,278.4L225.6,278.4L224.6,278.1L223.3,277.0L222.0,276.2L220.3,275.6L219.0,274.6L219.6,276.2L217.3,277.0L216.3,277.1L215.3,276.8L213.2,276.7L211.4,276.2L211.5,277.1L211.8,278.1L210.9,278.3L207.5,276.9L206.4,277.4L205.2,276.8L204.2,275.5L203.0,274.6L201.7,274.0L200.5,273.8L195.6,274.2L194.4,275.5L193.4,277.5L192.3,279.2L190.9,280.4L189.5,280.3L188.6,279.0L186.6,277.3L186.0,276.4L184.4,276.6L183.5,276.3L182.0,276.3L179.3,276.5L178.1,276.9L175.5,278.0L173.7,279.8L172.4,279.8L171.6,278.4L170.5,277.7L169.1,277.7L168.1,278.1L168.1,276.5L169.4,275.6L172.2,275.5L175.0,273.8L176.5,272.8L177.1,272.1L178.5,271.8L179.1,271.0L183.1,268.4L184.1,266.3L184.7,265.0L187.4,264.8L189.3,262.3L193.4,262.5L195.9,263.2L198.4,264.3L199.7,264.7L201.1,264.8L202.3,264.3L204.7,262.0L206.0,261.0L207.4,260.1L208.7,259.1L211.0,257.2L209.7,257.7ZM198.8,224.7L200.2,225.3L198.3,226.5L197.2,227.1L196.1,227.5L195.8,226.6L194.7,224.8L195.2,222.5L196.4,222.2L197.9,222.7ZM256.6,102.8L256.5,104.1L257.5,105.2L258.5,104.9L258.2,106.0L256.9,109.1L256.3,110.5L255.6,112.5L254.3,114.5L254.8,111.8L255.3,110.5L255.1,109.0L253.7,109.0L253.7,108.1L252.7,107.8L252.5,106.7L254.0,106.8L255.2,106.3L255.1,103.8L254.3,103.3L254.9,102.6L255.9,101.5L256.9,101.5ZM234.8,126.3L236.2,127.5L237.2,128.2L236.7,129.1L234.9,128.0L233.3,128.0L232.8,127.2L232.0,126.7L232.2,125.0L232.9,123.9L234.3,124.2L235.1,125.1ZM199.2,184.8L197.9,184.5L197.1,183.6L197.1,181.0L197.6,180.3L198.3,179.7L199.5,180.3L199.8,182.6L199.5,184.0ZM196.8,167.2L192.7,167.1L191.3,166.7L192.9,165.9L194.0,163.7L192.7,162.2L193.2,161.2L194.4,160.9L195.7,161.9L196.1,163.4L197.1,164.0L197.7,164.7ZM191.3,173.6L191.1,175.9L191.0,177.4L190.4,178.5L188.5,178.9L188.7,177.7L188.6,176.6L188.9,175.7L187.0,176.6L187.2,175.4L187.7,174.4L188.6,173.9L190.4,173.8ZM192.3,176.0L191.5,175.6L191.7,174.4L193.7,173.4L193.8,172.1L195.5,171.3L195.0,173.1ZM202.7,130.6L200.7,133.3L199.6,133.9L198.1,134.4L199.2,134.8L199.2,135.7L197.1,137.0L196.0,137.3L194.5,138.4L193.1,139.1L192.1,139.0L191.7,137.9L193.2,137.3L194.4,136.6L193.3,135.3L193.1,134.4L193.5,133.5L193.3,132.2L194.1,131.2L195.1,131.2L196.2,131.9L196.9,130.4L199.6,129.3L202.4,128.2L203.1,129.3ZM199.0,145.9L198.3,147.5L198.3,148.5L198.5,149.6L200.3,150.8L202.0,151.2L201.7,152.4L200.5,153.1L199.0,154.3L198.0,154.2L198.5,151.5L197.2,151.5L196.2,151.2L195.6,150.0L195.3,148.2L193.2,146.9L192.9,145.9L193.6,144.5L194.6,144.9L194.8,143.8L197.3,143.5L197.8,142.4L198.7,143.0L199.2,144.4ZM189.9,139.8L190.7,141.1L189.3,142.5L188.0,142.1L186.6,140.4L187.3,139.6L188.7,139.9ZM186.5,149.7L185.6,149.4L185.3,147.8L186.0,146.0L186.4,144.6L187.5,144.8L186.6,149.5ZM181.4,205.6L180.5,205.2L179.3,205.5L177.8,205.2L176.8,204.8L177.3,203.0L176.3,202.1L175.7,200.6L175.8,199.4L175.5,198.5L174.9,197.7L173.4,198.2L172.4,198.9L172.5,200.2L170.6,201.2L169.4,201.2L168.0,200.8L166.9,199.5L165.3,198.4L165.3,197.2L163.7,194.2L164.0,193.1L165.0,192.7L167.8,192.4L168.5,191.8L167.4,190.5L167.8,189.6L169.1,190.2L170.6,190.0L172.1,188.9L172.9,188.2L174.0,186.1L176.3,185.1L177.3,186.2L178.1,185.9L179.5,184.3L180.7,184.7L182.0,184.9L184.5,184.7L185.5,184.9L186.8,185.8L187.8,186.1L188.4,187.6L188.3,189.8L189.0,192.1L190.0,194.2L189.8,195.3L187.7,196.1L189.1,196.7L190.6,197.3L191.0,198.2L191.1,199.5L191.0,200.5L190.6,201.5L190.1,200.0L189.2,199.1L189.1,200.4L188.5,202.0L189.5,202.5L188.5,204.1L187.4,204.3L186.1,204.1L185.2,205.4L184.2,206.4L183.2,206.8L182.2,206.4ZM222.1,279.1L221.1,279.5L220.3,280.4L219.1,280.4L217.0,278.4L218.7,277.6L219.7,277.1L221.4,278.1Z"],["UA","M689.2,313.2L684.6,314.7L681.4,316.2L679.9,319.7L678.4,320.1L676.6,321.5L675.6,322.9L674.5,325.3L673.0,324.8L671.5,325.4L670.1,326.4L668.7,328.2L667.8,328.8L665.6,329.0L663.5,330.5L659.6,336.3L658.8,339.9L658.4,340.7L657.7,341.7L656.9,342.4L658.2,339.5L658.7,338.5L658.4,336.9L657.3,335.9L656.2,339.5L655.2,340.3L654.0,341.6L654.5,343.6L655.1,345.1L656.3,346.8L658.2,349.0L655.4,348.8L654.8,347.0L653.1,345.9L651.1,346.5L650.3,346.9L648.6,345.6L646.8,345.3L645.7,345.9L644.4,345.9L641.2,344.9L639.4,345.2L639.7,346.5L639.2,347.5L638.1,348.2L637.4,348.8L635.0,348.1L634.0,347.4L631.1,349.2L629.3,349.5L625.6,351.4L623.6,351.0L619.4,349.6L617.9,349.5L616.8,349.9L616.0,349.3L617.5,348.4L618.4,347.9L618.3,346.7L616.3,346.6L614.5,346.9L613.3,346.5L612.2,345.9L614.2,345.4L616.3,345.5L619.5,344.9L622.4,344.8L622.9,343.9L624.2,342.2L621.9,343.3L619.0,343.4L617.8,342.9L616.7,341.9L616.0,340.7L615.9,339.3L615.0,337.2L613.6,335.4L613.0,334.4L611.9,333.6L613.3,335.6L614.1,337.0L615.0,338.2L615.7,341.9L615.7,343.3L614.6,343.9L613.1,344.0L611.5,344.0L611.4,341.9L610.7,342.8L610.1,345.0L609.1,345.6L606.9,345.9L603.0,348.1L603.0,349.6L602.9,351.6L602.5,352.9L601.3,356.9L598.7,361.9L596.3,363.8L595.2,364.9L594.3,365.4L592.5,365.4L591.9,366.1L592.0,368.4L593.1,369.3L594.6,372.6L594.7,374.2L593.8,373.4L592.5,372.6L590.3,372.1L588.1,372.9L585.9,374.9L584.4,375.8L583.4,375.6L582.9,376.5L578.8,376.9L576.9,376.2L575.2,374.6L575.7,373.9L578.3,373.0L578.6,371.7L577.9,370.1L578.6,368.7L579.7,367.4L580.2,366.2L580.0,364.6L581.3,363.6L582.2,362.1L582.2,360.6L582.5,359.7L581.3,357.8L580.9,356.5L580.6,355.4L581.8,353.8L582.9,353.0L584.2,355.5L585.1,353.7L586.3,354.0L587.5,353.8L588.4,354.1L589.7,353.7L590.7,353.0L592.1,354.4L594.9,353.2L595.4,352.3L592.4,350.8L592.2,349.2L591.9,347.4L591.4,346.5L590.7,345.7L588.6,345.2L586.9,344.5L586.3,343.6L586.0,342.7L585.3,342.0L585.2,340.3L585.1,339.2L584.5,338.5L582.8,338.2L582.0,337.4L580.1,336.6L579.2,335.9L579.0,334.2L579.2,332.8L579.2,331.4L578.4,328.8L577.3,327.5L576.3,327.9L574.9,328.2L574.1,327.6L572.5,325.6L570.4,325.6L568.9,326.8L568.3,325.9L567.3,326.2L567.1,324.9L564.8,324.9L563.9,324.7L563.1,323.7L562.1,323.7L561.2,323.3L560.2,322.5L558.8,322.2L557.1,322.2L555.8,322.8L554.4,323.3L553.3,324.6L550.7,325.2L549.4,325.3L546.5,327.3L545.9,328.2L544.4,328.8L542.8,329.6L542.7,331.2L542.4,332.2L541.7,333.6L538.8,334.6L536.2,335.7L533.6,336.5L530.3,338.6L529.3,340.2L528.2,340.7L527.2,341.0L526.4,340.3L523.9,338.6L522.8,337.7L521.7,337.6L520.4,337.9L519.3,338.6L518.1,338.9L516.5,338.4L512.2,338.3L511.2,338.1L508.6,338.6L505.9,337.2L504.6,338.0L502.6,339.8L501.8,339.3L501.5,338.2L500.8,337.6L499.8,337.5L498.3,337.2L497.4,336.0L496.1,335.5L495.2,335.3L494.4,334.1L493.8,332.7L492.3,332.9L492.1,330.0L493.7,327.6L494.0,326.5L494.4,324.1L494.8,323.0L495.3,322.0L495.7,321.1L496.3,320.2L497.8,320.7L499.1,320.9L499.5,320.1L498.3,318.9L497.5,318.3L497.6,317.0L497.6,316.0L497.3,315.0L496.3,312.7L496.1,311.8L496.6,310.5L498.4,307.3L499.0,306.1L499.8,304.7L502.1,301.3L503.5,299.2L504.5,298.1L505.9,296.1L506.5,295.1L509.4,294.1L509.7,293.2L510.1,292.2L510.3,290.2L509.5,288.4L508.6,287.3L509.4,286.6L509.7,285.6L508.3,284.5L507.6,283.7L506.4,281.4L504.4,279.1L503.7,278.4L503.7,276.8L503.3,275.9L502.6,274.7L502.4,273.0L503.4,272.3L504.4,272.3L506.3,273.0L508.1,271.3L509.5,269.1L509.8,267.9L511.6,266.8L512.9,266.5L515.7,265.9L516.8,265.5L517.8,265.0L520.0,264.5L523.5,264.2L525.8,263.9L527.4,263.8L531.3,264.2L532.8,264.2L534.8,264.6L537.2,264.8L539.2,264.7L540.5,264.3L543.2,266.6L544.1,266.8L545.2,266.3L546.9,266.1L548.0,266.4L548.1,267.9L549.2,267.0L549.5,266.1L551.6,266.0L552.9,265.0L554.6,265.0L556.2,265.0L557.4,264.8L559.0,266.4L560.0,266.7L560.4,265.2L561.7,263.9L562.5,263.1L563.4,262.4L564.4,263.0L565.3,264.4L566.4,265.7L568.3,265.4L569.1,264.7L570.8,264.3L573.0,263.5L574.6,262.7L575.7,262.5L577.6,263.5L578.2,264.8L579.7,265.4L580.8,265.3L580.9,264.3L581.4,263.5L580.9,262.6L580.6,261.5L579.9,260.5L579.3,259.5L579.5,257.7L579.8,256.1L580.5,253.6L581.3,252.4L582.4,250.4L583.3,249.6L584.3,249.6L586.1,248.4L588.5,247.7L590.6,247.4L592.0,247.6L593.1,247.7L594.7,247.3L595.6,246.4L596.2,245.7L596.3,242.7L597.0,241.9L599.3,241.8L601.2,241.8L602.2,241.5L604.5,239.3L605.9,238.7L607.7,238.5L609.5,238.1L610.7,237.5L611.8,237.8L613.2,238.6L614.6,240.0L616.6,242.8L620.6,245.4L620.7,246.6L619.3,247.4L618.1,248.0L618.8,249.2L619.6,250.0L620.0,251.2L620.3,252.3L620.9,253.2L621.7,254.0L621.2,255.1L624.3,254.6L625.9,254.8L627.1,255.0L628.7,254.2L630.0,253.6L631.2,253.7L631.8,254.6L632.5,255.5L633.8,255.4L634.6,256.3L635.4,257.7L636.4,259.4L637.4,260.4L637.5,262.0L638.0,263.8L639.3,264.9L640.9,266.2L642.0,266.3L643.0,264.8L643.9,264.0L645.3,263.9L646.5,263.7L647.6,264.1L648.5,264.9L649.3,265.2L651.5,264.6L652.4,265.2L653.8,264.5L654.3,263.5L656.5,261.8L658.0,261.1L659.2,259.9L660.0,259.2L660.9,259.0L662.2,259.9L663.4,260.5L664.0,261.7L665.8,263.2L669.3,264.8L670.6,265.2L671.6,264.5L671.5,262.9L672.2,262.1L674.9,262.9L676.0,262.7L677.1,262.3L678.9,263.0L680.8,263.5L682.1,263.2L682.9,262.4L684.0,262.2L684.7,262.9L685.6,263.4L687.5,263.0L689.7,263.6L691.9,264.4L693.0,264.0L693.8,263.3L695.2,263.1L695.5,264.5L695.9,265.6L697.0,266.4L697.5,267.5L697.6,268.5L697.5,269.5L696.9,271.1L696.3,272.6L695.1,273.6L694.4,274.4L694.9,275.1L695.7,275.7L697.2,275.9L698.8,275.8L698.2,277.1L696.9,277.4L696.3,278.9L696.4,280.3L696.5,281.7L698.0,281.5L699.0,281.7L699.6,282.6L700.3,283.6L700.8,284.6L700.6,285.8L701.6,285.8L702.3,286.4L701.9,287.9L701.9,290.5L701.9,291.8L702.5,293.1L702.2,294.0L701.4,294.4L698.3,295.7L695.6,296.6L694.4,296.8L692.6,297.3L691.8,297.9L691.3,300.5L690.7,301.6L689.5,302.9L687.9,303.7L687.2,304.9L687.4,306.4L687.8,307.6L687.6,308.9L688.3,309.7L688.9,310.5L688.5,311.8ZM619.4,350.7L621.3,351.2L619.5,351.4L615.5,351.5L613.6,351.1L613.0,350.4L612.5,349.2L613.7,350.2Z"],["TR","M562.8,476.0L559.7,477.1L558.6,476.7L559.4,475.4L561.2,474.5L562.8,475.2ZM790.0,472.6L787.1,473.1L785.1,473.9L783.7,474.7L780.7,477.6L775.8,483.0L771.7,486.3L769.4,487.9L767.4,489.0L763.9,490.2L761.0,491.0L759.0,491.7L757.8,491.7L755.8,491.0L753.4,490.3L752.5,490.3L751.3,490.4L749.6,490.9L746.2,494.1L745.1,495.1L743.9,495.9L741.5,498.0L740.4,499.0L738.8,499.5L736.8,500.0L735.1,500.6L733.6,500.1L732.7,499.3L730.1,499.4L728.4,499.8L728.1,501.9L728.5,505.6L728.6,506.5L731.2,509.5L730.3,510.6L729.1,511.0L728.4,511.6L727.9,512.4L728.4,515.5L727.2,516.5L726.7,517.3L726.6,519.4L723.5,518.9L722.3,519.1L722.8,517.4L720.9,514.8L719.0,512.4L719.5,510.4L721.0,507.6L722.5,504.5L722.0,503.0L721.5,501.9L720.6,501.3L719.1,500.6L717.4,502.4L716.3,504.1L715.4,504.6L714.6,505.7L714.4,507.1L713.5,508.5L711.5,509.5L708.1,509.4L704.2,508.7L701.9,507.9L700.3,508.1L699.0,509.1L695.6,513.6L692.9,519.5L692.1,520.6L688.9,523.6L686.6,525.0L685.4,525.2L680.6,527.4L678.1,528.2L676.5,529.8L672.3,529.6L669.6,528.7L667.9,527.6L664.8,524.8L662.8,523.7L658.9,523.1L651.9,521.2L650.1,521.2L645.8,521.8L641.3,522.5L640.6,523.9L641.4,529.0L641.0,530.5L641.2,533.2L640.9,534.0L640.1,534.7L638.6,534.2L637.5,534.1L635.6,535.6L631.6,538.1L630.1,538.6L624.7,537.8L622.6,537.0L621.1,535.9L620.3,533.7L619.2,532.6L618.9,531.7L618.4,530.8L617.4,530.6L616.4,531.6L615.3,531.8L613.7,531.6L609.9,530.4L607.2,530.8L606.1,533.4L605.0,534.4L603.7,534.9L604.2,532.5L600.1,533.6L598.2,535.2L596.4,535.3L595.0,535.0L596.4,533.9L597.4,533.2L601.8,531.9L602.8,531.3L603.6,529.4L605.4,527.6L603.9,527.3L597.2,529.0L592.5,529.7L592.0,530.5L590.8,528.8L591.4,527.8L592.4,527.7L594.7,526.5L594.2,525.0L592.2,524.2L590.5,523.8L589.3,523.2L588.8,521.4L587.6,519.5L586.2,518.7L588.3,517.0L588.2,514.1L587.5,512.4L586.4,512.4L583.1,511.6L582.2,511.9L580.9,510.5L578.9,509.7L578.1,510.3L576.7,510.8L575.2,510.1L573.7,509.8L573.5,507.4L574.5,507.3L574.5,505.9L573.3,503.9L573.2,502.7L574.0,502.2L575.1,502.3L576.4,503.4L576.9,504.6L576.9,505.9L577.8,507.0L578.4,505.9L579.5,506.1L580.9,506.1L584.2,504.7L584.7,503.9L582.2,504.4L581.2,504.0L580.0,502.8L579.1,501.6L578.4,500.2L580.3,498.6L581.4,496.3L579.9,495.7L578.3,495.5L578.1,494.5L578.5,493.6L578.4,492.5L576.0,490.2L575.6,488.8L576.8,487.1L577.9,485.1L576.6,484.4L571.9,486.0L570.1,487.0L566.8,487.9L566.4,487.0L566.8,484.3L566.1,480.4L566.2,478.2L567.9,477.3L569.6,473.7L572.6,469.4L576.5,468.8L577.8,467.5L580.0,467.0L581.0,468.4L583.1,469.0L586.6,468.2L587.4,467.6L588.1,466.9L586.1,465.4L588.0,464.5L589.6,464.6L589.5,465.6L589.2,466.7L594.1,465.4L598.9,464.9L600.3,464.3L604.0,463.6L604.6,462.8L603.3,462.3L602.1,462.2L600.5,461.6L602.5,459.4L603.7,458.8L609.7,456.4L614.2,454.8L607.4,455.0L605.8,454.6L603.4,453.4L602.2,452.3L602.2,450.6L602.3,449.1L602.8,448.2L605.2,447.6L613.6,447.2L619.1,445.1L625.9,445.6L631.8,443.8L632.8,442.6L633.6,439.3L640.9,432.5L643.2,429.2L646.0,427.0L650.9,424.1L654.9,420.9L656.1,420.3L667.0,418.3L674.4,416.4L677.2,413.5L679.3,413.6L679.2,415.0L679.6,416.1L681.3,417.5L682.8,418.3L686.7,418.9L691.0,416.1L692.9,416.1L696.0,420.1L697.8,421.2L699.8,421.8L701.3,421.6L702.0,420.1L702.6,419.4L704.3,418.7L707.6,419.3L709.1,420.6L714.3,420.2L718.9,419.4L721.3,420.1L727.9,419.3L730.2,418.3L733.6,415.5L740.5,411.3L746.3,411.6L747.8,411.4L748.8,410.8L750.7,410.8L752.4,409.8L757.0,405.2L758.1,403.1L759.8,402.1L761.1,400.6L764.2,396.1L764.8,394.1L765.8,394.1L767.6,393.9L768.8,394.0L770.3,392.3L772.3,391.6L774.0,391.0L775.0,390.8L776.2,390.8L777.6,390.5L778.1,387.9L779.4,386.9L780.3,386.6L781.8,387.7L783.1,387.7L785.8,388.8L787.3,389.1L787.8,390.3L788.8,390.7L789.8,390.5L790.0,472.6ZM584.8,437.7L584.8,439.9L586.1,442.0L588.7,444.8L591.1,446.0L600.0,448.2L601.6,448.3L601.6,450.0L601.4,451.5L601.0,452.6L598.8,453.7L591.8,453.2L590.1,453.4L589.0,454.0L587.0,455.7L584.5,455.7L581.2,457.1L580.7,459.7L578.9,462.9L575.4,465.8L572.8,467.5L569.3,472.6L567.8,475.4L567.1,476.0L566.2,476.6L566.3,475.3L566.6,474.1L566.2,472.1L567.4,470.5L568.5,469.3L571.9,466.8L572.7,465.1L569.7,465.7L566.8,466.5L564.8,466.7L563.2,467.0L562.5,465.8L562.3,464.8L563.6,463.0L564.3,461.8L565.3,460.3L565.4,458.7L564.8,457.7L564.4,455.1L566.9,452.7L567.8,452.4L567.9,451.5L567.4,449.5L566.7,447.9L565.4,447.6L564.1,446.6L562.8,446.5L562.7,445.4L565.0,444.0L565.3,442.7L565.6,441.7L566.9,441.2L568.5,440.7L569.6,440.1L570.6,439.3L573.4,437.9L574.8,437.6L575.9,438.4L577.6,439.5L578.5,439.8L580.1,438.8L581.1,438.6L582.3,438.0Z"],["TN","M315.8,650.0L315.4,647.2L314.7,642.9L314.1,638.5L311.0,635.6L308.6,633.5L306.0,631.2L303.3,628.7L303.1,625.7L301.9,621.3L300.5,618.7L297.0,616.2L295.3,614.9L294.6,612.3L293.7,608.7L292.5,605.4L292.1,603.2L292.3,600.4L292.8,598.5L293.5,597.7L296.7,595.5L298.3,592.7L300.2,591.8L301.7,591.1L303.0,590.2L304.2,588.7L305.2,587.1L305.4,585.4L306.0,582.6L306.7,580.6L308.1,578.5L307.7,576.7L307.2,574.7L307.7,571.3L307.6,569.9L307.2,568.7L306.7,567.1L306.8,565.8L307.6,562.5L308.2,559.9L309.1,556.6L309.0,555.7L307.2,554.1L307.6,553.2L309.8,551.7L311.1,549.4L312.1,549.0L313.6,548.2L313.6,547.3L313.3,546.3L317.1,545.4L320.8,542.7L322.1,542.1L330.3,539.8L331.4,540.1L332.5,540.6L332.1,541.6L331.6,542.3L332.2,543.8L333.3,543.0L333.0,541.6L334.7,541.6L336.2,541.8L337.7,542.8L337.5,546.0L339.5,549.2L338.8,550.8L340.5,551.8L342.2,550.7L343.0,549.1L346.0,548.3L348.9,546.0L350.4,545.8L350.7,547.8L351.3,549.6L350.3,550.2L348.8,552.0L346.1,556.5L343.7,557.8L341.9,559.5L341.2,560.8L341.0,562.3L341.3,564.9L342.5,567.7L343.9,569.4L345.3,570.0L348.6,572.8L348.4,574.3L348.8,576.2L348.9,578.4L350.0,580.2L347.3,584.0L345.8,586.8L343.0,590.5L340.4,592.9L335.0,596.4L333.7,597.6L332.8,598.9L332.3,600.2L332.4,601.8L333.9,605.8L336.1,608.2L338.4,609.6L342.5,609.3L342.3,610.8L342.5,612.6L344.1,612.6L345.3,612.3L346.3,610.6L348.2,611.9L349.1,615.6L350.8,616.8L349.9,617.9L352.0,618.8L353.0,618.5L354.6,619.4L353.9,623.5L353.7,624.8L353.5,627.0L353.5,629.6L354.7,631.9L354.7,632.9L354.1,634.0L351.7,635.2L348.6,636.8L345.9,638.3L342.9,639.9L342.0,641.0L340.5,641.8L339.3,642.7L338.1,645.0L336.9,646.3L334.1,646.7L332.2,648.9L331.6,649.6L315.8,650.0ZM346.3,608.8L345.1,609.3L343.6,608.8L342.6,608.3L342.9,606.1L345.9,605.5L347.4,606.9L346.9,608.4Z"],["SY","M790.0,538.4L789.1,539.5L785.7,543.7L783.2,546.7L779.8,550.8L776.8,554.5L773.7,558.4L771.4,561.3L767.8,565.8L765.7,568.4L762.6,572.3L759.9,575.7L756.6,579.8L751.1,580.6L749.3,580.7L747.6,579.8L746.4,579.4L743.7,579.5L741.4,577.6L740.2,577.0L738.4,577.1L738.6,575.4L738.4,574.3L738.8,572.8L738.1,572.1L737.3,570.5L736.6,569.7L736.4,568.6L735.7,567.6L735.1,566.2L735.4,564.5L736.3,563.2L736.7,561.7L737.3,561.0L736.2,560.1L735.5,559.4L735.6,558.1L736.0,557.0L736.9,555.8L737.7,555.4L739.7,554.8L740.8,554.7L739.4,553.8L739.3,552.5L739.8,551.3L740.6,550.3L741.8,548.2L742.0,546.4L739.6,543.0L738.7,542.6L737.4,542.5L737.2,541.1L737.6,540.1L736.6,539.5L735.2,539.5L734.9,540.5L733.3,541.1L730.7,541.9L728.3,538.2L727.6,536.5L727.0,534.5L726.9,531.3L726.1,530.1L725.8,529.2L725.2,528.0L722.4,525.9L721.9,520.6L722.3,519.1L723.5,518.9L726.2,519.6L726.7,517.3L727.2,516.5L728.4,515.5L727.9,512.4L728.4,511.6L729.1,511.0L730.3,510.6L731.3,510.1L728.6,506.5L728.5,505.6L728.1,501.9L728.1,500.4L730.1,499.4L732.7,499.3L733.6,500.1L735.1,500.6L736.8,500.0L738.8,499.5L740.4,499.0L741.5,498.0L743.9,495.9L745.1,495.1L746.2,494.1L749.6,490.9L751.3,490.4L752.5,490.3L753.4,490.3L755.8,491.0L757.8,491.7L759.0,491.7L761.0,491.0L763.9,490.2L767.4,489.0L769.4,487.9L771.7,486.3L775.8,483.0L780.7,477.6L783.7,474.7L785.1,473.9L787.1,473.1L789.3,472.7L790.0,538.4Z"],["CH","M339.3,352.7L340.5,353.8L340.2,355.2L339.1,357.3L338.4,359.1L338.3,360.4L339.5,361.3L341.5,361.7L342.7,362.4L343.1,363.6L344.5,364.7L346.2,365.4L349.0,363.1L350.2,364.7L349.4,367.7L349.3,368.9L349.7,369.8L349.6,371.1L347.6,370.7L346.7,369.6L345.3,369.9L345.0,370.9L344.6,372.0L345.1,373.2L345.4,374.3L345.6,375.6L345.5,376.5L344.4,376.5L343.6,374.8L342.6,374.0L341.3,374.3L339.4,375.1L338.0,374.9L337.5,374.1L337.1,372.5L337.0,371.6L335.4,371.3L334.8,373.1L334.5,375.0L333.8,376.2L332.0,378.2L331.4,379.1L331.0,380.3L331.2,381.3L331.4,382.3L330.2,383.1L329.5,381.4L328.2,379.9L328.9,378.8L326.6,377.7L325.7,376.7L324.5,375.1L324.5,372.2L323.7,371.4L322.7,372.0L321.8,373.1L320.0,374.2L320.3,375.8L318.6,378.1L316.4,379.9L315.6,380.3L313.2,379.1L311.4,379.5L309.7,379.9L307.2,380.3L306.3,379.8L305.7,378.7L305.2,377.6L304.5,376.9L303.5,375.3L303.9,372.7L303.5,371.0L301.2,369.5L299.4,369.4L298.0,370.0L296.7,370.9L297.1,372.5L296.0,373.4L294.5,374.1L293.5,374.1L293.2,372.7L294.1,372.4L294.9,371.7L295.3,370.7L294.7,369.0L295.5,367.5L295.9,366.6L298.0,364.7L299.7,363.5L300.1,362.1L300.4,360.5L302.9,359.3L303.7,358.4L305.6,356.6L307.4,354.9L308.1,354.0L307.1,353.2L307.9,351.6L309.0,351.0L310.0,351.1L310.7,352.2L312.4,352.3L313.4,352.0L314.1,351.1L316.0,349.8L317.0,350.3L319.8,350.6L321.9,350.5L323.2,350.1L324.8,350.2L325.8,350.6L327.6,350.1L326.4,349.5L326.3,348.1L327.2,347.5L328.5,347.6L329.8,348.9L331.1,348.9L331.5,349.7L334.6,349.8L337.3,351.2Z"],["SE","M443.7,165.1L442.9,165.6L442.5,166.9L441.3,167.6L441.4,171.7L442.6,173.2L441.4,173.9L440.7,176.1L439.2,177.1L437.8,179.1L437.5,181.2L436.6,182.1L435.6,182.3L436.1,180.7L436.8,179.3L436.0,178.4L435.5,177.0L434.8,175.9L435.2,174.7L434.9,172.7L434.9,170.7L435.5,169.7L436.2,168.9L437.3,166.9L438.5,165.5L440.2,164.8L441.1,165.3L441.3,164.0L442.5,164.0ZM419.9,194.6L419.4,195.5L418.6,194.2L418.4,191.1L418.6,189.5L420.5,183.8L421.5,183.3L422.7,179.8L423.0,178.3L423.6,176.9L423.9,175.6L424.8,175.3L424.4,176.3L424.5,177.2L423.0,181.8L422.6,184.4ZM459.2,-30.0L460.5,-29.2L461.9,-27.2L463.2,-26.2L462.5,-24.6L462.5,-23.1L462.9,-21.2L463.4,-19.7L463.2,-18.6L463.1,-17.0L464.7,-16.5L465.8,-14.5L465.1,-13.2L465.0,-11.6L465.3,-10.6L465.7,-9.5L466.5,-8.3L467.5,-7.2L468.1,-6.2L468.7,-4.9L468.2,-2.9L468.4,-1.4L468.4,-0.4L467.8,1.0L467.3,2.3L467.4,3.4L467.7,4.8L467.9,5.8L468.5,6.9L469.8,7.6L470.6,9.1L471.2,10.4L472.5,13.7L470.6,14.4L468.9,13.8L466.9,14.5L465.4,15.0L464.6,16.1L463.1,15.3L461.6,13.9L460.8,15.2L459.5,14.5L458.6,15.7L458.3,17.0L458.4,19.0L457.1,19.3L457.7,20.4L455.9,20.9L456.3,22.1L455.8,23.0L454.3,23.5L453.4,23.6L453.2,24.5L453.8,25.2L454.1,26.3L452.7,25.3L453.3,26.6L454.0,28.2L453.1,31.1L452.2,32.5L451.5,33.8L451.2,35.1L452.5,36.5L453.1,38.3L453.7,39.8L454.9,41.2L454.8,42.1L453.1,44.5L451.4,46.9L449.8,52.9L449.2,53.7L447.5,54.9L446.9,55.9L445.6,57.1L443.3,58.3L442.3,59.7L441.9,61.1L440.8,60.8L440.0,61.4L438.8,61.1L438.3,62.1L438.0,63.6L436.5,65.8L434.6,65.5L435.0,66.4L433.5,67.1L432.8,68.1L432.5,69.3L431.5,69.8L430.7,70.6L432.3,70.7L432.2,71.8L430.3,73.4L429.7,74.5L429.0,73.7L427.8,73.8L427.4,72.8L427.3,73.9L428.1,75.9L427.6,77.1L428.5,77.6L428.0,78.5L427.1,80.0L426.2,80.1L425.6,81.0L424.4,80.5L423.5,80.1L423.3,81.6L423.8,83.3L424.8,84.6L425.7,85.1L424.7,86.4L424.2,89.1L424.0,90.1L423.8,92.0L424.0,93.5L424.7,95.3L423.6,95.2L422.3,94.7L422.5,95.9L421.9,97.4L422.1,98.7L422.1,101.0L422.7,102.3L422.6,103.5L422.7,105.3L423.1,108.3L423.8,111.5L423.7,112.4L423.6,113.5L424.7,114.6L426.4,114.5L427.2,115.5L427.5,116.4L429.3,115.5L430.7,116.7L432.1,118.5L433.0,119.3L434.4,119.7L435.9,121.1L435.8,123.0L438.2,124.2L438.9,125.1L439.7,126.6L440.4,128.7L440.3,130.0L438.1,132.0L437.4,133.1L435.3,135.2L434.2,136.3L433.2,136.5L431.4,137.9L433.0,138.6L434.2,137.6L435.4,137.5L436.4,136.7L437.5,138.1L436.5,138.8L435.4,140.9L435.0,141.8L432.9,143.2L431.8,144.4L430.5,145.3L429.0,146.1L427.1,147.3L426.1,148.8L423.8,150.1L422.7,151.2L419.5,151.4L416.4,151.3L415.4,151.8L416.4,151.9L418.0,152.1L419.9,152.3L420.9,152.5L422.3,154.2L421.4,154.8L419.7,155.4L420.4,157.7L421.0,159.3L420.4,160.3L420.5,164.8L419.5,164.9L419.2,166.8L419.5,167.7L419.6,169.9L419.8,171.2L420.4,172.4L420.2,173.7L418.8,176.8L418.9,178.2L419.4,180.4L418.8,183.0L418.4,185.1L417.8,187.0L416.6,189.2L416.0,190.8L414.6,196.0L413.8,197.0L412.9,197.8L411.8,197.1L410.8,196.7L409.6,196.8L407.8,197.4L405.0,197.1L402.3,197.3L402.0,199.6L401.0,199.9L400.0,199.4L399.1,200.0L398.4,200.7L397.0,202.3L396.5,203.3L396.4,205.2L397.2,206.9L397.8,208.9L396.1,211.3L395.1,211.4L392.3,210.7L387.3,212.2L382.8,210.9L383.4,209.7L383.4,208.7L383.6,207.3L383.8,205.8L383.8,204.8L383.5,203.7L382.4,202.4L380.0,197.6L379.3,195.7L378.8,194.8L381.2,195.9L382.2,195.4L381.6,193.9L380.8,192.1L381.9,191.9L383.4,190.8L383.1,188.9L382.2,188.4L380.1,185.1L378.6,183.6L376.0,177.7L375.2,173.6L374.3,174.0L373.9,172.2L373.6,170.6L373.6,169.3L372.2,168.6L372.0,163.9L370.6,163.4L369.7,161.2L369.6,157.1L368.7,156.3L368.0,155.5L368.2,154.6L367.9,150.8L367.9,147.4L367.5,146.4L367.4,145.1L367.6,144.1L368.8,143.4L369.7,144.3L370.4,146.7L372.0,146.4L372.7,144.8L373.2,142.2L373.7,139.8L373.2,137.2L372.8,134.9L374.2,132.4L374.7,130.8L375.2,129.3L376.5,128.7L377.4,128.5L378.6,127.5L379.6,126.2L380.4,125.0L380.7,122.6L380.8,121.3L381.1,120.4L381.5,118.7L381.2,116.9L380.3,114.2L379.2,110.5L379.1,108.4L380.6,107.8L382.5,107.7L383.0,106.6L383.4,105.4L383.9,104.5L384.2,103.2L384.4,102.1L383.3,100.3L381.9,98.5L381.0,97.9L379.3,96.4L378.1,95.1L378.9,90.4L379.5,86.9L379.7,84.7L378.2,79.0L378.3,77.7L378.5,76.6L378.4,74.7L378.3,72.9L379.3,71.4L378.7,69.9L377.6,66.0L379.4,62.3L379.2,60.3L380.3,59.0L382.2,55.8L383.3,54.0L384.4,52.9L386.0,52.0L387.8,51.6L391.6,52.2L394.0,52.7L394.8,51.2L395.5,49.7L395.5,48.1L395.3,45.7L394.9,44.3L393.3,43.4L391.5,42.1L393.7,38.1L395.2,35.3L397.1,31.1L397.7,29.3L398.6,22.1L398.9,20.3L399.2,19.3L399.2,18.4L399.0,16.7L398.5,13.0L401.3,12.5L402.3,12.2L403.1,11.8L404.8,10.6L405.6,9.6L405.1,6.1L406.0,4.9L408.4,0.7L410.9,-3.3L412.1,-4.8L412.3,-6.7L411.7,-8.5L411.1,-9.7L409.9,-11.8L410.3,-13.3L412.2,-14.3L413.0,-15.6L414.3,-20.9L417.0,-23.6L418.0,-25.0L419.8,-24.1L422.4,-22.6L423.4,-25.0L423.7,-25.9L424.0,-27.2L423.7,-29.4L459.2,-30.0Z"],["ES","M240.5,484.8L241.7,485.6L243.2,485.3L244.7,486.0L244.7,487.1L243.8,488.3L242.7,489.5L241.7,490.8L240.8,492.4L239.4,493.2L238.1,493.6L235.9,492.0L234.5,491.5L234.1,489.1L232.6,488.0L231.7,488.3L230.5,489.1L230.1,488.1L229.2,487.7L229.1,486.4L235.6,482.8L237.4,482.1L241.2,481.5L241.1,482.7L241.3,483.6ZM256.8,486.1L252.5,483.6L251.1,483.2L251.0,481.7L254.1,481.4L256.3,482.5L257.3,484.8ZM213.9,496.9L213.1,497.9L211.1,497.1L211.3,495.4L212.2,494.5L213.0,493.7L216.2,493.5L216.8,494.2L216.8,495.1L214.6,496.7ZM185.6,407.0L185.8,408.6L187.3,409.8L189.3,410.5L190.0,411.1L189.5,412.7L188.8,413.4L188.6,414.4L189.4,414.9L190.6,413.9L192.2,415.7L195.1,417.6L196.4,417.9L197.3,418.3L199.1,421.3L200.5,421.6L201.7,421.6L203.0,421.6L204.1,422.5L204.9,423.4L205.5,424.3L209.3,424.8L210.7,425.5L213.4,426.1L214.9,426.4L215.5,424.4L216.3,423.7L217.1,424.0L220.2,425.7L221.4,426.6L222.6,427.3L223.7,427.6L225.2,429.9L224.9,431.1L224.8,432.4L225.5,433.0L226.9,432.8L228.2,432.3L230.5,433.4L231.3,434.1L231.9,435.5L233.5,435.3L235.0,434.8L237.2,435.8L239.7,437.0L240.8,437.3L241.2,436.4L242.3,436.2L243.2,436.0L244.3,435.7L245.4,435.6L246.5,436.2L247.7,436.6L248.8,438.0L249.4,439.5L248.2,439.9L247.0,441.5L247.9,442.6L247.7,445.7L246.1,447.0L243.9,448.4L233.7,452.4L231.0,454.7L230.0,455.2L222.7,455.7L217.4,456.6L215.0,456.8L211.4,459.4L209.8,460.4L210.9,460.9L211.9,462.6L209.3,463.9L208.4,464.0L203.3,468.6L199.7,471.9L197.8,473.3L195.6,475.5L190.8,481.3L190.5,483.1L190.9,489.9L191.6,491.8L192.7,493.5L195.2,495.3L195.6,496.6L194.5,497.5L191.4,499.0L186.2,500.9L183.7,502.6L182.9,504.6L181.3,505.3L180.2,508.1L179.0,509.9L177.5,511.8L177.2,512.8L178.3,514.6L177.5,515.1L175.0,515.0L169.3,514.0L164.1,516.2L161.2,518.6L158.0,523.3L154.8,525.9L153.5,526.2L152.1,524.4L150.0,523.8L147.8,523.7L146.5,524.5L144.6,524.7L143.1,523.8L139.5,522.7L137.9,522.4L135.2,522.6L133.2,521.5L129.6,520.4L121.6,519.1L120.6,519.1L119.2,520.2L116.2,521.8L112.3,520.8L108.5,521.3L107.4,522.0L105.3,524.1L104.4,525.8L103.2,525.2L102.6,526.5L101.1,526.8L100.0,526.8L97.6,524.9L95.8,522.6L94.7,522.1L93.5,519.0L93.2,517.1L93.1,515.1L93.5,513.8L92.0,512.6L92.1,510.9L93.9,509.1L95.1,508.4L94.3,508.0L92.8,509.1L92.1,506.5L87.7,500.5L88.3,499.7L87.2,500.0L83.6,499.1L80.2,498.6L80.6,493.9L80.8,492.1L81.0,490.9L82.6,488.6L83.8,487.9L85.7,486.1L87.7,484.8L89.4,484.8L91.2,483.5L91.9,482.5L89.8,482.0L87.9,476.1L89.0,474.3L89.7,472.9L90.1,471.7L91.3,471.0L92.9,470.4L94.4,469.3L95.4,468.0L95.9,466.8L95.5,465.7L93.9,464.7L93.1,460.5L93.4,458.2L92.2,456.5L91.7,454.2L92.9,453.9L97.5,455.2L98.6,455.1L100.0,453.7L101.6,451.5L102.3,450.1L101.1,447.4L101.7,446.3L102.8,445.8L104.2,445.3L105.1,444.7L105.0,443.3L105.5,442.1L106.3,439.7L107.0,436.9L107.2,435.0L107.0,432.4L107.9,431.7L109.5,431.3L111.2,429.7L113.3,428.6L115.9,428.0L117.8,427.0L118.7,426.1L119.1,424.6L118.5,423.6L117.5,422.9L116.2,422.5L115.5,421.6L116.0,420.1L116.3,418.6L115.9,417.1L114.7,416.9L113.9,416.2L112.7,416.1L110.5,415.4L109.7,414.9L108.7,414.5L107.9,415.7L106.9,416.0L105.0,416.0L103.6,415.5L102.4,414.7L101.5,413.9L98.7,413.4L97.4,413.3L95.8,413.6L94.8,413.2L94.6,411.6L96.5,409.9L96.2,408.8L96.0,407.5L94.5,407.4L91.5,407.3L89.2,407.8L87.6,408.5L86.6,408.5L87.1,405.2L89.2,403.8L90.6,403.1L89.1,402.4L89.4,401.5L90.9,400.5L90.1,399.1L90.7,397.5L91.1,396.2L88.5,396.4L88.4,394.8L90.2,393.4L89.1,392.2L88.3,390.9L87.9,389.9L87.6,388.5L87.9,387.5L89.4,385.3L90.7,385.0L91.8,384.8L94.2,383.8L96.8,384.9L98.5,385.1L100.2,384.7L101.1,384.8L102.7,384.5L103.0,383.4L102.8,382.6L105.2,381.6L107.2,381.0L109.2,381.3L111.5,380.9L112.6,382.0L113.8,382.1L114.9,383.3L116.1,385.6L118.4,387.0L120.7,387.1L124.3,388.0L126.0,388.8L129.4,389.3L131.2,389.9L134.4,389.9L136.4,391.6L140.7,393.4L143.2,395.0L150.3,398.5L153.0,399.2L157.1,399.3L158.8,399.1L160.2,399.8L162.6,399.6L163.6,400.0L164.7,401.4L169.2,404.0L170.8,403.1L171.8,403.0L175.1,404.6L178.2,406.9L180.0,407.4L182.8,407.6L185.1,407.1Z"],["SK","M495.8,320.3L495.3,322.0L494.8,323.0L494.4,324.1L494.0,326.5L493.7,327.6L492.1,330.0L492.3,332.9L488.0,334.6L486.9,334.0L485.8,332.6L484.6,331.6L483.0,331.2L480.9,332.2L479.3,332.4L478.3,332.3L476.9,332.0L474.2,332.1L472.4,332.7L470.9,337.1L468.5,338.6L466.5,340.2L464.8,340.1L463.5,339.4L462.4,339.1L461.0,340.3L460.7,341.3L458.3,342.1L454.0,342.8L452.6,343.8L452.2,345.0L452.6,346.5L452.2,347.4L449.0,348.1L445.0,348.6L442.6,348.7L440.3,348.7L438.7,348.1L436.8,346.8L434.7,345.0L432.9,344.7L431.8,344.2L430.3,341.4L428.9,338.0L428.8,337.0L429.3,335.9L429.7,335.0L430.1,332.7L431.0,330.8L431.8,329.6L433.8,329.5L436.0,329.7L437.7,329.4L439.2,328.4L440.1,327.7L440.7,326.9L441.3,326.1L442.6,325.6L443.1,324.0L443.1,322.9L443.6,321.5L446.0,319.9L446.5,318.9L447.8,317.5L449.5,316.9L451.0,316.4L452.6,316.5L452.8,317.4L453.0,318.4L455.2,318.2L456.2,316.0L457.7,315.0L458.8,314.7L459.6,315.9L460.3,316.9L461.2,317.8L462.6,318.1L462.8,319.1L462.7,320.6L463.9,321.1L466.2,321.3L466.7,319.6L467.3,318.7L468.1,318.3L468.8,317.7L470.0,317.3L471.5,317.2L472.5,316.9L473.8,317.2L474.7,317.9L476.5,317.9L477.9,315.9L479.6,315.6L481.1,315.4L484.5,315.4L485.4,315.8L487.6,316.3L488.6,317.0L489.1,317.9L491.6,319.3L495.0,320.3Z"],["SI","M425.9,372.5L424.8,372.1L423.4,372.0L422.6,372.5L422.6,374.6L420.8,374.8L419.5,376.3L418.7,376.8L417.6,377.2L416.8,377.6L415.8,378.0L414.6,378.8L414.5,380.0L415.4,381.1L415.5,382.2L415.5,383.7L415.0,385.0L412.8,385.7L410.6,386.9L411.6,388.2L410.8,389.1L410.8,390.4L411.5,391.7L410.2,392.2L408.5,392.1L406.5,391.2L405.2,391.8L403.7,391.1L402.6,390.0L401.9,388.5L400.8,389.5L399.8,391.2L397.9,391.5L396.4,391.6L395.4,391.7L394.2,391.1L393.5,392.2L389.4,391.7L389.7,390.6L390.7,389.7L392.3,389.6L392.2,388.0L390.8,386.5L390.0,386.0L389.0,385.6L389.4,382.9L388.1,382.6L387.8,381.4L388.6,380.5L389.5,379.7L388.6,378.6L387.4,378.1L386.5,377.4L386.8,376.4L387.8,375.4L388.8,374.6L389.8,374.0L390.6,372.7L392.2,372.9L393.4,373.1L394.6,373.4L395.6,373.8L397.7,374.1L399.6,374.4L400.6,374.6L401.6,374.6L402.9,373.7L403.8,373.0L404.5,372.2L405.5,371.1L406.8,370.7L409.5,370.3L412.3,370.5L413.6,370.0L414.7,369.2L416.3,369.0L418.8,369.5L419.0,367.2L419.7,366.4L422.8,366.1L423.2,367.5L423.5,368.6L424.1,369.3L424.6,370.6L425.7,372.1Z"],["RS","M489.6,398.8L491.7,399.3L492.8,399.8L493.3,400.6L494.7,401.0L497.0,401.0L498.6,401.7L499.6,403.0L500.9,402.5L502.6,400.2L504.5,399.4L506.5,400.2L507.6,400.9L507.4,401.8L506.4,401.8L505.6,402.3L505.0,403.3L505.0,404.3L505.6,405.3L506.3,406.0L507.3,406.3L507.9,407.4L507.2,408.5L507.1,410.7L505.6,412.0L504.7,413.0L504.5,415.0L504.7,416.4L505.2,417.7L505.9,418.4L506.5,419.5L507.0,421.0L507.9,422.1L509.9,423.0L510.9,423.6L511.7,424.5L512.3,425.3L514.0,426.3L513.8,428.0L512.8,429.6L512.1,430.2L511.1,432.2L509.1,432.6L508.0,433.4L507.7,434.3L508.2,435.8L508.0,437.3L508.7,438.8L509.5,439.5L509.6,440.6L508.7,442.2L507.5,443.2L506.5,442.7L504.8,443.3L503.5,443.8L502.5,443.6L501.5,443.7L500.3,444.2L499.4,445.0L497.8,445.6L496.7,445.0L496.3,444.2L497.4,442.9L498.6,439.0L498.8,437.9L497.6,437.5L493.8,436.6L493.8,435.1L492.6,434.4L491.4,433.8L489.7,431.6L488.7,430.8L487.5,430.5L486.4,429.9L485.4,428.9L485.0,428.1L483.7,428.8L482.7,429.4L483.0,430.6L483.3,431.7L481.2,434.1L481.4,435.4L479.6,436.5L479.4,435.3L478.4,434.6L477.0,434.1L473.9,432.3L472.7,432.1L471.6,432.0L470.1,431.1L468.4,430.3L466.4,428.1L464.8,426.9L463.7,426.3L463.2,425.1L464.0,423.8L465.4,423.6L466.6,424.1L467.1,422.5L466.9,421.4L465.1,419.0L463.6,417.3L464.1,416.3L466.0,416.5L467.3,416.2L467.7,415.1L465.5,413.3L464.3,412.0L462.8,411.1L461.7,410.8L461.2,409.8L461.2,408.8L461.2,407.5L462.2,405.2L463.0,403.5L463.5,401.9L463.6,400.5L463.0,399.8L462.0,399.6L460.7,399.9L459.6,400.5L459.1,399.7L460.1,399.5L459.5,395.7L460.3,395.4L461.3,395.0L462.5,394.9L463.6,394.7L463.5,393.7L462.8,393.0L459.6,392.0L458.4,390.9L458.4,389.7L459.0,388.8L457.6,388.1L457.1,387.4L457.4,386.3L456.6,384.4L455.8,383.1L456.5,381.8L457.9,380.7L458.4,379.8L459.5,380.1L461.1,379.7L462.5,378.8L463.3,378.0L464.1,376.7L465.1,376.4L466.6,376.6L468.1,376.6L469.2,376.2L472.1,376.3L473.1,376.8L474.0,377.8L474.8,379.1L475.9,379.7L477.1,380.3L478.9,382.4L479.6,383.1L480.7,384.4L480.6,385.5L481.0,386.6L480.9,387.6L482.2,388.5L483.2,389.6L484.4,390.2L485.4,390.7L487.1,391.5L489.1,391.9L490.3,392.4L490.7,393.3L490.1,394.2L489.7,395.2L489.5,396.1L490.8,396.6L491.6,397.3L490.5,397.9L489.5,398.2Z"],["SA","M744.4,650.0L743.8,643.3L747.5,642.9L750.5,642.6L754.8,642.1L759.4,641.5L762.0,641.2L762.8,640.7L765.4,636.8L767.7,633.2L768.5,629.5L769.4,625.8L770.0,624.9L772.5,623.5L776.6,621.2L780.6,618.9L781.0,615.7L781.3,612.2L781.6,611.3L784.1,608.6L785.6,606.9L781.9,604.7L778.5,602.6L774.6,600.3L771.4,598.5L766.7,595.8L763.6,594.1L767.2,591.6L771.1,588.9L775.0,586.2L779.7,582.9L783.4,580.3L788.8,576.4L790.0,575.5L790.0,650.0Z"],["RU","M790.0,184.1L789.9,185.5L789.6,186.4L788.4,187.7L787.2,189.5L786.7,191.2L785.3,192.5L783.8,193.7L783.5,195.0L783.8,196.7L784.0,198.3L782.3,201.7L781.5,203.8L780.8,205.1L779.1,205.6L779.8,206.7L781.7,209.7L783.3,211.4L784.3,212.4L785.1,213.1L786.0,214.4L786.1,215.4L784.7,217.9L783.3,219.6L782.0,219.6L780.3,219.0L777.2,217.2L773.5,215.3L771.2,214.4L769.9,214.4L769.0,215.1L768.5,216.2L768.3,217.1L768.1,218.1L768.3,219.2L768.9,220.4L769.5,221.8L769.5,222.9L768.7,224.6L768.0,226.7L768.1,229.7L768.9,233.3L769.8,235.6L770.8,236.4L772.3,236.7L773.4,237.2L773.9,238.0L774.2,238.9L774.1,240.2L773.4,241.8L773.1,245.3L773.9,249.6L775.7,252.0L778.5,252.4L780.5,252.3L781.6,252.8L783.0,254.3L783.7,256.0L784.1,257.3L785.1,258.3L786.5,259.3L788.0,259.6L788.8,258.7L789.5,257.6L790.0,361.6L788.8,362.7L786.7,364.1L785.7,364.1L785.1,363.0L785.4,362.0L782.5,361.2L781.4,360.9L778.4,361.1L774.6,360.9L773.1,360.3L771.1,359.5L769.2,359.5L768.1,360.2L766.9,360.8L764.6,360.4L762.9,361.0L761.1,362.1L760.3,362.8L754.3,364.6L752.4,364.2L750.7,363.7L747.1,364.4L745.0,364.3L742.9,363.9L740.6,363.7L739.1,364.7L736.8,365.0L734.2,365.4L733.5,366.0L733.2,367.5L733.0,368.8L731.4,368.4L725.3,365.6L721.9,363.5L712.0,359.5L710.8,359.3L706.4,359.7L704.5,359.5L698.8,356.0L697.2,357.3L695.6,357.7L694.5,357.6L693.2,357.2L692.2,356.5L690.7,354.8L689.3,353.9L685.6,353.3L681.6,353.4L680.9,352.5L683.7,350.4L684.3,349.5L682.4,349.1L681.1,348.9L681.8,348.0L682.6,347.4L684.2,347.7L686.2,348.6L687.7,348.7L688.1,347.8L692.4,345.1L692.4,344.1L692.0,343.1L690.9,342.0L691.1,340.2L692.3,337.0L692.2,333.2L692.9,332.0L693.8,332.3L694.4,333.7L694.6,332.3L694.7,330.5L696.2,330.0L697.4,329.9L698.4,329.3L695.4,327.4L691.6,325.8L690.5,326.4L689.6,326.2L687.6,324.5L686.5,322.9L687.7,322.5L689.0,322.4L690.9,320.3L691.6,319.9L693.1,319.8L695.1,319.4L694.5,318.3L693.4,317.1L695.3,315.3L697.1,314.0L700.3,310.7L701.8,309.7L701.7,308.5L700.5,307.1L699.6,306.2L697.5,306.8L697.0,308.9L694.2,310.5L692.8,310.8L693.5,309.4L694.4,308.6L692.5,309.2L691.8,310.7L689.2,313.2L688.5,311.8L688.9,310.5L688.3,309.7L687.6,308.9L687.8,307.6L687.4,306.4L687.2,304.9L687.9,303.7L689.5,302.9L690.7,301.6L691.3,300.5L691.8,297.9L692.6,297.3L694.4,296.8L695.6,296.6L698.3,295.7L701.4,294.4L702.2,294.0L702.5,293.1L701.9,291.8L701.9,290.5L701.9,287.9L702.3,286.4L701.6,285.8L700.6,285.8L700.8,284.6L700.3,283.6L699.6,282.6L699.0,281.7L698.0,281.5L696.5,281.7L696.4,280.3L696.3,278.9L696.6,277.9L698.2,277.1L699.0,276.6L697.2,275.9L695.7,275.7L694.9,275.1L694.4,274.4L695.1,273.6L696.3,272.6L696.9,271.1L697.5,269.5L697.6,268.5L697.5,267.5L697.0,266.4L695.9,265.6L695.5,264.5L695.6,263.6L694.5,262.9L693.0,264.0L691.9,264.4L689.7,263.6L687.5,263.0L686.4,263.3L684.7,262.9L684.0,262.2L682.9,262.4L682.1,263.2L680.8,263.5L678.9,263.0L677.1,262.3L676.0,262.7L674.9,262.9L672.2,262.1L671.5,262.9L671.7,264.1L670.6,265.2L669.3,264.8L665.8,263.2L664.0,261.7L663.4,260.5L662.2,259.9L660.9,259.0L660.0,259.2L659.2,259.9L658.4,260.8L656.5,261.8L654.3,263.5L653.8,264.5L653.2,265.4L651.5,264.6L649.9,264.7L648.5,264.9L647.6,264.1L646.5,263.7L645.3,263.9L643.9,264.0L643.0,264.8L642.0,266.3L640.9,266.2L640.0,265.1L638.0,263.8L637.4,262.6L637.6,261.2L636.9,259.8L635.4,257.7L634.8,257.0L634.7,255.7L633.1,255.7L631.8,254.6L631.2,253.7L630.0,253.6L628.7,254.2L627.6,254.9L625.9,254.8L624.3,254.6L621.5,255.3L621.7,254.0L620.9,253.2L620.3,252.3L620.0,251.2L619.6,250.0L618.8,249.2L618.1,248.0L619.3,247.4L620.7,246.6L620.6,245.4L616.6,242.8L614.6,240.0L613.2,238.6L611.8,237.8L610.7,237.5L609.5,238.1L607.7,238.5L605.9,238.7L604.5,239.3L602.2,241.5L601.2,241.8L599.3,241.8L597.7,241.7L596.5,242.2L596.2,245.7L595.6,246.4L594.7,247.3L593.9,247.6L592.0,247.6L590.8,247.3L589.3,245.4L588.1,244.5L587.2,242.1L586.8,240.2L585.8,238.6L585.4,237.4L585.6,236.3L583.9,234.8L582.6,233.7L581.8,232.9L581.5,231.6L581.9,230.1L582.2,228.9L583.7,228.4L584.8,228.2L585.7,228.3L587.2,229.4L589.4,229.1L590.3,228.9L591.3,227.9L592.8,226.0L593.0,224.8L593.9,223.8L595.1,223.0L594.8,221.6L591.7,220.0L590.9,218.9L590.9,217.5L587.9,216.6L585.6,216.8L583.9,217.4L583.2,216.4L583.3,214.8L583.1,213.6L582.4,212.8L580.5,212.2L577.8,211.3L576.3,209.9L575.3,208.2L574.4,207.3L573.1,206.9L573.5,204.6L571.3,203.5L569.1,202.4L568.8,201.0L568.9,200.0L569.8,197.2L569.2,195.7L568.1,194.4L567.2,193.5L567.1,192.6L567.6,191.2L567.1,189.0L566.6,187.8L564.9,187.7L563.7,187.1L561.8,185.6L559.1,184.8L557.2,185.4L556.1,185.5L555.2,186.6L554.5,187.2L553.4,187.8L552.2,189.3L551.3,188.8L550.5,187.8L550.5,186.9L550.4,185.5L549.1,184.7L546.9,184.2L545.6,184.8L544.3,186.2L543.1,185.3L542.3,184.4L541.5,184.0L539.9,184.3L539.1,185.2L537.1,183.9L537.2,183.0L537.3,181.7L537.0,180.7L536.5,179.5L535.5,177.4L534.2,176.0L533.1,174.2L532.1,172.2L531.3,171.6L529.9,172.3L530.0,169.7L529.8,168.4L529.9,166.8L530.4,165.6L530.3,164.7L529.6,163.5L528.3,162.8L526.8,162.0L526.2,160.6L524.6,160.5L524.5,159.0L524.6,157.9L525.3,156.7L525.5,155.3L527.4,154.2L526.9,153.1L525.8,151.3L524.7,149.2L523.8,147.8L523.5,146.9L523.4,145.9L523.5,144.9L523.3,143.9L521.3,138.7L521.2,137.7L521.3,136.7L521.6,135.8L522.4,134.5L523.3,132.4L523.7,129.7L523.9,128.1L524.9,127.4L525.7,126.2L524.8,124.6L524.4,122.8L523.9,121.1L523.4,119.8L523.6,118.7L525.2,119.4L526.4,119.8L527.1,118.9L527.0,117.4L528.4,117.1L529.7,117.0L530.8,116.7L531.7,115.7L531.8,114.8L532.2,113.6L532.6,112.8L537.5,112.6L541.9,113.1L542.0,111.5L540.8,110.9L538.7,109.2L537.0,108.2L535.6,108.3L534.0,109.2L531.2,109.5L528.4,107.4L526.7,106.9L525.2,105.2L524.8,104.2L526.1,104.9L526.1,103.9L525.9,102.7L525.1,102.0L521.9,104.2L518.6,105.5L521.0,101.1L522.7,97.9L523.9,96.5L524.6,95.6L525.1,94.4L526.9,92.0L528.7,89.3L530.2,86.1L530.7,85.0L531.5,83.9L532.9,80.4L533.4,79.4L535.1,75.1L536.1,72.9L536.6,71.7L538.9,67.4L540.3,64.1L540.7,62.3L541.0,59.9L541.1,58.3L541.4,56.1L540.9,54.9L540.1,54.1L539.0,53.2L537.9,52.0L537.1,51.0L535.0,49.7L531.9,48.2L529.7,47.0L526.0,44.3L525.3,43.6L526.8,42.0L527.8,39.0L528.2,37.5L528.2,36.4L527.9,35.3L527.5,34.2L526.2,32.9L523.6,31.9L522.8,30.6L522.0,29.2L522.6,26.8L522.2,25.2L519.3,24.5L518.5,23.8L517.8,22.7L517.3,21.7L517.1,20.4L517.7,19.5L518.3,18.1L517.9,17.1L516.5,17.0L516.7,14.8L516.2,12.3L516.5,10.4L515.5,9.5L516.6,8.5L517.7,8.1L518.0,7.0L517.7,5.9L515.6,1.8L515.1,0.6L514.0,-0.8L513.1,-1.8L511.7,-3.8L511.0,-5.3L510.0,-6.8L509.0,-8.3L508.1,-9.6L506.1,-12.1L505.6,-13.6L506.2,-17.0L506.8,-19.1L507.7,-21.7L508.5,-23.9L509.4,-26.4L509.2,-28.8L507.8,-30.0L590.8,-30.0L590.5,-28.8L588.5,-25.1L583.8,-20.0L579.6,-17.3L577.8,-16.5L574.0,-15.9L571.8,-15.8L568.8,-16.7L566.3,-16.8L564.6,-16.7L561.7,-16.0L554.9,-15.7L553.7,-16.0L548.8,-18.2L547.5,-16.8L546.6,-16.3L545.7,-17.3L543.4,-18.4L541.6,-18.0L540.4,-18.5L539.0,-18.8L538.3,-18.2L535.5,-19.0L534.1,-19.9L532.5,-21.7L532.8,-23.1L528.7,-23.3L525.0,-22.6L527.4,-22.2L528.6,-21.6L530.1,-20.7L530.2,-19.1L532.3,-17.9L533.9,-16.7L534.6,-16.1L536.5,-16.1L537.2,-14.8L537.5,-13.5L539.1,-13.0L541.2,-12.7L541.0,-11.5L540.3,-10.6L539.6,-10.0L541.1,-10.3L545.6,-9.7L548.2,-8.5L551.3,-5.9L552.5,-4.5L552.8,-3.7L552.9,-2.8L552.9,-1.7L553.0,-0.8L553.0,2.3L552.8,3.4L552.1,4.8L553.6,6.6L555.2,8.3L557.2,11.3L557.8,12.6L558.4,14.6L559.6,15.1L559.1,16.2L559.9,18.8L561.9,20.6L564.2,21.4L565.4,21.4L566.9,20.3L568.4,20.7L571.8,22.5L573.9,24.9L577.6,25.4L579.9,25.4L583.5,26.0L585.1,24.0L587.4,22.1L587.7,20.5L587.3,19.4L585.9,17.6L585.0,15.6L583.9,15.1L583.0,14.8L580.7,16.0L579.6,16.3L578.6,16.0L577.0,14.9L573.8,12.1L572.4,11.3L571.1,9.8L570.6,8.2L571.5,7.9L572.2,6.7L571.9,3.1L573.0,2.3L577.1,2.7L582.1,5.6L583.1,5.7L585.3,4.9L586.7,5.7L591.0,5.7L595.8,6.9L597.2,6.2L597.2,4.6L598.2,2.0L599.2,1.4L600.9,1.3L599.7,-1.1L598.4,-2.6L596.9,-3.4L593.8,-6.1L592.5,-7.5L591.5,-9.1L591.2,-10.7L591.0,-11.9L593.7,-16.0L594.5,-18.1L595.0,-20.7L597.3,-22.8L599.5,-25.7L600.7,-29.0L600.8,-30.0L790.0,-30.0ZM563.8,5.5L564.7,7.3L565.0,8.7L563.5,8.0L562.4,7.7L561.8,6.7L563.1,5.4ZM466.4,210.0L465.5,211.8L463.1,215.7L464.0,216.1L465.0,216.2L466.3,216.8L467.4,216.8L469.4,216.0L469.4,212.8L469.3,210.0L470.8,209.6L471.5,210.3L472.7,210.9L474.1,211.4L476.2,212.3L478.3,212.7L481.1,212.4L483.4,212.2L484.3,213.8L485.5,214.4L486.5,215.3L485.8,219.8L485.7,221.1L485.8,222.3L486.5,223.8L487.0,224.7L480.7,225.3L475.1,225.7L469.8,225.9L464.8,226.1L459.9,226.3L456.9,226.3L454.0,226.3L455.0,224.4L456.0,222.7L456.7,220.5L456.7,219.1L456.7,217.4L458.1,216.6L461.1,216.5L462.3,215.6L463.8,213.5L465.3,211.0L465.8,209.9ZM639.2,347.5L639.7,346.5L639.4,345.2L641.2,344.9L644.4,345.9L645.7,345.9L646.8,345.3L648.6,345.6L650.3,346.9L651.1,346.5L653.1,345.9L654.8,347.0L655.4,348.8L657.5,349.3L658.6,349.5L662.8,353.1L664.7,354.3L665.9,354.7L667.2,354.4L669.2,352.3L670.1,351.8L672.5,351.6L673.0,350.5L674.0,349.6L675.4,349.1L677.2,349.0L679.2,349.1L679.0,350.9L678.6,352.4L678.7,353.8L678.8,355.5L677.0,356.8L674.8,357.4L672.7,358.6L671.7,358.2L669.8,357.6L668.4,357.7L667.3,358.4L666.5,361.0L664.4,363.1L664.0,365.0L661.5,365.4L659.4,366.3L656.8,368.7L655.3,372.6L653.3,375.3L651.4,376.6L649.4,376.9L648.0,376.6L644.8,375.2L645.0,373.9L645.2,372.7L645.1,368.4L644.6,367.2L643.5,365.3L641.1,364.2L639.5,365.0L638.5,364.8L634.4,363.0L632.6,363.2L630.7,364.3L629.1,363.3L632.2,358.9L635.3,355.2L636.9,354.4L638.9,352.5L640.8,349.9L640.0,348.5Z"],["RO","M575.2,374.6L576.9,376.2L578.8,376.9L582.9,377.1L582.8,376.2L584.4,375.8L585.9,374.9L588.1,372.9L590.3,372.1L592.5,372.6L593.8,373.4L594.7,374.2L594.7,375.4L594.9,379.4L594.7,380.6L594.4,382.0L588.3,384.9L588.1,382.8L587.6,381.9L588.1,380.9L586.5,380.9L585.7,382.4L586.5,384.3L586.0,385.5L586.2,387.6L585.9,389.0L586.9,388.6L586.7,389.9L585.2,392.7L584.8,394.2L586.1,399.8L585.9,403.3L586.1,404.3L584.0,404.8L581.2,404.7L578.8,404.3L577.2,402.8L576.1,401.7L574.3,402.6L573.3,402.0L571.8,401.9L570.1,402.2L565.7,400.7L562.2,401.3L557.7,403.3L554.4,405.2L551.2,408.3L550.0,410.4L548.4,411.7L546.0,412.8L541.6,413.3L536.8,413.0L531.7,412.7L529.2,413.6L525.5,413.7L519.9,413.2L515.8,413.4L511.8,414.6L510.9,413.5L510.9,412.6L511.4,411.8L512.3,411.2L512.7,410.0L511.5,409.2L509.2,408.3L508.2,407.6L507.8,406.8L506.3,406.0L505.6,405.3L505.0,404.3L505.0,403.3L505.6,402.3L506.4,401.8L507.4,401.8L507.6,400.9L506.5,400.2L504.5,399.4L502.6,400.2L500.9,402.5L499.6,403.0L498.6,401.7L497.0,401.0L494.7,401.0L493.3,400.6L492.8,399.8L491.7,399.3L489.6,398.8L490.5,397.9L491.5,397.6L490.8,396.6L489.5,396.1L489.7,395.2L490.1,394.2L490.7,393.3L490.3,392.4L489.1,391.9L487.1,391.5L486.0,390.6L484.4,390.2L483.2,389.6L482.2,388.5L481.2,387.9L481.0,387.0L480.6,385.5L480.7,384.4L480.5,383.3L478.9,382.4L477.8,380.8L475.9,379.7L474.8,379.1L474.0,377.8L473.1,376.8L476.4,375.5L477.8,376.0L478.9,375.2L479.4,373.8L480.4,373.4L483.0,373.5L483.9,372.7L484.4,371.3L485.5,370.1L485.2,368.8L485.6,367.2L486.3,366.2L487.8,364.6L487.5,363.7L488.6,361.3L489.3,359.7L489.2,358.2L489.9,357.4L490.6,356.3L491.3,353.2L492.2,352.0L492.5,349.4L493.7,348.0L494.5,346.9L495.1,345.6L496.3,344.7L497.1,344.2L497.9,343.9L498.8,344.0L500.1,343.1L502.0,340.7L502.6,339.8L504.3,338.8L505.1,337.3L508.6,338.6L511.2,338.1L512.2,338.3L515.9,338.6L518.1,338.9L519.3,338.6L520.4,337.9L521.7,337.6L522.8,337.7L523.9,338.6L526.4,340.3L527.2,341.0L528.2,340.7L529.3,340.2L530.3,338.6L533.6,336.5L536.2,335.7L538.8,334.6L541.7,333.6L542.4,332.2L542.7,331.2L542.8,329.6L544.4,328.8L545.9,328.2L547.5,327.7L548.4,327.6L549.9,328.2L551.0,329.0L552.6,330.7L553.7,332.2L555.0,334.1L555.4,335.1L556.0,336.2L557.0,337.5L558.6,338.8L559.7,340.0L561.3,342.2L562.5,343.0L563.6,343.9L564.2,344.9L565.0,345.7L566.7,346.7L568.1,347.6L569.7,350.8L570.7,352.2L571.4,353.3L571.6,355.7L572.1,356.6L571.9,358.6L571.6,362.5L572.0,365.6L572.5,367.1L572.7,368.2L573.6,370.1L573.9,371.2L573.1,372.0L574.4,373.6Z"],["PT","M87.6,408.5L89.2,407.8L90.7,407.4L94.5,407.4L96.0,407.5L96.2,408.8L96.5,409.9L94.9,411.1L94.8,412.8L95.8,413.6L97.4,413.3L98.5,413.1L101.5,413.9L102.4,414.7L103.6,415.5L105.0,416.0L106.9,416.0L107.9,415.7L108.4,414.7L109.7,414.9L110.5,415.4L112.7,416.1L113.9,416.2L114.7,416.9L115.9,417.1L116.3,418.6L116.0,420.1L115.5,421.6L116.2,422.5L117.5,422.9L118.5,423.6L119.1,424.6L119.2,425.9L117.8,427.0L115.9,428.0L113.3,428.6L111.2,429.7L109.5,431.3L107.9,431.7L107.0,432.4L107.2,435.0L107.0,436.9L106.6,439.2L105.5,442.1L105.0,443.3L105.1,444.7L104.2,445.3L102.8,445.8L101.7,446.3L101.1,447.4L102.2,449.4L101.6,451.5L100.0,453.7L98.8,455.0L97.5,455.2L92.9,453.9L91.7,453.9L92.2,456.5L93.1,457.8L93.1,460.5L93.9,464.7L95.5,465.7L95.9,466.8L95.4,468.0L94.4,469.3L92.9,470.4L91.3,471.0L90.1,471.7L89.7,472.9L89.0,474.3L88.2,475.3L89.8,482.0L91.7,482.3L91.2,483.5L90.2,484.8L87.7,484.8L85.7,486.1L83.8,487.9L82.6,488.6L81.0,490.9L80.8,492.1L80.6,493.9L80.2,498.6L78.9,498.4L73.1,499.9L71.6,499.4L69.2,497.3L64.4,495.3L62.9,494.4L60.6,494.6L59.1,494.1L57.5,494.7L56.7,494.2L58.5,492.1L61.6,487.9L62.5,485.0L63.6,482.7L64.0,480.1L63.7,478.3L66.1,474.6L66.6,472.5L66.5,469.6L69.3,470.9L68.7,469.6L68.0,468.7L67.1,468.6L63.5,468.5L62.2,468.4L62.5,466.5L62.6,464.2L63.7,464.0L65.0,464.2L66.2,463.7L67.2,462.9L67.4,461.0L68.8,459.6L71.3,458.8L70.2,458.7L68.7,459.2L65.8,461.8L64.6,463.2L62.9,463.2L61.3,463.0L59.9,461.9L60.2,460.7L60.6,459.8L61.8,458.1L63.0,455.5L64.6,453.3L64.8,451.7L65.9,451.0L67.0,450.7L69.1,449.1L72.6,444.8L76.5,440.3L76.2,439.0L76.9,437.7L80.2,432.0L81.0,431.4L82.2,429.8L83.2,427.0L84.1,425.0L84.4,424.0L84.6,422.8L84.4,420.2L85.1,415.1L85.6,413.5L86.5,412.9L85.4,412.4L85.2,411.2L85.7,410.0Z"],["PL","M502.6,274.7L503.3,275.9L503.7,276.8L503.7,278.4L504.4,279.1L506.4,281.4L507.6,283.7L508.3,284.5L509.7,285.6L509.4,286.6L508.6,287.3L509.5,288.4L510.3,290.2L510.5,291.8L509.7,293.2L509.4,294.1L506.5,295.1L505.9,296.1L504.5,298.1L503.5,299.2L502.1,301.3L499.8,304.7L499.0,306.1L498.4,307.3L496.6,310.5L496.1,311.8L496.3,312.7L497.3,315.0L497.6,316.0L497.6,317.0L497.4,317.9L498.3,318.9L499.4,319.7L499.1,320.9L497.8,320.7L496.3,320.2L495.0,320.3L491.6,319.3L489.4,318.6L488.6,317.0L487.6,316.3L485.4,315.8L484.5,315.4L481.1,315.4L479.6,315.6L478.6,315.9L477.1,317.4L475.6,318.0L473.8,317.2L472.5,316.9L471.5,317.2L470.2,317.1L468.8,317.7L468.1,318.3L467.3,318.7L466.7,319.6L466.2,321.3L464.5,320.7L463.2,321.3L462.9,319.9L462.6,318.1L461.2,317.8L460.3,316.9L459.6,315.9L458.8,314.7L457.7,315.0L456.8,315.8L455.2,318.2L453.0,318.4L452.8,317.4L452.6,316.5L451.3,316.4L450.9,314.6L448.2,312.1L447.8,311.0L447.7,309.9L445.1,309.2L444.2,309.2L443.4,308.6L442.2,308.2L441.6,307.5L440.8,308.1L439.6,308.7L438.6,308.1L438.0,307.2L437.2,306.5L436.2,305.8L437.4,304.8L437.5,302.9L435.6,303.6L434.5,303.8L430.8,301.7L428.8,301.1L427.6,301.0L428.1,302.4L429.1,304.0L428.0,305.1L426.6,305.9L426.1,306.7L425.1,307.0L423.2,304.4L421.6,302.7L420.1,301.8L420.2,300.7L421.5,299.9L422.2,298.5L421.5,297.7L420.6,297.1L418.1,297.6L417.1,297.5L416.1,296.8L415.2,296.2L414.2,295.7L413.2,295.6L411.1,294.8L409.9,294.5L408.9,293.2L408.7,291.8L407.2,291.2L405.7,290.9L405.6,292.5L404.6,293.7L403.6,293.7L404.8,291.0L405.3,289.4L405.9,286.5L405.1,284.3L404.9,283.2L402.5,281.7L402.6,279.8L402.0,278.5L401.3,277.2L401.1,276.1L401.9,274.7L402.1,273.8L402.4,272.4L402.7,271.5L402.0,270.3L402.2,269.2L401.2,268.0L400.5,266.5L400.6,265.2L401.2,263.4L400.0,261.3L397.1,258.8L395.7,257.1L395.8,256.1L396.4,255.2L397.5,254.4L398.3,253.0L398.8,251.3L398.8,249.7L397.5,244.8L397.3,243.5L397.2,242.0L399.6,242.7L400.6,243.2L400.3,242.0L400.3,239.9L398.1,239.3L396.6,239.0L396.6,237.6L398.4,238.1L402.0,236.3L408.0,234.0L414.5,231.8L416.0,231.6L417.5,231.1L418.1,230.3L419.4,228.3L421.3,226.2L424.7,225.3L426.0,224.2L428.6,222.7L434.6,220.8L437.1,220.3L439.6,220.1L441.9,221.2L444.3,222.6L444.8,223.5L443.5,223.0L441.6,221.8L442.7,225.9L443.7,227.3L445.5,228.3L447.0,228.6L451.5,227.6L453.1,226.6L454.0,226.3L456.9,226.3L459.9,226.3L464.8,226.1L469.8,225.9L475.1,225.7L480.7,225.3L486.7,224.8L487.5,223.9L489.2,224.2L489.9,224.9L491.4,225.5L492.7,226.1L493.7,226.7L494.8,227.6L495.2,228.7L495.4,230.1L495.6,231.2L497.6,237.2L500.4,242.9L501.5,245.6L502.1,247.1L502.6,249.3L502.9,250.8L503.0,252.9L502.5,253.7L498.8,256.3L498.1,257.0L497.1,258.7L496.2,260.5L496.0,261.5L497.9,262.7L499.4,263.2L501.1,264.2L501.9,265.2L502.0,266.5L501.7,268.2L502.1,269.4L501.7,270.3L501.4,271.3L501.6,273.0Z"],["NO","M423.7,-30.0L424.0,-27.2L423.7,-25.9L423.4,-25.0L422.4,-22.6L419.8,-24.1L418.0,-25.0L417.0,-23.6L414.3,-20.9L413.1,-15.8L412.2,-14.3L411.1,-13.6L409.9,-11.8L411.1,-9.7L411.7,-8.5L412.3,-6.7L412.2,-5.5L410.9,-3.3L408.4,0.7L406.0,4.9L405.1,6.1L405.6,9.6L404.8,10.6L403.1,11.8L402.3,12.2L401.3,12.5L398.5,13.0L399.0,16.7L399.2,18.4L399.2,19.3L398.9,20.3L398.6,22.1L398.1,28.6L397.1,31.1L395.2,35.3L393.7,38.1L391.5,42.1L393.3,43.4L394.9,44.3L395.3,45.7L395.5,48.1L395.5,49.7L394.8,51.2L394.3,52.2L391.6,52.2L388.6,51.6L386.0,52.0L384.4,52.9L383.6,53.7L382.2,55.8L380.3,59.0L379.2,60.3L379.4,62.3L377.6,66.0L378.6,69.8L379.3,71.4L378.6,72.4L378.4,74.7L378.5,76.6L378.3,77.7L378.2,79.0L379.7,84.7L379.6,86.0L378.9,90.4L378.1,95.1L379.3,96.4L381.0,97.9L381.9,98.5L383.3,100.3L384.4,102.1L384.2,103.2L383.9,104.5L383.4,105.4L383.0,106.6L382.8,107.5L380.6,107.8L379.6,108.1L379.2,110.5L380.3,114.2L381.2,116.9L381.5,118.7L381.1,120.4L380.8,121.3L380.7,122.6L380.4,125.0L379.6,126.2L378.6,127.5L377.4,128.5L376.5,128.7L375.2,129.3L374.7,130.8L374.2,132.4L372.8,134.2L373.2,137.2L373.7,139.8L373.2,142.2L372.7,144.8L372.0,146.4L371.0,147.0L369.7,144.3L369.5,143.1L367.3,142.3L366.1,141.9L364.6,141.4L363.8,139.3L363.0,137.6L363.0,133.7L362.8,132.2L362.8,130.7L362.2,131.9L362.4,133.9L361.7,134.7L360.8,135.1L360.8,136.3L361.2,137.7L360.9,139.5L358.9,143.4L358.2,144.3L357.4,143.9L356.1,145.0L355.0,145.1L354.7,143.8L353.2,142.1L353.1,143.0L353.7,144.1L352.9,145.2L349.9,146.7L350.6,147.6L349.9,148.7L348.6,149.2L345.9,151.7L341.7,156.3L339.5,157.5L338.0,158.9L336.8,158.7L335.1,159.8L331.1,160.6L328.5,159.8L326.6,160.1L325.7,159.2L325.7,158.2L324.9,157.5L324.4,158.8L322.8,158.4L323.1,157.0L324.0,156.2L323.3,155.3L322.1,155.3L321.2,155.1L318.2,152.8L317.5,151.7L315.2,149.7L314.2,147.8L313.8,145.8L314.0,144.1L314.7,141.3L317.4,141.9L319.6,143.8L320.8,142.6L322.3,141.7L319.7,142.3L319.0,141.6L318.0,140.1L318.7,138.8L319.0,137.9L318.8,137.0L319.0,135.8L320.1,134.7L321.6,133.5L322.7,132.4L323.8,131.8L322.5,131.9L321.3,132.6L319.9,133.8L318.2,134.7L316.9,135.0L315.4,135.6L314.3,137.1L313.3,137.6L311.5,137.5L311.2,136.3L312.2,132.2L313.0,130.2L313.8,128.9L314.7,128.7L315.5,127.8L316.4,128.4L318.1,129.0L319.1,127.8L320.3,127.7L322.5,126.6L321.1,126.5L319.0,126.7L318.1,125.3L318.7,124.5L320.9,122.5L321.7,121.6L322.2,120.8L322.6,118.9L324.8,117.0L326.4,116.1L326.8,117.0L326.1,119.7L326.0,120.8L327.6,117.0L328.2,116.1L328.9,115.5L330.4,115.2L329.2,114.7L324.9,115.7L323.0,116.9L322.4,117.9L321.0,119.3L320.3,120.2L319.9,121.7L319.1,122.4L318.2,122.6L316.6,124.3L315.9,125.7L314.5,126.8L313.5,127.6L312.7,128.8L312.1,127.0L312.5,125.2L313.3,123.9L313.7,122.7L313.4,121.4L314.4,120.7L315.3,121.2L316.4,121.3L318.3,120.5L317.3,119.7L315.9,119.7L314.8,118.6L314.1,116.6L314.0,114.0L318.1,111.2L319.1,110.1L317.2,111.2L315.2,111.9L314.2,110.5L313.8,109.1L313.8,106.3L314.1,104.9L314.2,103.0L315.0,102.5L315.8,103.0L318.6,103.2L323.0,102.6L325.6,103.6L326.8,103.6L328.6,102.8L330.1,102.9L331.1,103.7L331.6,104.6L331.6,105.8L332.1,106.6L332.2,105.4L332.3,104.0L336.9,102.9L335.8,101.9L335.4,100.4L336.5,98.3L335.4,99.1L334.7,100.7L334.8,102.0L333.6,102.8L331.6,102.7L330.3,102.0L329.1,101.6L329.0,100.2L328.2,100.8L327.6,102.4L326.6,102.7L324.0,101.8L320.1,101.7L318.2,102.3L317.1,102.1L315.4,100.4L314.8,99.2L314.8,96.8L315.0,95.8L316.6,95.5L318.1,95.2L316.7,94.0L316.3,92.5L315.4,91.9L315.0,90.6L315.1,88.8L315.4,87.6L317.0,87.6L320.1,87.8L322.8,89.4L324.6,90.3L328.6,90.4L331.0,89.5L328.0,89.5L325.7,89.2L321.8,87.5L320.2,86.9L318.4,86.9L317.5,86.3L317.2,85.0L317.9,82.6L318.8,82.2L319.7,83.0L320.4,82.0L321.5,80.2L323.3,79.1L325.0,78.6L325.9,79.5L327.4,80.1L330.7,79.4L331.8,78.4L329.7,78.6L328.0,79.0L326.9,79.0L327.3,77.7L328.0,77.0L328.4,75.9L329.9,75.6L331.4,75.5L332.5,75.3L334.3,75.7L337.0,76.4L338.7,77.7L340.1,77.4L339.1,76.4L339.3,75.3L341.6,74.6L344.1,74.6L338.3,74.5L336.9,73.6L335.8,73.5L332.9,74.2L333.1,72.5L334.5,70.6L335.3,69.6L338.6,68.7L340.3,67.4L341.7,67.4L342.7,67.4L344.7,67.9L345.5,69.8L346.3,70.4L348.8,72.8L346.6,69.0L345.8,68.2L345.3,66.7L345.6,65.3L346.4,64.4L349.0,64.1L349.7,62.7L348.4,62.0L347.5,60.5L349.4,58.8L350.2,58.4L351.7,58.1L354.0,59.2L353.4,60.9L354.0,61.7L355.5,59.8L357.2,59.6L358.7,59.0L359.7,60.9L360.5,61.8L360.8,63.4L361.7,62.7L362.6,62.3L363.9,62.1L365.9,62.6L366.9,62.4L367.0,61.0L367.2,59.4L369.1,58.1L370.5,57.8L371.4,57.0L372.7,56.2L372.2,54.9L371.1,54.4L372.1,53.5L373.5,52.6L372.3,51.7L370.4,52.7L369.0,53.9L370.0,55.4L369.0,56.8L364.0,60.2L361.5,61.2L360.5,61.0L360.3,59.9L359.8,59.2L359.4,57.6L358.4,57.6L358.2,55.7L359.0,54.5L360.4,53.6L361.1,52.4L361.7,50.6L363.7,48.8L366.6,44.5L368.8,43.2L369.7,41.7L371.0,41.0L372.1,39.9L374.5,38.7L375.4,37.5L373.5,38.2L372.8,37.1L373.2,35.7L374.4,34.4L379.8,30.7L380.9,32.5L382.5,32.3L384.4,30.2L385.8,27.8L384.2,29.2L382.6,30.5L381.4,30.5L381.2,29.6L380.1,29.5L379.6,27.3L380.3,25.0L380.9,23.4L381.5,22.3L383.7,19.0L384.2,17.2L385.2,16.3L386.5,16.5L386.5,15.0L385.1,14.1L389.6,12.0L391.8,12.0L392.5,11.3L393.7,10.8L394.6,9.8L391.9,10.3L390.5,10.7L389.4,11.0L387.6,11.1L387.3,7.3L387.6,5.2L388.4,3.3L389.2,2.2L390.2,1.9L391.5,0.4L392.7,0.6L394.0,0.4L392.1,-0.7L391.7,-1.7L392.9,-2.7L394.5,-4.9L395.1,-5.7L396.8,-6.5L397.8,-6.2L398.7,-6.8L400.0,-7.2L404.7,-7.4L403.9,-8.4L400.4,-8.6L398.6,-8.6L397.6,-8.6L398.2,-9.9L398.5,-10.8L399.8,-13.0L401.3,-14.4L402.5,-14.1L403.7,-12.7L405.0,-12.2L405.7,-10.3L405.8,-12.0L406.6,-13.5L405.1,-13.4L404.2,-13.9L403.4,-15.0L403.1,-16.0L403.6,-17.0L403.7,-18.1L401.9,-16.5L400.5,-16.1L400.2,-17.8L400.1,-18.9L401.8,-21.7L403.4,-21.9L404.4,-21.1L405.9,-21.7L404.0,-22.7L403.7,-23.9L404.9,-24.6L406.1,-25.8L407.5,-26.2L408.6,-27.1L409.5,-23.3L410.6,-20.6L410.5,-22.8L411.3,-24.0L410.4,-25.5L409.7,-28.1L410.9,-30.0L414.0,-30.0L415.2,-29.7L416.0,-30.0L423.7,-30.0ZM393.4,-27.6L394.9,-27.4L394.5,-26.1L393.5,-25.7L393.1,-24.8L391.9,-24.5L390.7,-23.5L390.0,-22.9L388.8,-22.5L388.6,-24.2L389.3,-25.6L390.2,-25.7L391.0,-27.3L392.1,-27.8ZM372.3,36.4L370.9,36.4L369.1,36.7L369.0,35.2L370.7,34.2L372.4,35.6ZM406.5,-30.0L404.5,-28.6L403.8,-29.8L402.7,-28.5L401.7,-28.0L400.9,-28.4L398.8,-26.3L396.8,-25.9L396.1,-27.4L397.4,-29.1L398.3,-30.0L406.5,-30.0Z"],["NL","M302.5,290.7L301.3,290.6L300.2,290.4L299.1,289.9L298.6,288.6L299.9,287.1L300.2,286.1L301.1,284.4L301.0,283.2L299.0,282.2L298.3,281.3L297.7,280.4L295.8,280.7L294.7,280.2L293.6,278.8L293.4,277.7L293.1,276.5L292.0,277.5L290.9,277.4L290.6,276.5L290.0,275.7L288.5,276.8L287.4,276.2L286.4,275.8L285.8,277.4L284.7,277.4L283.8,276.8L282.9,276.4L281.5,275.5L279.4,275.8L278.0,274.9L276.8,274.6L276.2,273.9L275.5,272.8L276.8,272.1L279.0,272.3L280.5,272.9L283.1,275.5L284.6,275.4L283.6,274.4L282.6,273.6L281.9,272.7L283.9,272.7L283.5,271.5L281.8,268.8L282.9,266.8L283.7,265.7L285.3,264.7L287.5,262.5L288.9,260.6L290.1,258.3L292.2,251.8L292.7,250.8L293.5,249.6L294.7,250.4L296.7,249.6L300.2,247.6L301.4,245.6L302.5,244.7L306.4,243.2L308.5,242.8L311.6,243.0L313.9,242.9L316.7,243.1L317.6,244.4L318.1,245.3L319.0,245.9L320.5,246.3L320.2,248.0L319.9,251.4L319.0,253.4L318.0,255.9L317.6,257.6L314.5,257.6L314.0,258.6L313.7,260.0L315.1,261.1L316.0,261.3L316.9,261.7L317.1,263.4L316.8,264.5L316.2,265.6L314.8,266.7L313.5,267.3L313.0,268.4L313.9,269.5L313.1,270.7L310.5,271.4L309.5,271.2L308.6,271.8L306.6,270.5L305.7,270.9L304.8,271.2L304.0,272.4L304.9,274.4L305.2,275.5L305.7,276.5L306.2,277.6L306.0,279.1L305.6,280.0L304.3,282.3L304.7,283.2L302.7,285.2L301.6,285.3L301.8,286.4L303.0,287.2L303.4,288.0ZM283.8,276.8L283.0,278.2L281.4,279.1L279.8,279.6L278.5,278.9L277.4,278.0L276.3,277.6L275.0,278.2L274.1,277.2L274.0,275.6L274.9,275.5L276.7,275.6L278.1,276.4L279.9,276.9L281.4,276.3L282.5,277.1Z"],["MA","M-30.0,635.4L-25.8,633.5L-17.8,631.7L-14.0,630.4L-7.4,626.2L-2.8,622.5L0.8,620.2L3.5,618.1L5.6,615.7L7.8,611.5L7.9,609.6L6.9,606.1L5.9,604.9L6.0,603.5L7.5,601.4L8.9,597.3L11.4,591.0L15.2,586.5L22.5,581.3L24.4,578.8L26.4,574.6L27.0,573.0L35.3,568.7L40.5,565.1L42.1,564.3L46.0,563.1L58.7,561.7L66.0,560.1L70.4,558.7L73.5,556.4L82.9,546.4L93.4,531.6L94.4,529.9L97.1,530.1L99.0,530.3L100.7,530.1L102.8,529.4L104.4,530.4L103.3,531.0L102.8,533.0L103.4,535.7L104.9,538.9L108.0,543.4L110.7,545.6L114.9,547.5L120.5,547.3L123.4,548.0L125.0,547.7L126.3,549.1L129.1,550.1L132.1,550.3L134.6,549.3L136.3,548.0L136.2,549.8L136.8,552.7L137.1,553.6L138.8,553.8L140.1,554.6L143.3,555.1L146.3,556.2L146.4,557.6L147.1,558.9L149.7,562.1L151.3,564.1L150.3,565.7L149.9,566.5L150.2,567.6L151.1,569.0L150.7,570.1L149.8,571.2L150.3,575.0L149.8,578.5L148.9,580.8L148.6,582.3L148.5,583.5L149.0,586.5L147.3,591.0L147.6,593.7L148.3,596.0L148.2,599.7L148.7,601.7L149.9,603.5L150.7,604.2L152.1,605.8L153.1,607.1L153.5,608.8L151.7,609.8L150.3,610.7L149.6,611.9L149.8,614.0L149.6,615.1L145.5,614.4L143.1,613.8L140.2,613.1L136.2,612.0L133.7,611.3L130.3,610.4L129.1,610.2L125.9,610.0L123.6,609.9L122.3,610.3L121.5,611.6L120.7,613.2L112.8,614.6L110.1,614.3L108.7,613.7L107.5,613.6L106.5,613.9L105.7,615.6L105.6,616.7L105.9,618.2L105.7,619.7L105.0,620.5L104.7,621.5L104.2,622.5L105.1,623.5L106.4,624.8L107.0,625.8L106.6,627.0L105.8,627.6L102.6,627.5L100.5,627.2L97.4,628.5L94.1,629.9L90.4,630.4L88.9,630.4L86.0,630.7L82.6,631.5L80.4,633.7L77.7,636.2L75.3,637.7L72.3,639.0L69.8,639.0L66.6,639.2L62.7,638.8L60.0,638.3L56.8,637.6L55.7,637.2L54.5,637.0L53.9,638.5L53.4,639.7L52.4,640.5L51.1,640.8L49.2,640.0L47.7,639.2L43.9,637.6L42.8,637.5L41.4,637.9L39.1,638.8L37.5,639.7L36.3,640.0L34.0,639.7L32.9,639.9L27.7,641.8L26.5,642.3L21.3,643.8L19.8,644.4L18.6,645.0L15.3,646.2L13.4,646.6L12.4,648.3L11.9,650.0L-30.0,650.0Z"],["ME","M463.3,424.8L463.7,426.3L464.8,426.9L466.4,428.1L468.4,430.3L469.3,431.0L471.6,432.0L472.7,432.1L473.9,432.3L477.0,434.1L478.4,434.6L479.4,435.3L479.6,436.5L477.9,437.2L476.8,438.0L475.8,438.1L476.1,439.4L476.5,440.4L476.3,441.8L474.6,442.9L473.6,443.3L472.7,443.6L471.9,442.7L471.8,441.2L471.3,440.5L470.0,442.1L469.3,443.5L468.4,445.0L467.6,446.4L466.8,448.2L466.2,449.7L466.9,450.4L467.4,451.5L467.5,452.8L467.4,454.2L467.4,455.2L465.2,453.9L464.2,451.9L460.9,448.6L457.2,446.5L457.3,445.3L456.0,445.6L454.9,444.7L454.4,444.0L454.9,442.9L455.6,442.1L455.6,441.1L454.5,439.3L454.2,438.1L453.9,435.8L454.5,435.0L456.3,434.6L456.1,432.8L456.5,431.5L457.7,429.8L458.9,428.6L460.1,428.6L460.7,429.6L461.4,428.2L460.5,426.7L459.9,425.7L460.3,424.9L461.8,425.2L462.9,424.8Z"],["MD","M546.4,327.9L548.7,325.2L550.7,325.2L553.3,324.6L554.4,323.3L555.8,322.8L556.7,322.0L558.8,322.2L560.2,322.5L561.2,323.3L562.1,323.7L563.1,323.7L563.9,324.7L564.8,324.9L566.4,324.6L567.1,325.9L568.3,325.9L568.9,326.8L569.5,325.6L572.5,325.6L574.1,327.6L574.9,328.2L576.3,327.9L577.3,327.5L578.4,328.8L579.0,330.6L579.2,332.8L579.0,334.2L578.9,335.2L579.6,336.5L582.0,337.4L582.8,338.2L583.8,338.6L584.9,338.8L585.2,340.3L585.1,341.4L586.0,342.7L586.3,343.6L586.9,344.5L588.6,345.2L590.7,345.7L591.4,346.5L591.9,347.4L592.2,349.2L592.4,350.8L595.4,352.3L594.9,353.2L592.5,354.1L590.7,353.0L589.7,353.7L588.4,354.1L587.5,353.8L586.3,354.0L585.1,353.7L584.7,355.2L583.7,353.3L581.8,353.8L580.8,354.7L580.9,356.5L581.3,357.8L582.5,359.7L582.2,360.6L582.2,362.1L581.3,363.6L580.0,364.6L580.2,366.2L579.7,367.4L578.6,368.7L577.9,370.1L578.3,370.9L578.5,372.3L576.3,373.5L575.2,374.6L574.4,373.6L573.5,372.8L573.6,371.7L573.6,370.1L573.0,368.8L572.5,367.1L572.0,365.6L571.6,362.5L571.9,358.6L572.1,356.6L571.6,355.7L571.4,353.3L570.7,352.2L569.7,350.8L568.1,347.6L566.7,346.7L565.0,345.7L564.2,344.9L563.6,343.9L562.5,343.0L561.3,342.2L559.7,340.0L558.9,339.0L557.0,337.5L556.0,336.2L555.4,335.1L555.0,334.1L553.7,332.2L552.6,330.7L551.5,329.8L549.9,328.2L548.4,327.6L547.5,327.7Z"],["MT","M402.9,569.5L401.0,570.1L399.7,569.2L399.6,567.2L401.1,567.6L402.5,568.9Z"],["MK","M497.0,445.6L499.4,445.0L500.3,444.2L501.5,443.7L502.5,443.6L503.5,443.8L504.8,443.3L506.0,442.6L507.1,443.1L509.9,445.7L511.1,446.7L512.6,447.3L514.2,447.8L516.2,451.0L516.8,452.1L517.7,452.6L517.2,455.2L517.5,459.8L516.6,460.2L515.6,460.5L515.1,463.4L513.5,464.3L512.0,464.8L510.7,464.9L508.4,464.6L507.1,465.0L505.1,465.4L504.3,465.9L502.5,469.0L500.5,470.2L498.1,470.3L496.3,471.2L493.9,471.5L491.4,472.0L490.8,471.1L489.9,470.9L488.2,471.3L486.7,468.5L485.4,467.4L484.1,464.8L483.9,463.7L483.9,462.7L483.1,460.3L484.0,459.3L483.9,458.3L483.6,456.9L484.0,453.9L485.9,453.9L486.5,452.9L486.4,450.8L486.7,449.8L490.4,447.6L491.5,447.5L492.4,448.2L493.6,448.6L494.0,447.0L494.7,446.3L497.0,445.6Z"],["LU","M302.7,302.3L302.4,303.8L302.6,304.9L303.3,306.1L303.8,306.9L304.5,307.6L305.8,308.4L306.3,309.3L305.6,310.6L304.7,312.0L304.2,313.5L304.0,314.6L303.3,314.1L302.2,313.6L300.9,314.2L299.5,314.1L298.9,313.4L298.0,313.0L298.3,311.7L299.0,310.6L298.2,308.9L297.5,307.4L297.8,306.5L297.9,305.4L298.5,304.7L299.0,303.8L299.7,302.6L301.1,301.2L302.0,301.6Z"],["LT","M487.0,224.7L486.5,223.8L485.8,222.3L485.7,221.1L485.8,219.8L486.7,215.9L485.5,214.4L484.3,213.8L483.4,212.2L481.1,212.4L479.0,212.7L476.2,212.3L474.1,211.4L472.7,210.9L471.5,210.3L470.8,209.6L469.9,209.9L468.8,208.6L469.0,206.5L468.0,203.7L466.5,200.2L466.1,196.4L468.4,193.2L471.6,190.5L475.3,188.5L478.6,188.3L480.8,188.4L482.7,188.1L483.7,187.7L484.7,187.8L485.5,188.8L487.0,187.8L491.2,187.9L492.2,187.7L493.2,187.7L495.3,188.0L496.5,188.4L498.9,187.7L500.0,187.6L502.0,185.5L503.3,184.7L504.6,186.1L506.2,188.2L507.6,188.4L511.6,188.6L512.4,189.0L514.9,190.6L516.3,191.4L517.3,192.0L518.8,193.3L519.7,194.3L521.0,195.0L522.6,195.3L523.2,196.1L523.2,197.5L523.0,199.3L522.7,200.8L523.2,201.7L525.1,201.6L526.2,202.0L525.3,203.1L524.8,204.9L521.6,205.3L521.2,206.3L520.9,207.9L520.1,208.8L518.8,209.3L517.8,210.0L517.3,211.7L517.0,213.8L517.3,215.3L517.5,216.6L516.7,218.6L516.4,220.2L516.5,221.4L518.0,221.5L518.9,222.7L518.9,223.9L517.1,224.5L516.2,224.0L516.0,222.3L514.7,222.8L513.8,222.9L512.8,223.8L512.2,224.9L509.7,225.5L509.2,228.3L507.5,228.9L506.1,229.9L504.5,230.9L503.6,230.5L502.1,230.3L501.1,230.7L499.7,230.8L498.3,231.4L496.4,231.5L495.4,230.9L495.2,228.7L494.8,227.6L493.7,226.7L492.7,226.1L491.4,225.5L490.5,225.3L489.7,224.5L488.3,223.9Z"],["LY","M331.4,650.0L332.2,648.9L333.6,647.1L336.9,646.3L338.1,645.0L339.0,643.5L340.5,641.8L342.0,641.0L342.9,639.9L345.9,638.3L348.6,636.8L351.7,635.2L354.1,634.0L354.7,632.9L354.7,631.9L353.5,629.6L353.5,627.0L353.7,624.8L353.9,623.5L354.6,619.9L357.0,620.6L359.5,621.2L366.8,625.9L369.1,626.5L374.4,627.1L380.5,625.4L382.9,625.1L386.9,626.8L388.7,627.3L391.7,627.5L396.8,629.0L398.1,629.6L401.1,632.0L402.6,632.8L413.3,635.0L414.8,636.4L416.3,639.3L416.4,642.9L417.3,645.5L418.7,648.9L419.5,650.0L331.4,650.0ZM492.9,650.0L491.6,647.1L490.6,642.2L491.1,638.7L491.8,636.5L493.1,634.3L496.8,629.9L500.5,626.7L507.2,622.3L511.3,621.9L513.0,621.3L516.1,618.4L517.4,618.1L519.4,618.6L524.9,617.8L527.4,618.2L530.5,619.5L534.3,620.1L537.0,620.8L539.9,621.7L540.9,624.9L540.7,625.9L540.8,627.1L544.0,629.0L552.3,629.0L554.0,629.4L556.5,630.8L558.0,631.1L563.7,630.5L566.9,629.7L570.1,629.8L571.4,630.2L572.8,631.4L574.7,634.4L575.5,635.4L574.2,637.3L573.8,638.4L572.5,640.3L571.6,642.2L572.1,644.8L572.7,647.3L574.0,649.8L492.9,650.0Z"],["LB","M730.7,541.9L733.3,541.1L734.9,540.5L735.2,539.5L736.6,539.5L737.6,540.1L737.2,541.1L736.5,542.4L738.7,542.6L739.6,543.0L742.0,546.4L741.8,548.2L741.1,550.0L739.8,551.3L739.3,552.5L739.4,553.8L740.8,554.1L739.7,554.8L738.4,555.1L736.9,555.8L736.0,557.0L735.6,558.1L735.5,559.4L736.2,560.1L737.2,560.3L736.7,561.7L736.2,562.6L735.8,564.1L734.9,565.6L734.3,566.5L733.0,568.0L731.6,568.9L731.8,571.5L730.8,572.7L729.2,573.0L727.8,573.2L726.1,573.9L726.4,572.3L726.6,570.3L726.6,567.6L727.3,565.2L727.9,557.6L728.5,554.4L727.9,550.3L729.2,546.1L730.6,544.6L731.2,543.4Z"],["LV","M523.1,195.3L521.0,195.0L519.7,194.3L518.8,193.3L517.3,192.0L516.3,191.4L514.9,190.6L512.4,189.0L511.6,188.6L507.6,188.4L506.2,188.2L504.6,186.1L504.0,184.9L502.7,185.1L500.5,187.3L498.9,187.7L496.5,188.4L495.3,188.0L493.2,187.7L492.2,187.7L491.2,187.9L487.0,187.8L486.3,188.5L484.7,187.8L483.7,187.7L482.7,188.1L480.8,188.4L478.6,188.3L475.7,188.4L472.3,190.2L468.4,193.2L465.9,195.6L465.3,192.2L464.8,185.3L464.8,181.9L466.5,179.7L467.3,178.1L467.6,176.0L467.6,174.0L467.8,172.4L469.9,167.6L472.0,166.9L474.6,165.4L477.7,164.0L478.4,165.2L478.8,166.2L483.1,169.4L484.2,170.5L486.2,174.6L490.1,176.3L492.8,175.2L493.8,174.0L495.8,171.8L496.6,170.2L496.6,168.9L495.4,163.1L494.4,160.7L494.4,159.1L495.6,158.2L498.5,156.4L499.7,155.8L501.5,154.5L502.8,155.5L503.1,154.5L506.2,156.0L507.1,156.3L508.6,157.0L510.5,157.2L511.1,158.1L513.2,160.0L514.2,161.0L516.0,161.8L519.3,160.4L520.6,159.7L523.0,160.6L524.4,160.6L525.8,160.4L526.8,162.0L528.3,162.8L529.6,163.5L530.3,164.7L530.4,165.6L529.9,166.8L529.8,168.4L530.0,169.7L529.7,172.3L531.3,171.6L532.1,172.2L532.5,173.7L533.8,175.2L535.3,176.8L536.5,179.5L537.0,180.7L537.3,181.7L537.2,183.0L537.1,183.9L536.0,184.3L534.9,185.6L533.3,188.4L532.7,190.9L531.4,191.3L529.9,191.5L527.2,191.5L526.3,192.0L525.3,194.1L523.3,195.0Z"],["XK","M479.6,436.5L481.2,435.8L481.0,434.6L483.0,432.4L483.4,431.2L482.6,429.8L483.7,428.8L484.5,428.1L485.4,428.9L486.4,429.9L487.5,430.5L488.7,430.8L489.7,431.6L491.2,433.1L492.6,434.4L493.8,435.1L493.8,436.6L497.6,437.5L498.8,437.6L498.6,439.0L497.5,442.3L496.4,443.7L496.7,445.0L494.7,446.3L494.0,447.0L493.7,448.1L492.4,448.2L491.5,447.5L490.4,447.6L486.7,449.8L486.4,450.8L486.5,452.9L485.9,453.9L484.3,453.8L484.3,452.9L484.0,451.2L483.1,448.3L482.5,447.4L481.4,446.6L480.5,446.0L479.0,445.6L478.1,444.1L476.8,442.3L476.5,440.4L476.1,439.4L475.5,438.6L476.8,438.0L477.9,437.2Z"],["JO","M790.0,575.5L788.8,576.4L783.4,580.3L779.7,582.9L775.0,586.2L771.1,588.9L767.2,591.6L763.6,594.1L766.7,595.8L771.4,598.5L774.6,600.3L778.5,602.6L781.9,604.7L785.6,606.9L784.1,608.6L781.6,611.3L781.3,612.2L781.0,615.7L780.8,618.4L776.6,621.2L772.5,623.5L770.0,624.9L769.4,625.8L768.5,629.5L767.7,633.2L765.4,636.8L762.8,640.7L762.0,641.2L759.4,641.5L754.8,642.1L750.5,642.6L747.5,642.9L743.8,643.3L743.6,640.8L743.1,639.5L742.7,634.9L742.5,632.7L742.3,631.2L742.6,627.8L742.2,626.8L741.4,623.3L741.0,620.6L741.2,617.5L741.5,614.8L741.5,613.7L741.8,611.1L741.9,608.1L741.0,606.7L740.6,604.6L740.1,601.7L739.9,600.1L739.8,597.9L740.2,595.9L738.6,592.0L738.0,589.8L737.8,587.2L736.6,584.4L735.7,580.2L735.8,579.2L737.6,577.5L740.2,577.0L741.4,577.6L743.7,579.5L746.4,579.4L747.6,579.8L749.3,580.7L751.1,580.6L756.6,579.8L759.9,575.7L762.6,572.3L765.7,568.4L767.8,565.8L771.4,561.3L773.7,558.4L776.8,554.5L779.8,550.8L782.3,554.3L784.7,557.9L787.2,561.5L789.7,565.0L788.7,565.8L790.0,567.6L790.0,575.5Z"],["IT","M305.9,379.3L307.2,380.3L309.7,379.9L311.4,379.5L312.5,379.0L315.6,380.3L316.4,379.9L318.3,378.8L320.2,376.3L319.8,374.5L321.8,373.1L322.7,372.0L323.7,371.4L324.5,372.2L324.3,374.4L325.7,376.7L326.6,377.7L328.8,378.5L328.2,379.9L329.5,381.4L329.6,382.4L331.1,382.8L331.2,381.3L331.0,380.3L331.4,379.1L332.0,378.2L333.8,376.2L334.5,375.0L334.8,373.1L334.9,371.6L336.6,371.6L337.1,372.5L337.5,374.1L338.0,374.9L339.4,375.1L341.3,374.3L342.6,374.0L343.6,374.8L344.4,376.5L345.5,376.5L345.6,375.6L345.4,374.3L345.1,373.2L344.6,372.0L345.0,370.9L345.3,369.9L346.7,369.6L347.6,370.7L348.7,371.1L349.8,370.5L349.3,368.9L349.4,367.7L350.1,365.3L351.7,365.6L353.1,365.8L353.9,366.8L354.8,367.2L356.0,367.3L357.2,366.9L357.7,365.8L358.7,364.4L360.1,363.8L362.4,363.7L363.6,363.5L364.8,363.5L365.7,363.8L366.7,363.8L369.1,362.9L371.6,362.2L371.5,363.2L371.1,363.9L371.4,364.8L372.7,366.7L373.5,368.1L374.2,369.1L375.3,369.7L376.8,370.1L378.0,370.2L379.4,370.6L383.9,371.7L386.2,372.0L387.9,372.0L390.6,372.7L390.3,373.7L388.8,374.6L387.8,375.4L386.8,376.4L386.5,377.4L387.0,378.3L388.6,378.6L389.7,378.9L388.6,380.5L387.8,381.4L387.8,382.4L389.3,382.5L388.8,385.2L390.0,386.0L390.8,386.5L392.2,388.0L392.7,389.2L391.5,389.8L389.6,386.3L387.5,387.4L384.2,386.3L383.1,387.6L381.9,388.7L380.3,389.2L378.5,390.4L376.6,391.2L375.1,391.8L375.6,390.3L373.2,391.2L372.2,392.0L371.9,393.4L371.5,395.7L372.3,396.4L373.6,399.5L375.2,400.8L374.9,402.1L374.4,403.1L373.4,403.9L372.5,403.2L371.6,405.2L372.2,410.6L373.3,414.4L374.4,416.1L377.1,418.7L379.9,420.1L385.0,424.4L387.8,425.8L388.5,426.6L390.2,429.9L391.7,433.7L393.3,439.8L394.5,442.7L396.8,446.1L401.7,450.9L406.1,454.4L410.3,456.5L413.5,456.8L421.2,456.2L422.5,456.3L424.0,456.9L424.3,458.4L423.8,459.4L422.3,460.5L420.7,462.1L420.5,464.1L422.1,465.4L429.7,468.9L437.4,471.8L439.9,473.3L442.8,475.6L449.7,478.7L450.9,480.3L455.2,483.7L457.2,486.3L457.7,488.4L457.0,490.7L456.6,492.2L456.0,493.8L454.2,493.3L452.1,491.9L448.8,485.7L443.3,485.3L442.1,484.9L440.1,483.9L439.5,482.3L436.9,481.9L435.5,483.0L433.9,485.5L432.0,489.1L430.2,494.3L430.2,496.4L431.4,498.3L434.6,499.3L437.2,501.0L438.9,502.8L439.2,507.3L440.1,509.9L439.1,511.4L436.9,511.1L434.1,512.1L432.2,513.9L431.4,515.5L431.8,519.6L431.4,521.2L427.7,524.3L425.7,527.4L425.3,528.6L424.5,530.1L419.6,530.3L418.5,528.5L418.4,525.9L419.2,524.3L420.9,523.5L422.0,520.1L421.6,517.7L422.3,516.6L422.9,515.8L424.2,515.3L426.1,514.8L426.2,511.4L424.7,510.0L424.1,507.8L423.3,503.9L420.8,498.9L419.4,494.4L418.3,492.2L416.8,491.1L414.0,491.2L412.6,490.8L407.7,487.8L407.4,486.5L408.2,485.2L407.6,483.5L407.0,481.9L406.1,480.6L405.0,479.9L402.9,480.4L400.8,480.6L399.7,481.2L400.8,478.8L398.6,477.3L396.4,477.1L395.4,477.6L395.0,476.2L392.4,471.4L390.6,469.5L389.7,469.1L388.1,469.5L385.5,468.7L383.9,468.5L383.0,468.7L381.7,469.3L380.8,468.2L378.4,466.2L375.4,465.0L369.7,458.6L368.0,456.2L364.4,453.5L362.2,449.6L360.4,448.2L357.7,447.0L356.2,447.5L355.0,447.0L356.2,446.3L356.0,444.8L353.0,441.0L351.3,439.7L350.8,438.9L350.5,437.9L349.3,436.8L347.5,436.5L347.7,434.7L347.9,433.4L347.8,432.2L347.0,429.1L345.4,426.4L344.8,420.2L344.1,418.4L342.3,417.0L338.2,415.2L332.7,410.9L331.5,410.8L328.1,409.0L326.0,408.6L323.1,409.7L319.4,413.3L316.3,417.1L315.3,417.7L311.6,418.8L308.4,419.2L308.4,418.2L309.0,416.6L309.9,415.7L310.9,414.5L311.3,413.6L310.9,412.1L307.3,412.5L304.6,410.8L302.3,409.2L301.6,408.1L301.3,407.0L301.5,405.7L301.1,404.8L301.6,403.9L302.5,402.7L302.9,401.9L303.9,401.3L303.6,399.3L302.3,398.5L301.2,398.0L300.5,397.2L300.4,396.3L300.1,395.3L299.4,394.4L299.4,393.5L300.3,393.1L301.4,393.2L304.1,392.2L305.4,391.9L306.1,389.9L306.7,389.0L305.1,387.0L304.5,385.5L303.7,383.8L302.8,383.0L302.7,381.7L304.8,380.3ZM345.8,438.5L346.3,439.6L346.0,441.1L344.9,440.2L343.2,440.6L342.2,440.4L342.2,439.2L343.8,439.1L345.3,439.1ZM417.4,525.1L416.4,527.2L415.9,528.0L412.5,533.3L412.1,534.5L411.9,535.8L411.5,536.9L411.0,538.0L410.6,539.4L410.7,540.9L411.3,542.2L412.6,543.4L411.8,544.0L412.7,545.3L413.5,546.1L413.6,547.7L412.0,549.2L411.4,550.0L411.0,551.0L410.9,552.0L411.1,552.9L411.0,553.8L409.4,553.7L407.7,553.2L406.0,553.4L403.5,552.4L402.6,552.2L401.8,551.8L399.8,548.6L398.2,547.2L396.4,546.1L394.7,546.1L392.9,546.2L391.3,545.5L388.2,543.3L384.8,541.5L383.4,540.4L382.8,539.6L382.0,539.1L380.1,538.5L378.4,537.3L375.9,537.3L374.2,536.8L372.6,535.4L371.5,533.4L371.3,532.5L372.1,530.3L373.0,528.2L373.8,527.6L374.7,527.2L375.8,525.9L377.5,528.1L378.2,528.7L380.4,527.8L382.0,525.8L383.9,525.8L384.8,526.0L385.3,527.0L386.9,527.5L389.6,529.4L391.2,529.8L393.4,529.0L395.0,528.7L398.5,529.1L400.4,528.6L401.7,528.6L403.6,527.8L405.1,526.6L406.7,526.2L408.7,526.2L410.7,526.5L412.2,525.3L413.9,525.2L416.2,523.8L417.2,523.7L418.2,524.2ZM333.4,474.2L334.0,475.4L335.3,480.3L335.4,481.4L335.1,482.4L332.9,485.5L333.0,487.5L333.5,488.8L333.5,490.2L333.1,491.9L331.5,502.4L330.9,504.2L330.5,505.8L329.4,506.2L328.0,505.6L326.3,504.6L324.6,504.9L323.4,504.0L322.6,507.6L321.7,509.0L320.4,509.9L319.3,509.9L318.1,509.5L317.1,509.4L316.4,508.6L315.9,507.4L315.0,505.8L314.2,504.0L314.2,502.4L314.3,498.8L315.1,497.4L315.4,495.8L315.4,494.5L316.6,494.4L316.9,492.4L316.2,491.3L315.0,490.8L315.0,489.7L315.2,488.6L315.9,487.9L316.2,486.9L316.4,484.0L315.7,482.8L315.5,481.1L315.1,480.0L314.4,478.9L313.5,477.9L313.0,477.0L313.1,474.8L313.5,473.0L315.0,473.4L317.2,474.0L318.6,473.8L320.5,473.1L322.2,472.2L324.9,469.4L326.4,468.9L327.3,468.2L327.6,467.2L328.9,468.0L329.9,468.2L331.3,469.1L331.8,470.0L332.3,471.0L333.3,471.7L332.4,473.2Z"],["IL","M735.4,564.5L735.3,565.6L735.3,567.0L736.1,568.4L736.7,569.1L736.9,570.2L738.1,572.1L738.8,572.8L738.4,574.3L738.6,575.4L738.4,577.1L736.0,578.9L735.6,579.8L736.6,584.4L735.6,584.6L734.0,584.1L733.1,583.2L732.2,583.4L730.4,583.5L728.8,585.5L728.6,588.0L728.7,589.1L728.7,591.5L729.3,592.7L730.0,594.5L730.6,595.8L730.6,596.8L731.0,597.6L732.0,596.9L733.2,597.0L734.6,597.4L734.1,598.4L732.6,600.0L731.6,601.7L731.7,603.0L731.5,605.9L732.3,606.5L735.3,605.4L737.7,603.5L739.5,601.8L740.6,604.6L740.7,606.5L741.9,608.1L741.8,611.1L741.5,613.7L741.5,614.8L741.2,617.5L741.0,620.6L741.1,622.6L742.2,626.8L742.6,627.8L742.3,631.2L742.5,632.7L742.7,634.9L743.1,639.5L742.4,641.3L741.4,639.8L738.8,635.6L736.9,632.7L734.6,629.1L731.2,625.0L730.7,623.9L729.7,622.4L727.1,618.5L725.1,615.8L722.6,612.2L723.8,610.2L723.5,608.9L725.4,605.1L724.3,604.2L725.8,597.6L726.2,591.5L725.7,583.3L725.9,579.0L726.2,576.2L726.1,573.9L727.8,573.2L729.2,573.0L730.8,572.7L731.8,571.5L731.6,568.9L732.8,568.8L734.3,566.5L734.9,565.6Z"],["PS","M724.3,604.2L725.3,604.8L723.5,608.9L723.8,610.2L722.6,612.2L721.7,610.8L723.4,606.5ZM736.6,584.4L737.8,587.2L738.0,589.8L738.6,592.0L740.2,595.9L739.8,597.9L739.9,600.1L740.1,601.7L737.7,603.5L735.3,605.4L732.3,606.5L731.5,605.9L731.7,603.0L731.6,601.7L732.6,600.0L734.1,598.4L734.6,597.4L733.2,597.0L732.0,596.9L731.0,597.6L730.6,596.8L730.6,595.8L730.0,594.5L729.3,592.7L728.7,591.5L728.7,589.1L728.6,588.0L728.8,585.5L730.4,583.5L732.2,583.4L733.1,583.2L734.0,584.1L735.6,584.6Z"],["IE","M176.3,185.1L174.4,185.8L173.1,187.7L172.1,188.9L171.3,189.8L169.7,190.0L168.6,189.9L167.3,189.9L167.9,191.2L168.3,192.2L165.0,192.7L164.0,193.1L163.7,194.2L165.1,196.8L165.3,198.4L166.9,199.5L167.4,200.5L169.4,201.2L170.3,201.5L172.0,200.5L172.5,199.5L173.4,198.2L174.5,197.5L175.5,198.5L175.8,199.4L175.7,200.6L176.0,201.7L177.2,202.6L176.8,204.3L177.8,205.2L178.9,205.4L180.5,205.2L181.4,205.6L181.6,207.0L180.0,206.7L179.3,207.8L179.3,208.9L179.6,209.8L179.5,211.6L179.4,213.5L179.6,214.7L179.3,216.2L178.8,218.1L178.3,219.6L178.3,222.1L178.2,223.5L177.6,226.5L176.9,227.4L175.9,228.3L175.2,229.4L174.5,230.6L173.7,232.6L171.7,234.7L170.1,235.3L171.1,237.5L169.7,237.9L168.3,237.8L167.0,236.9L166.0,236.7L165.0,237.0L164.3,235.4L163.4,236.8L162.5,237.0L161.1,236.5L158.5,236.1L157.5,236.3L156.4,237.5L155.4,237.9L153.4,237.9L151.7,238.9L150.4,239.3L149.4,239.2L148.8,238.3L148.2,237.4L146.9,237.0L147.4,237.9L147.2,238.9L146.8,239.8L145.2,239.9L143.7,240.5L142.1,240.3L140.9,240.9L135.3,240.7L134.4,240.0L132.8,239.5L130.4,239.6L129.4,239.1L131.4,237.4L133.6,237.0L129.7,236.0L128.3,236.2L127.0,236.0L127.9,235.2L129.9,234.5L130.9,234.1L132.3,233.5L134.2,233.2L128.4,233.2L127.1,232.5L125.8,231.8L125.9,230.4L128.0,229.2L129.2,228.7L130.4,228.6L131.7,228.4L131.9,227.4L128.7,226.5L127.3,225.8L128.1,224.7L130.0,224.1L131.6,224.6L132.7,225.7L134.5,226.1L134.0,225.1L134.4,223.6L134.9,222.5L135.9,222.4L137.7,221.5L141.0,221.9L144.1,222.2L147.3,222.1L146.0,221.0L145.6,220.1L144.0,221.2L143.0,221.5L140.6,221.1L139.0,219.9L136.5,220.4L134.8,220.1L137.1,219.3L140.3,217.8L141.0,217.3L142.2,216.3L141.8,215.1L144.3,213.1L146.2,213.1L147.1,212.9L148.7,212.5L147.8,211.6L146.8,211.0L143.3,210.1L142.5,209.6L142.5,208.2L141.5,207.6L140.1,207.5L140.9,206.3L139.9,205.7L138.8,205.5L137.9,204.9L138.7,203.9L138.5,202.5L139.7,202.7L141.2,202.6L142.9,202.9L141.6,202.0L141.4,200.7L143.6,199.8L145.5,199.9L145.9,198.6L144.2,197.9L142.4,197.8L143.0,196.6L143.8,195.6L144.3,194.0L143.4,194.1L143.7,192.9L143.6,192.0L142.3,192.1L142.7,191.1L144.0,190.4L145.6,191.1L146.9,190.9L148.5,191.3L150.9,192.3L152.2,194.4L153.7,193.5L156.5,194.8L157.9,195.8L158.5,194.7L158.2,193.7L159.2,193.0L160.3,192.6L162.4,192.4L163.8,191.0L164.7,190.2L161.3,189.7L158.6,187.5L159.4,186.8L161.5,186.4L162.4,185.8L163.7,185.1L163.7,183.7L164.2,182.8L165.1,182.4L165.6,181.5L167.5,181.1L169.0,180.9L171.1,181.5L171.7,180.8L172.7,180.9L172.9,182.1L173.1,183.6L172.0,184.5L171.3,185.9L173.5,185.1L173.8,183.3L173.7,182.4L174.1,181.5L176.6,181.3L176.2,180.0L177.4,180.5L178.0,181.6L178.8,182.5L179.6,183.3L178.4,184.1L177.0,184.5Z"],["IS","M177.4,-30.0L177.8,-29.0L178.5,-28.3L179.4,-28.3L179.7,-27.4L179.5,-26.3L178.9,-25.2L178.0,-24.3L177.0,-23.7L180.0,-22.6L180.1,-21.5L180.1,-20.4L178.2,-19.0L179.8,-19.4L180.8,-19.3L182.3,-18.1L182.8,-17.3L182.8,-16.3L183.8,-16.2L183.8,-15.0L183.2,-14.3L182.4,-13.4L181.5,-13.2L181.6,-11.8L182.0,-11.0L181.2,-10.5L181.6,-8.8L181.2,-7.5L180.2,-6.8L179.3,-7.2L178.5,-6.3L177.7,-4.7L176.4,-3.7L175.4,-3.2L173.4,-3.7L172.5,-3.1L171.6,-2.6L171.5,-1.6L170.5,-0.2L169.6,0.4L167.3,0.8L165.9,1.4L163.2,0.8L161.2,0.7L158.0,1.0L155.9,1.4L154.0,2.1L151.3,3.4L149.7,3.7L147.3,3.1L145.8,3.1L141.3,2.4L139.7,2.3L138.3,3.2L138.2,4.1L137.3,4.8L136.0,5.0L135.2,4.0L134.7,4.9L130.9,4.5L126.7,1.8L125.3,0.3L123.6,-1.8L122.4,-2.7L120.6,-3.6L119.8,-5.8L119.5,-6.9L120.2,-7.9L121.2,-7.7L120.7,-8.6L119.2,-8.1L118.5,-9.1L117.7,-10.3L117.1,-11.4L116.5,-12.7L117.2,-13.3L116.1,-13.9L114.6,-13.4L107.2,-16.7L105.4,-17.5L105.1,-18.4L105.6,-20.0L106.1,-21.0L106.9,-21.9L107.3,-21.0L107.5,-19.7L110.2,-19.2L111.5,-19.2L113.1,-20.1L114.3,-20.6L115.4,-21.6L116.7,-22.3L118.4,-22.1L117.3,-23.1L114.4,-22.8L115.4,-23.9L115.2,-25.3L116.1,-26.1L118.6,-26.6L119.7,-26.6L116.7,-26.8L115.2,-27.0L114.5,-28.2L114.4,-29.4L115.1,-30.0L177.4,-30.0Z"],["HU","M492.3,332.9L493.4,332.7L494.0,333.6L494.8,334.8L496.1,335.5L497.4,336.0L498.3,337.2L499.5,337.6L500.6,337.4L501.5,338.2L501.8,339.3L502.2,340.2L500.1,343.1L499.4,343.8L497.9,343.9L497.1,344.2L496.3,344.7L495.1,345.6L494.5,346.9L493.7,348.0L492.9,348.8L492.7,351.4L491.6,352.7L490.6,356.3L489.9,357.4L489.2,358.2L489.3,359.7L488.6,361.3L487.6,363.0L487.8,364.6L486.9,365.7L485.8,366.5L485.2,368.8L485.5,370.1L484.6,370.6L484.3,372.2L483.0,373.5L480.4,373.4L479.4,373.8L479.2,374.7L478.4,375.7L476.4,375.5L473.6,376.4L472.7,376.6L469.2,376.2L468.1,376.6L466.6,376.6L465.1,376.4L464.1,376.7L463.3,378.0L462.5,378.8L461.1,379.7L460.3,380.1L458.7,379.6L457.9,380.7L456.8,381.3L455.6,381.8L454.2,382.1L452.3,383.8L450.8,384.7L449.8,385.0L448.6,384.9L444.7,385.0L442.7,384.7L441.4,384.1L440.5,383.4L440.1,382.6L439.1,382.2L437.5,382.1L436.3,381.3L435.3,379.9L434.1,378.8L432.6,378.0L431.4,376.8L430.4,375.3L428.8,373.9L426.6,372.8L425.7,372.1L424.6,370.6L424.1,369.3L423.5,368.6L423.2,367.5L422.8,366.1L420.4,366.1L422.3,364.0L423.3,363.4L424.4,363.5L425.0,362.4L425.2,361.2L424.2,359.4L424.7,358.5L424.3,356.8L425.3,356.1L426.6,355.2L427.2,353.6L426.7,352.3L424.1,351.5L425.2,350.2L426.0,349.7L428.0,350.8L428.9,350.6L430.7,350.6L431.9,350.3L431.6,349.3L431.3,347.9L431.8,346.8L431.9,345.6L432.6,344.8L434.2,344.8L436.8,346.8L438.7,348.1L440.3,348.7L442.6,348.7L445.0,348.6L449.0,348.1L452.0,347.8L452.6,346.5L452.2,345.0L452.6,343.8L454.0,342.8L458.3,342.1L460.7,341.3L461.0,340.3L461.7,339.3L463.5,339.4L464.8,340.1L465.9,340.5L468.5,338.6L470.9,337.1L472.2,333.3L474.2,332.1L476.9,332.0L478.3,332.3L479.3,332.4L480.9,332.2L483.0,331.2L484.6,331.6L485.8,332.6L486.5,333.6L487.5,334.5L492.1,333.2Z"],["EL","M490.6,518.0L491.0,520.1L492.0,520.4L493.6,522.2L493.5,523.2L490.9,522.8L489.8,523.2L489.3,522.2L488.8,521.2L487.7,521.8L487.7,519.1L488.8,519.3L489.6,517.8L489.6,516.7ZM495.6,528.3L497.3,530.0L496.0,529.6L494.8,531.0L493.0,529.7L491.9,528.3L492.5,526.3L493.6,527.6L494.8,527.7ZM491.3,513.7L490.2,513.8L489.4,514.3L489.3,512.9L489.7,511.0L490.2,509.9L491.0,509.3L491.4,510.1L491.6,513.1ZM481.2,499.2L481.6,500.2L479.8,499.7L478.4,498.9L477.2,496.7L474.7,494.3L475.4,492.9L477.2,492.3L478.5,493.1L477.8,494.7L478.5,496.0L479.0,498.0L480.5,499.1ZM529.8,502.9L530.9,504.8L531.8,505.4L533.5,506.0L537.1,507.0L540.4,506.9L541.4,508.3L542.1,509.1L542.2,510.5L543.0,512.8L544.1,514.8L545.4,515.7L547.0,515.8L548.4,515.6L549.0,517.9L548.5,518.7L547.5,518.8L546.6,518.3L545.1,517.7L543.4,516.9L542.8,515.3L542.1,514.7L541.3,513.4L540.3,512.5L538.0,512.3L536.1,512.5L534.5,512.0L533.7,510.0L532.7,509.6L532.0,509.1L531.3,508.4L529.6,507.1L527.9,506.1L526.2,505.5L524.5,505.2L523.2,506.0L522.2,505.5L523.8,504.5L525.9,502.6L527.4,501.8ZM544.8,469.9L543.1,470.8L541.1,469.8L541.8,467.5L543.6,466.9L544.5,467.8L544.6,469.1ZM531.0,554.8L529.3,555.3L528.8,554.5L528.5,552.7L528.8,551.7L529.9,552.3L531.5,553.7ZM595.1,558.8L594.7,559.9L594.0,559.2L594.1,558.1L593.1,556.6L593.9,554.0L593.8,552.9L594.6,552.1L594.8,554.1L594.3,555.8L595.3,557.0L595.9,558.4ZM587.6,536.1L588.8,533.7L590.9,532.2L593.0,532.4L590.9,533.9L588.6,535.1ZM566.1,535.2L564.9,536.1L563.8,535.2L563.1,533.7L565.1,531.0L566.2,531.6L566.4,533.7ZM582.2,516.5L584.1,516.8L585.4,516.7L585.9,517.8L584.8,518.1L583.0,519.5L581.0,518.7L579.4,518.9L579.6,517.5L581.0,516.7ZM555.7,521.8L555.5,523.1L554.1,521.8L552.7,521.0L552.1,520.2L551.3,519.8L550.9,518.7L551.8,518.1L553.3,519.3L554.8,519.2L555.4,521.1ZM570.3,510.8L569.1,512.1L567.4,510.9L568.0,509.6L568.5,508.6L567.8,507.5L566.0,506.1L565.7,504.9L568.0,504.0L569.6,504.8L570.2,505.8L571.0,509.1L570.4,510.5ZM571.4,489.7L571.4,490.8L573.6,492.3L574.5,493.3L574.9,494.4L574.0,494.3L574.4,495.5L573.4,496.1L572.3,496.3L568.8,495.9L567.9,495.0L569.6,493.1L568.5,492.7L567.4,494.8L564.9,494.4L564.0,493.8L564.5,491.7L566.1,491.4L567.0,490.9L568.0,490.3L570.4,488.9ZM555.8,480.0L555.1,481.8L555.2,483.4L553.8,483.3L553.4,482.1L552.9,483.0L551.9,483.6L550.9,483.2L550.8,482.2L550.4,481.0L552.9,480.0L553.7,480.8L554.5,480.2L555.8,479.0ZM603.5,548.4L602.5,549.0L601.5,548.2L601.8,546.0L600.9,544.8L601.5,543.3L601.9,542.0L603.1,540.5L606.7,538.3L607.5,538.0L607.7,539.1L607.0,542.3L606.2,544.0L606.7,545.1L604.9,545.8ZM544.6,565.4L545.7,565.4L547.1,565.2L548.2,563.9L549.2,563.7L549.9,564.7L548.8,565.3L549.8,566.2L550.9,565.8L551.4,567.3L552.7,567.7L554.1,567.3L555.4,566.9L556.7,566.1L558.1,565.6L562.4,565.3L564.1,566.2L567.1,565.9L569.9,566.1L571.3,565.5L573.6,564.7L574.2,567.8L575.2,568.8L576.6,567.5L578.6,566.4L580.7,566.1L582.2,564.0L582.6,566.8L582.4,568.1L582.4,569.1L581.3,569.8L579.5,570.1L576.1,570.5L572.8,571.3L566.8,573.2L560.7,574.6L559.6,573.2L558.9,571.9L556.9,571.7L554.9,571.1L547.6,571.0L545.9,570.8L543.1,571.4L542.1,571.5L540.8,570.5L540.3,568.3L540.4,566.0L542.0,566.2L542.5,565.4L542.4,564.4L542.6,563.4L543.7,565.2ZM562.8,446.5L564.1,446.6L564.9,447.1L566.2,447.9L567.4,449.5L567.9,451.5L567.8,452.4L566.9,452.7L564.4,455.1L564.6,456.9L565.0,458.3L565.5,459.5L564.3,461.8L563.6,463.0L562.9,464.5L562.0,465.1L559.1,463.4L554.0,463.4L551.5,462.7L550.5,463.1L548.3,462.3L547.0,463.0L544.4,465.4L542.8,465.4L540.9,464.5L539.8,464.4L538.6,465.2L536.9,467.8L534.9,469.3L533.0,469.1L530.4,469.4L530.3,470.8L530.9,471.6L532.5,472.9L532.0,474.2L532.7,475.3L533.6,475.4L535.0,475.1L537.7,476.3L539.1,477.7L540.0,479.3L538.3,478.3L537.1,477.2L535.6,477.0L533.5,476.3L532.2,476.3L531.0,477.1L532.6,479.2L534.0,480.0L534.8,480.6L535.5,482.2L534.9,483.4L533.2,482.6L530.3,479.2L526.9,478.9L526.4,479.7L527.3,481.6L527.9,482.3L531.1,484.0L530.5,484.8L527.1,484.0L525.9,482.3L525.4,480.0L522.2,478.7L519.2,477.3L518.4,475.7L519.1,473.8L517.6,474.2L516.7,475.1L515.2,476.0L515.3,477.3L515.7,478.4L515.4,480.1L515.2,483.0L515.7,484.5L519.7,488.4L521.2,491.5L522.2,492.5L524.1,493.6L526.3,495.9L527.3,497.1L528.1,499.1L526.7,500.6L525.8,500.7L525.7,498.7L522.9,496.8L522.0,497.4L520.9,498.4L521.8,500.0L522.7,500.9L523.2,502.4L524.7,502.1L522.9,504.0L521.2,505.0L519.4,505.3L518.3,505.6L518.9,506.3L521.0,507.0L524.7,507.6L526.5,508.8L528.2,508.7L530.2,511.0L533.2,511.3L535.2,513.6L537.4,513.8L539.5,514.4L540.1,515.3L540.6,516.8L541.2,520.2L542.0,522.7L542.2,524.7L541.0,525.5L539.4,523.8L537.0,522.1L534.5,520.1L533.3,519.8L532.2,520.7L529.0,521.7L527.5,522.8L526.9,523.5L528.7,524.9L528.9,526.3L529.8,528.0L530.8,528.3L532.1,528.1L533.1,529.1L533.9,529.8L534.5,530.8L531.2,532.4L530.5,533.0L529.0,532.9L528.8,531.5L527.5,530.9L526.3,530.4L525.0,530.3L523.7,529.4L523.1,530.3L524.0,533.0L525.5,534.7L528.2,539.6L529.6,542.5L530.0,543.9L529.8,546.4L531.1,548.1L532.0,549.8L530.4,549.3L529.2,548.6L526.6,546.0L525.6,544.2L524.6,544.2L523.0,544.6L521.7,548.8L522.0,551.0L521.0,550.6L520.1,550.0L519.9,547.5L519.7,546.5L517.2,543.4L516.2,543.1L515.6,542.0L514.7,540.9L513.7,541.3L512.9,541.8L512.9,543.7L512.9,545.3L512.5,546.6L509.9,544.5L507.2,540.7L506.9,538.5L508.4,536.3L508.0,534.9L506.1,532.2L503.6,530.6L502.3,530.2L501.5,528.3L500.2,527.4L499.2,527.0L499.2,525.8L501.3,523.6L502.4,520.3L504.6,520.7L506.2,520.3L507.3,518.4L508.3,517.2L510.2,517.2L514.7,519.1L519.4,520.0L521.8,521.0L523.2,522.0L525.0,522.3L524.8,521.3L525.2,520.0L527.7,519.8L528.4,518.5L527.8,517.8L526.1,517.5L524.6,517.7L523.1,517.3L521.8,516.4L519.3,515.7L516.7,514.2L516.3,515.3L515.4,515.9L514.1,516.1L510.2,515.5L507.9,516.6L506.7,516.9L505.7,517.0L504.5,517.5L503.2,517.9L501.8,516.4L501.2,515.2L500.9,516.2L500.6,517.2L498.9,517.9L497.9,517.2L496.9,515.1L495.6,512.4L493.7,510.3L492.2,509.9L492.0,508.7L492.0,507.7L493.7,507.3L496.4,508.0L497.5,507.3L497.2,506.2L496.8,505.3L495.6,505.5L493.9,505.4L491.9,506.2L490.9,505.8L488.7,503.9L487.1,502.0L484.6,500.9L482.7,497.0L481.2,495.3L479.7,494.2L481.6,494.9L482.7,495.0L483.6,494.0L483.7,492.5L484.7,492.2L484.9,491.3L484.3,490.4L483.7,489.4L484.6,488.1L485.6,487.1L486.6,486.9L487.7,486.6L488.3,485.9L488.7,483.4L488.9,482.6L489.3,481.7L489.4,480.7L489.9,479.6L490.9,479.1L491.8,478.5L492.4,477.2L492.7,476.1L491.9,474.4L491.4,473.4L491.4,472.0L493.2,471.7L496.3,471.2L497.4,470.3L499.8,470.8L502.5,469.0L504.3,465.9L505.1,465.4L507.1,465.0L508.4,464.6L510.7,464.9L512.0,464.8L513.5,464.3L515.1,463.4L515.2,460.9L516.6,460.2L518.9,460.2L520.7,460.0L521.7,458.7L523.5,458.4L525.8,458.2L527.1,458.0L528.8,457.3L530.3,456.3L531.6,456.2L532.5,454.6L534.9,454.2L537.0,454.1L538.3,453.3L539.7,454.7L540.9,455.4L542.8,456.4L543.7,455.5L545.8,455.7L547.8,456.4L549.6,457.4L551.4,456.8L553.2,455.8L554.5,455.4L555.9,455.1L558.6,454.7L560.5,453.7L561.3,452.9L561.4,452.0L561.0,450.4L560.3,448.9L559.5,447.8L559.9,446.8L561.1,446.2Z"],["DE","M339.3,352.7L337.3,351.2L335.3,349.8L331.6,349.8L331.1,348.9L330.1,348.9L328.5,347.6L327.2,347.5L326.3,348.1L325.9,349.3L327.6,349.5L326.6,350.2L324.8,350.2L323.2,350.1L321.9,350.5L319.8,350.6L317.0,350.3L316.0,349.8L315.1,348.2L315.4,346.4L316.3,344.1L316.6,342.3L316.4,341.2L316.9,339.5L318.2,337.4L319.1,335.1L319.7,332.6L320.4,331.1L321.5,330.0L324.1,327.1L324.4,325.2L322.9,324.4L320.5,323.7L318.3,323.1L317.3,322.6L316.5,321.3L314.9,321.6L313.5,321.7L312.6,321.4L311.6,321.6L311.3,320.3L310.0,319.7L309.1,320.2L308.1,320.4L306.8,317.9L306.4,316.8L306.2,315.9L305.3,314.9L304.5,314.6L304.2,313.5L304.7,312.0L305.6,310.6L306.3,309.3L305.8,308.4L304.5,307.6L303.8,306.9L303.3,306.1L302.6,304.9L302.4,303.8L302.5,302.7L303.5,300.3L305.9,299.0L305.8,297.5L305.9,296.6L304.4,295.5L304.1,294.7L304.9,293.8L304.1,293.0L302.6,291.1L303.4,288.0L303.0,287.2L301.8,286.4L301.5,285.5L302.4,285.4L304.8,283.7L304.3,282.7L305.6,280.0L306.0,279.1L306.2,277.6L305.7,276.5L305.2,275.5L304.9,274.4L304.0,272.4L304.8,271.2L305.7,270.9L306.6,270.5L308.0,271.2L308.8,271.7L310.5,271.4L313.1,270.7L313.9,269.7L313.0,268.4L313.5,267.3L314.8,266.7L316.2,265.6L316.8,264.5L317.1,263.4L316.9,261.7L316.0,261.3L315.1,261.1L314.2,260.7L313.7,259.4L313.9,258.2L317.4,257.9L318.0,255.9L319.0,253.4L319.8,252.0L320.2,248.0L320.5,246.3L320.1,245.5L319.1,244.5L319.5,242.7L320.0,241.3L321.2,239.6L322.1,239.2L325.8,239.2L329.9,239.7L331.4,242.5L330.6,243.8L331.6,244.5L332.5,243.2L332.9,241.9L334.4,242.6L334.7,245.5L335.4,242.6L335.2,240.5L335.6,238.5L336.2,237.5L339.6,237.8L342.9,237.6L344.1,238.5L346.7,242.5L347.6,243.2L348.8,243.5L347.2,242.6L344.1,237.7L343.1,237.0L341.5,236.7L340.6,236.2L340.0,235.5L340.2,230.1L339.7,229.3L338.5,229.3L337.5,229.3L337.4,228.2L339.7,227.0L341.0,226.4L341.1,225.1L340.4,224.0L339.6,222.1L338.6,220.3L338.6,218.2L340.5,218.4L343.9,219.7L344.6,220.4L345.5,220.5L347.2,220.0L348.4,219.8L349.5,220.4L351.2,221.3L351.8,222.1L352.5,223.3L352.5,225.0L351.5,226.2L350.7,226.9L353.6,226.7L354.2,228.2L355.8,227.8L359.6,230.2L362.1,229.2L363.1,231.0L362.5,232.8L360.3,234.6L360.7,235.8L363.4,235.9L366.5,237.2L369.8,234.3L370.8,233.7L374.2,233.4L374.8,232.4L376.2,231.3L377.1,230.2L379.3,228.1L381.4,228.5L382.6,228.9L384.0,229.2L385.3,231.5L388.4,234.1L391.4,233.9L392.4,236.4L392.9,239.4L393.8,240.3L394.6,240.9L397.0,241.6L397.3,243.5L397.5,244.8L398.8,249.7L398.8,250.9L398.3,253.0L397.5,254.4L396.4,255.2L395.8,256.1L395.7,257.1L397.1,258.8L400.0,261.3L401.2,263.4L400.6,265.2L400.5,266.5L401.2,268.0L402.2,269.2L402.0,270.3L402.7,271.5L402.4,272.4L402.1,273.8L401.9,274.7L401.1,276.1L401.3,277.2L402.0,278.5L402.6,279.8L402.3,281.3L404.6,282.7L405.1,284.3L405.9,286.5L405.3,289.4L404.8,291.0L403.6,293.5L403.1,294.5L401.9,294.2L401.5,292.7L400.7,292.0L400.1,291.0L398.5,290.7L397.5,290.7L397.4,291.6L398.6,292.8L396.6,293.7L395.4,294.4L394.3,294.8L393.1,295.6L390.9,296.4L389.2,296.6L388.2,298.2L387.1,298.1L386.3,298.7L384.9,300.1L382.9,300.4L382.4,301.7L381.2,301.6L380.0,301.4L378.5,302.0L377.5,302.1L376.4,302.8L375.3,304.2L374.6,305.4L373.8,304.7L373.1,303.9L372.3,303.4L372.5,305.2L373.2,306.4L373.4,307.4L374.2,308.4L375.4,309.2L376.3,310.0L376.9,311.1L376.4,312.3L375.4,313.9L376.2,315.0L377.3,316.9L378.2,319.0L378.7,319.9L379.5,320.8L380.3,321.5L381.5,321.5L382.7,322.8L384.1,324.6L385.1,325.5L386.4,326.4L387.0,327.4L387.6,328.3L388.9,328.3L390.5,329.8L391.6,330.9L392.1,331.8L391.9,333.3L391.9,334.4L391.0,335.9L388.1,335.1L387.2,338.5L386.1,339.7L384.8,340.2L383.9,340.4L380.9,341.9L379.9,342.7L379.3,343.7L380.3,345.9L381.5,347.6L381.5,349.2L381.0,350.3L381.9,350.9L382.7,351.9L382.6,353.3L382.4,354.6L381.6,355.2L380.5,354.6L379.7,354.0L379.4,353.1L378.2,351.6L377.1,351.8L376.2,352.2L375.1,351.6L374.3,351.2L373.1,350.9L372.3,351.9L366.3,352.9L364.5,353.4L363.2,354.2L362.2,354.5L361.0,355.6L360.0,355.8L359.0,355.8L357.9,356.1L356.8,355.4L356.1,354.6L355.9,353.7L354.3,353.5L353.3,353.1L351.1,353.0L350.0,355.3L349.6,356.2L348.8,357.1L347.9,357.6L347.3,356.9L347.0,355.9L345.9,355.5L345.8,354.5L344.8,353.4L343.2,352.4L342.1,352.0L340.9,352.8L339.6,352.6ZM391.2,229.7L391.5,231.0L390.0,230.5L388.8,230.5L388.1,232.1L385.7,230.7L385.4,229.4L385.7,227.4L386.2,226.1L386.3,225.0L387.3,224.0L388.2,224.0L388.5,224.9L390.5,226.2L390.1,227.8L390.1,229.0ZM396.6,237.6L396.6,239.0L394.8,239.2L393.5,238.9L393.3,237.8L393.5,236.8L392.5,235.6L392.5,234.4L394.7,236.1Z"],["GE","M790.0,390.4L788.8,390.7L787.8,390.3L787.7,389.3L785.8,388.8L783.1,387.7L781.8,387.7L780.9,386.7L779.4,386.9L778.4,387.4L777.9,389.7L776.2,390.8L775.0,390.8L774.0,391.0L772.3,391.6L770.3,392.3L769.4,393.9L767.6,393.9L765.8,394.1L764.8,394.1L766.0,389.9L766.0,387.7L765.6,386.5L765.0,385.0L762.5,382.5L759.8,378.6L756.9,374.6L755.5,373.6L751.2,373.5L749.7,372.1L746.0,370.9L741.7,371.4L740.8,371.2L736.3,369.7L733.0,368.8L733.2,367.5L733.5,366.0L734.2,365.4L736.8,365.0L739.1,364.7L740.6,363.7L742.9,363.9L745.0,364.3L747.1,364.4L750.7,363.7L752.4,364.2L754.3,364.6L760.3,362.8L761.1,362.1L762.9,361.0L764.6,360.4L766.9,360.8L768.1,360.2L769.2,359.5L771.1,359.5L772.7,359.7L774.6,360.9L778.4,361.1L781.4,360.9L782.5,361.2L784.9,361.4L785.1,363.0L785.7,364.1L786.7,364.1L788.4,363.5L789.8,361.9L790.0,390.4Z"],["FR","M333.5,438.7L333.0,441.4L333.6,442.8L333.8,450.6L331.8,454.0L331.4,454.8L331.1,458.4L330.8,459.3L330.1,460.2L328.8,463.2L327.8,464.6L325.4,462.7L324.0,461.9L323.3,461.0L323.2,459.8L323.9,459.1L322.6,457.7L321.9,456.4L322.6,455.2L322.4,454.2L321.5,454.2L320.7,453.5L322.0,452.0L322.1,451.1L321.3,450.6L320.6,449.7L320.4,448.7L321.0,448.0L322.0,447.6L321.4,446.4L320.9,445.6L321.7,444.9L322.8,442.7L324.3,441.8L326.8,441.3L328.1,440.2L329.6,439.9L330.8,440.6L331.5,439.3L331.6,436.1L332.2,434.8L333.5,435.5L333.5,437.7ZM316.0,349.8L314.5,350.4L313.4,352.0L312.4,352.3L311.5,352.4L310.3,351.8L309.0,351.0L307.9,351.6L306.9,352.5L307.9,353.4L307.7,354.3L305.6,356.6L303.7,358.4L302.9,359.3L300.7,360.1L300.1,362.1L299.7,363.5L298.0,364.7L296.4,365.8L295.5,367.5L294.9,368.4L295.4,370.0L294.9,371.7L294.1,372.4L293.2,372.7L293.1,373.9L294.5,374.1L296.0,373.4L297.1,372.5L296.6,371.4L298.0,370.0L299.4,369.4L301.2,369.5L303.4,370.1L303.6,372.0L303.2,374.7L304.1,376.2L305.2,377.6L305.7,378.7L304.8,380.3L303.0,381.1L302.7,382.4L303.7,383.8L304.5,385.5L305.1,387.0L306.4,388.6L306.1,389.9L305.4,391.9L304.1,392.2L302.2,393.5L300.3,393.1L299.4,393.5L299.4,394.4L300.1,395.3L300.4,396.3L300.5,397.2L301.2,398.0L302.3,398.5L303.4,398.9L303.9,401.3L302.9,401.9L302.5,402.7L301.6,403.9L301.1,404.8L301.5,405.7L301.3,407.0L301.6,408.1L302.3,409.2L304.6,410.8L306.7,412.2L310.4,412.0L311.2,413.0L310.9,414.5L309.9,415.7L309.0,416.6L308.4,417.4L308.4,419.2L307.3,419.0L305.2,420.2L304.1,420.8L299.5,424.4L297.4,425.4L296.4,427.3L295.2,428.4L294.1,428.8L291.5,429.1L288.9,430.1L287.8,429.4L284.8,429.1L283.2,427.5L279.8,426.1L278.9,423.9L277.3,423.6L276.2,423.5L275.6,422.4L274.5,421.8L273.1,422.0L271.9,422.0L270.9,422.4L269.8,422.0L267.1,420.5L264.7,419.6L263.9,419.1L263.4,417.9L262.7,417.2L260.8,417.5L260.0,418.3L258.9,419.1L251.2,423.0L249.6,424.9L247.7,427.7L247.4,429.0L247.4,433.6L248.4,436.2L246.5,436.2L245.4,435.6L244.3,435.7L243.2,436.0L242.3,436.2L241.2,436.4L240.8,437.3L239.7,437.0L237.2,435.8L235.0,434.8L233.5,435.3L232.5,435.7L231.5,434.8L230.5,433.4L228.6,432.3L229.2,431.4L229.0,430.4L227.2,429.6L226.3,429.3L225.2,429.9L224.4,428.1L222.6,427.3L221.4,426.6L220.2,425.7L217.1,424.0L216.3,423.7L215.5,424.4L215.1,426.2L213.4,426.1L211.6,425.5L209.9,425.4L206.0,424.7L204.9,423.4L204.1,422.5L203.0,421.6L201.7,421.6L200.5,421.6L199.6,421.3L197.5,418.9L196.4,417.9L195.1,417.6L192.2,415.7L190.9,414.7L190.1,414.4L188.9,414.7L188.4,414.0L189.5,412.7L189.8,411.9L189.3,410.5L188.1,410.0L186.3,409.1L185.5,407.7L187.8,407.0L190.2,405.1L193.8,397.3L197.1,387.9L198.4,386.3L199.7,386.1L199.0,384.5L198.3,385.1L197.5,386.0L200.1,377.3L201.3,374.2L202.8,371.0L204.3,372.7L205.5,374.3L206.0,375.7L206.1,379.8L206.7,380.8L207.6,381.9L207.3,380.9L206.7,380.0L206.6,374.5L206.2,372.9L205.4,371.4L202.3,368.0L202.1,366.4L203.3,366.7L204.2,367.4L204.0,366.1L204.0,363.9L204.6,358.8L204.9,356.9L203.8,356.4L202.9,356.2L202.0,355.6L197.8,351.6L196.8,348.2L195.7,345.6L195.5,344.5L195.7,343.5L197.0,341.7L196.6,340.2L195.4,338.9L196.2,338.0L197.9,337.4L199.1,338.0L200.2,338.8L201.1,339.2L198.6,336.9L194.0,336.5L193.0,336.0L192.3,335.5L192.2,334.2L193.8,332.9L193.3,332.0L192.6,331.5L191.2,331.2L189.9,331.1L190.7,329.7L189.3,329.1L188.0,329.1L186.8,328.4L186.0,326.8L184.7,326.7L184.1,326.0L182.7,325.7L182.1,324.8L177.8,322.2L175.8,321.5L173.8,321.7L172.9,321.2L172.4,320.1L172.2,318.3L169.5,316.3L170.3,315.6L171.8,315.8L173.5,315.6L174.2,315.0L173.2,313.9L172.4,313.4L171.9,312.2L172.8,312.3L173.9,312.6L175.9,312.9L175.4,312.0L174.4,311.4L172.9,310.9L170.5,310.5L170.4,309.5L171.3,307.3L173.9,306.5L179.8,306.4L182.1,307.2L183.8,307.3L186.0,306.8L187.1,306.2L190.0,306.4L192.5,307.9L194.1,311.8L195.0,313.2L198.4,311.9L202.7,312.9L203.3,314.3L203.9,313.4L204.9,312.5L205.6,313.9L210.2,314.6L209.9,313.5L209.3,311.4L210.6,304.3L209.8,302.1L209.1,298.6L208.8,296.6L209.3,295.1L211.1,295.5L212.3,296.0L215.1,295.9L216.2,296.6L215.8,298.1L215.8,300.0L216.0,301.0L216.5,302.1L218.6,302.4L220.7,303.5L223.5,304.2L227.5,306.0L229.4,305.8L231.3,304.8L234.7,304.6L233.2,304.0L231.6,302.9L231.5,302.0L232.9,299.6L238.4,297.6L242.1,297.4L246.1,296.5L248.2,295.2L249.8,293.3L250.9,292.7L252.2,283.9L252.8,282.5L253.7,281.5L254.9,280.7L256.7,280.0L263.0,279.7L263.9,279.2L264.2,281.3L264.0,282.7L264.8,284.6L265.6,285.9L266.4,286.7L267.4,286.6L268.7,286.0L269.6,286.0L270.4,286.9L270.8,288.3L270.8,289.6L270.9,290.7L273.1,291.6L274.4,292.2L274.9,295.1L275.8,294.9L277.1,295.1L278.1,295.3L279.2,295.7L280.5,297.3L280.0,298.5L280.3,300.0L279.7,301.2L279.5,302.2L282.0,303.0L284.1,303.0L285.5,302.4L286.3,300.8L287.1,300.1L288.2,300.3L286.9,303.4L287.4,304.3L287.4,305.5L287.4,306.6L289.1,307.0L290.3,308.1L291.3,308.9L292.2,309.7L293.6,311.6L294.3,312.5L295.6,312.3L296.8,312.2L297.7,312.4L298.9,313.4L299.5,314.1L300.9,314.2L302.2,313.6L303.3,314.1L304.0,314.6L305.3,314.9L306.2,315.9L306.4,316.8L306.8,317.9L308.1,320.4L309.1,320.2L310.0,319.7L311.3,320.3L311.4,321.4L312.6,321.4L313.5,321.7L314.9,321.6L316.0,321.3L317.3,322.6L318.3,323.1L320.5,323.7L322.9,324.4L323.8,325.0L324.3,326.8L321.5,330.0L320.4,331.1L319.7,332.6L319.1,335.1L318.2,337.4L316.9,339.5L316.4,341.2L316.6,342.3L316.3,344.1L315.4,346.4L315.1,348.2L315.4,349.4Z"],["AX","M448.8,118.4L450.5,118.9L451.4,119.8L450.9,121.1L449.8,121.2L449.6,123.1L447.5,123.5L446.1,120.8L446.6,119.8L447.2,121.1L447.8,120.0L447.6,119.1L447.2,117.8L448.4,118.3Z"],["FI","M507.8,-30.0L509.1,-29.1L509.4,-26.4L508.5,-23.9L507.7,-21.7L506.8,-19.1L506.2,-17.0L505.6,-14.4L505.7,-12.9L508.1,-9.6L509.0,-8.3L510.0,-6.8L511.0,-5.3L511.7,-3.8L512.6,-2.4L514.0,-0.8L515.1,0.6L515.6,1.8L517.7,5.9L518.0,7.0L517.7,8.1L516.6,8.5L515.6,9.3L516.5,10.4L516.2,12.3L516.7,14.8L516.2,16.3L517.9,17.1L518.3,18.1L517.7,19.5L517.1,20.4L517.3,21.7L517.8,22.7L518.5,23.8L519.3,24.5L521.7,24.7L522.5,26.0L521.9,28.6L522.8,30.6L523.6,31.9L526.2,32.9L527.2,33.6L527.9,35.3L528.2,36.4L528.2,37.5L527.8,39.0L526.8,42.0L525.3,43.4L526.0,44.3L529.7,47.0L531.9,48.2L535.0,49.7L537.1,51.0L537.9,52.0L539.0,53.2L540.1,54.1L540.9,54.9L541.4,56.1L541.1,58.3L541.0,59.9L540.7,62.3L540.3,64.1L538.9,67.4L536.6,71.7L536.1,72.9L535.1,75.1L533.4,79.4L532.9,80.4L531.5,83.9L530.7,85.0L530.2,86.1L528.7,89.3L526.9,92.0L525.1,94.4L524.6,95.6L523.9,96.5L523.1,97.4L521.0,101.1L518.6,105.5L517.6,106.4L516.3,106.8L513.7,106.4L512.2,106.9L511.3,108.1L509.3,108.7L508.3,109.2L507.4,108.7L507.5,107.3L507.8,106.4L507.0,107.3L506.9,108.9L506.3,109.8L504.8,110.4L503.1,109.4L503.0,110.4L503.4,111.3L502.7,111.9L501.8,112.6L501.2,113.6L500.1,112.5L499.2,113.3L498.5,114.1L496.8,114.6L496.0,115.8L494.3,116.7L493.3,116.8L491.2,118.0L490.6,119.3L489.0,119.6L486.2,120.6L483.5,121.8L482.4,121.9L481.1,121.7L480.0,123.0L478.9,124.6L477.5,125.4L477.3,124.4L478.1,123.5L478.7,122.3L478.6,121.4L477.5,121.1L476.6,120.2L475.6,118.3L475.0,120.4L474.5,121.2L473.6,121.9L471.9,122.1L471.6,121.0L471.7,119.9L471.6,118.9L472.6,118.3L471.9,117.7L472.2,115.9L469.3,115.5L466.1,114.0L464.8,112.4L463.2,113.7L462.3,113.1L461.5,112.7L461.1,110.9L460.9,109.6L460.5,108.1L460.1,106.0L460.1,104.3L460.6,103.0L460.9,100.1L460.7,97.7L460.4,96.3L460.2,95.1L461.1,94.5L460.5,92.9L459.5,90.3L458.6,88.5L457.3,87.3L457.5,84.9L457.7,82.9L457.5,81.9L457.2,80.7L455.8,79.5L455.4,77.7L454.9,75.7L454.9,74.5L455.0,73.5L455.3,72.5L457.2,69.4L457.2,67.8L458.7,67.5L457.9,66.2L457.5,64.6L459.6,63.7L460.4,64.2L462.2,63.3L463.7,61.9L463.3,60.7L462.8,59.6L463.3,58.3L464.9,56.7L464.8,55.5L466.5,54.6L468.3,51.8L469.2,50.8L470.1,50.2L471.7,47.3L472.8,45.3L474.2,42.8L475.1,40.3L476.8,37.6L477.7,34.3L478.3,33.1L478.3,32.0L479.7,30.8L481.1,30.0L482.6,29.9L483.9,30.0L483.7,29.0L483.4,27.7L484.1,27.1L483.9,26.1L482.8,24.8L482.9,22.9L482.6,20.8L482.6,18.4L481.6,17.3L478.2,15.7L476.9,15.6L475.9,14.1L476.0,12.7L474.5,13.9L473.1,13.5L471.2,10.4L470.6,9.1L469.8,7.6L468.5,6.9L467.9,5.8L467.7,4.8L467.4,3.4L467.3,2.3L467.8,1.0L468.4,-0.4L468.4,-1.4L468.2,-2.9L468.4,-4.2L468.5,-5.5L467.5,-7.2L466.5,-8.3L465.7,-9.5L465.3,-10.6L465.0,-11.6L464.9,-12.6L465.7,-14.1L465.2,-16.2L463.8,-16.5L463.1,-17.8L463.4,-19.2L462.9,-21.2L462.5,-23.1L462.5,-24.6L463.2,-25.8L461.9,-27.2L460.9,-28.5L459.6,-29.2L507.8,-30.0ZM468.6,116.1L469.8,116.4L470.9,117.1L470.0,117.8L470.5,119.0L469.8,119.8L469.0,118.6L467.9,117.8L468.2,116.4Z"],["EE","M524.6,160.5L523.0,160.6L521.4,160.2L520.0,159.9L516.7,161.9L514.2,161.0L513.2,160.0L511.1,158.1L510.5,157.2L508.6,157.0L507.7,156.3L506.2,156.0L503.7,154.6L503.1,155.5L502.2,155.0L499.7,155.8L498.5,156.4L495.6,158.2L494.8,159.1L495.2,154.6L495.0,151.8L495.5,150.9L495.1,150.0L493.7,149.7L492.9,150.8L491.4,152.2L490.3,151.6L487.9,150.9L487.1,149.7L486.8,148.4L485.4,147.3L484.7,145.8L484.8,144.8L485.8,143.9L484.6,143.6L483.4,141.2L483.8,140.4L483.4,139.1L483.7,137.7L483.3,136.1L484.5,135.1L485.8,134.3L488.5,133.6L488.1,132.2L489.2,132.0L490.8,129.9L492.7,130.0L495.3,128.4L500.5,127.6L501.1,126.8L500.8,125.4L501.8,125.4L503.4,125.0L509.7,125.5L511.2,125.2L513.6,126.3L514.8,126.5L518.1,125.9L523.3,125.6L524.1,124.4L525.6,125.4L525.1,126.6L524.2,127.6L523.7,129.7L523.3,132.4L522.4,134.5L521.6,135.8L521.3,136.7L521.2,137.7L521.3,138.7L523.3,143.9L523.5,144.9L523.4,145.9L523.5,146.9L523.8,147.8L524.7,149.2L525.8,151.3L526.3,152.6L527.4,153.4L525.5,155.3L525.3,156.7L524.6,157.9L524.5,159.0L524.6,160.1ZM476.3,147.6L477.7,147.7L479.7,147.5L483.1,149.3L481.6,150.4L480.9,151.6L479.6,152.9L478.5,154.0L476.0,154.7L474.9,155.2L474.0,156.3L473.8,158.4L473.3,160.0L472.6,160.6L471.6,160.2L473.0,157.3L472.4,156.3L471.6,155.6L470.1,154.9L470.4,153.9L470.8,152.5L469.4,150.6L470.7,150.3L471.6,150.8L472.3,150.0L473.3,150.0L473.7,148.6L475.0,148.0ZM478.8,143.5L478.1,144.5L477.3,143.8L476.6,145.9L475.5,146.4L474.8,145.3L473.9,143.4L472.8,142.9L471.5,143.0L470.4,142.3L474.1,141.3L474.4,140.3L475.1,139.2L476.2,139.2L476.5,140.3L478.3,140.5L479.1,141.7L479.6,143.3Z"],["EG","M574.1,650.0L572.7,647.3L572.1,644.8L571.6,642.2L572.5,640.3L573.8,638.4L574.2,637.3L574.9,636.0L577.0,637.5L579.6,637.5L587.5,634.2L597.0,634.7L602.1,634.6L610.1,635.0L615.4,637.2L616.8,637.4L620.2,636.7L622.7,638.1L631.8,637.2L636.9,638.3L639.9,639.4L641.6,639.5L643.0,639.2L644.8,638.2L647.0,636.5L649.3,634.4L653.8,629.1L655.6,628.0L656.9,627.9L658.4,627.5L658.8,626.3L659.4,625.3L659.7,624.4L660.3,623.1L663.0,622.2L668.2,619.2L667.8,620.1L663.2,623.3L665.4,623.0L667.5,621.8L669.9,620.8L670.2,619.9L670.2,618.2L672.5,617.8L678.3,618.9L679.6,618.6L683.0,616.4L685.1,616.4L688.5,618.7L687.6,618.9L684.0,617.0L684.1,618.4L683.0,621.0L685.3,621.5L687.1,621.4L688.3,622.5L689.2,623.4L690.7,622.5L691.5,620.7L690.7,620.0L690.0,619.2L691.9,619.5L696.0,621.5L697.3,621.8L698.5,621.4L701.0,619.9L705.2,617.8L705.8,618.5L706.6,619.1L709.3,617.4L713.9,616.2L717.4,614.2L721.0,610.7L722.6,612.2L725.1,615.8L727.1,618.5L729.7,622.4L730.7,623.9L731.2,625.0L734.6,629.1L736.9,632.7L738.8,635.6L741.4,639.8L742.4,641.3L741.8,642.4L740.8,645.9L741.1,650.0L706.6,650.0L704.1,645.4L702.0,642.4L700.7,643.7L701.3,645.0L700.5,647.3L700.3,649.7L574.1,650.0Z"],["FO","M218.5,61.1L217.6,63.4L216.8,62.5L216.2,63.3L216.5,65.1L214.6,62.5L214.3,58.8L216.2,58.7L217.2,60.0Z"],["DK","M379.6,204.1L379.6,205.9L379.0,206.8L377.9,207.1L377.0,207.6L376.2,208.5L375.9,209.8L376.5,210.8L377.6,211.3L377.9,213.1L376.9,214.0L374.5,214.8L374.1,217.0L374.2,218.7L374.1,219.9L373.9,221.6L371.9,222.3L370.7,219.7L370.7,218.6L370.4,217.4L370.3,216.4L369.9,214.7L368.1,214.2L366.4,214.4L365.0,212.0L365.3,209.5L364.7,208.2L364.7,207.0L363.6,206.1L363.3,204.7L365.8,204.7L366.9,204.3L368.4,202.0L368.5,200.9L370.1,200.7L370.8,201.6L370.6,203.0L370.6,204.9L371.6,205.4L372.4,204.1L373.0,203.1L373.2,201.9L372.6,200.6L374.4,199.1L376.2,197.9L377.3,197.9L378.3,198.2L379.3,198.6L380.1,199.6L379.4,200.9ZM349.7,220.4L348.4,219.8L347.2,220.0L345.5,220.5L344.6,220.4L343.9,219.7L341.0,218.5L338.6,218.2L338.6,216.7L338.4,215.6L337.9,214.0L338.9,213.7L338.9,210.5L338.7,208.9L336.0,207.0L334.0,205.2L334.9,199.7L335.3,198.3L334.7,195.4L335.0,192.1L335.8,186.9L337.0,186.8L338.8,187.9L340.1,188.9L341.2,188.5L341.5,187.0L343.2,185.1L344.3,184.5L345.7,185.0L346.2,185.9L346.5,184.0L347.2,180.3L345.8,179.6L344.6,180.1L343.3,182.3L342.0,185.2L340.3,185.3L338.9,186.1L337.7,185.1L337.0,184.3L337.1,183.2L338.9,180.2L341.0,178.1L342.9,178.2L344.3,177.6L347.8,177.9L349.1,177.5L350.4,176.5L353.2,172.1L354.8,170.3L357.7,169.8L360.5,167.8L359.9,169.4L359.5,170.9L360.3,173.1L360.0,174.3L360.0,176.8L359.0,178.0L357.9,180.8L357.2,184.3L357.0,188.0L358.0,189.3L359.0,190.0L362.6,190.1L363.3,191.6L362.9,193.1L362.5,194.2L361.4,195.2L360.1,195.8L358.2,194.4L357.0,195.5L355.9,199.2L355.3,201.7L353.6,201.4L352.4,202.0L353.6,203.5L352.2,204.4L351.3,205.4L349.6,207.0L348.8,208.2L349.1,209.6L349.2,210.9L349.4,212.3L349.1,213.4L347.5,215.0L346.9,216.3L348.2,216.4L349.3,217.2L349.4,218.5ZM359.8,206.6L360.2,207.6L360.6,209.6L361.4,211.9L361.0,212.9L361.2,214.1L360.9,215.3L359.1,216.7L357.2,216.7L355.3,215.9L352.6,214.4L352.1,213.2L351.5,210.8L351.6,207.9L353.0,207.6L356.1,206.4L357.5,207.4L359.6,206.5ZM366.7,220.0L368.5,221.2L369.8,221.2L370.6,221.6L370.8,224.0L369.9,224.4L368.9,224.2L367.5,224.8L363.2,222.0L363.4,219.8L365.7,218.8ZM360.0,222.3L359.0,220.9L359.7,219.5L360.2,218.4L361.5,216.9L362.3,215.0L362.2,216.7L360.4,221.4ZM379.2,219.0L377.1,219.0L375.3,220.2L374.9,219.0L375.7,218.4L376.3,217.1L377.8,217.8L378.8,218.4ZM353.1,219.5L352.0,219.7L350.4,219.0L350.2,216.1L352.5,217.6L353.1,219.1ZM405.7,218.0L403.6,217.9L401.4,216.6L401.7,214.1L402.2,213.1L406.1,215.8L406.2,216.8Z"],["CZ","M451.3,316.4L450.3,316.8L448.5,316.9L447.2,318.3L446.2,319.4L443.6,321.5L443.1,322.9L443.1,324.0L443.0,325.0L441.3,326.1L440.7,326.9L440.1,327.7L439.2,328.4L437.7,329.4L436.0,329.7L433.8,329.5L432.4,329.3L431.0,330.8L430.1,332.7L429.8,334.1L428.9,332.3L427.5,332.0L425.5,331.0L424.0,330.7L423.2,331.2L420.9,331.9L419.0,331.7L416.1,329.8L414.7,329.9L413.4,329.4L411.1,328.2L410.0,327.9L408.6,328.4L407.0,327.5L405.9,327.8L405.7,330.6L405.4,331.6L404.2,331.6L402.8,333.5L402.6,334.8L401.0,334.6L399.5,334.5L398.7,335.3L396.6,335.2L394.9,334.8L394.2,333.1L393.4,332.5L392.4,331.9L391.6,330.9L390.5,329.8L388.9,328.3L387.6,328.3L387.0,327.4L386.4,326.4L385.1,325.5L384.1,324.6L382.7,322.8L381.5,321.5L380.3,321.5L379.5,320.8L378.7,319.9L378.2,319.0L377.3,316.9L376.7,315.8L375.6,314.4L376.1,312.8L376.7,311.9L376.3,310.0L375.4,309.2L374.2,308.4L373.4,307.4L373.2,306.4L372.5,305.2L372.1,304.2L372.7,303.5L373.8,304.7L374.3,305.9L375.3,304.2L376.4,302.8L377.5,302.1L378.5,302.0L380.0,301.4L381.2,301.6L382.1,301.9L382.7,301.0L384.9,300.1L385.5,298.9L386.7,298.2L387.8,298.4L388.9,296.8L390.9,296.4L393.1,295.6L394.3,294.8L395.4,294.4L396.6,293.7L398.5,293.0L397.7,292.1L397.2,291.2L398.0,290.5L400.1,291.0L400.7,292.0L401.5,292.7L401.4,293.8L402.6,294.5L403.5,294.0L404.6,293.7L405.6,293.2L405.6,291.1L407.2,291.2L408.7,291.8L408.9,293.2L409.9,294.5L411.1,294.8L413.2,295.6L414.2,295.7L415.2,296.2L416.1,296.8L417.1,297.5L418.1,297.6L420.6,297.1L421.5,297.7L422.2,298.5L421.8,299.5L420.7,300.2L419.9,301.3L420.9,302.2L423.2,304.4L424.6,306.6L425.5,307.0L426.6,305.9L427.4,305.4L429.0,304.4L428.1,302.4L427.5,301.2L428.8,301.1L430.8,301.7L434.0,303.8L435.6,303.6L436.7,303.2L437.7,304.1L436.1,305.5L437.2,306.5L438.0,307.2L438.6,308.1L439.6,308.7L440.8,308.1L441.6,307.5L442.2,308.2L443.4,308.6L444.2,309.2L445.1,309.2L447.1,309.5L447.9,310.6L448.2,312.1L450.9,314.6L451.2,315.9Z"],["","M699.1,542.6L697.5,542.7L696.5,543.3L695.5,544.1L694.4,544.8L693.5,545.0L692.1,545.1L691.5,546.0L690.7,544.2L689.4,543.4L688.6,543.8L687.4,544.0L686.5,544.0L684.9,544.9L683.7,545.8L682.8,546.6L680.7,546.6L679.6,546.3L681.8,545.1L682.0,543.1L681.7,541.0L684.6,540.9L687.4,540.4L689.6,539.9L691.7,539.0L697.9,535.0L699.4,533.1L700.5,532.4L702.2,530.7L704.2,529.5L703.2,531.1L697.0,538.8L697.0,540.5L697.6,541.6Z"],["CY","M679.3,545.9L680.7,546.6L682.1,546.8L683.7,545.8L684.9,544.9L686.5,544.0L687.4,544.0L688.6,543.8L689.4,543.4L690.7,544.2L691.3,545.9L692.1,545.1L693.5,545.0L694.4,544.8L695.5,544.1L696.5,543.3L697.5,542.7L698.5,542.9L699.5,542.9L700.2,543.8L698.5,544.6L696.9,545.2L695.9,545.3L695.0,545.6L693.1,549.3L691.9,550.8L690.3,551.8L688.5,552.7L687.6,553.0L687.0,553.6L686.6,554.4L686.6,555.7L685.6,555.8L684.9,554.9L682.4,555.3L678.4,555.2L677.5,555.0L676.7,554.2L674.5,551.4L673.6,549.1L675.1,549.3L676.2,548.3L677.1,546.8L678.4,545.9Z"],["HR","M388.9,391.0L392.8,392.6L393.9,391.6L395.4,391.7L396.4,391.6L397.9,391.5L399.0,391.6L400.8,389.5L401.1,388.6L402.1,389.3L403.7,391.1L404.5,391.6L405.8,391.4L408.5,392.1L410.2,392.2L411.5,391.7L410.8,390.4L410.8,389.1L411.6,388.5L410.5,387.2L412.8,385.7L415.0,385.0L415.5,383.7L415.5,382.2L415.4,381.1L414.5,380.0L414.6,378.8L415.8,378.0L416.8,377.6L417.6,377.2L418.7,376.8L419.5,376.3L420.3,375.0L422.3,375.0L422.4,372.9L423.2,372.2L424.8,372.1L425.9,372.5L428.8,373.9L430.4,375.3L431.4,376.8L432.6,378.0L434.1,378.8L435.3,379.9L436.3,381.3L437.5,382.1L439.1,382.2L440.1,382.6L440.5,383.4L441.4,384.1L442.7,384.7L444.7,385.0L448.6,384.9L449.8,385.0L450.8,384.7L452.0,384.1L453.5,382.0L455.6,381.8L456.4,381.3L456.4,382.6L456.6,384.4L457.4,386.3L457.1,387.4L457.6,388.1L458.9,388.6L458.4,389.7L458.4,390.9L459.6,392.0L462.0,392.9L463.1,393.4L463.8,394.4L462.5,394.9L461.3,395.0L460.4,394.5L459.5,395.7L460.2,398.6L459.8,399.8L459.1,400.6L456.9,400.5L456.1,399.4L455.6,398.0L454.4,397.1L452.2,397.1L450.4,396.6L449.5,396.4L447.6,396.7L445.8,396.4L444.3,397.7L441.8,396.3L440.0,397.1L439.0,396.9L437.1,396.5L435.7,396.7L434.5,396.4L431.8,394.6L430.2,396.2L426.9,395.9L425.9,396.9L424.8,398.9L423.9,399.8L422.1,398.7L420.4,396.6L419.6,396.2L418.6,396.2L417.3,396.9L417.1,400.0L416.8,402.8L416.8,404.4L418.7,405.9L421.0,408.5L422.1,409.6L422.7,411.9L423.3,414.3L424.5,416.0L425.6,417.1L426.9,418.1L428.5,419.7L429.8,421.5L432.8,424.4L435.3,426.7L437.5,427.5L438.0,429.8L439.8,432.3L442.9,435.1L443.4,436.2L442.5,437.0L438.9,433.9L436.1,432.3L433.0,429.1L428.9,427.9L426.1,426.6L424.5,426.8L422.6,427.4L421.5,427.4L420.1,426.3L420.0,424.7L418.4,423.3L416.2,421.9L414.1,420.2L409.9,415.4L409.0,413.9L410.4,413.6L412.3,413.3L413.6,413.6L412.4,412.5L410.9,411.6L407.1,407.6L405.9,405.7L405.8,403.7L406.0,400.9L405.3,398.9L402.4,396.3L401.4,395.0L399.3,394.2L398.3,394.3L397.8,395.3L397.4,397.5L395.5,400.5L394.9,401.8L393.9,403.4L392.5,403.4L391.0,400.6L389.5,398.4L389.3,397.4L389.2,396.2L388.1,391.6ZM429.9,436.5L432.4,436.9L434.2,436.6L435.8,436.8L436.9,437.4L435.8,437.7L434.3,437.6L432.6,438.2L431.1,438.0L430.1,437.1ZM437.1,433.8L436.1,434.0L430.2,434.1L428.4,433.8L426.5,432.9L428.0,432.3L429.8,432.5L430.4,433.2L435.3,433.6ZM431.5,431.4L429.4,431.5L427.5,431.2L426.6,430.7L426.9,429.4L429.0,429.4L432.1,429.9L432.9,430.5ZM404.8,400.8L403.2,401.2L402.4,400.5L400.9,399.8L400.1,399.0L401.1,397.7L401.7,396.3L402.4,397.1L403.4,398.7ZM409.9,412.4L408.7,412.1L407.9,411.4L407.3,410.7L406.2,409.8L405.8,408.7L404.2,406.5L405.4,407.3L407.4,408.9L408.8,410.6L410.5,412.2ZM400.7,406.6L399.8,406.4L399.4,404.8L398.4,402.2L398.7,400.8L398.0,397.8L398.9,397.4L399.1,398.9L399.4,399.8L400.4,401.0L400.2,402.8L400.4,405.4ZM454.3,443.3L454.9,444.7L455.5,445.6L452.9,444.0L450.5,442.2L445.8,439.4L442.5,438.9L438.0,436.7L435.2,435.9L436.2,435.7L437.5,435.6L444.4,438.5L443.6,437.7L444.6,437.3L446.0,438.5L447.1,439.2L448.8,440.3L449.9,441.2L452.5,442.7Z"],["BG","M584.8,437.7L582.9,437.8L582.0,438.5L580.1,438.8L579.1,439.5L577.6,439.5L575.9,438.4L574.8,437.6L573.4,437.9L571.0,438.6L569.6,440.1L568.5,440.7L566.9,441.2L565.6,441.7L565.3,442.7L565.2,443.6L563.1,444.8L562.7,446.0L561.1,446.2L559.9,446.8L559.5,447.8L560.3,448.9L561.0,450.4L561.4,452.0L561.3,452.9L560.5,453.7L558.6,454.7L556.7,454.7L554.5,455.4L553.2,455.8L551.4,456.8L549.6,457.4L547.8,456.4L545.8,455.7L543.7,455.5L542.8,456.4L540.9,455.4L539.7,454.7L538.8,453.3L537.0,454.1L535.7,454.2L532.5,454.6L532.4,455.7L530.3,456.3L528.8,457.3L527.1,458.0L525.8,458.2L524.3,458.1L521.7,458.7L520.7,460.0L518.9,460.2L517.4,460.2L517.2,455.2L517.7,453.0L516.8,452.1L516.2,451.0L514.8,448.3L512.6,447.3L511.1,446.7L509.9,445.7L507.5,443.2L508.5,442.8L509.6,440.6L509.5,439.5L508.7,438.8L508.0,437.3L508.2,435.8L507.7,434.3L508.0,433.4L508.7,432.8L511.1,432.2L512.1,430.2L512.8,429.6L513.5,428.4L514.0,427.1L512.3,425.3L511.7,424.5L510.9,423.6L509.9,423.0L507.9,422.1L507.0,421.0L506.5,419.5L505.9,418.4L505.2,417.7L504.7,416.4L504.5,415.0L504.7,413.0L505.6,412.0L507.1,410.7L507.0,409.4L507.7,408.0L509.2,408.3L511.5,409.2L512.7,410.0L512.3,411.2L511.4,411.8L510.9,412.6L510.9,413.5L511.8,414.6L515.8,413.4L519.9,413.2L525.5,413.7L529.2,413.6L531.7,412.7L536.8,413.0L541.6,413.3L546.0,412.8L548.4,411.7L550.0,410.4L551.2,408.3L554.4,405.2L557.7,403.3L562.2,401.3L565.2,400.4L570.1,402.2L571.8,401.9L573.3,402.0L574.3,402.6L576.1,401.7L577.2,402.8L578.8,404.3L581.2,404.7L583.3,404.8L586.1,404.3L586.6,408.7L585.8,411.0L583.7,410.7L581.4,411.7L580.6,414.3L580.0,415.1L579.5,416.0L579.6,419.1L580.4,424.0L579.6,424.8L576.0,430.1L578.3,430.9L579.4,431.7L581.4,433.9L584.1,436.4Z"],["BA","M463.5,400.1L463.5,401.9L463.0,403.5L462.2,405.2L461.4,406.7L461.2,408.8L461.2,409.8L461.7,410.8L462.8,411.1L464.3,412.0L465.5,413.3L467.2,414.6L467.8,415.7L466.0,416.5L464.7,416.4L463.6,416.5L465.1,419.0L466.9,421.4L467.1,422.5L466.6,424.1L465.4,423.6L464.0,423.8L463.3,424.8L462.2,425.0L461.1,425.0L460.0,425.2L460.5,426.7L461.4,428.2L461.3,429.4L460.1,428.6L458.9,428.6L457.7,429.8L456.7,430.8L456.2,432.3L456.3,434.6L454.5,435.0L453.9,435.8L454.2,438.1L454.5,439.3L455.6,441.1L455.6,442.1L454.9,442.9L453.1,442.9L449.9,441.2L448.8,440.3L447.1,439.2L446.0,438.5L445.4,437.5L443.6,437.7L442.5,437.0L443.4,436.2L442.9,435.1L439.8,432.3L438.2,430.5L437.9,427.9L435.3,426.7L432.8,424.4L430.2,422.1L428.5,419.7L426.9,418.1L425.6,417.1L424.5,416.0L423.3,414.3L422.7,411.9L422.1,409.6L421.7,408.8L418.7,405.9L416.8,404.4L416.8,402.8L417.1,400.0L417.3,396.9L418.6,396.2L419.6,396.2L420.4,396.6L422.1,398.7L423.1,399.5L424.8,398.9L425.9,396.9L426.9,395.9L430.2,396.2L431.8,394.6L434.5,396.4L435.7,396.7L437.1,396.5L439.0,396.9L440.0,397.1L441.3,396.3L443.5,397.7L445.2,397.0L447.6,396.7L448.6,396.4L450.4,396.6L451.3,396.9L454.4,397.1L455.6,398.0L456.0,398.8L456.2,400.0L458.3,400.7L459.6,400.5L460.7,399.9L462.0,399.6L463.0,399.8Z"],["BE","M283.8,276.8L284.7,277.4L285.8,277.4L285.7,276.3L287.2,275.7L288.0,276.7L290.0,275.7L290.6,276.5L290.9,277.4L292.0,277.5L293.1,276.5L293.4,277.7L293.6,278.8L294.7,280.2L295.8,280.7L297.1,280.6L298.3,281.3L299.0,282.2L300.6,282.9L301.3,283.8L300.2,286.1L299.9,287.1L298.8,288.2L298.9,289.3L299.7,290.3L301.3,290.6L302.5,290.7L303.8,292.2L304.9,293.8L304.1,294.7L304.4,295.5L305.4,295.9L305.8,297.5L305.9,299.0L303.5,300.3L302.7,301.9L301.1,301.2L299.7,302.6L299.0,303.8L298.5,304.7L297.9,305.4L297.8,306.5L297.5,307.4L298.1,308.4L299.0,310.6L298.3,311.7L297.7,312.4L296.8,312.2L295.6,312.3L294.3,312.5L293.6,311.6L292.7,310.3L292.0,309.2L290.3,308.1L289.6,307.4L288.2,306.6L287.4,305.5L287.4,304.3L286.9,303.4L288.2,300.3L287.1,300.1L286.3,300.8L285.8,301.6L284.1,303.0L282.0,303.0L279.8,302.4L279.7,301.2L280.3,300.0L279.8,299.1L280.4,297.7L279.2,295.7L278.1,295.3L277.1,295.1L275.8,294.9L275.1,295.4L274.7,292.6L273.1,291.6L271.3,291.2L270.8,289.6L270.8,288.3L270.4,286.9L269.6,286.0L268.7,286.0L267.4,286.6L266.4,286.7L265.6,285.9L264.8,284.6L264.1,283.3L264.4,281.9L263.9,280.1L269.3,277.0L272.5,275.9L274.0,275.6L274.1,277.2L274.6,278.1L275.6,277.9L277.4,278.0L278.2,278.5L279.0,279.4L281.4,279.1L283.0,278.2Z"],["BY","M590.6,247.4L588.5,247.7L586.1,248.4L584.9,249.7L583.3,249.6L582.4,250.4L581.3,252.4L580.5,253.6L579.9,255.3L579.5,257.7L579.3,259.5L579.9,260.5L580.6,261.5L580.9,262.6L581.4,263.5L580.9,264.3L580.8,265.3L579.7,265.4L578.2,264.8L577.6,263.5L576.4,262.8L574.6,262.7L573.0,263.5L570.8,264.3L569.1,264.7L568.3,265.4L567.0,266.1L565.3,264.4L564.4,263.0L563.4,262.4L562.5,263.1L561.7,263.9L560.9,264.5L560.0,266.7L559.0,266.4L558.2,265.0L556.2,265.0L554.6,265.0L553.3,264.8L552.3,265.8L549.8,265.7L549.2,267.0L548.9,267.9L548.0,266.4L546.9,266.1L545.2,266.3L544.1,266.8L543.2,266.6L541.3,264.4L539.2,264.7L537.2,264.8L534.8,264.6L533.5,264.6L531.3,264.2L527.4,263.8L525.8,263.9L523.5,264.2L520.0,264.5L517.8,265.0L516.8,265.5L515.7,265.9L513.7,266.4L511.6,266.8L510.2,267.3L509.5,269.1L508.1,271.3L506.6,272.8L505.2,272.4L503.4,272.3L502.4,273.0L502.7,274.6L501.6,273.0L501.4,271.3L501.7,270.3L502.1,269.4L501.7,268.2L502.0,266.5L501.9,265.2L501.1,264.2L500.0,263.7L497.9,262.7L496.3,262.0L496.0,261.1L497.1,258.7L498.1,257.0L498.8,256.3L502.5,253.7L503.0,252.9L503.0,251.7L502.6,249.3L502.1,247.1L501.5,245.6L500.4,242.9L497.6,237.2L495.6,231.2L498.3,231.4L499.7,230.8L501.1,230.7L502.1,230.3L503.0,230.0L504.5,230.9L506.1,229.9L507.5,228.9L509.1,228.7L509.3,226.0L511.6,225.4L512.8,223.8L513.8,222.9L514.7,222.8L515.5,221.9L516.4,223.2L516.4,224.2L518.2,224.3L519.0,223.4L518.6,222.0L517.1,221.3L516.4,220.2L516.7,218.6L517.1,217.2L517.5,216.1L517.0,213.8L517.3,211.7L517.8,210.0L518.8,209.3L520.1,208.8L520.9,207.9L521.1,207.0L521.3,205.6L524.8,204.9L525.1,203.5L525.8,202.6L525.1,201.6L523.2,201.7L522.7,200.8L523.0,199.3L523.2,197.5L523.2,196.1L523.3,195.0L524.8,194.5L526.3,192.0L527.2,191.5L529.9,191.5L531.1,191.3L532.6,191.1L532.9,189.0L534.9,185.6L536.0,184.3L536.8,183.9L538.8,185.2L539.8,184.4L541.5,184.0L542.3,184.4L543.1,185.3L543.7,186.1L545.6,184.8L546.4,184.3L549.1,184.7L550.1,185.0L550.6,186.0L550.5,187.8L551.3,188.8L552.2,189.3L553.4,187.8L554.5,187.2L555.2,186.6L556.1,185.5L557.2,185.4L559.1,184.8L561.5,185.4L563.2,186.6L564.1,187.2L565.7,187.9L566.9,188.2L567.6,191.2L567.1,192.6L567.2,193.5L568.1,194.4L569.2,195.7L569.6,196.5L569.1,199.4L568.8,201.0L568.9,202.0L571.3,203.5L572.9,204.0L573.1,206.4L574.4,207.3L575.3,208.2L576.3,209.9L577.8,211.3L580.5,212.2L582.4,212.8L583.1,213.6L583.3,214.8L583.2,216.4L583.9,217.4L585.6,216.8L587.9,216.6L590.9,217.5L590.9,218.9L591.7,220.0L594.4,221.1L595.0,222.4L594.5,223.3L593.0,224.8L592.8,226.0L591.3,227.9L590.3,228.9L589.4,229.1L587.2,229.4L586.2,228.9L584.8,228.2L583.7,228.4L582.2,228.9L581.9,230.1L581.5,231.6L581.3,232.5L582.6,233.7L583.9,234.8L585.1,235.7L585.7,236.8L585.8,238.6L587.1,239.9L587.2,242.1L587.7,244.1L588.7,244.8L590.5,246.9Z"],["AT","M339.1,357.3L340.2,355.2L340.5,353.8L339.7,353.0L340.9,352.8L341.7,352.4L343.2,352.4L344.8,353.4L345.5,354.0L346.0,354.9L346.2,355.8L347.5,356.1L347.2,357.6L348.8,357.1L349.6,356.2L350.0,355.3L350.5,353.0L353.3,353.1L354.3,353.5L355.9,353.7L356.1,354.6L356.8,355.4L357.9,356.1L359.0,355.8L360.0,355.8L361.0,355.6L362.0,355.0L363.2,354.2L364.5,353.4L366.3,352.9L372.1,352.4L372.2,350.8L374.3,351.2L375.1,351.6L376.2,352.2L377.1,351.8L378.2,351.6L379.2,352.2L379.4,353.6L380.5,354.6L381.6,355.2L382.4,354.6L382.6,353.3L382.7,351.9L381.9,350.9L380.8,350.7L381.5,349.2L381.5,347.6L380.3,345.9L379.2,344.2L379.9,342.7L380.9,341.9L383.2,340.7L384.8,340.2L386.1,339.7L387.2,338.5L387.8,335.5L390.4,336.2L391.7,335.1L391.9,333.3L392.0,332.1L393.4,332.5L394.2,333.1L394.9,334.8L396.6,335.2L398.7,335.3L399.5,334.5L401.0,334.6L402.6,334.8L402.8,333.5L403.7,332.1L405.4,331.6L405.7,330.6L405.9,327.8L407.0,327.5L407.9,328.0L409.3,328.1L411.1,328.2L413.4,329.4L414.7,329.9L416.1,329.8L419.0,331.7L420.9,331.9L422.7,331.8L424.0,330.7L425.5,331.0L426.8,331.8L428.3,332.1L429.5,333.7L429.7,335.0L429.3,335.9L428.8,337.0L428.9,338.0L430.3,341.4L431.6,343.5L432.6,344.8L431.9,345.6L431.8,346.8L431.3,347.9L431.6,349.3L431.9,350.3L430.7,350.6L429.4,350.6L428.4,350.9L426.7,349.9L425.5,349.8L424.6,350.8L426.7,352.3L427.2,353.6L426.7,354.7L426.0,355.7L424.4,356.2L424.7,358.5L424.2,359.4L424.5,360.8L425.1,361.8L424.9,363.0L423.3,363.4L422.3,364.0L420.4,366.1L419.0,367.2L419.1,369.0L416.4,368.9L414.7,369.2L413.6,370.0L412.3,370.5L409.5,370.3L406.8,370.7L405.5,371.1L404.5,372.2L403.8,373.0L402.9,373.7L401.8,374.2L400.6,374.6L399.6,374.4L397.7,374.1L395.6,373.8L394.6,373.4L393.4,373.1L392.2,372.9L391.1,372.8L387.9,372.0L386.2,372.0L383.9,371.7L379.4,370.6L378.0,370.2L376.8,370.1L375.3,369.7L374.2,369.1L373.5,368.1L372.7,366.7L371.4,364.8L371.1,363.9L371.5,363.2L372.0,362.3L369.1,362.9L366.7,363.8L365.7,363.8L364.8,363.5L363.6,363.5L362.4,363.7L360.1,363.8L358.7,364.4L357.7,365.8L357.2,366.9L356.0,367.3L354.8,367.2L353.9,366.8L353.1,365.8L351.7,365.6L350.5,365.5L349.8,363.5L346.7,365.2L344.5,364.7L343.1,363.6L342.7,362.4L341.5,361.7L340.0,361.3L339.9,360.4L339.5,359.4L339.3,358.4Z"],["AD","M228.6,432.3L226.9,432.8L225.5,433.0L224.8,432.4L224.9,431.1L225.2,429.9L226.3,429.3L227.2,429.6L229.0,430.4L229.2,431.4Z"],["DZ","M11.9,650.0L12.4,648.3L12.9,647.1L15.3,646.2L18.6,645.0L19.8,644.4L21.3,643.8L26.5,642.3L27.7,641.8L32.9,639.9L34.0,639.7L36.3,640.0L37.5,639.7L39.1,638.8L41.4,637.9L42.8,637.5L43.9,637.6L47.7,639.2L49.2,640.0L51.1,640.8L52.4,640.5L53.4,639.7L53.9,638.5L54.3,637.4L55.7,637.2L56.8,637.6L59.2,638.3L62.7,638.8L66.6,639.2L69.8,639.0L72.3,639.0L75.3,637.7L77.7,636.2L80.4,633.7L82.6,631.5L86.0,630.7L88.9,630.4L90.4,630.4L94.1,629.9L97.4,628.5L100.5,627.2L102.6,627.5L105.2,627.8L106.6,627.0L107.0,625.8L106.4,624.8L105.6,624.1L104.4,623.2L104.7,621.5L105.0,620.5L105.7,619.7L105.9,618.2L105.6,616.7L105.7,615.6L106.0,614.6L107.5,613.6L108.7,613.7L110.1,614.3L112.8,614.6L120.1,613.8L121.5,611.6L122.3,610.3L123.6,609.9L125.9,610.0L129.1,610.2L130.3,610.4L133.7,611.3L136.2,612.0L140.2,613.1L143.1,613.8L145.5,614.4L148.7,615.2L149.8,614.0L149.6,611.9L150.3,610.7L151.7,609.8L153.5,608.8L153.1,607.1L152.1,605.8L150.7,604.2L149.9,603.5L148.7,601.7L148.2,599.7L148.3,596.0L147.6,593.7L147.3,591.0L149.0,586.5L148.5,583.5L148.6,582.3L148.9,580.8L149.8,578.5L150.3,575.0L149.8,571.2L150.7,570.1L151.1,569.0L150.2,567.6L149.9,566.5L150.3,565.7L151.2,564.6L149.7,562.1L147.1,558.9L146.4,557.6L146.3,556.2L149.3,557.2L150.9,557.4L154.8,556.5L158.2,554.9L160.6,554.3L163.1,552.3L165.2,551.1L168.1,550.0L176.1,547.9L177.3,548.1L179.5,549.4L181.7,549.5L183.4,548.6L185.5,545.9L188.2,544.5L191.6,543.2L196.0,542.2L199.0,541.1L203.5,540.5L214.2,541.4L219.8,541.5L223.5,542.3L227.7,540.3L229.7,539.7L237.8,540.7L241.9,539.4L256.4,541.3L258.1,542.2L259.8,543.4L262.4,546.2L263.9,546.9L265.9,546.6L270.6,544.9L275.8,544.2L278.7,543.1L280.1,541.2L282.5,540.8L283.7,542.4L288.7,544.5L292.0,544.4L293.4,544.0L293.2,541.7L296.5,542.6L299.0,543.9L301.5,546.4L303.3,547.0L306.6,546.3L313.3,546.3L313.6,547.3L313.6,548.2L312.1,549.0L311.1,549.4L309.8,551.7L307.6,553.2L307.2,554.1L308.5,554.9L309.1,556.6L308.2,559.9L307.6,562.5L306.8,565.8L306.7,567.1L307.2,568.7L307.6,569.9L307.7,571.3L307.2,574.7L307.7,576.7L308.1,578.5L306.7,580.6L306.0,582.6L305.4,585.4L305.2,587.1L304.2,588.7L303.0,590.2L301.7,591.1L300.2,591.8L298.3,592.7L296.7,595.5L293.5,597.7L292.8,598.5L292.3,600.4L292.1,603.2L292.5,605.4L293.7,608.7L294.6,612.3L294.8,614.1L297.0,616.2L300.0,618.0L301.9,621.3L303.1,625.7L303.3,628.7L306.0,631.2L308.6,633.5L311.0,635.6L313.7,637.8L314.7,642.9L315.4,647.2L315.8,650.0L11.9,650.0Z"],["AL","M467.4,455.2L467.4,454.2L467.5,452.8L467.4,451.5L466.9,450.4L466.2,449.7L466.8,448.2L467.6,446.4L468.4,445.0L469.3,443.5L470.0,442.1L470.6,440.9L471.6,440.7L471.9,442.7L472.7,443.6L473.6,443.3L474.6,442.9L476.0,441.9L476.8,442.3L478.1,444.1L479.0,445.6L480.5,446.0L481.4,446.6L482.5,447.4L483.1,448.3L484.0,451.2L484.3,452.9L484.0,453.9L483.6,456.9L483.9,458.3L484.0,459.3L483.1,460.3L483.9,462.7L483.9,463.7L484.1,464.8L485.4,467.4L486.1,468.2L487.7,470.9L489.9,470.9L490.8,471.1L491.4,472.0L491.4,473.4L491.9,474.4L492.6,475.4L492.4,477.2L491.8,478.5L490.9,479.1L489.9,479.6L489.4,480.7L489.3,481.7L488.9,482.6L488.7,483.4L488.4,485.2L487.7,486.6L486.6,486.9L485.6,487.1L484.6,488.1L483.7,488.8L484.3,490.4L484.9,491.3L484.7,492.2L483.7,492.5L483.6,494.0L482.7,495.0L481.6,494.9L480.5,494.3L479.5,492.5L478.9,491.2L477.1,488.2L471.7,485.5L470.4,484.2L469.7,483.1L469.1,482.1L470.2,482.2L471.0,482.0L470.7,480.8L469.1,478.1L469.5,474.9L470.4,472.2L470.0,469.1L470.2,466.6L469.7,465.1L469.4,463.2L470.0,460.6L470.6,460.0L471.0,459.1L470.8,456.4L469.2,455.3Z"]],"caps":{"VA":[373.1,457,"Vatican City"],"SM":[373.8,419.7,"San Marino"],"LI":[338.8,359.8,"Vaduz"],"LU":[301.8,311.5,"Luxembourg"],"MC":[307.2,419.6,"Monaco"],"AD":[226.2,431.7,"Andorra"],"SI":[400.8,381.1,"Ljubljana"],"SK":[432.1,342.2,"Bratislava"],"ME":[465.6,444.3,"Podgorica"],"CH":[313.1,361.9,"Bern"],"XK":[490.9,438.4,"Pristina"],"MK":[495.7,450.3,"Skopje"],"TN":[337.1,550.3,"Tunis"],"MA":[71.7,558,"Rabat"],"MD":[577.6,345.2,"Chișinău"],"JO":[745,590.7,"Amman"],"LT":[512.9,215.1,"Vilnius"],"LV":[494.6,176.1,"Riga"],"HR":[419.8,385.5,"Zagreb"],"EE":[494.1,130.2,"Tallinn"],"LB":[727.9,557.7,"Beirut"],"RS":[478,400,"Belgrade"],"AL":[474.7,464.6,"Tirana"],"BG":[519.7,434.9,"Sofia"],"BY":[538.8,225.1,"Minsk"],"BA":[452.2,419.7,"Sarajevo"],"MT":[402.1,568.7,"Valletta"],"IL":[734.7,597.3,"Jerusalem"],"CY":[689.1,543.4,"Nicosia"],"TR":[659,459.4,"Ankara"],"HU":[456.8,352.6,"Budapest"],"RO":[551.6,397.8,"Bucharest"],"SY":[741.8,560.8,"Damascus"],"PT":[64.4,463.5,"Lisbon"],"NO":[364.4,127.9,"Oslo"],"PL":[472.1,265.1,"Warsaw"],"IE":[177.3,218.4,"Dublin"],"CZ":[399.2,307.8,"Prague"],"FI":[494,116.6,"Helsinki"],"DK":[379.5,206,"København"],"BE":[283.7,286.9,"Brussels"],"DZ":[230.8,540.3,"Algiers"],"UA":[583.8,280.1,"Kyiv"],"ES":[147.9,455,"Madrid"],"SE":[432.4,138.4,"Stockholm"],"NL":[293.7,260.4,"Amsterdam"],"DE":[387.7,263.5,"Berlin"],"EL":[536.8,520.2,"Athens"],"AT":[423,341.6,"Vienna"],"UK":[235.6,266.8,"London"],"RU":[632.3,166.2,"Moscow"],"IT":[373.5,457.1,"Rome"],"FR":[255.6,319.1,"Paris"]}};

/* ============ početna: animirani hero ============
   Karta Europe (HEROMAP, heromap.js) s lukovima od Zagreba prema najčešćim partnerskim državama.
   Debljina luka i boja države slijede broj zajedničkih projekata iz podataka (partnerCounts).
   Animacije: ulazak teksta, crtanje država i lukova, putujuće točke (SMIL), kolutovi oko Zagreba,
   izmjenjivanje „reflektora” među državama, brojke koje se pune, otkrivanje odjeljaka pri
   pomicanju i blagi paralaks. Uz prefers-reduced-motion sve je statično i potpuno nacrtano. */
const heroReduce = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

const HICO = {
  collect: '<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>',
  link: '<circle cx="5" cy="6" r="2.6"/><circle cx="19" cy="6" r="2.6"/><circle cx="12" cy="18" r="2.6"/><path d="M7.6 6h8.8M6.3 8.3l4.4 7.4M17.7 8.3l-4.4 7.4"/>',
  explain: '<rect x="3" y="11" width="4.2" height="9" rx="1"/><rect x="9.9" y="4" width="4.2" height="16" rx="1"/><rect x="16.8" y="8" width="4.2" height="12" rx="1"/>',
  school: '<path d="M3 10 12 4l9 6"/><path d="M5 10v9h14v-9"/><path d="M10 19v-5h4v5"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17.5" cy="9" r="2.4"/><path d="M16.5 14.2c2.9.2 4.5 2.3 4.5 5.1"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-10.8a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10" r="2.4"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
};
const hico = (k, s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${HICO[k]}</svg>`;

/* karta: SVG i podaci za reflektor */
function heroMap(ctr, motion) {
  const M = HEROMAP, z = M.caps.HR, max = Math.max(1, ...Object.values(ctr));
  const tier = (n) => (n >= 400 ? 4 : n >= 150 ? 3 : n >= 40 ? 2 : 1);
  const ranked = Object.keys(ctr).filter((c) => M.caps[c]).sort((a, b) => ctr[b] - ctr[a]);
  const arcs = ranked.slice(0, 32);
  const land = M.land.map(([c, d], k) => `<path d="${d}" class="hm-c${c === 'HR' ? ' hr' : ctr[c] ? ' p t' + tier(ctr[c]) : ''}"${ctr[c] && c !== 'HR' ? ` data-c="${c}"` : ''} style="--k:${k}"/>`).join('');
  const geo = arcs.map((c, i) => {
    const [x, y] = M.caps[c], dx = x - z[0], dy = y - z[1], L = Math.hypot(dx, dy) || 1;
    let nx = -dy / L, ny = dx / L; if (ny > 0) { nx = -nx; ny = -ny; }
    const b = L * 0.3, cx = (x + z[0]) / 2 + nx * b, cy = (y + z[1]) / 2 + ny * b;
    return { c, i, d: `M${z[0]},${z[1]}Q${cx.toFixed(1)},${cy.toFixed(1)} ${x},${y}`, w: (1.3 + 2.6 * Math.sqrt(ctr[c] / max)).toFixed(2), x, y };
  });
  const arcSVG = geo.map((g) => `<path class="hm-arc" data-c="${g.c}" pathLength="1" d="${g.d}" style="--i:${g.i};stroke-width:${g.w}"/>`).join('');
  const dots = geo.map((g) => `<circle class="hm-dot" data-c="${g.c}" cx="${g.x}" cy="${g.y}" r="${(2.4 + 1.6 * Math.sqrt(ctr[g.c] / max)).toFixed(1)}" style="--i:${g.i}"/>`).join('');
  const pulses = motion ? geo.slice(0, 14).map((g, i) => {
    const dur = (3 + (i % 5) * 0.35).toFixed(2), beg = (2.4 + i * 0.42).toFixed(2);
    return `<circle class="hm-pulse" r="3.3" opacity="0"><animateMotion dur="${dur}s" begin="${beg}s" repeatCount="indefinite" path="${g.d}" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .35 1"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.88;1" dur="${dur}s" begin="${beg}s" repeatCount="indefinite"/></circle>`;
  }).join('') : '';
  const px = (v, n) => (v / n * 100).toFixed(2) + '%';
  const html = `<div class="hmap" id="hmap" data-top="${ranked.slice(0, 8).join(',')}" role="img" aria-label="Karta Europe: lukovi suradnje od Hrvatske prema partnerskim državama">
    <div class="hm-stage"><svg viewBox="0 0 ${M.w} ${M.h}" aria-hidden="true" focusable="false">
      <g class="hm-land">${land}</g><g class="hm-arcs">${arcSVG}</g><g class="hm-dots">${dots}</g><g class="hm-pulses">${pulses}</g>
      <g class="hm-z" transform="translate(${z[0]} ${z[1]})"><circle class="ring r1" r="9"/><circle class="ring r2" r="9"/><circle class="core" r="5.6"/></g>
    </svg>
    <span class="hm-pin hr" style="left:${px(z[0], M.w)};top:${px(z[1], M.h)}" aria-hidden="true"><span translate="no">${esc(country('HR'))}</span></span>
    <div class="hm-cap" hidden><b translate="no"></b><span><i class="num" translate="no"></i> zajedničkih projekata</span><em></em><u></u></div></div>
    <div class="hm-foot"><div class="hm-leg" aria-hidden="true"><span>manje</span><i class="t1"></i><i class="t2"></i><i class="t3"></i><i class="t4"></i><span>više zajedničkih projekata</span></div>
    <p class="hm-note">Prikazano ${arcs.length} od ${Object.keys(ctr).length} partnerskih država.</p></div></div>`;
  return { html, ranked, geo };
}

/* brojka koja se „puni” */
function heroCount(el, to, dur, delay, reduce, stops) {
  const fin = fmt(to);
  if (reduce || !to) { el.textContent = fin; return; }
  el.textContent = fmt(0);
  let raf = 0, t0 = 0;
  const tm = setTimeout(() => {
    const step = (t) => {
      if (!t0) t0 = t; const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(to * e));
      if (p < 1 && el.isConnected) raf = requestAnimationFrame(step); else el.textContent = fin;
    };
    raf = requestAnimationFrame(step);
  }, delay);
  stops.push(() => { clearTimeout(tm); cancelAnimationFrame(raf); });
}

function landingFX(root, info) {
  const reduce = heroReduce(), stops = [];
  const hero = $('.hero', root), map = $('#hmap', root), svg = map && $('svg', map), sel = map && $('.hm-cap', map);
  /* brojke */
  $$('.cu', root).forEach((el, i) => heroCount(el, +el.dataset.to, 1500, 500 + i * 140, reduce, stops));
  /* karta: reflektor */
  if (map && svg && info) {
    if (!reduce && svg.setCurrentTime) { try { svg.setCurrentTime(0); } catch (e) { /* bez SMIL-a */ } }
    const top = map.dataset.top.split(',').filter(Boolean), cap = HEROMAP.caps, ctr = info.ctr, ranked = info.ranked;
    const num = $('.num', sel); let cur = '', timer = 0, hold = 0;
    const show = (c, instant) => {
      $$('.on', svg).forEach((e) => e.classList.remove('on'));
      if (!c) { sel.hidden = true; cur = ''; return; }
      cur = c;
      $$(`[data-c="${c}"]`, svg).forEach((e) => e.classList.add('on'));
      $('b', sel).textContent = country(c);
      const n = ctr[c], r = ranked.indexOf(c) + 1;
      $('em', sel).textContent = `${r}. najčešći partner`;
      sel.dataset.c = c; sel.hidden = false;
      sel.classList.remove('tick'); void sel.offsetWidth; if (!instant && !reduce) sel.classList.add('tick');
      if (instant || reduce) num.textContent = fmt(n); else heroCount(num, n, 700, 0, false, stops);
    };
    const next = () => { if (!root.isConnected) return; if (hold) return; const i = (top.indexOf(cur) + 1) % top.length; show(top[i]); };
    const start = () => { clearInterval(timer); if (!reduce) timer = setInterval(next, 3400); };
    if (reduce) show(top[0], true);
    else { sel.hidden = true; const t0 = setTimeout(() => { show(top[0]); start(); }, 2600); stops.push(() => clearTimeout(t0)); }
    stops.push(() => clearInterval(timer));
  }
  /* otkrivanje odjeljaka pri pomicanju */
  if (!reduce && 'IntersectionObserver' in window) {
    const targets = $$('.band:not(.hero) .secthead, .band:not(.hero) .lstrip, .band:not(.hero) .grid, .band:not(.hero) .qgrid, .band:not(.hero) .askband, .band:not(.hero) .srcgrid, .steps, .forwho', root);
    const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -7% 0px', threshold: 0.06 });
    targets.forEach((t, i) => { t.classList.add('rv'); io.observe(t); });
    stops.push(() => io.disconnect());
  }
  route.cleanup = () => stops.forEach((f) => { try { f(); } catch (e) { /* već zaustavljeno */ } });
}

/* ============ popis svih stranica (koristi mapa stranice i tražilica) ============ */
const SAMPLE_ORG = (D.orgs.find((o) => o[1] === 'Gimnazija Metković') || D.orgs[0])[0];
const PAGES = [
  ['#/', 'Početna', 'Uvod u atlas, ključne brojke i poredak županija', 'Početak'],
  ['#/pregled', 'Pregled', 'Brojke, godišnji graf i poredak uz filtre', 'Istraži'],
  ['#/kronologija', 'Kroz vrijeme', 'Broj projekata po godinama, sektoru i vrsti', 'Istraži'],
  ['#/drzave', 'Partnerske države', 'S kojim državama Hrvatska najviše surađuje', 'Istraži'],
  ['#/mjesta', 'Županije', 'Interaktivna karta i poredak županija', 'Istraži'],
  ['#/usporedba', 'Usporedba županija', 'Do četiri županije jedna uz drugu', 'Istraži'],
  ['#/pokrivenost', 'Pokrivenost škola', 'Udio škola koje sudjeluju, po županijama', 'Istraži'],
  ['#/mjesta/Grad%20Zagreb', 'Detalj županije (primjer)', 'Brojke, organizacije i pokrivenost jedne županije', 'Istraži'],
  ['#/teme', 'Teme kroz vrijeme', 'Udio tema u projektima po godini', 'Teme i problemi'],
  ['#/pristupi', 'Problemi i rješenja', 'Koje probleme projekti navode i što uz njih rade', 'Teme i problemi'],
  ['#/graf', 'Mreža pojmova', 'Pojmovi koji se pojavljuju zajedno u projektima', 'Teme i problemi'],
  ['#/projekti', 'Projekti', 'Pretraga projekata po temi, sektoru i državi', 'Pretraži'],
  ['#/projekti/' + encodeURIComponent(D.projects[0][0]), 'Detalj projekta (primjer)', 'Osnovni podaci i države jednog projekta', 'Pretraži'],
  ['#/organizacije', 'Organizacije', 'Pretraga hrvatskih organizacija u KA2 projektima', 'Pretraži'],
  ['#/organizacije/' + encodeURIComponent(SAMPLE_ORG), 'Detalj organizacije (primjer)', 'Sudjelovanje, projekti i partneri jedne organizacije', 'Pretraži'],
  ['#/pitajte', 'Asistent', 'Pitanja običnim jezikom, odgovori uz izvore', 'Pitajte'],
  ['#/o-podacima', 'O podacima', 'Izvori, obuhvat i ograničenja', 'Informacije'],
  ['#/rjecnik', 'Rječnik pojmova', 'Objašnjenja stručnih izraza', 'Informacije'],
  ['#/preuzimanje', 'Preuzimanje podataka', 'Otvoreni skupovi podataka u CSV i JSON formatu', 'Informacije'],
  ['#/pristupacnost', 'Pristupačnost', 'Izjava o pristupačnosti i poznata ograničenja', 'Informacije'],
  ['#/kontakt', 'Kontakt i povratne informacije', 'Prijava greške u podacima, prijedlozi, pitanja', 'Informacije'],
  ['#/mapa-stranice', 'Mapa stranice', 'Popis svih stranica atlasa', 'Informacije']
];

/* ============ prikaz: Projekt (detalj) ============ */
function viewProjekt(root, id) {
  const p = D.projects.find((x) => x[0] === id);
  if (!p) { viewNotFound(root); return; }
  const parts = id.split('-'), lead = (parts[2] || '').slice(0, 2), action = parts[3] || '', field = parts.length > 5 ? parts[4] : '';
  const cs = p[8].split(',').filter(Boolean), partners = cs.filter((c) => c !== 'HR');
  const similar = D.projects.filter((x) => x[0] !== id && x[2] === p[2] && x[5] === p[5]).slice(0, 5);
  const dl = (rows) => `<dl class="meta2" style="display:grid;grid-template-columns:minmax(120px,170px) minmax(0,1fr);gap:12px 20px;font-size:1rem">${rows.map(([k, v]) => `<dt style="color:var(--muted);font-size:.92rem">${k}</dt><dd style="margin:0">${v}</dd>`).join('')}</dl>`;
  const nodeName = (cid) => { const n = (D.graph.nodes || []).find((x) => x[0] === cid); return n ? bi(n[2], n[3]) : ''; };
  let F = null, seq = 0;
  function paint() {
    const ccs = F && F.countries && F.countries.length ? F.countries : cs, cLead = F ? (F.countries && F.countries[0]) || lead : lead;
    root.innerHTML = `<nav class="crumbs" aria-label="Putanja"><a href="#/projekti">Projekti</a><span>${esc(id)}</span></nav>
  ${head(`Projekt · ${LAB.kind[p[5]]}`, esc(p[1]), `Poziv ${p[2]}. · ${LAB.sector[p[4]]} · ${LAB.status[p[6]]}`)}
  <div class="grid two" style="margin-top:0">
    <div class="stack">
      ${F ? `<section class="card"><h2>Sažetak</h2><p class="lead small">Sažetak je preuzet iz javnih podataka EU-a i nije lektoriran.</p>${F.summary ? String(F.summary).split(/\n+/).map((t) => `<p style="max-width:75ch">${esc(t)}</p>`).join('') : '<p>–</p>'}</section>` : ''}
      <section class="card"><h2>Osnovni podaci</h2><div style="margin-top:14px">${dl([['Oznaka projekta', `<span class="mono">${esc(id)}</span>`], ['Godina poziva', p[2] + '.'], ['Programsko razdoblje', LAB.period[p[3]]], ['Vrsta projekta', `${LAB.kind[p[5]]}${action ? ` <span class="pill">${esc(action)}</span>` : ''}`], ['Sektor', LAB.sector[p[4]] + (field ? ` <span class="pill">${esc(field)}</span>` : '')], ['Status', LAB.status[p[6]] + (p[6] === 1 ? ' <span class="pill warm">u tijeku</span>' : '')], ['Vodeća država', cLead ? esc(country(cLead)) : '—'], ['Dobra praksa', p[7] ? '<span class="pill green">Da, oznaka EU-a</span>' : 'Nije označen']].concat(F && F.grant_eur != null ? [['Dodijeljeni iznos', `${eur(F.grant_eur)}${F.grant_not_comparable ? ' <span class="pill warm">nije usporediv</span>' : ''}`]] : []))}</div></section>
      ${F ? '' : '<div class="note">Sažetak projekta, popis sudionika i dodijeljeni iznos čitaju se iz datoteke <span class="mono">projects_full.json</span>, koja se generira u pipelineu i nije u ovom prototipu. Prikazani su podaci koji postoje u popisu projekata.</div>'}
      ${F && (F.results_card_url || F.project_website) ? `<section class="card"><h2>Poveznice EU-a</h2><ul class="check-list" style="margin-top:12px">${F.results_card_url ? `<li><a href="${esc(F.results_card_url)}" target="_blank" rel="noopener noreferrer">Kartica projekta na platformi EU-a</a></li>` : ''}${F.project_website ? `<li><a href="${esc(F.project_website)}" target="_blank" rel="noopener noreferrer nofollow">Mrežna stranica projekta</a></li>` : ''}</ul></section>` : ''}
    </div>
    <div class="stack">
      ${F && F.hr && F.hr.length ? `<section class="card"><h2>Hrvatski sudionici</h2><ul class="check-list" style="margin-top:12px">${F.hr.map((h) => `<li><a href="#/organizacije/${encodeURIComponent(h.id)}">${esc(h.name)}</a>${h.role === 'coordinator' ? ' <span class="badge">Koordinator</span>' : ''}</li>`).join('')}</ul></section>` : ''}
      <section class="card accent"><h2>Države u projektu</h2><p class="lead">${ccs.length} država, od toga ${ccs.filter((c) => c !== 'HR').length} uz Hrvatsku.</p><div style="margin-top:8px">${ccs.map((c, i) => `<span class="tag" ${c === 'HR' ? 'style="background:var(--btn);color:#fff;border-color:var(--btn)"' : ''}>${esc(country(c))}${F && i === 0 ? ' <i class="leadmark">vodeća</i>' : ''}</span>`).join('')}</div></section>
      ${F && F.topics && F.topics.length ? `<section class="card"><h2>Teme</h2><div style="margin-top:10px">${F.topics.map((t) => `<span class="tag">${esc(topicLab(t))}</span>`).join('')}</div></section>` : ''}
      ${F && F.concepts && F.concepts.filter(nodeName).length ? `<section class="card"><h2>Pojmovi iz mreže</h2><p style="margin-top:10px">${F.concepts.filter(nodeName).map((c) => `<a class="pill" style="text-decoration:none;margin:0 6px 6px 0" href="#/graf">${esc(nodeName(c))}</a>`).join('')}</p></section>` : ''}
      <section class="card"><h2>Slični projekti</h2><p class="lead">Ista godina poziva i ista vrsta projekta.</p>${similar.length ? `<ul class="res" style="border:0">${similar.map((x) => `<li style="padding:12px 0"><a class="t" href="#/projekti/${encodeURIComponent(x[0])}">${esc(x[1])}</a><div class="meta"><span class="pill">${x[2]}</span><span class="pill">${LAB.sector[x[4]]}</span></div></li>`).join('')}</ul>` : '<div class="empty">Nema sličnih projekata.</div>'}</section>
    </div>
  </div>
  <p style="margin-top:28px"><a class="btn" href="#/projekti">← Natrag na projekte</a></p>`;
  }
  paint();
  const my = ++seq;
  FULL.project(id).then((f) => { if (f && root.isConnected && my === seq && true) { F = f; paint(); } });
}

/* ============ prikaz: Rječnik ============ */
const GLOSS = [
  ['KA1 i KA2', 'Ključne aktivnosti programa Erasmus+. KA1 su mobilnosti pojedinaca (učenje u inozemstvu), a KA2 suradnja organizacija i razmjena dobrih praksi kroz partnerstva. Ovaj atlas prikazuje samo KA2.'],
  ['Partnerstvo', 'Projekt u kojem organizacije iz više država zajedno razvijaju rezultate, metode ili materijale. U podacima ga brojimo kao jedan projekt, bez obzira na broj partnera.'],
  ['Partnerstva za suradnju', 'Vrsta KA2 projekata u razdoblju 2021.–2027. za organizacije koje žele razviti i podijeliti nove prakse, na europskoj razini.'],
  ['Mala partnerstva', 'Jednostavnija i manja KA2 partnerstva iz razdoblja 2021.–2027., namijenjena novim i manjim organizacijama.'],
  ['Strateška partnerstva', 'Naziv za KA2 partnerstva u razdoblju 2014.–2020. Obuhvaćaju i razmjene škola, koje atlas prikazuje kao zasebnu vrstu.'],
  ['Koordinator', 'Organizacija koja podnosi prijavu, vodi projekt i prima grant. Hrvatska je koordinator kada je vodeća organizacija iz Hrvatske.'],
  ['Partner', 'Organizacija koja sudjeluje u projektu koji netko drugi koordinira.'],
  ['Projekt sa sudionikom iz županije', 'Projekt u kojem sudjeluje barem jedna organizacija iz te županije. Projekt s organizacijama iz dvije županije broji se u obje.'],
  ['Programsko razdoblje', 'Dva višegodišnja financijska okvira programa: 2014.–2020. i 2021.–2027. Popisi tema i vrste projekata razlikuju se između njih, pa se neki grafovi ne spajaju preko 2021.'],
  ['Godina poziva', 'Godina natječaja na kojem je projekt odabran. Godina 2026. još traje, pa je u grafovima prikazana kao nepotpuna.'],
  ['Dobra praksa', 'Oznaka koju Europska komisija dodjeljuje projektima izdvojenima kao primjeri. Nije ocjena kvalitete projekata bez te oznake.'],
  ['Vrijednost projekata', 'Okvirni iznos potpore dodijeljen projektu pri odabiru. Bilježi se po projektu i ne dijeli se među partnere.'],
  ['Pokrivenost škola', 'Udio osnovnih i srednjih škola u županiji koje su sudjelovale u barem jednom KA2 projektu. Škole su s registrom povezane prema nazivu i poštanskom broju, pa je udio procjena.'],
  ['Udio u EU', 'Koliki dio svih KA2 projekata u Europskoj uniji ima barem jednog hrvatskog partnera.'],
  ['Mreža pojmova', 'Prikaz pojmova koje je jezični model izdvojio iz sažetaka projekata (pristupi, ciljne skupine, rezultati, problemi, teme). Brojevi su donja granica, pa pokazuju obrasce, a ne točne brojke.']
];
function viewRjecnik(root) {
  root.innerHTML = `${head('Informacije · Rječnik', 'Rječnik pojmova', 'Kratka objašnjenja izraza koji se koriste u atlasu, da brojke možete čitati s razumijevanjem.')}
  <div class="filters" style="margin-bottom:20px"><label class="f" style="flex:1 1 320px"><span class="lab">Pretraži pojmove</span><input id="gq" type="search" placeholder="Npr. koordinator…" autocomplete="off" style="width:100%;max-width:420px"></label></div>
  <div class="gloss" id="gl">${GLOSS.map(([t, d]) => `<details data-n="${esc(fold(t + ' ' + d))}"><summary>${esc(t)}</summary><p>${esc(d)}</p></details>`).join('')}</div><p class="empty" id="gn" hidden style="margin-top:12px">Nijedan pojam ne odgovara pretrazi.</p>`;
  $('#gq', root).oninput = (e) => { const q = fold(e.target.value.trim()); let n = 0; $$('#gl details', root).forEach((d) => { const h = !!q && !d.dataset.n.includes(q); d.hidden = h; if (!h) n++; if (q && !h) d.open = true; }); $('#gn', root).hidden = n > 0; };
}

/* ============ prikaz: Preuzimanje podataka ============ */
function download(name, rows) {
  const q = (v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const blob = new Blob(['﻿' + rows.map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function viewPreuzimanje(root) {
  const SETS = [
    ['projekti.csv', 'Projekti', `${fmt(D.projects.length)} KA2 projekata s hrvatskim sudionikom: oznaka, naslov, godina, razdoblje, sektor, vrsta, status, dobra praksa i države.`, () => [LL(['oznaka', 'naslov', 'godina', 'razdoblje', 'sektor', 'vrsta', 'status', 'dobra_praksa', 'drzave'], ['code', 'title', 'year', 'period', 'sector', 'type', 'status', 'good_practice', 'countries']), ...D.projects.map((p) => [p[0], p[1], p[2], PL(p[3]), I18N.ent(LAB.sector[p[4]]), I18N.ent(LAB.kind[p[5]]), I18N.ent(LAB.status[p[6]]), p[7] ? LL('da', 'yes') : LL('ne', 'no'), p[8].replace(/,/g, ' ')])]],
    ['organizacije.csv', 'Organizacije', `${fmt(D.orgs.length)} hrvatskih organizacija: mjesto, županija, vrsta, broj projekata i koordinacija po razdobljima.`, () => [LL(['id', 'naziv', 'mjesto', 'zupanija', 'vrsta', 'projekata', 'koordinirano', 'projekata_2014_2020', 'projekata_2021_2027', 'koord_2014_2020', 'koord_2021_2027'], ['id', 'name', 'place', 'county', 'type', 'projects', 'coordinated', 'projects_2014_2020', 'projects_2021_2027', 'coord_2014_2020', 'coord_2021_2027']), ...D.orgs.map((o) => [o[0], o[1], o[2], I18N.ent(o[3] || ''), I18N.ent(LAB.cls[o[4]] || o[4] || ''), o[5], o[6], o[7], o[8], o[9], o[10]])]],
    ['zupanije.csv', 'Županije', 'Pokazatelji za 21 županiju po razdobljima: organizacije, projekti, koordinacije i vrijednost projekata.', () => [LL(['zupanija', 'razdoblje', 'organizacija', 'projekata', 'koordinirano', 'vrijednost_eur'], ['county', 'period', 'organisations', 'projects', 'coordinated', 'value_eur']), ...D.counties.flatMap((c) => ['all', '2014-2020', '2021-2027'].map((k) => [I18N.ent(c.label), PL(k), c.ka2[k].organisations, c.ka2[k].projects_involved, c.ka2[k].projects_coordinated, Math.round(c.ka2[k].value_involved_eur)]))]],
    ['projekti-po-godinama.csv', 'Projekti po godinama', 'Broj projekata po godini poziva, razdoblju, sektoru i vrsti projekta.', () => [LL(['godina', 'razdoblje', 'sektor', 'vrsta', 'broj'], ['year', 'period', 'sector', 'type', 'count']), ...D.rows.map((r) => [r[0], PL(r[1]), I18N.ent(LAB.sector[r[2]]), I18N.ent(LAB.kind[r[3]]), r[4]])]]
  ];
  root.innerHTML = `${head('Informacije · Preuzimanje podataka', 'Preuzmite otvorene podatke', 'Skupovi podataka na kojima se temelji atlas. Preuzimanje u prototipu stvara CSV izravno iz podataka koje stranica već sadrži.')}
  <div class="grid two" style="margin-top:0"><section class="card" style="padding:0"><div>${SETS.map(([f, t, d], i) => `<div class="ds"><div><h3>${t}</h3><p>${d}</p><p class="mono small" style="margin-top:6px">${f}</p></div><div class="acts"><button type="button" class="btn sm primary" data-i="${i}">Preuzmi CSV</button></div></div>`).join('')}</div></section>
  <div class="stack"><section class="card"><h2>Kako koristiti podatke</h2><ul class="check-list" style="margin-top:14px"><li>Navedite izvore: Erasmus+ Project Results Platform (Europska komisija), Program Erasmus+ 2021.–2027. i registri ustanova na data.gov.hr (Agencija za mobilnost i programe EU, Ministarstvo znanosti i obrazovanja).</li><li>Provjerite uvjete korištenja u izvoru; atlas ne mijenja licence izvornih skupova.</li><li>Pročitajte <a href="#/o-podacima">ograničenja podataka</a> prije usporedbi.</li></ul></section>
  <section class="card"><h2>Za programere</h2><p class="lead">U pravoj aplikaciji isti su podaci dostupni kao JSON, a pitanja se šalju asistentu.</p><pre class="code">GET  /data/projects.json
GET  /data/orgs.json
POST /api/ask   { "question": "…" }</pre></section>
  <section class="card"><h2>Za AI asistente (MCP)</h2><p class="lead">Isti sloj upita dostupan je i kao MCP poslužitelj, pa asistenti poput Claudea mogu pretraživati projekte, otvoriti profil organizacije, izračunati pokrivenost i pronaći slične organizacije — iz istih podataka i s istim izvorima.</p><ul class="check-list"><li>Pretraga projekata i profil organizacije.</li><li>Pokrivenost po županiji i prvi projekti po sektoru.</li><li>Slične organizacije u istom sektoru i blizini.</li></ul></section></div></div>`;
  $$('button[data-i]', root).forEach((b) => b.onclick = () => { const s = SETS[+b.dataset.i]; download(tr(s[0]), s[3]()); b.textContent = tr('Preuzeto ✓'); setTimeout(() => (b.textContent = tr('Preuzmi CSV')), 2000); });
}

/* ============ prikaz: Pristupačnost ============ */
function viewPristupacnost(root) {
  root.innerHTML = `${head('Informacije · Pristupačnost', 'Izjava o pristupačnosti', 'Cilj je da atlas mogu koristiti svi, bez obzira na uređaj, vid, motoriku ili način rada s računalom.')}
  <div class="doc">
  <h2>Ciljana razina</h2><p>Sučelje se izrađuje prema smjernicama WCAG 2.1, razina AA. Neovisna provjera pristupačnosti još nije provedena, pa ovo opisuje cilj i provedene mjere, a ne potvrđenu sukladnost.</p>
  <h2>Što je napravljeno</h2><ul class="check-list">
    <li>Cijelo sučelje može se koristiti tipkovnicom, uz jasno vidljiv žuti okvir fokusa.</li>
    <li>Boje i kontrasti temelje se na paleti Europa Component Library; informacija se ne prenosi samo bojom.</li>
    <li>Svaki graf ima tekstualni ekvivalent: brojke uz stupce, popis ili tablicu podataka.</li>
    <li>Stranice imaju strukturu naslova i oznake područja (izbornik, glavni sadržaj, podnožje), a veza „Preskoči na sadržaj” prva je na stranici.</li>
    <li>Raspored se prilagođava od 320 px do širokih zaslona i uvećanja teksta do 200 %.</li>
    <li>Animacije se isključuju kada je u sustavu odabrano smanjeno kretanje.</li></ul>
  <h2>Poznata ograničenja</h2><ul class="check-list no">
    <li>Karta županija je shematska i služi pregledu; isti podaci uvijek su dostupni u poretku pored karte.</li>
    <li>Mreža pojmova je vizualni prikaz; za čitanje bez miša koristite pretragu pojmova iznad nje.</li>
    <li>Pojmovi u mreži izdvojeni su automatski, pa naziv pojedinog pojma ne mora biti idealno lektoriran.</li></ul>
  <h2>Prijava problema</h2><p>Ako naiđete na prepreku, javite nam preko <a href="#/kontakt">obrasca za kontakt</a>. Navedite stranicu, uređaj i pomoćnu tehnologiju ako je koristite.</p>
  </div>`;
}

/* ============ prikaz: Kontakt ============ */
function viewKontakt(root) {
  root.innerHTML = `${head('Informacije · Kontakt', 'Kontakt i povratne informacije', 'Prijavite grešku u podacima, predložite poboljšanje ili postavite pitanje o projektu.')}
  <div class="grid two" style="margin-top:0"><section class="card"><form id="kf" novalidate>
    <div class="field-row"><label for="kt">Vrsta poruke</label><select id="kt" class="field"><option value="g">Greška u podacima</option><option value="p">Prijedlog poboljšanja</option><option value="q">Pitanje</option><option value="s">Suradnja</option></select></div>
    <div class="field-row"><label for="km">Poruka</label><textarea id="km" class="field" maxlength="1500" required placeholder="Što ste primijetili ili što biste željeli?"></textarea><small class="muted" id="kerr" role="alert"></small></div>
    <div class="field-row"><label for="ke">E-pošta <span class="muted" style="font-weight:400">(nije obavezna, samo ako želite odgovor)</span></label><input id="ke" class="field" type="email" autocomplete="email"></div>
    <button class="btn primary" type="submit">Pošalji poruku</button></form>
    <div id="kok" hidden class="note" style="margin-top:20px;border-left-color:var(--green);background:var(--green-bg)" role="status"><b>Hvala.</b> U ovom prototipu poruka se ne šalje nikamo. U pravoj aplikaciji stigla bi na adresu projekta i u popis zadataka na GitHubu.</div></section>
  <div class="stack"><section class="card"><h2>Drugi načini</h2><ul class="check-list" style="margin-top:14px"><li><a href="https://github.com/CroPublica/Erasmus-Kompas/issues" target="_blank" rel="noopener">Prijava na GitHubu</a> za greške i prijedloge s tehničkim detaljima.</li><li><a href="#/pitajte">Pitajte asistenta</a> za brza pitanja o podacima.</li><li><a href="#/rjecnik">Rječnik</a> objašnjava većinu izraza u atlasu.</li></ul></section></div></div>`;
  $('#kf', root).onsubmit = (e) => { e.preventDefault(); const m = $('#km', root).value.trim(); $('#kerr', root).textContent = m ? '' : 'Upišite poruku.'; $('#kok', root).hidden = !m; if (m) { $('#kf', root).reset(); $('#kok', root).scrollIntoView({ block: 'nearest' }); } };
}

/* ============ prikaz: Mapa stranice ============ */
function viewMapaStranice(root) {
  const groups = [...new Set(PAGES.map((p) => p[3]))];
  root.innerHTML = `${head('Informacije · Mapa stranice', 'Sve stranice atlasa', 'Popis svih stranica prototipa, grupiran po odjeljcima.')}
  <div class="sitemap">${groups.map((g) => `<section><h3>${g}</h3><ul>${PAGES.filter((p) => p[3] === g).map((p) => `<li><a href="${p[0]}"><b>${esc(p[1])}</b><small>${esc(p[2])}</small></a></li>`).join('')}</ul></section>`).join('')}</div>`;
}

/* ============ prikaz: nije pronađeno ============ */
function viewNotFound(root) {
  root.innerHTML = `<div class="nf"><b>404</b><h1 style="font:600 1.9rem var(--serif)">Stranica nije pronađena</h1><p class="lead" style="margin-inline:auto">Adresa možda više ne postoji ili je pogrešno upisana. Probajte pretragu u izborniku ili otvorite jednu od ovih stranica.</p><div class="actions" style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:22px"><a class="btn primary" href="#/">Početna</a><a class="btn" href="#/pregled">Pregled</a><a class="btn" href="#/mapa-stranice">Mapa stranice</a></div></div>`;
}

/* ============ prikaz: Početna ============ */
function viewLanding(root) {
  let per = 'all';
  const nat = D.periods.all, topC = (p) => [...D.counties].sort((a, b) => b.ka2[p].projects_involved - a.ka2[p].projects_involved);
  const yrs = yearData(byYear()), full = yrs.filter((d) => !d.part), peak = [...full].sort((a, b) => b.y - a.y)[0], p1 = sum(yrs.filter((d) => d.x <= 2020).map((d) => d.y)), p2 = sum(yrs.filter((d) => d.x >= 2021).map((d) => d.y));
  const cl = nat.classes.slice(0, 6), ctr = partnerCounts(), ctop = Object.keys(ctr).sort((a, b) => ctr[b] - ctr[a]);
  const cov = (() => { const rows = D.coverage.filter((r) => r[0] === 'all' && r[1] === 'any' && ['primary', 'secondary', 'combined'].includes(r[3])), i = sum(rows.map((r) => r[4])), p = sum(rows.map((r) => r[5])); return i ? p / i : 0; })();
  const Q = [
    ['#/pregled', 'Pregled', 'Koliko ima projekata i tko ih koordinira?', 'Brojke, godišnji graf i poredak uz filtre.', `${fmt(nat.projects)} projekata`],
    ['#/mjesta', 'Županije', 'Gdje je aktivnost najgušća?', 'Interaktivna karta i poredak županija.', `Najviše: ${shortCounty(topC('all')[0])}, ${fmt(topC('all')[0].ka2.all.projects_involved)}`],
    ['#/pokrivenost', 'Pokrivenost škola', 'Sudjeluje li dovoljno škola u mojoj županiji?', 'Udio škola koje sudjeluju u KA2 projektima.', `${pct(cov, 0)} % škola na razini države`],
    ['#/drzave', 'Partnerske države', 'S kim Hrvatska surađuje?', 'Države s kojima dijelimo projekte.', `${ctop.length} država, najčešće ${country(ctop[0])}`],
    ['#/kronologija', 'Kroz vrijeme', 'Raste li broj projekata?', 'Po godinama, sektoru i vrsti projekta.', `Vrhunac ${peak.x}.: ${fmt(peak.y)} projekata`],
    ['#/projekti', 'Projekti i organizacije', 'Tko provodi projekte u mom sektoru i mjestu?', 'Pretraga po temi, sektoru, državi, nazivu i mjestu.', `${fmt(D.projects.length)} projekata, ${fmt(D.orgs.length)} organizacija`],
    ['#/teme', 'Teme i problemi', 'Koje se teme šire, a koje nestaju?', 'Teme kroz vrijeme, problemi i rješenja.', `${fmt(D.topics.topics.length)} tema`],
    ['#/graf', 'Mreža pojmova', 'Koji se pojmovi pojavljuju zajedno?', 'Pristupi, ciljne skupine, rezultati i problemi povezani u mrežu.', `${fmt(D.graph.nodes.length)} pojmova`],
    ['#/usporedba', 'Usporedba županija', 'Kako se razlikuju dvije županije?', 'Do četiri županije jedna uz drugu.', 'Pet pokazatelja odjednom']
  ];
  const sample = canned('Koje županije imaju najviše projekata?');
  const hm = heroMap(ctr, !heroReduce());
  const ST = [['collect', 'Prikupljamo', 'Javne podatke Europske komisije, Agencije za mobilnost i programe EU i školskih registara, od 2014. do danas.'], ['link', 'Povezujemo', 'Spajamo projekte, organizacije, županije, države i teme. Svaki projekt možete pratiti od naslova do partnera i mjesta.'], ['explain', 'Pojašnjavamo', 'Pokazatelji, karte i poredak uz jednostavne filtre. Rezultate izvozite u CSV, Excel ili PDF, a asistent odgovara samo iz podataka i navodi izvor.']];
  const FW = [['school', 'Školama', 'Saznajte tko u vašoj županiji već provodi projekte i s kime surađuje.'], ['people', 'Udrugama i mladima', 'Pronađite partnere u državama i temama koje vas zanimaju.'], ['pin', 'Gradovima i županijama', 'Uočite gdje je sudjelovanje slabo i gdje je potrebna potpora.'], ['doc', 'Novinarima i istraživačima', 'Otvoreni podaci s navedenim izvorima i izvozom za daljnju analizu.']];
  root.innerHTML = `
  <section class="band hero" id="hero"><div class="hero-bg" aria-hidden="true"><i></i></div><div class="hero-shade" aria-hidden="true"></div>
    <div class="hero-fx" aria-hidden="true"><b class="a1"></b><b class="a2"></b><b class="a3"></b><s></s></div>
    <div class="wrap hero-in">
      <div class="hero-copy">
        <div class="kicker hrise" style="--d:0">Erasmus+ KA2 partnerstva · 2014.–2026.</div>
        <h1 class="hrise" style="--d:1">Svaki Erasmus+ projekt počinje s <mark>pravim partnerom</mark></h1>
        <p class="lead hrise" style="--d:2">Erasmus+ Kompas je otvoreni atlas partnerstava hrvatskih škola, udruga i ustanova. Pokazuje tko već surađuje, gdje i na kojim temama, da lakše pronađete partnera, ideju ili prazninu koju vaš projekt može popuniti.</p>
        <div class="hrise" style="--d:3">${searchHTML('hero')}</div>
        <div class="hero-quick hrise" style="--d:4"><a href="#/mjesta">Karta županija</a><a href="#/pokrivenost">Pokrivenost škola</a><a href="#/drzave">Partnerske države</a></div>
        <div class="actions hrise" style="--d:5"><a class="btn primary" href="#/pregled">Istražite atlas ${hico('arrow', 18)}</a><button class="btn" type="button" id="l-ask">Pitaj asistenta</button></div>
        <p class="l-meta hrise" style="--d:6">Ažurirano <time translate="no" datetime="${D.meta.generated}">${fdate(D.meta.generated)}</time></p>
      </div>
      ${hm.html}
      <div class="hero-stats hrise" style="--d:7">
        <div><b class="cu" translate="no" data-to="${nat.projects}">${fmt(nat.projects)}</b><span>partnerstava</span></div>
        <div><b class="cu" translate="no" data-to="${ctop.length}">${fmt(ctop.length)}</b><span>država partnera</span></div>
        <div><b class="cu" translate="no" data-to="${D.meta.organisations}">${fmt(D.meta.organisations)}</b><span>organizacija</span></div>
        <div><b class="cu" translate="no" data-to="21">21</b><span>županija</span></div>
        </div>
    </div>
    <div class="hero-wave" aria-hidden="true"><i class="w1"></i><i class="w2"></i></div></section>

  <section class="band alt whatwe"><div class="wrap">
    <div class="secthead"><div><h2 class="l-h">Što radimo</h2><p class="l-sub">Podaci o Erasmus+ projektima objavljeni su na više mjesta i u oblicima koje je teško čitati zajedno. Mi ih spajamo na jedno mjesto i pretvaramo u odgovore na praktična pitanja.</p></div></div>
    <ol class="steps">${ST.map((t, i) => `<li class="step"><span class="sico">${hico(t[0], 26)}<em>${i + 1}</em></span><h3>${t[1]}</h3><p>${t[2]}</p></li>`).join('')}</ol>
    <h3 class="fw-h">Kome koristi</h3>
    <div class="forwho">${FW.map((t) => `<div class="fw">${hico(t[0], 22)}<div><b>${t[1]}</b><p>${t[2]}</p></div></div>`).join('')}</div>
  </div></section>

  <section class="band"><div class="wrap">
    <div class="secthead"><div><h2 class="l-h">Hrvatska u brojkama</h2><p class="l-sub">Ključni pokazatelji za odabrano programsko razdoblje.</p></div><div class="seg" id="lper" role="group" aria-label="Razdoblje">${Object.entries(LAB.period).map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === per}">${l}</button>`).join('')}</div></div>
    <div class="lstrip" id="strip" aria-live="polite"></div>
  </div></section>

  <section class="band alt"><div class="wrap">
    <div class="secthead"><div><h2 class="l-h">Kroz godine</h2><p class="l-sub">Koliko je KA2 projekata s hrvatskim sudionikom odabrano po godini poziva.</p></div><a class="btn sm" href="#/kronologija">Podjela po sektoru i vrsti →</a></div>
    <div class="grid two" style="margin-top:0"><div class="card"><div class="chartbox">${colChart(yrs, { mark: 2020, label: 'Projekti po godini poziva' })}</div></div>
    <div class="insight"><div class="fact"><b>${peak.x}.</b><span>godina s najviše projekata: ${fmt(peak.y)}</span></div><div class="fact"><b>${fmt(p1)} → ${fmt(p2)}</b><span>projekata u programu 2014.–2020. i dosad u programu 2021.–2027.</span></div><div class="fact"><b>${pct(nat.share_of_eu_ka2_projects, 1)} %</b><span>svih KA2 projekata u EU ima hrvatskog partnera</span></div></div></div>
  </div></section>

  <section class="band"><div class="wrap"><div class="grid cols3" style="margin-top:0">
    <article class="card"><div class="head"><h2>Županije s najviše projekata</h2></div><p class="lead">KA2 projekti sa sudionikom iz županije, 2014.–2026.</p>${rank(topC('all').slice(0, 6).map((c) => ({ label: shortCounty(c), v: c.ka2.all.projects_involved, text: fmt(c.ka2.all.projects_involved), href: '#/mjesta/' + encodeURIComponent(c.stem) })), { nonum: true, cls: 'compact', max: topC('all')[0].ka2.all.projects_involved })}<div class="cardfoot"><span>6 od 21 županije</span><a href="#/mjesta">Karta i cijeli poredak →</a></div></article>
    <article class="card"><div class="head"><h2>Tko koordinira iz Hrvatske</h2></div><p class="lead">Koordinirani projekti po vrsti organizacije (${fmt(nat.coordinated)} ukupno).</p>${rank(cl.map((c) => ({ label: LAB.cls[c.org_class] || c.org_class, v: c.projects_coordinated, text: fmt(c.projects_coordinated), st: pct(c.projects_coordinated / nat.coordinated, 0) + ' %' })), { nonum: true })}<div class="cardfoot"><span></span><a href="#/pregled">Pregled s filtrima →</a></div></article>
    <article class="card"><div class="head"><h2>S kojim državama surađujemo</h2></div><p class="lead">Broj zajedničkih projekata s organizacijama iz države.</p>${rank(ctop.slice(0, 6).map((c) => ({ label: country(c), v: ctr[c], text: fmt(ctr[c]) })), { nonum: true, cls: 'alt' })}<div class="cardfoot"><span></span><a href="#/drzave">Sve države →</a></div></article>
  </div></div></section>

  <section class="band alt"><div class="wrap">
    <div class="secthead"><div><h2 class="l-h">Što možete saznati</h2><p class="l-sub">Svaki odjeljak odgovara na jedno praktično pitanje.</p></div></div>
    <div class="qgrid">${Q.map((q, i) => `<a class="q" href="${q[0]}"><span class="no">${String(i + 1).padStart(2, '0')}</span><h3>${q[2]}</h3><p>${q[3]}</p><span class="live">${q[4]} →</span></a>`).join('')}</div>
  </div></section>

  <section class="band tint"><div class="wrap"><div class="askband">
    <div><div class="kicker">Asistent</div><h2 class="l-h" style="margin-top:12px">Imate pitanje o podacima?</h2><p class="l-sub">Poseban asistent odgovara na pitanja o projektima, organizacijama, županijama i temama. Odgovara samo iz podataka atlasa i uz svaki odgovor navodi izvor.</p>
      <form id="lask"><label class="sr" for="lq">Pitanje</label><div class="askrow"><input id="lq" maxlength="500" placeholder="Npr. Koje županije imaju najviše projekata?" autocomplete="off" required><button type="submit">Pitaj</button></div><div class="eg">${EX.slice(0, 3).map((e) => `<button type="button">${esc(e)}</button>`).join('')}</div></form></div>
    <div class="demo" aria-hidden="true"><div class="msg you">Koje županije imaju najviše projekata?</div><div class="msg bot"><span class="avatar"><svg width="18" height="18" viewBox="0 0 40 40"><path d="M20 4l5 16-5 16-5-16z" fill="#ffd617"/><path d="M4 20l16-5 16 5-16 5z" fill="#fff"/></svg></span><div class="bubble"><p>${esc(sample.text)}</p>${sample.rows ? rank(sample.rows.slice(0, 3).map((r) => ({ label: r[0], v: r[1], text: r[2] })), { nonum: true, cls: 'compact' }) : ''}<div class="srcrow">Izvori: ${sample.src.map(([l]) => `<span class="pill blue">${esc(l)}</span>`).join(' ')}</div></div></div></div>
  </div></div></section>

  <section class="band"><div class="wrap">
    <div class="secthead"><div><h2 class="l-h">Odakle podaci</h2><p class="l-sub">Svi izvori su javni. Atlas ih povezuje i izračunava pokazatelje, ništa se ne unosi ručno.</p></div><a class="btn sm" href="#/o-podacima">Izvori i ograničenja →</a></div>
    <div class="srcgrid">
      <article class="src"><a href="https://erasmus-plus.ec.europa.eu/projects/projects-lists" target="_blank" rel="noopener noreferrer">Erasmus+ Project Results Platform</a><small>Europska komisija</small><p>KA2 projekti 2014.–2020. i 2021.–2027.: naslovi, vrste, države i iznosi.</p></article>
      <article class="src"><a href="https://data.gov.hr/ckan/hr/dataset/program-erasmus-za-razdoblje-od-2021-do-2027-godine" target="_blank" rel="noopener noreferrer">Program Erasmus+ 2021.–2027.</a><small>Agencija za mobilnost i programe EU · data.gov.hr</small><p>Hrvatski sudionici i organizacije u projektima.</p></article>
      <article class="src"><a href="https://data.gov.hr/ckan/hr/dataset/osnovne-skole" target="_blank" rel="noopener noreferrer">Registri ustanova</a><small>Ministarstvo znanosti i obrazovanja · data.gov.hr</small><p>Dječji vrtići, osnovne i srednje škole te visoko obrazovanje, za izračun pokrivenosti.</p></article>
    </div>
  </div></section>`;
  function strip() {
    const p = D.periods[per], items = [['Projekata', fmt(p.projects), 'KA2 s hrvatskim sudionikom'], ['Koordinirano', fmt(p.coordinated), `${pct(p.coordinated / p.projects, 0)} % projekata`], ['Vrijednost', mil(p.value_involved_eur), 'svih tih projekata'], ['Udio u EU', pct(p.share_of_eu_ka2_projects, 1) + ' %', `od ${fmt(p.eu_ka2_projects)} KA2 projekata`]];
    $('#strip', root).innerHTML = items.map(([l, v, s]) => `<div><small>${l}</small><b>${v}</b><span>${s}</span></div>`).join('');
    $$('#lper button', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === per)));
  }
  $$('#lper button', root).forEach((b) => b.onclick = () => { per = b.dataset.v; strip(); }); strip();
  $('#l-ask', root).onclick = () => Assistant.open();
  $('#lask', root).onsubmit = (e) => { e.preventDefault(); const i = $('#lq', root); if (i.value.trim()) { Assistant.ask(i.value.trim()); i.value = ''; } };
  $$('.eg button', root).forEach((bt) => bt.onclick = () => Assistant.ask(bt.textContent));
  landingFX(root, { ctr, ranked: hm.ranked });
}

/* ============ asistent: odgovori izračunati iz podataka atlasa ============ */
const EX = ['Koje županije imaju najviše projekata?', 'Tko koordinira najviše projekata?', 'S kojim državama Hrvatska surađuje?', 'Koje su teme najčešće?'];
const CTX_PROMPTS = {
  pocetna: EX,
  pregled: ['Koliko je projekata koordinirano iz Hrvatske?', 'Kolika je ukupna vrijednost projekata?', 'Koji sektor ima najviše projekata?'],
  zupanije: ['Koje županije imaju najviše projekata?', 'Koliko projekata ima Splitsko-dalmatinska županija?', 'Koje županije imaju najbolju pokrivenost škola?'],
  trazi: ['Koje organizacije imaju najviše projekata?', 'Koliko je projekata bilo 2023.?', 'Koji sektor ima najviše projekata?'],
  teme: ['Koje su teme najčešće?', 'Koliko je projekata bilo 2023.?', 'S kojim državama Hrvatska surađuje?'],
  o: ['Odakle dolaze podaci?', 'Što znači koordinator?', 'Kolika je ukupna vrijednost projekata?']
};
const COUNTY_ALIAS = { osijek: 'Osječko-baranjska', rijeka: 'Primorsko-goranska', split: 'Splitsko-dalmatinska', zadar: 'Zadarska', dubrovnik: 'Dubrovačko-neretvanska', varazdin: 'Varaždinska', istra: 'Istarska', istria: 'Istarska', pula: 'Istarska', sibenik: 'Šibensko-kninska', slavonija: 'Osječko-baranjska', slavonia: 'Osječko-baranjska', zagreb: 'Grad Zagreb', 'city of zagreb': 'Grad Zagreb', 'split-dalmatia': 'Splitsko-dalmatinska', 'dubrovnik-neretva': 'Dubrovačko-neretvanska', 'primorje-gorski': 'Primorsko-goranska', 'osijek-baranja': 'Osječko-baranjska', 'sibenik-knin': 'Šibensko-kninska', 'vukovar-syrmia': 'Vukovarsko-srijemska', 'sisak-moslavina': 'Sisačko-moslavačka', 'brod-posavina': 'Brodsko-posavska', 'bjelovar-bilogora': 'Bjelovarsko-bilogorska', 'virovitica-podravina': 'Virovitičko-podravska', 'koprivnica-krizevci': 'Koprivničko-križevačka', 'krapina-zagorje': 'Krapinsko-zagorska', 'lika-senj': 'Ličko-senjska', 'pozega-slavonia': 'Požeško-slavonska', medimurje: 'Međimurska', karlovac: 'Karlovačka' };
function findCounty(f) {
  if (/zagrebacka|zagreb county/.test(f)) return countyBy('Zagrebačka');
  for (const c of D.counties) if (f.includes(fold(shortCounty(c))) || f.includes(fold(I18N.ent(shortCounty(c))))) return c;
  for (const [k, v] of Object.entries(COUNTY_ALIAS)) if (new RegExp('\\b' + k).test(f)) return countyBy(v);
  const words = f.split(/[^a-z]+/).filter((w) => w.length >= 5);
  for (const c of D.counties) { const parts = fold(c.label).split(/[\s-]+/); if (words.some((w) => parts.some((p) => p.startsWith(w.slice(0, 5))))) return c; }
  return null;
}
/* odgovori se računaju u jeziku sučelja (T = hrvatski ili engleski tekst), pa se pri promjeni jezika izračunaju ponovno */
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
function canned(q) {
  const f = fold(q), nat = D.periods.all, byC = (p) => [...D.counties].sort((a, b) => b.ka2[p].projects_involved - a.ka2[p].projects_involved);
  const T = (hr, en) => (LANG === 'en' ? en : hr), E = (s) => I18N.ent(s);
  const P1 = T('2014.–2020.', '2014–2020'), P2 = T('2021.–2027.', '2021–2027'), P0 = T('2014.–2026.', '2014–2026');
  const county = findCounty(f), year = (f.match(/\b(20[12]\d)\b/) || [])[1];
  const sector = (k) => E(LAB.sector[k]), cls = (k) => E(LAB.cls[k] || k);
  if (county) {
    const k = county.ka2.all, order = byC('all'), pos = order.findIndex((c) => c.stem === county.stem) + 1, name = E(county.label);
    return { text: T(`${county.label} ima ${fmt(k.projects_involved)} KA2 projekata sa sudionikom iz županije (${pos}. od ${order.length}), od toga ${fmt(k.projects_coordinated)} koordiniranih. U projektima sudjeluje ${fmt(k.organisations)} organizacija, a vrijednost projekata je ${mil(k.value_involved_eur)}.`,
      `${name} has ${fmt(k.projects_involved)} KA2 projects with a participant from the county (rank ${pos} of ${order.length}), of which ${fmt(k.projects_coordinated)} were coordinated from it. ${fmt(k.organisations)} organisations take part, and the projects are worth ${mil(k.value_involved_eur)}.`),
      rows: [[P1, county.ka2['2014-2020'].projects_involved, fmt(county.ka2['2014-2020'].projects_involved)], [P2, county.ka2['2021-2027'].projects_involved, fmt(county.ka2['2021-2027'].projects_involved)]],
      src: [[T('Stranica županije', 'County page'), '#/mjesta/' + encodeURIComponent(county.stem)], [T('Usporedba županija', 'Compare counties'), '#/usporedba']],
      steps: [T('Prepoznata županija: ', 'County recognised: ') + name, T('Tablica: pokazatelji županije, razdoblja 2014.–2020. i 2021.–2027.', 'Table: county indicators for 2014–2020 and 2021–2027'), T('Poredak po broju projekata sa sudionikom iz županije', 'Ranked by number of projects with a participant from the county')] };
  }
  if (/znaci|pojam|mean|defin|glossary/.test(f)) return { text: T('Koordinator je organizacija koja podnosi prijavu, vodi projekt i prima grant; partner sudjeluje u projektu koji netko drugi koordinira. KA2 je ključna aktivnost za suradnju organizacija kroz partnerstva. Ostale izraze objašnjava rječnik.', 'The coordinator is the organisation that submits the application, leads the project and receives the grant; a partner takes part in a project that someone else coordinates. KA2 is the key action for cooperation between organisations through partnerships. The glossary explains other terms.'), src: [[T('Rječnik pojmova', 'Glossary'), '#/rjecnik']], steps: [T('Tema: pojmovi', 'Topic: terms'), T('Stranica: Rječnik pojmova', 'Page: Glossary')] };
  if (year && byYear()[year] != null) {
    const m = byYear()[year], secs = {}; for (const r of D.rows) if (r[0] === +year) secs[r[2]] = (secs[r[2]] || 0) + r[4];
    return { text: T(`U godini poziva ${year}. odabrano je ${fmt(m)} KA2 projekata s hrvatskim sudionikom${+year >= 2026 ? ' (godina još traje, pa je broj nepotpun)' : ''}.`, `In the ${year} call year, ${fmt(m)} KA2 projects with a Croatian participant were selected${+year >= 2026 ? ' (the year is still in progress, so the number is incomplete)' : ''}.`),
      rows: Object.keys(secs).sort((a, b) => secs[b] - secs[a]).slice(0, 5).map((k) => [LAB.sector[k], secs[k], fmt(secs[k])]), src: [[T('Kroz vrijeme', 'Over time'), '#/kronologija'], [T('Projekti', 'Projects'), '#/projekti']],
      steps: [T('Prepoznata godina: ', 'Year recognised: ') + year, T('Tablica: projekti po godini, sektoru i vrsti', 'Table: projects by year, sector and type'), T('Zbroj po sektoru za ' + year + '.', 'Total by sector for ' + year + '.')] };
  }
  if (/koordin|coordinat/.test(f)) {
    const cl = nat.classes.slice(0, 5);
    return { text: T(`Najviše projekata koordiniraju ${lc(cls(cl[0].org_class))} (${fmt(cl[0].projects_coordinated)}), zatim ${lc(cls(cl[1].org_class))} (${fmt(cl[1].projects_coordinated)}). Ukupno je ${fmt(nat.coordinated)} koordiniranih projekata.`, `Most projects are coordinated by ${lc(cls(cl[0].org_class))} (${fmt(cl[0].projects_coordinated)}), followed by ${lc(cls(cl[1].org_class))} (${fmt(cl[1].projects_coordinated)}). There are ${fmt(nat.coordinated)} coordinated projects in total.`),
      rows: cl.map((c) => [LAB.cls[c.org_class] || c.org_class, c.projects_coordinated, fmt(c.projects_coordinated)]), src: [[T('Pregled', 'Overview'), '#/pregled'], [T('Organizacije', 'Organisations'), '#/organizacije']],
      steps: [T('Tema: koordinacija projekata', 'Topic: project coordination'), T('Tablica: vrste organizacija, razdoblje 2014.–2026.', 'Table: organisation types, 2014–2026'), T('Poredak po broju koordiniranih projekata', 'Ranked by number of coordinated projects')] };
  }
  if (/organizacij|ustanov|sveucilist|skol.*najvise|najvise.*skol|organi[sz]ation|universit|institution/.test(f) && !/pokrivenost|coverage/.test(f)) {
    const top = [...D.orgs].sort((a, b) => b[5] - a[5]).slice(0, 5);
    return { text: T(`Najviše KA2 projekata ima ${top[0][1]} (${fmt(top[0][5])}), zatim ${top[1][1]} (${fmt(top[1][5])}).`, `The most KA2 projects belong to ${top[0][1]} (${fmt(top[0][5])}), followed by ${top[1][1]} (${fmt(top[1][5])}).`),
      rows: top.map((o) => [o[1], o[5], fmt(o[5])]), src: [[T('Organizacije', 'Organisations'), '#/organizacije'], [top[0][1], '#/organizacije/' + encodeURIComponent(top[0][0])]],
      steps: [T('Tema: organizacije', 'Topic: organisations'), T(`Tablica: ${fmt(D.orgs.length)} hrvatskih organizacija`, `Table: ${fmt(D.orgs.length)} Croatian organisations`), T('Poredak po ukupnom broju projekata', 'Ranked by total number of projects')] };
  }
  if (/pokrivenost|skol|coverage|school/.test(f)) {
    const rate = (c) => { const rows = D.coverage.filter((r) => r[0] === 'all' && r[1] === 'any' && r[2] === c.stem && ['primary', 'secondary', 'combined'].includes(r[3])), i = sum(rows.map((r) => r[4])), p = sum(rows.map((r) => r[5])); return i ? [p / i, p, i] : [0, 0, 0]; };
    const all = D.counties.map((c) => ({ c, r: rate(c) })).filter((x) => x.r[2] > 0).sort((a, b) => b.r[0] - a.r[0]), P = sum(all.map((x) => x.r[1])), I = sum(all.map((x) => x.r[2]));
    return { text: T(`Na razini države u KA2 projektima sudjelovalo je ${pct(P / I, 0)} % osnovnih i srednjih škola (${fmt(P)} od ${fmt(I)}). Najviši udio ima ${all[0].c.label} (${Math.round(all[0].r[0] * 100)} %). Udjeli su procjene jer se škole s registrom povezuju prema nazivu i poštanskom broju.`,
      `Nationwide, ${pct(P / I, 0)}% of primary and secondary schools (${fmt(P)} of ${fmt(I)}) have taken part in KA2 projects. The highest share is in ${E(all[0].c.label)} (${Math.round(all[0].r[0] * 100)}%). The shares are estimates because schools are matched to the register by name and postcode.`),
      rows: all.slice(0, 5).map((x) => [shortCounty(x.c), x.r[0], Math.round(x.r[0] * 100) + ' %']), src: [[T('Pokrivenost škola', 'School coverage'), '#/pokrivenost'], [T('O podacima', 'About the data'), '#/o-podacima']],
      steps: [T('Tema: pokrivenost škola', 'Topic: school coverage'), T('Tablica: škole po županiji, osnovne + srednje, svi razdoblja', 'Table: schools by county, primary + secondary, all periods'), T('Udio = škole koje sudjeluju / sve škole', 'Share = participating schools / all schools')] };
  }
  if (/zemlj|drzav|surad|partner|countr|cooperat|collaborat/.test(f)) {
    const m = partnerCounts(), top = Object.keys(m).sort((a, b) => m[b] - m[a]).slice(0, 6), hr = D.countries.find((r) => r.country === 'HR');
    return { text: T(`Hrvatske organizacije najčešće dijele projekte s organizacijama iz: ${top.slice(0, 3).map((c) => `${country(c)} (${fmt(m[c])})`).join(', ')}.${hr ? ` U razdoblju 2021.–2027. Hrvatska je ${hr.rank}. po broju koordiniranih KA2 projekata (${fmt(hr.coordinated_projects)}).` : ''}`,
      `Croatian organisations most often share projects with organisations from: ${top.slice(0, 3).map((c) => `${country(c)} (${fmt(m[c])})`).join(', ')}.${hr ? ` In 2021–2027 Croatia ranks ${hr.rank} by the number of coordinated KA2 projects (${fmt(hr.coordinated_projects)}).` : ''}`),
      rows: top.map((c) => [country(c), m[c], fmt(m[c])]), src: [[T('Partnerske države', 'Partner countries'), '#/drzave']],
      steps: [T('Tema: partnerske države', 'Topic: partner countries'), T('Tablica: popis projekata s državama sudionicima', 'Table: list of projects with participating countries'), T('Broj projekata po državi, bez Hrvatske', 'Number of projects per country, excluding Croatia')] };
  }
  if (/\btem|digital|okolis|klim|topic|theme|climate|environment/.test(f)) {
    const T0 = D.topics, y = 2025, ok = (t) => t.scope === 'both' || t.scope === 'new', sh = (t) => 100 * (t.counts[String(y)] || 0) / T0.projects_with_topics[String(y)], top = T0.topics.filter(ok).sort((a, b) => sh(b) - sh(a)).slice(0, 5), nm = (t) => bi(t.name, t.hr);
    return { text: T(`U projektima iz ${y}. najčešće su teme: ${top.slice(0, 3).map((t) => `${nm(t).toLowerCase()} (${dec(sh(t))} %)`).join(', ')}. Cijeli razvoj kroz godine vidi se u odjeljku Teme.`, `In projects from ${y}, the most common topics are: ${top.slice(0, 3).map((t) => `${lc(nm(t))} (${dec(sh(t))}%)`).join(', ')}. The full development over the years is in the Topics section.`),
      rows: top.map((t) => [nm(t), sh(t), dec(sh(t)) + ' %']), src: [[T('Teme kroz vrijeme', 'Topics over time'), '#/teme'], [T('Mreža pojmova', 'Concept network'), '#/graf']],
      steps: [T('Tema: teme projekata', 'Topic: project topics'), T('Tablica: udio tema po godini, popis 2021.–2027.', 'Table: share of topics by year, 2021–2027 list'), T('Udio projekata godine ' + y + '. s temom', 'Share of ' + y + ' projects with the topic')] };
  }
  if (/vrijednost|novac|\beura?\b|iznos|grant|sredstv|value|money|funding|amount|\beuros?\b/.test(f)) {
    const p1 = D.periods['2014-2020'], p2 = D.periods['2021-2027'];
    return { text: T(`Ukupna vrijednost KA2 projekata s hrvatskim sudionikom je ${mil(nat.value_involved_eur)}. Iznos je dodijeljen po projektu pri odabiru i nije podijeljen među partnere.`, `The total value of KA2 projects with a Croatian participant is ${mil(nat.value_involved_eur)}. The amount is awarded per project at selection and is not split between partners.`),
      rows: [[P1, p1.value_involved_eur, mil(p1.value_involved_eur)], [P2, p2.value_involved_eur, mil(p2.value_involved_eur)]], src: [[T('Pregled', 'Overview'), '#/pregled'], [T('Rječnik', 'Glossary'), '#/rjecnik']],
      steps: [T('Tema: vrijednost projekata', 'Topic: project value'), T('Tablica: razdoblja, zbroj vrijednosti', 'Table: periods, sum of values'), T('Bez dijeljenja iznosa među partnere', 'Amounts are not split between partners')] };
  }
  if (/sektor|sector/.test(f)) {
    const s = {}; for (const r of D.rows) s[r[2]] = (s[r[2]] || 0) + r[4]; const k = Object.keys(s).sort((a, b) => s[b] - s[a]);
    return { text: T(`Najviše projekata je u sektoru „${sector(k[0])}” (${fmt(s[k[0]])}), zatim „${sector(k[1])}” (${fmt(s[k[1]])}).`, `Most projects are in the “${sector(k[0])}” sector (${fmt(s[k[0]])}), followed by “${sector(k[1])}” (${fmt(s[k[1]])}).`),
      rows: k.slice(0, 5).map((x) => [LAB.sector[x], s[x], fmt(s[x])]), src: [[T('Kroz vrijeme', 'Over time'), '#/kronologija'], [T('Pregled', 'Overview'), '#/pregled']],
      steps: [T('Tema: sektori', 'Topic: sectors'), T('Tablica: projekti po sektoru i godini', 'Table: projects by sector and year'), T('Zbroj 2014.–2026.', 'Total 2014–2026')] };
  }
  if (/zupanij|regij|najvise projekata|most projects|karta|count(y|ies)|region|\bmap\b/.test(f)) {
    const cs = byC('all').slice(0, 5);
    return { text: T(`Po broju projekata prednjače ${cs.slice(0, 3).map((c) => `${c.label} (${fmt(c.ka2.all.projects_involved)})`).join(', ')}.`, `By number of projects, the leaders are ${cs.slice(0, 3).map((c) => `${E(c.label)} (${fmt(c.ka2.all.projects_involved)})`).join(', ')}.`),
      rows: cs.map((c) => [shortCounty(c), c.ka2.all.projects_involved, fmt(c.ka2.all.projects_involved)]), src: [[T('Županije', 'Counties'), '#/mjesta'], [T('Usporedba županija', 'Compare counties'), '#/usporedba']],
      steps: [T('Tema: županije', 'Topic: counties'), T('Tablica: županije, razdoblje 2014.–2026.', 'Table: counties, 2014–2026'), T('Poredak po broju projekata sa sudionikom iz županije', 'Ranked by number of projects with a participant from the county')] };
  }
  if (/koliko|ukupno|projekata|how many|total|projects/.test(f)) {
    const p1 = D.periods['2014-2020'], p2 = D.periods['2021-2027'];
    return { text: T(`Atlas obuhvaća ${fmt(nat.projects)} KA2 projekata s hrvatskim sudionikom, što je ${pct(nat.share_of_eu_ka2_projects)} % svih KA2 projekata u EU. Hrvatske organizacije koordinirale su ${fmt(nat.coordinated)} projekata.`, `The atlas covers ${fmt(nat.projects)} KA2 projects with a Croatian participant, which is ${pct(nat.share_of_eu_ka2_projects)}% of all KA2 projects in the EU. Croatian organisations coordinated ${fmt(nat.coordinated)} projects.`),
      rows: [[P1, p1.projects, fmt(p1.projects)], [P2, p2.projects, fmt(p2.projects)]], src: [[T('Pregled', 'Overview'), '#/pregled'], [T('Projekti', 'Projects'), '#/projekti']],
      steps: [T('Tema: ukupni broj projekata', 'Topic: total number of projects'), T('Tablica: nacionalni pokazatelji po razdobljima', 'Table: national indicators by period')] };
  }
  if (/izvor|odakle|podac|source|where|data/.test(f)) return { text: T('Podaci dolaze iz tri javna izvora: Erasmus+ Project Results Platform (Europska komisija), portala data.gov.hr (Agencija za mobilnost i programe EU) i registara škola Ministarstva znanosti i obrazovanja. Atlas ih povezuje i izračunava pokazatelje, ništa se ne unosi ručno.', 'The data comes from three public sources: the Erasmus+ Project Results Platform (European Commission), the data.gov.hr portal (Agency for Mobility and EU Programmes) and the school registers of the Ministry of Science and Education. The atlas links them and calculates the indicators; nothing is entered by hand.'), src: [[T('O podacima', 'About the data'), '#/o-podacima']], steps: [T('Tema: izvori podataka', 'Topic: data sources'), T('Stranica: O podacima', 'Page: About the data')] };
  return { text: T('Na to pitanje u podacima atlasa nemam odgovor. Mogu odgovoriti o županijama, organizacijama, partnerskim državama, temama, sektorima, vrijednosti projekata i pokrivenosti škola. Probajte jedno od predloženih pitanja.', 'I have no answer to that question in the atlas data. I can answer about counties, organisations, partner countries, topics, sectors, project value and school coverage. Try one of the suggested questions.'), src: [[T('Mapa stranice', 'Site map'), '#/mapa-stranice']], steps: [T('Pitanje nije prepoznato među temama atlasa', 'The question was not recognised among the atlas topics')], none: true };
}

/* ============ pravi asistent (neobavezno) ============
   Zadano: ako je stranica posluzena preko http(s) i <api>/health odgovara, pitanja idu na POST <api>/ask
   (isti ugovor kao u repozitoriju: {question,last_org_id} -> {answer,citations,tools,route,fallback,last_org_id}).
   Inace (file://, nema API-ja, Ollama ne radi) asistent odgovara iz ugrađenih izračuna nad podacima.
   Postavke prije učitavanja skripte:  window.EK_ASK_API = '/api/ask'  (adresa)  |  false  (uvijek ugrađeni odgovori). */
const AskAPI = (() => {
  let lastOrg = null, probe = null;
  const url = () => { const c = window.EK_ASK_API; if (c === false) return null; if (typeof c === 'string' && c) return c; return /^https?:$/.test(location.protocol) ? '/api/ask' : null; };
  const tmo = (ms) => { const c = new AbortController(); return [c.signal, setTimeout(() => c.abort(), ms)]; };
  function available() {
    if (probe) return probe; const u = url();
    probe = !u ? Promise.resolve(null) : (async () => { const [sig, t] = tmo(2500); try { const r = await fetch(u.replace(/\/ask\/?$/, '') + '/health', { signal: sig }); return r.ok ? u : null; } catch (e) { return null; } finally { clearTimeout(t); } })();
    probe.then((a) => { document.documentElement.dataset.ask = a ? 'api' : 'demo'; if (a && window.console) console.info('[Erasmus+ Kompas] Asistent koristi API: ' + a); });
    return probe;
  }
  const link = (c) => {
    const i = c.indexOf(':'), k = c.slice(0, i), id = c.slice(i + 1);
    if (k === 'org') { const o = D.orgs.find((x) => x[0] === id); return [o ? o[1] : id.replace(/^(OID|MZO)-/, ''), '#/organizacije/' + encodeURIComponent(id)]; }
    if (k === 'project') { const p = D.projects.find((x) => x[0] === id); return [p ? p[1] : id, '#/projekti/' + encodeURIComponent(id)]; }
    if (k === 'county') { const z = countyBy(id); return [z ? shortCounty(z) : id, '#/mjesta/' + encodeURIComponent(id)]; }
    if (k === 'concept') return [id.replace(/^TOP:/, ''), '#/graf'];
    return [c, '#/o-podacima'];
  };
  /* vraća null (ugrađeni odgovori) | {real} | {msg} | {down} */
  async function ask(q) {
    const u = await available(); if (!u) return null;
    const [sig, t] = tmo(120000);
    try {
      const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, last_org_id: lastOrg, lang: document.documentElement.lang === 'en' ? 'en' : 'hr' }), signal: sig });
      if (r.status === 429) return { msg: 'Previše upita u kratkom vremenu. Pričekajte minutu i pokušajte ponovno.' };
      if (r.status === 503) return { msg: 'Asistent je trenutno zauzet. Pokušajte ponovno za nekoliko trenutaka.' };
      if (!r.ok) return { down: true };
      const a = await r.json(); lastOrg = a.last_org_id || lastOrg;
      const tools = (a.tools || []).map((x) => x.tool + '(' + Object.entries(x.args || {}).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => k + '=' + v).join(', ') + ')');
      return { real: { real: true, text: String(a.answer || ''), src: (a.citations || []).map(link), steps: [(a.route ? 'route: ' + a.route : ''), ...tools].filter(Boolean), fallback: !!a.fallback } };
    } catch (e) { return { down: true }; } finally { clearTimeout(t); }
  }
  return { ask, available, forget: () => { lastOrg = null; } };
})();
if (/^https?:$/.test(location.protocol)) AskAPI.available();

const Assistant = (() => {
  const dock = $('#dock'), tab = $('#edgetab'), thread = [], mounts = new Set();
  let busy = false, ctx = { key: 'pocetna', title: 'Početna' };
  const AV = '<span class="avatar" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 40 40"><path d="M20 4l5 16-5 16-5-16z" fill="#ffd617"/><path d="M4 20l16-5 16 5-16 5z" fill="#fff"/></svg></span>';
  const prompts = () => { const a = CTX_PROMPTS[ctx.key] || EX; return [...new Set([...a, ...EX])].slice(0, 4); };
  const welcome = () => `<div class="welcome"><div><h3>Što vas zanima?</h3><p>Odgovaram na pitanja o projektima, organizacijama, županijama, državama i temama. Brojke računam iz podataka atlasa i uz odgovor navodim izvor.</p></div><div class="sug">${prompts().map((p) => `<button type="button" data-q="${esc(p)}">${esc(p)}</button>`).join('')}</div></div>`;
  const ans = (m) => { if (!m.done) return null; if (m.real) return m.real; if (m.msg) return { text: m.msg, src: [], err: true }; if (!m.c || m.c.l !== LANG) m.c = { l: LANG, a: canned(m.q) }; return m.down ? { ...m.c.a, note: 'Asistent s modelom trenutno nije dostupan. Prikazan je odgovor izračunan izravno iz podataka.' } : m.c.a; };
  const msg = (m) => { const a = ans(m); return `<div class="msg you">${esc(m.q)}</div>` + (a ? `<div class="msg bot">${AV}<div class="bubble"><p${a.real ? ' class="real"' : ''}>${esc(a.text)}</p>${a.fallback ? '<p class="small muted">Odgovor nije u potpunosti potvrđen podacima.</p>' : ''}${a.note ? `<p class="small muted">${esc(a.note)}</p>` : ''}${a.rows ? rank(a.rows.map((r) => ({ label: r[0], v: r[1], text: r[2] })), { nonum: true, cls: 'compact' }) : ''}${a.steps ? `<details><summary>Kako je izračunano</summary><ol>${a.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details>` : ''}${a.src && a.src.length ? `<div class="srcrow"><span>Izvori:</span>${a.src.map(([l, h]) => `<a href="${h}">${esc(l)}</a>`).join('')}</div>` : ''}</div></div>` : `<div class="msg bot">${AV}<div class="bubble"><div class="typing" role="status"><i></i><i></i><i></i><span>Tražim u podacima…</span></div></div></div>`); };
  function paint() { for (const m of mounts) { m.log.innerHTML = `<div class="msgs">${thread.length ? thread.map(msg).join('') : ''}</div>` + (thread.length ? '' : welcome()); m.log.scrollTop = m.log.scrollHeight; } $$('.sug button[data-q]').forEach((b) => b.onclick = () => ask(b.dataset.q)); const c = $('#dock-ctx'); if (c) c.innerHTML = `<span class="ctx">Gledate: <b>${esc(ctx.title)}</b></span>`; }
  function mount(log, form, input, go) {
    const m = { log, go }; mounts.add(m);
    form.addEventListener('submit', (e) => { e.preventDefault(); const q = input.value.trim(); if (q) { input.value = ''; input.style.height = 'auto'; ask(q); } });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; });
    paint(); return () => mounts.delete(m);
  }
  function ask(q) {
    if (busy) return; if (curHash() !== '#/pitajte') open(false);
    busy = true; mounts.forEach((m) => (m.go.disabled = true)); const t = { q, done: false }; thread.push(t); paint();
    const t0 = Date.now(), fin = () => { t.done = true; busy = false; mounts.forEach((m) => (m.go.disabled = false)); paint(); };
    AskAPI.ask(q).catch(() => ({ down: true })).then((r) => { if (r) Object.assign(t, r); setTimeout(fin, r && !r.down ? 0 : Math.max(0, 650 - (Date.now() - t0))); });
  }
  const scrimUpdate = () => { $('#scrim').hidden = !(document.body.classList.contains('navopen') || (document.body.classList.contains('dockopen') && innerWidth < 1500)); };
  function open(focus = true) { document.body.classList.add('dockopen'); tab.setAttribute('aria-expanded', 'true'); scrimUpdate(); if (document.body.classList.contains('navopen')) setNav(false); if (focus) setTimeout(() => $('#dock-q').focus(), 30); }
  function close() { if (!document.body.classList.contains('dockopen')) return; document.body.classList.remove('dockopen'); tab.setAttribute('aria-expanded', 'false'); scrimUpdate(); (tab.offsetParent ? tab : $('#side-ask')).focus(); }
  const unmountDock = mount($('#dock-log'), $('#dock-form'), $('#dock-q'), $('#dock-go'));
  tab.onclick = () => open(); $('#side-ask').onclick = () => { setNav(false); open(); }; $('#tb-ask').onclick = () => open(); $('#dock-close').onclick = close;
  $('#dock-new').onclick = () => { if (!busy) { thread.length = 0; AskAPI.forget(); paint(); $('#dock-q').focus(); } };
  $('#scrim').onclick = () => { setNav(false); close(); };
  dock.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  addEventListener('resize', scrimUpdate);
  return { ask, open, close, hide: () => { document.body.classList.remove('dockopen'); tab.setAttribute('aria-expanded', 'false'); scrimUpdate(); }, mount, repaint: paint, setContext: (key, title) => { ctx = { key, title }; paint(); }, reset: () => { if (!busy) { thread.length = 0; AskAPI.forget(); paint(); } } };
})();
// zadržano zbog kompatibilnosti s ranijim pozivima
window.askWidget = (q) => Assistant.ask(q);

function viewPitajte(root) {
  const TOP = [['Županije', ['Koje županije imaju najviše projekata?', 'Koliko projekata ima Splitsko-dalmatinska županija?']], ['Organizacije', ['Tko koordinira najviše projekata?', 'Koje organizacije imaju najviše projekata?']], ['Države i teme', ['S kojim državama Hrvatska surađuje?', 'Koje su teme najčešće?']], ['Brojke i pojmovi', ['Kolika je ukupna vrijednost projekata?', 'Koliko je projekata bilo 2023.?', 'Što znači koordinator?']]];
  root.innerHTML = `${head('Pitajte · Asistent', 'Asistent za pitanja o podacima', 'Poseban asistent koji odgovara na pitanja o ovim podacima: projektima, organizacijama, županijama, državama i temama. Odgovara samo iz podataka atlasa i uz svaki odgovor navodi izvore.')}
  <div class="fullchat"><section class="chatcol" aria-label="Razgovor s asistentom"><div class="chathead"><span class="avatar" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 40 40"><path d="M20 4l5 16-5 16-5-16z" fill="#ffd617"/><path d="M4 20l16-5 16 5-16 5z" fill="#fff"/></svg></span><div><b>Kompas asistent</b><small>Odgovara iz podataka atlasa, uz izvore</small></div><button type="button" class="ic" id="pnew" title="Novi razgovor" aria-label="Novi razgovor" style="margin-left:auto"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8"/><path d="M3 3v5h5"/></svg></button></div>
    <div class="chatlog" id="pl" role="log" aria-live="polite"></div>
    <form id="pf"><label class="sr" for="pq">Pitanje</label><div class="composer"><textarea id="pq" rows="1" maxlength="500" placeholder="Upišite pitanje o podacima…" required></textarea><button class="send" type="submit" id="pg" aria-label="Pošalji"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div></form></section>
  <aside class="topics card" aria-label="Što možete pitati"><h2>Što možete pitati</h2>${TOP.map(([t, qs]) => `<div><h3>${t}</h3><div class="sug">${qs.map((q) => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`).join('')}<p class="small muted">Asistent ne zna ništa izvan ovih podataka i može pogriješiti. Provjerite izvore ispod odgovora.</p></aside></div>`;
  const off = Assistant.mount($('#pl', root), $('#pf', root), $('#pq', root), $('#pg', root));
  route.cleanup = off; $('#pnew', root).onclick = () => Assistant.reset();
  $$('.topics .sug button', root).forEach((b) => b.onclick = () => Assistant.ask(b.dataset.q));
}

/* ============ glue: the prototype's views run inside real pages of the Astro site ============
   The Astro page supplies the frame, the address and the language; this file replaces the prototype's hash router.
   - route: the views hang their clean-up here (route.cleanup)
   - go(h): a '#/...' address of the prototype becomes a real address of the site
   - EK.mount(view, arg): draws one view into #view and keeps its links real */
const route = {};
let curHashValue = '#/';
const curHash = () => curHashValue;
const setNav = (o) => { document.body.classList.toggle('navopen', !!o); const sc = $('#scrim'); if (sc) sc.hidden = !(o || (document.body.classList.contains('dockopen') && innerWidth < 1500)); const m = $('#menu'); if (m) m.setAttribute('aria-expanded', String(!!o)); };
const paintDate = () => {};
const NAVS = [];
const subOn = () => false;

const EK_BASE = (document.body.dataset.base || '').replace(/\/$/, '');
const EK_SLUG = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/* '#/mjesta/Split' -> '/hr/places/split/' */
const EK_ROUTES = [
  [/^#\/?$/, () => '/'], [/^#\/pregled$/, () => '/overview/'], [/^#\/kronologija$/, () => '/timeline/'], [/^#\/drzave$/, () => '/countries/'],
  [/^#\/mjesta$/, () => '/places/'], [/^#\/mjesta\/(.+)$/, (m) => '/places/' + EK_SLUG(decodeURIComponent(m[1])) + '/'],
  [/^#\/usporedba$/, () => '/compare/'], [/^#\/pokrivenost$/, () => '/coverage/'],
  [/^#\/projekti$/, () => '/projects/'], [/^#\/projekti\/(.+)$/, (m) => '/projects/' + EK_SLUG(decodeURIComponent(m[1])) + '/'],
  [/^#\/organizacije$/, () => '/organisations/'], [/^#\/organizacije\/(.+)$/, (m) => '/organisations/' + EK_SLUG(decodeURIComponent(m[1])) + '/'],
  [/^#\/teme$/, () => '/topics/'], [/^#\/(pristupi|metodologija)$/, () => '/problems/'], [/^#\/graf$/, () => '/graph/'], [/^#\/pitajte$/, () => '/ask/'],
  [/^#\/o-podacima$/, () => '/about/'], [/^#\/rjecnik$/, () => '/glossary/'], [/^#\/preuzimanje$/, () => '/downloads/'],
  [/^#\/pristupacnost$/, () => '/accessibility/'], [/^#\/kontakt$/, () => '/contact/'], [/^#\/mapa-stranice$/, () => '/sitemap/']
];
function ekUrl(h) {
  for (const [re, f] of EK_ROUTES) { const m = h.match(re); if (m) return `${EK_BASE}/${LANG}${f(m)}`; }
  return h;
}
function go(h) { location.href = ekUrl(h); }
/* "carry a value to the next page": the prototype passes it in memory between routes; here through the session */
(() => {
  let pre = null; try { pre = JSON.parse(sessionStorage.getItem('ek-pre') || 'null'); sessionStorage.removeItem('ek-pre'); } catch (e) { /* no storage */ }
  Object.defineProperty(window, '__pre', { get: () => pre, set: (v) => { pre = v; try { sessionStorage.setItem('ek-pre', JSON.stringify(v)); } catch (e) { /* no storage */ } }, configurable: true });
})();

/* detail pages: the address holds the slug, the views want the real id */
const bySlug = (list, key, s) => { const f = list.find((x) => EK_SLUG(key(x)) === s); return f ? key(f) : s; };
const detail = (fn, list, key) => (root, a) => { const s = a && a[1] || ''; fn(root, bySlug(list(), key, s)); };
const EK_VIEWS = {
  project: [detail(viewProjekt, () => D.projects, (x) => x[0]), '#/projekti'], org: [detail(viewOrganizacija, () => O(), (x) => x.id), '#/organizacije'],
  county: [detail(viewZupanija, () => D.counties, (x) => x.stem), '#/mjesta'], graph: [viewGraf, '#/graf'],
  landing: [viewLanding, '#/'], overview: [viewPregled, '#/pregled'], timeline: [viewKronologija, '#/kronologija'], countries: [viewDrzave, '#/drzave'],
  places: [viewMjesta, '#/mjesta'], compare: [viewUsporedba, '#/usporedba'], coverage: [viewPokrivenost, '#/pokrivenost'],
  projects: [viewProjekti, '#/projekti'], organisations: [viewOrganizacije, '#/organizacije'], topics: [viewTeme, '#/teme'], problems: [viewProblemi, '#/pristupi'],
  ask: [viewPitajte, '#/pitajte'], about: [viewOPodacima, '#/o-podacima'], glossary: [viewRjecnik, '#/rjecnik'], downloads: [viewPreuzimanje, '#/preuzimanje'],
  accessibility: [viewPristupacnost, '#/pristupacnost'], contact: [viewKontakt, '#/kontakt'], sitemap: [viewMapaStranice, '#/mapa-stranice'], notfound: [viewNotFound, '#/404']
};
const EK_VIEWKEY = { project: 'trazi', org: 'trazi', county: 'zupanije', graph: 'teme', landing: 'pocetna', overview: 'pregled', timeline: 'pregled', countries: 'pregled', places: 'zupanije', compare: 'zupanije', coverage: 'zupanije', projects: 'trazi', organisations: 'trazi', topics: 'teme', problems: 'teme', ask: 'pitajte', about: 'o', glossary: 'o', downloads: 'o' };

/* every '#/...' link the views write becomes a real link, also in what they draw later (filters, "show more") */
function ekLinks(root) {
  root.querySelectorAll('a[href^="#/"]').forEach((a) => { a.setAttribute('href', ekUrl(a.getAttribute('href'))); });
}
const EK = {
  lang: document.documentElement.lang === 'en' ? 'en' : 'hr', current: null,
  mount(name, arg) {
    const root = $('#view'); if (!root) return;
    const entry = EK_VIEWS[name]; if (!entry) return;
    curHashValue = entry[1];
    if (route.cleanup) { route.cleanup(); route.cleanup = null; }
    document.body.classList.toggle('landing', name === 'landing');
    root.innerHTML = '';
    const holder = document.createElement('div'); root.append(holder);
    try { entry[0](holder, arg ? [null, arg] : null); initSearch(root); } catch (e) { holder.innerHTML = `<div class="note">${esc(e.message)}</div>`; console.error(e); }
    ekLinks(root); root.setAttribute('aria-busy', 'false'); root.querySelectorAll('pre').forEach((el) => { el.tabIndex = 0; el.setAttribute('role', 'region'); if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', document.body.dataset.scrollable || 'Code'); });
    new MutationObserver(() => ekLinks(root)).observe(root, { childList: true, subtree: true });
    Assistant.setContext(EK_VIEWKEY[name] || 'o', name);
    if (name === 'ask') Assistant.hide();
    if (window.__pre) { const pr = window.__pre; window.__pre = null; const el = $(pr.sel, holder); if (el) { el.value = pr.value; el.dispatchEvent(new Event(pr.ev || 'input', { bubbles: true })); } }
    this.current = name;
  },
  /* the assistant works on every page: the frame asks for it, the first call loads the engine */
  assistant() { return Assistant; }
};
/* language: the page decides, the dictionary translates what the views draw */
if (EK.lang === 'en') I18N.setLang('en', { force: true });
window.EK = EK;

})();

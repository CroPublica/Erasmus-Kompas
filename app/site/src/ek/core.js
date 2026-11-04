const D = /*__DATA__*/null;
D.geo = /*__GEO__*/null;

/* jezik sučelja: 'hr' ili 'en' (prijevodi su u i18n.js) */
let LANG = 'hr';
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
/* [ključ odjeljka, adresa, naslov, ikona, [podstranice: naslov, adresa]] — sve podstranice vidljive su odmah */
const NAVS = [
  ['pocetna', '#/', 'Početna', 'home', []],
  ['pregled', '#/pregled', 'Pregled', 'dash', [['Ključni pokazatelji', '#/pregled'], ['Kroz vrijeme', '#/kronologija'], ['Partnerske države', '#/drzave']]],
  ['zupanije', '#/mjesta', 'Županije', 'pin', [['Karta i poredak', '#/mjesta'], ['Usporedba županija', '#/usporedba'], ['Pokrivenost škola', '#/pokrivenost']]],
  ['teme', '#/teme', 'Teme i problemi', 'hash', [['Teme kroz vrijeme', '#/teme'], ['Problemi i rješenja', '#/pristupi'], ['Mreža pojmova', '#/graf']]],
  ['trazi', '#/projekti', 'Projekti i organizacije', 'folder', [['Projekti', '#/projekti'], ['Organizacije', '#/organizacije']]],
  ['pitajte', '#/pitajte', 'Asistent', 'chat', []],
  ['o', '#/o-podacima', 'Informacije', 'info', [['O podacima', '#/o-podacima'], ['Rječnik pojmova', '#/rjecnik'], ['Preuzimanje', '#/preuzimanje']]]
];
$('#nav').innerHTML = NAVS.map(([k, h, t, i, subs]) => `<div class="grp${subs.length ? ' has-sub' : ''}"><a class="top" href="${h}" data-k="${k}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[i]}</svg><span>${t}</span></a>${subs.length ? `<ul class="subs" aria-label="${t}">${subs.map(([l, sh]) => `<li><a class="sub" href="${sh}">${l}</a></li>`).join('')}</ul>` : ''}</div>`).join('');
/* je li podstranica aktivna za trenutnu adresu (uključuje detalje: #/mjesta/Split, #/projekti/ID…) */
const subOn = (href, h) => h === href || h.startsWith(href + '/') || (href === '#/pristupi' && h === '#/metodologija');
/* izbornik se pomiče kad ne stane: zagasi donji rub dok ima još stavki ispod */
(() => { const sa = $('.sidein'), upd = () => sa.classList.toggle('scrolls', sa.scrollHeight - sa.clientHeight - sa.scrollTop > 8);
  sa.addEventListener('scroll', upd, { passive: true }); window.addEventListener('resize', upd); if (window.ResizeObserver) new ResizeObserver(upd).observe(sa); new MutationObserver(upd).observe(sa, { childList: true, subtree: true, characterData: true }); setTimeout(upd, 0); })();
const setNav = (o) => { document.body.classList.toggle('navopen', o); $('#scrim').hidden = !(o || document.body.classList.contains('dockopen') && innerWidth < 1500); $('#menu').setAttribute('aria-expanded', String(o)); };
$('#menu').onclick = () => setNav(!document.body.classList.contains('navopen'));
$('#sideclose').onclick = () => { setNav(false); $('#menu').focus(); };
$('#tb-search').onclick = () => { window.scrollTo(0, 0); const i = $('#view .gsearch input'); if (i) i.focus(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('navopen')) { setNav(false); $('#menu').focus(); } });

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

/* All animation is a pure function of time: seek(t) draws any moment, so the same page plays in a browser and renders frame by frame. */
const V = window.VIDEO, F = V.fig;
const stage = document.getElementById('stage');
const clamp = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
const EN = V.lang === 'en';
const t = (hr, en) => (EN ? en : hr);   // every text on screen, in both languages
const num = (n) => String(n).replace(/\B(?=(\d{3})+$)/g, EN ? ',' : '.');
const pct = (a, b) => (EN ? (100 * a / b).toFixed(1) + '%' : (100 * a / b).toFixed(1).replace('.', ',') + ' %');
const sec = (id) => { const s = V.sections.find((x) => x.id === id); if (!s) throw new Error('no section ' + id); return s; };

/* Time at which a phrase of the script is spoken; stops loudly if the script no longer contains it. */
function at(id, phrase, off = 0) {
  for (const c of sec(id).cues) {
    const i = c.text.indexOf(phrase);
    if (i >= 0) return c.start + (c.end - c.start) * (i / c.text.length) + off;
  }
  throw new Error(`"${phrase}" is not in section ${id}`);
}

const ICON = {
  school: '<path d="M3 21h18M5 21V10l7-5 7 5v11M10 21v-6h4v6"/><path d="M12 5V2l3 1-3 1"/>',
  group: '<circle cx="8" cy="8" r="3.2"/><circle cx="16.5" cy="9" r="2.6"/><path d="M2.5 20c.5-4 2.8-6 5.5-6s5 2 5.5 6M14.5 14.3c3.2-.6 6 1.300 7 5.700"/>',
  city: '<path d="M3 21h18M5 21V8h6v13M11 21V3h8v18M7.500 11.500h1M7.500 15h1M14 7h2M14 11h2M14 15h2"/>',
  map: '<path d="M12 21s7-6.200 7-11.500A7 7 0 005 9.500C5 14.800 12 21 12 21z"/><circle cx="12" cy="9.500" r="2.500"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4.500 21c.7-4.700 3.800-7 7.500-7s6.800 2.300 7.500 7"/>',
  press: '<path d="M4 4h13v16H6a2 2 0 01-2-2zM17 9h3v9a2 2 0 01-2 2h-1M7.500 8h6M7.500 12h6M7.500 16h6"/>',
  search: '<circle cx="10.500" cy="10.500" r="6.500"/><path d="M15.500 15.500L21 21"/>',
  partners: '<circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.700 10.600l6.600-3.200M8.700 13.400l6.600 3.200"/>',
  flag: '<path d="M5 22V3M5 4h13l-3 4 3 4H5"/>',
  refresh: '<path d="M20 11a8 8 0 00-14-4L3 10M3 4v6h6M4 13a8 8 0 0014 4l3-3M21 20v-6h-6"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.500 5l-3 14"/>',
  dash: '<path d="M4 20V10M10 20V4M16 20v-8M21 20H3"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
};
const icon = (name, size, color) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.700" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;
const logo = (size, id = '') => `<svg width="${size}" height="${size}" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#004494"/><circle cx="20" cy="20" r="16" fill="none" stroke="#fff" stroke-width="1.200" opacity=".55"/><g ${id ? `id="${id}"` : ''}><path d="M20 6l4.200 14L20 34l-4.200-14z" fill="#ffd617"/><path d="M6 20l14-4.200L34 20l-14 4.200z" fill="#fff"/></g></svg>`;

class Scene {
  constructor(id, from, to) { this.id = id; this.from = from; this.to = to; this.items = []; this.fns = []; this.root = document.createElement('div'); this.root.className = 'scene'; stage.appendChild(this.root); }
  /* x, y, w, h in stage pixels (h optional); t0 = when it appears; kind = rise | fade | pop | left; until = when it leaves */
  add(x, y, w, h, html, t0, opt = {}) {
    const el = document.createElement('div');
    el.className = 'a ' + (opt.cls || '');
    el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;${h ? `height:${h}px;` : ''}${opt.style || ''}`;
    el.innerHTML = html;
    this.root.appendChild(el);
    this.items.push({ el, t0, kind: opt.kind || 'rise', d: opt.d || 0.55, until: opt.until });
    return el;
  }
  on(fn) { this.fns.push(fn); }
  draw(t) {
    const inP = clamp((t - this.from) / 0.45), outP = clamp((this.to - t) / 0.45);
    const show = t >= this.from && t < this.to;
    this.root.style.visibility = show ? 'visible' : 'hidden';
    if (!show) return;
    this.root.style.opacity = Math.min(inP, outP);
    for (const it of this.items) {
      const p = ease((t - it.t0) / it.d);
      const out = it.until === undefined ? 1 : clamp((it.until - t) / 0.35);
      it.el.style.opacity = p * out;
      it.el.style.transform = it.kind === 'rise' ? `translateY(${(1 - p) * 26}px)` : it.kind === 'pop' ? `scale(${0.82 + 0.18 * p})` : it.kind === 'left' ? `translateX(${(1 - p) * -36}px)` : 'none';
    }
    for (const fn of this.fns) fn(t);
  }
}

/* A real screenshot in a frame, with highlights that appear on cue and an optional slow zoom. Coordinates are pixels of the source image. */
function shot(s, x, y, w, h, src, srcW, t0, marks, zoom) {
  const fit = w / srcW;
  const el = s.add(x, y, w, h, `<div style="position:absolute;left:0;top:0;width:${srcW}px;transform-origin:0 0"><img src="${src}" alt="" decoding="sync" style="display:block;width:${srcW}px">${marks.map(([mx, my, mw, mh]) => `<div style="position:absolute;left:${mx}px;top:${my}px;width:${mw}px;height:${mh}px;border:9px solid #f8ae21;border-radius:18px;background:rgba(255,214,23,.15)"></div>`).join('')}</div>`, t0, { kind: 'fade', style: 'overflow:hidden;border-radius:18px;background:#f5f7fb;box-shadow:0 18px 50px rgba(0,0,0,.28)' });
  const mover = el.firstChild, boxes = [...mover.children].slice(1);
  s.on((now) => {
    const p = zoom ? ease((now - zoom.t0) / 1.1) : 0, sc = fit + ((zoom ? zoom.scale : fit) - fit) * p;
    mover.style.transform = `translate(${zoom ? -zoom.left * p * sc : 0}px, ${zoom ? -zoom.top * p * sc : 0}px) scale(${sc})`;
    boxes.forEach((b, i) => { b.style.opacity = ease((now - marks[i][4]) / 0.4); });
  });
}

const S = V.sections, scenes = [];
function scene(id) {
  const i = S.findIndex((s) => s.id === id);
  const s = new Scene(id, i === 0 ? 0 : S[i].start - 0.5, i === S.length - 1 ? V.duration + 1 : S[i + 1].start - 0.05);
  scenes.push(s);
  return s;
}
const svgLayer = (s) => { const el = s.add(0, 0, 1920, 1080, '', -10, { kind: 'fade', style: 'pointer-events:none' }); el.innerHTML = '<svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none"></svg>'; return el.firstChild; };
/* A line that draws itself between t0 and t0 + d. */
function line(s, svg, x1, y1, x2, y2, t0, opt = {}) {
  const NS = 'http://www.w3.org/2000/svg', g = document.createElementNS(NS, 'g');
  const l = document.createElementNS(NS, 'line');
  for (const [k, v] of Object.entries({ x1, y1, x2, y2, stroke: opt.color || '#bfd0e4', 'stroke-width': opt.w || 3, 'stroke-linecap': 'round' })) l.setAttribute(k, v);
  g.appendChild(l);
  let head = null;
  if (opt.arrow !== false) {
    head = document.createElementNS(NS, 'path');
    const a = Math.atan2(y2 - y1, x2 - x1), L = 15;
    const pts = [[x2, y2], [x2 - L * Math.cos(a - 0.5), y2 - L * Math.sin(a - 0.5)], [x2 - L * Math.cos(a + 0.5), y2 - L * Math.sin(a + 0.5)]];
    head.setAttribute('d', 'M' + pts.map((p) => p.join(',')).join('L') + 'Z');
    head.setAttribute('fill', opt.color || '#bfd0e4');
    g.appendChild(head);
  }
  svg.appendChild(g);
  const d = opt.d || 0.5;
  s.on((t) => {
    const p = ease((t - t0) / d);
    l.setAttribute('x2', x1 + (x2 - x1) * p);
    l.setAttribute('y2', y1 + (y2 - y1) * p);
    g.style.opacity = t < t0 ? 0 : 1;
    if (head) head.style.opacity = p > 0.97 ? 1 : 0;
  });
  return g;
}

/* ---------- 1. Problem ---------- */
{
  const s = scene('problem'), [part, total] = F.schools;
  const tLit = at('problem', t('sudjelovala', 'taken part')), tEnd = at('problem', t('Erasmus+ Kompas pruža', 'Erasmus+ Kompas answers'));
  const canvasBox = s.add(120, 150, 920, 690, '<canvas width="1840" height="1380" style="width:920px;height:690px"></canvas>', 0, { kind: 'fade', until: tEnd });
  const ctx = canvasBox.firstChild.getContext('2d');
  ctx.scale(2, 2);   // double resolution, so the dots stay sharp at 4K
  const cols = 46, gap = 20, order = [...Array(total).keys()];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const lit = new Set(order.slice(0, part));
  s.on((t) => {
    ctx.clearRect(0, 0, 920, 690);
    const shown = clamp((t - 0.3) / 3.2) * total, litP = ease((t - tLit) / 1.6);
    for (let i = 0; i < total; i++) {
      if (i > shown) break;
      const x = 10 + (i % cols) * gap, y = 10 + Math.floor(i / cols) * gap, on = lit.has(i) && (i * 7 % 100) / 100 < litP * 1.01;
      ctx.beginPath(); ctx.arc(x, y, on ? 7 : 5.5, 0, 7);
      ctx.fillStyle = on ? '#ffd617' : 'rgba(191,208,228,.32)'; ctx.fill();
    }
  });
  s.add(1110, 170, 700, 0, `<div class="serif yellow" style="font-size:190px;line-height:1">${t('1 od 3', '1 in 3')}</div>`, tLit, { until: tEnd });
  s.add(1110, 372, 700, 0, `<div style="font-size:42px;font-weight:600;line-height:1.2">${t(`${num(part)} od ${num(total)} osnovnih i srednjih škola`, `${num(part)} of ${num(total)} primary and secondary schools`)}</div><div class="muted" style="font-size:30px;margin-top:10px">${t(`sudjelovalo je u KA2 partnerstvima od 2014. (${pct(part, total)})`, `have taken part in KA2 partnerships since 2014 (${pct(part, total)})`)}</div>`, tLit + 0.5, { until: tEnd });
  [[t('Koje su to škole?', 'Which schools are they?'), t('Koje su', 'Which schools')], [t('S kim surađuju?', 'Who do they work with?'), t('S kim', 'Who do')], [t('Čime se bave njihovi projekti?', 'What are their projects about?'), t('Čime se', 'What are')]].forEach(([q, ph], i) => {
    s.add(1110, 590 + i * 80, 720, 66, `<div class="pill" style="height:66px;font-size:36px">${q}</div>`, at('problem', ph), { until: tEnd, kind: 'left' });
  });
  s.add(560, 230, 800, 0, `<div style="display:flex;flex-direction:column;align-items:center;gap:26px">${logo(290, 'needle')}<div class="serif" style="font-size:92px;line-height:1">Erasmus+ Kompas</div></div>`, tEnd + 0.1, { kind: 'pop' });
  const needle = () => document.getElementById('needle');
  s.on((now) => { const n = needle(); if (n) n.setAttribute('transform', `rotate(${(1 - ease((now - tEnd) / 1.8)) * -200} 20 20)`); });
}

/* ---------- 1. Što je KA2? (wording from the app's glossary, app/site/src/ek/pages.js) ---------- */
{
  const s = scene('ka2'), svg = svgLayer(s);
  const t0 = sec('ka2').start, t1 = at('ka2', t('surađuju', 'work together')), t2 = at('ka2', t('razmjenjuju', 'share experience'));
  s.add(120, 150, 760, 0, `<div class="serif yellow" style="font-size:200px;line-height:1">KA2</div><div style="font-size:44px;font-weight:700;margin-top:10px;line-height:1.15">${t('Ključna aktivnost programa Erasmus+', 'Erasmus+ key action')}</div>`, t0, { kind: 'pop' });
  [[t('Suradnja organizacija', 'Organisations working together'), t1], [t('Razmjena iskustava', 'Sharing experience'), t2], [t('Kroz partnerstva', 'Through partnerships'), t2 + 0.9]].forEach(([x, when], i) => {
    s.add(120, 470 + i * 88, 760, 74, `<div class="pill" style="height:74px;font-size:36px">${x}</div>`, when, { kind: 'left' });
  });
  s.add(120, 748, 780, 0, `<div class="muted" style="font-size:29px;line-height:1.25">${t('KA1 je mobilnost pojedinaca. Kompas prikazuje samo KA2.', 'KA1 is the mobility of individuals. Kompas covers KA2 only.')}</div>`, t2 + 1.3, { kind: 'fade' });
  const cx = 1350, cy = 490, R = 300, nodes = ['school', 'group', 'city', 'search', 'person'];
  nodes.forEach((ic, i) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / nodes.length, x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
    line(s, svg, cx, cy, x, y, t1 + i * 0.12, { arrow: false, color: 'rgba(255,214,23,.7)', w: 3, d: 0.4 });
    s.add(x - 64, y - 64, 128, 128, `<div style="height:100%;border-radius:50%;background:#123a78;border:2px solid rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center">${icon(ic, 72, '#ffd617')}</div>`, t1 + i * 0.12, { kind: 'pop' });
  });
  s.add(cx - 145, cy - 76, 290, 152, `<div style="height:100%;background:#ffd617;color:#0b2a5b;border-radius:18px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:36px;font-weight:700;line-height:1.1;padding:0 18px">${t('Zajednički projekt', 'Joint project')}</div>`, t1, { kind: 'pop' });
}

/* ---------- 2. Ciljani korisnici ---------- */
{
  const s = scene('korisnici');
  const who = [[t('Škole', 'Schools'), 'school', t('školama', 'schools')], [t('Udruge', 'Associations'), 'group', t('udrugama', 'associations')], [t('Gradovi', 'Cities'), 'city', t('gradovima', 'cities')], [t('Županije', 'Counties'), 'map', t('županijama', 'counties')], [t('Građani', 'Citizens'), 'person', t('građanima', 'citizens')], [t('Novinari', 'Journalists'), 'press', t('novinarima', 'journalists')], [t('Istraživači', 'Researchers'), 'search', t('istraživačima', 'researchers')]];
  const w = 370, h = 300, gx = 40, gy = 46, x0 = (1920 - 4 * w - 3 * gx) / 2;
  who.forEach(([name, ic, word], i) => {
    const row = i < 4 ? 0 : 1, col = i < 4 ? i : i - 4, xs = row === 0 ? x0 : x0 + (w + gx) / 2;
    s.add(xs + col * (w + gx), 170 + row * (h + gy), w, h, `<div class="glass" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px">${icon(ic, 120, '#ffd617')}<div style="font-size:46px;font-weight:700">${name}</div></div>`, at('korisnici', word) - 0.1, { kind: 'pop' });
  });
}

/* ---------- 3. Izvori podataka (the dataset table in the repository README) ---------- */
{
  const s = scene('izvori'), svg = svgLayer(s);
  const t1 = at('izvori', t('Platforme', 'Project Results')), t2 = at('izvori', t('Portala', 'Open Data')), t3 = at('izvori', t('Agencije', 'Agency')), t4 = at('izvori', t('registre', 'registers'));
  const row = (text) => `<div style="font-size:27px;color:#dce6f5;font-weight:500;line-height:1.25">${text}</div>`;
  s.add(90, 112, 1000, 192, `<div class="box" style="height:100%;gap:4px"><b>${t('Platforma za rezultate projekata Erasmus+', 'Erasmus+ Project Results Platform')}</b>${row(`KA2, ${t('2014.–2020.:', '2014–2020:')} <i>Cooperation for innovation and the exchange of good practices</i>`)}${row(`KA2, ${t('2021.–2027.:', '2021–2027:')} <i>Partnerships for cooperation and exchanges of practices</i>`)}</div>`, t1, { kind: 'left' });
  s.add(90, 322, 1000, 492, `<div class="box" style="height:100%;justify-content:flex-start;padding-top:18px"><b>${t('Portal otvorenih podataka', 'Open Data Portal')}</b><small>data.gov.hr</small></div>`, t2, { kind: 'left' });
  s.add(118, 416, 944, 172, `<div class="box" style="height:100%;gap:4px"><b>${t('Agencija za mobilnost i programe EU-a', 'Agency for Mobility and EU Programmes')}</b>${row(t('Program Erasmus+ 2014.–2020., tablice 1–5', 'Erasmus+ Programme 2014–2020, tables 1–5'))}${row(t('Program Erasmus+ 2021.–2027., tablice 7–9', 'Erasmus+ Programme 2021–2027, tables 7–9'))}</div>`, t3);
  s.add(118, 602, 944, 192, `<div class="box" style="height:100%;justify-content:flex-start;padding-top:16px"><b>${t('Registri obrazovnih ustanova u Hrvatskoj', 'Registers of educational institutions in Croatia')}</b><small>${t('Ministarstvo znanosti, obrazovanja i mladih', 'Ministry of Science, Education and Youth')}</small></div>`, t4);
  [t('Osnovne škole', 'Primary schools'), t('Srednje škole', 'Secondary schools'), t('Dječji vrtići', 'Kindergartens'), t('Visoko obrazovanje', 'Higher education')].forEach((x, i) => {
    const w = t([195, 195, 195, 285], [205, 235, 195, 235])[i], left = t([140, 345, 550, 755], [140, 355, 600, 805])[i];
    s.add(left, 726, w, 54, `<div style="height:100%;background:#f5f7fb;color:#1d2a44;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:27px;font-weight:600;white-space:nowrap">${x}</div>`, t4 + 0.3 + i * 0.22, { kind: 'pop' });
  });
  line(s, svg, 1090, 208, 1168, 350, t1 + 0.4);
  line(s, svg, 1090, 560, 1168, 450, t2 + 0.4);
  s.add(1170, 285, 210, 230, `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px">${logo(136)}<div style="font-weight:700;font-size:29px;text-align:center;line-height:1.1">Erasmus+<br>Kompas</div></div>`, t1 + 0.6, { kind: 'pop' });
  const rows = [[F.meta.projects, t('projekata', 'projects')], [F.meta.organisations, t('hrvatskih organizacija', 'Croatian organisations')], [F.meta.counties, t('županija', 'counties')]];
  const nums = rows.map(([n, label], i) => {
    const el = s.add(1420, 118 + i * 180, 440, 0, `<div class="serif yellow" style="font-size:88px;line-height:1"><span>0</span></div><div style="font-size:32px;font-weight:600;margin-top:4px">${label}</div>`, t3);
    return { span: el.querySelector('span'), n };
  });
  s.on((now) => { const p = ease((now - t3) / 1.6); for (const r of nums) r.span.textContent = num(Math.round(r.n * p)); });
  s.add(90, 826, 1770, 52, `<div style="height:100%;display:flex;align-items:center;justify-content:center;gap:16px;font-size:29px;font-weight:600;background:rgba(255,214,23,.14);border-radius:10px"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ffd617" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5C6.500 4 9.500 4 12 5.500V20c-2.500-1.500-5.500-1.500-8 0zM12 5.500C14.500 4 17.500 4 20 5.500V20c-2.500-1.500-5.500-1.500-8 0z"/></svg><span><span class="yellow">${t('Nazivlje:', 'Terminology:')}</span> ${t('Vodič kroz program Erasmus+ za 2026. i web-stranica AMPEU-a', 'Erasmus+ Programme Guide 2026 and the AMPEU website')}</span></div>`, t4 + 0.6, { kind: 'fade' });
}

/* ---------- 4. Pregled: the app's navigation (app/site/src/lib/nav.ts) ---------- */
{
  const s = scene('pregled');
  const cards = [
    ['dash', t('Pregled', 'Overview'), t(['Ključni pokazatelji', 'Kroz vrijeme', 'Partnerske države'], ['Key figures', 'Over time', 'Partner countries'])],
    ['map', t('Županije', 'Counties'), t(['Karta i poredak', 'Usporedba županija', 'Pokrivenost škola'], ['Map and ranking', 'Compare counties', 'School coverage'])],
    ['hash', t('Teme i problemi', 'Topics and problems'), t(['Teme kroz vrijeme', 'Problemi i rješenja', 'Mreža pojmova', 'Čime se bave projekti'], ['Topics over time', 'Problems and solutions', 'Concept network', 'What projects do'])],
    ['folder', t('Projekti i organizacije', 'Projects and organisations'), t(['Projekti', 'Organizacije'], ['Projects', 'Organisations'])],
    ['chat', t('Asistent', 'Assistant'), t(['Pitanja na hrvatskom', 'ili engleskom jeziku'], ['Questions in Croatian', 'or English'])],
    ['info', t('Informacije', 'Information'), t(['O podacima', 'Rječnik pojmova', 'Preuzimanje'], ['About the data', 'Glossary', 'Downloads'])],
  ];
  const w = 540, h = 350, gx = 30, gy = 26, x0 = (1920 - 3 * w - 2 * gx) / 2;
  const asked = at('pregled', t('Asistenta', 'Assistant')) - 0.1;
  const times = [sec('pregled').start, at('pregled', t('županijama', 'county')) - 0.1, at('pregled', t('temama', 'topic')) - 0.1, at('pregled', t('projekte', 'projects')) - 0.1, asked, asked + 0.35];
  cards.forEach(([ic, title, list], i) => {
    const items = list.map((x) => `<div style="font-size:35px;font-weight:500;color:#dce6f5;line-height:1.3">${x}</div>`).join('');
    s.add(x0 + (i % 3) * (w + gx), 122 + Math.floor(i / 3) * (h + gy), w, h, `<div class="glass" style="height:100%;padding:28px 34px"><div style="display:flex;align-items:center;gap:18px;margin-bottom:16px">${icon(ic, 66, '#ffd617')}<div style="font-size:${title.length > 24 ? 36 : 40}px;font-weight:700;line-height:1.08">${title}</div></div>${items}</div>`, times[i], { kind: 'pop' });
  });
}

/* ---------- 4. Karta ---------- */
function ramp(x) {
  const stops = [[40, 84, 146], [127, 161, 201], [255, 214, 23]], u = clamp(x) * 2, i = Math.min(1, Math.floor(u)), m = u - i;
  return `rgb(${stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * m)).join(',')})`;
}
{
  const s = scene('karta'), G = F.geo, names = Object.keys(G.paths);
  const rate = (n) => { const r = F.rates[n]; return r[0] / r[1]; };
  const lo = rate(F.lowest), hi = rate(F.highest);
  const order = [...names].sort((a, b) => rate(a) - rate(b));
  const tMap = at('karta', t('Na karti', 'The map')), tLo = at('karta', t('od četrnaest', 'from fourteen')), tHi = at('karta', t('do gotovo', 'to almost'));
  const box = s.add(90, 110, 790, 780, `<svg width="790" height="780" viewBox="0 15 1000 985">${names.map((n) => `<path data-n="${n}" d="${G.paths[n]}" stroke="#0b2a5b" stroke-width="3"/>`).join('')}</svg>`, tMap, { kind: 'fade' });
  const paths = [...box.querySelectorAll('path')];
  s.on((now) => {
    for (const p of paths) {
      const n = p.dataset.n, i = order.indexOf(n), r = rate(n), q = ease((now - tMap - 0.2 - i * 0.14) / 0.5);
      p.setAttribute('fill', q <= 0 ? 'rgba(255,255,255,.1)' : ramp((r - lo) / (hi - lo) * q));
      const hot = (n === F.lowest && now > tLo) || (n === F.highest && now > tHi);
      p.setAttribute('stroke', hot ? '#fff' : '#0b2a5b');
      p.setAttribute('stroke-width', hot ? 8 : 3);
    }
    paths.filter((p) => p.dataset.n === F.lowest || p.dataset.n === F.highest).forEach((p) => p.parentNode.appendChild(p));
  });
  s.add(960, 150, 860, 0, `<div style="font-size:44px;font-weight:700;line-height:1.15">${t('Udio osnovnih i srednjih škola s KA2 projektom, po županijama', 'Share of primary and secondary schools with a KA2 project, by county')}</div>`, tMap + 0.3);
  const card = (n, label, t0, y) => {
    const r = F.rates[n];
    s.add(960, y, 860, 200, `<div class="glass" style="height:100%;display:flex;align-items:center;gap:40px;padding:0 40px"><div class="serif yellow" style="font-size:96px;white-space:nowrap">${pct(r[0], r[1])}</div><div><div style="font-size:42px;font-weight:700">${label}</div><div class="muted" style="font-size:32px">${t(`${r[0]} od ${r[1]} škola`, `${r[0]} of ${r[1]} schools`)}</div></div></div>`, t0, { kind: 'left' });
  };
  card(F.lowest, F.lowest_label, tLo, 310);
  card(F.highest, F.highest_label, tHi, 540);
  s.add(960, 770, 860, 60, `<div style="display:flex;align-items:center;gap:18px;font-size:28px"><span>${t('manje', 'fewer')}</span><div style="width:360px;height:18px;border-radius:9px;background:linear-gradient(90deg,${ramp(0)},${ramp(0.5)},${ramp(1)})"></div><span>${t('više', 'more')}</span></div>`, tMap + 0.6, { kind: 'fade' });
}

/* ---------- 4. Organizacije ---------- */
{
  const s = scene('organizacije'), O = F.org;
  const tOrg = at('organizacije', t('Svaka', 'Every')), tN = at('organizacije', t('dvadeset', 'twenty-two')), tC = at('organizacije', t('a jedan', 'and coordinated'));
  const tF = at('organizacije', t('Popis', 'The organisation list')), tD = at('organizacije', t('preuzeti', 'downloaded'));
  if (EN) {
    s.add(120, 150, 900, 690, `<div class="card" style="height:100%;padding:52px 56px;position:relative"><div class="ink-muted" style="font-size:26px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${t('Organizacija', 'Organisation')}</div><div class="serif" style="font-size:68px;color:#004494;line-height:1.1;margin-top:10px">${O.name}</div><div class="ink-muted" style="font-size:32px;margin-top:10px">${O.town} · ${F.org_county_label}</div></div>`, tOrg);
    s.add(176, 420, 380, 0, `<div class="serif" style="font-size:120px;line-height:1;color:#004494">${O.projects}</div><div style="font-size:34px;font-weight:600;color:#1d2a44">${t('KA2 projekta', 'KA2 projects')}</div>`, tN, { kind: 'pop' });
    s.add(590, 420, 380, 0, `<div class="serif" style="font-size:120px;line-height:1;color:#004494">${O.coordinated}</div><div style="font-size:34px;font-weight:600;color:#1d2a44">${t('koordinirani projekt', 'project coordinated')}</div>`, tC, { kind: 'pop' });
    s.add(176, 640, 790, 0, `<div class="bars" style="display:flex;gap:6px;height:44px;border-radius:8px;overflow:hidden"><div style="flex:${O.p1};background:#4073af"></div><div style="flex:${O.p2};background:#004494"></div></div><div style="display:flex;gap:6px;font-size:28px;font-weight:600;color:#1d2a44;margin-top:10px"><div style="flex:${O.p1}">${t('2014.–2020.:', '2014–2020:')} ${O.p1}</div><div style="flex:${O.p2}">${t('2021.–2027.:', '2021–2027:')} ${O.p2}</div></div>`, tN + 0.5, { kind: 'fade' });
  } else {
    shot(s, 80, 118, 960, 750, 'assets/screens/organizacija_hr.png', 2586, tOrg, [[168, 394, 543, 324, tN], [760, 394, 543, 324, tC]], { t0: tN - 0.3, scale: 0.62, left: 142, top: 0 });
  }
  s.add(1090, 150, 740, 0, `<div style="font-size:42px;font-weight:700">${t('Popis organizacija', 'Organisation list')}</div>`, tF - 0.2);
  [[t('Županija', 'County'), t('Sve županije', 'All counties'), t('po županiji', 'by county')], [t('Vrsta organizacije', 'Organisation type'), t('Sve vrste', 'All types'), t('vrsti', 'type')], [t('Razdoblje', 'Period'), t('Sva razdoblja', 'All periods'), t('razdoblju', 'period')]].forEach(([lab, val, ph], i) => {
    s.add(1090, 225 + i * 118, 740, 104, `<div class="glass" style="height:100%;display:flex;align-items:center;justify-content:space-between;padding:0 30px"><div><div class="muted" style="font-size:25px">${lab}</div><div style="font-size:36px;font-weight:600">${val}</div></div><div class="yellow" style="font-size:36px">▾</div></div>`, at('organizacije', ph) - 0.1, { kind: 'left' });
  });
  s.add(1090, 610, 740, 0, `<div style="font-size:34px;font-weight:600">${t('Preuzimanje rezultata', 'Download the results')}</div>`, tD);
  ['CSV', 'Excel', 'PDF'].forEach((x, i) => {
    s.add(1090 + i * 250, 670, 230, 110, `<div style="height:100%;background:#ffd617;color:#0b2a5b;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:700">${x}</div>`, at('organizacije', x) - 0.05, { kind: 'pop' });
  });
}

/* ---------- 4. Mreža pojmova ---------- */
{
  if (EN) {
    const s = scene('mreza'), svg = svgLayer(s), g = F.group, C = F.concept.name;
    const groups = [
      [t('Problemi', 'Problems'), g.problem.filter((x) => x !== C).slice(0, 3), 110, 150, 'left', t('probleme', 'problems')],
      [t('Pristupi', 'Approaches'), g.approach.slice(0, 3), 1270, 150, 'right', t('pristupe', 'approaches')],
      [t('Ciljane skupine', 'Target groups'), g.target_group.slice(0, 3), 110, 520, 'left', t('ciljane skupine', 'target groups')],
      [t('Rezultati', 'Results'), g.output.slice(0, 3), 1270, 520, 'right', t('rezultate', 'results')],
    ];
    const cx = 960, cy = 490, tMesh = at('mreza', t('Mreža', 'The concept network')), tHit = at('mreza', t('učenike', 'students from'));
    const highlighted = t('učenici u nepovoljnom položaju', 'students from disadvantaged backgrounds');
    const pw = 540, ph = 78, gapY = 10;
    groups.forEach(([title, list, x, y, side, word]) => {
      const t0 = at('mreza', word);
      s.add(x, y, pw, 40, `<div class="kind">${title}</div>`, t0);
      list.forEach((label, i) => {
        const py = y + 48 + i * (ph + gapY), hit = label === highlighted;
        s.add(x, py, pw, ph, `<div class="pill" style="height:100%;font-size:28px">${label}</div>`, t0 + 0.12 * i);
        line(s, svg, side === 'left' ? cx - 240 : cx + 240, cy, side === 'left' ? x + pw : x, py + ph / 2, tMesh + 0.1 * i, { arrow: false, color: 'rgba(191,208,228,.55)', w: 2.5 });
        if (hit) {
          line(s, svg, cx - 240, cy, x + pw, py + ph / 2, tHit, { arrow: false, color: '#ffd617', w: 7 });
          s.add(x - 7, py - 7, pw + 14, ph + 14, '<div style="height:100%;border:6px solid #ffd617;border-radius:18px"></div>', tHit, { kind: 'fade' });
        }
      });
    });
    s.add(cx - 240, cy - 75, 480, 150, `<div style="height:100%;background:#ffd617;color:#0b2a5b;border-radius:18px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:40px;font-weight:700;line-height:1.1;padding:0 24px">${C}</div>`, tMesh - 0.15, { kind: 'pop' });
  } else {
    const s = scene('mreza'), P = (ph) => at('mreza', ph);
    const tEx = P('primjerice'), tHit = P('učenike'), tMesh = P('Mreža');
    shot(s, 770, 112, 1090, 752, 'assets/screens/mreza_hr.png', 2328, sec('mreza').start - 0.2, [[920, 912, 297, 99, tEx], [1385, 666, 172, 105, tHit]], { t0: tEx - 0.3, scale: 0.62, left: 400, top: 250 });
    const shapes = { p: '<path d="M12 4l9 16H3z" fill="#bfd0e4"/>', a: '<circle cx="12" cy="12" r="9" fill="#5b9bf0"/>', g: '<rect x="4" y="4" width="16" height="16" fill="#e8743b"/>', r: '<path d="M12 2l10 10-10 10L2 12z" fill="#3fbf8a"/>' };
    [['Problemi', 'p', 'probleme'], ['Pristupi', 'a', 'pristupe'], ['Ciljane skupine', 'g', 'ciljane skupine'], ['Rezultati', 'r', 'rezultate']].forEach(([x, sh, ph], i) => {
      s.add(90, 136 + i * 76, 640, 0, `<div style="display:flex;align-items:center;gap:22px"><svg width="46" height="46" viewBox="0 0 24 24">${shapes[sh]}</svg><div style="font-size:44px;font-weight:700">${x}</div></div>`, P(ph), { kind: 'left' });
    });
    s.add(90, 462, 640, 0, '<div class="kind">Povezani pojmovi</div>', tMesh);
    s.add(90, 512, 640, 112, '<div style="height:100%;background:#ffd617;color:#0b2a5b;border-radius:16px;display:flex;align-items:center;padding:0 28px;font-size:38px;font-weight:700;line-height:1.1">rano napuštanje školovanja</div>', tEx, { kind: 'pop' });
    s.add(90, 640, 640, 112, '<div style="height:100%;background:#ffd617;color:#0b2a5b;border-radius:16px;display:flex;align-items:center;padding:0 28px;font-size:38px;font-weight:700;line-height:1.1">učenici u nepovoljnom položaju</div>', tHit, { kind: 'pop' });
  }
}

/* ---------- 4. Pitanja: real answers from the app (assets/screens); build.py stops if their figures no longer match the data ---------- */
{
  const s = scene('pitanja'), P = (ph) => at('pitanja', ph);
  const c = EN ? {
    src: 'assets/screens/assistant_en.png', X: 740, Y: 110, W: 1110, name: 'Assistant', textW: 610,
    tA: P('You can also'), tL: P('in Croatian'),
    marks: [[1283, 222, 387, 109, P('dropping out')], [1048, 382, 582, 52, P('recognises')], [186, 528, 1450, 48, P('with examples')], [186, 578, 340, 46, P('with examples')], [186, 752, 1450, 182, P('sources')]],
    label: 'Closest concept by meaning', title: 'School dropout', titleSize: 68, tTitle: P('recognises'),
    n: '5', unit: 'projects', split: '4 in 2014–2020 · 1 in 2021–2026', tN: P('finds'), more: 'With example projects and sources', tMore: P('with examples'),
  } : {
    src: 'assets/screens/assistant_hr.png', X: 976, Y: 100, W: 874, name: 'Asistent', textW: 830,
    tA: P('Također'), tL: P('na hrvatskom'),
    marks: [[1209, 218, 451, 109, P('Na upit')], [178, 380, 1385, 48, P('pronalazi')], [178, 428, 430, 48, P('pronalazi')], [1140, 716, 490, 48, P('s primjerima')], [178, 764, 1440, 48, P('s primjerima')], [178, 812, 395, 48, P('s primjerima')], [178, 994, 1290, 262, P('izvorima')]],
    label: 'Tema EU-a', title: 'Sprječavanje ranog napuštanja školovanja i neuspjeha u obrazovanju', titleSize: 46, tTitle: P('pronalazi'),
    n: '175', unit: 'projekata', split: '153 u 2014.–2020. · 22 u 2021.–2026.', tN: P('sto sedamdeset'), more: 'S primjerima projekata i izvorima', tMore: P('s primjerima'),
  };
  const k = c.W / 1730, tx = 90, tw = c.textW;
  s.add(c.X, c.Y, c.W, 0, `<img src="${c.src}" alt="" decoding="sync" style="display:block;width:${c.W}px;border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.28)">`, c.tA, { kind: 'fade' });
  c.marks.forEach(([x, y, w, h, t0]) => s.add(c.X + x * k, c.Y + y * k, w * k, h * k, '<div style="height:100%;border:4px solid #f8ae21;border-radius:12px;background:rgba(255,214,23,.16)"></div>', t0, { kind: 'fade' }));
  s.add(tx, 130, tw, 0, `<div style="display:flex;align-items:center;gap:18px">${logo(70)}<div style="font-size:46px;font-weight:700">${c.name}</div></div>`, c.tA, { kind: 'left' });
  ['HR', 'EN'].forEach((x, i) => s.add(tx + i * 94, 232, 84, 58, `<div style="height:100%;background:#ffd617;color:#0b2a5b;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:700">${x}</div>`, c.tL + i * 0.4, { kind: 'pop' }));
  s.add(tx, 330, tw, 0, `<div class="muted" style="font-size:32px;font-weight:600">${c.label}</div><div class="serif yellow" style="font-size:${c.titleSize}px;line-height:1.12;margin-top:6px">${c.title}</div>`, c.tTitle);
  s.add(tx, 540, tw, 0, `<div style="display:flex;align-items:baseline;gap:18px"><div class="serif yellow" style="font-size:140px;line-height:1">${c.n}</div><div style="font-size:46px;font-weight:700">${c.unit}</div></div><div class="muted" style="font-size:32px;font-weight:600;margin-top:6px">${c.split}</div>`, c.tN, { kind: 'pop' });
  s.add(tx, 770, tw, 0, `<div style="font-size:36px;font-weight:600;line-height:1.2">${c.more}</div>`, c.tMore);
}

/* ---------- 5. Tehnička arhitektura ---------- */
{
  const s = scene('arhitektura'), svg = svgLayer(s);
  const W = 310, Hh = 108, gap = 28, x = (i) => 120 + i * (W + gap), R1 = 158, R2 = 335, R3 = 512;
  const p = (hr, en) => at('arhitektura', t(hr, en));
  const t1 = p('Podaci se', 'The data is'), t2 = p('a iz nje', 'which is used'), t3 = p('Sažetke', 'A language'), t4 = p('a algoritam', 'and an algorithm'), t5 = p('Kad korisnik', 'When a user'), t6 = p('model samo', 'the model only'), t7 = p('Alati', 'Tools'), t8 = p('a odgovor', 'and code'), t9 = p('Zato', 'So the figures');
  const tDb = p('u bazu', 'into a DuckDB'), tAstro = p('alatu', 'with Astro'), tModel = p('jezični model', 'A language model');
  const bx = (col, y, title, small, t0, hot) => s.add(x(col), y, W, Hh, `<div class="box ${hot ? 'hot' : ''}" style="height:100%"><b>${title}</b><small>${small}</small></div>`, t0, { kind: 'pop' });
  const lab = (y, text, t0) => s.add(120, y - 42, 900, 36, `<div class="kind" style="font-size:25px">${text}</div>`, t0, { kind: 'fade' });
  const arrow = (a, y, t0) => line(s, svg, x(a) + W + 3, y + Hh / 2, x(a + 1) - 4, y + Hh / 2, t0, { d: 0.35 });
  lab(R1, t('Obrada podataka', 'Data processing'), t1);
  bx(0, R1, t('Izvorne datoteke', 'Source files'), 'CSV, XLSX', t1);
  bx(1, R1, 'Python', t('obrada i spajanje', 'processing, merging'), t1 + 0.6); arrow(0, R1, t1 + 0.4);
  bx(2, R1, 'DuckDB', t('jedna baza', 'one database'), tDb); arrow(1, R1, tDb - 0.2);
  bx(3, R1, 'Astro', t('gradnja stranica', 'builds the pages'), tAstro - 0.3); arrow(2, R1, t2);
  bx(4, R1, t('Web-sjedište', 'Website'), t('statične datoteke', 'static files'), tAstro + 0.2); arrow(3, R1, tAstro);
  lab(R2, t('Obrada sažetaka', 'Summary processing'), t3);
  bx(0, R2, t('Sažeci projekata', 'Summaries'), t('iz izvoza s Platforme', 'from Platform exports'), t3);
  bx(1, R2, t('Jezični model', 'Language model'), t('pokrenut lokalno', 'running locally'), tModel); arrow(0, R2, tModel - 0.2);
  bx(2, R2, t('Algoritam', 'Algorithm'), t('grupiranje pojmova', 'groups concepts'), t4 + 0.2); arrow(1, R2, t4);
  line(s, svg, x(2) + W / 2, R2 - 3, x(2) + W / 2, R1 + Hh + 4, t4 + 0.8, { d: 0.35 });
  lab(R3, t('Odgovor na pitanje', 'Answering a question'), t5);
  bx(0, R3, t('Pitanje', 'Question'), t('hrvatski ili engleski', 'Croatian or English'), t5);
  bx(1, R3, 'Model', t('samo usmjerava upit', 'only routes it'), t6, true); arrow(0, R3, t6 - 0.2);
  bx(2, R3, t('Alati', 'Tools'), t('dohvaćaju podatke', 'retrieve the data'), t7); arrow(1, R3, t7 - 0.2);
  bx(3, R3, t('Kôd', 'Code'), t('sastavlja odgovor', 'writes the answer'), t8, true); arrow(2, R3, t8 - 0.2);
  bx(4, R3, t('Odgovor', 'Answer'), t('brojke i izvori', 'figures and sources'), t8 + 0.7); arrow(3, R3, t8 + 0.5);
  s.add(120, 668, 1680, 130, `<div style="height:100%;display:flex;align-items:center;justify-content:center;border:3px solid #ffd617;border-radius:18px;font-size:58px;line-height:1.1"><span class="serif yellow">${t('Brojke proizlaze iz podataka, a ne iz modela.', 'The figures come from the data, not from the model.')}</span></div>`, t9, { kind: 'pop' });
}

/* ---------- 6. Korisnička vrijednost ---------- */
{
  const s = scene('vrijednost'), C = F.county, G = F.geo, stem = F.org.county;
  const p = (hr, en) => at('vrijednost', t(hr, en));
  const t1 = p('Škole', 'Schools'), t2 = p('već sudjeluje', 'take part'), t3 = p('čime se', 'what those'), t4 = p('Građani', 'Citizens'), t5 = p('saznati', 'learn more');
  s.add(100, 130, 840, 730, `<div class="glass" style="height:100%;padding:36px 44px"><div style="display:flex;align-items:center;gap:22px">${icon('school', 78, '#ffd617')}<div style="font-size:54px;font-weight:700">${t('Škole', 'Schools')}</div></div></div>`, t1, { kind: 'left' });
  s.add(130, 268, 380, 380, `<svg width="380" height="380" viewBox="0 15 1000 985">${Object.keys(G.paths).map((n) => `<path d="${G.paths[n]}" fill="${n === stem ? '#ffd617' : 'rgba(191,208,228,.28)'}" stroke="#0b2a5b" stroke-width="4"/>`).join('')}</svg>`, t1 + 0.4, { kind: 'fade' });
  s.add(540, 268, 380, 0, `<div class="muted" style="font-size:30px;font-weight:600;line-height:1.15">${t('Primjer:', 'Example:')} ${C.name}</div><div class="serif yellow" style="font-size:76px;margin-top:14px;line-height:1">${C.organisations}</div><div style="font-size:31px;font-weight:600">${t('organizacije', 'organisations')}</div><div class="serif yellow" style="font-size:76px;margin-top:14px;line-height:1">${C.projects}</div><div style="font-size:31px;font-weight:600">${t('KA2 projekt', 'KA2 projects')}</div>`, t1 + 0.7);
  s.add(140, 668, 760, 104, `<div class="pill" style="height:104px;font-size:33px">${t('Koje organizacije u mojoj županiji već sudjeluju u projektima?', 'Which organisations in my county already take part in projects?')}</div>`, t2 - 0.5, { kind: 'left' });
  s.add(140, 782, 760, 62, `<div class="pill" style="height:62px;font-size:33px">${t('Čime se ti projekti bave?', 'What are those projects about?')}</div>`, t3 - 0.1, { kind: 'left' });
  s.add(980, 130, 840, 730, '<div class="glass" style="height:100%"></div>', t4, { kind: 'left' });
  [[t('Građani', 'Citizens'), 'person', t('Građani', 'Citizens')], [t('Novinari', 'Journalists'), 'press', t('novinari', 'journalists')], [t('Istraživači', 'Researchers'), 'search', t('istraživači', 'researchers')]].forEach(([n, ic, ph], i) => {
    s.add(1014 + i * 262, 180, 250, 0, `<div style="display:flex;flex-direction:column;align-items:center;gap:14px">${icon(ic, 112, '#ffd617')}<div style="font-size:40px;font-weight:700">${n}</div></div>`, at('vrijednost', ph), { kind: 'pop' });
  });
  s.add(1030, 450, 740, 0, `<div class="serif" style="font-size:62px;line-height:1.12">${t('Saznajte više o partnerstvima u svojem kraju.', 'Learn more about partnerships in your area.')}</div><div class="muted" style="font-size:33px;margin-top:22px;line-height:1.2">${t(`${num(F.meta.projects)} projekata i ${num(F.meta.organisations)} organizacija u ${F.meta.counties} županiji, na jednom mjestu.`, `${num(F.meta.projects)} projects and ${num(F.meta.organisations)} organisations in ${F.meta.counties} counties, in one place.`)}</div>`, t5);
}

/* ---------- 7. Daljnji razvoj i odjavna kartica ---------- */
{
  const s = scene('razvoj'), last = sec('razvoj').end;
  const items = [['partners', t('Alat za traženje partnera', 'Partner search tool'), t('alat za', 'partner search')], ['flag', t('Vodič za prvi projekt', 'Guide for first projects'), t('vodič', 'guide')], ['refresh', t('Godišnje osvježavanje podataka', 'Annual data refresh'), t('godišnje', 'annual')], ['code', t('Javni API', 'Public API'), t('javni API', 'public API')]];
  const w = 395, g = 30, x0 = (1920 - 4 * w - 3 * g) / 2, tEnd = last + 0.5;
  s.add(x0, 140, 1000, 0, `<div class="serif" style="font-size:66px">${t('U planu', 'Planned')}</div>`, sec('razvoj').start, { until: tEnd });
  items.forEach(([ic, text, ph], i) => {
    s.add(x0 + i * (w + g), 270, w, 430, `<div class="glass" style="height:100%;padding:40px 34px;display:flex;flex-direction:column;gap:30px">${icon(ic, 110, '#ffd617')}<div style="font-size:45px;font-weight:700;line-height:1.14">${text}</div></div>`, at('razvoj', ph) - 0.1, { until: tEnd, kind: 'pop' });
  });
  s.add(360, 190, 1200, 0, `<div style="display:flex;flex-direction:column;align-items:center;gap:28px;text-align:center">${logo(270, 'needle2')}<div class="serif" style="font-size:100px;line-height:1">Erasmus+ Kompas</div><div style="font-size:42px;font-weight:600">${t('Hrvatska u KA2 partnerstvima, 2014.–2026.', 'Croatia in KA2 partnerships, 2014–2026')}</div><div class="muted" style="font-size:30px">${t('Neovisan projekt, nije službena stranica Europske komisije.', 'Independent project; not an official site of the European Commission.')}</div></div>`, tEnd + 0.2, { kind: 'pop' });
  s.on((now) => { const n = document.getElementById('needle2'); if (n) n.setAttribute('transform', `rotate(${(1 - ease((now - tEnd) / 1.8)) * 200} 20 20)`); });
}

/* ---------- frame: header and subtitles ---------- */
const head = document.createElement('div');
head.id = 'head';
const groupsOrder = [...new Set(S.map((s) => s.n))];
head.innerHTML = `${logo(46)}<div class="brand">Erasmus+ Kompas</div><div class="sep"></div><div class="label"></div><div class="ticks">${groupsOrder.map(() => '<div class="tick"></div>').join('')}</div>`;
stage.appendChild(head);
const headLabel = head.querySelector('.label'), ticks = [...head.querySelectorAll('.tick')];
const subBox = document.createElement('div');
subBox.id = 'sub';
subBox.innerHTML = '<div></div>';
stage.appendChild(subBox);
const subEl = subBox.firstChild, allCues = S.flatMap((s) => s.cues);
let lastCue = null;

function seek(t) {
  for (const s of scenes) s.draw(t);
  let cur = S[0];
  for (const s of S) if (t >= s.start - 0.5) cur = s;
  const label = cur.label ? `${cur.group} · ${cur.label}` : cur.group;
  if (headLabel.textContent !== label) headLabel.textContent = label;
  const g = groupsOrder.indexOf(cur.n);
  ticks.forEach((el, i) => { el.className = 'tick' + (i === g ? ' on' : i < g ? ' done' : ''); });
  const ending = t > sec('razvoj').end + 0.5;
  head.style.opacity = ending ? 1 - clamp((t - sec('razvoj').end - 0.5) / 0.4) : 1;
  const cue = allCues.find((c, i) => t >= c.start && t < (allCues[i + 1] && allCues[i + 1].start - c.end < 0.3 ? allCues[i + 1].start : c.end));
  if (cue !== lastCue) { subEl.innerHTML = cue ? cue.lines.join('<br>') : ''; lastCue = cue; }
}
window.seek = seek;
window.primeImages = async () => {
  for (const im of document.images) await im.decode();
  const pause = () => new Promise((r) => setTimeout(r, 400));
  for (const sc of scenes) if (sc.root.querySelector('img')) { seek(sc.from + 1.5); document.body.offsetHeight; await pause(); }
  seek(0); await pause();
};
window.prepareRender = () => { document.body.classList.add('render'); return V.duration; };

/* ---------- player ---------- */
const scrub = document.getElementById('scrub'), clock = document.getElementById('clock'), play = document.getElementById('play');
scrub.max = V.duration;
play.textContent = t('Pokreni', 'Play');
let playing = false, base = 0, began = 0, now = 0;
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function show(t) { now = t; seek(t); scrub.value = t; clock.textContent = `${mmss(t)} / ${mmss(V.duration)}`; }
function loop() { if (!playing) return; const t = base + (performance.now() - began) / 1000; if (t >= V.duration) { playing = false; play.textContent = t('Pokreni', 'Play'); show(V.duration); return; } show(t); requestAnimationFrame(loop); }
function toggle() { playing = !playing; play.textContent = playing ? t('Zaustavi', 'Pause') : t('Pokreni', 'Play'); if (playing) { base = now >= V.duration ? 0 : now; began = performance.now(); requestAnimationFrame(loop); } }
play.onclick = toggle;
scrub.oninput = () => { playing = false; play.textContent = t('Pokreni', 'Play'); show(+scrub.value); };
addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); toggle(); } });
function fit() { if (document.body.classList.contains('render')) return; const f = document.getElementById('frame'); stage.style.transform = `scale(${Math.min(f.clientWidth / 1920, f.clientHeight / 1080)})`; }
addEventListener('resize', fit);
fit();
show(0);
document.fonts.load('600 45px "Src Sans"').then(() => Promise.all([document.fonts.load('700 90px "Src Serif"'), document.fonts.load('700 40px "Src Sans"'), document.fonts.load('500 30px "Src Sans"')])).then(() => Promise.all([...document.images].map((im) => im.decode()))).then(() => { window.READY = true; });

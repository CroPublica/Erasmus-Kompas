/* All animation is a pure function of time: seek(t) draws any moment, so the same page plays in a browser and renders frame by frame. */
const V = window.VIDEO, F = V.fig;
const stage = document.getElementById('stage');
const clamp = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
const num = (n) => String(n).replace(/\B(?=(\d{3})+$)/g, '.');
const pct = (a, b) => (100 * a / b).toFixed(1).replace('.', ',') + ' %';
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
  const tLit = at('problem', 'sudjelovala'), tEnd = at('problem', 'Erasmus+ Kompas pruža');
  const canvasBox = s.add(120, 150, 920, 690, '<canvas width="920" height="690"></canvas>', 0, { kind: 'fade', until: tEnd });
  const ctx = canvasBox.firstChild.getContext('2d');
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
  s.add(1110, 170, 700, 0, '<div class="serif yellow" style="font-size:190px;line-height:1">1 od 3</div>', tLit, { until: tEnd });
  s.add(1110, 372, 700, 0, `<div style="font-size:42px;font-weight:600;line-height:1.2">${num(part)} od ${num(total)} osnovnih i srednjih škola</div><div class="muted" style="font-size:30px;margin-top:10px">sudjelovalo je u KA2 partnerstvima od 2014. (${pct(part, total)})</div>`, tLit + 0.5, { until: tEnd });
  [['Koje su to škole?', 'Koje su'], ['S kim surađuju?', 'S kim'], ['Čime se bave njihovi projekti?', 'Čime se']].forEach(([q, ph], i) => {
    s.add(1110, 590 + i * 80, 720, 66, `<div class="pill" style="height:66px;font-size:36px">${q}</div>`, at('problem', ph), { until: tEnd, kind: 'left' });
  });
  s.add(560, 230, 800, 0, `<div style="display:flex;flex-direction:column;align-items:center;gap:26px">${logo(290, 'needle')}<div class="serif" style="font-size:92px;line-height:1">Erasmus+ Kompas</div></div>`, tEnd + 0.1, { kind: 'pop' });
  const needle = () => document.getElementById('needle');
  s.on((t) => { const n = needle(); if (n) n.setAttribute('transform', `rotate(${(1 - ease((t - tEnd) / 1.8)) * -200} 20 20)`); });
}

/* ---------- 2. Ciljni korisnici ---------- */
{
  const s = scene('korisnici');
  const who = [['Škole', 'school', 'školama'], ['Udruge', 'group', 'udrugama'], ['Gradovi', 'city', 'gradovima'], ['Županije', 'map', 'županijama'], ['Građani', 'person', 'građanima'], ['Novinari', 'press', 'novinarima'], ['Istraživači', 'search', 'istraživačima']];
  const w = 370, h = 300, gx = 40, gy = 46, x0 = (1920 - 4 * w - 3 * gx) / 2;
  who.forEach(([name, ic, word], i) => {
    const row = i < 4 ? 0 : 1, col = i < 4 ? i : i - 4, xs = row === 0 ? x0 : x0 + (w + gx) / 2;
    s.add(xs + col * (w + gx), 170 + row * (h + gy), w, h, `<div class="glass" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px">${icon(ic, 120, '#ffd617')}<div style="font-size:46px;font-weight:700">${name}</div></div>`, at('korisnici', word) - 0.1, { kind: 'pop' });
  });
}

/* ---------- 3. Izvori podataka ---------- */
{
  const s = scene('izvori'), svg = svgLayer(s);
  const t1 = at('izvori', 'Platforme'), t2 = at('izvori', 'Portala'), t3 = at('izvori', 'Agencije'), t4 = at('izvori', 'registre');
  s.add(100, 150, 760, 170, '<div class="box" style="height:100%"><b>Platforma za rezultate projekata Erasmus+</b><small>izvozi KA2, 2014.–2020. i 2021.–2027.</small></div>', t1, { kind: 'left' });
  s.add(100, 350, 760, 480, '<div class="box" style="height:100%;justify-content:flex-start;padding-top:22px"><b>Portal otvorenih podataka</b><small>data.gov.hr</small></div>', t2, { kind: 'left' });
  s.add(130, 465, 700, 160, '<div class="box" style="height:100%"><b>Agencija za mobilnost i programe EU-a</b><small>financirani projekti, prijave</small></div>', t3);
  s.add(130, 645, 700, 160, '<div class="box" style="height:100%"><b>Registri obrazovnih ustanova u Hrvatskoj</b><small>škole, vrtići, visoka učilišta</small></div>', t4);
  line(s, svg, 860, 235, 1040, 440, t1 + 0.4);
  line(s, svg, 860, 590, 1040, 510, t2 + 0.4);
  const tHub = t1 + 0.6;
  s.add(1050, 350, 250, 260, `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px">${logo(170)}<div style="font-weight:700;font-size:32px;text-align:center;line-height:1.1">Erasmus+<br>Kompas</div></div>`, tHub, { kind: 'pop' });
  const rows = [[F.meta.projects, 'projekata'], [F.meta.organisations, 'hrvatskih organizacija'], [F.meta.counties, 'županija']];
  const nums = rows.map(([n, label], i) => {
    const el = s.add(1350, 210 + i * 180, 480, 0, `<div class="serif yellow" style="font-size:96px;line-height:1"><span>0</span></div><div style="font-size:34px;font-weight:600;margin-top:6px">${label}</div>`, t4 - 0.2);
    return { span: el.querySelector('span'), n };
  });
  s.on((t) => { const p = ease((t - (t4 - 0.2)) / 1.6); for (const r of nums) r.span.textContent = num(Math.round(r.n * p)); });
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
  const tMap = at('karta', 'Na karti'), tLo = at('karta', 'od četrnaest'), tHi = at('karta', 'do gotovo');
  const box = s.add(90, 110, 790, 780, `<svg width="790" height="780" viewBox="0 15 1000 985">${names.map((n) => `<path data-n="${n}" d="${G.paths[n]}" stroke="#0b2a5b" stroke-width="3"/>`).join('')}</svg>`, tMap, { kind: 'fade' });
  const paths = [...box.querySelectorAll('path')];
  s.on((t) => {
    for (const p of paths) {
      const n = p.dataset.n, i = order.indexOf(n), r = rate(n), q = ease((t - tMap - 0.2 - i * 0.14) / 0.5);
      p.setAttribute('fill', q <= 0 ? 'rgba(255,255,255,.1)' : ramp((r - lo) / (hi - lo) * q));
      const hot = (n === F.lowest && t > tLo) || (n === F.highest && t > tHi);
      p.setAttribute('stroke', hot ? '#fff' : '#0b2a5b');
      p.setAttribute('stroke-width', hot ? 8 : 3);
    }
    paths.filter((p) => p.dataset.n === F.lowest || p.dataset.n === F.highest).forEach((p) => p.parentNode.appendChild(p));
  });
  s.add(960, 150, 860, 0, '<div style="font-size:44px;font-weight:700;line-height:1.15">Udio osnovnih i srednjih škola s KA2 projektom, po županijama</div>', tMap + 0.3);
  const card = (n, label, t0, y) => {
    const r = F.rates[n];
    s.add(960, y, 860, 200, `<div class="glass" style="height:100%;display:flex;align-items:center;gap:40px;padding:0 40px"><div class="serif yellow" style="font-size:96px;white-space:nowrap">${pct(r[0], r[1])}</div><div><div style="font-size:42px;font-weight:700">${label}</div><div class="muted" style="font-size:32px">${r[0]} od ${r[1]} škola</div></div></div>`, t0, { kind: 'left' });
  };
  card(F.lowest, F.lowest + ' županija', tLo, 310);
  card(F.highest, F.highest + ' županija', tHi, 540);
  s.add(960, 770, 860, 60, `<div style="display:flex;align-items:center;gap:18px;font-size:28px"><span>manje</span><div style="width:360px;height:18px;border-radius:9px;background:linear-gradient(90deg,${ramp(0)},${ramp(0.5)},${ramp(1)})"></div><span>više</span></div>`, tMap + 0.6, { kind: 'fade' });
}

/* ---------- 4. Organizacije ---------- */
{
  const s = scene('organizacije'), O = F.org;
  const tOrg = at('organizacije', 'Svaka'), tN = at('organizacije', 'dvadeset'), tC = at('organizacije', 'a jedan');
  const tF = at('organizacije', 'Popis'), tD = at('organizacije', 'preuzeti');
  s.add(120, 150, 900, 690, `<div class="card" style="height:100%;padding:52px 56px;position:relative"><div class="ink-muted" style="font-size:26px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Organizacija</div><div class="serif" style="font-size:68px;color:#004494;line-height:1.1;margin-top:10px">${O.name}</div><div class="ink-muted" style="font-size:32px;margin-top:10px">${O.town} · ${O.county} županija</div></div>`, tOrg);
  s.add(176, 420, 380, 0, `<div class="serif" style="font-size:120px;line-height:1;color:#004494">${O.projects}</div><div style="font-size:34px;font-weight:600;color:#1d2a44">KA2 projekta</div>`, tN, { kind: 'pop' });
  s.add(590, 420, 380, 0, `<div class="serif" style="font-size:120px;line-height:1;color:#004494">${O.coordinated}</div><div style="font-size:34px;font-weight:600;color:#1d2a44">koordinirani projekt</div>`, tC, { kind: 'pop' });
  s.add(176, 640, 790, 0, `<div class="bars" style="display:flex;gap:6px;height:44px;border-radius:8px;overflow:hidden"><div style="flex:${O.p1};background:#4073af"></div><div style="flex:${O.p2};background:#004494"></div></div><div style="display:flex;gap:6px;font-size:28px;font-weight:600;color:#1d2a44;margin-top:10px"><div style="flex:${O.p1}">2014.–2020.: ${O.p1}</div><div style="flex:${O.p2}">2021.–2027.: ${O.p2}</div></div>`, tN + 0.5, { kind: 'fade' });
  s.add(1090, 150, 740, 0, '<div style="font-size:42px;font-weight:700">Popis organizacija</div>', tF - 0.2);
  [['Županija', 'Sve županije', 'po županiji'], ['Vrsta organizacije', 'Sve vrste', 'vrsti'], ['Razdoblje', 'Sva razdoblja', 'razdoblju']].forEach(([lab, val, ph], i) => {
    s.add(1090, 225 + i * 118, 740, 104, `<div class="glass" style="height:100%;display:flex;align-items:center;justify-content:space-between;padding:0 30px"><div><div class="muted" style="font-size:25px">${lab}</div><div style="font-size:36px;font-weight:600">${val}</div></div><div class="yellow" style="font-size:36px">▾</div></div>`, at('organizacije', ph) - 0.1, { kind: 'left' });
  });
  s.add(1090, 610, 740, 0, '<div style="font-size:34px;font-weight:600">Preuzimanje rezultata</div>', tD);
  ['CSV', 'Excel', 'PDF'].forEach((x, i) => {
    s.add(1090 + i * 250, 670, 230, 110, `<div style="height:100%;background:#ffd617;color:#0b2a5b;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:700">${x}</div>`, at('organizacije', x) - 0.05, { kind: 'pop' });
  });
}

/* ---------- 4. Mreža pojmova ---------- */
{
  const s = scene('mreza'), svg = svgLayer(s), g = F.group, C = F.concept.name;
  const groups = [
    ['Problemi', g.problem.filter((x) => x !== C).slice(0, 3), 110, 150, 'left', 'probleme'],
    ['Pristupi', g.approach.slice(0, 3), 1270, 150, 'right', 'pristupe'],
    ['Ciljne skupine', g.target_group.slice(0, 3), 110, 520, 'left', 'ciljne skupine'],
    ['Rezultati', g.output.slice(0, 3), 1270, 520, 'right', 'rezultate'],
  ];
  const cx = 960, cy = 490, tMesh = at('mreza', 'Mreža'), tHit = at('mreza', 'učenike');
  const pw = 540, ph = 78, gapY = 10;
  groups.forEach(([title, list, x, y, side, word]) => {
    const t0 = at('mreza', word);
    s.add(x, y, pw, 40, `<div class="kind">${title}</div>`, t0);
    list.forEach((label, i) => {
      const py = y + 48 + i * (ph + gapY), hit = label === 'učenici u nepovoljnom položaju';
      s.add(x, py, pw, ph, `<div class="pill" style="height:100%;font-size:28px">${label}</div>`, t0 + 0.12 * i);
      line(s, svg, side === 'left' ? cx - 240 : cx + 240, cy, side === 'left' ? x + pw : x, py + ph / 2, tMesh + 0.1 * i, { arrow: false, color: 'rgba(191,208,228,.55)', w: 2.5 });
      if (hit) {
        line(s, svg, cx - 240, cy, x + pw, py + ph / 2, tHit, { arrow: false, color: '#ffd617', w: 7 });
        s.add(x - 7, py - 7, pw + 14, ph + 14, '<div style="height:100%;border:6px solid #ffd617;border-radius:18px"></div>', tHit, { kind: 'fade' });
      }
    });
  });
  s.add(cx - 240, cy - 75, 480, 150, `<div style="height:100%;background:#ffd617;color:#0b2a5b;border-radius:18px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:40px;font-weight:700;line-height:1.1;padding:0 24px">${C}</div>`, tMesh - 0.15, { kind: 'pop' });
}

/* ---------- 4. Pitanja ---------- */
{
  const s = scene('pitanja'), A = F.concept, Q = 'rani prekid školovanja';
  const tA = at('pitanja', 'Također'), tL = at('pitanja', 'na hrvatskom'), tQ = at('pitanja', 'Na upit'), tR = at('pitanja', 'rano napuštanje'), tN = at('pitanja', 'pronalazi'), tE = at('pitanja', 's primjerima');
  s.add(250, 120, 1420, 750, `<div class="card" style="height:100%;padding:34px 44px"><div style="display:flex;align-items:center;gap:18px">${logo(58)}<div style="font-size:38px;font-weight:700;color:#004494">Asistent</div></div></div>`, tA);
  ['HR', 'EN'].forEach((x, i) => s.add(1450 + i * 94, 150, 84, 58, `<div style="height:100%;background:#004494;color:#fff;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:700">${x}</div>`, tL + i * 0.4, { kind: 'pop' }));
  const ask = s.add(690, 216, 936, 84, '<div style="height:100%;background:#004494;color:#fff;border-radius:16px 16px 4px 16px;display:flex;align-items:center;justify-content:flex-end;padding:0 30px;font-size:38px;font-weight:600"><span></span></div>', tQ, { kind: 'fade', d: 0.2 });
  const span = ask.querySelector('span');
  s.on((t) => { const n = Math.round(clamp((t - tQ - 0.1) / 1.5) * Q.length); span.textContent = Q.slice(0, n) + (n < Q.length && t >= tQ ? '|' : ''); });
  s.add(294, 324, 1330, 0, `<div class="ink-muted" style="font-size:32px;font-style:normal">${F.answer_intro}</div><div class="serif" style="font-size:58px;line-height:1.1;color:#004494;margin-top:8px">${A.name}</div>`, tR);
  s.add(294, 470, 520, 0, `<div style="display:flex;align-items:baseline;gap:18px;color:#1d2a44"><div class="serif" style="font-size:124px;line-height:1;color:#004494">${A.n}</div><div style="font-size:42px;font-weight:700">projekta</div></div><div style="font-size:30px;color:#566782;font-weight:600;margin-top:4px">${A.p1} u 2014.–2020. · ${A.p2} u 2021.–2026.</div>`, tN, { kind: 'pop' });
  s.add(840, 470, 790, 0, `<div class="ink-muted" style="font-size:26px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Primjeri projekata</div>${F.examples.map((x) => `<div style="font-size:30px;font-weight:600;color:#1d2a44;margin-top:10px;line-height:1.15">${x}</div>`).join('')}`, tE);
  s.add(294, 720, 1330, 0, '<div style="border-top:2px solid #d9e0ec;padding-top:16px;font-size:29px;color:#566782;font-weight:600">Izvor: sažeci projekata, Platforma za rezultate projekata Erasmus+</div>', tE + 0.5, { kind: 'fade' });
}

/* ---------- 5. Tehnička arhitektura ---------- */
{
  const s = scene('arhitektura'), svg = svgLayer(s);
  const W = 310, Hh = 108, gap = 28, x = (i) => 120 + i * (W + gap), R1 = 158, R2 = 335, R3 = 512;
  const p = (ph) => at('arhitektura', ph);
  const t1 = p('Podaci se'), t2 = p('a iz nje'), t3 = p('Sažetke'), t4 = p('a algoritam'), t5 = p('Kad korisnik'), t6 = p('model samo'), t7 = p('Alati'), t8 = p('a odgovor'), t9 = p('Zato');
  const bx = (col, y, title, small, t0, hot) => s.add(x(col), y, W, Hh, `<div class="box ${hot ? 'hot' : ''}" style="height:100%"><b>${title}</b><small>${small}</small></div>`, t0, { kind: 'pop' });
  const lab = (y, text, t0) => s.add(120, y - 42, 900, 36, `<div class="kind" style="font-size:25px">${text}</div>`, t0, { kind: 'fade' });
  const arrow = (a, y, t0) => line(s, svg, x(a) + W + 3, y + Hh / 2, x(a + 1) - 4, y + Hh / 2, t0, { d: 0.35 });
  lab(R1, 'Obrada podataka', t1);
  bx(0, R1, 'Izvorne datoteke', 'CSV, XLSX', t1);
  bx(1, R1, 'Python', 'obrada i spajanje', t1 + 0.6); arrow(0, R1, t1 + 0.4);
  bx(2, R1, 'DuckDB', 'jedna baza', p('u bazu')); arrow(1, R1, p('u bazu') - 0.2);
  bx(3, R1, 'Astro', 'gradnja stranica', p('alatu') - 0.3); arrow(2, R1, t2);
  bx(4, R1, 'Web-sjedište', 'statične datoteke', p('alatu') + 0.2); arrow(3, R1, p('alatu'));
  lab(R2, 'Obrada sažetaka', t3);
  bx(0, R2, 'Sažeci projekata', 'iz izvoza s Platforme', t3);
  bx(1, R2, 'Jezični model', 'pokrenut lokalno', p('jezični model')); arrow(0, R2, p('jezični model') - 0.2);
  bx(2, R2, 'Algoritam', 'grupiranje pojmova', t4 + 0.2); arrow(1, R2, t4);
  line(s, svg, x(2) + W / 2, R2 - 3, x(2) + W / 2, R1 + Hh + 4, t4 + 0.8, { d: 0.35 });
  lab(R3, 'Odgovor na pitanje', t5);
  bx(0, R3, 'Pitanje', 'hrvatski ili engleski', t5);
  bx(1, R3, 'Model', 'samo usmjerava upit', t6, true); arrow(0, R3, t6 - 0.2);
  bx(2, R3, 'Alati', 'dohvaćaju podatke', t7); arrow(1, R3, t7 - 0.2);
  bx(3, R3, 'Kôd', 'sastavlja odgovor', t8, true); arrow(2, R3, t8 - 0.2);
  bx(4, R3, 'Odgovor', 'brojke i izvori', t8 + 0.7); arrow(3, R3, t8 + 0.5);
  s.add(120, 668, 1680, 130, '<div style="height:100%;display:flex;align-items:center;justify-content:center;border:3px solid #ffd617;border-radius:18px;font-size:58px;line-height:1.1"><span class="serif yellow">Brojke proizlaze iz podataka, a ne iz modela.</span></div>', t9, { kind: 'pop' });
}

/* ---------- 6. Korisnička vrijednost ---------- */
{
  const s = scene('vrijednost'), C = F.county, G = F.geo, stem = F.org.county;
  const t1 = at('vrijednost', 'Škole'), t2 = at('vrijednost', 'već sudjeluje'), t3 = at('vrijednost', 'čime se'), t4 = at('vrijednost', 'Građani'), t5 = at('vrijednost', 'saznati');
  s.add(100, 130, 840, 730, `<div class="glass" style="height:100%;padding:36px 44px"><div style="display:flex;align-items:center;gap:22px">${icon('school', 78, '#ffd617')}<div style="font-size:54px;font-weight:700">Škole</div></div></div>`, t1, { kind: 'left' });
  s.add(130, 268, 380, 380, `<svg width="380" height="380" viewBox="0 15 1000 985">${Object.keys(G.paths).map((n) => `<path d="${G.paths[n]}" fill="${n === stem ? '#ffd617' : 'rgba(191,208,228,.28)'}" stroke="#0b2a5b" stroke-width="4"/>`).join('')}</svg>`, t1 + 0.4, { kind: 'fade' });
  s.add(540, 268, 380, 0, `<div class="muted" style="font-size:30px;font-weight:600;line-height:1.15">Primjer: ${C.name}</div><div class="serif yellow" style="font-size:76px;margin-top:14px;line-height:1">${C.organisations}</div><div style="font-size:31px;font-weight:600">organizacije</div><div class="serif yellow" style="font-size:76px;margin-top:14px;line-height:1">${C.projects}</div><div style="font-size:31px;font-weight:600">KA2 projekt</div>`, t1 + 0.7);
  s.add(140, 668, 760, 104, '<div class="pill" style="height:104px;font-size:33px">Koje organizacije u mojoj županiji već sudjeluju u projektima?</div>', t2 - 0.5, { kind: 'left' });
  s.add(140, 782, 760, 62, '<div class="pill" style="height:62px;font-size:33px">Čime se ti projekti bave?</div>', t3 - 0.1, { kind: 'left' });
  s.add(980, 130, 840, 730, '<div class="glass" style="height:100%"></div>', t4, { kind: 'left' });
  [['Građani', 'person'], ['Novinari', 'press'], ['Istraživači', 'search']].forEach(([n, ic], i) => {
    s.add(1014 + i * 262, 180, 250, 0, `<div style="display:flex;flex-direction:column;align-items:center;gap:14px">${icon(ic, 112, '#ffd617')}<div style="font-size:40px;font-weight:700">${n}</div></div>`, at('vrijednost', n === 'Građani' ? 'Građani' : n === 'Novinari' ? 'novinari' : 'istraživači'), { kind: 'pop' });
  });
  s.add(1030, 450, 740, 0, `<div class="serif" style="font-size:62px;line-height:1.12">Saznajte više o partnerstvima u svojem kraju.</div><div class="muted" style="font-size:33px;margin-top:22px;line-height:1.2">${num(F.meta.projects)} projekata i ${num(F.meta.organisations)} organizacija u ${F.meta.counties} županiji, na jednom mjestu.</div>`, t5);
}

/* ---------- 7. Daljnji razvoj i odjavna kartica ---------- */
{
  const s = scene('razvoj'), last = sec('razvoj').end;
  const items = [['partners', 'Alat za traženje partnera', 'alat za'], ['flag', 'Vodič za prvi projekt', 'vodič'], ['refresh', 'Redovito osvježavanje podataka svake godine', 'redovito'], ['code', 'Javni API', 'javni API']];
  const w = 395, g = 30, x0 = (1920 - 4 * w - 3 * g) / 2, tEnd = last + 0.5;
  s.add(x0, 140, 1000, 0, '<div class="serif" style="font-size:66px">U planu</div>', sec('razvoj').start, { until: tEnd });
  items.forEach(([ic, text, ph], i) => {
    s.add(x0 + i * (w + g), 270, w, 430, `<div class="glass" style="height:100%;padding:40px 34px;display:flex;flex-direction:column;gap:30px">${icon(ic, 110, '#ffd617')}<div style="font-size:45px;font-weight:700;line-height:1.14">${text}</div></div>`, at('razvoj', ph) - 0.1, { until: tEnd, kind: 'pop' });
  });
  s.add(360, 190, 1200, 0, `<div style="display:flex;flex-direction:column;align-items:center;gap:28px;text-align:center">${logo(270, 'needle2')}<div class="serif" style="font-size:100px;line-height:1">Erasmus+ Kompas</div><div style="font-size:42px;font-weight:600">Hrvatska u KA2 partnerstvima, 2014.–2026.</div><div class="muted" style="font-size:30px">Neovisan projekt, nije službena stranica Europske komisije.</div></div>`, tEnd + 0.2, { kind: 'pop' });
  s.on((t) => { const n = document.getElementById('needle2'); if (n) n.setAttribute('transform', `rotate(${(1 - ease((t - tEnd) / 1.8)) * 200} 20 20)`); });
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
window.prepareRender = () => { document.body.classList.add('render'); return V.duration; };

/* ---------- player ---------- */
const scrub = document.getElementById('scrub'), clock = document.getElementById('clock'), play = document.getElementById('play');
scrub.max = V.duration;
let playing = false, base = 0, began = 0, now = 0;
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function show(t) { now = t; seek(t); scrub.value = t; clock.textContent = `${mmss(t)} / ${mmss(V.duration)}`; }
function loop() { if (!playing) return; const t = base + (performance.now() - began) / 1000; if (t >= V.duration) { playing = false; play.textContent = 'Pokreni'; show(V.duration); return; } show(t); requestAnimationFrame(loop); }
function toggle() { playing = !playing; play.textContent = playing ? 'Zaustavi' : 'Pokreni'; if (playing) { base = now >= V.duration ? 0 : now; began = performance.now(); requestAnimationFrame(loop); } }
play.onclick = toggle;
scrub.oninput = () => { playing = false; play.textContent = 'Pokreni'; show(+scrub.value); };
addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); toggle(); } });
function fit() { if (document.body.classList.contains('render')) return; const f = document.getElementById('frame'); stage.style.transform = `scale(${Math.min(f.clientWidth / 1920, f.clientHeight / 1080)})`; }
addEventListener('resize', fit);
fit();
show(0);
document.fonts.load('600 45px "Src Sans"').then(() => Promise.all([document.fonts.load('700 90px "Src Serif"'), document.fonts.load('700 40px "Src Sans"'), document.fonts.load('500 30px "Src Sans"')])).then(() => { window.READY = true; });

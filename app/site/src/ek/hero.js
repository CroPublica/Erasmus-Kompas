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

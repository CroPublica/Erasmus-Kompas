/* ============ jezik sučelja (HR / EN) ============
   Tekstovi u prikazima pisani su hrvatski. Za engleski ih prevodi ovaj sloj nad DOM-om:
   svaki tekstualni čvor (i atributi placeholder, aria-label, title, alt) pretvara se u ključ
   u kojem su brojevi {N}, a nazivi županija, sektora, vrsta projekata i organizacija {E}.
   Ključ se traži u rječniku EN_DICT (i18n-en.js). Brojevi, nazivi država i podaci iz izvora
   ne prolaze kroz rječnik: formatira ih izvor (fmt, dec, country) prema LANG. */
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
    if (hr.endsWith(' županija')) { const s = hr.slice(0, -9), e = EN_ENT[s] || s; return /County$/.test(e) ? e : `${e} County`; }
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
    if (!hasL(bare) && !p.e.length && EN_DICT[p.key] == null) { const nn = norm(m[2]); return nn === m[2] ? raw : m[1] + nn + m[3]; }   /* a text of one-letter words ("10 u 2014–2020") is still looked up */
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
  function collect(root = document.body) {
    const out = new Map();
    const add = (raw, where) => { const m = /^\s*([\s\S]*?)\s*$/.exec(raw); if (!m[1]) return; const p = parse(m[1]); if (hasL(p.key.replace(/\{[NE]\}/g, ''))) { if (!out.has(p.key)) out.set(p.key, { raw: m[1], where }); } };
    walk(root, { t: (n) => add(n.data, (n.parentElement && (n.parentElement.closest('[id],[class]') || n.parentElement).tagName + '.' + (n.parentElement.className || '')).slice(0, 60)), a: (el) => { for (const a of ATTRS) if (el.hasAttribute(a)) add(el.getAttribute(a), '@' + a); } });
    return [...out].map(([key, v]) => ({ key, ...v }));
  }
  const watch = () => obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });

  function setLang(l, opts = {}) {
    if (l === LANG && !opts.force) return;
    obs.disconnect();
    if (l === 'hr') toHR(document.body);
    LANG = l; document.documentElement.lang = l;
    tr = l === 'en' ? (s) => (typeof s === 'string' ? translate(s) : s) : (s) => s;
    try { regionNames = new Intl.DisplayNames([l], { type: 'region' }); } catch (e) { /* ostaje prethodni */ }
    $$('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === l)));
    try { localStorage.setItem('ek-lang', l); } catch (e) { /* privatni način ili ograničenje */ }
    if (l === 'en') toEN(document.body);
    watch();
    const y = window.scrollY, navOpen = document.body.classList.contains('navopen');
    if (typeof paintDate === 'function') paintDate();
    if (typeof route === 'function') route();
    window.scrollTo(0, y); if (navOpen) setNav(true);
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

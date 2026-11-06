/* ============ pretraga: traka u glavnom dijelu stranice ============ */
let gsN = 0;
const searchHTML = (cls = '') => {
  const id = 'gs' + (++gsN);
  return `<div class="gsearch ${cls}" role="search"><svg class="gi" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><label class="sr" for="${id}">Pretražite atlas</label><input id="${id}" type="search" placeholder="Pretražite županije, organizacije, projekte…" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="${id}-r"><kbd aria-hidden="true">/</kbd><div class="gres" id="${id}-r" hidden></div></div>`;
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
        + grp('Asistent', [item('#/pitajte', `Pitajte asistenta: „<span translate="no">${esc(raw)}</span>”`, 'odgovor iz podataka atlasa', `data-ask="${esc(raw)}"`, true)]);
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
    host.innerHTML = `<button type="button" class="pickbtn${cur ? ' set' : ''}" aria-haspopup="listbox" aria-expanded="${popOpen}"${dis ? ' disabled' : ''}${labelled}><span class="v">${esc(vn)}</span>${CHEV}</button><div class="pop" role="dialog" aria-label="${esc(lab ? lab.textContent : 'Odabir')}"${popOpen ? '' : ' hidden'}><div class="popsearch"><input type="search" placeholder="Pretražite popis…" autocomplete="off" aria-label="Pretražite popis"></div><ul role="listbox" class="poplist">${opts.map((x) => { const [n, c] = splitOpt(x.text); return `<li role="presentation" data-n="${esc(fold(n + ' ' + tr(n)))}"><button type="button" role="option" aria-selected="${x.value === cur}" data-v="${esc(x.value)}">${CHECK}<span>${esc(n)}</span>${c ? `<em>${c}</em>` : ''}</button></li>`; }).join('')}</ul><p class="popnone" hidden>Nema rezultata.</p></div>`;
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

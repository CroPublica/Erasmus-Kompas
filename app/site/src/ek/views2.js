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
    box.innerHTML = rank(cl.map((c) => ({ label: clsName(c.org_class), v: c.projects_coordinated, text: fmt(c.projects_coordinated), st: pct(c.projects_coordinated / tt, 0) + ' %' })), { nonum: true });
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
    <article class="card kpi"><small>Koordinirano</small><div class="big">${fmt(a.projects_coordinated || 0)}</div><small>Bespovratna sredstva: ${mil(a.grants_coordinated_eur || 0)}</small></article>
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
new MutationObserver(enhSoon).observe($('#view'), { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed'] });
$('#view').addEventListener('change', enhSoon); $('#view').addEventListener('input', enhSoon); window.addEventListener('resize', enhSoon);

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
  FULL.project(id).then((f) => { if (f && root.isConnected && my === seq && decodeURIComponent(window.__h || location.hash).endsWith(id)) { F = f; paint(); } });
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
  <div class="stack"><section class="card"><h2>Kako koristiti podatke</h2><ul class="check-list" style="margin-top:14px"><li>Navedite izvore: Erasmus+ Project Results Platform (Europska komisija), Program Erasmus+ 2021.–2027. i registri ustanova na data.gov.hr (Agencija za mobilnost i programe EU, Ministarstvo znanosti, obrazovanja i mladih).</li><li>Provjerite uvjete korištenja u izvoru; atlas ne mijenja licence izvornih skupova.</li><li>Pročitajte <a href="#/o-podacima">ograničenja podataka</a> prije usporedbi.</li></ul></section>
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
      <article class="src"><a href="https://data.gov.hr/ckan/hr/dataset/osnovne-skole" target="_blank" rel="noopener noreferrer">Registri ustanova</a><small>Ministarstvo znanosti, obrazovanja i mladih · data.gov.hr</small><p>Dječji vrtići, osnovne i srednje škole te visoko obrazovanje, za izračun pokrivenosti.</p></article>
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

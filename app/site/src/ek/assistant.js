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
  if (/izvor|odakle|podac|source|where|data/.test(f)) return { text: T('Podaci dolaze iz tri javna izvora: Erasmus+ Project Results Platform (Europska komisija), portala data.gov.hr (Agencija za mobilnost i programe EU) i registara škola Ministarstva znanosti, obrazovanja i mladih. Atlas ih povezuje i izračunava pokazatelje, ništa se ne unosi ručno.', 'The data comes from three public sources: the Erasmus+ Project Results Platform (European Commission), the data.gov.hr portal (Agency for Mobility and EU Programmes) and the school registers of the Ministry of Science, Education and Youth. The atlas links them and calculates the indicators; nothing is entered by hand.'), src: [[T('O podacima', 'About the data'), '#/o-podacima']], steps: [T('Tema: izvori podataka', 'Topic: data sources'), T('Stranica: O podacima', 'Page: About the data')] };
  return { text: T('Na to pitanje u podacima atlasa nemam odgovor. Mogu odgovoriti o županijama, organizacijama, partnerskim državama, temama, sektorima, vrijednosti projekata i pokrivenosti škola. Probajte jedno od predloženih pitanja.', 'I have no answer to that question in the atlas data. I can answer about counties, organisations, partner countries, topics, sectors, project value and school coverage. Try one of the suggested questions.'), src: [[T('Mapa stranice', 'Site map'), '#/mapa-stranice']], steps: [T('Pitanje nije prepoznato među temama atlasa', 'The question was not recognised among the atlas topics')], none: true };
}

/* ============ pravi asistent (neobavezno) ============
   Zadano: ako je stranica posluzena preko http(s) i <api>/health odgovara, pitanja idu na POST <api>/ask
   (isti ugovor kao u repozitoriju: {question,last_org_id} -> {answer,citations,tools,route,fallback,last_org_id}).
   Inace (file://, nema API-ja, Ollama ne radi) asistent odgovara iz ugrađenih izračuna nad podacima.
   Postavke prije učitavanja skripte:  window.EK_ASK_API = '/api/ask'  (adresa)  |  false  (uvijek ugrađeni odgovori). */
const AskAPI = (() => {
  let lastOrg = null, probe = null;
  const T = (hr, en) => (LANG === 'en' ? en : hr);                 // T of canned() is local to it: this module needs its own
  const url = () => { const c = window.EK_ASK_API; if (c === false) return null; if (typeof c === 'string' && c) return c; return /^https?:$/.test(location.protocol) ? '/api/ask' : null; };
  const tmo = (ms) => { const c = new AbortController(); return [c.signal, setTimeout(() => c.abort(), ms)]; };
  function available() {
    if (probe) return probe; const u = url();
    probe = !u ? Promise.resolve(null) : (async () => { const [sig, t] = tmo(2500); try { const r = await fetch(u.replace(/\/ask\/?$/, '') + '/health', { signal: sig }); return r.ok ? u : null; } catch (e) { return null; } finally { clearTimeout(t); } })();
    probe.then((a) => { document.documentElement.dataset.ask = a ? 'api' : 'demo'; if (a && window.console) console.info('[Erasmus+ Kompas] Asistent koristi API: ' + a); });
    return probe;
  }
  const ROUTE_NAME = { county_ranking: ['rang županija', 'ranking of counties'], county: ['jedna županija', 'one county'], county_project: ['projekt u županiji', 'project in a county'], top_organisations: ['najaktivnije organizacije', 'most active organisations'],
    organisation: ['jedna organizacija', 'one organisation'], national: ['Hrvatska u cjelini', 'Croatia as a whole'], coverage: ['pokrivenost škola', 'school coverage'], country_ranking: ['rang država', 'ranking of countries'],
    partner_countries: ['partnerske države', 'partner countries'], project_search: ['pretraga projekata', 'project search'], concepts: ['sadržaj projekata', 'project content'], glossary: ['rječnik', 'glossary'],
    year_count: ['projekti po godini poziva', 'projects by call year'], value: ['vrijednost projekata', 'project value'], success: ['prolaznost prijava', 'success rate'], limits: ['izvan obuhvata (KA1/KA3)', 'outside the scope (KA1/KA3)'] };
  const TOOL_NAME = { county_ranking: ['rang županija', 'county ranking'], county_stats: ['podaci o županiji', 'county figures'], county_project: ['n-ti projekt županije', 'n-th project of a county'], top_organisations: ['najaktivnije organizacije', 'most active organisations'],
    organisation_profile: ['profil organizacije', 'organisation profile'], find_organisation: ['traženje organizacije', 'organisation lookup'], national_stats: ['državni pokazatelji', 'national figures'], partner_countries: ['partnerske države', 'partner countries'],
    country_stats: ['države koordinatori', 'coordinating countries'], coverage: ['pokrivenost škola', 'school coverage'], search_projects: ['pretraga projekata', 'project search'], search_concepts: ['pretraga pojmova', 'concept search'],
    concept_profile: ['profil pojma', 'concept profile'], common_concepts: ['najčešći pojmovi', 'most common concepts'], community_overview: ['skupine pojmova', 'concept groups'], concept_trends: ['trendovi pojmova', 'concept trends'],
    connected_concepts: ['povezani pojmovi', 'connected concepts'], glossary: ['rječnik', 'glossary'], year_projects: ['projekti jedne godine poziva', 'projects of one call year'], success_rate: ['prolaznost prijava', 'success rate'], similar_organisations: ['slične organizacije', 'similar organisations'] };
  const ARG_NAME = { period: ['razdoblje', 'period'], limit: ['broj', 'limit'], county: ['županija', 'county'], role: ['uloga', 'role'], year: ['godina', 'year'], n: ['redni broj', 'number'], order: ['redoslijed', 'order'], text: ['pojam', 'term'] };
  const GLOSS_NAME = { coordinator: ['Koordinator', 'Coordinator'], partner: ['Partner', 'Partner'], ka2: ['KA1 i KA2', 'KA1 and KA2'], 'call-year': ['Godina poziva', 'Call year'], grant: ['Vrijednost projekata', 'Project value'], 'good-practice': ['Dobra praksa', 'Good practice'], coverage: ['Pokrivenost škola', 'School coverage'] };
  const link = (c) => {
    const i = c.indexOf(':'), k = c.slice(0, i), id = c.slice(i + 1);
    if (k === 'org') { const o = D.orgs.find((x) => x[0] === id); return [o ? o[1] : id.replace(/^(OID|MZO)-/, ''), '#/organizacije/' + encodeURIComponent(id)]; }
    if (k === 'project') { const p = D.projects.find((x) => x[0] === id); return [p ? p[1] : id, '#/projekti/' + encodeURIComponent(id)]; }
    if (k === 'county') { const z = countyBy(id); return [z ? shortCounty(z) : id, '#/mjesta/' + encodeURIComponent(id)]; }
    if (k === 'concept') return [id.replace(/^TOP:/, ''), '#/graf'];
    if (k === 'glossary') return [T('Rječnik: ', 'Glossary: ') + (GLOSS_NAME[id] ? T(...GLOSS_NAME[id]) : id), '#/rjecnik'];
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
      const tools = (a.tools || []).map((x) => T('Izračun: ', 'Calculation: ') + (TOOL_NAME[x.tool] ? T(...TOOL_NAME[x.tool]) : x.tool) + (Object.entries(x.args || {}).some(([, v]) => v !== null && v !== undefined) ? ' (' + Object.entries(x.args || {}).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => (ARG_NAME[k] ? T(...ARG_NAME[k]) : k) + ': ' + v).join('; ') + ')' : ''));
      return { real: { real: true, text: String(a.answer || ''), src: (a.citations || []).map(link), steps: [(a.route ? T('Vrsta pitanja: ', 'Question type: ') + (ROUTE_NAME[a.route] ? T(...ROUTE_NAME[a.route]) : a.route) : ''), ...tools].filter(Boolean), fallback: !!a.fallback } };
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
  function paint() { for (const m of mounts) { m.log.innerHTML = `<div class="msgs">${thread.length ? thread.map(msg).join('') : ''}</div>` + (thread.length ? '' : welcome()); m.log.scrollTop = m.log.scrollHeight; } $$('.sug button[data-q]').forEach((b) => b.onclick = () => ask(b.textContent.trim())); const c = $('#dock-ctx'); if (c) c.innerHTML = `<span class="ctx">Gledate: <b>${esc(ctx.title)}</b></span>`; }
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
    <form id="pf"><label class="sr" for="pq">Pitanje</label><div class="composer"><textarea id="pq" rows="1" maxlength="500" placeholder="${document.documentElement.lang === 'en' ? 'Type a question about the data…' : 'Upišite pitanje o podacima…'}" required></textarea><button class="send" type="submit" id="pg" aria-label="Pošalji"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div></form></section>
  <aside class="topics card" aria-label="Što možete pitati"><h2>Što možete pitati</h2>${TOP.map(([t, qs]) => `<div><h3>${t}</h3><div class="sug">${qs.map((q) => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`).join('')}<p class="small muted">Asistent ne zna ništa izvan ovih podataka i može pogriješiti. Provjerite izvore ispod odgovora.</p></aside></div>`;
  const off = Assistant.mount($('#pl', root), $('#pf', root), $('#pq', root), $('#pg', root));
  route.cleanup = off; $('#pnew', root).onclick = () => Assistant.reset();
  $$('.topics .sug button', root).forEach((b) => b.onclick = () => Assistant.ask(b.textContent.trim()));
}

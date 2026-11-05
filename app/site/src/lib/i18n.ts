import topicLabels from '../data/topic_labels.json';
// Interface strings and number formatting. Data content (project titles, summaries, EU type names) is not translated here.
export const LANGS = ['hr', 'en'] as const;
export type Lang = (typeof LANGS)[number];

const T = {
  en: {
    site: 'ERASMUS+ KOMPAS', tagline: 'Erasmus+ partnerships · Croatia',
    nav: { graph: 'Concept network', coverage: 'Coverage map', orgs: 'Organisations', places: 'Places', ask: 'Ask' },
    soon: 'coming soon', search: 'Search', searchPh: 'Organisation, town…',
    coverageKicker: 'COVERAGE · KA2 PARTNERSHIPS 2014–2026', coverageTitle: 'Which schools take part?',
    coverageLead: 'Share of schools in each county that took part in at least one KA2 partnership, as coordinator or partner.',
    schoolsNationally: 'schools nationally', institutions: 'Institutions',
    both: 'Primary + secondary', primary: 'Primary', secondary: 'Secondary', kindergarten: 'Kindergartens',
    periodLbl: 'Period', roleLbl: 'Role', anyRole: 'Any', coordOnly: 'Coordinator', pAll: '2014–2026', p1: '2014–2020', p2: '2021–2026',
    askTitle: 'Ask the data', askLead: 'Ask in Croatian or English about Croatian KA2 partnerships. Answers come from the data, with sources; if there is no evidence, it says so.',
    askPh: 'e.g. How many KA2 projects does Gimnazija Metković have?', askBtn: 'Ask', askWorking: 'Looking it up…', askSources: 'Sources', askHow: 'Show how I got this',
    askBusy: 'The service is busy. Try again in a moment.', askErr: 'Something went wrong. Please try again.', askLimit: 'Too many questions. Wait a minute.',
    askUnverified: 'This answer was assembled directly from the data tables.', askExamples: 'Try one of these', askHint: 'Enter to send · Shift+Enter for a new line', askCopy: 'Copy', askCopied: 'Copied',
    askTools: 'Data lookups used', askQ: 'Your question', askRoute: 'Question type',
    examples: ['How many KA2 projects does the University of Dubrovnik have?', 'Which counties are clearly above or below the national rate for schools?', 'Which country coordinates the most KA2 projects?', 'Is there any KA2 project by Gimnazija Dubrovnik?', 'How many projects deal with early school leaving?', 'Which problems do KA2 projects address most often?'],
    ovTitle: 'Croatia in KA2 at a glance', ovLead: 'Numbers for every KA2 project with at least one Croatian participant, and how Croatia compares with other countries.',
    ovProjects: 'KA2 projects with a Croatian participant', ovCoordinated: 'coordinated from Croatia', ovShare: 'of all KA2 projects in the EU', ovValue: 'Value of all these projects',
    ovPeriod: 'Period', ovWho: 'Who coordinates from Croatia', ovWhoNote: (ngo: number, typed: number) => `Non-governmental organisations: ${ngo} projects, of which ${typed} are typed NGO in the EU export; the rest come from filling blank types from other records of the same organisation and from counting European civil-society organisations.`, ovWhoLead: 'Projects coordinated by Croatian organisations, by type of organisation.',
    ovCountries: 'Which countries coordinate most KA2 projects', ovCountriesLead: 'Number of KA2 projects coordinated from each country in the EU export (all participants, not only Croatian ones).',
    ovRank: 'Rank', ovCountry: 'Country', ovCoordProj: 'Projects coordinated', ovCroatiaRanks: (r: string, n: string) => `Croatia ranks ${r} of ${n} coordinating countries.`,
    classNames: { ngo: 'Non-governmental organisations', higher_education: 'Higher education institutions', school_vocational: 'Vocational schools', school_primary: 'Primary schools', adult_education: 'Adult education providers', school_secondary_general: 'General secondary schools', public_body: 'Public bodies', sme_business: 'Businesses', school_preprimary: 'Early childhood education and care institutions', other: 'Other organisations', research: 'Research organisations' } as Record<string, string>,
    nav2: { overview: 'Overview', projects: 'Projects', topics: 'Topics', methods: 'Methods' },
    sortBy: 'Sort by', sortProjects: 'Most projects', sortCoordinated: 'Most coordinated', sortName: 'Name (A–Z)', anyPeriod: 'All years', coordOnly: 'Coordinators only', allTypes: 'All types',
    pjTitle: 'Find projects', pjLead: 'Search the titles and topics of the 3,830 KA2 projects with a Croatian participant. Project texts are in the language they were submitted in.',
    pjSearch: 'Words in the title or topic', pjPeriod: 'Period', pjType: 'Action type', pjCountry: 'Partner country', pjAnyCountry: 'Any country', pjAnyType: 'Any type', pjGp: 'Good practice only',
    pjResults: 'projects found', pjMore: 'Showing the first 100; narrow the search to see the rest.', pjNone: 'No project matches these filters.',
    topTitle: 'Topics over time', topLead: 'How often each EU topic is chosen by KA2 projects with a Croatian participant, by call year. Use it to see what became more or less common.',
    topBreakNote: 'The EU replaced its topic list in 2021. Only topics with the same name in both lists are drawn across the break; the others stop or start there. Linking differently named topics would be a guess.',
    topBreak: 'topic list changed', topBoth: 'In both topic lists', topNew: 'Only in the 2021–2027 list', topOld: 'Only in the 2014–2020 list',
    topShare: 'Share of projects that have a topic', topPartial: '2026 is a partial year (hollow point).', topPick: 'Choose topics (up to 8)', topTable: 'Show data table',
    topNames: 'Topic names are the EU’s own and are shown in English.', topCount: 'Projects', topYear: 'Call year', topFilter: 'Filter topics', topNone: 'Choose at least one topic.',
    similar: 'Similar organisations', similarLead: 'Same type of institution in the same county, same town first. Distances are not shown.', noKa2: 'No KA2 projects found since 2014', sameTown: 'same town',
    euCard: 'View on the Erasmus+ Project Results Platform', projectSite: 'Project website', euLinks: 'On the web',
    projectKicker: 'PROJECT', summary: 'Summary', participants: 'Croatian participants', partners: 'Partner countries', grant: 'Grant', grantNote: 'Indicative amount awarded at selection for the whole project, not split between partners.', gpNote: 'Marked as good practice', notComparable: 'School exchange partnerships pay each school its own grant, so this total is not comparable with other KA2 projects.', summaryNote: 'Project text is in the language it was submitted in.', topicsLbl: 'Topics', conceptsLbl: 'Key concepts', conceptsNote: 'A language model picked these out of the summary; each links to what usually goes with it in the concept network.', noTopics: 'No topics listed in the source.',
    byCounty: 'By county', byCountyLead: 'One equal tile per county, placed roughly where it lies, so small counties stay visible.',
    ranked: 'Ranked, with uncertainty',
    rankedLead: 'Bars show the 95 % range. Only counties whose whole bar sits off the national line differ clearly; small counties have wide bars.',
    county: 'County', schools: 'Schools', expected: 'Expected', national: 'national', shareOfSchools: 'Share of schools',
    above: 'clearly above national', below: 'clearly below national',
    method: 'Method: KA2 participants matched to the school registry by name and postcode; the 51 matches that were not exact were checked by hand. Expected = each county’s schools × the national rate for its school type. 95 % ranges are Wilson intervals. KA1 mobility is not included, so a school active only in KA1 counts as not taking part. Kindergartens have their own filter and are not part of “Primary + secondary”.',
    sources: 'Sources', provenance: 'Sources: Erasmus+ Project Results Platform, KA2 exports 2014–2020 and 2021–2027; Croatian Agency for Mobility and EU Programmes (data.gov.hr); Ministry of Science, Education and Youth school registers. Grants are indicative amounts awarded at selection, recorded per project — not split between partners.',
    partial: '2026 selection is still in progress, so the last year is incomplete.',
    selected: 'SELECTED', openCounty: 'Open county page', notInvolved: 'schools not yet involved',
    tookPart: (k: string, n: number, r: string, lo: string, hi: string) => `${k} of ${new Intl.NumberFormat('en-GB').format(n)} ${n === 1 ? 'school' : 'schools'} took part (${r} %, range ${lo}–${hi} %).`,
    wouldExpect: (e: string) => `Given its mix of school types, about ${e} would be expected.`,
    orgsTitle: 'Organisations', orgsLead: 'Croatian organisations that took part in at least one KA2 partnership, 2014–2026.',
    filter: 'Filter by name or town', allCounties: 'All counties', name: 'Name', town: 'Town', projects: 'Projects', coordinated: 'Coordinated', shown: 'shown',
    orgKicker: 'ORGANISATION', kaProjects: 'KA2 projects', role: 'Role', coordinatorWord: 'coordinator', asPartner: 'as partner',
    grantsCoord: 'Grants coordinated', valueInvolved: 'Value of all projects involved in', evidence: 'Evidence', goodPractice: 'good practice',
    participation: 'Participation over time', coordinatorLbl: 'Coordinator', partnerLbl: 'Partner', gpLbl: 'Good practice',
    worksWith: 'Works most with', worksWithLead: 'Countries in shared projects (count of projects)',
    topics: 'Recurring topics', topicsNote: 'Older topics are shown through the 2014–2020 → 2021–2027 topic crosswalk.',
    projectsTitle: 'Projects', year: 'Year', project: 'Project', type: 'Type', lead: 'Lead', status: 'Status', all: 'All', partner: 'Partner',
    statuses: { finalized: 'Finished', ongoing: 'Ongoing', terminated: 'Terminated' } as Record<string, string>,
    in1420: 'in 2014–2020', in2127: 'in 2021–2026', noProjects: 'No projects',
    periodNote: 'Period boundary: 2014–2020 and 2021–2027 programmes use different topic lists.',
    placesTitle: 'Places', placesLead: 'The 21 counties and the City of Zagreb.',
    countyKicker: 'COUNTY', orgsInCounty: 'Organisations', projectsInvolved: 'Projects involved', coordinatedProj: 'Projects coordinated',
    coverageByType: 'School coverage by type', ofSchools: 'schools took part', topOrgs: 'Most active organisations',
    notFound: 'Page not found',
    skip: 'Skip to content', other: 'Switch language',
  },
  hr: {
    site: 'ERASMUS+ KOMPAS', tagline: 'Erasmus+ partnerstva · Hrvatska',
    nav: { graph: 'Mreža pojmova', coverage: 'Karta pokrivenosti', orgs: 'Organizacije', places: 'Mjesta', ask: 'Pitajte' },
    soon: 'uskoro', search: 'Tražite', searchPh: 'Organizacija, mjesto…',
    coverageKicker: 'POKRIVENOST · KA2 PARTNERSTVA 2014.–2026.', coverageTitle: 'Koje škole sudjeluju?',
    coverageLead: 'Udio škola u svakoj županiji koje su sudjelovale u barem jednom KA2 partnerstvu, kao koordinator ili partner.',
    schoolsNationally: 'škola u cijeloj zemlji', institutions: 'Ustanove',
    both: 'Osnovne + srednje', primary: 'Osnovne', secondary: 'Srednje', kindergarten: 'Dječji vrtići',
    periodLbl: 'Razdoblje', roleLbl: 'Uloga', anyRole: 'Sve', coordOnly: 'Koordinator', pAll: '2014.–2026.', p1: '2014.–2020.', p2: '2021.–2026.',
    askTitle: 'Postavite pitanje', askLead: 'Pitajte na hrvatskom ili engleskom o hrvatskim KA2 partnerstvima. Odgovori se temelje isključivo na podacima, uz navedene izvore. Ako podaci ne sadrže odgovor, to će biti jasno rečeno.',
    askPh: 'npr. Koliko KA2 projekata ima Gimnazija Metković?', askBtn: 'Pitajte', askWorking: 'Tražim…', askSources: 'Izvori', askHow: 'Prikaži kako je odgovor dobiven',
    askBusy: 'Usluga je zauzeta. Pokušajte ponovno kasnije.', askErr: 'Nešto je pošlo po zlu. Pokušajte ponovno.', askLimit: 'Previše pitanja. Pričekajte trenutak.',
    askUnverified: 'Ovaj je odgovor sastavljen izravno iz tablica podataka.', askExamples: 'Primjeri pitanja', askHint: 'Enter za slanje · Shift+Enter za novi red', askCopy: 'Kopiraj', askCopied: 'Kopirano',
    askTools: 'Korišteni upiti nad podacima', askQ: 'Vaše pitanje', askRoute: 'Vrsta pitanja',
    examples: ['Koliko KA2 projekata ima Sveučilište u Dubrovniku?', 'Koje su županije jasno iznad ili ispod državnog udjela škola?', 'Koja država najčešće koordinira KA2 projekte?', 'Je li Gimnazija Dubrovnik sudjelovala u nekom KA2 projektu?', 'Koliko projekata se bavi ranim napuštanjem školovanja?', 'Koje probleme KA2 projekti najčešće rješavaju?'],
    ovTitle: 'Hrvatska u KA2 ukratko', ovLead: 'Brojke za sve KA2 projekte s barem jednim hrvatskim sudionikom i usporedba Hrvatske s drugim državama.',
    ovProjects: 'KA2 projekata s hrvatskim sudionikom', ovCoordinated: 'koordinirano iz Hrvatske', ovShare: 'svih KA2 projekata u EU-u', ovValue: 'Vrijednost svih tih projekata',
    ovPeriod: 'Razdoblje', ovWho: 'Tko koordinira iz Hrvatske', ovWhoNote: (ngo: number, typed: number) => `Nevladine organizacije: ${ngo} projekata, od kojih je ${typed} u izvozu EU označeno kao NGO; ostalo dolazi iz popunjavanja praznih vrsta iz drugih zapisa iste organizacije i iz ubrajanja europskih organizacija civilnog društva.`, ovWhoLead: 'Projekti koje koordiniraju hrvatske organizacije, po vrsti organizacije.',
    ovCountries: 'Koje države koordiniraju najviše KA2 projekata', ovCountriesLead: 'Broj KA2 projekata koje koordinira svaka država u skupovima podataka EU-a (svi sudionici, ne samo hrvatski).',
    ovRank: 'Mjesto', ovCountry: 'Država', ovCoordProj: 'Koordinirani projekti', ovCroatiaRanks: (r: string, n: string) => `Hrvatska je na ${r}. mjestu od ${n} zemalja koordinatora.`,
    classNames: { ngo: 'Nevladine organizacije', higher_education: 'Visoka učilišta', school_vocational: 'Strukovne škole', school_primary: 'Osnovne škole', adult_education: 'Ustanove za obrazovanje odraslih', school_secondary_general: 'Gimnazije i opće srednje škole', public_body: 'Javna tijela', sme_business: 'Poduzeća', school_preprimary: 'Ustanove ranog i predškolskog odgoja i obrazovanja', other: 'Ostale organizacije', research: 'Istraživačke organizacije' } as Record<string, string>,
    nav2: { overview: 'Pregled', projects: 'Projekti', topics: 'Teme', methods: 'Metode' },
    sortBy: 'Poredaj po', sortProjects: 'Najviše projekata', sortCoordinated: 'Najviše koordiniranih', sortName: 'Nazivu (A–Ž)', anyPeriod: 'Sve godine', coordOnly: 'Samo koordinatori', allTypes: 'Sve vrste',
    pjTitle: 'Pronađite projekte', pjLead: 'Pretražite naslove i teme 3.830 KA2 projekata s hrvatskim sudionikom. Tekstovi projekata prikazani su na jeziku na kojem je prijava podnesena.',
    pjSearch: 'Riječi u naslovu ili temi', pjPeriod: 'Razdoblje', pjType: 'Vrsta aktivnosti', pjCountry: 'Partnerska država', pjAnyCountry: 'Bilo koja država', pjAnyType: 'Bilo koja vrsta', pjGp: 'Samo dobra praksa',
    pjResults: 'pronađenih projekata', pjMore: 'Prikazano je prvih 100; suzite pretragu da vidite ostale.', pjNone: 'Nijedan projekt ne odgovara ovim filtrima.',
    topTitle: 'Teme kroz vrijeme', topLead: 'Koliko često KA2 projekti s hrvatskim sudionikom biraju pojedinu temu EU-a, po godini poziva. Pokazuje što je postalo češće ili rjeđe.',
    topBreakNote: 'EU je 2021. zamijenio popis tema. Preko prekida crtaju se samo teme s istim nazivom u oba popisa; ostale ondje završavaju ili počinju. Povezivanje različito nazvanih tema bilo bi nagađanje.',
    topBreak: 'popis tema promijenjen', topBoth: 'U oba popisa tema', topNew: 'Samo u popisu 2021.–2027.', topOld: 'Samo u popisu 2014.–2020.',
    topShare: 'Udio projekata koji imaju temu', topPartial: '2026. je nepotpuna godina (prazna točka).', topPick: 'Odaberite teme (do 8)', topTable: 'Prikaži tablicu podataka',
    topNames: 'Nazivi tema su izvorni nazivi EU-a i prikazani su na engleskom.', topCount: 'Projekti', topYear: 'Godina poziva', topFilter: 'Filtrirajte teme', topNone: 'Odaberite barem jednu temu.',
    similar: 'Slične organizacije', similarLead: 'Ista vrsta ustanove u istoj županiji, najprije iz istog mjesta. Udaljenosti se ne prikazuju.', noKa2: 'Od 2014. nije pronađen nijedan KA2 projekt', sameTown: 'isto mjesto',
    euCard: 'Otvori na Platformi za rezultate projekata programa Erasmus+', projectSite: 'Web stranica projekta', euLinks: 'Na webu',
    projectKicker: 'PROJEKT', summary: 'Sažetak', participants: 'Hrvatski sudionici', partners: 'Partnerske države', grant: 'Bespovratna sredstva', grantNote: 'Okvirni iznos dodijeljen pri odabiru za cijeli projekt, a ne raspodijeljen po partnerima.', gpNote: 'Označeno kao dobra praksa', notComparable: 'U partnerstvima za razmjenu među školama svaka škola dobiva vlastita bespovratna sredstva pa ovaj iznos nije usporediv s ostalim KA2 projektima.', summaryNote: 'Tekst projekta prikazan je na jeziku na kojem je prijava podnesena.', topicsLbl: 'Teme', conceptsLbl: 'Ključni pojmovi', conceptsNote: 'Jezični model izdvojio ih je iz sažetka; svaki vodi na ono što obično ide uz njega u mreži pojmova.', noTopics: 'U izvoru nisu navedene teme.',
    byCounty: 'Po županijama', byCountyLead: 'Svaka je županija prikazana jednakom pločicom, otprilike na svom zemljopisnom položaju, kako bi i male županije bile vidljive.',
    ranked: 'Poredak s intervalima pouzdanosti',
    rankedLead: 'Trake prikazuju 95-postotni interval pouzdanosti. Od državnog prosjeka jasno odstupaju samo županije čija je cijela traka iznad ili ispod njega; kod malih županija trake su šire.',
    county: 'Županija', schools: 'Škole', expected: 'Očekivano', national: 'državni', shareOfSchools: 'Udio škola',
    above: 'jasno iznad državnog', below: 'jasno ispod državnog',
    method: 'Metoda: sudionici KA2 povezani su s registrima škola prema nazivu i poštanskom broju, a 51 nepotpuno podudaranje provjereno je ručno. Očekivani broj = broj škola u županiji × državni udio za pojedinu vrstu škole. 95-postotni intervali pouzdanosti izračunati su Wilsonovom metodom. Mobilnost u okviru KA1 nije uključena pa se škola koja sudjeluje samo u KA1 računa kao da ne sudjeluje. Dječji vrtići imaju zaseban filtar i nisu obuhvaćeni kategorijom „Osnovne + srednje”.',
    sources: 'Izvori', provenance: 'Izvori: Platforma za rezultate projekata programa Erasmus+, preuzeti skupovi podataka za KA2 2014.–2020. i 2021.–2027.; Agencija za mobilnost i programe EU (data.gov.hr); registri Ministarstva znanosti, obrazovanja i mladih. Bespovratna sredstva okvirni su iznosi dodijeljeni pri odabiru, bilježe se po projektu — nisu podijeljena među partnere.',
    partial: 'Odabir za 2026. još traje pa je posljednja godina nepotpuna.',
    selected: 'ODABRANO', openCounty: 'Otvori stranicu županije', notInvolved: 'škola još nije uključeno',
    tookPart: (k: string, n: number, r: string, lo: string, hi: string) => `${k} od ${new Intl.NumberFormat('hr-HR').format(n)} ${plural(n, ['škole', 'škole', 'škola'])} sudjelovalo je (${r} %, raspon ${lo}–${hi} %).`,
    wouldExpect: (e: string) => `S obzirom na sastav vrsta škola, očekivalo bi se oko ${e}.`,
    orgsTitle: 'Organizacije', orgsLead: 'Hrvatske organizacije koje su sudjelovale u barem jednom KA2 partnerstvu, 2014.–2026.',
    filter: 'Pretraži po nazivu ili mjestu', allCounties: 'Sve županije', name: 'Naziv', town: 'Mjesto', projects: 'Projekti', coordinated: 'Koordinirano', shown: 'prikazano',
    orgKicker: 'ORGANIZACIJA', kaProjects: 'KA2 projekata', role: 'Uloga', coordinatorWord: 'koordinator', asPartner: 'kao partner',
    grantsCoord: 'Bespovratna sredstva za koordinirane projekte', valueInvolved: 'Vrijednost svih projekata u kojima sudjeluje', evidence: 'Pokazatelji kvalitete', goodPractice: 'dobra praksa',
    participation: 'Sudjelovanje po godinama', coordinatorLbl: 'Koordinator', partnerLbl: 'Partner', gpLbl: 'Dobra praksa',
    worksWith: 'Najčešće surađuje s', worksWithLead: 'Države u zajedničkim projektima (broj projekata)',
    topics: 'Česte teme', topicsNote: 'Teme iz razdoblja 2014.–2020. preslikane su na teme razdoblja 2021.–2027.',
    projectsTitle: 'Projekti', year: 'Godina', project: 'Projekt', type: 'Vrsta', lead: 'Koordinator', status: 'Status', all: 'Svi', partner: 'Partner',
    statuses: { finalized: 'Završen', ongoing: 'U tijeku', terminated: 'Prekinut' } as Record<string, string>,
    in1420: 'u razdoblju 2014.–2020.', in2127: 'u razdoblju 2021.–2026.', noProjects: 'Nema projekata',
    periodNote: 'Granica razdoblja: programi 2014.–2020. i 2021.–2027. koriste različite popise tema.',
    placesTitle: 'Mjesta', placesLead: '21 županija i Grad Zagreb.',
    countyKicker: 'ŽUPANIJA', orgsInCounty: 'Organizacije', projectsInvolved: 'Projekti u kojima sudjeluju', coordinatedProj: 'Koordinirani projekti',
    coverageByType: 'Pokrivenost škola po vrsti', ofSchools: 'škola je sudjelovalo', topOrgs: 'Najaktivnije organizacije',
    notFound: 'Stranica nije pronađena',
    skip: 'Preskoči na sadržaj', other: 'Promijeni jezik',
  },
};

export const t = (lang: Lang) => T[lang];

/** Croatian has three number forms: 1, 21, 101 (not 11) take the first; 2-4, 22-24 (not 12-14) the second; everything else the third. */
export const plural = (n: number, forms: readonly [string, string, string]) =>
  forms[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 1 : 2];
/** 'projekt' / 'projekta' / 'projekata' in Croatian, 'project' / 'projects' in English */
export const projectWord = (lang: Lang, n: number) => (lang === 'hr' ? plural(n, ['projekt', 'projekta', 'projekata']) : n === 1 ? 'project' : 'projects');
export const countryPartnerWord = (lang: Lang, n: number) => (lang === 'hr' ? plural(n, ['država partner', 'države partnera', 'država partnera']) : n === 1 ? 'partner country' : 'partner countries');
export const foundWord = (lang: Lang, n: number) => (lang === 'hr' ? plural(n, ['pronađeni projekt', 'pronađena projekta', 'pronađenih projekata']) : n === 1 ? 'project found' : 'projects found');

/** Croatian: 3.830 and 29,4 — English: 3,830 and 29.4 */
export const num = (lang: Lang, n: number, digits = 0) =>
  new Intl.NumberFormat(lang === 'hr' ? 'hr-HR' : 'en-GB', {
    minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: true,
  }).format(n).replace(/ /g, ' ');

export const eur = (lang: Lang, n: number | null | undefined) =>
  n == null ? '–' : `${num(lang, Math.round(n))} €`;

export const pct = (lang: Lang, share: number, digits = 1) => num(lang, share * 100, digits);

/** Topic name in the page language; topics from the 2014–2020 list that have no Croatian name stay in English. */
export const topicName = (lang: Lang, name: string): string => (lang === 'hr' ? (topicLabels as Record<string, string>)[name] || name : name);
export const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const otherLang = (l: Lang): Lang => (l === 'hr' ? 'en' : 'hr');

// Text of the frame (sidebar, top bar, footer, theme switch). Page texts stay in i18n.ts and conceptText.ts.
import type { Lang } from './i18n';

const T = {
  hr: {
    tagline: 'Atlas KA2 partnerstava', nav: 'Glavna navigacija', menu: 'Izbornik', closeMenu: 'Zatvori izbornik', path: 'Putanja', atlas: 'Atlas',
    lang: 'Jezik', scrollable: 'Tablica koja se može pomicati', theme: 'Tema', themeLight: 'Svijetla tema', themeDark: 'Tamna tema', toLight: 'Prebaci na svijetlu temu', toDark: 'Prebaci na tamnu temu',
    askTitle: 'Imate pitanje?', askText: 'Asistent odgovara samo iz podataka atlasa i uz odgovor navodi izvore.', askBtn: 'Pitaj asistenta', assistant: 'Asistent',
    notOfficial: 'Neovisni projekt otvorenih podataka. Nije službena stranica Europske komisije.',
    searchLabel: 'Pretraži atlas', searchPh: 'Pretraži županije, organizacije, projekte…', searchOpen: 'Pretraži',
    fbrand: 'Atlas sudjelovanja Hrvatske u Erasmus+ KA2 partnerstvima: tko ih koordinira, gdje se provode i koje teme biraju.',
    sources: 'Izvori podataka', about: 'O podacima', atlasH: 'Atlas', updated: 'Ažurirano', scope: 'Obuhvat', calc: 'Izračun',
    scopeText: 'KA2 partnerstva. KA1 mobilnosti nisu uključene.',
    calcText: 'Udjeli škola su procjene jer se sudionici s registrom škola povezuju prema nazivu i poštanskom broju.',
    src1: ['Erasmus+ Project Results Platform', 'Europska komisija. Popisi KA2 projekata 2014.–2020. i 2021.–2027.'],
    src2: ['Program Erasmus+ 2021.–2027. (data.gov.hr)', 'Agencija za mobilnost i programe EU. Hrvatski sudionici i iznosi.'],
    src3: ['Registri ustanova (data.gov.hr)', 'Ministarstvo znanosti i obrazovanja: dječji vrtići, osnovne i srednje škole, visoko obrazovanje.'],
    sourceCode: 'Izvorni kod (GitHub)',
    dockTitle: 'Kompas asistent', dockSub: 'Odgovara samo iz podataka atlasa', dockNew: 'Novi razgovor', dockFull: 'Otvori na cijeloj stranici', dockClose: 'Zatvori asistenta', dockQ: 'Pitanje asistentu',
    dockPh: 'Upišite pitanje o podacima…', dockSend: 'Pošalji', dockNote: 'Asistent može pogriješiti. Provjerite izvore ispod odgovora.', loading: 'Učitavam…',
    legal: 'Brojke su preuzete iz navedenih javnih izvora i izračunate u ovom projektu. Ovo je neovisan projekt i nije službena stranica Europske komisije ni Agencije za mobilnost i programe EU.',
  },
  en: {
    tagline: 'Atlas of KA2 partnerships', nav: 'Main navigation', menu: 'Menu', closeMenu: 'Close the menu', path: 'Breadcrumb', atlas: 'Atlas',
    lang: 'Language', scrollable: 'Scrollable table', theme: 'Theme', themeLight: 'Light theme', themeDark: 'Dark theme', toLight: 'Switch to the light theme', toDark: 'Switch to the dark theme',
    askTitle: 'Have a question?', askText: 'The assistant answers only from the atlas data and gives its sources with every answer.', askBtn: 'Ask the assistant', assistant: 'Assistant',
    notOfficial: 'An independent open-data project. Not an official site of the European Commission.',
    searchLabel: 'Search the atlas', searchPh: 'Search counties, organisations, projects…', searchOpen: 'Search',
    fbrand: 'An atlas of Croatia in Erasmus+ KA2 partnerships: who coordinates them, where they run and which topics they choose.',
    sources: 'Data sources', about: 'About the data', atlasH: 'Atlas', updated: 'Updated', scope: 'Scope', calc: 'Calculation',
    scopeText: 'KA2 partnerships. KA1 mobility is not included.',
    calcText: 'School shares are estimates because participants are linked to the school registers by name and postcode.',
    src1: ['Erasmus+ Project Results Platform', 'European Commission. Lists of KA2 projects 2014–2020 and 2021–2027.'],
    src2: ['Erasmus+ programme 2021–2027 (data.gov.hr)', 'Agency for Mobility and EU Programmes. Croatian participants and amounts.'],
    src3: ['Registers of institutions (data.gov.hr)', 'Ministry of Science and Education: kindergartens, primary and secondary schools, higher education.'],
    sourceCode: 'Source code (GitHub)',
    dockTitle: 'Compass assistant', dockSub: 'Answers only from the atlas data', dockNew: 'New conversation', dockFull: 'Open on the full page', dockClose: 'Close the assistant', dockQ: 'Question for the assistant',
    dockPh: 'Type a question about the data…', dockSend: 'Send', dockNote: 'The assistant can be wrong. Check the sources under the answer.', loading: 'Loading…',
    legal: 'Figures are taken from the public sources named above and calculated in this project. This is an independent project and not an official site of the European Commission or the Agency for Mobility and EU Programmes.',
  },
} as const;

export const ch = (lang: Lang) => T[lang];

// Navigation of the whole site: one tree for the sidebar, the breadcrumbs and the footer.
// A page tells the layout where it lives with `active` (a sub-page key); sections without sub-pages use their own key.
import type { Lang } from './i18n';

type L = { hr: string; en: string };
export interface NavSub { key: string; href: string; label: L }
export interface NavTop { key: string; href: string; label: L; icon: keyof typeof ICON; subs: NavSub[] }

export const ICON = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  dash: '<path d="M4 20V10M10 20V4M16 20v-8M21 20H3"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
} as const;

// Pages that exist are listed here. New pages of the redesign are added to this list as they are built.
export const NAV: NavTop[] = [
  { key: 'home', href: '/', label: { hr: 'Početna', en: 'Home' }, icon: 'home', subs: [] },
  { key: 'overview-s', href: '/overview/', label: { hr: 'Pregled', en: 'Overview' }, icon: 'dash', subs: [
    { key: 'overview', href: '/overview/', label: { hr: 'Ključni pokazatelji', en: 'Key figures' } },
    { key: 'timeline', href: '/timeline/', label: { hr: 'Kroz vrijeme', en: 'Over time' } },
    { key: 'countries', href: '/countries/', label: { hr: 'Partnerske države', en: 'Partner countries' } },
  ] },
  { key: 'places-s', href: '/places/', label: { hr: 'Županije', en: 'Counties' }, icon: 'pin', subs: [
    { key: 'places', href: '/places/', label: { hr: 'Karta i poredak', en: 'Map and ranking' } },
    { key: 'compare', href: '/compare/', label: { hr: 'Usporedba županija', en: 'Compare counties' } },
    { key: 'coverage', href: '/coverage/', label: { hr: 'Pokrivenost škola', en: 'School coverage' } },
  ] },
  { key: 'topics-s', href: '/topics/', label: { hr: 'Teme i problemi', en: 'Topics and problems' }, icon: 'hash', subs: [
    { key: 'topics', href: '/topics/', label: { hr: 'Teme kroz vrijeme', en: 'Topics over time' } },
    { key: 'problems', href: '/problems/', label: { hr: 'Problemi i rješenja', en: 'Problems and solutions' } },
    { key: 'graph', href: '/graph/', label: { hr: 'Mreža pojmova', en: 'Concept network' } },
    { key: 'methods', href: '/methods/', label: { hr: 'Što rade projekti', en: 'What projects do' } },
  ] },
  { key: 'find-s', href: '/projects/', label: { hr: 'Projekti i organizacije', en: 'Projects and organisations' }, icon: 'folder', subs: [
    { key: 'projects', href: '/projects/', label: { hr: 'Projekti', en: 'Projects' } },
    { key: 'orgs', href: '/organisations/', label: { hr: 'Organizacije', en: 'Organisations' } },
  ] },
  { key: 'ask', href: '/ask/', label: { hr: 'Asistent', en: 'Assistant' }, icon: 'chat', subs: [] },
  { key: 'info-s', href: '/about/', label: { hr: 'Informacije', en: 'Information' }, icon: 'info', subs: [
    { key: 'about', href: '/about/', label: { hr: 'O podacima', en: 'About the data' } },
    { key: 'glossary', href: '/glossary/', label: { hr: 'Rječnik pojmova', en: 'Glossary' } },
    { key: 'downloads', href: '/downloads/', label: { hr: 'Preuzimanje', en: 'Downloads' } },
  ] },
];

/** `active` as the pages give it -> the sidebar entry to mark. 'coverage' is today's front page. */
export const ACTIVE_ALIAS: Record<string, string> = { coverage: 'home' };

export function findActive(active: string): { top?: NavTop; sub?: NavSub } {
  const k = ACTIVE_ALIAS[active] ?? active;
  for (const top of NAV) {
    if (top.key === k) return { top };
    const sub = top.subs.find((s) => s.key === k);
    if (sub) return { top, sub };
  }
  return {};
}

export const label = (l: L, lang: Lang) => l[lang];

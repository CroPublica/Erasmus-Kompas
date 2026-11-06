/* ============ glue: the prototype's views run inside real pages of the Astro site ============
   The Astro page supplies the frame, the address and the language; this file replaces the prototype's hash router.
   - route: the views hang their clean-up here (route.cleanup)
   - go(h): a '#/...' address of the prototype becomes a real address of the site
   - EK.mount(view, arg): draws one view into #view and keeps its links real */
const route = {};
let curHashValue = '#/';
const curHash = () => curHashValue;
const setNav = (o) => { document.body.classList.toggle('navopen', !!o); const sc = $('#scrim'); if (sc) sc.hidden = !(o || (document.body.classList.contains('dockopen') && innerWidth < 1500)); const m = $('#menu'); if (m) m.setAttribute('aria-expanded', String(!!o)); };
const paintDate = () => {};
const NAVS = [];
const subOn = () => false;

const EK_BASE = (document.body.dataset.base || '').replace(/\/$/, '');
const EK_SLUG = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/* '#/mjesta/Split' -> '/hr/places/split/' */
const EK_ROUTES = [
  [/^#\/?$/, () => '/'], [/^#\/pregled$/, () => '/overview/'], [/^#\/kronologija$/, () => '/timeline/'], [/^#\/drzave$/, () => '/countries/'],
  [/^#\/mjesta$/, () => '/places/'], [/^#\/mjesta\/(.+)$/, (m) => '/places/' + EK_SLUG(decodeURIComponent(m[1])) + '/'],
  [/^#\/usporedba$/, () => '/compare/'], [/^#\/pokrivenost$/, () => '/coverage/'],
  [/^#\/projekti$/, () => '/projects/'], [/^#\/projekti\/(.+)$/, (m) => '/projects/' + EK_SLUG(decodeURIComponent(m[1])) + '/'],
  [/^#\/organizacije$/, () => '/organisations/'], [/^#\/organizacije\/(.+)$/, (m) => '/organisations/' + EK_SLUG(decodeURIComponent(m[1])) + '/'],
  [/^#\/teme$/, () => '/topics/'], [/^#\/(pristupi|metodologija)$/, () => '/problems/'], [/^#\/graf$/, () => '/graph/'], [/^#\/pitajte$/, () => '/ask/'],
  [/^#\/o-podacima$/, () => '/about/'], [/^#\/rjecnik$/, () => '/glossary/'], [/^#\/preuzimanje$/, () => '/downloads/'],
  [/^#\/pristupacnost$/, () => '/accessibility/'], [/^#\/kontakt$/, () => '/contact/'], [/^#\/mapa-stranice$/, () => '/sitemap/']
];
function ekUrl(h) {
  for (const [re, f] of EK_ROUTES) { const m = h.match(re); if (m) return `${EK_BASE}/${LANG}${f(m)}`; }
  return h;
}
function go(h) { location.href = ekUrl(h); }
/* "carry a value to the next page": the prototype passes it in memory between routes; here through the session */
(() => {
  let pre = null; try { pre = JSON.parse(sessionStorage.getItem('ek-pre') || 'null'); sessionStorage.removeItem('ek-pre'); } catch (e) { /* no storage */ }
  Object.defineProperty(window, '__pre', { get: () => pre, set: (v) => { pre = v; try { sessionStorage.setItem('ek-pre', JSON.stringify(v)); } catch (e) { /* no storage */ } }, configurable: true });
})();

/* detail pages: the address holds the slug, the views want the real id */
const bySlug = (list, key, s) => { const f = list.find((x) => EK_SLUG(key(x)) === s); return f ? key(f) : s; };
const detail = (fn, list, key) => (root, a) => { const s = a && a[1] || ''; fn(root, bySlug(list(), key, s)); };
const EK_VIEWS = {
  project: [detail(viewProjekt, () => D.projects, (x) => x[0]), '#/projekti'], org: [detail(viewOrganizacija, () => O(), (x) => x.id), '#/organizacije'],
  county: [detail(viewZupanija, () => D.counties, (x) => x.stem), '#/mjesta'], graph: [viewGraf, '#/graf'],
  landing: [viewLanding, '#/'], overview: [viewPregled, '#/pregled'], timeline: [viewKronologija, '#/kronologija'], countries: [viewDrzave, '#/drzave'],
  places: [viewMjesta, '#/mjesta'], compare: [viewUsporedba, '#/usporedba'], coverage: [viewPokrivenost, '#/pokrivenost'],
  projects: [viewProjekti, '#/projekti'], organisations: [viewOrganizacije, '#/organizacije'], topics: [viewTeme, '#/teme'], problems: [viewProblemi, '#/pristupi'],
  ask: [viewPitajte, '#/pitajte'], about: [viewOPodacima, '#/o-podacima'], glossary: [viewRjecnik, '#/rjecnik'], downloads: [viewPreuzimanje, '#/preuzimanje'],
  accessibility: [viewPristupacnost, '#/pristupacnost'], contact: [viewKontakt, '#/kontakt'], sitemap: [viewMapaStranice, '#/mapa-stranice'], notfound: [viewNotFound, '#/404']
};
const EK_VIEWKEY = { project: 'trazi', org: 'trazi', county: 'zupanije', graph: 'teme', landing: 'pocetna', overview: 'pregled', timeline: 'pregled', countries: 'pregled', places: 'zupanije', compare: 'zupanije', coverage: 'zupanije', projects: 'trazi', organisations: 'trazi', topics: 'teme', problems: 'teme', ask: 'pitajte', about: 'o', glossary: 'o', downloads: 'o' };

/* every '#/...' link the views write becomes a real link, also in what they draw later (filters, "show more") */
function ekLinks(root) {
  root.querySelectorAll('a[href^="#/"]').forEach((a) => { a.setAttribute('href', ekUrl(a.getAttribute('href'))); });
}
const EK = {
  lang: document.documentElement.lang === 'en' ? 'en' : 'hr', current: null,
  mount(name, arg) {
    const root = $('#view'); if (!root) return;
    const entry = EK_VIEWS[name]; if (!entry) return;
    curHashValue = entry[1];
    if (route.cleanup) { route.cleanup(); route.cleanup = null; }
    document.body.classList.toggle('landing', name === 'landing');
    root.innerHTML = '';
    const holder = document.createElement('div'); root.append(holder);
    try { entry[0](holder, arg ? [null, arg] : null); initSearch(root); } catch (e) { holder.innerHTML = `<div class="note">${esc(e.message)}</div>`; console.error(e); }
    ekLinks(root); root.setAttribute('aria-busy', 'false'); root.querySelectorAll('pre').forEach((el) => { el.tabIndex = 0; el.setAttribute('role', 'region'); if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', document.body.dataset.scrollable || 'Code'); });
    new MutationObserver(() => ekLinks(root)).observe(root, { childList: true, subtree: true });
    Assistant.setContext(EK_VIEWKEY[name] || 'o', name); setTimeout(() => { const h = $('h1', holder); if (h) Assistant.setContext(EK_VIEWKEY[name] || 'o', h.textContent.trim().slice(0, 60)); }, 0);   // the title once the view has been translated
    if (name === 'ask') Assistant.hide();
    if (window.__pre) { const pr = window.__pre; window.__pre = null; const el = $(pr.sel, holder); if (el) { el.value = pr.value; el.dispatchEvent(new Event(pr.ev || 'input', { bubbles: true })); } }
    this.current = name;
  },
  /* the assistant works on every page: the frame asks for it, the first call loads the engine */
  assistant() { return Assistant; }
};
/* language: the page decides, the dictionary translates what the views draw */
if (EK.lang === 'en') I18N.setLang('en', { force: true });
EK.i18n = I18N;                     // the translation layer, for the tests (EK.i18n.missing lists what a page could not translate)
window.EK = EK;

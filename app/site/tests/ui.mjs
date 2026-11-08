// Browser tests of the v8 redesign.  TEST_URL=http://localhost:4400 node tests/ui.mjs   (needs `npm run build` and a running `astro preview`)
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const BASE = (process.env.SITE_BASE || '').replace(/\/$/, '');
const EXTERNAL = process.env.TEST_URL;                       // an already running preview (astro refuses a second one for the same project)
const URL = (EXTERNAL || 'http://localhost:4399') + BASE;
const listener = () => { try { return execSync("ss -ltnp | grep ':4399 ' | grep -o 'pid=[0-9]*' | cut -d= -f2").toString().trim(); } catch { return ''; } };
if (!EXTERNAL && listener()) { console.error('port 4399 is already in use (an old preview server?): stop it first'); process.exit(2); }
const srv = EXTERNAL ? null : spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'preview', '--port', '4399'], { stdio: 'ignore', detached: true });
const stop = () => { if (EXTERNAL) return; const p = listener(); if (p) try { process.kill(Number(p), 'SIGKILL'); } catch {} };
process.on('exit', stop);
await new Promise((r) => setTimeout(r, EXTERNAL ? 200 : 4000));
const browser = await chromium.launch();
const errors = [];
let passed = 0, failed = 0;
const open = async (path, w = 1280, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, acceptDownloads: true, colorScheme: opts.scheme || 'light' });
  const p = await ctx.newPage(); let last404 = '';
  p.on('response', (r) => { if (r.status() === 404) last404 = r.url(); });
  p.on('console', (m) => {
    if (m.type() !== 'error' || /status of (429|503|500)/.test(m.text())) return;                          // mocked API failures are expected
    if (/status of 404/.test(m.text()) && /\/api\/health/.test(last404)) return;                          // the preview has no assistant API: the page falls back to answers from the data
    errors.push(`${path}: ${m.text()}`);
  });
  p.on('pageerror', (e) => { if (!/ViewTransition opt-in disabled/.test(String(e))) errors.push(`${path}: ${e}`); });   // the browser aborts a cross-document transition when the next click comes mid-fade: harmless
  await p.goto(URL + path);
  if (!opts.fast) await p.waitForFunction(() => !document.getElementById('view') || document.getElementById('view').getAttribute('aria-busy') !== 'true' && document.getElementById('view').innerText.length > 80, null, { timeout: 15000 }).catch(() => {});
  return p;
};
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('ok   ', name); }
  catch (e) { failed++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
};
const ENGINE = ['/', '/overview/', '/timeline/', '/countries/', '/places/', '/compare/', '/coverage/', '/projects/', '/organisations/', '/topics/', '/problems/', '/ask/', '/about/', '/glossary/', '/downloads/', '/accessibility/', '/contact/', '/sitemap/'];
const NATIVE = ['/graph/', '/methods/', '/places/zagrebacka/', '/organisations/mzo-19-049-502/', '/projects/2023-1-hr01-ka220-sch-000158622/'];
const csvRows = (file) => fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).length;

await test('frame: sidebar lists every sub-page, marks the current one, tabs follow the section', async () => {
  const p = await open('/hr/overview/');
  assert.ok((await p.locator('#nav a.sub').count()) >= 14);
  assert.equal(await p.locator('#nav a.sub[aria-current=page]').innerText(), 'Ključni pokazatelji');
  assert.equal(await p.locator('.tabs2 a').count(), 3);
  assert.match(await p.locator('footer.site').innerText(), /Platforma za rezultate projekata programa Erasmus\+/);
});
await test('theme: switch to dark, remembered after reload, back to light', async () => {
  const p = await open('/hr/overview/');
  await p.click('#theme'); assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'dark');
  const bgDark = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await p.reload(); assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await p.click('#theme'); assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'light');
  assert.notEqual(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), bgDark);
});
await test('language switch keeps the page', async () => {
  const p = await open('/hr/projects/'); await p.click('.lang a[lang=en]'); await p.waitForURL(/\/en\/projects\//);
  await p.waitForFunction(() => /KA2 projects/.test(document.querySelector('#view h1')?.textContent || ''));
});
await test('every page of the v8 design draws, in Croatian and English', async () => {
  for (const lang of ['hr', 'en']) for (const r of ENGINE) {
    const p = await open(`/${lang}${r}`);
    const t = await p.locator('#view').innerText();
    assert.ok(t.length > 150, `${lang}${r} is empty`); assert.equal(await p.locator('#view .note:has-text("Cannot")').count(), 0);
    await p.context().close();
  }
});
await test('home: animated map, counters, search and the assistant button', async () => {
  const p = await open('/hr/'); await p.waitForSelector('#hmap'); assert.ok((await p.locator('#hmap path.hm-arc').count()) >= 20);
  await p.waitForFunction(() => /3\.830/.test(document.querySelector('.hero-stats')?.innerText || ''), null, { timeout: 8000 });
  await p.locator('.hero .gsearch input').fill('metkov'); await p.locator('.hero .gres a').first().waitFor();
});
await test('counties: ranking, map click, link to the county page, CSV export', async () => {
  const p = await open('/hr/places/');
  assert.ok((await p.locator('#view .rank li').count()) >= 10);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#view .xbtns button[data-f="csv"]').first().click()]);
  const f = await dl.path(); assert.equal(csvRows(f), 22);                                                  // header + 21 counties
  await p.locator('#view .geomap .c').first().click();
  await p.locator('#view a[href$="/places/grad-zagreb/"], #view a[href*="/places/"]').first().waitFor();
});
await test('projects: chips filter, count follows, reset, export Excel and PDF', async () => {
  const p = await open('/hr/projects/');
  assert.match(await p.locator('#count').innerText(), /3\.830/);
  await p.locator('.chipset button[data-v="visoko"]').first().click();
  await p.waitForFunction(() => /458/.test(document.querySelector('#count')?.innerText || ''));
  const [x] = await Promise.all([p.waitForEvent('download'), p.locator('#view .xbtns button[data-f="xlsx"]').first().click()]);
  assert.equal(fs.readFileSync(await x.path()).subarray(0, 2).toString(), 'PK');
  const [d] = await Promise.all([p.waitForEvent('download'), p.locator('#view .xbtns button[data-f="pdf"]').first().click()]);
  assert.equal(fs.readFileSync(await d.path()).subarray(0, 4).toString(), '%PDF');
  await p.click('#reset'); await p.waitForFunction(() => /3\.830/.test(document.querySelector('#count')?.innerText || ''));
});
await test('organisations: search by name, row opens the organisation page', async () => {
  const p = await open('/hr/organisations/'); await p.fill('#view #q', 'metkov');
  await p.locator('#rows tr', { hasText: 'Gimnazija Metković' }).first().click();
  await p.waitForURL(/\/organisations\/mzo-19-049-502\//);
});
await test('top search finds an organisation and opens it', async () => {
  const p = await open('/hr/overview/'); await p.fill('#gs', 'metkov'); await p.locator('#gs-res a').first().waitFor();
  await p.locator('#gs-res a', { hasText: 'Gimnazija Metković' }).first().click(); await p.waitForURL(/\/organisations\//);
});
await test('assistant drawer: opens from the edge tab, answers from the data, closes with Escape', async () => {
  const p = await open('/hr/overview/'); await p.click('#edgetab');
  await p.waitForFunction(() => document.body.classList.contains('dockopen'));
  await p.waitForTimeout(400);
  await p.fill('#dock-q', 'Koje županije imaju najviše projekata?'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => /projekata/.test(document.querySelector('#dock-log')?.innerText || ''), null, { timeout: 15000 });
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.body.classList.contains('dockopen'));
});
await test('assistant drawer works on a page without the engine, too (graph)', async () => {
  const p = await open('/hr/graph/'); await p.click('#edgetab');
  await p.waitForFunction(() => document.body.classList.contains('dockopen'), null, { timeout: 15000 });
});
await test('assistant page: asks and answers', async () => {
  const p = await open('/en/ask/'); await p.fill('#pq', 'Which counties have the most projects?'); await p.click('#pg');
  await p.locator('#pl .msg.bot').first().waitFor({ timeout: 10000 });
});
await test('assistant: on the English page the suggestions send English, the box is English, the Ask page has no second shortcut', async () => {
  const p = await open('/en/ask/'); const sent = [];
  await p.route('**/api/health', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' }));
  await p.route('**/api/ask', (r) => { sent.push(JSON.parse(r.request().postData())); r.fulfill({ status: 503, body: 'busy' }); });
  await p.reload({ waitUntil: 'networkidle' });                                                          // the page probes the API once, so reload with the mock in place
  assert.equal(await p.getAttribute('#pq', 'placeholder'), 'Type a question about the data…');
  assert.equal(await p.locator('#edgetab').isVisible(), false);
  await p.locator('.topics .sug button').first().click(); await p.waitForTimeout(800);
  assert.equal(sent.length, 1); assert.equal(sent[0].lang, 'en'); assert.match(sent[0].question, /^[A-Za-z ?+-]+$/);
  const d = await open('/en/'); await d.locator('#l-ask').click();
  assert.equal(await d.locator('#dock-q').getAttribute('placeholder'), 'Type a question about the data…');
  assert.match(await d.locator('#dock h2').innerText(), /^Kompas assistant/);
  assert.match(await d.locator('#dock .welcome h3').innerText(), /What would you like to know/);
});
await test('assistant: a real API answer (200 with citations) is shown as it is, without the "not available" note', async () => {
  const p = await open('/en/ask/'); const seen = [];
  p.on('console', (m) => { if (m.type() === 'error') seen.push(m.text()); });
  await p.route('**/api/health', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' }));
  await p.route('**/api/ask', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    answer: 'Split-Dalmatia County has 320 projects.', lang: 'en', route: 'county', verified: true, fallback: false, last_org_id: null,
    citations: ['county:Splitsko-dalmatinska', 'county:Grad Zagreb', 'org:OID-E10208520', 'project:2023-1-HR01-KA220-SCH-000158622', 'concept:TOP:Digital skills', 'glossary:grant'],
    tools: [{ tool: 'county_stats', args: { county: 'Splitsko-dalmatinska', period: 'all' }, rows: [] }] }) }));
  await p.reload({ waitUntil: 'networkidle' });
  await p.locator('.topics .sug button').first().click(); await p.waitForTimeout(1500);
  const txt = await p.locator('#view').innerText();
  assert.match(txt, /Split-Dalmatia County has 320 projects\./);
  assert.doesNotMatch(txt, /not available right now|computed directly from the data/);
  assert.ok((await p.locator('#view .bubble a').count()) >= 4, 'the sources are linked');
  assert.match(await p.locator('#view .bubble').first().textContent(), /Calculation: county figures/);      // the steps sit in a closed <details>, so innerText would skip them
  assert.deepEqual(seen.filter((m) => !/status of (404)/.test(m)), []);
});
await test('no horizontal scroll at phone width on any page', async () => {
  for (const r of [...ENGINE, ...NATIVE]) {
    const p = await open('/hr' + r, 390);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'overflow on ' + r);
    await p.context().close();
  }
});
await test('accessibility (axe: wcag2a/aa), light and dark, desktop', async () => {
  const bad = [];
  for (const scheme of ['light', 'dark']) for (const r of [...ENGINE, ...NATIVE]) {
    const p = await open('/hr' + r, 1280, { scheme }); await p.waitForTimeout(1300);                  // the hero buttons fade in for about a second; axe would read them half transparent
    await p.addScriptTag({ path: axePath });
    const res = await p.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] }));
    if (res.violations.length) bad.push(`${scheme} ${r}: ` + res.violations.map((v) => `${v.id}(${v.nodes.length})`).join(','));
    await p.context().close();
  }
  if (bad.length) console.log(bad); assert.deepEqual(bad, []);
});

await test('organisation page: figures from the reference screen', async () => {
  const p = await open('/en/organisations/mzo-19-049-502/');
  await p.waitForFunction(() => /120,000/.test(document.querySelector('#view')?.innerText || ''), null, { timeout: 15000 });
  const text = await p.locator('#view').innerText();
  for (const want of ['22', '120,000']) assert.ok(text.includes(want), `missing ${want}`);
  await p.locator('#view button', { hasText: /^Coordinator/ }).first().click();
  assert.equal(await p.locator('#view table tbody tr:visible').count(), 1);
});
await test('organisation page: project link opens the project page with summary', async () => {
  const p = await open('/en/organisations/mzo-19-049-502/');
  await p.waitForSelector('#view table a[href*="/projects/"]', { timeout: 15000 }); await p.locator('#view table a[href*="/projects/"]').first().click();
  await p.waitForURL(/projects\//); await p.waitForFunction(() => [...document.querySelectorAll('#view h2')].some((h) => /^Summary$/.test(h.textContent.trim())), null, { timeout: 15000 });
});
await test('project page links to the EU Project Results Platform', async () => {
  const p = await open('/en/projects/2023-1-hr01-ka220-sch-000158622/');
  await p.waitForSelector('#view a[href^="https://erasmus-plus.ec.europa.eu/projects/search/details/"]', { timeout: 15000 });
});
await test('similar organisations are listed', async () => {
  const p = await open('/en/organisations/mzo-19-049-502/');
  await p.waitForFunction(() => [...document.querySelectorAll('#view h2')].some((h) => /Similar/i.test(h.textContent)), null, { timeout: 15000 });
});
await test('methods: typical project, views, filter', async () => {
  const p = await open('/en/methods/');
  assert.equal(await p.locator('section.card ol li').count(), 18);
  const all = await p.locator('#mtable tbody tr:not([hidden])').count(); assert.ok(all >= 100, `rows ${all}`);
  await p.click('#views button[data-view="growing"]');
  const growing = await p.locator('#mtable tbody tr:not([hidden])').count(); assert.ok(growing > 0 && growing < all);
  assert.match(await p.locator('#viewnote').innerText(), /1\.5 times/);
  await p.click('#views button[data-view="rare"]');
  assert.ok(await p.locator('#mtable tbody tr:not([hidden])').count() > 100);
  await p.click('#views button[data-view="all"]'); await p.fill('#mf', 'peer learning');
  assert.ok(await p.locator('#mtable tbody tr:not([hidden])').count() >= 1);
  await p.fill('#mf', 'zzzzzz'); assert.equal(await p.locator('#none').isVisible(), true);
  const h = await open('/hr/methods/'); assert.match(await h.locator('h1').innerText(), /Metode/); assert.match(await h.locator('#mtable tbody tr:not([hidden]) td').first().innerText(), /[a-zčćšžđ]/i);
});
await test('graph: groups listed, concept search shows what goes with it', async () => {
  const p = await open('/en/graph/');
  assert.ok(await p.locator('details.card').count() >= 15);
  await p.fill('#cs', 'bullying'); assert.ok(await p.locator('#cres li').count() >= 1);
  await p.locator('#cres button').first().click();
  assert.equal(await p.locator('#cbody').isVisible(), true);
  assert.match(await p.locator('#cbody').innerText(), /most often in the same projects/i);
  const before = await p.locator('#cbody h3').innerText();
  await p.locator('#cbody button[data-i]').first().click();
  assert.notEqual(await p.locator('#cbody h3').innerText(), before);
  await p.fill('#cs', 'qqqqq'); assert.equal(await p.locator('#cnone').isVisible(), true);
  const d = await open('/en/graph/#app00002'); assert.match(await d.locator('#cbody h3').innerText(), /peer learning/i);        // link from an Ask answer
  assert.ok(await d.locator('#cbody a[href*="/organisations/"]').count() >= 2);   // Croatian organisations with most projects on this concept (only organisations with 2+ projects)
  assert.match(await d.locator('#cbody').innerText(), /Croatian organisations with most projects/i);
  const h = await open('/hr/graph/'); await h.fill('#cs', 'nasilj'); assert.ok(await h.locator('#cres li').count() >= 1);
});
await test('graph network: groups -> concepts, breadcrumbs, keyboard, phone width', async () => {
  const p = await open('/en/graph/');
  await p.waitForSelector('.gv-node');
  assert.equal(await p.locator('.gv-node').count(), 19);                                  // one bubble per group
  await p.locator('.gv-node').first().click();
  assert.match(await p.locator('.gv-crumbs').innerText(), /All groups\s*›\s*Group:/);
  assert.ok(await p.locator('.gv-node').count() >= 10);
  assert.ok(await p.locator('.gv-sector').count() >= 3);                                  // one sector label per kind
  await p.locator('.gv-node').nth(2).click();                                             // a concept: network re-centres on it
  await p.waitForSelector('.gv-node.center');
  assert.equal(await p.locator('.gv-node.center').count(), 1);
  assert.equal(await p.locator('#cbody').isVisible(), true);
  const name = await p.locator('#cbody h3').innerText();
  assert.ok((await p.locator('.gv-crumbs .gv-here').innerText()).startsWith(name.slice(0, 20)));
  await p.locator('.gv-node:not(.center)').first().focus(); await p.keyboard.press('Enter');   // keyboard works like a click
  assert.notEqual(await p.locator('#cbody h3').innerText(), name);
  await p.locator('.gv-crumbs button', { hasText: 'All groups' }).click();
  assert.equal(await p.locator('.gv-node').count(), 19);
  assert.equal(await p.locator('#cbody').isVisible(), false);
  assert.match(await p.locator('.gv-live').innerText(), /19 groups/);
  const m = await open('/hr/graph/', 390); await m.waitForSelector('.gv-node');
  assert.equal(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);   // no sideways scroll on a phone
  assert.match(await m.locator('.gv-live').innerText(), /skupina pojmova: 19/);
});
await test('graph network: linkable group, show more, zoom', async () => {
  const p = await open('/en/graph/#group-C01'); await p.waitForSelector('.gv-node');
  assert.match(await p.locator('.gv-crumbs').innerText(), /Group:/);                       // a group link opens that group
  const n1 = await p.locator('.gv-node').count();
  await p.locator('.gv-more').click(); await p.waitForTimeout(300);
  assert.ok(await p.locator('.gv-node').count() > n1);                                     // more concepts per kind
  const before = await p.locator('.gv-zoom').getAttribute('transform');
  await p.locator('.gv-zoombar button').first().click();
  assert.notEqual(await p.locator('.gv-zoom').getAttribute('transform'), before);
  assert.match(page_hash(await p.url()), /group-C01/);                                      // the address follows the view
});
function page_hash(u) { return u.split('#')[1] || ''; }
// ---- regressions from the fix list of 6 November: things that came back or were never caught ----
const markerProject = (() => { const f = JSON.parse(fs.readFileSync('src/data/projects_full.json', 'utf-8')); return Object.keys(f).find((k) => (f[k].summary || '').includes('<<') && f[k].hr && f[k].hr.length); })();
await test('English pages have no Croatian one-letter words in numbers ("91 u 2014") and no "<<" markers', async () => {
  for (const path of ['/en/organisations/mzo-19-049-502/', '/en/organisations/oid-e10209270/', `/en/projects/${markerProject.toLowerCase()}/`, '/en/places/varazdinska/']) {
    const p = await open(path); const t = await p.locator('#view').innerText();
    assert.doesNotMatch(t, /\d+ u (19|20)\d\d/, `${path}: ${t.match(/\d+ u (19|20)\d\d/)}`);
    assert.doesNotMatch(t, /<<|>>/, `${path}: markers left in the text`);
  }
});
await test('project summary: each "<< X >>" marker is a heading, in both languages', async () => {
  for (const [lang, word] of [['hr', /Pozadina|Ciljevi|Provedba|Rezultati/], ['en', /Background|Objectives|Implementation|Results/]]) {
    const p = await open(`/${lang}/projects/${markerProject.toLowerCase()}/`); await p.waitForTimeout(1200);
    const heads = await p.locator('#view h3').allInnerTexts();
    assert.ok(heads.some((h) => word.test(h)), `${lang}: headings ${JSON.stringify(heads)}`);
  }
});
await test('English county page: the browser title and the heading use the English county name', async () => {
  const p = await open('/en/places/varazdinska/'); assert.match(await p.title(), /Varaždin County/); assert.doesNotMatch(await p.title(), /županija/);
  const z = await open('/en/places/zagrebacka/'); assert.match(await z.title(), /Zagreb County/);
  const c = await open('/en/coverage/'); assert.doesNotMatch(await c.locator('#view').innerText(), /\d %/, 'English percent signs have no space');
});
await test('assistant: no step of "How it was calculated" shows a raw code (snake_case), in either language', async () => {
  for (const lang of ['hr', 'en']) {
    const p = await open(`/${lang}/ask/`);
    await p.route('**/api/health', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' }));
    await p.route('**/api/ask', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      answer: 'Test answer with enough text to be shown as it is.', lang, route: 'town', verified: true, fallback: false, last_org_id: null, citations: [],
      tools: [{ tool: 'town_compare', args: { towns: ['Pula', 'Rijeka'], period: 'all' }, rows: [] },
              { tool: 'search_concepts', args: { text: 'x', kind: 'topic', limit: 5, by_meaning: true }, rows: [] },
              { tool: 'country_compare', args: { countries: ['IT', 'ES'], partners: true }, rows: [] },
              { tool: 'coverage', args: { county: 'Varaždinska', school_type: 'primary', period: 'all', role: 'coordinator' }, rows: [] },
              { tool: 'county_ranking', args: { period: '2014-2020', limit: 5, order_by: 'organisations' }, rows: [] }] }) }));
    await p.reload({ waitUntil: 'networkidle' });
    await p.locator('.topics .sug button').first().click(); await p.waitForTimeout(1500);
    const t = await p.locator('#view .bubble').first().textContent();
    assert.doesNotMatch(t, /\b[a-z]+_[a-z_]+\b/, `${lang}: ${t.match(/\b[a-z]+_[a-z_]+\b/)}`);
    assert.doesNotMatch(t, /razdoblje: all\b|period: all(?! periods)/);
  }
});
await test('machine-translation note: shown on Croatian pages only, links to the English page, can be dismissed, and is repeated on the About page', async () => {
  const hr = await open('/hr/projects/'); const note = hr.locator('#langnote');
  assert.equal(await note.count(), 1); assert.equal(await note.isVisible(), true);
  const text = (await note.locator('p').innerText()).replace(/\s+/g, ' ');
  assert.match(text, /strojno prevedena s pomoću umjetne inteligencije/); assert.match(text, /preporučujemo da koristite stranicu na engleskom jeziku/);
  assert.equal(await note.getAttribute('role'), 'note');
  assert.match(await note.locator('a').getAttribute('href'), /\/en\/projects\/$/);                    // the same page in English
  const land = await open('/hr/'); assert.equal(await land.locator('#langnote').isVisible(), true);      // also on the landing page
  const en = await open('/en/projects/'); assert.equal(await en.locator('#langnote').count(), 0);
  const tog = hr.locator('#langnote-toggle');
  assert.equal(await tog.getAttribute('aria-pressed'), 'true'); assert.match(await tog.getAttribute('aria-label'), /^Sakrij napomenu/);
  await tog.click(); assert.equal(await note.isVisible(), false); assert.equal(await tog.getAttribute('aria-pressed'), 'false'); assert.match(await tog.getAttribute('aria-label'), /^Prikaži napomenu/);
  await tog.click(); assert.equal(await note.isVisible(), true, 'the icon shows the note again');
  assert.equal(await (await open('/en/projects/')).locator('#langnote-toggle').count(), 0, 'no icon on English pages');
  await hr.locator('#langnote-x').click(); assert.equal(await note.isVisible(), false); assert.equal(await tog.getAttribute('aria-pressed'), 'false');
  await hr.goto(URL + '/hr/places/'); await hr.waitForTimeout(300); assert.equal(await hr.locator('#langnote').isVisible(), false, 'dismissal is remembered on the next page');
  const about = await open('/hr/about/'); const copy = (await about.locator('#langnote-about').innerText()).replace(/\s+/g, ' ');
  assert.equal(copy, text.replace(/ Prebaci na engleski$/, ''), 'the About page repeats the same text');
  assert.equal(await (await open('/en/about/')).locator('#langnote-about').count(), 0);
});
await test('scrollbars are hidden by default, appear while the page scrolls and fade out afterwards', async () => {
  const p = await open('/hr/projects/', 1280); await p.waitForTimeout(500);
  const color = () => p.evaluate(() => getComputedStyle(document.documentElement).scrollbarColor);
  assert.match(await color(), /^rgba\(0, 0, 0, 0\) rgba\(0, 0, 0, 0\)$/, 'transparent at rest');
  await p.mouse.move(640, 400); await p.evaluate(() => window.scrollTo(0, 600)); await p.waitForTimeout(150);
  assert.equal(await p.evaluate(() => 'scrolling' in document.documentElement.dataset), true, 'marked while scrolling');
  assert.doesNotMatch(await color(), /^rgba\(0, 0, 0, 0\) /, 'a visible thumb while scrolling');
  await p.waitForTimeout(1300);
  assert.equal(await p.evaluate(() => 'scrolling' in document.documentElement.dataset), false, 'the mark is removed after a moment');
  assert.match(await color(), /^rgba\(0, 0, 0, 0\) rgba\(0, 0, 0, 0\)$/, 'hidden again');
  const side = await p.evaluate(() => { const e = document.querySelector('.sidein'); return { width: getComputedStyle(e).scrollbarWidth, gutter: e.offsetWidth - e.clientWidth }; });
  assert.deepEqual(side, { width: 'none', gutter: 0 }, 'the side menu has no scrollbar and no gutter');
  const m = await open('/hr/projects/', 1280, { fast: true }); await m.mouse.move(100, 300);
  assert.equal(await m.evaluate(() => { const e = document.querySelector('.sidein'); return e.offsetWidth - e.clientWidth; }), 0, 'still none when the pointer is over it');
});
await test('top-bar search finds counties, organisations and projects in groups, in both languages, and the keyboard skips the group labels', async () => {
  for (const [lang, q, want, group] of [['hr', 'Varaždinska', 'Varaždinska županija', /županije/i], ['en', 'Varaždin County', 'Varaždin County', /counties/i]]) {
    const p = await open(`/${lang}/projects/`); await p.locator('#gs').fill(q); await p.waitForSelector('#gs-res:not([hidden]) a');
    assert.match(await p.locator('#gs-res .gl').first().innerText(), group);
    assert.ok((await p.locator('#gs-res a span').allInnerTexts()).some((t) => t.includes(want)), `${lang}: county "${want}" in the results`);
  }
  const p = await open('/hr/projects/');
  await p.locator('#gs').fill('Circular Connections'); await p.waitForSelector('#gs-res:not([hidden]) a');
  assert.ok((await p.locator('#gs-res .gl').allInnerTexts()).some((t) => /projekti/i.test(t)), 'a project group');
  assert.match(await p.locator('#gs-res a').first().getAttribute('href'), /\/hr\/projects\/[^/]+\/$/);
  await p.locator('#gs').fill('metkovic gimnazija'); await p.waitForSelector('#gs-res:not([hidden]) a');                      // words in any order, accents optional
  assert.ok((await p.locator('#gs-res a span').allInnerTexts()).some((t) => /Gimnazija Metković/.test(t)), 'an organisation found by words in any order');
  await p.locator('#gs').press('ArrowDown'); assert.equal(await p.evaluate(() => document.activeElement.tagName + ':' + !!document.activeElement.closest('#gs-res')), 'A:true', 'the first ArrowDown lands on a link, not a label');
  await p.locator('#gs').fill('Circular Connections'); await p.waitForSelector('#gs-res:not([hidden]) a'); await p.locator('#gs-res a').first().click();
  await p.waitForURL(/\/hr\/projects\/.+\//); assert.match(await p.locator('h1').first().innerText(), /Circular Connections/);
  await p.goto(URL + '/hr/projects/'); await p.locator('#gs').fill('zzzzqqqq'); await p.waitForTimeout(500); assert.equal(await p.locator('#gs-res').isVisible(), false, 'no results: the list stays closed');
});
await test('home page: the search results open on top of the buttons and figures below, not mixed with them', async () => {
  for (const [lang, w] of [['en', 1280], ['hr', 1280], ['en', 1024], ['en', 390]]) {
    const p = await open(`/${lang}/`, w); await p.setViewportSize({ width: w, height: 1800 }); await p.waitForTimeout(400);
    await p.fill('.gsearch.hero input', 'a'); await p.waitForSelector('.gsearch.hero .gres:not([hidden])');
    const covered = await p.evaluate(() => {
      const r = document.querySelector('.gsearch.hero .gres').getBoundingClientRect(); const bad = [];
      for (const f of [0.05, 0.25, 0.5, 0.75, 0.95]) for (const x of [0.15, 0.85]) { const e = document.elementFromPoint(r.left + r.width * x, r.top + r.height * f); if (!e || !e.closest('.gres')) bad.push(`${f},${x}:${e && e.tagName + '.' + e.className}`); }
      return bad;
    });
    assert.deepEqual(covered, [], `${lang} ${w}px: something paints over the result list`);
  }
});
await test('contact form: sends the message to POST /api/contact and shows what happened (sent, too many, failed, invalid input)', async () => {
  const p = await open('/hr/contact/'); const sent = []; let status = 200;
  await p.route('**/api/contact', (r) => { sent.push(JSON.parse(r.request().postData())); r.fulfill({ status, contentType: 'application/json', body: status === 200 ? '{"status":"ok"}' : '{"detail":"x"}' }); });
  const submit = () => p.click('#kf button[type=submit]');
  await submit(); assert.equal(sent.length, 0); assert.match(await p.locator('#kerr').innerText(), /Upišite poruku/);          // empty: nothing is sent
  await p.fill('#km', 'Greška u tablici'); await p.fill('#ke', 'nije-adresa'); await submit();
  assert.equal(sent.length, 0); assert.match(await p.locator('#keerr').innerText(), /Provjerite adresu/);                      // bad address: nothing is sent
  await p.fill('#ke', 'ana@example.com'); await p.selectOption('#kt', 'q'); await submit(); await p.waitForSelector('#kok:not([hidden])');
  assert.equal(sent.length, 1); assert.deepEqual({ ...sent[0], page: undefined }, { kind: 'question', message: 'Greška u tablici', email: 'ana@example.com', page: undefined, lang: 'hr', website: '' });
  assert.equal(sent[0].page, '/hr/contact/'); assert.match(await p.locator('#kok').innerText(), /Poruka je poslana/);
  assert.equal(await p.inputValue('#km'), '', 'the form is cleared once the message is sent');
  status = 429; await p.fill('#km', 'još jedna'); await submit(); await p.waitForSelector('#krate:not([hidden])'); assert.equal(await p.locator('#kok').isVisible(), false);
  assert.equal(await p.inputValue('#km'), 'još jedna', 'a message that was not sent stays in the box');
  status = 503; await submit(); await p.waitForSelector('#kfail:not([hidden])'); assert.match(await p.locator('#kfail').innerText(), /Poruka nije poslana/);
  assert.equal(await p.locator('#kf button[type=submit]').isDisabled(), false, 'the button works again');
  const en = await open('/en/contact/'); await en.route('**/api/contact', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' }));
  await en.fill('#km', 'A mistake in the table'); await en.click('#kf button[type=submit]'); await en.waitForSelector('#kok:not([hidden])');
  assert.match(await en.locator('#kok').innerText(), /Your message has been sent/); assert.equal(await en.evaluate(() => document.querySelector('#kw').closest('.hp') !== null), true);
});
await test('no console errors', async () => { if (errors.length) console.log(errors.slice(0, 8)); assert.deepEqual(errors, []); });
await browser.close(); stop();
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);

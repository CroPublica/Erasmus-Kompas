// Browser tests: node tests/ui.mjs  (needs `npm run build`; starts its own preview server on port 4399)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const BASE = (process.env.SITE_BASE || '').replace(/\/$/, '');
const URL = 'http://localhost:4399' + BASE;
// `astro preview` detaches itself from its parent, so the server is stopped by the port it listens on (Linux: ss)
import { execSync } from 'node:child_process';
const listener = () => { try { return execSync("ss -ltnp | grep ':4399 ' | grep -o 'pid=[0-9]*' | cut -d= -f2").toString().trim(); } catch { return ''; } };
if (listener()) { console.error('port 4399 is already in use (an old preview server?): stop it first'); process.exit(2); }
const srv = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'preview', '--port', '4399'], { stdio: 'ignore', detached: true });
const stop = () => { const p = listener(); if (p) try { process.kill(Number(p), 'SIGKILL'); } catch {} };
process.on('exit', stop);
await new Promise((r) => setTimeout(r, 4000));
const browser = await chromium.launch();
const errors = [];
let passed = 0, failed = 0;
const open = async (path, w = 1280) => {
  const p = await browser.newPage({ viewport: { width: w, height: 900 } });
  p.on('console', (m) => m.type() === 'error' && !/status of (429|503|500)/.test(m.text()) && errors.push(`${path}: ${m.text()}`));  // mocked API failures are expected
  p.on('pageerror', (e) => errors.push(`${path}: ${e}`));
  await p.goto(URL + path);
  return p;
};
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('ok   ', name); }
  catch (e) { failed++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
};
const headline = (p) => p.locator('#headline .big-n').innerText();

await test('coverage: headline and HR/EN number format', async () => {
  const en = await open('/en/'); assert.match(await headline(en), /^\d+\.\d %$/);
  const hr = await open('/hr/'); assert.match(await headline(hr), /^\d+,\d %$/);
});
await test('coverage: filters change the figures', async () => {
  const p = await open('/en/'); const base = await headline(p);
  await p.click('button[data-val="kindergarten"]'); const k = await headline(p);
  assert.notEqual(k, base);
  await p.click('button[data-val="primary"]'); await p.click('button[data-val="coordinator"]');
  assert.notEqual(await headline(p), base);
  assert.equal(await p.locator('#tiles .tile').count(), 21);
});
await test('coverage: selecting a county shows the panel and a link', async () => {
  const p = await open('/en/'); await p.click('.tile[data-county="Zagrebačka"]');
  assert.ok(await p.locator('#selected').isVisible());
  assert.match(await p.locator('#sel-text').innerText(), /schools took part/);
  await p.click('#sel-open'); assert.match(p.url(), /\/en\/places\/zagrebacka\/$/);
});
await test('language toggle keeps the page', async () => {
  const p = await open('/en/organisations/'); await p.click('.lang a[hreflang="hr"]');
  assert.match(p.url(), /\/hr\/organisations\/$/);
});
await test('organisations: filter by name', async () => {
  const p = await open('/en/organisations/'); await p.fill('#q', 'metković');
  const visible = await p.locator('#rows tr:not([hidden])').count();
  assert.ok(visible >= 1 && visible < 50, `visible ${visible}`);
});
await test('header search finds an organisation and opens it', async () => {
  const p = await open('/en/'); await p.fill('#gs', 'gimnazija metkovic');
  await p.locator('#gs-res a').first().waitFor();
  await p.locator('#gs-res a', { hasText: 'METKOVIĆ' }).first().click();
  await p.waitForURL(/organisations\//); assert.match(await p.locator('h1').innerText(), /METKOVI/i);
});
await test('organisation page: figures from the reference screen', async () => {
  const p = await open('/en/organisations/mzo-19-049-502/');
  const text = await p.locator('.kpis').first().innerText();
  for (const want of ['22', '120,000', '3,273,111', '10 in 2014–2020']) assert.ok(text.includes(want), `missing ${want}`);
  await p.click('.seg button[data-role="coordinator"]');
  assert.equal(await p.locator('#prows tr:not([hidden])').count(), 1);
});
await test('organisation page: project link opens the project page with summary', async () => {
  const p = await open('/en/organisations/mzo-19-049-502/'); await p.locator('#prows a').first().click();
  await p.waitForURL(/projects\//); assert.ok((await p.locator('h2', { hasText: 'Summary' }).count()) === 1);
});
await test('project page links to the EU Project Results Platform', async () => {
  const p = await open('/en/projects/' + '2023-1-hr01-ka220-sch-000158622'.replace(/[^a-z0-9]+/g, '-') + '/');
  const href = await p.locator('a', { hasText: 'Project Results Platform' }).getAttribute('href');
  assert.match(href, /^https:\/\/erasmus-plus\.ec\.europa\.eu\/projects\/search\/details\//);
});
await test('similar organisations are listed', async () => {
  const p = await open('/en/organisations/mzo-19-049-502/'); assert.ok(await p.locator('.simcard').count() >= 1);
});
await test('no horizontal scroll at phone width', async () => {
  for (const path of ['/hr/', '/en/organisations/', '/en/organisations/mzo-19-049-502/', '/en/places/zagrebacka/']) {
    const p = await open(path, 390);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, path);
  }
});
await test('accessibility (axe: wcag2a/aa) has no violations', async () => {
  const bad = [];
  for (const path of ['/en/', '/hr/', '/en/organisations/', '/en/organisations/mzo-19-049-502/', '/en/places/zagrebacka/', '/en/places/', '/en/ask/', '/hr/ask/', '/en/methods/', '/hr/methods/', '/en/graph/', '/hr/graph/', '/en/overview/', '/hr/overview/', '/en/projects/', '/en/topics/', '/hr/topics/']) {
    const p = await open(path); await p.addScriptTag({ path: axePath });
    const r = await p.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] }));
    for (const v of r.violations) bad.push(`${path} ${v.id} (${v.nodes.length}): ${v.nodes[0].target}`);
  }
  if (bad.length) throw new Error(bad.join(' | '));
});
await test('keyboard: skip link moves focus to main; selecting a tile keeps focus on it', async () => {
  const p = await open('/en/'); await p.keyboard.press('Tab'); await p.keyboard.press('Enter');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'main');
  await p.focus('.tile[data-county="Istarska"]'); await p.keyboard.press('Enter');
  assert.equal(await p.evaluate(() => document.activeElement.dataset.county), 'Istarska');
  await p.focus('#rank a[href*="/places/zadarska/"]'); await p.keyboard.press('Enter');                      // the county name in the ranking is a link to the county page
  await p.waitForURL(/places\/zadarska\//);
  const q = await open('/en/'); await q.locator('#rank .rank[data-rank="Istarska"] .range').click();          // the rest of the row selects the county on the map
  assert.equal(await q.locator('#selected').isVisible(), true);
});
await test('keyboard: search results reachable with arrows, Escape returns to the box', async () => {
  const p = await open('/en/'); await p.focus('#gs'); await p.keyboard.type('metkov'); await p.locator('#gs-res a').first().waitFor();
  await p.keyboard.press('ArrowDown'); assert.equal(await p.evaluate(() => document.activeElement.tagName), 'A');
  await p.keyboard.press('Escape'); assert.equal(await p.evaluate(() => document.activeElement.id), 'gs');
});
await test('ask page: answer, sources, how-I-got-this, follow-up keeps the organisation', async () => {
  const p = await open('/en/ask/'); const bodies = [];
  await p.route('**/api/ask', async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ json: { answer: 'Gimnazija METKOVIĆ: 22 KA2 projects.', lang: 'en', route: 'organisation', verified: true, fallback: false,
      last_org_id: 'MZO-19-049-502', citations: ['org:MZO-19-049-502', 'project:2023-1-HR01-KA220-SCH-000158622'],
      tools: [{ tool: 'organisation_profile', args: { org_id: 'MZO-19-049-502' }, notes: ['grants are per project'] }] } });
  });
  await p.fill('#q', 'How many KA2 projects does Gimnazija Metković have?'); await p.click('#go');
  await p.locator('#out .card').waitFor();
  assert.match(await p.locator('#out').innerText(), /22 KA2 projects/);
  const links = await p.locator('#out a.pill').evaluateAll((a) => a.map((x) => x.getAttribute('href')));
  assert.ok(links[0].endsWith('/en/organisations/mzo-19-049-502/') && links[1].includes('/en/projects/'), links.join());
  await p.locator('#out summary').click(); assert.match(await p.locator('#out details').innerText(), /organisation_profile/);
  await p.fill('#q', 'And how many did it coordinate?'); await p.click('#go'); await p.waitForTimeout(300);
  assert.equal(bodies[1].last_org_id, 'MZO-19-049-502');
  await p.locator('#out a.pill').first().click(); await p.waitForURL(/organisations\//);
});
await test('ask page: busy, rate limit and failure are shown, example questions work', async () => {
  const p = await open('/hr/ask/'); let code = 429;
  await p.route('**/api/ask', (route) => route.fulfill({ status: code, json: {} }));
  await p.fill('#q', 'test'); await p.click('#go'); await p.locator('#out .warn').waitFor();
  assert.match(await p.locator('#out').innerText(), /Previše pitanja/);
  code = 503; await p.fill('#q', 'test'); await p.click('#go'); await p.waitForFunction(() => /zauzeta/.test(document.getElementById('out').innerText));
  code = 500; await p.fill('#q', 'test'); await p.click('#go'); await p.waitForFunction(() => /pošlo po zlu/.test(document.getElementById('out').innerText));
  await p.locator('.ex').first().click(); assert.ok((await p.inputValue('#q')).length > 10);
});
await test('overview: national figures, period switch, country ranking', async () => {
  const p = await open('/en/overview/');
  let text = await p.locator('[data-ov="all"]').innerText();
  assert.ok(text.includes('3,830') && text.includes('606'), 'national totals');
  await p.click('#ov-filters button[data-val="2014-2020"]'); await p.waitForTimeout(100);
  text = await p.locator('[data-ov="2014-2020"]').innerText(); assert.ok(text.includes('2,040'));
  await p.click('#ov-filters button[data-val="2021-2027"]'); text = await p.locator('[data-ov="2021-2027"]').innerText();
  assert.ok(text.includes('1,790') && /Germany\s+2,024/.test(text.replace(/\n/g, ' ')) && /Croatia ranks 21 of 100/.test(text));
  const hr = await open('/hr/overview/'); assert.ok((await hr.locator('[data-ov="all"]').innerText()).includes('3.830'));
});
await test('organisation list: sort, period filter, coordinators only', async () => {
  const p = await open('/en/organisations/');
  const firstName = async () => p.locator('#rows tr:not([hidden]) td a').first().innerText();
  assert.match(await firstName(), /Sveučilište u Zagrebu/i);
  await p.selectOption('#o', 'n'); const byName = await firstName();
  assert.notEqual(byName, 'Sveučilište u Zagrebu'); await p.selectOption('#o', 'p');
  const all = await p.locator('#rows tr:not([hidden])').count();
  await p.selectOption('#p', '1'); const first = Number((await p.locator('#rows tr:not([hidden]) .pj').first().innerText()).replace(/\D/g, ''));
  assert.equal(first, 91);                                   // Sveučilište u Zagrebu, 2014-2020
  await p.check('#co'); const coord = await p.locator('#rows tr:not([hidden])').evaluateAll((r) => r.every((x) => Number(x.querySelector('.cd').textContent.replace(/\D/g, '')) > 0));
  assert.ok(coord);
  await p.selectOption('#k', 'ngo'); assert.ok((await p.locator('#rows tr:not([hidden])').count()) < all);
});
await test('project search: words, filters, links', async () => {
  const p = await open('/en/projects/'); await p.locator('#pres li a').first().waitFor();
  const total = Number((await p.locator('#pcount').innerText()).replace(/\D/g, ''));
  assert.equal(total, 3830);
  await p.fill('#pq', 'biljna pozornica'); await p.waitForFunction(() => /^1 /.test(document.getElementById('pcount').innerText));
  assert.match(await p.locator('#pres').innerText(), /Biljna pozornica/);
  await p.fill('#pq', ''); await p.selectOption('#pp', '2014-2020');
  await p.waitForFunction(() => /^2,040 /.test(document.getElementById('pcount').innerText));
  await p.selectOption('#pc', 'DE'); const n = Number((await p.locator('#pcount').innerText()).replace(/\D/g, '')); assert.ok(n > 10 && n < 2040);
  await p.fill('#pq', 'zzzzqqqq'); await p.waitForFunction(() => /No project matches/.test(document.getElementById('pres').innerText));
  await p.selectOption('#pp', ''); await p.selectOption('#pc', ''); await p.fill('#pq', 'biljna'); await p.locator('#pres a').first().click(); await p.waitForURL(/projects\//);
});
await test('topics over time: lines, the 2021 break, limits, data table', async () => {
  const p = await open('/en/topics/');
  assert.equal(await p.locator('#legend li').count(), 5);
  assert.match(await p.locator('#chart').innerHTML(), /topic list changed/);
  assert.equal(await p.locator('#chart polyline').count() >= 5, true);
  await p.locator('summary', { hasText: 'data table' }).click();
  const rows = await p.locator('#dtable tbody tr').count(); assert.equal(rows, 13);
  const ai = await p.locator('#dtable tbody tr', { hasText: '2022' }).innerText(); assert.ok(ai.includes('–'));     // AI has no value before 2023? new list only from 2021
  const first = await p.locator('#dtable tbody tr').first().innerText(); assert.ok(first.includes('2014'));
  await p.locator('input[value="Artificial Intelligence (AI) and data usage"]').uncheck();
  assert.equal(await p.locator('#legend li').count(), 4);
  for (const b of await p.locator('#picker input[type=checkbox]').all()) { if (await p.locator('#legend li').count() >= 8) break; await b.check(); }
  assert.equal(await p.locator('#legend li').count(), 8);
  const extra = p.locator('#picker input[type=checkbox]:not(:checked)').first(); await extra.check({ force: true }).catch(() => {});
  assert.equal(await p.locator('#legend li').count(), 8);
  await p.fill('#tf', 'zzzz'); assert.equal(await p.locator('#picker label.chk:visible').count(), 0);
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
  assert.match(await m.locator('.gv-live').innerText(), /19 skupina/);
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
await test('no console errors', async () => assert.deepEqual(errors, []));
await browser.close(); stop();
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);

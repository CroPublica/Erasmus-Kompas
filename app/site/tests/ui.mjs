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
  for (const path of ['/en/', '/hr/', '/en/organisations/', '/en/organisations/mzo-19-049-502/', '/en/places/zagrebacka/', '/en/places/', '/en/ask/', '/hr/ask/']) {
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
  await p.focus('#rank [data-county="Zadarska"]'); await p.keyboard.press('Enter');
  assert.equal(await p.evaluate(() => document.activeElement.dataset.county), 'Zadarska');
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
  code = 503; await p.click('#go'); await p.waitForFunction(() => /zauzeta/.test(document.getElementById('out').innerText));
  code = 500; await p.click('#go'); await p.waitForFunction(() => /pošlo po zlu/.test(document.getElementById('out').innerText));
  await p.locator('.ex').first().click(); assert.ok((await p.inputValue('#q')).length > 10);
});
await test('no console errors', async () => assert.deepEqual(errors, []));
await browser.close(); stop();
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);

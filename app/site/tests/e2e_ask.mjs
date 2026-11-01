// End-to-end check of the Ask page with NO mocks: a running site container (port 8080, proxying /api/ to the API) + the real API and models.
//   docker run -d --rm --name ka2t --network host ka2-atlas     (site on :8080, API proxy to 127.0.0.1:8000)
//   uvicorn atlas.api:app --host 127.0.0.1 --port 8000          (from app/, with Ollama running)
//   node tests/e2e_ask.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const URL = process.env.E2E_URL || 'http://localhost:8080';
const b = await chromium.launch(); let ok = 0, bad = 0; const errs = [];
const test = async (n, f) => { try { await f(); ok++; console.log('ok   ', n); } catch (e) { bad++; console.log('FAIL ', n, '\n     ', String(e.message).split('\n')[0]); } };
const ask = async (p, q) => { await p.fill('#q', q); await p.click('#go'); await p.locator('#out .card, #out .warn').first().waitFor({ timeout: 60000 }); return p.locator('#out').innerText(); };
const page = async (path) => { const p = await b.newPage(); p.on('pageerror', (e) => errs.push(String(e))); await p.goto(URL + path); return p; };
await test('Croatian question: figures, sources and the tools used', async () => {
  const p = await page('/hr/ask/'); const t = await ask(p, 'Koliko je KA2 projekata imala Gimnazija Metković?');
  assert.ok(t.includes('22') && t.includes('120.000') && t.includes('Biljna pozornica'), t);
  assert.ok((await p.locator('#out a.pill').count()) >= 5);
  await p.locator('#out summary').click(); assert.match(await p.locator('#out details').innerText(), /organisation_profile/);
});
await test('follow-up keeps the organisation (second question has no name)', async () => {
  const p = await page('/hr/ask/'); await ask(p, 'Koliko je KA2 projekata imala Gimnazija Metković?');
  const t = await ask(p, 'A koliko ih je koordinirala?'); assert.match(t, /1 kao koordinator/);
});
await test('English question gets an English answer; success-rate route', async () => {
  const p = await page('/en/ask/'); const t = await ask(p, 'What was the KA2 success rate in Croatia in 2023?');
  assert.ok(t.includes('405') && t.includes('49') && t.includes('12.1'), t); assert.match(t, /applications/i);
});
await test('a refusal is a refusal, not an answer', async () => {
  const p = await page('/hr/ask/'); const t = await ask(p, 'Tko je ravnatelj Gimnazije Metković?'); assert.match(t, /ne mogu odgovoriti/i);
});
await test('no script errors', async () => assert.deepEqual(errs, []));
await b.close(); console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);

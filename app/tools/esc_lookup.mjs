// Looks up search terms in the public EU "Search for an organisation" register (Simple Search).
//   node tools/esc_lookup.mjs queries.json results.json     queries.json = ["E10028440", "osnovna skola cakovec", ...]
// Results are cached in the output file (terms already there are skipped) and requests are spaced out (1.5 s).
import { chromium } from '../site/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [inFile, outFile] = process.argv.slice(2);
const queries = JSON.parse(readFileSync(inFile, 'utf8'));
const out = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {};
const todo = queries.filter((q) => !(q in out));
console.log(`${queries.length} terms, ${todo.length} to look up`);
if (todo.length) {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('https://webgate.ec.europa.eu/erasmus-esc/organisations/search-for-an-organisation', { waitUntil: 'networkidle' });
  for (const q of todo) {
    out[q] = await p.evaluate(async (filter) => {
      const r = await fetch('https://webgate.ec.europa.eu/eescp-backend/ext-api/organisation-registration/simpleSearch', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify({ filter }) });
      return r.ok ? await r.json() : { error: r.status };
    }, q);
    writeFileSync(outFile, JSON.stringify(out));
    await p.waitForTimeout(1500);
  }
  await b.close();
}

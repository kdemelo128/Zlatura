/* A long comp list draws its first 200 rows, then "Show all": 1,200 comps (invented, opened as a project file)
 * must keep an edit under the 150 ms budget at desktop and phone size, while totals, export, sort and filter
 * still see every comp, a comp past row 200 can be typed in without losing focus, and a new comp is drawn.
 * Timed the way perf-flow.mjs does: a capturing listener starts the clock at the user's change, the stop is the
 * footer total changing, read after the next frame. */
import fs from 'fs';
import { phone, BASE, finish } from './lib.mjs';
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const N = 1200;
const comps = [];
let sumP = 0;
for (let i = 0; i < N; i++) {
  const price = 1000000 + i * 1000; sumP += price;
  comps.push({
    key: `manual::t${i}`, manual: true, kind: 'sale', origKind: 'sale', name: `Invented Comp ${String(i).padStart(4, '0')}`,
    address: `${i} Example Way`, city: 'Testville', state: 'TS', zip: null, submarket: null, zoning: null,
    date: new Date(Date.UTC(2025, i % 12, 1 + (i % 27))).toISOString(), dom: null, price, bsf: 10000 + (i % 50) * 100,
    cap: null, occ: null, lot_sf: null, lot_ac: null, far: null, year: null, bclass: null, ptype: null, comp_id: null,
    buyer_broker: null, listing_broker: null, notes: null, costar_notes: null, costar_ppsf: null, partial: false,
    occ_basis: 'explicit', parcels: [], portfolio: 0, source: 'entered by hand', flags: [], exclude: false,
  });
}
fs.writeFileSync(`${F}comps1200.json`, JSON.stringify({ format: 'zlatura-project', version: 1, docs: [], edits: {}, manual: comps }));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const rowsN = (page) => page.locator('#sales-table tbody tr[data-key]').count();

async function run(label, opts, last) {
  const { browser, page, errors } = await phone(opts);
  await page.addInitScript(() => {
    window.__arm = (test) => {
      window.__done = null;
      document.addEventListener('change', (e) => {
        if (!e.isTrusted) return;
        const t0 = performance.now();
        const tick = () => { if (test()) requestAnimationFrame(() => setTimeout(() => { window.__done = performance.now() - t0; }, 0)); else setTimeout(tick, 0); };
        tick();
      }, { capture: true, once: true });
    };
  });
  await page.goto(`${BASE}#comps`, { waitUntil: 'load' });
  await page.setInputFiles('#file', `${F}comps1200.json`);
  await page.waitForFunction(() => document.querySelectorAll('#sales-table tbody tr[data-key]').length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  check(`${label}: only 200 rows are drawn of 1,200`, (await rowsN(page)) === 200, String(await rowsN(page)));
  const line = await page.locator('#sales-table .cap-row').innerText();
  check(`${label}: the table says "Showing 200 of 1,200 comps"`, /Showing 200 of 1,200 comps/.test(line), line);
  const btn = page.locator('#sales-table .cap-row button');
  check(`${label}: the Show all button is 44 px tall and labelled`, (await btn.boundingBox()).height >= 44 && /Show all 1,200 comps/.test(await btn.innerText()));
  check(`${label}: the announcement is a status row`, (await page.locator('#sales-table .cap-row[role="status"]').count()) === 1);
  const foot = () => page.locator('#sales-table tfoot').innerText();
  const ft = await foot();
  check(`${label}: the footer totals cover all 1,200 comps`, ft.includes('1200 priced of 1200') && ft.replace(/\s+/g, ' ').includes(`$${sumP.toLocaleString('en-US')}`), ft.replace(/\s+/g, ' ').slice(0, 90));
  // edits
  const ms = [];
  for (let k = 0; k < 5; k++) {
    const price = page.locator('#sales-table tbody tr[data-key]').nth(k).locator('input[aria-label="Sale price"]');
    const before = await foot();
    await price.fill(String(2000000 + k * 7919));
    await page.evaluate((b) => window.__arm(() => document.querySelector('#sales-table tfoot').innerText !== b), before);
    await price.press('Tab');
    await page.waitForFunction(() => window.__done !== null, null, { timeout: 30000 });
    ms.push(await page.evaluate(() => window.__done));
    await page.waitForTimeout(300);
  }
  check(`${label}: an edit at 1,200 comps paints in under 150 ms (median)`, median(ms) < 150, `${Math.round(median(ms))} ms [${ms.map(Math.round)}]`);
  if (!last) { await browser.close(); return; }
  // Show all
  await btn.click();
  check('Show all draws all 1,200 rows', (await rowsN(page)) === N, String(await rowsN(page)));
  check('focus moves to the toggle, which now offers the short list', await page.evaluate(() => document.activeElement?.closest('.cap-row') !== null && /first 200/.test(document.activeElement.textContent)));
  // typing a character at a time in a comp past row 200
  const far = page.locator('#sales-table tbody tr[data-key]').nth(900);
  const fk = await far.getAttribute('data-key');
  const inp = far.locator('input[aria-label="Property name"]');
  await inp.scrollIntoViewIfNeeded();
  await inp.click();
  await inp.press('End');
  let kept = true;
  for (const ch of 'XYZ') {
    await page.keyboard.type(ch);
    kept = kept && await page.evaluate((k) => { const a = document.activeElement; return a?.closest('tr')?.dataset.key === k && a.getAttribute('aria-label') === 'Property name'; }, fk);
  }
  check('typing character by character past row 200 keeps focus', kept);
  const y0 = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  check('the typed name is kept and the row stays put', (await page.locator(`tr[data-key="${fk}"] input[aria-label="Property name"]`).inputValue()).endsWith('XYZ') && Math.abs((await page.evaluate(() => window.scrollY)) - y0) < 200);
  // CSV has every comp
  await page.click('#comps-more'); await page.waitForTimeout(250);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('.action-sheet .action-item', { hasText: 'CSV' }).first().click()]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  check('the CSV holds all 1,200 comps', new Set(csv.match(/Invented Comp \d{4}/g)).size === N, String(new Set(csv.match(/Invented Comp \d{4}/g)).size));
  // back to the short list, then add a comp: it sorts last (no price) and is drawn
  await page.locator('#sales-table .cap-row button').click();
  check('Show the first 200 only returns to the short list (200 rows plus the one edited past row 200)', (await rowsN(page)) === 201);
  await page.click('[data-add="sale"]');
  await page.waitForTimeout(300);
  check('a comp just added is drawn and focused though it sorts past row 200', await page.evaluate(() => { const a = document.activeElement; return a?.getAttribute('aria-label') === 'Property name' && a.value === 'New sale comp'; }), '');
  check('the list is then 202 rows with the cap line', (await rowsN(page)) === 202 && /Showing 202 of 1,201/.test(await page.locator('#sales-table .cap-row').innerText()));
  // filter reaches comps past row 200
  await page.fill('#sale-search', 'Invented Comp 1100');
  await page.waitForTimeout(500);
  check('search finds a comp that was past row 200', (await rowsN(page)) === 1);
  check('no console errors', errors.length === 0, errors.join(' / '));
  await browser.close();
}
await run('desktop', { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 }, true);
await run('phone', {}, false);
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', []);

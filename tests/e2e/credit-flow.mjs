/* The deal's tenant credit record (deal.credit) in a browser: the Credit card on a deal made by hand, every
 * field typed one key at a time, a rating that cannot be saved without its four parts, capitals evened only on an
 * exact scale match, the checks, the OM's guarantor offered with a Use tap, the hostile text pack, a reload,
 * Undo, and a backup and its restore (store sales in the backup, never in an export). Then axe at phone and
 * desktop size.
 *
 *   node credit-flow.mjs                        # BASE=http://localhost:8080/ by default
 *   OLD_BASE=http://localhost:8081/ node credit-flow.mjs   # also: an older app (4.7.64), served there, refuses this version's backup */
import fs from 'fs';
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
import { PACK } from '../fixtures/hostile.js';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const { browser, ctx, page, errors } = await phone();
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
page.setDefaultTimeout(8000);
const pause = (ms = 25) => page.waitForTimeout(ms);
const settle = () => page.waitForTimeout(700); // a save is kept 400 ms after the last edit
const txt = (sel) => page.textContent(sel);
const deals = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('deals').objectStore('deals').getAll(); g.onsuccess = () => { r.result.close(); res(g.result.map((d) => ({ id: d.id, schema: d.schema, credit: d.credit ?? null }))); }; }; }));
const credit = async () => (await deals())[0].credit;
const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });

/** Focus a field and type `text` one key at a time: after EVERY keystroke it must hold exactly what was typed so far, still focused and the same element. */
async function typeChars(sel, text) {
  const loc = page.locator(sel);
  await loc.scrollIntoViewIfNeeded();
  await loc.focus();
  await page.evaluate(() => { window.__probe = document.activeElement; });
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await pause();
  const bad = [];
  let prefix = '';
  for (const ch of text) {
    await page.keyboard.type(ch);
    await pause();
    prefix += ch;
    const st = await page.evaluate(() => { const p = window.__probe; return { v: p.value, focused: document.activeElement === p, connected: p.isConnected }; });
    if (st.v !== prefix || !st.focused || !st.connected) bad.push(`after “${prefix}”: value=${JSON.stringify(st.v)} focused=${st.focused} connected=${st.connected}`);
  }
  return bad;
}
async function enter(name, sel, text, expectShown) {
  const bad = await typeChars(sel, text);
  await page.keyboard.press('Tab');
  await pause(120);
  const shown = await page.inputValue(sel);
  check(`${name}: typed one key at a time`, bad.length === 0, bad.slice(0, 2).join(' | '));
  if (expectShown !== undefined) check(`${name}: shown as ${JSON.stringify(expectShown)} once left`, shown === expectShown, JSON.stringify(shown));
}

/* ---------------------------------------------------------- a deal by hand */
await page.goto(`${BASE}#deal`, { waitUntil: 'load' });
await page.getByRole('button', { name: 'Enter figures by hand' }).click();
await page.waitForSelector('#fig-price');
await page.fill('#fig-price', '6450000');
await page.press('#fig-price', 'Tab');
await settle();
await page.waitForTimeout(1500);
// a hand deal has no Lease section: put the OM's guarantor on the deal, as a read OM would
await page.evaluate(async () => { const m = await import('./app/store.js'); const [row] = await m.listDeals(); const d = await m.loadDeal(row.id); d.figures.guarantor = 'Example Holdings'; await m.saveDeal(d); });

check('the Credit card offers a record, and a deal has none yet (absent, not "none")', /Zlatura never looks a rating up/.test(await txt('#deal-credit')) && (await credit()) === null);
check('the button is named', (await page.locator('#credit-add').textContent()) === 'Add a credit record');
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#credit-add');
await page.click('#credit-add');
await page.waitForSelector('#credit-entity');
await settle();
let c = await credit();
check('adding a record stores it empty: no scope, no ratings, no sales, no go-dark answer', c && c.v === 1 && c.guarantor.scope === null && c.ratings.length === 0 && c.sales === null && c.goDark.state === null && (await deals())[0].schema === 6, JSON.stringify(c));
check('the OM’s guarantor is offered with a Use tap, never copied in silently', (await txt('#credit-use-om')) === 'Use the OM’s guarantor (Example Holdings)' && (await page.inputValue('#credit-guarantor')) === '' && c.guarantor.name === '');
await page.click('#credit-use-om');
await page.waitForSelector('#credit-guarantor');
await settle();
check('Use copies it in as if typed', (await page.inputValue('#credit-guarantor')) === 'Example Holdings' && (await credit()).guarantor.name === 'Example Holdings' && (await page.locator('#credit-use-om').count()) === 0);

/* ------------------------------------------------ parties, typed key by key */
await enter('the tenant entity', '#credit-entity', 'Example Cafe LLC', 'Example Cafe LLC');
await enter('the guarantor, changed', '#credit-guarantor', 'Sample Holdings Inc', 'Sample Holdings Inc');
await settle();
check('the OM and the record disagree: the check says so', /The OM names the guarantor “Example Holdings”; this record says “Sample Holdings Inc”\./.test(await txt('#credit-checks')));
await page.selectOption('#credit-scope', 'limited');
await page.waitForSelector('#credit-limit');
check('a limited guaranty with no limit: the check says so', /The guaranty is limited, but the limit isn’t written down\./.test(await txt('#credit-checks')));
await enter('the limit', '#credit-limit', '24 months of rent', '24 months of rent');
check('and writing the limit down clears it', !/limit isn’t written down/.test(await txt('#credit-checks')));

/* ----------------------------------------------------------------- ratings */
await page.click('#credit-r-save');
check('a rating cannot be saved without its four parts', /Add the agency, the rating, the as-of date and where it came from\./.test(await txt('#credit-r-gap')) && (await credit()).ratings.length === 0);
await page.selectOption('#credit-r-of', 'parent');
await enter('the rating', '#credit-r-rating', 'bbb-');
await enter('the outlook', '#credit-r-outlook', 'stable');
await enter('the as-of date', '#credit-r-asof', '1/15/24', '01/15/2024');
await enter('the source', '#credit-r-source', 'agency report, invented');
await page.click('#credit-r-save');
await settle();
c = await credit();
const r = c.ratings[0];
check('saved: capitals evened on an exact scale match, typedOn set by the app', c.ratings.length === 1 && r.rating === 'BBB-' && r.agency === 'sp' && r.of === 'parent' && r.asOf === '2024-01-15' && r.typedOn === today && r.source === 'agency report, invented', JSON.stringify(r));
const line = await txt('#deal-credit .credit-rating');
check('the line carries the attribution', line.includes('Typed by the broker on') && line.includes('; not verified by Zlatura.') && line.includes('As of Jan 15, 2024, from: agency report, invented.') && /^S&P BBB-, stable, for \(name not typed\) \(the parent\)\./.test(line), line);
check('and the scale label, as typed', line.includes('Investment grade on the S&P scale, as typed'));
const checks = await txt('#credit-checks');
check('only the parent is rated: the obligor check says it does not stand behind the rent', /Neither the tenant on the lease nor the guarantor is rated, so the rating does not stand behind this rent\./.test(checks));
check('a January 2024 rating is stale', /The S&P rating is as of Jan 15, 2024, more than 12 months ago\. Check it is current\./.test(checks));
// a rating off the scale is kept as typed, with no label
await page.selectOption('#credit-r-of', 'tenant');
await page.selectOption('#credit-r-agency', 'moodys');
await enter('a rating off the scale', '#credit-r-rating', 'BBB-');
await enter('its as-of date', '#credit-r-asof', '1/15/27', '01/15/2027');
await enter('its source', '#credit-r-source', 'typed from a memo');
await page.click('#credit-r-save');
await settle();
c = await credit();
const line2 = await page.locator('#deal-credit .credit-rating').nth(1).textContent();
check('a Moody’s rating of BBB- is not on its scale: kept as typed, no investment-grade label', c.ratings[1].rating === 'BBB-' && /Not a rating on the Moody’s scale; kept as typed, with no investment-grade label\./.test(line2) && !/Investment grade/.test(line2), line2);
check('a rated tenant clears the obligor check', !/does not stand behind this rent/.test(await txt('#credit-checks')));

/* ------------------------------------------- sales, go dark, a long text */
await enter('store sales', '#credit-sales', '1234567.891', '1,234,567.89');
await enter('sales year', '#credit-sales-year', '2025', '2025');
await page.selectOption('#credit-godark', 'yes');
await settle();
check('store sales are stored in whole cents; go dark is yes', (await credit()).sales.annual === 1234567.89 && (await credit()).goDark.state === 'yes');
check('go dark is flagged; with no lease linked there is no rent-over-sales line', /The lease lets the tenant close the store and keep paying rent \(go dark\)\./.test(await txt('#credit-checks')) && !/Rent is/.test(await txt('#credit-checks')));

/* ----------------------------------------------------- the hostile pack */
const ONE = (s) => s.replace(/[\r\n]/g, '').trim().slice(0, 200);
const badPack = [];
for (const [k, v] of Object.entries(PACK)) {
  await page.fill('#credit-parent', v);
  await page.press('#credit-parent', 'Tab');
  await settle();
  const got = (await credit()).parent;
  if (got !== ONE(v)) badPack.push(`${k}: ${JSON.stringify(got.slice(0, 40))}`);
}
check('every hostile text comes back as typed (one line, trimmed, 200 characters at most)', badPack.length === 0, badPack.join(' | '));
check('and none became markup or a script', (await page.locator('#deal-credit img, #deal-credit script').count()) === 0 && (await page.evaluate(() => window.__pwned)) === undefined);
await page.fill('#credit-parent', '');
await page.press('#credit-parent', 'Tab');
await settle();

/* ------------------------------------------------------- reload and Undo */
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#credit-entity');
check('after a reload the parties, ratings and sales are all there', (await page.inputValue('#credit-entity')) === 'Example Cafe LLC' && (await page.locator('#deal-credit .credit-rating').count()) === 2 && (await page.inputValue('#credit-sales')) === '1,234,567.89' && (await page.inputValue('#credit-scope')) === 'limited');
await page.click('button[aria-label="Remove rating 2"]');
await settle();
check('a rating removed is gone from the list and from storage', (await page.locator('#deal-credit .credit-rating').count()) === 1 && (await credit()).ratings.length === 1);
await page.click('#deal-undo');
await settle();
await page.waitForSelector('#credit-entity');
check('Undo brings it back', (await page.locator('#deal-credit .credit-rating').count()) === 2 && (await credit()).ratings.length === 2);

/* --------------------------------------------- backup, wipe and restore */
await page.evaluate(() => { location.hash = '#settings'; });
await page.waitForSelector('#settings-data #backup-make');
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#backup-make')]);
const bfile = `${SHOTS}credit-backup.json`;
await dl.saveAs(bfile);
const bj = JSON.parse(fs.readFileSync(bfile, 'utf8'));
check('the backup carries the credit record, store sales included, at schema 6', bj.deals.length === 1 && bj.deals[0].schema === 6 && bj.deals[0].credit.sales.annual === 1234567.89 && bj.deals[0].credit.ratings.length === 2, JSON.stringify([bj.deals[0].schema]));
const before = await credit();
await page.evaluate(() => new Promise((res) => { localStorage.clear(); const q = indexedDB.deleteDatabase('zlatura'); q.onsuccess = res; q.onerror = res; q.onblocked = res; }));
await page.goto(`${BASE}#settings`, { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#settings-data #backup-file', { state: 'attached' });
await page.setInputFiles('#backup-file', bfile);
await page.waitForSelector('dialog.action-sheet');
await Promise.all([page.waitForEvent('load', { timeout: 30000 }), page.locator('dialog.action-sheet .action-item', { hasText: 'Merge into this device' }).click()]);
check('after a wipe and a restore the credit record is back, field for field', JSON.stringify(await credit()) === JSON.stringify(before), JSON.stringify(await credit()).slice(0, 200));
await page.evaluate(() => { location.hash = '#deal'; });
await page.waitForSelector('#deal-root');
if (await page.locator('#deal-root .list .li').count()) await page.locator('#deal-root .list .li').first().click();
await page.waitForSelector('#credit-entity');
check('and the restored deal shows it', (await page.inputValue('#credit-entity')) === 'Example Cafe LLC');

if (process.env.OLD_BASE) {
  const old = await ctx.newPage();
  await old.goto(`${process.env.OLD_BASE}#settings`, { waitUntil: 'load' });
  await old.waitForSelector('#settings-data #backup-file', { state: 'attached' });
  await old.setInputFiles('#backup-file', bfile);
  await old.waitForTimeout(1500);
  const said = await old.evaluate(() => document.body.innerText);
  check('an older app refuses this version’s backup (“update the app first”), restoring nothing', /saved by a newer version of .*update the app first\. Nothing was restored/.test(said), said.slice(0, 200));
  await old.close();
}

/* ------------------------------------------ axe, at phone and desktop size */
async function axe(name) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document.querySelector('#deal-credit'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  });
  check(`axe: the Credit card, ${name}`, res.length === 0, res.join('\n    '));
}
await page.locator('#deal-credit').scrollIntoViewIfNeeded();
await axe('phone size');
const small = await page.evaluate(() => [...document.querySelectorAll('#deal-credit button, #deal-credit input, #deal-credit select')].filter((e) => { const q = e.getBoundingClientRect(); return q.width && q.height && (q.width < 24 || q.height < 24); }).map((e) => e.id || e.getAttribute('aria-label') || e.textContent));
check('every control on the Credit card is at least 24 px (phone size)', small.length === 0, small.join(', '));
const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check('the card does not push the page sideways at phone size', wide <= 0, `${wide}px`);
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(300);
await axe('desktop size');

await browser.close();
for (const [s, n, x] of R) console.log(s, '|', n, x ? `| ${x}` : '');
finish(R, 'errors', errors);

/* The net lease rent schedule on the deal page, on an iPhone-sized page:
 *   A. one lease, $100,000 then $110,000 a year against a $2,000,000 price: the card shows 5.00% and 5.50%, a 10.00%
 *      change, the NNN footnote (rent over price, not a cap rate) and the options as typed; "Copy rent schedule" puts
 *      tab-separated text on the clipboard; axe, no sideways scroll;
 *   B. two leases with hostile names: a table each, no rent over price, the names stay plain text, and no pasted line
 *      can start a formula. */
import fs from 'fs';
import { createRequire } from 'module';
import { phone, BASE, finish } from './lib.mjs';
import { PACK } from '../fixtures/hostile.js';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const allErrors = [];

const base = JSON.parse(fs.readFileSync(new URL('../fixtures/backup-comp-loader-3.3.0.json', import.meta.url), 'utf8'));
const lease = (id, unit, tenant, periods, o = {}) => ({ id, unit, tenant, sf: 3333, vacant: false, mtm: false, leaseStart: '2026-01-01', rentStart: null, leaseEnd: '2035-12-31', periods, abatements: [], custom: {}, ...o });
const P = (start, end, rate) => ({ start, end, rate, unit: 'year', source: 'documented' });

async function open(label, leases, figures) {
  const b = JSON.parse(JSON.stringify(base));
  const d = b.deals[0];
  d.rr.settings.asOf = '2026-10-10';
  d.rr.leases = leases;
  Object.assign(d.figures, { price: 2000000 }, figures);
  const file = `${F}rentsched-${label}.json`;
  fs.writeFileSync(file, JSON.stringify(b));
  const ctx = await phone({ permissions: ['clipboard-read', 'clipboard-write'] });
  const { page } = ctx;
  page.setDefaultTimeout(8000);    // a missing element fails its check and the flow goes on (the old app has none of this)
  await page.goto(`${BASE}#settings`, { waitUntil: 'load' });
  await page.waitForSelector('#settings-data #backup-file', { state: 'attached' });
  await page.setInputFiles('#backup-file', file);
  await page.waitForSelector('dialog.action-sheet');
  await Promise.all([page.waitForEvent('load', { timeout: 30000 }), page.locator('dialog.action-sheet .action-item', { hasText: 'Merge into this device' }).click()]);
  await page.goto(`${BASE}#deal`, { waitUntil: 'load' });
  await page.waitForSelector('#deal-root');
  if (!(await page.locator('#deal-tiles .tile').count())) await page.locator('#deal-root .list .li').first().click();
  await page.waitForSelector('#deal-tiles .tile');
  await page.waitForTimeout(600);
  allErrors.push(ctx.errors);
  return ctx;
}
const axe = async (page, name, scope) => {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async (sc) => (await window.axe.run(document.querySelector(sc), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length}`), scope);
  check(`axe: ${name}`, v.length === 0, v.join('\n    '));
};
const text = async (page, sel) => ((await page.locator(sel).count()) ? (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim() : '');

// A. one lease
{
  const { browser, page } = await open('a', [lease('la', '100', 'Acme Test Co', [P('2026-01-01', '2030-12-31', 100000), P('2031-01-01', '2035-12-31', 110000)])], { lease_type: 'NNN', options: 'Two 5-year options' });
  const card = await text(page, '#deal-rentsched');
  check('A: the card is there, called Rent schedule', /^Rent schedule/.test(card), card.slice(0, 80));
  check('A: the first period: $100,000.00 a year, $8,333.33 a month, 5.00% of the price', /Years 1–5/.test(card) && /\$100,000\.00/.test(card) && /\$8,333\.33/.test(card) && /5\.00%/.test(card), card);
  check('A: the second period: $110,000.00, 5.50%, +10.00% over the first', /\$110,000\.00/.test(card) && /5\.50%/.test(card) && /\s10\.00%\s/.test(card), card);
  check('A: the column is Rent ÷ price, not Cap rate', /Rent ÷ price/i.test(card) && !/Cap rate \(rent/i.test(card));
  check('A: the NNN footnote says it is not an NOI cap rate', /not an NOI cap rate: the lease type is “NNN”/.test(card), card);
  check('A: the options are footnoted as typed', /Renewal options \(as typed\): Two 5-year options\. Option, not committed\./.test(card));
  check('A: the table has column and row headers', (await page.locator('#deal-rentsched th[scope=col]').count()) >= 6 && (await page.locator('#deal-rentsched th[scope=row]').count()) === 2);
  await page.locator('#deal-rentsched-copy').click();
  await page.waitForTimeout(400);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const lines = clip.split('\n');
  check('A: Copy rent schedule puts tab-separated text on the clipboard', lines[0].split('\t').slice(0, 3).join('|') === 'Period|Years|Annual rent' && lines[1].includes('\t$100,000.00\t') && /Rent over the asking price/.test(clip), JSON.stringify(clip).slice(0, 300));
  await axe(page, 'the rent schedule card', '#deal-rentsched');
  check('A: no sideways scroll on the page', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await browser.close();
}

// B. two leases, hostile names
{
  const leases = [
    lease('lb', PACK.cmd, PACK.img, [P('2026-01-01', '2030-12-31', 100000)]),
    lease('lc', PACK.plus, PACK.script, [P('2026-01-01', '2030-12-31', 50000)]),
  ];
  const { browser, ctx, page } = await open('b', leases, { lease_type: 'NNN' });
  const card = await text(page, '#deal-rentsched');
  check('B: a table for each lease, no Rent ÷ price column', (await page.locator('#deal-rentsched table').count()) === 2 && !/Rent ÷ price/i.test(card.replace(/Rent ÷ price is shown/gi, '')) && /single-tenant deal only/.test(card), card.slice(0, 200));
  check('B: the hostile names stay plain text', (await page.locator('#deal-rentsched img, #deal-rentsched script').count()) === 0 && card.includes(PACK.img), card.slice(0, 160));
  await page.locator('#deal-rentsched-copy').click();
  await page.waitForTimeout(400);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const cells = clip.split('\n').flatMap((l) => l.split('\t'));
  check('B: no pasted cell starts a formula', cells.filter(Boolean).every((c) => !/^[=+@]/.test(c)), cells.filter((c) => /^[=+@]/.test(c)).join(' | '));
  check('B: the neutralised cmd name is still there', clip.includes(`'${PACK.cmd}`), JSON.stringify(clip).slice(0, 200));
  await axe(page, 'two lease tables', '#deal-rentsched');
  await browser.close();
  void ctx;
}

for (const r of R) console.log(r.join(' | '));
finish(R, 'errors', allErrors.flat());
process.exit(R.some((r) => r[0] === 'FAIL') || allErrors.flat().length ? 1 : 0);

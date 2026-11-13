/* A property tax bill, a utility bill and a unit mix are read for what they plainly label (app/factsread.js), in Start from documents and
 * on the Documents card: each figure with its page and line (or sheet and row), shown to be checked and stored nowhere; what the page
 * does not settle is asked, with a button per answer, and the figures are worked out again; a half-year tax bill never doubles the year;
 * a two-month utility bill says it is two months. Layouts: a clean PDF, a table PDF, a workbook, and scans read by OCR on this device.
 * Invented files (tests/facts-fixtures.js; make_facts_scans.py). At phone and desktop size.
 *
 *   node facts-flow.mjs        # BASE=http://localhost:8080/ by default */
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const SIZES = [['phone', {}], ['desktop', { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined }]];
const deals = (page) => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('deals').objectStore('deals').getAll(); g.onsuccess = () => { r.result.close(); res(g.result); }; }; }));

for (const [size, opts] of SIZES) {
  const { browser, page, errors } = await phone(opts);
  page.setDefaultTimeout(60000);
  const requests = []; page.on('request', (r) => requests.push(r.url()));
  const S = (s) => `${size}: ${s}`;
  const item = (name) => page.locator('.uwi-item', { hasText: name }).first();
  const text = async (name) => (await item(name).innerText()).replace(/\s+/g, ' ');
  await page.goto(`${BASE}#underwrite`, { waitUntil: 'load' });
  await page.click('#uw-view-quick');
  await page.waitForSelector('#uw-intake');
  const before = (await deals(page)).length;

  /* ---- text layouts: a clean PDF, a table PDF, a workbook */
  const files = ['tax-clean.pdf', 'tax-table.pdf', 'tax-bill.xlsx', 'tax-halves.pdf', 'util-electric.pdf', 'util-twomonth.pdf', 'util-table.pdf', 'utility-bill.xlsx', 'mix-table.pdf'];
  await page.setInputFiles('#uwi-files', files.map((n) => F + n));
  await page.waitForFunction((n) => document.querySelectorAll('.uwi-item[data-id]').length >= n, files.length, { timeout: 120000 });
  await page.waitForTimeout(500);
  for (const n of ['tax-clean.pdf', 'tax-table.pdf', 'tax-bill.xlsx']) {
    const t = await text(n);
    check(S(`${n}: the year's tax is read once ($9,600.00), the two installments with their due dates, and the parcel and assessed value`), /Total tax for the year: \$9,600\.00/.test(t) && /Installment \((?:1st|First) Half\): \$4,800\.00, due 11\/01\/2025/.test(t) && /Parcel: 14-0207-338/.test(t) && /Assessed value: \$500,000\.00/.test(t) && !/19,200/.test(t), t.slice(0, 500));
    check(S(`${n}: each figure says where it was read`), /(page \d+, line \d+|sheet Tax bill, row \d+)/.test(t) && (await item(n).locator('.uwi-fact-list li').count()) >= 5);
    check(S(`${n}: it is asked what it is, not typed; nothing says it is on a deal`), /Looks like/.test(t) && (await item(n).locator('[data-use]').count()) === 0 && /nothing is stored/.test(t));
  }
  const halves = await text('tax-halves.pdf');
  check(S('installments with no total printed: the year is asked, not added up'), /No total for the year is printed/.test(halves) && !/Total tax for the year/.test(halves), halves.slice(0, 400));
  await item('tax-halves.pdf').locator('[data-ask="annualFromParts"] [data-answer="yes"]').click();
  const halves2 = await text('tax-halves.pdf');
  check(S('answering works it out again: the two installments of $2,400.00 are $4,800.00 for the year, counted once'), /Total tax for the year: \$4,800\.00/.test(halves2) && !/No total for the year is printed/.test(halves2), halves2.slice(0, 400));
  const two = await text('util-twomonth.pdf');
  check(S('a two-month utility bill: the 61-day period, the whole-period charge, and a note that it is not one month'), /Days in the period: 61 days/.test(two) && /Charges for the period: \$4,120\.00/.test(two) && /about 2 months.*not one month/.test(two) && /Usage: 218 CCF/.test(two) && /Water and sewer/.test(two), two.slice(0, 500));
  for (const n of ['util-electric.pdf', 'util-table.pdf', 'utility-bill.xlsx']) {
    const t = await text(n);
    check(S(`${n}: type, service period, charge, usage and its unit`), /Utility: Electric/.test(t) && /Service period from: 02\/03\/2026/.test(t) && /Charges for the period: \$2,310\.45/.test(t) && /Usage: 14,820 kWh/.test(t), t.slice(0, 500));
  }
  const mix = await text('mix-table.pdf');
  check(S('a unit mix: type, count, SF, in-place and market rent per row, with the Total row checked'), /Unit type 1 Bed \/ 1 Bath: 24 units · 650 SF each · in-place \$1,350\.00\/mo · market \$1,425\.00\/mo/.test(mix) && /The 50 units add up to the Total row/.test(mix), mix.slice(0, 600));
  check(S('no deal was made or changed'), (await deals(page)).length === before);
  await page.screenshot({ path: `${SHOTS}facts-${size}.png`, fullPage: true });
  check(S('no horizontal overflow'), await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  const v = await page.evaluate(async () => (await window.axe.run(document.querySelector('#uw-intake'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`));
  check(S('axe: the facts and their questions'), v.length === 0, v.join('\n    '));

  /* ---- a confirmed type keeps the facts; another type hides them */
  await item('tax-clean.pdf').locator('[data-type="taxbill"]').click();
  check(S('named a tax bill, the facts stay, and the use is only to keep it'), (await item('tax-clean.pdf').locator('[data-facts]').count()) === 1 && /Keep as tax bill/.test(await text('tax-clean.pdf')));
  await item('tax-table.pdf').locator('button', { hasText: 'Something else' }).click();
  await page.locator('.action-sheet .action-item', { hasText: 'Insurance' }).click();
  check(S('named something else, the tax facts are not shown'), (await item('tax-table.pdf').locator('[data-facts]').count()) === 0);

  /* ---- scans: read by OCR on this device, then by the same readers */
  await page.setInputFiles('#uwi-files', ['scan-tax-bill.pdf', 'scan-utility-bill.pdf', 'scan-unit-mix.pdf'].map((n) => F + n));
  await page.waitForFunction(() => document.querySelectorAll('.uwi-item[data-id]').length >= 12 && !document.querySelector('.ocr-progress'), null, { timeout: 400000 });
  await page.waitForTimeout(800);
  const st = await text('scan-tax-bill.pdf');
  check(S('a scanned tax bill: read by OCR, marked, with the year, the parcel and the year’s tax, each with its page and line'), /Read by OCR: check figures/.test(st) && /Tax year: 2025 · page 1, line \d+/.test(st) && /Parcel: 14-0207-338/.test(st) && /Total tax for the year: \$9,600\.00/.test(st), st.slice(0, 600));
  const su = await text('scan-utility-bill.pdf');
  check(S('a scanned two-month utility bill: still two months, and the amount for the whole period'), /Service period from: 01\/15\/2026/.test(su) && /Days in the period: 61 days/.test(su) && /Charges for the period: \$4,120\.00/.test(su) && /about 2 months/.test(su), su.slice(0, 600));
  const sm = await text('scan-unit-mix.pdf');
  check(S('a scanned unit mix: the unit rows, read by OCR, marked to be checked'), /Read by OCR: check figures/.test(sm) && /Unit type (Studio|1 Bed)/.test(sm) && /units/.test(sm), sm.slice(0, 700));
  check(S('still no deal made or changed'), (await deals(page)).length === before);
  check(S('every OCR file came from this site, and nothing went to another'), requests.every((u) => u.startsWith(BASE) || /^(data|blob):/.test(u)));

  /* ---- the Documents card */
  await page.goto(`${BASE}#deal`, { waitUntil: 'load' });
  await page.evaluate(async () => { const m = await import('./app/dealui.js'); m.startDealByHand(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__toasts = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('toast')) window.__toasts.push(n.textContent); }).observe(document, { childList: true, subtree: true }); });
  await page.waitForSelector('#dd-toggle');
  if ((await page.getAttribute('#dd-toggle', 'aria-expanded')) === 'false') await page.click('#dd-toggle');
  await page.setInputFiles('#dd-files', [F + 'util-twomonth.pdf']);
  await page.locator('.action-sheet .action-item', { hasText: 'Yes, it is' }).click();
  await page.waitForFunction(() => window.__toasts.some((t) => /Read \d+ figures/.test(t)), null, { timeout: 30000 });
  const said = await page.evaluate(() => window.__toasts.join(' | '));
  check(S('the Documents card says what was read, to be checked'), /Read 6 figures \(utility Water and sewer.*check each against the page/.test(said), said.slice(0, 300));
  await page.waitForTimeout(700);
  const d = (await deals(page)).find((x) => x.dd && x.dd.docs.length);
  check(S('only a record of the file is kept: no tax, utility or unit mix figure is stored on the deal'), d && d.dd.docs.length === 1 && !/9,?600|4,?120|2310|14,?820|\b218\b/.test(JSON.stringify({ ...d, dd: { docs: d.dd.docs.map(({ name, type, sha256, size, pages }) => ({ name, type, sha256, size, pages })) } })), JSON.stringify(d && d.dd.docs).slice(0, 300));
  check(S('no console errors'), errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
}
for (const [st, n, x] of R) console.log(st, '|', n, x ? `| ${x}` : '');
finish(R);

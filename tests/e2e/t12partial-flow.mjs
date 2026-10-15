/* A T-12 of fewer than 12 months in the browser (4.7.10): "Use the T-12's
 * figures" never puts a partial year onto the deal as a year's.
 *   1. the nine-month invented statement (invented-lofts.xlsx, Jan to Sep
 *      2025) on the card: said to be a partial year, its NOI labelled 9 months;
 *   2. "Use the T-12's figures" asks first: keep it partial (nothing changes),
 *      or annualize; annualizing shows each annual figure and Cancel there
 *      changes nothing either;
 *   3. confirmed: the deal holds the annualized figures (× 12 ÷ 9), each
 *      sourced to the T-12 and marked annualized; the card says so; Undo puts
 *      the earlier figures back;
 *   4. a deal that took the nine months as a year's (as before 4.7.10) is
 *      warned in "What doesn't add up";
 *   5. on a phone, the card and the sheet fit the screen.
 * Each check fails on 4.7.9, which put the nine months in as they stood. */
import fs from 'fs';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);

const { browser, page, errors } = await phone({ viewport: { width: 1360, height: 900 }, isMobile: false, hasTouch: false, userAgent: undefined, deviceScaleFactor: 1 });
const text = async (sel) => ((await page.locator(sel).count()) ? (await page.textContent(sel)).replace(/\s+/g, ' ').trim() : '');
const sheetText = () => text('dialog.action-sheet');
const sheetCancel = () => page.locator('dialog.action-sheet .action-cancel').click({ timeout: 3000 }).catch(() => {});
// a choice that isn't offered is a failed check further on, not a crash: the sheet is closed instead
const sheetAction = (label) => page.locator('dialog.action-sheet .action-item', { hasText: label }).first().click({ timeout: 3000 }).then(() => true, async () => { await sheetCancel(); return false; });
const openSheet = async () => { await page.click('#t12-use'); return page.waitForSelector('dialog.action-sheet', { timeout: 3000 }).then(() => true, () => false); };
const dealIdb = (id) => page.evaluate((x) => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('deals').objectStore('deals').get(x); g.onsuccess = () => res(g.result); }; }), id);
const figs = (d) => [d.figures.gross, d.figures.opex, d.figures.taxes, d.figures.noi];
const OWN = { price: 1500000, gross: 150000, opex: 30000, taxes: 17000, noi: 120000 };

// ---- 1. a deal by hand with its own figures, then the nine-month statement
await page.goto(BASE + '#deal', { waitUntil: 'load' });
await page.evaluate(async () => { const m = await import('./app/dealui.js'); m.startDealByHand(); });
await page.waitForSelector('#deal-t12 #t12-import');
const id = await page.evaluate(() => localStorage.getItem('zlatura.deal.current'));
await page.evaluate(async ([x, own]) => { const m = await import('./app/dealui.js'); await m.updateDeal(x, (d) => { Object.assign(d.figures, own); }); }, [id, OWN]);
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#deal-t12 #t12-import');
const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#t12-import')]);
await fc.setFiles(F + 'invented-lofts.xlsx');
await page.waitForFunction(() => (document.querySelector('#deal-t12')?.textContent || '').includes('invented-lofts.xlsx'), null, { timeout: 15000 });
await page.waitForTimeout(500);
const card = await text('#deal-t12');
check('the card says the statement is a partial year, its totals those months', /A partial year: 9 months\. The totals below are those months as read, not a year’s\./.test(card), card.slice(0, 300));
check('the NOI row is labelled with its months', /NOI, 9 months\$84,600/.test(card), card.slice(0, 600));
let d = await dealIdb(id);
check('importing changes none of the deal’s figures', JSON.stringify(figs(d)) === JSON.stringify([OWN.gross, OWN.opex, OWN.taxes, OWN.noi]), JSON.stringify(figs(d)));

// ---- 2. it asks first: keep, or annualize
check('“Use the T-12’s figures” opens a sheet', await openSheet());
let s = await sheetText();
check('the sheet says the T-12 isn’t a full year, and offers to keep it partial or annualize', /This T-12 is 9 months, not a full year/.test(s) && /Keep it as a partial year/.test(s) && /Annualize it, then use the figures/.test(s) && !/Use them/.test(s), s.slice(0, 400));
// the sheet's first, highlighted choice: on 4.7.9 "Use them", which put the nine months in as a year's
const primary = page.locator('dialog.action-sheet .action-item.primary').first();
const primaryLabel = await primary.locator('.action-label').textContent({ timeout: 3000 }).catch(() => '');
await primary.click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(700);
d = await dealIdb(id);
check('the default choice never puts the nine months in as a year’s', JSON.stringify(figs(d)) !== JSON.stringify([108000, 23400, 13500, 84600]), JSON.stringify(figs(d)));
check('it is “Keep it as a partial year”, and keeping it changes nothing on the deal', primaryLabel === 'Keep it as a partial year' && JSON.stringify(figs(d)) === JSON.stringify([OWN.gross, OWN.opex, OWN.taxes, OWN.noi]) && !d.t12?.applied, JSON.stringify([primaryLabel, figs(d), !!d.t12?.applied]));

await openSheet();
await sheetAction('Annualize it, then use the figures');
await page.waitForSelector('dialog.action-sheet .action-title:text("Annualize 9 months to a year and use them?")', { timeout: 3000 }).catch(() => {});
s = await sheetText();
check('annualizing shows each annual figure first (× 12 ÷ 9)', /Annualize 9 months to a year and use them\?/.test(s) && /Gross income \(EGI\): \$150,000 → \$144,000/.test(s) && /Operating expenses: \$30,000 → \$31,200/.test(s) && /Real estate taxes: \$17,000 → \$18,000/.test(s) && /NOI, annualized: \$120,000 → \$112,800/.test(s), s.slice(0, 500));
check('and says what annualizing can get wrong', /seasonal income and costs, one-time items and lease-up are scaled with everything else/.test(s));
await sheetCancel();
await page.waitForTimeout(700);
d = await dealIdb(id);
check('Cancel at the confirmation changes nothing', JSON.stringify(figs(d)) === JSON.stringify([OWN.gross, OWN.opex, OWN.taxes, OWN.noi]) && !d.t12?.applied, JSON.stringify(figs(d)));

// ---- 3. confirmed
await openSheet();
await sheetAction('Annualize it, then use the figures');
await page.waitForTimeout(400);
await sheetAction('Annualize and use them');
await page.waitForTimeout(900);
d = await dealIdb(id);
check('the deal holds the annualized figures', JSON.stringify(figs(d)) === JSON.stringify([144000, 31200, 18000, 112800]), JSON.stringify(figs(d)));
check('each is sourced to the T-12 and marked annualized from 9 months', ['gross', 'opex', 'taxes', 'noi'].every((k) => d.sources[k]?.t12 === true && d.sources[k].annualized === 9 && /annualized × 12 ÷ 9/.test(d.sources[k].line)) && d.t12.applied?.annualized === 9, JSON.stringify(d.sources.noi));
check('the card says the deal uses them annualized, as confirmed', /The deal uses them annualized \(× 12 ÷ 9\), as you confirmed\./.test(await text('#deal-t12')));
check('no partial-year warning once annualized', !/not a full year’s/.test(await text('#deal-checks')), (await text('#deal-checks')).slice(0, 300));
await page.keyboard.press('Control+z');
await page.waitForTimeout(900);
d = await dealIdb(id);
check('Undo puts the deal’s own figures back', JSON.stringify(figs(d)) === JSON.stringify([OWN.gross, OWN.opex, OWN.taxes, OWN.noi]) && !d.t12?.applied, JSON.stringify(figs(d)));

// ---- 4. a deal that took the nine months as a year's, as before 4.7.10
await page.evaluate(async (x) => {
  const m = await import('./app/dealui.js');
  await m.updateDeal(x, (dd) => {
    if (!dd.t12) return;
    const nine = { gross: 108000, opex: 23400, taxes: 13500, noi: 84600 };
    dd.t12.applied = { at: Date.now(), before: { noi: dd.figures.noi, gross: dd.figures.gross, opex: dd.figures.opex, taxes: dd.figures.taxes }, rrOpex: false };
    for (const [k, v] of Object.entries(nine)) { dd.figures[k] = v; dd.sources[k] = { t12: true, hand: false, file: dd.t12.file, line: 'T-12, Jan 2025 to Sep 2025 (9 months)', orig: v }; }
  });
}, id);
await page.reload({ waitUntil: 'load' });
await page.waitForSelector("#deal-t12 #t12-summary", { timeout: 5000 }).catch(() => {});
const checks = await text('#deal-checks');
check('a partial year held as a year’s is warned about, with the months and the way out', /The deal’s NOI, gross income, operating expenses and real estate taxes are the T-12’s 9 months, Jan 2025 to Sep 2025, not a full year’s/.test(checks) && /Use the T-12’s figures again to annualize them, or type the year’s figures\./.test(checks), checks.slice(0, 600));
await page.screenshot({ path: `${SHOTS}t12partial-warning.png` });
await browser.close();

// ---- 5. a phone
const P = await phone();
await P.page.goto(BASE + '#deal', { waitUntil: 'load' });
await P.page.evaluate(async () => { const m = await import('./app/dealui.js'); m.startDealByHand(); });
await P.page.waitForSelector('#deal-t12 #t12-import');
const [pf] = await Promise.all([P.page.waitForEvent('filechooser'), P.page.click('#t12-import')]);
await pf.setFiles(F + 'invented-lofts.xlsx');
await P.page.waitForSelector('#t12-summary');
await P.page.waitForTimeout(500);
const fits = () => P.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
check('phone: the card fits the screen', await fits());
await P.page.click('#t12-use');
await P.page.waitForSelector('dialog.action-sheet');
check('phone: the sheet fits the screen', await fits() && await P.page.evaluate(() => { const r = document.querySelector('dialog.action-sheet').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }));
await P.page.screenshot({ path: `${SHOTS}t12partial-phone.png` });
errors.push(...P.errors);
check('no page errors', !errors.length, errors.slice(0, 3).join(' / '));
fs.writeFileSync(`${SHOTS}t12partial-flow.json`, JSON.stringify(R, null, 1));
for (const r of R) console.log(r.join(' | '));
finish(R, 'errors', errors);
await P.browser.close();
process.exit(R.some((r) => r[0] === 'FAIL') ? 1 : 0);

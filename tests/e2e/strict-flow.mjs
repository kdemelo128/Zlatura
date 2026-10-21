/* The strict review setting in the browser (4.7.39, underwriting U3), at iPhone size:
 *   1. at the default, a T-12 with one open warning (an empty month) can be used: the confirmation opens;
 *   2. Settings → Calculation conventions → "Before figures can be used": strict;
 *   3. now "Use the T-12's figures" says how many checks are still open and opens nothing, and NOI three ways
 *      says "not compared: checks open";
 *   4. once each open check is reviewed (Seen in the T-12 Data QC panel), Use opens the confirmation again.
 * Steps 3 and 4 fail on 4.7.38, which has no such setting. */
import fs from 'fs';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m) => `${m} 2025`);
// rent 1,000 a month; taxes 100 a month, March left empty: one warning (blank months), no failure
fs.writeFileSync(`${F}strict-t12.csv`, `Description,${MONTHS.join(',')}\nINCOME\nBase Rent,${Array(12).fill(1000).join(',')}\nEXPENSES\nReal Estate Taxes,100,100,,100,100,100,100,100,100,100,100,100\n`);

const P = await phone();
const { page, errors } = P;
const text = async (sel) => ((await page.locator(sel).count()) ? (await page.textContent(sel)).replace(/\s+/g, ' ').trim() : '');
const toastText = () => page.evaluate(() => document.querySelector('.toast')?.textContent || '');
const sheetOpen = () => page.waitForSelector('dialog.action-sheet', { timeout: 2500 }).then(() => true, () => false);
const cancel = () => page.locator('dialog.action-sheet .action-cancel').click({ timeout: 2000 }).catch(() => {});
await page.goto(BASE + '#deal', { waitUntil: 'load' });
await page.evaluate(async () => { const m = await import('./app/dealui.js'); m.startDealByHand(); });
await page.waitForSelector('#deal-t12 #t12-import');
const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#t12-import')]);
await fc.setFiles(F + 'strict-t12.csv');
await page.waitForSelector('#t12-summary', { timeout: 10000 });
await page.waitForTimeout(400);

// 1
await page.click('#t12-use');
check('at the default an open warning holds nothing: the confirmation opens', await sheetOpen());
await cancel();

// 2
await page.goto(BASE + '#settings', { waitUntil: 'load' });
await page.waitForSelector('#conv-review-strict');
check('Settings offers "Before figures can be used", failed checks by default', (await page.inputValue('#conv-review-strict')) === 'fails');
await page.selectOption('#conv-review-strict', 'all');
await page.waitForTimeout(300);

// 3
await page.goto(BASE + '#deal', { waitUntil: 'load' });
await page.waitForSelector('#t12-use');
await page.waitForTimeout(400);
await page.click('#t12-use');
const opened = await sheetOpen();
const t = await toastText();
check('strict: Use says how many checks are still open, and opens nothing', !opened && /check(s)? still open: review (it|them) first/.test(t), `${opened} ${t}`);
if (opened) await cancel();
const noi = await text('#t12-noi');
check('strict: NOI three ways says "not compared: checks open"', /not compared: checks open/.test(noi), noi.slice(0, 300));
await page.screenshot({ path: `${SHOTS}strict-held.png` });

// 4
for (let i = 0; i < 10; i++) {
  const b = page.locator('#deal-t12qc button[data-fix="seen"]').first();
  if (!(await b.count())) break;
  await b.click();
  await page.waitForTimeout(350);
}
await page.click('#t12-use');
check('once each check is reviewed, Use opens the confirmation again', await sheetOpen());
await cancel();
check('and NOI three ways compares again', !/not compared: checks open/.test(await text('#t12-noi')));

check('phone: nothing overflows the screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
errors.push(...P.errors);
check('no page errors', !errors.length, errors.slice(0, 3).join(' / '));
fs.writeFileSync(`${SHOTS}strict-flow.json`, JSON.stringify(R, null, 1));
for (const r of R) console.log(r.join(' | '));
finish(R, 'errors', errors);
await P.browser.close();
fs.rmSync(`${F}strict-t12.csv`, { force: true });
process.exit(R.some((r) => r[0] === 'FAIL') ? 1 : 0);

/* Workbooks that used to stop the reader, dropped on "Start from documents" (Underwrite): an invented rent roll with overlapping
 * merged ranges is read (as a rent roll); one with no shared-strings part is refused with a plain reason, not read with position
 * numbers for words.
 *
 *   node sheetrepair-flow.mjs        # BASE=http://localhost:8080/ by default */
import { phone, BASE, finish } from './lib.mjs';

const { browser, page, errors } = await phone();
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
page.setDefaultTimeout(15000);
const F = new URL('./files/', import.meta.url).pathname;
await page.goto(`${BASE}#underwrite`, { waitUntil: 'load' });
await page.click('#uw-view-quick');
await page.waitForSelector('#uw-intake');
await page.setInputFiles('#uwi-files', [F + 'overlapping-merge-rent-roll.xlsx', F + 'no-strings-rent-roll.xlsx']);
await page.waitForFunction(() => ['overlapping-merge-rent-roll.xlsx', 'no-strings-rent-roll.xlsx'].every((n) => document.querySelector('#uw-intake').textContent.includes(n)) && !/Reading…/.test(document.querySelector('#uw-intake').textContent));
const ok = page.locator('.uwi-item', { hasText: 'overlapping-merge-rent-roll.xlsx' }).first();
check('the workbook with overlapping merged ranges is read as a rent roll', (await ok.count()) === 1 && /Rent roll/.test(await ok.textContent()) && (await ok.locator('[data-use]').count()) === 1, (await page.textContent('#uw-intake')).replace(/\s+/g, ' ').slice(0, 300));
const bad = (await page.locator('#uw-intake li', { hasText: 'no-strings-rent-roll.xlsx' }).first().textContent()).replace(/\s+/g, ' ');
check('the one with no shared-strings part is refused with a plain reason', /missing the part that holds its text/.test(bad) && !/ExcelJS/.test(bad), bad.slice(0, 300));
await browser.close();
for (const [st, n, x] of R) console.log(st, '|', n, x ? `| ${x}` : '');
finish(R, 'errors', errors);

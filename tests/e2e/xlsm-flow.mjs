/* A workbook with macros dropped on "Start from documents" (Underwrite): its cell values are read, it says "Macros were not run;
 * values as last saved.", Use records it; a file named .xlsm that is not a workbook is still not read as one. Invented files.
 *
 *   node xlsm-flow.mjs        # BASE=http://localhost:8080/ by default */
import { phone, BASE, finish } from './lib.mjs';

const { browser, page, errors } = await phone();
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
page.setDefaultTimeout(15000);
const F = new URL('./files/', import.meta.url).pathname;
await page.goto(`${BASE}#underwrite`, { waitUntil: 'load' });
await page.click('#uw-view-quick');
await page.waitForSelector('#uw-intake');
await page.setInputFiles('#uwi-files', [F + 'macro-rent-roll.xlsm', F + 'fake-workbook.xlsm']);
await page.waitForFunction(() => ['macro-rent-roll.xlsm', 'fake-workbook.xlsm'].every((n) => document.querySelector('#uw-intake').textContent.includes(n)));
await page.waitForFunction(() => !/Reading…/.test(document.querySelector('#uw-intake').textContent));
const m = page.locator('.uwi-item', { hasText: 'macro-rent-roll.xlsm' }).first();
const mt = (await m.textContent()).replace(/\s+/g, ' ');
check('the macro workbook is read as a rent roll', /Rent roll/.test(mt) && (await m.locator('[data-use]').count()) === 1, mt.slice(0, 300));
check('it says the macros were not run and the values are as last saved', /Macros were not run; values as last saved\./.test(mt), mt.slice(0, 300));
check('it is not refused for having macros', !/never runs macros|has macros\. /.test(await page.textContent('#uw-intake')));
const f = page.locator('#uw-intake li', { hasText: 'fake-workbook.xlsm' }).first();
check('a file that only has the name .xlsm is not read as a workbook', (await f.locator('[data-use]').count()) === 0 && !/Rent roll|T-12/.test(await f.textContent()), (await f.textContent()).slice(0, 200));
await m.locator('[data-use]').click();
await page.waitForFunction(() => /Used/.test(document.querySelector('#uw-intake').textContent), null, { timeout: 15000 });
check('Use records it', /Used/.test(await m.textContent()));
await browser.close();
for (const [st, n, x] of R) console.log(st, '|', n, x ? `| ${x}` : '');
finish(R, 'errors', errors);

/* A zip with one password-protected part, dropped on "Start from documents" (Underwrite): the part that can be read is staged
 * (naming the zip), and the locked one is refused alone, with a plain reason, instead of the whole zip being refused. Invented.
 *
 *   node zipparts-flow.mjs        # BASE=http://localhost:8080/ by default */
import { phone, BASE, finish } from './lib.mjs';

const { browser, page, errors } = await phone();
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
page.setDefaultTimeout(15000);
const F = new URL('./files/', import.meta.url).pathname;
await page.goto(`${BASE}#underwrite`, { waitUntil: 'load' });
await page.click('#uw-view-quick');
await page.waitForSelector('#uw-intake');
await page.setInputFiles('#uwi-files', [F + 'one-locked-part.zip']);
await page.waitForFunction(() => /locked-rent-roll\.csv/.test(document.querySelector('#uw-intake').textContent) && !/Reading…/.test(document.querySelector('#uw-intake').textContent));
const t = (await page.textContent('#uw-intake')).replace(/\s+/g, ' ');
check('the readable part is staged as a rent roll, from the zip', (await page.locator('.uwi-item', { hasText: 'rent-roll.csv' }).filter({ hasNotText: 'locked-rent-roll' }).count()) === 1 && /From one-locked-part\.zip/.test(t), t.slice(0, 300));
check('the locked part is refused alone, with a plain reason', /locked-rent-roll\.csv/.test(t) && /password protected, so it was not opened/i.test(t), t.slice(0, 400));
check('the whole zip is not refused as damaged', !/could not be opened as a zip|may be damaged/.test(t));
await browser.close();
for (const [st, n, x] of R) console.log(st, '|', n, x ? `| ${x}` : '');
finish(R, 'errors', errors);

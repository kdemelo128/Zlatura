/* A Word (.docx) file dropped on "Start from documents" (Underwrite): its table is read as rows by the same readers a CSV uses
 * (an invented rent roll table is typed as a rent roll, from "table 1", with a note that Word has no page numbers), a file of
 * prose only is classified, not read as figures; Use records the table's document; nothing is on a deal before Use.
 *
 *   node docx-flow.mjs        # BASE=http://localhost:8080/ by default */
import { phone, BASE, finish } from './lib.mjs';

const { browser, page, errors } = await phone();
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
page.setDefaultTimeout(15000);
const F = new URL('./files/', import.meta.url).pathname;
const deals = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('deals').objectStore('deals').getAll(); g.onsuccess = () => res(g.result.length); }; }));
await page.goto(`${BASE}#underwrite`, { waitUntil: 'load' });
await page.click('#uw-view-quick');
await page.waitForSelector('#uw-intake');
const before = await deals();
await page.setInputFiles('#uwi-files', [F + 'word-rent-roll.docx', F + 'word-memo.docx']);
await page.waitForFunction(() => document.querySelectorAll('#uw-intake .uwi-item').length >= 2);
const roll = page.locator('.uwi-item', { hasText: 'table 1.csv' }).first();
const rt = (await roll.textContent()).replace(/\s+/g, ' ');
check('the table is read as a rent roll, with its source and the no-page-numbers note', /Rent roll/.test(rt) && /From word-rent-roll\.docx/.test(rt) && /table 1 of 1 in the Word document/.test(rt) && /no page numbers/.test(rt), rt.slice(0, 400));
check('the Word file is not also staged as a second rent roll', (await page.locator('.uwi-item', { hasText: 'word-rent-roll.docx' }).count()) === 1);
const memo = page.locator('.uwi-item', { hasText: 'word-memo.docx' }).first();
const mt = (await memo.textContent()).replace(/\s+/g, ' ');
check('a file of prose is read as text and asked what it is; no Use button', /Text read from the Word document/.test(mt) && (await memo.locator('[data-use]').count()) === 0 && /Something else/.test(mt), mt.slice(0, 300));
check('no refusal saying Word files arrive later', !/arrives? in a later version|\bin a later version/.test(await page.textContent('#uw-intake')));
check('nothing is on a deal before Use', (await deals()) === before);
await roll.locator('[data-use]').click();
await page.waitForFunction(() => /Used/.test(document.querySelector('#uw-intake').textContent), null, { timeout: 15000 });
check('Use records it', /Used/.test(await roll.textContent()));
await browser.close();
for (const [st, n, x] of R) console.log(st, '|', n, x ? `| ${x}` : '');
finish(R, 'errors', errors);

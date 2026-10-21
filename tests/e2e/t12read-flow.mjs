/* The T-12 reading foundation in the browser (4.7.29), at iPhone size:
 *   1. a semicolon CSV with a BOM and decimal commas is read as such: the card says so and the NOI is right;
 *   2. a file whose only evidence is "1.234" is asked about, not guessed;
 *   3. a statement pasted from Excel (tabs) is read, marked Pasted;
 *   4. a workbook with a Budget sheet (more lines), a hidden sheet and two actual sheets: the Budget sheet
 *      is not offered, the broker chooses, the hidden sheet is not read;
 *   5. an empty month cell is said to be empty, not a confirmed $0;
 *   6. a PDF named .xlsx is refused saying what it is;
 *   7. nothing overflows the screen. Each check fails on 4.7.28. */
import fs from 'fs';
import { createRequire } from 'module';
import { phone, BASE, SHOTS, finish } from './lib.mjs';
const ExcelJS = createRequire(import.meta.url)('exceljs');
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);

// Jan-Mar 2026. Semicolon file: rent 1.000,50 x 3 = 3.001,50; taxes 200,25 x 3 = 600,75; NOI 2.400,75.
fs.writeFileSync(`${F}t12read-eu.csv`, '﻿Description;Jan 2026;Feb 2026;Mar 2026\nINCOME\nBase Rent;1.000,50;1.000,50;1.000,50\nEXPENSES\nReal Estate Taxes;200,25;200,25;200,25\n');
// only "1.234": a thousand or a decimal? rent 1.234 x 3, taxes 0.200 stays out of it
fs.writeFileSync(`${F}t12read-ask.csv`, 'Description,Jan 2026,Feb 2026,Mar 2026\nINCOME\nBase Rent,1.234,1.234,1.234\nEXPENSES\nReal Estate Taxes,0,0,0\n');
const ROWS = [['Description', 'Jan 2026', 'Feb 2026', 'Mar 2026'], ['INCOME'], ['Base Rent', 1000, 1000, 1000], ['EXPENSES'], ['Real Estate Taxes', 200, 200, 200]];
const wb = new ExcelJS.Workbook();
const add = (name, rows, state) => { const ws = wb.addWorksheet(name, { state }); rows.forEach((r) => ws.addRow(r)); };
add('Budget 2027', [...ROWS, ['Insurance', 50, 50, 50], ['Repairs and Maintenance', 10, 10, 10], ['Utilities', 5, 5, 5]]);
add('T12 Actual', ROWS);
add('Prior Year', ROWS.map((r, i) => (i === 2 ? ['Base Rent', 900, 900, 900] : r)));
add('Old Draft', ROWS, 'hidden');
await wb.xlsx.writeFile(`${F}t12read-sheets.xlsx`);
// a blank February in the taxes row
fs.writeFileSync(`${F}t12read-blank.csv`, 'Description,Jan 2026,Feb 2026,Mar 2026\nINCOME\nBase Rent,1000,1000,1000\nEXPENSES\nReal Estate Taxes,200,,200\n');
fs.writeFileSync(`${F}t12read-fake.xlsx`, '%PDF-1.4\n% not a workbook\n');

const P = await phone();
const { page, errors } = P;
const text = async (sel) => ((await page.locator(sel).count()) ? (await page.textContent(sel)).replace(/\s+/g, ' ').trim() : '');
const sheetText = () => text('dialog.action-sheet');
const toastText = () => page.evaluate(() => document.querySelector('.toast')?.textContent || '');
const pick = (label) => page.locator('dialog.action-sheet .action-item', { hasText: label }).first().click({ timeout: 4000 }).then(() => true, () => false);
const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const importFile = async (name) => {
  const btn = (await page.locator('#t12-replace').count()) ? '#t12-replace' : '#t12-import';
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(btn)]);
  await fc.setFiles(F + name);
};
await page.goto(BASE + '#deal', { waitUntil: 'load' });
await page.evaluate(async () => { const m = await import('./app/dealui.js'); m.startDealByHand(); });
await page.waitForSelector('#deal-t12 #t12-import');

// 1
await importFile('t12read-eu.csv');
await page.waitForSelector('#t12-summary', { timeout: 10000 }).catch(() => {});
let card = await text('#deal-t12');
check('semicolons and decimal commas: the card says how it was read', /CSV \(semicolons\) · numbers read as 1\.234,56/.test(card), card.slice(0, 300));
check('and the NOI is rent less taxes: $2,401 (2.400,75)', /NOI, 3 months\s*\$2,401/.test(card), card.slice(0, 500));

// 2
await importFile('t12read-ask.csv');
await page.waitForSelector('dialog.action-sheet', { timeout: 5000 }).catch(() => {});
let s = await sheetText();
check('"1.234" alone is asked about, not guessed', /How are numbers written in t12read-ask\.csv\?/.test(s) && /Comma for thousands, point for cents/.test(s) && /Point for thousands, comma for cents/.test(s), s.slice(0, 300));
await pick('Comma for thousands');
await page.waitForFunction(() => /read as CSV/.test(document.querySelector('#deal-t12')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
card = await text('#deal-t12');
check('answering US style reads 1.234 as one and a bit: rent $4 (3 × 1.234)', /Base rent\s*\$4/.test(card) && !/numbers read as 1\.234,56/.test(card), card.slice(0, 400));

// 3
await page.click('#t12-paste-open-replace');
await page.waitForSelector('#t12-paste');
await page.fill('#t12-paste', 'Description\tJan 2026\tFeb 2026\tMar 2026\t\nINCOME\nBase Rent\t1,000\t1,000\t1,000\t\nEXPENSES\nReal Estate Taxes\t200\t200\t200\t');
await page.click('#t12-paste-go');
await page.waitForFunction(() => /Pasted statement/.test(document.querySelector('#deal-t12')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
card = await text('#deal-t12');
check('a pasted statement is read and marked Pasted', /Pasted statement · pasted/.test(card) && /NOI, 3 months\s*\$2,400/.test(card), card.slice(0, 300));

// 4
await importFile('t12read-sheets.xlsx');
await page.waitForSelector('dialog.action-sheet', { timeout: 6000 }).catch(() => {});
s = await sheetText();
check('two actual sheets: the broker chooses; the Budget sheet is not offered; the hidden sheet is only listed', /Which sheet of t12read-sheets\.xlsx is the T-12\?/.test(s) && /T12 ActualT-3/.test(s) && /Prior YearT-3/.test(s) && /Budget 2027projection, not actuals/.test(s) && /Old Draft.*hidden sheet/.test(s), s.slice(0, 500));
await page.screenshot({ path: `${SHOTS}t12read-sheets.png` });
await pick('Prior Year');
await page.waitForFunction(() => /Prior Year/.test(document.querySelector('#deal-t12')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
card = await text('#deal-t12');
check('the chosen sheet is the one read (rent 3 × 900 = $2,700)', /Prior Year/.test(card) && /Base rent\s*\$2,700/.test(card), card.slice(0, 300));

// 5
await importFile('t12read-blank.csv');
await page.waitForSelector('#t12-summary', { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(400);
await page.click('#t12-review').catch(() => {});
await page.waitForTimeout(800);
const rv = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
check('and is a thing to check in Review', /(blank|empty)/i.test(rv) && /Real Estate Taxes/.test(rv), rv.slice(0, 200));
await page.goto(BASE + '#deal', { waitUntil: 'load' });
await page.waitForSelector('#deal-t12 #t12-replace');

// 6
await importFile('t12read-fake.xlsx');
await page.waitForTimeout(500);
const bad = await toastText();
check('a PDF named .xlsx is refused, saying it is a PDF', /is really a PDF, whatever its name says/.test(bad), bad);

check('phone: nothing overflows the screen', await fits());
errors.push(...P.errors);
check('no page errors', !errors.length, errors.slice(0, 3).join(' / '));
fs.writeFileSync(`${SHOTS}t12read-flow.json`, JSON.stringify(R, null, 1));
for (const r of R) console.log(r.join(' | '));
finish(R, 'errors', errors);
await P.browser.close();
// the invented files are made fresh each run; the fake workbook must not be left for the LibreOffice recalculation
for (const f of fs.readdirSync(F).filter((x) => x.startsWith('t12read-'))) fs.rmSync(F + f);
process.exit(R.some((r) => r[0] === 'FAIL') ? 1 : 0);

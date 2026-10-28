/* A filled template shows no stale figure: formulas that read filled cells have no stored result (so a phone
 * preview cannot show the blank template's figures), the grid says "calculated when opened in Excel" for them,
 * and a formula that reads nothing filled keeps its figure. run.sh then recalculates the filled workbook in
 * LibreOffice and compares every stored value. */
import { phone, BASE, finish } from './lib.mjs';
const F = new URL('./files/', import.meta.url).pathname;
const { browser, page, errors } = await phone();
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const sheetItem = (t) => page.locator('.action-sheet .action-item', { hasText: t }).first().click();
const upload = async (file) => {
  const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#sheet-foot button', { hasText: 'Upload a template' }).click()]);
  await ch.setFiles(F + file);
};
const cell = (ref) => page.locator(`#sheet-body .tpl-cell[aria-label^="${ref},"]`);
await page.goto(BASE + '#deal', { waitUntil: 'load' });
await page.setInputFiles('#om-file', F + 'om-retail.pdf');
await page.waitForSelector('#deal-tiles .tile');
await page.click('#deal-root .view-head button[aria-label="More deal actions"]');
await sheetItem('Fill my Excel template');
await page.waitForSelector('#sheet-foot button:has-text("Upload a template")');
await upload('uw-cached.xlsx');
await page.waitForSelector('#sheet-body .tpl-grid');
check('the blank template shows its own stored cap rate', (await cell('B7').textContent()).trim() === '0.05', await cell('B7').textContent());
await page.locator('#sheet-foot button', { hasText: 'Save mapping' }).click();
await page.waitForTimeout(400);
await page.click('#deal-root .view-head button[aria-label="More deal actions"]');
await sheetItem('Fill my Excel template');
await page.waitForSelector('#sheet-body .li');
await page.locator('#sheet-body .li button', { hasText: 'Fill' }).first().click();
await page.waitForSelector('#sheet-body table.tpl-preview');
const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#sheet-foot button', { hasText: 'Fill and download' }).click()]);
await dl.saveAs(F + 'out-uw-cached.xlsx');
// open the filled file as a template, to see the cells as a preview would
await page.click('#deal-root .view-head button[aria-label="More deal actions"]');
await sheetItem('Fill my Excel template');
await page.waitForSelector('#sheet-foot button:has-text("Upload a template")');
await upload('out-uw-cached.xlsx');
await page.waitForSelector('#sheet-body .tpl-grid');
const b7 = cell('B7');
check('the cap rate formula shows no old figure', !/0\.05/.test(await b7.textContent()), await b7.textContent());
check('it says it is calculated when opened in Excel', /calculated when opened in Excel/.test((await b7.getAttribute('aria-label')) || '') && /calc in Excel/.test(await b7.textContent()), `${await b7.getAttribute('aria-label')} | ${await b7.textContent()}`);
check('a formula that reads nothing filled keeps its figure', (await cell('B11').textContent()).trim() === '100', await cell('B11').textContent());
check('no console errors', errors.length === 0, errors.join(' / '));
for (const [s, n, d] of R) console.log(s, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errors);
await browser.close();

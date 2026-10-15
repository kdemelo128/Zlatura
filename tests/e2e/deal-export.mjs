/* deal-export: the deal workbook, the printed deal brief and the comp workbook
 * carrying the deal tab, all from one OM and one CoStar export. run.sh then
 * recalculates both workbooks in LibreOffice. */
import { phone, BASE, SHOTS, finish } from './lib.mjs';
const F = new URL('./files/', import.meta.url).pathname;
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
const { browser, page, errors } = await phone();
await page.goto(BASE + '#comps', { waitUntil: 'load' });
await page.setInputFiles('#file', F + 'costar-comps.pdf');
await page.waitForFunction(() => document.querySelectorAll('#sales-table tbody tr').length > 0);
await page.click('.tab[data-view="deal"] >> visible=true');
await page.setInputFiles('#om-file', F + (process.argv[2] || 'om-retail.pdf'));
await page.waitForSelector('#deal-tiles .tile');
await page.waitForTimeout(800);
const vs = await page.$$eval('#deal-comps .tile', (t) => t.map((x) => x.innerText.replace(/\n/g, ' | ')));
console.log('vs comps', vs);
check('the deal is set against the comps', vs.length > 0 && vs.some((t) => t.startsWith('Asking vs comps')), vs[0] || '');
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#deal-root .view-head .btn-primary')]);
await dl.saveAs(F + 'out-deal.xlsx'); console.log('deal xlsx', dl.suggestedFilename());
check('the deal workbook downloads as .xlsx', /^Deal - .+\.xlsx$/.test(dl.suggestedFilename()), dl.suggestedFilename());
// summary text via copy
await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
// brief
await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
await page.evaluate(() => [...document.querySelectorAll('#deal-root button')].find((b) => b.textContent.includes('Deal brief')).click());
await page.waitForTimeout(800);
const printed = await page.evaluate(() => window.__printed);
const brief = await page.locator('#print-sheet').innerText();
console.log('printed', printed);
console.log('BRIEF:\n' + brief.slice(0, 3000));
check('Deal brief opens the print dialog', printed === true, String(printed));
check('the brief carries the deal (address, NOI, comps)', brief.includes('4410 Example Avenue NW') && brief.includes('$393,450') && brief.includes('Against 3 sale comps'), brief.slice(0, 60));
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: F + 'out-brief.pdf', format: 'Letter' }).catch((e) => console.log('pdf', e.message));
// the comp workbook carrying the deal tab
await page.emulateMedia({ media: 'screen' });
await page.click('.tab[data-view="comps"] >> visible=true');
const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#download')]);
await dl2.saveAs(F + 'out-comps-deal.xlsx');
check('the comp workbook downloads as .xlsx', /\.xlsx$/.test(dl2.suggestedFilename()), dl2.suggestedFilename());
check('no console errors', errors.length === 0, errors.join(' / '));
for (const [st, n, d] of R) console.log(st, '|', n, d ? `| ${d}` : '');
finish(R, 'errors', errors);
await browser.close();

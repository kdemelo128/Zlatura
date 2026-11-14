/* Reader gaps 3, in a browser at phone and desktop size, in "Start from documents": a unit mix workbook is staged as "looks like a unit
 * mix" (its figures read for checking), never as a rent roll; a lease comparable table is asked, with no Use; a rent schedule by month
 * is asked, not read as a T-12; an appraisal with a titled rent roll page is asked, its roll page offered apart; a PDF with a short cover
 * page has no OCR button while one holding only a page number does. Nothing is on a deal before Use. Invented files only.
 *
 *   node reader-gaps-flow.mjs        # BASE=http://localhost:8080/ by default */
import { createRequire } from 'module';
import ExcelJS from 'exceljs';
import { phone, finish, BASE } from './lib.mjs';
import { pdfOf } from '../rr-fixtures.js';
import { rollPage, prose } from '../tools/routepdfs.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const { browser, page, errors } = await phone();
const R = []; const check = (n, c, d = '') => R.push([c ? 'PASS' : 'FAIL', n, d]);
page.setDefaultTimeout(10000);
const deals = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('zlatura'); r.onsuccess = () => { const g = r.result.transaction('deals').objectStore('deals').getAll(); g.onsuccess = () => { r.result.close(); res(g.result); }; }; }));
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const xlsx = async (name, rows) => { const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Sheet1'); rows.forEach((r) => ws.addRow(r)); return { name, mimeType: XLSX, buffer: Buffer.from(await wb.xlsx.writeBuffer()) }; };
const pdf = (name, pages) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(pdfOf(pages)) });
const MO = ['Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026', 'Nov 2026', 'Dec 2026'];
const mix = await xlsx('invented-unit-mix.xlsx', [['Unit Type', '# Units', 'Avg SF', 'Avg Rent', 'Market Rent'], ['Studio', 10, 450, 1100, 1200], ['1 Bed / 1 Bath', 24, 650, 1350, 1425], ['2 Bed / 2 Bath', 16, 900, 1700, 1800]]);
const comps = await xlsx('invented-lease-comps.xlsx', [['Tenant', 'Property', 'Address', 'Size (SF)', 'Rate/SF', 'Term (months)', 'Commencement', 'Lease Type'], ['Alder Foods', 'Sample Plaza', '1 Invented Way', 2400, 28.5, 60, '2025-03-01', 'NNN'], ['Birch Dental', 'Example Center', '9 Sample Rd', 1800, 31, 84, '2025-06-01', 'Modified Gross'], ['Cedar Fitness', 'Test Commons', '5 Fake St', 5200, 22, 120, '2024-11-01', 'NNN']]);
const sched = await xlsx('invented-rent-schedule.xlsx', [['Suite', 'Tenant', ...MO], ['101', 'Alder Foods', ...MO.map(() => 5700)], ['102', 'Birch Dental', ...MO.map(() => 4650)], ['103', 'Cedar Fitness', ...MO.map(() => 9500)]]);
const filler = (n) => Array.from({ length: n }, (_, i) => `Invented appraisal narrative sentence ${i + 1}, written only for a test.`);
const appraisal = pdf('invented-appraisal.pdf', [prose(['Appraisal Report', 'Uniform Standards of Professional Appraisal Practice (USPAP)', 'Market value as of 10/01/2026', 'Highest and best use is the existing use. Sales comparison approach and income capitalization approach were developed.', ...filler(10)]), rollPage()]);
const cover = prose(['Sample Plaza Cover Page', 'Prepared for Invented Buyer LLC', 'Confidential, invented for a test'], { y: 700, size: 18 });
const coverPdf = pdf('invented-cover.pdf', [cover, cover]);
const stampPdf = pdf('invented-stamp.pdf', [prose(['Page 1 of 1'], { y: 20, size: 6 })]);

async function axe(name) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document.querySelector('#uw-intake'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  });
  check(`axe: the card, ${name}`, res.length === 0, res.join('\n    '));
}
const items = () => page.$$eval('.uwi-item', (ls) => ls.map((l) => ({ id: l.dataset.id, text: l.textContent })));
const clear = async () => { await page.getByRole('button', { name: 'Clear the document list' }).click(); await page.waitForFunction(() => document.querySelectorAll('.uwi-item').length === 0); };
const stage = async (files, n) => { await page.setInputFiles('#uwi-files', files); await page.waitForFunction((k) => document.querySelectorAll('.uwi-item').length >= k, n).catch(() => {}); };

await page.goto(`${BASE}#underwrite`, { waitUntil: 'load' });
await page.click('#uw-view-quick');
await page.waitForSelector('#uw-intake');
const before = (await deals()).length;

for (const [size, vp] of [['phone size', { width: 390, height: 844 }], ['desktop size', { width: 1280, height: 900 }]]) {
  await page.setViewportSize(vp);
  await stage([mix], 1);
  let its = await items();
  check(`${size}: a unit mix workbook looks like a unit mix, with its figures read for checking, and is not a rent roll`, its.length === 1 && /Looks like · Its text reads like a unit mix/.test(its[0].text) && !/^Rent roll/.test(its[0].text), its.map((x) => x.text.slice(0, 160)).join(' | '));
  check(`${size}: the unit mix has no Use as rent roll`, (await page.locator('.uwi-item [data-use]').count()) === 0 && (await page.getByRole('button', { name: /Use as rent roll/ }).count()) === 0);
  check(`${size}: the unit mix reader's figures are shown`, /Read from it/.test(its[0].text) && /Studio/.test(its[0].text));
  await axe(`${size}, unit mix`);
  await clear();

  await stage([comps], 1);
  its = await items();
  check(`${size}: a lease comparable table is asked, with the reason and no Use`, its.length === 1 && /What is this/.test(its[0].text) && /lease comparables/.test(its[0].text) && /no importer for lease comparables/.test(its[0].text) && (await page.locator('.uwi-item [data-use]').count()) === 0, its.map((x) => x.text.slice(0, 200)).join(' | '));
  await axe(`${size}, lease comps`);
  await clear();

  await stage([sched], 1);
  its = await items();
  check(`${size}: a rent schedule by month is asked, is not a T-12, and has no Use`, its.length === 1 && /What is this/.test(its[0].text) && /rent schedule by month/.test(its[0].text) && !/T-12 operating statement/.test(its[0].text.slice(0, 40)) && (await page.locator('.uwi-item [data-use]').count()) === 0, its.map((x) => x.text.slice(0, 200)).join(' | '));
  await clear();

  await stage([appraisal], 2);
  its = await items();
  const whole = its.find((x) => /What is this/.test(x.text)); const roll = its.find((x) => /^Rent roll/.test(x.text));
  check(`${size}: an appraisal with a titled rent roll page is asked, and its page 2 is offered apart`, its.length === 2 && !!whole && !!roll && /appraisal/.test(whole.text) && /Page 2 read as rent roll/.test(roll.text), its.map((x) => x.text.slice(0, 160)).join(' | '));
  check(`${size}: only the roll page has a Use`, (await page.locator('.uwi-item [data-use]').count()) === 1);
  await axe(`${size}, appraisal`);
  check(`${size}: nothing is on a deal before Use`, (await deals()).length === before);
  await clear();

  await stage([coverPdf], 1);
  its = await items();
  check(`${size}: a PDF with a short cover page has no OCR button`, its.length === 1 && (await page.locator('[data-ocr]').count()) === 0 && !/no text layer/i.test(its[0].text), its.map((x) => x.text.slice(0, 200)).join(' | '));
  await clear();
  await stage([stampPdf], 1);
  its = await items();
  check(`${size}: a PDF holding only a page number is still a scan, with its OCR button`, its.length === 1 && (await page.locator('[data-ocr]').count()) === 1 && /no text layer/i.test(its[0].text), its.map((x) => x.text.slice(0, 200)).join(' | '));
  await clear();
}
check('no sideways scroll at 1280 px', (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);

await browser.close();
for (const [st, n, x] of R) console.log(st, '|', n, x ? `| ${x}` : '');
finish(R, 'errors', errors);

/* Invented tax bill, utility bill and unit mix files for the browser flow (facts-flow.mjs), in four layouts: a clean PDF (labelled
 * lines), a table PDF (words left, figures right), a workbook, and a scan (the page items are written to facts-pages.json and
 * drawn as pictures by tests/e2e/make_facts_scans.py). Run by hand:  node tests/tools/factsfiles.mjs <dir> */
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { pdfOf } from '../rr-fixtures.js';
import { TAX, UTIL, MIX, pairsPage, gridPage } from '../facts-fixtures.js';

/** Labelled text lines as positioned items on one page. */
export const linesPage = (text, { size = 9, x = 50, y0 = 740, step = 14 } = {}) => text.split('\n').map((s, i) => ({ x, y: y0 - i * step, s, size, bold: i === 0 }));

/** Plain text at the foot of a page, as a real document has: a page of a few labelled figures alone reads as a scan (under 200 characters). */
export const footer = (y = 120) => ['This statement is provided for your information. Questions about it may be sent to the office named above', 'during business hours. Please keep this copy with your records. Figures are as of the date shown on it.'].map((s, i) => ({ x: 50, y: y - i * 12, s, size: 8 }));
const withFooter = (items) => [...items, ...footer()];
export const PAGES = {
  'tax-clean': [linesPage(TAX.clean[0])],
  'tax-table': [withFooter(pairsPage('Real Estate Tax Bill', TAX.tablePairs))],
  'tax-halves': [withFooter(linesPage(TAX.noTotal[0]))],
  'util-electric': [linesPage(UTIL.electric[0])],
  'util-twomonth': [withFooter(linesPage(UTIL.twoMonth[0]))],
  'util-table': [withFooter(pairsPage('Electric Service Statement', UTIL.electricPairs))],
  'mix-table': [withFooter(gridPage('Unit Mix', MIX.header, [...MIX.rows, MIX.total]))],
};
/** The same pages for the scans: a bigger type, so the picture reads cleanly. */
export const SCAN_PAGES = {
  'scan-tax-bill': [withFooter(linesPage(TAX.clean[0], { size: 11, y0: 730, step: 18 }))],
  'scan-utility-bill': [withFooter(linesPage(UTIL.twoMonth[0], { size: 11, y0: 730, step: 18 }))],
  'scan-unit-mix': [withFooter(gridPage('Unit Mix', MIX.header, [...MIX.rows, MIX.total], { size: 10, step: 20 }))],
};

async function sheet(path, name, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(name);
  for (const r of rows) ws.addRow(r);
  await wb.xlsx.writeFile(path);
}

if (process.argv[1] && process.argv[1].endsWith('factsfiles.mjs') && process.argv[2]) {
  const d = process.argv[2];
  for (const [name, pages] of Object.entries(PAGES)) fs.writeFileSync(`${d}/${name}.pdf`, pdfOf(pages));
  fs.writeFileSync(`${d}/facts-pages.json`, JSON.stringify(SCAN_PAGES));
  await sheet(`${d}/tax-bill.xlsx`, 'Tax bill', TAX.grids[0].rows.map((r) => r.cells));
  await sheet(`${d}/utility-bill.xlsx`, 'Utility', UTIL.grids[0].rows.map((r) => r.cells));
  await sheet(`${d}/unit-mix.xlsx`, 'Unit mix', [['Unit Mix'], MIX.header, ...MIX.rows, MIX.total]);
  console.log('ok');
}

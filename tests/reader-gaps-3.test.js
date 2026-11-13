/* Reader gaps 3: four routing gaps found in the routing review, each tested on invented files only.
 * 1 unit mix and lease comp tables are not rent rolls; 2 a month-by-month rent schedule is not a T-12; 3 an appraisal or a
 * broker opinion of value with a titled rent roll page is asked (its roll pages offered apart); 4 a page of 50-199
 * characters is a scan only when it is not a table and not real short text. */
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';
import { pdfOf } from './rr-fixtures.js';
import { prose, rollPage, narrative } from './tools/routepdfs.mjs';

globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const { intake } = await import('../app/ddintake.js');
const I = await import('../app/intake.js');
const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
const { pdfPages } = await import('../app/pdftext.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;

const readPdf = async (bytes) => { const layouts = []; const pages = await pdfPages(pdfjs, new Uint8Array(bytes), { layouts, verbosity: 0 }); return { pages, layouts }; };
const deps = { getFflate: async () => fflate, getXlsx: async () => ({ ExcelJS, fflate }), readPdf };
const file = (bytes, name) => new File([bytes], name);
const verdictOf = async (bytes, name) => (await intake(file(bytes, name), deps)).verdict;
const stageOf = async (bytes, name) => { const p = I.newPlan(); await I.stageFiles(p, [file(bytes, name)], deps); return p; };
const book = async (rows, name = 'Sheet1') => { const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(name); rows.forEach((r) => ws.addRow(r)); return Buffer.from(await wb.xlsx.writeBuffer()); };

/* ---- 4: a scan is a page with no real text, not any page with few characters */

const { realShortText, pageNeedsOcr, pagesAreScan } = await import('../app/textlayer.js');
const COVER = ['Sample Plaza Cover Page', 'Prepared for Invented Buyer LLC', 'Confidential, invented for a test'];
const SHORT_TABLE = ['Suite   Tenant   SF   Rent', '101   Alder Foods   2,400   5,700', '102   Birch Dental   1,800   4,650'];

test('gap 4: a cover page of real words, or a short table, is text; a stamp alone is a scan', async () => {
  assert.equal(pageNeedsOcr(COVER.join('\n')), false);
  assert.equal(pageNeedsOcr(SHORT_TABLE.join('\n')), false);
  assert.equal(realShortText(SHORT_TABLE.join('\n')), true);
  // a table with few words is still a table (two rows with a word and two figures)
  assert.equal(pageNeedsOcr('Unit SF Rent\nStudio 450 1,100\nLoft 650 1,350'), false);
  assert.equal(pageNeedsOcr('Studio 450\nLoft'), true);
  // what a scanner leaves in a text layer: a page number, a stamp, a stray mark
  assert.equal(pageNeedsOcr('Page 1 of 3\nScanned by CamScanner'), true);
  assert.equal(pageNeedsOcr(''), true);
  assert.equal(pageNeedsOcr('Page 2 of 3\n12\n'), true);
  // one line of words, or two words, is not enough to call real text
  assert.equal(pageNeedsOcr('Sample Plaza'), true);
  // 200 characters or more is a text page as before
  assert.equal(pageNeedsOcr('word '.repeat(60)), false);
  assert.equal(pagesAreScan([]), false);
  assert.equal(pagesAreScan(['Page 1 of 2', 'Page 2 of 2']), true);
});

test('gap 4: a PDF with a short cover page or a short table is not asked for OCR; a stamp-only PDF still is', async () => {
  const cover = prose(COVER, { y: 700, size: 18 });
  const v = await verdictOf(pdfOf([cover, cover]), 'a.pdf');
  assert.equal(v.scanned, false, 'real short text stays text');
  const table = await verdictOf(pdfOf([prose(SHORT_TABLE, { y: 700, size: 9 })]), 'b.pdf');
  assert.equal(table.scanned, false);
  const stamp = await verdictOf(pdfOf([prose(['Page 1 of 2', 'Scanned by CamScanner'], { y: 20, size: 6 }), prose(['Page 2 of 2'], { y: 20, size: 6 })]), 'c.pdf');
  assert.equal(stamp.scanned, true);
  const p = await stageOf(pdfOf([cover]), 'a.pdf');
  assert.equal(p.items[0].scanned, false, 'no OCR button for it');
});

test('gap 4: the OCR gate and the lease reader use the same rule', async () => {
  const { hasNoTextLayer } = await import('../app/ocrpdf.js');
  const { needsOcr } = await import('../app/leaseread.js');
  assert.equal(hasNoTextLayer([COVER.join('\n')]), false);
  assert.equal(hasNoTextLayer(['Page 1 of 1']), true);
  assert.equal(needsOcr(COVER.join('\n')), false);
  assert.equal(needsOcr('Page 1 of 1'), true);
});

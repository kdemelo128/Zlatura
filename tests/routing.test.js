/* Routing in Start from documents: which reader a file goes to, and what is offered apart from it. A file whose text names one
 * type that has a reader, and whose content that reader accepts, shows that reader's preview instead of a question; a workbook
 * with a rent roll on one sheet and a statement on another is staged as two uses, each on its own sheet (a hidden sheet only when
 * no visible one reads as that kind); an OM that also holds rent roll pages is staged with those pages offered apart, by page
 * range; a document titled as an operating statement keeps the statement route. Nothing is typed from words alone. Invented files. */
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';
import { pdfOf } from './rr-fixtures.js';
import { prose, omPage, rollPage, statementPage, narrative } from './tools/routepdfs.mjs';
import { docxFile } from './tools/docpdfs.mjs';

globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const { intake } = await import('../app/ddintake.js');
const I = await import('../app/intake.js');
const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
const { pdfPages } = await import('../app/pdftext.js');
const { expandDocx } = await import('../app/docxread.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;

const readPdf = async (bytes) => { const layouts = []; const pages = await pdfPages(pdfjs, new Uint8Array(bytes), { layouts, verbosity: 0 }); return { pages, layouts }; };
const deps = { getFflate: async () => fflate, getXlsx: async () => ({ ExcelJS, fflate }), readPdf };
const file = (bytes, name) => new File([bytes], name);
const verdictOf = async (bytes, name) => (await intake(file(bytes, name), deps)).verdict;
const stageOf = async (bytes, name) => { const p = I.newPlan(); await I.stageFiles(p, [file(bytes, name)], deps); return p; };

/* ---- one candidate, or a title late in the file (cases 1, 4 and 5) */

test('a rent roll table with no title and one candidate type is read, not asked', async () => {
  const v = await verdictOf(pdfOf([rollPage({ title: false, plain: true }), narrative('Property notes')]), 'a.pdf');
  assert.equal(v.type, 'rentroll');
  assert.equal(v.reader, 'rrpdf');
  assert.equal(v.typeBy, 'reader');
  assert.match(v.route, /rent roll table of \d+ rows/);
  const p = await stageOf(pdfOf([rollPage({ title: false, plain: true }), narrative('Property notes')]), 'a.pdf');
  assert.equal(p.items[0].type, 'rentroll');
  assert.equal(p.items[0].confidence, 'Read');
  assert.equal(I.readyItems(p, null).length, 1);
  assert.equal(p.items[0].state, 'staged', 'nothing is used until the broker taps Use');
});

test('one candidate with no reader finding anything stays a question', async () => {
  const v = await verdictOf(pdfOf([narrative('Invented memo', 'A note about the rent roll to follow.')]), 'a.pdf');
  assert.equal(v.type, null);
  assert.deepEqual(v.ask, ['rentroll']);
});

test('a title late in the file: the titled type is used when its reader accepts the content, else it is asked', async () => {
  const roll = await verdictOf(pdfOf([rollPage({ title: false }), narrative('Page two'), narrative('This is the rent roll for the invented plaza.')]), 'a.pdf');
  assert.equal(roll.type, 'rentroll'); assert.equal(roll.reader, 'rrpdf');
  const stmt = await verdictOf(pdfOf([narrative('Invented plaza'), statementPage('Monthly figures - Actuals 2025'), narrative('Operating statement notes, trailing twelve months, invented.')]), 'a.pdf');
  assert.equal(stmt.type, 't12'); assert.equal(stmt.reader, 't12pdf');
  // the same words with a table the reader does not accept (two rows) stay asked
  const thin = rollPage({ title: false }).filter((it) => it.y > 664 || it.y < 600);
  const v = await verdictOf(pdfOf([thin, narrative('Page two'), narrative('This is the rent roll for the invented plaza.')]), 'a.pdf');
  assert.equal(v.type, null);
  assert.ok(v.ask.includes('rentroll'));
});

test('words alone never type a file: a rent roll title over prose is asked', async () => {
  const v = await verdictOf(pdfOf([narrative('Rent Roll', 'Suite Tenant SF Monthly Rent Lease End lease start base rent'), narrative('more')]), 'a.pdf');
  assert.equal(v.type, null);
});

test('a Word file whose text holds a rent roll is read by the same rules as a PDF', async () => {
  const paras = ['Invented Plaza, prepared for review', 'Suite   Occupant   SF   Monthly Rent   Lease End', '101   Invented Co   1,000   $2,400.00   12/31/2028', '102   Sample LLC   1,200   $2,900.00   06/30/2027', '103   Example Shop   900   $2,100.00   01/31/2026', '104   Placeholder Inc   1,500   $3,300.00   04/30/2029', 'All figures are invented for a test and are not real.'];
  const f = file(docxFile(paras), 'notes.docx');
  const info = await intake(f, deps);
  const out = await expandDocx([{ file: f, info }], deps);
  const text = out.find((x) => x.info.kind === 'docx');
  assert.equal(text.info.verdict.type, 'rentroll');
  assert.equal(text.info.verdict.reader, 'rrpdf');
});


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

/* ---- a workbook with a rent roll on one sheet and a statement on another (case 2) */

const M = ['Jan 2025', 'Feb 2025', 'Mar 2025', 'Apr 2025', 'May 2025', 'Jun 2025'];
const addRoll = (wb, name, state) => { const ws = wb.addWorksheet(name, { state }); ws.addRow(['Unit', 'Tenant', 'SF', 'Monthly Rent', 'Lease End']); ws.addRow(['101', 'Invented Co', 1000, 2400, '2028-01-31']); ws.addRow(['102', 'Sample LLC', 1200, 2900, '2027-06-30']); ws.addRow(['103', 'Vacant', 900, 0, '']); };
const addT12 = (wb, name, state) => { const ws = wb.addWorksheet(name, { state }); ws.addRow(['Operating Statement']); ws.addRow(['Line', ...M, 'Total']); ws.addRow(['Rental income', ...M.map(() => 10000), 60000]); ws.addRow(['Other income', ...M.map(() => 500), 3000]); ws.addRow(['Real estate taxes', ...M.map(() => 1500), 9000]); ws.addRow(['Insurance', ...M.map(() => 400), 2400]); ws.addRow(['Net operating income', ...M.map(() => 8600), 51600]); };
const addJunk = (wb, name, state) => { const ws = wb.addWorksheet(name, { state }); ws.addRow(['Note']); ws.addRow(['Invented text']); };
const book = async (build) => { const wb = new ExcelJS.Workbook(); build(wb); return Buffer.from(await wb.xlsx.writeBuffer()); };

test('two visible sheets: each use is staged on its own sheet, with the sheet named', async () => {
  const p = await stageOf(await book((wb) => { addJunk(wb, 'Cover'); addRoll(wb, 'Rent Roll'); addT12(wb, 'T-12'); for (let i = 0; i < 8; i++) addJunk(wb, `Misc ${i}`, 'hidden'); }), 'a.xlsx');
  assert.deepEqual(p.items.map((x) => x.type).sort(), ['rentroll', 't12']);
  const roll = p.items.find((x) => x.type === 'rentroll'); const t12 = p.items.find((x) => x.type === 't12');
  assert.deepEqual(roll.sheets, ['Rent Roll']); assert.deepEqual(t12.sheets, ['T-12']);
  assert.match(roll.reason, /Sheet “Rent Roll”/); assert.match(t12.reason, /Sheet “T-12”/);
  assert.ok(!/hidden/.test(roll.reason + t12.reason));
  assert.equal(I.readyItems(p, null).length, 2);
});

test('a hidden sheet is read only when no visible sheet reads as that kind, and the item says so', async () => {
  const hiddenOnly = await stageOf(await book((wb) => { addJunk(wb, 'Cover'); addT12(wb, 'T-12'); addRoll(wb, 'RR old', 'hidden'); }), 'a.xlsx');
  const roll = hiddenOnly.items.find((x) => x.type === 'rentroll');
  assert.deepEqual(roll.sheets, ['RR old']);
  assert.match(roll.reason, /hidden sheet “RR old”: no visible sheet reads as a rent roll/);
  assert.ok(!/hidden/.test(hiddenOnly.items.find((x) => x.type === 't12').reason));
  const both = await stageOf(await book((wb) => { addT12(wb, 'T-12'); addRoll(wb, 'Rent Roll'); addRoll(wb, 'RR old', 'hidden'); }), 'a.xlsx');
  const r2 = both.items.find((x) => x.type === 'rentroll');
  assert.deepEqual(r2.sheets, ['Rent Roll'], 'the visible sheet is used and the hidden one is left');
  assert.ok(!/hidden/.test(r2.reason));
});

test('a sheet both readers accept goes to the higher score; the other use is offered as a question', async () => {
  // six rent roll headings and three month columns: the rent roll reader scores higher
  const mixed = await book((wb) => { const ws = wb.addWorksheet('Roll'); ws.addRow(['Unit', 'Tenant', 'SF', 'Lease Start', 'Lease End', 'Monthly Rent', 'Jan 2025', 'Feb 2025', 'Mar 2025']); ws.addRow(['101', 'Invented Co', 1000, '2022-01-01', '2028-01-31', 2400, 2400, 2400, 2400]); ws.addRow(['102', 'Sample LLC', 1200, '2021-01-01', '2027-06-30', 2900, 2900, 2900, 2900]); ws.addRow(['103', 'Example Shop', 900, '2023-01-01', '2029-06-30', 2100, 2100, 2100, 2100]); });
  const v = await verdictOf(mixed, 'a.xlsx');
  assert.equal(v.type, 'rentroll'); assert.equal(v.reader, 'rrsheet');
  assert.deepEqual(v.offered, [{ type: 't12', sheet: 'Roll' }]);
  const p = await stageOf(mixed, 'a.xlsx');
  assert.equal(p.items.length, 2);
  const ask = p.items.find((x) => !x.type);
  assert.deepEqual(ask.ask, ['t12']);
  assert.match(ask.reason, /“Roll”.*operating statement too/);
  assert.equal(I.readyItems(p, null).length, 1, 'only the better match can be used until the broker answers');
  assert.ok(I.answer(p, ask.id, 't12'));
});

test('a sheet both readers accept with equal scores keeps both uses, each offered, neither chosen', async () => {
  const tie = await book((wb) => { const ws = wb.addWorksheet('Both'); ws.addRow(['Unit', 'Tenant', 'SF', 'Jan 2025', 'Feb 2025', 'Mar 2025']); ws.addRow(['101', 'Invented Co', 1000, 2400, 2400, 2400]); ws.addRow(['102', 'Sample LLC', 1200, 2900, 2900, 2900]); ws.addRow(['103', 'Example Shop', 900, 2100, 2100, 2100]); });
  const v = await verdictOf(tie, 'a.xlsx');
  assert.equal(v.type, null);
  assert.deepEqual(v.readers, ['t12', 'rrsheet']);
  assert.equal(v.offered, undefined);
});

test('a rent roll workbook and a T-12 workbook alone are typed as before, with their sheet named', async () => {
  const r = await verdictOf(await book((wb) => addRoll(wb, 'Rent Roll')), 'a.xlsx');
  assert.equal(r.reader, 'rrsheet'); assert.equal(r.readers, undefined); assert.equal(r.offered, undefined);
  assert.deepEqual(r.parts, [{ type: 'rentroll', reader: 'rrsheet', sheets: ['Rent Roll'], hiddenOnly: false }]);
  const p = await stageOf(await book((wb) => addT12(wb, 'T-12')), 'a.xlsx');
  assert.equal(p.items.length, 1);
  assert.match(p.items[0].reason, /Sheet “T-12”/);
});

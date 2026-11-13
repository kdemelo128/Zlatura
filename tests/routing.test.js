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
import { prose, omPage, rollPage, statementPage, annualPage, narrative } from './tools/routepdfs.mjs';
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

/* ---- an OM that also holds other pages, and a statement title (case 3) */

const WEAK_OM = () => narrative('Offering Memorandum', 'Cap Rate 6.5%');

test('an OM with a titled rent roll page is staged as the OM, with those pages offered apart by page', async () => {
  const bytes = pdfOf([WEAK_OM(), rollPage(), narrative('Market notes')]);
  const v = await verdictOf(bytes, 'a.pdf');
  assert.equal(v.type, 'om'); assert.equal(v.reader, 'om');
  assert.deepEqual(v.parts, [{ type: 'rentroll', reader: 'rrpdf', pages: [2, 2] }]);
  const p = await stageOf(bytes, 'a.pdf');
  assert.equal(p.items.length, 2);
  assert.deepEqual(p.items.map((x) => x.type), ['om', 'rentroll']);
  assert.deepEqual(p.items[1].span, [2, 2]);
  assert.match(p.items[1].reason, /Page 2 read as rent roll/);
  assert.equal(p.items[0].file, p.items[1].file);
  assert.ok(p.items[0].pair && p.items[0].pair === p.items[1].pair, 'both uses of one file are marked, so the second is not "the same file twice"');
  assert.equal(p.items.filter((x) => x.dup).length, 0);
  assert.equal(I.readyItems(p, null).length, 2);
});

test('an OM wording with a rent roll page is not read as a rent roll as a whole, and a plain OM gets no extra item', async () => {
  const v = await verdictOf(pdfOf([omPage(), narrative('Location')]), 'a.pdf');
  assert.equal(v.type, 'om');
  assert.equal(v.parts, undefined);
});

test('a broker opinion of value with a rent roll page is still asked', async () => {
  const v = await verdictOf(pdfOf([narrative('Offering Memorandum', 'Cap Rate 6.5%', 'Broker Opinion of Value'), rollPage(), narrative('x')]), 'a.pdf');
  assert.equal(v.type, null);
  assert.equal(v.parts, undefined);
});

test('an Operating Statement with a rent roll on page 3 keeps the T-12 route; the rent roll pages are offered', async () => {
  const bytes = pdfOf([statementPage('Operating Statement - Actuals 2025'), narrative('Notes'), rollPage()]);
  const v = await verdictOf(bytes, 'a.pdf');
  assert.equal(v.type, 't12'); assert.equal(v.reader, 't12pdf');
  assert.deepEqual(v.parts, [{ type: 'rentroll', reader: 'rrpdf', pages: [3, 3] }]);
  const p = await stageOf(bytes, 'a.pdf');
  assert.deepEqual(p.items.map((x) => x.type), ['t12', 'rentroll']);
  assert.match(p.items[1].reason, /Page 3/);
});

test('an appraisal with OM wording and a rent roll page is still asked, and its rent roll page is not split off', async () => {
  const v = await verdictOf(pdfOf([narrative('Offering Memorandum', 'Cap Rate 6.5%', 'Appraisal Report of the invented plaza', 'USPAP', 'market value', 'highest and best use', 'sales comparison approach'), narrative('b'), narrative('c'), rollPage()]), 'a.pdf');
  assert.equal(v.type, null);
  assert.ok(v.ask.includes('appraisal'));
  assert.equal(v.parts, undefined);
});

test('a statement title the T-12 import will not take (a budget) is never sent to the rent roll reader because a rent roll is in the file', async () => {
  const v = await verdictOf(pdfOf([statementPage('Operating Statement - Budget 2026'), narrative('x'), rollPage()]), 'a.pdf');
  assert.notEqual(v.type, 'rentroll');
  assert.equal(v.reader, null);
});

test('an Operating Statement title on page 1 with a rent roll on page 3 is not sent to the rent roll reader, even when the text reads more like a rent roll', async () => {
  const v = await verdictOf(pdfOf([narrative('Operating Statement', 'Prepared for review'), narrative('Notes'), rollPage()]), 'a.pdf');
  assert.equal(v.type, null);
  assert.equal(v.reader, null);
});

test('OM wording, but an operating statement titled on its first page: the statement route is kept and the rent roll pages are offered', async () => {
  const v = await verdictOf(pdfOf([statementPage('Operating Statement - Actuals 2025'), narrative('Offering Memorandum', 'Cap Rate 6.5%'), rollPage()]), 'a.pdf');
  assert.equal(v.type, 't12'); assert.equal(v.reader, 't12pdf');
  assert.deepEqual(v.parts, [{ type: 'rentroll', reader: 'rrpdf', pages: [3, 3] }]);
});

test('a table with a suite, tenant and area but no rent column is not accepted as a rent roll: it stays asked', async () => {
  const cut = rollPage({ title: false, plain: true }).filter((it) => it.x < 260);
  const v = await verdictOf(pdfOf([cut, narrative('Property notes')]), 'a.pdf');
  assert.equal(v.type, null);
  assert.deepEqual(v.ask, ['rentroll']);
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

test('a rent roll workbook and a T-12 workbook alone are typed as before, with their sheet named', async () => {
  const r = await verdictOf(await book((wb) => addRoll(wb, 'Rent Roll')), 'a.xlsx');
  assert.equal(r.reader, 'rrsheet'); assert.equal(r.readers, undefined); assert.equal(r.offered, undefined);
  assert.deepEqual(r.parts, [{ type: 'rentroll', reader: 'rrsheet', sheets: ['Rent Roll'], hiddenOnly: false }]);
  const p = await stageOf(await book((wb) => addT12(wb, 'T-12')), 'a.xlsx');
  assert.equal(p.items.length, 1);
  assert.match(p.items[0].reason, /Sheet “T-12”/);
});

/* ---- review fixes */

test('an annual Statement of Operations with a titled rent roll on page 3 stays asked, never read whole as a rent roll', async () => {
  const v = await verdictOf(pdfOf([annualPage('Statement of Operations'), narrative('Notes'), rollPage()]), 'a.pdf');
  assert.notEqual(v.type, 'rentroll');
  assert.notEqual(v.reader, 'rrpdf');
  const u = await verdictOf(pdfOf([annualPage('Income and Expense Summary'), narrative('Notes'), rollPage({ title: false })]), 'a.pdf');
  assert.notEqual(u.type, 'rentroll');
});

test('a sheet both readers accept is never routed by score: one question, no Use until answered', async () => {
  // a rent roll with Jan-Mar charge columns reads as a statement too
  const wbk = await book((wb) => { const ws = wb.addWorksheet('Roll'); ws.addRow(['Unit', 'Tenant', 'SF', 'Lease Start', 'Lease End', 'Monthly Rent', 'Jan 2025', 'Feb 2025', 'Mar 2025']); ws.addRow(['101', 'Invented Co', 1000, '2022-01-01', '2028-01-31', 2400, 2400, 2400, 2400]); ws.addRow(['102', 'Sample LLC', 1200, '2021-01-01', '2027-06-30', 2900, 2900, 2900, 2900]); ws.addRow(['103', 'Example Shop', 900, '2023-01-01', '2029-06-30', 2100, 2100, 2100, 2100]); });
  const v = await verdictOf(wbk, 'a.xlsx');
  assert.equal(v.type, null); assert.equal(v.reader, null);
  assert.deepEqual(v.ask, ['rentroll', 't12']);
  const p = await stageOf(wbk, 'a.xlsx');
  assert.equal(p.items.length, 1);
  assert.deepEqual(p.items[0].ask, ['rentroll', 't12']);
  assert.equal(I.readyItems(p, null).length, 0);
  assert.match(p.items[0].reason, /“Roll”/);
});

test('a rent roll only on a hidden sheet is a question, not Read: the rent roll import skips hidden sheets', async () => {
  const p = await stageOf(await book((wb) => { addJunk(wb, 'Cover'); addT12(wb, 'T-12'); addRoll(wb, 'RR old', 'hidden'); }), 'a.xlsx');
  assert.equal(p.items.filter((x) => x.type === 'rentroll').length, 0);
  assert.match(p.items.find((x) => x.type === 't12').reason, /hidden sheet “RR old”.*skips hidden sheets/);
  const only = await stageOf(await book((wb) => { addJunk(wb, 'Cover'); addRoll(wb, 'RR old', 'hidden'); }), 'a.xlsx');
  assert.equal(only.items[0].type, null);
  assert.match(only.items[0].reason, /hidden sheet “RR old”.*skips hidden sheets/);
  assert.equal(I.readyItems(only, null).length, 0);
  // a hidden statement is still read: the T-12 import takes hidden sheets
  const hs = await stageOf(await book((wb) => { addJunk(wb, 'Cover'); addT12(wb, 'T-12 old', 'hidden'); }), 'a.xlsx');
  assert.equal(hs.items[0].type, 't12');
  assert.match(hs.items[0].reason, /hidden sheet “T-12 old”/);
});

test('a visible rent roll is used over a hidden one', async () => {
  const both = await stageOf(await book((wb) => { addT12(wb, 'T-12'); addRoll(wb, 'Rent Roll'); addRoll(wb, 'RR old', 'hidden'); }), 'a.xlsx');
  const r2 = both.items.find((x) => x.type === 'rentroll');
  assert.deepEqual(r2.sheets, ['Rent Roll']);
  assert.ok(!/hidden/.test(r2.reason));
});

test('a sheet named 2026 Plan or FY26 with month columns is a projection, not an actual statement', async () => {
  assert.notEqual((await verdictOf(await book((wb) => addT12(wb, '2026 Plan')), 'a.xlsx')).type, 't12');
  assert.notEqual((await verdictOf(await book((wb) => addT12(wb, 'FY26')), 'a.xlsx')).type, 't12');
});

test('an untitled rent roll says why it was chosen, and a page range says the import reads the whole file', async () => {
  const p = await stageOf(pdfOf([rollPage({ title: false, plain: true }), narrative('Property notes')]), 'a.pdf');
  assert.match(p.items[0].reason, /nothing on its first pages titles it/);
  const q = await stageOf(pdfOf([WEAK_OM(), rollPage(), narrative('Market notes')]), 'a.pdf');
  assert.match(q.items[1].reason, /reads the whole file; you pick those pages/);
});

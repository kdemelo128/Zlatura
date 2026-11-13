/* A tax bill, utility bill or unit mix in Start from documents: the staged item carries what its small reader found (factsread.js) with
 * page provenance, asks what the page leaves, is worked out again when the broker answers, and shows only while the item is that
 * kind of document. Nothing is a deal figure; nothing is stored. Invented PDFs (tests/facts-fixtures.js, tests/rr-fixtures.js pdfOf). */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fflate from 'fflate';
import ExcelJS from 'exceljs';
import { pdfOf } from './rr-fixtures.js';
import { TAX, UTIL, MIX, gridPage, pairsPage } from './facts-fixtures.js';

globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const I = await import('./../app/intake.js');
const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;
const { pdfPages } = await import('../app/pdftext.js');

const readPdf = async (bytes) => { const layouts = []; const pages = await pdfPages(pdfjs, new Uint8Array(bytes), { layouts, verbosity: 0 }); return { pages, layouts }; };
const getXlsx = async () => ({ ExcelJS, fflate });
const deps = { getFflate: async () => fflate, getXlsx, readPdf };
const file = (bytes, name) => new File([bytes], name);
const lines = (text, y0 = 740) => text.split('\n').map((s, i) => ({ x: 50, y: y0 - i * 14, s, size: 9 }));
const FOOT = ['This statement is provided for your information. Questions about it may be sent to the office named above', 'during business hours. Please keep this copy with your records. Figures are as of the date shown on it.'].map((s, i) => ({ x: 50, y: 120 - i * 12, s, size: 8 }));

test('a tax bill PDF is staged with its figures and their pages; the broker confirms it is a tax bill, and the facts stay', async () => {
  const p = I.newPlan();
  const [it] = await I.stageFiles(p, [file(pdfOf([lines(TAX.clean[0])]), 'bill.pdf')], deps);
  assert.equal(it.type, null);
  assert.equal(it.facts.type, 'taxbill');
  assert.equal(it.facts.fields.find((f) => f.key === 'annualTax').value, 9600);
  assert.deepEqual(it.facts.fields.find((f) => f.key === 'annualTax').where, { page: 1, line: 11 });
  assert.ok(I.factsShown(it), 'shown while it is asked whether this is a tax bill');
  assert.ok(I.answer(p, it.id, 'taxbill'));
  assert.ok(I.factsShown(it), 'and once it is named a tax bill');
  assert.match(it.use, /tax bill/i);
});

test('named something else, its facts are not shown; skipped, not shown', async () => {
  const p = I.newPlan();
  const [it] = await I.stageFiles(p, [file(pdfOf([lines(TAX.clean[0])]), 'bill.pdf')], deps);
  I.answer(p, it.id, 'insurance');
  assert.equal(I.factsShown(it), null);
});

test('a question the page leaves is asked, and answering works the facts out again', async () => {
  const p = I.newPlan();
  const [it] = await I.stageFiles(p, [file(pdfOf([[...lines(UTIL.ambiguousDates[0]), ...FOOT]]), 'gas.pdf')], deps);
  assert.equal(it.facts.type, 'utilities');
  assert.deepEqual(it.facts.asks.map((a) => a.id), ['dateOrder']);
  assert.equal(it.facts.fields.some((f) => f.key === 'periodFrom'), false);
  assert.equal(I.answerFact(p, it.id, 'dateOrder', 'sideways'), false);
  assert.equal(I.answerFact(p, it.id, 'nothing', 'mdy'), false);
  assert.equal(I.answerFact(p, it.id, 'dateOrder', 'mdy'), true);
  assert.deepEqual(it.facts.asks, []);
  assert.equal(it.facts.fields.find((f) => f.key === 'periodFrom').value, '2026-03-04');
});

test('a unit mix PDF table, and a workbook, are read; a tax bill workbook too', async () => {
  const p = I.newPlan();
  const [mix] = await I.stageFiles(p, [file(pdfOf([[...gridPage('Unit Mix', MIX.header, [...MIX.rows, MIX.total]), ...FOOT]]), 'mix.pdf')], deps);
  assert.equal(mix.facts.type, 'unitMix');
  assert.equal(mix.facts.fields.length, 3);
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Tax bill');
  for (const r of TAX.grids[0].rows) ws.addRow(r.cells);
  const [x] = await I.stageFiles(p, [file(new Uint8Array(await wb.xlsx.writeBuffer()), 'tax.xlsx')], deps);
  assert.equal(x.facts.type, 'taxbill');
  assert.deepEqual(x.facts.fields.find((f) => f.key === 'annualTax').where, { sheet: 'Tax bill', row: 5 });
});

test('a rent roll, a T-12 and an OM carry no facts', async () => {
  const p = I.newPlan();
  const { PDF_SPECS } = await import('./rr-fixtures.js');
  const [rr] = await I.stageFiles(p, [file(pdfOf(PDF_SPECS['rr-dd']()), 'rr.pdf')], deps);
  assert.equal(rr.facts, null);
});

test('a table PDF tax bill and a utility pair page read through the intake, too', async () => {
  const p = I.newPlan();
  const [t] = await I.stageFiles(p, [file(pdfOf([[...pairsPage('Real Estate Tax Bill', TAX.tablePairs), ...FOOT]]), 'table.pdf')], deps);
  assert.equal(t.facts.fields.find((f) => f.key === 'annualTax').value, 9600);
  const [u] = await I.stageFiles(p, [file(pdfOf([[...pairsPage('Electric Service Statement', UTIL.electricPairs), ...FOOT]]), 'util.pdf')], deps);
  assert.equal(u.facts.fields.find((f) => f.key === 'charge').value, 2310.45);
});

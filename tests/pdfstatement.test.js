import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdfStatementChoices, statementFromPdfChoice } from '../app/pdfstatement.js';
import { statementTotals, t12OpenChecks } from '../app/t12.js';
globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const { identify } = await import('../app/ddintake.js');
import { statementText, statementPdf } from './pdfstatement-fixtures.js';
const choices = (opts) => pdfStatementChoices(statementText(opts), { asOfYear: 2026 });
const eligible = (opts) => choices(opts).filter((c) => c.eligible);
const read = (opts) => statementFromPdfChoice(eligible(opts)[0], { file: 'invented-statement.pdf', now: 1, numberFormat: 'us' });

test('explicit annual actuals reach the existing annual basis, with printed year/page and no invented months', () => {
  const t = read();
  assert.equal(t.period.basis, 'annual'); assert.deepEqual(t.months, []);
  const total = statementTotals(t);
  assert.equal(total.egi, 126000); assert.equal(total.opex, 15000); assert.equal(total.taxes, 12000); assert.equal(total.noi, 111000);
  assert.equal(t.source.type, 'pdf'); assert.equal(t.source.file, 'invented-statement.pdf');
  assert.match(t.sheet, /PDF page 1.*2025/); assert.equal(t.importedAt, 1);
});
for (const column of ['Annualized T-12 2025', 'Pro Forma 2025', 'Stabilized 2025', 'Per Unit', 'Per SF', '%']) {
  test(`${column} is not read as actual totals`, () => assert.equal(eligible({ columns: [column] }).length, 0));
}
test('an actual column is kept separate from per-SF and pro-forma columns', () => {
  assert.deepEqual(eligible({ columns: ['Actual 2025', 'Per SF', 'Pro Forma'] }).map((c) => c.label), ['Actual 2025']);
  assert.deepEqual(eligible({ columns: ['Actual 2025', 'Total'] }).map((c) => c.label), ['Actual 2025']);
});
test('a partial, unclear or future year stays held', () => {
  for (const title of ['Operating Statement - YTD 2025', 'Annual Operating Statement - YTD 2025', 'Operating Statement - 3 months ended 2025', 'Operating Statement']) assert.equal(eligible({ title }).length, 0);
  assert.equal(eligible({ title: 'Annual Operating Statement - Year ended 2028', columns: ['Actual 2028'] }).length, 0);
  assert.equal(eligible({ title: 'Annual Operating Statement - Year ended December 31, 2026', columns: ['Actual 2026'] }).length, 0);
  assert.equal(eligible({ title: 'Annual Operating Statement - Year ended June 30, 2026', columns: ['Actual 2026'] }).length, 0);
});
test('missing amounts and dashes never silently become zero, while a printed zero remains a zero', () => {
  for (const value of [null, '—']) assert.equal(eligible({ values: { Insurance: value } }).length, 0);
  assert.equal(eligible({ columns: ['Actual 2025', 'Pro Forma'], values: { Insurance: ['—', '$3,000'] } }).length, 0);
  assert.equal(read({ values: { Insurance: '$0' } }).lines.find((l) => l.label === 'Insurance').total, 0);
});
test('ambiguous separators require a number-format answer before a statement can be made', () => {
  assert.throws(() => statementFromPdfChoice(eligible()[0]), /Choose how/);
  const t = read(); assert.equal(t.source.numberAsked, true); assert.equal(t.source.numberFormat, 'us');
});
test('a foreign currency and explicit model output stay held', () => {
  assert.equal(eligible({ title: 'Annual Operating Statement CAD - Year ended 2025' }).length, 0);
  assert.equal(eligible({ title: 'Underwriting Model Output\nAnnual Operating Statement - Year ended 2025' }).length, 0);
});
test('a single printed scale is used once; conflicting units stay held', () => {
  const values = { 'Rental income':'$120.00', 'Other income':'$6.00', 'Effective Gross Income':'$126.00', 'Real Estate Taxes':'$12.00', 'Insurance':'$3.00', 'Total Operating Expenses':'$15.00', 'Net Operating Income':'$111.00' };
  assert.equal(statementTotals(read({ title:'Annual Operating Statement - Year ended 2025, in thousands', values })).noi,111000);
  assert.equal(eligible({ title:'Annual Operating Statement - Year ended 2025, in thousands', values:{...values,'Rental income':'$120k'} }).length,0);
  assert.equal(eligible({ title:'Annual Operating Statement - Year ended 2025, in thousands\nFigures in millions', values }).length,0);
});

test('printed totals still go through the shared arithmetic QC', () => {
  assert.ok(t12OpenChecks(read({ values: { 'Net Operating Income': '$110,000' } })).some((c) => c.level === 'fail'));
});
test('a standalone annual statement gets the PDF T-12 route; an ambiguous year does not', () => {
  assert.equal(identify({ pages: statementText() }).reader, 't12pdf');
  assert.notEqual(identify({ pages: statementText({ title: 'Operating Statement' }) }).reader, 't12pdf');
});
test('the actual PDF text and positioned layout are read, with the same independent totals', async () => {
  const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;
  const { pdfPages } = await import('../app/pdftext.js');
  const layouts = []; const pages = await pdfPages(pdfjs, statementPdf(), { layouts, verbosity: 0 });
  const choice = pdfStatementChoices(pages, { layouts, asOfYear: 2026 }).find((c) => c.eligible);
  const t = statementFromPdfChoice(choice, { numberFormat: 'us' });
  assert.equal(statementTotals(t).noi, 111000); assert.deepEqual(t.months, []);
});

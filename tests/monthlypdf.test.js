import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdfStatementChoices, statementFromPdfChoice } from '../app/pdfstatement.js';
import { statementTotals, t12OpenChecks } from '../app/t12.js';
import { MONTHS, VARYING, VARYING_TOTALS, monthlyText, monthlyPdf, monthlyRows } from './monthlypdf-fixtures.js';
const opts = { asOfYear: 2026, asOfMonth: '2026-11' };
const choices = (o) => pdfStatementChoices(monthlyText(o), opts);
const eligible = (o) => choices(o).filter((c) => c.eligible);
const read = (o) => statementFromPdfChoice(eligible(o)[0], { file: 'invented-monthly-actuals.pdf', now: 1, numberFormat: 'us' });

test('twelve printed actual months use the shared T-12 shape and independently expected totals', () => {
  const c = eligible()[0]; assert.ok(c); assert.equal(c.basis, 'monthly');
  const t = read(); assert.deepEqual(t.months, MONTHS); assert.equal(t.period.basis, 'T-12');
  assert.deepEqual(t.lines.find((l) => l.label === 'Rental income').months, Array(12).fill(10000));
  const total = statementTotals(t);
  assert.equal(total.egi, 126000); assert.equal(total.opex, 15000); assert.equal(total.taxes, 12000); assert.equal(total.noi, 111000);
  assert.equal(t.source.type, 'pdf'); assert.equal(t.source.file, 'invented-monthly-actuals.pdf');
  assert.match(t.sheet, /PDF page 1.*2025-01.*2025-12/); assert.equal(t.importedAt, 1);
});
test('a monthly table without a printed annual total still retains each actual month', () => {
  const t = read({ total: false }); assert.deepEqual(t.months, MONTHS); assert.equal(statementTotals(t).noi, 111000);
});
test('different month values remain different rather than copying or dividing an annual total', () => {
  const t = read({ values: VARYING, totals: VARYING_TOTALS });
  assert.deepEqual(t.lines.find((l) => l.label === 'Rental income').months, [10000, 10001, 10002, 10003, 10004, 10005, 10006, 10007, 10008, 10009, 10010, 10011]);
  assert.equal(statementTotals(t).egi, 126066); assert.equal(statementTotals(t).noi, 111066);
});
test('a rolling twelve-month actual period may finish in the completed current year', () => {
  const months = ['2025-11', '2025-12', ...Array.from({ length: 10 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`)];
  assert.deepEqual(read({ months, title: 'Monthly Operating Statement - Actuals' }).months, months);
});
test('current and future month columns remain held even when titled actuals', () => {
  assert.equal(eligible({ months: MONTHS.map((m) => m.replace('2025', '2026')) }).length, 0);
});
test('missing, duplicate, reversed and undated month columns stay held', () => {
  for (const months of [MONTHS.slice(0, 11), [...MONTHS.slice(0, 11), MONTHS[10]], [...MONTHS].reverse(), MONTHS.map((_, i) => `Month ${i + 1}`), MONTHS.map((m) => m.slice(2))]) assert.equal(eligible({ months }).length, 0, months.join(','));
});
test('a calendar gap is not repaired or silently annualized', () => {
  const months = [...MONTHS]; months[5] = '2024-06'; assert.equal(eligible({ months }).length, 0);
});
test('budgets, projections, annualized and model outputs never become actual months', () => {
  for (const title of ['Monthly Operating Statement - Budget 2025', 'Monthly Operating Statement - Pro Forma Actuals 2025', 'Monthly Operating Statement - Annualized Actuals 2025', 'Underwriting Model Output\nMonthly Operating Statement - Actuals 2025', 'Monthly Operating Statement 2025', 'Monthly Operating Statement - Actuals YTD 2025', 'Monthly Operating Statement - Actuals 3 months ended 2025']) assert.equal(eligible({ title }).length, 0, title);
});
test('a single blank or dash month is held while a printed zero stays zero', () => {
  for (const missing of [null, '—']) {
    const values = Array(12).fill('$250.00'); values[6] = missing;
    assert.equal(eligible({ values: { Insurance: values } }).length, 0);
  }
  const values = Array(12).fill('$250.00'); values[6] = '$0.00';
  assert.equal(read({ values: { Insurance: values }, total: false }).lines.find((l) => l.label === 'Insurance').months[6], 0);
});
test('a printed total mismatch is retained for the existing shared arithmetic QC', () => {
  const t = read({ totals: { 'Net Operating Income': '$110,000.00' } });
  assert.ok(t12OpenChecks(t).some((c) => c.level === 'fail'));
});
test('a currency range is not split into invented monthly amounts', () => {
  assert.equal(eligible({ values: { Insurance: '$250.00-$350.00' } }).length, 0);
});
test('non-USD amounts and conflicting scales remain held', () => {
  assert.equal(eligible({ title: 'Monthly Operating Statement - Actuals CAD 2025' }).length, 0);
  const conflicting = choices({ title: 'Figures in millions\nMonthly Operating Statement - Actuals 2025 in thousands' });
  assert.equal(conflicting.filter((c) => c.eligible).length, 0);
  assert.ok(conflicting.some((c) => /Conflicting table or cell units/.test(c.why)));
  assert.equal(eligible({ title: 'Monthly Operating Statement - Actuals 2025 in thousands', values: { 'Rental income': '$10k' } }).length, 0);
});
test('an extra financial column is not silently mapped as another month', () => {
  assert.equal(eligible({ months: [...MONTHS, 'Budget'] }).length, 0);
});
test('a split-page monthly statement stays outside this first slice', () => {
  const pages = monthlyText(); pages.push('Continued statement - Actuals');
  assert.equal(pdfStatementChoices(pages, opts).filter((c) => c.eligible).length, 0);
});
test('the actual positioned PDF is read with all twelve months and the same totals', async () => {
  const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;
  const { pdfPages } = await import('../app/pdftext.js');
  const layouts = []; const pages = await pdfPages(pdfjs, monthlyPdf(), { layouts, verbosity: 0 });
  const c = pdfStatementChoices(pages, { ...opts, layouts }).find((c) => c.eligible);
  assert.ok(c, pdfStatementChoices(pages, { ...opts, layouts }).map((c) => c.why).join('; '));
  const t = statementFromPdfChoice(c, { numberFormat: 'us' });
  assert.deepEqual(t.months, MONTHS); assert.equal(statementTotals(t).noi, 111000);
});
test('intake routes the completed actual PDF and leaves a future period unclassified', async () => {
  globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
  globalThis.window ||= globalThis; globalThis.navigator ||= { userAgent: 'node' };
  const { identify } = await import('../app/ddintake.js');
  assert.equal(identify({ pages: monthlyText() }).reader, 't12pdf');
  const year = new Date().getFullYear() + 1;
  assert.notEqual(identify({ pages: monthlyText({ months: MONTHS.map((m) => `${year}-${m.slice(5)}`), title: `Monthly Operating Statement - Actuals ${year}` }) }).reader, 't12pdf');
});

test('an independent annual actual column remains available beside a monthly comparison', async () => {
  const { statementText } = await import('./pdfstatement-fixtures.js');
  const c = pdfStatementChoices(statementText({ columns: ['Actual 2025', 'Jan 2025'] }), opts);
  const annual = c.find((x) => x.eligible && x.label === 'Actual 2025');
  assert.ok(annual, c.map((x) => x.why).join('; '));
  assert.equal(statementTotals(statementFromPdfChoice(annual, { numberFormat: 'us' })).noi, 111000);
});
test('month-like words and impossible printed days do not establish twelve actual months', () => {
  for (const first of ['Janitor 2025', '2025-01-99', '1/99/2025']) {
    const months = [...MONTHS]; months[0] = first;
    assert.equal(eligible({ months }).length, 0, first);
  }
});
test('real month names and valid month-end dates remain explicitly dated actual months', () => {
  for (const first of ['January 2025', 'Jan-2025', '2025-01-31', '1/31/2025']) {
    const months = [...MONTHS]; months[0] = first;
    assert.deepEqual(read({ months }).months, MONTHS, first);
  }
  const months = [...MONTHS]; months[8] = 'Sept 2025';
  assert.deepEqual(read({ months }).months, MONTHS);
});

test('a table scale is applied once to each printed month and total', () => {
  const values = { 'Rental income': '$10.000', 'Other income': '$0.500', 'Effective Gross Income': '$10.500', 'Real Estate Taxes': '$1.000', Insurance: '$0.250', 'Total Operating Expenses': '$1.250', 'Net Operating Income': '$9.250' };
  const totals = { 'Rental income': '$120.000', 'Other income': '$6.000', 'Effective Gross Income': '$126.000', 'Real Estate Taxes': '$12.000', Insurance: '$3.000', 'Total Operating Expenses': '$15.000', 'Net Operating Income': '$111.000' };
  const t = read({ title: 'Monthly Operating Statement - Actuals 2025, in thousands', values, totals });
  assert.deepEqual(t.lines.find((l) => l.label === 'Rental income').months, Array(12).fill(10000));
  assert.equal(statementTotals(t).noi, 111000);
  assert.equal(t12OpenChecks(t).filter((c) => c.level === 'fail').length, 0);
  const rounded = read({ title: 'Monthly Operating Statement - Actuals 2025, in thousands', values: { ...values, 'Rental income': '$10.000005' }, totals, total: false });
  assert.equal(rounded.lines.find((l) => l.label === 'Rental income').months[0], 10000.01);
});
test('ambiguous number separators still need a format choice before any monthly statement is made', () => {
  const rows = monthlyRows();
  const values = Object.fromEntries(rows.filter((r) => r[1]).map((r) => [r[0], String(r[1]).replace(/\.00$/, '')]));
  const totals = Object.fromEntries(rows.filter((r) => r.at(-1)).map((r) => [r[0], String(r.at(-1)).replace(/\.00$/, '')]));
  const pages = monthlyText({ values, totals });
  const c = pdfStatementChoices(pages, opts).find((x) => x.eligible);
  assert.ok(c); assert.equal(c.number.ask, 'ambiguous');
  assert.throws(() => statementFromPdfChoice(c), /Choose how the numbers/);
  assert.equal(statementTotals(statementFromPdfChoice(c, { numberFormat: 'us' })).noi, 111000);
});

/* Invented operating statements, as OM page text and as PDFs, for the
 * statement reader's tests (tests/omstatement.test.js) and the browser flow
 * (tests/e2e/omstmt-flow.mjs, via tests/e2e/make_pdfs.py). Every name and
 * figure is made up. */

/* ----------------------------------------------------- as page text */

const pad = (label, ...vals) => `  ${label.padEnd(34)}${vals.map((v) => String(v).padStart(14)).join('')}`;
const head = (...h) => ' '.repeat(36) + h.map((v) => String(v).padStart(14)).join('');
const table = (title, heads, rows) => `${title}\n\n${[...(heads ? [head(...heads), ''] : []), ...rows.map((r) => (r === '' ? '' : pad(...r)))].join('\n')}`;

export const CASES = {
  // an operating history, oldest year first, then a T-12 and a pro forma
  history: [table('Operating History', ['2023', '2024', 'T-12', 'Pro Forma'], [
    ['Effective Gross Income', '$900,000', '$950,000', '$1,000,000', '$1,100,000'],
    ['Real Estate Taxes', '$90,000', '$95,000', '$100,000', '$104,000'],
    ['Total Operating Expenses', '$300,000', '$310,000', '$320,000', '$330,000'],
    ['Net Operating Income', '$600,000', '$640,000', '$680,000', '$770,000']])],
  // a cash flow with Year 1 to Year 4 and no actual column
  yearN: [table('Cash Flow Projection', ['Year 1', 'Year 2', 'Year 3', 'Year 4'], [
    ['Effective Gross Income', '$1,000,000', '$1,030,000', '$1,060,900', '$1,092,727'],
    ['Total Operating Expenses', '$320,000', '$329,600', '$339,488', '$349,673'],
    ['Net Operating Income', '$680,000', '$700,400', '$721,412', '$743,054']])],
  // a T-12 and a Year 1 budget
  t12year1: [table('Income & Expense', ['T-12', 'Year 1'], [
    ['Effective Gross Income', '$1,000,000', '$1,080,000'],
    ['Total Operating Expenses', '$320,000', '$330,000'],
    ['Net Operating Income', '$680,000', '$750,000']])],
  // the pro forma column first
  pfFirst: [table('Operating Statement', ['Pro Forma', 'Actual 2025'], [
    ['Effective Gross Income', '$1,100,000', '$1,000,000'],
    ['Total Operating Expenses', '$330,000', '$320,000'],
    ['Net Operating Income', '$770,000', '$680,000']])],
  // headings that are plain years: 2025 is past, 2026 to come (as of 2026-10-14)
  yearsOnly: [table('Operating Statement', ['2025', '2026'], [
    ['Effective Gross Income', '$1,000,000', '$1,100,000'],
    ['Total Operating Expenses', '$320,000', '$330,000'],
    ['Net Operating Income', '$680,000', '$770,000']])],
  // a per-unit column before the totals (multifamily)
  perUnitFirst: [table('Operating Statement', ['Per Unit', 'Total'], [
    ['Effective Gross Income', '$20,833', '$1,000,000'],
    ['Real Estate Taxes', '$2,083', '$100,000'],
    ['Total Operating Expenses', '$6,667', '$320,000'],
    ['Net Operating Income', '$14,167', '$680,000']])],
  // rows that are per-unit figures, and no total anywhere
  perUnitRowAlone: [table('Operating Statement', null, [
    ['Total Expenses Per Unit', '$6,667'], ['Real Estate Taxes Per Unit', '$2,083'], ['NOI Per Unit', '$14,167']])],
  // a negative actual NOI beside a positive pro forma
  negYears: [table('Operating Statement', ['2025', '2026'], [['Net Operating Income', '($12,400)', '$270,000']])],
  // printed in thousands
  thousands: [table('Operating Statement ($ in 000s)', ['Actual', 'Pro Forma'], [
    ['Effective Gross Income', '$1,071', '$1,119'],
    ['Real Estate Taxes', '$118', '$122'],
    ['Total Operating Expenses', '$353', '$361'],
    ['Net Operating Income', '$719', '$758']])],
  // "Pro Forma" heading Year 1 and Year 2, "Actual" over 2025
  merged: [`Operating Statement\n\n${[
    ' '.repeat(36) + 'Actual'.padStart(14) + ' '.repeat(14) + 'Pro Forma'.padStart(8),
    head('2025', 'Year 1', 'Year 2'), '',
    pad('Effective Gross Income', '$1,000,000', '$1,080,000', '$1,110,000'),
    pad('Net Operating Income', '$680,000', '$750,000', '$772,000')].join('\n')}`],
  // a tax reimbursement (income) printed before the tax expense
  taxReimb: [table('Operating Statement', ['Current'], [
    ['Base Rent', '$900,000'], ['Real Estate Tax Reimbursements', '$60,000'],
    ['Effective Gross Income', '$960,000'], '', ['Real Estate Taxes', '$100,000'],
    ['Total Operating Expenses', '$300,000'], ['Net Operating Income', '$660,000']])],
  // EGI less expenses is not the NOI printed
  noAdd: [table('Operating Statement', ['Current'], [
    ['Effective Gross Income', '$960,000'], ['Total Operating Expenses', '$300,000'], ['Net Operating Income', '$760,000']])],
  // a long statement: the NOI row more than 40 lines below the headings
  long: [table('Operating Statement', ['Pro Forma', 'Actual'], [
    ['Effective Gross Income', '$1,100,000', '$1,000,000'],
    ...Array.from({ length: 20 }, (_, i) => [[`Expense line ${i + 1}`, '$16,500', '$16,000'], '']).flat(),
    ['Total Operating Expenses', '$330,000', '$320,000'],
    ['Net Operating Income', '$770,000', '$680,000']])],
  // a pro forma far above the actuals
  growth: [table('Operating Statement', ['Actual', 'Pro Forma'], [
    ['Effective Gross Income', '$1,000,000', '$1,900,000'],
    ['Total Operating Expenses', '$320,000', '$330,000'],
    ['Net Operating Income', '$680,000', '$1,570,000']])],
};

/** A one-column statement whose NOI is printed as `noi` (EGI $1,000,000, expenses $320,000: $680,000 adds up). */
export const noiPrinted = (noi) => [table('Operating Statement', ['T-12'], [
  ['Effective Gross Income', '$1,000,000'], ['Total Operating Expenses', '$320,000'], ['Net Operating Income', noi]])];

/** Two columns, Actual then Pro Forma, with EGI, expenses and NOI as given. */
export const twoColumns = (egi, opex, noi) => [table('Operating Statement', ['Actual', 'Pro Forma'], [
  ['Effective Gross Income', ...egi], ['Total Operating Expenses', ...opex], ['Net Operating Income', ...noi]])];

/** Itemised: three income lines and four expense lines, each subtotal as given. */
export const itemised = ({ egi = '$1,000,000', opex = '$320,000', noi = '$680,000' } = {}) => [table('Operating Statement', ['T-12'], [
  ['Gross Potential Rent', '$1,020,000'], ['Vacancy & Credit Loss', '($51,000)'], ['Other Income', '$31,000'], ['Effective Gross Income', egi], '',
  ['Real Estate Taxes', '$110,000'], ['Insurance', '$40,000'], ['Repairs & Maintenance', '$90,000'], ['Utilities', '$80,000'], ['Total Operating Expenses', opex],
  ['Net Operating Income', noi]])];

/* ----------------------------------------------------- as PDFs */

/**
 * A statement typeset as an OM's designer does it: the title, an optional
 * note, an optional spanning heading line, the column headings centred 25
 * points left of each column's right edge, labels at x 40, figures
 * right-aligned on the columns. Items for pdfOf (tests/rr-fixtures.js) and
 * tests/e2e/make_pdfs.py.
 */
export function stmtItems(title, heads, rows, cols, { y = 720, note = null, span = null, gap = 13 } = {}) {
  const out = [{ x: 40, y, s: title, size: 12, bold: true }];
  y -= 18;
  if (note) { out.push({ x: 40, y, s: note, size: 8 }); y -= 14; }
  if (span) { for (const [text, a, b] of span) out.push({ x: (cols[a] + cols[b]) / 2 - 25, y, s: text, size: 9, bold: true, center: true }); y -= 12; }
  heads.forEach((h, i) => out.push({ x: cols[i] - 25, y, s: h, size: 9, bold: true, center: true }));
  y -= 16;
  for (const [label, ...vals] of rows) {
    out.push({ x: 40, y, s: label, size: 9 });
    vals.forEach((v, i) => out.push({ x: cols[i], y, s: v, size: 9, right: true }));
    y -= gap;
  }
  return out;
}

/* page 1: Actual 2025 and Pro Forma, each with a $/SF column beside it */
const styled = () => stmtItems('Operating Statement', ['Actual 2025', '$/SF', 'Pro Forma', '$/SF'], [
  ['Gross Potential Rent', '$1,094,400', '$26.31', '$1,152,000', '$27.69'],
  ['Vacancy & Credit Loss', '($43,776)', '($1.05)', '($57,600)', '($1.38)'],
  ['Other Income', '$20,776', '$0.50', '$24,500', '$0.59'],
  ['Effective Gross Income', '$1,071,400', '$25.76', '$1,118,900', '$26.90'],
  ['Real Estate Taxes', '$118,200', '$2.84', '$121,700', '$2.93'],
  ['Total Operating Expenses', '$352,650', '$8.48', '$361,400', '$8.69'],
  ['Net Operating Income', '$718,750', '$17.28', '$757,500', '$18.21'],
], [330, 390, 470, 530]);
/* page 2: multifamily, per unit first, then T-12 and Year 1 */
const perUnit = () => stmtItems('Income & Expense Summary', ['Per Unit', 'T-12', 'Year 1'], [
  ['Effective Gross Income', '$22,321', '$1,071,400', '$1,118,900'],
  ['Real Estate Taxes', '$2,463', '$118,200', '$121,700'],
  ['Total Operating Expenses', '$7,347', '$352,650', '$361,400'],
  ['Net Operating Income', '$14,974', '$718,750', '$757,500'],
], [300, 400, 500]);
/* page 3: in thousands; "Pro Forma" spanning Year 1 and Year 2 */
const merged = () => stmtItems('Financial Analysis', ['2025', 'Year 1', 'Year 2'], [
  ['Effective Gross Income', '$1,071', '$1,119', '$1,152'],
  ['Real Estate Taxes', '$118', '$122', '$125'],
  ['Total Operating Expenses', '$353', '$361', '$372'],
  ['Net Operating Income', '$719', '$758', '$780'],
], [330, 430, 530], { note: '($ in thousands)', span: [['Actual', 0, 0], ['Pro Forma', 1, 2]] });
/* narrow columns, the pro forma first */
const narrow = () => stmtItems('Operating Statement', ['Pro Forma', 'Actual'], [
  ['Effective Gross Income', '$1,118,900', '$1,071,400'],
  ['Real Estate Taxes', '$121,700', '$118,200'],
  ['Total Operating Expenses', '$361,400', '$352,650'],
  ['Net Operating Income', '$757,500', '$718,750'],
], [400, 460]);
/* a long statement, rows 26 points apart: NOI far below the headings */
const longSheet = () => stmtItems('Operating Statement', ['Pro Forma', 'Actual'], [
  ['Effective Gross Income', '$1,118,900', '$1,071,400'],
  ...Array.from({ length: 20 }, (_, i) => [`Expense line ${i + 1}`, '$18,070', '$17,632.50']),
  ['Total Operating Expenses', '$361,400', '$352,650'],
  ['Net Operating Income', '$757,500', '$718,750'],
], [400, 500], { y: 760, gap: 26 }).filter((it) => it.y > 20);

/* The browser flow's OM: a summary, then a multifamily statement in
 * thousands with a Per Unit column, a T-12 and a Pro Forma, whose T-12 NOI
 * (786) is not its EGI (1,192) less its expenses (416): 776. */
export const QC_UNITS = 48;
export function specStmtQc() {
  const sum = [{ x: 40, y: 740, s: 'Investment Summary', size: 14, bold: true },
    ...[['Asking Price', '$13,950,000'], ['Number of Units', '48'], ['Year Built', '1986'], ['Cap Rate', '5.60%']]
      .flatMap(([k, v], i) => [{ x: 40, y: 700 - i * 16, s: k, size: 10 }, { x: 300, y: 700 - i * 16, s: v, right: true, size: 10 }]),
    { x: 40, y: 600, s: '77 Invented Terrace, Sampletown, MD 20000', size: 10 }];
  const st = stmtItems('Operating Statement', ['Per Unit', 'T-12', 'Pro Forma'], [
    ['Gross Potential Rent', '$25,208', '1,210', '1,260'],
    ['Vacancy & Credit Loss', '($1,271)', '(61)', '(63)'],
    ['Other Income', '$896', '43', '45'],
    ['Effective Gross Income', '$24,833', '1,192', '1,242'],
    ['Real Estate Taxes', '$2,958', '142', '146'],
    ['Insurance', '$1,208', '58', '60'],
    ['Repairs & Maintenance', '$2,000', '96', '98'],
    ['Property Management', '$1,000', '48', '50'],
    ['Utilities', '$1,500', '72', '74'],
    ['Total Operating Expenses', '$8,667', '416', '428'],
    ['Net Operating Income', '$16,375', '786', '814'],
  ], [300, 400, 500], { note: '($ in 000s; per unit in dollars)' });
  return [sum, st];
}

export const PDF_SPECS = {
  'om-stmt-styled': () => [styled(), perUnit(), merged()],
  'om-stmt-narrow': () => [narrow(), longSheet()],
  'om-stmt-qc': specStmtQc,
};

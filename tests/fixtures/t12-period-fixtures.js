/* Invented fixtures for T-12 PR 3a "Period structure and the T-12 Data QC panel"
 * (tests/t12-period.test.js, tests/e2e/t12period-flow.mjs,
 * tests/tools/make-backup-4.7.34.mjs). Every property, line and figure is
 * made up. The figures are worked by hand here, so a test never copies the
 * code under test. Statements are plain arrays of cells (no app import, so
 * the backup script can use them with the old code).
 *
 * D: Jan to Dec 2025 plus a second "Dec 2025" column (column N). Rent 10,000
 *    in every column. Repairs 500 in every column, but 650 in the second Dec.
 *    The file's Total column adds both: rent 130,000, repairs 6,650.
 *    Counting both columns: EGI 130,000, expenses 6,650, NOI 123,350.
 *    Second Dec chosen: rent 120,000, repairs 11 x 500 + 650 = 6,150, NOI 113,850.
 *    First Dec chosen: repairs 6,000, NOI 114,000.
 *    Larger of the two Dec columns across lines: 10,000 + 650 = 10,650.
 * F: Oct 2024 to Dec 2025 (15 months). Rent 9,000 in the three 2024 months and
 *    10,000 in the twelve 2025 months; taxes 1,000 every month.
 *    Total column: rent 27,000 + 120,000 = 147,000; taxes 15,000.
 *    Read as a year (4.7.34): EGI 147,000, expenses 15,000, NOI 132,000.
 *    Latest 12 (Jan to Dec 2025): rent 120,000, taxes 12,000, NOI 108,000;
 *    prior (Oct to Dec 2024): rent 27,000, taxes 3,000.
 *    Oct 2024 to Sep 2025: rent 27,000 + 90,000 = 117,000, taxes 12,000;
 *    prior (Oct to Dec 2025): rent 30,000, taxes 3,000.
 *    The held amount: |NOI all - NOI latest 12| = |132,000 - 108,000| = 24,000.
 * C: Jan to Jun 2026, columns that are running totals; Total = June.
 *    Rent 10k 20k 30k 40k 50k 60k; Repairs 500 900 1,400 1,400 2,100 2,600;
 *    Taxes 0 0 6,000 6,000 6,000 12,000; Insurance 300 600 900 1,200 1,500 1,800.
 *    As monthly columns: rent 210,000; repairs 8,900; taxes 30,000; insurance
 *    6,300; expenses 45,200; NOI 164,800.
 *    As running totals (differences): rent 10,000 x 6 = 60,000; repairs
 *    500 400 500 0 700 500 = 2,600; taxes 6,000 + 6,000 = 12,000; insurance
 *    300 x 6 = 1,800; expenses 16,400; NOI 43,600. The two NOIs differ by 121,200.
 * G: Jan to Dec 2025, no Total column needed. Rent 10,000 except April 0;
 *    Repairs 400 except April and August 0. April: every line 0 (a gap);
 *    August: repairs 0 but rent 10,000 (active, not a gap). 11 months with
 *    activity of 12 columns.
 * L: the same twelve columns with January to May 0 on every line: activity
 *    starts in June, 7 months with activity, 5 before, no gap.
 * P: Jan to Jun 2025, March all 0. Rent 10,000 and Repairs 500 otherwise.
 *    EGI 50,000, expenses 2,500, NOI 47,500.
 *    Annualised over 6 columns (x 12 / 6): EGI 100,000, expenses 5,000, NOI 95,000.
 *    Annualised over 5 months with activity (x 12 / 5): EGI 120,000,
 *    expenses 6,000, NOI 114,000. */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** `count` month headings from `month` (1 to 12) of `year`: "Oct 2024", "Nov 2024" … */
export function heads(year, month, count) {
  return Array.from({ length: count }, (_, i) => { const k = (month - 1) + i; return `${MON[k % 12]} ${year + Math.floor(k / 12)}`; });
}
/** Rows as the reader takes them: [{ r, cells }], row numbers from 1. */
export const grid = (rows) => rows.map((cells, i) => ({ r: i + 1, cells }));
const sum = (xs) => xs.reduce((s, v) => s + v, 0);
/** A statement: heading row, Income part, Expenses part. `inc` and `exp` are [label, ...12 values]; the Total column is their sum unless `total` is false. */
function statement(months, inc, exp, { total = true, totals = {} } = {}) {
  const line = ([label, ...v]) => [label, ...v, ...(total ? [label in totals ? totals[label] : sum(v)] : [])];
  return grid([['Account', ...months, ...(total ? ['Total'] : [])], ['Income'], ...inc.map(line), ['Expenses'], ...exp.map(line)]);
}
const fill = (n, v) => Array(n).fill(v);

export const dupRows = () => statement(
  [...heads(2025, 1, 12), 'Dec 2025'],
  [['Base Rent', ...fill(13, 10000)]],
  [['Repairs and Maintenance', ...fill(12, 500), 650]],
);
export const fifteenRows = () => statement(
  heads(2024, 10, 15),
  [['Base Rent', ...fill(3, 9000), ...fill(12, 10000)]],
  [['Real Estate Taxes', ...fill(15, 1000)]],
);
/**
 * `credit`: Repairs has a credit (-200) in March instead of a running total (3 of the 4 lines still rise).
 * `bent`: Repairs and Insurance dip in March too (2 of the 4 lines rise: exactly half).
 * `total`: false leaves the Total column out. `off`: dollars added to every printed Total.
 */
export const cumulativeRows = ({ credit = false, bent = false, total = true, off = 0 } = {}) => statement(
  heads(2026, 1, 6),
  [['Base Rent', 10000, 20000, 30000, 40000, 50000, 60000]],
  [['Repairs', 500, 900, credit || bent ? -200 : 1400, 1400, 2100, 2600], ['Real Estate Taxes', 0, 0, 6000, 6000, 6000, 12000], ['Insurance', 300, 600, bent ? 100 : 900, 1200, 1500, 1800]],
  { total, totals: { 'Base Rent': 60000 + off, Repairs: 2600 + off, 'Real Estate Taxes': 12000 + off, Insurance: 1800 + off } },
);
/** Twelve months of running totals: Rent 1,000 x month number, Taxes 100 x month number; Total = December. */
export const cumulative12Rows = () => statement(
  heads(2025, 1, 12),
  [['Base Rent', ...Array.from({ length: 12 }, (_, i) => 1000 * (i + 1))]],
  [['Real Estate Taxes', ...Array.from({ length: 12 }, (_, i) => 100 * (i + 1))]],
  { totals: { 'Base Rent': 12000, 'Real Estate Taxes': 1200 } },
);
export const gapRows = () => statement(
  heads(2025, 1, 12),
  [['Base Rent', ...Array.from({ length: 12 }, (_, i) => (i === 3 ? 0 : 10000))]],
  [['Repairs and Maintenance', ...Array.from({ length: 12 }, (_, i) => (i === 3 || i === 7 ? 0 : 400))]],
);
export const leadingRows = () => statement(
  heads(2025, 1, 12),
  [['Base Rent', ...Array.from({ length: 12 }, (_, i) => (i < 5 ? 0 : 10000))]],
  [['Repairs and Maintenance', ...Array.from({ length: 12 }, (_, i) => (i < 5 ? 0 : 400))]],
);
export const partialRows = () => statement(
  heads(2025, 1, 6),
  [['Base Rent', ...Array.from({ length: 6 }, (_, i) => (i === 2 ? 0 : 10000))]],
  [['Repairs and Maintenance', ...Array.from({ length: 6 }, (_, i) => (i === 2 ? 0 : 500))]],
);
/** Six invented months of a plain statement (no period problem at all): rent 1,000, taxes 200. */
export const plainRows = () => statement(heads(2026, 1, 6), [['Base Rent', ...fill(6, 1000)]], [['Real Estate Taxes', ...fill(6, 200)]]);
/** Any list of month headings: Base Rent 1,000 and Real Estate Taxes 100 in each. */
export const flatRows = (months) => statement(months, [['Base Rent', ...fill(months.length, 1000)]], [['Real Estate Taxes', ...fill(months.length, 100)]]);

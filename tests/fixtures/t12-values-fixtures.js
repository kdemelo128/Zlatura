/* Invented fixtures for T-12 PR 3b "Value flags, thresholds and run rate"
 * (tests/t12-values.test.js, tests/e2e/t12values-flow.mjs). Every property,
 * line and figure is made up and worked by hand here, so a test never copies
 * the code under test. Statements are plain arrays of cells.
 *
 * D (F1): four columns headed by quarter-end dates (3/31/2025 … 12/31/2025).
 *    Rent 30,000 and Repairs 1,500 in each: read as four months NOI is
 *    4 x 28,500 = 114,000, and Annualize (x 12 / 4) would say 342,000. */
import { grid, heads } from './t12-period-fixtures.js';

const sum = (xs) => xs.reduce((s, v) => s + v, 0);
/** A statement: heading row, Income part, Expenses part; `inc` and `exp` are [label, ...values]; the Total column is their sum. */
export function statement(months, inc, exp) {
  const line = ([label, ...v]) => [label, ...v, sum(v)];
  return grid([['Account', ...months, 'Total'], ['Income'], ...inc.map(line), ['Expenses'], ...exp.map(line)]);
}
export { grid, heads };

export const quarterEndRows = () => statement(['3/31/2025', '6/30/2025', '9/30/2025', '12/31/2025'], [['Base Rent', 30000, 30000, 30000, 30000]], [['Repairs and Maintenance', 1500, 1500, 1500, 1500]]);

const fill = (n, v) => Array(n).fill(v);
/** `n` copies of `v`, with the zero-based month `at` replaced by `x` (or several: [[at, x], …]). */
const but = (n, v, ...swaps) => { const a = fill(n, v); for (const [at, x] of swaps) a[at] = x; return a; };

/* A: Jan to Dec 2026. Base rent 20,000 a month (EGI 240,000; 0.5% of it is 1,200, so the spike floor is 1,200).
 *    Repairs 400 x 11, Sep 3,000 (7,400); Landscaping 500 x 11, Jun 1,500 (7,000); Pest control 100 x 11, Mar 900 (2,000);
 *    Utilities 2,000 x 11, Jul -600 (21,400); Cleaning 300 x 11, Feb -500.00 (2,800.00); Security 300 x 11, Apr -499.99
 *    (2,800.01); Insurance refund Nov -2,500 only (-2,500); Building repairs 500 x 11, May 48,000 (53,500);
 *    Sign repairs Mar 1,000 and Aug 1,000 (2,000); Permits Oct 900 (900).
 *    Operating expenses 97,300.01; NOI 142,699.99. 1% of the expenses is 973.00.
 *    Spike: Repairs Sep (2,600 over its typical month) and Building repairs May (47,500); not Landscaping (1,500 is
 *    exactly 3 x 500), not Pest control (900 is under the 1,200 floor).
 *    Negative month: Utilities Jul (600) and Cleaning Feb (500.00, exactly the setting); not Security (499.99).
 *    Negative expense line: Insurance refund (2,500).
 *    Large one-off: Building repairs May (48,000 of 53,500 and over 973.00) and Sign repairs Mar (1,000 is exactly half of
 *    2,000, the earlier of two equal months); not Pest control (45%), Repairs (40.5%), Permits (900 is under 973.00).
 *    Marking Building repairs "No": NOI without the one-offs 142,699.99 + 48,000 = 190,699.99. (Excluding the whole line, the
 *    other way to read "No", would give 196,199.99.) */
export const valueRows = () => statement(heads(2026, 1, 12), [['Base Rent', ...fill(12, 20000)]], [
  ['Repairs', ...but(12, 400, [8, 3000])],
  ['Landscaping', ...but(12, 500, [5, 1500])],
  ['Pest control', ...but(12, 100, [2, 900])],
  ['Utilities', ...but(12, 2000, [6, -600])],
  ['Cleaning', ...but(12, 300, [1, -500])],
  ['Security', ...but(12, 300, [3, -499.99])],
  ['Insurance refund', ...but(12, 0, [10, -2500])],
  ['Building repairs', ...but(12, 500, [4, 48000])],
  ['Sign repairs', ...but(12, 0, [2, 1000], [7, 1000])],
  ['Permits', ...but(12, 0, [9, 900])],
]);

/* B: Jan to Jun 2026 (T-6). Rent 20,000; Repairs 500; Real Estate Taxes Apr 12,000 only.
 *    EGI 120,000; expenses 3,000 + 12,000 = 15,000; NOI 105,000. Run rate x 12 / 6 = x 2: EGI 240,000, expenses 30,000,
 *    taxes 24,000, NOI 210,000. Against an OM NOI of 190,000: 20,000 over the larger, 210,000 = 9.5%. */
export const t6Rows = () => statement(heads(2026, 1, 6), [['Base Rent', ...fill(6, 20000)]], [['Repairs', ...fill(6, 500)], ['Real Estate Taxes', ...but(6, 0, [3, 12000])]]);

/* C: 24 months, Jan 2025 to Dec 2026: the second 12 are the T-12, the first 12 the prior period.
 *    Rent 20,000 both years; Repairs 400 then 500 (+25.0%, not over 25); Utilities 1,000 then 1,300 (+30%); Insurance
 *    1,000 both. NOI 2025: 240,000 - 4,800 - 12,000 - 12,000 = 211,200; 2026: 240,000 - 6,000 - 15,600 - 12,000 = 206,400 (-2.3%). */
export const yoyRows = () => statement(heads(2025, 1, 24), [['Base Rent', ...fill(24, 20000)]], [
  ['Repairs', ...fill(12, 400), ...fill(12, 500)], ['Utilities', ...fill(12, 1000), ...fill(12, 1300)], ['Insurance', ...fill(24, 1000)],
]);
/* C2: the same 24 months; rent 10,000 then 16,000, Repairs 2,000 both years. NOI 2025 120,000 - 24,000 = 96,000; 2026
 *     192,000 - 24,000 = 168,000: +75.0%, a change of 72,000. */
export const yoyNoiRows = () => statement(heads(2025, 1, 24), [['Base Rent', ...fill(12, 10000), ...fill(12, 16000)]], [['Repairs', ...fill(24, 2000)]]);
/* C3: 15 months Oct 2024 to Dec 2025, Rent 9,000 in 2024 and 10,000 in 2025: the T-12 is Jan to Dec 2025, the prior Oct to
 *     Dec 2024; like months are Oct to Dec: 27,000 then 30,000 (+11.1%). */
export const yoy15Rows = () => statement(heads(2024, 10, 15), [['Base Rent', ...fill(3, 9000), ...fill(12, 10000)]], [['Repairs', ...fill(15, 500)]]);

/* Q: four columns headed Q1 2025 to Q4 2025 and a Total: no month, so only the Total is read (as one period). */
export const quarterHeadRows = () => grid([['Account', 'Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025', 'Total'], ['Income'], ['Base Rent', 90000, 90000, 90000, 90000, 360000], ['Expenses'], ['Repairs', 3000, 3000, 3000, 3000, 12000]]);

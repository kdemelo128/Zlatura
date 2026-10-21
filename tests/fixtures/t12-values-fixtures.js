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

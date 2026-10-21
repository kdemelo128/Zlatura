/* Invented fixtures for T-12 PR 2 "Suggestions, not choices"
 * (tests/t12-suggest.test.js, tests/e2e/t12sug-flow.mjs). Statement A is a
 * twelve-month CSV; every name and figure is made up.
 *
 * Statement A, worked by hand (Jan to Dec 2026):
 *   Base Rent 10,000 x 12                 = 120,000   income
 *   Pylon Sign Lease 50 x 12              =     600   income; remembered as other income
 *   Real Estate Taxes 1,000 x 12          =  12,000   expense
 *   Roof Replacement Capital, March only  =   2,500   under Expenses
 *   the file states NOI of 106,100
 *   Mortgage Interest 3,000 x 12          =  36,000   after the NOI
 * 4.7.33 filed everything: EGI 120,600, opex 12,000, NOI 108,600, below the
 * line 38,500 (roof and mortgage), nothing open. The stated NOI (106,100)
 * then disagrees by 2,500, the roof. */

import { csvRows } from '../app/sheetread.js';

export const MONTHS_2026 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m) => `${m} 2026`);
const line = (label, each, total, only) => [label, ...MONTHS_2026.map((_, i) => (only === undefined || i === only ? each : 0)), total].join(',');

/** Statement A as CSV text. `extra` lines go in the Income part (after the pylon) as [label, each-month, total]. */
export function arcadeCsv({ extra = [], roof = true } = {}) {
  return [
    ['Invented Arcade Holdings', ...MONTHS_2026.map(() => ''), ''].join(','),
    ['Account', ...MONTHS_2026, 'Total'].join(','),
    'INCOME',
    line('Base Rent', 10000, 120000),
    line('Pylon Sign Lease', 50, 600),
    ...extra.map((x) => line(...x)),
    'OPERATING EXPENSES',
    line('Real Estate Taxes', 1000, 12000),
    ...(roof ? [line('Roof Replacement Capital', 2500, 2500, 2)] : []),
    ['NET OPERATING INCOME', ...MONTHS_2026.map(() => ''), 106100].join(','),
    line('Mortgage Interest', 3000, 36000),
  ].join('\n');
}
export const rowsOf = (csv) => csvRows(csv).map((cells, i) => ({ r: i + 1, cells })).filter((x) => x.cells.some((v) => String(v).trim()));
export const arcadeRows = (opts) => rowsOf(arcadeCsv(opts));

/** What the broker remembered: pylon signs as other income (six deals), once as contract services; the latest choice other income. */
export const PYLON_HISTORY = {
  category: 'otherIncome', at: 1700000007,
  deals: [
    { deal: 'd1', category: 'contract', at: 1700000001 },
    ...['d2', 'd3', 'd4', 'd5', 'd6', 'd7'].map((deal, i) => ({ deal, category: 'otherIncome', at: 1700000002 + i })),
  ],
};
export const labelMemory = () => ({
  corrections: { 'pylon sign lease': 'otherIncome' },
  history: { 'pylon sign lease': PYLON_HISTORY },
});

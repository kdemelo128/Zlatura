/* Invented fixtures for underwriting PR U1 "normalise" (tests/t12-normalise.test.js,
 * tests/tools/make-backup-4.7.36.mjs). Every property, line and figure is made
 * up and worked by hand here, so a test never copies the code under test.
 * Statements are plain arrays of cells (no app import, so the backup script can
 * use them with the old code).
 *
 * U: Jan to Dec 2026. Every line is $0 from January to May, so seven months
 *    (Jun to Dec) have activity: N = 7 once "months with activity" is chosen;
 *    the columns give 12.
 *    Base Rent   10,000 a month Jun to Dec                        total 70,000.00
 *    Parking     1,000.01 in June only                            total  1,000.01
 *    Storage     1,000.01 in December only                        total  1,000.01
 *    Repairs     Jun 400, Jul 420, Aug 0, Sep 3,000, Oct 380, Nov 400, Dec 410
 *                                                                 total  5,010.00
 *    Real Estate Taxes  1,000 Jun to Dec, October 3,500 (1,000 + 2,500)
 *                                                                 total  9,500.00
 *    Legal       1,200.00 in September only                       total  1,200.00
 *    Reported: EGI 72,000.02; expenses 5,010 + 9,500 + 1,200 = 15,710.00;
 *    taxes 9,500.00; NOI 56,290.02.
 *
 *    Repairs, one line by method (N = 7):
 *      reported 5,010.00;  annualise 5,010 x 12 / 7 = 8,588.57 (8,588.571…);
 *      run rate: median(380, 400, 400, 410, 420, 3,000) = (400 + 410) / 2 = 405, x 12 = 4,860.00;
 *      exclude 0 (adjustment 5,010.00); annualise over all 12 columns 5,010.00.
 *    September marked "Recurring? No" (3,000 taken out first):
 *      reported 2,010.00; annualise 2,010 x 12 / 7 = 3,445.71 (3,445.714…);
 *      run rate: median(380, 400, 400, 410, 420) = 400, x 12 = 4,800.00;
 *      exclude 0: the whole 5,010.00 goes in the exclude step, the one-off step is 0.
 *    Wrong ways, each with its own number: the median of all 12 months (six 0s, so
 *      the 6th and 7th sorted values are 0 and 380) is 190, x 12 = 2,280.00; the median
 *      of the 7 active months (Aug's 0 stays in) is 400, x 12 = 4,800.00, which differs
 *      from the right 4,860.00 only where the mark is absent, so it is pinned there.

 *    Taxes: annualise 9,500 x 12 / 7 = 16,285.71 (16,285.714…; "x 12 / N" read
 *      as "/ 12 x N" would give 5,541.67). Run rate: median(1,000 x 6, 3,500) =
 *      1,000, x 12 = 12,000.00.
 *
 *    Bridge (Base Rent, Parking, Storage annualised; Repairs and Taxes run rate;
 *    Legal excluded):
 *      EGI as a group 72,000.02 x 12 / 7 = 123,428.6057… = 123,428.61. Line by line
 *      it would be 120,000.00 + 1,714.30 + 1,714.30 = 123,428.60 (1,000.01 x 12 / 7
 *      = 1,714.3029…), so the residue is -0.01: shown 0.01 below the group figure.
 *      Expenses 4,860 + 12,000 + 0 = 16,860.00; taxes 12,000.00;
 *      NOI 123,428.61 - 16,860.00 = 106,568.61.
 *      Steps on NOI: annualise 123,428.61 - 72,000.02 = +51,428.59;
 *      run rate (4,860 - 5,010) lowers expenses by 150 = +150.00, and
 *      (12,000 - 9,500) raises them by 2,500 = -2,500.00, together -2,350.00;
 *      exclude Legal +1,200.00. Check: 56,290.02 + 51,428.59 - 2,350.00 + 1,200.00
 *      = 106,568.61. With Legal kept: 105,368.61.
 *    Every line annualised over 7: EGI 123,428.61; expenses 15,710 x 12 / 7 =
 *      26,931.43 (26,931.428…); taxes 16,285.71; NOI 96,497.18. */
import { grid, heads, statement } from './t12-values-fixtures.js';

const zeros = (n) => Array(n).fill(0);

/** Statement U, twelve months Jan to Dec 2026. */
export const uRows = () => statement(heads(2026, 1, 12), [
  ['Base Rent', ...zeros(5), ...Array(7).fill(10000)],
  ['Parking', ...zeros(5), 1000.01, ...zeros(6)],
  ['Storage', ...zeros(11), 1000.01],
], [
  ['Repairs', ...zeros(5), 400, 420, 0, 3000, 380, 400, 410],
  ['Real Estate Taxes', ...zeros(5), 1000, 1000, 1000, 1000, 3500, 1000, 1000],
  ['Legal', ...zeros(8), 1200, 0, 0, 0],
]);

/** The labels of U's six lines, in order. */
export const U_LABELS = ['Base Rent', 'Parking', 'Storage', 'Repairs', 'Real Estate Taxes', 'Legal'];

/** Twelve copies of one monthly amount. */
const flat12 = (v) => Array(12).fill(v);

/**
 * C21: a full 12 columns where ONE month (August) is $0 on every line, and the broker has not answered "annualise over which?".
 *   Base Rent 10,000, Repairs 500 in the other eleven. 11 months with activity of 12 columns.
 *   Annualise over 11: 10,000 x 11 x 12 / 11 = 120,000.00; over 12: 110,000.00.
 */
export const c21Rows = () => statement(heads(2026, 1, 12), [
  ['Base Rent', ...flat12(10000).map((v, i) => (i === 7 ? 0 : v))],
], [
  ['Repairs', ...flat12(500).map((v, i) => (i === 7 ? 0 : v))],
]);

/**
 * C20: ONE line is $0 in two months (Repairs in April and August) but another line has activity in both, so every
 *   month is active: N stays 12, nothing is held.
 *   Base Rent 10,000 x 12 = 120,000; Repairs 400 x 10 = 4,000.
 *   Annualise (x 12 / 12): the same 120,000 and 4,000.
 */
export const c20Rows = () => statement(heads(2026, 1, 12), [
  ['Base Rent', ...flat12(10000)],
], [
  ['Repairs', ...flat12(400).map((v, i) => (i === 3 || i === 7 ? 0 : v))],
]);

export { grid, heads };

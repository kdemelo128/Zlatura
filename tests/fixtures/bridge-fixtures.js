/* Invented fixtures for the T-12 to pro forma bridge (tests/bridge.test.js). Every property, line and figure is
 * made up and worked by hand here, so a test never copies the code under test.
 *
 * T-12 (Jan to Dec 2026, a flat amount each month):
 *   Base Rent 10,000.00 a month                 120,000.00     Real Estate Taxes 1,500.00     18,000.00
 *   Parking 250.25                                3,003.00     Insurance 308.34                3,700.08
 *   Laundry Income 100.01                         1,200.12     Repairs 500.50                  6,006.00
 *                                                              Payroll 800.00                  9,600.00
 *                                                              Utilities 400.40                4,804.80
 *   EGI 124,203.12; expenses 42,110.88; NOI 82,092.24.
 *
 * The OM's Pro Forma column (it prints no parking line, and a Payroll line with a blank Pro Forma cell; its Actual column has the T-12's EGI and NOI):
 *   Gross Potential Rent 126,000.00; Vacancy & Credit Loss (6,300.00); Other Income 1,500.50; EGI 121,200.50
 *   Real Estate Taxes 19,000.00; Insurance 3,700.08; Repairs & Maintenance 6,500.00; Utilities 4,900.40;
 *   Total Operating Expenses 34,100.48; NOI 87,100.02.
 *
 * The bridge, one step per category (income p - t, expense -(p - t)):
 *   Base rent                 126,000.00 - 120,000.00                     +6,000.00
 *   Vacancy and credit loss   -6,300.00 - 0 (only in the pro forma)       -6,300.00
 *   Parking                   0 - 3,003.00 (only in the T-12)             -3,003.00
 *   Other income              1,500.50 - 1,200.12                           +300.38
 *   Real estate taxes         -(19,000.00 - 18,000.00)                    -1,000.00
 *   Utilities                 -(4,900.40 - 4,804.80)                         -95.60
 *   Repairs and maintenance   -(6,500.00 - 6,006.00)                        -494.00
 *   Payroll                   -(0 - 9,600.00) (only in the T-12)          +9,600.00
 *   Insurance                 3,700.08 both sides                               0.00  (No change)
 *   Steps add up to +5,007.78: 82,092.24 + 5,007.78 = 87,100.02. */
import { statement, heads } from './t12-values-fixtures.js';

const fill = (n, v) => Array(n).fill(v);

/** The T-12 above. `months` of it (12 by default). */
export const t12Rows = (months = 12) => statement(heads(2026, 1, months), [
  ['Base Rent', ...fill(months, 10000)],
  ['Parking', ...fill(months, 250.25)],
  ['Laundry Income', ...fill(months, 100.01)],
], [
  ['Real Estate Taxes', ...fill(months, 1500)],
  ['Insurance', ...fill(months, 308.34)],
  ['Repairs', ...fill(months, 500.5)],
  ['Payroll', ...fill(months, 800)],
  ['Utilities', ...fill(months, 400.4)],
]);

const pad = (label, ...vals) => `  ${label.padEnd(34)}${vals.map((v) => String(v).padStart(14)).join('')}`;
/** An OM page: a title, an optional scale note, the column headings and the rows ([label, ...cells]; '' is a blank line). */
export const omPage = (rows, { title = 'Operating Statement', heads: hs = ['Actual', 'Pro Forma'], note = '' } = {}) =>
  `${title}${note ? `\n${note}` : ''}\n\n${' '.repeat(36)}${hs.map((v) => String(v).padStart(14)).join('')}\n\n${rows.map((r) => (r === '' ? '' : pad(...r))).join('\n')}`;

/** The OM's statement above: its Actual column adds up to the T-12's EGI and NOI (parking inside its rent), Pro Forma is the column bridged to. */
export const omRows = () => [
  ['Gross Potential Rent', '$123,003.00', '$126,000.00'],
  ['Vacancy & Credit Loss', '$0.00', '($6,300.00)'],
  ['Other Income', '$1,200.12', '$1,500.50'],
  ['Effective Gross Income', '$124,203.12', '$121,200.50'], '',
  ['Real Estate Taxes', '$18,000.00', '$19,000.00'],
  ['Insurance', '$3,700.08', '$3,700.08'],
  ['Repairs & Maintenance', '$6,006.00', '$6,500.00'],
  ['Utilities', '$4,804.80', '$4,900.40'],
  ['Payroll', '$9,600.00'],                      // printed in the Actual column only: the Pro Forma cell is blank
  ['Total Operating Expenses', '$42,110.88', '$34,100.48'],
  ['Net Operating Income', '$82,092.24', '$87,100.02'],
];

/* OM B, one Pro Forma column, to go with statement U (tests/fixtures/t12-normalise-fixtures.js), N = 7:
 *   Gross Potential Rent 125,000.00; Parking Income 2,000.00; Other Income 1,500.00; EGI 128,500.00
 *   Repairs & Maintenance 5,000.00; Real Estate Taxes 12,500.00; Total Operating Expenses 17,500.00; NOI 111,000.00.
 * U with Base Rent, Parking and Storage annualised, Repairs and Taxes typical month x 12, Legal excluded is 106,568.61
 * (as that file works it), its lines 120,000.00 + 1,714.30 + 1,714.30 - 4,860.00 - 12,000.00 = 106,568.60: a rounding row of -0.01.
 *   Base rent 125,000.00 - 120,000.00 = +5,000.00; Parking 2,000.00 - 1,714.30 = +285.70; Other income 1,500.00 - 1,714.30 = -214.30
 *   Taxes -(12,500.00 - 12,000.00) = -500.00; Repairs -(5,000.00 - 4,860.00) = -140.00; Legal 0 and 0: no change.
 *   Steps +4,431.40; 106,568.61 - 0.01 + 4,431.40 = 111,000.00. */
export const omBRows = () => [
  ['Gross Potential Rent', '$125,000.00'], ['Parking Income', '$2,000.00'], ['Other Income', '$1,500.00'], ['Effective Gross Income', '$128,500.00'], '',
  ['Repairs & Maintenance', '$5,000.00'], ['Real Estate Taxes', '$12,500.00'], ['Total Operating Expenses', '$17,500.00'], ['Net Operating Income', '$111,000.00'],
];

/* OM T, printed in thousands ("$ in 000s"), one Pro Forma column. Every figure is rounded to $1,000, and the NOI is
 * printed 88 where its lines give 87 (within the rounding a printed unit allows):
 *   Gross Potential Rent 126; Vacancy (6); Other Income 2; EGI 122; Taxes 19; Insurance 4; Repairs 7; Utilities 5; expenses 35; NOI 88.
 * Against the T-12 above (all as reported): Base rent +6,000.00; Vacancy -6,000.00; Parking -3,003.00; Other income 2,000.00 - 1,200.12
 * = +799.88; Taxes -1,000.00; Insurance -(4,000.00 - 3,700.08) = -299.92; Repairs -(7,000.00 - 6,006.00) = -994.00;
 * Utilities -(5,000.00 - 4,804.80) = -195.20; Payroll +9,600.00. Steps +4,907.76 (87,000.00 - 82,092.24);
 * the OM's printed NOI against its lines 88,000.00 - 87,000.00 = +1,000.00; 82,092.24 + 4,907.76 + 1,000.00 = 88,000.00. */
export const omThousandsRows = () => [
  ['Gross Potential Rent', '$126'], ['Vacancy & Credit Loss', '($6)'], ['Other Income', '$2'], ['Effective Gross Income', '$122'], '',
  ['Real Estate Taxes', '$19'], ['Insurance', '$4'], ['Repairs & Maintenance', '$7'], ['Utilities', '$5'], ['Total Operating Expenses', '$35'], ['Net Operating Income', '$88'],
];

/* OM S: income printed as two lines and an EGI they do not add up to, so EGI is taken as printed (a summary):
 *   Rental Income 100,000.00; Other Income 5,000.00; EGI 120,000.00; Taxes 10,000.00; Insurance 3,000.00; Repairs 4,000.00; expenses 17,000.00; NOI 103,000.00. */
export const omStatedRows = () => [
  ['Rental Income', '$100,000.00'], ['Other Income', '$5,000.00'], ['Effective Gross Income', '$120,000.00'], '',
  ['Real Estate Taxes', '$10,000.00'], ['Insurance', '$3,000.00'], ['Repairs & Maintenance', '$4,000.00'], ['Total Operating Expenses', '$17,000.00'], ['Net Operating Income', '$103,000.00'],
];

/** OM 1 with a line the T-12's categories do not know ("Tenant Sundry Receipts" 800.00), so it is filed only by its place: EGI 122,000.50, NOI 87,900.02. */
export const omUnmatchedRows = () => {
  const r = omRows();
  r.splice(3, 0, ['Tenant Sundry Receipts', '$0.00', '$800.00']);
  r[4] = ['Effective Gross Income', '$124,203.12', '$122,000.50'];
  r[r.length - 1] = ['Net Operating Income', '$82,092.24', '$87,900.02'];
  return r;
};

/* Invented property tax bills, utility bills and unit mix tables for tests/factsread.test.js, the browser flows and
 * tests/tools/factsfiles.mjs, in several layouts: clean text lines, a table (words left, figures right, as a PDF
 * prints it), a workbook's grids, and (browser only) a scanned picture. Every name, parcel, account and figure is made up. */

/** Positioned text (tests/rr-fixtures.js pdfOf): label at the left, value at the right, one row per pair. */
export function pairsPage(title, pairs, { size = 9, x = 60, vx = 330, y0 = 730, step = 16 } = {}) {
  const items = [{ x, y: y0 + 24, s: title, size: 14, bold: true }];
  pairs.forEach(([k, v], i) => { items.push({ x, y: y0 - i * step, s: k, size }); if (v !== '' && v !== undefined) items.push({ x: vx, y: y0 - i * step, s: v, size }); });
  return items;
}
/** A grid table page: header cells at columns, rows of cells at the same columns. */
export function gridPage(title, header, rows, { size = 8.5, x0 = 50, widths = [150, 70, 80, 140, 140], y0 = 720, step = 15 } = {}) {
  const at = (j) => x0 + widths.slice(0, j).reduce((s, w) => s + w, 0);
  const items = [{ x: x0, y: y0 + 26, s: title, size: 14, bold: true }];
  [header, ...rows].forEach((r, i) => r.forEach((c, j) => { if (c !== '') items.push({ x: at(j), y: y0 - i * step, s: String(c), size, bold: i === 0 }); }));
  return items;
}

/* ---------------------------------------------------------------- property tax bills */
export const TAX = {
  clean: ['EXAMPLEVILLE COUNTY TREASURER\nReal Estate Tax Bill\nBill Date 10/15/2025\nTax Year 2025\nParcel ID: 14-0207-338\nProperty: 100 Sample Street\nAssessed Value Land   $120,000.00\nAssessed Value Improvements   $380,000.00\nTotal Assessed Value   $500,000.00\nTax Rate 1.92%\nTotal Tax   $9,600.00\n1st Half Installment   $4,800.00   Due 11/01/2025\n2nd Half Installment   $4,800.00   Due 05/01/2026\nMake checks payable to the County Treasurer'],
  // the same bill, a table
  tablePairs: [['Tax Year', '2025'], ['Parcel Number', '14-0207-338'], ['Bill Date', '10/15/2025'], ['Assessed Value', '$500,000.00'], ['Total Taxes', '$9,600.00'], ['First Half Installment Due 11/01/2025', '$4,800.00'], ['Second Half Installment Due 05/01/2026', '$4,800.00']],
  // installments only, no total for the year printed
  noTotal: ['COUNTY TREASURER\nProperty Tax Statement\nBill Date 10/15/2025\nTax Year 2025\nParcel: 22-0881-004\nAssessed Value  $250,000.00\n1st Half   $2,400.00   Due 11/01/2025\n2nd Half   $2,400.00   Due 05/01/2026'],
  // the second half's bill: one installment shown, and the total due is that installment
  secondHalf: ['COUNTY TREASURER\nSecond Half Tax Notice\nBill Date 04/15/2026\nTax Year 2025\nParcel ID: 14-0207-338\nAssessed Value  $500,000.00\n2nd Half Installment   $4,800.00   Due 05/01/2026\nTotal Tax Due   $4,800.00'],
  conflict: ['COUNTY TREASURER\nTax Statement\nBill Date 10/15/2025\nTax Year 2025\nParcel ID: 31-1000-210\nTotal Tax   $9,600.00\n1st Half   $4,000.00   Due 11/01/2025\n2nd Half   $4,000.00   Due 05/01/2026'],
  twoYears: ['COUNTY TREASURER\nTax Statement\nBill Date 10/15/2025\nTax Year 2025\nPrior Tax Year 2024\nParcel ID: 31-1000-210\nTotal Tax   $9,600.00'],
  dueOnly: ['COUNTY TREASURER\nTax Notice\nBill Date 10/15/2025\nTax Year 2025\nParcel ID: 31-1000-210\nTotal Tax Due   $7,250.00'],
  // dates that could be month-day or day-month, and nothing else to say which
  dates: ['COUNTY TREASURER\nTax Statement\nTax Year 2025\nParcel ID: 31-1000-210\nTotal Tax   $9,600.00\n1st Half   $4,800.00   Due 03/04/2026\n2nd Half   $4,800.00   Due 09/04/2026'],
  grids: [{ sheet: 'Tax bill', rows: [['Tax Year', '2025'], ['Parcel ID', '14-0207-338'], ['Bill Date', '10/15/2025'], ['Total Assessed Value', '$500,000.00'], ['Total Tax', '$9,600.00'], ['1st Half Installment', '$4,800.00', 'Due 11/01/2025'], ['2nd Half Installment', '$4,800.00', 'Due 05/01/2026']].map((cells, i) => ({ r: i + 1, cells })) }],
};

/* ---------------------------------------------------------------- utility bills */
export const UTIL = {
  electric: ['Example Power & Light\nElectric Service Statement\nAccount Number: 55-1234-0007\nService Period: 02/03/2026 - 03/05/2026\nStatement Date: 03/10/2026\nMeter Usage: 14,820 kWh\nPrevious Balance   $0.00\nCurrent Charges   $2,310.45\nTotal Amount Due   $2,310.45\nDue Date: 03/31/2026'],
  electricPairs: [['Account Number', '55-1234-0007'], ['Service Period', '02/03/2026 - 03/05/2026'], ['Statement Date', '03/10/2026'], ['Electric Usage', '14,820 kWh'], ['Current Charges', '$2,310.45'], ['Amount Due', '$2,310.45'], ['Due Date', '03/31/2026']],
  // a bimonthly bill: the period is two months and so is the amount
  twoMonth: ['Sample Water Authority\nWater and Sewer Bill\nAccount Number: 88-0042\nBilling Period: 01/15/2026 to 03/16/2026\nStatement Date: 03/20/2026\nTotal Usage: 218 CCF\nCurrent Charges   $4,120.00\nTotal Amount Due   $4,120.00'],
  // dates that could be either order
  ambiguousDates: ['Sample Gas Company\nNatural Gas Statement\nService Period: 03/04/2026 - 05/04/2026\nUsage: 1,980 therms\nCurrent Charges   $2,015.20'],
  // an amount due that carries an earlier balance, and a usage with no unit
  pastDue: ['Sample Electric\nElectric Bill\nService Period: 02/03/2026 - 03/05/2026\nStatement Date: 03/25/2026\nUsage: 1,240\nPrevious Balance   $410.00\nTotal Amount Due   $2,730.40'],
  grids: [{ sheet: 'Utility', rows: [['Electric Service Statement'], ['Service Period', '02/03/2026', '03/05/2026'], ['Statement Date', '03/10/2026'], ['Usage', '14,820 kWh'], ['Current Charges', '$2,310.45'], ['Due Date', '03/31/2026']].map((cells, i) => ({ r: i + 1, cells })) }],
};
// "Service Period" with its two dates on separate cells: the reader joins the row, so the dates are found

/* ---------------------------------------------------------------- unit mix */
export const MIX = {
  header: ['Unit Type', '# Units', 'Avg SF', 'In-Place Rent (Monthly)', 'Market Rent (Monthly)'],
  rows: [['Studio', '10', '450', '$1,100', '$1,200'], ['1 Bed / 1 Bath', '24', '650', '$1,350', '$1,425'], ['2 Bed / 2 Bath', '16', '900', '$1,700', '$1,800']],
  total: ['Total', '50', '', '', ''],
  // no wording about monthly or annual, one plain "SF"
  plainHeader: ['Unit Type', 'Units', 'SF', 'In-Place Rent', 'Market Rent'],
  totalSf: ['Total / Average', '50', '34,500', '', ''],
  oneRent: ['Unit Type', '# Units', 'SF', 'Rent'],
  oneRentRows: [['Studio', '10', '450', '$1,100'], ['1 Bed / 1 Bath', '24', '650', '$1,350']],
};

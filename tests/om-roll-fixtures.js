/* Invented OMs for the OM rent roll fixes (app/omroll.js): a multifamily roll with no tenant column, other wordings for the
 * tenant column, a roll that runs over many pages, a header on a later page, rows in another font size, cells that
 * merge when the text is turned into lines. Page items for pdfOf (tests/rr-fixtures.js). Every name and figure is made up. */
import { pdfOf } from './rr-fixtures.js';

const summary = () => [{ x: 40, y: 740, s: 'Investment Summary', size: 14, bold: true }, ...[['Asking Price', '$4,200,000'], ['Units', '12']].flatMap(([k, v], i) => [{ x: 40, y: 700 - i * 16, s: k, size: 10 }, { x: 300, y: 700 - i * 16, s: v, right: true, size: 10 }])];
const prose = () => ['Market Overview', 'The submarket is a stable neighbourhood with steady demand, a mix of local employers and good access', 'from two arterial roads. Several recent lease signings nearby show healthy demand for apartments, and the', 'surrounding blocks are fully built out with little new competing supply.'].map((t, i) => ({ x: 40, y: 740 - i * 14, s: t, size: i ? 8 : 14, bold: !i }));

/** A table: cols [label, x, right]; rows are arrays aligned to cols; y0 the header's line; step the row spacing. */
export function grid({ cols, rows, y0 = 700, title = 'Rent Roll', header = true, size = 7, step = 14, total = null, hsize = size }) {
  const it = [];
  if (title) it.push({ x: 40, y: y0 + 30, s: title, size: 14, bold: true });
  if (header) cols.forEach((c) => it.push({ x: c[1], y: y0, s: c[0], right: !!c[2], bold: true, size: hsize }));
  const body = total ? [...rows, total] : rows;
  body.forEach((r, n) => cols.forEach((c, k) => { if (r[k]) it.push({ x: c[1], y: y0 - 16 - n * step, s: r[k], right: !!c[2], size }); }));
  return it;
}

/* the multifamily roll: units, no tenant names */
export const MF_COLS = [['Unit', 40, 0], ['Unit Type', 80, 0], ['Beds/Baths', 150, 0], ['SF', 250, 1], ['Market Rent', 310, 1], ['Current Rent', 370, 1], ['Lease Start', 385, 0], ['Lease End', 450, 0], ['Status', 515, 0]];
export const MF_ROWS = [
  ['101', 'A1', '1/1', '650', '$1,250', '$1,200', '02/01/2025', '01/31/2026', 'Occupied'],
  ['102', 'A1', '1/1', '650', '$1,250', '$1,225', '06/01/2025', '05/31/2026', 'Occupied'],
  ['103', 'B2', '2/2', '910', '$1,650', '$1,575', '09/01/2024', '08/31/2025', 'Occupied'],
  ['104', 'B2', '2/2', '910', '$1,650', '', '', '', 'Vacant'],
  ['105', 'C3', '3/2', '1,150', '$2,050', '$1,990', '03/15/2025', '03/14/2026', 'Occupied'],
  ['106', 'A1', '1/1', '650', '$1,250', '$1,210', '11/01/2025', '10/31/2026', 'Occupied'],
];

/* ---- the tenant column under other names ---- */
const SUITE_COLS = (tenant) => [['Suite', 40, 0], [tenant, 80, 0], ['SF', 250, 1], ['Lease Start', 265, 0], ['Lease End', 325, 0], ['Annual Rent', 430, 1]];
export const SUITE_ROWS = [
  ['101', 'Maple Leaf Bakery', '2,000', '01/01/2021', '12/31/2030', '$60,000'],
  ['102', 'Quillfeather Books', '1,500', '06/01/2022', '05/31/2027', '$42,000'],
  ['103', 'Copperline Yoga', '1,200', '03/01/2023', '02/28/2033', '$36,000'],
  ['104', 'Bluefin Sushi Bar', '1,800', '09/01/2020', '08/31/2028', '$54,000'],
];
export const tenantWord = (word) => [summary(), grid({ cols: SUITE_COLS(word), rows: SUITE_ROWS })];

/* ---- a suite roll with no tenant column at all: only a Suite and the lease ---- */
export const suiteOnly = () => [summary(), grid({ cols: [['Suite', 40, 0], ['SF', 250, 1], ['Lease Start', 265, 0], ['Lease End', 325, 0], ['Annual Rent', 430, 1]], rows: SUITE_ROWS.map((r) => [r[0], r[2], r[3], r[4], r[5]]) })];

/* ---- a long multifamily roll over many pages ---- */
const fmt = (n) => n.toLocaleString('en-US');
export const UNIT_ROWS = Array.from({ length: 66 }, (_, i) => {
  const sf = [650, 650, 910, 1150][i % 4]; const rent = [1200, 1225, 1575, 1990][i % 4] + (i % 7) * 5;
  return [String(101 + i), ['A1', 'A1', 'B2', 'C3'][i % 4], ['1/1', '1/1', '2/2', '3/2'][i % 4], fmt(sf), '$' + fmt(rent + 50), '$' + fmt(rent), '02/01/2025', '01/31/2026', 'Occupied'];
});
const PER = 11;
/** The multifamily roll over `pages` pages after a summary page: `mode` 'repeat' (the header on each page), 'bare' (the header on
 * the first page only), 'gaps' (rows in groups with whitespace between). Every page has a three-cell running head and a footer. */
export function longRoll({ pages = 6, mode = 'repeat', total = true } = {}) {
  const out = [summary()];
  for (let p = 0; p < pages; p++) {
    const rows = UNIT_ROWS.slice(p * PER, (p + 1) * PER);
    const last = p === pages - 1;
    const it = [{ x: 40, y: 770, s: 'Riverside Court', size: 8 }, { x: 300, y: 770, s: 'Rent Roll', size: 8 }, { x: 540, y: 770, s: 'Page ' + (p + 2) + ' of ' + (pages + 1), right: true, size: 8 }];
    const sumSf = UNIT_ROWS.slice(0, pages * PER).reduce((s, r) => s + Number(r[3].replace(',', '')), 0);
    it.push(...grid({ cols: MF_COLS, rows, y0: 730, title: '', header: p === 0 || mode === 'repeat', step: mode === 'gaps' ? 18 : 14,
      total: last && total ? ['Total', '', '', fmt(sumSf), '', '', '', '', ''] : null }));
    it.push({ x: 40, y: 30, s: 'Confidential', size: 7 }, { x: 300, y: 30, s: 'Not for distribution', size: 7 });
    out.push(it);
  }
  return out;
}

/* ---- tables that are not a rent roll and must stay unread ---- */
/** A unit mix: types, not units: no lease dates, no status. */
export const unitMix = () => [summary(), prose(), grid({ title: 'Unit Mix', cols: [['Unit Type', 40, 0], ['Units', 150, 1], ['Avg SF', 230, 1], ['Market Rent', 330, 1], ['Rent PSF', 430, 1]],
  rows: [['A1 1 Bed / 1 Bath', '24', '650', '$1,250', '$1.92'], ['B2 2 Bed / 2 Bath', '30', '910', '$1,650', '$1.81'], ['C3 3 Bed / 2 Bath', '12', '1,150', '$2,050', '$1.78']] })];
/** Comparable properties: a "Unit" column and rents, no lease dates. */
export const compsTable = () => [summary(), prose(), grid({ title: 'Rent Comparables', cols: [['Unit', 40, 0], ['Beds', 120, 0], ['SF', 200, 1], ['Rent', 280, 1], ['Rent/SF', 360, 1]],
  rows: [['Oak Terrace 1', '1', '640', '$1,300', '$2.03'], ['Oak Terrace 2', '2', '900', '$1,700', '$1.89'], ['Pine Row 3', '2', '925', '$1,725', '$1.86']] })];

/* ---- a roll whose later pages are a different size, and a label over figures aligned far from it ---- */
const MORE = [['105', 'Harrow Tailors', '1,000', '02/01/2024', '01/31/2029', '$32,000'], ['106', 'Dune Pharmacy', '1,500', '09/01/2020', '08/31/2028', '$45,000'], ['107', 'Elm Street Cafe', '900', '09/01/2020', '08/31/2028', '$27,000']];
export const sizeDrift = () => [summary(), grid({ cols: SUITE_COLS('Tenant'), rows: SUITE_ROWS }), grid({ cols: SUITE_COLS('Tenant'), rows: MORE, header: false, title: '', size: 6, y0: 740 })];
const WIDE = [['Suite', 40, 0], ['Tenant', 80, 0], ['SF', 180, 0], ['Lease End', 330, 0], ['Annual Rent', 430, 0]];
/** Headings left-aligned, figures right-aligned a long way from them: SF under 'SF' at 80 points, rent under 'Annual Rent' at 110. */
export function wideFigures({ blankDates = false } = {}) {
  const g = grid({ cols: WIDE, rows: SUITE_ROWS.map((r) => [r[0], r[1], r[2], blankDates ? '' : r[4], r[5]]) });
  return [summary(), g.map((it) => (it.y < 700 && it.x === 180 ? { ...it, x: 290, right: true } : it.y < 700 && it.x === 430 ? { ...it, x: 540, right: true } : it))];
}
/** Dates and rent, but no unit, suite or tenant: nothing to key a row by. */
export const noKey = () => [summary(), grid({ cols: [['SF', 250, 1], ['Lease Start', 265, 0], ['Lease End', 325, 0], ['Annual Rent', 430, 1]], rows: SUITE_ROWS.map((r) => [r[2], r[3], r[4], r[5]]) })];

/* ---- tight columns: items a hair apart, so the text has them in one cell ---- */
const TIGHT = [['Suite', 40, 0], ['Tenant', 80, 0], ['SF', 250, 1], ['Lease Start', 265, 0], ['Lease End', 313, 0], ['Annual Rent', 430, 1]];
/** The header's "Lease Start" and "Lease End" 2 points apart (one cell in the text), the rows' dates apart. */
export const tightHeader = () => [summary(), grid({ cols: TIGHT, rows: SUITE_ROWS })];
/** Tenant names that run right up to the SF figure: "Quillfeather Books Gift Shop 1,500" in one cell. */
const LONG_NAMES = [['101', 'Maple Leaf Bakery and Cafe Co', '2,000', '01/01/2021', '12/31/2030', '$60,000'], ['102', 'Quillfeather Books Gift Shop', '1,500', '06/01/2022', '05/31/2027', '$42,000'],
  ['103', 'Copperline Yoga Studios Inc', '1,200', '03/01/2023', '02/28/2033', '$36,000'], ['104', 'Bluefin Sushi Bar and Grill', '1,800', '09/01/2020', '08/31/2028', '$54,000']];
export function tightRows() {
  const g = grid({ cols: SUITE_COLS('Tenant'), rows: LONG_NAMES });
  // the SF figure starts 2 points after the name ends (4.2 points a character at 7 pt)
  return [summary(), g.map((it) => { const n = LONG_NAMES.find((r) => r[1] === it.s); return n ? it : it; }).map((it) => {
    if (it.y < 700 && it.right && it.x === 250) { const n = LONG_NAMES.find((r) => r[2] === it.s); const end = 80 + n[1].length * 4.2 + 2; return { ...it, x: end, right: false }; }
    return it;
  })];
}

/* ---- a roll over several pages, in the ways it breaks ---- */
const RETAIL_COLS = SUITE_COLS('Tenant');
const RETAIL_ROWS = UNIT_ROWS.map((r, i) => [String(100 + i), 'Tenant ' + String.fromCharCode(65 + (i % 26)) + ' Shop', r[3], '01/01/2021', '12/31/2030', r[5]]);
const num = (s) => Number(String(s).replace(/[$,]/g, ''));
/** Groups of four rows with fifty points of white space between groups, on one page; `heading` puts "Building B" in each gap. */
export function gapped({ heading = false, groups = 3 } = {}) {
  const it = [{ x: 40, y: 730, s: 'Rent Roll', size: 14, bold: true }];
  RETAIL_COLS.forEach((c) => it.push({ x: c[1], y: 700, s: c[0], right: !!c[2], bold: true, size: 7 }));
  let y = 684;
  for (let g = 0; g < groups; g++) {
    if (g && heading) it.push({ x: 40, y: y - 20, s: 'Building ' + 'BCDEF'[g - 1], size: 7, bold: true });
    for (let k = 0; k < 4; k++) { const r = RETAIL_ROWS[g * 4 + k]; RETAIL_COLS.forEach((c, ci) => it.push({ x: c[1], y, s: r[ci], right: !!c[2], size: 7 })); y -= 14; }
    y -= 50;
  }
  return [summary(), it];
}
/** Four pages of six rows, the header on each, and a Total row at the foot of each: its own page's rows, or (running) every row so far. */
export function pageTotals({ running = false, pages = 4 } = {}) {
  const out = [summary()];
  for (let p = 0; p < pages; p++) {
    const rows = RETAIL_ROWS.slice(p * 6, p * 6 + 6);
    const upto = running ? RETAIL_ROWS.slice(0, p * 6 + 6) : rows;
    const sf = upto.reduce((s, r) => s + num(r[2]), 0); const rent = upto.reduce((s, r) => s + num(r[5]), 0);
    out.push(grid({ cols: RETAIL_COLS, rows, y0: 730, title: '', total: ['', 'Total', fmt(sf), '', '', '$' + fmt(rent)] }));
  }
  return out;
}
/** Twelve rows over two pages, the second page's header with a column left out ("Rent Roll (continued)"). */
export const continuedHeader = () => [summary(), grid({ cols: RETAIL_COLS, rows: RETAIL_ROWS.slice(0, 6) }),
  grid({ cols: RETAIL_COLS.filter((c) => c[0] !== 'Lease Start'), rows: RETAIL_ROWS.slice(6, 12).map((r) => [r[0], r[1], r[2], r[4], r[5]]), title: 'Rent Roll (continued)', y0: 730 })];
/** The same two pages with "$" in a cell of its own left of each rent (accounting style), the second page with no header. */
export function accounting2() {
  const dollars = (g) => g.flatMap((it) => (it.right && it.x === 430 && /^\$/.test(it.s) ? [{ x: 392, y: it.y, s: '$', size: 7 }, { ...it, s: it.s.replace('$', '') }] : [it]));
  return [summary(), dollars(grid({ cols: RETAIL_COLS, rows: SUITE_ROWS.slice(0, 2) })), dollars(grid({ cols: RETAIL_COLS, rows: SUITE_ROWS.slice(2), header: false, title: '', y0: 740 }))];
}
/** The multifamily roll with a Total row whose rent is a year's, over a rent column that does not say its period. */
export const mfTotal = (rent) => [grid({ cols: MF_COLS, rows: MF_ROWS, total: ['Total', '', '', '4,920', '', '', '', '', ''].map((v, i) => (i === 5 ? rent : v)) })];

/* ---- a table with a sidebar of text beside it, on lines of its own between the rows ---- */
const HALF = [['Suite', 40, 0], ['Tenant', 75, 0], ['SF', 215, 1], ['Lease End', 225, 0], ['Annual Rent', 355, 1]];
/** `heading`: the sidebar's title sits on the header's line (a header cell the reader has no use for); else it starts below the header. */
export function sidebar({ heading = true, numbers = false } = {}) {
  const t = grid({ cols: HALF, rows: SUITE_ROWS.map((r) => [r[0], r[1], r[2], r[4], r[5]]) });
  const words = numbers ? ['Built 1998', 'Parking 4.1 per 1,000', 'Zoning C2', 'Lot 1.2 acres', 'Taxes $12,400', 'Year 3'] : ['Highlights', 'Leased 90 percent to local tenants', 'Long weighted average term', 'Strong in place rents', 'Corner location', 'Recent roof'];
  return [summary(), [...t, ...words.slice(heading ? 0 : 1).map((s, i) => ({ x: 385, y: (heading ? 700 : 686) - i * 14, s, size: 7 }))]];
}

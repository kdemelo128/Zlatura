/* Invented OMs for the OM diagnostic (tests/tools/om-diag.mjs): each is page items for pdfOf (tests/rr-fixtures.js), made to
 * hit one reason code. Every name and figure is made up. */
import { pdfOf } from './rr-fixtures.js';

const TEXT = ['Market Overview', 'The submarket is a stable neighbourhood retail corridor with steady foot traffic, a mix of local', 'tenants and good access from two arterial roads. Several recent lease signings nearby show healthy demand', 'for small-shop space, and the surrounding blocks are fully built out with little new competing supply.'];
export const prose = () => TEXT.map((t, i) => ({ x: 40, y: 740 - i * 14, s: t, size: i ? 8 : 14, bold: !i }));
const summary = () => [{ x: 40, y: 740, s: 'Investment Summary', size: 14, bold: true }, ...[['Asking Price', '$3,100,000'], ['Building Size', '9,000 SF']].flatMap(([k, v], i) => [{ x: 40, y: 700 - i * 16, s: k, size: 10 }, { x: 300, y: 700 - i * 16, s: v, right: true, size: 10 }])];

/** The full column set; each column is [label, x, right-aligned]. */
const FULL = [['Suite', 40, 0], ['Tenant', 80, 0], ['SF', 250, 1], ['Lease Start', 265, 0], ['Lease End', 325, 0], ['Annual Rent', 430, 1], ['Rent/SF', 480, 1], ['Monthly', 540, 1], ['Rent', 430, 1]];
const ROWS = [
  ['101', 'Maple Leaf Bakery', '2,000', '01/01/2021', '12/31/2030', '$60,000', '$30.00', '$5,000'],
  ['102', 'Quillfeather Books', '1,500', '06/01/2022', '05/31/2027', '$42,000', '$28.00', '$3,500'],
  ['103', 'Copperline Yoga', '1,200', '03/01/2023', '02/28/2033', '$36,000', '$30.00', '$3,000'],
  ['104', 'Bluefin Sushi Bar', '1,800', '09/01/2020', '08/31/2028', '$54,000', '$30.00', '$4,500'],
];
const total = ['', 'Total', '6,500', '', '', '$192,000', '', ''];

/** A table at y0: a heading, the header cells (columns by index into `cols`), the body rows, optionally a total. */
export function table({ cols = FULL.slice(0, 8), rows = ROWS, y0 = 700, title = 'Rent Roll', head = null, withTotal = true, shift = 0, noHeader = false } = {}) {
  const idx = cols.map((c) => FULL.findIndex((f) => f[0] === c[0] || f === c)).map((i, k) => (i < 0 ? k : i));
  const it = [];
  if (title) it.push({ x: 40, y: y0 + 30, s: title, size: 14, bold: true });
  if (!noHeader) (head || cols).forEach((c, k) => it.push({ x: c[1] + shift, y: y0, s: c[0], right: !!c[2], bold: true, size: 7 }));
  const body = withTotal ? [...rows, total] : rows;
  body.forEach((r, n) => cols.forEach((c, k) => { const v = r[FULL.findIndex((f) => f[0] === c[0])]; if (v) it.push({ x: c[1] + shift, y: y0 - 16 - n * 14, s: v, right: !!c[2], size: 7 }); }));
  return it;
}
const col = (...names) => names.map((n) => FULL.find((f) => f[0] === n));

export const FIXTURES = {
  // a roll on page 2, the plain case: no reason
  plain: () => [summary(), table({})],
  // every page has text except a scan of the roll
  scannedRoll: () => [summary(), prose(), { scan: [] }],
  // all pages scanned
  allScanned: () => [{ scan: [] }, { scan: [] }],
  // a roll that carries on to page 3 with no header
  split: () => [summary(), table({ rows: ROWS.slice(0, 2), withTotal: false, y0: 400 }), table({ rows: ROWS.slice(2), noHeader: true, title: '', y0: 750 })],
  // the second page's rows sit 90 points to the right of the header's columns: not the same table
  splitUnread: () => [summary(), table({ rows: ROWS.slice(0, 2), withTotal: false, y0: 400 }), table({ rows: ROWS.slice(2), noHeader: true, title: '', y0: 750, shift: 90, withTotal: false })],
  // header words run together
  joined: () => [summary(), table({ head: FULL.slice(0, 8).map(([h, x, r]) => [h.replace(/ /g, ''), x, r]) })],
  // a two-row header: "Annual" over "Rent", the other labels on the first line only
  twoRow: () => {
    const t = table({});
    const rent = t.find((x) => x.s === 'Annual Rent');
    return [summary(), [...t.map((x) => (x === rent ? { ...x, s: 'Annual' } : x.y < rent.y ? { ...x, y: x.y - 8 } : x)), { ...rent, s: 'Rent', y: rent.y - 8 }]];
  },
  // only a rent per SF column (no annual or monthly total)
  psfOnly: () => [summary(), table({ cols: col('Suite', 'Tenant', 'SF', 'Lease Start', 'Lease End', 'Rent/SF'), withTotal: false })],
  // no tenant column
  noTenant: () => [summary(), table({ cols: col('Suite', 'SF', 'Lease Start', 'Lease End', 'Annual Rent'), withTotal: false })],
  // a header line with tenant but nothing to measure
  noMoney: () => [summary(), table({ cols: col('Suite', 'Tenant', 'Lease Start', 'Lease End'), withTotal: false })],
  // the whole header in one cell
  merged: () => [summary(), [{ x: 40, y: 730, s: 'Rent Roll', size: 14, bold: true }, { x: 40, y: 700, s: 'Suite Tenant SF Lease End Annual Rent', size: 7, bold: true }, ...ROWS.map((r, n) => ({ x: 40, y: 684 - n * 14, s: `${r[0]} ${r[1]} ${r[2]} ${r[4]} ${r[5]}`, size: 7 }))]],
  // an OM with no table at all
  prose: () => [summary(), prose()],
  // a roll whose Total row prints more than its rows add up to: the check fails and holds the rows back
  held: () => [summary(), table({}).map((x) => (x.s === '$192,000' ? { ...x, s: '$250,000' } : x))],
  // a single "Rent" column of figures that fit both monthly and annual
  ambiguous: () => [summary(), prose(), table({ cols: col('Suite', 'Tenant', 'SF', 'Rent'), rows: [['101', 'Maple Leaf Bakery', '2,000', '', '', '', '', '', '5,000'], ['102', 'Quillfeather Books', '1,500', '', '', '', '', '', '3,500']], withTotal: false })],
};
export const pdfFixture = (name) => pdfOf(FIXTURES[name]());

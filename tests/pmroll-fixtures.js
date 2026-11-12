/* Invented property-manager rent roll reports (tests/pmroll.test.js, tests/e2e/pmroll-flow.mjs via
 * tests/e2e/dump-pages.mjs and make_pdfs.py): rent, charges and market rent in separate columns, a tenant name on two
 * lines, month-to-month, a vacant unit, a header repeated on page two, a summary page. Every name and figure is made up.
 * The rents are monthly dollars; the annual rent each unit must read to is in PM_ANNUAL (whole dollars). */
import { tbl } from './rr-fixtures.js';

export const PM_ROWS = [
  ['A1', ['Maple Leaf Bakery'], '2,000', '5,000.00', '400.00', '5,200.00', '01/01/2021', '12/31/2030'],
  ['A2', ['Northgate Family', 'Dentistry, PC'], '1,500', '3,500.00', '300.00', '3,600.00', '06/01/2022', '05/31/2027'],
  ['A3', ['Vacant'], '1,000', '', '', '1,800.00', '', ''],
  ['B1', ['Copperline Yoga'], '1,200', '3,000.00', '250.00', '0.00', '03/01/2023', '02/28/2033'],
  ['B2', ['Pinecone Cafe'], '1,000', '', '200.00', '0.00', '09/01/2024', '08/31/2029'],
  ['B3', ['Saltmarsh Vintage'], '900', '1,875.00', '150.00', '2,000.00', '05/01/2019', 'Month-to-Month'],
];
/** What each unit's annual rent must be, by unit: a blank base rent stays blank (null), whatever the charges or market column holds. */
export const PM_ANNUAL = { A1: 60000, A2: 42000, A3: null, B1: 36000, B2: null, B3: 22500 };
export const PM_NOTE = 'Rent is the contractual monthly rent; charges are billed separately.';
const FILLER = 'Prepared from the property management system for the buyer’s due diligence. Figures are unaudited and as of the date above.';

const heads = (rentHead) => ['Unit', 'Tenant', 'Sq Ft', rentHead, 'Monthly Charges', 'Market Rent', 'Lease From', 'Lease To'];
const summaryLines = ['Rent Roll Summary', 'As of: 10/01/2026', '', 'Total Units          6', 'Occupied Units       5', 'Vacant Units         1', 'Total Sq Ft      7,600'];

/**
 * opts: title ('Rent Roll'; null = none), asOf (true), lines (header lines such as a filter), rentHead ('Base Rent'),
 * note (the footnote, PM_NOTE; '' = none), split (rows on page one; the rest on a page that repeats the header), summary (true).
 * Returns page texts as the reader sees them.
 */
export function pmText({ title = 'Rent Roll', asOf = true, lines = [], rentHead = 'Base Rent', note = PM_NOTE, split = 3, summary = true, rows = PM_ROWS } = {}) {
  const cols = [{ h: 'Unit', w: 5 }, { h: 'Tenant', w: 24 }, { h: 'Sq Ft', w: 6, r: 1 }, { h: rentHead, w: Math.max(9, rentHead.length), r: 1 }, { h: 'Monthly Charges', w: 15, r: 1 }, { h: 'Market Rent', w: 11, r: 1 }, { h: 'Lease From', w: 10 }, { h: 'Lease To', w: 14 }];
  // a name on two lines: the figures on the first line, the rest of the name alone on the next
  const flat = (rs) => rs.flatMap(([u, n, ...r]) => [[u, n[0], ...r], ...n.slice(1).map((x) => ['', x])]);
  const top = [title, asOf ? 'As of: 10/01/2026' : null, ...lines].filter((x) => x != null).join('\n');
  const first = `${top}\n\n${tbl(cols, flat(rows.slice(0, split)))}`;
  const out = [first];
  if (rows.length > split) out.push(`${title ? `${title} (continued)` : ''}\n\n${tbl(cols, flat(rows.slice(split)))}\n\n${note}\n${FILLER}`);
  else out[0] += `\n\n${note}\n${FILLER}`;
  if (summary) out.push(summaryLines.concat(['', tbl([{ h: 'Unit', w: 5 }, { h: 'Tenant', w: 24 }, { h: 'Sq Ft', w: 6, r: 1 }, { h: 'Base Rent', w: 10, r: 1 }], [['', 'Occupied', '6,600', '13,375.00'], ['', 'Vacant', '1,000', '']])]).join('\n'));
  return out;
}

/* ---- the same reports as positioned text for make_pdfs.py, so the browser reads real PDFs ---- */
const X = { unit: 30, ten: 60, sf: 235, rent: 315, chg: 395, mkt: 470, from: 480, to: 535 };
const headItems = (y, rentHead) => heads(rentHead).map((t, i) => ({ x: Object.values(X)[i], y, s: t, right: [2, 3, 4, 5].includes(i), bold: true, size: 7 }));
function rowItems(r, y) {
  const [u, names, sf, rent, chg, mkt, from, to] = r;
  const out = [];
  const ny = names.length === 2 ? [y + 4.5, y - 4.5] : [y];
  names.forEach((n, i) => out.push({ x: X.ten, y: ny[i], s: n, size: 7 }));
  [[u, X.unit, 0], [sf, X.sf, 1], [rent, X.rent, 1], [chg, X.chg, 1], [mkt, X.mkt, 1], [from, X.from, 0], [to, X.to, 0]].forEach(([s, x, right]) => { if (s) out.push({ x, y, s, right: !!right, size: 7 }); });
  return { items: out, step: names.length === 2 ? 22 : 14 };
}
export function pmSpec({ title = 'Rent Roll', asOf = true, lines = [], rentHead = 'Base Rent', note = PM_NOTE, split = 3, summary = true, rows = PM_ROWS } = {}) {
  const page = (rs, heading, extra) => {
    const it = [];
    let y = 750;
    for (const t of [heading, ...(heading === title && asOf ? ['As of: 10/01/2026'] : []), ...(heading === title ? lines : [])]) { if (t) { it.push({ x: 30, y, s: t, size: t === heading ? 12 : 7, bold: t === heading }); y -= t === heading ? 14 : 11; } }
    y -= 14;
    it.push(...headItems(y, rentHead));
    y -= 20;
    for (const r of rs) { const { items, step } = rowItems(r, y); it.push(...items); y -= step; }
    if (extra) it.push({ x: 30, y: y - 20, s: extra, size: 6 }, { x: 30, y: y - 30, s: FILLER, size: 6 });
    return it;
  };
  const pages = rows.length > split
    ? [page(rows.slice(0, split), title), page(rows.slice(split), title ? `${title} (continued)` : null, note)]
    : [page(rows, title, note)];
  if (summary) {
    const it = [{ x: 30, y: 750, s: 'Rent Roll Summary', size: 12, bold: true }, { x: 30, y: 738, s: 'As of: 10/01/2026', size: 7 }];
    summaryLines.slice(3).forEach((s, i) => it.push({ x: 30, y: 710 - i * 11, s, size: 7 }));
    [['Unit', 'Tenant', 'Sq Ft', 'Base Rent'], ['', 'Occupied', '6,600', '13,375.00'], ['', 'Vacant', '1,000', '']].forEach((r, i) => {
      [[r[0], X.unit, 0], [r[1], X.ten, 0], [r[2], X.sf, 1], [r[3], X.rent, 1]].forEach(([s, x, right]) => { if (s) it.push({ x, y: 640 - i * 12, s, right: !!right, size: 7, bold: i === 0 }); });
    });
    pages.push(it);
  }
  return pages;
}
export const PM_SPECS = {
  // clean: the footnote says the rent is contract rent and monthly
  'pm-roll': () => pmSpec(),
  // filtered: "Unit Filter: All" beside a Status Filter, the heading stating its own period and basis
  'pm-roll-filtered': () => pmSpec({ lines: ['Unit Filter: All   Status Filter: Current'], rentHead: 'Monthly Base Rent', note: '' }),
  // no title and no date
  'pm-roll-untitled': () => pmSpec({ title: null, asOf: false, rentHead: 'Monthly Base Rent', note: '' }),
  // the rent column's period is not stated anywhere
  'pm-roll-period': () => pmSpec({ note: '' }),
};

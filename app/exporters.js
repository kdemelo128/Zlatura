/* exporters.js -- the comp set in the other forms a broker hands on: a CSV for
 * a CRM or Google My Maps, and a one-page printable comp sheet.
 *
 * Both take the comps exactly as the workbook would (included, edited, in
 * $/SF order), so the three outputs never disagree. */

import { PRODUCT } from './brand.js';
import { signOf } from './numtext.js';
import { feeSummary } from './calc.js';
import { toCents, toRate } from './engine/money.js';
import { STAGE_LABEL, stageOf } from './pipeline.js';

export const VERSION = '4.7.89';

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const ppsf = (c) => (num(c.price) && num(c.bsf) ? c.price / c.bsf : null);

const isoDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const mdy = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return `${x.getUTCMonth() + 1}/${x.getUTCDate()}/${x.getUTCFullYear()}`;
};
const statusOf = (c) => {
  if (c.kind === 'sale') return 'Sold';
  const p = (c.flags || []).find((f) => f.startsWith('status is '));
  const m = p && /^status is ([A-Za-z ]+?),/.exec(p);
  return m ? m[1] : 'Active';
};

/** One line Google My Maps (and most CRMs) can geocode. */
export function fullAddress(c) {
  const place = [c.city, [c.state, c.zip ? String(c.zip).padStart(5, '0') : ''].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  return [c.address || c.name, place].filter(Boolean).join(', ');
}

/* ------------------------------------------------------------------- CSV */

/** @type {[string, (c: any) => any][]} */
const CSV_COLS = [
  ['Set', (c) => (c.kind === 'sale' ? 'Sale' : 'On market')],
  ['Status', statusOf],
  ['Property', (c) => c.name],
  ['Full Address', fullAddress],
  ['Address', (c) => c.address],
  ['City', (c) => c.city],
  ['State', (c) => c.state],
  ['ZIP', (c) => (c.zip ? String(c.zip).padStart(5, '0') : '')],
  ['Submarket', (c) => c.submarket],
  ['Zoning', (c) => c.zoning],
  ['Sale Date', (c) => isoDate(c.date)],
  ['Days on Market', (c) => num(c.dom)],
  ['Price', (c) => num(c.price)],
  ['Building SF', (c) => num(c.bsf)],
  ['Price per SF', (c) => (ppsf(c) === null ? null : Math.round(ppsf(c) * 100) / 100)],
  ['Cap Rate %', (c) => num(c.cap)],
  ['Occupancy %', (c) => num(c.occ)],
  ['Lot SF', (c) => num(c.lot_sf)],
  ['Year Built', (c) => num(c.year)],
  ['Class', (c) => c.bclass],
  ['Property Type', (c) => c.ptype],
  ['Sale Type', (c) => c.sale_type],
  ['True Buyer', (c) => c.buyer],
  ['True Seller', (c) => c.seller],
  ['Sale Conditions', (c) => c.conditions],
  ['Hold Period', (c) => c.hold],
  ['Buyer Broker', (c) => c.buyer_broker],
  ['Listing Broker', (c) => c.listing_broker],
  ['CoStar ID', (c) => num(c.comp_id)],
  ['Source PDF', (c) => c.source],
  ['Flags', (c) => (c.flags || []).join(' | ')],
];

/** The CSV's column headings, in order (the comp importer reads its own export back by them). */
export const CSV_HEADINGS = CSV_COLS.map(([h]) => h);

/** A text cell a spreadsheet would read as a formula gets a leading quote:
 *  "=1+1", "+1", "-1", "@SUM" and anything starting with a tab or return. */
function safeText(s) {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  const s = safeText(String(v).replace(/\r\n?/g, '\n'));
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One text cell of a pasted tab-separated table: tabs and line breaks become spaces (they would start a new cell or
 *  row), then the same formula guard as a CSV cell. */
export function tsvCell(v) {
  return safeText(String(v ?? '').replace(/[\t\r\n]+/g, ' '));
}

/** RFC 4180 CSV, CRLF line ends, one row per comp: sales first, then listings. */
export function compsCsv(sales, market) {
  const rows = [CSV_COLS.map(([h]) => h)];
  for (const c of [...sales, ...market]) rows.push(CSV_COLS.map(([, get]) => get(c)));
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/* -------------------------------------------------------------- fees CSV */

const text = (v) => (typeof v === 'string' ? v : '');
const cents = (v) => (num(v) === null ? '' : toCents(v).toFixed(2));
/** [heading, value, isMoney]: money is already written as 2-decimal text, and a negative one (an overpayment) must not get the formula guard's quote.
 *  @type {[string, (d: any, f: any, s: any) => any, number?][]} */
const FEE_COLS = [
  ['Deal ID', (d) => d.id], ['Deal', (d) => d.name || text(d.figures && d.figures.address) || 'Untitled deal'], ['Stage', (d) => STAGE_LABEL[stageOf(d)]],
  ['Address', (d) => d.figures && d.figures.address],
  ['Fee price', (d, f) => cents(f.price), 1], ['Rate %', (d, f, s) => (s.expected ? toRate(s.expected.effectivePct) : null)],
  ['Gross fee', (d, f, s) => cents(s.expected && s.expected.total), 1], ['Co-broker', (d, f, s) => cents(s.expected && s.expected.coBroker), 1],
  ['Our side', (d, f, s) => cents(s.expected && s.expected.listingSide), 1], ['Referral', (d, f, s) => cents(s.expected && s.expected.referral), 1],
  ['House', (d, f, s) => cents(s.expected && s.expected.house), 1], ['Agent', (d, f, s) => cents(s.expected && s.expected.agent), 1],
  ['Invoiced', (d, f, s) => cents(s.invoiced), 1], ['Invoice date', (d, f) => f.invoiced && text(f.invoiced.on)], ['Invoice ref', (d, f) => f.invoiced && text(f.invoiced.ref)],
  ['Paid to date', (d, f, s) => cents(s.paidToDate), 1], ['Last payment', (d, f, s) => s.lastPaid], ['Outstanding', (d, f, s) => cents(s.outstanding), 1],
];

/** RFC 4180 CSV, CRLF line ends, one row per deal that has a fee record: the terms, the expected fee and splits, what was invoiced and paid.
 *  Each split is rounded to cents on its own, so a row can be a cent off its total. */
export function feesCsv(deals) {
  const rows = [FEE_COLS.map(([h]) => cell(h))];
  for (const d of deals) {
    const f = d && d.fee;
    if (!f || typeof f !== 'object' || Array.isArray(f)) continue;
    const s = feeSummary(f);
    rows.push(FEE_COLS.map(([, get, money]) => (money ? get(d, f, s) : cell(get(d, f, s)))));
  }
  return rows.map((r) => r.join(',')).join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------ comp sheet */

const money0 = (n) => {
  if (num(n) === null) return '—';
  const d = Math.abs(Math.round(n)).toLocaleString('en-US');
  return `${signOf(n, d)}$${d}`;
};
const money2 = (n) => {
  if (num(n) === null) return '—';
  const d = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${signOf(n, d)}$${d}`;
};
const int = (n) => {
  if (num(n) === null) return '—';
  const d = Math.abs(Math.round(n)).toLocaleString('en-US');
  return signOf(n, d) + d;
};
const pct = (n) => (num(n) === null ? '—' : `${signOf(n, Math.abs(n).toFixed(2)) + Math.abs(n).toFixed(2)}%`);

function weighted(list) {
  const p = list.filter((c) => ppsf(c) !== null);
  const sf = p.reduce((s, c) => s + c.bsf, 0);
  return sf ? p.reduce((s, c) => s + c.price, 0) / sf : null;
}
function median(xs) {
  const v = xs.filter((x) => x !== null).sort((a, b) => a - b);
  if (!v.length) return null;
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
}

const h = (doc, tag, cls, text) => {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
};

/**
 * Fill `box` with a one-page comp sheet for printing or saving as a PDF.
 * @param {any} box @param {{ sales: any[], market: any[], subject?: any, label?: string, preparedBy?: string, today?: Date }} opts
 */
export function renderCompSheet(box, { sales, market, subject = {}, label, preparedBy, today = new Date() }) {
  const doc = box.ownerDocument;
  box.textContent = '';

  const head = h(doc, 'header', 'ps-head');
  const left = h(doc, 'div');
  left.appendChild(h(doc, 'div', 'ps-eyebrow', 'Comparable sales and listings'));
  left.appendChild(h(doc, 'h1', 'ps-title', label || 'Comp set'));
  const subjBits = [subject.address, [subject.city, subject.state].filter(Boolean).join(', ')].filter(Boolean);
  if (subjBits.length) left.appendChild(h(doc, 'div', 'ps-sub', `Subject: ${subjBits.join(' · ')}`));
  head.appendChild(left);
  const right = h(doc, 'div', 'ps-meta');
  if (preparedBy) right.appendChild(h(doc, 'div', null, `Prepared by ${preparedBy}`));
  right.appendChild(h(doc, 'div', null, today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })));
  head.appendChild(right);
  box.appendChild(head);

  // the figures a reader looks for first
  const stats = h(doc, 'div', 'ps-stats');
  const stat = (k, v, s) => {
    const d = h(doc, 'div', 'ps-stat');
    d.appendChild(h(doc, 'div', 'k', k));
    d.appendChild(h(doc, 'div', 'v', v));
    if (s) d.appendChild(h(doc, 'div', 's', s));
    stats.appendChild(d);
  };
  const soldP = sales.map(ppsf).filter((x) => x !== null);
  stat('Sold, SF-weighted', weighted(sales) === null ? '—' : `${money0(weighted(sales))}/SF`,
    soldP.length ? `${sales.length} sales · ${money0(Math.min(...soldP))}–${money0(Math.max(...soldP))}/SF` : `${sales.length} sales`);
  stat('Sold, median', median(soldP) === null ? '—' : `${money0(median(soldP))}/SF`, null);
  stat('Asking, SF-weighted', weighted(market) === null ? '—' : `${money0(weighted(market))}/SF`,
    `${market.length} listing${market.length === 1 ? '' : 's'}`);
  const caps = sales.map((c) => num(c.cap)).filter((x) => x !== null);
  stat('Sale cap rates', caps.length ? `${pct(median(caps))} median` : '—',
    caps.length > 1 ? `${pct(Math.min(...caps))}–${pct(Math.max(...caps))}` : null);
  box.appendChild(stats);

  const table = (title, comps, kind) => {
    if (!comps.length) return;
    box.appendChild(h(doc, 'h2', 'ps-h2', title));
    const t = h(doc, 'table', 'ps-table');
    const cols = kind === 'sale'
      ? ['#', 'Property', 'Sold', 'Price', 'SF', '$/SF', 'Cap', 'Type', 'Buyer']
      : ['#', 'Property', 'Status', 'Days', 'Asking', 'SF', '$/SF', 'Cap', 'Marketed to'];
    const tr = h(doc, 'tr');
    cols.forEach((c, i) => tr.appendChild(h(doc, 'th', i > 1 && !['Type', 'Buyer', 'Status', 'Marketed to'].includes(c) ? 'r' : null, c)));
    const thead = h(doc, 'thead');
    thead.appendChild(tr);
    t.appendChild(thead);
    const tb = h(doc, 'tbody');
    comps.forEach((c, i) => {
      const r = h(doc, 'tr');
      const add = (v, cls) => r.appendChild(h(doc, 'td', cls, v));
      add(String(i + 1), 'r');
      const name = h(doc, 'td');
      name.appendChild(h(doc, 'div', 'ps-name', c.name));
      const where = [c.city, c.state].filter(Boolean).join(', ');
      if (where) name.appendChild(h(doc, 'div', 'ps-where', where));
      r.appendChild(name);
      if (kind === 'sale') {
        add(mdy(c.date) || '—');
        add(c.price ? money0(c.price) : 'n/d', 'r');
        add(int(c.bsf), 'r');
        add(money2(ppsf(c)), 'r ps-strong');
        add(pct(c.cap), 'r');
        add(c.sale_type || '—');
        add(c.buyer || '—', 'ps-small');
      } else {
        add(statusOf(c));
        add(int(c.dom), 'r');
        add(c.price ? money0(c.price) : 'n/d', 'r');
        add(int(c.bsf), 'r');
        add(money2(ppsf(c)), 'r ps-strong');
        add(pct(c.cap), 'r');
        add(c.sale_type || '—', 'ps-small');
      }
      tb.appendChild(r);
    });
    t.appendChild(tb);
    box.appendChild(t);
  };
  table('Sale comps, high to low $/SF', sales, 'sale');
  table('On market, high to low asking $/SF', market, 'market');

  box.appendChild(h(doc, 'p', 'ps-foot',
    `Source: CoStar comp reports, compiled with ${PRODUCT}. $/SF is price over building size. Weighted figures divide `
    + 'total price by total size; undisclosed prices (n/d) are excluded from them. Information deemed reliable but not '
    + 'guaranteed.'));
}

/* omroll.js -- the rent roll table in an offering memorandum, read by position.
 *
 * An OM's rent roll is a table someone typeset: a header (one to three lines
 * deep), a row per suite, perhaps a section heading and a subtotal, a Total,
 * and very often a page break in the middle. This module reads it the way a
 * person does, by where things sit:
 *
 *   - Columns. Every header cell is scored against every kind of column
 *     (tenant, suite, SF, start, end, annual, monthly, rent per SF a year or
 *     a month, market rent, bumps, status...) and the best overall assignment
 *     wins, so "Escalation Rate" is bumps and not rent per SF.
 *   - Rows. A row is anchored by a line with figures (or a vacancy). A line
 *     with only text in the tenant or suite column is a wrapped name: it
 *     joins the nearest anchor in height (from the PDF's baselines when
 *     layout.js gives them; from line order otherwise: the anchor below that
 *     has no name of its own, else the one above).
 *   - Pages. The table carries on to the next page while that page's cells
 *     line up with the header's columns; a repeated header is recognised and
 *     skipped. The table ends at a Total row, a new heading or a layout that
 *     no longer lines up. A later table is added only if its header matches.
 *   - Totals. A row with a total word and no lease dates, or whose figures
 *     equal the rows above it, is a total: kept in `totals`, checked against
 *     the rows, and never a tenant.
 *   - Units. From the header first. A rent column that doesn't say monthly
 *     or annual is worked out from rent per SF and flagged; nothing is ever
 *     multiplied by 12 silently, and a figure out of range is flagged, not
 *     "corrected".
 *
 *   - Scale. "($ in thousands)", "$000s" or "in millions" in a column heading, or
 *     in the lines just above the header (up to the first line with a figure),
 *     scales that table's money columns (never SF, share or rent per SF), by
 *     `toCents(value * scale)`; the cell keeps the text as printed, and an info
 *     check says what was done. A scale that leaves the rents out of range is
 *     flagged by the range check like any other figure, never accepted quietly.
 *
 * Every row keeps where each of its values came from (page, line, column and
 * the text printed) and a confidence, lowered for each guess made. Values
 * worked out from others are listed in `derived`. Pure: no DOM.
 *
 * Input: page text from layout.js (columns as character positions), and
 * optionally each page's geometry from layout.js (baselines and x
 * positions), which pdftext.js returns on request. Text alone still works. */

import { splitCells, parseDate } from './om.js';
import { toCents, toRate } from './engine/money.js';
import { scaleOf } from './scale.js';
import { RENT_KINDS, plausible, median, readings, competing, READING_NAME as READING_WORD } from './units.js';

/* ------------------------------------------------------------ the lines */

/** Where a cell's characters sit on the page, from the fragments layout.js recorded. */
export function spanOf(frags, start, end) {
  let x0 = Infinity; let x1 = -Infinity;
  for (const f of frags) {
    if (f.e <= start || f.s >= end) continue;
    const per = (f.x1 - f.x0) / Math.max(1, f.e - f.s);
    x0 = Math.min(x0, f.x0 + (Math.max(start, f.s) - f.s) * per);
    x1 = Math.max(x1, f.x0 + (Math.min(end, f.e) - f.s) * per);
  }
  return x0 < x1 ? [x0, x1] : null;
}

/**
 * A page as lines of cells: { i, text, y, h, cells: [{ text, start, end, x0, x1 }] }.
 * x is in character widths: from the PDF's own positions when `geom` is given
 * (so columns line up across pages whatever each page's left edge), else the
 * character columns of the text.
 */
export function pageLines(text, geom = null) {
  const cw = geom && geom.cw > 0 ? geom.cw : 1;
  return String(text || '').split('\n').map((s, i) => {
    const g = geom && Array.isArray(geom.lines) ? geom.lines[i] : null;
    const cells = splitCells(s).map((c) => {
      let x0 = c.start; let x1 = c.end;
      if (g && g.frags) { const p = spanOf(g.frags, c.start, c.end); if (p) { x0 = p[0] / cw; x1 = p[1] / cw; } }
      return { text: c.text, start: c.start, end: c.end, x0, x1 };
    });
    return { i, text: s, cells, y: g ? g.y : null, h: g ? g.h : null, ocr: !!(g && g.ocr), conf: g && Number.isFinite(g.conf) ? g.conf : null, frags: g && g.frags ? g.frags : null, cw };
  });
}

/**
 * Every page's lines, with x in one character width for the whole document: the median of the pages' own. A page's own
 * width is the median of its glyphs, so it moves a little with each page's mix of words and figures (and with a font
 * size that differs from page to page), and a column at the same place on the page would drift several characters
 * between pages: past the point where a continuation page lines up with the header's columns. Positions are in points
 * underneath, so one unit for all pages puts a column where it is on the page.
 */
export function documentLines(pages, layouts = null) {
  const cws = (layouts || []).map((g) => (g && g.cw > 0 ? g.cw : 0)).filter(Boolean).sort((a, b) => a - b);
  const cw = cws.length ? cws[Math.floor(cws.length / 2)] : 0;
  return pages.map((p, pi) => { const g = layouts && layouts[pi]; return pageLines(p, g && cw && g.cw > 0 && Math.abs(g.cw / cw - 1) <= 0.35 ? { ...g, cw } : g).map(splitHeaderLine); });   // a page far off (a scan, in pixels) keeps its own
}

/* --------------------------------------------------------- the columns */

// words run together by a designer's tool ("LeaseEnd", "AnnualRent") are split where a capital follows a lower-case letter, before the match
const norm = (s) => ` ${String(s).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/\s*\/\s*/g, '/').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()} `;
const W = {
  tenant: /\b(tenants?|lessees?|occupants?|residents?|tenant name|business|tenancy|company|d\/?b\/?a|leaseholders?|licensees?)\b/,
  name: /\bname\b/,
  suite: /\b(suites?|ste|unit|unit no|space|apt|apartment|bldg|building|premises|location|floor)\b|#|\bno\.? /,
  sf: /\b(sf|s\.f\.|rsf|usf|nra|gla|sq\.? ?ft\.?|sq\.? ?feet|square f(ee|oo)t(age)?|size|area|footage)\b/,
  per: /\/(sf|rsf|ft|sq\.? ?ft)\b|\bper (sf|rsf|sq\.? ?ft|square foot|foot|ft)\b|\bpsf\b|\$\/sf|\bp\.s\.f\.?/,
  month: /\bmonthly\b|\bmonth\b|\/mo\b|\/month\b|\bper mo|\bmo\b\.?|\bmthly\b/,
  year: /\bannual\b|\bannually\b|\byearly\b|\/yr\b|\/year\b|\bper year\b|\bper annum\b|\bannum\b|\bp\.a\.|\bann\b|\byr\b/,
  rent: /\b(rent|rents|rental|base|contract|in[- ]place|current|actual|lease rate|rate|payment)\b|\$/,
  market: /\b(market|asking|pro ?forma|potential)\b/,
  bump: /\b(bumps?|escalations?|escalators?|esc|increases?|steps?|cpi|rent changes?|future rent)\b/,
  start: /\b(start|starts|commence\w*|begin\w*|from|lcd|rcd|move[- ]in|occupancy date|lease from)\b/,
  end: /\b(exp|expir\w*|expires|end|ends|lxd|led|termination|maturity|to|thru|through)\b/,
  term: /\bterm\b/,
  remaining: /\b(remaining|left|yrs|years|walt)\b/,
  status: /\b(status|occupancy|occ|lease status)\b/,
  type: /\b(type|floor ?plan|plan|use|class)\b/,
  beds: /\b(beds?|baths?|bd\/ba|br\/ba|bd|ba|br|bedrooms?|bathrooms?)\b/,
  recov: /\b(cam|recover\w*|reimb\w*|nnn|opex|taxes|tax|insurance|ins|expenses?)\b/,
  deposit: /\b(deposits?|security)\b/,
  share: /%|\bpercent\b|\bshare\b|\bpro ?rata\b/,
  notes: /\b(notes?|comments?|options?|renewals?|remarks?|guarant\w*)\b/,
};

const CHARGE = /\b(charges?|fees?)\b/;
const STRICT_RENT = /\b(rent|rents|rental)\b/;

/** How well a header cell's words fit each kind of column, 0 to 10. */
export function kindScores(text) {
  const t = norm(text);
  const has = (k) => W[k].test(t);
  const s = {};
  const per = has('per'); const mo = has('month'); const yr = has('year'); const rent = has('rent');
  // "Monthly Charges" and "Fees" are billed on top of the rent: a charge word with no rent word of its own is a recovery, never a rent kind
  const mkt = has('market'); const bump = has('bump'); const recov = has('recov') || (CHARGE.test(t) && !STRICT_RENT.test(t)); const dep = has('deposit'); const share = has('share');
  if (has('tenant')) s.tenant = 10;
  else if (has('name') && !/\b(property|building|project|file|lender|broker|asset)\b/.test(t)) s.tenant = 7;   // a bare "Name" column, weaker than any tenant word
  if (has('suite')) s.suite = has('type') ? 4 : 8;
  if (has('sf') && !per && !share && !rent && !mkt) s.sf = 9;
  if (has('start')) s.start = 8 + (/\b(lease|date|commence)/.test(t) ? 1 : 0);
  if (has('end') && !has('remaining')) s.end = 8 + (/\b(lease|date|exp)/.test(t) ? 1 : 0);
  if (has('term') && !has('start') && !has('end') && !has('remaining')) s.term = 7;
  if (has('remaining') && (has('term') || /\b(yrs|years)\b/.test(t))) s.remaining = 6;
  if (bump) s.bumps = 10;
  if (mkt) s.market = rent || per ? 9 : 6;
  if (!mkt && !bump && !recov && !dep && !share) {
    if (per && mo) s.mpsf = 10;
    else if (per) s.psf = rent || yr || /\$/.test(t) ? 9 : 7;
    else if (mo) s.monthly = rent || /\bmonthly\b/.test(t) ? 9 : 6;
    else if (yr && (rent || /\bannual\b/.test(t))) s.annual = 9;
    else if (rent) s.rent = /\brate\b/.test(t) && !/\brent\b/.test(t) ? 4 : 6;
  }
  if (has('status')) s.status = 7;
  if (has('type')) s.type = 6;
  if (has('beds') && !has('type')) s.beds = 6;
  if (recov) s.recov = 6;
  if (dep) s.deposit = 6;
  if (share) s.share = 6;
  if (has('notes')) s.notes = 5;
  return s;
}

const MONEY_KINDS = new Set(['annual', 'monthly', 'rent', 'psf', 'mpsf', 'market', 'recov', 'deposit']);
const NUM_KINDS = new Set([...MONEY_KINDS, 'sf', 'share']);
const DATE_KINDS = new Set(['start', 'end', 'term']);
const TEXT_KINDS = new Set(['tenant', 'suite', 'status', 'type', 'beds', 'notes', 'bumps', 'other', 'remaining']);

/**
 * A roll with no tenant column (a multifamily roll: one row a unit, the resident not named): its rows are keyed by a
 * Unit or Suite column, and it must also give the unit's SF and say what it holds (a lease date or a status), in four
 * known columns or more, so that a unit mix or a
 * comparables table, which have a "Unit Type" but no lease, are not taken for one. "Unit Type" alone is not a unit column.
 */
function unitKeyed(cols, used) {
  const key = cols.find((c) => c.kind === 'suite');
  return !!key && key.score >= 8 && used.has('sf') && ['start', 'end', 'term', 'status'].some((k) => used.has(k)) && cols.filter((c) => c.kind !== 'other').length >= 4;
}

/** The best assignment of kinds to header cells, or null if it isn't a rent roll header. */
export function assignKinds(cells) {
  const pairs = [];
  cells.forEach((c, ci) => { for (const [k, v] of Object.entries(kindScores(c.text))) pairs.push({ ci, k, v }); });
  pairs.sort((a, b) => b.v - a.v || a.ci - b.ci);
  const byCell = new Map(); const used = new Set();
  for (const p of pairs) {
    if (byCell.has(p.ci) || used.has(p.k)) continue;
    byCell.set(p.ci, p); used.add(p.k);
  }
  const cols = cells.map((c, ci) => {
    const p = byCell.get(ci);
    return { kind: p ? p.k : 'other', label: c.text, score: p ? p.v : 0, x0: c.x0, x1: c.x1, bx0: c.x0, bx1: c.x1, idx: ci };
  });
  const known = cols.filter((c) => c.kind !== 'other').length;
  const money = ['sf', ...RENT_KINDS].some((k) => used.has(k));
  return (used.has('tenant') || unitKeyed(cols, used)) && money && known >= 3 ? cols : null;
}

/** Old name, same job: the header's columns, or null. */
export function headerColumns(cells) {
  const cols = assignKinds(cells.map((c) => ({ ...c, x0: c.x0 ?? c.start, x1: c.x1 ?? c.end })));
  return cols ? cols.map((c) => ({ ...c, key: c.kind, start: c.x0, end: c.x1, mid: (c.x0 + c.x1) / 2 })) : null;
}

/** Combine a header that runs over two or three lines ("Lease" over "Expiration") into one row of cells. */
export function mergeHeader(a, b) {
  if (!b || !b.length || b.some((c) => /\d/.test(c.text))) return a;
  const out = a.map((c) => ({ ...c }));
  const lo = (c) => c.x0 ?? c.start; const hi = (c) => c.x1 ?? c.end;
  for (const c of b) {
    const over = out.find((x) => lo(x) <= hi(c) + 1 && lo(c) <= hi(x) + 1);
    if (over) {
      over.text = `${over.text} ${c.text}`;
      if ('start' in over) { over.start = Math.min(over.start, c.start); over.end = Math.max(over.end, c.end); }
      if ('x0' in over) { over.x0 = Math.min(over.x0, c.x0); over.x1 = Math.max(over.x1, c.x1); }
    } else out.push({ ...c });
  }
  return out.sort((x, y) => lo(x) - lo(y));
}

/* ------------------------------------------------------------- values */

const NUM_RE = /^\(?\s*-?\s*\$?\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?(k|m|mm)?\s*\)?(?:\s?(?:sf|rsf|\/sf|psf|\/mo|\/yr|\/month|\/year|per month|per year|\/sf\/yr|\/sf\/mo))?$/i;
const BLANK_RE = /^(?:-+|–|—|n\/?a|none|tbd|\.+)$/i;
const MTM_RE = /^(?:mtm|m-t-m|m\/m|m-m|month[- ]to[- ]month|holdover|hold[- ]over|h\/o)$/i;

/** A number as a rent roll prints one: "$124,800", "(1,200)", "$60.0K", "2,400 SF". */
export function readNumber(text) {
  const t = String(text).trim();
  const m = NUM_RE.exec(t);
  if (!m) return null;
  let v = Number(`${m[1].replace(/,/g, '')}${m[2] || ''}`);
  if (m[3]) v *= /^k$/i.test(m[3]) ? 1e3 : 1e6;
  if (/^\(|^-|\(\s*-/.test(t) && /\)$|^-/.test(t)) v = -v;
  return Number.isFinite(v) ? v : null;
}

/** A lease date, a month-to-month or holdover word, or null: { date, mtm, holdover }. `start`: a month alone means its first day. */
function readDate(text, start = false) {
  const t = String(text).trim();
  if (MTM_RE.test(t)) return { date: null, mtm: true, holdover: /hold|h\/o/i.test(t) };
  const d = parseDate(t);
  if (d && d.date && start && MONTH_ONLY.test(t)) return { ...d, date: new Date(Date.UTC(d.date.getUTCFullYear(), d.date.getUTCMonth(), 1)) };
  return d;
}
const MONTH_ONLY = /^(?:\d{1,2}[/-](?:\d{2}|\d{4})|[A-Za-z]{3,9}\.?[-\s']+(?:\d{2}|\d{4}))$/;

/** "01/01/2021 - 12/31/2030", "06/2022 – 05/2027", "1/1/21 to 12/31/30": both ends, or null. */
export function dateRange(text) {
  const t = String(text).trim();
  if (readDate(t)) return null;
  const re = /\s*(?:–|—|\bto\b|\bthru\b|\bthrough\b|\s-\s|-)\s*/gi;
  let m;
  while ((m = re.exec(t))) {
    const a = t.slice(0, m.index); const b = t.slice(m.index + m[0].length);
    if (!a || !b) continue;
    const da = readDate(a, true); const db = readDate(b);
    if (da && db && (da.date || da.mtm) && (db.date || db.mtm) && !da.mtm) return { start: da.date, end: db.date, mtm: !!db.mtm, holdover: !!db.holdover };
  }
  return null;
}

const isDateText = (t) => !NUM_RE.test(t) || /^(19|20)\d\d$/.test(t.trim()) ? !!(readDate(t) || dateRange(t)) : false;

/** Whether a column of this kind can hold this text. */
function accepts(kind, text) {
  const t = String(text).trim();
  if (BLANK_RE.test(t)) return true;
  if (NUM_KINDS.has(kind)) return kind === 'share' ? /%/.test(t) || NUM_RE.test(t) : NUM_RE.test(t) && !/%/.test(t);
  if (DATE_KINDS.has(kind)) return isDateText(t) || (kind === 'term');
  return true;
}

/* ------------------------------------------------------ merged cells */

// A PDF's text turned into lines puts two items a hair apart in one cell ("Quillfeather Books 1,500", "Lease Start Lease End"):
// the gap between them was under a space. These cut such a cell apart, never guessing: at a word that is a figure, and (with the
// PDF's positions) where a fragment starts at a different header column's edge; a header's cell by its column words.

const FIG_TOKEN = /^(?:\(?-?\$\s?\d[\d,]*(?:\.\d+)?\)?|\(?\d{1,3}(?:,\d{3})+(?:\.\d+)?\)?|\d+\.\d+|\d{1,2}[/-]\d{1,2}[/-](?:\d{2}|\d{4})|\d{1,2}[/-](?:19|20)\d\d|\d+(?:\.\d+)?%|mtm|m-t-m)$/i;
const UNIT_SUFFIX = /^(?:sf|rsf|psf|\/sf|\/mo|\/yr|\/month|\/year|sf\/yr)$/i;
const RANGE_JOIN = /^(?:-|–|—|to|thru|through)$/i;

/** A suite or unit number on its own ("101", "2B", "A7"). */
const ID_WORD = /^[A-Z]?\d{1,4}[A-Z]?$/i;

/** The words of a cell with where each sits in the cell: [{ w, s, e }]. */
const wordsOf = (text) => {
  const out = []; const re = /\S+/g; let m;
  while ((m = re.exec(text))) {
    // words run together by a designer's tool ("StartLease") are two words
    let from = 0;
    for (const c of m[0].matchAll(/[a-z](?=[A-Z])/g)) { const at = c.index + 1; out.push({ w: m[0].slice(from, at), s: m.index + from, e: m.index + at }); from = at; }
    out.push({ w: m[0].slice(from), s: m.index + from, e: m.index + m[0].length });
  }
  return out;
};

/** A cell of the line cut at character offsets [s, e) of the line: its text and where it sits. */
function subCell(L, s, e) {
  const p = L.frags ? spanOf(L.frags, s, e) : null;
  const cw = L.cw > 0 ? L.cw : 1;
  return { text: L.text.slice(s, e), start: s, end: e, x0: p ? p[0] / cw : s, x1: p ? p[1] / cw : e, cut: true };
}

/** A currency sign printed in a cell of its own to the left of a figure (accounting style): the figure's, "$ 60,000" is "$60,000". */
const CURRENCY = /^[$€£]$/;
function joinCurrency(L) {
  const cells = [];
  for (let i = 0; i < L.cells.length; i++) {
    const c = L.cells[i]; const nx = L.cells[i + 1];
    if (CURRENCY.test(c.text) && nx && /^\(?\d/.test(nx.text)) { cells.push({ ...nx, text: c.text + nx.text, start: c.start, x0: Math.min(c.x0, nx.x0) }); i += 1; } else cells.push(c);
  }
  return { ...L, cells };
}

/**
 * A line's cells with the merged ones cut apart, or the line itself. A cell is cut at the words that are figures (money,
 * a number with thousands, a decimal, a date, a percent), between a figure and text, and between two figures; a date range
 * ("01/01/21 - 12/31/30") and a figure with its unit ("2,000 SF") stay whole. A bare whole number ("650") counts as a
 * figure only next to one that is certain. With the PDF's positions, also where one fragment ends and the next starts at a
 * different header column's left edge, after a suite number (a suite number run into a name).
 */
function unmerge(L, cols) {
  if (L.cells.some((c, i) => CURRENCY.test(c.text) && L.cells[i + 1] && /^\(?\d/.test(L.cells[i + 1].text))) L = joinCurrency(L);
  if (!L.cells.length || L.cells.every((c) => !/\s/.test(c.text))) return L;
  const cw = L.cw > 0 ? L.cw : 1;
  let changed = false; const out = [];
  for (const c of L.cells) {
    const ws = wordsOf(c.text);
    if (ws.length < 2 || NUM_RE.test(c.text.trim()) || (isDateText(c.text.trim()) && !/[a-z]{4}/i.test(c.text))) { out.push(c); continue; }
    // figure words, then bare whole numbers next to one
    const kind = ws.map((x) => (FIG_TOKEN.test(x.w) ? 'f' : UNIT_SUFFIX.test(x.w) ? 'u' : RANGE_JOIN.test(x.w) ? 'r' : /^\d{1,7}$/.test(x.w) ? 'n' : 't'));
    for (let pass = 0; pass < ws.length; pass++) {
      let moved = false;
      kind.forEach((k, i) => { if (k === 'n' && (kind[i - 1] === 'f' || kind[i + 1] === 'f')) { kind[i] = 'f'; moved = true; } });
      if (!moved) break;
    }
    const cut = new Set();
    if (kind.includes('f')) {
      for (let i = 1; i < ws.length; i++) {
        const a = kind[i - 1]; const b = kind[i];
        if (b === 'u' || b === 'r') continue;                                  // a unit stays with its figure; a range word with its dates
        if (a === 'r') continue;
        if ((a === 'f' || a === 'u') !== (b === 'f') || (a === 'f' && b === 'f') || (a === 'u' && b === 'f')) cut.add(i);
      }
      // a date range's two dates: not cut between them when a range word joins them
      for (let i = 1; i < ws.length - 1; i++) if (kind[i] === 'r') { cut.delete(i); cut.delete(i + 1); }
    }
    // fragments of this cell: a fragment starting at another header column's left edge starts a new cell
    if (L.frags && cols) {
      const fr = L.frags.filter((f) => f.s >= c.start && f.e <= c.end).sort((a, b) => a.s - b.s);
      const colOf = (f) => cols.filter((q) => q.kind !== 'other').map((q) => ({ q, g: gapOf({ x0: f.x0 / cw, x1: f.x1 / cw }, q) })).sort((a, b) => a.g - b.g)[0];
      for (let k = 1; k < fr.length; k++) {
        const a = colOf(fr[k - 1]); const b = colOf(fr[k]);
        const wi = ws.findIndex((x) => c.start + x.s >= fr[k].s);
        if (wi > 0 && a && b && a.q !== b.q && a.g <= 1.5 && b.g <= 1.5 && Math.abs(fr[k].x0 / cw - b.q.x0) <= 1.5 && kind[wi] === 't' && ID_WORD.test(ws[wi - 1].w) && !ID_WORD.test(ws[wi].w)) cut.add(wi);
      }
    }
    // text only: a short id first in a cell that starts at the Suite column and runs into the Tenant column beside it
    const suiteCol = cols && cols.find((q) => q.kind === 'suite'); const tenantCol = cols && cols.find((q) => q.kind === 'tenant');
    if (suiteCol && tenantCol && suiteCol.x0 < tenantCol.x0 && c === L.cells[0] && Math.abs(c.x0 - suiteCol.x0) <= TOL && ID_WORD.test(ws[0].w) && kind[1] === 't' && !cut.has(1)) cut.add(1);
    if (!cut.size) { out.push(c); continue; }
    changed = true;
    let from = 0;
    for (const i of [...[...cut].sort((a, b) => a - b), ws.length]) { out.push(subCell(L, c.start + ws[from].s, c.start + ws[i - 1].e)); from = i; }
  }
  return changed ? { ...L, cells: out } : L;
}

/** The key words that keep a header's label whole ("Market Rent", "Lease End"): the kind a phrase scores best, and the score. */
/** @param {string} t @returns {[string, number]} */
const topKind = (t) => { const e = Object.entries(kindScores(t)).sort((a, b) => b[1] - a[1]); return e.length ? e[0] : ['', 0]; };
const RENT_FAMILY = new Set(['annual', 'monthly', 'rent', 'psf', 'mpsf', 'market']);

/** A header cell's words as the labels they run together from: "Lease Start Lease End" as two. */
function phrasesOf(ws, text) {
  const out = []; let i = 0;
  while (i < ws.length) {
    let j = i + 1;
    let [k, v] = topKind(ws[i].w);
    while (j < ws.length && j - i < 4) {
      const joined = text.slice(ws[i].s, ws[j].e);
      const [k2, v2] = topKind(joined);
      const alone = Object.keys(kindScores(ws[j].w));
      // a label with no kind yet takes the next word; a finished one ("Lease Start") only a word of its own kind that sharpens it ("Annual" + "Rent")
      const grows = v === 0 ? true : alone.length ? v2 >= v && (alone.includes(k) || (RENT_FAMILY.has(k) && alone.some((a) => RENT_FAMILY.has(a)) && (k2 === k || v < 8))) : v < 8 && k2 === k && v2 >= v;
      if (!grows) break;
      [k, v] = [k2, v2]; j++;
    }
    out.push([i, j]); i = j;
  }
  return out;
}

/** A header line whose labels are run together in one cell (a tight header; a whole header as one text run), cut into its labels, if that makes it a header. */
function splitHeaderLine(L) {
  if (!L.cells.some((c) => /\s|[a-z][A-Z]/.test(c.text)) || hasFigure(L)) return L;
  const twoKinds = (c) => Object.values(kindScores(c.text)).filter((v) => v >= 8).length >= 2;
  if (assignKinds(L.cells) && !L.cells.some(twoKinds)) return L;
  const out = [];
  for (const c of L.cells) {
    const ws = wordsOf(c.text);
    const ph = ws.length >= 2 ? phrasesOf(ws, c.text) : [];
    if (ph.length < 2) { out.push(c); continue; }
    if (ph.length > 2) return L;   // a whole header in one text item has no positions to read its columns by; two labels a hair apart do
    for (const [a, b] of ph) out.push(subCell(L, c.start + ws[a].s, c.start + ws[b - 1].e));
  }
  // a label still holding two columns' words (one text item the PDF would not part: "Lease End Annual Rent") can't be placed: not a header
  return out.length > L.cells.length && !out.some(twoKinds) && assignKinds(out) ? { ...L, cells: out } : L;
}

/* ---------------------------------------------------------- the reader */

const TOTAL_WORD = /\b(?:totals?|sub-?totals?|grand total)\b/i;
const SUMMARY = /^(?:averages?|avg\.?|summary|weighted average|occupied(?: sf| total| subtotal| space| area)?|(?:vacant|available|leased)(?: sf| total| subtotal| space| area))\s*:?$/i;
const VACANT = /\b(?:vacant|vacancy|available|unleased|unoccupied)\b/i;
const STATUS_ONLY = /^(?:occupied|leased|rented|current|occ\.?)$/i;
/** "4 Units", "Total: 12 Units": a count printed where a subtotal's label goes. */
const UNIT_COUNT = /^(?:total\s*:?\s*)?\d{1,4}\s+units?\s*:?$/i;
const NOISE = /^(?:page\s+)?\d{1,3}(?:\s+of\s+\d{1,3})?$|\bcontinued\b|^rent roll\b|\bconfidential\b|all rights reserved|©|^offering memorandum$/i;
const FOOTNOTE = /^(?:\*|\(\d+\)|\d+\)|notes?\b|source\b|footnotes?\b|†|‡|¹|²)/i;
const HEADING_WORDS = /^(?:retail|office|industrial|residential|commercial|medical|restaurants?|anchors?|in-?line|shop space|pad sites?|out-?parcels?|ground floor|upper floors?|(?:first|second|third|fourth|\d+(?:st|nd|rd|th)) floor|building [a-z0-9]+|bldg\.? [a-z0-9]+|phase [a-z0-9]+|garage|storage|parking)(?: (?:space|tenants|suites|units))?:?$/i;
const RENT_ROLL_WORDS = /rent roll|tenant roster|tenancy schedule|stacking plan|lease schedule|tenant summary|rent schedule|tenant schedule/i;
const NOT_ROLL_WORDS = /comparabl|\bcomps?\b|competit|survey|sale comps|lease comps|recent leases|market rents?\b/i;
const TOL = 3;         // how far (in character widths) a cell may sit outside its column
const FAR = 7;         // beyond this a cell lines up with no column

const gapOf = (c, col) => Math.max(0, Math.max(col.x0, c.x0) - Math.min(col.x1, c.x1));
const midOf = (o) => (o.x0 + o.x1) / 2;
const upperish = (s) => /[A-Z]/.test(s) && !/[a-z]/.test(s);

/** The columns each cell of a line belongs to: [{ cell, col }] and the cells that line up with none. */
function assignCells(cells, cols) {
  const order = cells.map((cell) => {
    // a dollar figure belongs in a money column before a words column (bumps, notes) beside it
    const money = NUM_RE.test(cell.text.trim()) && !/%/.test(cell.text) && Math.abs(readNumber(cell.text) || 0) >= 100;
    const opts = cols.map((col) => ({ col, d: gapOf(cell, col) + 0.12 * Math.abs(midOf(cell) - (col.x0 + col.x1) / 2) + (money && TEXT_KINDS.has(col.kind) && col.kind !== 'other' ? 3 : 0) }))
      .sort((a, b) => a.d - b.d);
    return { cell, opts };
  }).sort((a, b) => a.opts[0].d - b.opts[0].d);
  const taken = new Map();
  const out = []; const loose = [];
  for (const { cell, opts } of order) {
    let pick = null;
    for (const o of opts) {
      if (gapOf(cell, o.col) > (cell.cut ? TOL : FAR)) continue;   // a piece cut from a merged cell, its place only roughly known, takes a column only if it sits on it
      if (!accepts(o.col.kind, cell.text)) continue;
      const prev = taken.get(o.col);
      if (prev && !TEXT_KINDS.has(o.col.kind)) continue;
      pick = o; break;
    }
    if (!pick && opts[0] && gapOf(cell, opts[0].col) <= TOL && !taken.has(opts[0].col)) pick = opts[0];
    if (!pick) { loose.push(cell); continue; }
    const prev = taken.get(pick.col);
    if (prev) { prev.parts.push(cell); continue; }
    const a = { cell, col: pick.col, parts: [cell] };
    taken.set(pick.col, a);
    out.push(a);
  }
  orderFill(out, loose, cols, taken);
  for (const a of out) {
    a.parts.sort((x, y) => x.x0 - y.x0);
    a.text = a.parts.map((p) => p.text).join(' ');
  }
  return { cells: out.sort((x, y) => x.col.idx - y.col.idx), loose };
}

/**
 * Figures that line up with no column (a label printed left-aligned over a figure column aligned to its right edge, far
 * from the label) placed by order: between two cells already placed, when exactly as many free figure, date or share
 * columns as loose figure cells lie between them, each cell takes the next free column that can hold it. Any other count
 * leaves the cells loose: a blank cell means the order says nothing, and nothing is guessed.
 */
function orderFill(out, loose, cols, taken) {
  const figs = loose.filter((c) => NUM_RE.test(c.text.trim()) || isDateText(c.text.trim()));
  if (!figs.length || !out.length) return;
  const placed = [...out].sort((a, b) => a.cell.x0 - b.cell.x0);
  const byX = [...figs].sort((a, b) => a.x0 - b.x0);
  const at = (c) => placed.filter((a) => a.cell.x1 <= c.x0 + 0.01).length;   // how many placed cells lie wholly left of it
  const groups = new Map();
  for (const c of byX) { const k = at(c); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
  for (const [k, cells] of groups) {
    const left = k > 0 ? placed[k - 1].col.idx : -1;
    const right = k < placed.length ? placed[k].col.idx : Infinity;
    const free = cols.filter((c) => c.idx > left && c.idx < right && !taken.has(c) && c.kind !== 'other' && !TEXT_KINDS.has(c.kind));
    if (free.length !== cells.length || cells.some((c, i) => !accepts(free[i].kind, c.text))) continue;
    cells.forEach((cell, i) => {
      const a = { cell, col: free[i], parts: [cell] };
      taken.set(free[i], a); out.push(a);
      loose.splice(loose.indexOf(cell), 1);
    });
  }
}

/** Whether this line has a figure in it (a header never does). */
const hasFigure = (L) => L.cells.some((c) => NUM_RE.test(c.text.trim()) || (/\d/.test(c.text) && isDateText(c.text)));
const closeLines = (a, b) => (a.y !== null && b.y !== null ? Math.abs(a.y - b.y) <= 1.7 * Math.max(a.h || 8, b.h || 8) : b.i === a.i + 1);

/** Kinds a header's last line can complete ("Annual" over "Rent", "Lease" over "End"): figures, dates and shares, never a name. */
const COMPLETES = new Set(['annual', 'monthly', 'rent', 'psf', 'mpsf', 'market', 'sf', 'start', 'end', 'term', 'recov', 'deposit', 'share']);

/**
 * A rent roll header at line i (one to three lines deep), or null: { cols, n, score }. A deeper line is taken when
 * it makes the columns score clearly better, or when it only finishes a label already there: every one of its cells
 * sits under a header cell that is itself a figure, date or share label (no new column, never a name column) and is
 * itself such a word, and the columns score no worse ("Annual" with "Rent" under it alone, the other labels above).
 */
export function headerAt(lines, i) {
  const L0 = lines[i];
  if (!L0 || L0.cells.length < 3 || hasFigure(L0)) return null;
  let best = null;
  let merged = L0.cells.map((c) => ({ ...c }));
  for (let k = 0; k < 3; k++) {
    let finishes = false;
    if (k > 0) {
      const nx = lines[i + k];
      if (!nx || !nx.cells.length || hasFigure(nx) || !closeLines(lines[i + k - 1], nx)) break;
      // every cell of the line sits under a header cell that is itself a figure, date or share column, and says such a thing
      const under = (c) => merged.find((x) => (x.x0 ?? x.start) <= (c.x1 ?? c.end) + 1 && (c.x0 ?? c.start) <= (x.x1 ?? x.end) + 1);
      const completes = nx.cells.every((c) => { const u = under(c); return u && Object.keys(kindScores(u.text)).some((kind) => COMPLETES.has(kind)) && Object.keys(kindScores(c.text)).some((kind) => COMPLETES.has(kind)); });
      merged = mergeHeader(merged, nx.cells);
      finishes = completes;
    }
    const cols = assignKinds(merged);
    if (!cols) continue;
    const score = cols.reduce((s, c) => s + c.score, 0);
    if (!best || score > best.score + 0.5 || (finishes && score >= best.score)) best = { cols, n: k + 1, score };
  }
  return best;
}

/** Two headers with the same columns in the same order (a header repeated on the next page). */
/** The keys that make a table the same roll: who or where (tenant or suite), the SF, and some rent or lease column. */
const coreKinds = (cols) => new Set(cols.map((c) => c.kind).filter((k) => ['tenant', 'suite', 'sf', 'annual', 'monthly', 'rent', 'psf', 'mpsf', 'start', 'end'].includes(k)));
/** A header that is the table's own with a column or two left out or added ("continued" on the next page): its key columns are the table's. */
function continuedHeader(a, b) {
  const ka = coreKinds(a); const kb = coreKinds(b);
  const common = [...ka].filter((k) => kb.has(k)).length;
  return common >= 4 && common / Math.max(ka.size, kb.size) >= 0.75 && [...(ka.size < kb.size ? ka : kb)].every((k) => (ka.size < kb.size ? kb : ka).has(k));
}
function sameHeader(a, b) {
  const ka = a.map((c) => c.kind).filter((k) => k !== 'other');
  const kb = b.map((c) => c.kind).filter((k) => k !== 'other');
  if (ka.join() === kb.join()) return true;
  const sa = new Set(ka); const common = kb.filter((k) => sa.has(k)).length;
  return common / Math.max(ka.length, kb.length) >= 0.85 && ka.filter((k) => kb.includes(k)).join() === kb.filter((k) => sa.has(k)).join();
}

/** What a line is, against the table's columns. @returns {any} */
function classify(L, t) {
  const { cells, loose } = assignCells(L.cells, t.cols);
  const by = {};
  for (const a of cells) by[a.col.kind] = a;
  const figures = cells.filter((a) => (NUM_KINDS.has(a.col.kind) && readNumber(a.text) !== null) || (DATE_KINDS.has(a.col.kind) && (readDate(a.text) || dateRange(a.text))));
  const textCells = cells.filter((a) => TEXT_KINDS.has(a.col.kind) && !BLANK_RE.test(a.text.trim()));
  const words = [...textCells.map((a) => a.text), ...loose.filter((c) => /[a-z]/i.test(c.text)).map((c) => c.text)].join(' ');
  const dates = cells.filter((a) => DATE_KINDS.has(a.col.kind) && (readDate(a.text) || dateRange(a.text)));
  const suiteText = by.suite ? by.suite.text.trim() : '';
  const realSuite = !!suiteText && !/^(?:all|total|totals|n\/?a|-+|–|—)$/i.test(suiteText) && !TOTAL_WORD.test(suiteText);
  const vacant = [by.tenant, by.status, by.suite, by.other].some((a) => a && VACANT.test(a.text));
  const base = { L, cells, by, loose, figures, dates, words, realSuite, vacant };
  // a unit count is a total only when its figures add up to the rows above, even with the suite blank (a tenant may be named "4 Units")
  const unitCount = UNIT_COUNT.test(words.trim()) || textCells.some((a) => UNIT_COUNT.test(a.text.trim()));
  const totalish = TOTAL_WORD.test(words) || textCells.some((a) => SUMMARY.test(a.text.trim())) || unitCount;
  if (totalish && !dates.length && (figures.length || (/total/i.test(words) && !unitCount))) {
    const named = textCells.find((a) => TOTAL_WORD.test(a.text) || SUMMARY.test(a.text.trim()) || UNIT_COUNT.test(a.text.trim()));
    if (unitCount ? sumsMatch(t, base) : !realSuite || sumsMatch(t, base)) return { ...base, type: 'total', label: (named ? named.text : words).trim() || 'Total' };
  }
  if (!textCells.length && !dates.length && figures.length && t.rows.length >= 2 && sumsMatch(t, base)) return { ...base, type: 'total', label: '', unlabelled: true };
  const lone = loose.length && loose.every((c) => /[a-z]/i.test(c.text));
  if (figures.length || vacant || (realSuite && by.tenant)) {
    if (!figures.length && !vacant && lone) return { ...base, type: 'mismatch' };
    return { ...base, type: 'anchor', weak: !figures.length && !vacant, unitLabel: unitCount };
  }
  // text only: a wrapped name, a section heading, or something else (the table has ended)
  const txt = L.cells.map((c) => c.text).join(' ').trim();
  if (FOOTNOTE.test(txt) || txt.length > 60 || loose.length) return { ...base, type: 'mismatch' };
  const nameCols = textCells.filter((a) => ['tenant', 'suite', 'bumps', 'notes', 'type', 'beds', 'status'].includes(a.col.kind));
  if (!nameCols.length || nameCols.length !== textCells.length) return { ...base, type: 'mismatch' };
  if (HEADING_WORDS.test(txt) || UNIT_COUNT.test(txt)) return { ...base, type: 'heading', txt };
  return { ...base, type: 'text', txt, upper: upperish(txt) && txt.length <= 30 && !by.suite };
}

/** The value a column holds, read for its kind. */
function valueOf(a) {
  if (!a) return null;
  const t = a.text.trim();
  if (BLANK_RE.test(t)) return null;
  if (NUM_KINDS.has(a.col.kind)) return readNumber(t);
  return t;
}

/** Whether a row's figures equal the rows above it: the test for a total without a label. */
function sumsMatch(t, x) {
  const sf = valueOf(x.by.sf); const rent = valueOf(x.by.annual ?? x.by.rent ?? x.by.monthly);
  const kind = x.by.annual ? 'annual' : x.by.rent ? 'rent' : 'monthly';
  const ranges = [t.rows.slice(t.lastGrand), t.rows.slice(t.boundary)];
  const near = (a, b, n) => Math.abs(a - b) <= Math.max(1 + n * 0.5, Math.abs(b) * 0.002);
  for (const rows of ranges) {
    if (rows.length < 1) continue;
    if (sf !== null && sf > 0) {
      const all = rows.reduce((s, r) => s + (r.raw.sf || 0), 0);
      const occ = rows.reduce((s, r) => s + (r.raw.vacant ? 0 : r.raw.sf || 0), 0);
      if (near(sf, all, rows.length) || near(sf, occ, rows.length)) return true;
    }
    if (rent !== null && rent > 0) {
      const sum = rows.reduce((s, r) => s + (r.raw[kind] || 0), 0);
      if (sum > 0 && near(rent, sum, rows.length)) return true;
    }
  }
  return false;
}

/** A source for one cell: { page, line, col, text }. */
const srcOf = (page, L, a) => ({ page, line: L.i + 1, col: a.col.idx, text: a.text });

/** A body line's cells as a row in progress. */
function rawRow(x, page) {
  const raw = { vacant: x.vacant };
  const cells = {};
  for (const a of x.cells) {
    const k = a.col.kind;
    if (k === 'other') continue;
    const v = valueOf(a);
    if (v === null) continue;
    cells[k] = { page, line: x.L.i + 1, col: a.col.idx, text: a.text };
    if (NUM_KINDS.has(k)) raw[k] = v;
    else if (k === 'start' || k === 'end' || k === 'term') {
      const r = dateRange(a.text);
      if (r) { raw.start = raw.start ?? r.start; raw.end = r.end; raw.mtm = r.mtm; raw.holdover = r.holdover; raw.endText = a.text; raw.range = true; continue; }
      const d = readDate(a.text, k === 'start');
      if (!d) { raw[`${k}Text`] = a.text; continue; }
      if (k === 'start') raw.start = d.date;
      else { raw.end = d.date; raw.mtm = !!d.mtm; raw.holdover = !!d.holdover; raw.endText = a.text; }
    } else raw[k] = v;
  }
  const first = x.L.cells[0];
  return { raw, cells, page, line: x.L.i + 1, y: x.L.y, h: x.L.h, unitLabel: !!x.unitLabel, ownTenant: !!(x.by.tenant && !BLANK_RE.test(x.by.tenant.text.trim())), parts: { before: [], after: [] }, lineText: x.L.text.trim(), ocr: x.L.ocr, conf: x.L.conf,
    firstText: first && !/^\$?\d/.test(first.text) && /[a-z]/i.test(first.text) ? first.text : null };
}

/** The first line of a continuation on page pi: { li, how } when it carries on, else null. */
function carryOn(P, pi, t) {
  const lines = P[pi];
  if (!lines) return null;
  let seen = 0; let firstText = null; let weakAt = null;
  for (let j = 0; j < lines.length && seen < 12; j++) {
    const L = lines[j];
    if (!L.cells.length) continue;
    seen += 1;
    const txt = L.cells.map((c) => c.text).join(' ');
    const h = headerAt(lines, j);
    if (h) return sameHeader(h.cols, t.cols) ? { pi, li: j + h.n, how: 'repeated' } : null;
    if (NOISE.test(txt.trim()) || (L.cells.length <= 2 && !hasFigure(L) && seen <= 3 && !t.cols.some((c) => c.kind === 'tenant' && gapOf(L.cells[0], c) <= TOL))) continue;
    const x = classify(L, t);
    // a line of figures that lines up with the columns; a vacancy with only its SF is enough if one follows
    if (x.type === 'anchor' && !x.loose.length && x.figures.length >= 2) return { pi, li: weakAt ?? firstText ?? j, how: 'carried' };
    if (x.type === 'anchor' && !x.loose.length && x.figures.length === 1 && weakAt === null) { weakAt = firstText ?? j; continue; }
    if (x.type === 'text') { firstText = firstText ?? j; continue; }
    return null;
  }
  return null;
}

const SPLIT_YEAR = /^(?:19|20)\d\d$/;
const SPLIT_HEAD = /[/-]$|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*(?:\d{1,2},?)?$/i;

/**
 * A lease-to year printed alone on the line under its row ("12/31/" above, "2030" below). Looks only upward, never
 * toward the row below, and only for a lone cell inside the end column's own bounds (not the nearest column: a year
 * is also a plausible Past Due or Deposit figure). Returns null when this isn't that, 'join' with the row's end set,
 * or 'refuse' when the pieces can't be trusted (the row gets a failed check and the year is not used).
 */
function splitYear(L, lines, j, seg, t) {
  const endCol = t.cols.find((c) => c.kind === 'end');
  if (!endCol || L.cells.length !== 1 || !SPLIT_YEAR.test(L.cells[0].text.trim()) || gapOf(L.cells[0], endCol) !== 0) return null;
  const prev = seg.items[seg.items.length - 1];
  if (!prev || prev.type !== 'anchor' || !prev.row) return null;
  const r = prev.row;
  const head = r.raw.endText;
  if (r.raw.end || !head || !SPLIT_HEAD.test(head.trim())) return null;
  const near = r.y !== null && L.y !== null ? Math.abs(r.y - L.y) <= 1.6 * Math.max(r.h || 8, L.h || 8) : L.i === r.line;
  if (!near) return null;
  // the next line also carries the start of a date in its end cell: the year could belong to either
  const nx = lines[j + 1];
  const nxEnd = nx && nx.cells.find((c) => gapOf(c, endCol) === 0 && SPLIT_HEAD.test(c.text.trim()) && !readDate(c.text));
  const joined = readDate(`${head.trim()}${/[/-]$/.test(head.trim()) ? '' : ' '}${L.cells[0].text.trim()}`);
  if (nxEnd || !joined || !joined.date || (r.raw.start && joined.date <= r.raw.start)) {
    r.splitFail = `the lease-to date is split across lines (“${head.trim()}” and “${L.cells[0].text.trim()}”) and can't be put together safely: check the page`;
    return 'refuse';
  }
  r.raw.end = joined.date; r.raw.mtm = false; r.raw.endText = `${head.trim()}${/[/-]$/.test(head.trim()) ? '' : ' '}${L.cells[0].text.trim()}`;
  r.cells.end = { ...(r.cells.end || {}), text: r.raw.endText, joinedLine: L.i + 1 };
  r.splitJoin = true;
  return 'join';
}

/** Whether, past the blank lines at j, the table carries on: the next line (or the one after a short heading) is a row of figures that lines up with the columns. */
function rowsFollow(lines, j, t) {
  let k = j; let heads = 0;
  for (; k < lines.length && heads < 2; k++) {
    const L = lines[k];
    if (!L.cells.length) continue;
    if (headerAt(lines, k)) return false;
    const x = classify(L, t);
    if (x.type === 'anchor' && !x.loose.length && x.figures.length >= 2) return true;
    if (x.type === 'heading' || x.type === 'text') { heads += 1; continue; }
    return false;
  }
  return false;
}

/** Read a table's body from (pi, li) to where it stops on that page. */
function readBody(P, at, t) {
  const lines = P[at.pi];
  const seg = { page: at.pi + 1, how: at.how, from: at.li, reason: 'page-end', endLi: lines.length, items: [] };
  let blank = 0; let afterTotal = false;
  const onlyNoiseAfter = (j) => lines.slice(j).every((L) => !L.cells.length || NOISE.test(L.cells.map((c) => c.text).join(' ').trim()) || classify(L, t).type !== 'anchor');
  for (let j = at.li; j < lines.length; j++) {
    const L = lines[j];
    if (!L.cells.length) {
      if (++blank > 2 && seg.items.some((x) => x.type === 'anchor')) {
        if (!afterTotal && onlyNoiseAfter(j)) { seg.soft = true; break; }
        // whitespace between groups of rows (a section, a building) is not the end of the table: rows that line up with its columns follow
        if (!afterTotal && rowsFollow(lines, j, t)) { blank = 0; seg.gaps = (seg.gaps || 0) + 1; continue; }
        seg.reason = afterTotal ? 'total' : 'gap'; seg.endLi = j; break;
      }
      continue;
    }
    blank = 0;
    const txt = L.cells.map((c) => c.text).join(' ').trim();
    if (NOISE.test(txt) && !hasFigure({ cells: L.cells.filter((c) => !/^(?:page\s+)?\d{1,3}(?:\s+of\s+\d{1,3})?$/i.test(c.text)) })) continue;
    const h = headerAt(lines, j);
    if (h) {
      if (sameHeader(h.cols, t.cols) && !afterTotal) { seg.repeated = (seg.repeated || 0) + 1; j += h.n - 1; continue; }
      seg.reason = afterTotal ? 'total' : 'header'; seg.endLi = j; break;
    }
    if (splitYear(L, lines, j, seg, t)) continue;
    const x = classify(L, t);
    if (afterTotal && x.type !== 'total') { seg.reason = 'total'; seg.endLi = j; break; }
    if (x.type === 'mismatch') {
      if (onlyNoiseAfter(j + 1) && !seg.items.some((y) => y.type === 'total')) { seg.soft = true; break; }
      seg.reason = 'mismatch'; seg.endLi = j; break;
    }
    if (x.type === 'anchor') {
      const r = rawRow(x, seg.page);
      r.carried = at.how === 'carried';
      t.rows.push(r);
      x.row = r;
    } else if (x.type === 'total') {
      x.grand = x.unlabelled ? sumsMatchAll(t, x) : !subtotalLabel(x.label);
      t.totals.push(totalOf(x, seg.page, t));
      if (x.grand) { afterTotal = true; t.lastGrand = t.rows.length; }
      t.boundary = t.rows.length;
    } else if (x.type === 'heading') {
      t.boundary = t.rows.length;
    }
    seg.items.push(x);
  }
  if (afterTotal) seg.reason = 'total';
  return seg;
}

/** A subtotal's label ("Retail Subtotal", "Total Occupied", "Averages"), not the table's Total. */
function subtotalLabel(label) {
  const l = String(label).trim();
  return /sub-?total/i.test(l) || /^(?:total\s+)?(?:occupied|vacant|available|leased)\b/i.test(l)
    || /\b(?:occupied|vacant|available|leased)\s+(?:sf|total|subtotal)\b/i.test(l) || /^(?:averages?|avg\.?|weighted average)\b/i.test(l)
    || UNIT_COUNT.test(l)
    || (/^[a-z][\w&/ -]*?\s+totals?\b/i.test(l) && !/^(?:grand|property|building|center|project|portfolio|overall|rent roll)\s+totals?\b/i.test(l));
}

function sumsMatchAll(t, x) {
  const keep = t.boundary; t.boundary = t.lastGrand;
  const ok = sumsMatch(t, x);
  t.boundary = keep;
  return ok;
}

/** A total row as kept: its figures, where it is, and the rows it covers. */
function totalOf(x, page, t) {
  const cells = {};
  const out = { label: x.label || 'Total', kind: x.grand ? 'total' : 'subtotal', page, line: x.L.i + 1, lineText: x.L.text.trim(), from: x.grand ? t.lastGrand : t.boundary, to: t.rows.length };
  for (const a of x.cells) {
    if (!NUM_KINDS.has(a.col.kind)) continue;
    const v = readNumber(a.text);
    if (v === null) continue;
    out[a.col.kind] = v;
    cells[a.col.kind] = srcOf(page, x.L, a);
  }
  out.cells = cells;
  return out;
}

/** Text-only lines joined to the row they belong to; headings left alone. */
function joinLines(seg, geo) {
  const items = seg.items;
  const anchors = items.map((x, k) => (x.type === 'anchor' ? k : -1)).filter((k) => k >= 0);
  const caps = anchors.filter((a) => items[a].row.raw.tenant && upperish(items[a].row.raw.tenant)).length > anchors.length / 2;
  // a line with a suite and a name but no figures, over a line of figures with no suite: one row printed on two lines
  for (const a of anchors) {
    const x = items[a];
    const nk = anchors.find((b) => b > a);
    if (!x.weak || nk === undefined || nk !== a + 1 || items[nk].realSuite) continue;
    const d = geo && x.L.y !== null ? Math.abs(x.L.y - items[nk].L.y) <= 1.6 * (x.L.h || 8) : items[nk].L.i - x.L.i <= 2;
    if (!d) continue;
    x.type = 'text'; x.merged = true;
    items[nk].row.parts.before.push(x);
    items[nk].row.joined = true;
    const r = items[nk].row;
    if (!r.raw.suite && x.by.suite) { r.raw.suite = x.by.suite.text; r.cells.suite = srcOf(x.row.page, x.L, x.by.suite); }
    x.row.dropped = true;
  }
  for (let k = 0; k < items.length; k++) {
    const x = items[k];
    if (x.type !== 'text' || x.merged) continue;
    const prevK = [...anchors].reverse().find((a) => a < k);
    const nextK = anchors.find((a) => a > k);
    // a total between them is a wall
    const wall = (a, b) => items.slice(Math.min(a, b) + 1, Math.max(a, b)).some((y) => y.type === 'total' || y.type === 'heading');
    const dist = (a) => (geo && x.L.y !== null && items[a].L.y !== null ? Math.abs(x.L.y - items[a].L.y) : Math.abs(x.L.i - items[a].L.i));
    const maxD = geo && x.L.y !== null ? 1.6 * (x.L.h || 8) : 2;
    const next = nextK !== undefined && !wall(k, nextK) && !items[nextK].row.ownTenant && dist(nextK) <= maxD ? nextK : null;
    // a short line in capitals over rows that aren't is a section heading, not the end of a name
    const prev = prevK !== undefined && !wall(prevK, k) && dist(prevK) <= maxD && !(x.upper && !caps) ? prevK : null;
    let to = null;
    if (next !== null && prev !== null) to = geo && x.L.y !== null ? (dist(prev) < dist(next) ? prev : next) : next;
    else to = next ?? prev;
    if (to === null) continue;
    const r = items[to].row;
    (to === next ? r.parts.before : r.parts.after).push(x);
    r.joined = true;
  }
}

/* ------------------------------------------------------------ the units */

// the readings of each rent column (annual, monthly, per SF) live in units.js, which asks when two remain

/* ------------------------------------------------------------ the scale */

const SCALED = ['annual', 'monthly', 'rent', 'market', 'recov', 'deposit'];   // money columns; rent per SF, SF and shares are never scaled

/**
 * The scale each money column of a table is printed in: its own heading's
 * ("Annual Rent ($000s)"), else the table's caption, read from the lines just
 * above the header up to the first line with a figure (the last row of some
 * other table), so a caption belonging to another table is not borrowed.
 * { [kind]: { scale, text } }, only for a scale other than 1.
 */
function tableScales(t, P) {
  const lines = P[t.page - 1] || [];
  const at = t.line - 1;
  const above = [];
  for (let k = at - 1; k >= Math.max(0, at - 3); k--) { if (hasFigure(lines[k])) break; above.unshift(lines[k].text); }
  const caption = scaleOf(above.join('\n'));
  const out = {};
  for (const c of t.cols) {
    if (!SCALED.includes(c.kind) || out[c.kind] || W.per.test(norm(c.label))) continue;   // "Market Rent PSF", "CAM $/SF": a rate, never scaled
    const own = scaleOf(c.label);
    const sc = own.scale !== 1 ? own : { ...caption, caption: true };
    if (sc.scale !== 1) out[c.kind] = sc;
  }
  return out;
}


/**
 * A bare "Rent" column under a caption that states a scale: the header does not
 * say whether it is a total (scaled) or rent per SF (not scaled, as in "dollars in
 * thousands, except rent per SF"). When both readings are plausible the broker is
 * asked (a fail), never guessed. Returns the column, or null. Call before applyScales.
 */
function rentScaleDoubt(t) {
  const sc = t.scales.rent;
  if (!sc || !sc.caption) return null;
  const pairs = t.rows.map((r) => r.raw).filter((r) => r.rent > 0 && r.sf > 0);
  if (!pairs.length) return null;
  const asRate = median(pairs.map((r) => r.rent));
  const asTotal = median(pairs.map((r) => (r.rent * sc.scale) / r.sf));
  return plausible(asRate) && plausible(asTotal) ? t.cols.find((c) => c.kind === 'rent') : null;
}

/** The scaled money of a table's rows and totals (before the rent is read as annual or monthly). */
function applyScales(t) {
  const kinds = Object.keys(t.scales);
  if (!kinds.length) return;
  const up = (o) => { for (const k of kinds) if (Number.isFinite(o[k])) o[k] = toCents(o[k] * t.scales[k].scale); };
  for (const r of t.rows) up(r.raw);
  for (const T of t.totals) up(T);
}

/* ---------------------------------------------------------------- rows */

const KEEP = ['tenant', 'suite', 'sf', 'start', 'end', 'endText', 'mtm', 'annual', 'monthly', 'psf', 'vacant'];

/** A finished row: the old fields first, then where each came from, what was worked out, and how sure. */
function finishRow(r, t, U, issues, rowNo) {
  const raw = r.raw;
  const why = [];
  let score = 1;
  const derived = [];
  const cells = { ...r.cells };
  // the name: its own line's text, with any wrapped lines in order of height
  const tenantParts = [...r.parts.before.map((x) => x.by.tenant && x.by.tenant.text), raw.tenant, ...r.parts.after.map((x) => x.by.tenant && x.by.tenant.text)].filter(Boolean);
  const suiteParts = [...r.parts.before.map((x) => x.by.suite && x.by.suite.text), raw.suite, ...r.parts.after.map((x) => x.by.suite && x.by.suite.text)].filter(Boolean);
  const bumpParts = [raw.bumps, ...r.parts.after.map((x) => x.by.bumps && x.by.bumps.text)].filter(Boolean);
  let tenant = tenantParts.join(' ').replace(/\s+/g, ' ').trim() || null;
  let status = raw.status || null;
  if (tenant && STATUS_ONLY.test(tenant)) { status = status || tenant; tenant = null; }
  const vacant = !!raw.vacant || VACANT.test(`${tenant || ''} ${status || ''}`);
  if (r.joined) {
    score -= 0.1; why.push('the name ran over more than one line, and its lines were joined');
    const joinedCell = [...r.parts.before, ...r.parts.after].find((x) => x.by.tenant);
    if (joinedCell && cells.tenant) cells.tenant = { ...cells.tenant, text: tenant };
    else if (joinedCell) cells.tenant = { page: r.page, line: joinedCell.L.i + 1, col: joinedCell.by.tenant.col.idx, text: tenant };
  }
  if (!tenant && !vacant && !STATUS_ONLY.test(status || '') && !suiteParts.length) {
    // no name and no suite: the first cell, as the old reader did, if it is words
    const first = r.firstText;
    if (first) tenant = first;
  }
  const row = {
    tenant: vacant && !tenant ? 'Vacant' : tenant, suite: suiteParts.join(' ') || null, sf: raw.sf > 0 && raw.sf < 5e6 ? raw.sf : null,
    start: raw.start || null, end: raw.end || null, endText: raw.endText || null, mtm: !!raw.mtm, annual: null, monthly: null, psf: null, vacant,
  };
  if (raw.holdover) row.holdover = true;
  if (bumpParts.length) row.bumps = bumpParts.join(' ');
  if (raw.market !== undefined) row.market = raw.market;
  if (status) row.status = status;
  // the rent, by what each column holds
  const by = { annual: null, monthly: null, psf: null, mpsf: null };
  for (const k of RENT_KINDS) {
    if (raw[k] === undefined || raw[k] === null) continue;
    const u = U[k];
    const reading = u ? u.reading : k;
    if (by[reading] === null) by[reading] = raw[k];
    else if (by[reading] !== raw[k]) { score -= 0.2; why.push(`the “${u ? u.label : k}” column gave a different ${READING_WORD[reading]}: the first column read was used`); }
    if (u && u.basis !== 'stated' && u.basis !== 'convention' && u.basis !== 'reconciled') {
      score -= u.basis === 'ask' ? 0.35 : 0.15;
      why.push(u.basis === 'ask' ? `the “${u.label}” column doesn't say whether it is monthly or annual: read as ${READING_WORD[reading]}` : `the “${u.label}” column was read as ${READING_WORD[reading]} from its figures`);
    }
  }
  if (by.annual !== null) row.annual = by.annual;
  if (by.monthly !== null) row.monthly = by.monthly;
  if (by.psf !== null) row.psf = by.psf;
  if (row.annual === null && row.monthly !== null) { row.annual = toCents(row.monthly * 12); derived.push('annual'); }
  if (row.annual === null && row.psf !== null && row.sf) { row.annual = toCents(row.psf * row.sf); derived.push('annual'); }
  if (row.annual === null && by.mpsf !== null && row.sf) { row.annual = toCents(by.mpsf * 12 * row.sf); derived.push('annual'); }
  if (row.psf === null && by.mpsf !== null) { row.psf = toRate(by.mpsf * 12); derived.push('psf'); }
  if (row.psf === null && row.annual && row.sf) { row.psf = row.annual / row.sf; derived.push('psf'); }
  if (row.monthly === null && row.annual && t.cols.some((c) => c.kind === 'monthly' || (c.kind === 'rent' && U.rent && U.rent.reading === 'monthly'))) { row.monthly = toCents(row.annual / 12); derived.push('monthly'); }
  // out of range: flagged, never corrected
  if (row.sf && !vacant) {
    for (const k of RENT_KINDS) {
      if (!(raw[k] > 0)) continue;
      const reading = U[k] ? U[k].reading : k;
      const yearPsf = reading === 'annual' ? raw[k] / row.sf : reading === 'monthly' ? (12 * raw[k]) / row.sf : reading === 'psf' ? raw[k] : 12 * raw[k];
      if (yearPsf < 1.2 || yearPsf > 3000) {
        score = Math.min(score - 0.4, 0.5);
        why.push(`${READING_WORD[reading]} of ${raw[k].toLocaleString('en-US')} on ${row.sf.toLocaleString('en-US')} SF is $${yearPsf.toFixed(2)}/SF a year: out of range`);
        issues.push({ kind: 'range', level: 'fail', row: rowNo, col: r.cells[k] ? r.cells[k].col : null, page: r.page, line: r.line, cell: r.cells[k] || null, lineText: r.lineText,
          text: `Row ${rowNo}${row.suite ? ` (suite ${row.suite})` : ''}: the ${t.cols.find((c) => c.kind === k).label} column holds ${r.cells[k] ? `“${r.cells[k].text}”` : raw[k]}, which as ${READING_WORD[reading]} is $${yearPsf.toFixed(2)}/SF a year. It may be rent per SF or a monthly figure; it was not changed.`, amount: raw[k] });
      }
    }
  }
  // the columns that say the same thing, against each other
  if (!vacant && row.sf && by.psf !== null && (by.annual !== null || by.monthly !== null)) {
    const a = by.annual !== null ? by.annual : by.monthly * 12;
    if (Math.abs(a - by.psf * row.sf) / a > 0.02) {
      score -= 0.2;
      why.push('its annual rent and its rent per SF times its SF disagree');
      issues.push({ kind: 'consistency', level: 'warn', row: rowNo, page: r.page, line: r.line, col: r.cells.psf ? r.cells.psf.col : null, cell: r.cells.psf || null, lineText: r.lineText,
        text: `Row ${rowNo}${row.suite ? ` (suite ${row.suite})` : ''}: rent per SF × SF is $${Math.round(by.psf * row.sf).toLocaleString('en-US')} a year; the row prints $${Math.round(a).toLocaleString('en-US')}.`, amount: Math.abs(a - by.psf * row.sf) });
    }
  }
  if (vacant && !row.sf) issues.push({ kind: 'nosf', level: 'warn', row: rowNo, page: r.page, line: r.line, col: null, cell: null, lineText: r.lineText, text: `Row ${rowNo}${row.suite ? ` (suite ${row.suite})` : ''} is vacant with no SF printed, so occupancy can't count it.`, amount: 0 });
  if (r.carried) { score -= 0.15; why.push(`page ${r.page} carries on with no header: its cells line up with the header's columns`); }
  if (r.splitJoin) { score -= 0.1; why.push('its lease-to date was printed across two lines, and the lines were joined'); }
  if (r.splitFail) {
    score -= 0.3; why.push(r.splitFail);
    issues.push({ kind: 'split', level: 'fail', row: rowNo, page: r.page, line: r.line, col: r.cells.end ? r.cells.end.col : null, cell: r.cells.end || null, lineText: r.lineText, text: `Row ${rowNo}: ${r.splitFail}.`, amount: 0 });
  }
  if (r.unitLabel) {
    score -= 0.2; why.push('its label reads like a unit count, but its figures don\'t add up to the rows above');
    issues.push({ kind: 'unitlabel', level: 'warn', row: rowNo, page: r.page, line: r.line, col: null, cell: null, lineText: r.lineText,
      text: `Row ${rowNo}: a row labelled “${r.lineText.match(/\d{1,4}\s+units?/i)?.[0] || 'a unit count'}” was read as a tenant; its figures don't add up to the rows above it.`, amount: 0 });
  }
  if (t.unknownCols) { score -= 0.1; why.push(`the table has a column the reader doesn't know (${t.unknownCols})`); }
  if (r.ocr) { score = Math.min(score, 0.3); why.push('read by OCR from a scanned page'); }
  row.src = { page: r.page, line: r.line, cells };
  row.derived = derived;
  row.score = Math.round(score * 100) / 100;
  row.why = why;
  if (r.ocr) row.ocr = true;
  return row;
}

const bucket = (s) => (s >= 0.8 ? 'high' : s >= 0.55 ? 'medium' : 'low');

/** Each total row against the rows it covers. */
function checkTotals(t, rows, issues) {
  for (const T of t.totals) {
    const cover = rows.slice(T.from, T.to);
    T.check = {};
    const n = cover.length || 1;
    const near = (a, b) => Math.abs(a - b) <= Math.max(1 + n * 0.5, Math.abs(b) * 0.002);
    /** @type {[string, string, (r: any) => number, ((r: any) => number) | null][]} */
    const fields = [['sf', 'SF', (r) => r.sf || 0, (r) => (r.vacant ? 0 : r.sf || 0)], ['annual', 'annual rent', (r) => (r.vacant ? 0 : r.annual || 0), null], ['monthly', 'monthly rent', (r) => (r.vacant ? 0 : r.monthly || 0), null]];
    const totalField = (k) => (k === 'annual' ? T.annual ?? (U_of(t, 'rent') === 'annual' ? T.rent : undefined) : k === 'monthly' ? T.monthly ?? (U_of(t, 'rent') === 'monthly' ? T.rent : undefined) : T[k]);
    const said = /^(?:total\s*:?\s*)?(\d{1,4})\s+units?/i.exec(String(T.label).trim());
    if (said && Number(said[1]) !== cover.length) {
      issues.push({ kind: 'total', level: 'fail', field: 'units', total: T, page: T.page, line: T.line, col: null, cell: null, lineText: T.lineText,
        text: `The “${T.label}” row (page ${T.page}) says ${said[1]} unit${said[1] === '1' ? '' : 's'}; the ${cover.length} row${cover.length === 1 ? '' : 's'} above it read are not that many. A row may be missing or misread.`, amount: Math.abs(Number(said[1]) - cover.length) });
    }
    for (const [k, word, all, occ] of fields) {
      const v = totalField(k);
      if (!Number.isFinite(v)) continue;
      const a = cover.reduce((s, r) => s + all(r), 0);
      const o = occ ? cover.reduce((s, r) => s + occ(r), 0) : null;
      let pass = near(v, a) || (o !== null && near(v, o));
      let how = '';
      // like with like: a total that does not match the rows it sits under may be a running total (every row from the roll's start) or print the other period
      if (!pass) {
        const prior = rows.slice(0, T.to);
        if (prior.length > cover.length) {
          const ca = prior.reduce((s, r) => s + all(r), 0); const co = occ ? prior.reduce((s, r) => s + occ(r), 0) : null;
          if (near(v, ca) || (co !== null && near(v, co))) { pass = true; how = `a running total: it adds up to all ${prior.length} rows read from the start of the roll (${fmtN(k, ca)}), not to the ${cover.length} above it`; }
        }
      }
      const byRent = (k === 'annual' && T.cells.rent && !T.cells.annual) || (k === 'monthly' && T.cells.rent && !T.cells.monthly);
      if (!pass && byRent && t.units && t.units.rent && t.units.rent.basis !== 'stated') {
        // the rent column does not say its period, and the total may be printed in the other one: shown, never used to change a figure
        const other = k === 'monthly' ? a * 12 : a / 12;
        if (near(v, other)) { pass = true; how = `the rent column does not say monthly or annual: the Total ${fmtN(k, v)} equals the rows' ${k === 'monthly' ? 'monthly rent × 12 (a year)' : 'annual rent ÷ 12 (a month)'}, so it is printed ${k === 'monthly' ? 'as a year' : 'as a month'}`; }
      }
      T.check[k] = { total: v, rows: a, occupied: o, ok: pass, ...(how ? { how } : {}) };
      const cellK = k === 'annual' && !T.cells.annual ? 'rent' : k === 'monthly' && !T.cells.monthly ? 'rent' : k;
      issues.push({ kind: 'total', level: pass ? 'pass' : 'fail', field: k, total: T, page: T.page, line: T.line, col: T.cells[cellK] ? T.cells[cellK].col : null, cell: T.cells[cellK] || null, lineText: T.lineText,
        text: pass ? `${T.kind === 'total' ? 'The Total row' : `The “${T.label}” row`} (page ${T.page}): ${word} ${fmtN(k, v)} ${how ? `is ${how}.` : `equals the ${cover.length} row${cover.length === 1 ? '' : 's'} above it.`}`
          : `${T.kind === 'total' ? 'The Total row' : `The “${T.label}” row`} (page ${T.page}) prints ${word} of ${fmtN(k, v)}; the ${cover.length} row${cover.length === 1 ? '' : 's'} read add up to ${fmtN(k, a)}. A row may be missing or misread.`,
        amount: Math.abs(v - a) });
      if (!pass) for (const r of cover) { r.score = Math.round((r.score - 0.3) * 100) / 100; r.why.push(`the ${word} of the rows doesn't add up to the ${T.kind === 'total' ? 'Total' : T.label} row`); }
    }
  }
}
const U_of = (t, k) => (t.units && t.units[k] ? t.units[k].reading : null);
const fmtN = (k, v) => (k === 'sf' ? `${Math.round(v).toLocaleString('en-US')}` : `$${Math.round(v).toLocaleString('en-US')}`);

/** How rent-roll-like a table is, to choose among several in one OM. */
function tableScore(t, P) {
  const kinds = new Set(t.cols.map((c) => c.kind));
  const above = P[t.page - 1].slice(Math.max(0, t.line - 9), t.line - 1).map((L) => L.text).join(' ');
  const pageText = P[t.page - 1].slice(0, 6).map((L) => L.text).join(' ');
  let s = Math.min(50, t.rows.length) * 0.1;
  if (kinds.has('suite')) s += 2;
  if (kinds.has('end') || kinds.has('start') || kinds.has('term')) s += 2;
  if (RENT_KINDS.some((k) => kinds.has(k))) s += 1;
  if (RENT_ROLL_WORDS.test(above) || RENT_ROLL_WORDS.test(pageText)) s += 3;
  if (NOT_ROLL_WORDS.test(above) || NOT_ROLL_WORDS.test(pageText)) s -= 6;
  return s;
}

/**
 * The OM's rent roll, or null. `pages`: page text from layout.js; `layouts`:
 * each page's geometry from layout.js (optional); `periods`: { column kind: reading } the broker chose for a column
 * that does not say monthly or annual. Returns { rows, totals,
 * columns, units, pages, page, segments, confidence, issues }.
 * `onRowLines(row, [{ page, line }])` is told the exact lines each row was read from (its anchor and its wrapped lines),
 * so a caller can tell a table's own lines from the report's headings; it adds no saved field.
 * @param {string[]} pages
 * @param {{ layouts?: any, periods?: any, onRowLines?: ((row: any, lines: { page: number, line: number }[]) => void) | null }} [options]
 */
export function rentRoll(pages, { layouts = null, periods = null, onRowLines = null } = {}) {
  const P = documentLines(pages, layouts);
  const geo = !!(layouts && layouts.some((g) => g && g.lines));
  const tables = [];
  let pi = 0; let li = 0;
  while (pi < P.length) {
    if (li >= P[pi].length) { pi += 1; li = 0; continue; }
    const h = headerAt(P[pi], li);
    if (!h) { li += 1; continue; }
    const t = { cols: h.cols, page: pi + 1, line: li + 1, rows: [], totals: [], segments: [], boundary: 0, lastGrand: 0, allCaps: false };
    const PT = P.map((lines) => lines.map((L) => unmerge(L, t.cols)));   // the table's lines, merged cells cut apart by its columns
    let at = { pi, li: li + h.n, how: 'header' };
    for (;;) {
      const seg = readBody(PT, at, t);
      t.segments.push(seg);
      t.allCaps = t.rows.length >= 2 && t.rows.filter((r) => r.raw.tenant && upperish(r.raw.tenant)).length > t.rows.length / 2;
      if (seg.reason !== 'page-end') { pi = at.pi; li = Math.max(seg.endLi, at.li + 1); break; }
      const nx = carryOn(PT, at.pi + 1, t);
      if (!nx) { pi = at.pi + 1; li = 0; break; }
      at = nx;
    }
    if (t.rows.length) tables.push(t);
  }
  if (!tables.length) return null;
  // the rent roll: the most rent-roll-like table, and any other whose header matches it
  const best = tables.reduce((a, b) => (tableScore(b, P) > tableScore(a, P) ? b : a));
  const lastPage = (t) => t.segments[t.segments.length - 1].page;
  const chosen = tables.filter((t) => t === best || sameHeader(t.cols, best.cols));
  // a table that picks up where a chosen one ended, with a header of its own that keeps the roll's key columns (a "continued" header with a column left out)
  for (let grew = true; grew;) {
    grew = false;
    for (const t of tables) {
      if (chosen.includes(t) || !continuedHeader(t.cols, best.cols)) continue;
      if (chosen.some((c) => t.page >= lastPage(c) && t.page <= lastPage(c) + 1 && t.page >= c.page)) { chosen.push(t); grew = true; }
    }
  }
  chosen.sort((a, b) => a.page - b.page || a.line - b.line);
  const issues = [];
  best.scales = tableScales(best, P);
  const rows = []; const totals = []; const segments = []; const pageSet = new Set();
  for (const t of chosen) {
    for (const seg of t.segments) joinLines(seg, geo);
    // a later table with the same header and no caption of its own is printed in the first one's scale
    const own = t === best ? best.scales : tableScales(t, P);
    t.scales = Object.keys(own).length ? own : best.scales;
    const doubt = rentScaleDoubt(t);
    applyScales(t);
    t.units = readings(t);
    // the broker's answer to "is this column monthly or annual?" (rrdoc.js): that column is then stated, not inferred
    if (periods) for (const [k, reading] of Object.entries(periods)) if (t.units[k] && READING_WORD[reading]) t.units[k] = { ...t.units[k], reading, basis: 'stated', note: 'chosen by the broker' };
    t.competing = competing(t);
    t.unknownCols = t.cols.filter((c) => c.kind === 'other' && !/^(?:#|no\.?)$/i.test(c.label.trim())).map((c) => `“${c.label}”`).join(', ');
    const base = rows.length;
    const mine = [];
    const index = new Map();
    for (const r of t.rows) {
      if (r.dropped) { index.set(r, base + mine.length); continue; }
      const row = finishRow(r, t, t.units, issues, base + mine.length + 1);
      // a stray line that lines up with the columns: too small to be a lease, with no name or suite
      if (!row.tenant && !row.suite && !row.vacant) continue;
      if (row.sf !== null && row.sf < 100 && !row.annual && !row.tenant && !row.suite) continue;
      index.set(r, base + mine.length);
      mine.push(row);
      if (onRowLines) onRowLines(row, [{ page: r.page, line: r.line }, ...[...r.parts.before, ...r.parts.after].map((x) => ({ page: r.page, line: x.L.i + 1 }))]);
      pageSet.add(r.page);
    }
    if (doubt) {
      const sc = t.scales.rent;
      issues.push({ kind: 'unit', level: 'fail', col: doubt.idx, page: t.page, line: t.line, row: null, cell: { page: t.page, line: t.line, col: doubt.idx, text: doubt.label }, lineText: doubt.label,
        text: `The “${doubt.label}” column on page ${t.page} doesn't say whether it is a total or rent per SF, and the table's caption (“${sc.text}”) says its figures are scaled: its figures fit both a rent per SF as printed and a total read ×${sc.scale.toLocaleString('en-US')}. They were read as totals ×${sc.scale.toLocaleString('en-US')}; check the column before accepting.`, amount: 0 });
    }
    for (const [k, sc] of Object.entries(t.scales)) {
      const col = t.cols.find((c) => c.kind === k);
      issues.push({ kind: 'scale', level: 'info', page: t.page, line: t.line, row: null, col: col ? col.idx : null, cell: col ? { page: t.page, line: t.line, col: col.idx, text: col.label } : null, lineText: col ? col.label : '',
        text: `The “${col ? col.label : k}” column on page ${t.page} is printed in ${sc.scale === 1e3 ? 'thousands' : 'millions'} (“${sc.text}”): its figures, and its Total row, are read ×${sc.scale.toLocaleString('en-US')}. The cells keep the text as printed.`, amount: 0 });
    }
    // totals cover rows by their place in this table
    const at = (k) => (k >= t.rows.length ? base + mine.length : index.get(t.rows[k]));
    const tt = { ...t, totals: t.totals.map((T) => ({ ...T, from: at(T.from), to: at(T.to) })) };
    rows.push(...mine);
    checkTotals(tt, rows, issues);
    totals.push(...tt.totals);
    for (const seg of t.segments) {
      if (seg.items.some((x) => x.type === 'anchor')) segments.push({ page: seg.page, how: seg.how, rows: seg.items.filter((x) => x.type === 'anchor').length, repeated: seg.repeated || 0 });
    }
    for (const cp of t.competing) {
      const mk = (c) => ({ page: t.page, line: t.line, col: c.idx, text: c.label });
      issues.push({ kind: 'compete', level: cp.differs ? 'fail' : 'info', col: cp.other.idx, cols: [cp.used.idx, cp.other.idx], page: t.page, line: t.line, row: null, cell: mk(cp.other), lineText: cp.other.label,
        text: cp.differs
          ? `The “${cp.used.label}” and “${cp.other.label}” columns on page ${t.page} both read as ${READING_WORD[t.units[cp.used.kind].reading]}, and their figures differ. The “${cp.used.label}” column was used; check the page before accepting.`
          : `The “${cp.used.label}” and “${cp.other.label}” columns on page ${t.page} print the same figures; the “${cp.used.label}” column was used.`, amount: 0 });
    }
    for (const [k, u] of Object.entries(t.units)) {
      if (u.basis === 'inferred' || u.basis === 'ask') {
        const col = t.cols.find((c) => c.kind === k);
        issues.push({ kind: 'unit', level: u.basis === 'ask' ? 'fail' : 'warn', col: col.idx, page: t.page, line: t.line, row: null, cell: { page: t.page, line: t.line, col: col.idx, text: col.label }, lineText: col.label,
          text: u.basis === 'ask'
            ? `The “${u.label}” column doesn't say whether it is monthly or annual, and its figures fit more than one reading${u.alt && u.alt.length ? ` (${[u.reading, ...u.alt].map((r) => READING_WORD[r]).join(' or ')})` : ''}. It was read as ${READING_WORD[u.reading]}: confirm before using it.`
            : `The “${u.label}” column doesn't say monthly or annual; its figures only make sense as ${READING_WORD[u.reading]}${u.note ? ` (${u.note})` : ''}, so that is how it was read.`,
          amount: 0 });
      }
    }
  }
  for (const s of segments) if (s.how === 'carried') {
    const covered = totals.some((T) => T.check && Object.values(T.check).some((c) => c.ok) && rows.slice(T.from, T.to).some((r) => r.src.page === s.page));
    issues.push({ kind: 'carried', level: covered ? 'pass' : 'warn', page: s.page, line: null, row: null, col: null, cell: null, lineText: '',
      text: `Page ${s.page} carries on the table with no header: its cells line up with the header's columns${covered ? ', and the Total row adds up with its rows in' : '. No Total row confirms it'}.`, amount: 0 });
  }
  if (!totals.length) issues.push({ kind: 'nototal', level: 'info', page: null, line: null, row: null, col: null, cell: null, lineText: '', text: 'The rent roll prints no Total row, so its rows can’t be checked against one.', amount: 0 });
  if (!rows.length) return null;
  const pagesList = [...pageSet].sort((a, b) => a - b);
  const conf = rows.some((r) => bucket(r.score) === 'low') || issues.some((i) => i.level === 'fail') ? 'low' : rows.every((r) => bucket(r.score) === 'high') ? 'high' : 'medium';
  for (const r of rows) r.confidence = bucket(r.score);
  const columns = best.cols.map((c) => ({ kind: c.kind, label: c.label, ...(best.units[c.kind] ? { reading: best.units[c.kind].reading, basis: best.units[c.kind].basis } : {}) }));
  return { rows, page: pagesList[0], pages: pagesList, totals, columns, segments, confidence: conf, issues };
}

export { KEEP as ROW_FIELDS };

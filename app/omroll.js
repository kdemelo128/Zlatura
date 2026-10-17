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

/* ------------------------------------------------------------ the lines */

/** Where a cell's characters sit on the page, from the fragments layout.js recorded. */
function spanOf(frags, start, end) {
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
    return { i, text: s, cells, y: g ? g.y : null, h: g ? g.h : null, ocr: !!(g && g.ocr), conf: g && Number.isFinite(g.conf) ? g.conf : null };
  });
}

/* --------------------------------------------------------- the columns */

const norm = (s) => ` ${String(s).toLowerCase().replace(/\s*\/\s*/g, '/').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()} `;
const W = {
  tenant: /\b(tenants?|lessee|occupant|residents?|tenant name|business|tenancy|company)\b/,
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
  type: /\b(type|bd\/ba|bed|beds|br|bedrooms?|floor ?plan|plan|use|class)\b/,
  recov: /\b(cam|recover\w*|reimb\w*|nnn|opex|taxes|tax|insurance|ins|expenses?)\b/,
  deposit: /\b(deposits?|security)\b/,
  share: /%|\bpercent\b|\bshare\b|\bpro ?rata\b/,
  notes: /\b(notes?|comments?|options?|renewals?|remarks?|guarant\w*)\b/,
};

/** How well a header cell's words fit each kind of column, 0 to 10. */
export function kindScores(text) {
  const t = norm(text);
  const has = (k) => W[k].test(t);
  const s = {};
  const per = has('per'); const mo = has('month'); const yr = has('year'); const rent = has('rent');
  const mkt = has('market'); const bump = has('bump'); const recov = has('recov'); const dep = has('deposit'); const share = has('share');
  if (has('tenant')) s.tenant = 10;
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
  if (recov) s.recov = 6;
  if (dep) s.deposit = 6;
  if (share) s.share = 6;
  if (has('notes')) s.notes = 5;
  return s;
}

const MONEY_KINDS = new Set(['annual', 'monthly', 'rent', 'psf', 'mpsf', 'market', 'recov', 'deposit']);
const NUM_KINDS = new Set([...MONEY_KINDS, 'sf', 'share']);
const DATE_KINDS = new Set(['start', 'end', 'term']);
const RENT_KINDS = ['annual', 'monthly', 'rent', 'psf', 'mpsf'];
const TEXT_KINDS = new Set(['tenant', 'suite', 'status', 'type', 'notes', 'bumps', 'other', 'remaining']);

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
  return used.has('tenant') && money && known >= 3 ? cols : null;
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

/* ---------------------------------------------------------- the reader */

const TOTAL_WORD = /\b(?:totals?|sub-?totals?|grand total)\b/i;
const SUMMARY = /^(?:averages?|avg\.?|summary|weighted average|occupied(?: sf| total| subtotal| space| area)?|(?:vacant|available|leased)(?: sf| total| subtotal| space| area))\s*:?$/i;
const VACANT = /\b(?:vacant|vacancy|available|unleased|unoccupied)\b/i;
const STATUS_ONLY = /^(?:occupied|leased|rented|current|occ\.?)$/i;
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
      if (gapOf(cell, o.col) > FAR) continue;
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
  for (const a of out) {
    a.parts.sort((x, y) => x.x0 - y.x0);
    a.text = a.parts.map((p) => p.text).join(' ');
  }
  return { cells: out.sort((x, y) => x.col.idx - y.col.idx), loose };
}

/** Whether this line has a figure in it (a header never does). */
const hasFigure = (L) => L.cells.some((c) => NUM_RE.test(c.text.trim()) || (/\d/.test(c.text) && isDateText(c.text)));
const closeLines = (a, b) => (a.y !== null && b.y !== null ? Math.abs(a.y - b.y) <= 1.7 * Math.max(a.h || 8, b.h || 8) : b.i === a.i + 1);

/** A rent roll header at line i (one to three lines deep), or null: { cols, n, score }. */
function headerAt(lines, i) {
  const L0 = lines[i];
  if (!L0 || L0.cells.length < 3 || hasFigure(L0)) return null;
  let best = null;
  let merged = L0.cells.map((c) => ({ ...c }));
  for (let k = 0; k < 3; k++) {
    if (k > 0) {
      const nx = lines[i + k];
      if (!nx || !nx.cells.length || hasFigure(nx) || !closeLines(lines[i + k - 1], nx)) break;
      merged = mergeHeader(merged, nx.cells);
    }
    const cols = assignKinds(merged);
    if (!cols) continue;
    const score = cols.reduce((s, c) => s + c.score, 0);
    if (!best || score > best.score + 0.5) best = { cols, n: k + 1, score };
  }
  return best;
}

/** Two headers with the same columns in the same order (a header repeated on the next page). */
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
  const totalish = TOTAL_WORD.test(words) || textCells.some((a) => SUMMARY.test(a.text.trim()));
  if (totalish && !dates.length && (figures.length || /total/i.test(words))) {
    const named = textCells.find((a) => TOTAL_WORD.test(a.text) || SUMMARY.test(a.text.trim()));
    if (!realSuite || sumsMatch(t, base)) return { ...base, type: 'total', label: (named ? named.text : words).trim() || 'Total' };
  }
  if (!textCells.length && !dates.length && figures.length && t.rows.length >= 2 && sumsMatch(t, base)) return { ...base, type: 'total', label: '', unlabelled: true };
  const lone = loose.length && loose.every((c) => /[a-z]/i.test(c.text));
  if (figures.length || vacant || (realSuite && by.tenant)) {
    if (!figures.length && !vacant && lone) return { ...base, type: 'mismatch' };
    return { ...base, type: 'anchor', weak: !figures.length && !vacant };
  }
  // text only: a wrapped name, a section heading, or something else (the table has ended)
  const txt = L.cells.map((c) => c.text).join(' ').trim();
  if (FOOTNOTE.test(txt) || txt.length > 60 || loose.length) return { ...base, type: 'mismatch' };
  const nameCols = textCells.filter((a) => ['tenant', 'suite', 'bumps', 'notes', 'type', 'status'].includes(a.col.kind));
  if (!nameCols.length || nameCols.length !== textCells.length) return { ...base, type: 'mismatch' };
  if (HEADING_WORDS.test(txt)) return { ...base, type: 'heading', txt };
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
  return { raw, cells, page, line: x.L.i + 1, y: x.L.y, h: x.L.h, ownTenant: !!(x.by.tenant && !BLANK_RE.test(x.by.tenant.text.trim())), parts: { before: [], after: [] }, lineText: x.L.text.trim(), ocr: x.L.ocr, conf: x.L.conf,
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

const plausible = (psfYear) => psfYear >= 3 && psfYear <= 300;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

/**
 * What each rent column holds, from its header first and its figures second:
 * { kind, reading: 'annual'|'monthly'|'psf'|'mpsf', basis: 'stated'|'convention'|'inferred'|'guessed', note }.
 */
function readings(t) {
  const rows = t.rows.map((r) => r.raw);
  const resi = t.cols.some((c) => /resident|\bapt\b|\bbr\b|bed|unit type|bd\/ba/i.test(c.label)) || (t.cols.some((c) => c.kind === 'suite' && /\bunit\b/i.test(c.label)) && median(rows.map((r) => r.rent).filter((v) => v > 0)) < 6000);
  const out = {};
  for (const col of t.cols) {
    const k = col.kind;
    if (!RENT_KINDS.includes(k)) continue;
    const pairs = rows.filter((r) => r[k] > 0 && r.sf > 0).map((r) => [r[k], r.sf]);
    // a column with nothing in it needs no reading
    if (!rows.some((r) => Number.isFinite(r[k]))) { out[k] = { kind: k, reading: k === 'rent' ? 'annual' : k, basis: 'empty', label: col.label }; continue; }
    if (k === 'annual' || k === 'monthly' || k === 'mpsf') { out[k] = { kind: k, reading: k, basis: 'stated', label: col.label }; continue; }
    if (k === 'psf') {
      const yearly = /\b(annual|yearly|yr|year|annum)\b/i.test(col.label);
      // a total-rent column on the same rows settles whether "per SF" is a year or a month
      const tot = rows.filter((r) => r.psf > 0 && r.sf > 0 && (r.annual > 0 || r.monthly > 0)).map((r) => (r.annual > 0 ? r.annual : r.monthly * 12) / r.sf / r.psf);
      const ratio = median(tot);
      if (!yearly && ratio !== null && Math.abs(ratio - 12) / 12 < 0.03) out.psf = { kind: 'psf', reading: 'mpsf', basis: 'inferred', label: col.label, note: `rent per SF here is a month's: it times the SF times 12 gives the annual rent printed beside it` };
      else out.psf = { kind: 'psf', reading: 'psf', basis: yearly ? 'stated' : 'convention', label: col.label };
      continue;
    }
    // "Rent", "Base Rent", "Rate": the header doesn't say. Each reading, tried against rent per SF a year
    const per = (fn) => median(pairs.map(([v, sf]) => fn(v, sf)).filter(Number.isFinite));
    const tries = [
      ['annual', per((v, sf) => v / sf)],
      ['monthly', per((v, sf) => (12 * v) / sf)],
      ['psf', per((v) => (v < 1000 ? v : NaN))],
      ['mpsf', per((v) => (v < 100 ? 12 * v : NaN))],
    ].filter(([, x]) => x !== null && Number.isFinite(x) && plausible(x));
    if (tries.length === 1) out.rent = { kind: 'rent', reading: tries[0][0], basis: 'inferred', label: col.label, alt: null };
    else {
      const pref = /\brate\b/i.test(col.label) && !/\brent\b/i.test(col.label) ? 'psf' : resi ? 'monthly' : 'annual';
      const pick = tries.find(([r]) => r === pref) || tries[0] || [pref];
      out.rent = { kind: 'rent', reading: pick[0], basis: 'guessed', label: col.label, alt: tries.filter(([r]) => r !== pick[0]).map(([r]) => r) };
    }
  }
  return out;
}

const READING_WORD = { annual: 'annual rent', monthly: 'monthly rent', psf: 'rent per SF a year', mpsf: 'rent per SF a month' };


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
    if (u && u.basis !== 'stated' && u.basis !== 'convention') {
      score -= u.basis === 'guessed' ? 0.35 : 0.15;
      why.push(u.basis === 'guessed' ? `the “${u.label}” column doesn't say whether it is monthly or annual: read as ${READING_WORD[reading]}` : `the “${u.label}” column was read as ${READING_WORD[reading]} from its figures`);
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
    for (const [k, word, all, occ] of fields) {
      const v = totalField(k);
      if (!Number.isFinite(v)) continue;
      const a = cover.reduce((s, r) => s + all(r), 0);
      const o = occ ? cover.reduce((s, r) => s + occ(r), 0) : null;
      const pass = near(v, a) || (o !== null && near(v, o));
      T.check[k] = { total: v, rows: a, occupied: o, ok: pass };
      const cellK = k === 'annual' && !T.cells.annual ? 'rent' : k === 'monthly' && !T.cells.monthly ? 'rent' : k;
      issues.push({ kind: 'total', level: pass ? 'pass' : 'fail', field: k, total: T, page: T.page, line: T.line, col: T.cells[cellK] ? T.cells[cellK].col : null, cell: T.cells[cellK] || null, lineText: T.lineText,
        text: pass ? `${T.kind === 'total' ? 'The Total row' : `The “${T.label}” row`} (page ${T.page}): ${word} ${fmtN(k, v)} equals the ${cover.length} row${cover.length === 1 ? '' : 's'} above it.`
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
 * each page's geometry from layout.js (optional). Returns { rows, totals,
 * columns, units, pages, page, segments, confidence, issues }.
 */
export function rentRoll(pages, { layouts = null } = {}) {
  const P = pages.map((p, pi) => pageLines(p, layouts && layouts[pi]));
  const geo = !!(layouts && layouts.some((g) => g && g.lines));
  const tables = [];
  let pi = 0; let li = 0;
  while (pi < P.length) {
    if (li >= P[pi].length) { pi += 1; li = 0; continue; }
    const h = headerAt(P[pi], li);
    if (!h) { li += 1; continue; }
    const t = { cols: h.cols, page: pi + 1, line: li + 1, rows: [], totals: [], segments: [], boundary: 0, lastGrand: 0, allCaps: false };
    let at = { pi, li: li + h.n, how: 'header' };
    for (;;) {
      const seg = readBody(P, at, t);
      t.segments.push(seg);
      t.allCaps = t.rows.length >= 2 && t.rows.filter((r) => r.raw.tenant && upperish(r.raw.tenant)).length > t.rows.length / 2;
      if (seg.reason !== 'page-end') { pi = at.pi; li = Math.max(seg.endLi, at.li + 1); break; }
      const nx = carryOn(P, at.pi + 1, t);
      if (!nx) { pi = at.pi + 1; li = 0; break; }
      at = nx;
    }
    if (t.rows.length) tables.push(t);
  }
  if (!tables.length) return null;
  // the rent roll: the most rent-roll-like table, and any other whose header matches it
  const best = tables.reduce((a, b) => (tableScore(b, P) > tableScore(a, P) ? b : a));
  const chosen = tables.filter((t) => t === best || sameHeader(t.cols, best.cols));
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
    for (const [k, u] of Object.entries(t.units)) {
      if (u.basis === 'inferred' || u.basis === 'guessed') {
        const col = t.cols.find((c) => c.kind === k);
        issues.push({ kind: 'unit', level: u.basis === 'guessed' ? 'fail' : 'warn', col: col.idx, page: t.page, line: t.line, row: null, cell: { page: t.page, line: t.line, col: col.idx, text: col.label }, lineText: col.label,
          text: u.basis === 'guessed'
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

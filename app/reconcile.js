/* reconcile.js -- checking figures against their sources and against each
 * other, without any AI: every rule here is arithmetic or a text search, so
 * the same inputs always give the same answer.
 *
 * - verifyQuote: is the passage a reader (the AI, or a person) cites really
 *   on that page, and does it contain the figure?
 * - reconcile: readings of the same field from several documents, grouped
 *   into values that agree within a tolerance. It never picks a winner: the
 *   broker does.
 * - crossChecks: the rent roll against the OM's own figures.
 * - rentRollQc: Data QC for a rent roll read from an OM: how it was read,
 *   its own Total row, and the OM's stated building SF, occupancy, in-place
 *   rent and gross potential rent, each check with its page, row and cell
 *   (the panel: dataqcui.js; the design: docs/proposals/data-qc.md).
 *
 * - compareRolls: the rent roll already on the deal against a newly read one,
 *   unit by unit (the PDF import's preview). It never changes either.
 *
 * Pure functions, no DOM: tested in Node (tests/reconcile.test.js). */

import { leaseStats } from './engine/figures.js';
import { toCents } from './engine/money.js';
import { inPlace } from './lease.js';

const ok = (x) => typeof x === 'number' && Number.isFinite(x);

/* ---------------------------------------------------------- normalizing */

/** A figure as printed ("$6.45M", "6,450,000", "(12,500)", "10,000 SF") to a number. */
export function parseFigure(raw) {
  if (ok(raw)) return raw;
  if (typeof raw !== 'string') return null;
  let s = raw.trim().toLowerCase().replace(/[−–]/g, '-');
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  s = s.replace(/[()$,\s]/g, '').replace(/^-/, '');
  const m = s.match(/^(\d+(?:\.\d+)?|\.\d+)(k|m|mm|b|bn|thousand|million|billion)?/);
  if (!m) return null;
  let n = Number(m[1]);
  const mult = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 }[m[2]];
  if (mult) n *= mult;
  return neg ? -n : n;
}

/** Every number printed in a passage, with suffixes ("$6.45 million" -> 6450000). */
export function numbersIn(text) {
  const out = [];
  const re = /\(?-?\$?\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)\s?(k|mm|m|b|bn|thousand|million|billion)?\b\)?/gi;
  for (const m of String(text || '').matchAll(re)) {
    const v = parseFigure(`${m[0].startsWith('(') && m[0].endsWith(')') ? '(' : ''}${m[1]}${m[2] || ''}${m[0].startsWith('(') && m[0].endsWith(')') ? ')' : ''}`);
    if (ok(v)) out.push(v);
  }
  return out;
}

/** The value a field takes, from what a document printed. Text stays text. */
export function normalizeValue(kind, raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (kind === 'text') return String(raw).trim() || null;
  const n = parseFigure(String(raw));
  if (!ok(n)) return null;
  if (kind === 'pct') {
    // "0.061" printed as a fraction is 6.1%; "6.1%" or "6.1" is 6.1
    return /%/.test(String(raw)) || n >= 1 ? n : n * 100;
  }
  if (kind === 'year') return n >= 1800 && n <= 2200 ? Math.round(n) : null;
  if (kind === 'int') return Math.round(n);
  return n;
}

/** Tolerances: money within 0.5%, areas and counts within 1%, rates within 0.05 points. */
export function sameValue(kind, a, b) {
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (kind === 'text') return squash(a) === squash(b);
  if (!ok(a) || !ok(b)) return false;
  if (kind === 'pct') return Math.abs(a - b) <= 0.05 + 1e-9;
  if (kind === 'year') return a === b;
  const tol = kind === 'int' ? 0.01 : 0.005;
  const big = Math.max(Math.abs(a), Math.abs(b));
  return big === 0 || Math.abs(a - b) / big <= tol + 1e-12;
}

/** Text for searching: lower case, one kind of quote and dash, no spaces at all (PDF text spaces unpredictably). */
export const squash = (s) => String(s || '').toLowerCase()
  .replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"').replace(/[‐-―−]/g, '-')
  .replace(/ /g, ' ').replace(/\s+/g, '');

/* -------------------------------------------------------- verifying quotes */

/**
 * pages: the document's page texts (index 0 = page 1), or one string for a
 * text document. Returns { status, page, note }:
 *   verified           the passage is on that page and holds the figure
 *   other-page         the passage is on another page (that page is returned)
 *   value-not-in-quote the passage is there but does not hold the figure
 *   not-found          the passage is nowhere in the document
 */
export function verifyQuote(pages, page, quote, value, kind) {
  const list = Array.isArray(pages) ? pages : [String(pages || '')];
  const q = squash(quote);
  if (q.length < 3) return { status: 'not-found', page: null, note: 'No passage was given.' };
  const onPage = ok(page) && page >= 1 && page <= list.length && squash(list[page - 1]).includes(q);
  let where = onPage ? page : null;
  if (!where) { const i = list.findIndex((t) => squash(t).includes(q)); if (i >= 0) where = i + 1; }
  if (!where) return { status: 'not-found', page: null, note: 'The quoted passage is not in the document.' };
  const holds = kind === 'text' ? q.includes(squash(value)) || squash(value).includes(q)
    : numbersIn(quote).some((n) => sameValue(kind, normalizeValue(kind, String(n)), value) || sameValue(kind, n, value));
  if (!holds) return { status: 'value-not-in-quote', page: where, note: 'The passage does not contain this figure.' };
  if (!onPage && list.length > 1) return { status: 'other-page', page: where, note: `Found on page ${where}${ok(page) ? `, not page ${page}` : ''}.` };
  return { status: 'verified', page: where, note: null };
}

/* -------------------------------------------------------------- reconcile */

/**
 * readings: [{ key, value, source: { kind, label, page, quote, verified } }]
 * kinds: { key: 'money' | 'pct' | 'int' | 'year' | 'money2' | 'text' }
 * Returns one entry per key: { key, status: 'single' | 'agree' | 'conflict',
 * groups: [{ value, readings }], spreadPct } -- the groups in the order first
 * seen. It never chooses: a conflict is shown to the broker with every source.
 */
export function reconcile(readings, kinds) {
  const byKey = new Map();
  for (const r of readings) {
    if (r.value === null || r.value === undefined || r.value === '') continue;
    if (!byKey.has(r.key)) byKey.set(r.key, []);
    byKey.get(r.key).push(r);
  }
  const out = [];
  for (const [key, rs] of byKey) {
    const kind = kinds[key] || 'money';
    const groups = [];
    for (const r of rs) {
      const g = groups.find((x) => sameValue(kind, x.value, r.value));
      if (g) g.readings.push(r); else groups.push({ value: r.value, readings: [r] });
    }
    const nums = groups.map((g) => g.value).filter(ok);
    const spreadPct = kind !== 'text' && kind !== 'pct' && nums.length > 1 && Math.min(...nums.map(Math.abs)) > 0
      ? ((Math.max(...nums) - Math.min(...nums)) / Math.min(...nums.map(Math.abs))) * 100 : null;
    out.push({ key, kind, status: rs.length === 1 ? 'single' : groups.length === 1 ? 'agree' : 'conflict', groups, spreadPct });
  }
  return out;
}

/* ------------------------------------------------------------ cross-checks */

/**
 * The rent roll against the OM's figures. figures: the deal's figures; rr: a
 * rentRollSummary. Each issue: { id, level: 'warn' | 'info', text, keys }.
 */
export function crossChecks(figures, rr) {
  const out = [];
  if (!rr || !rr.units) return out;
  const f = figures || {};
  const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
  // occupancy is leased SF over the building's stated SF where the OM states it: a unit missing from the rent roll is still part of the building
  const onBuilding = ok(f.bsf) && f.bsf > 0 && ok(rr.leasedSf);
  const occ = onBuilding ? (rr.leasedSf / f.bsf) * 100 : rr.occupancy;
  if (ok(f.occ) && ok(occ) && Math.abs(f.occ - occ) > 2) {
    out.push({ id: 'occ', level: 'warn', keys: ['occ'], text: `The OM states ${f.occ.toFixed(1)}% occupancy; the rent roll's leases fill ${occ.toFixed(1)}% of ${onBuilding ? `the stated ${Math.round(f.bsf).toLocaleString('en-US')} SF building` : 'its SF'}.` });
  }
  if (ok(f.bsf) && ok(rr.totalSf) && Math.abs(f.bsf - rr.totalSf) / f.bsf > 0.02) {
    out.push({ id: 'sf', level: 'warn', keys: ['bsf'], text: `The rent roll's units add up to ${Math.round(rr.totalSf).toLocaleString('en-US')} SF; the building is stated as ${Math.round(f.bsf).toLocaleString('en-US')} SF${rr.totalSf < f.bsf ? ' (a unit may be missing, or common area counted in the building)' : ''}.` });
  }
  if (ok(f.gpr) && rr.annualRent > f.gpr * 1.02) {
    out.push({ id: 'gpr', level: 'warn', keys: ['gpr'], text: `In-place rent on the rent roll (${money(rr.annualRent)}) is more than the stated gross potential rent (${money(f.gpr)}), which should include vacant space at market.` });
  }
  if (ok(f.gross) && !ok(f.gpr) && rr.annualRent > f.gross * 1.1) {
    out.push({ id: 'gross', level: 'info', keys: ['gross'], text: `In-place rent on the rent roll (${money(rr.annualRent)}) is well above the stated gross income (${money(f.gross)}): check the period each covers.` });
  }
  if (ok(f.units) && rr.units && f.units !== rr.units && Math.abs(f.units - rr.units) / f.units > 0.05) {
    out.push({ id: 'units', level: 'info', keys: ['units'], text: `The rent roll has ${rr.units} rows; the OM states ${f.units} units.` });
  }
  return out;
}

/* ---------------------------------------------------------- rent roll QC */

const pctOf = (a, b) => (b ? Math.abs(a - b) / Math.abs(b) : Infinity);
const usd0 = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const sf0 = (n) => `${Math.round(n).toLocaleString('en-US')} SF`;
const pageList = (ps) => (ps.length === 1 ? `page ${ps[0]}` : ps.length === 2 ? `pages ${ps[0]} and ${ps[1]}` : `pages ${ps[0]}–${ps[ps.length - 1]}`);

/**
 * Data QC for a rent roll read from an OM (omroll.js): one check per line,
 * each { id, kind, level: 'pass'|'warn'|'fail'|'info', text, page, line, row,
 * col, colLabel, cell: { text } | null, lineText, amount, stated? }. A fail is
 * a reading that can't be trusted as it stands (a Total that doesn't add up, a
 * rent column whose unit is a guess, a figure out of range, OCR): it holds
 * the rent roll back until the broker resolves or accepts it. A warn is the
 * OM disagreeing with itself. Every fail and warn is a Review Queue item.
 *
 * figures: the deal's figures (bsf, occ, rent_inplace, gpr, units); sources:
 * where each was read (for its page); scanned: pages with no text layer.
 */
export function rentRollQc(figures, roll, { sources = {}, scanned = [], asOf = null } = {}) {
  const f = figures || {};
  const checks = [];
  const add = (c) => checks.push({ page: null, line: null, row: null, col: null, colLabel: null, cell: null, lineText: '', amount: 0, ...c });
  const stated = (k) => (sources[k] && sources[k].page ? { page: sources[k].page, line: sources[k].line || '' } : null);
  const rollPages = roll ? roll.pages : [];
  // pages with no text layer: one next to the rent roll may hold more of it (each its own check); the rest are listed together
  const near = roll ? scanned.filter((p) => rollPages.some((q) => Math.abs(q - p) === 1)) : [];
  for (const p of near) {
    add({ id: `scanned:${p}`, kind: 'scanned', level: 'warn', page: p,
      text: `Page ${p} has no text layer (a scan or a photo), so nothing on it was read.${roll ? ` It sits next to the rent roll on ${pageList(rollPages)}, so it may hold more of it: read it with OCR, or check it by eye.` : ' If it holds the rent roll, read it with OCR.'}` });
  }
  const rest = scanned.filter((p) => !near.includes(p));
  if (rest.length) {
    // with no rent roll found there is nothing to hold them against: a note, with the reader offered beside it
    add({ id: 'scanned', kind: 'scanned', level: 'info', page: rest[0], pages: rest,
      text: `${rest.length === 1 ? `Page ${rest[0]} has` : `${rest.length} pages have`} no text layer (scans or photos)${rest.length > 1 ? `: ${rest.length > 12 ? `${rest.slice(0, 12).join(', ')}…` : rest.join(', ')}` : ''}, so nothing on ${rest.length === 1 ? 'it' : 'them'} was read.${roll ? '' : ' If one holds the rent roll, read it with OCR.'}` });
  }
  if (!roll) return checks;
  const rows = roll.rows;
  const colLabel = (i) => (Number.isInteger(i) && roll.columns[i] ? roll.columns[i].label : null);
  const vac = rows.filter((r) => r.vacant).length;
  const mtm = rows.filter((r) => r.mtm).length;
  const low = rows.filter((r) => r.confidence === 'low').length;
  // what was read, as a note: what to do about it is in the checks that follow
  add({ id: 'read', kind: 'read', level: low ? 'warn' : 'info', page: roll.page,
    text: `Read ${rows.length} row${rows.length === 1 ? '' : 's'} from ${pageList(rollPages)}: ${vac} vacant, ${mtm} month-to-month; confidence ${roll.confidence}.${low ? ` ${low} row${low === 1 ? ' has' : 's have'} low confidence: check ${low === 1 ? 'it' : 'them'} against the OM.` : ''}` });
  const seen = new Map();
  for (const i of roll.issues) {
    const base = i.kind === 'total' ? `total:${i.page}:${i.line}:${i.field}` : i.kind === 'unit' ? `unit:${i.col}` : i.row ? `${i.kind}:${i.row}${Number.isInteger(i.col) ? `:${i.col}` : ''}` : i.page ? `${i.kind}:${i.page}` : i.kind;
    const n = (seen.get(base) || 0) + 1; seen.set(base, n);
    add({ id: n > 1 ? `${base}:${n}` : base, kind: i.kind, level: i.level, text: i.text, page: i.page, line: i.line, row: i.row || null, col: Number.isInteger(i.col) ? i.col : null,
      colLabel: colLabel(i.col), cell: i.cell ? { text: i.cell.text } : null, lineText: i.lineText || '', amount: i.amount || 0 });
  }
  const st = leaseStats(rows.map((r) => ({ ...r, end: r.end ? new Date(r.end) : null })), asOf || new Date());
  const grand = [...roll.totals].reverse().find((T) => T.kind === 'total') || null;
  const totalCell = (k) => (grand && grand.cells && grand.cells[k] ? { page: grand.page, line: grand.line, col: grand.cells[k].col, colLabel: colLabel(grand.cells[k].col), cell: { text: grand.cells[k].text }, lineText: grand.lineText } : { page: roll.page });
  // the building's stated SF against the rent roll and its Total row
  if (ok(f.bsf) && f.bsf > 0 && st && st.totalSf) {
    const gap = pctOf(st.totalSf, f.bsf);
    const t = grand && ok(grand.sf) ? grand.sf : null;
    const tGap = t !== null ? pctOf(t, f.bsf) : 0;
    const bad = gap > 0.02 || tGap > 0.02;
    add({ id: 'bsf', kind: 'bsf', level: bad ? 'warn' : 'pass', ...totalCell('sf'), stated: stated('bsf'), amount: 0,
      text: bad ? `The OM states a ${sf0(f.bsf)} building; the rent roll's rows add up to ${sf0(st.totalSf)}${t !== null ? ` and its Total row prints ${sf0(t)}` : ''}${st.totalSf < f.bsf ? '. A suite may be missing from the rent roll, or common area counted in the building' : ''}.`
        : `The OM's ${sf0(f.bsf)} building agrees with the rent roll's ${sf0(st.totalSf)}${t !== null ? ` and its Total row's ${sf0(t)}` : ''}${Math.round(st.totalSf) === Math.round(f.bsf) ? '' : ' (within 2%)'}.` });
  }
  // occupancy: leased SF over the building's stated SF (the rent roll's own SF only where the OM states none)
  if (ok(f.occ) && st && st.leasedSf !== null) {
    const basis = ok(f.bsf) && f.bsf > 0 ? f.bsf : st.totalSf;
    if (basis) {
      const occ = (st.leasedSf / basis) * 100;
      const bad = Math.abs(occ - f.occ) > 2;
      add({ id: 'occ', kind: 'occ', level: bad ? 'warn' : 'pass', page: roll.page, stated: stated('occ'),
        text: `${bad ? 'The OM states' : 'The OM’s'} ${f.occ.toFixed(1)}% occupancy${bad ? '; the' : ' matches the'} rent roll's leases${bad ? ' fill' : ', which fill'} ${occ.toFixed(1)}% of ${ok(f.bsf) && f.bsf > 0 ? `the stated ${sf0(f.bsf)}` : `the rent roll's ${sf0(basis)} (the OM states no building SF)`}${bad && vac ? `, with ${vac} vacant row${vac === 1 ? '' : 's'}` : ''}.` });
    }
  }
  // the stated in-place rent against the rent roll and its Total row
  if (ok(f.rent_inplace) && f.rent_inplace > 0 && st) {
    const t = grand && ok(grand.annual) ? grand.annual : null;
    const bad = pctOf(st.rent, f.rent_inplace) > 0.02 || (t !== null && pctOf(t, f.rent_inplace) > 0.02);
    add({ id: 'rent', kind: 'rent', level: bad ? 'warn' : 'pass', ...totalCell('annual'), stated: stated('rent_inplace'), amount: Math.abs(st.rent - f.rent_inplace),
      text: bad ? `The OM states ${usd0(f.rent_inplace)} of in-place rent; the rent roll's leases add up to ${usd0(st.rent)} a year${t !== null ? ` and its Total row prints ${usd0(t)}` : ''}.`
        : `The OM's ${usd0(f.rent_inplace)} of in-place rent agrees with the rent roll's ${usd0(st.rent)}${t !== null ? ` and its Total row's ${usd0(t)}` : ''}${Math.round(st.rent) === Math.round(f.rent_inplace) && (t === null || Math.round(t) === Math.round(f.rent_inplace)) ? '' : ' (within 2%)'}.` });
  }
  // gross potential rent: in-place rent with the vacant space at the in-place average, both ways
  if (ok(f.gpr) && f.gpr > 0 && st && st.rent > 0) {
    const full = st.rent + (st.avgRentPsf && st.vacantSf ? st.avgRentPsf * st.vacantSf : 0);
    const over = st.rent > f.gpr * 1.02;
    const bad = over || pctOf(full, f.gpr) > 0.1;
    add({ id: 'gpr', kind: 'gpr', level: bad ? 'warn' : 'pass', page: roll.page, stated: stated('gpr'), amount: Math.abs(full - f.gpr),
      text: over ? `In-place rent on the rent roll (${usd0(st.rent)}) is more than the stated gross potential rent (${usd0(f.gpr)}), which should include vacant space at market.`
        : bad ? `The stated gross potential rent (${usd0(f.gpr)}) is ${full < f.gpr ? 'more' : 'less'} than the rent roll at full occupancy (${usd0(full)}, vacant space at the in-place average of $${st.avgRentPsf ? st.avgRentPsf.toFixed(2) : '0.00'}/SF) by over 10%: check the market rent assumed.`
          : `The stated gross potential rent (${usd0(f.gpr)}) is within 10% of the rent roll at full occupancy (${usd0(full)}).` });
  }
  if (ok(f.units) && f.units > 0 && Math.abs(f.units - rows.length) / f.units > 0.05) {
    add({ id: 'units', kind: 'units', level: 'warn', page: roll.page, stated: stated('units'), text: `The OM states ${f.units} units; the rent roll has ${rows.length} rows.` });
  }
  return checks;
}

/* ------------------------------------------------- two rolls, compared */

const key = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const day = (x) => (x ? String(x).slice(0, 10) : null);

/**
 * The rent roll on the deal against rows just read (omroll.js rows): units are matched by suite, then by tenant name
 * for those left, each matched once. Rent is the annual rent in place on `asOf`, compared in whole cents (the
 * engine's rounding); a field is a difference only when both sides have it, a unit only on one side is listed
 * alone. Nothing is changed and nothing is chosen: the broker decides what to keep.
 * @param {any[]} leases the deal's leases (lease.js)
 * @param {any[]} rows rows read from the document
 * @param {string} asOf ISO date the in-place rent is taken on
 * @returns {{ same: number, onlyCurrent: any[], onlyNew: any[], differs: { unit: string, tenant: string, field: string, current: any, incoming: any }[] }}
 */
export function compareRolls(leases, rows, asOf) {
  const left = new Set(rows.map((_, i) => i));
  const pairs = [];
  const take = (L, find) => {
    for (const i of left) if (find(rows[i])) { left.delete(i); pairs.push([L, rows[i]]); return true; }
    return false;
  };
  const unmatched = [];
  for (const L of leases) if (!(key(L.unit) && take(L, (r) => key(r.suite) === key(L.unit)))) unmatched.push(L);
  const onlyCurrent = [];
  for (const L of unmatched) if (!(key(L.tenant) && take(L, (r) => !r.vacant && key(r.tenant) === key(L.tenant)))) onlyCurrent.push(L);
  const onlyNew = [...left].map((i) => rows[i]);
  const differs = [];
  let same = 0;
  for (const [L, r] of pairs) {
    const before = differs.length;
    const add = (field, current, incoming) => differs.push({ unit: L.unit || r.suite || '', tenant: L.tenant || r.tenant || '', field, current, incoming });
    if (!!L.vacant !== !!r.vacant) add('status', L.vacant ? 'Vacant' : 'Leased', r.vacant ? 'Vacant' : 'Leased');
    else if (!L.vacant) {
      const cur = toCents(inPlace(L, asOf).monthly * 12);
      if (cur > 0 && Number.isFinite(r.annual) && r.annual > 0 && cur !== toCents(r.annual)) add('rent', cur, toCents(r.annual));
      if (key(L.tenant) && key(r.tenant) && key(L.tenant) !== key(r.tenant)) add('tenant', L.tenant, r.tenant);
      if (day(L.leaseStart) && day(r.start) && day(L.leaseStart) !== day(r.start)) add('start', day(L.leaseStart), day(r.start));
      if (day(L.leaseEnd) && day(r.end) && day(L.leaseEnd) !== day(r.end)) add('end', day(L.leaseEnd), day(r.end));
    }
    if (L.sf > 0 && r.sf > 0 && L.sf !== r.sf) add('SF', L.sf, r.sf);
    if (differs.length === before) same += 1;
  }
  return { same, onlyCurrent, onlyNew, differs };
}

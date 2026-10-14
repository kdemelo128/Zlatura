/* rentroll.js -- the rent roll as data: columns a firm can configure, the
 * edits a broker makes, and the summary the rest of the app reads.
 *
 * The leases themselves (dated rent periods, abatements, recoveries...) are
 * lease.js's business. This module decides what the grid shows and how a
 * typed value lands on a lease, so the screen, the Excel export and the deal
 * analysis all read the same thing. */

import { inPlace, monthlyAmount, leaseId, dayOf, DEFAULT_SETTINGS, rentRollSummary, fromOmRows } from './lease.js';
import { rentRollQc } from './reconcile.js';
import { blockingChecks } from './dataqc.js';
import { rentRoll as readRentRollTable } from './omroll.js';
import { toCents, toRate } from './engine/money.js';

const ok = (x) => typeof x === 'number' && Number.isFinite(x);
const pos = (x) => ok(x) && x > 0;

/* ---------------------------------------------------------------- columns */

/**
 * Every built-in column. `get` reads a lease (with the rent roll's as-of date
 * and settings), `set` writes a typed value back, and a column with no `set`
 * is worked out, not typed. Kinds: text, int, money, money2, pct, date, select.
 */
export const COLUMNS = {
  unit: { label: 'Unit / suite', kind: 'text', width: 90, get: (L) => L.unit, set: (L, v) => { L.unit = v || ''; } },
  tenant: { label: 'Tenant', kind: 'text', width: 180, get: (L) => (L.vacant ? '' : L.tenant), set: (L, v) => { L.tenant = v || ''; } },
  unitType: { label: 'Unit type', kind: 'text', width: 90, get: (L) => L.unitType, set: (L, v) => { L.unitType = v || ''; } },
  sf: { label: 'SF', kind: 'int', width: 80, get: (L) => L.sf, set: (L, v) => { L.sf = pos(v) ? v : null; } },
  status: {
    label: 'Status', kind: 'select', width: 110, options: ['Occupied', 'Vacant', 'Notice to vacate', 'Month to month', 'Holdover', 'Signed, not started'],
    get: (L) => L.status || (L.vacant ? 'Vacant' : L.mtm ? 'Month to month' : 'Occupied'),
    set: (L, v) => { L.status = v; L.vacant = v === 'Vacant'; L.mtm = v === 'Month to month'; },
  },
  leaseStart: { label: 'Lease start', kind: 'date', width: 120, get: (L) => L.leaseStart, set: (L, v) => { L.leaseStart = v || null; } },
  rentStart: { label: 'Rent start', kind: 'date', width: 120, get: (L) => L.rentStart, set: (L, v) => { L.rentStart = v || null; } },
  leaseEnd: { label: 'Lease end', kind: 'date', width: 120, get: (L) => L.leaseEnd, set: (L, v) => { L.leaseEnd = v || null; } },
  monthly: { label: 'Monthly rent', kind: 'money', width: 110, get: (L, c) => (L.vacant ? null : inPlace(L, c.asOf).monthly || null), set: (L, v, c) => setCurrentRent(L, v, 'month', c) },
  annual: { label: 'Annual rent', kind: 'money', width: 120, get: (L, c) => (L.vacant ? null : inPlace(L, c.asOf).monthly * 12 || null), set: (L, v, c) => setCurrentRent(L, v, 'year', c) },
  psf: { label: 'Rent / SF / yr', kind: 'money2', width: 100, get: (L, c) => { const m = inPlace(L, c.asOf).monthly; return !L.vacant && m && pos(L.sf) ? (m * 12) / L.sf : null; }, set: (L, v, c) => setCurrentRent(L, v, 'psf_year', c) },
  netNow: { label: 'Rent after concessions', kind: 'money', width: 120, get: (L, c) => (L.vacant ? null : inPlace(L, c.asOf).net * 12 || null) },
  marketRent: {
    label: 'Market rent', kind: 'money2', width: 100,
    get: (L, c) => (ok(L.marketRent) ? L.marketRent : c.settings.marketRent ?? null),
    set: (L, v) => { L.marketRent = ok(v) ? v : null; },
  },
  lossToLease: {
    label: 'Loss to lease / yr', kind: 'money', width: 120,
    get: (L, c) => {
      if (L.vacant) return null;
      const mkt = monthlyAmount(ok(L.marketRent) ? L.marketRent : c.settings.marketRent, L.marketUnit || c.settings.marketUnit || 'psf_year', L.sf);
      const m = inPlace(L, c.asOf).monthly;
      return mkt !== null && m ? (mkt - m) * 12 : null;
    },
  },
  share: {
    label: 'Pro-rata share %', kind: 'pct', width: 90,
    get: (L, c) => (L.recovery && ok(L.recovery.share) ? L.recovery.share : (pos(L.sf) && c.totalSf ? (L.sf / c.totalSf) * 100 : null)),
    set: (L, v) => { L.recovery = { method: 'prorata', ...(L.recovery || {}), share: ok(v) ? v : null }; },
  },
  recovery: {
    label: 'Recoveries', kind: 'select', width: 120, options: ['None (gross)', 'Pro rata (NNN)', 'Over base year', 'Over expense stop', 'Fixed amount'],
    get: (L) => RECOVERY_LABEL[(L.recovery && L.recovery.method) || 'none'],
    set: (L, v) => { L.recovery = { ...(L.recovery || {}), method: RECOVERY_KEY[v] || 'none' }; },
  },
  deposit: { label: 'Security deposit', kind: 'money', width: 110, get: (L) => L.deposit, set: (L, v) => { L.deposit = ok(v) ? v : null; } },
  arrears: { label: 'Arrears', kind: 'money', width: 100, get: (L) => L.arrears, set: (L, v) => { L.arrears = ok(v) ? v : null; } },
  options: { label: 'Options', kind: 'text', width: 160, get: (L) => L.options, set: (L, v) => { L.options = v || ''; } },
  yearsLeft: { label: 'Years left', kind: 'dec', width: 80, get: (L, c) => { const e = dayOf(L.leaseEnd); const d = dayOf(c.asOf); return !L.vacant && e !== null && d !== null ? Math.max(0, (e - d) / 365.25) : null; } },
  nextStep: {
    label: 'Next rent change', kind: 'text', width: 140,
    get: (L, c) => {
      const d = dayOf(c.asOf);
      const p = (L.periods || []).filter((x) => dayOf(x.start) > d).sort((a, b) => dayOf(a.start) - dayOf(b.start))[0];
      if (!p) return '';
      const mo = monthlyAmount(p.rate, p.unit, L.sf);
      return `${p.start}${mo !== null ? `: $${Math.round(mo * 12).toLocaleString('en-US')}/yr` : ''}`;
    },
  },
  notes: { label: 'Notes', kind: 'text', width: 200, get: (L) => L.notes, set: (L, v) => { L.notes = v || ''; } },
};
const RECOVERY_LABEL = { none: 'None (gross)', prorata: 'Pro rata (NNN)', base_year: 'Over base year', stop: 'Over expense stop', fixed: 'Fixed amount' };
const RECOVERY_KEY = Object.fromEntries(Object.entries(RECOVERY_LABEL).map(([k, v]) => [v, k]));

/** Column sets for each kind of property: a starting point, every one editable. */
export const PRESETS = {
  Multifamily: ['unit', 'unitType', 'sf', 'status', 'tenant', 'leaseStart', 'leaseEnd', 'monthly', 'marketRent', 'lossToLease', 'deposit', 'arrears'],
  Office: ['unit', 'tenant', 'sf', 'share', 'status', 'leaseStart', 'rentStart', 'leaseEnd', 'annual', 'psf', 'recovery', 'marketRent', 'nextStep', 'options'],
  Retail: ['unit', 'tenant', 'sf', 'share', 'status', 'leaseStart', 'leaseEnd', 'annual', 'psf', 'recovery', 'marketRent', 'options'],
  Industrial: ['unit', 'tenant', 'sf', 'status', 'leaseStart', 'leaseEnd', 'annual', 'psf', 'recovery', 'marketRent', 'yearsLeft'],
  'Mixed use': ['unit', 'unitType', 'tenant', 'sf', 'status', 'leaseStart', 'leaseEnd', 'monthly', 'annual', 'psf', 'marketRent'],
};
/** Market rent is per unit per month for apartments, per SF per year for everything else. */
export const MARKET_UNIT = { Multifamily: 'month' };

export function presetFor(ptype) {
  const t = String(ptype || '');
  if (/multi|apartment|residential/i.test(t)) return 'Multifamily';
  if (/industrial|warehouse|flex/i.test(t)) return 'Industrial';
  if (/mixed/i.test(t)) return 'Mixed use';
  if (/office|medical/i.test(t)) return 'Office';
  return 'Retail';
}

/** A column layout: [{ key, label, width, hidden, custom, kind }]. */
export function layoutFromPreset(name) {
  return (PRESETS[name] || PRESETS.Retail).map((key) => ({ key, label: COLUMNS[key].label, width: COLUMNS[key].width, hidden: false }));
}

/** The columns to draw, in order, with built-in definitions merged in. */
export function visibleColumns(layout) {
  return (layout || []).filter((c) => !c.hidden).map((c) => {
    if (c.custom) return { ...c, kind: c.kind || 'text', get: (L) => (L.custom || {})[c.key], set: (L, v) => { (L.custom ||= {})[c.key] = v; } };
    const def = COLUMNS[c.key];
    return def ? { ...def, ...c, label: c.label || def.label, get: def.get, set: def.set } : null;
  }).filter(Boolean);
}

/** A new custom column: a firm's own field, typed per lease. */
export function customColumn(label, kind = 'text') {
  const key = `c_${String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24)}_${Math.random().toString(36).slice(2, 5)}`;
  return { key, label: String(label).trim() || 'Custom', kind, width: 120, hidden: false, custom: true };
}

/* ---------------------------------------------------------------- edits */

/**
 * A rent typed into the grid changes the period in force on the as-of date,
 * converted into that period's own unit, and marks it typed by the broker.
 * With no period in force (a new lease), one is created from the lease dates.
 */
export function setCurrentRent(L, value, unit, c) {
  if (!ok(value) || value < 0) return;
  const d = dayOf(c.asOf);
  const monthly = monthlyAmount(value, unit, L.sf);
  if (monthly === null) return;
  const p = (L.periods || []).find((x) => dayOf(x.start) <= d && dayOf(x.end) >= d);
  if (p) {
    const per = monthlyAmount(1, p.unit, L.sf);
    if (per) { p.rate = monthly / per; p.edited = true; }
    return;
  }
  const start = L.rentStart || L.leaseStart || c.asOf;
  const end = L.leaseEnd || null;
  if (!end) return;
  (L.periods ||= []).push({ start, end, rate: monthly * 12, unit: 'year', source: 'documented', edited: true, note: 'typed in the rent roll' });
}

/** @param {RentRoll} rr @param {Partial<Lease>} [extra] @returns {Lease} */
export function newLease(rr, extra = {}) {
  const n = (rr.leases || []).length + 1;
  return { id: leaseId(), unit: String(100 + n), tenant: '', sf: null, vacant: false, leaseStart: null, rentStart: null, leaseEnd: null, periods: [], abatements: [], oneTime: [], custom: {}, source: { kind: 'typed' }, ...extra };
}

export function duplicateLease(L) {
  const copy = JSON.parse(JSON.stringify(L));
  copy.id = leaseId();
  copy.unit = `${L.unit || ''} copy`.trim();
  copy.source = { kind: 'typed', from: L.id };
  return copy;
}

/** An empty rent roll for a deal, with columns suited to its property type. */
export function emptyRentRoll(ptype, asOf, buildingSf = null) {
  const preset = presetFor(ptype);
  return { settings: { ...DEFAULT_SETTINGS, asOf, buildingSf, marketUnit: MARKET_UNIT[preset] || 'psf_year' }, leases: [], columns: layoutFromPreset(preset), preset };
}

/**
 * The flat rows the deal analysis has always read (deal.js leaseStats): the
 * rent in force on the as-of date and the lease end. Kept in step with the
 * rent roll so occupancy, WALT and the checks agree with it.
 */
export function legacyRows(rr) {
  const asOf = (rr.settings || {}).asOf;
  return (rr.leases || []).map((L) => {
    const ip = inPlace(L, asOf);
    return {
      suite: L.unit, tenant: L.vacant ? 'Vacant' : L.tenant, sf: L.sf, vacant: !!L.vacant || !ip.monthly,
      annual: L.vacant ? null : ip.monthly * 12 || null, psf: !L.vacant && ip.monthly && pos(L.sf) ? (ip.monthly * 12) / L.sf : null,
      end: L.leaseEnd ? new Date(`${L.leaseEnd}T00:00:00Z`).toISOString() : null, mtm: !!L.mtm,
    };
  });
}

/** The context the column getters read. */
export function gridContext(rr) {
  const s = { ...DEFAULT_SETTINGS, ...(rr.settings || {}) };
  const totalSf = (rr.leases || []).reduce((x, L) => x + (pos(L.sf) ? L.sf : 0), 0) || s.buildingSf || null;
  return { asOf: s.asOf, settings: s, totalSf };
}

/** Rows filtered by a search and sorted by a column, for the grid. */
export function viewRows(rr, { query = '', sort = null, dir = 1, status = 'all' } = {}) {
  const c = gridContext(rr);
  const q = String(query).trim().toLowerCase();
  let rows = (rr.leases || []).filter((L) => !q || [L.unit, L.tenant, L.notes, L.unitType, ...Object.values(L.custom || {})].some((x) => x && String(x).toLowerCase().includes(q)));
  if (status === 'vacant') rows = rows.filter((L) => L.vacant);
  if (status === 'occupied') rows = rows.filter((L) => !L.vacant);
  if (status === 'expiring') {
    const d = dayOf(c.asOf);
    rows = rows.filter((L) => !L.vacant && dayOf(L.leaseEnd) !== null && dayOf(L.leaseEnd) - d <= 730);
  }
  if (sort) {
    const def = COLUMNS[sort];
    const get = def ? (L) => def.get(L, c) : (L) => (L.custom || {})[sort];
    rows = [...rows].sort((a, b) => {
      const x = get(a); const y = get(b);
      if (x === y) return 0;
      if (x === null || x === undefined || x === '') return 1;
      if (y === null || y === undefined || y === '') return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) * dir;
    });
  }
  return rows;
}

export { rentRollSummary };

/* ------------------------------------------------- the OM's rent roll, checked */

const isoDate = (d) => (d instanceof Date ? (Number.isNaN(d.getTime()) ? null : d.toISOString()) : d || null);
/** An OM row as a deal keeps it: dates as ISO text. */
export const storedRow = (r) => ({
  ...r, start: isoDate(r.start), end: isoDate(r.end),
  // money as all stored money is kept: totals to whole cents, rates per SF to four places (engine/money.js)
  ...(ok(r.annual) ? { annual: toCents(r.annual) } : {}), ...(ok(r.monthly) ? { monthly: toCents(r.monthly) } : {}), ...(ok(r.psf) ? { psf: toRate(r.psf) } : {}),
});

/**
 * What a deal keeps of an OM's rent roll as read (om.js readOm): the rows to
 * use now, and the Data QC record (`deal.rrQc`): pages, columns, totals, the
 * checks (reconcile.js rentRollQc) and, while a check fails, the rows held
 * back. Null when the OM has neither a rent roll nor a page without text.
 */
export function omRollRecord(om, { figures = {}, sources = {}, asOf = null, file = '' } = {}) {
  const roll = om && om.rentRoll;
  const scanned = (om && om.scanned) || [];
  if (!roll && !scanned.length) return { qc: null, rows: [] };
  const rows = roll ? roll.rows.map(storedRow) : [];
  const qc = {
    v: 1, at: Date.now(), file, pages: roll ? roll.pages : [], page: roll ? roll.page : null, scanned, confidence: roll ? roll.confidence : null,
    columns: roll ? roll.columns : [], totals: roll ? roll.totals.map(({ cells, ...T }) => ({ ...T, cells })) : [], segments: roll ? roll.segments : [],
    checks: rentRollQc(figures, roll, { sources, scanned, asOf }), held: null, applied: false, ocr: [],
  };
  const hold = rows.length > 0 && blockingChecks(qc).length > 0;
  if (hold) qc.held = rows;
  qc.applied = rows.length > 0 && !hold;
  return { qc, rows: hold ? [] : rows };
}

/** A rent roll of leases from OM rows, set up as a new deal's is (migrate.js, step "rent-roll"). */
function rollFromRows(d, rows, today) {
  const bsf = d.figures && Number.isFinite(d.figures.bsf) ? d.figures.bsf : null;
  const preset = presetFor(d.figures && d.figures.ptype);
  const rr = fromOmRows(rows, { asOf: today, page: (d.rrQc && d.rrQc.page) || d.rentRollPage || null, buildingSf: bsf });
  rr.columns = layoutFromPreset(preset);
  rr.preset = preset;
  rr.settings.marketUnit = MARKET_UNIT[preset] || 'psf_year';
  if (d.figures && Number.isFinite(d.figures.opex)) rr.settings.opex = d.figures.opex;
  return rr;
}

/**
 * The rows a failed check held back, now the broker has resolved or accepted
 * every fail: they become the deal's rent roll. Returns 'applied', 'kept'
 * (the deal's rent roll has units already: nothing is overwritten) or null.
 */
export function applyHeldRows(d, today) {
  const qc = d && d.rrQc;
  if (!qc || !Array.isArray(qc.held) || !qc.held.length || blockingChecks(qc).length) return null;
  if (d.rr && Array.isArray(d.rr.leases) && d.rr.leases.length) { qc.keptNote = 'The rent roll already has units, so the OM’s rows were not put over them.'; return 'kept'; }
  d.rentRoll = qc.held;
  d.rentRollPage = qc.page;
  d.rr = rollFromRows(d, qc.held, today);
  qc.held = null;
  qc.applied = true;
  return 'applied';
}

/**
 * Rows read by OCR from a scanned page, once the broker accepts them: added
 * to the rent roll (or, with none yet, made into one). Each lease's source
 * says OCR. Returns how many were added.
 */
export function addOcrRows(d, page, today) {
  const qc = d && d.rrQc;
  const o = qc && (qc.ocr || []).find((x) => x.page === page);
  if (!o || o.added || !o.rows.length) return 0;
  if (d.rr && Array.isArray(d.rr.leases) && d.rr.leases.length) {
    const more = fromOmRows(o.rows, { asOf: d.rr.settings.asOf || today, page }).leases;
    d.rr.leases.push(...more);
  } else d.rr = rollFromRows(d, o.rows, today);
  d.rentRoll = legacyRows(d.rr);
  o.added = true;
  return o.rows.length;
}

/**
 * A scanned page read by OCR (ocr.js), run through the same rent roll reader
 * and kept on the Data QC record: its rows (marked OCR, low confidence) wait
 * there, behind a failing check, until the broker accepts them. Returns how
 * many rows were found.
 */
export function ocrReading(qc, page, res, at = Date.now()) {
  const pages = Array(page).fill(''); pages[page - 1] = res.text || '';
  const layouts = Array(page).fill(null); layouts[page - 1] = res.geom || null;
  const roll = readRentRollTable(pages, { layouts });
  const rows = roll ? roll.rows.map((r) => storedRow({ ...r, ocr: true, confidence: 'low' })) : [];
  const failed = roll ? roll.issues.filter((i) => i.level === 'fail').length : 0;
  qc.ocr = (qc.ocr || []).filter((o) => o.page !== page);
  qc.ocr.push({ page, at, rows, words: res.words || 0, conf: Math.round(res.conf || 0), added: false });
  qc.checks = (qc.checks || []).filter((c) => c.id !== `ocr:${page}`);
  const sc = qc.checks.find((c) => c.id === `scanned:${page}`);
  if (sc && !sc.resolved) sc.resolved = { how: 'ocr', at };
  const base = { id: `ocr:${page}`, kind: 'ocr', page, line: null, row: null, col: null, colLabel: null, cell: null, lineText: '' };
  qc.checks.push(rows.length
    ? { ...base, level: 'fail', amount: rows.reduce((s, r) => s + (Number.isFinite(r.annual) ? r.annual : 0), 0),
      text: `Page ${page} was read by OCR: ${rows.length} row${rows.length === 1 ? '' : 's'} from ${res.words || 0} words (mean OCR confidence ${Math.round(res.conf || 0)}%)${failed ? `, and ${failed} of its own checks failed` : ''}. A figure read this way can be wrong: compare each row with the page. Accepting adds them to the rent roll, marked OCR.` }
    : { ...base, level: 'info', amount: 0, text: `Page ${page} was read by OCR (${res.words || 0} words), but no rent roll table with a header was found on it. If it holds rows, enter them by hand.` });
  return rows.length;
}

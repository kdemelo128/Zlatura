/* uwfiller/bridge.js -- the one place the open deal and the built-in underwriting tool (app/uwtool/) meet.
 * Pure functions only: no page, no storage, no frame. They take plain objects and return plain objects, so every
 * mapping is tested in Node (tests/uwbridge.test.js). underwrite.js does the frame and the deal.
 *
 * The map is the exact rows of docs/proposals/uw-bridge-fieldmap.md section 2, and nothing else:
 *   in  (deal -> tool, when the tool opens): name, as-of date, price, interest rate, amortization, hold years,
 *       exit cap, sale cost;
 *   out (tool -> deal, only after "Bring into deal" is confirmed): price, interest rate, amortization, hold years,
 *       exit cap, sale cost.
 * Rules: a blank stays blank (null in the deal, '' in the tool), never 0 and never the tool's starting value;
 * percent numbers in the deal (6.5) are decimals in the tool (0.065); money is whole cents; a value the tool already
 * holds is never replaced; a tool value still at its starting value is not the broker's and is never brought back.
 * Everything with a unit or reading to guess (address parts, loan amount, closing costs, interest-only, building
 * area, the rent roll and statement, every computed result) is not carried, and is listed with its reason. */

import { roundTo, toCents } from '../engine/money.js';

const ok = (x) => typeof x === 'number' && Number.isFinite(x);
const blank = (v) => v === '' || v === null || v === undefined;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TOOL_NAME_BLANK = 'Untitled property';   // the tool's own starting name (UW.blank())
const pctToDec = (v) => roundTo(v / 100, 10);
const decToPct = (v) => roundTo(v * 100, 8);

const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const put = (o, path, v) => { const ks = path.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => (a[k] ??= {}), o); t[last] = v; };

/** One row of the map. `read` takes the deal (as dealData) and gives the tool's value, or null when the deal has none
 * (or one the tool cannot take); `back` takes the tool's value and gives the deal's, or null. */
const ROWS = [
  { id: 'name', label: 'Property name', path: 'name', start: TOOL_NAME_BLANK, shown: (v) => String(v),
    read: (d) => (typeof d.name === 'string' && d.name.trim() ? d.name.trim() : null) },
  { id: 'asOf', label: 'Rent roll as-of date', path: 'asOf', shown: (v) => String(v),
    read: (d) => (typeof d.asOf === 'string' && ISO.test(d.asOf) ? d.asOf : null) },
  { id: 'price', label: 'Price', path: 'finance.price', fin: 'price', shown: (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    read: (d) => (ok(d.figures?.price) && d.figures.price > 0 ? toCents(d.figures.price) : null),
    back: (v) => (ok(v) && v > 0 ? toCents(v) : null), dealPath: 'figures.price', dealShown: (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  { id: 'rate', label: 'Interest rate', path: 'finance.rate', fin: 'rate', shown: (v) => `${decToPct(v)}%`,
    read: (d) => (ok(d.loan?.rate) && d.loan.rate > 0 && d.loan.rate <= 100 ? pctToDec(d.loan.rate) : null),
    back: (v) => (ok(v) && v > 0 && v <= 1 ? decToPct(v) : null), dealPath: 'loan.rate', dealShown: (v) => `${v}%` },
  { id: 'amort', label: 'Amortization, years', path: 'finance.amortization', fin: 'amortization', shown: (v) => `${v} years`,
    read: (d) => (Number.isInteger(d.loan?.amort) && d.loan.amort > 0 && d.loan.amort <= 50 ? d.loan.amort : null),
    why: (d) => (ok(d.loan?.amort) ? 'the deal’s amortization is not a whole number of years, 50 at most, as the tool takes' : null),
    back: (v) => (Number.isInteger(v) && v > 0 && v <= 50 ? v : null), dealPath: 'loan.amort', dealShown: (v) => `${v} years` },
  { id: 'hold', label: 'Hold period, years', path: 'finance.holdYears', fin: 'holdYears', shown: (v) => `${v} years`,
    read: (d) => (Number.isInteger(d.live?.hold) && d.live.hold >= 1 && d.live.hold <= 10 ? d.live.hold : null),
    why: (d) => (ok(d.live?.hold) ? (Number.isInteger(d.live.hold) ? 'the deal’s hold is outside the tool’s 1 to 10 years' : 'the deal’s hold is not a whole number of years') : null),
    back: (v) => (Number.isInteger(v) && v >= 1 && v <= 10 ? v : null), dealPath: 'live.hold', dealShown: (v) => `${v} years` },
  { id: 'exitCap', label: 'Exit cap rate', path: 'finance.exitCap', fin: 'exitCap', shown: (v) => `${decToPct(v)}%`,
    read: (d) => (ok(d.live?.exitCap) && d.live.exitCap > 0 && d.live.exitCap <= 100 ? pctToDec(d.live.exitCap) : null),
    back: (v) => (ok(v) && v > 0 && v <= 1 ? decToPct(v) : null), dealPath: 'live.exitCap', dealShown: (v) => `${v}%` },
  { id: 'saleCost', label: 'Sale costs', path: 'finance.saleCost', fin: 'saleCost', shown: (v) => `${decToPct(v)}%`,
    read: (d) => (ok(d.live?.saleCost) && d.live.saleCost >= 0 && d.live.saleCost <= 100 ? pctToDec(d.live.saleCost) : null),
    back: (v) => (ok(v) && v >= 0 && v <= 1 ? decToPct(v) : null), dealPath: 'live.saleCost', dealShown: (v) => `${v}%` },
];
export const MAPPED = ROWS.map((r) => r.id);

/** Is the tool's value one the broker did not set? Blank, or its own starting value with no recorded change to it. */
function untouched(row, model, defaults, changed) {
  const v = get(model, row.path);
  if (blank(v)) return true;
  if (row.start !== undefined && v === row.start) return true;
  if (row.fin && !changed.has(row.path) && defaults && defaults[row.fin] === v && !blank(defaults[row.fin])) return true;
  return false;
}

const same = (a, b) => (ok(a) && ok(b) ? Math.abs(a - b) < 1e-9 : a === b);

/**
 * What opening the tool for this deal does. Nothing is changed here.
 * @param {{ name?: string, confidential?: boolean, asOf?: string, figures?: any, loan?: any, live?: any, hasRentRoll?: boolean, hasStatement?: boolean }} deal
 * @param {any} model the tool's model (UWEditor.model())
 * @param {{ defaults?: any, changed?: Set<string> }} [opts] the tool's own starting values, and the paths the broker has changed
 * @returns {{ fill: { id: string, path: string, label: string, value: any, shown: string }[], kept: { id: string, label: string, why: string }[], notCarried: { label: string, why: string }[] }}
 */
export function planIn(deal, model, { defaults = {}, changed = new Set() } = {}) {
  const fill = []; const kept = []; const notCarried = [];
  if (deal.confidential) {   // the tool keeps one shared project; a confidential deal's figures do not go into it until each deal has its own
    for (const r of ROWS) notCarried.push({ label: r.label, why: 'confidential deal: it is not put into the tool’s shared project' });
    return { fill, kept, notCarried };
  }
  for (const r of ROWS) {
    const v = r.read(deal);
    const cur = get(model, r.path);
    if (v === null) {
      if (r.id === 'name' || r.id === 'asOf') continue;
      const had = (r.why && r.why(deal)) || 'the deal has no value for it';
      notCarried.push({ label: r.label, why: `${had}; the tool is left as it is${r.start === undefined && r.fin && !blank(defaults[r.fin]) ? ` (it starts at ${r.shown(defaults[r.fin])}: check it)` : ''}` });
      continue;
    }
    if (same(cur, v)) continue;
    if (untouched(r, model, defaults, changed)) fill.push({ id: r.id, path: r.path, label: r.label, value: v, shown: r.shown(v) });
    else kept.push({ id: r.id, label: r.label, why: `the tool already has ${r.shown(cur)} and the deal has ${r.shown(v)}; the tool’s value is not replaced` });
  }
  for (const k of kept) notCarried.push({ label: k.label, why: k.why });
  const f = deal.figures || {}; const L = deal.loan || {};
  if (!blank(f.address) || !blank(f.city) || !blank(f.state) || !blank(f.zip)) notCarried.push({ label: 'Address', why: 'the deal keeps street, city, state and zip apart and the tool has one line; nothing is joined or split' });
  if (ok(f.bsf)) notCarried.push({ label: 'Building area', why: 'the tool has no building-area field, and building area is never given to a tenant as its SF' });
  if (ok(L.ltv)) notCarried.push({ label: 'Loan amount', why: 'the deal stores a percent of price and the tool a dollar amount' });
  if (ok(L.closing)) notCarried.push({ label: 'Closing costs', why: 'the deal stores a percent of price and the tool a dollar amount' });
  if (L.io) notCarried.push({ label: 'Interest-only', why: 'the deal says whole term or none; the tool counts months: set them in the tool' });
  if (deal.hasRentRoll) notCarried.push({ label: 'Rent roll', why: 'typed leases are not sent (monthly or annual rent and the area basis cannot be guessed); drop the file in the tool, or review it in the deal' });
  if (deal.hasStatement) notCarried.push({ label: 'Operating statement', why: 'statement lines are not sent; drop the file in the tool, or review it in the deal' });
  notCarried.push({ label: 'Results', why: 'NOI, cap rate, DSCR and returns are computed by each side and never sent' });
  return { fill, kept, notCarried };
}

/** Write a plan's fills into the tool's model (a copy is not made: pass the live model, then commit it). Returns the count. */
export function applyIn(model, plan) {
  for (const f of plan.fill) put(model, f.path, f.value);
  return plan.fill.length;
}

/**
 * What "Bring into deal" would change, for the confirm sheet: a before and an after for each field. A tool value that
 * is blank, or still at the tool's own starting value, is never brought (it would clear the deal, or invent a value).
 * @returns {{ changes: { id: string, label: string, dealPath: string, before: any, after: any, beforeShown: string, afterShown: string }[], skipped: { label: string, why: string }[] }}
 */
export function planOut(model, deal, { defaults = {}, changed = new Set(), filled = {} } = {}) {
  const mine = (path, v) => Object.values(filled).some((rec) => rec && path in rec && same(rec[path], v));
  const changes = []; const skipped = [];
  for (const r of ROWS) {
    if (!r.back) continue;
    const raw = get(model, r.path);
    if (blank(raw)) { skipped.push({ label: r.label, why: 'blank in the tool' }); continue; }
    if (untouched(r, model, defaults, changed)) { skipped.push({ label: r.label, why: 'still the tool’s starting value, not one you set' }); continue; }
    if (mine(r.path, raw)) { skipped.push({ label: r.label, why: 'filled in from a deal, not set by you' }); continue; }
    const after = r.back(raw);
    if (after === null) { skipped.push({ label: r.label, why: 'not a value the deal can take' }); continue; }
    const before = get(deal, r.dealPath);
    const has = !(before === null || before === undefined || before === '');
    if (has && same(before, after)) continue;
    changes.push({ id: r.id, label: r.label, dealPath: r.dealPath, before: has ? before : null, after, beforeShown: has ? r.dealShown(before) : 'blank', afterShown: r.dealShown(after) });
  }
  return { changes, skipped };
}

/** The paths the broker has changed, from the tool's change log (UWJournal), or an empty set. */
export function changedPaths(model) {
  const out = new Set();
  for (const e of Array.isArray(model?.changeLog) ? model.changeLog : []) for (const c of Array.isArray(e?.changes) ? e.changes : []) if (c && typeof c.path === 'string') out.add(c.path);
  return out;
}

/** The record of what the bridge filled into the tool, per deal id and path: `{ [dealId]: { [path]: value } }`. Returns a new record. */
export function fillRecord(rec, dealId, fills) {
  const out = { ...(rec || {}) };
  out[dealId] = { ...(out[dealId] || {}), ...Object.fromEntries(fills.map((f) => [f.path, f.value])) };
  return out;
}

/* ----- the Quick check inside the tool's Model step (release 3 of docs/proposals/one-underwriting-space.md) -----
 * The panel's inputs start from the tool's own figures, by the same rules as above: a blank stays blank (null), a value
 * the tool still has at its starting value is not the broker's and is not prefilled, percent numbers are read from the
 * tool's decimals exactly, money is whole cents. The loan and closing costs are dollars in the tool and percents of price
 * in the engine: they are converted only when the price is a positive dollar figure (plain division, nothing guessed). */

const QROW = {
  rate: ROWS.find((r) => r.id === 'rate'), amort: ROWS.find((r) => r.id === 'amort'), hold: ROWS.find((r) => r.id === 'hold'),
  exitCap: ROWS.find((r) => r.id === 'exitCap'), saleCost: ROWS.find((r) => r.id === 'saleCost'),
};
const pctOfPrice = (dollars, price) => roundTo((dollars / price) * 100, 10);

/**
 * The Quick check's starting figures from the tool. Nothing is changed.
 * @param {any} model the tool's model (UWEditor.model())
 * @param {{ noi?: number | null, defaults?: any, changed?: Set<string> }} [opts] noi: the tool's own first forecast year NOI; it is used only when the tool holds a tenant or an account (an empty model's 0 is no one's NOI)
 * @returns {{ values: { price: number|null, noi: number|null, ltv: number|null, rate: number|null, amort: number|null, closing: number|null, hold: number|null, exitCap: number|null, saleCost: number|null }, blank: { label: string, why: string }[] }}
 */
export function quickFromTool(model, { noi = null, defaults = {}, changed = new Set() } = {}) {
  const f = model?.finance || {};
  const values = { price: null, noi: null, ltv: null, rate: null, amort: null, closing: null, hold: null, exitCap: null, saleCost: null };
  const left = [];
  const hasSource = (Array.isArray(model?.tenants) ? model.tenants.length : 0) + (Array.isArray(model?.accounts) ? model.accounts.length : 0) > 0;
  const price = ok(+f.price) && !blank(f.price) && +f.price > 0 ? toCents(+f.price) : null;
  values.price = price;
  if (price === null) left.push({ label: 'Price', why: 'blank in the tool' });
  if (hasSource && ok(noi)) values.noi = toCents(noi); else left.push({ label: 'NOI', why: hasSource ? 'the tool has no NOI yet' : 'the tool has no rent roll or statement yet' });
  const mineRow = (r, key) => !untouched(r, model, defaults, changed) && !blank(f[key]);
  for (const [id, key] of [['rate', 'rate'], ['amort', 'amortization'], ['hold', 'holdYears'], ['exitCap', 'exitCap'], ['saleCost', 'saleCost']]) {
    const r = QROW[id];
    const v = mineRow(r, key) ? r.back(get(model, r.path)) : null;
    values[id] = v;
    if (v === null) left.push({ label: r.label, why: blank(f[key]) ? 'blank in the tool' : untouched(r, model, defaults, changed) ? 'still the tool’s starting value, not one you set' : 'not a value the check can take' });
  }
  // dollars in the tool, percent of price here
  const dollars = (key, label, id) => {
    const raw = f[key];
    const pseudo = { path: `finance.${key}`, fin: key };
    if (blank(raw) || !ok(+raw)) { left.push({ label, why: 'blank in the tool' }); return; }
    if (untouched(pseudo, model, defaults, changed)) { left.push({ label, why: 'still the tool’s starting value, not one you set' }); return; }
    if (price === null) { left.push({ label, why: 'a dollar amount in the tool, a percent of price here: it needs the price' }); return; }
    if (+raw < 0) { left.push({ label, why: 'negative in the tool' }); return; }
    values[id] = pctOfPrice(+raw, price);
  };
  dollars('loan', 'Loan to value', 'ltv');
  dollars('closing', 'Closing costs', 'closing');
  return { values, blank: left };
}

/** The tool's own figures for the two measures the engine also gives, in whole cents (null where the tool has none). */
export function toolMeasures(model, calc) {
  const f = model?.finance || {};
  const loan = !blank(f.loan) && ok(+f.loan) && +f.loan > 0 ? toCents(+f.loan) : null;
  const equity = calc && !(calc.errors && calc.errors.length) && ok(calc.equity) ? toCents(calc.equity) : null;
  return { loan, equity };
}

/**
 * Where the tool's figure and the engine's figure for the same measure differ by more than a cent: both are shown, and
 * the deal keeps the engine's (owner decision 1, 2026-11-12). Compared in whole cents.
 * @param {{ loan?: number|null, equity?: number|null }} engine
 * @param {{ loan?: number|null, equity?: number|null }} tool
 * @returns {{ id: string, label: string, engine: number, tool: number, diff: number }[]}
 */
export function measureFlags(engine, tool) {
  const out = [];
  for (const [id, label] of [['loan', 'Loan'], ['equity', 'Equity']]) {
    const e = engine?.[id]; const t = tool?.[id];
    if (!ok(e) || !ok(t)) continue;
    const diff = Math.round(e * 100) - Math.round(t * 100);
    if (Math.abs(diff) > 1) out.push({ id, label, engine: e, tool: t, diff: diff / 100 });
  }
  return out;
}

/** Quick check figures (the panel's inputs as numbers) as the deal fields they set: { path, value } for each one that has a value. */
export const QUICK_DEAL_PATHS = {
  price: 'figures.price', noi: 'figures.noi', ltv: 'loan.ltv', rate: 'loan.rate', amort: 'loan.amort', closing: 'loan.closing',
  hold: 'live.hold', exitCap: 'live.exitCap', saleCost: 'live.saleCost',
};

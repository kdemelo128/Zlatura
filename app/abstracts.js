/* abstracts.js -- the lease abstracts on a deal (deal.abstracts): the broker types or pastes what a lease says into
 * the firm's layout (abstractfields.js), notes the page it came from, and ticks each value as checked. Pure data
 * operations and the review checks; abstractui.js draws the card, abstractexport.js makes the files.
 *
 * deal.abstracts = { v: 1, items: Abstract[] }  (at most 60)
 * Abstract = { id, leaseId, docs: Doc.id[], title, asOf, version, versions, fields, terms, steps, options, clauses,
 *              flags, audit, createdAt, updatedAt }
 * `fields` is sparse: a key that is absent is unread. Each stored value carries a status word. A blank is never a zero:
 * "the lease says none" stores 0 / false / "None" with a page, a quote or the note "no clause"; "not in the lease" stores
 * null and prints as such; clearing deletes the key. The checks never change a value. Nothing here reads a deal figure,
 * and no deal figure reads this (impact.js NOT_CALCULATED). Money is rounded by toCents, rates by toRate. */

import { cutText, rid } from './dd.js';
import { toCents, toRate } from './engine/money.js';
import { addDays, addMonths, dayOf, monthlyAmount, monthsBetween, validateLease } from './lease.js';
import { BASES, CLAUSES, FIELDS, FIELD_BY_KEY, LIMITS, OPTION_KINDS, REL_TO, RESETS, STATUSES, TERM_KINDS } from './abstractfields.js';

export { emptyAbstracts } from './history.js';

/** An options bag with nothing in it (typed any, so a destructured default reads cleanly). */
const NO = /** @type {any} */ ({});
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const zero = (v) => (v === 0 ? 0 : v); // not -0
const str = (v) => (typeof v === 'string' ? v : '');
const isoDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dayOf(s) !== null;
const isoLike = (s) => typeof s === 'string' && s.length <= LIMITS.checked && /^\d{4}-\d{2}-\d{2}/.test(s);
const idOf = (v, prefix) => (typeof v === 'string' && v ? cutText(v, LIMITS.id) : rid(prefix));
const PSF = ['psf_year', 'psf_month'];
const AMOUNTS = ['month', 'year', ...PSF];
const NO_READ = 'A saved value could not be read';
export const MAX_ABSTRACTS = LIMITS.abstracts;

/** An empty list. */
export const newAbstracts = () => ({ v: 1, items: [] });

/* ------------------------------------------------------------ values */

/** The units a field may carry: its catalogue unit(s), or the two $/SF ones. */
export const unitsOf = (f) => f.units || (f.kind === 'psf' ? PSF : f.unit ? [f.unit] : []);

/**
 * A value as its kind stores it: { ok: true, value } or { ok: false }. Money and rates are rounded (toCents, toRate);
 * a percent keeps any finite number (the review check names one outside 0 to 100); nothing is invented.
 * @param {{ kind: string, opts?: string[] }} f @param {any} v
 */
export function coerce(f, v) {
  const bad = { ok: false };
  const good = (value) => ({ ok: true, value });
  const text = (n) => (typeof v === 'string' && v.trim() ? good(cutText(v.trim(), n)) : bad);
  switch (f.kind) {
    case 'text': case 'party': return text(LIMITS.text);
    case 'clause': return text(LIMITS.clause);
    case 'address': {
      if (!Array.isArray(v)) return bad;
      const lines = v.filter((x) => typeof x === 'string' && x.trim()).slice(0, LIMITS.addressLines).map((x) => cutText(x.trim(), LIMITS.addressLine));
      return lines.length ? good(lines) : bad;
    }
    case 'date': return isoDay(v) ? good(v) : bad;
    case 'dateRel': return isoDay(v) ? good(v) : bad;
    case 'money': return fin(v) && v >= 0 ? good(zero(toCents(v))) : bad;
    case 'psf': return fin(v) && v >= 0 ? good(zero(toRate(v))) : bad;
    case 'pct': return fin(v) ? good(zero(toRate(v))) : bad;
    case 'sf': return fin(v) && v > 0 ? good(toRate(v)) : bad;
    case 'int': return Number.isSafeInteger(v) && v >= 0 ? good(v) : bad;
    case 'enum': return typeof v === 'string' && (f.opts || []).includes(v) ? good(v) : bad;
    case 'bool': return typeof v === 'boolean' ? good(v) : bad;
    default: return bad;
  }
}

const normSrc = (x) => ({
  doc: typeof x.doc === 'string' && x.doc ? cutText(x.doc, LIMITS.id) : null,
  page: Number.isSafeInteger(x.page) && x.page >= 1 ? x.page : null,
  start: null, len: null, quote: cutText(str(x.quote), LIMITS.quote), reader: 'typed', ocrConf: null,
});
/** The parts every item shares (a field, a term, a step, an option, a custom clause), beyond its value. */
function normCommon(x) {
  return {
    by: 'broker', checked: isoLike(x.checked) ? x.checked : false, confidence: null,
    src: Array.isArray(x.src) ? x.src.filter(isObj).slice(0, LIMITS.sources).map(normSrc) : [],
    supersededBy: null, note: cutText(str(x.note), LIMITS.note),
  };
}
/** A tick only stands on a found or not-found item: a hostile save cannot keep one on an unread or ambiguous item. */
const gate = (o) => (o.status === 'found' || o.status === 'not-found' || !o.checked ? o : { ...o, checked: false });
const status = (s) => (STATUSES.includes(s) ? s : 'unread');

function normField(f, x) {
  const c = normCommon(x);
  let st = status(x.status);
  let value = null;
  let rel = '';
  if (st === 'found' || st === 'ambiguous') {
    const r = coerce(f, x.value);
    value = r.ok ? r.value : null;
    if (f.kind === 'dateRel') rel = cutText(str(x.rel).trim(), LIMITS.rel);
    // a found value that can't be read is never kept as found, and never made up
    if (st === 'found' && value === null && !(f.kind === 'dateRel' && rel)) { st = 'ambiguous'; c.note ||= NO_READ; }
  }
  const units = unitsOf(f);
  /** @type {any} */
  const out = {
    value, unit: units.includes(x.unit) ? x.unit : units[0] || null,
    basis: (f.kind === 'sf' || f.kind === 'psf') && BASES.includes(x.basis) ? x.basis : null,
    status: st, ...c,
  };
  if (f.kind === 'dateRel') out.rel = rel;
  return gate(out);
}

function listOf(raw, max, fn) {
  const out = []; const seen = new Set();
  if (Array.isArray(raw)) for (const x of raw) {
    if (out.length >= max) break;
    if (!isObj(x)) continue;
    const item = fn(x);
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
const nInt = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const nPos = (v) => (Number.isSafeInteger(v) && v >= 1 ? v : null);
const nMoney = (v) => (fin(v) && v >= 0 ? zero(toCents(v)) : null);
const nRate = (v) => (fin(v) && v >= 0 ? zero(toRate(v)) : null);

function normTerm(x) {
  return gate({
    id: idOf(x.id, 'tm_'), kind: TERM_KINDS.includes(x.kind) ? x.kind : null,
    label: cutText(str(x.label), LIMITS.termLabel), ref: cutText(str(x.ref), LIMITS.termRef),
    doc: typeof x.doc === 'string' && x.doc ? cutText(x.doc, LIMITS.id) : null, effective: isoDay(x.effective) ? x.effective : null,
    supersedes: x.supersedes === true, unquantified: x.unquantified === true, status: status(x.status), ...normCommon(x),
  });
}
function normStep(x, termIds) {
  const am = isObj(x.amounts) ? x.amounts : {};
  const amounts = {};
  for (const u of AMOUNTS) amounts[u] = PSF.includes(u) ? nRate(am[u]) : nMoney(am[u]);
  const primary = AMOUNTS.includes(x.primary) ? x.primary : null;
  return gate({
    id: idOf(x.id, 'st_'), term: typeof x.term === 'string' && termIds.has(x.term) ? x.term : null, label: cutText(str(x.label), LIMITS.stepLabel),
    from: isoDay(x.from) ? x.from : null, to: isoDay(x.to) ? x.to : null, mFrom: nPos(x.mFrom), mTo: nPos(x.mTo),
    amounts, primary, basis: BASES.includes(x.basis) ? x.basis : null, status: status(x.status), ...normCommon(x),
  });
}
function normOption(x) {
  return gate({
    id: idOf(x.id, 'op_'), kind: OPTION_KINDS.includes(x.kind) ? x.kind : null, count: nInt(x.count), termMonths: nInt(x.termMonths),
    noticeMin: nInt(x.noticeMin), noticeMax: nInt(x.noticeMax), noticeUnit: x.noticeUnit === 'days' || x.noticeUnit === 'months' ? x.noticeUnit : null,
    relTo: REL_TO.includes(x.relTo) ? x.relTo : null, reset: RESETS.includes(x.reset) ? x.reset : null,
    resetPct: fin(x.resetPct) ? zero(toRate(x.resetPct)) : null, resetText: cutText(str(x.resetText), LIMITS.resetText),
    fee: nMoney(x.fee), conditions: cutText(str(x.conditions), LIMITS.conditions), status: status(x.status), ...normCommon(x),
  });
}
const normClause = (x) => gate({ id: idOf(x.id, 'cl_'), label: cutText(str(x.label), LIMITS.customLabel), text: cutText(str(x.text), LIMITS.clause), status: status(x.status), ...normCommon(x) });
const normFlag = (x) => ({ id: idOf(x.id, 'fl_'), text: cutText(str(x.text), LIMITS.flag), at: cutText(str(x.at), LIMITS.checked) });

function normAbstract(x) {
  const fields = {};
  if (isObj(x.fields)) for (const [k, v] of Object.entries(x.fields)) {
    if (!Object.hasOwn(FIELD_BY_KEY, k) || !isObj(v)) continue; // an unknown key (or __proto__) is dropped
    fields[k] = normField(FIELD_BY_KEY[k], v);
  }
  const terms = listOf(x.terms, LIMITS.terms, normTerm);
  const termIds = new Set(terms.map((t) => t.id));
  const docs = [];
  if (Array.isArray(x.docs)) for (const d of x.docs) if (typeof d === 'string' && d && docs.length < LIMITS.docs && !docs.includes(cutText(d, LIMITS.id))) docs.push(cutText(d, LIMITS.id));
  return {
    id: idOf(x.id, 'ab_'), leaseId: typeof x.leaseId === 'string' && x.leaseId ? cutText(x.leaseId, LIMITS.id) : null, docs,
    title: cutText(str(x.title), LIMITS.title), asOf: isoDay(x.asOf) ? x.asOf : null, version: 1, versions: [], fields, terms,
    steps: listOf(x.steps, LIMITS.steps, (s) => normStep(s, termIds)), options: listOf(x.options, LIMITS.options, normOption),
    clauses: listOf(x.clauses, LIMITS.clauses, normClause), flags: listOf(x.flags, LIMITS.flags, normFlag).filter((f) => f.text.trim()), audit: [],
    createdAt: cutText(str(x.createdAt), LIMITS.checked), updatedAt: cutText(str(x.updatedAt), LIMITS.checked),
  };
}

/**
 * A clean copy of whatever is stored as a deal's abstracts, however a damaged or hostile backup left it: containers
 * made whole, non-objects and repeated ids dropped, every cap applied, unknown keys dropped, and a value that does
 * not read as its kind becomes null (a found one becomes "needs your choice", never 0 and never invented).
 * @param {any} raw
 */
export function normAbstracts(raw) {
  return { v: 1, items: listOf(isObj(raw) ? raw.items : null, MAX_ABSTRACTS, normAbstract) };
}

/** The deal's abstracts, cleaned in place when they need it (see normAbstracts), and made when the deal has none. */
export function abstractsOf(d) {
  const n = normAbstracts(d.abstracts);
  if (!isObj(d.abstracts) || JSON.stringify(n) !== JSON.stringify(d.abstracts)) d.abstracts = n;
  return d.abstracts;
}

/* ------------------------------------------------------------ making and removing */

const when = (now) => now || new Date().toISOString();
/** A new, untouched abstract: nothing is read, so every field is unread. */
export function newAbstract({ title = '', docs = [], now = new Date().toISOString() } = NO) {
  return normAbstract({ id: rid('ab_'), title, docs, createdAt: now, updatedAt: now });
}
/** Add an abstract; { abstract } or { error } at 60. */
export function addAbstract(list, init, opts) {
  if (list.items.length >= MAX_ABSTRACTS) return { error: `A deal keeps at most ${MAX_ABSTRACTS} lease abstracts. Remove one before adding another.` };
  const abstract = newAbstract({ ...init, ...opts });
  list.items.push(abstract);
  return { abstract };
}
export function removeAbstract(list, id) {
  const index = list.items.findIndex((x) => x.id === id);
  if (index < 0) return null;
  const [abstract] = list.items.splice(index, 1);
  return { abstract, index };
}
/** The Undo of removeAbstract. */
export function restoreAbstract(list, { abstract, index }) { if (!list.items.some((x) => x.id === abstract.id) && list.items.length < MAX_ABSTRACTS) list.items.splice(Math.min(index, list.items.length), 0, abstract); }

/* ------------------------------------------------------------ addressing an item */

/**
 * The record behind an item key: a field key ('deposit'), or 'term:ID', 'step:ID', 'option:ID', 'clause:ID'.
 * @returns {{ rec: any, kind: string, field?: any } | null}
 */
export function itemOf(ab, key) {
  const m = /^(term|step|option|clause):(.+)$/.exec(key);
  if (m) {
    const list = { term: ab.terms, step: ab.steps, option: ab.options, clause: ab.clauses }[m[1]];
    const rec = list.find((x) => x.id === m[2]);
    return rec ? { rec, kind: m[1] } : null;
  }
  if (!Object.hasOwn(FIELD_BY_KEY, key)) return null;
  return { rec: ab.fields[key] || null, kind: 'field', field: FIELD_BY_KEY[key] };
}
const termName = (ab, id) => { const t = ab.terms.find((x) => x.id === id); return t ? (t.label || 'Term') : ''; };
/** What the broker calls an item, for a status line: "Base rent, Year 2". */
export function itemLabel(ab, key) {
  const it = itemOf(ab, key);
  if (!it) return key;
  if (it.kind === 'field') return it.field.label;
  const r = it.rec;
  if (it.kind === 'step') return `Rent, ${r.label || 'a step'}`;
  if (it.kind === 'term') return r.label || 'Term';
  if (it.kind === 'option') return `Option${r.kind ? `: ${r.kind}` : ''}`;
  return r.label || 'Note';
}

const touch = (ab, now) => { ab.updatedAt = when(now); };
const evidence = (rec) => !!rec && ((rec.src || []).some((s) => s.page || s.quote) || !!rec.note);
/** Unticking an edited item: { unchecked: 'Base rent, Year 2: changed, so no longer checked' } when it was ticked. */
function untick(ab, key, rec) {
  if (!rec || !rec.checked) return {};
  rec.checked = false;
  return { unchecked: `${itemLabel(ab, key)}: changed, so no longer checked` };
}

/* ------------------------------------------------------------ fields */

/**
 * The broker types a value. opts: { unit, basis, rel, now }. Returns { ok, unchecked? } or { error }. A dateRel takes a
 * real date, or relative words (`rel`) with no date yet. The value is never changed to make it fit.
 */
export function setValue(ab, key, value, { unit, basis, rel, now } = NO) {
  const f = Object.hasOwn(FIELD_BY_KEY, key) ? FIELD_BY_KEY[key] : null;
  if (!f) return { error: 'That is not a lease abstract field.' };
  const relText = f.kind === 'dateRel' ? cutText(str(rel).trim(), LIMITS.rel) : '';
  const empty = value === null || value === undefined || value === '';
  let v = null;
  if (empty && f.kind === 'dateRel' && relText) v = null;
  else {
    const r = coerce(f, value);
    if (!r.ok) return { error: `${f.label}: that is not a valid ${KIND_WORDS[f.kind] || 'value'}.` };
    v = r.value;
  }
  const units = unitsOf(f);
  if (unit !== undefined && unit !== null && !units.includes(unit)) return { error: `${f.label}: that unit is not allowed here.` };
  if (basis !== undefined && basis !== null && !BASES.includes(basis)) return { error: `${f.label}: that is not a measure basis.` };
  const had = ab.fields[key];
  const next = normField(f, { ...(had || {}), value: v, rel: relText, status: 'found', unit: unit ?? had?.unit, basis: basis ?? had?.basis, checked: false });
  const changed = !had || had.status !== 'found' || JSON.stringify([had.value, had.unit, had.basis, had.rel ?? '']) !== JSON.stringify([next.value, next.unit, next.basis, next.rel ?? '']);
  const out = changed ? untick(ab, key, had) : {};
  if (!changed) return { ok: true };
  next.checked = false;
  ab.fields[key] = next;
  touch(ab, now);
  return { ok: true, ...out };
}
const KIND_WORDS = { money: 'dollar amount', psf: 'dollar rate', pct: 'percent', sf: 'area above zero', int: 'whole number', date: 'date', dateRel: 'date', enum: 'choice', bool: 'yes or no', address: 'address', text: 'text', party: 'name', clause: 'note' };

/** What "the lease says none" stores, by kind; null for a kind with no "none". */
const noneOf = (f) => ({ money: 0, psf: 0, pct: 0, int: 0, bool: false, text: 'None', party: 'None', clause: 'None' })[f.kind] ?? null;

/**
 * "The lease says none": found, with 0, false or the text None. It needs a page or a quote already on the field, or
 * `noClause: true` (which writes the note "no clause"). { ok } or { error }.
 */
export function setNone(ab, key, { noClause = false, now } = NO) {
  const f = Object.hasOwn(FIELD_BY_KEY, key) ? FIELD_BY_KEY[key] : null;
  if (!f) return { error: 'That is not a lease abstract field.' };
  const v = noneOf(f);
  if (v === null) return { error: `${f.label}: "none" does not apply to this kind of value.` };
  const had = ab.fields[key];
  if (!evidence(had) && !noClause) return { error: `${f.label}: give the page or a quote that says so, or say there is no clause.` };
  const next = normField(f, { ...(had || {}), value: v, status: 'found', checked: false, note: had && had.note ? had.note : evidence(had) ? '' : 'no clause' });
  const out = untick(ab, key, had);
  ab.fields[key] = next;
  touch(ab, now);
  return { ok: true, ...out };
}
/** "Not in the lease": not-found, value null. It prints as "Not found in lease", never as 0. */
export function setNotFound(ab, key, { now } = NO) {
  const f = Object.hasOwn(FIELD_BY_KEY, key) ? FIELD_BY_KEY[key] : null;
  if (!f) return { error: 'That is not a lease abstract field.' };
  const had = ab.fields[key];
  const out = untick(ab, key, had);
  ab.fields[key] = normField(f, { ...(had || {}), value: null, status: 'not-found', checked: false });
  touch(ab, now);
  return { ok: true, ...out };
}
/** "Needs a choice": ambiguous, with a required note saying why. */
export function setAmbiguous(ab, key, note, { now } = NO) {
  const it = itemOf(ab, key);
  if (!it) return { error: 'That is not a lease abstract item.' };
  const why = cutText(str(note).trim(), LIMITS.note);
  if (!why) return { error: 'Say why it needs a choice.' };
  if (it.kind === 'field') {
    const had = ab.fields[key];
    const out = untick(ab, key, had);
    ab.fields[key] = normField(it.field, { ...(had || {}), status: 'ambiguous', note: why, checked: false, value: had ? had.value : null });
    touch(ab, now);
    return { ok: true, ...out };
  }
  const out = untick(ab, key, it.rec);
  it.rec.status = 'ambiguous';
  it.rec.note = why;
  touch(ab, now);
  return { ok: true, ...out };
}
/** Clear a field: the key is deleted (unread). Never stores 0 or "". */
export function clearField(ab, key, { now } = NO) { if (!(key in ab.fields)) return false; delete ab.fields[key]; touch(ab, now); return true; }

/** The page, quote and document of a field's source (up to 3). */
export function setEvidence(ab, key, src, { now } = NO) {
  const it = itemOf(ab, key);
  if (!it) return { error: 'That is not a lease abstract item.' };
  const list = (Array.isArray(src) ? src : [src]).filter(isObj).slice(0, LIMITS.sources).map(normSrc).filter((s) => s.page || s.quote || s.doc);
  let rec = it.rec;
  if (!rec) { // evidence for a field nobody has filled yet: kept on an unread record, never as a value
    ab.fields[key] = normField(it.field, { status: 'unread' });
    rec = ab.fields[key];
  }
  rec.src = list;
  touch(ab, now);
  return { ok: true };
}
/** A note on an item. */
export function setNote(ab, key, text, { now } = NO) {
  const it = itemOf(ab, key);
  if (!it) return { error: 'That is not a lease abstract item.' };
  let rec = it.rec;
  if (!rec) { ab.fields[key] = normField(it.field, { status: 'unread' }); rec = ab.fields[key]; }
  rec.note = cutText(str(text), LIMITS.note);
  touch(ab, now);
  return { ok: true };
}

/**
 * Tick or untick an item. Only a found or not-found item can be ticked, and not while a failing check names it.
 * { ok, checked } or { error }.
 */
export function setChecked(ab, key, on, { now } = NO) {
  const it = itemOf(ab, key);
  if (!it) return { error: 'That is not a lease abstract item.' };
  const rec = it.rec;
  if (!on) { if (rec) rec.checked = false; touch(ab, now); return { ok: true, checked: false }; }
  if (!rec || !['found', 'not-found'].includes(rec.status)) return { error: `${itemLabel(ab, key)}: fill it in, or mark it not in the lease, before checking it.` };
  const fail = checkAbstract(ab).find((c) => c.level === 'fail' && c.key === key);
  if (fail) return { error: `${itemLabel(ab, key)}: ${fail.text}` };
  rec.checked = when(now);
  touch(ab, now);
  return { ok: true, checked: rec.checked };
}

/* ------------------------------------------------------------ terms, steps, options, clauses, flags */

const cap = (list, max, what) => (list.length >= max ? { error: `An abstract keeps at most ${max} ${what}.` } : null);
const removeFrom = (list, id) => { const index = list.findIndex((x) => x.id === id); if (index < 0) return null; const [item] = list.splice(index, 1); return { item, index }; };

export function addTerm(ab, init = NO, { now } = NO) {
  const full = cap(ab.terms, LIMITS.terms, 'terms'); if (full) return full;
  const term = normTerm({ ...init, id: rid('tm_'), checked: false, status: init.status || 'found' });
  if (!term.label) term.label = { renewal: 'Renewal term', extension: 'Extension', fmv: 'Fair market value reset', opex: 'Operating expenses' }[term.kind] || 'Original term';
  ab.terms.push(term); touch(ab, now);
  return { term };
}
export function removeTerm(ab, id, { now } = NO) {
  const r = removeFrom(ab.terms, id); if (!r) return null;
  const steps = ab.steps.filter((s) => s.term === id);
  ab.steps = ab.steps.filter((s) => s.term !== id);
  touch(ab, now);
  return { ...r, steps };
}
/** Change a term; patch: { kind, label, ref, doc, effective, supersedes, unquantified }. */
export function setTerm(ab, id, patch, { now } = NO) {
  const t = ab.terms.find((x) => x.id === id); if (!t) return { error: 'No such term.' };
  const next = normTerm({ ...t, ...patch });
  const changed = JSON.stringify(pick(t, TERM_EDIT)) !== JSON.stringify(pick(next, TERM_EDIT));
  if (!changed) return { ok: true };
  const out = untick(ab, `term:${id}`, t);
  Object.assign(t, pick(next, TERM_EDIT), { status: 'found' });
  touch(ab, now);
  return { ok: true, ...out };
}
const TERM_EDIT = ['kind', 'label', 'ref', 'doc', 'effective', 'supersedes', 'unquantified'];
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

/** Add a step to a term. It copies the previous step's units and basis and starts the day after it ends (only when that is a real date). */
export function addStep(ab, termId, init = NO, { now } = NO) {
  if (!ab.terms.some((t) => t.id === termId)) return { error: 'No such term.' };
  const full = cap(ab.steps, LIMITS.steps, 'rent steps'); if (full) return full;
  const prev = ab.steps.filter((s) => s.term === termId).at(-1);
  const relative = init.mFrom != null || init.mTo != null;
  const from = init.from ?? (!relative && prev && prev.to ? addDays(prev.to, 1) : null);
  const step = normStep({ primary: prev ? prev.primary : 'month', basis: prev ? prev.basis : null, label: `Year ${ab.steps.filter((s) => s.term === termId).length + 1}`, ...init, from, id: rid('st_'), term: termId, checked: false, status: 'unread' }, new Set([termId]));
  if (step.primary && step.amounts[step.primary] !== null) step.status = 'found';
  ab.steps.push(step); touch(ab, now);
  return { step };
}
export function removeStep(ab, id, { now } = NO) { const r = removeFrom(ab.steps, id); if (r) touch(ab, now); return r; }
/** Change a step; patch: { label, from, to, mFrom, mTo, amounts: { month, year, psf_year, psf_month }, primary, basis }. A bad date or amount is refused. */
export function setStep(ab, id, patch, { now } = NO) {
  const s = ab.steps.find((x) => x.id === id); if (!s) return { error: 'No such step.' };
  for (const k of ['from', 'to']) if (patch[k] !== undefined && patch[k] !== null && patch[k] !== '' && !isoDay(patch[k])) return { error: 'That is not a real date.' };
  if (patch.amounts) for (const [u, v] of Object.entries(patch.amounts)) {
    if (!AMOUNTS.includes(u)) return { error: 'That is not a rent unit.' };
    if (v !== null && v !== undefined && !(fin(v) && v >= 0)) return { error: 'Rent must be a number, zero or more.' };
  }
  const clean = { ...patch };
  for (const k of ['from', 'to']) if (clean[k] === '') clean[k] = null;
  const next = normStep({ ...s, ...clean, amounts: { ...s.amounts, ...(patch.amounts || {}) } }, new Set([s.term]));
  const KEYS = ['label', 'from', 'to', 'mFrom', 'mTo', 'amounts', 'primary', 'basis'];
  if (JSON.stringify(pick(s, KEYS)) === JSON.stringify(pick(next, KEYS))) return { ok: true };
  const out = untick(ab, `step:${id}`, s);
  Object.assign(s, pick(next, KEYS));
  if (s.status !== 'ambiguous') s.status = s.primary && s.amounts[s.primary] !== null ? 'found' : 'unread';
  touch(ab, now);
  return { ok: true, ...out };
}

export function addOption(ab, init = NO, { now } = NO) {
  const full = cap(ab.options, LIMITS.options, 'options'); if (full) return full;
  const option = normOption({ kind: 'renewal', noticeUnit: 'months', relTo: 'expiration', ...init, id: rid('op_'), checked: false, status: 'found' });
  ab.options.push(option); touch(ab, now);
  return { option };
}
export function removeOption(ab, id, { now } = NO) { const r = removeFrom(ab.options, id); if (r) touch(ab, now); return r; }
export function setOption(ab, id, patch, { now } = NO) {
  const o = ab.options.find((x) => x.id === id); if (!o) return { error: 'No such option.' };
  const next = normOption({ ...o, ...patch });
  const KEYS = ['kind', 'count', 'termMonths', 'noticeMin', 'noticeMax', 'noticeUnit', 'relTo', 'reset', 'resetPct', 'resetText', 'fee', 'conditions'];
  if (JSON.stringify(pick(o, KEYS)) === JSON.stringify(pick(next, KEYS))) return { ok: true };
  const out = untick(ab, `option:${id}`, o);
  Object.assign(o, pick(next, KEYS));
  touch(ab, now);
  return { ok: true, ...out };
}

export function addClause(ab, init = NO, { now } = NO) {
  const full = cap(ab.clauses, LIMITS.clauses, 'custom notes'); if (full) return full;
  const clause = normClause({ ...init, id: rid('cl_'), checked: false, status: 'unread' });
  if (clause.text.trim()) clause.status = 'found';
  ab.clauses.push(clause); touch(ab, now);
  return { clause };
}
export function removeClause(ab, id, { now } = NO) { const r = removeFrom(ab.clauses, id); if (r) touch(ab, now); return r; }
export function setClause(ab, id, patch, { now } = NO) {
  const c = ab.clauses.find((x) => x.id === id); if (!c) return { error: 'No such note.' };
  const next = normClause({ ...c, ...patch });
  if (next.label === c.label && next.text === c.text) return { ok: true };
  const out = untick(ab, `clause:${id}`, c);
  c.label = next.label; c.text = next.text;
  if (c.status !== 'ambiguous') c.status = c.text.trim() ? 'found' : 'unread';
  touch(ab, now);
  return { ok: true, ...out };
}

export function addFlag(ab, text, { now } = NO) {
  const full = cap(ab.flags, LIMITS.flags, 'flags'); if (full) return full;
  const flag = normFlag({ id: rid('fl_'), text: str(text).trim(), at: when(now) });
  if (!flag.text) return { error: 'Type the flag first.' };
  ab.flags.push(flag); touch(ab, now);
  return { flag };
}
export function removeFlag(ab, id, { now } = NO) { const r = removeFrom(ab.flags, id); if (r) touch(ab, now); return r; }

/**
 * Title, as-of date and linked documents of the abstract itself.
 * @param {any} ab @param {{ title?: string, asOf?: string | null, docs?: string[] }} patch @param {{ now?: string }} [o]
 */
export function setMeta(ab, { title, asOf, docs }, { now } = NO) {
  if (asOf !== undefined && asOf !== null && asOf !== '' && !isoDay(asOf)) return { error: 'That is not a real date.' };
  if (title !== undefined) ab.title = cutText(str(title).trim(), LIMITS.title);
  if (asOf !== undefined) ab.asOf = asOf || null;
  if (docs !== undefined) ab.docs = normAbstract({ docs }).docs;
  touch(ab, now);
  return { ok: true };
}

/* ------------------------------------------------------------ the rent block */

/** The typed value of a field when it is found, else undefined. */
export const valueOf = (ab, key) => { const r = ab.fields[key]; return r && r.status === 'found' ? r.value : undefined; };
const dateOf = (ab, key) => { const v = valueOf(ab, key); return isoDay(v) ? v : null; };
const sfOf = (ab) => { const r = ab.fields.sf; return r && r.status === 'found' && fin(r.value) && r.value > 0 ? { sf: r.value, basis: r.basis } : null; };
/** The SF basis a step's $/SF is on: the step's own, else the area's. */
const basisOf = (step, ab) => step.basis || (sfOf(ab) && sfOf(ab).basis) || null;

/**
 * The first days of a step, from the dates typed; else, for "months 1 to 12", counted from rent commencement, but only when
 * that is a checked real date. { from, to, relative, reason }: a date is null when it can't be known yet, and `reason` says why.
 * Computed on the fly and never stored.
 */
export function stepDates(step, ab) {
  const rcRec = ab.fields.rentCommencement;
  const rc = rcRec && rcRec.status === 'found' && rcRec.checked && isoDay(rcRec.value) ? rcRec.value : null;
  let reason = null; let relative = false;
  const part = (typed, m, end) => {
    if (typed) return typed;
    if (m === null) return null;
    relative = true;
    if (!rc) { reason = 'unresolved until rent commencement is typed and checked'; return null; }
    return end ? addDays(addMonths(rc, m), -1) : addMonths(rc, m - 1);
  };
  const from = part(step.from, step.mFrom, false);
  const to = part(step.to, step.mTo, true);
  return { from, to, relative, reason };
}

/** The months a step lasts: "months 1 to 12" counts 12; else the dates, by lease.js; else null. */
export function stepMonths(step, ab) {
  if (step.mFrom !== null && step.mTo !== null) return step.mTo - step.mFrom + 1;
  const { from, to } = stepDates(step, ab);
  return from && to && dayOf(to) >= dayOf(from) ? toRate(monthsBetween(from, to)) : null;
}

/** A step's monthly rent in dollars (whole cents), or { monthly: null, why }: $/SF needs rentable SF on both sides. */
export function stepMonthly(step, ab) {
  const u = step.primary;
  if (!u) return { monthly: null, why: 'choose which amount is the rent' };
  const a = step.amounts[u];
  if (a === null || a === undefined) return { monthly: null, why: 'no rent typed' };
  if (PSF.includes(u)) {
    const s = sfOf(ab);
    if (!s) return { monthly: null, why: 'needs the square feet' };
    const b = basisOf(step, ab);
    if (b !== 'rentable') return { monthly: null, why: `per ${b || 'unstated'} SF: the rent block shows no total` };
    if (s.basis !== 'rentable') return { monthly: null, why: `the rate is per rentable SF but the area is ${s.basis || 'unstated'}` };
    return { monthly: toCents(monthlyAmount(a, u, s.sf)), why: null };
  }
  return { monthly: toCents(monthlyAmount(a, u, null)), why: null };
}

/**
 * The rent block of a term: one row per step with its dates, months, monthly rent, total rent and the annual rate per SF

 * (monthly x 12 / rentable SF), and a total row that exists only when every row is complete (a row whose dates are unresolved
 * has no total). Whole cents everywhere; the
 * total is the sum of the rows' cent totals, as the workbook's SUM is. `weighted` is the term's total over its years over the
 * rentable SF.
 */
export function rentBlock(ab, termId) {
  const term = ab.terms.find((t) => t.id === termId) || null;
  const s = sfOf(ab);
  const rows = ab.steps.filter((x) => x.term === termId).map((step) => {
    const { from, to, reason } = stepDates(step, ab);
    const months = stepMonths(step, ab);
    const { monthly, why } = stepMonthly(step, ab);
    const resolved = from !== null && to !== null && months !== null;
    const total = monthly !== null && resolved ? toCents(monthly * months) : null;
    const b = basisOf(step, ab);
    const rentable = !!s && s.basis === 'rentable' && b === 'rentable';
    const annualPsf = monthly !== null && rentable ? toRate(monthly * 12 / s.sf) : null;
    return { step, from, to, months, monthly, total, annualPsf, psfText: annualPsf === null && b && b !== 'rentable' ? `per ${b} SF` : null, resolved, reason: reason || (monthly === null ? why : months === null ? 'months are not known' : null) };
  });
  let total = null;
  if (rows.length && rows.every((r) => r.monthly !== null && r.months !== null && r.total !== null)) {
    const sum = toCents(rows.reduce((a, r) => a + r.total, 0));
    const months = toRate(rows.reduce((a, r) => a + r.months, 0));
    const weighted = s && s.basis === 'rentable' && months > 0 && rows.every((r) => r.annualPsf !== null) ? toRate(sum / (months / 12) / s.sf) : null;
    total = { months, total: sum, weighted };
  }
  return { term, rows, total, unquantified: !!(term && term.unquantified), sf: s ? s.sf : null };
}

/* ------------------------------------------------------------ lease.js view (for the overlap check) */

/**
 * The steps of one term as a lease.js lease, so lease.js's own rules (validateLease) check overlaps and gaps: no date
 * arithmetic of our own. A step with an unresolved date is left out (the "unresolved" check names it).
 */
export function asLease(ab, termId) {
  const s = sfOf(ab);
  const periods = [];
  for (const step of ab.steps.filter((x) => x.term === termId)) {
    const { from, to } = stepDates(step, ab);
    if (!from || !to || !step.primary || step.amounts[step.primary] === null) continue;
    periods.push({ start: from, end: to, rate: step.amounts[step.primary], unit: step.primary, source: 'documented', note: '', _step: step.id });
  }
  return { id: termId, unit: '', tenant: '', sf: s ? s.sf : null, vacant: false, mtm: false, leaseStart: dateOf(ab, 'commencement'), rentStart: dateOf(ab, 'rentCommencement'), leaseEnd: null, periods, abatements: [] };
}

/* ------------------------------------------------------------ the checks */

const near = (a, b) => Math.abs(a - b) <= 0.005 + 1e-9;
/**
 * The review checks R1 to R12, as [{ level: 'fail' | 'warn', key, text }]. Pure; they never change a value. `key` names the
 * item (an item key, see itemOf) so the screen can mark it and refuse a tick.
 */
export function checkAbstract(ab) {
  const out = [];
  const add = (level, key, text) => out.push({ level, key, text });
  const s = sfOf(ab);
  const L = (key) => itemLabel(ab, key);

  for (const step of ab.steps) {
    const key = `step:${step.id}`;
    const name = L(key);
    const am = step.amounts;
    if (am.month !== null && am.year !== null && !near(am.year / 12, am.month)) add('fail', key, `${name}: monthly and annual disagree`);
    if (s && am.year !== null && am.psf_year !== null) {
      if (basisOf(step, ab) !== 'rentable' || s.basis !== 'rentable') add('warn', key, `${name}: annual rent and $/SF not compared, the square-foot basis differs`);
      else if (!near(am.year / s.sf, am.psf_year)) add('fail', key, `${name}: annual and $/SF disagree`);
    }
    if (am.psf_year !== null || am.psf_month !== null) {
      const b = basisOf(step, ab);
      const bad = b !== 'rentable' ? b || 'unstated' : s && s.basis !== 'rentable' ? s.basis || 'unstated' : null;
      if (bad) add('warn', key, `${name}: per ${bad} SF: the rent block shows no total`);
      else if (!s && step.primary && PSF.includes(step.primary)) add('warn', key, `${name}: rent is per SF but the square feet are not typed`);
    }
    if (step.status === 'ambiguous' && !step.note.trim()) add('fail', key, `${name}: needs a note saying why it needs a choice`);
    const { from, to, reason } = stepDates(step, ab);
    if ((step.mFrom !== null || step.mTo !== null) && (!from || !to) && reason) add('fail', key, `${name}: ${reason}`);
  }

  // R4: overlaps and gaps, by lease.js
  for (const t of ab.terms) {
    if (t.unquantified) continue;
    const lease = asLease(ab, t.id);
    if (lease.periods.length < 2) continue;
    // lease.js sorts by start; its messages cite the position in the list we gave it
    for (const m of validateLease(lease)) {
      const nums = [...m.text.matchAll(/\b(?:periods?|and) (\d+)/g)].map((x) => +x[1]);
      const isOverlap = /overlap/.test(m.text);
      if (!isOverlap && !/^No rent from/.test(m.text)) continue;
      const hit = nums.map((n) => lease.periods[n - 1]).filter(Boolean);
      const key = hit.length ? `step:${hit.at(-1)._step}` : `term:${t.id}`;
      add(isOverlap ? 'fail' : 'warn', key, `${termName(ab, t.id)}: ${m.text}`);
    }
  }

  // R5 / R6 / R7: dates
  const c = dateOf(ab, 'commencement'); const e = dateOf(ab, 'expiration');
  const rc = dateOf(ab, 'rentCommencement'); const pos = dateOf(ab, 'possession');
  if (c && e && dayOf(e) <= dayOf(c)) add('fail', 'expiration', 'Expiration: on or before commencement');
  if (c && rc && dayOf(rc) < dayOf(c)) add('warn', 'rentCommencement', 'Rent commencement: before commencement');
  if (c && pos && dayOf(pos) > dayOf(c)) add('warn', 'possession', 'Possession: after commencement');
  const tm = valueOf(ab, 'termMonths');
  if (c && e && dayOf(e) > dayOf(c) && Number.isInteger(tm) && Math.abs(monthsBetween(c, e) - tm) > 0.5) add('warn', 'termMonths', `Stated term: ${tm} months, but the dates give ${Math.round(monthsBetween(c, e) * 100) / 100}`);
  for (const f of FIELDS) if (f.kind === 'dateRel') {
    const r = ab.fields[f.key];
    if (r && r.status === 'found' && r.value === null && r.rel) add('fail', f.key, `${f.label}: depends on: ${r.rel}`);
  }

  // R8: steps against the term (the original term's steps only)
  const initial = ab.terms.find((t) => t.kind === 'initial') || (ab.terms.length === 1 ? ab.terms[0] : null);
  if (initial && !initial.unquantified) {
    const dated = ab.steps.filter((x) => x.term === initial.id).map((x) => ({ x, d: stepDates(x, ab) })).filter((r) => r.d.from && r.d.to).sort((a, b) => dayOf(a.d.from) - dayOf(b.d.from));
    if (dated.length) {
      const first = dated[0]; const last = dated.at(-1);
      if (rc && dayOf(first.d.from) > dayOf(rc)) add('warn', `step:${first.x.id}`, `${L(`step:${first.x.id}`)}: starts after rent commencement`);
      if (e && last.d.to !== e) add('warn', `step:${last.x.id}`, `${L(`step:${last.x.id}`)}: ends ${dayOf(last.d.to) < dayOf(e) ? 'before' : 'after'} the expiration`);
    }
  }

  for (const f of FIELDS) {
    const r = ab.fields[f.key];
    if (!r) continue;
    if (r.status === 'ambiguous' && !r.note.trim()) add('fail', f.key, `${f.label}: needs a note saying why it needs a choice`); // R12
    if (r.status !== 'found') continue;
    if (f.kind === 'pct' && fin(r.value) && (r.value < 0 || r.value > 100)) add('fail', f.key, `${f.label}: a percent must be between 0 and 100`); // R11
    const none = (['money', 'psf', 'pct', 'int'].includes(f.kind) && r.value === 0) || (f.kind === 'bool' && r.value === false) || ((f.kind === 'text' || f.kind === 'party' || f.kind === 'clause') && r.value === 'None');
    if (none && !evidence(r)) add('warn', f.key, `${f.label}: marked none, with no page, quote or note`); // R10
  }
  const pr = ab.fields.proRata;
  if (pr && pr.status === 'found' && !(ab.fields.proRataCovers && ab.fields.proRataCovers.status !== 'unread')) add('warn', 'proRata', 'Pro-rata share: what it covers is not stated'); // R9
  for (const o of ab.options) {
    const key = `option:${o.id}`;
    if (o.resetPct !== null && (o.resetPct < 0 || o.resetPct > 100)) add('fail', key, `${L(key)}: a percent must be between 0 and 100`);
    if (o.status === 'ambiguous' && !o.note.trim()) add('fail', key, `${L(key)}: needs a note saying why it needs a choice`);
  }
  for (const k of [...ab.terms.map((t) => `term:${t.id}`), ...ab.clauses.map((x) => `clause:${x.id}`)]) {
    const it = itemOf(ab, k);
    if (it && it.rec.status === 'ambiguous' && !it.rec.note.trim()) add('fail', k, `${L(k)}: needs a note saying why it needs a choice`);
  }
  return out;
}

/**
 * Is this item ready for L2's "Use"? Found or not-found, ticked, named by no failing check, and: a relative date needs a real
 * date; a step needs its dates known and a monthly amount.
 */
export function canUse(ab, key, checks = null) {
  const it = itemOf(ab, key);
  if (!it || !it.rec) return false;
  const r = it.rec;
  if (!['found', 'not-found'].includes(r.status) || !r.checked) return false;
  if ((checks || checkAbstract(ab)).some((c) => c.level === 'fail' && c.key === key)) return false;
  if (it.kind === 'field' && it.field.kind === 'dateRel') return r.status === 'found' && isoDay(r.value);
  if (it.kind === 'step') {
    const { from, to } = stepDates(r, ab);
    return !!from && !!to && stepMonthly(r, ab).monthly !== null;
  }
  return true;
}

/** Every item that counts toward "n of m checked": the catalogue's fields (optional clauses only when present) and every term, step, option and custom note. */
export function itemKeys(ab) {
  const keys = FIELDS.filter((f) => !(f.optional && !ab.fields[f.key])).map((f) => f.key);
  return [...keys, ...ab.terms.map((t) => `term:${t.id}`), ...ab.steps.map((x) => `step:${x.id}`), ...ab.options.map((o) => `option:${o.id}`), ...ab.clauses.map((x) => `clause:${x.id}`)];
}
/** { total, checked, open, flags }: items ticked, items not, and the open flags (the broker's own, plus every unticked, unread, not-found, ambiguous or failing item). */
export function progress(ab) {
  const keys = itemKeys(ab);
  let checked = 0;
  for (const k of keys) { const r = itemOf(ab, k).rec; if (r && r.checked) checked += 1; }
  return { total: keys.length, checked, open: keys.length - checked, flags: ab.flags.length + checkAbstract(ab).length };
}

/**
 * The lines for the workbook's "Analyst flags" column: the broker's own flags first, then one line for every item that is unread,
 * not checked, not found, needs a choice, or has a failing or warning check.
 */
export function flagLines(ab) {
  const lines = ab.flags.map((f) => f.text);
  for (const k of itemKeys(ab)) {
    const r = itemOf(ab, k).rec; const name = itemLabel(ab, k);
    if (!r || r.status === 'unread') lines.push(`${name}: not yet abstracted`);
    else if (r.status === 'not-found') lines.push(`${name}: not found in lease`);
    else if (r.status === 'ambiguous') lines.push(`${name}: needs your choice${r.note ? ` (${r.note})` : ''}`);
    else if (!r.checked) lines.push(`${name}: not checked`);
  }
  for (const c of checkAbstract(ab)) lines.push(c.text);
  return lines;
}

export { CLAUSES };

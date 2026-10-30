/* uwstore.js -- quick underwritings kept on this device (kv key 'uw.scratch', newest first, at most 100): a price,
 * NOI and loan terms worked through without making a deal. A record uses the deal's own field names, so the
 * engine reads it as it reads a deal (work) and "Save as a deal" copies the fields across (dealFields).
 *
 * A blank is absent, never 0: a key left out means "not set". Money goes through quantizeDeal on save, as a
 * deal's does. A record with a `v` newer than this code knows is kept as it is, is not shown and is never
 * rewritten (migrate.js kvTooNew).
 *
 * Everything here is pure except load/save/delete, which take the storage as an argument (default: the app's
 * kv store), as research.js does. */

import * as store from './store.js';
import { quantizeDeal } from './engine/money.js';
import { analyze, scenarioAnswers } from './deal.js';
import { analysisInput } from './impact.js';
import { kvTooNew, migrateKvRecord } from './migrate.js';

export const KEY = 'uw.scratch';
export const MAX_SCRATCH = 100;
const ID = /^[a-z0-9]{1,40}$/;
const NAME_MAX = 200;

/** The numbers each part of a record may hold; anything else in it is not read. */
const NUMS = {
  figures: ['price', 'noi', 'bsf', 'units', 'gross', 'opex'],
  loan: ['ltv', 'rate', 'amort', 'closing', 'minDscr', 'minDy'],
  live: ['hold', 'growth', 'exitCap', 'saleCost'],
  targets: ['cap', 'irr'],
};
const ok = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * A stored record as this code reads it: a copy holding only what it knows, or null when it can't be read
 * (wrong type, an id that isn't plain, a name over 200 characters, a value that isn't a finite number).
 * A record from a newer version comes back as { ahead: true } and is left to the caller to keep as it is.
 */
export function readScratch(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (kvTooNew(KEY, raw)) return typeof raw.id === 'string' && ID.test(raw.id) ? { ahead: true } : null;
  const rec = migrateKvRecord(KEY, structuredClone(raw));
  if (rec.v !== 1 || typeof rec.id !== 'string' || !ID.test(rec.id)) return null;
  const name = rec.name === undefined ? '' : rec.name;
  if (typeof name !== 'string' || name.length > NAME_MAX) return null;
  const out = { v: 1, id: rec.id, name, createdAt: ok(rec.createdAt) ? rec.createdAt : 0, updatedAt: ok(rec.updatedAt) ? rec.updatedAt : 0 };
  for (const [part, keys] of Object.entries(NUMS)) {
    const src = rec[part] === undefined ? {} : rec[part];
    if (!src || typeof src !== 'object' || Array.isArray(src)) return null;
    out[part] = {};
    for (const k of keys) {
      if (src[k] === undefined) continue;
      if (!ok(src[k])) return null;
      out[part][k] = src[k];
    }
  }
  const ptype = rec.figures && rec.figures.ptype;
  if (ptype !== undefined) { if (typeof ptype !== 'string' || ptype.length > 100) return null; if (ptype) out.figures.ptype = ptype; }
  const io = rec.loan && rec.loan.io;
  if (io !== undefined) { if (typeof io !== 'boolean') return null; out.loan.io = io; }
  return out;
}

/** A backup's (or device's) list as it will be kept: the readable records, newest first, at most MAX_SCRATCH; how many were dropped. */
export function cleanScratch(v) {
  const out = []; const seen = new Set(); let dropped = 0;
  if (v !== undefined && v !== null && !Array.isArray(v)) return { list: [], dropped: 1 };
  for (const r of v || []) {
    const x = readScratch(r);
    if (!x || seen.has(r.id)) { dropped += 1; continue; }
    seen.add(r.id);
    out.push(x.ahead ? r : x);
  }
  out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { list: out.slice(0, MAX_SCRATCH), dropped: dropped + Math.max(0, out.length - MAX_SCRATCH) };
}

const rid = (now) => `u${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * A new, empty quick underwriting. `loan` is the loan terms a new deal starts from; the targets are the deal page's own.
 * @param {{ loan?: any, now?: number }} [a]
 */
export function newScratch({ loan = {}, now = Date.now() } = {}) {
  const rec = { v: 1, id: rid(now), name: '', createdAt: now, updatedAt: now, figures: {}, loan: {}, live: {}, targets: { cap: 7, irr: 15 } };
  for (const k of NUMS.loan) if (ok(loan[k])) rec.loan[k] = loan[k];
  if (typeof loan.io === 'boolean') rec.loan.io = loan.io;
  return rec;
}

/** The record as a deal, for the engine and the deal page's own helpers: no rent roll, no T-12, no saved scenarios. */
export const asDeal = (u) => ({ figures: { ...u.figures }, loan: { ...u.loan }, rentRoll: [], live: { ...u.live }, scenarios: [], targets: { ...u.targets } });

/** Every figure the card shows, from the engine the deal page uses: { m, run, answers }. */
export function work(u, comps = null) {
  const d = asDeal(u);
  const input = analysisInput(d);
  const m = analyze(input, comps);
  const { run, ...answers } = scenarioAnswers(input, m, d.live, { targetCap: u.targets.cap, targetIrr: u.targets.irr });
  return { m, run, answers };
}

/**
 * The fields of a new deal made from a quick underwriting (dealui.js createDeal): money to whole cents, every
 * figure marked as typed by hand, the loan terms exactly as entered (a blank stays blank: no loan to value is all cash).
 */
export function dealFields(u) {
  const d = asDeal(u);
  quantizeDeal(d);
  const loan = Object.fromEntries(NUMS.loan.map((k) => [k, d.loan[k] ?? null]));
  return {
    name: u.name, figures: d.figures, sources: Object.fromEntries(Object.keys(d.figures).map((k) => [k, { hand: true }])),
    loan: { ...loan, io: !!d.loan.io }, live: d.live, targets: { cap: u.targets.cap ?? null, irr: u.targets.irr ?? null, value: null },
  };
}

/* ---------------------------------------------------------------- storage */

const io = (s) => s || { get: store.kvGet, set: store.kvSet };
const asList = (v) => (Array.isArray(v) ? v.filter((b) => b && typeof b === 'object') : []);

/** Every stored record as stored (a newer version's included). */
export async function loadRaw(s) { return asList(await io(s).get(KEY)); }

/** What the screen shows: the readable records, newest first, and how many were left out (newer version, or unreadable). */
export async function loadScratch(s) {
  const raw = await loadRaw(s);
  const items = []; let hidden = 0;
  for (const r of raw) { const x = readScratch(r); if (x && !x.ahead) items.push(x); else hidden += 1; }
  return { items, hidden };
}

/** Saves a record (replacing the one with its id; money to whole cents). A new one past MAX_SCRATCH is refused, never trimmed silently. */
export async function saveScratch(rec, s) {
  const list = await loadRaw(s);
  const at = list.findIndex((b) => b.id === rec.id);
  if (at >= 0 && kvTooNew(KEY, list[at])) throw new Error('That quick underwriting was made by a newer version of Zlatura and is kept as it is.');
  if (at < 0 && list.length >= MAX_SCRATCH) throw new Error(`There are ${MAX_SCRATCH} quick underwritings on this device: delete one first.`);
  quantizeDeal(rec);
  if (at >= 0) list[at] = rec; else { list.push(rec); list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); }
  if (!(await io(s).set(KEY, list))) throw new Error('storage is full or blocked');
  return list;
}

export async function deleteScratch(id, s) {
  const list = (await loadRaw(s)).filter((b) => b.id !== id);
  if (!(await io(s).set(KEY, list.length ? list : null))) throw new Error('storage is full or blocked');
  return list;
}

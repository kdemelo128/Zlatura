/* dd.js -- the due-diligence document registry on a deal (deal.dd): what was received, never the files.
 * Pure data operations; ddui.js draws the Documents card and ddintake.js looks at a file.
 *
 * deal.dd = { v: 1, preset: null | Preset, na: { [typeId]: { reason, at } }, docs: Doc[] }
 * A Doc records a file by name, kind, size and SHA-256 fingerprint; no document bytes are kept, so reading a
 * file again means adding it again, and the fingerprint tells the broker it was already read. Values read from
 * a document stay where they live (deal.omRead, deal.rr, deal.t12, deal.sources); a Doc points at them
 * (`read.target`) and `sources[key].doc` points back. Only the broker's choices are stored: whether a type is
 * "found" is derived from the Docs, and a missing required document is "missing", never assumed received.
 * deal.dd is not an input to any calculation (impact.js NOT_CALCULATED). */

import { downloadName } from './kit.js';
import { TYPE_BY_ID, isType, PRESET_IDS, presetOf, requirementsFor } from './ddtypes.js';

export const MAX_DOCS = 200;
export const MAX_NAME = 200;
export const MAX_NOTE = 500;
export const MAX_REASON = 200;
export const KINDS = ['pdf', 'xlsx', 'csv', 'docx', 'image', 'text', 'other'];
export const STATUSES = ['received', 'read', 'reviewed', 'superseded'];
export const TYPE_BY = ['reader', 'broker'];
const READERS = ['om', 'rrpdf', 'rrsheet', 't12', 'ocr'];
const TARGETS = ['omRead', 'rr', 't12'];

/** An empty registry. */
export const newDd = () => ({ v: 1, preset: null, na: {}, docs: [] });

/** Cut a text to n characters without splitting a surrogate pair. */
export const cutText = (s, n) => { const t = String(s ?? '').slice(0, n); return /[\uD800-\uDBFF]$/.test(t) ? t.slice(0, -1) : t; };

/** A file name as the registry keeps it: the rules of kit.js downloadName, at most 200 characters. */
export const cleanName = (name) => cutText(downloadName(name), MAX_NAME);

const isoDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
/** A new id: the prefix and 12 base-36 characters (dd_, ab_). */
export const rid = (prefix = 'dd_') => {
  const bytes = new Uint8Array(12);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(bytes); else for (let i = 0; i < 12; i++) bytes[i] = Math.floor(Math.random() * 256);
  return `${prefix}${[...bytes].map((b) => (b % 36).toString(36)).join('')}`;
};

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
const normDoc = (x) => {
  const type = isType(x.type) ? x.type : null;
  const rd = isObj(x.read) && READERS.includes(x.read.reader) && TARGETS.includes(x.read.target) ? x.read : null;
  const ck = rd && isObj(rd.checks) ? rd.checks : {};
  return {
    id: typeof x.id === 'string' && x.id ? cutText(x.id, 40) : rid(), type, typeBy: type && TYPE_BY.includes(x.typeBy) ? x.typeBy : null,
    name: cleanName(typeof x.name === 'string' ? x.name : ''), kind: KINDS.includes(x.kind) ? x.kind : 'other',
    size: count(x.size), sha256: typeof x.sha256 === 'string' && /^[0-9a-f]{64}$/.test(x.sha256) ? x.sha256 : null,
    pages: Number.isInteger(x.pages) && x.pages > 0 ? x.pages : null,
    addedAt: typeof x.addedAt === 'string' ? cutText(x.addedAt, 40) : '', asOf: isoDay(x.asOf) ? x.asOf : null,
    status: STATUSES.includes(x.status) ? x.status : 'received', supersededBy: typeof x.supersededBy === 'string' ? cutText(x.supersededBy, 40) : null,
    read: rd ? { reader: rd.reader, at: typeof rd.at === 'string' ? cutText(rd.at, 40) : '', target: rd.target, checks: { pass: count(ck.pass), warn: count(ck.warn), fail: count(ck.fail) } } : null,
    note: cutText(typeof x.note === 'string' ? x.note : '', MAX_NOTE),
  };
};
/**
 * A clean copy of whatever is stored as a deal's registry, however a damaged or hostile backup left it: containers
 * made whole, every Doc coerced field by field (a bad value is null, 0 or unknown, never invented), Docs that are
 * not records dropped, repeated ids dropped, at most 200 Docs kept, n/a only for known types with a text reason.
 * @param {any} raw
 */
export function normDd(raw) {
  const r = isObj(raw) ? raw : {};
  const na = {};
  if (isObj(r.na)) for (const [id, v] of Object.entries(r.na)) if (isType(id) && isObj(v) && typeof v.reason === 'string' && v.reason.trim()) na[id] = { reason: cutText(v.reason.trim(), MAX_REASON), at: typeof v.at === 'string' ? cutText(v.at, 40) : '' };
  const seen = new Set();
  const docs = [];
  if (Array.isArray(r.docs)) for (const x of r.docs) {
    if (docs.length >= MAX_DOCS) break;
    if (!isObj(x)) continue;
    const doc = normDoc(x);
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    docs.push(doc);
  }
  return { v: 1, preset: typeof r.preset === 'string' && PRESET_IDS.includes(r.preset) ? r.preset : null, na, docs };
}

/** The deal's registry, cleaned in place when it needs it (see normDd), and made when the deal has none. */
export function ddOf(d) {
  const n = normDd(d.dd);
  if (!isObj(d.dd) || JSON.stringify(n) !== JSON.stringify(d.dd)) d.dd = n;
  return d.dd;
}

/** The Doc's kind from what checkUpload (filekind.js) found in the bytes. */
export function kindOf(upKind, name) {
  if (upKind === 'xlsx' || upKind === 'pdf' || upKind === 'docx' || upKind === 'image') return upKind;
  if (upKind === 'text') return /\.(csv|tsv)$/i.test(name || '') ? 'csv' : 'text';
  return 'other';
}

/**
 * Add a Doc. f: { name, kind, size, sha256?, pages?, type?, typeBy?, asOf?, read?, id? }. Returns { doc } or
 * { error, dup? }: a 201st Doc is refused; a file whose fingerprint is already here is not added twice. `asOf`
 * is only what the document itself prints, and null when unknown: never today.
 */
export function addDoc(dd, f, { now = new Date().toISOString() } = {}) {
  if (dd.docs.length >= MAX_DOCS) return { error: `A deal keeps at most ${MAX_DOCS} documents. Remove one before adding another.` };
  const sha = typeof f.sha256 === 'string' && /^[0-9a-f]{64}$/.test(f.sha256) ? f.sha256 : null;
  const dup = sha ? dd.docs.find((x) => x.sha256 === sha) : null;
  if (dup) return { error: `${dup.name} was already added${typeof dup.addedAt === 'string' && dup.addedAt ? ` on ${dup.addedAt.slice(0, 10)}` : ''}.`, dup };
  const type = isType(f.type) ? f.type : null;
  const doc = {
    id: f.id || rid(), type, typeBy: type && TYPE_BY.includes(f.typeBy) ? f.typeBy : null,
    name: cleanName(f.name), kind: KINDS.includes(f.kind) ? f.kind : 'other',
    size: Number.isInteger(f.size) && f.size >= 0 ? f.size : 0, sha256: sha, pages: Number.isInteger(f.pages) && f.pages > 0 ? f.pages : null,
    addedAt: now, asOf: isoDay(f.asOf) ? f.asOf : null,
    status: f.read ? 'read' : 'received', supersededBy: null, read: f.read || null, note: '',
  };
  dd.docs.push(doc);
  return { doc };
}

/** Take a Doc out of the list; { doc, index } so an Undo can put it back. */
export function removeDoc(dd, id) {
  const index = dd.docs.findIndex((x) => x.id === id);
  if (index < 0) return null;
  const [doc] = dd.docs.splice(index, 1);
  return { doc, index };
}
/** Put a removed Doc back where it was (the Undo of removeDoc). */
export function restoreDoc(dd, { doc, index }) { if (!dd.docs.some((x) => x.id === doc.id) && dd.docs.length < MAX_DOCS) dd.docs.splice(Math.min(index, dd.docs.length), 0, doc); }

/** The broker names a Doc's type. */
export function retype(dd, id, type) {
  const doc = dd.docs.find((x) => x.id === id);
  if (!doc || (type !== null && !isType(type))) return false;
  doc.type = type;
  doc.typeBy = type ? 'broker' : null;
  return true;
}

/** Mark a Doc reviewed by the broker. */
export function markReviewed(dd, id) {
  const doc = dd.docs.find((x) => x.id === id);
  if (!doc || doc.status === 'superseded') return false;
  doc.status = 'reviewed';
  return true;
}

/** The date a document prints ("as of"); '' clears it. Anything but a real YYYY-MM-DD is refused. */
export function setAsOf(dd, id, iso) {
  const doc = dd.docs.find((x) => x.id === id);
  if (!doc || (iso && !isoDay(iso))) return false;
  doc.asOf = iso || null;
  return true;
}

/** Not applicable, with a reason (1 to 200 characters once trimmed); { error } when there is none. */
export function setNa(dd, type, reason, { now = new Date().toISOString() } = {}) {
  if (!isType(type)) return { error: 'That is not a document type.' };
  // text with nothing visible in it (zero-width or control characters only) is no reason
  const r = cutText(String(reason ?? '').replace(/[\u0000-\u001f\u007f\u00ad\u200b-\u200f\u2060\u2028-\u202e\u2066-\u2069\ufeff]/g, '').trim(), MAX_REASON);
  if (!r) return { error: 'Say why it does not apply; a reason is needed.' };
  dd.na[type] = { reason: r, at: now };
  return { ok: true };
}
/** The Undo of setNa, or the broker changing their mind. */
export function clearNa(dd, type) { const had = dd.na[type]; delete dd.na[type]; return had || null; }

/** The broker's note on a Doc (at most 500 characters). */
export function setNote(dd, id, text) { const doc = dd.docs.find((x) => x.id === id); if (!doc) return false; doc.note = cutText(String(text ?? ''), MAX_NOTE); return true; }

/**
 * A reader has read this file. The Doc with this fingerprint (or, with none, this name and size) gets the read
 * record; otherwise one is added. f: { name, kind, size, sha256, pages?, type, read: { reader, target, checks } }.
 * Returns { doc, added } or { error }.
 */
export function recordRead(dd, f, { now = new Date().toISOString() } = {}) {
  const sha = f.sha256 || null;
  const have = dd.docs.find((x) => (sha ? x.sha256 === sha : x.sha256 === null && x.name === cleanName(f.name) && x.size === f.size));
  const read = { reader: f.read.reader, at: now, target: f.read.target, checks: { pass: f.read.checks.pass | 0, warn: f.read.checks.warn | 0, fail: f.read.checks.fail | 0 } };
  if (have) {
    have.read = read;
    if (have.status === 'received') have.status = 'read';
    if (!have.type) { have.type = f.type; have.typeBy = 'reader'; }
    return { doc: have, added: false };
  }
  const r = addDoc(dd, { ...f, typeBy: 'reader', read }, { now });
  return r.error ? r : { doc: r.doc, added: true };
}

/** Does any lease in the rent roll carry percentage rent (it makes the retail sales and REA documents required)? */
export const hasPercentRent = (d) => !!(d.rr && Array.isArray(d.rr.leases) && d.rr.leases.some((L) => L && L.percentRent));

/** The kind of property the checklist is for: the broker's choice, else the Property type figure's, else null (ask). */
export const presetFor = (d) => ((d.dd && PRESET_IDS.includes(d.dd.preset) && d.dd.preset) || presetOf(d.figures && d.figures.ptype)) || null;

/**
 * The checklist, derived (nothing here is stored): { preset, missing, found, optional, na, required, have }.
 * missing: required types with no Doc and no n/a; found: every Doc, newest last, with its type's label; optional:
 * optional types with no Doc and no n/a; na: types the broker marked not applicable (a type that has a Doc is
 * found, whatever the n/a says). `have` of `required` counts required types with a Doc that is not superseded;
 * a required type marked n/a leaves both counts.
 */
export function checklist(d) {
  const { docs, na, preset: chosen } = normDd(d.dd);
  const preset = chosen || presetOf(d.figures && d.figures.ptype) || null;
  const rows = requirementsFor(preset, { percentRent: hasPercentRent(d) });
  const has = (id) => docs.some((x) => x.type === id && x.status !== 'superseded');
  const missing = []; const optional = []; const naRows = []; let required = 0; let have = 0;
  for (const r of rows) {
    if (has(r.id)) { if (r.need === 'R') { required += 1; have += 1; } continue; }
    if (na[r.id]) { naRows.push({ ...r, reason: na[r.id].reason, at: na[r.id].at }); continue; }
    if (r.need === 'R') { required += 1; missing.push(r); } else optional.push(r);
  }
  // an n/a for a type outside this kind of property's list is still shown
  for (const [id, v] of Object.entries(na)) if (!rows.some((r) => r.id === id) && !has(id)) naRows.push({ id, label: TYPE_BY_ID[id].label, need: null, reason: v.reason, at: v.at });
  return { preset, missing, found: docs, optional, na: naRows, required, have };
}


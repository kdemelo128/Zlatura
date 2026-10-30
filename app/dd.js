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
import { TYPE_BY_ID, PRESET_IDS, presetOf, requirementsFor } from './ddtypes.js';

export const MAX_DOCS = 200;
export const MAX_NAME = 200;
export const MAX_NOTE = 500;
export const MAX_REASON = 200;
export const KINDS = ['pdf', 'xlsx', 'csv', 'docx', 'image', 'text', 'other'];
export const STATUSES = ['received', 'read', 'reviewed', 'superseded'];
export const TYPE_BY = ['reader', 'content', 'broker'];

/** An empty registry. */
export const newDd = () => ({ v: 1, preset: null, na: {}, docs: [] });

/** Cut a text to n characters without splitting a surrogate pair. */
export const cutText = (s, n) => { const t = String(s ?? '').slice(0, n); return /[\uD800-\uDBFF]$/.test(t) ? t.slice(0, -1) : t; };

/** A file name as the registry keeps it: the rules of kit.js downloadName, at most 200 characters. */
export const cleanName = (name) => cutText(downloadName(name), MAX_NAME);

const isoDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const rid = () => {
  const bytes = new Uint8Array(12);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(bytes); else for (let i = 0; i < 12; i++) bytes[i] = Math.floor(Math.random() * 256);
  return `dd_${[...bytes].map((b) => (b % 36).toString(36)).join('')}`;
};

/** The deal's registry, made whole if a damaged backup left parts out. Creates it when the deal has none. */
export function ddOf(d) {
  const dd = d.dd && typeof d.dd === 'object' ? d.dd : (d.dd = newDd());
  if (!Array.isArray(dd.docs)) dd.docs = [];
  if (!dd.na || typeof dd.na !== 'object' || Array.isArray(dd.na)) dd.na = {};
  if (dd.preset !== null && !PRESET_IDS.includes(dd.preset)) dd.preset = null;
  return dd;
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
  if (dup) return { error: `${dup.name} was already added on ${dup.addedAt.slice(0, 10)}.`, dup };
  const type = f.type && TYPE_BY_ID[f.type] ? f.type : null;
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
  if (!doc || (type !== null && !TYPE_BY_ID[type])) return false;
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
  if (!TYPE_BY_ID[type]) return { error: 'That is not a document type.' };
  const r = cutText(String(reason ?? '').trim(), MAX_REASON);
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
export const presetFor = (d) => ((d.dd && d.dd.preset) || presetOf(d.figures && d.figures.ptype)) || null;

/**
 * The checklist, derived (nothing here is stored): { preset, missing, found, optional, na, required, have }.
 * missing: required types with no Doc and no n/a; found: every Doc, newest last, with its type's label; optional:
 * optional types with no Doc and no n/a; na: types the broker marked not applicable (a type that has a Doc is
 * found, whatever the n/a says). `have` of `required` counts required types with a Doc that is not superseded;
 * a required type marked n/a leaves both counts.
 */
export function checklist(d) {
  const dd = d.dd && typeof d.dd === 'object' ? d.dd : newDd();
  const docs = Array.isArray(dd.docs) ? dd.docs : [];
  const na = dd.na && typeof dd.na === 'object' ? dd.na : {};
  const preset = presetFor(d);
  const rows = requirementsFor(preset, { percentRent: hasPercentRent(d) });
  const has = (id) => docs.some((x) => x.type === id && x.status !== 'superseded');
  const missing = []; const optional = []; const naRows = []; let required = 0; let have = 0;
  for (const r of rows) {
    if (has(r.id)) { if (r.need === 'R') { required += 1; have += 1; } continue; }
    if (na[r.id]) { naRows.push({ ...r, reason: na[r.id].reason, at: na[r.id].at }); continue; }
    if (r.need === 'R') { required += 1; missing.push(r); } else optional.push(r);
  }
  // an n/a for a type outside this kind of property's list is still shown
  for (const [id, v] of Object.entries(na)) if (TYPE_BY_ID[id] && !rows.some((r) => r.id === id) && !has(id)) naRows.push({ id, label: TYPE_BY_ID[id].label, need: null, reason: v.reason, at: v.at });
  return { preset, missing, found: docs, optional, na: naRows, required, have };
}


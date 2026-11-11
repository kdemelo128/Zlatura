/* ddintake.js -- look at a file the broker adds to the Documents card and say what it is, without guessing.
 *
 * Content decides, never the file name. The readers that already exist decide first: a PDF goes to rrdoc.js
 * docKind (a rent roll or an OM); a workbook or CSV goes to the T-12 reader's month columns (t12.layoutOf) and the
 * rent roll's headings (rentrollui.headerAndRows), and when both accept it the answer is "ask". A file no reader
 * accepts is scored on its first pages' text (ddtypes.js classify); an unclear score asks. A type is set only by a reader
 * (or by the broker's tap); text that scores clearly is offered as "looks like", and the file name only
 * pre-selects a choice in the question. Nothing here stores anything or sends anything anywhere. */

import { checkUpload, LIMITS, unpackBundle } from './filekind.js';
import { readGrids } from './sheetread.js';
import { docKind } from './rrdoc.js';
import { layoutOf, sheetChoices, pickSheet } from './t12.js';
import { headerAndRows } from './rentrollui.js';
import { classify, scoreText, suggestFromName } from './ddtypes.js';
import { kindOf } from './dd.js';
import { sha256Hex } from './filehash.js';

const accepts = (fn) => { try { return !!fn(); } catch { return false; } };
const cellText = (grids) => grids.flatMap((g) => g.rows.slice(0, 60).map((r) => r.cells.filter((c) => typeof c === 'string').join(' '))).join('\n').replace(/[ \t]+/g, ' ');

/** Types only a reader may set: the text can look like one, but then the broker is asked. */
const READER_TYPES = ['om', 'rentroll', 't12'];

/**
 * What a file is, from what was read of it. Input: { name, pages (a PDF's text per page), layouts, grids (a workbook's
 * or CSV's sheets: [{ sheet, rows: [{ r, cells }] }]) }. Output: { type, typeBy ('reader'|null), reader, looks (a type
 * the text clearly reads as, to be confirmed with a tap: never set by itself), readers (only when two readers both accept a workbook: ['t12', 'rrsheet']), ask (the types to offer, best first),
 * suggest (from the name), scanned, text }. Only a reader sets `type`. A budget, an annual-only statement, a T-12 or an
 * appraisal in a PDF, or text that reads as an OM, rent roll or T-12, is never typed by its text: it asks.
 * @param {{ name?: string, pages?: string[] | null, layouts?: any, grids?: any[] | null }} f
 */
export function identify({ name = '', pages = null, layouts = null, grids = null }) {
  const out = { type: /** @type {string | null} */ (null), typeBy: /** @type {'reader'|null} */ (null), reader: /** @type {string | null} */ (null), looks: /** @type {string | null} */ (null), ask: /** @type {string[]} */ ([]), suggest: suggestFromName(name), scanned: false, text: '' };
  let omRead = false;
  if (pages) {
    out.text = pages.slice(0, 3).join('\n');
    const dk = docKind(pages, layouts);
    out.scanned = dk.kind === 'scanned';
    if (dk.kind === 'rentroll') return { ...out, type: 'rentroll', typeBy: 'reader', reader: 'rrpdf' };
    // "any two OM words" also reads an appraisal or a broker opinion of value: when the text says another type at least as loudly, ask
    if (dk.kind === 'om') {
      const sc = scoreText(out.text);
      const om = sc.find((x) => x.id === 'om');
      const other = sc.find((x) => x.id !== 'om');
      // a broker opinion of value has no type of its own and reads like an OM: ask as well
      const bov = /broker'?s?\s+opinion\s+of\s+value|\bBOV\b/i.test(out.text);
      if (!bov && !(other && other.score >= 2 && other.score >= (om ? om.score : 0))) return { ...out, type: 'om', typeBy: 'reader', reader: 'om' };
      omRead = true;
    }
  } else if (grids) {
    // the T-12 import's own test: a sheet it would read as an actual statement (not a budget or projection), with month columns
    const picked = pickSheet(sheetChoices(grids, { file: name }));
    // the month columns must be on the sheet the import would read, not on some other sheet of the workbook
    const candidates = picked.refuse ? [] : (picked.choice ? [picked.choice] : picked.ask.filter((c) => !c.projection));
    const accepted = candidates.some((c) => accepts(() => layoutOf(grids[c.i].rows, { sheet: grids[c.i].sheet }).monthCols.length >= 3));
    const roll = grids.some((g) => accepts(() => headerAndRows(g.rows.map((r) => r.cells), g.sheet)));
    // both readers accept it (one workbook holding a rent roll sheet and a statement sheet): no reader is chosen, so
    // `readers` names both and the screen offers a Use for each; each import then picks its own sheet by its own tests
    if (accepted && roll) return { ...out, ask: ['t12', 'rentroll'], readers: ['t12', 'rrsheet'] };
    if (accepted) return { ...out, type: 't12', typeBy: 'reader', reader: 't12' };
    if (roll) return { ...out, type: 'rentroll', typeBy: 'reader', reader: 'rrsheet' };
    out.text = cellText(grids);
  }
  const c = classify(out.text, name);
  const top = c.scores.slice(0, 3).map((x) => x.id);
  if (omRead) return { ...out, ask: [...new Set([...top.filter((x) => x !== 'om'), 'om', 'appraisal'])].slice(0, 3) };
  if (c.type && READER_TYPES.includes(c.type)) return { ...out, ask: c.type === 't12' ? ['t12', 'priorStmt', 'budget'] : c.ask.length ? c.ask : top };
  if (c.type) return { ...out, looks: c.type, ask: [c.type] };
  return { ...out, ask: c.ask };
}

/**
 * Look at one file: its kind from the bytes (checkUpload), its SHA-256 (null where the browser has none), its page
 * count, and what it is (identify). `readPdf(bytes)` gives { pages, layouts } for a PDF and throws when it can't be
 * read. Returns { name, kind, size, sha256, pages, refuse (text for role="alert", or null), verdict }. A file nothing
 * can read is still described, so it can be recorded as received.
 * @param {File} file
 * @param {{ getFflate?: () => Promise<any>, getXlsx: () => Promise<any>, readPdf: (bytes: Uint8Array) => Promise<{ pages: string[], layouts: any[] }>, problem?: (err: any, file: File) => string }} deps
 */
export async function intake(file, { getFflate, getXlsx, readPdf, problem = (e) => String((e && e.message) || e) }) {
  const up = await checkUpload(file, { getFflate, bundle: true });
  const kind = kindOf(up.kind, file.name);
  const info = { name: file.name, kind, size: file.size, sha256: /** @type {string | null} */ (null), pages: /** @type {number | null} */ (null), refuse: /** @type {string | null} */ (null), bytes: /** @type {Uint8Array | null} */ (null), verdict: identify({ name: file.name }), plainZip: !!up.plainZip, from: /** @type {string | null} */ (null) };
  // checkUpload's refusal for a PDF, photo or Word file means "the T-12 reader can't import it"; here only a size limit stops one
  const sizeOnly = ['pdf', 'image', 'docx'].includes(up.kind);
  if (up.refuse && (!sizeOnly || /^That file is \d/.test(up.refuse))) info.refuse = up.refuse;
  const bytes = file.size <= (LIMITS.pdf || 50e6) ? new Uint8Array(await file.arrayBuffer()) : null;
  if (bytes) info.sha256 = await sha256Hex(bytes);
  if (info.refuse && !(up.kind === 'pdf' || up.kind === 'image')) return info;
  try {
    if (up.kind === 'pdf' && bytes && !info.refuse) {
      const { pages, layouts } = await readPdf(bytes.slice());
      info.pages = pages.length || null;
      info.verdict = identify({ name: file.name, pages, layouts: layouts.length === pages.length ? layouts : null });
      // a scan keeps its bytes in memory for the broker's choice to read its first page; they are never stored
      if (info.verdict.scanned) info.bytes = bytes;
    } else if ((up.kind === 'xlsx' || up.kind === 'text') && !up.refuse) {
      const grids = await readGrids(file, getXlsx, { maxRows: 400, includeHidden: true, upload: up, getFflate });
      info.verdict = identify({ name: file.name, grids });
    }
  } catch (err) { info.refuse = `${file.name} can’t be read here: ${problem(err, file)}`; }
  return info;
}

/** The deepest a zip may sit inside zips: a zip in the dropped zip is opened, a zip in that one is not. */
export const ZIP_DEPTH = 1;

const baseName = (p) => p.split(/[\\/]/).pop() || p;
/** A File for a part of a zip, held in memory only; a File-like where the platform has no File. */
function memberFile(name, bytes) {
  if (typeof File === 'function') return new File([bytes], name);
  const ab = () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return { name, size: bytes.length, type: '', slice: (a, b) => ({ arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset + a, bytes.byteOffset + Math.min(b, bytes.length)) }), arrayBuffer: async () => ab(), text: async () => new TextDecoder().decode(bytes) };
}

/**
 * Open a zip dropped as a bundle, in memory, with filekind's guards (unpackBundle). `info` is what intake() said of
 * the zip (plainZip set). Returns null when `info` is not a bundle, else { members, refuse }: `members` lists, flat and in
 * the zip's order, each part as { file, name, from, refuse } (`file` is null for a refused part; `from` is the zip's name,
 * and for a zip inside a zip "outer.zip › inner.zip"), and `refuse` is set (with no members) when the zip as a whole is
 * refused or empty. A nested zip is opened once (ZIP_DEPTH); one more level is refused. A part whose name another part
 * shares is named by its path. Nothing is written anywhere.
 * @param {File} file @param {any} info @param {{ getFflate?: () => Promise<any> }} deps
 * @returns {Promise<{ members: { file: any, name: string, from: string, refuse: string | null }[], refuse: string | null } | null>}
 */
export async function zipMembers(file, info, deps, { from = null, depth = 0, budget = { files: 0, bytes: 0 } } = {}) {
  if (!info || !info.plainZip) return null;
  const me = from ? `${from} › ${file.name}` : file.name;
  const fflate = deps.getFflate ? await deps.getFflate() : null;
  if (!fflate) return { members: [], refuse: `“${file.name}” is a zip file, and this browser could not open it.` };
  let bundle;
  try { bundle = unpackBundle(new Uint8Array(await file.arrayBuffer()), fflate, budget); } catch (e) { return { members: [], refuse: `“${file.name}” was not opened: ${String((e && e.message) || e).replace(/^That file/, 'it').replace(/ It was not opened\.$/, '')}` }; }
  if (!bundle.files.length && !bundle.refused.length) return { members: [], refuse: `“${file.name}” is an empty zip: there is nothing in it to read.` };
  const taken = new Map();
  for (const f of bundle.files) taken.set(baseName(f.name), (taken.get(baseName(f.name)) || 0) + 1);
  const members = [];
  for (const f of bundle.files) {
    const name = taken.get(baseName(f.name)) > 1 ? f.name : baseName(f.name);
    const inner = memberFile(name, f.bytes);
    const sub = await zipMembersOf(inner, deps, { from: me, depth, budget });
    if (sub) members.push(...sub);
    else members.push({ file: inner, name, from: me, refuse: null });
  }
  for (const r of bundle.refused) members.push({ file: null, name: r.name, from: me, refuse: `${r.name} ${r.why}.`.replace(/\.\.$/, '.') });
  return { members, refuse: null };
}

/** An inner file that is itself a zip bundle: its members, or one refused entry (too deep, or not opened); null when it is not a bundle. */
async function zipMembersOf(inner, deps, { from, depth, budget }) {
  const up = await checkUpload(inner, { getFflate: deps.getFflate, bundle: true });
  if (!up.plainZip) return null;
  if (depth >= ZIP_DEPTH) return [{ file: null, name: inner.name, from, refuse: `${inner.name} is a zip inside a zip inside a zip; only one zip inside the dropped one is opened, so it was not opened.` }];
  const z = await zipMembers(inner, { plainZip: true }, deps, { from, depth: depth + 1, budget });
  return z.refuse ? [{ file: null, name: inner.name, from, refuse: z.refuse }] : z.members;
}

/**
 * Look at one dropped file and, when it is a zip bundle, at each file inside it as if it had been dropped itself.
 * Returns [{ file, info }]: one for an ordinary file; one per part for a zip (`info.from` names the zip); one
 * refused item for a zip that is refused whole or empty, so its reason is shown. A refused part says why, and the
 * others still go on.
 * @param {File} file @param {Parameters<typeof intake>[1]} deps
 * @returns {Promise<{ file: any, info: any }[]>}
 */
export async function lookAt(file, deps) {
  const info = await intake(file, deps);
  const z = await zipMembers(file, info, deps);
  if (!z) return [{ file, info }];
  if (z.refuse) return [{ file, info: { ...info, refuse: z.refuse, plainZip: false } }];
  const out = [];
  for (const m of z.members) {
    if (m.refuse) { out.push({ file: m.file, info: { name: m.name, kind: 'other', size: 0, sha256: null, pages: null, refuse: m.refuse, bytes: null, verdict: identify({ name: m.name }), plainZip: false, from: m.from } }); continue; }
    let one;
    try { one = await intake(m.file, deps); } catch (err) { one = { name: m.name, kind: 'other', size: m.file.size, sha256: null, pages: null, refuse: `${m.name} couldn’t be looked at: ${(err && /** @type {any} */ (err).message) || err}`, bytes: null, verdict: identify({ name: m.name }), plainZip: false }; }
    out.push({ file: m.file, info: { ...one, from: m.from } });
  }
  return out;
}

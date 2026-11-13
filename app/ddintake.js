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
import { docKind, ROLL_TITLE, T12_TITLE } from './rrdoc.js';
import { pdfStatementChoices } from './pdfstatement.js';
import { layoutOf, sheetChoices } from './t12.js';
import { headerAndRows } from './rentrollui.js';
import { sheetShape, tableShape, isRentSchedule } from './tableshape.js';
import { classify, scoreText, suggestFromName } from './ddtypes.js';
import { kindOf } from './dd.js';
import { sha256Hex } from './filehash.js';

const accepts = (fn) => { try { return !!fn(); } catch { return false; } };
const cellText = (grids) => grids.flatMap((g) => g.rows.slice(0, 60).map((r) => r.cells.filter((c) => typeof c === 'string').join(' '))).join('\n').replace(/[ \t]+/g, ' ');

/** Types only a reader may set: the text can look like one, but then the broker is asked. */
const READER_TYPES = ['om', 'rentroll', 't12'];

/** The first lines of a page: where a title sits. */
const topOf = (page) => String(page).split('\n').filter((l) => l.trim()).slice(0, 8).join('\n');

/** Whether the first page of a PDF that is not itself titled as a rent roll says the document is an appraisal or a broker opinion of value: 'appraisal', 'bov' or null. */
function appraisalFirst(pages) {
  const first = String(pages[0] || '');
  if (ROLL_TITLE.test(topOf(first))) return null;
  if (/broker'?s?\s+opinion\s+of\s+value|\bBOV\b/i.test(first)) return 'bov';
  const sc = scoreText(first).find((x) => x.id === 'appraisal');
  return sc && sc.score >= 2 ? 'appraisal' : null;
}

/**
 * Does the reader of `type` accept this PDF's own content? Only a rent roll's table or an operating statement's
 * month or year columns count: the words alone never do. { reader, why } or null. A rent roll needs three rows, a rent column
 * and a suite or area column; a statement must be one the T-12 PDF import would offer (an actual, complete period). The OM
 * reader is not asked here: an OM is typed by its own words (docKind).
 */
function readerAccepts(type, dk, pages, layouts) {
  if (type === 'rentroll') {
    const roll = dk.roll;
    const kinds = new Set(roll ? (roll.columns || []).map((c) => c.kind) : []);
    if (roll && roll.rows.length >= 3 && ['monthly', 'annual', 'psf'].some((k) => kinds.has(k)) && (kinds.has('sf') || kinds.has('suite'))) return { reader: 'rrpdf', why: `A rent roll table of ${roll.rows.length} rows was read from it, though nothing on its first pages titles it as one.` };
  } else if (type === 't12') {
    if (accepts(() => pdfStatementChoices(pages, { layouts }).some((c) => c.eligible))) return { reader: 't12pdf', why: 'An operating statement table with actual months or an actual year was read from it, though nothing on its first pages titles it as one.' };
  }
  return null;
}

/**
 * The page runs of a PDF that a specific reader accepts on their own: [{ type, reader, pages: [from, to] }] (1-based).
 * A rent roll run starts on a page titled as one whose own pages read as a rent roll (docKind, with no OM wording
 * there) and runs on while the next page makes the table longer; a statement is one page titled as one that the T-12
 * PDF import would offer. A run overlapping another is dropped. Pages no reader accepts are not listed (loan or tax pages have no reader).
 * @param {string[]} pages @param {any[] | null} layouts @param {string[]} kinds the types to look for
 */
function pageParts(pages, layouts, kinds) {
  const out = [];
  const sub = (a, b) => ({ pages: pages.slice(a, b), layouts: layouts ? layouts.slice(a, b) : null });
  for (let i = 0; i < pages.length; i++) {
    if (out.length && out[out.length - 1].pages[1] > i) continue;
    const top = topOf(pages[i]);
    if (kinds.includes('rentroll') && ROLL_TITLE.test(top)) {
      const one = sub(i, i + 1);
      let dk; try { dk = docKind(one.pages, one.layouts); } catch { dk = null; }
      if (dk && dk.kind === 'rentroll' && dk.roll) {
        let end = i + 1; let rows = dk.roll.rows.length;
        while (end < pages.length && !ROLL_TITLE.test(topOf(pages[end])) && !T12_TITLE.test(topOf(pages[end]))) {
          const more = sub(i, end + 1);
          let d2; try { d2 = docKind(more.pages, more.layouts); } catch { d2 = null; }
          if (!d2 || d2.kind !== 'rentroll' || !d2.roll || d2.roll.rows.length <= rows) break;
          rows = d2.roll.rows.length; end += 1;
        }
        out.push({ type: 'rentroll', reader: 'rrpdf', pages: [i + 1, end] });
        continue;
      }
    }
    if (kinds.includes('t12') && T12_TITLE.test(top)) {
      const one = sub(i, i + 1);
      if (accepts(() => pdfStatementChoices(one.pages, { layouts: one.layouts }).some((c) => c.eligible))) out.push({ type: 't12', reader: 't12pdf', pages: [i + 1, i + 1] });
    }
  }
  return out;
}

/**
 * What a file is, from what was read of it. Input: { name, pages (a PDF's text per page), layouts, grids (a workbook's
 * or CSV's sheets: [{ sheet, rows: [{ r, cells }] }]) }. Output: { type, typeBy ('reader'|null), reader, looks (a type
 * the text clearly reads as, to be confirmed with a tap: never set by itself), readers (only when two readers both accept a workbook: ['t12', 'rrsheet']), ask (the types to offer, best first),
 * suggest (from the name), scanned, text }. Only a reader sets `type`. A budget, an annual-only statement, a T-12 or an
 * appraisal in a PDF, or text that reads as an OM, rent roll or T-12, is never typed by its text: it asks. `ocr`: the pages' text was written by OCR, so a short text is never taken for real text (textlayer.js).
 * @param {{ name?: string, pages?: string[] | null, layouts?: any, grids?: any[] | null, ocr?: boolean }} f
 */
export function identify({ name = '', pages = null, layouts = null, grids = null, ocr = false }) {
  const out = { type: /** @type {string | null} */ (null), typeBy: /** @type {'reader'|null} */ (null), reader: /** @type {string | null} */ (null), looks: /** @type {string | null} */ (null), ask: /** @type {string[]} */ ([]), suggest: suggestFromName(name), scanned: false, text: '' };
  let omRead = false;
  let dk = /** @type {any} */ (null);
  if (pages) {
    out.text = pages.slice(0, 3).join('\n');
    dk = docKind(pages, layouts, { ocr });
    out.scanned = dk.kind === 'scanned';
    // a table with a rent roll's columns that is a unit mix or a lease comparable table (rrdoc.js docKind says so): never read as a rent roll
    if (dk.shape) {
      const lc = dk.shape === 'leasecomp';
      return { ...out, ...(lc ? {} : { looks: 'unitMix' }), ask: lc ? [] : ['unitMix'], why: lc ? 'This is a table of lease comparables (an address, a size, a rate, a term and a start date for each). It is not a rent roll, and there is no importer for lease comparables, so it is not read.' : 'This is a unit mix (a count of units for each type), not a rent roll. Confirm it, and its figures are read for you to check.', shape: dk.shape };
    }
    if (dk.kind === 'rentroll') {
      // an appraisal or a broker opinion of value that carries a titled rent roll page is that document, not a rent roll: asked, with no reader, and its roll pages offered apart
      const heldBy = appraisalFirst(pages);
      if (!heldBy) return { ...out, type: 'rentroll', typeBy: 'reader', reader: 'rrpdf' };
      const parts = pageParts(pages, layouts, ['rentroll']);
      return { ...out, ask: heldBy === 'bov' ? ['om', 'appraisal'] : ['appraisal'], why: `Its first page reads as ${heldBy === 'bov' ? 'a broker opinion of value' : 'an appraisal'}, and a rent roll is only one part of it, so the whole file is not read as a rent roll. Choose what it is${parts.length ? '; the rent roll pages are offered apart from it' : ''}.`, ...(parts.length ? { parts } : {}) };
    }
    if (dk.kind === 't12' && pdfStatementChoices(pages, { layouts }).some((c) => c.eligible)) {
      // a title that says operating statement keeps the statement route; a rent roll on another page is offered by its pages, never read in its place
      const parts = pageParts(pages, layouts, ['rentroll']);
      return { ...out, type: 't12', typeBy: 'reader', reader: 't12pdf', ...(parts.length ? { parts } : {}) };
    }
    // "any two OM words" also reads an appraisal or a broker opinion of value: when the text says another type at least as loudly, ask
    if (dk.kind === 'om') {
      const sc = scoreText(out.text);
      const om = sc.find((x) => x.id === 'om');
      const other = sc.find((x) => x.id !== 'om');
      // a broker opinion of value has no type of its own and reads like an OM: ask as well
      const bov = /broker'?s?\s+opinion\s+of\s+value|\bBOV\b/i.test(out.text);
      if (!bov && !(other && other.score >= 2 && other.score >= (om ? om.score : 0))) return { ...out, type: 'om', typeBy: 'reader', reader: 'om' };
      omRead = true;
      // an OM that also holds rent roll or statement pages: the OM, and apart from it the pages a specific reader accepts. Not for a broker
      // opinion of value or an appraisal (they stay asked), and a statement title on the document keeps the statement route.
      if (!bov && other.id !== 'appraisal') {
        if (T12_TITLE.test(pages.slice(0, 2).join('\n'))) {
          if (accepts(() => pdfStatementChoices(pages, { layouts }).some((c) => c.eligible))) return { ...out, type: 't12', typeBy: 'reader', reader: 't12pdf', parts: pageParts(pages, layouts, ['rentroll']) };
        } else {
          const parts = pageParts(pages, layouts, ['rentroll', 't12']);
          if (parts.length) return { ...out, type: 'om', typeBy: 'reader', reader: 'om', parts };
        }
      }
    }
  } else if (grids) {
    // the T-12 import's own test, sheet by sheet: a sheet it would read as an actual statement (not a budget or projection), with month columns
    const choices = sheetChoices(grids, { file: name });
    // a rent schedule (a tenant or suite beside month columns, and too few headings for the rent roll import: a rent roll with month columns is the one question below), a unit mix or a lease comparable table has the columns of a statement or a rent roll
    // but is neither: it is set aside here and asked below, never read as one
    const schedule = new Set(); const shaped = new Map();
    const t12 = choices.filter((c) => !c.error && !c.projection).flatMap((c) => { try { const L = layoutOf(grids[c.i].rows, { sheet: grids[c.i].sheet }); const n = L.monthCols.length; if (n >= 3 && isRentSchedule(L.head.row.cells, L.head.ms) && !accepts(() => headerAndRows(grids[c.i].rows.map((r) => r.cells), grids[c.i].sheet))) { schedule.add(c.i); return []; } return n >= 3 ? [{ i: c.i, sheet: c.sheet, hidden: c.hidden, score: n }] : []; } catch { return []; } });
    // the rent roll import's own test, sheet by sheet: a row of three or more recognised headings (its score is how many)
    const roll = grids.flatMap((g, i) => { try { const sh = sheetShape(g.rows); if (sh) { shaped.set(i, sh); return []; } if (schedule.has(i)) return []; const t = headerAndRows(g.rows.map((r) => r.cells), g.sheet); return t ? [{ i, sheet: g.sheet, hidden: !!g.hidden, score: Math.floor(t.score / 100) }] : []; } catch { return []; } });
    // a sheet both readers accept is never routed by score (recognised headings and month columns are not comparable): it is one question
    const both = roll.filter((r) => t12.some((t) => t.i === r.i)).map((r) => r.i);
    const ambiguous = both.map((i) => grids[i].sheet);
    for (const list of [roll, t12]) for (const i of both) list.splice(list.findIndex((x) => x.i === i), 1);
    // the rent roll import skips hidden sheets: a rent roll found only on hidden sheets is said, not offered as read (the T-12 import takes hidden sheets)
    const hiddenRoll = roll.length && roll.every((x) => x.hidden) ? roll.splice(0).map((x) => x.sheet) : [];
    // hidden sheets count only when no visible sheet reads as that kind, and the part says so
    const part = (type, reader, list) => {
      const seen = list.filter((x) => !x.hidden);
      const use = seen.length ? seen : list;
      return { type, reader, sheets: use.map((x) => x.sheet), hiddenOnly: !seen.length };
    };
    const parts = [...(t12.length ? [part('t12', 't12', t12)] : []), ...(roll.length ? [part('rentroll', 'rrsheet', roll)] : [])];
    const more = { ...(ambiguous.length ? { ambiguous } : {}), ...(hiddenRoll.length ? { hiddenRoll } : {}) };
    // both readers accept it (one workbook holding a rent roll sheet and a statement sheet): no reader is chosen, so
    // `readers` names both and the screen offers a Use for each, each on its own sheet; each import then picks its own sheet by its own tests
    if (t12.length && roll.length) return { ...out, ask: ['t12', 'rentroll'], readers: ['t12', 'rrsheet'], parts, ...more };
    if (t12.length) return { ...out, type: 't12', typeBy: 'reader', reader: 't12', parts, ...more };
    if (roll.length) return { ...out, type: 'rentroll', typeBy: 'reader', reader: 'rrsheet', parts, ...more };
    if (ambiguous.length) return { ...out, ask: ['rentroll', 't12'], ...more };
    if (hiddenRoll.length) return { ...out, ask: ['rentroll'], ...more };
    const sheetsOf = (pick) => [...pick].map((i) => `“${grids[i].sheet}”`).join(', ');
    const comps = [...shaped].filter(([, v]) => v === 'leasecomp').map(([i]) => i);
    const mixes = [...shaped].filter(([, v]) => v === 'unitmix').map(([i]) => i);
    if (comps.length || mixes.length || schedule.size) {
      out.text = cellText(grids);
      const why = [
        comps.length ? `Sheet ${sheetsOf(comps)} is a table of lease comparables (an address, a size, a rate, a term and a start date for each). It is not a rent roll, and there is no importer for lease comparables, so it is not read.` : '',
        mixes.length ? `Sheet ${sheetsOf(mixes)} is a unit mix (a count of units for each type), not a rent roll. Confirm it, and its figures are read for you to check.` : '',
        schedule.size ? `Sheet ${sheetsOf(schedule)} is a rent schedule by month for each tenant. It is not an operating statement, and its months are not added up into one rent, because nothing here says what period each figure covers. Import a rent roll with a stated rent, or enter the rents by hand.` : '',
      ].filter(Boolean).join(' ');
      // a unit mix alone is the unit mix reader's (its figures are checked and asked about); the others have no reader
      if (mixes.length && !comps.length && !schedule.size) return { ...out, looks: 'unitMix', ask: ['unitMix'], why, shape: 'unitmix', ...more };
      return { ...out, ask: schedule.size && !comps.length ? ['rentroll'] : [], why, shape: comps.length ? 'leasecomp' : 'schedule', ...more };
    }
    out.text = cellText(grids);
  }
  const c = classify(out.text, name);
  const top = c.scores.slice(0, 3).map((x) => x.id);
  // the text names one type that has a reader (the classifier is sure of it, or it is the only type the text scores), the file has
  // no title the readers know, and that reader accepts the content: show its preview, never ask. A statement title keeps the
  // statement route (nothing is sent to the rent roll reader because a rent roll is also in the file).
  if (pages && dk && !omRead && !out.scanned && dk.kind !== 'om') {
    const named = c.type && READER_TYPES.includes(c.type) ? c.type : c.scores.length === 1 && READER_TYPES.includes(c.scores[0].id) ? c.scores[0].id : null;
    // a statement is in the file (the text scores a statement, a budget or prior-year type, or the PDF statement reader finds a table) when the
    // text names a rent roll: never read the whole file as a rent roll then; its roll pages are offered by page where a title says so
    const statementHere = named === 'rentroll' && (c.scores.some((x) => ['t12', 'priorStmt', 'budget'].includes(x.id)) || accepts(() => pdfStatementChoices(pages, { layouts }).length > 0));
    if (named && !statementHere && (named === 't12' || dk.kind === 'unknown')) {
      const r = readerAccepts(named, dk, pages, layouts);
      if (r) return { ...out, type: named, typeBy: 'reader', reader: r.reader, route: r.why };
    }
  }
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
  const info = { name: file.name, kind, size: file.size, sha256: /** @type {string | null} */ (null), pages: /** @type {number | null} */ (null), refuse: /** @type {string | null} */ (null), bytes: /** @type {Uint8Array | null} */ (null), verdict: identify({ name: file.name }), plainZip: !!up.plainZip, from: /** @type {string | null} */ (null), textPages: /** @type {string[] | null} */ (null) };
  // checkUpload's refusal for a PDF, photo or Word file means "the T-12 reader can't import it"; here only a size limit stops one
  const sizeOnly = ['pdf', 'image', 'docx'].includes(up.kind);
  if (up.refuse && (!sizeOnly || /^That file is \d/.test(up.refuse))) info.refuse = up.refuse;
  const bytes = file.size <= (LIMITS.pdf || 50e6) ? new Uint8Array(await file.arrayBuffer()) : null;
  if (bytes) info.sha256 = await sha256Hex(bytes);
  if (info.refuse && !(up.kind === 'pdf' || up.kind === 'image')) return info;
  try {
    if (up.kind === 'pdf' && bytes && !info.refuse) {
      const { pages, layouts, ocr } = /** @type {any} */ (await readPdf(bytes.slice()));
      info.pages = pages.length || null;
      info.textPages = pages;   // held in memory for Ask Monal's document search (docsession.js); never stored
      info.verdict = identify({ name: file.name, pages, layouts: layouts.length === pages.length ? layouts : null, ocr: !!ocr });
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
export const ZIP_DEPTH = 2;

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
  for (const r of bundle.refused) members.push({ file: null, name: r.name, from: me, refuse: `${r.why[0].toUpperCase()}${r.why.slice(1)}.` });
  return { members, refuse: null };
}

/** An inner file that is itself a zip bundle: its members, or one refused entry (too deep, or not opened); null when it is not a bundle. */
async function zipMembersOf(inner, deps, { from, depth, budget }) {
  const up = await checkUpload(inner, { getFflate: deps.getFflate, bundle: true });
  if (!up.plainZip) return null;
  if (depth >= ZIP_DEPTH) return [{ file: null, name: inner.name, from, refuse: 'This is a zip inside a zip inside a zip inside a zip; only two levels of zip inside the dropped one are opened, so it was not opened.' }];
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

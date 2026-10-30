/* ddintake.js -- look at a file the broker adds to the Documents card and say what it is, without guessing.
 *
 * Content decides, never the file name. The readers that already exist decide first: a PDF goes to rrdoc.js
 * docKind (a rent roll or an OM); a workbook or CSV goes to the T-12 reader's month columns (t12.layoutOf) and the
 * rent roll's headings (rentrollui.headerAndRows), and when both accept it the answer is "ask". A file no reader
 * accepts is scored on its first pages' text (ddtypes.js classify); an unclear score asks. A type is set only by a reader
 * (or by the broker's tap); text that scores clearly is offered as "looks like", and the file name only
 * pre-selects a choice in the question. Nothing here stores anything or sends anything anywhere. */

import { checkUpload, LIMITS } from './filekind.js';
import { readGrids } from './sheetread.js';
import { docKind } from './rrdoc.js';
import { layoutOf, sheetChoices, pickSheet } from './t12.js';
import { headerAndRows } from './rentrollui.js';
import { classify, scoreText, suggestFromName } from './ddtypes.js';
import { kindOf } from './dd.js';
import { sha256Hex } from './fingerprint.js';

const accepts = (fn) => { try { return !!fn(); } catch { return false; } };
const cellText = (grids) => grids.flatMap((g) => g.rows.slice(0, 60).map((r) => r.cells.filter((c) => typeof c === 'string').join(' '))).join('\n').replace(/[ \t]+/g, ' ');

/** Types only a reader may set: the text can look like one, but then the broker is asked. */
const READER_TYPES = ['om', 'rentroll', 't12'];

/**
 * What a file is, from what was read of it. Input: { name, pages (a PDF's text per page), layouts, grids (a workbook's
 * or CSV's sheets: [{ sheet, rows: [{ r, cells }] }]) }. Output: { type, typeBy ('reader'|null), reader, looks (a type
 * the text clearly reads as, to be confirmed with a tap: never set by itself), ask (the types to offer, best first),
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
    // both readers accept it: nothing decides, so the broker is asked
    if (accepted && roll) return { ...out, ask: ['t12', 'rentroll'] };
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
  const up = await checkUpload(file, { getFflate });
  const kind = kindOf(up.kind, file.name);
  const info = { name: file.name, kind, size: file.size, sha256: /** @type {string | null} */ (null), pages: /** @type {number | null} */ (null), refuse: /** @type {string | null} */ (null), bytes: /** @type {Uint8Array | null} */ (null), verdict: identify({ name: file.name }) };
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

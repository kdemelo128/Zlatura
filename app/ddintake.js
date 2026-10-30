/* ddintake.js -- look at a file the broker adds to the Documents card and say what it is, without guessing.
 *
 * Content decides, never the file name. The readers that already exist decide first: a PDF goes to rrdoc.js
 * docKind (a rent roll or an OM); a workbook or CSV goes to the T-12 reader's month columns (t12.layoutOf) and the
 * rent roll's headings (rentrollui.headerAndRows), and when both accept it the answer is "ask". A file no reader
 * accepts is scored on its first pages' text (ddtypes.js classify); an unclear score asks. A type is `reader` only
 * when a reader accepted the file, `content` when the text scored clearly, and the file name only pre-selects
 * a choice in the question. Nothing here stores anything or sends anything anywhere. */

import { checkUpload, LIMITS } from './filekind.js';
import { readGrids } from './sheetread.js';
import { docKind } from './rrdoc.js';
import { layoutOf } from './t12.js';
import { headerAndRows } from './rentrollui.js';
import { classify, suggestFromName } from './ddtypes.js';
import { kindOf } from './dd.js';
import { sha256Hex } from './fingerprint.js';

const accepts = (fn) => { try { return !!fn(); } catch { return false; } };
const cellText = (grids) => grids.flatMap((g) => g.rows.slice(0, 60).map((r) => r.cells.filter((c) => typeof c === 'string').join(' '))).join('\n').replace(/[ \t]+/g, ' ');

/**
 * What a file is, from what was read of it. Input: { name, pages (a PDF's text per page), layouts, grids (a workbook's
 * or CSV's sheets: [{ sheet, rows: [{ r, cells }] }]) }. Output: { type, typeBy ('reader'|'content'|null), reader,
 * ask (the types to offer when type is null, the best three), suggest (from the name), scanned, text }.
 * @param {{ name?: string, pages?: string[] | null, layouts?: any, grids?: any[] | null }} f
 */
export function identify({ name = '', pages = null, layouts = null, grids = null }) {
  const out = { type: /** @type {string | null} */ (null), typeBy: /** @type {'reader'|'content'|null} */ (null), reader: /** @type {string | null} */ (null), ask: /** @type {string[]} */ ([]), suggest: suggestFromName(name), scanned: false, text: '' };
  if (pages) {
    out.text = pages.slice(0, 3).join('\n');
    const dk = docKind(pages, layouts);
    out.scanned = dk.kind === 'scanned';
    if (dk.kind === 'rentroll') return { ...out, type: 'rentroll', typeBy: 'reader', reader: 'rrpdf' };
    if (dk.kind === 'om') return { ...out, type: 'om', typeBy: 'reader', reader: 'om' };
  } else if (grids) {
    // the T-12 reader counts only with month columns: a lone Annual or Total heading is what a rent roll has too
    const t12 = grids.some((g) => accepts(() => layoutOf(g.rows, { sheet: g.sheet }).monthCols.length >= 3));
    const roll = grids.some((g) => accepts(() => headerAndRows(g.rows.map((r) => r.cells), g.sheet)));
    // both readers accept it: nothing decides, so the broker is asked
    if (t12 && roll) return { ...out, ask: ['t12', 'rentroll'] };
    if (t12) return { ...out, type: 't12', typeBy: 'reader', reader: 't12' };
    if (roll) return { ...out, type: 'rentroll', typeBy: 'reader', reader: 'rrsheet' };
    out.text = cellText(grids);
  }
  const c = classify(out.text, name);
  return { ...out, type: c.type, typeBy: c.type ? 'content' : null, ask: c.ask };
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

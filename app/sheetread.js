/* sheetread.js -- a spreadsheet's cells as plain values, read on the device:
 * the rent roll import and the T-12 import both start here. Pure apart from
 * readGrids(), which loads ExcelJS when a workbook needs it. */
import { readText } from './textfile.js';
import { checkUpload, hardenZip, MACRO_REFUSAL, MACRO_NOTE } from './filekind.js';

/** A date cell that holds no real date (a workbook can store a serial no calendar has), directly or as a formula's result. */
export function badDate(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime());
  return !!v && typeof v === 'object' && 'result' in v && badDate(v.result);
}
/** The one note an import shows when date cells could not be read: the count, and that they were left blank. */
export function badDateNote(n) {
  if (!n) return '';
  return n === 1 ? '1 date cell in this workbook could not be read and was left blank. Check the dates.'
    : `${n} date cells in this workbook could not be read and were left blank. Check the dates.`;
}

/**
 * A cell's value as text, a number or an ISO date (YYYY-MM-DD): formulas give their cached result.
 * A date cell that holds no real date is blank (null): never 0, never today, never the raw serial.
 */
export function cellValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if ('richText' in v) return v.richText.map((x) => x.text).join('');
    if ('text' in v) return v.text;
  }
  return v;
}

/** The rows of a CSV file (quoted fields, doubled quotes, CR LF or LF), every field as text; `delimiter` is the one character between fields. */
export function csvRows(text, { delimiter = ',' } = {}) {
  const rows = [];
  let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === delimiter) { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/**
 * Which character separates a text file's fields: { delimiter, skipFirst }.
 * A first line "sep=;" (Excel's own marker) says so and is dropped. Otherwise
 * each of tab, semicolon and comma splits the first 30 non-empty lines (quotes
 * respected); the most common field count m must be 2 or more, and the best
 * candidate is the one most lines have exactly m fields for (ties: the larger
 * m, then tab, semicolon, comma). Nothing fits: comma, as before.
 */
export function detectDelimiter(text) {
  const sep = /^sep=(.)[ \t]*\r?(\n|$)/i.exec(text);
  if (sep) return { delimiter: sep[1], skipFirst: true };
  const cut = text.length > 60000;
  let best = null;
  for (const delimiter of ['\t', ';', ',']) {
    let rows = csvRows(cut ? text.slice(0, 60000) : text, { delimiter }).filter((r) => r.some((v) => v.trim()));
    if (cut && rows.length > 1) rows = rows.slice(0, -1); // the last row was cut short
    rows = rows.slice(0, 30);
    const counts = new Map();
    for (const r of rows) counts.set(r.length, (counts.get(r.length) || 0) + 1);
    let m = 0;
    for (const [n, c] of counts) if (c > (counts.get(m) || 0) || (c === counts.get(m) && n > m)) m = n;
    if (m < 2) continue;
    const score = counts.get(m) / rows.length;
    if (!best || score > best.score || (score === best.score && m > best.m)) best = { delimiter, score, m };
  }
  return { delimiter: best ? best.delimiter : ',', skipFirst: false };
}

/**
 * Text pasted from a spreadsheet as rows [{ r (the 1-based line), cells }]:
 * split on tabs where any line has one (Excel and Numbers copy that way,
 * with empty cells trailing), otherwise on runs of two or more spaces.
 */
export function pastedRows(text) {
  const lines = String(text).split(/\r\n|\n|\r/);
  const tabbed = lines.some((l) => l.includes('\t'));
  const rows = [];
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    let cells = tabbed ? line.split('\t').map((c) => c.trim()) : line.trim().split(/ {2,}|\u00a0{2,}/).map((c) => c.trim());
    while (cells.length && cells[cells.length - 1] === '') cells.pop();
    rows.push({ r: i + 1, cells });
  });
  return rows;
}

/** Files a spreadsheet import refuses, with what to do instead; null when it can be read. */
export function unreadable(file, what) {
  if (/\.xls$/i.test(file.name)) return `That is an old .xls file. Open it in Excel and save it as .xlsx (or CSV), then import it.`;
  if (/\.xlsm$/i.test(file.name)) return `${MACRO_REFUSAL} (to import its ${what})`;
  return null;
}
export const isCsv = (file) => /\.csv$/i.test(file.name) || file.type === 'text/csv';

/** A workbook's bytes with sizes checked (filekind.js hardenZip), for ExcelJS; throws the reason when refused. */
export function guardedBuffer(buffer, fflate) {
  const safe = hardenZip(new Uint8Array(buffer), fflate);
  if (safe.refuse) throw new Error(safe.refuse);
  return safe.buffer;
}

/**
 * An ExcelJS workbook from an upload, after its size, kind and zip sizes were
 * checked (filekind.js): `up` is checkUpload's result, or it is run here.
 * Throws the reason when the file is refused or can't be opened.
 */
export async function loadXlsx(file, getXlsx, up = null, _opts = {}) { // _opts: kept for callers that passed allowMacros; a workbook with macros is always read for values now
  const { ExcelJS, fflate } = await getXlsx();
  const NOT_XLSX = 'That file could not be opened as an Excel workbook. It may be damaged, password protected or not really .xlsx.';
  up = up || await checkUpload(file, { getFflate: async () => fflate });
  if (up.refuse) throw new Error(up.refuse);
  if (up.kind !== 'xlsx') throw new Error(NOT_XLSX);
  // a workbook with macros is read for its cell values only: the macro part (xl/vbaProject.bin) is never opened, run or kept; ExcelJS has no VBA engine. Callers say so (MACRO_NOTE).
  const buffer = up.guarded ? up.buffer : guardedBuffer(up.buffer || await file.arrayBuffer(), fflate);
  if (fflate && lacksSharedStrings(buffer, fflate)) throw Object.assign(new Error('That workbook is missing the part that holds its text, so its words cannot be read. Open it in Excel and save a fresh copy.'), { step: 'strings', code: 'missing-shared-strings', causeClass: 'Error' });
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch (err) {
    // merged ranges that overlap (some exports write them) stop ExcelJS from loading a workbook whose cells are fine: try once more without the later range.
    const fixed = fflate ? repairParts(buffer, fflate) : null;
    if (fixed) {
      const again = new ExcelJS.Workbook();
      try { await again.xlsx.load(fixed.buffer); again.repairNote = `This workbook had damaged ${fixed.what} (ignored); the cell values are as saved.`; return again; } catch { /* the first failure is the one to report */ }
    }
    throw loadFailed('load', err, NOT_XLSX);
  }
  return wb;
}

/** True when a sheet holds shared-string cells (t="s") but the workbook has no xl/sharedStrings.xml: the numbers in those cells are positions in a table that is not there. */
function lacksSharedStrings(buffer, fflate) {
  try {
    let has = false;
    fflate.unzipSync(new Uint8Array(buffer), { filter: (f) => { if (/^xl\/sharedStrings\.xml$/i.test(f.name)) has = true; return false; } });
    if (has) return false;
    const sheets = fflate.unzipSync(new Uint8Array(buffer), { filter: (f) => /^xl\/worksheets\/[^/]+\.xml$/i.test(f.name) && f.originalSize <= 20e6 });
    return Object.values(sheets).some((raw) => /<c\s[^<>]{0,200}?\bt="s"/.test(new TextDecoder().decode(raw)));
  } catch { return false; }
}

/** An Error with what step failed and a fixed code for why (never the message, which may hold a name or a figure): for doc-local's reason codes and the broker's plain sentence. */
export function loadFailed(step, err, message) {
  const m = String((err && err.message) || '');
  const code = /merge/i.test(m) ? 'overlapping-merge' : /undefined|null|not a function|reading '/.test(m) ? 'missing-part-or-value' : /xml|parse|unexpected|entity|tag/i.test(m) ? 'xml' : /zip|central directory|end of data|signature|corrupt|invalid/i.test(m) ? 'zip' : /memory|array buffer|allocation/i.test(m) ? 'memory' : 'other';
  const c = err && err.constructor && err.constructor.name;
  // where in the app's or a vendored library's code it failed (a file and line only, never data): for doc-local --where
  const at = (/\/((?:app|vendor)\/[\w./-]{1,80}\.m?js):(\d{1,6})/.exec(String((err && err.stack) || '')) || []).slice(1, 3).join(':');
  return Object.assign(new Error(message || m), { step, code, at, causeClass: typeof c === 'string' && /^[A-Za-z]{0,24}Error$/.test(c) ? c : 'Error' });
}

/** A cell range "A1:B2" as [col0, row0, col1, row1], or null. */
function rectOf(ref) {
  const m = /^([A-Z]{1,3})(\d{1,7})(?::([A-Z]{1,3})(\d{1,7}))?$/.exec(ref);
  if (!m) return null;
  const col = (L) => [...L].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  return [col(m[1]), Number(m[2]), col(m[3] || m[1]), Number(m[4] || m[2])];
}

/**
 * The workbook's bytes with overlapping merged ranges (the later one dropped) removed from its
 * sheets, or null when there was nothing to change. Only sheet parts up to 20 MB are looked at, by search, not by a pattern
 * over the whole sheet; cell values are never touched.
 * @returns {{ buffer: ArrayBuffer, what: string } | null}
 */
export function repairParts(buffer, fflate) {
  let parts;
  try { parts = fflate.unzipSync(new Uint8Array(buffer), { filter: (f) => /^xl\/worksheets\/[^/]+\.xml$/i.test(f.name) && f.originalSize <= 20e6 }); } catch { return null; }
  let merges = 0;
  /** @type {Record<string, Uint8Array>} */ const changed = {};
  for (const [name, raw] of Object.entries(parts)) {
    let xml = new TextDecoder().decode(raw);
    let touched = false;
    const kept = [];
    xml = xml.replace(/<mergeCell\s[^<>]{0,100}?ref="([A-Z0-9:]{2,25})"[^<>]{0,100}\/>/g, (all, ref) => {
      const r = rectOf(ref);
      if (!r) return all;
      if (kept.some((k) => r[0] <= k[2] && k[0] <= r[2] && r[1] <= k[3] && k[1] <= r[3])) { merges += 1; touched = true; return ''; }
      kept.push(r);
      return all;
    });
    if (touched) changed[name] = new TextEncoder().encode(xml);
  }
  if (!merges) return null;
  const all = fflate.unzipSync(new Uint8Array(buffer));
  const out = fflate.zipSync({ ...all, ...changed }, { level: 0 });
  return { buffer: out.byteOffset === 0 && out.buffer.byteLength === out.byteLength ? out.buffer : out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength), what: 'merged-cell ranges' };
}

/**
 * Every visible sheet of a workbook (or the one table of a text file) as rows
 * of values: [{ sheet, hidden, rows: [{ r (1-based row number), cells: [] }] }],
 * empty rows left out, at most `maxRows` rows a sheet. What the file is comes
 * from its bytes (filekind.js checkUpload; pass its result as `upload`, or it
 * is run here), never from its name. A text file's grid also has `delimiter`,
 * `encoding` and `note` (textfile.js): the note says when it wasn't plain UTF-8.
 * `includeHidden` lists hidden sheets too, marked `hidden: true`. A workbook
 * with date cells that could not be read has `badDates` (the count) on each
 * sheet's grid and the same `note` on every grid (badDateNote of the total).
 * @param {any} file
 * @param {() => Promise<any>} getXlsx
 * @param {{ maxRows?: number, includeHidden?: boolean, upload?: any, getFflate?: () => Promise<any> }} [opts]
 */
export async function readGrids(file, getXlsx, { maxRows = 400, includeHidden = false, upload = null, getFflate } = {}) {
  const up = upload || await checkUpload(file, { getFflate });
  if (up.refuse) throw new Error(up.refuse);
  if (up.kind === 'text') {
    const { text, encoding, note } = await readText(file);
    const { delimiter, skipFirst } = detectDelimiter(text);
    const rows = csvRows(skipFirst ? text.replace(/^[^\r\n]*\r?\n?/, '') : text, { delimiter }).map((cells, i) => ({ r: i + 1 + (skipFirst ? 1 : 0), cells })).filter((x) => x.cells.some((v) => String(v).trim()));
    return [{ sheet: 'CSV', hidden: false, rows, delimiter, encoding, note, macros: false }];
  }
  const wb = await loadXlsx(file, getXlsx, up);
  const grids = gridsOf(wb, { maxRows, includeHidden });
  const note = [badDateNote(grids.reduce((n, g) => n + g.badDates, 0)), up.macros ? MACRO_NOTE : '', wb.repairNote || ''].filter(Boolean).join(' ');
  return grids.map((g) => ({ ...g, macros: !!up.macros, ...(note ? { note } : {}) }));
}

/** The same for an ExcelJS workbook already loaded (the tests read their invented files this way). */
export function gridsOf(wb, { maxRows = 400, includeHidden = false } = {}) {
  const out = [];
  wb.eachSheet((ws) => {
    const hidden = !!ws.state && ws.state !== 'visible';
    if (hidden && !includeHidden) return;
    const rows = [];
    let badDates = 0;
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (r > maxRows) return;
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell, c) => {
        // a merged cell's value sits in its first cell only
        const own = !(cell.isMerged && cell.master && cell.master !== cell);
        if (own && badDate(cell.value)) badDates++;
        cells[c - 1] = own ? cellValue(cell.value) : null;
      });
      rows.push({ r, cells });
    });
    out.push({ sheet: ws.name, hidden, rows, badDates });
  });
  return out;
}

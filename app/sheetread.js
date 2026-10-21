/* sheetread.js -- a spreadsheet's cells as plain values, read on the device:
 * the rent roll import and the T-12 import both start here. Pure apart from
 * readGrids(), which loads ExcelJS when a workbook needs it. */
import { readText } from './textfile.js';
import { checkUpload } from './filekind.js';

/** A cell's value as text, a number or an ISO date (YYYY-MM-DD): formulas give their cached result. */
export function cellValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
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
  if (/\.xlsm$/i.test(file.name)) return `That workbook has macros. Save a copy as .xlsx or CSV to import its ${what}.`;
  return null;
}
export const isCsv = (file) => /\.csv$/i.test(file.name) || file.type === 'text/csv';

/**
 * Every visible sheet of a workbook (or the one table of a text file) as rows
 * of values: [{ sheet, hidden, rows: [{ r (1-based row number), cells: [] }] }],
 * empty rows left out, at most `maxRows` rows a sheet. What the file is comes
 * from its bytes (filekind.js checkUpload; pass its result as `upload`, or it
 * is run here), never from its name. A text file's grid also has `delimiter`,
 * `encoding` and `note` (textfile.js): the note says when it wasn't plain UTF-8.
 * `includeHidden` lists hidden sheets too, marked `hidden: true`.
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
  const { ExcelJS } = await getXlsx();
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(up.buffer || await file.arrayBuffer()); } catch { throw new Error('That file could not be opened as an Excel workbook. It may be damaged, password protected or not really .xlsx.'); }
  return gridsOf(wb, { maxRows, includeHidden }).map((g) => ({ ...g, macros: !!up.macros }));
}

/** The same for an ExcelJS workbook already loaded (the tests read their invented files this way). */
export function gridsOf(wb, { maxRows = 400, includeHidden = false } = {}) {
  const out = [];
  wb.eachSheet((ws) => {
    const hidden = !!ws.state && ws.state !== 'visible';
    if (hidden && !includeHidden) return;
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (r > maxRows) return;
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell, c) => {
        // a merged cell's value sits in its first cell only
        cells[c - 1] = cell.isMerged && cell.master && cell.master !== cell ? null : cellValue(cell.value);
      });
      rows.push({ r, cells });
    });
    out.push({ sheet: ws.name, hidden, rows });
  });
  return out;
}

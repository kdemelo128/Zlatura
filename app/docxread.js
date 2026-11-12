/* docxread.js -- a Word (.docx) file's text and tables, handed to the intake like any other document.
 *
 * Only word/document.xml is unpacked (convert.js docxBodyXml: size-checked, text boxes counted once). Each table becomes its
 * own CSV file in memory, rows kept as rows, so the readers that already exist (the T-12 and rent roll sheet readers, the
 * same intake, the same Use and import) read it as they read a CSV; a table is never merged into the text. The text outside
 * the tables is read as one page of text for the classifier (a Word file has no page numbers: said so). Nothing is stored or
 * sent. Text runs are found by one pass of a pattern over `<` boundaries (no tag stripping by pattern), and entities are
 * decoded in one pass (convert.js entity), the way CodeQL alerts 24 and 25 asked. */
import { docxBodyXml, docxXmlText, entity } from './convert.js';
import { intake, identify } from './ddintake.js';

export const DOCX_LIMITS = { tables: 20, rows: 5000, cols: 60, cell: 500 };

/** A Word body without its tables (found by search, nesting counted), so the text outside them can be read on its own. */
export function withoutTables(xml) {
  let out = ''; let i = 0;
  for (;;) {
    const a = xml.indexOf('<w:tbl>', i);
    if (a < 0) return out + xml.slice(i);
    out += xml.slice(i, a);
    let depth = 0; let j = a;
    for (;;) {
      const o = xml.indexOf('<w:tbl>', j); const c = xml.indexOf('</w:tbl>', j);
      if (c < 0) return out; // an unclosed table: the rest is the table's
      if (o >= 0 && o < c) { depth += 1; j = o + 7; } else { depth -= 1; j = c + 8; if (depth === 0) break; }
    }
    i = j;
  }
}

/** The tables of a Word body as rows of cell text; a cell's paragraphs are joined by a space, a merged cell (gridSpan) is followed by empty cells. A table inside a cell is flattened into that cell. */
export function docxTables(xml) {
  /** @type {string[][][]} */ const tables = [];
  /** @type {string[][] | null} */ let rows = null; // the outer table being read
  /** @type {string[] | null} */ let row = null;
  /** @type {string[] | null} */ let cell = null;
  let span = 1;
  let depth = 0;
  for (const m of xml.matchAll(/<w:tbl>|<\/w:tbl>|<w:tr(?:[ \t\r\n][^<>]{0,300})?>|<\/w:tr>|<w:tc(?:[ \t\r\n][^<>]{0,300})?>|<\/w:tc>|<w:gridSpan[ \t\r\n][^<>]{0,100}?w:val="(\d{1,2})"[^<>]{0,50}>|<w:t(?:[ \t\r\n][^<>]{0,300})?>([^<]*)<\/w:t>|<w:tab\s{0,5}\/>|<\/w:p>/g)) {
    const t = m[0];
    if (t === '<w:tbl>') { depth += 1; if (depth === 1) { rows = []; } continue; }
    if (t === '</w:tbl>') { depth -= 1; if (depth === 0 && rows) { if (tables.length < DOCX_LIMITS.tables) tables.push(rows); rows = null; } continue; }
    if (!rows) continue;
    if (depth === 1 && t.startsWith('<w:tr')) { row = []; continue; }
    if (depth === 1 && t === '</w:tr>') { if (row) { if (cell) { row.push(cell.join(' ').replace(/\s+/g, ' ').trim()); cell = null; } if (rows.length < DOCX_LIMITS.rows) rows.push(row); } row = null; continue; }
    if (depth === 1 && t.startsWith('<w:tc')) { cell = []; span = 1; continue; }
    if (depth === 1 && t === '</w:tc>') { if (row && cell) { row.push(cell.join(' ').replace(/\s+/g, ' ').trim().slice(0, DOCX_LIMITS.cell)); for (let k = 1; k < span && row.length < DOCX_LIMITS.cols; k++) row.push(''); } cell = null; continue; }
    if (t.startsWith('<w:gridSpan')) { if (depth === 1) span = Math.max(1, Math.min(DOCX_LIMITS.cols, Number(m[1]))); continue; }
    if (!cell) continue;
    if (m[2] !== undefined) cell.push(entity(m[2]));
    else if (t.startsWith('<w:tab')) cell.push(' ');
    else if (t === '</w:p>') cell.push(' ');
  }
  return tables.map((r) => r.filter((x) => x.some((c) => c !== '')));
}

const csvCell = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** One table as CSV text (rows padded to the widest row). */
export const tableCsv = (rows) => { const w = Math.min(DOCX_LIMITS.cols, rows.reduce((n, r) => Math.max(n, r.length), 0)); return `${rows.map((r) => Array.from({ length: w }, (_, i) => csvCell(r[i] || '')).join(',')).join('\n')}\n`; };

function memberFile(name, bytes) {
  if (typeof File === 'function') return new File([bytes], name);
  const ab = () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return { name, size: bytes.length, type: '', slice: (a, b) => ({ arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset + a, bytes.byteOffset + Math.min(b, bytes.length)) }), arrayBuffer: async () => ab(), text: async () => new TextDecoder().decode(bytes) };
}

const NO_PAGES = 'A Word file has no page numbers; check every figure against the document.';

/**
 * Replace each looked-at Word file ({ file, info } from ddintake.lookAt, info.kind 'docx') with what it holds: one item per
 * table that has at least two rows and two columns (read as a CSV by intake(), so a rent roll or T-12 table is typed by the
 * same readers), or, with no such table, one item for the text. Other items pass through. `info.from` names the Word file
 * and `info.note` says where the figures came from. A Word file that can't be read stays one item with the reason in `note`.
 * @param {{ file: any, info: any }[]} seen @param {Parameters<typeof intake>[1]} deps
 */
export async function expandDocx(seen, deps) {
  const out = [];
  for (const s of seen) {
    if (!s.info || s.info.kind !== 'docx' || s.info.refuse) { out.push(s); continue; }
    let text = '';
    let tables = [];
    let why = '';
    try {
      const fflate = deps.getFflate ? await deps.getFflate() : null;
      if (!fflate) throw new Error(`${s.info.name} is a Word file, and this browser could not open it.`);
      const bytes = new Uint8Array(await s.file.arrayBuffer());
      const xml = docxBodyXml(bytes, fflate, s.info.name);
      const all = docxTables(xml);
      tables = all.filter((r) => r.length >= 2 && r.reduce((n, x) => Math.max(n, x.length), 0) >= 2);
      // the text a table-less file is classified by: all of it; with tables, only what lies outside them (a table's cells are read as rows, not twice as prose)
      try { text = docxXmlText(tables.length ? withoutTables(xml) : xml, s.info.name).replace(/\t/g, '   '); } catch { text = ''; }
    } catch (err) { why = String((err && /** @type {any} */ (err).message) || err); }
    if (why) { out.push({ file: s.file, info: { ...s.info, note: `${why} Save it as a PDF or a spreadsheet and add that.` } }); continue; }
    const base = s.info.name;
    const from = s.info.from ? `${s.info.from} › ${base}` : base;
    let n = 0;
    for (const rows of tables) {
      n += 1;
      const name = `${base.replace(/\.docx$/i, '')} table ${n}.csv`;
      const bytes = new TextEncoder().encode(tableCsv(rows));
      const part = memberFile(name, bytes);
      let one;
      try { one = await intake(/** @type {any} */ (part), deps); } catch { continue; }
      out.push({ file: part, info: { ...one, from, note: `Read from table ${n} of ${tables.length} in the Word document (${rows.length} rows). ${NO_PAGES}` } });
    }
    const verdict = { ...identify({ name: base, pages: text ? [text] : null }), scanned: false }; // a short Word text is short, not a scan
    if (!tables.length || verdict.type || verdict.looks) out.push({ file: s.file, info: { ...s.info, verdict, note: text ? `Text read from the Word document, outside its tables. ${NO_PAGES}` : `${base} has no text in its body (it may hold only pictures). Save it as a PDF and add that.` } });
  }
  return out;
}

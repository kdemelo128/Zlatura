/* convert.js -- Documents > Convert: what a file is, what it can honestly become, why it can't become anything
 * else, and the conversions that need no browser (text, tables, Word text). Pure apart from classify(), which
 * reads the file's first bytes (and the rest of a small file). The browser parts (canvas, pdf.js, the worker) are
 * in convertui.js. Design: docs/proposals/documents-hub.md section 2. Every pair not in MATRIX is refused in words;
 * nothing is converted by guessing, and no file is kept. */

import { sniff, zipKind, oleKind, LIMITS } from './filekind.js';
import { csvRows, detectDelimiter, cellValue, guardedBuffer } from './sheetread.js';
import { decodeText } from './textfile.js';
import { PRODUCT } from './brand.js';
import { cell as csvCell } from './exporters.js';

/** The most pixels one canvas holds on a phone (about 16.7 million): a bigger picture is refused, not shrunk. */
export const MAX_IMAGE_PIXELS = 16.7e6;
/** The most PDF pages turned into pictures at once (a picture of a page is large). */
export const IMAGE_PAGES = { desktop: 50, phone: 20 };
/** The most pages a text-to-PDF file may fill. */
export const TEXT_PDF_PAGES = 300;
/** The most cells a sheet may hold to be turned into a file (rows times columns). */
export const SHEET_CELLS = 2e6;
/** The most characters of Word text read from a document's body, as declared by the zip (bytes). */
export const DOCX_BYTES = 30e6;
/** The longest side of a page picture, in pixels, and the resolution it is drawn at. */
export const PAGE_PICTURE = { dpi: 150, longest: 4096 };

const mb = (n) => `${Math.round(n / 1e5) / 10} MB`;
const extOf = (name) => ((/\.([a-z0-9]+)$/i.exec(name || '') || [])[1] || '').toLowerCase();
/** A file name without its last extension. */
export const baseName = (name) => String(name || 'file').replace(/\.[a-z0-9]{1,8}$/i, '') || 'file';

/* ------------------------------------------------------------------ the matrix */

/** What each kind is called in a sentence. */
export const KIND_LABEL = {
  pdf: 'a PDF', jpeg: 'a JPEG photo', png: 'a PNG picture', webp: 'a WebP picture', heic: 'a HEIC photo',
  xlsx: 'an Excel workbook', docx: 'a Word document', csv: 'a CSV table', json: 'a JSON file', txt: 'a text file',
};

/**
 * Every conversion this card does. `from` lists the kinds it takes; `fidelity` says what is kept and what is lost,
 * and is shown before the person taps. `how` says where it runs: 'worker' (pdfpages-style Web Worker), 'canvas'
 * (the browser's own image drawing), 'pdfjs' (the vendored pdf.js) or 'main' (plain code).
 */
export const MATRIX = [
  { id: 'img-pdf', from: ['jpeg', 'png', 'webp'], to: 'PDF', ext: 'pdf', type: 'application/pdf', how: 'worker',
    fidelity: 'JPEG and PNG: lossless, the picture’s own bytes are embedded unchanged. WebP: redrawn pixel for pixel and embedded as PNG. A JPEG that its camera stored turned is redrawn upright the same way. The page is the size of the picture at 150 dpi.' },
  { id: 'png-jpeg', from: ['png'], to: 'JPEG', ext: 'jpg', type: 'image/jpeg', how: 'canvas', fidelity: 'Lossy: JPEG drops detail. Transparent areas turn white.' },
  { id: 'jpeg-png', from: ['jpeg'], to: 'PNG', ext: 'png', type: 'image/png', how: 'canvas', fidelity: 'Every pixel is kept exactly as the JPEG showed it. The file gets larger, and nothing the JPEG already lost comes back.' },
  { id: 'webp-png', from: ['webp'], to: 'PNG', ext: 'png', type: 'image/png', how: 'canvas', fidelity: 'Every pixel is kept exactly as the picture showed it, transparency included.' },
  { id: 'webp-jpeg', from: ['webp'], to: 'JPEG', ext: 'jpg', type: 'image/jpeg', how: 'canvas', fidelity: 'Lossy: JPEG drops detail. Transparent areas turn white.' },
  { id: 'heic-jpeg', from: ['heic'], to: 'JPEG', ext: 'jpg', type: 'image/jpeg', how: 'canvas', fidelity: 'Lossy: JPEG drops detail. Safari only: other browsers can’t open a HEIC photo and will say so.' },
  { id: 'pdf-txt', from: ['pdf'], to: 'text', ext: 'txt', type: 'text/plain', how: 'pdfjs', fidelity: 'Text only, page by page: no pictures, no layout beyond lines. A page with no text (a scan) is marked; scanned pages are not read by OCR here.' },
  { id: 'pdf-png', from: ['pdf'], to: 'PNG pictures', ext: 'png', type: 'image/png', how: 'pdfjs', fidelity: `A picture of each page at ${PAGE_PICTURE.dpi} dpi on white, longest side at most ${PAGE_PICTURE.longest} px. Text and shapes become pixels. One file, or a zip of pages.` },
  { id: 'pdf-jpeg', from: ['pdf'], to: 'JPEG pictures', ext: 'jpg', type: 'image/jpeg', how: 'pdfjs', fidelity: `As PNG pictures, but lossy. One file, or a zip of pages.` },
  { id: 'xlsx-csv', from: ['xlsx'], to: 'CSV', ext: 'csv', type: 'text/csv', how: 'main', fidelity: 'Values as stored, not as formatted: a percent comes out as 0.05 and a date as 2026-01-31. A formula gives its last calculated result. A blank stays blank. One file per visible sheet, in a zip if more than one.' },
  { id: 'csv-xlsx', from: ['csv'], to: 'Excel workbook', ext: 'xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', how: 'main', fidelity: 'Plain numbers become numbers. Everything else stays text exactly as written (dates, ids with leading zeros, amounts with $ or commas, percents). A blank stays blank.' },
  { id: 'csv-json', from: ['csv'], to: 'JSON', ext: 'json', type: 'application/json', how: 'main', fidelity: 'The first row names the fields. Every value stays text exactly as written; a blank is an empty string.' },
  { id: 'json-csv', from: ['json'], to: 'CSV', ext: 'csv', type: 'text/csv', how: 'main', fidelity: 'A list of flat records only. A record inside a record is refused, not flattened. Values are written as they are; null is blank.' },
  { id: 'txt-pdf', from: ['txt', 'csv', 'json'], to: 'PDF', ext: 'pdf', type: 'application/pdf', how: 'worker', fidelity: 'Plain text in a standard font. Lossless for Latin text; any other character (emoji, Chinese, Cyrillic) is refused and named.' },
  { id: 'docx-txt', from: ['docx'], to: 'text', ext: 'txt', type: 'text/plain', how: 'main', fidelity: 'The body text only: no pictures, headers, footers or footnotes, no formatting. Tracked changes show as if accepted.' },
];

/** What each kind can't become, and why, shown as plain lines for that file. */
const NO = {
  pdf: [['Word or Excel', 'a PDF holds pages, not a document’s structure, so there is nothing reliable to rebuild'], ['an Excel table', 'tables in a PDF are drawing, not cells; read them with the rent roll or T-12 import instead']],
  jpeg: [['text', 'reading words from a photo is not offered in this card'], ['WebP, HEIC or Word', 'not offered']],
  png: [['text', 'reading words from a picture is not offered in this card'], ['WebP, HEIC or Word', 'not offered']],
  webp: [['text', 'reading words from a picture is not offered in this card'], ['HEIC or Word', 'not offered']],
  heic: [['PDF or PNG', 'a HEIC photo becomes a JPEG only; save that JPEG, then convert it'], ['text', 'not offered']],
  xlsx: [['PDF', 'the layout, fonts and page breaks of a workbook can’t be kept without an Office program'], ['Word', 'not offered']],
  docx: [['PDF', 'the layout of a Word document can’t be kept without an Office program. In Word choose File → Export → PDF'], ['Excel', 'not offered']],
  csv: [['Word', 'not offered']],
  json: [['Excel', 'convert it to CSV first, then the CSV to Excel']],
  txt: [['Word or Excel', 'not offered']],
};

/** The conversions open to a file of this kind. */
export const targetsFor = (kind) => MATRIX.filter((m) => m.from.includes(kind));
/** The conversions a file of this kind can't do, as [to, reason] lines. */
export const notPossible = (kind) => NO[kind] || [];

/** What is never offered, whatever the file: shown under the card for anyone looking for it. */
export const NOT_OFFERED = [
  ['Word, PowerPoint or Excel to PDF', 'The layout is lost without an Office program. Export a PDF from that program.'],
  ['Old .doc, .xls and .ppt files', 'Open them in Word, Excel or PowerPoint and save a current copy (.docx, .xlsx) or export a PDF.'],
  ['Pages, Keynote and Numbers', 'Export a PDF from that program.'],
  ['TIFF images', 'Not opened by every browser. Save a PDF or JPEG from the scanner or viewer.'],
  ['DWG drawings, Outlook .msg, .rar and .7z', 'Not offered. Plot a PDF, save the attachments, or unpack the archive first.'],
  ['Password-protected files', 'Refused, never unlocked. Ask for an unlocked copy.'],
  ['HEIC outside Safari', 'Other browsers can’t open HEIC. Ask for a JPEG, or convert it in Safari.'],
];

/* ------------------------------------------------------------------ what a file is */

/** The extensions each kind usually has: a name that says otherwise is reported (the name never decides the kind). */
const EXTS = { pdf: ['pdf'], jpeg: ['jpg', 'jpeg', 'jpe'], png: ['png'], webp: ['webp'], heic: ['heic', 'heif'], xlsx: ['xlsx', 'xlsm'], docx: ['docx'], csv: ['csv', 'tsv', 'txt', 'tab'], json: ['json', 'txt'], txt: ['txt', 'text', 'log', 'md', 'csv', 'tsv', 'json'] };
const KNOWN_EXT = new Set(Object.values(EXTS).flat().concat(['doc', 'xls', 'ppt', 'pptx', 'pages', 'key', 'numbers', 'tif', 'tiff', 'dwg', 'msg', 'rar', '7z', 'zip']));

/** A note when the name says one thing and the bytes another, else ''. */
export function mismatch(name, kind) {
  const e = extOf(name);
  return e && KNOWN_EXT.has(e) && EXTS[kind] && !EXTS[kind].includes(e) ? `“${name}” is really ${KIND_LABEL[kind]}, whatever its name says.` : '';
}

/** Why a file of an unreadable kind can't be converted, naming it and saying what to do. `raw` is the kind and the name's extension decide the words only. */
function refusalFor(name, raw) {
  const n = name || 'That file';
  const e = extOf(name);
  const no = (what, step) => `${n} is ${what}. ${PRODUCT} can’t convert it on this device. ${step}`;
  if (raw === 'encrypted') return `${n} is password protected. Ask for an unlocked copy.`;
  if (raw === 'doc') return no('an old Word (.doc) file', 'In Word, choose Save As → Word Document (.docx), then add it here.');
  if (raw === 'xls') return no('an old Excel (.xls) file', 'In Excel, choose Save As → Excel Workbook (.xlsx), then add it here.');
  if (raw === 'ole') {
    if (e === 'ppt') return no('an old PowerPoint (.ppt) file', 'In PowerPoint, choose Export → PDF, then add the PDF here.');
    if (e === 'msg') return no('an Outlook message', 'Save its attachments, then add those here.');
    return no('an old Microsoft Office file', 'Open it in its program and save a current copy or export a PDF.');
  }
  if (raw === 'zip') {
    if (e === 'pptx') return no('a PowerPoint file', 'In PowerPoint, choose File → Export → PDF, then add the PDF here.');
    if (e === 'pages') return no('an Apple Pages file', 'In Pages, choose Export → PDF, then add the PDF here.');
    if (e === 'key') return no('an Apple Keynote file', 'In Keynote, choose Export → PDF, then add the PDF here.');
    if (e === 'numbers') return no('an Apple Numbers file', 'In Numbers, choose Export → Excel or PDF, then add that here.');
    return no('a zip archive', 'Unpack it, then add the files inside one at a time.');
  }
  if (raw === 'tiff') return no('a TIFF image', 'Save it as a PDF or JPEG from the program that made it, then add that here.');
  if (raw === 'dwg') return no('an AutoCAD drawing', 'Plot it to PDF, then add the PDF here.');
  if (raw === 'avif') return no('an AVIF picture', 'Save it as JPEG or PNG, then add that here.');
  if (e === 'rar' || e === '7z') return no(`a .${e} archive`, 'Unpack it, then add the files inside one at a time.');
  return `${n} is not a file type ${PRODUCT} can convert. PDFs, JPEG, PNG, WebP and HEIC photos, Excel workbooks, Word documents, CSV, JSON and text files can be.`;
}

/** A file's four-letter brand for the ISO media family (HEIC, AVIF, a video): bytes 8 to 11. */
const brand = (b) => String.fromCharCode(...b.subarray(8, 12));
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

/**
 * What an upload is: { kind, label, refuse, note, text?, delimiter?, macros }. `kind` is one of KIND_LABEL's keys, or
 * a raw kind ('encrypted', 'doc', 'xls', 'ole', 'zip', 'tiff', 'dwg', 'avif', 'unknown') with `refuse` saying why it
 * can't be converted. The size is compared with its kind's limit before the file is read whole. A text file is read
 * once, so `text` is its words (a CSV also has its `delimiter`).
 * @param {{ name: string, size: number, slice: (a: number, b: number) => { arrayBuffer: () => Promise<ArrayBuffer> }, arrayBuffer: () => Promise<ArrayBuffer> }} file
 * @param {{ getFflate?: () => Promise<any> }} [opts]
 * @returns {Promise<{ kind: string, label: string, refuse: string|null, note: string, text?: string, delimiter?: string, macros?: boolean, buffer?: ArrayBuffer, guarded?: boolean }>}
 */
export async function classify(file, { getFflate } = {}) {
  const name = file.name || 'That file';
  const out = (kind, refuse = null, more = {}) => ({ kind, label: KIND_LABEL[kind] || '', refuse, note: refuse ? '' : mismatch(file.name, kind), ...more });
  const bad = (raw) => out(raw, refusalFor(file.name, raw));
  const big = (kind, limit) => out(kind, `${name} is ${mb(file.size)}; ${KIND_LABEL[kind] || 'that kind of file'} is read up to ${limit / 1e6} MB.`);
  if (file.size === 0) return out('unknown', `${name} is empty: it probably did not finish downloading. Download it again.`);
  const head = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
  let s = sniff(head);
  if (s === 'unknown' || s === 'text') {
    if (head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a && head[3] === 0) return bad('tiff');
    if (head[0] === 0x4d && head[1] === 0x4d && head[2] === 0 && head[3] === 0x2a) return bad('tiff');
    if (head[0] === 0x41 && head[1] === 0x43 && head[2] === 0x31 && head[3] === 0x30) return bad('dwg');
  }
  if (s === 'heic') {
    const b = brand(head);
    if (b === 'avif' || b === 'avis') return bad('avif');
    if (!HEIC_BRANDS.has(b)) return bad('unknown');
  }
  if (s === 'pdf') return file.size > LIMITS.pdf ? big('pdf', LIMITS.pdf) : out('pdf');
  if (s === 'png' || s === 'jpeg' || s === 'webp' || s === 'heic') return file.size > LIMITS.image ? big(s, LIMITS.image) : out(s);
  if (s === 'unknown') return bad('unknown');
  if (s === 'text') {
    if (file.size > LIMITS.text) return big('txt', LIMITS.text);
    const { text, note: enc } = decodeText(new Uint8Array(await file.arrayBuffer()));
    return { ...out(textKind(text, file.name)), text, delimiter: delimiterOf(text), note: [mismatch(file.name, textKind(text, file.name)), enc].filter(Boolean).join(' ') };
  }
  // a container: a workbook, a Word file, an old Office file, a zip
  if (file.size > LIMITS.workbook) return out(s === 'zip' ? 'zip' : 'ole', `${name} is ${mb(file.size)}; a workbook or document is read up to ${LIMITS.workbook / 1e6} MB.`);
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (s === 'ole') return bad(oleKind(bytes));
  const fflate = getFflate ? await getFflate() : null;
  if (!fflate) return bad('zip');
  const z = zipKind(bytes, fflate.unzipSync);
  if (z.refuse) return out('zip', `${name}: ${z.refuse}`);
  if (z.kind === 'xlsx') {
    // the declared sizes passed; now the parts are inflated in small pieces and checked against them (ExcelJS would inflate whatever is there)
    try { return out('xlsx', null, { macros: z.macros, buffer: guardedBuffer(buffer, fflate), guarded: true }); } catch (e) { return out('zip', `${name}: ${e.message}`); }
  }
  if (z.kind === 'docx') return out('docx', null, { macros: z.macros, buffer });
  return bad('zip');
}

/** The delimiter of a table-like text, or '' if it isn't one. */
function delimiterOf(text) {
  const { delimiter, skipFirst } = detectDelimiter(text);
  const rows = csvRows(skipFirst ? text.replace(/^[^\r\n]*\r?\n?/, '') : text, { delimiter }).filter((r) => r.some((v) => v.trim())).slice(0, 30);
  return rows.length && rows.every((r) => r.length === rows[0].length) && rows[0].length >= 2 ? delimiter : '';
}
/** 'json' when the text parses as a list of records, 'csv' when it is a table, else 'txt'. What the words are decides, not the name. */
export function textKind(text, name = '') {
  if (/^\s*[[{]/.test(text)) { try { JSON.parse(text); return 'json'; } catch { /* not JSON */ } }
  return delimiterOf(text) || /\.(csv|tsv)$/i.test(name) ? 'csv' : 'txt';
}

/* ------------------------------------------------------------------ pictures */

/** The pixel size of a PNG, JPEG or WebP from its first bytes, or null. */
export function imageSize(b) {
  const u16 = (i) => (b[i] << 8) | b[i + 1];
  const u32 = (i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  if (b[0] === 0x89 && b[1] === 0x50 && b.length >= 24) return { w: u32(16), h: u32(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: u16(i + 7), h: u16(i + 5) };
      i += 2 + u16(i + 2);
    }
    return null;
  }
  if (b.length >= 12 && String.fromCharCode(...b.subarray(4, 8)) === 'ftyp') {
    // the largest image-extent box ('ispe': version and flags, then width and height) is the picture; smaller ones are thumbnails
    let best = null;
    for (let i = b.indexOf(0x69); i >= 0 && i + 16 <= b.length; i = b.indexOf(0x69, i + 1)) {
      if (b[i + 1] === 0x73 && b[i + 2] === 0x70 && b[i + 3] === 0x65) {
        const w = u32(i + 8); const h = u32(i + 12);
        if (!best || w * h > best.w * best.h) best = { w, h };
      }
    }
    return best;
  }
  if (String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && b.length >= 30) {
    const t = String.fromCharCode(...b.subarray(12, 16));
    const le = (i, n) => { let v = 0; for (let k = n - 1; k >= 0; k--) v = v * 256 + b[i + k]; return v; };
    if (t === 'VP8X') return { w: le(24, 3) + 1, h: le(27, 3) + 1 };
    if (t === 'VP8L') { const v = le(21, 4); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    if (t === 'VP8 ') return { w: le(26, 2) & 0x3fff, h: le(28, 2) & 0x3fff };
  }
  return null;
}

/** A JPEG's EXIF orientation, 1 to 8 (1 is upright), or 1 if it has none. */
export function exifOrientation(b) {
  if (!(b[0] === 0xff && b[1] === 0xd8)) return 1;
  for (let i = 2; i + 4 < b.length;) {
    if (b[i] !== 0xff) return 1;
    const m = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m === 0xe1 && String.fromCharCode(...b.subarray(i + 4, i + 8)) === 'Exif') {
      const t = i + 10; // the TIFF header
      const le = b[t] === 0x49;
      const u16 = (p) => (le ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1]);
      const u32 = (p) => (le ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0 : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0);
      const ifd = t + u32(t + 4);
      const n = u16(ifd);
      for (let k = 0; k < n && ifd + 2 + 12 * (k + 1) <= b.length; k++) {
        const e = ifd + 2 + 12 * k;
        if (u16(e) === 0x0112) { const v = u16(e + 8); return v >= 1 && v <= 8 ? v : 1; }
      }
      return 1;
    }
    if (m === 0xda || len < 2) return 1;
    i += 2 + len;
  }
  return 1;
}

/** The scale a PDF page is drawn at: 150 dpi, but never a side over 4096 px or a canvas over 16.7 million pixels. `w`, `h` are points (1/72 in). */
export function pageScale(w, h) {
  const dpi = PAGE_PICTURE.dpi / 72;
  return Math.min(dpi, PAGE_PICTURE.longest / Math.max(w, h), Math.sqrt(MAX_IMAGE_PIXELS / (w * h)));
}

/* ------------------------------------------------------------------ text, tables, Word */

/** Windows-1252 characters above 0x7F that a standard PDF font draws. */
const WIN_HIGH = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
/** The characters of `text` a standard PDF font can't draw, each once, as “c” (U+XXXX). Tab, line breaks and the Latin-1 range pass. */
export function unsupportedChars(text) {
  const seen = new Map();
  for (const c of text) {
    const n = c.codePointAt(0);
    const ok = n === 9 || n === 10 || n === 13 || (n >= 32 && n < 127) || (n >= 160 && n <= 255) || WIN_HIGH.includes(c);
    if (!ok) seen.set(c, (seen.get(c) || 0) + 1);
  }
  return [...seen.keys()].map((c) => `“${c.codePointAt(0) < 32 || c.codePointAt(0) === 127 ? '' : c}” (U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`);
}

/** The words that refuse a text-to-PDF with characters a standard font can't draw, or null. */
export function textPdfProblem(name, text) {
  const bad = unsupportedChars(text);
  if (!bad.length) return null;
  return `${name} has ${bad.length} kind${bad.length === 1 ? '' : 's'} of character a standard PDF font can’t draw: ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? ' and more' : ''}. Nothing was converted. Remove or replace them, or print the file to PDF from the program that made it.`;
}

const entity = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
  const x = e.toLowerCase();
  if (x[0] !== '#') return { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' }[x];
  const n = x[1] === 'x' ? parseInt(x.slice(2), 16) : Number(x.slice(1));
  return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
});

/** `xml` without its <mc:Fallback> blocks (a text box is stored twice, and the second copy is that block), found by search, not by pattern. */
function dropFallback(xml) {
  let out = ''; let i = 0;
  for (;;) {
    const a = xml.indexOf('<mc:Fallback>', i);
    if (a < 0) break;
    out += xml.slice(i, a);
    const b = xml.indexOf('</mc:Fallback>', a);
    if (b < 0) return out;
    i = b + 14;
  }
  return out + xml.slice(i);
}

/**
 * The body text of a Word (.docx) file: paragraphs on lines, table cells separated by tabs. Only word/document.xml is
 * unpacked, and only if its declared size is within DOCX_BYTES. Throws a sentence for a file that isn't readable.
 * @param {Uint8Array} bytes @param {any} fflate
 */
export function docxText(bytes, fflate, name = 'That document') {
  let tooBig = false;
  let files;
  try {
    files = fflate.unzipSync(bytes, { filter: (f) => { if (f.name !== 'word/document.xml') return false; if (f.originalSize > DOCX_BYTES) { tooBig = true; return false; } return true; } });
  } catch { throw new Error(`${name} could not be opened as a Word document: it may be damaged. Open it in Word and save a fresh copy.`); }
  if (tooBig) throw new Error(`${name} has a body of more than ${DOCX_BYTES / 1e6} MB of text, which is more than a document should hold. It was not opened.`);
  const raw = files['word/document.xml'];
  if (!raw) throw new Error(`${name} has no body text to read.`);
  // text boxes appear twice (the modern form and a fallback): the fallback is dropped so nothing is counted twice
  const xml = dropFallback(new TextDecoder().decode(raw));
  // one pass, no backtracking over the whole body: a text run is what lies between <w:t> and the next '<'
  const parts = [];
  for (const m of xml.matchAll(/<w:t(?:[ \t\r\n][^<>]{0,300})?>([^<]*)<\/w:t>|<w:tab\s{0,5}\/>|<w:br(?:\s[^<>]{0,200})?\/>|<w:cr\s{0,5}\/>|<\/w:p>|<\/w:tc>|<\/w:tr>/g)) {
    const t = m[0];
    const last = parts.length - 1;
    if (m[1] !== undefined) parts.push(entity(m[1]));
    else if (t.startsWith('<w:tab')) parts.push('\t');
    else if (t === '</w:p>') parts.push('\n');
    else if (t === '</w:tc>') { if (last >= 0 && parts[last] === '\n') parts[last] = '\t'; else parts.push('\t'); }
    else if (t === '</w:tr>') { if (last >= 0 && parts[last] === '\t') parts[last] = '\n'; }
    else parts.push('\n');
  }
  const out = parts.join('').replace(/\n{3,}/g, '\n\n').trim();
  if (!out) throw new Error(`${name} has no text in its body (it may hold only pictures).`);
  return out;
}

/** A plain decimal number: no sign but a minus, no leading zero, at most 15 digits (an id or a long number stays text). */
const PLAIN_NUMBER = /^-?(0|[1-9]\d{0,14})(\.\d{1,14})?$/;
const isPlainNumber = (s) => PLAIN_NUMBER.test(s) && !/^-0(\.0+)?$/.test(s) && s.replace(/\D/g, '').length <= 15;
/** 1.250 or 1.250.000: a thousands separator in one country and a decimal point in another. */
const DOTTED_THOUSANDS = /^-?[1-9]\d{0,2}(\.\d{3})+$/;
/** 1,25: a decimal comma. A comma and exactly three digits (1,234) is a thousands comma in one country and a decimal comma in another, so it proves nothing. */
const DECIMAL_COMMA = /^-?\d+,(\d{1,2}|\d{4,})$/;
/** Signs of a file that writes 1,234.50: a dot decimal that is not three digits (12.5, 0.5), or a thousands comma before a dot decimal. */
const US_NUMBER = /^-?(\d*\.(\d{1,2}|\d{4,})|\d{1,3}(,\d{3})+\.\d+)$/;

/** The rows of a CSV text, trailing empty rows dropped. */
function tableRows(text, delimiter) {
  const rows = csvRows(delimiter && /^sep=/i.test(text) ? text.replace(/^[^\r\n]*\r?\n?/, '') : text, { delimiter: delimiter || ',' });
  while (rows.length && rows.at(-1).every((v) => !String(v).trim())) rows.pop();
  return rows;
}

/**
 * Rows for a workbook from CSV text: `{ rows, numbers }` where a plain number is a number and every other field stays
 * text as written; a blank is null. Refuses a table of more than SHEET_CELLS cells.
 */
export function csvToCells(text, delimiter, name = 'That file') {
  const rows = tableRows(text, delimiter);
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  if (rows.length * width > SHEET_CELLS) throw new Error(`${name} has ${rows.length} rows of up to ${width} columns, more than ${SHEET_CELLS / 1e6} million cells. Split it first.`);
  // a file that writes decimals with a comma (or separates fields with ;) reads 1.250 as one thousand two hundred fifty: not decided here
  const cells = rows.flat();
  const euro = delimiter === ';' || cells.some((v) => DECIMAL_COMMA.test(v));
  const us = cells.some((v) => US_NUMBER.test(v));
  const hold = euro || !us; // 1.250 is a thousand two hundred fifty unless the file shows it writes dot decimals
  let numbers = 0; let ambiguous = 0;
  const out = rows.map((r) => r.map((v) => {
    if (v === '') return null;
    if (hold && DOTTED_THOUSANDS.test(v)) { ambiguous++; return v; }
    if (isPlainNumber(v)) { numbers++; return Number(v); }
    return v;
  }));
  return { rows: out, numbers, ambiguous };
}

/** A sheet name Excel accepts: no []:*?/\ , at most 31 characters, not empty. */
export function sheetName(s) {
  const clean = String(s || '').replace(/[\u0000-\u001f\u007f[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '').trim();
  let out = ''; // Excel counts UTF-16 units: cut between characters, never inside an emoji
  for (const ch of clean) { if (out.length + ch.length > 31) break; out += ch; }
  out = out.trim() || 'Sheet1';
  return /^history$/i.test(out) ? `${out} 1` : out;
}
/** `s` cut to at most `n` UTF-16 units (what file systems and kit.js's downloadName count), never inside an emoji. */
export function clip(s, n) {
  let out = '';
  for (const ch of String(s)) { if (out.length + ch.length > n) break; out += ch; }
  return out;
}

/**
 * Names for the entries of a zip: each made safe by `safe` (the file-name cleaner, which cuts a long name) and then
 * made different from the ones before it, so no entry overwrites another.
 * @param {string[]} names @param {(n: string) => string} safe
 */
export function zipKeys(names, safe) {
  const used = new Set();
  return names.map((n) => {
    let k = safe(n);
    const d = k.lastIndexOf('.');
    const ext = d > 0 && k.length - d <= 8 ? k.slice(d) : '';
    const stem = clip(ext ? k.slice(0, d) : k, 100);
    for (let i = 2; used.has(k.toLowerCase()); i++) {
      // a safety net: a cleaner that keeps cutting the number off must not loop for ever
      k = i > 1000 ? `file ${used.size + 1}${ext}` : safe(`${stem} (${i})${ext}`);
      if (i > 1000) break;
    }
    while (used.has(k.toLowerCase())) k = `file ${used.size + 1}${ext}`;
    used.add(k.toLowerCase());
    return k;
  });
}

/** A cell for a CSV: a text that a spreadsheet would run as a formula (starts with = + @ - tab or return) gets a leading quote, except a plain negative number like -1200. */
export const GUARDED = /^[=+@\t\r]|^-(?!\d+(\.\d+)?$)/;
export const safeCell = (v) => (typeof v === 'string' && /^-\d+(\.\d+)?$/.test(v) ? v : csvCell(v));

/** CSV text to a JSON list of records keyed by the first row. Throws a sentence naming the row or column that can't be kept. */
export function csvToJson(text, delimiter, name = 'That file') {
  const rows = tableRows(text, delimiter);
  if (rows.length < 2) throw new Error(`${name} needs a heading row and at least one row of values.`);
  const head = rows[0].map((h) => h.trim());
  const blank = head.findIndex((h) => !h);
  if (blank >= 0) throw new Error(`Column ${blank + 1} of ${name} has no heading, so its values would have no name. Add a heading.`);
  const dup = head.find((h, i) => head.indexOf(h) !== i);
  if (dup !== undefined) throw new Error(`${name} has the heading “${dup}” more than once, so one column would overwrite the other. Rename one.`);
  const recs = rows.slice(1).map((r, i) => {
    if (r.length > head.length && r.slice(head.length).some((v) => v !== '')) throw new Error(`Row ${i + 2} of ${name} has ${r.length} values but there are ${head.length} headings, so some would be lost. Check that row.`);
    return Object.fromEntries(head.map((h, k) => [h, r[k] ?? '']));
  });
  return JSON.stringify(recs, null, 2);
}

/** The first number in JSON text (outside its strings) that a double can't hold exactly: over 15 digits, or 1e21 and up; else ''. */
export function unsafeNumber(text) {
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === '-' || (c >= '0' && c <= '9')) {
      const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i, i + 400));
      if (!m) continue;
      const digits = m[0].replace(/[eE].*$/, '').replace(/\D/g, '').replace(/^0+/, '');
      if (Math.abs(Number(m[0])) >= 1e21 || (digits.length > 15 && String(Number(m[0])) !== m[0])) return m[0];
      i += m[0].length - 1;
    }
  }
  return '';
}

/** JSON text (a list of flat records) to CSV text with a byte-order mark. Throws a sentence naming what can't be kept. */
export function jsonToCsv(text, name = 'That file') {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error(`${name} is not valid JSON (${String(e.message).slice(0, 80)}).`); }
  if (!Array.isArray(data) || !data.length) throw new Error(`${name} must be a list of records, like [{"a": 1}, {"a": 2}]. Nothing was converted.`);
  const big = unsafeNumber(text);
  if (big) throw new Error(`${name} holds the number ${big.slice(0, 40)}, which a number can’t hold exactly (more than 15 digits, or 1e21 or more), so it would be rounded. Write it as text in quotes. Nothing was converted.`);
  const cols = [];
  data.forEach((rec, i) => {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) throw new Error(`Item ${i + 1} of ${name} is not a record (an object with named values).`);
    for (const [k, v] of Object.entries(rec)) {
      if (v !== null && typeof v === 'object') throw new Error(`Item ${i + 1}, “${k}” of ${name} holds a list or a record inside the record. It is not flattened: nothing was converted.`);
      if (!cols.includes(k)) cols.push(k);
    }
  });
  const lines = [cols.map(csvCell).join(',')];
  for (const rec of data) lines.push(cols.map((k) => { const v = Object.hasOwn(rec, k) ? rec[k] : null; return v === null ? '' : safeCell(typeof v === 'boolean' ? String(v) : v); }).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

/* ------------------------------------------------------------------ workbooks */

/** A cell's value as the text a CSV holds: a date as ISO, a boolean as TRUE/FALSE, an error as its code, a formula as its last result. */
function csvValue(v) {
  if (v instanceof Date) { const s = v.toISOString(); return s.endsWith('T00:00:00.000Z') ? s.slice(0, 10) : s.slice(0, 19).replace('T', ' '); }
  if (v && typeof v === 'object' && 'error' in v) return String(v.error);
  const c = cellValue(v);
  if (c instanceof Date) return csvValue(c);
  if (c && typeof c === 'object') return c.error ? String(c.error) : null;
  return typeof c === 'boolean' ? (c ? 'TRUE' : 'FALSE') : c;
}

/**
 * Every visible sheet of an ExcelJS workbook as CSV text (with a byte-order mark and CRLF, so Excel reads accents):
 * `{ sheets: [{ name, csv }], notes: [] }`. Blank cells stay blank; a formula gives its last result (a formula with
 * none is blank and counted); merged cells hold the value in the first cell only. Throws for a sheet over SHEET_CELLS.
 * @param {any} wb
 */
export function workbookToCsvs(wb) {
  const sheets = []; const hidden = [];
  let formulas = 0; let noResult = 0; let merged = 0; let guarded = 0;
  wb.eachSheet((ws) => {
    if (ws.state && ws.state !== 'visible') { hidden.push(ws.name); return; }
    if (ws.rowCount * ws.columnCount > SHEET_CELLS) throw new Error(`The sheet “${ws.name}” has ${ws.rowCount} rows by ${ws.columnCount} columns, more than ${SHEET_CELLS / 1e6} million cells. It was not converted.`);
    const grid = [];
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      const line = [];
      row.eachCell({ includeEmpty: true }, (cellObj, c) => {
        if (cellObj.isMerged && cellObj.master && cellObj.master !== cellObj) { merged++; line[c - 1] = null; return; }
        const raw = cellObj.value;
        if (raw && typeof raw === 'object' && ('formula' in raw || 'sharedFormula' in raw)) { formulas++; if (raw.result === undefined || raw.result === null) noResult++; }
        const v = csvValue(raw);
        if (typeof v === 'string' && GUARDED.test(v)) guarded++;
        line[c - 1] = v;
      });
      grid[r - 1] = line;
    });
    for (let r = 0; r < grid.length; r++) grid[r] ||= [];
    while (grid.length && grid.at(-1).every((v) => v === null || v === undefined || v === '')) grid.pop();
    const width = grid.reduce((m, l) => { let n = l.length; while (n && (l[n - 1] === null || l[n - 1] === undefined || l[n - 1] === '')) n--; return Math.max(m, n); }, 0);
    const lines = grid.map((l) => Array.from({ length: width }, (_, i) => (l[i] === null || l[i] === undefined ? '' : safeCell(l[i]))).join(','));
    sheets.push({ name: ws.name, csv: `﻿${lines.join('\r\n')}\r\n` });
  });
  const notes = [];
  if (formulas) notes.push(`${formulas} formula${formulas === 1 ? '' : 's'} gave the result Excel last calculated${noResult ? `; ${noResult} had none saved and are blank` : ''}.`);
  if (merged) notes.push(`${merged} merged cell${merged === 1 ? '' : 's'}: the value is in the first cell only.`);
  if (guarded) notes.push(`${guarded} text cell${guarded === 1 ? '' : 's'} starting with = + @ tab or return, or with - (unless a plain number like -1200), got a leading ' so a spreadsheet won’t run ${guarded === 1 ? 'it' : 'them'}.`);
  if (hidden.length) notes.push(`Hidden sheet${hidden.length === 1 ? '' : 's'} not converted: ${hidden.join(', ')}.`);
  return { sheets, notes };
}

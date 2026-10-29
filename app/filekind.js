/* filekind.js -- what an uploaded file really is, from its bytes and size,
 * before anything reads it whole. The file's name never decides the kind (a
 * PDF named .xlsx is a PDF); it only words the message. Pure apart from
 * checkUpload(), which reads the file's first 8 KB and, for a workbook, the
 * rest. Design: docs/proposals/t12-formats.md. */

/** The most bytes each kind is read at: a bigger file is refused before it is read. */
export const LIMITS = { workbook: 25e6, text: 10e6, pdf: 50e6, image: 20e6, zipTotal: 100e6, zipRatio: 200, zipEntries: 10000 };

const startsWith = (b, sig, at = 0) => sig.every((x, i) => b[at + i] === x);
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

/** The kind of a file from its first bytes (at most 8 KB are looked at): zip, ole, pdf, png, jpeg, webp, heic, text or unknown. */
export function sniff(head) {
  const b = head.length > 8192 ? head.subarray(0, 8192) : head;
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06])) return 'zip';
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole';
  const pdf = ascii('%PDF-');
  for (let i = 0, end = Math.min(1024, b.length) - pdf.length; i <= end; i++) if (startsWith(b, pdf, i)) return 'pdf';
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8)) return 'webp';
  if (startsWith(b, ascii('ftyp'), 4)) return 'heic';
  if (startsWith(b, [0xff, 0xfe]) || startsWith(b, [0xfe, 0xff])) return 'text'; // a UTF-16 byte-order mark
  return b.includes(0) ? 'unknown' : 'text';
}

/**
 * What a zip container holds: { kind: 'xlsx'|'docx'|'zip', macros, refuse }.
 * Only the entries' names and declared sizes are listed (the filter never
 * lets an entry be unpacked). A zip declaring more than zipTotal bytes,
 * an entry more than zipRatio times its stored size, or more than zipEntries
 * entries is refused. `unzipSync` is fflate's.
 */
export function zipKind(bytes, unzipSync) {
  const entries = [];
  try { unzipSync(bytes, { filter: (f) => { entries.push(f); return false; } }); } catch { return { kind: 'zip', macros: false, refuse: null }; }
  if (entries.length > LIMITS.zipEntries) return { kind: 'zip', macros: false, refuse: `That file holds ${entries.length} parts, more than a spreadsheet does (${LIMITS.zipEntries}). It was not opened.` };
  const total = entries.reduce((s, f) => s + f.originalSize, 0);
  if (total > LIMITS.zipTotal) return { kind: 'zip', macros: false, refuse: `That file would unpack to ${Math.round(total / 1e6)} MB (the most is ${LIMITS.zipTotal / 1e6} MB). It was not opened.` };
  if (entries.some((f) => f.originalSize > LIMITS.zipRatio * Math.max(f.size, 1))) return { kind: 'zip', macros: false, refuse: 'That file packs a part far tighter than a spreadsheet does, which is how a decompression bomb looks. It was not opened.' };
  const names = new Set(entries.map((f) => f.name));
  if (names.has('xl/workbook.xml')) return { kind: 'xlsx', macros: names.has('xl/vbaProject.bin'), refuse: null };
  if (names.has('word/document.xml')) return { kind: 'docx', macros: false, refuse: null };
  return { kind: 'zip', macros: false, refuse: null };
}

const MISMATCH = 'That file’s parts are not the size the file says they are, which is how a decompression bomb looks. It was not opened.';
const BAD_ZIP = 'That file could not be opened as an Excel workbook. It may be damaged, password protected or not really .xlsx.';

/**
 * Unpack a zip without ever trusting what it declares about itself: the
 * central directory is read by hand, the caps are checked on the declared
 * sizes (entries, total, ratio), and each entry is then inflated in small
 * pieces into a buffer of exactly its declared size, stopping the moment it
 * would overrun (so a part declared at 1,000 bytes that inflates to 300 MB
 * costs one piece, not 300 MB) and refused if it ends short. Returns
 * { name: bytes } (a folder is an empty entry) or throws an Error whose message
 * is the reason. `fflate` supplies Inflate.
 * @param {Uint8Array} bytes
 * @param {any} fflate
 * @returns {Record<string, Uint8Array>}
 */
export function safeUnzip(bytes, fflate) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error(BAD_ZIP);
  const count = dv.getUint16(eocd + 10, true);
  let at = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || at === 0xffffffff) throw new Error(BAD_ZIP); // zip64: far beyond a spreadsheet
  if (count > LIMITS.zipEntries) throw new Error(`That file holds ${count} parts, more than a spreadsheet does (${LIMITS.zipEntries}). It was not opened.`);
  const list = [];
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || dv.getUint32(at, true) !== 0x02014b50) throw new Error(BAD_ZIP);
    const flags = dv.getUint16(at + 8, true);
    const method = dv.getUint16(at + 10, true);
    const size = dv.getUint32(at + 20, true);
    const original = dv.getUint32(at + 24, true);
    const nameLen = dv.getUint16(at + 28, true);
    const skip = nameLen + dv.getUint16(at + 30, true) + dv.getUint16(at + 32, true);
    const local = dv.getUint32(at + 42, true);
    if (at + 46 + nameLen > bytes.length || local + 30 > bytes.length) throw new Error(BAD_ZIP);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    if ((flags & 1) || (method !== 0 && method !== 8) || original === 0xffffffff || size === 0xffffffff) throw new Error(BAD_ZIP);
    total += original;
    if (total > LIMITS.zipTotal) throw new Error(`That file would unpack to over ${LIMITS.zipTotal / 1e6} MB (the most is ${LIMITS.zipTotal / 1e6} MB). It was not opened.`);
    if (original > LIMITS.zipRatio * Math.max(size, 1)) throw new Error('That file packs a part far tighter than a spreadsheet does, which is how a decompression bomb looks. It was not opened.');
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    if (start + size > bytes.length) throw new Error(BAD_ZIP);
    list.push({ name, method, size, original, start });
    at += 46 + skip;
  }
  const files = /** @type {Record<string, Uint8Array>} */ ({});
  for (const e of list) {
    const data = bytes.subarray(e.start, e.start + e.size);
    if (e.method === 0) {
      if (e.size !== e.original) throw new Error(MISMATCH);
      files[e.name] = data.slice();
      continue;
    }
    const out = new Uint8Array(e.original);
    let pos = 0;
    const inf = new fflate.Inflate((chunk) => { if (pos + chunk.length > out.length) throw new Error(MISMATCH); out.set(chunk, pos); pos += chunk.length; });
    try {
      for (let i = 0; i < data.length || i === 0; i += 16384) inf.push(data.subarray(i, i + 16384), i + 16384 >= data.length);
    } catch (err) { throw err.message === MISMATCH ? err : new Error(BAD_ZIP); }
    if (pos !== e.original) throw new Error(MISMATCH);
    files[e.name] = out;
  }
  return files;
}

/**
 * A workbook's bytes made safe for ExcelJS, whose bundled JSZip inflates
 * whatever is really in the file and ignores the sizes it declares: the zip
 * is unpacked with safeUnzip and packed again with no compression, so
 * ExcelJS reads the same parts from a file whose sizes are true.
 * @returns {{ buffer: ArrayBuffer|null, refuse: string|null }}
 */
export function hardenZip(bytes, fflate) {
  try {
    const out = fflate.zipSync(Object.fromEntries(Object.entries(safeUnzip(bytes, fflate)).map(([k, v]) => [k, [v, { level: 0 }]])));
    return { buffer: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength), refuse: null };
  } catch (e) { return { buffer: null, refuse: e.message || BAD_ZIP }; }
}

/** Does `b` hold the text `s` written as UTF-16LE (how an OLE directory names its streams)? */
function hasUtf16(b, s) {
  const pat = [];
  for (const c of s) pat.push(c.charCodeAt(0), 0);
  outer: for (let i = b.indexOf(pat[0]); i >= 0 && i + pat.length <= b.length; i = b.indexOf(pat[0], i + 1)) {
    for (let k = 1; k < pat.length; k++) if (b[i + k] !== pat[k]) continue outer;
    return true;
  }
  return false;
}

/** What an old Office (OLE) container is: 'encrypted' (a password-protected .xlsx), 'xls', 'doc' or 'ole'. */
export function oleKind(bytes) {
  if (hasUtf16(bytes, 'EncryptedPackage')) return 'encrypted';
  if (hasUtf16(bytes, 'Workbook') || hasUtf16(bytes, 'Book')) return 'xls';
  if (hasUtf16(bytes, 'WordDocument')) return 'doc';
  return 'ole';
}

const LATER = 'arrives in a later version; copy the table and use Paste a statement';
const extOf = (name) => ((/\.([a-z0-9]+)$/i.exec(name || '') || [])[1] || '').toLowerCase();
/** Words a mismatch between what the name says and what the file is. */
const named = (file, is, ok) => { const e = extOf(file.name); return e && !ok.includes(e) ? `“${file.name}” is really ${is}, whatever its name says. ` : ''; };

/**
 * Look at an upload: { kind, macros, refuse, buffer }. `kind` is 'xlsx', 'xls',
 * 'doc', 'docx', 'encrypted', 'pdf', 'image', 'text', 'zip' or 'unknown'; `refuse`
 * is the reason it can't be read (null when it can); `buffer` holds a workbook's
 * bytes, already read. The first 8 KB are read; the file's size is compared with
 * its kind's limit before anything more is read.
 * @param {{ name: string, size: number, slice: (a: number, b: number) => { arrayBuffer: () => Promise<ArrayBuffer> }, arrayBuffer: () => Promise<ArrayBuffer> }} file
 * @param {{ getFflate?: () => Promise<any> }} [opts]
 * @returns {Promise<{ kind: string, macros: boolean, refuse: string|null, buffer?: ArrayBuffer, guarded?: boolean }>}
 */
export async function checkUpload(file, { getFflate } = {}) {
  const no = (kind, refuse) => ({ kind, macros: false, refuse });
  const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
  const sniffed = sniff(head);
  const big = (limit, what) => `That file is ${Math.round(file.size / 1e5) / 10} MB; ${what} is read up to ${limit / 1e6} MB.`;
  if (sniffed === 'pdf') return file.size > LIMITS.pdf ? no('pdf', big(LIMITS.pdf, 'a PDF')) : no('pdf', `${named(file, 'a PDF', ['pdf'])}A PDF ${LATER}.`);
  if (['png', 'jpeg', 'webp', 'heic'].includes(sniffed)) return file.size > LIMITS.image ? no('image', big(LIMITS.image, 'a photo')) : no('image', `${named(file, 'a photo', ['png', 'jpg', 'jpeg', 'webp', 'heic'])}Reading photos arrives in a later version; copy the table and use Paste a statement.`);
  if (sniffed === 'unknown') return no('unknown', `${file.name || 'That file'} is not a spreadsheet or a text file this app can read. Save the statement as .xlsx or CSV.`);
  if (sniffed === 'text') return file.size > LIMITS.text ? no('text', big(LIMITS.text, 'a text file')) : { kind: 'text', macros: false, refuse: null };
  // a container: a workbook, a Word file, an old .xls
  if (file.size > LIMITS.workbook) return no(sniffed === 'zip' ? 'zip' : 'ole', big(LIMITS.workbook, 'a workbook'));
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (sniffed === 'ole') {
    const k = oleKind(bytes);
    if (k === 'encrypted') return no(k, 'That workbook is password protected. Remove the password in Excel, save it, then import it.');
    if (k === 'xls') return no(k, 'That is an old .xls file. Open it in Excel and save it as .xlsx (or CSV), then import it.');
    if (k === 'doc') return no(k, 'That is an old Word file. Open it in Word and save it as .docx; a Word file arrives in a later version, so for now copy the table and use Paste a statement.');
    return no(k, 'That file is not a spreadsheet this app can read. Save the statement as .xlsx or CSV.');
  }
  const fflate = getFflate ? await getFflate() : null;
  const z = fflate ? zipKind(bytes, fflate.unzipSync) : { kind: 'xlsx', macros: false, refuse: null };
  if (z.refuse) return no('zip', z.refuse);
  if (z.kind === 'docx') return no('docx', `${named(file, 'a Word document', ['docx'])}A Word document ${LATER}.`);
  if (z.kind === 'zip') return no('zip', 'That is a zip file, not a spreadsheet. Save the statement as .xlsx or CSV.');
  if (!fflate) return { kind: 'xlsx', macros: z.macros, refuse: null, buffer };
  // ExcelJS ignores a zip's declared sizes, so it gets a copy whose sizes were checked (hardenZip)
  const safe = hardenZip(bytes, fflate);
  if (safe.refuse) return no('zip', safe.refuse);
  return { kind: 'xlsx', macros: z.macros, refuse: null, buffer: safe.buffer, guarded: true };
}

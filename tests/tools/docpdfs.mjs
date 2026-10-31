/* docpdfs.mjs -- invented PDFs for the Documents tests, written by hand (no library, no real file):
 * a page says its own label ("A1", "B2") so a test can read the order back; one file carries every
 * kind of active content a hostile PDF can; one is cut short; one is marked encrypted. */

const enc = new TextEncoder();

/** Assemble numbered objects (strings, or { dict, stream }) into a PDF, with a correct xref table. */
function assemble(objs, trailer = '') {
  let out = '%PDF-1.7\n';
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    const body = typeof o === 'string' ? o : `${o.dict.replace(/>>$/, '')} /Length ${o.stream.length} >>\nstream\n${o.stream}\nendstream`;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R ${trailer}>>\nstartxref\n${xref}\n%%EOF\n`;
  return enc.encode(out);
}

const content = (text) => ({ dict: '<< >>', stream: `BT /F1 36 Tf 72 700 Td (${text}) Tj ET` });

/** `n` pages labelled `${label}1` … `${label}${n}`. `rotate` is an existing /Rotate on page 1 (a scan that is on its side);
 *  `inherit` puts the page size, resources and a /Rotate of 90 on the page tree instead of on each page, as many writers do;
 *  `declared` is a page count the tree states that its pages do not add up to. */
export function plainPdf(label, n, { rotate = 0, inherit = false, declared = n } = {}) {
  const shared = '/MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >>';
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Count ${declared} /Kids [${Array.from({ length: n }, (_, i) => `${4 + 2 * i} 0 R`).join(' ')}]${inherit ? ` ${shared} /Rotate 90` : ''} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for (let i = 0; i < n; i++) {
    objs.push(`<< /Type /Page /Parent 2 0 R${inherit ? '' : ` ${shared}`} /Contents ${5 + 2 * i} 0 R${i === 0 && rotate ? ` /Rotate ${rotate}` : ''} >>`);
    objs.push(content(`${label}${i + 1}`));
  }
  return assemble(objs);
}

/** Two pages ("H1", "H2"). Page 1 carries a page action, a JavaScript link, a program-launching link and a
 *  file attachment; the document opens with a script and holds an embedded file. */
export function hostilePdf() {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS (app.alert\\(1\\)) >> /Names << /EmbeddedFiles << /Names [(x.txt) 9 0 R] >> >> >>',
    '<< /Type /Pages /Count 2 /Kids [4 0 R 6 0 R] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R /AA << /O << /S /JavaScript /JS (app.alert\\(2\\)) >> >> /Annots [7 0 R 8 0 R 10 0 R] >>',
    content('H1'),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 12 0 R >>',
    '<< /Type /Annot /Subtype /Link /Rect [0 0 50 50] /Border [0 0 0] /A << /S /JavaScript /JS (app.alert\\(3\\)) >> >>',
    '<< /Type /Annot /Subtype /Link /Rect [60 0 110 50] /Border [0 0 0] /A << /S /Launch /F (calc.exe) >> >>',
    '<< /Type /Filespec /F (x.txt) /EF << /F 11 0 R >> >>',
    '<< /Type /Annot /Subtype /FileAttachment /Rect [120 0 150 30] /FS 9 0 R /Contents (note) >>',
    { dict: '<< /Type /EmbeddedFile >>', stream: 'attached text' },
    content('H2'),
  ];
  return assemble(objs);
}

/** A PDF cut off partway through: the end of the file, the xref table, is missing. */
export function damagedPdf() {
  const b = plainPdf('D', 2);
  return b.slice(0, Math.floor(b.length * 0.6));
}

/** A PDF whose trailer names a password-protection dictionary (so a reader asks for a password). */
export function encryptedPdf() {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
    `<< /Filter /Standard /V 1 /R 2 /P -4 /O <${'00'.repeat(32)}> /U <${'11'.repeat(32)}> >>`,
  ];
  return assemble(objs, '/Encrypt 4 0 R /ID [<00112233445566778899aabbccddeeff> <00112233445566778899aabbccddeeff>] ');
}

const page = (contents, extra = '') => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contents} 0 R ${extra} >>`;
const frame = (...rest) => ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Count ${rest.pages ?? 1} /Kids [4 0 R] >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];

/** A contents page ("TOC") whose links, a go-to action and a form field's widgets all lead to page 2, which says SECRET2,
 *  and whose page-2 widget carries a script and a launch action. Extracting page 1 must leave page 2 behind entirely. */
export function tocPdf() {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 2 /Kids [4 0 R 6 0 R] >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    page(5, '/Annots [7 0 R 8 0 R 9 0 R]'), content('TOC'),
    page(10, '/Annots [11 0 R]'),
    '<< /Type /Annot /Subtype /Link /Rect [0 0 50 50] /Border [0 0 0] /Dest [6 0 R /Fit] /P 6 0 R >>',
    '<< /Type /Annot /Subtype /Link /Rect [60 0 110 50] /Border [0 0 0] /A << /S /GoTo /D [6 0 R /Fit] >> >>',
    '<< /Type /Annot /Subtype /Widget /FT /Btn /Rect [0 60 20 80] /Parent 12 0 R /P 4 0 R >>',
    content('SECRET2'),
    '<< /Type /Annot /Subtype /Widget /FT /Btn /Rect [0 60 20 80] /Parent 12 0 R /P 6 0 R /A << /S /JavaScript /JS (app.alert\\(9\\)) >> /AA << /E << /S /Launch /F (calc.exe) >> >> >>',
    '<< /FT /Btn /T (f) /Kids [9 0 R 11 0 R] >>',
  ];
  return assemble(objs);
}

/** One page whose link action runs `n` steps (harmless web addresses chained with /Next) and then a script. */
export function chainPdf(n) {
  const objs = [...frame(), page(5, '/Annots [6 0 R]'), content('C1'), '<< /Type /Annot /Subtype /Link /Rect [0 0 50 50] /Border [0 0 0] /A 7 0 R >>'];
  for (let k = 0; k < n; k++) {
    const last = k === n - 1;
    objs.push(last ? '<< /S /JavaScript /JS (app.alert\\(5\\)) >>' : `<< /S /URI /URI (http://example.com/${k}) /Next ${8 + k} 0 R >>`);
  }
  return assemble(objs);
}

/** A complete file whose last page names a content object that is not there (what a file cut between objects, then closed up, looks like). */
export function lostContentPdf() {
  return assemble([...frame(), page(99), ]);
}

/** A file cut off just before the last page's content object. */
export function cutBeforeContentPdf() {
  const b = plainPdf('K', 2);
  const text = new TextDecoder().decode(b);
  return b.slice(0, text.lastIndexOf('7 0 obj'));
}

/** Page 1 holds a reference to page 2 in a key no cleaning knows ("/Foo"): the last line of defence has to catch it. */
export function strayPdf() {
  return assemble([...frame({ pages: 2 }).map((x, i) => (i === 1 ? '<< /Type /Pages /Count 2 /Kids [4 0 R 6 0 R] >>' : x)), page(5, '/Foo 6 0 R'), content('P1'), page(7), content('SECRET4')]);
}

export const buildPdf = assemble;
export const streamObj = (dict, stream) => ({ dict, stream });
export const pageObj = page;
export const textStream = content;
const FONT = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

/** Two pages, each drawing its own picture ("SCANPAGEONE", "SCANPAGETWO" are the picture bytes), where the pictures sit in ONE
 *  resources dictionary the pages share: `inherit` (on the page tree), `shared` (one dictionary both pages point to), or `form`
 *  (page 1 draws a form whose own resources are that shared dictionary). */
export function sharedImagesPdf(mode) {
  const img = (t) => ({ dict: '<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 >>', stream: t });
  const shared = '<< /Font << /F1 3 0 R >> /XObject << /Im1 8 0 R /Im2 9 0 R /Fm1 10 0 R >> >>';
  const leaf = (c, res) => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]${res ? ` /Resources ${res}` : ''} /Contents ${c} 0 R >>`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [4 0 R 5 0 R] /Count 2${mode === 'inherit' ? ` /Resources ${shared}` : ''} >>`, FONT,
    leaf(6, mode === 'shared' || mode === 'form' ? '11 0 R' : ''), leaf(7, mode === 'shared' || mode === 'form' ? '11 0 R' : ''),
    { dict: '<< >>', stream: mode === 'form' ? '/Fm1 Do' : 'q 612 0 0 792 0 0 cm /Im1 Do Q' }, { dict: '<< >>', stream: 'q 612 0 0 792 0 0 cm /Im2 Do Q' },
    img('SCANPAGEONE'), img('SCANPAGETWO'),
    { dict: `<< /Type /XObject /Subtype /Form /BBox [0 0 612 792] /Resources 11 0 R >>`, stream: 'q 612 0 0 792 0 0 cm /Im1 Do Q' },
    shared];
  return assemble(objs);
}

/** One page whose content stream names a filter nobody can decode: its resources cannot be cut down, so they are copied whole. */
export function undecodablePdf() {
  return assemble([...frame(), page(5, ''), { dict: '<< /Filter /FooDecode >>', stream: 'q Q' }]);
}

/* ---------------------------------------------------------------- Documents > Convert fixtures */

import { deflateSync } from 'node:zlib';
import { zipSync, strToU8 } from 'fflate';

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const be32 = (n) => Uint8Array.of(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const chunk = (type, data) => { const t = enc.encode(type); const body = Uint8Array.from([...t, ...data]); return Uint8Array.from([...be32(data.length), ...body, ...be32(crc32(body))]); };

/** A real PNG, `w` by `h`, one flat colour (RGBA), decodable by any viewer. */
export function tinyPng(w = 8, h = 6, [r, g, b, a] = [200, 40, 40, 255]) {
  const row = Uint8Array.from([0, ...Array.from({ length: w }, () => [r, g, b, a]).flat()]);
  const raw = Uint8Array.from(Array.from({ length: h }, () => [...row]).flat());
  const ihdr = Uint8Array.from([...be32(w), ...be32(h), 8, 6, 0, 0, 0]);
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', ihdr), ...chunk('IDAT', deflateSync(raw)), ...chunk('IEND', [])]);
}
/** A PNG that says it is `w` by `h` pixels but holds one row: the header is all a size check reads. */
export const hugePng = (w, h) => { const p = tinyPng(2, 1); p.set(be32(w), 16); p.set(be32(h), 20); return p; };

/** The markers of a JPEG (start, optional EXIF orientation, frame header of `w` by `h`, end) with no picture data:
 *  enough for a size check, an orientation read and the PDF library's embed (which copies the bytes), not for drawing. */
export function jpegShell(w = 40, h = 30, orientation = 1) {
  const exif = orientation === 1 ? [] : [0xff, 0xe1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, 0, 0, 0, 0];
  const sof = [0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0];
  return Uint8Array.from([0xff, 0xd8, ...exif, ...sof, 0xff, 0xd9]);
}

/** A Word file with `paras` paragraphs of body text, a two-cell table row, a text box that stores its text twice
 *  (as Word does) and a deleted run, plus a header that must not appear. */
export function docxFile(paras = ['First paragraph.', 'Second & last.']) {
  const p = (t) => `<w:p><w:r><w:t xml:space="preserve">${t.replace(/&/g, '&amp;')}</w:t></w:r></w:p>`;
  const body = paras.map(p).join('')
    + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Cell B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    + '<mc:AlternateContent><mc:Choice><w:p><w:r><w:t>Boxed note</w:t></w:r></w:p></mc:Choice><mc:Fallback><w:p><w:r><w:t>Boxed note</w:t></w:r></w:p></mc:Fallback></mc:AlternateContent>'
    + '<w:p><w:del><w:r><w:delText>Struck</w:delText></w:r></w:del><w:r><w:t>Kept</w:t></w:r></w:p>';
  const xml = `<?xml version="1.0"?><w:document xmlns:w="w" xmlns:mc="mc"><w:body>${body}</w:body></w:document>`;
  return zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8(xml), 'word/header1.xml': strToU8('<w:hdr><w:p><w:r><w:t>Header text</w:t></w:r></w:p></w:hdr>') });
}

/** The first bytes of an old Word file (an OLE container naming a WordDocument stream). */
export function oleDoc() {
  const head = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const name = [...'WordDocument'].flatMap((c) => [c.charCodeAt(0), 0]);
  return Uint8Array.from([...head, ...new Array(504).fill(0), ...name, ...new Array(64).fill(0)]);
}
/** A zip that is not a workbook or a document (a Pages or PowerPoint file looks like this). */
export const otherZip = () => zipSync({ 'index.xml': strToU8('<x/>'), 'Data/a.txt': strToU8('a') });

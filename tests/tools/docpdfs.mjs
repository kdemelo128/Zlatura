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

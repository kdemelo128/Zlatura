/* leasepdfs.mjs -- the invented lease PDFs, made from tests/lease-fixtures.js page text by hand (no library): every line is
 * drawn in Courier so a column stays a column when the app reads the text back. A text layer, WinAnsi quotes. `split` cuts every
 * line into runs of a few characters (some mid-word, as a word processor with kerning writes them). Also the broken ones the
 * browser flow refuses: cut short, encrypted. Run by hand: node tests/tools/leasepdfs.mjs <out-dir> writes the files.
 *
 * lines(pageText) -> [{ s, x, y }]  is also what tests/e2e/make_lease_scans.py draws as a scanned page. */
import fs from 'node:fs';
import path from 'node:path';
import { F1, F2, F3, F4, F6_LEASE, F6_SUMMARY } from '../lease-fixtures.js';
import { damagedPdf, encryptedPdf } from './docpdfs.mjs';

const SIZE = 7.5; // Courier: every character is 0.6 of the size wide, so 126 characters fit a Letter page
const CW = 0.6 * SIZE;
const LH = 10;
const WIN = { '“': '\x93', '”': '\x94', '‘': '\x91', '’': '\x92', '–': '\x96', '—': '\x97' };
const plain = (s) => s.replace(/ﬂ/g, 'fl').replace(/ﬁ/g, 'fi'); // a standard font has no ligature glyphs
const esc = (s) => [...s].map((c) => WIN[c] ?? c).join('').replace(/[\\()]/g, (c) => `\\${c}`);

/** The lines of a page as drawn: text, left edge and baseline in points. */
export const lines = (pageText) => pageText.split('\n').map((s, i) => ({ s: plain(s), x: 40, y: 750 - i * LH }));

function assemble(objs) {
  let out = '%PDF-1.7\n';
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${typeof o === 'string' ? o : `${o.dict.replace(/>>$/, '')} /Length ${o.stream.length} >>\nstream\n${o.stream}\nendstream`}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, 'latin1'));
}

/** A PDF of the given page texts. */
export function leasePdf(pages, { split = false } = {}) {
  const font = 3;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', null, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'];
  const kids = [];
  pages.forEach((text) => {
    const body = lines(text).map(({ s, x, y }) => {
      if (!s.trim()) return '';
      if (!split) return `BT /F1 ${SIZE} Tf ${x} ${y} Td (${esc(s)}) Tj ET`;
      const runs = [];
      for (let k = 0, step = 5; k < s.length; k += step, step = step === 5 ? 7 : 5) runs.push([k, s.slice(k, k + step)]);
      return runs.filter(([, r]) => r.trim()).map(([k, r]) => `BT /F1 ${SIZE} Tf ${(x + k * CW).toFixed(2)} ${y} Td (${esc(r)}) Tj ET`).join('\n');
    }).join('\n');
    const page = objs.length + 1;
    kids.push(`${page} 0 R`);
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${page + 1} 0 R >>`);
    objs.push({ dict: '<< >>', stream: body });
  });
  objs[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(' ')}] >>`;
  return assemble(objs);
}

/** Every fixture PDF by name. */
export function allLeasePdfs() {
  return {
    'lease-f1-dot.pdf': leasePdf(F1), 'lease-f2-paren.pdf': leasePdf(F2), 'lease-f3-amendment.pdf': leasePdf(F3), 'lease-f4-article.pdf': leasePdf(F4, { split: true }),
    'lease-f6-planted.pdf': leasePdf(F6_LEASE), 'lease-f6-summary.pdf': leasePdf(F6_SUMMARY),
    'lease-f6-cut.pdf': damagedPdf(), 'lease-f6-locked.pdf': encryptedPdf(),
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const dir = process.argv[2] || '.';
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, bytes] of Object.entries(allLeasePdfs())) fs.writeFileSync(path.join(dir, name), bytes);
  // the page texts as JSON, for the scan maker (make_lease_scans.py)
  fs.writeFileSync(path.join(dir, 'lease-f1.json'), JSON.stringify({ pages: F1.map(lines) }));
  console.log('ok');
}

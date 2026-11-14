/* How big is the stored page text of a document (document memory, release A0)? Builds invented documents (a 20-, 60- and
 * 120-page offering memorandum, a lease, a T-12, a scan whose pages came from OCR) from a seeded generator, packs each the
 * way the app does (app/doctext.js: gzip of the JSON page list), and prints characters, packed bytes and the ratio.
 * Invented text only: no real file is read. Real files are measured on the owner's machine (tests/tools/doc-local.mjs).
 *
 *   node tests/tools/doctext-size.mjs [--json] */
import { packDoc, unpackDoc, recordBytes } from '../../app/doctext.js';

let seed = 20261113;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const WORDS = ('the property is located in a growing submarket with strong demand from neighbourhood retail office and service tenants. ' +
  'traffic visibility access parking frontage signalised intersection daytime population household income employment education transportation corridor ' +
  'tenant lease rent base term expiration renewal option escalation increase reimbursement common area maintenance taxes insurance utilities janitorial ' +
  'building roof membrane warranty replaced resurfaced elevator mechanical electrical plumbing sprinkler fire alarm security camera lighting landscaping ' +
  'buyer seller offer guidelines closing escrow deposit financing lender loan proceeds appraisal survey title environmental inspection disclosure ' +
  'market vacancy absorption construction pipeline supply comparable sale price per square foot capitalization rate net operating income gross effective ' +
  'anchor inline junior suite premises landlord assignment sublease subordination estoppel guaranty default remedies notice holdover abatement allowance ' +
  'investment highlights overview summary demographics radius mile population growth projected current estimate forecast annual monthly quarterly').split(/\s+/);
const sentence = () => {
  const n = 9 + Math.floor(rnd() * 14);
  const w = Array.from({ length: n }, () => pick(WORDS));
  w[0] = w[0][0].toUpperCase() + w[0].slice(1);
  if (rnd() < 0.3) w.splice(Math.floor(rnd() * n), 0, `${(rnd() * 900 + 100).toFixed(rnd() < 0.5 ? 0 : 2)}${pick(['', '%', ' SF', ' units'])}`);
  return `${w.join(' ')}.`;
};
const para = (k) => Array.from({ length: k }, sentence).join(' ');
const num = () => `$${Math.round(rnd() * 900000 + 10000).toLocaleString('en-US')}`;
const table = (rows) => Array.from({ length: rows }, (_, i) => `Suite ${100 + i * 10}  Tenant ${String.fromCharCode(65 + (i % 26))}${i}  ${Math.round(rnd() * 5000 + 800).toLocaleString('en-US')} SF  ${num()}  ${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}/${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}/${2026 + Math.floor(rnd() * 6)}`).join('\n');
/** One text page: a heading, then paragraphs and sometimes a table, to about `chars` characters. */
const page = (n, chars) => {
  let t = `SECTION ${n}\n\n`;
  while (t.length < chars) t += rnd() < 0.2 ? `${table(6)}\n\n` : `${para(3 + Math.floor(rnd() * 3))}\n\n`;
  return t.slice(0, chars);
};
const doc = (pages, chars) => Array.from({ length: pages }, (_, i) => page(i + 1, Math.round(chars * (0.5 + rnd()))));

const SAMPLES = [
  ['OM, 20 pages (2.5 KB a page)', doc(20, 2500), 'text'],
  ['OM, 60 pages (2.5 KB a page)', doc(60, 2500), 'text'],
  ['OM, 120 pages (2.5 KB a page)', doc(120, 2500), 'text'],
  ['OM, 60 pages, text-heavy (4 KB a page)', doc(60, 4000), 'text'],
  ['Lease, 38 pages (3.5 KB a page)', doc(38, 3500), 'text'],
  ['T-12, 3 pages (mostly numbers)', Array.from({ length: 3 }, (_, i) => `INCOME STATEMENT ${i + 1}\n${Array.from({ length: 40 }, (_, j) => `Line ${j}   ${Array.from({ length: 12 }, () => num()).join('  ')}`).join('\n')}`), 'text'],
  ['Scan, 30 pages, OCR text (1.8 KB a page, noisy)', doc(30, 1800).map((p) => p.replace(/[aeiou]/g, (c) => (rnd() < 0.04 ? pick(['1', 'l', '0', '|']) : c))), 'ocr'],
];

const rows = [];
for (const [name, pages, readBy] of SAMPLES) {
  const rec = await packDoc({ dealId: 'd1', sha256: 'a'.repeat(64), name, pages, readBy });
  const back = await unpackDoc(rec);
  if (!back || back.pages.join('\u0000') !== pages.join('\u0000')) throw new Error(`${name}: did not round-trip`);
  const bytes = recordBytes(rec);
  rows.push({ name, pages: pages.length, chars: rec.chars, packed: bytes, ratio: +(rec.chars / bytes).toFixed(2), kbPerPage: +(bytes / pages.length / 1024).toFixed(2), z: rec.z });
}
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
else for (const r of rows) console.log(`${r.name.padEnd(52)} ${String(r.pages).padStart(4)} pp  ${String(r.chars).padStart(8)} chars  ${String(r.packed).padStart(8)} B packed  ${r.ratio}x  ${r.kbPerPage} KB/page  (${r.z})`);

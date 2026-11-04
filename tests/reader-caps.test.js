/* Every reader goes through checkReader (filekind.js): a size cap before the bytes are read, then the kind from
 * the first bytes. Invented bytes only; an "oversized" file here only reports a size and must never be read. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as fflate from 'fflate';
import { LIMITS, checkReader } from '../app/filekind.js';
import { pdfPages, checkPageCount } from '../app/pdftext.js';
import { buildBackup } from '../app/backup.js';
import { exportPackage } from '../app/library.js';
import { FORMATS } from '../app/brand.js';

const getFflate = async () => fflate;
const enc = (s) => new TextEncoder().encode(s);
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** A file that reports `size` and whose first bytes are `head`; reading it whole is counted (and fails). */
function fake(head, size, name) {
  const calls = { whole: 0 };
  return { calls, name, size, slice: () => ({ arrayBuffer: async () => Uint8Array.from(head).buffer }), arrayBuffer: async () => { calls.whole++; throw new Error('read whole'); } };
}
const pdfHead = [...enc('%PDF-1.7\n')];

test('a PDF reader refuses a file over the PDF limit without reading it, naming the file', async () => {
  const f = fake(pdfHead, LIMITS.pdfRead + 1, 'Huge OM.pdf');
  const r = await checkReader(f, 'pdf');
  assert.match(r, /^“Huge OM\.pdf” can’t be read: it is 150 MB; a PDF is read up to 150 MB\./);
  assert.equal(await checkReader(fake(pdfHead, 120e6, 'Photo OM.pdf'), 'pdf'), null); // photo-heavy OMs over 50 MB are read
  assert.equal(LIMITS.pdf, 50e6); // PDF pages, Convert and Documents keep 50 MB
  assert.equal(f.calls.whole, 0);
});

test('a PDF reader refuses a PNG, a zip, text and a binary blob under a .pdf name', async () => {
  for (const [head, word] of [[PNG, /a photo/], [[0x50, 0x4b, 3, 4, 0, 0], /a zip file/], [[...enc('hello, not a pdf')], /a text file/], [[1, 2, 0, 0, 3], /a binary file/]]) {
    const f = fake(head, 5000, 'OM.pdf');
    const r = await checkReader(f, 'pdf');
    assert.match(r, /^“OM\.pdf” can’t be read: it is /);
    assert.match(r, word);
    assert.equal(f.calls.whole, 0);
  }
});

test('a real PDF passes, and so does an empty file (the reader words that itself)', async () => {
  assert.equal(await checkReader(fake(pdfHead, 5000, 'a.pdf'), 'pdf'), null);
  assert.equal(await checkReader(fake([], 0, 'a.pdf'), 'pdf'), null);
});

test('a PDF named .txt is still a PDF by its bytes (the name never decides)', async () => {
  assert.equal(await checkReader(fake(pdfHead, 5000, 'om.txt'), 'pdf'), null);
});

test('a template reader refuses a PDF, a PNG and text under a .xlsx name, and an oversized workbook unread', async () => {
  for (const [head, word] of [[pdfHead, /a PDF/], [PNG, /a photo/], [[...enc('a,b\n1,2\n')], /a text file/]]) {
    const r = await checkReader(new File([Uint8Array.from(head)], 'Template.xlsx'), 'xlsx', { getFflate });
    assert.match(r, /^“Template\.xlsx” can’t be read: it is /);
    assert.match(r, word);
    assert.match(r, /not an Excel workbook/);
  }
  const big = fake([0x50, 0x4b, 3, 4], LIMITS.workbook + 1, 'Big.xlsx');
  assert.match(await checkReader(big, 'xlsx', { getFflate }), /^“Big\.xlsx” can’t be read\. That file is 25 MB/);
  assert.equal(big.calls.whole, 0);
});

test('a template reader passes a real workbook, and refuses a password-protected one and a zip bomb', async () => {
  const ok = fflate.zipSync({ '[Content_Types].xml': enc('<x/>'), 'xl/workbook.xml': enc('<workbook/>') });
  assert.equal(await checkReader(new File([ok], 'ok.xlsx'), 'xlsx', { getFflate }), null);
  const u16 = (s) => [...s].flatMap((c) => [c.charCodeAt(0), 0]);
  const ole = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new Array(500).fill(0), ...u16('EncryptedPackage')]);
  assert.match(await checkReader(new File([ole], 'locked.xlsx'), 'xlsx', { getFflate }), /^“locked\.xlsx” can’t be read\. That workbook is password protected/);
  const bomb = fflate.zipSync({ '[Content_Types].xml': enc('<x/>'), 'xl/workbook.xml': enc('<workbook/>'), 'xl/big.xml': new Uint8Array(3e6) });
  assert.match(await checkReader(new File([bomb], 'bomb.xlsx'), 'xlsx', { getFflate }), /^“bomb\.xlsx” can’t be read\..*decompression bomb/);
});

test('a backup or project reader refuses an array, a PNG, a PDF and a zip under a .json name, unread', async () => {
  for (const [head, re] of [[[...enc('[1,2,3]')], /start with “\{”/], [PNG, /start with “\{”/], [pdfHead, /start with “\{”/], [[0x50, 0x4b, 3, 4], /start with “\{”/], [[...enc('plain words')], /start with “\{”/]]) {
    const f = fake(head, 4000, 'Zlatura backup.json');
    const r = await checkReader(f, 'json');
    assert.match(r, /^“Zlatura backup\.json” can’t be read: it is not a backup or project file/);
    assert.match(r, re);
    assert.equal(f.calls.whole, 0);
  }
});

test('a backup passes: plain, with a byte-order mark, UTF-16, and after blank lines', async () => {
  for (const b of [enc('{"format":"x"}'), Uint8Array.from([0xef, 0xbb, 0xbf, ...enc('{"a":1}')]), enc('\n  \r\n{"a":1}'), Uint8Array.from([0xff, 0xfe, ...[...'{"a":1}'].flatMap((c) => [c.charCodeAt(0), 0])])]) {
    assert.equal(await checkReader(new File([b], 'b.json'), 'json'), null);
  }
});

test('a backup over a size limit is refused unread (512 MB: beyond what a browser holds as a string)', async () => {
  assert.equal(LIMITS.json, 512e6);
  const was = LIMITS.json;
  LIMITS.json = 100e6;
  try {
    const f = fake([...enc('{"a":1}')], 100e6 + 1, 'b.json');
    assert.match(await checkReader(f, 'json'), /^“b\.json” can’t be read: it is 100 MB, more than a browser can hold as text \(100 MB\)/);
    assert.equal(f.calls.whole, 0);
  } finally { LIMITS.json = was; }
});

const docOf = (n, calls = {}) => ({ numPages: n, destroy: async () => { calls.destroyed = true; }, getPage: async () => { calls.page = true; throw new Error('read a page'); } });

test('a PDF with more pages than the cap is refused before any page is read, with a plain message', async () => {
  const calls = {};
  const pdfjs = { getDocument: () => ({ promise: Promise.resolve(docOf(LIMITS.pdfPages + 1, calls)) }) };
  await assert.rejects(() => pdfPages(pdfjs, new Uint8Array(4)), (e) => {
    assert.equal(e.plain, true);
    assert.match(e.message, /^it has 501 pages; 500 is the most to read at once\. Use PDF pages to cut it first\.$/);
    return true;
  });
  assert.equal(calls.destroyed, true);
  assert.equal(calls.page, undefined);
  await checkPageCount(docOf(LIMITS.pdfPages)); // exactly the cap is read
});

/* The reader sites: each calls checkReader before it reads the file whole (a mutation that removes the call fails these). */
const SRC = (f) => fs.readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
const before = (src, fn, call, read) => {
  const at = src.indexOf(fn);
  assert.ok(at >= 0, `${fn} not found`);
  const body = src.slice(at, at + 2500);
  const a = body.indexOf(call); const b = body.search(read);
  assert.ok(a >= 0, `${fn}: no ${call}`);
  assert.ok(b < 0 || a < b, `${fn}: checked after reading`);
};
test('every reader site checks the file before reading it', () => {
  before(SRC('dealui.js'), 'async function readOmFile', "checkReader(file, 'pdf')", /arrayBuffer\(\)/);
  before(SRC('dealui.js'), 'file = await pickPdf()', "checkReader(file, 'pdf')", /omFiles\.set/);
  before(SRC('ui.js'), "st.textContent = 'reading…'", "checkReader(file, 'pdf')", /arrayBuffer\(\)/);
  before(SRC('ui.js'), 'async function openProject', "checkReader(file, 'json')", /readText\(/);
  before(SRC('ui.js'), 'async function loadTemplate', "checkReader(file, 'xlsx'", /arrayBuffer\(\)/);
  before(SRC('rentrollui.js'), 'async function importPdfDialog', "checkReader(f, 'pdf')", /arrayBuffer\(\)/);
  before(SRC('libraryui.js'), 'async function readWorkbook', "checkReader(file, 'xlsx'", /arrayBuffer\(\)/);
  before(SRC('libraryui.js'), 'async function importPackage', "checkReader(file, 'json')", /readText\(/);
  before(SRC('backupui.js'), 'async function restore', "checkReader(file, 'json')", /readText\(/);
  assert.match(SRC('kit.js'), /if \(err && err\.plain\) return msg;/); // pdfProblem says a plain reason as it is
  assert.match(SRC('ocr.js'), /await checkPageCount\(doc\);/);
  assert.match(SRC('pdftext.js'), /await checkPageCount\(doc\);\n  const pages/);
});

test('the real backup, project and template package outputs pass, even with hostile names and a BOM', async () => {
  const names = ['Scan %PDF-1.4 note', 'PK\u0003\u0004 notes', '\ufeffBOM name', '%PDF-'];
  const deals = names.map((name, i) => ({ id: `d${i}`, name, figures: { address: name } }));
  const backup = await buildBackup({ deals, kv: {}, appVersion: '1' });
  const project = { format: FORMATS.project.write, version: 1, savedAt: 'x', docs: names.map((n) => ({ name: n, pages: [n] })), edits: {}, manual: [], subject: null };
  const pkg = exportPackage({ name: names[0], category: 'Underwriting', description: names[1], versions: [{ fileName: 'a.xlsx', bytes: new Uint8Array(3) }], mapping: {}, current: 0 });
  for (const t of [JSON.stringify(backup), JSON.stringify(backup, null, 2), JSON.stringify(project), pkg]) {
    assert.equal(await checkReader(new File([enc(t)], 'x.json'), 'json'), null);
    assert.equal(await checkReader(new File([Uint8Array.from([0xef, 0xbb, 0xbf, ...enc(t)])], 'x.json'), 'json'), null);
  }
});

test('an odd page count is refused plainly: NaN, undefined, fractions, negatives', async () => {
  for (const n of [NaN, undefined, 2.5, -1]) {
    const calls = {};
    await assert.rejects(() => checkPageCount(docOf(n, calls)), (e) => /^could not read the page count/.test(e.message) && e.plain === true);
    assert.equal(calls.destroyed, true);
  }
  await checkPageCount(docOf(0)); // an empty PDF keeps its own message further on
});

test('the rent roll CSV, research and AI file readers check before reading', () => {
  before(SRC('rentrollui.js'), 'async function readTable', 'checkUpload(file)', /readText\(/);
  before(SRC('researchui.js'), "pick.addEventListener('change'", "checkReader(f, 'pdf')", /arrayBuffer\(\)/);
  before(SRC('aiui.js'), 'export async function readWithAi', "checkReader(f, 'pdf')", /arrayBuffer\(\)/);
  assert.match(SRC('researchui.js'), /e\.plain\) toast/);
  assert.match(SRC('aiui.js'), /e\.plain\) toast/);
  assert.match(SRC('convertui.js'), /e\.pages\) return/);
});


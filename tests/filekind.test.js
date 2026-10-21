/* filekind.js: what an upload really is, from its bytes and size (T-12 PR 1).
 * The content decides the kind; the name only words the message. Invented
 * bytes only. The "encrypted" file is a synthetic container holding the
 * marker Excel's password protection writes: not a real Excel-encrypted file. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fflate from 'fflate';
import { LIMITS, sniff, zipKind, oleKind, checkUpload } from '../app/filekind.js';

const getFflate = async () => fflate;
const enc = (s) => new TextEncoder().encode(s);
const u16 = (s) => { const o = []; for (const c of s) o.push(c.charCodeAt(0), 0); return o; };
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ole = (...streams) => Uint8Array.from([...OLE, ...new Array(500).fill(0), ...streams.flatMap((s) => [...u16(s), ...new Array(40).fill(0)])]);
const zip = (files, level = 6) => fflate.zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [typeof v === 'string' ? enc(v) : v, { level }]])));
const xlsxBytes = (extra = {}) => zip({ '[Content_Types].xml': '<x/>', 'xl/workbook.xml': '<workbook/>', ...extra });
const file = (b, name = 'x.bin') => new File([b], name);
/** A file that only reports a size, and must not be read whole. */
function fake(head, size, name = 'big.xlsx', whole = null) {
  const calls = { whole: 0 };
  return { calls, name, size, slice: () => ({ arrayBuffer: async () => Uint8Array.from(head).buffer }), arrayBuffer: async () => { calls.whole++; if (!whole) throw new Error('read whole'); return Uint8Array.from(whole).buffer; } };
}
/** Patch the first central-directory entry of a zip: its compressed and uncompressed sizes as declared. */
function declare(bytes, size, original) {
  const b = Uint8Array.from(bytes); const dv = new DataView(b.buffer);
  for (let i = 0; i < b.length - 4; i++) if (dv.getUint32(i, true) === 0x02014b50) { dv.setUint32(i + 20, size, true); dv.setUint32(i + 24, original, true); return b; }
  throw new Error('no central directory');
}

test('sniff: the first bytes decide the kind', () => {
  assert.equal(sniff(xlsxBytes()), 'zip');
  assert.equal(sniff(Uint8Array.from([0x50, 0x4b, 0x05, 0x06, 0, 0])), 'zip');
  assert.equal(sniff(ole()), 'ole');
  assert.equal(sniff(enc('%PDF-1.7\n')), 'pdf');
  assert.equal(sniff(Uint8Array.from([...new Array(900).fill(0x20), ...enc('%PDF-1.4')])), 'pdf', 'the marker may sit up to 1 KB in');
  assert.equal(sniff(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10])), 'png');
  assert.equal(sniff(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
  assert.equal(sniff(Uint8Array.from([...enc('RIFF'), 1, 2, 3, 4, ...enc('WEBPVP8 ')])), 'webp');
  assert.equal(sniff(Uint8Array.from([0, 0, 0, 24, ...enc('ftypheic')])), 'heic');
  assert.equal(sniff(enc('Line,Jan 2026,Total\nRent,100,100\n')), 'text');
  assert.equal(sniff(Uint8Array.from([0xff, 0xfe, 0x4c, 0, 0x69, 0])), 'text', 'UTF-16 with a byte-order mark is text');
  assert.equal(sniff(Uint8Array.from([0x41, 0, 0, 0, 0x42, 0x13])), 'unknown', 'a NUL byte and no byte-order mark');
  assert.equal(sniff(new Uint8Array(0)), 'text');
});

test('sniff: only the first 8 KB are looked at', () => {
  const late = Uint8Array.from([...enc('Line,Jan\n'), ...new Array(9000).fill(0x41), 0]);
  assert.equal(sniff(late), 'text', 'a NUL after 8 KB is not seen');
});

test('zipKind: an xlsx, an xlsm, a docx and any other zip', () => {
  assert.deepEqual(zipKind(xlsxBytes(), fflate.unzipSync), { kind: 'xlsx', macros: false, refuse: null });
  assert.deepEqual(zipKind(xlsxBytes({ 'xl/vbaProject.bin': Uint8Array.from([1, 2, 3]) }), fflate.unzipSync), { kind: 'xlsx', macros: true, refuse: null });
  assert.equal(zipKind(zip({ 'word/document.xml': '<w/>' }), fflate.unzipSync).kind, 'docx');
  assert.equal(zipKind(zip({ 'a.txt': 'hello' }), fflate.unzipSync).kind, 'zip');
});

test('zipKind: lists the entries without unpacking any', () => {
  let unpacked = 0;
  const spy = (bytes, o) => fflate.unzipSync(bytes, { filter: (f) => { const r = o.filter(f); if (r) unpacked++; return r; } });
  zipKind(xlsxBytes(), spy);
  assert.equal(unpacked, 0);
});

test('zipKind: a part packed 201 times is refused, 200 times is not (the ratio)', () => {
  const base = zip({ 'xl/workbook.xml': new Uint8Array(1000).map((_, i) => (i * 7919) % 251) }, 0);
  assert.equal(zipKind(declare(base, 1000, 201000), fflate.unzipSync).refuse, 'That file packs a part far tighter than a spreadsheet does, which is how a decompression bomb looks. It was not opened.');
  assert.equal(zipKind(declare(base, 1000, 200000), fflate.unzipSync).refuse, null);
  assert.notEqual(zipKind(declare(base, 1000, 200001), fflate.unzipSync).refuse, null);
});

test('zipKind: more than 100 MB declared in all is refused, exactly 100 MB is not (the total)', () => {
  const base = zip({ 'xl/workbook.xml': new Uint8Array(1000).map((_, i) => (i * 31) % 251) }, 0);
  const over = zipKind(declare(base, 600000, 100e6 + 1), fflate.unzipSync);
  assert.match(over.refuse, /would unpack to 100 MB \(the most is 100 MB\)/);
  assert.equal(zipKind(declare(base, 600000, 100e6), fflate.unzipSync).refuse, null);
});

test('zipKind: more than 10,000 entries is refused, exactly 10,000 is not', () => {
  const many = (n) => zip({ 'xl/workbook.xml': '<w/>', ...Object.fromEntries(Array.from({ length: n - 1 }, (_, i) => [`p/${i}`, 'x'])) }, 0);
  assert.match(zipKind(many(LIMITS.zipEntries + 1), fflate.unzipSync).refuse, /10001 parts/);
  assert.equal(zipKind(many(LIMITS.zipEntries), fflate.unzipSync).refuse, null);
});

test('oleKind: the strings an Office container names its streams with', () => {
  assert.equal(oleKind(ole('EncryptedPackage', 'EncryptionInfo')), 'encrypted');
  assert.equal(oleKind(ole('Workbook')), 'xls');
  assert.equal(oleKind(ole('Book')), 'xls');
  assert.equal(oleKind(ole('WordDocument')), 'doc');
  assert.equal(oleKind(ole('Other')), 'ole');
  assert.equal(oleKind(Uint8Array.from([...OLE, ...enc('Workbook')])), 'ole', 'one-byte letters are not a UTF-16 name');
});

test('checkUpload: a real workbook and a macro workbook are read, whatever they are named', async () => {
  const a = await checkUpload(file(xlsxBytes(), 'plain.csv'), { getFflate });
  assert.deepEqual([a.kind, a.macros, a.refuse], ['xlsx', false, null]);
  assert.ok(a.buffer instanceof ArrayBuffer);
  const m = await checkUpload(file(xlsxBytes({ 'xl/vbaProject.bin': Uint8Array.from([9, 9]) }), 'with-macros.xlsm'), { getFflate });
  assert.deepEqual([m.kind, m.macros, m.refuse], ['xlsx', true, null]);
});

test('checkUpload: a PDF named .xlsx gets the PDF message', async () => {
  const r = await checkUpload(file(enc('%PDF-1.7\n1 0 obj\n'), 'statement.xlsx'), { getFflate });
  assert.equal(r.kind, 'pdf');
  assert.equal(r.refuse, '“statement.xlsx” is really a PDF, whatever its name says. A PDF arrives in a later version; copy the table and use Paste a statement.');
  assert.equal((await checkUpload(file(enc('%PDF-1.7\n'), 'statement.pdf'), { getFflate })).refuse, 'A PDF arrives in a later version; copy the table and use Paste a statement.');
});

test('checkUpload: photos, Word files, old .xls and a password-protected workbook each say what to do', async () => {
  assert.match((await checkUpload(file(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), 'scan.jpg'), { getFflate })).refuse, /^Reading photos arrives in a later version/);
  assert.equal((await checkUpload(file(zip({ 'word/document.xml': '<w/>' }), 'memo.docx'), { getFflate })).refuse, 'A Word document arrives in a later version; copy the table and use Paste a statement.');
  assert.match((await checkUpload(file(ole('Workbook'), 'old.xls'), { getFflate })).refuse, /^That is an old \.xls file\. Open it in Excel and save it as \.xlsx \(or CSV\), then import it\.$/);
  assert.match((await checkUpload(file(ole('WordDocument'), 'old.doc'), { getFflate })).refuse, /save it as \.docx/);
  const e = await checkUpload(file(ole('EncryptedPackage'), 'locked.xlsx'), { getFflate });
  assert.equal(e.kind, 'encrypted');
  assert.equal(e.refuse, 'That workbook is password protected. Remove the password in Excel, save it, then import it.');
});

test('checkUpload: a text file of any name reads as text; binary junk is refused', async () => {
  const t = await checkUpload(file(enc('Line;Jan 2026\nRent;1\n'), 'export.xlsx'), { getFflate });
  assert.deepEqual([t.kind, t.refuse], ['text', null]);
  assert.equal((await checkUpload(file(Uint8Array.from([1, 0, 2, 0, 3]), 'x.csv'), { getFflate })).kind, 'unknown');
});

test('checkUpload: a workbook over 25,000,000 bytes is refused before the file is read whole', async () => {
  const head = xlsxBytes().slice(0, 100);
  const over = fake(head, LIMITS.workbook + 1);
  const r = await checkUpload(over, { getFflate });
  assert.match(r.refuse, /a workbook is read up to 25 MB/);
  assert.equal(over.calls.whole, 0, 'the whole file was never read');
  const exact = fake(head, LIMITS.workbook, 'edge.xlsx', xlsxBytes());
  assert.equal((await checkUpload(exact, { getFflate })).refuse, null, 'exactly 25,000,000 bytes is read');
  assert.equal(exact.calls.whole, 1);
  const oleOver = fake(ole('Workbook'), LIMITS.workbook + 1, 'big.xls');
  assert.match((await checkUpload(oleOver, { getFflate })).refuse, /25 MB/);
});

test('checkUpload: a text file over 10,000,000 bytes is refused; exactly 10,000,000 is not', async () => {
  const head = enc('Line,Jan\nRent,1\n');
  const r = await checkUpload(fake(head, LIMITS.text + 1, 'big.csv'), { getFflate });
  assert.match(r.refuse, /a text file is read up to 10 MB/);
  assert.equal((await checkUpload(fake(head, LIMITS.text, 'edge.csv'), { getFflate })).refuse, null);
});

test('checkUpload: a PDF over 50 MB and a photo over 20 MB say they are too big', async () => {
  assert.match((await checkUpload(fake(enc('%PDF-1.7'), LIMITS.pdf + 1, 'a.pdf'), { getFflate })).refuse, /up to 50 MB/);
  assert.match((await checkUpload(fake([0xff, 0xd8, 0xff], LIMITS.image + 1, 'a.jpg'), { getFflate })).refuse, /up to 20 MB/);
  assert.match((await checkUpload(fake(enc('%PDF-1.7'), LIMITS.pdf, 'a.pdf'), { getFflate })).refuse, /^A PDF arrives/);
  assert.match((await checkUpload(fake([0xff, 0xd8, 0xff], LIMITS.image, 'a.jpg'), { getFflate })).refuse, /^Reading photos arrives/);
});

test('checkUpload: a zip bomb is refused (ratio, and total declared size) and never unpacked', async () => {
  const base = zip({ 'xl/workbook.xml': new Uint8Array(1000).map((_, i) => (i * 7919) % 251) }, 0);
  const ratio = await checkUpload(file(declare(base, 1000, 201000), 'bomb.xlsx'), { getFflate });
  assert.equal(ratio.kind, 'zip');
  assert.match(ratio.refuse, /decompression bomb/);
  const total = await checkUpload(file(declare(base, 600000, 100e6 + 1), 'bomb2.xlsx'), { getFflate });
  assert.match(total.refuse, /would unpack to/);
});

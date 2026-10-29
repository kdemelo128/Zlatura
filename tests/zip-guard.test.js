/* zip-guard: a hostile workbook is refused before ExcelJS inflates it (filekind.js
 * safeUnzip / hardenZip / checkUpload). ExcelJS's JSZip ignores the sizes a zip
 * declares, so these files are built here with invented bytes and lying headers. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as fflate from 'fflate';
import { LIMITS, checkUpload, safeUnzip, hardenZip } from '../app/filekind.js';

const require = createRequire(import.meta.url);
const getFflate = async () => fflate;
const enc = (s) => new TextEncoder().encode(s);
const base = { '[Content_Types].xml': enc('<x/>'), 'xl/workbook.xml': enc('<workbook/>') };
const zip = (files, level = 6) => fflate.zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level }]])));
const asFile = (b, name = 'x.xlsx') => new File([b], name);
/** Rewrite the uncompressed size (and optionally compressed size) of every entry named `name`, in the local header and the central directory. */
function lie(bytes, name, original, size = null) {
  const b = Uint8Array.from(bytes); const dv = new DataView(b.buffer);
  for (let i = 0; i < b.length - 46; i++) {
    if (dv.getUint32(i, true) === 0x02014b50 && new TextDecoder().decode(b.subarray(i + 46, i + 46 + dv.getUint16(i + 28, true))) === name) {
      dv.setUint32(i + 24, original, true); if (size !== null) dv.setUint32(i + 20, size, true);
      const lo = dv.getUint32(i + 42, true); dv.setUint32(lo + 22, original, true); if (size !== null) dv.setUint32(lo + 18, size, true);
    }
  }
  return b;
}
const bomb = (mb, declared) => lie(zip({ ...base, 'xl/worksheets/sheet1.xml': new Uint8Array(mb * 1e6) }), 'xl/worksheets/sheet1.xml', declared);

test('a part declared at 1,000 bytes that inflates to far more is refused without inflating it', async () => {
  const t = Date.now();
  const r = await checkUpload(asFile(bomb(60, 1000)), { getFflate });
  assert.ok(r.refuse, 'refused');
  assert.match(r.refuse, /not the size|bomb/);
  assert.ok(Date.now() - t < 1500, 'stopped after the first pieces, not after 60 MB');
});

test('a part declared honestly but far over the total cap is refused', async () => {
  const big = zip({ ...base, 'xl/worksheets/sheet1.xml': new Uint8Array(LIMITS.zipTotal + 1e6) }, 6);
  const r = await checkUpload(asFile(big), { getFflate });
  assert.ok(r.refuse);
  assert.match(r.refuse, /MB/);
});

test('many parts together over the total cap are refused', async () => {
  const files = { ...base }; for (let i = 0; i < 11; i++) files[`xl/p${i}.xml`] = new Uint8Array(10e6);
  assert.ok((await checkUpload(asFile(zip(files)), { getFflate })).refuse);
});

test('too many entries are refused', async () => {
  const files = { ...base }; for (let i = 0; i < LIMITS.zipEntries + 5; i++) files[`xl/e${i}.xml`] = new Uint8Array(0);
  const r = await checkUpload(asFile(zip(files, 0)), { getFflate });
  assert.match(r.refuse || '', /parts/);
});

test('a part packed far tighter than the ratio cap is refused', async () => {
  const r = await checkUpload(asFile(zip({ ...base, 'xl/worksheets/sheet1.xml': new Uint8Array(5e6) })), { getFflate });
  assert.match(r.refuse || '', /tighter/);
});

test('a nested zip is just bytes: counted in the total, never unpacked', () => {
  const inner = zip({ 'a.bin': new Uint8Array(1e6) });
  const files = safeUnzip(zip({ ...base, 'xl/embeddings/o.zip': inner }), fflate);
  assert.deepEqual([...files['xl/embeddings/o.zip']], [...inner], 'kept as stored bytes');
});

test('a stored part whose sizes disagree, and a part that ends short, are refused', () => {
  const stored = zip({ ...base, 'xl/s.xml': enc('0123456789') }, 0);
  assert.throws(() => safeUnzip(lie(stored, 'xl/s.xml', 5), fflate), /not the size/);
  const short = lie(zip({ ...base, 'xl/s.xml': enc('0123456789'.repeat(50)) }), 'xl/s.xml', 600);
  assert.throws(() => safeUnzip(short, fflate), /not the size/);
});

test('a damaged zip and a password-protected entry are refused with the plain message', () => {
  assert.throws(() => safeUnzip(enc('not a zip at all, but long enough to look'), fflate), /could not be opened/);
  const z = Uint8Array.from(zip(base)); const dv = new DataView(z.buffer);
  for (let i = 0; i < z.length - 46; i++) if (dv.getUint32(i, true) === 0x02014b50) { dv.setUint16(i + 8, 1, true); break; }
  assert.throws(() => safeUnzip(z, fflate), /could not be opened/);
});

test('a normal workbook opens and ExcelJS reads exactly what it read before', async () => {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rent Roll');
  ws.addRow(['Unit', 'SF', 'Rent']); for (let i = 0; i < 300; i++) ws.addRow([`A${i}`, 800 + i, 1500.5 + i]);
  ws.getCell('D2').value = { formula: 'B2*C2', result: 1 };
  wb.addWorksheet('Hidden').state = 'hidden';
  const original = new Uint8Array(await wb.xlsx.writeBuffer());
  const r = await checkUpload(asFile(original), { getFflate });
  assert.equal(r.refuse, null); assert.equal(r.kind, 'xlsx'); assert.equal(r.guarded, true);
  const dump = async (buf) => { const w = new ExcelJS.Workbook(); await w.xlsx.load(buf); return JSON.stringify(w.worksheets.map((s) => [s.name, s.state, s.getSheetValues()])); };
  assert.equal(await dump(r.buffer), await dump(original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength)));
  const h = hardenZip(original, fflate);
  const cd = new DataView(h.buffer); let stored = 0, entries = 0;
  for (let i = 0; i < cd.byteLength - 46; i++) if (cd.getUint32(i, true) === 0x02014b50) { entries++; if (cd.getUint16(i + 10, true) === 0) stored++; }
  assert.ok(entries > 0 && stored === entries, 'every part is stored, not compressed again');
  assert.deepEqual(Object.keys(safeUnzip(new Uint8Array(h.buffer), fflate)).sort(), Object.keys(fflate.unzipSync(original)).sort());
});

test('safeUnzip enforces each cap by itself (not only through the pre-check)', () => {
  const many = { ...base }; for (let i = 0; i < LIMITS.zipEntries + 5; i++) many[`xl/e${i}.xml`] = new Uint8Array(0);
  assert.throws(() => safeUnzip(zip(many, 0), fflate), /parts/);
  assert.throws(() => safeUnzip(zip({ ...base, 'xl/s.xml': new Uint8Array(LIMITS.zipTotal + 1e6) }), fflate), /unpack to/);
  assert.throws(() => safeUnzip(zip({ ...base, 'xl/s.xml': new Uint8Array(5e6) }), fflate), /tighter/);
  assert.throws(() => safeUnzip(bomb(30, 1000), fflate), /not the size/);
});

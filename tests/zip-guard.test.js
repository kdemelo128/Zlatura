/* zip-guard: a hostile workbook is refused before ExcelJS inflates it (filekind.js
 * safeUnzip / hardenZip / checkUpload). ExcelJS's JSZip ignores the sizes a zip
 * declares, so these files are built here with invented bytes and lying headers. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as fflate from 'fflate';
import { LIMITS, checkUpload, safeUnzip, hardenZip } from '../app/filekind.js';
import { readGrids, loadXlsx } from '../app/sheetread.js';
import { inspectTemplate } from '../app/template.js';

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
  assert.ok(Date.now() - t < 4000, 'stopped after the first pieces, not after 60 MB');
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

/** A zip written the zip64 way: sizes (and in the directory the offset) held in extra field 1, the directory closed by a zip64 record. `lie` sets one part's declared size. */
function zip64(files, lie = {}, withOffset = true) {
  const parts = []; const cd = []; let off = 0;
  const w = (n) => { const b = new Uint8Array(n); return [b, new DataView(b.buffer)]; };
  for (const [name, data] of Object.entries(files)) {
    const comp = fflate.deflateSync(data); const nm = enc(name); const orig = BigInt(Object.hasOwn(lie, name) ? lie[name] : data.length);
    const [lh, l] = w(30 + nm.length + 20);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 45, true); l.setUint16(8, 8, true); l.setUint32(18, 0xffffffff, true); l.setUint32(22, 0xffffffff, true);
    l.setUint16(26, nm.length, true); l.setUint16(28, 20, true); lh.set(nm, 30); l.setUint16(30 + nm.length, 1, true); l.setUint16(32 + nm.length, 16, true);
    l.setBigUint64(34 + nm.length, orig, true); l.setBigUint64(42 + nm.length, BigInt(comp.length), true);
    const xl = withOffset ? 28 : 20;
    const [ch, c] = w(46 + nm.length + xl);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 45, true); c.setUint16(6, 45, true); c.setUint16(10, 8, true);
    c.setUint32(20, 0xffffffff, true); c.setUint32(24, 0xffffffff, true); c.setUint16(28, nm.length, true); c.setUint16(30, xl, true);
    c.setUint32(42, withOffset ? 0xffffffff : off, true); ch.set(nm, 46);
    c.setUint16(46 + nm.length, 1, true); c.setUint16(48 + nm.length, xl - 4, true); c.setBigUint64(50 + nm.length, orig, true); c.setBigUint64(58 + nm.length, BigInt(comp.length), true);
    if (withOffset) c.setBigUint64(66 + nm.length, BigInt(off), true);
    parts.push(lh, comp); cd.push(ch); off += lh.length + comp.length;
  }
  const cdLen = cd.reduce((n, b) => n + b.length, 0);
  const [rec, r] = w(56); r.setUint32(0, 0x06064b50, true); r.setBigUint64(4, 44n, true); r.setBigUint64(24, BigInt(cd.length), true); r.setBigUint64(32, BigInt(cd.length), true); r.setBigUint64(40, BigInt(cdLen), true); r.setBigUint64(48, BigInt(off), true);
  const [loc, o] = w(20); o.setUint32(0, 0x07064b50, true); o.setBigUint64(8, BigInt(off + cdLen), true); o.setUint32(16, 1, true);
  const [end, e] = w(22); e.setUint32(0, 0x06054b50, true); e.setUint16(8, 0xffff, true); e.setUint16(10, 0xffff, true); e.setUint32(12, 0xffffffff, true); e.setUint32(16, 0xffffffff, true);
  return Uint8Array.from(Buffer.concat([...parts, ...cd, rec, loc, end].map((b) => Buffer.from(b))));
}

test('zip64: a small workbook written the zip64 way opens; a zip64 bomb is refused', async () => {
  for (const withOffset of [true, false]) {
    const ok = zip64({ ...base, 'xl/s.xml': enc('<s/>'.repeat(100)) }, {}, withOffset);
    const files = safeUnzip(ok, fflate);
    assert.equal(new TextDecoder().decode(files['xl/s.xml']), '<s/>'.repeat(100));
    assert.equal((await checkUpload(asFile(ok), { getFflate })).refuse, null);
    const lying = zip64({ ...base, 'xl/s.xml': new Uint8Array(30e6) }, { 'xl/s.xml': 1000 }, withOffset);
    assert.throws(() => safeUnzip(lying, fflate), /not the size/);
    assert.throws(() => safeUnzip(zip64({ ...base, 'xl/s.xml': enc('x') }, { 'xl/s.xml': 2 ** 40 }, withOffset), fflate), /unpack to|tighter|could not be opened/);
  }
});

test('entries that share a part or overlap are refused', () => {
  const z = Uint8Array.from(zip({ ...base, 'xl/a.xml': enc('<a/>'.repeat(50)) })); const dv = new DataView(z.buffer);
  let cd = -1, end = -1; for (let i = 0; i <= z.length - 22; i++) { const g = dv.getUint32(i, true); if (g === 0x02014b50 && new TextDecoder().decode(z.subarray(i + 46, i + 54)) === 'xl/a.xml') cd = i; if (g === 0x06054b50) end = i; }
  const entry = z.subarray(cd, cd + 46 + 8); const twin = Uint8Array.from(entry); twin.set(enc('xl/b.xml'), 46);
  const out = Uint8Array.from([...z.subarray(0, end), ...twin, ...z.subarray(end)]); const o = new DataView(out.buffer);
  const e2 = end + twin.length; o.setUint16(e2 + 8, o.getUint16(e2 + 8, true) + 1, true); o.setUint16(e2 + 10, o.getUint16(e2 + 10, true) + 1, true); o.setUint32(e2 + 12, o.getUint32(e2 + 12, true) + twin.length, true);
  assert.throws(() => safeUnzip(out, fflate), /could not be opened/);
  assert.ok(safeUnzip(z, fflate)['xl/a.xml'], 'the untouched file is fine');
  const badSig = Uint8Array.from(zip(base)); badSig[0] = 0; // the first local header is not one
  assert.throws(() => safeUnzip(badSig, fflate), /could not be opened/);
});

test('a part named __proto__ is just a part: unpacked as data, refused plainly when it cannot be repacked', () => {
  const z = zip64({ ...base, ['__proto__']: enc('hi') });
  const files = safeUnzip(z, fflate);
  assert.equal(Object.getPrototypeOf(files), null);
  assert.equal(new TextDecoder().decode(files['__proto__']), 'hi');
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'hi'), false);
  assert.match(hardenZip(z, fflate).refuse, /could not be opened/);
});

test('the refusal names the file', async () => {
  const r = await checkUpload(asFile(bomb(30, 1000), 'Rent Roll June.xlsx'), { getFflate });
  assert.match(r.refuse, /^“Rent Roll June\.xlsx”/);
});

const xlsxLibs = async () => ({ ExcelJS: require('exceljs'), fflate });

test('every ExcelJS load site refuses a bomb: template, sheet import (no getFflate), rent roll', async () => {
  const lying = bomb(30, 1000);
  assert.throws(() => inspectTemplate(fflate, lying, {}), /not the size/, 'template');
  await assert.rejects(readGrids(asFile(lying), xlsxLibs), /not the size/, 'readGrids with no getFflate');
  await assert.rejects(loadXlsx(asFile(lying), xlsxLibs), /not the size/, 'rent roll');
  const huge = { name: 'big.xlsx', size: LIMITS.workbook + 1, slice: () => asFile(lying).slice(0, 8192), arrayBuffer: async () => { throw new Error('read whole'); } };
  await assert.rejects(loadXlsx(huge, xlsxLibs), /25 MB/, 'rent roll size limit');
  await assert.rejects(loadXlsx(asFile(enc('%PDF-1.4 x'), 'rr.xlsx'), xlsxLibs), /PDF/, 'rent roll kind');
  const ExcelJS = require('exceljs'); const wb = new ExcelJS.Workbook(); wb.addWorksheet('S').addRow(['a', 1]);
  const good = new Uint8Array(await wb.xlsx.writeBuffer());
  assert.equal((await loadXlsx(asFile(good), xlsxLibs)).worksheets[0].getRow(1).getCell(2).value, 1);
});

test('a zip64 directory whose locator or record is not what it claims is refused', () => {
  const z = zip64({ ...base });
  const dv0 = new DataView(z.buffer);
  const find = (sig) => { for (let i = z.length - 22; i >= 0; i--) if (dv0.getUint32(i, true) === sig) return i; return -1; };
  for (const sig of [0x07064b50, 0x06064b50]) {
    const bad = Uint8Array.from(z); new DataView(bad.buffer).setUint32(find(sig), 0, true);
    assert.throws(() => safeUnzip(bad, fflate), /could not be opened/);
  }
});

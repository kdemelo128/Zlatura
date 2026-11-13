/* A zip dropped on Start from documents or the Documents card is opened in memory (filekind.js unpackBundle, ddintake.js
 * lookAt) and each file in it is staged exactly as if it had been dropped itself, naming the zip. The guards that refuse
 * a bad zip (bomb, entry count, declared total, nesting, caps, "../" paths) hold, one bad part never stops the rest, and
 * nothing is written to disk. Every file here is invented. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';
import { pdfOf, PDF_SPECS } from './rr-fixtures.js';

globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const { lookAt, ZIP_DEPTH } = await import('../app/ddintake.js');
const { LIMITS, unpackBundle, unsafePath, checkUpload } = await import('../app/filekind.js');
const I = await import('../app/intake.js');
const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
const { pdfPages } = await import('../app/pdftext.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;

const getFflate = async () => fflate;
const getXlsx = async () => ({ ExcelJS, fflate });
const readPdf = async (bytes) => { const layouts = []; const pages = await pdfPages(pdfjs, new Uint8Array(bytes), { layouts, verbosity: 0 }); return { pages, layouts }; };
const deps = { getFflate, getXlsx, readPdf };
const enc = (s) => new TextEncoder().encode(s);
const zip = (files, level = 6) => fflate.zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level }]])));
const file = (bytes, name) => new File([bytes], name);

const ROLL = 'Suite,Tenant,Square Feet,Lease Start,Lease Expiration,Annual Base Rent\n101,"Acme, Inc.",1500,2024-01-01,2029-12-31,"$45,000"\n102,Vacant,800,,,\n103,Beta LLC,1200,03/01/2025,02/28/2030,38400\n';
const MONTHS = ['Jan 2025', 'Feb 2025', 'Mar 2025', 'Apr 2025', 'May 2025', 'Jun 2025'];
async function t12Book() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('T-12 Operating Statement');
  ws.addRow(['Line', ...MONTHS, 'Total']);
  ws.addRow(['Rental income', ...MONTHS.map(() => 10000), 60000]);
  ws.addRow(['Real estate taxes', ...MONTHS.map(() => 1500), 9000]);
  ws.addRow(['Net operating income', ...MONTHS.map(() => 8500), 51000]);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
const rollPdf = () => pdfOf(PDF_SPECS['rr-dd']());

test('a zip of a rent roll CSV, a T-12 workbook and a text PDF stages each as if dropped itself, naming the zip', async () => {
  const z = zip({ 'rent-roll.csv': enc(ROLL), 'Q2/operating.xlsx': await t12Book(), 'om-rent-roll.pdf': rollPdf() });
  const p = I.newPlan();
  const out = await I.stageFiles(p, [file(z, 'deal-docs.zip')], deps);
  assert.equal(out.length, 3);
  assert.ok(out.every((x) => x.from === 'deal-docs.zip'), 'each names its zip');
  const by = Object.fromEntries(out.map((x) => [x.name, x]));
  assert.deepEqual(Object.keys(by).sort(), ['om-rent-roll.pdf', 'operating.xlsx', 'rent-roll.csv']);
  assert.equal(by['operating.xlsx'].type, 't12');
  assert.equal(by['rent-roll.csv'].type, 'rentroll');
  assert.equal(by['om-rent-roll.pdf'].type, 'rentroll');
  assert.equal(by['rent-roll.csv'].kind, 'csv');
  assert.ok(out.every((x) => /^[0-9a-f]{64}$/.test(x.sha256)), 'each fingerprinted');
  // the two rent rolls compete: asked, exactly as two dropped files would
  assert.equal(I.controlling(p, null, 'rentroll').ask, true);
  // identical to the same file dropped by itself
  const solo = I.newPlan();
  const [one] = await I.stageFiles(solo, [file(enc(ROLL), 'rent-roll.csv')], deps);
  assert.equal(one.sha256, by['rent-roll.csv'].sha256);
  assert.equal(one.type, by['rent-roll.csv'].type);
  assert.equal(one.reason, by['rent-roll.csv'].reason);
});

test('a file in a zip that is also dropped alone is a repeat (SHA-256), and a repeat inside the zip is kept once', async () => {
  const p = I.newPlan();
  await I.stageFiles(p, [file(enc(ROLL), 'rent-roll.csv'), file(zip({ 'copy.csv': enc(ROLL), 'other/again.csv': enc(ROLL) }), 'b.zip')], deps);
  assert.equal(p.items.length, 3);
  assert.equal(p.items.filter((x) => x.dup).length, 2);
  assert.match(p.items[1].dup, /same file as rent-roll\.csv/);
  assert.equal(p.items[1].from, 'b.zip');
});

test('a refused part says why and the others still stage; folders and system junk are left out', async () => {
  const z = zip({ 'a/': new Uint8Array(0), '__MACOSX/._x.csv': enc('junk'), '.DS_Store': enc('junk'), 'rr.csv': enc(ROLL), 'blob.bin': new Uint8Array([0, 1, 2, 3, 0, 255, 0, 9]), 'old.xls': Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]) });
  const p = I.newPlan();
  const out = await I.stageFiles(p, [file(z, 'mixed.zip')], deps);
  assert.deepEqual(out.map((x) => x.name), ['rr.csv', 'blob.bin', 'old.xls']);
  assert.equal(out[0].type, 'rentroll');
  assert.ok(out[1].refuse && out[2].refuse, 'the binary and the old .xls say why');
  assert.equal(out[1].state, 'skipped');
  assert.equal(I.readyItems(p, null).length, 1);
});

test('a zip with "../" and absolute paths: those parts are refused with a reason, the safe one stages, nothing is written', async () => {
  const z = zip({ '../evil.csv': enc(ROLL), '/abs/root.csv': enc(ROLL), 'ok/../../up.csv': enc(ROLL), 'C:\\win.csv': enc(ROLL), 'fine.csv': enc(ROLL) });
  const before = fs.readdirSync(process.cwd()).sort();
  const p = I.newPlan();
  const out = await I.stageFiles(p, [file(z, 'trav.zip')], deps);
  assert.equal(out.length, 5);
  assert.equal(out.filter((x) => x.refuse).length, 4);
  for (const x of out.filter((y) => y.refuse)) assert.match(x.refuse, /climbs out of the zip/);
  assert.equal(out.find((x) => !x.refuse).name, 'fine.csv');
  assert.deepEqual(fs.readdirSync(process.cwd()).sort(), before, 'nothing written to the working folder');
  assert.equal(fs.existsSync(new URL('../../evil.csv', import.meta.url)), false);
  for (const bad of ['../x', 'a/../../x', '/x', '\\x', 'C:/x', 'a\\..\\x', 'a\0b']) assert.ok(unsafePath(bad), bad);
  for (const ok of ['x', 'a/b.csv', 'a..b/c', '..hidden']) assert.equal(unsafePath(ok), null, ok);
});

test('a zip bomb is refused whole, with a reason, before anything is inflated', async () => {
  const bomb = zip({ 'big.csv': new Uint8Array(20e6), 'rr.csv': enc(ROLL) }); // 20 MB of zeros packs to about 20 KB
  const t = Date.now();
  const p = I.newPlan();
  const [it] = await I.stageFiles(p, [file(bomb, 'bomb.zip')], deps);
  assert.equal(p.items.length, 1);
  assert.match(it.refuse, /bomb\.zip.*not opened.*bomb|bomb/s);
  assert.equal(it.state, 'skipped');
  assert.ok(Date.now() - t < 4000);
  assert.throws(() => unpackBundle(bomb, fflate), /bomb/);
});

test('the entry-count and declared-total caps refuse a zip whole', async () => {
  const z = zip({ 'a.csv': enc(ROLL), 'b.csv': enc(ROLL), 'c.csv': enc(ROLL) });
  const e = LIMITS.zipEntries; const t = LIMITS.zipTotal;
  try {
    LIMITS.zipEntries = 2;
    await assert.rejects(async () => unpackBundle(z, fflate), /3 parts/);
    LIMITS.zipEntries = e; LIMITS.zipTotal = 100;
    assert.throws(() => unpackBundle(z, fflate), /would unpack to over/);
  } finally { LIMITS.zipEntries = e; LIMITS.zipTotal = t; }
});

test('a cap on files: the parts past it are refused as one line and the rest stage', async () => {
  const z = zip({ '1.csv': enc(ROLL), '2.csv': enc(`${ROLL}\n`), '3.csv': enc(`${ROLL}\n\n`), '4.csv': enc(`${ROLL}\n\n\n`) });
  const cap = LIMITS.zipFiles;
  try {
    LIMITS.zipFiles = 2;
    const p = I.newPlan();
    const out = await I.stageFiles(p, [file(z, 'many.zip')], deps);
    assert.equal(out.filter((x) => !x.refuse).length, 2);
    const r = out.filter((x) => x.refuse);
    assert.equal(r.length, 1);
    assert.match(r[0].refuse, /more than this app opens at once/);
  } finally { LIMITS.zipFiles = cap; }
  const bytesCap = LIMITS.zipTotal;
  try {
    LIMITS.zipTotal = 1000; // a byte total over the files opened, shared with nested zips through one budget
    const budget = { files: 0, bytes: 0 };
    const one = unpackBundle(zip({ 'a.csv': enc(ROLL.repeat(4)) }), fflate, budget);
    const two = unpackBundle(zip({ 'b.csv': enc(ROLL.repeat(2)), 'c.csv': enc(ROLL) }), fflate, budget);
    assert.equal(one.files.length, 1);
    assert.deepEqual([two.files.length, two.refused.length], [1, 1], JSON.stringify(two.refused));
    assert.match(two.refused[0].why, /more than this app opens at once/);
  } finally { LIMITS.zipTotal = bytesCap; }
});

test('a zip inside a zip inside a zip is opened; one more level is refused, the rest stage', async () => {
  assert.equal(ZIP_DEPTH, 2);
  const tooDeep = zip({ 'deep.csv': enc(ROLL) });
  const third = zip({ 'third.csv': enc(`${ROLL}\n\n\n`), 'toodeep.zip': tooDeep });
  const inner = zip({ 'inner.csv': enc(`${ROLL}\n`), 'third.zip': third });
  const outer = zip({ 'top.csv': enc(`${ROLL}\n\n`), 'inner.zip': inner });
  const p = I.newPlan();
  const out = await I.stageFiles(p, [file(outer, 'outer.zip')], deps);
  const names = out.map((x) => `${x.name}|${x.from}|${x.refuse ? 'refused' : 'ok'}`);
  assert.deepEqual(names, ['top.csv|outer.zip|ok', 'inner.csv|outer.zip › inner.zip|ok', 'third.csv|outer.zip › inner.zip › third.zip|ok', 'toodeep.zip|outer.zip › inner.zip › third.zip|refused']);
  assert.match(out[3].refuse, /zip inside a zip inside a zip inside a zip/);
});

test('an empty zip says so; a corrupt one is refused with a reason', async () => {
  const p = I.newPlan();
  const out = await I.stageFiles(p, [file(zip({}), 'empty.zip'), file(Uint8Array.from([0x50, 0x4b, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9]), 'broken.zip')], deps);
  assert.equal(out.length, 2);
  assert.match(out[0].refuse, /empty zip/);
  assert.ok(out[1].refuse && out[1].state === 'skipped');
});

test('a workbook (itself a zip) is still one workbook, and a macro or Word file is still refused, not opened as a bundle', async () => {
  const p = I.newPlan();
  const [wb] = await I.stageFiles(p, [file(await t12Book(), 'plain.xlsx')], deps);
  assert.equal(wb.type, 't12');
  assert.equal(wb.from, null);
  const docx = zip({ '[Content_Types].xml': enc('<x/>'), 'word/document.xml': enc('<d/>') });
  const [d] = await I.stageFiles(I.newPlan(), [file(docx, 'letter.docx')], deps);
  assert.equal(d.kind, 'docx');
  assert.equal(d.from, null);
});

test('a zip larger than a workbook may be is read when a bundle is opened; a workbook reader still refuses it at the workbook size; a big workbook is refused either way', async () => {
  const w = LIMITS.workbook;
  const noise = enc(Array.from({ length: 400 }, (_, i) => `${(i * 7919 * 104729) % 99991}x${(i * 31337) % 65537}`).join(','));
  const bigZip = zip({ 'a.csv': enc(ROLL), 'c.csv': noise });
  try {
    LIMITS.workbook = 1000;
    assert.ok(bigZip.length > 1000);
    const r = await checkUpload(file(bigZip, 'big.zip'), { getFflate, bundle: true });
    assert.equal(r.plainZip, true, r.refuse);
    const rz = await checkUpload(file(bigZip, 'big.zip'), { getFflate }); // a workbook reader's call
    assert.match(rz.refuse, /a workbook is read up to/, rz.refuse);
    const wbk = await t12Book();
    assert.ok(wbk.length > 1000);
    const rw = await checkUpload(file(wbk, 'big.xlsx'), { getFflate, bundle: true });
    assert.match(rw.refuse, /MB; a workbook is read up to/, rw.refuse);
  } finally { LIMITS.workbook = w; }
});

/* patch a finished zip: set the encryption flag, or the compression method, of the entry named `name`, in both its headers */
function patchEntry(bytes, name, { flag = 0, method = null }) {
  const out = bytes.slice(); const dv = new DataView(out.buffer);
  for (let i = 0; i + 46 < out.length; i++) {
    if (dv.getUint32(i, true) === 0x02014b50) {
      const n = dv.getUint16(i + 28, true);
      if (new TextDecoder().decode(out.subarray(i + 46, i + 46 + n)) !== name) continue;
      dv.setUint16(i + 8, dv.getUint16(i + 8, true) | flag, true);
      if (method !== null) dv.setUint16(i + 10, method, true);
      const local = dv.getUint32(i + 42, true);
      dv.setUint16(local + 6, dv.getUint16(local + 6, true) | flag, true);
      if (method !== null) dv.setUint16(local + 8, method, true);
    }
  }
  return out;
}

test('one password-protected part is refused with its own plain reason; the rest of the zip still opens', async () => {
  const z = patchEntry(zip({ 'rent-roll.csv': enc(ROLL), 'secret-t12.csv': enc(ROLL.replace('Acme', 'Other')) }), 'secret-t12.csv', { flag: 1 });
  const out = await lookAt(file(z, 'mixed.zip'), deps);
  assert.equal(out.length, 2);
  const bad = out.find((x) => x.info.refuse);
  assert.match(bad.info.refuse, /secret-t12\.csv|password protected/);
  assert.match(bad.info.refuse, /password protected, so it was not opened/);
  const good = out.find((x) => !x.info.refuse);
  assert.equal(good.info.verdict.type, 'rentroll');
  assert.equal(good.info.from, 'mixed.zip');
});

test('a part compressed in a way this app does not open (not stored, not deflate) is refused alone, naming the method; the rest opens', async () => {
  const z = patchEntry(zip({ 'a.csv': enc(ROLL), 'b.csv': enc(ROLL) }, 0), 'b.csv', { method: 14 });
  const out = await lookAt(file(z, 'odd.zip'), deps);
  assert.equal(out.length, 2);
  assert.match(out.find((x) => x.info.refuse).info.refuse, /compressed in a way this app does not open \(method 14\)/);
  assert.equal(out.filter((x) => !x.info.refuse).length, 1);
});

test('a workbook (not a bundle) with an encrypted or odd part is still refused whole, as before', async () => {
  const bytes = patchEntry(await t12Book(), 'xl/workbook.xml', { flag: 1 });
  const up = await checkUpload(file(bytes, 'stmt.xlsx'), { getFflate });
  assert.ok(up.refuse, 'a workbook whose part cannot be read is refused');
});

test('a part whose name is not UTF-8 (an old zip’s code page) is opened, named by its bytes read as Windows-1252, not refused or mangled into replacement characters', async () => {
  const z = zip({ 'XXrent roll.csv': enc(ROLL) }, 0);
  const at = z.findIndex((b, i) => b === 0x58 && z[i + 1] === 0x58); // the first "XX" (local header)
  const patched = z.slice();
  for (let i = 0; i + 1 < patched.length; i++) if (patched[i] === 0x58 && patched[i + 1] === 0x58) { patched[i] = 0x82; patched[i + 1] = 0x90; } // both headers: two bytes that are not valid UTF-8
  assert.ok(at >= 0);
  const out = await lookAt(file(patched, 'legacy.zip'), deps);
  assert.equal(out.length, 1);
  assert.equal(out[0].info.refuse, null);
  assert.ok(!out[0].info.name.includes('�'));
  assert.equal(out[0].info.verdict.type, 'rentroll');
});

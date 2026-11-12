/* On-device OCR of a PDF with no text layer (app/ocrpdf.js): when it runs, page provenance, the caps, Cancel, a stuck page,
 * a figure OCR is unsure of left out, and the mark on the staged item. The engine is a stand-in; invented text only. */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const O = await import('../app/ocrpdf.js');
const I = await import('../app/intake.js');
const { identify } = await import('../app/ddintake.js');
const { cases } = await import('./rr-fixtures.js');

const blank = (n) => ({ pages: Array(n).fill(''), layouts: Array(n).fill({}) });
const ROLL = (p) => `Rent Roll as of 01/31/2026 page ${p}\nUnit  Tenant  SF  Monthly Rent\n101  Acme Co  1,200  $2,400.00\n102  Beta LLC  900  $1,800.00`;
const engine = (over = {}) => {
  const calls = { read: [], restarted: 0, closed: 0 };
  return { calls, open: () => ({
    read: async (p, o) => { calls.read.push([p, o && o.blankBelow]); if (over.read) return over.read(p, o); return { text: ROLL(p), geom: { lines: [{ ocr: true, conf: 90 }] }, words: 12, conf: 90, unsure: 0, low: 0 }; },
    restart: async () => { calls.restarted += 1; },
    close: async () => { calls.closed += 1; },
  }) };
};
const run = (base, e, o = {}) => O.ocrIfScanned(null, new Uint8Array(1), base, { open: e.open, supported: () => true, ...o });

test('a PDF with real text is not touched, and the engine is never opened', async () => {
  const e = engine();
  const base = { pages: ['x'.repeat(300)], layouts: [{}] };
  const r = await run(base, e);
  assert.equal(r.ocr, null);
  assert.equal(r.pages, base.pages);
  assert.equal(e.calls.read.length, 0);
});

test('a scan is read page for page: page n of the text is page n of the PDF, with the geometry', async () => {
  const e = engine();
  const r = await run(blank(3), e);
  assert.deepEqual(r.ocr.read, [1, 2, 3]);
  assert.match(r.pages[1], /page 2/);
  assert.equal(r.layouts[2].lines[0].ocr, true);
  assert.equal(e.calls.closed, 1);
  assert.equal(r.ocr.conf, 90);
});

test('the page cap: only the first pages are read, and it says so', async () => {
  const e = engine();
  const r = await run(blank(20), e, { limits: { pages: 4 } });
  assert.deepEqual(r.ocr.read, [1, 2, 3, 4]);
  assert.equal(r.ocr.capped, true);
  assert.equal(r.pages[10], '');
  assert.match(O.ocrNote(r.ocr), /first 4 pages/);
});

test('Cancel ends the run at once and keeps what was read', async () => {
  const signal = { aborted: false };
  const e = engine({ read: async (p) => { if (p === 2) signal.aborted = true; return { text: ROLL(p), geom: {}, conf: 80 }; } });
  const r = await run(blank(5), e, { signal });
  assert.deepEqual(r.ocr.read, [1, 2]);
  assert.equal(r.ocr.cancelled, true);
  assert.match(O.ocrNote(r.ocr), /cancelled/);
  assert.equal(e.calls.closed, 1);
});

test('the time budget stops a long document', async () => {
  let t = 0;
  const e = engine({ read: async (p) => { t += 100; return { text: ROLL(p), geom: {}, conf: 80 }; } });
  const r = await run(blank(10), e, { limits: { totalMs: 250 }, now: () => t });
  assert.deepEqual(r.ocr.read, [1, 2, 3]);
  assert.equal(r.ocr.timedOut, true);
});

test('a page that hangs is given up on, the engine restarted, and the next page still read', async () => {
  const e = engine({ read: (p) => (p === 2 ? new Promise(() => {}) : Promise.resolve({ text: ROLL(p), geom: {}, conf: 80 })) });
  const r = await run(blank(3), e, { limits: { pageMs: 20 } });
  assert.deepEqual(r.ocr.read, [1, 3]);
  assert.deepEqual(r.ocr.failed, [2]);
  assert.equal(e.calls.restarted, 1);
  assert.equal(r.pages[1], '');
  assert.match(O.ocrNote(r.ocr), /Page 2 could not be read/);
});

test('a browser that cannot run the engine is said so, and the scan stays a scan', async () => {
  const base = blank(2);
  const r = await run(base, engine(), { supported: () => false });
  assert.equal(r.ocr.unsupported, true);
  assert.equal(r.pages, base.pages);
  assert.match(O.ocrNote(r.ocr), /can’t run/);
});

test('nothing read: the document is what it was; the engine always gets the confidence floor', async () => {
  const e = engine({ read: async () => { throw new Error('boom'); } });
  const base = blank(2);
  const r = await run(base, e);
  assert.equal(r.pages, base.pages);
  assert.deepEqual(r.ocr.failed, [1, 2]);
  const e2 = engine();
  await run(blank(1), e2);
  assert.equal(e2.calls.read[0][1], O.OCR_LIMITS.blankBelow);
  assert.ok(O.OCR_LIMITS.blankBelow >= 70);
});

test('figures OCR was unsure of are counted and the note says they are left blank to be asked', async () => {
  const e = engine({ read: async (p) => ({ text: ROLL(p), geom: {}, conf: 70, unsure: 2, low: 3 }) });
  const r = await run(blank(2), e);
  assert.equal(r.ocr.unsure, 4);
  assert.match(O.ocrNote(r.ocr), /4 figures were too unclear to read and are left blank, to be asked/);
});

test('the OCR text goes through the normal intake: a rent roll scan is typed by the reader, and the staged item says OCR and to check figures', async () => {
  const r = await run(blank(1), engine());
  const v = identify({ name: 'scan.pdf', pages: cases.continued }); // what the OCR text of an invented rent roll says
  const p = I.newPlan();
  const it = I.stage(p, { name: 'scan.pdf', kind: 'pdf', size: 10, sha256: 'c'.repeat(64), pages: 1, refuse: null, verdict: v, ocr: r.ocr }, {});
  assert.equal(it.ocrInfo.read[0], 1);
  assert.match(it.reason, /Read by OCR on this device \(all 1 page\): check every figure/);
  assert.equal(it.type, 'rentroll');
  assert.equal(it.confidence, 'Read by OCR');
  assert.notEqual(it.confidence, 'Read');
});

test('hasNoTextLayer uses the scan line of rrdoc.docKind (200 characters)', () => {
  assert.equal(O.hasNoTextLayer(['a'.repeat(199)]), true);
  assert.equal(O.hasNoTextLayer(['a'.repeat(200)]), false);
  assert.equal(O.hasNoTextLayer([]), false);
});

test('a finished read is remembered by file hash, so using the document does not read it again; a cancelled one is not', async () => {
  const sha = await (await import('../app/filehash.js')).sha256Hex(new Uint8Array([1, 2, 3]));
  const e = engine();
  const bytes = new Uint8Array([1, 2, 3]);
  const progress = () => ({ signal: { aborted: false }, say() {}, end() {} });
  const readText = async () => blank(1);
  const a = await O.readPdfOcr(null, bytes, readText, progress, { open: e.open, supported: () => true });
  const b = await O.readPdfOcr(null, bytes, readText, progress, { open: e.open, supported: () => true });
  assert.equal(e.calls.read.length, 1);
  assert.equal(b, a);
  assert.equal(O.ocrOf(sha).read.length, 1);
  O.rememberOcr('d'.repeat(64), { ocr: { cancelled: true, read: [1] } });
  assert.equal(O.ocrOf('d'.repeat(64)).cancelled, true); // the mark still shows
  assert.equal(O.ocrResult('d'.repeat(64)), null); // but it is read again if asked again
});

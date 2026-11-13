/* On-device OCR wherever a PDF is uploaded (app/ocrpdf.js pdfPagesAutoOcr): the deal page's OM, rent roll and T-12 uploads and the
 * Documents card read a scan by themselves, and an OM with a scanned page inside is OCR'd on that page before the OM reader runs.
 * The recogniser is a stand-in; the PDFs are invented, drawn by tests/rr-fixtures.js (a { scan } page has no text layer). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pdfOf, PDF_SPECS } from './rr-fixtures.js';

globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const O = await import('../app/ocrpdf.js');
const { readOm } = await import('../app/om.js');
const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;

const ROLL = (p) => `Rent Roll as of 01/31/2026 page ${p}\nUnit  Tenant  SF  Monthly Rent\n101  Acme Co  1,200  $2,400.00\n102  Beta LLC  900  $1,800.00`;
const engine = () => {
  const calls = { read: [] };
  return { calls, engine: { supported: () => true, open: () => ({ read: async (p) => { calls.read.push(p); return { text: ROLL(p), geom: { lines: [{ ocr: true, conf: 90 }] }, conf: 90, unsure: 0, low: 0 }; }, restart: async () => {}, close: async () => {} }) } };
};
const progress = () => { const s = { started: 0, ended: 0 }; return { s, start: () => { s.started++; return { signal: { aborted: false }, say() {}, end() { s.ended++; } }; } }; };
const noWorker = { verbosity: 0 };
const mixedOm = () => pdfOf(PDF_SPECS['om-rr-qc']()); // text pages, then a scanned page
const allScan = () => pdfOf([{ scan: [] }, { scan: [] }]);
const textOnly = () => pdfOf(PDF_SPECS['rr-dd']());
const fresh = (pdf) => { const b = new Uint8Array(pdf.length + 1); b.set(pdf); b[pdf.length] = 10 + (fresh.n = (fresh.n || 0) + 1) % 200; return b; }; // a different hash each time: the session remembers a read by hash

test('blankPageList: the empty pages of a document that has text, nothing for a whole scan or a full document', () => {
  assert.deepEqual(O.blankPageList(['a'.repeat(300), '', 'b'.repeat(300), '  \n ']), [2, 4]);
  assert.deepEqual(O.blankPageList(['', '']), []); // a whole scan is read whole, not page by page
  assert.deepEqual(O.blankPageList(['a'.repeat(300), 'b'.repeat(300)]), []);
});

test('a whole scan is read by OCR on the deal page upload, with the progress line shown once and taken down', async () => {
  const e = engine(); const p = progress(); const layouts = []; let said = null;
  const pages = await O.pdfPagesAutoOcr(pdfjs, fresh(allScan()), { layouts, ...noWorker, ocr: { engine: e.engine, onOcr: (o) => { said = o; } } }, p.start);
  assert.deepEqual(e.calls.read, [1, 2]);
  assert.match(pages[0], /Rent Roll as of/);
  assert.equal(layouts.length, 2);
  assert.equal(layouts[0].lines[0].ocr, true);
  assert.deepEqual([p.s.started, p.s.ended], [1, 1]);
  assert.deepEqual(said.read, [1, 2]);
});

test('a PDF with text is not OCR’d, no progress line, no engine', async () => {
  const e = engine(); const p = progress();
  const pages = await O.pdfPagesAutoOcr(pdfjs, fresh(textOnly()), { ...noWorker, ocr: { mixed: true, engine: e.engine } }, p.start);
  assert.equal(e.calls.read.length, 0);
  assert.equal(p.s.started, 0);
  assert.ok(pages[0].length > 100);
});

test('an OM with a scanned page: only that page is OCR’d, before the OM reader runs, and the reader then sees it', async () => {
  const e = engine(); const p = progress();
  const plain = await O.pdfPagesAutoOcr(pdfjs, fresh(mixedOm()), { ...noWorker, ocr: { engine: e.engine } }, p.start);
  assert.equal(e.calls.read.length, 0, 'without the OM flag an OM with text is left as it is');
  const blanks = O.blankPageList(plain);
  assert.ok(blanks.length >= 1);
  let said = null;
  const pages = await O.pdfPagesAutoOcr(pdfjs, fresh(mixedOm()), { ...noWorker, ocr: { mixed: true, engine: e.engine, onOcr: (o) => { said = o; } } }, p.start);
  assert.deepEqual(e.calls.read, blanks);
  assert.equal(pages.length, plain.length);
  for (let i = 0; i < pages.length; i++) assert.equal(pages[i] === plain[i], !blanks.includes(i + 1), `page ${i + 1} is the text layer unless it was blank`);
  assert.match(pages[blanks[0] - 1], /Acme Co/);
  assert.match(O.ocrNote(said), /Read by OCR on this device \(page/);
  assert.equal(readOm(pages, {}).scanned.length, 0, 'the OM reader no longer sees a page with no text');
  assert.ok(readOm(plain, {}).scanned.length >= 1);
});

test('the page cap and Cancel hold on the deal page: only the first blank pages are read, a cancel keeps what was read', async () => {
  const many = pdfOf([PDF_SPECS['rr-dd']()[0], ...Array.from({ length: 5 }, () => ({ scan: [] }))]);
  const e = engine();
  const pages = await O.pdfPagesAutoOcr(pdfjs, fresh(many), { ...noWorker, ocr: { mixed: true, engine: { ...e.engine, limits: { pages: 2 } }, onOcr: (o) => assert.equal(o.capped, true) } }, progress().start);
  assert.deepEqual(e.calls.read, [2, 3]);
  assert.equal(pages[3], '');
  const signal = { aborted: false }; const e2 = engine();
  const cancelOnFirst = { ...e2.engine, open: () => { const r = e2.engine.open(); const read = r.read; r.read = async (p, o) => { signal.aborted = true; return read(p, o); }; return r; } };
  let said = null;
  await O.pdfPagesAutoOcr(pdfjs, fresh(many), { ...noWorker, ocr: { mixed: true, engine: cancelOnFirst, onOcr: (o) => { said = o; } } }, () => ({ signal, say() {}, end() {} }));
  assert.equal(said.cancelled, true);
  assert.deepEqual(said.read, [2]);
});

test('the same file is not read twice in a session (the import reads it again when it is used)', async () => {
  const e = engine(); const bytes = fresh(allScan());
  await O.pdfPagesAutoOcr(pdfjs, bytes.slice(), { ...noWorker, ocr: { engine: e.engine } }, progress().start);
  const again = await O.pdfPagesAutoOcr(pdfjs, bytes.slice(), { ...noWorker, ocr: { engine: e.engine } }, progress().start);
  assert.equal(e.calls.read.length, 2);
  assert.match(again[1], /page 2/);
});

test('the wiring: every PDF upload on the deal page goes through the OCR reader (a source check; the browser flow ocrdeal-flow runs it)', async () => {
  const fs = await import('node:fs');
  const src = (f) => fs.readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
  assert.match(src('ui.js'), /pdfPages: \(pdfjs, data, opts = \{\}\) => pdfPagesAutoOcr\(/, 'the rent roll import and the OM reader read through api.pdfPages');
  assert.match(src('dealui.js'), /ocr: \{ mixed: true, onOcr/, 'the OM reader asks for the scanned pages inside an OM too');
  assert.match(src('dealui.js'), /readPdf: readPdfWithOcr, \/\/ a scan is read by OCR/, 'the Documents card');
  assert.match(src('t12ui.js'), /pdfPagesAutoOcr\(await getPdfjs\(\)/, 'the T-12 PDF import');
  assert.match(src('ddui.js'), /ocrNote\(info\.ocr\)/, 'the Documents card says what OCR did');
});

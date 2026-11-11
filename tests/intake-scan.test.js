/* A PDF with no text layer on Start from documents: it is said to have no text layer (not "damaged" or "unreadable"),
 * offered OCR on request only, and after OCR it is classified like any file, but OCR text never types it or reads a
 * figure by itself. The recogniser is a stub here (Tesseract runs in the browser flow, uw-intake-flow.mjs); the
 * offer, the wiring and the post-OCR path are what these test. Invented files only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fflate from 'fflate';
import { pdfOf, PDF_SPECS } from './rr-fixtures.js';

globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const I = await import('../app/intake.js');
const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
const { pdfPages } = await import('../app/pdftext.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;

const readPdf = async (bytes) => { const layouts = []; const pages = await pdfPages(pdfjs, new Uint8Array(bytes), { layouts, verbosity: 0 }); return { pages, layouts }; };
const deps = { getFflate: async () => fflate, getXlsx: async () => ({}), readPdf };
// one page that is only a picture of text: pdfOf draws a { scan } page empty, as a page with no text layer is
const scanPdf = () => pdfOf([{ scan: [{ x: 40, y: 700, s: 'Rent Roll', size: 14 }] }]);
const file = (bytes, name) => new File([bytes], name);

const LEASE_TEXT = 'LEASE AGREEMENT\nThis Lease is made between Hollow Oak Properties, as Landlord, and Delta Goods, as Tenant, for the premises known as Suite 104.\nThe commencement date is January 1, 2026 and the lease term is five years. Base rent is due monthly in advance.\nTenant shall pay all operating expenses and real estate taxes as additional rent under this Lease.\n';
const ROLL_TEXT = 'Rent Roll\nAs of 10/17/2026\nSuite  Tenant  SF  Lease Start  Lease End  Annual Rent\n101  Maple Leaf Bakery  2,000  01/01/2021  12/31/2030  $60,000\n102  Copperline Yoga  1,200  03/01/2023  02/28/2033  $36,000\n103  Vacant  1,800\nTotal  5,000  $96,000\n';

test('a PDF with no text layer is staged as such: not typed, its bytes kept in memory for an OCR request, nothing run yet', async () => {
  const p = I.newPlan();
  const [it] = await I.stageFiles(p, [file(scanPdf(), 'page-1.pdf')], deps);
  assert.equal(it.type, null);
  assert.equal(it.scanned, true);
  assert.ok(it.bytes instanceof Uint8Array && it.bytes.length > 100);
  assert.match(it.reason, /no text layer/);
  assert.doesNotMatch(it.reason, /damaged|corrupt/i);
  assert.equal(it.confidence, 'Not sure');
  assert.equal(it.refuse, null);
  assert.equal(I.questions(p, null).filter((q) => q.kind === 'type').length, 1);
  // a PDF that has text is not offered OCR
  const [txt] = await I.stageFiles(p, [file(pdfOf(PDF_SPECS['rr-dd']()), 'text.pdf')], deps);
  assert.equal(txt.scanned, false);
  assert.equal(txt.bytes, null);
});

test('after OCR the page is classified like any file: lease text "looks like" a lease and asks; the broker\'s tap sets the type', async () => {
  const p = I.newPlan();
  const [it] = await I.stageFiles(p, [file(scanPdf(), 'scan.pdf')], deps);
  const seen = [];
  const res = await I.readScan(p, it.id, async (bytes, progress) => { seen.push(bytes.length); progress && progress('Reading: 50%'); return LEASE_TEXT; });
  assert.equal(res.ok, true);
  assert.equal(seen.length, 1, 'the recogniser ran once, on the file\'s own bytes');
  assert.equal(it.type, null, 'OCR text does not type the file');
  assert.equal(it.confidence, 'Looks like');
  assert.deepEqual(it.ask.slice(0, 1), ['lease']);
  assert.match(it.reason, /Read by OCR on this device/);
  assert.equal(it.scanned, false);
  assert.equal(it.bytes, null, 'the bytes are let go once asked');
  assert.equal(I.readyItems(p, null).length, 0, 'nothing is ready to use until the broker answers');
  assert.ok(I.answer(p, it.id, 'lease'));
  assert.equal(it.typeBy, 'broker');
  assert.equal(I.readyItems(p, null).length, 1);
});

test('rent roll text from OCR is only "looks like": no type from a reader, no figure read, and it competes like any rent roll', async () => {
  const p = I.newPlan();
  const [it] = await I.stageFiles(p, [file(scanPdf(), 'scan.pdf')], deps);
  assert.equal((await I.readScan(p, it.id, async () => ROLL_TEXT)).ok, true);
  assert.equal(it.type, null, 'a reader\'s verdict on OCR text is downgraded to a question');
  assert.equal(it.typeBy, null);
  assert.ok(it.ask.includes('rentroll'), `the question offers a rent roll: ${it.ask}`);
  assert.ok(['Looks like', 'Not sure'].includes(it.confidence));
  assert.match(it.reason, /Read by OCR on this device/);
  assert.equal(I.controlling(p, null, 'rentroll').cands.length, 0, 'not a rent roll candidate until the broker says so');
  assert.equal(Object.keys(it).some((k) => /figure|rows|value/i.test(k)), false, 'no figure is held on the item');
});

test('OCR that finds nothing, fails or is asked twice leaves the file untyped with a reason; the others still stage', async () => {
  const p = I.newPlan();
  const [a, b] = await I.stageFiles(p, [file(scanPdf(), 'a.pdf'), file(pdfOf([{ scan: [] }, { scan: [] }]), 'b.pdf')], deps);
  const blank = await I.readScan(p, a.id, async () => '  \n ');
  assert.deepEqual([blank.ok, blank.chars], [true, 0]);
  assert.match(a.reason, /OCR found no readable text/);
  assert.equal(a.type, null);
  const again = await I.readScan(p, a.id, async () => { throw new Error('should not run'); });
  assert.equal(again.ok, false, 'asked once: no scan is waiting');
  const bad = await I.readScan(p, b.id, async () => { throw new Error('this browser can’t run the scanned-page reader'); });
  assert.equal(bad.ok, false);
  assert.match(bad.why, /couldn’t be read: this browser can’t run/);
  assert.equal(b.scanned, true, 'a failed read can be tried again');
  assert.equal(b.state, 'staged');
  assert.equal((await I.readScan(p, 'nope', async () => 'x')).ok, false);
  assert.equal((await I.readScan(p, b.id, async () => LEASE_TEXT)).ok, true);
});

test('a scan inside a zip is offered OCR like any dropped scan, naming the zip', async () => {
  const z = fflate.zipSync({ 'Q3/scan.pdf': scanPdf() });
  const p = I.newPlan();
  const [it] = await I.stageFiles(p, [file(z, 'bundle.zip')], deps);
  assert.equal(it.from, 'bundle.zip');
  assert.equal(it.scanned, true);
  assert.equal((await I.readScan(p, it.id, async () => LEASE_TEXT)).ok, true);
  assert.equal(it.ask[0], 'lease');
});

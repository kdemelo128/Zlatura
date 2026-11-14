/* Reader gaps 3: four routing gaps found in the routing review, each tested on invented files only.
 * 1 unit mix and lease comp tables are not rent rolls; 2 a month-by-month rent schedule is not a T-12; 3 an appraisal or a
 * broker opinion of value with a titled rent roll page is asked (its roll pages offered apart); 4 a page of 50-199
 * characters is a scan only when it is not a table and not real short text. */
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';
import { pdfOf } from './rr-fixtures.js';
import { prose, rollPage, narrative } from './tools/routepdfs.mjs';

globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const { intake } = await import('../app/ddintake.js');
const I = await import('../app/intake.js');
const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
const { pdfPages } = await import('../app/pdftext.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;

const readPdf = async (bytes) => { const layouts = []; const pages = await pdfPages(pdfjs, new Uint8Array(bytes), { layouts, verbosity: 0 }); return { pages, layouts }; };
const deps = { getFflate: async () => fflate, getXlsx: async () => ({ ExcelJS, fflate }), readPdf };
const file = (bytes, name) => new File([bytes], name);
const verdictOf = async (bytes, name) => (await intake(file(bytes, name), deps)).verdict;
const stageOf = async (bytes, name) => { const p = I.newPlan(); await I.stageFiles(p, [file(bytes, name)], deps); return p; };
const book = async (rows, name = 'Sheet1') => { const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(name); rows.forEach((r) => ws.addRow(r)); return Buffer.from(await wb.xlsx.writeBuffer()); };

/* ---- 4: a scan is a page with no real text, not any page with few characters */

const { realShortText, pageNeedsOcr, pagesAreScan } = await import('../app/textlayer.js');
const COVER = ['Sample Plaza Cover Page', 'Prepared for Invented Buyer LLC', 'Confidential, invented for a test'];
const SHORT_TABLE = ['Suite   Tenant   SF   Rent', '101   Alder Foods   2,400   5,700', '102   Birch Dental   1,800   4,650'];

test('gap 4: a cover page of real words, or a short table, is text; a stamp alone is a scan', async () => {
  assert.equal(pageNeedsOcr(COVER.join('\n')), false);
  assert.equal(pageNeedsOcr(SHORT_TABLE.join('\n')), false);
  assert.equal(realShortText(SHORT_TABLE.join('\n')), true);
  // a table with few words is still a table (two rows with a word and two figures)
  assert.equal(pageNeedsOcr('Unit SF Rent\nStudio 450 1,100\nLoft 650 1,350'), false);
  assert.equal(pageNeedsOcr('Studio 450\nLoft'), true);
  // what a scanner leaves in a text layer: a page number, a stamp, a stray mark
  assert.equal(pageNeedsOcr('Page 1 of 3\nScanned by CamScanner'), true);
  assert.equal(pageNeedsOcr(''), true);
  assert.equal(pageNeedsOcr('Page 2 of 3\n12\n'), true);
  // one line of words, or two words, is not enough to call real text
  assert.equal(pageNeedsOcr('Sample Plaza'), true);
  // 200 characters or more is a text page as before
  assert.equal(pageNeedsOcr('word '.repeat(60)), false);
  assert.equal(pagesAreScan([]), false);
  assert.equal(pagesAreScan(['Page 1 of 2', 'Page 2 of 2']), true);
});

test('gap 4: a PDF with a short cover page or a short table is not asked for OCR; a stamp-only PDF still is', async () => {
  const cover = prose(COVER, { y: 700, size: 18 });
  const v = await verdictOf(pdfOf([cover, cover]), 'a.pdf');
  assert.equal(v.scanned, false, 'real short text stays text');
  const table = await verdictOf(pdfOf([prose(SHORT_TABLE, { y: 700, size: 9 })]), 'b.pdf');
  assert.equal(table.scanned, false);
  const stamp = await verdictOf(pdfOf([prose(['Page 1 of 2', 'Scanned by CamScanner'], { y: 20, size: 6 }), prose(['Page 2 of 2'], { y: 20, size: 6 })]), 'c.pdf');
  assert.equal(stamp.scanned, true);
  const p = await stageOf(pdfOf([cover]), 'a.pdf');
  assert.equal(p.items[0].scanned, false, 'no OCR button for it');
});

test('gap 4: the OCR gate and the lease reader use the same rule', async () => {
  const { hasNoTextLayer } = await import('../app/ocrpdf.js');
  const { needsOcr } = await import('../app/leaseread.js');
  assert.equal(hasNoTextLayer([COVER.join('\n')]), false);
  assert.equal(hasNoTextLayer(['Page 1 of 1']), true);
  assert.equal(needsOcr(COVER.join('\n')), false);
  assert.equal(needsOcr('Page 1 of 1'), true);
});

/* ---- 3: an appraisal or a broker opinion of value with a titled rent roll page */

const APPRAISAL = () => prose(['Appraisal Report', 'Uniform Standards of Professional Appraisal Practice (USPAP)', 'Market value as of 10/01/2026', 'Highest and best use is the existing use. Sales comparison approach and income capitalization approach were developed.', ...Array.from({ length: 10 }, (_, i) => `Invented appraisal narrative sentence ${i + 1}, written only for a test.`)]);
const BOV = () => prose(['Broker Opinion of Value', 'Prepared for the owner of the invented plaza.', ...Array.from({ length: 12 }, (_, i) => `Invented opinion narrative sentence ${i + 1}, written only for a test.`)]);

test('gap 3: an appraisal with a titled rent roll on page 2 is asked as an appraisal, with no reader, and its roll page is offered apart', async () => {
  const v = await verdictOf(pdfOf([APPRAISAL(), rollPage({ title: true })]), 'a.pdf');
  assert.equal(v.type, null); assert.equal(v.reader, null); assert.equal(v.typeBy, null);
  assert.deepEqual(v.ask, ['appraisal']);
  assert.match(v.why, /appraisal/);
  assert.deepEqual(v.parts, [{ type: 'rentroll', reader: 'rrpdf', pages: [2, 2] }]);
  const p = await stageOf(pdfOf([APPRAISAL(), rollPage({ title: true })]), 'a.pdf');
  const [whole, roll] = p.items;
  assert.equal(whole.type, null); assert.equal(whole.confidence, 'Not sure'); assert.deepEqual(whole.ask, ['appraisal']);
  assert.match(whole.reason, /appraisal/);
  assert.equal(roll.type, 'rentroll'); assert.deepEqual(roll.span, [2, 2]);
  assert.match(roll.reason, /Page 2 read as rent roll, apart from the rest of the file/);
  assert.equal(I.readyItems(p, null).length, 1, 'only the roll pages are ready, and only when the broker taps Use');
});

test('gap 3: a broker opinion of value with a rent roll page is asked, and a plain rent roll is still read', async () => {
  const v = await verdictOf(pdfOf([BOV(), rollPage({ title: true })]), 'a.pdf');
  assert.equal(v.type, null); assert.equal(v.reader, null);
  assert.ok(v.ask.includes('om') && v.ask.includes('appraisal'));
  assert.equal(v.parts.length, 1);
  const abbr = await verdictOf(pdfOf([prose(['BOV for the invented plaza', ...Array.from({ length: 12 }, (_, i) => `Invented narrative sentence ${i + 1}, written only for a test.`)]), rollPage({ title: true })]), 'c.pdf');
  assert.equal(abbr.type, null); assert.ok(abbr.ask.includes('om'));
  // the rent roll alone, and a rent roll whose first page names an appraisal only in passing, are as before
  const plain = await verdictOf(pdfOf([rollPage({ title: true })]), 'a.pdf');
  assert.equal(plain.type, 'rentroll'); assert.equal(plain.reader, 'rrpdf');
  const titledFirst = await verdictOf(pdfOf([[...rollPage({ title: true }), ...prose(['Appraisal Report', 'USPAP'], { y: 120 })], narrative('Notes')]), 'b.pdf');
  assert.equal(titledFirst.type, 'rentroll', 'a page that is itself a titled rent roll stays one');
});

/* ---- 1: a unit mix and a lease comparable table are not rent rolls */

const MIX_HEAD = ['Unit Type', '# Units', 'Avg SF', 'Avg Rent', 'Market Rent'];
const MIX_ROWS = [['Studio', 10, 450, 1100, 1200], ['1 Bed / 1 Bath', 24, 650, 1350, 1425], ['2 Bed / 2 Bath', 16, 900, 1700, 1800]];
const COMP_HEAD = ['Tenant', 'Property', 'Address', 'Size (SF)', 'Rate/SF', 'Term (months)', 'Commencement', 'Lease Type'];
const COMP_ROWS = [['Alder Foods', 'Sample Plaza', '1 Invented Way', 2400, 28.5, 60, '2025-03-01', 'NNN'], ['Birch Dental', 'Example Center', '9 Sample Rd', 1800, 31, 84, '2025-06-01', 'Modified Gross'], ['Cedar Fitness', 'Test Commons', '5 Fake St', 5200, 22, 120, '2024-11-01', 'NNN']];

test('gap 1: a unit mix workbook goes to the unit mix reader (it looks like one, asked to confirm), never the rent roll', async () => {
  for (const head of [MIX_HEAD, ['Floor Plan', 'Unit Count', 'Average SF', 'In-Place Rent', 'Market Rent']]) {
    const bytes = await book([head, ...MIX_ROWS]);
    const v = await verdictOf(bytes, 'a.xlsx');
    assert.equal(v.type, null); assert.equal(v.reader, null); assert.equal(v.typeBy, null);
    assert.equal(v.looks, 'unitMix'); assert.deepEqual(v.ask, ['unitMix']);
    const p = await stageOf(bytes, 'a.xlsx');
    assert.equal(p.items.length, 1);
    assert.equal(p.items[0].type, null, 'not typed by a reader: the broker confirms');
    assert.equal(p.items[0].confidence, 'Looks like');
    assert.ok(p.items[0].facts && p.items[0].facts.type === 'unitMix', 'the unit mix reader read it');
    assert.equal(I.readyItems(p, null).length, 0, 'nothing is ready to use until it is confirmed');
  }
});

test('gap 1: a lease comparable table is asked, with no reader and no rent roll Use, in a workbook, a CSV and a PDF', async () => {
  const csv = Buffer.from([COMP_HEAD, ...COMP_ROWS].map((r) => r.join(',')).join('\n'));
  const noAddress = [['Lease Comparables'], ['Tenant', 'Address', 'SF', 'Rent/SF', 'Term', 'Commencement Date', 'Lease Type'], ...COMP_ROWS.map((c) => [c[0], c[2], c[3], c[4], c[5], c[6], c[7]])];
  for (const [bytes, name] of [[await book([COMP_HEAD, ...COMP_ROWS]), 'a.xlsx'], [csv, 'b.csv'], [await book(noAddress), 'c.xlsx']]) {
    const v = await verdictOf(bytes, name);
    assert.equal(v.type, null, name); assert.equal(v.reader, null, name);
    assert.deepEqual(v.ask, [], name);
    assert.equal(v.shape, 'leasecomp', name);
    assert.match(v.why, /lease comparables/);
    const p = await stageOf(bytes, name);
    assert.equal(p.items[0].type, null); assert.equal(p.items[0].use, null);
    assert.match(p.items[0].reason, /no importer for lease comparables/);
    assert.equal(I.readyItems(p, null).length, 0);
  }
  const { gridPage } = await import('./facts-fixtures.js');
  const pdf = pdfOf([[...gridPage('Lease Comparables', ['Tenant', 'Property', 'Size', 'Rate/SF', 'Term', 'Commencement', 'Lease Type'], COMP_ROWS.map((c) => [c[0], c[1], c[3], c[4], c[5], c[6], c[7]].map(String)), { widths: [80, 80, 50, 55, 40, 90, 100] }), ...prose(['Prepared for review. Figures are invented for a test only. As of 10/01/2026. Rents are annual.'], { y: 200 })]]);
  const pv = await verdictOf(pdf, 'd.pdf');
  assert.equal(pv.type, null); assert.equal(pv.reader, null); assert.equal(pv.shape, 'leasecomp');
  const { docKind } = await import('../app/rrdoc.js');
  const { pages, layouts } = await readPdf(pdf);
  assert.equal(docKind(pages, layouts).kind, 'unknown', 'the rent roll PDF import is not offered it as one either');
});

test('gap 1: a real rent roll with the same kind of columns is still read, and a rent roll beside a unit mix sheet is still routed', async () => {
  const roll = await book([['Suite', 'Tenant', 'SF', 'Monthly Rent', 'Lease End'], ['101', 'Alder Foods', 2400, 5700, '2028-12-31'], ['102', 'Birch Dental', 1800, 4650, '2027-06-30']]);
  const v = await verdictOf(roll, 'a.xlsx');
  assert.equal(v.type, 'rentroll'); assert.equal(v.reader, 'rrsheet');
  // a rent roll that also has a Property column and lease dates keeps its suite: not a comparable
  const withProperty = await book([['Property', 'Suite', 'Tenant', 'SF', 'Rent/SF', 'Term', 'Commencement', 'Lease Type', 'Annual Rent'], ['Sample Plaza', '101', 'Alder Foods', 2400, 28.5, 60, '2025-03-01', 'NNN', 68400], ['Sample Plaza', '102', 'Birch Dental', 1800, 31, 84, '2025-06-01', 'NNN', 55800]]);
  assert.equal((await verdictOf(withProperty, 'b.xlsx')).type, 'rentroll');
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of [['Roll', [['Suite', 'Tenant', 'SF', 'Monthly Rent', 'Lease End'], ['101', 'Alder Foods', 2400, 5700, '2028-12-31'], ['102', 'Birch Dental', 1800, 4650, '2027-06-30']]], ['Mix', [MIX_HEAD, ...MIX_ROWS]]]) { const ws = wb.addWorksheet(name); rows.forEach((r) => ws.addRow(r)); }
  const both = await verdictOf(Buffer.from(await wb.xlsx.writeBuffer()), 'c.xlsx');
  assert.equal(both.type, 'rentroll');
  assert.deepEqual(both.parts.find((x) => x.type === 'rentroll').sheets, ['Roll']);
});

/* ---- 2: a rent schedule by month is not an operating statement */

const MO = ['Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026', 'Nov 2026', 'Dec 2026'];
const SCHED = (head = ['Suite', 'Tenant']) => [[...head, ...MO], ['101', 'Alder Foods', ...MO.map(() => 5700)], ['102', 'Birch Dental', ...MO.map(() => 4650)], ['103', 'Cedar Fitness', ...MO.map(() => 9500)]];

test('gap 2: a rent schedule headed Suite and Tenant with twelve months is never a T-12: it is asked, with nothing added up', async () => {
  for (const rows of [SCHED(), SCHED(['Unit', 'Tenant']), SCHED(['Occupant']), [['Rent schedule 2026, monthly rent'], ...SCHED()], SCHED().map((r, i) => (i === 1 ? r.map((c, j) => (j === 6 ? null : c)) : r))]) {
    const bytes = await book(rows);
    const v = await verdictOf(bytes, 'a.xlsx');
    assert.notEqual(v.type, 't12'); assert.notEqual(v.reader, 't12');
    assert.equal(v.type, null); assert.equal(v.reader, null);
    assert.deepEqual(v.ask, ['rentroll']);
    assert.equal(v.shape, 'schedule');
    assert.match(v.why, /rent schedule by month/);
    const p = await stageOf(bytes, 'a.xlsx');
    assert.equal(p.items.length, 1);
    assert.equal(p.items[0].type, null); assert.equal(p.items[0].use, null);
    assert.equal(I.readyItems(p, null).length, 0);
  }
});

test('gap 2: an operating statement with month columns is still a T-12, and a rent roll with a month charge column is still the one question', async () => {
  const stmt = await book([['Line', ...MO, 'Total'], ['Rental income', ...MO.map(() => 10000), 120000], ['Other income', ...MO.map(() => 500), 6000], ['Real estate taxes', ...MO.map(() => 1500), 18000], ['Insurance', ...MO.map(() => 400), 4800], ['Net operating income', ...MO.map(() => 8600), 103200]]);
  const v = await verdictOf(stmt, 'a.xlsx');
  assert.equal(v.type, 't12'); assert.equal(v.reader, 't12');
  const acct = await book([['Account', 'Description', ...MO.slice(0, 6)], ['4000', 'Rental income', ...MO.slice(0, 6).map(() => 10000)], ['4100', 'Other income', ...MO.slice(0, 6).map(() => 500)], ['5000', 'Real estate taxes', ...MO.slice(0, 6).map(() => 1500)], ['9000', 'Net operating income', ...MO.slice(0, 6).map(() => 9000)]]);
  assert.equal((await verdictOf(acct, 'b.xlsx')).type, 't12');
});

test('gap 1: the heading rules, one at a time', async () => {
  const { tableShape, isRentSchedule } = await import('../app/tableshape.js');
  assert.equal(tableShape(MIX_HEAD), 'unitmix');
  assert.equal(tableShape(COMP_HEAD), 'leasecomp');
  // a count of units beside a tenant, or beside lease dates, is a rent roll with a units column (a tenant with several units)
  assert.equal(tableShape(['Tenant', '# Units', 'SF', 'Monthly Rent']), null);
  assert.equal(tableShape(['Unit Type', '# Units', 'SF', 'Monthly Rent', 'Lease End']), null);
  // a unit number is what a rent roll has and neither shape does
  assert.equal(tableShape(['Suite', ...COMP_HEAD]), null);
  assert.equal(tableShape(['Unit', '# Units', 'Avg SF', 'Avg Rent']), null);
  // a comparable needs an address or property, a term or start date, and three of size, rate per SF, term, start and lease type
  assert.equal(tableShape(['Tenant', 'Size', 'Rate/SF', 'Term', 'Commencement', 'Lease Type']), null, 'no address or property');
  assert.equal(tableShape(['Tenant', 'Address', 'Size', 'Rate/SF', 'Lease Type']), null, 'no term or start date');
  assert.equal(tableShape(['Tenant', 'Address', 'Size', 'Term']), null, 'only two of the five');
  assert.equal(tableShape(['Tenant', 'Address', 'Size', 'Rate/SF', 'Term']), 'leasecomp');
  // the schedule test reads the month row's other headings
  const months = [false, false, true, true, true];
  assert.equal(isRentSchedule(['Suite', 'Tenant', 'Jan', 'Feb', 'Mar'], months), true);
  assert.equal(isRentSchedule(['Line', 'Account', 'Jan', 'Feb', 'Mar'], months), false);
  assert.equal(isRentSchedule(['Tenant', null, 'Jan', 'Feb', 'Mar'], [false, false, true, true, true]), true);
});

test('gap 4: text OCR wrote, or a cover page beside a page with no text, does not turn a scan into text', async () => {
  const { pagesAreScan } = await import('../app/textlayer.js');
  assert.equal(pagesAreScan([COVER.join('\n')]), false);
  assert.equal(pagesAreScan([COVER.join('\n')], { ocr: true }), true, 'OCR text under 200 characters stays a scan (nothing is typed from it)');
  assert.equal(pagesAreScan([COVER.join('\n'), '', '']), true, 'a cover page and two picture pages is a scan');
  assert.equal(pagesAreScan([COVER.join('\n'), COVER.join('\n')]), false);
  // the intake passes what readPdf says: a result with `ocr` set is OCR text
  const cover = prose(COVER, { y: 700, size: 18 });
  const bytes = pdfOf([cover, cover]);
  const ocrRead = async (b) => ({ ...(await readPdf(b)), ocr: { read: [1, 2] } });
  const fromOcr = (await intake(file(bytes, 'a.pdf'), { ...deps, readPdf: ocrRead })).verdict;
  assert.equal(fromOcr.scanned, true);
  const plain = (await intake(file(bytes, 'a.pdf'), deps)).verdict;
  assert.equal(plain.scanned, false);
});

/* ---- review fixes */

test('review 1: real rent rolls with an expiration column, "Ste" or "Suite/Unit" are never lease comps or unit mixes', async () => {
  const { tableShape } = await import('../app/tableshape.js');
  for (const h of [
    ['Property', 'Ste', 'Tenant', 'SF', 'Rate/SF', 'Term', 'Commencement', 'Expiration'],
    ['Building', 'Tenant', 'SF', 'Rent PSF', 'Annual Rent', 'Commencement', 'Expiration'],
    ['Property', 'Suite/Unit', 'Tenant', 'SF', 'Rate/SF', 'Term', 'Commencement', 'Lease Type'],
    ['Building', 'Tenant', 'SF', 'Rate/SF', 'Term', 'Commencement', 'Lease Exp'],
    ['Building', 'Tenant', 'SF', 'Rate/SF', 'Term', 'Commencement', 'Exp.'],
    ['Building', 'Tenant', 'SF', 'Rate/SF', 'Term', 'Commencement', 'Expires'],
    ['Property', 'Ste', 'Tenant', 'SF', 'Rate/SF', 'Term', 'Commencement'],
    ['Units', 'SF', 'Rent', 'Exp.'], ['Units', 'Occupant', 'SF', 'Rent', 'Exp.'], ['Units', 'Tenant', 'SF', 'Monthly Rent'], ['Units', 'Occupant', 'SF', 'Rent', 'Lease Exp'],
  ]) assert.equal(tableShape(h), null, h.join('|'));
  const bytes = await book([['Property', 'Ste', 'Tenant', 'SF', 'Rate/SF', 'Term', 'Commencement', 'Expiration'], ['Sample Plaza', '101', 'Alder Foods', 2400, 28.5, 60, '2025-03-01', '2030-02-28'], ['Sample Plaza', '102', 'Birch Dental', 1800, 31, 84, '2025-06-01', '2032-05-31'], ['Sample Plaza', '103', 'Cedar Fitness', 5200, 22, 120, '2024-11-01', '2034-10-31']]);
  const v = await verdictOf(bytes, 'a.xlsx');
  assert.equal(v.shape, undefined); assert.equal(v.reader, 'rrsheet');
  // the PDF: a roll with a suite column is never a comp, whatever else its headings say
  const { gridPage } = await import('./facts-fixtures.js');
  const head = ['Property', 'Ste', 'Tenant', 'SF', 'Rate/SF', 'Term', 'Commencement'];
  const rows = COMP_ROWS.map((c, i) => ['Sample Plaza', String(101 + i), c[0], String(c[3]), String(c[4]), String(c[5]), c[6]]);
  const pdf = pdfOf([[...gridPage('Rent Roll', head, rows, { widths: [70, 30, 85, 45, 50, 40, 90], size: 7 }), ...prose(['As of 10/01/2026. Rents are annual.'], { y: 200 })]]);
  assert.notEqual((await verdictOf(pdf, 'b.pdf')).shape, 'leasecomp');
});

test('review 2: a unit mix summary above a rent roll does not hide the roll', async () => {
  const bytes = await book([['Unit Mix'], MIX_HEAD, ...MIX_ROWS, [], ['Rent Roll'], ['Suite', 'Tenant', 'SF', 'Monthly Rent', 'Lease End'], ['101', 'Alder Foods', 2400, 5700, '2028-12-31'], ['102', 'Birch Dental', 1800, 4650, '2027-06-30'], ['103', 'Cedar Fitness', 5200, 9500, '2030-10-31']]);
  const v = await verdictOf(bytes, 'a.xlsx');
  assert.equal(v.type, 'rentroll'); assert.equal(v.reader, 'rrsheet');
});

test('review 3: a scan with a stamp line on every page is still a scan; the OCR text of readScan is never real text', async () => {
  const { pagesAreScan } = await import('../app/textlayer.js');
  const fax = (n) => `FAX 555-0100 Page ${n} of 3\nFrom: Invented Co`;
  assert.equal(pagesAreScan([fax(1), fax(2), fax(3)]), true);
  assert.equal(pagesAreScan([fax(1), COVER.join('\n'), fax(3)]), true, 'one real page does not make the rest text');
  const stamp = (n) => prose([`Envelope ID ${n} 1111 2222`, 'Page of Docs'], { y: 20, size: 6 });
  const v = await verdictOf(pdfOf([stamp(1), stamp(2), stamp(3)]), 'a.pdf');
  assert.equal(v.scanned, true);
  // readScan: OCR text that reads like a cover page does not decide what the file is
  const p = I.newPlan();
  const item = I.stage(p, { name: 'a.pdf', kind: 'pdf', size: 1, verdict: { scanned: true, ask: [] }, bytes: new Uint8Array(3) }, {});
  assert.equal(item.scanned, true);
  const r = await I.readScan(p, item.id, async () => 'Offering Memorandum\nExecutive Summary\nAsking Price $5,000,000 Cap Rate 6.5%');
  assert.equal(r.ok, true);
  assert.equal(item.type, null, 'nothing is typed from OCR text');
  assert.equal(item.confidence, 'Not sure', 'a few OCR words that read like an OM are not offered as one: OCR text under 200 characters stays a scan');
});

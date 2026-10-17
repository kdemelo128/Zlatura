/* A rent roll PDF as its own document (queue item d): what a PDF is, from its content, and the Data QC record it
 * gets. All invented. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docKind, layoutChecks, pdfRollRecord } from '../app/rrdoc.js';
import { fromOmRows } from '../app/lease.js';
import { tbl, C9, R } from './rr-fixtures.js';

const rows = [
  R('101', 'Maple Leaf Bakery', '2,000', '01/01/2021', '12/31/2030', '$60,000', '$30.00', '$5,000', '3%'),
  R('102', 'Quillfeather Books', '1,500', '06/01/2022', '05/31/2027', '$42,000', '$28.00', '$3,500', '3%'),
  R('103', 'Copperline Yoga', '1,200', '03/01/2023', '02/28/2033', '$36,000', '$30.00', '$3,000', '3%'),
];
const total = R('', 'Total', '4,700', '', '', '$138,000', '', '', '');
const table = tbl(C9, [...rows, total]);
const filler = 'The property is a small neighbourhood retail centre with steady foot traffic, two arterial roads nearby and a mix of local tenants on staggered leases.';

test('a titled rent roll is a rent roll, with the reason in words', () => {
  const d = docKind([`Rent Roll\nAs of: 10/01/2026\n\n${table}\n\n${filler}`]);
  assert.equal(d.kind, 'rentroll');
  assert.equal(d.roll.rows.length, 3);
  assert.match(d.why[0], /rent roll table of 3 rows, titled as one/);
});

test('a rent roll with an “As of” date but no title is a rent roll', () => {
  const d = docKind([`Property schedule\nAs of: 10/01/2026\n\n${table}\n\n${filler}`]);
  assert.equal(d.kind, 'rentroll');
  assert.match(d.why[0], /“As of” date/);
});

test('a table with no title and no date is unknown, and the table is kept so the broker can choose to read it', () => {
  const d = docKind([`Schedule\n\n${table}\n\n${filler}`]);
  assert.equal(d.kind, 'unknown');
  assert.ok(d.roll && d.roll.rows.length === 3);
});

test('an offering memorandum is named, even with a rent roll in it', () => {
  const d = docKind([`Offering Memorandum\nAsking Price $3,000,000   Cap Rate 6.1%\n\n${filler}`, `Rent Roll\nAs of: 10/01/2026\n\n${table}`]);
  assert.equal(d.kind, 'om');
  assert.match(d.why[0], /offering memorandum/);
});

test('an operating statement is named', () => {
  const months = 'Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec  Total';
  const d = docKind([`Income Statement\n${months}\n  Base Rent   5,000 5,000 5,000 5,000 5,000 5,000 5,000 5,000 5,000 5,000 5,000 5,000 60,000\n${filler}`]);
  assert.equal(d.kind, 't12');
});

test('a PDF with no text is scanned', () => {
  assert.equal(docKind(['', '  ']).kind, 'scanned');
  assert.equal(docKind(['page 1']).kind, 'scanned');
});

test('the record has no OM figures to check against: the roll is never compared with itself', () => {
  const d = docKind([`Rent Roll\nAs of: 10/01/2026\n\n${table}\n\n${filler}`]);
  const { qc, rows: used, held } = pdfRollRecord(d, { asOf: '2026-10-17', file: 'dd-rent-roll.pdf' });
  assert.equal(held, false);
  assert.equal(used.length, 3);
  assert.equal(qc.file, 'dd-rent-roll.pdf');
  for (const k of ['bsf', 'occ', 'rent', 'gpr', 'units']) assert.ok(!qc.checks.some((c) => c.kind === k), `no ${k} check`);
  assert.ok(qc.checks.some((c) => c.kind === 'total' && c.level === 'pass'), 'its own Total row is still checked');
});

/* a property manager’s report: Rent, Monthly Charges, Deposit, Lease From/To, Past Due */
const PM = [{ h: 'Unit', w: 5 }, { h: 'Tenant', w: 22 }, { h: 'Sqft', w: 6, r: 1 }, { h: 'Rent', w: 9, r: 1 }, { h: 'Monthly Charges', w: 15, r: 1 }, { h: 'Deposit', w: 9, r: 1 }, { h: 'Lease From', w: 10 }, { h: 'Lease To', w: 10 }, { h: 'Past Due', w: 8, r: 1 }];
const pmRows = [
  ['A1', 'Maple Leaf Bakery', '2,000', '5,000.00', '400.00', '5,000.00', '01/01/2021', '12/31/2030', '0.00'],
  ['A2', 'Quillfeather Books', '1,500', '3,500.00', '300.00', '3,500.00', '06/01/2022', '05/31/2027', '0.00'],
];
const pmText = `Rent roll with Monthly Charges\nAs of: 10/01/2026\n\n${tbl(PM, pmRows)}\n\n${filler}`;

test('a layout the reader does not know is not used until the broker looks: charges read as rent are a fail that holds the rows', () => {
  const d = docKind([pmText]);
  assert.equal(d.kind, 'rentroll');
  const checks = layoutChecks(d.roll);
  assert.ok(checks.length >= 1);
  assert.ok(checks.every((c) => c.level === 'fail' && c.kind === 'layout'));
  assert.ok(checks.some((c) => /Monthly Charges/.test(c.text)));
  const { qc, rows: used, held } = pdfRollRecord(d, { asOf: '2026-10-17', file: 'pm.pdf' });
  assert.equal(held, true);
  assert.equal(used.length, 0);
  assert.equal(qc.held.length, 2);
  assert.equal(qc.applied, false);
});

test('a clean rent roll has no layout check', () => {
  assert.deepEqual(layoutChecks(docKind([`Rent Roll\nAs of: 10/01/2026\n\n${table}\n\n${filler}`]).roll), []);
});


/* each layout rule on its own */
const only = (cols, rows) => docKind([`Rent roll\nAs of: 10/01/2026\n\n${tbl(cols, rows)}\n\n${filler}`]).roll;
const base = [{ h: 'Unit', w: 5 }, { h: 'Tenant', w: 22 }, { h: 'Sqft', w: 6, r: 1 }];
const two = (cells) => [['A1', 'Maple Leaf Bakery', '2,000', ...cells[0]], ['A2', 'Quillfeather Books', '1,500', ...cells[1]]];

test('layout rule: a rent-kind column headed charges or fees is not rent', () => {
  const roll = only([...base, { h: 'Monthly Charges', w: 15, r: 1 }], two([['400.00'], ['300.00']]));
  const c = layoutChecks(roll);
  assert.equal(c.length, 1);
  assert.match(c[0].text, /heading says charges or fees/);
});

test('layout rule: a second rent column beside a bare “Rent” column, saying nothing of rent itself, is asked about', () => {
  const roll = only([...base, { h: 'Rent', w: 9, r: 1 }, { h: 'Monthly', w: 9, r: 1 }], two([['60,000.00', '5,000.00'], ['42,000.00', '3,500.00']]));
  const c = layoutChecks(roll);
  assert.equal(c.length, 1);
  assert.match(c[0].text, /cannot tell which is the rent/);
});

test('layout rule: an unknown column headed like money means the layout is not recognised', () => {
  const roll = only([...base, { h: 'Annual Rent', w: 11, r: 1 }, { h: 'Past Due', w: 9, r: 1 }], two([['60,000.00', '0.00'], ['42,000.00', '0.00']]));
  const c = layoutChecks(roll);
  assert.equal(c.length, 1);
  assert.match(c[0].text, /“Past Due” column looks like money/);
});

test('layout rule: a Rent column with Rent/SF and Monthly Rent beside it is the normal case, no check', () => {
  const roll = only([...base, { h: 'Annual Rent', w: 11, r: 1 }, { h: 'Rent/SF', w: 8, r: 1 }, { h: 'Monthly Rent', w: 12, r: 1 }], two([['60,000.00', '30.00', '5,000.00'], ['42,000.00', '28.00', '3,500.00']]));
  assert.deepEqual(layoutChecks(roll), []);
});

/* the lease conversion */
test('leases from a rent roll PDF say so: kind pdf, the file name, the page and line, in the rent period’s note', () => {
  const d = docKind([`Rent Roll\nAs of: 10/01/2026\n\n${table}\n\n${filler}`]);
  const { rows: used } = pdfRollRecord(d, { asOf: '2026-10-17', file: 'dd-rent-roll.pdf' });
  const rr = fromOmRows(used, { asOf: '2026-10-17', kind: 'pdf', file: 'dd-rent-roll.pdf' });
  assert.equal(rr.leases.length, 3);
  const L = rr.leases[0];
  assert.equal(L.source.kind, 'pdf');
  assert.equal(L.source.file, 'dd-rent-roll.pdf');
  assert.equal(L.source.page, 1);
  assert.ok(L.source.line > 0);
  assert.match(L.periods[0].note, /^Rent roll PDF “dd-rent-roll\.pdf”, page 1$/);
  assert.equal(L.periods[0].rate, 60000);
});

test('the OM’s conversion is unchanged: kind om, no file', () => {
  const d = docKind([`Rent Roll\nAs of: 10/01/2026\n\n${table}\n\n${filler}`]);
  const { rows: used } = pdfRollRecord(d, { asOf: '2026-10-17', file: 'x.pdf' });
  const L = fromOmRows(used, { asOf: '2026-10-17', page: 4 }).leases[0];
  assert.equal(L.source.kind, 'om');
  assert.ok(!('file' in L.source));
  assert.match(L.periods[0].note, /^OM rent roll, page/);
});

test('a long file name is kept to 200 characters', () => {
  const d = docKind([`Rent Roll\nAs of: 10/01/2026\n\n${table}\n\n${filler}`]);
  const { rows: used } = pdfRollRecord(d, { asOf: '2026-10-17', file: 'x.pdf' });
  const L = fromOmRows(used, { asOf: '2026-10-17', kind: 'pdf', file: 'f'.repeat(500) + '.pdf' }).leases[0];
  assert.equal(L.source.file.length, 200);
});

/* the same through real PDFs, read by pdf.js as the app reads them */
import { PDF_SPECS, pdfOf } from './rr-fixtures.js';
const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;
const { pdfPages } = await import('../app/pdftext.js');
const read = async (name) => { const layouts = []; const pages = await pdfPages(pdfjs, pdfOf(PDF_SPECS[name]()), { layouts, verbosity: 0 }); return docKind(pages, layouts); };

test('PDF: a due-diligence rent roll is a rent roll of six rows, clean', async () => {
  const d = await read('rr-dd');
  assert.equal(d.kind, 'rentroll');
  assert.equal(d.roll.rows.length, 6);
  const { qc, rows: used, held } = pdfRollRecord(d, { asOf: '2026-10-17', file: 'rr-dd.pdf' });
  assert.equal(held, false);
  assert.equal(used.length, 6);
  assert.deepEqual(used.filter((r) => !r.vacant).map((r) => r.annual), [60000, 42000, 36000, 32000, 45000]);
  assert.equal(qc.checks.filter((c) => c.level === 'fail').length, 0);
});

test('PDF: a property manager’s report is a rent roll the reader does not know, so it is held', async () => {
  const d = await read('rr-pm');
  assert.equal(d.kind, 'rentroll');
  const { qc, held } = pdfRollRecord(d, { asOf: '2026-10-17', file: 'rr-pm.pdf' });
  assert.equal(held, true);
  assert.ok(qc.checks.some((c) => c.kind === 'layout' && /Monthly Charges/.test(c.text)));
});

test('PDF: an operating statement is named, and a scan is a scan', async () => {
  assert.equal((await read('stmt-doc')).kind, 't12');
  assert.equal((await read('rr-scan')).kind, 'scanned');
});

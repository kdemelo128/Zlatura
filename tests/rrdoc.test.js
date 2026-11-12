/* A rent roll PDF as its own document (queue item d): what a PDF is, from its content, and the Data QC record it
 * gets. All invented. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docKind, layoutChecks, pdfRollRecord } from '../app/rrdoc.js';
import { fromOmRows } from '../app/lease.js';
import { blockingChecks, resolveCheck } from '../app/dataqc.js';
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

const scopeDoc = (meta = '', options = {}) => docKind([`Rent roll\nAs of: 10/01/2026\n${meta}\n${tbl(PM, options.rows || pmRows)}\n${options.after || filler}`]);
const scopeRecord = (doc) => pdfRollRecord(doc, { asOf: '2026-10-17', file: 'invented-pm.pdf' });
const coverage = (record) => record.qc.checks.filter((c) => c.id === 'layout:report-scope');

test('PM report filters marked All do not hold a complete report, including multiple metadata fields on one line', () => {
  for (const meta of ['Unit Filter: All\nStatus Filter: All', 'Property Filter: Example only\nUnit Filter: All units', 'Unit Filter: All  Status Filter: All', 'Unit Filter: Any\nResident Filter: Not applied']) {
    const record = scopeRecord(scopeDoc(meta));
    assert.equal(coverage(record).length, 0, meta); assert.equal(record.held, false, meta); assert.equal(record.rows.length, 2);
  }
});
test('an active status filter is caught after an All unit filter and keeps the source rows held', () => {
  for (const meta of ['Unit Filter: All\nStatus Filter: Occupied', 'Unit Filter: All  Status Filter: Occupied']) {
    const record = scopeRecord(scopeDoc(meta));
    assert.equal(record.held, true); assert.deepEqual(record.rows, []); assert.equal(record.qc.held.length, 2);
    assert.equal(coverage(record).length, 1); assert.equal(blockingChecks(record.qc).some((c) => c.id === 'layout:report-scope'), true);
    assert.match(coverage(record)[0].lineText, /Status Filter: Occupied/); assert.equal(coverage(record)[0].page, 1);
    assert.deepEqual(record.qc.held.map((r) => r.annual), [60000, 42000]);
  }
});
test('selected unit/resident filters and unknown or blank filter syntax require coverage review', () => {
  for (const meta of ['Unit Filter: A1', 'Resident Filter: Selected', 'Occupancy Filter: Vacant only', 'Status Filter: Not understood', 'Unit Filter: ']) {
    const record = scopeRecord(scopeDoc(meta)); assert.equal(record.held, true, meta); assert.equal(coverage(record).length, 1, meta);
  }
});
test('explicit report subset notices, including a wrapped notice, require review', () => {
  for (const meta of ['This report lists only a subset of units.', 'This report lists only a subset\nof units.', 'Report scope: Occupied units only', 'This rent roll includes selected residents only.']) {
    const record = scopeRecord(scopeDoc(meta)); assert.equal(record.held, true, meta); assert.match(coverage(record)[0].text, /coverage needs review/);
  }
});
test('tenant names, subtotal captions and explanatory or marketing prose are not report metadata', () => {
  for (const meta of ['Occupied units only subtotal', 'This report includes occupied units only as a subtotal.', 'Marketing mentions selected units only for this example.', 'The Unit Filter: Occupied is an example in the help text.']) {
    const record = scopeRecord(scopeDoc(meta, { after: `${filler}\nOccupied units only subtotal\nExample: this report lists only a subset of units.` }));
    assert.equal(coverage(record).length, 0, meta); assert.equal(record.held, false, meta);
  }
  const record = scopeRecord(scopeDoc('', { rows: pmRows.map((r, i) => [r[0], i ? r[1] : 'Unit Filter: Occupied', ...r.slice(2)]) }));
  assert.equal(coverage(record).length, 0); assert.equal(record.held, false);
});
test('an explicit report subset notice in a footer remains a failed coverage check', () => {
  const record = scopeRecord(scopeDoc('', { after: `${filler}\nThis report lists only a subset of units.` }));
  assert.equal(record.held, true); assert.equal(coverage(record).length, 1);
});
test('an active filter on a later row-bearing page is not missed', () => {
  const doc = docKind([pmText, `Rent roll continued\nUnit Filter: All\nStatus Filter: Occupied\n${tbl(PM, pmRows.map((r, i) => [`B${i + 1}`, ...r.slice(1)]))}\n${filler}`]);
  const record = scopeRecord(doc); assert.equal(record.held, true); assert.equal(coverage(record)[0].page, 2); assert.equal(coverage(record)[0].line, 3);
});
test('a preceding report cover page with an active filter is checked', () => {
  const record = scopeRecord(docKind([`Rent roll report\nResident Filter: Selected\n${filler}`, pmText]));
  assert.equal(record.held, true); assert.equal(coverage(record)[0].page, 1);
});
test('acceptance belongs to one preview; rebuilding the same document stays held', () => {
  const doc = scopeDoc('Status Filter: Occupied'); const first = scopeRecord(doc);
  resolveCheck(first.qc, 'layout:report-scope', 'accepted', 1);
  assert.equal(blockingChecks(first.qc).some((c) => c.id === 'layout:report-scope'), false);
  assert.equal(doc.scopeChecks[0].resolved, undefined);
  const second = scopeRecord(doc); assert.equal(second.held, true); assert.equal(blockingChecks(second.qc).some((c) => c.id === 'layout:report-scope'), true);
});
test('an untitled table still asks what it is, and coverage remains held if the broker chooses it', () => {
  const doc = docKind([`Schedule\nUnit Filter: A1\n${tbl(PM, pmRows)}\n${filler}`]);
  assert.equal(doc.kind, 'unknown'); assert.equal(scopeRecord(doc).held, true);
});
test('choosing to read an OM- or statement-labelled table as a roll does not accept its coverage', () => {
  for (const [title, kind] of [['Offering Memorandum\nAsking Price $3,000,000 - Cap Rate 6.1%', 'om'], ['Operating Statement', 't12']]) {
    const doc = docKind([`${title}\nStatus Filter: Occupied\n${tbl(PM, pmRows)}\n${filler}`]);
    assert.equal(doc.kind, kind); assert.ok(doc.roll); assert.equal(scopeRecord(doc).held, true);
  }
});

const RC = [{ h: 'Unit', w: 5 }, { h: 'Tenant', w: 22 }, { h: 'Sqft', w: 6, r: 1 }, { h: 'Rent & Charges', w: 15, r: 1 }];
const rcRows = [['A1', 'Maple Leaf Bakery', '2,000', '5,400.00'], ['A2', 'Quillfeather Books', '1,500', '3,800.00']];

test('a layout the reader does not know is not used until the broker looks: one column of rent and charges together is a fail that holds the rows, rent kept as read', () => {
  const d = docKind([`Rent roll\nAs of: 10/01/2026\n\n${tbl(RC, rcRows)}\n\n${filler}`]);
  assert.equal(d.kind, 'rentroll');
  const checks = layoutChecks(d.roll);
  assert.equal(checks.length, 1);
  assert.ok(checks.every((c) => c.level === 'fail' && c.kind === 'layout'));
  assert.match(checks[0].text, /Rent & Charges/);
  const { qc, rows: used, held } = pdfRollRecord(d, { asOf: '2026-10-17', file: 'pm.pdf' });
  assert.equal(held, true);
  assert.equal(used.length, 0);
  assert.equal(qc.held.length, 2);
  assert.deepEqual(qc.held.map((r) => r.monthly), [5400, 3800]);
  assert.equal(qc.applied, false);
});

test('a charges column is a recovery, whatever the money words around it', async () => {
  const { kindScores } = await import('../app/omroll.js');
  for (const h of ['Monthly Charges', 'Fees', 'Current Charges', 'Monthly Fees']) {
    const s = kindScores(h);
    assert.ok(s.recov > 0, h);
    assert.ok(!['annual', 'monthly', 'rent', 'psf', 'mpsf'].some((k) => k in s), `${h} is not a rent kind`);
  }
  assert.ok('rent' in kindScores('Rent & Charges') || 'monthly' in kindScores('Monthly Rent & Charges'));
});

test('two rent columns that read the same way and differ are a fail naming both; the same figures twice are only noted', () => {
  const head = [...base, { h: 'Rent', w: 9, r: 1 }, { h: 'Monthly Rent', w: 12, r: 1 }];
  const differ = docKind([`Rent roll\nAs of: 10/01/2026\n\n${tbl(head, two([['5,000.00', '4,000.00'], ['3,500.00', '3,000.00']]))}\n\n${filler}`]);
  const f = differ.roll.issues.filter((i) => i.kind === 'compete');
  assert.equal(f.length, 1);
  assert.equal(f[0].level, 'fail');
  assert.match(f[0].text, /“Rent” and “Monthly Rent”|“Monthly Rent” and “Rent”/);
  assert.equal(pdfRollRecord(differ, { asOf: '2026-10-17', file: 'x.pdf' }).held, true);
  assert.equal(layoutChecks(differ.roll).filter((c) => /cannot tell which is the rent/.test(c.text)).length, 0, 'one problem, one fail');
  const same = docKind([`Rent roll\nAs of: 10/01/2026\n\n${tbl(head, two([['5,000.00', '5,000.00'], ['3,500.00', '3,500.00']]))}\n\n${filler}`]);
  assert.ok(same.roll.issues.filter((i) => i.kind === 'compete').every((i) => i.level === 'info'));
});

test('a clean rent roll has no layout check', () => {
  assert.deepEqual(layoutChecks(docKind([`Rent Roll\nAs of: 10/01/2026\n\n${table}\n\n${filler}`]).roll), []);
});


/* each layout rule on its own */
const only = (cols, rows) => docKind([`Rent roll\nAs of: 10/01/2026\n\n${tbl(cols, rows)}\n\n${filler}`]).roll;
const base = [{ h: 'Unit', w: 5 }, { h: 'Tenant', w: 22 }, { h: 'Sqft', w: 6, r: 1 }];
const two = (cells) => [['A1', 'Maple Leaf Bakery', '2,000', ...cells[0]], ['A2', 'Quillfeather Books', '1,500', ...cells[1]]];

test('layout rule: a rent-kind column headed charges or fees is not rent', () => {
  const roll = only([...base, { h: 'Rent & Charges', w: 15, r: 1 }], two([['5,400.00'], ['3,800.00']]));
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
  const roll = only([...base, { h: 'Annual Rent', w: 11, r: 1 }, { h: 'Amount Due', w: 11, r: 1 }], two([['60,000.00', '0.00'], ['42,000.00', '0.00']]));
  const c = layoutChecks(roll);
  assert.equal(c.length, 1);
  assert.equal(c[0].level, 'fail');
  assert.match(c[0].text, /“Amount Due” column looks like money/);
});

test('layout rule: a Past Due or balance column is known not to be rent: noted, never a fail', () => {
  const roll = only([...base, { h: 'Annual Rent', w: 11, r: 1 }, { h: 'Past Due', w: 9, r: 1 }], two([['60,000.00', '0.00'], ['42,000.00', '0.00']]));
  const c = layoutChecks(roll);
  assert.equal(c.length, 1);
  assert.equal(c[0].level, 'info');
  assert.match(c[0].text, /“Past Due” column is a balance/);
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
import { pmCoveragePdf } from './pmcoverage-fixtures.js';
const read = async (name) => { const layouts = []; const pages = await pdfPages(pdfjs, pdfOf(PDF_SPECS[name]()), { layouts, verbosity: 0 }); return docKind(pages, layouts); };

test('a real positioned PDF preserves the filter check and holds the independently expected rent totals', async () => {
  for (const filtered of [false, true]) {
    const layouts = []; const pages = await pdfPages(pdfjs, pmCoveragePdf(filtered), { layouts, verbosity: 0 });
    const record = scopeRecord(docKind(pages, layouts));
    assert.equal(record.held, filtered); assert.equal(coverage(record).length, filtered ? 1 : 0);
    const rows = filtered ? record.qc.held : record.rows;
    assert.deepEqual(rows.map((r) => r.annual), filtered ? [60000, 42000] : [60000, 42000, 36000]);
    if (filtered) assert.match(coverage(record)[0].lineText, /Unit Filter: All.*Status Filter: Occupied/);
  }
});
test('a wrapped first-tenant cell above its numeric anchor is body text, not filter metadata', async () => {
  for (const name of ['Unit Filter: Occupied', 'This report lists only a subset of units.']) {
    const layouts = []; const pages = await pdfPages(pdfjs, pmCoveragePdf(false, { tenantAbove: name }), { layouts, verbosity: 0 });
    const doc = docKind(pages, layouts); const record = scopeRecord(doc);
    assert.equal(doc.roll.rows.length, 3); assert.equal(doc.roll.rows[0].tenant, name);
    assert.equal(record.held, false, name); assert.equal(coverage(record).length, 0, name);
  }
});

test('a tenant continuation below an occupied anchor is body text, not a subset notice', async () => {
  const notice = 'This report lists only a subset of units.';
  const layouts = []; const pages = await pdfPages(pdfjs, pmCoveragePdf(false, { tenantBelow: notice }), { layouts, verbosity: 0 });
  const doc = docKind(pages, layouts); const record = scopeRecord(doc);
  assert.equal(doc.roll.rows.length, 3);
  assert.equal(doc.roll.rows[0].tenant, `Maple Leaf Bakery ${notice}`);
  assert.equal(record.held, false); assert.equal(coverage(record).length, 0);
});

test('separate charges and zero market rent never replace missing or explicit monthly base rent', () => {
  const cols = [{ h: 'Unit', w: 6 }, { h: 'Resident', w: 23 }, { h: 'Status', w: 10 }, { h: 'Sqft', w: 7, r: 1 }, { h: 'Market Rent', w: 13, r: 1 }, { h: 'Monthly Base Rent', w: 19, r: 1 }, { h: 'Monthly Charges', w: 17, r: 1 }, { h: 'Lease From', w: 12 }, { h: 'Lease To', w: 12 }, { h: 'Past Due', w: 11, r: 1 }];
  const rows = [['101', 'Invented Household', 'Occupied', '800', '0.00', '1,200.00', '125.00', '01/01/2025', 'MTM', '0.00'], ['102', 'Example Resident', 'Occupied', '900', '0.00', '1,300.00', '150.00', '02/01/2025', '01/31/2027', '15.00']];
  const pages = (data) => [`Rent Roll\nAs of: 10/01/2026\n${tbl(cols, data)}`, 'Rent Roll Summary\nUnit Type    Number of Units    Average Rent\nOne bedroom    2    1,250.00'];
  const record = scopeRecord(docKind(pages(rows)));
  assert.equal(record.held, false); assert.equal(record.rows.length, 2);
  assert.deepEqual(record.rows.map((r) => r.annual), [14400, 15600]);
  const missing = docKind(pages(rows.map((r) => [...r.slice(0, 5), '', ...r.slice(6)])));
  assert.equal(missing.roll.rows.length, 2);
  assert.ok(missing.roll.rows.every((r) => r.annual == null && r.monthly == null));
  const final = scopeRecord(missing); const finalRows = final.rows.length ? final.rows : final.qc.held || [];
  assert.equal(finalRows.length, 2); assert.deepEqual(finalRows.map((r) => r.suite), ['101', '102']);
  assert.ok(finalRows.every((r) => r.annual == null && r.monthly == null));
});

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

test('PDF: a property manager’s report reads its Rent column; Monthly Charges is not rent and Past Due is not used', async () => {
  const d = await read('rr-pm');
  assert.equal(d.kind, 'rentroll');
  const mc = d.roll.columns.find((c) => /Monthly Charges/.test(c.label));
  assert.equal(mc.kind, 'recov');
  const { qc, rows: used, held } = pdfRollRecord(d, { asOf: '2026-10-17', file: 'rr-pm.pdf' });
  assert.equal(held, false);
  assert.deepEqual(used.map((r) => r.monthly), [5000, 3500, 3000]);
  assert.deepEqual(used.map((r) => r.annual), [60000, 42000, 36000]);
  assert.equal(qc.checks.filter((c) => c.level === 'fail').length, 0);
  assert.ok(qc.checks.some((c) => c.kind === 'layout' && c.level === 'info' && /Past Due/.test(c.text)));
});

test('PDF: a report with rent and charges printed as one figure is held, with its rent kept as read', async () => {
  const d = await read('rr-pm-combined');
  const { qc, held } = pdfRollRecord(d, { asOf: '2026-10-17', file: 'x.pdf' });
  assert.equal(held, true);
  assert.ok(qc.checks.some((c) => c.kind === 'layout' && c.level === 'fail' && /Rent & Charges/.test(c.text)));
  assert.deepEqual(qc.held.map((r) => r.monthly), [5400, 3800, 3250]);
});

test('PDF: a "4 Units" subtotal and a Total are not rows; the four leases are counted once', async () => {
  const d = await read('rr-pm-sub');
  assert.equal(d.kind, 'rentroll');
  assert.equal(d.roll.rows.length, 4);
  assert.equal(d.roll.rows.reduce((n, r) => n + r.sf, 0), 5700);
  assert.equal(d.roll.issues.filter((i) => i.kind === 'total' && i.level === 'fail').length, 0);
  assert.equal(pdfRollRecord(d, { asOf: '2026-10-17', file: 'x.pdf' }).held, false);
});

test('a tenant named "4 Units" whose figures do not add up is a row, with a warning', () => {
  const rows = [['A1', 'Maple Leaf Bakery', '2,000', '5,000.00'], ['A2', '4 Units', '1,500', '3,500.00']];
  const roll = docKind([`Rent roll\nAs of: 10/01/2026\n\n${tbl([...base, { h: 'Monthly Rent', w: 14, r: 1 }], rows)}\n\n${filler}`]).roll;
  assert.equal(roll.rows.length, 2);
  assert.equal(roll.rows[1].tenant, '4 Units');
  assert.ok(roll.issues.some((i) => i.kind === 'unitlabel' && i.level === 'warn'));
});

test('a unit count that disagrees with the rows it covers is a fail', () => {
  const rows = [['A1', 'Maple Leaf Bakery', '2,000', '5,000.00'], ['A2', 'Quillfeather Books', '1,500', '3,500.00'], ['', '3 Units', '3,500', '8,500.00']];
  const roll = docKind([`Rent roll\nAs of: 10/01/2026\n\n${tbl([...base, { h: 'Monthly Rent', w: 14, r: 1 }], rows)}\n\n${filler}`]).roll;
  assert.equal(roll.rows.length, 2);
  assert.ok(roll.issues.some((i) => i.kind === 'total' && i.field === 'units' && i.level === 'fail'));
});

test('PDF: a lease-to year printed on the next line is joined to its date, and is not a row', async () => {
  const d = await read('rr-pm-wrap');
  assert.equal(d.roll.rows.length, 3);
  assert.equal(d.roll.rows[0].end.toISOString().slice(0, 10), '2030-12-31');
  assert.ok(d.roll.rows[0].why.some((w) => /two lines/.test(w)));
  assert.equal(d.roll.issues.filter((i) => i.level === 'fail').length, 0);
});

test('PDF: a split year that would end the lease before it starts is refused with a failed check, not joined', async () => {
  const d = await read('rr-pm-wrap-backwards');
  assert.equal(d.roll.rows.length, 3);
  assert.equal(d.roll.rows[0].end, null);
  assert.ok(d.roll.issues.some((i) => i.kind === 'split' && i.level === 'fail'));
  assert.equal(pdfRollRecord(d, { asOf: '2026-10-17', file: 'x.pdf' }).held, true);
});

test('a "4 Units" line with no figures is a wall, never glued onto the next tenant’s name', () => {
  const rows = [['A1', 'Maple Leaf Bakery', '2,000', '5,000.00'], ['', '4 Units', '', ''], ['A2', 'Quillfeather Books', '1,500', '3,500.00']];
  const roll = docKind([`Rent roll\nAs of: 10/01/2026\n\n${tbl([...base, { h: 'Monthly Rent', w: 14, r: 1 }], rows)}\n\n${filler}`]).roll;
  assert.deepEqual(roll.rows.map((r) => r.tenant), ['Maple Leaf Bakery', 'Quillfeather Books']);
});

test('PDF: a lone year that lines up with Past Due, not Lease To, is not joined to a date', async () => {
  const d = await read('rr-pm-wrap-elsewhere');
  assert.equal(d.roll.rows[0].end, null);
  assert.ok(!d.roll.rows[0].why.some((w) => /two lines, and the lines were joined/.test(w)));
});

test('PDF: an operating statement is named, and a scan is a scan', async () => {
  assert.equal((await read('stmt-doc')).kind, 't12');
  assert.equal((await read('rr-scan')).kind, 'scanned');
});

test('the Excel export labels a lease read from a rent roll PDF with the file, never "entered by hand"', async () => {
  const ExcelJS = (await import('exceljs')).default;
  await import('../app/workbook.js');
  const { addRentRollTabs } = await import('../app/rrbook.js');
  const rr = fromOmRows(d0rows(), { kind: 'pdf', file: 'sample-roll.pdf' });
  const wb = new ExcelJS.Workbook();
  addRentRollTabs(wb, { figures: {} }, rr);
  const labels = [];
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => { if (typeof c.value === 'string') labels.push(c.value); })));
  assert.ok(labels.some((t) => /rent roll PDF \(sample-roll\.pdf/.test(t)), labels.filter((t) => /PDF|hand/.test(t)).join(' | '));
  assert.ok(!labels.includes('entered by hand'));
});
function d0rows() {
  return docKind([`Rent Roll\nAs of: 10/01/2026\n\n${table}`]).roll.rows;
}

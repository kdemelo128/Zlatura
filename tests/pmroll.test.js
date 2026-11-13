/* A property manager's rent roll PDF, read as its own document: only a base or contract rent column fills rent, a filtered
 * report is held, an untitled table needs the broker's say-so, a period the page does not state is asked, and a summary
 * page adds no rows. Every name and figure is invented (tests/pmroll-fixtures.js); the cents are worked by hand. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docKind, pdfRollRecord, layoutChecks, filterNotes, reapplyAccepted } from '../app/rrdoc.js';
import { tbl } from './rr-fixtures.js';
import { fromOmRows } from '../app/lease.js';
import { pmText, PM_ROWS, PM_ANNUAL } from './pmroll-fixtures.js';

const record = (o, ro = {}) => { const doc = docKind(pmText(o)); return { doc, ...pdfRollRecord(doc, { asOf: '2026-10-01', file: 'pm.pdf', ...ro }) }; };
const OMCOLS = [{ h: 'Suite', w: 5 }, { h: 'Tenant', w: 22 }, { h: 'SF', w: 6, r: 1 }, { h: 'Lease End', w: 11 }, { h: 'Rent/SF', w: 8, r: 1 }];
const used = (r) => (r.rows.length ? r.rows : r.qc.held || []);
const fails = (r) => r.qc.checks.filter((c) => c.level === 'fail');

test('a clean property-manager report: six units, wrapped name joined, MTM and vacant marked, rent only from the base rent column', () => {
  const r = record();
  assert.equal(r.doc.kind, 'rentroll');
  assert.equal(r.held, false);
  const rows = used(r);
  assert.deepEqual(rows.map((x) => x.suite), ['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
  assert.equal(rows[1].tenant, 'Northgate Family Dentistry, PC');
  assert.equal(rows[1].sf, 1500);
  assert.equal(rows[2].vacant, true);
  assert.equal(rows[5].mtm, true);
  // hand-worked: monthly base rent x 12
  assert.deepEqual(rows.map((x) => x.annual), Object.values(PM_ANNUAL));
  assert.equal(rows.reduce((a, x) => a + (x.annual || 0), 0), 160500);   // 5,000 + 3,500 + 3,000 + 1,875 = 13,375 a month
  assert.equal(13375 * 12, 160500);
  assert.equal(fails(r).length, 0);
});

test('market rent and charges never stand in for a missing base rent; a zero market rent is not a zero contract rent', () => {
  const rows = used(record());
  const byUnit = Object.fromEntries(rows.map((x) => [x.suite, x]));
  assert.equal(byUnit.B2.annual, null, 'B2 prints charges of 200.00 and market 0.00, and no base rent: blank, not 2,400 and not 0');
  assert.equal(byUnit.B2.monthly, null);
  assert.equal(byUnit.A3.annual, null, 'a vacant unit’s market rent (1,800.00) is not its rent');
  assert.equal(byUnit.B1.annual, 36000, 'a zero market rent leaves the printed base rent alone');
  const leases = fromOmRows(rows, { asOf: '2026-10-01', kind: 'pdf', file: 'pm.pdf' }).leases;
  assert.equal(leases.find((L) => L.unit === 'B2').periods.length, 0, 'no rent period is made for a blank rent');
});

test('no column labelled as rent: every rent stays blank, and the broker is told why', () => {
  const doc = docKind(pmText({ rentHead: 'Monthly Charges' }).map((p) => p.replace('Monthly Charges   Monthly Charges', 'Monthly Charges   Past Due')));
  const r = pdfRollRecord(doc, { asOf: '2026-10-01', file: 'pm.pdf' });
  assert.ok(used(r).every((x) => x.annual === null && x.monthly === null));
  assert.ok(r.qc.checks.some((c) => c.id === 'norent' && /left blank/.test(c.text)));
});

test('a bare “Rent” beside charges and market rent, with no sentence calling it base rent, is asked; “Base Rent” or the sentence settles it', () => {
  const bare = record({ rentHead: 'Rent', note: 'Figures are unaudited.' });
  assert.equal(bare.held, true);
  assert.ok(bare.qc.checks.some((c) => c.id.startsWith('basis:') && c.level === 'fail' && /base \(contract\) rent/.test(c.text)));
  assert.equal(fails(record({ rentHead: 'Rent' })).filter((c) => c.id.startsWith('basis:')).length, 0, 'the footnote says contractual rent');
  assert.equal(fails(record({ rentHead: 'Base Rent' })).length, 0);
});

test('a report that says it is filtered fails the completeness check, even beside “Unit Filter: All”; the rows can still be reviewed', () => {
  const r = record({ lines: ['Unit Filter: All   Status Filter: Current'] });
  assert.equal(r.held, true);
  assert.equal(r.subset, true);
  const f = r.qc.checks.find((c) => c.kind === 'subset');
  assert.equal(f.level, 'fail');
  assert.equal(f.page, 1);
  assert.match(f.text, /filtered/);
  assert.match(f.text, /second confirmation/);
  assert.equal(r.rows.length, 0, 'held: nothing may be used yet');
  assert.equal(r.qc.held.length, 6, 'but the rows are there to review');
  assert.equal(r.qc.applied, false);
});

test('filter wording: what is a subset and what is not', () => {
  const hit = (t) => filterNotes([t]).length;
  assert.equal(hit('Unit Filter: All'), 0);
  assert.equal(hit('Unit Filter: All   Status Filter: All'), 0);
  assert.equal(hit('Filters: None'), 0);
  assert.equal(hit('Status Filter: Current'), 1);
  assert.equal(hit('Unit Filter: All   Status Filter: Current'), 1);
  assert.equal(hit('Status Filter: All   Property Filter: Building B'), 1);
  assert.equal(hit('Status: Current'), 1);
  assert.equal(hit('Status: All'), 0);
  assert.equal(hit('This report is filtered by lease status.'), 1);
  assert.equal(hit('Showing 12 of 48 units'), 1);
  assert.equal(hit('Occupied units only'), 1);
  assert.equal(hit('This report is not filtered.'), 0);
  assert.equal(hit('Unfiltered rent roll of every unit'), 0);
  assert.equal(hit('Tenant   Status   Rent'), 0, 'a column heading is not a filter');
  assert.deepEqual(filterNotes(['x', 'a\nStatus Filter: Notice']).map((f) => [f.page, f.line]), [[2, 2]]);
});

test('an untitled table with no date is only a possible rent roll: unknown, rows kept for the broker to choose', () => {
  const doc = docKind(pmText({ title: null, asOf: false, rentHead: 'Monthly Base Rent', note: '' }));
  assert.equal(doc.kind, 'unknown');
  assert.match(doc.why[0], /nothing on the first two pages says this is one/);
  assert.equal(doc.roll.rows.length, 6);
});

test('a rent column that does not say monthly or annual is asked, not guessed; the answer re-reads the rent', () => {
  const r = record({ note: '' });
  assert.equal(r.held, true);
  const q = r.qc.checks.find((c) => c.id.startsWith('period:'));
  assert.equal(q.level, 'fail');
  assert.deepEqual(q.choices, ['monthly', 'annual']);
  assert.equal(q.periodKind, 'rent');
  assert.match(q.text, /monthly rent or annual rent/);
  // the guess (monthly) is what the rows hold until the broker chooses
  assert.equal(r.qc.held.find((x) => x.suite === 'A1').annual, 60000);
  // answered annual: 5,000.00 is the year, not 60,000
  const a = record({ note: '' }, { periods: { rent: 'annual' } });
  assert.equal(a.held, false);
  const a1 = used(a).find((x) => x.suite === 'A1');
  assert.equal(a1.annual, 5000);
  assert.equal(used(a).find((x) => x.suite === 'B3').annual, 1875);
  assert.ok(a.qc.checks.some((c) => c.id.startsWith('period:') && c.level === 'info' && /You chose annual rent/.test(c.text)));
  // answered monthly: the same as the guess, now stated
  const m = record({ note: '' }, { periods: { rent: 'monthly' } });
  assert.equal(m.held, false);
  assert.equal(used(m).find((x) => x.suite === 'A1').annual, 60000);
});

test('a page that states the period in a sentence, or a heading that does, asks nothing', () => {
  assert.equal(fails(record()).length, 0);
  assert.equal(fails(record({ rentHead: 'Monthly Base Rent', note: '' })).length, 0);
  assert.equal(fails(record({ rentHead: 'Annual Rent', note: '' })).filter((c) => c.id.startsWith('period:')).length, 0);
});

test('a page that states a period different from the guess does not silence the question: asked, never applied silently', () => {
  const r = record({ note: 'Rent is the contractual annual rent; charges are billed separately.' });
  assert.equal(r.held, true, 'the figures read as monthly, the page says annual: ask');
  assert.ok(r.qc.checks.some((c) => c.id.startsWith('period:') && c.level === 'fail'));
  const a = record({ note: 'Rent is the contractual annual rent; charges are billed separately.' }, { periods: { rent: 'annual' } });
  assert.equal(used(a).find((x) => x.suite === 'A1').annual, 5000);
});

test('a column that fits two readings (rent per SF, no period) is a question with choices, so Accept-all cannot take the guess', () => {
  const doc = docKind([`Rent Roll\nAs of: 10/01/2026\n\n${tbl(OMCOLS, [['101', 'Maple Leaf Bakery', '2,000', '12/31/2030', '18.00'], ['102', 'Quillfeather Books', '1,500', '05/31/2027', '20.00']])}\n\nUnaudited figures prepared by the manager for the buyer’s due diligence; the property is a small neighbourhood retail centre with steady foot traffic and a mix of local tenants on staggered leases.`]);
  const r = pdfRollRecord(doc, { asOf: '2026-10-01' });
  const q = r.qc.checks.find((c) => c.id.startsWith('period:'));
  assert.ok(q && q.choices.length === 2);
  assert.ok(!r.qc.checks.some((c) => c.kind === 'unit' && c.level === 'fail'), 'the plain accept-as-read fail for the same column is replaced by the question');
});

test('a period the broker chose is written on the lease note', () => {
  const r = record({ note: '' }, { periods: { rent: 'annual' } });
  const L = fromOmRows(used(r), { asOf: '2026-10-01', kind: 'pdf', file: 'pm.pdf' }).leases.find((x) => x.unit === 'A1');
  assert.match(L.periods[0].note, /annual rent, period chosen by the broker/);
});

test('an accepted check carries over to a re-read only when its text is identical', () => {
  const a = record({ lines: ['Status Filter: Current'], note: '' });
  const f = a.qc.checks.find((c) => c.kind === 'subset');
  const keep = new Map([[f.id, f.text], ['period:3', 'old words']]);
  reapplyAccepted(a.qc, keep);
  assert.ok(f.resolved);
  const changed = new Map([[f.id, 'a different meaning']]);
  const b = record({ lines: ['Status Filter: Current'], note: '' });
  reapplyAccepted(b.qc, changed);
  assert.ok(!b.qc.checks.find((c) => c.kind === 'subset').resolved);
});

test('a page titled as a summary with the same columns as the roll is part of the roll: no unit is dropped', () => {
  const C = [{ h: 'Tenant', w: 22 }, { h: 'SF', w: 6, r: 1 }, { h: 'Annual Rent', w: 12, r: 1 }];
  const rows = [['Maple Leaf Bakery', '2,000', '$60,000'], ['Quillfeather Books', '1,500', '$42,000'], ['Copperline Yoga', '1,200', '$36,000'], ['Bluefin Sushi Bar', '1,800', '$54,000'], ['Pinecone Cafe', '1,000', '$30,000']];
  const d = docKind([`Tenant summary\nAs of: 10/01/2026\n\n${tbl(C, rows.slice(0, 2))}`, `${tbl(C, rows.slice(2))}\n\nPrepared by the property manager for the buyer’s due diligence; unaudited, as of the date above, with a mix of local tenants on staggered leases.`]);
  assert.equal(d.roll.rows.length, 5);
  assert.deepEqual(d.summary, []);
});

test('filter wording: a status line with = or Occupancy; single-spaced “All” filters are not a subset', () => {
  assert.equal(filterNotes(['Occupancy Status: Occupied']).length, 1);
  assert.equal(filterNotes(['Status = Current']).length, 1);
  assert.equal(filterNotes(['Unit Filter: All Status Filter: All']).length, 0);
  assert.equal(filterNotes(['Unit Filter: All Status Filter: Current']).length, 1);
});

test('a summary page’s table is not units: no duplicate rows, and the broker is told', () => {
  const r = record();
  assert.deepEqual(r.doc.summary.map((x) => x.page), [3]);
  assert.equal(used(r).length, 6);
  assert.ok(!used(r).some((x) => /^(?:occupied|vacant)$/i.test(x.tenant) && !x.suite), 'no “Occupied” or “Vacant” summary line is a unit');
  assert.ok(r.qc.checks.some((c) => c.id === 'summary:3' && c.level === 'warn' && /summary/.test(c.text) && /1 row was left out/.test(c.text)));
  // a page titled as a summary that does hold units (suites, dates) is a rent roll page, not a summary
  const titled = docKind([pmText({ summary: false, split: 6 })[0].replace('Rent Roll\n', 'Rent Roll Summary\n')]);
  assert.deepEqual(titled.summary, []);
  assert.equal(titled.roll.rows.length, 6);
});

test('a header repeated on page two joins the table: six units from two pages, none twice', () => {
  const r = record({ summary: false });
  assert.deepEqual(used(r).map((x) => x.src.page), [1, 1, 1, 2, 2, 2]);
  assert.equal(new Set(used(r).map((x) => x.suite)).size, 6);
});

test('layoutChecks(roll) alone, with no page text, keeps its column rules only', () => {
  const roll = docKind(pmText({ note: '' })).roll;
  assert.deepEqual(layoutChecks(roll), []);
});

test('the fixtures themselves: six rows, one wrapped name, one month-to-month, one vacant', () => {
  assert.equal(PM_ROWS.length, 6);
  assert.equal(PM_ROWS.filter((r) => r[1].length === 2).length, 1);
  assert.equal(PM_ROWS.filter((r) => /month-to-month/i.test(r[7])).length, 1);
});

/* A tenant name wrapped over two lines is a table cell, not a filter heading; every real filter wording is still caught. */
test('filterNotes keeps every wording: header filter beside a Property field, footer status, partial roll, not all units', () => {
  const rowLines = new Map([[{}, [{ page: 1, line: 9 }]]]); // a table's lines are skipped; these others are not in it
  for (const m of [undefined, rowLines]) {
    const hit = (t) => filterNotes(t, m).length;
    assert.equal(hit(['Property: Sample Plaza   Unit Filter: All   Status Filter: Current']), 1);
    assert.equal(hit(['Rent Roll\n\nA1   Maple Leaf Bakery   2,000\n\nStatus: Current']), 1, 'a footer status filter');
    assert.equal(hit(['Status Filter: All\nA1  Maple Leaf Bakery\nThis is a partial rent roll of the property.']), 1);
    assert.equal(hit(['Rent Roll\nNot all units are shown.']), 1);
    assert.equal(hit(['Property: Sample Plaza   Unit Filter: All   Status Filter: All']), 0);
  }
});
test('filterNotes skips only the lines a row was read from', () => {
  const pages = ['Unit Filter: Occupied\nA1  Maple Leaf Bakery'];
  assert.equal(filterNotes(pages).length, 1);
  assert.equal(filterNotes(pages, new Map([[{}, [{ page: 1, line: 1 }]]])).length, 0, 'line 1 is a row line');
  assert.equal(filterNotes(pages, new Map([[{}, [{ page: 1, line: 2 }]]])).length, 1, 'line 2 is the row line: line 1 still counts');
  assert.equal(filterNotes(pages, new Map([[{}, [{ page: 2, line: 1 }]]])).length, 1, 'another page');
});
test('a wrapped tenant name that reads like a filter is a name, and the report is not held; a real filter still is', async () => {
  const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;
  const { pdfPages } = await import('../app/pdftext.js');
  const { pmWrapPdf } = await import('./pmwrap-fixtures.js');
  const run = async (o) => { const layouts = []; const pages = await pdfPages(pdfjs, pmWrapPdf(o), { layouts, verbosity: 0 }); const doc = docKind(pages, layouts); return { doc, rec: pdfRollRecord(doc, { asOf: '2026-10-01', file: 'pm.pdf' }) }; };
  for (const name of ['Unit Filter: Occupied', 'This report lists only a subset of units', 'Status: Current']) {
    const { doc, rec } = await run({ tenantAbove: name });
    assert.equal(doc.roll.rows.length, 3, name);
    assert.equal(doc.roll.rows[0].tenant, name);
    assert.equal(rec.subset, false, name); assert.equal(rec.qc.checks.filter((c) => c.kind === 'subset').length, 0, name);
  }
  assert.equal((await run({ filterText: 'Unit Filter: All   Status Filter: Current' })).rec.subset, true, 'a header filter still holds it');
  assert.equal((await run({ footer: 'Status: Current' })).rec.subset, true, 'a footer filter still holds it');
});

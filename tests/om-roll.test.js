/* The OM rent roll reader's wider net (app/omroll.js): a multifamily roll with no tenant column, other words for the tenant
 * column, continuation pages whose type size differs, figures aligned far from their labels, tight columns whose cells
 * merge, a roll over many pages, a Total that is a running or cross-page one. Invented OMs (tests/om-roll-fixtures.js),
 * typeset as PDFs and read through pdf.js exactly as the deal page's OM upload does. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis; globalThis.navigator ||= { userAgent: 'node' };
const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;
const { pdfPages } = await import('../app/pdftext.js');
const { readOm } = await import('../app/om.js');
const { pdfOf } = await import('./rr-fixtures.js');
const F = await import('./om-roll-fixtures.js');
const { omDiagnose } = await import('./tools/om-diag.mjs');

/** An invented OM's pages, read as the deal page reads them. */
export async function readPages(pages) {
  const layouts = [];
  const text = await pdfPages(pdfjs, pdfOf(pages), { layouts, verbosity: 0 });
  return { text, layouts, om: readOm(text, { layouts, asOf: '2026-06-01' }) };
}
const roll = async (pages) => (await readPages(pages)).om.rentRoll;

test('multifamily roll: units with no tenant column are read, keyed by unit', async () => {
  const r = await roll([F.grid({ cols: F.MF_COLS, rows: F.MF_ROWS })]);
  assert.ok(r, 'a roll');
  assert.deepEqual(r.rows.map((x) => x.suite), ['101', '102', '103', '104', '105', '106']);
  assert.deepEqual(r.rows.map((x) => x.sf), [650, 650, 910, 910, 1150, 650]);
  assert.deepEqual(r.rows.map((x) => x.vacant), [false, false, false, true, false, false]);
});

test('multifamily roll: only the labelled current rent is read; market rent never fills it; blank stays blank', async () => {
  const r = await roll([F.grid({ cols: F.MF_COLS, rows: F.MF_ROWS })]);
  assert.deepEqual(r.rows.map((x) => x.monthly), [1200, 1225, 1575, null, 1990, 1210]);
  assert.deepEqual(r.rows.map((x) => x.annual), [14400, 14700, 18900, null, 23880, 14520]);
  assert.ok(r.rows.every((x) => x.market === undefined || x.market !== x.monthly), 'market rent is its own column');
  assert.equal(r.rows[3].annual, null, 'the vacant unit has no rent, not zero');
  assert.equal(r.columns.find((c) => c.kind === 'market').label, 'Market Rent');
  assert.equal(r.columns.find((c) => c.kind === 'rent').label, 'Current Rent');
});

test('multifamily roll: a rent column that does not say monthly or annual is flagged, never silently multiplied', async () => {
  const r = await roll([F.grid({ cols: F.MF_COLS, rows: F.MF_ROWS })]);
  const col = r.columns.find((c) => c.kind === 'rent');
  assert.ok(col.basis === 'inferred' || col.basis === 'ask', col.basis);
  assert.ok(r.issues.some((i) => i.kind === 'unit' && /monthly or annual/.test(i.text)));
});

test('multifamily roll: Beds/Baths is its own column, not an unknown one', async () => {
  const r = await roll([F.grid({ cols: F.MF_COLS, rows: F.MF_ROWS })]);
  assert.ok(r.columns.some((c) => c.kind === 'beds'));
  assert.ok(r.rows.every((x) => !x.why.some((w) => /column the reader doesn't know/.test(w))));
});

test('multifamily roll: a Total row is kept as a total, not read as a unit', async () => {
  const rows = F.MF_ROWS.slice();
  const r = await roll([F.grid({ cols: F.MF_COLS, rows, total: ['Total', '', '', '4,920', '', '', '', '', ''] })]);
  assert.equal(r.rows.length, 6);
  assert.equal(r.totals.length, 1);
  assert.equal(r.totals[0].sf, 4920);
});

for (const word of ['Name', 'Trade Name', 'Leaseholder', 'Tenant / DBA', 'Lessee', 'Occupant', 'Business Name', 'Resident']) {
  test(`tenant column called "${word}" is read as the tenant`, async () => {
    const r = await roll(F.tenantWord(word));
    assert.deepEqual(r.rows.map((x) => x.tenant), ['Maple Leaf Bakery', 'Quillfeather Books', 'Copperline Yoga', 'Bluefin Sushi Bar']);
    assert.deepEqual(r.rows.map((x) => x.annual), [60000, 42000, 36000, 54000]);
  });
}

test('a suite roll with no tenant column is read, keyed by suite', async () => {
  const r = await roll(F.suiteOnly());
  assert.deepEqual(r.rows.map((x) => [x.suite, x.tenant, x.annual]), [['101', null, 60000], ['102', null, 42000], ['103', null, 36000], ['104', null, 54000]]);
});

test('a bare "Property Name" column is not a tenant column', async () => {
  const r = await roll(F.tenantWord('Property Name'));
  assert.equal(r ? r.rows.some((x) => x.tenant === 'Maple Leaf Bakery') : false, false);
});

test('a unit mix and a comparables table, with a Unit column and rents but no lease, are not rent rolls', async () => {
  assert.equal(await roll(F.unitMix()), null);
  assert.equal(await roll(F.compsTable()), null);
});

test('a roll with no unit, suite or tenant column is still refused (nothing to key a row by)', async () => {
  const { text, layouts } = await readPages(F.noKey());
  assert.deepEqual(omDiagnose(text, layouts, { asOf: '2026-06-01' }).reasons, ['header-not-matched:tenant']);
});

test('continuation pages in a smaller type size still line up with the header: all rows read, none lost', async () => {
  const r = await roll(F.sizeDrift());
  assert.equal(r.rows.length, 7);
  assert.deepEqual(r.pages, [2, 3]);
  assert.equal(r.rows[6].tenant, 'Elm Street Cafe');
  assert.equal(r.rows[6].annual, 27000);
});

test('figures right-aligned far from their left-aligned labels are placed by order', async () => {
  const r = await roll(F.wideFigures());
  assert.deepEqual(r.rows.map((x) => [x.sf, x.annual]), [[2000, 60000], [1500, 42000], [1200, 36000], [1800, 54000]]);
});

test('figures far from their labels are NOT placed when the order does not decide it (a blank cell in the row)', async () => {
  // dates absent: the SF figure could sit under SF, Lease End or Annual Rent; the rent is then the only one placed by order
  const r = await roll(F.wideFigures({ blankDates: true }));
  assert.deepEqual(r.rows.map((x) => [x.sf, x.annual]), [[null, null], [null, null], [null, null], [null, null]]);
});

test('a header whose "Lease Start" and "Lease End" sit a hair apart (one cell in the text) is cut into its two columns: the lease ends are read', async () => {
  const r = await roll(F.tightHeader());
  assert.deepEqual(r.rows.map((x) => x.end && x.end.toISOString().slice(0, 10)), ['2030-12-31', '2027-05-31', '2033-02-28', '2028-08-31']);
  assert.deepEqual(r.rows.map((x) => x.start && x.start.toISOString().slice(0, 10)), ['2021-01-01', '2022-06-01', '2023-03-01', '2020-09-01']);
  assert.deepEqual(r.columns.filter((c) => c.kind === 'start' || c.kind === 'end').map((c) => c.label), ['Lease Start', 'Lease End']);
});

test('a name that runs up to the SF figure (one cell in the text) is cut: the name is the name, the SF is the SF', async () => {
  const r = await roll(F.tightRows());
  assert.deepEqual(r.rows.map((x) => x.tenant), ['Maple Leaf Bakery and Cafe Co', 'Quillfeather Books Gift Shop', 'Copperline Yoga Studios Inc', 'Bluefin Sushi Bar and Grill']);
  assert.deepEqual(r.rows.map((x) => x.sf), [2000, 1500, 1200, 1800]);
  assert.deepEqual(r.rows.map((x) => x.annual), [60000, 42000, 36000, 54000]);
});

test('a whole header in one text item is not cut on its words: no columns to go by, so nothing is read, and no figure lands in a wrong column', async () => {
  const D = await import('./om-diag-fixtures.js');
  const { om } = await readPages(D.FIXTURES.merged());
  assert.equal(om.rentRoll, null);
});

test('whitespace between groups of rows (a building, a section) does not end the table: every group is read', async () => {
  for (const heading of [false, true]) {
    const r = await roll(F.gapped({ heading }));
    assert.equal(r.rows.length, 12, `heading ${heading}`);
    assert.equal(r.rows[11].suite, '111');
    assert.ok(r.rows.every((x) => /^\d{3}$/.test(x.suite)), 'a heading is not a row');
  }
});

test('a continuation page whose header leaves a column out is the same roll: its rows are read too', async () => {
  const r = await roll(F.continuedHeader());
  assert.equal(r.rows.length, 12);
  assert.deepEqual(r.pages, [2, 3]);
  assert.equal(r.rows[11].suite, '111');
  assert.ok(r.rows.slice(6).every((x) => x.annual > 0 && x.sf > 0), 'the second page has its figures');
});

test('"$" in a cell of its own (accounting style) does not stop the table carrying on to a headerless page', async () => {
  const r = await roll(F.accounting2());
  assert.deepEqual(r.rows.map((x) => x.annual), [60000, 42000, 36000, 54000]);
  assert.deepEqual(r.pages, [2, 3]);
});

test('page totals: each page\'s Total row is checked against its own rows, and a running total against every row so far', async () => {
  const own = await roll(F.pageTotals());
  assert.equal(own.rows.length, 24);
  assert.ok(own.issues.filter((i) => i.kind === 'total').every((i) => i.level === 'pass'), own.issues.filter((i) => i.level === 'fail').map((i) => i.text).join(' | '));
  const run = await roll(F.pageTotals({ running: true }));
  assert.equal(run.rows.length, 24);
  const checks = run.issues.filter((i) => i.kind === 'total');
  assert.ok(checks.length >= 8 && checks.every((i) => i.level === 'pass'), checks.filter((i) => i.level !== 'pass').map((i) => i.text).join(' | '));
  assert.ok(checks.some((i) => /running total: it adds up to all 12 rows read from the start of the roll/.test(i.text)), 'the note says which');
});

test('a running total that matches no run of rows still fails and holds the roll', async () => {
  const pages = F.pageTotals({ running: true });
  const page = pages[pages.length - 1];
  const total = page.find((it) => it.s === 'Total');
  page.find((it) => it.y === total.y && it.x === 430).s = '$999,999';
  const r = await roll(pages);
  assert.ok(r.issues.some((i) => i.kind === 'total' && i.level === 'fail'));
});

test('a rent column that does not say its period, under a Total printed as a year: the check says it compares the monthly rows ×12', async () => {
  const r = await roll(F.mfTotal('$86,400'));
  const t = r.issues.filter((i) => i.kind === 'total' && i.field === 'monthly');
  assert.equal(t.length, 1);
  assert.equal(t[0].level, 'pass');
  assert.match(t[0].text, /monthly or annual: the Total \$86,400 equals the rows' monthly rent × 12 \(a year\)/);
  assert.equal(r.rows[0].monthly, 1200, 'the rows keep the monthly figure; nothing was multiplied');
  const bad = await roll(F.mfTotal('$99,000'));
  assert.equal(bad.issues.filter((i) => i.kind === 'total' && i.field === 'monthly')[0].level, 'fail');
});

test('a sidebar of text beside the table, on lines between its rows, is neither a row nor the end of the table', async () => {
  for (const [heading, numbers] of [[true, false], [false, false], [true, true], [false, true]]) {
    const r = await roll(F.sidebar({ heading, numbers }));
    assert.ok(r, `heading ${heading}, numbers ${numbers}`);
    assert.deepEqual(r.rows.map((x) => [x.suite, x.tenant, x.sf, x.annual]), [['101', 'Maple Leaf Bakery', 2000, 60000], ['102', 'Quillfeather Books', 1500, 42000], ['103', 'Copperline Yoga', 1200, 36000], ['104', 'Bluefin Sushi Bar', 1800, 54000]], `heading ${heading}, numbers ${numbers}`);
  }
});

test('text under the table in its own columns still ends it (a sidebar rule is not "any text ends nothing")', async () => {
  const pages = F.sidebar({ heading: false });
  pages[1].push({ x: 80, y: 600, s: 'Prospective buyers should verify all information independently.', size: 7 }, { x: 80, y: 590, s: 'Maple Row Plaza 999 and nearby retail lease 2,500 SF $70,000', size: 7 });
  const r = await roll(pages);
  assert.equal(r.rows.length, 4);
});

test('figures far from their labels with no figures around them to fix their order are left unread, never put in the first column that takes a number', async () => {
  const r = await roll(F.wideFigures({ bare: true }));
  assert.ok(r.rows.every((x) => x.sf === null && x.annual === null), JSON.stringify(r.rows.map((x) => [x.sf, x.annual])));
});

test('a line of one figure after a gap is not a continuation of the table', async () => {
  const r = await roll(F.gapped({ taxes: true }));
  assert.equal(r.rows.length, 12);
  assert.ok(!r.rows.some((x) => /taxes/i.test(x.tenant || '')));
});

test('a stated monthly rent column under a Total printed as a year is still a failed check (only an unstated period is compared both ways)', async () => {
  const r = await roll(F.mfStatedTotal('$86,400'));
  const t = r.issues.find((i) => i.kind === 'total' && i.field === 'monthly');
  assert.equal(t.level, 'fail');
});

test('header labels touching ("Lease StartLease End") are cut into two columns', async () => {
  const r = await roll(F.tightHeader({ flush: true }));
  assert.deepEqual(r.rows.map((x) => x.end && x.end.toISOString().slice(0, 10)), ['2030-12-31', '2027-05-31', '2033-02-28', '2028-08-31']);
  assert.equal(r.rows[0].start.toISOString().slice(0, 10), '2021-01-01');
});

test('a unit roll that gives no SF, and a bare listing of units, SF and status, are not read as rent rolls', async () => {
  assert.equal(await roll(F.unitNoSf()), null);
  assert.equal(await roll(F.unitSfStatus()), null);
});

test('continuation pages in a smaller type with blank cells in their rows (no order to place a drifted figure by) still line up', async () => {
  const r = await roll(F.sizeDrift({ blankEnds: true, size: 5 }));
  assert.equal(r.rows.length, 7);
  assert.deepEqual(r.rows.slice(4).map((x) => [x.sf, x.annual]), [[1000, 32000], [1500, 45000], [900, 27000]]);
});

test('"Lease End" and "Annual Rent" touching: the rent column is the annual one, read as stated', async () => {
  const r = await roll(F.flushRent());
  assert.deepEqual(r.columns.filter((c) => c.kind === 'annual' || c.kind === 'rent').map((c) => [c.kind, c.label, c.basis]), [['annual', 'Annual Rent', 'stated']]);
  assert.deepEqual(r.rows.map((x) => x.annual), [60000, 42000, 36000, 54000]);
});

test('a column the broker chose the period of (basis stated) under a Total printed as a year is still a failed check', async () => {
  const { text, layouts } = await readPages(F.mfTotal('$86,400'));
  const { rentRoll } = await import('../app/omroll.js');
  const r = rentRoll(text, { layouts, periods: { rent: 'monthly' } });
  assert.equal(r.issues.find((i) => i.kind === 'total' && i.field === 'monthly').level, 'fail');
});

test('review 1: a balance far right is never placed under the rent when the rent is blank', async () => {
  for (const label of ['Balance', 'Mkt', 'Budget']) {
    const r = await roll(F.otherLast(label));
    assert.deepEqual(r.rows.map((x) => x.annual), [60000, null, 36000], label);
  }
});
test('review 2: lease comparables and an availability list are not rent rolls', async () => {
  assert.equal(await roll(F.leaseComps()), null);
  assert.equal(await roll(F.leaseCompsLocation()), null);
  assert.equal(await roll(F.availability()), null);
});
test('review 3: a lease expiration schedule after the roll is not more of the roll', async () => {
  for (const samePage of [false, true]) {
    const r = await roll(F.withExpiry({ samePage }));
    assert.equal(r.rows.length, 4, `samePage ${samePage}`);
    assert.equal(new Set(r.rows.map((x) => x.tenant)).size, 4);
  }
});
test('review 3b: a continued header on the next page still joins when the table ran to the page end', async () => {
  const r = await roll(F.continuedHeader());
  assert.equal(r.rows.length, 12);
});
test('review n: right-aligned SF ending before a left-aligned rent label is not read as rent', async () => {
  const r = await roll(F.sfBeforeRent());
  assert.ok(r.rows.every((x) => x.annual === null || x.annual > 10000), JSON.stringify(r.rows.map((x) => [x.sf, x.annual])));
  assert.deepEqual(r.rows.map((x) => x.sf), [2000, 1500, 1200, 1800]);
});

test('review 2b: a Location key, or a Unit table with start and term only, is not a roll', async () => {
  assert.equal(await roll(F.locationKeyed()), null);
  assert.equal(await roll(F.unitStartTerm()), null);
});
test('review 3c: a schedule repeating the roll\'s tenants is not joined even when the roll has no Total; a table after a Total is not joined', async () => {
  assert.equal((await roll(F.withExpiry({ total: false }))).rows.length, 4);
  assert.equal((await roll(F.totalThenOther())).rows.length, 4);
});

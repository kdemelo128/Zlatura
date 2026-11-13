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
  assert.ok(r.rows.every((x) => x.sf === null || x.sf === undefined || x.sf > 0));
  assert.ok(r.rows.every((x) => x.annual !== 2000 && x.annual !== 1500 && x.annual !== 1200 && x.annual !== 1800), 'an SF figure is never the rent');
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

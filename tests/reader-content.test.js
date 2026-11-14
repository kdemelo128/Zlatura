/* Reading a rent roll whose tenant column has a heading the reader does not know, told by what the column holds
 * (docs/proposals/reader-content.md, slice 1). A content reading is only ever OFFERED (a spreadsheet import shows a
 * button) or ASKED (a PDF's rows are held behind a failed check until the broker accepts): it never imports alone,
 * and a file whose headings the reader already knows is read exactly as before. The `todo` tests are the shapes
 * the later slices take on: they fail today and are kept so the gap stays visible. All names and figures invented. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { addEventListener() {}, dispatchEvent() {}, createElement: () => ({}), documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.navigator ||= /** @type {any} */ ({ userAgent: 'node' });
const { rentRoll } = await import('../app/om.js');
const { omRollRecord, emptyRentRoll } = await import('../app/rentroll.js');
const { docKind, pdfRollRecord } = await import('../app/rrdoc.js');
const { headerAndRows, contentOffers, contentTable, guessField, rowsToLeases } = await import('../app/rentrollui.js');
const { nameColumn, nameLike } = await import('../app/colcontent.js');
const { tbl, C9, r1, r2, r3 } = await import('./rr-fixtures.js');

const NAMES = ['Maple Leaf Bakery', 'Quillfeather Books', 'Copperline Yoga', 'Bluefin Sushi Bar'];
const page = (cols, row, title = 'Rent Roll') => `${title}\n\n${tbl(cols, NAMES.map((n, i) => row(i + 1, n)))}`;
const inferred = (rr) => rr.issues.filter((i) => i.kind === 'tenant-content');

/* ------------------------------------------------ PDF: no table today, one offered now */

const PDF_SHAPES = {
  'an unknown tenant heading, and no lease date': [[{ h: 'Suite', w: 5 }, { h: 'Concept', w: 22 }, { h: 'SF', w: 6, r: 1 }, { h: 'Annual Rent', w: 11, r: 1 }, { h: 'Rent/SF', w: 7, r: 1 }], (i, n) => [`10${i}`, n, '2,000', '$60,000', '$30.00']],
  'an unknown tenant heading, and no suite': [[{ h: 'Customer', w: 22 }, { h: 'SF', w: 6, r: 1 }, { h: 'Lease End', w: 10 }, { h: 'Annual Rent', w: 11, r: 1 }], (i, n) => [n, '2,000', '12/31/2030', '$60,000']],
  'a blank tenant heading, and no suite': [[{ h: '', w: 22 }, { h: 'SF', w: 6, r: 1 }, { h: 'Lease End', w: 10 }, { h: 'Annual Rent', w: 11, r: 1 }, { h: 'Rent/SF', w: 7, r: 1 }], (i, n) => [n, '2,000', '12/31/2030', '$60,000', '$30.00']],
  'a Location key and a Store heading': [[{ h: 'Location', w: 8 }, { h: 'Store', w: 22 }, { h: 'SF', w: 6, r: 1 }, { h: 'Expiration', w: 10 }, { h: 'Annual Rent', w: 11, r: 1 }], (i, n) => [`10${i}`, n, '2,000', '12/31/2030', '$60,000']],
};

for (const [name, [cols, row]] of Object.entries(PDF_SHAPES)) {
  test(`PDF, ${name}: the rows are read with the names as tenants, and held behind a failed check that shows the column mapping`, () => {
    const rr = rentRoll([page(cols, row)]);
    assert.ok(rr, 'a rent roll is found');
    assert.deepEqual(rr.rows.map((r) => r.tenant), NAMES);
    assert.ok(rr.rows.every((r) => r.annual === 60000), 'the rent is read as printed');
    const q = inferred(rr);
    assert.equal(q.length, 1);
    assert.equal(q[0].level, 'fail');
    assert.match(q[0].text, /Looks like a rent roll/);
    assert.match(q[0].text, /Tenant \((?:“[A-Za-z]+”|no heading)\)/, 'the inferred mapping is shown');
    assert.equal(rr.confidence, 'low');
    // the deal's record holds the rows: nothing is used until the broker accepts
    const { qc, rows } = omRollRecord({ rentRoll: rr, scanned: [] }, { asOf: '2026-10-10', file: 'x.pdf' });
    assert.equal(rows.length, 0);
    assert.equal(qc.held.length, 4);
    assert.ok(qc.checks.some((c) => c.kind === 'tenant-content' && c.level === 'fail'));
  });
}

test('PDF: a titled rent roll told by its contents is a rent roll document, held in the preview until accepted, and says why', () => {
  const [cols, row] = PDF_SHAPES['an unknown tenant heading, and no lease date'];
  const doc = docKind([page(cols, row)]);
  assert.equal(doc.kind, 'rentroll');
  assert.match(doc.why.join(' '), /No heading names the tenant/);
  const rec = pdfRollRecord(doc, { asOf: '2026-10-10', file: 'x.pdf' });
  assert.equal(rec.held, true);
  assert.equal(rec.rows.length, 0);
});

test('PDF: an untitled table told by its contents is not called a rent roll; it can be read as one when the broker says so', () => {
  const [cols, row] = PDF_SHAPES['an unknown tenant heading, and no suite'];
  const doc = docKind([page(cols, row, 'Tenants')]);
  assert.equal(doc.kind, 'unknown');
  assert.ok(doc.roll, 'the "It is a rent roll: read it" button has a table to read');
});

/* ------------------------------------------------ PDF: what must not change, and what is not guessed */

test('PDF: a document with a rent roll told by its headings is read exactly as before, a content-only table elsewhere left out', () => {
  const [cols, row] = PDF_SHAPES['an unknown tenant heading, and no lease date'];
  // the content-only table is titled and longer, so it would outscore the headed one if it were ever read beside it
  const alone = rentRoll([`Tenants\n\n${tbl(C9, [r1, r2, r3])}`]);
  const both = rentRoll([`Tenants\n\n${tbl(C9, [r1, r2, r3])}`, page(cols, row, 'Rent Roll')]);
  assert.deepEqual(both.rows.map((r) => r.tenant), alone.rows.map((r) => r.tenant));
  assert.deepEqual(both.pages, [1]);
  assert.equal(inferred(both).length, 0);
});

test('PDF: a list of sales (Property, City, SF, Price) is not taken for a rent roll, though it has names and a size', () => {
  const cols = [{ h: 'Property', w: 22 }, { h: 'City', w: 12 }, { h: 'SF', w: 6, r: 1 }, { h: 'Sale Price', w: 12, r: 1 }, { h: 'Price/SF', w: 8, r: 1 }];
  const cities = ['Fernvale', 'Ashby', 'Millbrook', 'Coldwater'];
  assert.equal(rentRoll([page(cols, (i, n) => [n, cities[i - 1], '2,000', '$600,000', '$300.00'], 'Recent Sales')]), null);
  // with no suite and no lease date, names, a size and a rent alone do not make a rent roll
  const bare = [{ h: 'Concept', w: 22 }, { h: 'SF', w: 6, r: 1 }, { h: 'Annual Rent', w: 11, r: 1 }];
  assert.equal(rentRoll([page(bare, (i, n) => [n, '2,000', '$60,000'])]), null);
});

test('PDF: two columns of names, or a column whose words repeat, are not guessed between', () => {
  const two = [{ h: 'Suite', w: 5 }, { h: 'Concept', w: 22 }, { h: 'Brand', w: 18 }, { h: 'SF', w: 6, r: 1 }, { h: 'Annual Rent', w: 11, r: 1 }];
  const brands = ['Northwind Group', 'Larkspur Holdings', 'Tidewater Partners', 'Quarry Lane Co'];
  assert.equal(rentRoll([page(two, (i, n) => [`10${i}`, n, brands[i - 1], '2,000', '$60,000'])]), null);
  const rep = [{ h: 'Suite', w: 5 }, { h: 'Category', w: 12 }, { h: 'SF', w: 6, r: 1 }, { h: 'Annual Rent', w: 11, r: 1 }];
  assert.equal(rentRoll([page(rep, (i) => [`10${i}`, 'Retail Shop', '2,000', '$60,000'])]), null);
});

test('PDF: a list of spaces to let, its words under "Description", is not a rent roll', () => {
  const cols = [{ h: 'Suite', w: 5 }, { h: 'Description', w: 24 }, { h: 'SF', w: 6, r: 1 }, { h: 'Asking Rent', w: 11, r: 1 }];
  const words = ['End cap with drive-thru', 'Inline shop space', 'Former bank branch', 'Second generation salon'];
  assert.equal(rentRoll([page(cols, (i) => [`10${i}`, words[i - 1], '2,000', '$30.00'], 'Spaces')]), null);
});

test('PDF: a unit mix with a blank first heading is still a unit mix, not a rent roll', () => {
  const cols = [{ h: '', w: 14 }, { h: '# Units', w: 7, r: 1 }, { h: 'Avg SF', w: 6, r: 1 }, { h: 'Avg Rent', w: 9, r: 1 }];
  const types = ['Studio Flat', 'One Bedroom', 'Two Bedroom', 'Three Bedroom'];
  assert.equal(rentRoll([page(cols, (i) => [types[i - 1], '12', '750', '$1,400'], 'Units')]), null);
});

test('PDF: a comparables table with an unknown name heading is not offered (its wording says what it is)', () => {
  const [cols, row] = PDF_SHAPES['an unknown tenant heading, and no lease date'];
  assert.equal(rentRoll([page(cols, row, 'Lease Comparables')]), null);
});

/* ------------------------------------------------ spreadsheets */

const HEAD = ['Suite', 'Business', 'Square Feet', 'Lease Expiration', 'Annual Rent'];
const ROWS = NAMES.map((n, i) => [`10${i + 1}`, n, 1500, '2029-12-31', 45000]);

test('spreadsheet: a "Business" column under headings that pass is offered as the tenant, and is not read as one until tapped', () => {
  const t = headerAndRows([HEAD, ...ROWS], 'Sheet1');
  assert.ok(t);
  const guess = t.headers.map(guessField);
  assert.equal(guess[1], null, 'the heading alone says nothing');
  const offers = contentOffers(t, guess);
  assert.equal(offers.length, 1);
  assert.deepEqual([offers[0].col, offers[0].field], [1, 'tenant']);
  assert.match(offers[0].text, /“Business” column holds 4 different names/);
  // not tapped: read exactly as before, with no tenant
  const before = rowsToLeases(emptyRentRoll('Retail', '2026-10-10'), t, guess);
  assert.ok(before.leases.every((L) => !L.tenant));
  // tapped: the names are the tenants
  const after = rowsToLeases(emptyRentRoll('Retail', '2026-10-10'), t, guess.map((g, i) => (i === offers[0].col ? 'tenant' : g)));
  assert.deepEqual(after.leases.map((L) => L.tenant), NAMES);
});

test('spreadsheet: a tenant column with no heading is offered, by its number', () => {
  const t = headerAndRows([['Suite', '', 'Square Feet', 'Lease Expiration', 'Annual Rent'], ...ROWS], 'Sheet1');
  const offers = contentOffers(t, t.headers.map(guessField));
  assert.equal(offers.length, 1);
  assert.match(offers[0].text, /Column 2, which has no heading,/);
});

test('spreadsheet: a sheet with only two known headings and a column of names is offered by its contents; routing still reads headings only', async () => {
  const grid = [['Business', 'Sq Ft', 'Annual Rent'], ...NAMES.map((n) => [n, 1500, 45000])];
  assert.equal(headerAndRows(grid, 'Sheet1'), null, 'the headings alone do not pass');
  const t = contentTable(grid, 'Sheet1');
  assert.ok(t && t.byContent);
  assert.equal(t.rows.length, 4);
  assert.equal(contentOffers(t, t.headers.map(guessField))[0].col, 0);
  // the Documents card types a file by its headings: this one is asked about (the text names a rent roll's words), never typed by its contents
  const { identify } = await import('../app/ddintake.js');
  const v = identify({ name: 'x.xlsx', grids: [{ sheet: 'Sheet1', rows: grid.map((cells, i) => ({ r: i + 1, cells })) }] });
  assert.deepEqual([v.type, v.typeBy], [null, null]);
});

test('spreadsheet: nothing is offered when a tenant heading exists, for notes or a property list, or between two name columns', () => {
  const withTenant = headerAndRows([['Suite', 'Tenant', 'Business', 'SF', 'Annual Rent'], ...NAMES.map((n, i) => [`10${i}`, n, n, 1500, 45000])], 'S');
  assert.deepEqual(contentOffers(withTenant, withTenant.headers.map(guessField)), []);
  const notes = headerAndRows([['Suite', 'Notes', 'SF', 'Lease End', 'Annual Rent'], ...NAMES.map((n, i) => [`10${i}`, `Renewal option for ${n}`, 1500, '2029-12-31', 45000])], 'S');
  assert.deepEqual(contentOffers(notes, notes.headers.map(guessField)), []);
  const contact = headerAndRows([['Suite', 'Contact', 'SF', 'Lease End', 'Annual Rent'], ...['Ana Ruiz', 'Ben Okafor', 'Cleo Marsh', 'Dev Patel'].map((n, i) => [`10${i}`, n, 1500, '2029-12-31', 45000])], 'S');
  assert.deepEqual(contentOffers(contact, contact.headers.map(guessField)), [], 'a contact person is not the tenant');
  const two = headerAndRows([['Suite', 'Business', 'Parent Co', 'SF', 'Annual Rent'], ...NAMES.map((n, i) => [`10${i}`, n, `${n} Holdings`, 1500, 45000])], 'S');
  assert.deepEqual(contentOffers(two, two.headers.map(guessField)), [], 'two columns of names: nothing is guessed');
  assert.equal(contentTable([['Property', 'Sq Ft', 'Sale Price'], ...NAMES.map((n) => [n, 1500, 900000])], 'S'), null, 'no rent, no lease field: not a roll');
  assert.equal(contentTable([['Business', 'Suite', 'Lease End'], ...NAMES.map((n, i) => [n, `10${i}`, '2029-12-31'])], 'S'), null, 'no size and no rent: not a roll');
});

test('names are words, not figures, dates, codes or addresses; a column of them is distinct', () => {
  for (const v of ['Maple Leaf Bakery', 'Starbucks', '7-Eleven Store', 'Dr. Ana Ruiz, DDS']) assert.ok(nameLike(v), v);
  for (const v of ['$45,000', '1,500', '12/31/2030', '2030', 'Dec 2030', '101', 'B-12', '1BR/1BA', '12 Sample Road', 'leasing@example.com', 'n/a', '-', 45000, null]) assert.ok(!nameLike(v), String(v));
  assert.ok(nameColumn(['Maple Leaf Bakery', 'Vacant', 'Copperline Yoga', 'Bluefin Sushi Bar', 'Total']), 'a vacancy and a total are skipped');
  assert.equal(nameColumn(['Retail', 'Retail', 'Office', 'Retail']), null, 'repeats: a type, not tenants');
  assert.equal(nameColumn(['Maple Leaf Bakery', 'Copperline Yoga']), null, 'two rows are too few');
  assert.equal(nameColumn(['Maple Leaf Bakery', '$1,000', '$2,000', 'Copperline Yoga', 'Quillfeather Books']), null, 'mostly names is not enough');
});

/* ------------------------------------------------ later slices: these fail today */

test('slice 2 (PDF, read today with the names lost): a unit-keyed roll with a "Concept" column keeps the names, asked', { todo: 'slice 2: a question for a table that reads today' }, () => {
  const cols = [{ h: 'Suite', w: 5 }, { h: 'Concept', w: 22 }, { h: 'SF', w: 6, r: 1 }, { h: 'Lease End', w: 10 }, { h: 'Annual Rent', w: 11, r: 1 }];
  const rr = rentRoll([page(cols, (i, n) => [`10${i}`, n, '2,000', '12/31/2030', '$60,000'])]);
  assert.deepEqual(rr.rows.map((r) => r.tenant), NAMES);
});

test('slice 2 (PDF): a name printed in the suite column is split into suite and tenant, asked', { todo: 'slice 2: a question for a table that reads today' }, () => {
  const cols = [{ h: 'Suite', w: 26 }, { h: 'SF', w: 6, r: 1 }, { h: 'Lease End', w: 10 }, { h: 'Annual Rent', w: 11, r: 1 }];
  const rr = rentRoll([page(cols, (i, n) => [`10${i} ${n}`, '2,000', '12/31/2030', '$60,000'])]);
  assert.deepEqual(rr.rows.map((r) => [r.suite, r.tenant]), NAMES.map((n, i) => [`10${i + 1}`, n]));
});

const t12 = await import('../app/t12.js');
const R = (arr) => arr.map((cells, r) => ({ r: r + 1, cells }));
const LINES = [['Gross Potential Rent', 120000], ['Vacancy Loss', -6000], ['Total Revenue', 114000], ['Real Estate Taxes', 12000], ['Insurance', 4000], ['Total Operating Expenses', 16000], ['Net Operating Income', 98000]];

for (const h of ['2025', 'Actual', 'FY 2025', 'Year Ended December 31, 2025']) {
  test(`slice 3 (T-12): a single annual column headed “${h}” is read as the year's figures, asked`, { todo: 'slice 3: an income statement by its content' }, () => {
    const s = t12.readStatement(R([['Description', h], ...LINES]));
    assert.equal(s.lines.length, 3);
    assert.equal(s.stated.noi.value, 98000);
  });
}

test('slice 3 (T-12): quarter columns are read as quarters, never as months', { todo: 'slice 3: an income statement by its content' }, () => {
  const s = t12.readStatement(R([['Account', 'Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025'], ...LINES.map(([l, v]) => [l, v / 4, v / 4, v / 4, v / 4])]));
  assert.equal(s.stated.noi.value, 98000);
});

test('slice 3 (T-12): Actual and Budget pairs in one heading row read the Actual columns only, asked', { todo: 'slice 3: an income statement by its content' }, () => {
  const ms = ['Jan 2025', 'Feb 2025', 'Mar 2025'];
  const s = t12.readStatement(R([['Line', ...ms.flatMap((m) => [`${m} Actual`, `${m} Budget`])], ...LINES.map(([l, v]) => [l, ...ms.flatMap(() => [v / 12, v / 10])])]));
  assert.deepEqual(s.months, ['2025-01', '2025-02', '2025-03']);
  assert.equal(s.lines[0].months[0], 10000);
});

/* Property tax bill, utility bill and unit mix readers (app/factsread.js): only labelled figures, each with its page and line (or
 * sheet and row); what the page does not settle is asked, and a figure that depends on it is left out until it is answered; a
 * year's tax is never counted twice; a two-month bill is not a monthly one. Invented fixtures in several layouts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pdfOf } from './rr-fixtures.js';
import { TAX, UTIL, MIX, pairsPage, gridPage } from './facts-fixtures.js';
import { readFacts, factsLine, FACT_TYPES } from '../app/factsread.js';

const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;
const { pdfPages } = await import('../app/pdftext.js');
const pdfText = async (pages) => ({ pages: await pdfPages(pdfjs, pdfOf(pages), { verbosity: 0 }) });
const f = (r, key) => r.fields.find((x) => x.key === key);
const ids = (r) => r.asks.map((a) => a.id);
const grid = (header, rows, extra = []) => ({ grids: [{ sheet: 'Unit mix', rows: [...extra, header, ...rows].map((cells, i) => ({ r: i + 1, cells })) }] });

test('the three types are named', () => assert.deepEqual([...FACT_TYPES], ['taxbill', 'utilities', 'unitMix']));

/* ---- tax bill */
test('a clean tax bill: year, parcel, total assessed value, the year’s tax once, two installments with due dates, each with its page and line', () => {
  const r = readFacts('taxbill', { pages: TAX.clean });
  assert.equal(f(r, 'taxYear').value, '2025');
  assert.equal(f(r, 'parcel').value, '14-0207-338');
  assert.equal(f(r, 'assessed').value, 500000);
  assert.equal(f(r, 'annualTax').value, 9600);
  const inst = r.fields.filter((x) => /^installment/.test(x.key));
  assert.deepEqual(inst.map((x) => [x.value.amt, x.value.due]), [[4800, '2025-11-01'], [4800, '2026-05-01']]);
  assert.deepEqual(f(r, 'annualTax').where, { page: 1, line: 11 });
  assert.deepEqual(r.asks, []);
  assert.match(r.notes.join(' '), /counted once/);
});

test('half-year installments never double the year: total 9,600 with two halves of 4,800 is 9,600, not 19,200', () => {
  const r = readFacts('taxbill', { pages: TAX.clean });
  assert.equal(r.fields.filter((x) => x.key === 'annualTax').length, 1);
  assert.notEqual(f(r, 'annualTax').value, 19200);
  assert.equal(r.fields.filter((x) => x.value && x.value.amt).reduce((s, x) => s + x.value.amt, 0), 9600);
});

test('a table PDF (words left, figures right) reads the same, and the PDF’s own line is the provenance', async () => {
  const src = await pdfText([pairsPage('Real Estate Tax Bill', TAX.tablePairs)]);
  const r = readFacts('taxbill', src);
  assert.equal(f(r, 'taxYear').value, '2025');
  assert.equal(f(r, 'parcel').value, '14-0207-338');
  assert.equal(f(r, 'assessed').value, 500000);
  assert.equal(f(r, 'annualTax').value, 9600);
  assert.equal(r.fields.filter((x) => /^installment/.test(x.key)).length, 2);
  assert.equal(f(r, 'annualTax').where.page, 1);
});

test('a spreadsheet: the same figures, with the sheet and row', () => {
  const r = readFacts('taxbill', { grids: TAX.grids });
  assert.equal(f(r, 'annualTax').value, 9600);
  assert.deepEqual(f(r, 'annualTax').where, { sheet: 'Tax bill', row: 5 });
  assert.equal(f(r, 'assessed').value, 500000);
  assert.equal(r.fields.filter((x) => /^installment/.test(x.key)).length, 2);
});

test('installments with no total printed: the year is asked, never added up by itself; "yes" gives the sum once', () => {
  const r = readFacts('taxbill', { pages: TAX.noTotal });
  assert.equal(f(r, 'annualTax'), undefined);
  assert.deepEqual(ids(r), ['annualFromParts']);
  const yes = readFacts('taxbill', { pages: TAX.noTotal }, { annualFromParts: 'yes' });
  assert.equal(f(yes, 'annualTax').value, 4800);
  const no = readFacts('taxbill', { pages: TAX.noTotal }, { annualFromParts: 'no' });
  assert.equal(f(no, 'annualTax'), undefined);
});

test('a second-half bill: one installment, and "total tax due" (that installment) is not the year', () => {
  const r = readFacts('taxbill', { pages: TAX.secondHalf });
  assert.equal(f(r, 'annualTax'), undefined);
  assert.equal(r.fields.filter((x) => /^installment/.test(x.key)).length, 1);
  assert.match(r.notes.join(' '), /Only part of the year/);
  assert.equal(f(r, 'assessed').value, 500000);
});

test('installments that do not add up to the printed total are asked, and the answer decides', () => {
  const r = readFacts('taxbill', { pages: TAX.conflict });
  assert.deepEqual(ids(r), ['annualConflict']);
  assert.equal(f(r, 'annualTax'), undefined);
  assert.equal(f(readFacts('taxbill', { pages: TAX.conflict }, { annualConflict: 'total' }), 'annualTax').value, 9600);
  assert.equal(f(readFacts('taxbill', { pages: TAX.conflict }, { annualConflict: 'sum' }), 'annualTax').value, 8000);
});

test('two tax years on the bill: asked which; the year is blank until answered', () => {
  const r = readFacts('taxbill', { pages: TAX.twoYears });
  assert.deepEqual(ids(r), ['taxYear']);
  assert.equal(f(r, 'taxYear'), undefined);
  assert.equal(f(readFacts('taxbill', { pages: TAX.twoYears }, { taxYear: '2025' }), 'taxYear').value, '2025');
});

test('only "total tax due" on a bill: asked whether it is the year, not assumed', () => {
  const r = readFacts('taxbill', { pages: TAX.dueOnly });
  assert.equal(f(r, 'annualTax'), undefined);
  assert.deepEqual(ids(r), ['dueIsYear']);
  assert.equal(f(readFacts('taxbill', { pages: TAX.dueOnly }, { dueIsYear: 'yes' }), 'annualTax').value, 7250);
  assert.equal(f(readFacts('taxbill', { pages: TAX.dueOnly }, { dueIsYear: 'no' }), 'annualTax'), undefined);
});

test('due dates that could be month/day or day/month are asked; the amounts are still read, the dates blank until answered', () => {
  const r = readFacts('taxbill', { pages: TAX.dates });
  assert.deepEqual(ids(r), ['dateOrder']);
  assert.equal(f(r, 'annualTax').value, 9600);
  assert.equal(r.fields.find((x) => /^installment/.test(x.key)).value.due, null);
  const a = readFacts('taxbill', { pages: TAX.dates }, { dateOrder: 'mdy' });
  assert.equal(a.fields.find((x) => /^installment/.test(x.key)).value.due, '2026-03-04');
  const b = readFacts('taxbill', { pages: TAX.dates }, { dateOrder: 'dmy' });
  assert.equal(b.fields.find((x) => /^installment/.test(x.key)).value.due, '2026-04-03');
});

test('a bill with none of the labels reads nothing: blank, never zero', () => {
  const r = readFacts('taxbill', { pages: ['Notice of something\nPlease see the enclosed letter.\nThank you, 2025'] });
  assert.deepEqual(r.fields, []);
  assert.deepEqual(r.asks, []);
});

/* ---- utility bill */
test('an electric bill: type, period from and to, charge, usage and its unit, each with its line', () => {
  const r = readFacts('utilities', { pages: UTIL.electric });
  assert.equal(f(r, 'utilityType').value, 'Electric');
  assert.equal(f(r, 'periodFrom').value, '2026-02-03');
  assert.equal(f(r, 'periodTo').value, '2026-03-05');
  assert.equal(f(r, 'periodDays').value, 31);
  assert.equal(f(r, 'charge').value, 2310.45);
  assert.deepEqual(f(r, 'usage').value, { amount: 14820, unit: 'kWh' });
  assert.deepEqual(f(r, 'charge').where, { page: 1, line: 8 });
  assert.deepEqual(r.asks, []);
});

test('a two-month bill is two months: the period is 61 days, and the amount is for all of it, not divided into a month', () => {
  const r = readFacts('utilities', { pages: UTIL.twoMonth });
  assert.equal(f(r, 'periodDays').value, 61);
  assert.equal(f(r, 'charge').value, 4120);
  assert.match(r.notes.join(' '), /about 2 months.*whole period, not one month/);
  assert.equal(r.fields.some((x) => /month/i.test(x.label) && /monthly/i.test(x.label)), false);
  assert.deepEqual(f(r, 'usage').value, { amount: 218, unit: 'CCF' });
  assert.equal(f(r, 'utilityType').value, 'Water and sewer');
});

test('a table PDF and a spreadsheet read the same electric bill', async () => {
  const t = readFacts('utilities', await pdfText([pairsPage('Electric Service Statement', UTIL.electricPairs)]));
  assert.equal(f(t, 'charge').value, 2310.45);
  assert.equal(f(t, 'periodFrom').value, '2026-02-03');
  assert.deepEqual(f(t, 'usage').value, { amount: 14820, unit: 'kWh' });
  const g = readFacts('utilities', { grids: UTIL.grids });
  assert.equal(f(g, 'periodTo').value, '2026-03-05');
  assert.equal(f(g, 'charge').value, 2310.45);
  assert.deepEqual(f(g, 'charge').where, { sheet: 'Utility', row: 5 });
});

test('a period whose dates could be either order is asked, and no period is read until it is answered', () => {
  const r = readFacts('utilities', { pages: UTIL.ambiguousDates });
  assert.deepEqual(ids(r), ['dateOrder']);
  assert.equal(f(r, 'periodFrom'), undefined);
  const m = readFacts('utilities', { pages: UTIL.ambiguousDates }, { dateOrder: 'mdy' });
  assert.equal(f(m, 'periodFrom').value, '2026-03-04');
  assert.equal(f(m, 'periodDays').value, 62);
  const d = readFacts('utilities', { pages: UTIL.ambiguousDates }, { dateOrder: 'dmy' });
  assert.equal(f(d, 'periodFrom').value, '2026-04-03');
  assert.equal(f(d, 'periodDays').value, 3); // the answer matters: the same dates are 62 days one way and 3 the other
});

test('an amount due that carries an earlier balance is asked, not taken as the period; a usage with no unit asks for the unit', () => {
  const r = readFacts('utilities', { pages: UTIL.pastDue });
  assert.equal(f(r, 'charge'), undefined);
  assert.deepEqual(ids(r).sort(), ['amountIsPeriod', 'usageUnit']);
  assert.equal(f(r, 'usage'), undefined);
  const a = readFacts('utilities', { pages: UTIL.pastDue }, { amountIsPeriod: 'yes', usageUnit: 'kWh' });
  assert.equal(f(a, 'charge').value, 2730.4);
  assert.deepEqual(f(a, 'usage').value, { amount: 1240, unit: 'kWh' });
});

test('a bill that mentions two kinds of service asks which; one that names none leaves it blank', () => {
  const r = readFacts('utilities', { pages: ['Combined Utility Statement\nElectric charges and Water charges\nService Period: 01/15/2026 - 02/16/2026\nCurrent Charges $500.00'] });
  assert.deepEqual(ids(r), ['utilType']);
  assert.equal(f(readFacts('utilities', { pages: ['Combined Utility Statement\nElectric charges and Water charges\nService Period: 01/15/2026 - 02/16/2026\nCurrent Charges $500.00'] }, { utilType: 'water' }), 'utilityType').value, 'Water and sewer');
  assert.equal(f(readFacts('utilities', { pages: ['Statement\nCurrent Charges $500.00'] }), 'utilityType'), undefined);
});

/* ---- unit mix */
test('a unit mix: type, count, SF, in-place and market rent, per row with its line; the total is checked', async () => {
  const src = await pdfText([gridPage('Unit Mix', MIX.header, [...MIX.rows, MIX.total])]);
  const r = readFacts('unitMix', src);
  const rows = r.fields.filter((x) => x.key === 'unitType').map((x) => x.value);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], { type: '1 Bed / 1 Bath', count: 24, sf: 650, sfBasis: 'avg', inPlaceRent: { amt: 1350, period: 'month' }, marketRent: { amt: 1425, period: 'month' } });
  assert.deepEqual(r.asks, []);
  assert.match(r.notes.join(' '), /50 units add up to the Total row/);
  assert.ok(r.fields[0].where.page === 1 && r.fields[0].where.line > 0);
});

test('a header that does not say monthly or annual, or average or total SF: asked; the Total row can settle the SF', () => {
  const r = readFacts('unitMix', grid(MIX.plainHeader, MIX.rows));
  assert.deepEqual(ids(r).sort(), ['rentPeriod', 'sfBasis']);
  const row = r.fields[0].value;
  assert.equal(row.inPlaceRent, undefined);
  assert.equal(row.sf, undefined);
  assert.match(r.fields[0].text, /per unit or total: asked/);
  const s = readFacts('unitMix', grid(MIX.plainHeader, [...MIX.rows, MIX.totalSf]));
  assert.deepEqual(ids(s), ['rentPeriod']);
  assert.equal(s.fields[0].value.sfBasis, 'avg');
  const a = readFacts('unitMix', grid(MIX.plainHeader, MIX.rows), { sfBasis: 'total', rentPeriod: 'year' });
  assert.deepEqual(a.fields[0].value, { type: 'Studio', count: 10, sf: 450, sfBasis: 'total', inPlaceRent: { amt: 1100, period: 'year' }, marketRent: { amt: 1200, period: 'year' } });
});

test('one rent column: in-place or market is asked, never assumed', () => {
  const r = readFacts('unitMix', grid(MIX.oneRent, MIX.oneRentRows));
  assert.deepEqual(ids(r).sort(), ['rentPeriod', 'rentPlace', 'sfBasis']);
  const a = readFacts('unitMix', grid(MIX.oneRent, MIX.oneRentRows), { rentPlace: 'market', rentPeriod: 'month', sfBasis: 'avg' });
  assert.deepEqual(a.fields[0].value.marketRent, { amt: 1100, period: 'month' });
  assert.equal(a.fields[0].value.inPlaceRent, undefined);
});

test('a header over two rows, and a rent per SF column that is not the rent', () => {
  const r = readFacts('unitMix', grid(['Unit Type', 'Units', 'Avg', 'In-Place', 'Market', 'Rent / SF'], [['Studio', '10', '450', '$1,100', '$1,200', '$2.44']], [['', '', 'SF', 'Rent (Monthly)', 'Rent (Monthly)', '']]).grids ? { grids: [{ sheet: 'Mix', rows: [['Unit Type', 'Units', 'Avg', 'In-Place', 'Market', 'Rent / SF'], ['', '', 'SF', 'Rent / Month', 'Rent / Month', ''], ['Studio', '10', '450', '$1,100', '$1,200', '$2.44']].map((cells, i) => ({ r: i + 1, cells })) }] } : null);
  assert.deepEqual(r.asks, []);
  assert.deepEqual(r.fields[0].value, { type: 'Studio', count: 10, sf: 450, sfBasis: 'avg', inPlaceRent: { amt: 1100, period: 'month' }, marketRent: { amt: 1200, period: 'month' } });
});

test('a count that is not a whole number is left blank, never zero, and the Total row that disagrees is said', () => {
  const r = readFacts('unitMix', grid(MIX.header, [['Studio', 'n/a', '450', '$1,100', '$1,200'], ['1 Bed', '24', '650', '$1,350', '$1,425'], ['Total', '50', '', '', '']]));
  assert.equal(r.fields[0].value.count, null);
  assert.match(r.fields[0].text, /units not read/);
  assert.match(r.notes.join(' '), /no clear unit count: left blank/);
  const m = readFacts('unitMix', grid(MIX.header, [['Studio', '10', '450', '$1,100', '$1,200'], ['Total', '12', '', '', '']]));
  assert.match(m.notes.join(' '), /Total row says 12 units but the rows add up to 10/);
});

test('no unit mix table: nothing is read', () => {
  const r = readFacts('unitMix', { pages: ['Property description\nA 50 unit building built in 1998.'] });
  assert.deepEqual(r.fields, []);
});

test('factsLine says what was read and that it is to be checked', () => {
  assert.match(factsLine(readFacts('taxbill', { pages: TAX.clean })), /Read \d+ figures.*check each against the page/);
  assert.equal(factsLine({ fields: [], asks: [] }), '');
});

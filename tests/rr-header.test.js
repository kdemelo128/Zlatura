/* Bug 1c: a header whose label runs over two lines with only that one cell on the second line ("Annual" over
 * "Rent", the other labels on the first line) used to end the header after one line, so the lone "Rent" line was
 * read as a body line, the table had no rows, and no rent roll was found. All invented. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rentRoll } from '../app/om.js';
import { tbl, C9, R } from './rr-fixtures.js';

const rows = [
  R('101', 'Maple Leaf Bakery', '2,000', '01/01/2021', '12/31/2030', '$60,000', '$30.00', '$5,000', '3%'),
  R('102', 'Quillfeather Books', '1,500', '06/01/2022', '05/31/2027', '$42,000', '$28.00', '$3,500', '3%'),
  R('103', 'Copperline Yoga', '1,200', '03/01/2023', '02/28/2033', '$36,000', '$30.00', '$3,000', '3%'),
];
const total = R('', 'Total', '4,700', '', '', '$138,000', '', '', '');
const twoLine = (cols) => cols.map((c) => (c.h === 'Annual Rent' ? { ...c, h: 'Annual\nRent' } : c.h === 'Monthly Rent' ? { ...c, h: 'Monthly\nRent' } : c));

test('Annual over Rent, the other labels on the first line: the rent roll is found, with its rent column', () => {
  const rr = rentRoll([`Rent Roll\n\n${tbl(twoLine(C9), [...rows, total])}`]);
  assert.ok(rr, 'a rent roll');
  assert.equal(rr.rows.length, 3);
  assert.deepEqual(rr.rows.map((r) => r.annual), [60000, 42000, 36000]);
  assert.deepEqual(rr.rows.map((r) => r.monthly), [5000, 3500, 3000]);
  assert.equal(rr.columns.find((c) => c.kind === 'annual').label, 'Annual Rent');
  assert.equal(rr.issues.filter((i) => i.level === 'fail').length, 0);
});

test('a header that is already on one line reads as before', () => {
  const rr = rentRoll([`Rent Roll\n\n${tbl(C9, [...rows, total])}`]);
  assert.deepEqual(rr.rows.map((r) => r.annual), [60000, 42000, 36000]);
});

test('a tenant named like a column word, on the first row under the header, is not swallowed into it', () => {
  // no blank line between the header and the first row
  const first = R('100', 'Rent-A-Center', '1,000', '01/01/2022', '12/31/2031', '$30,000', '$30.00', '$2,500', '3%');
  const lines = tbl(C9, [first, rows[0], total]).split('\n');
  const rr = rentRoll([`Rent Roll\n\n${lines[0]}\n${lines.slice(2).join('\n')}`]);
  assert.ok(rr);
  assert.equal(rr.columns.find((c) => c.kind === 'tenant').label, 'Tenant');
  assert.deepEqual(rr.rows.map((r) => r.tenant), ['Rent-A-Center', 'Maple Leaf Bakery']);
});

test('a tenant name on a line of its own under the header (figures on the next line) is not swallowed into the Tenant label', () => {
  const nameLine = R('', 'Rent-A-Center Group', '');
  const figures = R('100', '', '1,000', '01/01/2022', '12/31/2031', '$30,000', '$30.00', '$2,500', '3%');
  const lines = tbl(C9, [nameLine, figures, total]).split('\n').filter((l, i) => i !== 1);   // header, name, figures, total: no blank line
  const rr = rentRoll([`Rent Roll\n\n${lines.join('\n')}`]);
  assert.ok(rr);
  assert.equal(rr.columns.find((c) => c.kind === 'tenant').label, 'Tenant');
  assert.match(rr.rows[0].tenant || '', /Rent-A-Center Group/);
});

test('a section heading under the header is not swallowed into it', () => {
  const lines = tbl(C9, [R('101', 'Maple Leaf Bakery', '2,000', '01/01/2021', '12/31/2030', '$60,000', '$30.00', '$5,000', '3%'), total]).split('\n');
  const text = `Rent Roll\n\n${lines[0]}\nRetail\n${lines.slice(2).join('\n')}`;
  const rr = rentRoll([text]);
  assert.ok(rr);
  assert.equal(rr.columns.map((c) => c.label).join('|'), C9.map((c) => c.h).join('|'));
  assert.equal(rr.rows.length, 1);
});

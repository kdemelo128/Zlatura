/* Underwriting U6: T-12 line checks K13 (a category on another side than the part of the statement the line is
 * printed in) and K28 (the same line twice), underwriting.md 3.6. Invented statements; each test fails on 4.7.41. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importStatement, fileLine, lineChecks, t12Qc, t12OpenChecks, statementTotals } from '../app/t12.js';

const M = ['Jan 2026', 'Feb 2026', 'Mar 2026'];
const imp = (cells) => importStatement(cells.map((c, i) => ({ r: i + 1, cells: c })), { file: 'invented.csv', sheet: 'CSV' });
const line = (t, label, n = 0) => t.lines.filter((l) => l.label === label)[n];
// Income: rent 1,000 a month, parking 50 a month twice (the same months); Expenses: taxes 100, roof work 300 in Feb;
// after NOI: mortgage interest 400 a month
const base = () => imp([
  ['Description', ...M], ['INCOME'], ['Base Rent', 1000, 1000, 1000], ['Parking Income', 50, 50, 50], ['Parking Income', 50, 50, 50],
  ['EXPENSES'], ['Real Estate Taxes', 100, 100, 100], ['Roof Replacement Capital', 0, 300, 0],
  ['Net Operating Income', 1000, 700, 1000], ['Mortgage Interest', 400, 400, 400],
]);

test('K13: a line under Income filed as an expense is a warning naming both sides', () => {
  const t = base();
  assert.deepEqual(lineChecks(t).filter((c) => c.kind === 'side'), [], 'as read, every filed line sits on its own side');
  fileLine(t, line(t, 'Base Rent').id, 'repairs', { sameLabel: false });
  const c = lineChecks(t).find((x) => x.kind === 'side');
  assert.equal(c.id, `side.${line(t, 'Base Rent').id}`);
  assert.equal(c.level, 'warn');
  assert.equal(c.amount, 3000);
  assert.equal(c.text, 'Base Rent is printed under income but filed as repairs and maintenance (operating expenses): check its category.');
  assert.ok(t12OpenChecks(t).some((x) => x.id === c.id), 'it waits in Review and the panel until seen');
});

test('K13: a capital line under Expenses filed below the line is not a conflict; an after-NOI line filed as operating is', () => {
  const t = base();
  fileLine(t, line(t, 'Roof Replacement Capital').id, 'capex');
  assert.equal(lineChecks(t).filter((c) => c.kind === 'side').length, 0);
  fileLine(t, line(t, 'Mortgage Interest').id, 'repairs');
  const c = lineChecks(t).filter((x) => x.kind === 'side');
  assert.equal(c.length, 1);
  assert.match(c[0].text, /^Mortgage Interest is printed under below the line but filed as repairs and maintenance \(operating expenses\)/);
});

test('K13: a line printed under no heading is never flagged', () => {
  const t = imp([['Description', ...M], ['Base Rent', 1000, 1000, 1000], ['Real Estate Taxes', 100, 100, 100]]);
  fileLine(t, line(t, 'Base Rent').id, 'repairs');
  assert.equal(lineChecks(t).filter((c) => c.kind === 'side').length, 0);
});

test('K28: the same line twice is one note on the first, and both still count', () => {
  const t = base();
  const d = lineChecks(t).filter((c) => c.kind === 'dupline');
  assert.equal(d.length, 1);
  assert.equal(d[0].id, `dupline.${line(t, 'Parking Income').id}`);
  assert.equal(d[0].level, 'info');
  assert.equal(d[0].amount, 150);
  assert.equal(d[0].text, '“Parking Income” appears twice with the same months (rows 4, 5): the same line read twice, or two real lines? Both count.');
  assert.equal(statementTotals(t).by.parking, 300, 'nothing is dropped: 2 x 150');
  assert.ok(!t12OpenChecks(t).some((x) => x.kind === 'dupline'), 'a note, not a check');
  assert.ok(t12Qc(t).checks.some((x) => x.id === d[0].id), 'it shows in the T-12 Data QC panel');
});

test('K28: same label but other months is not a duplicate; three times says so', () => {
  const two = imp([['Description', ...M], ['INCOME'], ['Parking Income', 50, 50, 50], ['Parking Income', 50, 60, 50]]);
  assert.equal(lineChecks(two).filter((c) => c.kind === 'dupline').length, 0);
  const three = imp([['Description', ...M], ['INCOME'], ['Parking Income', 50, 50, 50], ['Parking Income', 50, 50, 50], ['Parking Income', 50, 50, 50]]);
  const d = lineChecks(three).filter((c) => c.kind === 'dupline');
  assert.equal(d.length, 1);
  assert.match(d[0].text, /appears 3 times with the same months \(rows 3, 4, 5\)/);
  assert.equal(d[0].amount, 300);
});

/* Reading by content, slice 3: income statements whose columns are not the usual months-and-Total
 * (docs/proposals/reader-content.md, section 10, the money note). Every amount stays as printed, to whole cents;
 * nothing is scaled, annualised or turned into months; a blank is never a zero; a reading by content is kept only
 * when the statement's own arithmetic agrees, and otherwise the file is refused with the reason. All invented. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const T = await import('../app/t12.js');
const R = (arr) => arr.map((cells, r) => ({ r: r + 1, cells }));
const LINES = [['Gross Potential Rent', 120000], ['Vacancy Loss', -6000], ['Total Revenue', 114000], ['Real Estate Taxes', 12000], ['Insurance', 4000], ['Total Operating Expenses', 16000], ['Net Operating Income', 98000]];

/* ---- 1. a body row is never the heading row */

test('1: a "Total Revenue" row with an amount is not taken for the heading row; the message says what is missing', () => {
  assert.throws(() => T.readStatement(R([['Description', 'Notes'], ...LINES])), /No months or total column were found/);
});

test('1: a heading row that holds years (2024, 2025) and a Total is still the heading row', () => {
  const s = T.readStatement(R([['Description', 2024, 'Total'], ...LINES.map(([l, v]) => [l, v - 1000, v])]));
  assert.equal(s.totalCol, 2);
  assert.equal(s.stated.noi.value, 98000);
});

/* ---- 2. a single annual column, kept only when the arithmetic agrees */

const imp = (rows) => T.importStatement(R(rows), { file: 'x.xlsx', sheet: 'S', now: 0 });
const lineTotals = (t) => Object.fromEntries(t.lines.map((l) => [l.label, l.total]));

for (const h of ['2025', 2025, 'FY 2025', 'Year Ended December 31, 2025', '2025 Actual', 'Actual 2025']) {
  test(`2: one amounts column headed “${h}” is read as the year's figures, as printed, because the totals agree`, () => {
    const t = imp([['Description', h], ...LINES]);
    assert.deepEqual(lineTotals(t), { 'Gross Potential Rent': 120000, 'Vacancy Loss': -6000, 'Real Estate Taxes': 12000, Insurance: 4000 });
    assert.equal(t.stated.noi.value, 98000);
    assert.deepEqual(t.months, []);
    assert.equal(t.period.basis, 'annual');
    const note = T.valueChecks(t).find((c) => c.id === 'period.content');
    assert.ok(note && note.level === 'info', 'the reading is said');
  });
}

for (const h of ['Actual', 'Amount']) {
  test(`2: a column headed only “${h}” is read, but its period is not called a year, and Review says so`, () => {
    const t = imp([['Account', h], ...LINES]);
    assert.equal(t.period.basis, 'other');
    const note = T.valueChecks(t).find((c) => c.id === 'period.content');
    assert.equal(note.level, 'warn');
    assert.match(note.text, /Nothing on the sheet says it covers a full year/);
  });
}

test('2: when the stated NOI does not agree with the lines, the file is refused, with the reason', () => {
  const off = LINES.map(([l, v]) => [l, l === 'Net Operating Income' ? 99000 : v]);
  assert.throws(() => imp([['Description', '2025'], ...off]), /don’t add up/);
});

test('2: with no total row to check against, the file is refused (not guessed)', () => {
  const bare = LINES.filter(([l]) => !/^(Total|Net Operating)/.test(l));
  assert.throws(() => imp([['Description', '2025'], ...bare]), /no total row its lines can be checked against/);
});

test('2: two amounts columns (2024 and 2025, or Budget and Actual) with no Total are not guessed between', () => {
  assert.throws(() => imp([['Description', '2024', '2025'], ...LINES.map(([l, v]) => [l, v, v])]), /No months or total column/);
  assert.throws(() => imp([['Description', 'Budget', 'Actual'], ...LINES.map(([l, v]) => [l, v, v])]), /No months or total column/);
});

test('2: the OM statement reader (readStatement) is not changed: no content reading there', () => {
  assert.throws(() => T.readStatement(R([['Description', '2025'], ...LINES])), /No months or total column/);
});

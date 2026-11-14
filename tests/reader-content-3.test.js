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

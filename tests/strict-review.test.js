/* Underwriting U3: the strict review setting (`review.strict`, underwriting.md 3.4, owner decision 8: off by default).
 * C01/C02: in strict mode "Use" waits while a warning is open and is allowed once it is resolved; at the default
 * nothing is gated. Invented statements; each test fails on 4.7.38, which has no such setting. */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setConventions, conv, CONVENTIONS } from '../app/engine/conventions.js';
import { strictOpen, strictWords } from '../app/review.js';
import { importStatement, t12OpenChecks, markSeen } from '../app/t12.js';

const rows = (cells) => cells.map((c, i) => ({ r: i + 1, cells: c }));
// Jan-Dec 2025, rent 1,000 a month; taxes 100 a month with March left empty: one warning (blank months), no failure
const blankMarch = () => importStatement(rows([
  ['Description', ...['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m) => `${m} 2025`)],
  ['INCOME'], ['Base Rent', ...Array(12).fill(1000)],
  ['EXPENSES'], ['Real Estate Taxes', 100, 100, '', 100, 100, 100, 100, 100, 100, 100, 100, 100],
]), { file: 'invented.csv', sheet: 'CSV' });

afterEach(() => setConventions({ 'review.strict': 'fails' }));

test('the setting: default "failed checks only", two choices, a bad saved value ignored', () => {
  const c = CONVENTIONS.find((x) => x.id === 'review.strict');
  assert.equal(c.default, 'fails');
  assert.deepEqual(c.options.map(([v]) => v), ['fails', 'all']);
  assert.equal(conv('review.strict'), 'fails');
  setConventions({ 'review.strict': 'everything' });
  assert.equal(conv('review.strict'), 'fails');
  setConventions({ 'review.strict': 'all' });
  assert.equal(conv('review.strict'), 'all');
});

test('C02: at the default an open warning gates nothing', () => {
  const t = blankMarch();
  const open = t12OpenChecks(t);
  assert.ok(open.length >= 1 && open.every((c) => c.level === 'warn'), JSON.stringify(open.map((c) => [c.id, c.level])));
  assert.equal(strictOpen({ t12: t }), 0);
});

test('C01: in strict mode an open warning holds Use, and resolving it releases it', () => {
  setConventions({ 'review.strict': 'all' });
  const t = blankMarch();
  const n = t12OpenChecks(t).length;
  assert.equal(strictOpen({ t12: t }), n);
  assert.match(strictWords(1), /^1 check still open: review it first/);
  assert.match(strictWords(2), /^2 checks still open: review them first/);
  for (const c of t12OpenChecks(t)) markSeen(t, c.id);
  assert.equal(strictOpen({ t12: t }), 0);
});

test('strict mode counts the rent roll’s open checks too (warnings and failures), and resolved ones not at all', () => {
  setConventions({ 'review.strict': 'all' });
  const rrQc = { checks: [{ id: 'a', level: 'warn' }, { id: 'b', level: 'fail' }, { id: 'c', level: 'info' }, { id: 'd', level: 'warn', resolved: { how: 'accepted' } }, { id: 'e', level: 'pass' }] };
  assert.equal(strictOpen({ rrQc }), 2);
  assert.equal(strictOpen(null), 0);
  assert.equal(strictOpen({}), 0);
});

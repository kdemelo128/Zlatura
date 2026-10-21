/* T-12 PR 3b "Value flags, thresholds and run rate". Every figure is invented
 * and worked by hand in tests/fixtures/t12-values-fixtures.js. Each test here
 * fails on 4.7.35. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quarterEndRows } from './fixtures/t12-values-fixtures.js';
import { importStatement, statementTotals, annualized, periodChecks, windowOf, t12OpenChecks, applyT12Fix } from '../app/t12.js';

const imp = (rows, opts = {}) => importStatement(rows, { file: 'invented.csv', sheet: 'CSV', ...opts });
const check = (t, id) => periodChecks(t).find((c) => c.id === id);

/* D (F1): columns headed by quarter-end dates */
test('F1: four quarter-end columns are not Annualised x 3 unless the broker says they are single months', () => {
  const t = imp(quarterEndRows());
  assert.equal(statementTotals(t).noi, 114000, 'as read: four columns');
  const c = check(t, 'period.quarterends');
  assert.ok(c, 'a check says the columns are 3 months apart');
  assert.equal(c.level, 'warn');
  assert.equal(c.holds, 'annualise');
  assert.equal(c.amount, 228000, '|342,000 - 114,000|');
  assert.match(c.text, /The 4 columns are 3 months apart \(Mar to Dec 2025\)/);
  assert.match(c.text, /Annualize would multiply by 3/);
  assert.deepEqual(c.fixes.map((f) => f.id), ['seen']);
  assert.equal(c.fixes[0].label, 'They are single months');
  assert.equal(windowOf(t).ask, true, 'Annualise and the run rate wait');
  assert.equal(t12OpenChecks(t).some((x) => x.id === 'period.quarterends'), true);
  // nothing else is held: the totals and Use are not
  assert.equal(periodChecks(t).some((x) => x.holds === 'totals'), false);
  // the broker says they are single months: Annualise is offered, 342,000
  applyT12Fix(t, 'period.quarterends', 'seen');
  assert.equal(windowOf(t).ask, false);
  assert.equal(annualized(statementTotals(t), windowOf(t).n).noi, 342000);
});

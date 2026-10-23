/* The T-12 to pro forma bridge (master plan 7.9, PR B1: the logic; app/bridge.js): from the T-12's normalised NOI
 * to the OM's pro forma NOI, one step per category, in whole cents, with two residual rows so that the steps add up
 * to the cent. Matched by category, never forced; held for a partial year as U2 does. Every statement is invented
 * and worked by hand (tests/fixtures/bridge-fixtures.js). Each test here fails on 4.7.56, which has no bridge.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { importStatement, normalise, setMethod, setWindow } from '../app/t12.js';
import { readOm } from '../app/om.js';
import { pfBridge, pfColumn, BRIDGE_ENDS_AT } from '../app/bridge.js';
import { uRows } from './fixtures/t12-normalise-fixtures.js';
import { t12Rows, omPage, omRows, omBRows, omThousandsRows, omStatedRows, omUnmatchedRows } from './fixtures/bridge-fixtures.js';

const imp = (rows) => importStatement(rows, { file: 'invented.csv', sheet: 'CSV' });
const line = (t, label) => t.lines.find((l) => l.label === label);
const methods = (t, by) => { for (const [label, m] of Object.entries(by)) setMethod(t, line(t, label).id, m); return t; };

/** An OM read from page text; the deal it would give (the pro forma NOI and where it was read from). */
const omOf = (rows, opts = {}) => readOm([omPage(rows, opts)], { asOf: '2026-10-14' });
function dealOf(om) {
  const f = om.fields.noi_pf;
  return { figures: { noi_pf: f.value }, sources: { noi_pf: { table: f.table, col: f.col, orig: f.value } } };
}
/** The bridge of a T-12 to an OM's pro forma column. */
function bridge(t, om, deal = dealOf(om), opts) {
  const res = normalise(t);
  return pfBridge(t, res, pfColumn(om.statement.columns, deal).col, deal, opts);
}
const byKey = (b) => Object.fromEntries(b.rows.map((r) => [r.key, r]));
const total = (b) => b.start.c + b.rows.reduce((s, r) => s + r.c, 0);

/* ---------------------------------------------------- 1. every row, by hand */

test('a 12-month T-12 against an OM pro forma: every row to the cent, as the fixture works them', () => {
  const t = imp(t12Rows());
  const b = bridge(t, omOf(omRows()));
  assert.equal(b.held, false);
  assert.equal(b.start.c, 8209224);
  assert.match(b.start.label, /^T-12 NOI \(as reported, 12 months\)$/);
  assert.deepEqual(b.rows.map((r) => [r.key, r.tag, r.c]), [
    ['rent', 'both', 600000], ['vacancy', 'pfOnly', -630000], ['parking', 't12Only', -300300], ['otherIncome', 'both', 30038],
    ['taxes', 'both', -100000], ['utilities', 'both', -9560], ['repairs', 'both', -49400], ['payroll', 't12Only', 960000],
    ['nochange', 'nochange', 0],
  ]);
  assert.equal(b.end.c, 8710002);
  assert.equal(total(b), b.end.c, 'start plus the rows is the end');
  assert.equal(b.rows.find((r) => r.key === 'rent').amount, 6000);
  assert.match(b.end.label, /OM.s, as printed/);
});

test('the bridge ends at the OM’s printed NOI, and says so when the deal’s differs; one constant changes that', () => {
  assert.equal(BRIDGE_ENDS_AT, 'printed');
  const t = imp(t12Rows());
  const om = omOf(omRows());
  const deal = dealOf(om);
  deal.figures.noi_pf = 90000;                         // edited to $90,000.00
  const b = bridge(t, om, deal);
  assert.equal(b.end.c, 8710002);
  assert.equal(total(b), 8710002);
  assert.deepEqual(b.notes.map((n) => [n.kind, n.c]), [['dealNoi', 9000000]]);
  const d = bridge(t, om, deal, { endsAt: 'deal' });
  assert.equal(d.end.c, 9000000);
  assert.equal(total(d), 9000000, 'still exact');
  assert.equal(byKey(d).deal.c, 289998);
});

test('a pro forma NOI not read from a table is one row, "Not broken down"', () => {
  const t = imp(t12Rows());
  const deal = { figures: { noi_pf: 90000 }, sources: { noi_pf: { page: 2, line: 'NOI', orig: 90000 } } };
  const b = pfBridge(t, normalise(t), null, deal);
  assert.equal(b.held, false);
  assert.deepEqual(b.rows.map((r) => [r.label, r.c]), [['Not broken down', 9000000 - 8209224]]);
  assert.equal(total(b), 9000000);
});

/* ------------------------------------------- 2. closure, every method combination */

test('closure to the cent for every combination of methods, against three OMs', () => {
  const OMS = [omOf(omRows()), omOf(omBRows(), { heads: ['Pro Forma'] }), omOf(omStatedRows(), { heads: ['Pro Forma'] })];
  const METHODS = ['reported', 'annualise', 'runRate', 'exclude'];
  const U = ['Base Rent', 'Parking', 'Storage', 'Repairs', 'Real Estate Taxes', 'Legal'];
  const P = ['Base Rent', 'Parking', 'Laundry Income', 'Real Estate Taxes', 'Insurance', 'Repairs', 'Payroll', 'Utilities'];
  let ran = 0;
  fc.assert(fc.property(fc.constantFrom(0, 1), fc.array(fc.constantFrom(...METHODS), { minLength: 8, maxLength: 8 }), fc.constantFrom(0, 1, 2), (which, ms, o) => {
    const t = which ? imp(uRows()) : imp(t12Rows());
    if (which) setWindow(t, 'active');
    methods(t, Object.fromEntries((which ? U : P).map((l, i) => [l, ms[i]])));
    const b = bridge(t, OMS[o]);
    if (b.held) { assert.deepEqual(b.rows, []); return; }
    ran += 1;
    assert.ok(b.rows.every((r) => Number.isInteger(r.c)), 'whole cents');
    assert.equal(total(b), b.end.c);
  }), { seed: 20261023, numRuns: 400 });
  assert.ok(ran > 100, `only ${ran} of 400 ran`);
});

/* -------------------------------------------------------- 3. the residual rows */

test('an OM in $000s: its printed NOI against its lines is a row of its own, hand-worked', () => {
  const t = imp(t12Rows());
  const b = bridge(t, omOf(omThousandsRows(), { heads: ['Pro Forma'], note: '($ in 000s)' }));
  assert.equal(b.held, false);
  assert.deepEqual(b.rows.map((r) => [r.key, r.c]), [
    ['rent', 600000], ['vacancy', -600000], ['parking', -300300], ['otherIncome', 79988], ['taxes', -100000], ['insurance', -29992],
    ['utilities', -19520], ['repairs', -99400], ['payroll', 960000], ['printed', 100000],
  ]);
  assert.equal(b.end.c, 8800000);
  assert.equal(total(b), 8800000);
  assert.match(byKey(b).printed.label, /printed NOI against its lines/);
});

test('a T-12 whose methods round line by line: the rounding is a row of its own (-0.01), explained in residueWords’ words', () => {
  const t = imp(uRows());
  setWindow(t, 'active');
  methods(t, { 'Base Rent': 'annualise', Parking: 'annualise', Storage: 'annualise', Repairs: 'runRate', 'Real Estate Taxes': 'runRate', Legal: 'exclude' });
  const b = bridge(t, omOf(omBRows(), { heads: ['Pro Forma'] }));
  assert.equal(b.held, false);
  assert.equal(b.start.c, 10656861);
  assert.match(b.start.label, /^T-12 NOI, normalised \(a year, from 7 months\)$/);
  assert.deepEqual(b.rows.map((r) => [r.key, r.c]), [
    ['round', -1], ['rent', 500000], ['parking', 28570], ['otherIncome', -21430], ['taxes', -50000], ['repairs', -14000], ['nochange', 0],
  ]);
  assert.match(byKey(b).round.words, /rounded once/);
  assert.equal(b.end.c, 11100000);
  assert.equal(total(b), 11100000);
});

/* --------------------------------------------------- 4. lines that are not matched */

test('an OM line filed only by its place gets a row of its own, and is not merged into Other income', () => {
  const t = imp(t12Rows());
  const b = bridge(t, omOf(omUnmatchedRows()));
  const by = byKey(b);
  assert.equal(by.otherIncome.c, 30038, 'Other income is unchanged by the loose line');
  const loose = b.rows.filter((r) => r.tag === 'unmatched');
  assert.deepEqual(loose.map((r) => [r.label, r.c]), [['Tenant Sundry Receipts', 80000]]);
  assert.match(loose[0].words, /^Not matched/);
  assert.equal(by.payroll.tag, 't12Only', 'payroll is missing from the OM');
  assert.match(by.payroll.words, /^Only in the T-12: the OM prints no line in this category/);
  assert.equal(by.vacancy.words, 'Only in the pro forma.');
  assert.equal(b.end.c, 8790002);
  assert.equal(total(b), 8790002);
});

test('a section printed as one subtotal is taken as printed and said so; lines below NOI are listed with no step', () => {
  const t = imp(t12Rows());
  const b = bridge(t, omOf(omStatedRows(), { heads: ['Pro Forma'] }));
  assert.match(byKey(b).otherIncome.words, /one subtotal.*used as printed/);
  assert.equal(total(b), b.end.c);
  const t2 = imp(t12Rows());
  t2.lines.push({ id: 'x', label: 'Replacement Reserves', key: 'x', section: 'expense', months: Array(12).fill(10), total: 120, fileTotal: null, category: 'reserves' });
  const b2 = bridge(t2, omOf(omRows()));
  assert.deepEqual(b2.below.t12.map((x) => [x.label, x.c]), [['Replacement Reserves', 12000]]);
  assert.equal(total(b2), b2.end.c);
});

/* ------------------------------------------------------------ 5. the partial year */

test('a 7-month T-12 with one line as reported is held with U2’s words; with every line annualised the bridge runs', () => {
  const t = imp(t12Rows(7));
  const ALL = ['Base Rent', 'Parking', 'Laundry Income', 'Real Estate Taxes', 'Insurance', 'Repairs', 'Payroll', 'Utilities'];
  methods(t, Object.fromEntries(ALL.map((l) => [l, 'annualise'])));
  setMethod(t, line(t, 'Payroll').id, 'reported');
  const om = omOf(omRows());
  const held = bridge(t, om);
  assert.equal(held.held, true);
  assert.deepEqual([held.rows, held.start, held.end], [[], null, null], 'no numbers');
  assert.match(held.words, /1 line is still as reported over 7 months, not a year’s \(Payroll\)/);
  setMethod(t, line(t, 'Payroll').id, 'annualise');
  const b = bridge(t, om);
  assert.equal(b.held, false);
  assert.match(b.start.label, /^T-12 NOI, normalised \(a year, from 7 months\)$/);
  assert.equal(b.start.c, 8209224, '7 months x 12 / 7 is the year');
  assert.equal(b.end.c, 8710002);
  assert.equal(total(b), 8710002);
});

test('held while normalise is held or a line is still open', () => {
  const t = imp(t12Rows());
  t.lines[0].category = null;
  const b = bridge(t, omOf(omRows()));
  assert.equal(b.held, true);
  assert.match(b.words, /still waiting in Review/);
  const q = imp(t12Rows());
  setMethod(q, line(q, 'Repairs').id, 'runRate');
  q.months = [];
  assert.match(bridge(q, omOf(omRows())).words, /^Held: /);
});

/* ----------------------------------------------- 6. a PDF that does not match */

test('a PDF that is not the one read is refused, with the reason', () => {
  const t = imp(t12Rows());
  const read = omOf(omRows());
  const deal = dealOf(read);
  // the right PDF
  assert.ok(pfColumn(read.statement.columns, deal).col);
  // the same table and column, another NOI
  const other = omOf(omRows().map((r) => (r[0] === 'Net Operating Income' ? [r[0], r[1], '$87,300.02'] : r[0] === 'Effective Gross Income' ? [r[0], r[1], '$121,400.50'] : r)));
  const a = pfColumn(other.statement.columns, deal);
  assert.equal(a.col, null);
  assert.match(a.why, /prints a pro forma NOI of \$87,300\.02, not the \$87,100\.02 that was read/);
  // pfBridge refuses it too, if it is given the column anyway
  const given = pfBridge(t, normalise(t), other.statement.columns.find((c) => c.label === 'Pro Forma'), deal);
  assert.equal(given.held, true);
  assert.equal(given.refused, true);
  assert.deepEqual(given.rows, []);
  // another column heading
  const c = pfColumn(omOf(omRows(), { heads: ['Actual', 'Budget'] }).statement.columns, deal);
  assert.equal(c.col, null);
  assert.match(c.why, /no column “Pro Forma”/);
  // no columns given: the PDF is asked for
  const none = pfBridge(t, normalise(t), null, deal);
  assert.equal(none.held, true);
  assert.equal(none.needsPdf, true);
});

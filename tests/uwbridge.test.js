/* app/uwfiller/bridge.js: the deal <-> built-in tool field map (docs/proposals/uw-bridge-fieldmap.md section 2).
 * Invented deal and model only. Each mapping, blank stays blank, ambiguous fields are not carried, a value the tool
 * already holds is not replaced, the tool's starting values are not the broker's. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planIn, applyIn, planOut, changedPaths, MAPPED } from '../app/uwfiller/bridge.js';

const DEFAULTS = { price: '', loan: '', rate: '', amortization: 30, ioMonths: 0, termYears: 10, holdYears: 10, exitCap: '', saleCost: 0.02, closing: 0 };
const blankModel = () => ({ version: 3, name: 'Untitled property', address: '', finance: { ...DEFAULTS } });
const deal = (o = {}) => ({ name: 'Invented Plaza', asOf: '2026-03-31', figures: { price: 2000000.004, address: '1 Example St', city: 'Sample', bsf: 40000 }, loan: { ltv: 65, rate: 6.5, amort: 25, io: false, closing: 1 }, live: { hold: 7, exitCap: 7, saleCost: 2.5 }, hasRentRoll: true, ...o });
const byId = (p) => Object.fromEntries(p.fill.map((f) => [f.id, f.value]));

test('in: every mapped field, with its unit converted (percent numbers become decimals, money is whole cents)', () => {
  const p = planIn(deal(), blankModel(), { defaults: DEFAULTS });
  assert.deepEqual(byId(p), { name: 'Invented Plaza', asOf: '2026-03-31', price: 2000000, rate: 0.065, amort: 25, hold: 7, exitCap: 0.07, saleCost: 0.025 });
  assert.deepEqual(MAPPED.sort(), Object.keys(byId(p)).sort());
  const m = blankModel(); assert.equal(applyIn(m, p), 8);
  assert.equal(m.finance.rate, 0.065); assert.equal(m.finance.exitCap, 0.07); assert.equal(m.finance.holdYears, 7); assert.equal(m.finance.amortization, 25); assert.equal(m.asOf, '2026-03-31');
});

test('in: a blank in the deal stays blank in the tool (never 0, never the tool\'s starting value), and is said', () => {
  const d = deal({ figures: {}, loan: {}, live: {}, name: '', asOf: undefined });
  const m = blankModel();
  const p = planIn(d, m, { defaults: DEFAULTS });
  assert.equal(p.fill.length, 0);
  assert.equal(applyIn(m, p), 0);
  assert.deepEqual(m.finance, DEFAULTS, 'nothing written, not even a 0');
  assert.equal(m.finance.price, ''); assert.equal(m.finance.rate, ''); assert.equal(m.finance.exitCap, '');
  const why = Object.fromEntries(p.notCarried.map((n) => [n.label, n.why]));
  assert.match(why['Amortization, years'], /the deal has no value/);
  assert.match(why['Amortization, years'], /starts at 30 years: check it/);
  assert.match(why['Interest rate'], /the deal has no value/);
});

test('in: 0 and negative figures are not carried as values', () => {
  const p = planIn(deal({ figures: { price: 0 }, loan: { rate: 0, amort: 0 }, live: { hold: 0, exitCap: 0, saleCost: -1 } }), blankModel(), { defaults: DEFAULTS });
  assert.deepEqual(p.fill.map((f) => f.id).sort(), ['asOf', 'name']);
});

test('in: a hold outside the tool\'s 1 to 10 years is not carried, with the reason', () => {
  const p = planIn(deal({ live: { hold: 12 } }), blankModel(), { defaults: DEFAULTS });
  assert.ok(!p.fill.some((f) => f.id === 'hold'));
  assert.match(p.notCarried.find((n) => n.label === 'Hold period, years').why, /outside the tool.s 1 to 10/);
});

test('in: a value the broker already set in the tool is never replaced; a starting value is not the broker\'s', () => {
  const m = blankModel(); m.finance.price = 1500000; m.finance.amortization = 30; m.name = 'My own name';
  // amortization 30 is the tool's starting value and nothing records a change: the deal's 25 goes in
  let p = planIn(deal(), m, { defaults: DEFAULTS });
  assert.equal(byId(p).amort, 25);
  assert.ok(!p.fill.some((f) => f.id === 'price' || f.id === 'name'));
  assert.equal(p.kept.length, 2);
  assert.match(p.notCarried.find((n) => n.label === 'Price').why, /already has \$1,500,000\.00 and the deal has \$2,000,000\.00; the tool.s value is not replaced/);
  // the same 30, recorded as typed in the change log: kept
  p = planIn(deal(), m, { defaults: DEFAULTS, changed: changedPaths({ changeLog: [{ changes: [{ path: 'finance.amortization' }] }] }) });
  assert.ok(!p.fill.some((f) => f.id === 'amort'));
});

test('in: the same value on both sides is not a change', () => {
  const m = blankModel(); m.finance.rate = 0.065;
  assert.ok(!planIn(deal(), m, { defaults: DEFAULTS }).fill.some((f) => f.id === 'rate'));
});

test('in: ambiguous and lossy fields are never carried, each listed with its reason', () => {
  const p = planIn(deal({ hasStatement: true, loan: { ltv: 65, closing: 1, io: true, rate: 6.5, amort: 25 } }), blankModel(), { defaults: DEFAULTS });
  const labels = p.notCarried.map((n) => n.label);
  for (const l of ['Address', 'Building area', 'Loan amount', 'Closing costs', 'Interest-only', 'Rent roll', 'Operating statement', 'Results']) assert.ok(labels.includes(l), l);
  const m = blankModel(); applyIn(m, p);
  assert.equal(m.address, '', 'the address is not written'); assert.equal(m.finance.loan, ''); assert.equal(m.finance.closing, 0); assert.equal(m.finance.ioMonths, 0);
  assert.ok(!('tenants' in m));
});

test('in: nothing is listed for what the deal does not have', () => {
  const labels = planIn(deal({ figures: { price: 1 }, loan: {}, hasRentRoll: false }), blankModel(), { defaults: DEFAULTS }).notCarried.map((n) => n.label);
  for (const l of ['Address', 'Building area', 'Loan amount', 'Rent roll', 'Operating statement']) assert.ok(!labels.includes(l), l);
});

test('out: before and after for each field the broker set in the tool, decimals back to percent exactly', () => {
  const m = blankModel(); Object.assign(m.finance, { price: 2100000.5, rate: 0.07, amortization: 20, holdYears: 5, exitCap: 0.0725, saleCost: 0.03 });
  const p = planOut(m, deal(), { defaults: DEFAULTS, changed: changedPaths({ changeLog: [{ changes: [{ path: 'finance.amortization' }, { path: 'finance.saleCost' }] }] }) });
  const c = Object.fromEntries(p.changes.map((x) => [x.id, x]));
  assert.equal(c.rate.after, 7, 'not 7.000000000000001'); assert.equal(c.exitCap.after, 7.25);
  assert.equal(c.price.after, 2100000.5); assert.equal(c.price.beforeShown, '$2,000,000.00');
  assert.equal(c.hold.before, 7); assert.equal(c.hold.after, 5);
  assert.equal(c.amort.after, 20); assert.equal(c.saleCost.after, 3);
  assert.equal(c.rate.beforeShown, '6.5%'); assert.equal(c.rate.afterShown, '7%'); assert.equal(c.rate.dealPath, 'loan.rate');
});

test('out: blank and starting values are never brought (a blank would clear the deal), unchanged values are not listed', () => {
  const m = blankModel(); m.finance.holdYears = 7;   // blank price, rate, exit cap; amort/hold/sale cost at starting values
  m.finance.rate = '';
  const p = planOut(m, deal(), { defaults: DEFAULTS });
  assert.equal(p.changes.length, 0);
  const why = Object.fromEntries(p.skipped.map((s) => [s.label, s.why]));
  assert.equal(why.Price, 'blank in the tool'); assert.match(why['Amortization, years'], /starting value/);
  // a hold of 7 equal to the deal's 7 and recorded as typed: nothing to change
  assert.equal(planOut(m, deal(), { defaults: DEFAULTS, changed: new Set(['finance.holdYears']) }).changes.length, 0);
});

test('out: a deal blank is shown as blank before; names, address, loan amount and the rent roll are never brought', () => {
  const m = blankModel(); m.name = 'Other name'; m.address = 'Elsewhere'; m.finance.price = 900000; m.finance.loan = 500000; m.tenants = [{ unit: '1', rent: 100 }];
  const p = planOut(m, deal({ figures: {} }), { defaults: DEFAULTS });
  assert.deepEqual(p.changes.map((x) => x.id), ['price']);
  assert.equal(p.changes[0].beforeShown, 'blank'); assert.equal(p.changes[0].before, null);
});

test('out: values the deal cannot take are skipped with a reason', () => {
  const m = blankModel(); Object.assign(m.finance, { price: -5, rate: 7, holdYears: 11, exitCap: 'abc' });
  const p = planOut(m, deal(), { defaults: DEFAULTS, changed: new Set(['finance.price', 'finance.rate', 'finance.holdYears', 'finance.exitCap']) });
  assert.equal(p.changes.length, 0);
  assert.ok(p.skipped.every((s) => /not a value the deal can take|blank|starting/.test(s.why)));
  assert.equal(p.skipped.filter((s) => /not a value/.test(s.why)).length, 4);
});

test('changedPaths: reads the tool\'s change log defensively', () => {
  assert.equal(changedPaths(null).size, 0); assert.equal(changedPaths({ changeLog: 'x' }).size, 0);
  assert.deepEqual([...changedPaths({ changeLog: [null, { changes: null }, { changes: [{ path: 'a' }, { path: 5 }, null] }] })], ['a']);
});

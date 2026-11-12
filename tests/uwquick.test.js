/* The Quick check inside the tool's Model step (app/uwfiller/bridge.js: quickFromTool, toolMeasures, measureFlags).
 * Invented figures, worked by hand. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickFromTool, toolMeasures, measureFlags, QUICK_DEAL_PATHS } from '../app/uwfiller/bridge.js';

// the tool's own starting values (UWFinance.defaults())
const DEFAULTS = { price: '', loan: '', rate: '', amortization: 30, ioMonths: 0, termYears: 10, holdYears: 10, exitCap: '', saleCost: 0.02, closing: 0 };
const model = (finance, extra = {}) => ({ finance: { ...DEFAULTS, ...finance }, tenants: [{}], accounts: [], ...extra });
const ALL = new Set(['finance.amortization', 'finance.holdYears', 'finance.saleCost', 'finance.closing']);

test('a fully set tool prefills every field: dollars to percent of price, decimals to percents, cents kept', () => {
  const m = model({ price: 2000000, loan: 1300000, rate: 0.065, amortization: 25, holdYears: 7, exitCap: 0.07, saleCost: 0.025, closing: 20000 });
  const { values, blank } = quickFromTool(m, { noi: 140000, defaults: DEFAULTS, changed: ALL });
  // 1,300,000 / 2,000,000 = 65 %; 20,000 / 2,000,000 = 1 %
  assert.deepEqual(values, { price: 2000000, noi: 140000, ltv: 65, rate: 6.5, amort: 25, closing: 1, hold: 7, exitCap: 7, saleCost: 2.5 });
  assert.deepEqual(blank, []);
});

test('a value still at the tool\'s starting value is blank, never carried (amortization 30, hold 10, sale cost 2 %, closing 0)', () => {
  const m = model({ price: 2000000, loan: 1000000, rate: 0.06 });
  const { values, blank } = quickFromTool(m, { noi: 100000, defaults: DEFAULTS, changed: new Set() });
  assert.equal(values.amort, null); assert.equal(values.hold, null); assert.equal(values.saleCost, null); assert.equal(values.closing, null);
  assert.equal(values.ltv, 50); assert.equal(values.rate, 6);
  assert.deepEqual(blank.map((b) => b.label).sort(), ['Amortization, years', 'Closing costs', 'Exit cap rate', 'Hold period, years', 'Sale costs'].sort());
});

test('the same starting value, once the broker has changed it, is theirs (even 30 years, even 0 closing)', () => {
  const m = model({ price: 1000000, amortization: 30, closing: 0 });
  const { values } = quickFromTool(m, { noi: null, defaults: DEFAULTS, changed: new Set(['finance.amortization', 'finance.closing']) });
  assert.equal(values.amort, 30); assert.equal(values.closing, 0);
});

test('blanks stay blank: no price means no loan percent, no rent roll or statement means no NOI (an empty model\'s 0 is not an NOI)', () => {
  const m = model({ loan: 500000 }, { tenants: [], accounts: [] });
  const { values, blank } = quickFromTool(m, { noi: 0, defaults: DEFAULTS, changed: ALL });
  assert.equal(values.price, null); assert.equal(values.noi, null); assert.equal(values.ltv, null);
  assert.ok(blank.some((b) => b.label === 'Loan to value' && /needs the price/.test(b.why)));
  assert.ok(blank.some((b) => b.label === 'NOI' && /no rent roll/.test(b.why)));
  // a tool with a tenant and a real NOI of 0 keeps the 0
  assert.equal(quickFromTool(model({ price: 1000000 }), { noi: 0, defaults: DEFAULTS }).values.noi, 0);
});

test('percent conversion is exact to ten places and the loan comes back to the same cent', () => {
  const m = model({ price: 3000000, loan: 1000000 });
  const { values } = quickFromTool(m, { defaults: DEFAULTS });
  assert.equal(values.ltv, 33.3333333333);
  assert.equal(Math.round(3000000 * values.ltv / 100 * 100) / 100, 1000000);
  assert.equal(quickFromTool(model({ price: 800000, loan: 500000 }), { defaults: DEFAULTS }).values.ltv, 62.5);
});

test('a negative loan, or a rate above 100 %, is left blank with a reason', () => {
  const a = quickFromTool(model({ price: 1000000, loan: -5 }), { defaults: DEFAULTS, changed: new Set(['finance.loan']) });
  assert.equal(a.values.ltv, null);
  const b = quickFromTool(model({ price: 1000000, rate: 6.5 }), { defaults: DEFAULTS });
  assert.equal(b.values.rate, null);
});

test('toolMeasures: whole cents, null where the tool has none or its own calculation refused', () => {
  assert.deepEqual(toolMeasures(model({ loan: 1300000.004 }), { errors: [], equity: 720000.126 }), { loan: 1300000, equity: 720000.13 });
  assert.deepEqual(toolMeasures(model({}), { errors: ['Enter rate'], rows: [] }), { loan: null, equity: null });
  assert.deepEqual(toolMeasures(model({ loan: 0 }), null), { loan: null, equity: null });
});

test('measureFlags: more than one cent apart is flagged with both figures; a cent or less is not; a missing side is not', () => {
  assert.deepEqual(measureFlags({ loan: 1300000, equity: 720000 }, { loan: 1300000.01, equity: 720000 }), []);
  const f = measureFlags({ loan: 1300000, equity: 720000 }, { loan: 1299000, equity: 720000.02 });
  assert.deepEqual(f.map((x) => [x.id, x.engine, x.tool, x.diff]), [['loan', 1300000, 1299000, 1000], ['equity', 720000, 720000.02, -0.02]]);
  assert.deepEqual(measureFlags({ loan: 1, equity: null }, { loan: null, equity: 5 }), []);
});

test('every Quick check figure has one deal path', () => {
  assert.deepEqual(Object.keys(QUICK_DEAL_PATHS).sort(), ['amort', 'closing', 'exitCap', 'hold', 'ltv', 'noi', 'price', 'rate', 'saleCost']);
});

import { planQuickToDeal, quickFigureList } from '../app/uwfiller/bridge.js';

test('planQuickToDeal: only differing figures, before and after shown, a blank never clears the deal', () => {
  const deal = { figures: { price: 2000000, noi: null }, loan: { ltv: 65, rate: 6.5 }, live: { hold: 7 } };
  const p = planQuickToDeal({ price: 2000000.004, noi: 140000, ltv: 60, rate: null, amort: 25, hold: 7 }, deal);
  assert.deepEqual(p.changes.map((c) => [c.id, c.dealPath, c.before, c.after, c.beforeShown, c.afterShown]), [
    ['noi', 'figures.noi', null, 140000, 'blank', '$140,000.00'],
    ['ltv', 'loan.ltv', 65, 60, '65%', '60%'],
    ['amort', 'loan.amort', null, 25, 'blank', '25 years'],
  ]);
  assert.deepEqual(p.same, ['Price', 'Hold period, years']);
  assert.deepEqual(planQuickToDeal({}, deal), { changes: [], same: [] });
});

test('quickFigureList: the figures that have a value, money to the cent', () => {
  assert.deepEqual(quickFigureList({ price: 1500000.5, noi: null, ltv: 65 }), [{ label: 'Price', shown: '$1,500,000.50' }, { label: 'Loan to value', shown: '65%' }]);
});

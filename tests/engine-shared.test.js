/* One function for each calculation that used to live twice (cash-flow
 * proposal, phase A1): recoveries, percentage rent and the sale at exit. Every
 * expected value is worked by hand from an invented case. The last tests make
 * sure the Tools and the rent-roll projection reach the same engine function,
 * and give the same dollars. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fc from 'fast-check';
import { shareOf, recoveryAnnual, amountOf } from '../app/engine/recovery.js';
import { breakpointOf, overageOf } from '../app/engine/pctrent.js';
import { reversion } from '../app/engine/returns.js';
import { recovery, percentageRent, dcf, residualLand, holdWithFees } from '../app/calc.js';
import { holdReturns, runScenario } from '../app/deal.js';
import { project, validateLease, validateRentRoll, DEFAULT_SETTINGS } from '../app/lease.js';
import { toCents } from '../app/engine/money.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

/* ------------------------------------------------------------ recoveries */
test('recovery: pro rata, base amount, stop and fixed, worked by hand', () => {
  // 2,500 of 10,000 SF is a quarter
  near(shareOf({ tenantSf: 2500, buildingSf: 10000 }), 0.25);
  near(shareOf({ sharePct: 30, tenantSf: 2500, buildingSf: 10000 }), 0.3, 1e-12); // a typed share wins
  assert.equal(shareOf({ tenantSf: 2500 }), null);
  assert.equal(shareOf({ tenantSf: 0, buildingSf: 10000 }), null);
  const q = 0.25;
  near(recoveryAnnual({ method: 'prorata', pool: 100000, share: q }), 25000); // 100,000 x 25%
  near(recoveryAnnual({ method: 'base_year', pool: 103000, share: q, baseAmount: 100000 }), 750); // (103,000 - 100,000) x 25%
  near(recoveryAnnual({ method: 'base_year', pool: 90000, share: q, baseAmount: 100000 }), 0); // never negative
  // stop: 400,000 / 10,000 SF = $40/SF; $30 stop leaves $10/SF x 2,500 SF
  near(recoveryAnnual({ method: 'stop', pool: 400000, share: q, tenantSf: 2500, buildingSf: 10000, stopPsf: 30 }), 25000);
  near(recoveryAnnual({ method: 'fixed', pool: 1, share: null, fixed: 12000 }), 12000); // needs no share
});

test('recovery: an unknown share or pool is "can\'t tell", never 0', () => {
  assert.equal(recoveryAnnual({ method: 'prorata', pool: 100000, share: null }), null);
  assert.equal(recoveryAnnual({ method: 'prorata', pool: NaN, share: 0.25 }), null);
  assert.equal(recovery({ expenses: 100000, method: 'prorata' }), null);
  assert.equal(recovery({ expenses: undefined, tenantSf: 1, buildingSf: 2 }), null);
});

test('recovery tool: the wrapper keeps its answer shape', () => {
  const r = recovery({ expenses: 100000, tenantSf: 2500, buildingSf: 10000 });
  near(r.annual, 25000); near(r.monthly, 25000 / 12); near(r.share, 25); near(r.psf, 10);
});

/* ------------------------------------------------------- percentage rent */
test('percentage rent: set and natural breakpoint, worked by hand', () => {
  // natural: $60,000 base rent at a 6% rate breaks at $1,000,000; $1,200,000 of sales leaves $200,000 x 6%
  assert.equal(breakpointOf({ rate: 6, natural: true, baseRent: 60000, breakpoint: 900000 }), 1000000);
  assert.equal(breakpointOf({ rate: 6, natural: false, baseRent: 60000, breakpoint: 900000 }), 900000);
  assert.equal(breakpointOf({ rate: 6, natural: true, baseRent: null, breakpoint: 900000 }), 900000);
  assert.equal(breakpointOf({ rate: 6, natural: true }), null);
  near(overageOf({ sales: 1200000, rate: 6, breakpoint: 1000000 }), 12000);
  near(overageOf({ sales: 800000, rate: 6, breakpoint: 1000000 }), 0);
  const r = percentageRent({ sales: 1200000, rate: 6, natural: true, baseRent: 60000 });
  near(r.overage, 12000); near(r.breakpoint, 1000000); near(r.salesToBreakpoint, -200000);
  near(r.occupancyCost, ((60000 + 12000) / 1200000) * 100); // 6%
  assert.equal(percentageRent({ sales: 1200000, rate: 6 }), null, 'no breakpoint: can\'t tell');
});

/* ---------------------------------------------------------- sale at exit */
test('reversion: next year\'s income at the exit cap, less the costs of sale', () => {
  // $105,000 at 7% is $1,500,000; 2% costs are $30,000
  const r = reversion({ basisNext: 105000, exitCap: 7, saleCostPct: 2 });
  near(r.gross, 1500000, 1e-6); near(r.saleCosts, 30000, 1e-6); near(r.net, 1470000, 1e-6);
  near(reversion({ basisNext: 105000, exitCap: 7 }).net, 1500000, 1e-6);
});

test('the DCF tool and the hold returns sell for the same price', () => {
  const d = dcf({ noi: 100000, growth: 5, years: 5, discount: 8, exitCap: 7, saleCost: 2 });
  const h = holdReturns({ price: 1400000, noi: 100000, growth: 5, hold: 5, exitCap: 7, saleCost: 2 });
  near(d.reversion, h.exitValue - h.saleCosts, 1e-6);
  near(d.reversion, 100000 * 1.05 ** 5 / 0.07 * 0.98, 1e-6); // year-6 NOI, 7%, 2% costs
});

test('a negative sale cost is refused the same way everywhere (owner decision 2026-10-29)', () => {
  assert.equal(reversion({ basisNext: 105000, exitCap: 7, saleCostPct: -2 }), null);
  assert.equal(holdReturns({ price: 1400000, noi: 100000, growth: 0, hold: 5, exitCap: 7, saleCost: -2 }), null);
  assert.equal(dcf({ noi: 100000, growth: 0, years: 5, discount: 8, exitCap: 7, saleCost: -2 }), null);
  assert.equal(holdWithFees({ price: 1400000, noi: 100000, hold: 5, exitCap: 7, saleCost: -2 }), null);
  assert.equal(residualLand({ gdv: 5000000, hardCost: 2000000, saleCostPct: -2 }), null);
  // zero and blank still work, and the two copies still agree
  assert.ok(dcf({ noi: 100000, growth: 0, years: 5, discount: 8, exitCap: 7, saleCost: 0 }));
  assert.ok(holdReturns({ price: 1400000, noi: 100000, growth: 0, hold: 5, exitCap: 7 }));
});

test('a negative sale cost: the Tools say so and the What-if leaves returns out with a note', async () => {
  globalThis.window ||= {}; // kit.js reads window.claude when it loads; the tools only need its formatters
  const { MORE_TOOLS } = await import('../app/toolsdefs.js');
  for (const [id, v] of [['dcf', { noi: 1e6, discount: 8, exitCap: 7, saleCost: -2, years: 10 }], ['hold', { price: 1.4e7, noi: 1e6, exitCap: 7, saleCost: -2, hold: 5, ltv: 65, rate: 6, amort: 30 }], ['residual', { gdv: 5e6, hardCost: 2e6, saleCostPct: -2 }]]) {
    const t = MORE_TOOLS.find((x) => x.id === id || (id === 'hold' && x.inputs.some((i) => i[0] === 'acqFeePct')));
    const out = t.run(v, {});
    assert.match(out.warnings.join(' '), /can’t be negative/, id);
    assert.ok(out.lines.every((l) => l[1] === '—'), id);
  }
  const run = runScenario({ price: 1.4e7, noi: 1e6, gross: 1.5e6, opex: 5e5, loan: { ltv: 65, rate: 6, amort: 30 } }, { noi: 1e6 }, { exitCap: 7, saleCost: -2 });
  assert.equal(run.returns, null);
  assert.match(run.notes.join(' '), /can’t be negative/);
});

/* ------------------------------------- the projection and the Tools agree */
const rollOf = (g) => ({
  settings: { ...DEFAULT_SETTINGS, asOf: '2026-01-01', years: 3, opex: 0, recoverable: g.pool, expenseGrowth: g.growth, renewal: { ...DEFAULT_SETTINGS.renewal, assume: false } },
  leases: [
    { id: 'a', unit: '1', tenant: 'A', sf: g.sf, leaseStart: '2025-01-01', leaseEnd: '2031-12-31', periods: [{ start: '2025-01-01', end: '2031-12-31', rate: g.rent, unit: 'year', source: 'documented' }], abatements: [], custom: {},
      recovery: g.rec, percentRent: g.pct },
    { id: 'b', unit: '2', tenant: 'B', sf: g.other, leaseStart: '2025-01-01', leaseEnd: '2031-12-31', periods: [{ start: '2025-01-01', end: '2031-12-31', rate: 1000, unit: 'year', source: 'documented' }], abatements: [], custom: {} },
  ],
});

test('property: the projection\'s recoveries equal the Recovery tool\'s, year by year', () => {
  fc.assert(fc.property(
    fc.record({
      method: fc.constantFrom('prorata', 'base_year', 'stop'),
      sf: fc.integer({ min: 500, max: 20000 }), other: fc.integer({ min: 500, max: 50000 }),
      pool: fc.integer({ min: 10000, max: 900000 }), growth: fc.integer({ min: 0, max: 8 }),
      baseAmount: fc.integer({ min: 0, max: 900000 }), stopPsf: fc.integer({ min: 0, max: 30 }), sharePct: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
    }),
    (g) => {
      const rec = { method: g.method, baseAmount: g.baseAmount, stopPsf: g.stopPsf, share: g.sharePct };
      const P = project(rollOf({ ...g, rent: 50000, rec }));
      for (let y = 0; y < 2; y++) {
        const t = recovery({ expenses: g.pool * (1 + g.growth / 100) ** y, tenantSf: g.sf, buildingSf: g.sf + g.other, sharePct: g.sharePct, method: g.method, baseYear: g.baseAmount, stopPsf: g.stopPsf });
        // the projection splits each lease's recovery over 12 months, so the two agree to rounding
        const got = P.annual[y].recoveries; // lease B recovers nothing, so this is lease A's
        assert.ok(Math.abs(got - t.annual) <= 1e-6 * Math.max(1, Math.abs(t.annual)), `${g.method} year ${y + 1}: ${got} vs ${t.annual}`);
      }
    },
  ), { numRuns: 60 });
});

test('property: the projection\'s percentage rent equals the Percentage rent tool\'s', () => {
  fc.assert(fc.property(
    fc.record({
      sf: fc.integer({ min: 500, max: 20000 }), rent: fc.integer({ min: 12000, max: 400000 }), rate: fc.integer({ min: 1, max: 10 }),
      sales: fc.integer({ min: 100000, max: 9000000 }), breakpoint: fc.integer({ min: 100000, max: 9000000 }), natural: fc.boolean(), salesGrowth: fc.integer({ min: 0, max: 6 }),
    }),
    (g) => {
      const pct = { rate: g.rate, sales: g.sales, breakpoint: g.breakpoint, natural: g.natural, growth: g.salesGrowth };
      const P = project(rollOf({ ...g, pool: 0, growth: 0, other: 1000, pct }));
      for (let y = 0; y < 2; y++) {
        const t = percentageRent({ sales: g.sales * (1 + g.salesGrowth / 100) ** y, rate: g.rate, breakpoint: g.breakpoint, natural: g.natural, baseRent: g.rent });
        const got = P.annual[y].pctRent;
        assert.ok(Math.abs(got - t.overage) <= 1e-6 * Math.max(1, t.overage), `year ${y + 1}: ${got} vs ${t.overage}`);
      }
    },
  ), { numRuns: 60 });
});

test('no second copy: the Tools, the projection and the Deal screen call the engine functions', () => {
  const src = (f) => fs.readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
  assert.match(src('calc.js'), /from '\.\/engine\/recovery\.js'/);
  assert.match(src('calc.js'), /from '\.\/engine\/pctrent\.js'/);
  assert.match(src('calc.js'), /from '\.\/engine\/returns\.js'/);
  assert.match(src('lease.js'), /from '\.\/engine\/recovery\.js'/);
  assert.match(src('lease.js'), /from '\.\/engine\/pctrent\.js'/);
  assert.match(src('deal.js'), /from '\.\/engine\/returns\.js'/);
  // the arithmetic itself is written once
  assert.doesNotMatch(src('lease.js'), /Math\.max\(0, pool - /);
  assert.doesNotMatch(src('calc.js'), /Math\.max\(0, expenses - /);
  assert.doesNotMatch(src('calc.js'), /series\[n\] \/ \(exitCap/);
  assert.doesNotMatch(src('deal.js'), /nois\[n\] \/ \(exitCap/);
});

/* --------------------------------------- bit-for-bit with the code before A1 */
test('projection percentage rent keeps its order of operations: year 3 is $267,909.38', () => {
  // 8.5% on sales of 3,000,000 growing 2.5% a year, breakpoint 0; (rate / 100) before the 12ths
  const rr = rollOf({ sf: 1000, other: 1000, rent: 1000, pool: 0, growth: 0, pct: { rate: 8.5, sales: 3000000, breakpoint: 0, natural: false, growth: 2.5 } });
  rr.settings.years = 3;
  const P = project(rr);
  assert.equal(toCents(P.annual[2].pctRent), 267909.38);
});

test('the DCF tool\'s sale price is still gross x (1 - cost%), on a grid', () => {
  for (const noi of [91234.56, 100000, 777777.77]) for (const cap of [5.25, 7, 8.5]) for (const cost of [0, 1.5, 2, 3.75]) for (const n of [1, 5, 10]) {
    const d = dcf({ noi, growth: 3, years: n, discount: 8, exitCap: cap, saleCost: cost });
    assert.equal(d.reversion, (noi * 1.03 ** n / (cap / 100)) * (1 - cost / 100), `${noi} ${cap} ${cost} ${n}`);
  }
});

test('unknown tenant share: the projection leaves the recovery out and flags the lease, never 0 silently (owner decision 2026-10-29)', () => {
  const none = rollOf({ sf: 0, other: 1000, rent: 50000, pool: 100000, growth: 0, rec: { method: 'prorata' } });
  const P = project(none);
  assert.equal(P.annual[0].recoveries, 0);
  assert.match(P.notes.join(' '), /Unit 1: Expense recovery can't be worked out: no share is typed and the space has no SF/);
  assert.ok(validateLease(none.leases[0]).some((x) => x.level === 'warn' && /no share is typed and the space has no SF/.test(x.text)));
  assert.ok(validateRentRoll(none).some((x) => x.unit === '1' && /can't be worked out/.test(x.text)));
  // a typed share, or an SF, is enough: no flag, and the dollars are there
  const typed = rollOf({ sf: 0, other: 1000, rent: 50000, pool: 100000, growth: 0, rec: { method: 'prorata', share: 30 } });
  near(project(typed).annual[0].recoveries, 30000);
  assert.deepEqual(project(typed).notes.filter((n) => /recover/i.test(n)), []);
  assert.equal(validateLease(typed.leases[0]).filter((x) => /recover/i.test(x.text)).length, 0);
  // a fixed recovery needs no share
  const fixed = rollOf({ sf: 0, other: 1000, rent: 50000, pool: 100000, growth: 0, rec: { method: 'fixed', amount: 12000 } });
  near(project(fixed).annual[0].recoveries, 12000);
});

test('text that is not a number in a recovery amount is "can\'t tell", not 0; numeric text still reads as a number', () => {
  assert.equal(amountOf('abc'), null); assert.equal(amountOf(''), 0); assert.equal(amountOf(undefined), 0); assert.equal(amountOf('90000'), 90000); assert.equal(amountOf(NaN), null);
  assert.equal(recoveryAnnual({ method: 'base_year', pool: 100000, share: 0.25, baseAmount: 'abc' }), null);
  assert.equal(recoveryAnnual({ method: 'stop', pool: 400000, share: 0.25, tenantSf: 2500, buildingSf: 10000, stopPsf: 'abc' }), null);
  assert.equal(recovery({ expenses: 100000, tenantSf: 2500, buildingSf: 10000, method: 'base_year', baseYear: 'abc' }), null);
  for (const rec of [{ method: 'base_year', baseAmount: 'abc' }, { method: 'stop', stopPsf: 'abc' }, { method: 'fixed', amount: 'abc' }]) {
    const rr = rollOf({ sf: 2500, other: 7500, rent: 50000, pool: 400000, growth: 0, rec });
    const P = project(rr);
    assert.equal(P.annual[0].recoveries, 0, rec.method);
    assert.match(P.notes.join(' '), /"abc" is not a number/, rec.method);
    assert.ok(validateLease(rr.leases[0]).some((x) => /"abc" is not a number/.test(x.text)), rec.method);
  }
  // numeric text is read as a number, as before
  const asText = rollOf({ sf: 2500, other: 7500, rent: 50000, pool: 100000, growth: 0, rec: { method: 'base_year', baseAmount: '90000' } });
  const asNumber = rollOf({ sf: 2500, other: 7500, rent: 50000, pool: 100000, growth: 0, rec: { method: 'base_year', baseAmount: 90000 } });
  near(project(asText).annual[0].recoveries, 2500); // (100,000 - 90,000) x 25%
  assert.equal(project(asText).annual[0].recoveries, project(asNumber).annual[0].recoveries);
  const stopText = rollOf({ sf: 2500, other: 7500, rent: 50000, pool: 400000, growth: 0, rec: { method: 'stop', stopPsf: '30' } });
  near(project(stopText).annual[0].recoveries, 25000);
});

test('percentage rent, natural breakpoint with a zero or blank base rent: the typed breakpoint, else "can\'t tell" (owner decision 2026-10-29)', () => {
  assert.equal(breakpointOf({ rate: 6, natural: true, baseRent: 0, breakpoint: 1000000 }), 1000000);
  assert.equal(breakpointOf({ rate: 6, natural: true, baseRent: 0 }), null);
  assert.equal(percentageRent({ sales: 1200000, rate: 6, natural: true, baseRent: 0, breakpoint: 1000000 }).breakpoint, 1000000);
  // projection: a $0 base rent and a typed breakpoint of $1,000,000 charges 6% of the $200,000 above it, not of all sales
  const typed = rollOf({ sf: 1000, other: 1000, rent: 0, pool: 0, growth: 0, pct: { rate: 6, sales: 1200000, natural: true, breakpoint: 1000000 } });
  near(project(typed).annual[0].pctRent, 12000);
  assert.deepEqual(project(typed).notes.filter((n) => /Percentage rent/.test(n)), []);
  // no breakpoint typed: left out, flagged, and not 6% x 1,200,000 = 72,000
  const none = rollOf({ sf: 1000, other: 1000, rent: 0, pool: 0, growth: 0, pct: { rate: 6, sales: 1200000, natural: true } });
  assert.equal(project(none).annual[0].pctRent, 0);
  assert.match(project(none).notes.join(' '), /Unit 1: Percentage rent has no breakpoint/);
  assert.ok(validateLease(none.leases[0]).some((x) => /Percentage rent has no breakpoint/.test(x.text)));
  // a blank base rent (a per-SF period on a space with no SF: monthlyAmount is null, and null x 12 is 0) is the same
  const blank = rollOf({ sf: 0, other: 1000, rent: 0, pool: 0, growth: 0, pct: { rate: 6, sales: 1200000, natural: true } });
  blank.leases[0].periods[0].unit = 'psf_year'; blank.leases[0].periods[0].rate = 40;
  assert.equal(project(blank).annual[0].pctRent, 0);
  assert.match(project(blank).notes.join(' '), /Percentage rent has no breakpoint/);
  // a real base rent still works naturally
  const natural = rollOf({ sf: 1000, other: 1000, rent: 60000, pool: 0, growth: 0, pct: { rate: 6, sales: 1200000, natural: true } });
  near(project(natural).annual[0].pctRent, 12000);
});

test('property: a fixed recovery in the projection grows by its own rate each year', () => {
  fc.assert(fc.property(fc.integer({ min: 1000, max: 90000 }), fc.integer({ min: 0, max: 8 }), (amount, gr) => {
    const P = project(rollOf({ sf: 2000, other: 8000, rent: 50000, pool: 5, growth: 9, rec: { method: 'fixed', amount, growth: gr } }));
    for (let y = 0; y < 2; y++) near(P.annual[y].recoveries, amount * (1 + gr / 100) ** y, 1e-6 * amount);
  }), { numRuns: 40 });
});

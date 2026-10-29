/* One function for each calculation that used to live twice (cash-flow
 * proposal, phase A1): recoveries, percentage rent and the sale at exit. Every
 * expected value is worked by hand from an invented case. The last tests make
 * sure the Tools and the rent-roll projection reach the same engine function,
 * and give the same dollars. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fc from 'fast-check';
import { shareOf, recoveryAnnual } from '../app/engine/recovery.js';
import { breakpointOf, overageOf } from '../app/engine/pctrent.js';
import { reversion } from '../app/engine/returns.js';
import { recovery, percentageRent, dcf } from '../app/calc.js';
import { holdReturns } from '../app/deal.js';
import { project, DEFAULT_SETTINGS } from '../app/lease.js';

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

test('a negative sale cost: the two screens still differ, as before this change (owner question)', () => {
  // Deal screen: a negative cost is ignored. DCF tool: it is applied, raising the price. Kept as it was;
  // which one is right is reported to the owner, not decided here.
  const h = holdReturns({ price: 1400000, noi: 100000, growth: 0, hold: 5, exitCap: 7, saleCost: -2 });
  near(h.saleCosts, 0);
  const d = dcf({ noi: 100000, growth: 0, years: 5, discount: 8, exitCap: 7, saleCost: -2 });
  near(d.reversion, 100000 / 0.07 * 1.02, 1e-6);
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

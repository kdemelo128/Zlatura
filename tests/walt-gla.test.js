/* Underwriting U4: WALT by total GLA (underwriting.md 3.5): Σ(SF × years left) over dated occupied leases ÷ (their SF
 * + vacant SF). B05 / C11b, worked by hand on invented leases. As of 2026-01-01; 1,461 days is exactly 4 years and
 * 2,922 days exactly 8 (whole days ÷ 365.25). Each test fails on 4.7.39, which has no total-area WALT. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walt, waltMethod } from '../app/engine/walt.js';
import { CONVENTIONS } from '../app/engine/conventions.js';

const asOf = '2026-01-01';
// A 1,000 SF, $30,000, to 2030-01-01 (4 years); B 1,000 SF, $10,000, to 2034-01-01 (8 years); 2,000 SF vacant
const base = [
  { annual: 30000, sf: 1000, end: '2030-01-01' },
  { annual: 10000, sf: 1000, end: '2034-01-01' },
  { vacant: true, sf: 2000 },
];
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('B05: the three weightings, by hand', () => {
  const w = walt(base, { asOf, weight: 'gla', mtm: 'exclude' });
  near(w.income, (30000 * 4 + 10000 * 8) / 40000); // 5
  near(w.sf, (1000 * 4 + 1000 * 8) / 2000); // 6
  near(w.gla, (1000 * 4 + 1000 * 8) / (2000 + 2000)); // 3: the vacant 2,000 SF count at 0 years
  near(w.headline, 3);
  assert.equal(walt(base, { asOf, weight: 'income' }).headline, w.income);
  assert.equal(walt(base, { asOf, weight: 'sf' }).headline, w.sf);
});

test('C11b: a month-to-month lease left out is out of the denominator too; counted at 0 years it is in', () => {
  const items = [...base, { annual: 5000, sf: 500, mtm: true }];
  near(walt(items, { asOf, weight: 'gla', mtm: 'exclude' }).gla, 12000 / 4000); // 3, unchanged
  near(walt(items, { asOf, weight: 'gla', mtm: 'zero' }).gla, 12000 / 4500); // 2.667
  near(walt(items, { asOf, weight: 'gla', mtm: 'zero' }).sf, 12000 / 2500); // 4.8
  // an undated lease, and one without rent, are left out of every weighting, the total-area denominator included
  near(walt([...base, { annual: 8000, sf: 700 }, { annual: 0, sf: 900, end: '2030-01-01' }], { asOf, weight: 'gla' }).gla, 3);
});

test('no dated occupied space: no total-area WALT (never 0 years from the vacant space alone)', () => {
  assert.equal(walt([{ vacant: true, sf: 5000 }], { asOf, weight: 'gla' }).gla, null);
  assert.equal(walt([], { asOf, weight: 'gla' }).headline, null);
});

test('the setting and the label', () => {
  const c = CONVENTIONS.find((x) => x.id === 'walt.weight');
  assert.equal(c.default, 'income', 'the default stays by income, so nothing changes');
  assert.deepEqual(c.options.map(([v]) => v), ['income', 'sf', 'gla']);
  assert.equal(waltMethod({ weight: 'gla', mtm: 'exclude' }), 'by total area, vacant at 0 years');
  assert.equal(waltMethod({ weight: 'gla', mtm: 'zero' }, 'Jan 1, 2026'), 'by total area, vacant at 0 years, as of Jan 1, 2026, month-to-month at 0 years');
});

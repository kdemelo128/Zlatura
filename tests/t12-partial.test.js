/* A T-12 of fewer than 12 months (convention t12.months): "Use the T-12's
 * figures" never puts it onto the deal as a year's. Annualizing (× 12 ÷ its
 * months, to whole cents) only when the broker confirms it (t12ui.js
 * useFigures; the browser half is tests/e2e/t12partial-flow.mjs), and a deal
 * that already holds a partial year as annual says so in "What doesn't add
 * up". Invented figures only. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../app/deal.js';
import { analysisInput } from '../app/impact.js';
import { importStatement, statementTotals, annualized } from '../app/t12.js';
import { CONVENTIONS } from '../app/engine/conventions.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** An invented statement: each line the same every month, over `n` months. */
function statement({ rent = 50000, taxes = 6000, other = 4000, n = 12 } = {}) {
  const rows = [['Line', ...MON.slice(0, n).map((m) => `${m} 2025`), 'Total'], ['Base Rent', rent], ['Real Estate Taxes', taxes], ['Insurance', other]]
    .map((r, i) => ({ r: i + 1, cells: i ? [r[0], ...Array(n).fill(r[1]), Math.round(r[1] * n * 100) / 100] : r }));
  return importStatement(rows, { file: 'invented.xlsx' });
}
/** A deal as "Use the T-12's figures" leaves it: each figure set to `vals`, sourced to the T-12 (annualized from `ann` months, or not). */
function applied(t12, vals, ann = 0) {
  const figures = { price: 6e6, noi: 400000, gross: 520000, opex: 120000, taxes: 70000 };
  const before = { noi: figures.noi, gross: figures.gross, opex: figures.opex, taxes: figures.taxes };
  const sources = {};
  for (const [k, v] of Object.entries(vals)) { figures[k] = v; sources[k] = { t12: true, hand: false, file: 'invented.xlsx', line: 'T-12', orig: v, ...(ann ? { annualized: ann } : {}) }; }
  t12.applied = { at: 0, before, rrOpex: false, ...(ann ? { annualized: ann } : {}) };
  return { figures, sources, loan: {}, t12 };
}
const asDeal = (T) => ({ noi: T.noi, gross: T.egi, opex: T.opex, taxes: T.taxes });
const warnings = (d) => analyze(analysisInput(d)).checks.filter((c) => /not a full year’s/.test(c.text));

test('annualized: × 12 ÷ the months, to whole cents; NOI is EGI less expenses, so it still adds up', () => {
  const T = statementTotals(statement({ n: 9 }));
  assert.equal(T.months, 9);
  assert.deepEqual([T.egi, T.opex, T.taxes, T.noi], [450000, 90000, 54000, 360000]);
  assert.deepEqual(annualized(T), { egi: 600000, opex: 120000, taxes: 72000, noi: 480000, months: 9 });
  // 7 months of $1,000.01 rent and $333.33 taxes: each scaled total rounded to the cent, NOI their difference
  const U = statementTotals(statement({ rent: 1000.01, taxes: 333.33, other: 0, n: 7 }));
  const A = annualized(U);
  assert.equal(A.egi, Math.round((U.egi * 12 / 7) * 100) / 100);
  assert.equal(A.egi, 12000.12);
  assert.equal(A.taxes, 3999.96);
  assert.equal(A.noi, Math.round((A.egi - A.opex) * 100) / 100);
  for (const v of [A.egi, A.opex, A.taxes, A.noi]) assert.equal(Math.round(v * 100), v * 100, `${v} is whole cents`);
  // where rounding each figure on its own would not add up: NOI is the scaled EGI less the scaled expenses
  // ($1,714.77 − $514.49 = $1,200.28), not NOI scaled by itself ($700.16 × 12 ÷ 7 = $1,200.27)
  const B = annualized({ egi: 1000.28, opex: 300.12, taxes: 0, noi: 700.16, months: 7 });
  assert.deepEqual([B.egi, B.opex, B.noi], [1714.77, 514.49, 1200.28]);
});

test('annualized: a full year, or a statement with no months, has nothing to scale', () => {
  assert.equal(annualized(statementTotals(statement())), null);
  assert.equal(annualized({ egi: 1, opex: 0, taxes: 0, noi: 1, months: 0 }), null);
  assert.equal(annualized({ egi: 1, opex: 0, taxes: 0, noi: 1, months: 12 }), null);
  assert.deepEqual(annualized({ egi: 1000, opex: 400, taxes: 100, noi: 600, months: 1 }), { egi: 12000, opex: 4800, taxes: 1200, noi: 7200, months: 1 });
});

test('a deal holding a partial T-12 as a year’s figures: a warning naming them, the months and the way out', () => {
  const t = statement({ n: 9 });
  const [w, ...more] = warnings(applied(t, asDeal(statementTotals(t))));
  assert.equal(more.length, 0);
  assert.equal(w.level, 'warn');
  assert.equal(w.text, 'The deal’s NOI, gross income, operating expenses and real estate taxes are the T-12’s 9 months, Jan 2025 to Sep 2025, not a full year’s, so every figure worked out from them reads a partial year as annual. Use the T-12’s figures again to annualize them, or type the year’s figures.');
});

test('the warning goes once a figure is typed as a year’s, and names only those still partial', () => {
  const t = statement({ n: 6 });
  const d = applied(t, asDeal(statementTotals(t)));
  d.figures.noi = 480000; d.figures.gross = 600000; d.sources.noi = { hand: true }; d.sources.gross = { hand: true };
  const [w] = warnings(d);
  assert.match(w.text, /^The deal’s operating expenses and real estate taxes are the T-12’s 6 months, Jan 2025 to Jun 2025, not a full year’s, so every figure worked out from them reads/);
  d.figures.opex = 120000; d.figures.taxes = 72000;
  assert.deepEqual(warnings(d), []);
});

test('no warning: annualized as confirmed, a full year, or a partial T-12 never used', () => {
  const t9 = statement({ n: 9 });
  assert.deepEqual(warnings(applied(t9, asDeal(annualized(statementTotals(t9))), 9)), []);
  const t12 = statement();
  assert.deepEqual(warnings(applied(t12, asDeal(statementTotals(t12)))), []);
  assert.deepEqual(warnings({ figures: { price: 6e6, noi: 400000 }, sources: {}, loan: {}, t12: statement({ n: 3 }) }), []);
});

test('the convention says a partial year is never used as a year’s, and scaled only when confirmed', () => {
  const c = CONVENTIONS.find((x) => x.id === 't12.months');
  assert.equal(c.value, 'Its months as they are, never used as a year’s figures. Scaled up (× 12 ÷ its months) only when you confirm it, and then marked annualized');
});

/* Underwriting PR U1 "normalise": a per-line method on a T-12 (as reported,
 * annualise, typical month x 12, exclude), the normalised EGI / expenses /
 * taxes / NOI with a bridge from the reported NOI that adds up to the cent, and
 * the refusals (held, no months, unknown method). Pure logic, no screen.
 * Every figure is invented and worked by hand in
 * tests/fixtures/t12-normalise-fixtures.js. Design: docs/proposals/underwriting.md
 * 3.2, 3.3, 3.7, 3.8 and the U1 design note. Each test here fails on 4.7.36, which
 * has neither `normalise` nor `setMethod`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { uRows, c20Rows, c21Rows, U_LABELS } from './fixtures/t12-normalise-fixtures.js';
import {
  dupRows, fifteenRows, cumulativeRows, cumulative12Rows, gapRows, leadingRows, partialRows, plainRows, flatRows, heads,
} from './fixtures/t12-period-fixtures.js';
import {
  quarterEndRows, valueRows, t6Rows, yoyRows, yoyNoiRows, yoy15Rows, yoyMixedRows, quarterHeadRows,
} from './fixtures/t12-values-fixtures.js';
import { arcadeRows } from './t12-suggest-fixtures.js';
import { SIX, statementRows, grid as fgrid, statementOf } from './t12-formats.js';
import { LAYOUTS, layoutFile } from './t12-layouts.js';
import { gridsOf, csvRows } from '../app/sheetread.js';
import { buildBackup, readBackup, planRestore } from '../app/backup.js';
import {
  importStatement, statementTotals, annualized, normalise, setMethod, setWindow, applyT12Fix, markSeen, fileLine, rematch,
  noiWithout, runRate, t12Qc, t12ForAnalysis, windowOf, heldCount, periodChecks,
} from '../app/t12.js';

const imp = (rows) => importStatement(rows, { file: 'invented.csv', sheet: 'CSV' });
const line = (t, label) => t.lines.find((l) => l.label === label);
const c = (x) => Math.round(x * 100);
/** Statement U with "months with activity" chosen: N = 7. */
const U = () => { const t = imp(uRows()); setWindow(t, 'active'); return t; };
/** Set methods by label. */
const methods = (t, by) => { for (const [label, m] of Object.entries(by)) setMethod(t, line(t, label).id, m); return t; };
/** September of Repairs marked "Recurring? No" (3,000.00). */
const markSep = (t) => applyT12Fix(t, `oneoff.${line(t, 'Repairs').id}.2026-09`, 'rec:no');
/** One line's result row. */
const row = (r, t, label) => r.lines.find((x) => x.id === line(t, label).id);
/** Repairs alone under a method; everything else as reported. */
const repairs = (method, { mark = false, window = 'active' } = {}) => {
  const t = imp(uRows()); setWindow(t, window);
  if (mark) assert.equal(markSep(t), true);
  methods(t, { Repairs: method });
  const r = normalise(t);
  return { t, r, l: row(r, t, 'Repairs') };
};

test('statement U is what the fixture says: filed, 12 columns, 7 with activity, asks N until answered', () => {
  const t = imp(uRows());
  assert.deepEqual(U_LABELS.map((l) => line(t, l).category), ['rent', 'parking', 'otherIncome', 'repairs', 'taxes', 'admin']);
  const T = statementTotals(t);
  assert.deepEqual([T.egi, T.opex, T.taxes, T.noi], [72000.02, 15710, 9500, 56290.02]);
  assert.equal(t.months.length, 12);
  assert.equal(windowOf(t).ask, true, 'seven months with activity of twelve: asked');
  setWindow(t, 'active');
  assert.deepEqual([windowOf(t).n, windowOf(t).ask], [7, false]);
});

/* ------------------------------------------------ example 1: Repairs */

test('example 1: Repairs by method over N = 7 (5,010.00 reported)', () => {
  let x = repairs('reported');
  assert.equal(x.l.amount, 5010); assert.equal(x.l.adjustment, 0); assert.equal(x.l.method, 'reported');
  x = repairs('annualise');
  assert.equal(x.l.amount, 8588.57, '5,010 x 12 / 7');
  assert.equal(x.l.adjustment, -3578.57);
  x = repairs('runRate');
  assert.equal(x.l.amount, 4860, 'median(380, 400, 400, 410, 420, 3,000) = 405, x 12; not the median of all 12 months (2,280)');
  assert.equal(x.l.adjustment, 150);
  x = repairs('exclude');
  assert.equal(x.l.amount, 0); assert.equal(x.l.adjustment, 5010);
  x = repairs('annualise', { window: 'columns' });
  assert.equal(x.r.n, 12);
  assert.equal(x.l.amount, 5010, 'over all 12 columns: x 12 / 12');
});

test('example 1 with September marked "Recurring? No": the 3,000 comes out first, then the method', () => {
  let x = repairs('reported', { mark: true });
  assert.equal(x.l.amount, 2010); assert.equal(x.l.oneoff, 3000); assert.equal(x.l.adjustment, 0);
  x = repairs('annualise', { mark: true });
  assert.equal(x.l.amount, 3445.71, '(5,010 - 3,000) x 12 / 7');
  assert.equal(x.l.oneoff, 3000);
  assert.equal(x.l.adjustment, -1435.71, '5,010 - 3,000 - 3,445.71');
  x = repairs('runRate', { mark: true });
  assert.equal(x.l.amount, 4800, 'median(380, 400, 400, 410, 420) = 400, x 12');
  x = repairs('exclude', { mark: true });
  assert.equal(x.l.amount, 0);
  assert.equal(x.l.oneoff, 0, 'exclude wins: nothing is counted twice');
  assert.equal(x.l.adjustment, 5010);
  const kinds = x.r.steps.map((s) => [s.kind, s.noi]);
  assert.deepEqual(kinds, [['exclude', 5010]], 'no one-off step for an excluded line; the exclude step takes the whole 5,010');
});

test('the run rate leaves out the marked month, not a month that is merely large', () => {
  // unmarked: the 3,000 is one of the six non-zero months, the median is 405 (4,860.00), not 400 (4,800.00)
  assert.equal(repairs('runRate').l.amount, 4860);
  assert.equal(repairs('runRate', { mark: true }).l.amount, 4800);
});

/* ------------------------------------------------ example 2: Taxes */

test('example 2: Taxes (1,000 Jun to Dec, 3,500 in October; 9,500.00)', () => {
  const t = U();
  methods(t, { 'Real Estate Taxes': 'annualise' });
  let r = normalise(t);
  assert.equal(row(r, t, 'Real Estate Taxes').amount, 16285.71, '9,500 x 12 / 7; "/ 12 x 7" would give 5,541.67');
  assert.equal(r.normalised.taxes, 16285.71);
  assert.equal(r.normalised.opex, 15710 - 9500 + 16285.71);
  methods(t, { 'Real Estate Taxes': 'runRate' });
  r = normalise(t);
  assert.equal(row(r, t, 'Real Estate Taxes').amount, 12000, 'median(1,000 x 6, 3,500) = 1,000, x 12');
  assert.equal(r.normalised.taxes, 12000);
});

/* ------------------------------------------------ example 3: the bridge */

test('example 3: the bridge adds up to the cent, a group is rounded once, and the residue is shown', () => {
  const t = methods(U(), { 'Base Rent': 'annualise', Parking: 'annualise', Storage: 'annualise', Repairs: 'runRate', 'Real Estate Taxes': 'runRate', Legal: 'exclude' });
  const r = normalise(t);
  assert.equal(r.ok, true); assert.equal(r.held, null); assert.equal(r.n, 7); assert.equal(r.columns, 12);
  assert.deepEqual(r.reported, { egi: 72000.02, opex: 15710, taxes: 9500, noi: 56290.02, unassigned: 0 });
  assert.deepEqual(r.normalised, { egi: 123428.61, opex: 16860, taxes: 12000, noi: 106568.61 }, 'the group: 72,000.02 x 12 / 7 = 123,428.6057, not 120,000.00 + 1,714.30 + 1,714.30');
  assert.deepEqual(r.residue, { egi: -0.01, opex: 0, taxes: 0 }, 'lines as shown add up to 0.01 less than the group');
  assert.ok(r.notes.includes('normround'));
  assert.equal(row(r, t, 'Parking').amount, 1714.3);
  assert.equal(row(r, t, 'Base Rent').amount, 120000);
  const id = (l) => line(t, l).id;
  assert.deepEqual(r.steps, [
    { kind: 'annualise', side: 'income', noi: 51428.59, lines: [id('Base Rent'), id('Parking'), id('Storage')] },
    { kind: 'runRate', side: 'expense', noi: -2350, lines: [id('Repairs'), id('Real Estate Taxes')] },
    { kind: 'exclude', side: 'expense', noi: 1200, lines: [id('Legal')] },
  ]);
  assert.equal(c(r.reported.noi) + r.steps.reduce((s, x) => s + c(x.noi), 0), c(r.normalised.noi), '56,290.02 + 51,428.59 - 2,350.00 + 1,200.00 = 106,568.61');
  assert.deepEqual(r.counts, { reported: 0, annualise: 3, runRate: 2, exclude: 1 });
  // exclude kept (a mutant) would say 105,368.61; the step list names Legal
  const kept = methods(U(), { 'Base Rent': 'annualise', Parking: 'annualise', Storage: 'annualise', Repairs: 'runRate', 'Real Estate Taxes': 'runRate' });
  assert.equal(normalise(kept).normalised.noi, 105368.61);
});

test('example 3, every line annualised over 7, is annualized() of the totals', () => {
  const t = methods(U(), Object.fromEntries(U_LABELS.map((l) => [l, 'annualise'])));
  const r = normalise(t);
  assert.deepEqual(r.normalised, { egi: 123428.61, opex: 26931.43, taxes: 16285.71, noi: 96497.18 });
  const A = annualized(statementTotals(t), 7);
  assert.deepEqual([A.egi, A.opex, A.taxes, A.noi], [123428.61, 26931.43, 16285.71, 96497.18]);
});

/* ------------------------------------------------ B07: 4,096 combinations */

/** Hand-worked cents per line: reported, after the September mark, and run rate (with and without the mark). */
const HAND = {
  'Base Rent': { rep: 7000000, rr: 12000000 },
  Parking: { rep: 100001, rr: 1200012 },
  Storage: { rep: 100001, rr: 1200012 },
  Repairs: { rep: 501000, repM: 201000, rr: 486000, rrM: 480000 },
  'Real Estate Taxes': { rep: 950000, rr: 1200000 },
  Legal: { rep: 120000, rr: 1440000 },
};
const METHOD_LIST = ['reported', 'annualise', 'runRate', 'exclude'];

/** The expected side/taxes cents for one combination, from HAND alone: annualise rounds the group once. */
function oracle(by, marked) {
  const side = (labels) => {
    let ann = 0; let rest = 0;
    for (const label of labels) {
      const h = HAND[label]; const m = by[label];
      const base = marked && h.repM !== undefined ? h.repM : h.rep;
      if (m === 'annualise') ann += base;
      else if (m === 'runRate') rest += marked && h.rrM !== undefined ? h.rrM : h.rr;
      else if (m === 'reported') rest += base;
    }
    return Math.round((ann * 12) / 7) + rest;
  };
  const egi = side(['Base Rent', 'Parking', 'Storage']);
  const opex = side(['Repairs', 'Real Estate Taxes', 'Legal']);
  return { egi, opex, taxes: side(['Real Estate Taxes']), noi: egi - opex };
}

test('B07: all 4,096 method combinations, with and without the September mark, conserve to the cent and match a hand-worked oracle', () => {
  for (const marked of [false, true]) {
    const t = U();
    if (marked) assert.equal(markSep(t), true);
    const ids = U_LABELS.map((l) => line(t, l).id);
    let combos = 0;
    for (let k = 0; k < 4096; k++) {
      const by = {};
      U_LABELS.forEach((label, i) => { by[label] = METHOD_LIST[Math.floor(k / 4 ** i) % 4]; setMethod(t, ids[i], by[label]); });
      const r = normalise(t);
      const where = `${marked ? 'marked' : 'unmarked'} ${JSON.stringify(by)}`;
      assert.equal(r.held, null, where);
      // the oracle, from the hand-worked table
      const want = oracle(by, marked);
      assert.deepEqual([c(r.normalised.egi), c(r.normalised.opex), c(r.normalised.taxes), c(r.normalised.noi)], [want.egi, want.opex, want.taxes, want.noi], where);
      // per line: amount + adjustment + one-off = reported
      for (const l of r.lines) assert.equal(c(l.amount) + c(l.adjustment) + c(l.oneoff), c(l.reported), `${where} ${l.label}`);
      // in total: reported NOI + the steps = normalised NOI
      assert.equal(c(r.reported.noi) + r.steps.reduce((s, x) => s + c(x.noi), 0), c(r.normalised.noi), where);
      // the steps name exactly the lines that are not as reported, each once
      const named = r.steps.filter((s) => s.kind !== 'oneoff').flatMap((s) => s.lines).sort();
      assert.deepEqual(named, ids.filter((_, i) => by[U_LABELS[i]] !== 'reported').sort(), where);
      // the one-off step is there only when the mark applies (Repairs not excluded)
      assert.equal(r.steps.some((s) => s.kind === 'oneoff'), marked && by.Repairs !== 'exclude', where);
      // deterministic: a second call is deep-equal
      assert.deepEqual(normalise(t), r, where);
      combos++;
    }
    assert.equal(combos, 4096);
  }
});

/* ------------------------------------------------ refusals */

test('C21: one month $0 on every line, unanswered: annualise is held and asks, never falls back to the columns', () => {
  const t = imp(c21Rows());
  methods(t, { Repairs: 'annualise' });
  const r = normalise(t);
  assert.equal(r.ok, false); assert.equal(r.held, 'annualise'); assert.equal(r.normalised, null);
  assert.deepEqual(r.asks, ['period.active']);
  assert.equal(row(r, t, 'Repairs').amount, null);
  // the reported figures are still there beside it
  assert.equal(r.reported.noi, 104500, '110,000 - 5,500');
  assert.equal(r.reported.egi, 110000);
  // answered over the 11 months with activity: Repairs 5,500 x 12 / 11 = 6,000
  setWindow(t, 'active');
  let a = normalise(t);
  assert.equal(a.held, null); assert.equal(a.n, 11);
  assert.equal(row(a, t, 'Repairs').amount, 6000);
  // over all 12 columns: 5,500
  setWindow(t, 'columns');
  a = normalise(t);
  assert.equal(a.n, 12);
  assert.equal(row(a, t, 'Repairs').amount, 5500);
  // an explicit n is used as given, with no question
  delete t.window;
  assert.equal(normalise(t, { n: 11 }).held, null);
  assert.equal(row(normalise(t, { n: 11 }), t, 'Repairs').amount, 6000);
  // a line as reported or typical month does not wait for N
  methods(t, { Repairs: 'runRate' });
  const rr = normalise(t);
  assert.equal(rr.held, null);
  assert.equal(row(rr, t, 'Repairs').amount, 6000, 'median(500 x 11) = 500, x 12');
  methods(t, { Repairs: 'reported' });
  assert.equal(normalise(t).held, null);
});

test('C20: one line $0 in two months while another has activity: N is unchanged, nothing is held', () => {
  const t = imp(c20Rows());
  assert.equal(windowOf(t).ask, false);
  methods(t, { 'Base Rent': 'annualise', Repairs: 'annualise' });
  const r = normalise(t);
  assert.equal(r.held, null); assert.equal(r.n, 12);
  assert.deepEqual(r.normalised, { egi: 120000, opex: 4000, taxes: 0, noi: 116000 });
});

test('quarter-end columns: typical month x 12 waits (a quarter x 12 is wrong by 3), and Seen lets it through', () => {
  const t = imp(quarterEndRows());
  assert.equal(periodChecks(t).some((x) => x.id === 'period.quarterends'), true);
  methods(t, { 'Base Rent': 'runRate' });
  const r = normalise(t);
  assert.equal(r.held, 'annualise'); assert.deepEqual(r.asks, ['period.quarterends']); assert.equal(r.normalised, null);
  // also with an explicit n: the columns may be quarters whatever N is
  assert.equal(normalise(t, { n: 4 }).held, 'annualise');
  markSeen(t, 'period.quarterends');
  const a = normalise(t);
  assert.equal(a.held, null);
  assert.equal(row(a, t, 'Base Rent').amount, 360000, 'median 30,000 x 12');
  // as reported, a held line is not in the way
  methods(t, { 'Base Rent': 'reported' });
  delete t.seen['period.quarterends'];
  assert.equal(normalise(t).held, null);
});

test('a month in two columns holds the totals: nothing is computed', () => {
  const t = imp(dupRows());
  assert.ok(heldCount(t) > 0);
  const r = normalise(t);
  assert.equal(r.held, 'totals'); assert.equal(r.ok, false); assert.equal(r.normalised, null);
  assert.deepEqual(r.steps, []);
  methods(t, { 'Base Rent': 'annualise' });
  assert.equal(normalise(t).held, 'totals');
  assert.equal(noiWithout(t), null);
});

test('more than 12 months and running totals not answered also hold the totals', () => {
  assert.equal(normalise(imp(fifteenRows())).held, 'totals');
  assert.equal(normalise(imp(cumulativeRows())).held, 'totals');
});

test('no month columns: annualise and typical month are unavailable (null, "nomonths"), never swapped for as reported', () => {
  const t = imp(quarterHeadRows());
  assert.equal(t.months.length, 0);
  assert.equal(normalise(t).held, null, 'all as reported: the totals are the totals');
  assert.equal(normalise(t).normalised.noi, statementTotals(t).noi);
  for (const m of ['annualise', 'runRate']) {
    methods(t, { 'Base Rent': m });
    const r = normalise(t);
    assert.equal(r.held, 'annualise', m);
    assert.equal(r.normalised, null);
    const l = row(r, t, 'Base Rent');
    assert.equal(l.amount, null); assert.equal(l.adjustment, null); assert.deepEqual(l.notes, ['nomonths']);
  }
  methods(t, { 'Base Rent': 'exclude' });
  assert.equal(normalise(t).normalised.egi, 0, 'exclude needs no months');
});

test('an unknown method counts as as reported, is listed, and is never rewritten', () => {
  const t = U();
  line(t, 'Legal').method = 'x';
  line(t, 'Parking').method = 'future-method';
  const r = normalise(t);
  assert.deepEqual(r.ignored.sort(), [line(t, 'Legal').id, line(t, 'Parking').id].sort());
  assert.equal(row(r, t, 'Legal').method, 'reported');
  assert.equal(row(r, t, 'Legal').amount, 1200, 'not excluded');
  assert.deepEqual(r.normalised, { egi: 72000.02, opex: 15710, taxes: 9500, noi: 56290.02 });
  assert.deepEqual(r.steps, []);
  assert.equal(line(t, 'Legal').method, 'x', 'a newer version\'s value is kept');
  assert.equal(r.counts.reported, 6);
  // setting it to as reported takes the unknown value off
  assert.equal(setMethod(t, line(t, 'Legal').id, 'reported'), true);
  assert.equal('method' in line(t, 'Legal'), false);
  assert.equal(normalise(t).ignored.length, 1);
});

test('an open line counts in no side, as statementTotals has it: the NOI agrees', () => {
  const t = U();
  const p = line(t, 'Parking');
  delete p.category;
  methods(t, { Parking: 'annualise' });
  const T = statementTotals(t);
  assert.equal(T.unassigned, 1000.01);
  const r = normalise(t);
  assert.equal(r.reported.unassigned, 1000.01);
  assert.equal(r.normalised.noi, T.noi);
  assert.equal(row(r, t, 'Parking').side, null);
  assert.equal(row(r, t, 'Parking').amount, 1714.3, 'its own amount is still worked out');
  assert.deepEqual(r.steps, [], 'but it moves no figure');
});

test('a line below the line has a method but is never in NOI or the bridge', () => {
  const t = U();
  line(t, 'Legal').category = 'capex';
  const T = statementTotals(t);
  assert.equal(T.opex, 14510);
  for (const m of ['annualise', 'runRate', 'exclude']) {
    methods(t, { Legal: m });
    const r = normalise(t);
    assert.equal(r.normalised.noi, T.noi, m);
    assert.equal(r.normalised.opex, 14510, m);
    assert.deepEqual(r.steps, [], m);
    assert.equal(row(r, t, 'Legal').side, 'below');
    assert.equal(row(r, t, 'Legal').method, m);
  }
});

/* ------------------------------------------------ setMethod */

test('setMethod: validates, works in place, returns whether it changed, and as reported deletes the field', () => {
  const t = U();
  const id = line(t, 'Repairs').id;
  assert.equal(setMethod(t, id, 'reported'), false, 'already so: nothing to change');
  assert.equal('method' in line(t, 'Repairs'), false);
  assert.equal(setMethod(t, id, 'runRate'), true);
  assert.equal(line(t, 'Repairs').method, 'runRate');
  assert.equal(setMethod(t, id, 'runRate'), false);
  assert.equal(setMethod(t, id, 'median'), false, 'not a method');
  assert.equal(setMethod(t, id, undefined), false);
  assert.equal(setMethod(t, 'nope', 'exclude'), false, 'not a line');
  assert.equal(setMethod(null, id, 'exclude'), false);
  assert.equal(line(t, 'Repairs').method, 'runRate');
  assert.equal(setMethod(t, id, 'reported'), true);
  assert.equal('method' in line(t, 'Repairs'), false, 'a default statement stays byte-identical');
  assert.equal(JSON.stringify(t), JSON.stringify(U()));
});

test('the method survives filing and re-matching a line', () => {
  const t = imp(uRows());
  const l = line(t, 'Legal');
  setMethod(t, l.id, 'exclude');
  fileLine(t, l.id, 'otherOpex');
  assert.equal(line(t, 'Legal').method, 'exclude');
  delete line(t, 'Legal').category;
  const t2 = rematch(t, {});
  assert.equal(line(t2, 'Legal').method, 'exclude');
});

test('normalise writes nothing to the deal, and t12ForAnalysis and the figures are unchanged by methods', () => {
  const t = imp(uRows());
  const before = structuredClone(t);
  const fa = structuredClone(t12ForAnalysis(t));
  const qc = structuredClone(t12Qc(t));
  const rr = structuredClone(runRate(t));
  normalise(t);
  assert.deepEqual(t, before, 'normalise on a default statement changes nothing');
  methods(t, Object.fromEntries(U_LABELS.map((l, i) => [l, METHOD_LIST[1 + (i % 3)]])));
  setWindow(t, 'active');
  const after = structuredClone(t);
  normalise(t);
  assert.deepEqual(t, after, 'nor with methods set');
  assert.deepEqual(t12ForAnalysis(t), fa, 't12ForAnalysis reads the lines as reported (decision 9)');
  assert.equal(fa.noi, 56290.02);
  delete t.window;
  assert.deepEqual(t12Qc(t).checks.map((x) => [x.id, x.level]), qc.checks.map((x) => [x.id, x.level]));
  assert.deepEqual(runRate(t), rr);
});

/* ------------------------------------------------ identity with annualized() and the reported figures */

const noMarks = (t) => { const x = structuredClone(t); for (const l of x.lines) delete l.oneoff; return x; };
async function everyStatement() {
  const out = new Map();
  const add = (name, rows) => out.set(name, imp(rows));
  const per = { dupRows, fifteenRows, cumulativeRows, cumulative12Rows, gapRows, leadingRows, partialRows, plainRows };
  for (const [k, f] of Object.entries(per)) add(`period ${k}`, f());
  add('period cumulative credit', cumulativeRows({ credit: true }));
  add('period flat', flatRows(heads(2025, 1, 12)));
  const val = { quarterEndRows, valueRows, t6Rows, yoyRows, yoyNoiRows, yoy15Rows, yoyMixedRows, quarterHeadRows };
  for (const [k, f] of Object.entries(val)) add(`values ${k}`, f());
  add('suggest arcade', arcadeRows());
  add('suggest arcade no roof', arcadeRows({ roof: false }));
  add('formats SIX', fgrid(statementRows({ lines: SIX })));
  add('normalise U', uRows()); add('normalise C20', c20Rows()); add('normalise C21', c21Rows());
  for (const L of LAYOUTS) {
    const f = await layoutFile(L, ExcelJS);
    if (L.kind === 'csv') out.set(`layout ${L.name}`, statementOf([{ sheet: 'CSV', rows: csvRows(f).map((cells, i) => ({ r: i + 1, cells })).filter((x) => x.cells.some((v) => String(v).trim())) }], { file: L.file }));
    else { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(f); out.set(`layout ${L.name}`, statementOf(gridsOf(wb), { file: L.file })); }
  }
  const dir = new URL('./fixtures/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter((x) => /^backup-.*\.json$/.test(x))) {
    let b; try { b = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')); } catch { continue; }
    (Array.isArray(b.deals) ? b.deals : []).forEach((d, i) => { if (d && d.t12 && Array.isArray(d.t12.lines)) out.set(`${f} deal ${i}`, d.t12); });
  }
  return out;
}

test('identity: every line annualised is annualized() of the totals, bit for bit, for N = 1 to 11, on every statement in the test fixtures and backups', async () => {
  const all = await everyStatement();
  assert.ok(all.size >= 40, `statements: ${all.size}`);
  let compared = 0; let held = 0;
  for (const [name, t0] of all) {
    const t = noMarks(t0);
    for (const l of t.lines) l.method = 'annualise';
    const T = statementTotals(t);
    for (let n = 1; n <= 11; n++) {
      const r = normalise(t, { n });
      if (heldCount(t)) { assert.equal(r.held, 'totals', name); assert.equal(r.normalised, null, name); held++; continue; }
      const A = annualized(T, n);
      assert.equal(r.held, null, `${name} n=${n}`);
      for (const k of ['egi', 'opex', 'taxes', 'noi']) assert.ok(Object.is(r.normalised[k], A[k]), `${name} n=${n} ${k}: ${r.normalised[k]} vs ${A[k]}`);
      // and the bridge adds up
      assert.equal(c(r.reported.noi) + r.steps.reduce((s, x) => s + c(x.noi), 0), c(r.normalised.noi), `${name} n=${n} bridge`);
      compared++;
    }
  }
  assert.ok(compared > 300, `compared ${compared}`);
  assert.ok(held > 0, 'the held statements are in the set too');
});

test('identity: every line as reported is statementTotals (or noiWithout when marks are set), on every statement', async () => {
  const all = await everyStatement();
  let marked = 0;
  for (const [name, t] of all) {
    if (heldCount(t)) continue;
    const r = normalise(t);
    assert.equal(r.held, null, name);
    const w = noiWithout(t);
    const T = statementTotals(t);
    if (w) { marked++; assert.ok(Object.is(r.normalised.noi, w.noi), `${name} with marks`); }
    else for (const k of ['egi', 'opex', 'taxes', 'noi']) assert.ok(Object.is(r.normalised[k], T[k]), `${name} ${k}`);
    assert.deepEqual(r.reported, { egi: T.egi, opex: T.opex, taxes: T.taxes, noi: T.noi, unassigned: T.unassigned }, name);
  }
  assert.equal(marked, 2, 'the 4.7.36 backup carries two marks; they are compared with noiWithout, the rest with the totals');
});

test('as reported with marks: normalised NOI is noiWithout().noi, which now reads from the same path', () => {
  const t = imp(valueRows());
  const id = line(t, 'Building repairs').id;
  assert.equal(applyT12Fix(t, `oneoff.${id}.2026-05`, 'rec:no'), true);
  const w = noiWithout(t);
  assert.equal(w.noi, 190699.99);
  const r = normalise(t);
  assert.ok(Object.is(r.normalised.noi, w.noi));
  assert.equal(row(r, t, 'Building repairs').oneoff, 48000);
  assert.equal(c(r.reported.noi) + r.steps.reduce((s, x) => s + c(x.noi), 0), c(r.normalised.noi));
  assert.deepEqual(r.steps.map((s) => s.kind), ['oneoff']);
  // a stale mark (the amount changed since it was answered) is ignored
  const bld = line(t, 'Building repairs');
  bld.months[4] = 47999.99;
  assert.equal(normalise(t).steps.length, 0);
});

/* ------------------------------------------------ an older backup */

const FIXTURE = new URL('./fixtures/backup-4.7.36-before-underwriting.json', import.meta.url);
test('a 4.7.36 backup restores as it went in; normalise with every line as reported reproduces what it shows', () => {
  const raw = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const b = readBackup(fs.readFileSync(FIXTURE, 'utf8'));
  const put = planRestore(b, { deals: [], kv: {}, session: null, local: {} }, 'merge').deals.put;
  assert.equal(put.length, 3);
  for (let i = 0; i < 3; i++) assert.deepStrictEqual(put[i].t12, raw.deals[i].t12, 'restored as it went in');
  const [uptown, values, plain] = put.map((d) => d.t12);
  for (const t of [uptown, values, plain]) for (const l of t.lines) assert.equal('method' in l, false, 'no method before underwriting');
  // what it showed
  assert.deepEqual([statementTotals(uptown).noi, statementTotals(values).noi, statementTotals(plain).noi], [56290.02, 142699.99, 4800]);
  assert.equal(noiWithout(uptown).noi, 59290.02);
  assert.equal(noiWithout(values).noi, 190699.99);
  assert.equal(noiWithout(plain), null);
  assert.deepEqual([windowOf(uptown).n, windowOf(uptown).ask], [7, false]);
  assert.equal(runRate(uptown), null); assert.equal(runRate(plain).noi, 9600);
  assert.ok(t12Qc(uptown).checks.some((x) => x.id === `oneoff.${line(uptown, 'Repairs').id}.2026-09`));
  // normalise reproduces it
  assert.equal(normalise(uptown).normalised.noi, 59290.02, 'September taken out of Repairs: 56,290.02 + 3,000');
  assert.equal(normalise(values).normalised.noi, 190699.99);
  assert.equal(normalise(plain).normalised.noi, 4800);
  assert.deepEqual(normalise(plain).reported, { egi: 6000, opex: 1200, taxes: 1200, noi: 4800, unassigned: 0 });
});

test('a backup with methods set round-trips them, unknown values included', async () => {
  const b0 = readBackup(fs.readFileSync(FIXTURE, 'utf8'));
  const [d] = planRestore(b0, { deals: [], kv: {}, session: null, local: {} }, 'merge').deals.put;
  methods(d.t12, { Repairs: 'runRate', Legal: 'exclude', Parking: 'annualise' });
  line(d.t12, 'Storage').method = 'from-the-future';
  const before = normalise(d.t12);
  const text = JSON.stringify(await buildBackup({ deals: [d], kv: {}, appVersion: '4.7.37' }));
  const [back] = planRestore(readBackup(text), { deals: [], kv: {}, session: null, local: {} }, 'merge').deals.put;
  assert.deepStrictEqual(back.t12, d.t12);
  assert.equal(line(back.t12, 'Storage').method, 'from-the-future');
  assert.deepEqual(normalise(back.t12), before);
  // Base Rent and Storage as reported 71,000.01 + Parking 1,000.01 x 12 / 7 = 1,714.30; expenses Repairs (Sep out) 4,800 + Taxes 9,500 + Legal 0
  assert.deepEqual(before.normalised, { egi: 72714.31, opex: 14300, taxes: 9500, noi: 58414.31 });
});

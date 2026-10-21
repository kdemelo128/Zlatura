/* T-12 PR 3a "Period structure and the T-12 Data QC panel": a month that heads
 * two columns, a file of more than 12 months, columns that are running
 * totals, and months with no activity (the N that Annualise divides by) are
 * asked about instead of being summed. Totals are held, never rewritten, until
 * the broker chooses. Every figure is invented and worked by hand in
 * tests/fixtures/t12-period-fixtures.js. Each test here fails on 4.7.34, which
 * counts every column and has none of these checks. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  dupRows, fifteenRows, cumulativeRows, cumulative12Rows, gapRows, leadingRows, partialRows, plainRows, flatRows, heads,
} from './fixtures/t12-period-fixtures.js';
import { arcadeRows, labelMemory } from './t12-suggest-fixtures.js';
import { readBackup, planRestore } from '../app/backup.js';
import { analyze } from '../app/deal.js';
import { analysisInput } from '../app/impact.js';
import { reviewItems } from '../app/review.js';
import {
  importStatement, readStatement, normalizeSigns, statementTotals, statementChecks, openChecks, annualized, t12ForAnalysis,
  activity, periodChecks, heldBy, useHeldBy, chooseColumn, chooseMonths, readColumnsAs, setWindow, t12Qc, t12OpenChecks, applyT12Fix, markSeen,
} from '../app/t12.js';

const mem = labelMemory();
const imp = (rows, opts = {}) => importStatement(rows, { file: 'invented.csv', sheet: 'CSV', ...opts });
/** A statement as 4.7.34 kept it: every column counted, no split. */
const asOld = (rows) => ({ v: 2, file: 'invented.csv', sheet: 'CSV', importedAt: 1, seen: {}, ...normalizeSigns(readStatement(rows, { sheet: 'CSV' })) });
const T = (t) => { const x = statementTotals(t); return { egi: x.egi, opex: x.opex, noi: x.noi }; };
const line = (t, label) => t.lines.find((l) => l.label === label);
const check = (t, id) => periodChecks(t).find((c) => c.id === id);
const ids = (cs) => cs.map((c) => c.id);

/* 1. a month that heads two columns */
test('a month heading two columns is a Fail that holds the totals; only choosing a column clears it', () => {
  const t = imp(dupRows());
  // as read, both are counted (130,000 and 6,650): the check holds them, the totals are not rewritten
  assert.deepEqual(T(t), { egi: 130000, opex: 6650, noi: 123350 });
  const c = check(t, 'period.dup.2025-12');
  assert.equal(c.level, 'fail');
  assert.equal(c.amount, 10650, 'the larger of the two columns across lines: 10,000 + 650');
  assert.equal(c.holds, 'totals');
  assert.match(c.text, /Dec 2025 heads two columns \(M and N\)/);
  assert.deepEqual(c.fixes.map((f) => f.id), ['col:2025-12:0', 'col:2025-12:1']);
  assert.equal(heldBy(t).length, 1);
  assert.equal(t12ForAnalysis(t).held, 1);
  assert.equal(useHeldBy(t).length, 1);
  // there is no "accept": Seen does not clear it
  markSeen(t, 'period.dup.2025-12');
  assert.equal(heldBy(t).length, 1, 'both columns would be counted twice');
  assert.equal(t12OpenChecks(t).some((x) => x.id === 'period.dup.2025-12'), true);
  delete t.seen['period.dup.2025-12'];

  // the second Dec: repairs 11 x 500 + 650 = 6,150
  const second = structuredClone(t);
  chooseColumn(second, '2025-12', 1);
  assert.deepEqual(T(second), { egi: 120000, opex: 6150, noi: 113850 });
  assert.equal(second.months.length, 12);
  assert.equal(new Set(second.months).size, 12);
  assert.deepEqual(second.period.dropped.map((d) => [d.iso, d.head]), [['2025-12', 'Dec 2025']]);
  assert.deepEqual(line(second, 'Repairs and Maintenance').dropped, [500], 'the column not used is kept, aligned, so the choice can change');
  assert.equal(line(second, 'Repairs and Maintenance').total, 6150);
  assert.equal(heldBy(second).length, 0);
  assert.equal(t12ForAnalysis(second).held, 0);
  assert.equal(check(second, 'period.dup.2025-12').level, 'pass');
  // the first Dec, then back: the choice can be changed
  chooseColumn(second, '2025-12', 0);
  assert.deepEqual(T(second), { egi: 120000, opex: 6000, noi: 114000 });
  assert.deepEqual(line(second, 'Repairs and Maintenance').dropped, [650]);
  chooseColumn(second, '2025-12', 1);
  assert.deepEqual(T(second), { egi: 120000, opex: 6150, noi: 113850 });
  // the same through the fix the panel and Review offer
  const viaFix = structuredClone(t);
  applyT12Fix(viaFix, 'period.dup.2025-12', 'col:2025-12:0');
  assert.deepEqual(T(viaFix), { egi: 120000, opex: 6000, noi: 114000 });
});

test('a blank cell stays a blank cell (counted as $0, said so) when a duplicate column is dropped before it', () => {
  const rows = dupRows();
  // Repairs is blank in March (column index 3): it is still blank, at position 2, after the first Dec column goes
  rows[4].cells[3] = '';
  const t = imp(rows);
  assert.deepEqual(line(t, 'Repairs and Maintenance').blank, [2]);
  chooseColumn(t, '2025-12', 1);
  assert.deepEqual(line(t, 'Repairs and Maintenance').blank, [2]);
  assert.equal(t.months[2], '2025-03');
  // a blank in the Dec column that is dropped goes with it; the one before it stays
  const u = imp(rows);
  u.lines[1].blank.push(11);
  chooseColumn(u, '2025-12', 1);
  assert.deepEqual(line(u, 'Repairs and Maintenance').blank, [2], 'the dropped column’s blank is not carried onto the kept one');
});

/* 2. more than twelve months */
test('15 months split at import: the latest 12 calendar months are the T-12, the rest are kept as the prior period', () => {
  const t = imp(fifteenRows());
  assert.deepEqual(T(t), { egi: 120000, opex: 12000, noi: 108000 });
  assert.deepEqual(t.period.chosen, { from: '2025-01', to: '2025-12', by: 'latest' });
  assert.deepEqual(t.period.prior, { months: ['2024-10', '2024-11', '2024-12'] });
  assert.equal(t.months.length, 12);
  assert.deepEqual(line(t, 'Base Rent').prior, { months: [9000, 9000, 9000], total: 27000 });
  assert.equal(line(t, 'Real Estate Taxes').prior.total, 3000);
  const c = check(t, 'period.chosen');
  assert.equal(c.level, 'info');
  assert.match(c.text, /15 months: the latest 12 \(Jan 2025 to Dec 2025\) are the T-12; Oct 2024 to Dec 2024 are kept as the prior period/);
  assert.equal(heldBy(t).length, 0);
  assert.equal(check(t, 'period.long'), undefined);
  assert.equal(t12ForAnalysis(t).months, 12);
  // change it: Oct 2024 to Sep 2025
  chooseMonths(t, '2024-10');
  assert.deepEqual(T(t), { egi: 117000, opex: 12000, noi: 105000 });
  assert.deepEqual(line(t, 'Base Rent').prior, { months: [10000, 10000, 10000], total: 30000 });
  assert.equal(line(t, 'Real Estate Taxes').prior.total, 3000);
  assert.deepEqual(t.period.chosen, { from: '2024-10', to: '2025-09', by: 'you' });
  assert.deepEqual(t.period.prior.months, ['2025-10', '2025-11', '2025-12']);
  assert.equal(t.months[0], '2024-10');
  // and back to the latest 12
  chooseMonths(t, '2025-01');
  assert.deepEqual(T(t), { egi: 120000, opex: 12000, noi: 108000 });
  assert.equal(t.period.chosen.by, 'latest');
  assert.equal(t.period.prior.months.length, 3);
});

test('the latest 12 are by calendar, not by column count: a file in newest-first order and a file with a skipped month', () => {
  // newest first: the columns are reversed, the T-12 is still Jan to Dec 2025
  const rows = fifteenRows().map((x) => ({ ...x, cells: [x.cells[0], ...x.cells.slice(1, 16).reverse(), x.cells[16]] }));
  const t = imp(rows);
  assert.deepEqual(t.period.chosen, { from: '2025-01', to: '2025-12', by: 'latest' });
  assert.deepEqual(T(t), { egi: 120000, opex: 12000, noi: 108000 });
  assert.deepEqual([...t.months].sort(), t.months, 'the T-12’s months are in calendar order');
  // 15 columns across 18 calendar months (Feb, Mar and Apr 2025 are not in the file): the window is the 12 calendar
  // months ending at the latest month, so it holds 9 columns, not the last 12 columns
  const skipped = flatRows(heads(2024, 7, 18).filter((m) => !['Feb 2025', 'Mar 2025', 'Apr 2025'].includes(m)));
  const s = imp(skipped);
  assert.deepEqual(s.period.chosen, { from: '2025-01', to: '2025-12', by: 'latest' });
  assert.deepEqual(s.months, ['2025-01', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12']);
  assert.equal(s.period.prior.months.length, 6);
  assert.equal(T(s).egi, 9000);
});

test('a 15-month statement saved by 4.7.34 reads as before and Fails until a window is chosen', () => {
  const t = asOld(fifteenRows());
  assert.deepEqual(T(t), { egi: 147000, opex: 15000, noi: 132000 }, 'not rewritten on load');
  const c = check(t, 'period.long');
  assert.equal(c.level, 'fail');
  assert.equal(c.amount, 24000, '|132,000 - 108,000|');
  assert.equal(c.holds, 'totals');
  assert.equal(c.fixes[0].id, 'months:2025-01', 'the latest 12 first');
  assert.match(c.fixes[0].label, /latest/i);
  assert.equal(heldBy(t).length, 1);
  assert.equal(t12ForAnalysis(t).held, 1);
  applyT12Fix(t, 'period.long', 'months:2025-01');
  assert.deepEqual(T(t), { egi: 120000, opex: 12000, noi: 108000 });
  assert.equal(heldBy(t).length, 0);
  assert.equal(t.period.chosen.by, 'latest');
});

test('linetotals compares the file’s Total column with the T-12, or with the T-12 plus the prior period once a window is chosen', () => {
  const t = imp(fifteenRows());
  // the file's Total is the 15 months (147,000): equal to the T-12 plus the prior period, so not a disagreement
  assert.deepEqual(ids(statementChecks(t)).filter((x) => x === 'linetotals'), ['linetotals'], 'statementChecks itself is unchanged: it compares with the T-12 only');
  const qc = t12Qc(t).checks;
  assert.equal(qc.some((c) => c.id === 'linetotals' && !c.resolved), false, 'the panel does not report the 15-month Total as a disagreement');
  // a Total that is neither is still reported
  const bad = imp(fifteenRows().map((x, i) => (i === 2 ? { ...x, cells: [...x.cells.slice(0, 16), 140000] } : x)));
  assert.equal(t12Qc(bad).checks.some((c) => c.id === 'linetotals'), true);
});

/* 3. running totals */
test('columns that look like running totals: asked, held; monthly reading kept as is', () => {
  const t = imp(cumulativeRows());
  assert.deepEqual(T(t), { egi: 210000, opex: 45200, noi: 164800 }, 'as read: monthly');
  const c = check(t, 'period.cumulative');
  assert.equal(c.level, 'warn');
  assert.equal(c.holds, 'totals');
  assert.equal(c.amount, 121200, '|164,800 - 43,600|');
  assert.deepEqual(c.fixes.map((f) => f.id), ['cols:monthly', 'cols:cumulative']);
  assert.match(c.fixes[0].label, /\$164,800/);
  assert.match(c.fixes[1].label, /\$43,600/);
  assert.equal(heldBy(t).length, 1);
  assert.equal(statementChecks(t).some((x) => x.id === 'linetotals'), true, 'the months do not add to the Total column, as today');
  const m = structuredClone(t);
  readColumnsAs(m, 'monthly');
  assert.deepEqual(T(m), { egi: 210000, opex: 45200, noi: 164800 });
  assert.equal(heldBy(m).length, 0);
  assert.equal(m.period.columnsAre, 'monthly');
  assert.equal(check(m, 'period.cumulative').level, 'pass');
  assert.equal(statementChecks(m).some((x) => x.id === 'linetotals'), true, 'linetotals stays');
});

test('answered "running totals": each month is the difference from the one before, and the differences add up to the last value exactly', () => {
  const t = imp(cumulativeRows());
  readColumnsAs(t, 'cumulative');
  assert.deepEqual(T(t), { egi: 60000, opex: 16400, noi: 43600 });
  assert.deepEqual(line(t, 'Repairs').months, [500, 400, 500, 0, 700, 500]);
  assert.deepEqual(line(t, 'Repairs').cumulative, [500, 900, 1400, 1400, 2100, 2600], 'the printed running totals are kept');
  assert.deepEqual(line(t, 'Real Estate Taxes').months, [0, 0, 6000, 0, 0, 6000]);
  for (const l of t.lines) assert.equal(l.months.reduce((s, v) => Math.round((s + v) * 100) / 100, 0), l.cumulative.at(-1));
  assert.equal(t.period.columnsAre, 'cumulative');
  assert.equal(heldBy(t).length, 0);
  assert.equal(statementChecks(t).some((x) => x.id === 'linetotals'), false, 'the lines now add to the Total column');
  // going back restores the printed numbers
  readColumnsAs(t, 'monthly');
  assert.deepEqual(T(t), { egi: 210000, opex: 45200, noi: 164800 });
  assert.equal('cumulative' in line(t, 'Repairs'), false);
});

test('running totals are recognised when most lines rise to the Total, not on any one line', () => {
  // one line with a credit month still detects: 3 of 4 lines
  assert.equal(check(imp(cumulativeRows({ credit: true })), 'period.cumulative').level, 'warn');
  // exactly half (2 of 4) is not "more than half"
  assert.equal(check(imp(cumulativeRows({ bent: true })), 'period.cumulative'), undefined);
  // with no Total column to confirm against, nothing is detected, and the panel says so
  const noTotal = imp(cumulativeRows({ total: false }));
  assert.equal(check(noTotal, 'period.cumulative'), undefined);
  assert.match(t12Qc(noTotal).intro, /no Total column, so running totals can’t be recognised/);
  // the last month must be within a dollar of the Total: $1.00 off still detects, $2.00 off does not
  assert.equal(check(imp(cumulativeRows({ off: 1 })), 'period.cumulative').level, 'warn');
  assert.equal(check(imp(cumulativeRows({ off: 2 })), 'period.cumulative'), undefined);
  // months that add to the Total are not running totals
  assert.equal(check(imp(plainRows()), 'period.cumulative'), undefined);
  assert.equal(check(imp(gapRows()), 'period.cumulative'), undefined);
});

/* 4. months with no activity: N */
test('activity: a month is active when any line has a non-zero value; gaps are inactive months between active ones', () => {
  const t = imp(gapRows());
  const a = activity(t);
  assert.equal(a.columns, 12);
  assert.equal(a.n, 11);
  assert.deepEqual(a.gaps, ['2025-04']);
  assert.equal(a.active.includes('2025-08'), true, 'one line zero in two months (repairs in April and August): August is still active');
  assert.deepEqual([a.before, a.after], [[], []]);
  const L = activity(imp(leadingRows()));
  assert.equal(L.n, 7);
  assert.deepEqual(L.gaps, [], 'leading inactivity is not a gap');
  assert.equal(L.before.length, 5);
  assert.equal(L.before[0], '2025-01');
  assert.deepEqual(L.after, []);
  // trailing inactivity is not a gap either
  const rows = gapRows();
  rows[2].cells[12] = 0; rows[4].cells[12] = 0; // Dec: every line 0
  const tr = activity(imp(rows));
  assert.deepEqual(tr.after, ['2025-12']);
  assert.deepEqual(tr.gaps, ['2025-04']);
  assert.equal(activity(imp(plainRows())).n, 6);
});

test('N: C20 (one line zero in two months) asks nothing; C21 (every line zero in one) asks and withholds Annualise', () => {
  const g = imp(gapRows());
  const c = check(g, 'period.active');
  assert.equal(c.level, 'warn');
  assert.equal(c.holds, 'annualise');
  assert.equal(c.amount, 0, '12 columns: nothing to annualise');
  assert.match(c.text, /Apr 2025 has no activity on any line/);
  assert.match(c.text, /11 months with activity of 12 columns/);
  assert.deepEqual(c.fixes.map((f) => f.id), ['win:active', 'win:columns']);
  assert.equal(heldBy(g).length, 0, 'a gap does not hold the totals');
  // nothing to ask when every month has activity
  assert.equal(check(imp(plainRows()), 'period.active'), undefined);
  // one line zero in two months, the others not: no gap, no check
  const rows = plainRows();
  rows[2].cells[2] = 0; rows[2].cells[5] = 0; // Rent: zero in two months; taxes still run
  assert.equal(check(imp(rows), 'period.active'), undefined);
  // leading inactivity: asked, and said as "activity starts", never as a gap
  const lead = check(imp(leadingRows()), 'period.active');
  assert.match(lead.text, /activity starts in Jun 2025/i);
  assert.doesNotMatch(lead.text, /gap/i);
});

test('N is annualised as 12 over the months with activity when you say so, over the columns when you say that', () => {
  const t = imp(partialRows());
  assert.deepEqual(T(t), { egi: 50000, opex: 2500, noi: 47500 });
  const c = check(t, 'period.active');
  assert.equal(c.amount, 19000, '|114,000 - 95,000|');
  const S = statementTotals(t);
  assert.equal(S.months, 6);
  // the columns (6): x 12 / 6
  const cols = annualized(S);
  assert.deepEqual([cols.egi, cols.opex, cols.noi, cols.months], [100000, 5000, 95000, 6]);
  assert.deepEqual([annualized(S, 6).noi], [95000]);
  // the months with activity (5): x 12 / 5
  const act = annualized(S, 5);
  assert.deepEqual([act.egi, act.opex, act.noi, act.months], [120000, 6000, 114000, 5]);
  // answers go in `window`
  const a = structuredClone(t);
  setWindow(a, 'active');
  assert.deepEqual(a.window, { n: 5, how: 'active' });
  assert.equal(check(a, 'period.active').level, 'pass');
  assert.match(check(a, 'period.active').text, /N = 5, Mar 2025 had no activity \(your choice\)/);
  const b = structuredClone(t);
  setWindow(b, 'columns');
  assert.deepEqual(b.window, { n: 6, how: 'columns' });
  assert.equal(check(b, 'period.active').level, 'pass');
  // a full year, or no months, is still nothing to scale; 12 columns with N = 11 divides by 11 once you answered "active"
  assert.equal(annualized(statementTotals(imp(gapRows()))), null);
  assert.equal(annualized(statementTotals(imp(gapRows())), 11).months, 11);
  assert.equal(annualized(statementTotals(imp(gapRows())), 12), null);
});

test('a stored answer counts only while it still matches the columns: a later column choice can change N', () => {
  const t = imp(partialRows());
  t.window = { n: 4, how: 'active' }; // N is 5
  assert.equal(check(t, 'period.active').level, 'warn', 'stale: asked again');
  t.window = { n: 5, how: 'columns' }; // the columns are 6
  assert.equal(check(t, 'period.active').level, 'warn');
  t.window = { n: 5, how: 'active' };
  assert.equal(check(t, 'period.active').level, 'pass');
  t.window = { n: 6, how: 'columns' };
  assert.equal(check(t, 'period.active').level, 'pass');
  // answered while 13 columns were counted (a month in two columns, one month with no activity), then a column is
  // chosen: the columns are now 12, so the answer no longer matches and the question comes back
  const d = imp(dupRows());
  d.lines.forEach((l) => { l.months[3] = 0; });
  d.window = { n: 13, how: 'columns' };
  assert.equal(check(d, 'period.active'), undefined, 'not asked while the month in two columns is open');
  chooseColumn(d, '2025-12', 0);
  assert.equal(d.window.n, 13);
  assert.equal(check(d, 'period.active').level, 'warn', '13 no longer matches the 12 columns');
});

/* 5. levels, and the old ids */
test('old checks get levels: stated figures Fail and hold Use (never the totals); the rest are Checks; ids and text unchanged', () => {
  const t = imp(arcadeRows(), { ...mem, suggest: false });
  assert.deepEqual(ids(statementChecks(t)), ['stated.noi']);
  assert.deepEqual(ids(openChecks(t)), ['stated.noi']);
  const q = t12Qc(t).checks.find((c) => c.id === 'stated.noi');
  assert.equal(q.level, 'fail');
  assert.equal(q.holds, 'use');
  assert.equal(q.text, statementChecks(t).find((c) => c.id === 'stated.noi').text);
  assert.deepEqual(ids(heldBy(t)), [], 'the totals are the lines’ sum, shown');
  assert.deepEqual(ids(useHeldBy(t)), ['stated.noi']);
  assert.match(q.fixes[0].label, /^Use the lines’ sum \(\$108,600\)$/);
  assert.equal(q.fixes[0].id, 'seen');
  applyT12Fix(t, 'stated.noi', 'seen');
  assert.equal(t.seen['stated.noi'], true);
  assert.deepEqual(ids(useHeldBy(t)), []);
  assert.deepEqual(T(t), { egi: 120600, opex: 12000, noi: 108600 }, 'the lines’ sum stays the total: nothing is rewritten or invented');
  assert.equal(t12Qc(t).checks.find((c) => c.id === 'stated.noi').resolved.how, 'fixed');
  // the others
  const p = imp(plainRows());
  assert.deepEqual(ids(t12OpenChecks(p)), ['months']);
  assert.equal(t12OpenChecks(p)[0].level, 'warn');
  assert.deepEqual(ids(t12OpenChecks(p)), ids(openChecks(p)), 'a statement with no period problem has the same open ids as before');
  assert.deepEqual(ids(t12OpenChecks(imp(arcadeRows(), { ...mem, suggest: false }))), ids(openChecks(imp(arcadeRows(), { ...mem, suggest: false }))));
  const blank = plainRows(); blank[2].cells[2] = '';
  const bq = t12OpenChecks(imp(blank)).find((c) => c.id === 'blanks');
  assert.equal(bq.level, 'warn');
  assert.deepEqual(bq.fixes.map((f) => f.id), ['seen']);
  assert.equal(bq.fixes[0].label, 'Seen');
});

test('Review: a T-12 check item carries its level, where it is and its fixes', () => {
  const t = imp(dupRows());
  const [g] = reviewItems({ deals: [{ id: 'd1', name: 'Invented', figures: {}, t12: t }] });
  const it = g.items.find((x) => x.checkId === 'period.dup.2025-12');
  assert.equal(it.kind, 't12check');
  assert.equal(it.level, 'fail');
  assert.equal(it.amount, 10650);
  assert.match(it.where, /columns M and N/);
  assert.deepEqual(it.fixes.map((f) => f.id), ['col:2025-12:0', 'col:2025-12:1']);
  chooseColumn(t, '2025-12', 1);
  const after = reviewItems({ deals: [{ id: 'd1', name: 'Invented', figures: {}, t12: t }] });
  assert.equal(after.length === 0 || !after[0].items.some((x) => x.checkId === 'period.dup.2025-12'), true);
});

/* 6. the analysis waits */
test('NOI three ways says "not compared" while a T-12 check holds the totals, and the rent roll comparison waits too', () => {
  const t = asOld(fifteenRows());
  const texts = (x, extra = {}) => analyze(analysisInput({ figures: { noi: 100000 }, loan: {}, t12: x, ...extra }, { project: () => ({ annual: [{ noi: 900000 }] }) })).checks.filter((c) => /NOI|T-12/.test(c.text)).map((c) => c.text);
  assert.deepEqual(texts(t), ['A T-12 check is open, so its NOI isn’t compared yet.']);
  // held with exactly 12 months (running totals): no comparison with the rent roll's forward year either
  const c12 = imp(cumulative12Rows());
  assert.equal(c12.months.length, 12);
  assert.equal(heldBy(c12).length, 1);
  const rr = (x) => texts(x, { rr: { leases: [{ id: 'l1' }], settings: {} } }).filter((s) => /^The T-12’s NOI.*rent roll/.test(s));
  assert.deepEqual(rr(c12), []);
  readColumnsAs(c12, 'monthly');
  assert.ok(rr(c12).length >= 1, 'answered: compared');
});

/* 7. a 4.7.34 backup */
const FIXTURE = new URL('./fixtures/backup-4.7.34-before-t12-periods.json', import.meta.url);
test('a 4.7.34 backup restores with identical totals, figures, old check ids and seen marks; the new checks appear without rewriting anything', () => {
  const raw = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const b = readBackup(fs.readFileSync(FIXTURE, 'utf8'));
  const put = planRestore(b, { deals: [], kv: {}, session: null, local: {} }, 'merge').deals.put;
  assert.equal(put.length, 3);
  const [plain, dup, long] = put;
  for (let i = 0; i < 3; i++) assert.deepStrictEqual(put[i].t12, raw.deals[i].t12, 'restored as it went in');
  assert.deepEqual(T(plain.t12), { egi: 6000, opex: 1200, noi: 4800 });
  assert.deepEqual(T(dup.t12), { egi: 130000, opex: 6650, noi: 123350 });
  assert.deepEqual(T(long.t12), { egi: 147000, opex: 15000, noi: 132000 });
  assert.equal(dup.figures.noi, 123350);
  assert.equal(long.figures.noi, 132000);
  assert.deepEqual(ids(statementChecks(plain.t12)), ['months']);
  assert.deepEqual(ids(statementChecks(dup.t12)), []);
  assert.deepEqual(ids(statementChecks(long.t12)), []);
  // A: no `v`, no `period`: no new check, the seen mark still holds
  assert.equal('v' in plain.t12, false);
  assert.deepEqual(plain.t12.seen, { months: true });
  assert.deepEqual(ids(t12OpenChecks(plain.t12)), []);
  assert.deepEqual(ids(heldBy(plain.t12)), []);
  // B and C gain the checks (D2): both Fail and hold the totals
  assert.deepEqual(ids(heldBy(dup.t12)), ['period.dup.2025-12']);
  assert.deepEqual(ids(heldBy(long.t12)), ['period.long']);
  assert.equal(t12ForAnalysis(dup.t12).held, 1);
  assert.equal(t12ForAnalysis(long.t12).held, 1);
  // and choosing a way out is what changes the totals
  const fixed = structuredClone(dup.t12);
  applyT12Fix(fixed, 'period.dup.2025-12', 'col:2025-12:1');
  assert.deepEqual(T(fixed), { egi: 120000, opex: 6150, noi: 113850 });
  assert.deepEqual(T(dup.t12), { egi: 130000, opex: 6650, noi: 123350 }, 'the restored statement itself is untouched');
});

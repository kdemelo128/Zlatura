/* T-12 PR 3b "Value flags, thresholds and run rate". Every figure is invented
 * and worked by hand in tests/fixtures/t12-values-fixtures.js. Each test here
 * fails on 4.7.35: it has no value checks, no thresholds to set, no run rate,
 * and reads columns headed by quarter-end dates as months. */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { quarterEndRows, valueRows, t6Rows, yoyRows, yoyNoiRows, yoy15Rows, quarterHeadRows, statement, heads } from './fixtures/t12-values-fixtures.js';
import { partialRows } from './fixtures/t12-period-fixtures.js';
import { readBackup, planRestore } from '../app/backup.js';
import { affects } from '../app/impact.js';
import { analyze } from '../app/deal.js';
import { analysisInput } from '../app/impact.js';
import { reviewItems } from '../app/review.js';
import { CONVENTIONS, NOI_GAP, conv, setConventions, conventionValues } from '../app/engine/conventions.js';
import {
  importStatement, statementTotals, annualized, periodChecks, windowOf, t12OpenChecks, useHeldBy, heldBy, applyT12Fix, valueChecks, t12Qc,
  noiWithout, runRate, openLines, setWindow, t12ForAnalysis, statementChecks,
} from '../app/t12.js';

// every test starts from the defaults; settings are module state
const DEFAULTS = Object.fromEntries(CONVENTIONS.filter((c) => c.settable).map((c) => [c.id, c.default]));
afterEach(() => { setConventions(DEFAULTS); });

const imp = (rows, opts = {}) => importStatement(rows, { file: 'invented.csv', sheet: 'CSV', ...opts });
const check = (t, id) => periodChecks(t).find((c) => c.id === id);
const vc = (t) => valueChecks(t);
const ids = (t) => vc(t).map((c) => c.id);
const find = (t, id) => vc(t).find((c) => c.id === id);
const lineId = (t, label) => t.lines.find((l) => l.label === label).id;

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

/* A: the value checks, defaults */
test('spike: a month more than 3 x the typical (non-zero) month and over the larger of $1,000 and 0.5% of EGI; the boundary is strict', () => {
  const t = imp(valueRows());
  assert.deepEqual(statementTotals(t).noi, 142699.99);
  const spikes = ids(t).filter((x) => x.startsWith('spike.'));
  assert.deepEqual(spikes, [`spike.${lineId(t, 'Repairs')}.2026-09`, `spike.${lineId(t, 'Building repairs')}.2026-05`]);
  const r = find(t, spikes[0]);
  assert.equal(r.level, 'warn');
  assert.equal(r.amount, 2600, 'Sep 3,000 less its typical month 400');
  assert.equal(r.text, 'Repairs: Sep 2026 is $3,000, more than 3 × its typical month ($400) and over $1,200 (the larger of $1,000 and 0.5% of EGI).');
  assert.equal(find(t, spikes[1]).amount, 47500);
  assert.equal(r.holds, undefined, 'a warning, never a hold');
  assert.deepEqual(r.fixes.map((f) => f.id), ['seen']);
  // Landscaping Jun 1,500 is exactly 3 x 500, Pest control Mar 900 is under the 1,200 floor
  assert.equal(ids(t).some((x) => x.includes(lineId(t, 'Landscaping'))), false);
  assert.equal(ids(t).some((x) => x.startsWith('spike.') && x.includes(lineId(t, 'Pest control'))), false);
});

test('spike: the typical month leaves zeros out (a seasonal line), and a line needs three non-zero months', () => {
  // Snow: Jan, Feb, Nov, Dec 100 each, Mar 1,500: median of all twelve months is 0, of the non-zero ones 100
  const rows = statement(heads(2026, 1, 12), [['Base Rent', ...Array(12).fill(20000)]], [['Snow removal', 100, 100, 1500, 0, 0, 0, 0, 0, 0, 0, 100, 100], ['Two months', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 5000]]);
  const t = imp(rows);
  assert.deepEqual(ids(t).filter((x) => x.startsWith('spike.')), [`spike.${lineId(t, 'Snow removal')}.2026-03`]);
  assert.equal(find(t, `spike.${lineId(t, 'Snow removal')}.2026-03`).amount, 1400);
});

test('negative expense line and negative month: a month at or past the setting, never 499.99; a line below zero is its own warning', () => {
  const t = imp(valueRows());
  const neg = ids(t).filter((x) => x.startsWith('negmonth.'));
  assert.deepEqual(neg, [`negmonth.${lineId(t, 'Utilities')}.2026-07`, `negmonth.${lineId(t, 'Cleaning')}.2026-02`]);
  assert.equal(find(t, neg[0]).amount, 600);
  assert.equal(find(t, neg[1]).amount, 500, 'exactly the setting flags');
  assert.equal(find(t, neg[0]).level, 'info');
  const refund = lineId(t, 'Insurance refund');
  const ne = find(t, `negexp.${refund}`);
  assert.equal(ne.level, 'warn');
  assert.equal(ne.amount, 2500);
  assert.equal(ids(t).some((x) => x.startsWith('negmonth.') && x.includes(refund)), false, 'a line already below zero is not also a negative month');
  assert.equal(ids(t).some((x) => x.startsWith('oneoff.') && x.includes(refund)), false);
  // the rent line and the other income are not "negative expenses"
  assert.equal(ids(t).filter((x) => x.startsWith('negexp.')).length, 1);
});

test('large one-off: one month at least half the line, the line at least 1% of its side; Not sure stores nothing', () => {
  const t = imp(valueRows());
  const ones = ids(t).filter((x) => x.startsWith('oneoff.'));
  assert.deepEqual(ones, [`oneoff.${lineId(t, 'Building repairs')}.2026-05`, `oneoff.${lineId(t, 'Sign repairs')}.2026-03`]);
  const c = find(t, ones[0]);
  assert.equal(c.level, 'info');
  assert.equal(c.amount, 48000);
  assert.match(c.text, /Building repairs: May 2026 is \$48,000, 90% of the line’s \$53,500 for the period.*needs classification\. Recurring\?$/);
  assert.deepEqual(c.fixes.map((f) => f.label), ['Recurring? Yes', 'Recurring? No', 'Not sure']);
  assert.equal(find(t, ones[1]).amount, 1000, 'exactly half, the earlier of two equal months');
  // Pest control 45%, Repairs 40.5%, Permits $900 under $973.00 are not asked about
  for (const l of ['Pest control', 'Repairs', 'Permits']) assert.equal(ids(t).some((x) => x.startsWith('oneoff.') && x.includes(lineId(t, l))), false, l);
  // Not sure: nothing stored, nothing filed or unfiled, the same checks
  const before = structuredClone(t);
  assert.equal(applyT12Fix(t, ones[0], 'rec:notsure'), false);
  assert.deepEqual(t, before);
  assert.equal(openLines(t).length, 0);
  assert.equal(t.lines.some((l) => 'needs' in l), false, 'Not sure must not set line.needs: that would unfile the line and move NOI');
  assert.equal(noiWithout(t), null);
});

test('Recurring? No: the reported NOI never changes; "without" is added beside it and takes out the marked month only', () => {
  const t = imp(valueRows());
  const id = `oneoff.${lineId(t, 'Building repairs')}.2026-05`;
  const noi = statementTotals(t).noi;
  assert.equal(applyT12Fix(t, id, 'rec:no'), true);
  const b = t.lines.find((l) => l.label === 'Building repairs');
  assert.deepEqual(b.oneoff, { iso: '2026-05', amount: 48000, recurring: 'no' });
  assert.equal(b.method, undefined, 'not the whole-line method');
  assert.equal(b.needs, undefined);
  assert.equal(statementTotals(t).noi, noi, 'NOI as reported is the same');
  assert.equal(noi, 142699.99);
  assert.equal(t12ForAnalysis(t).noi, 142699.99);
  const w = noiWithout(t);
  assert.equal(w.noi, 190699.99, '142,699.99 + 48,000: only May; excluding the whole line would be 196,199.99');
  assert.equal(w.text, 'NOI without the one-offs you marked: $190,700 (1 marked: Building repairs, May 2026, $48,000)');
  assert.deepEqual(b.months[4], 48000);
  assert.equal(statementTotals(t).opex, 97300.01);
  // the question is now answered: a pass line with a way to change it
  const a = find(t, id);
  assert.equal(a.level, 'pass');
  assert.match(a.text, /you said it is a one-off/);
  assert.deepEqual(a.fixes.map((f) => [f.id, !!f.more]), [['rec:yes', true]]);
  assert.equal(t12OpenChecks(t).some((x) => x.id === id), false);
  // Yes: nothing is added
  assert.equal(applyT12Fix(t, id, 'rec:yes'), true);
  assert.equal(noiWithout(t), null);
  assert.match(find(t, id).text, /recurs, so it stays in NOI/);
  // saying the same again is no change
  assert.equal(applyT12Fix(t, id, 'rec:yes'), false);
  // No again; then May's amount changes: the question reopens, and the old answer no longer counts
  applyT12Fix(t, id, 'rec:no');
  const i = 4;
  for (const l of t.lines) if (l.label === 'Building repairs') { l.months[i] = 47000; l.total = 52500; }
  assert.equal(noiWithout(t), null);
  assert.equal(find(t, id).level, 'info');
  assert.deepEqual(find(t, id).fixes.map((f) => f.id), ['rec:yes', 'rec:no', 'rec:notsure']);
});

test('"without" counts a marked income month the other way, and a line not yet filed not at all', () => {
  // Parking: Mar 12,000 of 12,000 (a lump of income) in a statement with rent 10,000 a month
  const rows = statement(heads(2026, 1, 12), [['Base Rent', ...Array(12).fill(10000)], ['Parking', 0, 0, 12000, 0, 0, 0, 0, 0, 0, 0, 0, 0]], [['Repairs', ...Array(12).fill(200)]]);
  const t = imp(rows);
  const id = `oneoff.${lineId(t, 'Parking')}.2026-03`;
  assert.ok(find(t, id));
  applyT12Fix(t, id, 'rec:no');
  assert.equal(statementTotals(t).noi, 129600, '132,000 - 2,400');
  assert.equal(noiWithout(t).noi, 117600, 'less the 12,000 of parking');
  const p = t.lines.find((l) => l.label === 'Parking'); p.category = null; // unfiled: not in NOI, so not taken out of it
  assert.equal(noiWithout(t), null);
});

test('settings move the checks: 2.5 x flags Landscaping; floor 0 and 0% of income flags Pest control; share, side and negative month', () => {
  const t = imp(valueRows());
  const land = `spike.${lineId(t, 'Landscaping')}.2026-06`;
  const pest = `spike.${lineId(t, 'Pest control')}.2026-03`;
  setConventions({ 't12.spike.times': 2.5 });
  assert.ok(ids(t).includes(land), '1,500 > 2.5 x 500 = 1,250');
  setConventions({ 't12.spike.times': 3, 't12.spike.floor': 0, 't12.spike.egiPct': 0 });
  assert.ok(ids(t).includes(pest), '900 > 3 x 100 and over no floor');
  // the share of income: 0.5% of 240,000; 5% (limit 12,000) leaves out Repairs' 3,000
  setConventions({ 't12.spike.floor': 1000, 't12.spike.egiPct': 5 });
  assert.equal(ids(t).some((x) => x.includes(`spike.${lineId(t, 'Repairs')}`)), false);
  assert.ok(ids(t).includes(`spike.${lineId(t, 'Building repairs')}.2026-05`));
  setConventions(DEFAULTS);
  // share 60: Sign repairs (50%) drops out; side 5%: expense side 97,300.01 x 5% = 4,865.00 drops Sign repairs and keeps Building repairs
  setConventions({ 't12.oneoff.share': 60 });
  assert.equal(ids(t).some((x) => x.startsWith('oneoff.') && x.includes(lineId(t, 'Sign repairs'))), false);
  setConventions(DEFAULTS);
  setConventions({ 't12.oneoff.side': 5 });
  assert.deepEqual(ids(t).filter((x) => x.startsWith('oneoff.')), [`oneoff.${lineId(t, 'Building repairs')}.2026-05`]);
  setConventions(DEFAULTS);
  // negative month: Security's -499.99 flags once the setting is 499.99 or less; at 0 only real negatives flag (never a zero month)
  setConventions({ 't12.negMonth': 499.99 });
  assert.ok(ids(t).includes(`negmonth.${lineId(t, 'Security')}.2026-04`));
  setConventions({ 't12.negMonth': 0 });
  const zero = ids(t).filter((x) => x.startsWith('negmonth.'));
  assert.deepEqual(zero.map((x) => x.split('.')[1]), [lineId(t, 'Utilities'), lineId(t, 'Cleaning'), lineId(t, 'Security')], 'Utilities, Cleaning, Security: three lines with a below-zero month, no zero month');
});

test('none of the value checks holds the totals or Use; they are warnings and notes', () => {
  const t = imp(valueRows());
  const all = vc(t);
  assert.equal(all.length, 7, 'two spikes, two negative months, the refund, two one-offs');
  assert.equal(all.some((c) => c.holds), false);
  assert.deepEqual(useHeldBy(t), []);
  assert.deepEqual(heldBy(t), []);
  assert.equal(t12ForAnalysis(t).held, 0);
  // they reach t12Qc and Review: the warnings only
  const q = t12Qc(t).checks.map((c) => c.id);
  for (const c of all) assert.ok(q.includes(c.id));
  const warns = t12OpenChecks(t).map((c) => c.id).filter((x) => /^(spike|negexp|oneoff|negmonth|yoy)/.test(x));
  assert.equal(warns.length, 3, 'two spikes and the refund');
  const rv = reviewItems({ deals: [{ id: 'x', name: 'x', figures: {}, t12: t }] }).flatMap((g) => g.items).filter((i) => i.kind === 't12check').map((i) => i.checkId);
  for (const w of warns) assert.ok(rv.includes(w));
  assert.equal(rv.some((x) => x.startsWith('oneoff.') || x.startsWith('negmonth.')), false, 'notes are panel-only');
  // Seen clears a warning, and only from Review
  const spike = warns.find((x) => x.startsWith('spike.'));
  applyT12Fix(t, spike, 'seen');
  assert.equal(t12OpenChecks(t).some((c) => c.id === spike), false);
  assert.equal(statementTotals(t).noi, 142699.99);
});

test('a statement held for a month counted twice gets no value checks', () => {
  const t = imp(valueRows());
  assert.ok(vc(t).length > 0);
  t.months[11] = '2026-11'; // December heads a second November column
  assert.equal(heldBy(t).length, 1);
  assert.deepEqual(vc(t), []);
});

test('an older statement gains the value checks and loses nothing: its totals, ids and seen marks are as they were', () => {
  const t = imp(valueRows());
  delete t.period; delete t.source; delete t.v; // as read before 4.7.28
  t.seen = { months: true };
  const T = statementTotals(t);
  assert.ok(vc(t).length > 0);
  assert.deepEqual(statementTotals(t), T);
  assert.deepEqual(t.seen, { months: true });
  assert.deepEqual(statementChecks(t).map((c) => c.id), []);
});

/* C: year over year */
test('year over year compares like months: +25.0% is not flagged, +30% is (lines and categories); NOI -2.3% says nothing', () => {
  const t = imp(yoyRows());
  assert.equal(t.period.prior.months.length, 12);
  assert.equal(statementTotals(t).noi, 206400);
  const c = vc(t);
  const lines = c.find((x) => x.id === 'yoy.lines'); const cats = c.find((x) => x.id === 'yoy.cats');
  assert.match(lines.text, /^Year over year on like months \(Jan 2026 to Dec 2026 against Jan 2025 to Dec 2025\), 1 line moved more than 25%: Utilities \+30\.0% \(\$12,000 to \$15,600\)\.$/);
  assert.match(cats.text, /1 category moved more than 25%: Utilities \+30\.0%/);
  assert.equal(lines.amount, 3600);
  assert.equal(lines.level, 'info');
  assert.equal(c.some((x) => x.id === 'yoy.noi'), false);
  assert.equal(c.some((x) => /Repairs/.test((x.id.startsWith('yoy') ? x.text : ''))), false, 'Repairs +25.0% is on the line, not over it');
});

test('year over year NOI: +75% over a 50% setting is a warning with the change as its amount', () => {
  const t = imp(yoyNoiRows());
  assert.equal(statementTotals(t).noi, 168000);
  const n = find(t, 'yoy.noi');
  assert.equal(n.level, 'warn');
  assert.equal(n.amount, 72000);
  assert.equal(n.holds, undefined);
  assert.match(n.text, /^NOI is up 75\.0% year over year on like months \(Jan 2026 to Dec 2026 against Jan 2025 to Dec 2025\): \$96,000 to \$168,000, more than 50%\.$/);
  assert.equal(t12OpenChecks(t).some((c) => c.id === 'yoy.noi'), true);
  setConventions({ 't12.yoy.noi': 80 });
  assert.equal(find(t, 'yoy.noi'), undefined);
});

test('year over year with a short prior period: only the months both years have, never scaled', () => {
  const t = imp(yoy15Rows());
  assert.equal(t.period.prior.months.length, 3);
  setConventions({ 't12.yoy.line': 10 });
  const l = find(t, 'yoy.lines');
  assert.match(l.text, /\(Oct 2025 to Dec 2025 against Oct 2024 to Dec 2024\)/);
  assert.match(l.text, /Base Rent \+11\.1% \(\$27,000 to \$30,000\)/);
  assert.equal(l.amount, 3000);
  // at the default there is nothing to say
  setConventions(DEFAULTS);
  assert.deepEqual(ids(t), []);
});

/* Q: quarters */
test('columns headed Q1 to Q4 are said to be quarters; only the Total is read', () => {
  const t = imp(quarterHeadRows());
  assert.equal(t.months.length, 0);
  assert.deepEqual(t.period.nonMonthly, { kind: 'quarters', heads: ['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025'] });
  const q = find(t, 'period.quarters');
  assert.equal(q.level, 'info');
  assert.equal(q.text, 'The columns are quarters (Q1 2025 to Q4 2025); only the Total column is read, as one period.');
  assert.equal(statementTotals(t).noi, 348000);
  // an ordinary monthly statement says nothing of the kind
  assert.equal(find(imp(valueRows()), 'period.quarters'), undefined);
});

/* B: the run rate */
test('run rate: the one annualized function over the same N; lumps named; the OM compared; nothing reaches the deal', () => {
  const t = imp(t6Rows());
  assert.deepEqual(statementTotals(t), { ...statementTotals(t), egi: 120000, opex: 15000, noi: 105000, taxes: 12000 });
  const before = structuredClone(t);
  const deal = { figures: { noi: 190000 }, sources: {}, t12: t };
  const dealBefore = structuredClone(deal);
  const r = runRate(t, { omNoi: 190000 });
  assert.deepEqual([r.egi, r.opex, r.taxes, r.noi], [240000, 30000, 24000, 210000]);
  const A = annualized(statementTotals(t), windowOf(t).n);
  assert.deepEqual([r.egi, r.opex, r.taxes, r.noi], [A.egi, A.opex, A.taxes, A.noi], 'the Annualize path\'s figures to the cent');
  assert.equal(r.heading, 'run rate: 6 months × 2, not a T-12');
  assert.deepEqual(r.lumps.map((x) => x.text), ['Real Estate Taxes: $12,000 paid in Apr 2026; a run rate counts it twice ($24,000)']);
  assert.equal(r.om.text, 'Run-rate NOI $210,000 is 9.5% above the OM’s $190,000: a run rate is not a T-12.');
  assert.deepEqual(t, before, 'the statement is untouched');
  assert.deepEqual(deal, dealBefore, 'and so is the deal: no figure, no source, no applied');
  assert.equal(t.applied, undefined);
  assert.equal(runRate(t, { omNoi: 300000 }).om.text, 'Run-rate NOI $210,000 is 30.0% below the OM’s $300,000: a run rate is not a T-12.');
  assert.equal(runRate(t).om, null);
});

test('run rate: not for a full year, not while Annualise waits, and over the months with activity once that is the answer', () => {
  assert.equal(runRate(imp(valueRows())), null, '12 months: nothing to scale');
  assert.equal(runRate(imp(quarterHeadRows())), null, 'no months');
  assert.equal(runRate(imp(quarterEndRows())), null, 'columns that may be quarters wait');
  const p = imp(partialRows());
  assert.equal(windowOf(p).ask, true);
  assert.equal(runRate(p), null, 'months with no activity wait for the broker');
  setWindow(p, 'active');
  const r = runRate(p);
  assert.deepEqual([r.egi, r.opex, r.noi], [120000, 6000, 114000], 'Jan to Jun 2025 with March empty: x 12 / 5');
  assert.equal(r.heading, 'run rate: 5 months with activity × 12 ÷ 5, not a T-12');
  setWindow(p, 'columns');
  assert.equal(runRate(p).noi, 95000);
  assert.equal(runRate(p).heading, 'run rate: 6 months × 2, not a T-12');
  // and the same after answering the quarter ends: columns, x 3
  const q = imp(quarterEndRows());
  applyT12Fix(q, 'period.quarterends', 'seen');
  assert.equal(runRate(q).noi, 342000);
  assert.equal(runRate(q).heading, 'run rate: 4 months × 3, not a T-12');
  // lines still to file: not a run rate of part of the statement
  const u = imp(t6Rows());
  u.lines[0].category = null;
  assert.equal(runRate(u), null);
});

/* E: settings */
test('settings: a number is taken only if it is a number inside its range; the NOI levels stay in order', () => {
  assert.deepEqual([conv('t12.spike.times'), conv('t12.spike.floor'), conv('t12.spike.egiPct'), conv('t12.negMonth'), conv('t12.oneoff.share'), conv('t12.oneoff.side'), conv('t12.yoy.line'), conv('t12.yoy.noi'), conv('noi.agree'), conv('noi.warn')], [3, 1000, 0.5, 500, 50, 1, 25, 50, 2, 5]);
  setConventions({ 't12.spike.times': '3.5' });
  assert.equal(conv('t12.spike.times'), 3, 'text is ignored');
  setConventions({ 't12.spike.times': NaN });
  assert.equal(conv('t12.spike.times'), 3);
  setConventions({ 't12.spike.times': Infinity });
  assert.equal(conv('t12.spike.times'), 3);
  setConventions({ 't12.spike.times': 25 });
  assert.equal(conv('t12.spike.times'), 3, 'over 20');
  setConventions({ 't12.spike.times': 1.4 });
  assert.equal(conv('t12.spike.times'), 3, 'under 1.5');
  setConventions({ 't12.spike.times': 1.5 });
  assert.equal(conv('t12.spike.times'), 1.5, 'the ends are in');
  setConventions({ 't12.oneoff.share': 9 });
  assert.equal(conv('t12.oneoff.share'), 50);
  setConventions({ 't12.negMonth': null });
  assert.equal(conv('t12.negMonth'), 500);
  assert.doesNotThrow(() => setConventions({ 't12.spike.floor': {}, 'nope': 1, 'walt.weight': 7 }));
  // agree must stay below warn: both go back to what they were
  setConventions({ 'noi.agree': 6, 'noi.warn': 5 });
  assert.deepEqual([conv('noi.agree'), conv('noi.warn')], [2, 5]);
  setConventions({ 'noi.agree': 5 });
  assert.deepEqual([conv('noi.agree'), conv('noi.warn')], [2, 5], 'equal is not below');
  setConventions({ 'noi.warn': 8, 'noi.agree': 3 });
  assert.deepEqual([conv('noi.agree'), conv('noi.warn')], [3, 8]);
  assert.deepEqual([conventionValues()['noi.agree'], conventionValues()['noi.warn']], [3, 8]);
});

test('NOI_GAP is a read of the settings, not a copy; the three-way comparison follows it and is unchanged at the defaults', () => {
  assert.deepEqual([NOI_GAP.agree, NOI_GAP.warn], [2, 5]);
  setConventions({ 'noi.warn': 8, 'noi.agree': 3 });
  assert.deepEqual([NOI_GAP.agree, NOI_GAP.warn], [3, 8]);
  setConventions(DEFAULTS);
  // a T-12 whose NOI is exactly `noi` (one insurance month holds all the expenses); the OM's is 500,000
  const noiChecks = (noi) => {
    const t = imp(statement(heads(2025, 1, 12), [['Base Rent', ...Array(12).fill(100000)]], [['Insurance', 1200000 - noi, ...Array(11).fill(0)]]));
    assert.equal(statementTotals(t).noi, noi);
    return analyze(analysisInput({ figures: { noi: 500000 }, loan: {}, t12: t })).checks.filter((c) => /NOI/.test(c.text)).map((c) => c.level);
  };
  assert.deepEqual(noiChecks(490100), [], '1.98% agrees');
  assert.deepEqual(noiChecks(490000), ['info'], '2.0% exactly is noted');
  assert.deepEqual(noiChecks(475000), ['info'], '5.0% exactly is noted, not a warning');
  assert.deepEqual(noiChecks(474000), ['warn'], '5.2% warns');
  setConventions({ 'noi.warn': 8, 'noi.agree': 3 });
  assert.deepEqual(noiChecks(490000), [], '2.0% agrees at 3%');
  assert.deepEqual(noiChecks(485000), ['info'], '3.0% exactly is noted');
  assert.deepEqual(noiChecks(474000), ['info'], '5.2% is noted below an 8% warning');
  assert.deepEqual(noiChecks(460000), ['info'], '8.0% exactly is noted, not above 8%');
  assert.deepEqual(noiChecks(459000), ['warn'], '8.2% warns');
});

test('the Impact map says Settings moves the NOI three ways checks', () => {
  const t = imp(statement(heads(2025, 1, 12), [['Base Rent', ...Array(12).fill(50000)]], [['Insurance', ...Array(12).fill(4000)]]));
  const deal = { name: 'x', figures: { noi: 500000, gross: 600000, opex: 50000 }, loan: {}, live: {}, scenarios: [], targets: {}, t12: t };
  const a = affects(['conventions'], { deal });
  for (const id of ['check.noiOmT12', 'check.noiT12RentRoll', 'check.noiOmRentRoll']) assert.ok([...a.now, ...a.could.map((x) => x.id)].includes(id), id);
});

/* F: an older backup */
const FIXTURE = new URL('./fixtures/backup-4.7.35-before-t12-values.json', import.meta.url);
test('a 4.7.35 backup restores with identical totals, old check ids and seen marks; the value checks and quarter ends appear without rewriting anything', () => {
  const raw = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const b = readBackup(fs.readFileSync(FIXTURE, 'utf8'));
  const put = planRestore(b, { deals: [], kv: {}, session: null, local: {} }, 'merge').deals.put;
  assert.equal(put.length, 3);
  const [vals, qends, plain] = put;
  for (let i = 0; i < 3; i++) assert.deepStrictEqual(put[i].t12, raw.deals[i].t12, 'restored as it went in');
  assert.deepEqual(statementTotals(vals.t12).noi, 142699.99);
  assert.deepEqual(statementTotals(qends.t12).noi, 114000);
  assert.deepEqual(statementTotals(plain.t12).noi, 4800);
  assert.equal(vals.figures.noi, 142699.99);
  // the value checks are new on the old statement
  assert.ok(ids(vals.t12).some((x) => x.startsWith('spike.')));
  assert.equal(t12OpenChecks(vals.t12).filter((c) => c.kind === 'spike').length, 2);
  assert.equal('oneoff' in vals.t12.lines[1], false);
  assert.deepEqual(statementChecks(vals.t12).map((c) => c.id), []);
  // the quarter ends are caught on a saved statement too: Annualise waits
  assert.equal(windowOf(qends.t12).ask, true);
  assert.deepEqual(heldBy(qends.t12), []);
  assert.deepEqual(useHeldBy(qends.t12).map((c) => c.id), []);
  // the plain statement: no `v`, no `period`; its seen mark is kept and nothing new is open
  assert.equal('v' in plain.t12, false);
  assert.deepEqual(plain.t12.seen, { months: true });
  assert.deepEqual(t12OpenChecks(plain.t12), []);
});

/* T-12 PR 2 "Suggestions, not choices": a remembered label is offered, never
 * filed; a line that is below the line by its wording but sits under
 * Expenses (or under no heading) is asked about; the totals leave open lines
 * out and the figures wait for them by count; "Confirm all" files each label
 * once; a statement filed by an earlier version keeps its filings and gets
 * one Note; a backup restore joins the deals a label was filed in. Every
 * figure is invented (tests/t12-suggest-fixtures.js, worked by hand there).
 * Each test here fails on 4.7.33 (which files a remembered label at once). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { arcadeRows, arcadeCsv, rowsOf, labelMemory, MONTHS_2026 } from './t12-suggest-fixtures.js';
import { LAYOUTS, layoutFile } from './t12-layouts.js';
import { statementOf } from './t12-formats.js';
import { gridsOf, csvRows } from '../app/sheetread.js';
import { readOm } from '../app/om.js';
import { readBackup, planRestore } from '../app/backup.js';
import { analyze } from '../app/deal.js';
import { analysisInput } from '../app/impact.js';
import {
  importStatement, matchLabel, statementTotals, statementChecks, statementNotes, earlierFilings, suggestionText,
  openLines, fileLine, rematch, confirmSuggested, markSeen, t12ForAnalysis,
} from '../app/t12.js';

const mem = labelMemory();
const importA = (opts = {}) => importStatement(arcadeRows(opts.csv), { file: 'arcade.csv', sheet: 'CSV', ...mem, ...opts.read });
const line = (t, label) => t.lines.find((l) => l.label === label);
const pick = (T) => ({ egi: T.egi, opex: T.opex, noi: T.noi, below: T.below, unassigned: T.unassigned });

/* 1. 4.7.33's reading, kept on the path that files without asking (suggest: false, the OM statement reader) */
test('suggest: false reads statement A exactly as 4.7.33 did', () => {
  const t = importA({ read: { suggest: false } });
  assert.deepEqual(pick(statementTotals(t)), { egi: 120600, opex: 12000, noi: 108600, below: 38500, unassigned: 0 });
  assert.equal(line(t, 'Pylon Sign Lease').how, 'yours');
  assert.equal(line(t, 'Roof Replacement Capital').how, 'rule');
  assert.equal(line(t, 'Roof Replacement Capital').category, 'capex');
  assert.deepEqual(statementChecks(t).map((c) => c.id), ['stated.noi'], 'the file’s NOI disagrees by the roof, 2,500');
  assert.equal(t.lines.some((l) => 'suggested' in l || 'needs' in l), false);
});

/* 2. what PR 2 reads of the same file */
test('statement A: the pylon is suggested, the roof is asked about, the mortgage still files by its heading', () => {
  const t = importA();
  const pylon = line(t, 'Pylon Sign Lease'); const roof = line(t, 'Roof Replacement Capital'); const mort = line(t, 'Mortgage Interest');
  assert.deepEqual([pylon.how, pylon.category, pylon.suggested.category, pylon.suggested.from], ['suggested', null, 'otherIncome', 'label']);
  assert.equal(suggestionText(pylon.suggested), 'mapped this way in 6 of your last 7 deals (once to Contract services)');
  assert.deepEqual([roof.how, roof.category, roof.needs, roof.suggested], ['needs', null, 'classification', { category: 'capex', from: 'wording' }]);
  assert.deepEqual([mort.how, mort.category], ['rule', 'debt']);
  const T = statementTotals(t);
  // EGI is rent only (the pylon's 600 is open), the roof is open: 600 + 2,500 = 3,100 not yet filed
  assert.deepEqual(pick(T), { egi: 120000, opex: 12000, noi: 108000, below: 36000, unassigned: 3100 });
  assert.equal(openLines(t).length, 2);
  assert.equal(t12ForAnalysis(t).open, 2);
  assert.deepEqual(statementChecks(t).map((c) => c.id), [], 'no stated NOI check while lines are open');
});

/* 3. each way out */
test('confirming the pylon and keeping the roof in operating reaches the file’s own NOI; below the line it does not', () => {
  const t = importA();
  const pylon = line(t, 'Pylon Sign Lease');
  fileLine(t, pylon.id, pylon.suggested.category);
  assert.equal('suggested' in pylon, false, 'a filed line no longer carries a suggestion');
  const keep = structuredClone(t);
  fileLine(keep, line(keep, 'Roof Replacement Capital').id, 'repairs');
  assert.equal('needs' in line(keep, 'Roof Replacement Capital'), false);
  assert.deepEqual(pick(statementTotals(keep)), { egi: 120600, opex: 14500, noi: 106100, below: 36000, unassigned: 0 });
  assert.deepEqual(statementChecks(keep).map((c) => c.id), [], '106,100 is the NOI the file states');
  fileLine(t, line(t, 'Roof Replacement Capital').id, 'capex');
  assert.deepEqual(pick(statementTotals(t)), { egi: 120600, opex: 12000, noi: 108600, below: 38500, unassigned: 0 });
  assert.deepEqual(statementChecks(t).map((c) => c.id), ['stated.noi']);
});

/* 4. signs */
function lostOccupancy(read) {
  const rows = rowsOf(arcadeCsv({ extra: [['Lost Occupancy', 500, 6000]], roof: false }));
  return importStatement(rows, { file: 'x.csv', sheet: 'CSV', ...read });
}
test('a reduction printed positive is signed negative while it is only suggested, so Confirm does not flip the total', () => {
  const mem2 = { corrections: { 'lost occupancy': 'vacancy' }, history: { 'lost occupancy': { category: 'vacancy', at: 1 } } };
  const t = lostOccupancy(mem2);
  const l = line(t, 'Lost Occupancy');
  assert.equal(l.how, 'suggested');
  assert.equal(l.total, -6000);
  assert.equal(l.signFlipped, true);
  fileLine(t, l.id, 'vacancy');
  assert.equal(line(t, 'Lost Occupancy').total, -6000);
  fileLine(t, line(t, 'Pylon Sign Lease').id, 'otherIncome');
  assert.equal(statementTotals(t).egi, 120000 - 6000 + 600);
  const old = lostOccupancy({ ...mem2, suggest: false });
  assert.equal(line(old, 'Lost Occupancy').total, -6000);
});

test('property: suggesting changes no line’s months, total or sign flip, on every layout', async () => {
  for (const L of LAYOUTS) {
    const f = await layoutFile(L, ExcelJS);
    const grids = L.kind === 'csv' ? [{ sheet: 'CSV', rows: csvRows(f).map((cells, i) => ({ r: i + 1, cells })).filter((x) => x.cells.some((v) => String(v).trim())) }] : (() => { const wb = new ExcelJS.Workbook(); return wb.xlsx.load(f).then(() => gridsOf(wb)); })();
    const g = await grids;
    const keys = statementOf(g, { file: L.file }).lines.map((l) => l.key);
    for (const cat of [null, 'vacancy', 'taxes', 'capex', 'otherIncome']) {
      const corrections = cat ? Object.fromEntries(keys.map((k) => [k, cat])) : {};
      const a = statementOf(g, { file: L.file, corrections });
      const b = statementOf(g, { file: L.file, corrections, suggest: false });
      assert.deepEqual(a.lines.map((l) => [l.months, l.total, !!l.signFlipped]), b.lines.map((l) => [l.months, l.total, !!l.signFlipped]), `${L.name} / ${cat}`);
    }
  }
});

/* 5. decision 3 */
test('a remembered label that agrees with the wording still files by the wording; one that disagrees is suggested', () => {
  const taxes = matchLabel('Real Estate Taxes', { corrections: { 'real estate taxes': 'taxes' } });
  assert.deepEqual([taxes.category, taxes.how], ['taxes', 'rule']);
  const supplies = matchLabel('Supplies', { corrections: { supplies: 'admin' } });
  assert.deepEqual([supplies.category, supplies.how, supplies.candidates, supplies.suggested.category], [null, 'suggested', ['admin', 'repairs'], 'admin']);
  assert.equal(matchLabel('Supplies', { corrections: { supplies: 'admin' }, suggest: false }).how, 'yours');
});

/* 6. no heading */
test('with no heading a capital line is asked about; under a Capital heading it files by its wording', () => {
  const none = matchLabel('Capital Improvements', { section: null });
  assert.deepEqual([none.category, none.how, none.suggested], [null, 'needs', { category: 'capex', from: 'wording' }]);
  const under = matchLabel('Capital Improvements', { section: 'below' });
  assert.deepEqual([under.category, under.how], ['capex', 'rule']);
  assert.equal(matchLabel('Capital Improvements', { section: 'expense' }).how, 'needs');
  assert.equal(matchLabel('Capital Improvements', { section: 'expense', suggest: false }).category, 'capex', 'the OM path keeps 4.7.33’s reading');
});

/* 7. by count, not by amount */
test('a suggested line worth $0 still holds the NOI comparison back (open 1, unassigned 0)', () => {
  const rows = [['Line', ...MONTHS_2026, 'Total'], ['Income'], ['Base Rent', ...Array(12).fill(50000), 600000], ['Pylon Sign Lease', ...Array(12).fill(0), 0], ['Expenses'], ['Real Estate Taxes', ...Array(12).fill(6000), 72000]]
    .map((cells, i) => ({ r: i + 1, cells }));
  const t = importStatement(rows, { file: 'x.csv', ...mem });
  const T = statementTotals(t);
  assert.equal(T.unassigned, 0);
  assert.equal(openLines(t).length, 1);
  assert.equal(t12ForAnalysis(t).open, 1);
  const texts = analyze(analysisInput({ figures: { noi: 100000 }, loan: {}, t12: t })).checks.filter((c) => /NOI|T-12/.test(c.text)).map((c) => c.text);
  assert.deepEqual(texts, ['Some T-12 lines are still to review (Review), so its NOI isn’t compared yet.']);
  fileLine(t, line(t, 'Pylon Sign Lease').id, 'otherIncome');
  const after = analyze(analysisInput({ figures: { noi: 100000 }, loan: {}, t12: t })).checks.filter((c) => /NOI|T-12/.test(c.text));
  assert.ok(after.length && !/still to review/.test(after[0].text), 'filed: compared');
});

/* 8. Confirm all */
test('Confirm all: three labels on four lines are each filed once, totals equal the old reading, nothing left open', () => {
  const D = ['Jan 2026', 'Feb 2026', 'Mar 2026'];
  const rows = [['Line', ...D, 'Total'], ['Income'], ['Base Rent', 1000, 1000, 1000, 3000], ['Pylon Sign Lease', 50, 50, 50, 150], ['Expenses'], ['Real Estate Taxes', 100, 100, 100, 300],
    ['Lawn Care', 10, 10, 10, 30], ['Dumpster Hauling', 20, 20, 20, 60], ['Lawn Care', 5, 5, 5, 15]].map((cells, i) => ({ r: i + 1, cells }));
  const corrections = { 'pylon sign lease': 'otherIncome', 'lawn care': 'contract', 'dumpster hauling': 'contract' };
  const t = importStatement(rows, { file: 'x.csv', corrections });
  assert.deepEqual(openLines(t).map((l) => l.label), ['Pylon Sign Lease', 'Lawn Care', 'Dumpster Hauling', 'Lawn Care']);
  const old = statementTotals(importStatement(rows, { file: 'x.csv', corrections, suggest: false }));
  const filed = confirmSuggested(t);
  assert.deepEqual(filed.map((x) => [x.label, x.category]), [['Pylon Sign Lease', 'otherIncome'], ['Lawn Care', 'contract'], ['Dumpster Hauling', 'contract']], 'three labels');
  assert.deepEqual(filed.flatMap((x) => x.lineIds).sort(), ['L4', 'L7', 'L8', 'L9'], 'four lines, each once');
  const T = statementTotals(t);
  assert.equal(T.unassigned, 0);
  assert.deepEqual(T.by, old.by);
  assert.deepEqual(confirmSuggested(t), [], 'nothing more to confirm');
});

test('Confirm all leaves out lines that need classification', () => {
  const t = importA();
  const filed = confirmSuggested(t);
  assert.deepEqual(filed.map((x) => x.label), ['Pylon Sign Lease']);
  assert.deepEqual(openLines(t).map((l) => l.label), ['Roof Replacement Capital']);
});

/* 9. backup merge */
const entriesOf = (here, there) => planRestore({ deals: [], kv: { 't12.labels': { entries: there } }, session: null, local: {} }, { deals: [], kv: { 't12.labels': { entries: here } }, session: null, local: {} }, 'merge');
test('a restore joins the deals a label was filed in, even from an older entry', () => {
  const here = { 'pylon sign lease': { category: 'otherIncome', at: 300, deals: [{ deal: 'd1', category: 'otherIncome', at: 300 }] } };
  const there = { 'pylon sign lease': { category: 'contract', at: 100, deals: [{ deal: 'd2', category: 'contract', at: 100 }, { deal: 'd1', category: 'otherIncome', at: 50 }] } };
  const p = entriesOf(here, there);
  assert.deepEqual(p.kv['t12.labels'].entries['pylon sign lease'], { category: 'otherIncome', at: 300, deals: [{ deal: 'd2', category: 'contract', at: 100 }, { deal: 'd1', category: 'otherIncome', at: 300 }] });
  assert.ok(p.summary.includes('T-12 labels you filed: 1 added or updated.'), p.summary.join(' | '));
  // joined again with nothing new: nothing written
  assert.ok(!('t12.labels' in entriesOf(p.kv['t12.labels'].entries, there).kv));
});
test('a restore keeps the newest 50 deals of a label', () => {
  const mk = (from) => Array.from({ length: 30 }, (_, i) => ({ deal: `d${from + i}`, category: 'contract', at: from + i }));
  const p = entriesOf({ x: { category: 'contract', at: 1, deals: mk(0) } }, { x: { category: 'contract', at: 1, deals: mk(100) } });
  const deals = p.kv['t12.labels'].entries.x.deals;
  assert.equal(deals.length, 50);
  assert.deepEqual([deals[0].at, deals[49].at], [10, 129], 'the oldest ten of the sixty are gone');
});
test('a restore copies deals field by field and ignores what is not a list of deals', () => {
  const there = JSON.parse('{"constructor":{"category":"rent","at":5,"deals":[{"deal":"__proto__","category":"rent","at":5,"x":1},{"deal":7,"category":"rent","at":6},null]},"__proto__":{"category":"rent","at":9},"y":{"category":"rent","at":4,"deals":"no"}}');
  const p = entriesOf({}, there);
  const e = p.kv['t12.labels'].entries;
  assert.deepEqual(e.constructor.deals, [{ deal: '__proto__', category: 'rent', at: 5 }]);
  assert.equal(Object.getPrototypeOf(e), Object.prototype);
  assert.equal(Object.getPrototypeOf(e.constructor.deals[0]), Object.prototype);
  assert.deepEqual(e.y, { category: 'rent', at: 4 });
  assert.equal({}.category, undefined);
});

/* 10. the OM statement path files by position, as 4.7.33 */
test('an OM statement with a capital line under Expenses keeps its NOI', () => {
  const pad = (label, v) => `  ${label.padEnd(34)}${String(v).padStart(14)}`;
  const page = ['Operating Statement', '', ' '.repeat(36) + 'T-12'.padStart(14), '',
    pad('Gross Potential Rent', '$1,020,000'), pad('Vacancy & Credit Loss', '($51,000)'), pad('Other Income', '$31,000'), pad('Effective Gross Income', '$1,000,000'), '',
    pad('Real Estate Taxes', '$110,000'), pad('Insurance', '$40,000'), pad('Repairs & Maintenance', '$90,000'), pad('Utilities', '$80,000'), pad('Roof Replacement Capital', '$25,000'),
    pad('Total Operating Expenses', '$320,000'), pad('Net Operating Income', '$680,000')].join('\n');
  const om = readOm([page], { asOf: '2026-10-14' });
  assert.deepEqual(om.statement.checks.filter((c) => c.level === 'fail'), [], 'the roof stays out of operating expenses, as in 4.7.33');
  assert.equal(om.fields.noi.value, 680000);
});

/* the new words */
test('suggestionText: the forms', () => {
  const s = (o) => suggestionText({ category: 'otherIncome', from: 'label', ...o });
  assert.equal(s({}), 'mapped this way before');
  assert.equal(s({ n: 1, m: 1, others: [] }), 'mapped this way in your last deal');
  assert.equal(s({ n: 2, m: 2, others: [] }), 'mapped this way twice');
  assert.equal(s({ n: 3, m: 3, others: [] }), 'mapped this way 3 times');
  assert.equal(s({ n: 2, m: 4, others: [{ category: 'contract', n: 2 }] }), 'mapped this way in 2 of your last 4 deals (twice to Contract services)');
  assert.equal(s({ n: 6, m: 7, others: [{ category: 'contract', n: 1 }] }), 'mapped this way in 6 of your last 7 deals (once to Contract services)');
});

/* old statements: a 4.7.33 backup */
const FIXTURE = new URL('./fixtures/backup-4.7.33-before-t12-suggestions.json', import.meta.url);
test('a 4.7.33 statement keeps every filing and every total, gets one Note, and is not re-read when another line is filed', () => {
  const b = readBackup(fs.readFileSync(FIXTURE, 'utf8'));
  const empty = { deals: [], kv: {}, session: null, local: {} };
  const t = planRestore(b, empty, 'merge').deals.put[0].t12;
  assert.deepStrictEqual(t, JSON.parse(fs.readFileSync(FIXTURE, 'utf8')).deals[0].t12, 'restored as it went in');
  // worked by hand in tests/t12-suggest-fixtures.js, from the 4.7.33 code
  const expected = { egi: 120600, opex: 12000, noi: 108600, below: 38500, unassigned: 0 };
  assert.deepEqual(pick(statementTotals(t)), expected);
  assert.deepEqual(statementChecks(t).map((c) => c.id), ['stated.noi']);
  assert.deepEqual(openLines(t), []);
  assert.deepEqual(earlierFilings(t).map((l) => l.label), ['Pylon Sign Lease', 'Roof Replacement Capital']);
  const [note] = statementNotes(t);
  assert.equal(note.id, 'note.earlier');
  assert.deepEqual(note.lineIds.length, 2);
  assert.match(note.text, /Pylon Sign Lease, Roof Replacement Capital/);
  assert.doesNotMatch(note.text, /Mortgage/);
  // filing another line: the labels are matched again, and these two stay where they were
  const re = rematch(structuredClone(t), { 'pylon sign lease': 'otherOpex', 'roof replacement capital': 'repairs' }, {});
  assert.deepEqual(pick(statementTotals(re)), expected);
  assert.deepEqual(re.lines.map((l) => [l.how, l.category]), t.lines.map((l) => [l.how, l.category]));
  // seen: the Note goes, the check ids never changed
  const seen = structuredClone(t);
  markSeen(seen, 'note.earlier');
  assert.deepEqual(statementNotes(seen), []);
  assert.deepEqual(statementChecks(seen).map((c) => c.id), ['stated.noi']);
  assert.equal(t12ForAnalysis(t).open, 0);
});

test('a statement read by PR 2 has no Note', () => {
  assert.deepEqual(statementNotes(importA()), []);
  assert.equal(statementNotes(importA({ read: { suggest: false } })).length, 1, 'suggest:false files like 4.7.33, so what it files is an earlier-style filing');
});

/* Regression guards for T-12 PR 1: these pass on 4.7.27 and on the new code.
 * A backup made by 4.7.27 (tests/fixtures/backup-4.7.27-before-t12-formats.json,
 * made by tests/tools/make-backup-4.7.27.mjs from the 4.7.27 code itself, all
 * invented) restores with its T-12 untouched, a blank cell it read as 0 stays
 * a confirmed $0, and 12,500 in a comma file stays US. Only functions that
 * exist in both versions are used. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readBackup, planRestore } from '../app/backup.js';
import { pending } from '../app/migrate.js';
import { statementTotals, statementChecks, openChecks, openLines, t12ForAnalysis, importStatement, amountOf } from '../app/t12.js';
import { csvRows } from '../app/sheetread.js';

const FIXTURE = new URL('./fixtures/backup-4.7.27-before-t12-formats.json', import.meta.url);
const raw = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const empty = { deals: [], kv: {}, session: null, local: {} };

/* Worked by hand from the fixture's CSV (six months, Jan to Jun 2026):
 *   Base Rent 10,000 x 6 = 60,000                          income, rent
 *   CAM Reimbursements 1,500 x 5 (March is BLANK, read as 0) = 7,500     recoveries
 *   EGI = 67,500
 *   Real Estate Taxes 3,000 x 6 = 18,000                   taxes
 *   Pylon Sign Lease 200 x 6 = 1,200  (filed by hand as other operating)
 *   Repairs 400 x 5 (April is a printed dash = confirmed 0) = 2,000
 *   Operating expenses = 18,000 + 1,200 + 2,000 = 21,200
 *   NOI = 67,500 - 21,200 = 46,300, for 6 months (not scaled)
 *   Checks: only "months" (a partial year), and it was marked seen. */
test('a 4.7.27 backup restores with its T-12 exactly as it was, and means the same', () => {
  const b = readBackup(fs.readFileSync(FIXTURE, 'utf8'));
  const plan = planRestore(b, empty, 'merge');
  const t = plan.deals.put[0].t12;
  assert.deepStrictEqual(t, raw.deals[0].t12, 'every field of the statement comes back as it went in');
  assert.deepStrictEqual(pending(plan.deals.put[0]).map((x) => x.id), ['fee-record', 'credit-record', 'dd-init', 'abstracts-init'], 'only the fee-record and credit-record markers are waiting: no step touches the statement');
  assert.ok(!('v' in t) && !('source' in t) && !('period' in t), 'nothing is added to it');
  assert.ok(t.lines.every((l) => !('blank' in l) && !('src' in l) && !('conf' in l)), 'no line is re-read');
  const T = statementTotals(t);
  assert.deepStrictEqual([T.egi, T.opex, T.taxes, T.noi, T.months, T.unassigned], [67500, 21200, 18000, 46300, 6, 0]);
  const { open, held, cats, by, ...forAnalysis } = t12ForAnalysis(t); // `cats` and `by` (red flags) are new; `open` (lines waiting) and `held` (period checks holding the totals, PR 3a) are new: 0 here
  assert.ok(open === undefined || open === 0);
  assert.ok(cats && by, 'the red flags read what the lines are filed under; they change no figure');
  assert.equal(held, 0, 'a 4.7.27 statement has no period problem');
  assert.deepStrictEqual(forAnalysis, { noi: 46300, egi: 67500, opex: 21200, taxes: 18000, months: 6, from: '2026-01', to: '2026-06', unassigned: 0 });
  assert.deepStrictEqual(statementChecks(t).map((c) => c.id), ['months'], 'the same checks, and no blanks check');
  assert.deepStrictEqual(openChecks(t), [], 'the seen mark still holds');
  assert.deepStrictEqual(openLines(t), []);
  const cam = t.lines.find((l) => l.label === 'CAM Reimbursements');
  assert.deepStrictEqual(cam.months, [1500, 1500, 0, 1500, 1500, 1500], 'the old zero stays a confirmed $0');
  assert.equal(t.lines.find((l) => l.label === 'Pylon Sign Lease').how, 'you', 'the line filed by hand stays filed');
  assert.deepStrictEqual(t.applied, { at: 1792203290000, before: { noi: null, gross: null, opex: null, taxes: null }, rrOpex: false, annualized: 6 });
  assert.deepStrictEqual(plan.kv['t12.labels'], { entries: { 'pylon sign lease': { category: 'otherOpex', at: 1792203285000 } } });
});

test('12,500 in a comma-delimited file stays US with no question: $12,500, as today', () => {
  const rows = csvRows('Account,Jan 2026,Feb 2026,Mar 2026,Total\nBase Rent,"12,500","12,500","12,500","37,500"\n').map((cells, i) => ({ r: i + 1, cells }));
  const st = importStatement(rows, { file: 'x.csv' });
  assert.deepStrictEqual(st.lines[0].months, [12500, 12500, 12500]);
  assert.equal(amountOf('12,500'), 12500);
  assert.equal(amountOf('1.234,56'), 1.23456, 'the US reading of a string is unchanged: the new formats are asked for by name');
});

test('the rent roll’s CSV reading is unchanged: commas only, as before', () => {
  assert.deepStrictEqual(csvRows('Suite;Tenant,SF\n101;Acme,1500\n'), [['Suite;Tenant', 'SF'], ['101;Acme', '1500']]);
  assert.deepStrictEqual(csvRows('a,"b ""q"", c",d\r\n1,2,3'), [['a', 'b "q", c', 'd'], ['1', '2', '3']]);
});

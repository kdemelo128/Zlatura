/* Make tests/fixtures/backup-4.7.35-before-t12-values.json with the real
 * 4.7.35 code, taken from git (dccbcd9): three invented T-12 statements read
 * by that version, which had no value checks and read quarter-end dates as months.
 *   A  Jan to Dec 2026 with a spike, a refund, a one-off month (t12-values-fixtures.js valueRows);
 *   B  four columns headed by quarter-end dates (quarterEndRows);
 *   C  a statement from before 4.7.28 (no `v`, `period` or `source`), six months,
 *      with its "only 6 months" check marked seen.
 * Every name and figure is made up.
 *
 *   node tests/tools/make-backup-4.7.35.mjs [out.json]
 *
 * Needs nothing but git and node. Run once; the file is kept. */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import { valueRows, quarterEndRows } from '../fixtures/t12-values-fixtures.js';
import { plainRows } from '../fixtures/t12-period-fixtures.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = process.argv[2] || `${ROOT}tests/fixtures/backup-4.7.35-before-t12-values.json`;
const tmp = fs.mkdtempSync(`${os.tmpdir()}/old-4735-`);
execFileSync('sh', ['-c', `git -C "${ROOT}" archive dccbcd9 | tar -x -C "${tmp}"`]);
const { importStatement, statementTotals, statementChecks } = await import(`${tmp}/app/t12.js`);
const { buildBackup } = await import(`${tmp}/app/backup.js`);

const read = (rows, file) => importStatement(rows, { file, sheet: 'CSV', now: 1792203278924 });
const A = read(valueRows(), 'invented-values.csv');
const B = read(quarterEndRows(), 'invented-quarter-ends.csv');
const C = read(plainRows(), 'invented-plain.csv');
for (const k of ['v', 'period', 'source']) delete C[k]; // as read before 4.7.28
C.seen = { months: true };

const deal = (id, name, t) => {
  const T = statementTotals(t);
  return {
    id, name, createdAt: 1792203277340, updatedAt: 1792203290000, source: null, readAt: null, pages: 0,
    figures: { address: name, gross: T.egi, opex: T.opex, taxes: T.taxes, noi: T.noi },
    sources: {}, rentRoll: [], unpriced: false, loan: { ltv: 65, rate: 6.75, amort: 30, io: false, closing: 2, minDscr: 1.25, minDy: 8 },
    qDone: {}, myQuestions: [], live: {}, scenarios: [], targets: { cap: null, irr: 15, value: null },
    visit: { at: null, items: {}, notes: '', photos: [], audio: [] }, moneyVersion: 1, schema: 4, t12: t,
  };
};
const deals = [deal('d4735values', 'Invented Values (fictional)', A), deal('d4735qends', 'Invented Quarter Ends (fictional)', B), deal('d4735plain', 'Invented Plain (fictional)', C)];
const b = await buildBackup({ deals, kv: {}, appVersion: '4.7.35' });
fs.writeFileSync(OUT, `${JSON.stringify(b, null, 1)}\n`);
fs.rmSync(tmp, { recursive: true, force: true });
for (const d of deals) { const T = statementTotals(d.t12); console.log(`${d.id}: months ${d.t12.months.length}; egi ${T.egi} opex ${T.opex} noi ${T.noi}; checks ${statementChecks(d.t12).map((c) => c.id)}`); }

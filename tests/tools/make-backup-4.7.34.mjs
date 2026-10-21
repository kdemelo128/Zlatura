/* Make tests/fixtures/backup-4.7.34-before-t12-periods.json with the real
 * 4.7.34 code, taken from git (1b4e3a5): three invented T-12 statements read
 * by that version, which counted every column and knew nothing of periods.
 *   A  a statement from before 4.7.28 (no `v`, `period` or `source`), six
 *      months, with its "only 6 months" check marked seen;
 *   B  a version 2 statement with a second "Dec 2025" column (both counted);
 *   C  a version 2 statement of 15 months, read as a year.
 * Every name and figure is made up (tests/fixtures/t12-period-fixtures.js
 * works them by hand).
 *
 *   node tests/tools/make-backup-4.7.34.mjs [out.json]
 *
 * Needs nothing but git and node. Run once; the file is kept. */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import { dupRows, fifteenRows, plainRows } from '../fixtures/t12-period-fixtures.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = process.argv[2] || `${ROOT}tests/fixtures/backup-4.7.34-before-t12-periods.json`;
const tmp = fs.mkdtempSync(`${os.tmpdir()}/old-4734-`);
execFileSync('sh', ['-c', `git -C "${ROOT}" archive 1b4e3a5 | tar -x -C "${tmp}"`]);
const { importStatement, statementTotals, statementChecks } = await import(`${tmp}/app/t12.js`);
const { buildBackup } = await import(`${tmp}/app/backup.js`);

const read = (rows, file) => importStatement(rows, { file, sheet: 'CSV', now: 1792203278924 });
const A = read(plainRows(), 'invented-plain.csv');
for (const k of ['v', 'period', 'source']) delete A[k]; // as read before 4.7.28
A.seen = { months: true };
const B = read(dupRows(), 'invented-dup.csv');
const C = read(fifteenRows(), 'invented-fifteen.csv');

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
const deals = [deal('d4734plain', 'Invented Plain (fictional)', A), deal('d4734dup', 'Invented Dup (fictional)', B), deal('d4734long', 'Invented Fifteen (fictional)', C)];
const b = await buildBackup({ deals, kv: {}, appVersion: '4.7.34' });
fs.writeFileSync(OUT, `${JSON.stringify(b, null, 1)}\n`);
fs.rmSync(tmp, { recursive: true, force: true });
for (const d of deals) { const T = statementTotals(d.t12); console.log(`${d.id}: months ${d.t12.months.length}; egi ${T.egi} opex ${T.opex} noi ${T.noi}; checks ${statementChecks(d.t12).map((c) => c.id)}`); }

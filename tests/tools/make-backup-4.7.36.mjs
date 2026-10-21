/* Make tests/fixtures/backup-4.7.36-before-underwriting.json with the real
 * 4.7.36 code, taken from git (f6a17cd): three invented T-12 statements read
 * by that version, which had a months-with-activity answer (`window`) and
 * "Recurring?" answers (`oneoff`) but no per-line `method`.
 *   U  Jan to Dec 2026, seven months with activity, N = 7 chosen, Repairs September marked "No"
 *      (t12-normalise-fixtures.js uRows);
 *   V  Jan to Dec 2026 with a spike, a refund and a one-off month, Building repairs May marked "No" (valueRows);
 *   P  six plain months (plainRows).
 * Every name and figure is made up.
 *
 *   node tests/tools/make-backup-4.7.36.mjs [out.json]
 *
 * Needs nothing but git and node. Run once; the file is kept. */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import { uRows } from '../fixtures/t12-normalise-fixtures.js';
import { valueRows } from '../fixtures/t12-values-fixtures.js';
import { plainRows } from '../fixtures/t12-period-fixtures.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = process.argv[2] || `${ROOT}tests/fixtures/backup-4.7.36-before-underwriting.json`;
const tmp = fs.mkdtempSync(`${os.tmpdir()}/old-4736-`);
execFileSync('sh', ['-c', `git -C "${ROOT}" archive f6a17cd | tar -x -C "${tmp}"`]);
const { importStatement, statementTotals, t12Qc, setWindow, applyT12Fix, noiWithout, runRate } = await import(`${tmp}/app/t12.js`);
const { buildBackup } = await import(`${tmp}/app/backup.js`);

const read = (rows, file) => importStatement(rows, { file, sheet: 'CSV', now: 1792203278924 });
const U = read(uRows(), 'invented-uptown.csv');
setWindow(U, 'active');
applyT12Fix(U, `oneoff.${U.lines.find((l) => l.label === 'Repairs').id}.2026-09`, 'rec:no');
const V = read(valueRows(), 'invented-values.csv');
applyT12Fix(V, `oneoff.${V.lines.find((l) => l.label === 'Building repairs').id}.2026-05`, 'rec:no');
const P = read(plainRows(), 'invented-plain.csv');

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
const deals = [deal('d4736uptown', 'Invented Uptown (fictional)', U), deal('d4736values', 'Invented Values (fictional)', V), deal('d4736plain', 'Invented Plain (fictional)', P)];
const b = await buildBackup({ deals, kv: {}, appVersion: '4.7.36' });
fs.writeFileSync(OUT, `${JSON.stringify(b, null, 1)}\n`);
fs.rmSync(tmp, { recursive: true, force: true });
for (const d of deals) { const T = statementTotals(d.t12); console.log(`${d.id}: months ${d.t12.months.length}; egi ${T.egi} opex ${T.opex} noi ${T.noi}; without ${noiWithout(d.t12) && noiWithout(d.t12).noi}; runRate ${runRate(d.t12) && runRate(d.t12).noi}; checks ${t12Qc(d.t12).checks.map((c) => c.id)}`); }

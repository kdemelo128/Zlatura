/* Make tests/fixtures/backup-4.7.27-before-t12-formats.json with the real
 * 4.7.27 code, taken from git (c300a09): an invented CSV T-12 read by that
 * version (one blank cell, which it read as 0), a line filed by hand, a check
 * marked seen, "Use the T-12's figures" applied, and one remembered label.
 * Every name and figure is made up.
 *
 *   node tests/tools/make-backup-4.7.27.mjs [out.json]
 *
 * Needs nothing but git and node. Run once; the file is kept. */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = process.argv[2] || `${ROOT}tests/fixtures/backup-4.7.27-before-t12-formats.json`;
const tmp = fs.mkdtempSync(`${os.tmpdir()}/old-4727-`);
execFileSync('sh', ['-c', `git -C "${ROOT}" archive c300a09 | tar -x -C "${tmp}"`]);
const { csvRows } = await import(`${tmp}/app/sheetread.js`);
const { importStatement, fileLine, markSeen, statementTotals } = await import(`${tmp}/app/t12.js`);
const { buildBackup } = await import(`${tmp}/app/backup.js`);

const csv = [
  'Invented Plaza Holdings,,,,,,,',
  'Account,Jan 2026,Feb 2026,Mar 2026,Apr 2026,May 2026,Jun 2026,Total',
  'INCOME,,,,,,,',
  'Base Rent,"10,000","10,000","10,000","10,000","10,000","10,000","60,000"',
  'CAM Reimbursements,"1,500","1,500",,"1,500","1,500","1,500","7,500"',
  'OPERATING EXPENSES,,,,,,,',
  'Real Estate Taxes,"3,000","3,000","3,000","3,000","3,000","3,000","18,000"',
  'Pylon Sign Lease,200,200,200,200,200,200,"1,200"',
  'Repairs,400,400,400,-,400,400,"2,000"',
].join('\n');
const rows = csvRows(csv).map((cells, i) => ({ r: i + 1, cells })).filter((x) => x.cells.some((v) => String(v).trim()));
const t = importStatement(rows, { file: 'invented-plaza.csv', sheet: 'CSV', now: 1792203278924 });
fileLine(t, t.lines.find((l) => l.label === 'Pylon Sign Lease').id, 'otherOpex'); // filed by hand
markSeen(t, 'months'); // the partial-year check, marked seen
const T = statementTotals(t);
t.applied = { at: 1792203290000, before: { noi: null, gross: null, opex: null, taxes: null }, rrOpex: false, annualized: 6 };
const deal = {
  id: 'd4727plaza', name: 'Invented Plaza (fictional)', createdAt: 1792203277340, updatedAt: 1792203290000, source: null, readAt: null, pages: 0,
  figures: { address: '1 Invented Plaza (fictional)', gross: T.egi * 2, opex: T.opex * 2, taxes: T.taxes * 2, noi: T.noi * 2 },
  sources: {}, rentRoll: [], unpriced: false, loan: { ltv: 65, rate: 6.75, amort: 30, io: false, closing: 2, minDscr: 1.25, minDy: 8 },
  qDone: {}, myQuestions: [], live: {}, scenarios: [], targets: { cap: null, irr: 15, value: null },
  visit: { at: null, items: {}, notes: '', photos: [], audio: [] }, moneyVersion: 1, schema: 4, t12: t,
  rr: {
    settings: {
      asOf: '2026-10-17', years: 10, marketRent: null, marketUnit: 'psf_year', marketGrowth: 3, opex: null, expenseGrowth: 3, recoverable: null, generalVacancy: 0, reservesPsf: 0, otherIncome: [], leaseUpMonths: 6, buildingSf: null,
      renewal: { assume: true, probability: 65, termMonths: 60, downtime: 6, renewFree: 0, newFree: 3, renewTi: 0, newTi: 0, renewLc: 0, newLc: 0, escalation: 3 },
    },
    leases: [],
  },
};
const b = await buildBackup({ deals: [deal], kv: { 't12.labels': { entries: { 'pylon sign lease': { category: 'otherOpex', at: 1792203285000 } } } }, appVersion: '4.7.27' });
fs.writeFileSync(OUT, `${JSON.stringify(b, null, 1)}\n`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${OUT}: ${t.lines.length} lines, months ${t.months.length}, NOI ${T.noi}, hand-filed ${t.lines.filter((l) => l.how === 'you').length}`);

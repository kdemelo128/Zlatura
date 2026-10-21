/* Make tests/fixtures/backup-4.7.33-before-t12-suggestions.json with the real
 * 4.7.33 code, taken from git (4d725f3): an invented 12-month CSV T-12 read by
 * that version with one remembered label. 4.7.33 filed "Pylon Sign Lease" from
 * the remembered label with no question (how 'yours'), filed "Roof Replacement
 * Capital" under Expenses out of NOI by its wording (how 'rule', capex), and
 * "Mortgage Interest" after the file's NOI by its heading. Every name and
 * figure is made up.
 *
 *   node tests/tools/make-backup-4.7.33.mjs [out.json]
 *
 * Needs nothing but git and node. Run once; the file is kept. */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = process.argv[2] || `${ROOT}tests/fixtures/backup-4.7.33-before-t12-suggestions.json`;
const tmp = fs.mkdtempSync(`${os.tmpdir()}/old-4733-`);
execFileSync('sh', ['-c', `git -C "${ROOT}" archive 4d725f3 | tar -x -C "${tmp}"`]);
const { csvRows } = await import(`${tmp}/app/sheetread.js`);
const { importStatement, statementTotals, statementChecks } = await import(`${tmp}/app/t12.js`);
const { buildBackup } = await import(`${tmp}/app/backup.js`);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m) => `${m} 2026`);
const line = (label, each, total, only) => [label, ...MONTHS.map((_, i) => (only === undefined ? each : i === only ? each : 0)), total].join(',');
const csv = [
  ['Invented Arcade Holdings', ...MONTHS.map(() => ''), ''].join(','),
  ['Account', ...MONTHS, 'Total'].join(','),
  'INCOME',
  line('Base Rent', 10000, 120000),
  line('Pylon Sign Lease', 50, 600),
  'OPERATING EXPENSES',
  line('Real Estate Taxes', 1000, 12000),
  line('Roof Replacement Capital', 2500, 2500, 2),
  ['NET OPERATING INCOME', ...MONTHS.map(() => ''), 106100].join(','),
  line('Mortgage Interest', 3000, 36000),
].join('\n');
const rows = csvRows(csv).map((cells, i) => ({ r: i + 1, cells })).filter((x) => x.cells.some((v) => String(v).trim()));
const t = importStatement(rows, { file: 'invented-arcade.csv', sheet: 'CSV', now: 1792203278924, corrections: { 'pylon sign lease': 'otherIncome' } });
const T = statementTotals(t);
const deal = {
  id: 'd4733arcade', name: 'Invented Arcade (fictional)', createdAt: 1792203277340, updatedAt: 1792203290000, source: null, readAt: null, pages: 0,
  figures: { address: '1 Invented Arcade (fictional)', gross: T.egi, opex: T.opex, taxes: T.taxes, noi: T.noi },
  sources: {}, rentRoll: [], unpriced: false, loan: { ltv: 65, rate: 6.75, amort: 30, io: false, closing: 2, minDscr: 1.25, minDy: 8 },
  qDone: {}, myQuestions: [], live: {}, scenarios: [], targets: { cap: null, irr: 15, value: null },
  visit: { at: null, items: {}, notes: '', photos: [], audio: [] }, moneyVersion: 1, schema: 4, t12: t,
};
const b = await buildBackup({ deals: [deal], kv: { 't12.labels': { entries: { 'pylon sign lease': { category: 'otherIncome', at: 1792203285000 } } } }, appVersion: '4.7.33' });
fs.writeFileSync(OUT, `${JSON.stringify(b, null, 1)}\n`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${OUT}: ${t.lines.length} lines; totals ${JSON.stringify({ egi: T.egi, opex: T.opex, below: T.below, noi: T.noi, unassigned: T.unassigned })}; checks ${statementChecks(t).map((c) => c.id)}; how ${t.lines.map((l) => `${l.label}=${l.how}/${l.category}`).join(', ')}`);

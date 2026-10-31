/* Make tests/fixtures/backup-4.7.73-before-dd.json with the real 4.7.73
 * backup code, taken from git (8207a97), from hand-built deals: two invented deals saved at schema 6, one with
 * a rent roll of two leases, a saved scenario and a fee record, one with an empty rent roll. The first also has a tenant credit record (schema 6)
 * and a figure read from an OM page, so the test can show the step touches neither.
 * 4.7.79 adds schema step 7 ("dd-init") for deal.dd; the step must leave
 * these deals exactly as saved, apart from the version field and the empty list. Every name and
 * figure is made up.
 *
 *   node tests/tools/make-backup-4.7.73.mjs
 *
 * Needs nothing but git and node. Run once; the file is kept. */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = `${ROOT}tests/fixtures/backup-4.7.73-before-dd.json`;
const tmp = fs.mkdtempSync(`${os.tmpdir()}/old-4773-`);
execFileSync('sh', ['-c', `git -C "${ROOT}" archive 8207a97 | tar -x -C "${tmp}"`]);
const { buildBackup } = await import(`${tmp}/app/backup.js`);
const { emptyRentRoll } = await import(`${tmp}/app/rentroll.js`);
const { fromOmRows } = await import(`${tmp}/app/lease.js`);

const base = (id, name, updatedAt, figures) => ({
  id, name, createdAt: 1792203277340, updatedAt, source: null, readAt: null, pages: 0, figures, sources: {}, rentRoll: [], unpriced: false,
  loan: { ltv: 65, rate: 6.75, amort: 30, io: false, closing: 2, minDscr: 1.25, minDy: 8 }, qDone: {}, myQuestions: [], live: {}, scenarios: [],
  targets: { cap: null, irr: 15, value: null }, visit: { at: null, items: {}, notes: '', photos: [], audio: [] }, moneyVersion: 1, schema: 6,
});
const a = base('d4773a', 'Invented Plaza (fictional)', 1792203290000, { address: '100 Example Way', city: 'Sampleton', state: 'ZZ', price: 6450000, noi: 387000, bsf: 24000 });
a.stage = 'marketing';
a.rr = { ...emptyRentRoll('Retail', '2026-10-01', 24000), leases: fromOmRows([
  { suite: '101', tenant: 'Example Cafe LLC', sf: 1500, start: '2024-01-01', end: '2029-12-31', annual: 45000 },
  { suite: '102', tenant: '', sf: 800, vacant: true },
], { asOf: '2026-10-01', page: 3 }).leases };
a.fee = { price: 6450000, flatPct: 2.5, tiers: [], coBrokerPct: null, referralPct: null, housePct: null, invoiced: null, paid: [] };
a.credit = { v: 1, leaseEntity: 'Example Cafe LLC', leaseId: null, parent: '', guarantor: { name: 'Example Holdings', scope: 'full', limit: '', endsOn: null }, ratings: [], sales: null, goDark: { state: null, note: '' } };
a.sources = { price: { page: 2, line: 'Asking price $6,450,000', confidence: 0.9, alts: [], count: 1, orig: 6450000 } };
a.live = { price: 6200000, ltv: 60 };
a.scenarios = [{ id: 's1', name: 'Lower price', at: 1792203295000, over: { price: 6000000 } }];
const b = base('d4773b', 'Invented Court (fictional)', 1792203291000, { address: '7 Sample Court', price: 2400000, noi: 144000 });
b.rr = emptyRentRoll('Office', '2026-10-01');

const backup = await buildBackup({
  deals: [a, b],
  kv: { 'crm.stages': { d4773a: 'Marketing' }, 'crm.tasks': [{ id: 't1', text: 'Call the owner', done: false }] },
  appVersion: '4.7.73',
});
fs.writeFileSync(OUT, `${JSON.stringify(backup, null, 1)}\n`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('wrote the 4.7.73 backup');

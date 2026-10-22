/* Make tests/fixtures/backup-4.7.50-before-research.json with the real 4.7.50
 * code, taken from git (c57ff27): two invented deals, three contacts, two tasks
 * and an activity entry, with no research briefs. Also writes
 * tests/fixtures/restore-plans-c57ff27.json: what that version's planRestore gave
 * for this backup and for backup-4.7.36-before-underwriting.json, on two devices
 * in merge and replace mode (empty, and one holding newer copies), so a later version can be held to
 * the same plan. Every name and figure is made up.
 *
 *   node tests/tools/make-backup-4.7.50.mjs
 *
 * Needs nothing but git and node. Run once; the files are kept. */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';

const ROOT = new URL('../../', import.meta.url).pathname;
const tmp = fs.mkdtempSync(`${os.tmpdir()}/old-4750-`);
execFileSync('sh', ['-c', `git -C "${ROOT}" archive c57ff27 | tar -x -C "${tmp}"`]);
const { buildBackup, readBackup, planRestore } = await import(`${tmp}/app/backup.js`);

const deal = (id, name, updatedAt) => ({
  id, name, createdAt: 1792203277340, updatedAt, source: null, readAt: null, pages: 0,
  figures: { address: name, price: 2400000, noi: 144000 }, sources: {}, rentRoll: [], unpriced: false,
  loan: { ltv: 65, rate: 6.75, amort: 30, io: false, closing: 2, minDscr: 1.25, minDy: 8 }, qDone: {}, myQuestions: [], live: {}, scenarios: [],
  targets: { cap: null, irr: 15, value: null }, visit: { at: null, items: {}, notes: '', photos: [], audio: [] }, moneyVersion: 1, schema: 4,
});
const contacts = [
  { id: 'c1', name: 'Jane Example', company: 'Example Holdings LLC', updatedAt: 1792203280000 },
  { id: 'c2', name: 'Sam Sample', company: 'Sample Partners', updatedAt: 1792203280000 },
  { id: 'c3', name: 'Pat Invented', company: '', updatedAt: 1792203280000 },
];
const b = await buildBackup({
  deals: [deal('d4750a', 'Invented Plaza (fictional)', 1792203290000), deal('d4750b', 'Invented Court (fictional)', 1792203291000)],
  kv: {
    'crm.contacts': contacts, 'crm.tasks': [{ id: 't1', text: 'Call Jane Example', done: false }, { id: 't2', text: 'Send comps', done: true }],
    'crm.activity': [{ id: 'a1', at: 1792203285000, text: 'Spoke with Sam Sample' }], 'crm.stages': { d4750a: 'Underwriting' },
  },
  appVersion: '4.7.50',
});
if (!fs.existsSync(`${ROOT}tests/fixtures/backup-4.7.50-before-research.json`)) fs.writeFileSync(`${ROOT}tests/fixtures/backup-4.7.50-before-research.json`, `${JSON.stringify(b, null, 1)}\n`);

const devices = {
  empty: { deals: [], kv: {}, session: null, local: {} },
  newer: { deals: [deal('d4750a', 'Invented Plaza (fictional) edited here', 1792203999000)], kv: { 'crm.contacts': [{ id: 'c1', name: 'Jane Example', company: 'Example Holdings LLC', updatedAt: 1792203999000 }, { id: 'c9', name: 'Dana Local', company: 'Local Co', updatedAt: 1 }] }, session: null, local: {} },
};
const plans = {};
for (const f of ['backup-4.7.50-before-research.json', 'backup-4.7.36-before-underwriting.json']) {
  plans[f] = {};
  for (const [dn, dev] of Object.entries(devices)) {
    const bk = () => readBackup(fs.readFileSync(`${ROOT}tests/fixtures/${f}`, 'utf8'));
    const p = planRestore(bk(), structuredClone(dev), 'merge');
    const r = planRestore(bk(), structuredClone(dev), 'replace');
    plans[f][dn] = { put: p.deals.put, kv: p.kv, local: p.local, replace: { put: r.deals.put, kv: r.kv, removeDeals: r.removeDeals, removeKv: r.removeKv, local: r.local, session: r.session } };
  }
}
fs.writeFileSync(`${ROOT}tests/fixtures/restore-plans-c57ff27.json`, `${JSON.stringify({ devices, plans }, null, 1)}\n`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('wrote the 4.7.50 backup and the c57ff27 plans');

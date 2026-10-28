/* Make tests/fixtures/backup-4.7.56-before-uw-workspace.json with the real 4.7.56
 * code, taken from git (2ac22a1): two invented deals, two contacts, a task, an
 * activity entry and one research brief, with no quick underwritings. Also writes
 * tests/fixtures/restore-plans-2ac22a1.json: a fingerprint of what that version's
 * planRestore gave for EVERY backup-*.json fixture, on two devices in merge and
 * replace mode (empty, and one holding newer copies), so a later version can be held
 * to the same plan. Every name and figure is made up.
 *
 *   node tests/tools/make-backup-4.7.56.mjs
 *
 * Needs nothing but git and node. Run once; the files are kept. */
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';

const ROOT = new URL('../../', import.meta.url).pathname;
const FIX = `${ROOT}tests/fixtures/`;
const tmp = fs.mkdtempSync(`${os.tmpdir()}/old-4756-`);
execFileSync('sh', ['-c', `git -C "${ROOT}" archive 2ac22a1 | tar -x -C "${tmp}"`]);
const { buildBackup, readBackup, planRestore } = await import(`${tmp}/app/backup.js`);

const NOW = 1_800_000_000_000;
const deal = (id, name, updatedAt) => ({
  id, name, createdAt: 1792203277340, updatedAt, source: null, readAt: null, pages: 0,
  figures: { address: name, price: 1850000, noi: 120250 }, sources: {}, rentRoll: [], unpriced: false,
  loan: { ltv: 65, rate: 6.75, amort: 30, io: false, closing: 2, minDscr: 1.25, minDy: 8 }, qDone: {}, myQuestions: [], live: {}, scenarios: [],
  targets: { cap: null, irr: 15, value: null }, visit: { at: null, items: {}, notes: '', photos: [], audio: [] }, moneyVersion: 1, schema: 4,
});
const brief = { id: 'rb4756a', v: 1, subject: { name: 'Invented Holdings LLC', state: null }, status: 'ready', createdAt: NOW - 86400000, updatedAt: NOW - 86400000, retainUntil: NOW + 300 * 86400000, claims: [] };
const b = await buildBackup({
  deals: [deal('d4756a', 'Invented Mews (fictional)', 1792203290000), deal('d4756b', 'Invented Yard (fictional)', 1792203291000)],
  kv: {
    'crm.contacts': [{ id: 'c1', name: 'Jane Example', company: 'Example Holdings LLC', updatedAt: 1792203280000 }, { id: 'c2', name: 'Sam Sample', company: 'Sample Partners', updatedAt: 1792203280000 }],
    'crm.tasks': [{ id: 't1', text: 'Call Jane Example', done: false }], 'crm.activity': [{ id: 'a1', at: 1792203285000, text: 'Spoke with Sam Sample' }],
    'crm.stages': { d4756a: 'Underwriting' }, 'research.briefs': [brief],
  },
  appVersion: '4.7.56',
});
const NAME = 'backup-4.7.56-before-uw-workspace.json';
if (!fs.existsSync(FIX + NAME)) fs.writeFileSync(FIX + NAME, `${JSON.stringify(b, null, 1)}\n`);

const devices = {
  empty: { deals: [], kv: {}, session: null, local: {} },
  newer: { deals: [deal('d4756a', 'Invented Mews (fictional) edited here', 1792203999000)], kv: { 'crm.contacts': [{ id: 'c1', name: 'Jane Example', company: 'Example Holdings LLC', updatedAt: 1792203999000 }, { id: 'c9', name: 'Dana Local', company: 'Local Co', updatedAt: 1 }] }, session: null, local: {} },
};
/** Keys in a fixed order, so the same plan always gives the same text. */
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const fingerprint = (p) => crypto.createHash('sha256').update(JSON.stringify(canon(JSON.parse(JSON.stringify({ put: p.deals.put, kv: p.kv, local: p.local, removeDeals: p.removeDeals, removeKv: p.removeKv, session: p.session, summary: p.summary }))))).digest('hex');
const plans = {};
for (const f of fs.readdirSync(FIX).filter((x) => /^backup-.*\.json$/.test(x)).sort()) {
  plans[f] = {};
  for (const [dn, dev] of Object.entries(devices)) {
    const bk = () => readBackup(fs.readFileSync(FIX + f, 'utf8'));
    plans[f][dn] = {
      merge: fingerprint(planRestore(bk(), structuredClone(dev), 'merge', NOW)),
      replace: fingerprint(planRestore(bk(), structuredClone(dev), 'replace', NOW)),
    };
  }
}
fs.writeFileSync(`${FIX}restore-plans-2ac22a1.json`, `${JSON.stringify({ now: NOW, devices, plans }, null, 1)}\n`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`wrote the 4.7.56 backup and the 2ac22a1 plan fingerprints for ${Object.keys(plans).length} fixtures`);

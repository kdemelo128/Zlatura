/* Make tests/fixtures/backup-4.7.97-before-read.json with the real 4.7.97 code, taken from git (acf406c): one invented
 * deal saved at schema 8 holding a lease abstract the broker typed (a tenant, a deposit of none with its page, a dated
 * commencement, a relative expiration, a term with two rent steps, one value ticked), and one deal with no abstract
 * yet. 4.7.98 adds schema step 9 ("abstracts-read"): it must leave these deals exactly as saved apart from the
 * schema number, and an older app (schema 8) must refuse a backup written after it. Every name and figure is made up.
 *
 *   node tests/tools/make-backup-4.7.97.mjs
 *
 * Needs nothing but git and node. Run once; the file is kept. */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';

globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = `${ROOT}tests/fixtures/backup-4.7.97-before-read.json`;
const tmp = fs.mkdtempSync(`${os.tmpdir()}/old-4797-`);
execFileSync('sh', ['-c', `git -C "${ROOT}" archive acf406c | tar -x -C "${tmp}"`]);
const { buildBackup } = await import(`${tmp}/app/backup.js`);
const A = await import(`${tmp}/app/abstracts.js`);
const { emptyRentRoll } = await import(`${tmp}/app/rentroll.js`);
const NOW = '2026-11-01T10:00:00.000Z';

const base = (id, name, updatedAt, figures) => ({
  id, name, createdAt: 1792203277340, updatedAt, source: null, readAt: null, pages: 0, figures, sources: {}, rentRoll: [], unpriced: false,
  loan: { ltv: 65, rate: 6.75, amort: 30, io: false, closing: 2, minDscr: 1.25, minDy: 8 }, qDone: {}, myQuestions: [], live: {}, scenarios: [],
  targets: { cap: null, irr: 15, value: null }, visit: { at: null, items: {}, notes: '', photos: [], audio: [] }, moneyVersion: 1, schema: 8,
});
const a = base('d4797a', 'Invented Plaza (fictional)', 1792203290000, { address: '100 Example Way', city: 'Sampleton', state: 'ZZ', price: 6450000, noi: 387000, bsf: 24000 });
a.rr = emptyRentRoll('Retail', '2026-10-01', 24000);
a.fee = { price: 6450000, flatPct: 2.5, tiers: [], coBrokerPct: null, referralPct: null, housePct: null, invoiced: null, paid: [] };
a.credit = { v: 1, leaseEntity: 'Example Cafe LLC', leaseId: null, parent: '', guarantor: { name: 'Example Holdings', scope: 'full', limit: '', endsOn: null }, ratings: [], sales: null, goDark: { state: null, note: '' } };
a.dd = { v: 1, preset: 'retail', na: {}, docs: [{ id: 'dd_invented00002', type: 'lease', typeBy: 'broker', name: 'Example Cafe lease.pdf', kind: 'pdf', size: 20480, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', pages: 12, addedAt: NOW, asOf: null, status: 'received', supersededBy: null, read: null, note: '' }] };
const list = A.newAbstracts();
const ab = A.addAbstract(list, { title: 'Example Cafe lease', docs: ['dd_invented00002'] }, { now: NOW }).abstract;
A.setValue(ab, 'tenant', 'Example Cafe LLC', { now: NOW });
A.setEvidence(ab, 'tenant', { doc: 'dd_invented00002', page: 1, quote: 'Example Cafe LLC (“Tenant”)' }, { now: NOW });
A.setChecked(ab, 'tenant', true, { now: NOW });
A.setValue(ab, 'commencement', '2027-03-01', { now: NOW });
A.setValue(ab, 'expiration', null, { rel: 'the last day of the 60th full month after the Commencement Date', now: NOW });
A.setValue(ab, 'sf', 1500, { basis: 'rentable', now: NOW });
A.setEvidence(ab, 'deposit', { doc: 'dd_invented00002', page: 3, quote: 'No security deposit is required.' }, { now: NOW });
A.setNone(ab, 'deposit', { now: NOW });
const t = A.addTerm(ab, { kind: 'initial', label: 'Original term' }, { now: NOW }).term;
A.addStep(ab, t.id, { label: 'Year 1', mFrom: 1, mTo: 12, primary: 'month', amounts: { month: 3750 } }, { now: NOW });
A.addStep(ab, t.id, { label: 'Year 2', mFrom: 13, mTo: 24, primary: 'month', amounts: { month: 3862.5 } }, { now: NOW });
a.abstracts = list;
const b = base('d4797b', 'Invented Court (fictional)', 1792203291000, { address: '7 Sample Court', price: 2400000, noi: 144000 });
b.rr = emptyRentRoll('Office', '2026-10-01');
b.fee = a.fee;
b.credit = a.credit;
b.dd = { v: 1, preset: null, na: {}, docs: [] };
b.abstracts = { v: 1, items: [] };

const backup = await buildBackup({ deals: [a, b], kv: { 'crm.tasks': [{ id: 't1', text: 'Call the owner', done: false }] }, appVersion: '4.7.97' });
fs.writeFileSync(OUT, `${JSON.stringify(backup, null, 1)}\n`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('wrote the 4.7.97 backup');

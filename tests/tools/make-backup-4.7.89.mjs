/* Make tests/fixtures/backup-4.7.89-before-comp-import.json and tests/fixtures/project-4.7.89-v1.json with the real
 * 4.7.89 code, taken from git (0f16f64): an invented comp set (hand comps, an edit, a comp read from an invented
 * report) in a session, with no `comps.mappings` setting, and the same set as a version 1 project file. The comp
 * importer (4.7.90) must open both exactly as they were: no origin added, nothing written on open, no history
 * entry. Every name and figure is made up.
 *
 *   node tests/tools/make-backup-4.7.89.mjs
 *
 * Needs nothing but git and node. Run once; the files are kept. */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';

const ROOT = new URL('../../', import.meta.url).pathname;
const FIX = `${ROOT}tests/fixtures/`;
const tmp = fs.mkdtempSync(`${os.tmpdir()}/old-4789-`);
execFileSync('sh', ['-c', `git -C "${ROOT}" archive 0f16f64 | tar -x -C "${tmp}"`]);
const { buildBackup } = await import(`${tmp}/app/backup.js`);
const { compToJSON, FORMAT, VERSION } = await import(`${tmp}/app/store.js`);

const comp = (o) => ({
  key: 'x', manual: true, kind: 'sale', origKind: 'sale', edited: new Set(), name: '', address: '', city: null, state: null, zip: null,
  submarket: null, zoning: null, date: null, dom: null, price: null, bsf: null, cap: null, occ: null, lot_sf: null, lot_ac: null,
  far: null, year: null, bclass: null, ptype: null, comp_id: null, buyer_broker: null, listing_broker: null, notes: null,
  costar_notes: null, costar_ppsf: null, partial: false, occ_basis: 'explicit', parcels: new Set(), portfolio: 0,
  source: 'entered by hand', flags: ['entered by hand -- not from a CoStar report'], exclude: false, ...o,
});
const manual = [
  comp({ key: 'manual::k1a', name: 'Invented Plaza (fictional)', address: '100 Example Street', city: 'Sampleton', state: 'ZZ', zip: '00001', date: new Date(Date.UTC(2026, 2, 4)), price: 6450000, bsf: 24000, cap: 6.25, occ: 94 }),
  comp({ key: 'manual::k1b', kind: 'market', origKind: 'market', name: 'Invented Court (fictional)', address: '7 Sample Court', city: 'Sampleton', state: 'ZZ', dom: 45, price: 2400000, bsf: 9000 }),
  comp({ key: 'invented-report.pdf::Example Row (fictional)', manual: false, name: 'Example Row (fictional)', address: '12 Example Row', date: new Date(Date.UTC(2026, 0, 15)), price: 3100000, bsf: 12000, source: 'invented-report.pdf', parcels: new Set(['EX-001']), flags: [] }),
].map(compToJSON);
const edits = { 'invented-report.pdf::Example Row (fictional)': { price: 3050000 } };
const session = { version: VERSION, moneyVersion: 1, savedAt: 1792203290000, docs: [], edits: {}, manual, windowMonths: 0 };
const backup = await buildBackup({ deals: [], kv: { 'crm.tasks': [{ id: 't1', text: 'Call the owner', done: false }] }, session, appVersion: '4.7.89' });
fs.writeFileSync(`${FIX}backup-4.7.89-before-comp-import.json`, `${JSON.stringify(backup, null, 1)}\n`);
const project = { format: FORMAT, version: VERSION, savedAt: '2026-10-31T10:00:00.000Z', docs: [{ name: 'invented-report.pdf', pages: ['Invented page one.'] }], edits, manual, subject: null, windowMonths: 0 };
fs.writeFileSync(`${FIX}project-4.7.89-v1.json`, `${JSON.stringify(project, null, 1)}\n`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`wrote the 4.7.89 backup and a version ${VERSION} project`);

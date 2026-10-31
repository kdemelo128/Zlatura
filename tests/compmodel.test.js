/* Where a comp came from (app/compmodel.js), the project file's version 2, and the old copies (a 4.7.89 backup and project)
 * opening exactly as they were. Every name and figure is invented. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normOrigin, originOf, originText, blankComp, ORIGIN_KINDS, BASES } from '../app/compmodel.js';
import { compFromJSON, compToJSON, readProject, VERSION, FORMAT } from '../app/store.js';
import { buildBackup, readBackup, planRestore, KV_KEYS } from '../app/backup.js';
import { kvTooNew } from '../app/migrate.js';
import { normMappings } from '../app/compimport.js';

const fx = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const good = { kind: 'import', source: 'Firm sheet', file: 'oct.csv', sha256: 'a'.repeat(64), sheet: 'Sheet1', row: 14, page: null, profile: 'zlatura-comps', importedAt: '2026-10-31T12:00:00.000Z' };

test('originText reads as a person would say it', () => {
  assert.equal(originText(good), 'Firm sheet (oct.csv, row 14)');
  assert.equal(originText({ kind: 'hand', source: 'entered by hand' }), 'entered by hand');
  assert.equal(originText({ kind: 'costar', source: 'a.pdf' }), 'a.pdf');
  assert.deepEqual(originOf({ source: 'a.pdf', kind: 'sale' }), { kind: 'costar', source: 'a.pdf', file: null, sha256: null, sheet: null, row: null, page: null, profile: null, importedAt: null });
  assert.equal(originOf({ manual: true, kind: 'sale' }).kind, 'hand');
  assert.equal(originOf({ manual: true, origin: good }).kind, 'import');
  assert.equal(originOf({}), null);
});

test('a stored origin is made safe: unknown kinds and non-objects are dropped, text capped, numbers ranged, unknown keys gone', () => {
  assert.equal(normOrigin(null), null); assert.equal(normOrigin('x'), null); assert.equal(normOrigin([]), null);
  assert.equal(normOrigin({ ...good, kind: 'weird' }), null, 'an unknown kind is dropped');
  assert.equal(normOrigin({ ...good, kind: '__proto__' }), null);
  assert.deepEqual(ORIGIN_KINDS, ['costar', 'import', 'hand']);
  const o = normOrigin({ ...good, source: `a\u0007${'s'.repeat(500)}`, file: 'f'.repeat(500), sheet: 's'.repeat(99), profile: 'p'.repeat(99), row: 0, page: 1.5, sha256: 'xyz', importedAt: 'never', extra: 1, __proto__: { a: 1 } });
  assert.equal(o.source.length, 80); assert.ok(!o.source.includes('\u0007'));
  assert.equal(o.file.length, 200); assert.equal(o.sheet.length, 31); assert.equal(o.profile.length, 40);
  assert.equal(o.row, null); assert.equal(o.page, null); assert.equal(o.sha256, null); assert.equal(o.importedAt, null);
  assert.ok(!('extra' in o));
  assert.equal(normOrigin({ ...good, row: 1e6 }).row, 1e6); assert.equal(normOrigin({ ...good, row: 1e6 + 1 }).row, null);
});

test('every way a comp is read back runs the same checks: origin, area basis and reported $/SF', () => {
  const c = compFromJSON({ ...compToJSON(blankComp('sale')), origin: { kind: 'bogus' }, bsf_basis: 'huge', reported_ppsf: -3 });
  assert.ok(!('origin' in c)); assert.equal(c.bsf_basis, 'unknown'); assert.equal(c.reported_ppsf, null);
  assert.equal(compFromJSON({ ...compToJSON(blankComp('sale')), reported_ppsf: 'NaN' }).reported_ppsf, null);
  const k = compFromJSON({ ...compToJSON(blankComp('sale')), origin: good, bsf_basis: 'gross', reported_ppsf: 150.25 });
  assert.deepEqual(k.origin, good); assert.equal(k.bsf_basis, 'gross'); assert.equal(k.reported_ppsf, 150.25);
  const plain = compFromJSON(compToJSON(blankComp('sale')));
  assert.ok(!('origin' in plain) && !('bsf_basis' in plain) && !('reported_ppsf' in plain), 'a comp without them gets none');
  assert.deepEqual(BASES, ['rentable', 'gross', 'unknown']);
});

test('project files: version 2 is written, versions 1 and 2 open, 3 is refused in the words the older app uses', () => {
  assert.equal(VERSION, 2);
  const base = { format: FORMAT, docs: [], edits: {}, manual: [], windowMonths: 0 };
  assert.deepEqual(readProject({ ...base, version: 1 }).manual, []);
  assert.deepEqual(readProject({ ...base, version: 2 }).manual, []);
  assert.throws(() => readProject({ ...base, version: 3 }), { message: 'That project was saved by a newer version of Zlatura. Reload the page to update, then open it again.' });
  assert.throws(() => readProject({ ...base, version: '2' }), /newer version/);
});

test('a 4.7.89 backup and a version 1 project open exactly as they were: no origin added, nothing written on open', () => {
  const b = readBackup(fx('backup-4.7.89-before-comp-import.json'));
  assert.ok(!('comps.mappings' in b.kv));
  const raw = b.session.manual;
  assert.equal(raw.length, 3);
  const opened = raw.map(compFromJSON);
  for (const [i, c] of opened.entries()) {
    assert.ok(!('origin' in c) && !('bsf_basis' in c) && !('reported_ppsf' in c), `comp ${i} gained nothing`);
    assert.deepEqual(compToJSON(c), raw[i], `comp ${i} saves back as it was`);
  }
  assert.equal(originOf(opened[0]).kind, 'hand'); assert.equal(originOf(opened[2]).kind, 'costar');
  const p = JSON.parse(fx('project-4.7.89-v1.json'));
  assert.equal(p.version, 1);
  const read = readProject(p);
  assert.deepEqual(read.manual.map(compToJSON), p.manual);
  assert.deepEqual(read.edits, p.edits);
  // restoring the backup carries the session through untouched
  const plan = planRestore(b, { deals: [], kv: {}, session: null, local: {} }, 'merge', 1800000000000);
  assert.deepEqual(plan.session.manual, raw);
});

test('remembered layouts travel in a backup, a newer version\'s record is kept and never read, and a bad one is cleaned', async () => {
  assert.ok(KV_KEYS.includes('comps.mappings'));
  const fp = 'b'.repeat(64);
  const kv = { 'comps.mappings': { v: 1, items: { [fp]: { source: 'Firm', columns: { address: 'address' }, answers: {}, statusMap: {}, uses: 3, savedAt: 5 } } } };
  const back = readBackup(JSON.stringify(await buildBackup({ deals: [], kv, appVersion: '4.7.90' })));
  assert.deepEqual(back.kv['comps.mappings'], kv['comps.mappings']);
  assert.equal(planRestore(back, { deals: [], kv: {}, session: null, local: {} }, 'merge', 1).kv['comps.mappings'].items[fp].uses, 3);
  assert.equal(kvTooNew('comps.mappings', { v: 2, items: {} }), true);
  assert.equal(kvTooNew('comps.mappings', kv['comps.mappings']), false);
  assert.deepEqual(normMappings({ v: 1, items: { [fp]: { source: 5, columns: null, answers: [], statusMap: 3, uses: -4, savedAt: 'x' } } }).items[fp], { source: '', columns: {}, answers: {}, statusMap: {}, uses: 0, savedAt: 0 });
});

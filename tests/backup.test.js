/* The backup: everything survives a round trip (photos, template bytes,
 * dates), the AI token never goes in, and a restore merges without losing
 * newer work on the device. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildBackup, readBackup, planRestore, encodeValue, decodeValue, KV_KEYS } from '../app/backup.js';

const deal = (id, updatedAt, extra = {}) => ({ id, name: id, updatedAt, figures: { price: 1e6 }, visit: { photos: [], audio: [] }, ...extra });

test('round trip: blobs, bytes and dates come back as they went in', async () => {
  const photo = new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/jpeg' });
  const tpl = new Uint8Array([80, 75, 3, 4, 0, 255]);
  const when = new Date('2026-03-01T12:00:00Z');
  const b = await buildBackup({
    deals: [deal('d1', 5, { visit: { photos: [{ id: 'p', blob: photo }], audio: [] } })],
    kv: { 'tpl.library': [{ id: 't1', versions: [{ bytes: tpl }] }], 'ai.settings': { url: 'https://ai.example', token: 'SECRET-TOKEN', enabled: true } },
    session: { comps: [{ date: when }] }, local: { 'comp-loader.loan.v1': '{"ltv":60}' }, appVersion: '3.2.0',
  });
  const text = JSON.stringify(b);
  assert.ok(!text.includes('SECRET-TOKEN'), 'the AI token is never written to a backup');
  assert.equal(b.counts.deals, 1);
  const r = readBackup(text);
  const back = r.deals[0].visit.photos[0].blob;
  assert.ok(back instanceof Blob);
  assert.equal(back.type, 'image/jpeg');
  assert.deepEqual([...new Uint8Array(await back.arrayBuffer())], [1, 2, 3, 250]);
  assert.deepEqual([...r.kv['tpl.library'][0].versions[0].bytes], [...tpl]);
  assert.equal(r.session.comps[0].date.toISOString(), when.toISOString());
  assert.ok(!('ai.settings' in b.kv) && !('ai.settings' in r.kv), 'the AI settings never travel in a backup');
  assert.deepEqual(decodeValue(await encodeValue({ a: [1, 'x', null, { b: true }] })), { a: [1, 'x', null, { b: true }] });
});

test('reading the wrong file says what it is', () => {
  assert.throws(() => readBackup('not json'), /not valid JSON/);
  assert.throws(() => readBackup('{"format":"comp-loader-project"}'), /comp project file/);
  assert.throws(() => readBackup('{"format":"comp-loader-backup","version":99}'), /newer version/);
});

test('merge: newer wins, nothing on the device is lost', () => {
  const current = {
    deals: [deal('a', 100), deal('b', 300)],
    kv: { 'crm.tasks': [{ id: 't1', title: 'here' }], 'crm.contacts': [{ id: 'c1', name: 'Old', updatedAt: 1 }], 'ai.settings': { url: 'u', token: 'T' } },
    session: { comps: [] }, local: { 'zlatura.loan.v1': 'here' },
  };
  const backup = {
    deals: [deal('a', 200), deal('b', 100), deal('c', 50)],
    kv: { 'crm.tasks': [{ id: 't1', title: 'there' }, { id: 't2', title: 'new' }], 'crm.contacts': [{ id: 'c1', name: 'New', updatedAt: 9 }], 'rr.layouts': [{ id: 'L' }], 'ai.settings': { url: 'other' } },
    session: { comps: [1] }, local: { 'zlatura.loan.v1': 'there', 'zlatura.tools.v1': 'tools' },
  };
  const p = planRestore(backup, current);
  assert.deepEqual(p.deals.put.map((d) => d.id), ['a', 'c'], 'a newer copy of a, and c which is new; b is newer here');
  assert.equal(p.deals.added, 1);
  assert.equal(p.deals.updated, 1);
  assert.deepEqual(p.removeDeals, []);
  assert.deepEqual(p.kv['crm.tasks'].map((t) => t.title), ['here', 'new'], 'a task on both sides is kept as it is here');
  assert.equal(p.kv['crm.contacts'][0].name, 'New', 'a newer contact replaces the older');
  assert.deepEqual(p.kv['rr.layouts'], [{ id: 'L' }], 'a setting the device lacks is added');
  assert.ok(!('ai.settings' in p.kv), 'the device’s own AI settings are left alone');
  assert.equal(p.session, null, 'the comp set on the device is not overwritten');
  assert.deepEqual(p.local, { 'zlatura.tools.v1': 'tools' });
});

test('replace: the backup wins, and the device’s AI settings are kept', () => {
  const current = { deals: [deal('a', 1), deal('z', 1)], kv: { 'ai.settings': { url: 'u', token: 'T' }, 'crm.tasks': [{ id: 1 }] }, session: null, local: {} };
  const backup = { deals: [deal('a', 0)], kv: { 'ai.settings': { url: 'b' } }, session: { s: 1 }, local: {} };
  const p = planRestore(backup, current, 'replace');
  assert.deepEqual(p.removeDeals, ['z']);
  assert.deepEqual(p.deals.put.map((d) => d.id), ['a'], 'even an older copy, when replacing');
  assert.ok(!('ai.settings' in p.kv), 'the backup’s AI settings are not adopted');
  assert.deepEqual(p.removeKv, ['crm.tasks'], 'and the device’s own are not removed');
});

/* ------------------------------------------- version 2: history in backups */
import fs from 'node:fs';
import { BACKUP_VERSION } from '../app/backup.js';

const entry = (id, at, extra = {}) => ({ id, at, seq: at, kind: 'edit', label: id, changes: [{ path: ['figures', 'price'], old: 1, new: 2 }], ...extra });
const snap = (id, at, auto = false) => ({ id, dealId: 'd1', name: id, auto, at, data: { figures: { price: at } } });

test('version 2: each deal’s history and snapshots go into a backup and come back', async () => {
  assert.equal(BACKUP_VERSION, 2);
  const b = await buildBackup({ deals: [deal('d1', 5)], history: { d1: [entry('h1', 1), entry('h2', 2)] }, snapshots: { d1: [snap('s1', 3)] }, appVersion: '4.3.1' });
  assert.equal(b.version, 2);
  assert.equal(b.counts.historyEntries, 2);
  assert.equal(b.counts.snapshots, 1);
  const r = readBackup(JSON.stringify(b));
  assert.deepEqual(r.history.d1.map((e) => e.id), ['h1', 'h2']);
  assert.deepEqual(r.history.d1[0].changes, [{ path: ['figures', 'price'], old: 1, new: 2 }]);
  assert.equal(r.snapshots.d1[0].data.figures.price, 3);
});

test('version 2 without history: the option leaves it out', async () => {
  const b = await buildBackup({ deals: [deal('d1', 5)], history: null, snapshots: null });
  assert.equal('history' in b, false);
  assert.equal('snapshots' in b, false);
  const r = readBackup(JSON.stringify(b));
  assert.equal(r.history, null);
  assert.equal(r.snapshots, null);
});

test('version 1 backups (4.2 and older) still read, with no history; a newer version than this one is refused', () => {
  const old = readBackup(fs.readFileSync(new URL('./fixtures/backup-comp-loader-3.3.0.json', import.meta.url), 'utf8'));
  assert.equal(old.version, 1);
  assert.equal(old.history, null);
  assert.ok(old.deals.length >= 1);
  assert.throws(() => readBackup(JSON.stringify({ format: 'zlatura-backup', version: 3, deals: [] })), /newer version/);
});

test('a restore brings the history and snapshots of the deals it keeps, and says so', async () => {
  const b = readBackup(JSON.stringify(await buildBackup({
    deals: [deal('d1', 5), deal('d2', 5)],
    history: { d1: [entry('h1', 1)], d2: [entry('h9', 1)], gone: [entry('hx', 1)] },
    snapshots: { d1: [snap('s1', 3)] },
  })));
  const here = { deals: [deal('d1', 9)], kv: {}, session: null, local: {} };
  const m = planRestore(b, here, 'merge');
  assert.deepEqual(Object.keys(m.history).sort(), ['d1', 'd2'], 'history only for deals the restore keeps');
  assert.deepEqual(Object.keys(m.snapshots), ['d1']);
  assert.ok(m.summary.some((l) => /History: 2 entries and 1 snapshot combined with what this device has/.test(l)), m.summary.join(' | '));
  const r = planRestore(b, here, 'replace');
  assert.deepEqual(Object.keys(r.history).sort(), ['d1', 'd2']);
});

test('a merge restore combines the T-12 labels you filed, label by label, the newer choice winning', () => {
  const here = { 'management fees': { category: 'management', at: 200 }, 'pylon sign lease': { category: 'otherOpex', at: 100 } };
  const there = { 'management fees': { category: 'owner', at: 100 }, 'pylon sign lease': { category: 'otherIncome', at: 300 }, 'roof work': { category: 'capex', at: 50 } };
  const p = planRestore({ deals: [], kv: { 't12.labels': { entries: there } }, session: null, local: {} }, { deals: [], kv: { 't12.labels': { entries: here } }, session: null, local: {} }, 'merge');
  assert.deepEqual(p.kv['t12.labels'].entries, { 'management fees': { category: 'management', at: 200 }, 'pylon sign lease': { category: 'otherIncome', at: 300 }, 'roof work': { category: 'capex', at: 50 } });
  assert.ok(p.summary.includes('T-12 labels you filed: 2 added or updated.'), p.summary.join(' | '));
  // nothing newer: nothing written
  const same = planRestore({ deals: [], kv: { 't12.labels': { entries: here } }, session: null, local: {} }, { deals: [], kv: { 't12.labels': { entries: here } }, session: null, local: {} }, 'merge');
  assert.ok(!('t12.labels' in same.kv));
});

/* --------------------------------------- F1 to F3: a backup file is not trusted */

const HOSTILE = JSON.stringify({ format: 'zlatura-backup', version: 2, deals: [], kv: { 'ai.settings': { url: 'https://ai.attacker.example', enabled: true }, 'evil.key': 1, 'crm.tasks': [] }, local: {} });
const DEVICE = { url: 'https://ai.example', token: 'DEVICE-TOKEN-TEST', enabled: true };

test('F1: a backup never carries AI settings, going in or coming out', async () => {
  const b = await buildBackup({ kv: { 'ai.settings': { url: 'https://ai.example', token: 'T', enabled: true }, 'crm.tasks': [] }, appVersion: '4.7.31' });
  assert.ok(!('ai.settings' in b.kv));
  assert.ok('crm.tasks' in b.kv, 'other settings are kept');
});

test('F1: reading a hostile backup drops ai.settings and unknown settings, and says so', () => {
  const r = readBackup(HOSTILE);
  assert.deepEqual(Object.keys(r.kv), ['crm.tasks']);
  assert.deepEqual(r.dropped, { ai: true, other: 1 });
  const p = planRestore(r, { deals: [], kv: {}, session: null, local: {} }, 'merge');
  assert.match(p.summary.join(' '), /1 setting in the backup that this version does not use was left out/);
});

test('F1: replace keeps the device’s AI settings exactly, and says so', () => {
  const p = planRestore(readBackup(HOSTILE), { deals: [], kv: { 'ai.settings': DEVICE }, session: null, local: {} }, 'replace');
  assert.ok(!('ai.settings' in p.kv));
  assert.ok(!p.removeKv.includes('ai.settings'));
  assert.match(p.summary.join(' '), /This device’s AI settings are kept as they are \(they are never restored from a backup\)/);
});

test('F1: a plan built from a raw object is cleaned too, and merge does not adopt the settings', () => {
  const raw = { deals: [], kv: { 'ai.settings': { url: 'https://ai.attacker.example' }, 'crm.tasks': [{ id: 1 }] }, session: null, local: {} };
  for (const mode of ['merge', 'replace']) {
    const p = planRestore(raw, { deals: [], kv: {}, session: null, local: {} }, mode);
    assert.ok(!('ai.settings' in p.kv), mode);
    assert.match(p.summary.join(' '), /AI settings are never restored from a backup: enter the server address and access token again/);
  }
});

test('F1: every settings key the app writes is on the backup allow-list', () => {
  const found = new Set();
  for (const f of fs.readdirSync(new URL('../app/', import.meta.url)).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
    const consts = new Map([...src.matchAll(/const\s+([A-Z_]+)\s*=\s*'([a-z0-9.]+)'/g)].map((m) => [m[1], m[2]]));
    for (const m of src.matchAll(/kv(?:Set|Get)\(\s*('([^']+)'|([A-Z_]+))/g)) found.add(m[2] || consts.get(m[3]));
    if (f === 'crm.js') for (const m of src.matchAll(/'(crm\.[a-z]+)'/g)) found.add(m[1]);
  }
  found.delete(undefined);
  assert.ok(found.size >= 8, `only found ${[...found]}`);
  for (const k of found) assert.ok(k === 'ai.settings' || KV_KEYS.includes(k), `${k} is written by the app but dropped by a restore`);
});

test('F2: a restore writes only the three known local keys, as short text', () => {
  const local = { 'zlatura.session.unsaved': '{"x":1}', 'zlatura.theme': 'dark', 'zlatura.loan.v1': '{"ltv":60}', 'zlatura.tools.v1': 'x'.repeat(262145), 'zlatura.subject.v1': { length: 1 } };
  const backup = { deals: [], kv: {}, session: null, local };
  for (const mode of ['merge', 'replace']) {
    assert.deepEqual(planRestore(backup, { deals: [], kv: {}, session: null, local: {} }, mode).local, { 'zlatura.loan.v1': '{"ltv":60}' }, mode);
  }
  assert.deepEqual(planRestore({ ...backup, local: { 'zlatura.tools.v1': 'x'.repeat(262144) } }, { deals: [], kv: {}, session: null, local: {} }, 'replace').local['zlatura.tools.v1'].length, 262144, 'the limit itself is allowed');
});

test('I6: a __proto__ key in a backup stays an ordinary, inert key', () => {
  const r = decodeValue(JSON.parse('{"__proto__":{"x":1},"y":2}'));
  assert.equal(Object.getPrototypeOf(r), Object.prototype);
  assert.equal(r.x, undefined);
  assert.equal(r.y, 2);
  const scen = JSON.parse('{"__proto__":[{"id":"a"}],"dcf":[{"id":"b"}]}');
  const p = planRestore({ deals: [], kv: { 'tools.scenarios': scen }, session: null, local: {} }, { deals: [], kv: {}, session: null, local: {} }, 'merge');
  assert.equal(Object.getPrototypeOf(p.kv['tools.scenarios']), Object.prototype);
  assert.deepEqual(p.kv['tools.scenarios'].dcf, [{ id: 'b' }]);
  const lab = planRestore({ deals: [], kv: { 't12.labels': { entries: JSON.parse('{"__proto__":{"category":"rent","at":9}}') } }, session: null, local: {} }, { deals: [], kv: {}, session: null, local: {} }, 'merge');
  assert.ok(!lab.kv['t12.labels'] || Object.getPrototypeOf(lab.kv['t12.labels'].entries) === Object.prototype);
});

test('I6: keys named like Object members are plain keys, not the object’s own members', () => {
  const scen = JSON.parse('{"constructor":[{"id":"a"}],"dcf":[{"id":"b"}]}');
  const here = { deals: [], kv: {}, session: null, local: {} };
  const p = planRestore({ deals: [], kv: { 'tools.scenarios': scen }, session: null, local: {} }, here, 'merge');
  assert.deepEqual(Object.keys(p.kv['tools.scenarios']).sort(), ['constructor', 'dcf']);
  assert.equal(Object.getPrototypeOf(p.kv['tools.scenarios']), Object.prototype);
  // a device holding no "constructor" entry must not read Object's own constructor as one
  assert.doesNotThrow(() => planRestore({ deals: [], kv: { 'tools.scenarios': { constructor: [{ id: 'z' }] } }, session: null, local: {} }, { ...here, kv: { 'tools.scenarios': {} } }, 'merge'));
  const lab = planRestore({ deals: [], kv: { 't12.labels': { entries: { constructor: { category: 'rent', at: 5 } } } }, session: null, local: {} }, { ...here, kv: { 't12.labels': { entries: {} } } }, 'merge');
  assert.equal(lab.kv['t12.labels'].entries.constructor.category, 'rent');
});

/* ------------------------------------------------ research briefs (B1b) */

const DAYMS = 86400000;
const NOW = 1_800_000_000_000;
const brief = (id, o = {}) => ({ id, v: 1, subject: { name: `Co ${id}`, state: null }, status: 'ready', createdAt: NOW - 10 * DAYMS, updatedAt: NOW - 10 * DAYMS, retainUntil: NOW + 355 * DAYMS, claims: [], ...o });
const EMPTY = { deals: [], kv: {}, session: null, local: {} };

test('B1b: a round trip carries the research briefs (cleanKv would drop an unlisted key)', async () => {
  const b = await buildBackup({ kv: { 'research.briefs': [brief('rb1')] } });
  assert.equal(b.counts.briefs, 1);
  const r = readBackup(JSON.stringify(b));
  assert.deepEqual(r.kv['research.briefs'].map((x) => x.id), ['rb1']);
  assert.equal(r.dropped.other, 0);
  assert.deepEqual(planRestore(r, EMPTY, 'merge', NOW).kv['research.briefs'].map((x) => x.id), ['rb1']);
  assert.ok(!('briefs' in (await buildBackup({ kv: {} })).counts), 'a backup with no briefs counts none');
});

test('B1b: a merge keeps the newer updatedAt, adds the missing and skips expired briefs', () => {
  const backup = { deals: [], local: {}, session: null, kv: { 'research.briefs': [
    brief('same', { updatedAt: NOW - 1, subject: { name: 'from backup', state: null } }), brief('older', { updatedAt: NOW - 50 * DAYMS, subject: { name: 'from backup', state: null } }),
    brief('new'), brief('old', { retainUntil: NOW - 1 }), brief('edge', { retainUntil: NOW }),
  ] } };
  const device = { ...EMPTY, kv: { 'research.briefs': [brief('same', { subject: { name: 'on device', state: null } }), brief('older', { subject: { name: 'on device', state: null } })] } };
  const p = planRestore(backup, device, 'merge', NOW);
  const by = Object.fromEntries(p.kv['research.briefs'].map((x) => [x.id, x.subject.name]));
  assert.deepEqual(by, { same: 'from backup', older: 'on device', new: 'Co new', edge: 'Co edge' });
  assert.match(p.summary.join(' '), /Research briefs: 2 added, 1 updated\./);
  // a malformed value is ignored, not a crash
  assert.doesNotThrow(() => planRestore({ ...backup, kv: { 'research.briefs': 'x' } }, device, 'merge', NOW));
  assert.doesNotThrow(() => planRestore(backup, { ...EMPTY, kv: { 'research.briefs': 'x' } }, 'merge', NOW));
});

test('B1b: a replace restore skips expired briefs, and names the briefs it would remove from the device', () => {
  const withKey = { deals: [], local: {}, session: null, kv: { 'research.briefs': [brief('a'), brief('gone', { retainUntil: NOW - 1 })] } };
  const device = { ...EMPTY, kv: { 'research.briefs': [brief('x'), brief('y'), brief('z')] } };
  const p = planRestore(withKey, device, 'replace', NOW);
  assert.deepEqual(p.kv['research.briefs'].map((x) => x.id), ['a']);
  assert.match(p.summary.join(' '), /Research briefs on this device are replaced by the 1 in the backup\./);
  const without = planRestore({ deals: [], local: {}, session: null, kv: {} }, device, 'replace', NOW);
  assert.ok(without.removeKv.includes('research.briefs'));
  assert.match(without.summary.join(' '), /3 research briefs on this device will be deleted\./);
  assert.ok(!/research brief/.test(planRestore({ deals: [], local: {}, session: null, kv: {} }, EMPTY, 'replace', NOW).summary.join(' ')), 'no line when the device has none');
});

for (const [file, label] of [['backup-4.7.50-before-research.json', '4.7.50'], ['backup-4.7.36-before-underwriting.json', '4.7.36']]) {
  test(`B1b: a ${label} backup gives the same restore plan as 4.7.50 (c57ff27), and leaves the device's briefs alone`, () => {
    const snap = JSON.parse(fs.readFileSync(new URL('./fixtures/restore-plans-c57ff27.json', import.meta.url), 'utf8'));
    const backup = readBackup(fs.readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'));
    assert.ok(!('research.briefs' in backup.kv));
    for (const [dn, dev] of Object.entries(snap.devices)) {
      const withBriefs = { ...dev, kv: { ...dev.kv, 'research.briefs': [brief('rbdevice')] } };
      for (const device of [dev, withBriefs]) {
        const p = planRestore(backup, structuredClone(device), 'merge', NOW);
        assert.deepEqual(JSON.parse(JSON.stringify({ put: p.deals.put, kv: p.kv, local: p.local })), (({ put, kv, local }) => ({ put, kv, local }))(snap.plans[file][dn]), dn);
        assert.ok(!('research.briefs' in p.kv), 'no briefs in the plan');
        assert.deepEqual(p.removeKv, [], 'merge removes nothing');
      }
    }
  });
}

test('B1b: a tampered retainUntil of 9e15 is not restored past 365 days, in merge or replace', () => {
  const tampered = brief('t', { createdAt: NOW - 400 * DAYMS, retainUntil: 9e15 });
  const backup = { deals: [], local: {}, session: null, kv: { 'research.briefs': [tampered, brief('ok')] } };
  for (const mode of ['merge', 'replace']) assert.deepEqual(planRestore(backup, EMPTY, mode, NOW).kv['research.briefs'].map((x) => x.id), ['ok'], mode);
});

test('B1b: a malformed brief in a backup restores, then reads with zero counts', async () => {
  const { readBrief } = await import('../app/research.js');
  const bad = [brief('m1', { claims: 'x' }), brief('m2', { claims: [null] }), brief('m3', { sections: [null], claims: [] }), 'junk', null];
  const p = planRestore({ deals: [], local: {}, session: null, kv: { 'research.briefs': bad } }, { ...EMPTY, kv: { 'research.briefs': [null, brief('d')] } }, 'merge', NOW);
  const list = p.kv['research.briefs'];
  assert.deepEqual(list.map((x) => x.id).sort(), ['d', 'm1', 'm2', 'm3']);
  for (const b of list) assert.deepEqual(readBrief(b, NOW).counts, { confirmed: 0, hypothesis: 0, refused: 0 });
});

test('B1b: a merge that leaves more than 200 briefs says new briefs are refused until some are deleted', () => {
  const many = (p, n) => Array.from({ length: n }, (_, i) => brief(`${p}${i}`));
  const p = planRestore({ deals: [], local: {}, session: null, kv: { 'research.briefs': many('b', 120) } }, { ...EMPTY, kv: { 'research.briefs': many('d', 100) } }, 'merge', NOW);
  assert.equal(p.kv['research.briefs'].length, 220);
  assert.match(p.summary.join(' '), /220 research briefs, over the 200 the app keeps: new briefs are refused until some are deleted/);
  const ok = planRestore({ deals: [], local: {}, session: null, kv: { 'research.briefs': many('b', 100) } }, { ...EMPTY, kv: { 'research.briefs': many('d', 100) } }, 'merge', NOW);
  assert.ok(!/over the 200/.test(ok.summary.join(' ')));
  assert.match(planRestore({ deals: [], local: {}, session: null, kv: { 'research.briefs': many('b', 201) } }, EMPTY, 'replace', NOW).summary.join(' '), /201 research briefs, over the 200/);
});

for (const file of ['backup-4.7.50-before-research.json', 'backup-4.7.36-before-underwriting.json']) {
  test(`B1b: a replace restore of ${file} gives the same plan as 4.7.50 (c57ff27)`, () => {
    const snap = JSON.parse(fs.readFileSync(new URL('./fixtures/restore-plans-c57ff27.json', import.meta.url), 'utf8'));
    const backup = readBackup(fs.readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'));
    for (const [dn, dev] of Object.entries(snap.devices)) {
      const p = planRestore(backup, structuredClone(dev), 'replace', NOW);
      assert.deepEqual(JSON.parse(JSON.stringify({ put: p.deals.put, kv: p.kv, removeDeals: p.removeDeals, removeKv: p.removeKv, local: p.local, session: p.session })), snap.plans[file][dn].replace, dn);
      // with briefs on the device the only difference is that they would be removed, and the summary says how many
      const q = planRestore(backup, { ...structuredClone(dev), kv: { ...dev.kv, 'research.briefs': [brief('a'), brief('b')] } }, 'replace', NOW);
      assert.deepEqual(q.removeKv.filter((k) => !p.removeKv.includes(k)), ['research.briefs']);
      assert.match(q.summary.join(' '), /2 research briefs on this device will be deleted/);
    }
  });
}

/* ------------------------------------------- quick underwritings (uw.scratch) */

const quick = (id, o = {}) => ({ v: 1, id, name: `Quick ${id}`, createdAt: NOW - 10 * DAYMS, updatedAt: NOW - 10 * DAYMS, figures: { price: 2400000, noi: 156000 }, loan: { ltv: 65, rate: 6.5 }, live: {}, targets: { cap: 7, irr: 15 }, ...o });

test('W1: a round trip carries the quick underwritings (cleanKv would drop an unlisted key)', async () => {
  assert.ok(KV_KEYS.includes('uw.scratch'));
  const b = await buildBackup({ kv: { 'uw.scratch': [quick('ua')] } });
  assert.equal(b.counts.quickUnderwritings, 1);
  const r = readBackup(JSON.stringify(b));
  assert.deepEqual(r.kv['uw.scratch'].map((x) => x.id), ['ua']);
  assert.equal(r.dropped.other, 0);
  assert.deepEqual(planRestore(r, EMPTY, 'merge', NOW).kv['uw.scratch'].map((x) => x.id), ['ua']);
  assert.ok(!('quickUnderwritings' in (await buildBackup({ kv: {} })).counts), 'a backup with none counts none');
});

test('W1: a merge adds the missing, keeps the newer updatedAt, and says what it did', () => {
  const backup = { deals: [], local: {}, session: null, kv: { 'uw.scratch': [
    quick('same', { updatedAt: NOW - 1, name: 'from backup' }), quick('older', { updatedAt: NOW - 50 * DAYMS, name: 'from backup' }), quick('new'),
  ] } };
  const device = { ...EMPTY, kv: { 'uw.scratch': [quick('same', { name: 'on device' }), quick('older', { name: 'on device' })] } };
  const p = planRestore(backup, device, 'merge', NOW);
  assert.deepEqual(Object.fromEntries(p.kv['uw.scratch'].map((x) => [x.id, x.name])), { same: 'from backup', older: 'on device', new: 'Quick new' });
  assert.match(p.summary.join(' '), /Quick underwritings: 1 added, 1 updated\./);
  assert.doesNotThrow(() => planRestore({ ...backup, kv: { 'uw.scratch': 'x' } }, device, 'merge', NOW));
  assert.doesNotThrow(() => planRestore(backup, { ...EMPTY, kv: { 'uw.scratch': 'x' } }, 'merge', NOW));
});

test('W1: a record on the device made by a newer version is not overwritten by a backup copy', () => {
  const future = { ...quick('f'), v: 2, updatedAt: 1, name: 'future' };
  const p = planRestore({ deals: [], local: {}, session: null, kv: { 'uw.scratch': [quick('f', { updatedAt: NOW })] } }, { ...EMPTY, kv: { 'uw.scratch': [future] } }, 'merge', NOW);
  assert.ok(!p.kv['uw.scratch'], 'nothing to write');
});

test('W1: unreadable quick underwritings in a backup are left out and counted, in merge and replace', () => {
  const kv = { 'uw.scratch': [quick('ok'), { id: 'BAD ID' }, quick('nan', { figures: { price: NaN } }), 'junk'] };
  for (const mode of ['merge', 'replace']) {
    const p = planRestore({ deals: [], local: {}, session: null, kv }, EMPTY, mode, NOW);
    assert.deepEqual(p.kv['uw.scratch'].map((x) => x.id), ['ok'], mode);
    assert.match(p.summary.join(' '), /3 quick underwritings in this backup could not be read and were left out\./, mode);
  }
});

test('W1: a replace restore names the quick underwritings it would remove from the device', () => {
  const device = { ...EMPTY, kv: { 'uw.scratch': [quick('x'), quick('y'), quick('z')] } };
  const withKey = planRestore({ deals: [], local: {}, session: null, kv: { 'uw.scratch': [quick('a')] } }, device, 'replace', NOW);
  assert.deepEqual(withKey.kv['uw.scratch'].map((x) => x.id), ['a']);
  assert.match(withKey.summary.join(' '), /Quick underwritings on this device are replaced by the 1 in the backup\./);
  const without = planRestore({ deals: [], local: {}, session: null, kv: {} }, device, 'replace', NOW);
  assert.ok(without.removeKv.includes('uw.scratch'));
  assert.match(without.summary.join(' '), /3 quick underwritings on this device will be deleted\./);
  assert.ok(!/quick underwriting/.test(planRestore({ deals: [], local: {}, session: null, kv: {} }, EMPTY, 'replace', NOW).summary.join(' ')), 'no line when the device has none');
});

test('W1: a merge that leaves more than 100 says new ones are refused until some are deleted', () => {
  const many = (p, n) => Array.from({ length: n }, (_, i) => quick(`${p}${i}`));
  const p = planRestore({ deals: [], local: {}, session: null, kv: { 'uw.scratch': many('b', 60) } }, { ...EMPTY, kv: { 'uw.scratch': many('d', 60) } }, 'merge', NOW);
  assert.equal(p.kv['uw.scratch'].length, 120, 'the device’s own are never dropped');
  assert.match(p.summary.join(' '), /120 quick underwritings, over the 100 the app keeps/);
});

// every fixture, from 3.1.0 to 4.7.56, restores to the plan 4.7.56 (2ac22a1) gave: nothing about sets or quick underwritings, nothing else changed
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const fingerprint = (p) => crypto.createHash('sha256').update(JSON.stringify(canon(JSON.parse(JSON.stringify({ put: p.deals.put, kv: p.kv, local: p.local, removeDeals: p.removeDeals, removeKv: p.removeKv, session: p.session, summary: p.summary }))))).digest('hex');
test('W1: every backup fixture restores to the same plan as 4.7.56 (2ac22a1), in merge and replace, and brings no quick underwritings', () => {
  const snap = JSON.parse(fs.readFileSync(new URL('./fixtures/restore-plans-2ac22a1.json', import.meta.url), 'utf8'));
  const files = fs.readdirSync(new URL('./fixtures/', import.meta.url)).filter((f) => /^backup-.*\.json$/.test(f));
  assert.ok(files.includes('backup-4.7.56-before-uw-workspace.json') && files.length >= 12);
  assert.deepEqual(files.sort(), Object.keys(snap.plans).sort(), 'the snapshot covers every fixture: regenerate it with tests/tools/make-backup-4.7.56.mjs');
  for (const f of files) {
    for (const [dn, dev] of Object.entries(snap.devices)) {
      for (const mode of ['merge', 'replace']) {
        const backup = readBackup(fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
        assert.ok(!('uw.scratch' in backup.kv));
        const p = planRestore(backup, structuredClone(dev), mode, snap.now);
        assert.equal(fingerprint(p), snap.plans[f][dn][mode], `${f} on ${dn} (${mode})`);
        assert.ok(!('uw.scratch' in p.kv));
      }
    }
  }
});

test('W1: a 4.7.56 backup restores into a device that has quick underwritings, and leaves them alone (merge)', () => {
  const backup = readBackup(fs.readFileSync(new URL('./fixtures/backup-4.7.56-before-uw-workspace.json', import.meta.url), 'utf8'));
  const p = planRestore(backup, { ...EMPTY, kv: { 'uw.scratch': [quick('mine')] } }, 'merge', NOW);
  assert.ok(!('uw.scratch' in p.kv));
  assert.ok(!p.removeKv.includes('uw.scratch'));
  assert.ok(!/quick underwriting/.test(p.summary.join(' ')));
});

/* The migration registry (app/migrate.js), on real backups made by old
 * versions (tests/fixtures):
 *   backup-3.1.0-before-rent-roll.json  deals read by the version before the
 *     rent roll, backed up by 3.1.0 without being opened (tests/tools/make-old-backup.mjs);
 *   backup-comp-loader-3.3.0.json       a 3.3.0 deal, before the money rounding;
 *   backup-4.7.3-before-data-qc.json    deals read from OMs by 4.7.3, before an OM's rent
 *     roll kept its Data QC record (tests/tools/make-backup-4.7.3.mjs).
 * Every step must have a backup that needs it: adding a step without one fails here. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { MIGRATIONS, SCHEMA, MONEY_VERSION, LATEST, pending, tooNew, migrateDeal, applyStep } from '../app/migrate.js';
import { readBackup, planRestore } from '../app/backup.js';
import { MONEY_VERSION as STORE_MONEY } from '../app/store.js';
import { quantizeDeal } from '../app/engine/money.js';
import { monthlyAmount } from '../app/lease.js';

const FIX = new URL('./fixtures/', import.meta.url).pathname;
const BACKUPS = {
  '3.1.0': 'backup-3.1.0-before-rent-roll.json',
  '3.3.0': 'backup-comp-loader-3.3.0.json',
  '4.7.3': 'backup-4.7.3-before-data-qc.json',
  '4.7.20': 'backup-4.7.20-before-pdf-roll.json',
  '4.7.56': 'backup-4.7.56-before-fee-record.json',
  '4.7.64': 'backup-4.7.64-before-credit.json',
};
/** The old backup each step is tested on: a new step needs a backup from the version before it. */
const COVERS = { money: ['3.1.0', '3.3.0'], 'rent-roll': ['3.1.0'], 'rr-qc': ['3.1.0', '3.3.0', '4.7.3'], 'rr-pdf-source': ['3.1.0', '3.3.0', '4.7.3', '4.7.20'], 'fee-record': ['3.1.0', '3.3.0', '4.7.3', '4.7.20', '4.7.56'], 'credit-record': ['3.1.0', '3.3.0', '4.7.3', '4.7.20', '4.7.56', '4.7.64'] };
const load = (v) => readBackup(fs.readFileSync(FIX + BACKUPS[v], 'utf8'));
const TODAY = '2026-10-10';
const empty = { deals: [], kv: {}, session: null, local: {} };

test('the registry: ids unique, each field only goes up, and the latest versions are what the app writes', () => {
  assert.equal(new Set(MIGRATIONS.map((s) => s.id)).size, MIGRATIONS.length);
  const last = {};
  for (const s of MIGRATIONS) {
    assert.ok(['schema', 'moneyVersion'].includes(s.field), s.id);
    assert.ok(s.to > (last[s.field] || 0), `${s.id}: ${s.field} must go up`);
    last[s.field] = s.to;
    for (const k of ['since', 'does', 'brief', 'kind']) assert.equal(typeof s[k], 'string', `${s.id}.${k}`);
    assert.equal(typeof s.label([]), 'string');
  }
  assert.deepEqual(LATEST, last);
  assert.equal(SCHEMA, 6);
  assert.equal(MONEY_VERSION, 1);
  assert.equal(STORE_MONEY, MONEY_VERSION, 'the store writes the registry’s money version');
});

test('every step is tested on a real old backup that needs it', () => {
  for (const s of MIGRATIONS) {
    const vs = COVERS[s.id];
    assert.ok(vs && vs.length, `step "${s.id}" has no old backup in tests/fixtures: add one from the version before it`);
    for (const v of vs) assert.ok(load(v).deals.some((d) => s.needed(d)), `${BACKUPS[v]} has no deal that needs "${s.id}"`);
  }
});

test('3.1.0 backup: deals from before the rent roll get one, from the OM’s rows, and their money rounded', () => {
  const b = load('3.1.0');
  assert.equal(b.deals.length, 3);
  for (const d of b.deals) {
    assert.equal(d.rr, undefined, 'saved without a rent roll');
    const fromOm = (d.rentRoll || []).length > 0;
    const due = fromOm ? ['money', 'rent-roll', 'rr-qc', 'rr-pdf-source', 'fee-record', 'credit-record'] : ['money', 'rent-roll', 'rr-pdf-source', 'fee-record', 'credit-record'];
    assert.deepEqual(pending(d).map((s) => s.id), due);
    const rows = (d.rentRoll || []).map((r) => ({ ...r }));
    const applied = migrateDeal(d, { today: TODAY });
    assert.deepEqual(applied.map((x) => x.id), due);
    assert.equal(d.schema, SCHEMA);
    assert.equal(d.moneyVersion, MONEY_VERSION);
    assert.ok(d.rr && Array.isArray(d.rr.leases));
    assert.equal(d.rr.settings.asOf, TODAY);
    // one lease per OM row, each at the row's rent
    assert.equal(d.rr.leases.length, rows.length, d.name);
    d.rr.leases.forEach((l, i) => {
      assert.equal(l.sf, rows[i].sf);
      if (rows[i].vacant) { assert.equal(l.periods.length, 0, 'a vacant suite has no rent'); return; }
      assert.equal(l.tenant, rows[i].tenant);
      const p = l.periods[0];
      assert.equal(p.source, 'documented');
      if (rows[i].annual) assert.ok(Math.abs(monthlyAmount(p.rate, p.unit, l.sf) * 12 - rows[i].annual) < 0.01, `${l.tenant}: ${monthlyAmount(p.rate, p.unit, l.sf) * 12} vs ${rows[i].annual}`);
    });
    if (d.figures && Number.isFinite(d.figures.opex)) assert.equal(d.rr.settings.opex, d.figures.opex);
    // everything stored as money is rounded once it has been brought up to date
    assert.equal(quantizeDeal(d).changes.length, 0, `${d.name}: left unrounded`);
    // and a second run does nothing
    assert.deepEqual(migrateDeal(d, { today: TODAY }), []);
  }
  const om = b.deals.find((d) => (d.rentRoll || []).length);
  assert.equal(om.rr.leases.length, 5, 'the retail OM’s five tenants');
});

test('3.3.0 backup: only the rounding is due, and it is recorded value by value', () => {
  const [d] = load('3.3.0').deals;
  assert.deepEqual(pending(d).map((s) => s.id), ['money', 'rr-qc', 'rr-pdf-source', 'fee-record', 'credit-record']);
  const rr = JSON.stringify(d.rr);
  const [a] = migrateDeal(d, { today: TODAY });
  assert.ok(a.rounded.length >= 1);
  for (const c of a.rounded) assert.ok('path' in c && 'old' in c && 'new' in c);
  assert.equal(d.moneyVersion, 1);
  assert.notEqual(JSON.stringify(d.rr), undefined);
  assert.equal(d.rr.leases.length, JSON.parse(rr).leases.length, 'the rent roll it had is kept');
});

test('the steps run in order, and one at a time gives the same deal as all at once', () => {
  const [a] = load('3.1.0').deals.filter((d) => d.rentRoll && d.rentRoll.length);
  const [b] = load('3.1.0').deals.filter((d) => d.rentRoll && d.rentRoll.length);
  migrateDeal(a, { today: TODAY });
  for (const s of pending(b)) applyStep(b, s, { today: TODAY });
  // lease ids are made new each time
  const noIds = (d) => ({ ...d, rr: { ...d.rr, leases: d.rr.leases.map(({ id, ...l }) => l) } });
  assert.deepEqual(noIds(a), noIds(b));
});

test('a deal saved by a newer version is left alone, and a backup holding one is refused', () => {
  const b = load('3.1.0');
  const d = { ...b.deals[0], schema: SCHEMA + 1 };
  assert.ok(tooNew(d));
  assert.deepEqual(pending(d), []);
  assert.deepEqual(migrateDeal(d), []);
  assert.ok(tooNew({ moneyVersion: MONEY_VERSION + 1 }));
  assert.ok(!tooNew({}) && !tooNew({ schema: SCHEMA, moneyVersion: MONEY_VERSION }));
  const raw = JSON.parse(fs.readFileSync(FIX + BACKUPS['3.1.0'], 'utf8'));
  raw.deals[2].schema = SCHEMA + 1;
  assert.throws(() => readBackup(raw), /a deal saved by a newer version.*4410 Example Avenue NW.*Nothing was restored/);
});

test('the restore says which deals an older version saved, and what bringing them up to date changes', () => {
  assert.match(planRestore(load('3.1.0'), empty).summary.join(' '), /3 deals saved by an older version are brought up to date as they are restored: money rounded to whole cents \(1\), rent roll set up \(3\), rent roll source recorded \(1\), ready for rent roll PDFs \(3\), ready for the fee record \(3\), ready for the credit record \(3\)./);
  assert.match(planRestore(load('3.3.0'), empty).summary.join(' '), /1 deal saved by an older version is brought up to date as it is restored: money rounded to whole cents \(1\), rent roll source recorded \(1\), ready for rent roll PDFs \(1\), ready for the fee record \(1\), ready for the credit record \(1\)./);
  assert.match(planRestore(load('4.7.3'), empty).summary.join(' '), /2 deals saved by an older version are brought up to date as they are restored: rent roll source recorded \(1\), ready for rent roll PDFs \(2\), ready for the fee record \(2\), ready for the credit record \(2\)./);
  // working it out changes nothing in the backup
  const b = load('3.1.0');
  planRestore(b, empty);
  assert.ok(b.deals.every((d) => d.rr === undefined && d.moneyVersion === undefined));
  // a deal already up to date isn't mentioned
  const cur = load('3.1.0');
  for (const d of cur.deals) migrateDeal(d);
  assert.ok(!/older version/.test(planRestore(cur, empty).summary.join(' ')));
});

test('4.7.3 backup: a deal whose rent roll came from an OM gets a Data QC record saying it was read before the checks; nothing else changes', () => {
  const b = load('4.7.3');
  assert.equal(b.deals.length, 2);
  const om = b.deals.find((d) => (d.rentRoll || []).length);
  const other = b.deals.find((d) => !(d.rentRoll || []).length);
  assert.equal(om.rrQc, undefined, 'saved by 4.7.3 without one');
  assert.equal(om.schema, 2);
  assert.deepEqual(pending(other).map((s) => s.id), ['rr-pdf-source', 'fee-record', 'credit-record'], 'a deal with no OM rent roll needs only the markers');
  const before = JSON.parse(JSON.stringify(om));
  const applied = migrateDeal(om, { today: TODAY });
  assert.deepEqual(applied.map((x) => x.id), ['rr-qc', 'rr-pdf-source', 'fee-record', 'credit-record']);
  assert.deepEqual(applied[0].rounded, []);
  assert.equal(om.schema, 6);
  assert.equal(om.rrQc.legacy, true);
  assert.deepEqual(om.rrQc.pages, [before.rentRollPage]);
  assert.equal(om.rrQc.page, before.rentRollPage);
  assert.deepEqual(om.rrQc.checks, [], 'no checks are made up for a reading that was never checked');
  assert.equal(om.rrQc.held, null, 'nothing held back: the rent roll it had stays in use');
  // everything the deal had is kept exactly: the step only adds
  const { rrQc, schema, ...rest } = om;
  const { schema: s0, ...rest0 } = before;
  assert.deepEqual(rest, rest0);
  assert.deepEqual(migrateDeal(om, { today: TODAY }), [], 'and runs once');
  // this version knows schema 4 (4.7.3 would refuse a backup holding it, as the registry guards every step)
  assert.ok(!tooNew(om));
});

/* ------------------------------------------------ rent roll PDFs (4.7.23, schema 4) */

import { buildBackup } from '../app/backup.js';
import { fromOmRows, rentRollSummary } from '../app/lease.js';

test('4.7.20 backup: deals made before rent roll PDFs need only the marker; their leases keep their sources exactly, and it runs once', () => {
  const b = load('4.7.20');
  assert.equal(b.deals.length, 2);
  const kinds = new Set();
  for (const d of b.deals) {
    assert.deepEqual(pending(d).map((s) => s.id), ['rr-pdf-source', 'fee-record', 'credit-record'], `${d.name}: only the markers`);
    for (const L of d.rr.leases) kinds.add(L.source && L.source.kind);
    const before = JSON.parse(JSON.stringify(d));
    const applied = migrateDeal(d, { today: TODAY });
    assert.deepEqual(applied.map((x) => x.id), ['rr-pdf-source', 'fee-record', 'credit-record']);
    assert.deepEqual(applied[0].rounded, []);
    assert.equal(d.schema, 6);
    const { schema, ...rest } = d;
    const { schema: s0, ...rest0 } = before;
    assert.deepEqual(rest, rest0, 'everything the deal had is kept exactly: the step only marks the version');
    assert.deepEqual(migrateDeal(d, { today: TODAY }), [], 'and runs once');
  }
  assert.deepEqual([...kinds].sort(), ['import', 'om'], 'the two kinds of lease source that existed before PDFs');
});

test('restoring a 4.7.20 backup says what it does to each deal, and changes nothing in the backup itself', () => {
  const b = load('4.7.20');
  const before = JSON.stringify(b.deals);
  assert.match(planRestore(b, empty).summary.join(' '), /2 deals saved by an older version are brought up to date as they are restored: ready for rent roll PDFs \(2\), ready for the fee record \(2\), ready for the credit record \(2\)./);
  assert.equal(JSON.stringify(b.deals), before);
});

test('a backup holding leases read from a rent roll PDF round-trips: the sources come back identical, nothing is pending, the summary is unchanged', async () => {
  const d = load('4.7.20').deals.find((x) => (x.rentRoll || []).length);
  migrateDeal(d, { today: TODAY });
  // the OM deal’s rows, read again as a rent roll PDF of its own
  const pdf = fromOmRows(d.rentRoll, { asOf: TODAY, kind: 'pdf', file: 'dd-rent-roll.pdf', page: 1 });
  d.rr = { ...d.rr, leases: pdf.leases };
  assert.ok(d.rr.leases.every((L) => L.source.kind === 'pdf' && L.source.file === 'dd-rent-roll.pdf'));
  const text = JSON.stringify(await buildBackup({ deals: [d], appVersion: '4.7.23' }));
  const back = readBackup(text);
  assert.equal(back.deals.length, 1);
  assert.deepEqual(pending(back.deals[0]), [], 'nothing left to do: it is already current');
  assert.deepEqual(back.deals[0].rr.leases.map((L) => L.source), d.rr.leases.map((L) => L.source));
  const put = planRestore(back, empty).deals.put[0];
  assert.deepEqual(put.rr.leases.map((L) => L.source), d.rr.leases.map((L) => L.source));
  assert.deepEqual(rentRollSummary(put.rr, TODAY), rentRollSummary(d.rr, TODAY));
  assert.ok(!/older version/.test(planRestore(back, empty).summary.join(' ')));
});

test('an app that knows schema 6 reads a deal with PDF sources; a deal saved by a newer schema is still refused', () => {
  const d = load('4.7.20').deals[0];
  migrateDeal(d, { today: TODAY });
  assert.ok(!tooNew(d));
  assert.ok(tooNew({ ...d, schema: 7 }));
});

/* ------------------------------------------------ the fee record (schema 5) */

test('4.7.56 backup: the fee-record step only marks the deal as schema 5; every other field is byte-identical, it runs once, and no fee is made up', () => {
  const b = load('4.7.56');
  assert.equal(b.deals.length, 2);
  for (const d of b.deals) {
    assert.equal(d.schema, 4);
    assert.deepEqual(pending(d).map((s) => s.id), ['fee-record', 'credit-record'], `${d.name}: nothing but the fee record is due`);
    const before = JSON.stringify(d);
    const applied = migrateDeal(d, { today: TODAY });
    assert.deepEqual(applied.map((x) => x.id), ['fee-record', 'credit-record']);
    assert.deepEqual(applied[0].rounded, []);
    assert.equal(d.schema, 6);
    assert.ok(!('fee' in d), 'a fee record is never invented');
    assert.equal(JSON.stringify({ ...d, schema: 4 }), before, 'everything else is as saved, key order included');
    assert.deepEqual(migrateDeal(d, { today: TODAY }), [], 'and runs once');
  }
});

test('the 4.7.56 backup restores with a line saying what the step does, and a schema 7 deal is refused', () => {
  const b = load('4.7.56');
  assert.match(planRestore(b, empty).summary.join(' '), /2 deals saved by an older version are brought up to date as they are restored: ready for the fee record \(2\), ready for the credit record \(2\)\./);
  const raw = JSON.parse(fs.readFileSync(FIX + BACKUPS['4.7.56'], 'utf8'));
  raw.deals[1].schema = 7;
  assert.throws(() => readBackup(raw), /a deal saved by a newer version.*Invented Court.*Nothing was restored/);
});

/* ------------------------------------------------ the credit record (schema 6) */

test('4.7.64 backup: the credit-record step only marks the deal as schema 6; every other field is as saved, it runs once, no credit record is made up', () => {
  const b = load('4.7.64');
  assert.equal(b.deals.length, 2);
  for (const d of b.deals) {
    assert.equal(d.schema, 5);
    assert.deepEqual(pending(d).map((s) => s.id), ['credit-record'], `${d.name}: nothing but the credit record is due`);
    const before = JSON.stringify(d);
    const hist = (d.history || []).length;
    const applied = migrateDeal(d, { today: TODAY });
    assert.deepEqual(applied.map((x) => x.id), ['credit-record']);
    assert.deepEqual(applied[0].rounded, []);
    assert.equal(d.schema, 6);
    assert.ok(!('credit' in d), 'a credit record is never invented');
    assert.equal((d.history || []).length, hist, 'no history entry: the step is silent');
    assert.equal(JSON.stringify({ ...d, schema: 5 }), before, 'everything else is as saved, key order included');
    assert.deepEqual(migrateDeal(d, { today: TODAY }), [], 'and runs once');
  }
});

test('an app from before the credit record (newest schema 5) refuses a migrated deal rather than dropping its credit data', () => {
  const old = Math.max(...MIGRATIONS.filter((s) => s.id !== 'credit-record').map((s) => s.to));
  assert.equal(old, 5);
  const [d] = load('4.7.64').deals;
  migrateDeal(d, { today: TODAY });
  assert.ok(d.schema > old, 'what the old app would call too new');
  assert.ok(!tooNew(d));
  assert.ok(tooNew({ ...d, schema: 7 }));
});

test('a credit record survives a backup and its restore, deep-equal', async () => {
  const d = load('4.7.64').deals[0];
  migrateDeal(d, { today: TODAY });
  d.credit = { v: 1, leaseEntity: 'Example Cafe LLC', leaseId: 'l1', parent: '', guarantor: { name: 'Example Holdings', scope: 'limited', limit: '24 months of rent', endsOn: '2028-12-31' },
    ratings: [{ id: 'r1', of: 'guarantor', agency: 'sp', agencyName: '', rating: 'BBB-', outlook: 'stable', asOf: '2026-09-30', source: 'agency site, invented', typedOn: '2026-10-29' }],
    sales: { annual: 1234567.89, year: '2025', source: 'tenant statement' }, goDark: { state: 'yes', note: '' } };
  const back = readBackup(JSON.stringify(await buildBackup({ deals: [d], appVersion: '4.7.66' })));
  assert.deepEqual(back.deals[0].credit, d.credit);
  assert.deepEqual(pending(back.deals[0]), []);
  assert.deepEqual(planRestore(back, empty).deals.put[0].credit, d.credit);
});

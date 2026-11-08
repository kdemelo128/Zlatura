/* Start from documents (app/intake.js): staging, the same file twice, competing documents asked (never guessed),
 * the controlling document worked out from deal.dd, nothing used before "Use", a confidential deal making no AI call,
 * and hostile file names staying text. Invented names and text only. */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const I = await import('../app/intake.js');

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const info = (name, type, o = {}) => ({ name, kind: 'csv', size: 100, sha256: null, pages: null, refuse: null, verdict: { type, typeBy: type ? 'reader' : null, reader: type === 'rentroll' ? 'rrsheet' : type, looks: null, ask: [] }, ...o });

test('a file a reader recognised is staged with its kind, status word, reason and proposed use', () => {
  const p = I.newPlan();
  const it = I.stage(p, info('rr.csv', 'rentroll'), {});
  assert.equal(it.type, 'rentroll');
  assert.equal(it.confidence, 'Read');
  assert.equal(it.use, 'Use as rent roll');
  assert.equal(it.state, 'staged');
  assert.match(it.reason, /rent roll/);
  assert.equal(I.stage(p, info('t.csv', 't12'), {}).use, 'Use as T-12');
});

test('nothing is used before "Use": staging changes no deal registry and marks nothing used', () => {
  const p = I.newPlan();
  const deal = { dd: { docs: [] } };
  const before = JSON.stringify(deal);
  const it = I.stage(p, info('rr.csv', 'rentroll'), {}, deal.dd);
  assert.equal(JSON.stringify(deal), before);
  assert.equal(it.state, 'staged');
  assert.equal(I.readyItems(p, deal.dd).length, 1);
  assert.ok(I.markUsed(p, it.id));
  assert.equal(it.state, 'used');
  assert.equal(I.readyItems(p, deal.dd).length, 0);
});

test('the same file twice is flagged and kept once; so is a file already on the deal', () => {
  const p = I.newPlan();
  const a = I.stage(p, info('rr.csv', 'rentroll', { sha256: SHA_A }), {});
  const b = I.stage(p, info('copy of rr.csv', 'rentroll', { sha256: SHA_A }), {});
  assert.equal(a.state, 'staged');
  assert.equal(b.state, 'skipped');
  assert.match(b.dup, /same file as rr\.csv/);
  assert.equal(I.readyItems(p, null).length, 1);
  const dd = { docs: [{ name: 'old.csv', sha256: SHA_B, type: 'rentroll', status: 'read', read: { target: 'rr' } }] };
  const c = I.stage(p, info('again.csv', 'rentroll', { sha256: SHA_B }), {}, dd);
  assert.match(c.dup, /already on this deal/);
});

test('two rent rolls compete: the broker is asked, and nothing is ready until they choose', () => {
  const p = I.newPlan();
  const a = I.stage(p, info('rr-a.csv', 'rentroll', { sha256: SHA_A }), {});
  const b = I.stage(p, info('rr-b.csv', 'rentroll', { sha256: SHA_B }), {});
  const c = I.controlling(p, null, 'rentroll');
  assert.equal(c.ask, true);
  assert.equal(c.pick, null);
  assert.equal(I.usable(p, null, a), false);
  assert.deepEqual(I.questions(p, null).map((q) => q.kind), ['controlling']);
  assert.ok(I.choose(p, null, 'rentroll', b.id));
  assert.equal(I.controlling(p, null, 'rentroll').ask, false);
  assert.equal(I.usable(p, null, b), true);
  assert.equal(I.usable(p, null, a), false);
  assert.equal(I.choose(p, null, 'rentroll', 'nope'), false);
});

test('one rent roll and nothing on the deal is the controlling choice; leases never compete', () => {
  const p = I.newPlan();
  const a = I.stage(p, info('rr.csv', 'rentroll'), {});
  assert.equal(I.controlling(p, null, 'rentroll').pick, a);
  const l1 = I.stage(p, info('lease one.txt', 'lease', { sha256: SHA_A, kind: 'text' }), {});
  I.stage(p, info('lease two.txt', 'lease', { sha256: SHA_B, kind: 'text' }), {});
  assert.equal(I.choose(p, null, 'lease', l1.id), false);
  assert.equal(I.readyItems(p, null).filter((x) => x.type === 'lease').length, 2);
});

test('the controlling document comes from deal.dd: one already read and not superseded asks, a superseded one does not', () => {
  const read = { reader: 't12', target: 't12', checks: {} };
  const dd = { docs: [{ name: 'current.csv', type: 't12', status: 'read', read }] };
  const p = I.newPlan();
  const n = I.stage(p, info('new t12.csv', 't12', { sha256: SHA_A }), {}, dd);
  const c = I.controlling(p, dd, 't12');
  assert.equal(c.existing.name, 'current.csv');
  assert.equal(c.ask, true);
  assert.equal(I.usable(p, dd, n), false);
  assert.ok(I.choose(p, dd, 't12', I.KEEP));
  assert.equal(I.controlling(p, dd, 't12').keep, true);
  assert.equal(I.usable(p, dd, n), false);
  const p2 = I.newPlan();
  const n2 = I.stage(p2, info('new.csv', 't12'), {}, { docs: [{ ...dd.docs[0], status: 'superseded' }] });
  assert.equal(I.usable(p2, { docs: [{ ...dd.docs[0], status: 'superseded' }] }, n2), true);
  assert.equal(I.choose(p2, null, 't12', I.KEEP), false, 'nothing on the deal to keep');
});

test('a file no reader typed is asked, with the likely type first, and is not usable until answered', () => {
  const p = I.newPlan();
  const it = I.stage(p, info('notes.txt', null, { kind: 'text', verdict: { type: null, looks: 'lease', ask: ['lease', 'amendment', 'estoppel'] } }), {});
  assert.equal(it.confidence, 'Looks like');
  assert.equal(it.type, null);
  assert.equal(it.ask[0], 'lease');
  assert.equal(I.usable(p, null, it), false);
  assert.equal(I.answer(p, it.id, 'not-a-type'), false);
  assert.ok(I.answer(p, it.id, 'lease'));
  assert.equal(it.typeBy, 'broker');
  assert.equal(it.confidence, 'Asked');
  assert.equal(I.usable(p, null, it), true);
});

test('a refused file is skipped with its reason and never staged', () => {
  const p = I.newPlan();
  const it = I.stage(p, info('big.pdf', null, { refuse: 'That file is 90 MB.' }), {});
  assert.equal(it.state, 'skipped');
  assert.equal(it.refuse, 'That file is 90 MB.');
  assert.equal(I.readyItems(p, null).length, 0);
  assert.equal(I.skip(p, it.id), false);
});

test('the checklist says what is missing, found, asked, used, or already on the deal', () => {
  const p = I.newPlan();
  const dd = { docs: [{ name: 'om.pdf', type: 'om', status: 'read', read: {} }] };
  I.stage(p, info('rr-a.csv', 'rentroll', { sha256: SHA_A }), {});
  I.stage(p, info('rr-b.csv', 'rentroll', { sha256: SHA_B }), {});
  const s = Object.fromEntries(I.checklist(p, dd).map((x) => [x.type, x.status]));
  assert.deepEqual(s, { rentroll: 'ask', t12: 'missing', lease: 'missing', om: 'on the deal' });
});

test('stageFiles looks at each file in turn, reports progress, and a file that cannot be looked at is refused while the rest go on', async () => {
  const p = I.newPlan();
  const files = [{ name: 'ok.csv', size: 5 }, { name: 'bad.csv', size: 5 }];
  const steps = [];
  const bad = { getXlsx: async () => { throw new Error('x'); } };
  // no readable bytes: ddintake.intake throws on these stand-ins, which must be refused, not crash the batch
  await I.stageFiles(p, files, bad, null, (f, s) => steps.push(`${f.name}:${s}`));
  assert.deepEqual(steps, ['ok.csv:reading', 'ok.csv:failed', 'bad.csv:reading', 'bad.csv:failed']);
  assert.ok(p.items.every((x) => x.state === 'skipped' && /couldn’t be looked at/.test(x.refuse)));
});

test('a confidential deal makes no AI call: the guard says why, and staging never touches fetch', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (...a) => { calls.push(a); return Promise.reject(new Error('no network in this test')); };
  try {
    const p = I.newPlan();
    I.stage(p, info('rr.csv', 'rentroll'), {}, { docs: [] });
    I.markUsed(p, p.items[0].id);
    assert.match(await I.aiReason({ confidential: true }), /confidential/);
    assert.equal(await I.aiReason({ confidential: false }), null);
    assert.equal(calls.length, 0);
  } finally { globalThis.fetch = realFetch; }
});

test('a hostile file name stays plain text in the item and is never parsed', () => {
  const name = '<img src=x onerror=alert(1)>.csv';
  const p = I.newPlan();
  const it = I.stage(p, info(name, 'rentroll'), {});
  assert.equal(it.name, name);
  assert.equal(typeof it.name, 'string');
  const src = import.meta.url.replace('file://', '').replace(/tests\/intake\.test\.js$/, 'app/');
  return Promise.all(['intake.js', 'intakeui.js'].map(async (f) => {
    const text = (await import('node:fs')).readFileSync(src + f, 'utf8');
    assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(text), `${f} has an HTML sink`);
  }));
});

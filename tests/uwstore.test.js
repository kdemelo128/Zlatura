/* Quick underwritings (app/uwstore.js): the record, its caps, the figures it gives and Save as a deal. Invented figures throughout. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readScratch, cleanScratch, newScratch, work, dealFields, asDeal, loadScratch, saveScratch, deleteScratch, MAX_SCRATCH, KEY } from '../app/uwstore.js';
import { analyze, runScenario, scenarioAnswers, irr } from '../app/deal.js';
import { analysisInput } from '../app/impact.js';
import { KV_MIGRATIONS, kvTooNew } from '../app/migrate.js';

const mem = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, set: async (k, v) => { if (v === null || v === undefined) m.delete(k); else m.set(k, structuredClone(v)); return true; }, m }; };
const LOAN = { ltv: 65, rate: 6.5, amort: 30, io: false, closing: 2, minDscr: 1.25, minDy: 8 };
const rec = (id, o = {}) => ({ ...newScratch({ loan: LOAN, now: 1_761_200_000_000 }), id, ...o });
const corner = () => rec('u1k9x2ab', { name: 'Quick look: corner retail (fictional)', figures: { price: 2400000, noi: 156000, bsf: 8000, ptype: 'Retail' }, live: { hold: 5, growth: 2, exitCap: 7, saleCost: 2 } });

test('a new quick underwriting has the proposal’s shape: blank is absent, targets 7% and 15%', () => {
  const r = newScratch({ loan: LOAN, now: 5 });
  assert.deepEqual(Object.keys(r).sort(), ['createdAt', 'figures', 'id', 'live', 'loan', 'name', 'targets', 'updatedAt', 'v']);
  assert.equal(r.v, 1);
  assert.deepEqual(r.figures, {});
  assert.deepEqual(r.live, {});
  assert.deepEqual(r.targets, { cap: 7, irr: 15 });
  assert.match(r.id, /^[a-z0-9]{1,40}$/);
  assert.deepEqual(newScratch().loan, {}, 'no loan terms given, none stored');
});

test('the corner retail example: 6.50% cap, $300.00 per SF, from the engine', () => {
  const { m, run } = work(corner());
  assert.equal(m.capCalc, 6.5);
  assert.equal(m.ppsf, 300);
  assert.equal(m.loan, 1560000);
  assert.ok(m.dscr > 1.2 && m.dscr < 1.4);
  assert.ok(run.returns && Number.isFinite(run.returns.leveredIrr));
});

test('a blank price stays blank: no figures from nothing, never a zero', () => {
  const { m, run, answers } = work(rec('u2'));
  for (const k of ['capCalc', 'ppsf', 'loan', 'dscr', 'debtYield', 'cashOnCash']) assert.equal(m[k] ?? null, null, k);
  assert.equal(run.returns, null);
  assert.equal(answers.priceForCap ?? null, null);
  const growth0 = readScratch({ ...corner(), live: { growth: 0 } });
  assert.equal(growth0.live.growth, 0, 'a growth of 0 is a real value and is kept');
});

test('the figures equal a deal made from the same inputs (analyze, runScenario, scenarioAnswers)', () => {
  for (const u of [corner(), rec('u3', { figures: { price: 1000000.1, noi: 72000, units: 12 }, loan: { ...LOAN, io: true }, live: { hold: 7, growth: 0, saleCost: 0 } }), rec('u4', { figures: { price: 900000, noi: 50000 }, loan: {} })]) {
    const f = dealFields(u);
    // the deal newDeal() makes, with these fields over it
    const deal = { rentRoll: [], live: {}, scenarios: [], ...f };
    const input = analysisInput(deal);
    const m = analyze(input, null);
    const run = runScenario(input, m, deal.live);
    const a = scenarioAnswers(input, m, deal.live, { targetCap: deal.targets.cap, targetIrr: deal.targets.irr });
    const w = work(u);
    assert.deepEqual(w.m, m);
    // the loan terms read as absent here and null on the deal: the same to the engine, so the results are compared, not the inputs echoed back
    assert.deepEqual(w.run.m, run.m);
    assert.deepEqual(w.run.returns, run.returns);
    assert.equal(w.answers.priceForCap, a.priceForCap);
    assert.equal(w.answers.priceForIrr, a.priceForIrr);
  }
});

test('Save as a deal: fields typed by hand, money in whole cents, loan terms exactly as entered', () => {
  const f = dealFields(rec('u5', { name: 'Quick one', figures: { price: 1000000.105, noi: 72000, ptype: 'Retail' }, loan: { ltv: 60, rate: 6, io: true } }));
  assert.equal(f.name, 'Quick one');
  assert.equal(f.figures.price, 1000000.11, 'whole cents');
  assert.deepEqual(f.sources, { price: { hand: true }, noi: { hand: true }, ptype: { hand: true } });
  assert.deepEqual(f.loan, { ltv: 60, rate: 6, amort: null, closing: null, minDscr: null, minDy: null, io: true }, 'a blank stays blank, it is not given a default');
  assert.deepEqual(f.targets, { cap: 7, irr: 15, value: null });
  assert.ok(!('cap' in f.figures) && !('price_psf' in f.figures), 'no figure the broker did not type');
});

test('a record is read defensively: wrong types, odd ids, long names and non-finite numbers are refused', () => {
  assert.ok(readScratch(corner()));
  for (const bad of [null, 'x', 5, [], { ...corner(), id: 'Has Space' }, { ...corner(), id: '' }, { ...corner(), id: 'a'.repeat(41) }, { ...corner(), name: 'n'.repeat(201) }, { ...corner(), name: 5 },
    { ...corner(), figures: { price: NaN } }, { ...corner(), figures: { price: Infinity } }, { ...corner(), figures: { price: '2400000' } }, { ...corner(), figures: { price: null } },
    { ...corner(), loan: { io: 'yes' } }, { ...corner(), figures: [] }, { ...corner(), v: 0 }, { ...corner(), v: undefined }]) assert.equal(readScratch(bad), null, JSON.stringify(bad).slice(0, 60));
  const x = readScratch({ ...corner(), extra: 1, figures: { ...corner().figures, evil: 9 } });
  assert.ok(!('extra' in x) && !('evil' in x.figures), 'only what is known is read');
  assert.equal(readScratch({ ...corner(), name: 'n'.repeat(200) }).name.length, 200);
});

test('a record from a newer version is kept as it is, not shown, never rewritten', async () => {
  const future = { ...corner(), id: 'ufuture', v: 2, somethingNew: { a: 1 } };
  assert.deepEqual(readScratch(future), { ahead: true });
  assert.ok(kvTooNew(KEY, future) && !kvTooNew(KEY, corner()));
  const s = mem();
  await s.set(KEY, [future, corner()]);
  const shown = await loadScratch(s);
  assert.deepEqual(shown.items.map((x) => x.id), ['u1k9x2ab']);
  assert.equal(shown.hidden, 1);
  await saveScratch({ ...corner(), name: 'edited' }, s);
  assert.deepEqual(s.m.get(KEY).find((x) => x.id === 'ufuture'), future, 'the newer record is untouched');
  await assert.rejects(saveScratch({ ...corner(), id: 'ufuture' }, s), /newer version/);
  const c = cleanScratch([future, corner()]);
  assert.deepEqual(c.list.find((x) => x.id === 'ufuture'), future);
  assert.deepEqual(KV_MIGRATIONS, [], 'no kv migration step yet');
});

test('the cap is 100: the 101st is refused, never trimmed; a backup list over it is cut and counted', async () => {
  const s = mem();
  for (let i = 0; i < MAX_SCRATCH; i++) await saveScratch(rec(`u${i}`, { createdAt: i }), s);
  assert.equal(s.m.get(KEY).length, 100);
  await assert.rejects(saveScratch(rec('uextra'), s), /100 quick underwritings/);
  await saveScratch({ ...rec('u5', { createdAt: 5 }), name: 'still editable' }, s);
  assert.equal(s.m.get(KEY).length, 100);
  const over = cleanScratch(Array.from({ length: 103 }, (_, i) => rec(`o${i}`, { createdAt: i })));
  assert.equal(over.list.length, 100);
  assert.equal(over.dropped, 3);
  assert.deepEqual(over.list[0].id, 'o102', 'newest kept');
});

test('cleanScratch drops what cannot be read, and a repeated id, and counts them', () => {
  const c = cleanScratch([corner(), corner(), { id: 'BAD ID' }, 'junk', null, rec('u9')]);
  assert.deepEqual(c.list.map((x) => x.id).sort(), ['u1k9x2ab', 'u9']);
  assert.equal(c.dropped, 4);
  assert.deepEqual(cleanScratch(undefined), { list: [], dropped: 0 });
  assert.deepEqual(cleanScratch('x'), { list: [], dropped: 1 });
});

test('saving puts money in whole cents, keeps the list newest first, and deleting the last one clears the key', async () => {
  const s = mem();
  await saveScratch(rec('ua', { createdAt: 1, figures: { price: 1000000.104, noi: 70000.005 } }), s);
  await saveScratch(rec('ub', { createdAt: 2 }), s);
  assert.deepEqual(s.m.get(KEY).map((x) => x.id), ['ub', 'ua']);
  assert.deepEqual(s.m.get(KEY).find((x) => x.id === 'ua').figures, { price: 1000000.1, noi: 70000.01 });
  await deleteScratch('ub', s);
  await deleteScratch('ua', s);
  assert.ok(!s.m.has(KEY));
});

test('three prices add up in whole cents (the proposal’s cents check) and the IRR example holds', () => {
  const cents = [1000000.1, 2000000.2, 500000.03].map((x) => Math.round(x * 100)).reduce((a, b) => a + b, 0);
  assert.equal(cents, 350000033);
  assert.ok(Math.abs(irr([-100, 0, 150]) - 22.47) < 0.01);
});

test('asDeal never carries a rent roll or a T-12, so the card reads the typed figures only', () => {
  const d = asDeal(corner());
  assert.deepEqual(d.rentRoll, []);
  assert.ok(!('rr' in d) && !('t12' in d));
});

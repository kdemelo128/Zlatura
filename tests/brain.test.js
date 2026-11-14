/* Monal's brain (app/brain.js): the pure helpers (facts text, task mapping, number check), the support check and the
 * state machine, all against a stub engine: nothing is downloaded. Invented figures only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const B = await import('../app/brain.js');
const { QUESTIONS } = await import('../app/assistant.js');

const mem = (init = {}) => { let c = init; return { read: () => c, write: (x) => { c = x; }, get now() { return c; } }; };
const GOOD = { gpu: { requestAdapter: async () => ({ features: new Set(['shader-f16']), limits: { maxBufferSize: 4 * 2 ** 30 } }) }, ua: 'x' };

/** A stub engine: load reports progress in steps and can be held open; nothing leaves the process. */
function stub({ fail = false, hold = false } = {}) {
  const calls = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const eng = {
    calls, release,
    async load(id, onProgress) { calls.push(['load', id]); onProgress(0.25); onProgress(0.75); if (hold) await gate; if (fail) throw new Error('network down'); onProgress(1); },
    async chat(messages, { think }) { calls.push(['chat', messages.length, think]); return 'stub answer'; },
    async has() { return true; },
    async remove(id) { calls.push(['remove', id]); },
    terminate() { calls.push(['terminate']); },
  };
  return eng;
}

test('the three sizes, with their licence and minimum memory', () => {
  assert.deepEqual(B.MODELS.map((m) => m.label), ['Small', 'Standard', 'Large']);
  assert.deepEqual(B.MODELS.map((m) => m.minMB), [1403, 2037, 3432]);
  assert.ok(B.MODELS.every((m) => m.licence === 'Apache-2.0' && /^Qwen3-.*-q4f16_1-MLC$/.test(m.id) && /GB/.test(m.size)));
});

test('support: no WebGPU, with the Safari / iPhone wording, no adapter, no 16-bit, too little memory, and a good device', async () => {
  const none = await B.support(B.MODELS[1].id, { gpu: undefined, ua: 'Mozilla/5.0 Chrome' });
  assert.equal(none.ok, false); assert.match(none.why, /WebGPU/);
  const phone = await B.support(B.MODELS[0].id, { gpu: undefined, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)' });
  assert.match(phone.why, /iPhone or iPad it needs iOS 26 or later, in Safari/);
  const noAdapter = await B.support(B.MODELS[0].id, { gpu: { requestAdapter: async () => null } });
  assert.equal(noAdapter.ok, false); assert.match(noAdapter.why, /no graphics adapter/);
  const noF16 = await B.support(B.MODELS[0].id, { gpu: { requestAdapter: async () => ({ features: new Set(), limits: { maxBufferSize: 2 ** 32 } }) } });
  assert.match(noF16.why, /16-bit/);
  const small = { gpu: { requestAdapter: async () => ({ features: new Set(['shader-f16']), limits: { maxBufferSize: 512 * 2 ** 20 } }) } };
  assert.equal((await B.support(B.MODELS[0].id, small)).ok, false, '512 MB buffer is under half of 1403 MB');
  assert.equal((await B.support(B.MODELS[2].id, small)).ok, false);
  const mid = { gpu: { requestAdapter: async () => ({ features: new Set(['shader-f16']), limits: { maxBufferSize: 1.5 * 2 ** 30 } }) } };
  assert.equal((await B.support(B.MODELS[1].id, mid)).ok, true);
  assert.equal((await B.support(B.MODELS[2].id, mid)).ok, false, 'Large needs about 1.7 GB of buffer');
  assert.match((await B.support(B.MODELS[2].id, mid)).why, /Small size may fit/);
  const mem4 = await B.support(B.MODELS[2].id, { ...GOOD, deviceMemory: 4 });
  assert.equal(mem4.ok, false); assert.match(mem4.why, /4 GB of memory/);
  assert.equal((await B.support(B.MODELS[0].id, { ...GOOD, deviceMemory: 4 })).ok, true);
  const thrown = await B.support(B.MODELS[0].id, { gpu: { requestAdapter: async () => { throw new Error('x'); } } });
  assert.equal(thrown.ok, false);
  assert.equal((await B.support(B.MODELS[2].id, GOOD)).ok, true);
});

test('state machine: off -> checking -> downloading (progress) -> ready, kept; then removed', async () => {
  const eng = stub(); const st = mem(); const seen = [];
  const b = B.createBrain({ factory: async () => eng, env: () => GOOD, storage: st });
  b.subscribe((s) => seen.push(`${s.phase}:${s.progress}`));
  assert.equal(b.state.phase, 'off');
  assert.equal(b.state.model, B.DEFAULT_MODEL);
  await b.turnOn();
  assert.deepEqual(seen, ['checking:0', 'downloading:0', 'downloading:0.25', 'downloading:0.75', 'downloading:1', 'ready:1']);
  assert.deepEqual(st.now, { model: B.DEFAULT_MODEL, on: true });
  assert.deepEqual(eng.calls[0], ['load', B.DEFAULT_MODEL]);
  assert.equal(await b.chat([{ role: 'user', content: 'hi' }], { think: true }), 'stub answer');
  assert.deepEqual(eng.calls.at(-1), ['chat', 1, true]);
  assert.equal(eng.calls.filter((c) => c[0] === 'load').length, 1, 'already in the chip: not loaded again');
  await b.remove();
  assert.equal(b.state.phase, 'removed');
  assert.deepEqual(st.now, { model: B.DEFAULT_MODEL, on: false });
  assert.ok(eng.calls.some((c) => c[0] === 'remove' && c[1] === B.DEFAULT_MODEL));
  await assert.rejects(() => b.chat([{ role: 'user', content: 'hi' }]), /not turned on/);
});

test('unsupported stops before any engine is made', async () => {
  let made = 0;
  const b = B.createBrain({ factory: async () => { made += 1; return stub(); }, env: () => ({ gpu: null, ua: '' }), storage: mem() });
  await b.turnOn();
  assert.equal(b.state.phase, 'unsupported'); assert.match(b.state.why, /WebGPU/);
  assert.equal(made, 0);
});

test('cancel stops a download and the late result is ignored; a failed download goes back to off with a reason', async () => {
  const eng = stub({ hold: true }); const st = mem();
  const b = B.createBrain({ factory: async () => eng, env: () => GOOD, storage: st });
  const p = b.turnOn();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(b.state.phase, 'downloading'); assert.equal(b.state.progress, 0.75);
  b.cancel();
  assert.equal(b.state.phase, 'off'); assert.match(b.state.why, /Cancelled/);
  assert.ok(eng.calls.some((c) => c[0] === 'terminate'));
  eng.release(); await p;
  assert.equal(b.state.phase, 'off', 'the finished download does not turn it on');
  assert.deepEqual(st.now, {}, 'nothing kept');
  const f = B.createBrain({ factory: async () => stub({ fail: true }), env: () => GOOD, storage: mem() });
  await f.turnOn();
  assert.equal(f.state.phase, 'off'); assert.match(f.state.why, /did not finish \(network down\)/);
});

test('the choice is kept per device, survives a new brain, and a bad store is ignored', async () => {
  const st = mem({ model: B.MODELS[2].id, on: true });
  const b = B.createBrain({ factory: async () => stub(), env: () => GOOD, storage: st });
  assert.equal(b.state.phase, 'ready'); assert.equal(b.state.model, B.MODELS[2].id);
  b.choose(B.MODELS[0].id);
  assert.equal(b.state.phase, 'off'); assert.deepEqual(st.now, { model: B.MODELS[0].id, on: false });
  const junk = B.createBrain({ factory: async () => stub(), storage: mem({ model: 'nope', on: 'yes' }) });
  assert.equal(junk.state.phase, 'off'); assert.equal(junk.state.model, B.DEFAULT_MODEL);
  // localStorage that throws: the default store never throws
  const real = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  try {
    const d = B.createBrain({ factory: async () => stub(), env: () => GOOD });
    assert.equal(d.state.phase, 'off');
    await d.turnOn();
    assert.equal(d.state.phase, 'ready');
  } finally { if (real === undefined) delete globalThis.localStorage; else globalThis.localStorage = real; }
});

test('a ready brain opens from the cache on the first question, with no download', async () => {
  const eng = stub(); const b = B.createBrain({ factory: async () => eng, storage: mem({ model: B.MODELS[0].id, on: true }) });
  assert.equal(eng.calls.length, 0);
  await b.chat([{ role: 'user', content: 'x' }]);
  assert.deepEqual(eng.calls.map((c) => c[0]), ['load', 'chat']);
});

test('factsText writes blank and missing values as "not given", never 0', () => {
  const t = B.factsText([
    { id: 'f1', label: 'Asking price', value: '$4,600,000', source: 'OM page 3' },
    { id: 'f2', label: 'Taxes', value: '' },
    { id: 'f3', label: 'Insurance', value: null },
    { id: 'f4', label: 'Occupancy', value: undefined },
    { id: 'f5', label: 'Units', value: NaN },
    { id: 'f6', label: 'Vacancy', value: 0 },
  ]);
  assert.equal(t.split('\n')[0], 'f1. Asking price: $4,600,000 (OM page 3)');
  assert.match(t, /f2\. Taxes: not given/); assert.match(t, /f3\. Insurance: not given/);
  assert.match(t, /f4\. Occupancy: not given/); assert.match(t, /f5\. Units: not given/);
  assert.match(t, /f6\. Vacancy: 0$/, 'a real zero stays a zero');
  assert.ok(!/Taxes: 0|Insurance: 0/.test(t));
  assert.equal(B.factsText(null), 'No deal facts are given.');
});

test('taskPrompt lists every front-desk task, and parseTask reads the JSON answer', () => {
  const p = B.taskPrompt();
  for (const q of QUESTIONS) assert.ok(p.includes(`- ${q.id}:`), q.id);
  assert.match(p, /cap_at_price: .* Inputs: price\./);
  const ok = B.parseTask('{"task": "cap_at_price", "inputs": {"price": 4600000}}');
  assert.deepEqual(ok, { ok: true, task: 'cap_at_price', inputs: { price: 4600000 } });
  assert.deepEqual(B.parseTask('<think>hmm</think>\n```json\n{"task":"walt","inputs":{}}\n```'), { ok: true, task: 'walt', inputs: {} });
  assert.deepEqual(B.parseTask('Sure! {"task":"walt"} hope that helps'), { ok: true, task: 'walt', inputs: {} });
  assert.deepEqual(B.parseTask('{"task":"none"}'), { ok: true, task: null, inputs: {} });
});

test('parseTask: bad JSON, an unknown task and missing inputs each ask for what is missing', () => {
  for (const bad of ['', 'I think the cap rate', '{task: cap}', '{"task": 5}', '[1,2]', '{"inputs":{}}']) {
    const r = B.parseTask(bad);
    assert.equal(r.ok, false, bad); assert.equal(r.reason, 'bad-json'); assert.match(r.ask, /another way/);
  }
  const u = B.parseTask('{"task":"delete_everything","inputs":{}}');
  assert.equal(u.ok, false); assert.equal(u.reason, 'unknown-task');
  const m = B.parseTask('{"task":"cap_at_price","inputs":{}}');
  assert.equal(m.ok, false); assert.equal(m.reason, 'missing-inputs'); assert.deepEqual(m.missing, ['price']); assert.match(m.ask, /the price/);
  const blank = B.parseTask('{"task":"cap_at_price","inputs":{"price":""}}');
  assert.equal(blank.ok, false, 'a blank price is missing, not zero');
  const two = B.parseTask('{"task":"set_figure","inputs":{"field":"price"}}');
  assert.deepEqual(two.missing, ['value']);
  // only the tasks it is given are known
  assert.equal(B.parseTask('{"task":"walt"}', [{ id: 'dscr' }]).reason, 'unknown-task');
});

test('numberCheck: figures not in the facts are found, whatever the formatting', () => {
  const allowed = ['$1,200,000', '6.10%', 4600000, 'DSCR 1.35x', '12 units', 'OM page 3', 'Lease ends 2027-03-01'];
  const nc = (a) => B.numberCheck(a, allowed);
  assert.deepEqual(nc('The loan is $1,200,000 at 6.1%.'), []);
  assert.deepEqual(nc('About 1.2M of debt, 6.10% rate, 1200000 total.'), []);
  assert.deepEqual(nc('Asking price is $4.6M, or 4,600,000 dollars, or $4.6 million.'), []);
  assert.deepEqual(nc('The DSCR is 1.35x across 12 units on page 3.'), []);
  assert.deepEqual(nc('Rate 6.1 percent.'), []);
  // invented figures
  assert.deepEqual(nc('The loan is $1,350,000.'), ['$1,350,000']);
  assert.deepEqual(nc('The cap rate is 7.25% and NOI is $330,000.'), ['7.25%', '$330,000']);
  assert.deepEqual(nc('Roughly 8M of value'), ['8M']);
  assert.deepEqual(nc('There are 14 units'), ['14']);
  // not figures: years, one-digit numbers, list numbering, fact ids, dates
  assert.deepEqual(nc('1. In 2027 two leases end.\n2) See f12 and f3 for 3 tenants, dated 2026-11-12 or 3/15/2026.'), []);
  assert.deepEqual(nc('Built in 1998 and sold in 2031.'), [], 'years 1900-2100');
  assert.deepEqual(nc('In 2150 or 1899 maybe'), ['2150', '1899']);
  // rounding to the stated precision is not an invention; a different value is
  assert.deepEqual(B.numberCheck('about 1.2M', ['$1,234,567']), []);
  assert.deepEqual(B.numberCheck('about 1.3M', ['$1,234,567']), ['1.3M']);
  assert.deepEqual(B.numberCheck('7%', ['7.04%']), []);
  assert.deepEqual(B.numberCheck('7.1%', ['7.04%']), ['7.1%']);
  assert.deepEqual(B.numberCheck('a cap of 7%', []), ['7%']);
  assert.deepEqual(B.numberCheck('', ['1']), []);
  assert.deepEqual(B.numberCheck('The NOI is $330,000, so 8.5%, or 4,000, fine.', []), ['$330,000', '8.5%', '4,000'], 'a trailing comma is punctuation, not part of the figure');
});

test('stripThinking removes the model’s <think> block', () => {
  assert.equal(B.stripThinking('<think>\nlet me see\n</think>\n\nThe answer.'), 'The answer.');
  assert.equal(B.stripThinking('no tags'), 'no tags');
  assert.equal(B.stripThinking(null), '');
});

test('the vendored WebLLM is the published file, licensed, listed, and kept by the service worker on first use only', () => {
  const root = new URL('../', import.meta.url);
  const lib = fs.readFileSync(new URL('vendor/web-llm-0.2.87/web-llm.js', root));
  const sha = crypto.createHash('sha256').update(lib).digest('hex');
  const tp = fs.readFileSync(new URL('THIRD_PARTY.md', root), 'utf8');
  assert.ok(tp.includes(`${sha}  vendor/web-llm-0.2.87/web-llm.js`), 'THIRD_PARTY.md lists the SHA-256');
  assert.match(tp, /\| `vendor\/web-llm-0\.2\.87\/web-llm\.js` \|.*\| 0\.2\.87 \| Apache-2\.0 \|.*\| identical \|/);
  assert.match(fs.readFileSync(new URL('vendor/licenses/web-llm-0.2.87.LICENSE', root), 'utf8'), /Apache License/);
  const sw = fs.readFileSync(new URL('sw.js', root), 'utf8');
  const assets = sw.slice(sw.indexOf('const ASSETS'), sw.indexOf('];'));
  assert.ok(!assets.includes('web-llm'), 'not in the install list');
  assert.ok(['app/brain.js', 'app/brainui.js', 'app/brainworker.js'].every((f) => assets.includes(`'${f}'`)), 'the small app files are');
  // a fetch of it is answered cache first, and stored on first use under this release's cache name (fromNetwork -> CACHE)
  assert.match(sw, /const IMMUTABLE = \/\\\/\(vendor\|fonts\|icons\)\\\//);
  const IMMUTABLE = /\/(vendor|fonts|icons)\//;
  assert.ok(IMMUTABLE.test('/vendor/web-llm-0.2.87/web-llm.js'));
  assert.match(sw, /IMMUTABLE\.test\(url\.pathname\) \? cacheFirst\(e\.request\)/);
  assert.match(sw, /function fromNetwork[\s\S]*caches\.open\(CACHE\)\.then\(\(c\) => c\.put\(request, copy\)\)/);
});

/* ------------------------------------------------------------- phase 2: the bird */
const { understand } = await import('../app/assistant.js');
const U = (raw) => understand(raw, { today: new Date(2026, 10, 12) });

test('the brain may name only the tasks that answer from the deal, never one that changes it', () => {
  const ids = B.BRAIN_TASKS.map((t) => t.id);
  assert.deepEqual(ids.sort(), [...B.BRAIN_TASK_IDS].sort());
  for (const bad of ['set_figure', 'set_stage', 'next_step', 'add_contact', 'add_note', 'make_scenario', 'start_export', 'task', 'open_doc', 'doc_ask']) assert.ok(!ids.includes(bad), bad);
  const p = B.taskPrompt(B.BRAIN_TASKS);
  assert.ok(!/set_figure/.test(p)); assert.match(p, /metric is one of noiPsf, ppsf/); assert.match(p, /cap is a percent number/);
});

test('taskToQuestion puts the model’s inputs where understand() puts them, and asks rather than choosing', () => {
  const t = (task, inputs) => B.taskToQuestion(task, inputs, U);
  assert.deepEqual(t('cap_at_price', { price: 4600000 }), { ok: true, q: { id: 'cap_at_price', price: 4600000, ambiguous: null } });
  assert.deepEqual(t('cap_at_price', { price: '$4,600,000' }).q.price, 4600000);
  assert.equal(t('cap_at_price', { price: 'cheap' }).ok, false);
  assert.equal(t('cap_at_price', { price: 0 }).ok, false);
  assert.deepEqual(t('commission', { price: 5e6 }).q, { id: 'commission', price: 5e6, ambiguous: null });
  assert.deepEqual(t('price_for_cap', { cap: 7 }).q, { id: 'price_for_cap', cap: 7 });
  const amb = t('price_for_cap', { cap: 0.07 });
  assert.equal(amb.ok, false); assert.match(amb.ask, /7% cap rate, or 0\.07%/);
  assert.deepEqual(t('metric', { metric: 'ppsf' }).q, { id: 'metric', metric: 'ppsf' });
  assert.equal(t('metric', { metric: 'banana' }).ok, false);
  assert.deepEqual(t('dscr', {}).q, { id: 'dscr', which: 'dscr' });
  assert.deepEqual(t('dscr', { which: 'maxLoan' }).q, { id: 'dscr', which: 'maxLoan' });
  assert.deepEqual(t('expiries', { year: 2027 }).q, { id: 'expiries', year: 2027 });
  assert.deepEqual(t('expiries', { year: 'soon' }).q, { id: 'expiries', year: null });
  assert.equal(t('glossary', { term: 'DSCR' }).q.id, 'glossary');
  assert.equal(t('glossary', { term: 'zzyzx' }).ok, false);
  assert.equal(t('open', { name: 'the rent roll' }).q.id, 'open');
  assert.equal(t('walt', {}).q.id, 'walt');
  assert.equal(t('set_figure', { field: 'price', value: 1 }).ok, false, 'a task that changes a deal is not run from the brain');
});

test('talkPrompt carries the facts and the rules; splitByFigures marks each bad figure; visibleText waits for a closed think block', () => {
  const p = B.talkPrompt(B.factsText([{ id: 'f1', label: 'NOI', value: '' }]));
  assert.match(p, /f1\. NOI: not given/); assert.match(p, /never guess/); assert.match(p, /do not make up any figure/);
  assert.deepEqual(B.splitByFigures('Cap is 7.25% and NOI $330,000 or 7.25% again.', ['7.25%', '$330,000']).filter((x) => x.bad).map((x) => x.text), ['7.25%', '$330,000', '7.25%']);
  assert.equal(B.splitByFigures('abc', []).map((x) => x.text).join(''), 'abc');
  assert.equal(B.splitByFigures('a 5% b', ['5%']).map((x) => x.text).join(''), 'a 5% b');
  assert.equal(B.visibleText('<think>\nhmm'), '');
  assert.equal(B.visibleText('<think>\nhmm</think>\n\nHi'), 'Hi');
  assert.equal(B.visibleText('Hi th'), 'Hi th');
});

test('chat passes the stream callback through; a load that fails turns the brain off with the reason', async () => {
  const eng = stub(); let got = null;
  eng.chat = async (m, o) => { got = o; o.onToken('par'); return 'full'; };
  const b = B.createBrain({ factory: async () => eng, storage: mem({ model: B.MODELS[0].id, on: true }) });
  const seen = [];
  assert.equal(await b.chat([{ role: 'user', content: 'x' }], { think: true, onToken: (t) => seen.push(t) }), 'full');
  assert.equal(got.think, true); assert.deepEqual(seen, ['par']); assert.equal(b.loaded, true);
  const bad = stub(); bad.load = async () => { throw new Error('cache empty'); };
  const c = B.createBrain({ factory: async () => bad, storage: mem({ model: B.MODELS[0].id, on: true }) });
  await assert.rejects(() => c.chat([{ role: 'user', content: 'x' }]), /cache empty/);
  assert.equal(c.state.phase, 'off'); assert.match(c.state.why, /could not start \(cache empty\)/);
});

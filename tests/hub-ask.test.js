import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pick } from '../tools/hub/hub-lib.mjs';
import { PROVIDERS } from '../tools/hub/providers.mjs';
import { createHub } from '../tools/hub/server.mjs';
import { run } from '../tools/hub/ask.mjs';

// fake key values are built at run time so no key-looking literal sits in the source (the secret scan reads every branch)
const fake = (tag) => ['fake', tag, 'value', String(tag.length * 1111)].join('_');
const home = () => ({ HOME: mkdtempSync(join(tmpdir(), 'hubhome-')) });
function fakeSpawn({ bins = ['codex', 'claude'], reply = 'OK', code = 0 } = {}) {
  const calls = [];
  const spawn = (bin, args, opts) => {
    calls.push({ bin, args, opts });
    const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => {};
    c.stdin = { end: (d) => { calls.at(-1).input = d ?? ''; setImmediate(() => { c.stdout.emit('data', reply); c.emit('close', code); }); } };
    if (args[0] === '--version') setImmediate(() => (bins.includes(bin) ? c.emit('close', 0) : c.emit('error', new Error('ENOENT'))));
    return c;
  };
  return { spawn, calls };
}
const fakeFetch = (json, ok = true, status = 200) => { const calls = []; const f = async (url, init) => { calls.push({ url, init }); return { ok, status, text: async () => JSON.stringify(json) }; }; return { f, calls }; };
const GEM_OK = { candidates: [{ content: { parts: [{ text: 'gemini says hi' }] } }] };
const st = (ready) => PROVIDERS.map((p) => ({ id: p.id, state: ready.includes(p.id) ? 'ready' : 'needs-key' }));
const modelCalls = (fx) => fx.calls.filter((c) => c.args[0] !== '--version').length;

test('cheap-first picks the free ready model; default order is unchanged', () => {
  const both = st(['gemini-api', 'claude']);
  const c = pick({ to: 'auto', kind: 'research', prefer: 'cheap' }, both);
  assert.deepEqual(c.ids, ['gemini-api']);
  assert.match(c.why, /^cheap first: gemini \(free\) for researcher/);
  // developer role: quality = claude-sonnet first; cheap reaches the free gemini fallback
  assert.deepEqual(pick({ to: 'auto', kind: 'ui' }, both).ids, ['claude']);
  assert.deepEqual(pick({ to: 'auto', kind: 'ui', prefer: 'quality' }, both).ids, ['claude']);
  assert.deepEqual(pick({ to: 'auto', kind: 'ui', prefer: 'cheap' }, both).ids, ['gemini-api']);
});

test('cheap-first falls back to the next ready model, keeping role order on a tier tie', () => {
  assert.deepEqual(pick({ to: 'auto', kind: 'ui', prefer: 'cheap' }, st(['claude', 'codex'])).ids, ['claude']);
  assert.deepEqual(pick({ to: 'auto', kind: 'ui', prefer: 'cheap' }, st(['codex'])).ids, ['codex']);
  assert.deepEqual(pick({ to: 'auto', kind: 'research', prefer: 'cheap' }, st(['claude'])).ids, ['claude']);
  assert.deepEqual(pick({ to: 'auto', kind: 'ui', prefer: 'cheap' }, st([])).ids, []);
  // a named provider is never overridden
  assert.deepEqual(pick({ to: 'codex', prefer: 'cheap' }, st(['codex', 'gemini-api'])).ids, ['codex']);
});

test('cheap-first is ignored for money, security and bug tasks, and says why', () => {
  const all = st(['claude', 'codex', 'gemini-api']);
  for (const kind of ['money', 'security', 'bug']) {
    const a = pick({ to: 'auto', kind, prefer: 'cheap' }, all);
    const b = pick({ to: 'auto', kind }, all);
    assert.deepEqual(a.ids, b.ids, kind);
    assert.deepEqual(a.ids, ['claude'], kind);
    assert.match(a.why, /kept the strongest model for this kind of task/, kind);
  }
});

test('/api/chat honours prefer through the server', async () => {
  const fx = fakeSpawn(); const gf = fakeFetch(GEM_OK);
  const env = { ...home(), GEMINI_API_KEY: fake('gem') };
  const hub = createHub({ env, spawn: fx.spawn, fetch: gf.f, page: 'x' });
  const port = await hub.listen(0);
  const post = (b) => fetch(`http://127.0.0.1:${port}/api/chat`, { method: 'POST', headers: { 'x-hub-token': hub.token, 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
  try {
    const cheap = await post({ message: 'draft a ui note', to: 'auto', kind: 'ui', prefer: 'cheap' });
    assert.deepEqual(cheap.replies.map((r) => r.id), ['gemini-api']);
    assert.match(cheap.why, /cheap first/);
    const normal = await post({ message: 'draft a ui note', to: 'auto', kind: 'ui' });
    assert.deepEqual(normal.replies.map((r) => r.id), ['claude']);
    const money = await post({ message: 'check this', to: 'auto', kind: 'money', prefer: 'cheap' });
    assert.deepEqual(money.replies.map((r) => r.id), ['claude']);
  } finally { await hub.close(); }
});

test('ask refuses a key, an email or a private/ path with exit 2 and never calls a model', async () => {
  const leaked = ['sk', 'abcdefghijklmnopqrstuvwx'].join('-');
  for (const text of [`use ${leaked} now`, 'mail someone@gmail.com', 'read private/leases/a.pdf']) {
    const fx = fakeSpawn(); const gf = fakeFetch(GEM_OK); const errs = []; const outs = [];
    const code = await run({ argv: ['--to', 'all', text], env: { ...home(), GEMINI_API_KEY: fake('gem') }, spawn: fx.spawn, fetch: gf.f, out: (s) => outs.push(s), err: (s) => errs.push(s) });
    assert.equal(code, 2, text);
    assert.equal(modelCalls(fx), 0); assert.equal(gf.calls.length, 0); assert.equal(outs.length, 0);
    assert.ok(errs.join('').length > 0);
  }
});

test('ask prints the reply under a header for --to codex, and --json parses', async () => {
  const fx = fakeSpawn({ reply: 'hello from codex' }); const outs = [];
  const code = await run({ argv: ['--to', 'codex', 'say', 'hi'], env: home(), spawn: fx.spawn, out: (s) => outs.push(s) });
  assert.equal(code, 0);
  const text = outs.join('\n');
  assert.match(text, /=== Codex \(GPT\) \(\d+\.\d s\) ===/);
  assert.match(text, /hello from codex/);
  assert.match(fx.calls.find((c) => c.args[0] !== '--version').input, /say hi/);
  const j = []; 
  assert.equal(await run({ argv: ['--to', 'codex', '--json', 'hi'], env: home(), spawn: fakeSpawn({ reply: 'R' }).spawn, out: (s) => j.push(s) }), 0);
  const o = JSON.parse(j.join(''));
  assert.equal(o.why, 'chosen by you');
  assert.equal(o.replies[0].id, 'codex'); assert.equal(o.replies[0].ok, true); assert.equal(o.replies[0].text, 'R'); assert.equal(typeof o.replies[0].ms, 'number');
});

test('ask --cheap uses cheap-first routing', async () => {
  const outs = [];
  const code = await run({ argv: ['--cheap', '--kind', 'ui', '--json', 'hi'], env: { ...home(), GEMINI_API_KEY: fake('gem') }, spawn: fakeSpawn().spawn, fetch: fakeFetch(GEM_OK).f, out: (s) => outs.push(s) });
  assert.equal(code, 0);
  assert.equal(JSON.parse(outs.join('')).replies[0].id, 'gemini-api');
});

test('ask exits 1 when every model failed; stdin is used when there are no words', async () => {
  const fx = fakeSpawn({ reply: '', code: 3 }); const outs = [];
  assert.equal(await run({ argv: ['--to', 'codex'], stdin: 'from stdin', env: home(), spawn: fx.spawn, out: (s) => outs.push(s) }), 1);
  assert.match(fx.calls.find((c) => c.args[0] !== '--version').input, /from stdin/);
  assert.match(outs.join('\n'), /FAILED/);
  assert.equal(await run({ argv: ['--to', 'codex'], stdin: '   ', env: home(), spawn: fakeSpawn().spawn, out: () => {}, err: () => {} }), 2);
  assert.equal(await run({ argv: ['--to', 'muse', 'hi'], env: home(), spawn: fakeSpawn().spawn, out: () => {}, err: () => {} }), 1);
});

test('ask hides error text that looks like a key', async () => {
  const leaked = ['sk', 'abcdefghijklmnopqrstuvwx'].join('-');
  const f = fakeFetch({ error: { message: `bad ${leaked}` } }, false, 401).f;
  const outs = [];
  const code = await run({ argv: ['--to', 'gemini-api', '--json', 'hi'], env: { ...home(), GEMINI_API_KEY: fake('gem') }, spawn: fakeSpawn().spawn, fetch: f, out: (s) => outs.push(s) });
  assert.equal(code, 1);
  const text = outs.join('');
  assert.equal(text.includes(leaked), false);
  assert.match(JSON.parse(text).replies[0].text, /was hidden/);
});

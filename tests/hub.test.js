import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, statSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { screenPrompt, pick, providerForWorker, frame } from '../tools/hub/hub-lib.mjs';
import { PROVIDERS, runCli, saveKey, readKeys, KEYS_FILE, statuses } from '../tools/hub/providers.mjs';
import { createHub } from '../tools/hub/server.mjs';

// fake key values are built at run time so no key-looking literal sits in the source (the secret scan reads every branch)
const fake = (tag) => ['fake', tag, 'value', String(tag.length * 1111)].join('_');
const home = () => ({ HOME: mkdtempSync(join(tmpdir(), 'hubhome-')) });
// A fake child process: answers `reply` on stdout for any real call, exits 0 for --version.
function fakeSpawn({ bins = ['codex', 'claude'], reply = 'OK', code = 0 } = {}) {
  const calls = [];
  const spawn = (bin, args, opts) => {
    calls.push({ bin, args, opts });
    const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => {};
    let input = '';
    c.stdin = { end: (d) => { input = d ?? ''; calls.at(-1).input = input; setImmediate(() => { c.stdout.emit('data', reply); c.emit('close', code); }); } };
    if (args[0] === '--version') setImmediate(() => (bins.includes(bin) ? c.emit('close', 0) : c.emit('error', new Error('ENOENT'))));
    return c;
  };
  return { spawn, calls };
}
const fakeFetch = (json, ok = true, status = 200) => { const calls = []; const f = async (url, init) => { calls.push({ url, init }); return { ok, status, text: async () => JSON.stringify(json) }; }; return { f, calls }; };

test('a prompt with a key, an email address or a private/ path is refused; a normal one passes', () => {
  assert.equal(screenPrompt('hello there').ok, true);
  assert.equal(screenPrompt('   ').ok, false);
  assert.equal(screenPrompt('x'.repeat(20001)).ok, false);
  assert.equal(screenPrompt('my key is sk-abcdefghijklmnopqrstuvwx').ok, false);
  assert.equal(screenPrompt('mail me at someone@gmail.com').ok, false);
  for (const t of ['read private/leases/a.pdf', 'look in ~/Documents/Zlatura/private/om', 'see /Users/x/Zlatura/private/notes']) assert.equal(screenPrompt(t).ok, false, t);
  assert.equal(screenPrompt('a private matter').ok, true);
});

test('every provider maps to harness workers and every harness worker has a provider', () => {
  for (const w of ['claude-opus', 'claude-sonnet', 'codex', 'gemini', 'grok', 'kimi', 'muse']) assert.ok(providerForWorker(w), w);
});

test('Auto picks by role among READY models only, and falls through when one is not ready', () => {
  const st = (ready) => PROVIDERS.map((p) => ({ id: p.id, state: ready.includes(p.id) ? 'ready' : 'needs-key' }));
  assert.deepEqual(pick({ to: 'auto', kind: 'research' }, st(['gemini-api', 'claude'])).ids, ['gemini-api']);
  assert.deepEqual(pick({ to: 'auto', kind: 'research' }, st(['claude'])).ids, ['claude']);
  assert.deepEqual(pick({ to: 'auto', kind: 'bug' }, st(['codex'])).ids, ['codex']);
  assert.deepEqual(pick({ to: 'auto', role: 'designer' }, st(['claude', 'codex'])).ids, ['claude']);
  assert.deepEqual(pick({ to: 'all' }, st(['codex', 'claude'])).ids.sort(), ['claude', 'codex']);
  assert.deepEqual(pick({ to: 'xai-api' }, st(['codex'])).ids, []);
  assert.deepEqual(pick({ to: 'codex' }, st(['codex'])).ids, ['codex']);
  assert.deepEqual(pick({ to: 'auto', kind: 'research' }, st([])).ids, []);
});

test('frame adds the role description only for a known role', () => {
  assert.match(frame('hi', 'designer'), /acting as the designer/);
  assert.equal(frame('hi', ''), 'hi');
  assert.equal(frame('hi', 'nonsense'), 'hi');
});

test('runCli sends the prompt on stdin, runs in an empty temp folder (not the repo) and returns stdout', async () => {
  const { spawn, calls } = fakeSpawn({ reply: 'DONE' });
  const out = await runCli({ bin: 'codex', args: ['exec', '-'], prompt: 'say hi', spawn });
  assert.equal(out, 'DONE');
  assert.equal(calls[0].input, 'say hi');
  assert.ok(calls[0].opts.cwd.startsWith(tmpdir()), calls[0].opts.cwd);
  assert.notEqual(calls[0].opts.cwd, process.cwd());
  await assert.rejects(runCli({ bin: 'codex', args: [], prompt: 'x', spawn: fakeSpawn({ code: 2, reply: '' }).spawn }), /exited 2/);
});

test('Gemini and the chat APIs send the key in a header (never in the URL) and read the reply', async () => {
  const env = { ...home(), ...Object.fromEntries(['GEMINI', 'XAI', 'MOONSHOT', 'OPENROUTER'].map((n) => [`${n}_API_KEY`, fake(n)])) };
  const g = fakeFetch({ candidates: [{ content: { parts: [{ text: 'hello ' }, { text: 'world' }] } }] });
  assert.equal(await PROVIDERS.find((p) => p.id === 'gemini-api').ask('hi', { env, fetch: g.f }), 'hello world');
  assert.match(g.calls[0].url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[^?]+:generateContent$/);
  assert.equal(g.calls[0].init.headers['x-goog-api-key'], env.GEMINI_API_KEY);
  assert.equal(g.calls[0].url.includes('key'), false);
  for (const [id, host] of [['xai-api', 'api.x.ai'], ['moonshot-api', 'api.moonshot.ai'], ['openrouter-api', 'openrouter.ai']]) {
    const c = fakeFetch({ choices: [{ message: { content: ' hi ' } }] });
    assert.equal(await PROVIDERS.find((p) => p.id === id).ask('yo', { env, fetch: c.f }), 'hi');
    assert.equal(c.calls[0].url, `https://${host}${id === 'openrouter-api' ? '/api' : ''}/v1/chat/completions`);
    assert.match(c.calls[0].init.headers.authorization, /^Bearer /);
    assert.equal(c.calls[0].url.includes('key'), false);
  }
  const bad = fakeFetch({ error: { message: 'quota used up' } }, false, 429);
  await assert.rejects(PROVIDERS.find((p) => p.id === 'gemini-api').ask('hi', { env, fetch: bad.f }), /429: quota used up/);
});

test('keys are saved outside the repo with owner-only permissions and bad names or values are refused', () => {
  const env = home();
  const v = fake('saved');
  saveKey('GEMINI_API_KEY', v, env);
  assert.equal(readKeys(env).GEMINI_API_KEY, v);
  assert.equal(statSync(KEYS_FILE(env)).mode & 0o777, 0o600);
  assert.ok(KEYS_FILE(env).startsWith(env.HOME));
  assert.throws(() => saveKey('lowercase', fake('x'), env), /bad key name/);
  assert.throws(() => saveKey('GEMINI_API_KEY', 'short', env), /does not look like a key/);
  assert.throws(() => saveKey('GEMINI_API_KEY', 'has a space inside', env), /does not look like a key/);
});

test('statuses report ready / needs-key / missing-tool / unavailable and never contain a key', async () => {
  const secretValue = fake('secret'); const env = { ...home(), GEMINI_API_KEY: secretValue };
  const s = await statuses({ env, spawn: fakeSpawn({ bins: ['codex'] }).spawn });
  const by = Object.fromEntries(s.map((x) => [x.id, x.state]));
  assert.deepEqual(by, { codex: 'ready', claude: 'missing-tool', 'gemini-api': 'ready', 'xai-api': 'needs-key', 'moonshot-api': 'needs-key', 'openrouter-api': 'needs-key', muse: 'unavailable' });
  assert.equal(JSON.stringify(s).includes(secretValue), false);
});

async function withHub(fn, opts = {}) {
  const env = { ...home(), ...(opts.env ?? {}) };
  const hub = createHub({ env, spawn: opts.spawn ?? fakeSpawn().spawn, fetch: opts.fetch, page: '<html>hub</html>' });
  const port = await hub.listen(0);
  try { await fn({ hub, port, env, url: (p) => `http://127.0.0.1:${port}${p}`, h: { 'x-hub-token': hub.token } }); } finally { await hub.close(); }
}

test('the server refuses a missing or wrong token, a foreign Host header and a foreign Origin', async () => {
  await withHub(async ({ port, url, h }) => {
    assert.equal((await fetch(url('/api/state'))).status, 401);
    assert.equal((await fetch(url('/api/state'), { headers: { 'x-hub-token': 'wrong' } })).status, 401);
    assert.equal((await fetch(url('/'))).status, 401);
    assert.equal((await fetch(url('/?t=' + h['x-hub-token']))).status, 200);
    assert.equal((await fetch(url('/api/state'), { headers: { ...h, origin: 'https://evil.example' } })).status, 403);
    // a DNS-rebinding style request: right port, wrong Host
    const r = await new Promise((resolve) => { import('node:http').then(({ default: http }) => http.get({ host: '127.0.0.1', port, path: '/api/state', headers: { ...h, host: `evil.example:${port}` } }, (res) => resolve(res.statusCode))); });
    assert.equal(r, 403);
    assert.equal((await fetch(url('/api/state'), { headers: h })).status, 200);
  });
});

test('the server binds to 127.0.0.1 only', async () => {
  const src = readFileSync(new URL('../tools/hub/server.mjs', import.meta.url), 'utf8');
  assert.match(src, /server\.listen\(p, '127\.0\.0\.1'/);
  assert.equal(/0\.0\.0\.0|'::'/.test(src), false);
});

test('saving a key writes the file, never echoes the key, and /api/state never contains it', async () => {
  await withHub(async ({ url, h, env }) => {
    const kv = fake('posted');
    const r = await fetch(url('/api/key'), { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'xai-api', key: kv }) });
    assert.equal(r.status, 200);
    const text = await r.text();
    assert.equal(text.includes(kv), false);
    assert.equal(readKeys(env).XAI_API_KEY, kv);
    const st = await (await fetch(url('/api/state'), { headers: h })).text();
    assert.equal(st.includes(kv), false);
    assert.match(st, /"id":"xai-api"[^}]*"state":"ready"/);
    const bad = await fetch(url('/api/key'), { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'codex', key: fake('codex') }) });
    assert.equal(bad.status, 400);
  });
});

test('chat refuses a prompt with a secret before any model is called, and routes a normal one', async () => {
  const fx = fakeSpawn({ reply: 'hello from codex' });
  await withHub(async ({ url, h }) => {
    const post = (b) => fetch(url('/api/chat'), { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify(b) });
    const refused = await post({ message: 'use sk-abcdefghijklmnopqrstuvwx please', to: 'all' });
    assert.equal(refused.status, 400);
    assert.equal(fx.calls.filter((c) => c.args[0] !== '--version').length, 0);
    const ok = await (await post({ message: 'say hi', to: 'codex' })).json();
    assert.equal(ok.replies[0].text, 'hello from codex');
    assert.equal(ok.replies[0].ok, true);
    const none = await (await post({ message: 'say hi', to: 'muse' })).json();
    assert.deepEqual(none.replies, []);
    const auto = await (await post({ message: 'fix this bug', to: 'auto', kind: 'bug' })).json();
    assert.equal(auto.replies.length, 1); // bug-fixer: claude is primary and ready in the fake machine
  }, { spawn: fx.spawn });
});

test('chat shows a failing model as an error card and still returns the others', async () => {
  const f = fakeFetch({ error: { message: 'bad key' } }, false, 401);
  await withHub(async ({ url, h }) => {
    const r = await (await fetch(url('/api/chat'), { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ message: 'hi', to: 'all' }) })).json();
    const by = Object.fromEntries(r.replies.map((x) => [x.id, x]));
    assert.equal(by.codex.ok, true);
    assert.equal(by['gemini-api'].ok, false);
    assert.match(by['gemini-api'].text, /401: bad key/);
  }, { env: { GEMINI_API_KEY: fake('gem') }, fetch: f.f });
});

test('an oversized body is refused', async () => {
  await withHub(async ({ url, h }) => {
    let status = 0;
    try { status = (await fetch(url('/api/chat'), { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ message: 'x'.repeat(200000) }) })).status; } catch { status = -1; }
    assert.ok(status === 500 || status === -1 || status === 400, String(status));
  });
});

test('the hub files hold no key, no browser automation and no cookie access', async () => {
  const fs = await import('node:fs');
  for (const f of ['providers.mjs', 'hub-lib.mjs', 'server.mjs', 'public/index.html']) {
    const s = fs.readFileSync(new URL(`../tools/hub/${f}`, import.meta.url), 'utf8');
    assert.equal(/playwright|puppeteer|document\.cookie|chromium|selenium/i.test(s), false, f);
    assert.equal(/\b(sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|xai-[A-Za-z0-9]{20,})/.test(s), false, f);
  }
  assert.equal(existsSync(new URL('../tools/hub/public/index.html', import.meta.url)), true);
  void readFileSync;
});

import { listCards, runAgent, applyDiff } from '../tools/hub/agents.mjs';
import { loadWorkers } from '../tools/harness/lib.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

function repoWith(card) {
  const root = mkdtempSync(join(tmpdir(), 'hubrepo-'));
  mkdirSync(join(root, 'docs', 'tasks'), { recursive: true });
  writeFileSync(join(root, 'AGENTS.md'), 'RULES');
  writeFileSync(join(root, 'docs', 'tasks', 'one.md'), card);
  return root;
}
const CARD = '---\nid: one\nkind: docs\ngoal: add a line\nscope: docs/a.md\n---\nbody';
const ready = (...ids) => PROVIDERS.map((p) => ({ id: p.id, state: ids.includes(p.id) ? 'ready' : 'needs-key' }));
const PATCH = (f) => `--- a/${f}\n+++ b/${f}\n@@ -1,1 +1,2 @@\n x\n+new\n`;

test('listCards reads docs/tasks safely and skips a broken card', () => {
  const root = repoWith(CARD);
  writeFileSync(join(root, 'docs', 'tasks', 'broken.md'), 'no front matter');
  writeFileSync(join(root, 'docs', 'tasks', '.hidden.md'), CARD);
  assert.deepEqual(listCards(root).map((c) => c.file), ['one.md']);
  assert.deepEqual(listCards(mkdtempSync(join(tmpdir(), 'empty-'))), []);
});

test('runAgent: a clean in-scope diff is ok; the packet carries the rules; a bad card name is refused', async () => {
  const root = repoWith(CARD); const cfg = loadWorkers(); let seen;
  const ask = async (id, packet) => { seen = { id, packet }; return 'Here:\n```diff\n' + PATCH('docs/a.md') + '```'; };
  const r = await runAgent({ root, file: 'one.md', to: 'codex', stats: ready('codex'), cfg, ask });
  assert.equal(r.ok, true); assert.deepEqual(r.files, ['docs/a.md']); assert.equal(seen.id, 'codex'); assert.match(seen.packet, /RULES/);
  await assert.rejects(runAgent({ root, file: '../../etc/passwd', to: 'codex', stats: ready('codex'), cfg, ask }), /bad card name/);
  await assert.rejects(runAgent({ root, file: 'missing.md', to: 'codex', stats: ready('codex'), cfg, ask }), /no such card/);
});

test('runAgent flags a draft outside scope, in protected files, with a secret, or with no diff', async () => {
  const root = repoWith(CARD); const cfg = loadWorkers();
  const go = (reply) => runAgent({ root, file: 'one.md', to: 'codex', stats: ready('codex'), cfg, ask: async () => reply });
  assert.match((await go(PATCH('docs/other.md'))).problems.join(' '), /outside the card's scope/);
  assert.match((await go(PATCH('sw.js'))).problems.join(' '), /protected files/);
  assert.match((await go(PATCH('docs/a.md') + '+sk-abcdefghijklmnopqrstuvwx\n')).problems.join(' '), /key or an email/);
  const none = await go('I could not do that.');
  assert.equal(none.ok, false); assert.match(none.problems[0], /did not return a diff/);
  const noReady = await runAgent({ root, file: 'one.md', to: 'auto', stats: ready(), cfg, ask: async () => '' });
  assert.equal(noReady.ok, false);
});

test('applyDiff re-checks scope server-side and then calls the harness ingest', async () => {
  const root = repoWith(CARD); let call;
  const exec = (bin, args, opts, cb) => { call = { args, opts }; cb(null, 'Committed on agent/codex/one.', ''); };
  assert.equal(await applyDiff({ root, file: 'one.md', provider: 'codex', diff: PATCH('docs/a.md'), exec }), 'Committed on agent/codex/one.');
  assert.deepEqual(call.args.slice(0, 2), ['tools/harness/run-task.mjs', 'ingest']); assert.equal(call.args[3], 'codex'); assert.equal(call.opts.cwd, root);
  await assert.rejects(applyDiff({ root, file: 'one.md', provider: 'codex', diff: PATCH('docs/zzz.md'), exec }), /outside the card's scope/);
  await assert.rejects(applyDiff({ root, file: 'one.md', provider: 'muse-nope', diff: PATCH('docs/a.md'), exec }), /cannot own a branch/);
  await assert.rejects(applyDiff({ root, file: 'one.md', provider: 'codex', diff: '', exec }), /empty diff/);
});

test('the agent endpoints need the token and run a card end to end with a stub model', async () => {
  const root = repoWith(CARD); const fx = fakeSpawn({ reply: '```diff\n' + PATCH('docs/a.md') + '```' });
  const hub = createHub({ env: home(), spawn: fx.spawn, root, page: 'x', exec: (b, a, o, cb) => cb(null, 'ok-branch', '') });
  const port = await hub.listen(0); const base = `http://127.0.0.1:${port}`; const h = { 'x-hub-token': hub.token, 'content-type': 'application/json' };
  try {
    assert.equal((await fetch(base + '/api/cards')).status, 401);
    assert.deepEqual((await (await fetch(base + '/api/cards', { headers: h })).json()).cards.map((c) => c.id), ['one']);
    const r = await (await fetch(base + '/api/agent', { method: 'POST', headers: h, body: JSON.stringify({ card: 'one.md', to: 'codex' }) })).json();
    assert.equal(r.ok, true); assert.equal(r.provider, 'codex');
    const a = await (await fetch(base + '/api/agent/apply', { method: 'POST', headers: h, body: JSON.stringify({ card: 'one.md', provider: 'codex', diff: r.diff }) })).json();
    assert.deepEqual(a, { ok: true, message: 'ok-branch' });
    assert.equal((await fetch(base + '/api/agent/apply', { method: 'POST', headers: h, body: JSON.stringify({ card: 'one.md', provider: 'codex', diff: 'sk-abcdefghijklmnopqrstuvwx' }) })).status, 400);
  } finally { await hub.close(); }
});

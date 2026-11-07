import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, statSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { screenPrompt, pick, providerForWorker, frame } from '../tools/hub/hub-lib.mjs';
import { PROVIDERS, runCli, saveKey, readKeys, KEYS_FILE, statuses } from '../tools/hub/providers.mjs';
import { createHub } from '../tools/hub/server.mjs';

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
  const env = { ...home(), GEMINI_API_KEY: 'g-key-12345678', XAI_API_KEY: 'x-key-12345678', MOONSHOT_API_KEY: 'm-key-12345678' };
  const g = fakeFetch({ candidates: [{ content: { parts: [{ text: 'hello ' }, { text: 'world' }] } }] });
  assert.equal(await PROVIDERS.find((p) => p.id === 'gemini-api').ask('hi', { env, fetch: g.f }), 'hello world');
  assert.match(g.calls[0].url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[^?]+:generateContent$/);
  assert.equal(g.calls[0].init.headers['x-goog-api-key'], 'g-key-12345678');
  assert.equal(g.calls[0].url.includes('key'), false);
  for (const [id, host] of [['xai-api', 'api.x.ai'], ['moonshot-api', 'api.moonshot.ai']]) {
    const c = fakeFetch({ choices: [{ message: { content: ' hi ' } }] });
    assert.equal(await PROVIDERS.find((p) => p.id === id).ask('yo', { env, fetch: c.f }), 'hi');
    assert.equal(c.calls[0].url, `https://${host}/v1/chat/completions`);
    assert.match(c.calls[0].init.headers.authorization, /^Bearer /);
    assert.equal(c.calls[0].url.includes('key'), false);
  }
  const bad = fakeFetch({ error: { message: 'quota used up' } }, false, 429);
  await assert.rejects(PROVIDERS.find((p) => p.id === 'gemini-api').ask('hi', { env, fetch: bad.f }), /429: quota used up/);
});

test('keys are saved outside the repo with owner-only permissions and bad names or values are refused', () => {
  const env = home();
  saveKey('GEMINI_API_KEY', 'abcdefgh12345678', env);
  assert.equal(readKeys(env).GEMINI_API_KEY, 'abcdefgh12345678');
  assert.equal(statSync(KEYS_FILE(env)).mode & 0o777, 0o600);
  assert.ok(KEYS_FILE(env).startsWith(env.HOME));
  assert.throws(() => saveKey('lowercase', 'abcdefgh12345678', env), /bad key name/);
  assert.throws(() => saveKey('GEMINI_API_KEY', 'short', env), /does not look like a key/);
  assert.throws(() => saveKey('GEMINI_API_KEY', 'has a space inside', env), /does not look like a key/);
});

test('statuses report ready / needs-key / missing-tool / unavailable and never contain a key', async () => {
  const env = { ...home(), GEMINI_API_KEY: 'secret-value-123456' };
  const s = await statuses({ env, spawn: fakeSpawn({ bins: ['codex'] }).spawn });
  const by = Object.fromEntries(s.map((x) => [x.id, x.state]));
  assert.deepEqual(by, { codex: 'ready', claude: 'missing-tool', 'gemini-api': 'ready', 'xai-api': 'needs-key', 'moonshot-api': 'needs-key', muse: 'unavailable' });
  assert.equal(JSON.stringify(s).includes('secret-value-123456'), false);
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
    const r = await fetch(url('/api/key'), { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'xai-api', key: 'xai-key-abcdefgh12345' }) });
    assert.equal(r.status, 200);
    const text = await r.text();
    assert.equal(text.includes('xai-key-abcdefgh12345'), false);
    assert.equal(readKeys(env).XAI_API_KEY, 'xai-key-abcdefgh12345');
    const st = await (await fetch(url('/api/state'), { headers: h })).text();
    assert.equal(st.includes('xai-key-abcdefgh12345'), false);
    assert.match(st, /"id":"xai-api"[^}]*"state":"ready"/);
    const bad = await fetch(url('/api/key'), { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'codex', key: 'abcdefgh12345678' }) });
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
  }, { env: { GEMINI_API_KEY: 'g-key-12345678' }, fetch: f.f });
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

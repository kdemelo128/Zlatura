import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, statSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROVIDERS, LIMITS, PLAN_USAGE, parseRetryAfter } from '../tools/hub/providers.mjs';
import { usageStore, USAGE_FILE, dayKey } from '../tools/hub/usage.mjs';
import { createHub } from '../tools/hub/server.mjs';
import { run } from '../tools/hub/ask.mjs';

// fake key values are built at run time so no key-looking literal sits in the source (the secret scan reads every branch)
const fake = (tag) => ['fake', tag, 'value', String(tag.length * 1111)].join('_');
const home = () => ({ HOME: mkdtempSync(join(tmpdir(), 'hubhome-')) });
const KEYS = { GEMINI_API_KEY: fake('gem'), XAI_API_KEY: fake('xai'), MOONSHOT_API_KEY: fake('moon'), OPENROUTER_API_KEY: fake('router') };
function fakeSpawn({ reply = 'OK', code = 0, errText = '' } = {}) {
  const calls = [];
  const spawn = (bin, args, opts) => {
    calls.push({ bin, args, opts });
    const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => {};
    c.stdin = { end: () => setImmediate(() => { if (errText) c.stderr.emit('data', errText); c.stdout.emit('data', code === 0 ? reply : ''); c.emit('close', code); }) };
    if (args[0] === '--version') setImmediate(() => c.emit('close', 0));
    return c;
  };
  return { spawn, calls };
}
const GEM = { candidates: [{ content: { parts: [{ text: 'gem says hi' }] } }], usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18 } };
const OAI = { choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 5, completion_tokens: 3 } };
/** One stand-in for every vendor API: Gemini and the OpenAI-style hosts. */
function fakeFetch({ status = 200, headers = {} } = {}) {
  const calls = [];
  const f = async (url) => {
    calls.push(url);
    const gem = String(url).includes('generativelanguage');
    const json = status === 200 ? (gem ? GEM : OAI) : { error: { message: 'slow down' } };
    return { ok: status < 400, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, text: async () => JSON.stringify(json) };
  };
  return { f, calls };
}
const today = (env, id) => usageStore(env).snapshot().providers[id]?.today;
const total = (env) => Object.values(usageStore(env).snapshot().providers).reduce((n, p) => n + p.today.requests, 0);

test('every askable provider is wrapped once, and the hub never calls an unwrapped ask', () => {
  for (const p of PROVIDERS) assert.equal(!!p.counted, p.kind !== 'none' && p.chat !== false, p.id);
  // the raw implementations are closed over: no other file may hold a second way to reach a model
  for (const f of ['server.mjs', 'ask.mjs', 'agents.mjs', 'hub-lib.mjs']) {
    const src = readFileSync(new URL(`../tools/hub/${f}`, import.meta.url), 'utf8');
    assert.equal(/runCli\(|postJson\(/.test(src), false, `${f} must reach models only through provider.ask`);
  }
});

test('every provider.ask path records exactly one request: direct, chat (one, all, auto, cheap), agent and npm run ask', async () => {
  const env = { ...home(), ...KEYS }; const fx = fakeSpawn({ reply: '```diff\n--- a/docs/a.md\n+++ b/docs/a.md\n@@ -1,1 +1,1 @@\n-x\n+y\n```' }); const ff = fakeFetch();
  const ids = PROVIDERS.filter((p) => p.counted).map((p) => p.id);
  assert.deepEqual(ids.sort(), ['claude', 'codex', 'gemini-api', 'moonshot-api', 'openrouter-api', 'xai-api']);
  // 1. direct
  for (const id of ids) {
    const before = today(env, id)?.requests ?? 0;
    await PROVIDERS.find((p) => p.id === id).ask('hi', { env, spawn: fx.spawn, fetch: ff.f });
    assert.equal(today(env, id).requests, before + 1, `direct ${id}`);
  }
  // 2. chat through the server: one named model, all ready models, auto, cheap-first
  const hub = createHub({ env, spawn: fx.spawn, fetch: ff.f, page: 'x' });
  const port = await hub.listen(0);
  const post = (b) => fetch(`http://127.0.0.1:${port}/api/chat`, { method: 'POST', headers: { 'x-hub-token': hub.token, 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
  try {
    let base = total(env);
    const one = await post({ message: 'hello', to: 'xai-api' }); assert.equal(one.replies.length, 1);
    assert.equal(total(env), base + 1, 'chat to one model'); base += 1;
    const all = await post({ message: 'hello', to: 'all' }); assert.equal(all.replies.length, ids.length);
    assert.equal(total(env), base + ids.length, 'chat to all ready models: one each'); base += ids.length;
    const auto = await post({ message: 'hello', to: 'auto', kind: 'research' }); assert.equal(auto.replies.length, 1);
    assert.equal(total(env), base + 1, 'auto'); base += 1;
    const cheap = await post({ message: 'hello', to: 'auto', kind: 'ui', prefer: 'cheap' }); assert.equal(cheap.replies.length, 1);
    assert.equal(total(env), base + 1, 'cheap-first'); base += 1;
    // 3. an agent run: one card, one model call
    const root = mkdtempSync(join(tmpdir(), 'hubrepo-'));
    mkdirSync(join(root, 'docs', 'tasks'), { recursive: true }); writeFileSync(join(root, 'AGENTS.md'), 'RULES');
    writeFileSync(join(root, 'docs', 'tasks', 'one.md'), '---\nid: one\nkind: docs\ngoal: add a line\nscope: docs/a.md\n---\nbody');
    const hub2 = createHub({ env, spawn: fx.spawn, fetch: ff.f, root, page: 'x' });
    const port2 = await hub2.listen(0);
    try {
      const r = await fetch(`http://127.0.0.1:${port2}/api/agent`, { method: 'POST', headers: { 'x-hub-token': hub2.token, 'content-type': 'application/json' }, body: JSON.stringify({ card: 'one.md', to: 'codex' }) }).then((x) => x.json());
      assert.equal(r.provider, 'codex');
      assert.equal(total(env), base + 1, 'agent run'); base += 1;
    } finally { await hub2.close(); }
    // 4. npm run ask (the command line shares the same file)
    const out = []; const code = await run({ argv: ['--to', 'all', 'hello'], env, spawn: fx.spawn, fetch: ff.f, out: (s) => out.push(s), err: () => {} });
    assert.equal(code, 0); assert.equal(total(env), base + ids.length, 'npm run ask --to all');
    base += ids.length;
    await run({ argv: ['--cheap', '--kind', 'ui', 'hello'], env, spawn: fx.spawn, fetch: ff.f, out: () => {}, err: () => {} });
    assert.equal(total(env), base + 1, 'npm run ask --cheap');
  } finally { await hub.close(); }
});

test('tokens: Gemini usageMetadata and OpenAI-style usage are counted once; CLI providers report none', async () => {
  const env = { ...home(), ...KEYS }; const fx = fakeSpawn(); const ff = fakeFetch();
  await PROVIDERS.find((p) => p.id === 'gemini-api').ask('hi', { env, fetch: ff.f });
  assert.deepEqual([today(env, 'gemini-api').inputTokens, today(env, 'gemini-api').outputTokens], [11, 7]);
  await PROVIDERS.find((p) => p.id === 'gemini-api').ask('hi', { env, fetch: ff.f });
  assert.deepEqual([today(env, 'gemini-api').inputTokens, today(env, 'gemini-api').outputTokens], [22, 14], 'two calls add, not four');
  for (const id of ['xai-api', 'moonshot-api', 'openrouter-api']) {
    await PROVIDERS.find((p) => p.id === id).ask('hi', { env, fetch: ff.f });
    assert.deepEqual([today(env, id).inputTokens, today(env, id).outputTokens, today(env, id).requests], [5, 3, 1], id);
  }
  await PROVIDERS.find((p) => p.id === 'codex').ask('hi', { env, spawn: fx.spawn });
  assert.deepEqual([today(env, 'codex').inputTokens, today(env, 'codex').outputTokens, today(env, 'codex').requests], [0, 0, 1]);
});

test('a failed call counts as an error; a 429 counts as a rate-limit hit and shows the retry-after', async () => {
  const env = { ...home(), ...KEYS }; const gem = PROVIDERS.find((p) => p.id === 'gemini-api');
  await assert.rejects(gem.ask('hi', { env, fetch: fakeFetch({ status: 500 }).f }), /500/);
  assert.deepEqual([today(env, 'gemini-api').requests, today(env, 'gemini-api').errors, today(env, 'gemini-api').rateLimited], [1, 1, 0]);
  assert.equal(usageStore(env).snapshot().providers['gemini-api'].rateLimitedNow, false);
  await assert.rejects(gem.ask('hi', { env, fetch: fakeFetch({ status: 429, headers: { 'retry-after': '30' } }).f }), /429/);
  const t = today(env, 'gemini-api');
  assert.deepEqual([t.requests, t.ok, t.errors, t.rateLimited], [2, 0, 2, 1]);
  const s = usageStore(env).snapshot().providers['gemini-api'];
  assert.equal(s.rateLimitedNow, true); assert.ok(s.retryAfterSec > 0 && s.retryAfterSec <= 30, String(s.retryAfterSec));
  await gem.ask('hi', { env, fetch: fakeFetch().f }); // a later success clears the badge
  assert.equal(usageStore(env).snapshot().providers['gemini-api'].rateLimitedNow, false);
  // a 429 without Retry-After is still "limited now" until the next success
  await assert.rejects(gem.ask('hi', { env, fetch: fakeFetch({ status: 429 }).f }), /429/);
  const s2 = usageStore(env).snapshot().providers['gemini-api']; assert.equal(s2.rateLimitedNow, true); assert.equal(s2.retryAfterSec, null);
  // a CLI that says it hit a limit
  await assert.rejects(PROVIDERS.find((p) => p.id === 'claude').ask('hi', { env, spawn: fakeSpawn({ code: 1, errText: 'Claude usage limit reached' }).spawn }), /exited 1/);
  assert.equal(today(env, 'claude').rateLimited, 1);
  assert.equal(parseRetryAfter('120'), 120); assert.equal(parseRetryAfter(null), null); assert.equal(parseRetryAfter('soon'), null);
  assert.equal(parseRetryAfter('Wed, 21 Oct 2026 07:28:30 GMT', Date.parse('Wed, 21 Oct 2026 07:28:00 GMT')), 30);
});

test('the usage file holds counts only: no prompt, reply, error text or key; owner-only; written atomically', async () => {
  const env = { ...home(), ...KEYS }; const marker = 'ZZ-distinct-prompt-marker'; const gem = PROVIDERS.find((p) => p.id === 'gemini-api');
  await gem.ask(marker, { env, fetch: fakeFetch().f });
  await assert.rejects(gem.ask(marker, { env, fetch: fakeFetch({ status: 429 }).f }));
  const file = USAGE_FILE(env); const text = readFileSync(file, 'utf8');
  for (const bad of [marker, 'gem says hi', 'slow down', ...Object.values(KEYS)]) assert.equal(text.includes(bad), false, bad);
  const j = JSON.parse(text);
  assert.deepEqual(Object.keys(j).sort(), ['days', 'last', 'version']);
  const c = j.days[dayKey(Date.now())]['gemini-api'];
  assert.deepEqual(Object.keys(c).sort(), ['errors', 'inputTokens', 'ok', 'outputTokens', 'rateLimited', 'requests']);
  assert.ok(Object.values(c).every((v) => Number.isInteger(v)));
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(join(env.HOME, '.zlatura-hub')).filter((f) => f.endsWith('.tmp')), []);
  // a hand-edited file cannot put text on the page
  writeFileSync(file, JSON.stringify({ days: { [dayKey(Date.now())]: { 'gemini-api': { requests: 'x<script>', ok: 2, errors: -4, evil: 'text' } } }, last: { 'gemini-api': { at: 1, ok: true, note: 'secret words' } } }));
  const s = usageStore(env).snapshot();
  assert.deepEqual(s.providers['gemini-api'].today, { requests: 0, ok: 2, errors: 0, rateLimited: 0, inputTokens: 0, outputTokens: 0 });
  assert.equal(JSON.stringify(s).includes('secret words'), false);
  writeFileSync(file, '{not json'); assert.deepEqual(usageStore(env).snapshot().providers, {});
});

test('old days are dropped after 60 days and days roll over at local midnight', () => {
  const env = home(); let t = new Date(2026, 5, 1, 23, 59, 0).getTime();
  const st = usageStore(env, () => t);
  st.record('codex', { ok: true });
  t = new Date(2026, 5, 2, 0, 1, 0).getTime();
  assert.equal(st.snapshot().providers.codex.today.requests, 0, 'a new day starts at zero');
  st.record('codex', { ok: true });
  assert.equal(st.snapshot().providers.codex.today.requests, 1);
  t = new Date(2026, 7, 20, 12, 0, 0).getTime(); st.record('codex', { ok: true });
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(st.file, 'utf8')).days), [dayKey(t)]);
});

test('/api/usage gives counts, the approximate limit with its source page, and a plan link, never a plan balance or a key', async () => {
  const env = { ...home(), ...KEYS }; const ff = fakeFetch(); const fx = fakeSpawn();
  const hub = createHub({ env, spawn: fx.spawn, fetch: ff.f, page: 'x' });
  const port = await hub.listen(0); const h = { 'x-hub-token': hub.token };
  try {
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/usage`)).status, 401);
    await PROVIDERS.find((p) => p.id === 'gemini-api').ask('hi', { env, fetch: ff.f });
    const text = await (await fetch(`http://127.0.0.1:${port}/api/usage`, { headers: h })).text();
    for (const k of Object.values(KEYS)) assert.equal(text.includes(k), false);
    const u = JSON.parse(text).providers;
    assert.equal(u['gemini-api'].today.requests, 1); assert.equal(u['gemini-api'].limit.perDay, LIMITS['gemini-api'].perDay);
    assert.match(u['gemini-api'].limit.url, /^https:\/\//); assert.equal(u.codex.limit.perDay, null);
    assert.equal(u.codex.tokens, 'not reported by this tool'); assert.equal(u.muse, undefined); assert.equal(u.github, undefined);
    assert.match(u.claude.plan.url, /^https:\/\/claude\.ai\//);
    assert.ok(Object.values(PLAN_USAGE).every((x) => x.url.startsWith('https://')));
    assert.equal(/balance|remaining credit/i.test(text), false, 'no plan balance is claimed');
  } finally { await hub.close(); }
});

test('a call that is running shows as in flight until it ends, even when it fails', async () => {
  const env = { ...home(), ...KEYS }; let release; const gate = new Promise((r) => { release = r; });
  const slow = async () => { await gate; return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(GEM) }; };
  const p = PROVIDERS.find((x) => x.id === 'gemini-api').ask('hi', { env, fetch: slow });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(usageStore(env).snapshot().providers['gemini-api'].inflight, 1);
  release(); await p;
  assert.equal(usageStore(env).snapshot().providers['gemini-api'].inflight, 0);
  await assert.rejects(PROVIDERS.find((x) => x.id === 'gemini-api').ask('hi', { env, fetch: async () => { throw new Error('offline'); } }));
  assert.equal(usageStore(env).snapshot().providers['gemini-api'].inflight, 0);
});

test('the page shows live usage: polls every 2 s, builds DOM safely, labels limits approximate, links to plan pages and never claims a plan balance', () => {
  const page = readFileSync(new URL('../tools/hub/public/index.html', import.meta.url), 'utf8');
  assert.match(page, /setInterval\(tick, 2000\)/); assert.match(page, /api\('\/api\/usage'\)/);
  assert.match(page, /document\.hidden/, 'it stops polling while the tab is hidden');
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(page));
  assert.match(page, /approximate and unverified/); assert.match(page, /rate-limited now/); assert.match(page, /rate-limit \(429\) hits/);
  assert.match(page, /not reported by this tool, requests only/);
  assert.match(page, /cannot read a plan balance|Plan balances \(Claude, ChatGPT\) are only on each provider's own page/);
  assert.match(page, /role: 'progressbar'/); assert.match(page, /'aria-valuenow'/);
  assert.match(page, /Open usage page/);
  assert.ok(!/remaining credit|you have \d+ left/i.test(page));
});

test('the page is a clean layout: fixed grid places, four tabs, light and dark, 44 px targets, visible focus, nothing wider than the screen', () => {
  const page = readFileSync(new URL('../tools/hub/public/index.html', import.meta.url), 'utf8');
  for (const id of ['tabChat', 'tabAgents', 'tabPr', 'tabJobs', 'chatView', 'agentView', 'prView', 'jobsView', 'project', 'projPanel']) assert.match(page, new RegExp(`id="${id}"`), id);
  assert.match(page, /role="tablist"/); assert.match(page, /aria-selected/);
  assert.match(page, /prefers-color-scheme:dark/); assert.match(page, /--touch:44px/); assert.match(page, /min-height:var\(--touch\)/);
  assert.match(page, /:focus-visible\{outline:3px/);
  assert.match(page, /@media\(max-width:760px\)/); assert.match(page, /overflow-wrap:anywhere/);
  assert.ok(!/body\{[^}]*display:grid/.test(page));
  assert.match(page, /protocol === 'https:'/); assert.match(page, /rel: 'noopener noreferrer'/);
});

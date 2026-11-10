import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROVIDERS } from '../tools/hub/providers.mjs';
import { connectSummary } from '../tools/hub/hub-lib.mjs';
import { createHub } from '../tools/hub/server.mjs';

// fake key values are built at run time so no key-looking literal sits in the source (the secret scan reads every branch)
const fake = (tag) => ['fake', tag, 'value', String(tag.length * 1111)].join('_');
const home = () => ({ HOME: mkdtempSync(join(tmpdir(), 'hubhome-')) });
function fakeSpawn({ bins = ['codex', 'claude'] } = {}) {
  const spawn = (bin, args) => {
    const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => {};
    c.stdin = { end: () => setImmediate(() => { c.stdout.emit('data', 'OK'); c.emit('close', 0); }) };
    if (args[0] === '--version') setImmediate(() => (bins.includes(bin) ? c.emit('close', 0) : c.emit('error', new Error('ENOENT'))));
    return c;
  };
  return { spawn };
}
const MODELS = PROVIDERS.filter((p) => p.chat !== false).length; // GitHub is a connect block, not a model
const HOSTS = ['github.com', 'chatgpt.com', 'docs.claude.com', 'aistudio.google.com', 'console.x.ai', 'platform.moonshot.ai', 'openrouter.ai'];

test('every provider has connect steps and a plain-string shape', () => {
  for (const p of PROVIDERS) {
    const c = p.connect;
    assert.ok(c, p.id);
    assert.ok(Array.isArray(c.steps) && c.steps.length >= 1 && c.steps.every((s) => typeof s === 'string' && s), p.id);
    assert.equal(typeof c.urlLabel, 'string', p.id);
    assert.equal(typeof c.free, 'string', p.id);
  }
});

test('every connect url is https, on the allowlist, with no query string; Muse has none', () => {
  for (const p of PROVIDERS) {
    const u = p.connect?.url;
    assert.ok(u === null || typeof u === 'string', p.id);
    if (u === null) continue;
    const x = new URL(u);
    assert.equal(x.protocol, 'https:', p.id);
    assert.ok(HOSTS.includes(x.hostname), p.id + ' ' + x.hostname);
    assert.equal(x.search, '', p.id); assert.equal(x.hash, '', p.id);
  }
  assert.equal(PROVIDERS.find((p) => p.id === 'muse').connect.url, null);
  for (const p of PROVIDERS.filter((x) => x.connect?.url)) assert.match(p.connect.urlLabel, /check the page is current/, p.id);
});

test('/api/state carries connect for each provider and a summary, and never a saved key', async () => {
  const env = home(); const kv = fake('connect');
  const hub = createHub({ env, spawn: fakeSpawn().spawn, page: '<html>hub</html>' });
  const port = await hub.listen(0); const h = { 'x-hub-token': hub.token, 'content-type': 'application/json' };
  try {
    const save = await fetch(`http://127.0.0.1:${port}/api/key`, { method: 'POST', headers: h, body: JSON.stringify({ provider: 'xai-api', key: kv }) });
    assert.equal(save.status, 200);
    const text = await (await fetch(`http://127.0.0.1:${port}/api/state`, { headers: h })).text();
    assert.ok(!text.includes(kv));
    const s = JSON.parse(text);
    for (const p of PROVIDERS) { const row = s.providers.find((x) => x.id === p.id); assert.deepEqual(row.connect, p.connect, p.id); }
    assert.equal(s.summary.total, MODELS);
    assert.equal(s.summary.ready, 3); // codex, claude (fake spawn) and the saved xai key
    assert.equal(s.summary.next, 'gemini-api');
  } finally { await hub.close(); }
});

test('connectSummary counts ready models and picks the first not-ready one with a page; Muse is never next', () => {
  const all = (ready) => PROVIDERS.map((p) => ({ id: p.id, chat: p.chat !== false, state: ready.includes(p.id) ? 'ready' : p.id === 'muse' ? 'unavailable' : 'needs-key' }));
  assert.deepEqual(connectSummary(all([])), { ready: 0, total: MODELS, next: 'codex' });
  assert.deepEqual(connectSummary(all(['codex', 'claude'])), { ready: 2, total: MODELS, next: 'gemini-api' });
  const nonMuse = PROVIDERS.filter((p) => p.id !== 'muse' && p.chat !== false).map((p) => p.id);
  assert.deepEqual(connectSummary(all(nonMuse)), { ready: nonMuse.length, total: MODELS, next: null });
  assert.equal(connectSummary([{ id: 'muse', state: 'unavailable' }]).next, null);
});

test('the page builds links safely: https only, noopener, no innerHTML', () => {
  const page = readFileSync(new URL('../tools/hub/public/index.html', import.meta.url), 'utf8');
  assert.match(page, /protocol === 'https:'/);
  assert.match(page, /rel: 'noopener noreferrer'/);
  assert.ok(!/innerHTML/.test(page));
});

test('the page layout does not depend on what sits directly under the body', () => {
  const page = readFileSync(new URL('../tools/hub/public/index.html', import.meta.url), 'utf8');
  // A browser extension can add an element to the body; if aside and main were
  // laid out by the body's grid, that element would take the first slot.
  assert.match(page, /<div id="app">\s*<aside>/);
  assert.match(page, /<\/main>\s*<\/div>\s*<script>/);
  assert.match(page, /#app>aside\{grid-column:1;grid-row:1\}/);
  assert.match(page, /#app>main\{grid-column:2;grid-row:1\}/);
  assert.ok(!/body\{[^}]*display:grid/.test(page));
});

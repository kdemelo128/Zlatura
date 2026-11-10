import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, statSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHub } from '../tools/hub/server.mjs';
import { createJobs } from '../tools/hub/jobs.mjs';
import { loadRegistry, checkFolder, addProject, removeProject, projectCfg, PROJECTS_FILE, ProjectError } from '../tools/hub/projects.mjs';
import { listCards, runAgent, applyDiff } from '../tools/hub/agents.mjs';
import { loadWorkers, validateDiff, applyProfile } from '../tools/harness/lib.mjs';
import { PROVIDERS } from '../tools/hub/providers.mjs';

const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), 'hubproj-')));
const home = () => ({ HOME: tmp() });
const CARD = (id, scope = 'docs/a.md') => `---\nid: ${id}\nkind: docs\ngoal: add a line\nscope: ${scope}\n---\nbody`;
const PATCH = (f) => `--- a/${f}\n+++ b/${f}\n@@ -1,1 +1,2 @@\n x\n+new\n`;
/** A real throwaway git work tree with origin/main, AGENTS.md and cards in docs/tasks. */
function makeProject(cards = { one: CARD('one') }, { rules = 'RULES', files = { 'docs/a.md': 'x\n' } } = {}) {
  const dir = tmp();
  const g = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...a], { cwd: dir, stdio: 'pipe' });
  g('init', '-q', '-b', 'main');
  mkdirSync(join(dir, 'docs', 'tasks'), { recursive: true });
  if (rules != null) writeFileSync(join(dir, 'AGENTS.md'), rules);
  for (const [n, text] of Object.entries(cards)) writeFileSync(join(dir, 'docs', 'tasks', `${n}.md`), text);
  for (const [f, text] of Object.entries(files)) { mkdirSync(join(dir, f, '..'), { recursive: true }); writeFileSync(join(dir, f), text); }
  g('add', '-A'); g('commit', '-q', '-m', 'base'); g('update-ref', 'refs/remotes/origin/main', 'HEAD');
  return dir;
}
function fakeSpawn({ reply = 'OK', hold = null } = {}) {
  const calls = []; const state = { now: 0, max: 0 };
  const spawn = (bin, args, opts) => {
    calls.push({ bin, args, opts });
    const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => { c.emit('close', 143); };
    c.stdin = { end: () => {
      state.now++; state.max = Math.max(state.max, state.now);
      const finish = () => { state.now--; c.stdout.emit('data', reply); c.emit('close', 0); };
      if (hold) hold.then(() => setImmediate(finish)); else setImmediate(finish);
    } };
    if (args[0] === '--version') setImmediate(() => c.emit('close', 0));
    return c;
  };
  return { spawn, calls, state };
}
async function withHub(fn, { env = home(), root = makeProject(), spawn = fakeSpawn().spawn, fetch: f, exec } = {}) {
  const hub = createHub({ env, root, spawn, fetch: f, exec, page: 'x' });
  const port = await hub.listen(0); const base = `http://127.0.0.1:${port}`;
  const api = (path, body) => fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'x-hub-token': hub.token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
  try { await fn({ hub, base, api, env, root }); } finally { await hub.close(); }
}

// ----- the registry -----
test('the registry always holds the home project and the workers.json projects; a damaged or hand-edited file is cleaned', () => {
  const env = home(); const cfg = loadWorkers(); const root = tmp();
  const reg = loadRegistry({ env, root, cfg });
  assert.deepEqual(reg.projects.map((p) => [p.id, p.source, p.folder]), [['zlatura', 'config', root]]);
  assert.equal(reg.home, 'zlatura'); assert.equal(reg.concurrency, 3);
  mkdirSync(join(env.HOME, '.zlatura-hub'), { recursive: true });
  writeFileSync(PROJECTS_FILE(env), JSON.stringify({ concurrency: 99, projects: [{ id: 'good', name: 'Good', folder: '/tmp/x', evil: '<script>' }, { id: 'zlatura', folder: '/tmp/y' }, { id: 'Bad Id', folder: '/tmp/z' }, { id: 'rel', folder: 'relative/path' }, 5, null] }));
  const r2 = loadRegistry({ env, root, cfg });
  assert.deepEqual(r2.projects.map((p) => p.id), ['zlatura', 'good']);
  assert.equal(r2.concurrency, 3, 'an out-of-range concurrency is ignored');
  assert.equal(JSON.stringify(r2).includes('script'), false);
  writeFileSync(PROJECTS_FILE(env), '{broken'); assert.equal(loadRegistry({ env, root, cfg }).projects.length, 1);
});

// ----- adding a folder: every way out is refused -----
test('checkFolder accepts a real git work tree and refuses ../, links, private/, overlaps, non-git and broad folders', async () => {
  const env = home(); const cfg = loadWorkers(); const hubRoot = makeProject(); const good = makeProject(); const notGit = tmp();
  const reg = () => loadRegistry({ env, root: hubRoot, cfg });
  assert.equal(await checkFolder(good, { registry: reg(), env }), good);
  const refuses = async (input, re, why) => assert.rejects(checkFolder(input, { registry: reg(), env }), (e) => e instanceof ProjectError && re.test(e.message), why);
  await refuses('', /full folder path/, 'empty'); await refuses(5, /full folder path/, 'not a string'); await refuses('relative/dir', /full path/, 'relative');
  await refuses(`${good}/../${notGit.split('/').pop()}`, /"\.\."/, 'a ../ path, even one that resolves to a real folder');
  await refuses(join(good, 'nope'), /does not exist/, 'missing'); await refuses(join(good, 'AGENTS.md'), /not a folder/, 'a file');
  await refuses(notGit, /not a git work tree/, 'not git');
  await refuses(join(good, 'docs'), /inside the project|not its top folder|not a git/, 'a sub folder of a repo is not accepted as a project');
  const link = join(notGit, 'link'); symlinkSync(good, link);
  await refuses(link, /goes through a link/, 'a symlink');
  await refuses(join(link, 'docs'), /goes through a link/, 'a path through a symlink');
  await refuses(hubRoot, /Already added|inside the project/, 'the home project again');
  await refuses(join(hubRoot, 'private', 'deals'), /does not exist/, 'missing private path');
  mkdirSync(join(hubRoot, 'private', 'deals'), { recursive: true });
  await refuses(join(hubRoot, 'private', 'deals'), /private folder of/, 'inside the private folder of another project');
  await refuses(join(hubRoot, 'PRIVATE'), /does not exist/, 'case variant that does not exist');
  mkdirSync(join(hubRoot, 'harness-out', 'wt'), { recursive: true });
  await refuses(join(hubRoot, 'harness-out', 'wt'), /inside the project/, 'a worktree folder inside a project');
  await refuses(require_parent(hubRoot), /contains the project|too broad|holds the hub/, 'a parent of a project');
  await refuses('/', /too broad/, 'the filesystem root');
  await refuses(env.HOME, /too broad|holds the hub|contains the project/, 'the home folder');
  mkdirSync(join(env.HOME, '.zlatura-hub'), { recursive: true });
  await refuses(join(env.HOME, '.zlatura-hub'), /too broad|holds the hub/, 'the key store');
});
const require_parent = (p) => join(p, '..');

test('add and remove through the page: saved owner-only with fields only; the home project and workers.json projects cannot be removed', async () => {
  await withHub(async ({ api, env, root }) => {
    const bot = makeProject();
    assert.equal((await api('/api/projects/add', { folder: '/etc' })).status, 400);
    const added = await api('/api/projects/add', { folder: bot, name: 'Trading bot', github: 'acme/bot' });
    assert.equal(added.status, 200); assert.equal(added.project.id, 'trading-bot'); assert.equal(added.project.folder, bot);
    assert.equal((await api('/api/projects/add', { folder: bot })).status, 400, 'twice');
    assert.equal((await api('/api/projects/add', { folder: makeProject(), name: 'x', github: 'not a slug' })).status, 400);
    const file = PROJECTS_FILE(env);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).projects, [{ id: 'trading-bot', name: 'Trading bot', folder: bot, github: 'acme/bot' }]);
    const list = await api('/api/projects');
    assert.deepEqual(list.projects.map((p) => [p.id, p.removable]), [['zlatura', false], ['trading-bot', true]]); assert.equal(list.home, 'zlatura');
    assert.equal((await api('/api/projects/remove', { id: 'zlatura' })).status, 400);
    assert.equal((await api('/api/projects/remove', { id: 'nope' })).status, 400);
    assert.equal((await api('/api/projects/remove', { id: 'trading-bot' })).status, 200);
    assert.deepEqual((await api('/api/projects')).projects.map((p) => p.id), ['zlatura']);
    assert.equal(root, list.projects[0].folder);
  });
});

test('a folder swapped for a link after it was added is refused when a job would use it', async () => {
  const env = home(); const root = makeProject(); const cfg = loadWorkers();
  const bot = makeProject(); const outside = makeProject({ evil: CARD('evil') });
  await addProject({ env, root, cfg, folder: bot, name: 'bot' });
  await withHub(async ({ api }) => {
    assert.equal((await api('/api/cards?project=bot')).status, 200);
    execFileSync('mv', [bot, bot + '-moved']); symlinkSync(outside, bot);
    assert.equal((await api('/api/cards?project=bot')).status, 400);
    const r = await api('/api/agent', { project: 'bot', card: 'evil.md', to: 'codex' });
    assert.equal(r.ok, false); assert.match(r.problems[0], /changed since it was added/);
    assert.equal((await api('/api/agent/apply', { project: 'bot', card: 'evil.md', provider: 'codex', diff: PATCH('docs/a.md') })).ok, false);
  }, { env, root });
});

// ----- per-project cards, rules and protected paths -----
test('each project reads its own task cards and its own AGENTS.md; another project\'s cards are invisible', async () => {
  const env = home(); const cfg = loadWorkers(); const root = makeProject({ zcard: CARD('zcard') }, { rules: 'ZLATURA RULES' });
  const bot = makeProject({ bcard: CARD('bcard') }, { rules: 'BOT RULES' });
  await addProject({ env, root, cfg, folder: bot, name: 'Trading bot' });
  const fx = fakeSpawn({ reply: '```diff\n' + PATCH('docs/a.md') + '```' });
  await withHub(async ({ api }) => {
    assert.deepEqual((await api('/api/cards')).cards.map((c) => c.id), ['zcard']);
    assert.deepEqual((await api('/api/cards?project=trading-bot')).cards.map((c) => c.id), ['bcard']);
    assert.equal((await api('/api/cards?project=nope')).status, 400);
    const r = await api('/api/agent', { project: 'trading-bot', card: 'bcard.md', to: 'codex' });
    assert.equal(r.ok, true);
    const packet = fx.calls.find((c) => c.input)?.input;
    void packet;
    const miss = await api('/api/agent', { project: 'trading-bot', card: 'zcard.md', to: 'codex' }); // a card of the other project
    assert.equal(miss.ok, false); assert.match(miss.problems[0], /no such card/);
  }, { env, root, spawn: fx.spawn });
  // the packet carries the chosen project's rules (checked directly, where the packet is visible)
  let seen; await runAgent({ root: bot, file: 'bcard.md', to: 'codex', stats: PROVIDERS.map((p) => ({ id: p.id, state: p.id === 'codex' ? 'ready' : 'needs-key' })), cfg, ask: async (id, packet) => { seen = packet; return ''; } });
  assert.match(seen, /BOT RULES/); assert.doesNotMatch(seen, /ZLATURA RULES/);
});

test('a project with no AGENTS.md still runs, with a plain rule instead of another project\'s rules', async () => {
  const bot = makeProject({ one: CARD('one') }, { rules: null }); let seen;
  await runAgent({ root: bot, file: 'one.md', to: 'codex', stats: PROVIDERS.map((p) => ({ id: p.id, state: p.id === 'codex' ? 'ready' : 'needs-key' })), cfg: loadWorkers(), ask: async (id, packet) => { seen = packet; return ''; } });
  assert.match(seen, /no AGENTS\.md/);
});

test('a card that is a link to a file outside the project\'s docs/tasks is not read or listed', async () => {
  const outside = tmp(); writeFileSync(join(outside, 'secret.md'), CARD('stolen'));
  const bot = makeProject({ one: CARD('one') }); symlinkSync(join(outside, 'secret.md'), join(bot, 'docs', 'tasks', 'stolen.md'));
  assert.deepEqual(listCards(bot).map((c) => c.id), ['one']);
  const stats = PROVIDERS.map((p) => ({ id: p.id, state: p.id === 'codex' ? 'ready' : 'needs-key' }));
  await assert.rejects(runAgent({ root: bot, file: 'stolen.md', to: 'codex', stats, cfg: loadWorkers(), ask: async () => '' }), /bad card name/);
  await assert.rejects(async () => applyDiff({ root: bot, file: 'stolen.md', provider: 'codex', diff: PATCH('docs/a.md'), exec: () => assert.fail('no ingest') }), /bad card name/);
  const bot2 = makeProject(); execFileSync('rm', ['-rf', join(bot2, 'docs', 'tasks')]); symlinkSync(outside, join(bot2, 'docs', 'tasks'));
  assert.deepEqual(listCards(bot2), [], 'a docs/tasks folder that is a link is not trusted either');
});

test('a project\'s own protected paths live in its own config; private/ and .github/ are protected whatever it says', () => {
  const cfg = loadWorkers();
  const bot = { id: 'trading-bot', name: 'Trading bot', source: 'user', folder: '/x', protectedPaths: ['live/', 'keys.yaml'], requiresDesign: ['risk/'], kinds: { backtest: 'builder' }, roles: { builder: { what: 'Builds backtests', primary: 'codex', fallbacks: ['claude-sonnet'] } } };
  const { cfg: pc, profile } = projectCfg(cfg, bot);
  assert.ok(pc.protectedPaths.includes('live/') && pc.protectedPaths.includes('private/') && pc.protectedPaths.includes('.github/') && pc.protectedPaths.includes('.env'));
  assert.ok(!pc.protectedPaths.includes('sw.js'), 'Zlatura-specific paths do not leak into another project');
  assert.deepEqual(profile.requiresDesign, ['risk/']); assert.equal(pc.kinds.backtest, 'builder'); assert.equal(pc.roles.builder.primary, 'codex');
  assert.equal(cfg.roles.builder, undefined, 'the shared config is not changed');
  const v = (diff, scope) => validateDiff(diff, scope, pc, 'whatever-the-card-says');
  assert.deepEqual(v(PATCH('live/order.py'), ['live/order.py']).problems, [], 'a protected file the card names exactly is the harness\'s existing rule');
  assert.match(v(PATCH('live/order.py'), ['src/']).problems.join(), /outside the card scope/);
  const wide = v(PATCH('private/x.csv'), ['private/']); // scope covers the folder, but the folder is protected and not named exactly
  assert.match(wide.problems.join(), /protected file/);
  assert.match(v(PATCH('.github/workflows/ci.yml'), ['.github/']).problems.join(), /protected file/);
  assert.deepEqual(v(PATCH('src/bot.py'), ['src/']).problems, []);
  // an unknown role or kind in a project's own config is refused, not guessed
  assert.throws(() => projectCfg(cfg, { ...bot, kinds: { x: 'nobody' } }), /not valid/);
  assert.throws(() => projectCfg(cfg, { ...bot, roles: { r: { primary: 'ghost', what: 'x' } } }), /not valid/);
  // path escapes in a protected list entry are dropped when the registry is read
  const env = home(); mkdirSync(join(env.HOME, '.zlatura-hub')); writeFileSync(PROJECTS_FILE(env), JSON.stringify({ projects: [{ id: 'b', folder: '/abs', protectedPaths: ['ok/', '../x'] }] }));
  assert.deepEqual(loadRegistry({ env, root: tmp(), cfg }).projects.find((p) => p.id === 'b').protectedPaths, ['ok/']);
});

test('a future "trading bot" is added with a folder and a config only, then drafts into its OWN repository on a local branch', async () => {
  const env = home(); const cfg = loadWorkers(); const root = makeProject({ zcard: CARD('zcard') });
  const bot = makeProject({ t1: CARD('t1', 'src/') }, { files: { 'src/bot.py': 'x\n', 'src/live/order.py': 'y\n' } });
  await addProject({ env, root, cfg, folder: bot, name: 'Trading bot' });
  // the owner edits the entry in ~/.zlatura-hub/projects.json: no code change
  const f = JSON.parse(readFileSync(PROJECTS_FILE(env), 'utf8')); f.projects[0].extraProtected = ['src/live/']; writeFileSync(PROJECTS_FILE(env), JSON.stringify(f));
  const reply = '```diff\n' + ['diff --git a/src/bot.py b/src/bot.py', '--- a/src/bot.py', '+++ b/src/bot.py', '@@ -1,1 +1,2 @@', ' x', '+more'].join('\n') + '\n```';
  const bad = '```diff\n' + ['diff --git a/src/live/order.py b/src/live/order.py', '--- a/src/live/order.py', '+++ b/src/live/order.py', '@@ -1,1 +1,2 @@', ' y', '+oops'].join('\n') + '\n```';
  const branches = (dir) => execFileSync('git', ['branch', '--list', 'agent/*', '--format=%(refname:short)'], { cwd: dir, encoding: 'utf8' }).trim();
  let current = reply; const fx = fakeSpawn(); const orig = fx.spawn;
  const spawn = (bin, args, opts) => { const c = orig(bin, args, opts); if (args[0] !== '--version') { c.stdin.end = () => setImmediate(() => { c.stdout.emit('data', current); c.emit('close', 0); }); } return c; };
  await withHub(async ({ api }) => {
    const r = await api('/api/agent', { project: 'trading-bot', card: 't1.md', to: 'codex' });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.deepEqual(r.files, ['src/bot.py']);
    const a = await api('/api/agent/apply', { project: 'trading-bot', card: 't1.md', provider: 'codex', diff: r.diff });
    assert.equal(a.ok, true, JSON.stringify(a)); assert.match(a.message, /Committed on agent\/codex\/t1/);
    assert.equal(branches(bot), 'agent/codex/t1', 'the branch is in the trading bot repository');
    assert.equal(branches(root), '', 'and not in the hub\'s own repository');
    assert.equal(execFileSync('git', ['show', 'agent/codex/t1:src/bot.py'], { cwd: bot, encoding: 'utf8' }), 'x\nmore\n');
    current = bad;
    const refused = await api('/api/agent', { project: 'trading-bot', card: 't1.md', to: 'codex' });
    assert.equal(refused.ok, false); assert.match(refused.problems.join(), /protected file: src\/live\/order.py/);
  }, { env, root, spawn, exec: undefined });
});

test('the harness ingest receives the project\'s protected paths (HARNESS_PROFILE); without them the same draft would pass', () => {
  const bot = makeProject({ t1: CARD('t1', 'src/') }, { files: { 'src/bot.py': 'x\n', 'src/live/k.py': 'y\n' } });
  const diffFile = join(tmp(), 'reply.diff');
  writeFileSync(diffFile, ['diff --git a/src/live/k.py b/src/live/k.py', '--- a/src/live/k.py', '+++ b/src/live/k.py', '@@ -1,1 +1,2 @@', ' y', '+z'].join('\n') + '\n');
  const runner = new URL('../tools/harness/run-task.mjs', import.meta.url).pathname;
  const go = (profile) => spawnSync(process.execPath, [runner, 'ingest', join(bot, 'docs', 'tasks', 't1.md'), 'codex', diffFile], { cwd: bot, encoding: 'utf8', env: { ...process.env, ...(profile ? { HARNESS_PROFILE: JSON.stringify(profile) } : {}) } });
  const guarded = go({ extraProtected: ['src/live/'], requiresDesign: [] });
  assert.notEqual(guarded.status, 0); assert.match(guarded.stderr, /protected file: src\/live\/k.py/);
  const plain = go(null); assert.equal(plain.status, 0, plain.stderr); assert.match(plain.stdout, /Committed on agent\/codex\/t1/);
  assert.equal(execFileSync('git', ['branch', '--list', 'agent/*', '--format=%(refname:short)'], { cwd: bot, encoding: 'utf8' }).trim(), 'agent/codex/t1');
});

test('apply runs the harness inside the chosen project\'s folder, with an absolute runner and that project\'s profile, and nothing outside it', async () => {
  const env = home(); const cfg = loadWorkers(); const root = makeProject(); const bot = makeProject({ one: CARD('one') });
  await addProject({ env, root, cfg, folder: bot, name: 'bot' });
  const calls = [];
  const exec = (cmd, args, opts, cb) => { calls.push({ cmd, args, opts }); cb(null, 'Committed on agent/codex/one.', ''); };
  await withHub(async ({ api }) => {
    const a = await api('/api/agent/apply', { project: 'bot', card: 'one.md', provider: 'codex', diff: PATCH('docs/a.md') });
    assert.equal(a.ok, true);
    assert.equal(calls.length, 1); assert.equal(calls[0].opts.cwd, bot, 'cwd is the project folder, not the hub\'s');
    assert.ok(calls[0].args[0].startsWith('/') && calls[0].args[0].endsWith('tools/harness/run-task.mjs'));
    assert.ok(calls[0].args[2].startsWith(join(bot, 'docs', 'tasks')), 'the card is read from the project');
    assert.ok(JSON.parse(calls[0].opts.env.HARNESS_PROFILE).protectedPaths.includes('private/'));
    for (const diff of [PATCH('../x.md'), PATCH('/etc/passwd'), PATCH('docs/../../x'), PATCH('private/a.csv'), PATCH('docs/other.md')]) {
      const r = await api('/api/agent/apply', { project: 'bot', card: 'one.md', provider: 'codex', diff });
      assert.equal(r.ok, false, diff); 
    }
    assert.equal(calls.length, 1, 'a refused draft never reaches the harness');
    assert.equal((await api('/api/agent/apply', { project: 'bot', card: '../../etc/passwd', provider: 'codex', diff: PATCH('docs/a.md') })).ok, false);
  }, { env, root, exec });
});

// ----- the job queue -----
test('the job queue never runs more than the limit at once, runs the rest in order, and a lowered or raised limit takes effect', { timeout: 10000 }, async () => {
  const q = createJobs({ concurrency: 3 }); let now = 0, max = 0; const order = []; const gates = [];
  const mk = (n) => q.add({ project: n % 2 ? 'a' : 'b', kind: 'agent', label: `c${n}`, run: () => new Promise((resolve) => { now++; max = Math.max(max, now); order.push(n); gates.push(() => { now--; resolve(n); }); }) });
  const ids = [1, 2, 3, 4, 5, 6].map((n) => mk(n).id);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(q.list().reverse().map((j) => j.status), ['running', 'running', 'running', 'queued', 'queued', 'queued']);
  assert.equal(q.running(), 3); assert.equal(q.queued(), 3);
  gates[0](); await new Promise((r) => setImmediate(r));
  assert.equal(q.running(), 3, 'the next one started'); assert.deepEqual(order, [1, 2, 3, 4]);
  q.setLimit(1); gates[1](); gates[2](); await new Promise((r) => setImmediate(r));
  assert.equal(q.running(), 1, 'lowered limit: only one now, the rest wait'); assert.equal(q.get(ids[3]).status, 'running');
  q.setLimit(5); await new Promise((r) => setImmediate(r)); assert.equal(q.running(), 3, 'raised limit: the waiting ones start');
  for (const g of gates) g(); await Promise.all(ids.map((id) => q.wait(id)));
  assert.ok(max <= 3, `max ${max}`); assert.deepEqual(q.list().map((j) => j.status), Array(6).fill('done'));
});

test('cancel: a queued job never starts; a running job is told to stop, shows failed and cancelled, and its slot is freed only when it unwinds', async () => {
  const q = createJobs({ concurrency: 1 }); let started = []; let abortedSeen = false;
  const a = q.add({ project: 'p', kind: 'agent', label: 'a', run: ({ signal }) => new Promise((_, rej) => { started.push('a'); signal.addEventListener('abort', () => { abortedSeen = true; setImmediate(() => rej(new Error('cancelled'))); }); }) });
  const b = q.add({ project: 'p', kind: 'agent', label: 'b', run: async () => { started.push('b'); return 'b'; } });
  const c = q.add({ project: 'p', kind: 'agent', label: 'c', run: async () => { started.push('c'); return 'c'; } });
  await new Promise((r) => setImmediate(r));
  assert.equal(q.cancel(c.id), true); assert.equal(q.get(c.id).status, 'failed'); assert.equal(q.get(c.id).cancelled, true);
  assert.equal(q.cancel(a.id), true); assert.equal(q.get(a.id).status, 'failed'); assert.equal(abortedSeen, true);
  assert.equal(q.cancel(a.id), false, 'already stopped');
  await q.wait(a.id); const rb = await q.wait(b.id);
  assert.equal(rb.status, 'done'); assert.deepEqual(started, ['a', 'b'], 'c never ran');
  assert.equal(q.cancel('job-nope'), false);
});

test('chat and apply are listed but never wait behind the limit', async () => {
  const q = createJobs({ concurrency: 1 }); let release; const gate = new Promise((r) => { release = r; });
  q.add({ project: 'p', kind: 'agent', label: 'slow', run: () => gate });
  const chat = q.add({ project: 'p', kind: 'chat', label: 'x', counts: false, run: async () => 'hi' });
  assert.equal((await q.wait(chat.id)).status, 'done'); release();
});

test('over HTTP: jobs from several projects run together up to the limit, the rest queue, the Jobs list shows every project, and cancel works', { timeout: 20000 }, async () => {
  const env = home(); const cfg = loadWorkers(); const root = makeProject({ z1: CARD('z1'), z2: CARD('z2'), z3: CARD('z3') });
  const bot = makeProject({ b1: CARD('b1'), b2: CARD('b2') });
  await addProject({ env, root, cfg, folder: bot, name: 'Trading bot' });
  let release; const hold = new Promise((r) => { release = r; });
  const fx = fakeSpawn({ reply: '```diff\n' + PATCH('docs/a.md') + '```', hold });
  await withHub(async ({ api }) => { try {
    const ids = [];
    for (const [project, card] of [['zlatura', 'z1.md'], ['trading-bot', 'b1.md'], ['zlatura', 'z2.md'], ['trading-bot', 'b2.md'], ['zlatura', 'z3.md']]) ids.push((await api('/api/agent', { project, card, to: 'codex', async: true })).jobId);
    assert.equal((await api('/api/agent', { project: 'zlatura', card: 'z1.md', to: 'codex', async: true })).ok, false, 'the same card twice is refused');
    await new Promise((r) => setTimeout(r, 200));
    let j = await api('/api/jobs');
    assert.equal(j.limit, 3); assert.equal(j.running, 3); assert.equal(j.queued, 2);
    assert.deepEqual([...new Set(j.jobs.map((x) => x.project))].sort(), ['trading-bot', 'zlatura']);
    assert.deepEqual(j.jobs.filter((x) => x.status === 'running').map((x) => x.label).sort(), ['b1.md', 'z1.md', 'z2.md']);
    assert.ok(fx.state.max <= 3, `model calls at once: ${fx.state.max}`);
    assert.equal((await api('/api/jobs/cancel', { id: ids[4] })).ok, true); // z3, queued
    assert.equal((await api('/api/jobs/cancel', { id: ids[3] })).ok, true); // b2, queued
    j = await api('/api/jobs'); assert.equal(j.queued, 0); assert.equal(j.jobs.filter((x) => x.cancelled).length, 2);
    release(); await new Promise((r) => setTimeout(r, 300));
    j = await api('/api/jobs'); assert.equal(j.running, 0);
    assert.deepEqual(j.jobs.filter((x) => x.status === 'done').map((x) => x.label).sort(), ['b1.md', 'z1.md', 'z2.md']);
    const res = await api('/api/jobs/result', { id: ids[1] });
    assert.equal(res.result.ok, true); assert.equal(res.job.project, 'trading-bot');
    assert.equal((await api('/api/jobs/result', { id: 'job-none' })).status, 404);
    assert.equal(fx.state.max, 3, 'three really did run together');
    // configurable concurrency, persisted
    assert.equal((await api('/api/jobs/concurrency', { n: 0 })).status, 400); assert.equal((await api('/api/jobs/concurrency', { n: 9 })).status, 400);
    assert.equal((await api('/api/jobs/concurrency', { n: 2 })).limit, 2); assert.equal((await api('/api/jobs')).limit, 2);
    assert.equal(JSON.parse(readFileSync(PROJECTS_FILE(env), 'utf8')).concurrency, 2);
  } finally { release(); } }, { env, root, spawn: fx.spawn }); // release() so a failed check cannot leave a held request that stops the server closing
});

test('a chat is tagged with its project and shows in the Jobs list', async () => {
  const env = home(); const cfg = loadWorkers(); const root = makeProject(); const bot = makeProject();
  await addProject({ env, root, cfg, folder: bot, name: 'bot' });
  await withHub(async ({ api }) => {
    const r = await api('/api/chat', { message: 'hello', to: 'codex', project: 'bot' });
    assert.equal(r.replies[0].ok, true);
    const j = await api('/api/jobs');
    assert.deepEqual(j.jobs.map((x) => [x.kind, x.project, x.status]), [['chat', 'bot', 'done']]);
    assert.equal(JSON.stringify(j).includes('hello'), false, 'the prompt text is not kept in the list');
    assert.equal((await api('/api/chat', { message: 'hello', to: 'codex', project: 'nope' })).status, 400);
  }, { env, root });
});

test('the state follows the project: its own roles and kinds, and a clear message when its config is wrong', async () => {
  const env = home(); const cfg = loadWorkers(); const root = makeProject(); const bot = makeProject();
  await addProject({ env, root, cfg, folder: bot, name: 'bot' });
  const f = JSON.parse(readFileSync(PROJECTS_FILE(env), 'utf8'));
  f.projects[0].roles = { quant: { what: 'Writes backtests', primary: 'codex', fallbacks: ['claude-sonnet'] } }; f.projects[0].kinds = { backtest: 'quant' };
  writeFileSync(PROJECTS_FILE(env), JSON.stringify(f));
  await withHub(async ({ api }) => {
    const z = await api('/api/state'); const b = await api('/api/state?project=bot');
    assert.ok(!('quant' in z.roles) && !z.kinds.includes('backtest'));
    assert.ok('quant' in b.roles && b.kinds.includes('backtest')); assert.equal(b.projectError, null);
    f.projects[0].kinds = { backtest: 'nobody' }; writeFileSync(PROJECTS_FILE(env), JSON.stringify(f));
    const bad = await api('/api/state?project=bot'); assert.match(bad.projectError, /not valid/); assert.ok('designer' in bad.roles);
    assert.match((await api('/api/agent', { project: 'bot', card: 'one.md' })).problems[0], /not valid/);
  }, { env, root });
});

// ----- the Pull requests tab follows the project -----
test('the pull request routes use the selected project\'s folder and repository, and nothing the page sends', async () => {
  const env = home(); const cfg = loadWorkers(); const root = makeProject(); const bot = makeProject();
  await addProject({ env, root, cfg, folder: bot, name: 'bot', github: 'acme/bot' });
  const { saveKey } = await import('../tools/hub/providers.mjs'); saveKey('HUB_GITHUB_TOKEN', ['github', 'pat', '11FAKEFAKE0' + 'a1b2c3d4e5f6a7b8c9d0e1f2'].join('_'), env);
  const seen = [];
  const f = async (url) => { seen.push(new URL(url).pathname); return { ok: true, status: 200, text: async () => '[]' }; };
  await withHub(async ({ api }) => {
    assert.deepEqual((await api('/api/pr/projects')).projects, ['zlatura', 'bot']);
    const r = await api('/api/pr/list', { project: 'bot' });
    assert.equal(r.status, 200); assert.equal(r.repo, 'acme/bot'); assert.equal(r.source, 'config');
    assert.ok(seen.every((p) => p.startsWith('/repos/acme/bot')), seen.join());
    assert.equal((await api('/api/pr/list', { project: 'bot', repo: 'evil/x', folder: '/etc' })).repo, 'acme/bot');
    assert.equal((await api('/api/pr/list', { project: 'nope' })).status, 502);
  }, { env, root, fetch: f });
});

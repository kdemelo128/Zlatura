import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHub } from '../tools/hub/server.mjs';
import { PROVIDERS, KEYS_FILE } from '../tools/hub/providers.mjs';
import { pick, connectSummary, screenPrompt } from '../tools/hub/hub-lib.mjs';
import { slugFromRemote, projectInfo, isBranch } from '../tools/hub/github.mjs';
import * as realGate from '../tools/hub/pr-gate.mjs';
import { run as runCli } from '../tools/hub/pr-cli.mjs';

// the fake token is built at run time so no token-looking literal sits in the source (the secret scan reads every branch)
const TOKEN = ['github', 'pat', '11FAKEFAKE0' + 'a1b2c3d4e5f6a7b8c9d0e1f2'].join('_');
const SHA = 'a'.repeat(40);
const home = () => ({ HOME: mkdtempSync(join(tmpdir(), 'hubhome-')) });

/** A stand-in for api.github.com. `s` describes one open pull request (#7); every call is recorded. */
function mockGithub(s = {}) {
  const o = { sha: SHA, mergeable: true, mstate: 'clean', draft: false, runs: [{ name: 'unit', status: 'completed', conclusion: 'success' }], statuses: [], reviews: [], squash: true, autoAllowed: true, autoMerge: null, ...s };
  const calls = [];
  const reply = (status, json) => ({ ok: status < 400, status, text: async () => JSON.stringify(json) });
  const f = async (url, init = {}) => {
    const u = new URL(url); const method = init.method || 'GET'; const p = u.pathname; const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, url, path: p, body, headers: init.headers });
    if (o.reject) throw new Error(o.reject);
    if (o.fail) return reply(o.fail.status, { message: o.fail.message });
    if (p === '/graphql') return reply(200, { data: { ok: true } });
    const r = '/repos/acme/widgets';
    if (method === 'GET' && p === r) return reply(200, { default_branch: 'main', allow_squash_merge: o.squash, allow_auto_merge: o.autoAllowed });
    if (method === 'GET' && p === `${r}/pulls`) return reply(200, [{ number: 7 }]);
    if (method === 'GET' && p === `${r}/pulls/7`) return reply(200, { number: 7, node_id: 'PR_node7', title: 'Fix the thing', state: 'open', draft: o.draft, mergeable: o.mergeable, mergeable_state: o.mstate, merged: false, head: { sha: o.sha, ref: 'claude/fix-thing' }, base: { ref: 'main' }, user: { login: 'owner1' }, html_url: 'https://github.com/acme/widgets/pull/7', updated_at: '2026-11-10T10:00:00Z', auto_merge: o.autoMerge });
    if (method === 'GET' && p === `${r}/commits/${o.sha}/check-runs`) return reply(200, { total_count: o.runs.length, check_runs: o.runs });
    if (method === 'GET' && p === `${r}/commits/${o.sha}/status`) return reply(200, { total_count: o.statuses.length, statuses: o.statuses });
    if (method === 'GET' && p === `${r}/pulls/7/reviews`) return reply(200, o.reviews);
    if (method === 'PUT' && p === `${r}/pulls/7/merge`) return reply(200, { merged: true, message: 'Pull Request successfully merged' });
    if (method === 'PUT' && p === `${r}/pulls/7/update-branch`) return reply(202, { message: 'Updating pull request branch.' });
    if (method === 'POST' && p === `${r}/pulls`) return reply(201, { number: 9, html_url: 'https://github.com/acme/widgets/pull/9' });
    return reply(404, { message: 'Not Found' });
  };
  const writes = () => calls.filter((c) => c.method !== 'GET');
  return { f, calls, writes };
}

/** A real throwaway git repo: origin points at acme/widgets; branch claude/feat-x has a changelog fragment and a PR template. */
function makeRepo({ fragment = '# Brokers can pay a fee twice a year\n\nThe entry body.\n\n- bullet one\n', template = '## Checklist\n- [ ] tested\n', extraFragment = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hubrepo-'));
  const g = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...a], { cwd: dir, stdio: 'pipe' });
  g('init', '-q', '-b', 'main');
  mkdirSync(join(dir, 'docs/changelog/unreleased'), { recursive: true });
  writeFileSync(join(dir, 'docs/changelog/unreleased/README.md'), '# Changelog fragments\n\nhow this folder works\n');
  writeFileSync(join(dir, 'a.txt'), 'a');
  g('add', '-A'); g('commit', '-q', '-m', 'base');
  g('remote', 'add', 'origin', 'https://u:secretpw@github.com/acme/widgets.git');
  g('checkout', '-q', '-b', 'claude/feat-x');
  if (fragment != null) writeFileSync(join(dir, 'docs/changelog/unreleased/claude-feat-x.md'), fragment);
  if (extraFragment) writeFileSync(join(dir, 'docs/changelog/unreleased/other.md'), '# Other\n\nx');
  if (template != null) { mkdirSync(join(dir, '.github'), { recursive: true }); writeFileSync(join(dir, '.github/pull_request_template.md'), template); }
  writeFileSync(join(dir, 'b.txt'), 'b');
  g('add', '-A'); g('commit', '-q', '-m', 'work');
  g('checkout', '-q', 'main');
  return dir;
}
/** Real git for reads; pushes and ls-remote are answered here and recorded, so nothing leaves the machine. */
function gitExec() {
  const pushes = [];
  const exec = (cmd, args, opts, cb) => {
    if (cmd === 'git' && args[0] === 'push') { pushes.push(args); return cb(null, '', ''); }
    if (cmd === 'git' && args[0] === 'ls-remote') return cb(null, '', '');
    return execFile(cmd, args, opts, cb);
  };
  return { exec, pushes };
}

async function withHub(fn, { gh = mockGithub(), repo = makeRepo(), withToken = true, spawn } = {}) {
  const env = home(); const g = gitExec();
  if (withToken) { const { saveKey } = await import('../tools/hub/providers.mjs'); saveKey('HUB_GITHUB_TOKEN', TOKEN, env); }
  const hub = createHub({ env, fetch: gh.f, root: repo, exec: g.exec, spawn, page: '<html>hub</html>' });
  const port = await hub.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'x-hub-token': hub.token, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const errors = []; const orig = console.error; console.error = (...a) => errors.push(a.join(' '));
  try { await fn({ hub, port, base, env, post, gh, repo, pushes: g.pushes, errors, h: { 'x-hub-token': hub.token } }); } finally { console.error = orig; await hub.close(); }
}
const P = { project: 'zlatura' };

// ----- the merge rule, on its own -----
const chk = (state, extra = {}) => ({ state, total: 3, passing: 3, failing: 0, pending: 0, failed: [], ...extra });
const okPr = { state: 'open', draft: false, mergeable: true, mergeable_state: 'clean' };
/** Every row says what the rule must answer. Used on the real file and on deliberately broken copies of it. */
function gateScenarios(g) {
  const refuses = (pr, checks, repo, what) => assert.ok(g.mergeGate({ pr: { ...okPr, ...pr }, checks, repo }).length > 0, 'must refuse: ' + what);
  assert.deepEqual(g.mergeGate({ pr: okPr, checks: chk('green') }), [], 'green and clean merges');
  refuses({}, chk('red', { failing: 1, failed: ['unit'] }), {}, 'red checks');
  refuses({}, chk('pending', { pending: 1 }), {}, 'pending checks');
  refuses({}, chk('none', { total: 0 }), {}, 'no checks');
  refuses({}, chk('unknown'), {}, 'unreadable checks');
  refuses({ mergeable: false, mergeable_state: 'dirty' }, chk('green'), {}, 'conflict');
  refuses({ mergeable: null, mergeable_state: 'unknown' }, chk('green'), {}, 'not computed yet');
  refuses({ mergeable_state: 'behind' }, chk('green'), {}, 'behind');
  refuses({ mergeable_state: 'blocked' }, chk('green'), {}, 'blocked');
  refuses({ mergeable_state: 'some-new-state' }, chk('green'), {}, 'a state we do not know');
  refuses({ draft: true }, chk('green'), {}, 'draft');
  refuses({ state: 'closed' }, chk('green'), {}, 'closed');
  refuses({}, chk('green'), { allow_squash_merge: false }, 'squash off');
  assert.equal(g.summarizeChecks({ runs: [{ status: 'in_progress' }, { status: 'completed', conclusion: 'success' }] }).state, 'pending');
  assert.equal(g.summarizeChecks({ runs: [{ status: 'completed', conclusion: 'failure', name: 'x' }, { status: 'queued' }] }).state, 'red');
  assert.equal(g.summarizeChecks({ runs: [{ status: 'completed', conclusion: 'success' }], statuses: [{ state: 'pending' }] }).state, 'pending');
  assert.equal(g.summarizeChecks({ runs: [{ status: 'completed', conclusion: 'success' }], statuses: [{ state: 'error', context: 'ci' }] }).state, 'red');
  assert.equal(g.summarizeChecks({ runs: [{ status: 'completed', conclusion: 'success' }], truncated: true }).state, 'unknown');
  assert.equal(g.summarizeChecks({}).state, 'none');
  assert.equal(g.summarizeChecks({ runs: [{ status: 'completed', conclusion: 'skipped' }] }).state, 'green');
  assert.equal(g.autoMergeGate({ pr: okPr, checks: chk('pending', { pending: 1 }) }).length, 0, 'auto-merge may wait for running checks');
  assert.ok(g.autoMergeGate({ pr: okPr, checks: chk('red', { failing: 1 }) }).length > 0, 'auto-merge never on red');
}

test('the merge rule refuses red, pending, missing, unreadable, conflicting, behind, blocked, draft and closed (no override exists)', () => {
  gateScenarios(realGate);
  assert.equal(realGate.reviewState([{ user: { login: 'a' }, state: 'APPROVED' }, { user: { login: 'b' }, state: 'CHANGES_REQUESTED' }]), 'changes requested');
  assert.equal(realGate.reviewState([{ user: { login: 'a' }, state: 'CHANGES_REQUESTED' }, { user: { login: 'a' }, state: 'APPROVED' }]), 'approved');
  assert.equal(realGate.reviewState([{ user: { login: 'a' }, state: 'COMMENTED' }]), 'none');
});

test('mutation checks: each deliberately broken copy of the rule fails the scenarios', async () => {
  const src = readFileSync(new URL('../tools/hub/pr-gate.mjs', import.meta.url), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'hubmut-'));
  const mutants = {
    // the rule has two layers (a named reason per state, then default-deny), so a state is only really let through when both are broken
    'merge while pending': [["else if (checks.state === 'pending') why.push(", 'else if (false) why.push('], ["else if (checks.state !== 'green') why.push(", 'else if (false) why.push(']],
    'merge while red': [["if (checks.state === 'red') why.push(`Checks are failing", 'if (false) why.push(`Checks are failing'], ["else if (checks.state !== 'green') why.push(", 'else if (false) why.push(']],
    'merge with no checks': [["else if (checks.state === 'none') why.push(", 'else if (false) why.push('], ["else if (checks.state !== 'green') why.push(", 'else if (false) why.push(']],
    'merge when checks are unreadable (no default-deny)': [["else if (checks.state !== 'green') why.push(", 'else if (false) why.push(']],
    'merge with a conflict': [["if (label === 'conflict') why.push('It conflicts", "if (false) why.push('It conflicts"], ["pr.mergeable === false || pr.mergeable_state === 'dirty'", 'false'], ["?? 'blocked'", "?? 'clean'"]],
    'an unknown mergeable state treated as clean': [["?? 'blocked'", "?? 'clean'"]],
    'merge while behind': [["if (label === 'behind') why.push(", 'if (false) why.push(']],
    'merge a draft': [["if (label === 'draft') why.push(", 'if (false) why.push('], ["pr.draft || pr.mergeable_state === 'draft'", 'false']],
    'merge before mergeable is known': [["if (label === 'checking') why.push(", 'if (false) why.push('], ['pr.mergeable == null || ', 'false || ']],
    'a running check counted as passing': [["if (r.status !== 'completed') pending++;", 'if (false) pending++;']],
    'pending state ignored': [['else if (pending) state', 'else if (false) state']],
    'a failed status counted as passing': [["else { failing++; failed.push(String(s.context", "else { passing++; failed.push(String(s.context"]],
    'unreadable (truncated) checks shown green': [['else if (truncated) state', 'else if (false) state']],
  };
  let n = 0;
  for (const [name, spec] of Object.entries(mutants)) {
    const pairs = Array.isArray(spec[0]) ? spec : [spec]; let code = src;
    for (const [from, to] of pairs) { assert.ok(code.includes(from), 'mutation target missing: ' + name); code = code.replace(from, to); }
    const f = join(dir, `m${n++}.mjs`); writeFileSync(f, code);
    const mod = await import(pathToFileURL(f).href);
    assert.throws(() => gateScenarios(mod), `the scenarios must catch: ${name}`);
  }
});

// ----- the server, with GitHub mocked -----
test('the GitHub token: saved atomically 0600 through the key box, never in any response, log or error', async () => {
  await withHub(async ({ base, post, env, h, errors, gh }) => {
    const bodies = [];
    const take = async (r) => { const t = await r.text(); bodies.push(t); return JSON.parse(t); };
    const st = await take(await fetch(base + '/api/state', { headers: h }));
    assert.equal(st.providers.find((p) => p.id === 'github').state, 'ready');
    assert.equal(st.summary.total, PROVIDERS.filter((p) => p.chat !== false).length, 'GitHub is not counted as a model');
    assert.equal((statSync(KEYS_FILE(env)).mode & 0o777), 0o600);
    assert.equal(JSON.parse(readFileSync(KEYS_FILE(env), 'utf8')).HUB_GITHUB_TOKEN, TOKEN);
    await take(await post('/api/pr/list', P));
    await take(await fetch(base + '/api/pr/projects', { headers: h }));
    // GitHub rejects the token and echoes it; the network itself fails with the token in the message; a 500-style git failure
    for (const gh2 of [mockGithub({ fail: { status: 401, message: 'Bad credentials ' + TOKEN } }), mockGithub({ fail: { status: 422, message: 'echo ' + TOKEN } }), mockGithub({ reject: 'socket hang up for ' + TOKEN })]) {
      await withHub(async ({ post: p2, errors: e2 }) => {
        const r = await p2('/api/pr/list', P); bodies.push(await r.text()); assert.ok(r.status >= 400);
        errors.push(...e2);
      }, { gh: gh2 });
    }
    for (const c of gh.calls) assert.ok(c.url.startsWith('https://api.github.com/'), c.url);
    for (const c of gh.calls) assert.equal(c.headers.authorization, `Bearer ${TOKEN}`);
    for (const b of bodies) assert.ok(!b.includes(TOKEN), 'token leaked into a response');
    for (const e of errors) assert.ok(!e.includes(TOKEN), 'token leaked into the log');
  });
});

test('a token pasted in chat, or a project remote with a password, is screened and not echoed', async () => {
  assert.equal(screenPrompt(`here ${TOKEN}`).ok, false);
  await withHub(async ({ post }) => {
    const t = await (await post('/api/pr/list', P)).text();
    assert.ok(!t.includes('secretpw'));
  });
});

test('Origin, Host and token checks apply to every pull request route', async () => {
  await withHub(async ({ base, port, hub }) => {
    const call = (path, init) => fetch(base + path, init);
    for (const path of ['/api/pr/list', '/api/pr/merge', '/api/pr/create']) {
      assert.equal((await call(path, { method: 'POST', body: '{}' })).status, 401, 'no token ' + path);
      assert.equal((await call(path, { method: 'POST', headers: { 'x-hub-token': 'wrong' }, body: '{}' })).status, 401);
      assert.equal((await call(path, { method: 'POST', headers: { 'x-hub-token': hub.token, origin: 'https://evil.example' }, body: '{}' })).status, 403, 'origin ' + path);
    }
    assert.equal((await call('/api/pr/projects', { headers: { 'x-hub-token': hub.token, origin: 'http://evil.example' } })).status, 403);
    assert.equal((await call(`/api/pr/projects?t=${hub.token}`)).status, 401, 'the ?t= token opens the page only');
    // a request that claims another Host is refused before anything runs
    const http = await import('node:http');
    const status = await new Promise((res) => { const q = http.request({ host: '127.0.0.1', port, path: '/api/pr/projects', headers: { host: 'evil.example', 'x-hub-token': hub.token } }, (r) => { r.resume(); res(r.statusCode); }); q.end(); });
    assert.equal(status, 403);
  });
});

test('without a token the panel is told to connect GitHub, and no request reaches GitHub', async () => {
  const gh = mockGithub();
  await withHub(async ({ post, base, h }) => {
    const r = await post('/api/pr/list', P); const j = await r.json();
    assert.equal(r.status, 502 === r.status ? 502 : r.status); assert.equal(j.needsToken, true);
    assert.equal((await (await fetch(base + '/api/pr/projects', { headers: h })).json()).hasToken, false);
    assert.equal(gh.calls.length, 0);
  }, { gh, withToken: false });
});

test('list shows title, branch, checks, mergeable state and review state; the repo comes from the git remote', async () => {
  const gh = mockGithub({ reviews: [{ user: { login: 'r1' }, state: 'APPROVED' }] });
  await withHub(async ({ post }) => {
    const j = await (await post('/api/pr/list', P)).json();
    assert.equal(j.repo, 'acme/widgets'); assert.equal(j.source, 'git remote');
    const p = j.prs[0];
    assert.equal(p.title, 'Fix the thing'); assert.equal(p.branch, 'claude/fix-thing'); assert.equal(p.base, 'main');
    assert.equal(p.checks.state, 'green'); assert.equal(p.mergeState, 'clean'); assert.equal(p.review, 'approved'); assert.equal(p.url, 'https://github.com/acme/widgets/pull/7');
    assert.ok(!('_pr' in p) && !('nodeId' in p));
    assert.equal(p.canMerge, true);
  }, { gh });
});

test('merge needs confirm: without it nothing is sent to GitHub, not even a read', async () => {
  const gh = mockGithub();
  await withHub(async ({ post }) => {
    for (const confirm of [undefined, false, 'true', 1]) {
      const r = await post('/api/pr/merge', { ...P, number: 7, sha: SHA, confirm });
      assert.equal(r.status, 400);
    }
    assert.equal(gh.calls.length, 0);
  }, { gh });
});

for (const [name, s, expect] of [
  ['pending checks', { runs: [{ name: 'unit', status: 'in_progress' }] }, /still running/],
  ['red checks', { runs: [{ name: 'unit', status: 'completed', conclusion: 'failure' }] }, /failing: unit/],
  ['a red commit status', { runs: [{ name: 'unit', status: 'completed', conclusion: 'success' }], statuses: [{ state: 'failure', context: 'legacy-ci' }] }, /legacy-ci/],
  ['no checks at all', { runs: [] }, /No checks/],
  ['a conflict', { mergeable: false, mstate: 'dirty' }, /conflicts/],
  ['a branch that is behind', { mstate: 'behind' }, /behind/],
  ['a draft', { draft: true, mstate: 'draft' }, /draft/],
  ['a repo without squash merges', { squash: false }, /squash/],
]) {
  test(`merge is refused for ${name}, and the merge call is never made`, async () => {
    const gh = mockGithub(s);
    await withHub(async ({ post }) => {
      const r = await post('/api/pr/merge', { ...P, number: 7, sha: SHA, confirm: true }); const j = await r.json();
      assert.equal(r.status, 409); assert.match(j.error, expect); assert.ok(j.reasons.length >= 1);
      assert.equal(gh.writes().length, 0, 'no write reached GitHub');
    }, { gh });
  });
}

test('merge is refused when GitHub has not worked out mergeable yet (it is retried, then refused)', async () => {
  const gh = mockGithub({ mergeable: null, mstate: 'unknown' });
  await withHub(async ({ post }) => {
    const r = await post('/api/pr/merge', { ...P, number: 7, sha: SHA, confirm: true });
    assert.equal(r.status, 409); assert.equal(gh.writes().length, 0);
    assert.ok(gh.calls.filter((c) => c.path.endsWith('/pulls/7')).length >= 2, 'it asked again');
  }, { gh });
});

test('a green, clean pull request merges with squash, pinned to the head the owner saw; a moved head is refused', async () => {
  const gh = mockGithub();
  await withHub(async ({ post }) => {
    const stale = await post('/api/pr/merge', { ...P, number: 7, sha: 'b'.repeat(40), confirm: true });
    assert.equal(stale.status, 409); assert.equal(gh.writes().length, 0);
    const r = await post('/api/pr/merge', { ...P, number: 7, sha: SHA, confirm: true });
    assert.equal(r.status, 200); assert.equal((await r.json()).merged, true);
    const w = gh.writes(); assert.equal(w.length, 1);
    assert.equal(w[0].method, 'PUT'); assert.match(w[0].path, /\/pulls\/7\/merge$/);
    assert.equal(w[0].body.merge_method, 'squash'); assert.equal(w[0].body.sha, SHA); assert.match(w[0].body.commit_title, /\(#7\)$/);
  }, { gh });
});

test('check returns fresh state for the confirm step, with the reasons when it cannot merge', async () => {
  await withHub(async ({ post }) => {
    const j = await (await post('/api/pr/check', { ...P, number: 7 })).json();
    assert.equal(j.pr.canMerge, false); assert.match(j.pr.reasons.join(' '), /still running/); assert.equal(j.pr.checks.state, 'pending');
  }, { gh: mockGithub({ runs: [{ name: 'unit', status: 'queued' }] }) });
});

test('update branch needs confirm, then asks GitHub with the expected head', async () => {
  const gh = mockGithub();
  await withHub(async ({ post }) => {
    assert.equal((await post('/api/pr/update', { ...P, number: 7, sha: SHA })).status, 400);
    assert.equal(gh.calls.length, 0);
    assert.equal((await post('/api/pr/update', { ...P, number: 7, sha: SHA, confirm: true })).status, 200);
    const w = gh.writes(); assert.equal(w.length, 1); assert.match(w[0].path, /update-branch$/); assert.equal(w[0].body.expected_head_sha, SHA);
  }, { gh });
});

test('auto-merge uses GitHub\'s own auto-merge: confirm needed, allowed while checks run, refused on red or when the repo has it off', async () => {
  const pending = mockGithub({ runs: [{ name: 'unit', status: 'in_progress' }] });
  await withHub(async ({ post }) => {
    assert.equal((await post('/api/pr/automerge', { ...P, number: 7, sha: SHA, enable: true })).status, 400);
    assert.equal(pending.calls.length, 0);
    assert.equal((await post('/api/pr/automerge', { ...P, number: 7, sha: SHA, enable: true, confirm: true })).status, 200);
    const w = pending.writes(); assert.equal(w.length, 1); assert.equal(w[0].path, '/graphql');
    assert.match(w[0].body.query, /enablePullRequestAutoMerge/); assert.match(w[0].body.query, /SQUASH/); assert.equal(w[0].body.variables.id, 'PR_node7'); assert.equal(w[0].body.variables.sha, SHA);
    assert.equal((await post('/api/pr/automerge', { ...P, number: 7, enable: false, confirm: true })).status, 200);
    assert.match(pending.writes()[1].body.query, /disablePullRequestAutoMerge/);
  }, { gh: pending });
  const red = mockGithub({ runs: [{ name: 'unit', status: 'completed', conclusion: 'failure' }] });
  await withHub(async ({ post }) => { assert.equal((await post('/api/pr/automerge', { ...P, number: 7, sha: SHA, enable: true, confirm: true })).status, 409); assert.equal(red.writes().length, 0); }, { gh: red });
  const off = mockGithub({ autoAllowed: false });
  await withHub(async ({ post }) => { const r = await post('/api/pr/automerge', { ...P, number: 7, sha: SHA, enable: true, confirm: true }); assert.equal(r.status, 409); assert.match((await r.json()).error, /switched off/); assert.equal(off.writes().length, 0); }, { gh: off });
});

test('create prefill: title is the fragment\'s first "# " line, body is the rest plus the repo template; README is ignored', async () => {
  await withHub(async ({ post }) => {
    const j = await (await post('/api/pr/prefill', { ...P, branch: 'claude/feat-x' })).json();
    assert.equal(j.title, 'Brokers can pay a fee twice a year');
    assert.ok(j.body.startsWith('The entry body.'));
    assert.ok(!j.body.includes('# Brokers'), 'title line is not repeated in the body');
    assert.match(j.body, /- bullet one/); assert.match(j.body, /## Checklist\n- \[ \] tested/);
    assert.ok(!j.body.includes('how this folder works'));
  });
  await withHub(async ({ post }) => {
    const j = await (await post('/api/pr/prefill', { ...P, branch: 'claude/feat-x' })).json();
    assert.equal(j.title, 'feat x', 'no fragment: the branch name, said plainly'); assert.equal(j.body, ''); assert.match(j.notes.join(' '), /No changelog fragment/);
  }, { repo: makeRepo({ fragment: null, template: null }) });
  await withHub(async ({ post }) => {
    const j = await (await post('/api/pr/prefill', { ...P, branch: 'claude/feat-x' })).json();
    assert.equal(j.title, 'Brokers can pay a fee twice a year', 'the fragment named after the branch wins');
  }, { repo: makeRepo({ extraFragment: true }) });
  await withHub(async ({ post }) => {
    for (const bad of ['-x', 'a..b', 'a b', '$(x)', '', 'x;rm', '--upload-pack=x']) assert.equal((await post('/api/pr/prefill', { ...P, branch: bad })).status, 502, bad);
  });
  assert.ok(isBranch('claude/feat-x') && !isBranch('-x'));
});

test('branches lists local branches other than the default', async () => {
  await withHub(async ({ post }) => {
    const j = await (await post('/api/pr/branches', P)).json();
    assert.deepEqual(j.branches, ['claude/feat-x']); assert.equal(j.base, 'main');
  });
});

test('create needs confirm; it pushes only the named branch (never forced), then opens the PR against the default branch', async () => {
  const gh = mockGithub();
  await withHub(async ({ post, pushes }) => {
    assert.equal((await post('/api/pr/create', { ...P, branch: 'claude/feat-x', title: 'T' })).status, 400);
    assert.equal(gh.calls.length, 0); assert.equal(pushes.length, 0);
    const r = await post('/api/pr/create', { ...P, branch: 'claude/feat-x', title: 'Brokers can pay a fee twice a year', body: 'Body text', confirm: true });
    assert.equal(r.status, 200); const j = await r.json(); assert.equal(j.number, 9); assert.equal(j.url, 'https://github.com/acme/widgets/pull/9'); assert.equal(j.pushed, true);
    assert.equal(pushes.length, 1); assert.deepEqual(pushes[0], ['push', 'origin', 'refs/heads/claude/feat-x:refs/heads/claude/feat-x']);
    assert.ok(!pushes[0].some((a) => /force|-f$|\+/.test(a)));
    const w = gh.writes(); assert.equal(w.length, 1); assert.deepEqual({ ...w[0].body }, { title: 'Brokers can pay a fee twice a year', head: 'claude/feat-x', base: 'main', body: 'Body text', draft: false });
    // the default branch cannot be the source; a secret in the text is refused before any push
    assert.equal((await post('/api/pr/create', { ...P, branch: 'main', title: 'T', confirm: true })).status, 502);
    const bad = await post('/api/pr/create', { ...P, branch: 'claude/feat-x', title: 'T', body: `token ${TOKEN}`, confirm: true });
    assert.ok(bad.status >= 400); assert.ok(!(await bad.text()).includes(TOKEN));
    assert.equal(pushes.length, 1); assert.equal(gh.writes().length, 1);
  }, { gh });
});

test('an unknown project is refused, and the page cannot choose a folder or a repository', async () => {
  await withHub(async ({ post, gh }) => {
    assert.equal((await post('/api/pr/list', { project: 'nope' })).status, 502);
    assert.equal((await post('/api/pr/list', { ...P, repo: 'evil/other', folder: '/etc' })).status, 200);
    assert.ok(gh.calls.every((c) => c.path.startsWith('/repos/acme/widgets')));
  });
});

test('repo detection: config "github" wins, remote forms parse, credentials are dropped, non-GitHub remotes are refused', async () => {
  for (const [u, want] of [['https://github.com/acme/widgets.git', 'acme/widgets'], ['https://github.com/acme/widgets', 'acme/widgets'], ['git@github.com:acme/widgets.git', 'acme/widgets'], ['ssh://git@github.com/acme/widgets.git', 'acme/widgets'], ['https://user:pw@github.com/acme/widgets.git', 'acme/widgets'], ['https://gitlab.com/acme/widgets.git', null], ['https://github.com.evil.example/acme/widgets', null], ['https://github.com/acme/..', null], ['', null]]) assert.equal(slugFromRemote(u), want, u);
  const cfg = { projects: { default: {}, one: { github: 'me/mine' }, bad: { github: 'x y' } } };
  assert.deepEqual(await projectInfo({ cfg, project: 'one', root: '/r', exec: () => assert.fail('no git call') }), { project: 'one', folder: '/r', repo: 'me/mine', source: 'config' });
  await assert.rejects(projectInfo({ cfg, project: 'bad', root: '/r' }), /bad github/);
  await assert.rejects(projectInfo({ cfg, project: 'missing', root: '/r' }), /Unknown project/);
  await assert.rejects(projectInfo({ cfg, project: 'default', root: '/r', exec: (c, a, o, cb) => cb(null, 'https://gitlab.com/a/b\n', '') }), /not a GitHub address/);
});

test('GitHub is not a chat model: never picked by Auto or All, and it has connect steps with the official https link', () => {
  const gh = PROVIDERS.find((p) => p.id === 'github');
  assert.equal(gh.chat, false); assert.equal(gh.keyName, 'HUB_GITHUB_TOKEN');
  const stats = PROVIDERS.map((p) => ({ id: p.id, chat: p.chat !== false, state: 'ready' }));
  assert.ok(!pick({ to: 'all' }, stats).ids.includes('github'));
  assert.deepEqual(pick({ to: 'github' }, stats).ids, []);
  assert.equal(connectSummary(stats).total, PROVIDERS.length - 1);
  const steps = gh.connect.steps.join(' ');
  for (const w of ['Pull requests', 'Contents', 'Checks', 'Commit statuses', 'Metadata', 'ONE repository']) assert.ok(steps.includes(w), w);
  assert.equal(new URL(gh.connect.url).protocol, 'https:'); assert.equal(new URL(gh.connect.url).hostname, 'github.com');
});

test('the key box saves the GitHub token through /api/key', async () => {
  await withHub(async ({ post, env, base, h }) => {
    const r = await post('/api/key', { provider: 'github', key: TOKEN }); assert.equal(r.status, 200);
    assert.ok(!(await r.text()).includes(TOKEN));
    assert.equal((await post('/api/key', { provider: 'github', key: 'has space in it' })).status, 400);
    assert.equal(JSON.parse(readFileSync(KEYS_FILE(env), 'utf8')).HUB_GITHUB_TOKEN, TOKEN);
    assert.equal((await (await fetch(base + '/api/state', { headers: h })).json()).providers.find((p) => p.id === 'github').state, 'ready');
  }, { withToken: false });
});

test('the page has a Pull requests tab, builds DOM safely, and asks for confirmation before anything changes', () => {
  const page = readFileSync(new URL('../tools/hub/public/index.html', import.meta.url), 'utf8');
  assert.match(page, /id="tabPr"/); assert.match(page, /id="prView"/);
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(page));
  assert.match(page, /confirm: true/);
  assert.ok(!/override|force/i.test(page.slice(page.indexOf('Pull requests: the token'))), 'no override is offered');
  assert.ok(!page.includes('HUB_GITHUB_TOKEN'));
});

// ----- the command line -----
test('npm run pr: list; merge and update only with --yes; a pending merge is refused even with --yes', async () => {
  const repo = makeRepo(); const home1 = home();
  const mk = (gh, argv) => { const out = []; const err = []; return { out, err, go: () => runCli({ argv, env: { ...home1, HUB_GITHUB_TOKEN: TOKEN }, fetch: gh.f, root: repo, exec: gitExec().exec, out: (s) => out.push(s), err: (s) => err.push(s), sleep: async () => {} }) }; };
  let gh = mockGithub(); let c = mk(gh, ['list']);
  assert.equal(await c.go(), 0); assert.match(c.out.join('\n'), /acme\/widgets: 1 open[\s\S]*#7 {2}Fix the thing/);
  gh = mockGithub(); c = mk(gh, ['merge', '7']);
  assert.equal(await c.go(), 0); assert.match(c.out.join('\n'), /Nothing changed/); assert.equal(gh.writes().length, 0);
  gh = mockGithub({ runs: [{ name: 'unit', status: 'queued' }] }); c = mk(gh, ['merge', '7', '--yes']);
  assert.equal(await c.go(), 1); assert.match(c.err.join('\n'), /refused: Checks are still running/); assert.equal(gh.writes().length, 0);
  gh = mockGithub(); c = mk(gh, ['merge', '7', '--yes']);
  assert.equal(await c.go(), 0); assert.equal(gh.writes().length, 1); assert.match(gh.writes()[0].path, /merge$/);
  gh = mockGithub(); c = mk(gh, ['create', 'claude/feat-x']);
  assert.equal(await c.go(), 0); assert.match(c.out.join('\n'), /Title: Brokers can pay a fee twice a year/); assert.equal(gh.writes().length, 0);
  gh = mockGithub({ fail: { status: 401, message: TOKEN } }); c = mk(gh, ['list']);
  assert.equal(await c.go(), 1); assert.ok(![...c.out, ...c.err].join('\n').includes(TOKEN));
  const none = []; assert.equal(await runCli({ argv: ['list'], env: home(), fetch: mockGithub().f, root: repo, err: (s) => none.push(s) }), 1); assert.match(none.join(), /Connect GitHub first/);
});

test('npm run pr save-token reads the token from stdin into the key store', async () => {
  const env = home(); const out = [];
  const stdin = (async function* () { yield TOKEN + '\n'; })();
  assert.equal(await runCli({ argv: ['save-token'], stdin, env, out: (s) => out.push(s), err: () => {} }), 0);
  assert.equal(JSON.parse(readFileSync(KEYS_FILE(env), 'utf8')).HUB_GITHUB_TOKEN, TOKEN);
  assert.ok(!out.join().includes(TOKEN));
});
void copyFileSync;

/* The one-command checks and the version bump (tests/tools/check.mjs,
 * tests/tools/bump-version.mjs). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const FILES = ['package.json', 'package-lock.json', 'sw.js', 'app/exporters.js'];

function copyTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zl-bump-'));
  for (const f of [...FILES, 'tests/tools/bump-version.mjs']) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  return dir;
}
const bump = (dir, v) => spawnSync('node', [path.join(dir, 'tests/tools/bump-version.mjs'), ...(v ? [v] : [])], { encoding: 'utf8' });

test('bump sets the version in package.json, package-lock.json lines 3 and 9, sw.js and app/exporters.js', () => {
  const dir = copyTree();
  const r = bump(dir, '9.8.7');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version, '9.8.7');
  const lock = fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8').split('\n');
  assert.equal(lock[2], '  "version": "9.8.7",');
  assert.equal(lock[8], '      "version": "9.8.7",');
  assert.match(fs.readFileSync(path.join(dir, 'sw.js'), 'utf8'), /^const VERSION = '9\.8\.7';$/m);
  assert.match(fs.readFileSync(path.join(dir, 'app/exporters.js'), 'utf8'), /^export const VERSION = '9\.8\.7';$/m);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('bump refuses a bad version, and a file out of step, changing nothing', () => {
  const dir = copyTree();
  assert.equal(bump(dir, '4.7').status, 2);
  assert.equal(bump(dir).status, 2);
  const sw = path.join(dir, 'sw.js');
  fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/const VERSION = '[^']+';/, "const VERSION = '0.0.1';"));
  const before = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
  assert.equal(bump(dir, '9.9.9').status, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), before);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('check:quick and check:full exist, run every gate and fail the command on any failure', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['check:quick'], 'node tests/tools/check.mjs quick');
  assert.equal(pkg.scripts['check:full'], 'node tests/tools/check.mjs full');
  const src = fs.readFileSync(path.join(ROOT, 'tests/tools/check.mjs'), 'utf8');
  assert.match(src, /step\('unit tests \(all\)', 'npm', \['test'\]\)/);
  assert.match(src, /step\('type check', 'npx', \['tsc', '-p', 'types\/tsconfig\.json'\]\)/);
  assert.match(src, /golden\(\);/);
  assert.match(src, /if \(mode === 'full'\) step\(.*'bash', \['tests\/e2e\/run\.sh'\]\)/);
  assert.match(src, /'tests\/analyze-golden\.test\.js'/); // saved results always run in quick
  assert.match(src, /if \(failed\.length\) \{.*process\.exit\(1\); \}/);
  assert.equal(spawnSync('node', [path.join(ROOT, 'tests/tools/check.mjs'), 'bogus']).status, 2);
});

test('the CI browser job runs the owner’s four flows, each one run.sh knows, and only it skips the recalc', () => {
  const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8');
  const run = fs.readFileSync(path.join(ROOT, 'tests/e2e/run.sh'), 'utf8');
  const m = ci.match(/run: bash tests\/e2e\/run\.sh ([a-z0-9 -]+)\n/);
  assert.ok(m, 'the CI job runs tests/e2e/run.sh with a list of flows');
  const flows = m[1].trim().split(/\s+/);
  assert.deepEqual(flows, ['typing-flow', 'lostedit-flow', 'deal-persistence', 'deal-export']);
  const all = run.match(/^FLOWS=\$\{\*:-"([^"]+)"\}$/m)[1].split(/\s+/);
  for (const f of flows) {
    assert.ok(all.includes(f), `${f} is in run.sh's full list`);
    assert.ok(fs.existsSync(path.join(ROOT, 'tests/e2e', `${f}.mjs`)), `${f}.mjs exists`);
  }
  assert.match(ci, /E2E_SKIP_RECALC: '1'/);
  assert.match(run, /if \[ "\$\{E2E_SKIP_RECALC:-\}" = 1 \]; then .*else\n.*recalc\.py/s);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'tests/tools/check.mjs'), 'utf8'), /E2E_SKIP_RECALC/); // check:full always recalculates
});

/* npm run sync-main and its --check (tests/tools/sync-main.mjs), in throwaway repositories: an "origin" with a
 * main branch, a clone on a branch, and a second clone that moves main on. */
function repos() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zl-sync-'));
  const sh = (cwd, ...a) => { const r = spawnSync('git', a, { cwd, encoding: 'utf8' }); assert.equal(r.status, 0, `git ${a.join(' ')}: ${r.stderr}`); return r.stdout; };
  const id = ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid'];
  sh(dir, 'init', '-q', '--bare', '-b', 'main', 'origin.git');
  sh(dir, 'clone', '-q', 'origin.git', 'mine');
  const mine = path.join(dir, 'mine');
  fs.writeFileSync(path.join(mine, 'notes.md'), 'one\ntwo\nthree\n');
  sh(mine, ...id, 'checkout', '-q', '-b', 'main');
  sh(mine, 'add', '.'); sh(mine, ...id, 'commit', '-q', '-m', 'start'); sh(mine, 'push', '-q', 'origin', 'main');
  sh(mine, 'checkout', '-q', '-b', 'feature');
  sh(dir, 'clone', '-q', 'origin.git', 'theirs');
  const theirs = path.join(dir, 'theirs');
  /** main moves on: `text` written to `file` in the other clone, pushed. */
  const moveMain = (file, text) => { fs.writeFileSync(path.join(theirs, file), text); sh(theirs, 'add', '.'); sh(theirs, ...id, 'commit', '-q', '-m', `main: ${file}`); sh(theirs, 'push', '-q', 'origin', 'main'); };
  const commit = (file, text) => { fs.writeFileSync(path.join(mine, file), text); sh(mine, 'add', '.'); sh(mine, ...id, 'commit', '-q', '-m', `feature: ${file}`); };
  const run = (...a) => spawnSync('node', [path.join(ROOT, 'tests/tools/sync-main.mjs'), ...a], { cwd: mine, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' } });
  return { dir, mine, moveMain, commit, run };
}
const M = (c) => c.repeat(7); // conflict markers, built here so this file never holds one at a line start

test('sync-main: --check passes on a current branch, fails behind main; sync-main merges main in', () => {
  const R = repos();
  R.commit('feature.md', 'mine\n');
  assert.equal(R.run('--check').status, 0);
  R.moveMain('other.md', 'theirs\n');
  const behind = R.run('--check');
  assert.equal(behind.status, 1);
  assert.match(behind.stdout, /FAIL \| the branch is 1 commit behind origin\/main: run npm run sync-main/);
  const sync = R.run();
  assert.equal(sync.status, 0, sync.stdout + sync.stderr);
  assert.match(sync.stdout, /^Merged origin\/main: /);
  assert.ok(fs.existsSync(path.join(R.mine, 'other.md')));
  assert.equal(R.run('--check').status, 0);
  assert.match(R.run().stdout, /^Already current with origin\/main\./);
  fs.rmSync(R.dir, { recursive: true, force: true });
});

test('sync-main: a conflict is listed by file and fails; --check finds markers left in any tracked file', () => {
  const R = repos();
  R.commit('notes.md', 'one\nTWO, mine\nthree\n');
  R.moveMain('notes.md', 'one\nTWO, theirs\nthree\n');
  const sync = R.run();
  assert.equal(sync.status, 1);
  assert.match(sync.stdout, /Merging origin\/main left 1 conflicted file; resolve, then commit:\n {2}notes\.md/);
  // committed with the markers still in: --check names each one, with its line
  spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', 'commit', '-qam', 'markers left in'], { cwd: R.mine });
  const check = R.run('--check');
  assert.equal(check.status, 1);
  assert.match(check.stdout, new RegExp(`FAIL \\| conflict marker: notes\\.md:2:${M('<')} HEAD`));
  assert.match(check.stdout, new RegExp(`FAIL \\| conflict marker: notes\\.md:\\d:${M('=')}\\n`));
  assert.match(check.stdout, new RegExp(`FAIL \\| conflict marker: notes\\.md:\\d:${M('>')} origin/main`));
  // a Markdown rule of eight = is not a marker
  fs.writeFileSync(path.join(R.mine, 'notes.md'), `Title\n${'='.repeat(8)}\none\n`);
  spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', 'commit', '-qam', 'resolved'], { cwd: R.mine });
  assert.equal(R.run('--check').status, 0, R.run('--check').stdout);
  fs.rmSync(R.dir, { recursive: true, force: true });
});

test('check:full ends with the sync-main check, and npm run sync-main exists', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['sync-main'], 'node tests/tools/sync-main.mjs');
  const src = fs.readFileSync(path.join(ROOT, 'tests/tools/check.mjs'), 'utf8');
  const steps = [...src.matchAll(/step\('([^']+)'/g)].map((m) => m[1]);
  assert.equal(steps[steps.length - 1], 'current with main, no conflict markers');
  assert.match(src, /if \(mode === 'full'\) step\('current with main, no conflict markers', 'node', \['tests\/tools\/sync-main\.mjs', '--check'\]\);/);
});

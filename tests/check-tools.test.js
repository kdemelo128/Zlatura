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

const FRAGMENT = '# an invented release, in plain words\n\n- **One change**, tested.\n';
/** The release files in a throwaway folder, with one changelog fragment waiting (unless `fragment` is null). */
function copyTree(fragment = FRAGMENT) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zl-bump-'));
  for (const f of [...FILES, 'CHANGELOG.md', 'tests/tools/bump-version.mjs', 'tests/tools/changelog.mjs', 'tests/tools/escape.mjs']) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  fs.mkdirSync(path.join(dir, 'docs/changelog/unreleased'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs/changelog/unreleased/README.md'), 'not a fragment\n');
  if (fragment !== null) fs.writeFileSync(path.join(dir, 'docs/changelog/unreleased/claude-invented.md'), fragment);
  return dir;
}
const snapshot = (dir) => Object.fromEntries([...FILES, 'CHANGELOG.md'].map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
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

test('bump folds the one changelog fragment into CHANGELOG.md, at the top, and removes it', () => {
  const dir = copyTree();
  const before = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8');
  const r = bump(dir, '9.8.7');
  assert.equal(r.status, 0, r.stderr);
  const after = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8');
  // the new entry first; every earlier one after it, byte for byte
  assert.equal(after, `# Changelog\n\n## 9.8.7: an invented release, in plain words (on the development branch; not merged or deployed)\n\n- **One change**, tested.\n\n${before.slice('# Changelog\n\n'.length)}`);
  assert.ok(!fs.existsSync(path.join(dir, 'docs/changelog/unreleased/claude-invented.md')), 'the fragment is removed');
  assert.ok(fs.existsSync(path.join(dir, 'docs/changelog/unreleased/README.md')), 'the folder README stays');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('bump changes nothing with no fragment, two fragments, or a malformed one', () => {
  for (const [why, make, msg] of [
    ['none', () => copyTree(null), /no changelog fragment is waiting/],
    ['two', () => { const d = copyTree(); fs.writeFileSync(path.join(d, 'docs/changelog/unreleased/claude-other.md'), FRAGMENT); return d; }, /2 changelog fragments are waiting/],
    ['no title', () => copyTree('an entry with no title line\n'), /the first line must be "# <title>"/],
    ['empty', () => copyTree('# a title\n\n'), /the entry is empty/],
    ['a version in the title', () => copyTree('# 9.8.7: a title\n\nbody\n'), /the title is the plain words only/],
    ['a version heading inside', () => copyTree('# a title\n\n## 1.2.3: another\n'), /holds a version heading/],
  ]) {
    const dir = make();
    const before = snapshot(dir);
    const r = bump(dir, '9.8.7');
    assert.equal(r.status, 1, `${why}: ${r.stderr}`);
    assert.match(r.stderr, msg, why);
    assert.match(r.stderr, /nothing changed/, why);
    assert.deepEqual(snapshot(dir), before, `${why}: nothing changed`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the changelog’s top entry is the version package.json says, and any fragment waiting is well formed', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const log = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  assert.equal((/^## (\d+\.\d+\.\d+):/m.exec(log) || [])[1], pkg.version);
  const r = spawnSync('node', [path.join(ROOT, 'tests/tools/changelog.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout);
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
  assert.match(fs.readFileSync(path.join(ROOT, 'tests/tools/affected.mjs'), 'utf8'), /'tests\/analyze-golden\.test\.js'/); // saved results always run in quick
  assert.match(src, /affectedTests\(changed, ROOT\)/);
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

/* the two conflicts that recur (#28 against #27): both PRs wrote the top of CHANGELOG.md and the version */
const LOG = (...vs) => `# Changelog\n\n${vs.map((v) => `## ${v}: release ${v} (on the development branch; not merged or deployed)\n\nWhat ${v} did.\n\n`).join('')}`;
const PKG = (v) => `{\n  "name": "zlatura",\n  "version": "${v}",\n  "private": true\n}\n`;
function releaseRepos() {
  const R = repos();
  // the start, on main: 4.7.0
  R.commit('CHANGELOG.md', LOG('4.7.0')); R.commit('package.json', PKG('4.7.0'));
  spawnSync('git', ['push', '-q', 'origin', 'feature:main'], { cwd: R.mine });
  spawnSync('git', ['pull', '-q', 'origin', 'main'], { cwd: path.join(R.dir, 'theirs') });
  return R;
}

test('sync-main: CHANGELOG.md and version conflicts resolve on their own: both entries, newest first, the higher version', () => {
  const R = releaseRepos();
  const SW = (v) => `const VERSION = '${v}';\nconst CACHE = \`zlatura-\${VERSION}\`;\n`;
  R.commit('sw.js', SW('4.7.0')); spawnSync('git', ['push', '-q', 'origin', 'feature:main'], { cwd: R.mine }); spawnSync('git', ['pull', '-q', 'origin', 'main'], { cwd: path.join(R.dir, 'theirs') });
  R.moveMain('CHANGELOG.md', LOG('4.7.1', '4.7.0')); R.moveMain('package.json', PKG('4.7.1')); R.moveMain('sw.js', SW('4.7.9'));
  R.commit('CHANGELOG.md', LOG('4.7.2', '4.7.0')); R.commit('package.json', PKG('4.7.2')); R.commit('sw.js', SW('4.7.2'));
  const sync = R.run();
  assert.equal(sync.status, 0, sync.stdout + sync.stderr);
  assert.match(sync.stdout, /Resolved on their own: CHANGELOG\.md, package\.json, sw\.js/);
  // the higher version wins, whichever side has it
  assert.equal(fs.readFileSync(path.join(R.mine, 'sw.js'), 'utf8'), SW('4.7.9'));
  assert.match(sync.stdout, /Merged origin\/main: /);
  assert.equal(fs.readFileSync(path.join(R.mine, 'CHANGELOG.md'), 'utf8'), LOG('4.7.2', '4.7.1', '4.7.0'));
  assert.equal(fs.readFileSync(path.join(R.mine, 'package.json'), 'utf8'), PKG('4.7.2'));
  assert.equal(R.run('--check').status, 0, 'current with main, no markers');
  fs.rmSync(R.dir, { recursive: true, force: true });
});

test('sync-main: anything else stays for a person, and so does one version written two ways', () => {
  const R = releaseRepos();
  R.moveMain('CHANGELOG.md', LOG('4.7.1', '4.7.0')); R.moveMain('notes.md', 'one\nTHEIRS\nthree\n');
  R.commit('CHANGELOG.md', LOG('4.7.2', '4.7.0')); R.commit('notes.md', 'one\nMINE\nthree\n');
  const sync = R.run();
  assert.equal(sync.status, 1);
  assert.match(sync.stdout, /Resolved on their own: CHANGELOG\.md/);
  assert.match(sync.stdout, /left 1 conflicted file; resolve, then commit:\n {2}notes\.md/);
  spawnSync('git', ['merge', '--abort'], { cwd: R.mine });
  // two PRs that both took 4.7.1, with different entries, in one conflict: not guessed
  R.commit('CHANGELOG.md', '# Changelog\n\n## 4.7.1: mine\nMine did this.\n\n## 4.7.0: release 4.7.0 (on the development branch; not merged or deployed)\n\nWhat 4.7.0 did.\n\n');
  R.moveMain('CHANGELOG.md', '# Changelog\n\n## 4.7.1: theirs\nTheirs did that.\n\n## 4.7.0: release 4.7.0 (on the development branch; not merged or deployed)\n\nWhat 4.7.0 did.\n\n');
  R.commit('notes.md', 'one\nTHEIRS\nthree\n');
  const again = R.run();
  assert.equal(again.status, 1);
  assert.doesNotMatch(again.stdout, /Resolved on their own/);
  assert.match(again.stdout, /CHANGELOG\.md/);
  fs.rmSync(R.dir, { recursive: true, force: true });
});

/* check:quick must never skip the tests that read the whole repository: a new app file named by no test (4.7.19:
 * app/scale.js missing from sw.js) passed quick and failed CI three times. */
const { affectedTests, ALWAYS } = await import('./tools/affected.mjs');

test('check:quick always runs the saved-results test and the repository test (offline cache list, imports, no outside requests)', () => {
  for (const changed of [[], ['app/brandnew-module.js'], ['sw.js'], ['docs/NOW.md']]) {
    const picked = affectedTests(changed, ROOT);
    for (const t of ALWAYS) assert.ok(picked.includes(t), `${t} missing for ${JSON.stringify(changed)}`);
  }
  assert.ok(ALWAYS.includes('tests/repo.test.js') && ALWAYS.includes('tests/analyze-golden.test.js'));
});

test('check:quick stays selective: a change picks the tests that name its module, not every test', () => {
  const all = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.js')).length;
  const picked = affectedTests(['app/lease.js'], ROOT);
  assert.ok(picked.includes('tests/lease.test.js'));
  assert.ok(picked.length < all, `${picked.length} of ${all}`);
});

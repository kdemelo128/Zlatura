/* tests/tools/check.mjs -- the checks as one command each.
 *
 *   npm run check:quick   while developing: the unit tests the change can
 *                         affect, the type check and the golden check
 *   npm run check:full    once before each PR: the whole Node suite (and the AI
 *                         server's own suite, which quick runs too when server/
 *                         changed), the type
 *                         check, the golden check and the full browser suite
 *                         (tests/e2e/run.sh: every flow, axe, perf budgets,
 *                         typing, LibreOffice recalc), and last that the
 *                         branch is current with main with no conflict
 *                         markers (tests/tools/sync-main.mjs --check)
 *
 * Every step runs even when one fails; any failure makes the command exit 1.
 * The golden check compares every displayed figure with the base branch
 * (BASE_REF, default origin/main) and fails on any change, unless the owner
 * approved it: GOLDEN_CHANGE_APPROVED=1 still prints the before/after table
 * but doesn't fail. Saved deal results (618) are checked by
 * tests/analyze-golden.test.js, which check:quick always runs, as it does
 * tests/repo.test.js (the offline cache lists every file, every import exists,
 * no request leaves the site): a new app file names no test, yet breaks those. */
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { affectedTests } from './affected.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const mode = process.argv[2];
if (mode !== 'quick' && mode !== 'full') { console.error('usage: node tests/tools/check.mjs quick|full'); process.exit(2); }
const BASE = process.env.BASE_REF || 'origin/main';
const failed = [];
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
function step(name, cmd, args, opts = {}) {
  console.log(`\n===== ${name}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });
  if (r.status !== 0) failed.push(name);
  return r.status === 0;
}

/** Files changed against the base, committed or not. */
function changedFiles() {
  const base = git('merge-base', BASE, 'HEAD');
  const out = [git('diff', '--name-only', base), git('diff', '--name-only'), git('ls-files', '--others', '--exclude-standard')];
  return [...new Set(out.join('\n').split('\n').filter(Boolean))];
}

/** Every displayed figure, base against the working tree. */
function golden() {
  console.log(`\n===== golden: displayed figures against ${BASE}`);
  if (!fs.existsSync(path.join(ROOT, 'tests/e2e/files/pages.json'))) {
    console.log('FAIL | tests/e2e/files/pages.json is missing: run bash tests/e2e/run.sh once to make it');
    failed.push('golden'); return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zl-golden-'));
  try {
    execFileSync('sh', ['-c', `git archive ${BASE} app | tar -x -C "${tmp}"`], { cwd: ROOT });
    const run = (dir, out) => fs.writeFileSync(out, execFileSync('node', ['tests/tools/golden.mjs', dir], { cwd: ROOT, maxBuffer: 1 << 28 }));
    run(path.join(tmp, 'app'), path.join(tmp, 'a.json'));
    run(path.join(ROOT, 'app'), path.join(tmp, 'b.json'));
    const a = JSON.parse(fs.readFileSync(path.join(tmp, 'a.json'), 'utf8'));
    const b = JSON.parse(fs.readFileSync(path.join(tmp, 'b.json'), 'utf8'));
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    const changed = keys.filter((k) => a[k] !== b[k]);
    console.log(`${keys.length} figures compared, ${changed.length} changed`);
    if (changed.length) {
      console.log(execFileSync('node', ['tests/tools/golden.mjs', '--diff', path.join(tmp, 'a.json'), path.join(tmp, 'b.json')], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
      if (process.env.GOLDEN_CHANGE_APPROVED === '1') console.log('(changes allowed: GOLDEN_CHANGE_APPROVED=1; put the table in the PR)');
      else { console.log('FAIL | displayed figures changed; if the owner approved this change, run again with GOLDEN_CHANGE_APPROVED=1'); failed.push('golden'); }
    }
  } catch (e) {
    console.log(`FAIL | golden check could not run: ${e.message.split('\n')[0]}`); failed.push('golden');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

const changed = mode === 'quick' ? changedFiles() : null;
if (mode === 'quick') {
  const tests = affectedTests(changed, ROOT);
  console.log(`changed against ${BASE}: ${changed.length} files; unit tests to run: ${tests.join(' ')}`);
  step('unit tests (affected)', 'node', ['--test', ...tests]);
} else {
  step('unit tests (all)', 'npm', ['test']);
}
// the AI server's own suite (server/, its own package): CI's test job runs it, so full always does too, and quick
// does whenever a server/ file changed; its one package is installed first if missing
if (mode === 'full' || changed.some((f) => f.startsWith('server/'))) {
  const SERVER = path.join(ROOT, 'server');
  if (!fs.existsSync(path.join(SERVER, 'node_modules', '@anthropic-ai', 'sdk'))) step('AI server install', 'npm', ['ci', '--silent'], { cwd: SERVER });
  step('AI server tests', 'npm', ['test'], { cwd: SERVER });
}
step('type check', 'npx', ['tsc', '-p', 'types/tsconfig.json']);
golden();
if (mode === 'full') step('browser suite (flows, axe, perf, typing, recalc)', 'bash', ['tests/e2e/run.sh']);
// last: the branch is current with main and no conflict marker is left (npm run sync-main fixes the first)
if (mode === 'full') step('current with main, no conflict markers', 'node', ['tests/tools/sync-main.mjs', '--check']);

if (failed.length) { console.log(`\n===== check:${mode} FAILED: ${failed.join(', ')}`); process.exit(1); }
console.log(`\n===== check:${mode} passed`);

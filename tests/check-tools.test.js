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

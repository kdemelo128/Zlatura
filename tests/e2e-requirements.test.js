/* tests/e2e/check_requirements.py: the browser suite stops when an installed fixture package differs from its pin in
 * tests/e2e/requirements.txt (a Pillow older than the pinned 13.0.0 has published security advisories), and
 * run.sh runs that check before it builds any fixture. Fails on 4.7.42, which has neither. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const E2E = new URL('./e2e/', import.meta.url).pathname;
const run = (reqs) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqs-'));
  const f = path.join(dir, 'requirements.txt');
  fs.writeFileSync(f, reqs);
  const r = spawnSync('python3', [path.join(E2E, 'check_requirements.py'), f], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
};

test('a pin the installed package does not match stops the suite, naming both versions and the install command', () => {
  const r = run('# comment\nPillow==0.0.1\n');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Pillow: pinned 0\.0\.1, installed /);
  assert.match(r.stderr, /python3 -m pip install -r /);
});

test('a package that is not installed at all is named as "none"', () => {
  const r = run('zz-no-such-package-for-zlatura==1.0.0\n');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /zz-no-such-package-for-zlatura: pinned 1\.0\.0, installed none/);
});

test('a file with no pins passes, and the real requirements pin Pillow to the patched 13.0.0 exactly', () => {
  assert.equal(run('# nothing pinned\n').status, 0);
  const reqs = fs.readFileSync(path.join(E2E, 'requirements.txt'), 'utf8');
  assert.match(reqs, /^Pillow==13\.0\.0$/m);
});

test('run.sh checks the pins before it builds any fixture', () => {
  const sh = fs.readFileSync(path.join(E2E, 'run.sh'), 'utf8');
  const check = sh.indexOf('python3 check_requirements.py requirements.txt');
  assert.ok(check > 0, 'the check is in run.sh');
  assert.ok(check < sh.indexOf('make_pdfs.py'), 'before the fixtures are made');
});

/* tests/e2e/run.sh takes a lock before it uses port 8080, so two sessions or
 * worktrees on one machine wait for each other instead of colliding. The lock
 * block is cut out of run.sh and run on its own here. Fails on 4.7.46, which
 * has no lock. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const sh = fs.readFileSync(new URL('./e2e/run.sh', import.meta.url), 'utf8');
const block = sh.slice(sh.indexOf('LOCK='), sh.indexOf("trap 'rm -rf \"$LOCK\"' EXIT"));
const run = (env) => spawnSync('bash', ['-c', `set -euo pipefail\n${block}\necho GOT $(cat "$LOCK/pid")`], { env: { ...process.env, ...env }, encoding: 'utf8' });

test('run.sh takes the lock before anything else, and lets it go on exit', () => {
  assert.ok(block.includes('mkdir "$LOCK"'), 'run.sh has the lock block');
  assert.ok(sh.indexOf('LOCK=') < sh.indexOf('check_requirements.py'), 'the lock comes first');
  assert.match(sh, /trap 'kill \$SERVER[^']*rm -rf "\$LOCK"' EXIT/);
});

test('a free lock is taken; one held by a live run is waited for, then refused', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zl-lock-'));
  const LOCK = path.join(dir, 'l');
  const free = run({ E2E_LOCK: LOCK });
  assert.equal(free.status, 0, free.stderr);
  assert.match(free.stdout, /^GOT \d+/);
  const holder = spawn('sleep', ['30']);
  try {
    fs.rmSync(LOCK, { recursive: true, force: true });
    fs.mkdirSync(LOCK); fs.writeFileSync(path.join(LOCK, 'pid'), String(holder.pid));
    const held = run({ E2E_LOCK: LOCK, E2E_LOCK_WAIT: '2' });
    assert.equal(held.status, 2);
    assert.match(held.stderr, new RegExp(`PID ${holder.pid}\\) holds port 8080: waiting`));
    assert.match(held.stderr, /Still held after 2s/);
    assert.equal(fs.readFileSync(path.join(LOCK, 'pid'), 'utf8'), String(holder.pid), 'the live holder keeps its lock');
  } finally { holder.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a lock left by a run that is gone is taken over', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zl-lock-'));
  const LOCK = path.join(dir, 'l');
  const gone = spawnSync('bash', ['-c', 'echo $$']).stdout.toString().trim();
  fs.mkdirSync(LOCK); fs.writeFileSync(path.join(LOCK, 'pid'), gone);
  const r = run({ E2E_LOCK: LOCK, E2E_LOCK_WAIT: '3' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^GOT \d+/);
  assert.doesNotMatch(r.stdout, new RegExp(`^GOT ${gone}$`));
});

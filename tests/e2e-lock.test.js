/* tests/e2e/run.sh claims a slot of ports before it starts its server, so up to eight sessions or worktrees on one
 * machine can run the browser suite at once instead of waiting for each other: slot 0 is the one CI and older
 * branches use (8080, and 8096-8098 for the flows that serve an old copy); slot n uses 8080+n and 9000+10n to
 * 9002+10n. The claim block is cut out of run.sh and run on its own here. Fails on 4.7.56, which has one lock. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const sh = fs.readFileSync(new URL('./e2e/run.sh', import.meta.url), 'utf8');
const block = sh.slice(sh.indexOf('LOCKDIR='), sh.indexOf('[ "$SLOT" = 0 ] || echo'));
const run = (env) => spawnSync('bash', ['-c', `set -euo pipefail\n${block}\necho "GOT $SLOT $PORT $BASE $MIGRATE_PORT $RENAME_PORT $UPGRADE_PORT"`], { env: { ...process.env, BASE: '', MIGRATE_PORT: '', RENAME_PORT: '', UPGRADE_PORT: '', ...env }, encoding: 'utf8' });
const dirs = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'zl-slot-')); dirs.push(d); return d; };
const hold = (dir, name, pid) => { fs.mkdirSync(path.join(dir, name)); fs.writeFileSync(path.join(dir, name, 'pid'), String(pid)); };
test.after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

test('run.sh claims a slot before anything else, serves on its port, and lets the slot go on exit', () => {
  assert.ok(block.includes('mkdir "$L"'), 'run.sh has the slot block');
  assert.ok(sh.indexOf('LOCKDIR=') < sh.indexOf('check_requirements.py'), 'the claim comes first');
  assert.match(sh, /http\.server "\$PORT"/);
  assert.match(sh, /trap 'kill \$SERVER[^']*rm -rf "\$LOCK"' EXIT/);
});

test('a free machine gets slot 0: port 8080 and the side ports CI has always used', () => {
  const r = run({ E2E_LOCK_DIR: tmp() });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^GOT 0 8080 http:\/\/localhost:8080\/ (\S*) (\S*) (\S*)$/m);
  const [, , , , mig, ren, upg] = r.stdout.trim().split(' ');
  assert.deepEqual([mig, ren, upg], ['8096', '8097', '8098']);
});

test('slot 0 held by a live run: this run takes slot 1, with its own ports, and does not wait', () => {
  const dir = tmp();
  const live = spawn('sleep', ['30']);
  try {
    hold(dir, 'zlatura-e2e-8080.lock', live.pid);
    const t0 = Date.now();
    const r = run({ E2E_LOCK_DIR: dir });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'GOT 1 8081 http://localhost:8081/ 9010 9011 9012');
    assert.ok(Date.now() - t0 < 3000, 'no wait');
    assert.equal(fs.readFileSync(path.join(dir, 'zlatura-e2e-8080.lock', 'pid'), 'utf8'), String(live.pid), 'the live run keeps its slot');
  } finally { live.kill(); }
});

test('every slot busy: the run waits, then says so and stops', () => {
  const dir = tmp();
  const a = spawn('sleep', ['30']); const b = spawn('sleep', ['30']);
  try {
    hold(dir, 'zlatura-e2e-8080.lock', a.pid); hold(dir, 'zlatura-e2e-slot1.lock', b.pid);
    const r = run({ E2E_LOCK_DIR: dir, E2E_SLOTS: '2', E2E_LOCK_WAIT: '2' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /All 2 browser-run slots are busy: waiting for one\./);
    assert.match(r.stderr, /Still busy after 2s/);
  } finally { a.kill(); b.kill(); }
});

test('a slot left by a run that is gone is taken over', () => {
  const dir = tmp();
  const gone = spawnSync('bash', ['-c', 'echo $$']).stdout.toString().trim();
  hold(dir, 'zlatura-e2e-8080.lock', gone);
  const r = run({ E2E_LOCK_DIR: dir });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^GOT 0 8080 /m, 'the stale slot 0 is taken, not skipped for slot 1');
  assert.ok(!fs.existsSync(path.join(dir, 'zlatura-e2e-8080.lock')), 'and the run let it go on exit');
});

test('a BASE given by the caller (an old-code run) is kept', () => {
  const r = run({ E2E_LOCK_DIR: tmp(), BASE: 'http://127.0.0.1:8181/' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^GOT 0 8080 http:\/\/127\.0\.0\.1:8181\/ /m);
});

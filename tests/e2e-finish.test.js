/* The browser flows must fail loudly. Every flow that tests/e2e/run.sh runs
 * ends with finish() from tests/e2e/finish.mjs, which makes the process exit
 * with an error when a check failed or no check ran; E2E_FORCE_FAIL adds a
 * failing check on purpose, to prove a failure turns the run red. Runs
 * without a browser. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const E2E = new URL('./e2e/', import.meta.url).pathname;
const FINISH = new URL('./e2e/finish.mjs', import.meta.url).href;
const flows = fs.readFileSync(E2E + 'run.sh', 'utf8').match(/^FLOWS=\$\{1:-"([^"]+)"\}$/m)[1].split(/\s+/);

/** Runs a tiny flow that ends with finish(R), as a file named `name`.mjs; returns its exit code and output. */
function run(results, env = {}, name = 'tiny-flow') {
  const dir = fs.mkdtempSync(`${fs.realpathSync('/tmp')}/e2e-finish-`);
  const file = `${dir}/${name}.mjs`;
  fs.writeFileSync(file, `import { finish } from ${JSON.stringify(FINISH)};\nconst R = ${JSON.stringify(results)};\nfinish(R, 'errors', []);\n`);
  const env2 = { ...process.env, ...env }; if (!('E2E_FORCE_FAIL' in env)) delete env2.E2E_FORCE_FAIL;
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8', env: env2 });
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: r.stdout };
}

test('a flow whose checks all pass exits 0 and prints the usual summary', () => {
  const r = run([['PASS', 'a', ''], ['PASS', 'b', '']]);
  assert.equal(r.code, 0);
  assert.match(r.out, /^PASS 2 FAIL 0 errors \[\]$/m);
});

test('one failed check makes the flow exit with an error', () => {
  const r = run([['PASS', 'a', ''], ['FAIL', 'b', 'why']]);
  assert.equal(r.code, 1);
  assert.match(r.out, /^PASS 1 FAIL 1 /m);
});

test('a flow that ran no checks fails rather than passing silently', () => {
  const r = run([]);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL \| no checks ran/);
});

test('E2E_FORCE_FAIL fails a passing flow on purpose: for every flow (1) or for the named ones', () => {
  const pass = [['PASS', 'a', '']];
  const all = run(pass, { E2E_FORCE_FAIL: '1' });
  assert.equal(all.code, 1);
  assert.match(all.out, /FAIL \| forced failure \(E2E_FORCE_FAIL\)/);
  assert.match(all.out, /^PASS 1 FAIL 1 /m);
  assert.equal(run(pass, { E2E_FORCE_FAIL: 'other-flow,tiny-flow' }).code, 1, 'named in the list');
  assert.equal(run(pass, { E2E_FORCE_FAIL: 'other-flow' }).code, 0, 'another flow named: this one passes');
});

test('every flow run.sh runs ends with finish(), and none prints its own summary or sets its own exit code from it', () => {
  assert.ok(flows.length >= 30, `${flows.length} flows`);
  for (const f of flows) {
    const src = fs.readFileSync(`${E2E}${f}.mjs`, 'utf8');
    assert.match(src, /import \{[^}]*\bfinish\b[^}]*\} from '\.\/lib\.mjs'/, `${f} imports finish`);
    assert.match(src, /^\s*finish\(R\b/m, `${f} ends with finish(R)`);
    assert.doesNotMatch(src, /console\.log\(\s*['`]PASS/, `${f} prints its own PASS/FAIL summary`);
  }
});

test('run.sh runs every flow, lists the ones that failed and exits with an error; recalc mismatches count too', () => {
  const sh = fs.readFileSync(E2E + 'run.sh', 'utf8');
  assert.match(sh, /node "\$f\.mjs" \|\| FAILED\+=\("\$f"\)/);
  assert.match(sh, /recalc\.py "\$x" \|\| FAILED\+=/);
  assert.match(sh, /if \[ \$\{#FAILED\[@\]\} -gt 0 \]; then .*exit 1; fi/);
  assert.match(fs.readFileSync(E2E + 'recalc.py', 'utf8'), /if errs or mism: sys\.exit\(1\)/);
});

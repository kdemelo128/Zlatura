/* The two local measuring tools (tests/tools/doc-local.mjs, tests/tools/uw-oracle.mjs): the scoreboard's shape and
 * totals, that no name or figure is ever printed (a canary), the private/ guard, the labels map only on request, and
 * the oracle's "not run" / exit codes and its comparison with a package (an invented stand-in, run in a vm). Every
 * file here is invented. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'tests/tools/doc-local.mjs');
const ORACLE = path.join(ROOT, 'tests/tools/uw-oracle.mjs');
const run = (script, args, env = {}) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, UW_PACKAGE_DIR: '', ...env }, timeout: 120000 });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'doc-local-'));

const CANARY_NAME = 'Zorblax Canary Holdings';
const CANARY_FIGURE = '987654';

/** A folder of invented files: a T-12 (with an answer file), a rent roll holding the canary, and a file nothing reads. */
function folder() {
  const d = path.join(tmp(), 'docs'); // the labels map goes next to it, in its own parent
  fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, 'alpha.csv'), ['Account,Jan 2026,Feb 2026,Mar 2026,Apr 2026,May 2026,Jun 2026,Total', 'Income', 'Base Rent,1000,1000,1000,1000,1000,1000,6000', 'Operating Expenses', 'Real Estate Taxes,200,200,200,200,200,200,1200', 'Repairs,100,100,100,100,100,100,600'].join('\n'));
  fs.writeFileSync(path.join(d, 'alpha.answers.json'), JSON.stringify({ noi: 4200, months: 6, egi: 6000, opex: 1 }));
  fs.writeFileSync(path.join(d, 'beta.csv'), ['Unit,Tenant,SF,Monthly Rent,Lease End', `101,${CANARY_NAME},${CANARY_FIGURE},2400,2028-01-31`, '102,Vacant,0,0,'].join('\n'));
  fs.writeFileSync(path.join(d, 'gamma.bin'), Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 0, 255, 254, 9]));
  return d;
}

test('doc-local: the scoreboard has its header, a row per family and totals that add up', () => {
  const d = folder();
  const r = run(DOC, [d, '--allow-outside-private']);
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split('\n');
  assert.match(lines.find((l) => l.startsWith('doc-local:')), /^doc-local: 3 file\(s\)/);
  assert.ok(lines.includes('family | files | accepted | asked | refused | answer files | fields right | wrong | asked | missed'));
  // t12: 1 file accepted, 1 answer file with 4 fields: noi, months, egi right; opex wrong (the answer says 1)
  assert.ok(lines.includes('t12 | 1 | 1 | 0 | 0 | 1 | 3 | 1 | 0 | 0'), r.stdout);
  assert.ok(lines.includes('rrsheet | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0'), r.stdout);
  const row = lines.filter((l) => /^[^|]+ \| \d/.test(l) && !l.startsWith('TOTAL')).map((l) => l.split(' | ').map((x, i) => (i ? Number(x) : x)));
  const sum = (i) => row.reduce((s, x) => s + x[i], 0);
  const total = lines.find((l) => l.startsWith('TOTAL')).split(' | ').slice(1).map(Number);
  assert.deepEqual(total, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(sum), 'TOTAL is the sum of the family rows');
  assert.equal(total[0], 3);
  assert.equal(total[1] + total[2] + total[3], 3, 'every file is accepted, asked or refused');
  assert.equal(total[3], 1, 'the unreadable file is refused');
});

test('doc-local: no name, tenant, file name or figure is printed', () => {
  const d = folder();
  for (const extra of [[], ['--labels'], ['--verbose-files']]) {
    const r = run(DOC, [d, '--allow-outside-private', ...extra]);
    const out = r.stdout + r.stderr;
    for (const s of [CANARY_NAME, 'Zorblax', CANARY_FIGURE, 'alpha', 'beta', 'gamma', path.dirname(d), '4200', '6000']) assert.ok(!out.includes(s), `the output must not hold "${s}" (${extra.join(' ') || 'plain'})`);
  }
});

test('doc-local: refuses a folder outside private/ without the flag', () => {
  const d = folder();
  const r = run(DOC, [d]);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /^Refused: /);
  assert.ok(!/files read/.test(r.stdout), 'nothing was read');
  assert.ok(!fs.existsSync(path.join(path.dirname(d), 'doc-local-labels.json')));
});

test('doc-local: the labels map is written only with --labels, and holds the file names', () => {
  const d = folder();
  const map = path.join(path.dirname(d), 'doc-local-labels.json');
  fs.rmSync(map, { force: true });
  run(DOC, [d, '--allow-outside-private']);
  assert.ok(!fs.existsSync(map), 'not written unless asked');
  run(DOC, [d, '--allow-outside-private', '--labels']);
  const m = JSON.parse(fs.readFileSync(map, 'utf8'));
  fs.rmSync(map, { force: true });
  assert.deepEqual(Object.keys(m), ['file-01', 'file-02', 'file-03']);
  assert.deepEqual(Object.values(m), ['alpha.csv', 'beta.csv', 'gamma.bin']);
});

/* ------------------------------------------------------------ the oracle */

test('uw-oracle: without UW_PACKAGE_DIR it prints "not run" and exits 0; with --require-oracle it exits 3', () => {
  const a = run(ORACLE, []);
  assert.equal(a.status, 0, a.stderr);
  assert.match(a.stdout, /oracle: not run \(set UW_PACKAGE_DIR\)/);
  assert.match(a.stdout, /uw-oracle: 3 invented case\(s\)/);
  const b = run(ORACLE, ['--require-oracle']);
  assert.equal(b.status, 3);
  assert.match(b.stdout, /oracle: not run/);
  const c = run(ORACLE, ['--require-oracle'], { UW_PACKAGE_DIR: path.join(tmp(), 'nothing-here') });
  assert.equal(c.status, 3, 'a folder with no calculation script is not a run either');
});

// An independent, invented stand-in for a package's finance.js (percent in, percent out), worked a different way.
const STAND_IN = `window.UWFinance = {
  irr: function (f) { var r = 0.1; for (var k = 0; k < 200; k++) { var v = 0, d = 0; for (var t = 0; t < f.length; t++) { v += f[t] / Math.pow(1 + r, t); d -= t * f[t] / Math.pow(1 + r, t + 1); } r -= v / d; } return r * 100; },
  dscr: function (noi, ds) { return noi / ds; },
  debtYield: function (noi, loan) { return noi / loan * 100; },
  capRate: function (noi, price) { return noi / price * 100; }
};`;
const pkg = (src) => { const p = tmp(); fs.mkdirSync(path.join(p, 'js')); fs.writeFileSync(path.join(p, 'js', 'finance.js'), src); return p; };

test('uw-oracle: the engine and an independent stand-in agree on the invented cases', () => {
  const p = pkg(STAND_IN);
  const r = run(ORACLE, ['--require-oracle'], { UW_PACKAGE_DIR: p });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const m = r.stdout.match(/oracle: ran; (\d+) field\(s\) compared, (\d+) differ/);
  assert.ok(m, r.stdout);
  assert.ok(+m[1] >= 11, `fields compared: ${m[1]}`);
  assert.equal(m[2], '0', r.stdout);
  assert.ok(!r.stdout.includes('finance.js') && !r.stdout.includes(p), 'the package is never named');
});

test('uw-oracle: a difference over 0.01 is reported, not adopted', () => {
  const p = pkg(STAND_IN.replace('noi / price * 100', 'noi / price * 100 + 0.5'));
  const r = run(ORACLE, [], { UW_PACKAGE_DIR: p });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /cap \| 7 \| 7\.5 \| DIFFERS by 0\.5/);
  assert.match(r.stdout, /3 differ/);
});

test('uw-oracle: the cases file is the engine\'s own figures (a hand check of case 1)', () => {
  const r = run(ORACLE, []);
  assert.match(r.stdout, /\ncap \| 7 \|/);
  assert.match(r.stdout, /\nequity \| 1800000 \|/);
  assert.match(r.stdout, /\ndebtService \| 246506\.5292 \|/);
});

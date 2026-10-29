/* Every browser flow file (tests/e2e/*-flow.mjs) must be listed in the FLOWS
 * line of tests/e2e/run.sh, or a flow is never run by the full suite (as
 * happened to calendar-flow at 4.7.63). om-flow is a diagnostic script
 * (docs/baseline-report.md) and is the only one allowed to be left out. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const E2E = new URL('./e2e/', import.meta.url).pathname;
const DIAGNOSTIC = new Set(['om-flow']);

/** Flow names in `*-flow.mjs` files that the FLOWS line of `runSh` does not list. */
export function unlisted(runSh, files) {
  const listed = new Set(runSh.match(/^FLOWS=\$\{\*:-"([^"]+)"\}$/m)[1].split(/\s+/));
  return files.filter((f) => f.endsWith('-flow.mjs')).map((f) => f.slice(0, -4))
    .filter((n) => !listed.has(n) && !DIAGNOSTIC.has(n));
}

test('every tests/e2e/*-flow.mjs is listed in run.sh FLOWS', () => {
  const files = fs.readdirSync(E2E);
  assert.deepEqual(unlisted(fs.readFileSync(E2E + 'run.sh', 'utf8'), files), []);
});

test('the check names a flow that run.sh leaves out (the calendar-flow gap)', () => {
  const run = fs.readFileSync(E2E + 'run.sh', 'utf8').replace(' calendar-flow', '');
  assert.deepEqual(unlisted(run, fs.readdirSync(E2E)), ['calendar-flow']);
});

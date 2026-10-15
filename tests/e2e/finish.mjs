/* tests/e2e/finish.mjs -- how every browser flow ends (see lib.mjs). No
 * imports, so tests/e2e-finish.test.js can run it without Playwright. */

/**
 * The end of every flow: prints the summary line ("PASS n FAIL m" and any
 * extras) and makes the process exit with an error when a check failed or no
 * check ran, so `run.sh` stops being green on a red flow. `E2E_FORCE_FAIL=1`
 * (or a comma list of flow names) adds one failing check on purpose: the proof
 * that a failure turns the exit code red.
 */
export function finish(R, ...extra) {
  const me = (process.argv[1] || '').replace(/^.*\//, '').replace(/\.mjs$/, '');
  const force = process.env.E2E_FORCE_FAIL;
  if (force && (force === '1' || force.split(',').includes(me))) {
    R.push(['FAIL', 'forced failure (E2E_FORCE_FAIL)', '']);
    console.log('FAIL | forced failure (E2E_FORCE_FAIL)');
  }
  const pass = R.filter((r) => r[0] === 'PASS').length;
  const fail = R.filter((r) => r[0] === 'FAIL').length;
  if (!R.length) console.log('FAIL | no checks ran');
  console.log('PASS', pass, 'FAIL', fail, ...extra);
  if (fail || !R.length) process.exitCode = 1;
}

/* tests/tools/affected.mjs -- which unit tests check:quick runs for a change.
 * Pure: the file names in, the test names out. */
import fs from 'node:fs';
import path from 'node:path';

/** Tests that look at the whole repository, not at one module: a new or renamed app file breaks them without naming them. */
export const ALWAYS = ['tests/analyze-golden.test.js', 'tests/repo.test.js'];

/** Unit tests a change can affect: changed tests, and tests that name a changed app or server module. */
export function affectedTests(changed, ROOT) {
  const tests = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.js')).map((f) => `tests/${f}`);
  const mods = changed.filter((f) => /^(app|server)\/.+\.js$/.test(f)).map((f) => path.basename(f));
  const pick = new Set(ALWAYS);
  for (const t of tests) {
    if (changed.includes(t)) { pick.add(t); continue; }
    const src = fs.readFileSync(path.join(ROOT, t), 'utf8');
    if (mods.some((m) => src.includes(`/${m}'`) || src.includes(`/${m}"`) || src.includes(`/${m}\``))) pick.add(t);
  }
  // a change to shared test helpers or fixtures can reach any test
  if (changed.some((f) => /^tests\/(fixtures|tools|helpers)\//.test(f) && !/^tests\/tools\/(check|affected|bump-version|sync-main)\.mjs$/.test(f))) return tests;
  return [...pick].filter((t) => fs.existsSync(path.join(ROOT, t)));
}


/* tests/tools/sync-main.mjs -- keep a branch current with main, so a PR never
 * waits on a merge conflict (docs/working-rules.md, "Branches and PRs").
 *
 *   npm run sync-main      fetch main, merge it into the current branch, and
 *                          list any conflicted files (exit 1 if there are any)
 *   node tests/tools/sync-main.mjs --check
 *                          the last step of check:full: fetch main, and fail
 *                          if the branch is behind it or any tracked file has
 *                          a conflict marker at the start of a line
 *
 * Works on the repository of the current directory; the remote and branch
 * are SYNC_REMOTE (default origin) and SYNC_BRANCH (default main). */
import { spawnSync } from 'node:child_process';

const REMOTE = process.env.SYNC_REMOTE || 'origin';
const BRANCH = process.env.SYNC_BRANCH || 'main';
const BASE = `${REMOTE}/${BRANCH}`;
const git = (...a) => spawnSync('git', a, { encoding: 'utf8' });
const out = (r) => (r.stdout || '').trim();
const fail = (msg) => { console.log(`FAIL | ${msg}`); process.exit(1); };

// the three markers git writes, each at the start of a line; ======= alone on its line
// (a longer run of = is a Markdown rule, not a marker)
const MARKERS = ['^<{7}( |$)', '^={7}$', '^>{7}( |$)'];
/** Tracked files with a conflict marker: ["file:line: text"]. */
export function markers() {
  const r = git('grep', '-n', '-I', '-E', MARKERS.join('|'));
  return r.status === 0 ? out(r).split('\n') : [];
}

const fetched = git('fetch', '--quiet', REMOTE, BRANCH);
if (fetched.status !== 0) fail(`could not fetch ${BASE}: ${(fetched.stderr || '').trim().split('\n')[0]}`);

if (process.argv.includes('--check')) {
  const behind = Number(out(git('rev-list', '--count', `HEAD..${BASE}`)));
  const left = markers();
  if (behind) console.log(`FAIL | the branch is ${behind} commit${behind === 1 ? '' : 's'} behind ${BASE}: run npm run sync-main`);
  for (const m of left.slice(0, 20)) console.log(`FAIL | conflict marker: ${m}`);
  if (behind || left.length) process.exit(1);
  console.log(`PASS | current with ${BASE}, no conflict markers`);
  process.exit(0);
}

const before = out(git('rev-parse', 'HEAD'));
const merged = git('merge', '--no-edit', BASE);
const conflicted = out(git('diff', '--name-only', '--diff-filter=U')).split('\n').filter(Boolean);
if (conflicted.length) {
  console.log(`Merging ${BASE} left ${conflicted.length} conflicted file${conflicted.length === 1 ? '' : 's'}; resolve, then commit:`);
  for (const f of conflicted) console.log(`  ${f}`);
  process.exit(1);
}
if (merged.status !== 0) fail(`git merge ${BASE} failed: ${(merged.stderr || merged.stdout || '').trim().split('\n')[0]}`);
console.log(out(git('rev-parse', 'HEAD')) === before ? `Already current with ${BASE}.` : `Merged ${BASE}: ${out(git('log', '--oneline', '-1'))}`);

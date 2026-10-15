/* tests/tools/sync-main.mjs -- keep a branch current with main, so a PR never
 * waits on a merge conflict (docs/working-rules.md, "Branches and PRs").
 *
 *   npm run sync-main      fetch main, merge it into the current branch, and
 *                          list any conflicted files (exit 1 if there are any).
 *                          The two conflicts that recur are resolved on their
 *                          own: CHANGELOG.md (both entries kept, newest
 *                          version first) and a version line in the version
 *                          files (the higher version kept); anything else is
 *                          left for a person
 *   node tests/tools/sync-main.mjs --check
 *                          the last step of check:full: fetch main, and fail
 *                          if the branch is behind it or any tracked file has
 *                          a conflict marker at the start of a line
 *
 * Works on the repository of the current directory; the remote and branch
 * are SYNC_REMOTE (default origin) and SYNC_BRANCH (default main). */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

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

/* ---------------------------------------------- the conflicts that recur */

const semver = (v) => v.split('.').map(Number);
const newer = (a, b) => { const x = semver(a); const y = semver(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
const VERSION_FILES = ['package.json', 'package-lock.json', 'sw.js', 'app/exporters.js'];
/** Both sides of one conflict in CHANGELOG.md, when each is whole entries: all of them, newest version first; else null. */
function changelogHunk(ours, theirs) {
  const entries = (t) => t.split(/^(?=## \d+\.\d+\.\d+:)/m).filter((e) => e.trim());
  const all = [...entries(ours), ...entries(theirs)];
  if (!all.length || !all.every((e) => /^## \d+\.\d+\.\d+:/.test(e))) return null;
  const by = new Map();
  for (const e of all) {
    const v = /^## (\d+\.\d+\.\d+):/.exec(e)[1];
    if (by.has(v) && by.get(v).trim() !== e.trim()) return null; // the same version written two ways: a person decides
    by.set(v, e.replace(/\n+$/, ''));
  }
  // entries a blank line apart; the end as the side ended (git leaves the blank line after a hunk outside it)
  const tail = (ours.match(/\n+$/) || ['\n'])[0];
  return [...by.keys()].sort((a, b) => (newer(a, b) ? -1 : 1)).map((v) => by.get(v)).join('\n\n') + tail;
}
/** Both sides of one conflict in a version file, when they differ only in the version: the side with the higher one; else null. */
function versionHunk(ours, theirs) {
  const V = /\d+\.\d+\.\d+/g;
  const vo = ours.match(V); const vt = theirs.match(V);
  if (!vo || !vt || ours.replace(V, 'X') !== theirs.replace(V, 'X')) return null;
  return newer(vt[0], vo[0]) ? theirs : ours;
}
/** A conflicted file's text with every conflict resolved by `pick`, or null if any can't be. */
function resolve(text, pick) {
  const re = /^<{7}[^\n]*\n([\s\S]*?)^(?:\|{7}[^\n]*\n[\s\S]*?)?={7}\n([\s\S]*?)^>{7}[^\n]*\n/m;
  let t = text; let m;
  while ((m = re.exec(t))) {
    const r = pick(m[1], m[2]);
    if (r === null) return null;
    t = t.slice(0, m.index) + r + t.slice(m.index + m[0].length);
  }
  return t;
}

const before = out(git('rev-parse', 'HEAD'));
const merged = git('merge', '--no-edit', BASE);
let conflicted = out(git('diff', '--name-only', '--diff-filter=U')).split('\n').filter(Boolean);
const auto = [];
for (const f of conflicted) {
  const pick = f === 'CHANGELOG.md' ? changelogHunk : VERSION_FILES.includes(f) ? versionHunk : null;
  if (!pick) continue;
  const r = resolve(fs.readFileSync(f, 'utf8'), pick);
  if (r === null) continue;
  fs.writeFileSync(f, r);
  git('add', f);
  auto.push(f);
}
if (auto.length) console.log(`Resolved on their own: ${auto.join(', ')} (CHANGELOG.md: both entries kept, newest first; version files: the higher version).`);
conflicted = conflicted.filter((f) => !auto.includes(f));
if (!conflicted.length && auto.length) {
  const c = git('commit', '--no-edit');
  if (c.status !== 0) fail(`the merge could not be committed: ${(c.stderr || c.stdout || '').trim().split('\n')[0]}`);
  console.log(`Merged ${BASE}: ${out(git('log', '--oneline', '-1'))}`);
  process.exit(0);
}
if (conflicted.length) {
  console.log(`Merging ${BASE} left ${conflicted.length} conflicted file${conflicted.length === 1 ? '' : 's'}; resolve, then commit:`);
  for (const f of conflicted) console.log(`  ${f}`);
  process.exit(1);
}
if (merged.status !== 0) fail(`git merge ${BASE} failed: ${(merged.stderr || merged.stdout || '').trim().split('\n')[0]}`);
console.log(out(git('rev-parse', 'HEAD')) === before ? `Already current with ${BASE}.` : `Merged ${BASE}: ${out(git('log', '--oneline', '-1'))}`);

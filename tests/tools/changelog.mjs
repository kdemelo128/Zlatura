/* tests/tools/changelog.mjs -- changelog fragments (docs/proposals/changelog-fragments.md, approved 2026-10-15).
 *
 * A PR never edits CHANGELOG.md while it is worked on. It adds one file,
 * docs/changelog/unreleased/<branch>.md:
 *
 *   # <what a broker gets, in plain words>
 *
 *   <the entry: the cause, bold-led bullets, how it was tested, golden outputs>
 *
 * `npm run bump -- x.y.z` (tests/tools/bump-version.mjs), in the PR's last
 * commit, folds it into CHANGELOG.md as "## x.y.z: <title> (on the
 * development branch; not merged or deployed)" and deletes it.
 *
 *   node tests/tools/changelog.mjs --check   checks every fragment waiting */
import fs from 'node:fs';
import path from 'node:path';

export const DIR = 'docs/changelog/unreleased';
const HEAD = '# Changelog\n';
const SUFFIX = ' (on the development branch; not merged or deployed)';

/** The fragments waiting in `root`: [{ file, text }], by name; the folder's README is not one. */
export function fragments(root) {
  const dir = path.join(root, DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').sort()
    .map((f) => ({ file: path.join(DIR, f), text: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

/** A fragment's title and body, or throws saying what is wrong with it. */
export function parseFragment(text, file = 'the fragment') {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const m = /^# (\S.*)$/.exec(lines[0] || '');
  if (!m) throw new Error(`${file}: the first line must be "# <title>"`);
  const title = m[1].trim();
  if (/^\d+\.\d+\.\d+/.test(title) || title.endsWith(SUFFIX)) throw new Error(`${file}: the title is the plain words only; bump adds the version and the suffix`);
  const body = lines.slice(1).join('\n').trim();
  if (!body) throw new Error(`${file}: the entry is empty`);
  if (/^## \d+\.\d+\.\d+/m.test(body)) throw new Error(`${file}: holds a version heading; one fragment is one entry`);
  return { title, body };
}

/** CHANGELOG.md's text with the fragment folded in as version `v`, at the top. */
export function fold(changelog, v, { title, body }) {
  if (!changelog.startsWith(HEAD)) throw new Error('CHANGELOG.md: does not start with "# Changelog"');
  if (new RegExp(`^## ${v.replace(/\./g, '\\.')}:`, 'm').test(changelog)) throw new Error(`CHANGELOG.md: already has an entry for ${v}`);
  return `${HEAD}\n## ${v}: ${title}${SUFFIX}\n\n${body}\n\n${changelog.slice(HEAD.length).replace(/^\n+/, '')}`;
}

/** The version of CHANGELOG.md's top entry. */
export const topVersion = (changelog) => (/^## (\d+\.\d+\.\d+):/m.exec(changelog) || [])[1] || null;

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) && process.argv.includes('--check')) {
  const root = process.cwd();
  let bad = 0;
  const all = fragments(root);
  for (const f of all) { try { parseFragment(f.text, f.file); console.log(`PASS | ${f.file}`); } catch (e) { bad++; console.log(`FAIL | ${e.message}`); } }
  if (!all.length) console.log(`PASS | no fragments waiting in ${DIR}`);
  process.exit(bad ? 1 : 0);
}

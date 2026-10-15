/* tests/tools/bump-version.mjs -- the release step, in a PR's last commit:
 * set the version everywhere it is written (package.json, package-lock.json
 * lines 3 and 9, sw.js and app/exporters.js), and fold the PR's changelog
 * fragment (docs/changelog/unreleased/, tests/tools/changelog.mjs) into
 * CHANGELOG.md, deleting the fragment.
 *
 *   npm run bump -- 4.7.13
 *
 * Fails, changing nothing, if the version isn't x.y.z, any file doesn't hold
 * the current version where expected, or there isn't exactly one well-formed
 * fragment waiting. */
import fs from 'node:fs';
import path from 'node:path';
import { fragments, parseFragment, fold } from './changelog.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const next = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(next || '')) { console.error('usage: npm run bump -- <x.y.z>'); process.exit(2); }
const cur = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const esc = cur.replace(/\./g, '\\.');
const edits = [
  ['package.json', new RegExp(`^(  "version": ")${esc}(",)$`, 'm'), 1],
  ['package-lock.json', new RegExp(`^(  "version": ")${esc}(",)$`, 'm'), 1],
  ['package-lock.json', new RegExp(`^(      "version": ")${esc}(",)$`, 'm'), 1],
  ['sw.js', new RegExp(`^(const VERSION = ')${esc}(';)$`, 'm'), 1],
  ['app/exporters.js', new RegExp(`^(export const VERSION = ')${esc}(';)$`, 'm'), 1],
];
const text = {};
for (const [f, re] of edits) {
  text[f] ??= fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (!re.test(text[f])) { console.error(`${f}: version ${cur} not found where expected; nothing changed`); process.exit(1); }
  text[f] = text[f].replace(re, `$1${next}$2`);
}
const lock = text['package-lock.json'].split('\n');
if (!lock[2].includes(next) || !lock[8].includes(next)) { console.error('package-lock.json: lines 3 and 9 should hold the version; nothing changed'); process.exit(1); }
const waiting = fragments(ROOT);
if (waiting.length !== 1) {
  console.error(waiting.length ? `${waiting.length} changelog fragments are waiting (${waiting.map((f) => f.file).join(', ')}); a release folds one; nothing changed`
    : 'no changelog fragment is waiting in docs/changelog/unreleased/: write the PR\'s entry there first; nothing changed');
  process.exit(1);
}
try {
  text['CHANGELOG.md'] = fold(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'), next, parseFragment(waiting[0].text, waiting[0].file));
} catch (e) { console.error(`${e.message}; nothing changed`); process.exit(1); }
for (const f of Object.keys(text)) fs.writeFileSync(path.join(ROOT, f), text[f]);
fs.rmSync(path.join(ROOT, waiting[0].file));
console.log(`${cur} -> ${next}: ${Object.keys(text).join(', ')}; ${waiting[0].file} folded in and removed`);

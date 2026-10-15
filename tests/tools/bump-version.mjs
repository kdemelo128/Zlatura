/* tests/tools/bump-version.mjs -- set the version everywhere it is written:
 * package.json, package-lock.json (lines 3 and 9), sw.js and app/exporters.js.
 *
 *   npm run bump -- 4.7.9
 *
 * Fails, changing nothing, if the version isn't x.y.z or any file doesn't
 * hold the current version where expected. */
import fs from 'node:fs';
import path from 'node:path';

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
for (const f of Object.keys(text)) fs.writeFileSync(path.join(ROOT, f), text[f]);
console.log(`${cur} -> ${next}: ${Object.keys(text).join(', ')}`);

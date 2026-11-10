/* The invented stand-in filler package (tests/fixtures/uwfiller-standin/): its files, zipped, and as a folder listing.
 * Tiny, public, no real content. Tests load it where the real package would go. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'uwfiller-standin');
export const STANDIN_DIR = DIR;
const require = createRequire(import.meta.url);

/** { 'public/tool/index.html': Uint8Array, 'notes.txt': Uint8Array, … } (every file, paths from the package top) */
export function standinFiles() {
  const out = {};
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else out[path.relative(DIR, p).split(path.sep).join('/')] = new Uint8Array(fs.readFileSync(p));
    }
  })(DIR);
  return out;
}

/** The stand-in as a zip, optionally with changes: `edit` maps a path to new bytes (or null to drop it). */
export function standinZip(edit = {}, prefix = '') {
  const { zipSync } = require('fflate');
  const files = {};
  for (const [k, v] of Object.entries({ ...standinFiles(), ...edit })) if (v !== null) files[prefix + k] = v;
  return zipSync(files, { mtime: new Date(2020, 0, 1) });
}

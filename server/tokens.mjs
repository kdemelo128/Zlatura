/* tokens.mjs -- per-device access tokens. The server holds only SHA-256 hashes,
 * never a token. A tokens file has one line per device: `<label> <sha256-hex>`;
 * `#` starts a comment. Make a token with:  node tokens.mjs new <label> */

import fs from 'node:fs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const hashToken = (t) => createHash('sha256').update(String(t)).digest();
const LABEL = /^[a-z0-9-]{1,40}$/;
const HEX = /^[0-9a-f]{64}$/;

/** [[label, hash Buffer]], or throws an Error that names the problem and never a token or hash. */
export function parseEntries(pairs, where) {
  const seen = new Set();
  return pairs.map(([label, hex], i) => {
    if (!LABEL.test(label || '')) throw new Error(`${where}, entry ${i + 1}: the label must be 1-40 characters of a-z, 0-9 and "-".`);
    if (!HEX.test(hex || '')) throw new Error(`${where}, entry ${i + 1} (${label}): the hash must be 64 hex characters (a SHA-256).`);
    if (seen.has(label)) throw new Error(`${where}: the label "${label}" is used twice.`);
    seen.add(label);
    return [label, Buffer.from(hex, 'hex')];
  });
}

export function parseTokenLines(text, where = 'tokens file') {
  const pairs = String(text).split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean).map((l) => l.split(/\s+/));
  for (const p of pairs) if (p.length !== 2) throw new Error(`${where}: each line is "<label> <sha256-hex>".`);
  return parseEntries(pairs, where);
}

/** APP_TOKEN_HASHES: `label:hex,label:hex`. */
export function parseHashList(s) {
  return parseEntries(String(s).split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.split(':')), 'APP_TOKEN_HASHES');
}

export const readTokensFile = (path) => parseTokenLines(fs.readFileSync(path, 'utf8'), 'tokens file');

/** The label whose hash matches the token presented, or null. Compares against every entry, with no early exit. */
export function matchDevice(entries, presented) {
  const h = hashToken(presented);
  let found = null;
  for (const [label, want] of entries) if (timingSafeEqual(h, want) && !found) found = label;
  return found;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [cmd, label] = process.argv.slice(2);
  if (cmd !== 'new' || !LABEL.test(label || '')) { console.error('usage: node tokens.mjs new <label>   (label: a-z, 0-9, "-", up to 40 characters)'); process.exit(2); }
  const token = randomBytes(24).toString('hex');
  console.log(`Token for ${label} (shown once; give it to that device's broker):\n  ${token}\n\nLine for the tokens file (APP_TOKENS_FILE):\n  ${label} ${hashToken(token).toString('hex')}`);
}

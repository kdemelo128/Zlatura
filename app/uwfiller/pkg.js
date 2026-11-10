/* pkg.js -- the underwriting filler package, held on this device. The broker loads their own copy (a zip, or the
 * public/tool folder); it is never part of the app or its backups. This module reads it, checks sizes, fingerprints it
 * against the approved list (hashes.js) and keeps it in Cache Storage under 'zlatura-uwfiller', where sw.js serves it at
 * uw-filler/. No kv, no IndexedDB: a backup exports every kv record, so the package stays out of it by living here.
 * The cache and the clock are parameters so the Node tests can run it without a browser. */

import { safeUnzip } from '../filekind.js';
import { sha256Hex } from '../filehash.js';
import { APPROVED } from './hashes.js';

export const BUCKET = 'zlatura-uwfiller';
export const MAX_ZIP = 120e6;      // the file picked
export const MAX_FILES = 2000;     // files under the tool folder
export const MAX_TOTAL = 40e6;     // bytes under the tool folder
export const MAX_FILE = 15e6;      // one file
const META = 'uw-filler-meta.json';

const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon',
  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', wasm: 'application/wasm', map: 'application/json', gz: 'application/gzip', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav' };
/** @param {string} path */
export const typeOf = (path) => TYPES[(path.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

const JUNK = /(^|\/)(\.DS_Store|__MACOSX|Thumbs\.db)(\/|$)/;

/** A path is kept only if it is plain: no empty or dot segments, no backslash, colon, percent or control characters. */
export function cleanPath(p) {
  if (typeof p !== 'string' || !p || p.startsWith('/') || /[\\:%\u0000-\u001f]/.test(p)) return null;
  const parts = p.split('/');
  return parts.some((s) => !s || s === '.' || s === '..') ? null : p;
}

/**
 * Which folder inside the picked files is the tool: the one holding index.html, ending in public/tool (the whole
 * package), or just tool (that folder picked), or the top (its contents). Returns the prefix ('' or 'a/b/') or null.
 * @param {string[]} names
 */
export function findRoot(names) {
  const roots = names.filter((n) => n === 'index.html' || n.endsWith('/index.html')).map((n) => n.slice(0, n.length - 'index.html'.length))
    .filter((d) => d === '' || /(^|\/)public\/tool\/$/.test(d) || /^tool\/$/.test(d));
  if (!roots.length) return null;
  const rank = (d) => (/(^|\/)public\/tool\/$/.test(d) ? 0 : d === 'tool/' ? 1 : 2);
  return roots.sort((a, b) => rank(a) - rank(b) || a.length - b.length)[0];
}

/**
 * The files of the tool, from names alone: { rel: name } under the root, junk and folders dropped. Throws an Error
 * (its message is for the broker) when there is no tool, an unsafe path, or too many files.
 * @param {string[]} names
 */
export function pick(names) {
  const root = findRoot(names.filter((n) => !JUNK.test(n)));
  if (root === null) throw new Error('That is not the filler package: there is no public/tool/index.html in it.');
  const out = /** @type {Record<string, string>} */ (Object.create(null));
  for (const n of names) {
    if (!n.startsWith(root) || n.endsWith('/') || JUNK.test(n)) continue;
    const rel = n.slice(root.length);
    if (cleanPath(rel) === null) throw new Error('The package has a file with an unsafe name, so it was not loaded.');
    out[rel] = n;
  }
  const count = Object.keys(out).length;
  if (count > MAX_FILES) throw new Error(`The package holds ${count} files under public/tool, more than expected (${MAX_FILES}). It was not loaded.`);
  return out;
}

/** The fingerprint: SHA-256 of "path<TAB>sha256" lines in sorted order. A zip and a folder of the same files agree. @param {Record<string, Uint8Array>} files */
export async function fingerprint(files) {
  const lines = [];
  for (const k of Object.keys(files).sort()) {
    const h = await sha256Hex(files[k]);
    if (!h) throw new Error('This browser cannot fingerprint the package here (it needs a secure page), so it was not loaded.');
    lines.push(`${k}\t${h}`);
  }
  return sha256Hex(new TextEncoder().encode(lines.join('\n')));
}

function checkSizes(entries) {
  let total = 0;
  for (const [rel, size] of entries) {
    if (size > MAX_FILE) throw new Error(`${rel} is ${Math.round(size / 1e6)} MB, more than a filler file should be. The package was not loaded.`);
    total += size;
  }
  if (total > MAX_TOTAL) throw new Error(`The package is ${Math.round(total / 1e6)} MB under public/tool (the most is ${MAX_TOTAL / 1e6} MB). It was not loaded.`);
}

/**
 * The tool's files from a zip's bytes. The zip guard (filekind.js safeUnzip) checks entry count, declared total,
 * ratio and real inflated sizes before anything is kept; sizes are then checked on the tool's own files.
 * @param {Uint8Array} bytes @param {any} fflate @returns {Record<string, Uint8Array>}
 */
export function filesFromZip(bytes, fflate) {
  if (bytes.length > MAX_ZIP) throw new Error(`That file is ${Math.round(bytes.length / 1e6)} MB; the most is ${MAX_ZIP / 1e6} MB. It was not opened.`);
  let all;
  try { all = safeUnzip(bytes, fflate); } catch (e) { throw new Error(e && e.message ? e.message : 'That zip could not be opened.'); }
  const names = pick(Object.keys(all));
  checkSizes(Object.keys(names).map((rel) => [rel, all[names[rel]].length]));
  const out = /** @type {Record<string, Uint8Array>} */ (Object.create(null));
  for (const rel of Object.keys(names)) out[rel] = all[names[rel]];
  return out;
}

/** The tool's files from a picked folder (File objects with webkitRelativePath). Only the tool's own files are read. @param {File[]} list */
export async function filesFromFolder(list) {
  const byName = new Map();
  for (const f of list) byName.set(f.webkitRelativePath || f.name, f);
  const names = pick([...byName.keys()]);
  checkSizes(Object.keys(names).map((rel) => [rel, byName.get(names[rel]).size]));
  const out = /** @type {Record<string, Uint8Array>} */ (Object.create(null));
  for (const rel of Object.keys(names)) out[rel] = new Uint8Array(await byName.get(names[rel]).arrayBuffer());
  return out;
}

/** The address of a stored file, under uw-filler/ next to the app. @param {string} rel @param {string} base */
export const addressOf = (rel, base) => new URL(`uw-filler/${rel.split('/').map(encodeURIComponent).join('/')}`, base).href;

/**
 * Check the fingerprint against the allow-list and keep the files. Refuses (throws) a package that is not approved; a
 * failed write leaves nothing behind. Returns the info record.
 * @param {Record<string, Uint8Array>} files
 * @param {{ base: string, cache?: CacheStorage, allow?: { hash: string, label: string }[], now?: () => number }} o
 */
export async function loadPackage(files, { base, cache = globalThis.caches, allow = APPROVED, now = Date.now }) {
  if (!cache) throw new Error('This browser has no Cache Storage here, so the package cannot be kept.');
  const hash = await fingerprint(files);
  const hit = allow.find((a) => a.hash === hash);
  if (!hit) throw new Error('This package is not on the approved list for this version, so it was not loaded. (Its fingerprint is not one the owner has approved.)');
  await cache.delete(BUCKET);
  const c = await cache.open(BUCKET);
  try {
    for (const rel of Object.keys(files)) {
      await c.put(new Request(addressOf(rel, base)), new Response(/** @type {BodyInit} */ (/** @type {unknown} */ (files[rel])), { headers: { 'content-type': typeOf(rel) } }));
    }
    const info = { hash, label: hit.label, files: Object.keys(files).length, bytes: Object.values(files).reduce((s, b) => s + b.length, 0), loadedAt: now() };
    // written last: a package without its meta record counts as not loaded
    await c.put(new Request(new URL(META, base).href), new Response(JSON.stringify(info), { headers: { 'content-type': 'application/json' } }));
    return info;
  } catch (e) {
    await cache.delete(BUCKET);
    throw new Error(`The package could not be kept on this device: ${(e && e.message) || e}`);
  }
}

/** What is loaded: { hash, label, files, bytes, loadedAt } or null. @param {{ base: string, cache?: CacheStorage }} o */
export async function packageInfo({ base, cache = globalThis.caches }) {
  if (!cache || !(await cache.has(BUCKET))) return null;
  const c = await cache.open(BUCKET);
  const r = await c.match(new Request(new URL(META, base).href));
  if (!r) return null;
  try {
    const j = await r.json();
    return j && typeof j.hash === 'string' && Number.isFinite(j.files) ? j : null;
  } catch { return null; }
}

/** Delete the package from this device. @param {{ cache?: CacheStorage }} [o] */
export async function erasePackage({ cache = globalThis.caches } = {}) {
  return cache ? cache.delete(BUCKET) : false;
}

// Box folder downloader (dev tooling, runs on the owner's computer only; never loaded by the app).
// Talks to Box's official REST API with an access token the owner created. Nothing is uploaded
// anywhere. The API facts used here (paths, fields, 302 on download, 429 + Retry-After) are
// remembered, not checked against a live account: see docs/hub.md.
import { createWriteStream, mkdirSync, readFileSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { findSecret } from '../harness/lib.mjs';

export const API = 'https://api.box.com/2.0';
export const EXTENSIONS = ['pdf', 'xls', 'xlsx', 'xlsm', 'csv', 'doc', 'docx', 'txt', 'rtf', 'msg', 'eml'];
export const MAX_DEPTH = 30;
export const MAX_FILES = 50000;
const MAX_RETRIES = 5;
const TIMEOUT_MS = 60000;
const MAX_NAME = 120;

/** A failure with a message that is safe to print. `fatal` stops the whole run. */
export class BoxError extends Error {
  constructor(message, fatal = true) { super(message); this.fatal = fatal; }
}

/** Hide the token and anything that looks like a secret before text is shown or thrown. */
export function safeText(text, token) {
  let s = String(text ?? '');
  if (token) s = s.split(token).join('[token hidden]');
  s = s.replace(/Bearer\s+\S+/gi, 'Bearer [hidden]');
  return findSecret(s) ? '[text hidden: it looked like a key]' : s;
}

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
/** A safe single path segment made from a Box name. Never contains a separator or "..". */
export function sanitizeName(name) {
  let s = String(name ?? '').normalize('NFKC');
  s = s.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_').replace(/\.{2,}/g, '.');
  s = s.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
  if (!s) s = '_';
  if (RESERVED.test(s.split('.')[0])) s = '_' + s;
  if (s.length > MAX_NAME) {
    const m = /(\.[A-Za-z0-9]{1,10})$/.exec(s);
    const ext = m ? m[1] : '';
    s = s.slice(0, MAX_NAME - ext.length).replace(/[.\s]+$/, '') + ext;
  }
  return s;
}
const extOf = (name) => { const m = /\.([A-Za-z0-9]{1,10})$/.exec(String(name)); return m ? m[1].toLowerCase() : '(none)'; };
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One authenticated GET with timeout, 429 back-off and a clear stop on a refused token. */
async function boxGet(url, token, { fetch: f = globalThis.fetch, sleep = defaultSleep, redirect = 'follow', auth = true } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await f(url, { method: 'GET', redirect, headers: auth ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      throw new BoxError(`network problem or timeout (60 s): ${safeText(e?.message, token)}`, false);
    }
    if (res.status === 401 || res.status === 403) {
      throw new BoxError('the token was refused or expired (Box developer tokens are short-lived: make a new one and run save-token again)');
    }
    if (res.status === 429) {
      if (attempt >= MAX_RETRIES) throw new BoxError(`Box kept answering "too many requests" after ${MAX_RETRIES} retries; try again later`);
      const secs = Number(res.headers?.get?.('retry-after'));
      await sleep((Number.isFinite(secs) && secs >= 0 ? Math.min(secs, 120) : 2 ** attempt) * 1000);
      continue;
    }
    return res;
  }
}
async function boxJson(path, token, opts) {
  const res = await boxGet(API + path, token, opts);
  if (!res.ok) throw new BoxError(`Box answered ${res.status} for ${safeText(path.split('?')[0], token)}`, false);
  try { return JSON.parse(await res.text()); } catch { throw new BoxError('Box sent something that was not JSON', false); }
}

/** Folders whose name matches any of `names`. Returns [{id, name, path, query}], de-duplicated by id. */
export async function searchFolders(token, names, opts = {}) {
  const seen = new Map();
  for (const q of names) {
    for (let offset = 0; ; ) {
      const j = await boxJson(`/search?query=${encodeURIComponent(q)}&type=folder&limit=100&offset=${offset}`, token, opts);
      const entries = j.entries ?? [];
      for (const e of entries) {
        if (e.type && e.type !== 'folder') continue;
        if (seen.has(e.id)) continue;
        const path = (e.path_collection?.entries ?? []).map((p) => p.name).concat(e.name).join('/');
        seen.set(e.id, { id: String(e.id), name: e.name, path, query: q });
      }
      offset += entries.length;
      if (!entries.length || offset >= (j.total_count ?? 0)) break;
    }
  }
  return [...seen.values()];
}

/** Every file below a folder. Returns {id, name, files:[{id,name,size,sha1,dirs}], skipped:{ext:n}, tooDeep}. */
export async function listTree(token, folderId, { fetch, sleep, maxFiles = MAX_FILES, maxDepth = MAX_DEPTH } = {}) {
  const opts = { fetch, sleep };
  const info = await boxJson(`/folders/${encodeURIComponent(folderId)}?fields=id,name`, token, opts);
  const tree = { id: String(folderId), name: info.name ?? String(folderId), files: [], skipped: {}, tooDeep: 0 };
  let seenFiles = 0;
  const walk = async (id, dirs, depth) => {
    for (let offset = 0; ; ) {
      const j = await boxJson(`/folders/${encodeURIComponent(id)}/items?limit=1000&offset=${offset}&fields=id,type,name,size,sha1,modified_at`, token, opts);
      const entries = j.entries ?? [];
      for (const e of entries) {
        if (e.type === 'folder') {
          if (depth >= maxDepth) { tree.tooDeep++; continue; }
          await walk(e.id, [...dirs, e.name], depth + 1);
        } else if (e.type === 'file') {
          if (++seenFiles > maxFiles) throw new BoxError(`more than ${maxFiles} files; stopped (pick a smaller folder)`);
          const ext = extOf(e.name);
          if (EXTENSIONS.includes(ext)) tree.files.push({ id: String(e.id), name: e.name, size: Number(e.size) || 0, sha1: e.sha1 ?? null, dirs });
          else tree.skipped[ext] = (tree.skipped[ext] ?? 0) + 1;
        }
      }
      offset += entries.length;
      if (!entries.length || offset >= (j.total_count ?? Infinity)) break;
    }
  };
  await walk(String(folderId), [], 0);
  return tree;
}

/** Turn trees into local paths under destDir (no download). Collisions get " (2)", " (3)"... */
export function planDownload(trees, destDir) {
  const root = resolve(destDir);
  const used = new Set();
  const unique = (parent, name, isFile) => {
    let n = 1, cand = name;
    while (used.has(join(parent, cand).toLowerCase())) {
      n++;
      const m = isFile ? /^(.*?)(\.[A-Za-z0-9]{1,10})?$/.exec(name) : [null, name, ''];
      cand = `${m[1]} (${n})${m[2] ?? ''}`;
    }
    used.add(join(parent, cand).toLowerCase());
    return cand;
  };
  const entries = [], byExt = {}, skipped = {};
  let totalBytes = 0;
  for (const t of trees) {
    let dir = root;
    dir = join(dir, unique(dir, sanitizeName(t.name), false));
    const dirMap = new Map();
    for (const f of t.files) {
      let cur = dir;
      f.dirs.forEach((d, i) => {
        const key = f.dirs.slice(0, i + 1).join('\u0000');
        const k2 = cur + '\u0001' + key;
        if (!dirMap.has(k2)) dirMap.set(k2, join(cur, unique(cur, sanitizeName(d), false)));
        cur = dirMap.get(k2);
      });
      const path = join(cur, unique(cur, sanitizeName(f.name), true));
      if (path !== root && !path.startsWith(root + sep)) throw new BoxError(`refused an unsafe path for file ${f.id}`);
      entries.push({ id: f.id, size: f.size, sha1: f.sha1, path });
      const ext = extOf(f.name);
      byExt[ext] ??= { count: 0, bytes: 0 };
      byExt[ext].count++; byExt[ext].bytes += f.size; totalBytes += f.size;
    }
    for (const [e, n] of Object.entries(t.skipped)) skipped[e] = (skipped[e] ?? 0) + n;
  }
  return { root, entries, byExt, skipped, totalBytes };
}

const sha1File = (p) => createHash('sha1').update(readFileSync(p)).digest('hex');
const haveAlready = (e) => {
  try { return statSync(e.path).size === e.size && !!e.sha1 && sha1File(e.path) === e.sha1; } catch { return false; }
};

async function downloadOne(e, token, opts) {
  let res = await boxGet(`${API}/files/${encodeURIComponent(e.id)}/content`, token, { ...opts, redirect: 'manual' });
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers?.get?.('location');
    if (!loc) throw new BoxError(`Box gave no download address for file ${e.id}`, false);
    res = await boxGet(loc, token, { ...opts, auth: false }); // the pre-signed address never gets the token
  }
  if (!res.ok) throw new BoxError(`Box answered ${res.status} for file ${e.id}`, false);
  mkdirSync(dirname(e.path), { recursive: true });
  const part = `${e.path}.part`;
  try {
    if (res.body?.getReader) await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
    else {
      const buf = res.arrayBuffer ? Buffer.from(await res.arrayBuffer()) : Buffer.alloc(0);
      await pipeline(Readable.from([buf]), createWriteStream(part));
    }
    renameSync(part, e.path);
  } catch (err) {
    try { unlinkSync(part); } catch { /* nothing to remove */ }
    throw new BoxError(`could not save file ${e.id}: ${safeText(err?.message, token)}`, false);
  }
}

/** Download a plan. Resumable: a file with the same size and sha1 is left alone. */
export async function downloadPlan(plan, destDir, { fetch, token, concurrency = 3, onProgress = () => {}, sleep } = {}) {
  const root = resolve(destDir);
  const result = { downloaded: 0, alreadyHad: 0, failed: [], bytes: 0 };
  const queue = plan.entries.slice();
  let fatal = null, done = 0;
  const worker = async () => {
    while (queue.length && !fatal) {
      const e = queue.shift();
      if (e.path !== root && !e.path.startsWith(root + sep)) { result.failed.push({ id: e.id, error: 'unsafe path' }); continue; }
      try {
        if (haveAlready(e)) result.alreadyHad++;
        else { await downloadOne(e, token, { fetch, sleep }); result.downloaded++; result.bytes += e.size; }
      } catch (err) {
        const msg = safeText(err?.message, token);
        if (err instanceof BoxError && err.fatal) fatal = err; else result.failed.push({ id: e.id, error: msg });
      }
      onProgress({ done: ++done, total: plan.entries.length, id: e.id });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  if (fatal) { fatal.result = result; throw fatal; }
  return result;
}

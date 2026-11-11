#!/usr/bin/env node
/* tools/uwtool-import.mjs -- makes the cleaned copy of the broker's underwriting tool (docs/proposals/monal-builtin-and-rename.md, A6).
 *
 *   node tools/uwtool-import.mjs --from <package dir> --rules <rules.json> --out <dir> [--pack <dir>] [--denylist <file>] [--public <file>]
 *
 * This file is the GENERIC engine only. Everything specific to the package (which text to cut, which words must never
 * appear) lives in git-ignored files under private/: the rules (--rules) and the deny-list (--denylist, or env DENYLIST,
 * or private/uwtool/denylist.txt). The public settings (tools/uwtool-import.public.json) hold the allow-list and ceilings.
 *
 * What it does, in order, all in memory:
 *   1. reads the package; copies ONLY files on the allow-list (everything else is "left out", counted);
 *   2. applies the rules' edits in order. Every edit names the exact text it expects and fails the run when that text is
 *      not there (or is there a different number of times). Kinds: replace, removeBlock, replaceFile, addFile (a new file from the tools folder), escapeControls (raw control bytes inside a text file become \uXXXX escapes, the same value in a JS string), dropFile;
 *   3. scans every output path and file (and the manifest) for each deny-listed term, for terms harvested from removed
 *      blocks, and for any base64 run over the ceiling. One hit and NOTHING is written (exit 1);
 *   4. writes the files and IMPORT-MANIFEST.json: the package fingerprint, in/out SHA-256 of each file, and each edit's
 *      id, category and counts. The manifest holds no find strings, no replaced text, no removed contents.
 * Output never prints a term, only its line number in the list. Without a deny-list the run refuses.
 * The pack (--pack) receives the text of removeBlock/dropFile edits marked "pack" and must sit in a git-ignored folder. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
export const MANIFEST = 'IMPORT-MANIFEST.json';
export const DEFAULT_PUBLIC = path.join(HERE, 'uwtool-import.public.json');
export const DEFAULT_DENYLIST = path.join(REPO, 'private/uwtool/denylist.txt');

export const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const dec = (u8) => Buffer.from(u8).toString('utf8');
const isText = (u8) => !Buffer.from(u8).includes(0);
const countOf = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);

/** The package fingerprint, as app/uwfiller/pkg.js makes it: SHA-256 of sorted "path<TAB>sha256" lines. @param {Record<string, Uint8Array>} files */
export function fingerprint(files) {
  return sha(Buffer.from(Object.keys(files).sort().map((k) => `${k}\t${sha(files[k])}`).join('\n')));
}

/** One term per line; blank lines and # comments dropped; [{ n: line number, term }]. */
export function parseTerms(text, min = 3) {
  return String(text || '').split(/\r?\n/).map((t, i) => ({ n: i + 1, term: t.trim() })).filter(({ term }) => term && !term.startsWith('#') && term.length >= min);
}

/** Is a package path on the allow-list? An entry ending in "/" is a folder prefix, any other entry is one exact path.
 * With `exts`, the file must also end in one of them (so a stray workbook or archive inside the folder is left out). */
export const allowed = (rel, allow, exts) => allow.some((a) => (a === '' || a.endsWith('/') ? rel.startsWith(a) : rel === a))
  && (!exts || exts.includes((rel.split('.').pop() || '').toLowerCase()));

/** Quoted strings of 8+ characters in a removed block: harvested as extra terms (kept in memory, never printed). */
export function harvest(text, min = 8) {
  const out = new Set();
  for (const m of text.matchAll(/"((?:[^"\\\n]|\\.){8,})"/g)) if (m[1].length >= min) out.add(m[1]);
  return [...out];
}

/** Any base64 run longer than the ceiling (bytes of the string), as [{ path, length }]. */
export function base64Runs(files, ceiling, allowPaths = []) {
  const re = /[A-Za-z0-9+/=]{16,}/g; const out = [];
  for (const [p, u8] of Object.entries(files)) {
    if (allowPaths.includes(p) || !isText(u8)) continue;
    let max = 0; for (const m of dec(u8).matchAll(re)) max = Math.max(max, m[0].length);
    if (max > ceiling) out.push({ path: p, length: max });
  }
  return out;
}

/**
 * The whole run, without touching the disk.
 * @param {{ pkg: Record<string, Uint8Array>, pub: any, rules: any, terms: {n:number,term:string}[], extra?: Record<string, Uint8Array> }} a
 *   pkg: the package files keyed by path from the package top; extra: files rules may bring in (replaceFile), by name.
 * @returns {{ ok: boolean, errors: string[], out: Record<string, Uint8Array>, pack: Record<string, Uint8Array>, manifest: any, counts: any }}
 */
export function buildImport({ pkg, pub, rules, terms, extra = {} }) {
  const errors = []; const out = Object.create(null); const pack = Object.create(null);
  const root = pub.root || '';
  const inRoot = Object.fromEntries(Object.entries(pkg).filter(([k]) => k.startsWith(root)).map(([k, v]) => [k.slice(root.length), v]));
  const allow = (pub.allow || []).map((a) => (a.startsWith(root) ? a.slice(root.length) : a));
  const inHash = {}; const left = [];
  for (const [rel, u8] of Object.entries(inRoot)) {
    if (allowed(rel, allow, pub.allowExt)) { out[rel] = u8; inHash[rel] = sha(u8); } else left.push(rel);
  }
  const outsideRoot = Object.keys(pkg).length - Object.keys(inRoot).length;
  const edits = []; const byCategory = {}; const harvested = [];
  const edit = (e) => { edits.push(e); byCategory[e.category] = (byCategory[e.category] || 0) + e.applied; };
  const missing = []; let removedToPack = 0;

  for (const r of rules.edits || []) {
    const base = { id: r.id, category: r.category || 'uncategorised', op: r.op, file: r.file };
    const fail = (why) => { errors.push(`edit ${r.id}: ${why}`); missing.push(r.id); };
    if (!r.id || !r.op) { errors.push(`an edit has no id or no op`); continue; }
    if (r.op === 'dropFile') {
      if (!(r.file in out)) { fail('file is not in the output'); continue; }
      if (r.pack) { pack[r.file] = out[r.file]; removedToPack++; }
      delete out[r.file]; edit({ ...base, applied: 1, lines: 0 }); continue;
    }
    if (r.op === 'addFile') {
      const w = extra[r.with];
      if (r.file in out) { fail('file is already in the output'); continue; }
      if (!w) { fail('file to add not supplied'); continue; }
      out[r.file] = w; edit({ ...base, applied: 1, lines: 0 }); continue;
    }
    if (!(r.file in out)) { fail('file is not in the output'); continue; }
    if (r.op === 'replaceFile') {
      const w = extra[r.with];
      if (!w) { fail('replacement file not supplied'); continue; }
      out[r.file] = w; edit({ ...base, applied: 1, lines: 0 }); continue;
    }
    if (!isText(out[r.file])) { fail('not a text file'); continue; }
    let text = dec(out[r.file]); const want = r.count ?? 1;
    if (r.op === 'escapeControls') {
      let n = 0, bad = false;
      const next = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (c, i) => { n++; if (text[i - 1] === '\\') bad = true; return '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'); });
      if (bad) { fail('a control byte follows a backslash: escaping it would change the text'); continue; }
      if (n !== want) { fail(`found ${n} control bytes, wanted ${want}`); continue; }
      out[r.file] = Buffer.from(next); edit({ ...base, applied: 1, lines: 0 }); continue;   // one edit, however many bytes
    }
    if (r.op === 'replace') {
      if (typeof r.find !== 'string' || !r.find || typeof r.replace !== 'string') { fail('needs find and replace'); continue; }
      const n = countOf(text, r.find);
      if (n !== want) { fail(`expected text found ${n} times, wanted ${want}`); continue; }
      text = text.split(r.find).join(r.replace);
      out[r.file] = Buffer.from(text); edit({ ...base, applied: n, lines: 0 }); continue;
    }
    if (r.op === 'removeBlock') {
      if (!r.start || !r.end) { fail('needs start and end'); continue; }
      let n = 0, lines = 0, cut = ''; let from = 0; let next = '';
      for (;;) {
        const s = text.indexOf(r.start, from); if (s < 0) { next += text.slice(from); break; }
        const e = text.indexOf(r.end, s + r.start.length); if (e < 0) { n = -1; break; }
        const stop = e + r.end.length; const block = text.slice(s, stop);
        n++; lines += countOf(block, '\n'); cut += block + '\n'; next += text.slice(from, s); from = stop;
      }
      if (n !== want) { fail(`block found ${n < 0 ? 'with no end' : n + ' times'}, wanted ${want}`); continue; }
      if (r.harvest) harvested.push(...harvest(cut));
      if (r.pack) { pack[`${r.id}.txt`] = Buffer.from(cut); removedToPack++; }
      out[r.file] = Buffer.from(next); edit({ ...base, applied: n, lines }); continue;
    }
    fail(`unknown op ${r.op}`);
  }

  // scan: deny-list terms and harvested strings over every output path and file, then the base64 ceiling
  // strings the owner has reviewed as ordinary words (rules.harvestIgnore) are not searched for
  const ignore = new Set(rules.harvestIgnore || []);
  for (let i = harvested.length - 1; i >= 0; i--) if (ignore.has(harvested[i])) harvested.splice(i, 1);
  const findings = []; const manifestFiles = {};
  const inspect = (hayLabel, hay) => {
    const low = hay.toLowerCase();
    for (const { n, term } of terms) if (low.includes(term.toLowerCase())) findings.push(`${hayLabel}: deny-list line ${n}`);
  };
  for (const [rel, u8] of Object.entries(out)) {
    inspect(`<path #${Object.keys(out).indexOf(rel) + 1}>`, rel);
    inspect(rel, isText(u8) ? dec(u8) : Buffer.from(u8).toString('latin1'));
    if (isText(u8)) { const t = dec(u8); for (const h of new Set(harvested)) if (t.includes(h)) findings.push(`${rel}: a string from a removed block`); }
  }
  for (const b of base64Runs(out, pub.base64Ceiling ?? 4096, [...(pub.base64Allow || []), ...(rules.base64Allow || [])])) findings.push(`${b.path}: base64 run of ${b.length} over the ceiling`);

  for (const rel of Object.keys(out).sort()) manifestFiles[rel] = { in: inHash[rel] || null, out: sha(out[rel]), bytes: out[rel].length };
  const manifest = {
    tool: 'tools/uwtool-import.mjs', licence: pub.licence || null, package: { fingerprint: fingerprint(inRoot), files: Object.keys(inRoot).length, outsideRoot },
    files: manifestFiles,
    edits: edits.map((e) => ({ id: e.id, category: e.category, op: e.op, applied: e.applied, lines: e.lines })),
  };
  inspect('manifest', JSON.stringify(manifest));
  const counts = {
    packageFiles: Object.keys(pkg).length, copied: Object.keys(inRoot).length - left.length, leftOutByAllowList: left.length, outsideRoot,
    finalFiles: Object.keys(out).length, editsApplied: edits.reduce((s, e) => s + e.applied, 0), editsByCategory: byCategory,
    expectedTextMissing: missing.length, harvestedStrings: new Set(harvested).size, movedToPack: removedToPack,
    bytesBefore: Object.values(inRoot).reduce((s, u) => s + u.length, 0), bytesAfter: Object.values(out).reduce((s, u) => s + u.length, 0),
    findings: findings.length,
  };
  for (const f of findings) errors.push(`refused: ${f}`);
  return { ok: !errors.length, errors, out, pack, manifest, counts };
}

// ---- the command line ----
const walk = (dir) => {
  const out = {};
  (function go(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) go(p); else if (e.isFile()) out[path.relative(dir, p).split(path.sep).join('/')] = new Uint8Array(fs.readFileSync(p));
    }
  })(dir);
  return out;
};
const gitIgnored = (p) => {
  try { execFileSync('git', ['check-ignore', '-q', p], { cwd: path.dirname(p), stdio: 'pipe' }); return true; } catch (e) {
    if (e.status === 1) return false;                        // inside a repo and not ignored
    return null;                                             // not a repo, or git missing
  }
};

export function main(argv, env = process.env) {
  const arg = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
  const from = arg('from'), rulesFile = arg('rules'), outDir = arg('out'), packDir = arg('pack');
  if (!from || !rulesFile || !outDir) { console.error('usage: uwtool-import.mjs --from <dir> --rules <file> --out <dir> [--pack <dir>] [--denylist <file>] [--public <file>]'); return 2; }
  const pub = JSON.parse(fs.readFileSync(arg('public') || DEFAULT_PUBLIC, 'utf8'));
  const rules = JSON.parse(fs.readFileSync(rulesFile, 'utf8'));
  const dl = arg('denylist') || (env.DENYLIST ? null : DEFAULT_DENYLIST);
  const text = env.DENYLIST && !arg('denylist') ? env.DENYLIST : (dl && fs.existsSync(dl) ? fs.readFileSync(dl, 'utf8') : '');
  const terms = parseTerms(text, pub.minTermLength ?? 3);
  if (!terms.length) { console.error('refused: no deny-list (use --denylist, env DENYLIST or private/uwtool/denylist.txt). Nothing was written.'); return 1; }
  if (packDir && gitIgnored(path.resolve(packDir)) === false) { console.error('refused: the pack folder is inside a git repository and is not git-ignored. Nothing was written.'); return 1; }
  const extra = {};
  for (const r of rules.edits || []) if ((r.op === 'replaceFile' || r.op === 'addFile') && r.with) { try { extra[r.with] = new Uint8Array(fs.readFileSync(path.resolve(path.dirname(rulesFile), r.with))); } catch { /* reported by buildImport */ } }
  const pkg = walk(path.resolve(from));
  const r = buildImport({ pkg, pub, rules, terms, extra });
  console.log(JSON.stringify(r.counts, null, 1));
  if (!r.ok) { for (const e of r.errors) console.error(e); console.error('Nothing was written.'); return 1; }
  const out = path.resolve(outDir);
  if (fs.existsSync(out) && fs.readdirSync(out).length && !fs.existsSync(path.join(out, MANIFEST))) { console.error('refused: the output folder is not empty and is not a previous import. Nothing was written.'); return 1; }
  fs.rmSync(out, { recursive: true, force: true });
  for (const [rel, u8] of Object.entries(r.out)) { const f = path.join(out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, u8); }
  fs.writeFileSync(path.join(out, MANIFEST), JSON.stringify(r.manifest, null, 1) + '\n');
  if (packDir) for (const [rel, u8] of Object.entries(r.pack)) { const f = path.join(path.resolve(packDir), rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, u8); }
  console.log(`wrote ${Object.keys(r.out).length} files and ${MANIFEST}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));

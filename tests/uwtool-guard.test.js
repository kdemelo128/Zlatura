/* Guard for the cleaned underwriting tool (docs/proposals/monal-builtin-and-rename.md, A7, PR 1).
   The repo is PUBLIC. Two scans of every tracked text file:
   1. the deny-list: terms the repo must never hold (the firm's name, sheet names, property names...). The terms are
      never committed. They come from env DENYLIST (one per line; a CI secret) or private/uwtool/denylist.txt (git-ignored).
      With neither, this prints a loud notice and passes locally; under CI=true it fails (set the secret to fix).
      Findings name the path and the term's line number in the list, never the term.
   2. long base64 runs (a workbook or worker pasted in as text): any run over the ceiling fails, except the vendored
      files listed in THIRD_PARTY.md. This always runs.
   Blind spot: a term that is not on the list, or spelled differently from it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DENYLIST_FILE = 'private/uwtool/denylist.txt';
export const MIN_TERM = 3;                  // shorter terms would match everywhere
export const B64_CEILING = 32768;           // a base64 run longer than this is a pasted binary
// vendored libraries that carry their own wasm or worker as one base64 string (THIRD_PARTY.md); same files as hygiene.test.js
export const B64_ALLOW = [
  'vendor/ocr/tesseract-core-7.0.0-simd-lstm.wasm.js',
  'vendor/pdf-4.7.76-legacy.worker.min.js',
];

// the agent and rule files that already name the firm in order to forbid committing its files; already public, owner to decide whether to scrub
export const DENY_EXEMPT = ['.claude/agents/designer.md', 'AGENTS.md', 'docs/working-rules.md'];

/** One term per line; blank lines and # comments dropped. Returns [{ n, term }] (n is the 1-based line, for messages). */
export function parseTerms(text) {
  return String(text || '').split(/\r?\n/).map((t, i) => ({ n: i + 1, term: t.trim() }))
    .filter(({ term }) => term && !term.startsWith('#') && term.length >= MIN_TERM);
}

/** The deny-list from env or the private file: { terms, source } or { terms: [], source: null }. */
export function loadDenylist(env = process.env, root = ROOT) {
  if (env.DENYLIST && env.DENYLIST.trim()) return { terms: parseTerms(env.DENYLIST), source: 'env DENYLIST' };
  const f = path.join(root, DENYLIST_FILE);
  if (fs.existsSync(f)) return { terms: parseTerms(fs.readFileSync(f, 'utf8')), source: DENYLIST_FILE };
  return { terms: [], source: null };
}

/** Case-insensitive hits of any term in any file's text ('path: deny-list line N') or path ('<a path name>: ...'; the path
 * itself would print the term). Never prints the term. */
export function denyFindings(files, terms) {
  const out = [];
  for (const { path: p, text } of files) {
    const low = p.toLowerCase(), body = text.toLowerCase();
    for (const { n, term } of terms) {
      const t = term.toLowerCase();
      if (low.includes(t)) out.push(`<a tracked path name>: deny-list line ${n}`);
      if (body.includes(t)) out.push(`${p}: deny-list line ${n}`);
    }
  }
  return out;
}

/** Long base64 runs: 'path: base64 run over N bytes'. */
export function base64Findings(files, ceiling = B64_CEILING, allow = B64_ALLOW) {
  const re = new RegExp(`[A-Za-z0-9+/=]{${ceiling + 1},}`);
  return files.filter(({ path: p, text }) => !allow.includes(p) && re.test(text)).map(({ path: p }) => `${p}: base64 run over ${ceiling} bytes`);
}

const tracked = (cwd) => execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean);
const textFiles = (cwd, paths) => paths.flatMap((p) => {
  let buf; try { buf = fs.readFileSync(path.join(cwd, p)); } catch { return []; }
  return buf.includes(0) ? [] : [{ path: p, text: buf.toString('utf8') }];
});

test('no tracked text file or path holds a deny-listed term', (t) => {
  const { terms, source } = loadDenylist();
  if (!terms.length) {
    const msg = `DENY-LIST NOT AVAILABLE: no env DENYLIST and no ${DENYLIST_FILE}. The repo was NOT scanned for firm terms.`;
    console.warn(`\n!!!!! ${msg}\n`);
    if (process.env.CI === 'true') assert.fail(`${msg} Set the DENYLIST secret (one term per line).`);
    t.diagnostic(msg);
    return;
  }
  t.diagnostic(`scanned against ${terms.length} terms from ${source}`);
  assert.deepEqual(denyFindings(textFiles(ROOT, tracked(ROOT)).filter((f) => !DENY_EXEMPT.includes(f.path)), terms), []);
});

test('no tracked text file holds a base64 run over the ceiling', () => {
  assert.deepEqual(base64Findings(textFiles(ROOT, tracked(ROOT))), []);
});

test('the scans catch an injected term and a 300 KB run in a throwaway repo (never this index)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zl-uwguard-'));
  try {
    const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
    git('init', '-q');
    const term = ['Invent', 'edFirm'].join('');           // an invented term, built at run time
    fs.writeFileSync(path.join(dir, 'a.md'), `the ${term.toLowerCase()} sheet`);
    fs.writeFileSync(path.join(dir, 'b.txt'), 'A'.repeat(300 * 1024));
    fs.writeFileSync(path.join(dir, 'clean.txt'), 'nothing here');
    fs.mkdirSync(path.join(dir, `${term}-dir`)); fs.writeFileSync(path.join(dir, `${term}-dir`, 'c.txt'), 'x');
    git('add', '-A');
    const files = textFiles(dir, tracked(dir));
    const terms = parseTerms(`# comment\n\nxx\n${term}\n`);
    assert.deepEqual(terms.map((x) => x.n), [4], 'comments, blanks and short terms are dropped; the line number is kept');
    const deny = denyFindings(files, terms);
    assert.deepEqual(deny.sort(), ['<a tracked path name>: deny-list line 4', 'a.md: deny-list line 4'].sort(), 'case-insensitive, in text and in paths');
    assert.ok(!deny.join('\n').includes(term), 'the term is never printed');
    assert.deepEqual(base64Findings(files), [`b.txt: base64 run over ${B64_CEILING} bytes`]);
    assert.deepEqual(base64Findings(files, B64_CEILING, ['b.txt']), [], 'the allow-list is exact');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('loadDenylist reads env first, then the private file, and reports none when neither exists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zl-uwguard-'));
  try {
    assert.deepEqual(loadDenylist({}, dir), { terms: [], source: null });
    fs.mkdirSync(path.join(dir, 'private/uwtool'), { recursive: true });
    fs.writeFileSync(path.join(dir, DENYLIST_FILE), 'filedterm\n');
    assert.equal(loadDenylist({}, dir).terms[0].term, 'filedterm');
    const e = loadDenylist({ DENYLIST: 'envterm\nsecond' }, dir);
    assert.deepEqual(e.terms.map((x) => x.term), ['envterm', 'second']);
    assert.equal(e.source, 'env DENYLIST');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the vendored base64 allow-list is exact and the ceiling is not loosened', () => {
  assert.equal(B64_CEILING, 32768);
  assert.ok(B64_ALLOW.every((p) => fs.existsSync(path.join(ROOT, p))), 'every allow-listed file exists');
});

/* Repo hygiene guard: the repo is PUBLIC, real files live only in the git-ignored private/ folder.
   Fails if a tracked path is under private/, is a credential or local database, or is a real-document
   type outside the allowlist of invented fixtures; and if a tracked text file holds a high-confidence
   secret pattern. Complements gitleaks (.github/workflows/security-scan.yml): this fails locally and in
   the npm test job (test.yml), needs no network, and also covers the document types gitleaks ignores.
   Messages name the path and the rule only, never the match.
   Blind spot: it cannot tell that a realistic name or figure in a committed fixture is invented. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Invented fixtures only. .gitignore already ignores *.pdf *.xlsx *.xls, so any tracked one was force-added.
// Today none is tracked; add an exact path here only for a fixture you invented.
export const ALLOWED_DOCS = [];

export const PATH_RULES = [
  ['private/ folder', (p) => /^private\//.test(p)],
  ['.env file', (p) => /(^|\/)(\.env($|\.)|[^/]*\.env$)/.test(p)],
  ['key or certificate file', (p) => /\.(pem|key|p12|pfx|kdbx)$/i.test(p) || /(^|\/)id_(rsa|dsa|ecdsa|ed25519)/.test(p)],
  ['local database', (p) => /\.(sqlite3?|db)$/i.test(p)],
  ['real-document type', (p, allowed) => /\.(pdf|xlsx|xls|docx|pptx)$/i.test(p) && !allowed.includes(p)],
];

// Built from pieces so this file does not contain a match itself.
const j = (...s) => s.join('');
export const SECRET_RULES = [
  ['private key block', new RegExp(j('-----BEGIN (?:[A-Z]+ )*PRIVATE', ' KEY-----'))],
  ['AWS access key id', new RegExp(j('\\b(?:AKIA|ASIA)', '[0-9A-Z]{16}\\b'))],
  ['GitHub token', new RegExp(j('\\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat', '_[A-Za-z0-9_]{40,})'))],
  ['Slack token', new RegExp(j('\\bxox[bap]', '-[A-Za-z0-9-]{10,}'))],
  ['sk- API key', new RegExp(j('\\bsk', '-[A-Za-z0-9_-]{32,}'))],
  ['Google API key', new RegExp(j('\\bAIza', '[0-9A-Za-z_-]{35}\\b'))],
  ['JWT', new RegExp(j('\\beyJ[A-Za-z0-9_-]{15,}\\.eyJ[A-Za-z0-9_-]{15,}\\.', '[A-Za-z0-9_-]{20,}'))],
  // the broker's filler package carries the firm's workbook as a base64 block (docs/proposals/uw-embed-as-is.md, section 2): it is never committed
  ['embedded workbook block', new RegExp(j('tpl', 'b64'))],
  // the filler package's other two data blocks (the firm template's layout, an inlined worker): same rule, repo-wide
  ['embedded tool data block', new RegExp(j('<script[^>]*\\bid\\s*=\\s*["\']', '(?:spec|pdfworker)["\']'))],
  ['base64 run over 256 KB', /[A-Za-z0-9+/=]{262144,}/],
];
// path -> rule names allowed there (documented test strings); none today
export const SECRET_ALLOW = {
  // the proposal names the block it forbids (the name only, never its contents)
  'docs/proposals/uw-embed-as-is.md': ['embedded workbook block'],
  'docs/proposals/monal-builtin-and-rename.md': ['embedded workbook block'],
  // vendored libraries that carry their own wasm or worker as one base64 string (THIRD_PARTY.md)
  'vendor/ocr/tesseract-core-7.0.0-simd-lstm.wasm.js': ['base64 run over 256 KB'],
  'vendor/pdf-4.7.76-legacy.worker.min.js': ['base64 run over 256 KB'],
  'vendor/web-llm-0.2.87/web-llm.js': ['base64 run over 256 KB'],   // its embedded tokenizer/runtime WebAssembly, as one base64 string (THIRD_PARTY.md)
};

export function pathFindings(paths, allowed = ALLOWED_DOCS) {
  return paths.flatMap((p) => PATH_RULES.filter(([, f]) => f(p, allowed)).map(([rule]) => `${p}: ${rule}`));
}
export function secretFindings(files, allow = SECRET_ALLOW) {
  return files.flatMap(({ path: p, text }) => SECRET_RULES
    .filter(([rule, re]) => re.test(text) && !(allow[p] || []).includes(rule)).map(([rule]) => `${p}: ${rule}`));
}

const tracked = (cwd) => execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8', maxBuffer: 1 << 28 })
  .split('\0').filter(Boolean);
const textFiles = (cwd, paths) => paths.flatMap((p) => {
  let buf; try { buf = fs.readFileSync(path.join(cwd, p)); } catch { return []; }
  return buf.includes(0) ? [] : [{ path: p, text: buf.toString('utf8') }];
});

test('no tracked path is private, a credential, a local database or a real document', () => {
  assert.deepEqual(pathFindings(tracked(ROOT)), []);
});

test('no tracked text file holds a high-confidence secret', () => {
  assert.deepEqual(secretFindings(textFiles(ROOT, tracked(ROOT))), []);
});

test('the guard catches each case in a throwaway repo (never this index)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zl-hygiene-'));
  try {
    const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
    git('init', '-q');
    const bad = {
      'private/x.txt': 'a', '.env.local': 'a', 'cert.pem': 'a', 'a/b.key': 'a', 'id_rsa': 'a', 'x.kdbx': 'a',
      'data.sqlite': 'a', 'local.db': 'a', 'lease.pdf': 'a', 'rr.xlsx': 'a',
      'note.txt': j('AKIA', 'ABCDEFGHIJKLMNOP'),
    };
    for (const [p, c] of Object.entries(bad)) {
      fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
      fs.writeFileSync(path.join(dir, p), c);
    }
    git('add', '-A', '-f');
    const found = [...pathFindings(tracked(dir)), ...secretFindings(textFiles(dir, tracked(dir)))].join('\n');
    for (const p of Object.keys(bad)) assert.ok(found.includes(`${p}: `), `${p} not caught`);
    assert.ok(!found.includes('ABCDEFGHIJKLMNOP'), 'the match is never printed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('every secret rule fires on a sample, the allowlists are exact, and ordinary paths pass', () => {
  const samples = {
    'private key block': j('-----BEGIN RSA PRIVATE', ' KEY-----'),
    'AWS access key id': j('AKIA', 'ABCDEFGHIJKLMNOP'),
    'GitHub token': j('ghp', '_', 'a'.repeat(36)),
    'Slack token': j('xoxb', '-1234567890-abc'),
    'sk- API key': j('sk', '-', 'a'.repeat(40)),
    'Google API key': j('AIza', 'a'.repeat(35)),
    'JWT': j('eyJ', 'a'.repeat(20), '.eyJ', 'b'.repeat(20), '.', 'c'.repeat(24)),
    'embedded workbook block': j('<script id="tpl', 'b64">'),
    'embedded tool data block': j('<script id="sp', 'ec" type="application/json">'),
    'base64 run over 256 KB': 'A'.repeat(262144),
  };
  // a rule that is deleted, or added without a sample, must fail here: the loop below only visits rules that exist
  assert.deepEqual(SECRET_RULES.map(([name]) => name).sort(), Object.keys(samples).sort(), 'every secret rule has a sample and every sample a rule');
  for (const [rule] of SECRET_RULES) {
    assert.deepEqual(secretFindings([{ path: 'x.txt', text: samples[rule] }]), [`x.txt: ${rule}`]);
  }
  assert.deepEqual(secretFindings([{ path: 'x.txt', text: samples['Slack token'] }], { 'x.txt': ['Slack token'] }), []);
  assert.deepEqual(pathFindings(['lease.pdf']), ['lease.pdf: real-document type']);
  assert.deepEqual(pathFindings(['lease.pdf'], ['lease.pdf']), []);
  assert.deepEqual(pathFindings(['app/app.js', 'docs/environment.md', 'tests/e2e/files/pages.json', 'docs/dev.md']), []);
  assert.deepEqual(ALLOWED_DOCS, [], 'allowlist is empty: add only exact invented fixtures');
});

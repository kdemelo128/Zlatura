/* The maintained underwriting tool (app/uwtool/, docs/proposals/one-underwriting-space.md section A) must make no outside
 * call. Replaces the importer-output check: the folder is edited here now, so this scan is what stops a later edit from
 * reaching another host. Fails on any of: an absolute http(s) or protocol-relative address in fetch / XHR open / WebSocket /
 * EventSource / import() / importScripts / script src / link href / img src / CSS url() / @import; navigator.sendBeacon; a
 * re-enabled AI or OCR endpoint (a named AI host, a fetch of an /api/ route, a key kept in storage, a language-data download).
 * Allowed: same-origin relative paths, data: and blob:. Blind spot: an address built at run time from pieces
 * (the content policy and tests/e2e/uwtool-flow.mjs, which counts real requests, are the other two layers). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'app/uwtool');
const walk = (d, base = d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), base) : [path.relative(base, path.join(d, e.name)).split(path.sep).join('/')]));

const ABS = String.raw`(?:(?:https?|wss?):)?\/\/[A-Za-z0-9]`;          // an absolute or protocol-relative address
const Q = String.raw`\s*\(?\s*['"\`]`;                           // an opening paren and quote
export const RULES = [
  ['fetch/XHR/import of an outside address', new RegExp(String.raw`\b(?:fetch|importScripts|import)${Q}${ABS}|\.open\(\s*['"\`][A-Z]+['"\`]\s*,\s*['"\`]${ABS}`)],
  ['WebSocket/EventSource/Worker of an outside address', new RegExp(String.raw`\bnew\s+(?:WebSocket|EventSource|Worker|SharedWorker)${Q}${ABS}`)],
  ['static import from an outside address', new RegExp(String.raw`\b(?:from|import)\s+['"]${ABS}`)],
  ['script src / link href / img src to an outside address', new RegExp(String.raw`<(?:script|link|img|iframe|source|embed|object)\b[^>]*?\b(?:src|href|data)\s*=\s*['"]?${ABS}`, 'i')],
  ['CSS url() or @import of an outside address', new RegExp(String.raw`(?:url\(|@import\s+(?:url\()?)\s*['"]?${ABS}`, 'i')],
  ['src/href set in code to an outside address', new RegExp(String.raw`\.(?:src|href)\s*=\s*['"\`]${ABS}|setAttribute\(\s*['"](?:src|href)['"]\s*,\s*['"\`]${ABS}`)],
  ['navigator.sendBeacon', /\bsendBeacon\b/],
  ['AI endpoint or key', /api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis|localStorage\.setItem\(\s*['"]uw_key/i],
  ['an /api/ route', /\bfetch\(\s*['"`]\/api\//],
  ['OCR language-data or core download', /tessdata|tesseract-core|langPath\s*:\s*['"`]https?:|corePath\s*:\s*['"`]https?:|workerPath\s*:\s*['"`]https?:/i],
];
const SCAN = /\.(?:js|mjs|html|css|json|webmanifest|svg)$/i;

/** Findings in { relpath: Buffer|string }: ['path: rule']. Binary files (a NUL byte) are skipped. */
export function outsideCallFindings(files) {
  const out = [];
  for (const [rel, b] of Object.entries(files)) {
    const buf = Buffer.isBuffer(b) ? b : Buffer.from(b);
    if (!SCAN.test(rel) || buf.includes(0)) continue;
    const text = buf.toString('utf8');
    for (const [name, re] of RULES) if (re.test(text)) out.push(`${rel}: ${name}`);
  }
  return out;
}
const load = (dir) => Object.fromEntries(walk(dir).map((r) => [r, fs.readFileSync(path.join(dir, r))]));

test('no file under app/uwtool makes an outside call', () => {
  const f = load(DIR);
  assert.ok(Object.keys(f).length >= 70, 'scanned the whole folder');
  assert.deepEqual(outsideCallFindings(f), []);
});

test('MUTATION: each kind of outside call, planted in a temp copy of the folder, is found (and the clean copy is not)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zl-uwout-'));
  try {
    fs.cpSync(DIR, tmp, { recursive: true });
    assert.deepEqual(outsideCallFindings(load(tmp)), [], 'the copy is clean');
    const U = 'https://x.example.test/a';
    const plants = [
      ['fetch', 'editor.js', `\nfetch('${U}');`],
      ['fetch protocol-relative', 'editor.js', "\nfetch('//x.example.test/a');"],
      ['XHR', 'editor.js', `\nconst r=new XMLHttpRequest();r.open('GET','${U}');`],
      ['WebSocket', 'editor.js', "\nnew WebSocket('wss://x.example.test/s');"],
      ['EventSource', 'editor.js', `\nnew EventSource('${U}');`],
      ['dynamic import', 'editor.js', `\nimport('${U}');`],
      ['static import', 'editor.js', `\nimport x from '${U}';`],
      ['importScripts', 'editor.js', `\nimportScripts('${U}');`],
      ['script src', 'index.html', `<script src="${U}.js"></script>`],
      ['link href', 'index.html', `<link rel="stylesheet" href="${U}.css">`],
      ['CSS url', 'plex-fonts.css', `\n.a{background:url(${U}.png)}`],
      ['CSS @import', 'plex-fonts.css', `\n@import "${U}.css";`],
      ['src set in code', 'editor.js', `\nimg.src='${U}';`],
      ['sendBeacon', 'editor.js', '\nnavigator.sendBeacon(location.pathname, "x");'],
      ['AI endpoint', 'editor.js', '\nconst u="api.anthropic.com";'],
      ['key in storage', 'editor.js', "\nlocalStorage.setItem('uw_key', k);"],
      ['api route', 'editor.js', "\nfetch('/api/ocr');"],
      ['OCR download', 'editor.js', `\nconst o={langPath:'${U}'};`],
    ];
    for (const [kind, file, add] of plants) {
      const p = path.join(tmp, file); const orig = fs.readFileSync(p);
      fs.writeFileSync(p, Buffer.concat([orig, Buffer.from(add)]));
      const found = outsideCallFindings(load(tmp));
      fs.writeFileSync(p, orig);
      assert.ok(found.some((x) => x.startsWith(`${file}: `)), `${kind}: planted in ${file} was not found`);
    }
    assert.deepEqual(outsideCallFindings(load(tmp)), [], 'restored copy is clean again');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('same-origin relative paths, data: and blob: are allowed', () => {
  const ok = {
    'a.js': "fetch('./data.json'); fetch('/zlatura/x'); fetch(`rel/${a}`); import('./m.js'); new Worker('./w.js'); new Worker(URL.createObjectURL(b)); x.src='data:image/png;base64,AAAA'; y.href='blob:abc';",
    'a.html': '<script src="app.js"></script><link rel="stylesheet" href="a.css"><img src="data:image/svg+xml;utf8,<svg/>">',
    'a.css': '@import "b.css"; .a{background:url(fonts/a.woff2)} .b{background:url("data:image/png;base64,AAAA")} .c{background:url(blob:x)}',
  };
  assert.deepEqual(outsideCallFindings(ok), []);
});

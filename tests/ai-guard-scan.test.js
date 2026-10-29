/* Source scan: every call to the AI server goes through the one guard in app/ai.js, and a new unguarded call fails here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const APP = new URL('../app/', import.meta.url).pathname;
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (/vendor|node_modules/.test(e.name) ? [] : walk(path.join(dir, e.name))) : e.name.endsWith('.js') && !/\.min\.js$/.test(e.name) ? [path.join(dir, e.name)] : []));
// comments and strings may mention these words; only code is scanned
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const FILES = walk(APP).map((f) => [path.relative(APP, f), code(fs.readFileSync(f, 'utf8'))]);

test('fetch( appears once in app/, inside request(), after the guard', () => {
  const hits = FILES.flatMap(([f, s]) => [...s.matchAll(/(?<![\w.])fetch\s*\(/g)].map((m) => [f, s, m.index]));
  assert.deepEqual(hits.map(([f]) => f), ['ai.js'], 'one fetch( in app/, in ai.js');
  const [, s, at] = hits[0];
  const req = s.indexOf('async function request(');
  assert.ok(req >= 0 && req < at, 'the fetch is inside request()');
  const g = s.indexOf('await guard(', req);
  assert.ok(g > req && g < at, 'guard( runs before the fetch');
});

test("'/api/' appears only in ai.js, and no other way out of the page is used", () => {
  for (const [f, s] of FILES) {
    if (f !== 'ai.js') assert.ok(!/['"`]\/api\//.test(s), `${f} names an /api/ path`);
    assert.ok(!/XMLHttpRequest|sendBeacon|new\s+WebSocket|EventSource/.test(s), `${f} uses another network API`);
  }
});

test('every ai.<call>( passes a scope object literal first, and every path in ai.js goes through request()', () => {
  let n = 0;
  for (const [f, s] of FILES) {
    for (const m of s.matchAll(/\bai\.(health|extract|assist|transcribe|research|meeting)\(\s*(\S)/g)) {
      n += 1;
      assert.equal(m[2], '{', `${f}: ai.${m[1]}( without a scope object first`);
    }
  }
  assert.ok(n >= 6, `${n} calls seen`);
  const ai = FILES.find(([f]) => f === 'ai.js')[1];
  for (const m of ai.matchAll(/export const (health|extract|assist|transcribe|research|meeting) = \(([^)]*)\) => (.*)/g)) {
    assert.match(m[2], /^scope\b/, `${m[1]} takes the scope first`);
    assert.match(m[3], /^request\('\/api\/[a-z]+', scope\b/, `${m[1]} hands it to request()`);
  }
});

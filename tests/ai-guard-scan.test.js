/* Source scan: every call to the AI server goes through the one guard in app/ai.js, and a new unguarded call fails here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const APP = new URL('../app/', import.meta.url).pathname;
// app/uwtool/ is the built-in tool: its own page under its own policy (tests/uwtool-builtin.test.js scans it for outside hosts), not app code
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (/vendor|node_modules|^uwtool$/.test(e.name) ? [] : walk(path.join(dir, e.name))) : e.name.endsWith('.js') && !/\.min\.js$/.test(e.name) ? [path.join(dir, e.name)] : []));
// comments and strings may mention these words; only code is scanned
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const FILES = walk(APP).map((f) => [path.relative(APP, f), code(fs.readFileSync(f, 'utf8'))]);

test('the word fetch appears twice in all of app/: in ai.js inside request() after the guard, and in publicdata.js inside getJson() after the host list', () => {
  // any spelling counts: window.fetch(, globalThis.fetch(, fetch.call(, const f = fetch
  const hits = FILES.flatMap(([f, s]) => [...s.matchAll(/\bfetch\b/g)].map((m) => [f, s, m.index]));
  assert.deepEqual(hits.map(([f]) => f), ['ai.js', 'publicdata.js'], 'one fetch token in ai.js and one in publicdata.js');
  const [, s, at] = hits[0];
  assert.match(s.slice(at), /^fetch\(`\$\{s\.url\}\$\{path\}`/, 'it is a plain call to the guarded path');
  const req = s.indexOf('async function request(');
  assert.ok(req >= 0 && req < at, 'the fetch is inside request()');
  const g = s.indexOf('await guard(', req);
  assert.ok(g > req && g < at, 'guard( runs before the fetch');
  // the public-data one: inside getJson(), after the host-list check, and it is the late-bound global (a test may pass its own)
  const [, p, pat] = hits[1];
  const fn = p.indexOf('export async function getJson(');
  const check = p.indexOf('HOSTS.includes(u.hostname)', fn);
  assert.ok(fn >= 0 && check > fn && check < pat, 'the host-list check runs before the fetch, inside getJson()');
  assert.match(p.slice(pat - 12, pat + 8), /globalThis\.fetch\(/);
  // and every web address written in publicdata.js is on the list
  const hosts = [...p.matchAll(/https:\/\/([a-z0-9.-]+)\//g)].map((m) => m[1]);
  const list = /HOSTS = Object\.freeze\(\[([^\]]*)\]\)/.exec(p)[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1));
  for (const h of hosts) assert.ok(list.includes(h), `${h} is written in publicdata.js but not on its host list`);
});

test("'/api/' appears only in ai.js, and no other way out of the page is used", () => {
  for (const [f, s] of FILES) {
    if (!['ai.js', 'publicdata.js', 'publiclookup.js'].includes(f)) assert.ok(!/\/api\//.test(s), `${f} names an /api/ path`);
    assert.ok(!/XMLHttpRequest|sendBeacon|new\s+WebSocket|EventSource/.test(s), `${f} uses another network API`);
    assert.ok(!/\.src\s*=\s*['"`]https?:/.test(s) && !/import\(\s*['"`]https?:/.test(s), `${f} loads a remote script or image`);
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

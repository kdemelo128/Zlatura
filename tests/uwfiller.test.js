/* uwfiller: the underwriting filler package loader (app/uwfiller/pkg.js) and its service-worker route (sw.js). Everything
 * here runs on the invented stand-in package (tests/fixtures/uwfiller-standin/); the broker's real package is never in
 * the repo. A fake Cache Storage stands in for the browser's, and sw.js is run in a vm with a fake worker scope. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as fflate from 'fflate';
import { standinZip, standinFiles } from './fixtures/uwfiller-standin.mjs';
import { BUCKET, filesFromZip, filesFromFolder, fingerprint, loadPackage, packageInfo, erasePackage, pick, findRoot, cleanPath, MAX_FILE, addressOf } from '../app/uwfiller/pkg.js';
import { APPROVED } from '../app/uwfiller/hashes.js';

const BASE = 'https://zl.test/app/';
/** Incompressible bytes, the same every run. */
const noise = (n) => { const b = new Uint8Array(n); let x = 123456789; for (let i = 0; i < n; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; b[i] = x & 255; } return b; };
const enc = (s) => new TextEncoder().encode(s);

/** A Cache Storage that keeps bytes, status and headers (enough for pkg.js and sw.js). */
function fakeCaches() {
  const store = new Map();
  const keyOf = (r, o = {}) => { const u = new URL(typeof r === 'string' ? r : r.url); if (o.ignoreSearch) u.search = ''; return u.href; };
  const mk = (m) => ({
    async put(req, res) { m.set(keyOf(req), { body: new Uint8Array(await res.arrayBuffer()), status: res.status, headers: [...res.headers] }); },
    async match(req, o) { const hit = m.get(keyOf(req, o)); return hit ? new Response(hit.body, { status: hit.status, headers: hit.headers }) : undefined; },
    async addAll() {},
  });
  return {
    store,
    async open(n) { if (!store.has(n)) store.set(n, new Map()); return mk(store.get(n)); },
    async has(n) { return store.has(n); },
    async delete(n) { return store.delete(n); },
    async keys() { return [...store.keys()]; },
    async match(req, o) { for (const m of store.values()) { const r = await mk(m).match(req, o); if (r) return r; } return undefined; },
  };
}
const approved = async () => fingerprint(filesFromZip(standinZip(), fflate));

test('the stand-in package: the approved list holds exactly its fingerprint, from a zip or a folder', async () => {
  const z = filesFromZip(standinZip(), fflate);
  assert.deepEqual(Object.keys(z).sort(), ['example.json', 'filler.js', 'index.html', 'style.css', 'ui.js']);
  const fp = await fingerprint(z);
  assert.ok(APPROVED.some((a) => a.hash === fp), 'the stand-in fingerprint is on the list');
  assert.ok(APPROVED.every((a) => /^[0-9a-f]{64}$/.test(a.hash) && a.label));
  // a folder pick of the whole package, and of public/tool alone, agree with the zip
  const asFiles = (files, strip) => Object.entries(files).map(([p, b]) => Object.assign(new File([b], p.split('/').pop()), { webkitRelativePath: strip ? p.replace(/^public\//, '') : p }));
  const all = standinFiles();
  assert.equal(await fingerprint(await filesFromFolder(asFiles(all, false))), await fingerprint(z));
  assert.equal(await fingerprint(await filesFromFolder(asFiles(Object.fromEntries(Object.entries(all).filter(([p]) => p.startsWith('public/tool/'))), true))), await fingerprint(z));
  // a zip made with a wrapping folder, and with junk files, agrees too
  assert.equal(await fingerprint(filesFromZip(standinZip({ '.DS_Store': enc('x'), '__MACOSX/a': enc('y') }, 'pkg/'), fflate)), await fingerprint(z));
});

test('an approved package is served from its bucket at uw-filler/; a wrong hash is refused and nothing is kept', async () => {
  const caches = fakeCaches();
  const info = await loadPackage(filesFromZip(standinZip(), fflate), { base: BASE, cache: caches, now: () => 1700000000000 });
  assert.equal(info.files, 5);
  assert.equal(info.hash, await approved());
  assert.deepEqual(await packageInfo({ base: BASE, cache: caches }), info);
  const idx = await (await caches.open(BUCKET)).match(new Request(addressOf('index.html', BASE)));
  assert.match(await idx.text(), /Stand-in filler/);
  // one byte changed: a different fingerprint, refused, and the bucket is not touched
  const other = fakeCaches();
  const bad = filesFromZip(standinZip({ 'public/tool/ui.js': enc('/* changed */') }), fflate);
  await assert.rejects(loadPackage(bad, { base: BASE, cache: other }), /not on the approved list/);
  assert.equal(await other.has(BUCKET), false);
  assert.equal(await packageInfo({ base: BASE, cache: other }), null);
  // a refused package leaves a package already loaded as it was
  await assert.rejects(loadPackage(bad, { base: BASE, cache: caches }), /not on the approved list/);
  assert.deepEqual(await packageInfo({ base: BASE, cache: caches }), info);
  // erase removes it
  assert.equal(await erasePackage({ cache: caches }), true);
  assert.equal(await packageInfo({ base: BASE, cache: caches }), null);
});

test('size and shape checks refuse a package before it is kept', () => {
  assert.throws(() => filesFromZip(standinZip({ 'public/tool/index.html': null }), fflate), /no public\/tool\/index\.html/);
  assert.throws(() => filesFromZip(standinZip({ 'public/tool/big.bin': noise(MAX_FILE + 1) }), fflate), /MB, more than a filler file/);
  assert.throws(() => filesFromZip(enc('not a zip at all, just text'), fflate), /could not be opened/);
  assert.throws(() => filesFromZip(new Uint8Array(121e6), fflate), /the most is 120 MB/);
  assert.throws(() => pick(['public/tool/index.html', 'public/tool/a/../b.js']), /unsafe name/);
  assert.throws(() => pick(['public/tool/index.html', 'public/tool/a\\b.js']), /unsafe name/);
  const many = ['public/tool/index.html', ...Array.from({ length: 2001 }, (_, i) => `public/tool/f${i}.js`)];
  assert.throws(() => pick(many), /more than expected/);
  assert.equal(cleanPath('a/b.js'), 'a/b.js');
  for (const p of ['/a', 'a//b', './a', 'a/%2e%2e/b', 'a:b', '']) assert.equal(cleanPath(p), null, p);
  assert.equal(findRoot(['x/public/tool/index.html', 'other/index.html', 'index.html']), 'x/public/tool/');
  assert.equal(findRoot(['docs/index.html']), null);
});

test('the package never touches kv, IndexedDB or localStorage, so a backup cannot hold it', () => {
  for (const f of ['app/uwfiller/pkg.js', 'app/uwfiller/ui.js', 'app/uwfiller/hashes.js']) {
    const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\bkv(Set|Get|Put)?\b|indexedDB|localStorage|from '\.\.\/store\.js'|from '\.\.\/backup/, `${f} stays out of the deal database`);
  }
  // and the backup writer reads kv records only, never Cache Storage
  const bk = fs.readFileSync(new URL('../app/backupui.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../app/backup.js', import.meta.url), 'utf8');
  assert.doesNotMatch(bk, /caches\.|uwfiller|zlatura-uwfiller/);
});

/* ---- sw.js, run with a fake worker scope */
function worker(caches, fetchLog = []) {
  const handlers = {};
  const self = { addEventListener: (t, f) => { handlers[t] = f; }, location: { origin: 'https://zl.test' }, registration: { scope: BASE }, clients: { claim: async () => {} }, skipWaiting: async () => {} };
  const ctx = vm.createContext({ self, caches, URL, Request, Response, Promise, setTimeout, clearTimeout, console, fetch: async (r) => { fetchLog.push(r.url || String(r)); return new Response('network', { status: 200 }); } });
  vm.runInContext(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), ctx, { filename: 'sw.js' });
  return { handlers, fetchLog };
}
const dispatchFetch = (w, url) => new Promise((resolve, reject) => {
  const e = { request: { url, method: 'GET', mode: 'navigate' }, respondWith: (p) => Promise.resolve(p).then(resolve, reject) };
  w.handlers.fetch(e);
});

test('sw.js serves the loaded package at uw-filler/ with the frame policy, and never from the network', async () => {
  const caches = fakeCaches();
  await loadPackage(filesFromZip(standinZip(), fflate), { base: BASE, cache: caches });
  const w = worker(caches);
  for (const [path, type, text] of [['uw-filler/index.html', /text\/html/, /Stand-in filler/], ['uw-filler/', /text\/html/, /Stand-in filler/], ['uw-filler/ui.js', /javascript/, /stand-coins/], ['uw-filler/example.json?x=1', /json/, /Invented Plaza/]]) {
    const r = await dispatchFetch(w, BASE + path);
    assert.equal(r.status, 200, path);
    assert.match(r.headers.get('content-type'), type, path);
    assert.match(await r.text(), text, path);
    const csp = r.headers.get('content-security-policy');
    for (const d of ["script-src 'self'", "worker-src 'self' blob:", "style-src 'self' 'unsafe-inline'", "font-src 'self'", "img-src 'self' data: blob:", "connect-src 'self' blob: data:", "frame-ancestors 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.split('; ').includes(d), `${path}: ${d}`);
    assert.doesNotMatch(csp, /unsafe-eval|script-src[^;]*unsafe-inline/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  }
  // a file the package does not have, and a bucket that was erased: a 404 page with the policy, no network
  const miss = await dispatchFetch(w, BASE + 'uw-filler/nothing.js');
  assert.equal(miss.status, 404);
  assert.ok(miss.headers.get('content-security-policy'));
  await erasePackage({ cache: caches });
  const gone = await dispatchFetch(w, BASE + 'uw-filler/index.html');
  assert.equal(gone.status, 404);
  assert.match(await gone.text(), /Load the package/);
  assert.deepEqual(w.fetchLog, [], 'nothing under uw-filler/ ever goes to the network');
});

test('an app update (a new version of the cache) keeps the package bucket and drops the old app cache', async () => {
  const caches = fakeCaches();
  await loadPackage(filesFromZip(standinZip(), fflate), { base: BASE, cache: caches });
  await caches.open('zlatura-0.0.1');
  await caches.open('zlatura-ocr-tesseract-7.0.0');
  await caches.open('something-else');
  const w = worker(caches);
  await new Promise((resolve) => w.handlers.activate({ waitUntil: (p) => p.then(resolve) }));
  const left = await caches.keys();
  assert.ok(left.includes(BUCKET), `the package bucket survives an update (left: ${left})`);
  assert.ok(left.includes('zlatura-ocr-tesseract-7.0.0'));
  assert.ok(!left.includes('zlatura-0.0.1') && !left.includes('something-else'));
  assert.equal((await packageInfo({ base: BASE, cache: caches })).files, 5);
});

test('nothing from the package is in the install set, and the load-error reset keeps the package', () => {
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const assets = sw.slice(sw.indexOf('const ASSETS'), sw.indexOf('];'));
  assert.doesNotMatch(assets, /uw-filler\/|standin/);
  assert.match(assets, /app\/uwfiller\/pkg\.js/);
  assert.match(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /k !== 'zlatura-uwfiller'/);
});

test('the "exactly the same" comparer refuses a folder outside private/ before it reads or launches anything', async () => {
  const { spawnSync } = await import('node:child_process');
  const tool = new URL('./tools/uwfiller-same.mjs', import.meta.url).pathname;
  for (const dir of ['/tmp', new URL('../app', import.meta.url).pathname, new URL('../tests', import.meta.url).pathname]) {
    const r = spawnSync(process.execPath, [tool, '--package', dir], { encoding: 'utf8', timeout: 20000 });
    assert.equal(r.status, 2, dir);
    assert.match(r.stderr, /Refused: the package folder must be inside private\//);
    assert.equal(r.stdout, '');
  }
});

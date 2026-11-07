import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { sanitizeName, searchFolders, listTree, planDownload, downloadPlan } from '../tools/hub/box.mjs';
import { run } from '../tools/hub/box-cli.mjs';

// fake token built at run time (the secret scan reads every branch)
const TOKEN = ['fake', 'box', 'token', 'abcdefgh1234'].join('_');
const tmp = (p = 'boxt-') => mkdtempSync(join(tmpdir(), p));
const sha = (s) => createHash('sha1').update(s).digest('hex');
const noSleep = async () => {};

// Stub Box: folders {id: {name, items:[...]}}, files {id: content}. Records every call.
function stubBox({ folders = {}, files = {}, search = [], pageSize = 2, status = null } = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const u = new URL(url);
    const json = (o, s = 200) => ({ ok: s < 300, status: s, headers: new Headers(), text: async () => JSON.stringify(o) });
    if (status) { const s = typeof status === 'function' ? status(calls.length, u) : status; if (s) return s; }
    if (u.host === 'dl.example.test') return { ok: true, status: 200, headers: new Headers(), arrayBuffer: async () => Buffer.from(files[u.pathname.slice(1)]) };
    let m;
    if (u.pathname === '/2.0/search') {
      const off = +u.searchParams.get('offset');
      return json({ total_count: search.length, entries: search.slice(off, off + pageSize) });
    }
    if ((m = /^\/2\.0\/folders\/(\w+)\/items$/.exec(u.pathname))) {
      const off = +u.searchParams.get('offset'), items = folders[m[1]].items;
      return json({ total_count: items.length, entries: items.slice(off, off + pageSize) });
    }
    if ((m = /^\/2\.0\/folders\/(\w+)$/.exec(u.pathname))) return json({ id: m[1], name: folders[m[1]].name });
    if ((m = /^\/2\.0\/files\/(\w+)\/content$/.exec(u.pathname))) {
      return { ok: false, status: 302, headers: new Headers({ location: `https://dl.example.test/${m[1]}` }), text: async () => '' };
    }
    return json({}, 404);
  };
  return { f, calls };
}
const file = (id, name, content = 'x') => ({ type: 'file', id, name, size: content.length, sha1: sha(content) });
const dir = (id, name) => ({ type: 'folder', id, name });

test('search paginates across 3 pages and de-duplicates', async () => {
  const search = [1, 2, 3, 4, 5].map((i) => ({ type: 'folder', id: String(i), name: `F${i}`, path_collection: { entries: [{ name: 'Deals' }] } }));
  const { f, calls } = stubBox({ search, pageSize: 2 });
  const r = await searchFolders(TOKEN, ['sale'], { fetch: f });
  assert.equal(r.length, 5);
  assert.equal(r[0].path, 'Deals/F1');
  assert.equal(calls.length, 3);
  assert.ok(calls[2].url.includes('offset=4'));
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
});

test('listTree paginates, recurses, filters extensions and counts skipped by extension', async () => {
  const folders = {
    1: { name: 'Root', items: [file('10', 'a.pdf'), file('11', 'b.JPG'), dir('2', 'Sub'), file('12', 'c.xlsx'), file('13', 'd.dwg')] },
    2: { name: 'Sub', items: [file('20', 'e.csv'), file('21', 'f.jpg'), file('22', 'noext')] },
  };
  const { f } = stubBox({ folders, pageSize: 2 });
  const t = await listTree(TOKEN, '1', { fetch: f });
  assert.deepEqual(t.files.map((x) => x.name).sort(), ['a.pdf', 'c.xlsx', 'e.csv']);
  assert.deepEqual(t.files.find((x) => x.name === 'e.csv').dirs, ['Sub']);
  assert.deepEqual(t.skipped, { jpg: 2, dwg: 1, '(none)': 1 });
});

test('depth limit stops recursion; file cap stops with a clear error', async () => {
  const folders = {};
  for (let i = 1; i <= 5; i++) folders[i] = { name: `L${i}`, items: [file(`f${i}`, `f${i}.pdf`), ...(i < 5 ? [dir(i + 1, `L${i + 1}`)] : [])] };
  const { f } = stubBox({ folders, pageSize: 10 });
  const t = await listTree(TOKEN, '1', { fetch: f, maxDepth: 2 });
  assert.equal(t.files.length, 3);
  assert.equal(t.tooDeep, 1);
  await assert.rejects(listTree(TOKEN, '1', { fetch: f, maxFiles: 2 }), /more than 2 files/);
});

test('sanitizeName: hostile names become one safe segment', () => {
  for (const n of ['../../etc', 'a/b', 'a\\b', 'con', 'CON.txt', 'name.', 'x\u0000y', '.hidden', 'trail  ', '..', '', 'C:evil']) {
    const s = sanitizeName(n);
    assert.ok(s && !/[\\/:\u0000]/.test(s) && !s.includes('..') && !s.startsWith('.') && !/[. ]$/.test(s), `${JSON.stringify(n)} -> ${s}`);
    assert.ok(!/^(con|prn|aux|nul)(\.|$)/i.test(s), s);
  }
  assert.ok(sanitizeName('x'.repeat(500) + '.pdf').length <= 120);
  assert.ok(sanitizeName('x'.repeat(500) + '.pdf').endsWith('.pdf'));
});

test('hostile folder and file names stay inside the destination; collisions get (2)', () => {
  const dest = tmp();
  const tree = { id: '1', name: '../../escape', skipped: {}, tooDeep: 0, files: [
    { id: '1', name: 'a.pdf', size: 1, sha1: 'x', dirs: ['..', 'a/b'] },
    { id: '2', name: '../../../etc/passwd.txt', size: 1, sha1: 'x', dirs: [] },
    { id: '3', name: 'con', size: 1, sha1: 'x', dirs: [] },
    { id: '4', name: 'dup.pdf', size: 1, sha1: 'x', dirs: ['d'] },
    { id: '5', name: 'dup.pdf', size: 1, sha1: 'x', dirs: ['d'] },
    { id: '6', name: 'long' + 'y'.repeat(400) + '.pdf', size: 1, sha1: 'x', dirs: [] },
  ] };
  const plan = planDownload([tree], dest);
  for (const e of plan.entries) assert.ok(e.path.startsWith(resolve(dest) + '/'), e.path);
  const paths = plan.entries.map((e) => e.path);
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.some((p) => p.endsWith('/dup.pdf')) && paths.some((p) => p.endsWith('/dup (2).pdf')));
  for (const p of paths) for (const seg of p.slice(resolve(dest).length + 1).split('/')) assert.ok(seg.length <= 120 && seg !== '..');
});

test('downloadPlan writes via .part then rename, and skips files with the same size and sha1', async () => {
  const dest = tmp();
  const folders = { 1: { name: 'R', items: [file('10', 'a.pdf', 'hello'), file('11', 'b.pdf', 'world!')] } };
  const { f, calls } = stubBox({ folders, files: { 10: 'hello', 11: 'world!' } });
  const tree = await listTree(TOKEN, '1', { fetch: f });
  const plan = planDownload([tree], dest);
  const r1 = await downloadPlan(plan, dest, { fetch: f, token: TOKEN });
  assert.equal(r1.downloaded, 2);
  const target = plan.entries[0].path;
  assert.equal(readFileSync(target, 'utf8'), 'hello');
  assert.ok(!existsSync(target + '.part'));
  assert.ok(!readdirSync(join(dest, 'R')).some((n) => n.endsWith('.part')));
  // the pre-signed address never receives the token
  const dl = calls.filter((c) => c.url.startsWith('https://dl.example.test'));
  assert.equal(dl.length, 2);
  for (const c of dl) assert.equal(c.init.headers.Authorization, undefined);
  const before = calls.length;
  const r2 = await downloadPlan(plan, dest, { fetch: f, token: TOKEN });
  assert.equal(r2.alreadyHad, 2); assert.equal(r2.downloaded, 0);
  assert.equal(calls.length, before);
  // same size, different content: downloaded again
  writeFileSync(target, 'HELLO');
  assert.equal((await downloadPlan(plan, dest, { fetch: f, token: TOKEN })).downloaded, 1);
});

test('429 with Retry-After then success; the 5-retry stop is a clear error', async () => {
  const folders = { 1: { name: 'R', items: [] } };
  const sleeps = [];
  const sleep = async (ms) => { sleeps.push(ms); };
  const ok = stubBox({ folders, status: (n) => (n <= 2 ? { ok: false, status: 429, headers: new Headers({ 'retry-after': '3' }), text: async () => '' } : null) });
  const t = await listTree(TOKEN, '1', { fetch: ok.f, sleep });
  assert.equal(t.files.length, 0);
  assert.deepEqual(sleeps, [3000, 3000]);
  const never = stubBox({ folders, status: () => ({ ok: false, status: 429, headers: new Headers({ 'retry-after': '0' }), text: async () => '' }) });
  await assert.rejects(listTree(TOKEN, '1', { fetch: never.f, sleep: noSleep }), /too many requests.*5 retries/);
  assert.equal(never.calls.length, 6);
});

test('401 and 403 say the token was refused or expired, without the token', async () => {
  for (const s of [401, 403]) {
    const { f } = stubBox({ status: { ok: false, status: s, headers: new Headers(), text: async () => `bad ${TOKEN}` } });
    await assert.rejects(searchFolders(TOKEN, ['x'], { fetch: f }), (e) => /refused or expired/.test(e.message) && /short-lived/.test(e.message) && !e.message.includes(TOKEN));
  }
});

test('network errors are reported without the token', async () => {
  const f = async () => { throw new Error(`socket hang up Bearer ${TOKEN}`); };
  await assert.rejects(searchFolders(TOKEN, ['x'], { fetch: f }), (e) => /timeout/.test(e.message) && !e.message.includes(TOKEN));
});

// ---- command line ----
const cli = async (argv, o = {}) => {
  const outL = [], errL = [];
  const home = o.home ?? tmp('boxhome-');
  const code = await run({ argv, env: o.env ?? { BOX_ACCESS_TOKEN: TOKEN }, fetch: o.fetch, stdin: o.stdin, home, out: (s) => outL.push(s), err: (s) => errL.push(s) });
  return { code, out: outL.join('\n'), err: errL.join('\n'), home };
};
const world = () => stubBox({ folders: { 1: { name: 'Deal', items: [file('10', 'a.pdf', 'hello'), file('11', 'pic.jpg', 'zz')] } }, files: { 10: 'hello' } });

test('cli plan prints counts only and downloads nothing', async () => {
  const w = world(), dest = tmp();
  const r = await cli(['plan', '1', '--to', dest], { fetch: w.f });
  assert.equal(r.code, 0);
  assert.match(r.out, /1 file\(s\) to download/);
  assert.match(r.out, /\.pdf: 1 file/);
  assert.match(r.out, /\.jpg 1/);
  assert.ok(!r.out.includes('a.pdf'));
  assert.ok(!w.calls.some((c) => c.url.includes('/content')));
  assert.deepEqual(readdirSync(dest), []);
});

test('cli download without --yes downloads nothing; with --yes it does', async () => {
  const w = world(), dest = tmp();
  const r = await cli(['download', '1', '--to', dest], { fetch: w.f });
  assert.equal(r.code, 0);
  assert.match(r.out, /Nothing downloaded/);
  assert.ok(!w.calls.some((c) => c.url.includes('/content')));
  const r2 = await cli(['download', '1', '--to', dest, '--yes'], { fetch: w.f });
  assert.equal(r2.code, 0);
  assert.equal(readFileSync(join(dest, 'Deal', 'a.pdf'), 'utf8'), 'hello');
  for (const s of [r.out, r.err, r2.out, r2.err]) assert.ok(!s.includes(TOKEN));
});

test('cli refuses a destination inside a git repo or the project folder', async () => {
  const w = world();
  const repo = tmp('boxrepo-'); mkdirSync(join(repo, '.git'));
  const a = await cli(['download', '1', '--to', join(repo, 'deep', 'x'), '--yes'], { fetch: w.f });
  assert.equal(a.code, 2); assert.match(a.err, /git repository/);
  const b = await cli(['download', '1', '--to', join(process.cwd(), 'boxout-test'), '--yes'], { fetch: w.f });
  assert.equal(b.code, 2); assert.match(b.err, /project folder/);
  assert.equal(w.calls.length, 0);
  assert.ok(!existsSync(join(process.cwd(), 'boxout-test')));
});

test('cli: a refused token prints the message and never the token', async () => {
  const { f } = stubBox({ status: { ok: false, status: 401, headers: new Headers(), text: async () => '' } });
  const r = await cli(['search'], { fetch: f });
  assert.equal(r.code, 1);
  assert.match(r.err, /refused or expired/);
  assert.ok(!(r.out + r.err).includes(TOKEN));
});

test('cli save-token reads stdin and writes the keys file with mode 0600; token then comes from the file', async () => {
  const home = tmp('boxhome-');
  const r = await cli(['save-token'], { env: {}, home, stdin: Readable.from([`${TOKEN}\n`]) });
  assert.equal(r.code, 0);
  const file_ = join(home, '.zlatura-hub', 'keys.json');
  assert.equal(JSON.parse(readFileSync(file_, 'utf8')).BOX_ACCESS_TOKEN, TOKEN);
  assert.equal(statSync(file_).mode & 0o777, 0o600);
  assert.ok(!(r.out + r.err).includes(TOKEN));
  const w = world();
  const p = await cli(['plan', '1'], { env: {}, home, fetch: w.f });
  assert.equal(p.code, 0);
  assert.equal(w.calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  const none = await cli(['plan', '1'], { env: {}, fetch: w.f });
  assert.equal(none.code, 2);
});

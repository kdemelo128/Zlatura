import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkers, route, parseCard, checkScope, checkChangedFiles, findSecret, buildPacket, diffFiles } from '../tools/harness/lib.mjs';

const cfg = loadWorkers();
const card = (scope) => parseCard(`---\nid: t1\nkind: docs\ngoal: fix a typo\nscope: ${scope}\n---\nbody`);

test('every worker in the table loads and every route points at a real worker', () => {
  assert.equal(cfg.workers.length, 7);
  assert.ok(cfg.workers.every((w) => w.mode !== 'cli' || w.command.length));
});
test('money, parsing and security go to Opus and get a second-model review', () => {
  for (const k of ['money', 'parsing', 'security', 'data-format']) {
    const r = route(cfg, k);
    assert.equal(r.worker, 'claude-opus');
    assert.ok(r.reviewer && r.reviewer !== r.worker);
  }
  assert.equal(route(cfg, 'docs').reviewer, null);
  assert.throws(() => route(cfg, 'nonsense'));
});
test('a card cannot put private/ or protected files in scope', () => {
  for (const s of ['private/leases', 'private', '.github/workflows/test.yml', 'sw.js', '../x', '.env', 'tools/harness/workers.json']) {
    assert.throws(() => checkScope(cfg, [s]), /protected/, s);
  }
  assert.doesNotThrow(() => checkScope(cfg, ['docs/glossary.md']));
});
test('a worker diff touching protected files is refused unless the card named them', () => {
  assert.throws(() => checkChangedFiles(cfg, ['sw.js'], ['docs/a.md']));
  assert.throws(() => checkChangedFiles(cfg, ['.github/workflows/test.yml'], []));
  assert.doesNotThrow(() => checkChangedFiles(cfg, ['docs/a.md'], ['docs/a.md']));
});
test('keys and the owner address are caught in cards and output', () => {
  assert.ok(findSecret('token sk-abcdefghijklmnopqrstuvwx'));
  assert.ok(findSecret('see someone@gmail.com'));
  assert.ok(findSecret('-----BEGIN PRIVATE KEY-----'));
  assert.equal(findSecret('plain docs text'), null);
  const bad = parseCard('---\nid: t\nkind: docs\ngoal: g\nscope: docs/a.md\n---\nuse key sk-abcdefghijklmnopqrstuvwx');
  assert.throws(() => buildPacket(cfg, bad, 'rules'), /key or personal/);
});
test('the packet carries the rules and the scope, and diffFiles reads a diff', () => {
  const p = buildPacket(cfg, card('docs/a.md'), 'RULES-HERE');
  assert.match(p, /RULES-HERE/); assert.match(p, /Only touch: docs\/a.md/);
  assert.deepEqual(diffFiles('--- a/x\n+++ b/docs/a.md\n@@'), ['docs/a.md']);
});
test('a card without required fields is refused', () => {
  assert.throws(() => parseCard('no front matter'));
  assert.throws(() => parseCard('---\nid: x\n---\nb'), /missing/);
});

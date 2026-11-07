import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkers, route, parseCard, checkScope, checkChangedFiles, checkDesign, findSecret, buildPacket, diffFiles } from '../tools/harness/lib.mjs';
import { CONNECTORS, connectorFor } from '../tools/harness/connectors/index.mjs';
import { extractDiff, haveCommand } from '../tools/harness/connectors/base.mjs';

const cfg = loadWorkers();
const card = (scope, extra = '') => parseCard(`---\nid: t1\nkind: docs\ngoal: fix a typo\nscope: ${scope}\n${extra}---\nbody`);

test('all seven workers load, each has a connector, and every role and kind points at something real', () => {
  assert.equal(cfg.workers.length, 7);
  for (const w of cfg.workers) assert.ok(connectorFor(w), w.id);
  assert.deepEqual(Object.keys(CONNECTORS).sort(), ['claude', 'gemini', 'grok', 'kimi', 'muse', 'openai']);
});
test('every one of the six AI products plays at least one role', () => {
  const used = new Set(Object.values(cfg.roles).flatMap((r) => [r.primary, ...(r.fallbacks ?? []), r.reviewer].filter(Boolean)));
  for (const w of cfg.workers) assert.ok(used.has(w.id), `${w.id} has no role`);
});
test('the roles the owner named exist: designer, researcher, bug-fixer, developer', () => {
  for (const r of ['designer', 'researcher', 'bug-fixer', 'developer', 'reviewer', 'tester', 'writer', 'security-reviewer']) assert.ok(cfg.roles[r], r);
});
test('money, parsing, security and bugs get a worker and a different reviewer', () => {
  for (const k of ['money', 'parsing', 'security', 'data-format', 'bug']) {
    const r = route(cfg, k);
    assert.ok(r.reviewer && r.reviewer !== r.worker, k);
  }
  assert.equal(route(cfg, 'money').worker, 'claude-opus');
  assert.equal(route(cfg, 'research').worker, 'gemini');
  assert.throws(() => route(cfg, 'nonsense'));
});
test('a worker that is out of messages or not installed falls through to the next in its role', () => {
  assert.equal(route(cfg, 'research', new Set(['claude-sonnet', 'kimi'])).worker, 'kimi');
  assert.equal(route(cfg, 'research', new Set(['claude-sonnet'])).worker, 'claude-sonnet');
  assert.throws(() => route(cfg, 'research', new Set(['muse'])), /no available worker/);
});
test('a card cannot put private/ or protected files in scope, in any project', () => {
  for (const s of ['private/leases', 'private', '.github/workflows/test.yml', 'sw.js', '../x', '.env', 'tools/harness/workers.json', 'tools/harness/connectors/index.mjs']) {
    assert.throws(() => checkScope(cfg, [s]), /protected/, s);
    assert.throws(() => checkScope(cfg, [s], 'zlatura'), /protected/, s);
  }
  assert.doesNotThrow(() => checkScope(cfg, ['docs/glossary.md']));
});
test('Zlatura engine and deal code need an approved-design line on the card', () => {
  assert.throws(() => checkDesign(cfg, card('app/engine/noi.js', 'project: zlatura\n')), /approved-design/);
  assert.throws(() => checkDesign(cfg, card('app/deal.js', 'project: zlatura\n')), /approved-design/);
  assert.doesNotThrow(() => checkDesign(cfg, card('app/engine/noi.js', 'project: zlatura\napproved-design: docs/proposals/x.md\n')));
  assert.doesNotThrow(() => checkDesign(cfg, card('app/engine/noi.js'))); // another project has its own rules
  assert.throws(() => buildPacket(cfg, card('app/deal.js', 'project: zlatura\n'), 'r'), /approved-design/);
});
test('a worker diff touching protected files is refused unless the card named them', () => {
  assert.throws(() => checkChangedFiles(cfg, ['sw.js'], ['docs/a.md']));
  assert.throws(() => checkChangedFiles(cfg, ['.github/workflows/test.yml'], []));
  assert.throws(() => checkChangedFiles(cfg, ['tools/harness/connectors/base.mjs'], ['docs/a.md']));
  assert.doesNotThrow(() => checkChangedFiles(cfg, ['docs/a.md'], ['docs/a.md']));
});
test('keys and the owner address are caught in cards and output', () => {
  assert.ok(findSecret('token sk-abcdefghijklmnopqrstuvwx'));
  assert.ok(findSecret('see someone@gmail.com'));
  assert.ok(findSecret('-'.repeat(5) + 'BEGIN PRIVATE ' + 'KEY' + '-'.repeat(5)));
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
test('extractDiff pulls a patch out of chat text, fences and trailing prose', () => {
  const patch = '--- a/docs/a.md\n+++ b/docs/a.md\n@@ -1,1 +1,1 @@\n-old\n+new\n';
  const chat = `Sure! Here you go:\n\n\`\`\`diff\n${patch}\`\`\`\n\nLet me know if you want changes.`;
  assert.equal(extractDiff(chat), patch);
  assert.equal(extractDiff(patch + '\nThanks for asking.'), patch);
  assert.equal(extractDiff('no patch here'), '');
  assert.equal(extractDiff(null), '');
});
test('connector modes: Claude is an agent, Codex is a CLI, Gemini, Grok, Kimi and Muse are paste-in', () => {
  assert.equal(CONNECTORS.claude.mode, 'agent');
  assert.equal(CONNECTORS.openai.mode, 'cli');
  assert.equal(CONNECTORS.openai.verified, true);
  for (const id of ['gemini', 'grok', 'kimi', 'muse']) { assert.equal(CONNECTORS[id].mode, 'relay'); assert.match(CONNECTORS[id].relayInstructions(), /unified diff/); assert.equal(CONNECTORS[id].invocation(), null); }
  assert.deepEqual(CONNECTORS.openai.invocation().command.slice(0, 2), ['codex', 'exec']);
});
test('doctor checks go through an injected runner: nothing is spawned in tests, and a missing tool reports clearly', () => {
  const missing = () => ({ error: new Error('ENOENT'), status: null });
  const present = () => ({ status: 0 });
  assert.equal(haveCommand('codex', missing), false);
  assert.equal(haveCommand('codex', present), true);
  assert.equal(CONNECTORS.openai.check(missing).ok, false);
  assert.match(CONNECTORS.openai.check(missing).how, /not installed or not logged in/);
  assert.equal(CONNECTORS.openai.check(present).ok, true);
  assert.equal(CONNECTORS.gemini.check(missing).ok, true); // paste-in needs no install
  assert.equal(CONNECTORS.grok.check(missing).ok, true); // paste-in needs no install
});
test('no connector file holds a key, a token or a network call', async () => {
  const fs = await import('node:fs');
  for (const f of ['base.mjs', 'index.mjs']) {
    const s = fs.readFileSync(new URL(`../tools/harness/connectors/${f}`, import.meta.url), 'utf8');
    assert.equal(/\bfetch\s*\(|XMLHttpRequest|WebSocket|process\.env/.test(s), false, f);
  }
});

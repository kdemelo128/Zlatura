import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { loadWorkers, route, parseCard, checkScope, checkChangedFiles, checkDesign, findSecret, buildPacket, diffFiles, validateDiff } from '../tools/harness/lib.mjs';
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
  assert.deepEqual(diffFiles('--- a/x\n+++ b/docs/a.md\n@@'), ['x', 'docs/a.md']);
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

const HUNK = '@@ -1,2 +1,2 @@\n a\n-b\n+EVIL\n';
const DIFFS = {
  deletion: '--- a/app/engine/m.js\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-a\n-b\n',
  mismatchedNames: `--- a/app/engine/m.js\n+++ b/docs/s.md\n${HUNK}`,
  mismatchedGit: `diff --git a/app/engine/m.js b/app/engine/m.js\n--- a/app/engine/m.js\n+++ b/docs/s.md\n${HUNK}`,
  renameHeader: 'diff --git a/app/engine/m.js b/docs/n.md\nsimilarity index 100%\nrename from app/engine/m.js\nrename to docs/n.md\n',
  gitDeletion: 'diff --git a/app/engine/m.js b/app/engine/m.js\n--- a/app/engine/m.js\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-a\n-b\n',
  quoted: `diff --git "a/app/engine/m.js" "b/app/engine/m.js"\n--- "a/app/engine/m.js"\n+++ "b/app/engine/m.js"\n${HUNK}`,
  trailingTab: `--- a/app/engine/m.js\n+++ b/app/engine/m.js\t\n${HUNK}`,
  modeChange: 'diff --git a/docs/s.md b/docs/s.md\nold mode 100644\nnew mode 100755\n',
  binary: 'diff --git a/docs/s.md b/docs/s.md\nindex 1111111..2222222 100644\nGIT binary patch\nliteral 0\nHcmV?d00001\n',
  dotdot: `--- a/docs/s.md\n+++ b/../x\n${HUNK}`,
  absolute: `--- a//etc/x\n+++ b//etc/x\n${HUNK}`,
};
const cfgScope = ['docs/s.md', 'docs/new.md'];
test('validateDiff refuses every deletion, rename, quoted, mode, binary and unsafe-path diff', () => {
  for (const [name, d] of Object.entries(DIFFS)) {
    const v = validateDiff(d, cfgScope, cfg);
    assert.ok(v.problems.length > 0, `${name} should be refused`);
  }
});
test('validateDiff accepts a plain in-scope edit and an in-scope creation', () => {
  const edit = validateDiff(`diff --git a/docs/s.md b/docs/s.md\nindex 1111111..2222222 100644\n--- a/docs/s.md\n+++ b/docs/s.md\n${HUNK}`, cfgScope, cfg);
  assert.deepEqual(edit, { files: ['docs/s.md'], problems: [] });
  const make = validateDiff('--- /dev/null\n+++ b/docs/new.md\n@@ -0,0 +1,2 @@\n+x\n+--- not a header\n', cfgScope, cfg);
  assert.deepEqual(make, { files: ['docs/new.md'], problems: [] });
  const made = validateDiff('diff --git a/docs/new.md b/docs/new.md\nnew file mode 100644\nindex 0000000..1111111\n--- /dev/null\n+++ b/docs/new.md\n@@ -0,0 +1 @@\n+x\n', cfgScope, cfg);
  assert.deepEqual(made.problems, []);
});
test('validateDiff refuses out-of-scope files, protected files and a diff with no file header', () => {
  assert.ok(validateDiff(`--- a/docs/other.md\n+++ b/docs/other.md\n${HUNK}`, cfgScope, cfg).problems.some((p) => /scope/.test(p)));
  assert.ok(validateDiff(`--- a/sw.js\n+++ b/sw.js\n${HUNK}`, [], cfg).problems.length > 0);
  assert.ok(validateDiff(`--- a/.github/x.yml\n+++ b/.github/x.yml\n${HUNK}`, [], cfg).problems.length > 0);
  assert.equal(validateDiff(`--- a/sw.js\n+++ b/sw.js\n${HUNK}`, ['sw.js'], cfg).problems.length, 0, 'a card that names the file may touch it');
  assert.ok(validateDiff('hello\n', cfgScope, cfg).problems.length > 0);
});
test('diffFiles also lists old-side paths', () => {
  assert.deepEqual(diffFiles('--- a/x/y.js\n+++ b/docs/a.md\n'), ['x/y.js', 'docs/a.md']);
});
test('real git: whenever git would touch a path outside scope, validateDiff refuses', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hv-'));
  try {
    const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
    git('init', '-q');
    mkdirSync(join(dir, 'app/engine'), { recursive: true }); mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'app/engine/m.js'), 'a\nb\n'); writeFileSync(join(dir, 'docs/s.md'), 'a\nb\n');
    git('add', '.'); git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'x');
    let dangerous = 0;
    for (const [name, d] of Object.entries(DIFFS)) {
      writeFileSync(join(dir, 'p.diff'), d);
      const chk = git('apply', '--numstat', '--summary', 'p.diff');
      if (chk.status !== 0) continue; // git itself refuses it
      const v = validateDiff(d, cfgScope, cfg);
      const touched = git('apply', '--check', 'p.diff').status === 0 ? `${chk.stdout}\n${d}` : '';
      if (/app\/engine/.test(touched) || /rename|delete/.test(chk.stdout)) { dangerous++; assert.ok(v.problems.length > 0, `${name}: git touches outside scope but validateDiff passed`); }
    }
    assert.ok(dangerous >= 4, `expected several dangerous diffs git accepts, got ${dangerous}`);
    assert.ok(existsSync(join(dir, 'app/engine/m.js')) && readFileSync(join(dir, 'docs/s.md'), 'utf8') === 'a\nb\n');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

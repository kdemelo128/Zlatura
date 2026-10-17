// F5: CI supply-chain rules. Every action is pinned to a full commit SHA, and the dependency audit
// runs for both lock files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../.github/workflows/', import.meta.url);
const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));

test('every workflow action is pinned to a 40-character commit SHA', () => {
  assert.ok(files.length > 0);
  for (const f of files) {
    const uses = [...readFileSync(new URL(f, dir), 'utf8').matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
    for (const u of uses) {
      if (u.startsWith('./')) continue;
      assert.match(u, /@[0-9a-f]{40}$/, `${f}: ${u} is not pinned to a commit SHA`);
    }
  }
});

test('CI audits the app and the AI server lock files', () => {
  const y = readFileSync(new URL('test.yml', dir), 'utf8');
  const audit = y.slice(y.indexOf('\n  audit:'));
  assert.ok(y.includes('\n  audit:'), 'no audit job');
  assert.match(audit, /run: npm audit --audit-level=low\s*\n(?!\s+working-directory)/);
  assert.match(audit, /run: npm audit --audit-level=low\s*\n\s+working-directory: server/);
});

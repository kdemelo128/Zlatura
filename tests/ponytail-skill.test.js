/* The ponytail skill (.claude/skills/ponytail/, THIRD_PARTY.md): the upstream text is pinned and unchanged, its
 * license is beside it, and only text is taken: no hook or script of ponytail's is registered in the project settings. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const dir = new URL('../.claude/skills/ponytail/', import.meta.url);
const sha = (b) => createHash('sha256').update(b).digest('hex');

test('the upstream skill text is unchanged at the pinned commit, with our section only after it', () => {
  const b = fs.readFileSync(new URL('SKILL.md', dir));
  assert.equal(sha(b.subarray(0, 3496)), '9badd22a32e19cb884e46dfa8d3aae82bb81dfa5484105b8b4f0262df823a509');
  const rest = b.subarray(3496).toString('utf8');
  assert.match(rest, /^\n## In this repository \(Zlatura addition, not upstream\)/);
  assert.match(rest, /CLAUDE\.md` and `docs\/working-rules\.md` win/);
});

test('its MIT license ships beside it, and THIRD_PARTY.md lists it with the commit and both checksums', () => {
  const lic = fs.readFileSync(new URL('LICENSE', dir));
  assert.equal(sha(lic), 'fb1bc6909ac3ef82d5c22106e32ef682b0cff66788fa915fb9b53b15c9d2f3ab');
  assert.match(lic.toString('utf8'), /^MIT License/);
  const tp = fs.readFileSync(new URL('../THIRD_PARTY.md', import.meta.url), 'utf8');
  for (const s of ['09c434ab73ca43761c5d8b0c5d341926c2fba710', '9badd22a32e19cb884e46dfa8d3aae82bb81dfa5484105b8b4f0262df823a509', 'fb1bc6909ac3ef82d5c22106e32ef682b0cff66788fa915fb9b53b15c9d2f3ab']) assert.ok(tp.includes(s), s);
});

test('text only: no ponytail hook, script or status line is registered or copied', () => {
  const settings = fs.readFileSync(new URL('../.claude/settings.json', import.meta.url), 'utf8');
  assert.ok(!/ponytail/i.test(settings), 'nothing of ponytail in .claude/settings.json');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['LICENSE', 'SKILL.md']);
});

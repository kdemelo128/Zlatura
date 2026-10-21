/* The git guardrail hook (.claude/hooks/git-guardrails.mjs): it refuses the git commands that destroy work or
 * skip a safeguard, and lets every ordinary command through, including a normal push of a branch. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { checkCommand, commandsOf } from '../.claude/hooks/git-guardrails.mjs';

const HOOK = new URL('../.claude/hooks/git-guardrails.mjs', import.meta.url).pathname;

const REFUSED = [
  'git push --force origin claude/x', 'git push -f', 'git push origin claude/x --force-with-lease', 'git push origin +claude/x',
  'git push -fu origin claude/x', 'git push origin :claude/old', 'git push origin --delete claude/old', 'git push origin main', 'git push origin HEAD:main',
  'git push origin HEAD:refs/heads/master', 'git -C /repo push --force', 'cd app && git push -f', 'GIT_TRACE=1 git push -f', 'sudo git reset --hard',
  'git reset --hard origin/main', 'git reset --hard', 'git clean -fd', 'git clean -fdx', 'git clean --force', 'git checkout .', 'git checkout -- .', 'git restore .',
  'git restore -- :/', 'git checkout --force main', 'git branch -D claude/x', 'git branch -d main', 'git stash clear', 'git stash drop', 'git reflog expire --all',
  'git commit --no-verify -m x', 'git commit -n -m x', 'git push --no-verify', 'echo hi; git push -f', 'git status && git reset --hard HEAD~3',
  'git add -A | git push -f',
];
const ALLOWED = [
  'git push -u origin claude/t12-pr1', 'git push origin claude/security-f1-f3', 'git push', 'git push -u origin HEAD', 'git status', 'git diff --stat',
  'git log --oneline -5', 'git checkout -b claude/x', 'git checkout claude/x', 'git checkout main', 'git checkout -B claude/x origin/main', 'git restore --staged .',
  'git restore app/t12.js', 'git reset --soft HEAD~1', 'git reset', 'git clean -n', 'git clean -nd', 'git branch', 'git branch -a', 'git branch -m new', 'git stash', 'git stash pop',
  'git fetch -q origin main', 'git merge origin/main', 'git commit -m "mentions git push --force in prose"', 'git add -A && git commit -q -m x', 'npm run sync-main',
  'git push origin main-feature-branch', 'git push origin claude/main-menu', 'echo "git reset --hard"', "grep -n 'git push -f' docs/working-rules.md",
  'git archive 726c66d | tar -x -C /tmp/old', 'ls -la', 'rm -rf /tmp/old726',
];

test('the guardrail refuses destructive and safeguard-skipping git commands', () => {
  for (const c of REFUSED) assert.ok(checkCommand(c), `should be refused: ${c}`);
});

test('and lets ordinary commands through, including a normal push of a branch', () => {
  for (const c of ALLOWED) assert.equal(checkCommand(c), null, `should pass: ${c}`);
});

test('a commit message in a heredoc that mentions a forced push is text, not a command', () => {
  const msg = 'git commit -q -m "$(cat <<\'EOF\'\nFix the restore\n\nNever git push --force and never git reset --hard.\nEOF\n)"';
  assert.equal(checkCommand(msg), null);
  assert.ok(checkCommand(`${msg}\ngit push -f`), 'but a real command after it is still seen');
});

test('commands are split on separators outside quotes only', () => {
  assert.deepEqual(commandsOf('git commit -m "a; git push -f" && git status'), [['git', 'commit', '-m', 'a; git push -f'], ['git', 'status']]);
});

test('as a hook: exit 2 with the reason for a refused call, exit 0 for the rest, and never a block on input it does not understand', () => {
  const run = (input) => spawnSync('node', [HOOK], { input, encoding: 'utf8' });
  const bad = run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push --force origin main' } }));
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /Refused by the repo's git guardrail: a forced push/);
  assert.match(bad.stderr, /Stop and ask the owner/);
  assert.equal(run(JSON.stringify({ tool_input: { command: 'git push -u origin claude/x' } })).status, 0);
  assert.equal(run('not json').status, 0);
  assert.equal(run('{}').status, 0);
});

test('it is registered as a PreToolUse hook on Bash in the project settings', () => {
  const s = JSON.parse(fs.readFileSync(new URL('../.claude/settings.json', import.meta.url), 'utf8'));
  const h = s.hooks.PreToolUse.find((x) => x.matcher === 'Bash');
  assert.ok(h && h.hooks.some((x) => x.type === 'command' && /git-guardrails\.mjs/.test(x.command)));
});

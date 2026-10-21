#!/usr/bin/env node
/* git-guardrails.mjs -- a Claude Code PreToolUse hook for Bash. It refuses the git commands that destroy work
 * or skip a safeguard, and lets everything else through, including a normal `git push -u origin <branch>`.
 * The rules are CLAUDE.md's "Never merge, force-push, reset important branches, delete user data" made
 * mechanical. Refused: a forced push (--force, -f, --force-with-lease, +ref), a push that deletes a branch or
 * targets main/master, reset --hard, clean -f, checkout/restore of the whole tree, branch -D, stash clear/drop,
 * and --no-verify. Own-written, no dependencies (docs/proposals/dev-tools-and-reuse.md, section 10).
 *
 * Reads the tool call as JSON on stdin; exit 2 with the reason on stderr refuses the call.
 * Quoted text and heredoc bodies are not commands, so a commit message that mentions "git push --force" passes. */

/** Split a shell line into commands (on ; & | and newlines outside quotes), each a list of words; heredoc bodies are dropped. */
export function commandsOf(line) {
  const cmds = []; let words = []; let cur = ''; let has = false; let q = null;
  const endWord = () => { if (has) words.push(cur); cur = ''; has = false; };
  const endCmd = () => { endWord(); if (words.length) cmds.push(words); words = []; };
  const heredocs = [];
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === q) q = null; else if (ch === '\\' && q === '"' && i + 1 < line.length) { cur += line[++i]; } else cur += ch; continue; }
    if (ch === '\'' || ch === '"') { q = ch; has = true; continue; }
    if (ch === '\\' && i + 1 < line.length) { cur += line[++i]; has = true; continue; }
    if (ch === '<' && line[i + 1] === '<' && line[i + 2] !== '<') {
      const m = /^<<-?\s*(['"]?)([A-Za-z_][\w]*)\1/.exec(line.slice(i));
      if (m) { heredocs.push(m[2]); i += m[0].length - 1; continue; }
    }
    if (ch === '\n') {
      endCmd();
      if (heredocs.length) { // skip the body up to the delimiter line
        const d = heredocs.shift();
        let j = i + 1;
        while (j < line.length) { const e = line.indexOf('\n', j); const l = line.slice(j, e < 0 ? line.length : e); if (l.trim() === d) { i = e < 0 ? line.length : e - 1; break; } j = e < 0 ? line.length : e + 1; }
        if (j >= line.length) i = line.length;
      }
      continue;
    }
    if (ch === ';' || ch === '&' || ch === '|' || ch === '(' || ch === ')') { endCmd(); continue; }
    if (ch === ' ' || ch === '\t') { endWord(); continue; }
    cur += ch; has = true;
  }
  endCmd();
  return cmds;
}

const PROTECTED = /^(main|master)$/;
const refName = (r) => r.replace(/^\+/, '').split(':').pop().replace(/^refs\/heads\//, '');

/** Why a git command (a list of words) is refused, or null. */
function refuse(words) {
  // skip leading VAR=value words, then a wrapper such as sudo, env or command
  let i = 0;
  while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || ['sudo', 'env', 'command', 'time', 'nice'].includes(words[i]))) i++;
  if (words[i] !== 'git') return null;
  i++;
  // git's own options before the subcommand: -C <dir>, -c <k=v>, --git-dir=..., --no-pager ...
  while (i < words.length && words[i].startsWith('-')) i += ['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(words[i]) ? 2 : 1;
  const sub = words[i]; const a = words.slice(i + 1);
  const has = (...f) => a.some((w) => f.includes(w));
  if (a.includes('--no-verify') || (sub === 'commit' && a.includes('-n'))) return 'skipping the hooks and checks (--no-verify)';
  if (sub === 'push') {
    if (has('--force', '-f', '--force-with-lease', '--force-if-includes') || a.some((w) => /^--force-with-lease=/.test(w) || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(w))) return 'a forced push';
    if (has('--delete', '-d', '--mirror', '--prune')) return 'a push that deletes remote branches';
    const refs = a.filter((w) => !w.startsWith('-')).slice(1); // the first word is the remote
    if (refs.some((r) => r.startsWith('+'))) return 'a forced push (+ref)';
    if (refs.some((r) => r.startsWith(':'))) return 'a push that deletes a remote branch';
    if (refs.some((r) => PROTECTED.test(refName(r)))) return 'a push to main (the owner merges)';
    return null;
  }
  if (sub === 'reset' && has('--hard', '--merge', '--keep')) return 'git reset --hard (discards work)';
  if (sub === 'clean' && a.some((w) => /^-[a-zA-Z]*[fx][a-zA-Z]*$/.test(w) || w === '--force')) return 'git clean (deletes untracked files)';
  if ((sub === 'checkout' || sub === 'restore') && !has('--staged', '-S') && a.some((w) => w === '.' || w === ':/' || w === '*')) return `git ${sub} of the whole tree (discards edits)`;
  if (sub === 'checkout' && has('-f', '--force')) return 'git checkout --force (discards edits)';
  if (sub === 'branch' && a.some((w) => w === '-D' || w === '--force' || (/^-[a-zA-Z]*D[a-zA-Z]*$/.test(w)))) return 'git branch -D (deletes unmerged work)';
  if (sub === 'branch' && has('-d', '--delete') && a.some((w) => PROTECTED.test(w))) return 'deleting main';
  if (sub === 'stash' && (a[0] === 'clear' || a[0] === 'drop')) return 'git stash clear or drop (discards saved work)';
  if (sub === 'reflog' && (a[0] === 'expire' || a[0] === 'delete')) return 'git reflog expire or delete';
  if (sub === 'gc' && a.some((w) => w.startsWith('--prune'))) return 'git gc --prune';
  return null;
}

/** null when the shell line may run, else the reason it is refused. */
export function checkCommand(line) {
  for (const words of commandsOf(String(line || ''))) {
    const why = refuse(words);
    if (why) return why;
  }
  return null;
}

export function message(why) {
  return `Refused by the repo's git guardrail: ${why}. CLAUDE.md says never to do this without the owner's explicit authorization. Stop and ask the owner; if they authorize it, they can run the command themselves.`;
}

if ((process.argv[1] || '').endsWith('git-guardrails.mjs')) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { raw += d; });
  process.stdin.on('end', () => {
    let cmd = '';
    try { const j = JSON.parse(raw); cmd = (j.tool_input && j.tool_input.command) || ''; } catch { process.exit(0); } // not a tool call we understand: never block
    const why = checkCommand(cmd);
    if (why) { process.stderr.write(`${message(why)}\n`); process.exit(2); }
    process.exit(0);
  });
}

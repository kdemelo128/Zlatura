#!/usr/bin/env node
// Usage:
//   node tools/harness/run-task.mjs plan   <card>                 show the route (worker + reviewer)
//   node tools/harness/run-task.mjs packet <card> <worker>        write the paste-in packet (relay workers)
//   node tools/harness/run-task.mjs run    <card> <worker>        run a logged-in CLI worker in its own worktree
//   node tools/harness/run-task.mjs ingest <card> <worker> <diff> check a returned diff and put it on agent/<worker>/<id>
// Never pushes, never merges. Claude reviews the branch and runs the gates; the owner merges.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadWorkers, route, parseCard, buildPacket, diffFiles, checkChangedFiles, findSecret } from './lib.mjs';

const [, , cmd, cardPath, workerId, diffPath] = process.argv;
const cfg = loadWorkers();
const card = parseCard(readFileSync(cardPath, 'utf8'));
const sh = (args, o = {}) => spawnSync(args[0], args.slice(1), { encoding: 'utf8', ...o });
const worker = () => cfg.workers.find((w) => w.id === workerId) || (() => { throw new Error('unknown worker'); })();

if (cmd === 'plan') {
  console.log(JSON.stringify(route(cfg, card.meta.kind), null, 2));
} else if (cmd === 'packet') {
  const w = worker();
  const out = `harness-out/${card.meta.id}.${w.id}.packet.md`;
  mkdirSync('harness-out', { recursive: true });
  writeFileSync(out, buildPacket(cfg, card, readFileSync('AGENTS.md', 'utf8')));
  console.log(`Wrote ${out}. Paste it into ${w.label}, save its reply as a .diff file, then run: ingest.`);
} else if (cmd === 'run' || cmd === 'ingest') {
  const w = worker();
  const branch = `agent/${w.id}/${card.meta.id}`;
  const tree = `harness-out/wt-${w.id}-${card.meta.id}`;
  let diff;
  if (cmd === 'run') {
    if (w.mode !== 'cli') throw new Error(`${w.id} is "${w.mode}": use packet then ingest`);
    sh(['git', 'worktree', 'add', '-b', branch, tree, 'origin/main']); // built from git: private/ is not in it
    const r = sh(w.command, { input: buildPacket(cfg, card, readFileSync('AGENTS.md', 'utf8')), cwd: tree, timeout: 20 * 60 * 1000 });
    if (r.status !== 0) throw new Error(`worker exited ${r.status}: ${(r.stderr || '').slice(0, 200)}`);
    diff = r.stdout;
  } else {
    diff = readFileSync(diffPath, 'utf8');
    sh(['git', 'worktree', 'add', '-b', branch, tree, 'origin/main']);
  }
  const hit = findSecret(diff);
  if (hit) throw new Error(`worker output contains something that looks like a key or address (${hit}); not applied`);
  checkChangedFiles(cfg, diffFiles(diff), card.meta.scopeList);
  writeFileSync(`${tree}/.harness.diff`, diff);
  const a = sh(['git', 'apply', '--index', '.harness.diff'], { cwd: tree });
  if (a.status !== 0) throw new Error(`diff does not apply: ${a.stderr.slice(0, 200)}`);
  sh(['rm', '.harness.diff'], { cwd: tree });
  sh(['git', 'commit', '-m', `${card.meta.id}: ${w.id} draft (unreviewed)`], { cwd: tree });
  console.log(`Committed on ${branch}. Next: Claude reviews the diff and runs the gates. Nothing was pushed.`);
} else {
  console.error('commands: plan | packet | run | ingest'); process.exit(2);
}

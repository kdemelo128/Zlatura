#!/usr/bin/env node
// Multi-model harness, any project. Claude is the hub; the other models are workers by role.
//   doctor                                  which connectors work on this machine right now
//   roles                                   who plays which role (and who covers for whom)
//   plan   <card> [--available a,b]         role, worker and reviewer for a card
//   packet <card> [worker]                  write the paste-in packet (relay workers)
//   run    <card> [worker]                  run a logged-in CLI worker in its own worktree
//   ingest <card> <worker> <reply-file>     check a reply (diff inside chat text is fine) and put it on agent/<worker>/<id>
// Never pushes, never merges. Claude reviews the branch and runs the gates; the owner merges.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadWorkers, route, parseCard, buildPacket, diffFiles, checkChangedFiles, findSecret } from './lib.mjs';
import { CONNECTORS, connectorFor } from './connectors/index.mjs';

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const availableArg = flag('--available');
const [cmd, cardPath, workerArg, replyPath] = argv;
const cfg = loadWorkers();
const sh = (args, o = {}) => spawnSync(args[0], args.slice(1), { encoding: 'utf8', ...o });
const byId = (id) => cfg.workers.find((w) => w.id === id) || (() => { throw new Error(`unknown worker ${id}`); })();

if (cmd === 'doctor') {
  for (const w of cfg.workers) {
    const c = connectorFor(w); const r = c.check();
    console.log(`${r.ok ? 'ok ' : 'NO '} ${w.id.padEnd(14)} ${c.mode.padEnd(6)} ${r.how}${c.mode === 'cli' && !c.verified ? '   (command line not yet verified on this machine)' : ''}`);
  }
} else if (cmd === 'roles') {
  for (const [role, r] of Object.entries(cfg.roles)) console.log(`${role.padEnd(18)} ${r.primary}  <- ${(r.fallbacks ?? []).join(', ')}${r.reviewer ? `  | reviewed by ${r.reviewer}` : ''}\n    ${r.what}`);
} else if (['plan', 'packet', 'run', 'ingest'].includes(cmd)) {
  const card = parseCard(readFileSync(cardPath, 'utf8'));
  const project = card.meta.project || 'default';
  const available = availableArg ? new Set(availableArg.split(',')) : null;
  const plan = route(cfg, card.meta.kind, available);
  const w = byId(workerArg && cmd !== 'plan' ? workerArg : plan.worker);
  const rules = () => readFileSync('AGENTS.md', 'utf8');
  if (cmd === 'plan') {
    console.log(JSON.stringify(plan, null, 2));
  } else if (cmd === 'packet') {
    const out = `harness-out/${card.meta.id}.${w.id}.packet.md`;
    mkdirSync('harness-out', { recursive: true });
    writeFileSync(out, buildPacket(cfg, card, rules()));
    console.log(`Wrote ${out}. ${connectorFor(w).relayInstructions() || 'Run it with the run command.'}`);
  } else {
    const c = connectorFor(w);
    const branch = `agent/${w.id}/${card.meta.id}`;
    const tree = `harness-out/wt-${w.id}-${card.meta.id}`;
    let reply;
    if (cmd === 'run') {
      const inv = c.invocation();
      if (!inv) throw new Error(`${w.id} is "${c.mode}": use packet, then ingest`);
      sh(['git', 'worktree', 'add', '-b', branch, tree, 'origin/main']); // built from git: private/ is not in it
      const r = sh(inv.command, { input: buildPacket(cfg, card, rules()), cwd: tree, timeout: 20 * 60 * 1000 });
      if (r.status !== 0) throw new Error(`worker exited ${r.status}: ${(r.stderr || '').slice(0, 200)}`);
      reply = r.stdout;
    } else {
      reply = readFileSync(replyPath, 'utf8');
      sh(['git', 'worktree', 'add', '-b', branch, tree, 'origin/main']);
    }
    const diff = c.parseReply(reply);
    if (!diff) throw new Error('no unified diff found in the reply');
    const hit = findSecret(diff);
    if (hit) throw new Error(`worker output contains something that looks like a key or address (${hit}); not applied`);
    checkChangedFiles(cfg, diffFiles(diff), card.meta.scopeList, project);
    writeFileSync(`${tree}/.harness.diff`, diff);
    const a = sh(['git', 'apply', '--index', '.harness.diff'], { cwd: tree });
    if (a.status !== 0) throw new Error(`diff does not apply: ${a.stderr.slice(0, 200)}`);
    sh(['rm', '.harness.diff'], { cwd: tree });
    sh(['git', 'commit', '-m', `${card.meta.id}: ${w.id} draft (unreviewed)`], { cwd: tree });
    console.log(`Committed on ${branch}. Reviewer for this kind: ${plan.reviewer ?? 'Claude only'}. Nothing was pushed.`);
  }
} else {
  console.error('commands: doctor | roles | plan | packet | run | ingest'); process.exit(2);
}
void CONNECTORS;

#!/usr/bin/env node
// Ask the models from the command line, with the same screening, routing and providers as the hub page.
//   node tools/hub/ask.mjs [--to auto|all|<provider id>] [--role <role>] [--kind <kind>] [--cheap] [--json] "message words..."
// With no message words the message is read from stdin. Exit 0 = at least one reply, 1 = every model failed, 2 = refused or bad usage.
import { fileURLToPath } from 'node:url';
import { spawn as spawnProc } from 'node:child_process';
import { PROVIDERS, statuses } from './providers.mjs';
import { screenPrompt, pick, frame, safeText } from './hub-lib.mjs';
import { loadWorkers } from '../harness/lib.mjs';

function parseArgs(argv) {
  const o = { to: 'auto', role: '', kind: '', cheap: false, json: false, words: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cheap') o.cheap = true;
    else if (a === '--json') o.json = true;
    else if (a === '--to' || a === '--role' || a === '--kind') { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); o[a.slice(2)] = argv[++i]; }
    else o.words.push(a);
  }
  return o;
}

export async function run({ argv, stdin = '', env = process.env, spawn, fetch: fetchFn, out = console.log, err = console.error }) {
  let o;
  try { o = parseArgs(argv); } catch (e) { err(e.message); return 2; }
  const message = o.words.length ? o.words.join(' ') : stdin;
  const s = screenPrompt(message);
  if (!s.ok) { err(s.why); return 2; }
  const cfg = loadWorkers();
  const stats = await statuses({ env, spawn });
  const chosen = pick({ to: o.to, role: o.role, kind: o.kind, prefer: o.cheap ? 'cheap' : 'quality' }, stats, cfg);
  if (!chosen.ids.length) { err(`No ready model for that (${chosen.why}).`); return 1; }
  const prompt = frame(message.trim(), o.role, cfg);
  const replies = await Promise.all(chosen.ids.map(async (id) => {
    const p = PROVIDERS.find((x) => x.id === id); const t0 = Date.now();
    try { return { id, label: p.label, ok: true, text: await p.ask(prompt, { env, spawn, fetch: fetchFn }), ms: Date.now() - t0 }; }
    catch (e) { return { id, label: p.label, ok: false, text: safeText(String(e.message).replace(/(key|token)=\S+/gi, '$1=…')), ms: Date.now() - t0 }; }
  }));
  if (o.json) out(JSON.stringify({ why: chosen.why, replies }));
  else {
    out(`Sent to: ${chosen.why}`);
    for (const r of replies) out(`\n=== ${r.label} (${(r.ms / 1000).toFixed(1)} s)${r.ok ? '' : ' FAILED'} ===\n${r.text}`);
  }
  return replies.some((r) => r.ok) ? 0 : 1;
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const hasWords = process.argv.slice(2).some((a, i, all) => !a.startsWith('--') && !['--to', '--role', '--kind'].includes(all[i - 1]));
  let stdin = '';
  if (!hasWords && !process.stdin.isTTY) { for await (const c of process.stdin) stdin += c; }
  process.exitCode = await run({ argv: process.argv.slice(2), stdin, spawn: spawnProc });
}

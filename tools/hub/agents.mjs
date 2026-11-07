// Run a harness task card from the hub: build the packet, ask one ready model, check the diff
// with the same guards as `run-task.mjs`, and (on request) put it on a local branch. Nothing is pushed.
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { execFile as nodeExecFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCard, buildPacket, loadWorkers, validateDiff, findSecret } from '../harness/lib.mjs';
import { extractDiff } from '../harness/connectors/base.mjs';
import { pick, providerForWorker, screenPrompt } from './hub-lib.mjs';
import { PROVIDERS } from './providers.mjs';

const CARD_NAME = /^[A-Za-z0-9][\w.-]*\.md$/;
const cardPath = (root, file) => {
  if (!CARD_NAME.test(String(file))) throw new Error('bad card name');
  const p = join(root, 'docs', 'tasks', file);
  if (!existsSync(p)) throw new Error('no such card');
  return p;
};

export function listCards(root) {
  const dir = join(root, 'docs', 'tasks');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => CARD_NAME.test(f)).flatMap((file) => {
    try { const { meta } = parseCard(readFileSync(join(dir, file), 'utf8')); return [{ file, id: meta.id, kind: meta.kind, goal: meta.goal, scope: meta.scopeList, project: meta.project || 'default' }]; }
    catch { return []; }
  });
}

/** Ask one model to do a card; returns the draft diff and anything the guards object to. */
export async function runAgent({ root, file, to, stats, cfg, ask }) {
  const card = parseCard(readFileSync(cardPath(root, file), 'utf8'));
  const chosen = pick({ to: to || 'auto', kind: card.meta.kind }, stats, cfg);
  if (!chosen.ids.length) return { ok: false, why: chosen.why, problems: ['No ready model for this card. Check the left panel.'] };
  const provider = chosen.ids[0];
  const packet = buildPacket(cfg, card, readFileSync(join(root, 'AGENTS.md'), 'utf8')); // throws on a protected scope, a missing design line or a secret
  // AGENTS.md is the owner's own rules file and names private/ on purpose, so it gets the secret check only (buildPacket did that); the card text gets the full screen.
  const screened = screenPrompt(`${card.meta.goal}\n${card.meta.scope}\n${card.body}`);
  if (!screened.ok) return { ok: false, why: chosen.why, problems: [screened.why] };
  const reply = await ask(provider, packet);
  const diff = extractDiff(reply);
  const problems = [];
  let files = [];
  if (!diff) problems.push('The model did not return a diff.');
  else {
    const hit = findSecret(diff);
    if (hit) problems.push(`The draft contains something that looks like a key or an email address (${hit}).`);
    const v = validateDiff(diff, card.meta.scopeList, cfg, card.meta.project || 'default');
    files = v.files; problems.push(...v.problems);
  }
  return { ok: !problems.length, why: chosen.why, provider, diff, files, problems, reply: diff ? undefined : String(reply).slice(0, 2000) };
}

/** Put a checked diff on a local branch through the harness's own ingest (worktree + commit; no push). */
export function applyDiff({ root, file, provider, diff, cfg = loadWorkers(), exec = nodeExecFile }) {
  const path = cardPath(root, file);
  const card = parseCard(readFileSync(path, 'utf8'));
  if (!String(diff).trim()) return Promise.reject(new Error('empty diff'));
  const { problems } = validateDiff(String(diff), card.meta.scopeList, cfg, card.meta.project || 'default'); // the page could send any diff: re-check it strictly here
  if (problems.length) return Promise.reject(new Error(problems.join('; ')));
  const worker = PROVIDERS.find((p) => p.id === provider)?.workers[0];
  if (!worker) return Promise.reject(new Error('that model cannot own a branch'));
  const tmp = join(mkdtempSync(join(tmpdir(), 'hubdiff-')), 'reply.diff');
  writeFileSync(tmp, diff);
  return new Promise((resolve, reject) => exec(process.execPath, ['tools/harness/run-task.mjs', 'ingest', path, worker, tmp], { cwd: root, timeout: 120000 }, (err, out, errOut) => (err ? reject(new Error((errOut || err.message).trim().slice(0, 400))) : resolve(out.trim()))));
}
void providerForWorker;

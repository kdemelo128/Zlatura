// Run a harness task card from the hub: build the packet, ask one ready model, check the diff
// with the same guards as `run-task.mjs`, and (on request) put it on a local branch. Nothing is pushed.
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { execFile as nodeExecFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCard, buildPacket, diffFiles, checkChangedFiles, findSecret } from '../harness/lib.mjs';
import { extractDiff } from '../harness/connectors/base.mjs';
import { pick, providerForWorker } from './hub-lib.mjs';
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
  const reply = await ask(provider, packet);
  const diff = extractDiff(reply);
  const problems = [];
  let files = [];
  if (!diff) problems.push('The model did not return a diff.');
  else {
    const hit = findSecret(diff);
    if (hit) problems.push(`The draft contains something that looks like a key or an email address (${hit}).`);
    files = diffFiles(diff);
    try { checkChangedFiles(cfg, files, card.meta.scopeList, card.meta.project || 'default'); } catch (e) { problems.push(e.message); }
    const outside = files.filter((f) => !card.meta.scopeList.includes(f));
    if (outside.length) problems.push(`The draft changes files outside the card's scope: ${outside.join(', ')}`);
  }
  return { ok: !problems.length, why: chosen.why, provider, diff, files, problems, reply: diff ? undefined : String(reply).slice(0, 2000) };
}

/** Put a checked diff on a local branch through the harness's own ingest (worktree + commit; no push). */
export function applyDiff({ root, file, provider, diff, exec = nodeExecFile }) {
  const path = cardPath(root, file);
  const card = parseCard(readFileSync(path, 'utf8'));
  const outside = diffFiles(diff).filter((f) => !card.meta.scopeList.includes(f)); // the page could send any diff: re-check scope here
  if (!diff.trim() || outside.length) return Promise.reject(new Error(outside.length ? `outside the card's scope: ${outside.join(', ')}` : 'empty diff'));
  const worker = PROVIDERS.find((p) => p.id === provider)?.workers[0];
  if (!worker) return Promise.reject(new Error('that model cannot own a branch'));
  const tmp = join(mkdtempSync(join(tmpdir(), 'hubdiff-')), 'reply.diff');
  writeFileSync(tmp, diff);
  return new Promise((resolve, reject) => exec(process.execPath, ['tools/harness/run-task.mjs', 'ingest', path, worker, tmp], { cwd: root, timeout: 120000 }, (err, out, errOut) => (err ? reject(new Error((errOut || err.message).trim().slice(0, 400))) : resolve(out.trim()))));
}
void providerForWorker;

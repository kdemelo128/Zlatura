// Multi-model harness helpers (dev tooling only; never loaded by the app).
import { readFileSync } from 'node:fs';

export function loadWorkers(path = new URL('./workers.json', import.meta.url)) {
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  for (const w of cfg.workers) {
    if (!['agent', 'cli', 'relay'].includes(w.mode)) throw new Error(`worker ${w.id}: bad mode`);
    if (w.mode === 'cli' && !Array.isArray(w.command)) throw new Error(`worker ${w.id}: cli needs command`);
  }
  for (const [kind, id] of Object.entries(cfg.routing)) {
    if (!cfg.workers.some((w) => w.id === id)) throw new Error(`routing ${kind}: unknown worker ${id}`);
  }
  return cfg;
}

// Pick a worker for a task kind; kinds that need a second opinion also get a reviewer.
export function route(cfg, kind) {
  const worker = cfg.routing[kind];
  if (!worker) throw new Error(`no route for task kind "${kind}"`);
  const needsReview = cfg.secondModelReviewFor.includes(kind);
  const reviewer = needsReview ? (worker === 'claude-opus' ? 'grok' : 'claude-opus') : null;
  return { worker, reviewer };
}

// Parse a task card: front matter lines "key: value", then the body.
export function parseCard(text) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error('card needs a --- front matter block');
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const k of ['id', 'kind', 'goal', 'scope']) if (!meta[k]) throw new Error(`card missing ${k}`);
  meta.scopeList = meta.scope.split(',').map((s) => s.trim()).filter(Boolean);
  return { meta, body: m[2] };
}

const isProtected = (cfg, p) => cfg.protectedPaths.some((q) => p === q || p.startsWith(q.endsWith('/') ? q : q + '/') || p === q.replace(/\/$/, ''));

// A card may not put protected paths (including private/) in scope.
export function checkScope(cfg, scopeList) {
  const bad = scopeList.filter((p) => isProtected(cfg, p.replace(/^\.\//, '')) || p.includes('..'));
  if (bad.length) throw new Error(`scope names protected or unsafe path: ${bad.join(', ')}`);
}

// Paths a worker's diff touched: refuse protected ones unless the card named them.
export function checkChangedFiles(cfg, changed, scopeList) {
  const bad = changed.filter((p) => isProtected(cfg, p) && !scopeList.includes(p));
  if (bad.length) throw new Error(`worker changed protected files: ${bad.join(', ')}`);
}

const SECRET = [/sk-[A-Za-z0-9_-]{20,}/, /AIza[0-9A-Za-z_-]{30,}/, /gh[pousr]_[A-Za-z0-9]{30,}/, /xai-[A-Za-z0-9]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\b[A-Za-z0-9._%+-]+@gmail\.com\b/];
export function findSecret(text) {
  for (const re of SECRET) { const m = re.exec(text); if (m) return m[0].slice(0, 6) + '…'; }
  return null;
}

// The packet a worker receives: rules + card. Refuses if the card carries a secret.
export function buildPacket(cfg, card, agentsMd) {
  checkScope(cfg, card.meta.scopeList);
  const hit = findSecret(card.body + card.meta.goal);
  if (hit) throw new Error(`card contains something that looks like a key or personal address (${hit})`);
  return [
    '# Task for a Zlatura worker', '',
    'Follow these rules exactly. Reply with a unified diff (git apply format) and nothing else.', '',
    '## Rules (AGENTS.md)', agentsMd, '',
    `## Task ${card.meta.id} (${card.meta.kind})`, `Goal: ${card.meta.goal}`,
    `Only touch: ${card.meta.scopeList.join(', ')}`, '', card.body,
  ].join('\n');
}

// Files named in a unified diff.
export function diffFiles(diff) {
  return [...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]);
}

// Multi-model harness helpers (dev tooling only; never loaded by the app).
import { readFileSync } from 'node:fs';

export function loadWorkers(path = new URL('./workers.json', import.meta.url)) {
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  const ids = new Set(cfg.workers.map((w) => w.id));
  for (const [role, r] of Object.entries(cfg.roles)) {
    for (const id of [r.primary, ...(r.fallbacks ?? []), ...(r.reviewer ? [r.reviewer] : [])]) {
      if (!ids.has(id)) throw new Error(`role ${role}: unknown worker ${id}`);
    }
  }
  for (const [kind, role] of Object.entries(cfg.kinds)) {
    if (!cfg.roles[role]) throw new Error(`kind ${kind}: unknown role ${role}`);
  }
  return cfg;
}

// Pick a worker for a task kind. `available` (a Set of worker ids) lets a worker that is
// out of free messages, or not installed, fall through to the next one in the role.
export function route(cfg, kind, available = null) {
  const role = cfg.kinds[kind];
  if (!role) throw new Error(`no route for task kind "${kind}"`);
  const r = cfg.roles[role];
  const order = [r.primary, ...(r.fallbacks ?? [])];
  const worker = order.find((id) => !available || available.has(id));
  if (!worker) throw new Error(`no available worker for role "${role}"`);
  let reviewer = null;
  if (cfg.secondModelReviewKinds.includes(kind) || r.reviewer) {
    const want = r.reviewer ?? 'claude-opus';
    reviewer = want !== worker && (!available || available.has(want)) ? want : order.find((id) => id !== worker && (!available || available.has(id))) ?? null;
  }
  return { role, worker, reviewer, order };
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

const protectedList = (cfg, project = 'default') => [...cfg.protectedPaths, ...((cfg.projects[project] ?? cfg.projects.default).extraProtected ?? [])];
const isProtected = (cfg, p, project = 'default') => protectedList(cfg, project).some((q) => p === q || p.startsWith(q.endsWith('/') ? q : q + '/') || p === q.replace(/\/$/, ''));

// Paths that need an approved design before a worker may touch them (money and engine code).
export function checkDesign(cfg, card) {
  const project = card.meta.project || 'default';
  const need = (cfg.projects[project] ?? cfg.projects.default).requiresDesign ?? [];
  const hit = card.meta.scopeList.filter((p) => need.some((q) => p === q || p.startsWith(q.endsWith('/') ? q : q + '/')));
  if (hit.length && !card.meta['approved-design']) throw new Error(`scope touches ${hit.join(', ')}: add an "approved-design:" line naming the approved design`);
}

// A card may not put protected paths (including private/) in scope.
export function checkScope(cfg, scopeList, project = 'default') {
  const bad = scopeList.filter((p) => isProtected(cfg, p.replace(/^\.\//, ''), project) || p.includes('..'));
  if (bad.length) throw new Error(`scope names protected or unsafe path: ${bad.join(', ')}`);
}

// Paths a worker's diff touched: refuse protected ones unless the card named them.
export function checkChangedFiles(cfg, changed, scopeList, project = 'default') {
  const bad = changed.filter((p) => isProtected(cfg, p, project) && !scopeList.includes(p));
  if (bad.length) throw new Error(`worker changed protected files: ${bad.join(', ')}`);
}

const SECRET = [/sk-[A-Za-z0-9_-]{20,}/, /AIza[0-9A-Za-z_-]{30,}/, /gh[pousr]_[A-Za-z0-9]{30,}/, /xai-[A-Za-z0-9]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\b[A-Za-z0-9._%+-]+@gmail\.com\b/];
export function findSecret(text) {
  for (const re of SECRET) { const m = re.exec(text); if (m) return m[0].slice(0, 6) + '…'; }
  return null;
}

// The packet a worker receives: rules + card. Refuses if the card carries a secret.
export function buildPacket(cfg, card, agentsMd) {
  checkScope(cfg, card.meta.scopeList, card.meta.project || 'default');
  checkDesign(cfg, card);
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

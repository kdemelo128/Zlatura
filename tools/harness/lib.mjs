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

// Files named in a unified diff (old and new side). Kept for callers that only want a list;
// the safety check is validateDiff, which refuses what this merely lists.
export function diffFiles(diff) {
  const out = [];
  for (const m of diff.matchAll(/^(?:\+\+\+ b|--- a)\/(.+)$/gm)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

const inScope = (scopeList, p) => scopeList.some((q) => { const s = q.replace(/^\.\//, ''); return p === s || (s.endsWith('/') && p.startsWith(s)); });
const badPath = (p) => (/["\\\x00-\x1f]/.test(p) ? 'quoted, escaped or control characters' : p.startsWith('/') || /^[A-Za-z]:/.test(p) ? 'absolute path' : p.split('/').some((x) => x === '..' || x === '.' || x === '') ? 'unsafe path segment' : null);

// Strict check of a model-written diff before anything is applied. Only plain edits and
// creations of in-scope, unprotected files pass; deletions, renames, copies, mode changes,
// binary patches, quoted paths and anything it cannot read are problems. Returns { files, problems }.
export function validateDiff(diff, scopeList, cfg, project = 'default') {
  const problems = [];
  const files = [];
  const bad = (m) => { if (!problems.includes(m)) problems.push(m); };
  const lines = String(diff).replace(/\n$/, '').split('\n');
  let gitPath = null; let created = false; let oldSide = null; let hunk = null; // hunk = { o, n } lines left
  const addFile = (p) => {
    const why = badPath(p);
    if (why) return bad(`${why}: ${JSON.stringify(p)}`);
    if (!inScope(scopeList, p)) bad(`outside the card scope: ${p}`);
    else if (isProtected(cfg, p, project) && !scopeList.includes(p)) bad(`protected file: ${p}`);
    if (!files.includes(p)) files.push(p);
  };
  for (const line of lines) {
    if (hunk && (hunk.o > 0 || hunk.n > 0)) {
      const c = line[0];
      if (c === ' ' || line === '') { hunk.o--; hunk.n--; } else if (c === '-') hunk.o--; else if (c === '+') hunk.n--; else if (c !== '\\') bad(`bad hunk line: ${line.slice(0, 40)}`);
      continue;
    }
    if (line.startsWith('\\ ')) continue;
    let m;
    if ((m = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line))) {
      if (oldSide === null) bad('hunk without a file header');
      hunk = { o: m[1] === undefined ? 1 : +m[1], n: m[2] === undefined ? 1 : +m[2] };
    } else if (line.startsWith('diff --git ')) {
      const rest = line.slice(11);
      if (/["\\]/.test(rest) || !rest.startsWith('a/')) { bad(`bad diff header: ${line.slice(0, 60)}`); gitPath = null; } else {
        const r = rest.slice(2); const p = r.slice(0, (r.length - 3) / 2);
        if (r !== `${p} b/${p}`) { bad(`rename or odd names in header: ${line.slice(0, 60)}`); gitPath = null; } else gitPath = p;
      }
      created = false; oldSide = null; hunk = null;
    } else if (/^index [0-9a-f]+\.\.[0-9a-f]+( 100644)?$/.test(line)) { /* plain */ } else if (/^new file mode 100644$/.test(line)) created = true;
    else if (line.startsWith('--- ')) {
      oldSide = line.slice(4); hunk = null;
      if (oldSide !== '/dev/null' && !oldSide.startsWith('a/')) bad(`bad old-side header: ${line.slice(0, 60)}`);
    } else if (line.startsWith('+++ ')) {
      const t = line.slice(4);
      if (oldSide === null) { bad('+++ without ---'); continue; }
      if (t === '/dev/null') { bad('deletion (+++ /dev/null)'); oldSide = null; continue; }
      if (!t.startsWith('b/')) { bad(`bad new-side header: ${line.slice(0, 60)}`); oldSide = null; continue; }
      const p = t.slice(2);
      if (oldSide === '/dev/null') { if (gitPath !== null && !created) bad(`creation without "new file mode": ${p}`); } else if (oldSide !== `a/${p}`) bad(`rename or odd names: ${oldSide} -> ${t}`);
      if (gitPath !== null && gitPath !== p) bad(`header names differ: ${gitPath} vs ${p}`);
      addFile(p);
    } else if (line !== '') bad(`not allowed in a worker diff: ${line.slice(0, 60)}`);
  }
  if (!files.length) bad('no valid file header (--- a/<path> then +++ b/<path>)');
  return { files, problems };
}

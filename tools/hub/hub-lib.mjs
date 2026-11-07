// Pure hub logic: screening, routing, prompt framing. No network, no processes.
import { loadWorkers, route, findSecret } from '../harness/lib.mjs';
import { PROVIDERS } from './providers.mjs';

const PRIVATE_PATH = [/(^|[^A-Za-z0-9_])private[\/\\]/i, /[\/\\]private(?![A-Za-z0-9_])/i, /(^|[^A-Za-z0-9_])priv[*?[]/i];

/** A prompt may not carry a key, an email address or a path under private/. */
export function screenPrompt(text) {
  const t = String(text ?? '');
  if (!t.trim()) return { ok: false, why: 'Type a message first.' };
  if (t.length > 20000) return { ok: false, why: 'That message is too long (limit 20,000 characters).' };
  const hit = findSecret(t);
  if (hit) return { ok: false, why: `This looks like it contains a key or an email address (${hit}). Remove it before sending.` };
  // Heuristic, not a guarantee: a path-like "private/" or ".../private", or a priv* glob that could reach it.
  if (PRIVATE_PATH.some((re) => re.test(t))) return { ok: false, why: 'This mentions the private/ folder. Nothing from it may be sent to any model.' };
  return { ok: true };
}

export const providerForWorker = (workerId) => PROVIDERS.find((p) => p.workers.includes(workerId))?.id ?? null;

const TIER_RANK = { free: 0, standard: 1, premium: 2 };
export const HIDDEN = 'the error text contained something that looks like a key and was hidden';
/** Error text safe to show: anything that looks like a key is replaced. */
export const safeText = (s) => (findSecret(String(s)) ? HIDDEN : String(s));

/** Pick providers: a named one, all ready ones, or Auto (role or kind via the harness routing table).
 *  prefer 'cheap' (Auto only) tries the lowest tier first among ready models, except for kinds that need a second-model review. */
export function pick({ to, role, kind, prefer }, stats, cfg = loadWorkers()) {
  const ready = new Set(stats.filter((s) => s.state === 'ready').map((s) => s.id));
  if (to === 'all') return { ids: [...ready], why: 'all ready models' };
  if (to && to !== 'auto') return { ids: ready.has(to) ? [to] : [], why: ready.has(to) ? 'chosen by you' : 'that model is not ready' };
  const availableWorkers = new Set(cfg.workers.filter((w) => ready.has(providerForWorker(w.id))).map((w) => w.id));
  const k = kind || (role ? Object.entries(cfg.kinds).find(([, r]) => r === role)?.[0] : null) || 'brainstorm';
  let keptStrong = false;
  if (prefer === 'cheap') {
    if (cfg.secondModelReviewKinds.includes(k)) keptStrong = true;
    else if (cfg.kinds[k]) {
      const rl = cfg.roles[cfg.kinds[k]];
      const tier = (id) => TIER_RANK[cfg.workers.find((w) => w.id === id)?.tier] ?? 1;
      const worker = [rl.primary, ...(rl.fallbacks ?? [])].filter((id) => availableWorkers.has(id)).sort((a, b) => tier(a) - tier(b))[0]; // sort is stable: ties keep role order
      if (worker) return { ids: [providerForWorker(worker)].filter(Boolean), role: cfg.kinds[k], worker, why: `cheap first: ${worker} (${cfg.workers.find((w) => w.id === worker).tier}) for ${cfg.kinds[k]}` };
    }
  }
  try {
    const r = route(cfg, k, availableWorkers);
    const ids = [providerForWorker(r.worker)];
    return { ids: ids.filter(Boolean), role: r.role, worker: r.worker, why: `${r.role} role, ${r.worker}${keptStrong ? ' (kept the strongest model for this kind of task)' : ''}` };
  } catch (e) {
    return { ids: [], why: e.message };
  }
}

export function frame(prompt, roleName, cfg = loadWorkers()) {
  const r = roleName && cfg.roles[roleName];
  return r ? `You are acting as the ${roleName}. ${r.what}\n\n${prompt}` : prompt;
}

/** "N of M ready" for the Connect panel; `next` is the first model that is not ready and has an official page to open (Muse never is). */
export function connectSummary(stats) {
  const ready = stats.filter((s) => s.state === 'ready').length;
  const next = stats.find((s) => s.state !== 'ready' && PROVIDERS.find((p) => p.id === s.id)?.connect?.url)?.id ?? null;
  return { ready, total: stats.length, next };
}

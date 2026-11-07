// Pure hub logic: screening, routing, prompt framing. No network, no processes.
import { loadWorkers, route, findSecret } from '../harness/lib.mjs';
import { PROVIDERS } from './providers.mjs';

/** A prompt may not carry a key, an email address or a path under private/. */
export function screenPrompt(text) {
  const t = String(text ?? '');
  if (!t.trim()) return { ok: false, why: 'Type a message first.' };
  if (t.length > 20000) return { ok: false, why: 'That message is too long (limit 20,000 characters).' };
  const hit = findSecret(t);
  if (hit) return { ok: false, why: `This looks like it contains a key or an email address (${hit}). Remove it before sending.` };
  if (/(^|[\s"'`(])(?:~\/|\/Users\/[^\s]*\/)?(?:[\w./-]*\/)?private\//i.test(t)) return { ok: false, why: 'This mentions the private/ folder. Nothing from it may be sent to any model.' };
  return { ok: true };
}

export const providerForWorker = (workerId) => PROVIDERS.find((p) => p.workers.includes(workerId))?.id ?? null;

/** Pick providers: a named one, all ready ones, or Auto (role or kind via the harness routing table). */
export function pick({ to, role, kind }, stats, cfg = loadWorkers()) {
  const ready = new Set(stats.filter((s) => s.state === 'ready').map((s) => s.id));
  if (to === 'all') return { ids: [...ready], why: 'all ready models' };
  if (to && to !== 'auto') return { ids: ready.has(to) ? [to] : [], why: ready.has(to) ? 'chosen by you' : 'that model is not ready' };
  const availableWorkers = new Set(cfg.workers.filter((w) => ready.has(providerForWorker(w.id))).map((w) => w.id));
  const k = kind || (role ? Object.entries(cfg.kinds).find(([, r]) => r === role)?.[0] : null) || 'brainstorm';
  try {
    const r = route(cfg, k, availableWorkers);
    const ids = [providerForWorker(r.worker)];
    return { ids: ids.filter(Boolean), role: r.role, worker: r.worker, why: `${r.role} role, ${r.worker}` };
  } catch (e) {
    return { ids: [], why: e.message };
  }
}

export function frame(prompt, roleName, cfg = loadWorkers()) {
  const r = roleName && cfg.roles[roleName];
  return r ? `You are acting as the ${roleName}. ${r.what}\n\n${prompt}` : prompt;
}

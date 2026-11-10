// What the hub itself has sent to each model: COUNTS only, kept in ~/.zlatura-hub/usage.json.
// Never the prompt, never a reply, never an error text, never a key. This is the hub's own tally of the calls
// it made; it is not the vendor's meter and it knows nothing about calls made elsewhere (the Claude or ChatGPT
// apps, other tools). Plan balances for Claude Pro or ChatGPT cannot be read by any official route.
import { join } from 'node:path';
import { hubDir, readJson, writeJsonAtomic } from './store.mjs';

export const USAGE_FILE = (env = process.env) => join(hubDir(env), 'usage.json');
const KEEP_DAYS = 60;
const COUNT_KEYS = ['requests', 'ok', 'errors', 'rateLimited', 'inputTokens', 'outputTokens'];
const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const CAP = 1e15; // above any timestamp in milliseconds
const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(Math.floor(Number(v)), CAP) : 0);
export const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Keep only the known counters, so a hand-edited or damaged file can never smuggle text into the page. */
function clean(raw) {
  const days = {}; const last = {};
  for (const [d, per] of Object.entries(raw?.days ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !per || typeof per !== 'object') continue;
    for (const [id, c] of Object.entries(per)) {
      if (!ID.test(id) || !c || typeof c !== 'object') continue;
      (days[d] ??= {})[id] = Object.fromEntries(COUNT_KEYS.map((k) => [k, num(c[k])]));
    }
  }
  for (const [id, l] of Object.entries(raw?.last ?? {})) {
    if (!ID.test(id) || !l || typeof l !== 'object') continue;
    last[id] = { at: num(l.at), ok: l.ok === true, rateLimited: l.rateLimited === true, retryAfterSec: l.retryAfterSec == null ? null : num(l.retryAfterSec) };
  }
  return { version: 1, days, last };
}

const inflight = new Map(); // file -> Map(provider id -> n); only this process knows its own running calls

export function usageStore(env = process.env, now = () => Date.now()) {
  const file = USAGE_FILE(env);
  const load = () => clean(readJson(file, {}));
  const live = () => { if (!inflight.has(file)) inflight.set(file, new Map()); return inflight.get(file); };
  return {
    file,
    /** Mark a call as running; the returned function marks it finished. */
    begin(id) { const m = live(); m.set(id, (m.get(id) ?? 0) + 1); let done = false; return () => { if (!done) { done = true; m.set(id, Math.max(0, (m.get(id) ?? 1) - 1)); } }; },
    /** Add ONE finished call. Called from exactly one place (the wrapper in providers.mjs). */
    record(id, { ok, rateLimited = false, retryAfterSec = null, inputTokens = 0, outputTokens = 0 }) {
      if (!ID.test(id)) return;
      const data = load(); const t = now(); const d = dayKey(t);
      const c = ((data.days[d] ??= {})[id] ??= Object.fromEntries(COUNT_KEYS.map((k) => [k, 0])));
      c.requests += 1; if (ok) c.ok += 1; else c.errors += 1; if (rateLimited) c.rateLimited += 1;
      c.inputTokens += num(inputTokens); c.outputTokens += num(outputTokens);
      data.last[id] = { at: t, ok: !!ok, rateLimited: !!rateLimited, retryAfterSec: retryAfterSec == null ? null : num(retryAfterSec) };
      const keep = dayKey(t - KEEP_DAYS * 86400000);
      for (const k of Object.keys(data.days)) if (k < keep) delete data.days[k];
      writeJsonAtomic(file, data);
    },
    /** Today's counts and the last call for every provider that has any, plus the calls running right now. */
    snapshot() {
      const data = load(); const t = now(); const today = data.days[dayKey(t)] ?? {};
      const ids = new Set([...Object.keys(today), ...Object.keys(data.last), ...[...live()].filter(([, n]) => n > 0).map(([id]) => id)]);
      const out = {};
      for (const id of ids) {
        const l = data.last[id] ?? null;
        const waitMs = l?.rateLimited && l.retryAfterSec != null ? l.at + l.retryAfterSec * 1000 - t : null;
        const limitedNow = !!l?.rateLimited && (waitMs == null || waitMs > 0);
        out[id] = { today: today[id] ?? Object.fromEntries(COUNT_KEYS.map((k) => [k, 0])), last: l, inflight: live().get(id) ?? 0, rateLimitedNow: limitedNow, retryAfterSec: limitedNow && waitMs != null ? Math.ceil(waitMs / 1000) : null };
      }
      return { day: dayKey(t), at: t, providers: out };
    },
  };
}

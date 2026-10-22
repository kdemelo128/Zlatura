/* budget.mjs -- what an AI call may cost, in whole cents.
 *
 * The counters live in memory only: a restart starts them again at zero (see
 * README, "Spending limits"). Nothing here sees a document, a question or a
 * transcript: only token counts and cents. */

/** Whole cents for a call: ceil((in*Pin + out*Pout) / 1,000,000), all integers. Cache tokens count at the input price. */
export function costCents(usage, prices) {
  const int = (n) => (Number.isInteger(n) && n > 0 ? n : 0);
  const inTok = int(usage?.input_tokens) + int(usage?.cache_creation_input_tokens) + int(usage?.cache_read_input_tokens);
  const outTok = int(usage?.output_tokens);
  const micro = inTok * prices.inCentsPerMTok + outTok * prices.outCentsPerMTok;
  return Math.floor((micro + 999999) / 1000000);
}

const DAY = 86400000;
/** The next 00:00 UTC after `ms`. */
export const utcReset = (ms) => (Math.floor(ms / DAY) + 1) * DAY;

/** Integer cents as dollars, for messages only. */
export const dollars = (cents) => `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

/** "6 h 12 min" until the reset. */
export function untilReset(now) {
  const mins = Math.max(1, Math.ceil((utcReset(now) - now) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
}

/**
 * The day's books: per device and for the server as a whole. `caps` is read on
 * every call, so it can be changed while the server runs:
 *   { jobCents, deviceDayCents, serverDayCents, dailyRequests }
 * reserve() holds the worst case before a call so that two jobs started
 * together cannot both pass; settle() swaps the hold for the real cost and
 * release() drops it when the call failed.
 */
export function ledger(caps, now = () => Date.now()) {
  let resetAt = utcReset(now());
  let devices = new Map();
  let server = { used: 0, held: 0 };
  const roll = () => {
    const t = now();
    if (t >= resetAt) { resetAt = utcReset(t); devices = new Map(); server = { used: 0, held: 0 }; }
    return t;
  };
  const dev = (label) => { let d = devices.get(label); if (!d) { d = { used: 0, held: 0, requests: 0 }; devices.set(label, d); } return d; };
  const stop = (reason, extra) => ({ ok: false, reason, resetAt, retryAfter: Math.max(1, Math.ceil((resetAt - now()) / 1000)), ...extra });
  return {
    reserve(label, worst) {
      roll();
      const d = dev(label);
      if (worst > caps.jobCents) return { ok: false, reason: 'job', estimateCents: worst, capCents: caps.jobCents };
      if (d.requests >= caps.dailyRequests) return stop('device_requests', { requests: d.requests, requestLimit: caps.dailyRequests, usedCents: d.used, capCents: caps.deviceDayCents });
      if (d.used + d.held + worst > caps.deviceDayCents) return stop('device', { usedCents: d.used, capCents: caps.deviceDayCents });
      if (server.used + server.held + worst > caps.serverDayCents) return stop('server', { usedCents: server.used, capCents: caps.serverDayCents });
      d.held += worst; server.held += worst; d.requests += 1;
      return { ok: true, label, worst, resetAt };
    },
    /** Swap the hold for the real cost. A hold from before the UTC rollover was already cleared: only the cost counts. */
    settle(r, actual) {
      roll();
      const d = dev(r.label);
      if (r.resetAt === resetAt) { d.held -= r.worst; server.held -= r.worst; }
      d.used += actual; server.used += actual;
    },
    release(r) {
      roll();
      if (r.resetAt !== resetAt) return;
      const d = dev(r.label);
      d.held -= r.worst; server.held -= r.worst;
    },
    usage(label) {
      roll();
      const d = dev(label);
      return { usedCents: d.used, capCents: caps.deviceDayCents, requests: d.requests, requestLimit: caps.dailyRequests, resetAt: new Date(resetAt).toISOString() };
    },
  };
}

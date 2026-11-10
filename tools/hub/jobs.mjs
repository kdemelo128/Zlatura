// A small in-memory job queue: ids, status queued / running / done / failed, cancel, and a limit on how many
// run at once (default 3) across ALL projects. Nothing is stored on disk: restarting the hub clears the list.
import { randomBytes } from 'node:crypto';

const MAX_KEPT = 100; // finished jobs kept for the Jobs panel

export function createJobs({ concurrency = 3, now = () => Date.now() } = {}) {
  let limit = concurrency;
  const jobs = []; // oldest first
  const active = () => jobs.filter((j) => j.active && j.counts).length;
  const view = (j) => ({ id: j.id, project: j.project, kind: j.kind, label: j.label, status: j.status, cancelled: j.cancelled, counts: j.counts, queuedAt: j.queuedAt, startedAt: j.startedAt, endedAt: j.endedAt, error: j.error });

  function pump() {
    for (const j of jobs) {
      if (j.status !== 'queued') continue;
      if (j.counts && active() >= limit) continue;
      start(j);
    }
  }
  function start(j) {
    j.status = 'running'; j.active = true; j.startedAt = now();
    Promise.resolve().then(() => j.run({ signal: j.ctl.signal, job: view(j) })).then(
      (result) => { if (!j.cancelled) { j.result = result; j.status = 'done'; j.endedAt = now(); } },
      (e) => { if (!j.cancelled) { j.status = 'failed'; j.error = String(e?.message ?? e).slice(0, 300); j.endedAt = now(); } },
    ).finally(() => { j.active = false; j.settle(); prune(); pump(); });
  }
  function prune() {
    const done = jobs.filter((j) => j.status === 'done' || j.status === 'failed');
    for (const j of done.slice(0, Math.max(0, done.length - MAX_KEPT))) jobs.splice(jobs.indexOf(j), 1);
  }
  return {
    /** `counts: false` jobs (chat, apply) are listed and tracked but never wait behind the limit: someone is waiting at the screen. */
    add({ project, kind, label, run, counts = true }) {
      const j = { id: `job-${randomBytes(4).toString('hex')}`, project, kind, label: String(label).slice(0, 120), run, counts, status: 'queued', cancelled: false, queuedAt: now(), startedAt: null, endedAt: null, error: null, result: undefined, active: false, ctl: new AbortController() };
      j.done = new Promise((r) => { j.settle = r; });
      jobs.push(j); pump();
      return view(j);
    },
    list: () => jobs.map(view).reverse(),
    get: (id) => { const j = jobs.find((x) => x.id === id); return j ? view(j) : null; },
    result: (id) => jobs.find((x) => x.id === id)?.result,
    /** Resolves when the job has stopped for good (finished, failed or cancelled and unwound). */
    async wait(id) { const j = jobs.find((x) => x.id === id); if (!j) return null; await j.done; return { ...view(j), result: j.result }; },
    cancel(id) {
      const j = jobs.find((x) => x.id === id);
      if (!j || (j.status !== 'queued' && j.status !== 'running')) return false;
      const wasQueued = j.status === 'queued';
      j.cancelled = true; j.status = 'failed'; j.error = 'Cancelled.'; j.endedAt = now(); j.ctl.abort();
      if (wasQueued) { j.settle(); pump(); }
      return true;
    },
    setLimit(n) { limit = n; pump(); },
    get limit() { return limit; },
    running: () => jobs.filter((j) => j.status === 'running').length,
    queued: () => jobs.filter((j) => j.status === 'queued').length,
  };
}

#!/usr/bin/env node
// Model hub: a local dashboard to chat with every model through its sanctioned route.
//   node tools/hub/server.mjs            then open the printed address (it carries a one-time token)
// Listens on 127.0.0.1 only. Every request needs the token; Host and Origin must be this machine.
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn as spawnProc } from 'node:child_process';
import { PROVIDERS, statuses, saveKey, LIMITS, PLAN_USAGE } from './providers.mjs';
import { usageStore } from './usage.mjs';
import { createJobs } from './jobs.mjs';
import { ProjectError, loadRegistry, addProject, removeProject, setConcurrency, projectCfg, ensureFolder } from './projects.mjs';
import { screenPrompt, pick, frame, connectSummary, safeText } from './hub-lib.mjs';
import { loadWorkers, findSecret } from '../harness/lib.mjs';
import { listCards, runAgent, applyDiff } from './agents.mjs';
import { PrError, getToken, ghClient, projectInfo, listPrs, checkPr, localBranches, prefill, createPr, mergePr, updateBranch, setAutoMerge } from './github.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RUNNER = fileURLToPath(new URL('../harness/run-task.mjs', import.meta.url)); // the hub's own harness, run inside the chosen project's folder

const MAX_BODY = 64 * 1024;
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export function createHub({ token = randomBytes(24).toString('hex'), env = process.env, spawn, fetch: fetchFn, root = ROOT, exec, page = readFileSync(fileURLToPath(new URL('./public/index.html', import.meta.url)), 'utf8') } = {}) {
  const cfg = loadWorkers();
  let port = 0;
  const applying = new Set(); // project ids with an apply in progress: one at a time per project
  const startLimit = Number(env.HUB_CONCURRENCY);
  const jobs = createJobs({ concurrency: Number.isInteger(startLimit) && startLimit >= 1 && startLimit <= 8 ? startLimit : loadRegistry({ env, root, cfg }).concurrency });
  /** The project a request is about (the home project when none is named): its folder, its own harness config. Throws ProjectError. */
  const resolveProject = (id) => {
    const reg = loadRegistry({ env, root, cfg });
    const entry = reg.projects.find((p) => p.id === (id || reg.home));
    if (!entry || (id != null && typeof id !== 'string')) throw new ProjectError('Unknown project.');
    ensureFolder(entry);
    return { entry, ...projectCfg(cfg, entry) };
  };
  const askModel = (id, prompt, signal) => PROVIDERS.find((x) => x.id === id).ask(prompt, { env, spawn, fetch: fetchFn, signal });
  const jobsView = () => ({ jobs: jobs.list().map((j) => ({ ...j, error: j.error == null ? null : safeText(j.error) })), limit: jobs.limit, running: jobs.running(), queued: jobs.queued() });
  const pubProject = (p) => ({ id: p.id, name: p.name, folder: p.folder, github: p.github ?? null, source: p.source, removable: p.source === 'user', missing: !existsSync(p.folder) });
  const isActiveCard = (project, card, kind = 'agent') => jobs.list().some((j) => j.kind === kind && j.project === project && j.label === String(card).slice(0, 120) && (j.status === 'queued' || j.status === 'running'));
  const hostOk = (h) => h === `127.0.0.1:${port}` || h === `localhost:${port}`;
  const originOk = (o) => !o || o === `http://127.0.0.1:${port}` || o === `http://localhost:${port}`;
  const send = (res, code, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  const body = (req) => new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('bad json')); } });
  });
  const server = http.createServer(async (req, res) => {
    try {
      if (!hostOk(req.headers.host) || !originOk(req.headers.origin)) return send(res, 403, { error: 'not from this machine' });
      const url = new URL(req.url, 'http://x');
      const isPage = req.method === 'GET' && url.pathname === '/';
      const given = req.headers['x-hub-token'] || (isPage ? url.searchParams.get('t') : '') || ''; // ?t= opens the page only; every /api/ call needs the header
      if (!same(given, token)) return send(res, 401, { error: 'missing or wrong token: open the address the hub printed' });
      if (req.method === 'GET' && url.pathname === '/') return send(res, 200, page, 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/api/state') {
        const stats = await statuses({ env, spawn });
        const providers = stats.map((s) => ({ ...s, connect: PROVIDERS.find((p) => p.id === s.id).connect }));
        let pc = cfg; let projectError = null;
        try { pc = resolveProject(url.searchParams.get('project') || undefined).cfg; } catch (e) { projectError = safeText(e.message); } // the project's own roles and kinds; the shared ones if it has a problem
        return send(res, 200, { providers, summary: connectSummary(stats), roles: Object.fromEntries(Object.entries(pc.roles).map(([k, r]) => [k, { what: r.what, primary: r.primary }])), kinds: Object.keys(pc.kinds), projectError });
      }
      if (req.method === 'GET' && url.pathname === '/api/usage') {
        // counts only: what this hub sent, with the approximate limit and the vendor's own page to check. Never a plan balance.
        const snap = usageStore(env).snapshot();
        const providers = Object.fromEntries(PROVIDERS.filter((p) => p.kind !== 'none' && p.chat !== false).map((p) => [p.id, { ...(snap.providers[p.id] ?? { today: { requests: 0, ok: 0, errors: 0, rateLimited: 0, inputTokens: 0, outputTokens: 0 }, last: null, inflight: 0, rateLimitedNow: false, retryAfterSec: null }), tokens: p.kind === 'api' ? 'reported' : 'not reported by this tool', limit: LIMITS[p.id] ?? null, plan: PLAN_USAGE[p.id] ?? null }]));
        return send(res, 200, { day: snap.day, at: snap.at, providers });
      }
      if (req.method === 'POST' && url.pathname === '/api/key') {
        const b = await body(req); const p = PROVIDERS.find((x) => x.id === b.provider && x.keyName);
        if (!p) return send(res, 400, { error: 'that provider does not use a key' });
        try { saveKey(p.keyName, b.key, env); } catch (e) { return send(res, 400, { error: e.message }); }
        return send(res, 200, { ok: true }); // the key is never echoed back
      }
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        const b = await body(req);
        const s = screenPrompt(b.message);
        if (!s.ok) return send(res, 400, { error: s.why });
        const proj = resolveProject(b.project); // a ProjectError becomes a 400 below
        const stats = await statuses({ env, spawn });
        const chosen = pick({ to: b.to, role: b.role, kind: b.kind, prefer: b.prefer === 'cheap' ? 'cheap' : 'quality' }, stats, proj.cfg);
        if (!chosen.ids.length) return send(res, 200, { why: chosen.why, replies: [], note: 'No ready model for that. Check the left panel.' });
        const prompt = frame(b.message, b.role, proj.cfg);
        // chat is listed in the Jobs panel under its project, but never waits behind the limit: you are waiting at the screen
        const job = jobs.add({ project: proj.entry.id, kind: 'chat', label: `chat to ${chosen.ids.join(', ')}`, counts: false, run: ({ signal }) => Promise.all(chosen.ids.map(async (id) => {
          const p = PROVIDERS.find((x) => x.id === id); const t0 = Date.now();
          try { return { id, label: p.label, ok: true, text: await askModel(id, prompt, signal), ms: Date.now() - t0 }; }
          catch (e) { return { id, label: p.label, ok: false, text: safeText(String(e.message).replace(/(key|token)=\S+/gi, '$1=…')), ms: Date.now() - t0 }; }
        })) });
        const done = await jobs.wait(job.id);
        return send(res, 200, { why: chosen.why, replies: done.result ?? [] });
      }
      if (req.method === 'GET' && url.pathname === '/api/cards') return send(res, 200, { cards: listCards(resolveProject(url.searchParams.get('project') || undefined).entry.folder) });
      if (req.method === 'GET' && url.pathname === '/api/projects') {
        const reg = loadRegistry({ env, root, cfg });
        return send(res, 200, { projects: reg.projects.map(pubProject), home: reg.home, concurrency: jobs.limit });
      }
      if (req.method === 'POST' && url.pathname === '/api/projects/add') {
        const b = await body(req);
        return send(res, 200, { project: pubProject(await addProject({ env, root, cfg, folder: b.folder, name: b.name, github: b.github, exec })) });
      }
      if (req.method === 'POST' && url.pathname === '/api/projects/remove') {
        const b = await body(req);
        if (jobs.list().some((j) => j.project === b.id && (j.status === 'queued' || j.status === 'running'))) return send(res, 400, { error: 'That project has jobs running. Cancel them first.' });
        removeProject({ env, root, cfg, id: b.id });
        return send(res, 200, { ok: true });
      }
      if (req.method === 'GET' && url.pathname === '/api/jobs') return send(res, 200, jobsView());
      if (req.method === 'POST' && url.pathname === '/api/jobs/cancel') { const b = await body(req); return send(res, 200, { ok: jobs.cancel(String(b.id)) }); }
      if (req.method === 'POST' && url.pathname === '/api/jobs/result') {
        const b = await body(req); const j = jobs.get(String(b.id));
        return j ? send(res, 200, { job: { ...j, error: j.error == null ? null : safeText(j.error) }, result: jobs.result(j.id) ?? null }) : send(res, 404, { error: 'no such job' });
      }
      if (req.method === 'POST' && url.pathname === '/api/jobs/concurrency') {
        const b = await body(req); const n = setConcurrency({ env, root, cfg, n: b.n }); jobs.setLimit(n);
        return send(res, 200, { limit: n });
      }
      if (req.method === 'POST' && url.pathname === '/api/agent') {
        const b = await body(req);
        let proj; try { proj = resolveProject(b.project); } catch (e) { return send(res, 200, { ok: false, problems: [safeText(e.message)] }); }
        if (isActiveCard(proj.entry.id, b.card)) return send(res, 200, { ok: false, problems: ['Another agent run is in progress.'] }); // the same card in the same project, twice
        // a draft is a job: it queues behind the limit, runs in this project's folder with its own protected paths, and can be cancelled
        const job = jobs.add({ project: proj.entry.id, kind: 'agent', label: String(b.card), run: async ({ signal }) => {
          const stats = await statuses({ env, spawn });
          return runAgent({ root: proj.entry.folder, file: b.card, to: b.to, stats, cfg: proj.cfg, ask: (id, prompt) => askModel(id, prompt, signal) });
        } });
        if (b.async === true) return send(res, 200, { ok: true, jobId: job.id });
        const done = await jobs.wait(job.id);
        return send(res, 200, done.status === 'done' ? done.result : { ok: false, problems: [safeText(done.error ?? 'failed')] });
      }
      if (req.method === 'POST' && url.pathname === '/api/agent/apply') {
        const b = await body(req);
        const bad = [findSecret(String(b.diff ?? ''))].filter(Boolean);
        if (bad.length) return send(res, 400, { error: 'the draft contains a key or an email address' });
        let proj; try { proj = resolveProject(b.project); } catch (e) { return send(res, 200, { ok: false, message: safeText(e.message) }); }
        const id = proj.entry.id;
        if (applying.has(id) || isActiveCard(id, b.card)) return send(res, 200, { ok: false, message: 'Another agent run is in progress.' });
        applying.add(id);
        try {
          const job = jobs.add({ project: id, kind: 'apply', label: String(b.card), counts: false, run: async () => applyDiff({ root: proj.entry.folder, file: b.card, provider: b.provider, diff: String(b.diff ?? ''), cfg: proj.cfg, exec, runner: RUNNER, profile: proj.profile }) });
          const done = await jobs.wait(job.id);
          return send(res, 200, done.status === 'done' ? { ok: true, message: done.result } : { ok: false, message: safeText(done.error ?? 'failed') });
        } finally { applying.delete(id); }
      }
      if (url.pathname.startsWith('/api/pr/')) {
        const token = getToken(env);
        const fail = (e) => {
          const msg = safeText(String(e?.message ?? 'failed').split(token || '\u0000').join('…'));
          const code = e?.status === 400 || e?.status === 409 ? e.status : 502;
          return send(res, code, { error: msg, ...(e?.reasons ? { reasons: e.reasons } : {}), ...(e?.needsToken ? { needsToken: true } : {}) });
        };
        try {
          if (req.method === 'GET' && url.pathname === '/api/pr/projects') return send(res, 200, { projects: loadRegistry({ env, root, cfg }).projects.map((p) => p.id), hasToken: !!token });
          if (req.method !== 'POST') return send(res, 404, { error: 'not found' });
          const b = await body(req);
          const mutating = ['create', 'merge', 'update', 'automerge'].includes(url.pathname.slice('/api/pr/'.length));
          if (mutating && b.confirm !== true) return send(res, 400, { error: 'Confirmation is required. Nothing was changed.' });
          const reg = loadRegistry({ env, root, cfg }); // the PR tab follows the selected project: its folder and its repository come from the registry, never from the page
          const entry = reg.projects.find((p) => p.id === b.project);
          if (entry) ensureFolder(entry);
          const info = await projectInfo({ cfg: { projects: Object.fromEntries(reg.projects.map((p) => [p.id, { folder: p.folder, ...(p.github ? { github: p.github } : {}) }])) }, project: b.project, root, exec });
          const gh = ghClient({ token, fetch: fetchFn });
          const common = { gh, repo: info.repo, number: b.number, sha: b.sha, confirm: b.confirm };
          switch (url.pathname) {
            case '/api/pr/list': return send(res, 200, { repo: info.repo, source: info.source, prs: await listPrs(gh, info.repo) });
            case '/api/pr/check': return send(res, 200, { repo: info.repo, pr: await checkPr(gh, info.repo, b.number) });
            case '/api/pr/branches': {
              const base = (await gh.get(`/repos/${info.repo}`)).default_branch;
              return send(res, 200, { repo: info.repo, base, branches: await localBranches({ folder: info.folder, base, exec }) });
            }
            case '/api/pr/prefill': return send(res, 200, await prefill({ folder: info.folder, branch: b.branch, exec }));
            case '/api/pr/create': return send(res, 200, await createPr({ gh, repo: info.repo, folder: info.folder, branch: b.branch, title: b.title, body: b.body, draft: b.draft === true, confirm: b.confirm, exec }));
            case '/api/pr/merge': return send(res, 200, await mergePr(common));
            case '/api/pr/update': return send(res, 200, await updateBranch(common));
            case '/api/pr/automerge': return send(res, 200, await setAutoMerge({ ...common, enable: b.enable === true }));
            default: return send(res, 404, { error: 'not found' });
          }
        } catch (e) { if (!(e instanceof PrError)) console.error('Hub pull request call failed:', safeText(String(e?.message ?? e).split(token || '\u0000').join('…'))); return fail(e); }
      }
      return send(res, 404, { error: 'not found' });
    } catch (e) {
      if (e instanceof ProjectError) return send(res, 400, { error: safeText(e.message) });
      console.error('Hub request failed:', e?.stack ?? e); return send(res, 500, { error: 'internal server error' });
    }
  });
  return {
    token,
    listen: (p = 0) => new Promise((resolve) => server.listen(p, '127.0.0.1', () => { port = server.address().port; resolve(port); })),
    close: () => new Promise((r) => server.close(r)),
    get port() { return port; },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const hub = createHub();
  const port = await hub.listen(Number(process.env.HUB_PORT) || 4747);
  const address = `http://127.0.0.1:${port}/?t=${hub.token}`;
  if (!process.env.HUB_NO_OPEN) { try { spawnProc(process.platform === 'darwin' ? 'open' : 'xdg-open', [address], { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch { /* the address is printed below */ } }
  console.log(`\nModel hub is running.\nOpen this address in your browser:\n\n  http://127.0.0.1:${port}/?t=${hub.token}\n\nPress Ctrl+C to stop. The address changes each time you start it.\n`);
}

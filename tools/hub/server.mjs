#!/usr/bin/env node
// Model hub: a local dashboard to chat with every model through its sanctioned route.
//   node tools/hub/server.mjs            then open the printed address (it carries a one-time token)
// Listens on 127.0.0.1 only. Every request needs the token; Host and Origin must be this machine.
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn as spawnProc } from 'node:child_process';
import { PROVIDERS, statuses, saveKey } from './providers.mjs';
import { screenPrompt, pick, frame } from './hub-lib.mjs';
import { loadWorkers, findSecret } from '../harness/lib.mjs';
import { listCards, runAgent, applyDiff } from './agents.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const MAX_BODY = 64 * 1024;
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export function createHub({ token = randomBytes(24).toString('hex'), env = process.env, spawn, fetch: fetchFn, root = ROOT, exec, page = readFileSync(fileURLToPath(new URL('./public/index.html', import.meta.url)), 'utf8') } = {}) {
  const cfg = loadWorkers();
  let port = 0;
  let busy = false; // one agent run or apply at a time
  const HIDDEN = 'the error text contained something that looks like a key and was hidden';
  const safeText = (s) => (findSecret(String(s)) ? HIDDEN : String(s));
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
        return send(res, 200, { providers: await statuses({ env, spawn }), roles: Object.fromEntries(Object.entries(cfg.roles).map(([k, r]) => [k, { what: r.what, primary: r.primary }])), kinds: Object.keys(cfg.kinds) });
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
        const stats = await statuses({ env, spawn });
        const chosen = pick({ to: b.to, role: b.role, kind: b.kind }, stats, cfg);
        if (!chosen.ids.length) return send(res, 200, { why: chosen.why, replies: [], note: 'No ready model for that. Check the left panel.' });
        const prompt = frame(b.message, b.role, cfg);
        const replies = await Promise.all(chosen.ids.map(async (id) => {
          const p = PROVIDERS.find((x) => x.id === id); const t0 = Date.now();
          try { return { id, label: p.label, ok: true, text: await p.ask(prompt, { env, spawn, fetch: fetchFn }), ms: Date.now() - t0 }; }
          catch (e) { return { id, label: p.label, ok: false, text: safeText(String(e.message).replace(/(key|token)=\S+/gi, '$1=…')), ms: Date.now() - t0 }; }
        }));
        return send(res, 200, { why: chosen.why, replies });
      }
      if (req.method === 'GET' && url.pathname === '/api/cards') return send(res, 200, { cards: listCards(root) });
      if (req.method === 'POST' && url.pathname === '/api/agent') {
        const b = await body(req);
        if (busy) return send(res, 200, { ok: false, problems: ['Another agent run is in progress.'] });
        busy = true;
        try {
          const stats = await statuses({ env, spawn });
          return send(res, 200, await runAgent({ root, file: b.card, to: b.to, stats, cfg, ask: (id, prompt) => PROVIDERS.find((x) => x.id === id).ask(prompt, { env, spawn, fetch: fetchFn }) }));
        }
        catch (e) { return send(res, 200, { ok: false, problems: [safeText(e.message)] }); }
        finally { busy = false; }
      }
      if (req.method === 'POST' && url.pathname === '/api/agent/apply') {
        const b = await body(req);
        const bad = [findSecret(String(b.diff ?? ''))].filter(Boolean);
        if (bad.length) return send(res, 400, { error: 'the draft contains a key or an email address' });
        if (busy) return send(res, 200, { ok: false, message: 'Another agent run is in progress.' });
        busy = true;
        try { return send(res, 200, { ok: true, message: await applyDiff({ root, file: b.card, provider: b.provider, diff: String(b.diff ?? ''), exec }) }); }
        catch (e) { return send(res, 200, { ok: false, message: safeText(e.message) }); }
        finally { busy = false; }
      }
      return send(res, 404, { error: 'not found' });
    } catch (e) { return send(res, 500, { error: String(e.message ?? e) }); }
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

/* The Zlatura AI server: a small HTTP service that holds the API keys the
 * static app must never carry, and does three things for it: reads figures
 * out of documents, answers questions about a deal from its facts, and
 * transcribes and summarizes audio.
 *
 *   ANTHROPIC_API_KEY  required for /api/extract, /api/assist, /api/meeting
 *   APP_TOKENS_FILE    one line per device, "<label> <sha256-hex>" (node tokens.mjs new <label>);
 *                      re-read when the file changes and on SIGHUP, so deleting a line revokes it
 *   APP_TOKEN_HASHES   the same as "label:hex,label:hex", for hosts with no file
 *   APP_TOKEN          the older single shared token; still accepted, as device "legacy"
 *                      (one of the three is required; the app sends "Authorization: Bearer ...")
 *   ALLOWED_ORIGINS    the app's origin(s), comma separated (e.g. https://you.github.io)
 *   STT_URL            optional: an OpenAI-compatible /audio/transcriptions endpoint
 *   STT_API_KEY, STT_MODEL (default whisper-1)
 *   AI_MODEL           default claude-opus-5-5
 *   PORT               default 8787
 *   MAX_BODY_MB        default 40
 *   RATE_PER_MIN       AI requests a minute per device, default 20
 *   AI_DAILY_REQUESTS, AI_JOB_CAP_CENTS, AI_DEVICE_DAY_CAP_CENTS, AI_SERVER_DAY_CAP_CENTS,
 *   AI_PRICE_IN_CENTS_PER_MTOK, AI_PRICE_OUT_CENTS_PER_MTOK, STT_PRICE_CENTS_PER_MIN
 *                      spending limits in whole cents (README: placeholders until the owner sets them)
 *
 * No request body, document, token or transcript is logged or stored. */

import http from 'node:http';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { extract, assist, meeting, AiError, MODEL } from './ai.mjs';
import { costCents, ledger, dollars, untilReset } from './budget.mjs';
import { readTokensFile, parseHashList, matchDevice, hashToken } from './tokens.mjs';

/** A setting that is cents or a count: a whole number, zero or more. Anything else stops the server starting. */
function whole(env, name, dflt) {
  const raw = env[name];
  if (raw === undefined || String(raw).trim() === '') return dflt;
  if (!/^\d+$/.test(String(raw).trim())) throw new Error(`${name} must be a whole number (cents are whole numbers); got "${String(raw).slice(0, 20)}".`);
  return Number(String(raw).trim());
}

export function config(env = process.env) {
  return {
    token: env.APP_TOKEN || '',
    tokensFile: env.APP_TOKENS_FILE || '',
    tokenHashes: env.APP_TOKEN_HASHES ? parseHashList(env.APP_TOKEN_HASHES) : [],
    origins: (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    aiConfigured: !!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
    stt: env.STT_URL ? { url: env.STT_URL, key: env.STT_API_KEY || '', model: env.STT_MODEL || 'whisper-1' } : null,
    maxBody: Math.max(1, Number(env.MAX_BODY_MB) || 40) * 1024 * 1024,
    ratePerMin: Math.max(1, Number(env.RATE_PER_MIN) || 20),
    port: Number(env.PORT) || 8787,
    // PLACEHOLDER figures until the owner names them (server/README.md)
    dailyRequests: whole(env, 'AI_DAILY_REQUESTS', 200),
    jobCents: whole(env, 'AI_JOB_CAP_CENTS', 300),
    deviceDayCents: whole(env, 'AI_DEVICE_DAY_CAP_CENTS', 1500),
    serverDayCents: whole(env, 'AI_SERVER_DAY_CAP_CENTS', 3000),
    prices: { inCentsPerMTok: whole(env, 'AI_PRICE_IN_CENTS_PER_MTOK', 1500), outCentsPerMTok: whole(env, 'AI_PRICE_OUT_CENTS_PER_MTOK', 7500) },
    sttCentsPerMin: whole(env, 'STT_PRICE_CENTS_PER_MIN', 2),
  };
}


function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(body));
}

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new AiError('That is larger than this server accepts.', 413, 'too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new AiError('The request is not valid JSON.', 400, 'bad_request')); }
    });
    req.on('error', reject);
  });
}

/** Speech to text through an OpenAI-compatible endpoint (OpenAI, Groq, a self-hosted Whisper server...). */
export async function transcribe(stt, { name, mediaType, data }, fetchImpl = fetch) {
  if (!stt) throw new AiError('Transcription is not set up on this server (STT_URL).', 501, 'not_configured');
  if (typeof data !== 'string' || !data) throw new AiError('Send the audio.', 400, 'bad_request');
  const form = new FormData();
  form.append('file', new Blob([Buffer.from(data, 'base64')], { type: mediaType || 'application/octet-stream' }), name || 'audio.m4a');
  form.append('model', stt.model);
  form.append('response_format', 'verbose_json');
  const r = await fetchImpl(stt.url, { method: 'POST', headers: stt.key ? { Authorization: `Bearer ${stt.key}` } : {}, body: form });
  if (!r.ok) throw new AiError(`The transcription service answered ${r.status}.`, 502, 'stt_error');
  const j = await r.json();
  const segments = Array.isArray(j.segments) ? j.segments.map((s) => ({ start: s.start, end: s.end, text: String(s.text || '').trim() })) : [];
  return { text: String(j.text || segments.map((s) => s.text).join(' ')).trim(), segments, language: j.language || null, duration: j.duration ?? null };
}

/** A fixed one-minute window per device: enough for a broker, not for a leaked token run in a loop. */
export function limiter(perMin, now = () => Date.now()) {
  const seen = new Map();
  return (key) => {
    const t = now();
    let w = seen.get(key);
    if (!w || t - w.start >= 60000) { w = { start: t, n: 0 }; seen.set(key, w); }
    w.n += 1;
    if (seen.size > 5000) for (const [k, v] of seen) if (t - v.start >= 60000) seen.delete(k);
    return w.n <= perMin ? 0 : Math.ceil((w.start + 60000 - t) / 1000);
  };
}

/** The refusal a ledger answer turns into: the app shows `message`, and reads the numbers if it wants them. */
function refusal(r, now) {
  if (r.reason === 'job') return new AiError(`This job could cost up to ${dollars(r.estimateCents)}, over the ${dollars(r.capCents)} a single job may use. Send fewer or shorter documents.`, 422, 'job_over_budget', { estimateCents: r.estimateCents, capCents: r.capCents });
  const when = `It resets at 00:00 UTC, in ${untilReset(now())}.`;
  const reset = { resetAt: new Date(r.resetAt).toISOString(), retryAfter: r.retryAfter };
  if (r.reason === 'device_requests') return new AiError(`This device has used today's ${r.requestLimit} AI requests. ${when}`, 429, 'daily_limit', { usedCents: r.usedCents, capCents: r.capCents, requests: r.requests, requestLimit: r.requestLimit, ...reset });
  if (r.reason === 'device') return new AiError(`This device has used today's AI allowance (${dollars(r.capCents)}). ${when}`, 429, 'daily_limit', { usedCents: r.usedCents, capCents: r.capCents, ...reset });
  return new AiError(`The AI server has used today's allowance for everyone (${dollars(r.capCents)}). ${when}`, 429, 'server_daily_limit', { usedCents: r.usedCents, capCents: r.capCents, ...reset });
}

/**
 * The request handler. `client` is an Anthropic client (or a stand-in in
 * tests); `deps.fetch` is used for the speech service and `deps.now` is the
 * clock (milliseconds), so tests can move through a minute or a UTC day.
 * The returned function also has `.reload()` (re-read the tokens file, for
 * SIGHUP) and `.tokensProblem()`.
 */
export function handler(cfg, client, deps = {}) {
  const now = deps.now || (() => Date.now());
  const limit = limiter(cfg.ratePerMin || 20, now);
  const books = ledger({
    get jobCents() { return cfg.jobCents ?? 300; },
    get deviceDayCents() { return cfg.deviceDayCents ?? 1500; },
    get serverDayCents() { return cfg.serverDayCents ?? 3000; },
    get dailyRequests() { return cfg.dailyRequests ?? 200; },
  }, now);
  const prices = () => cfg.prices || { inCentsPerMTok: 1500, outCentsPerMTok: 7500 };

  // the tokens file: re-read when its size or modification time changes (looked at most every 10 s), and on SIGHUP.
  // A file that cannot be read or is malformed fails every request closed until it is fixed.
  let file = { entries: [], stamp: null, broken: false };
  let checkedAt = -Infinity;
  const stampOf = () => { const st = fs.statSync(cfg.tokensFile); return `${st.mtimeMs}:${st.size}`; };
  const refresh = (force = false) => {
    if (!cfg.tokensFile) return;
    const t = now();
    if (!force && t - checkedAt < 10000) return;
    checkedAt = t;
    try {
      const stamp = stampOf();
      if (!force && !file.broken && stamp === file.stamp) return;
      file = { entries: readTokensFile(cfg.tokensFile), stamp, broken: false };
    } catch { file = { entries: [], stamp: null, broken: true }; }
  };
  refresh(true);
  /** The device label for a presented token, null if unknown or withdrawn, or 'unavailable' if the file is broken. */
  const deviceFor = (auth) => {
    refresh();
    if (file.broken) return 'unavailable';
    const entries = [...file.entries, ...(cfg.tokenHashes || []), ...(cfg.token ? [['legacy', hashToken(cfg.token)]] : [])];
    return matchDevice(entries, auth);
  };

  /** Hold the worst case before a call, or throw the refusal. */
  const hold = (label, worst) => { const r = books.reserve(label, worst); if (!r.ok) throw refusal(r, now); return r; };
  /** What call() in ai.mjs uses: reserve with the exact input size, settle with the usage, release on failure. */
  const hookFor = (label) => {
    let r = null;
    return {
      reserve: (inTokens, maxTokens) => { r = hold(label, costCents({ input_tokens: inTokens, output_tokens: maxTokens }, prices())); },
      settle: (usage) => books.settle(r, usage ? costCents(usage, prices()) : r.worst),
      release: () => { if (r) books.release(r); },
    };
  };

  const h = async (req, res) => {
    const origin = req.headers.origin;
    const cors = origin && cfg.origins.includes(origin)
      ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600' }
      : {};
    if (origin && !cors['Access-Control-Allow-Origin']) { send(res, 403, { error: 'origin_not_allowed', message: 'This server does not accept requests from that site.' }); return; }
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const device = deviceFor(auth);
    if (device === 'unavailable') { console.error(`[${new Date().toISOString()}] tokens file unreadable or malformed: refusing every request`); send(res, 503, { error: 'tokens_unavailable', message: 'The AI server cannot read its list of access tokens right now: ask whoever runs it.' }, cors); return; }
    if (!device) { send(res, 401, { error: 'unauthorized', message: 'The access token is missing or wrong, or was withdrawn: ask whoever runs your AI server.' }, cors); return; }
    let path;
    try { path = new URL(req.url, 'http://x').pathname; } catch { send(res, 400, { error: 'bad_request', message: 'The request address is not valid.' }, cors); return; }
    try {
      if (req.method === 'GET' && path === '/api/health') {
        send(res, 200, { ok: true, ai: cfg.aiConfigured, transcription: !!cfg.stt, model: cfg.aiConfigured ? MODEL : null, budget: books.usage(device) }, cors);
        return;
      }
      if (req.method !== 'POST') { send(res, 404, { error: 'not_found' }, cors); return; }
      const wait = limit(device);
      if (wait) { send(res, 429, { error: 'rate_limited', message: `Too many requests: try again in ${wait} seconds.` }, { ...cors, 'Retry-After': String(wait) }); return; }
      const body = await readJson(req, cfg.maxBody);
      const needAi = () => { if (!cfg.aiConfigured || !client) throw new AiError('AI is not set up on this server (ANTHROPIC_API_KEY).', 501, 'not_configured'); };
      let out;
      if (path === '/api/extract') { needAi(); out = await extract(client, body, hookFor(device)); }
      else if (path === '/api/assist') { needAi(); out = await assist(client, body, hookFor(device)); }
      else if (path === '/api/meeting') { needAi(); out = await meeting(client, body, hookFor(device)); }
      else if (path === '/api/transcribe') {
        // the cost is known only afterwards: hold one cent now, then settle by the minute
        const r = cfg.stt ? hold(device, 1) : null;
        try { out = await transcribe(cfg.stt, body, deps.fetch); } catch (e) { if (r) books.release(r); throw e; }
        const mins = Number.isFinite(out.duration) && out.duration >= 0 ? Math.max(1, Math.ceil(out.duration / 60)) * (cfg.sttCentsPerMin ?? 2) : (cfg.jobCents ?? 300);
        books.settle(r, mins);
      }
      else { send(res, 404, { error: 'not_found' }, cors); return; }
      send(res, 200, out, cors);
    } catch (e) {
      if (e instanceof AiError) { send(res, e.status, { error: e.code, message: e.message, ...e.extra }, { ...cors, ...(e.extra.retryAfter ? { 'Retry-After': String(e.extra.retryAfter) } : {}) }); return; }
      // SDK errors carry a status; never pass their bodies on (they can echo request details)
      const status = typeof e?.status === 'number' ? e.status : 500;
      const message = status === 429 ? 'The AI service is busy: try again in a minute.'
        : status === 401 || status === 403 ? 'The server’s AI key was refused.'
          : status >= 500 ? 'The AI service had a problem: try again.' : 'The AI request failed.';
      // time, path, status, error name and device label only: never a token, a body, a document name or model text
      console.error(`[${new Date().toISOString()}] ${path} failed: ${status} ${e?.name || 'Error'} (${device})`);
      send(res, status >= 400 && status < 600 ? (status === 401 || status === 403 ? 502 : status) : 500, { error: 'upstream', message }, cors);
    }
  };
  h.reload = () => refresh(true);
  h.tokensProblem = () => file.broken;
  return h;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  let cfg;
  try { cfg = config(); } catch (e) { console.error(e.message); process.exit(1); }
  if (cfg.token && cfg.token.length < 16) { console.error('APP_TOKEN must be a long random string (16+ characters).'); process.exit(1); }
  if (!cfg.token && !cfg.tokensFile && !cfg.tokenHashes.length) { console.error('Set APP_TOKENS_FILE (see tokens.mjs), APP_TOKEN_HASHES, or APP_TOKEN to a long random string (16+ characters).'); process.exit(1); }
  if (cfg.tokensFile) { try { readTokensFile(cfg.tokensFile); } catch (e) { console.error(`APP_TOKENS_FILE: ${e.code === 'ENOENT' ? 'the file does not exist' : e.message}`); process.exit(1); } }
  if (cfg.token && (cfg.tokensFile || cfg.tokenHashes.length)) console.warn('APP_TOKEN is still set beside per-device tokens: it keeps working as device "legacy". Unset it once every device has its own token.');
  if (!cfg.origins.length) console.warn('ALLOWED_ORIGINS is empty: browsers on any other site will be refused.');
  // a rejected promise nobody caught logs its name only (never its message) and the server keeps running
  process.on('unhandledRejection', (e) => console.error(`[${new Date().toISOString()}] unhandled: ${e?.name || 'Error'}`));
  let client = null;
  if (cfg.aiConfigured) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); client = new Anthropic(); }
  const app = handler(cfg, client);
  process.on('SIGHUP', () => { app.reload(); console.log(`tokens file re-read${app.tokensProblem() ? ': UNREADABLE, refusing every request until fixed' : ''}`); });
  http.createServer(app).listen(cfg.port, () => {
    console.log(`Zlatura AI server on :${cfg.port} -- AI ${cfg.aiConfigured ? `on (${MODEL})` : 'off'}, transcription ${cfg.stt ? 'on' : 'off'}`);
  });
}

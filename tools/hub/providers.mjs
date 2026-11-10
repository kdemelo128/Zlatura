// Model hub providers (dev tooling, runs on the owner's computer only; never loaded by the app).
// Three kinds, all of them sanctioned routes: a command-line tool the owner is already signed in
// to ('cli'), a vendor's official HTTPS API with a key the owner created ('api'), or 'none'.
// Nothing here drives a browser, reads a cookie or signs in with the owner's account password.
import { spawn as nodeSpawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync, renameSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { usageStore } from './usage.mjs';

export const KEYS_DIR = (env = process.env) => join(env.HOME || homedir(), '.zlatura-hub');
export const KEYS_FILE = (env = process.env) => join(KEYS_DIR(env), 'keys.json');

/** Keys come from the environment or ~/.zlatura-hub/keys.json (outside the repository). */
export function readKeys(env = process.env) {
  try { return JSON.parse(readFileSync(KEYS_FILE(env), 'utf8')); } catch { return {}; }
}
export function saveKey(name, value, env = process.env) {
  if (!/^[A-Z][A-Z0-9_]{2,40}$/.test(name)) throw new Error('bad key name');
  if (typeof value !== 'string' || value.length < 8 || value.length > 400 || /\s/.test(value)) throw new Error('that does not look like a key');
  mkdirSync(KEYS_DIR(env), { recursive: true, mode: 0o700 });
  try { chmodSync(KEYS_DIR(env), 0o700); } catch { /* best effort */ }
  let current = {};
  if (existsSync(KEYS_FILE(env))) {
    try { current = JSON.parse(readFileSync(KEYS_FILE(env), 'utf8')); } catch { current = null; }
    if (!current || typeof current !== 'object' || Array.isArray(current)) throw new Error('keys file is damaged; fix or delete it');
  }
  const tmp = `${KEYS_FILE(env)}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ...current, [name]: value }), { mode: 0o600 });
  try { chmodSync(tmp, 0o600); } catch { /* best effort */ }
  renameSync(tmp, KEYS_FILE(env));
}
export const keyFor = (name, env) => env[name] || readKeys(env)[name] || null;

const MAX_REPLY = 1024 * 1024; // characters; a model reply bigger than this is refused

/** Run a CLI with the prompt on stdin. The working folder is an empty temp folder; the CLI may still be able to read files elsewhere on the computer, depending on its own sandbox. */
export function runCli({ bin, args, prompt, spawn = nodeSpawn, timeoutMs = 180000, cwd = null, signal = null }) {
  return new Promise((resolve, reject) => {
    const dir = cwd ?? mkdtempSync(join(tmpdir(), 'hub-'));
    let out = '', err = '', done = false;
    const child = spawn(bin, args, { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { if (!done) { done = true; try { child.kill(); } catch { /* gone */ } reject(new Error(`${bin} took longer than ${timeoutMs / 1000}s`)); } }, timeoutMs);
    const stop = () => { if (!done) { done = true; clearTimeout(timer); try { child.kill(); } catch { /* gone */ } reject(new Error('cancelled')); } };
    if (signal) { if (signal.aborted) queueMicrotask(stop); else signal.addEventListener('abort', stop, { once: true }); }
    child.stdout.on('data', (d) => {
      out += d;
      if (!done && out.length > MAX_REPLY) { done = true; clearTimeout(timer); try { child.kill(); } catch { /* gone */ } reject(new Error('reply too large')); }
    });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { if (!done) { done = true; clearTimeout(timer); reject(new Error(`${bin}: ${e.message}`)); } });
    child.on('close', (code) => {
      if (done) return; done = true; clearTimeout(timer);
      if (code === 0 && out.trim()) resolve(out.trim());
      else reject(new Error(`${bin} exited ${code}: ${(err || out).trim().slice(0, 300)}`));
    });
    child.stdin.end(prompt);
  });
}

/** Seconds from a Retry-After header (a number of seconds, or a date); null when absent or unreadable. */
export function parseRetryAfter(v, now = Date.now()) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  const n = /^\d+$/.test(s) ? Number(s) : (Date.parse(s) - now) / 1000;
  return Number.isFinite(n) ? Math.min(Math.max(Math.ceil(n), 0), 86400) : null;
}

async function postJson(url, headers, body, fetchFn, timeoutMs = 120000, signal = null) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener('abort', () => ctl.abort(), { once: true }); }
  try {
    const r = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    const text = await r.text();
    if (text.length > MAX_REPLY) throw new Error('reply too large');
    let json; try { json = JSON.parse(text); } catch { json = null; }
    if (!r.ok) throw Object.assign(new Error(`${r.status}: ${(json?.error?.message ?? json?.error ?? text).toString().slice(0, 300)}`), { status: r.status, retryAfterSec: parseRetryAfter(r.headers?.get?.('retry-after')) });
    return json;
  } finally { clearTimeout(t); }
}

const chat = (id, label, host, path, keyName, modelEnv, defaultModel, cost) => ({
  id, label, kind: 'api', keyName, cost,
  status: (env) => (keyFor(keyName, env) ? { state: 'ready', how: `API key set (${keyName})` } : { state: 'needs-key', how: `needs ${keyName}` }),
  async ask(prompt, { env = process.env, fetch: f = globalThis.fetch, signal, onUsage } = {}) {
    const model = env[modelEnv] || defaultModel;
    const j = await postJson(`https://${host}${path}`, { authorization: `Bearer ${keyFor(keyName, env)}` }, { model, messages: [{ role: 'user', content: prompt }] }, f, undefined, signal);
    onUsage?.({ inputTokens: j?.usage?.prompt_tokens, outputTokens: j?.usage?.completion_tokens }); // OpenAI-style usage block
    const text = j?.choices?.[0]?.message?.content;
    if (!text) throw new Error('empty reply');
    return String(text).trim();
  },
});

/** Every provider the dashboard can offer. Model names and prices are UNVERIFIED defaults; each model is overridable by env var. */
export const PROVIDERS = [
  {
    id: 'codex', label: 'Codex (GPT)', kind: 'cli', cost: 'your ChatGPT plan', workers: ['codex'],
    status: (env, have) => (have('codex') ? { state: 'ready', how: 'codex CLI found (tested on the owner\'s Mac)' } : { state: 'missing-tool', how: 'codex CLI not installed' }),
    ask: (prompt, { spawn, signal } = {}) => runCli({ bin: 'codex', args: ['exec', '--skip-git-repo-check', '-'], prompt, spawn, signal }),
  },
  {
    id: 'claude', label: 'Claude (Claude Code)', kind: 'cli', cost: 'your Claude plan', workers: ['claude-opus', 'claude-sonnet'],
    status: (env, have) => (have('claude') ? { state: 'ready', how: 'claude CLI found (untested here)' } : { state: 'missing-tool', how: 'Claude Code not installed on this Mac' }),
    ask: (prompt, { spawn, signal } = {}) => runCli({ bin: 'claude', args: ['-p'], prompt, spawn, signal }),
  },
  {
    id: 'gemini-api', label: 'Gemini', kind: 'api', keyName: 'GEMINI_API_KEY', cost: 'free key from Google AI Studio (unverified)', workers: ['gemini'],
    status: (env) => (keyFor('GEMINI_API_KEY', env) ? { state: 'ready', how: 'API key set (GEMINI_API_KEY)' } : { state: 'needs-key', how: 'needs GEMINI_API_KEY' }),
    async ask(prompt, { env = process.env, fetch: f = globalThis.fetch, signal, onUsage } = {}) {
      const model = env.HUB_GEMINI_MODEL || 'gemini-2.0-flash';
      const j = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': keyFor('GEMINI_API_KEY', env) }, { contents: [{ parts: [{ text: prompt }] }] }, f, undefined, signal);
      onUsage?.({ inputTokens: j?.usageMetadata?.promptTokenCount, outputTokens: j?.usageMetadata?.candidatesTokenCount }); // Gemini usageMetadata
      const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('');
      if (!text) throw new Error('empty reply');
      return text.trim();
    },
  },
  { ...chat('xai-api', 'Grok', 'api.x.ai', '/v1/chat/completions', 'XAI_API_KEY', 'HUB_XAI_MODEL', 'grok-3', 'paid credits likely (unverified)'), workers: ['grok'] },
  { ...chat('moonshot-api', 'Kimi', 'api.moonshot.ai', '/v1/chat/completions', 'MOONSHOT_API_KEY', 'HUB_KIMI_MODEL', 'kimi-k2-0905-preview', 'paid credits likely (unverified)'), workers: ['kimi'] },
  { ...chat('openrouter-api', 'OpenRouter (many models, one key)', 'openrouter.ai', '/api/v1/chat/completions', 'OPENROUTER_API_KEY', 'HUB_OPENROUTER_MODEL', 'meta-llama/llama-3.3-70b-instruct:free', 'free key; some models free (unverified)'), workers: [] },
  {
    // Not a chat model: its token lets the hub list, create and merge pull requests (tools/hub/github.mjs). `chat: false` keeps it out of the model lists and counts.
    id: 'github', label: 'GitHub (pull requests)', kind: 'api', chat: false, keyName: 'HUB_GITHUB_TOKEN', cost: 'free (your GitHub account)',
    status: (env) => (keyFor('HUB_GITHUB_TOKEN', env) ? { state: 'ready', how: 'token set (HUB_GITHUB_TOKEN)' } : { state: 'needs-key', how: 'needs a GitHub token' }),
    ask: async () => { throw new Error('GitHub is not a chat model'); },
  },
  {
    id: 'muse', label: 'Muse (Meta AI)', kind: 'none', cost: 'n/a', workers: ['muse'],
    status: () => ({ state: 'unavailable', how: 'no official API known; chat site only' }),
    ask: async () => { throw new Error('Muse has no official API that this hub can use'); },
  },
];
for (const p of PROVIDERS) p.workers ??= [];

/** Approximate free-tier or plan limits, for the usage bars ONLY. They are approximate, change often and are UNVERIFIED:
 *  the vendor's own page (url) is the truth. `perDay: null` means no published daily request cap that the hub can show
 *  (plan limits for Claude and ChatGPT are windows the hub cannot see; paid APIs are limited by account tier). */
export const LIMITS = {
  'gemini-api': { perDay: 1500, unit: 'requests', url: 'https://ai.google.dev/gemini-api/docs/rate-limits', note: 'Free tier, about 1,500 requests a day for a Flash model at the time of writing' },
  'openrouter-api': { perDay: 50, unit: 'requests', url: 'https://openrouter.ai/docs/api-reference/limits', note: 'Free models, about 50 requests a day without purchased credits' },
  'xai-api': { perDay: null, unit: 'requests', url: 'https://docs.x.ai/docs/models', note: 'Paid; limits depend on your account tier' },
  'moonshot-api': { perDay: null, unit: 'requests', url: 'https://platform.moonshot.ai/docs/pricing/limits', note: 'Paid; limits depend on your account tier' },
  codex: { perDay: null, unit: 'requests', url: 'https://help.openai.com/en/articles/11369540', note: 'Plan limits run in time windows that the hub cannot read' },
  claude: { perDay: null, unit: 'requests', url: 'https://support.claude.com/en/articles/11647753', note: 'Plan limits run in time windows that the hub cannot read' },
};
/** Where the owner looks at real plan usage. The hub shows a link only: there is no official way to read a Claude Pro or ChatGPT balance. UNVERIFIED pages: check each is current. */
export const PLAN_USAGE = {
  codex: { url: 'https://chatgpt.com/codex/settings/usage', label: 'Open ChatGPT Codex usage' },
  claude: { url: 'https://claude.ai/settings/usage', label: 'Open Claude plan usage' },
  'gemini-api': { url: 'https://aistudio.google.com/usage', label: 'Open Google AI Studio usage' },
  'xai-api': { url: 'https://console.x.ai', label: 'Open the xAI console' },
  'moonshot-api': { url: 'https://platform.moonshot.ai/console', label: 'Open the Moonshot console' },
  'openrouter-api': { url: 'https://openrouter.ai/activity', label: 'Open OpenRouter activity' },
};

const RATE_TEXT = /\b429\b|rate.?limit|usage limit|quota|too many requests/i;
/** Every model call goes through this wrapper, so counting happens in ONE place: chat, agents, `npm run ask`, cheap-first routing
 *  and anything added later all call `provider.ask`. Providers that cannot be asked (Muse) and the GitHub token entry are left alone.
 *  Tokens: an API reply that reports them is counted once; the CLI providers report none, so they are request-only. */
function counted(p) {
  const raw = p.ask;
  p.ask = async (prompt, ctx = {}) => {
    const store = usageStore(ctx.env ?? process.env);
    const end = store.begin(p.id);
    let tokens = {};
    const onUsage = (u) => { tokens = { inputTokens: u?.inputTokens, outputTokens: u?.outputTokens }; }; // a total, set not added: calling it twice cannot double
    try {
      const text = await raw(prompt, { ...ctx, onUsage });
      store.record(p.id, { ok: true, ...tokens });
      return text;
    } catch (e) {
      const limited = e?.status === 429 || (p.kind === 'cli' && RATE_TEXT.test(String(e?.message ?? '')));
      store.record(p.id, { ok: false, rateLimited: limited, retryAfterSec: limited ? (e?.retryAfterSec ?? null) : null });
      throw e;
    } finally { end(); }
  };
  p.counted = true;
}
for (const p of PROVIDERS) if (p.kind !== 'none' && p.chat !== false) counted(p);

/** How to connect each model through its official route. Plain text and links only, never a key. The URLs and the free-tier claims are UNVERIFIED: the owner checks each page. */
const CONNECT = {
  codex: { steps: ['Already signed in on your Mac.', 'If not: in Terminal run codex, choose Sign in with ChatGPT, then Ctrl+C twice.'], url: 'https://chatgpt.com', urlLabel: 'Open ChatGPT (check the page is current)', free: 'Uses your ChatGPT plan' },
  claude: { steps: ['Install Claude Code from the official page.', 'In Terminal run claude once and sign in with your Claude account (Pro works).'], url: 'https://docs.claude.com/en/docs/claude-code/overview', urlLabel: 'Open the Claude Code page (check the page is current)', free: 'Uses your Claude plan' },
  'gemini-api': { steps: ['Open Google AI Studio and choose Get API key (sign in with your Google account).', 'Create a key, copy it, paste it into the box below.'], url: 'https://aistudio.google.com', urlLabel: 'Open Google AI Studio (check the page is current)', free: 'Free tier key (unverified)' },
  'xai-api': { steps: ['Open the xAI console and create an API key.', 'Paste it below.'], url: 'https://console.x.ai', urlLabel: 'Open the xAI console (check the page is current)', free: 'Probably paid credits (unverified)' },
  'moonshot-api': { steps: ['Open the Moonshot platform and create an API key.', 'Paste it below.'], url: 'https://platform.moonshot.ai', urlLabel: 'Open the Moonshot platform (check the page is current)', free: 'Probably paid credits (unverified)' },
  'openrouter-api': { steps: ['Open OpenRouter and create a key (one key reaches many models, some free).', 'Paste it below. Your prompts pass through OpenRouter.'], url: 'https://openrouter.ai/keys', urlLabel: 'Open OpenRouter keys (check the page is current)', free: 'Free key; some models free (unverified)' },
  github: { steps: ['Open GitHub, then Settings, Developer settings, Personal access tokens, Fine-grained tokens, Generate new token.', 'Give it a name and an expiry, and under Repository access choose Only select repositories and pick your ONE repository.', 'Under Repository permissions set Pull requests to Read and write, Contents to Read and write (needed to merge and to update a branch), Checks to Read, Commit statuses to Read. Metadata (Read) is added for you.', 'Generate the token, copy it and paste it into the box below. The hub keeps it on this computer and never shows it again.'], url: 'https://github.com/settings/personal-access-tokens/new', urlLabel: 'Open GitHub new token page (check the page is current)', free: 'Free. Uses your GitHub account (permission names UNVERIFIED: check the page)' },
  muse: { steps: ['Meta AI has no official way for a program to use it, so the hub cannot connect it.', 'You can still use it at meta.ai yourself.'], url: null, urlLabel: '', free: 'Not available' },
};
for (const p of PROVIDERS) p.connect = CONNECT[p.id];

export const haveCommand = (bin, spawn = nodeSpawn, timeoutMs = 10000) => new Promise((resolve) => {
  let c; let settled = false;
  const end = (v) => { if (settled) return; settled = true; clearTimeout(timer); resolve(v); };
  const timer = setTimeout(() => { try { c?.kill(); } catch { /* gone */ } end(false); }, timeoutMs);
  try {
    c = spawn(bin, ['--version'], { stdio: 'ignore' });
    c.on('error', () => end(false)); c.on('close', (code) => end(code === 0));
  } catch { end(false); }
});

const STATUS_TTL = 30000;
let statusCache = null; // { at, found } : which CLIs exist, kept 30 s so a page refresh does not start two processes every time

/** Status of every provider (never includes a key). */
export async function statuses({ env = process.env, spawn = nodeSpawn, now = Date.now(), probeMs = 10000 } = {}) {
  const bins = ['codex', 'claude'];
  if (!statusCache || now - statusCache.at >= STATUS_TTL || now < statusCache.at || statusCache.spawn !== spawn) {
    const found = Object.fromEntries(await Promise.all(bins.map(async (b) => [b, await haveCommand(b, spawn, probeMs)])));
    statusCache = { at: now, found, spawn };
  }
  const have = (b) => !!statusCache.found[b];
  return PROVIDERS.map((p) => ({ id: p.id, label: p.label, chat: p.chat !== false, kind: p.kind, cost: p.cost, keyName: p.keyName ?? null, ...p.status(env, have) }));
}
void existsSync;

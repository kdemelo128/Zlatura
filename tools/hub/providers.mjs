// Model hub providers (dev tooling, runs on the owner's computer only; never loaded by the app).
// Three kinds, all of them sanctioned routes: a command-line tool the owner is already signed in
// to ('cli'), a vendor's official HTTPS API with a key the owner created ('api'), or 'none'.
// Nothing here drives a browser, reads a cookie or signs in with the owner's account password.
import { spawn as nodeSpawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync, renameSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

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
export function runCli({ bin, args, prompt, spawn = nodeSpawn, timeoutMs = 180000, cwd = null }) {
  return new Promise((resolve, reject) => {
    const dir = cwd ?? mkdtempSync(join(tmpdir(), 'hub-'));
    let out = '', err = '', done = false;
    const child = spawn(bin, args, { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { if (!done) { done = true; try { child.kill(); } catch { /* gone */ } reject(new Error(`${bin} took longer than ${timeoutMs / 1000}s`)); } }, timeoutMs);
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

async function postJson(url, headers, body, fetchFn, timeoutMs = 120000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    const text = await r.text();
    if (text.length > MAX_REPLY) throw new Error('reply too large');
    let json; try { json = JSON.parse(text); } catch { json = null; }
    if (!r.ok) throw new Error(`${r.status}: ${(json?.error?.message ?? json?.error ?? text).toString().slice(0, 300)}`);
    return json;
  } finally { clearTimeout(t); }
}

const chat = (id, label, host, path, keyName, modelEnv, defaultModel, cost) => ({
  id, label, kind: 'api', keyName, cost,
  status: (env) => (keyFor(keyName, env) ? { state: 'ready', how: `API key set (${keyName})` } : { state: 'needs-key', how: `needs ${keyName}` }),
  async ask(prompt, { env = process.env, fetch: f = globalThis.fetch } = {}) {
    const model = env[modelEnv] || defaultModel;
    const j = await postJson(`https://${host}${path}`, { authorization: `Bearer ${keyFor(keyName, env)}` }, { model, messages: [{ role: 'user', content: prompt }] }, f);
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
    ask: (prompt, { spawn } = {}) => runCli({ bin: 'codex', args: ['exec', '--skip-git-repo-check', '-'], prompt, spawn }),
  },
  {
    id: 'claude', label: 'Claude (Claude Code)', kind: 'cli', cost: 'your Claude plan', workers: ['claude-opus', 'claude-sonnet'],
    status: (env, have) => (have('claude') ? { state: 'ready', how: 'claude CLI found (untested here)' } : { state: 'missing-tool', how: 'Claude Code not installed on this Mac' }),
    ask: (prompt, { spawn } = {}) => runCli({ bin: 'claude', args: ['-p'], prompt, spawn }),
  },
  {
    id: 'gemini-api', label: 'Gemini', kind: 'api', keyName: 'GEMINI_API_KEY', cost: 'free key from Google AI Studio (unverified)', workers: ['gemini'],
    status: (env) => (keyFor('GEMINI_API_KEY', env) ? { state: 'ready', how: 'API key set (GEMINI_API_KEY)' } : { state: 'needs-key', how: 'needs GEMINI_API_KEY' }),
    async ask(prompt, { env = process.env, fetch: f = globalThis.fetch } = {}) {
      const model = env.HUB_GEMINI_MODEL || 'gemini-2.0-flash';
      const j = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': keyFor('GEMINI_API_KEY', env) }, { contents: [{ parts: [{ text: prompt }] }] }, f);
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

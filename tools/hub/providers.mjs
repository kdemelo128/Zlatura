// Model hub providers (dev tooling, runs on the owner's computer only; never loaded by the app).
// Three kinds, all of them sanctioned routes: a command-line tool the owner is already signed in
// to ('cli'), a vendor's official HTTPS API with a key the owner created ('api'), or 'none'.
// Nothing here drives a browser, reads a cookie or signs in with the owner's account password.
import { spawn as nodeSpawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
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
  const all = { ...readKeys(env), [name]: value };
  writeFileSync(KEYS_FILE(env), JSON.stringify(all), { mode: 0o600 });
  try { chmodSync(KEYS_FILE(env), 0o600); } catch { /* best effort */ }
}
const keyFor = (name, env) => env[name] || readKeys(env)[name] || null;

/** Run a CLI with the prompt on stdin, in an empty temp folder so it cannot see any project files. */
export function runCli({ bin, args, prompt, spawn = nodeSpawn, timeoutMs = 180000, cwd = null }) {
  return new Promise((resolve, reject) => {
    const dir = cwd ?? mkdtempSync(join(tmpdir(), 'hub-'));
    let out = '', err = '', done = false;
    const child = spawn(bin, args, { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { if (!done) { done = true; try { child.kill(); } catch { /* gone */ } reject(new Error(`${bin} took longer than ${timeoutMs / 1000}s`)); } }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
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
  {
    id: 'muse', label: 'Muse (Meta AI)', kind: 'none', cost: 'n/a', workers: ['muse'],
    status: () => ({ state: 'unavailable', how: 'no official API known; chat site only' }),
    ask: async () => { throw new Error('Muse has no official API that this hub can use'); },
  },
];
for (const p of PROVIDERS) p.workers ??= [];

export const haveCommand = (bin, spawn = nodeSpawn) => new Promise((resolve) => {
  try {
    const c = spawn(bin, ['--version'], { stdio: 'ignore' });
    c.on('error', () => resolve(false)); c.on('close', (code) => resolve(code === 0));
  } catch { resolve(false); }
});

/** Status of every provider (never includes a key). */
export async function statuses({ env = process.env, spawn = nodeSpawn } = {}) {
  const bins = ['codex', 'claude'];
  const found = Object.fromEntries(await Promise.all(bins.map(async (b) => [b, await haveCommand(b, spawn)])));
  const have = (b) => !!found[b];
  return PROVIDERS.map((p) => ({ id: p.id, label: p.label, kind: p.kind, cost: p.cost, keyName: p.keyName ?? null, ...p.status(env, have) }));
}
void existsSync;

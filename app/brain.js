/* brain.js -- Monal's own language model, on the device (docs/proposals/on-device-brain.md).
 *
 * An open model (Qwen3, Apache-2.0) is downloaded once, when the broker turns it on in Settings, and runs on the
 * device's graphics chip through WebLLM (vendor/web-llm-0.2.87/) in a Web Worker (brainworker.js). Nothing is
 * downloaded or loaded until then; nothing a broker types leaves the device. The model never makes a figure: the
 * helpers here keep it honest (blank facts are "not given", never zero; a figure in an answer that is not in the
 * facts is found by numberCheck and marked). The state machine (off, checking, unsupported, downloading, ready,
 * removed) and the engine are separate, so tests give it a stub engine and nothing is downloaded.
 *
 * Test-only seam: when window.__monalBrainTest exists (a browser flow sets it with addInitScript), its `factory`
 * replaces the real engine and its `gpu` replaces navigator.gpu. Nothing in the app sets it. */

import { QUESTIONS } from './assistant.js';
import { PRODUCT } from './brand.js';

/** @typedef {{ id: string, label: string, size: string, licence: string, minMB: number, note: string }} BrainModel */
/** @typedef {{ load: (modelId: string, onProgress: (p: number) => void) => Promise<void>, chat: (messages: {role: string, content: string}[], opts: { think: boolean, onToken?: (textSoFar: string) => void }) => Promise<string>, has: (modelId: string) => Promise<boolean>, remove: (modelId: string) => Promise<void>, terminate: () => void }} BrainEngine */
/** @typedef {{ phase: 'off' | 'checking' | 'unsupported' | 'downloading' | 'ready' | 'removed', model: string, progress: number, why: string }} BrainState */

/** The three sizes. `minMB` is WebLLM's own figure for the graphics memory the model needs; `size` is the download, approximate. */
/** @type {BrainModel[]} */
export const MODELS = [
  { id: 'Qwen3-0.6B-q4f16_1-MLC', label: 'Small', size: 'about 0.4 GB download', licence: 'Apache-2.0', minMB: 1403, note: 'For phones and older laptops. Quick, and the least careful.' },
  { id: 'Qwen3-1.7B-q4f16_1-MLC', label: 'Standard', size: 'about 1 GB download', licence: 'Apache-2.0', minMB: 2037, note: 'For most laptops and desktops.' },
  { id: 'Qwen3-4B-q4f16_1-MLC', label: 'Large', size: 'about 2.3 GB download', licence: 'Apache-2.0', minMB: 3432, note: 'For strong desktops. The most careful, and slower.' },
];
export const DEFAULT_MODEL = MODELS[1].id;
export const KEY = 'monal.brain';
const LIB = new URL('../vendor/web-llm-0.2.87/web-llm.js', import.meta.url).href;

const hook = () => /** @type {any} */ (globalThis).__monalBrainTest || null;
export const modelById = (id) => MODELS.find((m) => m.id === id) || MODELS[1];

/* ------------------------------------------------------------- support */

/**
 * Can this device run the chosen model? A rough guide from what the browser says: WebGPU present, a graphics adapter
 * with 16-bit shader support (the q4f16 models need it), a largest buffer of at least half the model's memory figure,
 * and (where the browser reports it) enough device memory. `env` is { gpu, ua, deviceMemory }.
 * @param {string} modelId
 * @param {{ gpu?: any, ua?: string, deviceMemory?: number } | null} [env]
 * @returns {Promise<{ ok: boolean, why: string }>}
 */
export async function support(modelId, env = null) {
  const e = env || realEnv();
  const m = modelById(modelId);
  if (!e.gpu) {
    const phone = /iPhone|iPad|iPod/.test(e.ua || '');
    return { ok: false, why: phone
      ? `This browser does not offer WebGPU. On an iPhone or iPad it needs iOS 26 or later, in Safari. Until then ${PRODUCT} answers with the built-in front desk, which works offline.`
      : `This browser does not offer WebGPU, which the brain needs. A recent Chrome, Edge or Safari 26 on a laptop or desktop does. ${PRODUCT} keeps answering with the built-in front desk.` };
  }
  let adapter = null;
  try { adapter = await e.gpu.requestAdapter(); } catch { adapter = null; }
  if (!adapter) return { ok: false, why: 'This device has a WebGPU browser but no graphics adapter it can use, so the brain cannot run here.' };
  if (adapter.features && typeof adapter.features.has === 'function' && !adapter.features.has('shader-f16')) {
    return { ok: false, why: 'This device’s graphics chip cannot do the 16-bit maths these models use, so the brain cannot run here.' };
  }
  const maxBuf = adapter.limits && Number(adapter.limits.maxBufferSize);
  if (Number.isFinite(maxBuf) && maxBuf > 0 && maxBuf / 1048576 < m.minMB / 2) {
    return { ok: false, why: `This device’s graphics memory looks too small for the ${m.label} size (it needs about ${(m.minMB / 1024).toFixed(1)} GB).${m.id !== MODELS[0].id ? ' The Small size may fit.' : ''}` };
  }
  if (typeof e.deviceMemory === 'number' && e.deviceMemory * 1024 < m.minMB * 1.5) {
    return { ok: false, why: `This device reports ${e.deviceMemory} GB of memory, too little for the ${m.label} size (about ${(m.minMB / 1024).toFixed(1)} GB of graphics memory).${m.id !== MODELS[0].id ? ' The Small size may fit.' : ''}` };
  }
  return { ok: true, why: `This device can run the ${m.label} size.` };
}

function realEnv() {
  const h = hook();
  const nav = typeof navigator === 'undefined' ? /** @type {any} */ ({}) : /** @type {any} */ (navigator);
  return { gpu: h && 'gpu' in h ? h.gpu : nav.gpu, ua: nav.userAgent || '', deviceMemory: h && 'deviceMemory' in h ? h.deviceMemory : nav.deviceMemory };
}

/* ------------------------------------------------------------- the real engine */

/** The WebLLM engine in a module Web Worker. The library is imported here, when this is called, and never before. @returns {Promise<BrainEngine>} */
async function realFactory() {
  const lib = await import(LIB);
  /** @type {Worker | null} */
  let worker = null;
  let engine = null;
  return {
    async load(modelId, onProgress) {
      worker = new Worker(new URL('./brainworker.js', import.meta.url), { type: 'module' });
      engine = await lib.CreateWebWorkerMLCEngine(worker, modelId, { initProgressCallback: (r) => onProgress(Math.max(0, Math.min(1, Number(r && r.progress) || 0))) });
    },
    async chat(messages, { think, onToken }) {
      if (!engine) throw new Error('The brain is not loaded.');
      const body = { messages, temperature: 0.3, extra_body: { enable_thinking: !!think } };
      if (!onToken) {
        const r = await engine.chat.completions.create({ ...body, stream: false });
        return stripThinking((r.choices[0] && r.choices[0].message && r.choices[0].message.content) || '');
      }
      // streamed: each chunk adds a piece of text; the caller is told the answer so far
      let text = '';
      for await (const chunk of await engine.chat.completions.create({ ...body, stream: true })) {
        text += (chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) || '';
        onToken(text);
      }
      return stripThinking(text);
    },
    has: (modelId) => lib.hasModelInCache(modelId),
    remove: (modelId) => lib.deleteModelAllInfoInCache(modelId),
    terminate() { if (worker) worker.terminate(); worker = null; engine = null; },
  };
}

/** The answer so far while it streams: nothing while an opened <think> is still unclosed. @param {string} text */
export function visibleText(text) {
  const t = String(text ?? '');
  const i = t.lastIndexOf('<think>');
  return i >= 0 && t.indexOf('</think>', i) < 0 ? '' : stripThinking(t);
}

/** Qwen3 writes its thinking inside <think>…</think>; only what follows is the answer. @param {string} text */
export function stripThinking(text) {
  return String(text ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*<\/think>/, '').trim();
}

/* ------------------------------------------------------------- the state machine */

const readChoice = () => { try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); return j && typeof j === 'object' ? j : {}; } catch { return {}; } };
const writeChoice = (c) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* private mode or full: the choice is not kept */ } };

/**
 * The brain for this device. off -> checking -> unsupported | downloading(progress 0..1, cancellable) -> ready -> removed.
 * The choice (the size, and whether it was turned on) is kept in localStorage under 'monal.brain': a device preference.
 * A ready brain is only loaded into the graphics chip on the first question (from the browser's cache, no network).
 * @param {{ factory?: () => Promise<BrainEngine>, env?: () => any, storage?: { read: () => any, write: (c: any) => void } }} [opts]
 */
export function createBrain({ factory, env, storage } = {}) {
  const store = storage || { read: readChoice, write: writeChoice };
  const makeEngine = () => (factory ? factory() : hook() && hook().factory ? hook().factory() : realFactory());
  const saved = store.read();
  /** @type {BrainState} */
  let state = {
    phase: saved.on === true ? 'ready' : 'off',
    model: MODELS.some((m) => m.id === saved.model) ? saved.model : DEFAULT_MODEL,
    progress: saved.on === true ? 1 : 0, why: '',
  };
  /** @type {Set<(s: BrainState) => void>} */
  const subs = new Set();
  /** @type {BrainEngine | null} */
  let engine = null;
  let loaded = false;     // the model is in the graphics chip, not only in the cache
  let run = 0;            // a cancelled or replaced download is ignored when it finishes
  const set = (patch) => { state = { ...state, ...patch }; for (const f of subs) f(state); };

  const ensureEngine = async () => { if (!engine) engine = await makeEngine(); return engine; };
  const drop = () => { if (engine) { try { engine.terminate(); } catch { /* already gone */ } } engine = null; loaded = false; };

  return {
    get state() { return state; },
    /** @param {(s: BrainState) => void} fn @returns {() => void} */
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    /** Pick a size (kept). Not while a download is running. */
    choose(modelId) {
      if (state.phase === 'downloading' || state.phase === 'checking') return;
      if (!MODELS.some((m) => m.id === modelId) || modelId === state.model) return;
      // a different size is a different download: a ready brain of the old size stays on disk until removed
      const wasReady = state.phase === 'ready';
      if (wasReady) drop();
      store.write({ model: modelId, on: false });
      set({ model: modelId, phase: 'off', progress: 0, why: '' });
    },
    /** The support check for the chosen size, without starting anything. */
    check() { return support(state.model, env ? env() : null); },
    /** Turn it on: check the device, then download. */
    async turnOn() {
      if (state.phase === 'downloading' || state.phase === 'checking') return;
      const me = ++run;
      set({ phase: 'checking', progress: 0, why: '' });
      const s = await support(state.model, env ? env() : null);
      if (me !== run) return;
      if (!s.ok) { set({ phase: 'unsupported', why: s.why }); return; }
      await this.load(state.model, null, me);
    },
    /**
     * Download (or, if already in the cache, open) a model and make it ready. `onProgress` gets 0..1.
     * @param {string} modelId @param {((p: number) => void) | null} [onProgress] @param {number} [token]
     */
    async load(modelId, onProgress = null, token = ++run) {
      set({ phase: 'downloading', model: modelId, progress: 0, why: '' });
      try {
        const e = await ensureEngine();
        if (token !== run) return;
        await e.load(modelId, (p) => { if (token !== run) return; set({ progress: p }); if (onProgress) onProgress(p); });
        if (token !== run) { drop(); return; }
        loaded = true;
        store.write({ model: modelId, on: true });
        set({ phase: 'ready', progress: 1, why: '' });
      } catch (err) {
        if (token !== run) return;
        drop();
        set({ phase: 'off', progress: 0, why: `The download did not finish (${String(err && /** @type {any} */ (err).message || err).slice(0, 120)}). Nothing was kept; you can try again.` });
      }
    },
    /** Stop a download. Whatever was fetched stays in the browser's cache, so a second try carries on. */
    cancel() {
      if (state.phase !== 'downloading' && state.phase !== 'checking') return;
      run += 1;
      drop();
      set({ phase: 'off', progress: 0, why: 'Cancelled. Nothing is turned on.' });
    },
    /** Delete the model's files from the browser and turn the brain off. */
    async remove(modelId = state.model) {
      run += 1;
      try { const e = await ensureEngine(); await e.remove(modelId); } catch { /* nothing cached, or the library will not load: the choice is cleared anyway */ }
      drop();
      store.write({ model: state.model, on: false });
      set({ phase: 'removed', progress: 0, why: '' });
    },
    /**
     * Ask the model. @param {{ role: string, content: string }[]} messages @param {{ think?: boolean, onToken?: (textSoFar: string) => void }} [opts]
     * @returns {Promise<string>}
     */
    async chat(messages, { think = false, onToken } = {}) {
      if (state.phase !== 'ready') throw new Error('The brain is not turned on.');
      const e = await ensureEngine();
      if (!loaded) {
        try { await e.load(state.model, () => {}); } catch (err) {
          // the files are gone from the browser's cache, or the graphics chip refused: back to off, with the reason
          drop();
          set({ phase: 'off', progress: 0, why: `The brain could not start (${String(err && /** @type {any} */ (err).message || err).slice(0, 120)}). Turn it on again in Settings.` });
          throw err;
        }
        loaded = true;
      }
      return e.chat(messages, { think: !!think, onToken });
    },
    /** True once the model is in the graphics chip (the first question after a page load takes longer). */
    get loaded() { return loaded; },
  };
}

/** The one brain of this page. */
export const brain = createBrain();

/* ------------------------------------------------------------- the facts, as the model is told them */

/**
 * The deal's facts as numbered lines for the model. A blank or missing value is written "not given", never zero.
 * @param {{ id?: string, label: string, value: any, source?: string }[] | null | undefined} facts
 */
export function factsText(facts) {
  if (!Array.isArray(facts) || !facts.length) return 'No deal facts are given.';
  return facts.map((f, i) => {
    const v = f && f.value;
    const blank = v === null || v === undefined || (typeof v === 'string' && !v.trim()) || (typeof v === 'number' && !Number.isFinite(v));
    return `${(f && f.id) || `f${i + 1}`}. ${(f && f.label) || 'Item'}: ${blank ? 'not given' : String(v)}${f && f.source && !blank ? ` (${f.source})` : ''}`;
  }).join('\n');
}

/* ------------------------------------------------------------- understanding the question */

/** What each front-desk task needs before it can run: input name -> the words used to ask for it. A task not listed needs nothing. */
export const TASK_INPUTS = {
  cap_at_price: { price: 'the price' },
  price_for_cap: { cap: 'the cap rate' },
  commission: { price: 'the price' },
  glossary: { term: 'the term' },
  metric: { metric: 'which figure' },
  task: { title: 'what the task is' },
  set_figure: { field: 'which figure', value: 'the new value' },
  set_stage: { stage: 'which stage' },
  next_step: { text: 'what the next step is' },
  add_contact: { name: 'the contact’s name' },
  add_note: { text: 'what the note says' },
  open: { name: 'what to open' },
  doc_ask: { question: 'what to look for' },
};

/**
 * The instructions that make the model map a question to one of the front desk's tasks, as JSON.
 * @param {{ id: string, title: string, example?: string }[]} [tasks] the front desk's task list (QUESTIONS in assistant.js)
 */
export function taskPrompt(tasks = QUESTIONS) {
  const lines = tasks.map((t) => {
    const need = TASK_INPUTS[t.id] ? ` Inputs: ${Object.keys(TASK_INPUTS[t.id]).join(', ')}.` : '';
    return `- ${t.id}: ${t.title}.${need}${TASK_HINTS[t.id] ? ` ${TASK_HINTS[t.id]}` : ''}${t.example ? ` Example: "${t.example}"` : ''}`;
  });
  return [
    'You match a real estate broker’s question to one task. The tasks are calculated by the app, not by you.',
    'Answer with one line of JSON and nothing else: {"task": "<task id>", "inputs": {"<name>": <value>}}.',
    'Use only the inputs the broker actually gave, with numbers written as plain numbers (4600000, not $4.6M). Never guess an input: leave it out.',
    'If no task fits, answer {"task": "none"}.',
    'Tasks:', ...lines,
  ].join('\n');
}

const blank = (v) => v === null || v === undefined || (typeof v === 'string' && !v.trim()) || (typeof v === 'number' && !Number.isFinite(v));

/**
 * Read the model's answer to taskPrompt. `{ ok: true, task, inputs }` for a task that can run; `{ ok: true, task: null }`
 * when the model says none fits (it should answer in words); otherwise `{ ok: false, reason, ask }` with a plain
 * sentence saying what is missing. A blank input is missing, never zero.
 * @param {string} text @param {{ id: string }[]} [tasks]
 * @returns {{ ok: true, task: string | null, inputs: Record<string, any> } | { ok: false, reason: 'bad-json' | 'unknown-task' | 'missing-inputs', ask: string, missing?: string[] }}
 */
export function parseTask(text, tasks = QUESTIONS) {
  const body = stripThinking(text).replace(/```(?:json)?/gi, '');
  const a = body.indexOf('{');
  const z = body.lastIndexOf('}');
  let j = null;
  if (a >= 0 && z > a) { try { j = JSON.parse(body.slice(a, z + 1)); } catch { j = null; } }
  if (!j || typeof j !== 'object' || Array.isArray(j) || typeof j.task !== 'string') {
    return { ok: false, reason: 'bad-json', ask: 'I could not tell what you want done. Could you say it another way?' };
  }
  const id = j.task.trim();
  if (id === 'none' || id === '') return { ok: true, task: null, inputs: {} };
  if (!tasks.some((t) => t.id === id)) return { ok: false, reason: 'unknown-task', ask: 'That is not something I can calculate. Could you say it another way?' };
  const inputs = j.inputs && typeof j.inputs === 'object' && !Array.isArray(j.inputs) ? j.inputs : {};
  const need = TASK_INPUTS[id] || {};
  const missing = Object.keys(need).filter((k) => blank(inputs[k]));
  if (missing.length) return { ok: false, reason: 'missing-inputs', missing, ask: `I need ${missing.map((k) => need[k]).join(' and ')} to do that. What is ${missing.length > 1 ? 'each' : 'it'}?` };
  return { ok: true, task: id, inputs };
}

/* ------------------------------------------------------------- the number check */

const SCALE = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9 };
// money, percents and plain numbers, with an optional $ and K/M/B or word suffix; (1,200) is a negative in the app's statements
const NUM = /(^|[^A-Za-z0-9_.,])(\$)?\(?(\d(?:[\d,]*\d)?(?:\.\d+)?)\)?\s?(%|percent\b|thousand\b|million\b|billion\b|[kKmMbB]\b)?/g;

/**
 * Every figure in `text`: { raw, value (absolute), decimals, scale, kind }. Years 1900-2100 and list numbering are not figures;
 * nor are fact ids (f12), dates, or a bare one-digit number. @param {string} text
 */
function figuresIn(text) {
  const t = String(text ?? '')
    .replace(/^\s*\d+[.)]\s/gm, ' ')
    .replace(/\bf\d+\b/g, ' ')
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' ');
  const out = [];
  for (const m of t.matchAll(NUM)) {
    const digits = m[3];
    const unit = (m[4] || '').toLowerCase();
    const money = !!m[2];
    const [int, dec = ''] = digits.replace(/,/g, '').split('.');
    const plain = !money && !unit;
    if (plain && /^(19|20)\d\d$/.test(digits) && !dec && !digits.includes(',')) continue;
    if (plain && int.length < 2) continue;
    const kind = unit === '%' || unit === 'percent' ? 'pct' : money ? 'money' : 'plain';
    const scale = SCALE[unit] || 1;
    out.push({ raw: m[0].slice(m[1].length).trim(), value: Math.abs(Number(`${int}.${dec || '0'}`)), decimals: dec.length, scale, kind });
  }
  return out;
}

/**
 * The figures in a model's answer that are not in `allowed` (the facts and task results: strings or numbers). Tolerant of
 * formatting ($1,200,000, 1.2M, 1200000; 6.1%, 6.10%) and of rounding to the precision the answer states (1.2M for 1,234,567).
 * @param {string} answer @param {(string | number)[]} allowed @returns {string[]}
 */
export function numberCheck(answer, allowed) {
  const known = [];
  for (const a of allowed || []) {
    if (typeof a === 'number' && Number.isFinite(a)) known.push(Math.abs(a));
    else for (const f of figuresIn(`${a}`)) known.push(f.value * f.scale);
    // single digits and years inside a fact are still facts: a model may repeat them
    for (const m of `${a}`.matchAll(/\d[\d,]*(?:\.\d+)?/g)) known.push(Math.abs(Number(m[0].replace(/,/g, ''))));
  }
  const bad = [];
  for (const f of figuresIn(answer)) {
    const tol = 0.5 * 10 ** -f.decimals * f.scale + 1e-9;
    const target = f.value * f.scale;
    const hit = known.some((v) => Math.abs(v - target) <= tol * (1 + 1e-12) || Math.abs(v - target) < 1e-6);
    if (!hit) bad.push(f.raw);
  }
  return bad;
}

/* ------------------------------------------------------------- from the model's task to the front desk's question */

/** The front desk's tasks the brain may name: the ones that answer from the deal. The tasks that change a deal, and the ones that
 * need a document's text, are left out: the broker's own words already went to the front desk, which asks before it changes anything. */
export const BRAIN_TASK_IDS = ['cap_at_price', 'price_for_cap', 'dscr', 'expiries', 'walt', 'missing', 'review', 'comps', 'breakeven', 'commission', 'metric', 'summary', 'notes', 'glossary', 'open', 'help'];
export const BRAIN_TASKS = QUESTIONS.filter((q) => BRAIN_TASK_IDS.includes(q.id));
/** The values the model may give, for the prompt. */
export const METRIC_KEYS = ['noiPsf', 'ppsf', 'perUnit', 'expenseRatio', 'cashOnCash', 'cashFlow', 'equity', 'occ', 'cap', 'noi', 'price'];
const DSCR_KEYS = ['dscr', 'debtService', 'debtYield', 'maxLoan', 'loan'];
export const TASK_HINTS = {
  price_for_cap: 'cap is a percent number, for example 7 for 7%.',
  metric: `metric is one of ${METRIC_KEYS.join(', ')}.`,
  dscr: `Optional which: ${DSCR_KEYS.join(', ')}.`,
  expiries: 'Optional year, for example 2027.',
  glossary: 'term is the word to explain, for example "DSCR".',
  open: 'name is the screen to open, for example "the rent roll".',
};

/**
 * The question the front desk's `answer()` takes (the shape `understand()` returns) for a task the model named, with the model's
 * inputs put where `understand()` puts them. A figure the model gave outside what a broker would mean (a cap rate under 1, which could
 * be 7% or 0.07) is asked about, never chosen. `understand` is the front desk's own parser, passed in for the words-only tasks.
 * @param {string} task @param {Record<string, any>} inputs @param {(raw: string) => any} understand
 * @returns {{ ok: true, q: any } | { ok: false, ask: string }}
 */
export function taskToQuestion(task, inputs, understand) {
  const num = (v) => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : null; };
  const str = (v) => (typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, 80) : '');
  switch (task) {
    case 'cap_at_price': {
      const price = num(inputs.price);
      if (price === null || price <= 0) return { ok: false, ask: 'What price, in dollars? For example $4.6M.' };
      return { ok: true, q: { id: 'cap_at_price', price, ambiguous: null } };
    }
    case 'commission': {
      const price = num(inputs.price);
      if (price === null || price <= 0) return { ok: false, ask: 'What price, in dollars? For example $4.6M.' };
      return { ok: true, q: { id: 'commission', price, ambiguous: null } };
    }
    case 'price_for_cap': {
      const cap = num(inputs.cap);
      if (cap === null || cap <= 0) return { ok: false, ask: 'What cap rate? For example 7%.' };
      if (cap < 1) return { ok: false, ask: `Do you mean a ${(cap * 100).toFixed(2).replace(/\.?0+$/, '')}% cap rate, or ${cap}%? Say it with a % sign, such as 7%.` };
      return { ok: true, q: { id: 'price_for_cap', cap } };
    }
    case 'metric': {
      const metric = str(inputs.metric);
      if (!METRIC_KEYS.includes(metric)) return { ok: false, ask: 'Which figure: price, NOI, cap rate, price per SF, occupancy, equity or cash-on-cash?' };
      return { ok: true, q: { id: 'metric', metric } };
    }
    case 'dscr': return { ok: true, q: { id: 'dscr', which: DSCR_KEYS.includes(str(inputs.which)) ? str(inputs.which) : 'dscr' } };
    case 'expiries': {
      const y = num(inputs.year);
      return { ok: true, q: { id: 'expiries', year: y !== null && y >= 1900 && y <= 2100 ? Math.round(y) : null } };
    }
    case 'glossary': case 'open': {
      const word = str(task === 'open' ? inputs.name : inputs.term);
      if (!word) return { ok: false, ask: task === 'open' ? 'What should I open?' : 'Which term should I explain?' };
      const q = understand(task === 'open' ? `open ${word}` : `explain ${word}`);
      return q && q.id === task && (task !== 'glossary' || q.term) ? { ok: true, q } : { ok: false, ask: task === 'open' ? `I don’t have a screen called “${word}”.` : `I don’t have “${word}” in my glossary.` };
    }
    case 'walt': case 'missing': case 'review': case 'comps': case 'breakeven': case 'summary': case 'notes': case 'help': return { ok: true, q: { id: task } };
    default: return { ok: false, ask: 'That is not something I can calculate here.' };
  }
}

/* ------------------------------------------------------------- talking */

/** The system prompt for a free answer: plain words, the deal's facts as the only source of deal figures. @param {string} facts factsText(...) */
export function talkPrompt(facts) {
  return [
    'You are an assistant for a commercial real estate broker, running on the broker’s own device. Answer in short, plain English.',
    'For anything about the open deal, use only the facts below. If a fact is not there, or says "not given", say you do not have it; never guess.',
    'Do not calculate with the deal’s figures and do not make up any figure: the app calculates those. You may explain terms, draft emails and follow-up notes, and compare in words.',
    'Facts about the open deal:', facts,
  ].join('\n');
}

/**
 * `text` cut into pieces, the ones that are `bad` figures (from numberCheck) marked, so the page can wrap them. Each bad figure is
 * marked wherever it appears. @param {string} text @param {string[]} bad @returns {{ text: string, bad: boolean }[]}
 */
export function splitByFigures(text, bad) {
  const t = String(text ?? '');
  const hits = [];
  for (const b of new Set(bad || [])) {
    if (!b) continue;
    for (let i = t.indexOf(b); i >= 0; i = t.indexOf(b, i + b.length)) hits.push([i, i + b.length]);
  }
  hits.sort((x, y) => x[0] - y[0]);
  const out = [];
  let at = 0;
  for (const [a, z] of hits) {
    if (a < at) continue;
    if (a > at) out.push({ text: t.slice(at, a), bad: false });
    out.push({ text: t.slice(a, z), bad: true });
    at = z;
  }
  if (at < t.length) out.push({ text: t.slice(at), bad: false });
  return out;
}

/* assistantui.js -- Monal, the on-device assistant: the bird button and the panel.
 *
 * One bird button on every screen (hidden inside the full-screen Underwrite tool, whose own bird opens it with the tool's step and its nest tips as suggested questions), opening a calm dialog: a bottom sheet on a phone, a panel in the corner on a desk.
 * A question is understood (assistant.js) and answered (assistantanswer.js) on this device; this file only
 * draws the result. Everything is drawn as text nodes: no HTML from a question, a deal or a document ever
 * reaches the page. The assistant makes no network request of its own: only when the firm's AI is on, and the question
 * has no on-device answer or the broker taps "Ask with the web", does it send the question (askweb.js decides what goes with it). Anything that changes something (a task) is
 * shown first, as a before and after list, waits for a yes of its own and offers Undo. A task, next step or contact
 * goes through crm.js (the path Home and the deal's Pipeline card use); a figure, stage, note, scenario or export
 * through dealui.js assistantApply, which uses the deal screen's own functions. */

import { el, openSheet, closeSheet, backdropCloses } from './kit.js';
import { PRODUCT, installBrand } from './brand.js';
import { understand, suggestions } from './assistant.js';
import { answer } from './assistantanswer.js';
import { dealForAssistant, dealForAsk, assistantGo, assistantApply, warmDealDocs } from './dealui.js';
import * as ai from './ai.js';
import { brain, BRAIN_TASKS, taskPrompt, parseTask, taskToQuestion, talkPrompt, factsText, numberCheck, splitByFigures, visibleText } from './brain.js';
import { planAsk, safeBlocks, errorText, FROM_AI } from './askweb.js';
import { pageText } from './docsession.js';
import { splitTips } from './assistanttips.js';
import { addTask, deleteTask, updateTask, saveContact, deleteContact, listTasks, listContacts, log as crmLog } from './crm.js';

let view = 'home';
let dlg = null;
let fab = null;
let log = null;
let input = null;
let chips = null;
let live = null;
let reading = null;   // the quiet "Reading your documents…" line
let webBtn = null;
let subEl = null;
let thinkRow = null;
let thinkBox = null;
/** The brain's questions and answers of this session (the last six turns), so a follow-up makes sense. */
let brainHistory = [];
let brainBusy = false;
const SUB = 'From your deal, its documents (their text is kept on this device), and the app’s own calculations. Nothing leaves this device.';
/** The web questions and answers of this session, for the server's context (at most 8 turns). */
let webHistory = [];
let webDeal = null;
/** The Underwrite tool's step and nest tips while the tool's bird has the panel open: { step, tips, run } (assistanttips.js); null otherwise. */
let toolCtx = null;

const btn = (cls, text, fn) => { const b = el('button', `btn ${cls}`.trim(), text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; };

/** Close the panel, let the history settle, then go (the same wait as the deal's section jump). */
async function leave() {
  const hadEntry = !!(history.state && history.state.sheet);
  closeSheet(dlg);
  if (hadEntry) await new Promise((resolve) => { const t = setTimeout(() => resolve(undefined), 400); window.addEventListener('popstate', () => { clearTimeout(t); resolve(undefined); }, { once: true }); });
  await new Promise((resolve) => setTimeout(() => resolve(undefined), 0));
}
async function leaveAndGo(go) { await leave(); assistantGo(go); }

function goButton(label, go, aria) {
  const b = btn('btn-sm btn-gray assist-go', label, () => leaveAndGo(go));
  if (aria) b.setAttribute('aria-label', aria);
  return b;
}


/** The page of a document as this session read it, with the quoted passage marked: text nodes only. */
function openPage(p) {
  const pg = dealPage(p);
  const d = el('dialog', 'sheet assist-page');
  d.setAttribute('aria-labelledby', 'assist-page-h');
  const card = el('div', 'sheet-card');
  const head = el('div', 'sheet-head');
  const hd = el('div');
  hd.appendChild(el('div', 'eyebrow', p.docName));
  const h = el('h2', null, `Page ${p.page}${p.pages ? ` of ${p.pages}` : ''}`);
  h.id = 'assist-page-h';
  hd.appendChild(h);
  hd.appendChild(el('p', 'sub', `The text of the page as read on this device; the passage ${PRODUCT} quoted is marked. The original file is not kept here.`));
  const close = btn('btn-plain', 'Close', () => closeSheet(d));
  close.setAttribute('aria-label', `Close page ${p.page}`);
  head.append(hd, close);
  const body = el('div', 'sheet-body');
  const pre = el('div', 'assist-pagetext');
  pre.tabIndex = 0;
  pre.setAttribute('role', 'region');
  pre.setAttribute('aria-label', `Text of page ${p.page}`);
  const t = pg ? pg.text : p.text;
  const at = pg ? t.indexOf(p.text) : 0;
  if (at < 0) pre.textContent = t;
  else {
    pre.appendChild(document.createTextNode(t.slice(0, at)));
    const mk = el('mark', 'assist-hit');
    mk.textContent = p.text;
    pre.appendChild(mk);
    pre.appendChild(document.createTextNode(t.slice(at + p.text.length)));
  }
  body.appendChild(pre);
  card.append(head, body);
  d.appendChild(card);
  backdropCloses(d);
  d.addEventListener('close', () => d.remove());
  document.body.appendChild(d);
  openSheet(d);
  const m = pre.querySelector('mark');
  if (m) m.scrollIntoView({ block: 'center' });
  close.focus();
}
const dealPage = (p) => { const snap = (() => { try { return dealForAssistant(); } catch { return null; } })(); return snap ? pageText(snap.deal.id, p.docId, p.page) : null; };

/** The quoted passages of an answer: each a card with the document, the page, the text exactly as written, and the page link. */
function passageCards(list) {
  const wrap = el('div', 'assist-passages');
  wrap.setAttribute('role', 'list');
  for (const p of list) {
    const c = el('section', 'assist-passage');
    c.setAttribute('role', 'listitem');
    c.setAttribute('aria-label', `Quoted from ${p.docName}, page ${p.page}`);
    c.appendChild(el('h4', 'assist-where', `${p.docName} · page ${p.page}`));
    const q = el('blockquote', 'assist-quote assist-quoted');
    q.textContent = p.text;
    q.tabIndex = 0;   // it scrolls when long: reachable from the keyboard
    q.setAttribute('aria-label', `Quoted text, ${p.docName}, page ${p.page}`);
    c.appendChild(q);
    if (p.flagged) c.appendChild(el('p', 'assist-flag', `This passage reads like an instruction. It is quoted from the document as text; ${PRODUCT} did not act on it.`));
    if (p.figure) {
      const f = el('p', 'assist-figure');
      f.appendChild(el('strong', null, p.figure.text));
      f.appendChild(el('span', 'assist-note', ` (${p.figure.note})`));
      c.appendChild(f);
    }
    const open = btn('btn-sm btn-gray assist-go', 'Open at this page', () => openPage(p));
    open.setAttribute('aria-label', `Open at this page: ${p.docName}, page ${p.page}`);
    c.appendChild(open);
    wrap.appendChild(c);
  }
  return wrap;
}

/** One answer, as text nodes and buttons. */
function draw(r) {
  const box = el('div', `assist-msg assist-answer assist-${r.kind}`);
  if (r.title) box.appendChild(el('h3', 'assist-title', r.title));
  for (const t of r.lines) box.appendChild(el('p', null, t));
  if (r.passages && r.passages.length) box.appendChild(passageCards(r.passages));
  if (r.quote) { const q = el('blockquote', 'assist-quote'); q.textContent = r.quote; box.appendChild(q); }
  if (r.items && r.items.length) {
    const ul = el('ul', 'assist-list');
    for (const it of r.items) {
      const li = el('li', null);
      li.appendChild(el('span', null, it.text));
      if (it.go) li.appendChild(goButton(it.goLabel || 'Show it', it.go, `${it.goLabel || 'Show it'}: ${it.text}`));
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }
  for (const b of r.blanks || []) {
    const p = el('p', 'assist-blank');
    p.appendChild(el('span', null, b.text));
    if (b.go) p.appendChild(goButton(b.label || 'Go to the field', b.go));
    box.appendChild(p);
  }
  const cites = (r.cites || []).filter(Boolean);
  if (cites.length) {
    const sec = el('div', 'assist-cites');
    sec.appendChild(el('h4', null, 'Where this came from'));
    const ul = el('ul', 'assist-list');
    for (const c of cites) {
      const li = el('li', null);
      li.appendChild(el('span', null, c.text));
      if (c.go) li.appendChild(goButton('Show where this came from', c.go, `Show where this came from: ${c.text}`));
      ul.appendChild(li);
    }
    sec.appendChild(ul);
    box.appendChild(sec);
  }
  if (r.changes && r.changes.length) {
    const dl = el('dl', 'assist-changes');
    for (const c of r.changes) {
      const row = el('div', 'assist-change');
      row.appendChild(el('dt', null, c.label));
      const dd = el('dd', null);
      if (c.before) dd.appendChild(el('span', `assist-old${c.typed ? ' assist-typed' : ''}`, `Now: ${c.before}${c.typed ? ' (typed by you)' : ''}`));
      dd.appendChild(el('span', 'assist-new', `${c.before ? 'Becomes' : 'Adds'}: ${c.after}`));
      row.appendChild(dd);
      dl.appendChild(row);
    }
    box.appendChild(dl);
  }
  if (r.suggest && r.suggest.length) {
    const row = el('div', 'assist-chips');
    for (const s of r.suggest) row.appendChild(btn('btn-sm assist-chip', s, () => ask(s)));
    box.appendChild(row);
  }
  if (r.kind === 'confirm') box.appendChild(confirmRow(r.action, box));
  return box;
}

const CHANGED = 'This changed since; nothing was undone';

/** Make one confirmed change and say what it was; `undo` puts back exactly what was there (null when nothing changed). */
async function perform(a) {
  if (a.kind === 'task') {
    const t = await addTask({ title: a.title, due: a.due, dealId: a.dealId, source: 'assistant' });
    return { said: `Task added: ${t.title}${t.due ? `, due ${t.due}` : ''}. It is on ${a.dealId ? 'this deal’s Next steps and on Home' : 'Home'}.`, undo: async () => { const now = (await listTasks()).find((x) => x.id === t.id); if (!now || now.title !== t.title || now.due !== t.due) throw new Error(CHANGED); await deleteTask(t.id); }, undone: 'Undone: the task was removed.' };
  }
  if (a.kind === 'taskdue') {
    const cur = (await listTasks()).find((x) => x.id === a.taskId);
    if (cur && (cur.due || null) !== (a.before || null)) throw new Error('that next step changed since I showed it, so nothing was changed. Ask again');
    const t = await updateTask(a.taskId, { due: a.due });
    if (!t) throw new Error('that next step is gone');
    return { said: `The next step “${t.title}” is now due ${a.due}.`, undo: async () => { const now = (await listTasks()).find((x) => x.id === a.taskId); if (!now || now.due !== a.due) throw new Error(CHANGED); await updateTask(a.taskId, { due: a.before }); }, undone: `Undone: the date is back to ${a.before || 'no date'}.` };
  }
  if (a.kind === 'contact') {
    const c = await saveContact({ name: a.name, role: a.role, company: a.company, phone: a.phone, email: a.email, dealIds: [a.dealId] });
    return { said: `Contact added: ${c.name}, linked to this deal. It is on the deal’s contacts.`, undo: async () => { const now = (await listContacts()).find((x) => x.id === c.id); if (!now || now.name !== c.name || now.company !== c.company || now.phone !== c.phone || now.email !== c.email) throw new Error(CHANGED); await deleteContact(c.id); }, undone: 'Undone: the contact was removed.' };
  }
  const r = await assistantApply(a);
  const said = { figure: 'Done: the figure is set and marked as typed by you.', stage: 'Done: the stage is changed.', note: 'Done: the note is added to the site visit notes.', scenario: 'Done: the scenario is saved. The deal’s own figures are unchanged.', export: 'Opened. Nothing in the deal changed.' }[a.kind] || 'Done.';
  return { said, undo: r.undo, undone: 'Undone: the deal is back exactly as it was.' };
}

/** The yes/no for an action that changes something; a yes is followed by Undo. Each is for this one change only. */
function confirmRow(action, box) {
  const row = el('div', 'assist-confirm');
  const yes = btn('btn-primary', action.yes || 'Add the task');
  const no = btn('btn-gray', 'Cancel');
  yes.addEventListener('click', async () => {
    yes.disabled = true; no.disabled = true;
    try {
      const done = await perform(action);
      row.textContent = '';
      row.appendChild(el('p', 'assist-done', done.said));
      live.textContent = done.said;
      if (done.undo) {
        const undo = btn('btn-sm btn-gray', 'Undo', async () => {
          undo.disabled = true;
          try { await done.undo(); await crmLog('deal', `Undone: ${action.yes}`, action.dealId || null).catch(() => {}); row.textContent = ''; row.appendChild(el('p', 'assist-done', done.undone)); live.textContent = done.undone; } catch (e) { undo.disabled = false; row.appendChild(el('p', 'warn-text', `That could not be undone: ${e.message || e}`)); }
        });
        row.appendChild(undo);
      }
    } catch (e) {
      row.textContent = '';
      row.appendChild(el('p', 'warn-text', `Nothing was changed: ${e.message || e}`));
    }
  });
  no.addEventListener('click', () => { row.textContent = ''; row.appendChild(el('p', 'assist-done', 'Cancelled: nothing was saved.')); live.textContent = 'Cancelled: nothing was saved.'; });
  row.append(yes, no);
  return row;
}

function say(node) {
  log.appendChild(node);
  node.scrollIntoView({ block: 'nearest' });
}

/** Bring the open deal's stored document text into the search (docmem.js), saying so quietly while it is read. Never throws; typing carries on. */
async function warmDocs() {
  try { return await warmDealDocs((on) => { if (reading) { reading.hidden = !on; reading.textContent = on ? 'Reading your documents…' : ''; } }); } catch { return 0; }
}

/** Ask one question: show it, answer it, and act when the answer is an "open". */
export async function ask(text) {
  const q = String(text || '').trim();
  if (!q) return null;
  say(el('div', 'assist-msg assist-me', q));
  input.value = '';
  let r;
  let noMatch = false;
  /** @type {any} */
  let ctx = null;
  try {
    await warmDocs();   // the deal's documents kept from an earlier session, read once and then held (docmem.js)
    const snap = dealForAssistant();
    ctx = snap || { deal: null, input: null, m: {}, rrSum: null, comps: null, today: new Date(), hasDeal: false };
    if (snap) ctx.tasks = await listTasks().catch(() => []);   // the deal's open next steps, for "move the next step"
    const u = understand(q, { today: ctx.today });
    r = answer(u, ctx);
    noMatch = u.id === 'unknown' && r.kind === 'refuse';
  } catch (e) {
    r = { kind: 'refuse', lines: [`I couldn’t work that out: ${e && e.message ? e.message : e}. Nothing was changed.`], items: [], cites: [], blanks: [], suggest: [] };
  }
  // the routes, in order: the device's front desk (above), then the brain on this device when it is ready, then the firm's server when AI is on
  if (noMatch && brainReady()) {
    const done = await brainAnswer(q, ctx);
    if (done) return done;
  }
  const node = draw(r);
  say(node);
  live.textContent = r.lines[0] || '';
  if (r.kind === 'open') leaveAndGo(r.go);
  if (noMatch) await webAnswer(q);
  return r;
}

const brainReady = () => brain.state.phase === 'ready';
const THIS_DEVICE = 'On this device. Nothing you typed left it.';

/** An answer from the brain's own words: text nodes only, a figure the facts do not hold marked. */
function brainNode(text, bad, confidential) {
  const box = el('div', 'assist-msg assist-answer assist-brain');
  const p = el('p', 'assist-brain-text');
  fillMarked(p, text, bad);
  box.appendChild(p);
  if (bad && bad.length) {
    const w = el('p', 'assist-note assist-ungrounded-note');
    w.textContent = `Not from your data: ${[...new Set(bad)].join(', ')}. ${PRODUCT} did not calculate these and the deal does not hold them; check them before you use them.`;
    box.appendChild(w);
  }
  box.appendChild(el('p', 'assist-note', `${THIS_DEVICE}${confidential ? ' This deal is confidential: it was read on this device only.' : ''} Written by the on-device model, not calculated by the app.`));
  return box;
}
function fillMarked(p, text, bad) {
  p.textContent = '';
  for (const part of splitByFigures(text, bad)) {
    if (!part.bad) { p.appendChild(document.createTextNode(part.text)); continue; }
    const m = el('mark', 'assist-ungrounded', part.text);
    m.title = 'Not from your data';
    p.appendChild(m);
    p.appendChild(el('span', 'assist-sr', ' (not from your data)'));
  }
}

/**
 * Answer with the brain on this device. First it maps the question to one of the front desk's tasks (JSON); a task runs on the
 * app's own engine and its answer is the one shown, with where it came from. Otherwise it talks, from the open deal's facts, and
 * any figure in its words that is not in the facts is marked. Returns the answer's result, or null when it could not (an error is shown
 * and the front desk's reply and the server follow as before).
 */
async function brainAnswer(q, ctx) {
  if (brainBusy) { live.textContent = 'Still working on the last question.'; return null; }
  brainBusy = true;
  const think = !!(thinkBox && thinkBox.checked);
  const wait = el('div', 'assist-msg assist-answer assist-wait');
  const waitText = el('p', null, brain.loaded ? `Working on this device…` : `Loading ${PRODUCT}’s brain on this device. The first question after opening the app takes longer…`);
  wait.appendChild(waitText);
  say(wait);
  live.textContent = waitText.textContent;
  try {
    const map = await brain.chat([{ role: 'system', content: taskPrompt(BRAIN_TASKS) }, { role: 'user', content: q }], { think: false });
    const t = /** @type {any} */ (parseTask(map, BRAIN_TASKS));
    if (t.ok && t.task) {
      const tq = /** @type {any} */ (taskToQuestion(t.task, t.inputs, (raw) => understand(raw, { today: ctx.today })));
      if (!tq.ok) return finishAsk(wait, tq.ask);
      const r = answer(tq.q, ctx);
      const box = draw(r);
      box.appendChild(el('p', 'assist-note', `${THIS_DEVICE} Your question was matched to “${BRAIN_TASKS.find((x) => x.id === t.task).title}” and answered by the app’s own calculation.`));
      wait.replaceWith(box);
      box.scrollIntoView({ block: 'nearest' });
      live.textContent = r.lines[0] || '';
      if (r.kind === 'open') leaveAndGo(r.go);
      return r;
    }
    if (!t.ok && t.reason === 'missing-inputs') return finishAsk(wait, t.ask);
    // free talk: the open deal's facts (a confidential deal is read here too: nothing leaves the device)
    const d = dealForAsk();
    let facts = 'No deal is open.';
    try { facts = d ? factsText(d.facts()) : factsText(null); } catch { facts = 'The open deal could not be read.'; }
    const msgs = [{ role: 'system', content: talkPrompt(facts) }, ...brainHistory.slice(-6), { role: 'user', content: q }];
    const live1 = el('p', 'assist-brain-text');
    const stream = el('div', 'assist-msg assist-answer assist-brain assist-streaming');
    stream.appendChild(live1);
    let shown = false;
    const text = await brain.chat(msgs, { think, onToken: (sofar) => {
      const v = visibleText(sofar);
      if (!v) return;
      if (!shown) { wait.replaceWith(stream); shown = true; }
      live1.textContent = v;
      stream.scrollIntoView({ block: 'nearest' });
    } });
    if (!text) throw new Error('The brain gave no answer.');
    const bad = numberCheck(text, [facts, q]);
    const node = brainNode(text, bad, !!(d && d.confidential));
    if (shown) stream.replaceWith(node); else wait.replaceWith(node);
    node.scrollIntoView({ block: 'nearest' });
    brainHistory.push({ role: 'user', content: q }, { role: 'assistant', content: text });
    brainHistory = brainHistory.slice(-6);
    live.textContent = bad.length ? `${text.slice(0, 160)} Not from your data: ${bad.join(', ')}.` : text.slice(0, 200);
    return { kind: 'answer', lines: [text], items: [], cites: [], blanks: [], suggest: [], brain: true };
  } catch (e) {
    const msg = `The brain on this device could not answer (${String(e && e.message ? e.message : e).slice(0, 140)}). ${brain.state.phase === 'ready' ? 'You can ask again.' : 'It is turned off; Settings > Documents and AI turns it back on.'}`;
    const node = el('div', 'assist-msg assist-answer assist-refuse');
    node.appendChild(el('p', 'warn-text', msg));
    wait.replaceWith(node);
    live.textContent = msg;
    return null;
  } finally { brainBusy = false; showBrainControls(); }
}

/** A plain question back (a task that lacks an input): shown as the answer. */
function finishAsk(wait, text) {
  const node = el('div', 'assist-msg assist-answer assist-refuse');
  node.appendChild(el('p', null, text));
  node.appendChild(el('p', 'assist-note', THIS_DEVICE));
  wait.replaceWith(node);
  live.textContent = text;
  return { kind: 'refuse', lines: [text], items: [], cites: [], blanks: [], suggest: [] };
}

/** A reply from the server as text nodes and links: nothing from it is ever read as HTML. */
function webNode(blocks, note) {
  const box = el('div', 'assist-msg assist-answer assist-web');
  for (const b of blocks) {
    box.appendChild(el('p', null, b.text));
    if (b.sources.length) {
      const ul = el('ul', 'assist-list assist-sources');
      for (const src of b.sources) {
        const li = el('li', null);
        const a = el('a', 'assist-source', src.text);
        a.href = src.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.setAttribute('aria-label', `${src.text} (opens in a new tab)`);
        li.appendChild(a);
        ul.appendChild(li);
      }
      box.appendChild(ul);
    }
  }
  if (note) box.appendChild(el('p', 'assist-note', note));
  box.appendChild(el('p', 'assist-note', FROM_AI));
  return box;
}

/**
 * Ask the firm's AI server (with the web). Only when AI is set up and on; otherwise nothing happens and nothing is said
 * (the on-device answer stands, and the web button is not drawn).
 * The open deal's facts go along unless it is confidential (then only the question, and the answer says so).
 */
async function webAnswer(q) {
  if (webBtn) webBtn.disabled = true;
  try {
    if (!ai.isReady(await ai.getSettings())) return;
    let plan;
    try { plan = planAsk(dealForAsk(), q, () => (dealForAsk() ? dealForAsk().facts() : [])); } catch { plan = { refuse: 'I could not read the open deal, so nothing was sent.' }; }
    if (plan.refuse) { say(el('div', 'assist-msg assist-answer assist-refuse', plan.refuse)); live.textContent = plan.refuse; return; }
    const wait = el('div', 'assist-msg assist-answer assist-wait', `Asking ${PRODUCT} AI. This can take a minute…`);
    say(wait);
    live.textContent = `Asking ${PRODUCT} AI. This can take a minute.`;
    let node;
    try {
      // the web conversation belongs to one deal: moving to a different deal starts it again (general turns carry no deal data)
      const dealKey = plan.scope.deal ? plan.scope.deal.id : null;
      if (dealKey !== null) { if (webDeal !== null && webDeal !== dealKey) webHistory = []; webDeal = dealKey; }
      const r = await ai.ask(plan.scope, q, plan.facts, webHistory.slice(-8));
      const blocks = safeBlocks(r);
      if (!blocks.length) throw new Error('The AI server sent no answer.');
      node = webNode(blocks, plan.note);
      webHistory.push({ role: 'user', content: q }, { role: 'assistant', content: blocks.map((b) => b.text).join('\n') });
      webHistory = webHistory.slice(-8);
      live.textContent = blocks[0].text.slice(0, 200);
    } catch (e) {
      node = el('div', 'assist-msg assist-answer assist-refuse');
      node.appendChild(el('p', 'warn-text', errorText(e)));
      live.textContent = errorText(e);
    }
    wait.replaceWith(node);
    node.scrollIntoView({ block: 'nearest' });
  } finally { if (webBtn) webBtn.disabled = false; }
}

/** The "Ask with the web" button: always the server (when AI is on), whatever the device could answer. */
async function askWithWeb() {
  const q = input.value.trim();
  if (!q) { live.textContent = 'Type a question first.'; input.focus(); return; }
  say(el('div', 'assist-msg assist-me', q));
  input.value = '';
  await webAnswer(q);
  input.focus();
}

/** The nest's tips as suggested questions: this step's first, then a chip that adds every other tip. */
function drawTipChips(all) {
  const { mine, more } = splitTips(toolCtx.tips, toolCtx.step);
  chips.textContent = '';
  for (const t of all ? [...mine, ...more] : mine) chips.appendChild(btn('btn-sm assist-chip assist-tip', t.title, () => askTip(t)));
  if (!all && more.length) { const m = btn('btn-sm assist-chip assist-more', 'More tips from the nest', () => { drawTipChips(true); chips.querySelector('.assist-tip')?.focus(); }); chips.appendChild(m); }
}

/** A nest tip as a question and its answer: the tip's own text and a button that runs its route in the tool. */
function askTip(t) {
  say(el('div', 'assist-msg assist-me', t.title));
  const ctx = toolCtx;
  const box = draw({ kind: 'answer', title: t.title, lines: [t.text], items: [], cites: [], blanks: [], suggest: [] });
  box.appendChild(btn('btn-sm btn-gray assist-go', t.label, () => { closeSheet(dlg); if (ctx) ctx.run(t.id); }));
  say(box);
  live.textContent = t.text;
}

function drawChips() {
  if (!chips) return;
  const snap = (() => { try { return dealForAssistant(); } catch { return null; } })();
  chips.textContent = '';
  if (chips.parentElement) chips.parentElement.scrollLeft = 0;
  if (toolCtx) { drawTipChips(false); return; }
  for (const s of suggestions(view, { hasDeal: !!snap, hasRentRoll: !!(snap && snap.rrSum), hasDocs: !!(snap && snap.docIndex), today: new Date() })) chips.appendChild(btn('btn-sm assist-chip', s, () => ask(s)));
}

function build() {
  dlg = el('dialog', 'sheet assist');
  dlg.setAttribute('aria-labelledby', 'assist-h');
  const card = el('div', 'sheet-card');
  const head = el('div', 'sheet-head');
  const hd = el('div');
  hd.appendChild(el('div', 'eyebrow', PRODUCT));
  const h = el('h2', null, `Ask ${PRODUCT}`);
  h.id = 'assist-h';
  hd.appendChild(h);
  subEl = el('p', 'sub', SUB);
  hd.appendChild(subEl);
  const close = btn('btn-plain', 'Close', () => closeSheet(dlg));
  close.setAttribute('aria-label', `Close Ask ${PRODUCT}`);
  head.append(hd, close);
  const body = el('div', 'sheet-body assist-body');
  log = el('div', 'assist-log');
  log.id = 'assist-log';
  log.setAttribute('role', 'log');
  log.setAttribute('aria-label', 'Conversation');
  log.setAttribute('aria-live', 'polite');
  log.setAttribute('aria-relevant', 'additions');
  live = el('p', 'assist-sr');
  live.setAttribute('role', 'status');
  chips = el('div', 'assist-chips');
  chips.setAttribute('aria-label', 'Suggested questions');
  chips.setAttribute('role', 'group');
  reading = el('p', 'hint-sm assist-reading');
  reading.setAttribute('role', 'status');
  reading.hidden = true;
  body.append(log, reading, live);
  const tray = el('div', 'assist-tray');
  tray.appendChild(chips);
  // "Think it through": drawn only while the brain on this device is ready (showBrainControls)
  thinkRow = el('label', 'assist-think');
  thinkBox = el('input');
  thinkBox.type = 'checkbox';
  thinkBox.id = 'assist-think';
  thinkRow.append(thinkBox, el('span', null, 'Think it through (slower, for harder questions)'));
  thinkRow.hidden = true;
  tray.appendChild(thinkRow);
  const foot = el('form', 'sheet-foot assist-foot');
  foot.setAttribute('autocomplete', 'off');
  const lab = el('label', 'assist-sr', 'Ask a question');
  lab.htmlFor = 'assist-input';
  input = el('input', 'assist-input');
  input.id = 'assist-input';
  input.type = 'text';
  input.maxLength = 300;
  input.placeholder = 'Ask about this deal…';
  input.autocomplete = 'off';
  input.spellcheck = false;
  const go = el('button', 'btn btn-primary', 'Ask');
  go.type = 'submit';
  webBtn = btn('btn-gray assist-web-btn', 'Ask with the web', askWithWeb);
  webBtn.hidden = true;   // drawn only while the firm's AI is set up and on (showWebButton)
  foot.append(lab, input, go, webBtn);
  foot.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); input.focus(); });
  card.append(head, body, tray, foot);
  dlg.appendChild(card);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeSheet(dlg); });
  dlg.addEventListener('close', () => { toolCtx = null; });
  // a trap of our own: the browser lets a modal dialog's Tab walk out to its own toolbar; here Tab wraps inside the panel
  dlg.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...dlg.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter((n) => n.getClientRects().length);
    if (!f.length) return;
    const first = f[0]; const last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !dlg.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !dlg.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  });
  document.body.appendChild(dlg);
  say(draw({ kind: 'answer', lines: ['Hello. Ask me about the deal on screen, or pick a question below. I answer from your figures and show where each came from; I never guess.'], items: [], cites: [], blanks: [], suggest: [] }));
}

/** @param {{ tool?: { step: string, tips: any[], run: (id: string) => void } | null }} [opts] `tool`: opened by the Underwrite tool's bird */
/** The "Ask with the web" button exists only when AI settings are ready. */
async function showWebButton() {
  let on = false;
  try { on = ai.isReady(await ai.getSettings()); } catch { /* unreadable settings: no button */ }
  if (webBtn) webBtn.hidden = !on;
  if (subEl) subEl.textContent = on ? `${SUB.replace('Nothing leaves this device.', '')}Nothing leaves this device unless the question has no answer here or you tap Ask with the web.` : SUB;
}

/** The think toggle and the line under the title, for whether the brain is on. */
function showBrainControls() {
  if (thinkRow) thinkRow.hidden = !brainReady();
}

export function openAssistant(opts) {
  if (!dlg) build();
  showWebButton();
  showBrainControls();
  toolCtx = opts && opts.tool && opts.tool.tips.length ? opts.tool : null;
  input.placeholder = toolCtx ? 'Ask about this step…' : 'Ask about this deal…';
  if (toolCtx) say(draw({ kind: 'answer', lines: [`You are on the ${toolCtx.step === 'files' ? 'Files' : toolCtx.step === 'review' ? 'Read & review' : toolCtx.step === 'model' ? 'Model' : 'Export'} step. Pick a tip from the nest below, or ask a question.`], items: [], cites: [], blanks: [], suggest: [] }));
  drawChips();
  openSheet(dlg);
  input.focus();
  warmDocs().then((n) => { if (n && dlg && dlg.open) drawChips(); });   // the suggested questions then know the documents are there
}

export function initAssistant() {
  fab = el('button', 'assist-fab');
  fab.type = 'button';
  fab.id = 'assistant-fab';
  fab.setAttribute('aria-label', `Ask ${PRODUCT}`);
  fab.setAttribute('aria-haspopup', 'dialog');
  fab.setAttribute('data-brand-mark', '');
  fab.addEventListener('click', () => openAssistant());
  document.body.appendChild(fab);
  installBrand();   // draws the mark into every [data-brand-mark], this button included
  document.addEventListener('viewchange', (e) => { view = e.detail; if (dlg && dlg.open) drawChips(); });
  // Home's "Ask Monal" bar: open the panel and ask what was typed (an empty question only opens it)
  document.addEventListener('monal:ask', (e) => { openAssistant(); const q = e.detail && e.detail.question; if (q) ask(q); });
  return { ask, open: () => openAssistant() };
}

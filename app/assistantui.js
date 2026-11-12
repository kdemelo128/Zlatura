/* assistantui.js -- Monal, the on-device assistant: the bird button and the panel.
 *
 * One bird button on every screen (hidden inside the full-screen Underwrite tool, whose own tips are
 * separate for now), opening a calm dialog: a bottom sheet on a phone, a panel in the corner on a desk.
 * A question is understood (assistant.js) and answered (assistantanswer.js) on this device; this file only
 * draws the result. Everything is drawn as text nodes: no HTML from a question, a deal or a document ever
 * reaches the page. The assistant makes no network request. Anything that changes something (a task) is
 * shown first, waits for a yes and offers Undo, through crm.js, the same path the Home screen uses. */

import { el, openSheet, closeSheet } from './kit.js';
import { understand, suggestions } from './assistant.js';
import { answer } from './assistantanswer.js';
import { dealForAssistant, assistantGo } from './dealui.js';
import { addTask, deleteTask } from './crm.js';

let view = 'home';
let dlg = null;
let fab = null;
let log = null;
let input = null;
let chips = null;
let live = null;

const btn = (cls, text, fn) => { const b = el('button', `btn ${cls}`.trim(), text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; };

/** Close the panel, let the history settle, then go (the same wait as the deal's section jump). */
async function leaveAndGo(go) {
  const hadEntry = !!(history.state && history.state.sheet);
  closeSheet(dlg);
  if (hadEntry) await new Promise((resolve) => { const t = setTimeout(resolve, 400); window.addEventListener('popstate', () => { clearTimeout(t); resolve(undefined); }, { once: true }); });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assistantGo(go);
}

function goButton(label, go, aria) {
  const b = btn('btn-sm btn-gray assist-go', label, () => leaveAndGo(go));
  if (aria) b.setAttribute('aria-label', aria);
  return b;
}

/** One answer, as text nodes and buttons. */
function draw(r) {
  const box = el('div', `assist-msg assist-answer assist-${r.kind}`);
  if (r.title) box.appendChild(el('h3', 'assist-title', r.title));
  for (const t of r.lines) box.appendChild(el('p', null, t));
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
  if (r.suggest && r.suggest.length) {
    const row = el('div', 'assist-chips');
    for (const s of r.suggest) row.appendChild(btn('btn-sm assist-chip', s, () => ask(s)));
    box.appendChild(row);
  }
  if (r.kind === 'confirm') box.appendChild(confirmRow(r.action, box));
  return box;
}

/** The yes/no for an action that changes something; a yes is followed by Undo. */
function confirmRow(action, box) {
  const row = el('div', 'assist-confirm');
  const yes = btn('btn-primary', 'Add the task');
  const no = btn('btn-gray', 'Cancel');
  yes.addEventListener('click', async () => {
    yes.disabled = true; no.disabled = true;
    try {
      const t = await addTask({ title: action.title, due: action.due, dealId: action.dealId, source: 'assistant' });
      row.textContent = '';
      row.appendChild(el('p', 'assist-done', `Task added: ${t.title}${t.due ? `, due ${t.due}` : ''}. It is on Home.`));
      const undo = btn('btn-sm btn-gray', 'Undo', async () => {
        undo.disabled = true;
        try { await deleteTask(t.id); row.textContent = ''; row.appendChild(el('p', 'assist-done', 'Undone: the task was removed.')); } catch (e) { row.appendChild(el('p', 'warn-text', `That could not be undone: ${e.message || e}`)); }
      });
      row.appendChild(undo);
    } catch (e) {
      row.textContent = '';
      row.appendChild(el('p', 'warn-text', `The task was not added: ${e.message || e}`));
    }
  });
  no.addEventListener('click', () => { row.textContent = ''; row.appendChild(el('p', 'assist-done', 'Cancelled: nothing was saved.')); });
  row.append(yes, no);
  return row;
}

function say(node) {
  log.appendChild(node);
  node.scrollIntoView({ block: 'nearest' });
}

/** Ask one question: show it, answer it, and act when the answer is an "open". */
export function ask(text) {
  const q = String(text || '').trim();
  if (!q) return null;
  say(el('div', 'assist-msg assist-me', q));
  input.value = '';
  let r;
  try {
    const snap = dealForAssistant();
    const ctx = snap || { deal: null, input: null, m: {}, rrSum: null, comps: null, today: new Date(), hasDeal: false };
    r = answer(understand(q, { today: ctx.today }), ctx);
  } catch (e) {
    r = { kind: 'refuse', lines: [`I couldn’t work that out: ${e && e.message ? e.message : e}. Nothing was changed.`], items: [], cites: [], blanks: [], suggest: [] };
  }
  const node = draw(r);
  say(node);
  live.textContent = r.lines[0] || '';
  if (r.kind === 'open') leaveAndGo(r.go);
  return r;
}

function drawChips() {
  if (!chips) return;
  const snap = (() => { try { return dealForAssistant(); } catch { return null; } })();
  chips.textContent = '';
  if (chips.parentElement) chips.parentElement.scrollLeft = 0;
  for (const s of suggestions(view, { hasDeal: !!snap, hasRentRoll: !!(snap && snap.rrSum), today: new Date() })) chips.appendChild(btn('btn-sm assist-chip', s, () => ask(s)));
}

function build() {
  dlg = el('dialog', 'sheet assist');
  dlg.setAttribute('aria-labelledby', 'assist-h');
  const card = el('div', 'sheet-card');
  const head = el('div', 'sheet-head');
  const hd = el('div');
  hd.appendChild(el('div', 'eyebrow', 'Monal'));
  const h = el('h2', null, 'Ask Monal');
  h.id = 'assist-h';
  hd.appendChild(h);
  hd.appendChild(el('p', 'sub', 'From your deal and the app’s own calculations. Nothing leaves this device.'));
  const close = btn('btn-plain', 'Close', () => closeSheet(dlg));
  close.setAttribute('aria-label', 'Close Ask Monal');
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
  body.append(log, live);
  const tray = el('div', 'assist-tray');
  tray.appendChild(chips);
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
  foot.append(lab, input, go);
  foot.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); input.focus(); });
  card.append(head, body, tray, foot);
  dlg.appendChild(card);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeSheet(dlg); });
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

export function openAssistant() {
  if (!dlg) build();
  drawChips();
  openSheet(dlg);
  input.focus();
}

export function initAssistant() {
  fab = el('button', 'assist-fab');
  fab.type = 'button';
  fab.id = 'assistant-fab';
  fab.setAttribute('aria-label', 'Ask Monal');
  fab.setAttribute('aria-haspopup', 'dialog');
  fab.insertAdjacentHTML('beforeend', '<svg width="30" height="30" aria-hidden="true"><use href="#brand-mark"/></svg>');
  fab.addEventListener('click', openAssistant);
  document.body.appendChild(fab);
  document.addEventListener('viewchange', (e) => { view = e.detail; if (dlg && dlg.open) drawChips(); });
  return { ask, open: openAssistant };
}

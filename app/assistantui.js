/* assistantui.js -- Monal, the on-device assistant: the bird button and the panel.
 *
 * One bird button on every screen (hidden inside the full-screen Underwrite tool, whose own tips are
 * separate for now), opening a calm dialog: a bottom sheet on a phone, a panel in the corner on a desk.
 * A question is understood (assistant.js) and answered (assistantanswer.js) on this device; this file only
 * draws the result. Everything is drawn as text nodes: no HTML from a question, a deal or a document ever
 * reaches the page. The assistant makes no network request. Anything that changes something (a task) is
 * shown first, as a before and after list, waits for a yes of its own and offers Undo. A task, next step or contact
 * goes through crm.js (the path Home and the deal's Pipeline card use); a figure, stage, note, scenario or export
 * through dealui.js assistantApply, which uses the deal screen's own functions. */

import { el, openSheet, closeSheet, backdropCloses } from './kit.js';
import { PRODUCT, installBrand } from './brand.js';
import { understand, suggestions } from './assistant.js';
import { answer } from './assistantanswer.js';
import { dealForAssistant, assistantGo, assistantApply } from './dealui.js';
import { pageText } from './docsession.js';
import { addTask, deleteTask, updateTask, saveContact, deleteContact, listTasks, listContacts, log as crmLog } from './crm.js';

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
  if (hadEntry) await new Promise((resolve) => { const t = setTimeout(() => resolve(undefined), 400); window.addEventListener('popstate', () => { clearTimeout(t); resolve(undefined); }, { once: true }); });
  await new Promise((resolve) => setTimeout(() => resolve(undefined), 0));
  assistantGo(go);
}

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

/** Ask one question: show it, answer it, and act when the answer is an "open". */
export async function ask(text) {
  const q = String(text || '').trim();
  if (!q) return null;
  say(el('div', 'assist-msg assist-me', q));
  input.value = '';
  let r;
  try {
    const snap = dealForAssistant();
    /** @type {any} */
    const ctx = snap || { deal: null, input: null, m: {}, rrSum: null, comps: null, today: new Date(), hasDeal: false };
    if (snap) ctx.tasks = await listTasks().catch(() => []);   // the deal's open next steps, for "move the next step"
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
  hd.appendChild(el('p', 'sub', 'From your deal, its documents read this session, and the app’s own calculations. Nothing leaves this device.'));
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
  fab.setAttribute('aria-label', `Ask ${PRODUCT}`);
  fab.setAttribute('aria-haspopup', 'dialog');
  fab.setAttribute('data-brand-mark', '');
  fab.addEventListener('click', openAssistant);
  document.body.appendChild(fab);
  installBrand();   // draws the mark into every [data-brand-mark], this button included
  document.addEventListener('viewchange', (e) => { view = e.detail; if (dlg && dlg.open) drawChips(); });
  return { ask, open: openAssistant };
}

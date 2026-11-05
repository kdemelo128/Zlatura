/* workspaceui.js -- choosing a workspace: the switcher sheet, the pinned tabs on Home, the list in the desktop rail,
 * the first-run picker and the Settings section. The choice is kept in the one ui.prefs record
 * ({ workspace: { v, active, pinned, picked } }, workspaces.js sanitises it on every read); it is device
 * preference, not deal data, so no deal is touched and a backup carries it with the other small settings.
 * A workspace only lenses what Home shows and which tools come first: nothing is hidden (workspaces.js). */

import { el, icon, toast } from './kit.js';
import { kvGet, kvSet } from './store.js';
import { listAllDeals } from './dealui.js';
import { WORKSPACES, GROUPS, MAX_PINNED, workspaceById, sanitiseWorkspace, withActive, withPinned } from './workspaces.js';

const PREFS = 'ui.prefs';
let api = null;
let prefs = null;                  // the whole ui.prefs record (other keys are kept as they are)
let ready = null;                  // the one read of the stored choice, started by whoever asks first (Tools and Underwrite draw before initWorkspaces runs)
let refocus = null;                // a pinned tab to focus after Home redraws, when a tab was how the switch was made

/** The stored choice, sanitised (Brokerage when there is none). */
export const choice = () => sanitiseWorkspace(prefs && prefs.workspace);
export const activeWorkspace = () => workspaceById(choice().active);
/** Resolves once the stored choice has been read (Home and Tools wait for it before drawing). */
export const workspaceReady = () => ready || (ready = kvGet(PREFS).then((p) => { prefs = p && typeof p === 'object' ? p : null; }));

async function save(next) {
  const was = prefs && prefs.workspace;
  prefs = { ...(prefs || {}), workspace: next };
  // a record written by a newer version is used for this session but never rewritten
  if (was && Number.isFinite(was.v) && was.v > 1) return;
  await kvSet(PREFS, prefs);
}

/** Apply a new choice: keep it, tell the screens, say so for a screen reader. */
async function apply(next, { say = true } = {}) {
  const before = choice().active;
  await save(next);
  document.dispatchEvent(new CustomEvent('workspacechange', { detail: next.active }));
  if (say && next.active !== before) toast(`Workspace: ${workspaceById(next.active).name}.`);
}
export const setActive = (id, opts) => apply(withActive(prefs && prefs.workspace, id), opts);
const setPinned = (id, on) => apply(withPinned(prefs && prefs.workspace, id, on), { say: false });
const markPicked = () => apply(sanitiseWorkspace({ ...choice(), picked: true }), { say: false });

/* ---------------------------------------------------------------- Home */

/** The top of Home: the workspace name as a button, the pinned tabs, and (once, on a device that has deals) a dismissible note. */
export function workspaceBar({ dealCount = 0 } = {}) {
  const c = choice();
  const ws = workspaceById(c.active);
  const bar = el('div', 'wsp-bar');
  bar.id = 'ws-bar';
  const sw = el('button', 'btn wsp-switch');
  sw.type = 'button';
  sw.id = 'ws-switch';
  sw.setAttribute('aria-haspopup', 'dialog');
  sw.setAttribute('aria-label', `Workspace: ${ws.name}. Change workspace`);
  sw.insertAdjacentHTML('beforeend', icon('layers', 18));
  sw.appendChild(el('span', null, ws.name));
  sw.insertAdjacentHTML('beforeend', icon('down', 14));
  sw.addEventListener('click', () => openSwitcher());
  bar.appendChild(sw);
  if (c.pinned.length > 1) bar.appendChild(pinnedTabs(c));
  if (dealCount && !c.picked) {
    const note = el('div', 'wsp-note');
    note.id = 'ws-note';
    note.appendChild(el('span', null, 'New: workspaces for lending, investing, development… Each one reorders Home and puts its tools first; nothing is hidden.'));
    const ch = el('button', 'btn btn-sm', 'Choose');
    ch.type = 'button';
    ch.addEventListener('click', () => openSwitcher());
    const no = el('button', 'btn btn-sm btn-gray', 'Dismiss');
    no.type = 'button';
    no.setAttribute('aria-label', 'Dismiss the workspaces note');
    no.addEventListener('click', () => markPicked());
    note.append(ch, no);
    bar.appendChild(note);
  }
  return bar;
}

/** After Home has drawn: give a pinned tab the focus when that is how the switch was made. */
export function restoreTabFocus() {
  if (!refocus) return;
  const t = document.getElementById(refocus === 'switch' ? 'ws-switch' : `ws-tab-${refocus}`);
  refocus = null;
  if (t) t.focus({ preventScroll: true });
}

function pinnedTabs(c) {
  const row = el('div', 'wsp-tabs');
  row.setAttribute('role', 'tablist');
  row.setAttribute('aria-label', 'Pinned workspaces');
  const tabs = c.pinned.map((id) => {
    const b = el('button', 'wsp-tab', workspaceById(id).name);
    b.type = 'button';
    b.id = `ws-tab-${id}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(id === c.active));
    b.tabIndex = id === c.active ? 0 : -1;
    b.addEventListener('click', () => { refocus = id; setActive(id); });
    return b;
  });
  // arrow keys move between the tabs; Enter or Space picks one (a pick redraws Home, so it is not made by moving)
  row.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const to = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    tabs[i].tabIndex = -1;
    tabs[to].tabIndex = 0;
    tabs[to].focus();
  });
  row.append(...tabs);
  return row;
}

/* ------------------------------------------------------------- the sheets */

const grouped = () => GROUPS.map((g) => [g, WORKSPACES.filter((w) => w.group === g)]);

/** All nine, in three groups: choose one to work in, or pin up to three to keep a tab for. */
export function openSwitcher() {
  const body = api.sheetOpen({ eyebrow: 'Workspaces', title: 'Choose a workspace', sub: `Pin up to ${MAX_PINNED}. Every tool stays in Tools and search.` });
  const draw = () => {
    const c = choice();
    body.textContent = '';
    for (const [g, list] of grouped()) {
      body.appendChild(el('h3', 'wsp-group', g));
      const ul = el('ul', 'set-list wsp-list');
      for (const w of list) {
        const li = el('li', 'set-row wsp-row');
        const pick = el('button', 'wsp-pick');
        pick.type = 'button';
        pick.dataset.ws = w.id;
        if (w.id === c.active) pick.setAttribute('aria-current', 'true');
        pick.append(el('b', null, w.name), el('span', null, w.line));
        pick.addEventListener('click', async () => { await setActive(w.id); api.sheetClose(); });
        const pin = el('label', 'wsp-pin');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = c.pinned.includes(w.id);
        cb.disabled = (!cb.checked && c.pinned.length >= MAX_PINNED) || (cb.checked && c.pinned.length <= 1);
        cb.setAttribute('aria-label', `Pin ${w.name}`);
        cb.addEventListener('change', async () => { await setPinned(w.id, cb.checked); draw(); const again = body.querySelector(`input[aria-label="Pin ${w.name}"]`); if (again && !again.disabled) again.focus(); });
        pin.append(cb, el('span', null, 'Pin'));
        li.append(pick, pin);
        ul.appendChild(li);
      }
      body.appendChild(ul);
    }
  };
  draw();
  // picking or pinning redraws Home and replaces the switch button the sheet would give the focus back to: focus the new one
  document.getElementById('sheet').addEventListener('close', () => {
    const b = document.getElementById('ws-switch');
    if (b && b.offsetParent) b.focus();
    // Home may redraw just after (a pick does): the next draw hands the focus to the new button; a stale wish is dropped
    refocus = 'switch';
    setTimeout(() => { if (refocus === 'switch') refocus = null; }, 1000);
  }, { once: true });
}

/** First run: "What do you work on?" Skip (or closing the sheet) means Brokerage. */
export function openPicker() {
  const chosen = [];
  let done = false;
  const go = el('button', 'btn btn-primary', 'Continue');
  go.type = 'button';
  const skip = el('button', 'btn btn-gray', 'Skip');
  skip.type = 'button';
  const body = api.sheetOpen({ eyebrow: 'Welcome', title: 'What do you work on?', sub: 'Pick up to three. You can change this any time. Every tool stays in Tools and search.', foot: [skip, go] });
  const boxes = [];
  for (const [g, list] of grouped()) {
    body.appendChild(el('h3', 'wsp-group', g));
    const ul = el('ul', 'set-list wsp-list');
    for (const w of list) {
      const li = el('li', 'set-row wsp-row');
      const lab = el('label', 'wsp-pick wsp-check');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.dataset.ws = w.id;
      cb.addEventListener('change', () => {
        const at = chosen.indexOf(w.id);
        if (cb.checked && at < 0) chosen.push(w.id); else if (!cb.checked && at >= 0) chosen.splice(at, 1);
        for (const x of boxes) x.disabled = !x.checked && chosen.length >= MAX_PINNED;
      });
      boxes.push(cb);
      const t = el('span', 'wsp-text');
      t.append(el('b', null, w.name), el('span', null, w.line));
      lab.append(cb, t);
      li.appendChild(lab);
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }
  const dlg = document.getElementById('sheet');
  const finish = async (ids) => {
    if (done) return;
    done = true;
    const first = ids[0];
    await apply(first ? sanitiseWorkspace({ active: first, pinned: ids, picked: true }) : sanitiseWorkspace({ ...choice(), picked: true }), { say: false });
    api.sheetClose();
  };
  go.addEventListener('click', () => finish(chosen.slice()));
  skip.addEventListener('click', () => finish([]));
  dlg.addEventListener('close', () => finish([]), { once: true });
}

/* ------------------------------------------------------------ desktop rail */

function drawRail() {
  const host = document.getElementById('ws-rail');
  if (!host) return;
  const c = choice();
  host.textContent = '';
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', 'Workspaces: choose a lens for Home and Tools');
  const h = el('div', 'nav-label', 'Workspaces');
  h.id = 'ws-rail-head';
  host.appendChild(h);
  for (const id of c.pinned) {
    const b = el('button', 'tab wsp-rail-tab');
    b.type = 'button';
    b.dataset.ws = id;
    b.insertAdjacentHTML('beforeend', icon('layers', 19));
    b.appendChild(el('span', null, workspaceById(id).name));
    if (id === c.active) b.setAttribute('aria-current', 'true');
    b.addEventListener('click', () => setActive(id));
    host.appendChild(b);
  }
  const all = el('button', 'tab wsp-rail-tab wsp-rail-all');
  all.type = 'button';
  all.id = 'ws-rail-all';
  all.appendChild(el('span', null, 'All workspaces…'));
  all.addEventListener('click', () => openSwitcher());
  host.appendChild(all);
}

/* --------------------------------------------------------------- Settings */

/** Settings → Workspace: the active one, the pinned ones, and the picker again. */
export function workspaceSettings(section, row, btn) {
  const c = choice();
  const card = section('Workspace', 'settings-workspace', workspaceById(c.active).name);
  const ul = el('ul', 'set-list');
  ul.appendChild(row('Workspace', `${workspaceById(c.active).line} Pinned: ${c.pinned.map((id) => workspaceById(id).name).join(', ')}. A workspace changes what Home shows and which tools come first; every tool stays in Tools and search.`, [btn('Choose and pin…', () => openSwitcher())]));
  ul.appendChild(row('First-run picker', 'Ask again what you work on.', [btn('Show the picker again', () => openPicker())]));
  card.appendChild(ul);
  return card;
}

/* ------------------------------------------------------------------- init */

export function initWorkspaces(compsApi) {
  api = compsApi;
  const loaded = workspaceReady();
  drawRail();
  document.addEventListener('workspacechange', drawRail);
  loaded.then(async () => {
    drawRail();
    // an empty device with no answer yet gets the picker once; a device that has deals never does (it gets a note on Home).
    // An automated browser (navigator.webdriver) is not asked, only because our own browser tests start on an empty device
    // and the picker would cover their first screen. A person on an automated browser has Settings > Workspace > Show the picker again.
    if ((prefs && prefs.workspace) || navigator.webdriver) return;
    const deals = await listAllDeals().catch(() => []);
    if (!deals.length && !document.querySelector('dialog[open]')) openPicker();
  });
}

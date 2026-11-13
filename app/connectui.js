/* connectui.js -- the Connect page: what Monal can take in or send out, in categories (connectors.js is the one list),
 * and "My data", what is stored on this device (mydata.js). Nothing here makes a network request: a row opens
 * something Monal already has, or says plainly what it waits for. */

import { el, icon, toast, niceDate } from './kit.js';
import * as store from './store.js';
import { KINDS, countKinds, storageLine, countText } from './mydata.js';
import { makeBackup, restore } from './backupui.js';
import { PRODUCT } from './brand.js';
import { filterCategories, monogram } from './connectors.js';
import { openAssistant } from './assistantui.js';
import { openTemplates } from './dealui.js';

let api = null;
let tab = 'connectors';
let query = '';
let visible = false;
const $ = (id) => document.getElementById(id);
/** Arrow keys on the tabs (the standard tab pattern): step to the next or previous tab, wrapping. */
const STEP = { ArrowRight: 1, ArrowLeft: -1 };
const TABS = [['connectors', 'Connectors'], ['mydata', 'My data']];

/** What each row's `opens` does. Each one goes to a feature that exists; none reaches the network. */
const OPEN = {
  assistant: () => openAssistant(),
  deals: () => api.showView('deal'),
  home: () => api.showView('home'),
  tools: () => api.showView('tools'),
  templates: () => openTemplates(),
  'my-data': () => openConnect('mydata'),
  'comps-file': () => { api.showView('comps'); $('file')?.click(); },
  'om-file': () => { api.showView('deal'); $('om-file')?.click(); },
  // these two import into a deal: the deal's own card does the work, so the page takes you to it
  'rent-roll': () => toDealCard('deal-rentroll', 'Rent roll', 'choose More, then Import from Excel, CSV or PDF'),
  t12: () => toDealCard('deal-t12', 'Operating statement', 'choose its import button'),
};

function toDealCard(id, name, how) {
  api.showView('deal');
  setTimeout(() => {
    const card = $(id);
    if (card) { card.scrollIntoView({ block: 'start' }); toast(`In the ${name} card, ${how}.`, null, 7000); }
    else toast(`Open a deal first, then in its ${name} card ${how}.`, null, 7000);
  }, 350);
}

/** Open the Connect page on a tab. */
export function openConnect(which = 'connectors') {
  tab = which === 'mydata' ? 'mydata' : 'connectors';
  if (visible) render(); // already showing: draw the other tab
  else api.showView('connect');
}

function waitSheet(row) {
  const body = api.sheetOpen({ eyebrow: row.state, title: row.name, sub: row.desc });
  body.appendChild(el('p', null, row.wait || ''));
  body.appendChild(el('p', 'hint', 'Nothing is connected, and nothing about this service leaves your device. Today, bring a file of its own through the importers that are built in.'));
}

function stateButton(row) {
  const live = row.state === 'Built in' || row.state === 'Import file';
  const b = el('button', `btn btn-sm conn-btn ${row.state === 'Built in' ? 'btn-primary' : live ? 'btn-gray' : 'btn-plain'}`, row.state);
  b.type = 'button';
  b.dataset.state = row.state;
  b.setAttribute('aria-label', live ? `${row.state}: open ${row.name}` : `${row.state}: ${row.name}, what it waits for`);
  b.addEventListener('click', () => { if (live) OPEN[row.opens]?.(); else waitSheet(row); });
  return b;
}

function rowItem(row, i) {
  const li = el('li', 'conn-row');
  li.dataset.id = row.id;
  li.style.setProperty('--i', String(Math.min(i, 12)));
  const m = monogram(row.name);
  const tile = el('span', 'conn-mono', m.text);
  tile.dataset.tone = String(m.tone);
  tile.setAttribute('aria-hidden', 'true');
  const tx = el('div', 'conn-text');
  tx.append(el('span', 'conn-name', row.name), el('span', 'conn-desc', row.desc));
  li.append(tile, tx, stateButton(row));
  return li;
}

function drawList(host, status) {
  host.textContent = '';
  const cats = filterCategories(query);
  const n = cats.reduce((a, c) => a + c.rows.length, 0);
  status.textContent = query.trim() ? (n ? `${n} match${n === 1 ? '' : 'es'}.` : `Nothing matches “${query.trim()}”.`) : '';
  let i = 0;
  for (const c of cats) {
    const sec = el('section', 'conn-cat');
    sec.dataset.cat = c.id;
    const hid = `conn-h-${c.id}`;
    const h = el('h2', null, c.title);
    h.id = hid;
    sec.append(h, el('p', 'conn-sub', c.sub));
    const ul = el('ul', 'conn-grid');
    ul.setAttribute('aria-labelledby', hid);
    for (const r of c.rows) ul.appendChild(rowItem(r, i++));
    sec.appendChild(ul);
    host.appendChild(sec);
  }
}

function connectorsPanel() {
  const p = el('div', 'conn-panel');
  const banner = el('div', 'conn-banner');
  const bt = el('div', 'conn-banner-text');
  bt.append(el('b', null, 'Your work stays on this device'), el('span', null, 'Nothing on this page reaches the internet. Bring a file in from any service below, or see what is stored.'));
  const see = el('button', 'btn btn-sm conn-btn', 'See my data');
  see.type = 'button';
  see.addEventListener('click', () => openConnect('mydata'));
  banner.append(bt, see);
  const bar = el('div', 'conn-search');
  bar.insertAdjacentHTML('beforeend', icon('search', 18));
  const input = el('input', 'input');
  input.type = 'search';
  input.id = 'connect-search';
  input.placeholder = 'Search connectors';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Search connectors');
  input.value = query;
  const status = el('p', 'conn-status hint');
  status.setAttribute('role', 'status');
  const list = el('div', 'conn-cats');
  list.id = 'connect-list';
  input.addEventListener('input', () => { query = input.value; drawList(list, status); });
  bar.appendChild(input);
  p.append(banner, bar, status, list);
  drawList(list, status);
  return p;
}

/** Everything the tab reads, from this device only. */
async function readDevice() {
  const [deals, kv, session, info] = await Promise.all([store.listDeals(), store.kvAll(), store.loadSession(), store.storageInfo()]);
  /** @type {Record<string, string>} */
  const local = {};
  try { const v = localStorage.getItem('uw-v3'); if (v) local['uw-v3'] = v; } catch { /* blocked: none counted */ }
  return { counts: countKinds({ deals, kv, session, local }), last: kv['backup.last'] || null, info };
}

function myDataPanel() {
  const p = el('div', 'conn-panel');
  p.appendChild(el('p', 'conn-lede', `Everything ${PRODUCT} keeps is in this browser on this device. Nothing leaves it unless you export a file or connect a service.`));
  const body = el('div', 'md-body');
  body.setAttribute('aria-busy', 'true');
  p.appendChild(body);
  const mine = tab;
  readDevice().then(({ counts, last, info }) => {
    if (tab !== mine || !body.isConnected) return;
    body.removeAttribute('aria-busy');
    const ul = el('ul', 'md-kinds');
    ul.setAttribute('aria-label', 'What is stored on this device');
    for (const k of KINDS) {
      const li = el('li', 'md-kind');
      li.dataset.kind = k.id;
      const t = el('div', 'conn-text');
      t.append(el('span', 'conn-name', k.label), el('span', 'conn-desc', `${k.where}. ${k.backup ? 'In a backup.' : 'Not in a backup.'}`));
      const n = el('b', 'md-count', String(counts[k.id]));
      n.setAttribute('aria-label', countText(k, counts[k.id]));
      li.append(t, n);
      ul.appendChild(li);
    }
    const st = storageLine(info);
    const sbox = el('div', 'md-storage');
    sbox.id = 'md-storage';
    sbox.appendChild(el('b', null, 'Space'));
    if (st.share !== null) {
      const m = el('meter', 'md-meter');
      m.min = 0; m.max = 1; m.value = st.share;
      m.setAttribute('aria-label', 'Share of the browser’s allowance in use');
      sbox.appendChild(m);
    }
    sbox.appendChild(el('span', 'conn-desc', st.text));
    const lbox = el('p', 'conn-lede md-last', last ? `Last backup: ${niceDate(last)}.` : 'No backup made from this device yet.');
    lbox.id = 'md-last';
    const acts = el('div', 'md-acts');
    const bk = el('button', 'btn btn-sm conn-btn btn-primary', 'Back up everything');
    bk.type = 'button';
    bk.id = 'md-backup';
    bk.addEventListener('click', () => makeBackup().then(() => { if (visible && tab === 'mydata') render(); }).catch((e) => toast(`The backup could not be made: ${e.message}`)));
    const rs = el('button', 'btn btn-sm conn-btn btn-gray', 'Restore from a backup…');
    rs.type = 'button';
    rs.id = 'md-restore-btn';
    const fi = el('input');
    fi.type = 'file'; fi.accept = '.json,application/json'; fi.id = 'md-restore'; fi.hidden = true;
    rs.addEventListener('click', () => fi.click());
    fi.addEventListener('change', () => { const f = fi.files[0]; fi.value = ''; if (f) restore(f, api); });
    acts.append(bk, rs, fi);
    body.append(ul, sbox, lbox, acts);
  });
  return p;
}

function render() {
  const root = $('connect-root');
  if (!root) return;
  root.textContent = '';
  const head = el('div', 'view-head');
  head.append(el('h1', null, 'Connect'), el('p', null, `Bring files in from the services you use, and see what ${PRODUCT} keeps on this device.`));
  const tabs = el('div', 'conn-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Connect');
  for (const [id, label] of TABS) {
    const b = el('button', 'conn-tab', label);
    b.type = 'button';
    b.id = `connect-tab-${id}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(tab === id));
    b.setAttribute('aria-controls', 'connect-panel');
    b.tabIndex = tab === id ? 0 : -1;
    b.addEventListener('click', () => { tab = id; render(); $(`connect-tab-${id}`).focus(); });
    b.addEventListener('keydown', (e) => {
      const k = STEP[e.key];
      if (!k) return;
      e.preventDefault();
      tab = TABS[(TABS.findIndex((t) => t[0] === id) + k + TABS.length) % TABS.length][0];
      render();
      $(`connect-tab-${tab}`).focus();
    });
    tabs.appendChild(b);
  }
  const panel = el('div', 'conn-panelwrap');
  panel.id = 'connect-panel';
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', `connect-tab-${tab}`);
  panel.appendChild(tab === 'mydata' ? myDataPanel() : connectorsPanel());
  root.append(head, tabs, panel);
}

export function initConnect(compsApi) {
  api = compsApi;
  document.addEventListener('viewchange', (e) => { visible = e.detail === 'connect'; if (visible) render(); });
}

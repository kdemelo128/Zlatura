/* inboxui.js -- the To file tab on the Connect page: records proposed from the documents Monal has read, each with
 * where it came from and what it could be, and File, Merge or Dismiss (and Undo). Nothing is filed until a person taps,
 * unless "File clean new records automatically" is on in Settings. */

import { el, toast, niceDate } from './kit.js';
import { listContacts } from './crm.js';
import * as store from './store.js';
import { loadItems, fileItem, mergeItem, dismissItem, undoItem, autoOn, setAuto } from './inboxstore.js';
import { matchContacts, matchScope, mergePreview, visible, publicCount } from './inbox.js';
import { updateDeal, currentDealId } from './dealui.js';

const FIELD_LABEL = { name: 'Name', company: 'Company', role: 'Role', email: 'Email', phone: 'Phone' };
const KIND_LABEL = { contact: 'Contact', task: 'Task', property: 'Property' };
const deps = () => ({ updateDeal });

/** How many items wait, as Home and the Connect tab show it (never an item of a confidential deal). */
export async function waitingCount() { return publicCount(await loadItems()); }

/** The auto-file switch, for Settings and for the tab: one control, the same setting. */
export async function autoSwitch(id = 'inbox-auto') {
  const label = el('label', 'chk inbox-auto');
  const box = el('input');
  box.type = 'checkbox';
  box.id = id;
  box.checked = await autoOn();
  box.addEventListener('change', () => setAuto(box.checked).then(() => toast(box.checked ? 'Clean new records will be filed automatically. Each can be undone in To file.' : 'Nothing is filed until you tap File.')).catch((e) => { box.checked = !box.checked; toast(e.message); }));
  label.append(box, document.createTextNode(' File clean new records automatically (a record that matches nobody and conflicts with nothing; never merges, never overwrites)'));
  return label;
}

const dealName = (deals, id) => { const d = deals.find((x) => x.id === id); return d ? (d.name || (d.figures && d.figures.address) || 'Untitled deal') : 'a deal that is no longer here'; };

function summary(it) {
  const d = it.data;
  if (d.kind === 'contact') return [d.name, [d.role, d.company && d.company !== d.name ? d.company : ''].filter(Boolean).join(' · '), [d.email, d.phone].filter(Boolean).join(' · ')].filter(Boolean);
  if (d.kind === 'task') return [`${d.title}: ${niceDate(`${d.due}T12:00:00`)}`, 'A task on this deal, due that day'];
  return [d.address, 'The property’s address'];
}

function chips(it) {
  const row = el('div', 'inbox-chips');
  row.appendChild(el('span', 'chip chip-plain', KIND_LABEL[it.data.kind] || 'Record'));
  if (it.confidential) row.appendChild(el('span', 'chip chip-warn', 'Confidential deal'));
  if (it.data.suspicious) row.appendChild(el('span', 'chip chip-warn', 'Reads like an instruction: kept as text'));
  return row;
}

function card(it, ctx) {
  const li = el('li', 'inbox-item');
  li.dataset.id = it.id;
  li.dataset.kind = it.data.kind;
  const [main, ...rest] = summary(it);
  const t = el('div', 'inbox-text');
  t.append(chips(it), el('span', 'inbox-main', main), ...rest.map((x) => el('span', 'conn-desc', x)));
  t.appendChild(el('span', 'conn-desc inbox-src', `From ${it.source.file}${it.source.page ? `, page ${it.source.page}` : ''} · ${dealName(ctx.deals, it.dealId)}`));
  const acts = el('div', 'inbox-acts');
  const matches = it.data.kind === 'contact' ? matchContacts(it.data, ctx.contacts, matchScope(ctx.contacts, ctx.deals, it.dealId)) : [];
  if (matches.length) {
    const m = matches.map((x) => { const c = ctx.contacts.find((y) => y.id === x.id); return `${c ? c.name : 'a contact'} (${x.why})`; });
    t.appendChild(el('span', 'conn-desc inbox-match', `${matches[0].level === 'possible' ? 'Possible match' : 'Matches'}: ${m.join('; ')}`));
  }
  if (it.data.kind === 'property') {
    const deal = ctx.deals.find((x) => x.id === it.dealId);
    const have = deal && deal.figures && String(deal.figures.address || '').trim();
    if (have) t.appendChild(el('span', 'conn-desc inbox-conflict', `The deal has “${have}” typed. It is kept; this one can only be dismissed.`));
  }
  const filable = !(it.data.kind === 'property' && (() => { const d = ctx.deals.find((x) => x.id === it.dealId); return !d || String((d.figures && d.figures.address) || '').trim(); })());
  const act = (label, cls, fn) => { const b = el('button', `btn btn-sm conn-btn ${cls}`, label); b.type = 'button'; b.addEventListener('click', async () => { b.disabled = true; try { await fn(); } catch (e) { toast(e.message); } ctx.refresh(); }); return b; };
  if (filable) acts.appendChild(act(matches.length ? 'File as new' : 'File', 'btn-primary', async () => { await fileItem(it.id, deps()); toast('Filed.', { label: 'Undo', run: () => undoItem(it.id, deps()).then(ctx.refresh) }); }));
  if (matches.length) acts.appendChild(act('Merge…', 'btn-gray', async () => { openMerge(it, matches, ctx); }));
  acts.appendChild(act('Dismiss', 'btn-plain', async () => { await dismissItem(it.id); toast('Dismissed.', { label: 'Undo', run: () => undoItem(it.id, deps()).then(ctx.refresh) }); }));
  li.append(t, acts);
  return li;
}

/** The merge sheet: pick the contact, then answer each conflict (the typed value is kept unless you choose the other). */
function openMerge(it, matches, ctx) {
  const body = ctx.api.sheetOpen({ eyebrow: 'To file', title: `Merge ${it.data.name}`, sub: 'Blank fields fill. Where both have a value, you choose; the one you do not use is kept under “other values”.' });
  let target = matches[0].id;
  const choice = {};
  const pick = el('div', 'inbox-pick');
  const out = el('div', 'inbox-merge');
  const draw = () => {
    out.textContent = '';
    const c = ctx.contacts.find((x) => x.id === target);
    const pv = mergePreview(it, c);
    for (const f of pv.fills) out.appendChild(el('p', 'conn-desc', `${FIELD_LABEL[f.field]}: blank here, filled with ${f.to}.`));
    for (const x of pv.conflicts) {
      const g = el('fieldset', 'inbox-conflict-set');
      g.dataset.field = x.field;
      g.appendChild(el('legend', null, `${FIELD_LABEL[x.field]}: two different values`));
      for (const [v, text, label] of [['keep', x.have, 'Keep what is on the contact'], ['use', x.other, 'Use the document’s']]) {
        const l = el('label', 'chk');
        const r = el('input');
        r.type = 'radio'; r.name = `c-${x.field}`; r.value = v;
        r.checked = choice[x.field] === v;
        r.addEventListener('change', () => { choice[x.field] = v; });
        l.append(r, document.createTextNode(` ${label}: ${text}`));
        g.appendChild(l);
      }
      out.appendChild(g);
    }
    if (!pv.fills.length && !pv.conflicts.length) out.appendChild(el('p', 'conn-desc', 'Nothing differs: this only links the contact to the deal and records the source.'));
    const go = el('button', 'btn btn-sm conn-btn btn-primary', 'Merge');
    go.type = 'button';
    go.id = 'inbox-merge-go';
    go.addEventListener('click', async () => {
      try {
        const r = await mergeItem(it.id, target, choice);
        if (!r.ok) { toast(`Choose for: ${r.missing.map((m) => FIELD_LABEL[m]).join(', ')}.`); return; }
        ctx.api.sheetClose();
        toast('Merged.', { label: 'Undo', run: () => undoItem(it.id, deps()).then(ctx.refresh) });
        ctx.refresh();
      } catch (e) { toast(e.message); }
    });
    out.appendChild(go);
  };
  if (matches.length > 1) {
    pick.appendChild(el('p', 'conn-desc', 'More than one contact could be this person. Choose which:'));
    for (const m of matches) {
      const c = ctx.contacts.find((x) => x.id === m.id);
      const l = el('label', 'chk');
      const r = el('input');
      r.type = 'radio'; r.name = 'merge-target'; r.value = m.id; r.checked = m.id === target;
      r.addEventListener('change', () => { target = m.id; for (const k of Object.keys(choice)) delete choice[k]; draw(); });
      l.append(r, document.createTextNode(` ${c.name}${c.company ? `, ${c.company}` : ''}${c.email ? ` · ${c.email}` : ''}${c.phone ? ` · ${c.phone}` : ''} (${m.why})`));
      pick.appendChild(l);
    }
  }
  body.append(pick, out);
  draw();
}

/** The tab's content. `onCount` is told how many items wait (for the tab's label). */
/** @param {HTMLElement} host @param {any} api @param {(n: number) => void} [onCount] */
export async function renderInbox(host, api, onCount = () => {}) {
  const ctx = { api, contacts: [], deals: [], refresh: () => {} };
  const draw = async () => {
    const [items, contacts, deals] = await Promise.all([loadItems(), listContacts(), store.listDeals()]);
    ctx.contacts = contacts;
    ctx.deals = deals;
    const open = currentDealId();
    const wait = visible(items, open);
    onCount(publicCount(items));
    if (!host.isConnected) return;
    host.textContent = '';
    host.appendChild(el('p', 'conn-lede', 'People, companies, the property and dates found in the documents you read. Nothing is filed until you tap File; a value you typed is never overwritten.'));
    host.appendChild(await autoSwitch('inbox-auto-tab'));
    const hiddenSecret = items.some((x) => x.status === 'pending' && x.confidential && x.dealId !== open);
    if (hiddenSecret) host.appendChild(el('p', 'hint-sm', 'Records from a confidential deal show here only while that deal is open.'));
    const ul = el('ul', 'inbox-list');
    ul.setAttribute('aria-label', 'Records waiting to be filed');
    for (const it of wait) ul.appendChild(card(it, ctx));
    if (!wait.length) host.appendChild(el('p', 'conn-lede inbox-empty', 'Nothing is waiting. Read an offering memorandum, a lease or a rent roll, and what it names appears here.'));
    else host.appendChild(ul);
    const done = items.filter((x) => x.status !== 'pending' && (!x.confidential || x.dealId === open)).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 15);
    if (done.length) {
      host.appendChild(el('h2', 'inbox-h', 'Done'));
      const dl = el('ul', 'inbox-list inbox-done');
      dl.setAttribute('aria-label', 'Filed, merged and dismissed');
      for (const it of done) {
        const li = el('li', 'inbox-item inbox-doneitem');
        li.dataset.id = it.id;
        const word = it.status === 'filed' ? (it.auto ? 'Filed automatically' : 'Filed') : it.status === 'merged' ? 'Merged' : 'Dismissed';
        const t = el('div', 'inbox-text');
        t.append(el('span', 'inbox-main', summary(it)[0]), el('span', 'conn-desc', `${word} · from ${it.source.file}`));
        const b = el('button', 'btn btn-sm conn-btn btn-gray', 'Undo');
        b.type = 'button';
        b.setAttribute('aria-label', `Undo: ${summary(it)[0]}`);
        b.addEventListener('click', async () => { b.disabled = true; try { await undoItem(it.id, deps()); toast('Undone.'); } catch (e) { toast(e.message); } ctx.refresh(); });
        li.append(t, b);
        dl.appendChild(li);
      }
      host.appendChild(dl);
    }
  };
  ctx.refresh = () => draw();
  await draw();
}

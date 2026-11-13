/* inboxstore.js -- the To file inbox on this device: the items (kv 'inbox.items'), the one setting (kv 'inbox.prefs'),
 * proposing from a document that was just read, and filing, merging, dismissing and undoing. The rules are in inbox.js;
 * this file only reads and writes. Nothing here uses the network. */

import { kvGet, kvSet, listDeals } from './store.js';
import { listContacts, saveContact, deleteContact, listTasks, addTask, deleteTask } from './crm.js';
import { extractCandidates, newItems, trim, readItems, newContact, mergeInto, undoMerge, matchContacts, matchScope, isClean } from './inbox.js';

const ITEMS = 'inbox.items';
const PREFS = 'inbox.prefs';
const changed = () => document.dispatchEvent(new CustomEvent('inboxchange'));

export async function loadItems() { return readItems(await kvGet(ITEMS)); }
async function saveItems(items) {
  // an item a newer version wrote is kept as it is: readItems leaves it out of the list, so it is put back here
  const raw = await kvGet(ITEMS);
  const ahead = Array.isArray(raw) ? raw.filter((x) => x && typeof x === 'object' && (x.v || 1) > 1) : [];
  if (!(await kvSet(ITEMS, [...trim(items), ...ahead]))) throw new Error('This device would not save that (storage is full or blocked).');
  changed();
}
export async function autoOn() { const p = await kvGet(PREFS); return !!(p && p.auto === true); }
export async function setAuto(on) { if (!(await kvSet(PREFS, { v: 1, auto: !!on }))) throw new Error('This device would not save that setting.'); changed(); }

const patch = async (id, fn) => {
  const items = await loadItems();
  const it = items.find((x) => x.id === id);
  if (!it) return null;
  fn(it);
  await saveItems(items);
  return it;
};

/**
 * A document was just read on `deal`: its people, property and dates become proposed items (nothing else changes).
 * With the automatic switch on, items that are clean are filed at once. Never throws: a failure here must not touch the read.
 * @param {{ deal: any, doc: { name?: string, sha256?: string | null, type?: string | null }, pages: string[], now?: number }} o
 * @returns {Promise<{ added: number, filed: number }>}
 */
export async function proposeFromDocument({ deal, doc, pages, now = Date.now() }) {
  try {
    if (!deal || !deal.id || !Array.isArray(pages)) return { added: 0, filed: 0 };
    let cands = extractCandidates({ pages, role: doc && doc.type });
    // an address the deal already has is nothing to file
    const have = String((deal.figures && deal.figures.address) || '').trim().toLowerCase();
    cands = cands.filter((c) => !(c.kind === 'property' && have && c.address.toLowerCase() === have));
    if (!cands.length) return { added: 0, filed: 0 };
    const existing = await loadItems();
    const fresh = newItems(cands, { dealId: deal.id, confidential: !!deal.confidential, source: { file: (doc && doc.name) || 'document', docRole: (doc && doc.type) || null, sha256: (doc && doc.sha256) || null }, existing, now });
    if (!fresh.length) return { added: 0, filed: 0 };
    await saveItems([...existing, ...fresh]);
    let filed = 0;
    if (await autoOn()) {
      const [contacts, deals, tasks] = await Promise.all([listContacts(), listDeals(), listTasks()]);
      for (const it of fresh) {
        if (it.data.kind === 'property') continue;
        const scope = matchScope(contacts, deals.some((x) => x.id === deal.id) ? deals : [...deals, deal], it.dealId);
        const matches = it.data.kind === 'contact' ? matchContacts(it.data, contacts, scope) : [];
        if (isClean(it, { matches, tasks })) { await fileItem(it.id, {}, { auto: true }); filed += 1; }
      }
    }
    return { added: fresh.length, filed };
  } catch (e) {
    console.error('To file: could not propose', e);
    return { added: 0, filed: 0 };
  }
}

/** File an item as a new record: a contact, a task, or (property) the deal's blank address. `deps.updateDeal` is dealui's. */
export async function fileItem(id, deps = {}, { auto = false } = {}) {
  const items = await loadItems();
  const it = items.find((x) => x.id === id);
  if (!it || it.status !== 'pending') return null;
  const d = it.data;
  const now = Date.now();
  if (d.kind === 'contact') {
    const rec = await saveContact(newContact(it, undefined, now));
    it.result = { contactId: rec.id };
  } else if (d.kind === 'task') {
    const t = await addTask({ title: d.title, due: d.due, dealId: it.dealId, source: 'document', note: `From ${it.source.file}, page ${it.source.page}` });
    it.result = { taskId: t.id };
  } else if (d.kind === 'property') {
    if (!deps.updateDeal || !it.dealId) throw new Error('The deal could not be opened.');
    let wrote = false;
    await deps.updateDeal(it.dealId, (deal) => {
      if (String((deal.figures && deal.figures.address) || '').trim()) return false; // a typed address is never overwritten
      deal.figures = { ...(deal.figures || {}), address: d.address };
      wrote = true;
      return true;
    }, { label: `Address filled from ${it.source.file}, page ${it.source.page}` });
    if (!wrote) throw new Error('The deal already has an address: it is kept as typed.');
    it.result = { address: d.address };
  } else throw new Error('Unknown item.');
  it.status = 'filed';
  it.auto = !!auto;
  it.doneAt = now;
  await saveItems(items);
  return it;
}

/** Merge a contact item into an existing contact. `choice` answers each conflict ('keep' or 'use'); see inbox.js mergeInto. */
export async function mergeItem(id, targetId, choice = {}) {
  const items = await loadItems();
  const it = items.find((x) => x.id === id);
  if (!it || it.status !== 'pending' || it.data.kind !== 'contact') return { ok: false, missing: [] };
  const target = (await listContacts()).find((c) => c.id === targetId);
  if (!target) throw new Error('That contact is no longer here.');
  const r = mergeInto(it, target, choice);
  if (!r.ok) return r;
  await saveContact(r.record);
  it.status = 'merged';
  it.result = { mergedInto: targetId, undo: r.undo };
  it.doneAt = Date.now();
  await saveItems(items);
  return { ok: true };
}

export const dismissItem = (id) => patch(id, (it) => { if (it.status === 'pending') { it.status = 'dismissed'; it.doneAt = Date.now(); } });

/** Undo a filing, a merge or a dismissal: what a filing made is removed, what a merge changed is put back. */
export async function undoItem(id, deps = {}) {
  const items = await loadItems();
  const it = items.find((x) => x.id === id);
  if (!it || it.status === 'pending') return null;
  const r = it.result || {};
  if (it.status === 'filed') {
    if (r.contactId) await deleteContact(r.contactId);
    if (r.taskId) await deleteTask(r.taskId);
    if (r.address && deps.updateDeal && it.dealId) await deps.updateDeal(it.dealId, (deal) => { if ((deal.figures || {}).address !== r.address) return false; deal.figures = { ...deal.figures, address: '' }; return true; }, { label: 'Address filled from a document: undone' });
  } else if (it.status === 'merged' && r.mergedInto) {
    const target = (await listContacts()).find((c) => c.id === r.mergedInto);
    if (target) await saveContact(undoMerge(target, r.undo, it.dealId));
  }
  it.status = 'pending';
  delete it.result;
  delete it.doneAt;
  delete it.auto;
  await saveItems(items);
  return it;
}

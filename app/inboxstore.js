/* inboxstore.js -- the To file inbox on this device: the items (kv 'inbox.items'), the one setting (kv 'inbox.prefs'),
 * proposing from a document that was just read, and filing, merging, dismissing and undoing. The rules are in inbox.js;
 * this file only reads and writes. Nothing here uses the network.
 *
 * Every write goes through one queue (`serial`): readers hand over documents at the same time (Start from documents
 * reads several at once), and an unqueued read-modify-write of the one list would lose items or file a person twice. */

import * as store from './store.js';
import * as crm from './crm.js';
import { kvTooNew } from './migrate.js';
import { extractCandidates, newItems, trim, readItems, newContact, mergeInto, undoMerge, matchContacts, matchScope, isClean } from './inbox.js';

const ITEMS = 'inbox.items';
const PREFS = 'inbox.prefs';
const changed = () => { try { document.dispatchEvent(new CustomEvent('inboxchange')); } catch { /* no page (a test) */ } };

/** What this file reads and writes through; a test swaps in memory ones (_useIO). */
const realIO = { kvGet: store.kvGet, kvSet: store.kvSet, listDeals: store.listDeals, listContacts: crm.listContacts, saveContact: crm.saveContact, deleteContact: crm.deleteContact, listTasks: crm.listTasks, addTask: crm.addTask, deleteTask: crm.deleteTask };
let io = realIO;
/** @type {Promise<any>} */
let chain = Promise.resolve();
/** Run `fn` after every earlier write has finished; a failure is the caller's, and never stops the queue. */
const serial = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
/** For tests only: the storage to use (null for the real one), and a fresh queue. @param {any} x */
export const _useIO = (x) => { io = x || realIO; chain = Promise.resolve(); };

export const CHANGED_SINCE = 'This changed since it was filed; nothing was undone.';

export async function loadItems() { return readItems(await io.kvGet(ITEMS)); }
async function saveItems(items) {
  // an item a newer version wrote is kept as it is: readItems leaves it out of the list, so it is put back here
  const raw = await io.kvGet(ITEMS);
  const ahead = Array.isArray(raw) ? raw.filter((x) => x && typeof x === 'object' && (x.v || 1) > 1) : [];
  if (!(await io.kvSet(ITEMS, [...trim(items), ...ahead]))) throw new Error('This device would not save that (storage is full or blocked).');
  changed();
}
export async function autoOn() { const p = await io.kvGet(PREFS); return !!(p && p.auto === true); }
export const setAuto = (/** @type {boolean} */ on) => serial(async () => { if (!(await io.kvSet(PREFS, { v: 1, auto: !!on }))) throw new Error('This device would not save that setting.'); changed(); });

/** Load the list, let `fn` change it, save it: one step, inside the queue. @param {(items: any[]) => Promise<any>} fn */
const modify = (fn) => serial(async () => fn(await loadItems()));

/**
 * A document was just read on `deal`: its people, property and dates become proposed items (nothing else changes).
 * With the automatic switch on, items that are clean are filed at once, each against the people already filed
 * (including the ones filed a moment ago in this same pass). Never throws: a failure here must not touch the read.
 * @param {{ deal: any, doc: { name?: string, sha256?: string | null, type?: string | null }, pages: string[], now?: number }} o
 * @returns {Promise<{ added: number, filed: number }>}
 */
export function proposeFromDocument({ deal, doc, pages, now = Date.now() }) {
  if (!deal || !deal.id || !Array.isArray(pages)) return Promise.resolve({ added: 0, filed: 0 });
  return serial(async () => {
    try {
      let cands = extractCandidates({ pages, role: doc && doc.type });
      // an address the deal already has is nothing to file
      const have = String((deal.figures && deal.figures.address) || '').trim().toLowerCase();
      cands = cands.filter((c) => !(c.kind === 'property' && have && c.address.toLowerCase() === have));
      if (!cands.length) return { added: 0, filed: 0 };
      const existing = await loadItems();
      const fresh = newItems(cands, { dealId: deal.id, source: { file: (doc && doc.name) || 'document', docRole: (doc && doc.type) || null, sha256: (doc && doc.sha256) || null }, existing, now });
      if (!fresh.length) return { added: 0, filed: 0 };
      await saveItems([...existing, ...fresh]);
      let filed = 0;
      if (await autoOn()) {
        const deals = await io.listDeals();
        let contacts = await io.listContacts();
        let tasks = await io.listTasks();
        const all = deals.some((x) => x.id === deal.id) ? deals : [...deals, deal];
        for (const it of fresh) {
          if (it.data.kind === 'property') continue;
          const matches = it.data.kind === 'contact' ? matchContacts(it.data, contacts, matchScope(contacts, all, it.dealId)) : [];
          if (!isClean(it, { matches, tasks })) continue;
          if (await fileNow(it.id, {}, { auto: true })) {
            filed += 1;
            // the next item is matched against what was just filed
            if (it.data.kind === 'contact') contacts = await io.listContacts(); else tasks = await io.listTasks();
          }
        }
      }
      return { added: fresh.length, filed };
    } catch (e) {
      console.error('To file: could not propose', e);
      return { added: 0, filed: 0 };
    }
  });
}

const taskSnap = (t) => ({ title: t.title, due: t.due || null, done: !!t.done, dealId: t.dealId || null, contactId: t.contactId || null, note: t.note || '' });

/** The filing itself, inside the queue. @param {string} id @param {any} deps @param {{ auto?: boolean }} opts */
async function fileNow(id, deps = {}, { auto = false } = {}) {
  const items = await loadItems();
  const it = items.find((x) => x.id === id);
  if (!it || it.status !== 'pending') return null;
  const d = it.data;
  const now = Date.now();
  if (d.kind === 'contact') {
    const rec = await io.saveContact(newContact(it, undefined, now));
    it.result = { contactId: rec.id, updatedAt: rec.updatedAt };
  } else if (d.kind === 'task') {
    const t = await io.addTask({ title: d.title, due: d.due, dealId: it.dealId, source: 'document', note: `From ${it.source.file}, page ${it.source.page}` });
    it.result = { taskId: t.id, snap: taskSnap(t) };
  } else if (d.kind === 'property') {
    if (!deps.updateDeal || !it.dealId) throw new Error('The deal could not be opened.');
    let wrote = false;
    await deps.updateDeal(it.dealId, (/** @type {any} */ deal) => {
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

/** File an item as a new record: a contact, a task, or (property) the deal's blank address. `deps.updateDeal` is dealui's. */
export const fileItem = (/** @type {string} */ id, deps = {}, opts = {}) => serial(() => fileNow(id, deps, opts));

/** Merge a contact item into an existing contact. `choice` answers each conflict ('keep' or 'use'); see inbox.js mergeInto. */
export const mergeItem = (/** @type {string} */ id, /** @type {string} */ targetId, choice = {}) => modify(async (items) => {
  const it = items.find((x) => x.id === id);
  if (!it || it.status !== 'pending' || it.data.kind !== 'contact') return { ok: false, missing: [] };
  const target = (await io.listContacts()).find((c) => c.id === targetId);
  if (!target) throw new Error('That contact is no longer here.');
  const r = mergeInto(it, target, choice);
  if (!r.ok) return r;
  await io.saveContact(r.record);
  it.status = 'merged';
  it.result = { mergedInto: targetId, undo: r.undo };
  it.doneAt = Date.now();
  await saveItems(items);
  return { ok: true };
});

export const dismissItem = (/** @type {string} */ id) => modify(async (items) => {
  const it = items.find((x) => x.id === id);
  if (!it) return null;
  if (it.status === 'pending') { it.status = 'dismissed'; it.doneAt = Date.now(); await saveItems(items); }
  return it;
});

/**
 * Undo a filing, a merge or a dismissal: what a filing made is removed, what a merge changed is put back. A contact or
 * task is removed only if it is still exactly what filing made (not edited since, nothing else added to it); otherwise
 * this throws CHANGED_SINCE and changes nothing.
 */
export const undoItem = (/** @type {string} */ id, /** @type {any} */ deps = {}) => modify(async (items) => {
  const it = items.find((x) => x.id === id);
  if (!it || it.status === 'pending') return null;
  const r = it.result || {};
  if (it.status === 'filed') {
    if (r.contactId) {
      const c = (await io.listContacts()).find((x) => x.id === r.contactId);
      if (c) {
        const ours = (c.sources || []).length === 1 && c.sources[0].itemId === it.id;
        if (!ours || c.updatedAt !== r.updatedAt || kvTooNew('crm.contacts', c)) throw new Error(CHANGED_SINCE);
        await io.deleteContact(r.contactId);
      }
    }
    if (r.taskId) {
      const t = (await io.listTasks()).find((x) => x.id === r.taskId);
      if (t) {
        if (JSON.stringify(taskSnap(t)) !== JSON.stringify(r.snap)) throw new Error(CHANGED_SINCE);
        await io.deleteTask(r.taskId);
      }
    }
    if (r.address && deps.updateDeal && it.dealId) await deps.updateDeal(it.dealId, (/** @type {any} */ deal) => { if ((deal.figures || {}).address !== r.address) return false; deal.figures = { ...deal.figures, address: '' }; return true; }, { label: 'Address filled from a document: undone' });
  } else if (it.status === 'merged' && r.mergedInto) {
    const target = (await io.listContacts()).find((c) => c.id === r.mergedInto);
    if (target) await io.saveContact(undoMerge(target, r.undo, it.dealId));
  }
  it.status = 'pending';
  delete it.result;
  delete it.doneAt;
  delete it.auto;
  await saveItems(items);
  return it;
});

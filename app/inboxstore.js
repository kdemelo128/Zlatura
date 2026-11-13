/* inboxstore.js -- the To file inbox on this device: the items (kv 'inbox.items'), the one setting (kv 'inbox.prefs'),
 * proposing from a document that was just read, and filing, merging, dismissing and undoing. The rules are in inbox.js;
 * this file only reads and writes. Nothing here uses the network.
 *
 * Every write goes through one queue (`serial`): readers hand over documents at the same time (Start from documents
 * reads several at once), and an unqueued read-modify-write of the one list would lose items or file a person twice. */

import * as store from './store.js';
import * as crm from './crm.js';
import { kvTooNew } from './migrate.js';
import { extractCandidates, newItems, trim, readItems, newContact, mergeInto, undoMerge, matchContacts, matchScope, isClean, inScope, dealScope, MAX_ITEMS, upToDate, matchDeals, batchKind, FROM_FILE, newDealFields, applyDealMerge, undoDealMerge } from './inbox.js';

const ITEMS = 'inbox.items';
const PREFS = 'inbox.prefs';
const changed = () => { try { document.dispatchEvent(new CustomEvent('inboxchange')); } catch { /* no page (a test) */ } };

/** What this file reads and writes through; a test swaps in memory ones (_useIO). */
const realIO = { kvGet: store.kvGet, kvSet: store.kvSet, listDeals: store.listDeals, listContacts: crm.listContacts, saveContact: crm.saveContact, deleteContact: crm.deleteContact, listTasks: crm.listTasks, addTask: crm.addTask, deleteTask: crm.deleteTask, addActivity: crm.addActivity, removeActivity: crm.removeActivity, listActivity: crm.listActivity };
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

/** The filing itself, inside the queue. @param {string} id @param {any} deps @param {{ auto?: boolean, batch?: string | null }} opts */
async function fileNow(id, deps = {}, { auto = false, batch = null } = {}) {
  const items = await loadItems();
  const it = items.find((x) => x.id === id);
  if (!it || it.status !== 'pending') return null;
  const d = it.data;
  const now = Date.now();
  if (d.kind === 'contact') {
    const rec = await io.saveContact(newContact(it, undefined, now));
    it.result = { contactId: rec.id, updatedAt: rec.updatedAt };
  } else if (d.kind === 'task') {
    const t = await io.addTask({ title: d.title, due: d.due, dealId: it.dealId, source: 'document', note: it.source.kind && it.source.kind !== 'document' ? [`From ${it.source.file}`, d.note].filter(Boolean).join(': ') : `From ${it.source.file}, page ${it.source.page}` });
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
  } else if (d.kind === 'activity') {
    // the people on it that are already contacts (by email, never one on a confidential deal the activity is not on)
    const contacts = await io.listContacts();
    const scope = matchScope(contacts, await io.listDeals(), it.dealId);
    const ids = [...new Set((d.people || []).flatMap((e) => matchContacts({ email: e }, contacts, scope).filter((m) => m.level === 'same').map((m) => m.id)))];
    const rec = await io.addActivity({ type: d.type, text: d.text, dealId: it.dealId, at: d.at ?? now, source: { kind: it.source.kind, file: it.source.file }, contactIds: ids });
    it.result = { activityId: rec.id };
  } else if (d.kind === 'deal') {
    if (!deps.createDeal) throw new Error('The deal could not be made.');
    const deal = await deps.createDeal(newDealFields(it, now), `Deal made from ${it.source.file}`);
    it.result = { dealId: deal.id, updatedAt: deal.updatedAt };
  } else throw new Error('Unknown item.');
  it.status = 'filed';
  if (batch) it.batch = batch;
  it.auto = !!auto;
  it.doneAt = now;
  await saveItems(items);
  return it;
}

/** File an item as a new record: a contact, a task, or (property) the deal's blank address. `deps.updateDeal` is dealui's. */
export const fileItem = (/** @type {string} */ id, deps = {}, opts = {}) => serial(() => fileNow(id, deps, opts));

/** Merge a contact item into an existing contact. `choice` answers each conflict ('keep' or 'use'); see inbox.js mergeInto. */
const mergeNow = async (/** @type {string} */ id, /** @type {string} */ targetId, choice = {}, { batch = null } = {}) => {
  const items = await loadItems();
  const it = items.find((x) => x.id === id);
  if (!it || it.status !== 'pending' || it.data.kind !== 'contact') return { ok: false, missing: [] };
  const target = (await io.listContacts()).find((c) => c.id === targetId);
  if (!target) throw new Error('That contact is no longer here.');
  const r = mergeInto(it, target, choice);
  if (!r.ok) return r;
  await io.saveContact(r.record);
  it.status = 'merged';
  it.result = { mergedInto: targetId, undo: r.undo };
  if (batch) it.batch = batch;
  it.doneAt = Date.now();
  await saveItems(items);
  return { ok: true };
};
export const mergeItem = (/** @type {string} */ id, /** @type {string} */ targetId, choice = {}) => serial(() => mergeNow(id, targetId, choice));

/** Add what an imported deal row brings (its id, a closing date the deal lacks) to a deal it matches; the deal's own values stay. `deps.updateDeal` is dealui's. */
const mergeDealNow = async (/** @type {string} */ id, /** @type {string} */ dealId, /** @type {any} */ deps, { batch = null } = {}) => {
  const items = await loadItems();
  const it = items.find((x) => x.id === id);
  if (!it || it.status !== 'pending' || it.data.kind !== 'deal' || !deps.updateDeal) return { ok: false };
  let undo = null;
  const d = await deps.updateDeal(dealId, (/** @type {any} */ deal) => { if (deal.confidential) return false; undo = applyDealMerge(it, deal); return !!(undo.ext || undo.keyId); }, { label: `Updated from ${it.source.file}` });
  if (!d) throw new Error('That deal is no longer here.');
  it.status = 'merged';
  it.result = { mergedDeal: dealId, undoDeal: undo || { ext: null, keyId: null } };
  if (batch) it.batch = batch;
  it.doneAt = Date.now();
  await saveItems(items);
  return { ok: true };
};
export const mergeDealItem = (/** @type {string} */ id, /** @type {string} */ dealId, deps = {}) => serial(() => mergeDealNow(id, dealId, deps));

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
const undoNow = async (/** @type {string} */ id, /** @type {any} */ deps = {}) => {
  const items = await loadItems();
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
    if (r.activityId) await io.removeActivity(r.activityId);
    if (r.dealId) {
      const dl = (await io.listDeals()).find((x) => x.id === r.dealId);
      if (dl) {
        if (dl.updatedAt !== r.updatedAt || !deps.discardDeal) throw new Error(CHANGED_SINCE);
        await deps.discardDeal(r.dealId);
      }
    }
    if (r.address && deps.updateDeal && it.dealId) await deps.updateDeal(it.dealId, (/** @type {any} */ deal) => { if ((deal.figures || {}).address !== r.address) return false; deal.figures = { ...deal.figures, address: '' }; return true; }, { label: 'Address filled from a document: undone' });
  } else if (it.status === 'merged' && r.mergedInto) {
    const target = (await io.listContacts()).find((c) => c.id === r.mergedInto);
    if (target) await io.saveContact(undoMerge(target, r.undo, it.dealId));
  } else if (it.status === 'merged' && r.mergedDeal && deps.updateDeal) {
    await deps.updateDeal(r.mergedDeal, (/** @type {any} */ deal) => { undoDealMerge(deal, r.undoDeal); return true; }, { label: 'Update from a file: undone' });
  }
  it.status = 'pending';
  delete it.result;
  delete it.doneAt;
  delete it.auto;
  delete it.batch;
  await saveItems(items);
  return it;
};
export const undoItem = (/** @type {string} */ id, /** @type {any} */ deps = {}) => serial(() => undoNow(id, deps));

/** Undo every item of one batch (one "File all" tap). Returns { undone, kept }: a record changed since is kept, as one Undo would keep it. */
export const undoBatch = (/** @type {string} */ batch, /** @type {any} */ deps = {}) => serial(async () => {
  const ids = (await loadItems()).filter((x) => x.batch === batch && x.status !== 'pending').map((x) => x.id);
  let undone = 0; let kept = 0;
  for (const id of ids) { try { await undoNow(id, deps); undone += 1; } catch { kept += 1; } }
  return { undone, kept };
});

/**
 * Rows from a file the person chose (a CRM, deal or tenant export; a calendar or email file) become proposed items, each on the
 * deal it names (`dealId` on the candidate) or on none.
 * A row that changes nothing is counted and not proposed; a row seen before (in any state) is not proposed again;
 * a pending row whose values changed replaces its older pending copy. At most 500 items wait at once: the rest are
 * counted in `left`, and importing the same file again continues where this stopped. Never files anything.
 * @param {{ cands: any[], source: { kind?: string, file: string, docRole?: string | null, sha256?: string | null }, now?: number }} o
 * @returns {Promise<{ added: number, replaced: number, unchanged: number, seen: number, flagged: number, left: number }>}
 */
export function proposeRows({ cands, source, now = Date.now() }) {
  return serial(async () => {
    const [existing, deals, contacts] = await Promise.all([loadItems(), io.listDeals(), io.listContacts()]);
    // each record names its deal (or none): matched and kept apart per deal, so a confidential deal's records stay inside it
    const byDeal = new Map();
    for (const c of cands) {
      const { dealId = null, ...data } = c;
      const id = dealId && deals.some((d) => d.id === dealId) ? dealId : null;
      byDeal.set(id, [...(byDeal.get(id) || []), data]);
    }
    const keep = [];
    let unchanged = 0; let seen = 0;
    for (const [dealId, list] of byDeal) {
      const scope = matchScope(contacts, deals, dealId);
      const fresh = [];
      for (const c of list) { if (upToDate(c, contacts, deals, scope, dealId)) unchanged += 1; else fresh.push(c); }
      const made = newItems(fresh, { dealId, source: { ...source, kind: source.kind || 'import' }, existing: [...existing, ...keep], now });
      seen += fresh.length - made.length;
      keep.push(...made);
    }
    const room = Math.max(0, MAX_ITEMS - existing.filter((x) => x.status === 'pending').length);
    const take = keep.slice(0, room);
    const ids = new Set(take.map((x) => x.data.idKey).filter(Boolean));
    const base = existing.filter((x) => !(x.status === 'pending' && x.data.idKey && ids.has(x.data.idKey)));
    const replaced = existing.length - base.length;
    if (take.length) await saveItems([...base, ...take]);
    return { added: take.length, replaced, unchanged, seen, flagged: take.filter((x) => x.data.suspicious).length, left: keep.length - take.length };
  });
}

/**
 * One tap files or merges many waiting items from files (those with no deal). `mode` 'new': contacts that match nobody and are not
 * flagged. 'updates': a contact or deal with exactly one match by id or email whose merge only fills blanks (no conflict).
 * Everything is one batch, undone together (undoBatch). Returns { batch, filed, merged, kept } where `kept` could not be done.
 * @param {'new' | 'updates'} mode @param {any} deps
 */
export const fileBatch = (mode, deps = {}) => serial(async () => {
  const batch = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const [items, deals] = [await loadItems(), await io.listDeals()];
  const scope = dealScope(deals);
  let contacts = await io.listContacts();
  const out = { batch, filed: 0, merged: 0, kept: 0 };
  for (const it of items.filter((x) => x.status === 'pending' && FROM_FILE.has(x.source && x.source.kind) && inScope(x, scope) && !scope.secret.has(x.dealId))) {
    if (batchKind(it, contacts, deals) !== mode) continue;
    try {
      if (it.data.kind === 'contact') {
        if (mode === 'new') { if (await fileNow(it.id, deps, { batch })) out.filed += 1; }
        else {
          const m = matchContacts(it.data, contacts, matchScope(contacts, deals, it.dealId));
          if ((await mergeNow(it.id, m[0].id, {}, { batch })).ok) out.merged += 1;
        }
        contacts = await io.listContacts();
      } else if (it.data.kind === 'deal') {
        const m = matchDeals(it.data, deals);
        if ((await mergeDealNow(it.id, m[0].id, deps, { batch })).ok) out.merged += 1;
      } else if (await fileNow(it.id, deps, { batch })) out.filed += 1;
    } catch { out.kept += 1; }
  }
  return out;
});

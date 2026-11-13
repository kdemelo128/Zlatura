/* crm.js -- tasks, contacts, the activity log and the list of deliverables,
 * kept on this device next to the deals (IndexedDB, through store.js). A
 * deal's stage lives on the deal itself. */

import { kvGet, kvSet } from './store.js';
import { applyStageConfig } from './pipeline.js';
import { migrateKvRecord, kvVersion, kvTooNew } from './migrate.js';

const K = { tasks: 'crm.tasks', contacts: 'crm.contacts', activity: 'crm.activity' };
export const MAX_ACTIVITY = 500;
/** Whether `adding` more entries fit in a log of `have` without dropping the oldest. */
export const activityRoom = (have, adding) => have + adding <= MAX_ACTIVITY;
const id = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function list(key) { return (await kvGet(key)) || []; }
async function put(key, items) {
  if (!(await kvSet(key, items))) throw new Error('This device would not save that (storage is full or blocked).');
  document.dispatchEvent(new CustomEvent('crmchange', { detail: key }));
  return items;
}

/* ------------------------------------------------------------------ tasks */

export const listTasks = () => list(K.tasks);
export async function addTask({ title, due = null, dealId = null, contactId = null, source = 'typed', note = '' }) {
  const t = { id: id('t'), title: String(title || '').trim(), due: due || null, dealId, contactId, source, note, done: false, doneAt: null, createdAt: Date.now() };
  if (!t.title) throw new Error('A task needs a title.');
  await put(K.tasks, [...(await listTasks()), t]);
  await log('task', `Task added: ${t.title}`, dealId);
  return t;
}
export async function updateTask(tid, change) {
  const all = await listTasks();
  const t = all.find((x) => x.id === tid);
  if (!t) return null;
  const wasDone = t.done;
  Object.assign(t, change);
  if (change.done === true && !wasDone) t.doneAt = Date.now();
  if (change.done === false) t.doneAt = null;
  await put(K.tasks, all);
  if (change.done === true && !wasDone) await log('task', `Done: ${t.title}`, t.dealId);
  return t;
}
export async function deleteTask(tid) {
  const all = await listTasks();
  const t = all.find((x) => x.id === tid);
  await put(K.tasks, all.filter((x) => x.id !== tid));
  return t;
}
export async function restoreTask(t) { await put(K.tasks, [...(await listTasks()).filter((x) => x.id !== t.id), t]); }

/* --------------------------------------------------------------- contacts */

/** Every contact, an older one brought up to the current shape in memory (migrate.js); it is written back only when saved. */
export const listContacts = async () => (await list(K.contacts)).map((c) => (c && typeof c === 'object' && (c.v || 1) < kvVersion(K.contacts) ? migrateKvRecord(K.contacts, c) : c));
export async function saveContact(c) {
  const all = await listContacts();
  const now = Date.now();
  const rec = { id: c.id || id('c'), name: String(c.name || '').trim(), company: c.company || '', role: c.role || 'Other', phone: c.phone || '', email: c.email || '', notes: c.notes || '', dealIds: [...new Set(c.dealIds || [])], createdAt: c.createdAt || now, updatedAt: now, v: kvVersion(K.contacts), sources: Array.isArray(c.sources) ? c.sources : [], otherValues: c.otherValues && typeof c.otherValues === 'object' ? c.otherValues : {} };
  if (!rec.name) throw new Error('A contact needs a name.');
  const i = all.findIndex((x) => x.id === rec.id);
  // a contact a newer version saved is left exactly as it is: this version would drop what it does not know
  if (i >= 0 && kvTooNew(K.contacts, all[i])) throw new Error('That contact was saved by a newer version of the app, so this version will not change it.');
  if (i >= 0) all[i] = rec; else all.push(rec);
  await put(K.contacts, all);
  if (i < 0) await log('contact', `Contact added: ${rec.name}${rec.company ? `, ${rec.company}` : ''}`, rec.dealIds[0] || null);
  return rec;
}
export async function deleteContact(cid) {
  const all = await listContacts();
  const c = all.find((x) => x.id === cid);
  await put(K.contacts, all.filter((x) => x.id !== cid));
  return c;
}
export async function restoreContact(c) { await put(K.contacts, [...(await listContacts()).filter((x) => x.id !== c.id), c]); }
export async function linkContact(cid, dealId, on = true) {
  const all = await listContacts();
  const c = all.find((x) => x.id === cid);
  if (!c) return null;
  c.dealIds = on ? [...new Set([...(c.dealIds || []), dealId])] : (c.dealIds || []).filter((x) => x !== dealId);
  await put(K.contacts, all);
  return c;
}

/* ----------------------------------------------------------------- stages */

/** The firm's names for the stages, and which are hidden; applied to every screen. */
export async function loadStages() { const c = (await kvGet('crm.stages')) || {}; applyStageConfig(c); return c; }
export async function saveStages(cfg) { await put('crm.stages', cfg); applyStageConfig(cfg); }

/* --------------------------------------------------- activity, deliverables */

export const listActivity = () => list(K.activity);
/** type: stage | task | contact | deliverable | ai | deal */
export async function log(type, text, dealId = null, extra = {}) {
  const all = await listActivity();
  all.push({ id: id('a'), at: Date.now(), type, text, dealId, ...extra });
  if (all.length > MAX_ACTIVITY) all.splice(0, all.length - MAX_ACTIVITY);
  return put(K.activity, all);
}

/** An activity made with its own time (a meeting or email filed from a file) and what it came from; resolves to the record. */
export async function addActivity({ type, text, dealId = null, at = Date.now(), source = null, contactIds = [], approx = false }) {
  const rec = { id: id('a'), at, type, text, dealId, ...(approx ? { approx: true } : {}), ...(source ? { source } : {}), ...(contactIds.length ? { contactIds } : {}) };
  const all = await listActivity();
  // never drop the oldest entries to make room: a filing that does not fit is refused and the item stays in To file
  if (!activityRoom(all.length, 1)) throw new Error(`The activity log is full (${MAX_ACTIVITY} entries), so nothing was added and the oldest entries were kept. Free room by deleting entries, then file again.`);
  all.push(rec);
  await put(K.activity, all);
  return rec;
}
export async function removeActivity(aid) { await put(K.activity, (await listActivity()).filter((a) => a.id !== aid)); }

/** Everything CRM, for the backup. */
export async function exportCrm() { return { tasks: await listTasks(), contacts: await listContacts(), activity: await listActivity() }; }
export async function importCrm({ tasks = [], contacts = [], activity = [] }) {
  await put(K.tasks, tasks);
  await put(K.contacts, contacts);
  await put(K.activity, activity);
}

/* mydata.js -- the Connect page's "My data" tab, as numbers: how many of each kind of thing this device holds, and what
 * the browser says about space. Pure: the caller reads the stores (connectui.js) and passes what it read.
 *
 * Every stored key must be accounted for: KEY_KIND names the kind each kv key belongs to, and tests/mydata.test.js fails
 * when a key in backup.js's KV_KEYS has no kind, so a new store cannot be added without a row here. */

import { loadComps } from './costar.js';

/** The kinds, in the order shown. `where` says where it lives; `backup` whether a backup carries it. */
export const KINDS = Object.freeze([
  { id: 'deals', label: 'Deals', noun: ['deal', 'deals'], where: 'This browser’s database', backup: true },
  { id: 'contacts', label: 'Contacts', noun: ['contact', 'contacts'], where: 'This browser’s database', backup: true },
  { id: 'tasks', label: 'Tasks', noun: ['task', 'tasks'], where: 'This browser’s database', backup: true },
  { id: 'comps', label: 'Comps', noun: ['comp', 'comps'], where: 'This browser’s database (the comp set)', backup: true },
  { id: 'documents', label: 'Documents', noun: ['document', 'documents'], where: 'Inside each deal’s Documents list', backup: true },
  { id: 'templates', label: 'Templates', noun: ['template', 'templates'], where: 'This browser’s database', backup: true },
  { id: 'scenarios', label: 'Scenarios', noun: ['scenario', 'scenarios'], where: 'This browser’s database (Tools)', backup: true },
  { id: 'projects', label: 'Tool projects', noun: ['project', 'projects'], where: 'This browser (quick underwritings and the Underwrite tool)', backup: true },
  { id: 'activity', label: 'Activity', noun: ['entry', 'entries'], where: 'This browser’s database', backup: true },
  { id: 'inbox', label: 'To file', noun: ['item', 'items'], where: 'This browser’s database (proposed records, waiting and finished)', backup: true },
  { id: 'briefs', label: 'Research briefs', noun: ['brief', 'briefs'], where: 'This browser’s database', backup: true },
  { id: 'settings', label: 'Settings', noun: ['setting', 'settings'], where: 'This browser’s database', backup: true },
]);

/** Which kind each kv key counts toward ('' = not a count of its own: see the comment). */
export const KEY_KIND = Object.freeze({
  'tpl.library': 'templates', template: 'templates',
  'crm.tasks': 'tasks', 'crm.contacts': 'contacts', 'crm.activity': 'activity',
  'tools.scenarios': 'scenarios', 'uw.scratch': 'projects', 'research.briefs': 'briefs', 'inbox.items': 'inbox',
  'crm.stages': 'settings', conventions: 'settings', output: 'settings', 't12.labels': 'settings', 'rr.layouts': 'settings',
  'comps.mappings': 'settings', 'import.mappings': 'settings', 'ui.prefs': 'settings', 'inbox.prefs': 'settings', 'ai.settings': 'settings',
  'backup.last': '', // the date of the last backup, shown on its own line
});

const len = (v) => (Array.isArray(v) ? v.length : 0);
const present = (v) => (v === null || v === undefined ? 0 : 1);

/**
 * How many of each kind are stored. `deals` are the stored deals, `kv` every small value, `session` the saved comp set
 * ({ docs, manual, ... } or null) and `local` the browser-storage values by key (the Underwrite tool's project is 'uw-v3').
 * A count is of records, never of bytes; a value of the wrong shape counts as none.
 */
export function countKinds({ deals = [], kv = /** @type {Record<string, any>} */ ({}), session = null, local = /** @type {Record<string, string>} */ ({}) } = {}) {
  const n = Object.fromEntries(KINDS.map((k) => [k.id, 0]));
  n.deals = len(deals);
  n.contacts = len(kv['crm.contacts']);
  n.tasks = len(kv['crm.tasks']);
  n.activity = len(kv['crm.activity']);
  n.briefs = len(kv['research.briefs']);
  n.inbox = len(kv['inbox.items']);
  n.templates = len(kv['tpl.library']) + present(kv['template']);
  const sc = kv['tools.scenarios'];
  n.scenarios = sc && typeof sc === 'object' && !Array.isArray(sc) ? Object.values(sc).reduce((a, l) => a + len(l), 0) : 0;
  n.projects = len(kv['uw.scratch']) + (local['uw-v3'] ? 1 : 0);
  n.documents = (deals || []).reduce((a, d) => a + len(d && d.dd && d.dd.docs), 0);
  for (const [k, kind] of Object.entries(KEY_KIND)) if (kind === 'settings') n.settings += present(kv[k]);
  // the comp set: the comps typed or kept by hand, and every comp the saved reports read to
  if (session) {
    n.comps = len(session.manual);
    if (len(session.docs)) {
      try { const r = loadComps(session.docs, { cap: false }); n.comps += len(r.sales) + len(r.market); } catch { /* a report that no longer reads counts none */ }
    }
  }
  return n;
}

export const mb = (b) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/**
 * What to say about space, from navigator.storage.estimate() ({ usage, quota } or nulls). Without an estimate the
 * line says the browser does not report it; nothing is guessed. `share` is 0 to 1, or null.
 */
export function storageLine({ usage = null, quota = null, persisted = null } = {}) {
  const ok = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  const keep = persisted === true ? ' The browser has agreed not to clear it when space runs short.' : persisted === false ? ' The browser may clear it if the device runs short of space.' : '';
  if (!ok(usage)) return { share: null, text: `This browser does not say how much space this app uses or how much it allows.${keep}` };
  if (!ok(quota) || quota === 0) return { share: null, text: `${mb(usage)} used. This browser does not say how much it allows.${keep}` };
  return { share: Math.min(1, usage / quota), text: `${mb(usage)} used of about ${mb(quota)} the browser allows (${usage / quota < 0.01 ? 'under 1' : Math.round((usage / quota) * 100)}%).${keep}` };
}

/** "3 deals", "1 deal". */
export const countText = (kind, n) => `${n} ${kind.noun[n === 1 ? 0 : 1]}`;

/** The space line for document text: what share of the limit is used, and plainly when it is full. `limit` is doctext.js DOCTEXT_LIMIT. */
export const docTextLimitLine = ({ bytes = 0 } = {}, limit = 50 * 1048576) => (bytes >= limit
  ? `Document text has reached its ${mb(limit)} limit, so no more is kept until you forget some. Documents you add are still searchable until you leave.`
  : `Document text may take up to ${mb(limit)} on this device.`);

/** What document text is kept: "3 documents, 1.2 MB", or none. `stats` is { docs, bytes } (docmem.js). */
export const docTextLine = ({ docs = 0, bytes = 0 } = {}) => (docs ? `${docs} ${docs === 1 ? 'document' : 'documents'}, ${mb(bytes)}` : 'none kept');

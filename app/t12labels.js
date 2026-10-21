/* t12labels.js -- the T-12 labels the broker has filed, remembered on this
 * device (kv `t12.labels`): { entries: { normalised label: { category, at,
 * deals?: [{ deal, category, at }] } } }. `category` and `at` are the latest
 * choice; `deals` holds one item per deal (filing again in the same deal
 * replaces that deal's item), the newest 50, oldest first, so a suggestion
 * can say "mapped this way in 6 of your last 7 deals". Only the label, the
 * category and a deal id are kept, never an amount or a name. Backups carry
 * them; a merge restore combines them label by label (backup.js). Matching
 * reads them first, as a suggestion (t12.js matchLabel). */

import * as store from './store.js';
import { CATEGORY } from './t12.js';

export const LABELS_KEY = 't12.labels';
export const DEALS_KEPT = 50;

async function read() {
  const v = await store.kvGet(LABELS_KEY);
  return v && v.entries && typeof v.entries === 'object' ? v : { entries: {} };
}
/** The remembered labels both ways: { corrections: { label: category id }, history: { label: entry } }, with no prototype to trip over. */
export async function remembered() {
  const { entries } = await read();
  const corrections = Object.create(null); const history = Object.create(null);
  for (const [k, e] of Object.entries(entries)) if (e && CATEGORY[e.category]) { corrections[k] = e.category; history[k] = e; }
  return { corrections, history };
}
/** { normalised label: category id }, for matchLabel. */
export async function corrections() {
  const { entries } = await read();
  return Object.fromEntries(Object.entries(entries).filter(([, e]) => e && CATEGORY[e.category]).map(([k, e]) => [k, e.category]));
}
/** Every remembered label, newest first: [{ key, category, at }]. */
export async function listLabels() {
  const { entries } = await read();
  return Object.entries(entries).map(([key, e]) => ({ key, ...e })).sort((a, b) => (b.at || 0) - (a.at || 0));
}
/** One label filed (in the deal `dealId`, when given) into the entries in memory; the deal's earlier item is replaced. */
function put(v, key, category, dealId, at) {
  const mine = Object.hasOwn(v.entries, key) && v.entries[key] ? v.entries[key] : null;
  const deals = (mine && Array.isArray(mine.deals) ? mine.deals : []).filter((x) => x && !(dealId && x.deal === dealId));
  if (dealId) deals.push({ deal: String(dealId), category, at });
  v.entries[key] = { category, at, ...(deals.length ? { deals: deals.slice(-DEALS_KEPT) } : {}) };
}
export async function rememberLabel(key, category, dealId = null) {
  if (!key || key === '__proto__' || !CATEGORY[category]) return false;
  const v = await read();
  put(v, key, category, dealId, Date.now());
  return store.kvSet(LABELS_KEY, v);
}
/** Several labels in one write ("Confirm all"): [{ key, category }]. */
export async function rememberLabels(list, dealId = null) {
  const ok = list.filter((x) => x && x.key && x.key !== '__proto__' && CATEGORY[x.category]);
  if (!ok.length) return false;
  const v = await read();
  const at = Date.now();
  for (const x of ok) put(v, x.key, x.category, dealId, at);
  return store.kvSet(LABELS_KEY, v);
}
export async function forgetLabel(key) {
  const v = await read();
  delete v.entries[key];
  return store.kvSet(LABELS_KEY, v);
}

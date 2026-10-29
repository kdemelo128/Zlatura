/* ai.js -- talking to the firm's Zlatura AI server (server/ in this
 * repository). The page itself holds no API key: it holds the server's
 * address and an access token the firm issues, kept on this device. Nothing
 * is sent unless the broker has turned AI on and confirmed the send. */

import { kvGet, kvSet, loadDealStrict, listDealsStrict } from './store.js';
import { listContacts } from './crm.js';
import { matchContacts } from './claims.js';

const KEY = 'ai.settings';
const DEFAULTS = { url: '', token: '', enabled: false };

export async function getSettings() { return { ...DEFAULTS, ...((await kvGet(KEY)) || {}) }; }
export async function saveSettings(s) { return kvSet(KEY, { ...DEFAULTS, ...s, url: String(s.url || '').trim().replace(/\/+$/, '') }); }
export const isReady = (s) => !!(s && s.enabled && s.url && s.token);

export class AiUnavailable extends Error {}
export class AiConfidential extends AiUnavailable {}

const CONFIDENTIAL = 'This deal is marked confidential, so nothing from it is sent to the AI server.';
// which scope each server path accepts; a path or scope not listed here is refused
const SCOPE_OF = { '/api/health': 'health', '/api/research': 'research' };
const scopeKind = (scope) => (scope && typeof scope === 'object' ? ['deal', 'research', 'health'].filter((k) => scope[k]) : []);

/**
 * The one decision on whether a call may leave this device. Pure: stored = the saved copy of scope.deal,
 * deals = every saved deal, contacts = every contact. Returns a reason to refuse, or null. `!!` so a hand-edited
 * flag blocks. This is not access control: it runs on the broker's device (plan 19.2).
 */
export function blockReason(path, scope, { stored = null, deals = [], contacts = [] } = {}) {
  const kinds = scopeKind(scope);
  if (kinds.length !== 1) return 'This AI call has no scope, so it was not sent.';
  const want = SCOPE_OF[path] || 'deal';
  if (kinds[0] !== want) return 'This AI call does not match its scope, so it was not sent.';
  if (want === 'health') return null;
  if (want === 'deal') return (!!scope.deal.confidential || !!(stored && stored.confidential)) ? CONFIDENTIAL : null;
  const { company = '', dealIds = [] } = scope.research;
  const secret = new Set(deals.filter((d) => d && d.confidential).map((d) => d.id));
  if ((dealIds || []).some((id) => secret.has(id))) return 'This research starts from a contact on a confidential deal, so nothing is sent.';
  const onSecret = contacts.filter((c) => (c.dealIds || []).some((id) => secret.has(id)));
  if (company && matchContacts([], onSecret, { name: company }).length) return 'This company matches a contact on a confidential deal, so nothing is sent.';
  return null;
}

// A caller that passes a made-up { deal: {} } gets through: the guard trusts the scope it is given (inherent to the design).
// A storage read error refuses the call rather than reading as "not confidential".
async function guard(path, scope) {
  const kinds = scopeKind(scope);
  let why;
  try {
    const stored = kinds[0] === 'deal' && scope.deal.id !== undefined ? await loadDealStrict(scope.deal.id) : null;
    const research = kinds[0] === 'research';
    why = blockReason(path, scope, { stored, deals: research ? await listDealsStrict() : [], contacts: research ? await listContacts() : [] });
  } catch { why = 'This device could not check whether the deal is confidential, so nothing was sent.'; }
  if (why) throw new AiConfidential(why);
}

/** The reason a call with this scope would be refused, or null: lets the screen say so before asking to send. */
export async function blocked(scope) {
  try { await guard(scope && scope.research ? '/api/research' : '/api/extract', scope); return null; } catch (e) { if (e instanceof AiConfidential) return e.message; throw e; }
}

async function request(path, scope, body, { timeoutMs = 240000, method = 'POST' } = {}) {
  await guard(path, scope);
  const s = await getSettings();
  if (!isReady(s)) throw new AiUnavailable('AI is off. Turn it on under AI settings, with your firm’s server address and access token.');
  if (!/^https:\/\//.test(s.url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(s.url)) throw new AiUnavailable('The AI server address must start with https://.');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let r;
  try {
    r = await fetch(`${s.url}${path}`, {
      method, signal: ctl.signal,
      headers: { Authorization: `Bearer ${s.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'The AI server took too long to answer.' : 'The AI server could not be reached (check the address, and that you are online).');
  } finally { clearTimeout(timer); }
  let j = null;
  try { j = await r.json(); } catch { /* not JSON */ }
  if (!r.ok) {
    // the server's limits come with a code and a reset time; the message is what is shown
    const err = new Error((j && j.message) || `The AI server answered ${r.status}.`);
    if (j && j.error) Object.assign(err, { code: j.error, retryAfter: j.retryAfter ?? null, resetAt: j.resetAt ?? null });
    throw err;
  }
  return j;
}

export const health = (scope) => request('/api/health', scope, null, { method: 'GET', timeoutMs: 15000 });
export const extract = (scope, documents, fields) => request('/api/extract', scope, { documents, fields });
export const assist = (scope, question, facts, history) => request('/api/assist', scope, { question, facts, history }, { timeoutMs: 120000 });
export const transcribe = (scope, audio) => request('/api/transcribe', scope, audio, { timeoutMs: 600000 });
/** body: research.js requestBody(): the subject and the documents, nothing else. */
export const research = (scope, body) => request('/api/research', scope, body);
export const meeting = (scope, transcript, fields) => request('/api/meeting', scope, { transcript, fields });

/** Bytes to base64 without blowing the stack on large files. */
export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/* docmem.js -- document memory: the page text of documents attached to a deal, kept on this device between sessions
 * (release A1; the design and the owner's decision are in docs/proposals/document-memory-and-learning.md).
 *
 * Writing: every reader that already had a file's text in hand hands it to dealui.js remember(), which calls
 * saveDocText here, after the deal's own save and apart from it, so a full device never blocks a deal. Reading: Ask
 * Monal calls warmDeal when it opens or is asked, which unpacks the deal's stored texts into docsession.js, lazily and
 * once per document (the hash is the cache key), a document at a time so typing is never held up. The store itself
 * (store.js) is passed in, so this runs under Node with a stand-in. Document text is data: nothing here sends it
 * anywhere, and a confidential deal's text is kept exactly like any other and read only for that deal. */

import { packDoc, unpackDoc, recordBytes, DOCTEXT_LIMIT } from './doctext.js';
import { rememberDoc, hasDoc, forgetDocKey, forgetDeal as forgetSession, forgetAll as forgetAllSession } from './docsession.js';

/** @typedef {{ putDocText: (r: any) => Promise<{ ok: boolean, reason?: string }>, docTextOf: (id: string) => Promise<any[]>, docTextStats: (f?: any) => Promise<any>, forgetDocText: (id: string, sha?: string | null) => Promise<boolean>, forgetAllDocText: () => Promise<boolean> }} Backend */
/** @type {Backend | null} */
let backend = null;
/** The store, loaded when first needed (a stand-in under test: `useBackend`). */
const be = async () => backend || (backend = /** @type {Backend} */ (/** @type {unknown} */ (await import('./store.js'))));
export const useBackend = (b) => { backend = b; };

/** Documents removed or forgotten, by [deal|sha] and the count at which it happened: a save that began before then must not write
 * (a document added by mistake and removed at once could otherwise be stored after its Forget finished). */
const forgotten = new Map();
let clock = 0;

/** Deals whose texts are being unpacked now, so a second ask waits for the same work. */
const warming = new Map();
const tick = () => new Promise((r) => setTimeout(() => r(undefined), 0));

/**
 * Keep a document's text. Resolves { ok: true }, or { ok: false, reason } where reason is 'nofingerprint' (no SHA-256, so
 * no record), 'notext', 'removed' (forgotten while this was being packed), 'quota' (the device is full or document text is at
 * its limit: nothing was stored) or 'error'. Never throws.
 * @param {{ id: string }} deal @param {{ name?: string, sha256?: string | null, type?: string | null, id?: string | null }} doc
 * @param {string[]} pages @param {{ readBy?: string, ocrPages?: number[] }} [how]
 */
export async function saveDocText(deal, doc, pages, how = {}) {
  try {
    if (!deal || !deal.id || !doc || !doc.sha256) return { ok: false, reason: 'nofingerprint' };
    const began = ++clock;
    const rec = await packDoc({ dealId: deal.id, sha256: doc.sha256, docId: doc.id || null, name: doc.name, type: doc.type || null, pages, readBy: how.readBy, ocrPages: how.ocrPages });
    if (!rec) return { ok: false, reason: 'notext' };
    const b = await be();
    // all document text together stays within DOCTEXT_LIMIT: past it nothing more is kept
    const st = await b.docTextStats(recordBytes);
    if (st && st.bytes + recordBytes(rec) > DOCTEXT_LIMIT) return { ok: false, reason: 'quota' };
    // forgotten while it was being packed or counted: not written (checked last, so the write follows at once)
    if (Math.max(forgotten.get(`${deal.id}|${doc.sha256}`) || 0, forgotten.get(`${deal.id}|*`) || 0, forgotten.get('*') || 0) >= began) return { ok: false, reason: 'removed' };
    const r = await b.putDocText(rec);
    return r && r.ok ? { ok: true } : { ok: false, reason: (r && r.reason) || 'error' };
  } catch { return { ok: false, reason: 'error' }; }
}

/**
 * Bring a deal's stored texts into this session's search, the ones not already here. Resolves how many documents were
 * unpacked. `onReading(true|false)` brackets the work, for the quiet "reading your documents" line; it is not called when
 * there is nothing to unpack. Damaged records are skipped. Never throws.
 * `listed` is the fingerprints of the documents the deal still lists: a stored text for any other is deleted, never read.
 * @param {string} dealId @param {{ onReading?: (on: boolean) => void, listed?: string[] | null }} [opts]
 */
export function warmDeal(dealId, { onReading = () => {}, listed = null } = {}) {
  if (!dealId) return Promise.resolve(0);
  const live = warming.get(dealId);
  if (live) return live;
  const run = (async () => {
    let recs;
    try {
      const all = (await (await be()).docTextOf(dealId)).filter((r) => r && typeof r.sha256 === 'string');
      const keep = listed ? new Set(listed) : null;
      // a text for a document no longer on the deal's list (removed, or never listed) is not read and is deleted
      if (keep) for (const r of all) if (!keep.has(r.sha256)) await (await be()).forgetDocText(dealId, r.sha256).catch(() => {});
      recs = all.filter((r) => (!keep || keep.has(r.sha256)) && !hasDoc(dealId, r.sha256));
    } catch { return 0; }
    if (!recs.length) return 0;
    let n = 0;
    onReading(true);
    try {
      for (const r of recs) {
        await tick();
        const d = await unpackDoc(r);
        // a record for another deal is never read (the key says which deal; this checks the record agrees)
        if (d && r.dealId === dealId && rememberDoc(dealId, { name: d.name, pages: d.pages, role: d.type, key: d.sha256, id: d.docId || undefined })) n += 1;
      }
    } finally { onReading(false); }
    return n;
  })().finally(() => warming.delete(dealId));
  warming.set(dealId, run);
  return run;
}

/** What is stored: { docs, bytes, deals: { dealId: { docs, bytes } } }. */
export async function docTextSummary() { return (await be()).docTextStats(recordBytes); }

/** Forget one deal's stored text, here and in memory. @param {string} dealId @param {string | null} [sha256] one document only */
export async function forgetDealText(dealId, sha256 = null) {
  forgotten.set(sha256 ? `${dealId}|${sha256}` : `${dealId}|*`, ++clock);
  const ok = await (await be()).forgetDocText(dealId, sha256);
  if (!sha256) forgetSession(dealId); else forgetDocKey(dealId, sha256);
  return ok;
}
/** Forget every stored text on this device, here and in memory. */
export async function forgetAllText() {
  forgotten.set('*', ++clock);
  const ok = await (await be()).forgetAllDocText();
  forgetAllSession();
  return ok;
}

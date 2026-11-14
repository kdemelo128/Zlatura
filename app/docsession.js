/* docsession.js -- the text of the documents of the deals read in this session, for Ask Monal (assistant release 3).
 *
 * The app keeps no document bytes and no document text on a deal (dd.js). Each reader that already had a file's text
 * in hand (the OM reader, the Documents card, Start from documents, a Word file, an OCR'd scan) hands it over, and it
 * is held here in memory, by deal. Since document memory (docmem.js) the same text is also kept compressed in the
 * `doctext` store, and brought back here when Ask Monal opens a deal in a later session; this file only holds it.
 * The search index (docindex.js) is built from it the first time it is asked for, and again after a document is
 * added. A document with no stored text (never read here, forgotten, or too large) is said so, and Monal asks for the
 * file to be added again. Pure, no DOM. */

import { buildIndex, MAX_PAGES } from './docindex.js';

/** Deals held at once (the least recently used is let go) and characters of text per deal. */
const MAX_DEALS = 8;
const MAX_CHARS = 8e6;
/** @type {Map<string, { docs: { id: string, name: string, role: string | null, pages: string[], key: string }[], index: any }>} */
const decks = new Map();

/**
 * Keep a document's text for a deal. `key` (the file's SHA-256 where there is one, else its name) means adding the
 * same file again replaces it. Pages with no text stay in place as empty strings so page numbers hold.
 * @param {string} dealId @param {{ name: string, pages: string[], key?: string | null, role?: string | null, id?: string }} doc
 * @returns {boolean} whether it was kept
 */
export function rememberDoc(dealId, doc) {
  if (!dealId || !doc || !Array.isArray(doc.pages)) return false;
  const pages = doc.pages.slice(0, MAX_PAGES).map((p) => String(p ?? ''));
  if (!pages.some((p) => p.trim())) return false;
  const key = String(doc.key || doc.name || '');
  const d = decks.get(dealId) || { docs: [], index: null };
  decks.delete(dealId);   // re-inserted last: the most recently used
  d.docs = d.docs.filter((x) => x.key !== key);
  d.docs.push({ id: doc.id || key, name: String(doc.name || 'document'), role: doc.role || null, pages, key });
  while (d.docs.length > 1 && d.docs.reduce((n, x) => n + x.pages.reduce((a, p) => a + p.length, 0), 0) > MAX_CHARS) d.docs.shift();
  d.index = null;
  decks.set(dealId, d);
  while (decks.size > MAX_DEALS) decks.delete(decks.keys().next().value);
  return true;
}

/** The search index of a deal's documents, built on first use; null when no text was read for it this session. @param {string | null | undefined} dealId */
export function indexFor(dealId) {
  const d = dealId ? decks.get(dealId) : null;
  if (!d || !d.docs.length) return null;
  if (!d.index) d.index = buildIndex(d.docs);
  return d.index;
}

/** One page of one document held for a deal, or null. @param {string} dealId @param {string} docId @param {number} page */
export function pageText(dealId, docId, page) {
  const d = decks.get(dealId);
  const doc = d && d.docs.find((x) => x.id === docId);
  return doc && doc.pages[page - 1] !== undefined ? { name: doc.name, text: doc.pages[page - 1], pages: doc.pages.length } : null;
}

/** Whether a document (by its key: SHA-256 or name) is already held for a deal. */
export const hasDoc = (dealId, key) => { const d = decks.get(dealId); return !!d && d.docs.some((x) => x.key === key); };

/** Let go of one document's text (it was removed from the deal's list). */
export function forgetDocKey(dealId, key) {
  const d = decks.get(dealId);
  if (!d) return;
  d.docs = d.docs.filter((x) => x.key !== key);
  d.index = null;
}

/** Let go of a deal's text (the deal was deleted). */
export const forgetDeal = (dealId) => { decks.delete(dealId); };
/** Every deal's text, forgotten (tests; and a person leaving the app). */
export const forgetAll = () => decks.clear();

/* askweb.js -- what the bird sends to the firm's AI server when it asks with the web, and how the reply is made
 * safe to show. Pure, no DOM: assistantui.js draws the result as text nodes and links. */

import { PRODUCT } from './brand.js';

export const CONFIDENTIAL_NOTE = 'This deal is confidential, so only your question was sent.';
export const FROM_AI = `From ${PRODUCT} AI. Figures from the web are not checked.`;

/**
 * What goes with a question. deal: null (none open) or { id, name, confidential }; facts: () => the deal's fact list
 * (aifacts.js buildFacts), called only for a deal that is not confidential.
 * Returns { scope, facts, note } or { refuse } when the question names a confidential deal.
 */
export function planAsk(deal, question, facts) {
  if (!deal) return { scope: { ask: true }, facts: [], note: '' };
  if (deal.confidential) {
    const q = String(question || '').toLowerCase();
    const full = String(deal.name || '').trim().toLowerCase();
    // the whole name, or the name without a trailing note in brackets, as the broker would say it
    const names = [full, full.replace(/\s*[([].*$/, '').trim()].filter((n) => n.length >= 3);
    if (names.some((n) => q.includes(n))) return { refuse: 'That question names a confidential deal, so it was not sent.' };
    return { scope: { ask: true }, facts: [], note: CONFIDENTIAL_NOTE };
  }
  return { scope: { deal: { id: deal.id, confidential: false } }, facts: facts(), note: '' };
}

/** A link target the page may open: http or https only. */
export function safeUrl(u) {
  try { const p = new URL(String(u)); return p.protocol === 'https:' || p.protocol === 'http:' ? p.href : null; } catch { return null; }
}

/** The words on a source link: its title, else its host. */
export function sourceText(s) {
  const t = typeof s.title === 'string' ? s.title.trim() : '';
  if (t) return t.slice(0, 120);
  try { return new URL(s.url).host; } catch { return String(s.url).slice(0, 120); }
}

/** The server's reply as blocks the page can draw: text, and sources with a safe URL. Anything else is dropped. */
export function safeBlocks(reply) {
  const blocks = [];
  for (const b of reply && Array.isArray(reply.blocks) ? reply.blocks : []) {
    if (!b || typeof b.text !== 'string' || !b.text.trim()) continue;
    const seen = new Set();
    const sources = [];
    for (const s of Array.isArray(b.sources) ? b.sources : []) {
      const url = s && safeUrl(s.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      sources.push({ url, text: sourceText({ url, title: s.title }) });
    }
    blocks.push({ text: b.text, sources });
  }
  return blocks;
}

/** A server error, said plainly: its message, and its code when it has one. */
export const errorText = (e) => `${(e && e.message) || 'The AI server did not answer.'}${e && e.code ? ` (${e.code})` : ''}`;

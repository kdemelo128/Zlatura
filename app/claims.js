/* claims.js -- the rules for a company-research claim, all pure. A claim is
 * something an AI reader said about a company, with the words it quoted from a
 * source the broker supplied. The AI never decides what is true: the device
 * looks for the quote in that source (checkClaim), refuses weak kinds of proof
 * (refusal), and calls a claim "confirmed" only when the quote was found, the
 * words state the relationship, and the broker ticked it (statusOf).
 *
 * Status is worked out afresh every time a claim is read, from the check, the
 * basis and the tick; a "confirmed" in storage or in a backup is never trusted.
 * Contacts are matched here only when a brief is drawn, and never stored. */

import { verifyQuote, squash } from './reconcile.js';

export const FACT_KINDS = ['legal_name', 'entity_type', 'formed_in', 'identifier', 'registered_agent', 'mailing_address'];
export const RELATIONSHIP_KINDS = ['subsidiary_of', 'affiliate_of', 'officer_of', 'owns', 'developer_of', 'party_to', 'announced'];
export const KINDS = [...FACT_KINDS, ...RELATIONSHIP_KINDS];
/** A quote shorter than this (spaces ignored) proves nothing: "LLC" sits inside any company's name. */
export const MIN_QUOTE = 12;
/** The longest quote kept; the source text itself is never kept. */
export const MAX_QUOTE = 600;

/** Wording that marks an agent or an address, not a relationship. Deterministic, so a mislabelled claim can't get past it. */
export const AGENT_OR_ADDRESS = /registered agent|agent for service|statutory agent|\bc\/o\b|care of|mailing address|p\.?\s?o\.?\s?box/i;
const WEAK_BASIS = ['registered_agent', 'mailing_address', 'shared_surname'];

export const isRelationship = (c) => RELATIONSHIP_KINDS.includes(c && c.kind);

/**
 * Looks for the quote in the document's pages (one string for a text document, null for a scan).
 * Returns { status, page, note }: verifyQuote's statuses, plus 'unchecked' (a scan) and 'too-short'.
 * The quote must also be at least MIN_QUOTE characters and contain the claimed name, which closes the gap
 * where verifyQuote accepts a quote merely contained in the value.
 */
export function checkClaim(pages, claim) {
  if (pages === null || pages === undefined) return { status: 'unchecked', page: null, note: 'A scanned document: the quote can’t be checked here.' };
  const q = squash(claim.quote);
  if (q.length < MIN_QUOTE) return { status: 'too-short', page: null, note: `The quote is under ${MIN_QUOTE} characters, too short to prove anything.` };
  const r = verifyQuote(pages, claim.page, claim.quote, claim.object, 'text');
  if ((r.status === 'verified' || r.status === 'other-page') && !q.includes(squash(claim.object))) {
    return { status: 'value-not-in-quote', page: r.page, note: 'The quote does not contain the name it was given for.' };
  }
  return r;
}

/** Whether the quote was found: verified, or on another page with that page corrected. Read from the check, never from a stored flag. */
export function isVerified(c) {
  const k = c && c.check;
  return !!k && (k.status === 'verified' || (k.status === 'other-page' && Number.isInteger(k.page)));
}

/** Why a relationship is refused, or null. Agents, addresses and surnames never show that companies are related. */
export function refusal(c) {
  if (!isRelationship(c)) return null;
  if (c.inferredFrom === 'registered_agent') return 'A shared registered agent is not evidence that companies are related or owned together.';
  if (c.inferredFrom === 'mailing_address') return 'A shared mailing or office address is not evidence that companies are related or owned together.';
  if (c.inferredFrom === 'shared_surname') return 'A shared surname is not evidence that people are related or act together.';
  if (AGENT_OR_ADDRESS.test(String(c.quote || ''))) return 'The quoted words are about an agent or an address, which is not evidence of a relationship.';
  return null;
}

/** Stated means the words say it; any inference label makes it inferred. */
export const basisOf = (c) => (c.basis === 'stated' && !c.inferredFrom ? 'stated' : 'inferred');

/** { status: 'confirmed' | 'hypothesis' | 'refused', reason }, from the claim's check, basis and tick alone. */
export function statusOf(c) {
  const bad = refusal(c);
  if (bad) return { status: 'refused', reason: bad };
  if (!isVerified(c)) {
    const s = c.check && c.check.status;
    return { status: 'hypothesis', reason: s === 'unchecked' ? 'The source is a scan, so the quote could not be checked.'
      : s === 'too-short' ? 'The quote is too short to prove anything.'
      : s === 'value-not-in-quote' ? 'The quote does not contain the name it was given for.'
      : 'The quote was not found in the source you supplied.' };
  }
  if (basisOf(c) !== 'stated') return { status: 'hypothesis', reason: 'The source implies this but does not state it.' };
  if (c.ticked !== true) return { status: 'hypothesis', reason: 'The quote was found and states it; waiting for you to tick it.' };
  return { status: 'confirmed', reason: '' };
}

/** The claim as it reads now: status, reason and verified re-derived, whatever was stored. */
export function readClaim(c) {
  const s = statusOf(c);
  return { ...c, verified: isVerified(c), basis: basisOf(c), status: s.status, reason: s.reason };
}

/** A claim the broker may tick: verified, stated, not refused. */
export const tickable = (c) => !refusal(c) && isVerified(c) && basisOf(c) === 'stated';

/** The claim ticked (or unticked). Ticking a claim that is not tickable throws; unticking is always allowed. */
export function tick(c, on, now = Date.now()) {
  if (on && !tickable(c)) throw new Error('This claim can’t be confirmed: its quote was not found, it is not stated outright, or it was refused.');
  return { ...c, ticked: !!on, tickedAt: on ? now : null };
}

/** Two entries are the same claim when kind, subject and object match once case, spacing and punctuation are ignored. */
const sameKey = (c) => [c.kind, squash(c.subject).replace(/[^a-z0-9]/g, ''), squash(c.object).replace(/[^a-z0-9]/g, '')].join('|');

/** The same claim found in several sources counted once: the first (a verified one preferred) keeps it, the rest go in `also`. */
export function dedupe(claims) {
  const groups = new Map();
  for (const c of claims) { const k = sameKey(c); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
  const out = []; const merged = new Map(); // old id -> kept id
  for (const list of groups.values()) {
    const main = list.find(isVerified) || list[0];
    const also = list.filter((x) => x !== main).map((x) => ({ document: x.document, page: x.page, quote: x.quote, check: x.check }));
    for (const x of list) merged.set(x.id, main.id);
    out.push(also.length ? { ...main, also: [...(main.also || []), ...also] } : main);
  }
  return { claims: out, merged };
}

/* ------------------------------------------------------ contact matching */

const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * Which contacts a brief may be about: an exact full name (two words or more) or an exact company name. A
 * surname alone never matches. Run when a brief is drawn; the result is shown, never stored and never written to a contact.
 * Returns [{ claimId, contactId, why }]; claimId is null for a contact at the researched company itself.
 */
export function matchContacts(claims, contacts, subject) {
  const out = [];
  const subj = norm(subject && subject.name);
  for (const k of contacts || []) {
    if (!k || k.id === undefined) continue;
    const name = norm(k.name); const company = norm(k.company);
    const person = name.split(' ').filter(Boolean).length >= 2;
    if (company && subj && company === subj) out.push({ claimId: null, contactId: k.id, why: 'works at the company this brief is about' });
    for (const c of claims || []) {
      if (c.status === 'refused' || refusal(c)) continue;
      for (const [role, party] of [['subject', c.subject], ['object', c.object]]) {
        const p = norm(party);
        if (!p) continue;
        if (person && p === name) { out.push({ claimId: c.id, contactId: k.id, why: `same full name as the ${role} of a claim (“${party}”)` }); break; }
        if (company && p === company) { out.push({ claimId: c.id, contactId: k.id, why: `same company name as the ${role} of a claim (“${party}”)` }); break; }
      }
    }
  }
  return out;
}

/* research.js -- company research briefs kept on this device (kv key
 * 'research.briefs', newest first, at most 200). A brief is what the server's
 * reader said about a company from sources the broker supplied, with every
 * claim checked here against those sources (app/claims.js). The source text is
 * never kept, only each claim's short quote. Briefs are kept 365 days and swept
 * on launch. Contact names are never sent and never stored: matching is done
 * when a brief is drawn.
 *
 * Everything here is pure except load/save/sweep, which take the storage as an
 * argument (default: the app's kv store). */

import * as store from './store.js';
import { KINDS, MAX_QUOTE, MAX_CLAIMS, KEEP_DAYS, retentionEnd, checkClaim, dedupe, readClaim, isVerified, tick } from './claims.js';

export const KEY = 'research.briefs';
export const MAX_BRIEFS = 200;
export { KEEP_DAYS };
/** A brief still "sending" after this long has probably lost its answer. */
export const STALE_MS = 10 * 60000;
const DAY = 86400000;

/** The ten sections, in order. S1-S7 come from the reader; S8 is drawn live from contacts; S9 and S10 are worked out on the device. */
export const SECTIONS = [
  ['S1', 'Who they are'], ['S2', 'Parents and affiliates'], ['S3', 'People named'], ['S4', 'Property'], ['S5', 'Filings and transactions'],
  ['S6', 'Announcements'], ['S7', 'Why it may matter'], ['S8', 'Possible links to your contacts'], ['S9', 'Not accepted as evidence'], ['S10', 'What was not checked'],
].map(([key, title]) => ({ key, title }));
const FROM_SERVER = new Set(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
const CONFIDENCE = new Set(['high', 'medium', 'low']);
const INFERRED_FROM = new Set(['registered_agent', 'mailing_address', 'shared_surname', 'other']);

const rid = (now) => `rb${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const str = (v, n) => String(v ?? '').slice(0, n);

/** A new brief, saved as "sending" before the call. sources: [{ name, kind: 'pdf'|'text'|'pasted', pages, chars, sha256, scanned }]. */
export function newBrief(subject, sources, now = Date.now()) {
  const id = rid(now);
  return {
    id, v: 1, subject: { name: str(subject && subject.name, 200).trim(), state: subject && subject.state ? str(subject.state, 40).trim() : null },
    status: 'sending', error: null,
    sources: sources.map((s, i) => ({ index: i, name: str(s.name, 200), kind: s.kind, pages: s.pages ?? null, chars: s.chars ?? null, sha256: s.sha256 ?? null, scanned: !!s.scanned })),
    sections: SECTIONS.map((s) => ({ key: s.key, title: s.title, text: '', claimIds: [] })),
    claims: [], notes: [], notChecked: [], model: '', chargedCents: null,
    createdAt: now, updatedAt: now, retainUntil: now + KEEP_DAYS * DAY,
  };
}

/** The request body: the subject and the documents, nothing else (no contacts, ever). */
export function requestBody(subject, documents) {
  return {
    subject: { name: str(subject.name, 200), state: subject.state ? str(subject.state, 40) : null },
    documents: documents.map((d) => (d.data !== undefined ? { name: d.name, mediaType: d.mediaType, data: d.data } : { name: d.name, mediaType: d.mediaType, text: d.text })),
  };
}

/**
 * The server's answer checked against the sources. texts[i] is source i's page texts (an array), its whole text
 * (a string), or null for a scan. Claims whose quote is missing or too long are left out, with a note.
 * Returns the brief as ready; it keeps no source text and no contact name.
 */
export function receive(brief, out, texts, now = Date.now()) {
  const raw = Array.isArray(out && out.claims) ? out.claims : [];
  const refToId = new Map(); const mapped = []; let n = 0; let dropped = 0;
  for (const r of raw) {
    const sec = FROM_SERVER.has(r && r.section) ? r.section : null;
    const doc = r && Number.isInteger(r.document) ? r.document : -1;
    const quote = r ? String(r.quote ?? '') : '';
    if (!sec || !KINDS.includes(r.kind) || doc < 0 || doc >= brief.sources.length || !String(r.subject ?? '').trim() || !String(r.object ?? '').trim() || String(r.subject).length > 300 || String(r.object).length > 300 || quote.length < 3 || quote.length > MAX_QUOTE) { dropped += 1; continue; }
    n += 1;
    const c = {
      id: `${brief.id}:${n}`, section: sec, kind: r.kind, subject: String(r.subject), object: String(r.object), statement: str(r.statement, 400),
      quote, document: doc, page: Number.isInteger(r.page) && r.page >= 1 ? r.page : null,
      basis: r.basis === 'stated' ? 'stated' : 'inferred', inferredFrom: INFERRED_FROM.has(r.inferredFrom) ? r.inferredFrom : null,
      confidence: CONFIDENCE.has(r.confidence) ? r.confidence : 'low', also: [], ticked: false, tickedAt: null,
    };
    if (c.inferredFrom) c.basis = 'inferred';
    c.check = checkClaim(texts ? texts[doc] ?? null : null, c);
    if (isVerified(c)) c.page = c.check.page; // corrected to where the quote was found
    if (r.ref !== undefined) refToId.set(r.ref, c.id);
    mapped.push({ c, ref: r.ref });
  }
  const { claims, merged } = dedupe(mapped.map((m) => m.c));
  const sections = SECTIONS.map((s) => {
    const from = (Array.isArray(out && out.sections) ? out.sections : []).find((x) => x && x.key === s.key);
    const ids = from && FROM_SERVER.has(s.key) && Array.isArray(from.claimRefs) ? [...new Set(from.claimRefs.map((ref) => merged.get(refToId.get(ref))).filter(Boolean))] : [];
    return { key: s.key, title: s.title, text: from && FROM_SERVER.has(s.key) ? str(from.text, 800) : '', claimIds: ids };
  });
  const gaps = [];
  brief.sources.forEach((s, i) => { if (!texts || texts[i] === null || texts[i] === undefined) gaps.push(`Source ${i + 1} (${s.name}) is a scan: its quotes can’t be checked on this device.`); });
  if (dropped) gaps.push(`${dropped} claim${dropped === 1 ? ' was' : 's were'} left out because the quote or the claim was missing or malformed.`);
  const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 20).map((x) => str(x, 300)) : []);
  return {
    ...brief, status: 'ready', error: null, claims, sections, notes: list(out && out.notes), notChecked: [...list(out && out.notChecked), ...gaps],
    model: str(out && out.model, 100), chargedCents: out && Number.isInteger(out.chargedCents) ? out.chargedCents : null, updatedAt: now,
  };
}

/** A failed call: the server's message only. */
export const fail = (brief, message, now = Date.now()) => ({ ...brief, status: 'failed', error: str(message, 300), updatedAt: now });

/** The brief as it reads now: stale "sending" turned into failed, every claim's status re-derived, S9 listing the refused. */
export function readBrief(brief, now = Date.now()) {
  let b = brief;
  if (b.status === 'sending' && now - (b.createdAt || 0) > STALE_MS) b = { ...b, status: 'failed', error: 'No answer came back. The server may have charged for this request.' };
  const claims = asList(b.claims).slice(0, MAX_CLAIMS).map(readClaim);
  const refused = new Set(claims.filter((c) => c.status === 'refused').map((c) => c.id));
  const sections = asList(b.sections).map((s) => (s.key === 'S9' ? { ...s, claimIds: [...refused] } : { ...s, claimIds: (Array.isArray(s.claimIds) ? s.claimIds : []).filter((id) => !refused.has(id)) }));
  const count = (st) => claims.filter((c) => c.status === st).length;
  return { ...b, claims, sections, counts: { confirmed: count('confirmed'), hypothesis: count('hypothesis'), refused: count('refused') } };
}

/** The brief with one claim ticked or unticked (throws for a claim that can't be ticked). */
export function tickClaim(brief, claimId, on, now = Date.now()) {
  const all = asList(brief.claims);
  const c = all.find((x) => x.id === claimId);
  if (!c) throw new Error('No such claim.');
  return { ...brief, claims: all.map((x) => (x === c ? tick(c, on, now) : x)), updatedAt: now };
}

/* ---------------------------------------------------------------- storage */

const io = (s) => s || { get: store.kvGet, set: store.kvSet };
const asList = (v) => (Array.isArray(v) ? v.filter((b) => b && typeof b === 'object') : []);

export async function loadBriefs(s) { return asList(await io(s).get(KEY)); }

/** Saves a brief (replacing the one with its id), newest first. A new brief past MAX_BRIEFS is refused, never trimmed silently. */
export async function saveBrief(brief, s) {
  const list = await loadBriefs(s);
  const at = list.findIndex((b) => b.id === brief.id);
  if (at < 0 && list.length >= MAX_BRIEFS) throw new Error(`There are ${MAX_BRIEFS} research briefs on this device: delete one first.`);
  if (at >= 0) list[at] = brief; else list.unshift(brief);
  if (!(await io(s).set(KEY, list))) throw new Error('storage is full or blocked');
  return list;
}

export async function deleteBrief(id, s) {
  const list = (await loadBriefs(s)).filter((b) => b.id !== id);
  await io(s).set(KEY, list.length ? list : null);
  return list;
}

/** A brief's last day (claims.js retentionEnd: retainUntil, never later than 365 days after it was made). */
export const expiry = retentionEnd;
export const expired = (b, now) => retentionEnd(b) < now;

/** Removes the briefs kept past their 365 days; returns how many. Runs on launch beside sweepTrash. */
export async function sweepResearch(now = Date.now(), s) {
  try {
    const list = await loadBriefs(s);
    const keep = list.filter((b) => !expired(b, now));
    if (keep.length === list.length) return 0;
    await io(s).set(KEY, keep.length ? keep : null);
    return list.length - keep.length;
  } catch { return 0; }
}

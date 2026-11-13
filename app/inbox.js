/* inbox.js -- the "To file" inbox, as logic: what a read document names (people, companies, the property, dates),
 * how each proposed record matches what is already on this device, and how filing or merging changes a contact.
 * Pure: text and records in, records out; nothing is stored, fetched or drawn (inboxstore.js stores, inboxui.js draws).
 *
 * The rules (docs/proposals/connectivity-and-market-data.md, section 6; the owner approved them on 2026-11-13):
 *  - Suggest only. A document never changes a contact, a task or a deal until a person taps File or Merge (or has
 *    switched on "File clean new records automatically", which files only a record that matches nothing and conflicts
 *    with nothing, and never merges).
 *  - A typed value is never overwritten. A blank fills; a conflict is shown side by side and needs a choice; a value
 *    that loses is kept under "other values" with its source.
 *  - Two people who share a name are two people: a name alone never matches when the existing person has a different
 *    email or phone, or when two existing people share it.
 *  - Document text is data. A name that reads like an instruction is kept as text, flagged, and never auto-filed.
 *  - A confidential deal's records go only into that deal: they match only that deal's contacts, and a record from
 *    any other document never matches a contact on a confidential deal. */

import { datesIn } from './leaseread.js';
import { looksLikeInstruction } from './docfacts.js';

export const INBOX_V = 1;
export const MAX_ITEMS = 500;
export const EXPIRE_MS = 30 * 86400000;
const MAX_PER_DOC = 25;
const MAX_LINE = 160;

/** The words a label may use, and the CRM role each names (pipeline.js CONTACT_ROLES). */
/** @type {{ role: string, re: RegExp }[]} */
const PEOPLE = [
  { role: 'Seller’s broker', re: /^(?:listing\s+|exclusive\s+)?(?:brokers?|agents?|advisors?)$|^(?:listing\s+)?contacts?$|^presented\s+by$|^exclusively\s+listed\s+by$/i },
  { role: 'Owner', re: /^(?:property\s+)?owner$|^sellers?$|^landlord$|^lessor$/i },
  { role: 'Tenant', re: /^tenant$|^lessee$/i },
  { role: 'Lender', re: /^(?:existing\s+)?lender$|^mortgagee$/i },
  { role: 'Property manager', re: /^(?:property\s+|managing\s+)(?:manager|agent)$/i },
];
const ADDRESS_LABEL = /^(?:property\s+address|subject\s+property|property|address)$/i;
/** @type {[RegExp, string][]} */
const DATE_LABELS = [
  [/^lease\s+expiration(?:\s+date)?$|^(?:lease\s+)?expires$|^expiration\s+date$/i, 'Lease expires'],
  [/^due\s+diligence\s+(?:expiration|period\s+ends?|deadline)$/i, 'Due diligence ends'],
  [/^closing\s+date$|^close\s+of\s+escrow$/i, 'Closing'],
  [/^offers?\s+due(?:\s+date)?$|^call\s+for\s+offers$|^bid\s+(?:due\s+)?date$/i, 'Offers due'],
  [/^option\s+(?:expiration|deadline)$/i, 'Option deadline'],
];
const ORG = /\b(?:llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|lp|l\.p|llp|ltd|limited|partners|partnership|group|trust|holdings|properties|realty|capital|bank|advisors|associates|management|investments|reit|fund|real estate|enterprises|development|developers|brokerage|services)\b\.?/i;
const GENERIC = /^(?:n\/?a|tbd|tba|none|unknown|undisclosed|confidential|see\s+below|see\s+above|various|multiple|to be determined|vacant|-+)$/i;
const STREET = /\b\d{1,6}\s+(?:[A-Za-z0-9.'’-]+\s+){1,5}(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Way|Pkwy|Parkway|Hwy|Highway|Ct|Court|Pl|Place|Plaza|Sq|Square|Terrace|Ter|Circle|Cir)\b\.?(?:,?\s+[A-Za-z .'’-]{2,30},\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?)?/;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;

const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const clip = (s, n = MAX_LINE) => squash(s).slice(0, n);

/** Last ten digits of a phone, or '' when there are fewer than ten. */
/** The ten digits of a phone, without an extension ("ext. 14", "x305"); '' when there are fewer than ten. */
export const phoneKey = (p) => { const d = String(p ?? '').replace(/(?:\bext(?:ension)?\.?|\bx)\s*\d+\s*$/i, '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };
export const emailKey = (e) => String(e ?? '').trim().toLowerCase();
export const isOrg = (name) => ORG.test(String(name ?? ''));
const LEGAL = /\b(?:llc|inc|incorporated|corp|corporation|co|company|lp|llp|ltd|limited)\b/g;
/** A name for comparison: lower case, "Smith, Jane" as "jane smith", no titles or punctuation, and no legal suffix (LLC, Inc, Corp, Co, LP, LLP, Ltd). A descriptive word (Capital, Bank, Properties) stays: they are different companies. */
export function nameKey(name) {
  let s = squash(name).toLowerCase().replace(/[’']/g, '').replace(/\bl\.\s?l\.\s?c\b\.?/g, 'llc').replace(/\bl\.\s?l\.\s?p\b\.?/g, 'llp').replace(/\bl\.\s?p\b\.?/g, 'lp');
  const comma = /^([^,]+),\s*([^,]+)$/.exec(s);
  if (comma && !isOrg(s)) s = `${comma[2]} ${comma[1]}`;
  s = s.replace(/\b(?:mr|mrs|ms|miss|dr|jr|sr|ii|iii|esq|cpa)\b\.?/g, ' ');
  s = s.replace(LEGAL, ' ');
  return s.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Cut a value into a name, an email and a phone: the first of each, the rest of the text as the name. */
function parseValue(raw) {
  let t = squash(raw);
  const email = (EMAIL.exec(t) || [''])[0];
  if (email) t = t.replace(email, ' ');
  const phone = (PHONE.exec(t) || [''])[0];
  if (phone) t = t.replace(phone, ' ');
  t = t.replace(/\b(?:tel|phone|cell|mobile|office|direct|email|e-mail|fax)\b(?:\.|:)/gi, ' ');
  const parts = squash(t.replace(/[|;•·]/g, ',')).split(',').map((x) => squash(x).replace(/^[-–—:]+|[-–—:]+$/g, '').trim()).filter(Boolean);
  return { parts, email, phone: phone ? squash(phone) : '' };
}

const okName = (n) => {
  const s = squash(n);
  if (s.length < 2 || s.length > 90 || GENERIC.test(s) || /^\d/.test(s) || s.includes('@')) return false;
  if ((s.match(/[A-Za-z]/g) || []).length < 2) return false;
  return s.split(' ').length <= 9;
};

const NOT_NAME = new Set(['seller', 'sellers', 'buyer', 'tenant', 'tenants', 'landlord', 'lessor', 'lessee', 'owner', 'broker', 'agent', 'agents', 'lender', 'manager', 'property', 'confidential', 'relationship', 'improvements', 'improvement', 'allowance', 'structure', 'available', 'assumed', 'vacant', 'suite', 'floor', 'unit', 'licensed', 'representations', 'warranties', 'information', 'listing', 'contact', 'note', 'notes', 'tbd', 'various']);
const PARTICLE = /^(?:de|del|della|la|le|van|von|der|di|da|bin|al|el)$/;
const SMALL = /^(?:of|and|the|for|at)$/;
/**
 * What a value looks like: 'org' (a company or institution: a legal or business suffix and capitalised words), 'person'
 * (two to four capitalised words, a particle such as "de" allowed), or null (a sentence, a fragment, a unit or a boilerplate
 * word). Only a shaped name is filed automatically; only a shaped name, or one flagged as an instruction, is proposed.
 * @returns {'org' | 'person' | null}
 */
export function nameShape(name) {
  const s = squash(name);
  if (!okName(s) || /[<>{}=$%@]|https?:/i.test(s)) return null;
  const toks = s.split(' ');
  const low = toks.map((t) => t.toLowerCase().replace(/[.,]+$/, ''));
  const cap = (t) => /^[A-Z][A-Za-z.'’-]*$/.test(t);
  if (isOrg(s)) {
    const words = toks.filter((t) => !SMALL.test(t));
    return toks.length <= 8 && /^[A-Z0-9]/.test(s) && toks.filter((t) => SMALL.test(t)).length <= 2 && words.every((t) => /^[A-Z0-9&][A-Za-z0-9.&'’,-]*$/.test(t)) ? 'org' : null;
  }
  if (/\d/.test(s) || toks.length < 2 || toks.length > 4 || low.some((t) => NOT_NAME.has(t))) return null;
  return cap(toks[0]) && cap(toks[toks.length - 1]) && toks.every((t) => cap(t) || PARTICLE.test(t)) ? 'person' : null;
}

const labelOf = (line) => {
  // a colon, or a dash with a space each side; a bare hyphen ("Seller-financing available") is part of the words
  const m = /^\s*([A-Za-z][A-Za-z ’'\/&-]{1,38}?)(?:\s*:|\s[-–—]\s)\s*(.*)$/.exec(line);
  return m ? { label: squash(m[1]), value: m[2] } : null;
};

/**
 * What one document names. `pages` is the text of each page; `role` the kind of document the reader called it ('om',
 * 'lease', ...); `today` an ISO day (dates long past are left out).
 * Returns candidates in reading order, at most 25:
 *   { kind: 'contact', name, role, company, email, phone, org, page, suspicious, line }
 *   { kind: 'task', title, due, page, line }
 *   { kind: 'property', address, page, line }
 * `suspicious` marks a name that reads like an instruction to a program: it is kept as plain text, never acted on.
 * @param {{ pages?: string[], role?: string | null, today?: string }} doc
 */
export function extractCandidates({ pages = [], today = new Date().toISOString().slice(0, 10) } = {}) {
  const out = [];
  const seen = new Set();
  const push = (c) => { const k = `${c.kind}|${c.kind === 'contact' ? `${nameKey(c.name)}|${emailKey(c.email)}|${c.role}` : c.kind === 'task' ? `${c.title}|${c.due}` : nameKey(c.address)}`; if (!seen.has(k) && out.length < MAX_PER_DOC) { seen.add(k); out.push(c); } };
  const cutoff = new Date(`${today}T00:00:00Z`).getTime() - 60 * 86400000;
  pages.forEach((text, pi) => {
    const lines = String(text ?? '').split(/\r?\n/).slice(0, 400);
    for (let i = 0; i < lines.length; i++) {
      const lab = labelOf(lines[i]);
      if (!lab) continue;
      const key = lab.label.replace(/\s+/g, ' ');
      const person = PEOPLE.find((p) => p.re.test(key));
      if (person) {
        // the label's own line, then up to three lines under it until a blank line or the next label
        let { parts, email, phone } = parseValue(clip(lab.value, 200));
        const block = [];
        for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
          if (!squash(lines[j]) || labelOf(lines[j])) break;
          block.push(squash(lines[j]));
        }
        for (const b of block) {
          const v = parseValue(b);
          if (!email && v.email) email = v.email;
          if (!phone && v.phone) phone = v.phone;
          if (!parts.length) parts = v.parts; else if (v.parts.length && parts.length < 3 && !v.email && !v.phone) parts = [...parts, ...v.parts.slice(0, 1)];
        }
        const first = parts[0] || '';
        const raw = clip(lines[i], 240);
        const shape = nameShape(first);
        const suspicious = looksLikeInstruction(raw) || looksLikeInstruction(first);
        // a sentence or a fragment is not a person; a name that reads like an instruction is kept, flagged, as text
        if (!shape && !(suspicious && okName(first) && !/[<>{}]/.test(first))) continue;
        const org = shape === 'org';
        const companyPart = org ? first : (parts.slice(1).find((x) => nameShape(x) === 'org') || '');
        push({ kind: 'contact', name: clip(first, 90), role: person.role, company: org ? clip(first, 90) : clip(companyPart, 90), email, phone, org, page: pi + 1, suspicious, line: raw });
        continue;
      }
      if (ADDRESS_LABEL.test(key)) {
        const m = STREET.exec(lab.value) || STREET.exec(lines[i + 1] || '');
        if (m && m[0].length >= 6) push({ kind: 'property', address: clip(m[0].replace(/[.,]+$/, ''), 140), page: pi + 1, line: clip(lines[i], 240) });
        continue;
      }
      const dl = DATE_LABELS.find(([re]) => re.test(key));
      if (dl) {
        const d = datesIn(lab.value).find((x) => x.type === 'date');
        if (d && new Date(`${d.iso}T00:00:00Z`).getTime() >= cutoff) push({ kind: 'task', title: dl[1], due: d.iso, page: pi + 1, line: clip(lines[i], 240) });
      }
    }
  });
  return out;
}

/* ---------------------------------------------------------------- matching */

/**
 * The existing contacts a candidate could be, best first: [{ id, level: 'same' | 'likely' | 'possible', why }].
 * Same email is the same person. The same ten phone digits with a similar name is likely (with a different name,
 * possible). A name alone is likely only when it is the one person of that name and neither side has a different
 * email or phone; when several share it, each is only possible; with a different email or phone it is no match.
 * `hidden` (a Set of contact ids) are never considered: contacts on a confidential deal, for a record from elsewhere.
 * @param {{ name?: string, email?: string, phone?: string }} cand @param {any[]} contacts
 */
const keyCache = new WeakMap();
/** A contact's comparison keys, worked out once per record. */
function keysOf(c) {
  let k = keyCache.get(c);
  if (!k || k.src !== c.name + c.email + c.phone + c.company) { k = { src: c.name + c.email + c.phone + c.company, nk: nameKey(c.name), e: emailKey(c.email), p: phoneKey(c.phone), co: nameKey(c.company) }; keyCache.set(c, k); }
  return k;
}
export function matchContacts(cand, contacts, { hidden = new Set(), only = null } = {}) {
  const ck = nameKey(cand.name);
  const cco = nameKey(cand.company);
  const ce = emailKey(cand.email);
  const cp = phoneKey(cand.phone);
  const pool = (contacts || []).filter((c) => c && !hidden.has(c.id) && (!only || only.has(c.id)));
  const sameName = pool.filter((c) => ck && keysOf(c).nk === ck);
  const out = [];
  for (const c of pool) {
    const { e, p, nk, co } = keysOf(c);
    const similar = ck && nk && (nk === ck || ck.split(' ').pop() === nk.split(' ').pop() && (ck.includes(nk) || nk.includes(ck)));
    if (ce && e && ce === e) { out.push({ id: c.id, level: 'same', why: 'the same email' }); continue; }
    if (cp && p && cp === p) { out.push({ id: c.id, level: similar ? 'likely' : 'possible', why: similar ? 'the same phone and a similar name' : 'the same phone, a different name' }); continue; }
    if (nk !== ck || !ck) continue;
    const clash = (ce && e && ce !== e) || (cp && p && cp !== p) || (cco && co && cco !== co && cco !== ck && co !== nk);
    if (clash) continue; // the same name with a different email, phone or company: another person
    out.push(sameName.length === 1 ? { id: c.id, level: 'likely', why: 'the same name' } : { id: c.id, level: 'possible', why: `one of ${sameName.length} people with this name` });
  }
  const rank = { same: 0, likely: 1, possible: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/* ------------------------------------------------------------------- items */

/** One stable key for a candidate in a deal, so reading a document twice proposes it once. */
export const itemKey = (c, dealId) => `${dealId || ''}|${c.kind}|${c.kind === 'contact' ? `${nameKey(c.name)}|${emailKey(c.email)}|${c.role}` : c.kind === 'task' ? `${c.title}|${c.due}` : nameKey(c.address)}`;

/**
 * New inbox items for the candidates of one document read on a deal. An item already in `existing` (in any state, so a
 * dismissed one is not proposed again) is skipped. `source`: { file, docRole, sha256 }.
 * @param {any[]} candidates @param {{ dealId: string | null, source: any, existing?: any[], now?: number, newId?: () => string }} o
 */
export function newItems(candidates, { dealId, source, existing = [], now = Date.now(), newId = defaultId }) {
  const have = new Set(existing.map((x) => x.key));
  const items = [];
  for (const c of candidates) {
    const key = itemKey(c, dealId);
    if (have.has(key)) continue;
    have.add(key);
    const { page, line, ...data } = c;
    items.push({ v: INBOX_V, id: newId(), key, status: 'pending', createdAt: now, dealId: dealId || null, source: { file: clip(source.file, 120), docRole: source.docRole || null, sha256: source.sha256 || null, page, line }, data });
  }
  return items;
}
function defaultId() { return `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`; }

/** Pending items that outlived 30 days go; at most 500 are kept (the oldest finished ones go first). */
export function trim(items, now = Date.now()) {
  const live = items.filter((x) => !(x.status === 'pending' && now - x.createdAt > EXPIRE_MS));
  if (live.length <= MAX_ITEMS) return live;
  const done = live.filter((x) => x.status !== 'pending').sort((a, b) => (a.doneAt || a.createdAt) - (b.doneAt || b.createdAt));
  const drop = new Set(done.slice(0, live.length - MAX_ITEMS).map((x) => x.id));
  const rest = live.filter((x) => !drop.has(x.id));
  return rest.length <= MAX_ITEMS ? rest : rest.sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_ITEMS);
}

/** A forgiving read of the stored list: only objects that look like items, only versions this code knows. */
export const readItems = (raw) => (Array.isArray(raw) ? raw.filter((x) => x && typeof x === 'object' && typeof x.id === 'string' && x.data && typeof x.data === 'object' && (x.v || 1) <= INBOX_V) : []);

/**
 * Which deals exist and which are confidential, read from the deals themselves each time (an item carries only its deal's
 * id, so marking a deal confidential later hides what was proposed before). An item whose deal is gone is hidden.
 */
export const dealScope = (deals) => ({ known: new Set((deals || []).filter((d) => d && d.id).map((d) => d.id)), secret: new Set((deals || []).filter((d) => d && d.confidential).map((d) => d.id)) });
/** Items a person may see now: pending ones, and a confidential deal's only while that deal is the open one. */
export const visible = (items, openDealId = null, scope = dealScope([])) => items.filter((x) => x.status === 'pending' && scope.known.has(x.dealId) && (!scope.secret.has(x.dealId) || x.dealId === openDealId));
/** The count shown on Home and Connect: never an item of a confidential deal. */
export const publicCount = (items, scope = dealScope([])) => items.filter((x) => x.status === 'pending' && scope.known.has(x.dealId) && !scope.secret.has(x.dealId)).length;

/** Contact ids a candidate on this deal must not see: with a confidential deal open, only its own contacts count; otherwise those on any confidential deal are hidden. */
export function matchScope(contacts, deals, dealId) {
  const secret = new Set((deals || []).filter((d) => d && d.confidential).map((d) => d.id));
  if (dealId && secret.has(dealId)) return { hidden: new Set(), only: new Set((contacts || []).filter((c) => (c.dealIds || []).includes(dealId)).map((c) => c.id)) };
  return { hidden: new Set((contacts || []).filter((c) => (c.dealIds || []).some((id) => secret.has(id))).map((c) => c.id)), only: null };
}

/**
 * Whether the automatic switch may file this item: a contact that matches nothing, a task not already on the deal, a
 * property on a deal with no address. Never a flagged name, never a conflict, never a merge.
 */
export function isClean(item, { matches = [], tasks = [], address = '' } = {}) {
  const d = item.data;
  if (item.status !== 'pending') return false;
  if (d.kind === 'contact') return !d.suspicious && matches.length === 0 && nameShape(d.name) !== null;
  if (d.kind === 'task') return !tasks.some((t) => t.dealId === item.dealId && t.title === d.title && t.due === d.due);
  if (d.kind === 'property') return !squash(address);
  return false;
}

/* -------------------------------------------------------------- filing */

const FIELDS = ['name', 'company', 'role', 'email', 'phone'];
const blank = (field, v) => !squash(v) || (field === 'role' && v === 'Other');
const same = (field, a, b) => (field === 'email' ? emailKey(a) === emailKey(b) : field === 'phone' ? (phoneKey(a) || squash(a)) === (phoneKey(b) || squash(b)) : field === 'name' || field === 'company' ? nameKey(a) === nameKey(b) : squash(a) === squash(b));

/** The provenance written on a record that a document made or changed. */
export const provenance = (item, at = Date.now()) => ({ kind: 'document', file: item.source.file, docRole: item.source.docRole, sha256: item.source.sha256, page: item.source.page, dealId: item.dealId, itemId: item.id, at });

/** The new contact a File tap makes from a contact item. */
export function newContact(item, id, now = Date.now()) {
  const d = item.data;
  return { id, name: squash(d.name), company: d.company || '', role: d.role || 'Other', phone: d.phone || '', email: d.email || '', notes: '', dealIds: item.dealId ? [item.dealId] : [], createdAt: now, updatedAt: now, v: 2, sources: [provenance(item, now)], otherValues: {} };
}

/**
 * What merging a contact item into an existing contact would do, field by field.
 * Returns { fills: [{ field, to }], conflicts: [{ field, have, other }], linkDeal } without changing anything.
 */
export function mergePreview(item, target) {
  const d = item.data;
  const fills = [];
  const conflicts = [];
  for (const f of FIELDS) {
    const other = squash(d[f]);
    if (!other) continue;
    if (blank(f, target[f])) fills.push({ field: f, to: other });
    else if (!same(f, target[f], other)) conflicts.push({ field: f, have: target[f], other });
  }
  return { fills, conflicts, linkDeal: !!item.dealId && !(target.dealIds || []).includes(item.dealId) };
}

/**
 * Merge a contact item into `target`. `choice[field]` is 'keep' (the typed value stays, the document's is kept under
 * other values) or 'use' (the document's value is used, the typed one is kept under other values); every conflict must
 * have one or nothing is merged ({ ok: false, missing }). Blank fields fill. Returns { ok, record, undo } where `undo`
 * lists what changed so Undo can put exactly that back (and only where the value is still what the merge left).
 */
export function mergeInto(item, target, choice = {}, now = Date.now()) {
  const pv = mergePreview(item, target);
  const missing = pv.conflicts.filter((c) => choice[c.field] !== 'keep' && choice[c.field] !== 'use').map((c) => c.field);
  if (missing.length) return { ok: false, missing };
  const rec = { ...target, otherValues: { ...(target.otherValues || {}) }, sources: [...(target.sources || [])] };
  const prov = provenance(item, now);
  const undo = { fields: {}, other: {}, linked: false, source: prov.itemId };
  for (const x of pv.fills) { undo.fields[x.field] = { from: rec[x.field] ?? '', to: x.to }; rec[x.field] = x.to; }
  const stash = (field, value) => {
    const list = rec.otherValues[field] || [];
    if (list.some((o) => same(field, o.value, value))) return;
    rec.otherValues[field] = [...list, { value: squash(value), file: item.source.file, page: item.source.page, at: now }];
    undo.other[field] = [...(undo.other[field] || []), squash(value)];
  };
  for (const c of pv.conflicts) {
    if (choice[c.field] === 'use') { undo.fields[c.field] = { from: rec[c.field], to: c.other }; stash(c.field, rec[c.field]); rec[c.field] = c.other; } else stash(c.field, c.other);
  }
  if (pv.linkDeal) { rec.dealIds = [...(rec.dealIds || []), item.dealId]; undo.linked = true; }
  rec.sources.push(prov);
  rec.v = 2;
  rec.updatedAt = now;
  return { ok: true, record: rec, undo };
}

/** Put back what a merge changed: a field only while it still holds what the merge left, so a later typed edit stays. */
export function undoMerge(record, undo, dealId) {
  const rec = { ...record, otherValues: { ...(record.otherValues || {}) }, sources: (record.sources || []).filter((s) => s.itemId !== undo.source) };
  for (const [f, { from, to }] of Object.entries(undo.fields || {})) if (same(f, rec[f], to) && squash(rec[f]) === squash(to)) rec[f] = from;
  for (const [f, vals] of Object.entries(undo.other || {})) {
    const left = (rec.otherValues[f] || []).filter((o) => !vals.some((v) => same(f, o.value, v)));
    if (left.length) rec.otherValues[f] = left; else delete rec.otherValues[f];
  }
  if (undo.linked && dealId) rec.dealIds = (rec.dealIds || []).filter((x) => x !== dealId);
  rec.updatedAt = Date.now();
  return rec;
}

/** One contact record in the shape this version stores, from an older one (a migration step, migrate.js KV_MIGRATIONS). */
export function contactV2(c) {
  if (!Array.isArray(c.sources)) c.sources = [];
  if (!c.otherValues || typeof c.otherValues !== 'object' || Array.isArray(c.otherValues)) c.otherValues = {};
  return c;
}

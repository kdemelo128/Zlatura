/* mailitems.js -- what a calendar file or an email file proposes to the To file inbox: an activity for each meeting or email
 * (with its date and time), a task for each open to-do, and a contact for each person named. Pure: records in (icsread.js,
 * emlread.js), candidates out; nothing is stored or fetched (inboxstore.js proposeRows stores, inboxui.js draws).
 *
 * Rules: a candidate says which deal it belongs to only when the file's own words name exactly one deal (its name or its
 * address); a confidential deal can be named, and then the record stays inside that deal. Text in a file is data: a subject,
 * summary or body line that reads like an instruction is flagged and kept as text, and nothing here ever acts on it. */

import { when } from './icsread.js';
import { looksLikeInstruction } from './docfacts.js';
import { nameKey } from './inbox.js';
import { hashOf } from './presets.js';

const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const alnum = (s) => ` ${squash(s).toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
/** Local noon of an ISO day (ms). */
const noon = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12).getTime(); };
const NOISE = /^(?:no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|notifications?)@/i;

/** The id of the one deal whose name or street address the text names, or null (none, or more than one). */
export function dealIn(text, deals) {
  const hay = alnum(text);
  const hits = new Set();
  for (const d of deals || []) {
    if (!d || !d.id) continue;
    const name = alnum(d.name);
    const street = alnum(String((d.figures && d.figures.address) || '').split(',')[0]);
    if ((name.trim().length >= 4 && hay.includes(name)) || (street.trim().length >= 6 && /\d/.test(street) && hay.includes(street))) hits.add(d.id);
  }
  return hits.size === 1 ? [...hits][0] : null;
}

/** Contact candidates for a list of { name, email }, each once, never a no-reply address; at most 25. */
function people(list, { dealId, kind }) {
  const seen = new Set();
  const out = [];
  for (const p of list) {
    const email = String(p.email || '').toLowerCase();
    if (!email || seen.has(email) || NOISE.test(email)) continue;
    seen.add(email);
    const name = squash(p.name) || email;
    const c = { kind: 'contact', name, company: '', role: 'Other', email, phone: '', ext: null, monalId: '', dealId };
    c.suspicious = looksLikeInstruction(name) || undefined;
    if (c.suspicious === undefined) delete c.suspicious;
    c.idKey = `${kind}|contact|${email}`;
    c.rowKey = `${c.idKey}|${hashOf({ name })}`;
    out.push(c);
    if (out.length >= 25) break;
  }
  return out;
}

/**
 * Candidates from a calendar file read by icsread.readCalendar. `today` is the ISO day (a meeting on or before it is logged; a
 * later one is an upcoming meeting). Returns { cands, counts: { meetings, tasks, people } }.
 * @param {any} cal @param {{ deals?: any[], today: string }} o
 */
export function calendarCandidates(cal, { deals = [], today }) {
  const cands = [];
  for (const ev of cal.events) {
    const text = `${ev.summary} ${ev.location} ${ev.description}`;
    const dealId = dealIn(text, deals);
    const upcoming = ev.date > today;
    const bits = [`${upcoming ? 'Upcoming meeting' : 'Meeting'}: ${ev.summary || '(no title)'}`, when(ev), ev.location && `at ${ev.location}`, ev.zoneNote && `(${ev.zoneNote})`, ev.repeatNote && `(${ev.repeatNote})`].filter(Boolean);
    // no usable zone: the date is kept and the entry sits at local noon of that day, marked; a time is never invented
    const approx = ev.instant === null;
    if (approx) bits.push('time not stated');
    /** @type {any} */
    const a = { kind: 'activity', type: 'meeting', text: bits.join(' · ').slice(0, 300), at: approx ? noon(ev.date) : ev.instant, ...(approx ? { approx: true } : {}), date: ev.date, time: ev.time, zone: ev.zone, detail: squash(ev.description).slice(0, 200), people: ev.people.map((p) => p.email), dealId };
    if (looksLikeInstruction(text)) a.suspicious = true;
    a.idKey = `calendar|${ev.uid}|${ev.date}`;
    a.rowKey = `${a.idKey}|${hashOf({ t: a.text, at: a.at, d: a.detail })}`;
    cands.push(a);
    const list = [...(ev.organizer ? [ev.organizer] : []), ...ev.people];
    cands.push(...people(list, { dealId, kind: 'calendar' }));
  }
  for (const t of cal.todos || []) {
    const dealId = dealIn(`${t.title} ${t.description}`, deals);
    const k = { kind: 'task', title: t.title, due: t.date, note: squash(t.description).slice(0, 200), dealId };
    if (looksLikeInstruction(`${t.title} ${t.description}`)) k.suspicious = true;
    k.idKey = `calendar|todo|${t.uid}`;
    k.rowKey = `${k.idKey}|${hashOf({ t: t.title, d: t.date })}`;
    cands.push(k);
  }
  return { cands, counts: { meetings: cal.events.length, tasks: (cal.todos || []).length, people: cands.filter((c) => c.kind === 'contact').length } };
}

/**
 * Candidates from an email read by emlread.readEmail: an activity (subject, date, who), a contact for each person on
 * From, To and Cc. A calendar invite inside it is read separately by the caller. Text in the subject or body that reads
 * like an instruction flags the activity; the body is never stored beyond a short excerpt kept as text.
 * @param {any} em @param {{ deals?: any[] }} o
 */
export function emailCandidates(em, { deals = [] }) {
  const all = [...em.from, ...em.to, ...em.cc];
  const dealId = dealIn(`${em.subject} ${em.text}`, deals);
  const who = (l) => l.slice(0, 3).map((p) => p.name || p.email).join(', ') + (l.length > 3 ? ` and ${l.length - 3} more` : '');
  const day = em.instant === null ? null : new Date(em.instant).toISOString().slice(0, 10);
  const text = [`Email: ${em.subject || '(no subject)'}`, em.from.length && `from ${who(em.from)}`, em.to.length && `to ${who(em.to)}`, day ? `on ${day}` : 'date not readable in the file'].filter(Boolean).join(' · ').slice(0, 300);
  const a = { kind: 'activity', type: 'email', text, at: em.instant, date: day, time: null, zone: null, detail: squash(em.text).slice(0, 200), people: all.map((p) => p.email), dealId };
  if (em.instant === null) a.needsDate = true; // an email with no readable date asks for one; it is never dated "now"
  if (looksLikeInstruction(`${em.subject}\n${em.text}`)) a.suspicious = true;
  a.idKey = `email|${em.messageId || hashOf({ s: em.subject, i: em.instant, f: em.from })}`;
  a.rowKey = `${a.idKey}|${hashOf({ t: text, d: a.detail })}`;
  const cands = [a, ...people(all, { dealId, kind: 'email' })];
  return { cands, counts: { meetings: 0, tasks: 0, people: cands.length - 1 } };
}

/* mailui.js -- a calendar (.ics) or email (.eml) file dropped in or chosen on Connect: read on this device, every meeting, email,
 * to-do and person it names goes to the To file inbox (nothing is filed until a person taps), and an email's attachments are
 * offered to Start from documents (their own checks and caps apply there). Nothing is sent anywhere. The rules are in
 * icsread.js, emlread.js and mailitems.js. */
import { toast } from './kit.js';
import { sha256Hex } from './filehash.js';
import { readText } from './textfile.js';
import * as store from './store.js';
import { isoDay } from './pipeline.js';
import { readCalendar, MAX_EVENTS } from './icsread.js';
import { readEmail, MAX_BYTES } from './emlread.js';
import { calendarCandidates, emailCandidates } from './mailitems.js';
import { proposeRows } from './inboxstore.js';

export const isMailFile = (f) => /\.(ics|eml)$/i.test(f.name);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Read the files and propose what they name. Resolves to { lines: [one sentence per file], attachments: File[], added }.
 * `now` is for a test.
 * @param {File[]} files @param {{ now?: number }} [o]
 */
export async function proposeFromMailFiles(files, { now = Date.now() } = {}) {
  const deals = await store.listDeals();
  const today = isoDay(new Date(now));
  const lines = []; const attachments = []; let added = 0;
  for (const file of files) {
    try {
      if (file.size > MAX_BYTES) { lines.push(`${file.name}: ${Math.round(file.size / 1e6)} MB is more than the ${MAX_BYTES / 1e6} MB read.`); continue; }
      const buf = await file.arrayBuffer();
      const sha256 = await sha256Hex(buf);
      /** @type {any[]} */
      let cands = []; let kind; let said;
      if (/\.ics$/i.test(file.name)) {
        kind = 'calendar';
        const cal = readCalendar((await readText(file)).text, { now });
        const r = calendarCandidates(cal, { deals, today });
        cands = r.cands;
        const sk = cal.skipped;
        said = `${plural(r.counts.meetings, 'meeting', 'meetings')}, ${plural(r.counts.tasks, 'to-do', 'to-dos')}, ${plural(r.counts.people, 'person', 'people')}${sk.cancelled ? `; ${sk.cancelled} cancelled left out` : ''}${sk.noDate ? `; ${sk.noDate} with no date left out` : ''}${sk.tooMany ? `; ${sk.tooMany} more than the ${MAX_EVENTS} read left out` : ''}`;
      } else {
        kind = 'email';
        const em = readEmail(new Uint8Array(buf));
        if (em.error) { lines.push(`${file.name}: ${em.error}`); continue; }
        const r = emailCandidates(em, { deals });
        cands = r.cands;
        for (const c of em.calendars) cands.push(...calendarCandidates(readCalendar(c, { now }), { deals, today }).cands);
        for (const a of em.attachments) attachments.push(new File([/** @type {BlobPart} */ (a.bytes)], a.name, { type: a.type }));
        said = `1 email, ${plural(r.counts.people, 'person', 'people')}${em.calendars.length ? `, ${plural(em.calendars.length, 'calendar invite', 'calendar invites')}` : ''}${em.attachments.length ? `, ${plural(em.attachments.length, 'attachment', 'attachments')}` : ''}${em.notes.length ? ` (${em.notes.join(' ')})` : ''}`;
      }
      const res = await proposeRows({ cands, source: { kind, file: file.name, docRole: kind, sha256 }, now });
      added += res.added;
      lines.push(`${file.name}: ${said}. ${res.added} sent to To file${res.seen ? `, ${res.seen} seen before` : ''}${res.unchanged ? `, ${res.unchanged} already up to date` : ''}${res.flagged ? `, ${res.flagged} flagged as text` : ''}${res.left ? `, ${res.left} not sent (To file holds 500)` : ''}.`);
    } catch (e) { lines.push(`${file.name}: could not be read (${(e && e.message) || e}).`); }
  }
  return { lines, attachments, added };
}

/**
 * The drop or the Connect row: read, say what happened, offer the attachments to Start from documents, show To file.
 * `h` = { api: { showView }, done(): show To file }.
 * @param {File[]} files @param {any} h
 */
export async function openMailFiles(files, h) {
  const { lines, attachments, added } = await proposeFromMailFiles(files);
  toast(lines.join(' '), attachments.length ? { label: `Send ${plural(attachments.length, 'attachment', 'attachments')} to Start from documents`, run: () => sendToDocuments(attachments, h) } : null, 12000);
  if (added) h.done();
}

const wait = (ms) => new Promise((r) => { setTimeout(() => r(null), ms); });

/** Open Underwrite (quick side), where Start from documents is, and hand it the files as if they had been dropped on it. */
async function sendToDocuments(files, h) {
  h.api.showView('underwrite');
  // the tab opens on the built-in tool; Start from documents is on the quick underwrite side
  for (let i = 0; i < 20 && !document.getElementById('uw-view-quick'); i++) await wait(100);
  if (!document.getElementById('uw-intake')) document.getElementById('uw-view-quick')?.click();
  for (let i = 0; i < 30 && !document.getElementById('uw-intake'); i++) await wait(100);
  document.dispatchEvent(new CustomEvent('uwdrop', { detail: files }));
}

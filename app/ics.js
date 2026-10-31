/* ics.js -- key dates and task due dates as an iCalendar (RFC 5545) file for the phone's calendar.
 * Pure: text in, text out, nothing fetched or stored. Every event is an all-day one, because a deadline is a
 * calendar day and not an instant. */

import { PRODUCT } from './brand.js';
import { calDay } from './pipeline.js';
import { exchangeDates } from './tools.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 9 a.m. a week before, and 9 a.m. the day before (an all-day event starts at midnight). */
export const ALARMS = ['-P6DT15H', '-PT15H'];
export const ALARM_TASK = ['-PT15H'];
const ENC = new TextEncoder();
const UID_HOST = 'zlatura.invalid';

/** Text for a TEXT value. Line breaks become the two characters \n, so a title can never start a new line of the file. */
export function esc(s) {
  let out = '';
  for (const ch of String(s ?? '').replace(/\r\n?/g, '\n')) {
    const c = ch.codePointAt(0);
    if (ch === '\\' || ch === ';' || ch === ',') out += `\\${ch}`;
    else if (ch === '\n') out += '\\n';
    else if (c === 9 || c === 0x2028 || c === 0x2029) out += ' ';
    else if (c < 32 || c === 127 || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) continue;
    else if (c >= 0xd800 && c <= 0xdfff) out += '�';
    else out += ch;
  }
  return out;
}

/** Break a line before 75 octets, counted as UTF-8; a continuation starts with one space; a character is never split. */
export function fold(line) {
  const parts = []; let cur = ''; let n = 0;
  for (const ch of line) {
    const b = ENC.encode(ch).length;
    if (n + b > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; n = 0; }
    cur += ch; n += b;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const two = (n) => String(n).padStart(2, '0');
const ymd = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}`; };
const stamp = (t) => `${ymd(t)}T${two(new Date(t).getUTCHours())}${two(new Date(t).getUTCMinutes())}${two(new Date(t).getUTCSeconds())}Z`;
const cap = (s, n = 200) => { const a = Array.from(String(s ?? '')); return a.length > n ? `${a.slice(0, n - 1).join('')}…` : a.join(''); };

/** The calendar day a date text names, in any zone (ms at UTC midnight), or null. */
const dayOf = (s) => { if (!s) return null; const t = Date.parse(s); return Number.isNaN(t) ? null : calDay(s, t); };

/**
 * events: [{ evId, date, title, description?, alarms?: [TRIGGER, …], done? }]. A blank or invalid date and a done item
 * are left out; a missing date is never set to today. now (ms) and version stamp the file.
 */
export function icsFor(events, { now = Date.now(), version = '' } = {}) {
  const seq = Math.max(0, Math.floor((now - Date.UTC(2026, 0, 1)) / 60000));
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${PRODUCT}//${PRODUCT} ${esc(version)}//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    const day = e.done ? null : dayOf(e.date);
    if (day === null) continue;
    const title = cap(e.title);
    L.push('BEGIN:VEVENT', `UID:${esc(e.evId)}`, `DTSTAMP:${stamp(now)}`, `SEQUENCE:${seq}`,
      `DTSTART;VALUE=DATE:${ymd(day)}`, `DTEND;VALUE=DATE:${ymd(day + 86400000)}`, `SUMMARY:${esc(title)}`);
    if (e.description) L.push(`DESCRIPTION:${esc(e.description)}`);
    const d = new Date(day);
    for (const t of e.alarms || []) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${t}`, `DESCRIPTION:${esc(`${title} is on ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`)}`, 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return `${L.map(fold).join('\r\n')}\r\n`;
}

/**
 * The events a deal offers, from its open key dates and open tasks with a due date. Each carries a key for the
 * sheet's checkbox. left counts the key dates and tasks with no usable date.
 */
export function dealEvents(deal, tasks, { showName = true } = {}) {
  const name = showName ? (deal.name || 'Untitled deal') : `${PRODUCT} deal`;
  const events = []; let left = 0;
  for (const k of deal.keyDates || []) {
    if (k.done) continue;
    if (dayOf(k.date) === null) { left += 1; continue; }
    events.push({ slot: `kd-${k.id}`, evId: `kd-${deal.id}-${k.id}@${UID_HOST}`, date: k.date, title: `${name}: ${k.label}`, alarms: ALARMS });
  }
  for (const t of tasks || []) {
    if (t.dealId !== deal.id || t.done) continue;
    if (dayOf(t.due) === null) { left += 1; continue; }
    events.push({ slot: `task-${t.id}`, evId: `task-${t.id}@${UID_HOST}`, date: t.due, title: `${name}: ${t.title}`, alarms: ALARM_TASK });
  }
  return { events, left };
}

/** The deal's one open Closing date, for the 1031 offer; null when there are none or several. */
export function closingOf(deal) {
  const c = (deal.keyDates || []).filter((k) => k.label === 'Closing' && !k.done && dayOf(k.date) !== null);
  return c.length === 1 ? c[0] : null;
}

/** Day 45 and day 180 from the closing, through exchangeDates. */
export function exchangeEvents(deal, closing, { showName = true } = {}) {
  const name = showName ? (deal.name || 'Untitled deal') : `${PRODUCT} deal`;
  const r = exchangeDates(new Date(dayOf(closing.date)).toISOString().slice(0, 10));
  const iso = (d) => d.toISOString().slice(0, 10);
  const description = `From ${PRODUCT}. Calendar days from the closing on ${closing.date}, weekends and holidays included. An indication, not tax advice: confirm with the qualified intermediary and a tax adviser.`;
  return [
    { slot: 'x45', evId: `x45-${deal.id}-${closing.id}@${UID_HOST}`, date: iso(r.identify), title: `${name}: 1031 identify replacement property by (day 45)`, description, alarms: ALARMS },
    { slot: 'x180', evId: `x180-${deal.id}-${closing.id}@${UID_HOST}`, date: iso(r.close), title: `${name}: 1031 close by (day 180, or the tax return due date if earlier)`, description, alarms: ALARMS },
  ];
}

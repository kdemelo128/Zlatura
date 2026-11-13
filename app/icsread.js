/* icsread.js -- a calendar file (iCalendar, RFC 5545) read for what a broker logs: meetings with their date and time, the
 * people invited, and a repeating meeting's next occurrences. Pure: text in, plain records out; no library, nothing fetched
 * or stored. (ics.js writes calendar files; this reads them.)
 *
 * What it will not do, said plainly so a person is never shown a guess:
 *  - A time with a zone name that is not a real zone (and is not defined in the file) keeps its written date and time and
 *    says so (`zone: null`); it is never moved to another zone.
 *  - A time with no zone at all ("floating") keeps its written time and says so.
 *  - A repeat rule this reader does not fully handle (BYSETPOS, BYYEARDAY, BYWEEKNO, BYHOUR...) is not expanded: the first
 *    meeting is shown, marked `repeatNote`.
 *  - A repeating meeting is expanded only for the 90 days from `now`, at most 100 meetings per file. */

export const WINDOW_DAYS = 90;
export const MAX_EVENTS = 100;
const MAX_ITER = 40000;
const DAY = 86400000;

/** Windows' zone names, for the files that use them, mapped to the standard zone names the browser knows. */
const WIN_ZONES = Object.freeze({
  'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver',
  'US Mountain Standard Time': 'America/Phoenix', 'Pacific Standard Time': 'America/Los_Angeles', 'Alaskan Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu', 'Atlantic Standard Time': 'America/Halifax', 'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin', 'Romance Standard Time': 'Europe/Paris', 'Central Europe Standard Time': 'Europe/Budapest',
  'India Standard Time': 'Asia/Kolkata', 'China Standard Time': 'Asia/Shanghai', 'Tokyo Standard Time': 'Asia/Tokyo',
  'AUS Eastern Standard Time': 'Australia/Sydney', 'UTC': 'UTC',
});

/* ---------------------------------------------------------------- lines */

/** Unfold (a line break followed by one space or tab continues the line) and split. */
export function unfold(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

/** TEXT unescaped: \n and \N are line breaks, \, \; \\ are the characters. */
export const unescapeText = (s) => String(s ?? '').replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));

/** One content line as { name, params: { KEY: value }, value }, or null. A quoted parameter value may hold ":" and ";". */
export function parseLine(line) {
  let i = 0; let q = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === ':' && !q) break;
  }
  if (i >= line.length) return null;
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const parts = []; let cur = ''; q = false;
  for (const c of head) { if (c === '"') { q = !q; cur += c; } else if (c === ';' && !q) { parts.push(cur); cur = ''; } else cur += c; }
  parts.push(cur);
  const name = parts.shift().toUpperCase();
  if (!name) return null;
  const params = {};
  for (const p of parts) { const eq = p.indexOf('='); if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, ''); }
  return { name, params, value };
}

/** The components of a calendar as a tree: { type, props: [line, …], children: [] }. */
function tree(text) {
  const root = { type: 'ROOT', props: [], children: [] };
  const stack = [root];
  for (const raw of unfold(text)) {
    const ln = parseLine(raw);
    if (!ln) continue;
    const top = stack[stack.length - 1];
    if (ln.name === 'BEGIN') { const n = { type: ln.value.toUpperCase(), props: [], children: [] }; top.children.push(n); stack.push(n); } else if (ln.name === 'END') { if (stack.length > 1) stack.pop(); } else top.props.push(ln);
  }
  return root;
}
const walk = (n, type, out = []) => { if (n.type === type) out.push(n); for (const c of n.children) walk(c, type, out); return out; };
const prop = (n, name) => n.props.find((p) => p.name === name);
const all = (n, name) => n.props.filter((p) => p.name === name);

/* ------------------------------------------------------------ time zones */

const fmtCache = new Map();
function fmt(tz) {
  let f = fmtCache.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }); fmtCache.set(tz, f); }
  return f;
}
/** Minutes-in-ms east of UTC for `tz` at instant `ms`; throws RangeError for a name that is not a zone. */
function offsetAt(ms, tz) {
  const o = {};
  for (const p of fmt(tz).formatToParts(new Date(Math.floor(ms / 1000) * 1000))) if (p.type !== 'literal') o[p.type] = +p.value;
  return Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) - Math.floor(ms / 1000) * 1000;
}
/** The instant (ms) of wall-clock time y-mo-d h:mi:s in zone `tz`, or null when `tz` is not a zone. Daylight saving is handled (a time that does not exist moves forward; a repeated one is the first). */
export function zonedInstant(y, mo, d, h, mi, s, tz) {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  try {
    const before = offsetAt(wall - DAY, tz);
    const after = offsetAt(wall + DAY, tz);
    const ok = [...new Set([before, after])].map((o) => wall - o).filter((t) => offsetAt(t, tz) === wall - t).sort((a, b) => a - b);
    return ok.length ? ok[0] : wall - before; // in a gap: the offset before the change, as RFC 5545 says
  } catch { return null; }
}
/** The wall-clock parts of instant `ms` in `tz`. */
function wallParts(ms, tz) {
  const o = {};
  for (const p of fmt(tz).formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = +p.value;
  return o;
}

/** A zone name as one the browser knows, or null. `aliases` are the file's own VTIMEZONE names. */
function resolveZone(tzid, aliases) {
  if (!tzid) return null;
  const t = String(tzid).replace(/^\//, '');
  const candidates = [t, aliases.get(t), WIN_ZONES[t]].filter(Boolean);
  for (const c of candidates) { try { fmt(c); return c; } catch { /* not a zone */ } }
  return null;
}

/* --------------------------------------------------------------- values */

const two = (n) => String(n).padStart(2, '0');
const isoDay = (y, m, d) => `${y}-${two(m)}-${two(d)}`;

/**
 * A DTSTART/DTEND value as { allDay, y, mo, d, h, mi, s, utc (the file said Z), tzid, zone (a zone the browser knows, or null),
 * instant (ms, or null when the zone is unknown or floating) } or null.
 */
function readDate(p, aliases) {
  if (!p) return null;
  const v = p.value.trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m) return { allDay: true, y: +m[1], mo: +m[2], d: +m[3], h: 0, mi: 0, s: 0, utc: false, tzid: null, zone: null, instant: Date.UTC(+m[1], +m[2] - 1, +m[3], 12) };
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)$/.exec(v);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 60) return null;
  const out = { allDay: false, y, mo, d, h, mi, s, utc: !!m[7], tzid: p.params.TZID || null, zone: null, instant: null };
  if (out.utc) { out.zone = 'UTC'; out.instant = Date.UTC(y, mo - 1, d, h, mi, s); } else if (out.tzid) {
    out.zone = resolveZone(out.tzid, aliases);
    out.instant = out.zone ? zonedInstant(y, mo, d, h, mi, s, out.zone) : null;
  }
  return out;
}

/** The calendar day of a date value as the series' own zone sees it (a UTC value is converted); a value in another zone is converted too. */
function dayIn(r, zone) {
  if (!r) return null;
  if (r.instant !== null && zone && !r.allDay && (r.utc || (r.zone && r.zone !== zone))) { const p = wallParts(r.instant, zone); return isoDay(p.year, p.month, p.day); }
  return isoDay(r.y, r.mo, r.d);
}

/* ------------------------------------------------------------- repeating */

const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const SUPPORTED = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'WKST']);

function parseRule(v) {
  const r = {};
  for (const part of String(v).split(';')) { const eq = part.indexOf('='); if (eq > 0) r[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1); }
  return r;
}
/** The nth (1-based, or -1 for last) weekday `dow` of the month of day `d` in month `mo`, year `y`: whether (y, mo, d) is it. */
function nthWeekday(y, mo, d, dow, n) {
  const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  if (wd !== dow) return false;
  if (n > 0) return Math.ceil(d / 7) === n;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return Math.ceil((last - d + 1) / 7) === -n;
}

/**
 * The local calendar days (as { y, mo, d }) a rule gives from the start day on, up to `until` (a UTC-midnight ms) and at most
 * `cap`. Returns { days, unsupported } where `unsupported` names a part this reader does not handle (days is then just the start).
 */
function ruleDays(rule, start, untilMs, budget = { left: MAX_ITER, hit: false }) {
  for (const k of Object.keys(rule)) if (!SUPPORTED.has(k)) return { days: [{ y: start.y, mo: start.mo, d: start.d }], unsupported: k };
  const freq = rule.FREQ;
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return { days: [{ y: start.y, mo: start.mo, d: start.d }], unsupported: 'FREQ' };
  const interval = Math.max(1, parseInt(rule.INTERVAL || '1', 10) || 1);
  const count = rule.COUNT ? parseInt(rule.COUNT, 10) : Infinity;
  let stop = untilMs;
  if (rule.UNTIL) { const m = /^(\d{4})(\d{2})(\d{2})/.exec(rule.UNTIL); if (m) stop = Math.min(stop, Date.UTC(+m[1], +m[2] - 1, +m[3])); }
  const byday = rule.BYDAY ? rule.BYDAY.split(',').map((x) => { const m = /^([+-]?\d)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x.trim().toUpperCase()); return m ? { n: m[1] ? parseInt(m[1], 10) : 0, dow: DOW.indexOf(m[2]) } : null; }).filter(Boolean) : [];
  const bymd = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map((x) => parseInt(x, 10)) : [];
  const bymo = rule.BYMONTH ? rule.BYMONTH.split(',').map((x) => parseInt(x, 10)) : [];
  const wkst = Math.max(0, DOW.indexOf((rule.WKST || 'MO').toUpperCase()));
  const s0 = Date.UTC(start.y, start.mo - 1, start.d);
  const days = [];
  let n = 0; let iter = 0; void iter;
  for (let t = s0; t <= stop && n < count; t += DAY, iter++) {
    if (budget.left <= 0) { budget.hit = true; break; }
    budget.left -= 1;
    const dt = new Date(t);
    const y = dt.getUTCFullYear(); const mo = dt.getUTCMonth() + 1; const d = dt.getUTCDate(); const wd = dt.getUTCDay();
    let ok = false;
    if (freq === 'DAILY') ok = Math.round((t - s0) / DAY) % interval === 0;
    else if (freq === 'WEEKLY') {
      const weekStart = (x) => x - ((new Date(x).getUTCDay() - wkst + 7) % 7) * DAY;
      const weeks = Math.round((weekStart(t) - weekStart(s0)) / (7 * DAY));
      const days_ = byday.length ? byday.map((b) => b.dow) : [new Date(s0).getUTCDay()];
      ok = weeks % interval === 0 && days_.includes(wd);
    } else if (freq === 'MONTHLY') {
      const months = (y - start.y) * 12 + (mo - start.mo);
      if (months % interval === 0 && (!bymo.length || bymo.includes(mo))) {
        if (byday.length) ok = byday.some((b) => (b.n ? nthWeekday(y, mo, d, b.dow, b.n) : b.dow === wd));
        else if (bymd.length) ok = bymd.some((x) => (x > 0 ? x === d : d === new Date(Date.UTC(y, mo, 0)).getUTCDate() + 1 + x));
        else ok = d === start.d;
      }
    } else {
      const years = y - start.y;
      if (years % interval === 0 && (bymo.length ? bymo.includes(mo) : mo === start.mo)) {
        if (byday.length) ok = byday.some((b) => (b.n ? nthWeekday(y, mo, d, b.dow, b.n) : b.dow === wd));
        else if (bymd.length) ok = bymd.includes(d);
        else ok = d === start.d;
      }
    }
    if (ok && t >= s0) { n += 1; days.push({ y, mo, d }); }
  }
  return { days, unsupported: null };
}

/* ---------------------------------------------------------------- events */

const mailOf = (v) => { const m = /^(?:mailto:)?\s*([^\s<>]+@[^\s<>]+)\s*$/i.exec(String(v || '').trim()); return m ? m[1].toLowerCase() : ''; };
const clean = (s, n = 400) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g, ' ').trim().slice(0, n);

function person(p) {
  const email = mailOf(p.value);
  if (!email) return null;
  const type = (p.params.CUTYPE || '').toUpperCase();
  if (type === 'RESOURCE' || type === 'ROOM') return null;
  return { name: clean(unescapeText(p.params.CN || ''), 90), email, partstat: (p.params.PARTSTAT || '').toUpperCase() || null };
}

/**
 * The meetings in a calendar file, as plain records, and what was left out.
 * An event: { uid, summary, description, location, allDay, date (the calendar day it was scheduled for, in its own zone),
 * time ('HH:MM' or null), zone (a zone name, 'UTC', or null when the file gave none or one that is not a zone), zoneNote
 * (words for a person, or ''), instant (ms or null), duration (minutes or null), people: [{ name, email, partstat }],
 * organizer, recurring, repeatNote, cancelled }.
 * @param {string} text @param {{ now?: number }} [o]
 * Also `todos`: a task list's open items { uid, title, date (or null), description }.
 * @returns {{ events: any[], todos: any[], skipped: { cancelled: number, tooMany: number, noDate: number, repeatsCut: number }, method: string | null }}
 */
export function readCalendar(text, { now = Date.now() } = {}) {
  const root = tree(text);
  const aliases = new Map();
  for (const tz of walk(root, 'VTIMEZONE')) { const id = prop(tz, 'TZID'); const loc = prop(tz, 'X-LIC-LOCATION'); if (id && loc) aliases.set(id.value, loc.value); }
  const method = (walk(root, 'VCALENDAR')[0] && prop(walk(root, 'VCALENDAR')[0], 'METHOD') || { value: '' }).value.toUpperCase() || null;
  const skipped = { cancelled: 0, tooMany: 0, noDate: 0, repeatsCut: 0 };
  const vevents = walk(root, 'VEVENT');
  const overrides = new Map(); // uid -> Set of local days replaced by an edited instance
  for (const e of vevents) { const rid = prop(e, 'RECURRENCE-ID'); const u = prop(e, 'UID'); if (rid && u) { const r = readDate(rid, aliases); const series = vevents.find((x) => !prop(x, 'RECURRENCE-ID') && prop(x, 'UID') && prop(x, 'UID').value === u.value); const zone = series ? (readDate(prop(series, 'DTSTART'), aliases) || {}).zone : null; if (r) { if (!overrides.has(u.value)) overrides.set(u.value, new Set()); overrides.get(u.value).add(dayIn(r, zone)); } } }
  const from = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  const until = from + WINDOW_DAYS * DAY;
  const events = [];
  const budget = { left: 400000, hit: false };
  for (const e of vevents) {
    const status = ((prop(e, 'STATUS') || { value: '' }).value || '').toUpperCase();
    if (status === 'CANCELLED' || method === 'CANCEL') { skipped.cancelled += 1; continue; }
    const st = readDate(prop(e, 'DTSTART'), aliases);
    if (!st) { skipped.noDate += 1; continue; }
    const en = readDate(prop(e, 'DTEND'), aliases);
    const dur = prop(e, 'DURATION');
    let minutes = null;
    if (en && !st.allDay && en.instant !== null && st.instant !== null) minutes = Math.round((en.instant - st.instant) / 60000);
    else if (dur) { const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(dur.value); if (m) minutes = ((+m[1] || 0) * 7 + (+m[2] || 0)) * 1440 + (+m[3] || 0) * 60 + (+m[4] || 0); }
    const uid = (prop(e, 'UID') || { value: '' }).value || `no-uid-${events.length}`;
    const people = all(e, 'ATTENDEE').map(person).filter(Boolean);
    const orgP = prop(e, 'ORGANIZER');
    const organizer = orgP ? person(orgP) : null;
    const base = {
      uid, summary: clean(unescapeText((prop(e, 'SUMMARY') || { value: '' }).value), 200), description: clean(unescapeText((prop(e, 'DESCRIPTION') || { value: '' }).value), 1000),
      location: clean(unescapeText((prop(e, 'LOCATION') || { value: '' }).value), 200), people, organizer, minutes, cancelled: false,
    };
    const rr = prop(e, 'RRULE');
    const rrule = rr ? parseRule(rr.value) : null;
    const make = (day, repeatNote = '') => {
      const wall = { y: day.y, mo: day.mo, d: day.d };
      let instant = st.instant; let zoneNote = '';
      if (st.allDay) instant = Date.UTC(wall.y, wall.mo - 1, wall.d, 12);
      else if (st.zone) instant = zonedInstant(wall.y, wall.mo, wall.d, st.h, st.mi, st.s, st.zone);
      else { instant = null; zoneNote = st.tzid ? `“${clean(st.tzid, 60)}” is not a time zone this reader knows, so the time is shown as written` : 'the file gives no time zone, so the time is shown as written'; }
      return { ...base, allDay: st.allDay, date: isoDay(wall.y, wall.mo, wall.d), time: st.allDay ? null : `${two(st.h)}:${two(st.mi)}`, zone: st.allDay ? null : st.zone, zoneNote, instant, recurring: !!repeatNote || rrule !== null, repeatNote };
    };
    if (!rrule) {
      if (prop(e, 'RECURRENCE-ID')) { events.push(make({ y: st.y, mo: st.mo, d: st.d }, 'one edited meeting of a repeating series')); continue; }
      events.push(make({ y: st.y, mo: st.mo, d: st.d }));
      continue;
    }
    const { days, unsupported } = ruleDays(rrule, st, until, budget);
    if (budget.hit) { skipped.repeatsCut += 1; events.push(make({ y: st.y, mo: st.mo, d: st.d }, 'this file has too many repeating meetings to expand them all; only the first meeting is shown')); continue; }
    if (unsupported) { events.push(make({ y: st.y, mo: st.mo, d: st.d }, `repeats in a way this reader does not expand (${unsupported}); only the first meeting is shown`)); continue; }
    const ex = new Set(all(e, 'EXDATE').flatMap((x) => x.value.split(',').map((v) => readDate({ ...x, value: v.trim() }, aliases))).filter(Boolean).map((r) => dayIn(r, st.zone)));
    const skip = overrides.get(uid) || new Set();
    for (const day of days) {
      const t = Date.UTC(day.y, day.mo - 1, day.d);
      if (t < from || t > until) continue;
      const key = isoDay(day.y, day.mo, day.d);
      if (ex.has(key) || skip.has(key)) continue;
      events.push(make(day, 'repeating'));
    }
  }
  const todos = [];
  for (const t of walk(root, 'VTODO')) {
    const status = ((prop(t, 'STATUS') || { value: '' }).value || '').toUpperCase();
    if (status === 'COMPLETED' || status === 'CANCELLED') { skipped.cancelled += 1; continue; }
    const due = readDate(prop(t, 'DUE') || prop(t, 'DTSTART'), aliases);
    const title = clean(unescapeText((prop(t, 'SUMMARY') || { value: '' }).value), 200);
    if (!title) continue;
    todos.push({ uid: (prop(t, 'UID') || { value: '' }).value || `no-uid-todo-${todos.length}`, title, date: due ? isoDay(due.y, due.mo, due.d) : null, description: clean(unescapeText((prop(t, 'DESCRIPTION') || { value: '' }).value), 1000) });
  }
  const capped = events.slice(0, MAX_EVENTS);
  skipped.tooMany = events.length - capped.length;
  capped.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  return { events: capped, todos: todos.slice(0, MAX_EVENTS), skipped, method };
}
/** The time of an event for a person: "2027-03-04 15:00 America/New_York", "2027-03-04 all day". */
export const when = (ev) => `${ev.date}${ev.allDay ? ' all day' : ` ${ev.time}${ev.zone ? ` ${ev.zone}` : ' (no time zone in the file)'}`}`;

/** The wall-clock parts of an instant in a zone, for a test or a display. */
export const partsIn = wallParts;

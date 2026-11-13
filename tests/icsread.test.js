/* Calendar files read (app/icsread.js): time zones that move the instant correctly (daylight saving included), all-day and
 * floating times kept as written, folded lines, escapes, accented names, rooms left out, cancelled meetings left out, repeating
 * meetings expanded for 90 days only, and the rules this reader will not guess at. Invented meetings only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readCalendar, unfold, parseLine, zonedInstant, when, WINDOW_DAYS, MAX_EVENTS } from '../app/icsread.js';

const cal = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flat(), 'END:VCALENDAR'].join('\r\n');
const ev = (...lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];
const NOW = Date.UTC(2026, 10, 13, 12); // 2026-11-13

test('a time in a named zone becomes the right instant, in winter and in summer time', () => {
  const r = readCalendar(cal(ev('UID:w', 'DTSTART;TZID=America/New_York:20270304T150000', 'SUMMARY:Winter'), ev('UID:s', 'DTSTART;TZID=America/New_York:20270604T150000', 'SUMMARY:Summer')), { now: NOW });
  assert.deepEqual(r.events.map((e) => new Date(e.instant).toISOString()), ['2027-03-04T20:00:00.000Z', '2027-06-04T19:00:00.000Z']);
  assert.deepEqual(r.events.map((e) => [e.date, e.time, e.zone]), [['2027-03-04', '15:00', 'America/New_York'], ['2027-06-04', '15:00', 'America/New_York']]);
  const b = readCalendar(cal(ev('UID:b', 'DTSTART;TZID=Europe/Berlin:20270604T090000', 'SUMMARY:x')), { now: NOW });
  assert.equal(new Date(b.events[0].instant).toISOString(), '2027-06-04T07:00:00.000Z');
});

test('daylight saving: a time that does not exist moves forward, a repeated one is the first', () => {
  // 2027-03-14 02:30 does not exist in New York (clocks jump 2 to 3); 2026-11-01 01:30 happens twice
  assert.equal(new Date(zonedInstant(2027, 3, 14, 2, 30, 0, 'America/New_York')).toISOString(), '2027-03-14T07:30:00.000Z');
  assert.equal(new Date(zonedInstant(2026, 11, 1, 1, 30, 0, 'America/New_York')).toISOString(), '2026-11-01T05:30:00.000Z');
  assert.equal(zonedInstant(2027, 3, 4, 9, 0, 0, 'Not/AZone'), null);
});

test('Z times, Windows zone names and the file\'s own zone definition', () => {
  const r = readCalendar(cal(
    'BEGIN:VTIMEZONE', 'TZID:Custom Eastern', 'X-LIC-LOCATION:America/New_York', 'END:VTIMEZONE',
    ev('UID:z', 'DTSTART:20270304T200000Z', 'SUMMARY:Z'),
    ev('UID:win', 'DTSTART;TZID=Eastern Standard Time:20270304T150000', 'SUMMARY:Win'),
    ev('UID:own', 'DTSTART;TZID=Custom Eastern:20270304T150000', 'SUMMARY:Own')), { now: NOW });
  const iso = (e) => new Date(e.instant).toISOString();
  assert.deepEqual(r.events.map(iso), ['2027-03-04T20:00:00.000Z', '2027-03-04T20:00:00.000Z', '2027-03-04T20:00:00.000Z']);
  assert.equal(r.events.find((e) => e.summary === 'Z').zone, 'UTC');
});

test('an unknown zone and a floating time keep what was written and say so; they are never moved', () => {
  const r = readCalendar(cal(ev('UID:u', 'DTSTART;TZID=Mars/Olympus:20270304T150000', 'SUMMARY:Unknown'), ev('UID:f', 'DTSTART:20270304T150000', 'SUMMARY:Floating')), { now: NOW });
  for (const e of r.events) { assert.equal(e.instant, null); assert.equal(e.zone, null); assert.equal(e.time, '15:00'); assert.match(e.zoneNote, /time is shown as written/); }
  assert.match(r.events[0].zoneNote, /Mars\/Olympus/);
  assert.match(when(r.events[1]), /\(no time zone in the file\)/);
});

test('an all-day event is a calendar day with no time, in no zone', () => {
  const [e] = readCalendar(cal(ev('UID:a', 'DTSTART;VALUE=DATE:20270305', 'DTEND;VALUE=DATE:20270306', 'SUMMARY:Site visit')), { now: NOW }).events;
  assert.deepEqual([e.allDay, e.date, e.time, e.zone], [true, '2027-03-05', null, null]);
  assert.equal(when(e), '2027-03-05 all day');
});

test('folded lines, escapes, quoted parameters and accented names', () => {
  assert.deepEqual(unfold('SUMMARY:Lease re\r\n view \r\n\tof Acme'), ['SUMMARY:Lease review of Acme']);
  assert.deepEqual(parseLine('ATTENDEE;CN="Roe, Jane: VP";ROLE=REQ-PARTICIPANT:mailto:j@x.test'), { name: 'ATTENDEE', params: { CN: 'Roe, Jane: VP', ROLE: 'REQ-PARTICIPANT' }, value: 'mailto:j@x.test' });
  const text = cal(ev('UID:x', 'DTSTART;VALUE=DATE:20270305', 'SUMMARY:Lease review\\, Acme Pla', ' za\; part 2', 'DESCRIPTION:Line one\\nLine two', 'LOCATION:Suite 4\\, Floor 2',
    'ORGANIZER;CN="Roe\\, Jane":mailto:Jane.Roe@Example.test', 'ATTENDEE;CN=José Núñez;PARTSTAT=ACCEPTED:mailto:JOSE@example.test', 'ATTENDEE;CUTYPE=ROOM;CN=Room 4:mailto:room4@example.test', 'ATTENDEE:mailto:'));
  const [e] = readCalendar(text, { now: NOW }).events;
  assert.equal(e.summary, 'Lease review, Acme Plaza; part 2');
  assert.equal(e.description, 'Line one\nLine two');
  assert.equal(e.location, 'Suite 4, Floor 2');
  assert.deepEqual(e.organizer, { name: 'Roe, Jane', email: 'jane.roe@example.test', partstat: null });
  assert.deepEqual(e.people.map((p) => [p.name, p.email, p.partstat]), [['José Núñez', 'jose@example.test', 'ACCEPTED']]);
});

test('cancelled meetings, a cancel message and an event with no date are left out and counted', () => {
  const r = readCalendar(cal(ev('UID:c', 'DTSTART;VALUE=DATE:20270305', 'STATUS:CANCELLED', 'SUMMARY:No'), ev('UID:n', 'SUMMARY:No date'), ev('UID:k', 'DTSTART;VALUE=DATE:20270306', 'SUMMARY:Yes')), { now: NOW });
  assert.deepEqual([r.events.map((e) => e.summary), r.skipped.cancelled, r.skipped.noDate], [['Yes'], 1, 1]);
  assert.equal(readCalendar(`BEGIN:VCALENDAR\r\nMETHOD:CANCEL\r\n${ev('UID:k', 'DTSTART;VALUE=DATE:20270306', 'SUMMARY:Yes').join('\r\n')}\r\nEND:VCALENDAR`, { now: NOW }).events.length, 0);
});

test('a repeating meeting is expanded for the next 90 days only, honouring COUNT, UNTIL and EXDATE', () => {
  const weekly = readCalendar(cal(ev('UID:r', 'DTSTART;TZID=America/New_York:20260105T090000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE', 'EXDATE;TZID=America/New_York:20261123T090000', 'SUMMARY:Standup')), { now: NOW });
  const days = weekly.events.map((e) => e.date);
  assert.equal(days[0], '2026-11-16', 'nothing before today, and the excluded Monday is gone');
  assert.ok(!days.includes('2026-11-23'));
  assert.equal(days.at(-1), '2027-02-10');
  assert.ok(days.every((d) => d >= '2026-11-13' && d <= '2027-02-11'), 'inside the 90-day window');
  assert.equal(WINDOW_DAYS, 90);
  assert.ok(weekly.events.every((e) => e.recurring && e.time === '09:00'));
  const count = readCalendar(cal(ev('UID:c', 'DTSTART;VALUE=DATE:20261116', 'RRULE:FREQ=DAILY;COUNT=3', 'SUMMARY:Three')), { now: NOW });
  assert.deepEqual(count.events.map((e) => e.date), ['2026-11-16', '2026-11-17', '2026-11-18']);
  const until = readCalendar(cal(ev('UID:u', 'DTSTART;VALUE=DATE:20261116', 'RRULE:FREQ=DAILY;UNTIL=20261117T000000Z', 'SUMMARY:Until')), { now: NOW });
  assert.deepEqual(until.events.map((e) => e.date), ['2026-11-16', '2026-11-17']);
  // COUNT counts from the first meeting, including those before today
  const old = readCalendar(cal(ev('UID:o', 'DTSTART;VALUE=DATE:20261101', 'RRULE:FREQ=DAILY;COUNT=15', 'SUMMARY:Old')), { now: NOW });
  assert.deepEqual(old.events.map((e) => e.date), ['2026-11-13', '2026-11-14', '2026-11-15']);
});

test('a repeating 9 a.m. meeting stays at 9 a.m. local across the clock change, so its instants differ by an hour', () => {
  const r = readCalendar(cal(ev('UID:d', 'DTSTART;TZID=America/New_York:20261028T090000', 'RRULE:FREQ=WEEKLY;COUNT=5', 'SUMMARY:Weekly')), { now: Date.UTC(2026, 9, 28) });
  const hours = r.events.map((e) => [e.date, new Date(e.instant).getUTCHours()]);
  assert.deepEqual(hours, [['2026-10-28', 13], ['2026-11-04', 14], ['2026-11-11', 14], ['2026-11-18', 14], ['2026-11-25', 14]]);
});

test('monthly by weekday, and an edited instance replaces its generated one', () => {
  const m = readCalendar(cal(ev('UID:m', 'DTSTART;VALUE=DATE:20260102', 'RRULE:FREQ=MONTHLY;BYDAY=1FR', 'SUMMARY:First Friday')), { now: NOW });
  assert.deepEqual(m.events.map((e) => e.date), ['2026-12-04', '2027-01-01', '2027-02-05']);
  const o = readCalendar(cal(ev('UID:e', 'DTSTART;VALUE=DATE:20261116', 'RRULE:FREQ=DAILY;COUNT=3', 'SUMMARY:Series'), ev('UID:e', 'RECURRENCE-ID;VALUE=DATE:20261117', 'DTSTART;VALUE=DATE:20261120', 'SUMMARY:Moved')), { now: NOW });
  assert.deepEqual(o.events.map((e) => `${e.date} ${e.summary}`), ['2026-11-16 Series', '2026-11-18 Series', '2026-11-20 Moved']);
});

test('a repeat rule this reader does not fully handle is not guessed: the first meeting is shown with a note', () => {
  const [e, ...rest] = readCalendar(cal(ev('UID:p', 'DTSTART;VALUE=DATE:20261116', 'RRULE:FREQ=MONTHLY;BYDAY=MO,TU;BYSETPOS=-1', 'SUMMARY:Odd')), { now: NOW }).events;
  assert.equal(rest.length, 0);
  assert.match(e.repeatNote, /does not expand \(BYSETPOS\)/);
});

test('at most 100 meetings a file, and open to-dos become tasks', () => {
  const many = Array.from({ length: 130 }, (_, i) => ev(`UID:m${i}`, 'DTSTART;VALUE=DATE:20270105', `SUMMARY:M${i}`)).flat();
  const r = readCalendar(cal(many), { now: NOW });
  assert.deepEqual([r.events.length, r.skipped.tooMany, MAX_EVENTS], [100, 30, 100]);
  const t = readCalendar(cal(['BEGIN:VTODO', 'UID:t1', 'SUMMARY:Send rent roll', 'DUE;VALUE=DATE:20261120', 'END:VTODO'], ['BEGIN:VTODO', 'UID:t2', 'SUMMARY:Done', 'STATUS:COMPLETED', 'END:VTODO']), { now: NOW });
  assert.deepEqual(t.todos.map((x) => [x.title, x.date]), [['Send rent roll', '2026-11-20']]);
});

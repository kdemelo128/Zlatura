import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { icsFor, esc, dealEvents, closingOf, exchangeEvents, ALARMS } from '../app/ics.js';
import { exchangeDates } from '../app/tools.js';

const NOW = Date.UTC(2026, 0, 1, 0, 10, 5);
const opts = { now: NOW, version: '9.9.9' };
const ev = (o) => ({ uid: 'u1@zlatura.invalid', date: '2027-03-01', title: 'Harbor Plaza: Closing', alarms: ALARMS, ...o });
const unfold = (t) => t.replace(/\r\n /g, '');
const lines = (t) => t.split('\r\n');
const octets = (s) => new TextEncoder().encode(s).length;
const PACK = '😀'.repeat(30);
const ARABIC = 'مبنى المرفأ التجاري، الطابق الأول؛ شقة رقم ١٢'.repeat(3);
const LONG = 'Closing statement review with the lender and the title company, '.repeat(6);

test('two events, exact text', () => {
  const t = icsFor([ev({}), ev({ uid: 'u2@zlatura.invalid', date: '2027-04-15', title: 'Task, with; marks', alarms: ['-PT15H'] })], opts);
  assert.equal(t, [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Zlatura//Zlatura 9.9.9//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', 'UID:u1@zlatura.invalid', 'DTSTAMP:20260101T001005Z', 'SEQUENCE:10', 'DTSTART;VALUE=DATE:20270301', 'DTEND;VALUE=DATE:20270302',
    'SUMMARY:Harbor Plaza: Closing',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P6DT15H', 'DESCRIPTION:Harbor Plaza: Closing is on Mar 1', 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT15H', 'DESCRIPTION:Harbor Plaza: Closing is on Mar 1', 'END:VALARM', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:u2@zlatura.invalid', 'DTSTAMP:20260101T001005Z', 'SEQUENCE:10', 'DTSTART;VALUE=DATE:20270415', 'DTEND;VALUE=DATE:20270416',
    'SUMMARY:Task\\, with\\; marks',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT15H', 'DESCRIPTION:Task\\, with\\; marks is on Apr 15', 'END:VALARM', 'END:VEVENT',
    'END:VCALENDAR', ''].join('\r\n'));
});

test('no line is over 75 octets; unfolding gives back emoji, Arabic and long text', () => {
  const t = icsFor([ev({ title: PACK }), ev({ uid: 'b', title: ARABIC }), ev({ uid: 'c', title: LONG.slice(0, 150), description: LONG })], opts);
  for (const l of lines(t)) assert.ok(octets(l) <= 75, `${octets(l)} octets: ${l}`);
  const u = unfold(t);
  assert.ok(u.includes(`SUMMARY:${PACK}`));
  assert.ok(u.includes(`SUMMARY:${esc(ARABIC)}`));
  assert.ok(u.includes(`SUMMARY:${esc(LONG.slice(0, 150))}`) && u.includes(`DESCRIPTION:${esc(LONG)}`));
  assert.ok(!u.includes('�'), 'no character was split');
});

test('a line break in a title cannot start a new line of the file', () => {
  for (const bad of ['A\r\nBEGIN:VEVENT', 'A\rBEGIN:VEVENT', 'A\nBEGIN:VEVENT', 'A BEGIN:VEVENT']) {
    const t = icsFor([ev({ title: bad }), ev({ uid: 'z' })], opts);
    assert.equal(lines(t).filter((l) => l === 'BEGIN:VEVENT').length, 2, JSON.stringify(bad));
  }
  assert.equal(esc('a\r\nb'), 'a\\nb');
  assert.equal(esc('a\tb\u0007c‮D⁦'), 'a bcD');
  assert.equal(esc('a\\b;c,d'), 'a\\\\b\\;c\\,d');
  assert.equal(esc('x\ud800y'), 'x�y');
});

test('a title is capped at 200 characters', () => {
  const t = unfold(icsFor([ev({ title: '😀'.repeat(250) })], opts));
  assert.ok(t.includes(`SUMMARY:${'😀'.repeat(199)}…\r\n`));
});

test('the end is the next day, over month, year and leap day', () => {
  const t = icsFor([ev({ date: '2027-12-31' }), ev({ uid: 'b', date: '2028-02-28' }), ev({ uid: 'c', date: '2027-02-28' })], opts);
  assert.ok(t.includes('DTSTART;VALUE=DATE:20271231\r\nDTEND;VALUE=DATE:20280101'));
  assert.ok(t.includes('DTSTART;VALUE=DATE:20280228\r\nDTEND;VALUE=DATE:20280229'));
  assert.ok(t.includes('DTSTART;VALUE=DATE:20270228\r\nDTEND;VALUE=DATE:20270301'));
});

test('blank, invalid and done items are left out, and today never appears', () => {
  const t = icsFor([ev({ date: '' }), ev({ date: null }), ev({ date: 'not a date' }), ev({ done: true }), ev({ uid: 'ok', date: '2031-05-06' })], opts);
  assert.equal(lines(t).filter((l) => l === 'BEGIN:VEVENT').length, 1);
  assert.ok(!/DTSTART;VALUE=DATE:2026/.test(t));
});

const deal = { id: 'dA', name: 'Harbor Plaza', keyDates: [
  { id: 'k1', label: 'Closing', date: '2027-03-01', done: false },
  { id: 'k2', label: 'Due diligence expires', date: '', done: false },
  { id: 'k3', label: 'Loan maturity', date: '2027-09-09', done: true },
  { id: 'k4', label: 'Deposit goes hard', date: '2027-02-10', done: false }] };
const tasks = [{ id: 't1', dealId: 'dA', title: 'Send LOI', due: '2027-01-05', done: false }, { id: 't2', dealId: 'dB', title: 'Other deal', due: '2027-01-06', done: false },
  { id: 't3', dealId: 'dA', title: 'Done task', due: '2027-01-07', done: true }, { id: 't4', dealId: 'dA', title: 'No due', due: null, done: false }];

test('a deal offers its open dated key dates and tasks; UIDs are stable per deal', () => {
  const a = dealEvents(deal, tasks);
  assert.deepEqual(a.events.map((e) => e.uid), ['kd-dA-k1@zlatura.invalid', 'kd-dA-k4@zlatura.invalid', 'task-t1@zlatura.invalid']);
  assert.equal(a.left, 2);
  assert.deepEqual(a.events.map((e) => e.alarms.length), [2, 2, 1]);
  assert.deepEqual(dealEvents(deal, tasks).events.map((e) => e.uid), a.events.map((e) => e.uid));
  const b = dealEvents({ ...deal, id: 'dB' }, []);
  assert.ok(b.events.every((e, i) => e.uid !== a.events[i].uid));
  assert.equal(a.events[0].title, 'Harbor Plaza: Closing');
  assert.equal(dealEvents(deal, tasks, { showName: false }).events[0].title, 'Zlatura deal: Closing');
});

test('the 1031 dates equal exchangeDates, and need exactly one open Closing', () => {
  const c = closingOf(deal);
  assert.equal(c.id, 'k1');
  assert.equal(closingOf({ keyDates: [...deal.keyDates, { id: 'k9', label: 'Closing', date: '2027-04-01', done: false }] }), null);
  const [x45, x180] = exchangeEvents(deal, c);
  const r = exchangeDates('2027-03-01');
  assert.equal(x45.date, r.identify.toISOString().slice(0, 10));
  assert.equal(x180.date, r.close.toISOString().slice(0, 10));
  assert.equal(x45.date, '2027-04-15');
  assert.equal(x45.uid, 'x45-dA-k1@zlatura.invalid');
  assert.match(x45.description, /not tax advice/);
});

test('a date never moves with the device zone', () => {
  const code = "import('./app/ics.js').then(({icsFor})=>{const t=icsFor([{uid:'u',date:'2027-03-01T00:30:00',title:'t'},{uid:'v',date:'2027-03-01',title:'t'}],{now:0});console.log((t.match(/DTSTART;VALUE=DATE:\\d+/g)).join(' '))})";
  for (const tz of ['Pacific/Kiritimati', 'America/Los_Angeles']) {
    const out = execFileSync(process.execPath, ['-e', code], { env: { ...process.env, TZ: tz }, cwd: new URL('..', import.meta.url).pathname }).toString().trim();
    assert.equal(out, 'DTSTART;VALUE=DATE:20270301 DTSTART;VALUE=DATE:20270301', tz);
  }
});

test('the share check tests the real file type', async () => {
  globalThis.window = globalThis.window || {};
  const seen = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { canShare: ({ files }) => { seen.push(files[0].type); return files[0].type === 'text/calendar'; } } });
  const { canShareFiles, XLSX } = await import('../app/kit.js');
  assert.equal(canShareFiles(), false);
  assert.equal(canShareFiles('text/calendar', 'a.ics'), true);
  assert.deepEqual(seen, [XLSX, 'text/calendar']);
});

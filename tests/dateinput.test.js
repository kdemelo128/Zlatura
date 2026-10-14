/* The shared date field's reading of typed dates (app/dateinput.js), and the
 * lease engine's day parser it relies on. A typed date is read only when the
 * person leaves the field, so these are the rules for what that reading says. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDateText, fmtDate, MIN_YEAR, MAX_YEAR } from '../app/dateinput.js';
import { dayOf, isoOf, addDays } from '../app/lease.js';

test('every accepted way of writing a date', () => {
  const table = [
    ['01/15/2027', '2027-01-15'], ['1/5/2027', '2027-01-05'], ['12/31/1999', '1999-12-31'],
    ['1/5/27', '2027-01-05'], ['12/31/05', '2005-12-31'],
    ['1-5-2027', '2027-01-05'], ['1.5.2027', '2027-01-05'],
    ['2027-01-15', '2027-01-15'], ['2027-1-5', '2027-01-05'],
    ['01152027', '2027-01-15'], ['011527', '2027-01-15'], ['20270115', '2027-01-15'],
    ['Jan 2027', '2027-01-01'], ['January 2027', '2027-01-01'], ['jan 2027', '2027-01-01'], ['Jan-27', '2027-01-01'],
    ['Sept 2027', '2027-09-01'], ['1/2027', '2027-01-01'],
    ['Jan 15, 2027', '2027-01-15'], ['January 15 2027', '2027-01-15'], ['Jan 5th, 2027', '2027-01-05'],
    ['  01/15/2027  ', '2027-01-15'], ['1/15/2027\n', '2027-01-15'],
    ['02/29/2028', '2028-02-29'], ['02/29/2000', '2000-02-29'],
    ['01/01/1900', '1900-01-01'], ['12/31/2100', '2100-12-31'],
  ];
  for (const [text, iso] of table) assert.equal(parseDateText(text), iso, JSON.stringify(text));
});

test('a month with no day is its first day, or its last day for the fields that end something', () => {
  const table = [
    ['Jan 2027', '2027-01-31'], ['February 2027', '2027-02-28'], ['Feb-28', '2028-02-29'], ['feb 2027', '2027-02-28'],
    ['4/2027', '2027-04-30'], ['12/2027', '2027-12-31'], ['Jun 2027', '2027-06-30'], ['Feb 2100', '2100-02-28'],
  ];
  for (const [text, last] of table) {
    assert.equal(parseDateText(text, { end: true }), last, `${text} (end)`);
    assert.equal(parseDateText(text), `${last.slice(0, 8)}01`, `${text} (start)`);
  }
  // a full date is itself, whichever field it is in
  assert.equal(parseDateText('01/15/2027', { end: true }), '2027-01-15');
  assert.equal(parseDateText('2027-02-14', { end: true }), '2027-02-14');
});

test('two-digit years mean 20yy', () => {
  assert.equal(parseDateText('1/5/27'), '2027-01-05');
  assert.equal(parseDateText('1/5/99'), '2099-01-05');
  assert.equal(parseDateText('1/5/00'), '2000-01-05');
  assert.equal(parseDateText('Jan-99'), '2099-01-01');
});

test('empty text is a cleared date; anything else that is not a date is null', () => {
  for (const blank of ['', '   ', '\n', null, undefined]) assert.equal(parseDateText(blank), '', JSON.stringify(blank));
  const bad = [
    '02/30/2027', '02/29/2027', '04/31/2027', '13/01/2027', '00/10/2027', '1/0/2027', '1/32/2027', '2027-02-30', '2027-13-01',
    '1/1/1899', '1/1/2101', '12/31/1899', '0002-01-05', '0027-01-05', '1/5/0027', '1/5/202', '1/5/20277',
    'abc', 'Janu 2027', 'Foo 2027', '1/15/', '1//2027', '2027', '15', '1/15', 'Jan', 'Jan 15', 'Jan 27', '01/15/2027 extra', '2/', '-',
    '19000115x', '99999999',
  ];
  for (const text of bad) assert.equal(parseDateText(text), null, JSON.stringify(text));
  assert.equal(parseDateText('Foo 2027', { end: true }), null);
  assert.equal(parseDateText('02/30/2027', { end: true }), null);
});

test('the year range is 1900 to 2100, and leap years are real', () => {
  assert.equal(MIN_YEAR, 1900); assert.equal(MAX_YEAR, 2100);
  assert.equal(parseDateText('1/1/1900'), '1900-01-01');
  assert.equal(parseDateText('1/1/2100'), '2100-01-01');
  assert.equal(parseDateText('2/29/1900'), null, '1900 was not a leap year');
  assert.equal(parseDateText('2/29/2100'), null, '2100 is not a leap year');
  assert.equal(parseDateText('2/29/2000'), '2000-02-29', '2000 was');
  assert.equal(parseDateText('2/29/2024'), '2024-02-29');
  assert.equal(parseDateText('Feb 2000', { end: true }), '2000-02-29');
  assert.equal(parseDateText('Feb 1900', { end: true }), '1900-02-28');
});

test('what the year is while it is still being typed is never taken for a date', () => {
  // the browser's own date control reports these on the way to 2027; 1/5/20 is a real date (2020), which is why nothing is read while typing
  for (const partial of ['1/5/2', '1/5/202']) assert.equal(parseDateText(partial), null, partial);
  for (const partial of ['0002-01-05', '0020-01-05', '0202-01-05', '1/5/2', '1/5/20', '1/5/202']) {
    const r = parseDateText(partial);
    assert.ok(r === null || r === '2020-01-05' || r === '2005-01-01' || /^20\d\d-/.test(r), `${partial} -> ${r}`);
  }
  for (const partial of ['0002-01-05', '0020-01-05', '0202-01-05']) assert.equal(parseDateText(partial), null, partial);
});

test('fmtDate shows MM/DD/YYYY', () => {
  assert.equal(fmtDate('2027-01-05'), '01/05/2027');
  assert.equal(fmtDate('1999-12-31'), '12/31/1999');
  assert.equal(fmtDate(''), '');
  assert.equal(fmtDate(null), '');
  assert.equal(fmtDate('not a date'), 'not a date', 'old text from an import is shown as it is');
  for (const iso of ['2027-01-05', '2000-02-29', '1900-01-01', '2100-12-31']) assert.equal(parseDateText(fmtDate(iso)), iso, iso);
});

test('the lease engine reads years 0 to 99 as written, not as 1900 to 1999', () => {
  // Date.UTC(2, ...) is 1902: 0002-01-05 used to be taken for a bad date (the year did not match) and 0099 for 1999
  const d = dayOf('0002-01-05');
  assert.notEqual(d, null);
  assert.equal(isoOf(d), '0002-01-05');
  assert.equal(isoOf(dayOf('0099-12-31')), '0099-12-31');
  assert.equal(addDays('0002-01-05', 1), '0002-01-06');
  assert.equal(dayOf('0000-01-01') === null, false);
  // dates people really use are the same as before
  assert.equal(dayOf('1970-01-01'), 0);
  assert.equal(dayOf('2026-06-30'), 20634);
  assert.equal(dayOf('2028-02-29'), 21243);
  assert.equal(dayOf('2026-02-30'), null);
  assert.equal(dayOf('2026-13-01'), null);
  assert.equal(dayOf('1900-01-01'), -25567);
  assert.equal(dayOf('2100-12-31'), 47846);
  assert.equal(isoOf(dayOf('2027-01-05')), '2027-01-05');
});

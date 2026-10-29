/* downloadName: text typed on the page (a deal name) reaches a file name, so the name handed to the system is
 * made safe first: no path separators, control or bidi characters, characters a file system refuses, leading
 * dots, or more than 120 characters. Invented names only. */
import test from 'node:test';
import assert from 'node:assert/strict';

const importKit = async () => {
  globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
  globalThis.window ||= globalThis;
  globalThis.navigator ||= { userAgent: 'node' };
  return import('../app/kit.js');
};

test('ordinary names are unchanged', async () => {
  const { downloadName } = await importKit();
  for (const n of ['Deal - Harbor Plaza.xlsx', 'Pipeline 2027-03-01.xlsx', 'Rent roll - Maple Court.csv', 'Deal - Harbor Plaza-dates.ics']) {
    assert.equal(downloadName(n), n);
  }
});

test('path separators, quotes and angle brackets become hyphens, never a path', async () => {
  const { downloadName } = await importKit();
  const n = downloadName('..\\..\\evil/<img src=x onerror=alert(1)>: "x" | y?.ics');
  assert.ok(!/[\\/:*?"<>|]/.test(n), n);
  assert.ok(!n.startsWith('.'), n);
  assert.ok(n.endsWith('.ics'), n);
});

test('control and bidirectional characters are removed', async () => {
  const { downloadName } = await importKit();
  const n = downloadName('Deal\u0000\r\n‮exe.csv ');
  assert.ok(!new RegExp('[\\u0000-\\u001f\\u007f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069]').test(n), JSON.stringify(n));
  assert.ok(n.endsWith('.csv'), n);
});

test('a long name is cut with its extension kept; an empty name becomes "file"', async () => {
  const { downloadName } = await importKit();
  const n = downloadName(`${'A'.repeat(300)}.xlsx`);
  assert.equal(n.length, 120);
  assert.ok(n.endsWith('.xlsx'));
  assert.equal(downloadName('   '), 'file');
  assert.equal(downloadName('...'), 'file');
  assert.equal(downloadName(null), 'file');
});

test('non-Latin text and emoji are kept', async () => {
  const { downloadName } = await importKit();
  assert.equal(downloadName('Café Müller 北京 🏢.xlsx'), 'Café Müller 北京 🏢.xlsx');
});

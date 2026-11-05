/* The lease reader's screen helpers that need no browser (app/leasereadui.js): the watchdog that stops a slow page or analysis, and
 * where a quote sits on a page for "Show page". Invented text only. */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const { withWatchdog, quoteBoxes } = await import('../app/leasereadui.js');

test('the watchdog rejects a slow job as { slow } after running the stop, and a fast job finishes without stopping anything', async () => {
  let stopped = 0;
  await assert.rejects(withWatchdog(new Promise(() => {}), 20, () => { stopped++; }), (e) => e.slow === true);
  assert.equal(stopped, 1, 'the slow page’s engine was stopped');
  assert.equal(await withWatchdog(Promise.resolve('ok'), 50, () => { stopped++; }), 'ok');
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(stopped, 1, 'a finished job leaves no timer behind');
  await assert.rejects(withWatchdog(Promise.reject(new Error('boom')), 50), /boom/);
});

test('a throw inside the stop does not hide the timeout', async () => {
  await assert.rejects(withWatchdog(new Promise(() => {}), 10, () => { throw new Error('x'); }), (e) => e.slow === true);
});

test('quoteBoxes: the lines of the page inside the quote, from the text layout or the OCR word boxes, scaled back to points', () => {
  const geom = { lines: [{ frags: [{ x0: 40, x1: 200 }], y: 700, h: 8 }, { frags: [{ x0: 40, x1: 300 }], y: 690, h: 8 }, { frags: [{ x0: 40, x1: 90 }], y: 680, h: 8 }] };
  const entry = { texts: ['Tenant: Tidewater Bakery Inc.\nSuite 210, second floor\nok'], layouts: [geom], ocr: {} };
  const b = quoteBoxes(entry, 1, 'Tenant: Tidewater Bakery Inc.', 792);
  assert.equal(b.length, 1);
  assert.ok(b[0].x < 40 && b[0].w > 160 && b[0].y > 0 && b[0].y < 792);
  assert.deepEqual(quoteBoxes(entry, 1, 'Not on the page at all', 792), []);
  const scan = { texts: [''], layouts: [], ocr: { 1: { text: 'Tenant: Tidewater Bakery Inc.', scale: 2, geom: { lines: [{ frags: [{ x0: 80, x1: 400 }], y: 1400, h: 16 }] } } } };
  const s = quoteBoxes(scan, 1, 'Tenant: Tidewater Bakery Inc.', 792);
  assert.equal(s.length, 1);
  assert.ok(Math.abs(s[0].x - 38) < 1 && Math.abs(s[0].w - 164) < 1, JSON.stringify(s));
  assert.deepEqual(quoteBoxes({ texts: [''], layouts: [], ocr: {} }, 1, 'anything', 792), []);
});

/* Home's pulse panel: the data shaping and the device's Home choices (app/pulse.js). Invented figures only. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekly, flowRows, pulseData, describe, loadPrefs, savePrefs, arrange, move, WEEKS } from '../app/pulse.js';
import { pipelineSummary, taskBuckets } from '../app/pipeline.js';

const DAY = 86400000;
const NOW = Date.parse('2026-11-13T12:00:00Z');
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('weekly counts the last 12 weeks, oldest first, and ignores times outside them', () => {
  const w = weekly([NOW - 1000, NOW - 6 * DAY, NOW - 8 * DAY, NOW - 83 * DAY, NOW - 84 * DAY, NOW + DAY, 'x', null, NaN, undefined], NOW);
  assert.equal(w.length, WEEKS);
  assert.deepEqual(w.slice(-2), [1, 2], 'this week holds the first two, last week the 8-day-old one');
  assert.equal(w[0], 1, '83 days ago is the oldest week; 84 days is outside');
  assert.equal(w.reduce((a, b) => a + b, 0), 4);
  assert.deepEqual(weekly([], NOW), new Array(WEEKS).fill(0));
});

test('flowRows: active stages with deals only, sized by asking value, or by count when nothing is priced', () => {
  const deals = [
    { stage: 'listing', figures: { price: 4000000 } }, { stage: 'listing', figures: { price: null } },
    { stage: 'offer', figures: { price: 1000000 } }, { stage: 'closed', figures: { price: 9e9 } }, { stage: 'dead', figures: {} },
  ];
  const f = flowRows(pipelineSummary(deals));
  assert.deepEqual(f.rows.map((r) => r.key), ['listing', 'offer'], 'closed and lost are not in the pipeline; empty stages are left out');
  assert.equal(f.mode, 'value');
  assert.equal(f.frac(f.rows[0]), 1);
  assert.equal(f.frac(f.rows[1]), 0.25);
  assert.equal(f.rows[0].count - f.rows[0].priced, 1, 'the unpriced deal is counted, not sized');
  const c = flowRows(pipelineSummary([{ stage: 'listing', figures: {} }, { stage: 'listing', figures: {} }, { stage: 'offer', figures: {} }]));
  assert.equal(c.mode, 'count');
  assert.deepEqual([c.frac(c.rows[0]), c.frac(c.rows[1])], [1, 0.5]);
  const none = flowRows(pipelineSummary([]));
  assert.deepEqual([none.rows.length, none.max, none.mode], [0, 0, 'count']);
});

test('pulseData: deals added, tasks done and the chips come from the person\'s own records', () => {
  const deals = [{ createdAt: NOW - DAY, stage: 'listing', figures: { price: 1 } }, { createdAt: NOW - 20 * DAY, figures: {} }];
  const tasks = [{ done: true, doneAt: NOW - 2 * DAY }, { done: true, doneAt: null }, { done: false, due: '2026-11-10' }, { done: false, due: '2026-11-13' }, { done: false, due: '2026-11-16' }];
  const d = pulseData({ deals, tasks, waiting: 3, summary: pipelineSummary(deals), buckets: taskBuckets(tasks, '2026-11-13'), now: NOW });
  assert.equal(d.addedTotal, 2);
  assert.equal(d.added[WEEKS - 1], 1);
  assert.equal(d.doneTotal, 1, 'a done task with no finish time is not placed in a week');
  assert.deepEqual(d.chips, { today: 1, overdue: 1, week: 1, toFile: 3 });
  assert.equal(d.hasDeals, true);
  const empty = pulseData({ deals: [], tasks: [], summary: pipelineSummary([]), buckets: taskBuckets([], '2026-11-13'), now: NOW });
  assert.deepEqual([empty.hasDeals, empty.addedTotal, empty.doneTotal, empty.chips.toFile], [false, 0, 0, 0]);
  assert.match(describe('flow', empty), /No active deals/);
  assert.match(describe('deals', d), /^2 deals added in the last 12 weeks; 1 this week/);
});

test('the choices: a blocked, empty or damaged value gives today\'s Home; saving defaults clears the key', () => {
  assert.deepEqual(loadPrefs(memory()), { order: [], hidden: [], chart: 'flow', pulse: true });
  const bad = memory(); bad.setItem('zlatura.home', '{nope');
  assert.equal(loadPrefs(bad).chart, 'flow');
  const odd = memory(); odd.setItem('zlatura.home', JSON.stringify({ order: ['a', 3, 'a'], hidden: 'x', chart: 'pie', pulse: false }));
  assert.deepEqual(loadPrefs(odd), { order: ['a'], hidden: [], chart: 'flow', pulse: false });
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(loadPrefs(blocked).pulse, true);
  assert.equal(savePrefs({ order: ['a'], hidden: [], chart: 'flow', pulse: true }, blocked), false, 'a device that will not keep it says so');
  const m = memory();
  assert.equal(savePrefs({ order: ['a'], hidden: ['b'], chart: 'tasks', pulse: false }, m), true);
  assert.deepEqual(loadPrefs(m), { order: ['a'], hidden: ['b'], chart: 'tasks', pulse: false });
  savePrefs({ order: [], hidden: [], chart: 'flow', pulse: true }, m);
  assert.equal(m.getItem('zlatura.home'), null);
});

test('arrange and move: the person\'s order first, new panels after, gone ones dropped, hidden ones kept in the list', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(arrange(ids, { order: [], hidden: [] }).map((x) => x.id), ids);
  const r = arrange(ids, { order: ['c', 'zzz', 'a'], hidden: ['a'] });
  assert.deepEqual(r.map((x) => x.id), ['c', 'a', 'b', 'd']);
  assert.deepEqual(r.map((x) => x.shown), [true, false, true, true]);
  assert.deepEqual(move(r, 'b', -1), ['c', 'b', 'a', 'd']);
  assert.deepEqual(move(r, 'c', -1), ['c', 'a', 'b', 'd'], 'the first cannot go up');
  assert.deepEqual(move(r, 'd', 1), ['c', 'a', 'b', 'd'], 'the last cannot go down');
});

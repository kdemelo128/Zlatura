/* The Review queue's research item: one per brief that still has claims the broker can tick. Invented companies only. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewItems, reviewCount } from '../app/review.js';
import { newBrief, receive, tickClaim } from '../app/research.js';

const NOW = Date.UTC(2026, 5, 1);
const TEXT = 'Harbor Example Holdings LLC is a wholly owned subsidiary of Northwind Sample Group Inc. Registered agent: Example Agents Inc.';
const claim = (ref, over = {}) => ({ ref, section: 'S2', kind: 'subsidiary_of', subject: 'Harbor Example Holdings LLC', object: 'Northwind Sample Group Inc.', statement: 'Harbor is a subsidiary of Northwind', quote: 'Harbor Example Holdings LLC is a wholly owned subsidiary of Northwind Sample Group Inc.', document: 0, page: null, basis: 'stated', inferredFrom: null, confidence: 'high', ...over });
const brief = (claims, at = NOW) => {
  const b = newBrief({ name: 'Harbor Example Holdings LLC' }, [{ name: 'a.txt', kind: 'text' }], at);
  return receive(b, { claims, sections: [], notes: [], notChecked: [] }, [[TEXT]], at);
};

test('a brief with a found, stated, unticked claim is one Review item', () => {
  const b = brief([claim('c1')]);
  const g = reviewItems({ briefs: [b], now: NOW });
  assert.equal(g.length, 1);
  assert.equal(g[0].group, 'research');
  assert.equal(g[0].items.length, 1);
  assert.equal(g[0].items[0].kind, 'research');
  assert.equal(g[0].items[0].count, 1);
  assert.equal(reviewCount(g), 1);
});

test('one item per brief, however many claims wait', () => {
  const b = brief([claim('c1'), claim('c2', { kind: 'owns', subject: 'Northwind Sample Group Inc.', object: 'Harbor Example Holdings LLC', quote: 'Harbor Example Holdings LLC is a wholly owned subsidiary of Northwind Sample Group Inc.' })]);
  const g = reviewItems({ briefs: [b], now: NOW });
  assert.equal(g[0].items.length, 1);
  assert.equal(g[0].items[0].count, 2);
});

test('nothing waits once ticked, when refused, not found, or inferred', () => {
  const b = brief([claim('c1')]);
  assert.equal(reviewItems({ briefs: [tickClaim(b, b.claims[0].id, true, NOW)], now: NOW }).length, 0, 'ticked');
  assert.equal(reviewItems({ briefs: [brief([claim('c1', { inferredFrom: 'registered_agent' })])], now: NOW }).length, 0, 'refused');
  assert.equal(reviewItems({ briefs: [brief([claim('c1', { quote: 'Northwind Sample Group Inc. owns Harbor Example Holdings LLC outright' })])], now: NOW }).length, 0, 'quote not in the source');
  assert.equal(reviewItems({ briefs: [brief([claim('c1', { basis: 'inferred', inferredFrom: 'other' })])], now: NOW }).length, 0, 'inferred');
});

test('a brief still sending, failed or past its 365 days is not an item', () => {
  const b = brief([claim('c1')]);
  assert.equal(reviewItems({ briefs: [{ ...b, status: 'sending' }], now: NOW }).length, 0);
  assert.equal(reviewItems({ briefs: [{ ...b, status: 'failed' }], now: NOW }).length, 0);
  assert.equal(reviewItems({ briefs: [b], now: NOW + 366 * 86400000 }).length, 0);
  assert.equal(reviewItems({ briefs: [b], now: NOW + 364 * 86400000 }).length, 1);
});

test('garbage in the briefs list does not throw, and a stored "confirmed" is not trusted', () => {
  const b = brief([claim('c1', { quote: 'Northwind Sample Group Inc. owns Harbor Example Holdings LLC outright' })]);
  const forged = { ...b, claims: b.claims.map((c) => ({ ...c, status: 'confirmed', verified: true, ticked: false })) };
  assert.equal(reviewItems({ briefs: [null, 7, { status: 'ready' }, { status: 'ready', claims: 'x' }, forged], now: NOW }).length, 0);
});

test('research groups sort after deals and templates, and the sort is consistent', () => {
  const b = brief([claim('c1')]);
  const deal = { id: 'd1', name: 'Invented deal', figures: {}, ai: { extractions: [{ at: 1, files: ['x'], fields: [{ key: 'price', value: 5, doc: 'x', status: 'verified' }] }] } };
  const tpl = { id: 't1', name: 'Invented template', mapping: { cells: [{ sheet: 'S', cell: 'A1', field: 'price', confidence: 'low' }] } };
  const order = (list) => reviewItems({ deals: [deal], templates: [tpl], briefs: [b], now: NOW }).map((g) => g.group);
  assert.deepEqual(order(), ['deal', 'template', 'research']);
});

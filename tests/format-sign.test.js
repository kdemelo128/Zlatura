// A figure that shows as zero shows no sign (no "-$0", no "+0.0%"). Display only.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};
const K = await import('../app/kit.js');
const { renderCompSheet } = await import('../app/exporters.js');
const { trendRate } = await import('../app/workbook.js');

test('money and counts that round to zero show no minus', () => {
  assert.equal(K.money0(-0.4), '$0');
  assert.equal(K.money0(-0.5), '$0');
  assert.equal(K.money2(-0.004), '$0.00');
  assert.equal(K.int(-0), '0');
  assert.equal(K.int(-0.4), '0');
});

test('pct, times and yrs that round to zero show no minus', () => {
  assert.equal(K.pct(-0.001), '0.00%');
  assert.equal(K.times(-0.001), '0.00x');
  assert.equal(K.yrs(-0.04), '0.0 yrs');
});

test('signed shows neither + nor - on a zero figure', () => {
  assert.equal(K.signed(-0.04), '0.0%');
  assert.equal(K.signed(0.04), '0.0%');
  assert.equal(K.signed(0.05), '+0.1%');
});

test('nonzero negatives keep their sign', () => {
  assert.equal(K.money0(-0.6), '-$1');
  assert.equal(K.money2(-0.005), '-$0.01');
  assert.equal(K.pct(-0.005), '-0.01%');
});

/** Just enough of a document for renderCompSheet. */
const fakeDoc = () => {
  const mk = (tag) => ({
    tag, className: '', textContent: '', children: [],
    appendChild(c) { this.children.push(c); return c; },
    get ownerDocument() { return fakeDoc.doc; },
  });
  fakeDoc.doc = { createElement: mk };
  return fakeDoc.doc;
};
const textOf = (n) => [n.textContent, ...n.children.map(textOf)].join('|');

test('comp sheet: zero figures carry no sign, negatives read "-$" never "$-"', () => {
  const doc = fakeDoc();
  const box = doc.createElement('div');
  const date = new Date(Date.UTC(2025, 1, 20));
  const sale = { name: '1 Test St', price: 1000000, bsf: 2000, cap: -0.001, date, flags: [] };
  const neg = { name: '2 Test St', price: -5000, bsf: 2000, date, flags: [] };
  const tiny = { name: '4 Test St', price: -0.4, bsf: 2000, date, flags: [] };
  const listing = { name: '3 Test St', price: 900000, bsf: 2000, dom: -0.4, status: 'Active', flags: [] };
  renderCompSheet(box, { sales: [sale, neg, tiny], market: [listing], today: new Date(Date.UTC(2025, 5, 1)) });
  const t = textOf(box);
  assert.ok(!/-0\.00%/.test(t), t);
  assert.ok(/\|0\.00%/.test(t), 'shows 0.00%');
  assert.ok(!/(^|\|)-0(\||$)/.test(t), 'no "-0" cell');
  assert.ok(t.includes('|-$5,000|'), 'negative price reads -$5,000');
  assert.ok(t.includes('|-$2.50|'), 'negative $/SF reads -$2.50');
  assert.ok(t.includes('|$0|') && t.includes('|$0.00|'), 'a price and $/SF that round to zero show no sign');
  assert.ok(!/-\$0/.test(t));
  assert.ok(!/\$-/.test(t), 'never "$-"');
});

test('workbook trend text: equal $/SF sales give no signed zero', () => {
  const sales = [0, 1, 2, 3, 4, 5].map((i) => ({ price: 1000000, bsf: 2000, date: new Date(Date.UTC(2024, i, 15)) }));
  const t = trendRate(sales);
  assert.ok(/says 0\.0% a year/.test(t.why), t.why);
  assert.ok(!/[+-]0\.0%/.test(t.why), t.why);
});

test('property: no signed zero, and the sign never changes the digits', () => {
  let s = 12345;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const zero = /^[-+−]\$?0(\.0+)?(%|x| yrs)?$/;
  const fns = [K.int, K.money0, K.money2, K.pct, K.signed, K.times, K.yrs];
  // exact edges first, so the half-skip below is exercised
  const edges = [0.5, 2.5, 0.005, 0.004].flatMap((x) => [x, -x]);
  for (let i = 0; i < 10000 + edges.length; i++) {
    const n = i < edges.length ? edges[i] : (rnd() < 0.5 ? -1 : 1) * 10 ** (rnd() * 12 - 6);
    for (const f of fns) {
      const out = f(n);
      assert.ok(!zero.test(out) && !/^\$-0/.test(out), `${f.name}(${n}) = ${out}`);
      // Math.round rounds halves up, so money0/int(-2.5) is "-$2" but (2.5) is "$3": a known,
      // separate asymmetry the owner left alone (see the changelog fragment)
      if ((f === K.money0 || f === K.int) && Math.abs(n) % 1 === 0.5) continue;
      assert.equal(out.replace(/^[-+]/, ''), f(Math.abs(n)).replace(/^[-+]/, ''), `${f.name}(${n})`);
    }
  }
  for (const f of fns) assert.ok(!zero.test(f(-0)), `${f.name}(-0)`);
});

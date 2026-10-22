// A figure that shows as zero shows no sign (no "-$0", no "+0.0%"). Display only.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};
const K = await import('../app/kit.js');
const { renderCompSheet } = await import('../app/exporters.js');

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

test('comp sheet shows no "-0.00%" for a cap of -0.001', () => {
  const doc = fakeDoc();
  const box = doc.createElement('div');
  const sale = { name: '1 Test St', price: 1000000, bsf: 2000, cap: -0.001, date: new Date(Date.UTC(2025, 1, 20)), flags: [] };
  renderCompSheet(box, { sales: [sale], market: [], today: new Date(Date.UTC(2025, 5, 1)) });
  const t = textOf(box);
  assert.ok(!/-0\.00%/.test(t), t);
  assert.ok(/\|0\.00%/.test(t), 'shows 0.00%');
});

test('property: no signed zero, and the sign never changes the digits', () => {
  let s = 12345;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const zero = /^[-+−]\$?0(\.0+)?(%|x| yrs)?$/;
  const fns = [K.int, K.money0, K.money2, K.pct, K.signed, K.times, K.yrs];
  for (let i = 0; i < 10000; i++) {
    const n = (rnd() < 0.5 ? -1 : 1) * 10 ** (rnd() * 12 - 6);
    for (const f of fns) {
      const out = f(n);
      assert.ok(!zero.test(out) && !/^\$-0/.test(out), `${f.name}(${n}) = ${out}`);
      assert.equal(out.replace(/^[-+]/, ''), f(Math.abs(n)).replace(/^[-+]/, ''), `${f.name}(${n})`);
    }
  }
  for (const f of fns) assert.ok(!zero.test(f(-0)), `${f.name}(-0)`);
});

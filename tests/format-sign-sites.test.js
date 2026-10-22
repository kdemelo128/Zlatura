// The one-off formatting sites (not kit.js) follow the same rule: a figure that prints as
// zero shows no sign. Display text only; every case reaches its site through an exported
// function. Invented figures.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};

/** Just enough of a document for glance.js: elements, text nodes, attributes, styles. */
const mk = (tag) => ({
  tag, className: '', textContent: '', children: [], style: {}, attrs: {},
  appendChild(c) { this.children.push(c); return c; },
  append(...cs) { this.children.push(...cs); },
  setAttribute(k, v) { this.attrs[k] = v; },
  addEventListener() {},
});
globalThis.document = {
  createElement: mk,
  createElementNS: (ns, tag) => mk(tag),
  getElementById: () => null,
  addEventListener() {},
  documentElement: { style: {} },
  querySelector: () => null,
  body: {},
  createTextNode: (t) => ({ tag: '#text', textContent: t, children: [] }),
};
const textOf = (n) => [n.textContent, ...n.children.map(textOf)].join('|');

const { renderKpis, renderTime } = await import('../app/glance.js');
const { buildFacts } = await import('../app/aifacts.js');
const { gapMoney, usd, usd2, signed } = await import('../app/t12ui.js');
const { usd: reviewUsd } = await import('../app/reviewui.js');
const { scnShow } = await import('../app/dealui.js');
const { importStatement, applyT12Fix, noiWithout } = await import('../app/t12.js');
const { readOm } = await import('../app/om.js');
const { evaluate } = await import('../app/engine/figures.js');
const { noiPrinted } = await import('./om-statement-fixtures.js');
const { statement, heads } = await import('./fixtures/t12-values-fixtures.js');

const day = 86400000;
const sale = (price, t) => ({ price, bsf: 1000, date: new Date(t), flags: [] });
const now = Date.now();

test('glance: an asking premium that prints 0.0% shows no sign, a real one keeps it', () => {
  const kpis = (askPrice) => {
    const box = mk('div');
    renderKpis(box, [sale(1000000, now - 30 * day)], [{ price: askPrice, bsf: 1000, status: 'Active', flags: [] }], null);
    return textOf(box);
  };
  assert.ok(/\|0\.0%\|/.test(kpis(999600)), kpis(999600));
  assert.ok(!/[+-]0\.0%/.test(kpis(999600)));
  assert.ok(!/[+-]0\.0%/.test(kpis(1000400)));
  assert.ok(/\|\+5\.0%\|/.test(kpis(1050000)));
  assert.ok(/\|-5\.0%\|/.test(kpis(950000)));
});

test('glance: a trend of less than a dollar a year reads without a sign', () => {
  const trend = (p2) => {
    const box = mk('div'); const lg = mk('div');
    renderTime(box, lg, [sale(1000000, Date.UTC(2024, 0, 1)), sale(p2, Date.UTC(2025, 0, 1))]);
    return textOf(lg);
  };
  assert.ok(/Trend \$0\/SF a year/.test(trend(999999.9)), trend(999999.9));
  assert.ok(/Trend \$0\/SF a year/.test(trend(1000000.1)), trend(1000000.1));
  assert.ok(/Trend \+\$50\/SF a year/.test(trend(1050000)));
  assert.ok(/Trend −\$50\/SF a year/.test(trend(950000)));
});

test('aifacts: money, percents and the comps premium print no sign on a zero', () => {
  const fields = [
    { key: 'a', label: 'A', kind: 'money' }, { key: 'b', label: 'B', kind: 'money2' },
    { key: 'c', label: 'C', kind: 'pct' }, { key: 'd', label: 'D', kind: 'int' },
  ];
  const facts = (figs, m = {}, comps = null) => Object.fromEntries(
    buildFacts({ deal: { figures: figs, sources: {} }, fields, m, comps }).map((f) => [f.label, f.value]));
  const f = facts({ a: -0.4, b: -0.004, c: -0.001, d: -0.4 },
    { cap: -0.001, vsMedian: -0.04 }, { n: 3, median: 100, medianCap: -0.001, capN: 1 });
  assert.equal(f.A, '$0');
  assert.equal(f.B, '$0.00');
  assert.equal(f.C, '0.00%');
  assert.equal(f.D, '0');
  assert.equal(f['Sale comps: median cap rate'], '0.00%');
  assert.equal(f['Asking $/SF against the comps’ median'], '0.0%');
  // and the nonzero ones keep theirs
  const g = facts({ a: -0.6, b: -0.005, c: -0.005, d: 5 }, { vsMedian: 2.5 }, { n: 3, median: 100 });
  assert.equal(g.A, '-$1');
  assert.equal(g.B, '-$0.01');
  assert.equal(g.C, '-0.01%');
  assert.equal(g['Asking $/SF against the comps’ median'], '+2.5%');
  assert.equal(facts({ c: 0.001 }).C, '0.00%');
});

test('t12ui: the NOI gap prints no sign when it is under a dollar', () => {
  assert.equal(gapMoney(-0.4), '$0');
  assert.equal(gapMoney(0.4), '$0');
  assert.equal(gapMoney(0), '$0');
  assert.equal(gapMoney(-1500), '−$1,500');
  assert.equal(gapMoney(1500), '+$1,500');
});

test('t12: the NOI-without-one-offs text prints no sign on a NOI under a dollar', () => {
  const fill = (n, v) => Array(n).fill(v);
  const rent = fill(12, 0);
  const repairs = fill(12, 0); repairs[3] = 0.4;
  const util = fill(12, 0); util[5] = 5000;
  const t = importStatement(statement(heads(2026, 1, 12), [['Base Rent', ...rent]], [['Repairs', ...repairs], ['Utilities', ...util]]), { file: 'invented.csv', sheet: 'CSV' });
  const id = t.lines.find((l) => l.label === 'Utilities').id;
  assert.equal(applyT12Fix(t, `oneoff.${id}.2026-06`, 'rec:no'), true);
  const w = noiWithout(t);
  assert.equal(w.noi, -0.4, 'the value itself is unchanged');
  assert.ok(w.text.startsWith('NOI without the one-offs you marked: $0 ('), w.text);
});

test('omstatement: a printed NOI under a dollar reads "$0" in the check and its fix', () => {
  const om = readOm(noiPrinted('($0.40)'), { asOf: '2026-10-14' });
  const c = om.statement.checks.find((x) => x.level === 'fail');
  assert.ok(c, 'a check fails');
  assert.ok(c.text.includes('NOI is printed as $0 ('), c.text);
  assert.ok(c.fixes[0].label.startsWith('Keep as printed: NOI $0,'), c.fixes[0].label);
  assert.ok(!/[−-]\$0\b/.test(c.text + c.fixes.map((x) => x.label).join()));
  const real = readOm(noiPrinted('($12,400)'), { asOf: '2026-10-14' }).statement.checks.find((x) => x.level === 'fail');
  assert.ok(real.text.includes('printed as −$12,400'), real.text);
});

test('engine figures: the negative-NOI check prints no sign on a NOI under a dollar', () => {
  const text = (noi) => evaluate({ noi, cap: 6.5 }, null, new Date()).checks.map((c) => c.text).join(' | ');
  assert.ok(text(-0.4).includes('The NOI is negative ($0), so'), text(-0.4));
  assert.ok(text(-12400).includes('The NOI is negative (-$12,400), so'), text(-12400));
  assert.ok(text(0).includes('The NOI is zero ($0), so'), text(0));
});

test('t12ui: usd, usd2 and signed print no sign on a figure under half a cent / dollar', () => {
  assert.equal(usd(-0.4), '$0');
  assert.equal(usd2(-0.004), '$0.00');
  assert.equal(signed(-0.4), '$0');
  assert.equal(signed(0.4), '$0');
  assert.equal(usd(-1500), '−$1,500');
  assert.equal(usd2(-1.5), '−$1.50');
  assert.equal(signed(-1500), '−$1,500');
  assert.equal(signed(1500), '+$1,500');
  assert.equal(usd(null), '—');
});

test('reviewui: the review queue dollar text has no "−$0"', () => {
  assert.equal(reviewUsd(-0.4), '$0');
  assert.equal(reviewUsd(-12400), '−$12,400');
  assert.equal(reviewUsd(12400), '$12,400');
  assert.equal(reviewUsd('n/a'), 'n/a');
});

test('dealui: a scenario change that prints as zero has no "+"', () => {
  assert.equal(scnShow('delta', 0.001), '0%');
  assert.equal(scnShow('delta', -0.001), '0%');
  assert.equal(scnShow('delta', 1.5), '+1.5%');
  assert.equal(scnShow('delta', -1.5), '-1.5%');
  assert.equal(scnShow('pct', 6.5), '6.5%');
});

test('aifacts: DSCR, equity multiple, term left and WALT print no signed zero', () => {
  const labels = (m, scenario, rrSum) => Object.fromEntries(
    buildFacts({ deal: { figures: {}, sources: {} }, fields: [], m, scenario, rrSum }).map((f) => [f.label, f.value]));
  const sc = { changed: ['x'], inputs: { price: 1, noi: 1, hold: 5, growth: 3, exitCap: 6.5 }, returns: { leveredMultiple: -0.001 } };
  const f = labels({ dscr: -0.001, termLeft: -0.04 }, sc, null);
  assert.equal(f.DSCR, '0.00x');
  assert.equal(f['Lease term remaining, years'], '0.0');
  assert.equal(f['Scenario: equity multiple'], '0.00x');
  const g = labels({ dscr: 1.256, termLeft: -2.5 }, { ...sc, returns: { leveredMultiple: -0.5 } }, null);
  assert.equal(g.DSCR, '1.26x');
  assert.equal(g['Lease term remaining, years'], '-2.5');
  assert.equal(g['Scenario: equity multiple'], '-0.50x');
});

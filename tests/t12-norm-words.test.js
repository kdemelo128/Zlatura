/* Underwriting PR U2: the words and order the T-12 tab shows for the normalised NOI (labels, chip, bridge list,
 * source label, reasons a figure is held or Use is refused). Pure helpers in app/t12.js, on the invented statement U
 * (tests/fixtures/t12-normalise-fixtures.js, worked by hand there). Each test fails on 4.7.37, which has none of them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uRows } from './fixtures/t12-normalise-fixtures.js';
import { dupRows } from './fixtures/t12-period-fixtures.js';
import { quarterHeadRows } from './fixtures/t12-values-fixtures.js';
import {
  importStatement, applyT12Fix, normalise, setMethod, setWindow, METHOD_WORDS, METHOD_CHOICES, chipText, methodPreview, heldWords, bridgeRows,
  residueWords, normSource, normRefusal,
} from '../app/t12.js';

const imp = (rows) => importStatement(rows, { file: 'invented.csv', sheet: 'CSV' });
const line = (t, label) => t.lines.find((l) => l.label === label);
const U = () => { const t = imp(uRows()); setWindow(t, 'active'); return t; };
/** Example 3 of the fixture: income annualised, Repairs and Taxes typical month, Legal excluded. */
const bridgeU = () => {
  const t = U();
  for (const [l, m] of [['Base Rent', 'annualise'], ['Parking', 'annualise'], ['Storage', 'annualise'], ['Repairs', 'runRate'], ['Real Estate Taxes', 'runRate'], ['Legal', 'exclude']]) setMethod(t, line(t, l).id, m);
  return t;
};

test('the typical-month method is never worded "run rate" on screen', () => {
  const words = [...Object.values(METHOD_WORDS), ...METHOD_CHOICES.map((m) => m.label), ...Object.keys(METHOD_WORDS).map(chipText)];
  assert.ok(words.every((w) => !/run.?rate/i.test(w)), words.join(' | '));
  assert.equal(METHOD_WORDS.runRate, 'typical month × 12');
  assert.equal(chipText('runRate'), 'Counts: typical month × 12');
  assert.equal(chipText('reported'), 'Counts: as reported');
  assert.equal(chipText('annualise'), 'Counts: annualised');
  assert.equal(chipText('exclude'), 'Counts: excluded');
  assert.equal(chipText(undefined), 'Counts: as reported');
  assert.deepEqual(METHOD_CHOICES.map((m) => m.id), ['reported', 'annualise', 'runRate', 'exclude']);
  // the bridge rows never say it either
  const t = bridgeU();
  assert.ok(!bridgeRows(t, normalise(t)).some((r) => /run.?rate/i.test(`${r.label} ${r.sub}`)));
});

test('the bridge is a list in order: as reported, each step as normalise() gives them, then the normalised NOI', () => {
  const t = bridgeU();
  const rows = bridgeRows(t, normalise(t));
  assert.deepEqual(rows.map((r) => [r.key, r.label, r.amount]), [
    ['reported', 'NOI as reported (12 months)', 56290.02],
    ['annualise.income', 'Annualised income lines (3)', 51428.59],
    ['runRate.expense', 'Typical month × 12 expense lines (2)', -2350],
    ['exclude.expense', 'Excluded expense lines (1)', 1200],
    ['normalised', 'Normalised NOI (a year)', 106568.61],
  ]);
  assert.equal(rows[1].sub, 'Base Rent, Parking, Storage');
  assert.equal(rows[3].sub, 'Legal');
  // the steps add up to the end of the list, to the cent
  const sum = Math.round(rows.slice(0, -1).reduce((s, r) => s + r.amount * 100, 0));
  assert.equal(sum, Math.round(rows[4].amount * 100));
});

test('with no method chosen the list is the reported NOI twice; a month marked not recurring is the first step', () => {
  const t = U();
  const rows = bridgeRows(t, normalise(t));
  assert.deepEqual(rows.map((r) => r.key), ['reported', 'normalised']);
  assert.equal(rows[0].amount, rows[1].amount);
  assert.equal(applyT12Fix(t, `oneoff.${line(t, 'Repairs').id}.2026-09`, 'rec:no'), true);
  setMethod(t, line(t, 'Legal').id, 'exclude');
  const m = bridgeRows(t, normalise(t));
  assert.deepEqual(m.map((r) => [r.key, r.label, r.amount]).slice(1, 3), [['oneoff.expense', 'Not recurring, taken out of expense lines (1)', 3000], ['exclude.expense', 'Excluded expense lines (1)', 1200]]);
});

test('held: the list has no normalised number, and says why in words', () => {
  const t = imp(uRows()); // N not yet answered
  setMethod(t, line(t, 'Base Rent').id, 'annualise');
  const r = normalise(t);
  assert.equal(r.held, 'annualise');
  const rows = bridgeRows(t, r);
  assert.equal(rows.at(-1).amount, null);
  assert.match(heldWords(t, r), /5 of its 12 months have no activity on any line; say whether to annualise over the 7 months with activity or all 12 columns in Data QC first/);
  const d = imp(dupRows());
  assert.match(heldWords(d, normalise(d)), /^a period check holds the totals \(/);
  const q = imp(quarterHeadRows());
  setMethod(q, q.lines[0].id, 'annualise');
  assert.match(heldWords(q, normalise(q)), /no month columns/);
  assert.equal(heldWords(U(), normalise(U())), '');
});

test('the source label of a normalised figure', () => {
  const t = bridgeU();
  assert.equal(normSource(normalise(t)), 'T-12, normalised: 3 lines annualised, 2 lines typical month × 12, 1 excluded, N = 7');
  const u = U();
  for (const l of ['Repairs', 'Real Estate Taxes', 'Legal']) setMethod(u, line(u, l).id, l === 'Legal' ? 'exclude' : 'runRate');
  assert.equal(normSource(normalise(u)), 'T-12, normalised: 2 lines typical month × 12, 1 excluded, N = 7');
  const one = U();
  setMethod(one, line(one, 'Legal').id, 'exclude');
  assert.equal(normSource(normalise(one)), 'T-12, normalised: 1 excluded, N = 7');
});

test('what each method would give one line, held states in words not numbers', () => {
  const t = U();
  const id = line(t, 'Repairs').id;
  assert.equal(methodPreview(t, id, 'reported').amount, 5010);
  assert.equal(methodPreview(t, id, 'annualise').amount, 8588.57);
  assert.equal(methodPreview(t, id, 'runRate').amount, 4860);
  assert.equal(methodPreview(t, id, 'exclude').amount, 0);
  assert.equal(t.lines.some((l) => 'method' in l), false, 'nothing is written');
  const w = imp(uRows()); // N not answered: annualise waits, the typical month does not
  const p = methodPreview(w, line(w, 'Repairs').id, 'annualise');
  assert.equal(p.amount, null); assert.equal(p.held, 'annualise');
  assert.equal(methodPreview(w, line(w, 'Repairs').id, 'runRate').amount, 4860);
  // another line's method does not hold this line's preview
  setMethod(w, line(w, 'Legal').id, 'annualise');
  assert.equal(methodPreview(w, line(w, 'Repairs').id, 'exclude').amount, 0);
});

test('Use normalised figures is refused, with the reason, when held, open, or nothing is chosen', () => {
  const t = bridgeU();
  assert.equal(normRefusal(t, normalise(t)), '');
  const w = imp(uRows());
  setMethod(w, line(w, 'Base Rent').id, 'annualise');
  assert.match(normRefusal(w, normalise(w)), /^Held: 5 of its 12 months/);
  const d = imp(dupRows());
  assert.match(normRefusal(d, normalise(d)), /^Held: a period check holds the totals/);
  const o = bridgeU();
  delete line(o, 'Legal').category;
  assert.match(normRefusal(o, normalise(o)), /^File the 1 line still waiting in Review first/);
  assert.match(normRefusal(U(), normalise(U())), /Every line counts as reported/);
});

test('the rounding Note names the cent', () => {
  const t = bridgeU();
  assert.match(residueWords(normalise(t)), /income −\$0\.01/);
  assert.equal(residueWords(normalise(U())), '');
});

/* Bug 1b: the OM's stated in-place rent reaches the rent roll's cross-check (and nothing else), and the rent roll
 * offers Building SF, Units and Occupancy for empty boxes (a tap, never a fill). All invented. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rentRoll } from '../app/om.js';
import { omRollRecord, withStatedRent, rollOffers, withoutRollFigures, ROLL_TOOL } from '../app/rentroll.js';
import { fromOmRows, rentRollSummary } from '../app/lease.js';
import { cases } from './rr-fixtures.js';

const roll = rentRoll(cases.repeated);               // five units, $224,000, 7,500 SF, Total row agrees
const field = (value, extra = {}) => ({ value, page: 1, line: `Base Rent $${value.toLocaleString('en-US')}`, confidence: 'high', ...extra });
const rentCheck = (qc) => qc.checks.find((c) => c.kind === 'rent');

test('the stated in-place rent is checked against the rent roll: agreeing', () => {
  const { qc } = omRollRecord({ rentRoll: roll, fields: { rent_inplace: field(224000) } }, { figures: {}, asOf: '2026-10-17' });
  const c = rentCheck(qc);
  assert.ok(c, 'a rent check');
  assert.equal(c.level, 'pass');
  assert.match(c.text, /\$224,000 of in-place rent agrees with the rent roll/);
  assert.deepEqual(c.stated, { page: 1, line: 'Base Rent $224,000' });
});

test('the stated in-place rent is checked against the rent roll: disagreeing', () => {
  const { qc } = omRollRecord({ rentRoll: roll, fields: { rent_inplace: field(300000) } }, { figures: {}, asOf: '2026-10-17' });
  const c = rentCheck(qc);
  assert.equal(c.level, 'warn');
  assert.match(c.text, /The OM states \$300,000 of in-place rent; the rent roll's leases add up to \$224,000/);
});

test('with no stated rent there is no rent check, as before', () => {
  const { qc } = omRollRecord({ rentRoll: roll, fields: {} }, { figures: {}, asOf: '2026-10-17' });
  assert.equal(rentCheck(qc), undefined);
});

test('it is not a figure: the figures and sources handed in are not changed, and nothing of it is returned to store', () => {
  const figures = { bsf: 7500 }; const sources = { bsf: { page: 1 } };
  const before = JSON.stringify([figures, sources]);
  const r = omRollRecord({ rentRoll: roll, fields: { rent_inplace: field(224000) } }, { figures, sources, asOf: '2026-10-17' });
  assert.equal(JSON.stringify([figures, sources]), before);
  assert.deepEqual(Object.keys(r).sort(), ['qc', 'rows']);
  assert.ok(!('rent_inplace' in figures));
  assert.ok(!JSON.stringify(r.qc).includes('"rent_inplace"'), 'the QC record does not carry it as a figure either');
});

test('a stated rent whose statement check failed, or that is not a positive number, is left out; a figure passed in wins', () => {
  const om = (f) => ({ rentRoll: roll, fields: { rent_inplace: f } });
  assert.deepEqual(withStatedRent(om(field(224000, { check: 'fail' })), {}, {}).figures, {});
  assert.deepEqual(withStatedRent(om(field(0)), {}, {}).figures, {});
  assert.deepEqual(withStatedRent(om(field(-5)), {}, {}).figures, {});
  assert.deepEqual(withStatedRent({ rentRoll: roll }, {}, {}).figures, {});
  assert.equal(withStatedRent(om(field(224000)), { rent_inplace: 100000 }, {}).figures.rent_inplace, 100000);
  assert.equal(withStatedRent(om(field(224000, { check: 'pass' })), {}, {}).figures.rent_inplace, 224000);
});

/* ---------------------------------------------------------- the offers */

const sumOf = (rows) => rentRollSummary(fromOmRows(rows, { asOf: '2026-10-17' }), '2026-10-17');
// the rows as a deal stores them (dates as ISO text), as the app builds its rent roll from
const sum = sumOf(omRollRecord({ rentRoll: roll }, { figures: {}, asOf: '2026-10-17' }).rows);

test('empty boxes are offered the rent roll’s SF and units, with the words for each', () => {
  const o = rollOffers({}, sum);
  assert.deepEqual(o.map((x) => x.key), ['bsf', 'units']);
  assert.equal(o[0].value, 7500);
  assert.match(o[0].text, /5 units add up to 7,500 SF, as listed/);
  assert.equal(o[1].value, 5);
});

test('occupancy is never offered: the engine already shows the rent roll’s, labelled, and a copy would be checked against itself', () => {
  assert.ok(!rollOffers({}, sum).some((x) => x.key === 'occ'));
  assert.ok(!rollOffers({ bsf: 10000 }, sum).some((x) => x.key === 'occ'));
});

test('a figure that already has a value is never offered over', () => {
  assert.deepEqual(rollOffers({ bsf: 9000, units: 6, occ: 80 }, sum), []);
  assert.deepEqual(rollOffers({ bsf: 10000 }, sum).map((x) => x.key), ['units']);
  assert.deepEqual(rollOffers({ units: 5 }, sum).map((x) => x.key), ['bsf']);
});

test('a figure taken from the rent roll is called that, never “typed”', async () => {
  const { sourceOf } = await import('../app/dealfields.js');
  const { sourceLabel } = await import('../app/aifacts.js');
  const deal = { figures: { bsf: 7500 }, sources: { bsf: { hand: true, tool: ROLL_TOOL } } };
  assert.equal(sourceOf(deal, 'bsf'), 'taken from the rent roll by the broker');
  assert.equal(sourceLabel({ hand: true, tool: ROLL_TOOL }), 'taken from the rent roll by the broker');
  assert.equal(sourceLabel({ hand: true, tool: 'Cap rate' }), 'typed (from the Cap rate tool)');   // another tool is labelled as before
  assert.equal(sourceOf({ figures: { bsf: 1 }, sources: { bsf: { hand: true } } }, 'bsf'), 'typed by the broker');
});

test('no offers without a rent roll', () => {
  assert.deepEqual(rollOffers({}, null), []);
  assert.deepEqual(rollOffers({}, sumOf([])), []);
});

test('offering is pure: it fills nothing', () => {
  const f = {}; rollOffers(f, sum);
  assert.deepEqual(f, {});
});

test('a cross-check on figures taken from the rent roll is left out (it would check the roll against itself)', () => {
  const issues = [{ id: 'sf', keys: ['bsf'] }, { id: 'occ', keys: ['occ'] }, { id: 'gpr', keys: ['gpr'] }, { id: 'x' }];
  const sources = { bsf: { hand: true, tool: ROLL_TOOL }, occ: { hand: true }, gpr: { page: 2 } };
  assert.deepEqual(withoutRollFigures(issues, sources).map((i) => i.id), ['occ', 'gpr', 'x']);
});

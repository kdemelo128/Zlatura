/* The credit record: rating scales and the checks on the Credit card (invented parties only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readRating, ratingGap, ratingLine, creditChecks, newCredit, clip } from '../app/credit.js';

const TODAY = '2026-10-29';
const rating = (o) => ({ id: 'r', of: 'tenant', agency: 'sp', agencyName: '', rating: 'BBB', outlook: '', asOf: '2026-09-01', source: 'typed from a report', typedOn: TODAY, ...o });
const rec = (o = {}) => ({ ...newCredit(), ...o });
const ids = (c, ctx = {}) => creditChecks(c, { today: TODAY, ...ctx }).map((k) => k.id);

test('investment grade cut-off: BBB- is in, BB+ is out; Baa3 is in, Ba1 is out', () => {
  assert.equal(readRating('sp', 'BBB-').investmentGrade, true);
  assert.equal(readRating('sp', 'BB+').investmentGrade, false);
  assert.equal(readRating('fitch', 'BBB-').investmentGrade, true);
  assert.equal(readRating('moodys', 'Baa3').investmentGrade, true);
  assert.equal(readRating('moodys', 'Ba1').investmentGrade, false);
  assert.equal(readRating('sp', 'AAA').investmentGrade, true);
  assert.equal(readRating('sp', 'D').investmentGrade, false);
  assert.equal(readRating('sp', 'BBB-').note, 'Investment grade on the S&P scale, as typed');
  assert.equal(readRating('moodys', 'Ba1').note, 'Below investment grade on the Moody’s scale, as typed');
});

test('capitals are evened out only for an exact match; anything else is kept as typed with no label', () => {
  assert.equal(readRating('sp', ' bbb- ').rating, 'BBB-');
  assert.equal(readRating('moodys', 'baa3').rating, 'Baa3');
  for (const [a, t] of [['sp', 'Baa3'], ['moodys', 'BBB-'], ['sp', 'BBB -'], ['sp', 'bbb plus'], ['sp', '']]) {
    const r = readRating(a, t);
    assert.equal(r.rating, t.trim());
    assert.equal(r.investmentGrade, null);
    assert.match(r.note, /^Not a rating on the (S&P|Moody’s) scale; kept as typed, with no investment-grade label\.$/);
  }
  const other = readRating('other', 'Investment-ish');
  assert.equal(other.rating, 'Investment-ish');
  assert.equal(other.investmentGrade, null);
  assert.equal(other.note, '');
});

test('a rating needs an agency, a rating, a real as-of date and a source', () => {
  assert.equal(ratingGap(rating()), '');
  for (const bad of [{ agency: '' }, { rating: ' ' }, { asOf: '' }, { asOf: '10/01/2026' }, { source: '  ' }]) assert.ok(ratingGap(rating(bad)), JSON.stringify(bad));
});

test('the line under a rating carries the attribution, and a parent-only rating raises the obligor check', () => {
  const c = rec({ leaseEntity: 'Example Cafe LLC', ratings: [rating({ rating: 'BBB-', outlook: 'stable' })] });
  assert.equal(ratingLine(c, c.ratings[0]), 'S&P BBB-, stable, for Example Cafe LLC (the tenant on the lease). As of Sep 1, 2026, from: typed from a report. Typed by the broker on Oct 29, 2026; not verified by Zlatura.');
});

test('obligor: fires when only the parent is rated, not when the tenant or a guarantor with a guaranty is', () => {
  const parent = rec({ parent: 'Example Parent Inc', ratings: [rating({ of: 'parent' })] });
  assert.deepEqual(ids(parent), ['obligor']);
  assert.match(creditChecks(parent, { today: TODAY })[0].text, /^The only rating is for Example Parent Inc\. Neither the tenant on the lease nor the guarantor is rated, so the rating does not stand behind this rent\.$/);
  assert.deepEqual(ids(rec({ ratings: [rating({ of: 'tenant' })] })), []);
  for (const scope of ['full', 'limited']) assert.deepEqual(ids(rec({ guarantor: { name: 'G', scope, limit: 'x', endsOn: null }, ratings: [rating({ of: 'guarantor' })] })), [], scope);
  for (const scope of ['none', null]) assert.deepEqual(ids(rec({ guarantor: { name: 'G', scope, limit: '', endsOn: null }, ratings: [rating({ of: 'guarantor' })] })), ['obligor'], String(scope));
  assert.deepEqual(ids(rec()), [], 'no ratings: nothing to say');
});

test('guaranty-ends: before the lease end raises it; the same day does not', () => {
  const g = (endsOn) => rec({ guarantor: { name: 'G', scope: 'full', limit: '', endsOn } });
  assert.deepEqual(ids(g('2028-06-30'), { lease: { leaseEnd: '2028-12-31' } }), ['guaranty-ends']);
  assert.deepEqual(ids(g('2028-12-31'), { lease: { leaseEnd: '2028-12-31' } }), []);
  assert.deepEqual(ids(g('2029-01-01'), { lease: { leaseEnd: '2028-12-31' } }), []);
  assert.deepEqual(ids(g('2028-06-30'), {}), [], 'no linked lease, no comparison');
});

test('limit-blank: a limited guaranty with no limit written down', () => {
  assert.deepEqual(ids(rec({ guarantor: { name: 'G', scope: 'limited', limit: '  ', endsOn: null } })), ['limit-blank']);
  assert.deepEqual(ids(rec({ guarantor: { name: 'G', scope: 'limited', limit: '12 months', endsOn: null } })), []);
  assert.deepEqual(ids(rec({ guarantor: { name: 'G', scope: 'full', limit: '', endsOn: null } })), []);
});

test('stale: a rating exactly 12 months old is not stale; a day older is', () => {
  const at = (asOf) => ids(rec({ ratings: [rating({ asOf })] }));
  assert.deepEqual(at('2025-10-29'), []);
  assert.deepEqual(at('2025-10-28'), ['stale']);
  assert.deepEqual(at('2026-09-01'), []);
  assert.match(creditChecks(rec({ ratings: [rating({ asOf: '2024-01-15' })] }), { today: TODAY })[0].text, /^The S&P rating is as of Jan 15, 2024, more than 12 months ago\. Check it is current\.$/);
});

test('om-differs: after trimming and ignoring case; blank on either side says nothing', () => {
  const g = (name) => rec({ guarantor: { name, scope: 'full', limit: '', endsOn: null } });
  assert.deepEqual(ids(g('Example Holdings'), { figures: { guarantor: '  example holdings ' } }), []);
  assert.deepEqual(ids(g('Example Holdings'), { figures: { guarantor: 'Other Corp' } }), ['om-differs']);
  assert.equal(creditChecks(g('Example Holdings'), { today: TODAY, figures: { guarantor: 'Other Corp' } })[0].text, 'The OM names the guarantor “Other Corp”; this record says “Example Holdings”.');
  assert.deepEqual(ids(g(''), { figures: { guarantor: 'Other Corp' } }), []);
  assert.deepEqual(ids(g('Example Holdings'), { figures: {} }), []);
});

test('rent-sales: rent as a share of typed sales; blank, zero or no linked lease gives no line, never 0%', () => {
  const lease = { id: 'l1', unit: '1', periods: [{ start: '2026-01-01', end: '2030-12-31', rate: 10000, unit: 'month', source: 'documented' }] };
  const withSales = (annual) => rec({ leaseId: 'l1', sales: annual === undefined ? null : { annual, year: '2025', source: '' } });
  const out = creditChecks(withSales(1200000), { today: TODAY, lease });
  assert.deepEqual(out.map((k) => k.id), ['rent-sales']);
  assert.equal(out[0].text, 'Rent is 10% of the store sales typed (2025).');
  for (const a of [undefined, null, 0]) assert.deepEqual(ids(withSales(a), { lease }), [], String(a));
  assert.deepEqual(ids(withSales(1200000), {}), []);
});

test('go-dark: only a yes', () => {
  assert.deepEqual(ids(rec({ goDark: { state: 'yes', note: '' } })), ['go-dark']);
  assert.deepEqual(ids(rec({ goDark: { state: 'no', note: '' } })), []);
  assert.deepEqual(ids(rec()), []);
});

test('text is limited: 200 characters, 500 for a source or a limit', () => {
  assert.equal(clip('x'.repeat(300)).length, 200);
  assert.equal(clip('x'.repeat(900), 500).length, 500);
  assert.equal(clip(null), '');
});

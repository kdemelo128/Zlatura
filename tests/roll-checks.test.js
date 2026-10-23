import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../app/rentroll.js';
import { analyze } from '../app/deal.js';
import * as C from '../app/engine/conventions.js';
import { analysisInput } from '../app/impact.js';
/* Rent roll checks K20-K33 (underwriting U5). Every roll here is invented; figures are worked by hand in the comments. */
const AS_OF = '2026-10-10'; const TODAY = new Date('2026-10-10T12:00:00Z');
const per = (rate, unit = 'year', start = '2022-01-01', end = '2031-12-31') => [{ start, end, rate, unit, source: 'documented' }];
const lease = (id, o) => ({ id, unit: id, tenant: `Tenant ${id}`, sf: 1000, leaseStart: '2022-01-01', leaseEnd: '2031-12-31', periods: per(30000), abatements: [], custom: {}, ...o });
const run = (leases, figures = {}) => analyze(analysisInput({ figures: { price: 1e6, noi: 60000, ...figures }, rr: { settings: { asOf: AS_OF }, leases } }), null, TODAY);
const find = (m, re) => m.checks.filter((c) => re.test(c.text));
test('B11/C08: a blank rent stays blank, raises K21 once; a $0 rent does not', () => {
  const m = run([lease('101'), lease('102', { periods: [] }), lease('103', { periods: per(0) })]);
  const k = find(m, /no rent entered/);
  assert.equal(k.length, 1); assert.equal(k[0].level, 'warn'); assert.match(k[0].text, /102 \(Tenant 102\)/); assert.doesNotMatch(k[0].text, /103/);
  assert.equal(R.rollFacts({ settings: { asOf: AS_OF }, leases: [lease('102', { periods: [] })] })[0].annual, null);
});
test('C10: an annual rent typed in the monthly box raises K33; the same rent a year does not; nothing changes', () => {
  const typed = run([lease('101', { sf: 2000, periods: per(60000, 'month') })]);
  const right = run([lease('101', { sf: 2000, periods: per(60000, 'year') })]);
  assert.equal(find(typed, /median rent is \$360\.00/).length, 1); assert.equal(find(right, /median rent/).length, 0);
  assert.equal(typed.leases.rent, 720000); // in-place rent kept as entered
});
test('K33 band edges and multifamily band', () => {
  assert.equal(find(run([lease('101', { periods: per(200000) })]), /median rent/).length, 0); // $200.00 exactly
  assert.equal(find(run([lease('101', { periods: per(200010) })]), /median rent/).length, 1);
  assert.equal(find(run([lease('101', { periods: per(100000) })], { ptype: 'Multifamily' }), /median rent/).length, 1);
  assert.equal(find(run([lease('101', { periods: per(100000) })], { ptype: 'Retail' }), /median rent/).length, 0);
});
test('C12: duplicate unit IDs flagged once', () => {
  const m = run([lease('101'), lease('101 ', { unit: '101 ' }), lease('x', { unit: '101' }), lease('102'), lease('b1', { unit: '' }), lease('b2', { unit: '' })]);
  const k = find(m, /more than once/); assert.equal(k.length, 1); assert.match(k[0].text, /lists a unit more than once: 101 \(3 times\)\. /); assert.doesNotMatch(k[0].text, /102/); // the two blank units are not one unit listed twice
});
test('K24/K25/K20/K22 and same lease', () => {
  const m = run([lease('a', { leaseEnd: '2026-03-31', periods: per(30000, 'year', '2022-01-01', '2026-03-31') }), lease('b', { leaseEnd: AS_OF }), lease('c', { leaseEnd: '2026-03-31', mtm: true }),
    lease('d', { periods: per(30000, 'year', '2027-01-01') }), lease('e', { sf: null }), lease('f', { leaseStart: null }), lease('g', { tenant: 'Acme' }), lease('h', { tenant: 'Acme' })]);
  assert.match(find(m, /ended before/)[0].text, /^1 lease .*: a \(Tenant a\)\./);
  assert.match(find(m, /paying rent after/)[0].text, /d \(Tenant d\)/);
  assert.match(find(m, /no SF/)[0].text, /e \(Tenant e\)/);
  assert.match(find(m, /no start date/)[0].text, /f \(Tenant f\)/);
  assert.equal(find(m, /suites ending on the same day/).length, 1);
});
test('K33 band is a setting; bad saved values are ignored', () => {
  C.setConventions({ 'rr.psf.high': 25 }); assert.equal(find(run([lease('101')]), /median rent/).length, 1);
  C.setConventions({ 'rr.psf.high': '200', 'rr.psf.low': 300 }); assert.equal(C.conv('rr.psf.high'), 25); assert.equal(C.conv('rr.psf.low'), 3);
  C.setConventions({ 'rr.psf.high': 200 });
});
test('K33 multifamily band is its own pair, and each pair stays in order or reverts', () => {
  C.setConventions({ 'rr.psf.mfHigh': 2 }); // below the default low of 3: the pair reverts
  assert.equal(C.conv('rr.psf.mfHigh'), 80); assert.equal(C.conv('rr.psf.mfLow'), 3);
  C.setConventions({ 'rr.psf.mfHigh': 20 }); // 0 a SF a year is then over the multifamily note level
  assert.equal(find(run([lease('101')], { ptype: 'Multifamily' }), /median rent/).length, 1);
  assert.equal(find(run([lease('101')], { ptype: 'Retail' }), /median rent/).length, 0);
  C.setConventions({ 'rr.psf.mfHigh': 80 });
  assert.equal(C.conv('rr.psf.high'), 200);
});
test('no rent roll of its own: no roll facts, so no roll checks', () => {
  assert.equal('rollFacts' in analysisInput({ figures: { price: 1e6 }, rentRoll: [{ sf: 1000, annual: 1, end: '2030-01-01T00:00:00.000Z' }] }), false);
  assert.equal(find(analyze(analysisInput({ figures: { price: 1e6 }, rentRoll: [] }), null, TODAY), /rent roll/).filter((c) => /no SF|no rent entered|no start/.test(c.text)).length, 0);
});
test('K33 low edge and even-count median; K24 as-of source; same unit twice is K27 not same lease', () => {
  assert.equal(find(run([lease('101', { periods: per(3000) })]), /median rent/).length, 0);
  assert.equal(find(run([lease('101', { periods: per(2990) })]), /median rent/).length, 1);
  assert.match(find(run([lease('a', { periods: per(10000) }), lease('b', { periods: per(400000) })]), /median rent/)[0].text, /\$205\.00/);
  const m = analyze(analysisInput({ figures: { price: 1e6 }, rr: { settings: { asOf: '2026-06-30' }, leases: [lease('a', { leaseEnd: '2026-08-31' })] } }), null, TODAY);
  assert.equal(find(m, /ended before/).length, 0);
  const u = run([lease('101', { tenant: 'Acme' }), lease('y', { unit: '101', tenant: 'Acme' })]);
  assert.equal(find(u, /same day/).length, 0); assert.equal(find(u, /more than once/).length, 1);
  assert.equal(find(run([lease('a', { tenant: 'Acme' }), lease('b', { tenant: 'Acme', leaseEnd: '2030-12-31' })]), /same day/).length, 0);
  assert.equal(find(run([lease('a', { periods: per(30000, 'year', AS_OF) })]), /paying rent after/).length, 0);
  assert.equal(find(run([lease('a', { status: 'Holdover', leaseEnd: '2026-03-31' })]), /ended before/).length, 0);
});
/* K37 / U7: an other-income line worded as a recovery beside leases that already recover expenses (R1-R5). Invented roll:
 * Suite 100 (5,000 SF) pays 50 % of a $100,000 pool = $50,000 a year; Suite 200 is gross; the roll's other income adds its own line. */
import { project } from '../app/lease.js';
const rrWith = (oi, rec = { method: 'prorata', share: 50 }, over = {}) => ({ settings: { asOf: AS_OF, years: 3, opex: 100000, expenseGrowth: 0, buildingSf: 10000, otherIncome: oi },
  leases: [lease('100', { sf: 5000, recovery: rec, ...over }), lease('200', { sf: 5000, recovery: { method: 'none' } })] });
// the control: the same roll with the firing combination, so a "does not warn" case also proves the rule exists
const control = () => assert.equal(twice(rrWith([{ name: 'CAM reimbursements', annual: 50000 }])).length, 1, 'the control roll warns');
const twice = (rr) => find(analyze(analysisInput({ figures: { price: 1e6, noi: 60000 }, rr }), null, TODAY), /may count them twice/);
test('R1: "CAM reimbursements" as other income beside a pro-rata lease warns once, and the EGI really holds both', () => {
  const rr = rrWith([{ name: 'CAM reimbursements', annual: 50000 }]);
  const y = project(rr).annual[0]; assert.equal(Math.round(y.recoveries), 50000); assert.equal(Math.round(y.other), 50000);
  const k = twice(rr);
  assert.equal(k.length, 1); assert.equal(k[0].level, 'warn'); assert.match(k[0].text, /“CAM reimbursements” \(\$50,000\)/); assert.match(k[0].text, /1 lease already recovers/);
  assert.equal(R.rollFacts(rr)[0].recovery, 'prorata'); assert.equal(R.rollFacts(rr)[1].recovery, 'none');
});
test('R2: other income that is not worded as a recovery ("Parking") does not warn', () => { control(); assert.equal(twice(rrWith([{ name: 'Parking', annual: 50000 }])).length, 0); });
test('R3: "CAM" other income with every lease on none does not warn (billed charges modelled this way)', () => {
  control();
  const rr = rrWith([{ name: 'CAM reimbursements', annual: 50000 }], { method: 'none' }); assert.equal(twice(rr).length, 0);
  assert.equal(twice({ ...rr, leases: rr.leases.map((L) => ({ ...L, recovery: undefined })) }).length, 0); // no recovery set at all
});
test('R4: the only lease with a recovery method is vacant: no warning', () => { control(); assert.equal(twice(rrWith([{ name: 'CAM reimbursements', annual: 50000 }], undefined, { vacant: true, tenant: '' })).length, 0); });
test('R5: "CAM" other income at $0 or blank does not warn; nothing is counted', () => {
  control();
  for (const annual of [0, null, undefined, '']) assert.equal(twice(rrWith([{ name: 'CAM reimbursements', annual }])).length, 0, String(annual));
});
test('U7: the warning changes no figure', () => {
  const a = rrWith([{ name: 'CAM reimbursements', annual: 50000 }]); const b = rrWith([{ name: 'Parking', annual: 50000 }]);
  assert.deepEqual(project(a).annual.map((y) => y.noi), project(b).annual.map((y) => y.noi));
});

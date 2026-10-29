/* OM red flags 6.3.5, 6.3.7, 6.3.8 (T-12 and rent roll side): checks and questions only, never a changed figure.
 * Invented deals. A missing line is never read as $0; with no evidence a rule stays silent. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../app/deal.js';
import { analysisInput } from '../app/impact.js';
import { importStatement } from '../app/t12.js';
import { rollFacts } from '../app/rentroll.js';
import { setConventions, conventionValues } from '../app/engine/conventions.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m) => `${m} 2025`);
const BASE = [['Base Rent', 60000], ['Real Estate Taxes', 9000], ['Insurance', 2000], ['Repairs & Maintenance', 4000], ['Utilities', 3000]];
const stmt = (extra = [], base = BASE) => importStatement([{ r: 0, cells: ['Line', ...MONTHS, 'Total'] }, ...[...base, ...extra].map(([n, v], i) => ({ r: i + 1, cells: [n, ...Array(12).fill(v), v * 12] }))], { file: 'invented.xlsx' });
const lease = (id, unit, tenant, sf, extra = {}) => ({ id, unit, tenant, sf, vacant: false, mtm: false, leaseStart: '2024-01-01', leaseEnd: '2030-12-31', periods: [{ start: '2024-01-01', end: '2030-12-31', rate: 30, unit: 'psf_year', source: 'documented' }], abatements: [], custom: {}, ...extra });
const roll = (leases) => ({ settings: { asOf: '2026-06-30', years: 5, opex: 100000, expenseGrowth: 0, buildingSf: 10000 }, leases });
const FULL = () => roll([lease('a', '100', 'Example Dental', 10000)]);
const deal = ({ t12 = stmt(), figures = {}, sources = {}, rr = FULL() } = {}) => ({ name: 'Invented', figures: { price: 9e6, noi: 5e5, bsf: 10000, ...figures }, loan: { ltv: 65, rate: 6.75, amort: 30, closing: 2 }, rr, live: {}, scenarios: [], targets: {}, sources, ...(t12 ? { t12 } : {}) });
const checks = (d) => analyze(analysisInput(d), null);
const texts = (d) => checks(d).checks.map((c) => c.text);
const has = (d, re) => texts(d).some((t) => re.test(t));
const MISSING = /none is a management fee/; const PAYROLL = /none is payroll/; const LOW = /management fee is .* of EGI/; const PLOW = /payroll is .* per unit/;
const FREE = /of free rent in the 12 months after/; const OCC = /without saying physical or economic/;
const MF = { ptype: 'Multifamily', units: 120 };

test('6.3.5 missing: a statement of four expense lines with no management fee asks, and says no figure changed', () => {
  assert.ok(has(deal(), MISSING));
  assert.ok(texts(deal()).find((t) => MISSING.test(t)).endsWith('No figure has been changed.'));
  assert.equal(checks(deal()).checks.find((c) => MISSING.test(c.text)).level, 'warn');
});
test('6.3.5 missing: silent for a net lease, a short statement, a line still to review, a management line', () => {
  assert.ok(!has(deal({ figures: { lease_type: 'NNN' } }), MISSING));
  assert.ok(!has(deal({ t12: stmt([], BASE.slice(0, 3)) }), MISSING), 'three lines is under the minimum of four');
  assert.ok(has(deal(), MISSING), 'four expense lines is enough');
  assert.ok(!has(deal({ t12: stmt([['Mystery charge', 500]]) }), MISSING), 'a line the wording does not file is still to review');
  assert.ok(!has(deal({ t12: stmt([['Property Management Fee', 1000]]) }), MISSING));
  assert.ok(!has(deal({ t12: null }), MISSING), 'no T-12, no evidence');
});
test('6.3.5 missing: a $0 management line is a low fee, never a missing one', () => {
  const d = deal({ t12: stmt([['Property Management Fee', 0]]) });
  assert.ok(!has(d, MISSING));
  assert.ok(has(d, LOW));
});
test('6.3.5 payroll: only for multifamily of at least 50 units', () => {
  assert.ok(has(deal({ figures: MF }), PAYROLL));
  assert.ok(!has(deal({ figures: { ...MF, units: 49 } }), PAYROLL));
  assert.ok(has(deal({ figures: { ...MF, units: 50 } }), PAYROLL));
  assert.ok(!has(deal({ figures: { ptype: 'Retail', units: 120 } }), PAYROLL));
  assert.ok(!has(deal({ figures: { ptype: 'Multifamily' } }), PAYROLL), 'units blank');
  assert.ok(!has(deal({ figures: MF, t12: stmt([['Payroll', 20000]]) }), PAYROLL));
});
test('6.3.5 low: a management fee under 2.0% of EGI, an exact 2.0% is not low, blank EGI is silent', () => {
  // EGI 720,000 a year: 1.2% is 8,640, 2.0% is 14,400
  assert.ok(has(deal({ t12: stmt([['Property Management Fee', 720]]) }), /management fee is 1\.2% of EGI, below the 2\.0% set in Settings/));
  assert.ok(has(deal({ t12: stmt([['Property Management Fee', 720]]) }), LOW), '1.2% is low');
  assert.ok(!has(deal({ t12: stmt([['Property Management Fee', 1200]]) }), LOW), 'exactly 2.0% is not under 2.0%');
  assert.ok(has(deal({ t12: stmt([['Property Management Fee', 1199]]) }), LOW));
  const noIncome = stmt([['Property Management Fee', 10]], [['Insurance', 2000], ['Repairs & Maintenance', 4000], ['Utilities', 3000], ['Real Estate Taxes', 9000]]);
  assert.ok(!has(deal({ t12: noIncome }), LOW), 'no income, no share');
});
test('6.3.5 low: payroll under $500 a unit a year, on a full year, with units known', () => {
  assert.ok(has(deal({ figures: MF, t12: stmt([['Payroll', 4000]]) }), PLOW), '$4,000 a month is $400 a unit');
  assert.ok(!has(deal({ figures: MF, t12: stmt([['Payroll', 5000]]) }), PLOW), '$500 a unit exactly');
  assert.ok(!has(deal({ figures: { ptype: 'Multifamily' }, t12: stmt([['Payroll', 4]]) }), PLOW), 'units blank');
});

test('6.3.7 free rent: the roll documents free rent the T-12 has no concession line for', () => {
  const rr = roll([lease('a', '103', 'Example Dental', 5000, { abatements: [{ start: '2026-07-01', end: '2026-09-30', pct: 100 }] }), lease('b', '104', 'Example Cafe', 5000)]);
  const d = deal({ rr });
  const t = texts(d).find((x) => FREE.test(x));
  assert.match(t, /\$37,500 of free rent in the 12 months after 2026-06-30 \(103 \(Example Dental\)\); the T-12 has no concession line/);
  assert.ok(t.endsWith('No figure has been changed.'));
  assert.equal(checks(d).checks.find((c) => FREE.test(c.text)).level, 'warn');
});
test('6.3.7 free rent: silent when the OM rent line is net of free rent, or the T-12 has a concession line, or the free rent is past', () => {
  const ab = [{ start: '2026-07-01', end: '2026-09-30', pct: 100 }];
  const rr = () => roll([lease('a', '103', 'Example Dental', 5000, { abatements: ab }), lease('b', '104', 'Example Cafe', 5000)]);
  assert.ok(!has(deal({ rr: rr(), sources: { rent_inplace: { line: 'Base rent, net of free rent  1,200,000' } } }), FREE));
  assert.ok(!has(deal({ rr: rr(), t12: stmt([['Free rent concessions', -3000]]) }), FREE));
  const past = roll([lease('a', '103', 'Example Dental', 5000, { abatements: [{ start: '2025-01-01', end: '2025-03-31', pct: 100 }] })]);
  assert.ok(!has(deal({ rr: past }), FREE), 'free rent before the as-of date is not ahead of it');
  const late = roll([lease('a', '103', 'Example Dental', 5000, { abatements: [{ start: '2027-08-01', end: '2027-09-30', pct: 100 }] })]);
  assert.ok(!has(deal({ rr: late }), FREE), 'free rent after the 12 months');
});
test('6.3.7 free rent: with no T-12 to compare, a question and no warning', () => {
  const rr = roll([lease('a', '103', 'Example Dental', 5000, { abatements: [{ start: '2026-07-01', end: '2026-09-30', pct: 100 }] })]);
  const m = checks(deal({ rr, t12: null }));
  assert.ok(!m.checks.some((c) => FREE.test(c.text)));
  assert.ok(m.questions.some((q) => FREE.test(q)));
});
test('6.3.7 free rent: projected abatements (lease-up, renewals) are left out', () => {
  const rr = roll([lease('a', '103', 'Example Dental', 5000, { abatements: [{ start: '2026-07-01', end: '2026-09-30', pct: 100, source: 'projected' }] })]);
  assert.equal(rollFacts(rr)[0].free12, 0);
  assert.ok(!has(deal({ rr }), FREE));
});

test('6.3.8 occupancy: neither physical nor economic, and the two measures differ', () => {
  // 80% leased by SF; the T-12 collects all of its rent
  const rr = roll([lease('a', '100', 'Example Dental', 8000), lease('v', '200', '', 2000, { vacant: true, periods: [] })]);
  const d = deal({ rr, sources: { occ: { line: 'Occupancy 92%' } } });
  const t = texts(d).find((x) => OCC.test(x));
  assert.match(t, /the rent roll is 80\.0% leased by SF; the T-12 collects 100\.0% of potential rent\. No figure has been changed\./);
  assert.ok(!has(deal({ rr, sources: { occ: { line: 'Physical occupancy 92%' } } }), OCC));
  assert.ok(!has(deal({ rr, sources: { occ: { line: 'Economic occupancy 92%' } } }), OCC));
  assert.ok(!has(deal({ rr }), OCC), 'no occupancy line, no evidence');
  assert.ok(!has(deal({ rr, t12: null, sources: { occ: { line: 'Occupancy 92%' } } }), OCC), 'no T-12, no economic measure');
});
test('6.3.8 occupancy: a gap of exactly 5 points is not more than 5', () => {
  const rr = roll([lease('a', '100', 'Example Dental', 9500), lease('v', '200', '', 500, { vacant: true, periods: [] })]);
  assert.ok(!has(deal({ rr, sources: { occ: { line: 'Occupancy 95%' } } }), OCC), '95% leased against 100% collected');
  const rr2 = roll([lease('a', '100', 'Example Dental', 9400), lease('v', '200', '', 600, { vacant: true, periods: [] })]);
  assert.ok(has(deal({ rr: rr2, sources: { occ: { line: 'Occupancy 94%' } } }), OCC));
});
test('6.3.8 occupancy: the T-12 collects less than it bills (vacancy and concessions)', () => {
  const rr = FULL();
  const d = deal({ rr, t12: stmt([['Vacancy loss', -9000], ['Free rent concession', -3000]]), sources: { occ: { line: 'Occupancy 100%' } } });
  assert.match(texts(d).find((x) => OCC.test(x)), /T-12 collects 80\.0% of potential rent/);
});

test('the red flags change no number: every key of the analysis outside the checks and questions is identical with and without them', () => {
  const d = deal({ figures: MF, sources: { occ: { line: 'Occupancy 92%' } } });
  const on = checks(d);
  const saved = conventionValues();
  try {
    setConventions({ 'om.items.min': 50, 'om.mgmt.low': 0, 'om.occ.gap': 100, 'om.payroll.units': 100000 });
    const off = checks(d);
    const strip = ({ checks: c, questions: q, ...rest }) => rest;
    assert.deepEqual(strip(on), strip(off));
    assert.ok(on.checks.length > off.checks.length, 'the settings do turn the rows off');
  } finally { setConventions(saved); }
});

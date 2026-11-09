/* UW-2: a rent column gets its unit and period from evidence, in order, and is ASKED when two readings remain
 * (docs/proposals/uw-money-notes.md, NOTE 1). All figures and names invented. Tests 1-6 are the six in section 1.7;
 * the rest hold the evidence order, percent or decimal, the cell rules (blank, zero, Free, dash, trailing minus)
 * and the move of the readings out of omroll.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { addEventListener() {}, dispatchEvent() {} };
const { guessField, rowsToLeases, keepEdited } = await import('../app/rentrollui.js');
const { emptyRentRoll } = await import('../app/rentroll.js');
const { rentRoll } = await import('../app/om.js');
const { parseNum } = await import('../app/kit.js');
const U = await import('../app/units.js');
const { tbl } = await import('./rr-fixtures.js');

const rr = () => emptyRentRoll('Retail', '2026-10-10');
const table = (headers, rows) => ({ sheet: 'x.csv', headers, rows });
/** Import a table the way the screen does: each heading guessed. */
const imp = (headers, rows, opts) => rowsToLeases(rr(), table(headers, rows), headers.map(guessField), opts);
const first = (r) => r.leases[0].periods[0];

/* ---- 1. the heading guess */
test('1. “Months Remaining”, “Term (months)” and “Free Rent (months)” are not monthly rent; “Rent/SF/Mo” is a rate, not square feet', () => {
  for (const h of ['Months Remaining', 'Term (months)', 'Free Rent (months)', 'Months Free']) assert.equal(guessField(h), null, h);
  for (const h of ['Rent/SF/Mo', 'Monthly $/SF', '$/SF/Mo']) assert.equal(guessField(h), 'mpsf', h);
  assert.equal(guessField('Rent/SF/Yr'), 'psf');
  assert.equal(guessField('Monthly Rent'), 'monthly');
  assert.equal(guessField('Annual Base Rent'), 'annual');
  assert.equal(guessField('Rent'), 'rent', 'a bare Rent says nothing about its period');
  assert.equal(guessField('SF'), 'sf');
});

/* ---- 2. E1 and E2 */
test('2a. E2: a bare Rent of 6,000 on 1,000 SF fits a month and a year: the row is held with an ask, not imported at $72,000', () => {
  const r = imp(['Suite', 'Tenant', 'SF', 'Rent'], [['101', 'Acme Tea', 1000, 6000], ['102', 'Birch Books', 2000, 12000]]);
  assert.equal(r.leases.length, 0, 'both rows are held');
  assert.equal(r.held, 2);
  assert.equal(r.colAsks.length, 1);
  assert.match(r.colAsks[0].text, /doesn't say whether it is monthly or annual/);
});
test('2b. E1: 5,000 / 3,750 / 6,250 on 2,000 / 1,500 / 2,500 SF leave only the monthly reading', () => {
  const r = imp(['Suite', 'Tenant', 'SF', 'Rent'], [['101', 'Acme Tea', 2000, 5000], ['102', 'Birch Books', 1500, 3750], ['103', 'Cedar Cafe', 2500, 6250]]);
  assert.equal(r.leases.length, 3);
  assert.equal(r.held, 0);
  assert.deepEqual([first(r).rate, first(r).unit], [5000, 'month']);
  assert.match(r.evidence.find((e) => e.col === 3).text, /Inferred from the figures: monthly rent/);
});
test('2c. the broker answering (mapping the column Monthly rent) releases the held rows', () => {
  const rows = [['101', 'Acme Tea', 1000, 6000]];
  const r = rowsToLeases(rr(), table(['Suite', 'Tenant', 'SF', 'Rent'], rows), ['unit', 'tenant', 'sf', 'monthly'], { chosen: new Set([3]) });
  assert.deepEqual([r.held, first(r).rate, first(r).unit], [0, 6000, 'month']);
});

/* ---- 3. E4: a scale */
test('3. “Annual Rent ($000)” of 60 imports as 60,000; without the caption 60 on 2,000 SF is asked, offering ×1,000', () => {
  const a = imp(['Suite', 'Tenant', 'SF', 'Annual Rent ($000)'], [['101', 'Acme Tea', 2000, 60]]);
  assert.deepEqual([first(a).rate, first(a).unit], [60000, 'year']);
  const b = imp(['Suite', 'Tenant', 'SF', 'Annual Rent'], [['101', 'Acme Tea', 2000, 60]]);
  assert.equal(b.leases.length, 0, 'a scale is never inferred from the size of the figures');
  assert.match(b.colAsks[0].text, /thousands/);
  const c = imp(['Suite', 'Tenant', 'SF', 'Annual Rent'], [['101', 'Acme Tea', 2000, 60]], { scales: [undefined, undefined, undefined, 1000] });
  assert.equal(first(c).rate, 60000, 'the broker chose ×1,000');
  const d = imp(['Suite', 'Tenant', 'SF', 'Annual Rent'], [['101', 'Acme Tea', 2000, 60000]]);
  assert.equal(d.colAsks.length, 0, 'figures that already fit are not questioned');
});
test('3b. a scale never applies to a rate per SF or to SF', () => {
  const r = imp(['Suite', 'Tenant', 'SF', 'Rent/SF/Yr ($000)'], [['101', 'Acme Tea', 2000, 30]]);
  assert.equal(r.held, 1);
  assert.match(r.colAsks[0].text, /a scale never applies/);
  const ok = imp(['Suite', 'Tenant', 'SF', 'Rent/SF/Yr ($000)'], [['101', 'Acme Tea', 2000, 30]], { scales: [undefined, undefined, undefined, 1] });
  assert.deepEqual([first(ok).rate, first(ok).unit], [30, 'psf_year']);
});

/* ---- 4. E3 in the OM reader */
const OMCOLS = [{ h: 'Suite', w: 5 }, { h: 'Tenant', w: 22 }, { h: 'SF', w: 6, r: 1 }, { h: 'Lease End', w: 11 }, { h: 'Rent/SF', w: 8, r: 1 }];
const omRows = (a, b) => [['101', 'Maple Leaf Bakery', '2,000', '12/31/2030', a], ['102', 'Quillfeather Books', '1,500', '05/31/2027', b]];
test('4. E3: an OM “Rent/SF” of 18.00 with no period or total fits a year and a month: it asks (today basis convention)', () => {
  const r = rentRoll([`Rent Roll\n\n${tbl(OMCOLS, omRows('18.00', '20.00'))}`]);
  assert.equal(r.columns.find((c) => c.kind === 'psf').basis, 'ask');
  const ask = r.issues.find((i) => i.kind === 'unit');
  assert.equal(ask.level, 'fail');
  assert.match(ask.text, /doesn't say whether it is monthly or annual/);
});
test('4b. E3: 2.50 can only be a month’s (a year’s is under $3): inferred, not asked; 30.00 stays a year’s by convention', () => {
  const lo = rentRoll([`Rent Roll\n\n${tbl(OMCOLS, omRows('2.50', '2.75'))}`]);
  const c = lo.columns.find((x) => x.kind === 'psf');
  assert.deepEqual([c.reading, c.basis], ['mpsf', 'inferred']);
  const hi = rentRoll([`Rent Roll\n\n${tbl(OMCOLS, omRows('30.00', '28.00'))}`]);
  const d = hi.columns.find((x) => x.kind === 'psf');
  assert.deepEqual([d.reading, d.basis], ['psf', 'convention']);
  assert.equal(hi.issues.filter((i) => i.kind === 'unit').length, 0);
});

/* ---- 5. E7 / E8: the cells */
test('5a. “1,200-” is a negative: the rent cell asks credit or concession, and the row is held', () => {
  assert.equal(parseNum('1,200-'), -1200);
  assert.equal(parseNum('(1,200)'), -1200);
  assert.equal(parseNum('-1,200'), -1200);
  const r = imp(['Suite', 'Tenant', 'SF', 'Monthly Rent'], [['101', 'Acme Tea', 1000, '1,200-'], ['102', 'Birch Books', 1000, '1,300']]);
  assert.equal(r.leases.length, 1, 'the other row stays usable');
  assert.equal(r.leases[0].unit, '102');
  assert.match(r.asks[0].text, /Suite 101 has a negative rent .*credit or a concession/);
});
test('5b. “Free” asks and names the row; it is never a zero rate', () => {
  const r = imp(['Suite', 'Tenant', 'SF', 'Monthly Rent'], [['110', 'Acme Tea', 1000, 'Free'], ['111', 'Birch Books', 1000, 1300]]);
  assert.equal(r.leases.length, 1);
  assert.equal(r.asks[0].text, 'Suite 110 says Free. Type its contract rent and when the free period ends.');
  assert.equal(first(r).rate, 1300);
});
test('5c. blank and dash are not stated (no period, never 0); a typed 0 is a documented zero; words are asked', () => {
  const r = imp(['Suite', 'Tenant', 'SF', 'Monthly Rent'], [['1', 'A', 100, ''], ['2', 'B', 100, '-'], ['3', 'C', 100, '$0'], ['4', 'D', 100, 'TBD']]);
  assert.deepEqual(r.leases.map((L) => L.periods.length), [0, 0, 1]);
  assert.equal(r.leases[2].periods[0].rate, 0);
  assert.equal(r.noRent, 2);
  assert.match(r.asks[0].text, /“TBD”/);
  assert.deepEqual(['', ' ', null, '—'].map((x) => U.cellKind(x, parseNum).kind), ['blank', 'blank', 'blank', 'dash']);
});
test('5d. annual and monthly columns that disagree hold the row instead of quietly preferring annual', () => {
  const r = imp(['Suite', 'Tenant', 'SF', 'Annual Rent', 'Monthly Rent'], [['1', 'A', 1000, 60000, 5000], ['2', 'B', 1000, 60000, 9000]]);
  assert.deepEqual(r.leases.map((L) => L.unit), ['1']);
  assert.match(r.asks[0].text, /disagree/);
});

/* ---- 6. Replace keeps hand edits */
test('6. Replace keeps a lease whose period is marked edited: true, and drops the file’s copy of that unit', () => {
  const old = [
    { unit: '101', tenant: 'Acme Tea', periods: [{ start: '2026-01-01', end: '2026-12-31', rate: 5100, unit: 'month', edited: true }] },
    { unit: '102', tenant: 'Birch Books', periods: [{ start: '2026-01-01', end: '2026-12-31', rate: 1, unit: 'month' }] },
    { unit: '999', tenant: 'Gone Co', periods: [{ start: '2026-01-01', end: '2026-12-31', rate: 7, unit: 'month', edited: true }] },
  ];
  const incoming = [{ unit: '101', tenant: 'Acme Tea', periods: [{ rate: 5000 }] }, { unit: '102', tenant: 'Birch Books', periods: [{ rate: 3500 }] }];
  const k = keepEdited(old, incoming);
  assert.equal(k.kept, 2);
  assert.deepEqual(k.leases.map((L) => [L.unit, L.periods[0].rate]), [['101', 5100], ['102', 3500], ['999', 7]]);
  assert.deepEqual(keepEdited([{ unit: '5', periods: [{ rate: 1 }] }], incoming).leases, incoming, 'nothing edited: a plain replace');
});

/* ---- the evidence order (units.js) */
test('a per-SF column: a total beside it that reconciles it (×12) is inferred, (×1) is reconciled; no evidence and two readings is an ask', () => {
  const t = (rows) => ({ cols: [{ kind: 'sf', label: 'SF' }, { kind: 'psf', label: 'Rent/SF' }, { kind: 'annual', label: 'Annual' }], rows: rows.map((raw) => ({ raw })) });
  const m = U.readings(t([{ sf: 1000, psf: 2.5, annual: 30000 }, { sf: 2000, psf: 2.5, annual: 60000 }]));
  assert.deepEqual([m.psf.reading, m.psf.basis], ['mpsf', 'inferred']);
  const y = U.readings(t([{ sf: 1000, psf: 18, annual: 18000 }, { sf: 2000, psf: 18, annual: 36000 }]));
  assert.deepEqual([y.psf.reading, y.psf.basis], ['psf', 'reconciled'], 'the total settles it even though 18 also passes as a month');
  const a = U.readings({ cols: [{ kind: 'psf', label: 'Rent/SF' }], rows: [{ raw: { psf: 18 } }] });
  assert.deepEqual([a.psf.reading, a.psf.basis, a.psf.alt], ['psf', 'ask', ['mpsf']]);
  const s = U.readings({ cols: [{ kind: 'psf', label: 'Rent/SF/Yr' }], rows: [{ raw: { psf: 18 } }] });
  assert.equal(s.psf.basis, 'stated', 'a stated heading is never overridden by plausibility');
});
test('plausibility only rules readings out: 3 and 300 are the bounds, and two passing readings never pick one', () => {
  assert.deepEqual([2.99, 3, 300, 300.01].map(U.plausible), [false, true, true, false]);
  const both = U.rentReading([[6000, 1000]]);
  assert.equal(both.basis, 'ask');
  assert.deepEqual(both.alt, ['monthly']);
  assert.equal(U.rentReading([[5000, 2000]]).basis, 'inferred');
});
test('percent or decimal is decided for the column: one value of 1 or more makes 0.8 mean 0.8%; a wholly-fractional column is checked against the areas', () => {
  assert.equal(U.percentReading([12.5, 0.8, 3.2]).as, 'percent');
  const sf = [5000, 1000, 400];
  assert.deepEqual(U.percentReading([0.125, 0.025, 0.01], { sf, buildingSf: 40000 }), { as: 'decimal', basis: 'reconciled' });
  assert.equal(U.percentReading([0.125, 0.025, 0.01], { sf: [5000, 1000, 999], buildingSf: 40000 }).as, 'ask');
  assert.equal(U.percentReading([0.125, 0.008]).as, 'ask', 'no areas to check against');
});

/* ---- one definition */
test('readings, plausible and competing live in units.js only (a move, not a copy)', () => {
  const om = fs.readFileSync(new URL('../app/omroll.js', import.meta.url), 'utf8');
  assert.doesNotMatch(om, /^(?:export )?function (?:readings|competing)\b/m);
  assert.doesNotMatch(om, /^const plausible\b/m);
  assert.match(om, /from '\.\/units\.js'/);
});

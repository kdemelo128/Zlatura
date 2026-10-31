/* Lease abstracts (app/abstracts.js, abstractfields.js): the normaliser against hostile input, the setters (a blank is
 * never a zero; an edit unticks), the review checks R1 to R12 each with a case that passes and one that trips it, the
 * relative step dates, canUse, the lease.js view, and properties. Invented names and figures only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

// dd.js reaches kit.js, which wants a page: the same stand-in tests/dd.test.js uses
globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const A = await import('../app/abstracts.js');
const FX = await import('../app/abstractfields.js');
const { toCents } = await import('../app/engine/money.js');
const { emptyAbstracts, recordable } = await import('../app/history.js');

const NOW = '2026-10-31T10:00:00.000Z';
const fresh = () => A.newAbstract({ title: 'Example Cafe lease', now: NOW });
const lvl = (ab, level) => A.checkAbstract(ab).filter((c) => c.level === level);
const has = (ab, re, level) => A.checkAbstract(ab).some((c) => re.test(c.text) && (!level || c.level === level));
/** An abstract with 12,000 rentable SF and one term holding the given steps (each { from, to, amounts, primary }). */
function withSteps(steps, { sfBasis = 'rentable', stepBasis = 'rentable' } = {}) {
  const ab = fresh();
  A.setValue(ab, 'sf', 12000, { basis: sfBasis });
  const t = A.addTerm(ab, { kind: 'initial', label: 'Original term' }).term;
  for (const s of steps) {
    const st = A.addStep(ab, t.id, { primary: 'year', basis: stepBasis, ...s }).step;
    Object.assign(st.amounts, s.raw || {}); // raw amounts, to test the boundaries without the cents rounding
    if (st.primary && st.amounts[st.primary] !== null && st.amounts[st.primary] !== undefined) st.status = 'found';
  }
  return { ab, t };
}

/* ------------------------------------------------------------ the catalogue */
test('the catalogue: unique keys, every kind known, enums have options, clauses are in note order', () => {
  const keys = FX.FIELDS.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length, 'a clause key clashing with a structured key would hide one of them');
  for (const f of FX.FIELDS) { assert.ok(FX.KINDS.includes(f.kind), f.key); assert.ok(FX.GROUPS.some((g) => g.id === f.group), f.key); if (f.kind === 'enum') assert.ok(f.opts.length, f.key); }
  assert.equal(FX.CLAUSES.filter((c) => !c.optional).length, 24);
  assert.equal(FX.CLAUSES.filter((c) => c.optional).length, 16);
  assert.ok(Object.isFrozen(FX.FIELDS));
});

/* ------------------------------------------------------------ the normaliser */
test('normaliser: hostile input gives caps applied and nothing invented', () => {
  const hostile = {
    v: 7,
    items: [
      null, 5, 'x', [], { id: 'ab_dup', title: 'A'.repeat(500), docs: Array.from({ length: 30 }, (_, i) => `doc${i}`), asOf: '2026-02-30',
        fields: {
          __proto__: { value: 1 }, nonsense: { value: 1 }, constructor: { value: 'x' },
          deposit: { value: NaN, status: 'found' }, tiAllowance: { value: Infinity, status: 'found' }, breakpoint: { value: -5, status: 'found' },
          holdoverPct: { value: 1e309, status: 'found' }, estoppelDays: { value: {}, status: 'found' }, commencement: { value: 'abc', status: 'found' },
          capPct: { value: 0, status: 'not-found' }, adminFeePct: { value: 0, status: 'unread' }, assignmentFee: { value: -0, status: 'found', unit: 'bogus', note: 'n'.repeat(900),
            src: Array.from({ length: 100 }, () => ({ page: 1, quote: 'q'.repeat(10000), reader: 'ocr', start: 5 })) },
          guarantyCap: { value: 12.345, status: 'found', checked: 'not a date', basis: 'weird' }, depositForm: { value: 'barter', status: 'found' },
          tenant: { value: 'T'.repeat(900), status: 'wild' }, landlord: { value: 'Example Holdings LLC', status: 'found', checked: '2026-10-31T10:00:00Z' },
          noticeTenant: { value: ['1 Example Way', 7, '', 'Suite 4'], status: 'found' },
        },
        terms: [{ id: 'tm1', kind: 'nope', label: 'x'.repeat(200) }, { id: 'tm1', kind: 'renewal' }, ...Array.from({ length: 9 }, (_, i) => ({ id: `t${i}` }))],
        steps: [{ id: 's1', term: 'ghost', amounts: { month: '4250', year: 51000, psf_year: NaN }, primary: 'decade', basis: 'sky', mFrom: 0, mTo: 12 }, { id: 's1' }],
        flags: [{ text: '  ' }, { text: 'Ask about the deposit' }], versions: [1, 2], audit: [{ x: 1 }], version: 9, leaseId: 7 },
      { id: 'ab_dup', title: 'second with the same id' },
      ...Array.from({ length: 70 }, (_, i) => ({ id: `ab_${i}` })),
    ],
  };
  const out = A.normAbstracts(hostile);
  assert.equal(out.items.length, A.MAX_ABSTRACTS, '70 abstracts: capped at 60');
  assert.equal(new Set(out.items.map((x) => x.id)).size, out.items.length, 'repeated ids dropped');
  const ab = out.items[0];
  assert.equal(ab.title.length, 120);
  assert.equal(ab.docs.length, 10);
  assert.equal(ab.asOf, null, 'Feb 30 is not a date');
  assert.deepEqual(Object.keys(ab.fields).sort(), ['adminFeePct', 'assignmentFee', 'breakpoint', 'capPct', 'commencement', 'deposit', 'depositForm', 'estoppelDays', 'guarantyCap', 'holdoverPct', 'landlord', 'noticeTenant', 'tenant', 'tiAllowance'].sort(), 'unknown keys, __proto__ and constructor dropped');
  assert.equal(Object.getPrototypeOf(ab.fields), Object.prototype);
  for (const k of ['deposit', 'tiAllowance', 'breakpoint', 'holdoverPct', 'estoppelDays', 'commencement', 'depositForm']) {
    assert.equal(ab.fields[k].value, null, `${k}: a value that does not read is null`);
    assert.equal(ab.fields[k].status, 'ambiguous', `${k}: found becomes needs-your-choice`);
    assert.equal(ab.fields[k].note, 'A saved value could not be read');
  }
  assert.equal(ab.fields.capPct.value, null, 'value 0 with not-found is null, not 0');
  assert.equal(ab.fields.adminFeePct.value, null, 'value 0 with unread is null');
  assert.equal(Object.is(ab.fields.assignmentFee.value, 0), true, '-0 is stored as 0, a real found value');
  assert.equal(ab.fields.assignmentFee.unit, 'total', 'an unknown unit becomes the catalogue unit');
  assert.equal(ab.fields.assignmentFee.note.length, 300);
  assert.equal(ab.fields.assignmentFee.src.length, 3);
  assert.equal(ab.fields.assignmentFee.src[0].quote.length, 240);
  assert.equal(ab.fields.assignmentFee.src[0].reader, 'typed');
  assert.equal(ab.fields.assignmentFee.src[0].start, null);
  assert.equal(ab.fields.guarantyCap.value, 12.35, 'dollars go through toCents');
  assert.equal(ab.fields.guarantyCap.checked, false);
  assert.equal(ab.fields.guarantyCap.basis, null);
  assert.equal(ab.fields.tenant.status, 'unread', 'an unknown status is unread');
  assert.equal(ab.fields.tenant.value, null);
  assert.equal(ab.fields.landlord.checked, '2026-10-31T10:00:00Z');
  assert.deepEqual(ab.fields.noticeTenant.value, ['1 Example Way', 'Suite 4']);
  assert.equal(ab.terms.length, 6);
  assert.equal(ab.terms[0].kind, null);
  assert.equal(ab.terms[0].label.length, 80);
  assert.equal(new Set(ab.terms.map((t) => t.id)).size, 6);
  assert.equal(ab.steps.length, 1, 'a repeated step id is dropped');
  assert.equal(ab.steps[0].term, null, 'a step pointing at no term');
  assert.deepEqual(ab.steps[0].amounts, { month: null, year: 51000, psf_year: null, psf_month: null }, 'a string is not an amount');
  assert.equal(ab.steps[0].primary, null);
  assert.equal(ab.steps[0].basis, null);
  assert.equal(ab.steps[0].mFrom, null);
  assert.equal(ab.steps[0].mTo, 12);
  assert.deepEqual(ab.flags.map((f) => f.text), ['Ask about the deposit']);
  assert.deepEqual([ab.versions, ab.audit, ab.version, ab.leaseId], [[], [], 1, null]);
  assert.deepEqual(A.normAbstracts(out), out, 'normalising twice gives the same result');
});

test('normaliser: a damaged container becomes an empty list, never a throw', () => {
  for (const raw of [undefined, null, 5, 'x', [], { items: 'no' }, { items: {} }]) assert.deepEqual(A.normAbstracts(raw), { v: 1, items: [] });
  const d = {};
  assert.deepEqual(A.abstractsOf(d), { v: 1, items: [] });
  assert.equal(d.abstracts, A.abstractsOf(d), 'a clean list is kept as the same object');
  d.abstracts = { v: 1, items: [{ id: 'ab_x', fields: { deposit: { value: 'abc', status: 'found' } } }] };
  assert.equal(A.abstractsOf(d).items[0].fields.deposit.status, 'ambiguous');
});

test('a dateRel found with the lease’s words and no date is valid; with neither it is not', () => {
  const ab = A.normAbstracts({ items: [{ id: 'ab_1', fields: { commencement: { status: 'found', value: null, rel: 'the day after delivery' }, expiration: { status: 'found', value: null } } }] }).items[0];
  assert.equal(ab.fields.commencement.status, 'found');
  assert.equal(ab.fields.commencement.rel, 'the day after delivery');
  assert.equal(ab.fields.expiration.status, 'ambiguous');
});

/* ------------------------------------------------------------ the setters */
test('setters: a blank is never a zero', () => {
  const ab = fresh();
  assert.ok(A.setValue(ab, 'deposit', 5000).ok);
  assert.equal(ab.fields.deposit.value, 5000);
  for (const bad of ['', null, undefined, 'abc', -1, NaN, Infinity]) assert.ok(A.setValue(ab, 'deposit', bad).error, String(bad));
  assert.equal(ab.fields.deposit.value, 5000, 'a refused value leaves the old one');
  // not in lease: null, not zero
  assert.ok(A.setNotFound(ab, 'deposit').ok);
  assert.equal(ab.fields.deposit.value, null);
  assert.equal(ab.fields.deposit.status, 'not-found');
  // clear: the key is gone
  assert.ok(A.clearField(ab, 'deposit'));
  assert.ok(!('deposit' in ab.fields));
  assert.equal(A.clearField(ab, 'deposit'), false);
  // lease says none: needs evidence or the no-clause note
  assert.ok(A.setNone(ab, 'deposit').error, 'no page, no quote, no note: refused');
  assert.ok(A.setNone(ab, 'deposit', { noClause: true }).ok);
  assert.equal(ab.fields.deposit.value, 0);
  assert.equal(ab.fields.deposit.status, 'found');
  assert.equal(ab.fields.deposit.note, 'no clause');
  assert.ok(A.setEvidence(ab, 'holdoverPct', [{ page: 4, quote: 'No holdover premium.' }]).ok);
  assert.equal(ab.fields.holdoverPct.status, 'unread', 'evidence alone is not a value');
  assert.equal(ab.fields.holdoverPct.value, null);
  assert.ok(A.setNone(ab, 'holdoverPct').ok, 'a page and a quote are evidence');
  assert.equal(ab.fields.holdoverPct.value, 0);
  assert.ok(A.setNone(ab, 'breakpointNatural', { noClause: true }).ok);
  assert.equal(ab.fields.breakpointNatural.value, false);
  assert.ok(A.setNone(ab, 'tradeName', { noClause: true }).ok);
  assert.equal(ab.fields.tradeName.value, 'None');
  assert.ok(A.setNone(ab, 'commencement', { noClause: true }).error, 'a date has no "none"');
  assert.ok(A.setNone(ab, 'sf', { noClause: true }).error);
  // needs a choice: a note is required
  assert.ok(A.setAmbiguous(ab, 'suite', '  ').error);
  assert.ok(A.setAmbiguous(ab, 'suite', 'Two suites are named').ok);
  assert.equal(ab.fields.suite.status, 'ambiguous');
});

test('setters: units, bases and percents are refused when wrong, and rounding is the engine’s', () => {
  const ab = fresh();
  assert.ok(A.setValue(ab, 'expenseStop', 4.123456, { unit: 'psf_year', basis: 'rentable' }).ok);
  assert.equal(ab.fields.expenseStop.value, 4.1235, 'a rate to four places');
  assert.ok(A.setValue(ab, 'deposit', 1234.567).ok);
  assert.equal(ab.fields.deposit.value, 1234.57, 'dollars to whole cents');
  assert.equal(ab.fields.deposit.value, toCents(1234.567));
  assert.ok(A.setValue(ab, 'deposit', 10, { unit: 'psf_year' }).error);
  assert.ok(A.setValue(ab, 'sf', 12000, { basis: 'moon' }).error);
  assert.ok(A.setValue(ab, 'sf', 0).error, 'SF must be above zero');
  assert.ok(A.setValue(ab, 'termMonths', 60.5).error, 'months are whole');
  assert.ok(A.setValue(ab, 'depositForm', 'barter').error);
  assert.ok(A.setValue(ab, 'depositForm', 'cash').ok);
  assert.ok(A.setValue(ab, 'nope', 1).error);
  assert.ok(A.setValue(ab, '__proto__', 1).error);
  assert.ok(A.setValue(ab, 'commencement', null, { rel: 'the first of the month after delivery' }).ok, 'the lease’s words with no date yet');
  assert.ok(A.setValue(ab, 'commencement', '2027-01-01', { rel: 'the first of the month after delivery' }).ok);
  assert.ok(A.setValue(ab, 'commencement', '2027-02-30').error);
});

test('setters: ticking needs a filled item, an edit unticks and says so', () => {
  const ab = fresh();
  assert.ok(A.setChecked(ab, 'deposit', true).error, 'unread cannot be ticked');
  A.setValue(ab, 'deposit', 5000);
  assert.ok(A.setChecked(ab, 'deposit', true, { now: NOW }).ok);
  assert.equal(ab.fields.deposit.checked, NOW);
  A.setEvidence(ab, 'deposit', [{ page: 3 }]);
  assert.equal(ab.fields.deposit.checked, NOW, 'a source change does not untick');
  assert.equal(A.setValue(ab, 'deposit', 5000).unchecked, undefined, 'the same value is no edit');
  assert.equal(ab.fields.deposit.checked, NOW);
  const r = A.setValue(ab, 'deposit', 6000);
  assert.equal(ab.fields.deposit.checked, false, 'an edit unticks');
  assert.equal(r.unchecked, 'Security deposit: changed, so no longer checked');
  A.setChecked(ab, 'deposit', true);
  A.setValue(ab, 'deposit', 6000, { unit: 'total' });
  assert.ok(ab.fields.deposit.checked, 'the same unit is no edit');
  A.setNotFound(ab, 'deposit');
  assert.equal(ab.fields.deposit.checked, false);
  // a step
  const { ab: ab2, t } = withSteps([{ from: '2027-01-01', to: '2027-12-31', amounts: { year: 51000 } }]);
  const step = ab2.steps[0];
  assert.ok(A.setChecked(ab2, `step:${step.id}`, true).ok);
  const e = A.setStep(ab2, step.id, { amounts: { year: 52000 } });
  assert.equal(step.checked, false);
  assert.equal(e.unchecked, 'Rent, Year 1: changed, so no longer checked');
  assert.ok(A.setStep(ab2, step.id, { from: '2027-02-31' }).error, 'a bad date is refused');
  assert.ok(A.setStep(ab2, step.id, { amounts: { year: -1 } }).error);
  assert.equal(t.id, step.term);
});

test('lists: caps, add and remove, and the next step starts the day after the last ends', () => {
  const ab = fresh();
  for (let i = 0; i < 6; i++) assert.ok(A.addTerm(ab, { kind: 'renewal' }).term);
  assert.ok(A.addTerm(ab).error, 'a seventh term');
  const t = ab.terms[0];
  const s1 = A.addStep(ab, t.id, { from: '2027-01-01', to: '2027-12-31', primary: 'psf_year', basis: 'rentable', amounts: { psf_year: 4.25 } }).step;
  const s2 = A.addStep(ab, t.id).step;
  assert.equal(s2.from, '2028-01-01');
  assert.equal(s2.primary, 'psf_year');
  assert.equal(s2.basis, 'rentable');
  assert.equal(s2.label, 'Year 2');
  assert.equal(A.addStep(ab, 'ghost').error, 'No such term.');
  const gone = A.removeStep(ab, s1.id);
  assert.equal(gone.item.id, s1.id);
  const rt = A.removeTerm(ab, t.id);
  assert.equal(rt.steps.length, 1, 'a removed term takes its steps, and hands them back for an Undo');
  assert.equal(ab.steps.length, 0);
  for (let i = 0; i < 20; i++) assert.ok(A.addFlag(ab, `flag ${i}`).flag);
  assert.ok(A.addFlag(ab, 'one more').error);
  assert.ok(A.addFlag(fresh(), '   ').error, 'an empty flag');
  const list = A.normAbstracts(null);
  for (let i = 0; i < 60; i++) assert.ok(A.addAbstract(list, { title: `a${i}` }).abstract);
  assert.ok(A.addAbstract(list, { title: 'a61' }).error);
  const rm = A.removeAbstract(list, list.items[3].id);
  A.restoreAbstract(list, rm);
  assert.equal(list.items[3].id, rm.abstract.id, 'an Undo puts it back where it was');
});

/* ------------------------------------------------------------ the checks, each with a pass and a trip */
test('R1 monthly against annual: 4250.00 and 51000.00 pass, 51600.00 trips, at the 0.005 boundary', () => {
  const step = (m, y) => withSteps([{ from: '2027-01-01', to: '2027-12-31', raw: { month: m, year: y } }]).ab;
  assert.equal(lvl(step(4250, 51000), 'fail').length, 0);
  assert.ok(has(step(4250, 51600), /monthly and annual disagree/, 'fail'));
  assert.ok(!has(step(4250, 51000.06), /monthly and annual/), 'a difference of exactly 0.005 a month passes');
  assert.ok(has(step(4250, 51000.0612), /monthly and annual/, 'fail'), 'a difference of 0.0051 trips');
});

test('R2 annual against $/SF: 51000 on 12,000 rentable SF is 4.25; 4.50 trips', () => {
  const step = (p) => withSteps([{ from: '2027-01-01', to: '2027-12-31', raw: { year: 51000, psf_year: p } }]).ab;
  assert.ok(!has(step(4.25), /\$\/SF disagree/));
  assert.ok(has(step(4.5), /annual and \$\/SF disagree/, 'fail'));
  assert.ok(!has(step(4.255), /\$\/SF disagree/), '0.005 passes');
  assert.ok(has(step(4.2551), /\$\/SF disagree/, 'fail'), '0.0051 trips');
});

test('R3 $/SF on a non-rentable basis: usable SF warns and the rent block shows no total', () => {
  const mk = (basis) => withSteps([{ from: '2027-01-01', to: '2027-12-31', primary: 'psf_year', raw: { year: 51000, psf_year: 4.25 } }], { sfBasis: basis, stepBasis: basis });
  assert.ok(!has(mk('rentable').ab, /per .* SF: the rent block/));
  const { ab, t } = mk('usable');
  assert.ok(has(ab, /per usable SF: the rent block shows no total/, 'warn'));
  assert.ok(!has(ab, /annual and \$\/SF disagree/), 'no comparison on a different basis');
  const b = A.rentBlock(ab, t.id);
  assert.equal(b.rows[0].monthly, null, 'never multiplied silently');
  assert.equal(b.total, null);
  assert.equal(b.rows[0].annualPsf, null);
  assert.equal(b.rows[0].psfText, 'per usable SF');
  // a step on rentable SF over an area measured as usable is not multiplied either
  const mixed = withSteps([{ from: '2027-01-01', to: '2027-12-31', primary: 'psf_year', raw: { psf_year: 4.25 } }], { sfBasis: 'usable', stepBasis: 'rentable' });
  assert.ok(has(mixed.ab, /per usable SF/, 'warn'));
  assert.equal(A.rentBlock(mixed.ab, mixed.t.id).rows[0].monthly, null);
});

test('R4 overlaps and gaps come from lease.js validateLease, mapped to the step', () => {
  const ok = withSteps([{ from: '2027-01-01', to: '2027-12-31', raw: { year: 51000 } }, { from: '2028-01-01', to: '2028-12-31', raw: { year: 52000 } }]).ab;
  assert.ok(!has(ok, /overlap|No rent from/));
  const over = withSteps([{ from: '2027-01-01', to: '2027-12-31', raw: { year: 51000 } }, { from: '2027-12-01', to: '2028-12-31', raw: { year: 52000 } }]).ab;
  const o = A.checkAbstract(over).find((c) => /overlap/.test(c.text));
  assert.equal(o.level, 'fail');
  assert.equal(o.key, `step:${over.steps[1].id}`, 'mapped to a step id');
  const gap = withSteps([{ from: '2027-01-01', to: '2027-12-31', raw: { year: 51000 } }, { from: '2028-02-01', to: '2028-12-31', raw: { year: 52000 } }]).ab;
  assert.equal(A.checkAbstract(gap).find((c) => /No rent from 2028-01-01 to 2028-01-31/.test(c.text)).level, 'warn');
});

test('R5 date order: expiration on or before commencement fails; rent commencement before and possession after warn', () => {
  const dates = (o) => { const ab = fresh(); for (const [k, v] of Object.entries(o)) A.setValue(ab, k, v); return ab; };
  assert.equal(lvl(dates({ commencement: '2027-01-01', expiration: '2031-12-31' }), 'fail').length, 0);
  assert.ok(has(dates({ commencement: '2027-01-01', expiration: '2027-01-01' }), /Expiration: on or before commencement/, 'fail'));
  assert.ok(has(dates({ commencement: '2027-01-01', expiration: '2026-01-01' }), /on or before commencement/, 'fail'));
  assert.ok(!has(dates({ commencement: '2027-01-01', rentCommencement: '2027-01-01' }), /Rent commencement/));
  assert.ok(has(dates({ commencement: '2027-01-01', rentCommencement: '2026-12-31' }), /Rent commencement: before commencement/, 'warn'));
  assert.ok(has(dates({ commencement: '2027-01-01', possession: '2027-01-02' }), /Possession: after commencement/, 'warn'));
  assert.ok(!has(dates({ commencement: '2027-01-01', possession: '2026-12-01' }), /Possession/));
});

test('R6 stated term against the dates: 60 passes, 66 trips', () => {
  const t = (m) => { const ab = fresh(); A.setValue(ab, 'commencement', '2027-01-01'); A.setValue(ab, 'expiration', '2031-12-31'); A.setValue(ab, 'termMonths', m); return ab; };
  assert.ok(!has(t(60), /Stated term/));
  assert.ok(has(t(66), /Stated term: 66 months, but the dates give 60/, 'warn'));
  assert.ok(has(t(61), /Stated term/), 'a month off is more than half a month');
});

test('R7 relative dates: the lease’s words with no date fail; months 1 to 12 wait for a checked rent commencement', () => {
  const ab = fresh();
  A.setValue(ab, 'commencement', null, { rel: 'the first of the month after delivery' });
  const c = A.checkAbstract(ab).find((x) => x.key === 'commencement');
  assert.equal(c.level, 'fail');
  assert.match(c.text, /depends on: the first of the month after delivery/);
  A.setValue(ab, 'commencement', '2027-01-01', { rel: 'the first of the month after delivery' });
  assert.ok(!A.checkAbstract(ab).some((x) => x.key === 'commencement'), 'a typed date resolves it');
  const { ab: ab2 } = withSteps([{ mFrom: 1, mTo: 12, raw: { year: 51000 } }]);
  assert.ok(has(ab2, /unresolved until rent commencement is typed and checked/, 'fail'));
  A.setValue(ab2, 'rentCommencement', '2027-03-01');
  assert.ok(has(ab2, /unresolved until rent commencement is typed and checked/), 'typed but not checked is still unresolved');
  A.setChecked(ab2, 'rentCommencement', true);
  assert.ok(!has(ab2, /unresolved/));
});

test('R8 steps against the term: the first step after rent commencement and the last step off the expiration warn', () => {
  const mk = (first, last) => {
    const { ab } = withSteps([{ from: first, to: '2027-12-31', raw: { year: 51000 } }, { from: '2028-01-01', to: last, raw: { year: 52000 } }]);
    A.setValue(ab, 'rentCommencement', '2027-01-01'); A.setValue(ab, 'expiration', '2028-12-31');
    return ab;
  };
  assert.ok(!has(mk('2027-01-01', '2028-12-31'), /starts after rent commencement|ends (before|after)/));
  assert.ok(has(mk('2027-02-01', '2028-12-31'), /starts after rent commencement/, 'warn'));
  assert.ok(has(mk('2027-01-01', '2028-06-30'), /ends before the expiration/, 'warn'));
  assert.ok(has(mk('2027-01-01', '2029-01-31'), /ends after the expiration/, 'warn'));
});

test('R9 a pro-rata share needs what it covers', () => {
  const ab = fresh();
  A.setValue(ab, 'proRata', 7.35);
  assert.ok(has(ab, /Pro-rata share: what it covers is not stated/, 'warn'));
  A.setValue(ab, 'proRataCovers', 'real estate taxes');
  assert.ok(!has(ab, /Pro-rata share/));
});

test('R10 a "none" with no evidence warns', () => {
  const ab = fresh();
  A.setValue(ab, 'deposit', 0);
  assert.ok(has(ab, /Security deposit: marked none, with no page, quote or note/, 'warn'));
  A.setNote(ab, 'deposit', 'Lease has no deposit clause');
  assert.ok(!has(ab, /marked none/));
  const ab2 = fresh();
  A.setValue(ab2, 'deposit', 0); A.setEvidence(ab2, 'deposit', [{ page: 9 }]);
  assert.ok(!has(ab2, /marked none/), 'a page is evidence');
  const ab3 = fresh();
  A.setValue(ab3, 'deposit', 1);
  assert.ok(!has(ab3, /marked none/));
});

test('R11 a percent outside 0 to 100 fails', () => {
  const pct = (v) => { const ab = fresh(); A.setValue(ab, 'capPct', v); return ab; };
  assert.ok(!has(pct(100), /percent must be/));
  assert.ok(!has(pct(0), /percent must be/));
  assert.ok(has(pct(100.01), /Cap on increases \(%\): a percent must be between 0 and 100/, 'fail'));
  assert.ok(has(pct(-1), /percent must be/, 'fail'));
  assert.ok(has(pct(150), /percent must be/, 'fail'));
});

test('R12 an ambiguous item with no note fails', () => {
  const ab = fresh();
  A.setAmbiguous(ab, 'suite', 'Two suites are named');
  assert.ok(!has(ab, /needs a note/));
  ab.fields.suite.note = '';
  const c = A.checkAbstract(ab).find((x) => /needs a note/.test(x.text));
  assert.equal(c.level, 'fail');
  assert.equal(c.key, 'suite');
});

test('the checks never change a value', () => {
  const { ab } = withSteps([{ from: '2027-01-01', to: '2027-12-31', raw: { month: 4250, year: 51600 } }]);
  A.setValue(ab, 'capPct', 150);
  const before = JSON.stringify(ab);
  A.checkAbstract(ab); A.progress(ab); A.flagLines(ab);
  assert.equal(JSON.stringify(ab), before);
});

/* ------------------------------------------------------------ steps, dates and the rent block */
test('stepDates and stepMonths: dates as typed; months 1 to 12 count from a checked rent commencement', () => {
  const { ab } = withSteps([{ from: '2027-01-01', to: '2027-12-31' }, { mFrom: 1, mTo: 12 }, { mFrom: 13, mTo: 24 }]);
  const [typed, rel1, rel2] = ab.steps;
  assert.deepEqual(A.stepDates(typed, ab), { from: '2027-01-01', to: '2027-12-31', relative: false, reason: null });
  assert.equal(A.stepMonths(typed, ab), 12, 'twelve whole months, by lease.js');
  assert.equal(A.stepDates(rel1, ab).from, null);
  assert.match(A.stepDates(rel1, ab).reason, /unresolved until rent commencement is typed and checked/);
  assert.equal(A.stepMonths(rel1, ab), 12, 'the months are known without the dates');
  A.setValue(ab, 'rentCommencement', '2027-03-01');
  assert.equal(A.stepDates(rel1, ab).from, null, 'typed but not checked');
  A.setChecked(ab, 'rentCommencement', true);
  assert.deepEqual([A.stepDates(rel1, ab).from, A.stepDates(rel1, ab).to], ['2027-03-01', '2028-02-29']);
  assert.deepEqual([A.stepDates(rel2, ab).from, A.stepDates(rel2, ab).to], ['2028-03-01', '2029-02-28']);
  assert.equal(A.stepDates(rel1, ab).relative, true);
  assert.ok(!('from' in ab.steps[1]) || ab.steps[1].from === null, 'computed on the fly, never stored');
});

test('rentBlock: whole cents, a total only when every row is complete, annual rate per SF is monthly x 12 / rentable SF', () => {
  const { ab, t } = withSteps([
    { from: '2027-01-01', to: '2027-12-31', primary: 'psf_year', raw: { psf_year: 4.25 } },
    { from: '2028-01-01', to: '2028-12-31', primary: 'month', raw: { month: 4377.5 } },
    { from: '2029-01-01', to: '2029-06-30', primary: 'year', raw: { year: 27000 } },
  ]);
  const b = A.rentBlock(ab, t.id);
  assert.deepEqual(b.rows.map((r) => r.monthly), [4250, 4377.5, 2250]);
  assert.deepEqual(b.rows.map((r) => r.months), [12, 12, 6]);
  assert.deepEqual(b.rows.map((r) => r.total), [51000, 52530, 13500]);
  assert.deepEqual(b.rows.map((r) => r.annualPsf), [4.25, 4.3775, 2.25]);
  assert.equal(b.total.months, 30);
  assert.equal(b.total.total, 117030);
  assert.equal(b.total.weighted, 3.901, '117030 / 2.5 years / 12,000 SF');
  // one unresolved row: no total at all
  A.addStep(ab, t.id, { mFrom: 1, mTo: 12, raw: { year: 1 } });
  assert.equal(A.rentBlock(ab, t.id).total, null);
  assert.equal(A.rentBlock(ab, t.id).rows.at(-1).from, null);
  // no rent typed: null monthly, never 0
  const bare = withSteps([{ from: '2027-01-01', to: '2027-12-31' }]);
  const r = A.rentBlock(bare.ab, bare.t.id).rows[0];
  assert.equal(r.monthly, null);
  assert.equal(r.total, null);
  assert.equal(r.reason, 'no rent typed');
  // psf with no square feet
  const nosf = fresh();
  const tt = A.addTerm(nosf, { kind: 'initial' }).term;
  A.addStep(nosf, tt.id, { from: '2027-01-01', to: '2027-12-31', primary: 'psf_year', basis: 'rentable', amounts: { psf_year: 4 } });
  assert.equal(A.rentBlock(nosf, tt.id).rows[0].monthly, null);
  assert.equal(A.rentBlock(nosf, tt.id).rows[0].reason, 'needs the square feet');
});

test('asLease feeds lease.js only: the steps of one term as periods, undated steps left out', () => {
  const { ab, t } = withSteps([{ from: '2027-01-01', to: '2027-12-31', raw: { year: 51000 } }, { mFrom: 13, mTo: 24, raw: { year: 52000 } }]);
  A.setValue(ab, 'commencement', '2027-01-01');
  const L = A.asLease(ab, t.id);
  assert.equal(L.sf, 12000);
  assert.equal(L.leaseStart, '2027-01-01');
  assert.deepEqual(L.periods.map((p) => [p.start, p.end, p.rate, p.unit]), [['2027-01-01', '2027-12-31', 51000, 'year']]);
  assert.deepEqual(L.abatements, []);
});

test('canUse: found or not-found, ticked, no failing check, a real date for a relative date, resolved steps', () => {
  const ab = fresh();
  assert.equal(A.canUse(ab, 'deposit'), false, 'unread');
  A.setValue(ab, 'deposit', 5000);
  assert.equal(A.canUse(ab, 'deposit'), false, 'not ticked');
  A.setChecked(ab, 'deposit', true);
  assert.equal(A.canUse(ab, 'deposit'), true);
  A.setNotFound(ab, 'tradeName'); A.setChecked(ab, 'tradeName', true);
  assert.equal(A.canUse(ab, 'tradeName'), true, 'not found and ticked');
  A.setAmbiguous(ab, 'suite', 'why'); assert.equal(A.canUse(ab, 'suite'), false);
  A.setValue(ab, 'commencement', null, { rel: 'on delivery' });
  assert.ok(A.setChecked(ab, 'commencement', true).error, 'a failing check blocks the tick');
  ab.fields.commencement.checked = NOW; // forced, as an old save might hold it
  assert.equal(A.canUse(ab, 'commencement'), false, 'a relative date with no real date');
  A.setValue(ab, 'commencement', '2027-01-01', { rel: 'on delivery' });
  A.setChecked(ab, 'commencement', true);
  assert.equal(A.canUse(ab, 'commencement'), true);
  A.setNotFound(ab, 'expiration'); A.setChecked(ab, 'expiration', true);
  assert.equal(A.canUse(ab, 'expiration'), false, 'a date that is not in the lease has nothing to use');
  // a failing check blocks
  A.setValue(ab, 'capPct', 150);
  ab.fields.capPct.checked = NOW;
  assert.equal(A.canUse(ab, 'capPct'), false);
  assert.ok(A.setChecked(ab, 'capPct', true).error);
  // a step needs its dates and a monthly amount
  const { ab: ab2 } = withSteps([{ from: '2027-01-01', to: '2027-12-31', raw: { year: 51000 } }, { mFrom: 13, mTo: 24, raw: { year: 52000 } }]);
  const [s1, s2] = ab2.steps.map((s) => `step:${s.id}`);
  A.setChecked(ab2, s1, true); A.setChecked(ab2, s2, true);
  assert.equal(A.canUse(ab2, s1), true);
  assert.equal(A.canUse(ab2, s2), false, 'its dates are unresolved');
  A.setStep(ab2, ab2.steps[0].id, { amounts: { year: null } });
  assert.equal(A.canUse(ab2, s1), false, 'and not while its rent is gone');
});

test('progress and flags count the same things the screens show', () => {
  const ab = fresh();
  const p0 = A.progress(ab);
  assert.equal(p0.checked, 0);
  assert.equal(p0.total, FX.FIELDS.filter((f) => !f.optional).length);
  A.setValue(ab, 'deposit', 1); A.setChecked(ab, 'deposit', true);
  A.addTerm(ab);
  assert.equal(A.progress(ab).checked, 1);
  assert.equal(A.progress(ab).total, p0.total + 1);
  assert.ok(!A.flagLines(ab).includes('Security deposit: not checked'));
  assert.ok(A.flagLines(ab).includes('Tenant: not yet abstracted'));
  A.addFlag(ab, 'Ask about parking');
  assert.equal(A.flagLines(ab)[0], 'Ask about parking', 'the broker’s own flags come first');
  A.setValue(ab, 'landlord', 'Example Holdings LLC');
  assert.ok(A.flagLines(ab).includes('Landlord: not checked'));
});

/* ------------------------------------------------------------ History: an empty list is no edit */
test('an empty abstract list is bookkeeping for History; a real abstract is not', () => {
  assert.equal(emptyAbstracts(A.newAbstracts()), true);
  assert.equal(emptyAbstracts({ v: 1, items: [] }), true);
  assert.equal(emptyAbstracts({ v: 1, items: [{ id: 'x' }] }), false);
  assert.equal(emptyAbstracts(undefined), false);
  assert.ok(!('abstracts' in recordable({ id: 'd', abstracts: { v: 1, items: [] } })));
  assert.ok('abstracts' in recordable({ id: 'd', abstracts: { v: 1, items: [fresh()] } }));
});

/* ------------------------------------------------------------ properties */
test('property: rentBlock totals equal toCents of the sum of monthly x months, and a missing input never gives a number', () => {
  const amt = fc.option(fc.double({ min: 0, max: 200000, noNaN: true }), { nil: null });
  fc.assert(fc.property(fc.array(fc.record({ month: amt, year: amt, months: fc.integer({ min: 1, max: 60 }), primary: fc.constantFrom('month', 'year', null) }), { minLength: 1, maxLength: 8 }), (rows) => {
    const ab = fresh();
    const t = A.addTerm(ab, { kind: 'initial' }).term;
    let start = '2027-01-01';
    for (const r of rows) {
      const s = A.addStep(ab, t.id, { mFrom: 1, mTo: r.months, primary: r.primary, amounts: { month: r.month, year: r.year } }).step;
      s.from = start; s.to = `${2027 + Math.floor(r.months / 12)}-01-01`; // dates are not read by the block when months are given
    }
    const b = A.rentBlock(ab, t.id);
    let sum = 0; let complete = true;
    b.rows.forEach((row, i) => {
      const r = rows[i];
      const a = r.primary ? ab.steps[i].amounts[r.primary] : null;
      if (a === null || a === undefined) { assert.equal(row.monthly, null); assert.equal(row.total, null); complete = false; return; }
      const monthly = toCents(r.primary === 'year' ? a / 12 : a);
      assert.equal(row.monthly, monthly);
      assert.equal(row.total, toCents(monthly * r.months));
      sum += row.total;
    });
    if (complete) assert.equal(b.total.total, toCents(sum)); else assert.equal(b.total, null);
  }), { numRuns: 200 });
});

test('property: normAbstracts is idempotent on random JSON, and never lets a found value through unread', () => {
  const json = fc.letrec((tie) => ({
    v: fc.oneof({ depthSize: 'small' }, fc.constant(null), fc.boolean(), fc.double(), fc.string({ maxLength: 12 }), fc.constantFrom('found', 'unread', 'not-found', 'ambiguous', 'rentable', 'year', '2027-01-01', 'deposit', 'tenant', 'terms'),
      fc.array(tie('v'), { maxLength: 3 }), fc.dictionary(fc.constantFrom('items', 'fields', 'deposit', 'tenant', 'sf', 'value', 'status', 'steps', 'terms', 'amounts', 'id', 'term', 'unit', 'basis', 'src', 'page', 'quote', 'checked', 'note', 'rel', 'commencement', 'primary', 'month', 'year'), tie('v'), { maxKeys: 6 })),
  })).v;
  fc.assert(fc.property(json, fc.array(json, { maxLength: 3 }), (a, items) => {
    const once = A.normAbstracts({ items: [a, { fields: { deposit: a, tenant: a, sf: a, commencement: a }, steps: [a], terms: [a], options: [a], clauses: [a] }, ...items] });
    assert.deepEqual(A.normAbstracts(once), once);
    for (const ab of once.items) for (const r of Object.values(ab.fields)) {
      if (r.status === 'found') assert.ok(r.value !== null || r.rel, 'found always holds a value or the lease’s words');
      if (r.status !== 'found' && r.status !== 'ambiguous') assert.equal(r.value, null);
    }
  }), { numRuns: 300 });
});

test('R2 compares only when the step’s $/SF is on the rentable basis the area is measured on', () => {
  const mk = (stepBasis) => withSteps([{ from: '2027-01-01', to: '2027-12-31', raw: { year: 51000, psf_year: 5.1 } }], { sfBasis: 'rentable', stepBasis }).ab;
  const usable = mk('usable');
  assert.ok(!has(usable, /annual and \$\/SF disagree/), 'a rate per usable SF is not compared to rent over rentable SF');
  assert.ok(has(usable, /not compared, the square-foot basis differs/, 'warn'));
  A.setChecked(usable, `step:${usable.steps[0].id}`, true);
  assert.ok(usable.steps[0].checked, 'and it can be ticked');
  assert.ok(has(mk('rentable'), /annual and \$\/SF disagree/, 'fail'), 'on the same basis a real difference still fails');
});

test('a hostile backup’s tick on an ambiguous or unread item is dropped, so the counts are right', () => {
  const ab = A.normAbstracts({ items: [{ id: 'ab_1', fields: {
    suite: { status: 'ambiguous', value: 'x', note: 'why', checked: '2026-10-31T10:00:00Z' }, floor: { status: 'unread', checked: '2026-10-31T10:00:00Z' },
    tenant: { status: 'found', value: 'Example', checked: '2026-10-31T10:00:00Z' } },
  terms: [{ id: 't1', status: 'ambiguous', note: 'n', checked: '2026-10-31T10:00:00Z' }] }] }).items[0];
  assert.equal(ab.fields.suite.checked, false);
  assert.equal(ab.fields.floor.checked, false);
  assert.equal(ab.terms[0].checked, false);
  assert.equal(ab.fields.tenant.checked, '2026-10-31T10:00:00Z');
  assert.equal(A.progress(ab).checked, 1);
});

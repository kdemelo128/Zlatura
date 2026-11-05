/* Staging and keeping what the lease reader found (app/leasestage.js): the reader never overwrites a typed or ticked value, never
 * ticks, a newer document by effective date beats a newer file (any order of documents gives the same result), a rent row that
 * fails L1's arithmetic becomes ambiguous with both figures, and one keep is one change. Invented fixtures only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const A = await import('../app/abstracts.js');
const S = await import('../app/leasestage.js');
const R = await import('../app/leaseread.js');
const D = await import('../app/dd.js');
const { F1, F2, F3 } = await import('./lease-fixtures.js');

const NOW = '2026-11-04T10:00:00.000Z';
const LEASE = { id: 'dd_lease', name: 'Larkspur lease.pdf', type: 'lease' };
const AMEND = { id: 'dd_am1', name: 'First amendment.pdf', type: 'amendment', asOf: '2032-03-01' };
const fresh = () => A.newAbstract({ title: 'Example', docs: [LEASE.id], now: NOW });
const result = (pages, o) => R.readLease(R.pageModel(pages), o);
/** Read, stage and keep everything selected. */
function run(ab, pages, doc, { docs = [LEASE, AMEND], select = null } = {}) {
  const res = result(pages);
  const effective = res.effective && res.effective.iso;
  const rows = S.stageInto(ab, res, { doc, effective, docs });
  if (select) select(rows);
  const out = S.keepStaged(ab, rows, { doc, effective, docs, now: NOW });
  return { res, rows, ...out };
}
const rec = (ab, key) => ab.fields[key];
const everyItem = (ab) => [...Object.values(ab.fields), ...ab.terms, ...ab.steps, ...ab.options, ...ab.clauses];

test('keeping a read lease fills the fields as the reader’s: by reader, its confidence, page and quote, unticked, and the abstract stays clean', () => {
  const ab = fresh();
  const { kept, rows, skipped } = run(ab, F1, LEASE);
  assert.deepEqual(skipped, []);
  assert.ok(kept >= 15);
  const t = rec(ab, 'tenant');
  assert.deepEqual([t.value, t.status, t.by, t.confidence, t.checked], ['Tidewater Bakery Inc.', 'found', 'reader', 'high', false]);
  assert.equal(t.src[0].doc, LEASE.id); assert.equal(t.src[0].page, 1); assert.equal(t.src[0].reader, 'pdftext@1'); assert.match(t.src[0].quote, /Tidewater Bakery Inc\./);
  assert.ok(t.src[0].start >= 0 && t.src[0].len === t.src[0].quote.length);
  assert.equal(rec(ab, 'deposit').value, 0); assert.equal(rec(ab, 'deposit').unit, 'total');
  assert.equal(rec(ab, 'termMonths').value, 60);
  assert.equal(rec(ab, 'commencement').value, null); assert.match(rec(ab, 'commencement').rel, /^90 days after/); assert.equal(rec(ab, 'commencement').status, 'found');
  const sf = rec(ab, 'sf');
  assert.deepEqual([sf.status, sf.value], ['ambiguous', null]); assert.match(sf.note, /3300.*3400/);
  assert.equal(sf.by, 'reader'); assert.ok(sf.note.trim(), 'an ambiguous item carries the note R12 needs');
  assert.equal(rec(ab, 'guarantor'), undefined, 'a not-found row is not selected, so it writes nothing');
  assert.equal(ab.terms.length, 1); assert.equal(ab.terms[0].kind, 'initial'); assert.equal(ab.steps.length, 3);
  assert.deepEqual(ab.steps.map((s) => [s.label, s.amounts.month, s.amounts.year, s.amounts.psf_year, s.primary, s.basis, s.mFrom, s.from]), [['Year 1', 4250, 51000, 15, null, 'rentable', null, null], ['Year 2', 4335, 52020, 15.3, null, 'rentable', null, null], ['Year 3', 4421.7, 53060.4, 15.61, null, 'rentable', null, null]]);
  assert.ok(ab.steps.every((s) => s.by === 'reader' && s.status === 'found' && s.src[0].page === 3));
  assert.ok(everyItem(ab).every((x) => x.checked === false), 'keeping never ticks');
  assert.equal(A.progress(ab).checked, 0);
  assert.deepEqual(A.normAbstracts({ v: 1, items: [ab] }).items[0], ab, 'what is kept survives the normaliser unchanged');
  assert.ok(rows.filter((r) => r.kind === 'field').every((r) => r.effect === 'fills'));
  assert.ok(rows.filter((r) => r.status === 'not-found').every((r) => r.selected === false), 'not-found rows are not pre-selected');
});

test('a value the broker typed is never overwritten: a different one is staged "kept as a flag", the same one adds a page', () => {
  const ab = fresh();
  A.setValue(ab, 'tenant', 'Another Tenant LLC', { now: NOW });
  A.setValue(ab, 'suite', '210', { now: NOW });
  const res = result(F1);
  const rows = S.stageInto(ab, res, { doc: LEASE, docs: [LEASE] });
  const tenant = rows.find((r) => r.key === 'tenant'); const suite = rows.find((r) => r.key === 'suite');
  assert.deepEqual([tenant.effect, tenant.selected, tenant.effectText], ['differs', false, 'Differs from your typed value: kept as a flag']);
  assert.deepEqual([suite.effect, suite.selected, suite.effectText], ['adds', true, 'Adds a page to your typed value']);
  S.keepStaged(ab, rows, { doc: LEASE, docs: [LEASE], now: NOW });
  assert.equal(rec(ab, 'tenant').value, 'Another Tenant LLC'); assert.equal(rec(ab, 'tenant').by, 'broker'); assert.equal(ab.flags.length, 0);
  assert.equal(rec(ab, 'suite').by, 'broker'); assert.equal(rec(ab, 'suite').src.length, 2, 'the pages were added'); assert.equal(rec(ab, 'suite').src[0].reader, 'pdftext@1');
  tenant.selected = true;
  S.keepStaged(ab, [tenant], { doc: LEASE, docs: [LEASE], now: NOW });
  assert.equal(rec(ab, 'tenant').value, 'Another Tenant LLC', 'still the broker’s');
  assert.match(ab.flags[0].text, /Larkspur lease\.pdf.*Tenant is Tidewater Bakery Inc\., p\.1; the abstract has Another Tenant LLC/);
});

test('a ticked value is never overwritten, even one the reader wrote, and a tick survives an added page', () => {
  const ab = fresh();
  run(ab, F1, LEASE);
  A.setChecked(ab, 'tenant', true, { now: NOW });
  const before = JSON.stringify(rec(ab, 'tenant'));
  const am = [...F3]; am[0] = am[0].replace('Tidewater Bakery Inc. (“Tenant”)', 'Tidewater Bakery LLC (“Tenant”)');
  const res = { ...result(F3), cands: [{ ...result(F2).cands.find((c) => c.key === 'tenant'), sources: undefined }] };
  const rows = S.stageInto(ab, { ...res, docType: 'amendment', terms: [], steps: [], flags: [] }, { doc: AMEND, effective: '2032-03-01', docs: [LEASE, AMEND] });
  assert.equal(rows[0].effect, 'differs');
  S.keepStaged(ab, rows.map((r) => ({ ...r, selected: false })), { doc: AMEND, effective: '2032-03-01', docs: [LEASE, AMEND], now: NOW });
  assert.equal(JSON.stringify(rec(ab, 'tenant')), before, 'unselected rows change nothing');
  assert.ok(rec(ab, 'tenant').checked);
});

test('reading the same document twice adds nothing: every row is "already", and no step is added a second time', () => {
  const ab = fresh();
  run(ab, F1, LEASE);
  const snap = JSON.stringify(ab);
  const again = run(ab, F1, LEASE);
  assert.equal(again.kept, 0);
  assert.ok(again.rows.filter((r) => r.kind !== 'flag' && r.status !== 'not-found').every((r) => ['already', 'none'].includes(r.effect)), JSON.stringify(again.rows.map((r) => [r.label, r.effect])));
  assert.equal(JSON.stringify(ab), snap);
  assert.equal(ab.steps.length, 3);
});

test('rent steps are not added to an abstract that already has the original term’s steps (nothing counted twice)', () => {
  const ab = fresh();
  const t = A.addTerm(ab, { kind: 'initial' }).term;
  A.addStep(ab, t.id, { label: 'Year 1', primary: 'month', amounts: { month: 1 } });
  const { rows } = run(ab, F1, LEASE);
  const term = rows.find((r) => r.kind === 'term');
  assert.deepEqual([term.effect, term.canKeep], ['none', false]); assert.match(term.effectText, /nothing is counted twice/);
  assert.equal(ab.steps.length, 1);
});

test('an amendment: a new superseding term with its effective date, its rent, and the free rent as a flag; no months are counted from the lease’s rent commencement', () => {
  const ab = fresh();
  run(ab, F1, LEASE);
  const { rows, kept } = run(ab, F3, AMEND);
  const ext = ab.terms.find((x) => x.kind === 'extension');
  assert.deepEqual([ext.supersedes, ext.doc, ext.effective, ext.by, ext.status], [true, AMEND.id, '2032-03-01', 'reader', 'found']);
  const mine = ab.steps.filter((s) => s.term === ext.id);
  assert.equal(mine.length, 7); assert.ok(mine.every((s) => s.mFrom === null && s.mTo === null), 'Months n-m of an extension are not counted from the original rent commencement');
  assert.deepEqual(mine[0].label, 'Months 4-12');
  assert.ok(ab.flags.some((f) => /^Rent abated in months 1-3/.test(f.text)));
  assert.equal(ab.terms.find((x) => x.kind === 'initial').supersededBy, null);
  assert.ok(kept > 8 && rows.some((r) => r.effect === 'fills'));
  // the expiration: the original lease said a relative date, the amendment a real one and it is newer
  const ex = rec(ab, 'expiration');
  assert.deepEqual([ex.value, ex.rel, ex.src[0].doc], ['2037-02-28', '', AMEND.id]);
  assert.match(ex.note, /The original lease said “the last day of the sixtieth/);
  assert.equal(ex.checked, false);
});

test('a newer document by effective date beats a newer file: any order of documents gives the same fields', () => {
  const am2 = [F3[0].replace('February 28, 2037', 'February 28, 2042').replace('March 1, 2032', 'March 1, 2035')];
  const AMEND2 = { id: 'dd_am2', name: 'Second amendment.pdf', type: 'amendment', asOf: '2035-03-01' };
  const docs = [LEASE, AMEND, AMEND2];
  const inputs = { [LEASE.id]: [F1, LEASE], [AMEND.id]: [F3, AMEND], [AMEND2.id]: [am2, AMEND2] };
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]].map((p) => p.map((i) => docs[i].id));
  const outcome = (order) => {
    const ab = fresh();
    for (const id of order) run(ab, inputs[id][0], inputs[id][1], { docs });
    const f = (k) => { const r = rec(ab, k); return r && [r.value, r.rel, r.status]; };
    return JSON.stringify([...['expiration', 'tenant', 'suite', 'termMonths', 'deposit', 'leaseDate'].map(f), rec(ab, 'expiration').src[0].doc]);
  };
  const first = outcome(perms[0]);
  assert.match(first, /"2042-02-28"/, 'the latest effective date wins');
  fc.assert(fc.property(fc.constantFrom(...perms), (order) => outcome(order) === first), { numRuns: 30 });
});

test('a rent row that fails L1’s arithmetic becomes ambiguous with both figures and a note naming both; "Use the monthly figure" is the broker’s, with the other cleared', () => {
  const ab = fresh();
  const { rows } = run(ab, F3, AMEND, { docs: [AMEND] });
  const bad = rows.find((r) => r.kind === 'step' && r.label === 'Months 37-48');
  assert.equal(bad.status, 'ambiguous');
  assert.equal(bad.cand.note, '$5,306.04 a month × 12 = $63,672.48, but the lease says $63,722.48 a year, p.1');
  assert.deepEqual([bad.cand.amounts.month, bad.cand.amounts.year, bad.cand.primary], [5306.04, 63722.48, null]);
  assert.deepEqual(bad.choices.options.map((o) => o.label), ['Use the monthly figure', 'Use the annual figure']);
  assert.ok(rows.filter((r) => r.kind === 'step' && r.label !== 'Months 37-48').every((r) => r.status === 'found'), 'the other rows pass');
  const step = ab.steps.find((s) => s.label === 'Months 37-48');
  assert.equal(step.status, 'ambiguous'); assert.equal(step.by, 'reader');
  assert.equal(step.note, bad.cand.note);
  assert.ok(A.checkAbstract(ab).some((c) => c.key === `step:${step.id}` && /monthly and annual disagree/.test(c.text)), 'L1’s own check still names it');
  assert.equal(S.useFigure(ab, step.id, 'month').ok, true);
  assert.deepEqual([step.amounts.month, step.amounts.year, step.primary, step.status, step.by], [5306.04, null, 'month', 'found', 'broker']);
  assert.deepEqual(S.useFigure(ab, step.id, 'year'), { error: 'That figure is not on the step.' });
});

test('annual rent against $/SF is L1’s check too: a $/SF that does not match the typed square feet becomes ambiguous', () => {
  const pages = [...F1]; pages[2] = pages[2].replace('$15.30', '$15.40');
  const ab = fresh();
  A.setValue(ab, 'sf', 3400, { basis: 'rentable', now: NOW });
  const { rows } = run(ab, pages, LEASE);
  const y2 = rows.find((r) => r.label === 'Year 2');
  assert.equal(y2.status, 'ambiguous'); assert.match(y2.cand.note, /\$52,020\.00 a year ÷ 3,400 SF = \$15\.30 a SF, but the lease says \$15\.40 a SF, p\.3/);
  assert.deepEqual(y2.choices.options.map((o) => o.keep), ['year', 'psf_year']);
  assert.equal(rows.find((r) => r.label === 'Year 1').status, 'found');
});

test('an amendment with no effective date layers nothing: every value is ambiguous and says to type the date; its rent is not added', () => {
  const ab = fresh();
  const am = [F3[0].replace('This Amendment is effective as of March 1, 2032.', 'This Amendment is signed.')];
  const { rows, res } = run(ab, am, AMEND);
  assert.equal(res.effective.iso, null);
  const exp = rows.find((r) => r.key === 'expiration');
  assert.equal(exp.status, 'ambiguous'); assert.match(exp.cand.note, /Type the amendment’s effective date to apply it\. It says 02\/28\/2037, p\.1/);
  assert.equal(rec(ab, 'expiration').status, 'ambiguous'); assert.equal(rec(ab, 'expiration').value, null);
  const term = rows.find((r) => r.kind === 'term');
  assert.deepEqual([term.effect, term.canKeep], ['none', false]); assert.equal(ab.steps.length, 0);
});

test('earlier steps whose dates an amendment’s dated rows overlap are marked superseded and kept', () => {
  const ab = fresh();
  const t = A.addTerm(ab, { kind: 'initial' }).term;
  A.addStep(ab, t.id, { label: 'Y1', from: '2031-03-01', to: '2032-02-29', primary: 'month', amounts: { month: 1000 } });
  A.addStep(ab, t.id, { label: 'Y2', from: '2032-03-01', to: '2033-02-28', primary: 'month', amounts: { month: 1030 } });
  A.addStep(ab, t.id, { label: 'Y3', from: '2033-03-01', to: '2034-02-28', primary: 'month', amounts: { month: 1060 } });
  const pages = [lineDoc(['FIRST AMENDMENT TO LEASE', 'This Amendment is effective as of March 1, 2032.', '1. EXTENSION. The term is extended. The new base rent is:', '', '   Period                        Monthly Rent', '   03/01/2032 - 02/28/2033       $2,000.00', 'Landlord and Tenant.'])];
  run(ab, pages, AMEND);
  assert.deepEqual(ab.steps.slice(0, 3).map((s) => s.supersededBy), [null, AMEND.id, null], 'only the step the new row overlaps');
  assert.equal(ab.steps.length, 4);
  assert.deepEqual(A.normAbstracts({ v: 1, items: [ab] }).items[0].steps.map((s) => s.supersededBy), [null, AMEND.id, null, null]);
});
const lineDoc = (l) => l.join('\n');

test('a not-found row writes "not in the lease" as the broker’s only when selected; an older document is only noted', () => {
  const ab = fresh();
  const res = result(F2);
  const rows = S.stageInto(ab, res, { doc: LEASE, docs: [LEASE] });
  const g = rows.find((r) => r.key === 'guarantor');
  assert.deepEqual([g.status, g.selected, g.effect], ['not-found', false, 'fills']);
  g.selected = true;
  S.keepStaged(ab, [g], { doc: LEASE, docs: [LEASE], now: NOW });
  assert.deepEqual([rec(ab, 'guarantor').status, rec(ab, 'guarantor').value, rec(ab, 'guarantor').by], ['not-found', null, 'broker']);
  assert.match(rec(ab, 'guarantor').note, /^Not found in pages 1–3/);
});

test('the staged summary says what was read, how, and what is left to the broker', () => {
  const ab = fresh();
  const res = result(F2);
  const rows = S.stageInto(ab, res, { doc: LEASE, docs: [LEASE] });
  assert.match(S.summarise(res, rows), /^Read 3 pages \(0 by OCR\)\. \d+ found, 2 need your choice, \d+ not found\.$/);
  const ocr = R.readLease(R.pageModel(['', ''], { ocr: { 1: { text: F2[0], conf: 60 }, 2: { text: F2[1], conf: 95 } } }));
  assert.match(S.summarise(ocr, S.stageInto(ab, ocr, { doc: LEASE, docs: [LEASE] })), /^Read 2 pages \(2 by OCR; page 1 read poorly\)\./);
});

test('markRead records the lease reader on the Doc, and a Doc with the reader "lease" and target "abstracts" survives the registry', () => {
  const dd = D.newDd();
  const { doc } = D.addDoc(dd, { name: 'Larkspur lease.pdf', kind: 'pdf', size: 100, sha256: 'a'.repeat(64), type: 'lease' });
  assert.equal(D.markRead(dd, doc.id, { reader: 'lease', target: 'abstracts', checks: { pass: 3, warn: 1, fail: 0 } }, { now: NOW }), true);
  assert.deepEqual(dd.docs[0].read, { reader: 'lease', at: NOW, target: 'abstracts', checks: { pass: 3, warn: 1, fail: 0 } });
  assert.equal(dd.docs[0].status, 'read');
  assert.deepEqual(D.normDd(JSON.parse(JSON.stringify(dd))).docs[0].read, dd.docs[0].read, 'the registry keeps it');
  assert.equal(D.markRead(dd, 'nope', { reader: 'lease', target: 'abstracts', checks: {} }), false);
});

/* ------------------------------------------------------------ designer review: a superseded step is not counted */
const datedAb = () => {
  const ab = fresh();
  const t = A.addTerm(ab, { kind: 'initial' }).term;
  A.addStep(ab, t.id, { label: 'Y1', from: '2031-03-01', to: '2032-02-29', primary: 'month', amounts: { month: 1000 } });
  A.addStep(ab, t.id, { label: 'Y2', from: '2032-03-01', to: '2033-02-28', primary: 'month', amounts: { month: 1030 } });
  A.addStep(ab, t.id, { label: 'Y3', from: '2033-03-01', to: '2034-02-28', primary: 'month', amounts: { month: 1060 } });
  return { ab, t };
};
const amendPage = (row) => [lineDoc(['FIRST AMENDMENT TO LEASE', '', 'This Amendment is effective as of March 1, 2032, between Larkspur Holdings LLC (“Landlord”) and Tidewater Bakery Inc. (“Tenant”).', '', 'The parties agree that the Lease is amended as set out in this Amendment and the other terms continue unchanged.', '', '1. EXTENSION. The term is extended. The new base rent is:', '', '   Period                        Monthly Rent', row, '', 'Landlord and Tenant have signed.'])];

test('a superseded step is shown but left out of the term total, the annual rate and the next-date list', () => {
  const { ab, t } = datedAb();
  const full = A.rentBlock(ab, t.id).total;
  run(ab, amendPage('   03/01/2032 - 02/28/2033       $2,000.00'), AMEND);
  const b = A.rentBlock(ab, t.id);
  assert.equal(b.rows.length, 3, 'all three are still listed');
  assert.deepEqual(b.rows.map((r) => r.superseded), [false, true, false]);
  assert.equal(b.rows[1].total, null); assert.equal(b.rows[1].annualPsf, null);
  assert.equal(b.total.months, full.months - 12);
  assert.equal(b.total.total, Math.round((1000 * 12 + 1060 * 12) * 100) / 100, '12 months of Y1 and of Y3 only: Y2 is not counted');
  assert.deepEqual(A.checkAbstract(ab).filter((c) => /overlap/i.test(c.text)), [], 'the replaced step is not in force, so it does not overlap the new one');
});

test('exports leave a superseded step out of every total: the CSV says so, the print view shows "superseded", the workbook months stay text', async () => {
  const X = await import('../app/abstractexport.js');
  const { ab, t } = datedAb();
  run(ab, amendPage('   03/01/2032 - 02/28/2033       $2,000.00'), AMEND);
  const csv = X.abstractCsv({ name: 'Invented', figures: {}, dd: { docs: [LEASE, AMEND] } }, [ab]);
  assert.match(csv, /Y2 \(superseded, not counted\)/); assert.doesNotMatch(csv, /Y1 \(superseded/);
  const rows = A.rentBlock(ab, t.id).rows;
  assert.equal(rows.filter((r) => r.superseded).length, 1);
  assert.equal(X.currentRent({ ...ab, asOf: '2032-06-01' }), 2000, 'the new rent is current, not the replaced 1030');
  const pass = X.nextCritical({ ...ab, asOf: '2032-01-01' }, '2032-01-01');
  assert.ok(!pass || pass.date !== '2032-03-01' || !/Y2/.test(pass.what), 'a replaced step does not start anything');
});

test('a partial overlap does not supersede the whole old step: it is kept, marked for the broker, with a flag', () => {
  const { ab } = datedAb();
  ab.steps[1].by = 'reader'; // a step a reader wrote is marked; one the broker typed only gets the flag
  run(ab, amendPage('   06/01/2032 - 02/28/2033       $2,000.00'), AMEND);
  assert.deepEqual(ab.steps.slice(0, 3).map((s) => s.supersededBy), [null, null, null], 'nothing replaced whole');
  assert.equal(ab.steps[1].status, 'ambiguous'); assert.match(ab.steps[1].note, /Partly overlapped/);
  assert.ok(ab.flags.some((f) => /overlaps only part of “Y2”/.test(f.text)));
});

test('an amendment rent given in months supersedes nothing and says so in a flag', () => {
  const { ab } = datedAb();
  run(ab, F3, AMEND);
  assert.ok(ab.steps.slice(0, 3).every((s) => !s.supersededBy));
  assert.ok(ab.flags.some((f) => /gives its rent in months, not dates/.test(f.text)));
});

test('a value replaced from an older amendment says which document said it, not "the original lease"', () => {
  const AM2 = { id: 'dd_am2', name: 'Second amendment.pdf', type: 'amendment', asOf: '2033-01-01' };
  const ab = fresh();
  run(ab, F1, LEASE);
  run(ab, F3, AMEND);
  const exp = (s) => [lineDoc(['SECOND AMENDMENT TO OFFICE LEASE', '', 'This Second Amendment is effective as of January 1, 2033, between Larkspur Holdings LLC (“Landlord”) and Tidewater Bakery Inc. (“Tenant”).', '', 'The parties agree that the Lease is amended as set out in this Amendment and all other terms continue unchanged.', '', `1. TERM. The term expires on ${s}.`, '', 'Landlord and Tenant have signed.'])];
  run(ab, exp('August 31, 2040'), AM2, { docs: [LEASE, AMEND, AM2] });
  assert.match(ab.fields.expiration.note, /‘First amendment\.pdf’ said 02\/28\/2037/);
  assert.doesNotMatch(ab.fields.expiration.note, /The original lease said 2037/);
});

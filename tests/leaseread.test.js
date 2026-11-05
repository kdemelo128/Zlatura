/* The lease reader (app/leaseread.js): each reader on invented layouts (tests/lease-fixtures.js) against hand-written expected
 * abstracts (tests/fixtures/abstract-read-n.json), the ambiguous cases, relative dates, quotes that check out, OCR noise that
 * never turns into a wrong number, and a PDF round trip through pdf.js. Invented names and figures only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as R from '../app/leaseread.js';
import { verifyQuote, squash } from '../app/reconcile.js';
import { F1, F2, F3, F4, F6_LEASE, F6_SUMMARY, PLANTED, noisy } from './lease-fixtures.js';
import { allLeasePdfs } from './tools/leasepdfs.mjs';
import { pdfPages } from '../app/pdftext.js';

const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;
const FX = [null, F1, F2, F3, F4];
const expected = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/abstract-read-${n}.json`, import.meta.url), 'utf8'));
const read = (pages, o) => R.readLease(R.pageModel(pages), o);
/** An ad-hoc snippet, read as a lease (its type is not what these tests are about). */
const lease = (pages, o) => R.readLease(R.pageModel(pages), { as: 'lease', ...o });
const cand = (res, key) => res.cands.find((c) => c.key === key);
const lines = (...l) => l.join('\n');

/* ------------------------------------------------------------ the layouts against the hand-written abstracts */
function holds(res, want, label) {
  assert.equal(res.docType, want.docType, `${label}: type`);
  assert.deepEqual(res.cands.map((c) => c.key).sort(), Object.keys(want.fields).sort(), `${label}: the fields read`);
  for (const [key, w] of Object.entries(want.fields)) {
    const c = cand(res, key);
    assert.equal(c.status, w.status, `${label} ${key}: status`);
    assert.equal(c.value, w.value, `${label} ${key}: value`);
    assert.equal(c.page, w.page, `${label} ${key}: page`);
    if (w.confidence) assert.equal(c.confidence, w.confidence, `${label} ${key}: confidence`);
    if (w.unit) assert.equal(c.unit, w.unit, `${label} ${key}: unit`);
    if (w.basis) assert.equal(c.basis, w.basis, `${label} ${key}: basis`);
    if (w.rel) assert.equal(c.rel, w.rel, `${label} ${key}: relative words`);
  }
  assert.deepEqual(res.terms.map((t) => ({ kind: t.kind, status: t.status, page: t.page, ...(t.supersedes ? { supersedes: true } : {}) })), want.terms, `${label}: terms`);
  assert.equal(res.steps.length, want.steps.length, `${label}: steps`);
  want.steps.forEach((w, i) => {
    const s = res.steps[i];
    assert.equal(s.label, w.label, `${label} step ${i}`);
    assert.deepEqual(s.amounts, w.amounts, `${label} ${w.label}: amounts`);
    assert.equal(s.primary, w.primary, `${label} ${w.label}: primary`);
    assert.equal(s.basis, w.basis, `${label} ${w.label}: basis`);
    assert.equal(s.status, w.status, `${label} ${w.label}: status`);
    assert.equal(s.page, w.page, `${label} ${w.label}: page`);
    assert.equal(s.mFrom, w.mFrom ?? null); assert.equal(s.mTo, w.mTo ?? null);
    assert.equal(s.from, null, 'a lease year gets no dates (decision 3)');
  });
  assert.deepEqual(res.flags.map((f) => f.text), want.flags, `${label}: flags`);
  if (want.effective) assert.equal(res.effective.iso, want.effective, `${label}: effective date`);
}
for (const n of [1, 2, 3, 4]) test(`F${n} reads to its hand-written expected abstract`, () => holds(read(FX[n]), expected(n), `F${n}`));

test('the same layouts as real PDFs (a text layer, one run a line and runs split mid-word) read to the same abstracts', async () => {
  const pdfs = allLeasePdfs();
  for (const [name, n] of [['lease-f1-dot.pdf', 1], ['lease-f2-paren.pdf', 2], ['lease-f3-amendment.pdf', 3], ['lease-f4-article.pdf', 4]]) {
    const pages = await pdfPages(pdfjs, pdfs[name].slice());
    assert.equal(pages.length, FX[n].length, name);
    holds(R.readLease(R.pageModel(pages)), expected(n), name);
  }
});

/* ------------------------------------------------------------ the page model */
test('pageModel: furniture is a line repeated at the edge of half the pages (digits squashed), or a lone number; it stays in the text but never matches', () => {
  const pages = R.pageModel(['Tenant name here\nSuite 999 premises leased\nbody one\nInitials: ___ 1\n1', 'body two\nSuite 999 premises leased\nInitials: ___ 2\n2', 'body three\nInitials: ___ 3\nSuite 999 premises leased\n3']);
  const furn = (p) => p.lines.filter((l) => l.furniture).map((l) => p.text.slice(l.s, l.e));
  assert.deepEqual(furn(pages[0]), ['Suite 999 premises leased', 'Initials: ___ 1', '1']);
  assert.deepEqual(furn(pages[2]), ['Initials: ___ 3', 'Suite 999 premises leased', '3']);
  assert.ok(pages[0].text.includes('Suite 999'), 'furniture stays in the text so offsets hold');
  assert.ok(!pages[0].clean.includes('Suite 999') && pages[0].clean.length === pages[0].text.length);
  const res = R.readLease(pages.map((p) => p), { as: 'lease' });
  assert.equal(cand(res, 'suite').status, 'not-found', 'a footer is never read');
});
test('pageModel: a rent row that repeats down a table is not furniture (a dollar figure is never a footer)', () => {
  const rows = ['Year 1   $1,000.00', 'Year 2   $1,000.00', 'Year 3   $1,000.00'];
  const pages = R.pageModel(rows.map((r, i) => lines('Rent', r, String(i + 1))));
  assert.ok(pages.every((p) => p.lines.some((l) => !l.furniture && p.text.slice(l.s, l.e).includes('$1,000.00'))));
});
test('pageModel: OCR pages carry their confidence, under 75 is poor; ligatures are written out and a hyphenated word is joined', () => {
  const pages = R.pageModel(['one', 'two', 'three'], { ocr: { 2: { text: 'second  ﬁrst\nsecu-\nrity deposit', conf: 74 }, 3: { text: 'x', conf: 75 } } });
  assert.deepEqual(pages.map((p) => [p.source, p.conf, p.poor]), [['pdftext', null, false], ['ocr', 74, true], ['ocr', 75, false]]);
  assert.equal(pages[1].text, 'second  first\nsecurity\n deposit');
  assert.deepEqual(R.pageInfo(pages).map((p) => p.n), [1, 2, 3]);
});
test('needsOcr: under 200 characters that are not spaces', () => {
  assert.equal(R.needsOcr(''), true);
  assert.equal(R.needsOcr('ab '.repeat(99)), true);
  assert.equal(R.needsOcr('ab '.repeat(100)), false);
});

/* ------------------------------------------------------------ amounts, units, dates */
test('readAmount: dollars to whole cents; a bare integer is not money; a letter in an amount is never repaired', () => {
  assert.deepEqual(R.readAmount('rent $4,250.00 a month'), { type: 'amount', value: 4250, token: '$4,250.00', index: 5, length: 9 });
  assert.equal(R.readAmount('about 4,250 feet'), null, 'no $ and no cents');
  assert.equal(R.readAmount('4,250.50 net').value, 4250.5);
  assert.equal(R.readAmount('pay $4250 now').value, 4250);
  assert.equal(R.readAmount('pay $1.234.56 now').type, 'bad');
  for (const t of ['$1,OOO.00', '$S,000.00', '$4,25O.00', '$l,000.00']) assert.equal(R.readAmount(`rent ${t} a month`).type, 'bad', t);
  assert.equal(R.readAmount('see $.'), null);
  assert.equal(R.readAmount('$0.10').value, 0.1);
});
test('unitFrom: a unit comes from the words only, a $/SF with no period word is unsure', () => {
  assert.deepEqual(R.unitFrom('per month'), { unit: 'month', basis: null });
  assert.deepEqual(R.unitFrom('Annual Base Rent'), { unit: 'year', basis: null });
  assert.deepEqual(R.unitFrom('/yr'), { unit: 'year', basis: null });
  assert.deepEqual(R.unitFrom('Annual Rent per RSF'), { unit: 'psf_year', basis: 'rentable' });
  assert.deepEqual(R.unitFrom('per usable square foot per month'), { unit: 'psf_month', basis: 'usable' });
  assert.deepEqual(R.unitFrom('Rent per RSF'), { unit: null, basis: 'rentable', unsure: true });
  assert.deepEqual(R.unitFrom('Rent'), { unit: null, basis: null });
  assert.equal(R.unitFrom('monthly per annum').unit, null, 'two period words: no unit');
});
test('readDate: numeric dates are month first; a first number over 12 asks; a two-digit year is flagged', () => {
  assert.equal(R.readDate('03/01/2027').iso, '2027-03-01');
  assert.equal(R.readDate('3/9/27').y2, true);
  const day = R.readDate('13/01/2027');
  assert.equal(day.type, 'ambiguous'); assert.match(day.why, /over 12/);
  assert.equal(R.readDate('02/30/2027').type, 'ambiguous', 'not a real day');
  assert.equal(R.readDate('on March 1, 2027').iso, '2027-03-01');
  assert.equal(R.readDate('Sept. 5, 2027').iso, '2027-09-05');
  assert.equal(R.readDate('the 5th day of September, 2027').iso, '2027-09-05');
  assert.equal(R.readDate('the fifteenth day of March, 2027').iso, '2027-03-15');
  assert.equal(R.readDate('the thirty-first day of December, 2027').iso, '2027-12-31');
  assert.equal(R.readDate('2027-04-09').iso, '2027-04-09');
});
test('readDate: "March 2027" is never a date, nor a date in words, and two different dates are not picked between', () => {
  for (const t of ['March 2027', 'Mar. 2027', 'in March, 2027']) { const d = R.readDate(t); assert.equal(d.type, 'ambiguous'); assert.match(d.why, /no day/, t); assert.equal(d.iso, undefined); }
  assert.equal(R.readDate('the fifteenth day of March, two thousand twenty seven').type, 'ambiguous');
  const two = R.readDate('March 1, 2027 or April 1, 2027');
  assert.equal(two.type, 'ambiguous'); assert.match(two.why, /more than one date/);
  assert.equal(R.readDate('no dates here'), null);
});
test('readDate: relative dates stay relative with the phrase as written, and are never resolved', () => {
  for (const t of ['90 days after the date Landlord delivers possession', 'ninety (90) days following delivery', 'the first day of the first full calendar month after delivery', 'the later of (a) March 1, 2027 and (b) 30 days after permits issue', 'the date Landlord delivers the Premises']) {
    const d = R.readDate(t);
    assert.equal(d.type, 'rel', t); assert.equal(d.iso, undefined); assert.ok(d.rel.length > 5 && d.rel.length <= 200);
  }
  assert.equal(R.readDate('March 1, 2027, or 90 days after delivery').type, 'ambiguous', 'a date then a relative date: nothing is chosen');
  assert.equal(R.readDate(`${'x '.repeat(200)}90 days after delivery`).rel.length <= 200, true);
});
test('wordsToNumber: words of a number, and nothing else', () => {
  assert.equal(R.wordsToNumber('five'), 5); assert.equal(R.wordsToNumber('Sixty-three'), 63); assert.equal(R.wordsToNumber('one hundred twenty'), 120); assert.equal(R.wordsToNumber('a term'), null); assert.equal(R.wordsToNumber(''), null);
});

/* ------------------------------------------------------------ headings, defined terms, basic terms, type */
test('findHeadings: dot, paren, article and recital styles, and a "2." inside a paragraph is dropped', () => {
  const styles = (pages) => [...new Set(R.findHeadings(R.pageModel(pages)).map((h) => h.style))];
  assert.deepEqual(styles(F1), ['dot']);
  assert.deepEqual(R.findHeadings(R.pageModel(F1)).map((h) => [h.num, h.title]).slice(0, 3), [[1, 'PREMISES'], [2, 'TERM'], [3, 'USE']]);
  assert.deepEqual(styles(F2), ['paren']);
  assert.deepEqual(styles(F3).sort(), ['dot', 'recital']);
  assert.deepEqual(styles(F4), ['article']);
  const stray = R.findHeadings(R.pageModel([lines('1. PREMISES. Leased.', 'The list: a)', '2. is an item in a list of things in a paragraph that continues', '2. TERM. Five years.', '9. LATE. later.')]));
  assert.deepEqual(stray.map((h) => h.num), [1, 2], 'only numbers that continue the sequence, 9 does not');
  assert.deepEqual(R.findHeadings(R.pageModel(['no headings here'])), [], 'no headings: one section');
});
test('findDefinedTerms: (the “Name”), "hereinafter referred to as", and basic-terms labels', () => {
  const t = R.findDefinedTerms(R.pageModel(F1));
  for (const k of ['Landlord', 'Tenant', 'Premises', 'Term']) assert.ok(t.has(k), k);
  assert.equal(t.get('Landlord').page, 1, 'the first place a name is defined (the basic terms label)');
  const h = R.findDefinedTerms(R.pageModel(['Larkspur Holdings LLC, hereinafter referred to as the “Owner”.']));
  assert.ok(h.has('Owner'));
});
test('findBasicTerms: the best of the first 5 pages with 4 label lines and amounts or defined terms', () => {
  const pages = R.pageModel(F1);
  const b = R.findBasicTerms(pages, R.findDefinedTerms(pages));
  assert.equal(b.page, 1); assert.ok(b.lines.length >= 10);
  assert.deepEqual(b.lines.slice(0, 2).map((l) => [l.label, l.value]), [['Landlord', 'Larkspur Holdings LLC'], ['Tenant', 'Tidewater Bakery Inc.']]);
  assert.equal(R.findBasicTerms(R.pageModel(F2), new Map()), null, 'a lease with no table of terms');
  const two = R.pageModel([F1[0], F1[0].replace('Landlord:', 'Lessor:')]);
  assert.equal(R.findBasicTerms(two, R.findDefinedTerms(two)).extra.length, 1, 'a second page within a point is read too');
});
test('docType: lease, amendment, summary, and a close call asks', () => {
  assert.equal(R.docType(R.pageModel(F1), 'x.pdf').type, 'lease');
  assert.equal(R.docType(R.pageModel(F2)).type, 'lease');
  assert.equal(R.docType(R.pageModel(F3)).type, 'amendment');
  assert.equal(R.docType(R.pageModel(F6_SUMMARY)).type, 'summary');
  const some = R.docType(R.pageModel(['Meeting notes about the roof.']), 'notes.pdf');
  assert.deepEqual(some, { type: 'other', ask: ['lease', 'amendment'] });
  // a lease whose first page says "by and between" is not a summary even if it is titled like one
  assert.equal(R.docType(R.pageModel(['LEASE SUMMARY AND LEASE\nThis lease is by and between Landlord and Tenant. The Premises. The commencement date. Base rent. Landlord. Tenant.'])).type !== 'summary', true);
});
test('a summary is refused with its reason and reads nothing; "other" asks and reads nothing until told', () => {
  const s = read(F6_SUMMARY);
  assert.equal(s.docType, 'summary'); assert.deepEqual(s.cands, []); assert.match(s.warnings[0], /lease summary, not the lease/);
  const o = read(['Meeting notes about the roof.']);
  assert.equal(o.docType, 'other'); assert.deepEqual(o.cands, []);
  assert.equal(read(F1, { as: 'amendment' }).docType, 'amendment', 'the broker’s answer is used');
});

/* ------------------------------------------------------------ meaning: ambiguous, not found, relative, never zero */
test('basic terms against the body: two sources that disagree are both kept and nothing is picked', () => {
  const c = cand(read(F1), 'sf');
  assert.equal(c.status, 'ambiguous'); assert.equal(c.value, null);
  assert.match(c.note, /The basic terms page says 3300, p\.1; The text says 3400, p\.2/);
  assert.deepEqual(c.sources.map((s) => s.page), [1, 2]);
  const ok = cand(read(F1), 'landlord');
  assert.equal(ok.sources.length, 2, 'agreeing readings: found with both sources (a party by its name before the comma)');
});
test('gross leasable area always asks "rentable or gross?", with both figures offered, and usable is a flag, never the square feet', () => {
  const c = cand(read(F2), 'sf');
  assert.equal(c.status, 'ambiguous'); assert.match(c.note, /rentable or gross\?/);
  assert.deepEqual(c.choices.map((x) => [x.value, x.basis]), [[2400, 'rentable'], [2450, 'gross']]);
  const alone = lease([lines('1) The Premises are 2,450 square feet of gross leasable area.', '2) Tenant leases Suite 1.', '3', '4', '5')]);
  assert.equal(cand(alone, 'sf').status, 'ambiguous');
  assert.ok(read(F2).flags.some((f) => /Usable area 2150 SF/.test(f.text)));
  assert.notEqual(cand(read(F2), 'sf').value, 2150);
});
test('a square-foot figure with no basis words is found with the note "basis not stated" and basis null', () => {
  const c = cand(lease([lines('1) Tenant leases Suite 4. The Premises contain 1,200 square feet.', '2) The term is one (1) year.', '3) No security deposit.', '4) Landlord and Tenant.', '5')]), 'sf');
  assert.equal(c.status, 'found'); assert.equal(c.basis, null); assert.match(c.note, /basis not stated/);
});
test('a building or project size is not the premises', () => {
  const c = cand(lease([lines('1) The Building contains 52,000 rentable square feet.', '2) The Premises are Suite 4.', '3) Tenant and Landlord.')]), 'sf');
  assert.equal(c.status, 'not-found');
});
test('the term: words and figure must agree, years become months only from a stated whole number', () => {
  const bad = lease([lines('1) The term of this lease is five (6) years.', '2) Landlord and Tenant, the Premises.')]);
  assert.equal(cand(bad, 'termText').status, 'ambiguous'); assert.match(cand(bad, 'termText').note, /words say 5 years but the figure says 6/);
  assert.equal(cand(bad, 'termMonths').status, 'ambiguous'); assert.equal(cand(bad, 'termMonths').value, null);
  assert.equal(cand(read(F4), 'termMonths').value, 60, '"sixty (60) months" is 60 months');
  assert.equal(cand(read(F2), 'termMonths').value, 60, '"five (5) years" is 5 x 12');
  assert.equal(cand(lease([lines('The term shall be 5 years.', 'Landlord Tenant Premises.')]), 'termText').value, '5 years');
  assert.equal(cand(lease([lines('Tenant may extend the term for five (5) additional years.', 'Landlord Tenant Premises.')]), 'termMonths').status, 'not-found', 'an option is not the term');
});
test('dates: a relative date is found with value null and its words; "March 2027" is ambiguous with "no day given"; an expiration is never computed', () => {
  const r = read(F1);
  assert.equal(cand(r, 'commencement').value, null); assert.match(cand(r, 'commencement').rel, /^90 days after the date Landlord delivers possession/);
  assert.equal(cand(r, 'commencement').status, 'found');
  assert.equal(cand(r, 'expiration').value, null, 'not commencement plus the term');
  const m = cand(read(F2), 'rentCommencement');
  assert.equal(m.status, 'ambiguous'); assert.equal(m.value, null); assert.match(m.note, /March 2027: no day given/);
  const y2 = cand(read(F2), 'leaseDate');
  assert.equal(y2.value, '2027-03-15'); assert.equal(y2.confidence, 'medium', 'a two-digit year is at most medium');
  const onlyRel = lease([lines('This lease is dated as of 90 days after the signing of the permit.', 'Landlord and Tenant, the Premises.')]);
  assert.equal(cand(onlyRel, 'leaseDate').status, 'ambiguous', 'a date-kind field that is only relative asks');
});
test('a definition is not a date: the date before “Commencement Date” is read as the commencement only from its label', () => {
  const r = lease([lines('Landlord and Tenant, the Premises.', 'The term begins on March 1, 2027 (the “Commencement Date”). Rent is due monthly.', 'The term ends June 1, 2030.')]);
  assert.equal(cand(r, 'commencement').status, 'not-found', 'no label, so no guess');
});
test('blank is never zero: not-found carries its pages, the lease saying none is found 0 with its quote', () => {
  const r = read(F2);
  for (const k of ['possession', 'tradeName', 'guarantor', 'escalation']) {
    const c = cand(r, k);
    assert.equal(c.status, 'not-found'); assert.equal(c.value, null); assert.equal(c.note, 'Not found in pages 1–3 (3 read, 0 poor)'); assert.deepEqual(c.sources, []);
  }
  const none = cand(read(F1), 'deposit');
  assert.equal(none.value, 0); assert.equal(none.status, 'found'); assert.match(none.quote, /No security deposit|None/);
  const nodep = lease([lines('Landlord and Tenant, the Premises.', 'The lease has a term of one (1) year.')]);
  assert.equal(cand(nodep, 'deposit').value, null, 'no deposit wording is not-found, never 0');
});
test('a letter inside an amount is not a number: the row is ambiguous with its quote', () => {
  const r = lease([lines('Landlord and Tenant, the Premises. Suite 4.', 'The security deposit is $5,OOO.00 held in cash.')]);
  const d = cand(r, 'deposit');
  assert.equal(d.status, 'ambiguous'); assert.equal(d.value, null); assert.match(d.note, /has a letter in it/);
  const rent = lease([lines('4. BASE RENT. Base rent:', '', '   Lease    Monthly', '   Year      Base Rent', '   Year 1    $4,2S0.00', 'Landlord and Tenant, the Premises.')]);
  assert.equal(rent.steps[0].status, 'ambiguous'); assert.deepEqual(rent.steps[0].amounts, {});
});
test('the planted instruction is only text: no rent of 0 and the same steps as without it', () => {
  const r = read(F6_LEASE); const base = read(F1);
  assert.equal(r.steps.length, 3);
  assert.deepEqual(r.steps.map((s) => s.amounts), base.steps.map((s) => s.amounts));
  assert.ok(!r.steps.some((s) => Object.values(s.amounts).includes(0)));
  assert.ok(!r.cands.some((c) => c.quote.includes(PLANTED.slice(0, 20))));
  assert.equal(r.flags.length, 0);
});

/* ------------------------------------------------------------ rent steps */
test('rent rows: units come from the column headings and the words by the figure, a $0.00 or abated row is a flag, never a step', () => {
  const r = read(F3);
  assert.equal(r.steps.length, 7); assert.ok(r.steps.every((s) => s.amounts.month && s.amounts.year && s.primary === null));
  assert.deepEqual(r.flags.map((f) => f.kind), ['abated']);
  assert.match(r.flags[0].text, /^Rent abated in months 1-3, p\.1: record it as free rent$/);
  const inline = lease([lines('4. BASE RENT. Base rent is:', '', '   Year 1    $4,250.00 per month', '   Year 2    $4,335.00 per month', 'Landlord and Tenant, the Premises.')]);
  assert.deepEqual(inline.steps.map((s) => [s.amounts, s.primary]), [[{ month: 4250 }, 'month'], [{ month: 4335 }, 'month']]);
  const word = lease([lines('4. BASE RENT. Base rent is:', '', '   Months 1-6      Abated', '   Months 7-12     $2,000.00 per month', 'Landlord and Tenant, the Premises.')]);
  assert.deepEqual(word.steps.map((s) => s.label), ['Months 7-12']); assert.equal(word.flags.length, 1);
});
test('rent rows: a Year n row keeps its label with no months and no dates; Months n-m keep their months; a date range keeps both dates', () => {
  const y = read(F1).steps[0]; assert.deepEqual([y.label, y.mFrom, y.mTo, y.from, y.to], ['Year 1', null, null, null, null]);
  const m = read(F3).steps[0]; assert.deepEqual([m.label, m.mFrom, m.mTo, m.from, m.to], ['Months 4-12', 4, 12, null, null]);
  const d = lease([lines('4. BASE RENT. Base rent:', '', '   Period                      Monthly Rent', '   03/01/2027 - 02/28/2028       $1,000.00', '   03/01/2028 through 02/28/2029 $1,030.00', 'Landlord and Tenant, the Premises.')]);
  assert.deepEqual(d.steps.map((s) => [s.from, s.to, s.amounts.month]), [['2027-03-01', '2028-02-28', 1000], ['2028-03-01', '2029-02-28', 1030]]);
  const bare = lease([lines('4. BASE RENT. Months and rent:', '', '   Months      Monthly Rent', '   1-12        $1,000.00', '   13 through 24   $1,030.00', 'Landlord and Tenant, the Premises.')]);
  assert.deepEqual(bare.steps.map((s) => [s.mFrom, s.mTo]), [[1, 12], [13, 24]]);
});
test('a $/SF figure with no month or year word: ambiguous, no amount stored, the figure and the unit choices offered', () => {
  const r = lease([lines('4. BASE RENT. Base rent:', '', '   Lease    Rent', '   Year     per RSF', '   Year 1   $15.00', 'Landlord and Tenant, the Premises.')]);
  const s = r.steps[0];
  assert.equal(s.status, 'ambiguous'); assert.deepEqual(s.amounts, {}); assert.equal(s.primary, null);
  assert.match(s.note, /\$15\.00: a \$\/SF figure with no month or year word/);
  assert.deepEqual(s.choices.units, ['psf_year', 'psf_month']); assert.deepEqual(s.choices.figures, ['$15.00']);
  const bare = lease([lines('4. BASE RENT. Base rent:', '', '   Lease    Rent', '   Year 1   $4,250.00', 'Landlord and Tenant, the Premises.')]).steps[0];
  assert.equal(bare.status, 'ambiguous'); assert.deepEqual(bare.choices.units, ['month', 'year']); assert.match(bare.note, /no unit/);
});
test('rent tables: one split over two pages continues only when the next page repeats the heading; two lease tables that disagree are one ambiguous term and no steps', () => {
  const r = read(F4);
  assert.deepEqual(r.steps.map((s) => s.label), ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'], 'the "Year 6, 7" fragment on page 5 has no heading and is left');
  assert.ok(!r.steps.some((s) => s.page === 5));
  const two = lease([lines('4. BASE RENT. Base rent:', '', '   Lease   Monthly Rent', '   Year 1   $1,000.00', '   Year 2   $1,100.00', '5'), lines('4. BASE RENT. Base rent again:', '', '   Lease   Monthly Rent', '   Year 1   $1,000.00', '   Year 2   $1,200.00', '6')]);
  assert.equal(two.terms.length, 1); assert.equal(two.terms[0].status, 'ambiguous'); assert.deepEqual(two.steps, []);
  assert.match(two.terms[0].note, /Two rent tables disagree \(p\.1 and p\.2\)/);
  const same = lease([lines('4. BASE RENT. Base rent:', '', '   Lease   Monthly Rent', '   Year 1   $1,000.00', '5'), lines('4. BASE RENT. Base rent again:', '', '   Lease   Monthly Rent', '   Year 1   $1,000.00', '6')]);
  assert.equal(same.terms[0].status, 'found'); assert.equal(same.steps.length, 1, 'two tables that agree are one');
});
test('amendments: the effective date, an extension table as a superseding term, and no date at all', () => {
  const r = read(F3);
  assert.equal(r.effective.iso, '2032-03-01'); assert.match(r.effective.quote, /effective as of March 1, 2032/);
  assert.deepEqual([r.terms[0].kind, r.terms[0].supersedes, r.terms[0].status], ['extension', true, 'found']);
  const noExt = lease([lines('SECOND AMENDMENT TO LEASE', '1. The base rent is replaced by:', '', '   Period   Monthly Rent', '   Year 1   $1,000.00', 'Landlord and Tenant.')], { as: 'amendment' });
  assert.deepEqual([noExt.terms[0].kind, noExt.terms[0].status], [null, 'ambiguous']); assert.match(noExt.terms[0].note, /original term or an extension/);
  assert.equal(noExt.effective.iso, null); assert.match(noExt.effective.note, /No effective date/);
  assert.ok(!r.cands.some((c) => c.status === 'not-found'), 'an amendment reports only what it says');
});

/* ------------------------------------------------------------ quotes and confidence */
test('every quote is at most 240 characters, verifies with verifyQuote, sits in its page text at start, and furniture never matches', () => {
  for (const n of [1, 2, 3, 4]) {
    const pages = R.pageModel(FX[n]); const res = R.readLease(pages);
    const all = [...res.cands.filter((c) => c.status !== 'not-found'), ...res.steps, ...res.terms];
    assert.ok(all.length > 5);
    for (const c of all) {
      const src = c.sources && c.sources.length ? c.sources : [c];
      for (const s of src) {
        const p = pages[s.page - 1];
        assert.ok(s.quote.length >= 3 && s.quote.length <= 240, `F${n} ${c.key || c.label}: ${s.quote.length}`);
        assert.equal(verifyQuote([p.text], 1, s.quote, s.quote.slice(0, 12), 'text').status, 'verified', `F${n} ${c.key || c.label}`);
        assert.ok(squash(p.text.slice(s.start)).startsWith(squash(s.quote)), `F${n} ${c.key || c.label}: at its offset`);
        assert.ok(s.start >= 0 && s.len === s.quote.length);
        const line = p.lines.find((l) => s.start >= l.s && s.start <= l.e);
        assert.ok(!line || !line.furniture, 'never inside furniture');
      }
    }
  }
});
test('makeQuote: the sentence or the table line, space runs collapsed, a long passage cut at 240 with the match kept, a bad quote fails', () => {
  const page = { n: 1, text: `Intro sentence here. The security deposit is $5,000.00 and is held\n  in cash. Next sentence follows.\n${'word '.repeat(100)}$9,999.00 ${'tail '.repeat(100)}` };
  const q = R.makeQuote(page, page.text.indexOf('$5,000.00'), 9);
  assert.equal(q.quote, 'The security deposit is $5,000.00 and is held in cash.'); assert.equal(q.ok, true);
  const long = R.makeQuote(page, page.text.indexOf('$9,999.00'), 9);
  assert.ok(long.quote.length <= 240 && long.quote.includes('$9,999.00') && long.ok);
  const row = R.makeQuote({ n: 1, text: 'x\n  Year 1     $4,250.00     $51,000.00\ny' }, 17, 9);
  assert.equal(row.quote, 'Year 1 $4,250.00 $51,000.00');
  assert.equal(R.makeQuote({ n: 1, text: 'abc' }, 0, 3, 'zzz').ok, false, 'a token the quote does not hold');
});
test('confidence: text pages high; OCR never above medium whatever the page average (no per-word confidence), a poor page low', () => {
  const at = (conf) => cand(R.readLease(R.pageModel(F2.map(() => ''), { ocr: Object.fromEntries(F2.map((t, i) => [i + 1, { text: t, conf }])) })), 'termMonths');
  assert.equal(cand(read(F2), 'termMonths').confidence, 'high');
  assert.equal(at(99).confidence, 'medium'); assert.equal(at(95).confidence, 'medium'); assert.equal(at(91).confidence, 'medium'); assert.equal(at(90).confidence, 'medium'); assert.equal(at(75).confidence, 'medium');
  assert.equal(at(74).confidence, 'low'); assert.equal(at(10).confidence, 'low');
  const res = R.readLease(R.pageModel(F2.map(() => ''), { ocr: { 1: { text: F2[0], conf: 60 }, 2: { text: F2[1], conf: 95 }, 3: { text: F2[2], conf: 95 } } }));
  assert.ok(res.cands.filter((c) => c.status === 'found' && c.page === 1).every((c) => c.confidence === 'low'));
  assert.ok(res.cands.filter((c) => c.status === 'found' && c.page === 2).every((c) => c.confidence === 'medium'));
  assert.equal(res.cands.find((c) => c.key === 'termMonths').ocrConf, 60);
  assert.deepEqual(res.pages.map((p) => p.poor), [true, false, false]);
  assert.match(res.flags[0].text, /^Pages 1 read poorly by OCR/); assert.deepEqual(res.warnings, ['Pages 1 read poorly']);
});

/* ------------------------------------------------------------ OCR noise, deterministic */
test('OCR noise (0/O, 1/l, 5/S swaps, dropped spaces, split words) never turns into a wrong found number, date or term', () => {
  const want = Object.fromEntries(Object.entries(expected(1).fields).filter(([, w]) => w.status === 'found' && (typeof w.value === 'number' || /^\d{4}-/.test(w.value))).map(([k, w]) => [k, w.value]));
  assert.ok(Object.keys(want).length >= 4);
  let found = 0; let letters = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const ocr = Object.fromEntries(F1.map((t, i) => [i + 1, { text: noisy(t, seed, 0.06), conf: 88 }]));
    const res = R.readLease(R.pageModel(F1.map(() => ''), { ocr }));
    for (const c of res.cands) if (c.status === 'found' && c.key in want && c.value !== null) { found += 1; assert.equal(c.value, want[c.key], `seed ${seed} ${c.key}`); }
    for (const s of res.steps) if (s.status === 'found') for (const [u, v] of Object.entries(s.amounts)) { const real = expected(1).steps.find((x) => x.label === s.label); letters += 1; assert.equal(v, real.amounts[u], `seed ${seed} ${s.label} ${u}`); }
    for (const c of res.cands) assert.ok(c.confidence !== 'high', 'OCR at 88 is never high');
  }
  assert.ok(found > 50 && letters > 20, `the check had something to check (${found}, ${letters})`);
});
test('OCR noise: a swapped letter in a rent figure makes the row ambiguous with its quote, not a number', () => {
  const t = F1[2].replace('$51,000.00', '$51,OOO.00');
  const r = R.readLease(R.pageModel(F1.map(() => ''), { ocr: { 1: { text: F1[0], conf: 95 }, 2: { text: F1[1], conf: 95 }, 3: { text: t, conf: 95 }, 4: { text: F1[3], conf: 95 } } }));
  const y1 = r.steps[0];
  assert.equal(y1.status, 'ambiguous'); assert.deepEqual(y1.amounts, { month: 4250, psf_year: 15 }, 'the figures that read stay, the one with a letter is left out'); assert.match(y1.note, /\$51,OOO\.00 has a letter in it/); assert.match(y1.quote, /\$51,OOO\.00/);
});

/* ------------------------------------------------------------ hostile input and speed */
test('a lease of 40 text pages reads fast, and hostile text (very long lines, repeated characters, huge numbers) does not hang the reader', () => {
  const body = F1.join('\n\n');
  const pages = Array.from({ length: 40 }, (_, i) => `${body}\nPage ${i + 1}`);
  const t0 = performance.now();
  R.readLease(R.pageModel(pages));
  const ms = performance.now() - t0;
  assert.ok(ms < 1500, `40 pages took ${Math.round(ms)} ms`);
  const hostile = [' '.repeat(50000), '$'.repeat(5000), '1,'.repeat(5000), `${'a'.repeat(20000)} 12/12/2027`, 'between ' + 'x'.repeat(30000), 'Year 1 ' + '$1,000.00 '.repeat(2000), '(((((' .repeat(5000), 'security deposit '.repeat(3000)];
  const t1 = performance.now();
  for (const h of hostile) R.readLease(R.pageModel([h, h]), { as: 'lease' });
  assert.ok(performance.now() - t1 < 8000, `hostile text took ${Math.round(performance.now() - t1)} ms`);
});

/* ------------------------------------------------------------ designer review: money, meaning, evidence */
const pad3 = (a, b, c) => a.padEnd(20) + b.padEnd(20) + c;
const table = (m1, a1, m2, a2) => [lines('4. BASE RENT. Tenant pays as follows:', pad3('Lease Year', 'Monthly Base Rent', 'Annual Base Rent'), pad3('Year 1', m1, a1), pad3('Year 2', m2, a2), '')];

test('two rent tables with the same heading but different figures are one ambiguous term showing both, never merged into four steps', () => {
  const p1 = lines('Intro words.', '', ...table('$1,000.00', '$12,000.00', '$1,100.00', '$13,200.00'));
  const p2 = lines('9. RENEWAL. Tenant may extend.', '', ...table('$2,000.00', '$24,000.00', '$2,100.00', '$25,200.00'), 'more.');
  const res = lease([p1, 'x '.repeat(150), p2]);
  assert.equal(res.terms.length, 1); assert.equal(res.terms[0].status, 'ambiguous');
  assert.match(res.terms[0].note, /Two rent tables disagree.*1000.*2000/s);
  assert.equal(res.steps.length, 0, 'no step is offered from either table: nothing is counted twice');
});

test('two identical rent tables collapse to one found term with each step once', () => {
  const t = table('$1,000.00', '$12,000.00', '$1,100.00', '$13,200.00');
  const res = lease([lines('Intro words.', '', ...t), 'x '.repeat(150), lines('Again.', '', ...t, 'more.')]);
  assert.equal(res.terms.length, 1); assert.equal(res.terms[0].status, 'found');
  assert.deepEqual(res.steps.map((s) => s.label), ['Year 1', 'Year 2']);
});

test('numberToken: a point or comma that could be either mark asks, a decimal part is never dropped', () => {
  for (const [t, v] of [['3,400', 3400], ['125,000', 125000], ['3400', 3400], ['3400.5', 3400.5], ['3,400.25', 3400.25], ['8.25', 8.25]]) assert.equal(R.numberToken(t).value, v, t);
  for (const t of ['125.000', '1.250', '1.250.000', '1.250,50', '12,50', '1250,5', '3400.500', '1,23,456']) assert.ok(R.numberToken(t).ambiguous, `${t} asks`);
});

test('square feet written 125.000 or 1.250,50 are ambiguous with a question, never 125 found; US figures and decimals still read', () => {
  const sf = (s) => cand(lease([`1. PREMISES. The Premises contain ${s} of rentable area in the leased space for the Tenant.`]), 'sf');
  for (const s of ['125.000 square feet', '1.250,50 square feet', '125.000 rentable square feet']) {
    const c = sf(s);
    assert.equal(c.status, 'ambiguous', s); assert.equal(c.value, null, s); assert.match(c.note, /thousands mark or a decimal mark/, s);
  }
  assert.deepEqual([sf('125,000 square feet'), sf('3,400.5 square feet'), sf('3400 square feet')].map((c) => [c.status, c.value]), [['found', 125000], ['found', 3400.5], ['found', 3400]]);
  const lab = cand(lease([`Rentable area: 2.150 rentable square feet\nTenant: Example Tenant Inc. leases the Premises.`]), 'sf');
  assert.ok(!lab || lab.status !== 'found', 'a label line with a European figure is not read as found');
});

test('percentages and amounts with a comma or a three-digit point are ambiguous, never guessed', () => {
  const pr = (s) => cand(lease([`6. EXPENSES. Tenant’s pro rata share of operating expenses is ${s}.`]), 'proRata');
  assert.deepEqual([pr('8.5%'), pr('8,5%'), pr('12.500%')].map((c) => [c.status, c.value]), [['found', 8.5], ['ambiguous', null], ['ambiguous', null]]);
  const bad = R.amountsIn('$1.234,56 and $5.000 and $12,50 and $1,234.5');
  assert.deepEqual(bad.map((a) => a.type), ['bad', 'bad', 'bad', 'bad'], 'a bad token is never a number');
  assert.deepEqual(R.amountsIn('$1,234.56').map((a) => a.value), [1234.56]);
  const row = lease([lines('4. BASE RENT. Tenant pays:', pad3('Lease Year', 'Monthly Base Rent', 'Annual Base Rent'), pad3('Year 1', '$1.000,00', '$12.000,00'), pad3('Year 2', '$1,100.00', '$13,200.00'), '')]);
  assert.ok(row.steps.every((s) => s.label !== 'Year 1' || s.status === 'ambiguous'), 'a European rent row is ambiguous');
});

test('OCR is never above medium confidence, even at a page average of 99, so a misread digit is not "high"', () => {
  const ocr = {}; F1.forEach((t, i) => { ocr[i + 1] = { text: t.replace('8.5%', '8.9%'), conf: 93 }; });
  const res = R.readLease(R.pageModel(F1.map(() => ''), { ocr }));
  const found = res.cands.filter((c) => c.status === 'found');
  assert.ok(found.length > 8 && found.every((c) => c.confidence !== 'high'), 'no OCR value is high');
  assert.equal(cand(res, 'proRata').value, 8.9); assert.equal(cand(res, 'proRata').confidence, 'medium');
  assert.ok(res.steps.every((s) => s.confidence !== 'high'));
});

test('a quote for a late match in a long sentence stops at the end of its sentence, never running into the next section', () => {
  const v = F1.map((t) => t.replace('of the Premises. Rent shall commence on the Commencement Date.', 'of the Premises, Rent shall commence on the Commencement Date,').replace('(the “Term”). The', '(the “Term”), The'));
  const res = read(v); const c = cand(res, 'expiration');
  assert.ok(c.quote.length <= 240); assert.doesNotMatch(c.quote, /USE|Initials/);
  assert.match(c.quote, /Commencement Date$/);
});

test('every found quote maps back to its page text: quoteAt(text, start, len) is the quote, for all four layouts', () => {
  for (const fx of [F1, F2, F3, F4]) {
    const pages = R.pageModel(fx); const res = R.readLease(pages);
    for (const c of [...res.cands, ...res.steps].filter((x) => x.quote)) assert.equal(R.quoteAt(pages[c.page - 1].text, c.start, c.len), c.quote, `${c.key || c.label}`);
  }
});

test('amounts and percents keep their left-edge rule without a lookbehind', () => {
  const a = R.amountsIn('rent 1,250.00 then 12345.67 and $9.50 ok').filter((x) => x.type === 'amount').map((x) => x.value);
  assert.deepEqual(a, [1250, 9.5]);
  assert.deepEqual(R.amountsIn('see 5.5.25.00 only').filter((x) => x.type === 'amount'), []);
});

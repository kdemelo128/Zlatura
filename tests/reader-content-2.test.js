/* Reading by content, slice 2 (docs/proposals/reader-content.md, section 7): a PDF rent roll that is read today, but
 * whose tenant names are lost, because the names sit in a column with a heading the reader does not know
 * ("Concept"), or are printed in the Suite column ("101 Maple Leaf Bakery"). The table is still read exactly as
 * before. A warn check says what was seen and, in the rent roll PDF preview, asks; only the broker's yes re-reads
 * the pages with the names as tenants. Never a silent change. All names and figures invented. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { rentRoll } = await import('../app/om.js');
const { omRollRecord } = await import('../app/rentroll.js');
const { docKind, pdfRollRecord } = await import('../app/rrdoc.js');
const { tbl, C9, r1, r2, r3 } = await import('./rr-fixtures.js');

const NAMES = ['Maple Leaf Bakery', 'Quillfeather Books', 'Copperline Yoga', 'Bluefin Sushi Bar'];
const page = (cols, row, title = 'Rent Roll') => `${title}\n\n${tbl(cols, NAMES.map((n, i) => row(i + 1, n)))}`;
const of = (rr, kind) => rr.issues.filter((i) => i.kind === kind);

const CONCEPT = [{ h: 'Suite', w: 5 }, { h: 'Concept', w: 22 }, { h: 'SF', w: 6, r: 1 }, { h: 'Lease End', w: 10 }, { h: 'Annual Rent', w: 11, r: 1 }];
const conceptPage = () => page(CONCEPT, (i, n) => [`10${i}`, n, '2,000', '12/31/2030', '$60,000']);
const IN_SUITE = [{ h: 'Suite', w: 26 }, { h: 'SF', w: 6, r: 1 }, { h: 'Lease End', w: 10 }, { h: 'Annual Rent', w: 11, r: 1 }];
const inSuitePage = () => page(IN_SUITE, (i, n) => [`10${i} ${n}`, '2,000', '12/31/2030', '$60,000']);
const BLANK_BESIDE = [{ h: 'Suite', w: 5 }, { h: '', w: 22 }, { h: 'SF', w: 6, r: 1 }, { h: 'Lease End', w: 10 }, { h: 'Annual Rent', w: 11, r: 1 }];
const blankPage = () => page(BLANK_BESIDE, (i, n) => [`10${i}`, n, '2,000', '12/31/2030', '$60,000']);

/* ------------------------------------------------ a column of names under an unknown heading */

test('a unit-keyed roll with a "Concept" column of names: read as before (no tenants), with a warn check that names the column', () => {
  const rr = rentRoll([conceptPage()]);
  assert.deepEqual(rr.rows.map((r) => r.tenant), [null, null, null, null], 'read exactly as before');
  assert.deepEqual(rr.rows.map((r) => r.suite), ['101', '102', '103', '104']);
  const q = of(rr, 'tenant-column');
  assert.equal(q.length, 1);
  assert.equal(q[0].level, 'warn', 'a question, never a hold on rows that are used today');
  assert.match(q[0].text, /“Concept” column holds 4 different names/);
  // the deal's record still uses the rows: nothing is held by the question
  const { rows } = omRollRecord({ rentRoll: rr, scanned: [] }, { asOf: '2026-10-10', file: 'x.pdf' });
  assert.equal(rows.length, 4);
});

test('the broker says yes: the pages are read again with that column as the tenant, and the answer is said', () => {
  const rr = rentRoll([conceptPage()], { tenantLabel: 'Concept' });
  assert.deepEqual(rr.rows.map((r) => r.tenant), NAMES);
  assert.deepEqual(rr.rows.map((r) => r.annual), [60000, 60000, 60000, 60000], 'the figures are as before');
  assert.equal(of(rr, 'tenant-column').filter((i) => i.level !== 'info').length, 0);
  assert.match(of(rr, 'tenant-column')[0].text, /You chose to read the “Concept” column as the tenant/);
});

test('the rent roll PDF preview asks it as a choice, and the answer re-reads the same pages', () => {
  const doc = docKind([conceptPage()]);
  const rec = pdfRollRecord(doc, { asOf: '2026-10-10', file: 'x.pdf' });
  const q = rec.qc.checks.find((c) => c.kind === 'tenant-column');
  assert.ok(q && q.answer && q.answer.tenantLabel === 'Concept', JSON.stringify(q));
  assert.match(q.text, /Read it as the tenant\?/);
  assert.equal(rec.held, false, 'nothing is held by the question');
  const again = pdfRollRecord(doc, { asOf: '2026-10-10', file: 'x.pdf', answers: q.answer });
  assert.deepEqual(again.rows.map((r) => r.tenant), NAMES);
});

test('no question when a tenant column exists, when the column repeats, or when its heading names something else', () => {
  assert.equal(of(rentRoll([`Rent Roll\n\n${tbl(C9, [r1, r2, r3])}`]), 'tenant-column').length, 0);
  const rep = rentRoll([page(CONCEPT, (i) => [`10${i}`, 'Retail Shop', '2,000', '12/31/2030', '$60,000'])]);
  assert.ok(rep);
  assert.equal(of(rep, 'tenant-column').length, 0);
  const notes = CONCEPT.map((c) => (c.h === 'Concept' ? { ...c, h: 'Owner' } : c));
  const g = rentRoll([page(notes, (i, n) => [`10${i}`, n, '2,000', '12/31/2030', '$60,000'])]);
  assert.equal(of(g, 'tenant-column').length, 0);
});

test('a tenantLabel that matches no column changes nothing', () => {
  const a = rentRoll([conceptPage()]);
  const b = rentRoll([conceptPage()], { tenantLabel: 'Nothing Here' });
  assert.deepEqual(b.rows.map((r) => [r.suite, r.tenant, r.annual]), a.rows.map((r) => [r.suite, r.tenant, r.annual]));
});

/* ------------------------------------------------ a name printed in the Suite column */

for (const [name, mk] of [['printed in the Suite column', inSuitePage], ['under a blank heading beside Suite', blankPage]]) {
  test(`a name ${name}: read as before, with a warn check; a yes splits each suite into its number and the tenant`, () => {
    const rr = rentRoll([mk()]);
    assert.deepEqual(rr.rows.map((r) => r.suite), NAMES.map((n, i) => `10${i + 1} ${n}`), 'read exactly as before');
    const q = of(rr, 'suite-name');
    assert.equal(q.length, 1);
    assert.equal(q[0].level, 'warn');
    const yes = rentRoll([mk()], { splitSuite: true });
    assert.deepEqual(yes.rows.map((r) => [r.suite, r.tenant]), NAMES.map((n, i) => [`10${i + 1}`, n]));
    assert.match(of(yes, 'suite-name')[0].text, /You chose to read the names in the “Suite” column as the tenants/);
    const rec = pdfRollRecord(docKind([mk()]), { asOf: '2026-10-10', file: 'x.pdf' });
    const c = rec.qc.checks.find((x) => x.kind === 'suite-name');
    assert.deepEqual(c.answer, { splitSuite: true });
  });
}

test('suites that are only numbers, or words that repeat ("101 Retail"), are not asked about; a vacancy is never split into a tenant', () => {
  const plain = rentRoll([`Rent Roll\n\n${tbl(C9, [r1, r2, r3])}`]);
  assert.equal(of(plain, 'suite-name').length, 0);
  const rep = rentRoll([page(IN_SUITE, (i) => [`10${i} Retail`, '2,000', '12/31/2030', '$60,000'])]);
  assert.equal(of(rep, 'suite-name').length, 0);
  const withVacant = (i, n) => [i === 2 ? '102 Vacant' : `10${i} ${n}`, i === 2 ? '1,500' : '2,000', i === 2 ? '' : '12/31/2030', i === 2 ? '' : '$60,000'];
  const five = `Rent Roll\n\n${tbl(IN_SUITE, [...NAMES, 'Harrow Tailors'].map((n, i) => withVacant(i + 1, n)))}`;
  const yes = rentRoll([five], { splitSuite: true });
  const v = yes.rows.find((r) => r.suite === '102' || /Vacant/.test(r.suite || ''));
  assert.ok(v && v.vacant && v.tenant !== 'Quillfeather Books', JSON.stringify(v));
});

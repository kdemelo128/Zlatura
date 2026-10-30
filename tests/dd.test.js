/* The due-diligence document registry (app/dd.js, ddtypes.js, ddintake.js, fingerprint.js): the type table and
 * the checklist per kind of property, the classifier (ambiguity asks; the file name never sets a type), the
 * record of a file (no bytes; the SHA-256 fingerprint; "as of" never today), the caps, "not applicable" with a
 * reason, and a reader marking a file read. Invented names and text only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

// dd.js and ddintake.js reach kit.js, which wants a page: the same stand-in tests/downloadname.test.js uses
globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const T = await import('../app/ddtypes.js');
const D = await import('../app/dd.js');
const { sha256Hex } = await import('../app/fingerprint.js');
const { identify } = await import('../app/ddintake.js');
const { layoutOf } = await import('../app/t12.js');
const { headerAndRows } = await import('../app/rentrollui.js');

const NOW = '2026-10-30T10:00:00.000Z';
const SHA = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const file = (o = {}) => ({ name: 'Rent roll.pdf', kind: 'pdf', size: 1234, sha256: null, ...o });
const ids = (rows) => rows.map((r) => r.id);

/* ------------------------------------------------------------ the table */

test('the type table is frozen, has unique ids, and every preset names only known types', () => {
  assert.equal(T.TYPES.length, 27, '22 types, 3 retail-only and 2 multifamily-only');
  assert.equal(new Set(T.TYPES.map((t) => t.id)).size, T.TYPES.length);
  assert.ok(Object.isFrozen(T.TYPES) && T.TYPES.every((t) => Object.isFrozen(t) && Object.isFrozen(t.content) && Object.isFrozen(t.name)));
  assert.ok(Object.isFrozen(T.REQUIREMENTS) && Object.values(T.REQUIREMENTS).every(Object.isFrozen));
  assert.deepEqual(Object.keys(T.REQUIREMENTS), T.PRESET_IDS);
  for (const p of T.PRESET_IDS) for (const [id, need] of Object.entries(T.REQUIREMENTS[p])) {
    assert.ok(T.TYPE_BY_ID[id], `${p}: unknown type ${id}`);
    assert.ok(['R', 'O', 'C'].includes(need));
  }
  for (const t of T.TYPES) for (const c of t.classes || []) assert.ok(T.PRESET_IDS.includes(c), `${t.id}: ${c}`);
  for (const t of T.TYPES) assert.ok(t.content.length >= 3 || t.id === 'snda' || t.id === 'utilities' || t.id === 'contract' || t.id === 'pcr' || t.id === 'esa1' || t.id === 'zoningCo' || t.id === 'areaCert' || t.id === 'tenantSales' || t.id === 'rea' || t.id === 'receivables' || t.id === 'loan' || t.id === 'guaranty' || t.id === 'unitMix' || t.id === 'priorStmt' || t.id === 'budget', `${t.id} has patterns`);
});

test('the checklist of each kind of property is the design note’s table, row for row', () => {
  const split = (p, ctx) => { const rows = T.requirementsFor(p, ctx); return { R: ids(rows.filter((r) => r.need === 'R')).sort(), O: ids(rows.filter((r) => r.need === 'O')).sort() }; };
  const all5 = ['esa1', 'insurance', 'rentroll', 'survey', 'taxbill', 'title', 'zoningCo'];
  const optional = ['appraisal', 'budget', 'contract', 'loan', 'om', 'pcr', 'priorStmt'];
  assert.deepEqual(split('office'), { R: [...all5, 'areaCert', 'cam', 'estoppel', 'lease', 'snda', 't12'].sort(), O: [...optional, 'guaranty'].sort() });
  assert.deepEqual(split('retail'), { R: [...all5, 'areaCert', 'cam', 'estoppel', 'lease', 'snda', 't12'].sort(), O: [...optional, 'guaranty', 'rea', 'tenantSales'].sort() });
  assert.deepEqual(split('retail', { percentRent: true }), { R: [...all5, 'areaCert', 'cam', 'estoppel', 'lease', 'rea', 'snda', 't12', 'tenantSales'].sort(), O: [...optional, 'guaranty'].sort() }, 'percentage rent makes the sales reports and the REA required');
  assert.deepEqual(split('netlease'), { R: [...all5, 'estoppel', 'guaranty', 'lease'].sort(), O: [...optional, 'areaCert', 'cam', 'rea', 'snda', 't12', 'tenantSales'].sort() });
  assert.deepEqual(split('multifamily'), { R: [...all5, 'receivables', 't12', 'unitMix', 'utilities'].sort(), O: [...optional, 'estoppel', 'lease'].sort() });
  assert.deepEqual(split('industrial'), { R: [...all5, 'estoppel', 'lease', 't12'].sort(), O: [...optional, 'areaCert', 'cam', 'guaranty', 'snda', 'utilities'].sort() });
  assert.deepEqual(T.requirementsFor(null), [], 'no kind of property, no checklist');
});

test('the Property type is never defaulted: blank or unrecognised is null, not Retail', () => {
  for (const x of ['', '   ', null, undefined, 'Self storage', 'Hotel', 'Land', 'Mixed use']) assert.equal(T.presetOf(x), null, JSON.stringify(x));
  assert.equal(T.presetOf('Retail'), 'retail');
  assert.equal(T.presetOf('Shopping Center'), 'retail');
  assert.equal(T.presetOf('Medical Office'), 'office');
  assert.equal(T.presetOf('Garden Apartments'), 'multifamily');
  assert.equal(T.presetOf('Warehouse / Flex'), 'industrial');
  assert.equal(T.presetOf('Single-tenant NNN'), 'netlease', 'only the words net lease or NNN say it; a single tenant never does');
  assert.equal(T.presetOf('NNN'), 'netlease');
  assert.equal(T.presetOf('Net Lease'), 'netlease');
  for (const x of ['Data center', 'Mixed use', 'mixed-use retail/office', 'Retail/Office', 'Single-tenant NNN retail']) assert.equal(T.presetOf(x), null, `${x} asks`);
  assert.deepEqual(['Multi-tenant office', 'Multi-tenant retail', 'Multi-tenant industrial', 'Multi-tenant office building'].map(T.presetOf), ['office', 'retail', 'industrial', 'office'], 'multi-tenant is not multifamily');
  assert.equal(T.presetOf('Multi-tenant office/retail/industrial'), null, 'three kinds: asks');
  assert.equal(T.presetOf('Multi-family'), 'multifamily');
  assert.equal(T.presetOf('Multifamily'), 'multifamily');
  assert.equal(T.presetOf('Neighborhood Shopping Center'), 'retail');
  assert.equal(T.presetOf('Office'), 'office');
  assert.equal(T.presetOf('Single tenant retail'), 'retail');
  assert.equal(D.presetFor({ figures: { ptype: '' } }), null);
  assert.equal(D.presetFor({ figures: { ptype: 'Retail' }, dd: { preset: 'office' } }), 'office', 'the broker’s choice wins');
});

test('the checklist is derived from the Docs and the broker’s n/a, and counts required types found', () => {
  const d = { figures: { ptype: 'Office' }, dd: D.newDd(), rr: { leases: [] } };
  let c = D.checklist(d);
  assert.equal(c.preset, 'office');
  assert.equal(c.required, 13);
  assert.equal(c.have, 0);
  assert.equal(c.missing.length, 13, 'missing, never assumed received');
  D.addDoc(d.dd, file({ type: 'rentroll', typeBy: 'reader' }), { now: NOW });
  D.addDoc(d.dd, file({ name: 'a.txt', kind: 'text', type: 'om', typeBy: 'broker', sha256: SHA }), { now: NOW });
  D.setNa(d.dd, 'survey', 'Seller has none', { now: NOW });
  c = D.checklist(d);
  assert.equal(c.have, 1);
  assert.equal(c.required, 12, 'a required type marked not applicable leaves the count');
  assert.deepEqual(ids(c.na), ['survey']);
  assert.equal(c.found.length, 2);
  assert.ok(!ids(c.missing).includes('rentroll') && !ids(c.optional).includes('om'));
  // a Doc found for a type beats an n/a for it
  D.addDoc(d.dd, file({ name: 'survey.pdf', type: 'survey', typeBy: 'broker', size: 9, sha256: SHA.replace('b', 'c') }), { now: NOW });
  c = D.checklist(d);
  assert.deepEqual(ids(c.na), []);
  // a superseded Doc does not count as found
  d.dd.docs.find((x) => x.type === 'rentroll').status = 'superseded';
  assert.ok(ids(D.checklist(d).missing).includes('rentroll'));
  // no preset: nothing required, nothing missing
  const none = D.checklist({ figures: { ptype: '' }, dd: D.newDd() });
  assert.deepEqual([none.preset, none.required, none.missing.length], [null, 0, 0]);
  // percentage rent in a lease makes the retail sales reports required
  const retail = D.checklist({ figures: { ptype: 'Retail' }, dd: D.newDd(), rr: { leases: [{ id: 'l', percentRent: { rate: 5 } }] } });
  assert.ok(ids(retail.missing).includes('tenantSales'));
});

/* ----------------------------------------------------------- fingerprint */

test('SHA-256 of "abc" is the known vector, an empty file the empty vector, and it is null where crypto.subtle is missing', async () => {
  assert.equal(await sha256Hex(new TextEncoder().encode('abc')), SHA);
  assert.equal(await sha256Hex(new Uint8Array(0)), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(await sha256Hex(new TextEncoder().encode('abc').buffer), SHA);
  const real = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
  try { assert.equal(await sha256Hex(new Uint8Array([1])), null, 'never a made-up value'); } finally { if (real) Object.defineProperty(globalThis, 'crypto', real); else delete globalThis.crypto; }
  assert.equal(await sha256Hex(new TextEncoder().encode('abc')), SHA, 'and works again once restored');
});

/* ------------------------------------------------------------ the record */

test('a Doc is a record: exactly these fields, no file content, a cleaned name, a real fingerprint or null, "as of" never today', () => {
  const dd = D.newDd();
  const { doc } = D.addDoc(dd, { ...file({ name: 'a/b\\c:<d>.pdf', sha256: SHA, pages: 3, type: 'rentroll', typeBy: 'reader' }), bytes: new Uint8Array(10), data: 'AAAA', text: 'secret' }, { now: NOW });
  assert.deepEqual(Object.keys(doc).sort(), ['addedAt', 'asOf', 'id', 'kind', 'name', 'note', 'pages', 'read', 'sha256', 'size', 'status', 'supersededBy', 'type', 'typeBy']);
  assert.match(doc.id, /^dd_[0-9a-z]{12}$/);
  assert.equal(doc.name, 'a-b-c-d-.pdf');
  assert.equal(doc.asOf, null, 'unknown is null, never today');
  assert.equal(doc.status, 'received');
  assert.equal(doc.sha256, SHA);
  assert.ok(!JSON.stringify(dd).includes('secret') && !JSON.stringify(dd).includes('AAAA'));
  const bad = D.addDoc(dd, file({ sha256: 'ABC', size: -5, pages: 0, kind: 'weird', asOf: '2026-02-30' }), { now: NOW }).doc;
  assert.deepEqual([bad.sha256, bad.size, bad.pages, bad.kind, bad.asOf], [null, 0, null, 'other', null], 'a bad value is null or zero-size, never invented');
  assert.equal(D.addDoc(dd, file({ sha256: SHA.replace('b', 'c'), asOf: '2026-03-04' }), { now: NOW }).doc.asOf, '2026-03-04');
});

test('the file name never sets a type: only a known type id from a reader, the text or the broker does; an unknown id is null, not "other"', () => {
  const dd = D.newDd();
  assert.deepEqual([D.addDoc(dd, file({ name: 'SNDA estoppel.pdf', type: 'snda', typeBy: 'filename' }), { now: NOW }).doc].map((x) => [x.type, x.typeBy]), [['snda', null]], 'filename is not a way of setting a type');
  const other = D.addDoc(dd, file({ name: 'x.pdf', type: 'other', typeBy: 'broker', sha256: SHA }), { now: NOW }).doc;
  assert.deepEqual([other.type, other.typeBy], [null, null]);
  assert.equal(T.classify('', 'rent-roll-final.pdf').type, null, 'a name alone sets nothing');
  assert.equal(T.classify('', 'rent-roll-final.pdf').suggest, 'rentroll');
  assert.equal(T.suggestFromName('Phase 1 ESA.pdf'), 'esa1');
});

test('the same fingerprint is not added twice; a 201st Doc is refused; a note is cut at 500 characters on a character boundary', () => {
  const dd = D.newDd();
  const a = D.addDoc(dd, file({ sha256: SHA }), { now: NOW });
  const b = D.addDoc(dd, file({ name: 'copy.pdf', sha256: SHA }), { now: NOW });
  assert.match(b.error, /Rent roll\.pdf was already added on 2026-10-30\./);
  assert.equal(b.dup, a.doc);
  assert.equal(dd.docs.length, 1);
  assert.equal(D.addDoc(dd, file({ name: 'u1.pdf' }), { now: NOW }).doc.sha256, null, 'no fingerprint: not deduped by one');
  const full = D.newDd();
  for (let i = 0; i < 200; i++) assert.ok(D.addDoc(full, file({ name: `f${i}.pdf`, size: i }), { now: NOW }).doc);
  assert.match(D.addDoc(full, file({ name: 'f200.pdf' }), { now: NOW }).error, /at most 200 documents/);
  assert.equal(full.docs.length, 200);
  assert.ok(D.setNote(full, full.docs[0].id, 'x'.repeat(501)));
  assert.equal(full.docs[0].note.length, 500);
  D.setNote(full, full.docs[0].id, `${'x'.repeat(499)}😀`);
  assert.equal(full.docs[0].note, 'x'.repeat(499), 'a pair of surrogates is never split');
  assert.equal(D.cleanName('é'.repeat(300)).length <= 200, true);
});

test('not applicable needs a reason: blank is refused, a long one is cut to 200, and it can be cleared', () => {
  const dd = D.newDd();
  for (const r of ['', '   ', null, undefined]) assert.match(D.setNa(dd, 'survey', r, { now: NOW }).error, /reason is needed/);
  assert.deepEqual(dd.na, {});
  assert.match(D.setNa(dd, 'nonsense', 'x').error, /not a document type/);
  assert.ok(D.setNa(dd, 'survey', ` ${'r'.repeat(300)} `, { now: NOW }).ok);
  assert.equal(dd.na.survey.reason.length, 200);
  assert.equal(dd.na.survey.at, NOW);
  assert.equal(D.clearNa(dd, 'survey').at, NOW);
  assert.deepEqual(dd.na, {});
});

test('retype, review, as-of, remove and restore', () => {
  const dd = D.newDd();
  const { doc } = D.addDoc(dd, file({ sha256: SHA }), { now: NOW });
  assert.ok(D.retype(dd, doc.id, 'title'));
  assert.deepEqual([doc.type, doc.typeBy], ['title', 'broker']);
  assert.ok(!D.retype(dd, doc.id, 'bogus'));
  assert.ok(D.retype(dd, doc.id, null));
  assert.deepEqual([doc.type, doc.typeBy], [null, null]);
  assert.ok(D.markReviewed(dd, doc.id) && doc.status === 'reviewed');
  assert.ok(!D.setAsOf(dd, doc.id, '2026-13-01') && doc.asOf === null);
  assert.ok(D.setAsOf(dd, doc.id, '2026-03-04') && doc.asOf === '2026-03-04');
  assert.ok(D.setAsOf(dd, doc.id, '') && doc.asOf === null);
  const gone = D.removeDoc(dd, doc.id);
  assert.equal(dd.docs.length, 0);
  D.restoreDoc(dd, gone);
  assert.deepEqual(dd.docs, [doc]);
});

test('a reader marking a file read updates the same Doc (by fingerprint), or adds one with typeBy reader', () => {
  const dd = D.newDd();
  const checks = { pass: 5, warn: 1, fail: 0 };
  const first = D.recordRead(dd, { ...file({ sha256: SHA, type: 'rentroll', pages: 2 }), read: { reader: 'rrpdf', target: 'rr', checks } }, { now: NOW });
  assert.ok(first.added);
  assert.deepEqual([first.doc.status, first.doc.typeBy, first.doc.read.reader, first.doc.read.target, first.doc.read.at], ['read', 'reader', 'rrpdf', 'rr', NOW]);
  assert.deepEqual(first.doc.read.checks, checks);
  const again = D.recordRead(dd, { ...file({ sha256: SHA, type: 'rentroll' }), read: { reader: 'rrpdf', target: 'rr', checks: { pass: 6, warn: 0, fail: 0 } } }, { now: '2026-10-31T00:00:00.000Z' });
  assert.ok(!again.added && again.doc === first.doc && dd.docs.length === 1);
  assert.equal(first.doc.read.checks.pass, 6);
  const typed = D.addDoc(dd, file({ name: 't.csv', kind: 'csv', size: 77, sha256: SHA.replace('b', 'c') }), { now: NOW }).doc;
  D.recordRead(dd, { ...file({ name: 't.csv', kind: 'csv', size: 77, sha256: SHA.replace('b', 'c'), type: 't12' }), read: { reader: 't12', target: 't12', checks } }, { now: NOW });
  assert.deepEqual([typed.type, typed.typeBy, typed.status], ['t12', 'reader', 'read'], 'an untyped Doc a reader accepted gets its type, by the reader');
  const reviewed = D.addDoc(dd, file({ name: 'r.pdf', sha256: SHA.replace('b', 'd') }), { now: NOW }).doc;
  D.markReviewed(dd, reviewed.id);
  D.recordRead(dd, { ...file({ name: 'r.pdf', sha256: SHA.replace('b', 'd'), type: 'om' }), read: { reader: 'om', target: 'omRead', checks } }, { now: NOW });
  assert.equal(reviewed.status, 'reviewed', 'reading again never undoes the broker’s review');
});

test('ddOf makes whole a list a damaged backup left parts out of', () => {
  const d = { dd: { v: 1, preset: 'bogus', na: [], docs: null } };
  const dd = D.ddOf(d);
  assert.deepEqual(dd, { v: 1, preset: null, na: {}, docs: [] });
  const empty = {};
  assert.deepEqual(D.ddOf(empty), D.newDd());
  assert.equal(empty.dd.docs.length, 0);
});

/* ------------------------------------------------------------ classifier */

const ROWS = [
  // [text, name, expected type, expected ask head (when unsure)]
  ['SUBORDINATION, NON-DISTURBANCE AND ATTORNMENT AGREEMENT. The Lender agrees.', 'doc1.pdf', 'snda'],
  ['ALTA/NSPS Land Title Survey. Legal description. Flood zone X per FEMA. Easement noted.', 'x.pdf', 'survey'],
  ['Phase I Environmental Site Assessment per ASTM E1527-21. No recognized environmental condition (REC) found.', 'scan.pdf', 'esa1'],
  ['Certificate of Liability Insurance ACORD 25. Policy number 1234. General liability. Premium and deductible.', 'coi.pdf', 'insurance'],
  ['TENANT ESTOPPEL CERTIFICATE. The lease is in full force and effect. No defaults. Security deposit $1.', 'a.pdf', 'estoppel'],
  ['Commitment for Title Insurance. Schedule B exceptions and requirements. ALTA policy.', 'c.pdf', 'title'],
  ['Property Condition Assessment per ASTM E2018. Immediate repairs and replacement reserve table.', 'p.pdf', 'pcr'],
  ['Appraisal report. USPAP compliant. Market value conclusion. Highest and best use.', 'v.pdf', 'appraisal'],
  // not clear enough: asks, never guesses
  ['', 'survey.pdf', null],
  ['see you tomorrow at noon', 'estoppel.pdf', null],
  ['The Tenant and the Landlord signed.', 'lease.pdf', null],
  ['This amendment is between the Landlord and the Tenant.', 'x.pdf', null],
  ['a lender', 'snda.pdf', null],
];
test('classifier table: clear text sets a type; unclear, thin or close text asks and sets nothing', () => {
  for (const [text, name, want] of ROWS) {
    const c = T.classify(text, name);
    assert.equal(c.type, want, `${name}: ${text.slice(0, 40)}`);
    if (want === null) assert.ok(c.ask.length <= 3);
    else assert.deepEqual(c.ask, []);
  }
  // the name suggestion leads the question without deciding it
  const c = T.classify('The Tenant and the Landlord signed.', 'estoppel-final.pdf');
  assert.equal(c.type, null);
  assert.equal(c.ask[0], 'estoppel');
  assert.ok(c.ask.length <= 3);
});

test('the scoring rule: a best score under 2, or a lead of less than 2 over the second, asks', () => {
  // two types with the same two matches
  const tie = T.classify('Tenant estoppel certificate. Full force and effect. Subordination, non-disturbance and attornment.', '');
  const [a, b] = tie.scores;
  assert.ok(a.score - b.score < 2 && tie.type === null, JSON.stringify(tie.scores.slice(0, 3)));
  const thin = T.classify('Schedule B', '');
  assert.equal(thin.type, null, 'one match is below 2');
  assert.equal(T.classify('', '').ask.length, 0);
});

/* --------------------------------------------------- readers decide first */

const gridOf = (rows, sheet = 'Sheet1') => ({ sheet, rows: rows.map((cells, i) => ({ r: i + 1, cells })) });
const T12 = gridOf([['Invented Court'], ['GL', 'Jan 2025', 'Feb 2025', 'Mar 2025', 'Total'], ['Rent', 100, 100, 100, 300], ['Taxes', 10, 10, 10, 30]]);
const ROLL = gridOf([['Unit', 'Tenant', 'SF', 'Lease Start', 'Lease End', 'Annual Rent'], ['101', 'Example Cafe', 1500, '2024-01-01', '2029-12-31', 45000], ['102', 'Sample Books', 800, '2024-01-01', '2029-12-31', 24000]]);

test('a workbook the T-12 reader accepts is a T-12, one the rent roll reader accepts is a rent roll (typeBy reader); both asks; neither is scored on its text', () => {
  const t = identify({ name: 'whatever.xlsx', grids: [T12] });
  assert.deepEqual([t.type, t.typeBy, t.reader], ['t12', 'reader', 't12']);
  const r = identify({ name: 'whatever.xlsx', grids: [ROLL] });
  assert.deepEqual([r.type, r.typeBy, r.reader], ['rentroll', 'reader', 'rrsheet']);
  const both = identify({ name: 'both.xlsx', grids: [T12, ROLL] });
  assert.deepEqual([both.type, both.typeBy, both.ask], [null, null, ['t12', 'rentroll']], 'both readers accept it: nothing decides, so ask');
  const neither = identify({ name: 'estoppel.xlsx', grids: [gridOf([['Tenant estoppel certificate'], ['Full force and effect'], ['No defaults']])] });
  assert.deepEqual([neither.type, neither.typeBy, neither.looks], [null, null, 'estoppel']);
  const none = identify({ name: 'rent-roll.xlsx', grids: [gridOf([['hello'], ['world']])] });
  assert.deepEqual([none.type, none.typeBy], [null, null]);
  assert.equal(none.ask[0], 'rentroll', 'the file name only leads the question');
});

test('property: a random file name never sets a type or typeBy; the broker, a reader or the text does', () => {
  fc.assert(fc.property(fc.string({ maxLength: 60 }), (name) => {
    const v = identify({ name, grids: [gridOf([['hello'], ['world']])] });
    assert.equal(v.type, null);
    assert.equal(v.typeBy, null);
    assert.ok(D.addDoc(D.newDd(), file({ name, type: null, typeBy: 'filename' }), { now: NOW }).doc.typeBy === null);
  }), { numRuns: 200 });
});

test('property: typeBy is reader only when a reader accepts the file; the text alone never sets a type; close scores always ask', () => {
  const word = fc.constantFrom('Tenant', 'Landlord', 'lease', 'estoppel certificate', 'full force and effect', 'ALTA', 'survey', 'rent roll', 'Jan 2025', 'Feb 2025', 'Mar 2025', 'Total', 'Unit', 'SF', 'Lender', 'attornment', 'Schedule B', 'x', '1', '42', 'budget', 'insured', 'premium');
  const cells = fc.array(fc.array(word, { minLength: 1, maxLength: 6 }), { minLength: 1, maxLength: 12 });
  fc.assert(fc.property(cells, fc.string({ maxLength: 20 }), (rows, name) => {
    const g = gridOf(rows);
    const v = identify({ name, grids: [g] });
    const t12 = (() => { try { return layoutOf(g.rows, { sheet: g.sheet }).monthCols.length >= 3; } catch { return false; } })();
    const roll = !!headerAndRows(rows, g.sheet);
    if (v.typeBy === 'reader') assert.ok(v.type === 't12' ? t12 : roll, 'the reader that named it accepts it');
    assert.ok(v.typeBy === 'reader' || v.type === null, 'the text alone never sets a type');
    if (v.looks) { const sc = T.scoreText(v.text); assert.ok(sc[0].score >= 2 && sc[0].score - (sc[1] ? sc[1].score : 0) >= 2); }
    const sc = T.scoreText(v.text);
    if (!v.reader && sc.length && (sc[0].score < 2 || sc[0].score - (sc[1] ? sc[1].score : 0) < 2)) assert.equal(v.looks, null, 'close scores ask');
  }), { numRuns: 300 });
});

test('a PDF’s kind comes from the rent roll reader’s docKind: an OM or a rent roll is typeBy reader, a scan is flagged for OCR, anything else is scored', () => {
  const rollPage = 'RENT ROLL\nAs of 10/01/2026\nSuite  Tenant  SF  Lease Start  Lease End  Annual Rent\n101  Example Cafe  1,500  01/01/2024  12/31/2029  $45,000\n102  Sample Books  800  01/01/2024  12/31/2029  $24,000\n103  Copper Yoga  1,200  03/01/2023  02/28/2033  $36,000\nTotal  3,500  $105,000';
  const roll = identify({ name: 'x.pdf', pages: [rollPage] });
  assert.ok(['rentroll', null].includes(roll.type));
  if (roll.type) assert.deepEqual([roll.typeBy, roll.reader], ['reader', 'rrpdf']);
  const scan = identify({ name: 'scan.pdf', pages: ['  '] });
  assert.ok(scan.scanned && scan.type === null);
  const snda = identify({ name: 'x.pdf', pages: ['SUBORDINATION, NON-DISTURBANCE AND ATTORNMENT AGREEMENT\n'.repeat(3) + 'The Lender and the Tenant agree to this long document. '.repeat(10)] });
  assert.deepEqual([snda.type, snda.typeBy, snda.looks], [null, null, 'snda'], 'the text only says what it looks like');
});

/* ------------------------------------------------- no figure depends on it */
test('deal.dd is not an input to any calculation: the analysis input, and the impact map, are the same with and without it', async () => {
  const fs = await import('node:fs');
  const { readBackup } = await import('../app/backup.js');
  const { migrateDeal } = await import('../app/migrate.js');
  const { analysisInput, NOT_CALCULATED, inputOfPath } = await import('../app/impact.js');
  const [d] = readBackup(fs.readFileSync(new URL('./fixtures/backup-4.7.73-before-dd.json', import.meta.url), 'utf8')).deals;
  migrateDeal(d, { today: '2026-10-10' });
  const bare = JSON.stringify(analysisInput(d));
  D.addDoc(d.dd, file({ type: 'rentroll', typeBy: 'reader', sha256: SHA }), { now: NOW });
  D.setNa(d.dd, 'survey', 'none', { now: NOW });
  d.dd.preset = 'retail';
  d.sources.price.doc = d.dd.docs[0].id;
  assert.equal(JSON.stringify(analysisInput(d)), bare);
  assert.ok('dd' in NOT_CALCULATED, 'listed as an input nothing calculates from');
  assert.deepEqual(inputOfPath(['dd', 'docs']), { input: 'dd' });
});

/* ------------------------------------------------- review fixes */

test('a budget workbook, an annual-only statement and text that reads as a T-12 are never typed by a reader or by their text: they ask', () => {
  const months = [['GL', 'Jan 2026', 'Feb 2026', 'Mar 2026', 'Total'], ['Rent', 100, 100, 100, 300], ['Taxes', 10, 10, 10, 30]];
  const budget = identify({ name: 'x.xlsx', grids: [gridOf([['Operating budget 2026'], ...months], 'Budget 2026')] });
  assert.deepEqual([budget.type, budget.typeBy], [null, null], 'the T-12 import refuses a budget, so it is not a T-12');
  const annual = identify({ name: 'x.xlsx', grids: [gridOf([['GL', 'Annual'], ['Rent', 1200], ['Taxes', 120]])] });
  assert.deepEqual([annual.type, annual.typeBy], [null, null]);
  const pdf = identify({ name: 'x.pdf', pages: ['TRAILING 12 OPERATING STATEMENT\nNet operating income\nTotal operating expenses\nEffective gross income\n'.repeat(3) + 'text '.repeat(80)] });
  assert.deepEqual([pdf.type, pdf.typeBy, pdf.looks], [null, null, null]);
  assert.deepEqual(pdf.ask, ['t12', 'priorStmt', 'budget']);
});

test('an appraisal that also trips the OM test is asked about, not typed OM', () => {
  const text = 'APPRAISAL REPORT\nUSPAP compliant. Market value conclusion. Highest and best use. Sales comparison approach.\nThe asking price and the cap rate are discussed in the executive summary.\n' + 'filler text for the page. '.repeat(40);
  const v = identify({ name: 'x.pdf', pages: [text] });
  assert.deepEqual([v.type, v.typeBy], [null, null]);
  assert.ok(v.ask.includes('appraisal') && v.ask.includes('om'));
  const om = identify({ name: 'om.pdf', pages: ['OFFERING MEMORANDUM\nInvestment highlights. Asking price $5,000,000. Cap rate 6.5%.\n' + 'filler text for the page. '.repeat(40)] });
  assert.deepEqual([om.type, om.typeBy], ['om', 'reader']);
});

test('zero-width and control characters are no reason', () => {
  const dd = D.newDd();
  for (const r of ['\u200b\u200b', '\u2060', '\ufeff \u200d', '\u0007\u0000']) assert.match(D.setNa(dd, 'survey', r).error, /reason is needed/);
  assert.deepEqual(dd.na, {});
});

test('a damaged or hostile document list is made safe: nothing throws, bad values are null, 200 Docs at most', () => {
  const hostile = {
    v: 1, preset: { x: 1 }, na: { unitMix: null, constructor: { reason: 'x' }, __proto__: { reason: 'y' }, survey: { reason: 5 }, title: { reason: ' ok ', at: 7 }, toString: { reason: 'z' } },
    docs: [null, 7, 'x', [], { id: 5, name: { a: 1 }, type: 'constructor', typeBy: 'filename', kind: 'exe', size: -1, sha256: 'ZZ', pages: 'x', addedAt: 99, asOf: 'today', status: 'x', read: 'x', note: 'n'.repeat(900) },
      { id: 'dup', type: '__proto__', name: 'a' }, { id: 'dup', name: 'b' }, { id: 'hasOwnProperty', type: 'toString', read: { reader: 'x', target: 'rr', checks: 5 } }, ...Array.from({ length: 300 }, (_, i) => ({ id: `d${i}`, name: `f${i}` }))],
  };
  const d = { figures: { ptype: 'Retail' }, dd: hostile };
  assert.doesNotThrow(() => D.checklist(d));
  const dd = D.ddOf(d);
  assert.equal(d.dd, dd);
  assert.deepEqual(Object.keys(dd.na), ['title']);
  assert.deepEqual(dd.na.title, { reason: 'ok', at: '' });
  assert.equal(dd.preset, null);
  assert.equal(dd.docs.length, 200);
  assert.ok(dd.docs.every((x) => x.type === null && x.typeBy === null && x.addedAt === '' && x.asOf === null && x.note.length <= 500 && x.read === null));
  assert.equal(dd.docs.filter((x) => x.id === 'dup').length, 1);
  assert.equal(dd.docs[0].kind, 'other');
  assert.equal(dd.docs[0].size, 0);
  assert.ok(typeof dd.docs[0].name === 'string' && /^dd_/.test(dd.docs[0].id));
  assert.deepEqual(D.ddOf(d), dd, 'cleaning is stable');
  assert.doesNotThrow(() => D.checklist(d));
  for (const bad of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    assert.equal(T.isType(bad), false);
    assert.ok(D.setNa(D.newDd(), bad, 'x').error, bad);
    assert.equal(D.addDoc(D.newDd(), file({ type: bad, typeBy: 'broker' }), { now: NOW }).doc.type, null);
    const w = D.newDd();
    const { doc } = D.addDoc(w, file(), { now: NOW });
    assert.equal(D.retype(w, doc.id, bad), false);
  }
  // a Doc with no addedAt does not break the duplicate message
  const e = D.newDd();
  e.docs.push({ ...D.addDoc(D.newDd(), file({ sha256: SHA }), { now: NOW }).doc, addedAt: 12 });
  assert.doesNotThrow(() => D.addDoc(D.ddOf({ dd: e }) && e, file({ sha256: SHA }), { now: NOW }));
});

test('a hostile backup restores through readBackup and the deal still draws its checklist', async () => {
  const fs = await import('node:fs');
  const { readBackup, planRestore } = await import('../app/backup.js');
  const raw = JSON.parse(fs.readFileSync(new URL('./fixtures/backup-4.7.73-before-dd.json', import.meta.url), 'utf8'));
  raw.deals[0].dd = { v: 1, na: { unitMix: null }, docs: [null, { id: 1, addedAt: {}, type: 'constructor' }] };
  raw.deals[0].schema = 7;
  const b = readBackup(JSON.stringify(raw));
  const put = planRestore(b, { deals: [], kv: {}, session: null, local: {} }).deals.put;
  const d = put.find((x) => x.id === raw.deals[0].id);
  assert.doesNotThrow(() => D.checklist(d));
  assert.equal(D.ddOf(d).docs.length, 1);
});

test('an empty or untouched document list is no edit: History would record nothing for any fixture deal', async () => {
  const fs = await import('node:fs');
  const { readBackup } = await import('../app/backup.js');
  const { migrateDeal } = await import('../app/migrate.js');
  const { historyEntry, recordable } = await import('../app/history.js');
  for (const f of fs.readdirSync(new URL('./fixtures/', import.meta.url)).filter((x) => /^backup-.*\.json$/.test(x))) {
    let deals;
    try { deals = readBackup(fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8')).deals; } catch { continue; }
    for (const d of deals) {
      migrateDeal(d, { today: '2026-10-10' });
      const stored = structuredClone(d);
      delete stored.dd;
      assert.equal(historyEntry(stored, d), null, `${f}: ${d.name}`);
      const after = structuredClone(d);
      D.ddOf(after);
      assert.equal(historyEntry(d, after), null);
      assert.ok(!('dd' in recordable(d)));
    }
  }
  // but a real change is recorded
  const d = { id: 'x', figures: {}, dd: D.newDd() };
  const after = structuredClone(d);
  D.setNa(after.dd, 'survey', 'none');
  assert.ok(historyEntry(d, after));
});

/* ------------------------------------------------- second review */

test('History Undo and Redo work when the document list goes to or from empty', async () => {
  const { historyEntry, applyChanges } = await import('../app/history.js');
  const base = () => ({ id: 'x', figures: { price: 1 }, dd: D.newDd() });
  const step = (before, after) => historyEntry(before, after).entry.changes;
  // add the first document, Undo, the card draws (an empty list again), Redo
  const b1 = base(); const a1 = structuredClone(b1);
  D.addDoc(a1.dd, file({ type: 'rentroll', typeBy: 'reader' }), { now: NOW });
  const c1 = step(b1, a1);
  const live = structuredClone(a1);
  assert.deepEqual(applyChanges(live, c1, { backwards: true }), []);
  D.ddOf(live);
  assert.deepEqual(applyChanges(live, c1), [], 'Redo is not refused because an empty list was made meanwhile');
  assert.equal(live.dd.docs.length, 1);
  // remove the last document, Undo
  const b2 = structuredClone(a1); const a2 = structuredClone(a1);
  D.removeDoc(a2.dd, a2.dd.docs[0].id);
  const c2 = step(b2, a2);
  const live2 = structuredClone(a2);
  assert.deepEqual(applyChanges(live2, c2, { backwards: true }), []);
  assert.equal(live2.dd.docs.length, 1);
  // set then clear the property type, and the only n/a
  for (const set of [(dd) => { dd.preset = 'retail'; }, (dd) => { D.setNa(dd, 'survey', 'none'); }]) {
    const b3 = base(); const a3 = structuredClone(b3); set(a3.dd);
    const set3 = step(b3, a3);
    const cleared = structuredClone(a3); cleared.dd = D.newDd();
    const clear3 = step(a3, cleared);
    const live3 = structuredClone(cleared);
    assert.deepEqual(applyChanges(live3, clear3, { backwards: true }), [], 'the clearing can be undone');
    assert.deepEqual(applyChanges(live3, set3, { backwards: true }), [], 'and so can the setting');
    assert.ok(!live3.dd || !live3.dd.preset);
  }
});

test('a workbook with an Annual actuals sheet and a monthly Budget sheet is not typed T-12; a broker opinion of value asks', () => {
  const monthly = [['GL', 'Jan 2026', 'Feb 2026', 'Mar 2026', 'Total'], ['Rent', 100, 100, 100, 300], ['Taxes', 10, 10, 10, 30]];
  const v = identify({ name: 'x.xlsx', grids: [gridOf([['GL', '2024', '2025'], ['Rent', 1200, 1300], ['Taxes', 120, 130]], 'Annual'), gridOf(monthly, 'Budget')] });
  assert.deepEqual([v.type, v.typeBy], [null, null]);
  const bov = identify({ name: 'bov.pdf', pages: ['BROKER OPINION OF VALUE\nExecutive summary. Recommended asking price $5,000,000.\n' + 'filler text for the page. '.repeat(40)] });
  assert.deepEqual([bov.type, bov.typeBy], [null, null]);
  assert.ok(bov.ask.includes('om') && bov.ask.includes('appraisal'));
});

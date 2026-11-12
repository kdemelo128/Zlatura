import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdfPageProfiles } from '../app/pdfprofile.js';
import { readOm } from '../app/om.js';
import { docKind } from '../app/rrdoc.js';
import { buriedRoll, buriedRollPdf } from './pdfprofile-fixtures.js';
globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis; globalThis.navigator ||= { userAgent: 'node' };
const { identify } = await import('../app/ddintake.js');

test('each page has evidence, including a roll on page fourteen and a later statement and summary', () => {
  const pages = buriedRoll(); const p = pdfPageProfiles(pages);
  assert.equal(p.length, 16); assert.deepEqual(p.map((p) => p.page), Array.from({ length: 16 }, (_, i) => i + 1));
  assert.equal(p[2].kind, 'unreadable'); assert.equal(p[2].needsOcr, true);
  assert.ok(p[13].roles.includes('rentroll')); assert.equal(p[13].rentRollRows, 2);
  assert.ok(p[14].roles.includes('summary')); assert.equal(p[14].rentRollRows, 0);
  assert.ok(p[15].roles.includes('statement')); assert.equal(p[15].statementTables, 1);
});
test('an OM with a parsed rent-roll section goes to the OM reader without an OM-versus-lease question', () => {
  const v = identify({ pages: buriedRoll() });
  assert.equal(v.type, 'om'); assert.equal(v.reader, 'om'); assert.deepEqual(v.ask, []);
  assert.equal(v.pageProfiles[13].rentRollRows, 2);
  const om = readOm(buriedRoll()); assert.equal(om.rentRoll.rows.length, 2);
  assert.deepEqual(om.rentRoll.rows.map((r) => r.annual), [60000, 42000]);
  assert.deepEqual(om.rentRoll.rows.map((r) => r.src.page), [14, 14]);
});
test('a rent-roll title after page two is recognised with its original page number', () => {
  const d = docKind(buriedRoll({ om: false }));
  assert.equal(d.kind, 'rentroll'); assert.match(d.why.join(' '), /page 14/);
  assert.deepEqual(d.roll.rows.map((r) => r.src.page), [14, 14]);
});
test('joined header words do not hide explicit rent, tenant and lease columns', () => {
  const om = readOm(buriedRoll({ joinedHeaders: true }));
  assert.ok(om.rentRoll); assert.equal(om.rentRoll.rows.length, 2);
  assert.deepEqual(om.rentRoll.rows.map((r) => [r.tenant, r.annual, r.end.toISOString().slice(0, 10)]), [['Maple Leaf Bakery', 60000, '2030-12-31'], ['Quillfeather Books', 42000, '2027-05-31']]);
});
test('explicit BOV wording is still a question, and narrative mentions are not parsed rows', () => {
  const pages = buriedRoll(); pages[0] = 'Broker opinion of value\n' + pages[0];
  assert.equal(identify({ pages }).type, null);
  const p = pdfPageProfiles(['Rent roll information: tenants pay annual rent. The lease schedule will be supplied separately.']);
  assert.equal(p[0].rentRollRows, 0); assert.equal(p[0].roles.includes('rentroll'), false);
});
test('a small text rent roll with real rows is not discarded as a scan', () => {
  const pages = ['Rent Roll\nUnit    Tenant       Annual Rent\nA1      Fictional    $24,000'];
  const d = docKind(pages); assert.notEqual(d.kind, 'scanned'); assert.ok(d.roll);
});
test('page-fourteen detection survives actual positioned PDF extraction', async () => {
  const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;
  const { pdfPages } = await import('../app/pdftext.js');
  const layouts = []; const pages = await pdfPages(pdfjs, buriedRollPdf(), { layouts, verbosity: 0 });
  const v = identify({ pages, layouts }); assert.equal(v.reader, 'om');
  const om = readOm(pages, { layouts }); assert.equal(om.rentRoll.rows.length, 6);
  assert.ok(om.rentRoll.rows.every((r) => r.src.page >= 14));
  assert.equal(v.pageProfiles[13].rentRollRows, 6);
});

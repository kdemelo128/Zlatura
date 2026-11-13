/* The OM diagnostic (tests/tools/om-diag.mjs, doc-local.mjs --om): every reason code on an invented OM, that the numbers are
 * the deal page's own path (the same functions as readOmFile), that nothing from a document is printed, and the joined-header
 * split in the OM rent roll reader ("LeaseEnd" is a lease end). All files are invented (tests/om-diag-fixtures.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis; globalThis.navigator ||= { userAgent: 'node' };
const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;
const { pdfPages } = await import('../app/pdftext.js');
const { readOm } = await import('../app/om.js');
const { FIXTURES, pdfFixture } = await import('./om-diag-fixtures.js');
const { omDiagnose, omLine } = await import('./tools/om-diag.mjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (name) => { const layouts = []; const pages = await pdfPages(pdfjs, pdfFixture(name), { layouts, verbosity: 0 }); return { pages, layouts }; };
const diag = async (name) => { const { pages, layouts } = await read(name); return omDiagnose(pages, layouts, { asOf: '2026-06-01' }); };

const CODES = {
  plain: [], twoRow: [], scannedRoll: ['roll-on-scanned-page'], allScanned: ['roll-on-scanned-page'], split: ['rows-split-across-pages'],
  splitUnread: ['rows-split-across-pages:unread-tail'], joined: ['joined-header'], psfOnly: ['rent-per-sf-only'],
  noTenant: ['header-not-matched:tenant'], noMoney: ['header-not-matched:rent-or-sf'], merged: ['table-cells-merged'],
  prose: ['roll-not-detected'], held: ['held-by-check:total'], ambiguous: ['rent-column-ambiguous'],
};
for (const [name, want] of Object.entries(CODES)) {
  test(`om-diag: ${name} gives ${want.join(', ') || 'no reason'}`, async () => {
    assert.deepEqual((await diag(name)).reasons, want);
  });
}
test('om-diag: every fixture is covered, and every reason code of the tool appears', () => {
  assert.deepEqual(Object.keys(FIXTURES).sort(), Object.keys(CODES).sort());
  const src = fs.readFileSync(path.join(ROOT, 'tests/tools/om-diag.mjs'), 'utf8');
  const used = new Set(Object.values(CODES).flat().map((c) => c.split(':')[0]));
  for (const c of src.match(/reasons\.push\(['`]([a-z-]+)/g).map((x) => x.replace(/reasons\.push\(['`]/, ''))) assert.ok(used.has(c) || ['no-rent-figures', 'no-sf-figures', 'header-found-no-rows', 'roll-partly-on-scanned-page'].includes(c), `a fixture for ${c}`);
});

test('om-diag: a header the reader refused reports which column kinds it found, from the fixed vocabulary only', async () => {
  const { COLUMN_VOCAB, columnKinds } = await import('./tools/om-diag.mjs');
  const r = await diag('noTenant');
  assert.deepEqual(r.headerKinds, ['lease-end', 'lease-start', 'rent', 'sf']);
  assert.ok(r.headerKinds.every((k) => COLUMN_VOCAB.includes(k)));
  assert.match(omLine('file-01', r), /header columns found lease-end,lease-start,rent,sf/);
  // a multifamily header with the words a unit roll uses: every kind named from the vocabulary, no header text
  assert.deepEqual(columnKinds(['Unit', 'Unit Type', 'Beds/Baths', 'SF', 'Market Rent', 'Current Rent', 'Rent PSF', 'Lease Start', 'Lease End', 'Term', 'Status', 'Security Deposit', 'Monthly Charges', 'Zebra']), ['baths', 'beds', 'charges', 'deposit', 'lease-end', 'lease-start', 'market-rent', 'other', 'rent', 'rent-psf', 'sf', 'status', 'term', 'type', 'unit']);
  assert.ok(!JSON.stringify(r).includes('Annual'), 'no header text in the result');
  assert.deepEqual((await diag('plain')).headerKinds, [], 'a roll that was read reports none');
});
test('om-diag: the plain roll counts: rows, rent, SF, lease end, the total dropped, pages', async () => {
  const r = await diag('plain');
  assert.deepEqual([r.pages, r.rows, r.rowsRent, r.rowsSf, r.rowsEnd, r.totalsDropped, r.rowsOnDeal, r.rowsHeld], [2, 4, 4, 4, 4, 1, 4, 0]);
  assert.deepEqual(r.rollPages, [2]); assert.deepEqual(r.headerPages, [2]);
  assert.equal(r.ocrNeeded, false);
});
test('om-diag: a scanned roll page needs OCR and the deal page offers it; the held roll shows no rows on the deal', async () => {
  const s = await diag('scannedRoll');
  assert.equal(s.noTextPages, 1); assert.equal(s.ocrNeeded, true); assert.equal(s.ocrOffered, true);
  const h = await diag('held');
  assert.deepEqual([h.rows, h.rowsOnDeal, h.rowsHeld, h.failChecks], [4, 0, 4, 1]);
});
test('om-diag: the numbers are the deal page path: readOm then the same record functions', async () => {
  for (const n of ['plain', 'split', 'joined']) {
    const { pages, layouts } = await read(n);
    const om = readOm(pages, { layouts, asOf: '2026-06-01' });
    assert.equal((await diag(n)).rows, om.rentRoll.rows.length, n);
  }
});

test('joined header words (LeaseEnd, AnnualRent) read as the lease end and annual rent columns', async () => {
  const { pages, layouts } = await read('joined');
  const roll = readOm(pages, { layouts }).rentRoll;
  assert.equal(roll.rows.length, 4);
  assert.deepEqual(roll.rows.map((r) => r.annual), [60000, 42000, 36000, 54000]);
  assert.deepEqual(roll.rows.map((r) => r.end.toISOString().slice(0, 10)), ['2030-12-31', '2027-05-31', '2033-02-28', '2028-08-31']);
  const sp = (await read('plain')).pages; // an ordinary header is unchanged
  assert.deepEqual(readOm(sp).rentRoll.columns.map((c) => c.kind), ['suite', 'tenant', 'sf', 'start', 'end', 'annual', 'psf', 'monthly']);
});

test('doc-local --om prints counts only: no name, figure or text; works with --reasons', async () => {
  const d = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'om-diag-')), 'docs'); fs.mkdirSync(d);
  for (const n of ['plain', 'split', 'joined', 'scannedRoll', 'prose']) fs.writeFileSync(path.join(d, `canary-${n}-offering-memorandum.pdf`), pdfFixture(n));
  for (const extra of [[], ['--reasons']]) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tests/tools/doc-local.mjs'), d, '--allow-outside-private', '--om', ...extra], { encoding: 'utf8', timeout: 180000 });
    assert.equal(r.status, 0, r.stderr);
    const out = r.stdout;
    assert.match(out, /om diagnostic: 5 OM file\(s\)/);
    assert.equal(out.split('\n').filter((l) => /^file-0\d \| pages /.test(l)).length, 5);
    for (const s of ['Maple Leaf', 'Quillfeather', 'Copperline', 'Bluefin', '60,000', '192,000', 'canary', 'Asking Price', 'Market Overview']) assert.ok(!out.includes(s), `no "${s}" in the output`);
    for (const c of ['joined-header', 'roll-on-scanned-page', 'roll-not-detected', 'rows-split-across-pages']) assert.ok(out.includes(c), c);
    if (extra.length) assert.match(out, /\nreason \| files/);
  }
});

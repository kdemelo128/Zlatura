/* Deterministic checks on figures read from documents: quote verification,
 * grouping readings that agree, and the rent roll against the OM. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFigure, numbersIn, normalizeValue, sameValue, verifyQuote, reconcile, crossChecks, squash } from '../app/reconcile.js';

test('parsing figures as printed', () => {
  assert.equal(parseFigure('$6,450,000'), 6450000);
  assert.equal(parseFigure('$6.45M'), 6450000);
  assert.equal(parseFigure('6.45 million'), 6450000);
  assert.equal(parseFigure('(12,500)'), -12500);
  assert.equal(parseFigure('10,000 SF'), 10000);
  assert.equal(parseFigure('n/a'), null);
  assert.deepEqual(numbersIn('Asking Price $6,450,000 at a 6.10% cap on 12,000 SF'), [6450000, 6.1, 12000]);
  assert.equal(normalizeValue('pct', '6.10%'), 6.1);
  assert.equal(normalizeValue('pct', '0.061'), 6.1, 'a fraction is a rate');
  assert.equal(normalizeValue('year', '1987'), 1987);
  assert.equal(normalizeValue('year', '87'), null);
  assert.equal(normalizeValue('text', '  Acme Corp '), 'Acme Corp');
});

test('tolerances', () => {
  assert.ok(sameValue('money', 6450000, 6460000), 'within 0.5%');
  assert.ok(!sameValue('money', 6450000, 6500000));
  assert.ok(sameValue('pct', 6.1, 6.12));
  assert.ok(!sameValue('pct', 6.1, 6.2));
  assert.ok(sameValue('text', 'Acme  Corp', 'acme corp'));
});

test('verifying a quoted passage against the page text', () => {
  const pages = ['Cover page. Retail centre.', 'Investment Summary\nAsking Price   $6,450,000\nCap Rate 6.10%', 'NOI $393,450'];
  assert.equal(verifyQuote(pages, 2, 'Asking Price $6,450,000', 6450000, 'money').status, 'verified', 'spacing differences are ignored');
  const other = verifyQuote(pages, 1, 'Asking Price $6,450,000', 6450000, 'money');
  assert.equal(other.status, 'other-page');
  assert.equal(other.page, 2);
  assert.equal(verifyQuote(pages, 2, 'Asking Price $6,450,000', 6500000, 'money').status, 'value-not-in-quote');
  assert.equal(verifyQuote(pages, 2, 'Asking Price $6,950,000', 6950000, 'money').status, 'not-found', 'an invented passage is caught');
  assert.equal(verifyQuote(pages, 2, 'Cap Rate 6.10%', 6.1, 'pct').status, 'verified');
  assert.equal(verifyQuote('Tenant: Acme Corp, lease to 2031', null, 'Tenant: Acme Corp', 'Acme Corp', 'text').status, 'verified');
  assert.equal(squash('“Net”  Rent – Total'), '"net"rent-total');
});

test('reconcile groups agreeing readings and never picks', () => {
  const r = reconcile([
    { key: 'noi', value: 393450, source: { label: 'OM p.2' } },
    { key: 'noi', value: 393000, source: { label: 'T-12' } },
    { key: 'noi', value: 412000, source: { label: 'Rent roll' } },
    { key: 'price', value: 6450000, source: { label: 'OM p.1' } },
    { key: 'cap', value: 6.1, source: { label: 'OM' } }, { key: 'cap', value: 6.1, source: { label: 'AI' } },
  ], { noi: 'money', price: 'money', cap: 'pct' });
  const noi = r.find((x) => x.key === 'noi');
  assert.equal(noi.status, 'conflict');
  assert.equal(noi.groups.length, 2);
  assert.equal(noi.groups[0].readings.length, 2, '393,450 and 393,000 agree within 0.5%');
  assert.ok(Math.abs(noi.spreadPct - ((412000 - 393450) / 393450) * 100) < 1e-9);
  assert.equal(r.find((x) => x.key === 'price').status, 'single');
  assert.equal(r.find((x) => x.key === 'cap').status, 'agree');
});

test('rent roll against the OM', () => {
  const rr = { units: 5, totalSf: 11000, occupancy: 91.7, annualRent: 468000 };
  const issues = crossChecks({ occ: 100, bsf: 12000, gpr: 450000, units: 5 }, rr);
  assert.deepEqual(issues.map((i) => i.id).sort(), ['gpr', 'occ', 'sf']);
  assert.deepEqual(crossChecks({ occ: 92, bsf: 11000, gpr: 520000 }, rr), [], 'consistent figures raise nothing');
  assert.deepEqual(crossChecks({}, null), []);
});

/* ------------------------------------------------ Data QC for an OM's rent roll
 * Bug A: the rent roll as read is checked against its own Total row and the
 * OM's stated figures, each check with its page, row and cell; a fail holds
 * the rent roll back and waits in Review. Invented fixtures only. */
import { readOm } from '../app/om.js';
import { omRollRecord, applyHeldRows, ocrReading, addOcrRows } from '../app/rentroll.js';
import { reviewItems } from '../app/review.js';
import { resolveCheck, blockingChecks, openChecks, whereText } from '../app/dataqc.js';
import { layoutPage, itemsFromWords } from '../app/layout.js';
import { statedOm, cases } from './rr-fixtures.js';

const read = (pages) => {
  const om = readOm(pages);
  const figures = Object.fromEntries(Object.entries(om.fields).map(([k, v]) => [k === 'lot' ? 'lot_sf' : k, v.value]));
  const sources = Object.fromEntries(Object.entries(om.fields).map(([k, v]) => [k === 'lot' ? 'lot_sf' : k, { page: v.page, line: v.line }]));
  return { om, figures, sources, ...omRollRecord(om, { figures, sources, asOf: '2026-10-14', file: 'invented.pdf' }) };
};

test('case 10: occupancy is leased SF over the stated building SF, not over the rent roll’s own SF', () => {
  const { qc } = read(statedOm);
  const occ = qc.checks.find((c) => c.id === 'occ');
  assert.equal(occ.level, 'warn');
  assert.match(occ.text, /fill 47\.0% of the stated 10,000 SF/, '4,700 SF leased of a 10,000 SF building');
  // the deal screen's live check uses the same basis
  const live = crossChecks({ occ: 70, bsf: 10000 }, { units: 4, totalSf: 4700, leasedSf: 4700, occupancy: 100, annualRent: 138000 });
  assert.match(live.find((i) => i.id === 'occ').text, /fill 47\.0% of the stated 10,000 SF building/);
  // with no building SF stated, the rent roll's own SF, and it says so
  const own = readOm(statedOm);
  const f2 = { occ: 70 };
  const { qc: q2 } = omRollRecord(own, { figures: f2, asOf: '2026-10-14' });
  assert.match(q2.checks.find((c) => c.id === 'occ').text, /the OM states no building SF/);
});

test('case 10: a failed Total row holds the rent roll back, and it waits in Review with its page, row and cell', () => {
  const { qc, rows } = read(statedOm);
  assert.deepEqual(rows, [], 'nothing applied while a check fails');
  assert.equal(qc.held.length, 4);
  assert.equal(qc.applied, false);
  const fail = qc.checks.find((c) => c.level === 'fail');
  assert.equal(fail.id, 'total:2:9:annual');
  assert.equal(fail.page, 2);
  assert.equal(fail.colLabel, 'Annual Rent');
  assert.equal(fail.cell.text, '$140,000');
  assert.equal(whereText(fail), 'page 2, line 9, column Annual Rent (“$140,000”)');
  const nosf = qc.checks.find((c) => c.kind === 'nosf');
  assert.equal(nosf.row, 4, 'a row check points to its row');
  const d = { id: 'd1', name: 'Invented deal', rrQc: qc, rentRoll: rows };
  const [g] = reviewItems({ deals: [d] });
  const items = g.items.filter((i) => i.kind === 'rrcheck');
  assert.deepEqual(items.map((i) => i.checkId).sort(), ['bsf', 'nosf:4', 'occ', 'total:2:9:annual']);
  const it = items.find((i) => i.checkId === 'total:2:9:annual');
  assert.equal(it.level, 'fail');
  assert.equal(it.page, 2);
  assert.equal(it.col, 'Annual Rent');
  assert.equal(it.cell, '$140,000');
  assert.equal(items[0].checkId, 'total:2:9:annual', 'the fail holding $138,000 of rent back comes first');
  assert.equal(items.find((i) => i.checkId === 'nosf:4').row, 4);
  // resolving it is recorded on the check; with no fail left the held rows become the deal's rent roll
  assert.equal(applyHeldRows(d, '2026-10-14'), null, 'not while a fail is open');
  resolveCheck(qc, 'total:2:9:annual', 'accepted', 1);
  assert.deepEqual(qc.checks.find((c) => c.id === 'total:2:9:annual').resolved, { how: 'accepted', at: 1 });
  assert.equal(blockingChecks(qc).length, 0);
  assert.equal(applyHeldRows(d, '2026-10-14'), 'applied');
  assert.equal(d.rentRoll.length, 4);
  assert.equal(d.rr.leases.length, 4);
  assert.equal(d.rr.leases[0].source.page, 2);
  assert.equal(d.rr.leases[0].source.line, 5);
  assert.equal(qc.held, null);
  assert.ok(!reviewItems({ deals: [d] })[0].items.some((i) => i.checkId === 'total:2:9:annual'), 'gone from Review once resolved');
  assert.equal(openChecks(qc).length, 3, 'the warnings still wait');
});

test('a held rent roll is never put over units the broker has entered since', () => {
  const { qc } = read(statedOm);
  const d = { id: 'd2', rrQc: qc, rr: { settings: { asOf: '2026-10-14' }, leases: [{ id: 'x', unit: '9' }] }, rentRoll: [] };
  for (const c of blockingChecks(qc)) resolveCheck(qc, c.id);
  assert.equal(applyHeldRows(d, '2026-10-14'), 'kept');
  assert.equal(d.rr.leases.length, 1);
  assert.ok(Array.isArray(qc.held) && qc.held.length === 4, 'the OM rows are kept aside');
});

test('the stated building SF and in-place rent against the rent roll and its Total row; a clean read passes and applies', () => {
  const { qc, rows } = read(cases.continued.map((p, i) => (i === 0 ? `Investment Summary\n\n  Building Size       7,500 SF\n  Occupancy           100%\n  Base Rent           $224,000\n\n${p}` : p)));
  assert.equal(rows.length, 5, 'applied: nothing failed');
  assert.equal(qc.applied, true);
  assert.equal(qc.held, null);
  for (const id of ['bsf', 'occ', 'rent']) assert.equal(qc.checks.find((c) => c.id === id).level, 'pass', id);
  assert.match(qc.checks.find((c) => c.id === 'rent').text, /agrees with the rent roll's \$224,000 and its Total row's \$224,000\./);
  assert.ok(qc.checks.every((c) => c.level !== 'fail'));
});

test('a rent roll whose unit is a guess, or out of range, fails and is held back', () => {
  assert.ok(read(cases.annualIsPsf).qc.held, 'rent per SF in an annual column');
  const g = read(cases.rentMonthly);
  assert.equal(g.qc.held, null, 'a unit worked out from the figures is a warning, not a fail');
  assert.ok(g.qc.checks.some((c) => c.kind === 'unit' && c.level === 'warn'));
});

test('case 9: a page with no text next to the rent roll is its own check; other pages without text are one note', () => {
  const pages = [cases.continued[0], '', '', ''];
  const om = readOm(pages);
  const { qc } = omRollRecord(om, { asOf: '2026-10-14' });
  const s2 = qc.checks.find((c) => c.id === 'scanned:2');
  assert.equal(s2.level, 'warn');
  assert.match(s2.text, /Page 2 has no text layer/);
  const rest = qc.checks.find((c) => c.id === 'scanned');
  assert.equal(rest.level, 'info');
  assert.deepEqual(rest.pages, [3, 4]);
  // a deal read from an OM with no rent roll but a scanned page still gets a record, to read it by OCR
  const only = omRollRecord(readOm(['Asking Price   $3,000,000', '']), { asOf: '2026-10-14' });
  assert.deepEqual(only.qc.checks.map((c) => [c.id, c.level, c.pages]), [['scanned', 'info', [2]]], 'a note (no rent roll to hold it against), so the page can be read by OCR');
});

test('OCR words become the same lines, so the same reader runs; every row is marked OCR, low confidence, and waits to be accepted', () => {
  // an invented page image's words, as Tesseract gives them: pixel boxes, y down, with confidence
  const W = 12; const H = 1650; const words = [];
  const put = (line, y, conf = 90) => {
    for (const m of line.matchAll(/\S+/g)) words.push({ text: m[0], conf, x0: 60 + m.index * W, x1: 60 + (m.index + m[0].length) * W, y0: y - 18, y1: y, base: y });
  };
  const text = cases.continued[0].split('\n');
  text.forEach((l, i) => put(l, 120 + i * 30, i === 6 ? 55 : 92));
  const items = itemsFromWords(words, H);
  assert.equal(items.length, words.length);
  assert.ok(items.every((it) => Number.isFinite(it.conf)));
  const geom = {};
  const pageText = layoutPage(items, H, geom);
  assert.ok(geom.lines.some((l) => l && l.ocr), 'each line knows it was read by OCR');
  const qc = { checks: [{ id: 'scanned:3', kind: 'scanned', level: 'warn', page: 3, text: '' }], ocr: [] };
  const n = ocrReading(qc, 3, { text: pageText, geom, words: words.length, conf: 88 }, 5);
  assert.equal(n, 3);
  const o = qc.ocr[0];
  assert.ok(o.rows.every((r) => r.ocr === true && r.confidence === 'low'));
  assert.deepEqual(o.rows.map((r) => r.src.page), [3, 3, 3], 'the page it was read from');
  assert.deepEqual(o.rows.map((r) => r.annual), [60000, 42000, 36000]);
  const c = qc.checks.find((x) => x.id === 'ocr:3');
  assert.equal(c.level, 'fail', 'never applied without the broker accepting it');
  assert.match(c.text, /read by OCR/);
  assert.deepEqual(qc.checks.find((x) => x.id === 'scanned:3').resolved, { how: 'ocr', at: 5 });
  // accepted: added to the rent roll, each lease marked OCR
  const d = { id: 'd3', figures: {}, rrQc: qc, rr: null, rentRoll: [] };
  assert.equal(addOcrRows(d, 3, '2026-10-14'), 3);
  assert.ok(d.rr.leases.every((L) => L.source.ocr === true && L.source.page === 3));
  assert.equal(addOcrRows(d, 3, '2026-10-14'), 0, 'once');
});

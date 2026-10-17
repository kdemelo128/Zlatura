/* A rent roll printed in thousands or millions (Bug 1a). All invented. The reader
 * used to read a "($ in thousands)" table at face value: $60 rents, four range
 * fails, every row held. It now scales the money columns the table says are
 * scaled, never rent per SF or SF, says so, and leaves a wrong scale to the range check. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rentRoll, readOm } from '../app/om.js';
import { omRollRecord } from '../app/rentroll.js';
import { tbl, C9, R, specThousands, pdfOf } from './rr-fixtures.js';

const body = [
  R('101', 'Maple Leaf Bakery', '2,000', '01/01/2021', '12/31/2030', '60.0', '$30.00', '5.000', '3% annual'),
  R('102', 'Quillfeather Books', '1,500', '06/01/2022', '05/31/2027', '42.0', '$28.00', '3.500', '$1.00/yr'),
  R('103', 'Copperline Yoga', '1,200', '03/01/2023', '02/28/2033', '36.0', '$30.00', '3.000', '2.5%'),
];
const total = R('', 'Total', '4,700', '', '', '138.0', '', '', '');
const page = (title, rows = body, cols = C9) => `${title}\n\n${tbl(cols, [...rows, total])}`;
const fails = (rr) => rr.issues.filter((i) => i.level === 'fail');

test('a caption under the title scales annual and monthly rent, never rent per SF or SF', () => {
  const rr = rentRoll([page('Rent Roll\n($ in thousands)')]);
  assert.deepEqual(rr.rows.map((r) => r.annual), [60000, 42000, 36000]);
  assert.deepEqual(rr.rows.map((r) => r.monthly), [5000, 3500, 3000]);
  assert.deepEqual(rr.rows.map((r) => r.psf), [30, 28, 30]);
  assert.deepEqual(rr.rows.map((r) => r.sf), [2000, 1500, 1200]);
  assert.equal(rr.totals[0].annual, 138000);
  assert.equal(fails(rr).length, 0);
  assert.ok(rr.issues.some((i) => i.kind === 'total' && i.level === 'pass' && i.field === 'annual'));
});

test('the reader says what it did, and the cells keep the text as printed', () => {
  const rr = rentRoll([page('Rent Roll ($000s)')]);
  const note = rr.issues.filter((i) => i.kind === 'scale');
  assert.ok(note.length >= 1 && note.every((i) => i.level === 'info'));
  assert.match(note[0].text, /printed in thousands/);
  assert.match(note[0].text, /×1,000/);
  assert.equal(rr.rows[0].src.cells.annual.text, '60.0');
});

test('a scale in one column heading scales that column only', () => {
  const cols = C9.map((c) => (c.h === 'Annual Rent' ? { ...c, h: 'Annual Rent ($000s)', w: 19 } : c));
  const rows = body.map((r) => [...r.slice(0, 7), '$' + (Number(r[7]) * 1000).toLocaleString('en-US'), r[8]]);
  const rr = rentRoll([page('Rent Roll', rows, cols)]);
  assert.deepEqual(rr.rows.map((r) => r.annual), [60000, 42000, 36000]);
  assert.deepEqual(rr.rows.map((r) => r.monthly), [5000, 3500, 3000]);
  assert.equal(fails(rr).length, 0);
});

test('millions', () => {
  const rows = [R('101', 'Maple Leaf Bakery', '2,000', '01/01/2021', '12/31/2030', '0.060', '$30.00', '', ''), R('102', 'Quillfeather Books', '1,500', '06/01/2022', '05/31/2027', '0.042', '$28.00', '', '')];
  const rr = rentRoll([`Rent Roll ($ in millions)\n\n${tbl(C9, [...rows, R('', 'Total', '3,500', '', '', '0.102', '', '', '')])}`]);
  assert.deepEqual(rr.rows.map((r) => r.annual), [60000, 42000]);
  assert.equal(fails(rr).length, 0);
});

test('a caption that belongs to another table is not borrowed', () => {
  const dollars = [R('101', 'Maple Leaf Bakery', '2,000', '01/01/2021', '12/31/2030', '$60,000', '$30.00', '$5,000', ''), R('102', 'Quillfeather Books', '1,500', '06/01/2022', '05/31/2027', '$42,000', '$28.00', '$3,500', '')];
  const text = `Summary ($ in thousands)\n  Total Rent        215.0\nRent Roll\n${tbl(C9, [...dollars, R('', 'Total', '3,500', '', '', '$102,000', '', '', '')])}`;
  const rr = rentRoll([text]);
  assert.deepEqual(rr.rows.map((r) => r.annual), [60000, 42000]);
  assert.equal(rr.issues.filter((i) => i.kind === 'scale').length, 0);
});

test('a scale that is wrong for the figures is flagged by the range check, not accepted', () => {
  const dollars = [R('101', 'Maple Leaf Bakery', '2,000', '01/01/2021', '12/31/2030', '$60,000', '$30.00', '$5,000', '')];
  const rr = rentRoll([`Rent Roll ($ in thousands)\n\n${tbl(C9, [...dollars, R('', 'Total', '2,000', '', '', '$60,000', '', '', '')])}`]);
  assert.ok(fails(rr).some((i) => i.kind === 'range'), 'scaled to $60 million on 2,000 SF: out of range');
  const { qc, rows } = omRollRecord({ rentRoll: rr }, { figures: {}, asOf: '2026-10-17' });
  assert.equal(rows.length, 0, 'held');
  assert.ok(qc.held && qc.held.length === 1);
});

test('a table that states no scale is read as before', () => {
  const dollars = [R('101', 'Maple Leaf Bakery', '2,000', '01/01/2021', '12/31/2030', '$60,000', '$30.00', '$5,000', '')];
  const rr = rentRoll([`Rent Roll\n\n${tbl(C9, [...dollars, R('', 'Total', '2,000', '', '', '$60,000', '', '', '')])}`]);
  assert.equal(rr.rows[0].annual, 60000);
  assert.equal(rr.issues.filter((i) => i.kind === 'scale').length, 0);
});

test('end to end: a rent roll in thousands is applied (not held) and agrees with the stated rent', () => {
  const rr = rentRoll([page('Rent Roll ($ in thousands)')]);
  const { qc, rows } = omRollRecord({ rentRoll: rr }, { figures: { rent_inplace: 138000 }, asOf: '2026-10-17', file: 'x.pdf' });
  assert.equal(rows.length, 3);
  assert.equal(qc.held, null);
  assert.equal(qc.applied, true);
  const rent = qc.checks.find((c) => c.kind === 'rent');
  assert.ok(rent && rent.level === 'pass', rent && rent.text);
  assert.equal(rows[0].annual, 60000);
});

test('a second table with the same header and no caption of its own is in the first one’s scale', () => {
  const more = [R('201', 'Harrow & Finch Tailors', '1,000', '02/01/2024', '01/31/2029', '32.1', '$32.10', '2.675', '')];
  const rr = rentRoll([page('Rent Roll ($ in thousands)'), `Annex\n\n${tbl(C9, [...more, R('', 'Total', '1,000', '', '', '32.1', '', '', '')])}`]);
  assert.deepEqual(rr.rows.map((r) => r.annual), [60000, 42000, 36000, 32100]);
});

test('scaled money is whole cents, never a float tail (4.03 x 1000 is 4029.9999999999995 as a float)', () => {
  const rows = [R('101', 'Maple Leaf Bakery', '200', '01/01/2021', '12/31/2030', '4.03', '$20.15', '0.336', ''), R('102', 'Quillfeather Books', '200', '06/01/2022', '05/31/2027', '4.07', '$20.35', '0.339', '')];
  const rr = rentRoll([`Rent Roll ($ in thousands)\n\n${tbl(C9, [...rows, R('', 'Total', '400', '', '', '8.1', '', '', '')])}`]);
  assert.deepEqual(rr.rows.map((r) => r.annual), [4030, 4070]);
  assert.equal(rr.totals[0].annual, 8100);
});

/* the same through a PDF, read by pdf.js as the app reads it */
const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;
const { pdfPages } = await import('../app/pdftext.js');

test('a PDF rent roll in thousands: six units at their real rents, nothing held', async () => {
  const layouts = [];
  const pages = await pdfPages(pdfjs, pdfOf(specThousands()), { layouts, verbosity: 0 });
  const om = readOm(pages, { layouts, asOf: '2026-10-17' });
  const { qc, rows } = omRollRecord(om, { figures: { rent_inplace: 215000, bsf: 9000, occ: 80 }, asOf: '2026-10-17', file: 'thousands.pdf' });
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.filter((r) => !r.vacant).map((r) => r.annual), [60000, 42000, 36000, 32000, 45000]);
  assert.equal(qc.held, null);
  assert.equal(qc.checks.filter((c) => c.level === 'fail').length, 0, qc.checks.filter((c) => c.level === 'fail').map((c) => c.text).join(' | '));
});

/* the designer's review: what a caption must not scale */
const RENT_COLS = [{ h: 'Suite', w: 5 }, { h: 'Tenant', w: 22 }, { h: 'SF', w: 6, r: 1 }, { h: 'Lease End', w: 11 }, { h: 'Rent', w: 8, r: 1 }];

test('a bare “Rent” column that fits both a rate and a thousands total is asked about, not guessed', () => {
  const rows = [['101', 'Maple Leaf Bakery', '2,000', '12/31/2030', '60.00'], ['102', 'Quillfeather Books', '1,500', '05/31/2027', '42.00']];
  const rr = rentRoll([`Rent Roll\nDollars in thousands, except rent per SF\n${tbl(RENT_COLS, rows)}`]);
  const ask = fails(rr).find((i) => i.kind === 'unit');
  assert.ok(ask, 'a unit fail');
  assert.match(ask.text, /doesn't say whether it is a total or rent per SF/);
  const { rows: applied, qc } = omRollRecord({ rentRoll: rr }, { figures: {}, asOf: '2026-10-17' });
  assert.equal(applied.length, 0, 'held until the broker looks');
  assert.equal(qc.held.length, 2);
});

test('a bare “Rent” column that fits only a total is scaled without a question', () => {
  const rows = [['101', 'Maple Leaf Bakery', '2,000', '12/31/2030', '60,000'], ['102', 'Quillfeather Books', '1,500', '05/31/2027', '42,000']];
  const rr = rentRoll([`Rent Roll\n(dollars)\n${tbl(RENT_COLS, rows)}`]);
  assert.equal(rr.issues.filter((i) => i.kind === 'scale').length, 0);
  assert.deepEqual(rr.rows.map((r) => r.annual), [60000, 42000]);
});

test('a column headed per SF is never scaled, whatever the caption says', () => {
  const cols = [{ h: 'Suite', w: 5 }, { h: 'Tenant', w: 22 }, { h: 'SF', w: 6, r: 1 }, { h: 'Annual Rent', w: 11, r: 1 }, { h: 'Market Rent PSF', w: 15, r: 1 }];
  const rows = [['101', 'Maple Leaf Bakery', '2,000', '60.0', '$30.00'], ['102', 'Quillfeather Books', '1,500', '42.0', '$31.00']];
  const rr = rentRoll([`Rent Roll ($ in thousands)\n\n${tbl(cols, rows)}`]);
  assert.deepEqual(rr.rows.map((r) => r.annual), [60000, 42000]);
  assert.deepEqual(rr.rows.map((r) => r.market), [30, 31]);
});

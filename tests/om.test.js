import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readOm, parseMoney, parsePct, parseArea, parseDate, splitCells } from '../app/om.js';
import { retail, netlease, multifamily } from './om-fixtures.js';

const val = (om, k) => om.fields[k] && om.fields[k].value;

test('values read the way OMs print them', () => {
  assert.equal(parseMoney('$4,950,000'), 4950000);
  assert.equal(parseMoney('$4.95M'), 4950000);
  assert.equal(parseMoney('$6.45 million'), 6450000);
  assert.equal(parseMoney('(43,776)'), -43776);
  assert.equal(parseMoney('2019'), null, 'a bare year is not money');
  assert.equal(parsePct('6.10%'), 6.1);
  assert.equal(parsePct('6.10', true), 6.1);
  assert.equal(parseArea('1.45 AC').sf, 1.45 * 43560);
  assert.equal(parseArea('12,000 SF').sf, 12000);
  assert.equal(parseDate('02/28/2029').date.toISOString().slice(0, 10), '2029-02-28');
  assert.equal(parseDate('Dec-29').date.toISOString().slice(0, 10), '2029-12-31');
  assert.equal(parseDate('6/30').date.toISOString().slice(0, 10), '2030-06-30');
  assert.ok(parseDate('MTM').mtm);
  assert.deepEqual(splitCells('  Cap Rate     6.10%').map((c) => c.text), ['Cap Rate', '6.10%']);
});

test('label-and-value summary, highlights and operating statement', () => {
  const om = readOm(retail);
  assert.equal(val(om, 'price'), 6450000);
  assert.equal(val(om, 'cap'), 6.1);
  assert.equal(val(om, 'noi'), 393450);
  assert.equal(val(om, 'bsf'), 12000);
  assert.equal(Math.round(val(om, 'lot')), Math.round(0.21 * 43560), 'acres become SF');
  assert.equal(val(om, 'year'), 1948);
  assert.equal(val(om, 'occ'), 91.7);
  assert.equal(val(om, 'zoning'), 'MU-4');
  assert.equal(val(om, 'gross'), 529200, 'the Current column, not Pro Forma');
  assert.equal(val(om, 'opex'), 135750);
  assert.equal(val(om, 'taxes'), 78450);
  assert.equal(val(om, 'address'), '4410 Example Avenue NW');
  assert.equal(val(om, 'city'), 'Washington');
  assert.equal(val(om, 'state'), 'DC');
  assert.equal(om.fields.price.confidence, 'high', 'printed on two pages, in a summary');
  assert.equal(om.fields.price.page, 2);
  assert.ok(!om.fields.tenant, 'a word in a table header is not a tenant');
  assert.ok(!('gross' in om.fields && om.fields.gross.value === 185400), 'demographic income is not gross income');
});

test('a two-line rent roll header, vacancies and totals', () => {
  const rr = readOm(retail).rentRoll;
  assert.equal(rr.page, 5);
  assert.equal(rr.rows.length, 5, 'four leases and a vacancy; the Total line ends the table');
  const coffee = rr.rows[0];
  assert.equal(coffee.tenant, 'Corner Coffee Co.');
  assert.equal(coffee.sf, 2400);
  assert.equal(coffee.annual, 124800);
  assert.equal(coffee.psf, 52);
  assert.equal(coffee.end.toISOString().slice(0, 10), '2029-02-28');
  assert.ok(rr.rows[2].vacant);
  assert.equal(rr.rows[2].sf, 1000);
});

test('single-tenant net lease terms', () => {
  const om = readOm(netlease);
  assert.equal(val(om, 'price'), 3280000);
  assert.equal(val(om, 'cap'), 5.25, 'the exit cap rate in the footnote is not the going-in cap');
  assert.equal(val(om, 'noi'), 172200);
  assert.equal(val(om, 'tenant'), 'Northstar Pharmacy, Inc.');
  assert.equal(val(om, 'lease_type'), 'Absolute NNN');
  assert.equal(val(om, 'term_left'), '9.3 Years');
  assert.equal(val(om, 'increases'), '10% every 5 years');
  assert.equal(Math.round(val(om, 'lot')), Math.round(1.45 * 43560));
  assert.equal(val(om, 'city'), 'Rockville');
});

test('prose and an Actual / Pro Forma statement', () => {
  const om = readOm(multifamily);
  assert.equal(val(om, 'price'), 12500000, '"offered at $12,500,000"');
  assert.equal(val(om, 'cap'), 5.75, '"a 5.75% cap rate"');
  assert.equal(val(om, 'units'), 48);
  assert.equal(val(om, 'bsf'), 41600, '"totaling 41,600 square feet"');
  assert.equal(val(om, 'occ'), 96, '"96% occupied"');
  assert.equal(val(om, 'noi'), 718750, 'the Actual column');
  assert.equal(val(om, 'year'), 1964);
  assert.equal(val(om, 'ptype'), 'Multifamily');
});

test('an OM with no price says so', () => {
  const om = readOm(['Offering Memorandum\n\n  Pricing      Call for Offers\n  Building Size    10,000 SF']);
  assert.equal(om.fields.price, undefined);
  assert.ok(om.unpriced);
  assert.equal(val(om, 'bsf'), 10000);
});

/* ------------------------------------------------ the rent roll, by position
 * Bug A: an OM's rent roll read from where things sit (app/omroll.js). Every
 * table is invented (tests/rr-fixtures.js). Each test failed on 4.7.3. */
import { rentRoll } from '../app/om.js';
import { cases, statedOm, pdfContinued, pdfWrapped } from './rr-fixtures.js';

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const pick = (rr, k) => rr.rows.map((r) => r[k]);

test('case 1: a table that carries on to the next page with no header keeps every row, with each row’s page', () => {
  const rr = rentRoll(cases.continued);
  assert.deepEqual(pick(rr, 'suite'), ['101', '102', '103', '104', '105']);
  assert.deepEqual(rr.rows.map((r) => r.src.page), [1, 1, 1, 2, 2]);
  assert.deepEqual(rr.pages, [1, 2]);
  assert.equal(rr.page, 1, 'the first page');
  assert.equal(rr.segments[1].how, 'carried');
  assert.ok(rr.rows[3].why.some((w) => /carries on/.test(w)), 'a carried page lowers confidence and says why');
  assert.ok(rr.rows[3].score < rr.rows[0].score);
  assert.equal(rr.totals.length, 1);
  assert.deepEqual(rr.totals[0].check.sf, { total: 7500, rows: 7500, occupied: 7500, ok: true });
  assert.ok(rr.issues.some((i) => i.kind === 'carried' && i.level === 'pass' && i.page === 2));
});

test('case 2: a header repeated on the next page is recognised and skipped; each row keeps its page and line', () => {
  const rr = rentRoll(cases.repeated);
  assert.equal(rr.rows.length, 5, 'the page number and the repeated header are not rows');
  assert.deepEqual(rr.rows.map((r) => r.src.page), [1, 1, 1, 2, 2]);
  assert.equal(rr.segments[1].how, 'repeated');
  assert.deepEqual(rr.pages, [1, 2]);
  const coffee = rr.rows[3];
  assert.equal(coffee.tenant, 'Bluefin Sushi Bar');
  assert.equal(coffee.src.line, 5);
  assert.deepEqual(coffee.src.cells.sf, { page: 2, line: 5, col: 2, text: '1,800' });
  assert.equal(coffee.src.cells.annual.text, '$54,000');
});

test('case 2b: a lease comparables table later in the OM is not added to the rent roll', () => {
  const rr = rentRoll(cases.comps);
  assert.deepEqual(pick(rr, 'tenant'), ['Maple Leaf Bakery', 'Quillfeather Books']);
  assert.deepEqual(rr.pages, [1]);
});

test('case 3a: a name wrapped onto the line below joins its row', () => {
  const rr = rentRoll(cases.wrapBelow);
  assert.equal(rr.rows.length, 3);
  assert.equal(rr.rows[1].tenant, 'Northgate Family Dentistry, PC');
  assert.equal(rr.rows[1].sf, 1500);
  assert.ok(rr.rows[1].why.some((w) => /joined/.test(w)));
});

test('case 3b: a name on two lines with the figures centred between them is one row', () => {
  const rr = rentRoll(cases.wrapCentred);
  assert.equal(rr.rows.length, 3);
  assert.equal(rr.rows[1].tenant, 'Northgate Family Dentistry, PC');
  assert.equal(rr.rows[1].suite, '102');
  assert.equal(rr.rows[1].annual, 42000);
});

test('case 4b: one “Lease Term” cell holding both dates gives the start and the end', () => {
  const rr = rentRoll(cases.termRange);
  assert.deepEqual(rr.rows.map((r) => [day(r.start), day(r.end)]), [['2021-01-01', '2030-12-31'], ['2022-06-01', '2027-05-31']]);
});

test('case 4c: a bumps figure beside a blank monthly rent is bumps, and the monthly is worked out and says so', () => {
  const rr = rentRoll(cases.bumpsBesideBlank);
  const r = rr.rows[1];
  assert.equal(r.bumps, '3.0%');
  assert.equal(r.monthly, 3500);
  assert.ok(r.derived.includes('monthly'));
  assert.ok(!rr.rows[0].derived.includes('monthly'), 'a printed monthly rent is read, not worked out');
  assert.equal(rr.columns.find((c) => c.label === 'Bumps').kind, 'bumps');
});

test('case 5: vacancies (one with no SF) and month-to-month written as MTM, Month-to-Month, Holdover or M-T-M', () => {
  const rr = rentRoll(cases.vacantMtm);
  assert.equal(rr.rows.length, 7, 'the vacant suite with no SF is kept');
  assert.deepEqual(pick(rr, 'vacant'), [false, true, true, false, false, false, false]);
  assert.equal(rr.rows[2].sf, null);
  assert.deepEqual(pick(rr, 'mtm'), [false, false, false, true, true, true, true]);
  assert.equal(rr.rows[5].holdover, true);
  assert.ok(rr.issues.some((i) => i.kind === 'nosf' && i.row === 3), 'a vacancy with no SF is flagged');
});

test('case 6a: section headings and subtotals are not tenants; each subtotal is checked against its rows', () => {
  const rr = rentRoll(cases.sections);
  assert.deepEqual(pick(rr, 'tenant'), ['Maple Leaf Bakery', 'Quillfeather Books', 'Ledgerwise Accounting']);
  assert.deepEqual(rr.totals.map((t) => [t.label, t.kind, t.check.annual.ok]), [['Retail Subtotal', 'subtotal', true], ['Office Subtotal', 'subtotal', true], ['Total', 'total', true]]);
  assert.deepEqual(rr.totals.map((t) => [t.from, t.to]), [[0, 2], [2, 3], [0, 3]]);
});

test('case 6b: a subtotal does not end the table: the vacancy after it is kept', () => {
  const rr = rentRoll(cases.subtotalFirst);
  assert.deepEqual(pick(rr, 'suite'), ['101', '102', '103']);
  assert.ok(rr.rows[2].vacant);
  assert.equal(rr.totals.length, 2);
});

test('case 6c: a tenant whose name starts with “Total” is a tenant', () => {
  const rr = rentRoll(cases.totalTenant);
  assert.deepEqual(pick(rr, 'tenant'), ['Maple Leaf Bakery', 'Total Body Fitness', 'Copperline Yoga']);
  assert.equal(rr.totals[0].check.sf.ok, true);
});

test('case 6d: “Totals / Averages” in the tenant column is the Total, kept with its figures', () => {
  const rr = rentRoll(cases.totalsAverages);
  assert.equal(rr.rows.length, 2);
  const t = rr.totals[0];
  assert.equal(t.kind, 'total');
  assert.equal(t.sf, 3500);
  assert.equal(t.annual, 102000);
  assert.equal(t.monthly, 8500);
  assert.ok(t.check.sf.ok && t.check.annual.ok && t.check.monthly.ok);
});

test('case 7b: “Escalation Rate” is bumps, so the rent per SF column is read as rent per SF', () => {
  const rr = rentRoll(cases.escalation);
  assert.deepEqual(pick(rr, 'psf'), [30, 28]);
  assert.deepEqual(pick(rr, 'bumps'), ['3.0%', '2.5%']);
});

test('case 7c: a multifamily rent roll with “Resident”, an “Occupied” status and a market rent column', () => {
  const rr = rentRoll(cases.resident);
  assert.equal(rr.rows.length, 2);
  assert.equal(rr.rows[0].suite, '1A');
  assert.equal(rr.rows[0].status, 'Occupied');
  assert.equal(rr.rows[0].market, 1700);
  assert.equal(rr.rows[0].annual, 19800, 'the actual rent, read as monthly from its figures');
  assert.ok(rr.rows[1].vacant);
});

test('case 8a: a “Rent” column whose figures only make sense as monthly is read as monthly, and flagged as worked out', () => {
  const rr = rentRoll(cases.rentMonthly);
  assert.deepEqual(pick(rr, 'annual'), [19800, 25800]);
  assert.deepEqual(pick(rr, 'monthly'), [1650, 2150]);
  const u = rr.issues.find((i) => i.kind === 'unit');
  assert.equal(u.level, 'warn');
  assert.match(u.text, /doesn't say monthly or annual/);
  assert.equal(rr.columns.find((c) => c.label === 'Rent').basis, 'inferred');
});

test('case 8b: rent per SF a month (“Rent/SF/Mo”) gives the annual rent, worked out and marked', () => {
  const rr = rentRoll(cases.psfMonth);
  assert.deepEqual(pick(rr, 'annual'), [117000, 52200]);
  assert.deepEqual(pick(rr, 'psf'), [39, 34.8]);
  assert.ok(rr.rows.every((r) => r.derived.includes('annual') && r.derived.includes('psf')));
});

test('case 8c: “Monthly Rent/SF” beside the annual rent is rent per SF a month', () => {
  const rr = rentRoll(cases.monthlyPsf);
  assert.equal(rr.rows[0].annual, 117000);
  assert.equal(rr.rows[0].psf, 39);
  assert.equal(rr.columns.find((c) => c.label === 'Monthly Rent/SF').kind, 'mpsf');
});

test('case 8d: rent per SF printed in an “Annual Rent” column is flagged, never multiplied', () => {
  const rr = rentRoll(cases.annualIsPsf);
  assert.deepEqual(pick(rr, 'annual'), [30, 28], 'the figures as printed: nothing times 12');
  assert.ok(rr.rows.every((r) => r.monthly === null));
  const flags = rr.issues.filter((i) => i.kind === 'range');
  assert.equal(flags.length, 2);
  assert.ok(flags.every((f) => f.level === 'fail'));
  assert.ok(rr.rows.every((r) => r.confidence === 'low'));
  assert.equal(rr.confidence, 'low');
});

test('case 8e: rents printed in thousands (“$60.0K”)', () => {
  const rr = rentRoll(cases.thousands);
  assert.deepEqual(pick(rr, 'annual'), [60000, 42000]);
});

test('case 9: a page with no text layer is flagged', () => {
  const om = readOm(['Investment Summary\n\n  Asking Price   $3,000,000', '   ', 'Rent Roll\n\n' + cases.continued[0].split('\n').slice(2).join('\n')]);
  assert.deepEqual(om.scanned, [2]);
});

test('case 10: the stated in-place rent is read (“Base Rent”), and a Total row that doesn’t add up is a failed check', () => {
  const om = readOm(statedOm);
  assert.equal(val(om, 'rent_inplace'), 140000);
  const rr = om.rentRoll;
  const f = rr.issues.find((i) => i.kind === 'total' && i.field === 'annual');
  assert.equal(f.level, 'fail');
  assert.equal(f.page, 2);
  assert.equal(f.cell.text, '$140,000');
  assert.ok(rr.rows.every((r) => r.why.some((w) => /doesn't add up/.test(w))));
});

test('the retail OM: its rent roll as before, with each row’s source and its Total row checked', () => {
  const rr = readOm(retail).rentRoll;
  assert.deepEqual(pick(rr, 'suite'), ['100', '110', '120', '200', '210']);
  assert.equal(rr.rows[4].psf, 37.85, 'read as printed');
  assert.deepEqual(rr.rows[0].src.cells.annual, { page: 5, line: 7, col: 5, text: '$124,800' });
  assert.equal(rr.totals[0].check.annual.ok, true);
  assert.equal(val(readOm(retail), 'rent_inplace'), 468000, 'the Current column of the operating statement');
  assert.equal(rr.confidence, 'high');
});

/* The same reader on PDFs, through pdf.js as the app runs it, with each page's
 * baselines and x positions (layout.js geometry). */
const pdfjs = await import('../vendor/pdf-4.7.76-legacy.min.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;
const { pdfPages } = await import('../app/pdftext.js');
const quiet = { verbosity: 0 };

test('case 1 as a PDF: split over two pages with no header on the second, read by position', async () => {
  const layouts = [];
  const pages = await pdfPages(pdfjs, pdfContinued(), { layouts, ...quiet });
  assert.equal(layouts.length, 3);
  assert.ok(layouts[1].lines.some((l) => l && l.frags.length > 3), 'baselines and x positions recorded');
  const rr = readOm(pages, { layouts }).rentRoll;
  assert.deepEqual(pick(rr, 'suite'), ['101', '102', '103', '104', '105', '106']);
  assert.deepEqual(rr.rows.map((r) => r.src.page), [2, 2, 2, 3, 3, 3]);
  assert.equal(rr.rows[1].tenant, 'Northgate Family Dentistry, PC');
  assert.ok(rr.totals[0].check.sf.ok && rr.totals[0].check.annual.ok);
});

test('case 3b as a PDF: the name’s two lines join the figures between them by height', async () => {
  const layouts = [];
  const pages = await pdfPages(pdfjs, pdfWrapped(), { layouts, ...quiet });
  const rr = readOm(pages, { layouts }).rentRoll;
  assert.equal(rr.rows.length, 6);
  assert.equal(rr.rows[1].tenant, 'Northgate Family Dentistry, PC');
  assert.equal(rr.rows[1].src.page, 2);
  assert.deepEqual(rr.rows.map((r) => r.mtm), [false, false, false, false, true, false]);
});

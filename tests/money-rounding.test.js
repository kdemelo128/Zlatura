/* F1 (owner, 2026-10-15): money is rounded to the cent by one rule, the
 * engine's toCents (app/engine/money.js: half away from zero, exact for
 * decimal input). t12.js, omstatement.js, om.js and template.js each kept a
 * copy of Math.round(x * 100) / 100, which rounds the binary float: 1.005
 * became 1.00, 0.145 became 0.14, and a negative half cent went toward zero.
 * Each test below failed on 4.7.13. And a T-12 line whose shown months don't
 * add up to its shown year, within a cent, is flagged, with neither figure
 * changed. Invented figures only. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { toCents } from '../app/engine/money.js';
import { importStatement, statementTotals, statementChecks, annualized, bestSheet } from '../app/t12.js';
import { readOm } from '../app/om.js';
import { inspectTemplate, fillTemplate } from '../app/template.js';
import { gridsOf, csvRows } from '../app/sheetread.js';
import { LAYOUTS, layoutFile } from './t12-layouts.js';
import { CASES } from './om-statement-fixtures.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** An invented T-12: each line the same amount every month, as an allocation export writes it. */
const statement = (lines) => importStatement([['Line', ...MON.map((m) => `${m} 2025`), 'Total'], ...lines.map(([n, v]) => [n, ...Array(12).fill(v), null])]
  .map((cells, i) => ({ r: i + 1, cells })), { file: 'invented.xlsx' });
const line = (t, label) => t.lines.find((l) => l.label === label);
const pad = (label, ...vals) => `  ${label.padEnd(34)}${vals.map((v) => String(v).padStart(14)).join('')}`;
const head = (...h) => ' '.repeat(36) + h.map((v) => String(v).padStart(14)).join('');
const om = (rows) => readOm([`Operating Statement\n\n${head('T-12')}\n\n${rows.map((r) => pad(...r)).join('\n')}`], { asOf: '2026-10-14' });

test('T-12 months: a half cent rounds as the engine does, a negative one away from zero too', () => {
  const t = statement([['Base Rent', 10000], ['Parking Income', 0.145], ['Vacancy Loss', -0.125], ['Utilities Credit', -0.125]]);
  assert.equal(line(t, 'Parking Income').months[0], 0.15, 'was 0.14');
  assert.equal(line(t, 'Vacancy Loss').months[0], -0.13, 'income kept negative: was -0.12');
  // an expense is kept as a positive cost, so a credit written −0.125 is a cost of −0.13 shown as 0.13 (was 0.12)
  assert.equal(Math.abs(line(t, 'Utilities Credit').months[0]), 0.13, 'was 0.12');
  assert.equal(toCents(0.145), 0.15);
});

test('annualizing a T-8 (× 1.5) rounds its half cents as the engine does', () => {
  // $10,000.15 × 12 ÷ 8 = $15,000.225 exactly: $15,000.23, not $15,000.22
  assert.deepEqual(annualized({ egi: 10000.15, opex: 3000.21, taxes: 1000.65, noi: 6999.94, months: 8 }),
    { egi: 15000.23, opex: 4500.32, taxes: 1500.98, noi: 10499.91, months: 8 });
});

test('an OM figure printed with a half cent reads as the engine rounds it', () => {
  const r = om([['Effective Gross Income', '$13,000.005'], ['Total Operating Expenses', '$3,000.00'], ['Net Operating Income', '$10,000.005']]);
  assert.equal(r.fields.noi.value, 10000.01, 'was 10,000.00');
});

test('the other columns an OM figure offers (the alternatives) round as the engine does', () => {
  const r = readOm([`Operating History\n\n${head('2024', 'T-12')}\n\n${[pad('Effective Gross Income', '$13,000.005', '$14,000.00'), pad('Total Operating Expenses', '$3,000.00', '$3,000.00'), pad('Net Operating Income', '$10,000.005', '$11,000.00')].join('\n')}`], { asOf: '2026-10-14' });
  assert.equal(r.fields.noi.value, 11000);
  assert.deepEqual(r.fields.noi.alts.map((a) => [a.col, a.value]), [['2024', 10000.01]], 'was 10,000.00');
});

test('an OM statement’s “use the sum of the lines” rounds a negative half cent as the engine does', () => {
  const r = om([['Base Rent', '$13,000.00'], ['Other Income', '$100.00'], ['Concessions', '($100.005)'], ['Effective Gross Income', '$12,000.00'],
    ['Real Estate Taxes', '$1,000.00'], ['Insurance', '$1,000.00'], ['Repairs', '$1,000.00'], ['Total Operating Expenses', '$3,000.00'], ['Net Operating Income', '$9,000.00']]);
  const fix = r.statement.checks.flatMap((c) => c.fixes || []).find((f) => f.id === 'lines');
  assert.deepEqual(fix.values, { gross: 12999.99, noi: 9999.99 }, 'was 13,000.00 and 10,000.00');
});

test('a $/SF written into a template rounds as the engine does', async () => {
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet('Sale Comps');
  s.addRow(['Property Name', 'Sale Price', 'Building SF', 'Price / SF']);
  s.addRow(['Comp #1', 1, 1, 1]);
  const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
  const xml = { DOMParser, XMLSerializer };
  const plan = inspectTemplate(fflate, bytes, xml);
  // $1,024,215 ÷ 1,000 SF = $1,024.215: $1,024.22, not $1,024.21
  const { bytes: out } = fillTemplate(fflate, bytes, plan, { sales: [{ kind: 'sale', name: 'Invented Comp', price: 1024215, bsf: 1000, flags: [] }], market: [] }, xml);
  const sheet = fflate.strFromU8(fflate.unzipSync(out)['xl/worksheets/sheet1.xml']);
  assert.match(sheet, /r="D2"[^>]*>(?:<f>[^<]*<\/f>)?<v>1024\.22<\/v>/, sheet.slice(0, 600));
});

test('every money value a T-12 or an OM statement keeps is already whole cents', async () => {
  const whole = (v, where) => { if (typeof v === 'number') assert.equal(toCents(v), v, `${where}: ${v}`); };
  const sweep = (t, name) => {
    for (const l of t.lines) { l.months.forEach((v, i) => whole(v, `${name} ${l.label} month ${i + 1}`)); whole(l.total, `${name} ${l.label} total`); whole(l.fileTotal, `${name} ${l.label} file total`); }
    for (const [k, s] of Object.entries(t.stated || {})) whole(s.value, `${name} stated ${k}`);
    const T = statementTotals(t);
    for (const k of ['egi', 'opex', 'taxes', 'noi', 'below', 'unassigned']) whole(T[k], `${name} ${k}`);
    for (const [k, v] of Object.entries(T.by)) whole(v, `${name} category ${k}`);
    const A = annualized({ ...T, months: 8 });
    for (const k of ['egi', 'opex', 'taxes', 'noi']) whole(A[k], `${name} annualized ${k}`);
  };
  for (const L of LAYOUTS) {
    const f = await layoutFile(L, ExcelJS);
    let t;
    if (L.kind === 'csv') t = bestSheet([{ sheet: 'CSV', rows: csvRows(f).map((cells, i) => ({ r: i + 1, cells })).filter((x) => x.cells.some((v) => String(v).trim())) }], { file: L.file });
    else { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(f); t = bestSheet(gridsOf(wb), { file: L.file }); }
    sweep(t, L.name);
  }
  // and a statement written to fractions of a cent, positive and negative
  sweep(statement([['Base Rent', 10416.665], ['Recoveries', 1234.565], ['Real Estate Taxes', 2083.335], ['Insurance', 416.145], ['Credit', -0.125]]), 'fractions');
  for (const [k, pages] of Object.entries(CASES)) {
    const r = readOm(pages, { asOf: '2026-10-14' });
    for (const [f, v] of Object.entries(r.fields)) { whole(v.value, `OM ${k} ${f}`); for (const a of v.alts || []) whole(a.value, `OM ${k} ${f} alternative`); }
  }
});

test('a T-12 line whose shown months add up to more than a cent from its year is flagged; neither figure changes', () => {
  // twelve months of $10,416.665: each shown as $10,416.67 (they add up to $125,000.04), the year as $124,999.98
  const t = statement([['Base Rent', 10416.665], ['Real Estate Taxes', 2000]]);
  const rent = line(t, 'Base Rent');
  assert.equal(rent.months[0], 10416.67);
  assert.equal(rent.total, 124999.98, 'the year is unchanged');
  const c = statementChecks(t).find((x) => x.id === 'monthsround');
  assert.ok(c, 'flagged');
  assert.equal(c.text, '1 line’s shown months add up to more than a cent away from the year shown (Base Rent: months $125,000.04, year $124,999.98). The file has amounts to a fraction of a cent: each month is rounded on its own, the year once. Neither figure is changed.');
  assert.equal(Math.round(c.amount * 100) / 100, 0.06);
  // whole cents, or within a cent: no flag
  assert.ok(!statementChecks(statement([['Base Rent', 10416.67], ['Real Estate Taxes', 2000]])).some((x) => x.id === 'monthsround'));
  assert.ok(!statementChecks(statement([['Base Rent', 1000.001], ['Real Estate Taxes', 2000]])).some((x) => x.id === 'monthsround'), 'a tenth of a cent a month stays within a cent');
});

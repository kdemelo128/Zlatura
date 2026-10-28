/* F6/F7: hostile text in exports, and dates that do not move with the device's time zone.
 * The zone-dependent checks also run under America/Los_Angeles and Pacific/Kiritimati: npm run test:tz. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { cell, tsvCell } from '../app/exporters.js';
import { fillCells } from '../app/template.js';
import { yearsLeft } from '../app/engine/figures.js';
import { analyze } from '../app/deal.js';
import { analysisInput } from '../app/impact.js';
import { PACK, LONG } from './fixtures/hostile.js';

const xml = { DOMParser, XMLSerializer };

test('a rent roll CSV cell: a negative number stays a number, text that looks like a formula is guarded, a lone CR does not split the row', () => {
  assert.equal(cell(-1200), '-1200');
  assert.equal(cell(1200.5), '1200.5');
  assert.equal(cell("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0");
  assert.equal(cell('-1200'), "'-1200", 'text that merely looks like a number is still guarded');
  assert.equal(cell('\t=1+1'), "'\t=1+1");
  assert.equal(cell('Acme\rBay'), '"Acme\nBay"', 'a lone CR is a line break inside quotes');
  assert.equal(cell('O’Brien, "Jr"'), '"O’Brien, ""Jr"""');
  assert.equal(cell(null), '');
});

test('the copy table: tabs and line breaks become spaces, then the formula guard', () => {
  assert.equal(tsvCell('Acme\t=1+1'), 'Acme =1+1');
  assert.equal(tsvCell('\t=1+1'), ' =1+1', 'a leading tab is a space, so a spreadsheet reads the cell as text, not a formula');
  assert.equal(tsvCell('\r=1+1'), ' =1+1');
  assert.equal(tsvCell('+SUM(1)'), "'+SUM(1)");
  assert.equal(tsvCell('@x'), "'@x");
  assert.equal(tsvCell("O'Brien"), "O'Brien");
  assert.equal(tsvCell('Line one\r\nLine two'), 'Line one Line two');
  assert.equal(tsvCell(undefined), '');
});

test('yearsLeft reads a printed date as that calendar day in any zone', () => {
  const today = new Date('2026-10-10T12:00:00Z');
  // 2036-01-31 is 3401 days after 2026-10-10 at 12:00Z less the half day: the same value in every zone
  assert.equal(yearsLeft('January 31, 2036', today), (Date.UTC(2036, 0, 31) - today.getTime()) / (365.25 * 86400000));
  assert.equal(yearsLeft('January 31st, 2036', today), yearsLeft('January 31, 2036', today));
  assert.equal(yearsLeft('2036-01-31', today), yearsLeft('January 31, 2036', today), 'an ISO day and the same day in words agree');
  assert.equal(yearsLeft('9.3 Years', today), 9.3);
});

test('rollEnded names today as the device’s calendar day, not the UTC day', () => {
  const lease = (id, o) => ({ id, unit: id, tenant: `Tenant ${id}`, sf: 1000, leaseStart: '2022-01-01', leaseEnd: '2031-12-31', periods: [{ start: '2022-01-01', end: '2031-12-31', rate: 30000, unit: 'year', source: 'documented' }], abatements: [], custom: {}, ...o });
  // 03:30Z on the 11th is still the 10th in Los Angeles (and the 11th east of UTC): a lease ending on the 10th has not ended there
  const now = new Date('2026-10-11T03:30:00Z');
  const localDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const m = analyze(analysisInput({ figures: { price: 1e6, noi: 60000 }, rr: { settings: {}, leases: [lease('a', { leaseEnd: localDay })] } }), null, now);
  assert.equal(m.checks.filter((c) => /ended before/.test(c.text)).length, 0, `a lease ending on ${localDay}, the device’s today, has not ended`);
  const later = analyze(analysisInput({ figures: { price: 1e6, noi: 60000 }, rr: { settings: {}, leases: [lease('a', { leaseEnd: '2026-10-09' })] } }), null, now);
  assert.equal(later.checks.filter((c) => /ended before/.test(c.text)).length, 1, 'a lease that ended the day before has');
});

test('the audit sheet’s XML still parses when a long text is cut next to an ampersand', async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Inputs').getCell('A3').value = 'Property Name';
  const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
  const { bytes: out } = fillCells(fflate, bytes, { cellMap: [{ sheet: 'Inputs', cell: 'B3', field: 'dealName' }], values: { dealName: { value: LONG, type: 'text', source: 'x' } }, audit: true }, xml);
  const files = fflate.unzipSync(out);
  const path = Object.keys(files).filter((p) => /worksheets\/sheet\d+\.xml$/.test(p)).find((p) => fflate.strFromU8(files[p]).includes('Only the cells below'));
  assert.ok(path, 'the audit sheet is in the package');
  const problems = [];
  new DOMParser({ onError: (level, msg) => problems.push(`${level}: ${msg}`) }).parseFromString(fflate.strFromU8(files[path]), 'text/xml');
  assert.deepEqual(problems, [], 'the audit sheet is well-formed XML');
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(out);
  assert.ok(back.getWorksheet('Zlatura Audit'));
});

test('the pack: every hostile text is a guarded CSV cell or plain text', () => {
  for (const [k, v] of Object.entries(PACK)) {
    const c = cell(v);
    assert.ok(!/^[=+\-@\t\r]/.test(c), `${k}: a CSV cell never starts as a formula`);
  }
  assert.equal(LONG.length, 40000);
  assert.equal(LONG.indexOf('&'), 31998);
});

test('test:tz runs the Node suite under Los Angeles and Kiritimati', () => {
  const s = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts['test:tz'];
  assert.match(s, /TZ=America\/Los_Angeles node --test/);
  assert.match(s, /TZ=Pacific\/Kiritimati node --test/);
});

test('a rent roll CSV date written in words is stored as that calendar day in any zone', async () => {
  globalThis.window = globalThis.window || {};
  globalThis.document = globalThis.document || { addEventListener() {}, dispatchEvent() {} };
  const { rowsToLeases } = await import('../app/rentrollui.js');
  const { emptyRentRoll } = await import('../app/rentroll.js');
  const rr = emptyRentRoll('Retail', '2026-10-10');
  const { leases } = rowsToLeases(rr, { sheet: 'x.csv', rows: [['101', 'Acme', 'May 31, 2027', 'Dec 31, 2028']] }, ['unit', 'tenant', 'leaseStart', 'leaseEnd']);
  assert.equal(leases[0].leaseStart, '2027-05-31', 'May 31, 2027 is not 05-30 east of UTC');
  assert.equal(leases[0].leaseEnd, '2028-12-31');
});

test('a date typed as a year, a month, or with a Z or offset is that calendar day in any zone', async () => {
  const today = new Date('2026-10-10T12:00:00Z');
  const want = (iso) => (Date.UTC(...iso) - today.getTime()) / (365.25 * 86400000);
  assert.equal(yearsLeft('2036', today), want([2036, 0, 1]));
  assert.equal(yearsLeft('2036-01', today), want([2036, 0, 1]));
  assert.equal(yearsLeft('2036-01-31T00:00:00Z', today), want([2036, 0, 31]));
  assert.equal(yearsLeft('2036-01-31T00:00:00+05:00', today), want([2036, 0, 30, 19]));
  assert.equal(yearsLeft('Jan 31 2036 12:00', today), want([2036, 0, 31, 12]), 'a typed time is kept');
  globalThis.window = globalThis.window || {};
  globalThis.document = globalThis.document || { addEventListener() {}, dispatchEvent() {} };
  const { rowsToLeases } = await import('../app/rentrollui.js');
  const { emptyRentRoll } = await import('../app/rentroll.js');
  const { leases } = rowsToLeases(emptyRentRoll('Retail', '2026-10-10'), { sheet: 'x.csv', rows: [['1', 'A', '2027-05', '2028'], ['2', 'B', '2029-02-28T00:00:00Z', '']] }, ['unit', 'tenant', 'leaseStart', 'leaseEnd']);
  assert.equal(leases[0].leaseStart, '2027-05-01');
  assert.equal(leases[0].leaseEnd, '2028-01-01');
  assert.equal(leases[1].leaseStart, '2029-02-28');
});

test('a text cut at 32,000 characters never ends on half an emoji', async () => {
  const { cutText } = await import('../app/template.js');
  const t = cutText(`${'a'.repeat(31999)}👩rest`);
  assert.equal(t.length, 31999);
  assert.equal(cutText('short'), 'short');
  assert.equal(cutText('a'.repeat(40000)).length, 32000);
});

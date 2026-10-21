/* T-12 PR 1, "reading foundation" (docs/proposals/t12-formats.md): a statement
 * read from semicolon, tab and pasted text, decimal-comma numbers, blank and
 * unreadable cells recorded, the period, the sheet choice, and the new fields
 * kept through a backup. Invented fixtures only (tests/t12-formats.js). Tests
 * marked [old] failed on 4.7.27. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';
import { LAYOUTS, layoutFile } from './t12-layouts.js';
import { text, grid, statementRows, SIX, EU_SEMICOLON, MON6 } from './t12-formats.js';
import { amountOf, layoutOf, numberFormatOf, tokenFormat, currencyRefusal } from '../app/t12.js';
import { readGrids, detectDelimiter, csvRows, pastedRows, gridsOf } from '../app/sheetread.js';

const getFflate = async () => fflate;
const getXlsx = async () => ({ ExcelJS });
const asFile = (s, name = 'invented.csv') => new File([s], name);
const readCsv = (s, name) => readGrids(asFile(s, name), getXlsx, { getFflate });

/* ---------------------------------------------------------------- 1. delimiters */

test('[old] a semicolon CSV is detected and read in its columns', async () => {
  const g = await readCsv(EU_SEMICOLON);
  assert.equal(g[0].delimiter, ';');
  assert.deepEqual(g[0].rows[0].cells, ['Line', ...MON6, 'Total']);
  assert.equal(g[0].rows[1].cells[1], '1.234,56');
});

test('[old] tab-separated text is detected, whatever the file is named', async () => {
  const tsv = text([['Line', ...MON6, 'Total'], ['Base Rent', 1, 2, 3, 4, 5, 6, 21]], '\t');
  for (const name of ['statement.tsv', 'statement.txt', 'statement.csv']) {
    const g = await readCsv(tsv, name);
    assert.equal(g[0].delimiter, '\t', name);
    assert.equal(g[0].rows[1].cells.length, 8);
  }
});

test('[old] "sep=;" on the first line is honoured and dropped, with the row numbers still the file’s', async () => {
  const g = await readCsv(`sep=;\r\n${text([['Line', 'Jan 2026'], ['Rent', 5]], ';', '\r\n')}`);
  assert.equal(g[0].delimiter, ';');
  assert.deepEqual(g[0].rows.map((r) => r.cells), [['Line', 'Jan 2026'], ['Rent', '5']]);
  assert.deepEqual(g[0].rows.map((r) => r.r), [2, 3]);
  assert.deepEqual(detectDelimiter('sep=,\nA,B\n'), { delimiter: ',', skipFirst: true });
  assert.deepEqual(detectDelimiter('sep=\t\nA\tB\n'), { delimiter: '\t', skipFirst: true });
});

test('delimiter rules: the field count most lines share, quotes respected, comma when nothing fits', () => {
  assert.equal(detectDelimiter('Line;Jan 2026;Feb 2026;Total\nBase Rent;1.234,56;1.234,56;2.469,12\nTaxes;500;500;1.000\n').delimiter, ';');
  assert.equal(detectDelimiter('Line,Jan 2026,Total\n"Rent, base",1,1\n').delimiter, ',');
  assert.equal(detectDelimiter('"Rent; base",1,1\nTaxes,2,2\n').delimiter, ',', 'a semicolon inside quotes is not a delimiter');
  assert.equal(detectDelimiter('just a title\nand a line\n').delimiter, ',');
  assert.equal(detectDelimiter('').delimiter, ',');
  // a title row above a tab table does not change the answer
  assert.equal(detectDelimiter('Invented Plaza\nLine\tJan\tFeb\nRent\t1\t2\nTaxes\t3\t4\n').delimiter, '\t');
});

test('a plain comma CSV still reads exactly as before, and csvRows keeps its comma default', async () => {
  const s = text([['Line', ...MON6, 'Total'], ['Base Rent', 1, 2, 3, 4, 5, 6, 21]]);
  const g = await readCsv(s);
  assert.equal(g[0].delimiter, ',');
  assert.deepEqual(g[0].rows.map((r) => r.cells), csvRows(s));
});

/* ------------------------------------------------------- 2. what the file really is */

test('[old] an .xlsx saved with a .csv name is read as a workbook', async () => {
  const bytes = await layoutFile(LAYOUTS[1], ExcelJS);
  const g = await readCsv(Buffer.from(bytes), 'statement.csv');
  assert.notEqual(g[0].sheet, 'CSV');
  assert.ok(g[0].rows.length > 10);
});

test('[old] an .xlsm (a workbook with macros) is read, and says it has macros', async () => {
  const bytes = await layoutFile(LAYOUTS[1], ExcelJS);
  const z = fflate.unzipSync(bytes);
  z['xl/vbaProject.bin'] = Uint8Array.from([1, 2, 3, 4]);
  const g = await readGrids(new File([fflate.zipSync(z)], 'statement.xlsm'), getXlsx, { getFflate });
  assert.equal(g[0].macros, true);
  assert.ok(g[0].rows.length > 10);
  const plain = await readGrids(new File([bytes], 'statement.xlsx'), getXlsx, { getFflate });
  assert.equal(plain[0].macros, false);
});

test('[old] a PDF, a password-protected container and a too-big text file are refused by readGrids with their messages', async () => {
  await assert.rejects(readGrids(asFile('%PDF-1.7\n', 'statement.xlsx'), getXlsx, { getFflate }), /really a PDF/);
  await assert.rejects(readGrids(new File([Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...[...'EncryptedPackage'].flatMap((c) => [c.charCodeAt(0), 0])])], 'locked.xlsx'), getXlsx, { getFflate }), /password protected/);
});

test('[old] hidden sheets are left out by default and listed, marked hidden, on request', async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await layoutFile(LAYOUTS[3], ExcelJS));
  assert.deepEqual(gridsOf(wb).map((g) => g.sheet), ['Operating Statement', 'Summary']);
  const all = gridsOf(wb, { includeHidden: true });
  assert.deepEqual(all.map((g) => [g.sheet, g.hidden]), [['Operating Statement', false], ['Notes', true], ['Summary', false]]);
});

/* ------------------------------------------------------------------- 3. paste */

test('[old] pasted text: tabs, with the trailing empty cells Excel adds', () => {
  const rows = pastedRows('Line\tJan 2026\tFeb 2026\t\t\nBase Rent\t1,000\t1,000\t\t\n\nTaxes\t200\t\t200\t\n');
  assert.deepEqual(rows, [
    { r: 1, cells: ['Line', 'Jan 2026', 'Feb 2026'] },
    { r: 2, cells: ['Base Rent', '1,000', '1,000'] },
    { r: 4, cells: ['Taxes', '200', '', '200'] },
  ]);
});

test('[old] pasted text without tabs: columns split on runs of two or more spaces, indentation ignored', () => {
  const rows = pastedRows('Line   Jan 2026   Feb 2026\n  Base Rent   (1,234)   1,234-\nTaxes     —     $5\n');
  assert.deepEqual(rows.map((r) => r.cells), [['Line', 'Jan 2026', 'Feb 2026'], ['Base Rent', '(1,234)', '1,234-'], ['Taxes', '—', '$5']]);
  assert.deepEqual(pastedRows('Real Estate Taxes   100').map((r) => r.cells), [['Real Estate Taxes', '100']], 'a single space stays inside a label');
});

/* ------------------------------------------------------------- 4. number formats */

/** What numberFormatOf says of a statement whose lines are given as rows of text. */
function formatOf(lines, delimiter = ',', months = MON6) {
  const rows = grid(statementRows({ months, lines }));
  return numberFormatOf(rows, layoutOf(rows), { delimiter });
}
const six = (v) => Array(6).fill(v);
const pick = (r) => [r.format, r.ask];

test('[old] 1.234,56 reads 1234.56 in a decimal-comma file (it was 1.23456)', () => {
  assert.equal(amountOf('1.234,56', 'eu'), 1234.56);
  assert.equal(amountOf('(1.234,56)', 'eu'), -1234.56);
  assert.equal(amountOf('1.234.567', 'eu'), 1234567);
  assert.equal(amountOf('12,5', 'eu'), 12.5);
  assert.equal(amountOf('1.234,56-', 'eu'), -1234.56);
  assert.equal(amountOf('$ 1.234,56', 'eu'), 1234.56);
});

test('[old] 1 234,56 and 1\'234.56 read', () => {
  assert.equal(amountOf('1 234,56', 'space'), 1234.56);
  assert.equal(amountOf('1 234,56', 'space'), 1234.56);
  assert.equal(amountOf('1\'234.56', 'ch'), 1234.56);
  assert.equal(amountOf('1’234.56', 'ch'), 1234.56);
  assert.equal(amountOf('1\'234\'567', 'ch'), 1234567);
});

test('the US reading is exactly what it was, and numbers are never touched by the format', () => {
  for (const [t, n] of [['$1,250.50', 1250.5], ['(1,250.00)', -1250], ['1,250-', -1250], ['-', 0], ['1.234', 1.234], ['12,500', 12500]]) assert.equal(amountOf(t), n, t);
  assert.equal(amountOf('1.234,56'), 1.23456, 'unchanged: this is why the format is asked about');
  for (const f of ['us', 'eu', 'ch', 'space']) assert.equal(amountOf(1234.5, f), 1234.5);
  assert.ok(Number.isNaN(amountOf('Rent', 'eu')));
});

test('tokens: which way each figure is written, and which could be either', () => {
  const k = {
    '1,234.56': 'us', '1,234,567': 'us', '12.5': 'us', '1234.56': 'us', '0.1234': 'us', '$(1,234.56)': 'us', '1\'234.56': 'ch', '1.234,56': 'eu', '1.234.567': 'eu', '12,5': 'eu', '1234,56': 'eu', '1 234,56': 'space',
    '1.234': 'dot3', '12,500': 'comma3', '1234': null, '1 234': null, '-': null, 'n/a': null, '': null, '1,2.3': null,
  };
  for (const [t, want] of Object.entries(k)) assert.equal(tokenFormat(t), want, t || '(blank)');
});

test('[old] a file of 1.234,56 figures is decimal-comma, with no question', () => {
  const r = formatOf([['Base Rent', ...six('1.234,56'), '7.407,36'], ['Taxes', ...six('500'), '3.000']], ';');
  assert.deepEqual(pick(r), ['eu', null]);
  assert.equal(formatOf([['Rent', ...six('1 234,56'), '7 407,36']], ';').format, 'space');
  assert.equal(formatOf([['Rent', ...six('1\'234.56'), '7\'407.36']]).format, 'ch');
  assert.equal(formatOf([['Rent', ...six('1,234.56'), '7,407.36']]).format, 'us');
});

test('[old] 1.234 alone asks, with no guess, and shows both readings', () => {
  const r = formatOf([['Taxes', ...six('1.234'), '7.404']]);
  assert.deepEqual(pick(r), [null, 'ambiguous']);
  assert.deepEqual(r.samples, [{ text: '1.234', us: 1.234, eu: 1234 }, { text: '7.404', us: 7.404, eu: 7404 }]);
});

test('[old] a file that writes numbers two ways asks', () => {
  const r = formatOf([['Rent', ...six('1,234.56'), '7,407.36'], ['Taxes', ...six('2.500,10'), '15.000,60']]);
  assert.deepEqual(pick(r), [null, 'mixed']);
  assert.ok(r.samples.length >= 1);
});

test('[old] a semicolon file with 12,500 asks; a comma file with 12,500 reads US with no question', () => {
  const lines = [['Rent', ...six('12,500'), '75,000'], ['Taxes', ...six('500'), '3,000']];
  assert.deepEqual(pick(formatOf(lines, ';')), [null, 'ambiguous']);
  assert.deepEqual(pick(formatOf(lines, ',')), ['us', null]);
  assert.deepEqual(pick(formatOf(lines, '\t')), ['us', null]);
});

test('1.234 with clear US figures beside it reads US; 12,500 beside a decimal comma reads EU', () => {
  assert.deepEqual(pick(formatOf([['Rent', ...six('1,500.50'), '9,003.00'], ['Taxes', ...six('1.234'), '7.404']])), ['us', null]);
  assert.deepEqual(pick(formatOf([['Rent', ...six('1.500,50'), '9.003,00'], ['Taxes', ...six('12,500'), '75,000']], ';')), ['eu', null]);
});

test('both dot-3 and comma-3 figures with nothing clear asks, even in a comma file', () => {
  assert.equal(formatOf([['Rent', ...six('1.234'), '7.404'], ['Taxes', ...six('12,500'), '75,000']]).ask, 'ambiguous');
});

test('Excel number cells are never read through the format', () => {
  const r = formatOf([['Rent', ...six(1234.5), 7407], ['Taxes', ...six(500), 3000]], ';');
  assert.deepEqual(pick(r), ['us', null]);
});

test('[old] a currency sign other than $ is found, and the import refusal says so', () => {
  assert.equal(formatOf([['Rent', ...six('€1.234,56'), '€7.407,36']], ';').foreign, '€');
  assert.equal(formatOf([['Rent', ...six('£1,234.56'), '£7,407.36']]).foreign, '£');
  assert.equal(formatOf([['Rent', ...six('CHF 1’234.56'), '7’407.36']]).foreign, 'CHF');
  assert.equal(formatOf([['Rent', ...six('$1,234.56'), '$7,407.36']]).foreign, null);
  assert.equal(currencyRefusal('€'), 'Amounts in € can’t be read as dollars. Zlatura reads dollar statements only; this file was not imported.');
  assert.equal(currencyRefusal(null), null);
});

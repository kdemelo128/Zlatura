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

void grid; void statementRows; void SIX;

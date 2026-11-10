/* A workbook can hold a date cell whose serial no calendar has. Such a cell is blank (null): never 0, never today,
 * never the raw serial; the import says how many, once. On the old code one such cell refused the whole file
 * (RangeError: Invalid time value). Invented workbooks only, built here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';
import { cellValue, badDate, badDateNote, gridsOf, readGrids } from '../app/sheetread.js';

const NOPE = new Date(NaN);
const enc = new TextEncoder();
/** An invented rent roll with real dates in column E; `bad` rows get a date serial no calendar has, written into the file itself. */
async function workbookFile(bad = 1) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Roll');
  ws.addRow(['Unit', 'Tenant', 'SF', 'Rent', 'Lease End']);
  ws.addRow(['101', 'Quillfeather Books', 1200, 2400, new Date(Date.UTC(2031, 4, 31))]);
  ws.addRow(['102', 'Marrowbone Cafe', 900, 1800, new Date(Date.UTC(2030, 0, 31))]);
  ws.addRow(['103', 'Pennywhistle Toys', 1500, 3000, new Date(Date.UTC(2029, 8, 30))]);
  const z = fflate.unzipSync(new Uint8Array(await wb.xlsx.writeBuffer()));
  let xml = fflate.strFromU8(z['xl/worksheets/sheet1.xml']);
  let n = 0;
  xml = xml.replace(/(<c r="E\d+" s="\d+"><v>)[^<]*(<\/v>)/g, (m, a, b) => (n++ < bad ? `${a}9e99${b}` : m));
  assert.equal(n >= bad, true, 'the fixture has date cells to break');
  z['xl/worksheets/sheet1.xml'] = enc.encode(xml);
  const bytes = fflate.zipSync(z);
  return new File([bytes], 'invented-roll.xlsx');
}
const getXlsx = async () => ({ ExcelJS, fflate });
const getFflate = async () => fflate;

test('an unreadable date cell is blank: never 0, never today, never the serial', () => {
  assert.equal(cellValue(NOPE), null);
  assert.equal(cellValue({ formula: 'A1', result: NOPE }), null);
  assert.equal(cellValue(new Date(Date.UTC(2031, 4, 31))), '2031-05-31'); // a real date is read as before
  assert.equal(badDate(NOPE), true);
  assert.equal(badDate({ formula: 'A1', result: NOPE }), true);
  for (const v of [null, undefined, 0, '', 'x', 45000, new Date(0), { result: 5 }, { richText: [] }]) assert.equal(badDate(v), false);
});

test('a sheet with such a cell is still read, and counts them', () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Roll');
  ws.addRow(['Unit', 'Lease End']);
  ws.addRow(['101', NOPE]);
  ws.addRow(['102', new Date(Date.UTC(2030, 0, 31))]);
  ws.addRow(['103', { formula: 'B2', result: NOPE }]);
  const clean = wb.addWorksheet('Clean'); clean.addRow(['a', 1]);
  const [g, c] = gridsOf(wb);
  assert.deepEqual(g.rows.map((r) => r.cells), [['Unit', 'Lease End'], ['101', null], ['102', '2030-01-31'], ['103', null]]);
  assert.equal(g.badDates, 2);
  assert.equal(c.badDates, 0);
});

test('the whole file is read from its bytes, with one note giving the count', async () => {
  const grids = await readGrids(await workbookFile(2), getXlsx, { getFflate });
  const cells = grids[0].rows.map((r) => r.cells);
  assert.deepEqual(cells[0], ['Unit', 'Tenant', 'SF', 'Rent', 'Lease End']);
  assert.deepEqual(cells.slice(1).map((r) => r[4]), [null, null, '2029-09-30']);
  assert.deepEqual(cells.slice(1).map((r) => r[3]), [2400, 1800, 3000]); // the other cells are untouched
  assert.equal(grids[0].badDates, 2);
  assert.equal(grids[0].note, '2 date cells in this workbook could not be read and were left blank. Check the dates.');
  for (const row of cells) for (const v of row) assert.ok(v !== 0 && !(typeof v === 'number' && v > 1e50), 'no zero and no raw serial stands in for the date');
});

test('a workbook with no such cell has no note, as before', async () => {
  const grids = await readGrids(await workbookFile(0), getXlsx, { getFflate });
  assert.equal(grids[0].badDates, 0);
  assert.equal('note' in grids[0], false);
  assert.equal(badDateNote(0), '');
  assert.equal(badDateNote(1), '1 date cell in this workbook could not be read and was left blank. Check the dates.');
});

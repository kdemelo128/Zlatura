/* One workbook holding a rent roll sheet and a T-12 sheet (both readers accept it): the documents intake offers both
 * uses, never choosing for the broker; a rent-roll-only and a T-12-only workbook behave as before. Invented workbooks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';

globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const { intake } = await import('../app/ddintake.js');
const I = await import('../app/intake.js');

const getFflate = async () => fflate;
const getXlsx = async () => ({ ExcelJS, fflate });
const deps = { getFflate, getXlsx, readPdf: async () => ({ pages: [], layouts: [] }) };
const MONTHS = ['Jan 2025', 'Feb 2025', 'Mar 2025', 'Apr 2025', 'May 2025', 'Jun 2025'];

function addRoll(wb) {
  const ws = wb.addWorksheet('Rent Roll');
  ws.addRow(['Unit', 'Tenant', 'SF', 'Monthly Rent', 'Lease End']);
  ws.addRow(['101', 'Invented Co', 1000, 2400, '2028-01-31']);
  ws.addRow(['102', 'Sample LLC', 1200, 2900, '2027-06-30']);
  ws.addRow(['103', 'Vacant', 900, 0, '']);
}
function addT12(wb) {
  const ws = wb.addWorksheet('T-12 Operating Statement');
  ws.addRow(['Operating Statement, trailing twelve months']);
  ws.addRow(['Line', ...MONTHS, 'Total']);
  ws.addRow(['Rental income', ...MONTHS.map(() => 10000), 60000]);
  ws.addRow(['Other income', ...MONTHS.map(() => 500), 3000]);
  ws.addRow(['Real estate taxes', ...MONTHS.map(() => 1500), 9000]);
  ws.addRow(['Insurance', ...MONTHS.map(() => 400), 2400]);
  ws.addRow(['Net operating income', ...MONTHS.map(() => 8600), 51600]);
}
const book = async (...adds) => { const wb = new ExcelJS.Workbook(); adds.forEach((a) => a(wb)); return new File([Buffer.from(await wb.xlsx.writeBuffer())], 'workbook.xlsx'); };

test('the verdict of a two-sheet workbook carries both readers; one-sheet workbooks carry one', async () => {
  const both = (await intake(await book(addRoll, addT12), deps)).verdict;
  assert.deepEqual(both.readers, ['t12', 'rrsheet']);
  assert.equal(both.type, null);
  assert.equal(both.reader, null);
  const roll = (await intake(await book(addRoll), deps)).verdict;
  assert.equal(roll.reader, 'rrsheet'); assert.equal(roll.readers, undefined);
  const t12 = (await intake(await book(addT12), deps)).verdict;
  assert.equal(t12.reader, 't12'); assert.equal(t12.readers, undefined);
});

test('staged, a two-sheet workbook offers a rent roll use and a T-12 use of the one file', async () => {
  const p = I.newPlan();
  const [first] = await I.stageFiles(p, [await book(addRoll, addT12)], deps);
  const live = p.items.filter((x) => x.state === 'staged');
  assert.equal(live.length, 2);
  assert.deepEqual(live.map((x) => x.use).sort(), ['Use as T-12', 'Use as rent roll']);
  assert.ok(live.every((x) => /rent roll and an operating statement/.test(x.reason)));
  assert.equal(live[0].file, live[1].file);
  assert.equal(I.readyItems(p, null).length, 2, 'each use is allowed; they do not compete');
  assert.equal(I.questions(p, null).length, 0);
  assert.equal(first, p.items[0]);
  // using one leaves the other still on offer
  I.markUsed(p, live.find((x) => x.type === 'rentroll').id);
  assert.deepEqual(I.readyItems(p, null).map((x) => x.type), ['t12']);
  // the same workbook added again is a repeat, not a third use
  await I.stageFiles(p, [await book(addRoll, addT12)], deps);
  assert.equal(p.items.filter((x) => x.state === 'staged').length, 1);
});

test('a rent-roll-only and a T-12-only workbook stage as one item, as before', async () => {
  const p = I.newPlan();
  await I.stageFiles(p, [await book(addRoll)], deps);
  await I.stageFiles(p, [await book(addT12)], deps);
  assert.deepEqual(p.items.map((x) => [x.type, x.use]), [['rentroll', 'Use as rent roll'], ['t12', 'Use as T-12']]);
});

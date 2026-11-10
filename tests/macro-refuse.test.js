/* A macro workbook is refused by its content, with the true reason, in every import path (rent roll: loadXlsx;
 * T-12: checkUpload + readGrids; documents intake: ddintake.intake). Invented workbook; the macro part is a
 * placeholder, not code. Macros are never run and their values never read. */
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';

globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const { loadXlsx, readGrids } = await import('../app/sheetread.js');
const { intake } = await import('../app/ddintake.js');
const { MACRO_REFUSAL } = await import('../app/filekind.js');

const getFflate = async () => fflate;
const getXlsx = async () => ({ ExcelJS, fflate });
const enc = new TextEncoder();
const MACRO = /has macros.*never runs macros.*\.xlsx/s;

async function book({ macro = false, printArea = false } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rent Roll');
  ws.addRow(['Unit', 'Tenant', 'SF', 'Monthly Rent']);
  ws.addRow(['101', 'Invented Co', 1000, 2400]);
  let z = fflate.unzipSync(new Uint8Array(await wb.xlsx.writeBuffer()));
  if (macro) z['xl/vbaProject.bin'] = enc.encode('placeholder, not a macro');
  if (printArea) z['xl/workbook.xml'] = enc.encode(fflate.strFromU8(z['xl/workbook.xml']).replace('</workbook>', '<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">\'Rent Roll\'!$A$1:$D$2</definedName></definedNames></workbook>'));
  return Buffer.from(fflate.zipSync(z));
}
const file = (b, name) => new File([b], name);

test('rent roll path (loadXlsx): a macro workbook is refused with the macro reason, whatever it is named', async () => {
  for (const name of ['roll.xlsm', 'roll.xlsx']) await assert.rejects(loadXlsx(file(await book({ macro: true }), name), getXlsx), MACRO);
});

test('rent roll path: the refusal comes before ExcelJS opens it (a print-area name does not turn it into "damaged")', async () => {
  await assert.rejects(loadXlsx(file(await book({ macro: true, printArea: true }), 'roll.xlsx'), getXlsx), MACRO);
});

test('T-12 path (readGrids): a macro workbook is refused, its values not read', async () => {
  await assert.rejects(readGrids(file(await book({ macro: true }), 'stmt.xlsm'), getXlsx, { getFflate }), MACRO);
});

test('documents path (intake): the file is described as refused with the macro reason', async () => {
  const info = await intake(file(await book({ macro: true }), 'docs.xlsm'), { getFflate, getXlsx, readPdf: async () => ({ pages: [], layouts: [] }) });
  assert.match(info.refuse, MACRO);
  assert.equal(info.verdict.type, null);
});

test('allowMacros keeps Convert working: its own loader may still open a macro workbook (values not used for an import)', async () => {
  const wb = await loadXlsx(file(await book({ macro: true }), 'x.xlsm'), getXlsx, null, { allowMacros: true });
  assert.equal(wb.worksheets.length, 1);
});

test('a normal .xlsx, and an .xlsm without a macro part, are read as before', async () => {
  for (const name of ['a.xlsx', 'b.xlsm']) {
    const g = await readGrids(file(await book(), name), getXlsx, { getFflate });
    assert.equal(g[0].macros, false);
    assert.equal(g[0].rows.length, 2);
    await loadXlsx(file(await book(), name), getXlsx);
  }
  assert.match(MACRO_REFUSAL, MACRO);
});

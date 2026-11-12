/* A workbook with macros is read for its cell VALUES only, by its content (not its name), in the T-12, rent roll and documents
 * paths, and says "Macros were not run; values as last saved." The macro part is never opened, run or kept. Something that is not a
 * real workbook is still refused. Invented workbook; the macro part is a placeholder, not code. */
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';

globalThis.document ||= { createElement: () => ({}), addEventListener() {}, documentElement: { style: {} }, querySelector: () => null, body: {} };
globalThis.window ||= globalThis;
globalThis.navigator ||= { userAgent: 'node' };
const { loadXlsx, readGrids } = await import('../app/sheetread.js');
const { intake } = await import('../app/ddintake.js');
const { MACRO_REFUSAL, MACRO_NOTE } = await import('../app/filekind.js');

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

test('rent roll path (loadXlsx): a macro workbook is opened for its values, whatever it is named; the macro part is never read', async () => {
  for (const name of ['roll.xlsm', 'roll.xlsx']) {
    const wb = await loadXlsx(file(await book({ macro: true }), name), getXlsx);
    assert.equal(wb.worksheets[0].getCell('B2').value, 'Invented Co');
  }
});

test('the print-area name does not turn a macro workbook into "damaged"', async () => {
  const wb = await loadXlsx(file(await book({ macro: true, printArea: true }), 'roll.xlsx'), getXlsx);
  assert.equal(wb.worksheets.length, 1);
});

test('T-12 path (readGrids): the values are read, every sheet is marked macros, and the note says the macros were not run', async () => {
  const g = await readGrids(file(await book({ macro: true }), 'stmt.xlsm'), getXlsx, { getFflate });
  assert.equal(g[0].macros, true);
  assert.equal(g[0].rows.length, 2);
  assert.equal(g[0].rows[1].cells[3], 2400);
  assert.equal(g[0].note, MACRO_NOTE);
  assert.match(MACRO_NOTE, /Macros were not run; values as last saved/);
});

test('documents path (intake): the file is read like a workbook, not refused', async () => {
  const info = await intake(file(await book({ macro: true }), 'docs.xlsm'), { getFflate, getXlsx, readPdf: async () => ({ pages: [], layouts: [] }) });
  assert.equal(info.refuse, null);
  assert.equal(info.verdict.type, 'rentroll');
});

test('Start from documents: the staged row says macros were not run, and a plain workbook says nothing of macros', async () => {
  const I = await import('../app/intake.js');
  const deps = { getFflate, getXlsx, readPdf: async () => ({ pages: [], layouts: [] }) };
  const plan = I.newPlan();
  const [m] = await I.stageFiles(plan, [file(await book({ macro: true }), 'with-macros.xlsm')], deps);
  assert.match(m.reason, /Macros were not run; values as last saved\./);
  assert.equal(m.type, 'rentroll');
  const [p] = await I.stageFiles(plan, [file(await book(), 'plain.xlsx')], deps);
  assert.doesNotMatch(p.reason, /acro/);
});

test('a file that is not a real workbook is still refused, whatever its name says (a renamed text or zip file)', async () => {
  await assert.rejects(readGrids(file(Buffer.from('%PDF-1.7\n% not a workbook'), 'fake.xlsm'), getXlsx, { getFflate }));
  const z = fflate.zipSync({ 'readme.txt': enc.encode('x'), 'xl/vbaProject.bin': enc.encode('x') }); // macro part but no workbook part
  await assert.rejects(loadXlsx(file(Buffer.from(z), 'fake.xlsm'), getXlsx));
});

test('the import screens that refuse a .xlsm by its name (rent roll, comps) still do', async () => {
  const { unreadable } = await import('../app/sheetread.js');
  assert.match(unreadable({ name: 'a.xlsm' }, 'rent roll'), MACRO);
});

test('Convert’s own loader (allowMacros: true) still opens a macro workbook', async () => {
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

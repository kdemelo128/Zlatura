/* A filled template: formulas that read the filled cells lose their stored result (a phone preview shows
 * stored results and never recalculates); formulas that don't keep theirs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { inspectWorkbook, inspectTemplate, fillCells, fillTemplate } from '../app/template.js';

const xml = { DOMParser, XMLSerializer };

/** A model whose formulas carry the blank template's results. */
async function makeModel() {
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet('Inputs');
  s.getCell('A5').value = 'Purchase Price'; s.getCell('B5').value = 1000000;
  s.getCell('A6').value = 'NOI'; s.getCell('B6').value = 50000;
  s.getCell('B7').value = { formula: 'B6/B5', result: 0.05 };
  s.getCell('B8').value = { formula: '2+2', result: 4 };
  s.getCell('B9').value = { formula: 'IFERROR(B6/B8,"")', result: 12500 };
  wb.definedNames.add('Inputs!$B$5', 'AskPrice');
  const r = wb.addWorksheet('Rent Roll');
  ['Suite', 'Tenant', 'SF', 'Annual Rent', 'Rent / SF'].forEach((h, i) => { r.getCell(4, i + 1).value = h; });
  for (let i = 5; i <= 6; i++) {
    r.getCell(`A${i}`).value = `old ${i}`; r.getCell(`C${i}`).value = 1000; r.getCell(`D${i}`).value = 52000;
    r.getCell(`E${i}`).value = { formula: `D${i}/C${i}`, result: 52 };
  }
  const m = wb.addWorksheet('Summary');
  m.getCell('B1').value = { formula: 'Inputs!B7*100', result: 5 };
  m.getCell('B2').value = { formula: 'SUM(Inputs!B8:B8)', result: 4 };
  m.getCell('B3').value = { formula: 'AskPrice*2', result: 2000000 };
  m.getCell('B4').value = { formula: "SUM('Rent Roll'!E5:E6)", result: 104 };
  m.getCell('B5').value = { formula: '7*6', result: 42 };
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Each formula cell: { f, v } from the sheet XML. */
function cellsOf(bytes, sheetNo) {
  const files = fflate.unzipSync(bytes);
  const doc = new DOMParser().parseFromString(fflate.strFromU8(files[`xl/worksheets/sheet${sheetNo}.xml`]), 'application/xml');
  const out = {};
  for (const c of [...doc.getElementsByTagName('c')]) {
    const f = c.getElementsByTagName('f')[0]; const v = c.getElementsByTagName('v')[0];
    out[c.getAttribute('r')] = { f: f ? f.textContent : null, v: v ? v.textContent : null };
  }
  return out;
}

const values = { price: { value: 12500000, type: 'money', source: 'OM page 2' }, noi: { value: 875000, type: 'money', source: 'OM page 3' } };
const map = [{ sheet: 'Inputs', cell: 'B5', field: 'price' }, { sheet: 'Inputs', cell: 'B6', field: 'noi' }];
const rows = [{ unit: { value: '100', type: 'text' }, sf: { value: 2400, type: 'int' }, annual: { value: 124800, type: 'money' } }];
const tables = [{ sheet: 'Rent Roll', headerRow: 4, columns: [{ col: 1, field: 'unit' }, { col: 3, field: 'sf' }, { col: 4, field: 'annual' }], rows }];

test('a filled cell clears the stored result of the formulas that read it, and of theirs', async () => {
  const bytes = await makeModel();
  const before = cellsOf(bytes, 1);
  assert.equal(before.B7.v, '0.05', 'the blank template stores its own result');
  const { bytes: out } = fillCells(fflate, bytes, { cellMap: map, values, audit: false }, xml);
  const inputs = cellsOf(out, 1); const sum = cellsOf(out, 3);
  assert.equal(inputs.B7.f, 'B6/B5', 'the formula stays');
  assert.equal(inputs.B7.v, null, 'B7 reads B5 and B6: no stale figure');
  assert.equal(sum.B1.v, null, 'and the formula that reads B7');
  assert.equal(sum.B3.v, null, 'and one that reads the cell through a named range');
  assert.equal(inputs.B8.v, '4', 'a formula that reads nothing filled keeps its value');
  assert.equal(sum.B2.v, '4');
  assert.equal(sum.B5.v, '42');
  assert.equal(cellsOf(out, 2).E5.v, '52', 'and so does a table the fill did not touch');
  assert.match(fflate.strFromU8(fflate.unzipSync(out)['xl/workbook.xml']), /fullCalcOnLoad="1"/, 'Excel recalculates on open');
});

test('a filled table clears the formulas that read its columns', async () => {
  const bytes = await makeModel();
  const { bytes: out } = fillCells(fflate, bytes, { cellMap: [], values: {}, tables, audit: false }, xml);
  const roll = cellsOf(out, 2); const sum = cellsOf(out, 3);
  assert.equal(roll.E5.f, 'D5/C5');
  assert.equal(roll.E5.v, null, 'the row formula reads filled cells');
  assert.equal(roll.E6.v, null, 'also on a row the fill emptied');
  assert.equal(sum.B4.v, null, 'and the total that reads them');
  assert.equal(sum.B1.v, '5', 'a formula elsewhere keeps its value');
});

test('a shared formula is cleared with its first cell', async () => {
  const bytes = await makeModel();
  const files = fflate.unzipSync(bytes);
  const p = 'xl/worksheets/sheet2.xml';
  let x = fflate.strFromU8(files[p]);
  x = x.replace(/<f>D5\/C5<\/f>/, '<f t="shared" ref="E5:E6" si="0">D5/C5</f>').replace(/<f>D6\/C6<\/f>/, '<f t="shared" si="0"/>');
  assert.match(x, /si="0"\/>/, 'the fixture has a shared copy');
  files[p] = fflate.strToU8(x);
  const { bytes: out } = fillCells(fflate, fflate.zipSync(files), { cellMap: [], values: {}, tables, audit: false }, xml);
  const roll = cellsOf(out, 2);
  assert.equal(roll.E5.v, null);
  assert.equal(roll.E6.v, null, 'the copy goes with the cell it copies');
});

test('the comp fill clears the formulas that read the comps it wrote', async () => {
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet('Sale Comps');
  s.addRow(['Property Name', 'Sale Price', 'Building SF', 'Price / SF']);
  s.addRow(['Comp #1', 1000000, 1000, null]);
  s.getCell('D2').value = { formula: 'B2/C2', result: 1000 };
  s.getCell('F1').value = { formula: '3*3', result: 9 };
  const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
  const plan = inspectTemplate(fflate, bytes, xml);
  plan.sheets[0].role = 'sale';
  const { bytes: out } = fillTemplate(fflate, bytes, plan, { sales: [{ kind: 'sale', name: '100 Example St', price: 5200000, bsf: 8000, flags: [] }], market: [] }, xml);
  const c = cellsOf(out, 1);
  assert.equal(c.D2.f, 'B2/C2');
  assert.equal(c.D2.v, null, 'no stale price per SF beside the new comp');
  assert.equal(c.F1.v, '9', 'an unrelated formula keeps its value');
});

test('the mapping grid marks a formula with no stored result, and not one that has one', async () => {
  const bytes = await makeModel();
  const find = (info, sheet, ref) => info.sheets.find((s) => s.name === sheet).cells.find((c) => c.ref === ref);
  const filled = inspectWorkbook(fflate, fillCells(fflate, bytes, { cellMap: map, values, audit: false }, xml).bytes, xml);
  assert.equal(find(filled, 'Inputs', 'B7').pending, true);
  assert.equal(find(filled, 'Inputs', 'B7').text, '', 'the old figure is gone, not shown as 0');
  assert.equal(find(filled, 'Inputs', 'B8').pending, false);
  assert.equal(find(filled, 'Inputs', 'B5').pending, false, 'a plain value is never pending');
});

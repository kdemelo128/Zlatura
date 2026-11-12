/* Invented workbooks with macros for the browser flow: an invented rent roll with a placeholder macro part (not code), and a
 * file named .xlsm that is not a workbook.  node tests/tools/macrofiles.mjs <dir> */
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';

const d = process.argv[2];
if (d) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rent Roll');
  ws.addRow(['Unit', 'Tenant', 'SF', 'Monthly Rent', 'Lease End']);
  ws.addRow(['101', 'Invented Co', 1000, 2400, '2028-01-31']);
  ws.addRow(['102', 'Sample LLC', 1500, 3300, '2029-06-30']);
  ws.addRow(['103', 'Vacant', 800, 0, '']);
  const z = fflate.unzipSync(new Uint8Array(await wb.xlsx.writeBuffer()));
  z['xl/vbaProject.bin'] = new TextEncoder().encode('placeholder, not a macro');
  fs.writeFileSync(`${d}/macro-rent-roll.xlsm`, fflate.zipSync(z));
  fs.writeFileSync(`${d}/fake-workbook.xlsm`, '%PDF-1.7\n% this is not a workbook\n');
  console.log('ok');
}

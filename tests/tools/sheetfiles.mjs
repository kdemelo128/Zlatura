/* Invented workbooks that used to stop the reader, for the browser flow: an invented rent roll with overlapping merged ranges, and one
 * with no shared-strings part.  node tests/tools/sheetfiles.mjs <dir> */
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
  const base = fflate.unzipSync(new Uint8Array(await wb.xlsx.writeBuffer()));
  const td = new TextDecoder(); const te = new TextEncoder();
  const merged = { ...base, 'xl/worksheets/sheet1.xml': te.encode(td.decode(base['xl/worksheets/sheet1.xml']).replace('</sheetData>', '</sheetData><mergeCells count="2"><mergeCell ref="G1:H2"/><mergeCell ref="H2:I3"/></mergeCells>')) };
  fs.writeFileSync(`${d}/overlapping-merge-rent-roll.xlsx`, fflate.zipSync(merged));
  const nostr = { ...base }; delete nostr['xl/sharedStrings.xml'];
  fs.writeFileSync(`${d}/no-strings-rent-roll.xlsx`, fflate.zipSync(nostr));
  console.log('ok');
}

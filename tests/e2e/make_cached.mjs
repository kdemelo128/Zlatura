/* A firm's underwriting model saved by Excel: every formula carries its result, as the blank template had it
 * (the browser flows fill it, then check that no stale figure is left). Usage: node make_cached.mjs out.xlsx */
import fs from 'fs';
import { createRequire } from 'module';
const ExcelJS = createRequire(import.meta.url)('exceljs');
const wb = new ExcelJS.Workbook();
const s = wb.addWorksheet('Inputs');
for (const [r, t] of [[5, 'Purchase Price'], [6, 'NOI'], [7, 'Cap Rate'], [11, 'Reserve']]) s.getCell(`A${r}`).value = t;
s.getCell('B5').value = 1000000;
s.getCell('B6').value = 50000;
s.getCell('B7').value = { formula: 'IFERROR(B6/B5,"")', result: 0.05 };
s.getCell('B11').value = { formula: '4*25', result: 100 };
const m = wb.addWorksheet('Summary');
m.getCell('A1').value = 'Price'; m.getCell('B1').value = { formula: 'Inputs!B5', result: 1000000 };
m.getCell('A2').value = 'Implied cap'; m.getCell('B2').value = { formula: 'Inputs!B7', result: 0.05 };
fs.writeFileSync(process.argv[2], new Uint8Array(await wb.xlsx.writeBuffer()));

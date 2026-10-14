/* tests/tools/rr-local.mjs -- not a test: read real rent rolls kept in private/
 * (git-ignored; never committed) the way the app reads them, and print only
 * their structure. For an OM (.pdf): pages, pages with no text layer, the
 * rent roll's pages and how each was reached (header, repeated header,
 * carried on), rows, vacant and month-to-month rows, total rows found and
 * whether each adds up, columns recognised by kind, rows per page, confidence
 * buckets and the Data QC checks by kind and level. For a spreadsheet rent
 * roll (.xlsx, .csv): the sheet chosen, rows, columns recognised by kind, and
 * the units the importer makes. No name, figure, tenant, column heading or
 * file name is printed, so the output can be shared. Every real file stays on
 * this machine.
 *
 *   node tests/tools/rr-local.mjs                  # every .pdf, .xlsx and .csv in private/
 *   node tests/tools/rr-local.mjs private/a.pdf    # one */
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import * as pdfjs from '../../vendor/pdf-4.7.76-legacy.min.js';
import { pdfPages } from '../../app/pdftext.js';
import { readOm } from '../../app/om.js';
import { omRollRecord } from '../../app/rentroll.js';
import { cellValue, csvRows } from '../../app/sheetread.js';

globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { addEventListener() {}, dispatchEvent() {} };
const { headerAndRows, guessField, rowsToLeases } = await import('../../app/rentrollui.js');
const { emptyRentRoll } = await import('../../app/rentroll.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;

const ROOT = new URL('../../', import.meta.url).pathname;
const dir = path.join(ROOT, 'private');
const files = process.argv.slice(2).length ? process.argv.slice(2) : (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(pdf|xlsx|csv)$/i.test(f)).sort().map((f) => path.join(dir, f)) : []);
if (!files.length) { console.log('No files: put real rent rolls or OMs (.pdf, .xlsx or .csv) in private/ (git-ignored) or name them.'); process.exit(0); }

const tally = (xs) => { const o = {}; for (const x of xs) o[x] = (o[x] || 0) + 1; return o; };
const show = (o) => JSON.stringify(o);

let n = 0;
for (const f of files) {
  n += 1;
  const tag = `file ${n}`; // the file's name may name the property: it isn't printed
  try {
    if (/\.pdf$/i.test(f)) {
      const layouts = [];
      const pages = await pdfPages(pdfjs, new Uint8Array(fs.readFileSync(f)), { layouts, verbosity: 0 });
      const om = readOm(pages, { layouts });
      const figures = Object.fromEntries(Object.entries(om.fields).map(([k, v]) => [k === 'lot' ? 'lot_sf' : k, v.value]));
      const { qc } = omRollRecord(om, { figures, asOf: new Date().toISOString().slice(0, 10) });
      const rr = om.rentRoll;
      console.log(`${tag} (OM): ${om.pages} pages; ${om.scanned.length} with no text layer; stated: ${['bsf', 'occ', 'rent_inplace', 'gpr', 'units'].filter((k) => k in figures).join(', ') || 'none of building SF, occupancy, in-place rent, GPR, units'}`);
      if (!rr) { console.log('  no rent roll table found'); }
      else {
        const rows = rr.rows;
        console.log(`  rent roll: ${rows.length} rows on ${rr.pages.length} page(s) (pages ${rr.pages.join(', ')}); reached by ${show(tally(rr.segments.map((s) => s.how)))}; repeated headers skipped ${rr.segments.reduce((s, x) => s + x.repeated, 0)}`);
        console.log(`  rows per page: ${show(tally(rows.map((r) => r.src.page)))}; vacant ${rows.filter((r) => r.vacant).length}; month-to-month ${rows.filter((r) => r.mtm).length} (holdover ${rows.filter((r) => r.holdover).length}); no SF ${rows.filter((r) => !r.sf).length}; name joined from more than one line ${rows.filter((r) => r.why.some((w) => /joined/.test(w))).length}`);
        console.log(`  columns by kind: ${show(tally(rr.columns.map((c) => c.kind)))}; rent units: ${show(tally(rr.columns.filter((c) => c.basis).map((c) => `${c.kind}:${c.reading}/${c.basis}`)))}`);
        console.log(`  total rows: ${show(tally(rr.totals.map((t) => t.kind)))}; their checks: ${show(tally(rr.totals.flatMap((t) => Object.entries(t.check || {}).map(([k, c]) => `${k}:${c.ok ? 'adds up' : 'does not'}`))))}`);
        console.log(`  confidence: table ${rr.confidence}; rows ${show(tally(rows.map((r) => r.confidence)))}; values worked out ${show(tally(rows.flatMap((r) => r.derived)))}`);
      }
      if (qc) {
        console.log(`  Data QC: ${show(tally(qc.checks.map((c) => `${c.kind}:${c.level}`)))}; rent roll ${qc.held ? 'held back by a failed check' : qc.applied ? 'applied' : 'none'}`);
      }
    } else {
      let table = null;
      if (/\.csv$/i.test(f)) table = headerAndRows(csvRows(fs.readFileSync(f, 'utf8')).filter((r) => r.some((x) => String(x).trim())), 'CSV');
      else {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(fs.readFileSync(f));
        let sheets = 0;
        wb.eachSheet((ws) => {
          if (ws.state && ws.state !== 'visible') return;
          sheets += 1;
          const grid = [];
          ws.eachRow({ includeEmpty: false }, (row, r) => { if (r > 400) return; const vals = []; row.eachCell({ includeEmpty: true }, (cell, c) => { vals[c - 1] = cellValue(cell.value); }); grid.push(vals); });
          const t = headerAndRows(grid, ws.name);
          if (t && (!table || t.score > table.score)) table = { ...t, index: sheets };
        });
      }
      if (!table) { console.log(`${tag} (spreadsheet): no rent roll found (no row of headings such as Unit, Tenant, SF and Rent)`); continue; }
      const mapping = table.headers.map((h) => guessField(h));
      const rr = emptyRentRoll('Retail', new Date().toISOString().slice(0, 10));
      const { leases, skipped } = rowsToLeases(rr, table, mapping);
      console.log(`${tag} (spreadsheet${table.index ? `, sheet ${table.index}` : ''}): ${table.rows.length} rows; columns ${table.headers.filter((h) => String(h).trim()).length}, recognised by kind ${show(tally(mapping.filter(Boolean)))}, not recognised ${mapping.filter((m, i) => !m && String(table.headers[i]).trim()).length}; units made ${leases.length}, rows skipped ${skipped}; vacant ${leases.filter((L) => L.vacant).length}; with no SF ${leases.filter((L) => !L.sf).length} (spreadsheet imports don't run Data QC yet)`);
    }
  } catch (e) {
    console.log(`${tag}: not read (${String(e && e.message).replace(/“[^”]*”/g, '“…”').slice(0, 120)})`);
  }
}

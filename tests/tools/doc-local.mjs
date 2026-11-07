/* tests/tools/doc-local.mjs -- not a test: run the documents kept in private/ (git-ignored; never committed)
 * through the SAME code the app uses and print a scoreboard of COUNTS ONLY, by detected layout family.
 * Per file: checkUpload / checkReader (filekind.js), the ddintake.js classifier, then the matching reader (T-12:
 * t12.js; rent roll: rrdoc.js, omroll.js, rentrollui.js; lease: leaseread.js; OM: om.js). Per family: files,
 * accepted (a reader took it), asked (needs the broker's choice), refused. Where `<name>.answers.json` sits next to
 * a document (a flat object of the values the owner checked), also fields right, wrong, asked and missed.
 * No file name, tenant, property, address or figure is printed: files get a label (file-01 ...). `--labels` writes
 * doc-local-labels.json next to the folder, only when asked. It replaces neither t12-local.mjs nor rr-local.mjs.
 *
 *   node tests/tools/doc-local.mjs                       # private/docs
 *   node tests/tools/doc-local.mjs private/docs --labels
 *   --allow-outside-private  lets a folder elsewhere be read (the tests use it on invented files)
 *
 * Answer-file keys by family (values are what the document says; amounts in dollars):
 *   t12: months, lines, egi, opex, noi, taxes     rent roll: rows, units, vacant, sf     om: the OM reader's field names
 *   lease: the lease reader's field keys (a value that needs the broker's choice counts as asked)
 * Exit: 0 done; 2 a folder outside private/ without the flag, or no folder. */
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import * as fflate from 'fflate';
import * as pdfjs from '../../vendor/pdf-4.7.76-legacy.min.js';
import { checkUpload, checkReader } from '../../app/filekind.js';
import { pdfPages } from '../../app/pdftext.js';
import { readGrids } from '../../app/sheetread.js';
import { sheetChoices, pickSheet, layoutOf, numberFormatOf, importStatement, statementTotals } from '../../app/t12.js';
import { readOm } from '../../app/om.js';
import { readLease, pageModel, docType } from '../../app/leaseread.js';

globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { addEventListener() {}, dispatchEvent() {} };
const { intake } = await import('../../app/ddintake.js');
const { headerAndRows, guessField, rowsToLeases } = await import('../../app/rentrollui.js');
const { emptyRentRoll } = await import('../../app/rentroll.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdf-4.7.76-legacy.worker.min.js', import.meta.url).href;

const ROOT = new URL('../../', import.meta.url).pathname;
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const given = args.filter((a) => !a.startsWith('--'))[0];
const folder = path.resolve(given || path.join(ROOT, 'private', 'docs'));
const inPrivate = (p) => { const r = path.relative(path.join(ROOT, 'private'), p); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
if (!inPrivate(folder) && !flag('--allow-outside-private')) {
  console.log('Refused: real documents stay in the git-ignored private/ folder. Put them there, or pass --allow-outside-private for invented files.');
  process.exit(2);
}
if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) { console.log('No folder to read (counts only: 0 files).'); process.exit(given ? 2 : 0); }

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1)).flatMap((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return e.name.startsWith('.') ? [] : walk(p);
  return e.name.startsWith('.') || /\.answers\.json$/i.test(e.name) || e.name === 'doc-local-labels.json' ? [] : [p];
});
const files = walk(folder);

/** A File-like over a Buffer, as the app's readers take it. */
const fileLike = (f) => {
  const buf = fs.readFileSync(f);
  const ab = () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return { name: path.basename(f), size: buf.length, type: '', slice: (a, b) => ({ arrayBuffer: async () => buf.buffer.slice(buf.byteOffset + a, buf.byteOffset + Math.min(b, buf.length)) }), arrayBuffer: async () => ab(), text: async () => buf.toString('utf8') };
};
const getXlsx = async () => ({ ExcelJS, fflate });
const getFflate = async () => fflate;
const readPdf = async (bytes) => { const layouts = []; const pages = await pdfPages(pdfjs, new Uint8Array(bytes), { layouts, verbosity: 0 }); return { pages, layouts }; };

const same = (a, b) => (typeof a === 'number' || typeof b === 'number') ? Math.abs(Number(a) - Number(b)) <= 0.005 : String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/** The values a reader found, as { key: value }, plus the keys it left for the broker (`asked`). Never printed. */
async function extract(file, info, grids, pages) {
  const got = {}; const asked = new Set();
  const v = info.verdict;
  if (v.reader === 't12' && grids) {
    const p = pickSheet(sheetChoices(grids, { file: file.name }));
    const c = p.choice || (p.ask || []).find((x) => !x.projection);
    if (c) {
      const g = grids[c.i];
      const t = importStatement(g.rows, { sheet: g.sheet, numberFormat: numberFormatOf(g.rows, layoutOf(g.rows, { sheet: g.sheet })).format || 'us' });
      const T = statementTotals(t);
      Object.assign(got, { months: T.months, lines: t.lines.length, egi: T.egi, opex: T.opex, noi: T.noi, taxes: T.taxes });
    }
  } else if (v.reader === 'rrsheet' && grids) {
    let table = null;
    for (const g of grids) { try { const t = headerAndRows(g.rows.map((r) => r.cells), g.sheet); if (t && (!table || t.score > table.score)) table = t; } catch { /* next sheet */ } }
    if (table) {
      const { leases } = rowsToLeases(emptyRentRoll('Retail', new Date().toISOString().slice(0, 10)), table, table.headers.map((h) => guessField(h)));
      Object.assign(got, { rows: table.rows.length, units: leases.length, vacant: leases.filter((L) => L.vacant).length, sf: leases.reduce((s, L) => s + (Number(L.sf) || 0), 0) });
    }
  } else if (pages) {
    if (v.reader === 'om' || v.reader === 'rrpdf') {
      const om = readOm(pages.pages, { layouts: pages.layouts.length === pages.pages.length ? pages.layouts : null });
      for (const [k, f] of Object.entries(om.fields)) if (f && f.value !== undefined && f.value !== null) got[k] = f.value;
      if (om.rentRoll) Object.assign(got, { rows: om.rentRoll.rows.length, units: om.rentRoll.rows.length, vacant: om.rentRoll.rows.filter((r) => r.vacant).length });
    } else {
      const model = pageModel(pages.pages);
      const dt = docType(model, file.name);
      if (dt.type === 'lease' || dt.type === 'amendment') {
        for (const c of readLease(model, { name: file.name }).cands) { if (c.status === 'found') got[c.key] = c.value; else if (c.status === 'ambiguous') asked.add(c.key); }
      }
    }
  }
  return { got, asked };
}

const fam = {}; // family -> counts
const bump = (f, k, n = 1) => { (fam[f] ||= { files: 0, accepted: 0, asked: 0, refused: 0, right: 0, wrong: 0, askedFields: 0, missed: 0, answered: 0 })[k] += n; };
const labels = {};
const perFile = [];

let n = 0;
for (const f of files) {
  n += 1;
  const label = `file-${String(n).padStart(2, '0')}`;
  labels[label] = path.relative(folder, f);
  let family = 'unreadable'; let outcome = 'refused'; let gotAsked = null;
  try {
    const file = fileLike(f);
    const sniffedKind = (await checkUpload(file, { getFflate })).kind;
    // the same gate the readers' buttons use (text files have no such gate: they are read as text)
    const readerNote = ['pdf', 'xlsx'].includes(sniffedKind) ? await checkReader(file, sniffedKind, { getFflate }) : null;
    const info = await intake(file, { getFflate, getXlsx, readPdf });
    const v = info.verdict;
    let grids = null; let pages = null;
    if (!info.refuse && !readerNote) {
      if (sniffedKind === 'pdf') { try { pages = await readPdf(fs.readFileSync(f)); } catch { pages = null; } } else if (['xlsx', 'text'].includes(sniffedKind)) { try { grids = await readGrids(file, getXlsx, { maxRows: 1500, getFflate }); } catch { grids = null; } }
    }
    if (info.refuse || readerNote) { outcome = 'refused'; family = sniffedKind || 'unknown'; }
    else if (v.type) { outcome = 'accepted'; family = v.reader; }
    else {
      // a PDF no reader typed may still be a lease: the lease reader's own type test says so
      let lease = false;
      if (pages && !v.scanned) { try { const t = docType(pageModel(pages.pages), file.name).type; lease = t === 'lease' || t === 'amendment'; } catch { lease = false; } }
      if (lease) { outcome = 'accepted'; family = 'lease'; } else if (v.scanned) { outcome = 'refused'; family = 'scan'; } else { outcome = 'asked'; family = v.ask.length ? `ask:${[...v.ask].sort().join('+')}` : 'unclassified'; if (!v.ask.length) outcome = 'refused'; }
    }
    if (outcome === 'accepted') { try { gotAsked = await extract(file, { ...info, verdict: { ...v, reader: family === 'lease' ? 'lease' : v.reader } }, grids, pages); } catch { gotAsked = { got: {}, asked: new Set(), failed: true }; } }
  } catch { family = 'unreadable'; outcome = 'refused'; }
  bump(family, 'files'); bump(family, outcome);
  // answer file: fields right, wrong, asked, missed
  const ans = f.replace(/\.[^.\\/]+$/, '') + '.answers.json';
  let tally = null;
  if (fs.existsSync(ans)) {
    let want = {};
    try { want = JSON.parse(fs.readFileSync(ans, 'utf8')); } catch { want = {}; }
    tally = { right: 0, wrong: 0, asked: 0, missed: 0 };
    for (const [k, w] of Object.entries(want && typeof want === 'object' && !Array.isArray(want) ? want : {})) {
      if (outcome === 'asked') tally.asked += 1;
      else if (outcome === 'refused' || !gotAsked) tally.missed += 1;
      else if (gotAsked.asked.has(k)) tally.asked += 1;
      else if (!(k in gotAsked.got)) tally.missed += 1;
      else if (same(gotAsked.got[k], w)) tally.right += 1;
      else tally.wrong += 1;
    }
    bump(family, 'answered');
    bump(family, 'right', tally.right); bump(family, 'wrong', tally.wrong); bump(family, 'askedFields', tally.asked); bump(family, 'missed', tally.missed);
  }
  perFile.push(`${label}: ${family}, ${outcome}${tally ? `; fields right ${tally.right}, wrong ${tally.wrong}, asked ${tally.asked}, missed ${tally.missed}` : ''}`);
}

console.log(`doc-local: ${files.length} file(s) read by the app's own readers; counts only (no names, figures or text are printed)`);
if (!files.length) console.log('No files: put documents in private/docs (git-ignored) or name a folder.');
console.log('family | files | accepted | asked | refused | answer files | fields right | wrong | asked | missed');
const tot = { files: 0, accepted: 0, asked: 0, refused: 0, answered: 0, right: 0, wrong: 0, askedFields: 0, missed: 0 };
for (const [name, c] of Object.entries(fam).sort()) {
  console.log(`${name} | ${c.files} | ${c.accepted} | ${c.asked} | ${c.refused} | ${c.answered} | ${c.right} | ${c.wrong} | ${c.askedFields} | ${c.missed}`);
  for (const k of Object.keys(tot)) tot[k] += c[k];
}
console.log(`TOTAL | ${tot.files} | ${tot.accepted} | ${tot.asked} | ${tot.refused} | ${tot.answered} | ${tot.right} | ${tot.wrong} | ${tot.askedFields} | ${tot.missed}`);
if (flag('--verbose-files')) for (const l of perFile) console.log(l);
if (flag('--labels')) {
  const out = path.join(path.dirname(folder), 'doc-local-labels.json');
  fs.writeFileSync(out, JSON.stringify(labels, null, 2));
  console.log('Wrote the label map next to the folder (it holds file names: keep it in private/).');
}

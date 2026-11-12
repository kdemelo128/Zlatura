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
 *   --ocr                    a PDF with no text layer is read by the app's on-device OCR (app/ocrpdf.js, the same code and
 *                            limits the app runs): the engine runs in Playwright's Chromium (tests/tools/ocr-browser.mjs; it cannot
 *                            run in Node), everything else here. Slow: about a minute a page on a cloud machine. Adds a count line.
 *   --allow-outside-private  lets a folder elsewhere be read (the tests use it on invented files)
 *   --reasons                after the family table, WHY each refused, asked or identified file ended where it did:
 *                            a 'reason | files' table and a 'family | reason | files' table, counts only. A reason is
 *                            a code from the app's own code paths (zip-not-opened, docx-unreadable, macros-values-only,
 *                            sheet-read-failed:<error class>, pdf-read-failed:<error class>, no-text-layer:<chars bucket>,
 *                            no-reader-for-type:<type>, both-readers-accept, text-names-reader-type:<type>,
 *                            om-wording-also-other-type, classifier-broad:<N> candidates, unknown-title, word-narrative)
 *                            plus shape buckets (pages:, sheets:, hidden-sheets:). A file the classifier typed
 *                            confidently but for which the app has no reader (a pricing summary, a projection) is
 *                            'identified, no reader': an extra last column, not 'asked'. Error classes only, never a
 *                            message; page, sheet and character counts only as buckets. Without the flag the output is
 *                            exactly what it was before.
 *
 * A zip is opened in memory by the app's own code (ddintake.js zipMembers): each file inside is one row of the table, read as a dropped
 * file is, and the zip is counted once under the reason 'zip-opened:<files bucket> files'; a refused part is family 'zip-part'
 * (zip-part-unsafe-path, -too-deep, -over-cap, -not-opened), a zip refused whole or empty family 'zip' (zip-not-opened, zip-empty).
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
import { classify } from '../../app/ddtypes.js';
import { pdfPages } from '../../app/pdftext.js';
import { readPdfOcr, ocrOf } from '../../app/ocrpdf.js';
import { readGrids } from '../../app/sheetread.js';
import { sheetChoices, pickSheet, layoutOf, numberFormatOf, importStatement, statementTotals } from '../../app/t12.js';
import { readOm } from '../../app/om.js';
import { readLease, pageModel, docType } from '../../app/leaseread.js';

// pdf.js says "cannot polyfill DOMMatrix" in Node (no canvas); that is not this tool's output
const log0 = console.log; console.log = (...a) => { if (!/^Warning: Cannot polyfill/.test(String(a[0]))) log0(...a); };
globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { addEventListener() {}, dispatchEvent() {} };
const { intake, zipMembers } = await import('../../app/ddintake.js');
const { expandDocx } = await import('../../app/docxread.js');
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
const REASONS = flag('--reasons');

/** An error's class name and nothing else (a message could hold document content). */
const errClass = (e) => { const n = e && e.constructor && e.constructor.name; return typeof n === 'string' && /^[A-Za-z]{0,24}Error$/.test(n) ? n : 'Error'; };
/** A count as a coarse bucket, so that no number can single a document out. */
const bucket = (n, cuts) => { for (const [max, label] of cuts) if (n <= max) return label; return cuts.at(-1)[1]; };
const PAGE_BUCKETS = [[1, '1'], [5, '2-5'], [20, '6-20'], [60, '21-60'], [Infinity, '61+']];
const SHEET_BUCKETS = [[1, '1'], [3, '2-3'], [10, '4-10'], [Infinity, '11+']];
const HIDDEN_BUCKETS = [[0, '0'], [1, '1'], [3, '2-3'], [Infinity, '4+']];
const CHAR_BUCKETS = [[0, 'none'], [49, 'under-50'], [199, '50-199'], [Infinity, '200+']];
const READER_TYPES = ['om', 'rentroll', 't12'];

/** A File-like over a Buffer, as the app's readers take it. */
const fileLike = (f) => {
  const buf = fs.readFileSync(f);
  const ab = () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return { name: path.basename(f), size: buf.length, type: '', slice: (a, b) => ({ arrayBuffer: async () => buf.buffer.slice(buf.byteOffset + a, buf.byteOffset + Math.min(b, buf.length)) }), arrayBuffer: async () => ab(), text: async () => buf.toString('utf8') };
};
const getXlsx = async () => ({ ExcelJS, fflate });
const getFflate = async () => fflate;
const readText = async (bytes) => { const layouts = []; const pages = await pdfPages(pdfjs, new Uint8Array(bytes), { layouts, verbosity: 0 }); return { pages, layouts }; };
let ocrBrowser = null; // --ocr: the engine, in a browser; the app's own ocrpdf.js decides what to read
if (flag('--ocr')) { const { openOcrBrowser } = await import('./ocr-browser.mjs'); ocrBrowser = await openOcrBrowser(); }
const readPdf = async (bytes) => (ocrBrowser
  ? readPdfOcr(pdfjs, new Uint8Array(bytes), readText, () => ({ signal: { aborted: false }, say() {}, end() {} }), { open: ocrBrowser.open, supported: () => true })
  : readText(bytes));

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

/** Why a file that was not accepted ended where it did: reason codes (the primary one first, then shape buckets). */
async function reasonsFor({ file, upRes, info, v, pages, grids, intakeErr, gridErr, pdfErr, outcome }) {
  const out = [];
  const k = upRes.kind;
  if (k === 'docx') out.push('docx-later');
  else if (k === 'image') out.push('no-reader-for-type:image');
  else if (k === 'zip') out.push(/^That is a zip file/.test(upRes.refuse || '') ? 'zip-not-workbook' : 'zip-not-opened');
  else if (k === 'xls') out.push('old-xls');
  else if (k === 'doc') out.push('old-doc');
  else if (k === 'encrypted') out.push('encrypted');
  else if (k === 'ole') out.push('ole-unknown');
  else if (k === 'unknown') out.push('binary-unknown');
  else if (upRes.refuse && /^That file is \d/.test(upRes.refuse)) out.push('too-big');
  else if (intakeErr) out.push(`${k === 'pdf' ? 'pdf' : 'sheet'}-read-failed:${errClass(intakeErr)}`);
  else if (k === 'pdf' && !pages) out.push(`pdf-read-failed:${errClass(pdfErr)}`);
  else if ((k === 'xlsx' || k === 'text') && !grids && gridErr) out.push(`sheet-read-failed:${errClass(gridErr)}`);
  else if (v.scanned) out.push(`no-text-layer:${bucket((pages ? pages.pages.join('') : '').replace(/\s/g, '').length, CHAR_BUCKETS)}`);
  else if (outcome === 'identified') out.push(`no-reader-for-type:${v.looks}`);
  else if (v.ask.length) {
    const c = classify(v.text, info.name);
    if (!v.reader && v.ask.length === 2 && v.ask.includes('t12') && v.ask.includes('rentroll')) out.push('both-readers-accept');
    else if (c.type && READER_TYPES.includes(c.type)) out.push(`text-names-reader-type:${c.type}`);
    else if (v.ask.includes('om') && k === 'pdf') out.push('om-wording-also-other-type');
    else out.push(`classifier-broad:${v.ask.length} candidates`);
  } else if (k === 'pdf' && pages) {
    // prose: a long text with few digits (a narrative, not a table) and no title the classifier knows
    const t = pages.pages.join('').replace(/\s/g, '');
    out.push(t.length / Math.max(pages.pages.length, 1) >= 2000 && (t.match(/\d/g) || []).length / Math.max(t.length, 1) < 0.1 ? 'word-narrative' : 'unknown-title');
  } else out.push('unknown-title');
  if (k === 'pdf' && info.pages) out.push(`pages:${bucket(info.pages, PAGE_BUCKETS)}`);
  if (k === 'xlsx') {
    let all = grids; // the shape counts hidden sheets too; the readers' own read above is untouched
    try { all = await readGrids(file, getXlsx, { maxRows: 1, includeHidden: true, getFflate }); } catch { /* the shape of an unreadable workbook is unknown */ }
    if (upRes.macros) out.push('macros-values-only'); // read for its cell values; the macros were not run (sheetread.js)
    if (all) { out.push(`sheets:${bucket(all.length, SHEET_BUCKETS)}`); out.push(`hidden-sheets:${bucket(all.filter((g) => g.hidden).length, HIDDEN_BUCKETS)}`); }
  }
  return out;
}

class Done extends Error {} // a unit decided before any reader runs (a refused part of a zip)
const reasonCount = {}; const reasonByFam = {};
const fam = {}; // family -> counts
const bump = (f, k, n = 1) => { (fam[f] ||= { files: 0, accepted: 0, asked: 0, refused: 0, identified: 0, right: 0, wrong: 0, askedFields: 0, missed: 0, answered: 0 })[k] += n; };
const labels = {};
const ocrStats = { files: 0, pages: 0, unsure: 0, accepted: 0 };
const perFile = [];

// A zip is opened in memory by the app's own code (ddintake.js zipMembers) and each file inside it is one unit, read exactly as a
// dropped file is; the zip itself is not a file in the table. A zip refused whole, or empty, stays one refused unit.
const ZIP_BUCKETS = [[1, '1'], [5, '2-5'], [20, '6-20'], [Infinity, '21+']];
const zipPartWhy = (m) => (/climbs out of the zip/.test(m) ? 'zip-part-unsafe-path' : /inside a zip inside a zip/.test(m) ? 'zip-part-too-deep' : /more than this app opens at once/.test(m) ? 'zip-part-over-cap' : 'zip-part-not-opened');
const units = []; const zipOpened = [];
for (const f of files) {
  const file = fileLike(f);
  let z = null;
  try { const up = await checkUpload(file, { getFflate, bundle: true }); z = up.plainZip ? await zipMembers(file, { plainZip: true }, { getFflate }) : null; } catch { z = null; }
  if (z && !z.refuse) {
    zipOpened.push(z.members.length);
    for (const m of z.members) units.push({ f: null, rel: `${path.relative(folder, f)}#${m.name}`, file: m.file, partRefuse: m.refuse });
  } else units.push({ f, rel: path.relative(folder, f), file, zipRefuse: z ? (/empty zip/.test(z.refuse) ? 'zip-empty' : 'zip-not-opened') : null });
}
// a Word file is its tables (each read as a CSV, as in the app: docxread.js) and/or its text (classified; no reader takes prose)
for (let i = units.length - 1; i >= 0; i--) {
  const u = units[i];
  if (u.zipRefuse || u.partRefuse || !u.file) continue;
  let up = null;
  try { up = await checkUpload(u.file, { getFflate }); } catch { up = null; }
  if (!up || up.kind !== 'docx') continue;
  let seen = null;
  try { seen = await expandDocx([{ file: u.file, info: await intake(u.file, { getFflate, getXlsx, readPdf: async () => ({ pages: [], layouts: [] }) }) }], { getFflate, getXlsx }); } catch { seen = null; }
  if (!seen) continue;
  units.splice(i, 1, ...seen.map((x) => (x.file === u.file ? { ...u, docxText: x.info } : { f: null, rel: `${u.rel}#${x.info.name}`, file: x.file })));
}

let n = 0;
for (const u of units) {
  const f = u.f;
  n += 1;
  const label = `file-${String(n).padStart(2, '0')}`;
  labels[label] = u.rel;
  let family = 'unreadable'; let outcome = 'refused'; let gotAsked = null;
  let why = [];
  try {
    const file = u.file;
    if (u.zipRefuse || u.partRefuse) { family = u.zipRefuse ? 'zip' : 'zip-part'; outcome = 'refused'; if (REASONS) why = [u.zipRefuse || zipPartWhy(u.partRefuse)]; throw new Done(); }
    if (u.docxText) { // Word text outside any table: nothing reads prose as figures, so it is identified or asked, never read
      const v = u.docxText.verdict;
      family = 'docx-text'; outcome = v.type ? 'accepted' : v.looks ? 'identified' : v.ask.length ? 'asked' : 'refused';
      if (REASONS && outcome !== 'accepted') why = [u.docxText.note && /no text in its body|could not|damaged/.test(u.docxText.note) ? 'docx-unreadable' : v.looks ? `no-reader-for-type:${v.looks}` : v.ask.length ? `classifier-broad:${v.ask.length} candidates` : 'docx-text-unknown-title'];
      throw new Done();
    }
    const upRes = await checkUpload(file, { getFflate });
    const sniffedKind = upRes.kind;
    let intakeErr = null; let gridErr = null; let pdfErr = null;
    // the same gate the readers' buttons use (text files have no such gate: they are read as text)
    const readerNote = ['pdf', 'xlsx'].includes(sniffedKind) ? await checkReader(file, sniffedKind, { getFflate }) : null;
    const info = await intake(file, { getFflate, getXlsx, readPdf, problem: (e) => { intakeErr = e; return String((e && e.message) || e); } });
    const v = info.verdict;
    let grids = null; let pages = null;
    if (!info.refuse && !readerNote) {
      if (sniffedKind === 'pdf') { try { pages = await readPdf(new Uint8Array(await file.arrayBuffer())); } catch (e) { pdfErr = e; pages = null; } } else if (['xlsx', 'text'].includes(sniffedKind)) { try { grids = await readGrids(file, getXlsx, { maxRows: 1500, getFflate }); } catch (e) { gridErr = e; grids = null; } }
    }
    if (ocrBrowser && info.sha256 && ocrOf(info.sha256) && ocrOf(info.sha256).read.length) { const o = ocrOf(info.sha256); ocrStats.files += 1; ocrStats.pages += o.read.length; ocrStats.unsure += o.unsure; ocrStats.accepted += v.type ? 1 : 0; }
    if (info.refuse || readerNote) { outcome = 'refused'; family = sniffedKind || 'unknown'; }
    else if (v.type) { outcome = 'accepted'; family = v.reader; }
    else {
      // a PDF no reader typed may still be a lease: the lease reader's own type test says so
      let lease = false;
      if (pages && !v.scanned) { try { const t = docType(pageModel(pages.pages), file.name).type; lease = t === 'lease' || t === 'amendment'; } catch { lease = false; } }
      if (lease) { outcome = 'accepted'; family = 'lease'; } else if (v.scanned) { outcome = 'refused'; family = 'scan'; } else { outcome = 'asked'; family = v.ask.length ? `ask:${[...v.ask].sort().join('+')}` : 'unclassified'; if (!v.ask.length) outcome = 'refused'; }
    }
    if (REASONS && outcome === 'asked' && v.looks) outcome = 'identified'; // typed confidently, but the app has no reader for that type
    if (REASONS && outcome !== 'accepted') why = await reasonsFor({ file, upRes, info, v, pages, grids, intakeErr, gridErr, pdfErr, outcome });
    if (outcome === 'accepted') { try { gotAsked = await extract(file, { ...info, verdict: { ...v, reader: family === 'lease' ? 'lease' : v.reader } }, grids, pages); } catch { gotAsked = { got: {}, asked: new Set(), failed: true }; } }
  } catch (e) { if (!(e instanceof Done)) { family = 'unreadable'; outcome = 'refused'; if (REASONS) why = [`read-exception:${errClass(e)}`]; } }
  bump(family, 'files'); bump(family, outcome);
  for (const w of why) { reasonCount[w] = (reasonCount[w] || 0) + 1; ((reasonByFam[family] ||= {})[w] = (reasonByFam[family][w] || 0) + 1); }
  // answer file: fields right, wrong, asked, missed
  const ans = f ? f.replace(/\.[^.\\/]+$/, '') + '.answers.json' : '';
  let tally = null;
  if (ans && fs.existsSync(ans)) {
    let want = {};
    try { want = JSON.parse(fs.readFileSync(ans, 'utf8')); } catch { want = {}; }
    tally = { right: 0, wrong: 0, asked: 0, missed: 0 };
    for (const [k, w] of Object.entries(want && typeof want === 'object' && !Array.isArray(want) ? want : {})) {
      if (outcome === 'asked' || outcome === 'identified') tally.asked += 1;
      else if (outcome === 'refused' || !gotAsked) tally.missed += 1;
      else if (gotAsked.asked.has(k)) tally.asked += 1;
      else if (!(k in gotAsked.got)) tally.missed += 1;
      else if (same(gotAsked.got[k], w)) tally.right += 1;
      else tally.wrong += 1;
    }
    bump(family, 'answered');
    bump(family, 'right', tally.right); bump(family, 'wrong', tally.wrong); bump(family, 'askedFields', tally.asked); bump(family, 'missed', tally.missed);
  }
  perFile.push(`${label}: ${family}, ${outcome}${why.length ? `; reasons ${why.join(', ')}` : ''}${tally ? `; fields right ${tally.right}, wrong ${tally.wrong}, asked ${tally.asked}, missed ${tally.missed}` : ''}`);
}

console.log(`doc-local: ${units.length} file(s) read by the app's own readers; counts only (no names, figures or text are printed)`);
if (!units.length) console.log('No files: put documents in private/docs (git-ignored) or name a folder.');
const X = REASONS ? ' | identified, no reader' : ''; // --reasons adds one last column; everything before it is unchanged
console.log(`family | files | accepted | asked | refused | answer files | fields right | wrong | asked | missed${X}`);
const tot = { files: 0, accepted: 0, asked: 0, refused: 0, answered: 0, right: 0, wrong: 0, askedFields: 0, missed: 0 };
let totIdentified = 0;
for (const [name, c] of Object.entries(fam).sort()) {
  console.log(`${name} | ${c.files} | ${c.accepted} | ${c.asked} | ${c.refused} | ${c.answered} | ${c.right} | ${c.wrong} | ${c.askedFields} | ${c.missed}${REASONS ? ` | ${c.identified}` : ''}`);
  for (const k of Object.keys(tot)) tot[k] += c[k];
  totIdentified += c.identified;
}
console.log(`TOTAL | ${tot.files} | ${tot.accepted} | ${tot.asked} | ${tot.refused} | ${tot.answered} | ${tot.right} | ${tot.wrong} | ${tot.askedFields} | ${tot.missed}${REASONS ? ` | ${totIdentified}` : ''}`);
if (REASONS) {
  // a zip opened in memory, counted once with its inner file count as a bucket; its files are in the rows above, each as if dropped itself
  for (const k of zipOpened) { const w = `zip-opened:${bucket(k, ZIP_BUCKETS)} files`; reasonCount[w] = (reasonCount[w] || 0) + 1; ((reasonByFam.zip ||= {})[w] = (reasonByFam.zip[w] || 0) + 1); }
  console.log('');
  console.log('reason | files (refused, asked and identified files only; a file can have several: its main reason, then its shape)');
  for (const [r, n] of Object.entries(reasonCount).sort()) console.log(`${r} | ${n}`);
  console.log('');
  console.log('family | reason | files');
  for (const [fm, rs] of Object.entries(reasonByFam).sort()) for (const [r, n] of Object.entries(rs).sort()) console.log(`${fm} | ${r} | ${n}`);
}
if (flag('--verbose-files')) for (const l of perFile) console.log(l);
if (ocrBrowser) {
  console.log(`ocr | files read by OCR | pages read | figures left blank as unsure | files then accepted`);
  console.log(`ocr | ${ocrStats.files} | ${ocrStats.pages} | ${ocrStats.unsure} | ${ocrStats.accepted}`);
  await ocrBrowser.close();
}
if (flag('--labels')) {
  const out = path.join(path.dirname(folder), 'doc-local-labels.json');
  fs.writeFileSync(out, JSON.stringify(labels, null, 2));
  console.log('Wrote the label map next to the folder (it holds file names: keep it in private/).');
}

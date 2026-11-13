/* tests/tools/om-diag.mjs -- the OM diagnostic behind `doc-local.mjs --om`: not a test, not shipped.
 * For one OM's pages (text and layouts, as the app's pdftext.js returns them) it runs EXACTLY the path the deal page's
 * readOmFile (app/dealui.js) runs: readOm, then omReadRecord, then omRollRecord, imported, not copied. Then it counts what
 * came out and why a rent roll was not found or only partly read. COUNTS AND CODES ONLY: no name, text or figure is ever
 * in the result. The only values that are not counts are page numbers (which pages scored as a rent roll).
 *
 * Reason codes (a file can have several):
 *   roll-on-scanned-page          no rent roll was read and one or more pages have no text layer (all of them: the deal page stops
 *                                 at "scanned images", rent roll never tried)
 *   roll-partly-on-scanned-page   a rent roll was read, and a page next to it has no text layer: it may hold more rows
 *   roll-not-detected             text everywhere, and no line looks like a rent roll header
 *   header-not-matched:<missing>  a line looks like a header but the reader refused it: tenant | rent-or-sf | columns; the line then also
 *                                 reports which column kinds it was taken to hold (headerKinds, COLUMN_VOCAB: a fixed list, never the header text)
 *   header-found-no-rows          a header matched and no row under it was read
 *   joined-header                 a header cell has words run together ("LeaseEnd"); the reader splits them (omroll.js norm), flagged so it is known
 *   table-cells-merged            header words sit in one cell (single spaces), or a tenant cell holds a figure
 *   rows-split-across-pages       the roll's rows come from more than one page (read)
 *   rows-split-across-pages:unread-tail   the page after the roll's last page holds table-shaped lines that were not read
 *   rent-column-ambiguous         a rent column that does not say monthly or annual (its period was inferred or asked), or two that disagree
 *   rent-per-sf-only              rows read, and the only rent column is rent per SF (no annual or monthly total)
 *   no-rent-figures / no-sf-figures   rows read and none has a rent / an SF
 *   held-by-check:<kinds>         rows were read, then held back by a failing Data QC check (the deal then shows none) */
import { readOm } from '../../app/om.js';
import { omReadRecord } from '../../app/omstatement.js';
import { omRollRecord } from '../../app/rentroll.js';
import { documentLines, headerAt, assignKinds, kindScores, readNumber } from '../../app/omroll.js';

const CAMEL = /[a-z][A-Z]/;

/** The only words the diagnostic may print about a header's columns: what the reader took each header cell for, never its text. */
export const COLUMN_VOCAB = ['unit', 'suite', 'tenant', 'type', 'beds', 'baths', 'sf', 'rent', 'market-rent', 'rent-psf', 'lease-start', 'lease-end', 'term', 'status', 'deposit', 'charges', 'other'];
/** The column kinds (COLUMN_VOCAB) a header's cells are taken for, sorted; a cell the reader knows no kind for counts as 'other'. */
export function columnKinds(texts) {
  const out = new Set();
  for (const t of texts) {
    const k = Object.keys(kindScores(t));
    if (!k.length) out.add('other');
    for (const x of k) {
      if (x === 'suite') out.add(/\b(unit|apt|apartment)\b/i.test(t) ? 'unit' : 'suite');
      else if (x === 'beds') { if (/\b(beds?|br|bd|bedrooms?)\b/i.test(t)) out.add('beds'); if (/\b(baths?|ba|bathrooms?)\b/i.test(t)) out.add('baths'); if (!/\b(beds?|br|bd|bedrooms?|baths?|ba|bathrooms?)\b/i.test(t)) out.add('beds'); }
      else if (x === 'annual' || x === 'monthly' || x === 'rent') out.add('rent');
      else if (x === 'market') out.add('market-rent');
      else if (x === 'psf' || x === 'mpsf') out.add('rent-psf');
      else if (x === 'start') out.add('lease-start');
      else if (x === 'end') out.add('lease-end');
      else if (x === 'term' || x === 'remaining') out.add('term');
      else if (x === 'recov') out.add('charges');
      else if (COLUMN_VOCAB.includes(x)) out.add(x);
      else out.add('other');
    }
  }
  return [...out].sort();
}
const bucketOf = (n) => (n === 0 ? 'none' : n < 50 ? 'under-50' : n < 200 ? '50-199' : '200+');
const RENT_KINDS = ['annual', 'monthly', 'rent'];

/** Header-shaped lines on a page (three or more cells, no figure), with what the reader can say about each. */
function headerLines(lines) {
  const out = [];
  for (const L of lines) {
    if (L.cells.length < 3 || L.cells.some((c) => readNumber(c.text.trim()) !== null)) continue;
    const kinds = new Set(); let camel = false;
    for (const c of L.cells) {
      const k = Object.keys(kindScores(c.text));
      k.forEach((x) => kinds.add(x));
      if (k.length && CAMEL.test(c.text)) camel = true; // run-together words that the reader now splits (omroll.js norm)
    }
    out.push({ L, kinds, camel, matched: !!assignKinds(L.cells) });
  }
  return out;
}

/** A line of one or two cells that reads like a whole header run together in one cell ("Suite Tenant SF Annual Rent"). */
function mergedHeaderLine(L) {
  if (L.cells.length >= 3) return false;
  const kinds = new Set();
  for (const w of L.text.split(/\s+/)) for (const k of Object.keys(kindScores(w))) kinds.add(k);
  return kinds.has('tenant') && kinds.size >= 3 && (kinds.has('sf') || RENT_KINDS.some((k) => kinds.has(k)));
}

/**
 * @param {string[]} pages page text (layout.js)
 * @param {any[]|null} layouts per-page geometry, or null (the deal page passes null when the counts differ)
 * @param {{ asOf?: string|null, file?: string }} [o]
 */
export function omDiagnose(pages, layouts, { asOf = null, file = 'x.pdf' } = {}) {
  const lay = layouts && layouts.length === pages.length ? layouts : null; // as readOmFile does
  const om = readOm(pages, { layouts: lay, asOf });
  const reasons = [];
  const perPage = { none: 0, 'under-50': 0, '50-199': 0, '200+': 0 };
  for (const p of pages) perPage[bucketOf(String(p || '').replace(/\s+/g, '').length)] += 1;
  const out = { pages: pages.length, charsPerPage: perPage, noTextPages: om.scanned.length, headerPages: [], rollPages: [],
    rows: 0, rowsRent: 0, rowsSf: 0, rowsEnd: 0, rowsVacant: 0, totalsDropped: 0, rowsOnDeal: 0, rowsHeld: 0, failChecks: 0, headerKinds: [],
    ocrNeeded: om.scanned.length > 0, ocrOffered: false, reasons };
  if (om.chars < 200) { // the deal page stops here: "scanned images with no text", no rent roll tried
    const { qc } = omRollRecord({ ...om, rentRoll: null, scanned: pages.map((_, i) => i + 1) }, { asOf, file });
    out.ocrOffered = !!qc && qc.checks.some((c) => c.kind === 'scanned');
    reasons.push('roll-on-scanned-page');
    return out;
  }
  // the deal page's path from here: statements, then the rent roll record
  const figures = {}; const sources = {};
  for (const [k, f] of Object.entries(om.fields)) { const key = k === 'lot' ? 'lot_sf' : k; figures[key] = f.value; sources[key] = { page: f.page, line: f.line, confidence: f.confidence }; }
  const stmt = omReadRecord(om, { figures, sources, file });
  const { qc, rows: kept } = omRollRecord(om, { figures: stmt.figures, sources: stmt.sources, asOf, file });
  out.ocrOffered = !!qc && qc.checks.some((c) => c.kind === 'scanned');
  out.rowsOnDeal = kept.length;
  out.rowsHeld = qc && qc.held ? qc.held.length : 0;
  out.failChecks = qc ? qc.checks.filter((c) => c.level === 'fail' && !c.resolved).length : 0;

  // which pages the reader scores as a rent roll: a header it accepts
  const P = documentLines(pages, lay);
  P.forEach((lines, i) => { for (let k = 0; k < lines.length; k++) if (headerAt(lines, k)) { out.headerPages.push(i + 1); break; } });
  const cand = P.map((lines) => headerLines(lines));
  const roll = om.rentRoll;

  if (roll) {
    const rows = roll.rows;
    out.rollPages = roll.pages;
    out.rows = rows.length;
    out.rowsRent = rows.filter((r) => Number.isFinite(r.annual) || Number.isFinite(r.monthly)).length;
    out.rowsSf = rows.filter((r) => Number.isFinite(r.sf)).length;
    out.rowsEnd = rows.filter((r) => r.end).length;
    out.rowsVacant = rows.filter((r) => r.vacant).length;
    out.totalsDropped = roll.totals.length;
    if (qc && qc.held) {
      const kinds = [...new Set(qc.checks.filter((c) => c.level === 'fail' && !c.resolved).map((c) => String(c.kind).replace(/[^a-z-]/gi, '')))].sort();
      reasons.push(`held-by-check:${kinds.join('+') || 'other'}`);
    }
    if (om.scanned.some((p) => roll.pages.some((q) => Math.abs(q - p) === 1))) reasons.push('roll-partly-on-scanned-page');
    if (roll.pages.length > 1) reasons.push('rows-split-across-pages');
    const last = Math.max(...roll.pages);
    const next = P[last]; // the page after the roll's last (index last = page last+1)
    if (next && !roll.pages.includes(last + 1) && next.filter((L) => L.cells.length >= 3 && L.cells.some((c) => readNumber(c.text.trim()) !== null)).length >= 2 && !cand[last].some((c) => c.matched)) reasons.push('rows-split-across-pages:unread-tail');
    const kinds = roll.columns.map((c) => c.kind);
    const hasTotal = RENT_KINDS.some((k) => kinds.includes(k));
    if (rows.length && !out.rowsRent) reasons.push(!hasTotal && kinds.includes('psf') ? 'rent-per-sf-only' : 'no-rent-figures');
    else if (rows.length && !hasTotal && kinds.includes('psf')) reasons.push('rent-per-sf-only');
    if (rows.length && !out.rowsSf && !kinds.includes('sf')) reasons.push('no-sf-figures');
    if (roll.columns.some((c) => RENT_KINDS.includes(c.kind) && (c.basis === 'ask' || c.basis === 'inferred')) || roll.issues.some((i) => (i.kind === 'unit' || i.kind === 'compete') && i.level === 'fail')) reasons.push('rent-column-ambiguous');
    if (rows.some((r) => r.tenant && /\$\s?\d|\d{1,3},\d{3}/.test(r.tenant))) reasons.push('table-cells-merged');
  } else {
    const all = cand.flat();
    const best = all.filter((c) => !c.matched).sort((a, b) => b.kinds.size - a.kinds.size)[0];
    if (out.headerPages.length) reasons.push('header-found-no-rows');
    else if (P.some((lines) => lines.some(mergedHeaderLine))) reasons.push('table-cells-merged');
    else if (best && best.kinds.size >= 2) {
      const hasMoney = ['sf', ...RENT_KINDS, 'psf', 'mpsf'].some((k) => best.kinds.has(k));
      reasons.push(`header-not-matched:${!best.kinds.has('tenant') ? 'tenant' : !hasMoney ? 'rent-or-sf' : 'columns'}`);
      out.headerKinds = columnKinds(best.L.cells.map((c) => c.text));   // vocabulary only, never the header's text
    } else if (om.scanned.length) reasons.push('roll-on-scanned-page');
    else reasons.push('roll-not-detected');
  }
  if (cand.some((cs) => cs.some((c) => c.camel))) reasons.push('joined-header');
  out.reasons = [...new Set(reasons)];
  return out;
}

/** One file's result as a counts-only line (no text from the document). */
export function omLine(label, r) {
  const c = r.charsPerPage;
  return `${label} | pages ${r.pages} | chars/page none ${c.none}, under-50 ${c['under-50']}, 50-199 ${c['50-199']}, 200+ ${c['200+']} | no-text pages ${r.noTextPages} | header pages ${r.headerPages.join(',') || '-'} | roll pages ${r.rollPages.join(',') || '-'} | rows ${r.rows} (rent ${r.rowsRent}, sf ${r.rowsSf}, lease end ${r.rowsEnd}, vacant ${r.rowsVacant}) | total rows dropped ${r.totalsDropped} | on deal ${r.rowsOnDeal}, held ${r.rowsHeld}, failing checks ${r.failChecks} | ocr needed ${r.ocrNeeded ? 'yes' : 'no'}, offered ${r.ocrOffered ? 'yes' : 'no'} | reasons ${r.reasons.join(', ') || 'none'}${r.headerKinds.length ? ` | header columns found ${r.headerKinds.join(',')}` : ''}`;
}

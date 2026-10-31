/* abstractexport.js -- a lease abstract as a workbook (one abstract, or every abstract on the deal plus a Summary), a CSV,
 * a JSON copy and a print view. The workbook follows the firm's layout: a header grid, a rent block per term, the options,
 * the numbered notes, the notice addresses and a column of analyst flags.
 *
 * Money is whole cents (abstracts.js rentBlock). The only formulas are the fixed templates below, each written with the value
 * our own arithmetic gives (ROUND(E*D,2), ROUND(E*12/SF,4), SUM, and the weighted average), so a spreadsheet that
 * recalculates agrees with the cached figure. Every typed text is written as a plain string, never as a formula, a link or rich
 * text, with control characters removed. Annual rate per SF = monthly rent x 12 / rentable SF, and the files say so. */

import { PRODUCT } from './brand.js';
import { ddOf } from './dd.js';
import { fmtDate } from './dateinput.js';
import { cell } from './exporters.js';
import { int, money2 } from './kit.js';
import { addDays, addMonths, dayOf } from './lease.js';
import { cleanPackage } from './package.js';
import { sheet } from './workbook.js';
import { markConfidential } from './workbook.js';
import { CLAUSES, FIELDS, FIELD_BY_KEY, GROUPS, LIMITS } from './abstractfields.js';
import { checkAbstract, flagLines, normAbstracts, progress, rentBlock, stepDates, valueOf, itemOf } from './abstracts.js';

export const RATE_NOTE = 'Annual rate per SF = monthly rent x 12 / rentable SF.';
export const NOT_FOUND = 'Not found in lease';
export const NOT_YET = 'Not yet abstracted';
export const NEEDS = 'Needs a choice';
export const NO_MAP = 'none: the lease abstract as typed; no deal calculation';

const MONEY2 = '"$"#,##0.00';
const DATE = 'm/d/yyyy';
const FONT = 'Arial';
const NAVY = 'FF1F3864';
const SOFT = 'FFEEF2F8';
const GREY = 'FF595959';

/** Text for a cell: control characters (except a line break) removed, cut to the cell limit. */
export const scrub = (s) => String(s ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').slice(0, LIMITS.cell);
const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const unitWords = { month: 'per month', year: 'per year', psf_year: 'per SF per year', psf_month: 'per SF per month', total: '' };

/* ------------------------------------------------------------ what a value says */

/**
 * A field as words (or a number for the header grid): { text, num, fmt, kind } where `kind` is 'value', 'none', 'missing' or 'unread'.
 * A missing value is words, never 0 and never blank; a found 0 is "None ($0.00)".
 */
export function shown(ab, key) {
  const f = FIELD_BY_KEY[key];
  const r = ab.fields[key];
  if (!r || r.status === 'unread') return { text: NOT_YET, kind: 'unread' };
  if (r.status === 'not-found') return { text: NOT_FOUND, kind: 'missing' };
  if (r.status === 'ambiguous') return { text: NEEDS, kind: 'unread' };
  const v = r.value;
  switch (f.kind) {
    case 'money': return v === 0 ? { text: 'None ($0.00)', kind: 'none' } : { text: `${money2(v)}${unitWords[r.unit] ? ` ${unitWords[r.unit]}` : ''}`, num: v, fmt: MONEY2, kind: 'value' };
    case 'psf': return { text: `${money2(v)} ${unitWords[r.unit] || ''}${r.basis ? ` (${r.basis} SF)` : ''}`.trim(), num: v, fmt: MONEY2, kind: 'value' };
    case 'pct': return { text: `${v}%`, num: v / 100, fmt: '0.00%', kind: v === 0 ? 'none' : 'value' };
    case 'sf': return { text: `${int(v)} SF${r.basis ? ` (${r.basis})` : ''}`, num: v, fmt: '#,##0', kind: 'value' };
    case 'int': return { text: String(v), num: v, fmt: '0', kind: 'value' };
    case 'date': return { text: fmtDate(v), date: v, kind: 'value' };
    case 'dateRel': return { text: v ? `${fmtDate(v)}${r.rel ? ` (${r.rel})` : ''}` : `${r.rel} (date not yet known)`, date: v || undefined, kind: 'value' };
    case 'bool': return { text: v ? 'Yes' : 'No', kind: 'value' };
    case 'address': return { text: v.join('\n'), kind: 'value' };
    default: return { text: String(v), kind: v === 'None' ? 'none' : 'value' };
  }
}

const sourceOf = (rec) => (rec && rec.src && rec.src.length ? rec.src.map((s) => [s.page ? `p.${s.page}` : '', s.quote ? `"${s.quote}"` : ''].filter(Boolean).join(' ')).filter(Boolean).join('; ') : '');
const termDocName = (deal, t) => { const d = t && t.doc ? ddOf(deal).docs.find((x) => x.id === t.doc) : null; return d ? d.name : ''; };

/** The notice window of an option in words, from the numbers (never from invented ones). */
export function noticeText(o) {
  const unit = o.noticeUnit === 'days' ? 'days' : 'months';
  const rel = { expiration: 'expiration', commencement: 'commencement', other: 'the date the lease states' }[o.relTo] || 'the date the lease states';
  if (o.noticeMin !== null && o.noticeMax !== null) return `not less than ${o.noticeMin} nor more than ${o.noticeMax} ${unit} before ${rel}`;
  if (o.noticeMin !== null) return `not less than ${o.noticeMin} ${unit} before ${rel}`;
  if (o.noticeMax !== null) return `not more than ${o.noticeMax} ${unit} before ${rel}`;
  return 'Notice window not stated';
}
export function optionText(o) {
  const kind = { renewal: 'Renewal', expansion: 'Expansion', contraction: 'Contraction', termination: 'Termination', rofr: 'Right of first refusal', rofo: 'Right of first offer', purchase: 'Purchase' }[o.kind] || 'Option';
  const size = [o.count !== null ? `${o.count}` : '', o.termMonths !== null ? `${o.termMonths} months` : ''].filter(Boolean).join(' x ');
  const reset = o.reset ? { fmv: 'Rent resets to fair market value', fixed: 'Rent resets to a fixed amount', cpi: 'Rent resets by the price index', other: 'Rent resets as the lease states' }[o.reset] + (o.resetPct !== null ? ` (${o.resetPct}%)` : '') + (o.resetText ? `: ${o.resetText}` : '') : 'Rent reset not stated';
  return { kind, size: size || 'Size not stated', notice: noticeText(o), reset, fee: o.fee !== null ? `Fee ${money2(o.fee)}` : '', conditions: o.conditions };
}

/** The numbered notes: standard clauses in order, then the optional ones present, then the custom ones. [{ n, label, text, missing }] */
export function notes(ab) {
  const rows = [];
  const add = (label, rec) => {
    const text = !rec || rec.status === 'unread' ? NOT_YET : rec.status === 'not-found' ? NOT_FOUND : rec.status === 'ambiguous' ? NEEDS : rec.value ?? rec.text ?? '';
    rows.push({ n: rows.length + 1, label, text, missing: !rec || rec.status !== 'found' });
  };
  for (const c of CLAUSES) if (!c.optional || ab.fields[c.key]) add(c.label, ab.fields[c.key]);
  for (const c of ab.clauses) add(c.label || 'Note', c);
  return rows;
}

/* ------------------------------------------------------------ dates that matter */

/** The earliest resolved date after `today`: a step start, the expiration, or an option's notice window. { date, what } or null. */
export function nextCritical(ab, today) {
  const t = dayOf(today);
  const found = [];
  const add = (iso, what) => { if (iso && dayOf(iso) !== null && t !== null && dayOf(iso) > t) found.push({ date: iso, what }); };
  for (const s of ab.steps) add(stepDates(s, ab).from, `${s.label || 'Rent step'} starts`);
  const exp = valueOf(ab, 'expiration');
  add(exp, 'Expiration');
  if (exp && dayOf(exp) !== null) for (const o of ab.options) {
    if (o.relTo !== 'expiration') continue;
    for (const [n, what] of [[o.noticeMax, 'notice window opens'], [o.noticeMin, 'notice deadline']]) {
      if (n !== null) add(o.noticeUnit === 'days' ? addDays(exp, -n) : addMonths(exp, -n), `${optionText(o).kind} ${what}`);
    }
  }
  found.sort((a, b) => dayOf(a.date) - dayOf(b.date));
  return found[0] || null;
}
/** The monthly rent of the step in force on the abstract's as-of date (the last term's step wins), or null. */
export function currentRent(ab) {
  if (!ab.asOf) return null;
  const t = dayOf(ab.asOf);
  let hit = null;
  for (const term of ab.terms) for (const row of rentBlock(ab, term.id).rows) if (row.from && row.to && row.monthly !== null && dayOf(row.from) <= t && t <= dayOf(row.to)) hit = row.monthly;
  return hit;
}

/* ------------------------------------------------------------ the workbook */

const sheetName = (title, taken) => {
  const base = (String(title || '').replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim() || 'Abstract').slice(0, 31).trim() || 'Abstract';
  let name = base; let n = 1;
  while (taken.has(name.toLowerCase())) { n += 1; const suffix = ` (${n})`; name = `${base.slice(0, 31 - suffix.length).trim()}${suffix}`; }
  taken.add(name.toLowerCase());
  return name;
};

function put(ws, addr, v, { fmt, bold, wrap, align, size, color, fill, italic } = /** @type {any} */ ({})) {
  const c = ws.getCell(addr);
  if (v instanceof Date || typeof v === 'number' || (v && typeof v === 'object')) c.value = v; // a date, a number, or one of our own formula objects
  else c.value = scrub(v);
  if (fmt) c.numFmt = fmt;
  c.font = { name: FONT, size: size || 10, bold: !!bold, italic: !!italic, color: { argb: color || 'FF000000' } };
  c.alignment = { vertical: 'top', wrapText: !!wrap, horizontal: align || undefined };
  if (fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  return c;
}
const formula = (f, result) => ({ formula: f, result });
const merge = (ws, r, c1, c2) => { if (c2 > c1) ws.mergeCells(r, c1, r, c2); };
const lines = (text, width) => String(text).split('\n').reduce((a, l) => a + Math.max(1, Math.ceil(l.length / width)), 0);
const band = (ws, r, text) => { for (let c = 1; c <= 8; c++) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } }; put(ws, `A${r}`, text, { bold: true, color: NAVY, fill: SOFT }); };

/** Fill one abstract's sheet. */
function fillSheet(ws, deal, ab) {
  const f = deal.figures || {};
  const superseding = ab.terms.some((t) => t.supersedes);
  put(ws, 'A1', `${ab.title || 'Lease abstract'}${superseding ? ' (as amended)' : ''}`, { bold: true, size: 15, color: NAVY });
  merge(ws, 1, 1, 8);
  put(ws, 'A2', `As of ${ab.asOf ? fmtDate(ab.asOf) : 'a date not stated'}`, { color: GREY, size: 9 });
  merge(ws, 2, 1, 8);
  put(ws, 'A3', [f.address, [f.city, f.state].filter(Boolean).join(', ')].filter(Boolean).join(', ') || (deal.name || ''), { color: GREY, size: 9 });
  merge(ws, 3, 1, 8);

  // header grid: two label/value pairs, each label followed by an arrow
  const sf = ab.fields.sf;
  const sfLabel = sf && sf.basis ? `SF (${sf.basis}) →` : 'SF →';
  /** @type {string[][]} */
  const left = [['Tenant →', 'tenant'], ['Property ID →', 'propertyId'], ['Address →', 'premisesAddress'], ['Pro-rata share * →', 'proRata'], [sfLabel, 'sf']];
  /** @type {string[][]} */
  const right = [['Deposit →', 'deposit'], ['Commencement →', 'commencement'], ['Rent commencement →', 'rentCommencement'], ['Expiration →', 'expiration'], ['Term →', 'termText']];
  const SF_ROW = 5 + left.findIndex(([, k]) => k === 'sf');
  const sfAddr = `$B$${SF_ROW}`;
  const grid = (row, /** @type {string[]} */ [label, key], col0) => {
    const s = shown(ab, key);
    const L = col0 === 1 ? 'A' : 'E'; const V = col0 === 1 ? 'B' : 'G';
    put(ws, `${L}${row}`, label, { bold: true, color: NAVY });
    if (col0 === 5) merge(ws, row, 5, 6);
    const style = { wrap: true, align: 'left' };
    if (s.date) put(ws, `${V}${row}`, toDate(s.date), { ...style, fmt: DATE });
    else if (s.num !== undefined && s.kind !== 'none') put(ws, `${V}${row}`, s.num, { ...style, fmt: s.fmt });
    else put(ws, `${V}${row}`, s.text, { ...style, italic: s.kind === 'unread' || s.kind === 'missing' });
    if (col0 === 1) merge(ws, row, 2, 4); else merge(ws, row, 7, 8);
  };
  left.forEach((x, i) => grid(5 + i, x, 1));
  right.forEach((x, i) => grid(5 + i, x, 5));
  const covers = shown(ab, 'proRataCovers');
  put(ws, 'A10', `* Pro-rata share covers: ${covers.text}`, { italic: true, color: GREY, size: 9 });
  merge(ws, 10, 1, 8);

  // the rent block, per term
  let r = 12;
  put(ws, `A${r}`, RATE_NOTE, { italic: true, color: GREY, size: 9 });
  merge(ws, r, 1, 8);
  r += 1;
  if (!ab.terms.length) { put(ws, `A${r}`, `Rent: ${NOT_YET}`, { italic: true }); merge(ws, r, 1, 8); r += 2; }
  for (const term of ab.terms) {
    const block = rentBlock(ab, term.id);
    const doc = termDocName(deal, term);
    band(ws, r, [term.label || 'Term', term.ref ? `§${term.ref}` : '', term.supersedes ? `per ${doc || 'the amendment'}${term.effective ? `, effective ${fmtDate(term.effective)}` : ''}, supersedes the original` : ''].filter(Boolean).join('   '));
    merge(ws, r, 1, 8);
    r += 1;
    if (term.unquantified) { put(ws, `A${r}`, `Not quantified in lease${term.ref ? ` (§${term.ref})` : ''}`, { italic: true }); merge(ws, r, 1, 8); r += 2; continue; }
    ['Period', 'From', 'To', 'Months', 'Monthly rent', 'Total rent', 'Annual rent $/SF', 'Weighted average'].forEach((h, i) => put(ws, ws.getCell(r, i + 1).address, h, { bold: true, color: NAVY, wrap: true, align: i ? 'right' : 'left' }));
    r += 1;
    if (!block.rows.length) { put(ws, `A${r}`, NOT_YET, { italic: true }); merge(ws, r, 1, 8); r += 2; continue; }
    const first = r;
    for (const row of block.rows) {
      const s = row.step;
      const relPeriod = s.mFrom !== null && s.mTo !== null ? `Months ${s.mFrom}–${s.mTo}` : '';
      put(ws, `A${r}`, s.label || relPeriod || 'Rent step');
      const date = (v, col) => (v ? put(ws, `${col}${r}`, toDate(v), { fmt: DATE, align: 'right' }) : put(ws, `${col}${r}`, 'depends on rent commencement', { italic: true, wrap: true, align: 'right', size: 8 }));
      date(row.from, 'B'); date(row.to, 'C');
      if (row.months !== null) put(ws, `D${r}`, row.months, { fmt: '0.####', align: 'right' }); else put(ws, `D${r}`, NOT_YET, { italic: true, align: 'right', size: 8 });
      if (row.monthly !== null) put(ws, `E${r}`, row.monthly, { fmt: MONEY2 }); else put(ws, `E${r}`, row.reason || NOT_YET, { italic: true, wrap: true, align: 'right', size: 8 });
      if (row.total !== null) put(ws, `F${r}`, formula(`ROUND(E${r}*D${r},2)`, row.total), { fmt: MONEY2 }); else put(ws, `F${r}`, 'no total', { italic: true, align: 'right', size: 8 });
      if (row.annualPsf !== null) put(ws, `G${r}`, formula(`ROUND(E${r}*12/${sfAddr},4)`, row.annualPsf), { fmt: MONEY2 });
      else put(ws, `G${r}`, row.psfText || (row.monthly === null ? '' : 'needs rentable SF'), { italic: true, align: 'right', size: 8 });
      if (s.status === 'not-found') put(ws, `A${r}`, `${s.label || 'Rent step'} (${NOT_FOUND})`, { italic: true });
      r += 1;
    }
    const last = r - 1;
    put(ws, `A${r}`, 'Total', { bold: true });
    if (block.total) {
      put(ws, `D${r}`, formula(`SUM(D${first}:D${last})`, block.total.months), { bold: true, fmt: '0.####', align: 'right' });
      put(ws, `F${r}`, formula(`SUM(F${first}:F${last})`, block.total.total), { bold: true, fmt: MONEY2 });
      if (block.total.weighted !== null) put(ws, `H${r}`, formula(`ROUND(F${r}/(D${r}/12)/${sfAddr},4)`, block.total.weighted), { bold: true, fmt: MONEY2 });
    } else { put(ws, `B${r}`, 'No total: some steps are not resolved yet', { italic: true }); merge(ws, r, 2, 8); }
    r += 2;
  }

  // options
  band(ws, r, 'Options'); merge(ws, r, 1, 8); r += 1;
  if (!ab.options.length) { put(ws, `A${r}`, NOT_YET, { italic: true }); merge(ws, r, 1, 8); r += 1; }
  for (const o of ab.options) {
    const t = optionText(o);
    put(ws, `A${r}`, t.kind, { bold: true, wrap: true });
    put(ws, `B${r}`, t.size, { wrap: true }); merge(ws, r, 2, 3);
    put(ws, `D${r}`, t.notice, { wrap: true }); merge(ws, r, 4, 6);
    put(ws, `G${r}`, [t.reset, t.fee, t.conditions].filter(Boolean).join('. '), { wrap: true }); merge(ws, r, 7, 8);
    ws.getRow(r).height = Math.max(15, 13 * Math.max(lines(t.notice, 40), lines(t.reset, 34)));
    r += 1;
  }
  r += 1;

  // numbered notes, one merged row each
  band(ws, r, 'Notes'); merge(ws, r, 1, 8); r += 1;
  for (const n of notes(ab)) {
    put(ws, `A${r}`, `${n.n}) ${n.label}: ${n.text}`, { wrap: true, italic: n.missing });
    merge(ws, r, 1, 8);
    ws.getRow(r).height = Math.max(15, 13 * lines(`${n.n}) ${n.label}: ${n.text}`, 120));
    r += 1;
  }
  r += 1;

  // notice addresses
  band(ws, r, 'Notice addresses'); merge(ws, r, 1, 8); r += 1;
  for (const [label, key] of [['Tenant notices', 'noticeTenant'], ['Landlord notices', 'noticeLandlord'], ['Rent is paid to', 'paymentAddress']]) {
    put(ws, `A${r}`, label, { bold: true });
    merge(ws, r, 1, 8);
    r += 1;
    const s = shown(ab, key);
    for (const line of s.text.split('\n')) { put(ws, `A${r}`, line, { italic: s.kind !== 'value' }); merge(ws, r, 1, 8); r += 1; }
  }

  // analyst flags, column J from row 5
  put(ws, 'J4', 'Analyst flags', { bold: true, color: NAVY });
  flagLines(ab).forEach((t, i) => put(ws, `J${5 + i}`, t, { wrap: true, size: 9 }));
  ws.views = [{ showGridLines: false }];
}

/** The Summary sheet of a portfolio workbook: one row per abstract. */
function fillSummary(ws, abstracts, today) {
  put(ws, 'A1', 'Lease abstracts', { bold: true, size: 15, color: NAVY });
  ws.mergeCells(1, 1, 1, 8);
  ['Abstract', 'Tenant', 'Suite', 'Square feet', 'Expiration', 'Current monthly rent', 'Next critical date', 'Open flags'].forEach((h, i) => put(ws, ws.getCell(3, i + 1).address, h, { bold: true, color: NAVY, wrap: true }));
  abstracts.forEach((ab, i) => {
    const r = 4 + i;
    put(ws, `A${r}`, ab.title || 'Untitled abstract', { wrap: true });
    put(ws, `B${r}`, shown(ab, 'tenant').text, { wrap: true });
    put(ws, `C${r}`, shown(ab, 'suite').text, { wrap: true });
    const sf = shown(ab, 'sf');
    if (sf.num !== undefined) put(ws, `D${r}`, sf.text, { align: 'right' }); else put(ws, `D${r}`, sf.text, { italic: true });
    const ex = shown(ab, 'expiration');
    if (ex.date) put(ws, `E${r}`, toDate(ex.date), { fmt: DATE, align: 'right' }); else put(ws, `E${r}`, ex.text, { italic: true, wrap: true });
    const rent = currentRent(ab);
    if (rent !== null) put(ws, `F${r}`, rent, { fmt: MONEY2 }); else put(ws, `F${r}`, 'no step in force', { italic: true });
    const nc = nextCritical(ab, today);
    if (nc) put(ws, `G${r}`, `${fmtDate(nc.date)}: ${nc.what}`, { wrap: true }); else put(ws, `G${r}`, 'none resolved', { italic: true });
    put(ws, `H${r}`, progress(ab).flags, { align: 'right' });
  });
}

/**
 * The workbook, as bytes. `abstracts` is the list to write (one for the single export). `portfolio` adds a first Summary sheet.
 * Pass `fflate` to tidy the package the way the deal workbook is. `today` is for the Summary's next date (default: now).
 * @param {any} ExcelJS @param {{ deal: any, abstracts: any[], portfolio?: boolean, fflate?: any, today?: string }} a
 */
export async function buildAbstractWorkbook(ExcelJS, { deal, abstracts, portfolio = false, fflate = null, today = new Date().toISOString().slice(0, 10) }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = PRODUCT;
  wb.lastModifiedBy = PRODUCT;
  wb.created = new Date();
  wb.modified = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const taken = new Set();
  const list = normAbstracts({ items: abstracts }).items;
  if (portfolio) fillSummary(sheet(wb, sheetName('Summary', taken), [30, 24, 12, 16, 16, 18, 34, 10]), list, today);
  for (const ab of list) fillSheet(sheet(wb, sheetName(ab.title, taken), [18, 11, 15, 12, 14, 15, 13, 22, 3, 56, 3, 3]), deal, ab);
  if (deal.confidential) markConfidential(wb);
  wb.views = [{ activeTab: 0, firstSheet: 0, visibility: 'visible' }];
  const buf = await wb.xlsx.writeBuffer();
  return fflate ? cleanPackage(fflate, buf, { charts: null }) : buf;
}

/* ------------------------------------------------------------ CSV and JSON */

/** Every value as a row: abstract, section, item, value, unit, basis, status, checked, page. Quotes are not in the CSV. Every cell goes through exporters.js cell(). */
export function abstractCsv(deal, abstracts) {
  const rows = [['Abstract', 'Section', 'Item', 'Value', 'Unit', 'Basis', 'Status', 'Checked', 'Page']];
  const page = (rec) => (rec && rec.src ? rec.src.map((s) => s.page).filter(Boolean).join('; ') : '');
  for (const ab of normAbstracts({ items: abstracts }).items) {
    const name = ab.title || 'Untitled abstract';
    const push = (section, item, value, unit, basis, rec) => rows.push([name, section, item, value, unit || '', basis || '', rec ? rec.status : 'unread', rec && rec.checked ? 'yes' : 'no', page(rec)]);
    for (const f of FIELDS) {
      const rec = ab.fields[f.key];
      if (f.optional && !rec) continue;
      const g = GROUPS.find((x) => x.id === f.group).label;
      const value = rec && rec.status === 'found' ? (Array.isArray(rec.value) ? rec.value.join('; ') : rec.value === null ? (rec.rel || '') : rec.value) : '';
      push(g, f.label, value, rec ? rec.unit : '', rec ? rec.basis : '', rec);
    }
    for (const t of ab.terms) {
      push('Terms', t.label || 'Term', t.ref ? `§${t.ref}` : '', '', '', t);
      for (const s of ab.steps.filter((x) => x.term === t.id)) {
        push('Rent', `${t.label || 'Term'}: ${s.label || 'Rent step'}`, s.primary && s.amounts[s.primary] !== null ? s.amounts[s.primary] : '', s.primary || '', s.basis, s);
      }
    }
    for (const o of ab.options) { const t = optionText(o); push('Options', t.kind, `${t.size}; ${t.notice}; ${t.reset}`, '', '', o); }
    for (const c of ab.clauses) push('Custom notes', c.label || 'Note', c.text, '', '', c);
    for (const fl of ab.flags) push('Flags', 'Analyst flag', fl.text, '', '', null);
  }
  return `${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

/** A JSON copy, quotes included. Export only: L1 has no import. */
export function abstractJson(deal, abstracts, version) {
  return `${JSON.stringify({
    format: 'zlatura-abstracts', v: 1, app: version, exportedAt: new Date().toISOString(), confidential: !!deal.confidential,
    deal: deal.name || (deal.figures && deal.figures.address) || '', abstracts: normAbstracts({ items: abstracts }).items,
  }, null, 1)}\n`;
}

/* ------------------------------------------------------------ print */

/** The abstract in the print sheet: the same order as the workbook, a source column ("§ ref, p.n"), and the Draft footer until every item is checked. */
export function renderAbstractPrint(box, { deal, ab, doc = document }) {
  const h = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined && text !== null) n.textContent = text; return n; };
  box.textContent = '';
  box.className = 'print-sheet ab-print';
  const f = deal.figures || {};
  const head = h('div', 'ps-head');
  const left = h('div');
  left.append(h('div', 'ps-eyebrow', `${deal.confidential ? 'CONFIDENTIAL · ' : ''}Lease abstract`), h('div', 'ps-title', `${ab.title || 'Lease abstract'}${ab.terms.some((t) => t.supersedes) ? ' (as amended)' : ''}`),
    h('div', 'ps-sub', [f.address, [f.city, f.state].filter(Boolean).join(', ')].filter(Boolean).join(', ') || deal.name || ''));
  head.append(left, h('div', 'ps-meta', `As of ${ab.asOf ? fmtDate(ab.asOf) : 'a date not stated'}`));
  box.appendChild(head);
  const table = (cols, rows, cls = '') => {
    const t = h('table', `ps-table ab-print-table ${cls}`.trim());
    const hr = h('tr');
    for (const c of cols) hr.appendChild(h('th', null, c));
    t.appendChild(hr);
    for (const r of rows) { const tr = h('tr'); r.forEach((v, i) => tr.appendChild(h('td', i && typeof v === 'string' && /^[$\d(]/.test(v) ? 'r' : null, v === null ? '' : String(v)))); t.appendChild(tr); }
    return t;
  };
  const show = (k) => shown(ab, k).text;
  const srcOf = (k) => { const it = itemOf(ab, k); return it && it.rec ? [...new Set((it.rec.src || []).filter((s) => s.page).map((s) => `p.${s.page}`))].join(', ') : ''; };
  box.appendChild(h('div', 'ps-h2', 'Key terms'));
  const keys = ['tenant', 'landlord', 'tradeName', 'propertyId', 'premisesAddress', 'suite', 'sf', 'proRata', 'proRataCovers', 'leaseDate', 'commencement', 'rentCommencement', 'expiration', 'termText', 'deposit'];
  box.appendChild(table(['Item', 'Value', 'Source', 'Checked'], keys.map((k) => [FIELD_BY_KEY[k].label, show(k), srcOf(k), ab.fields[k] && ab.fields[k].checked ? 'yes' : 'no'])));
  box.appendChild(h('p', 'ps-foot', RATE_NOTE));
  for (const term of ab.terms) {
    const b = rentBlock(ab, term.id);
    box.appendChild(h('div', 'ps-h2', [term.label || 'Term', term.ref ? `§${term.ref}` : '', term.supersedes ? `per ${termDocName(deal, term) || 'the amendment'}${term.effective ? `, effective ${fmtDate(term.effective)}` : ''}, supersedes the original` : ''].filter(Boolean).join('  ')));
    if (term.unquantified) { box.appendChild(h('p', null, `Not quantified in lease${term.ref ? ` (§${term.ref})` : ''}`)); continue; }
    const rows = b.rows.map((r) => [r.step.label || 'Rent step', r.from ? fmtDate(r.from) : 'depends on rent commencement', r.to ? fmtDate(r.to) : 'depends on rent commencement', r.months === null ? NOT_YET : String(r.months),
      r.monthly === null ? (r.reason || NOT_YET) : money2(r.monthly), r.total === null ? 'no total' : money2(r.total), r.annualPsf === null ? (r.psfText || '') : money2(r.annualPsf),
      [term.ref ? `§${term.ref}` : '', ...r.step.src.filter((s) => s.page).map((s) => `p.${s.page}`)].filter(Boolean).join(', ')]);
    if (b.total) rows.push(['Total', '', '', String(b.total.months), '', money2(b.total.total), b.total.weighted === null ? '' : money2(b.total.weighted), '']);
    box.appendChild(table(['Period', 'From', 'To', 'Months', 'Monthly rent', 'Total rent', 'Annual rent $/SF', 'Source'], rows));
  }
  box.appendChild(h('div', 'ps-h2', 'Options'));
  box.appendChild(ab.options.length ? table(['Option', 'Size', 'Notice', 'Rent reset'], ab.options.map((o) => { const t = optionText(o); return [t.kind, t.size, t.notice, [t.reset, t.fee, t.conditions].filter(Boolean).join('. ')]; })) : h('p', null, NOT_YET));
  box.appendChild(h('div', 'ps-h2', 'Notes'));
  box.appendChild(table(['#', 'Note', 'Source'], notes(ab).map((n) => [String(n.n), `${n.label}: ${n.text}`, '']), 'ab-print-notes'));
  box.appendChild(h('div', 'ps-h2', 'Notice addresses'));
  box.appendChild(table(['Who', 'Address'], [['Tenant notices', show('noticeTenant')], ['Landlord notices', show('noticeLandlord')], ['Rent is paid to', show('paymentAddress')]]));
  const flags = flagLines(ab);
  box.appendChild(h('div', 'ps-h2', `Analyst flags (${flags.length})`));
  const ul = h('ul', 'ab-print-flags');
  for (const t of flags) ul.appendChild(h('li', null, t));
  box.appendChild(ul);
  const p = progress(ab);
  box.appendChild(h('p', 'ps-foot', `${p.open ? `Draft: ${p.open} item${p.open === 1 ? '' : 's'} not checked. ` : ''}${deal.confidential ? 'CONFIDENTIAL. Prepared for the named recipient only; do not copy, forward or post. ' : ''}Typed by the broker from the lease; ${PRODUCT} does not read the lease.`));
}

/** The checks an export shows beside its values. */
export { checkAbstract };

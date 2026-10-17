/* omstatement.js -- an OM's operating statement read as a table, by position.
 *
 * An offering memorandum prints its income and expenses as a table someone
 * typeset: labels down the left, one or more columns of figures (T-12,
 * Actual 2025, Year 1, Pro Forma, per SF, per unit, % of EGI...), headings
 * over the columns on one to three lines, sometimes one heading spanning
 * two columns ("Pro Forma" over Year 1 and Year 2), and often a note that
 * the figures are in thousands. This module reads it the way a person does:
 *
 *   - Table. A block of rows that each have a label and money cells, with
 *     section headings between them; it ends at the next heading area, at
 *     text that is not a heading, or at the end of the page.
 *   - Columns. Found by grouping the figures' right edges. The heading area
 *     is the one to three lines of text above the first row; a heading that
 *     spans two columns becomes their group label ("Pro Forma · Year 1").
 *   - Kinds. Each column is actual (T-12, TTM, Actual, Current, In-place, a
 *     past year), Year 1, pro forma (Pro Forma, Stabilized, Budget, Year 2
 *     and later, a coming year), per SF, per unit, or %. Per SF, per unit and
 *     % columns are never totals; a column with no heading whose figures,
 *     times the building SF or the unit count, give another column's, is
 *     read as per SF or per unit.
 *   - Scale. "($ in 000s)", "$000", "in thousands", "in millions" in the
 *     title, the heading area or a note under the table.
 *   - Checks. Each column is turned into the T-12 statement shape and
 *     t12.js statementChecks does the arithmetic (one copy of it): the lines
 *     add up to each subtotal, the income lines to EGI, EGI less expenses
 *     to NOI; and taxes are no more than total expenses, which are less
 *     than EGI. Growth between columns is noted. A failed check in a column
 *     the deal uses holds its NOI, EGI and operating expenses back until the
 *     broker chooses a fix.
 *
 * Pure: no DOM. om.js reads the fields from the tables found here; the deal
 * keeps what this returns as `deal.omRead` (dealui.js), the checks in the
 * Data QC shape (dataqc.js). Design: docs/proposals/om-statement.md. */

import { pageLines } from './omroll.js';
import { scaleOf } from './scale.js';
import { toCents } from './engine/money.js';
import { readStatement, normalizeSigns, statementChecks, statementTotals, matchLabel, amountOf, CATEGORY } from './t12.js';
import { blockingChecks, resolveCheck } from './dataqc.js';

/* ------------------------------------------------------------- the cells */

const DASH = /^(?:[-–—]+|n\/?a|nil|none)$/i;
const PCT = /^\(?\s*[-–]?\s*(\d{1,3}(?:,\d{3})*|\d+)(\.\d+)?\s*%\s*\)?$/;
const SUFFIX = /^(\(?)\s*[-–]?\s*\$\s?(\d+(?:\.\d+)?)\s*(k|m|mm)\s*(\)?)$/i;

/** A table cell as a figure: { value, pct?, dash?, dp } or null when it isn't one. */
export function readCell(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  if (DASH.test(t)) return { value: 0, dash: true, dp: 0 };
  let m = PCT.exec(t);
  if (m) return { value: (/^\(|^[-–]/.test(t) ? -1 : 1) * Number(m[1].replace(/,/g, '') + (m[2] || '')), pct: true, dp: m[2] ? m[2].length - 1 : 0 };
  m = SUFFIX.exec(t);
  if (m) return { value: (m[1] || /^[(-–]/.test(t) ? -1 : 1) * Number(m[2]) * (/^k$/i.test(m[3]) ? 1e3 : 1e6), dp: 0, suffix: true };
  if (!/\d/.test(t) || /[a-z]/i.test(t)) return null;
  const v = amountOf(t.replace(/^\$\s*\(/, '(').replace(/^([-–])\s*\$/, '-$').replace(/–/g, '-').replace(/\s+/g, ''));
  if (!Number.isFinite(v)) return null;
  const d = /\.(\d+)\)?-?$/.exec(t);
  return { value: v, dp: d ? d[1].length : 0 };
}

/* Two figures set closer than a double space read as one cell ("$1,118,900 $1,071,400"): split them where they sit. */
function splitFigures(cells) {
  const out = [];
  for (const c of cells) {
    const parts = c.text.split(' ');
    if (parts.length > 1 && parts.every((p) => { const r = readCell(p); return r && !r.dash; })) {
      const per = (c.x1 - c.x0) / Math.max(1, c.end - c.start);
      let off = 0;
      for (const p of parts) { out.push({ ...c, text: p, start: c.start + off, end: c.start + off + p.length, x0: c.x0 + off * per, x1: c.x0 + (off + p.length) * per }); off += p.length + 1; }
    } else out.push(c);
  }
  return out;
}

const isLabel = (s) => /[A-Za-z]{2,}/.test(s) && !readCell(s);
/** A line as the table sees it: 'row' (a label, then figures), 'blank' or 'text'. */
function lineKind(L) {
  if (!L.cells.length) return 'blank';
  const [a, ...rest] = L.cells;
  if (isLabel(a.text) && rest.length) {
    const rc = rest.map((c) => readCell(c.text));
    if (rc.every(Boolean) && rc.some((r) => !r.dash)) return 'row';
  }
  return 'text';
}

/* The scale a heading states is read by scale.js (scaleOf), shared with omroll.js. */
export { scaleOf };

/* --------------------------------------------------------- the columns */

const K = {
  pct: /%|\bpercent\b|\bpct\.?\b/i,
  psf: /\$\s*\/\s*(?:sf|rsf|nsf|gsf|sq\.?\s?ft|ft)\b|\bpsf\b|\bp\.s\.f\b|\bper\s+(?:sf|rsf|nsf|gsf|sq\.?\s?ft|square\s+f(?:oo|ee)t|foot)\b|\/\s*(?:sf|rsf)\b/i,
  unit: /\bper\s+(?:unit|key|door|bed|room|suite|apartment|pad|site)\b|\$?\s*\/\s*(?:unit|key|door|bed|room)\b|\bpupa\b|\bper\s+apt\b/i,
  t12: /\bt-?12\b|\bttm\b|\btrailing\b|\blast\s+(?:12|twelve)\b|\bltm\b|\b12\s*mo(?:nths?)?\b/i,
  actual: /\bactuals?\b|\bcurrent\b|\bin[- ]place\b|\bhistorical\b|\bas[- ]is\b|\bytd\b|\bannuali[sz]ed\b|\b(?:19|20)\d\d\s*a\b/i,
  proforma: /\bpro[- ]?forma\b|\bstabili[sz]ed\b|\bbudget(?:ed)?\b|\bprojected\b|\bprojections?\b|\bforecast\b|\bunderwritten\b|\byear\s*(?:[2-9]|[1-9]\d)\b|\byr\.?\s*(?:[2-9]|[1-9]\d)\b|\b(?:19|20)\d\d\s*e\b/i,
  year1: /\byear\s*1\b|\byr\.?\s*1\b|\byear\s+one\b/i,
  total: /^(?:total|totals|annual|amount|\$|usd|annual total|total \$|\$ total)$/i,
};
const YEAR = /\b(19\d\d|20\d\d)\b/;

/**
 * What a column's heading says it is: { kind, year?, t12? }. kind is one of
 * 'pct', 'psf', 'unit' (never totals), 'actual', 'year1', 'proforma',
 * 'total' (a heading with no basis, such as "Total") or 'none' (no heading).
 * A plain year before `asOfYear` is actual; that year or later, projected.
 */
export function columnKind(text, { asOfYear = new Date().getFullYear() } = {}) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return { kind: 'none' };
  const y = YEAR.exec(t);
  const year = y ? Number(y[1]) : null;
  if (K.pct.test(t)) return { kind: 'pct' };
  if (K.psf.test(t)) return { kind: 'psf' };
  if (K.unit.test(t)) return { kind: 'unit' };
  if (K.proforma.test(t)) return { kind: 'proforma', year };
  if (K.t12.test(t)) return { kind: 'actual', t12: true, year };
  if (K.actual.test(t)) return { kind: 'actual', year };
  if (K.year1.test(t)) return { kind: 'year1' };
  if (year && /^(?:fy|cy)?\s*'?(?:19|20)\d\d(?:\s*(?:fy|cy))?$/i.test(t)) return year < asOfYear ? { kind: 'actual', year, plainYear: true } : { kind: 'proforma', year, plainYear: true };
  if (K.total.test(t)) return { kind: 'total' };
  return { kind: 'total', unrecognised: true };
}
const EXCLUDED = new Set(['pct', 'psf', 'unit']);
export const KIND_WORD = { actual: 'actual', year1: 'Year 1', proforma: 'pro forma', total: 'no basis printed', none: 'no heading', psf: 'per SF', unit: 'per unit', pct: '%' };

const NOTE = /^(?:\*|†|‡|\(\d\)|\d\)|notes?\b|source\b|figures\b|amounts\b|all (?:figures|amounts|dollars)\b|dollars\b|\$\s*in\b|in thousands|in millions|\(\s*\$|\(\s*000)/i;
const overlap = (a, b, pad = 0) => Math.min(a.x1, b.x1 + pad) - Math.max(a.x0, b.x0 - pad);
const mid = (o) => (o.x0 + o.x1) / 2;

/** The figures' right edges grouped into columns: [{ x0, x1, right }], left to right. */
function findColumns(rows) {
  const cells = rows.flatMap((r) => r.nums || []).sort((a, b) => a.x1 - b.x1);
  const cols = [];
  for (const c of cells) {
    const last = cols[cols.length - 1];
    if (last && c.x1 - last.edge <= 3) { last.cells.push(c); last.edge = c.x1; last.x0 = Math.min(last.x0, c.x0); last.x1 = Math.max(last.x1, c.x1); } else cols.push({ x0: c.x0, x1: c.x1, edge: c.x1, cells: [c] });
  }
  return cols.map((c, idx) => ({ idx, x0: c.x0, x1: c.x1 }));
}

/* ------------------------------------------------------------ the tables */

/**
 * Every table of label-and-figure rows on the pages: [{ id, page, lines,
 * title, scale, scaleText, columns, rows, header }]. `isStatementRow(label)`
 * says whether a row label is one an operating statement prints (NOI, EGI,
 * expenses...); a table counts when it has two such rows, or one under a
 * heading that names a basis (T-12, Actual, Pro Forma...).
 */
/**
 * @param {string[]} pages
 * @param {{ layouts?: any[]|null, isStatementRow?: (label: string) => boolean, asOfYear?: number }} [opts]
 */
export function statementTables(pages, { layouts = null, isStatementRow = () => false, asOfYear = new Date().getFullYear() } = {}) {
  const out = [];
  pages.forEach((text, pi) => {
    const P = pageLines(text, layouts && layouts[pi] ? layouts[pi] : null);
    for (const L of P) L.cells = splitFigures(L.cells);
    let cur = null;
    let n = 0;
    const close = () => {
      if (cur) {
        while (cur.rows.length && cur.rows[cur.rows.length - 1].heading) cur.rows.pop();
        if (cur.rows.some((r) => !r.heading)) { const t = finishTable(P, cur, pi + 1, ++n, { isStatementRow, asOfYear }); if (t) out.push(t); }
      }
      cur = null;
    };
    for (const L of P) {
      const k = lineKind(L);
      if (k === 'row') {
        if (!cur) cur = { rows: [] };
        cur.rows.push({ line: L.i, L, label: L.cells[0].text, labelCell: L.cells[0], nums: L.cells.slice(1) });
      } else if (k === 'text' && cur) {
        // text inside a table: a section heading at the left ("Operating Expenses"), or the table's end
        const left = Math.min(...cur.rows.filter((r) => !r.heading).flatMap((r) => r.nums.map((c) => c.x0)));
        if (L.cells.length <= 2 && L.cells.every((c) => c.x1 <= left - 1 && isLabel(c.text)) && L.text.trim().length <= 60) cur.rows.push({ line: L.i, L, label: L.cells.map((c) => c.text).join(' '), heading: true });
        else close();
      }
    }
    close();
  });
  return out;
}

function finishTable(P, cur, page, n, { isStatementRow, asOfYear }) {
  const body = cur.rows.filter((r) => !r.heading);
  const cols = findColumns(body);
  const labX0 = Math.min(...body.map((r) => r.labelCell.x0));
  const colL = Math.min(...cols.map((c) => c.x0));
  // each row's figures in their columns
  for (const r of body) {
    r.cells = cols.map(() => null);
    for (const c of r.nums) {
      let best = -1; let d = Infinity;
      cols.forEach((col, k) => { const dd = c.x1 >= col.x0 - 1 && c.x1 <= col.x1 + 1 ? 0 : Math.abs(c.x1 - col.x1); if (dd < d) { d = dd; best = k; } });
      if (best < 0) continue;
      if (r.cells[best]) { r.ambiguous = true; continue; }
      r.cells[best] = { ...readCell(c.text), text: c.text, start: c.start, end: c.end, x0: c.x0, x1: c.x1 };
    }
  }
  // the heading area: one to three lines of text above the first row, cells over the columns
  const first = cur.rows[0].line;
  const heads = []; let lead = null; let j = first - 1; let gap = 0;
  for (; j >= 0 && heads.length < 3; j--) {
    const L = P[j];
    if (!L.cells.length) { if (heads.length && ++gap > 1) break; continue; }
    if (lineKind(L) === 'row') break;
    const hc = L.cells.filter((c) => c.x1 > colL - 1 && c.x0 > labX0 + 1);
    if (!hc.length) break;
    if (hc.length < L.cells.length && !heads.length) lead = L.cells.filter((c) => !hc.includes(c)).map((c) => c.text).join(' ');
    heads.unshift({ L, cells: hc });
    gap = 0;
  }
  // the title and any note: text above the heading area (back to the last table) and just below the table
  const above = [];
  for (let k = j; k >= 0 && above.length < 4; k--) { const L = P[k]; if (!L.cells.length) continue; if (lineKind(L) === 'row') break; above.unshift(L.text.trim()); }
  const last = cur.rows[cur.rows.length - 1].line;
  const below = [];
  for (let k = last + 1; k < P.length && below.length < 3; k++) { const L = P[k]; if (!L.cells.length) continue; if (lineKind(L) === 'row' || !NOTE.test(L.text.trim())) break; below.push(L.text.trim()); }
  const columns = cols.map((c) => /** @type {any} */ ({ ...c, own: [], group: [] }));
  heads.forEach((H, hi) => {
    const bottom = hi === heads.length - 1;
    for (const hc of H.cells) {
      // above the bottom line, a heading centred in the gap between two columns spans both ("Pro Forma" over Year 1 and Year 2)
      const cx = mid(hc);
      const k = columns.findIndex((c, i) => i + 1 < columns.length && c.x1 < cx && cx < columns[i + 1].x0);
      if (!bottom && k >= 0) { columns[k].group.push(hc.text); columns[k + 1].group.push(hc.text); continue; }
      const hits = columns.filter((c) => overlap(hc, c, bottom ? 0 : 1) > 0);
      if (hits.length >= 2 && !bottom) { for (const c of hits) c.group.push(hc.text); continue; }
      if (hits.length >= 2) { hits.sort((a, b) => overlap(hc, b) - overlap(hc, a)); hits[0].own.push(hc.text); continue; }
      if (hits.length === 1) { hits[0].own.push(hc.text); continue; }
      const near = [...columns].sort((a, b) => Math.abs(mid(a) - cx) - Math.abs(mid(b) - cx))[0];
      if (near && Math.abs(mid(near) - cx) <= 8) near.own.push(hc.text);
    }
  });
  const sc = scaleOf([...above, ...heads.map((H) => H.L.text), ...below].join('\n'));
  for (const c of columns) {
    const group = c.group.join(' ');
    const own = c.own.join(' ');
    c.label = group && own ? `${group} · ${own}` : group || own || '';
    const vals = body.map((r) => r.cells[c.idx]).filter((x) => x && !x.dash);
    Object.assign(c, columnKind(`${group} ${own}`.trim(), { asOfYear }));
    if (vals.length && vals.every((x) => x.pct)) c.kind = 'pct';
    delete c.own; delete c.group;
  }
  const rows = cur.rows.map((r) => (r.heading ? { line: r.line, label: r.label, heading: true, lineText: r.L.text }
    : { line: r.line, label: r.label, cells: r.cells, lineText: r.L.text, ambiguous: !!r.ambiguous, labelX0: r.labelCell.x0 }));
  if (lead && isLabel(lead)) rows.unshift({ line: heads[heads.length - 1].L.i, label: lead, heading: true, lineText: '' });
  const statementRows = rows.filter((r) => !r.heading && isStatementRow(r.label)).length;
  const named = columns.some((c) => ['actual', 'year1', 'proforma'].includes(c.kind));
  if (statementRows < 2 && !(statementRows >= 1 && named)) return null;
  const title = above.length ? above[above.length - 1] : '';
  return { id: `p${page}.${n}`, page, lines: [first, last], title, scale: sc.scale, scaleText: sc.text, columns, rows, header: heads.map((H) => H.L.text.trim()) };
}

/* ------------------------------------------------------ choosing columns */

const PLACEHOLDER = '(no line items printed)';
const money = (x) => `${x < 0 ? '−' : ''}$${Math.abs(Math.round(x)).toLocaleString('en-US')}`;
// money to whole cents with the engine's one rule
const toc = toCents;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

/**
 * A column with no heading whose figures, times the building SF or the unit
 * count, give another column's figures, is per SF or per unit (in place).
 */
export function inferUnits(t, { bsf = null, units = null } = {}) {
  for (const c of t.columns) {
    if (c.kind !== 'none') continue;
    for (const o of t.columns) {
      if (o === c || EXCLUDED.has(o.kind)) continue;
      const ratios = t.rows.filter((r) => r.cells && r.cells[c.idx] && r.cells[o.idx] && r.cells[c.idx].value && r.cells[o.idx].value)
        .map((r) => r.cells[o.idx].value / r.cells[c.idx].value);
      if (ratios.length < 2) continue;
      const m = median(ratios);
      for (const [kind, n] of [['psf', bsf], ['unit', units]]) {
        if (Number.isFinite(n) && n > 1 && Math.abs(m / n - 1) <= 0.03) { c.kind = kind; c.inferred = { n, by: o.idx, kind }; break; }
      }
      if (c.inferred) break;
    }
  }
  return t;
}

/**
 * The columns the deal's figures come from: { inplace, pf, inplaceHow } (column
 * indices, or null). In place: the latest actual, a T-12 first; then a column
 * with no basis printed; then, with no actual at all, Year 1 ("projected").
 * Pro forma: the first pro forma column, else Year 1 if the in-place is actual.
 */
export function pickColumns(t) {
  const usable = t.columns.filter((c) => !EXCLUDED.has(c.kind));
  const rank = (c) => (c.kind === 'actual' ? (c.t12 ? 0 : c.year ? 2 : 1) : (c.kind === 'total' || c.kind === 'none') ? 3 : null);
  const ins = usable.filter((c) => rank(c) !== null).sort((a, b) => rank(a) - rank(b) || (b.year || 0) - (a.year || 0) || a.idx - b.idx);
  let inplace = ins.length ? ins[0].idx : null;
  let how = ins.length ? (rank(ins[0]) <= 2 ? 'actual' : 'inferred') : null;
  const y1 = usable.find((c) => c.kind === 'year1');
  if (inplace === null && y1) { inplace = y1.idx; how = 'year1'; }
  const pfc = usable.find((c) => c.kind === 'proforma');
  const pf = pfc ? pfc.idx : y1 && how !== 'year1' ? y1.idx : null;
  return { inplace, pf, inplaceHow: how };
}

/** A column's name as a source shows it: its heading, "Year 1 (projected)", or "column 2 (no heading)". */
export function columnName(t, k, picks = null) {
  const c = t.columns[k];
  if (!c) return '';
  if (picks && picks.inplaceHow === 'year1' && picks.inplace === k) return `${c.label || 'Year 1'} (projected)`;
  return c.label || `column ${k + 1} (no heading)`;
}

/**
 * The part of the statement each row sits in, as t12.js reads a statement:
 * Map(line → 'income'|'expense'|'below'), subtotals included (EGI closes
 * the income, total expenses the expenses).
 */
export function rowSections(t) {
  const rows = [{ r: 0, cells: ['', 'Total'] }, { r: 1, cells: ['Income', null] }, { r: 1.5, cells: [PLACEHOLDER, '–'] }];
  for (const r of t.rows) rows.push({ r: r.line + 2, cells: [r.label, r.heading ? null : '–'] });
  const out = new Map();
  let st;
  try { st = readStatement(rows); } catch { return out; }
  for (const l of st.lines) if (l.label !== PLACEHOLDER) out.set(l.r - 2, l.section);
  if (st.stated.egi) out.set(st.stated.egi.r - 2, 'income');
  if (st.stated.opex) out.set(st.stated.opex.r - 2, 'expense');
  return out;
}

/* ------------------------------------------------------------- the checks */

const FIELD_WORD = { noi: 'NOI', gross: 'EGI', opex: 'total expenses', noi_pf: 'pro forma NOI', taxes: 'real estate taxes', gpr: 'gross potential rent', rent_inplace: 'base rent' };
const BLOCKS_INPLACE = ['noi', 'gross', 'opex'];

/** How far a printed subtotal may sit from what its lines add up to: half a printed unit per line, or 0.5%, whichever is more. */
export const tolerance = (scale) => (stated, lines) => Math.max(0.5 * scale * ((lines || 0) + 1), 0.005 * Math.abs(stated || 0));

/**
 * One column as the T-12 statement shape (t12.js), so statementChecks can
 * do its arithmetic: { st, lines, stated, partial, empty }. Lines whose
 * category the wording doesn't settle are put where the OM prints them.
 */
function columnStatement(t, k, scale, roles) {
  const rows = [{ r: 0, cells: ['', 'Total'] }];
  // the side the first row is on starts the statement: income, unless it opens with an expense
  const first = t.rows.find((r) => !r.heading && r.cells[k]);
  const m0 = first && !roles.subtotal.has(first.line) ? matchLabel(first.label) : null;
  const startSide = (first && roles.opex.has(first.line)) || (m0 && m0.category && CATEGORY[m0.category].side === 'expense') ? 'Expenses' : 'Income';
  rows.push({ r: 1, cells: [startSide, null] });
  // readStatement wants a line; a statement of subtotals only has none, so a placeholder adds nothing
  rows.push({ r: 1.5, cells: [PLACEHOLDER, '–'] });
  for (const r of t.rows) {
    if (r.heading) { rows.push({ r: r.line + 2, cells: [r.label, null] }); continue; }
    const c = r.cells[k];
    if (!c) {
      // a blank line item adds nothing to its subtotal; a blank subtotal is left out
      if (!roles.subtotal.has(r.line) && r.cells.some(Boolean)) rows.push({ r: r.line + 2, cells: [r.label, '–'] });
      continue;
    }
    rows.push({ r: r.line + 2, cells: [r.label, c.dash ? '–' : toc(c.value * scale)] });
  }
  let st;
  try { st = readStatement(rows); } catch { return null; }
  st.lines = st.lines.filter((l) => l.label !== PLACEHOLDER);
  for (const l of st.lines) {
    if (!l.category) Object.assign(l, { category: l.section === 'expense' ? 'otherOpex' : l.section === 'below' ? 'reserves' : 'otherIncome', how: 'position' });
  }
  return st;
}

const sideOf = (l) => CATEGORY[l.category].side;

/**
 * The checks on one table, in the Data QC shape (dataqc.js), and where each
 * figure the deal could take sits. `rowsFor(field)` gives the table's rows
 * for a field (om.js matches the labels).
 */
/**
 * @param {any} t
 * @param {{ picks: any, rowsOf: Record<string, any[]> }} opts
 */
export function tableChecks(t, { picks, rowsOf }) {
  const checks = [];
  const scale = t.scale || 1;
  const tol = tolerance(scale);
  const rowOf = (f) => (rowsOf[f] || [])[0] || null;
  const subtotal = new Set(['gross', 'opex', 'noi'].flatMap((f) => (rowsOf[f] || []).map((r) => r.line)));
  const roles = { subtotal, opex: new Set((rowsOf.opex || []).map((r) => r.line)) };
  const cellOf = (r, k) => (r && r.cells && r.cells[k] ? r.cells[k] : null);
  const valueOf = (r, k) => { const c = cellOf(r, k); return c && !c.dash ? toc(c.value * scale) : null; };
  const where = (r, k) => {
    const c = cellOf(r, k);
    const lead = r ? (r.lineText.length - r.lineText.trimStart().length) : 0;
    return { page: t.page, line: r ? r.line + 1 : null, row: r ? r.label : null, col: k, colLabel: columnName(t, k, picks), cell: c ? { text: c.text, at: c.start - lead } : null, lineText: r ? r.lineText.trim() : '' };
  };
  const used = (k) => k === picks.inplace || k === picks.pf;
  const fieldsOf = (k) => (k === picks.inplace ? BLOCKS_INPLACE : k === picks.pf ? ['noi_pf'] : []);
  const printedValues = (k) => {
    const v = {};
    if (k === picks.inplace) for (const f of BLOCKS_INPLACE) { const x = valueOf(rowOf(f), k); if (x !== null) v[f] = x; }
    if (k === picks.pf) { const x = valueOf(rowOf('noi'), k); if (x !== null) v.noi_pf = x; }
    return v;
  };
  const otherColumns = (k, fields) => t.columns.filter((c) => c.idx !== k && !EXCLUDED.has(c.kind)).map((c) => {
    const v = {};
    for (const f of fields) { const x = valueOf(rowOf(f === 'noi_pf' ? 'noi' : f), c.idx); if (x !== null) v[f] = x; }
    return Object.keys(v).length ? { id: `col${c.idx}`, label: `Use ${columnName(t, c.idx, picks)}`, values: v } : null;
  }).filter(Boolean);
  const valuesText = (v) => Object.entries(v).map(([f, x]) => `${FIELD_WORD[f]} ${money(x)}`).join(', ');
  const fixLabel = (fx) => `${fx.label}: ${valuesText(fx.values)}`;
  const id = (k, what) => `stmt:${t.id}:c${k}:${what}`;

  if (scale !== 1) checks.push({ id: `stmt:${t.id}:scale`, kind: 'scale', level: 'info', amount: 0, ...where(null, null), page: t.page, text: `Figures on page ${t.page} are printed in ${scale === 1e3 ? 'thousands' : 'millions'} (“${t.scaleText}”): each is read × ${scale.toLocaleString('en-US')}.` });
  const excl = t.columns.filter((c) => EXCLUDED.has(c.kind));
  if (excl.length) checks.push({ id: `stmt:${t.id}:excluded`, kind: 'units', level: 'info', amount: 0, page: t.page, line: null, row: null, col: null, colLabel: null, cell: null, lineText: '',
    text: `${excl.filter((c, i) => c.inferred || excl.findIndex((x) => !x.inferred && x.label === c.label) === i).map((c) => `${c.inferred ? `Column ${c.idx + 1} (no heading; its figures × ${c.inferred.n.toLocaleString('en-US')}, the ${c.kind === 'psf' ? 'building SF' : 'unit count'}, give column ${c.inferred.by + 1})` : `“${c.label}”`}${!c.inferred && excl.filter((x) => x.label === c.label).length > 1 ? ` (${excl.filter((x) => x.label === c.label).length} columns)` : ''} is ${c.kind === 'psf' ? 'per SF' : c.kind === 'unit' ? 'per unit' : 'a percentage'}`).join('; ')}: not read as ${excl.length === 1 ? 'a total' : 'totals'}.` });
  if (picks.inplace !== null && (t.columns[picks.inplace].kind === 'total' || t.columns[picks.inplace].kind === 'none')) {
    const usable = t.columns.filter((c) => !EXCLUDED.has(c.kind));
    checks.push({ id: `stmt:${t.id}:basis`, kind: 'basis', level: 'info', amount: 0, ...where(rowOf('noi'), picks.inplace),
      text: `${columnName(t, picks.inplace, picks)} on page ${t.page} doesn’t say whether it is actual or pro forma${usable.length > 1 ? ' and is the first column that doesn’t' : ''}: its figures are read as in place, with medium confidence.` });
  }
  if (picks.inplaceHow === 'year1') checks.push({ id: `stmt:${t.id}:year1`, kind: 'basis', level: 'info', amount: 0, ...where(rowOf('noi'), picks.inplace),
    text: `The statement on page ${t.page} has no actual or T-12 column: Year 1 is read as NOI, labelled “Year 1 (projected)”, with medium confidence.` });

  const perCol = {};
  for (const c of t.columns) {
    if (EXCLUDED.has(c.kind)) continue;
    const k = c.idx;
    const name = columnName(t, k, picks);
    const st0 = columnStatement(t, k, scale, roles);
    if (!st0) continue;
    const st = normalizeSigns(st0);
    const lev = used(k) ? 'fail' : 'warn';
    const res = { ran: 0, failed: [], egi: null, opex: null, noi: null, taxes: null };
    const income = st.lines.filter((l) => sideOf(l) === 'income');
    const expense = st.lines.filter((l) => sideOf(l) === 'expense');
    const egiRow = rowOf('gross'); const opexRow = rowOf('opex'); const noiRow = rowOf('noi'); const taxRow = rowOf('taxes');
    // a section printed with fewer than three lines that don't add up is a summary, not every line: its subtotal is used
    const sumOf = (ls) => toc(ls.reduce((s, l) => s + l.total, 0));
    const partial = [];
    for (const [key, ls, side, word, row] of [['egi', income, 'income', 'income', egiRow], ['opex', expense, 'expense', 'expense', opexRow]]) {
      const s = st.stated[key];
      if (!s) continue;
      const sum = sumOf(ls);
      if (!ls.length || (ls.length < 3 && Math.abs(Math.abs(sum) - Math.abs(s.value)) > tol(s.value, ls.length))) {
        if (ls.length) partial.push({ key, n: ls.length, sum, value: s.value, word, row });
        st.lines = st.lines.filter((l) => sideOf(l) !== side);
        st.lines.push({ id: `S${key}`, r: s.r, label: s.label, key: s.label.toLowerCase(), section: side, months: [], total: key === 'opex' ? Math.abs(s.value) : s.value, fileTotal: null, category: side === 'income' ? 'otherIncome' : 'otherOpex', how: 'stated' });
        delete st.stated[key];
      }
    }
    for (const p of partial) checks.push({ id: id(k, `partial.${p.key}`), kind: 'partial', level: 'info', amount: 0, ...where(p.row, k),
      text: `${name}: only ${p.n} ${p.word} line${p.n === 1 ? ' is' : 's are'} printed above ${p.key === 'egi' ? 'EGI' : 'total expenses'} (adding up to ${money(p.sum)} of ${money(p.value)}), so ${p.key === 'egi' ? 'EGI' : 'total expenses'} ${p.key === 'egi' ? 'is' : 'are'} taken as printed.` });
    const hasIncome = st.lines.some((l) => sideOf(l) === 'income');
    const hasExpense = st.lines.some((l) => sideOf(l) === 'expense');
    // the lines against their subtotals here; NOI against the subtotals as printed, below
    const noiStated = st.stated.noi || null;
    delete st.stated.noi;
    const T = statementTotals(st);
    res.egi = hasIncome ? T.egi : null; res.opex = hasExpense ? T.opex : null;
    res.noi = st0.stated.noi ? st0.stated.noi.value : (hasIncome && hasExpense ? T.noi : null);
    res.taxes = valueOf(taxRow, k);
    const egiP = valueOf(egiRow, k); const opexP = valueOf(opexRow, k); const noiP = valueOf(noiRow, k);
    // EGI less expenses, each as printed (or as its lines add up where no subtotal is printed), against the NOI printed
    const egiS = egiP !== null ? egiP : hasIncome ? T.egi : null;
    const opexS = opexP !== null ? Math.abs(opexP) : hasExpense ? T.opex : null;
    let T2 = null; let noiChecks = [];
    if (noiStated && egiS !== null && opexS !== null) {
      const sub = (id, side, total) => ({ id, r: 0, label: id, key: id, section: side, months: [], total, fileTotal: null, category: side === 'income' ? 'otherIncome' : 'otherOpex' });
      const st2 = { months: [], lines: [sub('EGI', 'income', egiS), sub('expenses', 'expense', opexS)], stated: { noi: noiStated }, subtotals: [] };
      T2 = statementTotals(st2);
      noiChecks = statementChecks(st2, { tol }).filter((x) => x.id === 'stated.noi');
      if (!noiChecks.length) res.ran += 1;
    }
    for (const x of [...statementChecks(st, { tol }), ...noiChecks]) {
      if (x.id === 'months' || x.id === 'linetotals') continue;
      // below NOI (reserves, debt service, cash flow) a subtotal isn't the sum of the lines above it
      if (/^sub\./.test(x.id) && noiRow && Number(x.id.slice(4)) - 2 > noiRow.line) continue;
      res.ran += 1;
      let row = null; let text = x.text.replace(/ \(row \d+\)/g, '').replace(/^The file states/, 'The OM prints');
      let kind = 'sum'; const fixes = [];
      const printed = printedValues(k);
      if (x.id === 'stated.noi') {
        row = noiRow; kind = 'noi';
        const fromSub = egiP !== null && opexP !== null ? T2.noi : null;
        text = `${name}: EGI ${money(egiS)} less expenses ${money(opexS)} is ${money(T2.noi)}, but NOI is printed as ${money(noiStated.value)} (${money(Math.abs(Math.abs(noiStated.value) - Math.abs(T2.noi)))} apart; up to ${money(tol(noiStated.value, 2))} is rounding).`;
        if (fromSub !== null && k === picks.inplace) fixes.push({ id: 'subtotals', label: 'Use the subtotals (EGI − expenses)', values: { noi: fromSub } });
        if (fromSub !== null && k === picks.pf && k !== picks.inplace) fixes.push({ id: 'subtotals', label: 'Use the subtotals (EGI − expenses)', values: { noi_pf: fromSub } });
        if (fromSub === null || Math.abs(fromSub - T.noi) > 1) fixes.push({ id: 'lines', label: 'Use the sum of the lines', values: k === picks.inplace ? { noi: T.noi, gross: T.egi, opex: T.opex } : { noi_pf: T.noi } });
      } else if (x.id === 'stated.egi') {
        row = egiRow; kind = 'egi';
        text = `${name}: the ${income.length} income lines add up to ${money(T.egi)}, but EGI is printed as ${money(st.stated.egi.value)}.`;
        if (k === picks.inplace) fixes.push({ id: 'lines', label: 'Use the sum of the lines', values: { gross: T.egi, ...(noiP !== null && opexP !== null ? { noi: toc(T.egi - Math.abs(opexP)) } : {}) } });
      } else if (x.id === 'stated.opex') {
        row = opexRow; kind = 'opex';
        text = `${name}: the ${expense.length} expense lines add up to ${money(T.opex)}, but total expenses are printed as ${money(Math.abs(st.stated.opex.value))}.`;
        if (k === picks.inplace) fixes.push({ id: 'lines', label: 'Use the sum of the lines', values: { opex: T.opex, ...(egiP !== null ? { noi: toc(egiP - T.opex) } : {}) } });
      } else {
        const r = Number(x.id.slice(4)) - 2;
        row = t.rows.find((y) => y.line === r) || null;
        text = `${name}: ${text}`;
      }
      if (Object.keys(printed).length) fixes.unshift({ id: 'printed', label: 'Keep as printed', values: printed });
      fixes.push(...otherColumns(k, fieldsOf(k)));
      for (const f of fixes) f.label = fixLabel(f);
      const ck = { id: id(k, x.id), kind, level: lev, amount: Math.abs(noiP ?? x.amount ?? 0), ...where(row, k), text: lev === 'warn' ? `${text} The deal doesn’t use this column.` : text, fields: fieldsOf(k), fixes: lev === 'fail' ? fixes : [] };
      checks.push(ck); res.failed.push(ck.id);
    }
    // the order a statement's figures must keep: taxes within expenses, expenses within income
    const opexV = opexP !== null ? Math.abs(opexP) : res.opex;
    const egiV = egiP !== null ? egiP : res.egi;
    const order = [];
    if (res.taxes !== null && opexV !== null) { res.ran += 1; if (Math.abs(res.taxes) > opexV + tol(opexV, 1)) order.push(['taxes', taxRow, `${name}: real estate taxes (${money(Math.abs(res.taxes))}) are more than total expenses (${money(opexV)}).`]); }
    if (opexV !== null && egiV !== null) { res.ran += 1; if (opexV >= egiV) order.push(['order', opexRow, `${name}: total expenses (${money(opexV)}) are not less than EGI (${money(egiV)}), which leaves no positive NOI.`]); }
    for (const [what, row, text] of order) {
      const printed = printedValues(k);
      const fixes = [...(Object.keys(printed).length ? [{ id: 'printed', label: 'Keep as printed', values: printed }] : []), ...otherColumns(k, fieldsOf(k))];
      for (const f of fixes) f.label = fixLabel(f);
      const ck = { id: id(k, what), kind: 'order', level: lev, amount: Math.abs(noiP ?? opexV ?? 0), ...where(row, k), text: lev === 'warn' ? `${text} The deal doesn’t use this column.` : text, fields: fieldsOf(k), fixes: lev === 'fail' ? fixes : [] };
      checks.push(ck); res.failed.push(ck.id);
    }
    if (res.ran && !res.failed.length && used(k)) {
      const bits = [];
      if (res.egi !== null && res.opex !== null && st0.stated.noi) bits.push(`EGI ${money(egiV)} less expenses ${money(opexV)} is NOI ${money(noiP)}`);
      if (income.length >= 3 && st0.stated.egi && !partial.some((p) => p.key === 'egi')) bits.push(`the ${income.length} income lines add up to EGI`);
      if (expense.length >= 3 && st0.stated.opex && !partial.some((p) => p.key === 'opex')) bits.push(`the ${expense.length} expense lines add up to total expenses`);
      if (res.taxes !== null && opexV !== null) bits.push('taxes are within total expenses');
      checks.push({ id: id(k, 'pass'), kind: 'pass', level: 'pass', amount: 0, ...where(noiRow || egiRow || opexRow, k), text: `${name}: ${bits.join('; ') || 'its figures are in order'}, as printed.` });
    }
    perCol[k] = res;
  }
  // growth from one column to the next: a note for income or expenses, a warning for NOI; never blocking
  const money_ = t.columns.filter((c) => !EXCLUDED.has(c.kind) && perCol[c.idx]);
  for (let i = 0; i + 1 < money_.length; i++) {
    const a = money_[i].idx; const b = money_[i + 1].idx;
    for (const [f, row, limit, level] of [['egi', rowOf('gross'), 0.25, 'info'], ['opex', rowOf('opex'), 0.25, 'info'], ['noi', rowOf('noi'), 0.5, 'warn']]) {
      const va = f === 'noi' ? valueOf(row, a) : (f === 'egi' ? (valueOf(row, a) ?? perCol[a].egi) : (valueOf(row, a) ?? perCol[a].opex));
      const vb = f === 'noi' ? valueOf(row, b) : (f === 'egi' ? (valueOf(row, b) ?? perCol[b].egi) : (valueOf(row, b) ?? perCol[b].opex));
      if (va === null || vb === null || !va) continue;
      const g = (Math.abs(vb) - Math.abs(va)) / Math.abs(va);
      if (Math.abs(g) <= limit) continue;
      const word = f === 'egi' ? 'EGI' : f === 'opex' ? 'Total expenses' : 'NOI';
      checks.push({ id: `stmt:${t.id}:growth.${f}.${a}.${b}`, kind: 'growth', level, amount: level === 'warn' ? Math.abs(vb - va) : 0, ...where(row, b),
        text: `${word} ${g > 0 ? 'rises' : 'falls'} ${Math.abs(Math.round(g * 100))}% from ${columnName(t, a, picks)} (${money(va)}) to ${columnName(t, b, picks)} (${money(vb)})${level === 'warn' ? ': check what the pro forma assumes before relying on it' : ''}.` });
    }
  }
  return { checks, perCol };
}

/* --------------------------------------------------------- on the deal */

/**
 * What a deal keeps of an OM's statements as read (om.js readOm), and the
 * figures it may apply now: `deal.omRead` = { v, at, file, tables, checks,
 * blocked, held, applied, seen }. A failed check in a column the deal uses
 * holds NOI, EGI and operating expenses back (removed from `figures` and
 * `sources`, kept in `held`) until each such check is resolved. Null when
 * the OM has no statement table.
 */
export function omReadRecord(om, { figures = {}, sources = {}, file = '', at = Date.now() } = {}) {
  const S = om && om.statement;
  if (!S || !S.tables.length) return { omRead: null, figures, sources };
  const checks = S.checks.map((c) => ({ ...c }));
  const blocked = [...new Set(checks.filter((c) => c.level === 'fail').flatMap((c) => c.fields || []))];
  const held = {};
  const f2 = { ...figures }; const s2 = { ...sources };
  for (const k of blocked) {
    if (!(k in f2)) continue;
    held[k] = { value: f2[k], source: s2[k] || null };
    delete f2[k]; delete s2[k];
  }
  const omRead = { v: 1, at, file, tables: S.tables, checks, blocked, held, applied: !blocked.length, seen: {} };
  return { omRead, figures: f2, sources: s2 };
}

/** The figures a deal still has held back by a failed statement check. */
export const heldFields = (r) => (r && Array.isArray(r.blocked) ? r.blocked.filter((k) => !(r.done && r.done[k])) : []);

/**
 * Resolve a statement check with one of its fixes (`printed`, `subtotals`,
 * `lines`, `colN`), in place: the choice is recorded on the check and in
 * `omRead.seen`, and once no failed check holds a figure back, it is
 * applied. Returns { applied: [keys], waiting: [keys] } or null.
 */
export function applyOmFix(d, checkId, fixId = 'printed', at = Date.now()) {
  const r = d && d.omRead;
  const c = r && r.checks.find((x) => x.id === checkId);
  if (!c || c.resolved) return null;
  const fix = (c.fixes || []).find((f) => f.id === fixId) || (fixId === 'printed' ? { id: 'printed', label: 'Kept as printed', values: {} } : null);
  if (!fix) return null;
  resolveCheck(r, c.id, fix.id === 'printed' ? 'accepted' : 'fixed', at, fix.label);
  r.seen = { ...(r.seen || {}), [c.id]: { fix: fix.id, label: fix.label, values: { ...fix.values }, at } };
  return applyHeldFigures(d);
}

/** The figures no open failed check holds back any more, applied (in place). */
export function applyHeldFigures(d) {
  const r = d && d.omRead;
  if (!r) return null;
  const open = blockingChecks(r);
  const applied = []; const waiting = [];
  r.done = r.done || {};
  for (const k of r.blocked || []) {
    if (r.done[k]) continue;
    if (open.some((c) => (c.fields || []).includes(k))) { waiting.push(k); continue; }
    // the broker's choice for this figure, latest last; else the reading as it stood
    let value = r.held && r.held[k] ? r.held[k].value : null;
    let how = null;
    for (const c of r.checks) { const s = r.seen && r.seen[c.id]; if (s && s.values && k in s.values) { value = s.values[k]; how = s.label; } }
    r.done[k] = true;
    if (!Number.isFinite(value)) continue;
    if (Number.isFinite(d.figures[k]) && !(r.held && r.held[k] && d.figures[k] === r.held[k].value)) { r.kept = { ...(r.kept || {}), [k]: d.figures[k] }; continue; }
    const src = (r.held && r.held[k] && r.held[k].source) || {};
    d.figures[k] = value;
    d.sources[k] = { ...src, alts: src.alts || [], orig: value, hand: false, confidence: 'medium', check: 'resolved', ...(how ? { fix: how } : {}) };
    applied.push(k);
  }
  r.applied = !heldFields(r).length;
  return { applied, waiting };
}

/** A figure's source in words: "Actual 2025 · p.4 · high", for the badge under its label. */
export function basisText(s) {
  if (!s || s.hand || !s.page) return '';
  const conf = s.check === 'resolved' ? 'checked by you' : s.confidence || 'medium';
  return `${s.col ? `${s.col} · ` : ''}p.${s.page} · ${conf}`;
}

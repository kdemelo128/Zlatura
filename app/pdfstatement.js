/* Annual totals and complete monthly actual PDF statements: positioned tables adapted to the shared T-12 engine.
 * Pure. Column/period/currency/number-format ambiguity holds the import for a broker choice.
 * Designs: docs/proposals/pdf-statement-and-pm-roll-next.md and monthly-pdf-actuals-implementation.md. */
import { statementTables } from './omstatement.js';
import { importStatement, matchLabel, numberFormatOf, amountOf, monthOf } from './t12.js';
import { toCents } from './engine/money.js';
import { scaleOf } from './scale.js';
const MODEL = /\b(?:annuali[sz]ed|stabili[sz]ed|budget|forecast|pro[ -]?forma|projected|projection|per\s+(?:unit|sf)|year\s+\d)\b|%/i;
const FULL_YEAR = /\bannual\b|\b(?:year|twelve months|12 months)\s+end(?:ed|ing)\b/i;
const PARTIAL = /\bYTD\b|year[ -]to[ -]date|\b(?:[1-9]|1[01])\s+months?\s+end(?:ed|ing)\b/i;
const rowType = (label) => /income|revenue|rent|expenses?|taxes|insurance|\bNOI\b|\bEGI\b/i.test(label) || !!matchLabel(label, { suggest: false }).category;

const localMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthHeading = (label) => String(label).replace(/^actuals?\s*(?:[·:]\s*)?/i, '').trim();
const MONTH_NAME = /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?[\s\-/']*(?:19|20)\d{2}$/i;
/** Reuse monthOf, with stronger printed-evidence checks for the PDF adapter. */
function printedMonth(label) {
  const heading = monthHeading(label);
  const month = monthOf(heading)?.iso;
  if (!month || !/\b(?:19|20)\d{2}\b/.test(heading) || (/[a-z]/i.test(heading) && !MONTH_NAME.test(heading))) return null;
  // monthOf also accepts date headings; an impossible day is not source evidence.
  const day = /^\d{4}-\d{2}-(\d{2})$/.exec(heading)?.[1] || /^\d{1,2}\/(\d{1,2})\/\d{4}$/.exec(heading)?.[1];
  if (day) {
    const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, Number(day)));
    if (Number(day) < 1 || d.getUTCDate() !== Number(day)) return null;
  }
  return month;
}

/** First monthly slice: twelve complete, dated actual months on one page. */
function monthlyChoice(table, pages, { asOfMonth, modelDocument, tables = [] }) {
  const columns = table.columns.map((c) => ({ ...c, month: printedMonth(c.label) }));
  if (!columns.some((c) => c.month)) return null;
  const months = columns.filter((c) => c.month);
  const other = columns.filter((c) => !c.month);
  const total = other.length === 1 && /^(?:total|ttm|t-?12|trailing (?:12|twelve)(?: months?)?)$/i.test(monthHeading(other[0].label)) ? other[0] : null;
  const context = [table.title, ...table.header].join(' ');
  const ordinal = (m) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
  const body = table.rows.filter((r) => !r.heading);
  let why = null;
  // The TABLE must sit on one page: a cover page, a notes page or a disclaimer page around it is fine; another page that holds
  // more statement rows, or says it continues the statement, means the months are split across pages.
  const split = tables.some((t) => t.page !== table.page) || pages.some((p, i) => i !== table.page - 1 && /\bcontinu(?:ed|ation)\b/i.test(p));
  if (split) why = 'This monthly PDF reader needs all twelve actual months on one page; split-page statements stay held.';
  else if (modelDocument || MODEL.test(context) || !/\bactuals?\b/i.test(context)) why = 'The monthly table must explicitly identify source actuals, separate from budgets, projections and model output.';
  else if (PARTIAL.test(context)) why = 'The printed period conflicts with twelve complete months; a partial or YTD heading needs review.';
  else if (months.length !== 12 || months.some((c, i) => !/\b(?:19|20)\d{2}\b/.test(c.label) || (i > 0 && ordinal(c.month) !== ordinal(months[i - 1].month) + 1))) why = 'Twelve consecutive, distinct months with explicit years are required; missing, duplicate or unclear months stay held.';
  else if (months.some((c) => c.month >= asOfMonth)) why = 'A current or future month is not a completed actual period.';
  else if (other.length !== (total ? 1 : 0)) why = 'Other financial columns need review; this monthly slice reads twelve actual months and an optional total only.';
  else if (/[€£¥₹]|\b(?:EUR|GBP|CAD|AUD|JPY)\b/i.test(pages.join('\n'))) why = 'Confirm the currency; these figures are not identified as USD.';
  const use = [...months, ...(total ? [total] : [])];
  const scales = new Set(String(pages[table.page - 1] || '').split('\n').map((s) => scaleOf(s).scale).filter((s) => s !== 1));
  if (!why && (scales.size > 1 || (table.scale !== 1 && body.some((r) => use.some((c) => r.cells[c.idx]?.suffix))))) why = 'Conflicting table or cell units need confirmation; these amounts were not scaled.';
  if (!why && table.rows.some((r) => r.heading && !/^(?:operating )?(?:income|expenses?|revenue)$/i.test(r.label.trim()) && matchLabel(r.label, { suggest: false }).category)) why = 'A line item has no amount; it is held, not read as zero.';
  if (!why && body.some((r) => r.ambiguous || use.some((c) => !r.cells[c.idx] || r.cells[c.idx].dash || r.cells[c.idx].pct))) why = 'A monthly amount is blank, a dash, a percentage or ambiguous; it is held, not read as zero.';
  const labels = body.map((r) => r.label).join('\n');
  if (!why && (!/net operating income|\bNOI\b/i.test(labels) || !/total.*expenses|operating expenses/i.test(labels))) why = 'The complete operating statement totals were not found.';
  const rows = [{ r: 0, cells: ['Monthly actual operating statement'] }, { r: 1, cells: ['Line', ...months.map((c) => c.month), ...(total ? ['Total'] : [])] }, ...table.rows.map((r, i) => ({ r: i + 2, cells: [r.label, ...use.map((c) => r.heading ? null : r.cells[c.idx] && !r.cells[c.idx].dash ? (r.cells[c.idx].suffix ? r.cells[c.idx].value : r.cells[c.idx].text) : null)] }))];
  const number = numberFormatOf(rows, { head: { row: { r: 1 } }, monthCols: months.map((c, i) => ({ c: i + 1, iso: c.month })), totalCol: total ? months.length + 1 : null }, { delimiter: ';' });
  if (!why && number.foreign) why = 'Confirm the currency; it is not USD.';
  return { id: `${table.id}:months`, basis: 'monthly', page: table.page, year: null, months: months.map((c) => c.month), label: 'T-12 actual months', why, eligible: !why, rows, number, scale: table.scale };
}

/** Candidates retain page/period evidence. Only explicit annual totals or twelve completed dated actual months are eligible. */
export function pdfStatementChoices(pages, { layouts = null, asOfYear = new Date().getFullYear(), asOfMonth = localMonth() } = {}) {
  const modelDocument = /^\s*(?:underwriting|valuation|pricing|investment)[^\n]*(?:model|summary|output|projection)/im.test(String(pages[0] || '').split('\n').slice(0, 6).join('\n'));
  const tables = statementTables(pages, { layouts, asOfYear, isStatementRow: rowType });
  return tables.flatMap((table) => {
    const monthly = monthlyChoice(table, pages, { asOfMonth, modelDocument, tables });
    const annual = table.columns.map((column) => {
      const context = [table.title, ...table.header].join(' ');
      const years = [...new Set(context.match(/\b(?:19|20)\d{2}\b/g) || [])];
      const year = column.year || (years.length === 1 ? Number(years[0]) : null);
      let why = null;
      if (MODEL.test(column.label) || !['actual', 'total'].includes(column.kind) || column.unrecognised) why = 'This column is not an explicit actual total.';
      else if (column.kind === 'total' && table.columns.filter((c) => !['unit', 'psf', 'pct'].includes(c.kind)).length !== 1) why = 'A Total beside other financial columns has no explicit actual basis; choose the labelled actual column.';
      else if (modelDocument || MODEL.test(table.title)) why = 'This table is model output, not source actuals.';
      // This first adapter admits completed prior-year totals only. A current-year
      // "Actual" heading alone cannot establish that its full reporting period ended.
      else if (!year || year >= asOfYear || !FULL_YEAR.test(context) || PARTIAL.test(context)) why = 'Confirm a completed prior-year actual period; a current, future, partial or unclear period stays held.';
      else if (/[€£¥₹]|\b(?:EUR|GBP|CAD|AUD|JPY)\b/i.test(context + ' ' + table.rows.map((r) => r.lineText).join(' '))) why = 'Confirm the currency; these figures are not identified as USD.';
      const body = table.rows.filter((r) => !r.heading);
      const printedScales = new Set(String(pages[table.page - 1] || '').split('\n').map((line) => scaleOf(line).scale).filter((scale) => scale !== 1));
      if (!why && (printedScales.size > 1 || (table.scale !== 1 && body.some((r) => r.cells[column.idx]?.suffix)))) why = 'Conflicting table or cell units need confirmation; these amounts were not scaled.';
      if (!why && table.rows.some((r) => r.heading && !/^(?:operating )?(?:income|expenses?|revenue)$/i.test(r.label.trim()) && matchLabel(r.label, { suggest: false }).category)) why = 'A line item has no amount; it is held, not read as zero.';
      if (!why && body.some((r) => r.ambiguous || !r.cells[column.idx] || r.cells[column.idx].dash || r.cells[column.idx].pct)) why = 'A line has a blank, dash, percentage or ambiguous column; it is held, not read as zero.';
      const labels = body.map((r) => r.label).join('\n');
      if (!why && (!/net operating income|\bNOI\b/i.test(labels) || !/total.*expenses|operating expenses/i.test(labels))) why = 'The complete operating statement totals were not found.';
      const rows = [{ r: 0, cells: [`Year ended ${year || ''}`, null] }, { r: 1, cells: ['Line', 'Total'] }, ...table.rows.map((r, i) => ({ r: i + 2, cells: [r.label, r.heading ? null : r.cells[column.idx] && !r.cells[column.idx].dash ? (r.cells[column.idx].suffix ? r.cells[column.idx].value : r.cells[column.idx].text) : null] }))];
      const number = numberFormatOf(rows, { head: { row: { r: 1 } }, monthCols: [], totalCol: 1 }, { delimiter: ';' });
      if (!why && number.foreign) why = 'Confirm the currency; it is not USD.';
      return { id: `${table.id}:${column.idx}`, basis: 'annual', months: [], page: table.page, year, label: column.label || 'Total', why, eligible: !why, rows, number, scale: table.scale };
    });
    // A monthly comparison must not hide a separate, explicitly annual actual
    // column that the annual adapter already accepts. The monthly columns
    // themselves never become annual totals.
    return monthly ? [monthly, ...annual.filter((c, i) => c.eligible && !monthOf(monthHeading(table.columns[i].label)))] : annual;
  });
}

/** Use only the approved eligible column, through the existing statement/sign/category/QC engine. */
export function statementFromPdfChoice(choice, { file = '', size = undefined, corrections = {}, history = {}, now = Date.now(), numberFormat = null } = {}) {
  if (!choice?.eligible) throw new Error(choice?.why || 'Choose an eligible actual statement.');
  const format = numberFormat || choice.number.format;
  if (!format) throw new Error('Choose how the numbers are written before importing.');
  const rows = choice.rows.map((r) => {
    if (r.r <= 1 || r.cells[1] == null) return r;
    if (choice.basis === 'monthly') return { ...r, cells: r.cells.map((cell, i) => {
      if (i === 0 || cell == null) return cell;
      const amount = amountOf(cell, format);
      if (!Number.isFinite(amount)) throw new Error('A monthly amount cannot be read; nothing was imported.');
      return toCents(amount * choice.scale);
    }) };
    const amount = amountOf(r.cells[1], format);
    if (!Number.isFinite(amount)) throw new Error('A line amount cannot be read; nothing was imported.');
    return { ...r, cells: [r.cells[0], toCents(amount * choice.scale)] };
  });
  const sheet = choice.basis === 'monthly' ? `PDF page ${choice.page} · actual months ${choice.months[0]} to ${choice.months.at(-1)}` : `PDF page ${choice.page} · ${choice.label} · year ended ${choice.year}`;
  return importStatement(rows, { file, sheet, corrections, history, now, numberFormat: format, source: { type: 'pdf', size, ...(choice.number.ask ? { numberAsked: true } : {}) } });
}

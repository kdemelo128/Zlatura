/* Annual actual PDF statements: positioned tables adapted to the shared T-12 engine.
 * Pure. Column/period/currency/number-format ambiguity holds the import for a broker choice.
 * Design and owner approval: docs/proposals/pdf-statement-and-pm-roll-next.md. */
import { statementTables } from './omstatement.js';
import { importStatement, matchLabel, numberFormatOf, amountOf } from './t12.js';
import { toCents } from './engine/money.js';
import { scaleOf } from './scale.js';
const MODEL = /\b(?:annuali[sz]ed|stabili[sz]ed|budget|forecast|pro[ -]?forma|projected|projection|per\s+(?:unit|sf)|year\s+\d)\b|%/i;
const FULL_YEAR = /\bannual\b|\b(?:year|twelve months|12 months)\s+end(?:ed|ing)\b/i;
const PARTIAL = /\bYTD\b|year[ -]to[ -]date|\b(?:[1-9]|1[01])\s+months?\s+end(?:ed|ing)\b/i;
const rowType = (label) => /income|revenue|rent|expenses?|taxes|insurance|\bNOI\b|\bEGI\b/i.test(label) || !!matchLabel(label, { suggest: false }).category;

/** Candidates retain the original column label/page. Only complete, explicit annual actuals are eligible. */
export function pdfStatementChoices(pages, { layouts = null, asOfYear = new Date().getFullYear() } = {}) {
  const modelDocument = /^\s*(?:underwriting|valuation|pricing|investment)[^\n]*(?:model|summary|output|projection)/im.test(String(pages[0] || '').split('\n').slice(0, 6).join('\n'));
  const tables = statementTables(pages, { layouts, asOfYear, isStatementRow: rowType });
  return tables.flatMap((table) => table.columns.map((column) => {
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
    return { id: `${table.id}:${column.idx}`, page: table.page, year, label: column.label || 'Total', why, eligible: !why, rows, number, scale: table.scale };
  }));
}

/** Use only the approved eligible column, through the existing statement/sign/category/QC engine. */
export function statementFromPdfChoice(choice, { file = '', size = undefined, corrections = {}, history = {}, now = Date.now(), numberFormat = null } = {}) {
  if (!choice?.eligible) throw new Error(choice?.why || 'Choose an eligible annual actual column.');
  const format = numberFormat || choice.number.format;
  if (!format) throw new Error('Choose how the numbers are written before importing.');
  const rows = choice.rows.map((r) => {
    if (r.r <= 1 || r.cells[1] == null) return r;
    const amount = amountOf(r.cells[1], format);
    if (!Number.isFinite(amount)) throw new Error('A line amount cannot be read; nothing was imported.');
    return { ...r, cells: [r.cells[0], toCents(amount * choice.scale)] };
  });
  return importStatement(rows, { file, sheet: `PDF page ${choice.page} · ${choice.label} · year ended ${choice.year}`, corrections, history, now, numberFormat: format, source: { type: 'pdf', size, ...(choice.number.ask ? { numberAsked: true } : {}) } });
}

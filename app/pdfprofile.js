/* Transient page evidence shared by readers; no stored values or financial calculations. */
import { rentRoll as readRoll } from './omroll.js';
import { statementTables } from './omstatement.js';
import { matchLabel } from './t12.js';

const ROLL_TITLE = /rent[\s-]*roll|tenant (?:roster|schedule)|tenancy schedule|lease schedule/i;
const SUMMARY_TITLE = /^(?:rent[\s-]*roll summary|occupancy summary|financial summary|table of contents|summary\b|recap\b)/im;
const MODEL_TITLE = /^(?:[^\n]{0,60})(?:underwriting model|model output|pro[ -]?forma|projection|budget)\b/im;
const financialRow = (label) => /income|revenue|expenses?|taxes|insurance|\bNOI\b|\bEGI\b/i.test(label) || !!matchLabel(label, { suggest: false }).category;
const attempt = (f) => { try { return f(); } catch { return null; } };

/** Each page is described by parsed tables, with title hints kept separate from evidence. */
export function pdfPageProfiles(pages, { layouts = null, roll = undefined, tables = null, asOfYear = new Date().getFullYear() } = {}) {
  const whole = roll === undefined ? attempt(() => readRoll(pages, { layouts })) : roll;
  const statements = tables || attempt(() => statementTables(pages, { layouts, asOfYear, isStatementRow: financialRow })) || [];
  return pages.map((text, i) => {
    const page = i + 1;
    const head = String(text || '').split('\n').filter((s) => s.trim()).slice(0, 6).join('\n');
    const chars = String(text || '').replace(/\s/g, '').length;
    const fromWhole = (whole?.rows || []).filter((r) => r.src?.page === page);
    // A differently headed table can be omitted by the whole-document best-table
    // choice. Inspect it locally for classification only; never merge its money.
    const local = !fromWhole.length && /tenant|resident|lessee|suite|\bunit\b/i.test(String(text)) ? attempt(() => readRoll([text], { layouts: layouts ? [layouts[i]] : null })) : null;
    const rows = fromWhole.length ? fromWhole : local?.rows || [];
    const columns = fromWhole.length ? whole?.columns || [] : local?.columns || [];
    const kinds = new Set(columns.map((c) => c.kind));
    const summary = SUMMARY_TITLE.test(head);
    const modeled = MODEL_TITLE.test(head);
    const rentroll = rows.length > 0 && (kinds.has('tenant') || kinds.has('suite')) && ['annual', 'monthly', 'rent', 'psf', 'mpsf'].some((k) => kinds.has(k)) && !(summary && rows.every((r) => !r.suite && !r.start && !r.end));
    const st = statements.filter((t) => t.page === page && t.rows.some((r) => /net operating income|\bNOI\b|total.*expenses|operating expenses/i.test(r.label)));
    const roles = [];
    if (rentroll) roles.push('rentroll');
    if (st.length) roles.push('statement');
    if (summary) roles.push('summary');
    if (!roles.length) roles.push(chars < 10 ? 'unreadable' : 'other');
    return { page, kind: roles.length === 1 ? roles[0] : 'mixed', roles, chars,
      rentRollRows: rentroll ? rows.length : 0, statementTables: st.length,
      rentRollTitle: ROLL_TITLE.test(head), modeled, needsOcr: chars < 10,
      reasons: [rentroll ? 'rentroll-table' : null, st.length ? 'statement-table' : null, summary ? 'summary-heading' : null, chars < 10 ? 'no-readable-text' : null].filter(Boolean) };
  });
}

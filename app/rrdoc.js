/* rrdoc.js -- a PDF that is a rent roll on its own (a due-diligence rent roll from a property manager, say), not an OM.
 *
 * Pure: pages of text (and their layouts) in, what the document is and a Data QC record out. The table itself is read
 * by omroll.js, exactly as an OM's is; this module decides whether the document is a rent roll at all (and says so
 * in words, never guesses), and adds the checks a document with no OM around it needs: a column that looks like
 * charges or fees must not be read as rent. Nothing is stored: the preview (rentrollui.js) holds the record until the
 * broker approves it. Design: docs/proposals/rentroll-pdf-and-om-fill.md, section (c). */

import { rentRoll } from './omroll.js';
import { omRollRecord } from './rentroll.js';

const ROLL_TITLE = /rent roll|tenant ledger|tenancy schedule|rent schedule|tenant roster|lease schedule|tenant schedule/i;
const AS_OF = /\bas of:?\s*(?:\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]+\.? \d{1,2},? \d{4})/i;
const OM_WORDS = [/offering memorandum/i, /asking price/i, /cap(?:italization)? rate/i, /investment (?:highlights|summary|overview)/i, /executive summary/i, /confidentiality (?:agreement|notice)/i];
const T12_TITLE = /income statement|profit (?:and|&) loss|operating statement|\bt-?12\b|trailing (?:12|twelve)/i;
const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b\.?/gi;

/** A line naming six or more different months: the column heads of a statement, not a rent roll. */
function monthLine(pages) {
  for (const p of pages.slice(0, 3)) {
    for (const line of String(p).split('\n')) {
      const seen = new Set((line.match(MONTH) || []).map((m) => m.slice(0, 3).toLowerCase()));
      if (seen.size >= 6) return true;
    }
  }
  return false;
}

/**
 * What a document is, from its content: { kind: 'rentroll' | 'om' | 't12' | 'scanned' | 'unknown', why: string[], roll }.
 * 'rentroll' needs a rent roll table AND a rent roll title or an "As of" date on the first two pages, and no OM
 * wording. Both rent roll and OM signals answer 'om'. `roll` is the table omroll.js found, if any, so a person who
 * says "it is a rent roll" can read it anyway.
 */
export function docKind(pages, layouts = null) {
  const text = pages.join('\n');
  if (text.replace(/\s/g, '').length < 200) return { kind: 'scanned', why: ['The PDF has almost no text: it is a scan or a picture.'], roll: null };
  const head = pages.slice(0, 2).join('\n');
  let roll = null;
  try { roll = rentRoll(pages, { layouts }); } catch { roll = null; }
  const om = OM_WORDS.filter((re) => re.test(text)).length >= 2;
  const titled = ROLL_TITLE.test(head) || AS_OF.test(head);
  const scopeChecks = roll ? reportScopeChecks(pages, roll) : [];
  if (om) return { kind: 'om', why: ['It reads like an offering memorandum (asking price, cap rate or investment summary wording).'], roll, scopeChecks };
  if (roll && titled) return { kind: 'rentroll', why: [`A rent roll table of ${roll.rows.length} rows${ROLL_TITLE.test(head) ? ', titled as one' : ', with an “As of” date'}.`], roll, scopeChecks };
  if (T12_TITLE.test(head) || monthLine(pages)) return { kind: 't12', why: ['It reads like an operating statement (month columns or a statement title).'], roll, scopeChecks };
  return { kind: 'unknown', why: [roll ? 'There is a table that looks like a rent roll, but nothing on the first two pages says this is one.' : 'No rent roll table was found.'], roll, scopeChecks };
}

const ALL_UNITS = /^(?:all|any|unfiltered|not applied)(?:\s+(?:units?|tenants?|residents?|statuses))?[.!]?$/i;
const FILTER_FIELD = /\b(property|unit|tenant|resident|occupancy|status)\s+filter\s*:/gi;
const SUBSET = '(?:only\\s+(?:a\\s+)?subset\\s+of\\s+(?:(?:the|selected)\\s+)?(?:units?|tenants?|residents?)|(?:a\\s+)?subset\\s+of\\s+(?:the\\s+)?(?:units?|tenants?|residents?)|selected\\s+(?:units?|tenants?|residents?)\\s+only|(?:occupied|vacant)\\s+units?\\s+only|only\\s+(?:occupied|vacant)\\s+units?|exclud(?:es|ing)\\s+(?:all\\s+)?vacant\\s+units?)';
const SCOPE_NOTICE = new RegExp(`^[ \\t]*(?:(?:this\\s+report|this\\s+rent\\s+roll)\\s+(?:lists|includes|contains|shows|covers)\\s+|report\\s+(?:scope|coverage)\\s*:\\s*)${SUBSET}[.!]?[ \\t]*(?=\\n|$)`, 'gim');

/** Parsed text rolls only: inspect filter headers and explicit report-scope notices,
 * never classify arbitrary tenant cells or subtotal prose as coverage metadata.
 * These checks are transient; pdfRollRecord makes fresh acceptance state per preview. */
function reportScopeChecks(pages, roll) {
  const starts = new Map();
  const bodies = new Map();
  for (const r of roll.rows || []) {
    const spans = new Map();
    for (const c of [r.src, ...Object.values(r.src?.cells || {})]) {
      const { page, line } = c || {};
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(line) || line < 1) continue;
      const span = spans.get(page) || { from: line, to: line };
      span.from = Math.min(span.from, line); span.to = Math.max(span.to, line); spans.set(page, span);
    }
    for (const [page, span] of spans) {
      starts.set(page, Math.min(starts.get(page) || Infinity, span.from));
      if (!bodies.has(page)) bodies.set(page, []);
      bodies.get(page).push(span);
    }
  }
  if (!starts.size) return [];
  const first = Math.min(...starts.keys());
  for (let pi = 0; pi < pages.length; pi += 1) {
    const lines = String(pages[pi] || '').split('\n');
    const header = pi + 1 > first && !starts.has(pi + 1) ? [] : lines.slice(0, starts.has(pi + 1) ? starts.get(pi + 1) - 1 : lines.length);
    let found = null;
    for (let li = 0; li < header.length && !found; li += 1) {
      const text = header[li].trim();
      const fields = [...text.matchAll(FILTER_FIELD)];
      if (!fields.length || fields[0].index !== 0) continue;
      for (let fi = 0; fi < fields.length; fi += 1) {
        const f = fields[fi];
        if (f[1].toLowerCase() === 'property') continue;
        const value = text.slice(f.index + f[0].length, fields[fi + 1]?.index ?? text.length).replace(/[;|]+\s*$/, '').trim();
        if (!ALL_UNITS.test(value)) { found = { line: li + 1, text }; break; }
      }
    }
    if (!found) {
      // A report may print its explicit scope notice in a footer or on a cover.
      const text = lines.join('\n');
      const match = [...text.matchAll(SCOPE_NOTICE)].find((m) => {
        const from = text.slice(0, m.index).split('\n').length;
        const to = from + m[0].split('\n').length - 1;
        return !(bodies.get(pi + 1) || []).some((span) => from <= span.to && to >= span.from);
      });
      if (match) found = { line: text.slice(0, match.index).split('\n').length, text: match[0].trim() };
    }
    if (found) return [{ id: 'layout:report-scope', kind: 'layout', level: 'fail', page: pi + 1, line: found.line, row: null, col: null,
      colLabel: 'Report coverage', cell: { text: found.text }, lineText: found.text, amount: 0,
      text: 'This report shows a unit/resident filter or a subset notice. Its coverage needs review: it must not silently replace a complete rent roll. Obtain the full report or explicitly accept this check before using these rows.' }];
  }
  return [];
}

const CHARGE_WORD = /\b(?:charges?|fees?|cam|reimb\w*|escrow)\b/i;
const MONEY_UNKNOWN = /\b(?:charges?|fees?|due|balance|amount|total|cam|nnn|escrow|taxes|insurance)\b|\$/i;
const NOT_RENT = /\b(?:past due|balance|delinquen\w*|arrears|prepaid)\b/i;
const RENT_WORD = /\b(?:rent|rental|base|contract|in[- ]place|current|lease rate)\b/i;

/**
 * The checks a rent roll with no OM around it needs, as failed Data QC checks (the preview will not apply the
 * roll until each is resolved or accepted): a rent column that reads as charges or fees; a rent-kind column that
 * competes with a bare "Rent" column and says nothing of rent itself; a column the reader does not know whose
 * heading looks like money. Until a profile for that report's layout exists, these keep a misread from being used.
 */
export function layoutChecks(roll) {
  const out = [];
  const cols = roll.columns || [];
  const bareRent = cols.some((c) => c.kind === 'rent');
  // a rent reading that already failed as a competing column is not failed a second time
  const competes = (c) => (roll.issues || []).some((i) => i.kind === 'compete' && i.level === 'fail' && (i.cols || []).includes(cols.indexOf(c)));
  cols.forEach((c, idx) => {
    const base = { kind: 'layout', level: 'fail', page: roll.page || null, line: null, row: null, col: idx, colLabel: c.label, cell: { text: c.label }, lineText: c.label, amount: 0 };
    const rentKind = ['annual', 'monthly', 'rent', 'psf', 'mpsf'].includes(c.kind);
    if (rentKind && CHARGE_WORD.test(c.label)) {
      out.push({ ...base, id: `layout:${idx}`, text: `The “${c.label}” column was read as rent, but its heading says charges or fees. Charges are not rent: check it against the page before using this rent roll.` });
    } else if (c.kind === 'other' && NOT_RENT.test(c.label)) {
      out.push({ ...base, level: 'info', id: `layout:${idx}`, text: `The “${c.label}” column is a balance, not rent, and is not used.` });
    } else if (bareRent && !competes(c) && ['annual', 'monthly', 'psf', 'mpsf'].includes(c.kind) && !RENT_WORD.test(c.label)) {
      out.push({ ...base, id: `layout:${idx}`, text: `This rent roll has a “Rent” column and a “${c.label}” column that was also read as rent. The reader cannot tell which is the rent: check the page before using it.` });
    } else if (c.kind === 'other' && MONEY_UNKNOWN.test(c.label)) {
      out.push({ ...base, id: `layout:${idx}`, text: `The “${c.label}” column looks like money, and this reader does not know what it is, so this layout is not recognised. Check the page before using this rent roll.` });
    }
  });
  return out;
}

/**
 * The Data QC record for a rent roll PDF, in the shape an OM's is (rentroll.js omRollRecord), with no OM figures to
 * compare against (so the roll is never checked against itself) and the layout checks added. A failed check holds
 * the rows back: they stay in `qc.held` until the broker resolves or accepts every fail.
 * @returns {{ qc: any, rows: any[], held: boolean }} rows: those that may be used now; held: whether a fail holds them
 */
export function pdfRollRecord(doc, { asOf = null, file = '', scanned = [] } = {}) {
  const roll = doc.roll;
  const { qc, rows } = omRollRecord({ rentRoll: roll, scanned }, { figures: {}, sources: {}, asOf, file });
  if (!roll) return { qc, rows: [], held: false };
  const extra = [...layoutChecks(roll), ...(doc.scopeChecks || []).map((c) => ({ ...c, cell: c.cell ? { ...c.cell } : null }))];
  const holds = extra.some((c) => c.level === 'fail');
  const all = rows.length ? rows : (qc.held || []);
  qc.checks.push(...extra);
  if (holds) {
    qc.held = all;
    qc.applied = false;
    return { qc, rows: [], held: true };
  }
  return { qc, rows, held: !rows.length && !!qc.held };
}

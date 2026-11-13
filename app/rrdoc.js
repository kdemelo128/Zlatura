/* rrdoc.js -- a PDF that is a rent roll on its own (a due-diligence rent roll from a property manager, say), not an OM.
 *
 * Pure: pages of text (and their layouts) in, what the document is and a Data QC record out. The table itself is read
 * by omroll.js, exactly as an OM's is; this module decides whether the document is a rent roll at all (and says so
 * in words, never guesses), and adds the checks a document with no OM around it needs: a column that looks like
 * charges or fees must not be read as rent. Nothing is stored: the preview (rentrollui.js) holds the record until the
 * broker approves it. Design: docs/proposals/rentroll-pdf-and-om-fill.md, section (c). */

import { rentRoll } from './omroll.js';
import { READING_NAME } from './units.js';
import { omRollRecord } from './rentroll.js';
import { pagesAreScan } from './textlayer.js';
import { tableShape } from './tableshape.js';

export const ROLL_TITLE = /rent roll|tenant ledger|tenancy schedule|rent schedule|tenant roster|lease schedule|tenant schedule/i;
const AS_OF = /\bas of:?\s*(?:\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]+\.? \d{1,2},? \d{4})/i;
const OM_WORDS = [/offering memorandum/i, /asking price/i, /cap(?:italization)? rate/i, /investment (?:highlights|summary|overview)/i, /executive summary/i, /confidentiality (?:agreement|notice)/i];
export const T12_TITLE = /income statement|statement of operations|profit (?:and|&) (?:loss)|\bp ?& ?l\b|operating statement|\bt-?12\b|trailing (?:12|twelve)/i;
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
  if (pagesAreScan(pages)) return { kind: 'scanned', why: ['The PDF has almost no text: it is a scan or a picture.'], roll: null };
  const head = pages.slice(0, 2).join('\n');
  const { roll, summary, rowLines } = readRoll(pages, layouts, null);
  const om = OM_WORDS.filter((re) => re.test(text)).length >= 2;
  const titled = ROLL_TITLE.test(head) || AS_OF.test(head);
  // `src` lets the preview read the same pages again with the broker's answers (pdfRollRecord's `periods`)
  const out = (kind, why) => ({ kind, why, roll, summary, rowLines, src: { pages, layouts } });
  if (om) return out('om', ['It reads like an offering memorandum (asking price, cap rate or investment summary wording).']);
  // a table with a rent roll's columns that is a unit mix or a lease comparable table is neither a rent roll nor asked about as one
  const shape = roll ? tableShape((roll.columns || []).map((c) => c.label)) : null;
  if (shape) return { ...out('unknown', [shape === 'unitmix' ? 'The table is a unit mix (a count of units for each type), not a rent roll.' : 'The table is a list of lease comparables (an address, a size, a rate, a term and a start date), not a rent roll.']), shape };
  if (roll && titled) return out('rentroll', [`A rent roll table of ${roll.rows.length} rows${ROLL_TITLE.test(head) ? ', titled as one' : ', with an “As of” date'}.`]);
  if (T12_TITLE.test(head) || monthLine(pages)) return out('t12', ['It reads like an operating statement (month columns or a statement title).']);
  return out('unknown', [roll ? 'There is a table that looks like a rent roll, but nothing on the first two pages says this is one.' : 'No rent roll table was found.']);
}

const SUMMARY_TITLE = /\b(?:summary|recap|statistics|totals?)\b/i;
/**
 * The rent roll table, without a summary page's table. A page titled as a summary (occupancy by status, totals by
 * type) can hold a small table of its own whose rows are not units; read as a roll it would stand in for the real one
 * or count the same space twice. A page counts as a summary only when it is titled as one in its first lines AND no row
 * read from it has a suite or a lease date, AND its table's columns differ from the rest of the roll's (the same
 * columns mean more of the roll). `summary` lists { page, rows } for each page left out.
 */
function readRoll(pages, layouts, periods) {
  const rowLines = new Map(); // each row's own lines (omroll.js onRowLines): filterNotes never reads a table's wrapped cell as a heading
  const read = (pgs, lay) => { try { return rentRoll(pgs, { layouts: lay, ...(periods ? { periods } : {}), onRowLines: (row, lines) => rowLines.set(row, lines) }); } catch { return null; } };
  const cand = [];
  pages.forEach((p, i) => {
    const top = String(p).split('\n').filter((l) => l.trim()).slice(0, 4).join('\n');
    if (!SUMMARY_TITLE.test(top)) return;
    const only = read(pages.map((q, j) => (j === i ? q : '')), layouts && layouts.map((g, j) => (j === i ? g : null)));
    if (only && only.rows.every((r) => !r.suite && !r.start && !r.end)) cand.push({ page: i + 1, rows: only.rows.length, kinds: only.columns.map((c) => c.kind).join() });
  });
  const full = () => ({ roll: read(pages, layouts), summary: [], rowLines });
  if (!cand.length) return full();
  const without = (list) => read(pages.map((q, i) => (list.some((x) => x.page === i + 1) ? '' : q)), layouts && layouts.map((g, i) => (list.some((x) => x.page === i + 1) ? null : g)));
  const rest = without(cand);
  if (!rest) return full();
  // a page whose table has the same columns as the rest is more of the roll, not a summary of it
  const restKinds = rest.columns.map((c) => c.kind).join();
  const summary = cand.filter((x) => x.kinds !== restKinds);
  if (summary.length === cand.length) return { roll: rest, summary, rowLines };
  return summary.length ? { roll: without(summary) || read(pages, layouts), summary, rowLines } : full();
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
export function layoutChecks(roll, { pages = [], summary = [], periods = {}, rowLines = new Map() } = {}) {
  const out = [];
  const cols = roll.columns || [];
  const text = pages.join('\n');
  const colBase = (c, idx) => ({ kind: 'layout', level: 'fail', page: roll.page || null, line: null, row: null, col: idx, colLabel: c.label, cell: { text: c.label }, lineText: c.label, amount: 0 });
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
  // the checks below read the page's own words, so they need the pages (layoutChecks(roll) alone keeps the column rules)
  if (!pages.length) return out;
  // a rent column whose period the page never states is asked, not guessed (a figure that merely fits one reading is still a guess)
  cols.forEach((c, idx) => {
    if (!RENT_KIND_COLS.includes(c.kind)) return;
    if (periods[c.kind]) { out.push({ ...colBase(c, idx), level: 'info', id: `period:${idx}`, text: `You chose ${READING_NAME[periods[c.kind]]} for the “${c.label}” column: the page does not say.` }); return; }
    if (c.basis !== 'inferred' && c.basis !== 'ask') return;
    // a sentence that states the period settles it only when it says what the figures were read as; a different word is a question
    const said = (PERIOD_STATED.exec(text) || [])[1];
    const word = said && (/^month/i.test(said) || /per month/i.test(said) ? 'monthly' : 'annual');
    if (word && (c.reading === word || (word === 'monthly' && c.reading === 'mpsf') || (word === 'annual' && c.reading === 'psf'))) return;
    const family = ['psf', 'mpsf'].includes(c.reading) ? ['psf', 'mpsf'] : ['monthly', 'annual'];
    out.push({ ...colBase(c, idx), id: `period:${idx}`, periodKind: c.kind, choices: family,
      text: `Does the “${c.label}” column show ${family.map((r) => READING_NAME[r]).join(' or ')}? ${word ? `The page says ${word}, but the figures were read as ${READING_NAME[c.reading]}` : 'The page does not say'}. It looks like ${READING_NAME[c.reading]}, but that is a guess: choose one.` });
  });
  // charges, balances and market rent never stand in for base rent: with those columns beside it, a bare "Rent" must be called base or contract rent
  const rentCols = cols.filter((c) => RENT_KIND_COLS.includes(c.kind));
  const others = cols.some((c) => c.kind === 'recov' || c.kind === 'market' || (c.kind === 'other' && (CHARGE_WORD.test(c.label) || NOT_RENT.test(c.label))));
  if (!rentCols.length) {
    out.push({ ...colBase({ label: 'Rent' }, null), level: 'warn', id: 'norent', col: null, colLabel: '', cell: null, lineText: '', text: 'No column is labelled base or contract rent, so rent is left blank. Charges, balances and market rent are not used in its place.' });
  } else if (others && !(roll.issues || []).some((i) => i.kind === 'compete' && i.level === 'fail')) {
    cols.forEach((c, idx) => {
      if (!RENT_KIND_COLS.includes(c.kind) || BASE_LABEL.test(c.label) || BASE_STATED.test(text) || CHARGE_WORD.test(c.label)) return;
      out.push({ ...colBase(c, idx), id: `basis:${idx}`, text: `Is the “${c.label}” column the base (contract) rent? This report also prints charges, balances or market rent, and the “${c.label}” heading does not say which it is. Only a base or contract rent column fills rent.` });
    });
  }
  // a summary page's table is not units: said, so a missing row is not a surprise
  for (const { page: p, rows: n } of summary) out.push({ kind: 'layout', level: 'warn', id: `summary:${p}`, page: p, line: null, row: null, col: null, colLabel: '', cell: null, lineText: '', amount: 0, text: `Page ${p} is a summary: its table was not read as units, so no row is counted twice. ${n} row${n === 1 ? ' was' : 's were'} left out; if any of them is a unit, check the page.` });
  // a report that says it is filtered is a part of the roll: held until the broker says it may stand
  for (const f of filterNotes(pages, rowLines)) out.push({ kind: 'subset', level: 'fail', id: `subset:${f.page}:${f.line}`, page: f.page, line: f.line, row: null, col: null, colLabel: '', cell: { text: f.text }, lineText: f.text, amount: 0,
    text: `Page ${f.page} says this report is filtered (“${f.text}”). It may be only some of the units, so it is not the full rent roll. Review the rows; to use them, confirm this is the roll you mean, and replacing a rent roll you already have needs a second confirmation.` });
  return out;
}

const RENT_KIND_COLS = ['annual', 'monthly', 'rent', 'psf', 'mpsf'];
// a sentence about the figures, not a column heading: "Rent is the contractual monthly rent"
const PERIOD_STATED = /\b(?:rents?|amounts?|figures?)\s+(?:is|are|shown|stated|reported|listed|quoted)\b[^\n.;]{0,40}\b(monthly|annual(?:ly)?|per month|per year)\b/i;
const BASE_STATED = /\brents?\s+(?:is|are)\b[^\n.;]{0,30}\b(?:contract\w*|base|in[- ]place)\b/i;
const BASE_LABEL = /\b(?:base|contract\w*|in[- ]place|scheduled|current|actual|lease rate)\b/i;
const FILTER_ALL = /^(?:all(?:\s+\w+)?|none|n\/a|any|no filters?|\(all\)|-+|—)$/i;
const FILTER_WORDS = /\b(?:filtered|subset)\b|\b(?:partial (?:list|report|rent roll)|selected (?:units|tenants) only|not all (?:units|tenants)|(?:current|occupied|vacant|active|expired|notice|future) (?:units|tenants|leases) only|only (?:current|occupied|vacant|active) (?:units|tenants|leases)|showing \d+ of \d+)\b/i;
/**
 * Lines that say the report is a filtered view: "Status Filter: Current" (every filter line is judged on its own, so a
 * "Unit Filter: All" beside it does not clear it), a bare "Status: Current" header line, or words such as "filtered".
 * `rowLines` (omroll.js onRowLines: row -> the lines it was read from) are the table's own lines, a name wrapped over
 * two lines among them: such a line is a tenant cell, never a heading, so it is skipped. Every other line is judged
 * as before (a footer, a heading above the table, a note between pages).
 * @param {string[]} pages
 * @param {Map<any, { page: number, line: number }[]>} [rowLines]
 * @returns {{ page: number, line: number, text: string }[]}
 */
export function filterNotes(pages, rowLines = new Map()) {
  const out = [];
  const own = new Set();
  for (const lines of rowLines.values()) for (const l of lines) own.add(`${l.page}:${l.line}`);
  pages.forEach((p, pi) => String(p).split('\n').forEach((raw, li) => {
    const line = raw.trim();
    if (!line || line.length > 200 || own.has(`${pi + 1}:${li + 1}`)) return;
    let hit = false;
    const re = /(?:^|\s)([A-Za-z]+(?: [A-Za-z]+)?)?\s*filters?(?:\s+applied)?\s*[:=]\s*(.+?)(?=\s+(?:[A-Za-z]+\s+)?filters?\s*[:=]|$)/gi;
    for (let m = re.exec(line); m; m = re.exec(line)) if (!FILTER_ALL.test(m[2].trim())) hit = true;
    const status = /^(?:tenant |lease |unit |occupancy )?status\s*[:=]\s*(.+)$/i.exec(line);
    if (status && !FILTER_ALL.test(status[1].trim())) hit = true;
    if (!/filters?\s*[:=]/i.test(line) && !/\b(?:not|un)\s*filtered\b/i.test(line) && FILTER_WORDS.test(line)) hit = true;
    if (hit) out.push({ page: pi + 1, line: li + 1, text: line.replace(/\s+/g, ' ').slice(0, 120) });
  }));
  return out;
}

/**
 * The Data QC record for a rent roll PDF, in the shape an OM's is (rentroll.js omRollRecord), with no OM figures to
 * compare against (so the roll is never checked against itself) and the layout checks added. A failed check holds
 * the rows back: they stay in `qc.held` until the broker resolves or accepts every fail.
 * @returns {{ qc: any, rows: any[], held: boolean, subset: boolean }} rows: those that may be used now; held: whether a fail holds
 * them; subset: the report says it is filtered (replacing a rent roll then needs a second confirmation)
 */
export function pdfRollRecord(doc, { asOf = null, file = '', scanned = [], periods = {} } = {}) {
  // the broker's answers re-read the same pages, so each row's rent follows the period chosen
  const reread = Object.keys(periods).length && doc.src ? readRoll(doc.src.pages, doc.src.layouts, periods) : null;
  const chosen = reread && reread.roll;
  const roll = chosen || doc.roll;
  const { qc, rows } = omRollRecord({ rentRoll: roll, scanned }, { figures: {}, sources: {}, asOf, file });
  if (!roll) return { qc, rows: [], held: false, subset: false };
  const extra = layoutChecks(roll, { pages: doc.src ? doc.src.pages : [], summary: doc.summary || [], periods: chosen ? periods : {}, rowLines: chosen ? reread.rowLines : doc.rowLines });
  // a rent column that is asked about is answered by a choice, not accepted as a guess: its plain accept-as-read fail goes
  for (const q of extra.filter((c) => c.choices)) qc.checks = qc.checks.filter((c) => !(c.kind === 'unit' && c.level === 'fail' && c.col === q.col));
  if (chosen) for (const r of [...rows, ...(qc.held || [])]) r.periodChosen = Object.values(periods)[0];
  const holds = extra.some((c) => c.level === 'fail');
  const subset = extra.some((c) => c.kind === 'subset');
  const all = rows.length ? rows : (qc.held || []);
  qc.checks.push(...extra);
  if (holds) {
    qc.held = all;
    qc.applied = false;
    return { qc, rows: [], held: true, subset };
  }
  return { qc, rows, held: !rows.length && !!qc.held, subset };
}

/** Re-accept checks after the pages are read again: only one whose id AND text are the same as when it was accepted (a changed reading is a new question). `accepted`: Map id -> text. */
export function reapplyAccepted(qc, accepted) {
  for (const c of qc.checks) if (accepted.has(c.id) && accepted.get(c.id) === c.text) c.resolved = { how: 'accepted', at: Date.now() };
}

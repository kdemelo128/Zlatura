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
  if (om) return { kind: 'om', why: ['It reads like an offering memorandum (asking price, cap rate or investment summary wording).'], roll };
  if (roll && titled) return { kind: 'rentroll', why: [`A rent roll table of ${roll.rows.length} rows${ROLL_TITLE.test(head) ? ', titled as one' : ', with an “As of” date'}.`], roll };
  if (T12_TITLE.test(head) || monthLine(pages)) return { kind: 't12', why: ['It reads like an operating statement (month columns or a statement title).'], roll };
  return { kind: 'unknown', why: [roll ? 'There is a table that looks like a rent roll, but nothing on the first two pages says this is one.' : 'No rent roll table was found.'], roll };
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
  const extra = layoutChecks(roll);
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

/* bridge.js -- the T-12 to pro forma bridge (master plan 7.9, PR B1: the logic).
 *
 * From the T-12's NOI (normalised: each line's method applied, a year) to the
 * OM's pro forma NOI, one step per NOI category, in whole cents. Lines are
 * matched by category, never by label and never forced: an OM line that is
 * only filed by its place in the table (`how: 'position'`) gets a row of its
 * own. Two residual rows keep the sum exact: the T-12's rounding, and the
 * OM's printed NOI against what its own lines add up to. So
 *
 *   start + every row = end, to the cent, for any statements.
 *
 * Pure: no DOM, nothing stored on the deal. The T-12 side is t12.js
 * `normalise`; the OM side is `om.statement.columns` (omstatement.js
 * `columnLines`, read in memory). No second copy of the money math: c100 and
 * fromC are t12.js's. Design: docs/proposals/ (7.9 design note). */

import { CATEGORIES, CATEGORY, c100, fromC, heldWords, openWords, partialWords, residueWords } from './t12.js';

/**
 * Where the bridge ends when the deal's pro forma NOI is not the OM's printed one (an edit, or another column chosen
 * in Data QC): 'printed' ends at the OM's figure and returns the deal's as a note (owner question 2, provisional);
 * 'deal' ends at the deal's figure, with a row for the difference.
 */
export const BRIDGE_ENDS_AT = 'printed';

const money = (c) => `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Why a column is not the one the deal's pro forma NOI was read from, or ''. A re-read PDF must match the one read. */
function columnRefusal(col, src) {
  if (col.table !== src.table) return `This PDF’s statement table (${col.table}) is not the one the pro forma NOI was read from (${src.table}).`;
  if (col.label !== src.col) return `This PDF’s column “${col.label}” is not the one the pro forma NOI was read from (“${src.col}”).`;
  if (col.noiPrinted && Number.isFinite(src.orig) && c100(col.noi) !== c100(src.orig)) return `This PDF prints a pro forma NOI of ${money(c100(col.noi))}, not the ${money(c100(src.orig))} that was read.`;
  return '';
}

/**
 * The column of the OM the deal's pro forma NOI was read from (same table and column label, same printed NOI):
 * { col, why }, `col` null with the reason in `why` when `columns` (`om.statement.columns`, from the session's read or
 * a PDF picked again) holds no such column. With a pro forma NOI not read from a table there is nothing to find ('').
 */
export function pfColumn(columns, deal) {
  const src = deal && deal.sources && deal.sources.noi_pf;
  if (!src || !src.table) return { col: null, why: '' };
  const col = (columns || []).find((c) => c.table === src.table && c.label === src.col);
  if (!col) return { col: null, why: `This PDF has no column “${src.col}” on statement table ${src.table}, the one the pro forma NOI was read from.` };
  const why = columnRefusal(col, src);
  return { col: why ? null : col, why };
}

const SIGN = { income: 1, expense: -1 };

/**
 * The bridge: { held, words, rows, start, end, notes, below }.
 *  - `held`: no numbers, `words` says why (normalise held, lines still open, a partial year with a line as reported
 *    (U2's guard), no pro forma NOI, or a PDF that is not the one read). `needsPdf`: the NOI was read from a table and
 *    no column was given (pick the OM's PDF); `refused`: the column given is not that one.
 *  - `start`, `end`: { label, c, amount }; `rows`: [{ key, tag, label, c, amount, words, lines: { t12, pf } }] in order:
 *    the T-12 rounding, a step per category (and per OM line that is not matched), "No change", the OM's printed NOI
 *    against its lines. Tags: both, pfOnly, t12Only, excluded, unmatched, nochange, round, printed, deal, whole.
 *  - `notes`: [{ kind, words }], `below`: the lines below the NOI line on each side, listed, with no step.
 * @param {any} t  the T-12 statement
 * @param {any} res  normalise(t)
 * @param {any} col  the OM's column (pfColumn), or null
 * @param {any} deal
 * @param {{ endsAt?: 'printed' | 'deal' }} [opts]
 */
export function pfBridge(t, res, col, deal, { endsAt = BRIDGE_ENDS_AT } = {}) {
  const below = { t12: /** @type {any[]} */ ([]), pf: /** @type {any[]} */ ([]) };
  const held = (words, extra = {}) => ({ held: true, words, rows: [], start: null, end: null, notes: [], below, ...extra });
  if (!res || !t) return held('There is no T-12 to bridge from.');
  if (res.held) return held(`Held: ${heldWords(t, res)}.`);
  const why = openWords(t, res) || partialWords(t, res);
  if (why) return held(why);
  const noi = deal && deal.figures ? deal.figures.noi_pf : null;
  if (!Number.isFinite(noi)) return held('The deal has no pro forma NOI to bridge to.');
  const dealC = c100(noi);
  const src = (deal.sources && deal.sources.noi_pf) || {};

  // the start: the T-12's NOI with every method applied; "a year" only once each NOI line has one
  const S = c100(res.normalised.noi);
  const start = { label: res.steps.length ? `T-12 NOI, normalised (a year${res.n < 12 ? `, from ${res.n} month${res.n === 1 ? '' : 's'}` : ''})` : `T-12 NOI (as reported, ${t.months.length} months)`, c: S, amount: fromC(S) };
  const out = (rows, endC, endLabel, notes = []) => ({ held: false, words: '', rows: rows.map((r) => ({ ...r, amount: fromC(r.c) })), start: { ...start, amount: fromC(S) }, end: { label: endLabel, c: endC, amount: fromC(endC) }, notes, below });

  if (!src.table) {
    // not read from a table: the whole difference, in one row
    return out([{ key: 'whole', tag: 'whole', label: 'Not broken down', c: dealC - S, words: 'The pro forma NOI was not read from a statement table, so there are no lines to compare.', lines: { t12: [], pf: [] } }], dealC, 'Pro forma NOI (the deal’s)');
  }
  if (!col) return held('The OM’s lines are needed: choose the OM’s PDF to compare.', { needsPdf: true });
  const refusal = columnRefusal(col, src);
  if (refusal) return held(refusal, { refused: true });

  // the T-12 side, by category (res.lines carry each line's amount with its method applied; one-offs are out, excluded are 0)
  const byId = new Map(t.lines.map((l) => [l.id, l]));
  /** @type {Record<string, { c: number, lines: any[] }>} */
  const tBy = {};
  for (const x of res.lines) {
    const l = byId.get(x.id);
    const cat = l && l.category && CATEGORY[l.category] ? l.category : null;
    if (!cat) continue;
    if (CATEGORY[cat].side === 'below') { below.t12.push({ label: l.label, category: cat, c: c100(l.total) }); continue; }
    const c = x.amount === null ? 0 : c100(x.amount);
    const e = (tBy[cat] ||= { c: 0, lines: [] });
    e.c += c;
    e.lines.push({ label: x.label, method: x.method, c, reportedC: c100(l.total) });
  }
  // the OM side: by category, except the lines filed only by their place in the table, which stay apart
  /** @type {Record<string, { c: number, lines: any[] }>} */
  const pBy = {};
  const loose = [];
  const pfLine = (l) => ({ label: l.label, c: l.c, how: l.how, page: col.page, line: l.line, cell: l.cell, scale: col.scale });
  for (const l of col.lines) {
    const cat = CATEGORY[l.category];
    if (!cat) continue;
    if (cat.side === 'below') { below.pf.push(pfLine(l)); continue; }
    if (l.how === 'position') { loose.push(l); continue; }
    const e = (pBy[l.category] ||= { c: 0, lines: [] });
    e.c += l.c;
    e.lines.push(pfLine(l));
  }

  const sum = (by, side) => CATEGORIES.filter((c) => c.side === side).reduce((s, c) => s + (by[c.id] ? by[c.id].c : 0), 0);
  const Lt = sum(tBy, 'income') - sum(tBy, 'expense');
  const looseC = loose.reduce((s, l) => s + SIGN[CATEGORY[l.category].side] * l.c, 0);
  const Lp = sum(pBy, 'income') - sum(pBy, 'expense') + looseC;
  const E = col.noi === null || col.noi === undefined ? Lp : c100(col.noi);

  const rows = [];
  if (Lt !== S) rows.push({ key: 'round', tag: 'round', label: 'T-12 rounding', c: Lt - S, words: residueWords(res) || 'Each method group is rounded once, so the lines as shown add up to a cent or two from the NOI.', lines: { t12: [], pf: [] } });
  const same = [];
  for (const cat of CATEGORIES) {
    if (cat.side === 'below') continue;
    const a = tBy[cat.id]; const b = pBy[cat.id];
    if (!a && !b) continue;
    const c = SIGN[cat.side] * ((b ? b.c : 0) - (a ? a.c : 0));
    const lines = { t12: a ? a.lines : [], pf: b ? b.lines : [] };
    const allOut = !!a && a.lines.every((x) => x.method === 'exclude');
    const tag = allOut ? 'excluded' : !a ? 'pfOnly' : !b ? 't12Only' : 'both';
    if (c === 0) { same.push({ label: cat.label, lines }); continue; }
    const taken = lines.pf.some((x) => x.how === 'stated');
    rows.push({ key: cat.id, tag, label: cat.label, c, lines, words: {
      pfOnly: 'Only in the pro forma.', excluded: 'Excluded in the T-12: every T-12 line in this category was set to Exclude.',
      t12Only: 'Only in the T-12: the OM prints no line in this category, and the amount may sit inside another line.', both: '',
    }[tag] + (taken ? ` The OM prints this side as one subtotal (fewer than three lines): it is used as printed, not broken down.` : '') });
  }
  for (const l of loose) {
    const side = CATEGORY[l.category].side;
    rows.push({ key: `line.${l.line}`, tag: 'unmatched', label: l.label, c: SIGN[side] * l.c, lines: { t12: [], pf: [pfLine(l)] },
      words: `Not matched: the OM’s “${l.label}” (line ${l.line}) fits none of the T-12’s categories, so it is kept apart, not merged into ${CATEGORY[l.category].label.toLowerCase()}.` });
  }
  if (same.length) rows.push({ key: 'nochange', tag: 'nochange', label: `No change (${same.length} categor${same.length === 1 ? 'y' : 'ies'})`, c: 0, lines: { t12: same.flatMap((x) => x.lines.t12), pf: same.flatMap((x) => x.lines.pf) }, words: same.map((x) => x.label).join(', ') });
  if (E !== Lp) rows.push({ key: 'printed', tag: 'printed', label: 'The OM’s printed NOI against its lines', c: E - Lp, lines: { t12: [], pf: [] },
    words: 'The OM’s NOI is not what its own lines add up to: figures printed in thousands, a reserve taken off above the NOI line, or a section taken as printed.' });

  // the end: the OM's printed pro forma NOI, with the deal's figure as a note when it differs (BRIDGE_ENDS_AT)
  const notes = [];
  let endC = E;
  let endLabel = col.noiPrinted ? 'Pro forma NOI (the OM’s, as printed)' : 'Pro forma NOI (the OM’s lines added up)';
  if (dealC !== E) {
    if (endsAt === 'deal') {
      rows.push({ key: 'deal', tag: 'deal', label: 'The deal’s pro forma NOI against the OM’s', c: dealC - E, lines: { t12: [], pf: [] }, words: 'The deal’s pro forma NOI was edited, or another column was chosen in Data QC.' });
      endC = dealC; endLabel = 'Pro forma NOI (the deal’s)';
    } else notes.push({ kind: 'dealNoi', c: dealC, words: `The deal’s pro forma NOI is ${money(dealC)}, not the OM’s ${money(E)}: it was edited, or another column was chosen in Data QC. The bridge ends at the OM’s figure.` });
  }
  return out(rows, endC, endLabel, notes);
}

/* t12.js -- a trailing-twelve-month operating statement (a T-12) read from
 * its cells, each line put in a standard category, and its NOI worked out.
 * Pure: the screens (t12ui.js) read the file and keep what this returns on
 * the deal as `deal.t12`. Design: docs/proposals/t12-review-queue.md.
 *
 * Amounts are kept the way the analysis reads them: income positive (a
 * reduction such as vacancy negative), every expense positive as a cost,
 * whatever sign the file used. Each line keeps its months as read
 * (UsdPerMonth) and its total for the period (UsdPerYear over 12 months; over
 * fewer months it is what those months add up to, never scaled up). */

import { toCents } from './engine/money.js';

/* ------------------------------------------------------------ categories */

/**
 * @typedef {'income'|'expense'|'below'} Side
 * @typedef {{ id: string, label: string, side: Side, reduces?: boolean, generic?: number, rules: RegExp[], unless?: RegExp }} Category
 * `generic`: a catch-all, 1 (base rent) or 2 (other income, other operating); a more specific category wins over it
 */

/** The standard categories, in the order a statement is shown. Rules are tried on the normalised label. */
/** @type {Category[]} */
export const CATEGORIES = [
  // income
  { id: 'rent', label: 'Base rent', side: 'income', generic: 1, rules: [/\brents?\b/, /\brental (income|revenue)\b/, /\bgross potential\b/, /\bgpr\b/, /\bscheduled (rent|income)\b/], unless: /\b(free|abate|concession|parking|garage|reimb|recover|loss to lease|vacan|expense|storage|pet|laundry)/ },
  { id: 'vacancy', label: 'Vacancy and credit loss', side: 'income', reduces: true, rules: [/\bvacan/, /\bcredit loss\b/, /\bbad debts?\b/, /\bcollection loss/, /\bloss to lease\b/, /\bwrite ?offs?\b/, /\b(model|employee|down|non ?revenue) units?\b/, /\buncollect/] },
  { id: 'concessions', label: 'Concessions and free rent', side: 'income', reduces: true, rules: [/\bconcession/, /\bfree rent\b/, /\babate/, /\bmove ?in special/, /\brent discount/] },
  { id: 'recoveries', label: 'Expense recoveries', side: 'income', rules: [/\bcam\b/, /\breimburs/, /\brecover/, /\bcommon area\b/, /\bpass ?through/, /\bescalation/, /\brubs\b/] },
  { id: 'parking', label: 'Parking', side: 'income', rules: [/\bparking\b/, /\bgarage\b/, /\bcarport/] },
  { id: 'otherIncome', label: 'Other income', side: 'income', generic: 2, rules: [/\bother (income|revenue)\b/, /\bmisc(ellaneous)? (income|revenue)\b/, /\blate (fee|charge)/, /\bfee income\b/, /\bapplication fee/, /\bstorage\b/, /\blaundry\b/, /\bvending\b/, /\bpet (fee|rent)/, /\binterest income\b/, /\bsignage\b/, /\bantenna/, /\bcell tower/, /\btermination fee/, /\bnsf\b/, /\bincome\b/] },
  // operating expenses
  { id: 'taxes', label: 'Real estate taxes', side: 'expense', rules: [/\breal estate tax/, /\bproperty tax/, /\bre taxes?\b/, /\bad valorem\b/, /\btaxes\b/, /\btax\b/, /\bpilot\b/], unless: /\b(payroll|income tax|franchise|recover|reimb)/ },
  { id: 'insurance', label: 'Insurance', side: 'expense', rules: [/\binsur/, /\bpremium/], unless: /\b(recover|reimb|workers comp)/ },
  { id: 'utilities', label: 'Utilities', side: 'expense', rules: [/\butilit/, /\belectric/, /\bgas\b/, /\bwater\b/, /\bsewer\b/, /\btrash\b/, /\brefuse\b/, /\bgarbage\b/, /\bwaste\b/, /\bpower\b/, /\benergy\b/, /\bheating oil\b/, /\bfuel\b/], unless: /\b(income|reimb|recover|rubs)/ },
  { id: 'repairs', label: 'Repairs and maintenance', side: 'expense', rules: [/\brepair/, /\bmaint/, /\br ?(and|&) ?m\b/, /\bsupplies\b/, /\bhvac\b/, /\bplumbing\b/, /\bpaint/, /\bturnover\b/, /\bmake ready\b/, /\bgeneral building\b/, /\bpest\b/], unless: /\boffice\b/ },
  { id: 'contract', label: 'Contract services', side: 'expense', rules: [/\bjanitor/, /\bcleaning\b/, /\blandscap/, /\bsnow\b/, /\bsecurity\b/, /\belevator/, /\bcontract (service|labor)/, /\bgrounds\b/, /\balarm\b/, /\bfire (protection|monitoring|safety)/, /\bwindow wash/, /\bporter/, /\bpatrol/], unless: /\b(deposit|income)/ },
  { id: 'management', label: 'Management fee (property)', side: 'expense', rules: [/\bproperty management\b/, /\bproperty mgmt\b/, /\bmanagement fees? property\b/, /\bmanaging agent\b/, /\bmanagement company\b/, /\bpm fees?\b/] },
  { id: 'payroll', label: 'Payroll', side: 'expense', rules: [/\bpayroll/, /\bsalar/, /\bwages?\b/, /\bemployee/, /\bstaff\b/, /\bbenefits?\b/, /\bbonus/, /\bworkers comp/, /\bsuperintendent/, /\bon ?site manager/, /\bleasing agent/], unless: /\b(units?|unit rent)\b/ },
  { id: 'admin', label: 'General and administrative', side: 'expense', rules: [/\badmin/, /\bg ?(and|&) ?a\b/, /\boffice (expense|supplies)/, /\blegal\b/, /\baccounting\b/, /\baudit\b/, /\bprofessional (fee|service)/, /\btelephone\b/, /\binternet\b/, /\bsoftware\b/, /\bpostage\b/, /\bbank (fee|charge)/, /\blicen[cs]e/, /\bpermit/, /\bdues\b/, /\bsubscription/, /\btravel\b/, /\bmarketing\b/, /\badvertis/, /\bpromotion/, /\bleasing (expense|cost)/, /\bcomputer\b/] },
  { id: 'otherOpex', label: 'Other operating', side: 'expense', generic: 2, rules: [/\bother (operating|expense)/, /\bmisc(ellaneous)? (expense|operating)/, /\bmiscellaneous\b/, /\bexpenses?\b/] },
  // below the line: kept, not in NOI
  { id: 'capex', label: 'Capital expenditures', side: 'below', rules: [/\bcapital\b/, /\bcapex\b/, /\bcap ex\b/, /\bimprovements?\b/, /\bresurfac/] , unless: /\btenant improvement/ },
  { id: 'reserves', label: 'Reserves', side: 'below', rules: [/\breserves?\b/] },
  { id: 'tiLc', label: 'TI and leasing commissions', side: 'below', rules: [/\btenant improvement/, /\bti\b/, /\bleasing commission/, /\blc\b/, /\bcommissions?\b/] },
  { id: 'debt', label: 'Debt service and interest', side: 'below', rules: [/\bdebt service\b/, /\bmortgage\b/, /\binterest expense\b/, /\bloan\b/, /\bprincipal\b/, /\binterest\b/], unless: /\binterest income\b/ },
  { id: 'depreciation', label: 'Depreciation and amortization', side: 'below', rules: [/\bdepreciation\b/, /\bamorti[sz]ation\b/] },
  { id: 'owner', label: 'Owner and partnership costs', side: 'below', rules: [/\basset management\b/, /\basset mgmt\b/, /\bowner/, /\bpartnership\b/, /\bpartner\b/, /\bentity\b/, /\bfranchise tax/, /\borgani[sz]ational/, /\bsponsor/, /\binvestor/, /\bincentive fee/, /\bacquisition fee/, /\bdisposition fee/, /\bfund\b/] },
];
export const CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const SIDES = { income: 'Income', expense: 'Operating expenses', below: 'Below the line (not in NOI)' };

/** A label that only says "management fee": property manager's or owner's? Never guessed (approved 2026-10-10). */
const BARE_MANAGEMENT = /^(management|mgmt)( fees?)?$/;

/* -------------------------------------------------------------- labels */

/** A label as it is matched and remembered: lower case, without account numbers or punctuation. */
export function normalizeLabel(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^\s*[\d][\d\-.]*\s*[·:\-–—]?\s*/, '') // a leading account number: "6100-000 ·", "4010 -"
    .replace(/\(\s*[\d][\d\-.]*\s*\)/g, ' ') // an account number in brackets
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Which category a label goes to. `corrections` holds the broker's own
 * choices ({ normalised label: category id }); `section` is the side the
 * line sits under in the file, when the file says. Returns
 * { category, how: 'yours'|'rule'|'review', why, candidates }.
 */
export function matchLabel(label, { section = null, corrections = {} } = {}) {
  const key = normalizeLabel(label);
  if (corrections && Object.prototype.hasOwnProperty.call(corrections, key) && CATEGORY[corrections[key]]) {
    return { category: corrections[key], how: 'yours', why: 'your choice for this label', candidates: [corrections[key]] };
  }
  if (BARE_MANAGEMENT.test(key)) return { category: null, how: 'review', why: 'a management fee: the property manager’s (operating) or the owner’s (below the line)?', candidates: ['management', 'owner'] };
  let hits = CATEGORIES.filter((c) => c.rules.some((re) => re.test(key)) && !(c.unless && c.unless.test(key)));
  // a specific category wins over a catch-all, and base rent over "other income"
  const level = Math.min(...hits.map((c) => c.generic || 0));
  hits = hits.filter((c) => (c.generic || 0) === level);
  // where the file says which part of the statement a line is in, a category on the other side doesn't fit
  const fits = section ? hits.filter((c) => c.side === section || (section === 'expense' && c.side === 'below')) : hits;
  if (fits.length === 1) return { category: fits[0].id, how: 'rule', why: section && hits.length > 1 ? `the only fit under ${SIDES[section].toLowerCase()}` : 'its wording', candidates: [fits[0].id] };
  if (!hits.length) return { category: null, how: 'review', why: 'no category fits its wording', candidates: [] };
  if (!fits.length) return { category: null, how: 'review', why: `its wording fits ${hits.map((c) => c.label.toLowerCase()).join(' or ')}, but it sits under ${SIDES[section].toLowerCase()}`, candidates: hits.map((c) => c.id) };
  return { category: null, how: 'review', why: `its wording fits ${fits.map((c) => c.label.toLowerCase()).join(' and ')}`, candidates: fits.map((c) => c.id) };
}

/* -------------------------------------------------------------- numbers */

/**
 * An amount as a statement writes it: "$1,250", "(1,250)", "1,250-", "–" (zero). NaN when the text isn't an amount.
 * `fmt` says how the file writes numbers: 'us' (1,234.56, the default and what the OM reader uses), 'eu' (1.234,56),
 * 'ch' (1'234.56) or 'space' (1 234,56). It changes text only; a number cell is a number whatever the format.
 */
export function amountOf(v, fmt = 'us') {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (v === null || v === undefined) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  if (/^[-–—]+$/.test(s)) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
  s = fmt === 'us' ? s.replace(/[$,\s]/g, '') : stripFormat(s, fmt);
  if (/^-/.test(s)) { neg = !neg; s = s.slice(1); }
  if (!/^\d*\.?\d+$/.test(s)) return NaN;
  const n = Number(s);
  return neg ? -n : n;
}
/** Text with its thousands marks removed and its decimal mark made a point, for a file that doesn't write numbers the US way. */
function stripFormat(s, fmt) {
  s = s.replace(/\$/g, '');
  if (fmt === 'eu') return s.replace(/[.\s]/g, '').replace(',', '.');
  if (fmt === 'ch') return s.replace(/['’,\s]/g, '');
  if (fmt === 'space') return s.replace(/\s/g, '').replace(',', '.');
  return s.replace(/[,\s]/g, '');
}
// money to whole cents with the engine's one rule (half away from zero, exact for decimal input: 1.005 → 1.01)
const cents = toCents;

/* --------------------------------------------------------------- months */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');
const year4 = (y) => (y < 100 ? 2000 + y : y);

/**
 * A column heading read as a month: { iso: 'YYYY-MM' } for a dated month,
 * { index } for "Month 3" or "Period 3", or null.
 */
export function monthOf(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim().toLowerCase();
  let m = /^(\d{4})-(\d{2})(-\d{2})?$/.exec(s); // an ISO date (a date cell, as read) or "2025-01"
  if (m && +m[2] >= 1 && +m[2] <= 12) return { iso: `${m[1]}-${m[2]}` };
  m = /^([a-z]{3,9})\.?[\s\-/']*(\d{2}|\d{4})$/.exec(s); // "Jan-25", "January 2025", "Jan '25"
  if (m) { const i = MONTHS.indexOf(m[1].slice(0, 3)); if (i >= 0 && (m[1].length === 3 || m[1].startsWith(MONTHS[i]))) return { iso: `${year4(+m[2])}-${pad(i + 1)}` }; }
  m = /^(\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(s); // "01/2025", "1-25"
  if (m && +m[1] >= 1 && +m[1] <= 12) return { iso: `${year4(+m[2])}-${pad(+m[1])}` };
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s); // "1/31/2025": the month it ends
  if (m && +m[1] >= 1 && +m[1] <= 12) return { iso: `${year4(+m[3])}-${pad(+m[1])}` };
  m = /^(month|mo|period|p)\.?\s*(\d{1,2})$/.exec(s);
  if (m && +m[2] >= 1 && +m[2] <= 12) return { index: +m[2] };
  return null;
}
const TOTAL_HEAD = /^(total|totals|t-?12|ttm|trailing( 12| twelve)?( months?)?|annual|year total|ytd|12 months?)\b/i;

/** "Jan 2025" for "2025-01". */
export const monthLabel = (iso) => (/^\d{4}-\d{2}$/.test(iso || '') ? `${MONTHS[+iso.slice(5) - 1].replace(/^./, (c) => c.toUpperCase())} ${iso.slice(0, 4)}` : String(iso || ''));

/* ------------------------------------------------------------- reading */

const SUBTOTAL = /^(total|subtotal|sub total|net operating|net income|noi\b|effective gross|egi\b|gross (operating )?income\b|cash flow|income before)/;
/** @type {[string, RegExp][]} */
const STATED = [
  ['noi', /^(net operating income|noi)\b/],
  ['egi', /^(effective gross (income|revenue)|egi|total (operating )?(income|revenue|receipts)|gross (operating )?income)\b/],
  ['opex', /^total (operating )?expenses?\b|^total opex\b/],
];
/** @type {[Side, RegExp][]} */
const HEADING = [
  ['income', /\b(income|revenues?|receipts)\b/],
  ['below', /\b(below the line|non ?operating|capital|after noi|debt service|other (items|expenses) not in noi)\b/],
  ['expense', /\b(expenses?|expenditures?|costs?)\b/],
];

/**
 * Where a statement's parts are in a sheet's rows: { head (the heading row and
 * its months), monthCols ([{ c, iso | index }]), totalCol, labelCol,
 * accountCol }, or throws with what was missing.
 */
export function layoutOf(rows, { sheet = '' } = {}) {
  // 1. the heading row: the first, in the top 40, with three or more months
  let head = null;
  for (const row of rows.slice(0, 40)) {
    const ms = row.cells.map(monthOf);
    const n = ms.filter(Boolean).length;
    if (n >= 3) { head = { row, ms }; break; }
  }
  // a statement with only an annual column: the first row with a Total heading
  if (!head) {
    for (const row of rows.slice(0, 40)) {
      if (row.cells.some((c) => typeof c === 'string' && TOTAL_HEAD.test(c.trim()))) { head = { row, ms: row.cells.map(() => null) }; break; }
    }
  }
  if (!head) throw new Error(`No months or total column were found${sheet ? ` on “${sheet}”` : ''}: a T-12 needs a row of month headings (Jan 2025, 01/2025 …) or a Total column.`);
  const monthCols = [];
  head.ms.forEach((m, c) => { if (m) monthCols.push({ c, ...m }); });
  let totalCol = head.row.cells.findIndex((c, i) => i > (monthCols.length ? monthCols[monthCols.length - 1].c : -1) && typeof c === 'string' && TOTAL_HEAD.test(c.trim()));
  if (totalCol < 0) totalCol = head.row.cells.findIndex((c) => typeof c === 'string' && TOTAL_HEAD.test(c.trim()));
  if (totalCol < 0) totalCol = null;
  const numCols = [...monthCols.map((m) => m.c), ...(totalCol !== null ? [totalCol] : [])];
  const firstNum = Math.min(...numCols);

  // 2. the label column: left of the numbers, the one with the most words; an account-number column beside it is kept
  const body = rows.filter((x) => x.r > head.row.r);
  let labelCol = 0; let best = -1; let accountCol = null;
  for (let c = 0; c < firstNum; c++) {
    let words = 0; let codes = 0;
    for (const x of body) {
      const v = x.cells[c];
      if (typeof v === 'string' && /[a-z]{3}/i.test(v)) words += 1;
      else if (v !== null && v !== undefined && /^[\d][\d\-.]*$/.test(String(v).trim())) codes += 1;
    }
    if (words > best) { best = words; labelCol = c; }
    if (codes > body.length / 3) accountCol = c;
  }
  if (accountCol === labelCol) accountCol = null;
  return { head, monthCols, totalCol, labelCol, accountCol };
}

/* ------------------------------------------------------- number formats */

const FOREIGN = /[€£¥₹]|\b(?:CHF|EUR|GBP|JPY|CAD|AUD)\b/i;

/**
 * How one amount written as text is written: 'us' (1,234.56), 'eu' (1.234,56),
 * 'ch' (1'234.56) or 'space' (1 234,56) where the text can only be that;
 * 'dot3' or 'comma3' where one separator is followed by exactly three digits
 * (1.234, 12,500) and it could be either; null where both readings agree
 * (1234, 1 234) or it isn't an amount.
 */
export function tokenFormat(v) {
  let s = String(v).trim().replace(/\$/g, '').replace(/^\((.*)\)$/, '$1').replace(/^\s*-\s*|\s*-\s*$/g, '').trim();
  if (/^\d{1,3}(['’]\d{3})+(\.\d+)?$/.test(s)) return 'ch';
  if (/^\d{1,3}([   ]\d{3})+,\d+$/.test(s)) return 'space';
  if (/^\d+(,\d+)+\.\d+$/.test(s)) return /^\d{1,3}(,\d{3})+\.\d+$/.test(s) ? 'us' : null;
  if (/^\d+(\.\d+)+,\d+$/.test(s)) return /^\d{1,3}(\.\d{3})+,\d+$/.test(s) ? 'eu' : null;
  if (/^\d+(,\d+)+$/.test(s)) {
    const g = s.split(',');
    if (g.length > 2) return /^\d{1,3}(,\d{3})+$/.test(s) ? 'us' : null;
    return g[1].length === 3 ? 'comma3' : 'eu';
  }
  if (/^\d*(\.\d+)+$/.test(s)) {
    const g = s.split('.');
    if (g.length > 2) return /^\d{1,3}(\.\d{3})+$/.test(s) ? 'eu' : null;
    return g[1].length === 3 && g[0] !== '' ? 'dot3' : 'us';
  }
  return null;
}

/**
 * How a statement writes its numbers, from the text cells in its month and
 * total columns (a number cell is never affected). { format, ask, samples,
 * foreign }: `format` is 'us', 'eu', 'ch' or 'space' when the cells settle it,
 * else null with `ask` saying why the broker must ('mixed': both ways in one
 * file; 'ambiguous': only 1.234 or 12,500 style figures, which read two ways)
 * and `samples` ([{ text, us, eu }], at most three) to show. A comma-delimited
 * file whose only doubtful figures are 12,500 style reads as US with no
 * question; a semicolon file asks (semicolons are what decimal-comma
 * countries use). `foreign` is a currency sign other than $, or null.
 * @param {any[]} rows
 * @param {{ head: any, monthCols: any[], totalCol: number|null }} layout
 * @param {{ delimiter?: string }} [opts]
 */
export function numberFormatOf(rows, layout, { delimiter = ',' } = {}) {
  const cols = [...layout.monthCols.map((m) => m.c), ...(layout.totalCol !== null ? [layout.totalCol] : [])];
  const count = { us: 0, eu: 0, ch: 0, space: 0, dot3: 0, comma3: 0 };
  const doubtful = []; const clear = []; let foreign = null;
  for (const x of rows) {
    if (x.r <= layout.head.row.r) continue;
    for (const c of cols) {
      const v = x.cells[c];
      if (typeof v !== 'string' || !/\d/.test(v)) continue;
      const sign = FOREIGN.exec(v);
      if (sign && !foreign) foreign = sign[0];
      const k = tokenFormat(v);
      if (!k) continue;
      count[k]++;
      const arr = k === 'dot3' || k === 'comma3' ? doubtful : clear;
      if (!arr.some((t) => t.text === v.trim())) arr.push({ text: v.trim(), us: amountOf(v, 'us'), eu: amountOf(v, 'eu') });
    }
  }
  const usEv = count.us + count.ch; const euEv = count.eu + count.space;
  let format = null; let ask = null;
  if (usEv && euEv) ask = 'mixed';
  else if (usEv) format = count.ch ? 'ch' : 'us';
  else if (euEv) format = count.eu ? 'eu' : 'space';
  else if (count.dot3 || (count.comma3 && delimiter === ';')) ask = 'ambiguous';
  else format = 'us';
  return { format, ask, samples: [...doubtful, ...clear].slice(0, 3), foreign };
}

/** Why a statement in another currency is not read, or null for dollars. */
export const currencyRefusal = (sign) => (sign ? `Amounts in ${sign} can’t be read as dollars. Zlatura reads dollar statements only; this file was not imported.` : null);

/**
 * Read a statement from a sheet's rows ([{ r, cells }], as sheetread.js gives
 * them). Returns { months, monthCols, totalCol, labelCol, lines, stated,
 * subtotals, sections, period } or throws with what was missing. `numberFormat`
 * is how the file writes its numbers (amountOf); `paste` marks text pasted in.
 * Each line records where it was read (`src`), how sure (`conf`), and which
 * month cells were blank (`blank`: counted as 0, never silently) or text that
 * isn't an amount (`unread`, also 0).
 */
export function readStatement(rows, { corrections = {}, sheet = '', numberFormat = 'us', paste = false } = {}) {
  const { head, monthCols, totalCol, labelCol, accountCol } = layoutOf(rows, { sheet });
  // dated months in order; "Month 1…12" by their number
  const months = monthCols.map((m) => m.iso || `M${pad(m.index)}`);
  const body = rows.filter((x) => x.r > head.row.r);

  // 3. lines, headings and subtotals, top to bottom
  const lines = []; const subtotals = []; const stated = {}; const sections = [];
  let section = null; let sinceMark = [];
  let afterNoi = false;
  for (const x of body) {
    const raw = x.cells[labelCol];
    const label = raw === null || raw === undefined ? '' : String(raw).trim();
    const account = accountCol !== null && x.cells[accountCol] !== null && x.cells[accountCol] !== undefined ? String(x.cells[accountCol]).trim() : '';
    const vals = monthCols.map((m) => amountOf(x.cells[m.c], numberFormat));
    const tot = totalCol !== null ? amountOf(x.cells[totalCol], numberFormat) : NaN;
    const hasNum = vals.some(Number.isFinite) || Number.isFinite(tot);
    const key = normalizeLabel(label);
    if (!label && !hasNum) continue;
    if (!hasNum) {
      // a heading: which part of the statement follows
      const h = HEADING.find(([, re]) => re.test(key));
      if (h) { section = h[0]; sections.push({ r: x.r, label, side: section }); sinceMark = []; }
      continue;
    }
    if (!label) continue; // numbers with no label: a total row without words is not guessed at
    const months12 = vals.map((v) => (Number.isFinite(v) ? v : 0));
    const sum = cents(months12.reduce((s, v) => s + v, 0));
    const total = monthCols.length ? sum : (Number.isFinite(tot) ? tot : 0);
    if (SUBTOTAL.test(key)) {
      const st = STATED.find(([, re]) => re.test(key));
      const value = Number.isFinite(tot) ? tot : total;
      if (st && stated[st[0]] === undefined) stated[st[0]] = { r: x.r, label, value };
      else subtotals.push({ r: x.r, label, value, covers: sinceMark.map((l) => l.id) });
      if (st && st[0] === 'noi') { afterNoi = true; section = 'below'; }
      else if (st && st[0] === 'egi' && section === 'income') section = 'expense';
      else if (st && st[0] === 'opex') section = afterNoi ? 'below' : 'expense';
      sinceMark = [];
      continue;
    }
    const line = {
      id: `L${x.r}`, r: x.r, account, label, key,
      section: afterNoi ? 'below' : section,
      months: months12.map(cents),
      total: cents(total),
      fileTotal: Number.isFinite(tot) && monthCols.length ? cents(tot) : null,
    };
    // a blank month cell and a cell of words add 0, as before, but are kept on the line
    const blank = []; const unread = [];
    monthCols.forEach((mc, i) => {
      if (Number.isFinite(vals[i])) return;
      const v = x.cells[mc.c];
      if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) blank.push(i);
      else unread.push({ i, text: cellText(v) });
    });
    Object.assign(line, { src: { type: paste ? 'pasteLine' : 'cell', sheet, row: x.r, col: labelCol }, conf: { read: paste || unread.length ? 'medium' : 'high' } });
    if (blank.length) line.blank = blank;
    if (unread.length) line.unread = unread;
    const m = matchLabel(label, { section: line.section, corrections });
    Object.assign(line, { category: m.category, how: m.how, why: m.why, candidates: m.candidates });
    lines.push(line);
    sinceMark.push(line);
  }
  if (!lines.length) throw new Error('No statement lines were found under the month headings.');
  const period = periodOf({ head, monthCols, totalCol }, months, rows, lines);
  return { sheet, months, labelCol, accountCol, totalCol, monthCols: monthCols.map((m) => m.c), lines, stated, subtotals, sections, headRow: head.row.r, period };
}

/** A cell that isn't an amount, as short text (an Excel error such as #REF! included). */
const cellText = (v) => String(v && typeof v === 'object' ? (v.error ?? v.text ?? '?') : v).trim().slice(0, 40);

/**
 * What period the statement says it covers: { basis, dated, count, columns, gaps, duplicates, emptyCols, printed }.
 * It records and never scales: 12 dated, consecutive, distinct months are 'T-12'; fewer in a row 'T-n';
 * a Total headed YTD 'YTD'; a Total and no months 'annual'; "Month 1…12" 'T-12' with dated false (no year is
 * invented); anything else 'other'. `gaps` are dated months missing between the first and last, `duplicates` a
 * month heading two columns, `emptyCols` month columns blank on every line, `printed` the first line above the
 * headings that names a period (as text; no date is parsed from it).
 */
function periodOf({ head, monthCols, totalCol }, months, rows, lines) {
  const n = monthCols.length;
  const dated = n > 0 && monthCols.every((m) => m.iso);
  const key = (iso) => +iso.slice(0, 4) * 12 + +iso.slice(5) - 1;
  const have = new Set(); const duplicates = [];
  for (const m of monthCols) if (m.iso) { if (have.has(m.iso) && !duplicates.includes(m.iso)) duplicates.push(m.iso); have.add(m.iso); }
  const gaps = [];
  if (dated) {
    const ks = [...have].map(key);
    for (let k = Math.min(...ks); k <= Math.max(...ks); k++) {
      const iso = `${Math.floor(k / 12)}-${pad((k % 12) + 1)}`;
      if (!have.has(iso)) gaps.push(iso);
    }
  }
  const totalHead = totalCol !== null ? String(head.row.cells[totalCol]) : '';
  const inARow = dated && !gaps.length && !duplicates.length;
  const indexes = monthCols.map((m) => m.index);
  let basis = 'other';
  if (inARow && n === 12) basis = 'T-12';
  else if (inARow && n > 0 && n < 12) basis = `T-${n}`;
  else if (/ytd/i.test(totalHead)) basis = 'YTD';
  else if (n === 0 && totalCol !== null) basis = 'annual';
  else if (n === 12 && indexes.every((v, i) => v === i + 1)) basis = 'T-12';
  const emptyCols = lines.length ? monthCols.map((_, i) => i).filter((i) => lines.every((l) => l.blank && l.blank.includes(i))).map((i) => months[i]) : [];
  const above = rows.find((x) => x.r < head.row.r && /period|months ended|year ended|ytd|as of/i.test(x.cells.filter((v) => typeof v === 'string').join(' ')));
  return {
    basis, dated, count: n,
    columns: [...monthCols.map((m) => ({ c: m.c, kind: m.iso ? 'month' : 'index', head: String(head.row.cells[m.c]).slice(0, 40) })), ...(totalCol !== null ? [{ c: totalCol, kind: 'total', head: totalHead.slice(0, 40) }] : [])],
    gaps, duplicates, emptyCols,
    printed: above ? above.cells.filter((v) => v !== null && v !== undefined && String(v).trim()).join(' ').slice(0, 120) : null,
  };
}

/**
 * The file's sign conventions turned into the analysis's: income positive,
 * reductions negative, expenses positive as costs. Decided for the whole
 * file from the sides its lines are in: where most expense lines are
 * negative, the file writes expenses negative, and so on. Returns a copy.
 */
export function normalizeSigns(st) {
  const side = (l) => (l.category ? CATEGORY[l.category].side : l.section);
  const majorityNegative = (ls) => { const xs = ls.filter((l) => l.total !== 0); return xs.length > 0 && xs.filter((l) => l.total < 0).length > xs.length / 2; };
  const expenseLike = st.lines.filter((l) => side(l) === 'expense' || side(l) === 'below');
  const reductions = st.lines.filter((l) => l.category && CATEGORY[l.category].reduces);
  const flipExpenses = majorityNegative(expenseLike);
  // reductions written as positive amounts under income ("Less: vacancy  12,000") are made negative
  const flipReductions = reductions.length > 0 && !majorityNegative(reductions);
  const out = { ...st, signs: { expensesNegative: flipExpenses, reductionsPositive: flipReductions } };
  out.lines = st.lines.map((l) => {
    const s = side(l);
    let f = 1;
    if ((s === 'expense' || s === 'below') && flipExpenses) f = -1;
    if (l.category && CATEGORY[l.category].reduces && flipReductions) f = -1;
    return f === 1 ? l : { ...l, months: l.months.map((v) => cents(-v) || 0), total: cents(-l.total) || 0, fileTotal: l.fileTotal === null ? null : cents(-l.fileTotal) || 0, signFlipped: true };
  });
  // what the file states is compared the same way
  out.stated = Object.fromEntries(Object.entries(st.stated).map(([k, v]) => [k, { ...v, value: k === 'opex' && flipExpenses ? cents(-v.value) : v.value }]));
  return out;
}

/* ---------------------------------------------------------- the totals */

/** What the statement adds up to, from its lines as they are now categorised. Lines still to review count in no category. */
export function statementTotals(t) {
  const by = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));
  let unassigned = 0;
  for (const l of t.lines) {
    if (l.category && by[l.category] !== undefined) by[l.category] = cents(by[l.category] + l.total);
    else unassigned = cents(unassigned + l.total);
  }
  const sum = (side) => cents(CATEGORIES.filter((c) => c.side === side).reduce((s, c) => s + by[c.id], 0));
  const egi = sum('income'); const opex = sum('expense'); const below = sum('below');
  return { by, egi, opex, below, taxes: by.taxes, noi: cents(egi - opex), unassigned, months: t.months.length };
}

/**
 * A partial statement's totals scaled to a year, × 12 ÷ its months, to whole
 * cents (convention t12.months): EGI, operating expenses and taxes each
 * scaled, NOI their difference so it still adds up. Only on the broker's
 * explicit confirmation ("Use the T-12's figures"). `T` is statementTotals'
 * result; a full year, or no months, gives null: nothing to scale.
 */
export function annualized(T) {
  const n = T.months;
  if (!(n > 0 && n < 12)) return null;
  const up = (v) => cents((v * 12) / n);
  const egi = up(T.egi); const opex = up(T.opex);
  return { egi, opex, taxes: up(T.taxes), noi: cents(egi - opex), months: n };
}

/**
 * What the statement's own numbers say that doesn't add up, and what is
 * missing: [{ id, kind, text, amount }]. `id` is stable, so "seen" can be kept.
 * `tol(stated, lines)` is how far a stated figure may sit from what its
 * lines add up to (default a dollar): an OM statement printed in thousands
 * passes its own rounding (omstatement.js).
 * @param {any} t
 * @param {{ tol?: (stated: number, lines: number) => number }} [opts]
 */
export function statementChecks(t, { tol = () => 1 } = {}) {
  const out = [];
  const T = statementTotals(t);
  const money = (x) => `$${Math.round(Math.abs(x)).toLocaleString('en-US')}`;
  const n = t.months.length;
  if (n && n < 12) out.push({ id: 'months', kind: 'partial', text: `Only ${n} month${n === 1 ? '' : 's'} (${monthLabel(t.months[0])} to ${monthLabel(t.months[n - 1])}): the totals are for those months and are not scaled up to a year.`, amount: Math.abs(T.noi) });
  if (!n) out.push({ id: 'months', kind: 'partial', text: 'No monthly columns: only the annual total was read.', amount: Math.abs(T.noi) });
  const off = t.lines.filter((l) => l.fileTotal !== null && Math.abs(l.fileTotal - l.total) > 1);
  // each shown month is rounded to the cent on its own, the year once from the file's amounts: when the file
  // holds fractions of a cent the two can disagree. Flagged; neither figure is changed (owner, 2026-10-15)
  const cents2 = (x) => `$${Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const drift = t.lines.filter((l) => l.months.length > 1 && Math.abs(cents(l.months.reduce((s, v) => s + v, 0)) - l.total) > 0.01 + 1e-9);
  if (drift.length) out.push({ id: 'monthsround', kind: 'rounding', text: `${drift.length} line${drift.length === 1 ? '’s' : 's’'} shown months add up to more than a cent away from the year shown (${drift.slice(0, 3).map((l) => `${l.label}: months ${cents2(cents(l.months.reduce((s, v) => s + v, 0)))}, year ${cents2(l.total)}`).join('; ')}${drift.length > 3 ? '; …' : ''}). The file has amounts to a fraction of a cent: each month is rounded on its own, the year once. Neither figure is changed.`, amount: drift.reduce((s, l) => s + Math.abs(cents(l.months.reduce((a, v) => a + v, 0)) - l.total), 0) });
  if (off.length) out.push({ id: 'linetotals', kind: 'sumTotal', text: `${off.length} line${off.length === 1 ? '’s' : 's’'} months don’t add up to the file’s Total column (${off.slice(0, 3).map((l) => `${l.label}: months ${money(l.total)}, Total ${money(l.fileTotal)}`).join('; ')}${off.length > 3 ? '; …' : ''}). The months are used.`, amount: off.reduce((s, l) => s + Math.abs(l.fileTotal - l.total), 0) });
  if (!T.unassigned) {
    const sideOf = (l) => (l.category ? CATEGORY[l.category].side : l.section);
    const count = { egi: t.lines.filter((l) => sideOf(l) === 'income').length, opex: t.lines.filter((l) => sideOf(l) === 'expense').length };
    count.noi = count.egi + count.opex;
    for (const [k, label] of [['egi', 'effective gross income'], ['opex', 'operating expenses'], ['noi', 'NOI']]) {
      const s = t.stated[k];
      if (s && Math.abs(Math.abs(s.value) - Math.abs(T[k])) > tol(s.value, count[k])) out.push({ id: `stated.${k}`, kind: 'stated', text: `The file states ${label} of ${money(s.value)} (row ${s.r}); its lines add up to ${money(T[k])}.`, amount: Math.abs(Math.abs(s.value) - Math.abs(T[k])) });
    }
  }
  const byId = new Map(t.lines.map((l) => [l.id, l]));
  for (const s of t.subtotals) {
    const ls = s.covers.map((id) => byId.get(id)).filter(Boolean);
    if (!ls.length) continue;
    const sum = cents(ls.reduce((a, l) => a + l.total, 0));
    if (Math.abs(Math.abs(sum) - Math.abs(s.value)) > tol(s.value, ls.length)) out.push({ id: `sub.${s.r}`, kind: 'stated', text: `“${s.label}” (row ${s.r}) is ${money(s.value)}; the ${ls.length} line${ls.length === 1 ? '' : 's'} above it add up to ${money(sum)}.`, amount: Math.abs(Math.abs(sum) - Math.abs(s.value)) });
  }
  // month cells that were blank in the file: counted as $0, said so (a statement read before 4.7.28 has no `blank`)
  const blanks = t.lines.filter((l) => Array.isArray(l.blank) && l.blank.length);
  if (blanks.length) {
    const cells = blanks.reduce((s, l) => s + l.blank.length, 0);
    const where = blanks.slice(0, 3).map((l) => `${l.label}: ${l.blank.slice(0, 3).map((i) => monthName(t.months[i])).join(', ')}${l.blank.length > 3 ? ', …' : ''}`).join('; ');
    out.push({ id: 'blanks', kind: 'blank', text: `${cells} month cell${cells === 1 ? ' is' : 's are'} blank (${where}${blanks.length > 3 ? '; …' : ''}). They count as $0 in the totals; check the source.`, amount: 0 });
  }
  return out;
}
/** "Mar 2026" for "2026-03", "Month 3" for "M03". */
const monthName = (m) => (/^M\d+$/.test(m || '') ? `Month ${+m.slice(1)}` : monthLabel(m));

/**
 * The whole import: rows → the statement as the deal keeps it.
 * { v: 2, file, sheet, source, period, importedAt, months, lines, stated, subtotals, signs, seen: {} }.
 * `source` says where it came from ({ type: 'xlsx'|'xlsm'|'csv'|'tsv'|'paste', size, sheets,
 * delimiter, numberAsked, encoding, macros }, as the screen knows them; this adds file, sheet and
 * numberFormat); `period` is what the statement says it covers (periodOf). A statement read before
 * 4.7.28 has neither, and `file` and `sheet` are still written for it. Nothing here is migrated.
 * @param {any[]} rows
 * @param {{ file?: string, sheet?: string, corrections?: Record<string, string>, now?: number, numberFormat?: string, source?: Record<string, any> }} [opts]
 */
export function importStatement(rows, { file = '', sheet = '', corrections = {}, now = Date.now(), numberFormat = 'us', source = {} } = {}) {
  const st = normalizeSigns(readStatement(rows, { corrections, sheet, numberFormat, paste: source.type === 'paste' }));
  const from = { type: source.type, file, size: source.size, sheet, sheets: source.sheets, delimiter: source.delimiter, numberFormat, numberAsked: source.numberAsked, encoding: source.encoding, macros: source.macros };
  return {
    v: 2, file, sheet, source: Object.fromEntries(Object.entries(from).filter(([, x]) => x !== undefined)), period: st.period,
    importedAt: now, months: st.months, lines: st.lines, stated: st.stated, subtotals: st.subtotals, signs: st.signs, headRow: st.headRow, seen: {},
  };
}

const PROJECTION = /\b(budget|forecast|pro ?forma|projected|projection)\b/i;

/**
 * Every sheet of a file tried as a statement: [{ sheet, i (its place in the file), hidden, projection, lines,
 * period, error }]. `projection` is a sheet whose name, or first five rows, say budget, forecast, pro forma
 * or projection. A sheet that doesn't read as a statement has `error` (its reason) and no lines. Nothing is
 * chosen here, and nothing is ordered by how many lines a sheet has: an actual statement is never decided
 * by size.
 * @param {{ sheet: string, hidden?: boolean, rows: any[] }[]} grids
 * @param {{ file?: string, corrections?: Record<string, string> }} [opts]
 */
export function sheetChoices(grids, opts = {}) {
  return grids.map((g, i) => {
    const projection = PROJECTION.test(g.sheet) || PROJECTION.test(g.rows.slice(0, 5).map((r) => r.cells.filter((v) => typeof v === 'string').join(' ')).join(' '));
    const base = { sheet: g.sheet, i, hidden: !!g.hidden, projection };
    try {
      const layout = layoutOf(g.rows, { sheet: g.sheet });
      const st = importStatement(g.rows, { ...opts, sheet: g.sheet, numberFormat: numberFormatOf(g.rows, layout).format || 'us' });
      return { ...base, lines: st.lines.length, period: st.period, error: null };
    } catch (e) { return { ...base, lines: 0, period: null, error: e instanceof Error ? e.message : String(e) }; }
  });
}

/**
 * What to do with `sheetChoices`: { choice } when exactly one readable, actual
 * (not budget or projection) sheet is not hidden, and it is the only one; { ask: [choices] } when
 * there are two or more, or the only one is hidden (the broker chooses; projections are listed, to be
 * shown disabled); { refuse } when no actual statement is there, naming the projections or giving
 * the first sheet's reason.
 */
export function pickSheet(choices) {
  const readable = choices.filter((c) => !c.error);
  const actual = readable.filter((c) => !c.projection);
  if (!actual.length) {
    if (readable.length) return { refuse: `The only statements in this file look like projections, not actuals (${readable.map((c) => `“${c.sheet}”`).join(', ')}). Import a sheet of actual results.` };
    return { refuse: (choices[0] && choices[0].error) || 'No statement was found in that file.' };
  }
  if (actual.length === 1 && !actual[0].hidden) return { choice: actual[0] };
  return { ask: readable };
}

/** Re-apply the rules and the broker's corrections to the lines not yet decided by hand (after a correction is remembered). */
export function rematch(t, corrections) {
  return { ...t, lines: t.lines.map((l) => (l.how === 'you' ? l : { ...l, ...pick(matchLabel(l.label, { section: l.section, corrections })) })) };
}
const pick = (m) => ({ category: m.category, how: m.how, why: m.why, candidates: m.candidates });

/** The lines still waiting for a category. */
export const openLines = (t) => (t && t.lines ? t.lines.filter((l) => !l.category) : []);
/** The statement's checks not yet marked seen. */
export const openChecks = (t) => (t ? statementChecks(t).filter((c) => !(t.seen && t.seen[c.id])) : []);

/** What the analysis reads of a deal's T-12 (impact.js analysisInput): its totals, and how many months they cover. */
export function t12ForAnalysis(t) {
  if (!t || !Array.isArray(t.lines)) return null;
  const T = statementTotals(t);
  return { noi: T.noi, egi: T.egi, opex: T.opex, taxes: T.taxes, months: T.months, from: t.months[0] || null, to: t.months[t.months.length - 1] || null, unassigned: T.unassigned };
}

/**
 * File a line under a category, as the broker chose (in place): the line,
 * and with `sameLabel` every other line with the same normalised label not
 * already decided by hand. Returns the lines changed.
 */
export function fileLine(t, lineId, category, { sameLabel = true } = {}) {
  const line = t.lines.find((l) => l.id === lineId);
  if (!line || !CATEGORY[category]) return [];
  const changed = t.lines.filter((l) => l === line || (sameLabel && l.key === line.key && l.how !== 'you'));
  for (const l of changed) Object.assign(l, { category, how: 'you', why: 'your choice', candidates: [category] });
  return changed;
}
/** A check marked seen (in place): it stays in the statement, and leaves the Review Queue. */
export function markSeen(t, checkId) {
  t.seen = { ...(t.seen || {}), [checkId]: true };
}
/** The months a statement covers, in words: "Jan 2025 to Dec 2025 (12 months)". */
export function periodText(t) {
  const n = t.months.length;
  if (!n) return 'annual total only';
  return `${monthLabel(t.months[0])} to ${monthLabel(t.months[n - 1])} (${n} month${n === 1 ? '' : 's'})`;
}

const NUMBERS = { eu: '1.234,56', space: '1 234,56', ch: '1\'234.56' };
/** Where a statement came from, in words: the file, how it was read and the sheet. A statement read before 4.7.28 has only its file and sheet. */
export function sourceText(t) {
  const s = t.source;
  if (!s || !s.type) return `${t.file || 'Statement'}${t.sheet && t.sheet !== 'CSV' ? ` · ${t.sheet}` : ''}`;
  const parts = [t.file || 'Statement'];
  if (s.type === 'paste') parts.push('pasted');
  else if (s.type === 'csv') parts.push(s.delimiter === ';' ? 'CSV (semicolons)' : 'CSV');
  else if (s.type === 'tsv') parts.push('tab-separated text');
  else if (s.type === 'xlsm') parts.push('Excel with macros (not run)');
  if (NUMBERS[s.numberFormat]) parts.push(`numbers read as ${NUMBERS[s.numberFormat]}`);
  if (s.sheets && s.sheets.length > 1) {
    const at = s.sheets.findIndex((x) => x.name === t.sheet);
    parts.push(`sheet “${t.sheet}”${at >= 0 ? ` (${at + 1} of ${s.sheets.length})` : ''}`);
  } else if (t.sheet && !['csv', 'tsv', 'paste'].includes(s.type)) parts.push(t.sheet);
  return parts.join(' · ');
}

/** A period in a few words for the sheet chooser: "T-6 · Jan 2026 to Jun 2026", "annual total only". */
export function periodShort(p) {
  if (!p) return '';
  const cols = p.columns.filter((c) => c.kind !== 'total');
  if (!cols.length) return p.basis === 'annual' ? 'annual total only' : p.basis;
  return `${p.basis} · ${cols[0].head} to ${cols[cols.length - 1].head}`;
}

/** What to say beside a line about how it was read: blank months (counted as $0), cells of words, pasted, medium confidence. */
export function lineNotes(t, l) {
  const out = [];
  const name = (i) => (/^M\d+$/.test(t.months[i] || '') ? `month ${+t.months[i].slice(1)}` : monthLabel(t.months[i]).slice(0, 3));
  if (l.blank && l.blank.length) out.push(`${l.blank.length} month${l.blank.length === 1 ? '' : 's'} blank (${l.blank.map(name).join(', ')}), counted as $0`);
  if (l.unread && l.unread.length) out.push(`${l.unread.length} cell${l.unread.length === 1 ? '' : 's'} unread (${l.unread.map((u) => `${u.text} in ${name(u.i)}`).join(', ')}), counted as $0`);
  if (l.src && l.src.type === 'pasteLine') out.push('pasted');
  else if (l.conf && l.conf.read === 'medium') out.push('medium confidence');
  return out;
}

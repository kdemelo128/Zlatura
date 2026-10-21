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
import { median } from './engine/comps.js';
import { conv } from './engine/conventions.js';

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
 * choices ({ normalised label: category id }) and `history` how each was made
 * (kv t12.labels entries, with the deals it was filed in); `section` is the
 * side the line sits under in the file, when the file says. A remembered label
 * is a suggestion, never a filing (T-12 PR 2): { category: null, how:
 * 'suggested', suggested }. So is a line whose wording says it is below the
 * line but sits under Expenses or under no heading ({ how: 'needs' }). With
 * `suggest: false` (the OM statement path, which files by position) the
 * remembered choice files as before ('yours') and no line needs classifying.
 * Returns { category, how: 'yours'|'rule'|'review'|'suggested'|'needs', why, candidates, suggested?, needs? }.
 */
export function matchLabel(label, { section = null, corrections = {}, history = {}, suggest = true } = {}) {
  const key = normalizeLabel(label);
  if (corrections && Object.prototype.hasOwnProperty.call(corrections, key) && CATEGORY[corrections[key]]) {
    const rc = corrections[key];
    if (!suggest) return { category: rc, how: 'yours', why: 'your choice for this label', candidates: [rc] };
    const r = ruleMatch(key, section, true);
    // its wording says the same as you did: it files by its wording, as before
    if (r.how === 'rule' && r.category === rc) return r;
    const h = history && Object.prototype.hasOwnProperty.call(history, key) ? history[key] : null;
    return { category: null, how: 'suggested', why: 'a label you filed before', candidates: [rc, ...r.candidates.filter((c) => c !== rc)], suggested: { category: rc, from: 'label', ...tally(h, rc) } };
  }
  return ruleMatch(key, section, suggest);
}

/** How the deals a label was filed in split: { n (under `rc`), m (deals), others: [{ category, n }] }, or {} where none are kept. */
function tally(h, rc) {
  const deals = h && Array.isArray(h.deals) ? h.deals.filter((x) => x && CATEGORY[x.category]) : [];
  if (!deals.length) return {};
  const other = new Map();
  for (const x of deals) if (x.category !== rc) other.set(x.category, (other.get(x.category) || 0) + 1);
  return { n: deals.length - [...other.values()].reduce((s, v) => s + v, 0), m: deals.length, others: [...other].map(([category, n]) => ({ category, n })).sort((p, q) => q.n - p.n) };
}

/** The built-in wording rules for a normalised label (the part of matchLabel that doesn't read your choices). */
function ruleMatch(key, section, needsAsk) {
  if (BARE_MANAGEMENT.test(key)) return { category: null, how: 'review', why: 'a management fee: the property manager’s (operating) or the owner’s (below the line)?', candidates: ['management', 'owner'] };
  let hits = CATEGORIES.filter((c) => c.rules.some((re) => re.test(key)) && !(c.unless && c.unless.test(key)));
  // a specific category wins over a catch-all, and base rent over "other income"
  const level = Math.min(...hits.map((c) => c.generic || 0));
  hits = hits.filter((c) => (c.generic || 0) === level);
  // where the file says which part of the statement a line is in, a category on the other side doesn't fit
  const fits = section ? hits.filter((c) => c.side === section || (section === 'expense' && c.side === 'below')) : hits;
  if (fits.length === 1) {
    // below the line by its wording, yet under Expenses or under no heading: that moves NOI, so it is asked, not decided
    if (needsAsk && fits[0].side === 'below' && section !== 'below') return { category: null, how: 'needs', needs: 'classification', why: `its wording says ${fits[0].label.toLowerCase()} (below the line), but it sits ${section ? 'under operating expenses' : 'under no heading'}`, candidates: [fits[0].id], suggested: { category: fits[0].id, from: 'wording' } };
    return { category: fits[0].id, how: 'rule', why: section && hits.length > 1 ? `the only fit under ${SIDES[section].toLowerCase()}` : 'its wording', candidates: [fits[0].id] };
  }
  if (!hits.length) return { category: null, how: 'review', why: 'no category fits its wording', candidates: [] };
  if (!fits.length) return { category: null, how: 'review', why: `its wording fits ${hits.map((c) => c.label.toLowerCase()).join(' or ')}, but it sits under ${SIDES[section].toLowerCase()}`, candidates: hits.map((c) => c.id) };
  return { category: null, how: 'review', why: `its wording fits ${fits.map((c) => c.label.toLowerCase()).join(' and ')}`, candidates: fits.map((c) => c.id) };
}

const TIMES = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
/** Why a category is suggested, in words: "mapped this way in 6 of your last 7 deals (once to Contract services)". */
export function suggestionText(s) {
  if (!s) return '';
  if (s.from === 'wording') return 'its wording says below the line';
  if (!(s.m > 0)) return 'mapped this way before';
  const others = (s.others || []).filter((o) => CATEGORY[o.category]);
  const tail = others.length ? ` (${others.map((o) => `${TIMES(o.n)} to ${CATEGORY[o.category].label}`).join(', ')})` : '';
  if (s.m === 1) return 'mapped this way in your last deal';
  if (s.n === s.m) return `mapped this way ${TIMES(s.n)}`;
  return `mapped this way in ${s.n} of your last ${s.m} deals${tail}`;
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
/** A column heading that is a quarter or a fiscal year: "Q1 2025", "2Q25", "Quarter 3", "3 months ended", "FY2025". */
const QUARTER_HEAD = /^(q[1-4]|[1-4]q)\b|quarter|3 months ended|^fy\s?\d{2,4}$/i;
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
export function readStatement(rows, { corrections = {}, history = {}, suggest = true, sheet = '', numberFormat = 'us', paste = false } = {}) {
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
    Object.assign(line, pick({}, matchLabel(label, { section: line.section, corrections, history, suggest })));
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
  // columns headed as quarters or fiscal years, not months: only the Total is read; said, never guessed at (PR 3b)
  const heads = n === 0 ? head.row.cells.filter((v) => typeof v === 'string' && QUARTER_HEAD.test(v.trim())).map((v) => v.trim().slice(0, 40)) : [];
  const nonMonthly = heads.length >= 2 ? { kind: heads.every((h) => /^fy/i.test(h)) ? 'years' : 'quarters', heads } : null;
  const above = rows.find((x) => x.r < head.row.r && /period|months ended|year ended|ytd|as of/i.test(x.cells.filter((v) => typeof v === 'string').join(' ')));
  return {
    basis, dated, count: n,
    columns: [...monthCols.map((m) => ({ c: m.c, kind: m.iso ? 'month' : 'index', head: String(head.row.cells[m.c]).slice(0, 40) })), ...(totalCol !== null ? [{ c: totalCol, kind: 'total', head: totalHead.slice(0, 40) }] : [])],
    gaps, duplicates, emptyCols,
    printed: above ? above.cells.filter((v) => v !== null && v !== undefined && String(v).trim()).join(' ').slice(0, 120) : null,
    ...(nonMonthly ? { nonMonthly } : {}),
  };
}

/**
 * The file's sign conventions turned into the analysis's: income positive,
 * reductions negative, expenses positive as costs. Decided for the whole
 * file from the sides its lines are in: where most expense lines are
 * negative, the file writes expenses negative, and so on. Returns a copy.
 */
export function normalizeSigns(st) {
  // a line waiting on your confirmation is signed as the suggestion would file it, so Confirm needs no second look at the sign
  const cat = (l) => l.category || (l.suggested && l.suggested.category) || null;
  const side = (l) => (cat(l) ? CATEGORY[cat(l)].side : l.section);
  const majorityNegative = (ls) => { const xs = ls.filter((l) => l.total !== 0); return xs.length > 0 && xs.filter((l) => l.total < 0).length > xs.length / 2; };
  const expenseLike = st.lines.filter((l) => side(l) === 'expense' || side(l) === 'below');
  const reductions = st.lines.filter((l) => cat(l) && CATEGORY[cat(l)].reduces);
  const flipExpenses = majorityNegative(expenseLike);
  // reductions written as positive amounts under income ("Less: vacancy  12,000") are made negative
  const flipReductions = reductions.length > 0 && !majorityNegative(reductions);
  const out = { ...st, signs: { expensesNegative: flipExpenses, reductionsPositive: flipReductions } };
  out.lines = st.lines.map((l) => {
    const s = side(l);
    let f = 1;
    if ((s === 'expense' || s === 'below') && flipExpenses) f = -1;
    if (cat(l) && CATEGORY[cat(l)].reduces && flipReductions) f = -1;
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
 * result; a full year, or no months, gives null: nothing to scale. `n` is what
 * it is scaled over: its month columns (the default), or its months with
 * activity when the broker said so (`activity`, T-12 PR 3a): the one function.
 */
export function annualized(T, n = T.months) {
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
 * @param {{ file?: string, sheet?: string, corrections?: Record<string, string>, history?: Record<string, any>, suggest?: boolean, now?: number, numberFormat?: string, source?: Record<string, any> }} [opts]
 */
export function importStatement(rows, { file = '', sheet = '', corrections = {}, history = {}, suggest = true, now = Date.now(), numberFormat = 'us', source = {} } = {}) {
  const st = normalizeSigns(readStatement(rows, { corrections, history, suggest, sheet, numberFormat, paste: source.type === 'paste' }));
  const from = { type: source.type, file, size: source.size, sheet, sheets: source.sheets, delimiter: source.delimiter, numberFormat, numberAsked: source.numberAsked, encoding: source.encoding, macros: source.macros };
  const t = {
    v: 2, file, sheet, source: Object.fromEntries(Object.entries(from).filter(([, x]) => x !== undefined)), period: st.period,
    importedAt: now, months: st.months, lines: st.lines, stated: st.stated, subtotals: st.subtotals, signs: st.signs, headRow: st.headRow, seen: {},
  };
  // more than 12 dated months: the latest 12 calendar months are the T-12, the rest are kept as the prior period (PR 3a)
  if (new Set(t.months.filter(isIso)).size > 12) chooseMonths(t, latestFrom(t));
  return t;
}

const PROJECTION = /\b(budget|forecast|pro ?forma|projected|projection)\b/i;

/**
 * Every sheet of a file tried as a statement: [{ sheet, i (its place in the file), hidden, projection, lines,
 * period, error }]. `projection` is a sheet whose name, or first five rows, say budget, forecast, pro forma
 * or projection. A sheet that doesn't read as a statement has `error` (its reason) and no lines. Nothing is
 * chosen here, and nothing is ordered by how many lines a sheet has: an actual statement is never decided
 * by size.
 * @param {{ sheet: string, hidden?: boolean, rows: any[] }[]} grids
 * @param {{ file?: string, corrections?: Record<string, string>, history?: Record<string, any>, suggest?: boolean }} [opts]
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

/**
 * Re-apply the rules and the broker's remembered labels to the lines still
 * without a category (after a label is remembered). A line already filed is
 * never touched: a filing made before suggestions (`yours`, `rule`) keeps its meaning.
 */
export function rematch(t, corrections, history = {}) {
  return { ...t, lines: t.lines.map((l) => (l.category ? l : pick(l, matchLabel(l.label, { section: l.section, corrections, history })))) };
}
/** A line with a match applied: its category, how, why and candidates, and the `suggested` / `needs` the match carries (a stale one is dropped). */
function pick(l, m) {
  const { suggested, needs, ...rest } = l;
  return { ...rest, category: m.category, how: m.how, why: m.why, candidates: m.candidates, ...(m.suggested ? { suggested: m.suggested } : {}), ...(m.needs ? { needs: m.needs } : {}) };
}

/** The lines still waiting for a category. */
export const openLines = (t) => (t && t.lines ? t.lines.filter((l) => !l.category) : []);
/** The statement's checks not yet marked seen. */
export const openChecks = (t) => (t ? statementChecks(t).filter((c) => !(t.seen && t.seen[c.id])) : []);

/** What the analysis reads of a deal's T-12 (impact.js analysisInput): its totals, how many months they cover, and `held`: how many period checks hold the totals back (a month counted twice, a file of more than 12 months, running totals). */
export function t12ForAnalysis(t) {
  if (!t || !Array.isArray(t.lines)) return null;
  const T = statementTotals(t);
  return { noi: T.noi, egi: T.egi, opex: T.opex, taxes: T.taxes, months: T.months, from: t.months[0] || null, to: t.months[t.months.length - 1] || null, unassigned: T.unassigned, open: openLines(t).length, held: heldCount(t) };
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
  for (const l of changed) { delete l.suggested; delete l.needs; Object.assign(l, { category, how: 'you', why: 'your choice', candidates: [category] }); }
  return changed;
}

/**
 * File every line that has a suggestion from a remembered label (in place), as the broker confirmed them
 * all. Lines that need classification are left alone: they move NOI between sides. Returns the labels
 * filed, one per label: [{ key, label, category, lineIds }].
 */
export function confirmSuggested(t) {
  const out = [];
  for (const l of t.lines) {
    if (l.category || l.needs || !l.suggested || !CATEGORY[l.suggested.category]) continue;
    const category = l.suggested.category;
    const changed = fileLine(t, l.id, category);
    out.push({ key: l.key, label: l.label, category, lineIds: changed.map((x) => x.id) });
  }
  return out;
}

/** The lines filed before suggestions existed: a remembered label that filed itself (`yours`), or a capex-type line under Expenses filed out of NOI by its wording. */
export const earlierFilings = (t) => (t && t.lines ? t.lines.filter((l) => l.how === 'yours' || (l.how === 'rule' && l.category && CATEGORY[l.category] && CATEGORY[l.category].side === 'below' && l.section !== 'below')) : []);

/**
 * Notes on the statement, not checks: [{ id, kind: 'note', text, lineIds }], unless marked seen. One, for a
 * statement filed by an earlier version: its filings are kept as they were, and said so.
 */
export function statementNotes(t) {
  if (!t || (t.seen && t.seen['note.earlier'])) return [];
  const ls = earlierFilings(t);
  if (!ls.length) return [];
  const names = [...new Set(ls.map((l) => l.label))];
  return [{ id: 'note.earlier', kind: 'note', lineIds: ls.map((l) => l.id), text: `${ls.length} line${ls.length === 1 ? ' was' : 's were'} filed by an earlier version of Zlatura from a label you filed before or by its wording, without asking: ${names.slice(0, 4).join(', ')}${names.length > 4 ? ', …' : ''}. They are kept as they were. Zlatura now asks first; change any of them in Every line.` }];
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

/* ------------------------------------------------ period structure (T-12 PR 3a)
 *
 * Which months and columns are counted. A statement keeps what the file had,
 * and the broker's choices rewrite `months`, each line's `months` and `total`
 * (everything downstream reads those unchanged):
 *   period.chosen { from, to, by }   the T-12's 12 calendar months, when the file has more than 12
 *   period.prior { months }, line.prior { months, total, blank? }   the months outside them
 *   period.dropped [{ iso, c, head, n }], line.dropped [numbers]    a month's columns not used
 *   period.cols [{ c, head, n }]     the columns now in `months`, in order (`n`: which of a month's columns)
 *   period.columnsAre 'monthly'|'cumulative', line.cumulative [numbers]   the printed running totals
 *   window { n, how: 'active'|'columns' }   what Annualise divides by (docs/proposals/underwriting.md §3.7)
 * Nothing is rewritten on load: a statement saved before has none of these, and the checks below read what
 * it has. Nothing is picked for the broker: a month in two columns, a file of more than 12 months and
 * columns that look like running totals hold the totals back until they choose (Part 21.2: counted twice,
 * monthly against annual). Design: docs/proposals/t12-multiformat.md §3, §5. */

const isIso = (s) => /^\d{4}-\d{2}$/.test(s || '');
const mkey = (iso) => +iso.slice(0, 4) * 12 + +iso.slice(5) - 1;
const isoOfKey = (k) => `${Math.floor(k / 12)}-${pad((k % 12) + 1)}`;
/** "A" for column 0, "M" for 12, "AA" for 26. */
const colLetter = (c) => { let out = ''; for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out; return out; };
const usd0 = (x) => `${x < 0 ? '−' : ''}$${Math.round(Math.abs(x)).toLocaleString('en-US')}`;
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
/** "Oct 2024 to Dec 2024" per run of consecutive calendar months ("Oct 2024" for a single month), joined with "and". */
function rangesText(isos) {
  const ks = [...new Set(isos.filter(isIso).map(mkey))].sort((a, b) => a - b);
  const runs = [];
  for (const k of ks) { const r = runs[runs.length - 1]; if (r && k === r[1] + 1) r[1] = k; else runs.push([k, k]); }
  return list(runs.map(([a, b]) => (a === b ? monthLabel(isoOfKey(a)) : `${monthLabel(isoOfKey(a))} to ${monthLabel(isoOfKey(b))}`)));
}

/** The columns now in `months`, aligned to it: { c?, head?, n } (`n`: which of the columns headed by that month it was, from 0). */
function inCols(t) {
  const p = t.period || {};
  const file = (p.columns || []).filter((c) => c.kind !== 'total');
  const have = p.cols && p.cols.length === t.months.length ? p.cols : file.length === t.months.length ? file : [];
  return t.months.map((iso, i) => {
    const x = have[i] || {};
    return { ...(x.c !== undefined ? { c: x.c } : {}), ...(x.head !== undefined ? { head: x.head } : {}), n: x.n !== undefined ? x.n : t.months.slice(0, i).filter((m) => m === iso).length };
  });
}

/**
 * Every column the file had, with where it is now: 'in' (counted), 'prior' (outside the 12 months) or
 * 'dropped' (one of several columns for a month, not used). `vals`, `blank` and `unread` have one entry per line.
 */
function poolOf(t) {
  const L = t.lines; const p = t.period || {};
  const cols = [];
  const info = inCols(t);
  t.months.forEach((iso, i) => cols.push({
    iso, role: 'in', ...info[i],
    vals: L.map((l) => l.months[i]),
    blank: L.map((l) => !!(l.blank && l.blank.includes(i))),
    unread: L.map((l) => (l.unread || []).find((u) => u.i === i) || null),
  }));
  const prior = (p.prior && p.prior.months) || [];
  prior.forEach((iso, j) => cols.push({
    iso, role: 'prior', n: prior.slice(0, j).filter((m) => m === iso).length,
    vals: L.map((l) => (l.prior && l.prior.months[j]) || 0),
    blank: L.map((l) => !!(l.prior && l.prior.blank && l.prior.blank.includes(j))),
    unread: L.map(() => null),
  }));
  (p.dropped || []).forEach((d, k) => cols.push({
    iso: d.iso, role: 'dropped', ...(d.c !== undefined ? { c: d.c } : {}), ...(d.head !== undefined ? { head: d.head } : {}), n: d.n !== undefined ? d.n : 1,
    vals: L.map((l) => (l.dropped && l.dropped[k]) || 0),
    blank: L.map(() => false), unread: L.map(() => null),
  }));
  return cols;
}

/** Write a pool back (in place): months, each line's months, total, blank, unread, prior and dropped, all consistent. */
function commit(t, cols) {
  const inn = cols.filter((x) => x.role === 'in');
  if (inn.every((x) => isIso(x.iso))) inn.sort((a, b) => mkey(a.iso) - mkey(b.iso) || a.n - b.n);
  const pri = cols.filter((x) => x.role === 'prior');
  const drp = cols.filter((x) => x.role === 'dropped');
  const sum = (xs) => cents(xs.reduce((s, v) => s + v, 0));
  t.months = inn.map((x) => x.iso);
  t.lines.forEach((l, li) => {
    l.months = inn.map((x) => x.vals[li]);
    l.total = sum(l.months);
    const blank = []; const unread = [];
    inn.forEach((x, i) => { if (x.blank[li]) blank.push(i); if (x.unread[li]) unread.push({ i, text: x.unread[li].text }); });
    if (blank.length) l.blank = blank; else delete l.blank;
    if (unread.length) l.unread = unread; else delete l.unread;
    if (pri.length) {
      const pb = []; pri.forEach((x, j) => { if (x.blank[li]) pb.push(j); });
      l.prior = { months: pri.map((x) => x.vals[li]), total: sum(pri.map((x) => x.vals[li])), ...(pb.length ? { blank: pb } : {}) };
    } else delete l.prior;
    if (drp.length) l.dropped = drp.map((x) => x.vals[li]); else delete l.dropped;
  });
  const p = t.period || (t.period = /** @type {any} */ ({}));
  const meta = (x) => ({ ...(x.c !== undefined ? { c: x.c } : {}), ...(x.head !== undefined ? { head: x.head } : {}), n: x.n });
  p.cols = inn.map(meta);
  if (pri.length) p.prior = { months: pri.map((x) => x.iso) }; else delete p.prior;
  if (drp.length) p.dropped = drp.map((x) => ({ iso: x.iso, ...meta(x) })); else delete p.dropped;
  // the basis of what is counted now, when it is dated months in a row
  const ks = inn.map((x) => (isIso(x.iso) ? mkey(x.iso) : NaN));
  if (inn.length && ks.every((k, i) => Number.isFinite(k) && (i === 0 || k === ks[i - 1] + 1))) p.basis = inn.length === 12 ? 'T-12' : inn.length < 12 ? `T-${inn.length}` : p.basis;
}

/** Running totals turned back into the months as printed (in place); a no-op for a statement read as monthly. */
function undoRunning(t) { for (const l of t.lines) if (l.cumulative) { l.months = l.cumulative; delete l.cumulative; l.total = cents(l.months.reduce((s, v) => s + v, 0)); } }
/** Each month as the difference from the month before; the printed running totals are kept on the line (in place). */
function doRunning(t) {
  for (const l of t.lines) {
    l.cumulative = l.months.slice();
    l.months = l.cumulative.map((v, i) => (i ? cents(v - l.cumulative[i - 1]) : v));
    l.total = cents(l.months.reduce((s, v) => s + v, 0));
  }
}

/** Change the pool (a choice of months or of a column) with the columns read as monthly, then read as running totals again if they were. `fn` returns false to change nothing. */
function reshape(t, fn) {
  const running = !!(t.period && t.period.columnsAre === 'cumulative');
  if (running) undoRunning(t);
  const cols = poolOf(t);
  const done = fn(cols) !== false;
  if (done) commit(t, cols);
  if (running) doRunning(t);
  return done;
}

/** The months of the file that could be a T-12's first: the latest 12's start first, then every earlier month present. */
function windowStarts(t) {
  const isos = poolOf(t).filter((x) => x.role !== 'dropped' && isIso(x.iso)).map((x) => mkey(x.iso));
  if (!isos.length) return [];
  const latest = Math.max(...isos) - 11;
  return [...new Set([latest, ...isos.filter((k) => k < latest)])].sort((a, b) => b - a).map(isoOfKey);
}
/** The first month of the latest 12 calendar months the statement has. */
function latestFrom(t) {
  const ks = poolOf(t).filter((x) => x.role !== 'dropped' && isIso(x.iso)).map((x) => mkey(x.iso));
  return isoOfKey(Math.max(...ks) - 11);
}

/**
 * The 12 calendar months from `from` are the T-12; every other dated month is kept as the prior period (in
 * place). Returns false (nothing changed) when no column falls in them. `by` is 'latest' when `from` starts the
 * latest 12 months the file has, else 'you'.
 */
export function chooseMonths(t, from) {
  if (!isIso(from)) return false;
  const k0 = mkey(from);
  const inside = (x) => isIso(x.iso) && mkey(x.iso) >= k0 && mkey(x.iso) <= k0 + 11;
  const ok2 = reshape(t, (cols) => {
    if (!cols.some((x) => x.role !== 'dropped' && inside(x))) return false;
    for (const x of cols) if (x.role !== 'dropped' && isIso(x.iso)) x.role = inside(x) ? 'in' : 'prior';
    return true;
  });
  if (!ok2) return false;
  const p = t.period;
  if (p.prior) p.chosen = { from, to: isoOfKey(k0 + 11), by: from === latestFrom(t) ? 'latest' : 'you' };
  else delete p.chosen;
  return true;
}

/** The columns a month heads, in file order: [{ k, role, c?, head?, sum }] (`sum`: what its lines add up to, ignoring signs). */
export function columnsOfMonth(t, iso) {
  return poolOf(t).filter((x) => x.iso === iso && x.role !== 'prior').sort((a, b) => a.n - b.n)
    .map((x, k) => ({ k, role: x.role, ...(x.c !== undefined ? { c: x.c } : {}), ...(x.head !== undefined ? { head: x.head } : {}), sum: cents(x.vals.reduce((s, v) => s + Math.abs(v), 0)) }));
}

/** Count only the `k`th of the columns a month heads (in file order); the others are kept apart, so the choice can change (in place). */
export function chooseColumn(t, iso, k) {
  return reshape(t, (cols) => {
    const opts = cols.filter((x) => x.iso === iso && x.role !== 'prior').sort((a, b) => a.n - b.n);
    if (!opts[k]) return false;
    opts.forEach((x, i) => { x.role = i === k ? 'in' : 'dropped'; });
    return true;
  });
}

/** Read the columns as 'monthly' figures (as printed) or 'cumulative' (running totals: each month is the difference from the one before), in place. */
export function readColumnsAs(t, how) {
  const p = t.period || (t.period = /** @type {any} */ ({}));
  if (how === 'cumulative' && p.columnsAre !== 'cumulative') doRunning(t);
  else if (how === 'monthly' && p.columnsAre === 'cumulative') undoRunning(t);
  p.columnsAre = how;
  return t;
}

/** The months with activity, as the broker's answer to "annualise over which?" (in place): N, or all the columns. */
export function setWindow(t, how) {
  const a = activity(t);
  t.window = { n: how === 'active' ? a.n : a.columns, how };
  return t;
}

/* ------------------------------------------------------------ activity */

/**
 * Which months had activity: { columns, active, gaps, before, after, n }. A month has activity when any line
 * (either side, filed or not) has a non-zero value in it (a blank counts as 0, but a month blank on one line and
 * non-zero on another is active). `gaps` are inactive months between the first and last active; `before` and
 * `after` the inactive ones outside them (not gaps). `n` is the number of months with activity; `columns` how
 * many month columns there are. Dated months are in calendar order.
 */
export function activity(t) {
  const L = t.lines;
  const seen = new Map();
  t.months.forEach((iso, i) => seen.set(iso, (seen.get(iso) || false) || L.some((l) => l.months[i] !== 0)));
  let months = [...seen.keys()];
  if (months.every(isIso)) months.sort((a, b) => mkey(a) - mkey(b));
  const first = months.findIndex((m) => seen.get(m));
  const last = months.length - 1 - [...months].reverse().findIndex((m) => seen.get(m));
  const active = months.filter((m) => seen.get(m));
  if (!active.length) return { columns: t.months.length, active, gaps: [], before: [], after: [], n: 0 };
  return {
    columns: t.months.length, active, n: active.length,
    before: months.slice(0, first), gaps: months.slice(first, last + 1).filter((m) => !seen.get(m)), after: months.slice(last + 1),
  };
}

/* -------------------------------------------------------------- checks */

/** Do most lines rise every month and end at the file's Total, as running (year-to-date) totals do? Needs a Total column. */
function runningTotals(t) {
  if (t.months.length < 2) return null;
  const cand = t.lines.filter((l) => l.fileTotal !== null && l.fileTotal !== undefined && l.months.filter((v) => v !== 0).length >= 2);
  if (cand.length < 2) return null;
  const good = cand.filter((l) => l.months.every((v, i) => i === 0 || Math.abs(v) >= Math.abs(l.months[i - 1])) && Math.abs(cents(l.months[l.months.length - 1] - l.fileTotal)) <= 1);
  return good.length > cand.length / 2 ? { good: good.length, of: cand.length } : null;
}
const hasTotalColumn = (t) => t.lines.some((l) => l.fileTotal !== null && l.fileTotal !== undefined);

/** The period problems that hold the totals back, cheaply: how many are open (a month in two columns, more than 12 months, running totals not answered). */
export function heldCount(t) {
  if (!t || !Array.isArray(t.months) || !Array.isArray(t.lines)) return 0;
  const by = new Map();
  for (const m of t.months) if (isIso(m)) by.set(m, (by.get(m) || 0) + 1);
  let n = [...by.values()].filter((c) => c > 1).length;
  if (by.size > 12) n += 1;
  if (!(t.period && t.period.columnsAre) && runningTotals(t)) n += 1;
  return n;
}

/**
 * The statement's period checks, in dataqc.js's shape: [{ id, kind, level, text, amount, where, holds?, short?, fixes? }].
 * `holds` says what an open one holds back: 'totals' (the card shows no figures, Use and the comparison wait),
 * 'annualise'. A choice that settled one is kept as a 'pass' line, and the split of a long file as an 'info'
 * note, each with `fixes` flagged `more` that change the choice. `fixes` are { id, label, more? }, applied by
 * applyT12Fix.
 * @param {any} t
 * @returns {any[]}
 */
export function periodChecks(t) {
  /** @type {any[]} */
  const out = [];
  if (!t || !Array.isArray(t.months) || !Array.isArray(t.lines)) return out;
  const p = t.period || {};
  const T0 = statementTotals(t);
  const by = new Map();
  for (const m of t.months) if (isIso(m)) by.set(m, (by.get(m) || 0) + 1);
  const dated = [...by.keys()].sort();

  // a month in two or more columns
  const dups = [...by].filter(([, c]) => c > 1).map(([iso]) => iso);
  for (const iso of dups) {
    const opts = columnsOfMonth(t, iso);
    const letters = opts.map((o) => (o.c !== undefined ? colLetter(o.c) : null));
    const named = letters.every((x) => x);
    const n = opts.length;
    const label = monthLabel(iso);
    out.push({
      id: `period.dup.${iso}`, kind: 'duplicate', level: 'fail', holds: 'totals', short: `${label} is in ${n === 2 ? 'two' : n} columns`,
      text: `${label} heads ${n === 2 ? 'two' : n} columns${named ? ` (${list(letters)})` : ''}. Counting ${n === 2 ? 'both' : 'all'} counts ${label} ${n === 2 ? 'twice' : `${n} times`}, so the totals are held. Choose the column to use. ${named ? `Across all lines, ${list(opts.map((o, i) => `${letters[i]} adds up to ${usd0(o.sum)}`))}.` : `Across all lines they add up to ${list(opts.map((o) => usd0(o.sum)))}.`}`,
      amount: Math.max(...opts.map((o) => o.sum)),
      where: named ? `columns ${list(letters)}, heading ${label}` : `the ${n} columns headed ${label}`,
      fixes: opts.map((o, k) => ({ id: `col:${iso}:${k}`, label: named ? `Use column ${letters[k]}` : `Use column ${k + 1} of ${n}` })),
    });
  }
  // a month that had several columns and now has one: the choice, kept so it can change
  const droppedIsos = [...new Set((p.dropped || []).map((d) => d.iso))].filter((iso) => !dups.includes(iso));
  for (const iso of droppedIsos) {
    const opts = columnsOfMonth(t, iso);
    const cur = opts.findIndex((o) => o.role === 'in');
    const nm = (o, k) => (o.c !== undefined ? `column ${colLetter(o.c)}` : `column ${k + 1}`);
    out.push({
      id: `period.dup.${iso}`, kind: 'duplicate', level: 'pass',
      text: `${monthLabel(iso)} headed ${opts.length} columns: ${nm(opts[cur], cur)} is counted, ${list(opts.filter((o, k) => k !== cur).map((o) => nm(o, opts.indexOf(o))))} ${opts.length === 2 ? 'is' : 'are'} not (your choice).`,
      amount: 0,
      fixes: opts.map((o, k) => ({ id: `col:${iso}:${k}`, label: `Use ${nm(o, k)} instead`, more: true })).filter((f, k) => k !== cur),
    });
  }

  // more than 12 months, none chosen
  if (dated.length > 12) {
    const label = (from) => `${monthLabel(from)} to ${monthLabel(isoOfKey(mkey(from) + 11))}`;
    const latest = latestFrom(t);
    const keep = structuredClone(t);
    chooseMonths(keep, latest);
    out.push({
      id: 'period.long', kind: 'long', level: 'fail', holds: 'totals', short: `${dated.length} months, not 12`,
      text: `This statement has ${dated.length} months (${monthLabel(dated[0])} to ${monthLabel(dated[dated.length - 1])}), more than a T-12’s 12. Read as a year, the totals would add up ${dated.length} months, so they are held. Choose the 12 months to use; the latest 12 (${label(latest)}) come first.`,
      amount: cents(Math.abs(T0.noi - statementTotals(keep).noi)),
      where: `${monthLabel(dated[0])} to ${monthLabel(dated[dated.length - 1])}`,
      fixes: windowStarts(t).map((from, i) => ({ id: `months:${from}`, label: i === 0 ? `Use the latest 12 (${label(from)})` : `Use ${label(from)}`, ...(i ? { more: true } : {}) })),
    });
  }
  // the split, done: said, and changeable
  if (p.chosen && p.prior && p.prior.months.length) {
    const total = t.months.length + p.prior.months.length;
    out.push({
      id: 'period.chosen', kind: 'chosen', level: 'info', amount: 0,
      text: `${total} months: the ${p.chosen.by === 'latest' ? 'latest 12' : '12 months you chose'} (${monthLabel(p.chosen.from)} to ${monthLabel(p.chosen.to)}) are the T-12; ${rangesText(p.prior.months)} ${p.prior.months.length === 1 ? 'is' : 'are'} kept as the prior period. Change…`,
      fixes: windowStarts(t).filter((f) => f !== p.chosen.from).map((from) => ({ id: `months:${from}`, label: `Use ${monthLabel(from)} to ${monthLabel(isoOfKey(mkey(from) + 11))}`, more: true })),
    });
  }

  // running totals
  if (p.columnsAre) {
    const cum = p.columnsAre === 'cumulative';
    out.push({
      id: 'period.cumulative', kind: 'cumulative', level: 'pass', amount: 0,
      text: cum ? 'The columns are read as running totals: each month is the difference from the month before (your choice).' : 'The columns are read as monthly figures, as printed (your choice).',
      fixes: [{ id: cum ? 'cols:monthly' : 'cols:cumulative', label: cum ? 'Read them as monthly' : 'Read them as running totals', more: true }],
    });
  } else {
    const r = runningTotals(t);
    if (r) {
      const other = structuredClone(t);
      readColumnsAs(other, 'cumulative');
      const noiM = T0.noi; const noiC = statementTotals(other).noi;
      out.push({
        id: 'period.cumulative', kind: 'cumulative', level: 'warn', holds: 'totals', short: 'the columns may be running totals',
        text: `Most lines rise every month and end at the Total, as running (year-to-date) totals do (${r.good} of ${r.of} lines). Are the columns monthly or cumulative? Read as monthly, NOI is ${usd0(noiM)}; read as running totals, ${usd0(noiC)}.`,
        amount: cents(Math.abs(noiM - noiC)), where: `${r.good} of ${r.of} lines`,
        fixes: [{ id: 'cols:monthly', label: `Monthly columns (NOI ${usd0(noiM)})` }, { id: 'cols:cumulative', label: `Running totals (NOI ${usd0(noiC)})` }],
      });
    }
  }

  // dated months skipped between the first and last
  if (dated.length >= 2) {
    const missing = [];
    for (let k = mkey(dated[0]); k <= mkey(dated[dated.length - 1]); k++) if (!by.has(isoOfKey(k))) missing.push(isoOfKey(k));
    if (missing.length) out.push({
      id: 'period.gaps', kind: 'gaps', level: 'warn', amount: 0, where: rangesText(missing),
      text: `${missing.length} month${missing.length === 1 ? '' : 's'} between ${monthLabel(dated[0])} and ${monthLabel(dated[dated.length - 1])} ${missing.length === 1 ? 'is' : 'are'} not in the file (${rangesText(missing)}). The totals are the months that are there, not scaled up.`,
      fixes: [{ id: 'seen', label: 'Seen' }],
    });
  }

  // columns exactly 3 (or 12) months apart: dated quarter ends (3/31, 6/30 …) read as single months. Annualise and
  // the run rate would multiply by the wrong number (monthly against quarterly), so they wait for the broker (F1, PR 3b)
  if (dated.length >= 2) {
    const ks = dated.map(mkey);
    const step = ks[1] - ks[0];
    if ((step === 3 || step === 12) && ks.every((k, i) => i === 0 || k - ks[i - 1] === step)) {
      const n = t.months.length;
      const A = annualized(T0, n);
      const first = dated[0]; const last = dated[dated.length - 1];
      const span = first.slice(0, 4) === last.slice(0, 4) ? `${monthLabel(first).slice(0, 3)} to ${monthLabel(last)}` : `${monthLabel(first)} to ${monthLabel(last)}`;
      out.push({
        id: 'period.quarterends', kind: 'quarterends', level: 'warn', holds: 'annualise', short: `the columns may be ${step === 3 ? 'quarters' : 'years'}`,
        text: `The ${dated.length} columns are ${step} months apart (${span}): each may be a ${step === 3 ? 'quarter' : 'year'}. Read as months, Annualize would ${A ? `multiply by ${+(12 / n).toFixed(2)}` : 'add them up as one year'}. Are they single months? If not, use the Total column.`,
        amount: A ? cents(Math.abs(A.noi - T0.noi)) : 0, where: span,
        fixes: [{ id: 'seen', label: 'They are single months' }],
      });
    }
  }

  // months with no activity: N, what Annualise divides by (asked only when nothing above is open)
  if (!out.some((c) => c.holds === 'totals')) {
    const a = activity(t);
    if (a.n > 0 && a.n !== a.columns) {
      const w = t.window;
      const good = w && ((w.how === 'active' && w.n === a.n) || (w.how === 'columns' && w.n === a.columns));
      const quiet = [...a.before, ...a.gaps, ...a.after];
      if (good) {
        out.push({
          id: 'period.active', kind: 'active', level: 'pass', amount: 0,
          text: w.how === 'active' ? `N = ${a.n}, ${rangesText(quiet)} had no activity (your choice).` : `N = ${a.columns}, all the columns, though ${rangesText(quiet)} had no activity (your choice).`,
          fixes: [{ id: w.how === 'active' ? 'win:columns' : 'win:active', label: w.how === 'active' ? `Use all ${a.columns} columns` : `Use ${a.n} months with activity`, more: true }],
        });
      } else {
        const T1 = statementTotals(t);
        const A1 = annualized(T1, a.columns); const A2 = annualized(T1, a.n);
        const parts = [];
        if (a.gaps.length) parts.push(`${rangesText(a.gaps)} ${a.gaps.length === 1 ? 'has' : 'have'} no activity on any line (every line $0 or blank)`);
        if (a.before.length) parts.push(`activity starts in ${monthName(a.active[0])}; ${rangesText(a.before)} ${a.before.length === 1 ? 'has' : 'have'} none`);
        if (a.after.length) parts.push(`activity ends in ${monthName(a.active[a.active.length - 1])}; ${rangesText(a.after)} ${a.after.length === 1 ? 'has' : 'have'} none`);
        const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
        out.push({
          id: 'period.active', kind: 'active', level: 'warn', holds: 'annualise', short: 'months with no activity',
          text: `${[first, ...parts.slice(1)].join('; ')}: ${a.n} month${a.n === 1 ? '' : 's'} with activity of ${a.columns} columns. Annualise over ${a.n} month${a.n === 1 ? '' : 's'} with activity, or all ${a.columns} columns?`,
          amount: A1 && A2 ? cents(Math.abs(A1.noi - A2.noi)) : 0, where: rangesText(quiet),
          fixes: [{ id: 'win:active', label: `Over ${a.n} months with activity` }, { id: 'win:columns', label: `Over all ${a.columns} columns` }],
        });
      }
    }
  }

  // every month there is a distinct, dated column: said
  if (dated.length && dated.length === t.months.length && !out.some((c) => c.kind === 'duplicate' || c.kind === 'long' || c.kind === 'chosen')) {
    out.push({ id: 'period.ok', kind: 'months', level: 'pass', amount: 0, text: `${t.months.length} distinct month column${t.months.length === 1 ? '' : 's'}, none repeated.` });
  }
  return out;
}

/** The checks that hold the totals back while open: [{ id, short, text, … }]. */
export const heldBy = (t) => periodChecks(t).filter((c) => c.holds === 'totals');

/** What Annualise divides by, and whether it is still to be asked: { n, ask } (`n`: the months with activity once answered so, else the columns). */
export function windowOf(t) {
  const a = activity(t);
  const seen = t.seen || {};
  // any open check that holds Annualise: the months with no activity (answered by the window), the columns that may be quarters (answered by Seen)
  const ask = periodChecks(t).some((c) => c.holds === 'annualise' && !seen[c.id]);
  const w = t.window;
  const active = !!(w && w.how === 'active' && w.n === a.n && a.n !== a.columns);
  return { n: active ? a.n : a.columns, columns: a.columns, active: a.n, ask };
}

/* ------------------------------------------------ value checks (T-12 PR 3b)
 *
 * What the amounts in the months say, worked out from the statement each time (nothing stored): a spike, a
 * negative expense, a large one-off and a year over year change, with thresholds the broker can set (Settings →
 * Calculation conventions, `conv('t12.…')`). All of them warn or note and none holds the totals or Use
 * (docs/proposals/underwriting.md §7). Amounts are compared in whole cents so a boundary is exact. Lines are
 * as stored (signed by normalizeSigns); blank months are 0 and left out of a typical month. Not run while a
 * period check holds the totals (a month counted twice would make spikes). Design: docs/proposals/t12-multiformat.md §4-5. */

const c100 = (x) => Math.round(cents(x) * 100);
const fromC = (c) => cents(c / 100);
/** Dollars, with cents only where there are some: "$3,000", "$499.99". */
const usdx = (x) => (c100(x) % 100 === 0 ? usd0(x) : `${x < 0 ? '−' : ''}$${Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const sideOfLine = (l) => (l.category && CATEGORY[l.category] ? CATEGORY[l.category].side : l.section);
/** 'income' or 'expense' for a line that is in NOI's reach (filed or not), else null (below the line). */
const noiSide = (l) => { const s = sideOfLine(l); return s === 'income' || s === 'expense' ? s : null; };
const isReduction = (l) => !!(l.category && CATEGORY[l.category] && CATEGORY[l.category].reduces);
const monthWord = (iso) => (/^M\d+$/.test(iso || '') ? `Month ${+iso.slice(1)}` : monthLabel(iso));
const gets = (n) => `${+n.toFixed(2)}`;

/**
 * The lines with a large one-off month: [{ line, side, i, iso, amountC, totalC }] (cents). An income or expense
 * line whose period total (in the direction it counts: a reduction such as vacancy the other way) is at least
 * `t12.oneoff.side` % of its side's total, and one month holds at least `t12.oneoff.share` % of it (the largest, the earliest on a tie).
 */
function oneoffs(t) {
  const side = { income: 0, expense: 0 };
  for (const l of t.lines) { const s = noiSide(l); if (s) side[s] += c100(l.total); }
  const share = conv('t12.oneoff.share'); const sidePct = conv('t12.oneoff.side');
  const out = [];
  for (const l of t.lines) {
    const s = noiSide(l);
    if (!s) continue;
    const sign = isReduction(l) ? -1 : 1;
    const tc = c100(l.total) * sign;
    if (!(tc > 0) || tc < Math.round((Math.abs(side[s]) * sidePct) / 100)) continue;
    let at = -1; let top = 0;
    l.months.forEach((m, i) => { const v = c100(m) * sign; if (v > top) { top = v; at = i; } });
    if (at < 0 || top * 100 < share * tc) continue;
    out.push({ line: l, side: s, i: at, iso: t.months[at], amountC: c100(l.months[at]), totalC: c100(l.total) });
  }
  return out;
}

/** The broker's answer to "Recurring?" for a line's month, 'yes' or 'no', while the month still holds the amount answered about; else null. */
function answerOf(t, l, iso) {
  const o = l.oneoff;
  const i = t.months.indexOf(iso);
  return o && o.iso === iso && i >= 0 && c100(l.months[i]) === c100(o.amount) && (o.recurring === 'yes' || o.recurring === 'no') ? o.recurring : null;
}

/** "Recurring?" answered for a one-off check `oneoff.<lineId>.<month>` (in place, on the line: nothing else moves). Returns true when it changed. */
function answerOneoff(t, checkId, how) {
  const [, lineId, iso] = String(checkId).split('.');
  const l = t.lines.find((x) => x.id === lineId);
  const i = t.months.indexOf(iso);
  if (!l || i < 0 || answerOf(t, l, iso) === how) return false;
  l.oneoff = { iso, amount: l.months[i], recurring: how };
  return true;
}

/**
 * NOI without the one-offs the broker marked "No, not recurring": { noi, marked: [{ label, iso, amount }], text }, or
 * null when none is marked. NOI + the marked expense months - the marked income months, to the cent. Shown beside
 * the reported NOI, never in its place, never written to the deal.
 */
export function noiWithout(t) {
  if (!t || !Array.isArray(t.lines) || !Array.isArray(t.months) || heldCount(t)) return null;
  const marked = [];
  for (const l of t.lines) {
    const s = noiSide(l);
    if (!l.category || !s || !l.oneoff) continue;
    const i = t.months.indexOf(l.oneoff.iso);
    if (answerOf(t, l, l.oneoff.iso) !== 'no') continue;
    marked.push({ label: l.label, iso: l.oneoff.iso, amount: l.months[i], side: s });
  }
  if (!marked.length) return null;
  let c = c100(statementTotals(t).noi);
  for (const m of marked) c += m.side === 'expense' ? c100(m.amount) : -c100(m.amount);
  const noi = fromC(c);
  return { noi, marked: marked.map(({ label, iso, amount }) => ({ label, iso, amount })), text: `NOI without the one-offs you marked: ${usd0(noi)} (${marked.length} marked: ${marked.map((m) => `${m.label}, ${monthWord(m.iso)}, ${usdx(m.amount)}`).join('; ')})` };
}

/**
 * The value checks, in dataqc.js's shape (see periodChecks): `spike.<line>.<month>`, `negexp.<line>`, `negmonth.<line>.<month>`,
 * `oneoff.<line>.<month>`, `yoy.lines`, `yoy.cats`, `yoy.noi`, `period.quarters`. Warnings (Review) and notes (the panel); none has `holds`.
 * @param {any} t
 * @returns {any[]}
 */
export function valueChecks(t) {
  /** @type {any[]} */
  const out = [];
  if (!t || !Array.isArray(t.months) || !Array.isArray(t.lines)) return out;
  const p = t.period || {};
  const seenFix = [{ id: 'seen', label: 'Seen' }];
  // columns headed as quarters or years: only the Total is read
  if (p.nonMonthly && p.nonMonthly.heads && p.nonMonthly.heads.length >= 2 && !t.months.length) {
    const h = p.nonMonthly.heads;
    out.push({ id: 'period.quarters', kind: 'quarters', level: 'info', amount: 0, text: `The columns are ${p.nonMonthly.kind === 'years' ? 'fiscal years' : 'quarters'} (${h[0]} to ${h[h.length - 1]}); only the Total column is read, as one period.` });
  }
  if (heldCount(t)) return out;
  const lines = t.lines.filter((l) => noiSide(l));
  const egiC = Math.max(0, c100(statementTotals(t).egi));

  // a spike: a month far above the line's typical month
  const times = conv('t12.spike.times'); const floorC = Math.round(conv('t12.spike.floor') * 100); const pctEgi = conv('t12.spike.egiPct');
  const limitC = Math.max(floorC, Math.round((egiC * pctEgi) / 100));
  for (const l of lines) {
    const mc = l.months.map(c100);
    const nz = mc.filter((v) => v !== 0);
    if (nz.length < 3) continue;
    const med = median(nz);
    if (!med) continue;
    const sg = med < 0 ? -1 : 1; const mag = Math.abs(med);
    const hits = [];
    mc.forEach((v, i) => { const m = v * sg; if (m > times * mag && m > limitC) hits.push({ i, m }); });
    if (!hits.length) continue;
    const top = hits.reduce((a, b) => (b.m > a.m ? b : a));
    const iso = t.months[top.i];
    const others = hits.filter((h) => h !== top).map((h) => monthWord(t.months[h.i]));
    out.push({
      id: `spike.${l.id}.${iso}`, kind: 'spike', level: 'warn', amount: fromC(top.m - mag), where: `${l.label}, ${monthWord(iso)}`,
      text: `${l.label}: ${monthWord(iso)} is ${usdx(l.months[top.i])}, more than ${gets(times)} × its typical month (${usdx(fromC(med))}) and over ${usdx(fromC(limitC))} (the larger of ${usdx(fromC(floorC))} and ${gets(pctEgi)}% of EGI).${others.length ? ` Also ${list(others)}.` : ''}`,
      fixes: seenFix,
    });
  }

  // an expense line below zero, or a negative month inside an expense line
  const negC = Math.round(conv('t12.negMonth') * 100);
  for (const l of lines) {
    if (noiSide(l) !== 'expense') continue;
    const tc = c100(l.total);
    if (tc < 0) {
      out.push({ id: `negexp.${l.id}`, kind: 'negexp', level: 'warn', amount: fromC(-tc), where: l.label, text: `${l.label} adds up to ${usdx(l.total)}: an expense line below zero. A refund or credit, or a sign the file got wrong?`, fixes: seenFix });
      continue;
    }
    const mc = l.months.map(c100);
    const low = mc.reduce((a, v, i) => (v < mc[a] ? i : a), 0);
    if (mc.length && mc[low] < 0 && mc[low] <= -negC) {
      out.push({ id: `negmonth.${l.id}.${t.months[low]}`, kind: 'negmonth', level: 'info', amount: fromC(-mc[low]), where: `${l.label}, ${monthWord(t.months[low])}`, text: `${l.label}: ${monthWord(t.months[low])} is ${usdx(l.months[low])}, a credit inside an expense line that adds up to ${usdx(l.total)}.` });
    }
  }

  // a large one-off month: asked whether it recurs (Yes / No / Not sure); nothing is set by the app
  const asked = new Set();
  for (const o of oneoffs(t)) {
    const l = o.line; const id = `oneoff.${l.id}.${o.iso}`;
    asked.add(id);
    const ans = answerOf(t, l, o.iso);
    const what = `${l.label}, ${monthWord(o.iso)}`;
    out.push(ans ? oneoffAnswered(id, what, fromC(o.amountC), ans) : {
      id, kind: 'oneoff', level: 'info', amount: fromC(Math.abs(o.amountC)), where: what,
      text: `${l.label}: ${monthWord(o.iso)} is ${usdx(fromC(o.amountC))}, ${Math.round((Math.abs(o.amountC) * 100) / Math.abs(o.totalC))}% of the line’s ${usdx(fromC(o.totalC))} for the period: it looks like a one-off, and needs classification. Recurring?`,
      fixes: [{ id: 'rec:yes', label: 'Recurring? Yes' }, { id: 'rec:no', label: 'Recurring? No' }, { id: 'rec:notsure', label: 'Not sure' }],
    });
  }
  // an answer about a month no longer flagged (a setting moved): still kept, still changeable
  for (const l of lines) {
    const iso = l.oneoff && l.oneoff.iso;
    const id = `oneoff.${l.id}.${iso}`;
    const ans = iso && !asked.has(id) ? answerOf(t, l, iso) : null;
    if (ans) out.push(oneoffAnswered(id, `${l.label}, ${monthWord(iso)}`, l.months[t.months.indexOf(iso)], ans));
  }

  out.push(...yoyChecks(t, lines));
  return out;
}

/** A "Recurring?" answer, kept as a pass line with the other answer as a change. */
function oneoffAnswered(id, what, amount, ans) {
  return {
    id, kind: 'oneoff', level: 'pass', amount: 0, where: what,
    text: `${what}, ${usdx(amount)}: you said it ${ans === 'yes' ? 'recurs, so it stays in NOI as it is' : 'is a one-off. “NOI without the one-offs you marked” is shown beside the reported NOI, which does not change'}.`,
    fixes: [{ id: ans === 'yes' ? 'rec:no' : 'rec:yes', label: ans === 'yes' ? 'Change to: not recurring' : 'Change to: recurring', more: true }],
  };
}

/** Year over year, like months only (a prior period is never scaled): lines, categories and NOI against the same months a year before. */
function yoyChecks(t, lines) {
  const pr = t.period && t.period.prior && Array.isArray(t.period.prior.months) ? t.period.prior.months : [];
  const pairs = [];
  pr.forEach((iso, j) => { if (!isIso(iso)) return; const i = t.months.indexOf(isoOfKey(mkey(iso) + 12)); if (i >= 0) pairs.push([i, j]); });
  if (!pairs.length) return [];
  const curIsos = pairs.map(([i]) => t.months[i]); const prevIsos = pairs.map(([, j]) => pr[j]);
  const span = `${rangesText(curIsos)} against ${rangesText(prevIsos)}`;
  const both = (l) => ({ cur: pairs.reduce((s, [i]) => s + c100(l.months[i]), 0), prev: pairs.reduce((s, [, j]) => s + c100((l.prior && l.prior.months[j]) || 0), 0) });
  const over = (cur, prev, pct) => prev !== 0 && Math.abs(cur - prev) * 100 > pct * Math.abs(prev);
  const say = (x) => `${x.label} ${x.cur >= x.prev ? '+' : '−'}${((Math.abs(x.cur - x.prev) * 100) / Math.abs(x.prev)).toFixed(1)}% (${usdx(fromC(x.prev))} to ${usdx(fromC(x.cur))})`;
  const group = (items) => {
    const top = [...items].sort((a, b) => Math.abs(b.cur - b.prev) - Math.abs(a.cur - a.prev));
    return `${top.slice(0, 3).map(say).join('; ')}${top.length > 3 ? '; …' : ''}`;
  };
  const out = [];
  const linePct = conv('t12.yoy.line');
  const byLine = lines.map((l) => ({ label: l.label, ...both(l) })).filter((x) => over(x.cur, x.prev, linePct));
  if (byLine.length) out.push({ id: 'yoy.lines', kind: 'yoy', level: 'info', amount: fromC(byLine.reduce((s, x) => s + Math.abs(x.cur - x.prev), 0)), text: `Year over year on like months (${span}), ${byLine.length} line${byLine.length === 1 ? ' moved' : 's moved'} more than ${gets(linePct)}%: ${group(byLine)}.` });
  const cats = new Map();
  for (const l of lines) {
    if (!l.category) continue;
    const b = both(l); const x = cats.get(l.category) || { label: CATEGORY[l.category].label, cur: 0, prev: 0 };
    x.cur += b.cur; x.prev += b.prev; cats.set(l.category, x);
  }
  const byCat = [...cats.values()].filter((x) => over(x.cur, x.prev, linePct));
  if (byCat.length) out.push({ id: 'yoy.cats', kind: 'yoy', level: 'info', amount: fromC(byCat.reduce((s, x) => s + Math.abs(x.cur - x.prev), 0)), text: `Year over year on like months (${span}), ${byCat.length} categor${byCat.length === 1 ? 'y moved' : 'ies moved'} more than ${gets(linePct)}%: ${group(byCat)}.` });
  const noi = { cur: 0, prev: 0 };
  for (const l of lines) {
    if (!l.category) continue;
    const b = both(l); const f = noiSide(l) === 'expense' ? -1 : 1;
    noi.cur += f * b.cur; noi.prev += f * b.prev;
  }
  const noiPct = conv('t12.yoy.noi');
  if (over(noi.cur, noi.prev, noiPct)) out.push({ id: 'yoy.noi', kind: 'yoy', level: 'warn', amount: fromC(Math.abs(noi.cur - noi.prev)), where: span, text: `NOI is ${noi.cur >= noi.prev ? 'up' : 'down'} ${((Math.abs(noi.cur - noi.prev) * 100) / Math.abs(noi.prev)).toFixed(1)}% year over year on like months (${span}): ${usdx(fromC(noi.prev))} to ${usdx(fromC(noi.cur))}, more than ${gets(noiPct)}%.`, fixes: [{ id: 'seen', label: 'Seen' }] });
  return out;
}

/**
 * A run rate for a statement of fewer than 12 months, on request only: its totals scaled by the one function
 * (annualized) over the same N Annualize uses. { n, columns, heading, egi, opex, taxes, noi, lumps, om }, or null
 * (a full year, nothing to scale; a period check holds the totals or Annualise; lines still to file). Not a T-12
 * and never stored: it reaches no figure of the deal, only the confirmed "Annualize it, then use" does.
 * `lumps`: lines passing the one-off rule over these months, which a run rate counts again; `om`: a Note against
 * the OM's NOI (`omNoi`) whatever the gap.
 * @param {any} t
 * @param {{ omNoi?: number | null }} [opts]
 */
export function runRate(t, { omNoi = null } = {}) {
  if (!t || !Array.isArray(t.lines) || !Array.isArray(t.months) || !(t.months.length > 0 && t.months.length < 12)) return null;
  if (heldCount(t) || openLines(t).length) return null;
  const W = windowOf(t);
  if (W.ask) return null;
  const A = annualized(statementTotals(t), W.n);
  if (!A) return null;
  const factor = 12 % W.n === 0 ? String(12 / W.n) : `12 ÷ ${W.n}`;
  const times = 12 % W.n === 0 && 12 / W.n === 2 ? 'twice' : `${gets(12 / W.n)} times`;
  const lumps = oneoffs(t).map((o) => ({ label: o.line.label, iso: o.iso, amount: fromC(o.amountC), annual: cents((fromC(o.amountC) * 12) / W.n), text: `${o.line.label}: ${usdx(fromC(o.amountC))} paid in ${monthWord(o.iso)}; a run rate counts it ${times} (${usdx(cents((fromC(o.amountC) * 12) / W.n))})` }));
  let om = null;
  if (typeof omNoi === 'number' && Number.isFinite(omNoi)) {
    const base = Math.max(Math.abs(A.noi), Math.abs(omNoi));
    const g = base ? (Math.abs(A.noi - omNoi) / base) * 100 : 0;
    om = { gap: g, text: `Run-rate NOI ${usdx(A.noi)} is ${g.toFixed(1) === '0.0' ? 'the same as' : `${g.toFixed(1)}% ${A.noi > omNoi ? 'above' : 'below'}`} the OM’s ${usdx(omNoi)}: a run rate is not a T-12.` };
  }
  return { n: W.n, columns: W.columns, heading: `run rate: ${W.n} month${W.n === 1 ? '' : 's'}${W.n !== W.columns ? ' with activity' : ''} × ${factor}, not a T-12`, egi: A.egi, opex: A.opex, taxes: A.taxes, noi: A.noi, lumps, om };
}

/**
 * The statement's checks as the T-12 Data QC panel and Review show them (dataqc.js's shape), worked out from the
 * statement each time: nothing is stored, so nothing can be stale. `statementChecks` (unchanged: the OM
 * statement reader uses it too) with levels (a stated figure that disagrees with its lines is a Fail that
 * holds "Use the T-12's figures"; the rest are Checks) and the period checks above. `resolved` comes from `seen`.
 * Returns { checks, intro }.
 * @param {any} t
 */
export function t12Qc(t) {
  const seen = (t && t.seen) || {};
  const T = statementTotals(t);
  /** @type {any[]} */
  const checks = [...periodChecks(t), ...valueChecks(t)];
  // the file's Total column is the T-12 or, once 12 of its months were chosen, the T-12 plus the prior period
  const adj = t.period && t.period.chosen
    ? { ...t, lines: t.lines.map((l) => (l.prior && l.fileTotal !== null && l.fileTotal !== undefined && Math.abs(l.fileTotal - l.total) > 1 && Math.abs(l.fileTotal - cents(l.total + l.prior.total)) <= 1 ? { ...l, fileTotal: null } : l)) }
    : t;
  for (const c of statementChecks(adj)) {
    const stated = c.id.startsWith('stated.');
    const q = { ...c, level: stated ? 'fail' : 'warn', ...(stated ? { holds: 'use', short: `the file’s ${{ egi: 'effective gross income', opex: 'operating expenses', noi: 'NOI' }[c.id.slice(7)]} doesn’t match its lines` } : {}), fixes: [{ id: 'seen', label: stated ? `Use the lines’ sum (${usd0(T[c.id.slice(7)])})` : 'Seen' }] };
    checks.push(q);
  }
  for (const c of checks) {
    if (!seen[c.id] || !c.fixes || !c.fixes.some((f) => f.id === 'seen')) continue;
    c.resolved = c.id.startsWith('stated.') ? { how: 'fixed', at: 0, note: 'using the lines’ sum' } : { how: 'accepted', at: 0 };
  }
  return { checks, intro: t.months.length >= 2 && !hasTotalColumn(t) ? 'There is no Total column, so running totals can’t be recognised: the columns are read as monthly.' : '' };
}

/** The checks waiting for the broker: fails and checks not yet resolved (Review and the card count these). */
export const t12OpenChecks = (t) => (t ? t12Qc(t).checks.filter((c) => (c.level === 'fail' || c.level === 'warn') && !c.resolved) : []);

/** What holds "Use the T-12's figures": the period problems and any stated figure that disagrees with its lines, until resolved. */
export const useHeldBy = (t) => t12OpenChecks(t).filter((c) => c.holds === 'totals' || c.holds === 'use');

/**
 * Apply one of a check's fixes (in place): 'seen', `col:<iso>:<k>`, `months:<iso>`, `cols:monthly|cumulative`,
 * `win:active|columns`, `rec:yes|no` ("Recurring?"; `rec:notsure` stores nothing). Returns true when something changed.
 * @param {any} t
 */
export function applyT12Fix(t, checkId, fixId) {
  const [kind, a, b] = String(fixId).split(':');
  if (fixId === 'seen') { markSeen(t, checkId); return true; }
  if (kind === 'col') return chooseColumn(t, a, Number(b));
  if (kind === 'months') return chooseMonths(t, a);
  if (kind === 'cols' && (a === 'monthly' || a === 'cumulative')) { readColumnsAs(t, a); return true; }
  if (kind === 'win' && (a === 'active' || a === 'columns')) { setWindow(t, a); return true; }
  if (kind === 'rec' && (a === 'yes' || a === 'no')) return answerOneoff(t, checkId, a);
  return false;
}

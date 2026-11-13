/* assistant.js -- Monal, the on-device assistant: understanding a question.
 *
 * A question is matched to one task from a fixed, documented set (QUESTIONS), by plain rules and
 * synonyms; nothing is sent anywhere and no model is used. Numbers and dates are read with the app's
 * own parsers (kit.js parseNum / parsePct, dateinput.js parseDateText). A question outside the set is
 * `unknown`, never a guess; a number that could be read two ways is flagged `ambiguous`, never chosen
 * for the person. Answering lives in assistantanswer.js; the screen in assistantui.js. Pure, no DOM. */

import { parseNum, parsePct } from './kit.js';
import { parseDateText } from './dateinput.js';
import { understandAction } from './assistantact.js';
import { docQuestion } from './docfacts.js';

/**
 * The questions Monal answers (release 1). `example` is also what the panel suggests; `needsDeal` says
 * whether an open deal is required. Every figure comes from the shared engine or from the deal's stored data.
 */
export const QUESTIONS = [
  { id: 'cap_at_price', title: 'Cap rate at a price', example: 'What is the cap rate at $4.6M?', needsDeal: true },
  { id: 'price_for_cap', title: 'Price for a target cap rate', example: 'What price gives a 7% cap?', needsDeal: true },
  { id: 'dscr', title: 'DSCR, debt service, the loan it supports, debt yield', example: 'What is the DSCR?', needsDeal: true },
  { id: 'expiries', title: 'Leases expiring, by year', example: 'Which leases expire in 2027?', needsDeal: true },
  { id: 'walt', title: 'Weighted average lease term', example: 'What is the WALT?', needsDeal: true },
  { id: 'missing', title: 'What is missing from this deal', example: 'What is missing from this deal?', needsDeal: true },
  { id: 'review', title: 'What needs review', example: 'What needs review?', needsDeal: true },
  { id: 'comps', title: 'Compare to the comps', example: 'How does this compare to my comps?', needsDeal: true },
  { id: 'breakeven', title: 'Break-even occupancy', example: 'What is the break-even occupancy?', needsDeal: true },
  { id: 'commission', title: 'My commission at a price', example: 'What is my commission at $4.6M?', needsDeal: true },
  { id: 'source', title: 'Where a figure came from', example: 'Where did the NOI come from?', needsDeal: true },
  { id: 'metric', title: 'A figure of the deal: price, NOI, cap rate, price per SF, occupancy, equity, cash-on-cash', example: 'What is the price per SF?', needsDeal: true },
  { id: 'summary', title: 'A summary of the deal', example: 'Summarize this deal', needsDeal: true },
  { id: 'notes', title: 'Show my site visit notes', example: 'What do my notes say?', needsDeal: true },
  { id: 'doc_ask', title: 'Search the deal’s documents and quote the page (OM, leases, T-12, Word, scans you have added)', example: 'What does the OM say about the roof?', needsDeal: true },
  { id: 'glossary', title: 'Explain a term', example: 'Explain DSCR', needsDeal: false },
  { id: 'task', title: 'Add a follow-up task (asks first, with Undo)', example: 'Add a task to call the lender on Friday', needsDeal: false },
  { id: 'set_figure', title: 'Set a deal figure you state (asks first, with Undo)', example: 'Set the asking price to $4.6M', needsDeal: true },
  { id: 'set_stage', title: 'Move the deal to a pipeline stage (asks first, with Undo)', example: 'Move this deal to Under contract', needsDeal: true },
  { id: 'next_step', title: 'Set or move the deal’s next step (asks first, with Undo)', example: 'Set the next step: send the LOI by Friday', needsDeal: true },
  { id: 'add_contact', title: 'Add a contact and link it to the deal (asks first, with Undo)', example: 'Add a contact Jane Roe, lender, at Example Bank', needsDeal: true },
  { id: 'add_note', title: 'Add to the site visit notes (asks first, with Undo)', example: 'Add a note: owner says the roof was replaced in 2021', needsDeal: true },
  { id: 'make_scenario', title: 'Save a scenario at a price or cap rate (asks first, with Undo)', example: 'Create a scenario at $4.6M', needsDeal: true },
  { id: 'start_export', title: 'Start an export the deal screen offers: Excel, share, template (asks first)', example: 'Export this deal to Excel', needsDeal: true },
  { id: 'open_doc', title: 'Open a document, or the page a figure cites', example: 'Open the OM at page 12', needsDeal: true },
  { id: 'open', title: 'Open a screen or section', example: 'Open the rent roll', needsDeal: false },
  { id: 'help', title: 'What I can do', example: 'What can you do?', needsDeal: false },
];

/** Where "open …" can go. `go` is read by assistantui.js / dealui.js assistantGo; `deal` means it needs an open deal. */
/** @type {[RegExp, string, any, boolean][]} */
export const OPEN_TARGETS = [
  [/rent ?roll|tenant schedule|lease schedule/, 'the rent roll', { pane: 'rentroll' }, true],
  [/\bt12\b/, 'the operating statement (T-12)', { section: 'dsec-statement' }, true],
  [/underwrit/, 'Underwrite', { view: 'underwrite' }, false],
  [/\bcomps\b/, 'Comps', { view: 'comps' }, false],
  [/\btools?\b|calculators?/, 'Tools', { view: 'tools' }, false],
  [/\bsettings?\b|preferences/, 'Settings', { view: 'settings' }, false],
  [/\breview\b/, 'Review', { view: 'review' }, false],
  [/\bhome\b|dashboard|pipeline|\btasks\b/, 'Home', { view: 'home' }, false],
  [/financing|loan terms|\bloan\b/, 'Financing', { section: 'dsec-finance' }, true],
  [/\bfee\b|commission/, 'the Fee card', { section: 'dsec-fee' }, true],
  [/documents?|files/, 'Documents', { section: 'deal-dd' }, true],
  [/what ?if|scenarios?/, 'What if', { pane: 'whatif' }, true],
  [/site visit|visit/, 'Site visit', { pane: 'visit' }, true],
  [/key figures|figures/, 'Key figures', { section: 'dsec-figures' }, true],
  [/\bchecks\b|what doesn.?t add up/, 'What doesn’t add up', { section: 'dsec-checks' }, true],
  [/\bdeals?\b/, 'Deals', { view: 'deal' }, false],
];

/** Terms Monal can explain, in the app's own words. `says` are the words that find it. */
export const GLOSSARY = [
  { id: 'cap', name: 'Cap rate', says: ['cap rate', 'cap', 'capitalization rate'], text: 'The year’s net operating income divided by the price, as a percent. It is the income yield on the whole price before any loan. A lower cap rate means a higher price for the same income.' },
  { id: 'noi', name: 'NOI', says: ['noi', 'net operating income'], text: 'Net operating income: a year’s rent and other income the property collects, less its operating expenses (taxes, insurance, repairs, management). It is before the loan payment and before income tax.' },
  { id: 'dscr', name: 'DSCR', says: ['dscr', 'debt service coverage', 'debt coverage'], text: 'Debt service coverage ratio: a year’s NOI divided by a year’s loan payments (interest and principal). Above 1.00x the income covers the payments; lenders usually want 1.20x to 1.35x or more.' },
  { id: 'dy', name: 'Debt yield', says: ['debt yield'], text: 'A year’s NOI divided by the loan amount, as a percent. It ignores the interest rate and the amortization, so lenders use it as a quick test of how much of the loan the income alone would repay.' },
  { id: 'walt', name: 'WALT', says: ['walt', 'weighted average lease term'], text: 'Weighted average lease term: the years left on the leases, each lease counted in proportion to its rent (or its area, by the convention chosen in Settings). Month-to-month and undated leases are left out unless the convention says otherwise.' },
  { id: 'ltv', name: 'LTV', says: ['ltv', 'loan to value', 'loan-to-value'], text: 'Loan to value: the loan as a percent of the price (or value). A 65% LTV on a $10,000,000 price is a $6,500,000 loan.' },
  { id: 'be', name: 'Break-even occupancy', says: ['break even occupancy', 'breakeven occupancy', 'break even', 'breakeven'], text: 'The share of the building that must be leased for rent to cover operating expenses and the loan payments. Occupancy above it leaves cash flow; below it, the owner puts money in.' },
  { id: 'coc', name: 'Cash-on-cash', says: ['cash on cash', 'cash-on-cash'], text: 'A year’s cash flow after the loan payments, divided by the cash the buyer puts in (the price less the loan, plus closing costs), as a percent.' },
  { id: 'ltl', name: 'Loss to lease', says: ['loss to lease'], text: 'How far the rents in place are below the market rents entered, a year’s total. It is what the leases would add if every one were at market. It is blank until market rents are entered.' },
  { id: 'irr', name: 'IRR', says: ['irr', 'internal rate of return'], text: 'Internal rate of return: the yearly percent return that makes the cash put in and the cash taken out over the hold worth the same. It depends on the hold period, growth and exit cap rate assumed.' },
  { id: 'nnn', name: 'NNN (triple net)', says: ['nnn', 'triple net'], text: 'A lease where the tenant pays its share of property taxes, insurance and maintenance on top of its rent, so the owner’s NOI is close to the rent.' },
  { id: 'egi', name: 'EGI', says: ['egi', 'effective gross income'], text: 'Effective gross income: the rent and other income actually collected after vacancy and credit loss, before operating expenses.' },
  { id: 'gpr', name: 'Gross potential rent', says: ['gross potential rent', 'gpr'], text: 'The rent the building would earn if every space were leased at its rent, with no vacancy or credit loss.' },
];

/** Lower case, one space, the common spellings folded to one word. */
export function clean(raw) {
  return String(raw ?? '').toLowerCase()
    .replace(/[’‘]/g, '\'').replace(/[“”]/g, '"')
    .replace(/net operating income/g, 'noi')
    .replace(/capitali[sz]ation rate|cap-rate/g, 'cap rate')
    .replace(/debt service coverage( ratio)?|debt coverage( ratio)?/g, 'dscr')
    .replace(/weighted average lease (term|expiry|expiration)/g, 'walt')
    .replace(/\bt[- ]?12\b|trailing (12|twelve)( months)?|operating statement|income statement|p ?& ?l\b/g, 't12')
    .replace(/rent[- ]?roll|tenant schedule|lease schedule/g, 'rent roll')
    .replace(/square f(ee|oo)t|sq\.? ?ft\.?/g, 'sf')
    .replace(/loan[- ]to[- ]value/g, 'ltv')
    .replace(/break[- ]?even/g, 'breakeven')
    .replace(/comparables?|comp set|comparable sales/g, 'comps')
    .replace(/\bmillion\b/g, 'm').replace(/\bthousand\b/g, 'k')
    .replace(/\s+/g, ' ').trim().replace(/[?!.]+$/, '');
}

/** Money in a question: "$4.6M", "4,600,000", "4.6 million". Null with none; `ambiguous` when a bare small number is all there is. */
export function moneyIn(text) {
  const t = clean(text);
  const re = /\$?\s?(\d[\d,]*(?:\.\d+)?)\s?(k|mm|m|b)?(?![a-z\d%])(?!\s?(?:%|percent|pct|years?|yrs?|x\b|sf\b|units?\b|months?))/g;
  let ambiguous = null;
  for (const m of t.matchAll(re)) {
    const whole = m[0].trim();
    const prior = t.slice(0, m.index).trimEnd();
    // a year ("in 2027") or a number that is part of a cap-rate phrase is not a price
    if (/^(19|20)\d\d$/.test(m[1]) && !m[2] && /\b(in|by|of|during|year)$/.test(prior)) continue;
    const v = parseNum(whole.replace(/\s/g, ''));
    if (v === null) continue;
    if (v >= 10000) return { value: v, ambiguous: null };
    if (!ambiguous) ambiguous = whole;
  }
  return { value: null, ambiguous };
}

/** A percent in a question: "7%", "7 percent", "6.25 pct". */
const percentIn = (t) => { const m = /(\d+(?:\.\d+)?)\s?(?:%|percent|pct)/.exec(t); return m ? parsePct(`${m[1]}%`) : null; };

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * The day a task is due, from words in a question: today, tomorrow, a weekday (the next one, never today),
 * "in 3 days / 2 weeks", "next week" (seven days on), a date (1/15/2027, Jan 15, January 15 2027).
 * Returns { iso, words } (the words matched, so the title can leave them out) or null. A date with no year is
 * the next one coming; a date that cannot exist is null, not corrected.
 * @param {string} raw @param {Date} [today]
 */
export function dueFrom(raw, today = new Date()) {
  const t = String(raw ?? '');
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const plus = (n) => { const d = new Date(base); d.setDate(d.getDate() + n); return isoOf(d); };
  let m;
  if ((m = /\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2}))\b/.exec(t))) { const iso = parseDateText(m[1]); return iso ? { iso, words: m[0] } : null; }
  const named = new RegExp(`\\b(${MONTHS.map((x) => x).join('|')})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i').exec(t);
  if (named) {
    const mo = MONTHS.indexOf(named[1].toLowerCase().slice(0, 3)) + 1;
    let y = named[3] ? Number(named[3]) : base.getFullYear();
    let iso = parseDateText(`${mo}/${named[2]}/${y}`);
    if (iso && !named[3] && iso < isoOf(base)) { y += 1; iso = parseDateText(`${mo}/${named[2]}/${y}`); }
    return iso ? { iso, words: named[0] } : null;
  }
  if ((m = /\b(today|tonight)\b/i.exec(t))) return { iso: plus(0), words: m[0] };
  if ((m = /\btomorrow\b/i.exec(t))) return { iso: plus(1), words: m[0] };
  if ((m = /\bin (\d{1,3}) (day|week)s?\b/i.exec(t))) return { iso: plus(Number(m[1]) * (m[2].toLowerCase() === 'week' ? 7 : 1)), words: m[0] };
  if ((m = /\bnext week\b/i.exec(t))) return { iso: plus(7), words: m[0] };
  if ((m = new RegExp(`\\b(?:(?:by|on|before|this|next)\\s+)?(${WEEKDAYS.join('|')})\\b`, 'i').exec(t))) {
    const want = WEEKDAYS.indexOf(m[1].toLowerCase());
    return { iso: plus(((want - base.getDay() + 6) % 7) + 1), words: m[0] };
  }
  return null;
}

/** The task title in a question: what is left after the request words and the day are taken out. */
export function taskTitle(raw, today = new Date()) {
  let s = String(raw ?? '').trim();
  const due = dueFrom(s, today);
  if (due) s = s.replace(due.words, ' ');
  const followUp = /follow[- ]?up/i.test(s);
  s = s.replace(/^\s*(please|can you|could you|i need to|i want to|i'd like to)\s+/i, '')
    .replace(/^\s*(add|create|make|draft|set up|set|new|put|schedule)\b\s*(me\s+)?(a|an|the)?\s*/i, '')
    .replace(/^\s*(new\s+)?(follow[- ]?up\s+)?(task|reminder|to[- ]?do|todo)?\s*(for|to|about|on|:|-)?\s*/i, '')
    .replace(/^\s*remind me\s*(to|about|of)?\s*/i, '')
    .replace(/\b(for|on|by|before|due|this|next)\s*$/i, '')
    .replace(/\s+/g, ' ').replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '');
  if (!s || /^(follow[- ]?up|task|reminder|to[- ]?do|todo)$/i.test(s)) return followUp ? 'Follow up' : '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const termFor = (t) => {
  let best = null;
  for (const g of GLOSSARY) for (const w of g.says) { if (new RegExp(`(^|[^a-z])${w.replace(/[-\s]/g, '[- ]?')}($|[^a-z])`).test(t) && (!best || w.length > best.len)) best = { g, len: w.length }; }
  return best ? best.g : null;
};

/** @type {[RegExp, string][]} */
const METRICS = [
  [/noi per sf|noi psf/, 'noiPsf'],
  [/price per sf|\$\/sf|\bpsf\b|per sf\b|price per square/, 'ppsf'],
  [/price per unit|per door|per unit\b/, 'perUnit'],
  [/expense ratio/, 'expenseRatio'],
  [/cash on cash|cash-on-cash/, 'cashOnCash'],
  [/cash flow/, 'cashFlow'],
  [/\bequity\b/, 'equity'],
  [/occupancy|how (full|leased)|percent leased|% leased/, 'occ'],
  [/\bcap rate\b|\bcap\b/, 'cap'],
  [/\bnoi\b/, 'noi'],
  [/asking|\bprice\b|how much is it|what are they asking/, 'price'],
];
/** @type {[RegExp, string][]} */
const SOURCE_FIELDS = [
  [/\bnoi\b/, 'noi'], [/cap rate|\bcap\b/, 'cap'], [/asking|\bprice\b/, 'price'], [/occupancy/, 'occ'], [/\btaxes\b/, 'taxes'],
  [/expenses|opex/, 'opex'], [/gross income|egi|\bgross\b/, 'gross'], [/potential rent|gpr/, 'gpr'], [/\bsf\b|building size|square/, 'bsf'], [/\bunits\b/, 'units'],
];

/**
 * Understand one question: { id, ...args }. `id` is one of QUESTIONS, `unknown` (not in the set) or `empty`.
 * @param {string} raw @param {{ today?: Date }} [opts]
 */
export function understand(raw, { today = new Date() } = {}) {
  const text = clean(raw);
  if (!text) return { id: 'empty' };
  const money = moneyIn(text);
  const pc = percentIn(text);
  const has = (re) => re.test(text);

  // requests that change the deal (assistantact.js): matched first, each by its own opening verb
  const act = understandAction(raw, { today });
  if (act) return act;
  // a request to add a task: the verb comes first, so "what follow-ups are due" is not one
  if ((/^(please |can you |could you |i need to |i want to |i'd like to )?(add|create|make|draft|set up|new|put|schedule|remind me|follow up)\b/.test(text)) && has(/\b(tasks?|reminders?|follow[- ]?ups?|to[- ]?do|todo|remind me)\b/)) {
    const due = dueFrom(raw, today);
    return { id: 'task', title: taskTitle(raw, today), due: due ? due.iso : null, dueWords: due ? due.words : null };
  }
  // open a screen or section
  const verb = /^(please |can you |could you )?(open|go to|take me to|show me|show|jump to|bring up|switch to|navigate to|go)\b/.exec(text);
  if (verb) {
    const rest = text.slice(verb[0].length);
    const pg = /\b(?:page|pg|p\.?)\s?(\d{1,4})\b/.exec(rest);
    if (pg) return { id: 'open_doc', rest, page: Number(pg[1]) };
    for (const [re, name, go, needsDeal] of OPEN_TARGETS) if (re.test(rest) && !/\b(at|if|for a)\b.*\bcap\b/.test(rest)) return { id: 'open', name, go, needsDeal };
    // nothing on the screen list: maybe a document of the deal, by its name (looked for in assistantact.js)
    if (/^(open|bring up|go to|jump to)$/.test(verb[2]) && !/\b(cap|price|noi|dscr)\b/.test(rest)) return { id: 'open_doc', rest, page: null };
  }
  // explain a term: "explain DSCR", "what is a cap rate", "what does WALT mean"; "what is the DSCR" asks for this deal's figure
  const explain = /^(explain|define|describe|what does (.+) mean|what do you mean by|meaning of|tell me what)\b/.test(text) || /\bwhat does (.+) (mean|stand for)\b/.test(text);
  const whatIs = /^(what is|what's|whats|what are) (an? |the )?(.+)$/.exec(text);
  if (explain || (whatIs && !whatIs[2]?.startsWith('the') && termFor(whatIs[3]) && !/\b(this|my|our|deal|here|at|for|of|if)\b/.test(whatIs[3]))) {
    const g = termFor(text);
    return { id: 'glossary', term: g ? g.id : null, asked: text.replace(/^(explain|define|describe|what does|what is|what's|whats|what are|meaning of|what do you mean by)\s*(an?\s+|the\s+)?/, '').replace(/\s*(mean|stand for)$/, '') };
  }
  // a question the deal's documents may answer: quoted from the page (assistantanswer.js docAnswer), never from a guess
  const dq = docQuestion(text, raw);
  if (dq) return { id: 'doc_ask', ...dq };
  if (has(/\b(missing|incomplete|still need|blank|not (filled|entered)|gaps?|what'?s left|haven'?t (entered|filled))\b/)) return { id: 'missing' };
  if (has(/\b(needs? (my )?(review|attention|checking)|to review|review queue|open checks?|data qc|red flags?|flagged|what'?s wrong|doesn'?t add up|problems?|issues?)\b/)) return { id: 'review' };
  if (has(/\bnotes?\b/) && has(/\b(what|show|read|list|see|say|said|do)\b/)) return { id: 'notes' };
  // cap rate at a price, or the price for a cap rate
  const capTarget = /(\d+(?:\.\d+)?)\s?(?:%|percent|pct)?\s?cap\b/.exec(text) || /\bcap(?: rate)?\s?(?:of|at|=|to|is)?\s?(\d+(?:\.\d+)?)\s?(?:%|percent|pct)/.exec(text);
  if (capTarget && has(/\b(price|offer|bid|pay|worth|value|buy|get|hit|reach|justify|what would)\b/) && money.value === null) {
    return { id: 'price_for_cap', cap: parsePct(`${capTarget[1]}%`) };
  }
  if (has(/\bcap( rate)?\b/) && (money.value !== null || money.ambiguous) && pc === null) return { id: 'cap_at_price', price: money.value, ambiguous: money.value === null ? money.ambiguous : null };
  if (has(/\b(commission|my fee|broker fee|my cut|what do i make|fee at)\b/)) return { id: 'commission', price: money.value, ambiguous: money.value === null ? money.ambiguous : null };
  if (has(/\bbreakeven\b/)) return { id: 'breakeven' };
  if (has(/\b(dscr|debt service|debt yield|(loan|debt) (it )?(can )?(supports?|size|sizing)|how much (loan|debt)|(max|maximum|largest) (loan|debt)|loan amount|supports? how much)\b/)) {
    const which = has(/debt yield/) ? 'debtYield' : has(/debt service/) && !has(/dscr/) ? 'debtService' : has(/\b(supports?|size|sizing|max|maximum|largest|how much)\b/) ? 'maxLoan' : has(/loan amount/) ? 'loan' : 'dscr';
    return { id: 'dscr', which };
  }
  if (has(/\bwalt\b/)) return { id: 'walt' };
  if (has(/\b(expir\w*|rolling|roll over|rollover|(leases?|tenants?) roll\w*|renew\w*|leases? (end|ending)|lease ends?|up for renewal)\b/)) {
    const y = /\b(19|20)\d\d\b/.exec(text);
    const ty = today.getFullYear();
    const year = y ? Number(y[0]) : has(/\bnext year\b/) ? ty + 1 : has(/\bthis year\b/) ? ty : null;
    return { id: 'expiries', year };
  }
  if (has(/\bcomps\b|\b(compare|compared|versus|vs\.?)\b.*\bmarket\b/)) return { id: 'comps' };
  if (has(/\b(where|how)\b.*\b(come|came|from|source|get|got|derived|read|find)\b|\bsource of\b|\bprovenance\b/) && SOURCE_FIELDS.some(([re]) => re.test(text))) {
    const hit = SOURCE_FIELDS.find(([re]) => re.test(text));
    return { id: 'source', key: hit[1] };
  }
  if (has(/\b(where|source|came from|come from)\b/) && has(/\b(figure|number|value|input)\b/)) return { id: 'source', key: null };
  if (has(/\b(summar\w*|overview|snapshot|tell me about (this|the) deal|how'?s (this|the) deal|the deal at a glance)\b/)) return { id: 'summary' };
  if (/^(help|what can you (do|answer)|what can i ask( you)?|examples?|commands|what do you do)\b/.test(text) || has(/\bwhat can you\b/)) return { id: 'help' };
  const mm = METRICS.find(([re]) => re.test(text));
  if (mm && has(/\b(what|whats|what's|show|tell|give|how|which|current)\b/)) return { id: 'metric', metric: mm[1] };
  return { id: 'unknown', text: String(raw ?? '').trim().slice(0, 200) };
}

/** Three questions worth asking on each screen (the deal screen's depend on whether a rent roll is there). */
export function suggestions(view, { hasDeal = false, hasRentRoll = false, hasDocs = false, today = new Date() } = {}) {
  const next = today.getFullYear() + 1;
  if (view === 'deal' && hasDeal && hasDocs) return ['What does the OM say about the roof?', 'What are the escalations?', hasRentRoll ? `Which leases expire in ${next}?` : 'What year was it built?'];
  if (view === 'deal') {
    return hasDeal
      ? ['What is missing from this deal?', hasRentRoll ? `Which leases expire in ${next}?` : 'What is the DSCR?', 'Where did the NOI come from?']
      : ['What can you do?', 'Explain cap rate', 'Open Comps'];
  }
  if (view === 'home') return ['Add a task to follow up with the lender on Friday', 'What is missing from this deal?', 'What can you do?'];
  if (view === 'comps') return ['How does this compare to my comps?', 'Explain cap rate', 'Open the rent roll'];
  if (view === 'tools') return ['Explain DSCR', 'What price gives a 7% cap?', 'What can you do?'];
  if (view === 'review') return ['What needs review?', 'What is missing from this deal?', 'Explain debt yield'];
  if (view === 'settings') return ['Explain WALT', 'What can you do?', 'Open Home'];
  return ['What can you do?', 'Explain DSCR', 'Open Home'];
}

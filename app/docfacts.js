/* docfacts.js -- what Monal may read out of a passage of a document, and what a question about documents is.
 *
 * A figure or date is taken from a passage only when it stands right next to its label on one line ("Year Built:
 * 1998", "Net Operating Income $315,000", "3% annual increases") and is the only value of its kind there; a table
 * row with several figures, a label with its value on another line, or a passage that reads like an instruction is
 * quoted and nothing more. Every figure is shown as the document prints it, labelled "from the document, not
 * checked". Numbers and dates are read with the app's own parsers (kit.js parseNum, dateinput.js parseDateText).
 * Document text is data: nothing here runs, follows or acts on it. Pure, no DOM. */

import { parseNum } from './kit.js';
import { parseDateText } from './dateinput.js';

/** The label every figure taken from a document carries. */
export const NOT_CHECKED = 'from the document, not checked';

/** Wording in a document that reads like an order to an assistant: shown quoted, never acted on, never read for figures. */
export const INJECTION = /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|all|any|your)\b[^.\n]{0,30}\b(?:instructions?|prompts?|rules?|directions?)\b|\bsystem prompt\b|\byou are (?:now|an? )\b|\b(?:set|change|update|make|wire|send|add|delete|remove)\b[^.\n]{0,24}\b(?:price|noi|cap rate|dscr|task|deal|account|funds|\$\d)[^.\n]{0,40}\b(?:to|into)\b[^.\n]{0,24}[$\d]|\bassistant\s*[:,]|<\s*(?:script|img|iframe|svg)\b|\bdo not (?:tell|mention|show) the (?:user|broker)\b/i;
export const looksLikeInstruction = (text) => INJECTION.test(String(text ?? ''));

const SEP = String.raw`(?:\s*[:=\-–—|.]+\s*|\s+(?:is|of|was|are|at|approximately|approx\.?|about|totall?ing|equals?)\s+|\s+)`;
const UNIT_PER = String.raw`(?:\s?(?:per|/)\s?(?:sf|sq\.? ?ft\.?|square foot|rsf)(?:\s?(?:per|/)\s?(?:year|yr|month|mo))?|\s?psf|\s?(?:annually|per year|a year|per annum|monthly|per month|/yr|/mo))?`;
const NOW = new Date().getFullYear();

/** @typedef {{ perUnit?: boolean, kind: 'money' | 'pct' | 'year' | 'date' | 'sf' | 'text' | 'count', label: string, labels: string, before?: RegExp, dealKey?: string, title: string, query: string }} Field */
/** @type {Record<string, Field>} */
export const FIELDS = {
  noi: { kind: 'money', label: 'NOI', labels: String.raw`net operating income|noi`, dealKey: 'noi', title: 'NOI', query: 'net operating income' },
  price: { kind: 'money', label: 'Asking price', labels: String.raw`(?:asking|list(?:ing)?|offering|purchase|sale) price|price(?=\s*[:=])`, dealKey: 'price', title: 'Asking price', query: 'asking price' },
  cap: { kind: 'pct', label: 'Cap rate', labels: String.raw`cap(?:italization)? rate|cap-rate`, dealKey: 'cap', title: 'Cap rate', query: 'cap rate' },
  occupancy: { kind: 'pct', label: 'Occupancy', labels: String.raw`(?:physical |current |economic )?occupancy|(?:percent|%) leased|leased`, dealKey: 'occ', title: 'Occupancy', query: 'occupancy' },
  bsf: { kind: 'sf', label: 'Building area', labels: String.raw`building size|building area|net rentable area|rentable area|gross leasable area|gla|nra|rentable square feet|building sf|total sf|rsf`, dealKey: 'bsf', title: 'Building area', query: 'building size rentable area' },
  yearBuilt: { kind: 'year', label: 'Year built', labels: String.raw`year built|built in|constructed in|year constructed|year of construction|date of construction|built|constructed`, title: 'Year built', query: 'year built' },
  cam: { perUnit: true, kind: 'money', label: 'CAM charge', labels: String.raw`cam(?: charges?| expenses?| reimbursements?)?|common area maintenance(?: charges?)?`, title: 'CAM charges', query: 'cam common area maintenance charges' },
  baseRent: { perUnit: true, kind: 'money', label: 'Base rent', labels: String.raw`(?:annual |monthly )?base rent|minimum rent`, title: 'Base rent', query: 'base rent' },
  expiration: { kind: 'date', label: 'Lease expiration', labels: String.raw`(?:lease )?expiration(?: date)?|expires(?: on)?|expiry(?: date)?|lease (?:end|ends|term ends)(?: date)?|term (?:ends|end date)`, title: 'Lease expiration', query: 'lease expiration' },
  escalation: { kind: 'pct', label: 'Rent escalation', labels: String.raw`escalations?|(?:annual )?(?:rent )?(?:increases?|escalations?|bumps?)|escalators?`, before: /(\d+(?:\.\d+)?\s?%)\s*(?:annual(?:ly)?\s+|fixed\s+|per year\s+)?(?:rent\s+)?(?:increases?|escalations?|bumps?|escalators?)/i, title: 'Rent escalations', query: 'escalations annual increases' },
  deposit: { kind: 'money', label: 'Security deposit', labels: String.raw`security deposit`, title: 'Security deposit', query: 'security deposit' },
  zoning: { kind: 'text', label: 'Zoning', labels: String.raw`zoning|zoned`, title: 'Zoning', query: 'zoning' },
  parking: { kind: 'count', label: 'Parking', labels: String.raw`parking(?: spaces| stalls)?`, title: 'Parking', query: 'parking spaces' },
  renewal: { kind: 'text', label: 'Renewal option', labels: '', title: 'Renewal options', query: 'renewal option extend' },
};

/** The value patterns, one per kind: group 1 is the printed value. */
const VALUE = {
  money: String.raw`(\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|mm|m|million|thousand)\b)?)`,
  pct: String.raw`(\d+(?:\.\d+)?\s?%)`,
  year: String.raw`((?:18|19|20)\d\d)\b(?![-/]\d)`,
  date: String.raw`(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}/\d{1,2}/\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})`,
  sf: String.raw`(\d[\d,]*(?:\.\d+)?\s?(?:sf|sq\.? ?ft\.?|square feet|rsf))\b`,
  text: String.raw`([A-Za-z]{1,3}-?\d{1,2}[A-Za-z]?(?:-\d{1,2})?)\b`,
  count: String.raw`(\d[\d,]*\s?(?:spaces|stalls))\b`,
};
/** A second value of the same kind straight after the first (a table row of columns): the line does not say which is meant. */
const SECOND = { money: /^\s+\$?\d[\d,]*(?:\.\d+)?\b/, pct: /^\s+\d+(?:\.\d+)?\s?%/, year: /^\s+(?:18|19|20)\d\d\b/, date: /^\s+(?:\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/, sf: /^\s+\d[\d,]*\s?(?:sf|sq)/i, text: /^\s+[A-Z]{1,3}-?\d/, count: /^\s+\d[\d,]*\s?(?:spaces|stalls)/i };

/**
 * The value of a field as the document prints it next to its label, or null. Each line of the passage is tried;
 * `subject` (words that must be on the same line, such as a tenant's name) narrows which. A line with two values
 * of the kind after the label gives nothing.
 * @param {string} fieldId @param {string} text @param {{ subject?: string[] }} [opts]
 * @returns {{ field: string, label: string, printed: string, value: number | string, unit: string, line: string, title: string } | null}
 */
export function extractField(fieldId, text, { subject = [] } = {}) {
  const F = FIELDS[fieldId];
  if (!F || !text || looksLikeInstruction(text)) return null;
  const subj = subject.map((s) => s.toLowerCase());
  const after = F.labels ? new RegExp(`(?:^|[^A-Za-z])(${F.labels})${SEP}${VALUE[F.kind]}`, 'i') : null;
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const low = line.toLowerCase();
    if (subj.length && !subj.every((s) => low.includes(s))) continue;
    let m = after ? after.exec(line) : null;
    let printed = m ? m[2] : null;
    let label = m ? m[1] : null;
    let end = m ? m.index + m[0].length : 0;
    if (!m && F.before) { const b = F.before.exec(line); if (b) { m = b; printed = b[1]; label = b[0].slice(b[1].length).trim(); end = b.index + b[0].length; } }
    if (!m || printed === null) continue;
    let rest = line.slice(end);
    if (SECOND[F.kind] && SECOND[F.kind].test(rest)) continue;
    const parsed = parseValue(F.kind, printed);
    if (parsed === null) continue;
    let unit = '';
    if (F.kind === 'money') { const u = new RegExp(`^${UNIT_PER}`, 'i').exec(rest); unit = u ? u[0].trim() : ''; }
    return { field: fieldId, label: String(label).replace(/\s+/g, ' '), printed: printed.replace(/\s+/g, ' '), value: parsed, unit, line, title: F.title };
  }
  return null;
}

/** The number, or the ISO day, or the text, behind a printed value; null when it is not one. */
function parseValue(kind, printed) {
  if (kind === 'money') { const v = parseNum(printed.replace(/\s?million/i, 'm').replace(/\s?thousand/i, 'k')); return v !== null && v >= 0 ? v : null; }
  if (kind === 'pct') { const v = parseNum(printed); return v !== null && v >= 0 && v <= 100 ? v : null; }
  if (kind === 'year') { const v = Number(printed); return v >= 1800 && v <= NOW + 3 ? v : null; }
  if (kind === 'date') { const iso = parseDateText(printed); return iso || null; }
  if (kind === 'sf' || kind === 'count') { const v = parseNum(printed.replace(/[^\d.,]/g, '')); return v !== null && v > 0 ? v : null; }
  return printed.trim() || null;
}

/** "Mar 31, 2027" for an ISO day: the month spelled out, so a day and a month cannot be swapped. */
export const longDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

/** How a found value is said: the printed text, with the normalised value where it differs from it. */
export function sayFigure(x) {
  if (x.field && FIELDS[x.field]) {
    const K = FIELDS[x.field].kind;
    if (K === 'date') return `${x.title}: ${x.printed}${x.printed !== longDay(String(x.value)) ? ` (${longDay(String(x.value))})` : ''}`;
    if (K === 'money') return `${x.title}: ${x.printed}${x.unit ? ` ${x.unit}` : FIELDS[x.field].perUnit ? ' (no unit stated)' : ''}`;
  }
  return `${x.title}: ${x.printed}`;
}

/**
 * Compare a figure read from a document with the deal's own. Returns 'same' or 'differ' (never a guess at which is
 * right: the deal's figure is the one every calculation uses).
 * @param {string} fieldId @param {number | string} docValue @param {number | null | undefined} dealValue
 */
export function compareWithDeal(fieldId, docValue, dealValue) {
  if (typeof docValue !== 'number' || typeof dealValue !== 'number' || !Number.isFinite(dealValue)) return null;
  const K = FIELDS[fieldId].kind;
  const tol = K === 'pct' ? 0.05 : Math.max(1, Math.abs(dealValue) * 0.001);
  return Math.abs(docValue - dealValue) <= tol ? 'same' : 'differ';
}

/* ------------------------------------------------------- what a question about documents is */

/** Questions that name a field of a document. `engine` says where the deal's own record answers first. */
/** @type {[string, RegExp][]} */
const ASKS = [
  ['yearBuilt', /\b(?:what year|which year|when)\b.*\b(?:built|constructed)\b|\byear (?:built|constructed)\b|\bbuilt in\b|\bconstruction (?:year|date)\b|\bhow old\b/],
  ['renewal', /\b(?:renewal|renew|extension)s? options?\b|\boptions? to (?:renew|extend)\b|\bcan (?:the |a )?tenant (?:renew|extend)\b|\bis there (?:a |an )?(?:renewal|extension)\b|\b(?:any|have) (?:renewal|extension) options?\b/],
  ['cam', /\b(?:cam|common area maintenance)\b|\bnet charges\b|\boperating expense (?:reimbursements?|pass[- ]?throughs?)\b/],
  ['escalation', /\b(?:escalations?|escalators?|bumps?|steps?[- ]ups?|annual (?:rent )?increases?|rent increases?|rent steps?)\b/],
  ['zoning', /\bzoning\b|\bzoned\b/],
  ['parking', /\bparking\b/],
  ['deposit', /\bsecurity deposit\b/],
  ['baseRent', /\bbase rent\b|\bminimum rent\b/],
];

/**
 * Is this question one to answer from documents? Returns { query, field, subject, engine, unit } or null.
 * `text` is assistant.js clean()ed (lower case, synonyms folded); `raw` is what was typed.
 * @param {string} text @param {string} raw
 */
export function docQuestion(text, raw) {
  const quoted = /["“']([^"”']{2,80})["”']/.exec(String(raw));
  let m;
  // an explicit ask of a document: "what does the OM say about X", "find 'roof'", "does the lease mention X", "according to the OM, ..."
  if ((m = /^(?:please |can you |could you )?(?:find|search(?: for)?|look up|look for|locate|ctrl[- ]?f|grep)\s+(?:for |in (?:the )?(?:om|documents?|lease|files?) (?:for )?)?(.+)$/.exec(text))) return { query: quoted ? quoted[1] : m[1], field: null, subject: [], engine: null, explicit: true };
  if ((m = /\b(?:what|how|where|who)\b.*?\b(?:do|does|did|is|are)?\s*(?:the )?(?:om|offering memorandum|lease|leases|documents?|files?|t12|rent roll|memo|brochure|report)\s+(?:say|says|said|state|states|mention|mentions|cover|covers|have|has|include|includes)\s+(?:about|on|regarding|for|re)\s+(.+)$/.exec(text))) return { query: quoted ? quoted[1] : m[1], field: null, subject: [], engine: null, explicit: true };
  if ((m = /\b(?:does|do|did)\s+(?:the |this |my )?(?:om|offering memorandum|lease|leases|documents?|files?|memo|report)\s+(?:say|state|mention|talk about|cover|include)\s+(?:anything\s+(?:about|on)\s+)?(.+)$/.exec(text))) return { query: quoted ? quoted[1] : m[1], field: null, subject: [], engine: null, explicit: true };
  if ((m = /\b(?:according to|per|in|from) (?:the )?(?:om|offering memorandum|lease|documents?|files?),?\s+(.+)$/.exec(text))) return { query: m[1], field: null, subject: [], engine: null, explicit: true };
  // who is the tenant in suite 200
  if ((m = /\b(?:who|which tenant|what tenant)\b.*\b(?:suite|unit|space|ste)\s*#?\s*([a-z0-9][a-z0-9-]*)\b/.exec(text))) return { query: `suite ${m[1]} tenant`, field: null, subject: [`${m[1]}`], engine: { suite: m[1] }, explicit: false };
  // when does <tenant>'s lease expire
  if ((m = /^(?:when|what date)\b\s+(?:does|do|will|is)\s+(.+?)(?:'s|s)?\s+(?:lease|term)\s+(?:expire|end|expir\w+|roll|run out)s?\b/.exec(text)) || (m = /^(?:when|what date)\b\s+(?:does|do|will)\s+(.+?)\s+(?:expire|end|roll)s?$/.exec(text))) {
    const who = m[1].replace(/^(?:the|a|an)\s+/, '').replace(/\blease\b/g, '').trim();
    if (who && !/^(?:my|our|it|this|that|these|those|the|each|every|any|a lease|leases?)$/.test(who)) return { query: `${who} lease expiration`, field: 'expiration', subject: who.split(/\s+/).filter((w) => w.length > 1), engine: { tenant: who }, explicit: false };
  }
  for (const [field, re] of ASKS) if (re.test(text)) return { query: FIELDS[field].query, field, subject: [], engine: null, explicit: false };
  return null;
}

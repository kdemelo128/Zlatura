/* ddtypes.js -- the due-diligence document types, the checklist each kind of property asks for, and the
 * classifier that proposes a type from a file's text. Pure and frozen: no page, no storage, no file.
 *
 * The rules (docs/proposals/underwriting-evolve.md section 8):
 *   - the checklist is advice: it never blocks a figure, and a missing required document is "missing", never
 *     assumed received;
 *   - a file name only suggests a type, it never sets one; content decides, and when the content is not clear
 *     enough the answer is "ask", never a guess;
 *   - the property type is never defaulted: blank or unrecognised gives no checklist until the broker picks one. */

/** @typedef {'office'|'retail'|'netlease'|'multifamily'|'industrial'} Preset */
/**
 * @typedef {Object} DocType
 * @property {string} id
 * @property {string} label
 * @property {'om'|'rrpdf'|'rrsheet'|'t12'|null} reader the reader that already exists for it (null: none yet)
 * @property {RegExp[]} content patterns on the first pages' text; each one found counts once
 * @property {RegExp[]} name patterns on the file name; they only suggest
 * @property {Preset[]|null} classes the property kinds it applies to (null: all)
 */

const T = (id, label, reader, content, name, classes = null) => Object.freeze({ id, label, reader, content: Object.freeze(content), name: Object.freeze(name), classes: classes && Object.freeze(classes) });

export const TYPES = Object.freeze([
  T('om', 'Offering memorandum', 'om', [/offering memorandum/i, /investment (highlights|summary|overview)/i, /(asking|offering) price/i, /confidentiality (agreement|notice|disclaimer)/i, /executive summary/i], [/\bOM\b/, /offering|memorandum/i]),
  T('rentroll', 'Rent roll', 'rrpdf', [/rent roll/i, /lease (start|end|expir)/i, /\b(suite|unit)\b.*\btenant\b|\btenant\b.*\b(suite|unit)\b/i, /square feet|\bsq\.? ?ft\b|\bSF\b/i, /monthly rent|annual rent|base rent/i], [/rent[ _-]?roll|\brr\b/i]),
  T('t12', 'T-12 operating statement', 't12', [/trailing (12|twelve)|\bT-?12\b/i, /operating statement|income statement|profit (and|&) loss/i, /net operating income/i, /total (operating )?expenses/i, /effective gross income|total (rental )?income/i], [/t[ _-]?12|trailing|operating[ _-]?statement|p&l|income[ _-]?statement/i]),
  T('budget', 'Operating budget', null, [/\bbudget\b/i, /(proposed|projected|forecast)/i, /fiscal year|\bFY ?\d{2,4}\b/i, /(annual|operating|capital) budget/i], [/budget/i]),
  T('priorStmt', 'Prior-year statements', null, [/prior[- ]year|historical operating|year[- ]end (operating|financial)/i, /income and expense/i, /\b20\d\d (actual|statement|operating)/i, /(balance sheet|general ledger)/i], [/prior|historical|year[ _-]?end/i]),
  T('lease', 'Lease', null, [/lease agreement|this lease\b/i, /\blandlord\b/i, /\btenant\b/i, /commencement date|lease term|the premises/i, /base rent|rent commencement/i], [/\blease\b/i]),
  T('amendment', 'Lease amendment', null, [/(first|second|third|fourth|\d+(st|nd|rd|th)) amendment to (the )?lease|lease amendment/i, /amends? (the|that certain) lease/i, /\bamendment\b/i, /\blandlord\b/i, /\btenant\b/i], [/amend/i]),
  T('estoppel', 'Tenant estoppel', null, [/estoppel certificate|tenant estoppel/i, /certif(y|ies)\b.*\blease\b/i, /full force and effect/i, /no (default|defaults)/i, /security deposit/i], [/estoppel/i]),
  T('snda', 'SNDA', null, [/subordination,?\s+non-?disturbance/i, /attornment/i, /\bSNDA\b/, /(lender|mortgagee)/i], [/snda|subordination|non-?disturbance/i]),
  T('guaranty', 'Guaranty', null, [/guarant(y|ee)\b/i, /(absolute|unconditional|payment|completion) guarant/i, /obligations of (the )?tenant/i, /\bguarantor\b/i], [/guarant/i]),
  T('title', 'Title commitment', null, [/title commitment|commitment for title insurance/i, /schedule b\b/i, /(exceptions|requirements)/i, /title insurance/i, /\bALTA\b/], [/title/i]),
  T('survey', 'Survey', null, [/ALTA\/(NSPS|ACSM)/, /boundary survey|land title survey|surveyor/i, /legal description/i, /(flood zone|FEMA)/i, /(easement|encroachment)/i], [/survey|alta/i]),
  T('esa1', 'Phase I environmental report', null, [/phase (I|1) environmental/i, /E ?1527/i, /recognized environmental condition|\bRECs?\b/, /environmental site assessment/i], [/phase[ _-]?(1|i)\b|esa|environmental/i]),
  T('pcr', 'Property condition report', null, [/property condition (report|assessment)/i, /E ?2018/i, /immediate repairs|replacement reserve/i, /remaining useful life/i], [/pcr|condition/i]),
  T('appraisal', 'Appraisal', null, [/appraisal (report|of)/i, /USPAP/, /(market value|as[- ]is value)/i, /highest and best use/i, /sales comparison approach|income capitalization approach/i], [/apprais/i]),
  T('taxbill', 'Tax bill', null, [/tax (bill|statement|notice)/i, /assess(ed|ment) value/i, /parcel (id|number|no)|\bAPN\b/i, /(installment|delinquent)/i, /(millage|mill rate|tax rate)/i], [/tax/i]),
  T('insurance', 'Insurance', null, [/certificate of (liability )?insurance|ACORD/i, /policy (number|period)/i, /(general liability|property coverage|umbrella)/i, /(premium|deductible)/i, /\binsured\b/i], [/insur|acord|coi/i]),
  T('utilities', 'Utility bills', null, [/utility (bill|statement|expense)|(electric|water|gas|sewer) (bill|statement)/i, /(kwh|therms|gallons)/i, /(account number|service period)/i], [/utilit|electric|water|sewer/i]),
  T('contract', 'Service contracts', null, [/service (contract|agreement)|maintenance agreement/i, /(vendor|contractor)/i, /(termination|notice).{0,40}days/i, /scope of services/i], [/contract|service/i]),
  T('loan', 'Loan documents', null, [/promissory note|loan agreement|deed of trust|mortgage note/i, /(principal amount|interest rate|maturity date)/i, /(amortization|debt service coverage)/i, /(borrower|lender)/i], [/loan|note|mortgage/i]),
  T('zoningCo', 'Zoning letter or certificate of occupancy', null, [/zoning (letter|verification|report|certificate)/i, /certificate of occupancy/i, /(permitted use|nonconforming|setback)/i, /zoning district/i], [/zoning|occupancy|\bCO\b/i]),
  T('areaCert', 'Area measurement (BOMA or architect)', null, [/\bBOMA\b/, /(rentable|usable) (square|area)|gross (building )?area/i, /(architect|measured by)/i, /area (certification|calculation|measurement)/i], [/boma|area|measure/i]),
  T('cam', 'CAM reconciliation', null, [/(CAM|common area maintenance) (reconciliation|charges|budget)/i, /pro[- ]rata share/i, /(reconciliation|true-?up)/i, /(admin(istrative)? fee|management fee)/i], [/\bcam\b|reconcil/i], ['office', 'retail', 'netlease', 'industrial']),
  T('tenantSales', 'Tenant sales reports', null, [/(tenant|store|gross) sales (report|statement)/i, /percentage rent/i, /(monthly|annual) sales/i, /breakpoint/i], [/sales/i], ['retail', 'netlease']),
  T('rea', 'Reciprocal easement agreement', null, [/reciprocal easement|declaration of (covenants|easements)|\bREA\b/i, /(operating agreement|common areas)/i, /(easement|covenants)/i], [/\brea\b|easement|declaration/i], ['retail', 'netlease']),
  T('unitMix', 'Unit mix', null, [/unit mix/i, /(studio|1 ?br|2 ?br|one[- ]bedroom|two[- ]bedroom)/i, /(avg(erage)?|market) rent/i, /(# ?units|unit type)/i], [/unit[ _-]?mix/i], ['multifamily']),
  T('receivables', 'Receivables (aged)', null, [/(aged )?receivables|delinquen(cy|t) (report|rent)/i, /(30|60|90)\+? days/i, /(balance due|past due)/i], [/receivable|delinq|aged/i], ['multifamily']),
]);

// no prototype: 'constructor', 'toString' or '__proto__' from a damaged backup are not type ids
export const TYPE_BY_ID = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(TYPES.map((t) => [t.id, t]))));
/** Is this a known type id (a string that is an own key of the table)? */
export const isType = (id) => typeof id === 'string' && Object.hasOwn(TYPE_BY_ID, id);
export const typeLabel = (id) => (isType(id) ? TYPE_BY_ID[id].label : 'Not typed yet');

export const PRESETS = Object.freeze({ office: 'Office', retail: 'Retail', netlease: 'Net lease', multifamily: 'Multifamily', industrial: 'Industrial' });
export const PRESET_IDS = Object.freeze(Object.keys(PRESETS));

/* Required (R), optional (O), required only when a lease has percentage rent (C), by kind of property; a type
 * that is not listed for a kind is not asked for there (a document of it is still kept). The five columns of the
 * table in the design note, in the order office, retail, net lease, multifamily, industrial. */
/** @type {[string[], string][]} */
const ROWS = [
  [['rentroll', 'taxbill', 'insurance', 'title', 'survey', 'esa1', 'zoningCo'], 'RRRRR'],
  [['t12'], 'RRORR'],
  [['lease', 'estoppel'], 'RRROR'],
  [['snda', 'cam', 'areaCert'], 'RRO-O'],
  [['guaranty'], 'OOR-O'],
  [['pcr', 'contract', 'appraisal', 'loan', 'budget', 'priorStmt', 'om'], 'OOOOO'],
  [['tenantSales', 'rea'], '-CO--'],
  [['unitMix', 'receivables'], '---R-'],
  [['utilities'], '---RO'],
];
const COLS = ['office', 'retail', 'netlease', 'multifamily', 'industrial'];
export const REQUIREMENTS = Object.freeze(Object.fromEntries(COLS.map((p, c) => [p, Object.freeze(Object.fromEntries(ROWS.flatMap(([ids, marks]) => (marks[c] === '-' ? [] : ids.map((id) => [id, marks[c]])))))])));

/**
 * The kind of property a "Property type" figure names, or null: blank or unrecognised is null, never Retail
 * (rentroll.js presetFor falls back to Retail for the rent roll's columns; a checklist must not). Net lease is read
 * only from those words; it is never guessed from a single tenant. "Mixed use", or text naming more than one kind, is null: the broker chooses.
 * @param {unknown} ptype @returns {Preset | null}
 */
export function presetOf(ptype) {
  const t = String(ptype ?? '');
  if (/mixed/i.test(t)) return null;
  // one clear kind or nothing: "Multi-tenant office/retail" or "Retail/Office" names several, so the broker is asked
  const hits = [
    /multi[- ]?family|apartment|residential/i.test(t) && 'multifamily',
    /industrial|warehouse|flex/i.test(t) && 'industrial',
    /net[- ]?lease|\bnnn\b/i.test(t) && 'netlease',
    /\boffice\b|medical/i.test(t) && 'office',
    /\b(retail|grocery|restaurant|strip (mall|center|centre)|(shopping|town|lifestyle|power|neighbou?rhood) (center|centre)|shopping|supermarket)\b/i.test(t) && 'retail',
  ].filter(Boolean);
  return hits.length === 1 ? /** @type {Preset} */ (hits[0]) : null;
}

/** The scores of every type for this text: [{ id, score }] best first (ties keep the table's order), zeros dropped. */
export function scoreText(text) {
  const t = String(text ?? '');
  return TYPES.map((x, i) => ({ id: x.id, i, score: x.content.filter((re) => re.test(t)).length }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.i - b.i).map(({ id, score }) => ({ id, score }));
}

/** The type a file name suggests, or null. It only pre-selects a choice; it never sets a type. */
export function suggestFromName(name) {
  const n = String(name ?? '');
  const hit = TYPES.find((x) => x.name.some((re) => re.test(n)));
  return hit ? hit.id : null;
}

/**
 * Classify text: { type, ask, suggest, scores }. `type` is set only when the best score is at least 2 and leads the
 * second by at least 2; otherwise it is null and `ask` holds the best three types (the name's suggestion first, when
 * it is not among them it is added) for a "What is this?" question.
 */
export function classify(text, name = '') {
  const scores = scoreText(text);
  const [a, b] = scores;
  const suggest = suggestFromName(name);
  const sure = !!a && a.score >= 2 && a.score - (b ? b.score : 0) >= 2;
  if (sure) return { type: a.id, ask: [], suggest, scores };
  const top = scores.slice(0, 3).map((x) => x.id);
  const ask = suggest ? [suggest, ...top.filter((x) => x !== suggest)].slice(0, 3) : top;
  return { type: null, ask, suggest, scores };
}

/**
 * The checklist for a kind of property: [{ id, label, need: 'R'|'O' }] in the table's order, with percentage
 * rent deciding the retail rows marked C. `preset` null gives no rows (the question is asked instead).
 * @param {Preset | null} preset @param {{ percentRent?: boolean }} [ctx]
 */
export function requirementsFor(preset, { percentRent = false } = {}) {
  const req = preset ? REQUIREMENTS[preset] : null;
  if (!req) return [];
  return TYPES.filter((t) => req[t.id]).map((t) => ({ id: t.id, label: t.label, need: req[t.id] === 'C' ? (percentRent ? 'R' : 'O') : req[t.id] }));
}

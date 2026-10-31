/* abstractfields.js -- the lease abstract's layout: the kinds a value can be, the status words, and the catalogue of
 * fields (the firm's layout, in our own words). Pure data; abstracts.js holds the operations on it.
 *
 * Kinds: text party address clause date dateRel money psf pct sf int enum bool. A field's stored value is
 * described in abstracts.js. Labels here are plain words of our own; no wording of any lease is kept in this file. */

export const KINDS = Object.freeze(['text', 'party', 'address', 'clause', 'date', 'dateRel', 'money', 'psf', 'pct', 'sf', 'int', 'enum', 'bool']);
export const STATUSES = Object.freeze(['unread', 'found', 'not-found', 'ambiguous']);
export const UNIT_NAMES = Object.freeze(['month', 'year', 'psf_year', 'psf_month', 'total']);
export const BASES = Object.freeze(['rentable', 'usable', 'gross', 'land']);
export const TERM_KINDS = Object.freeze(['initial', 'renewal', 'extension', 'fmv', 'opex']);
export const OPTION_KINDS = Object.freeze(['renewal', 'expansion', 'contraction', 'termination', 'rofr', 'rofo', 'purchase']);
export const RESETS = Object.freeze(['fmv', 'fixed', 'cpi', 'other']);
export const REL_TO = Object.freeze(['expiration', 'commencement', 'other']);
export const READERS = Object.freeze(['typed']);

/** Every cap in one place (the normaliser applies them all). */
export const LIMITS = Object.freeze({
  abstracts: 60, docs: 10, title: 120, terms: 6, steps: 40, options: 10, clauses: 20, flags: 20, sources: 3,
  text: 200, party: 200, addressLines: 8, addressLine: 120, clause: 1000, rel: 200, quote: 240, note: 300,
  termLabel: 80, termRef: 80, stepLabel: 40, customLabel: 60, resetText: 300, conditions: 300, flag: 200, id: 40, checked: 40,
  cell: 32767,
});

export const GROUPS = Object.freeze([
  { id: 'parties', label: 'Parties and notices' },
  { id: 'premises', label: 'Premises' },
  { id: 'term', label: 'Term and dates' },
  { id: 'money', label: 'Money and recoveries' },
  { id: 'clauses', label: 'Numbered notes (clauses)' },
]);

/** @type {(key: string, label: string, group: string, kind: string, extra?: any) => any} */
const F = (key, label, group, kind, extra = {}) => Object.freeze({ key, label, group, kind, ...extra });
const C = (key, label, optional = false) => F(key, label, 'clauses', 'clause', { optional });
const BEARERS = ['cash', 'letter of credit', 'other'];

export const FIELDS = Object.freeze([
  // parties and notices
  F('landlord', 'Landlord', 'parties', 'party'),
  F('tenant', 'Tenant', 'parties', 'party'),
  F('tradeName', 'Trade name', 'parties', 'text'),
  F('guarantor', 'Guarantor', 'parties', 'party'),
  F('noticeTenant', 'Notice address: tenant', 'parties', 'address'),
  F('noticeLandlord', 'Notice address: landlord', 'parties', 'address'),
  F('paymentAddress', 'Where rent is paid', 'parties', 'address'),
  // premises
  F('propertyId', 'Property ID', 'premises', 'text'),
  F('premisesAddress', 'Premises address', 'premises', 'text'),
  F('suite', 'Suite', 'premises', 'text'),
  F('floor', 'Floor', 'premises', 'text'),
  F('sf', 'Square feet', 'premises', 'sf', { needsBasis: true }),
  F('proRata', 'Pro-rata share (%)', 'premises', 'pct'),
  F('proRataCovers', 'What the pro-rata share covers', 'premises', 'text'),
  F('measurement', 'How the space is measured', 'premises', 'text'),
  // term
  F('leaseDate', 'Lease date', 'term', 'date'),
  F('possession', 'Possession', 'term', 'dateRel'),
  F('commencement', 'Commencement', 'term', 'dateRel'),
  F('rentCommencement', 'Rent commencement', 'term', 'dateRel'),
  F('expiration', 'Expiration', 'term', 'dateRel'),
  F('termMonths', 'Stated term (months)', 'term', 'int'),
  F('termText', 'Term, as written', 'term', 'text'),
  F('escalation', 'Escalation, as written', 'term', 'text'),
  // money
  F('deposit', 'Security deposit', 'money', 'money', { unit: 'total' }),
  F('depositForm', 'Deposit held as', 'money', 'enum', { opts: BEARERS }),
  F('tiAllowance', 'Tenant improvement allowance', 'money', 'money', { units: ['total', 'psf_year'] }),
  F('tiDeadline', 'Allowance deadline', 'money', 'dateRel'),
  F('expenseStructure', 'Expense structure', 'money', 'enum', { opts: ['NNN', 'modified gross', 'full service gross', 'absolute', 'other'] }),
  F('baseYear', 'Base year', 'money', 'int'),
  F('expenseStop', 'Expense stop ($ per SF per year)', 'money', 'psf', { unit: 'psf_year', needsBasis: true }),
  F('capPct', 'Cap on increases (%)', 'money', 'pct'),
  F('capType', 'Cap type', 'money', 'enum', { opts: ['cumulative', 'non-cumulative', 'not stated'] }),
  F('adminFeePct', 'Administrative fee (%)', 'money', 'pct'),
  F('pctRentRate', 'Percentage rent rate (%)', 'money', 'pct'),
  F('breakpoint', 'Percentage rent breakpoint ($ per year)', 'money', 'money', { unit: 'year' }),
  F('breakpointNatural', 'Breakpoint is the natural breakpoint', 'money', 'bool'),
  F('holdoverPct', 'Holdover rent (% of the last rent)', 'money', 'pct'),
  F('estoppelDays', 'Estoppel response (days)', 'money', 'int'),
  F('assignmentFee', 'Assignment fee', 'money', 'money', { unit: 'total' }),
  F('guarantyScope', 'Guaranty scope', 'money', 'enum', { opts: ['full', 'limited', 'none'] }),
  F('guarantyCap', 'Guaranty cap', 'money', 'money', { unit: 'total' }),
  F('guarantyEnds', 'Guaranty ends', 'money', 'dateRel'),
  // numbered notes: the standard ones, then the optional ones
  C('premises', 'Premises'),
  C('cCommencement', 'Commencement'),
  C('cRentCommencement', 'Rent commencement'),
  C('cBaseRent', 'Base rent'),
  C('renewal', 'Renewal'),
  C('taxesInsCam', 'Taxes, insurance and common area charges'),
  C('pctRent', 'Percentage rent'),
  C('cPossession', 'Possession'),
  C('permittedUse', 'Permitted use'),
  C('tenantUpkeep', 'Tenant upkeep'),
  C('landlordMaintenance', 'Landlord maintenance'),
  C('utilities', 'Utilities'),
  C('cleaningTrash', 'Cleaning and trash'),
  C('alterations', 'Alterations'),
  C('insurance', 'Insurance'),
  C('casualtyCondemnation', 'Casualty and condemnation'),
  C('assignment', 'Assignment and subletting'),
  C('subordinationEstoppel', 'Subordination and estoppel'),
  C('cDeposit', 'Security deposit'),
  C('lateCharge', 'Late charge'),
  C('default', 'Default'),
  C('holdover', 'Holdover'),
  C('guarantorClause', 'Guarantor'),
  C('noticeClause', 'Notices'),
  C('licenses', 'Licenses', true),
  C('signs', 'Signs', true),
  C('landlordDefault', 'Landlord default', true),
  C('hazardous', 'Hazardous materials', true),
  C('broker', 'Broker', true),
  C('amendmentNote', 'Amendment', true),
  C('rentRelief', 'Rent relief and free rent', true),
  C('outdoorSeating', 'Outdoor seating', true),
  C('ventilation', 'Ventilation', true),
  C('serviceContracts', 'Service contracts', true),
  C('exclusive', 'Exclusive use', true),
  C('radius', 'Radius restriction', true),
  C('coTenancy', 'Co-tenancy', true),
  C('goDark', 'Go dark', true),
  C('relocation', 'Relocation', true),
  C('snda', 'Non-disturbance (SNDA)', true),
]);

export const FIELD_BY_KEY = Object.freeze(Object.fromEntries(FIELDS.map((f) => [f.key, f])));
/** The clause fields, in the order the notes are numbered. */
export const CLAUSES = Object.freeze(FIELDS.filter((f) => f.kind === 'clause'));

/* tableshape.js -- tables that have a rent roll's columns (a size, a rent, a name) but are not a rent roll, told by their headings.
 *
 * A unit mix has a count of units where a rent roll has one row a unit; a lease comparable table has an address and a start
 * date and no suite; a month-by-month rent schedule has a tenant and a month for every column. Each is asked about, never read
 * as a rent roll (the rent roll gate wants three recognised headings, which all three have) and the schedule never as an
 * operating statement (it has the month columns of one). Pure: headings in, a shape word or null out. */

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const SUITE = /^(?:suite|ste|space|premises|apt|apartment|unit)(?:\s*[/&]\s*(?:suite|ste|space|apt|apartment|unit))?(?:\s*(?:#|no\.?|number|id))?\.?$/i;
const TENANT = /^(?:tenant|occupant|lessee|resident|tenant name|name of tenant)(?:\s*name)?$/i;
// an end date (a rent roll has one, a comparable does not)
const LEASE_END = /\b(?:lease\s*(?:end|to|exp\w*)|expir\w*|exp\b|expires)\b/i;
const LEASE_DATE = /\b(?:lease\s*(?:start|from)|expir\w*)\b|\blease\s*(?:end|to|exp\w*)\b|\bexp\b|\bexpires\b/i;
const COUNT = /^(?:#\s*(?:of\s*)?(?:units?|apts?|apartments?)|(?:number|no\.?|count)\s+of\s+(?:units?|apts?)|units?\s*count|total\s+units|units|qty|quantity)$/i;
const SIZE = /^(?:(?:avg\.?|average)\s*)?(?:sf|rsf|size|area|sq\.?\s*ft\.?|square\s*(?:feet|footage))(?:\s*\(.*\))?$|\bsize\b|\bsf\b|sq\.?\s*ft/i;
const RENT = /\brent\b|\brate\b/i;
const PLACE = /\b(?:property|address|building|center|centre|project)\b/i;
const RATE_SF = /(?:rate|rent|\$)\s*\/\s*(?:sf|sq)|\bpsf\b|per\s+sf/i;
const TERM = /^(?:lease\s*)?term\b/i;
const COMMENCE = /commenc/i;
const LTYPE = /\blease\s*type\b|\btype\s+of\s+lease\b|\blease\s*structure\b|\bstructure\b/i;

/**
 * What a row of headings is: 'unitmix' (a count of units, a size or a rent, no tenant, suite or lease dates), 'leasecomp'
 * (a property or address, no suite, no end date, a commencement or a term, and three of size, rate per SF, term, commencement and lease
 * type), or null.
 * @param {unknown[]} headings @returns {'unitmix' | 'leasecomp' | null}
 */
export function tableShape(headings) {
  const hs = (headings || []).map(norm).filter(Boolean);
  if (hs.length < 3) return null;
  const any = (re) => hs.some((h) => re.test(h));
  // a suite or unit number is what makes a rent roll: neither shape has one
  if (any(SUITE)) return null;
  const size = hs.some((h) => SIZE.test(h) && !RATE_SF.test(h));
  if (any(COUNT) && (size || any(RENT)) && !any(TENANT) && !any(LEASE_DATE)) return 'unitmix';
  const own = [size, any(RATE_SF), any(TERM), any(COMMENCE), any(LTYPE)].filter(Boolean).length;
  if (any(PLACE) && !any(LEASE_END) && (any(COMMENCE) || any(TERM)) && own >= 3) return 'leasecomp';
  return null;
}

/** The shape of the first row, in a sheet's top twenty, whose cells make one (null when none does). @param {{ cells: unknown[] }[]} rows */
export function sheetShape(rows) {
  for (const r of (rows || []).slice(0, 20)) {
    const s = tableShape(r.cells);
    if (s) return s;
  }
  return null;
}

/**
 * A sheet whose month columns are laid against a tenant or a suite (a rent schedule: a row a tenant, a column a month): the
 * month row's other headings name a suite or a tenant. An operating statement's are an account or a line, or nothing.
 * @param {unknown[]} cells the row of month headings @param {unknown[]} months what the T-12 reader made of each cell (truthy: a month)
 */
export function isRentSchedule(cells, months) {
  return (cells || []).some((c, i) => !months[i] && typeof c === 'string' && (SUITE.test(norm(c)) || TENANT.test(norm(c))));
}

/* engine/recovery.js -- a tenant's share of operating expenses, one definition
 * for the Recovery tool (calc.js) and the rent-roll projection (lease.js).
 * Pro rata, over a base amount, over a stop per SF, or a fixed amount.
 * Annual dollars in, annual dollars out; a null means "can't tell", never 0. */

const ok = (x) => typeof x === 'number' && Number.isFinite(x);
const pos = (x) => ok(x) && x > 0;

/** Nothing typed: absent, empty, or only spaces. */
export const isBlank = (x) => x === undefined || x === null || (typeof x === 'string' && x.trim() === '');

/**
 * A typed amount as a number: a blank is 0 (nothing typed), a number or numeric
 * text is itself, and any other text ("abc") is null: can't tell, never 0.
 * @param {unknown} x @returns {number | null}
 */
export function amountOf(x) {
  if (isBlank(x)) return 0;
  const n = typeof x === 'number' ? x : typeof x === 'string' ? Number(x) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * The tenant's share of the building as a fraction: the typed share (%), else
 * tenant SF over building SF. Null when neither can be worked out.
 * @param {{ sharePct?: number | null, tenantSf?: number | null, buildingSf?: number | null }} a
 * @returns {number | null}
 */
export function shareOf({ sharePct, tenantSf, buildingSf }) {
  if (ok(sharePct)) return /** @type {number} */ (sharePct) / 100;
  return pos(tenantSf) && pos(buildingSf) ? /** @type {number} */ (tenantSf) / /** @type {number} */ (buildingSf) : null;
}

/** A base amount or stop: blank is unknown (null), never 0 (a blank base would recover the whole pool); a typed 0 stays 0. */
const typedAmount = (x) => { if (isBlank(x)) return null; const n = amountOf(x); return n !== null && n < 0 ? null : n; };

/**
 * One year of a tenant's recovery.
 *   pool        the year's recoverable expenses, whole building
 *   share       fraction from shareOf (not needed for a fixed recovery)
 *   baseAmount  base_year: the pool the landlord keeps paying
 *   stopPsf     stop: $/SF of building the landlord keeps paying
 *   fixed       fixed: the amount, as it stands in this year
 * Null when the pool is not a number, the share is needed and unknown, or a
 * base amount or stop is blank, negative or text that is not a number, or a
 * stop has no tenant or building SF to work from.
 * @param {{ method?: string, pool: number, share: number | null, tenantSf?: number | null, buildingSf?: number | null, baseAmount?: number | string | null, stopPsf?: number | string | null, fixed?: number | string | null }} a
 * @returns {number | null}
 */
export function recoveryAnnual({ method = 'prorata', pool, share, tenantSf, buildingSf, baseAmount, stopPsf, fixed }) {
  if (!ok(pool)) return null;
  // typed text that is not a number ("abc"), or a blank or negative base amount or stop, is "can't tell", not 0
  const base = typedAmount(baseAmount); const stop = typedAmount(stopPsf); const fix = amountOf(fixed);
  if (method === 'fixed') return fix;
  if (share === null) return null;
  if (method === 'prorata') return pool * share;
  if (method === 'base_year') return base === null ? null : Math.max(0, pool - base) * share;
  if (method === 'stop') return stop === null || !pos(buildingSf) || !pos(tenantSf) ? null : Math.max(0, pool / /** @type {number} */ (buildingSf) - stop) * /** @type {number} */ (tenantSf);
  return 0;
}

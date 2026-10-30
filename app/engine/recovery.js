/* engine/recovery.js -- a tenant's share of operating expenses, one definition
 * for the Recovery tool (calc.js) and the rent-roll projection (lease.js).
 * Pro rata, over a base amount, over a stop per SF, or a fixed amount.
 * Annual dollars in, annual dollars out; a null means "can't tell", never 0. */

const ok = (x) => typeof x === 'number' && Number.isFinite(x);
const pos = (x) => ok(x) && x > 0;
const nz = (x) => (ok(x) ? x : 0);

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

/**
 * One year of a tenant's recovery.
 *   pool        the year's recoverable expenses, whole building
 *   share       fraction from shareOf (not needed for a fixed recovery)
 *   baseAmount  base_year: the pool the landlord keeps paying
 *   stopPsf     stop: $/SF of building the landlord keeps paying
 *   fixed       fixed: the amount, as it stands in this year
 * Null when the pool is not a number, or the share is needed and unknown.
 * @param {{ method?: string, pool: number, share: number | null, tenantSf?: number | null, buildingSf?: number | null, baseAmount?: number | null, stopPsf?: number | null, fixed?: number | null }} a
 * @returns {number | null}
 */
export function recoveryAnnual({ method = 'prorata', pool, share, tenantSf, buildingSf, baseAmount, stopPsf, fixed }) {
  if (!ok(pool)) return null;
  if (method === 'fixed') return nz(fixed);
  if (share === null) return null;
  if (method === 'prorata') return pool * share;
  if (method === 'base_year') return Math.max(0, pool - nz(baseAmount)) * share;
  if (method === 'stop') return pos(buildingSf) && pos(tenantSf) ? Math.max(0, pool / /** @type {number} */ (buildingSf) - nz(stopPsf)) * /** @type {number} */ (tenantSf) : 0;
  return 0;
}

/* engine/pctrent.js -- percentage rent, one definition for the Percentage
 * rent tool (calc.js) and the rent-roll projection (lease.js): the share of
 * sales above the breakpoint, which is either typed (set) or natural (base
 * rent ÷ rate). Annual dollars; null means "can't tell", never 0. */

const ok = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * The breakpoint: base rent ÷ rate when natural and the base rent is known,
 * else the typed one. Null when neither is a number.
 * @param {{ rate: number, natural?: boolean, baseRent?: number | null, breakpoint?: number | null }} a
 * @returns {number | null}
 */
export function breakpointOf({ rate, natural = false, baseRent, breakpoint }) {
  const bp = natural && ok(baseRent) ? /** @type {number} */ (baseRent) / (rate / 100) : breakpoint;
  return ok(bp) ? /** @type {number} */ (bp) : null;
}

/**
 * The year's percentage rent: rate × the sales above the breakpoint.
 * @param {{ sales: number, rate: number, breakpoint: number }} a
 */
export function overageOf({ sales, rate, breakpoint }) {
  return Math.max(0, sales - breakpoint) * rate / 100;
}

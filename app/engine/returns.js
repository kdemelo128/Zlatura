/* engine/returns.js -- the sale at the end of a hold, one definition for the
 * Deal screen's hold returns (deal.js) and the DCF tool (calc.js): the
 * buyer's first-year income at the exit cap rate, less the costs of sale. */

/**
 * @param {{ basisNext: number, exitCap: number, saleCostPct?: number }} a
 *   basisNext    the income the buyer capitalises (the year after the sale)
 *   exitCap      %, above zero (the caller checks)
 *   saleCostPct  % of the gross price; used as given, so a caller that wants
 *                a negative cost is refused (null): it would raise the price
 * @returns {{ gross: number, saleCosts: number, net: number } | null}
 */
export function reversion({ basisNext, exitCap, saleCostPct = 0 }) {
  if (typeof saleCostPct === 'number' && saleCostPct < 0) return null;
  const gross = basisNext / (exitCap / 100);
  const saleCosts = saleCostPct ? gross * saleCostPct / 100 : 0;
  // net is gross x (1 - cost%), the DCF tool's own order; in the last digit it is not gross - saleCosts
  return { gross, saleCosts, net: saleCostPct ? gross * (1 - saleCostPct / 100) : gross };
}

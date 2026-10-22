/* numtext.js -- the sign rule for displayed numbers. DOM-free, so kit.js and
 * the exporters can both import it (kit.js reads `window` when it loads). */

/**
 * The sign to put in front of already-formatted digits. A figure whose digits
 * are all zero shows no sign at all (no "-$0", no "+0.0%"); `plus` adds "+" to
 * a nonzero positive. The sign comes from the formatted digits, so it can
 * never disagree with the rounding that toFixed or toLocaleString did.
 * @param {number} n the value that was formatted
 * @param {string} digits the formatted magnitude, e.g. "1,234" or "0.0"
 * @param {boolean} [plus] show "+" on a nonzero positive
 * @returns {string}
 */
export const signOf = (n, digits, plus = false) =>
  (/[1-9]/.test(digits) ? (n < 0 ? '-' : plus && n > 0 ? '+' : '') : '');

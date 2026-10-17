/* scale.js -- the scale a table's heading states ("($ in thousands)", "$000s",
 * "in millions"): one reader for every table that can print its figures scaled
 * (an operating statement, omstatement.js; an OM's rent roll, omroll.js). Pure. */

const THOUSANDS = /\(\s*\$?\s*(?:in\s+)?0{3}'?s?\s*\)|\$\s?0{3}'?s?(?![\d,])|\bin\s+(?:\$\s?)?thousands\b|\(\s*\$?\s*(?:in\s+)?thousands\s*\)|\bthousands of dollars\b|\$\s*in\s+0{3}'?s|\(\s*\$\s*k\s*\)/i;
const MILLIONS = /\bin\s+(?:\$\s?)?millions\b|\(\s*\$?\s*(?:in\s+)?(?:mm|millions)\s*\)|\(\s*\$\s*m\s*\)|\$\s?mm\b|\bmillions of dollars\b|\$\s*in\s+millions/i;

/** The scale a title, heading or note states: { scale, text } (1 when it says nothing). */
export function scaleOf(text) {
  const s = String(text || '');
  let m = MILLIONS.exec(s);
  if (m) return { scale: 1e6, text: m[0].trim() };
  m = THOUSANDS.exec(s);
  if (m) return { scale: 1e3, text: m[0].trim() };
  return { scale: 1, text: '' };
}


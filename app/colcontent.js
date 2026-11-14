/* colcontent.js -- what a table's column holds, read from its values, for when its heading is not one the readers know.
 *
 * A rent roll whose tenant column is headed "Concept", "Customer", "Store" or nothing at all still lists one business
 * a row: short, different names made of words, not figures, dates or codes. This module says whether a column's
 * values read that way, and how many do. It is evidence only: it never fills a value and never decides alone. The
 * readers (omroll.js for a PDF, rentrollui.js for a spreadsheet) use it to OFFER a reading that the broker confirms;
 * a file whose headings the readers already know never reaches it. Pure: values in, a verdict out.
 * Design: docs/proposals/reader-content.md. */

/** A cell that says nothing (a dash, "n/a"): neither a name nor a figure. */
const BLANK = /^(?:-+|–|—|n\/?a|none|tbd|\.+|\?)$/i;
/** A row that is not a tenant's: a vacancy, a total, a status word. Skipped, not counted against the column. */
const NOT_A_TENANT = /^(?:vacant|vacancy|available|unleased|unoccupied|occupied|leased|mtm|month[- ]to[- ]month|holdover|totals?|sub-?totals?|grand total|average|averages)\b/i;
/** A figure, a share or a sum of money, as printed. */
const FIGURE = /^\(?\s*[-+]?\s*[$€£]?\s?\d[\d,]*(?:\.\d+)?\s*(?:%|k|m|mm|sf|rsf|psf)?\s*\)?$/i;
/** A date, a month or a year, as printed ("12/31/2030", "2030-12-31", "Dec 2030", "2030"). */
const DATE = /^(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}(?:-\d{2})?|\d{1,2}[/-](?:19|20)\d\d|(?:19|20)\d\d|[a-z]{3,9}\.?[\s,'-]+(?:\d{1,2},?\s+)?(?:19|20)?\d\d)$/i;
/** A street address ("12 Sample Road"): a column of these is a list of properties, not of tenants. */
const ADDRESS = /^\d{1,6}[a-z]?\s+.*\b(?:st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|way|ln|lane|pkwy|parkway|hwy|highway|ct|court|pl|place|cir|circle|ter|terrace|sq|square)\b\.?/i;

const text = (v) => (v === null || v === undefined ? '' : v instanceof Date ? '' : String(v).replace(/\s+/g, ' ').trim());

/** Whether one cell reads as a name: words (three letters in a row somewhere, letters at least half the characters), not a figure, date, code ("1BR/1BA"), address, e-mail or web address. */
export function nameLike(v) {
  if (typeof v === 'number' || v instanceof Date) return false;
  const s = text(v);
  if (!s || s.length > 60 || BLANK.test(s) || FIGURE.test(s) || DATE.test(s) || ADDRESS.test(s) || /@|https?:|www\./i.test(s) || !/[a-z]{3}/i.test(s)) return false;
  const letters = (s.match(/[a-z]/gi) || []).length;
  const chars = s.replace(/\s/g, '').length;
  return letters >= 3 && letters * 2 >= chars && s.split(' ').length <= 8;
}

/**
 * Whether a column's values read as a list of tenant names: three or more names, nearly every filled cell a name
 * (a vacancy or a total row is skipped, not counted), and nearly all of them different (a status, a unit type or a
 * lease type repeats; a tenant list does not). Returns { names, of, distinct } when it does, else null.
 * @param {unknown[]} values the column's cells, top to bottom
 * @returns {{ names: number, of: number, distinct: number } | null}
 */
export function nameColumn(values) {
  const filled = (values || []).filter((v) => { const s = text(v); return (s || typeof v === 'number') && !BLANK.test(s) && !NOT_A_TENANT.test(s); });
  const names = filled.filter(nameLike).map((v) => text(v).toLowerCase());
  if (names.length < 3 || names.length < 0.8 * filled.length) return null;
  const distinct = new Set(names).size;
  if (distinct < 0.9 * names.length) return null;
  return { names: names.length, of: filled.length, distinct };
}

/** A heading that names something other than a tenant, though its column holds names: a property, a place, a party to a sale, a contact person, notes. */
export const NOT_TENANT_HEADING = /\b(?:property|properties|address|building|center|centre|project|city|town|market|submarket|county|state|zip|buyer|seller|broker|lender|landlord|owner|developer|manager|contacts?|e-?mail|phone|agent|leasing|notes?|comments?|remarks?|options?|guarant\w*|description|type|use|class|status)\b/i;

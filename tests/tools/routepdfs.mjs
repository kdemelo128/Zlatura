/* routepdfs.mjs -- invented PDFs for the routing tests and the invented corpus: pages put together from the project's
 * own invented fixtures (tests/rr-fixtures.js rent roll, tests/monthlypdf-fixtures.js statement) and plain prose. A page
 * is a list of items { x, y, s, ... } as pdfOf sets them. No real file, name or figure. */
import { pdfOf, specDdRoll } from '../rr-fixtures.js';
import { monthlyRows, MONTHS } from '../monthlypdf-fixtures.js';

export { pdfOf };
const OM_LINES = ['Offering Memorandum', 'Executive Summary', 'Asking Price $5,000,000   Cap Rate 6.5%', 'Investment Highlights', 'This memorandum is subject to the confidentiality agreement.'];
/** Lines of prose, one under the other. */
export const prose = (lines, { y = 750, size = 8 } = {}) => lines.map((s, i) => ({ x: 40, y: y - i * 12, s, size }));
/** An offering memorandum's opening page (two or more of the OM reader's words). */
export const omPage = () => prose(OM_LINES);
const PLAIN = { Suite: 'Unit', Tenant: 'Occupant', 'Lease Start': 'Start', 'Lease End': 'Expires', 'Annual Rent': 'Yearly', 'Rent/SF': 'Per area', Monthly: 'Per month' };
/** A rent roll page (the project's invented due-diligence roll); `title` false leaves out its title and "As of" line, so nothing on the page says what it is;
 *  `plain` words the headings so that little of the page's text scores as a rent roll (the classifier sees one candidate). */
export function rollPage({ title = true, plain = false } = {}) {
  const items = specDdRoll()[0].map((it) => (plain && PLAIN[it.s] ? { ...it, s: PLAIN[it.s] } : it));
  return title ? items : items.filter((it) => !/^(Rent Roll|As of:|Sample Plaza)/.test(it.s));
}
/** A monthly operating statement page of twelve actual months, titled `title`. */
export function statementPage(title = 'Monthly Operating Statement - Actuals 2025') {
  const labels = [...MONTHS, 'Total'];
  const items = [{ s: title, x: 24, y: 750, size: 10, bold: true }, ...labels.map((s, i) => ({ s, x: 186 + i * 31, y: 718, size: 5, right: true }))];
  monthlyRows({}).forEach((cells, i) => {
    items.push({ s: cells[0], x: 24, y: 690 - i * 20, size: 7 });
    cells.slice(1).forEach((v, j) => { if (v != null) items.push({ s: String(v), x: 186 + j * 31, y: 690 - i * 20, size: 5, right: true }); });
  });
  return items;
}
/** A page of invented narrative long enough to count as a text layer, with `lines` first. */
export const narrative = (...lines) => prose([...lines, ...Array.from({ length: 12 }, (_, i) => `Invented narrative sentence ${i + 1} about the sample property and its surroundings, written only for a test.`)]);

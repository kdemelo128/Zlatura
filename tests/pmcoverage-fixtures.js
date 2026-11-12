/* Invented property-manager report; reuse the existing public PDF fixture writer. */
import { PDF_SPECS, pdfOf } from './rr-fixtures.js';

export function pmCoveragePdf(filtered = true) {
  const pages = PDF_SPECS['rr-pm']();
  pages[0].push({ x: 30, y: 713, size: 7, s: `Unit Filter: All   Status Filter: ${filtered ? 'Occupied' : 'All'}` });
  return pdfOf(pages);
}

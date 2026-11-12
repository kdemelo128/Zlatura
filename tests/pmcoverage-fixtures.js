/* Invented property-manager report; reuse the existing public PDF fixture writer. */
import { PDF_SPECS, pdfOf } from './rr-fixtures.js';

export function pmCoveragePdf(filtered = true, { tenantAbove = null, kind = null } = {}) {
  const pages = PDF_SPECS['rr-pm']();
  if (filtered) {
    const omitted = pages[0].find((i) => i.s === 'B1');
    pages[0] = pages[0].filter((i) => i.y !== omitted.y);
  }
  if (tenantAbove) {
    const tenant = pages[0].find((i) => i.s === 'Maple Leaf Bakery');
    tenant.s = tenantAbove; tenant.y += 7; tenant.size = 5;
  }
  if (kind === 'om') {
    pages[0].find((i) => i.y === 750).s = 'Offering Memorandum';
    pages[0].push({ x: 30, y: 764, size: 7, s: 'Asking Price $3,000,000 - Cap Rate 6.1%' });
  }
  pages[0].push({ x: 30, y: 713, size: 7, s: `Unit Filter: All   Status Filter: ${filtered ? 'Occupied' : 'All'}` });
  return pdfOf(pages);
}

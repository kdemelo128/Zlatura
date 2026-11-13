/* Invented property-manager report (the rr-pm spec) with the first tenant's name wrapped onto a line above its figures. */
import { PDF_SPECS, pdfOf } from './rr-fixtures.js';

export function pmWrapPdf({ tenantAbove = null, filterText = 'Unit Filter: All   Status Filter: All', footer = null } = {}) {
  const pages = PDF_SPECS['rr-pm']();
  if (tenantAbove) {
    const tenant = pages[0].find((i) => i.s === 'Maple Leaf Bakery');
    tenant.s = tenantAbove; tenant.y += 7; tenant.size = 5;
  }
  pages[0].push({ x: 30, y: 713, size: 7, s: filterText });
  if (footer) pages[0].push({ x: 30, y: 200, size: 7, s: footer });
  return pdfOf(pages);
}

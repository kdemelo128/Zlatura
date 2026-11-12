/* Invented mixed document; no private content and no shared corpus changes. */
import { tbl, C9, r1, r2, PDF_SPECS, pdfOf } from './rr-fixtures.js';
import { CASES } from './om-statement-fixtures.js';
const filler = 'A fictional property overview, prepared for this parser test. The following pages describe location, access and building features without providing financial figures.';
export function buriedRoll({ om = true, joinedHeaders = false } = {}) {
  const cover = om ? 'Offering Memorandum\nInvestment Summary\nRent roll overview: Unit Tenant, lease start and lease end, square feet, annual rent and base rent.' : 'Due diligence package\nContents follow.';
  const pages = [cover, filler, '', ...Array.from({ length: 10 }, () => filler)];
  const cols = joinedHeaders ? C9.map((c) => ({ ...c, h: c.h.replace(/ /g, '') })) : C9;
  pages.push(`Rent Roll\n\n${tbl(cols, [r1, r2])}`);
  pages.push('Rent Roll Summary\nTotal Units: 2\nBoth units are occupied.');
  pages.push(CASES.history[0]);
  return pages;
}
export function buriedRollPdf({ om = true } = {}) {
  const pages = [[{ x: 30, y: 750, s: om ? 'Offering Memorandum - Investment Summary' : 'Due diligence package' }, { x: 30, y: 730, s: om ? 'Rent roll: Unit Tenant, lease start and lease end, SF, annual rent and base rent.' : 'The source schedules follow the overview pages.' }, ...(om ? [{ x: 30, y: 710, s: 'Asking Price: $2,000,000' }] : [])], ...Array.from({ length: 12 }, (_, i) => [{ x: 30, y: 750, s: `Fictional overview page ${i + 2}` }])];
  pages.push(...PDF_SPECS['rr-dd']());
  return pdfOf(pages);
}

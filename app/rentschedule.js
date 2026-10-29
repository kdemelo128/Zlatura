/* rentschedule.js -- the net lease rent schedule as shown: the lease.js rows turned into cells
 * for the deal-page card, the pasted text and the brief (the workbook uses the rows directly). */

import { dayText, leaseName } from './lease.js';
import { money2, pct } from './kit.js';
import { tsvCell } from './exporters.js';

/** Header and rows as strings; a figure that can't be worked out reads "—". */
export function scheduleCells(S) {
  const head = ['Period', 'Years', 'Annual rent', 'Monthly', '$/SF/yr', 'Change', ...(S.showPrice ? [S.priceLabel] : []), 'Notes'];
  const rows = S.rows.map((r) => [
    `${dayText(r.from)} – ${dayText(r.to)}`, r.years || '', money2(r.annual), money2(r.monthly), money2(r.psfYear), pct(r.change, 2),
    ...(S.showPrice ? [pct(r.onPrice, 2)] : []), r.note || '',
  ]);
  return { head, rows };
}


/** Tab-separated text for a spreadsheet paste: every cell through tsvCell, then the footnotes. */
export function scheduleTsv(list) {
  const out = [];
  for (const { L, S } of list) {
    if (list.length > 1) out.push(tsvCell(leaseName(L)));
    const { head, rows } = scheduleCells(S);
    for (const r of [head, ...rows]) out.push(r.map(tsvCell).join('\t'));
    for (const n of S.notes) out.push(tsvCell(n));
    out.push('');
  }
  return out.join('\n').trim();
}

/* Invented fixtures for the T-12 reading tests (tests/t12-reading.test.js):
 * statements written the ways files come in (semicolons, tabs, decimal commas,
 * blank and unreadable cells, projections, pasted text). Every property, line
 * and figure is made up. */

export const MON6 = ['Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026'];
export const MON12 = ['Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026', 'Nov 2026', 'Dec 2026'];

/** Text from rows, fields joined by `delim` (a field with the delimiter, a quote or a newline is quoted). */
export const text = (rows, delim = ',', eol = '\n') => rows.map((r) => r.map((v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return s.includes(delim) || /["\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(delim)).join(eol);

/** Rows as the reader takes them: [{ r, cells }], row numbers from 1, empty rows left out. */
export const grid = (rows) => rows.map((cells, i) => ({ r: i + 1, cells })).filter((x) => x.cells.some((v) => v !== null && v !== undefined && String(v).trim() !== ''));

/** A small statement: heading row, income, expenses, NOI. `cell(label, i)` is what the line shows for month i. */
export function statementRows({ months = MON6, lines, total = true, head = null } = {}) {
  const rows = [];
  if (head) rows.push(...head);
  rows.push(['Account', ...months, ...(total ? ['Total'] : [])]);
  for (const [label, vals, tot] of lines) rows.push([label, ...vals, ...(total ? [tot === undefined ? null : tot] : [])]);
  return rows;
}

/** Six months, written the US way; Repairs holds a blank, a dash and an "n/a". */
export const SIX = [
  ['Income'],
  ['Base Rent', 1000, 1000, 1000, 1000, 1000, 1000, 6000],
  ['Operating Expenses'],
  ['Real Estate Taxes', 200, 200, 200, 200, 200, 200, 1200],
  ['Repairs', 400, '', 400, '-', 'n/a', 400, 1200],
];

/** The same lines as strings in a decimal-comma file (semicolons between fields). */
export const EU_SEMICOLON = text([
  ['Line', ...MON6, 'Total'],
  ['Base Rent', '1.234,56', '1.234,56', '1.234,56', '1.234,56', '1.234,56', '1.234,56', '7.407,36'],
  ['Taxes', 500, 500, 500, 500, 500, 500, '3.000'],
], ';');

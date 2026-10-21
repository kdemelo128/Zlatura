/* Invented fixtures for the T-12 reading tests (tests/t12-reading.test.js):
 * statements written the ways files come in (semicolons, tabs, decimal commas,
 * blank and unreadable cells, projections, pasted text). Every property, line
 * and figure is made up. */

import { sheetChoices, pickSheet, importStatement, layoutOf, numberFormatOf } from '../app/t12.js';

export const MON6 = ['Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026'];
export const MON12 = ['Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026', 'Nov 2026', 'Dec 2026'];

/** Text from rows, fields joined by `delim` (a field with the delimiter, a quote or a newline is quoted). */
export const text = (rows, delim = ',', eol = '\n') => rows.map((r) => r.map((v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return s.includes(delim) || /["\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(delim)).join(eol);

/** Rows as the reader takes them: [{ r, cells }], row numbers from 1, empty rows left out. */
export const grid = (rows) => rows.map((cells, i) => ({ r: i + 1, cells })).filter((x) => x.cells.some((v) => v !== null && v !== undefined && String(v).trim() !== ''));

/** A small statement: a heading row (Account, the months, Total), then `lines` as given: [label, ...a value for each month, total]. `head` rows go above it. */
export function statementRows({ months = MON6, lines, total = true, head = null } = {}) {
  const rows = [];
  if (head) rows.push(...head);
  rows.push(['Account', ...months, ...(total ? ['Total'] : [])]);
  rows.push(...lines);
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

/**
 * The statement a file's grids give, for tests that don't care which sheet: the one sheet that reads,
 * or (where several do) the one with the most lines. The app never chooses by size; it asks
 * (sheetChoices and pickSheet in t12.js), so this stands in for the broker's choice.
 */
export function statementOf(grids, opts = {}) {
  const choices = sheetChoices(grids, opts);
  const p = pickSheet(choices);
  if (p.refuse) throw new Error(p.refuse);
  const c = p.choice || p.ask.reduce((a, b) => (b.lines > a.lines ? b : a));
  const g = grids[c.i];
  const layout = layoutOf(g.rows, { sheet: g.sheet });
  return importStatement(g.rows, { ...opts, sheet: g.sheet, numberFormat: numberFormatOf(g.rows, layout).format || 'us' });
}

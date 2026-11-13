/* Entirely invented monthly operating statement; project PDF writer only. */
import { pdfOf } from './rr-fixtures.js';
export const MONTHS = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`);
export const VARYING = { 'Rental income': MONTHS.map((_, i) => `$${(10000 + i).toFixed(2)}`), 'Effective Gross Income': MONTHS.map((_, i) => `$${(10500 + i).toFixed(2)}`), 'Net Operating Income': MONTHS.map((_, i) => `$${(9250 + i).toFixed(2)}`) };
export const VARYING_TOTALS = { 'Rental income': '$120,066.00', 'Effective Gross Income': '$126,066.00', 'Net Operating Income': '$111,066.00' };
const LINES = [
  ['Rental income', '$10,000.00', '$120,000.00'], ['Other income', '$500.00', '$6,000.00'],
  ['Effective Gross Income', '$10,500.00', '$126,000.00'], ['Expenses', null, null],
  ['Real Estate Taxes', '$1,000.00', '$12,000.00'], ['Insurance', '$250.00', '$3,000.00'],
  ['Total Operating Expenses', '$1,250.00', '$15,000.00'], ['Net Operating Income', '$9,250.00', '$111,000.00'],
];
export function monthlyRows({ months = MONTHS, total = true, values = {}, totals = {} } = {}) {
  return LINES.map(([label, value, sum]) => [label, ...months.map((_, i) => Object.hasOwn(values, label) ? (Array.isArray(values[label]) ? values[label][i] : values[label]) : value), ...(total ? [Object.hasOwn(totals, label) ? totals[label] : sum] : [])]);
}
export function monthlyText({ title = 'Monthly Operating Statement - Actuals 2025', months = MONTHS, total = true, values = {}, totals = {} } = {}) {
  const row = (cells) => `  ${String(cells[0]).padEnd(34)}${cells.slice(1).map((v) => String(v ?? '').padStart(15)).join('')}`;
  return [`${title}\n\n${row(['Line', ...months, ...(total ? ['Total'] : [])])}\n\n${monthlyRows({ months, total, values, totals }).map(row).join('\n')}`];
}
export function monthlyPdf({ title = 'Monthly Operating Statement - Actuals 2025', months = MONTHS, total = true, values = {}, totals = {} } = {}) {
  const labels = [...months, ...(total ? ['Total'] : [])];
  const items = [{ s: title, x: 24, y: 750, size: 10, bold: true }, ...labels.map((s, i) => ({ s, x: 186 + i * 31, y: 718, size: 5, right: true }))];
  monthlyRows({ months, total, values, totals }).forEach((cells, i) => {
    items.push({ s: cells[0], x: 24, y: 690 - i * 20, size: 7 });
    cells.slice(1).forEach((v, j) => { if (v != null) items.push({ s: String(v), x: 186 + j * 31, y: 690 - i * 20, size: 5, right: true }); });
  });
  return pdfOf([items]);
}

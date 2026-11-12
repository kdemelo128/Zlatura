/* Invented full-year statement layouts; no brokerage files or proprietary formats. */
import { pdfOf } from './rr-fixtures.js';
const LINES = [
  ['Rental income', '$120,000'], ['Other income', '$6,000'], ['Effective Gross Income', '$126,000'], ['Expenses', null],
  ['Real Estate Taxes', '$12,000'], ['Insurance', '$3,000'], ['Total Operating Expenses', '$15,000'], ['Net Operating Income', '$111,000'],
];
export function statementText({ title = 'Annual Operating Statement - Year ended 2025', columns = ['Actual 2025'], values = {} } = {}) {
  const pad = (label, vals) => `  ${label.padEnd(34)}${vals.map((v) => String(v ?? '').padStart(16)).join('')}`;
  return [title + '\n\n' + ' '.repeat(36) + columns.map((h) => h.padStart(16)).join('') + '\n\n' + LINES.map(([label, value]) => pad(label, columns.map((_, i) => { const v = Object.hasOwn(values, label) ? values[label] : value; return Array.isArray(v) ? v[i] : v; }))).join('\n')];
}
export function statementPdf({ title = 'Annual Operating Statement - Year ended 2025', column = 'Actual 2025', values = {} } = {}) {
  return pdfOf([[{ s: title, x: 40, y: 750, bold: true }, { s: column, x: 420, y: 725, right: true }, ...LINES.flatMap(([s, original], i) => {
    const value = Object.hasOwn(values, s) ? values[s] : original;
    return [{ s, x: 40, y: 700 - i * 20 }, ...(value != null ? [{ s: value, x: 420, y: 700 - i * 20, right: true }] : [])];
  })]]);
}

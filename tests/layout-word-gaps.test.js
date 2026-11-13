import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutPage } from '../app/layout.js';
import { splitCells } from '../app/om.js';
const item = (str, x, size) => ({ str, width: str.length * size * 0.6, height: size, transform: [size, 0, 0, size, x, 700] });
test('larger label words remain one cell beside smaller financial figures', () => {
  const text = layoutPage([item('Rental', 24, 7), item('income', 53.4, 7), ...Array.from({ length: 12 }, (_, i) => item('$10,000.00', 156 + i * 31, 5))], 792);
  assert.equal(splitCells(text)[0].text, 'Rental income');
});
test('a true column gap is preserved despite mixed font sizes', () => {
  const text = layoutPage([item('Unit', 24, 9), item('Tenant', 80, 9), item('Annual Rent', 250, 9), ...Array.from({ length: 12 }, (_, i) => ({ ...item('$100.00', 40 + i * 35, 5), transform: [5, 0, 0, 5, 40 + i * 35, 680] }))], 792);
  assert.deepEqual(splitCells(text.split('\n')[0]).map((c) => c.text), ['Unit', 'Tenant', 'Annual Rent']);
});

test('a contiguous currency range split into PDF fragments is not two financial columns', async () => {
  const { statementTables } = await import('../app/omstatement.js');
  for (const trailing of [false, true]) {
    const geom = {};
    const rows = [['Effective Gross Income', '$100', '-$200'], ['Total Operating Expenses', '$20', '-$40'], ['Net Operating Income', '$80', '-$160']];
    const items = rows.flatMap(([label, from, rangeTo], i) => {
      const to = trailing ? rangeTo.slice(1) + '-' : rangeTo;
      const y = 680 - i * 20;
      const a = { ...item(from, 250, 7), transform: [7, 0, 0, 7, 250, y] };
      return [{ ...item(label, 24, 7), transform: [7, 0, 0, 7, 24, y] }, a, { ...item(to, 250 + a.width, 7), transform: [7, 0, 0, 7, 250 + a.width, y] }];
    });
    const text = layoutPage(items, 792, geom);
    assert.deepEqual(statementTables([text], { layouts: [geom], isStatementRow: () => true }), [], trailing ? 'a trailing sign is not a positive amount' : 'a range is not two columns');
  }
});
test('header cells in a larger font: a gap of two header characters stays a column gap, a single header space is one word', () => {
  const small = (i) => ({ ...item('$100.00', 40 + i * 35, 5), transform: [5, 0, 0, 5, 40 + i * 35, 680] });
  const row = (gap) => {
    const a = item('Unit', 24, 9); const x = 24 + a.width + gap;
    return layoutPage([a, item('Tenant', x, 9), ...Array.from({ length: 12 }, (_, i) => small(i))], 792).split('\n').find((l) => /Unit/.test(l));
  };
  assert.deepEqual(splitCells(row(2 * 9 * 0.6)).map((c) => c.text), ['Unit', 'Tenant'], 'two header characters apart: two cells');
  assert.deepEqual(splitCells(row(3 * 9 * 0.6)).map((c) => c.text), ['Unit', 'Tenant'], 'three header characters apart: two cells');
  assert.deepEqual(splitCells(row(9 * 0.6)).map((c) => c.text), ['Unit Tenant'], 'one header space: the same cell (a word space of that font)');
});

/* Storage pin for the T-12 to pro forma bridge (7.9): the OM's lines are read in memory and never saved on the deal.
 * `omReadRecord` keeps the same keys, a table is still a count of rows, and opening the bridge writes nothing to the
 * deal. A guard: it passes on 4.7.56 (which has no bridge) and must keep passing. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readOm } from '../app/om.js';
import { omReadRecord } from '../app/omstatement.js';
import { importStatement, normalise } from '../app/t12.js';
import { t12Rows, omPage, omUnmatchedRows } from './fixtures/bridge-fixtures.js';

test('the deal keeps the same omRead keys, a table is a row count, and the bridge writes nothing to the deal', async () => {
  const om = readOm([omPage(omUnmatchedRows())], { asOf: '2026-10-14' });
  const f = om.fields.noi_pf;
  const deal = { figures: { noi_pf: f.value }, sources: { noi_pf: { table: f.table, col: f.col, cell: f.cell, orig: f.value } } };
  const { omRead } = omReadRecord(om, { figures: deal.figures, sources: deal.sources, file: 'invented.pdf', at: 1 });
  assert.deepEqual(Object.keys(omRead), ['v', 'at', 'file', 'tables', 'checks', 'blocked', 'held', 'applied', 'seen']);
  assert.deepEqual(Object.keys(omRead.tables[0]), ['id', 'page', 'title', 'scale', 'scaleText', 'lines', 'rows', 'columns', 'inplace', 'pf']);
  assert.equal(typeof omRead.tables[0].rows, 'number');
  deal.omRead = omRead;
  const before = JSON.stringify(deal);
  assert.ok(!/Tenant Sundry/.test(before), 'no OM line is kept on the deal');
  // opening the bridge (once the module exists): the deal and the T-12 are as they were
  const mod = await import('../app/bridge.js').catch(() => null);
  if (mod) {
    const t = importStatement(t12Rows(), { file: 'invented.csv', sheet: 'CSV' });
    const tBefore = JSON.stringify(t);
    const b = mod.pfBridge(t, normalise(t), mod.pfColumn(om.statement.columns, deal).col, deal);
    assert.equal(b.held, false);
    assert.equal(JSON.stringify(deal), before);
    assert.equal(JSON.stringify(t), tBefore);
  }
});

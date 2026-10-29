import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compsCsv, fullAddress } from '../app/exporters.js';
import { loadComps } from '../app/costar.js';
import { zoningLookup } from '../app/zoning.js';
import * as F from './fixtures.js';

/** A minimal RFC 4180 reader, to check the writer against. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(cell); rows.push(row); row = []; cell = ''; i++;
    } else cell += ch;
  }
  return rows;
}

const comp = (over) => ({
  kind: 'sale', name: '1 Test St NW', address: '1 Test St NW', city: 'Washington', state: 'DC', zip: 20007,
  price: 1000000, bsf: 2000, date: new Date(Date.UTC(2025, 1, 20)), flags: [], ...over,
});

test('csv: one header row and one row per comp, every row the same width', () => {
  const { sales, market } = loadComps([{ name: 'f.pdf', pages: [F.classicSale, F.activeListing, F.saleWithParties] }],
    { zoningCodes: zoningLookup });
  const rows = parseCsv(compsCsv(sales, market));
  assert.equal(rows.length, 1 + sales.length + market.length);
  const width = rows[0].length;
  for (const r of rows) assert.equal(r.length, width);
  const h = rows[0];
  const bakery = rows.find((r) => r[h.indexOf('Property')] === '77 Example Pl NW');
  assert.equal(bakery[h.indexOf('True Buyer')], 'Example Bakery Co');
  assert.equal(bakery[h.indexOf('Sale Type')], 'Owner User');
  assert.equal(bakery[h.indexOf('Price per SF')], '800');
  assert.equal(bakery[h.indexOf('Sale Date')], '2025-03-14');
});

test('csv: commas, quotes and line breaks survive a round trip', () => {
  const name = 'Smith, Jones & "Co"\nAnnex';
  const rows = parseCsv(compsCsv([comp({ name })], []));
  assert.equal(rows[1][rows[0].indexOf('Property')], name);
});

test('csv: text that a spreadsheet would run as a formula is neutralized', () => {
  for (const bad of ['=HYPERLINK("x")', '+1+1', '-2', '@SUM(A1)']) {
    const rows = parseCsv(compsCsv([comp({ name: bad })], []));
    const v = rows[1][rows[0].indexOf('Property')];
    assert.equal(v, `'${bad}`, bad);
  }
  // a number stays a number, even a negative one
  const rows = parseCsv(compsCsv([comp({ cap: -1.5 })], []));
  assert.equal(rows[1][rows[0].indexOf('Cap Rate %')], '-1.5');
});

test('csv: the full address is one line a map can geocode, with a 5-digit ZIP', () => {
  assert.equal(fullAddress(comp({ zip: 2001 })), '1 Test St NW, Washington, DC 02001');
  assert.equal(fullAddress(comp({ city: null, state: null, zip: null })), '1 Test St NW');
});

/* --------------------------------------------------------------- fees CSV */

import { feesCsv } from '../app/exporters.js';

const feeDeal = (id, name, fee, extra = {}) => ({ id, name, stage: 'closed', figures: { address: '100 Example Way, Sampleton' }, fee, ...extra });

test('fees csv: one row per deal with a fee record, deals with none left out, money to 2 decimals', () => {
  const csv = feesCsv([
    feeDeal('d1', 'Invented Plaza', { price: 6450000, flatPct: 3, coBrokerPct: 50, referralPct: 0, housePct: 40, invoiced: { amount: 193500, on: '2026-03-01', ref: 'INV-1' }, paid: [{ amount: 100000, on: '2026-04-01', ref: '' }, { amount: 50000.5, on: '2026-05-02', ref: '' }] }),
    feeDeal('d2', 'No fee here', undefined),
    feeDeal('d3', 'Empty record', { price: null, flatPct: null, tiers: [], coBrokerPct: null, referralPct: null, housePct: null, invoiced: null, paid: [] }),
  ]);
  const rows = parseCsv(csv);
  assert.equal(csv.endsWith('\r\n'), true);
  assert.deepEqual(rows[0], ['Deal ID', 'Deal', 'Stage', 'Address', 'Fee price', 'Rate %', 'Gross fee', 'Co-broker', 'Our side', 'Referral', 'House', 'Agent', 'Invoiced', 'Invoice date', 'Invoice ref', 'Paid to date', 'Last payment', 'Outstanding']);
  assert.equal(rows.length, 3, 'a header and the two deals that have a record');
  assert.deepEqual(rows[1], ['d1', 'Invented Plaza', 'Closed', '100 Example Way, Sampleton', '6450000.00', '3', '193500.00', '96750.00', '96750.00', '0.00', '38700.00', '58050.00', '193500.00', '2026-03-01', 'INV-1', '150000.50', '2026-05-02', '43499.50']);
  // a record with nothing entered is blank everywhere it has no answer, never 0 (a paid list that is empty is a real 0 payments)
  assert.deepEqual(rows[2].slice(4), ['', '', '', '', '', '', '', '', '', '', '', '0.00', '', '']);
});

test('fees csv: a deal or reference a spreadsheet would read as a formula is guarded, and an overpayment keeps its minus sign', () => {
  const evil = "=cmd|' /C calc'!A0";
  const rows = parseCsv(feesCsv([feeDeal('=1+1', evil, { price: 1e6, flatPct: 1, invoiced: { amount: 100, on: '2026-01-01', ref: '@SUM(A1)' }, paid: [{ amount: 150, on: '2026-01-02', ref: '' }] }, { figures: { address: '+1 Main St' } })]));
  assert.equal(rows[1][0], "'=1+1");
  assert.equal(rows[1][1], `'${evil}`);
  assert.equal(rows[1][3], "'+1 Main St");
  assert.equal(rows[1][14], "'@SUM(A1)");
  assert.equal(rows[1][17], '-50.00', 'a number, not text: no quote in front of the minus');
});

test('fees csv: a fee record in an unknown shape is written blank, without an error', () => {
  const rows = parseCsv(feesCsv([feeDeal('d1', 'Odd', { price: 'x', paid: 'x', tiers: 'x', invoiced: 'x' }), feeDeal('d2', 'Array', []), feeDeal('d3', 'String', 'x'), null]));
  assert.equal(rows.length, 2, 'only the object counts as a record');
  assert.deepEqual(rows[1].slice(4), ['', '', '', '', '', '', '', '', '', '', '', '', '', '']);
});

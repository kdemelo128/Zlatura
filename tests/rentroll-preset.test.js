/* presetFor: one clear kind gets its columns; blank, unknown or ambiguous text gets the neutral Retail set. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presetFor } from '../app/rentroll.js';

const ROWS = [
  ['Office', 'Office'], ['Multi-tenant office', 'Office'], ['Multi-tenant retail', 'Retail'],
  ['Multi-tenant industrial', 'Industrial'], ['Multifamily', 'Multifamily'], ['Multi-family', 'Multifamily'],
  ['Multi family', 'Multifamily'], ['Apartments', 'Multifamily'], ['Data center', 'Retail'], ['Data center office', 'Office'], ['Call center', 'Retail'],
  ['Shopping center', 'Retail'], ['Strip center', 'Retail'], ['Retail', 'Retail'], ['NNN', 'Retail'],
  ['Net lease', 'Retail'], ['Mixed use', 'Mixed use'], ['Medical office', 'Office'], ['Warehouse', 'Industrial'],
  ['Office/Retail', 'Retail'], ['Multifamily and office', 'Retail'], ['Multi-tenant', 'Retail'],
  ['', 'Retail'], [null, 'Retail'], [undefined, 'Retail'], [42, 'Retail'], [{}, 'Retail'],
  ['constructor', 'Retail'], ['__proto__', 'Retail'], ['toString', 'Retail'],
  ['Büro Zentrum 办公楼 🏢', 'Retail'], ['x'.repeat(100000), 'Retail'], ['office' + ' '.repeat(50000), 'Office'],
];
for (const [input, want] of ROWS) {
  test(`presetFor(${JSON.stringify(input)?.slice(0, 30)}) is ${want}`, () => assert.equal(presetFor(input), want));
}

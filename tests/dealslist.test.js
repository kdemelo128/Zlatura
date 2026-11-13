/* Invented saved deals: view filtering never edits stored records or derives financial figures. */
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window ||= {};
const { filterDeals } = await import('../app/dealslist.js');

test('search covers saved deals beyond the first display page', () => {
  const deals = Array.from({ length: 35 }, (_, i) => ({ id: `d${i}`, name: `Invented property ${i}`, figures: { address: i === 34 ? '91 Fictional Lane' : 'Other invented address' }, updatedAt: 1000 - i }));
  assert.deepEqual(filterDeals(deals, { query: '91 Fictional' }).map((d) => d.id), ['d34']);
});

test('search combines words across name, address, city and property type without case or accent differences', () => {
  const d = { id: 'one', name: 'Élan Court', figures: { address: '21 Fictional Street', city: 'Exampleville', state: 'MD', ptype: 'Retail' } };
  assert.deepEqual(filterDeals([d], { query: 'ELAN retail exampleville' }), [d]);
  assert.deepEqual(filterDeals([d], { query: 'MD fictional' }), [d]);
  assert.deepEqual(filterDeals([d], { query: 'elan office' }), []);
});

test('stage filtering and view ordering preserve every stored value and array order', () => {
  const deals = [
    { id: 'two', name: 'Invented 2', stage: 'listing', updatedAt: 10, figures: { price: null, cap: 0, bsf: 1200 } },
    { id: 'ten', name: 'Invented 10', stage: 'listing', updatedAt: 30, figures: { price: 3450000, cap: null, bsf: null } },
    { id: 'closed', name: 'Closed fictional deal', stage: 'closed', updatedAt: 40, confidential: true, figures: {} },
  ];
  const before = structuredClone(deals);
  deals.forEach((d) => { Object.freeze(d.figures); Object.freeze(d); }); Object.freeze(deals);
  assert.deepEqual(filterDeals(deals, { stage: 'listing' }).map((d) => d.id), ['ten', 'two']);
  assert.deepEqual(filterDeals(deals, { stage: 'listing', sort: 'name' }).map((d) => d.id), ['two', 'ten']);
  assert.deepEqual(filterDeals(deals, { stage: 'closed' }).map((d) => d.id), ['closed']);
  assert.deepEqual(deals, before);
});

test('old deals with missing names, figures or stages remain findable', () => {
  const deals = [{ id: 'untitled' }, { id: 'address', figures: { address: '31 Imaginary Road' } }];
  assert.deepEqual(filterDeals(deals, { query: 'untitled', stage: 'underwriting' }).map((d) => d.id), ['untitled']);
  assert.deepEqual(filterDeals(deals, { query: 'imaginary' }).map((d) => d.id), ['address']);
});

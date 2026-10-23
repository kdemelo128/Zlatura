import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};  // kit.js reads window at load
const { analyze } = await import('../app/deal.js');
const { money0, money2, pct } = await import('../app/kit.js');
const { listingBlocks, listingFile, countChars, LIMITS } = await import('../app/listingcopy.js');

// an invented building: every figure here is made up
const full = {
  address: '12 Sample Street', city: 'Exampleton', state: 'ZZ', zip: '99999', ptype: 'Retail', bsf: 12000, lot_sf: 43560, units: 3,
  year: 1998, renovated: 2015, zoning: 'MU-4', parking: '24 surface spaces', price: 3000000, noi: 210000, occ: 92.5,
  tenant: 'Invented Tenant LLC', lease_type: 'NNN', term_left: '6 years',
};
const make = (figures) => ({ deal: { figures }, m: analyze(figures) });
const by = (blocks, key) => blocks.find((b) => b.key === key);

test('a full deal gets all five blocks, each with its count and limit', () => {
  const { deal, m } = make(full);
  const blocks = listingBlocks(deal, m);
  assert.deepEqual(blocks.map((b) => b.key), ['headline', 'short', 'long', 'highlights', 'facts']);
  for (const b of blocks) {
    assert.equal(b.count, [...b.text].length, `${b.key}: the count is the text's characters`);
    assert.equal(b.limit, LIMITS[b.key]);
    assert.equal(b.over, b.count > b.limit);
  }
  assert.equal(by(blocks, 'headline').text, 'Retail, 12,000 SF in Exampleton, ZZ · $3,000,000');
  assert.equal(by(blocks, 'headline').count, 48);
});

test('every figure is written with the kit formatters', () => {
  const { deal, m } = make(full);
  const all = listingBlocks(deal, m).map((b) => b.text).join('\n');
  assert.ok(all.includes(money0(3000000)));
  assert.ok(all.includes(money2(250)), 'price per SF with cents');
  assert.ok(all.includes(pct(7)), 'cap rate is NOI over price: 7.00%');
  assert.ok(all.includes(money0(210000)));
  assert.ok(all.includes(pct(92.5, 1)));
  const facts = by(listingBlocks(deal, m), 'facts').text;
  assert.deepEqual(facts.split('\n'), [
    'Property type: Retail', 'Address: 12 Sample Street, Exampleton, ZZ 99999', 'Asking price: $3,000,000', 'Price per SF: $250.00',
    'Building size: 12,000 SF', 'Land: 43,560 SF (1.00 acres)', 'Units: 3', 'Cap rate: 7.00%', 'Net operating income: $210,000',
    'Occupancy: 92.5%', 'Year built: 1998', 'Zoning: MU-4', 'Parking: 24 surface spaces',
  ]);
});

test('a missing figure is left out, never 0, N/A or a dash', () => {
  const { deal, m } = make({ address: '5 Plain Road', city: 'Exampleton', state: 'ZZ', bsf: 8000 });
  const blocks = listingBlocks(deal, m);
  const all = blocks.map((b) => b.text).join('\n');
  assert.doesNotMatch(all, /\$|%|cap rate|NOI|occupied|built|zoned|parking|N\/A|—|\b0\b|null|undefined|NaN/i);
  assert.equal(by(blocks, 'headline').text, '8,000 SF in Exampleton, ZZ');
  assert.equal(by(blocks, 'facts').text, 'Address: 5 Plain Road, Exampleton, ZZ\nBuilding size: 8,000 SF');
});

test('a zero or blank is a missing figure, not a figure', () => {
  const { deal, m } = make({ address: '5 Plain Road', city: 'Exampleton', bsf: 0, units: 0, year: undefined, occ: null, zoning: '  ', parking: '' });
  const all = listingBlocks(deal, m).map((b) => b.text).join('\n');
  assert.doesNotMatch(all, /\b0\b|SF|unit|occupied|Zoning|Parking/);
});

test('a deal with nothing to say has no blocks', () => {
  const { deal, m } = make({});
  assert.deepEqual(listingBlocks(deal, m), []);
});

test('a price worked out from NOI and cap rate is not written as the asking price', () => {
  const { deal, m } = make({ ptype: 'Retail', bsf: 10000, noi: 300000, cap: 6 });
  assert.ok(m.derived.price);
  const all = listingBlocks(deal, m).map((b) => b.text).join('\n');
  assert.doesNotMatch(all, /5,000,000|Asking|\/SF/);
  assert.match(all, /Cap rate: 6\.00%/);
});

test('a NOI worked out from price and cap rate says so', () => {
  const { deal, m } = make({ price: 5e6, cap: 6, bsf: 10000 });
  assert.ok(m.derived.noi);
  const facts = by(listingBlocks(deal, m), 'facts').text;
  assert.match(facts, /Net operating income: \$300,000 \(calculated from the price and cap rate\)/);
});

test('the tenant is never named, and the words make no claims', () => {
  const { deal, m } = make(full);
  const all = listingBlocks(deal, m).map((b) => b.text).join('\n');
  assert.ok(!all.includes('Invented Tenant'), 'a public listing does not name the tenant');
  assert.doesNotMatch(all, /\b(prime|best|excellent|rare|unique|great|premier|ideal|stable|strong|turnkey|trophy|exceptional|high-quality|upside|opportunity)\b/i);
  assert.match(all, /Lease type: NNN/);
});

test('a block over its limit says so, and the limits can be set per marketplace', () => {
  const { deal, m } = make(full);
  const tight = listingBlocks(deal, m, { headline: 20, short: 30 });
  assert.equal(by(tight, 'headline').limit, 20);
  assert.equal(by(tight, 'headline').over, true);
  assert.equal(by(tight, 'short').over, true);
  assert.equal(by(tight, 'long').limit, LIMITS.long, 'a limit not given keeps its default');
  const exact = listingBlocks(deal, m, { headline: 48 });
  assert.equal(by(exact, 'headline').over, false, 'at the limit is not over it');
  assert.equal(by(listingBlocks(deal, m, { headline: 47 }), 'headline').over, true);
});

test('characters are counted as a person sees them', () => {
  assert.equal(countChars('abc\nd'), 5);
  assert.equal(countChars('é😀'), 2);
});

test('the .txt holds every block under its label and count', () => {
  const { deal, m } = make(full);
  const blocks = listingBlocks(deal, m);
  const file = listingFile(blocks);
  assert.ok(file.startsWith(`HEADLINE (48 of ${LIMITS.headline} characters)\nRetail, 12,000 SF`));
  for (const b of blocks) assert.ok(file.includes(`${b.label.toUpperCase()} (${b.count} of ${b.limit} characters)\n${b.text}`));
});

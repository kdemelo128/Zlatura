// maplinks.test.js -- the "Open in" URLs: encoded, built in one place, and no pasted value can change the host.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openInLinks, GOOGLE_MAPS, APPLE_MAPS, STREET_VIEW, GOOGLE_SEARCH } from '../app/maplinks.js';

const by = (ls, id) => ls.find((l) => l.id === id);

test('an address gives the map links and a search, each URL in the documented form', () => {
  const ls = openInLinks({ address: '100 Example St, Sampletown, MD 20910' });
  assert.equal(by(ls, 'google-maps').url, 'https://www.google.com/maps/search/?api=1&query=100%20Example%20St%2C%20Sampletown%2C%20MD%2020910');
  assert.equal(by(ls, 'apple-maps').url, 'https://maps.apple.com/?q=100%20Example%20St%2C%20Sampletown%2C%20MD%2020910');
  assert.equal(by(ls, 'search-address').url, 'https://www.google.com/search?q=100%20Example%20St%2C%20Sampletown%2C%20MD%2020910');
  assert.equal(by(ls, 'search-owner'), undefined, 'no owner given, no owner link');
});

test('Street View opens at the coordinates when they are known, and at the map search when they are not', () => {
  const at = by(openInLinks({ address: '1 A St', lat: 38.9, lng: -77.04 }), 'street-view').url;
  assert.equal(at, 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=38.9%2C-77.04');
  assert.equal(by(openInLinks({ address: '1 A St' }), 'street-view').url, GOOGLE_MAPS('1 A St'));
  // coordinates out of range or not numbers are not used
  assert.equal(by(openInLinks({ address: '1 A St', lat: 138, lng: 0 }), 'street-view').url, GOOGLE_MAPS('1 A St'));
  assert.equal(by(openInLinks({ address: '1 A St', lat: NaN, lng: 0 }), 'street-view').url, GOOGLE_MAPS('1 A St'));
  assert.equal(STREET_VIEW(1, 2), 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=1%2C2');
});

test('the name and the owner get their own searches; a name equal to the address is not offered twice', () => {
  const ls = openInLinks({ address: '1 A St', name: 'Example Plaza', owner: 'Example Holdings LLC' });
  assert.equal(by(ls, 'search-name').url, GOOGLE_SEARCH('Example Plaza'));
  assert.equal(by(ls, 'search-owner').url, GOOGLE_SEARCH('Example Holdings LLC'));
  assert.equal(by(openInLinks({ address: '1 A St', name: '1 A St' }), 'search-name'), undefined);
  // a name alone still opens the maps and a search
  const n = openInLinks({ name: 'Example Plaza' });
  assert.deepEqual(n.map((l) => l.id), ['google-maps', 'apple-maps', 'street-view', 'search-name']);
});

test('nothing to look for gives no links', () => {
  assert.deepEqual(openInLinks({}), []);
  assert.deepEqual(openInLinks({ address: '   ', name: null, owner: undefined }), []);
  assert.deepEqual(openInLinks(), []);
});

test('hostile text is encoded: it cannot add a parameter, a host or a scheme', () => {
  const evil = 'x&query=evil#frag?a=b\n//attacker.example/ javascript:alert(1)';
  for (const l of openInLinks({ address: evil, name: evil, owner: evil })) {
    const u = new URL(l.url);
    assert.ok(['www.google.com', 'maps.apple.com'].includes(u.hostname), l.url);
    assert.equal(u.protocol, 'https:');
    assert.equal(u.hash, '', 'no fragment smuggled in');
    assert.ok(!/[\n\r]/.test(l.url));
    if (u.hostname === 'maps.apple.com' || u.pathname === '/search') {
      assert.deepEqual([...u.searchParams.keys()].filter((k) => k !== 'api' && k !== 'q' && k !== 'query'), [], l.url);
    }
  }
  assert.equal(new URL(APPLE_MAPS(evil)).searchParams.getAll('q').length, 1);
});

test('very long text is cut', () => {
  const l = by(openInLinks({ address: 'a'.repeat(5000) }), 'google-maps');
  assert.ok(l.url.length < 400);
});

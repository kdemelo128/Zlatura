// publicdata.test.js -- the public-data fetch wrapper and every adapter, on RECORDED responses (tests/fixtures/publicdata/).
// No test reaches the network. Each sanity check gets a value it must reject.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as pd from '../app/publicdata.js';
import { lookupProperty, sourceFor, SOURCES, houseNumber } from '../app/publiclookup.js';

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/publicdata/${n}.json`, import.meta.url), 'utf8'));
/** A `get` that answers the first route whose text is in the url; records every url. */
const router = (routes) => {
  const seen = [];
  const get = async (url) => {
    seen.push(url);
    for (const [part, body] of routes) if (url.includes(part)) { const v = typeof body === 'function' ? body(url) : body; if (v instanceof Error) throw v; return structuredClone(v); }
    throw new Error(`no recorded answer for ${url}`);
  };
  get.seen = seen;
  return get;
};
const reply = (body, { status = 200, type = 'application/json', headers = {} } = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type, ...headers } });
const rejects = (p, code) => assert.rejects(p, (e) => e instanceof pd.PublicDataError && (!code || e.code === code));

/* ------------------------------------------------------------ the wrapper */

test('an unlisted host fails before any request is made', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return reply({}); };
  for (const url of ['https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=x', 'https://evil.example/x', 'https://geo.fcc.gov.evil.example/x', 'https://evil.example/@geo.fcc.gov/', 'http://geo.fcc.gov/api', 'https://user:pw@geo.fcc.gov/api', 'https://geo.fcc.gov:8443/api', 'javascript:alert(1)', 'not a url']) {
    await rejects(pd.getJson(url, { fetchImpl }), 'host');
  }
  assert.equal(calls, 0);
});

test('a listed host is fetched with no cookies, no referrer and no redirects', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return reply({ ok: 1 }); };
  assert.deepEqual(await pd.getJson('https://geo.fcc.gov/api/census/block/find?latitude=1&longitude=2', { fetchImpl }), { ok: 1 });
  assert.equal(seen.init.credentials, 'omit');
  assert.equal(seen.init.referrerPolicy, 'no-referrer');
  assert.equal(seen.init.redirect, 'error');
  assert.equal(seen.init.method, 'GET');
  for (const h of pd.HOSTS) assert.ok(!h.includes('geocoding.geo.census.gov'));
});

test('the wrapper accepts only JSON, within the size cap, and in time; errors say what happened', async () => {
  const U = 'https://geo.fcc.gov/x';
  await rejects(pd.getJson(U, { fetchImpl: async () => reply('<html>', { type: 'text/html' }) }), 'type');
  await rejects(pd.getJson(U, { fetchImpl: async () => reply('{"a":1}', { status: 500 }) }), 'http');
  await rejects(pd.getJson(U, { fetchImpl: async () => reply('{ not json', {}) }), 'json');
  await rejects(pd.getJson(U, { fetchImpl: async () => reply(JSON.stringify({ a: 'x'.repeat(5000) })), maxBytes: 1000 }), 'size');
  await rejects(pd.getJson(U, { fetchImpl: async () => reply('{}', { headers: { 'content-length': '999999999' } }) }), 'size');
  await rejects(pd.getJson(U, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), 'network');
  await rejects(pd.getJson(U, { timeoutMs: 20, fetchImpl: (u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))) }), 'timeout');
});

/* ------------------------------------------------------------ geocoding and geography */

test('Nominatim: a place, an empty answer, and a coordinate that is not a place', async () => {
  const r = await pd.geocodeNominatim('1801 F Street NW, Washington, DC', router([['nominatim', fx('nominatim-dc')]]));
  assert.ok(Math.abs(r.lat - 38.8975585) < 1e-6 && Math.abs(r.lon + 77.0419692) < 1e-6);
  assert.equal(r.attribution, '© OpenStreetMap contributors');
  assert.equal(await pd.geocodeNominatim('nowhere', router([['nominatim', []]])), null);
  await rejects(pd.geocodeNominatim('x', router([['nominatim', [{ lat: '138', lon: '-77' }]]])), 'bad-value');
  await rejects(pd.geocodeNominatim('x', router([['nominatim', [{ lat: '51.5', lon: '-0.12' }]]])), 'bad-value');   // not in the US
  await rejects(pd.geocodeNominatim('x', router([['nominatim', { error: 'x' }]])), 'json');
});

test('Nominatim is asked at most once a second', async () => {
  const times = [];
  const get = async () => { times.push(Date.now()); return fx('nominatim-dc'); };
  await pd.geocodeNominatim('a', get); await pd.geocodeNominatim('b', get);
  assert.ok(times[1] - times[0] >= 1000, `gap ${times[1] - times[0]} ms`);
});

test('DC Master Address Repository: a District point; a low score or a point outside the District is refused', async () => {
  const r = await pd.geocodeDc('1801 F Street NW', router([['DCGIS_MAR', fx('dc-mar')]]));
  assert.ok(Math.abs(r.lat - 38.897566729646) < 1e-9);
  const m = fx('dc-mar');
  m.candidates[0].score = 40;
  assert.equal(await pd.geocodeDc('x', router([['DCGIS_MAR', m]])), null);
  const far = fx('dc-mar'); far.candidates[0].location = { x: -122.4, y: 37.7 };
  await rejects(pd.geocodeDc('x', router([['DCGIS_MAR', far]])), 'bad-value');
});

test('FCC block: tract and county codes; codes that do not fit together are refused', async () => {
  const g = await pd.fccBlock(38.8975, -77.0419, router([['geo.fcc.gov', fx('fcc-dc')]]));
  assert.deepEqual(g, { stateFips: '11', countyFips: '11001', tractFips: '11001010800', countyName: 'District of Columbia', stateCode: 'DC' });
  const badFips = fx('fcc-dc'); badFips.Block.FIPS = '24031010800123';
  await rejects(pd.fccBlock(38.9, -77, router([['geo.fcc.gov', badFips]])), 'bad-value');
  const mismatch = fx('fcc-dc'); mismatch.County.FIPS = '24031';
  await rejects(pd.fccBlock(38.9, -77, router([['geo.fcc.gov', mismatch]])), 'bad-value');
  await rejects(pd.fccBlock(138, -77, router([])), 'bad-value');
  await rejects(pd.fccBlock(38.9, -77, router([['geo.fcc.gov', { status: 'error' }]])), 'json');
});

/* ------------------------------------------------------------ flood */

test('FEMA: the zone, its flood-hazard flag and the effective date of the matching map panel', async () => {
  const get = router([['/MapServer/28/', fx('fema-zone')], ['/MapServer/3/', fx('fema-panel')]]);
  const f = await pd.femaFlood(38.8975, -77.0419, get);
  assert.deepEqual(f, { covered: true, zone: 'X', subtype: 'area of minimal flood hazard', sfha: false, bfe: null, effective: '2010-09-27', panel: '110001' });
  assert.ok(get.seen.every((u) => u.startsWith('https://hazards.fema.gov/')));
});

test('FEMA: no map is "not covered", never a zone; a made-up zone code is refused; a missing panel date is said, not invented', async () => {
  const none = await pd.femaFlood(30, -40, router([['/MapServer/28/', fx('fema-none')]]));
  assert.deepEqual(none, { covered: false });
  const z = fx('fema-zone'); z.features[0].attributes.FLD_ZONE = 'ZZ9';
  await rejects(pd.femaFlood(38.9, -77, router([['/MapServer/28/', z], ['/MapServer/3/', fx('fema-panel')]])), 'bad-value');
  const blank = fx('fema-zone'); blank.features[0].attributes.FLD_ZONE = '';
  await rejects(pd.femaFlood(38.9, -77, router([['/MapServer/28/', blank]])), 'bad-value');
  const f = await pd.femaFlood(38.9, -77, router([['/MapServer/28/', fx('fema-zone')], ['/MapServer/3/', { features: [] }]]));
  assert.equal(f.effective, null);
  await rejects(pd.femaFlood(38.9, -77, router([['/MapServer/28/', { error: { code: 400 } }]])), 'http');
});

/* ------------------------------------------------------------ parcels, zoning, permits */

test('DC parcel: assessed value and land area; zero is "no record", not a value; absurd numbers are refused', async () => {
  const p = await pd.dcParcel(38.8975, -77.0419, router([['MapServer/40/', fx('dc-parcel')]]));
  assert.equal(p.assessed, 9275220);
  assert.equal(p.landSf, 13518);
  assert.equal(p.asOf, '2026-08-24');
  assert.equal(p.lastSale, null, 'a sale price of 0 is not a sale');
  assert.equal(p.owner, 'EXAMPLE HOLDINGS LLC');
  const zero = fx('dc-parcel'); zero.features[0].attributes.ASSESSMENT = 0; zero.features[0].attributes.LANDAREA = 0;
  const z = await pd.dcParcel(38.8975, -77.0419, router([['MapServer/40/', zero]]));
  assert.equal(z.assessed, null); assert.equal(z.landSf, null);
  const huge = fx('dc-parcel'); huge.features[0].attributes.ASSESSMENT = 9e12;
  await rejects(pd.dcParcel(38.9, -77, router([['MapServer/40/', huge]])), 'bad-value');
  const neg = fx('dc-parcel'); neg.features[0].attributes.LANDAREA = -5;
  await rejects(pd.dcParcel(38.9, -77, router([['MapServer/40/', neg]])), 'bad-value');
  assert.equal(await pd.dcParcel(38.9, -77, router([['MapServer/40/', { features: [] }]])), null);
});

test('DC zoning: one zone is returned; several are left for the broker; a label with markup is refused', async () => {
  assert.deepEqual(await pd.dcZoning(38.8975, -77.0419, router([['MapServer/9/', fx('dc-zoning')]])), { zoning: 'C-3-C', status: 'Final' });
  const split = fx('dc-zoning'); split.features.push({ attributes: { Zoning_Label: 'MU-4', Zoning: 'MU-4', Zoning_Status: 'Final' } });
  assert.deepEqual(await pd.dcZoning(38.9, -77, router([['MapServer/9/', split]])), { zoning: null, split: ['C-3-C', 'MU-4'] });
  const evil = fx('dc-zoning'); evil.features[0].attributes.Zoning_Label = '<img src=x onerror=1>';
  await rejects(pd.dcZoning(38.9, -77, router([['MapServer/9/', evil]])), 'bad-value');
});

test('SDAT: the record whose street number is the address; acres become square feet; "0000" is no year; none or many are not guessed', async () => {
  const get = router([['opendata.maryland.gov', fx('sdat-moco')]]);
  const r = await pd.sdatParcelAt(38.9907, -77.0261, '8113', get);
  const p = r.parcel;
  assert.equal(p.address, '8113 GEORGIA AVE');
  assert.equal(p.yearBuilt, 1964);
  assert.equal(p.assessed, 1660600);
  assert.equal(p.assessedYear, 2025);
  assert.equal(p.landSf, 7100, 'the county wrote 7,100 in square feet (unit S)');
  assert.match(get.seen[0], /within_circle/);
  assert.ok(get.seen[0].startsWith('https://opendata.maryland.gov/'));
  assert.ok(!/owner|grantor/i.test(get.seen[0]), 'no owner or grantor name is asked for');
  const several = await pd.sdatParcelAt(38.9907, -77.0261, '9999', get);
  assert.ok(Array.isArray(several.several) && several.several.length >= 3 && !several.parcel);
  assert.equal(await pd.sdatParcelAt(38.9, -77, '1', router([['opendata.maryland.gov', []]])), null);
  const rows = fx('sdat-moco'); const row = rows.find((x) => x.mdp_street_address_mdp_field_address === '8113 GEORGIA AVE');
  row.c_a_m_a_system_data_year_built_yyyy_mdp_field_yearblt_sdat_field_235 = '0000';
  row.c_a_m_a_system_data_land_unit_of_measure_mdp_field_luom_sdat_field_243 = 'A'; row.c_a_m_a_system_data_land_area_mdp_field_landarea_sdat_field_242 = '0.5';
  assert.equal((await pd.sdatParcelAt(38.9907, -77.0261, '8113', router([['opendata.maryland.gov', rows]]))).parcel.landSf, 21780, 'half an acre is 21,780 SF');
  row.c_a_m_a_system_data_land_unit_of_measure_mdp_field_luom_sdat_field_243 = 'Q';
  const q2 = (await pd.sdatParcelAt(38.9907, -77.0261, '8113', router([['opendata.maryland.gov', rows]]))).parcel;
  assert.equal(q2.yearBuilt, null, 'year 0000 is no year');
  assert.equal(q2.landSf, null, 'an unknown land unit is not guessed');
  row.current_assessment_year_total_assessment_sdat_field_172 = '-5';
  await rejects(pd.sdatParcelAt(38.9907, -77.0261, '8113', router([['opendata.maryland.gov', rows]])), 'bad-value');
  row.current_assessment_year_total_assessment_sdat_field_172 = '0';
  assert.equal((await pd.sdatParcelAt(38.9907, -77.0261, '8113', router([['opendata.maryland.gov', rows]]))).parcel.assessed, null, 'a zero assessment is no assessment');
});

test('permits: DC by lot, Montgomery by street number; a lot or number that is not plain is never put in a query', async () => {
  const dc = await pd.dcPermits('0142    0024', router([['FEEDS/DCRA', fx('dc-permits')]]));
  assert.ok(dc.length >= 1 && dc[0].id === 'B2504726' && dc[0].issued === '2025-05-16');
  const get = router([['FEEDS/DCRA', fx('dc-permits')]]);
  assert.deepEqual(await pd.dcPermits("0142' OR 1=1 --", get), []);
  assert.equal(get.seen.length, 0);
  const mo = await pd.mocoPermits(38.9907, -77.0261, '8113', router([['data.montgomerycountymd.gov', fx('moco-permits')]]));
  assert.equal(mo[0].id, '873796');
  assert.ok(!mo[0].work.includes('&nbsp;'));
  const g2 = router([['data.montgomerycountymd.gov', []]]);
  assert.deepEqual(await pd.mocoPermits(38.9, -77, "8113' OR '1'='1", g2), []);
  assert.equal(g2.seen.length, 0);
});

/* ------------------------------------------------------------ rates */

test('Treasury auctions: percent with the date; outside 0 to 20 is rejected; another term is refused', async () => {
  const t10 = await pd.treasuryAuction('10-Year', router([['auctions_query', fx('treasury-10y')]]));
  assert.deepEqual(t10, { term: '10-Year', percent: 4.683, date: '2026-08-12' });
  const t5 = await pd.treasuryAuction('5-Year', router([['auctions_query', fx('treasury-5y')]]));
  assert.equal(t5.percent, 5.033);
  for (const v of ['21.5', '-1', 'abc', '']) {
    const b = fx('treasury-10y'); b.data[0].high_yield = v;
    await rejects(pd.treasuryAuction('10-Year', router([['auctions_query', b]])), 'bad-value');
  }
  const b0 = fx('treasury-10y'); b0.data[0].high_yield = '0';
  assert.equal((await pd.treasuryAuction('10-Year', router([['auctions_query', b0]]))).percent, 0);
  await rejects(pd.treasuryAuction('30-Year', router([])), 'bad-value');
  await rejects(pd.treasuryAuction('10-Year', router([['auctions_query', fx('treasury-5y')]])), 'bad-value');
  const nodate = fx('treasury-10y'); nodate.data[0].auction_date = 'soon';
  await rejects(pd.treasuryAuction('10-Year', router([['auctions_query', nodate]])), 'bad-value');
  assert.match((await (async () => { const g = router([['auctions_query', fx('treasury-10y')]]); await pd.treasuryAuction('10-Year', g); return g.seen[0]; })()), /inflation_index_security%3Aeq%3ANo/);
});

test('SOFR: percent with its date; a rate outside 0 to 20 or another series is rejected', async () => {
  assert.deepEqual(await pd.sofr(router([['markets.newyorkfed.org', fx('sofr')]])), { percent: 3.9, date: '2026-11-12' });
  const b = fx('sofr'); b.refRates[0].percentRate = 390;
  await rejects(pd.sofr(router([['markets.newyorkfed.org', b]])), 'bad-value');
  const o = fx('sofr'); o.refRates[0].type = 'EFFR';
  await rejects(pd.sofr(router([['markets.newyorkfed.org', o]])), 'bad-value');
});

/* ------------------------------------------------------------ demographics */

const KEY = 'a'.repeat(40);
const GEO = { stateFips: '11', countyFips: '11001', tractFips: '11001010500' };
const acsRoutes = () => router([['/acs/acs5?get=NAME,B01003_001E,B01003_001M,B19013_001E,B19013_001M,B11001_001E,B11001_001M&for=tract:', fx('census-tract')], ['for=county:', fx('census-county')]]);

test('ACS: the tract and county with margins of error; over 30% of the estimate is unreliable', async () => {
  const get = acsRoutes();
  const a = await pd.acsDemographics(GEO, KEY, get);
  assert.equal(a.year, 2024);
  assert.equal(a.tract.pop.est, 3200); assert.equal(a.tract.pop.moe, 410); assert.equal(a.tract.pop.unreliable, false);
  assert.equal(a.tract.income.est, 98000); assert.equal(a.tract.income.unreliable, a.tract.income.moe / a.tract.income.est > 0.3);
  assert.equal(a.tract.income.unreliable, false);
  assert.equal(a.county.pop.est, 690000);
  assert.ok(get.seen[0].includes('state:11%20county:001') && get.seen[0].includes('tract:010500'));
  assert.deepEqual(pd.acsFigure('100', '31'), { est: 100, moe: 31, unreliable: true });
  assert.equal(pd.acsFigure('100', '30').unreliable, false);
  assert.equal(pd.acsFigure('-666666666', '-222222222').est, null, 'Census’s "no estimate" is blank, not a number');
  assert.equal(pd.acsFigure('0', '5').unreliable, true);
});

test('ACS: a key that does not look like a key is never sent; an income that cannot be is rejected', async () => {
  const get = acsRoutes();
  for (const k of ['', 'short', 'z'.repeat(40), `${KEY}x`]) await rejects(pd.acsDemographics(GEO, k, get), 'key');
  assert.equal(get.seen.length, 0);
  await rejects(pd.acsDemographics({ ...GEO, tractFips: '1' }, KEY, acsRoutes()), 'bad-value');
  const t = fx('census-tract'); t[1][3] = '99999999999';
  await rejects(pd.acsDemographics(GEO, KEY, router([['for=tract:', t], ['for=county:', fx('census-county')]])), 'bad-value');
  // Census answers a bad key with a redirect, which the wrapper refuses: it is reported as a key problem
  await rejects(pd.acsDemographics(GEO, KEY, async () => { throw new pd.PublicDataError('network', 'x'); }), 'key');
});

/* ------------------------------------------------------------ the whole lookup */

const dcRoutes = () => [['DCGIS_MAR', fx('dc-mar')], ['geo.fcc.gov', fx('fcc-dc')], ['/MapServer/28/', fx('fema-zone')], ['/MapServer/3/', fx('fema-panel')], ['MapServer/40/', fx('dc-parcel')], ['MapServer/9/', fx('dc-zoning')], ['FEEDS/DCRA', fx('dc-permits')], ['auctions_query', (u) => (u.includes('10-Year') ? fx('treasury-10y') : fx('treasury-5y'))], ['markets.newyorkfed.org', fx('sofr')]];

test('a District address: rows with their sources and dates; Use only where a deal field fits', async () => {
  const get = router(dcRoutes());
  const { rows, where } = await lookupProperty({ address: '1801 F Street NW', city: 'Washington', state: 'DC', zip: '20006' }, { get });
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.ok(where.lat > 38 && where.tract === '11001010800');
  assert.equal(by.flood.asOf, '2010-09-27');
  assert.match(by.flood.value, /^Zone X/);
  assert.equal(by.assessed.value, '$9,275,220');
  assert.match(by.assessed.label, /^Assessed value \(county\), data of 2026/);
  assert.match(by.assessed.note, /Not the tax bill and not a market value/);
  assert.deepEqual(by.lot.use, { key: 'lot_sf', value: 13518 });
  assert.deepEqual(by.zoning.use, { key: 'zoning', value: 'C-3-C' });
  assert.equal(by.assessed.use, undefined, 'no deal field holds an assessed value, so no Use');
  assert.equal(by.flood.use, undefined);
  assert.equal(by['ust-10-Year'].value, '4.683%');
  assert.equal(by['ust-10-Year'].asOf, '2026-08-12');
  assert.ok(rows.every((r) => r.source && r.source.name));
  assert.ok(rows.every((r) => !r.error), JSON.stringify(rows.filter((r) => r.error)));
  assert.ok(!get.seen.some((u) => u.includes('nominatim')), 'the District’s own service placed it');
  assert.ok(get.seen.every((u) => pd.HOSTS.includes(new URL(u).hostname)));
  assert.ok(!rows.some((r) => r.group === 'Demographics'), 'no Census key, no demographics');
  // Use records the source and the date of the data
  assert.deepEqual(sourceFor(by.zoning, '2026-11-14'), { pub: { name: 'DC zoning map (Office of Zoning, via DC GIS)', link: 'https://maps.dcoz.dc.gov/', date: '2026-11-14', lookedUp: '2026-11-14' } });
  assert.equal(sourceFor(by.lot, '2026-11-14').pub.date, '2026-08-24');
});

test('a Maryland address in Montgomery County: SDAT and county permits; year built and land SF offer Use, structure SF does not', async () => {
  const fcc = { Block: { FIPS: '240317013051012', bbox: [0, 0, 0, 0] }, County: { FIPS: '24031', name: 'Montgomery' }, State: { FIPS: '24', code: 'MD', name: 'Maryland' }, status: 'OK' };
  const nom = [{ lat: '38.9907', lon: '-77.0261', display_name: '8113 Georgia Avenue, Silver Spring' }];
  const get = router([['nominatim', nom], ['geo.fcc.gov', fcc], ['/MapServer/28/', fx('fema-none')], ['opendata.maryland.gov', fx('sdat-moco')], ['data.montgomerycountymd.gov', fx('moco-permits')], ['auctions_query', fx('treasury-10y')], ['markets.newyorkfed.org', fx('sofr')]]);
  const { rows, attribution } = await lookupProperty({ address: '8113 Georgia Ave', city: 'Silver Spring', state: 'MD', zip: '20910' }, { get });
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(attribution, '© OpenStreetMap contributors');
  assert.deepEqual(by.year.use, { key: 'year', value: 1964 });
  assert.equal(by.lot.use.key, 'lot_sf');
  assert.equal(by.structure.use, undefined);
  assert.match(by.flood.value, /^No FEMA flood map covers this location/);
  assert.ok(by.flood.warn && !/Zone/.test(by.flood.value.replace('not a flood zone', '')));
  assert.equal(by.assessed.label, 'Assessed value (county), 2025');
  assert.ok(rows.some((r) => r.id === 'permit-0'));
});

test('one site failing becomes an error row and the rest still run; a Virginia point says no parcel source; a Census key adds demographics', async () => {
  const routes = dcRoutes().map((r) => (r[0] === 'MapServer/40/' ? ['MapServer/40/', new pd.PublicDataError('network', 'maps2.dcgis.dc.gov could not be reached')] : r));
  const { rows } = await lookupProperty({ address: '1801 F Street NW', state: 'DC' }, { get: router(routes) });
  assert.ok(rows.find((r) => r.id === 'parcel' && r.error));
  assert.ok(rows.find((r) => r.id === 'flood' && !r.error));
  const va = { Block: { FIPS: '510590417001000', bbox: [] }, County: { FIPS: '51059', name: 'Fairfax' }, State: { FIPS: '51', code: 'VA', name: 'Virginia' }, status: 'OK' };
  const g = router([['nominatim', [{ lat: '38.85', lon: '-77.3', display_name: 'x' }]], ['geo.fcc.gov', va], ['/MapServer/28/', fx('fema-none')], ['/acs/acs5', (u) => (u.includes('for=tract') ? fx('census-tract') : fx('census-county'))], ['auctions_query', fx('treasury-10y')], ['markets.newyorkfed.org', fx('sofr')]]);
  const out = await lookupProperty({ address: '10 Example Rd', city: 'Fairfax', state: 'VA' }, { get: g, key: KEY });
  assert.match(out.rows.find((r) => r.id === 'va').value, /No county parcel service/);
  const inc = out.rows.find((r) => r.id === 'acs-tract-income');
  assert.match(inc.value, /^\$98,000 ± \$21,000/);
  assert.match(inc.note, /margin of error/);
  assert.equal(inc.asOf, '2020-2024');
});

test('the source list: every source has a state, and the refused ones say why; no hosts beyond the allow-list', () => {
  for (const s of SOURCES) { assert.ok(['Ready', 'Needs a key', 'Not available from a browser'].includes(s.state), s.id); assert.ok(s.what); if (s.host) assert.ok(pd.HOSTS.includes(s.host), s.host); }
  assert.ok(SOURCES.some((s) => s.state === 'Not available from a browser'));
  assert.equal(houseNumber('1801 F Street NW'), '1801');
  assert.equal(houseNumber('F Street'), '');
});

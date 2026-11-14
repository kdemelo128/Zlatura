/* publiclookup.js -- one lookup for an address: which public sources apply, in what order, and the result as rows the card
 * shows (publicdataui.js). The adapters and the fetch wrapper are in publicdata.js; nothing here draws anything.
 *
 * A row: { id, group, label, value, asOf, source: { name, link }, use?: { key, value }, warn?, note?, error? }.
 *   - `use` is present only where a deal field fits (year built, land SF, zoning); the broker presses Use, nothing is filled.
 *   - A step that fails becomes an error row that says which site and why; the other steps still run.
 *   - Which county sources run follows the census state and county the point falls in, not the typed state. */

import * as pd from './publicdata.js';

/** Every source, for the consent sheet and the Connect page. `state`: Ready | Needs a key | Not available from a browser. */
export const SOURCES = Object.freeze([
  { id: 'geocode-dc', name: 'DC Master Address Repository', area: 'District of Columbia', host: 'maps2.dcgis.dc.gov', state: 'Ready', what: 'finds a District address on the map', link: 'https://opendata.dc.gov/' },
  { id: 'geocode-osm', name: 'OpenStreetMap Nominatim', area: 'Anywhere in the US', host: 'nominatim.openstreetmap.org', state: 'Ready', what: 'finds any address on the map (one request a second)', link: 'https://operations.osmfoundation.org/policies/nominatim/' },
  { id: 'census-geo', name: 'FCC census block lookup', area: 'Anywhere in the US', host: 'geo.fcc.gov', state: 'Ready', what: 'the census tract and county of a point', link: 'https://geo.fcc.gov/api/census/' },
  { id: 'fema', name: 'FEMA National Flood Hazard Layer', area: 'Anywhere in the US', host: 'hazards.fema.gov', state: 'Ready', what: 'the flood zone and the map’s effective date', link: 'https://www.fema.gov/flood-maps/national-flood-hazard-layer' },
  { id: 'dc-parcel', name: 'DC property records (DC GIS)', area: 'District of Columbia', host: 'maps2.dcgis.dc.gov', state: 'Ready', what: 'lot, use and assessed value, with zoning and permits', link: 'https://opendata.dc.gov/' },
  { id: 'md-sdat', name: 'Maryland real property (SDAT)', area: 'Maryland', host: 'opendata.maryland.gov', state: 'Ready', what: 'parcel, year built and assessed value', link: 'https://opendata.maryland.gov/' },
  { id: 'moco-permits', name: 'Montgomery County permits', area: 'Montgomery County, Maryland', host: 'data.montgomerycountymd.gov', state: 'Ready', what: 'building permits at an address', link: 'https://data.montgomerycountymd.gov/' },
  { id: 'treasury', name: 'Treasury note auctions (Fiscal Data)', area: 'Rates', host: 'api.fiscaldata.treasury.gov', state: 'Ready', what: '5- and 10-year note yields, with the auction date', link: 'https://fiscaldata.treasury.gov/' },
  { id: 'sofr', name: 'New York Fed SOFR', area: 'Rates', host: 'markets.newyorkfed.org', state: 'Ready', what: 'the secured overnight financing rate', link: 'https://www.newyorkfed.org/markets/reference-rates/sofr' },
  { id: 'acs', name: 'Census American Community Survey', area: 'Anywhere in the US', host: 'api.census.gov', state: 'Needs a key', what: 'population, households and income for the tract and county (your own free Census key)', link: 'https://api.census.gov/data/key_signup.html' },
  { id: 'va-parcel', name: 'Fairfax and Arlington parcel data', area: 'Virginia', host: '', state: 'Not available from a browser', what: 'no county service that a browser may read was found; see the proposal', link: '' },
  { id: 'census-geocoder', name: 'Census Geocoder', area: 'Anywhere in the US', host: '', state: 'Not available from a browser', what: 'the service does not allow a web page to read its answers', link: '' },
]);

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const int = (n) => Math.round(n).toLocaleString('en-US');
const today = () => new Date().toISOString().slice(0, 10);

/** The street number an address starts with, or ''. */
export const houseNumber = (address) => { const m = String(address || '').trim().match(/^(\d+)\b/); return m ? m[1] : ''; };

/** The one-line address the geocoders get. @param {{ address?: string, city?: string, state?: string, zip?: string }} p */
export const addressLine = ({ address, city, state, zip }) => [address, [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', ');

/** @param {{ state?: string, city?: string }} p */
const isDc = ({ state, city }) => /^(dc|d\.c\.|district of columbia)$/i.test(String(state || '').trim()) || (!state && /^washington$/i.test(String(city || '').trim()));

/**
 * Look the address up. `input` { address, city, state, zip }; opts { key (Census), get, onRow }.
 * Returns { rows, where, attribution } where `where` is { lat, lon, label, tract, county } or null when the address could not be placed.
 */
/** @param {{ address?: string, city?: string, state?: string, zip?: string }} input @param {{ key?: string, get?: (url: string) => Promise<any>, onRow?: (r: any) => void }} [opts] */
export async function lookupProperty(input, { key = '', get = pd.getJson, onRow = (/** @type {any} */ _r) => {} } = {}) {
  const rows = [];
  const push = (r) => { rows.push(r); onRow(r); };
  const fail = (id, group, name, e) => push({ id, group, label: name, error: e instanceof Error ? e.message : String(e), source: { name, link: '' } });
  const line = addressLine(input);
  let where = null; let attribution = '';
  if (!line) return { rows, where: null, attribution };

  // 1. place the address: the District's own service for a District address, else Nominatim
  let g = null; let gName = '';
  if (isDc(input) && input.address) {
    try { g = await pd.geocodeDc(input.address, get); gName = 'DC Master Address Repository'; } catch (e) { fail('geo-dc', 'Location', 'DC Master Address Repository', e); }
  }
  if (!g) {
    try { g = await pd.geocodeNominatim(line, get); gName = 'OpenStreetMap Nominatim'; if (g) attribution = g.attribution; } catch (e) { fail('geo-osm', 'Location', 'OpenStreetMap Nominatim', e); }
  }
  if (!g) { push({ id: 'geo-none', group: 'Location', label: 'Location', value: 'The address could not be placed on a map, so no place-based lookup was made.', source: { name: gName || 'Nominatim', link: '' }, warn: true }); }
  else push({ id: 'geo', group: 'Location', label: 'Found at', value: `${g.lat.toFixed(5)}, ${g.lon.toFixed(5)}${g.label ? ` (${g.label})` : ''}`, asOf: null, source: { name: gName, link: gName.startsWith('DC ') ? 'https://opendata.dc.gov/' : `https://www.openstreetmap.org/?mlat=${g.lat}&mlon=${g.lon}#map=18/${g.lat}/${g.lon}` } });

  let geo = null;
  if (g) {
    try { geo = await pd.fccBlock(g.lat, g.lon, get); } catch (e) { fail('tract', 'Location', 'FCC census block lookup', e); }
    if (geo) push({ id: 'tract', group: 'Location', label: 'Census tract and county', value: `Tract ${geo.tractFips.slice(5)}, ${geo.countyName}, ${geo.stateCode} (FIPS ${geo.tractFips})`, source: { name: 'FCC census block lookup', link: 'https://geo.fcc.gov/api/census/' } });
    where = { lat: g.lat, lon: g.lon, label: g.label, tract: geo ? geo.tractFips : null, county: geo ? geo.countyFips : null };

    // 2. flood zone
    try {
      const f = await pd.femaFlood(g.lat, g.lon, get);
      const src = { name: 'FEMA National Flood Hazard Layer', link: 'https://www.fema.gov/flood-maps/national-flood-hazard-layer' };
      if (!f.covered) push({ id: 'flood', group: 'Flood', label: 'Flood zone', value: 'No FEMA flood map covers this location. That is not a flood zone, and does not mean the place is safe from flooding.', source: src, warn: true });
      else push({ id: 'flood', group: 'Flood', label: 'Flood zone', value: `Zone ${f.zone}${f.subtype ? `, ${f.subtype}` : ''}${f.sfha === true ? '. In a special flood hazard area.' : f.sfha === false ? '. Not in a special flood hazard area.' : ''}${f.bfe !== null ? ` Base flood elevation ${f.bfe} ft.` : ''}`, asOf: f.effective, note: f.effective ? `Effective date of the FEMA map panel: ${f.effective}.` : 'The map’s effective date was not returned.', source: src });
    } catch (e) { fail('flood', 'Flood', 'FEMA National Flood Hazard Layer', e); }

    // 3. county records, by where the point falls
    const county = geo ? geo.countyFips : '';
    if (geo && geo.stateCode === 'DC') await dcRecords(g, push, fail, get);
    else if (geo && geo.stateCode === 'MD') await mdRecords(g, county, input, push, fail, get);
    else if (geo && geo.stateCode === 'VA') push({ id: 'va', group: 'Parcel and assessment', label: 'County parcel record', value: 'No county parcel service that a browser may read was found for Virginia. Use the Open in menu to search the county’s own site.', source: { name: 'Fairfax and Arlington parcel data', link: '' }, warn: true });
    else if (geo) push({ id: 'other-state', group: 'Parcel and assessment', label: 'County parcel record', value: `No parcel source is set up for ${geo.stateCode}. Only the DC, Maryland and Virginia sources are.`, source: { name: 'Public data', link: '' }, warn: true });

    // 4. demographics, only with the broker's own key
    if (geo && key) {
      try {
        const a = await pd.acsDemographics(geo, key, get);
        const src = { name: 'Census American Community Survey 5-year', link: 'https://www.census.gov/programs-surveys/acs' };
        const fig = (/** @type {any} */ f, /** @type {(n: number) => string} */ fmt) => (f.est === null ? 'not available' : `${fmt(f.est)}${f.moe !== null ? ` ± ${fmt(f.moe)}` : ''}${f.unreliable ? ' (unreliable: the margin of error is over 30% of the estimate)' : ''}`);
        for (const [scope, t] of /** @type {[string, any][]} */ ([['tract', a.tract], ['county', a.county]])) {
          for (const [k, label, fmt] of /** @type {[string, string, (n: number) => string][]} */ ([['pop', 'Population', int], ['households', 'Households', int], ['income', 'Median household income', money]])) {
            push({ id: `acs-${scope}-${k}`, group: 'Demographics', label: `${label}, ${scope}`, value: fig(t[k], fmt), asOf: `${a.year - 4}-${a.year}`, note: `${t.name}. ACS 5-year ${a.year - 4} to ${a.year}; a survey estimate with a margin of error, not a count.`, warn: !!t[k].unreliable, source: src });
          }
        }
      } catch (e) { fail('acs', 'Demographics', 'Census American Community Survey', e); }
    }
  }

  // 5. rates, which do not depend on the address
  await rates(push, fail, get);
  return { rows, where, attribution };
}

async function dcRecords(g, push, fail, get) {
  let ssl = '';
  try {
    const p = await pd.dcParcel(g.lat, g.lon, get);
    const src = { name: 'DC property records (DC GIS)', link: 'https://opendata.dc.gov/' };
    if (!p) push({ id: 'parcel', group: 'Parcel and assessment', label: 'Parcel', value: 'No tax lot was found at this point.', source: src, warn: true });
    else {
      ssl = p.ssl;
      push({ id: 'parcel', group: 'Parcel and assessment', label: 'Tax lot', value: `${p.ssl.replace(/\s+/g, ' ')}${p.address ? `, ${p.address}` : ''}${p.useType ? `. ${p.useType}` : ''}`, asOf: p.asOf, source: src });
      if (p.landSf) push({ id: 'lot', group: 'Parcel and assessment', label: 'Land area', value: `${int(p.landSf)} SF`, asOf: p.asOf, use: { key: 'lot_sf', value: p.landSf }, source: src });
      push({ id: 'assessed', group: 'Parcel and assessment', label: p.asOf ? `Assessed value (county), data of ${p.asOf.slice(0, 4)}` : 'Assessed value (county)', value: p.assessed ? money(p.assessed) : 'No assessment on record', asOf: p.asOf, note: 'The county’s assessment for tax purposes. Not the tax bill and not a market value.', source: src });
      if (p.owner) push({ id: 'owner', group: 'Parcel and assessment', label: 'Owner of record', value: p.owner, asOf: p.asOf, note: 'As the tax record lists it.', source: src });
      if (p.lastSale) push({ id: 'sale', group: 'Parcel and assessment', label: 'Last recorded sale', value: `${money(p.lastSale.price)} on ${p.lastSale.date}`, asOf: p.lastSale.date, source: src });
    }
  } catch (e) { fail('parcel', 'Parcel and assessment', 'DC property records (DC GIS)', e); }
  try {
    const z = await pd.dcZoning(g.lat, g.lon, get);
    const src = { name: 'DC zoning map (Office of Zoning, via DC GIS)', link: 'https://maps.dcoz.dc.gov/' };
    if (z && z.zoning) push({ id: 'zoning', group: 'Zoning', label: 'Zoning', value: z.zoning, use: { key: 'zoning', value: z.zoning }, source: src });
    else if (z && z.split) push({ id: 'zoning', group: 'Zoning', label: 'Zoning', value: `More than one zone covers this point (${z.split.join(', ')}). Which one applies is for you to say.`, warn: true, source: src });
  } catch (e) { fail('zoning', 'Zoning', 'DC zoning map', e); }
  try {
    const ps = await pd.dcPermits(ssl, get);
    permitRows(ps, { name: 'DC building permits (DCRA, via DC GIS)', link: 'https://opendata.dc.gov/' }, push);
  } catch (e) { fail('permits', 'Permits', 'DC building permits', e); }
}

async function mdRecords(g, county, input, push, fail, get) {
  try {
    const r = await pd.sdatParcelAt(g.lat, g.lon, houseNumber(input.address), get);
    const src = { name: 'Maryland real property (SDAT)', link: 'https://opendata.maryland.gov/' };
    if (!r) push({ id: 'parcel', group: 'Parcel and assessment', label: 'Parcel', value: 'No Maryland property record is near this point.', source: src, warn: true });
    else if (r.several) push({ id: 'parcel', group: 'Parcel and assessment', label: 'Parcel', value: `Could not tell which record is this address. Nearby: ${r.several.slice(0, 6).join('; ')}.`, source: src, warn: true });
    else {
      const p = r.parcel; const s = { ...src, link: p.link || src.link };
      push({ id: 'parcel', group: 'Parcel and assessment', label: 'Account', value: `${p.county} County, account ${p.account}, ${p.address}${p.landUse ? `. ${p.landUse}` : ''}`, source: s });
      if (p.yearBuilt) push({ id: 'year', group: 'Parcel and assessment', label: 'Year built', value: String(p.yearBuilt), use: { key: 'year', value: p.yearBuilt }, source: s });
      if (p.landSf) push({ id: 'lot', group: 'Parcel and assessment', label: 'Land area', value: `${int(p.landSf)} SF`, use: { key: 'lot_sf', value: p.landSf }, source: s });
      if (p.structureSf) push({ id: 'structure', group: 'Parcel and assessment', label: 'Structure area (county)', value: `${int(p.structureSf)} SF`, note: 'The assessor’s building figure. It is not stated whether it is rentable or gross area, so it is not offered for Building SF.', source: s });
      push({ id: 'assessed', group: 'Parcel and assessment', label: p.assessedYear ? `Assessed value (county), ${p.assessedYear}` : 'Assessed value (county)', value: p.assessed ? money(p.assessed) : 'No assessment on record', note: `The state assessor’s current-cycle total${p.landValue && p.improvementValue ? `: land ${money(p.landValue)}, improvements ${money(p.improvementValue)}` : ''}. Not the tax bill and not a market value.`, source: s });
      if (p.lastSale) push({ id: 'sale', group: 'Parcel and assessment', label: 'Last recorded sale', value: `${money(p.lastSale.price)} on ${p.lastSale.date}`, asOf: p.lastSale.date, source: s });
    }
  } catch (e) { fail('parcel', 'Parcel and assessment', 'Maryland real property (SDAT)', e); }
  if (county === '24031') {
    try {
      const ps = await pd.mocoPermits(g.lat, g.lon, houseNumber(input.address), get);
      permitRows(ps, { name: 'Montgomery County permits', link: 'https://data.montgomerycountymd.gov/' }, push);
    } catch (e) { fail('permits', 'Permits', 'Montgomery County permits', e); }
  }
}

function permitRows(ps, src, push) {
  if (!ps.length) { push({ id: 'permits', group: 'Permits', label: 'Permits', value: 'No permits found for this lot.', source: src }); return; }
  ps.forEach((p, i) => push({ id: `permit-${i}`, group: 'Permits', label: `${p.type}${p.subtype ? `, ${p.subtype}` : ''}`, value: `${p.id}: ${p.status}${p.work ? `. ${p.work}` : ''}`, asOf: p.issued, source: src }));
}

async function rates(push, fail, get) {
  for (const term of ['10-Year', '5-Year']) {
    try {
      const r = await pd.treasuryAuction(term, get);
      if (r) push({ id: `ust-${term}`, group: 'Rates', label: `${term === '10-Year' ? '10' : '5'}-year Treasury note, latest auction`, value: `${r.percent.toFixed(3)}%`, asOf: r.date, note: 'The auction’s high yield, in percent. Not a daily market yield.', source: { name: 'Treasury Fiscal Data, auctions', link: 'https://fiscaldata.treasury.gov/' } });
    } catch (e) { fail(`ust-${term}`, 'Rates', `${term} Treasury`, e); }
  }
  try {
    const r = await pd.sofr(get);
    if (r) push({ id: 'sofr', group: 'Rates', label: 'SOFR', value: `${r.percent.toFixed(2)}%`, asOf: r.date, note: 'Secured overnight financing rate, in percent.', source: { name: 'New York Fed', link: 'https://www.newyorkfed.org/markets/reference-rates/sofr' } });
  } catch (e) { fail('sofr', 'Rates', 'New York Fed SOFR', e); }
}

/** What Use records on the deal as the field's source: the source, its link, and the date of the data (or of the lookup). */
export function sourceFor(row, lookedUp = today()) {
  return { pub: { name: row.source.name, link: row.source.link || '', date: row.asOf && /^\d{4}-\d{2}-\d{2}$/.test(row.asOf) ? row.asOf : lookedUp, lookedUp } };
}

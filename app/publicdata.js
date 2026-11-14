/* publicdata.js -- free public data for an address, looked up from the browser: where it is, its census tract, its FEMA
 * flood zone, the county's parcel and assessment record, zoning, permits, Treasury and SOFR rates, and (with the broker's own
 * free Census key) the tract's demographics. No server of ours is involved.
 *
 * ONE fetch wrapper, getJson(): a fixed host list (an unlisted host throws before any request), https only, no cookies
 * (credentials omitted), no referrer, no redirects, a time limit, JSON only, and a size cap. Every source is a small
 * adapter that takes `get` (getJson, or a test's recorded response) and checks each figure it reads against a plausible
 * range; a figure outside it is rejected, not shown. A result is only ever SHOWN: the deal changes only when the broker
 * presses Use (publicdataui.js). Blank stays blank: a zero assessment or an empty zone is "no record", never 0.
 *
 * Only sources whose browser access was checked on 2026-11-14 (an Access-Control-Allow-Origin header on a real answer) are
 * here; docs/proposals/k6-public-data.md lists each, its terms, and the ones refused. tests/publicdata.test.js runs every
 * adapter on a recorded response (tests/fixtures/publicdata/) and gives each check a bad value. */

/** The only hosts a lookup may reach. Adding one is a security decision (docs/proposals/k6-public-data.md). */
export const HOSTS = Object.freeze([
  'nominatim.openstreetmap.org', 'maps2.dcgis.dc.gov', 'geo.fcc.gov', 'hazards.fema.gov', 'opendata.maryland.gov',
  'data.montgomerycountymd.gov', 'api.fiscaldata.treasury.gov', 'markets.newyorkfed.org', 'api.census.gov',
]);

export class PublicDataError extends Error {
  /** @param {string} code host | timeout | http | type | size | json | bad-value | key | network @param {string} message */
  constructor(code, message) { super(message); this.name = 'PublicDataError'; this.code = code; }
}

const MAX_BYTES = 1500000;
const TIMEOUT_MS = 12000;

/**
 * GET a JSON document from an allowed host. Throws PublicDataError and never makes a request for an unlisted host, a
 * non-https address, an address with a user name, or a port.
 * @param {string} url @param {{ fetchImpl?: typeof fetch, timeoutMs?: number, maxBytes?: number }} [opt]
 */
export async function getJson(url, { fetchImpl, timeoutMs = TIMEOUT_MS, maxBytes = MAX_BYTES } = {}) {
  let u;
  try { u = new URL(String(url)); } catch { throw new PublicDataError('host', 'not a web address'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !HOSTS.includes(u.hostname)) throw new PublicDataError('host', `${u.hostname || 'that address'} is not on the list of public-data sites`);
  const f = fetchImpl || ((...a) => globalThis.fetch(...a));
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await f(u.href, { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store', signal: ctl.signal, headers: { Accept: 'application/json' } });
    } catch (e) {
      if (ctl.signal.aborted) throw new PublicDataError('timeout', `${u.hostname} did not answer in time`);
      throw new PublicDataError('network', `${u.hostname} could not be reached (offline, or the site does not allow this page to read it)`);
    }
    if (!res.ok) throw new PublicDataError('http', `${u.hostname} answered ${res.status}`);
    const type = String(res.headers.get('content-type') || '');
    if (!/json/i.test(type)) throw new PublicDataError('type', `${u.hostname} did not answer with data`);
    const len = Number(res.headers.get('content-length'));
    if (Number.isFinite(len) && len > maxBytes) throw new PublicDataError('size', `${u.hostname} sent too much data`);
    let text = '';
    if (res.body && res.body.getReader) {
      const rd = res.body.getReader(); const dec = new TextDecoder(); let n = 0;
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        n += value.byteLength;
        if (n > maxBytes) { try { await rd.cancel(); } catch { /* already closed */ } throw new PublicDataError('size', `${u.hostname} sent too much data`); }
        text += dec.decode(value, { stream: true });
      }
      text += dec.decode();
    } else {
      text = await res.text();
      if (text.length > maxBytes) throw new PublicDataError('size', `${u.hostname} sent too much data`);
    }
    try { return JSON.parse(text); } catch { throw new PublicDataError('json', `${u.hostname} sent something that is not data`); }
  } finally { clearTimeout(timer); }
}

/* ------------------------------------------------------------ helpers */

const bad = (what) => new PublicDataError('bad-value', what);
const num = (x) => { if (x === null || x === undefined || x === '') return null; const n = typeof x === 'number' ? x : Number(String(x).replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
const q = encodeURIComponent;
/** An ArcGIS date (milliseconds) as YYYY-MM-DD, or null. */
const esriDay = (ms) => { const n = num(ms); if (n === null || n <= 0) return null; const d = new Date(n); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); };
const day = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
const text = (s, max = 80) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const point = (lat, lon) => { if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || !Number.isFinite(lat) || !Number.isFinite(lon)) throw bad('the place is not a latitude and longitude'); };
const features = (d) => {
  if (!d || typeof d !== 'object') throw new PublicDataError('json', 'unexpected answer');
  if (d.error) throw new PublicDataError('http', 'the site answered with an error');
  return Array.isArray(d.features) ? d.features.map((f) => (f && f.attributes) || {}) : [];
};
const ARC = 'geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&returnGeometry=false&f=json';
const arcPoint = (lat, lon) => `geometry=${q(`${lon},${lat}`)}&${ARC}`;

/* ------------------------------------------------------------ a. geocoding */

let lastNominatim = 0;
/** Nominatim's policy: at most one request a second. Waits when the last one was too recent. */
async function nominatimTurn(gapMs = 1100) {
  const wait = lastNominatim + gapMs - Date.now();
  lastNominatim = Date.now() + Math.max(0, wait);
  if (wait > 0) await new Promise((r) => { setTimeout(() => r(undefined), wait); });
}

/** OpenStreetMap Nominatim: { lat, lon, label, attribution } or null when it finds nothing. */
export async function geocodeNominatim(line, get = getJson) {
  const s = text(line, 200);
  if (!s) return null;
  await nominatimTurn();
  const d = await get(`https://nominatim.openstreetmap.org/search?q=${q(s)}&format=jsonv2&limit=1&countrycodes=us`);
  if (!Array.isArray(d)) throw new PublicDataError('json', 'unexpected answer');
  if (!d.length) return null;
  const lat = num(d[0].lat); const lon = num(d[0].lon);
  if (lat === null || lon === null) throw bad('no usable coordinates');
  point(lat, lon);
  if (lat < 17 || lat > 72 || lon < -180 || lon > -64) throw bad('the place is not in the United States');
  return { lat, lon, label: text(d[0].display_name, 200), attribution: '© OpenStreetMap contributors' };
}

/** The District's own Master Address Repository: { lat, lon, label } or null. Only places inside the District count. */
export async function geocodeDc(street, get = getJson) {
  const s = text(street, 120);
  if (!s) return null;
  const d = await get(`https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_APPS/DCGIS_MAR/GeocodeServer/findAddressCandidates?SingleLine=${q(s)}&maxLocations=1&outSR=4326&f=json`);
  if (!d || typeof d !== 'object' || d.error) throw new PublicDataError('json', 'unexpected answer');
  const c = Array.isArray(d.candidates) ? d.candidates[0] : null;
  if (!c || !c.location || !(num(c.score) >= 80)) return null;
  const lat = num(c.location.y); const lon = num(c.location.x);
  if (lat === null || lon === null) throw bad('no usable coordinates');
  if (lat < 38.78 || lat > 39.0 || lon < -77.13 || lon > -76.90) throw bad('the place is outside the District');
  return { lat, lon, label: text(c.address, 120), attribution: '' };
}

/* ------------------------------------------------------------ b. census geography */

/** FCC block lookup: the census tract and county codes for a point. */
export async function fccBlock(lat, lon, get = getJson) {
  point(lat, lon);
  const d = await get(`https://geo.fcc.gov/api/census/block/find?latitude=${q(lat)}&longitude=${q(lon)}&format=json&showall=false`);
  if (!d || d.status !== 'OK' || !d.Block || !d.County || !d.State) throw new PublicDataError('json', 'no census block for that point');
  const blk = String(d.Block.FIPS || '');
  const county = String(d.County.FIPS || '');
  if (!/^\d{15}$/.test(blk) || !/^\d{5}$/.test(county) || blk.slice(0, 5) !== county) throw bad('the census codes do not fit together');
  return { stateFips: county.slice(0, 2), countyFips: county, tractFips: blk.slice(0, 11), countyName: text(d.County.name, 60), stateCode: text(d.State.code, 2) };
}

/* ------------------------------------------------------------ c. flood zone */

const FLOOD_ZONES = new Set(['A', 'AE', 'AH', 'AO', 'AR', 'A99', 'V', 'VE', 'X', 'D', 'OPEN WATER', 'AREA NOT INCLUDED']);
/**
 * FEMA National Flood Hazard Layer (layer 28, Flood Hazard Zones) at a point, with the effective date of the FIRM panel that
 * carries it (layer 3). { covered: false } when no FEMA map covers the point: that is never a zone.
 */
export async function femaFlood(lat, lon, get = getJson) {
  point(lat, lon);
  const base = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer';
  const rows = features(await get(`${base}/28/query?${arcPoint(lat, lon)}&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,DFIRM_ID`));
  if (!rows.length) return { covered: false };
  const z = rows[0];
  const zone = text(z.FLD_ZONE, 20).toUpperCase();
  if (!FLOOD_ZONES.has(zone)) throw bad(`“${zone || 'blank'}” is not a flood zone code`);
  const sfha = z.SFHA_TF === 'T' ? true : z.SFHA_TF === 'F' ? false : null;
  const bfe = num(z.STATIC_BFE);
  const dfirm = text(z.DFIRM_ID, 6);
  let effective = null;
  try {
    const panels = features(await get(`${base}/3/query?${arcPoint(lat, lon)}&outFields=FIRM_PAN,EFF_DATE,DFIRM_ID`));
    const mine = panels.filter((p) => text(p.DFIRM_ID, 6) === dfirm && esriDay(p.EFF_DATE));
    mine.sort((a, b) => num(b.EFF_DATE) - num(a.EFF_DATE));
    effective = mine.length ? esriDay(mine[0].EFF_DATE) : null;
  } catch { effective = null; }   // the zone stands without its map date; the row says the date is not known
  return { covered: true, zone, subtype: text(z.ZONE_SUBTY, 80).toLowerCase(), sfha, bfe: bfe !== null && bfe > -9000 && bfe < 5000 ? bfe : null, effective, panel: dfirm };
}

/* ------------------------------------------------------------ d. parcel and assessment */

const asYear = (v) => { const n = num(v); return n !== null && n >= 1600 && n <= new Date().getFullYear() + 2 ? Math.round(n) : null; };

/** DC: the common-ownership parcel (Office of Tax and Revenue records through DC GIS) at a point. null when no lot is there. */
export async function dcParcel(lat, lon, get = getJson) {
  point(lat, lon);
  const rows = features(await get(`https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land_WebMercator/MapServer/40/query?${arcPoint(lat, lon)}&outFields=SSL,PREMISEADD,PROPTYPE,LANDAREA,ASSESSMENT,PHASELAND,PHASEBUILD,EXTRACTDAT,SALEPRICE,SALEDATE,OWNERNAME`));
  if (!rows.length) return null;
  const r = rows[0];
  const assessed = num(r.ASSESSMENT); const land = num(r.LANDAREA);
  if (assessed !== null && (assessed < 0 || assessed > 5e10)) throw bad('the assessed value is outside any plausible range');
  if (land !== null && (land < 0 || land > 1e9)) throw bad('the land area is outside any plausible range');
  const salePrice = num(r.SALEPRICE);
  return {
    ssl: text(r.SSL, 20), address: text(r.PREMISEADD, 80), useType: text(r.PROPTYPE, 40), landSf: land && land > 0 ? Math.round(land) : null,
    assessed: assessed && assessed > 0 ? Math.round(assessed) : null,   // zero means no assessment on record, not a value of 0
    landValue: num(r.PHASELAND) > 0 ? Math.round(num(r.PHASELAND)) : null, improvementValue: num(r.PHASEBUILD) > 0 ? Math.round(num(r.PHASEBUILD)) : null,
    asOf: esriDay(r.EXTRACTDAT), owner: text(r.OWNERNAME, 70),
    lastSale: salePrice > 0 && esriDay(r.SALEDATE) ? { price: Math.round(salePrice), date: esriDay(r.SALEDATE) } : null,
  };
}

/** DC zoning at a point: { zoning } for one zone, { split: [..] } for several (asked, never guessed), or null. */
export async function dcZoning(lat, lon, get = getJson) {
  point(lat, lon);
  const rows = features(await get(`https://maps2.dcgis.dc.gov/dcgis/rest/services/DCOZ/Zoning_MapServices/MapServer/9/query?${arcPoint(lat, lon)}&outFields=Zoning_Label,Zoning,Zoning_Status`));
  const zs = [...new Set(rows.map((r) => text(r.Zoning_Label || r.Zoning, 30)).filter(Boolean))];
  for (const z of zs) if (!/^[A-Za-z0-9][A-Za-z0-9 \-/.]{0,29}$/.test(z)) throw bad(`“${z}” is not a zoning label`);
  if (!zs.length) return null;
  if (zs.length > 1) return { zoning: null, split: zs };
  return { zoning: zs[0], status: text(rows[0].Zoning_Status, 20) };
}

const SDAT = 'https://opendata.maryland.gov/resource/ed4q-f8tm.json';
const SDAT_F = {
  county: 'county_name_mdp_field_cntyname', acct: 'account_id_mdp_field_acctid', addr: 'mdp_street_address_mdp_field_address', city: 'mdp_street_address_city_mdp_field_city',
  use: 'land_use_code_mdp_field_lu_desclu_sdat_field_50', year: 'c_a_m_a_system_data_year_built_yyyy_mdp_field_yearblt_sdat_field_235',
  area: 'c_a_m_a_system_data_structure_area_sq_ft_mdp_field_sqftstrc_sdat_field_241', land: 'c_a_m_a_system_data_land_area_mdp_field_landarea_sdat_field_242',
  unit: 'c_a_m_a_system_data_land_unit_of_measure_mdp_field_luom_sdat_field_243', total: 'current_assessment_year_total_assessment_sdat_field_172',
  lv: 'current_cycle_data_land_value_mdp_field_names_nfmlndvl_curlndvl_and_sallndvl_sdat_field_164',
  iv: 'current_cycle_data_improvements_value_mdp_field_names_nfmimpvl_curimpvl_and_salimpvl_sdat_field_165',
  dated: 'current_cycle_data_date_assessed_yyyy_mm_mdp_field_lastassd_sdat_field_169', link: 'real_property_search_link',
  saleDate: 'sales_segment_1_transfer_date_yyyy_mm_dd_mdp_field_tradate_sdat_field_89', salePrice: 'sales_segment_1_consideration_mdp_field_considr1_sdat_field_90',
};
const SDAT_SELECT = [...Object.values(SDAT_F), 'mappable_latitude_and_longitude'].join(',');

/** One SDAT row as a parcel, every figure range-checked. */
function sdatParcel(r) {
  const area = num(r[SDAT_F.land]); const unit = text(r[SDAT_F.unit], 2).toUpperCase();
  // the county writes land in acres (A) or square feet (S); any other unit is not guessed
  const landSf = area && area > 0 ? (unit === 'A' ? Math.round(area * 43560) : unit === 'S' ? Math.round(area) : null) : null;
  if (landSf !== null && landSf > 1e9) throw bad('the land area is outside any plausible range');
  const assessed = num(r[SDAT_F.total]);
  if (assessed !== null && (assessed < 0 || assessed > 5e10)) throw bad('the assessed value is outside any plausible range');
  const dated = text(r[SDAT_F.dated], 7);
  const sd = text(r[SDAT_F.saleDate], 10).replace(/\./g, '-'); const sp = num(r[SDAT_F.salePrice]);
  const link = r[SDAT_F.link] && typeof r[SDAT_F.link].url === 'string' ? r[SDAT_F.link].url : '';
  return {
    account: text(r[SDAT_F.acct], 20), county: text(r[SDAT_F.county], 30), address: text(r[SDAT_F.addr], 80), city: text(r[SDAT_F.city], 40), landUse: text(r[SDAT_F.use], 40),
    yearBuilt: asYear(r[SDAT_F.year]),   // "0000" is no year, not a year
    structureSf: num(r[SDAT_F.area]) > 0 && num(r[SDAT_F.area]) < 1e8 ? Math.round(num(r[SDAT_F.area])) : null, landSf,
    assessed: assessed && assessed > 0 ? Math.round(assessed) : null, assessedYear: /^\d{4}\.\d{2}$/.test(dated) ? Number(dated.slice(0, 4)) : null,
    landValue: num(r[SDAT_F.lv]) > 0 ? Math.round(num(r[SDAT_F.lv])) : null, improvementValue: num(r[SDAT_F.iv]) > 0 ? Math.round(num(r[SDAT_F.iv])) : null,
    lastSale: sp > 0 && /^\d{4}-\d{2}-\d{2}$/.test(sd) ? { price: Math.round(sp), date: sd } : null, link,
  };
}

/**
 * Maryland State Department of Assessments and Taxation, real property, within 60 m of the point. The parcel is the one whose
 * street number is the address's. { parcel } for one, { several: [addresses] } when more than one fits or none can be told apart
 * (the broker picks, nothing is guessed), or null when nothing is near.
 */
export async function sdatParcelAt(lat, lon, houseNumber, get = getJson) {
  point(lat, lon);
  const d = await get(`${SDAT}?$where=${q(`within_circle(mappable_latitude_and_longitude,${lat},${lon},60)`)}&$order=${q(`distance_in_meters(mappable_latitude_and_longitude,'POINT(${lon} ${lat})')`)}&$limit=10&$select=${SDAT_SELECT}`);
  if (!Array.isArray(d)) throw new PublicDataError('json', 'unexpected answer');
  if (!d.length) return null;
  const n = String(houseNumber || '').match(/^\d+/);
  const mine = n ? d.filter((r) => new RegExp(`^${n[0]}\\b`).test(String(r[SDAT_F.addr] || ''))) : [];
  if (mine.length === 1) return { parcel: sdatParcel(mine[0]) };
  return { several: (mine.length ? mine : d).map((r) => text(r[SDAT_F.addr], 80)).filter(Boolean) };
}

/* ------------------------------------------------------------ e. permits */

/** DC building permits on a lot (square, suffix and lot as the tax record writes them), this year and last, newest first. */
export async function dcPermits(ssl, get = getJson) {
  const s = String(ssl || '').trim();
  if (!/^[0-9A-Za-z ]{4,20}$/.test(s)) return [];   // never put anything else into the query
  const out = [];
  for (const layer of [18, 17]) {
    const rows = features(await get(`https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/DCRA/MapServer/${layer}/query?where=${q(`SSL='${s}'`)}&outFields=PERMIT_ID,PERMIT_TYPE_NAME,PERMIT_SUBTYPE_NAME,APPLICATION_STATUS_NAME,ISSUE_DATE,DESC_OF_WORK&returnGeometry=false&resultRecordCount=5&orderByFields=ISSUE_DATE+DESC&f=json`));
    for (const r of rows) out.push({ id: text(r.PERMIT_ID, 30), type: text(r.PERMIT_TYPE_NAME, 40), subtype: text(r.PERMIT_SUBTYPE_NAME, 40), status: text(r.APPLICATION_STATUS_NAME, 40), issued: esriDay(r.ISSUE_DATE), work: text(r.DESC_OF_WORK, 160) });
  }
  return out.filter((p) => p.id).sort((a, b) => String(b.issued || '').localeCompare(String(a.issued || ''))).slice(0, 5);
}

/** Montgomery County (Maryland) permits at a street number near a point, newest first. */
export async function mocoPermits(lat, lon, houseNumber, get = getJson) {
  point(lat, lon);
  const n = String(houseNumber || '').match(/^\d{1,6}$/);
  if (!n) return [];
  const d = await get(`https://data.montgomerycountymd.gov/resource/i26v-w6bd.json?$where=${q(`stno='${n[0]}' AND within_circle(location,${lat},${lon},150)`)}&$order=addeddate+DESC&$limit=5&$select=permitno,status,addeddate,issueddate,declaredvaluation,description,applicationtype,worktype`);
  if (!Array.isArray(d)) throw new PublicDataError('json', 'unexpected answer');
  return d.map((r) => ({ id: text(r.permitno, 20), type: text(r.applicationtype, 40), subtype: text(r.worktype, 40), status: text(r.status, 30), issued: day(r.issueddate) || day(r.addeddate), work: text(String(r.description || '').replace(/&nbsp;/g, ' '), 160) })).filter((p) => p.id);
}

/* ------------------------------------------------------------ f. rates */

/** A percent for display: must be 0 to 20 or it is rejected. */
function rate(v, what) {
  const n = num(v);
  if (n === null || n < 0 || n > 20) throw bad(`${what} of ${v === null || v === undefined ? 'nothing' : v}% is outside 0 to 20`);
  return n;
}

/**
 * The high yield of the latest 5- or 10-year Treasury note auction (Fiscal Data's auctions dataset; the daily par yield curve is
 * not served by an API a browser may read). Percent, with the auction date. Inflation-protected notes are left out.
 */
export async function treasuryAuction(term, get = getJson) {
  if (term !== '10-Year' && term !== '5-Year') throw bad('only the 5-year and 10-year notes are looked up');
  const d = await get(`https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query?filter=${q(`security_term:eq:${term},security_type:eq:Note,inflation_index_security:eq:No,high_yield:gt:0`)}&sort=-auction_date&page%5Bsize%5D=1&fields=auction_date,issue_date,security_term,high_yield`);
  const r = d && Array.isArray(d.data) ? d.data[0] : null;
  if (!r) return null;
  if (r.security_term !== term) throw bad('the answer is for another term');
  const date = day(r.auction_date);
  if (!date) throw bad('no auction date');
  return { term, percent: rate(r.high_yield, `the ${term} yield`), date };
}

/** The secured overnight financing rate, latest business day, from the New York Fed. */
export async function sofr(get = getJson) {
  const d = await get('https://markets.newyorkfed.org/api/rates/secured/sofr/last/1.json');
  const r = d && Array.isArray(d.refRates) ? d.refRates[0] : null;
  if (!r) return null;
  if (r.type !== 'SOFR') throw bad('the answer is for another rate');
  const date = day(r.effectiveDate);
  if (!date) throw bad('no date');
  return { percent: rate(r.percentRate, 'SOFR'), date };
}

/* ------------------------------------------------------------ g. demographics (the broker's own Census key) */

/** The ACS 5-year vintages tried, newest first. */
export const ACS_YEARS = [2024, 2023];
const ACS_VARS = [['pop', 'B01003_001'], ['income', 'B19013_001'], ['households', 'B11001_001']];
/** Census writes "no estimate" as a large negative number. */
const acsNum = (v) => { const n = num(v); return n === null || n <= -222222222 ? null : n; };
/** One figure with its margin of error; unreliable when the margin is over 30% of the estimate. */
export function acsFigure(est, moe) {
  const e = acsNum(est); const m = acsNum(moe);
  if (e === null || e < 0) return { est: null, moe: null, unreliable: null };
  return { est: e, moe: m !== null && m >= 0 ? m : null, unreliable: m === null ? null : e === 0 ? m > 0 : m / e > 0.3 };
}
export const keyLooksRight = (k) => typeof k === 'string' && /^[0-9a-f]{40}$/i.test(k.trim());

async function acsTable(year, geo, key, get) {
  const vars = ACS_VARS.flatMap(([, v]) => [`${v}E`, `${v}M`]).join(',');
  const d = await get(`https://api.census.gov/data/${year}/acs/acs5?get=NAME,${vars}&for=${geo.for}&in=${geo.in}&key=${q(key.trim())}`);
  if (!Array.isArray(d) || d.length < 2 || !Array.isArray(d[0])) throw new PublicDataError('json', 'unexpected answer');
  const head = d[0]; const row = d[1];
  const at = (n) => row[head.indexOf(n)];
  const out = { name: text(at('NAME'), 100) };
  for (const [k, v] of ACS_VARS) out[k] = acsFigure(at(`${v}E`), at(`${v}M`));
  if (out.income.est !== null && (out.income.est < 1000 || out.income.est > 1e7)) throw bad('the median income is outside any plausible range');
  return out;
}

/** Census ACS 5-year for a tract and its county: { year, tract, county }. A rejected key (Census answers with a redirect) is "key". */
export async function acsDemographics({ stateFips, countyFips, tractFips }, key, get = getJson) {
  if (!keyLooksRight(key)) throw new PublicDataError('key', 'the Census key does not look right (it is 40 letters and digits)');
  if (!/^\d{2}$/.test(stateFips) || !/^\d{5}$/.test(countyFips) || !/^\d{11}$/.test(tractFips)) throw bad('the census codes are not valid');
  let last = null;
  for (const year of ACS_YEARS) {
    try {
      const tract = await acsTable(year, { for: `tract:${tractFips.slice(5)}`, in: `state:${stateFips}%20county:${countyFips.slice(2)}` }, key, get);
      const county = await acsTable(year, { for: `county:${countyFips.slice(2)}`, in: `state:${stateFips}` }, key, get);
      return { year, tract, county };
    } catch (e) {
      last = e;
      if (e instanceof PublicDataError && (e.code === 'network' || e.code === 'bad-value' || e.code === 'host' || e.code === 'timeout')) {
        // a redirect to Census's key page surfaces as 'network': say so in words, once
        if (e.code === 'network') throw new PublicDataError('key', 'Census did not accept the key (or the browser could not read its answer)');
        throw e;
      }
    }
  }
  throw last || new PublicDataError('http', 'no ACS table answered');
}

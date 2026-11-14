# K6: public data across the DMV, and maps and search links

Status: built on branch `claude/connect-k6`, approved in `.evolve/DECISIONS.md` (2026-11-14). This note is the design
record: each source, its host, what the browser check found, its terms, what it returns, the sanity checks, and what was
refused. Parent: `docs/proposals/connectivity-and-market-data.md` sections 5, 7 and 8.

## How it works

- `app/maplinks.js` (pure URL builders) and `app/maplinksui.js` (the "Open in…" button and sheet). No network, no key.
- `app/publicdata.js`: ONE fetch (`getJson`) with a fixed host list. An unlisted host, a non-https address, a user name or
  a port throws before any request. `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `redirect: 'error'`, a 12 s
  time limit, JSON content type only, 1.5 MB cap (counted while streaming). One adapter per source, each given `get` so a
  test hands it a recorded response, each with sanity checks.
- `app/publiclookup.js`: which sources run for an address, and the result as rows.
- `app/publicdataui.js`: the deal's Public data card, the Connect page lookup, the Census key sheet.
- Consent: the sheet names the sites and says the deal's figures are not sent (first time per deal in a session; not
  stored, so a new session asks again). A confidential deal gets a second confirm each time.
- Use: only where a deal field fits (year built, land SF, zoning). It stores `sources[key] = { pub: { name, link, date,
  lookedUp }, orig, hand: false }`, can be undone, and typing over it makes the source "typed". Results are never saved with
  the deal. This adds one optional key (`pub`) inside the existing free-form `sources` entries; nothing existing is read
  differently and no migration is needed. Saved-deal results and the golden outputs are unchanged.
- The Census key is in kv `publicdata.key`, listed in `backup.js` `NEVER_KEYS`: dropped on writing a backup, on reading
  one, and never removed or replaced by a restore. A test fails if it appears in a backup.
- The content-security `<meta>` has no `connect-src` today and the AI server address is the broker's own, so adding one would
  break it; the host list in code is the control. Two source scans pin it (`tests/ai-guard-scan.test.js`): `fetch` appears
  once in `ai.js` and once in `publicdata.js`, the latter after the host check, and every address written in `publicdata.js`
  is on the list.

## K6 host list (also `HOSTS` in `app/publicdata.js`)

nominatim.openstreetmap.org, maps2.dcgis.dc.gov, geo.fcc.gov, hazards.fema.gov, opendata.maryland.gov,
data.montgomerycountymd.gov, api.fiscaldata.treasury.gov, markets.newyorkfed.org, api.census.gov.

## Sources used

Checked 2026-11-14 with `curl -H "Origin: https://kdemelo128.github.io"`: a real answer carried
`Access-Control-Allow-Origin` (`*`, or the origin echoed). Terms links marked (unchecked) were not reachable from the build
machine, so the link is as the site publishes it and was not opened.

| Source | Host | CORS | Returns | Sanity checks | Terms |
|---|---|---|---|---|---|
| OpenStreetMap Nominatim (geocode) | nominatim.openstreetmap.org | `*` | lat, lon, display name | coordinates in range and in the US; at most 1 request a second; attribution line shown where used | operations.osmfoundation.org/policies/nominatim/ (unchecked) |
| DC Master Address Repository (geocode) | maps2.dcgis.dc.gov `DCGIS_APPS/DCGIS_MAR/GeocodeServer` | origin echoed | point for a District address | score 80 or more; point inside the District | opendata.dc.gov/pages/terms-of-use (opened, 200) |
| FCC census block lookup | geo.fcc.gov `/api/census/block/find` | `*` | block, county, state codes | 15-digit block, 5-digit county, block starts with county | geo.fcc.gov/api/census/ (opened, 200) |
| FEMA flood zone | hazards.fema.gov NFHL `MapServer/28` (Flood Hazard Zones; id confirmed in the service JSON) and `/3` (FIRM Panels) | origin echoed | zone, subtype, SFHA flag, base flood elevation; effective date of the panel with the same DFIRM id | zone must be a known FEMA code; no feature is "no FEMA map covers this location" and is never shown as a zone; -9999 elevation is blank | fema.gov flood map pages (unchecked) |
| DC property record | maps2.dcgis.dc.gov `DCGIS_DATA/Property_and_Land_WebMercator/MapServer/40` (Owner Polygons, common ownership layer) | origin echoed | lot (SSL), use, land area, assessment, extract date, owner of record, last sale | assessment 0 to 50 billion, land 0 to 1 billion; 0 is "no record", never a value; labelled "assessed value (county), data of <extract year>" (the layer has no tax-year field filled) | opendata.dc.gov (opened, 200) |
| DC zoning | maps2.dcgis.dc.gov `DCOZ/Zoning_MapServices/MapServer/9` | origin echoed | zone label | label must look like a zoning label; more than one zone is shown as split and left to the broker | opendata.dc.gov |
| DC building permits | maps2.dcgis.dc.gov `FEEDS/DCRA/MapServer/18` and `/17` (this and last year) by the lot's SSL | origin echoed | id, type, status, issue date, work | the SSL is plain letters, digits and spaces or no query is made | opendata.dc.gov |
| Maryland real property (SDAT) | opendata.maryland.gov dataset `ed4q-f8tm`, within 60 m of the point | `*` | account, address, use, year built, structure area, land area and unit, current assessment, last sale | the parcel is the one whose street number is the address's, else candidates are listed and nothing is picked; year 0000 is no year; land unit A or S only (acres x 43,560); assessment 0 is no record; the owner and grantor fields are not requested | opendata.maryland.gov (opened, 200) |
| Montgomery County permits | data.montgomerycountymd.gov dataset `i26v-w6bd` | `*` | permit id, type, status, dates, description | the street number is digits only | data.montgomerycountymd.gov (opened, 200) |
| Treasury 5- and 10-year | api.fiscaldata.treasury.gov `v1/accounting/od/auctions_query` | `*` | high yield of the latest note auction, with the auction date | 0 to 20 percent or rejected; inflation-protected notes excluded; term and date checked | fiscaldata.treasury.gov (unchecked) |
| SOFR | markets.newyorkfed.org `api/rates/secured/sofr/last/1.json` | origin echoed | rate and date | 0 to 20 percent; series must be SOFR | newyorkfed.org/markets/reference-rates/sofr (unchecked) |
| Census ACS 5-year | api.census.gov `data/<year>/acs/acs5` | NOT CONFIRMED (see below) | population, households, median household income, each with its margin of error | key must be 40 hex characters; income 1,000 to 10 million; margin over 30% of the estimate is flagged "unreliable"; Census's large negative "no estimate" values are blank | api.census.gov/data/key_signup.html (opened, 200) |

Treasury note: the daily par yield curve is not served by Fiscal Data (the dataset path answers 404) and
home.treasury.gov answers without a CORS header. The "average interest rates" dataset is the average on debt outstanding,
which is not a market yield. So the card shows the **high yield of the latest 5- and 10-year note auction**, labelled that
way with the auction date, and says it is not a daily market yield.

Census: without a key the API redirects to a "missing key" page, and a redirect carries no CORS header, so the success
answer's header could not be checked here (no key was available). The adapter is built to the documented response shape,
its fixtures (`census-tract.json`, `census-county.json`) are NOT recorded and say so, and a browser that cannot read the
answer reports "Census did not accept the key (or the browser could not read its answer)". **Validation plan:** the owner
enters a free key and looks up an address on a phone and a laptop; if the answer is blocked, the source moves to "Not
available from a browser" and waits for the relay (K9).

## Sources NOT used from a browser

| Source | Why |
|---|---|
| geocoding.geo.census.gov (Census Geocoder) | no CORS header: a web page cannot read it. Never called; the FCC block service and Nominatim do that job. |
| Fairfax County parcels | the county's own site paths tried (`/gisint/rest`, `/mapping/rest`, `/maps/rest`) answer 404 HTML. The county's open-data layers found through ArcGIS Hub are tagged "deprecated - do not use" (parcels, assessed values); the current tax-administration layers are keyed by parcel number with no geometry, so a point cannot find them. Hosted copies by other accounts exist but are not the county's record and are not used. |
| Arlington County parcels | `gis.arlingtonva.us` redirects (301) to a Hub page, `arlgis.arlingtonva.us` answers without JSON, and the one parcel layer found belongs to another county's account (Arlington, Massachusetts). |
| home.treasury.gov par yield curve | text/plain, no CORS. |
| DC "Zoning" / old service names | 404; the working service is `DCOZ/Zoning_MapServices`. |
| Fairfax and Arlington permits | same as parcels: no browser-readable official service found. |

Virginia addresses therefore get the place, census tract, flood zone, rates and (with a key) demographics, and a row that
says no county parcel source was available; the Open in menu reaches the county's own site.

## Not built, on purpose

- Assessed value and flood zone have no deal field, so they have no Use button. Adding a field changes the data format and
  needs the owner's yes.
- Structure area from the assessor has no Use: it does not say rentable or gross, and the two must not be mixed.
- Consent is per session, not stored per deal, because a stored consent would change the saved deal.
- Eslint is not configured in this repository (no config, not installed); the checks that ran are listed in the PR report.

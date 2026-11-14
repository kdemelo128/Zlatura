# Public data for an address, and Open in Maps and search links

Brokers can look up free public records for a deal's address and open any address, property or owner in a map or a web search, without leaving Monal.

**Open in…** One 44 px button (deal header, comp details, a contact's company, and Connect) opens a sheet of real links: Google Maps, Apple Maps, Street View, and a Google search for the address, the property name or the owner. Links open in a new tab with `rel="noopener noreferrer"`; every part is URL-encoded in one module (`app/maplinks.js`). It replaces the older "Open in Maps" items, which stay reachable.

**Public data card** on every deal, and a lookup on the Connect page: place on a map (the District's own address service for DC, Nominatim elsewhere), census tract and county, FEMA flood zone with the map's effective date ("no FEMA map covers this location" is never shown as a zone), DC and Maryland parcel and assessed value (labelled as the county's assessment, never a tax bill or a market value), DC zoning, DC and Montgomery County permits, 5- and 10-year Treasury note auction yields and SOFR (percent, with the date, 0 to 20 or rejected), and, with the broker's own free Census key, tract and county demographics with margins of error (flagged unreliable above 30%). Each row shows its source, a link and a date. **Use** appears only where a deal field fits (year built, land SF, zoning), records the source and date as the field's source, and can be undone; nothing is filled silently, and blank stays blank.

**Asks first.** One consent sheet per deal per session names the sites and says the deal's figures are not sent; a confidential deal gets a second confirm each time. All requests go through one fetch wrapper with a fixed host list (an unlisted host throws before any request), no cookies, no referrer, no redirects, a time limit, JSON only and a size cap. Two source scans pin it.

**Connect** gains "Public data (DC, Maryland, Virginia)" with each source's state (Ready, Needs a key, Not available from a browser) and a "Maps and search" row. The Census key is kept on the device only and is never in a backup (`NEVER_KEYS` in `backup.js`).

**Not available from a browser** (and why): the Census Geocoder (no CORS), Fairfax and Arlington parcels (no browser-readable official service found), the Treasury daily par yield curve (no CORS or API). The Census ACS answer could not be checked without a key; see `docs/proposals/k6-public-data.md` for the validation plan.

Tested: new `tests/maplinks.test.js` and `tests/publicdata.test.js` (every adapter on recorded responses, each sanity check given a bad value, the allow-list, the Census key absent from a backup), `tests/e2e/publicdata-flow.mjs` with no live network. Saved deal results and the golden outputs are unchanged. The `sources` entry of a figure may now carry `pub` (site, link, date); nothing existing reads it differently.

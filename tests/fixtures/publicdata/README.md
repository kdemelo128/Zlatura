# Recorded public-data responses

Small, trimmed responses recorded on 2026-11-14 from the public sources in `app/publicdata.js`, used by
`tests/publicdata.test.js` and `tests/e2e/publicdata-flow.mjs` so that no test reaches the network. Owner
names in county parcel records are replaced with invented ones. Large `fields` descriptions were removed.

`census-tract.json` and `census-county.json` are NOT recorded: the Census API needs a key, and none was
available. They follow the documented shape of an ACS 5-year table response, with invented figures.

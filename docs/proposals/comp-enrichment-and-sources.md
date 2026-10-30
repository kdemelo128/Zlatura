# Comp enrichment and other comp sources

Designer proposal, 2026-10-30, on main at 4.7.74 (`5139b2d`). Docs only:
nothing is built. The owner approves before any PR starts.

**The asks.** (1) When a comp report leaves a field blank (zoning, parcel,
lot size, year built, flood zone, owner, last sale), the Comps tab should be
able to look it up online. (2) Comps should load from sources other than
CoStar: LoopNet, Crexi, Reonomy, RCA/MSCI, MLS or broker exports, county
sales records, and the firm's own spreadsheets and PDFs.

**The answer in one line.** Build the second ask first. A generic comp
importer with a mapper uses only readers we already have and sends nothing
over the network. A county's own sales or assessment export, read through
the same importer, also fills blanks with no network at all. Online lookups
come after that, one proven government source at a time. Each looked-up
value is staged behind a **Use** tap with its source and date. It is never
filled on its own, never overwrites what the report says, and is never
looked up for a confidential deal. No new library is needed.

## 1. What exists today (read first)

| Piece | Where | What it means here |
|---|---|---|
| CoStar reader | `app/costar.js` (`splitComps` :27, `parseComp` :210, `applyRules` :446, `loadComps` :554) | Unchanged by this proposal; golden covers it (`tests/tools/golden.mjs:184`). |
| Blank = `null` | `costar.js:56,72-76,278`; hand comps start all-`null` (`ui.js:621-627`) | A field the report lacks is `null`, never 0. Enrichment is offered only for `null` fields. |
| Comp set rebuild | `ui.js:206-233`: comps are re-parsed from the stored report text (`state.docs`), then `state.edits[key][field]` is laid over them; key = `file::name` | A **Used** looked-up value becomes an ordinary edit, so the rebuild, the exports and the zoning FAR flags (`ui.js:250-262`) work unchanged. |
| Hand comps | `state.manual`, `store.compToJSON/compFromJSON` (`store.js:717-730`) | Imported comps live here, carrying an `origin` instead of "entered by hand". |
| Project file and session | `saveProject` `ui.js:863`, `store.readProject` `store.js:733` (keeps only `docs, edits, manual, subject, windowMonths`), the session save `ui.js:808` | New keys need a project version step (section 5). |
| Drop routing | `handleFiles` `ui.js:685-693` takes only `.json` and `.pdf` on Comps ("Those are not PDFs") | CSV and Excel files go to the importer. |
| File plumbing | `filekind.checkUpload` (size, sniffed bytes, zip guard `LIMITS` :8), `sheetread.readGrids/csvRows/detectDelimiter`, `textfile.readText`, `pdftext.pdfPages` + `layout.js`, `ocr.js` (on request) | All reused; no new reader engine. |
| Zoning FAR | `app/zoning.js` (DC catalogue, Montgomery County codes) | A looked-up zoning **code** feeds this table; a description never does. |
| Network guard | `ai.js:29-55` `blockReason` (confidential refuses, a storage read error refuses); `tests/repo.test.js:79-86` (no literal `fetch('https://…')` in `app/`) | The lookup guard copies this pattern. The test is narrowed to one module and one registry. |
| Records pull design | `platform-expansion.md` 3b.2 (`app/records/sources.js`, fixed hosts, the web-page tier, `deal.records`), 2.1 (connector contract), 5 (do not build) | Comp enrichment **is** that registry used from the Comps tab. It is designed once, here, for both. |
| Research route | `server/` `/api/research`: broker-supplied text only, quote-checked claims, 365-day sweep (`research.js:5,146`) | Lookups are not AI and never go to the model. The retention sweep pattern is reused. |
| D3a registry | `underwriting-evolve.md` section 8 (approved; P1 not yet built) | It is per deal. Comp files get a `comps` type there when P1 lands, so "Start from documents" routes them here. Nothing here waits for it. |

## 2. Part A: online enrichment

### 2.1 What can be had, and from where (government and open sources by default)

Live probing from the build container was refused by its proxy (HTTP 403 for
all four hosts tried). Every **CORS** and **rate** cell below is therefore
UNVERIFIED until C3's browser test records it.

| Source | Fields | Coverage | Endpoint style | Terms | Rate | CORS from the page | Cost | Address-match risk |
|---|---|---|---|---|---|---|---|---|
| US Census Geocoder | normalised address, lat/lon, county FIPS, tract | US | REST GET `onelineaddress`, `benchmark` required [1] | US government work (public domain) | not published (UNVERIFIED) | UNVERIFIED | free | **High for parcels:** points are interpolated along street ranges, so they often fall in the road. Use the point to find the county and an approximate flood answer, never to pick a parcel. |
| FEMA NFHL | flood zone, SFHA yes/no, FIRM panel, effective date | Mapped US areas (some unmapped) | ArcGIS REST MapServer `query` [2]; the layer id for Flood Hazard Zones must be confirmed from the service's layer list (UNVERIFIED) | federal data; terms page not found [2] | UNVERIFIED | UNVERIFIED | free | **Medium:** a parcel can lie partly in two zones. Query with the parcel outline when we have one; otherwise label the answer "approximate, from the street point". |
| County or city GIS parcels (DC DCGIS, MD iMAP and SDAT, Montgomery, Fairfax, Arlington, PG) | APN, situs address, recorded land area, year built, owner of record, last deed date and consideration, assessed value | One county at a time | mostly ArcGIS REST or Socrata (`platform-expansion.md` 3b.2) | per county: DC says CC0 unless noted; others UNVERIFIED | per host | ArcGIS servers usually send CORS (UNVERIFIED per county) | free | **Medium:** condos, address ranges ("1201-1215"), and several parcels at one address. |
| County or city zoning layers | zoning code (and description, kept separate) | **Patchy.** There is no national zoning API. Many counties publish a zoning layer; many towns do not. | ArcGIS REST | per county | per host | as above | free | **Split-zoned parcels.** Use the parcel outline, which can return two zones, and ask. |
| USGS (elevation point service) | ground elevation | US | REST GET | public domain | UNVERIFIED | UNVERIFIED | free | low; nice-to-have only |
| State open data (MD SDAT CSV, DC CAMA) | assessment, sales | statewide | **bulk download** | as published | n/a | n/a (a file) | free | matched by APN offline |
| OpenStreetMap Nominatim | geocode | worldwide | REST GET | ODbL (share-alike on derived databases); max 1 request a second, identifying User-Agent, no heavy use [3] | 1/s | yes, reportedly | free | **Not used** (section 4) |
| Paid parcel APIs (Regrid, ReportAll, LightBox, Zoneomics) | parcel, standardized zoning | national | token API | contract; Regrid's standardized zoning is on a higher tier only [6] | per plan | token in browser UNVERIFIED | per record | later, permissioned only (2.3) |

**Coverage is stated, never implied.** Each registry entry lists the
fields its county supplies, and the result card says what was and was not
found: "Parcel 0123 found in Arlington County records. This county publishes
no zoning layer we can query: open the county zoning map." or "Flood zone: no
FEMA map covers this location" (never shown as "Zone X"). The fallback is the
platform web-page tier: a button opens the official page in the broker's own
browser; the app never fetches or parses it.

### 2.2 What we must not do

- Scrape a page whose terms or robots.txt forbid it; fetch or parse county
  pages that have no API; loop over addresses on such a site.
- Log in to a paywalled or account site for the broker, or borrow another
  app's credentials.
- Use CoStar, LoopNet, Crexi, Reonomy or RCA data outside their licences, or
  pull more than the broker's own licensed export. Their report content is
  never sent anywhere; only a comp's **address or parcel number** is, and
  whether even that fits the CoStar licence is decision 6.
- Store or redistribute licensed data beyond its terms. The project-save
  warning (`ui.js:878`) widens to name every source in the set.
- Invent a value: no zoning from a description, no lot size from geometry,
  no price from $/SF.
- **Permissioned path.** A licensed API the firm holds its own credentials for
  (Regrid, Reonomy, an MLS feed) becomes a connector under the
  platform-expansion 2.1 contract: terms reviewed and recorded (`terms.url`,
  date checked), credentials on the relay never in the page, storage and
  retention per the contract, each connector its own gate (cost, terms,
  security).

### 2.3 Data integrity rules

- **Staged, never auto-filled.** Each looked-up value is a *candidate* beside
  the blank field with a **Use** tap, offered only where the comp's field is
  `null`. Where the report has a value and a source disagrees, the report's
  value stays and a **Sources disagree** row lists both with sources and
  dates; changing it is a deliberate hand edit, as today. Two sources that
  disagree are shown side by side; the app never picks one.
- **Every candidate carries** its source id and label, the endpoint (no key
  in it), when it was retrieved, the source's own as-of date (FIRM effective
  date, assessment year), how it matched (parcel, address or point), a
  confidence word (exact, likely, approximate) and when it expires.
- **Matching asks, never guesses.** The report's own APN is tried first
  (exact). Next the county's situs address, normalised for matching only
  (the displayed address never changes): one hit is "likely". Two or more
  hits (condos, multi-parcel sites, ranges) give a pick list with "None of
  these"; zero hits says so. Portfolio comps (`c.portfolio > 0`) are never
  looked up.
- **Units never confused.** Land area is offered in the source's unit (acres
  to `lot_ac`, SF to `lot_sf`); a converted figure is labelled "from 1.25 AC
  (43,560 SF per acre)" and needs its own tap. Area computed from the parcel
  outline is geometry, not the recorded lot, and is never offered. The
  assessor's building area is gross or living area and is **never** offered
  into building SF (rentable on CoStar comps; Part 21.2): reference only.
  Zoning: the code goes to `zoning` (feeds the FAR table); the description
  is display text; an unknown code keeps today's "not in the Zoning
  Catalogue" flag. Year built is the actual year, never the effective year.
  The last sale's consideration is reference only, never the price
  (decision 7).
- **Never looked up:** price, cap rate, occupancy, building SF, rent.
- **Freshness.** An unused staged candidate expires after 30 days and is
  fetched again on request. A used value keeps its provenance; after 12
  months it shows "looked up more than a year ago: check again", never
  refreshed silently.
- **Untrusted input.** JSON only, checked field by field against the
  registry schema; strings capped at 200 characters and rendered with
  `textContent`; no URL from a response is opened or fetched; 1 MB cap,
  15-second timeout; an error shows its message and the next step.

### 2.4 Privacy and security

- **What leaves the device:** only the comp's street address, city, state
  and ZIP or its parcel number (plus a point or parcel outline for flood and
  zoning). Never the deal, subject, client or price. One comp per tap;
  "Look up blanks for all comps" goes one at a time with progress, at most
  1 request a second per host.
- **Consent.** Settings → **Public-record lookups**, off by default. The
  first lookup opens a sheet naming each host and exactly what is sent, with
  "Don't ask again for this source" (the AI confirm-sheet rule, checklist
  item 30).
- **Confidential.** A confidential deal's address is refused with the
  `ai.js:20` wording. The comp set has no deal link today (`useAsSubject`,
  `dealui.js:2542`, copies only figures), so the subject gains
  `fromConfidential: true`; while set, every lookup in the comp set is
  refused, and a storage read error refuses too. No per-deal override in the
  first version (decision 5).
- **Allow-list.** Only `app/records/lookup.js` may `fetch` another site, and
  it builds every URL from a constant registry entry (host, path, allowed
  parameters), never from typed text or a response. `repo.test.js:79` is
  narrowed to that, and a second test pins the host list. The meta CSP has
  no `connect-src` (`index.html:9`) and a static one can't list the
  broker-set AI server, so the allow-list lives in code and tests; F4 must
  keep the registry hosts if it adds `connect-src`. Any new host is an
  approval gate (network and CSP).
- **Proxy only where CORS is missing:** `POST /api/lookup` on the existing
  AI server. The app sends `{ source, query }`; the server builds the URL
  from its own registry copy, refuses URLs and other keys (400), forwards a
  GET with a fixed User-Agent, caps size and time, returns only schema
  fields, logs no address, stores nothing, and uses the per-device rate
  limit (`index.mjs:102`). No model call, no AI budget, no key in the
  browser (government sources need none; paid ones stay on the relay).
  Lookups never reach a model, so prompt injection does not apply; response
  text never enters an AI prompt except as broker-supplied evidence under
  B1's rules.
- **Caching and retention.** `lookup.cache` (kv) holds only extracted
  fields, keyed by source and normalised query, 30 days, swept on launch like
  `research.briefs`, not backed up. Used values travel with the comp set
  (session, project, backup).

## 3. Part B: comps from other sources

### 3.1 The generic importer (`app/compimport.js`, pure; UI in `app/compimportui.js`)

- **Reading.** Every file passes `filekind.checkUpload` first. CSV/TSV:
  `textfile.readText`, `detectDelimiter`, `csvRows`. Excel: `readGrids`
  (hidden sheets off; row cap 2,000 for comps). PDF: `pdfPages` +
  `layout.js`, only when a **profile with a layout guard** recognises it (the
  #45 rent roll pattern); OCR only on request. A zip only past `filekind`'s
  guard, file by file.
- **Profiles** are frozen objects `{ id, label, kinds, match (header
  synonyms, required columns), columns, units, statusMap, guard }`. Shipped:
  `zlatura-template`, our own comp CSV/Excel layout, downloadable from the
  importer (a zero-risk first profile the firm's spreadsheets can move onto).
  Vendor profiles (LoopNet, Crexi, Reonomy, RCA/MSCI, MLS, DC/MD/VA county
  sales exports) ship only once the owner puts a real export in
  `private/comps/`; a local tool reports its header row and counts only, and
  the test uses an invented file with that layout. No column list is guessed
  from marketing pages (decision 9).
- **"Map your own file".** With no profile match, each column shows three
  sample cells and a field picker, with units, sale-or-asking and kind
  questions inline. The mapping is stored as `comps.mappings[fingerprint]` =
  `{ source (broker's label), columns, units, savedAt }`, fingerprint = SHA-256
  of the sorted, normalised headers, so the layout is recognised next time
  ("Mapped as *Crexi export*, used 3 times"). Header synonyms take ideas from
  RESO Data Dictionary names [5]; nothing is copied.
- **Honest refusal**, with the reason: no header row, two candidate header
  rows, a required column missing (address, plus price or status), or a PDF
  no profile guards ("This PDF's layout isn't one Zlatura knows. Export it as
  CSV or Excel, or map it."). Nothing is half-imported. The preview lists
  every row with a check per problem (`dataqc.js` levels); one **Import** tap
  with Undo (the snapshot and toast, `ui.js:650-663`).

### 3.2 Meaning guards (Part 21.2)

| Risk | Rule |
|---|---|
| Sale price vs asking | The kind comes from a status column (Sold/Closed → sale; Active/For sale/Under contract → listing; via `statusMap`). A bare "Price" with no status asks once per file. A listing export's price is asking, so the comp goes to On Market. |
| Cap rate as decimal or percent | All values ≤ 1 → ask "0.065 means 6.5%?". Mixed (some ≤ 1, some > 1) → a failed check, never guessed. Above 25% → warn. A cap rate is never worked out from NOI and price. When a file gives all three, they are checked against each other as independent figures (warn above 0.25 points). |
| Price from $/SF | Never derived. A reported $/SF is kept as `reported_ppsf`, the way `costar_ppsf` is, and checked against price ÷ SF (warn above 1%). |
| Land SF vs acres | The unit comes from the header ("AC", "Acres", "SF"). With no unit, the app asks. A value under 100 with "SF" warns. |
| Building area basis | The mapper asks rentable, gross or unknown; stored as `bsf_basis`. Comps that aren't rentable are shown and badged, and are left out of the $/SF basis until the broker confirms (decision 8). CoStar comps are rentable. |
| Monthly vs annual, rent | Sale comps carry no rent. Rent columns are ignored with a note (lease comps are platform M7). |
| Thousands, millions | "$12.5M", a "(000s)" header and a "$ in thousands" note are scaled the way the OM roll reader does (#41). Money goes through `toCents` (`engine/money.js:22`). |
| Dates | Excel serials are read as dates. When every day in the file is ≤ 12, a dd/mm vs mm/dd ambiguity asks once. |
| Blanks | Empty, "-", "N/A", "Undisclosed" or "Not disclosed" become `null`, with a note. A price of 0 is kept and flagged, as on CoStar comps (golden `$0-price` row). |
| Counted twice | See dedup (3.3). A portfolio row and its parts follow the `applyRules` portfolio rule (`costar.js:474-480`). |

### 3.3 Dedup against the set

A pure `dupeOf(newComp, existing)` scores parcel overlap, normalised
address with city or ZIP, sale date within 31 days and price within 1%. A
parcel match, or address + date, is "probably the same sale": the preview
shows "Already in the set as *X* (from costar-dc.pdf)" with **Skip**
(default), **Add anyway**, or **Use its blanks** (the new file's values for
the existing comp's `null` fields become staged candidates in the same Use
and conflict UI). The same address six months or more apart is a resale: both
kept, nothing asked. This is how a downloaded county sales export fills
blanks with no network (the platform R0 bulk tier).

### 3.4 Provenance on each comp

`comp.origin = { kind: 'costar' | 'import' | 'hand', source (≤ 80), file
(≤ 200, cleaned as `downloadName`), sha256 (R3 fingerprint) | null, sheet |
null, row | null, page | null, profile | null, importedAt }`. The detail
panel's "Source" row (`ui.js:972`) shows it, for example "Crexi export
(crexi-oct.csv, row 14)". The chip replaces "by hand". CSV and Excel exports
gain one "Source" column (the export guards already neutralise formula
cells).

## 4. Prior art (capped: 8 searches, 2026-10-30; endpoint probes refused by the container proxy)

Already vendored and enough: pdf.js, ExcelJS, fflate and tesseract.js (`THIRD_PARTY.md`). CSV parsing, the
zip guard, text decoding and staging are our own. No new library is needed.

| Candidate | What it does | License | Size | Last release, maintenance | Build-free, vendored, offline | Network, telemetry | Security notes | Verdict |
|---|---|---|---|---|---|---|---|---|
| Census Geocoder [1] | US geocoding, county FIPS | public domain (US government) | service | doc updated 02/2026 | n/a (a service); recorded responses offline | sends the address to census.gov | free, no key | **Adopt as a source** (C3) |
| FEMA NFHL MapServer [2] | flood zones by point or polygon | federal data; terms page not found | service | maintained; URL path moved before (`/arcgis/` → `/gis/nfhl/`) | n/a | sends a point or outline | confirm the layer id and path at C3 | **Adopt as a source** (C3) |
| OSM Nominatim [3] | geocoding | ODbL data | service | active | n/a | 1 request a second, identifying UA, no heavy use | share-alike risk for a stored comp set | **Do not use**; Census covers the US |
| `@esri/arcgis-rest-request` [4] | ArcGIS REST client | Apache-2.0 | UNVERIFIED | active | ESM build exists | none of its own | we need one GET with `URLSearchParams` | **Build ourselves** (about 30 lines); ideas only |
| `parse-address` (npm) | US address parsing (port of Geo::StreetAddress::US) | ISC | small | 1.1.2, old | yes | none | regexes would need a ReDoS review (checklist 8) | **Build ourselves** from the USPS Pub. 28 suffix table (public domain); copying code would be an approval gate |
| `us-address-normalization` | normalise and hash US addresses | MIT (per listing, UNVERIFIED) | UNVERIFIED | UNVERIFIED | UNVERIFIED | none | unreviewed | Ideas only (match key) |
| RESO Data Dictionary [5] | real estate field names and definitions | EULA (commercial terms UNVERIFIED) | spreadsheet | DD 2.x active | n/a | none | n/a | **Ideas only** for header synonyms; nothing copied |
| National Zoning Atlas [7] | standardised zoning by jurisdiction | no third-party download mechanism yet (per its media page, maybe out of date) | n/a | active | n/a | n/a | n/a | **Not usable**; watch |
| Regrid parcel API [6] | national parcels, standardized zoning (higher tier) | contract | service | active | n/a | token; per-record billing | terms on storage UNVERIFIED | **Later**, permissioned connector (C6) |

## 5. Data shapes and where they are stored (data-format gate)

```
comp.origin   (3.4)                              // on imported and hand comps; CoStar comps get kind 'costar'
comp.bsf_basis: 'rentable'|'gross'|'unknown'     // imported comps; CoStar = 'rentable' implied
comp.reported_ppsf: number|null                  // as the file states it; never used as a price
comp.flood, comp.owner_record, comp.last_sale    // reference fields, only when the broker taps Use:
  flood = { zone, sfha: bool, panel, effective }   last_sale = { date, consideration_cents, doc }  (display only)
session.enrich = { v: 1, byComp: { [compKey]: { [field]: Candidate[] } } }
Candidate = { id, field, value, unit, display, source, endpoint, retrievedAt, asOf|null,
              match: { by: 'parcel'|'address'|'point', confidence: 'exact'|'likely'|'approximate', note },
              expiresAt, state: 'staged'|'used'|'dismissed' }      // at most 20 per field, 2,000 per set
subject.fromConfidential: bool                   // set by useAsSubject
kv comps.mappings  (in backups)                  kv lookup.cache  (not in backups, 30 days)
```

**Used** writes `state.edits[key][field]` (the existing overlay); the
candidate stays as `used`, which is the provenance. **Project files:**
`store.VERSION` 1 → 2 and `readProject` passes `enrich` through, so an older
app says "made by a newer version" instead of silently dropping provenance on
re-save (today it keeps only five keys). Version 1 projects, sessions and
backups open unchanged with nothing added; an old-project fixture (4.7.74)
proves it. No deal changes, so no `migrate.js` step: the comp set is not a
deal.

## 6. Tests (invented fixtures only; no live network in CI)

- **`compimport.test.js`:** profile detection and the two-header refusal;
  every 3.2 row both ways (decimal cap asks, mixed caps fail, bare price
  asks, no price from $/SF, acres vs SF asks, rent ignored, "(000s)" scaled,
  dd/mm asks, "Undisclosed" → `null`, $0 flagged); dedup (same sale, resale,
  parcel-only); provenance shape; mapping fingerprint re-use; `__proto__`
  headers; the 2,001-row cap; a formula cell kept as text and neutralised on
  export.
- **`lookup.test.js`** (global `fetch` stubbed to **throw if reached**
  unless a fixture is installed): unregistered host or extra parameter
  refused; consent off, a confidential subject or a storage error → no
  fetch; Use only on `null` fields, a report value + source value → conflict
  row, never overwrite; two hits ask, zero hits say so, portfolios skipped;
  acres/SF labels, geometry area never offered, assessor area never reaches
  `bsf`; a point-based flood answer labelled "approximate", a parcel across
  two zones lists both, "no FEMA map" never reads as Zone X; 30-day expiry
  and 12-month stale; oversize, timeout, HTML-in-string; cache sweep.
- **Recorded responses** copy each source's response *shape* (from its
  documentation or one manual capture of a public landmark) with every value
  invented and no comp address; in `tests/fixtures/lookup/`.
- **`repo.test.js`:** only `lookup.js` fetches another site; hosts equal the
  registry's.
- **Browser flows:** `comps-import-flow` (drop a CSV, mapper,
  character-by-character typing in mapper and source-name inputs, preview,
  Import, Undo, re-import recognised) and `comps-lookup-flow` (`page.route`
  serves fixtures and **fails on any unrouted request**); Chromium at phone
  and desktop sizes, axe (Use and conflict rows labelled, picks reachable by
  keyboard), 150 ms per edit.
- **Server** (only if the proxy is approved): `/api/lookup` refuses URLs and
  unknown keys, caps size and time, logs no query, is rate-limited; upstream
  stubbed.
- **Fails on old code:** every new test fails on `git archive origin/main`
  (dropping a CSV says "Those are not PDFs"; the lookup module is absent).
- **Mutation checks**, each must fail a test: remove the decimal-cap
  question; let Use fill a non-blank field; drop the confidential refusal;
  accept acres as SF; let `bsf` take the assessor's area; widen the
  allow-list.
- **Golden:** both identical (CoStar path untouched; nothing used without a
  tap).

## 7. Phased build (one PR each)

| PR | What | Size | Gates | Needs |
|---|---|---|---|---|
| **C1 (first)** | Generic importer + "map your own file" + the `zlatura-template` profile, dedup preview, provenance, CSV and Excel drop routing on Comps, project v2 | M-L | **data format** (5); security review (file handling); no network | decisions 1, 2, 8 |
| C2 | Staging UI (Use, conflict, dismiss) driven by a second imported file ("Use its blanks"); county bulk sales and assessment exports as profiles (DC CAMA, MD SDAT CSV) once the owner supplies samples | M | data format (`enrich`); no network | C1 |
| C3 | `app/records/sources.js` + `lookup.js`, consent sheet, confidential block, Census geocoder + FEMA flood; the browser CORS test decides direct or `/api/lookup` | M | **network and CSP**; security review; **hosting** if the proxy is needed | decisions 3-6, 10, 11 |
| C4.n | County parcel + zoning, one tested county per PR (DC first, then Montgomery, Arlington, Fairfax, PG, MD statewide parcels); each with its terms checked and recorded fixtures; the deal-page Records pull (3b.2) uses the same registry | S-M each | network (each new host); terms per county | C3 |
| C5.n | Named vendor profiles (LoopNet, Crexi, Reonomy, RCA, MLS), CSV and Excel first; PDF profiles only with a layout guard | S each | third-party terms (format only) | owner samples |
| C6 | Permissioned licensed APIs (Regrid etc.) with firm credentials via the relay | M each | **cost**, terms, security, hosting | platform X5 relay |

**Why C1 first:** it delivers the second ask in full, plus enrichment from
downloaded county files, with zero network and hosting risk, using only
readers we ship. **Cost:** about 6-8 sessions for C1-C3, then about one per
county or vendor profile. Running cost: government sources are free, no AI
tokens; a proxy rides on the existing server; paid parcel APIs are per record
(UNVERIFIED pricing) and only at C6.

## 8. Decisions for the owner (my recommendation in bold)

1. Build order: **C1 (importer, no network) first.**
2. Data format: `origin`, `bsf_basis`, `reported_ppsf` on comps;
   `comps.mappings` in backups; project files to version 2. **Approve.**
3. Lookups: **opt-in, off by default, government hosts only, address or
   parcel only, one comp per tap or a paced batch.**
4. Proxy: **`/api/lookup` on the AI server only for a source whose CORS test
   fails** (no AI cost, stores nothing).
5. Confidential: **a set whose subject came from a confidential deal refuses
   every lookup; no per-deal override in v1.**
6. CoStar-report addresses to a government lookup: **address or parcel only,
   after the firm confirms its CoStar licence allows it** (UNVERIFIED); until
   then lookups run on imported and hand comps only.
7. County recorded consideration: **reference only, never the price.**
8. Non-rentable basis: **badged and kept out of the $/SF basis until the
   broker confirms.**
9. Vendor profiles: **only from real exports in `private/comps/`, tested with
   invented copies of the layout.**
10. Nominatim: **not used** (ODbL share-alike, usage policy).
11. Retention: **staged 30 days; used values kept, flagged after 12 months;
    cache not backed up.**
12. Paid parcel and zoning APIs: **later (C6), each a contract and cost
    decision.**

## Sources

1. [Census Geocoding Services API](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html); [censusgeocode (batch limit cited)](https://github.com/fitnr/censusgeocode)
2. [FEMA flood map service page](https://hazards.fema.gov/femaportal/resources/flood_map_svc.htm); [NFHL dataset listing](https://databasin.org/datasets/b03f383818de4115b0951bfa945df773)
3. [Nominatim, OSM wiki](https://wiki.openstreetmap.org/wiki/Nominatim); [OSM help: request limits](https://help.openstreetmap.org/questions/56533/is-the-nominatim-request-limit-done-automatically)
4. [@esri/arcgis-rest-request on npm](https://npmjs.com/package/@esri/arcgis-rest-request)
5. [RESO DD 2.1 about](https://dd.reso.org/DD2.1/about/); [ClosePrice field](https://ddwiki.reso.org/display/DDW20/ClosePrice+Field)
6. [Regrid plan options](https://support.regrid.com/reference/plan-options); [Regrid Parcel API](https://regrid.com/api)
7. [National Zoning Atlas media](https://www.zoningatlas.org/media); [parse-address on npm](https://www.npmjs.com/package/parse-address); [us-address-normalization](https://www.pkgstats.com/pkg:us-address-normalization)

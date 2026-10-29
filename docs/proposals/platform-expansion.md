# Proposal: platform expansion (navigation, integrations, developer and analyst modules)

Status: **proposal, docs only, waiting for the owner's approval.** Nothing here
is built. Request (owner, 2026-10-29): tabs that don't clutter; CRM integration
with every major CRM alongside Zlatura's own; features for developers and
analysts; "whatever else you can think of", with brokers, firms, sellers,
independent investors and developers as the eventual buyers.

**In one paragraph.** Keep the five-slot phone bar. New work opens as
*sections inside a hub* (Underwrite, Comps and Market, the deal page, Settings),
and a **role setting** (Broker, Analyst, Developer, Owner) changes only what
each hub and Home show first. Integrations are designed once, as
**connectors** with one contract (import, export, field mapping, later a
two-way sync through proposals the broker approves). The first tier is files
(CSV, vCard, XLSX), which every vendor accepts and which needs no account.
The research below shows that most vendor APIs cannot be called from a page
alone. HubSpot gives no browser access; Follow Up Boss, Dotloop and SkySlope
need partner registration or a server. Only Zoho (and Salesforce, after the
firm's admin adds Zlatura to an allowlist) look workable from the device. So
the API tier depends on one hosting decision: a small, stateless relay that
the firm runs itself. The developer modules reuse what is already in `app/`.
The residual land, yield-on-cost, draw, absorption, waterfall and sensitivity
functions are in `app/calc.js:153-420`, and the DC/Montgomery zoning table is
in `app/zoning.js`. Recommended first: the nav plan (with the revamp), the
tornado and scenario compare, then the zoning catalogue and a development pro
forma. Lead-finder and due-diligence data (3b) start with open public
records imported from files; licensed people-data comes last, behind legal
review.

What this does **not** repeat (already built or planned): the Underwrite tab
and its extras E1-E10 (`underwriting-workspace.md`, approved 2026-10-23); the
revamp's bar, rail, More sheet, flags table and feature map (`ui-revamp.md`
2.1-2.3, 8); research Phases B-G, C2's CRM adapter layer and file exchange
(C2a), and L1-L5 (`continuous-ai-relationship-intelligence.md` 9, 11a, and the
L table on `claude/relintel-alternatives`); the fee record and Fees CSV
(#86); `.ics` key dates (4.7.63); "Export everything", the confidential tag,
Bid Leveler, 7.3 pricing, the 13.1 listing copy, 17.1/17.2 companies and buyer
match, the DC/MD assessment import (feature idea 12).

---

## 1. Navigation without clutter

### 1.1 Tab map

The phone bar holds at most five items, always. Desktop shows more because
the rail has room. Both follow approved decisions: Classic per
`underwriting-workspace.md` decision 7, new look per `ui-revamp.md` 2.1 as
amended by that decision.

| Slot | Phone, Classic | Phone, new look | Desktop rail (both looks) |
|---|---|---|---|
| 1 | Home | Home | Home |
| 2 | Deals | Deals | Deals |
| 3 | Underwrite | Underwrite | Underwrite |
| 4 | Comps | Comps | Comps and Market |
| 5 | Tools (+ Review while waiting) | More | Tools |
| top bar | Settings gear, search | search | Review (while waiting), Contacts, Templates, — Workspace —, Settings |

Today's main still shows the pre-W1 bar (`index.html:263-268`). W1 brings the
Classic column above.

### 1.2 Where each new area lives

| New area | Hub | Opens as | Classic phone path | New-look phone path |
|---|---|---|---|---|
| Development pro forma, draws, capital forecast | Underwrite | section "Development" beside Quick and Sets | Underwrite → Development | same |
| Sensitivity (tornado) and scenario compare | the deal page (What if) and Underwrite → Sets | a sheet from What if | Deal → What if → Sensitivity | same |
| Zoning catalogue, site scorecard, market notebook | Comps (rail: "Comps and Market", Part 4 workspace 4) | sections "Zoning", "Sites", "Market" beside "Comps" | Comps → Zoning | same |
| Investor register and reports | the deal page or a set | section "Investors" | Deal → Investors | same |
| Connections (CRMs, transaction, PM, data vendors) | Settings | Settings → Connections | gear → Connections | More → Settings → Connections |
| Exports to other systems (CRM, transaction, marketing) | where the data is | the existing Export menu gains named targets | unchanged menus | unchanged menus |
| Contacts (built-in CRM) | as revamp | Home card / More → Contacts | Home card | More → Contacts |

### 1.3 Role setting

- `Settings → Workspace → I mostly work as: Broker | Analyst | Developer |
  Owner`. Stored in the revamp's `ui.prefs` (approved key, no new kv key).
  Default Broker. A device setting only, never a licence or permission.
- It changes three things only:
  - Home's default card order (Broker: pipeline, key dates; Analyst: recent
    underwritings, sets; Developer: projects, draws due; Owner: hold/sell, the
    investor report due);
  - which section a hub opens on (Underwrite opens on Development for
    Developer);
  - the order of the "New…" menu.
- It never hides a feature, a tab, a section or a search-palette entry. A
  test switches through all four roles and asserts the feature map
  (`docs/feature-map.json`, revamp 8.1) reaches the same set of controls in
  each. A mutation that drops one section for one role must fail it.

### 1.4 Rules

1. At most five phone bar items, in both looks. No item narrower than today's
   65 px at 390 px wide.
2. A new area is a section inside an existing hub, never a new tab. A new
   top-level tab needs the owner's approval and a removal from the bar (none
   proposed).
3. A hub shows at most five section chips. Any more go under "More sections"
   in the same hub.
4. Sections have routes (`#underwrite/development`, `#comps/zoning`). Today an
   unknown hash goes to Home (`ui.js:70-71`), so sub-routes need a small router
   change, built in the revamp's navigation phase. Unknown sub-routes open the
   hub's first section, not Home.
5. Every section is in the search palette (`app/command.js`).
6. Nothing empty ships. A section appears only when it does something; until
   then it is a flagged-off row in `app/features.js` (revamp 2.3).
7. No feature is removed or moved deeper than one extra tap from today.

---

## 2. Integrations layer, designed once

### 2.1 The connector contract

One module, `app/connectors.js`, holds a registry. Each connector is a plain
object; C2's `app/crmadapt.js` becomes the CRM family of this registry, so
nothing is defined twice.

```
{ id: 'hubspot', family: 'crm' | 'transaction' | 'pm' | 'parcel' | 'design' | 'construction' | 'investor',
  tiers: { file: { import: [formats], export: [formats] }, api: null | { host, auth, reads, writes } },
  fields: [{ ours: 'contact.email', theirs: 'Email', dir: 'both' }],   // default mapping, broker-editable
  terms: { url, checked: 'YYYY-MM-DD', allowsUserAccess: true|false|'partner' } }
```

- **Import:** the file or API rows go through the existing mapped-import
  pattern and the Review queue (`review.js`). Nothing lands without a preview,
  Data QC and Undo (`history.js`).
- **Export:** a file in the vendor's own import layout, built on the device.
  Nothing leaves the device unless the broker sends or uploads the file.
- **Mapping:** the default is per connector; the broker can edit it, and edits
  are stored in `integrations.mappings`.
- **Two-way sync (later):** every outbound change is a proposal in
  `integrations.outbox` showing the record, the old value, the new value and
  the evidence. It goes only on the broker's tap, record by record. As in C2,
  the write function refuses any call without a proposal id created by a click
  on the device. Research or imported text can never create an approved
  proposal: the AI response schemas have no action fields (as `research.js`
  does today).
- **Links:** `integrations.links` maps external ids to local ids, so a re-import
  updates instead of duplicating. Dedup is proposed, never automatic.

### 2.2 Auth, and what the research found

**Local-first rules.** No tracking and no analytics. Each API connector uses
the broker's own account: a personal API key, or OAuth signed in by the
broker. Keys and tokens live on the device in a separate kv key
(`integrations.secrets`). They are **never in backups**, the way the AI token
is kept out today (`app/backup.js:7-10,177`), and they are wiped from
Settings in one tap. Connecting an account is the broker's step, never
something a build does.

**Can a page call the API directly?** That needs two things from the vendor:
CORS for the API host, and either an OAuth flow for public clients (PKCE or
implicit) or a key the vendor allows in a browser. Where either is missing, a
server must sit in between.

| Vendor | API state and auth | Browser-only? | User's own access allowed? | Source |
|---|---|---|---|---|
| Salesforce | REST API. The org admin adds the origin to a CORS allowlist; OAuth endpoints historically not CORS-enabled. New Connected Apps restricted from Spring '26; External Client Apps preferred. API edition limits UNVERIFIED | **Partly**: data calls yes once allowlisted; token exchange UNVERIFIED | Yes, by the org's admin | [1][2][3] |
| HubSpot | Private app tokens (single account) or OAuth public apps (30-min access tokens); API keys retired 2022. APIs mostly lack CORS; HubSpot says not to put tokens in front-end code | **No** | Yes (private app in the user's own portal) | [4][5] |
| Follow Up Boss | Per-user API key (Basic auth) plus a system name and system key from a one-time registration | No (key in browser, CORS UNVERIFIED) | Yes for the key; **the system key is issued to registered integrators**: Zlatura must register | [6][7] |
| Zoho CRM | "Client-based apps" for browser-only apps: implicit flow, 1-hour token, no refresh token | **Yes**, by design | Yes | [8][9] |
| Wise Agent | OAuth 2.0 by manual request form (redirect URI reviewed); also a personal API key | No (CORS UNVERIFIED) | Key: yes; OAuth: after approval | [10][11] |
| IXACT Contact | CSV import (2,000 records a file) and CSV export; no public API found | n/a | **File only** | [12][13] |
| Lofty | Personal API key (`token` header); docs say keep keys out of client code; OAuth for third-party apps | No | Yes | [14] |
| Brokermint | REST API, key obtained by emailing support | No (CORS UNVERIFIED) | Yes, on request | [15][16] |
| Dotloop | Public API v2, OAuth 3-legged, **web-server apps only**; approval and an API licence agreement | **No** | After approval as a partner | [17][18] |
| SkySlope | Restricted docs; Client ID/secret after a signed order form; per-user HMAC keys | No | **Partner/order form** | [19][20] |
| CoStar / LoopNet | No public API; terms prohibit scraping and automated copying; enterprise data by contract only | n/a | **No** (file exports the broker is licensed to make, as `app/costar.js` reads today) | [21][22][23] |
| Deepblocks | No public API found; a web SaaS | n/a | **No API** found (UNVERIFIED: ask the vendor) | [24] |
| LandGlide | Consumer app by ReportAll USA (not Regrid); no API terms found | n/a | No API found (UNVERIFIED) | [25] |
| Regrid | Self-serve parcel API, token, billed per record (2023: $0.10-0.15 a record; current price UNVERIFIED) | Token in browser UNVERIFIED | Yes, paid; storage and redistribution terms UNVERIFIED | [26][27] |
| DealMachine | API key from developer settings, Bearer token, billed in data credits | UNVERIFIED | Yes, paid | [28] |
| Others noted | Procore: OAuth 2.0, self-serve developer portal [29]. Buildium: Open API on Premium only [30]. Yardi: Interfaces Program, annual fee per interface [31]. Juniper Square: sales-led API (UNVERIFIED) [32]. Rabbet: public API, custom implementations [33]. Northspyre: "Open API", details not public [34]. Canva Connect: OAuth with PKCE, public integrations reviewed [35]. ShowingTime, AppFolio Stack, MRI, RealPage, Sage Intacct, Autodesk, OpenSpace, Buildots, Marq: **not checked or nothing found** (UNVERIFIED) | | | |

**What a hosted piece would need.** A relay: two routes on the existing
`server/` (already a stateless, token-protected Node server, the same one the
AI routes use), not a new product.
- `/oauth/callback` exchanges a code for tokens, using the client secret the
  firm registered, and hands the tokens back to the device.
- `/relay/<connector>` forwards one call to that connector's constant host,
  with the token the device sends on each request.
- It stores no tokens, no bodies and no logs of contents. Limits, timeouts and
  the host allow-list reuse `limiter` and checklist item 23.
- **It is run by the firm for its own brokers.** Zlatura never operates a
  shared token store.
- *Cost:* a small always-on host. The AI server is not deployed yet; the price
  is UNVERIFIED (quote it before deciding).
- *Gates:* hosting (Phase 7), security (the relay sees tokens in transit) and
  data retention (none, tested by a test that greps logs for an invented
  token).

### 2.3 Order

1. **Files for every vendor** (the C2a pattern, extended past CRMs). Each one
   is a column preset on the existing CSV reader (`app/textfile.js`) and
   writer, with an invented-fixture round trip. The vendors: CSV/vCard for
   every CRM in the ask; deal summary and parties CSV for Brokermint, Dotloop
   and SkySlope (layouts per their import docs, UNVERIFIED); AppFolio,
   Buildium and Yardi rent roll and T-12 exports as reader profiles (the #46
   property-manager pattern); Procore budget export CSV; a Canva Bulk Create
   CSV plus a photo zip (Bulk Create's CSV input UNVERIFIED).
2. **Browser-only API connectors:** Zoho, then Salesforce read-only. Each is
   its own PR after its terms review.
3. **The relay** (one owner decision), then HubSpot, Follow Up Boss, Lofty,
   Brokermint and Procore read-only, one PR each.
4. **Writes through `integrations.outbox`**, connector by connector.
5. **Partner-gated** (Dotloop, SkySlope, Yardi, Juniper Square) only when a
   firm with an account asks. Each needs a signed agreement, so it is the
   owner's business decision, not a build.

---

## 3. Developer and analyst modules

Every figure goes through the existing engine and whole-cent rounding
(`app/engine/money.js`). No outside code in the money logic. Blank is never
zero: a missing input shows "can't tell".

| # | Module | What it does | Inputs → output | Effort | Usage cost | Risk | Local-first | Reuses |
|---|---|---|---|---|---|---|---|---|
| M1 | **Zoning catalogue** | Turns `zoning.js`'s fixed DC table into catalogues per jurisdiction: built-in (read-only, dated), broker-typed, or imported from a lawful file such as a city's open zoning table or the National Zoning Atlas download (licence not stated: UNVERIFIED [36]) | code, max FAR, residential FAR, height ft, lot coverage %, uses, source URL, as-of → lookup used by comps and M2; a rough envelope: lot SF × FAR, capped by height ÷ floor height × lot SF × coverage, labelled "setbacks, overlays, parking not modelled" | M | none | Area units (SF and acres are never mixed: the lot area carries its unit). **Changes which FAR a comp uses**, so it is a financial-meaning decision | yes | `zoningInfo/zoningLookup` (`zoning.js:26-41`), the mapped CSV import |
| M2 | **Feasibility and development pro forma** | One project: budget, sources and uses, construction draws, lease-up, stabilised value, returns | land, hard and soft cost lines, contingency, fees, loan-to-cost and rate, months, unit mix or SF × rent, absorption pace, exit cap → total cost, sources and uses, interest carry, yield on cost, development spread (bp), profit on cost, residual land value, unlevered and levered IRR on monthly flows | L | none | Money logic (monthly IRR, capitalised interest, how the construction loan converts to permanent) needs a designer note. Prohibited mix-ups: monthly against annual, gross against net SF | yes | `residualLand`, `yieldOnCost`, `drawSchedule`, `absorption` (`calc.js:347-420`), `irr` (`deal.js:41`), `sizeLoan` (`engine/debt.js:67`) |
| M3 | **Draw request tracker and capital forecast** | Budget lines with committed, invoiced, drawn to date, retainage, % complete, cost to complete; a draw package; forecast spend against plan, with equity and loan calls | M2's budget plus invoices and change orders the broker types or imports (Procore CSV) → draw summary, continuation sheet (our own layout; AIA's G702/G703 forms are not copied), monthly forecast, contingency used, XLSX for the lender | M-L | none | Money (retainage, contingency draw-down). Data format | yes | `drawSchedule`, `workbook.js` (ExcelJS, vendored) |
| M4 | **Site selection scorecard** | Candidate sites ranked against the firm's criteria | per site: lot SF, zoning (M1), asking price, price per buildable SF, residual land value (M2) against ask, frontage, transit and notes → pass / fail / can't tell per criterion; an optional weighted score with the weights shown | S-M | none | A weighted score is a ranking, not a value. The weights are the broker's, shown, never preset by the app | yes | E2 screening scorecard's criteria code, M1, `residualLand` |
| M5 | **Investor register and reporting** | Per deal or set: investors, commitments, contributions, distributions, capital accounts; distributions split through the waterfall; a quarterly report | contributions and distributions (dated, cents), waterfall terms → per-investor distributions, capital account, IRR and multiple per investor, printable report and XLSX. **Not** a general ledger, K-1s or payments | M-L | none | Personal data about investors (retention, the confidential tag); money logic: dated IRR per investor | yes | `waterfall` (`calc.js:193`), `irr`, E8, brief print path |
| M6 | **Sensitivity and scenario compare** | A tornado chart (each input moved ±x, ranked by effect on value or IRR) and the deal's own What-if scenarios side by side | a deal and its scenarios → tornado bars with their table; scenario columns with deltas | S-M | none | Low. No data-format change; the existing `deal.scenarios` | yes | `sensitivity` (`calc.js:153`), `runScenario` (`deal.js:166`), revamp's Sensitivity chart (4.8) |
| M7 | **Market research notebook** | Per submarket: rent observations, vacancy, absorption, pipeline, each with source and as-of date | typed, pasted or from the broker's own exports → a dated series, the median and range, and a chart. Stale values are flagged by the existing document-age rule (feature idea 5) | M | none | Comps today are sale comps (`costar.js:343`); lease and rent observations are a new record kind (data format) | yes | `stats.js`, `charts.js`, `research.briefs`'s claim citations |
| M8 | **Entitlement and permit timeline** (not in the ask; weekly for developers) | Milestones (pre-application, hearings, permits, start), owner and status, slippage against plan | dates → a timeline, "late by N days", `.ics` export | S | none | Low; dates are local dates (F6/F7 rule) | yes | `ics.js`, key-dates pattern |
| M9 | **Budget against actual for owners** (not in the ask) | An owner's T-12 against the annual budget, variance by line, and a hold/sell link | budget lines + T-12 → variance $ and %, flagged lines | M | none | Two readings of a line label: reuse T-12 suggestions, never guess | yes | `t12.js`, `t12labels.js`, E6 hold or sell |

Considered and **not** proposed as modules: field management, photo capture
against BIM, progress tracking (Procore, Autodesk, OpenSpace, Buildots: their
own hardware and data; Zlatura imports their budget export, and Field Mode
photos already exist). A general ledger or fund accounting (Yardi, MRI, Sage
Intacct: regulated and audited; export only). Showing scheduling (no
ShowingTime API found; `.ics` and a link-out instead). A design editor
(Canva and Marq do this; export a data pack instead).

---

## 3b. Lead finder and due diligence data (owner, 2026-10-29)

Three source kinds, each lawful only in its own way. One rule covers all
three: **phone numbers and contact details come only from licensed providers,
public business registries and the person's own business listings.** They
never come from scraping social media or any other site.

### 3b.1 Licensed people-data connectors (LexisNexis Accurint, TransUnion TLOxp, IDI idiCORE and similar)

**What the vendors require** (secondary sources unless noted; none was tried):
- **A contract and credentialing of the firm, not the broker alone.** TLOxp
  checks the business, its licences and its premises, and a change of address
  can trigger re-credentialing [38][39]. No idiCORE terms were found
  (UNVERIFIED).
- **A permissible purpose for every search.** GLBA covers data that comes from
  financial institutions; DPPA covers motor-vehicle records. Each search
  certifies a purpose from the vendor's list [38][41]. A five-year file
  justifying each search is the investigator guidance [40]; the firm's
  contract decides.
- **Not a consumer report.** Accurint says its products may not be used for
  credit, insurance, employment or tenancy decisions [42]. FCRA exposure has
  been litigated, settled at $13.5M [43]. Zlatura therefore refuses
  eligibility purposes (tenant or buyer screening) outright.
- **Calling and texting what you find.**
  - Federal TCPA: the autodialer definition is narrow since *Facebook v.
    Duguid* (2021) [44], but National Do Not Call and consent rules remain
    (the DNC scope for business calls is UNVERIFIED).
  - Maryland: the Stop the Spam Calls Act (from 2024-01-01) needs prior
    express written consent for automated calls and texts, sets calling
    hours, and allows at most 3 contacts per 24 hours on one subject [45].
  - Virginia: the VTPPA covers texts, requires a STOP opt-out honoured for 10
    years, and reaches Virginia area codes and residents [46]. The effective
    dates in the sources conflict (UNVERIFIED).
  - DC: not checked (UNVERIFIED). State privacy laws (Virginia CDPA, the
    Maryland Online Data Privacy Act) and their business-contact exemptions
    were not checked (UNVERIFIED). All of this goes to legal review.

**Design** (connector family `people`, same contract as 2.1):
- The firm's own contract and API key, kept on the device in
  `integrations.secrets`, never in backups. These vendors' APIs almost
  certainly need a server (UNVERIFIED per vendor), so this rides on the relay
  (X5). The relay is firm-run and stores nothing.
- **One lookup at a time, started by the broker.** No list uploads, no
  scheduled or batch searches. Each lookup opens an attestation sheet: the
  purpose is picked from the closed list in the firm's contract (eligibility
  purposes are refused), the subject is shown, and Search is tapped.
- **Audit log** `people.audit`: date and time, device label, purpose, the
  query fields, result count, vendor. It is append-only on the device,
  exported as CSV for the firm's compliance officer, and kept for the
  contract's period (the owner names it).
- **Results** `people.results`: on the device only, deleted after a retention
  limit (recommend 90 days), left out of backups and "Export everything" by
  default, and never sent to the AI server. The deal is treated as
  confidential (A6) while a result is attached.
- **No outreach by the app.** Zlatura has no dialer and no SMS sender. A phone
  number carries "check DNC and consent before calling or texting; no
  automated calls or texts". A broker who copies a number does so by hand.

### 3b.2 Public records for DC, Maryland and Virginia: a "records pull"

| Source | Records | Access | Terms on automated use | Ref |
|---|---|---|---|---|
| DC Open Data (opendata.dc.gov, DCGIS ArcGIS REST) | building permits (DOB), certificates of occupancy, Basic Business Licences and corporate registrations (DLCP), zoning, CAMA/assessment | **API (ArcGIS REST) and bulk (CSV, GeoJSON)** | dc.gov says public domain CC0 unless noted; dataset pages list CC BY: check each | [48][49][50][51] |
| DC tax and assessment (OTR) | tax bills, assessments | assessment dataset on open data; tax bill lookup is a web page (UNVERIFIED) | per page | — |
| Maryland Open Data / SDAT | Real Property Assessments (all counties), MD iMAP parcel points | **API (Socrata) and bulk CSV**; parcels via geodata.md.gov REST | terms not found (UNVERIFIED) | [47] |
| Montgomery County (data.montgomerycountymd.gov) | permits | **API (Socrata)**; exact path UNVERIFIED | UNVERIFIED | [54] |
| Prince George's (PG Planning ArcGIS) | residential and commercial permits since 2013 (DPIE) | **ArcGIS map service** | UNVERIFIED | [55] |
| Fairfax County (ArcGIS Hub, Tax Administration) | land, dwelling, legal and assessment tables | **bulk and ArcGIS** | own terms (county disclaimer page, not opened) | [52] |
| Arlington County (datahub) | real estate permits, assessments, tax rates | **API** (`datahub-v2.arlingtonva.us/api/RealEstate/Permit`) and text download | UNVERIFIED | [53] |
| Virginia SCC, Maryland SDAT entity search, professional licences (DC OPLA, MD Labor, VA DPOR) | entities, officers, licences | not checked; believed web search pages (UNVERIFIED) | per site | — |
| Occupancy limits, fire code inspection records | occupant load, inspections | not found as open data; likely a request to the fire marshal or a records request (UNVERIFIED) | — | — |

**Design.**
- On the deal page there is a **Records** section, with **Pull records for
  this address**. The broker starts it, for one address or parcel.
- A constant source registry (`app/records/sources.js`: host, dataset id,
  tier, terms URL, date checked) lists what applies to the jurisdiction.
- **API tier:** a GET with parameters only to the registry's fixed host, no
  user-supplied URL (checklist item 23). Each row is shown with its URL and
  retrieval time. The broker accepts values into the deal through Review;
  nothing fills silently. Whether these hosts allow cross-origin calls from a
  page is UNVERIFIED. If they don't, it goes through the relay.
- **Bulk tier:** the broker downloads the file and imports it. This is
  feature idea 12's mapped import, widened to permits, COs, licences and the
  Virginia counties.
- **Web-page tier:** the app opens the official page in the broker's own
  browser, prefilled where the site's own link format allows. The broker
  reads one page at a time, and pastes text or saves a PDF into the B1
  bring-your-own-sources flow. The app never fetches or parses these pages
  itself, never logs in for the broker, and never loops over addresses.
  robots.txt and the site's terms therefore hold by design.
- Stored as `deal.records` (source id, URL, retrieved at, fields accepted).
  This is a data-format gate.

### 3b.3 Social platforms

- **Only the broker's own professional account, through Meta's official
  API.** The Instagram API covers business and creator accounts only, needs
  Meta app review, and is rate-limited [56]. Its uses: post a listing's
  photos and caption (from 13.1's listing copy) and read the account's own
  insights.
- Meta's Automated Data Collection Terms (October 2024) prohibit scrapers,
  bots and crawlers without written permission [57][58]. The terms page was
  not opened: UNVERIFIED wording.
- **Never:** reading other people's accounts, private data, follower lists for
  lead lists, face recognition, or identifying anonymous people (the L5 rule
  and its test extend here). Tokens need the relay (UNVERIFIED for
  browser-only).

### 3b.4 What ships first with only open data

- R0 (rank 5): bulk-file imports of DC, MD, Fairfax and Arlington records. No
  network, no account, no relay.
- R1 (inside rank 12): the in-app records pull against official open-data APIs
  on fixed hosts. It needs only gate 5 (constant hosts), plus the relay if
  CORS is missing.
- Social and people-data come after the relay. People-data comes last,
  behind legal and compliance review.

---

## 4. Ranking, phases and gates

| Rank | Item | Size | Depends on | Gates |
|---|---|---|---|---|
| 1 | Hub sections, sub-routes, role setting (1.2-1.4) | M | revamp phase 2 (navigation), W1 | none beyond the revamp; feature-map test extended |
| 2 | M6 tornado and scenario compare | S-M | revamp chart core for the chart; the table can ship first | none (no data, no money change; golden identical) |
| 3 | File tier: exports to other systems (CRM presets on C2a, transaction CSV, Canva data pack) and PM/accounting reader profiles (AppFolio, Buildium, Yardi) | S each | C2a, fee record, #46 pattern | third-party terms per vendor (formats only); support-code check |
| 4 | M1 zoning catalogue | M | none | **data format**, **financial meaning** (which FAR a comp uses) |
| 5 | R0 open-data record imports (DC permits, COs, licences; MD SDAT; Fairfax, Arlington) | M | feature idea 12, 6.1 identity | **data format**, retention of record copies |
| 6 | M2 development pro forma | L | M1 helpful, not required | **money logic** (designer note), **data format** |
| 7 | M3 draws and capital forecast, with M8 entitlement timeline | M-L | M2 | money logic, data format |
| 8 | M4 site scorecard | S-M | M1, E2 | data format |
| 9 | M7 market notebook | M | none | data format (new record kind) |
| 10 | M5 investor register and reports | M-L | E8, confidential tag | money logic, data format, **data retention** (investor personal data) |
| 11 | M9 budget against actual | M | T-12 work done | data format |
| 12 | Connector registry, browser-only CRM connectors (Zoho, Salesforce read-only), R1 records pull on official open-data APIs | M each | C2 adapter, R0 | **third-party terms**, legal review per CRM (2026-10-22 decision 10); security (tokens on device); `repo.test.js:79` narrowed to constant hosts |
| 13 | Relay on `server/` (OAuth callback and pass-through) | L | 12, Phase 7 hosting | **hosting**, **security**, **retention**, **cost** |
| 14 | Connectors via the relay: HubSpot, Follow Up Boss, Lofty, Brokermint, Procore; Regrid or DealMachine parcel lookup; Instagram for the broker's own business account | M each | 13 | third-party terms (FUB system registration, Meta app review, parcel storage rights); **cost** to the broker (per-record pricing) |
| 15 | People-data connectors (Accurint, TLOxp, idiCORE-type) with attestation, audit log and retention | L | 13, A6 confidential tag | **legal and compliance review before anything ships** (GLBA, DPPA, FCRA, TCPA/DNC, MD and VA laws); the firm's own contract; data retention; security review |

**Phases** (rough; "session" = one main-session PR cycle on Sonnet with one
designer review where marked):

| Phase | Items | PRs | Rough time | Usage |
|---|---|---|---|---|
| X0 | 1 (with revamp phase 2) | 1-2 | 1-2 sessions | low (Sonnet) |
| X1 | 2, 3 | 5-8 | 4-6 sessions | low; no designer note needed |
| X2 | 4, 5, 6, 7 | 7-9 | 9-13 sessions | medium: designer notes for M1, R0, M2, M3 (Opus) |
| X3 | 8, 9, 10, 11 | 4-6 | 5-8 sessions | medium: designer note for M5 |
| X4 | 12 | 3-4 | 4-5 sessions | medium: security review per connector |
| X5 | 13, 14 | 4-7 | 6-10 sessions | high, plus a monthly host bill (UNVERIFIED) |
| X6 | 15 | 2-3 | 3-5 sessions after the legal review | medium, plus the vendor contract (the firm's, UNVERIFIED price) |

All of X0-X3 is local, costs no money, adds no library and needs no hosting;
R0 (rank 5) is the open-data part that ships first. X4 needs no hosting.
X5 and X6 do.

**Order relative to the queue.** This sits after the current queue in
`docs/NOW.md` and the approved A7 order (revamp foundation after the bridge,
Back button, fee, trash and password group). X1 can run alongside the revamp,
because it touches different files.

**Owner questions that are true gates** (each with my recommendation):

1. **Approve the navigation rules and role setting (section 1).**
   *Recommend: yes.* The role changes order only, and a test proves it.
2. **Zoning catalogue precedence:** when a broker's catalogue and the built-in
   DC table disagree, which FAR does a comp use? *Recommend:* the built-in one
   by default. The broker's entry wins only after an explicit "use mine for
   this code", shown with its source. Golden stays identical because fixtures
   have no broker catalogue.
3. **Where a development project lives:** a deal with an optional
   `development` block, or a separate record? *Recommend:* an optional block on
   the deal, absent by default, so `analyze()` and both golden outputs are
   untouched. It is one silent migration step with an old-backup fixture.
4. **Investor personal data (M5):** names and amounts per investor on the
   device, carried by backups, and marked confidential by default?
   *Recommend:* yes, with the confidential tag forced on for any deal with
   investors.
5. **Allow API connectors at all (X4):** this narrows `repo.test.js:79` from
   "no outside request" to "only constant hosts in `app/connectors.js`".
   *Recommend:* yes, at X4, with a test that fails on any host not in the
   list.
6. **The relay (X5):** a firm-run, stateless pass-through on `server/`. *Recommend:*
   decide with the Phase 7 hosting proposal; not before.
7. **Vendor registration as Zlatura** (Follow Up Boss system key, Wise Agent
   and Dotloop approval, Canva public-integration review). This is the owner's
   business step, with terms the owner signs. *Recommend:* only for vendors a
   paying firm uses.
8. **People-data connectors (3b.1):** build them at all, and when?
   *Recommend:* only after a written legal and compliance review covering
   GLBA, DPPA, FCRA, TCPA and DNC, and the DC, MD and VA laws. Build only for
   a firm that holds its own contract. Results are kept 90 days on the
   device, left out of backups by default, and the audit log is kept for the
   contract's period.
9. **Records pull (3b.2):** store accepted public-record values on the deal
   (`deal.records`, a data-format change), and allow fixed open-data hosts
   (gate 5)? *Recommend:* yes. R0 file imports come first; the in-app API
   pull follows in X4.

---

## 5. Do not build

| Idea | Why not |
|---|---|
| Scraping CoStar, LoopNet, Crexi, county portals behind logins, or any site whose terms forbid automated access | Prohibited by their terms [22][23]; legal exposure falls on the firm |
| Reselling or redistributing vendor data (Regrid, DealMachine, CoStar exports) to other users | Licence terms; Zlatura is not a data business (competitive-gap 10.1) |
| A Zlatura-run server holding other firms' tokens or passwords | A breach target and a retention liability; the relay is firm-run and stores nothing |
| Copying AIA G702/G703 or vendor forms | Copyrighted layouts; our own continuation sheet instead |
| Fund accounting, general ledger, payments, K-1s, trust accounting | Regulated and audited; export to the firm's system |
| Construction field management, BIM, reality capture | Their own hardware and data; import budget exports only |
| Automatic outreach or sync that writes without a per-record tap | Standing rule: the broker approves every write |
| Batch or list lookups in people-data services, skip-tracing lists, or "enrich all contacts" | Each search needs its own permissible purpose and the broker's tap (3b.1) |
| Tenant or buyer screening with people-data | FCRA consumer-report use; the vendors forbid it [42] |
| A dialer, SMS sender or auto-texts to numbers found | TCPA, Maryland and Virginia telemarketing laws [44][45][46]; standing rule against automatic outreach |
| Scraping social media, reading other people's accounts, follower harvesting, face recognition or identifying anonymous people | Meta's terms [57]; the L1-L5 decision; biometric-privacy law |
| Fetching or parsing county web pages that have no API, or logging in for the broker | Terms and robots.txt; the broker opens the page themselves (3b.2) |
| A "predicted" zoning envelope or buildable SF for a code the catalogue lacks | An invented value (Part 21.2); show "can't tell" |
| Embedding AGPL e-signature or CRM code | Licence (competitive-gap) |
| Using a vendor's partner credentials borrowed from another app | Against their terms [7] |

---

## Prior art

Repo check first (`THIRD_PARTY.md`, `vendor/`, `app/`): ExcelJS, fflate,
pdf.js and tesseract.js are vendored. The engine pieces listed in section 3
exist. No connector, OAuth or relay code exists. A capped outside search
(about 20 queries) covered vendor APIs, not libraries, because the plan adds
none.

| Candidate | What it does | License | Size | Last release, maintenance | Build-free vendored, offline | Network, telemetry | Security notes | Verdict |
|---|---|---|---|---|---|---|---|---|
| Own: `calc.js` dev functions, `deal.js` `irr`, `debt.js` `sizeLoan`, `zoning.js` | Development math, returns, loan sizing, FAR lookup | repo | in place | current | yes | none | tested, golden-covered | **Adopt** (M1-M5) |
| Own: `review.js`, `history.js`, `textfile.js`, mapped import, `ics.js`, `workbook.js` | Review, undo, file reading, calendar, XLSX | repo | in place | current | yes | none | tested | **Adopt** (connector file tier, M3, M8) |
| Own: `server/` (stateless, token, limiter) | Firm-run Node server | repo | in place | current, not deployed | server | the firm's host only | reviewed under F12 | **Adapt** for the relay (X5) |
| Platform: Web Crypto, PKCE by hand | OAuth PKCE verifier and challenge | n/a | ~40 lines | n/a | yes | none | standard | **Build ourselves** (no OAuth library needed for PKCE/implicit) |
| Zoho JS SDK | Wrapper over Zoho REST [8] | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | Zoho | new dependency | **Build ourselves** (a few `fetch` calls) |
| Hosted integration platforms (Nango, Rollout, Zapier-type) | Managed OAuth and connectors | commercial / mixed, UNVERIFIED | n/a | active | **no**: third-party hosted | they see tokens and data | third party holds credentials | **Reject**: against local-first and the token rule |
| National Zoning Atlas data | Zoning by jurisdiction (GeoJSON, CSV) [36] | **not stated** (UNVERIFIED) | per state | active | yes as an imported file | none | data, not code | **Adapt** as a broker-imported file once the licence is confirmed |
| Zoneomics API | Paid zoning API [37] | commercial | n/a | active | no | vendor | key | **Defer** (cost; the broker's own key via relay only) |

No outside code is proposed for the engine or money logic.

---

## What was verified, what was not

- **Read:** the repo docs listed in the brief (by section); `app/zoning.js`,
  `calc.js` exports, `toolsdefs.js` Development group, `index.html` nav,
  `tests/repo.test.js:79-86`, `backup.js` token rule. `docs/NOW.md` lists
  research and the CRM rules as merged or approved; their builds were not
  re-run.
- **Web:** vendor facts come from vendor docs where found, otherwise from
  third-party pages, and are marked so. **None was tried with an account.**
  Not checked: ShowingTime, AppFolio Stack, MRI, RealPage IMS, Sage Intacct,
  Autodesk Construction Cloud, OpenSpace, Buildots, Marq, PropertyWare, and
  Microsoft Dynamics. HubSpot's no-CORS statement comes from a mirror of its
  FAQ. Salesforce OAuth-endpoint CORS and the editions with API access are
  UNVERIFIED.
- **3b (added 2026-10-29):** about 10 more searches. No vendor contract,
  credentialing page or API document for Accurint, TLOxp or idiCORE was read
  first-hand. The legal points come from law-firm and vendor summaries and are
  not legal advice. Not checked: DC telemarketing rules, the VA and MD privacy
  acts, the Virginia SCC bulk data, professional licence sites, fire code
  records, robots.txt of each county site, and whether the ArcGIS and Socrata
  hosts allow cross-origin calls from a page.
- **Assumed:** the relay's host price; the vendor import layouts for the
  transaction-management CSVs; that Canva Bulk Create takes a CSV.

## Sources

1. Salesforce, CORS allowlist: https://developer.salesforce.com/docs/atlas.en-us.240.0.api_rest.meta/api/extend_code_cors.htm
2. Salesforce, Connected Apps (Spring '26 restriction): https://developer.salesforce.com/docs/platform/sfdx-dev/guide/sfdx-dev-auth-connected-app.html
3. Striim, Connected Apps and External Client Apps: https://striim.com/docs/en/salesforce-connected-apps-and-external-client-apps.html
4. HubSpot FAQ mirror, AJAX/CORS: https://legacy-hubspot-com.pages.dev/docs/faq/do-hubspot-apis-support-ajax-request
5. HubSpot, private vs public apps: https://developers.hubspot.com/blog/hubspot-integration-choosing-private-public-hubspot-apps
6. Follow Up Boss, identification: https://docs.followupboss.com/reference/identification
7. Follow Up Boss MCP server note (secondary): https://mcpservers.org/fr/servers/mindwear-capitian/followupboss-mcp-server
8. Zoho CRM JavaScript SDK: https://www.zoho.com/crm/developer/docs/client-side-sdks/javascript.html
9. Zoho, client-based apps: https://www.zoho.com/accounts/protocol/oauth/javascript-applications.html
10. Rollout, Wise Agent guide (secondary): https://rollout.com/docs/end-user-guides/crm/wise-agent
11. Wise Agent, personal API key: https://wise-agent-crm.groovehq.com/help/how-to-find-your-personal-wise-agent-api-key
12. IXACT, exporting contacts: https://services.ixactcontact.com/help/Contacts/Exporting_Contacts.htm
13. IXACT, self-serve import: https://services.ixactcontact.com/apphelp/Contacts/Self-Serve_Contacts_Import.htm
14. Lofty, API keys: https://developer.lofty.com/authentication/api-keys
15. Brokermint API page: https://brokermint.com/api/ (contents not retrieved)
16. Open To Close, connect to Brokermint: https://intercom.help/open-to-close/en/articles/5388551-connect-to-brokermint
17. Dotloop public API: https://dotloop.github.io/public-api
18. Dotloop API licence agreement: https://dotloop.com/api-license-agreement
19. SkySlope API docs (restricted): https://api.skyslope.com/api/docs/openid/SkySlopeApi.html
20. SkySlope, transaction management APIs: https://support.skyslope.com/support/solutions/articles/156000366279-skyslope-transaction-management-apis
21. Supergood, LoopNet API report (secondary): https://supergood.ai/api-report-card/loopnet
22. LoopNet terms of use: https://www.loopnet.com/solutions/LoopNetTerms-of-Use
23. CoStar terms of use: https://www.costar.com/about/termsofuse
24. Refresh Miami on Deepblocks: https://refreshmiami.com/news/catching-up-with-deepblocks-as-it-prepares-to-scale-to-thousands-of-users/
25. LandGlide app listing (ReportAll USA): https://apps.apple.com/us/app/landglide-land-field-maps/id560902465
26. Regrid, self-serve API: https://regrid.com/blog/selfserveapi
27. Regrid, 2023 price change: https://regrid.com/blog/2023-parcel-data-price-change
28. DealMachine, API and data enrichment: https://help.dealmachine.com/en/articles/16819565-dealmachine-api-and-data-enrichment-what-it-does-access-and-pricing
29. Procore developers: https://developers.procore.com
30. Buildium Open API: https://developer.buildium.com/
31. Yardi, become an interface partner: https://www.yardi.com/?p=359162
32. API Tracker, Juniper Square (secondary): https://apitracker.io/a/junipersquare/integrations
33. Rabbet, May 2025 releases: https://rabbet.com/blog/product-releases-may-2025
34. Northspyre: https://northspyre.com/?p=1231
35. Canva Connect, authentication: https://www.canva.dev/docs/connect/authentication
36. Zoning Atlas data downloads: https://statezoningatlasdata.s3.amazonaws.com/index.html
37. Zoneomics zoning data APIs: https://www.zoneomics.com/pricing/zoning-data-apis
38. LegalClarity, TLOxp (secondary): https://legalclarity.org/tlo-real-name-what-tloxp-is-and-who-owns-it/
39. Internet for Lawyers, TLOxp site visit (2015): https://netforlawyers.com/content/tloxp-increases-raises-fees-monthly-minimum-site-visit-0147
40. eInvestigator, privacy-law compliance guide: https://www.einvestigator.com/navigating-privacy-laws-a-compliance-guide-for-the-modern-investigator/
41. LexisNexis, GLBA permissible uses: https://amlinsight.lexisnexis.com/bps/web20_help/AML/bsp_permissible_use_glba_c.html
42. LexisNexis, Accurint for PI tip sheet: https://risk.lexisnexis.com/-/media/files/product%20pages/brochure/lnrs_tip_sheet_accurint_for_pi%202-nxr01962-01-0618.pdf
43. Top Class Actions, LexisNexis FCRA settlement: https://topclassactions.com/lawsuit-settlements/lawsuit-news/40030-lexisnexis-pays-13-5m-fair-credit-reporting-class-action-settlement/
44. Nixon Peabody, Facebook v. Duguid: https://nixonpeabody.com/insights/alerts/2021/04/02/scotus-tcpa-autodialer-ruling
45. Kelley Drye, Maryland's telemarketing law: https://kelleydrye.com/viewpoints/blogs/ad-law-access/marylands-new-telemarketing-law-now-in-effect
46. National Law Review, Virginia VTPPA changes: https://natlawreview.com/article/key-changes-virginia-telephone-privacy-protection-act-take-effect
47. Data.gov, Maryland Real Property Assessments fields reference: https://catalog.data.gov/dataset/maryland-real-property-assessments-fields-reference
48. DC.gov, open data terms: https://dc.gov/node/939602
49. Data.gov, DC certificate of occupancy: https://catalog.data.gov/dataset/certificate-of-occupancy
50. Data.gov, DC Basic Business Licenses: https://catalog.data.gov/dataset/basic-business-licenses
51. DCGIS, DCRA feature service: https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/DCRA/FeatureServer/2
52. Data.gov, Fairfax Tax Administration land data: https://catalog.data.gov/dataset/tax-administrations-real-estate-land-data-7de95
53. Data.gov, Arlington County harvest: https://catalog.data.gov/harvest/arlington-county-data-json-harvest-source?page=2
54. Data.gov, Montgomery County residential permit: https://catalog.data.gov/dataset/residential-permit
55. PG Planning, DPIE combined permits: https://gisdata.pgplanning.org/arcgis/rest/services/Applications/DPIE_Combined_Permits/MapServer/info/iteminfo
56. Storrito, Instagram API 2026 (secondary): https://storrito.com/resources/instagram-api-2026/
57. Meta, Automated Data Collection Terms (not opened): https://www.facebook.com/apps/site_scraping_tos_terms.php
58. SocialCrawl, citing Meta's terms (secondary): https://www.socialcrawl.dev/blog/instagram-scraping-2026

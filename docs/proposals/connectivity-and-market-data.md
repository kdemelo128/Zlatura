# Connect page, automatic data logging and market data

Designer proposal, 2026-11-13, on main at 4.7.151 (`1defa63`). **Docs only: nothing is built.** The owner approves
before any PR starts.

**The asks (owner, 2026-11-13).** (1) A Connect page with tabs, a featured banner and categories of connections.
(2) "Full connectivity" with the CRMs and data software used across real estate. (3) Market data for a property,
pulled automatically. (4) The pain brokers name most: data. Log it automatically, make the database easier, and
sync with the systems they already use.

**The answer in one paragraph.** Most of the value needs no server and no money. Build three things first: a Connect
page that tells the truth about every connection; a **To file** inbox, where everything Monal reads (documents,
calendar files, email files, CRM exports) becomes linked records with their source, which you file with one tap and
can undo; and free government market data shown with its source and a sanity check. Two-way sync with cloud CRMs,
inbound webhooks, Zapier, scheduled data pulls and an API with personal keys all need a small server. That is a
hosting, money and security decision. Licensed data (comps, rents, vacancy for commercial space) needs a contract.
It cannot be lawfully scraped.

This builds on, and does not repeat: `all-in-one-research.md` (the 35-row connectivity matrix and the approved order,
"free only until items 1-17 are done"), `platform-expansion.md` 2 (the connector contract and the relay design),
`comp-enrichment-and-sources.md` (C2-C4 lookups, consent sheet, confidential block) and `ui-filler-design-language.md`
6 (a Connections screen).

## 1. What exists today

| Piece | Where | Used here for |
|---|---|---|
| Built-in CRM: contacts, tasks, activity, stages | `app/crm.js:21-98` | Where filed records land. It has no duplicate check today (`saveContact` :52 adds, never matches) |
| Deal field provenance | `deal.sources`, `sourceOf` (`app/dealfields.js:41-47`) | The source on every filed or used figure |
| Staging with *Use*, nothing used until tapped | `app/intake.js:24` (`staged`, `used`, `skipped`) | The pattern for the To file inbox |
| History and Undo | `app/history.js` (`diffDeal` :31, `applyChanges` :134) | One undo per filing batch |
| Review queue | `app/review.js:33` | Inbox items that need a decision appear here too |
| Comp importer and dedup design | `app/compimport.js`; `comp-enrichment-and-sources.md` 3.3 | Comp files from licensed services |
| Calendar file writer | `app/ics.js:55` | Calendar out; a reader is new |
| Secrets kept out of backups | `app/backup.js:7-10,183` | The same rule for connection keys and tokens |
| No outside requests | `tests/repo.test.js:79-87`; CSP `index.html:9` (no `connect-src`) | Every network row is behind a host list and a CSP change |
| AI server, token-protected, not deployed | `server/index.mjs`, `server/tokens.mjs` | The natural home for a relay, if hosting is approved |

## 2. Prior art (capped: 18 web searches, 4 npm lookups, 2026-11-13)

Live checks: from the build container, 17 of 18 API hosts were refused by the container's network policy (HTTP 403
from the proxy, not from the vendor). One host answered: Google's Calendar API returned an
`Access-Control-Allow-Origin` header that echoed the test origin (one unauthenticated request). **Every other CORS
cell below is UNVERIFIED** until a browser test from the app's own address records it.

| Candidate | What it does | License | Size | Last release, maintenance | Build-free, vendored, offline | Network or telemetry | Security notes | Verdict |
|---|---|---|---|---|---|---|---|---|
| App's own modules (section 1) | Staging, provenance, undo, CRM, comp import | MIT (ours) | in repo | current | yes | none | tested | **Adopt**: the inbox, filing and provenance reuse them |
| `oauth4webapi` | Browser OAuth with PKCE | MIT | 326 KB unpacked, 0 deps | 3.8.8, 2026-09-05 | an ES module; works build-free (not tried) | only to the sign-in host it is given | security-critical code that someone else maintains | **Adopt at K7 only, an approval gate.** Sign-in is the worst place for home-grown code |
| `@azure/msal-browser` | Microsoft sign-in | MIT | 14.7 MB unpacked, 1 dep | 5.29.1, 2026-11-12 | heavy | Microsoft hosts | vendor-maintained | **No**: far too big; the generic library above covers Microsoft's PKCE flow |
| `dropbox` SDK | Dropbox calls | MIT | 6.5 MB unpacked | 10.66.0, 2026-11-04 | heavy | Dropbox | | **No**: we need two HTTP calls |
| `@modelcontextprotocol/sdk` | MCP servers and clients | MIT | 4.5 MB unpacked, 17 deps | 1.32.2, 2026-10-23 | Node, not the page | none of its own | 17 dependencies to audit | **Build ourselves** (a read-only connector of about 200 lines). The SDK is a fallback, and a gate |
| Google sign-in script | Google token sign-in | Google terms | hosted only | n/a | **cannot be vendored**; loads from Google | Google | an outside script in the page | **Avoid**; use the standard PKCE flow if Google allows it for this client type (unchecked) |
| Zapier, Make | Automation services | services, paid tiers | n/a | n/a | n/a | your data passes through them | third-party retention | **Later, gated** (section 4) |
| Cloudflare Workers, Supabase | Hosting for a relay | services | n/a | n/a | n/a | the host sees traffic | hosting gate | **Later, gated**; the existing `server/` code is reused |

## 3. Inventory: what teams use, and what Monal can do with it

Key: **Route now** is what ships with no server: *file* (your own export), *browser* (direct sign-in, if CORS and
PKCE allow it), *relay* (needs the server), *contract* (licensed access only), *no* (never automated).
Evidence: [n] is a source found this round. "prior" means taken from `all-in-one-research.md` or
`platform-expansion.md`, unverified there. "unchecked" means not looked up.

| Category | System | Public API | Auth | Browser direct? | Licence, cost | Monal would sync | Route now |
|---|---|---|---|---|---|---|---|
| CRM | Salesforce, and the real estate CRMs built on it (Rethink, AscendixRE) | Yes, REST | OAuth; web-server flow with PKCE | Data calls once the org admin allowlists the origin; **the OAuth endpoints are not covered by that allowlist** [2]; a secondary source says the old browser flow is being retired (Nov 2026) [3] | the firm's own org; edition with API access (prior) | contacts, accounts, opportunities to and from contacts and deals (read first) | file, then browser or relay |
| CRM | HubSpot | Yes | private app token or OAuth | No: the APIs mostly lack CORS (prior); the token exchange shown uses a client secret [1] | free CRM tier (prior) | contacts, companies, deals | file, then relay |
| CRM | Microsoft Dynamics 365 | Yes | Microsoft sign-in, PKCE | Yes, per the vendor (prior) | the firm's subscription | contacts, deals | file, then browser |
| CRM | Zoho CRM | Yes | browser-only "client" apps | Yes (prior) | paid plans | contacts, deals | file, then browser |
| CRM | Pipedrive | Yes | token or OAuth | unchecked | paid plans | people, deals | file |
| CRM | Apto | No public API; no longer sold to new brokerages [5] | n/a | n/a | n/a | contacts, deals | file |
| CRM | Buildout | No developer portal; an API only on its prospecting side, with keys from sales (third-party review) [5] | key | unchecked | customers | properties, owners | file |
| CRM | ClientLook | No API found [5] | n/a | n/a | n/a | contacts | file |
| Deals and investing | Dealpath | Yes, REST, bearer token, for customers [6] | key | unchecked | customers | deals, pipeline stages | file, then relay |
| Deals and investing | Juniper Square | API docs and webhooks listed by a directory [6] | unchecked | unchecked | sales-led | investors, entities (data retention gate) | file |
| Deals and investing | Northspyre | Sources conflict; probably no public API [6] | n/a | n/a | n/a | budgets | file |
| Property management | Yardi | Interface Partner Program [7]; a fee per interface (prior) | partner | No | partner agreement | rent rolls, T-12s | file (the readers exist) |
| Property management | AppFolio, Entrata | Partner programmes [7] | partner | No | partner | rent rolls, T-12s | file |
| Property management | RealPage, MRI | Nothing found [7] | n/a | n/a | n/a | rent rolls, T-12s | file |
| Property management | Buildium | An open API on the Premium plan only (prior) | key | unchecked | Premium plan | rent roll | file |
| Property management | Rent Manager | Partner programme with an annual fee of $3,000 (third party) [7] | partner | No | fee | rent roll | file |
| Licensed data | CoStar, LoopNet | No public API; the terms forbid scraping, data mining and robots, and storing their data to build a searchable or competing database [8] | n/a | n/a | subscription | comps, from your own exports | **file; never automated** |
| Licensed data | Crexi | Partner API only; the terms forbid scraping (prior) | partner | No | partner | comps | file |
| Licensed data | Reonomy, CompStak, Cherre, LightBox, Placer.ai | Enterprise APIs (unchecked this round) | contract | unchecked | contract | comps, owners, foot traffic | file; contract later |
| Licensed data | ATTOM | Yes; the Basic Property API from $500 a month; a 30-day trial [9] | key | the key must not sit in a page | paid | parcel, tax, sales | contract |
| Licensed data | Regrid | Self-serve parcel API billed per record; a 30-day sandbox; published prices conflict ($79 to $500 a month) [9] | key | unchecked | paid | parcel, zoning | contract |
| People data | idiCORE and similar | Contract; a permissible purpose for every search (prior) | contract | No | contract | none automatically | **no** |
| Public, free | Census ACS | Yes; free key [4] | key in the address | Not stated by Census; one project used a proxy [4] | free | demographics; residential rent and vacancy | browser* |
| Public, free | Census geocoder | Yes, no key (prior) | none | disputed (prior) | free | address to county and tract | browser* |
| Public, free | FRED | Yes; free key | key | directories say yes, older reports say no [10] | free; **the terms bar storing, caching or archiving its content, and some series are copyrighted** [11] | rates (shown, not kept) | browser*, display only |
| Public, free | US Treasury yield curve, NY Fed reference rates | Yes, no key (unchecked) | none | unchecked | public | 5- and 10-year Treasury, SOFR | browser* |
| Public, free | BLS | v2 needs a free key [12] | key | a 2022 report says no CORS [12] | free | county unemployment and jobs | relay, or a file |
| Public, free | HUD fair market rents | free token (prior) | token | unchecked | free | residential fair market rents | browser* |
| Public, free | FEMA flood maps | ArcGIS REST (prior) | none | unchecked | free | flood zone | browser* |
| Public, free | County GIS, open-data portals | ArcGIS or Socrata, per county (prior) | none or app token | per county | free | parcel, zoning, assessment, permits | browser*, or a file |
| Public, free | OpenStreetMap | Yes; at most 1 request a second, attribution required (prior) | none | reportedly yes | free; share-alike licence | maps only | not stored |
| Productivity | Google Calendar, Gmail, Drive | Yes | Google sign-in; sensitive scopes need app verification (prior) | **Calendar API sent CORS (one live check, this round)** | free; needs the owner's Google project | events to tasks and activity; files to import | file now (.ics), browser later |
| Productivity | Microsoft 365, Outlook, OneDrive | Yes (Graph) | Microsoft sign-in, PKCE (prior) | Yes, per the vendor (prior) | free; the firm registers an app (approved in principle, all-in-one Q4) | mail and events to activity; files | file now, browser at K7 |
| Productivity | Dropbox | Yes | PKCE for browsers (prior; [13]) | Yes (prior) | free | files in and out | browser |
| Productivity | Box | Yes | OAuth; CORS needs allowed origins per app (prior) | unchecked | free | files | file (the `npm run box` tool exists) |
| Productivity | DocuSign | Yes; a JavaScript PKCE guide is published [13] | PKCE | unchecked | production needs a paid plan (prior) | envelope status to deal dates | later |
| Automation | Zapier | Yes | its own | n/a | free tier of 100 tasks a month; paid plans start around $20-30 a month (figures conflict) [14] | records out on a tap; in only through a server | gated |
| Automation | Make | Yes | its own | n/a | credits since 19 Jan 2026; free 1,000 a month; about $9-11 a month for 10,000 [14] | as Zapier | gated |
| Automation | Webhooks | n/a | shared secret | out: possible; **in: impossible without a server** | n/a | records out | gated |
| AI assistants | Claude (MCP) | Remote connectors on every plan (one on Free), OAuth with automatic client registration [15]; the desktop app also runs local connectors (unchecked this round) | OAuth | n/a | your plan | read deals, comps, contacts | local now; remote needs hosting |
| AI assistants | ChatGPT (MCP) | Remote HTTPS connectors only, in developer mode (third party) [16] | OAuth | n/a | your plan | as above | needs hosting |

\* *browser** means: direct from the page if the browser test passes; otherwise the row moves to *relay*.

## 4. Architecture options

| Option | What it gives | Monthly cost | What data touches a server | Risk |
|---|---|---|---|---|
| **1. Stay serverless:** files, direct browser sign-in where CORS and PKCE allow, your own keys | the inbox, files for every system, Microsoft, Dropbox, Dynamics, Zoho, free government data, local AI | **$0** | none of ours; each provider sees only its own calls | CORS unknowns; nothing runs while the app is closed; no inbound webhooks |
| **2. Small serverless relay:** a Cloudflare Worker, or the existing `server/` on a host | the OAuth code exchange (HubSpot, Salesforce if needed), inbound webhooks, scheduled pulls, a Monal API with personal keys | the relay alone: $0 on the free tier (100,000 requests a day) or $5 a month paid [17]; with a database for shared data or a webhook queue: about $25-50 a month (Supabase Pro not re-checked); paid data on top: $0 (government) to $500+ a month | tokens in transit (never stored); webhook bodies held until your device collects them (at most 7 days, encrypted); watched addresses for scheduled pulls | a hosting, security and retention gate; an always-on attack surface |
| **3. Zapier or Make as the bridge** | thousands of apps without one connector each | $0 to about $30 a month for one broker [14] | your records pass through a third party | inbound still needs option 2, or a cloud-folder drop (the automation writes a file to your Dropbox or OneDrive, and Monal reads it) |
| **4. AI connector (MCP)** | Claude or ChatGPT can answer from your Monal data | local desktop connector: $0; remote: needs option 2 | local: what you ask is sent to the AI provider, as with any chat | confidential deals; prompt injection from document text (the existing guard `app/docfacts.js:17` applies) |

**Recommended path.** Ship option 1 now: the Connect page, the To file inbox, file connectors and free government data,
at no cost. Then add direct sign-in for Microsoft and Dropbox, and a read-only local AI connector, each with your yes on
security. Keep options 2 and 3 parked until those ship, as "free only until items 1-17" says. Then decide with a written
quote. Licensed data stays a contract decision, one source at a time.

## 5. The Connect page

**Where.** Settings > Connect, the More sheet and the command palette. The five-slot phone bar is unchanged. Built
in the New look (white cards on the warm page, pill tags, 44 px targets); Classic gets the same content in its own
style. The screen idea is common to many apps; the wording and layout are our own.

**Tabs: Connections | My data.**

**Featured banner** (one card, dismissible): "Log your documents automatically. Drop an OM, a lease or a calendar
file. Monal finds the people, dates and tasks, and you file them with one tap." Action: *Try it*.

**Categories, each with a subtitle, in a two-column grid** (one column on a phone):

| Category | Subtitle | Rows at K1 |
|---|---|---|
| AI assistants | Let your AI read Monal, never change it | Built-in assistant (*Needs your key*); desktop AI connector (*Coming soon*) |
| CRM and contacts | Bring contacts in, send them back | Monal CRM (*Connected*, built in); CRM file in and out (*Import file*); cloud CRM sign-in (*Coming soon*) |
| Deals and investing | Pipelines from deal-management systems | Deal file (*Import file*) |
| Property management | Rent rolls and operating statements | PM exports (*Import file*) |
| Documents and files | Read files, fill templates | This device (*Connected*); cloud folder (*Coming soon*); e-signature (*Coming soon*) |
| Mail and calendar | Meetings and emails become activity | Calendar file (*Import file*); email file (*Import file*); mail and calendar sign-in (*Coming soon*) |
| Market and public data | Free government data, with sources | Demographics, flood, rates, county parcels (*Coming soon*, then *Connect*) |
| Licensed data | Your own exports from services you pay for | Comp exports (*Import file*); licensed data APIs (*Needs your key*, later) |
| Automation | Send records to other tools | Webhooks, automation services (*Coming soon*: needs hosting) |
| Monal API | Personal keys for your own scripts | *Coming soon*: needs hosting |

**Row anatomy.** Our own line icon (`app/icons.js`; no vendor logos), name, a one-line description, a "where it runs"
chip (*On this device*, *Uses the internet*, *Needs hosting*), and one button. Tapping a row opens a sheet with what it
reads, what it writes and in which direction, what it sends and to whom, the last sync, the records linked, its status
in the seven Part 23 words, *Disconnect and forget*, and the field mapping.

**States.** *Connected* (it works now; *Manage*); *Connect* (sign-in available); *Import file*; *Needs your key*;
*Coming soon* (no button; the sheet says what it waits for). There is no "Join waitlist": a waitlist needs a server
and a mailing list.

**My data tab.** One row per store: deals, comps, contacts, tasks, documents, templates, history, connection keys.
Each row shows a count, the size, where it lives (this device's database or browser storage), whether backups include
it (keys and tokens never), what has ever left the device and to whom, and *Export* and *Delete*. A test fails if a
store exists in `app/store.js` with no row here.

**Vendor names: not compatible with the rule as written.** `docs/working-rules.md:154` says no vendor trademark
appears "in the product, its exports or its marketing". A Connect page listing "Salesforce" or "HubSpot" breaks that
rule. So the rows above use neutral words by default. The app already names one data vendor in several places
(`index.html:118,125,131,244`, `app/command.js:61`, `app/compimport.js:63`). That is an existing inconsistency,
noted here but not changed. Question 1 asks the owner to decide both.

## 6. Automatic data logging, end to end

1. **Capture.** A document read (OM, lease, rent roll, T-12), a calendar file, an email file (.eml), a CRM export.
   Later, mail and calendar sign-in.
2. **Extract.** Candidate records: contact, company, property, deal, task, activity, comp. Each carries a provenance:
   source kind, file name, SHA-256, page or row, time read, reader version.
3. **Match.** Contacts: the same email (case ignored) is the same person; the same 10 phone digits plus a similar
   name is *likely*; a name alone is only *possible*. Properties: the same parcel id in the same county is the same; a
   normalised address is *likely*. Comps use the C2 rules.
4. **Propose.** Every candidate goes to **To file** (also counted in Review): *File*, *Merge into…*, *Skip*, or
   *File all clean* for those that match nothing and conflict with nothing.
5. **Merge rules.** A blank field fills from the new value, shown. **A typed value is never overwritten.** A conflict
   shows both values, and you pick; the other is kept under "other values" with its source. Money figures never
   file from here; they keep the existing *Use* taps.
6. **Undo.** Each filing batch is one history entry. Undo removes what it created and puts merged fields back.
7. **Optional automatic switch** (off by default): file clean new records without asking, with a daily list and
   Undo. It never merges and never overwrites.

**Data shape** (a data-format gate): kv `inbox.items` (capped at 500, expiring after 30 days); `integrations.links`
(outside id to Monal id, so a re-import updates instead of duplicating); `sources` on contacts, as deals have now;
`integrations.secrets`, never in backups. One step in `app/migrate.js`, with an old-backup fixture.

## 7. Market data

**K6 host list (built; see `docs/proposals/k6-public-data.md` for each source, its terms and the refused ones):** nominatim.openstreetmap.org, maps2.dcgis.dc.gov, geo.fcc.gov, hazards.fema.gov, opendata.maryland.gov, data.montgomerycountymd.gov, api.fiscaldata.treasury.gov, markets.newyorkfed.org, api.census.gov. The list lives in `app/publicdata.js` (`HOSTS`); the page's content policy has no `connect-src`, so the list in code is the control.

All lookups follow the C3 design (consent sheet; blocked for a confidential deal; a fixed host list in the CSP,
approved in principle as all-in-one Q2 after the browser test). A result is **shown, never filled**. *Use* puts it into
a field with its source and date.

| Field | Source (free unless noted) | Sanity check shown beside the figure |
|---|---|---|
| Population, households, median household income | Census ACS 5-year, tract and county | survey years and geography named; margin of error shown; flagged "unreliable" above 30% of the estimate |
| Residential rent and rental vacancy | ACS; HUD fair market rents | labelled **residential, monthly, per unit**; never compared with a commercial rent per square foot |
| Unemployment, jobs | BLS (relay, or a downloaded file) | month and county named; must fall between 0 and 30% |
| Flood zone | FEMA flood maps | "no FEMA map covers this location" is never shown as a zone; the effective date of the map |
| Parcel, assessment, zoning, permits | county GIS or open data, one tested county per PR (C4) | the county's own date; split zoning is asked, not guessed; assessed value labelled as such, never as the tax bill |
| 5- and 10-year Treasury, SOFR | Treasury, NY Fed; FRED shown only, not kept, per its terms [11] | the date; must fall between 0 and 20%; percent, never points |
| Commercial comps, rents, vacancy | **paid only**: your own exports today; a licensed API under contract later | the source and its licence named on the comp |

## 8. Build order (one PR each; **Y** marks an owner yes needed)

| # | Release | Test idea (each fails on the old code) | Gate |
|---|---|---|---|
| K1 | Connect page from a static list; no network | every row has an allowed state; a *Connected* row points to a module that exists; axe; no outside request; a list of vendor names fails the build until Q1 is answered | none (no data change) |
| K2 | My data tab | fails when a store has no row; the counts match invented data | none |
| K3 | To file inbox: documents become records, with dedup, provenance and Undo | an invented OM's contact is proposed; a typed phone survives a merge; Undo restores; mutation checks | **Y** data format |
| K4 | CRM, deal and PM files in and out (presets) | invented round trip; a re-import updates and does not duplicate | **Y** wording if Q1 is no |
| K5 | Calendar and email files to activity and tasks | an invented .ics and .eml; time zones; a summary that looks like an instruction is flagged | none beyond K3 |
| K6 | Free government data card | recorded responses; an unlisted host fails; each sanity check gets a bad value | **Y** security (CSP), terms per host |
| K7 | Microsoft and Dropbox sign-in | stubbed sign-in host; the token is absent from any backup | **Y** new library, security, app registration |
| K8 | Read-only local AI connector | confidential deals absent; no write tool exists | **Y** data leaves to the AI provider |
| K9 | Relay: token exchange, inbound webhooks, scheduled pulls, Monal API keys | an invented token never appears in the logs | **Y** hosting, money, security, retention |
| K10 | Automation services out, then in | | **Y** money, a third party |
| K11 | Licensed data, one source at a time | | **Y** contract, money |

## 9. Questions for the owner

1. **May the Connect page name systems in plain text (no logos) where Monal actually works with them, with a line
   saying the names belong to their owners?** *Recommend: yes. Amend rule 154 to say this, and apply the same
   answer to the existing vendor name in the comp screens.* Until you answer, neutral wording.
2. **Does the data pain move K1-K5 ahead of the rest of the approved free list?** *Recommend: yes, straight after
   the current deal-workflow PR. All five are free and need no server.*
3. **How automatic should filing be?** *Recommend: propose-only by default, with the opt-in switch for clean new
   records. It never merges, never overwrites, and money is never filed.*
4. **May a desktop AI read your Monal data (K8)?** *Recommend: yes. Read-only, confidential deals left out, and
   switched on each session.*
5. **Keep the relay and automation services parked until K1-K8 ship?** *Recommend: yes, then decide with a written
   quote (expected $0-5 a month for the relay alone).*

## Sources

1. HubSpot token exchange: [rollout.com guide](https://rollout.com/integration-guides/hubspot/how-to-build-a-public-hubspot-integration-building-the-auth-flow); [HubSpot scopes](https://developers.hubspot.com/scopes)
2. [Salesforce CORS allowlist](https://developer.salesforce.com/docs/atlas.en-us.244.0.api_rest.meta/api_rest/extend_code_cors.htm)
3. [User-agent flow retirement (secondary; the page could not be opened from this session)](https://sfdcdevelopers.com/2026/11/09/oauth-user-agent-flow-retirement-move-to-web-server-pkce/)
4. [Census ACS 5-year](https://www.census.gov/data/developers/data-sets/acs-5year.2011.html); [CitySDK proxy note](https://github.com/uscensusbureau/citysdk)
5. [Apto and Rethink options](https://apto.help.buildout.com/en/articles/8921829-integration-options-with-rethink-and-apto); [Buildout API review](https://supergood.ai/api-report-card/buildout); [CRE CRM overview](https://ascendix.com/blog/buildout-crm-alternatives-overview/)
6. [Dealpath API](https://dealpath.com/blog/dealpath-api); [Juniper Square on API Tracker](https://apitracker.io/a/junipersquare); [Northspyre](https://providers.apievangelist.com/providers/northspyre/)
7. [Yardi interface partners](https://www.yardi.com/?p=359162); [AppFolio Stack](https://www.appfolio.com/stack/become-a-partner); [Entrata partners](https://www.entrata.com/partners); [Rent Manager fees (Propexo)](https://docs.propexo.com/pms-guidance/rent-manager/approval-qa-process)
8. [CoStar terms of use](https://www.costar.com/about/termsofuse); [LoopNet terms of use](https://www.loopnet.com/solutions/LoopNetTerms-of-Use)
9. [ATTOM pricing](https://www.attomdata.com/solutions/delivery/property-data-api/pricing/); [Regrid plan options](https://support.regrid.com/reference/plan-options); [Regrid comparison (competitor)](https://landowl-marketing.pages.dev/compare/regrid/)
10. [FRED on a directory](https://apibouncer.com/apis/418/fred); [older no-CORS report](https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/20778930/http-get-federal-reserve-api-won-t-work)
11. [FRED API terms of use](https://fred.stlouisfed.org/docs/api/terms_of_use.html); [FRED legal notices](https://fred.stlouisfed.org/legal/)
12. [BLS API FAQs](https://www.bls.gov/developers/api_faqs.htm); [2022 no-CORS note](https://bunkum.us/2022/01/28/weeknotes.html)
13. [DocuSign JavaScript PKCE](https://www.docusign.com/blog/developers/how-to-set-up-javascript-oauth-authorization-code-grant-with-pkce); [RFC 10017, OAuth for browser apps](https://www.rfc-editor.org/rfc/rfc10017)
14. [Zapier pricing changes](https://automationatlas.io/answers/zapier-pricing-changes-2025-2026/); [Make pricing 2026](https://use-apify.com/blog/make-com-pricing-2026); [Make vs Zapier](https://costbench.com/compare/zapier-vs-make/)
15. [Claude custom connectors](https://support.claude.com/en/articles/11503834); [Claude connector authentication](https://www.claude.com/docs/connectors/building/authentication)
16. [ChatGPT connectors (third party)](https://zuplo.com/learn/mcp/compatibility/clients/chatgpt-connectors)
17. [Cloudflare Workers pricing (summary)](https://www.activepieces.com/blog/cloudflare-workers-pricing-2026-free-vs-paid-plans)

**What was verified, what was not.** Every vendor fact above comes from search summaries. No vendor page was read in
full, and no API was called successfully except the one Google header check. Prices are as published or as reported
by third parties on 2026-11-13. They change, and must be re-quoted at the gate.

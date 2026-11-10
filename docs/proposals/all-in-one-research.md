# All-in-one real estate platform: research, connectivity matrix and roadmap

Status: **research and proposal, docs only, 2026-11-10. Approved by the owner 2026-11-10 with the recommended
answer to all five questions (section 6): free only until items 1-17 are done; professional-first.** Nothing is built. No app code, version or test was touched.

The owner's ask (2026-11-10): Zlatura should rival existing underwriting and CRM systems, connect with the ones people
already use, and be a one-stop shop for brokers, investors, developers, home owners, lenders, sellers, buyers and
others. He named very good document reading, perfect uploads into Excel files and company templates, comp loaders, and
connections to CoStar, Crexi, Salesforce, IDI Core (people-data), LoopNet, Zillow, county records, state records,
licence holders and "everything within real estate". **Free services only for now.**

This builds on, and does not repeat: `competitive-gap.md` (module-by-module suite comparison and switch features),
`role-workspaces.md` (WS0 to WS-n, nine Homes), `platform-expansion.md` (X0-X6, M1-M9, connector contract, relay,
people-data design 3b.1, records pull 3b.2), `comp-enrichment-and-sources.md` (C1-C6), `argus-class-cashflow.md`
(A1-A10, clean room), `continuous-ai-relationship-intelligence.md` (B-G), `lease-abstract.md` (L1-L7),
`uw-filler-integration.md` (UW-1 to UW-7) and `docs/owner-requests.md`.

**How to read the evidence.** Web search was used (about 27 searches, standard mode; no vendor site was opened
directly, so every page quoted is a search summary). Review-site ratings are small samples. Where a claim came from a
vendor's own marketing or a third-party blog, the table says so. **"Not verified" means no primary source was
read.** Pricing "not verified" means the vendor does not publish it or only a third-party figure was found. Live
endpoint probes from the build container were refused by its proxy in earlier work (see
`comp-enrichment-and-sources.md` section 2.1), so every CORS cell stays unverified until a browser test records it.

---

## In one page

1. **A good all-in-one platform is not the one with the most modules.** Users of the leaders praise the data being
   entered once and reused, and complain about slow setup, rigid templates, paid add-ons and weak integrations.
   Zlatura's plan already answers most of this (local-first, no lock-in, every figure with its source).
2. **Of 35 sources and systems in the matrix, 12 can be reached free and lawfully from a browser (route a), 5 need a
   small relay or the user's own OAuth app (b), 9 are import-your-own-export only (c), 6 need a paid licence or
   partnership (d), and 3 must not be integrated automatically (e).** The big-name list the owner gave falls mostly
   in (c), (d) and (e).
3. **What cannot be done free or lawfully, plainly:** automatic CoStar, LoopNet, Crexi or Zillow data (no public API;
   terms forbid automated access; licensed or partner access only); IDI Core and other people-data (a contract, a
   permissible purpose per search, and legal review); MLS data (needs an MLS licence); production e-signature (paid
   plan). The nearest lawful substitute for each is in section 4.3.
4. **The best free value is already in the plan:** perfect template fill (UW-1 to UW-7), comp loaders (C2, C5.n),
   county and federal open data (R0, C3, C4), lease reading (L2-L7) and the cash-flow engine (A2-A10). The research
   adds a few small items: a rates panel (FRED/BLS/HUD), cloud-drive pickers, and a Salesforce/Dynamics/HubSpot file
   tier first.
5. **Breadth risk is real.** Each new persona is a new set of money-meaning gates. The recommendation is to finish
   the underwriting core and the free open-data and file paths first, and to open consumer-facing features only
   behind a fair housing review.

---

## 1. What makes a good all-in-one platform

### 1.1 What the leaders' users value and complain about, across categories

| Value (said by reviewers) | Complaint (said by reviewers) |
|---|---|
| Data entered once and reused across deal, CRM and reports | Initial setup is slow and tedious (Dealpath reviewers [2]) |
| Dashboards and views an admin can set up for less experienced staff [2] | Customisation of pages and reports is limited [2] |
| Reporting and cash-flow depth (ARGUS reviewers [1]) | Steep learning curve, hard navigation [1]; value-for-money and ease-of-use are the lowest scores [1] |
| Strong support and onboarding (Dealpath, Juniper Square) [2][4] | Integrations: payments tied to missing accounting links, CRM links "cumbersome" (Juniper Square, G2 [4]) |
| Mobile access and quick lookups (broker CRMs; general) | Weak independent review volume and prices hidden behind "request a quote" [1][2][3] |

The pattern: **depth and one source of truth win; slow set-up, rigid templates, hidden pricing and thin integrations
lose.** `competitive-gap.md` section (b) already turns this into three design rules (depth, no lock-in, fast
onboarding). This document adds a fourth: **connect through the user's own files and accounts first.**

### 1.2 By category

Leaders are named for orientation, not endorsement. Vendor trademarks stay out of the product (working rules).

| Category | Leading products (3-5) and core job | Table stakes | Differentiators | Common complaints | Typical price level |
|---|---|---|---|---|---|
| **Underwriting and cash-flow modelling** | ARGUS Enterprise (lease-by-lease cash flow and valuation); spreadsheet-add-in style tools and template packs (not verified which are leading); in-house Excel models | Lease-by-lease rent, recoveries, leasing costs, reversion, IRR/NPV, scenario compare, reports | Portfolio roll-up, model storage and audit, market-leasing profiles, speed | Learning curve, cost, sync problems [1]; Excel models: version drift, key-person risk (general) | ARGUS: not published, quote only [1]. Add-ins: not verified |
| **Deal management and pipeline** | Dealpath (deal pipeline, diligence, data capture); Buildout deal tools; spreadsheet or CRM pipelines | Stages, tasks, critical dates, documents per deal, reporting | Document AI extraction, underwriting handoff, integrations with data providers | Slow setup, limited customisation, billing before go-live, short trials [2] | Three tiers, quote only; no verified number [2] |
| **Brokerage CRM and marketing** | Buildout (OMs, flyers, listing pages, now also CRM), Apto and the other Buildout CRM products, RealNex, AscendixRE (built on a general CRM platform) | Contacts, companies, properties, deals, activity, call lists, templates | Listing marketing, buyer matching, data feeds, OM builders | Low ratings and small samples (G2: Apto 3.3 of 5 from 37; RealNex 4.1 of 15; AscendixRE 4.3 of 9) [3]; Ascendix-authored comparisons are biased [3] | Per user per month: Apto about $129, Buildout CRM about $120, REthink about $99, AscendixRE entry about $79 (third-party listings, treat as indicative) [3]; RealNex quote |
| **Investor and LP management** | Juniper Square; InvestNext; Agora; AppFolio Investment Manager; RealPage IMS; First Rate Vantage (names from review-site "alternatives" lists) [4] | Investor register, capital calls, distributions, K-1 workflow, portal, reporting | Fundraising CRM, accounting links, payments | Integrations (accounting, CRM, payments), search, calculation errors, distribution edge cases [4] | Not verified |
| **Lender and loan origination** | Commercial LOS and loan-servicing tools (named vendors not verified in this research) | Loan book, covenants, checklists, spreading, risk rating, reporting | Automated financial spreading, borrower portal | Not researched (UNVERIFIED) | Not verified |
| **Development and construction draws** | Northspyre (developer budgeting and project finance), Procore (contractor project management), Built (lender-side construction loan administration), FundControl and Sage-type draw tools [10] | Budget vs actual, draw requests, lien waivers, change orders, forecast | Lender and owner on one platform, inspection flow | Procore is contractor-side; owner-side tools feel less user-friendly to some [10]; aggregator lists only | Not verified |
| **Residential agent tools and consumer portals** | MLS-fed agent suites and the big consumer portals (Zillow, Realtor.com and others) | Contacts, lead routing, transactions, e-sign, IDX sites | Lead gen, paid placement, agent branding | Pay-to-play lead costs and data access gated by MLS licence [5][6] (general; not researched in depth) | Not verified. `competitive-gap.md` deliberately skips IDX, ads and lead funnels |
| **Property data providers** | CoStar (with LoopNet), Crexi, Regrid and ATTOM (parcels/property), Reonomy and similar (not verified) | Ownership, sales comps, listings, tenants, parcels | Researched comps, forecasts, owner graphs | Cost, licence limits, ban on automated copying [7][8]; coverage gaps | CoStar: not verified (contract). Regrid API: third-party lists $375-$500 a month plus overage; ATTOM: quote [11] |

---

## 2. Connectivity matrix

**Routes (ranked, most preferred first):**
(a) official free API, called from the browser (a* means CORS or rate rules are UNVERIFIED and a browser test
decides; if it fails the item drops to (b));
(b) official API through a small firm-run relay, or the user's own OAuth app/key (needs hosting or a user step);
(c) import of files the user exports or downloads themselves;
(d) not available without a paid licence or partnership;
(e) do not integrate automatically (terms forbid it, or legal duties such as permissible purpose apply).

**Rules for the whole matrix.** Scraping CoStar, LoopNet, Crexi or Zillow pages is against their terms and is **out of
scope**. The route for those is the user's own exports or licensed access. Keys and tokens are the user's own and
stay on the device, out of backups (`platform-expansion.md` 2.2). Every outbound call goes to a constant, registered
host (the connector contract, `platform-expansion.md` 2.1). "Terms" cells say what the source said; the app's
`terms.checked` date must be filled from the primary page when a connector is built.

| # | System or source | Official API or feed | Free tier | What the terms allow | Browser or server | Route |
|---|---|---|---|---|---|---|
| 1 | CoStar | No public API for its main products (secondary source [7]); enterprise data by contract | No | Terms bar bypassing access limits and disproportionate load; competitor access barred; full "no scraping" clause not read from the primary page [7][8]. The user's own licensed exports are the user's to use under their licence | n/a | **c** (user's own export). Automated access: e |
| 2 | LoopNet | No public API found; sits under the same group's terms | No | As row 1 (UNVERIFIED for LoopNet's own page) | n/a | **c** |
| 3 | Crexi | Listing API exists but only for large data partners (MLS organisations, big brokerages, data providers) after data and legal review [9] | No | Master services agreement prohibits unauthorised access, data mining, scraping and bots [9] | Partner-issued token; server use | **c** (user's own exports); API is d |
| 4 | Zillow consumer pages and Zestimate pages | No official public feed for general developers | No | Scraping against terms (secondary sources [5]) | n/a | **e** |
| 5 | Zillow Group data APIs (Bridge) | Yes, but gated: MLS affiliation and licence, approval by the vendor's data team (secondary sources, partly conflicting [5]) | No | Licensed use only | Server | **d** |
| 6 | Realtor.com | No public self-serve API found; B2B data partnerships; listing data comes by MLS and feed agreements [6] | No | Scraping against terms (secondary [6]) | Server | **d** |
| 7 | MLS (RESO Web API) | Yes, a standard; data rights come from the local MLS, not from RESO [12] | No (a RESO reference server with sample data exists for testing [12]) | Licence per MLS; IDX display rights are not reuse rights; access cannot be lent to third parties [12] | Server, OAuth | **d** (a broker with MLS access exports a CSV: row 16 pattern) |
| 8 | Salesforce | Yes (REST API) | A free developer org exists (the CORS allowlist is available in Developer Edition [13]; the free-org terms were not read) | User's own org and data | CORS allowlist is set by the org admin and covers the REST API; OAuth endpoints have their own CORS caveat, not confirmed [13] | **b** (a* possible per org). File tier first |
| 9 | HubSpot | Yes (private app token, or OAuth app) | A free CRM exists (not re-verified) | User's own account | APIs mostly lack CORS; vendor says not to put tokens in front-end code (from `platform-expansion.md` 2.2) | **b** |
| 10 | Microsoft Dynamics 365 / Dataverse | Yes (Web API) | Only with the user's own subscription | User's own tenant | CORS is enabled for the Web API; sign-in through MSAL.js as a single-page app [14] | **a** (the firm registers an app in its own tenant) |
| 11 | Apto, Buildout, RealNex, AscendixRE | No public API found for the first three (UNVERIFIED); AscendixRE sits on a general CRM platform [3] | No | CSV/vCard export by the user | n/a | **c** |
| 12 | IDI Core and similar | Vendor API under contract (terms not found; UNVERIFIED); per-search permissible purpose is the norm in this industry [15] | No | Firm-level contract; GLBA and DPPA permissible purpose; "non-FCRA" products may not be used for credit, employment, insurance or tenancy decisions [15] | Server | **e** (see 4.3 for the lawful substitute) |
| 13 | Other licensed people-data (LexisNexis-type, TransUnion-type) | Vendor API under contract | No | As row 12 [15] | Server | **e** |
| 14 | County and city GIS (assessor, parcels, zoning) via ArcGIS REST | Yes, per county; coverage patchy; no national zoning API (`comp-enrichment-and-sources.md` 2.1) | Yes (government open data) | Per county; usually open; some disclaimers | GET to the county host; CORS UNVERIFIED per host | **a*** |
| 15 | Open-data portals (Socrata/SODA) | Yes | Yes; an app token raises limits, the figure is not published officially [16] | Per dataset licence | Token is sent as a header or parameter; docs show browser use; CORS cited by a third party only [16] | **a*** |
| 16 | County recorder and assessor web search portals (deeds, mortgages, tax bills) | Usually web pages, some paid per page | Varies | Per site; automated crawling usually forbidden | n/a | **c** (user saves the PDF/CSV; app opens the official page, as `platform-expansion.md` 3b.2 web-page tier) |
| 17 | State real estate commission licence lookups | Web search pages; some states publish downloadable lists (not verified) | Yes (lookup) | Per site | n/a | **c** |
| 18 | Contractor and trade licensing boards | As row 17 | Yes (lookup) | Per site | n/a | **c** |
| 19 | Secretary of State business registries | Mixed: some states publish free bulk or open data; some sell bulk files; California offers an API with a key via a portal [17]; no national API found | Some | Per state | Varies | **c** (bulk files); a* where a state uses an open-data portal |
| 20 | SEC EDGAR | Yes (data.sec.gov JSON) | Yes | Fair access: about 10 requests a second at most and a declared User-Agent [18] | CORS not found in the sources; the User-Agent rule suggests a relay | **b** |
| 21 | US Census, ACS data API | Yes | Yes; free key [19] | Public data | CORS UNVERIFIED | **a*** |
| 22 | US Census geocoder | Yes | Yes; no key needed per sources [19] | Public data | A competitor claims no CORS (secondary) [19]; address-to-parcel precision is poor (`comp-enrichment-and-sources.md`) | **b** until a browser test passes |
| 23 | FEMA flood maps (NFHL) | Yes, ArcGIS REST MapServer; layer ids differ by copy [20] | Yes | Federal data; query limits not found [20] | CORS UNVERIFIED | **a*** |
| 24 | HUD User (fair market rents, income limits) | Yes, free token [21] | Yes | Public data | CORS UNVERIFIED; registration URL differs between sources [21] | **a*** |
| 25 | BLS public data API | Yes (not verified in this research) | Yes (not verified) | Not verified | Not verified | **a*** (UNVERIFIED) |
| 26 | FRED (rates) | Yes; free key; separate API terms [22] | Yes | API terms of use apply; "commercial use may need permission" is a third-party remark, check the terms [22] | CORS reported by a directory only [22] | **a*** |
| 27 | OpenStreetMap (Nominatim geocoding) | Yes | Yes | ODbL attribution; at most 1 request a second; identify the app; no bulk use [23] | CORS reported to work (secondary) | **a*** (low volume only) |
| 28 | Regrid, ATTOM and other parcel/property APIs | Yes | Trials only: Regrid 30-day sandbox, ATTOM 30-day trial [11] | Contract; storage and redistribution terms UNVERIFIED | Server or token | **d** |
| 29 | Yardi, RealPage, MRI, AppFolio | Partner programmes; one scorecard reports fees and customer-count minimums (secondary, UNVERIFIED) [24]; standard report exports are the common fallback | No | Partner agreement for API; the user's own report exports are the user's to use | Server | **c** (rent roll and T-12 exports, via reader profiles as in #46) |
| 30 | DocuSign | Yes; free developer sandbox; go-live review before production [25] | Sandbox only | Production needs an account (price not verified) | OAuth; browser use UNVERIFIED | **d** for production |
| 31 | Dropbox Sign | Yes; test mode on a free account is not legally binding; production needs a paid API plan [25] | Test mode only | As stated | Server | **d** |
| 32 | Google calendar, mail, Drive | Yes | Yes | Calendar and mail scopes are "sensitive": a public app needs verification (about 10 days); an unverified app is capped at 100 new users; testing-mode grants expire after 7 days [26] | Token model in the browser with a sign-in popup | **a** (a gate: the owner's Google Cloud project and verification) |
| 33 | Microsoft calendar, mail, OneDrive (Graph) | Yes | Yes | Delegated mail and calendar read are reported not to need admin consent, tables conflict, check the reference [27] | MSAL.js in the browser | **a** |
| 34 | Dropbox (files) | Yes | Yes | User's own files | The official SDK supports browsers with PKCE; CORS has special rules [28] | **a** |
| 35 | Box (files) | Yes | Developer account (not verified) | Not verified | CORS and PKCE not found | **b** (Zlatura's existing `npm run box` downloader covers the file route) |

**Tally by primary route: (a) 12 (4 firm, 8 with CORS unverified), (b) 5, (c) 9, (d) 6, (e) 3.** Total 35.

**Reading the matrix for the owner's named list**
- **CoStar, LoopNet, Crexi:** route c now (the CoStar PDF comp reader already exists, `app/costar.js`); route d for
  any live feed.
- **Zillow:** row 4 is out; row 5 is licensed only.
- **Salesforce:** a real free path exists for a firm with its own org (row 8), after the file tier.
- **IDI Core:** out for now (row 12).
- **County records, state records, licence holders:** the strongest lawful free area (rows 14-19, 21-27).
- **"Everything":** not possible, and the matrix says why per row.

---

## 3. What Zlatura already has, and the gaps

### 3.1 Against section 1 (per docs; nothing re-tested here)

| Capability the leaders sell | Zlatura per docs | Where |
|---|---|---|
| Lease-by-lease cash flow | Rent roll, T-12, OM readers, deal engine; the lease-by-lease cash-flow view is **not built** (A2-A10 proposed) | `argus-class-cashflow.md`, `docs/PLAN_STATUS.md` |
| Document reading | OM tables, rent roll PDF import, T-12 formats, lease reading L1-L3 (text PDFs and OCR), document learning rounds, Start-from-documents card (UW-1) | `docs/NOW.md`, `lease-abstract.md`, `document-learning-round-1.md` |
| Fill company templates | `template.js` (formulas never overwritten, dry run, audit sheet); mapping saved per template SHA-256; UW-7 planned | `uw-filler-integration.md` |
| Comp loaders | Generic importer `compimport.js`, CoStar PDF reader; C2-C6 planned | `comp-enrichment-and-sources.md` |
| Deal pipeline | `pipeline.js`, key dates, `.ics` export, tasks, activity | `competitive-gap.md` |
| Broker CRM | Contacts with roles linked to deals (`crm.js`, `dealcrm.js`); companies, buyer match not built (17.1-17.2) | `competitive-gap.md` |
| Data room and diligence | `dd.js`, `ddintake.js`, `ddui.js` | `docs/NOW.md` |
| Lender tools | Debt sizing; Lending Home exists as a workspace shell (WS0); Loan book not built | `role-workspaces.md` |
| Investor reporting | Not built (M5) | `platform-expansion.md` |
| Development | Zoning catalogue (`zoning.js`) partly; pro forma, draws not built (M1-M3) | `platform-expansion.md` |
| Consumer calculators | Tools tab (split, debt); affordability, rental pro forma, house hack not built (I1-I6) | `role-workspaces.md` |
| Research on owners | `research.js`, `claims.js`; manual brief first (B1), SEC (B2) planned | `continuous-ai-relationship-intelligence.md` |
| No lock-in | Backup JSON, workbook and CSV exports; "Export everything" proposed | `competitive-gap.md` |

### 3.2 Biggest gap per persona

| Persona | Biggest gap (per docs) | Plan item that closes it |
|---|---|---|
| Broker | Companies, buyer match, bid leveler, OM/BOV output from firm templates | 17.1-17.3, 13.1, UW-7 |
| Investor | Rental pro forma and returns on cash flow; investor register and reports | I1, A3, M5 |
| Developer | Development pro forma, draws, entitlement timeline | M1, M2, M3, M8 |
| Lender | Loan book, covenants, quote comparison; no spreading from statements into a risk view | L1, L2, L3 (workspace ids) |
| Owner-occupier / home owner | Lease vs buy, affordability; plain-language guidance with a fair housing check | O1, I5, section 5.2 |
| Seller | Seller net sheet is in the engine; a seller-facing gated listing page and activity report are not built | 13.6, 17.2 |
| Buyer | Offer comparison, due diligence checklists by property type, flood/zoning lookups | 17.3, C3, C4, D-lists |
| Property manager | Rent roll and T-12 profiles exist (#46); no budget vs actual (M9) or work orders | M9, X1 reader profiles |
| Appraiser | Comps, adjustment grids and reconciliation across approaches are thin; cash-flow valuation not built | A2-A8, C-series, role-workspaces 3.9 |
| Attorney / title | Lease abstracts, critical dates, estoppel reconciliation; no title/closing workspace or record pull | L4-L5, closing workspace, R0 |
| Tenant rep | Lease vs buy, space comparison, lease abstract, option and expiry calendar | O1, L2, L4 |

---

## 4. Prioritised roadmap

### 4.1 Principle

Free, browser-only, lawful items first; then items needing an owner decision on cost or hosting; then paid or partner
items parked. Everything below keeps the standing rules: one PR per item, golden outputs identical unless the owner
approves, whole-cent money, one engine, invented fixtures only.

### 4.2 The list (at most 20, in order)

Size: S small (one PR, a session), M (1-3 PRs), L (a phase). Cost: **free** means no money and no hosting. Gates are the
owner-approval gates in the working rules.

| # | Item | Maps to plan id | Serves | Free or paid | Gate | Size |
|---|---|---|---|---|---|---|
| 1 | Start from documents, then fill the firm's Excel template with a saved cell map per template version | UW-1 (done per docs), UW-7 = R1+T1+T4 | Broker, investor, lender, analyst | free | Money logic note; data format (mapping store) | M |
| 2 | Comp loader: staging, "use its blanks", county bulk sales and assessment profiles | C2 | Broker, appraiser, investor | free | Data format (`enrich`) | M |
| 3 | Vendor export profiles for comps (a user's own exports from the licensed data and listing services; CSV/Excel first) | C5.n | Broker, appraiser, buyer, tenant rep | free | Third-party terms (format only); owner samples in `private/` | S each |
| 4 | Lease reading: clause locators, three-way reconciliation, template-mapped abstract | L2-L5, L7 | Attorney, tenant rep, PM, lender, appraiser | free | Money note (L2); schema | M each |
| 5 | Lease-by-lease cash flow view, returns on cash flow, then profiles and recoveries | A2, A3, then A4-A7 | Broker, investor, lender, appraiser | free | A3 changes figures: before/after table, data format | M each |
| 6 | Open-data record imports by file (DC/MD/VA counties, permits, certificates, licences, entity files) | R0 (X2 rank 5) | Developer, attorney/title, broker | free | Data format; retention | M |
| 7 | Lookup registry: Census geocoder, flood map, county parcel/zoning, **plus a rates panel (FRED/BLS/HUD) with the user's own free keys**; browser test decides direct or relay | C3, C4.n, R1; rates panel is **new** (extends the C3 registry) | Buyer, developer, investor, lender | free (needs the registry host list, CSP) | Network and CSP (S2), security review, terms per host | M, then S per county |
| 8 | Security prerequisites before any outbound call | S2 CSP `connect-src`, S5-S8 | All | free | Security, owner decisions D4 | S-M |
| 9 | File tier for other systems: CRM column presets (Salesforce/Dynamics/HubSpot CSV and vCard in and out), transaction CSV, PM and accounting reader profiles | X1 item 3, C2a | Broker, PM, investor | free | Terms per vendor (formats only) | S each |
| 10 | Role workspaces beyond WS0: Lending, Investing, Occupier; consumer calculators with a fair housing and "not advice" guard | WS Lending, I1-I6, O1-O4, L1-L3 | Lender, home owner, buyer, seller, tenant rep | free | Money logic, financial meaning, words, section 5.2 | M each |
| 11 | Broker closing loop: buyer profiles and explained match, bid leveler, fee record, offer summary | 17.1-17.3, 5.1 | Broker, seller | free (local) | Money logic (net proceeds from the engine) | M-L |
| 12 | Development: zoning catalogue, pro forma, draws, site scorecard, notebook | M1, M2, M3, M4, M7, M8 | Developer, lender | free | Data format, money logic, financial meaning (FAR precedence) | L |
| 13 | Investor register and LP reports | M5 | Investor, sponsor | free (local) | Data retention of investor personal data; confidential tag | M-L |
| 14 | Browser-only OAuth connectors with a firm's own app: Dynamics (MSAL), Salesforce read-only (org allowlist), Zoho | X4 (connector registry) | Broker | free, firm registers its own app | Third-party terms, legal review per CRM, security (tokens on device) | M each |
| 15 | Calendar and cloud-drive pickers (Google/Microsoft calendar, Drive/OneDrive/Dropbox) | X4, new rows 32-34 | Broker, all | free; Google needs the owner's cloud project and a scope verification | Security, third-party terms; owner decision on a Google project | M |
| 16 | Public-entity research: SEC and Secretary of State bulk files into the manual brief; records pull on the deal | B1, B2, R1 (X4) | Broker, attorney/title | free | Data format, retention | M |
| 17 | Relationship intelligence on the built-in CRM: companies, proposals, dedup, provenance | B, C, D, E | Broker | free (device); AI by token the user pays | Data retention, AI cost, security | M-L |
| 18 | Accounts, hosting and the relay (OAuth callback, pass-through) for sources that need it | Production readiness, X5 (rank 13), F | Everyone | **paid (host)** | Hosting, cost, security, retention | L |
| 19 | Paid or partner sources: parcel APIs, MLS, e-signature, Bridge, partner feeds | C6, X5-rank 14, partner-gated | Broker, appraiser, buyer | **paid or partnership** | Cost, terms, partnership signed by the owner | M each |
| 20 | People-data connectors (contract-holding firm only) | X6, 3b.1 | Broker | **paid (the firm's contract)** | Legal and compliance review first; GLBA, DPPA, FCRA, state laws | L |

Items 1-17 are free and need no hosting. Items 18-20 are parked behind the owner's money, hosting and legal decisions.

### 4.3 What the owner named that cannot be done free or lawfully, and the nearest lawful substitute

| Named | Why not | Nearest lawful substitute |
|---|---|---|
| CoStar, LoopNet (live data) | No public API; terms bar automated access; contract only | The user's own exports and PDFs (C5.n, `app/costar.js`); open data (rows 14-19) for ownership and parcel facts |
| Crexi (live data) | Listing API is for large partners; terms bar scraping | The user's own exports (C5.n); a partner request by the owner, if he wants one (parked, item 19) |
| Zillow and Realtor.com (live data) | No general developer API; MLS and partner licences; scraping barred | User-saved listing data; public county records for ownership and sale facts; a broker with MLS access exports a CSV (C5.n MLS profile) |
| MLS (RESO Web API) | Licence per MLS, not lendable | CSV export from the broker's own MLS seat |
| IDI Core and other people-data | Contract with the firm, a permissible purpose each search, a legal review; not usable for credit, employment or tenancy decisions | Bring-your-own results the broker obtains under their own contract and pastes in (B1); public registries (Secretary of State, licence lookups, court and permit records via R0/R1); the connector design in `platform-expansion.md` 3b.1 stays parked until legal review |
| Salesforce for free | A free path exists only for a firm with its own org and an admin who sets the CORS allowlist | File tier first (item 9), then item 14 |
| Perfect "everything" | Not possible: each source has its own owner and terms | The matrix: each row has a route and a reason |
| Production e-signature | Paid plans (DocuSign, Dropbox Sign) | Export the signed-ready PDF; the user uploads to their own signing tool (`competitive-gap.md`: link-out first) |

---

## 5. Risks

### 5.1 Licensing and terms

- **Automated access to the data and listing services is the highest legal risk.** CoStar sued a competitor for
  large-scale access [7][8]; Crexi's terms bar bots [9]. The plan: never fetch their pages; only read what the user
  exports. Terms can change, so each connector records `terms.checked` and the date.
- **Clean room stays in force.** No vendor file layouts, help text or trademarks, and no model-file import/export,
  even where a user holds a licence (`docs/working-rules.md`). A "CoStar profile" reads the user's own export by
  column headers the user can edit; it does not copy a vendor report layout. The owner has asked for connection to
  existing systems, which is why every profile is user-mapped and testable on invented fixtures.
- **Open data is not unlimited.** OpenStreetMap's geocoder allows about one request a second and requires
  attribution [23]; EDGAR asks for a declared User-Agent and a request cap [18]; FRED has its own terms [22]. Each is
  entered in the registry with its limit and a test that no host outside the registry is called.
- **Every new library is an approval gate** (permissive licences only, vendored with checksum).

### 5.2 Fair housing and advertising rules (consumer-facing features)

Home owners, buyers and sellers use different rules from brokers. Before any consumer-facing feature ships:
- **No steering and no discriminatory wording.** Listing copy, area descriptions and buyer-match features must not
  use, infer or rank by protected characteristics. A buyer-match model uses only the buyer's own stated needs and the
  property's facts. This extends the existing "no sensitive attributes" rule for lead scoring.
- **Estimates are not advice.** Affordability, valuation and tax-treatment calculators carry a plain "estimate, not
  advice" line and show their assumptions (already planned, role-workspaces section 4).
- **Lending and consumer-credit rules** (disclosure, fair lending) apply to anything that looks like a loan offer;
  Zlatura stays a calculator and file organiser, not a lender. The precise legal reading is **UNVERIFIED and goes to
  legal review** (a first-party fair housing text was not read in this research).
- **No tenant or buyer screening** from people-data (FCRA); refused in the design (`platform-expansion.md` 3b.1).

### 5.3 People-data law

GLBA and DPPA require a permissible purpose; a "non-FCRA" product may not be used to decide credit, insurance,
employment or tenancy [15]. TCPA and state calling/texting laws apply to what a broker does with a number
(`platform-expansion.md` 3b.1). Nothing in this document changes that design or its legal-review gate. The vendors'
actual idiCORE terms were **not found**.

### 5.4 The limits of a static site, and what accounts and hosting would unlock

Today: no server of its own, data on the device, optional AI server not deployed. That is a strength (privacy, zero
running cost) and a limit.
- **Works now, browser only:** file imports, template fill, document reading, the cash-flow engine, open APIs that
  allow cross-origin calls, and sign-in popups that need no secret (PKCE) for a firm's own app registrations.
- **Needs a relay or server:** APIs without CORS or that require a secret (HubSpot, EDGAR with its User-Agent rule,
  possibly the Census geocoder and Box); anything with a webhook; shared team data; scheduled jobs; email tracking
  and gated listing pages; the audit log a compliance officer would want.
- **What accounts and hosting would unlock:** team workspaces, shared pipelines, background refresh of open data,
  notifications, signed shared links, and the connector relay. They also bring retention, security and a monthly bill
  (UNVERIFIED), which is why they are an owner gate (item 18).
- **Offline-first is a promise.** Every network item must degrade to "open the official page" or "import a file".

### 5.5 Breadth versus finishing the underwriting core

The rival suites each took years on one core. Zlatura's edge is accuracy and no lock-in (`competitive-gap.md`).
Adding eleven personas multiplies money-meaning gates (each new calculator is a financial-meaning decision) and test
cost. Recommendation: keep the order **underwriting core and document reading (items 1, 2, 4, 5) → free open data
(6, 7, 8) → file tier (9) → personas (10-13) → connectors (14-17) → paid/hosted (18-20)**, and ship each persona as a
smaller honest version with the gap listed in `docs/acceptance-matrix.md`.

---

## 6. Questions for the owner (recommended default each)

1. **Is "free only" a rule for the whole roadmap, or only the first phase?** *Recommend: only until items 1-17 are
   done; then decide on one paid item at a time with a stated monthly cost.* It decides whether items 18-20 stay parked.
2. **May the app call a fixed list of free government and open-data hosts from the browser (a one-line CSP change,
   plus a test that fails on any host not in the list)?** *Recommend: yes, at item 7, after the browser CORS test.*
3. **Which two outside systems matter most, so file profiles come first for them?** (Say the firm's CRM and the data
   source it already licenses.) *Recommend: Salesforce-style CSV and the licensed data service's own export, using
   files from `private/`.*
4. **Do you want a Google cloud project and a Microsoft app registration set up (free, but your name and a
   verification step)?** *Recommend: Microsoft first (no public verification for the delegated scopes, per the
   sources, to be checked); Google only if a calendar link is wanted.*
5. **Do you want Zlatura open to consumers (home owners, buyers, sellers), or stay professional-first?** *Recommend:
   professional-first; ship the consumer calculators inside workspaces, with the "not advice" line and a fair
   housing review before any public listing or buyer-matching feature.*

---

## What was verified, what was not

- **Read (search summaries only, no vendor site opened):** reviews and pricing mentions for ARGUS, Dealpath, the
  broker CRMs, Juniper Square [1]-[4]; Crexi's partner-only Listing API [9]; Zillow's retired public API and gated
  Bridge access (secondary, partly conflicting) [5]; Realtor.com access (secondary) [6]; RESO access model [12];
  Salesforce CORS allowlist [13]; Dataverse SPA/CORS [14]; LexisNexis-type permissible purposes and FCRA bars [15];
  Socrata tokens [16]; EDGAR fair access [18]; Census key [19]; FEMA NFHL service address [20]; HUD token [21]; FRED
  terms [22]; Nominatim policy [23]; Regrid/ATTOM trials [11]; Dropbox Sign test mode and DocuSign sandbox [25];
  Google verification rules [26]; Dropbox PKCE [28].
- **Not verified:** CoStar's explicit "no scraping" clause and LoopNet's own terms; any IDI Core terms; Apto, Buildout and
  RealNex API existence; Zillow's current API status from a primary source; Realtor.com's official partner process;
  every **CORS** cell (rows 8, 14, 15, 20-27, 30, 35); Box CORS/PKCE; BLS API (not searched); state licence and
  Secretary of State API availability beyond the California and bulk-file examples; pricing for CoStar, LoopNet, Crexi,
  Juniper Square, Dealpath, ARGUS and all lender and residential tools; the lender, residential and
  spreadsheet-add-in categories were not searched in depth and are written from general knowledge; Google/Microsoft
  consent rules (tables conflict); the fair housing and consumer-credit legal text.
- **Validation plan:** a browser CORS test page recorded per host in C3 (`comp-enrichment-and-sources.md` section
  7); a read of each vendor's primary terms page when its connector is proposed; a legal review before any
  consumer-facing or people-data feature.

## Sources

1. [ARGUS Enterprise reviews, Capterra and others](https://capterra.com/p/276457/ARGUS-Enterprise/reviews/) and [listing](https://capterra.com/p/276457/ARGUS-Enterprise)
2. [Dealpath reviews, Software Advice](https://www.softwareadvice.com/business-performance-managemen/dealpath-profile/reviews/) and [Capterra UK](https://www.capterra.co.uk/software/164485/dealpath)
3. [Broker CRM comparison (vendor-authored, treat as biased)](https://ascendix.com/blog/top-commercial-real-estate-crm/); [Apto vs RealNex, G2](https://www.g2.com/compare/apto-vs-realnex-crm); [AscendixRE vs Buildout CRM, TrustRadius](https://www.trustradius.com/compare-products/ascendixre-vs-buildout-crm)
4. [Juniper Square reviews, Capterra](https://www.capterra.com/p/171269/Juniper-Square/reviews/); [alternatives, GetApp](https://www.getapp.ca/alternatives/111957/juniper-square)
5. [Zillow API status summary (secondary)](https://supergood.ai/api-report-card/zillow-api); [forum thread on the Zillow data API change](https://www.biggerpockets.com/forums/80/topics/857973-zillow-discontinuing-free-zillow-data-api-for-saas-products)
6. [Realtor.com API access (secondary)](https://batchdata.io/uncategorized/realtor-com-api); [API directory entry](https://providers.apievangelist.com/providers/realtor-com/)
7. [CoStar Terms of Use](https://www.costar.com/about/termsofuse); [CoStar API report card (secondary)](https://supergood.ai/api-report-card/costar)
8. [CoStar litigation summary, Latham & Watkins](https://www.lw.com/en/people/admin/upload/SiteAttachments/CoStar%20Accuses%20'Free-Riding'%20Startup%20Of%20'Remarkable'%20Theft.pdf)
9. [Crexi Listing API overview](https://learn.crexi.com/listing-api-overview-crexi-help-center); [Crexi master services agreement](https://www.crexi.com/msa/)
10. [Draw and development software comparisons](https://www.softwareadvice.com.au/compare/334110/390075/northspyre/vs/procore); [Built vs Northspyre](https://www.cbinsights.com/compare/built-vs-northspyre); [draw software list](https://gitnux.org/best/construction-draw-management-software/)
11. [Regrid self-serve API](https://regrid.com/blog/introducing-regrids-updated-self-serve-api); [Regrid plan options](https://support.regrid.com/reference/plan-options); [ATTOM API pricing and trial](https://support.attomdata.com/articles/9704145040-api-pricing-trial-extensions-and-paid-plans)
12. [RESO Web API FAQ](https://www.reso.org/knowledge-base/reso-web-api-faq/); [MLS data access requirements](https://help.repliers.com/en/article/mls-data-access-requirements-who-can-use-mls-apis-wyl8lw)
13. [Salesforce CORS allowlist](https://developer.salesforce.com/docs/atlas.en-us.240.0.api_rest.meta/api/extend_code_cors.htm)
14. [Dataverse OAuth and CORS for single-page apps](https://learn.microsoft.com/power-apps/developer/data-platform/oauth-cross-origin-resource-sharing-connect-single-page-application); [MSAL.js SPA quickstart](https://docs.microsoft.com/powerapps/developer/data-platform/quick-start-register-configure-simplespa-application-msal-js)
15. [LexisNexis master terms](https://risk.lexisnexis.com/masterterms); [permissible uses FAQ](https://secure.accurint.com/bps/516/html/glb_dppa_faq.html); [FCRA bar analysis (third party)](https://conductatlas.com/platform/lexisnexis/lexisnexis-terms/prohibition-on-use-of-content-for-fcra-covered-determinations/)
16. [Socrata app tokens](https://dev.socrata.com/docs/app-tokens); [Socrata getting started](https://dev.socrata.com/consumers/getting-started)
17. [California business search API and bulk (secondary)](https://www.kyckr.com/blog/california-business-register-2025-update); [Kentucky bulk data service](https://www.sos.ky.gov/bus/Pages/Bulk-Data-Service.aspx); [Arkansas bulk download](https://portal.arkansas.gov/service/ar-corp-bulk-data-download/)
18. [SEC: accessing EDGAR data](https://www.sec.gov/os/accessing-edgar-data)
19. [Census Data API user guide](https://www.census.gov/data/developers/guidance/api-user-guide.UCGID.html); [geocoder CORS claim (competitor)](https://www.geocod.io/census-bureau-api-down-alternative)
20. [FEMA NFHL map service page](https://hazards.fema.gov/femaportal/wps/portal/NFHLWMS)
21. [HUD User API tools and token notes (secondary)](https://rdrr.io/github/CenterOnBudget/hudapi/f/README.md)
22. [FRED API terms of use](https://fred.stlouisfed.org/docs/api/terms_of_use.html); [FRED legal notices](https://fred.stlouisfed.org/legal)
23. [Nominatim usage policy summaries (secondary)](https://wiki.openstreetmap.org/wiki/Nominatim)
24. [Yardi Voyager API scorecard (secondary)](https://supergood.ai/api-report-card/yardi-voyager); [AppFolio API scorecard (secondary)](https://supergood.ai/api-report-card/appfolio)
25. [Dropbox Sign API pricing](https://help.dropbox.com/plans/how-much-does-the-dropbox-sign-api-cost); [Dropbox Sign test mode](https://help.dropbox.com/integrations/testing-zapier-and-the-dropbox-sign-api-in-test-mode); [DocuSign developer centre](https://developers.docusign.com)
26. [Google sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
27. [MSAL.js resources and scopes](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/resources-and-scopes)
28. [Dropbox JavaScript SDK](https://cdn.jsdelivr.net/npm/dropbox@10.46.0/README.md); [PKCE what and why](https://dropbox.tech/developers/pkce--what-and-why-)

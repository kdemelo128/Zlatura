# Feature ideas: a study for a retail investment sales broker

Study only, 2026-10-28. Nothing here is approved, planned or built.

**Scope.** These are new ideas for a broker who sells single-tenant net lease, multi-tenant and mixed-use retail around DC, Maryland and Virginia, mostly from an iPhone. Anything already built, in `docs/PLAN_STATUS.md` or `docs/acceptance-matrix.md`, or already proposed (competitive gap, underwriting workspace E1 to E10, relationship intelligence, UI revamp) is left out.

**How to read the tables.**
- *Win* is time saved or deals won.
- *Cost* counts PRs and says whether the designer is needed.
- *Local-first* says "fits", or says what the idea would break.

Competitor behaviour comes from vendor pages or review sites; none of it was tried. UNVERIFIED means it could not be confirmed.

## 1. Ideas, ranked

### 1. Net lease rent schedule with a cap rate for each period
- **Why.** This is the page every single-tenant OM and buyer call is built on: each rent period and option, with the annual rent and the return on the asking price. Today it is typed by hand.
- **What it needs.**
  - A read-only table built from the lease engine's periods, steps and options (`app/lease.js`). It uses the engine's existing figures and adds no new math.
  - Options are labelled "option, not committed".
  - The column reads "rent ÷ price" unless the lease is absolute NNN. It is never called an NOI cap rate when the landlord pays expenses.
  - Monthly and annual rent are separate, labelled columns.
  - A check compares the bump wording the broker types (for example, "10% every 5 years") with the engine's steps.

| Win | Effort | Cost | Risk | Local-first |
|---|---|---|---|---|
| High: one page per listing, fewer rent typos | S–M | 1–2 PRs; designer note on gross/net labels | Low; saving the bump wording is a **data-format gate** | Fits |

Source: rent bumps add value over flat leases, typically "1% to 2% annually or 5% to 10% every five years" (vendor blog) [1].

### 2. Key dates to the iPhone calendar
- **Why.** The diligence end, the hard deposit date, closing and the 1031 45-day and 180-day dates show up in the phone's calendar with alerts. The broker does not have to wait for the 17.5 integration, which needs OAuth and hosting.
- **What it needs.**
  - "Add to calendar" on one date or on all of a deal's dates.
  - It writes an `.ics` file through the share sheet the app already uses (`app/kit.js`).
  - One way only: nothing is read back.
  - Blank dates are skipped, never set to today. Each event has its own end time.

| Win | Effort | Cost | Risk | Local-first |
|---|---|---|---|---|
| High: fewer missed deadlines | S | 1 PR | Low; deal names reach the calendar, so a confidential deal warns first (19.2) | Fits; no network |

Source: forum reports say Safari opens `.ics` files in Calendar, and that it fails when the start and end times are the same [2][3]. UNVERIFIED on a real iPhone.

### 3. Tenant credit record: who pays the rent, and who guarantees it
- **Why.** Net lease buyers first ask whether the tenant is investment grade. The rated parent is often not the entity on the lease. Getting this right on the first call builds trust and keeps errors out of the OM.
- **What it needs.**
  - Fields:
    - the tenant entity on the lease;
    - the guarantor;
    - how far the guarantee goes (full, limited, or ending on a date);
    - a rating the broker types, with the agency, the date and the source;
    - store sales, optional.
  - Checks:
    - the guarantor is not the rated entity;
    - the guarantee ends before the lease does;
    - the rating is over 12 months old;
    - rent as a share of sales, only when sales are entered;
    - a noted right for the tenant to close the store while still paying rent [25].
  - It extends the 6.3.9 guarantor question. The app never looks a rating up.

| Win | Effort | Cost | Risk | Local-first |
|---|---|---|---|---|
| High for single-tenant deals | M | 2 PRs; designer data-format note | **Data-format gate** (new fields and a migration step). Whether a typed rating may be printed in an OM is for the firm's compliance to say (UNVERIFIED) | Fits |

Sources: the investment-grade line at BBB- or Baa3; the parent against the tenant on the lease; narrow or expiring guarantees [4][5][6].

### 4. "You've seen this property before" on import
- **Why.** When a new OM or rent roll arrives, the app shows what is already on the phone: an earlier deal at that address, a sold comp with its cap rate, or an earlier asking price. It saves a search and supports the pricing story.
- **What it needs.** An address and tenant match against deals and comps, exact after spacing and case are evened out. Anything less certain shows as "possibly the same", never merged. A card on the review screen.

| Win | Effort | Cost | Risk | Local-first |
|---|---|---|---|---|
| Medium | S–M | 1 PR | Low; read-only | Fits |

### 5. Age warnings on source documents
- **Why.** It catches old numbers before a pricing call: a T-12 that ended more than 9 months ago, or comps over 24 months old.
- **What it needs.** The periods and as-of dates already read, with thresholds in Settings. A missing date shows as "date unknown", never as fresh. The warnings join Needs Attention (5.1).

| Win | Effort | Cost | Risk | Local-first |
|---|---|---|---|---|
| Medium | S | 1 PR | Low | Fits |

Source: a reviewer says CoStar data is "sometimes out of date" [7].

### 6. First-call intake and a seller document request list
- **Why.** During the owner call the broker fills in a short form: tenant, lease end, rent, debt, timeline, 1031 need. It becomes a draft deal, plus a list of what to request (rent roll, T-12, leases, tax bill, estoppels) as text the broker sends.
- **What it needs.** It reuses the deal fields, and blanks stay blank. The request list is a checklist on the deal. This is the seller side, before listing; 18.1 and 18.2 cover buyer diligence.

| Win | Effort | Cost | Risk | Local-first |
|---|---|---|---|---|
| High at pitch time | M | 2 PRs | **Data-format gate** (the checklist) | Fits; the broker sends, never the app |

Source: brokers juggle "up to 7 platforms" and miss follow-ups (vendor launch post) [8].

### 7. Same-tenant comps: cap rate against years left on the lease
- **Why.** Plotting the broker's own comps of the same brand by remaining term is the quickest way to price a single-tenant asset. It also shows a seller what waiting costs.
- **What it needs.**
  - The tenant brand and lease end on each comp.
  - A brand list the broker edits.
  - A chart with a data table.
  - No fitted "predicted cap rate", because the app would be inventing a value.

| Win | Effort | Cost | Risk | Local-first |
|---|---|---|---|---|
| High at pitch time | M | 2 PRs; designer review | **Data-format gate** (comp fields) | Fits |

Sources: a shorter remaining term means a higher cap rate [1]. One tenant was about 6.50% with 5 years left and 5.75% with 10 years left (2023 broker report) [9].

### 8. A 1031 clock on buyer profiles
- **Why.** Exchange buyers on a deadline close fast. The broker calls first the buyers whose 45-day window ends soon.
- **What it needs.** The buyer's sale closing date, typed in. The 45-day and 180-day dates from the existing 1031 tool (`app/tools.js`). A "window closing" line on Home. It comes after 17.2 buyer profiles and is labelled "an indication, not tax advice".

| Win | Effort | Cost | Risk | Local-first |
|---|---|---|---|---|
| Medium–High | S, after 17.2 | 1 PR | **Data-format and financial-meaning gate** | Fits |

Sources: weekends count toward both periods [10]. Named properties can sell to someone else, so backups should be named early [11].

### 9. Prospecting list from lease terms already on the phone
- **Why.** It lists owners in the broker's own deals and comps whose single-tenant lease has 3 to 6 years left. That is the window to suggest selling before the cap rate widens.
- **What it needs.** A filter over records already on the phone, with its rule shown in words. No score and no outside data.

| Win | Effort | Cost | Risk | Local-first |
|---|---|---|---|---|
| Medium | S–M | 1 PR | Low | Fits |

Sources: [1][9]. Compare Reonomy's "likely to sell" score, which a reviewer calls not always accurate [12].

### 10. Why a pitch or deal was won or lost
- **Why.** The broker records why a listing or buyer was lost: the price another broker promised, the fee, timing or relationship. Over a year it shows which pitches work.
- **What it needs.** A reason and a note when a deal moves to "Lost or passed" (`app/pipeline.js:9`), plus a short summary.

| Win | Effort | Cost | Risk | Local-first |
|---|---|---|---|---|
| Medium (deals won) | S | 1 PR | **Data-format gate** (one field) | Fits |

### 11. Hand a single deal to a colleague
- **Why.** It sends one deal (figures, rent roll, history, photos) as a file that the colleague's copy of Zlatura opens and merges. Today only the whole-device backup moves deals. The project file holds comps only (`app/backup.js:113`).
- **What it needs.** A versioned file kind, migrated through `app/migrate.js`. A warning before sending a confidential deal. The AI token is left out.

| Win | Effort | Cost | Risk | Local-first |
|---|---|---|---|---|
| Medium | M | 2 PRs; designer data and security note | **Data-format and retention gate** | Fits; sent through the broker's own channel |

### 12. Public assessment files for DC and Maryland, imported by the broker
- **Why.** It fills in the owner of record, the assessed value and the last sale for a property. The broker downloads the files from the public portals.
- **What it needs.** A mapped CSV import (the 10.4 pattern) and a match by address or parcel. Every value keeps its source and as-of date. It builds on 6.1, property identity.

| Win | Effort | Cost | Risk | Local-first |
|---|---|---|---|---|
| Medium | M–L | 2–3 PRs | **Data-format and retention gate** (owner names); file size UNVERIFIED | Fits only if imported by hand; an in-app fetch needs approval |

Sources: DC's sales data from its assessment system, under CC-BY, refreshed daily [13]; Maryland's field reference, in CSV [14]; the SDAT search [15]. Virginia, county by county, was not checked.

## 2. Do not build

| Idea | Why not |
|---|---|
| "Share to Zlatura" from Mail or Files (Web Share Target) | Not supported in iOS Safari; the WebKit bug has been open since 2019 [16][17]. Not re-checked for iOS 26 (UNVERIFIED) |
| Automatic lookup of ratings or brand cap rates | Licensed or paid data; the broker types it with its source |
| National cap-rate tables copied into the app | Third-party reports, and they go stale; cite them in 10.4 notes with source and date [18] |
| "Likely to sell" or lead-intent scores | A black box, and not always accurate [12]; intent scoring needs tracking |
| Pulling listings or contacts from LoopNet, Crexi or CoStar | Scraping behind a login is prohibited |
| Automatic follow-up sequences, as Rethink+ markets [19] | Automatic outreach is prohibited |
| A predicted cap rate fitted to comps, shown as a price | An invented value unless the owner approves a labelled method |
| Assumed-loan comparison | Likely inside 15.2, the financing comparison; check that first |

## 3. Approve these three first

1. **Net lease rent schedule (idea 1).**
   - *Why:* it is the core single-tenant page; it is small; it uses only the existing engine.
   - *Unlocks:* the net lease page of the 13.1 OM, idea 7 and a bump-wording check for OM Forensics.
2. **Key dates to the iPhone calendar (idea 2).**
   - *Why:* real deadlines, one small PR, no network.
   - *Unlocks:* calendar output for 18.3 contract dates and the 1031 clock (idea 8), ahead of any 17.5 integration.
3. **Tenant credit record (idea 3).**
   - *Why:* it is the first buyer question on net lease, and getting it wrong is costly.
   - *Unlocks:* credit notes in 7.3 pricing, sharper 6.3.9 checks, and fields that 6.6 lease abstracts can fill later.
   - *Gate:* data format.

**Not checked.**
- Juniper Square, Belmont, Chatham, Datasite and LoopNet were not searched one by one.
- No Reddit threads came up.
- Cactus [20], Rockport VAL [21], Dealpath [22] and Buildout [19][23] are described only from vendor or aggregator pages.
- The review samples are small: 10 Capterra reviews for Buildout [23], and 1 to 8 G2 reviews per Crexi theme [24].

## Sources

1. FNRP, net lease cap rates: https://fnrpusa.com/blog/net-lease-cap-rates-introduction/
2. Adalo forum, calendar events: https://forum.adalo.com/t/adding-an-event-to-calendar/59849
3. Eventfinity help, add to calendar: https://eventfinity.helpsite.com/articles/127256-eventfinity-apps-add-to-calendar
4. InvestmentGrade, tenant-credit screen: https://investmentgrade.com/tenant-credit-screen-nnn-buyers/
5. InvestmentGrade, parent credit vs lease obligor: https://investmentgrade.com/parent-company-credit-vs-lease-obligor-risk/
6. InvestmentGrade, corporate guarantees: https://investmentgrade.com/what-corporate-guarantee-actually-means-nnn-real-estate/
7. Capterra, CoStar Real Estate Manager reviews: https://www.capterra.com/p/135049/CoStar-Real-Estate-Manager/reviews/
8. Y Combinator, PARES AI launch: https://www.ycombinator.com/launches/Nxo-pares-ai-helping-commercial-real-estate-brokers-find-close-more-deals
9. Matthews, 2023 net lease tenant report: https://issuu.com/matthewsreis/docs/2023_net_lease_tenant_report
10. CBIZ, 1031 deadlines: https://www.cbiz.com/insights/article/1031-exchange-deadlines-45-day-and-180-day-rules-explained
11. The 45-day identification trap: https://dbrecs.substack.com/p/the-45-day-identification-trap
12. CRE Daily, Reonomy review: https://www.credaily.com/reviews/reonomy-review/
13. Data.gov, DC Tax System Property Sales (CAMA): https://catalog.data.gov/dataset/tax-system-property-sales-cama
14. Data.gov, Maryland assessments field reference: https://catalog.data.gov/dataset/maryland-real-property-assessments-fields-reference
15. Maryland SDAT services: https://dat.maryland.gov/pages/services.aspx
16. WebKit bug 194593: https://bugs.webkit.org/show_bug.cgi?id=194593
17. Web Share Target on iOS, research note (Dec 2025): https://tangled.org/zzstoatzz.io/plyr.fm/blob/main/docs/research/2025-12-19-web-share-target-ios-pwa.md
18. MBA Newslink, Boulder Group Q2 2026: https://newslink.mba.org/mba-newslinks/2026/july/mba-newslink-wednesday-july-8-2026/single-tenant-net-lease-cap-rates-rise-boulder-group-reports/
19. Buildout, Apto alternatives (vendor): https://www.buildout.com/blog-posts/best-apto-alternatives-for-cre-brokers
20. Kolena, underwriting software 2026: https://kolena.com/blog/real-estate-underwriting-software-and-ai/
21. Rockport VAL brochure (vendor): https://realcomm.com/filecabinet/ContactMedia/000000/rockportVal-brochure.pdf
22. Dealpath blog (vendor): https://www.dealpath.com/blog/meetings-run-eliminate/
23. Capterra, Buildout reviews: https://www.capterra.com/p/173044/Buildout/reviews/
24. G2, Crexi reviews: https://g2.com/products/crexi/reviews?page=4
25. Fogler Rubinoff, leasing risks (go-dark rights): https://www.foglers.com/insights/beyond-the-purchase-price-evaluating-leasing-risks-in-commercial-acquisitions/

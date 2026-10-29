# Lease-by-lease cash flow and valuation (owner addition, 2026-10-29)

Status: **proposal, waiting for the owner's approval.** Nothing here is built.
The owner asked for "an ARGUS Enterprise-class capability" in Zlatura. The
file name records that request. In the product the feature is called
**Cash flow**, under the Underwrite tab, and no vendor's name or trademark
appears in the app, its exports or its help text.

**In one paragraph.** About half of the capability already exists: `lease.js`
projects every lease month by month, with renewal probability, downtime,
free rent, TI, leasing commissions, recoveries, percentage rent, other income,
general vacancy and reserves. The NOI from that projection feeds hold returns,
the DCF tool and What if. What's missing is depth, not a second engine:

- assumption profiles per lease;
- expenses by line, and recoveries with caps, gross-ups and admin fees;
- CPI;
- returns on cash flow after leasing costs, not on NOI;
- a cash-flow view by line and by lease;
- portfolio roll-up and reports.

I recommend ten PRs (A1 to A10), each one small and approved in turn. The
first two change no figure. Five of them change the data format, and one
changes saved results (returns after leasing costs); each of those is an
owner gate.

## 0. Clean room: the legal and ethics guardrail

We will **not** decompile, disassemble, debug, trace or copy any proprietary
software. We will not read or reproduce vendors' file formats, databases,
report layouts or help text, and we will not use leaked code or anything
obtained by getting round a licence, a key or a terms-of-use clause. We will
not import or export another vendor's model files. This repeats the earlier
decision in `docs/proposals/competitive-gap.md`, row "Underwriting and
valuation". No trademark is used in the product, the UI, exports or marketing.

What we build instead is the **published industry method**, written from first
principles on our own engine. The sources:

- standard CRE finance textbooks: DCF, reversion, expected-value rollover and
  recoveries;
- Appraisal Institute and USPAP-style income-capitalisation practice;
- BOMA measurement terms;
- publicly posted vendor documentation and training pages, read **for
  terminology only**: what brokers call a thing, so our words match theirs.
  We don't take their structure, formulas, defaults or screens from them.

Every formula in this proposal is the textbook one, stated in plain words in
section 4. Every test value is worked by hand from invented leases. When the
method allows more than one reading (for example whether the sale price
capitalises next year's NOI or next year's cash flow), we ask the owner (section
9). We never copy a vendor's default.

## 1. What changes for the broker

- **Underwrite → Cash flow** (on the deal page until the Underwrite tab, W1,
  is merged). It shows one table, years across and lines down, from potential
  rent to cash flow before and after debt service. Tap a line to see it by
  lease. Tap a year to see its months. Every projected figure is marked
  "projected", and every documented one keeps its source.
- **Leasing assumptions** become named profiles ("Office, standard", "Retail
  anchor", and so on) with renewal probability, market rent and growth,
  downtime, free rent, TI, commissions, renewal term and what happens when a
  lease ends (renew at market, renew at a stated option rent, vacate, or the
  probability blend). Each lease picks a profile; the default profile is
  today's settings, unchanged.
- **Expenses by line** (taxes, insurance, CAM and so on, matching the T-12's
  21 categories), each with its growth, whether it is recoverable, and how much
  of it varies with occupancy. **Recoveries** per lease: pro rata, base year,
  stop or fixed, plus a cap, an admin fee and a gross-up.
- **CPI rent** with an assumed rate, a floor, a cap and a lag, typed by the
  broker. The app never fetches an index.
- **Returns on cash flow**: NPV at a typed discount rate, unlevered and levered
  IRR, and the equity multiple. They are worked on cash flow after TI, LCs,
  capital items and reserves, not on NOI. The sale-price basis is named on
  screen.
- **Scenarios** change assumptions (market rent, growth, profiles, exit cap),
  never the leases. There is a two-way sensitivity grid and a tornado.
- **Portfolio**: the cash flows of a set of deals, added up by calendar year.
- **Reports**: the cash flow, lease expirations, assumptions and a valuation
  summary, printed to PDF or saved as XLSX in our own layout.
- **Modules the broker turns on.** A single-tenant NNN deal shows only rent,
  recoveries and returns. Expense lines, CPI, percentage rent and portfolio
  stay hidden until turned on (Settings → Underwriting modules), or until a
  lease uses them.

## 2. What exists today (gap map)

Status: **Exists**, **Partial** or **Missing**. File and line references are
on main at 4.7.70.

| Capability | Status | Where, and what's missing |
|---|---|---|
| Lease as dated rent periods, steps, % or $ bumps, mid-month accrual | Exists | `lease.js:134` `generateSteps`, `:327` `leaseMonths` (day-by-day accrual) |
| Free rent and abatements | Exists | `lease.js:187`, `:339-363`; projected free rent `:438-449` |
| Renewal probability, downtime, renewal and new terms, TI, LC (expected-value blend) | Partial | `lease.js:380-460` `rollover`/`reLease`. One global set plus a per-lease override (`L.renewal`); there are no named profiles, no "vacate" or "option rent" outcomes, LC only as a % of term rent (no $/SF, no by-year schedule), and renewal rent is always 100 % of market |
| Market rent and growth | Partial | `lease.js:402-416`: one market rent (per lease or global), growth compounded continuously from the as-of date. No market rent per profile, and no growth by year |
| Vacant space lease-up | Exists | `lease.js:392` `leaseUp` |
| Expense recoveries: pro rata, base year, stop, fixed | Partial | `lease.js:543-558`. One pool for the whole building (`s.recoverable` or `s.opex`); the base-year amount is typed, not taken from that year's expenses; **no caps, admin fees or gross-ups** (acceptance matrix, Part 9) |
| Operating expenses | Partial | `lease.js:568-571`: one total, one growth rate. No lines, and no fixed/variable split |
| General vacancy without double counting | Exists | `lease.js:575-583`: only the part above the vacancy already modelled |
| Credit loss as its own line | Missing | folded into general vacancy |
| Percentage rent (set or natural breakpoint) | Partial | `lease.js:532-542`; sales growth per analysis year; no breakpoint steps |
| CPI indexation | Missing | acceptance matrix Part 9, "CPI-linked increases" |
| Other income, one-time items | Exists | `lease.js:559-567` |
| Capital reserves | Partial | `lease.js:571` ($/SF a year, grown). No dated capital items |
| TI and LC in cash flow | Exists | `lease.js:528-531`, `:587` `cashFlow` |
| Annual roll-up, monthly detail | Exists | `lease.js:590-598`; per-lease months in `P.leases` |
| Off the main thread | Exists | `projector.js` (worker, cached by content) |
| Reversion / terminal value | Exists, twice | `deal.js:85` (`holdReturns`) and `calc.js:122` (`dcf`): next year's NOI ÷ exit cap, less sale costs |
| IRR, equity multiple | Exists | `deal.js:41` `irr` (bisection), `:96` multiple |
| NPV at a discount rate | Partial | only in the DCF tool (`calc.js:108`), not in What if or a saved scenario |
| Returns on cash flow after leasing costs | **Missing** | see finding F1 |
| Amortisation, refinance, loan sizing, waterfall | Exists | `engine/debt.js`, `calc.js:28`, `:54`, `:193` |
| Scenarios | Partial | `deal.js:166` `runScenario`; saved in `deal.scenarios`. They change deal-level inputs only; the rent roll's assumptions can't change per scenario (`deal.js:191`) |
| Sensitivity | Partial | `calc.js:153` `sensitivity`, `:157` `around`; no tornado (M6 in `platform-expansion.md`) |
| NOI bridge, T-12 normalisation, NOI three ways | Exists | `calc.js:129`, U1-U2, `engine/figures.js:328-370` |
| Impact map (what reads what) | Exists | `impact.js:191` `PROJ_LINES`; every new line must be registered there |
| Rent schedule, expirations, WALT | Exists | `rentschedule.js`, `lease.js:623`, `engine/walt.js` |
| Portfolio roll-up | Missing | no multi-deal cash flow |
| Cash-flow reports (PDF, XLSX) | Partial | the rent roll's sheets (`impact.js:313` `RR_SHEETS`), `workbook.js`; no cash-flow-by-line report |

### Findings in today's code (each with evidence)

- **F1. Returns from the rent roll ignore TI, LCs and reserves.** What if,
  the impact map and the DCF tool take `annual.map((y) => y.noi)`
  (`dealui.js:1398`, `impact.js:635`, `toolsdefs.js:42`). `holdReturns` adds
  that NOI straight into the yearly flows (`deal.js:93-94`). So a re-leasing
  year's $/SF of TI never reaches the IRR, although the rent roll screen shows
  "Cash flow before debt service" (`rentrollui.js:559`). The usual method
  discounts cash flow after leasing costs and capital, and capitalises NOI
  at the sale. Fixing this changes saved results: **owner gate** (A3).
- **F2. A second copy of the math.** Recoveries are worked out in `calc.js:347`
  (the Tool) and again in `lease.js:551-555` (the projection). Percentage rent
  is worked out in `calc.js:338` and again in `lease.js:536-540`. The reversion
  is in `deal.js:85` and again in `calc.js:122`. Today the copies agree. They
  will drift once caps and gross-ups land, so A1 folds each into one function
  in `app/engine/`, with golden output identical.
- **F3. Growth counts analysis years, not calendar years.** Expense, recovery
  and sales growth step on `Math.floor(k / 12)` from the first projected month
  (`lease.js:549`, `:539`, `:569`). Market growth, by contrast, compounds by
  days (`:407`). A base year or a cap, which leases state as calendar or lease
  years, needs one dated growth rule. A5 adds it as a convention (decision 4).
  The default keeps today's figures.
- **F4. Expected downtime is rounded to whole months, but expected free rent
  is not.** `Math.round((1 - p) * downtime)` (`lease.js:431`) turns 65 % ×
  6 months into 2. Free rent of 1.05 months is kept to the fraction
  (`:439-448`). Both are defensible, but they should be one documented rule
  (decision 5). The default keeps today's figures.
- Hygiene: the comment at `lease.js:22` says "ARGUS-style lines". A1 rewords it
  to "industry-standard lines".

## 3. Prior art

The repo vendors pdf.js, ExcelJS, fflate, Tesseract and pdf-lib
(`THIRD_PARTY.md`). None of them does cash-flow math, and by rule none may
(`THIRD_PARTY.md:6-7`). The app's own modules above already cover the core.
For the reports, ExcelJS (`workbook.js`) and the print path (`brief.js`) are
reused.

The search was capped at 8 web searches and fetches. The GitHub API was **not
reachable** (this session is limited to its own repositories), and the CRAN
and r-universe hosts were blocked by the session's network settings. So
cre.dcf was judged from search snippets and its CRAN listing text, not from its
code. PyPI's page did not render.

| Candidate | What it does | License | Size | Last release, maintenance | Build-free, vendored, offline | Network, telemetry | Security | Verdict |
|---|---|---|---|---|---|---|---|---|
| cre.dcf (R, CRAN) | Property-level DCF, debt tables, DSCR and debt yield; a vignette builds a lease roll into a DCF | MIT (per CRAN listing) | not checked (host blocked) | 0.0.5, early | no (R) | none known | not reviewed | **Ideas and test cases only.** Its vignette's line order is a useful cross-check; the code is not used |
| Rangekeeper (Python) | A DCF pro forma decomposed into functions; scenarios | **MPL-2.0** | not checked | PyPI releases to Mar 2026 | no (Python) | none known | not reviewed | **Not used.** MPL-2.0 needs approval, the language is different, and it's money logic |
| `@formulajs/formulajs` | Excel functions in JS, including IRR, XIRR, NPV and XNPV | MIT | 2.4 MB unpacked | 4.6.1, active (2026-07) | yes | none | low | **Build ourselves.** Money logic stays ours (rule). We already have `irr`; NPV is one line |
| `financejs` | IRR, XIRR, NPV, amortisation | MIT | small | 4.1.0, idle since 2022 | yes | none | low | **Build ourselves.** Same reason, and unmaintained |
| `financial-fns` | Excel-named IRR, XIRR, NPV in TypeScript | ISC | 215 kB | 0.0.8 (2024) | yes | none | low | **Build ourselves** |
| OSCRE lease abstract standard | Open XML schema of lease abstract fields | IDM licence by use; commercial use means contacting OSCRE | n/a | 2008-2010 | n/a | n/a | n/a | **Not adopted.** Its licence is unclear for commercial use. Our lease shape is already in `types/zlatura.d.ts:91-109` |
| Redline (MIT) | LLM lease extraction with math checks | MIT | n/a | not verified | not a model | uses an LLM service | n/a | **Not relevant** (extraction, not cash flow) |
| Commercial products (PropertyMetrics, Rockport VAL and others) | Lease-by-lease DCF | proprietary | n/a | n/a | no | n/a | n/a | **Not used.** Market context only; nothing read beyond public marketing pages |

No new library. Nothing copied. No outside code in the engine or money logic.

## 4. The design

### 4.1 One engine, cut into named parts

`lease.js` stays the lease engine, and `project()` stays its one entry point.
Pure parts move into `app/engine/` so that the Tools, What if, the impact map
and reports call the same function:

- `engine/recovery.js`: one `recoveryFor(lease terms, pools, year)`. Pro rata,
  base year, stop and fixed, then the gross-up, the cap and the admin fee in
  that order. `calc.js` `recovery()` becomes a wrapper.
- `engine/pctrent.js`: one breakpoint and overage. `calc.js` `percentageRent()`
  becomes a wrapper.
- `engine/returns.js`: `irr` (moved from `deal.js`, re-exported there),
  `npv`, `reversion({ basisNext, exitCap, saleCostPct })` and `multiple`.
  `holdReturns` and `dcf` both call `reversion`.
- `engine/indexation.js`: CPI steps (assumed rate, floor, cap, lag, every N
  months).
- `engine/mla.js`: resolves the profile a lease uses (lease override, then its
  profile, then the default) into today's `Renewal` shape, so `reLease` is
  unchanged.

### 4.2 The lines, in order (the textbook layout, our own words)

1. Potential base rent (contract plus projected at market)
2. Absorption and turnover vacancy (minus)
3. Free rent and abatements (minus)
4. Scheduled base rent
5. CPI increases
6. Percentage rent
7. Recoveries, by pool
8. Other income
9. Total potential income
10. General vacancy (minus, only above the vacancy already modelled; today's rule)
11. Credit loss (minus, new, its own %)
12. Effective gross income
13. Operating expenses, by line
14. NOI
15. TI, LCs, capital items, reserves (minus)
16. Cash flow before debt service
17. Debt service
18. Cash flow after debt service

Each line is registered in `impact.js` `PROJ_LINES`, so "what reads this"
stays complete.

**Rules stated once and tested:**

- Every input carries its unit: monthly or annual, $/SF or total, % or points.
- A blank is "not entered" and shows "can't tell", never $0.
- Physical vacancy and general vacancy are never both taken on the same
  dollar.
- A recovery is never counted when the lease's rent is gross. The U7 check
  (#81) already warns about this.
- Rentable SF is the only area basis for shares unless the lease states another.

### 4.3 Data shape (all additive; absent means today's behaviour)

All of it lives in the deal's rent roll (`deal.rr`) in IndexedDB, and so in
backups and packages. Each field is optional. An old backup reads exactly as
today, because "absent" resolves to the current defaults. That is why golden
output stays identical until a broker uses a new field. Each PR that adds
fields is still a **data-format change and an owner gate**. It gets a schema
step in `app/migrate.js` (a version bump, no rewrite of old values), an
old-backup fixture, and `types/zlatura.d.ts` and `quantizeDeal` updates
(money in cents, rates to 4 dp).

| Field | Shape | Phase |
|---|---|---|
| `rr.settings.profiles` | `[{ id, name, …Renewal, marketRent, marketUnit, marketGrowth, renewPctOfMarket, onExpiry: 'blend' \| 'renew' \| 'vacate' \| 'option', lcSchedule: [{ fromYear, pct }] \| null, lcPsf }]` | A4 |
| `L.profile` | profile id; absent = the default (today's `settings.renewal`) | A4 |
| `L.option` | `{ rate, unit, termMonths }`: an option rent, used only when `onExpiry === 'option'` | A4 |
| `rr.settings.expenses` | `[{ id, category (one of the T-12's 21), annual, growth, recoverable, variablePct }]`; absent = today's `opex`/`recoverable` | A5 |
| `L.recovery` (extended) | `+ pools: id[]`, `baseYear: YYYY` (taken from the expense lines) or `baseAmount` (today), `cap: { pct, kind: 'cumulative' \| 'noncumulative', controllableOnly }`, `adminPct`, `grossUpPct` | A5 |
| `L.cpi` | `{ assumedPct, floorPct, capPct, everyMonths, lagMonths, firstOn }` | A6 |
| `rr.settings.creditLoss` | % of effective income; absent = 0, as today | A7 |
| `rr.settings.capital` | `[{ date, amount, label }]` | A7 |
| scenario `over` | `+ discount, cfBasis, profileOver: { [id]: partial profile }, marketRentPct` | A3, A8 |
| a set's deal list | reuses W1's "Sets"; nothing new stored for the roll-up | A9 |

### 4.4 Money

Stored inputs follow F1 (`engine/money.js`): totals in whole cents, rates to
4 dp. Calculated figures stay in full precision and are rounded only when
shown, as `money.js:4-6` already says. Report rows are each rounded half away
from zero; a report total is the rounded sum of the unrounded rows. Where that
differs from the sum of the shown rows by a cent, the report says so in a
footnote. The alternative, forcing totals to foot, would change figures, so it
is decision 6.

## 5. Phases (one PR each)

| PR | What | Figures change? | Data format | Size |
|---|---|---|---|---|
| **A1** | One engine: `engine/recovery.js`, `pctrent.js`, `returns.js`; `calc.js` and `deal.js` call them (F2); the comment fix. No screen | No: golden identical | none | S |
| **A2** | Cash flow view (read-only): lines 1-18 by year, by lease, by month; XLSX export through `workbook.js`; module toggles | No | none (a UI setting only) | M |
| **A3** | Returns on cash flow: NPV, IRR and multiple on line 16 (F1), discount rate, sale-price basis named | **Yes**: rent-roll-based returns fall by the leasing costs; before/after table | `over.discount`, `over.cfBasis` | S-M |
| **A4** | Leasing assumption profiles, outcomes at expiry, LC by year or $/SF, renewal % of market | No for existing deals | **gate**: `profiles`, `L.profile`, `L.option` | M |
| **A5** | Expense lines, recovery pools, base year from the year's expenses, caps, admin fee, gross-up; the dated growth convention (F3) | No for existing deals | **gate**: `expenses`, `L.recovery` fields | L |
| **A6** | CPI indexation; percentage-rent breakpoint steps | No for existing deals | **gate**: `L.cpi` | M |
| **A7** | Credit loss line; dated capital items; management fee as % of EGI | No for existing deals | **gate**: `creditLoss`, `capital` | S |
| **A8** | Scenarios on assumptions (profile and market overrides), discount × exit cap grid, tornado (shares M6) | No | **gate**: `over.profileOver` | M |
| **A9** | Portfolio roll-up by calendar year over a set (after W1 Sets) | No | none | M |
| **A10** | Reports: cash flow, expirations, assumptions, valuation summary (PDF and XLSX) | No | none | M |

The order is A1 → A2 → A3, then A4 to A7 in any order the owner prefers, then
A8 to A10. Each PR updates `docs/acceptance-matrix.md` (Parts 7 and 9), the
changelog fragment, and `docs/NOW.md` per the release skill.

## 6. Tests

Each PR runs `check:full`. Each new test is first run against
`git archive <old>`, served with `BASE=`, and must fail there.

- **Hand-worked golden cases** (`tests/cashflow-cases.js`). Invented leases,
  with the arithmetic written beside each expected value. Examples:
  - **G1:** 10,000 SF at $30.00/SF/yr, 3 % a year, 2027-01-01 to 2031-12-31.
    Year 1 base rent is $300,000.00, year 2 $309,000.00, year 3 $318,270.00.
  - **G2:** the same lease ends; 65 % renewal, 6 months' downtime, 3 months'
    free on a new lease. Expected downtime 2 months (today's rule), expected
    free rent 1.05 months.
  - **G3:** base year 2027, pool $100,000.00, 3 % growth, 25 % share. The
    2028 recovery is $750.00.
  - **G4:** gross-up. 60 % of $100,000.00 varies with occupancy, the building
    is 80 % occupied, gross-up to 95 %. Variable $71,250.00, pool $111,250.00.
  - **G5:** a 5 % non-cumulative cap against a cumulative one over three years
    of 8 % growth.
  - **G6:** CPI at 2.5 % assumed, a 2 % floor and a 4 % cap, 3-month lag.
  - **G7:** NPV and IRR of a five-year flow with a known closed-form answer.
  - **G8:** a reversion on next year's NOI against next year's cash flow.

  Each case sits at a boundary (leap year, mid-month start, a lease ending on
  the analysis date).
- **Property tests** (`fast-check`, already a devDependency), over generated
  invented rent rolls. The leases' lines add to the property line, and the
  months add to the years. With no vacancy and no concessions, potential rent
  equals scheduled rent. General vacancy is never negative and never takes the
  same dollar as physical vacancy. A cap never raises a recovery, a gross-up
  never lowers the pool, and recoveries never exceed it. A higher discount
  rate never raises NPV, and NPV at the IRR is about 0. An empty field never
  gives 0, and a module turned off changes only its own lines.
- **Reconciliation to documents, never engine against engine:**
  - year 1's expense lines, with growth at 0, against the normalised T-12 by
    category (U1);
  - year 1's scheduled rent, for leases in force all year, against the rent
    roll's in-place rent × 12 (`rentRollSummary`);
  - the OM's stated rent against the roll's check (1b).

  Gaps follow the existing NOI-three-ways thresholds.
- **Mutation checks** (quality-gates skill) on each new engine function: flip
  `max`/`min` in caps, drop the gross-up, swap the order of cap and admin fee,
  use month for year, take vacancy twice. Each mutant must fail a test.
- **Golden outputs:** `tests/analyze-golden.test.js` (618) and
  `golden.mjs --diff` (646) identical in every PR except A3. A3 shows a
  before/after table for the owner, with invented deals only.
- **Old backups:** a pre-A4 backup fixture opens, migrates, projects to the
  same figures, and round-trips through backup and restore.
- **Browser:** the full suite on Chromium at phone and desktop sizes, axe, and
  character-by-character typing for each new input kind (%, $/SF, months,
  year, dates).

## 7. Performance budget

- An edit shows within 150 ms on the main thread (`perf-flow`). The projection
  already runs in the worker (`projector.js`), and the cash-flow view shows
  the last result while the new one is worked out.
- Projection in the worker for 500 leases over 10 years: A1 measures today's
  time as the baseline. Each later PR may add at most 25 % to it, and the
  total must stay under 1 s with the CPU slowed 4×. Recoveries per pool
  are worked out once per lease-year, not per month.
- A two-way grid (5 × 5) and a tornado reuse one projection and vary only the
  valuation inputs, so they don't re-project. Where an input does need a
  re-projection (market rent), the grid runs in the worker and fills in as
  results arrive.

## 8. UX principles

- **Phone first.** One column, five years in view, swipe for more, and line
  labels pinned. The table doesn't shrink text below the app's minimum.
- **Uncluttered.** Module toggles hide lines that are zero by design, never
  lines that are zero by data. A blank input shows "not entered".
- **The source is always visible.** "Documented", "projected" and "assumption"
  are told apart by a word, not only by colour.
- **Assumptions in one place:** the profiles, expenses and valuation inputs,
  each with its unit beside the field.
- **Reachable.** Everything today's rent roll projection shows stays where it
  is; Cash flow adds a view and removes nothing.
- **Accessible.** The tables have row and column headers, and axe runs on
  every screen.

## 9. Cost

- No new library, no service and no running cost. Everything runs on the
  device and works offline.
- Build effort, roughly:
  - A1, A3 and A7 are small;
  - A2, A4, A6, A8, A9 and A10 are medium;
  - A5 is large: recoveries are the hardest part to get right.
- Each money or data-format PR (A1, A3 to A8) needs one designer note and one
  designer review (Opus). The rest is main-session Sonnet.

## 10. Decisions for the owner

1. **Approve the clean-room rule in section 0** as a standing rule
   (`docs/working-rules.md`). *Recommend: yes.*
2. **Returns on cash flow after leasing costs (F1, A3).** This changes
   rent-roll-based IRR, NPV and multiple on saved deals. *Recommend: yes, shown
   as a before/after table. The old NOI basis stays one tap away, labelled.*
3. **Sale-price basis.** Next year's NOI ÷ exit cap (today), or next year's
   cash flow before debt service. *Recommend: NOI (today's and the usual
   appraisal practice), with cash flow as a named option.*
4. **Growth timing (F3).** Analysis year (today) or calendar year for
   expenses, recoveries, caps and base years. *Recommend: the analysis year
   stays the default for existing deals (no figure change). New deals with
   expense lines (A5) use the calendar year, because leases state base years
   and caps that way. A convention in `engine/conventions.js`, shown on
   screen.*
5. **Expected downtime (F4).** Keep rounding to whole months, or keep the
   fraction like free rent. *Recommend: keep whole months (today's figures
   unchanged), and say so on screen.*
6. **Report totals.** Rounded total of the unrounded rows with a footnote
   (recommended), or forced to foot.
7. **Where it lives before W1 merges.** On the deal page under the rent roll
   (recommended), or wait for the Underwrite tab.
8. **Order of A4-A7.** *Recommend: A5 (expenses and recoveries) first,
   because NNN and base-year deals are the common broker case. Then A4, A6,
   A7.*
9. **CPI source.** The broker types an assumed rate, with optional typed
   index values (recommended). Any index download would be a network and
   licence decision of its own, later.
10. **Each schema step (A4-A8)** is approved PR by PR, with its old-backup
    fixture. *Recommend: approve the shapes in 4.3 now in principle; each PR
    still stops at the gate.*

# Proposal: role workspaces (one app, a lens for each person in real estate)

Status: **proposal, docs only. Nothing is built.** This is the design gate
before building. The owner's request (2026-11-04), in its own words: *"major
tabs separating each major function this software could be used (debt
lenders/financiers, developers, brokers, general underwriting section, etc.;
think of more ideas and tabs to add covering each individual person in real
estate: individual investors, retail investors, small businesses looking to
expand into real estate, realtors, analysts, etc.)"*. The owner has approved
all recommendations in advance, so this document recommends and decides.
It names the gates that stay hard at build time: data format, financial
meaning, and consumer-facing wording.

**In one paragraph.** Nine **workspaces** (Brokerage, Underwriting, Lending,
Development, Investing, Occupier, Asset management, Capital raising, Leases
and documents), each a **lens over the same app**. The active workspace
rebuilds Home and sets the order of tools, the "New…" menu, checklists and
exports. It never removes anything, and it never has its own copy of a deal
or of the maths. On the phone, the five-slot bar stays as it is. The
workspaces sit as tabs at the top of Home: up to three pinned chips, plus a
switcher sheet with all nine. On desktop they are a "Workspaces" list of tabs
in the rail. One person can hold several (a broker who also invests pins
Brokerage and Investing). The first PR is cheap: the switcher, a first-run
picker and nine Homes built only from tools that already exist (about 30 of
them are in `app/toolsui.js` and `app/toolsdefs.js`). After that, one
workspace at a time, in priority order, adding the calculators each one
lacks.

## What this builds on (and does not repeat)

| Source | Taken as given | Changed here |
|---|---|---|
| `ui-revamp-addendum.md` 4.1-4.6 (My workspace, modules, roles, tour, Help, `ui.prefs`) | Modules can be hidden only by the broker; hidden means still in search, My workspace and Help; the tour; `ui.prefs` carried by backups (decision 8) | D3's four **roles** become nine **workspaces**, and a person can pin up to three. The rule "a role only decides what opens first" stays and is widened to tools, checklists and exports, still by order only (2.4). |
| `platform-expansion.md` 1.1-1.4 (five slots, sections inside hubs, role never hides), 3 (M1-M9), 4 (gates), 5 (do not build) | Every rule in 1.4, including "no new top-level tab". M1-M9 keep their numbers and gates. | Its Broker/Analyst/Developer/Owner maps to brokerage/underwriting/development/investing. Each workspace places M1-M9; none of them is redefined. |
| `underwriting-evolve.md` (P1-P12, gap map), `argus-class-cashflow.md` (A1-A10) | The Underwriting workspace *is* that roadmap | Nothing added to it beyond two appraiser items (3.9) |
| `documents-hub.md`, `lease-abstract.md` (L1 built, L2/L3 planned) | The Leases and documents workspace is built from these | Critical-dates register across deals (3.10) |
| `comp-enrichment-and-sources.md`, `feature-ideas.md`, `competitive-gap.md` | Comp importer C1-C2, 1031 clock idea 8, credit record, Bid Leveler, football field 7.3, listing copy 13.1 | Brokerage packages are made from these (3.3) |

The app today (main 4.7.97): bar and rail hold Home, Deals, Underwrite, Comps
and Tools, with Review shown while items wait (`index.html:49-70`,
`:270-279`; views in `app/ui.js:78`). Home has seven sections: Continue
working, Needs attention, Pipeline, Key dates, Tasks, Contacts, Recent
activity (`app/home.js:121-409`). Tools has eight groups (`toolsdefs.js:27`).
Underwrite links to the calculators in Tools (`underwrite.js:330-341`). Search
lists every tool (`command.js:52`). Settings has seven sections
(`settings.js:110-214`). There is no `ui.prefs`, no `features.js` and no
feature map on main yet: revamp phase 2 and D3 are not built.

---

## 1. Who uses real estate software, and what Zlatura already does for them

Priority: **P1** = the core of the product today, or nearly served already;
**P2** = high value, with new calculators needed; **P3** = later, or served
mostly by other workspaces. "Ws" = the workspace that serves them.

| Persona | Jobs | Numbers they live by | Served today (existing) | Missing | Ws | Pri |
|---|---|---|---|---|---|---|
| **Investment sales broker** (commercial) | Win listings, price, market, run offers, close | Cap rate, $/SF, $/unit, NOI, DOM, commission | OM reader (`om.js`), comps and CoStar import (`costar.js`, `compimport.js`), comp set check, Against your comps (`dealui.js:1015`), Offer and seller net (`toolsui.js:73`), Commission and splits (`toolsdefs.js:248`), fee record, pipeline and tasks (`pipeline.js`, `crm.js`), key dates `.ics`, brief (`brief.js`), firm template filler (`template.js`) | BOV and offer packages as one action; Bid Leveler, football field (both planned) | Brokerage | P1 |
| **Landlord-rep leasing broker** | Lease space, proposals, renewals | Net effective rent, TI, free months, $/SF/yr | NER (`toolsui.js:94`), Compare lease proposals (`toolsdefs.js:266`), Renewal vs replacement (`:282`), Escalation (`:295`), Lease-up (`:320`) | Proposal and counter history per space (later) | Brokerage | P1 |
| **Tenant-rep broker** | Find space, compare offers, negotiate | Total occupancy cost, NER, NPV of lease | The same leasing tools, seen from the tenant's side | Occupancy cost per year for the tenant; space-need estimate | Occupier | P2 |
| **Realtor / residential agent** | List and sell homes, small rentals | Commission split, list-to-sale, days on market | Commission and splits, contacts, tasks, key dates, 1031 clock | A residential CMA is **not targeted**: the comp model is commercial (`compmodel.js`). The mortgage estimate comes from Investing. | Brokerage | P3 |
| **Acquisitions / investment analyst** | Screen, underwrite, model | NOI, IRR, multiple, CoC, DSCR, going-in and exit cap | Underwrite tab (`underwrite.js`), the whole deal page, T-12, rent roll, What if (`dealui.js:1445`), DCF, NOI bridge, the sensitivities (`toolsdefs.js:32-226`), Data QC, Review | Cash flow A2-A10 and P1-P12 (planned) | Underwriting | P1 |
| **Underwriter** (general) | Check the inputs, normalise, sign off | Normalised NOI, expense ratios, occupancy | Normalised NOI (U1/U2), strict review, Data QC, OM red flags, the reconcile checks (`reconcile.js`) | Sign-off P11, Reconcile view P3 (planned) | Underwriting | P1 |
| **Appraiser** (income approach) | Value by income and sales comparison | Cap rate, DCF value, adjusted $/SF | Direct cap, DCF, Value across cap rates (`dealui.js:1081`), comps | Sales comparison adjustment grid; reconciling the approaches with stated weights. Never called an appraisal. | Underwriting | P3 |
| **Commercial loan officer / credit analyst** | Size, structure and monitor loans | DSCR, debt yield, LTV, LTC, loan constant, break-even occupancy | Loan sizing with the binding test (`toolsui.js:52`, `engine/debt.js:67`), Amortization, Refinance, Floating-rate stress, Maturity risk, Financing costs, Break-even, deal Financing card (`dealui.js:1341`) | Loan book across deals, covenant check, quote comparison, term-sheet checklist | Lending | P1 |
| **Mortgage / debt broker, capital markets** | Shop lenders, compare quotes | All-in rate, points, proceeds, IO, prepay | Loan sizing, Financing costs, Refinance | Side-by-side quote comparison with an effective cost | Lending | P1 |
| **Developer** (ground-up and value-add) | Feasibility, entitlements, budget, draws, lease-up, exit | Yield on cost, development spread, residual land, profit on cost, LTC | Residual land, Yield on cost, Construction draws, Lease-up (`toolsdefs.js:320-365`), DC zoning table (`zoning.js`), Distribution waterfall | M1-M4 and M8 (planned in `platform-expansion.md`) | Development | P2 |
| **Individual investor, small multifamily / rentals** | Buy and hold 1-20 units | Cash flow per month, CoC, cap rate, DSCR | Quick value, Loan sizing, Hold returns with cash-on-cash (`deal.js:78`), Amortization, Break-even | A rental pro forma in monthly terms; "estimate, not advice" wording | Investing | P2 |
| **House hacker** | Live in one unit, rent the others | Net housing cost, CoC | — | House-hack view (on the rental pro forma) | Investing | P2 |
| **BRRRR investor** | Buy, rehab, rent, refinance, repeat | ARV, cash left in the deal, CoC on cash left | Refinance and cash-out (`toolsdefs.js:134`), Financing costs | A BRRRR chain built from existing functions | Investing | P2 |
| **Fix-and-flip** | Buy, renovate, sell | Profit, ROI, months held | Offer and seller net (sale side) | Flip calculator | Investing | P2 |
| **Retail / first-time investor** | Learn, compare, decide whether to start | Monthly payment, affordability, cash needed | Converter, Amortization | Mortgage affordability with ratios the user types (never presets) | Investing | P2 |
| **1031 exchange investor** | Identify and close inside the deadlines; match value and debt | Day 45 and day 180, value and debt replaced | 1031 exchange clock (`toolsui.js:112`), key dates `.ics` | Replacement-target checklist (no tax maths) | Investing | P2 |
| **Small business / owner-user** | Lease or buy, fund the build-out, afford the payment | Total cost of occupancy, payment as a share of cash flow, equity in | Compare lease proposals, NER, Amortization, Loan sizing | Lease vs buy; SBA-style structure (504 or 7(a)); build-out (TI) gap | Occupier | P2 |
| **Corporate real estate / tenant** | Portfolio of leases, renewals, cost per head | Occupancy cost, SF per person, rent ÷ sales | Lease abstracts (L1), key dates, escalations, recoveries | Space-need and occupancy-cost ratio | Occupier | P3 |
| **Asset manager** | Hold or sell, budget, leasing plan, refinance | NOI against budget, WALT, rollover, DSCR | WALT and rollover (`toolsui.js:128`), rent roll, T-12, credit record, Maturity risk, Review | M9 budget vs actual (planned), A-series cash flow (planned) | Asset mgmt | P3 |
| **Property manager** | Collections, CAM, renewals, vendors | Recoveries, arrears, renewals due | Rent roll with Past Due noted (#46), Expense recoveries (`toolsdefs.js:312`), key dates | CAM reconciliation (year-end true-up) | Asset mgmt | P3 |
| **Syndicator / GP** | Raise, structure, report | Promote, pref, IRR, multiple, fee load | Distribution waterfall (`toolsdefs.js:226`), Hold returns and fees (`:186`), confidential tag | M5 investor register (planned); an LP's view of a deal | Capital raising | P3 |
| **LP / passive investor** | Read a deal, check the GP's numbers | Pref, IRR, multiple, fees | Waterfall, Returns sensitivity | LP view (above), read-only | Capital raising | P3 |
| **Legal / paralegal / lease abstractor** | Abstract leases, track critical dates, check estoppels | Dates, notice periods, options | Lease abstracts with page and quote (`abstracts.js`), Documents (PDF pages, Convert), document registry (`dd.js`), `.ics` | Critical-dates register across deals; L2/L3 and D4 estoppels (planned) | Leases and docs | P3 |
| **Accountant** | CAM, straight-line rent, budgets | Recoverable pool, straight-line rent | Recoveries, escalation schedule, CSV exports | Straight-line schedule (accounting meaning: gated); **no** ledger, K-1s or tax | Asset mgmt | P3 |
| **Title, escrow and closing coordinators** *(added)* | Deadlines, document checklists | Dates | Key dates, 1031 clock, document registry | Closing checklist as tasks (2.4) | Leases and docs | P3 |
| **Property-tax consultant** *(added)* | Reassessment and appeals | Assessed value, tax per year | Assessment question (OM red flags) | P8 reassessment (planned) | Asset mgmt | P3 |
| **Site selector / land broker** *(added)* | Rank sites | Price per buildable SF, residual against ask | Residual land, zoning lookup | M4 site scorecard (planned) | Development | P3 |
| Students and trainees *(added)* | Learn the methods | All of the above | Example deal, Help and tour (D5/D6 planned) | — | any | — |

**Not targeted.** These are left out on purpose. Wholesaling and assignment
contracts carry licensing risk in many states. Insurance brokers: there is no
data for them. Residential CMA. Tenant or buyer screening: never built
(section 4).

---

## 2. Information architecture

### 2.1 Three models weighed

| Model | What it is | For | Against | Verdict |
|---|---|---|---|---|
| A. A bar per workspace | Each workspace has its own bottom bar and screens | Feels like separate products | Nine bars to learn. A tool reachable in one workspace but not in another. Tests multiply by nine. Breaks `platform-expansion.md` 1.4 rule 2. | **Rejected** |
| B. A "practice areas" hub | A sixth bar slot, or a grid page of areas | One obvious place | Six slots breaks the five-slot rule (Material's bar takes 3-5 destinations [1]; Apple warns against crowded and overflow tabs [2]). Every task costs one extra tap. | Used only as the **switcher sheet** |
| C. **A workspace lens** | One shell. The active workspace builds Home and orders tools, the "New…" menu, checklists and exports. Workspaces show as tabs: chips on phone Home, a rail list on desktop. | Same deal, same engine, same bar. Several roles at once. Matches the role-centre pattern: the role sets the home page, and everything else stays reachable [3]. | The bar itself does not change. Answer: the workspace tabs sit one level down, always visible on Home and in the rail. | **Adopt** |

This is how the owner's "major tabs" are read: the **workspace tabs** are major
tabs, one per function, and they choose the lens. The five bar slots stay the
places where the work is done (Deals, Underwrite, Comps, Tools), because
every person uses them.

### 2.2 Bar slots and where workspaces live

- **Phone bar: five slots, unchanged:** Home, Deals, Underwrite, Comps, Tools.
  Review still appears while items wait. The new look keeps its own five,
  as approved.
- **Phone Home, top:** the workspace name as a button. It opens the
  **switcher sheet**: all nine workspaces, grouped, each with one line. Below
  the button, a row of **up to three pinned workspace chips** (a
  `role="tablist"` row). Tapping a chip switches workspace.
- **Desktop rail:** a "Workspaces" heading, with the pinned workspaces as
  tabs (`aria-current` on the active one) and "All workspaces…" under them.
  In the new look this sits next to the addendum's "My workspace" heading
  and does not replace it: My workspace shows or hides modules, while
  Workspaces chooses the lens.
- **Search:** "Workspace: Lending" and its siblings are palette actions.
  Every tool and section stays in the palette under every workspace.
- **Settings → Workspace:** choose and pin, plus "Show the picker again".

### 2.3 Several roles: a broker who also invests

`pinned` holds 1-3 workspace ids, and `active` is one of them. Switching is
one tap and is remembered. Nothing on a deal depends on the workspace, so the
same deal opens identically in every workspace. The workspace changes only
what Home shows around the deal and which tools come first. A broker who
also invests pins Brokerage and Investing and can move between them at any
time.

### 2.4 What a workspace changes, and what it never changes

| Changes (order and composition only) | Never changes |
|---|---|
| **Home:** which cards appear and in what order. Cards come from the existing seven plus workspace cards built from existing functions (e.g. Lending's "Loan book"). Brokerage Home = today's Home, card for card. | The engine: `app/engine/`, `app/deal.js`, `app/calc.js`. **No second copy of any formula.** A workspace card calls the same function as the deal page, and a test compares the figures. |
| **Tools:** a "For Lending" group listed first, then all eight groups in today's order | The set of tools: identical in every workspace, as is search |
| **Underwrite:** which calculators are linked under "Calculators" | Deals, comps, tasks, contacts, documents: one store, shared |
| **"New…" menu order** and the default starter (e.g. Development: "New project from land and budget", which opens existing tools) | Saved data: no deal field records the workspace. No `migrate.js` step in WS0. |
| **Checklists:** each workspace offers its lists (term sheet, closing, entitlement, buyer DD, move-in). A list becomes ordinary **tasks** on the deal (`crm.addTask`), so ticking needs no new stored field. | Labels on controls and figures. "NOI" is NOI everywhere, and accessible names do not change. |
| **Vocabulary:** Home headings and empty-state lines only (Lending: "Loan requests"; Development: "Projects") | Export contents and column headers |
| **Exports:** which export is first in the menu (Lending: the loan summary print) | Whether any feature is reachable. Nothing is hidden by a workspace, ever. Hiding stays the broker's own act in My workspace (addendum 4.2). |

### 2.5 First run

On a device with **no deals and no `ui.prefs`**: one sheet, "What do you work
on? Pick up to three. You can change this any time." It shows nine
checkboxes in three groups (Sell and lease; Analyse and lend; Own, build and
invest), with one line each. **Skip** = Brokerage. The first one picked is
active. The sheet says: "Every tool stays in Tools and search." Devices that
already have deals never see the picker. They start on Brokerage, which is
today's Home, and get one dismissible line on Home: "New: workspaces for
lending, investing, development… Choose". When the tour (D6) is built, its
step 1 *is* this picker, not a second one.

### 2.6 Wireframes

Phone, 390 px, Lending active, Brokerage and Investing pinned:

```
+--------------------------------------+
| [mark] [brand]               (?) (Q) |
+--------------------------------------+
| Tuesday, November 4                  |
| Good morning                         |
| [ Lending  v ]   <- switcher sheet   |
| (Brokerage) (*Lending*) (Investing)  |  <- pinned workspace tabs
+--------------------------------------+
| Loan requests                    (4) |
|  Example Plaza   LTV 62%  DSCR 1.31x |
|  Sample Court    LTV 70%  DSCR 1.08x!|  <- below its typed minimum
|  ...                    Open all >   |
+--------------------------------------+
| Lending tools                        |
|  Loan sizing          Amortization   |
|  Refinance            Floating stress|
|  Maturity risk        Financing costs|
|  All tools >                         |
+--------------------------------------+
| Checklist: term sheet  [Add as tasks]|
| Tasks . Key dates . Recent activity  |
+--------------------------------------+
| Home  Deals  Underwrite  Comps  Tools|
+--------------------------------------+
```

The switcher sheet lists the nine in three groups (Sell and lease; Analyse
and lend; Own, build and invest) with a checkbox to pin each, and the line
"Pin up to 3. Every tool stays in Tools and search."

Desktop, 1280 px:

```
+----------------+---------------------------------------------------+
| [mark] [brand] | Lending                          [Workspace v]    |
| (Q) Search  ^K |                                                   |
| Home           | +-- Loan requests -----------+ +-- Lending tools -+
| Deals          | | Deal     LTV  DSCR  DY  Mat| | Loan sizing      |
| Underwrite     | | Example  62%  1.31 9.4% 2029| | Amortization     |
| Comps          | | Sample   70%  1.08 7.1% 2027| | Refinance ...    |
| Tools          | +----------------------------+ +------------------+
| - Workspaces - | +-- Covenant watch (L2) -----+ +-- Checklist -----+
| > Lending      | | 1 below min DSCR, 1 can't  | | Term sheet       |
|   Brokerage    | | tell (no NOI)              | | [Add as tasks]   |
|   Investing    | +----------------------------+ +------------------+
|   All...       | Tasks . Key dates . Recent activity               |
| - Workspace -  |                                                   |
| Settings       |                                                   |
+----------------+---------------------------------------------------+
```

### 2.7 Stored data (WS0)

The `ui.prefs` kv record already approved in the addendum (decision 8) is
created by WS0. It holds `workspace: { v: 1, active: "brokerage", pinned:
["brokerage"], picked: true }`, and D3 later adds `modules` and `tour` to the
same record. Ids come from the frozen list in `app/workspaces.js`. An unknown
id is dropped. `pinned` is trimmed to 3, and an `active` that is not pinned
is added to `pinned`. A missing record falls back to Brokerage. It is carried
by backups like every kv key (`backup.js:94`). `BACKUP_VERSION` stays 2,
nothing changes on a deal, and there is no migration step. Old-backup
fixtures (4.7.3, 4.7.70, 4.7.97 without the key) restore to Brokerage.
**D3's `role` is not built**: `workspace` replaces it, and the addendum's
four roles map onto four of the nine ids.

The registry `app/workspaces.js` is pure and frozen. Each entry holds `id`,
`name`, `line`, `homeCards[]`, `tools[]` (ids from `toolIndex()`),
`newMenu[]`, `checklists[]`, `exports[]` and `words{}`. The registry holds no
logic and no numbers.

---

## 3. Build plan: one PR per item

Marks: **E** existing and surfaced, **U** existing but not surfaced
(present in code, not on a screen for this person), **N** new. Size S/M/L.
Gates: **money** = designer money note first; **review** = designer review
of the finished diff; **fmt** = data format (owner); **meaning** = financial
meaning (owner, shown as the two readings); **words** = consumer wording
(owner reads the exact text). Every PR: invented fixtures only, tests that
fail on `git archive` of the old code, mutation checks, `check:full`, axe,
390 px, 150 ms per edit, character-by-character typing for new inputs,
golden identical.

### 3.1 WS0: the switcher and nine Homes from existing tools (first PR, M)

`app/workspaces.js` (registry) and `app/workspaceui.js` (switcher sheet,
chips, picker, Settings section). `home.js` gets one entry point,
`composeHome(ws)`: Brokerage returns today's sections unchanged, and the
others reorder those sections and add one "<Workspace> tools" card that opens
existing tools through `openToolById`. `toolsui.js` gets the "For <ws>" group,
`command.js` gets the workspace actions, and `underwrite.js:330` gets
workspace calculator links. No new maths, no deal change, no new library.

Tests (each fails on old code because the module or control is absent):
- `tests/workspaces.test.js`: every registry tool id exists in `toolIndex()`;
  the **set** of tools in Tools and in search is identical for all nine;
  sanitising drops unknown ids, trims to 3, repairs `active`; old-backup
  fixtures restore to Brokerage; Brokerage's section ids equal today's.
- `workspace-flow`: picker on an empty device; switching changes Home and
  Tools order; every bar slot stays; axe on sheet, chips and each Home at 390
  and 1280; a switch within 150 ms; arrow keys across chips, Escape closes.
- Mutations that must fail a test: a workspace drops a tool; sanitise keeps
  an unknown id; Brokerage Home gains a card; switching writes to a deal.

### 3.2 WS order after WS0

Priority follows value ÷ new work: Lending (almost everything exists),
Investing, Occupier, Development (follows `platform-expansion.md`), Asset
management, Capital raising, Leases and documents, and Brokerage and
Underwriting packages alongside, as their planned items land. New engine
functions live in `app/engine/` (e.g. `engine/occupy.js`,
`engine/smallrental.js`). Each one is built on `monthlyPayment`,
`debtService`, `balanceAfter` (`engine/debt.js:20-50`), `irr` (`deal.js:42`)
and `reversion` (`engine/returns.js:13`), never on copies of them.

### 3.3 Brokerage (P1)

| Item | Mark | Size | Gate |
|---|---|---|---|
| Home = today's (pipeline, key dates, tasks, contacts) | E | — | — |
| Offer and seller net, Commission and splits, fee record, brief, template filler, comp set check | E | — | — |
| BOV package: football field 7.3 + comps glance + brief, one print | N (after 7.3) | S | review |
| Offer package: offer tool + brief + LOI checklist as tasks | N | S | — |
| Bid Leveler, listing copy 13.1, buyer match 17.2 | planned elsewhere | — | their own |

### 3.4 Lending (P1, first after WS0)

| Item | Mark | Size | Gate |
|---|---|---|---|
| Loan sizing (binding test), Amortization, Refinance, Floating stress, Maturity risk, Financing costs, Break-even | E | — | — |
| **L1 Loan book:** every deal's LTV, DSCR, debt yield and maturity from `analyze()`, read-only, sortable; "can't tell" when NOI is blank | U | S | review (the figures must equal the deal page's: a test) |
| **L2 Covenant check:** min DSCR and min debt yield come from `deal.loan` (they exist); max LTV, min occupancy and the test basis (trailing T-12 or in-place) are new fields → pass / fail / can't tell | N | M | **fmt** (optional `deal.loan.covenants`, one silent step), **meaning** (which NOI the test uses: ask, never assume) |
| **L3 Quote comparison:** 2-4 quotes (rate, points, fees, IO, amortisation, term) → payment, proceeds, balance at maturity, effective cost as a monthly IRR on net proceeds | N | M | **money**, **meaning** (effective cost is not an APR; say so) |
| L4 Term-sheet and closing checklists as tasks | N | S | — |
| Yield maintenance and defeasance estimates | N | L | deferred: needs typed Treasury yields and a meaning decision |

### 3.5 Investing: individual and retail (P2)

| Item | Mark | Size | Gate |
|---|---|---|---|
| Quick value, Loan sizing, Hold returns (CoC), Amortization, Refinance, 1031 clock | E | — | — |
| **I1 Rental pro forma (1-20 units):** rents per unit per month, vacancy %, taxes, insurance, repairs, capex and management (each typed as $/yr or % of rent, with the unit shown), HOA → monthly and annual NOI, cash flow, CoC, cap, DSCR | N | M | **money** (monthly against annual is the prohibited mix-up: one conversion point, tested), **words** |
| I2 House hack: the owner's unit is left out of rents; net housing cost per month | N | S | money, words |
| I3 BRRRR: purchase + rehab + carry → refinance at a typed ARV and LTV (the existing `refinance`) → cash left in, CoC on cash left | N | S-M | money, words |
| I4 Flip: purchase, rehab, months, carry, sale costs → profit, ROI; annualised shown two ways or not at all | N | S | money, **meaning** (simple or compound annualising: decided as both, labelled) |
| I5 Mortgage affordability: income and debts typed, ratio limits **typed by the user** (none preset) → payment that fits, price range | N | M | money, **words**; no credit scoring and no "you qualify" |
| I6 1031 replacement-target checklist (value and debt replaced, the dates) | N | S | **words** (not tax advice; no boot or tax figure) |

### 3.6 Occupier: owner-users, small business, tenant rep, corporate (P2)

| Item | Mark | Size | Gate |
|---|---|---|---|
| Compare lease proposals, NER, Renewal vs replacement, Escalation, Recoveries, Percentage rent | E | — | — |
| **O1 Lease vs buy:** occupancy cost of leasing against owning over a typed horizon (loan, taxes, upkeep, typed appreciation, sale at the end through `reversion`), NPV at a typed rate, crossover year | N | M-L | **money**, **meaning** (pre-tax only, stated; depreciation and interest deductions left out and named) |
| **O2 SBA-style structure:** 504 (bank, CDC and equity shares, commonly 50/40/10 [4], shown as **editable** starting values: "check current program rules with your lender") or a single 7(a)-style loan → blended payment, equity in, payment as a share of the business's typed cash flow | N | M | money, **meaning** (no program rule built in as fact), **words** |
| O3 Build-out gap: cost against TI allowance → out of pocket, or the excess amortised into rent at a typed rate | N | S | money |
| O4 Space need (headcount × SF per person, as a range) and occupancy cost ÷ sales | N | S | — (no money logic beyond a ratio) |

### 3.7 Development (P2)

| Item | Mark | Size | Gate |
|---|---|---|---|
| Residual land, Yield on cost, Construction draws, Lease-up, Waterfall (JV), zoning lookup | E | — | — |
| M2 development pro forma, M3 draws and capital forecast, M8 entitlement timeline, M1 zoning catalogue, M4 site scorecard | planned (`platform-expansion.md` 3) | as there | as there (money, fmt, meaning) |
| D-1 Development Home: projects, draws due, the entitlement checklist as tasks | U → N | S | — (after M2) |

### 3.8 Asset management, property management, accountants (P3)

| Item | Mark | Size | Gate |
|---|---|---|---|
| WALT and rollover, rent roll, T-12, credit record, Maturity risk, Review | E | — | — |
| A-1 Rollover calendar across deals (WALT + `.ics`) | U | S | — |
| M9 budget against actual | planned | M | as there |
| **A-2 CAM reconciliation:** actual recoverable pool through `engine/recovery.js` against estimates billed per tenant → true-up due or credit | N | M-L | **money**, **fmt** (estimates billed per lease), meaning (gross-up: ask) |
| A-3 Arrears view from the rent roll's Past Due (#46): totals only, no scoring of tenants | U | S | review |
| A-4 Straight-line rent schedule | N | S-M | **meaning** (accounting): owner, labelled "not accounting advice" |

### 3.9 Underwriting, analysts, appraisers (P1)

The existing plan: P1-P12 and A1-A10. This proposal adds only two items:
U-1, a sales comparison grid (typed % adjustments per comp → adjusted $/SF;
M; money, meaning), and U-2, a reconciliation of approaches with weights the
user types (S; meaning). Both are labelled "not an appraisal".

### 3.10 Capital raising (P3) and Leases and documents (P3)

- **Capital raising.** C-1, an LP view: one investor's contribution →
  distributions through the existing `waterfall` → IRR and multiple (S-M;
  money). Then M5 (planned: fmt, retention). Pages say "not an offering
  document"; there is no investor solicitation and no marketing to the public.
- **Leases and documents.** Abstracts, Documents and the registry exist. D-1,
  a critical-dates register across deals from abstracts and key dates (S;
  review). L2/L3 and D4 as already planned.

### 3.11 Order and size

| # | PR | Size | Gate |
|---|---|---|---|
| 1 | WS0 switcher, picker, nine Homes, Tools and search order | M | review (navigation); fmt already approved (`ui.prefs`) |
| 2 | L1 Loan book + L4 checklists | S | review |
| 3 | I1 Rental pro forma (+ the shared "estimate, not advice" line) | M | money, words |
| 4 | I2-I4 house hack, BRRRR, flip | M | money, meaning (I4) |
| 5 | O1 Lease vs buy | M-L | money, meaning |
| 6 | O2 SBA-style + O3 + O4 | M | money, meaning, words |
| 7 | L3 quote comparison | M | money, meaning |
| 8 | L2 covenants | M | fmt, meaning |
| 9 | I5 affordability + I6 1031 checklist | M | money, words |
| 10+ | Development after M2; A-1..A-4; U-1/U-2; C-1; D-1; Brokerage packages | S-M each | as listed |

---

## 4. Truthfulness and risk

- **Calculations and checklists, never advice.** Every result in Investing,
  Occupier, Lending and Capital raising, on screen, printed and exported,
  carries one line: *"Estimate from the figures you typed. Not investment,
  lending, tax or legal advice."* It lives in one constant in a new
  `app/disclaim.js`. A test asserts the line on each of those tools,
  and a mutation that removes it from one tool must fail.
- **No automated lending decisions.** Lending shows "passes your typed test",
  "fails", or "can't tell", never "approve", "decline" or a score. No credit
  scoring. Affordability (I5) uses only ratios the user typed.
- **No people screening.** No tenant, buyer or borrower screening, ranking or
  scoring of individuals. No attribute about a person that fair-housing or
  fair-lending law protects (race, colour, religion, sex, disability,
  familial status, national origin, age, marital status, source of income)
  is collected or used. HUD's 2024 guidance on algorithmic tenant screening
  and targeted housing ads [5] is why: whether it is still in effect is
  UNVERIFIED, and the rule stands either way. Arrears (A-3) are totals per
  unit, never a judgement about a tenant.
- **Program rules are typed, not built in.** SBA percentages, caps and
  owner-occupancy thresholds change and sources disagree (50% or 51% [4],
  UNVERIFIED against sba.gov). They are editable starting values with a dated
  note.
- **Tax.** No tax figure anywhere: no depreciation, boot or capital-gains
  maths. 1031 stays a clock and a checklist.
- **Securities.** The LP view and M5 are private records for a deal the user
  already has. There is no offering, solicitation or public sharing.
- **Prohibited mix-ups (Part 21.2)** are checked in every money note:
  monthly against annual (I1, I2, O1), percent against points (L3 points,
  ratios), blank treated as zero (every input says "can't tell"), and nothing
  counted twice (I3: rehab is never in both the cost and the ARV loan).
- **Scope not touched:** accounts, logins, sharing between users, servers,
  and data retention beyond the kv record already approved. No scraping and
  no outside request (`repo.test.js` stays as it is).
- **Status words:** each item ships as "Implemented, not fully tested" until
  it has been tested on a real phone. Safari, a real iPhone and real lender or
  SBA documents were not available for this proposal.

---

## 5. Prior art

The search was capped at 6, run 2026-11-04. Our own code came first:
`THIRD_PARTY.md` lists no navigation or calculator library, and none is
needed. Every calculator in section 3 is built on `app/engine/` and
`app/calc.js`.

| Candidate | What it does | Licence | Size | Maintenance | Build-free, offline | Network | Security | Verdict |
|---|---|---|---|---|---|---|---|---|
| Our own `toolsdefs.js` groups, `toolIndex()`, `command.js`, `home.js` sections | Tool registry, search, Home cards | ours | 0 new KB; WS0 adds about 8-12 KB | live | yes | none | ids from a frozen list | **build on it** |
| Addendum D3 (My workspace, roles), `ui.prefs` | Show and hide modules, role order | ours (approved, not built) | — | — | yes | none | — | **adapt**: `role` becomes `workspace` |
| Material 3 navigation bar guidance [1] | 3-5 destinations, labels | docs (pattern) | — | current | n/a | n/a | n/a | **adopt the rule**: keep five slots |
| Apple HIG tab bars [2] | Few tabs, avoid overflow; a sidebar on larger screens | docs (pattern) | — | current | n/a | n/a | n/a | **adopt**: chips on phone, rail on desktop. The "5 max" cap was not confirmed in the current text (UNVERIFIED). |
| Business Central role centres and Role Explorer [3] | The role sets the home page; every feature is findable across roles | docs (pattern) | — | current | n/a | n/a | n/a | **adopt the pattern**, not the code |
| Open-source rental and BRRRR calculators (e.g. `trevv16/rental-property-calc-ts`, an HN-shown vanilla JS analyser) [6] | CoC, BRRRR, scoring | unstated or MIT (UNVERIFIED) | — | unknown | varies | some call AI or backends | — | **excluded**: money logic is never outside code; "deal scoring" is not wanted |
| driver.js (from the addendum's table) | Tour overlay | MIT | 27.8 KB | 2026-10 | yes | none | — | not needed: the picker is a sheet |

Not read: Google's own Material page (seen through SAP's documentation
only) and sba.gov.

## 6. What it costs

Money: nothing (no service, account, hosting or library). Download: WS0
about 8-12 KB of our own code; each later calculator 3-8 KB, loaded with
Tools. Build: WS0 is one M PR; the first nine PRs in 3.11 are roughly 12-16
Sonnet sessions, with Opus designer notes for about seven (money or meaning).
Ongoing: each new tool needs a registry entry; the "same set in every
workspace" test catches a forgotten one.

## 7. Decisions (recommended and decided; the owner approved recommendations in advance)

1. **Navigation: a workspace lens (model C).** Five bar slots stay;
   workspaces are chips on Home (phone) and rail tabs (desktop). *Decided.*
2. **Nine workspaces**, named as in section 1, plus the "not targeted" list.
   *Decided.*
3. **`ui.prefs.workspace` replaces D3's `role`**, carried by backups, with no
   deal change and no migration step. *Decided* (within addendum decision 8).
4. **Existing devices start on Brokerage = today's Home**, with no picker.
   *Decided.*
5. **Up to three pinned workspaces.** *Decided.*
6. **Vocabulary is limited to Home headings and empty states.** *Decided.*
7. **Checklists become ordinary tasks**: no new stored field. *Decided.*
8. **No "workspace" or "purpose" field on a deal.** Revisit only if L2 or M2
   need one, behind the data-format gate. *Decided.*
9. **Build order as in 3.11, Lending first.** *Decided.*

**Gates that stay open at build time** (owner's explicit yes per PR, shown
as two readings or exact text):
- **Data format:** L2 covenants (`deal.loan.covenants`), A-2 billed CAM
  estimates, and M1-M5 as already listed.
- **Financial meaning:** the covenant test basis (L2), effective cost vs APR
  (L3), flip annualising (I4), pre-tax-only lease vs buy (O1), SBA starting
  shares (O2), CAM gross-up (A-2), straight-line rent (A-4) and appraisal
  weights (U-1/U-2).
- **Consumer wording:** the exact disclaimer line and the I5 and I6 copy.

## Sources

[1] SAP Fiori for Android, M3 navigation bar usage, https://www.sap.com/design-system/fiori-design-android/v25-8/components/m3-standard-components/navigation-bar/usage ; Compose Material3 NavigationBarItem, https://kotlinlang.org/api/compose-multiplatform/material3/androidx.compose.material3/-navigation-bar-item.html
[2] Apple HIG, Tab bars, https://developer.apple.com/design/human-interface-guidelines/tab-bars
[3] Microsoft Learn, Manage user profiles (Business Central), https://learn.microsoft.com/en-us/dynamics365/business-central/admin-users-profiles-roles ; Role Explorer, https://docs.microsoft.com/en-us/learn/modules/user-interface-dynamics-365-business-central/7a-role-explorer
[4] SBA 504 overviews (secondary): https://en.wikipedia.org/wiki/SBA_504_Loan , https://cdcnewengland.com/post/sba-504-loan-program-explained-how-small-businesses-can-buy-commercial-real-estate-with-just-10-down (official SBA page not read: UNVERIFIED)
[5] HUD press release 24-098 (2024), https://archives.hud.gov/news/2024/pr24-098.cfm
[6] https://github.com/trevv16/rental-property-calc-ts ; https://github.com/topics/rental-property-calculator (licences not read: UNVERIFIED)

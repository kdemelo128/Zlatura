# The Underwriting workspace: its own tab, quick underwriting and linked deals

Status: **proposal, waiting for the owner's approval.** Nothing here is built.
Request (owner, 2026-10-22): "a dedicated tab for underwriting on its own, not
within a deal, where you can link together the deals and whatnot". The owner
chose all four uses: (1) quick underwriting with no deal, (2) a portfolio of
linked deals, (3) deals compared side by side, (4) shared assumptions with a
per-deal override. The owner also asked for useful extras; those are in
section 7, and each one is approved on its own.

**In one paragraph.** A new top-level tab, **Underwrite**, sits after Deals.
It is the master plan's Underwriting workspace (Part 4, item 3), which the UI
revamp kept "hidden by a flag" until it existed (`docs/proposals/ui-revamp.md`
section 2.3). It holds two things:

- **Quick underwritings.** You type a price, NOI and loan terms and get the
  answer straight away, without making a deal. You can turn one into a deal
  later.
- **Sets.** A set is a list of linked deals, with two views: *Side by side*
  and, for a set marked as a portfolio, *Combined*. A set has shared
  assumptions, and any deal in it can override them.

Every figure comes from the engine that the deal page uses now
(`analyze`, `runScenario` and `irr` in `app/deal.js`). A combined figure is a
sum, or a ratio of sums, and each one is defined in section 3. A set never
writes to a deal, so saved deal results and both golden outputs stay
identical. Two new kinds of stored record (kv keys `uw.scratch` and `uw.sets`)
are the data-format gate. There is no change to the deal record, no deal
migration step, and no new library.

---

## 1. What already exists (so nothing is built twice)

| Need | Already in the app | Used how |
|---|---|---|
| One deal's figures (cap rate, $/SF, DSCR, debt yield, equity, cash-on-cash, largest loan, break-even) | `analyze()` (`app/deal.js:28`, registered figures in `app/engine/figures.js:100-175`), fed by `analysisInput()` (`app/impact.js:449`) | Called once per deal in a set, and on a quick underwriting |
| Hold-period returns, What-if precedence | `runScenario()` (`app/deal.js:166`) on top of `holdReturns()` (`:74`) | Called once per deal, with the set's assumptions as the `over` argument |
| IRR | `irr()` (`app/deal.js:41`) | Run on the combined yearly cash flows |
| Price for a target cap rate or IRR | `scenarioAnswers()` (`:207`), `solvePrice()` (`:114`) | The quick underwriting's "what price gets me there" |
| Loan sizing | `sizeLoan()` (`app/engine/debt.js:67`) | Quick underwriting; extra E5 |
| WALT, lease statistics | `walt()` (`app/engine/walt.js:37`), `leaseStats()` (`figures.js:34`) | Extra E4 runs these on the set's leases put together |
| Sensitivity grids, waterfall | `sensitivity()`, `waterfall()` (`app/calc.js:152`, `:192`) | Extras E3, E8 |
| 1031 deadlines | `exchangeDates()` (`app/tools.js:83`) | Extra E7 |
| Quick calculators | Tools: quick value, loan, offer, hold returns (`app/tools.js:16-54`, `app/toolsdefs.js:182`) | Not replaced. The quick underwriting puts these on one card, and Tools stays |
| A sum of prices across deals | `pipelineSummary()` (`app/pipeline.js:34`) | The same definition is used for a set's total price |
| A list kept in kv, merged by id on restore | `research.briefs` (`app/research.js`, `app/backup.js:211-215`, `mergeById` at `:136`) | The pattern for `uw.scratch` and `uw.sets` |
| Making a deal | `newDeal()` (`app/dealui.js:109`) | "Save as a deal" calls it |
| XLSX and print | ExcelJS 4.4.0 (vendored, `THIRD_PARTY.md`), `app/workbook.js`, the deal brief print path (`app/brief.js`) | Extra E1 |

The deal page keeps its own underwriting exactly as it is: the Overview
figures, financing, T-12, What if and Rent roll (`app/dealui.js:766`). The new
tab reads these and never edits them. No feature is removed or moved, except
where section 5 moves the Settings button on the phone. Settings stays one tap
away.

---

## 2. What changes for the broker

### 2.1 The Underwrite tab (phone first)

From top to bottom at 390 px wide:

1. **Quick underwrite** (a card that is always open). It has:
   - Price, NOI, Building SF, Units and Property type;
   - an optional "Build NOI" line: gross income and operating expenses;
   - loan to value, rate, amortization, interest only and closing costs
     (starting from the same remembered loan defaults that a new deal uses);
   - hold, NOI growth, exit cap and sale costs.

   The results show as you type: cap rate, $/SF, $/unit, DSCR, debt yield,
   cash-on-cash, the largest loan and which test limits it, levered and
   unlevered IRR, equity multiple, and "price for a 7.00% cap" and "price for
   a 15% IRR". Each is labelled exactly as it is on the deal page, because it
   is the same figure. Below them are four buttons: **Save as a deal**,
   **Add to a set…**, **New**, **Delete**.
2. **Quick underwritings**: the saved ones, newest first. Each shows its
   name, price, cap rate and levered IRR. They save as you type, so nothing
   is lost when the app closes, as with deals.
3. **Sets**: each shows its name, whether it is a portfolio or a comparison,
   the number of deals, and (for a portfolio) the combined price, cap rate
   and levered IRR. A set that shares a deal with another set says
   "also in Northside pair".
4. **New set**: pick deals and quick underwritings from a searchable list,
   name the set, and choose *Portfolio* (the deals are bought or sold
   together) or *Comparison* (they are alternatives).

An invented example. "Quick look: corner retail (fictional)" has a price of
$2,400,000, NOI of $156,000, 8,000 SF and a 65% loan at 6.50%. The card shows
a 6.50% cap rate, $300.00 per SF and a DSCR worked out by the engine. Save as
a deal makes a deal with those figures, marked as entered by hand, and a
history line: "Created from a quick underwriting".

### 2.2 A set

A set has a header (its name, and Portfolio or Comparison) and three
sections, laid out like the deal page's sections (`role="tablist"`, arrow
keys):

- **Side by side.** One column for each deal, with the labels in the first
  column, which stays put while the columns scroll sideways. On a phone two
  deals fit. The rows are:
  - assumptions: price, NOI, exit cap, growth, hold, loan to value and rate,
    each tagged *shared*, *overridden* or *this deal's What-if*;
  - value: cap rate, $/SF, $/unit, value at the exit cap;
  - returns: levered and unlevered IRR, equity multiple, cash-on-cash;
  - debt: loan, DSCR, debt yield, largest loan;
  - risks: the deal's open checks and questions (count, and the top two),
    WALT, rollover within 12 and 24 months, occupancy and where it comes
    from, and whether a price or NOI was worked out from the others rather
    than entered.

  The best value in each row is not highlighted: "best" depends on the
  broker, and colouring it would be a judgement the app can't make.
- **Combined** (portfolio sets only). The totals and ratios defined in
  section 3. Each one shows how many of the deals it covers ("3 of 4 deals")
  whenever any deal is missing an input it needs. A comparison set has no
  Combined section, because adding up alternatives means nothing (see
  section 10).
- **Assumptions.** The set's shared values: hold, NOI growth, exit cap
  (either a fixed percent or a spread in percentage points over each deal's
  going-in cap), sale costs, loan to value, interest rate, amortization and
  interest only. A value left blank is not shared, and each deal then uses
  its own. Under each value, each deal is listed with a chip:
  - *uses the set's value*;
  - *overrides it: 7.25%*, which you tap to change or clear;
  - *uses its own What-if: 7.00%*, when the set's value is blank.

  Changing a value here changes nothing on any deal.

**Open the deal** is at the head of every column. On the deal page the
Overview gains one line, "In 2 sets: Northside pair, Q4 shortlist", with
links, and the deal's menu gains **Add to a set…**.

### 2.3 Home and the rest of the shell

- In Classic, Home is unchanged. In the new look, a **Quick underwritings**
  card joins Home's shelf, off by default. This is a reversible detail, and I
  have decided it.
- The search palette (`app/command.js`) gains "New quick underwriting" and
  "Open set …".
- The route is `#underwrite`. Which set is open is remembered in memory, the
  way the open deal is. There are no sub-routes, because `ui.js:71` sends any
  unknown hash to Home.

---

## 3. Combined figures, defined

These are the rules for a **portfolio** set. Each deal's figures come from
`runScenario(analysisInput(deal), analyze(...), over)`, where `over` is
section 4.3's precedence. Nothing is averaged unless the table says so.

| Figure | Definition | When a deal lacks the input |
|---|---|---|
| Total price | Σ each deal's `m.price`, added in whole cents | Shown as "3 of 4 deals" in grey, with the deal named; never added as $0 |
| Total NOI | Σ `m.noi` in whole cents (a negative NOI is added as negative) | As above |
| Cap rate | Σ NOI ÷ Σ price, over the deals that have **both** | The count is shown; never an average of cap rates |
| $/SF | Σ price ÷ Σ Building SF, over the deals that have both | Deals with no Building SF are left out and named. Land SF and units are never added to SF |
| $/unit | Σ price ÷ Σ units, over the deals that have both | As above; reported only when at least one deal has units |
| Loan, equity, debt service | Σ in whole cents. A deal with no loan to value is all cash, as on its own page (`figures.js:133`), and says "all cash (no loan entered)" | — |
| LTV | Σ loan ÷ Σ price, over all priced deals | — |
| DSCR, debt yield | Σ NOI ÷ Σ debt service, and Σ NOI ÷ Σ loan, **over the deals with a loan** | The line says "of the 3 deals with a loan" |
| Cash-on-cash, year 1 | (Σ NOI − Σ debt service) ÷ Σ equity | — |
| Levered and unlevered IRR | `irr()` of the yearly cash flows added year by year, from year 0 to the longest hold (a deal adds nothing after its exit year). **Not** an average of IRRs | Null if any deal's returns are null, naming the deal and the missing input (usually the exit cap) |
| Equity multiple | Σ of the combined flows after year 0 ÷ the combined equity at year 0, the same definition as one deal's (`deal.js:96`) | As IRR |
| Combined occupancy | Σ leased SF ÷ Σ total SF, over the deals whose occupancy is measured in SF | Deals with occupancy only as a stated % are listed, not combined |

Worked checks (invented, and used as tests in section 9):

- **Cap rate.** Deal A is $1,000,000 with $50,000 NOI (5.00%). Deal B is
  $3,000,000 with $240,000 NOI (8.00%). The combined cap rate is $290,000 ÷
  $4,000,000 = **7.25%**. The average of the two cap rates would be 6.50%,
  which is wrong.
- **IRR.** Deal A's flows are −100, 0, 150 (22.47%). Deal B's are −300, 330
  (10.00%). Added together they are −400, 330, 150, which gives **15.08%**
  (the engine's `irr()`, run while writing this proposal). The simple average
  of the two IRRs is 16.24%, and the equity-weighted average is 13.12%.
  Neither is the portfolio's return.
- **Cents.** Three prices of $1,000,000.10, $2,000,000.20 and $500,000.03
  total exactly $3,500,000.33.

**Money.** Totals of money (price, NOI, loan, equity, debt service) are added
as whole cents: `toCents` (`app/engine/money.js:22`) on each deal's value,
then an integer sum. Calculated results (IRR, the yearly flows, values at the
exit) are worked out in full and rounded only when shown, which is the rule
`money.js` states in its header.

**Assumed timing.** The combined IRR treats every deal as closing on the same
day (year 0) and each deal's year 1 as the same year. This is said under the
figure. Different closing dates are extra E10.

---

## 4. The data shape and where it is stored

### 4.1 What is new

Two kv keys in IndexedDB's `kv` store (the store that already holds
templates, tasks, contacts and research briefs), and nothing else:

| Key | Holds | Cap | Kept |
|---|---|---|---|
| `uw.scratch` | quick underwritings, newest first | 100 records | until deleted |
| `uw.sets` | sets | 50 sets, 25 members each | until deleted |

**Not new:** the deal record, `SCHEMA` (stays 4), `BACKUP_VERSION` (stays 2),
the database version (stays 2), and every existing kv key. Membership lives
on the set, not the deal. The "In 2 sets" line on a deal page is looked up
from `uw.sets`, so no deal field is added.

### 4.2 The records (the smallest shape)

A quick underwriting uses the deal's own field names, so `analysisInput()`
reads it unchanged and "Save as a deal" copies the fields across:

```json
{
  "v": 1,
  "id": "u1k9x2ab",
  "name": "Quick look: corner retail (fictional)",
  "createdAt": 1761200000000,
  "updatedAt": 1761200000000,
  "figures": { "price": 2400000, "noi": 156000, "bsf": 8000, "ptype": "Retail" },
  "loan": { "ltv": 65, "rate": 6.5, "amort": 30, "io": false, "closing": 2, "minDscr": 1.25 },
  "live": { "hold": 5, "growth": 2, "exitCap": 7, "saleCost": 2 },
  "targets": { "cap": 7, "irr": 15 }
}
```

A set:

```json
{
  "v": 1,
  "id": "s1k9x3cd",
  "name": "Northside pair (fictional)",
  "kind": "portfolio",
  "createdAt": 1761200000000,
  "updatedAt": 1761200000000,
  "members": [{ "type": "deal", "id": "dm3abc12" }, { "type": "scratch", "id": "u1k9x2ab" }],
  "shared": { "hold": 7, "growth": 2.5, "exitCapSpread": 0.5, "rate": 6.75 },
  "overrides": { "dm3abc12": { "exitCap": 7.25 } }
}
```

The rules for these records:

- **Blank means absent.** A key left out means "not set"; it is never stored
  as 0. A growth of 0 is a real value and is kept as 0.
- **One unit per key.** `exitCap` is a percent (7.25 means 7.25%), and
  `exitCapSpread` is in percentage points over the deal's going-in cap
  (0.5 means 6.00% becomes 6.50%). A record may hold only one of the two at
  each level; if a hand-made file holds both, the reader keeps neither, and
  the set asks for a value.
- **Money in a quick underwriting** (`figures.price`, `figures.noi`,
  `figures.gross`, `figures.opex`) goes through `quantizeDeal`'s rules
  (whole cents) on save, as a deal's does.
- **Members** are unique by `type` + `id`. The reader drops a repeat and
  says so.

### 4.3 How a deal's assumptions are chosen (precedence)

For each assumption, the first of these that is set is used:

1. the set's override for that deal;
2. the set's shared value;
3. the deal's own What-if (`deal.live`);
4. the engine's default (`scenarioBase`, `deal.js:146`, for example a hold of
   5 years and an exit cap 0.25 points above going-in).

The result is passed to `runScenario` as `over`. The deal record is never
written. Decision 3 asks the owner to confirm this order, because a second
reading of the request is possible.

### 4.4 Save as a deal

Save as a deal works in four steps:

1. `newDeal()` makes a deal with the quick underwriting's `figures`, `loan`,
   `live` and `targets`, and with `sources` of `{ hand: true }` for each
   figure.
2. The deal is saved through `store.saveDeal`, with a history entry of kind
   `create` labelled "Created from a quick underwriting".
3. Every set that links the quick underwriting is changed to link the new
   deal in its place.
4. The quick underwriting is deleted.

All four happen together. A toast then offers **Undo**, the same pattern as
deleting a deal (`dealui.js:2430`): it deletes the new deal and puts the quick
underwriting and its links back. This way one property is never in a set
twice (decision 8).

### 4.5 Migration

No stored record changes shape, so no `migrate.js` step runs on deals.
Because the master rule is that migrations go through `app/migrate.js`, that
file gains an empty `KV_MIGRATIONS` list now. Each new record starts at
`v: 1`, and any later shape change becomes a step in that list, with an
old-backup fixture, exactly like the deal steps.

A record with a `v` newer than the app knows is kept as it is, is not shown
("made by a newer version of Zlatura"), and is never rewritten. This is the
same rule as `tooNew()` (`migrate.js:136`), applied to one record rather than
the whole backup.

### 4.6 Backups and restore

- **Into backups.** Both keys join `KV_KEYS` (`app/backup.js:38`), so every
  backup carries them. The test that every `kvSet` key is listed
  (`tests/backup.test.js:180`) enforces this.
- **Merge restore.** Records are merged by id with `mergeById`, and the newer
  `updatedAt` wins (as for research briefs). The restore summary gains
  "Quick underwritings: 2 added" and "Sets: 1 added, 1 updated". A set whose
  linked deal is not on the device keeps the link and shows
  "1 linked deal isn't on this device". That deal is left out of the totals,
  and the totals say so.
- **Replace restore.** The summary gains "3 sets on this device will be
  deleted", worded like the research briefs line (`backup.js:188-190`).
- **Old backups** (every fixture in `tests/fixtures/`, from 3.1.0 to 4.7.50)
  restore with no sets and no quick underwritings. Nothing else changes: the
  plans must equal `tests/fixtures/restore-plans-c57ff27.json`.
- **A new backup restored into an older app** (4.7.56 or earlier). That app
  drops the two keys with its existing line ("2 settings in the backup that
  this version does not use were left out"), and restores everything else.
  So the sets are lost only when restoring into an older version, and the
  broker is told. This is the same accepted behaviour as research briefs
  (decision 10).
- **A deleted deal** goes to the trash for 30 days (`store.js:660`). Its
  sets keep the link, show "deleted, in the trash" and leave it out of the
  totals. If the deal is restored, it comes back into the totals.
- **Reading is defensive.** A record of the wrong type, an id that doesn't
  match `/^[a-z0-9]{1,40}$/`, a name over 200 characters, a value that is not
  a finite number, or a list over its cap is dropped and counted ("2 sets in
  this backup could not be read"). Names are shown with `textContent` only,
  never as HTML.

---

## 5. Navigation

Today (Classic):

- **Desktop sidebar:** Home, Deals, Comps, Tools, Review (only while
  something waits), Settings (`index.html:53-59`).
- **Phone bar:** the same five, six with Review (`index.html:263-268`),
  about 65 px each at 390 px wide.

The master plan's rail puts Underwriting third, after the deal workspace
(Part 4).

| | Desktop | Phone |
|---|---|---|
| **Classic (recommended)** | Home, Deals, **Underwrite**, Comps, Tools, Review, Settings | Home, Deals, **Underwrite**, Comps, Tools (+ Review while waiting). **Settings moves off the phone bar** to a gear button in the top bar, next to search. It is also in the search palette and stays in the desktop sidebar |
| **New look** (approved, not built: `ui-revamp.md` 2.1) | the rail gains Underwrite after Deals | The five approved slots become Home, Deals, **Underwrite**, Comps, More. **Tools moves into More** on the phone, and the Underwrite page ends with a "Calculators" row that opens Tools unchanged. The desktop rail keeps Tools |

The reason: the phone bar stays at five items (six with Review), as today,
so no item gets narrower. Underwrite and Tools overlap on the phone (quick
value, loan and offer are what a quick underwriting does), so putting Tools
one step behind Underwrite costs the least. This is decision 7, because it
changes an approved revamp slot. The icon is a calculator over a document,
drawn in the existing 24 px stroke style. The label "Underwrite" (a verb, 10
characters) fits the 65 px slot at the current type size. That has to be
checked in the browser flow at 390 px, not assumed.

---

## 6. Prior art

The capped search was 6 web searches on 2026-10-22 and 2026-10-23, run
through the agent's search tool. No page was fetched. Product pages are
marketing text and were read as data only.

| Candidate | What it does | License | Size | Last release, maintenance | Build-free, vendored, offline | Network or telemetry | Security notes | Verdict |
|---|---|---|---|---|---|---|---|---|
| Zlatura's own engine (`deal.js`, `engine/`, `calc.js`, `tools.js`) | Every per-deal figure, IRR, sizing, WALT, sensitivity, waterfall, 1031 dates | Ours | in the app | maintained here | yes | none | — | **Adopt.** Every figure in this proposal comes from it |
| The platform (`Intl.NumberFormat`, print to PDF, IndexedDB) | Formatting, PDF via the print sheet, storage | — | 0 | — | yes | none | — | **Adopt** |
| ARGUS Enterprise and Portfolio Manager (Altus Group) | What-if, sensitivity and risk across assets and portfolios; best and worst case compared; portfolio-level scenario runs (March 2026 release); 40+ reports, PDF export | Proprietary | n/a | active (2026 releases) | no (desktop and cloud) | yes | n/a | **Ideas only:** shared assumptions across a portfolio, scenario comparison, exportable comparison. No hold/sell module was found in the results (UNVERIFIED either way) |
| A.CRE models (Adventures in CRE) | Excel acquisition models; a hold/sell write-up that compares IRR and equity multiple for "hold" against "sell and reinvest" side by side; an "All-in-One" model with a debt module and waterfall | Their own terms (UNVERIFIED) | n/a | active site | n/a (Excel) | n/a | n/a | **Ideas only:** the hold/sell layout (E6). Their portfolio model page could not be read (UNVERIFIED) |
| Dealpath | Scores deals against a firm's criteria, flags mismatches, ranks them; a tear sheet from the OM and rent roll (AI tier) | Proprietary SaaS | n/a | active | no | yes | n/a | **Ideas only:** a buy box with pass or fail per criterion (E2), without an AI score |
| Altrio Origin | Pipeline from screen to close; compares deals by tenant, location and asset type | Proprietary SaaS | n/a | active | no | yes | n/a | **Ideas only:** the risk rows in Side by side |
| "Valuate" | Named in the brief | — | — | — | — | — | — | **Not found.** The search returned no product page under that name (UNVERIFIED), so nothing is taken from it |
| 1031 calculators (several sites; "napkin test" explainers) | Equity and debt replacement, cash and mortgage boot, the 45- and 180-day dates | Web pages | n/a | n/a | n/a | n/a | Several are duplicated SEO pages; none is a source of numbers | **Ideas only:** E7's equity and debt test, labelled "not tax advice" |
| `@8hobbies/irr` (npm) | IRR and NPV | Apache-2.0 | UNVERIFIED | UNVERIFIED | probably | UNVERIFIED | — | **Build ourselves:** we have `irr()`, and outside code is never used for money |
| `effective-interest-rate` (npm) | XIRR | MIT | UNVERIFIED | 0.1.0 | probably | UNVERIFIED | — | **Not adopted:** money logic. A dated XIRR for E10 would be built on our own `irr()` bisection |
| DealLens (GitHub, Python) | A CRE underwriting engine with a 120-month DCF | MIT (per the search result) | UNVERIFIED | marked unmaintained | no (Python) | UNVERIFIED | — | **Not adopted:** not JavaScript, and it is engine logic |

**Result:** no library, no copied code, and no approval gate from this
section.

---

## 7. Extras, each approved separately

These are listed in my recommended order of value to a broker. Each is its
own PR after W1–W4 (section 8), reuses the engine, and adds no library.

| # | Extra | What the broker gets | Built from | New stored data | Notes |
|---|---|---|---|---|---|
| E1 | **Comparison export (XLSX and PDF)** | The Side by side and Combined views as a workbook (one sheet per view, with each deal's inputs and a "how it's worked out" sheet that lists section 3's definitions), and as a printable page | `workbook.js` with ExcelJS (vendored), the deal brief's print path | none | The workbook writes values with their formulas where the deal workbook already does. It is checked with the LibreOffice recalc as now (`tests/e2e/recalc.py`) |
| E2 | **Screening scorecard (a buy box)** | The broker sets criteria once, for example cap rate at least 6.5%, $/SF at most $250, DSCR at least 1.25, WALT at least 4 years, property type is Retail. Every deal and quick underwriting then shows pass, fail or "can't tell", per criterion | the figures above | **yes:** `uw.criteria` (one record) | "Can't tell" when an input is missing, never a pass. No overall score, so nothing is weighted by the app |
| E3 | **Portfolio sensitivity grid** | The combined levered IRR (or value) across exit cap × interest rate, or price × exit cap, with the shared assumption moved for every deal at once | `sensitivity()` + section 3 | none | Up to 5 × 5 cells × 25 deals stays within 150 ms. That has to be measured in `perf-flow`, not assumed |
| E4 | **Portfolio rent roll, expiry ladder, WALT and tenant concentration** | Leases from every deal in one list; rent expiring each year; one WALT; each tenant's share of the combined rent, top five | `walt()`, `leaseStats()` on the leases put together, at one as-of date that you choose (default today) | none | A tenant in two deals is combined only when the names match exactly after spacing and case are evened out. Anything closer than that is shown as "possibly the same tenant", never merged silently. Deals without a rent roll are listed and left out |
| E5 | **Debt across linked deals** | Separate loans added up (section 3), beside **one loan on the whole portfolio**, sized by `sizeLoan()` on the combined price and NOI, with which test limits it | `sizeLoan()` | the blanket loan's terms on the set (`set.blanket`) | Labelled "one loan secured by all of them"; never mixed with the separate loans |
| E6 | **Hold or sell** | For a deal you own: sell now (net of sale costs and the loan payoff) against hold N more years. Shows the IRR and multiple on today's equity, side by side | `holdReturns()` with today's value as the price | today's value and loan balance, as a scenario on the deal (`deal.scenarios`, existing shape) | No new field. The value is entered, never guessed. **The one extra that writes to a deal:** it saves a What-if scenario on that deal, with a history entry, when the broker taps Save. A set still never writes |
| E7 | **1031 pairing** | A sold deal (relinquished) linked to one or more replacements: equity and debt replacement checks, the 45- and 180-day dates, and the shortfall in each | `exchangeDates()`, simple sums | the pairing on the set (`set.exchange`) | Says "an indication, not tax advice: confirm with your intermediary or CPA". Boot is reported as a shortfall only, never as tax due. This needs the owner's approval as financial meaning |
| E8 | **Returns waterfall at portfolio level** | The combined levered flows split between investors and sponsor through hurdles | `waterfall()` on section 3's combined flows | the waterfall terms on the set | Same tool as Tools → Distribution waterfall |
| E9 | **Underwrite from the OM in one step** | Drop an OM on the Underwrite tab. It is read as now, and fills a quick underwriting rather than making a deal; the review rules apply as now | the existing OM reader (`om.js`, `omstatement.js`) | none beyond `uw.scratch` | Nothing fills silently: the fields read are marked "from the OM, page n", as on a deal |
| E10 | **Different closing dates** | Each deal in a portfolio gets a closing month; the combined IRR is worked out on monthly-dated flows | our `irr()` on monthly flows | `closeMonth` per member | Without it, the same-day assumption in section 3 stands |

Considered and not proposed now:

- **A football field for a set.** Part 7.3's football field is per deal and
  belongs to the deal page.
- **Monte Carlo.** It is off by default in Part 7.8 and adds little at
  portfolio level.

---

## 8. PRs, in order

Every PR runs:

- `check:full`;
- the mutation checks (the `quality-gates` skill);
- new tests that fail on the old code (`git archive` with `BASE=`);
- axe;
- character-by-character typing for every new input;
- the 150 ms per-edit perf budget.

The golden outputs are checked every time and must show 0 changes. Designer
review: a design note before W1 (data format) and W3 (money), and one review
of each finished diff.

| PR | What | Size | Fails on old code | Mutation targets | Golden | Owner approval |
|---|---|---|---|---|---|---|
| W1 | The Underwrite tab, navigation (section 5), quick underwriting, Save as a deal, `uw.scratch`, backup handling, `KV_MIGRATIONS` | M | `underwrite-flow` at iPhone size; `uwstore.test.js` (record read, caps, newer `v` kept, backup round trip) | blank stored as 0; `toCents` skipped on save; Save as a deal leaving the quick underwriting in place | 0 | **yes:** new stored data (decisions 1, 8, 9, 10) and navigation (7) |
| W2 | Sets: make, edit, delete; Side by side; "In sets" on the deal page; `uw.sets` | M | `sets-flow`; Side by side figures equal the deal page's for the same deal (a differential test) | a duplicate member kept; a missing deal counted | 0 | **yes:** new stored data (decisions 2, 9) |
| W3 | Combined figures: a pure `app/engine/portfolio.js` (sums and ratios only; every per-deal figure is imported from `deal.js`) | M | `portfolio.test.js`: section 3's worked checks | average of caps for Σ ratio; average of IRRs for the IRR of summed flows; null as 0; cents added as floats | 0 | covered by decisions 4–6 and 11 |
| W4 | Shared assumptions and per-deal overrides (section 4.3) | M | a precedence test with all four levels; the deal record deep-equal before and after | the order of levels; spread read as percent (6.00% → 6.03% instead of 6.50%) | 0 | decision 3 |
| E1–E10 | Section 7, one PR each, in that order unless the owner reorders | S–M | each states its own | each states its own | 0 | **each one separately** |

W1 can't be split smaller without leaving an empty tab, which Part 4 forbids
("every nav item must open working functionality").

---

## 9. Tests

**Unit (Node), all new files.**

- `tests/portfolio.test.js`:
  - the cap-rate, IRR and cents examples from section 3;
  - a deal with no NOI makes total NOI "3 of 4", not a smaller total
    presented as complete;
  - DSCR only over deals with a loan;
  - $/SF never adds land SF;
  - a property test (fast-check, already a dev dependency): for random sets
    of 1–25 invented deals, total NOI ÷ total price equals the combined cap
    rate, the sum of each deal's whole-cent price equals the total exactly,
    and putting the members in any order gives the same result.
- `tests/uwstore.test.js`:
  - records read defensively (the section 4.6 cases);
  - a `v: 2` record is kept and not shown;
  - caps are enforced;
  - exit cap and spread are never both read;
  - Save as a deal gives a deal whose `analyze()` and `runScenario()`
    results are identical to the quick underwriting's, and re-points every
    set.
- `tests/backup.test.js` (additions):
  - both keys round trip;
  - a merge where the newer record wins;
  - the replace line;
  - every fixture in `tests/fixtures/` restores with plans equal to
    `restore-plans-c57ff27.json`;
  - a new fixture `backup-4.7.56-before-uw-workspace.json` (invented,
    generated by the existing tools in `tests/tools/`) restores into the new
    code with no sets.

**Old-code runs.** Run against 4.7.56 (`git archive`, `BASE=`), every new
unit test and flow fails: the module is missing, or the tab is missing. One
more test exercises the old code directly: a backup with `uw.sets`, restored
by 4.7.56, gives the "left out" line and loses no deal.

**Browser flows (Chromium, at iPhone and desktop sizes).**

- `underwrite-flow`:
  - types every quick underwriting field character by character;
  - checks the results against the same inputs on a deal page;
  - Save as a deal, then Undo;
  - checks that the label fits at 390 px.
- `sets-flow`:
  - two example deals and a quick underwriting;
  - Side by side and Combined;
  - an override chip set and then cleared;
  - deleting a deal shows "deleted, in the trash";
  - axe on every new view.
- `perf-flow`: a 25-member set, where one shared edit re-renders within
  150 ms.

**Golden.** `tests/analyze-golden.test.js` (618) and
`node tests/tools/golden.mjs --diff` (646) must show 0 changes in every PR.
They can't move, because no deal is written. W3 adds its own invented
fixture of portfolio results (`tests/fixtures/portfolio-golden.json`), which
is new and changes neither existing golden file.

**A calculator never checks itself.** The section 3 expected values were
worked out by hand (sums) and by solving the quadratic for the IRR case
(−400 + 330x + 150x² = 0, where x = 1 ÷ (1 + r)), not taken from the code
being tested.

---

## 10. Risks and the Part 21.2 review

| Risk | What stops it |
|---|---|
| **Counted twice: one deal in two portfolio sets** | Each set's totals are its own. The set list says "also in …". The app offers no total across sets. If one is added later, it counts each deal once, by id |
| **Counted twice: the same deal twice in one set** | Members are unique by id. The reader drops a repeat and says so |
| **Counted twice: a quick underwriting and the deal saved from it** | Save as a deal re-points the links and deletes the quick underwriting (section 4.4) |
| **Counted twice: two deals for the same property** (an OM uploaded twice) | A warning when two members share an address, or the same price, NOI and SF: "these may be the same property". Never removed automatically |
| **Adding up alternatives** | A Comparison set has no totals (section 2.2) |
| **Blank as zero** | Section 3's third column. Records store absent, not 0 (section 4.2) |
| **Percent against points** | `exitCap` and `exitCapSpread` are separate keys, with the unit in the label ("+0.50 points") and a mutation test |
| **SF against acres, rentable against gross** | $/SF adds only Building SF; land SF and units are never mixed in. The app holds one building-area field (`bsf`, "Building SF", `dealfields.js:25`), so rentable and gross aren't mixed inside the app. Whether each OM's figure is rentable or gross is already a per-deal question, and the set does not resolve it |
| **Monthly against annual** | Every input is annual, as on the deal page, and labelled so |
| **A value invented** | No default replaces a missing price or NOI. The engine's own defaults (hold 5, exit cap +0.25) are shown as "the engine's default", as on the What-if |
| **The set seems to change a deal** | It never writes. A test deep-compares the deal record before and after |
| **Old apps** | Restoring a new backup into an older app loses the sets, and the older app says so (section 4.6, decision 10) |

---

## 11. Cost

- **Money:** none. No paid service, no library, no network call, no server
  change.
- **Size:** about 5 new app files (the tab's screen, `uwstore.js`,
  `engine/portfolio.js` and two small views), each listed in `sw.js`. The
  repo test enforces that. Install size grows by an estimated 40–60 KB
  uncompressed. That is an estimate, to be measured in W1.
- **Storage:** about 1 KB per quick underwriting and 1–2 KB per set. At the
  caps that is under about 300 KB, inside the 50 MB budget that Settings
  shows.
- **Speed:** a shared edit runs `runScenario` once per member (at most 25).
  Projections from a rent roll use the worker's existing cache. The 150 ms
  budget is tested, not assumed.
- **Build effort:** four M PRs (W1–W4), then one S or M PR per approved
  extra. Each PR has a designer review where money or data are touched.

---

## 12. Decisions for the owner

1. **Where quick underwritings live.** *Recommend:* their own record in kv
   `uw.scratch` (section 4.2). The alternative is a hidden deal with a
   `scratch` flag. That would touch every list that counts deals (the Home
   headline, the pipeline total, the golden runs), and an older app would
   show them as real deals.
2. **One "set" record with two kinds, Portfolio and Comparison.**
   *Recommend:* yes, with totals only for Portfolio.
3. **Precedence (section 4.3).** The two readings are: (a) the set's shared
   value wins over a deal's own What-if, and a per-deal override in the set
   wins over both; or (b) any value already set in a deal's What-if counts as
   its override. *Recommend (a):* with (b), which deals follow the shared
   value would depend on old What-if experiments that nobody can see from
   the set. A blank shared value still falls through to each deal's What-if.
4. **Shared exit cap: a fixed % or a spread in points.** *Recommend:* offer
   both, labelled, one at a time. The default is a spread, left blank until
   set.
5. **Totals with a deal missing an input.** *Recommend:* show the partial
   figure in grey with "3 of 4 deals" and the missing deal named, rather
   than hiding it.
6. **Combined IRR timing.** *Recommend:* every deal closes on the same day
   for now, said under the figure. Dated closings are extra E10.
7. **Navigation (section 5).** *Recommend:*
   - Classic: Underwrite after Deals, and Settings moves from the phone bar
     to a gear in the top bar;
   - new look: phone slots Home, Deals, Underwrite, Comps, More, with Tools
     under More on the phone and a Calculators row on the Underwrite page.

   This changes one approved revamp slot.
8. **Save as a deal deletes the quick underwriting and re-points its
   links.** *Recommend:* yes, with a toast Undo that puts everything back.
9. **Caps and retention.** *Recommend:* 100 quick underwritings, 50 sets, 25
   deals per set, kept until deleted (no automatic expiry), and carried by
   backups.
10. **Backups.** *Recommend:* two new kv keys, `BACKUP_VERSION` stays 2, and
    an older app drops them with its existing "left out" line. The other
    option is bumping the backup version, which would make older apps refuse
    the whole backup.
11. **DSCR and debt yield across a mix of all-cash and financed deals.**
    *Recommend:* work them out over the financed deals only, and say "of the
    3 deals with a loan". LTV stays over all deals.
12. **Extras.** *Recommend:* approve E1–E5 now, in that order. Decide E6–E10
    later (E7 changes financial meaning, so it needs its own yes).

---

## 13. What was checked, what was not

- **Checked:**
  - read in the repo at `origin/main` (4.7.56): the engine entry points, the
    shell, the backup and migration code, and the record patterns, with the
    line numbers cited;
  - the IRR worked check was run through the engine's `irr()` in Node, and
    agrees with the quadratic solution.
- **Not checked:**
  - how the tab looks at 390 px (no screen is built);
  - the install-size estimate;
  - the "Valuate" product;
  - A.CRE's portfolio model page;
  - npm package sizes and release dates (marked UNVERIFIED in section 6);
  - Safari and WebKit, which aren't installed here. W1's validation plan
    runs the flows with `PW_BROWSER=webkit` where available, plus the owner's
    phone check.
- **Reader test:** answered by the designer from this document alone,
  because no fresh agent could be started. The answers are in the PR
  report.

# UW money notes: UW-2 units and evidence, UW-5 monthly cash flow

Designer notes for two items in `uw-filler-integration.md` (sections 3, 5
and 8). Each note is written so a builder can build it without guessing. Every
name and figure here is invented. **Status: proposed. Nothing is built.** The
owner approves before any code is written.

Prior art: a capped check of the npm registry only (GitHub was not searched,
to stay within the cap). The repo already has a scale reader (`app/scale.js`),
a unit inference (`app/omroll.js` `readings()`), T-12 amount parsing
(`app/t12.js:147`) and cents rounding (`app/engine/money.js`).

| Candidate | What it does | License | Size | Last release | Build-free, offline | Network | Security | Verdict |
|---|---|---|---|---|---|---|---|---|
| dinero.js 2.0.2 | money objects, `allocate` | MIT | not measured | 2026-03-13 | needs bundling | none known | — | **Build**: money logic never comes from outside code |
| currency.js 2.0.4 | `distribute` across cents | MIT | not measured | 2021-05-19 (stale) | single file | none known | — | **Build**: same rule; stale |
| largest-remainder-round 1.1.0 | largest-remainder rounding | MIT | not measured | 2020-05-17 (stale) | single file | none known | — | **Build**: about 20 lines in `engine/money.js` |

---

## NOTE 1 (UW-2): how a column gets its unit and period, asked rather than guessed

### 1.1 The rule in plain words
A money, area or percent column in a rent roll or T-12 is only read with a
unit and period that its own evidence supports. If two readings are still
plausible after the evidence has been checked, Zlatura stops and asks the
broker. It never picks a default. The broker's answer is kept in the fields
the app already has (`period.unit`, amounts already scaled). The evidence
behind it is shown at review and is not stored.

### 1.2 What happens today (the root causes UW-2 removes)
- **The spreadsheet importer guesses from header words alone.**
  `guessField` (`app/rentrollui.js:808-828`) maps the following, as tested
  with node against the current regexes:

  | Header | Mapped to today | Why it is wrong |
  |---|---|---|
  | "Months Remaining", "Term (months)", "Free Rent (months)" | **monthly rent** | `/month/` matches |
  | "Rent/SF/Mo", "Monthly $/SF" | **SF (area)** | `sf` is tested before `psf` |
  | "Annual Rent ($000)" | annual, unscaled | `scaleOf` is never consulted |
  | bare "Rent" | monthly | no check is made against the figures |

  `rowsToLeases` (`:1151`) then quietly prefers annual over monthly. The
  mapping sheet (`:1089`) has no "per SF per month" choice and no way to set
  a scale.
- **The OM reader takes a per-SF rate with no period as per year by
  convention** (`omroll.js:640-641`), even when the "per month" reading is
  just as plausible. Its range check (`:803`, $1.20 to $3,000/SF/yr) is
  looser than the plausibility test it uses to decide units (`:615`, $3 to
  $300). So $2.50/SF is read as $2.50 a year without any ask.
- **Number parsing differs between readers.** `kit.parseNum` reads "1,200-"
  and "—" as null. `t12.amountOf` (`t12.js:152-155`) reads them as -1,200
  and 0.

### 1.3 Order of evidence (highest wins; a lower step never overrides a higher one)
1. **Stated** by the column's own header, a merged parent header or the
   table caption: "Monthly", "/mo", "Annual", "/yr", "$/SF/Mo", "RSF",
   "USF", "GBA", "%", "($000)" (`scaleOf`). Merged-header inheritance is
   the only way a column's position counts. **Position alone never sets a
   unit.**
2. **Reconciled** against a stated total that carries its own unit, for
   example "Total annual rent 180,000", or a T-12 "Total" column against the
   sum of its months. A reading counts as reconciled when exactly one
   candidate reading lands within 0.5% of that total, or within $1 per row,
   whichever is larger. A total with no stated unit decides nothing, because
   it sums the same way under every reading.
3. **Inferred** from other columns on the same rows (the existing
   `readings()` method). Example: rent per SF × SF × 12 equals the printed
   annual rent, within 3%, so the per-SF column is per month.
4. **Plausibility** ($3 to $300/SF/yr, as in `omroll.js:615`) can only
   *rule readings out*. It never chooses between two readings that both
   pass.
5. **Convention** ("a per-SF rate is per year") is used only when every
   other reading has been ruled out by steps 1-4. Otherwise Zlatura asks.

**Stop and ask** when any of these holds:
- after step 4 more than one reading is left;
- a stated unit contradicts a reconciliation (show both readings);
- the column has a scale caption but holds rates, areas or percents (the
  scale never applies to those);
- a cell holds text in a money column ("Free", "TBD", "See note").

A row with an open ask is held, the same way an `omroll` fail is now. Every
other row stays usable.

**Build:** move `readings()`, `plausible` and `competing()` out of
`omroll.js` into a shared pure module, `app/units.js`. `omroll.js`,
`rentrollui.js` (the import) and `t12.js` (per-unit columns) all call it.
This is a move, not a copy: one definition. The import's choices gain "Rent
/ SF / month" and a scale choice (×1, ×1,000).

### 1.4 Edge cases (invented, worked by hand)
- **E1, settled by inference.** A "Rent" column holds 5,000 / 3,750 /
  6,250 on 2,000 / 1,500 / 2,500 SF. Read as annual, that is $2.50/SF/yr,
  which is ruled out. Read as monthly it is $30.00/SF/yr. Only one reading
  is left, so the column is monthly (`inferred`). Today the importer maps it
  to monthly by its header, and gets it right only by luck.
- **E2, ask (financial meaning, F1).** "Rent" is 6,000 on 1,000 SF. Annual
  gives $6/SF/yr and monthly gives $72/SF/yr, and both pass. The two
  readings differ 12 times: $6,000 a year or $72,000 a year. Zlatura asks.
  A stated "Total annual rent 72,000" would settle it as monthly (step 2).
- **E3, per-SF convention (F2).** "Rent/SF" is 2.50 on 2,000 SF, with no
  total column. Per year that is $5,000 (ruled out: $2.50 is below $3). Per
  month it is $60,000 a year, and that reading passes. Convention can't
  apply, so it is per month (`inferred`). With 18.00 instead, both $18/yr
  and $216/yr pass, so Zlatura asks. Today it takes $18/yr without asking.
- **E4, thousands (F3).** An "Annual Rent" column holds 60 on 2,000 SF.
  With a "($000)" caption it is $60,000, which is $30/SF, and it is
  accepted. Without the caption, the figure on its own can't tell a
  thousands-scaled annual rent from a $60/SF rate. **A scale is never
  inferred from the size of the figures.** Zlatura asks, offering ×1,000.
- **E5, percent or decimal (F4).** A recovery share column holds 12.5,
  0.8, 3.2. Because one value is 1 or more, the whole column is read as
  percent, so 0.8 means 0.8%. Applying `kit.asPercent` cell by cell would
  have made it 80%. A column of 0.125, 0.008, 0.032 is checked against the
  areas: share × building SF should equal tenant SF (0.125 × 40,000 =
  5,000, as printed), which makes it a decimal. Otherwise Zlatura asks.
  Escalations follow `parsePct`: a "%" sign is taken as printed.
- **E6, area basis (F5).** A "USF" column holds 2,000 and the building is
  23,000 RSF, on $69,000 a year. Per usable SF that is $34.50; per rentable
  SF (2,300 RSF, a 15% load) it is $30.00. `lease.sf` holds one area, so a
  usable or gross column is not put into `sf` unless the broker answers "use
  as rentable". Telling the bases apart in storage is P5's job. Bare "SF",
  "Size" or "Area" is read as rentable only when the sum of the rows'
  areas, plus the vacant space, is within 1% of the stated building RSF.
  Otherwise Zlatura asks once per roll.
- **E7, blank, zero, free, dash (F6).**
  - A blank rent cell is "not stated": the row is held, never read as 0.
  - "0" or "$0" is a typed zero: a documented period at 0, shown in the
    review.
  - "Free" or "Abated" is an ask: "Suite 110 says Free. Type its contract
    rent and when the free period ends." It becomes an abatement, never a 0
    rate.
  - A lone dash in a rent-roll rent cell is "not stated".
  - In a T-12 month cell a dash stays 0 (`t12.js:152`, the accounting
    convention), but only where that line has figures in other months. A
    line that is all dashes is shown as empty.
- **E8, negative values.** "(1,200)" and "1,200-" both read as -1,200
  (`parseNum` gains the trailing minus, matching `t12.amountOf`). A negative
  in a rent column is asked as "a credit or a concession?", because
  `validateLease` already rejects a negative rate. T-12 signs are left to
  `t12.js` normalise (`:467`).
- **E9, T-12 per-unit columns.** A "$/Unit" or "% of EGI" column is never
  summed into a total or treated as a month. Running totals keep today's
  hold (`t12.js:768`).

### 1.5 Shown at review, versus stored
- **Shown only:** the evidence for each column (the header text, the
  reconciliation and its gap, the inference ratio, the readings that were
  ruled out), listed as status words, never as a confidence number.
- **Stored, in existing fields only:**
  - each period's `rate` and `unit` as answered;
  - amounts after scaling;
  - the existing period `note`, for example "imported from <sheet>".
- **No new stored field.** Storing evidence in `deal.sources` would need
  decision 5 of the integration proposal.

### 1.6 Re-reading keeps hand edits
- A period with `edited: true`, a lease field the broker typed, or a figure
  whose `sources[key]` marks it as typed or taken by the broker is never
  overwritten by a re-read.
- `compareRolls` (`reconcile.js:291`) lists file-against-current
  differences. For each one the broker taps "keep mine" or "take the
  file's".
- The import's "Replace" choice (`rentrollui.js:1105`) currently replaces
  every lease and loses hand edits. It will keep edited leases unless the
  broker unticks "keep my edits". This is a behaviour change (question 5).
- On re-reading a file with the same SHA-256 (`deal.dd`), the earlier unit
  answer is pre-selected from the stored period units, labelled "as you
  chose last time". It is still confirmed by the review's "Use".

### 1.7 Tests that must fail on `git archive origin/main`
1. `guessField` for "Months Remaining", "Term (months)" and "Free Rent
   (months)" is not `monthly`; for "Rent/SF/Mo" it is per SF per month, not
   `sf`.
2. Importing E2 holds the row with an ask (today it imports $72,000 a year
   silently). Importing E1 gives monthly.
3. "Annual Rent ($000)" with 60 imports 60,000.
4. The E3 OM table at 18.00 with no total asks (today it gives `basis:
   'convention'`).
5. "1,200-" in a rent cell is flagged as negative (today: no period).
   "Free" produces an ask that names the row.
6. Re-importing with Replace keeps a period marked `edited: true` (today:
   lost).

Plus an e2e `uw-evidence-flow` at 390 px and desktop, with axe. Mutation
checks:
- swap the `sf`/`psf` order;
- drop the scale step;
- move the $3 plausibility bound;
- let plausibility choose between two readings that both pass;
- let a lower evidence step override a higher one.

Both golden checks must show 0 changed (no saved deal is re-read). The UW-0
scoreboard is re-run and its counts reported.

---

## NOTE 2 (UW-5): a monthly cash-flow view over `project()`

### 2.1 The rule in plain words
The monthly view is a **read** of a projection that already exists. It
shows 12 months under each analysis year. Every unrounded figure comes from
`project()` (`app/lease.js:337`), which already keeps `months`, `annual` and
`leases`. The view only rounds and lays out. It never recomputes rent,
recoveries, vacancy or NOI. If its months don't add up to `project()`'s
annual figure, the year is not shown and an error is raised. Nothing is
adjusted.

### 2.2 Where each number comes from (all existing code)
| Line | Source | How it falls by month (existing behaviour, inherited) |
|---|---|---|
| Contract and projected rent, free rent, net | `leaseMonths` (`lease.js:175`), through `P.leases[i].months` and `P.months[k].base/.projected/.free` | **actual days**: monthly rent × days covered ÷ days in that month (`:205`). This is Zlatura's convention (`lease.js:13-15`). It is not 30/360, and no choice is offered |
| Absorption and turnover vacancy | `project` `:372` | market monthly × (1 − share of the month occupied) |
| Recoveries | `recoveryAnnual` (`engine/recovery.js`), `:404` | (annual ÷ 12) × share of the month occupied; growth steps each analysis year |
| Percentage rent | `overageOf`, `:389` | (annual overage ÷ 12) × share occupied |
| Other income, opex, reserves | `:414`, `:419-420` | annual ÷ 12, grown at each analysis-year step (`Math.floor(k/12)`) |
| General vacancy | `:425-431` | the year's amount ÷ 12, evenly |
| TI, LC, one-time items | `monthIndex`, `:376`, `:408` | a lump sum in the month the new term starts, or the item's own month |
| EGI, NOI, cash flow | `:433-435` | taken as computed, never re-derived |
| Occupancy | `:436` | a percent each month; the year shows the existing average; never summed |

**Years** are analysis years. Year 1 starts on the first day of the as-of
date's month (`:342-343`), so a 2027-03-15 as-of makes year 1 run from
March 2027 to February 2028, and March is counted whole.

**Expense lines** are the single `opex` line and reserves that `project()`
has. Line-by-line expenses are A5. T-12 history months are never mixed into
the forecast, because history and projection mean different things.

**Per-lease rows**: `P.leases[i].months` carries rent lines only.
Recoveries and percentage rent per lease would need `project()` to record,
in `lr`, the value it already adds at `:389` and `:404`. That is an
additive output with no new maths, and the property sums stay the same
(question 7). Without it, per-lease rows show rent lines only.

### 2.3 Rounding (decided: largest remainder per row, once)
For each row (a property line or a lease line) and each year:
- the target is `toCents(P.annual[y][line])`;
- each month's unrounded value is snapped to `roundTo(v*100, 6)` cents, then
  floored;
- the shortfall, in cents, goes one cent at a time to the months with the
  largest fractional part. Ties go to the earliest month. A negative
  shortfall takes cents from the smallest fractional parts.

Values are kept as integer cents in a `Float64Array`, which is exact to
2^53. `Int32` would overflow at about $21M a month. The function is
`allocateCents(values, targetCents)` in `app/engine/money.js`: one
definition.

- **Derived rows** (GPR, EGI, NOI, cash flow) are rounded the same way,
  each against its own annual figure. They are not rebuilt from rounded
  parts. So a month may not cross-foot (EGI − opex ≠ NOI) by at most 1 cent
  per component line. The existing annual table (`rentrollui.js:542`) has
  the same property, since it rounds each figure separately. A footnote
  says so. This is a reversible display detail, so I decided it.
- **Lease rows** are rounded against each lease's own total, so the rounded
  lease rows may differ from the property row by up to 1 cent per lease in
  a month. A footnote says so.
- **Screen and XLSX** (question 6): the XLSX holds cents. The screen shows
  whole dollars, as the annual table does. It gets them from a second
  largest-remainder pass from the same unrounded months, against
  `Math.round(annual)`, which is the rule `money0` uses (`kit.js:72`). This
  is not chained off the cents. So the year on screen equals the annual
  table's figure to the dollar.

### 2.4 Edge cases (invented; checked against `project()` on the current main)
- **R1, a partial first month.** $3,000 a month starts 2027-02-16 (Feb 2027
  has 28 days). February earns 3,000 × 13/28 = 1,392.857… and shows
  $1,392.86. Under 30/360 it would be $1,500.00. That method is not
  Zlatura's, and using it would change golden figures.
- **R2, largest remainder.** A line of 1,000/3 a month, with an annual
  figure of 4,000.00. Plain rounding gives 12 × 333.33 = 3,999.96. Four
  cents go to January through April (a tie, so the earliest months win).
  4 × 333.34 + 8 × 333.33 = 4,000.00.
- **R3, free rent against unknown.**
  - A lease at $5,000 a month with January and February 2028 100% abated
    shows base 5,000.00, free −5,000.00 and net **0.00**, labelled "Free
    rent".
  - A per-SF lease with no SF is "can't tell" (`monthlyAmount` returns
    null). Its lease row is **blank**, with "no SF".
  - A gap between periods is blank, labelled "No rent stated", as
    `rentSchedule` does.
  - In both of those cases the engine counts the lease as 0 in the property
    totals today (`leaseMonths` `:203`). The view keeps that figure (golden
    0) and marks the property row "excludes 1 lease that can't be worked
    out", drawn from `validateLease` errors. Fixing the engine is a separate
    gated item (F9).
- **R4, rollover with the defaults** (`DEFAULT_SETTINGS` `:325`:
  probability 65, downtime 6, new free 3, renewal free 0, escalation 3;
  market $30/SF/yr on 2,000 SF = $5,000 a month; market growth 0).
  - The lease ends 2028-06-30.
  - Expected downtime is round(0.35 × 6) = 2 months, so July and August
    2028 have rent 0 and turnover vacancy of 5,000 each.
  - Expected free rent is 0.35 × 3 = 1.05 months: September is fully
    abated (net 0), and October is abated 5% (free 250.00, net 4,750.00).
  - September 2029 steps to 5,150.
  - Each month is labelled "projected", never "documented".
- **R5, lease-up.** A vacant suite with as-of 2027-03-15. Lease-up of 6
  months from 2027-03-01 starts rent on 2027-09-01. The first lease-up
  takes the full new-tenant free rent, so September to November are fully
  abated and December pays 5,000. March to August show absorption vacancy
  of 5,000 each.
- **R6, a lump in one month.** A $40,000 LC dated 2028-09-01 sits in that
  month only, not spread across the year.

### 2.5 Reconciliation (a check, never an adjustment)
For each year and line:
- before rounding, the sum of `P.months[12y..12y+11][line]`, in the same
  order, must equal `P.annual[y][line]` within 1e-6;
- after rounding, the cents must add up to exactly
  `toCents(P.annual[y][line])`;
- for lease rows, the sum over leases of unrounded rent must equal the
  property `base + projected` within 1e-6.

A failure hides that year's grid with "The monthly view doesn't match the
projection" and logs the line. The numbers are never nudged.

### 2.6 Performance (200 leases × 120 months)
- `project()` already runs off the main thread (`projector.js`,
  `projector-worker.js`).
- A new message kind, `monthly`, returns the property grid as transferable
  cents arrays: 18 lines × 120 months, plus whole dollars. Per-lease grids
  are fetched one lease at a time, on demand, and cached under the same
  content key, so a stale grid can't show.
- The main thread draws one year (12 columns) at a time, within 150 ms per
  edit.
- Worker time on the 200-lease invented roll is **unverified**. It will be
  measured in the PR, on desktop Chromium and at phone size, and reported.
  A real phone was not tested.

### 2.7 What would change a golden figure (none allowed: UW-5 is read-only)
Any of these would change a golden figure, and none is allowed:
- switching to 30/360 proration;
- starting year 1 on the as-of day instead of the first of its month;
- rounding inside `project()`, or building `annual` from rounded months;
- moving growth steps to calendar years or lease anniversaries;
- spreading general vacancy by weight;
- weighting recoveries by days;
- re-deriving NOI from rounded parts.

The view must not touch `P.annual`, which `analysisInput` reads for
`rrNoi1` (`impact.js:497-498`) and which `golden.mjs:68` reads. Both
golden checks must show 0 changed.

### 2.8 Tests that must fail on `git archive origin/main`
1. `allocateCents`, with R2 and a negative variant. Each must fail if the
   pass is removed, or if the tie rule is changed.
2. R1 gives $1,392.86, and fails under 30/360.
3. R3: the free month is 0.00 and labelled; the no-SF lease is blank, not
   0.
4. R4 and R5, month by month.
5. The reconciliation: change `P.annual[0].noi` by 0.01 and the check must
   fail and hide the year.
6. Every line, every year: the months add to the annual figure, to the cent
   and to the dollar.
7. e2e `cashflow-flow`: the year → month drill-down (absent on the old
   code), axe, 390 px, and a perf check with 200 leases.

Mutation checks:
- recompute recoveries in the view;
- use `toCents` on each month without the largest-remainder pass;
- offset the month index by one.

---

## Financial meaning: owner approval needed
Two readings give different numbers in each of these.
- **F1, ambiguous rent (E2).** Ask, never default. $6,000 and $72,000 a year
  are both possible.
- **F2, per-SF convention (E3).** Ask when both readings pass. This changes
  what the OM reader does today.
- **F3, thousands (E4).** Apply a scale only when it is stated.
- **F4, percent or decimal (E5).** Decide for the whole column; check
  against the areas where possible.
- **F5, usable or gross area (E6).** Kept out of `sf` unless the broker
  confirms "use as rentable".
- **F6, dashes (E7).** A dash is "not stated" in a rent roll and 0 in a
  T-12.
- **F9, the lease that can't be worked out (R3).** It is still counted as 0
  in property totals (existing); the view flags it.

## Questions for the owner (recommended default in italics)
1. Approve the evidence order and the "ask when two remain" rule (F1-F4).
   *Yes.*
2. Usable or gross area (F5): keep it out of `sf` until P5 unless the
   broker confirms. *Yes.*
3. Dashes (F6): "not stated" in rent rolls, 0 in a T-12 line that has other
   figures. *Yes.*
4. Unit answers live only in existing fields; evidence is shown and not
   stored (decision 5). *Yes.*
5. Import "Replace" keeps hand-edited leases by default (a behaviour
   change). *Yes.*
6. The screen shows whole dollars with their own largest-remainder pass; the
   XLSX holds cents. *Yes.*
7. Per-lease recoveries and percentage rent: let `project()` record per
   lease the values it already adds (additive; golden 0). *Yes, in UW-5.*
8. Analysis years only. Calendar-year grouping later, with its own
   reconciliation. *Yes.*
9. F9: keep today's totals and flag them in the view. Fixing the engine is
   its own gated PR. *Yes; list the gap in the acceptance matrix.*

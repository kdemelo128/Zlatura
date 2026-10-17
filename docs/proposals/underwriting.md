# Underwriting from the owner's support code (queue item g)

Status: **proposal, waiting for the owner's approval.** Nothing here is built.
Source: the owner's Python support code in `private/support-code/src/`
(git-ignored, read as untrusted, nothing run, nothing copied). It builds and
tests an Excel underwriting workbook. Only its ideas, checks and test cases
are used here, described generically with invented numbers. Earlier review:
`docs/proposals/rentroll-pdf-and-om-fill.md`, sections (a) and (e); owner
decision (g) 6 asked for this proposal.

**In one paragraph.** Most of the support code already exists in the app under
other names. The genuinely new parts are smaller than the earlier note said:

- **A normalisation method on each T-12 line.** There are four: as reported,
  annualise (× 12 ÷ N), run rate (the median month × 12), and exclude. There
  is also a normalised NOI with a bridge from the reported one.
- **N worked out from the months with activity**, and asked when that
  differs from the number of columns.
- **A "strict" review setting.** A true Draft mode, where unreviewed values
  flow into the model, is not proposed, because nothing may populate
  silently.
- **WALT by total GLA** as a third weighting.
- **About a dozen checks.**

**Correction to the earlier note.** Spike and gap detection is not new. It
was approved on 2026-10-15 as PR 3 of the T-12 multi-format proposal 2a
(`docs/proposals/t12-multiformat.md` section 5: missing month, spike,
negative month, large one-off) and is not built yet. This proposal builds on
that PR and does not repeat it.

## 1. What already exists (so it is not built twice)

| Support-code idea | In the app today | Verdict |
|---|---|---|
| Staging, then commit | Every import is a preview first. Values reach the deal only on a tap: "Use the T-12's figures" (`app/t12ui.js:249-285`), the rent roll's "Use" offers (`app/rentroll.js:279` `rollOffers`), and AI fields applied one by one (`app/review.js:52`) | Covered, and stricter |
| Review list with severity | Data QC levels fail / warn ("Check") / info ("Note") / pass (`app/dataqc.js:15-16`). A fail holds the import back (`blockingChecks`, `:22`). The Review Queue gathers open T-12 lines, T-12 checks, roll and OM checks, AI readings and template cells, largest amount first (`app/review.js:27`) | Covered |
| Approve / Modify / Reject / Defer | Approve: "It's right" or "Accept as read" (`dataqc.js:42`), or a "Use" tap. Modify: file a line under a category (`t12.js:400` `fileLine`), choose one of an OM check's fixes (`review.js:44`), or edit the value. Reject: an AI field dismissed, or an offer not used. Defer: the item stays in the queue. The resolution is stored on the check, where it lives (`dataqc.js:34`) | Covered: no new words |
| Draft vs Strict | Today the app is "strict for fails, open for warns" (`dataqc.js:7-10`) | **New: an optional Strict setting** (§3.4) |
| 9 categories; "unclassified" out of NOI, never dropped | 21 categories, finer, with below-the-line ones (`t12.js:24-49`). A line with no category counts in none and is totalled as `unassigned` (`t12.js:286-299`). NOI three ways skips a T-12 with unfiled lines (`conventions.js:28`) | Covered (keep the 21) |
| Annualise × 12 ÷ N | `annualized()` (`t12.js:305`) scales the whole statement × 12 ÷ its month columns, only on confirmation, and labels it (`t12ui.js:277-285`; convention `t12.months`) | Partly covered: per statement, with N = columns |
| Run rate (median × 12), as reported, exclude, **per line** | none | **New** (§3.2) |
| N from active months; a gap only when every line is zero | 2a PR 3 plans "Missing month: … a month column blank on every line" | **Adopt the definition** into 2a PR 3 (§3.3) |
| One-time spike, negative month | Approved in 2a PR 3 with its own thresholds | Covered by 2a (thresholds: decision 4) |
| Rent engine, expiry handling | `lease.js` projects monthly from periods, free rent, renewal probability, downtime, market rent and leasing costs (`lease.js:290-372`). "No renewal" means renewal assumptions off (`R.assume === false`, `:302`). "Renew at the expiring rent" means 100 % renewal with no market rent set: the last contract rent stands in, grown at market growth, and a note says so (`lease.js:324-330`, `:519`) | Covered, and richer. The only gap is that "the expiring rent, flat" needs market growth at 0 %. That is a documented setting, not new code |
| WALT, three weightings | One definition (`engine/walt.js:31`) by income and by SF; headline picked by convention `walt.weight` (`conventions.js:8-12`); month-to-month leases left out or counted at 0 | 2 of 3. **New: total GLA, vacant space at 0 years** (§3.5) |
| Past due as a note only | Property-manager profile (#46): Past Due and Balance columns are noted, never rent (`rrdoc.js:51`, `:72`) | Covered |
| Per-column tie-out to printed totals; refuse an unknown layout | `omroll.js:862` (a failed `total` check), layout guard `rrdoc.js:67` | Covered |
| Monthly vs annual mix-up | The OM roll reader infers the rent's unit and asks when it is ambiguous (`omroll.js:790`, `:986`). A range check fails (`omroll.js:811`); a $/SF consistency check warns (`omroll.js:822`) | Covered on import. Not on rolls typed by hand (§3.6, check K33) |
| Provenance per value | Data QC checks carry page, line, row and cell (`dataqc.js:3-6`). `deal.sources[k]` keeps the file, line and original value for T-12 figures (`t12ui.js:285`). Leases carry their source kind and file (schema 4). 2a adds `src` on each T-12 line | Covered once 2a lands |
| Printed NOI vs recomputed; line and subtotal tie-outs | `statementChecks` ids `stated.*`, `linetotals`, `sub.*` (`t12.js:322-356`) | Covered |
| NOI cross-checks | NOI three ways: the OM's, the T-12's and the rent roll's year 1, 2 % / 5 % (`figures.js:328-370`, `NOI_GAP`) | Covered (stricter than the code's ±25 %) |
| Independent "oracle" recomputation | none, by rule | **Not adopted.** It is a calculator checking itself (Part 21.2). Fixed invented answers instead |
| Lease type inferred from charges | `lease_type` is a field the broker or OM fills | **Not adopted.** That would be an invented value |

## 2. Prior art

The repo already vendors pdf.js, Tesseract, ExcelJS and fflate
(`THIRD_PARTY.md`). None of them does underwriting math, and none should
(working rule 5). The median the run rate needs already exists:
`engine/comps.js:13` `median`, a true median that averages the middle two.

The search was capped. I searched the npm registry for "real estate
underwriting", "rent roll walt", "t12 operating statement" and "noi real
estate", and ran one web search. The GitHub search API was **not reachable**
(the session is limited to its own repositories), so GitHub was not searched
directly.

| Candidate | What it does | License | Size | Last release / maintenance | Build-free, vendored, offline | Network / telemetry | Security | Verdict |
|---|---|---|---|---|---|---|---|---|
| npm search (4 queries) | No package found for NOI normalisation, T-12 or WALT. Only unrelated hits (an MCP server for German depreciation; an Elastic-2.0 "rent" package) | n/a | n/a | n/a | n/a | n/a | n/a | Nothing to adopt |
| `simple-statistics` 7.12.1 | Median, quantiles and more | ISC | 1.35 MB unpacked | current | yes | none | low | **Build ourselves.** We need one median, and it already exists in `engine/comps.js` |
| CRE "skills" (`mariourquia/cre-skills-plugin`, Apache-2.0 per its listing; `ahacker-1/cre-acquisition-orchestrator`) | Agent instruction files: a T-12 normaliser, a rent roll formatter, an underwriting engine | listed Apache-2.0 / unknown | n/a | not verified | not code modules | not verified | unverified | **Not adopted.** Prose for an AI agent, not code, and money logic must be our own |
| The owner's support code | Python and Excel formulas | the owner's own | about 2,500 lines | n/a | no (Python) | none (reviewed in (a)) | holds real client data | **Adapt the ideas only.** The formulas would be a second copy of the math |

No new library. Nothing copied.

## 3. The design

### 3.1 What changes for the broker

On the deal's **T-12 tab**, each line gets a small chip, "Counts: as
reported". Tapping it opens an action sheet with the four methods. Each shows
the annual amount it would give, so the choice is made with the numbers in
view.

A **"Normalised NOI" card** sits under the totals. Phone-first, it is a list
rather than a wide table:

> NOI as reported (7 months) → annualised lines → run-rate lines → excluded
> lines → **normalised NOI (a year)**

It ends with "Use normalised figures". That button goes through the existing
"Use the T-12's figures" flow and its confirmation and Undo. The source label
on each figure says how it was made, for example "T-12, normalised: 3 lines
run rate, 1 excluded, N = 7".

Nothing changes until the broker picks a method. Every line starts at **as
reported**, which is today's behaviour.

### 3.2 Normalisation rules (exact)

One pure function in `app/t12.js`, `normalise(t, { n })`. It returns each
line's normalised annual amount, the side totals (EGI, operating expenses,
taxes, NOI) and the bridge steps. It uses only `toCents` (`engine/money.js`)
and `median` (`engine/comps.js`). No second copy of the math: `annualized(T)`
becomes "every line annualised" through this function, and a test proves the
result is identical to today's to the cent (decision 2).

| Method | Annual amount | Notes |
|---|---|---|
| As reported (default) | the line's `total` | Today's figure. Over fewer than 12 months it is a partial-period figure, never presented as a year |
| Annualise | `total × 12 ÷ N` | N from §3.3 |
| Run rate | `median(non-zero months in the window) × 12` | Blank months (2a's `blank`) and zero months are both left out. A line with no non-zero month gives 0, with a Note |
| Exclude | 0 in NOI | The line stays visible and is listed in the bridge (conservation, K11). Typical uses: one-time items, an owner-level cost the rules missed |

**Rounding (one rule, as F1).** Each method group on each side is rounded
once:

- the annualised lines on a side: `toCents(Σ totals × 12 ÷ N)`;
- each run-rate line: `toCents(median × 12)`;
- the as-reported and excluded lines: as stored.

Each line on screen is shown to the cent on its own. When those shown amounts
add up to a few cents away from the side total, a Note says so, as the
`monthsround` check does today (`t12.js:333`). With every line annualised,
this gives exactly what `annualized()` gives today.

**The sign of the result.** It follows the statement's own conventions after
`normalizeSigns`: income positive, expenses positive as costs.

**Worked examples (invented).** A statement with 12 month columns, Jan to Dec,
where the owner's activity starts in June. Every line is zero from January to
May, so N = 7.

1. *Repairs:* Jun 400, Jul 420, Aug 0, Sep 3,000, Oct 380, Nov 400, Dec 410.
   The total is 5,010.00.
   - As reported: 5,010.00.
   - Annualise: 5,010 × 12 ÷ 7 = 8,588.571… → **8,588.57**.
   - Run rate: the non-zero months are 380, 400, 400, 410, 420 and 3,000. The
     median is (400 + 410) ÷ 2 = 405, and × 12 gives **4,860.00**.
   - Exclude: 0.

   August being zero on this one line is **not a gap**: other lines are active
   in August. September is flagged by 2a's spike check: it is more than 3 × the
   median month.
2. *Real estate tax, paid monthly with one catch-up:* 1,000 each month, plus
   2,500 extra in October. The total is 9,500.00.
   - Annualise: 9,500 × 12 ÷ 7 = **16,285.71**.
   - Run rate: the median is 1,000, so **12,000.00**.

   The broker sees both before choosing. The app doesn't choose.
3. *Bridge:* income annualised, repairs run rate, tax run rate, and a 1,200
   legal fee excluded. Each step of the bridge is shown, and the steps add up
   exactly to the normalised NOI. A test proves that for every combination
   of methods in the fixtures.

### 3.3 N, the months with activity

- **Active month.** A month in which at least one line is non-zero.
- **Gap.** An inactive month between the first and the last active month.
- **N.** The number of active months.

When N equals the number of month columns, nothing is asked. When it
differs, for example 11 active months out of 12 columns with April zero on
every line, **two readings differ, so the broker is asked** (Part 0 rule 6):
"Annualise over 11 months with activity, or all 12 columns?". Until the
broker answers, "Annualise" isn't offered and the gap stays an open Check.
The answer is stored (§3.7) and shown in every label ("N = 11, April had no
activity").

Months before the first active month, as in pre-ownership, are not gaps.
They are said in words: "activity starts in June".

### 3.4 Strict review (a setting, not a Draft mode)

The support code's Draft mode lets proposed values flow into the model before
review. Here that is ruled out: nothing populates silently. Today's behaviour
already sits between the two modes. So the setting is:

- **Settings → Calculation conventions → "Before figures can be used".**
  - *Failed checks resolved* (default, today).
  - *Every open check resolved (strict).*
- **In strict mode,** while the T-12 or the rent roll has an open warn, these
  are disabled with "N checks still open: review them first", linking to the
  Review Queue:
  - "Use the T-12's figures";
  - "Use normalised figures";
  - the rent roll's "Use" offers.
- **NOI three ways** shows the gap but says "not compared: checks open".
- **Stored** as a settable convention in the existing kv `conventions`, which
  already travels with the device's settings. It is not on any deal, so the
  saved-deal format is unchanged. At the default nothing changes: the golden
  outputs stay identical.

### 3.5 WALT by total GLA

The `walt.weight` convention gains a third option: *By total area (vacant at
0 years)*.

- **Definition:** Σ(SF × years left) over dated occupied leases, ÷ (their SF +
  vacant SF).
- **Month-to-month and undated leases** follow `walt.mtm` exactly as today.
  When they are left out, their SF is out of the denominator too, so nothing
  counts twice.
- `walt()` returns a new `gla` value next to `income` and `sf`, and
  `waltMethod` names it.
- The default stays "by income", so the golden outputs are identical.

### 3.6 The 59 checks

Key: **A** adopt (a new check in §4), **C** already covered (with where), **N**
not applicable, with the reason.

| IDs | What | Verdict |
|---|---|---|
| K01–K04 | Roll units, SF, rent and charges against the printed totals | C: `omroll.js:862`, #46 |
| K05–K06 | Deposits and past due against the printed totals | N: those columns aren't kept; past due is a note (`rrdoc.js:51`) |
| K07, K08, K09 | Line months against the printed total; subtotals; printed NOI | C: `statementChecks` (`t12.js:322`) |
| K10, K12 | Lines with no category; held out of NOI | C: `openLines`, the Review Queue, `unassigned` |
| K11 | Conservation: categories plus unassigned equal the statement | C in the code (`t12.js:286`); **A as a test invariant** over every fixture, including excluded lines |
| K13 | Category conflicts with the line's side (an income line filed as an expense) | A: Check |
| K14–K16 | Lines with no model line; N defined | N: the 21 categories are the model lines; N is always defined |
| K17 | Window shorter than 12 months | C: check `months` (`t12.js:327`) |
| K18 | Last month incomplete (report run inside it) | A later, with 2a's `source` metadata, and only when the file prints a run date. Otherwise N |
| K19 | Gap months | A: the definition in §3.3, inside 2a PR 3 |
| K20, K21 | Occupied suite with no SF; tenant with no rent | A: Check. A tenant with a blank rent appears to count as vacant today (`lease.js:553`: occupied means rent > 0). Missing must not quietly read as vacant (unverified; the PR's first test confirms it) |
| K22, K23 | Missing lease start; missing end | K23 C: rule `undatedLeases` (`figures.js:259`). K22 A: Note |
| K24, K25 | Lease already ended at the as-of date; rent starting after it | A: Check; Note |
| K26 | Roll dated after it was run (forward-dated) | A for PDF rolls whose footer gives a run date. Otherwise N |
| K27 | Duplicate unit IDs | Partly C (an import warns about suites already in the roll, `rentrollui.js:1053`). A within one roll |
| K28 | Duplicate statement lines (same label, section and months) | A: Note |
| K29, K30 | Occupancy; roll GLA against another source | C: `leaseStats`, rules `rentRollOcc` and `rentRollSf`, `reconcile.js:159-162` |
| K31–K33 | Highest, lowest and median rent per SF; monthly vs annual | C on import (`omroll.js:811`, `:822`). A: K33 as a Note on any roll, median outside a band (decision 5) |
| K34, K35 | Expenses and tax per SF | C as figures (`figures.js:119-120`). No band: N |
| K36 | Tax against assessed value × rate | N: no assessed value or tax rate is kept; the rule `assessment` asks the question |
| K37 | Recoveries counted twice (the T-12's and the roll's) | A: the design note comes first (Part 21.2; the acceptance matrix records double counting as only partly checked). §4 U7 |
| K38, K39 | Negative month; one-time spike | C by 2a PR 3 (approved) |
| K40 | Management fee % used against the statement's | N: the app does not price management as a % of EGI (to confirm in the U7 note) |
| K41–K45, K48, K49, K59 | Spreadsheet formula integrity | N: one engine, no spreadsheet copy of the math |
| K46, K47 | EGI and NOI identities | C: the engine (`figures.js`) and its tests |
| K50 | Capacity of 20-unit tabs | N: no fixed capacity |
| K51 | Critical inputs missing | C: rules `noPrice`, `noOpex`, `noNoi` |
| K52 | TI reserve given | N: renewal TI settings (`lease.js:401`) |
| K53 | Cap rate within 3–12 % | N: a band on the broker's own assumption adds noise (decision 6) |
| K54, K55 | Critical or warning items still open | C: the Review Queue count, Data QC `blocking`; strict mode (§3.4) |
| K56 | Decision and status disagree | N: one stored resolution, no second status |
| K57 | Model NOI against T-12 NOI (±25 %) | C, stricter: `noiT12RentRoll` (2 % / 5 %) |
| K58 | Template vacancy kept | N |

Count: 14 adopted (K11 as a test invariant; K18 and K26 only when the file
prints a run date), 23 covered, 22 not applicable. The importer's other ideas:

- **Same lease across suites** (same tenant and end date): A, a Note, because
  it affects concentration.
- **Rent start shown by the T-12's monthly rent stepping up by one tenant's
  rent, or a missed month:** an optional later PR, Notes only (decision 7).
- **A scheduled step above 5 %:** N. The lease schedule shows it.

### 3.7 Data model

Every change is additive and optional. Old backups read exactly as before.

| Where | Field | Meaning | Gate |
|---|---|---|---|
| `deal.t12.lines[i]` | `method?: 'reported' \| 'annualise' \| 'runRate' \| 'exclude'` | Absent means as reported | **Approval: stored field** |
| `deal.t12` | `window?: { n, how: 'active' \| 'columns' }` | The broker's answer in §3.3 | **Approval: stored field** |
| `deal.t12.applied` | `normalised?: true` plus the method counts | So the source label and Undo can say how a figure was made | **Approval: stored field** |
| kv `conventions` | `review.strict`; `walt.weight` gains `'gla'` | Device settings; the defaults are today's | Not a deal-format change; listed for the owner |

**No migration step** is needed: these are absent fields with defaults
(`app/migrate.js` is untouched). The tests are:

- an old-backup fixture, `tests/fixtures/backup-4.7.25-before-underwriting.json`
  (invented), restores with identical totals, figures and checks;
- a backup that uses the new fields round-trips.

**One overlap to settle.** 2a planned a `recurring` field on each line, and it
would overlap with `method: 'exclude'`. Two fields that must agree are a
trap (decision 3).

### 3.8 Test cases rewritten from the 48

Each case below gets an invented fixture. The cases are rewritten, not
ported.

| Support case | New test |
|---|---|
| A02, A05 | Already in `tests/t12.test.js` and the roll tie-outs (#46) |
| A03, C22 | `normalise` twice on the same input gives deep-equal results |
| B05, C11a/b | `walt()` with all three weightings against hand-worked answers; the label changes |
| B06, C06 | Conservation: a new unrecognised line is unassigned, NOI is unchanged, and the bridge adds up |
| B07 | The bridge steps add up exactly to the normalised NOI, for every combination of methods |
| B11, C08 | A tenant with a blank rent stays blank (never 0) and raises K21; it does not read as vacant |
| C01, C02 | Strict mode: "Use" is disabled with a warn open and enabled once it is resolved; at the default nothing is gated |
| C04, C05 | Excluding, then reclassifying a line, moves NOI by exactly that line |
| C07 | Already covered: a line +100 off its Total fails `linetotals` |
| C09, C09b | Expiry with renewals off: rent stops at the end date. 100 % renewal, no market rent, growth 0: rent continues flat (`lease.test.js`) |
| C10 | A roll typed by hand with an annual rent in the monthly box raises K33 |
| C12 | Duplicate unit IDs (K27) and duplicate statement lines (K28) are each flagged once |
| C13 | Answering "all 12 columns" re-annualises every line, and NOI follows |
| C20 | One line at zero in two months: N is unchanged, no gap |
| C21 | Every line zero in one month: N = 11, the question is asked, and "Annualise" is withheld until it is answered |
| A04, A06, B01–B04, B08–B10, B12–B18, C03, C14–C19 | Not applicable: they are workbook-specific, an oracle, or a template policy. Or they are covered by the cases above |

## 4. PRs, in order

Every PR runs `check:full`, mutation checks (the `quality-gates` skill) and
new tests that fail on the old code (`git archive` with `BASE=`). The
golden outputs are checked every time. No golden deal has a T-12 (2a section
3), so T-12 PRs should show 0 changes. That is checked, not assumed.

| PR | What | Size | Fails on old code | Mutation targets | Golden | Owner approval |
|---|---|---|---|---|---|---|
| — | 2a PR 1 and PR 3 (approved, queue h), with §3.3's gap definition folded in | (2a) | C20, C21 | gap = "all lines zero" against "any line zero" | 0 expected | already approved; the definition is decision 1 |
| U1 | `normalise()` in `t12.js`, with `annualized()` built on it; `method` and `window` read; no screen yet | M | examples 1–3, B07, the conservation invariant | median of non-zero months against all months; ×12÷N against ÷12×N; exclude dropped against kept; group rounding against per-line rounding | 0 (identity test against `annualized()`) | **yes: stored fields (§3.7)** |
| U2 | T-12 tab: the method chip and sheet, the normalised card and bridge, "Use normalised figures" through the existing flow, the source label | M | the browser flow at iPhone size: the chip changes the bridge; Undo restores it | the bridge step order; the label text | 0 | covered by U1's approval |
| U3 | The strict review setting | S | C01, C02 | the gate when a warn is open against a fail only | 0 at the default | yes: a new setting (decision 8) |
| U4 | WALT by total GLA | S | B05, C11b | vacant SF in the denominator; mtm SF out | 0 at the default | no (a reversible setting) |
| U5 | Roll checks K20–K22, K24, K25, K27, K33 and same-lease, as rules in `figures.js` | M | B11/C08, C10, C12 | thresholds; blank against 0 | **may change**: `golden.mjs` records check text (`golden.mjs:75`), so golden rolls with these conditions gain rows. If so, I stop and show a before/after table | yes if golden moves |
| U6 | T-12 checks K13 and K28 | S | C12 (lines) | the side test | 0 | no |
| U7 | K37 recoveries counted twice: the designer's note first, then the check | S | a fixture with recoveries both in the T-12 and in the roll's projection feeding NOI | — | 0 expected | the note may raise a decision |
| U8 (optional) | The T-12's monthly rent steps against the roll: rent start or missed month, Notes only, never applied | M | an invented 6-unit roll whose T-12 steps by one tenant's rent | the match tolerance | 0 | decision 7 |

**Cost.** No paid service and no library. Build effort is roughly U1 + U2
(two M PRs), plus four small ones. Install size and start-up time are
unchanged. The per-edit budget of 150 ms holds, because `normalise` is linear
in lines × 12.

## 5. Risks and the Part 21.2 review

**Risks.**

1. **Run rate understates a real lump cost**, such as a tax paid twice a
   year. It is never the default. Every option shows its annual amount, and
   2a's lump wording ("taxes paid in April") sits beside it.
2. **"Exclude" can hide a recurring cost.** Excluded lines stay in the
   bridge, labelled, and their total is shown.
3. **Two N's.** Settled by asking (§3.3), and the answer is shown in every
   label.
4. **The strict setting can feel like a broken button.** The disabled state
   names the open checks and links to them.
5. **The golden outputs can move in U5.** I stop with a table.

**Prohibited practices (Part 21.2).**

- **Blank as zero:** run rate leaves out blank and zero months. A blank rent
  stays blank and is flagged (K21). The gap rule uses activity, not blanks.
- **Monthly and annual:** every method's output is a year. "As reported" on
  a partial statement keeps today's "not a year" label. K33 catches an
  annual rent typed as monthly.
- **Counting twice:** K11 conservation; excluded lines are counted in the
  bridge once. K37 handles recoveries. The month-to-month SF is kept
  consistent in the GLA WALT.
- **A calculator checking itself:** no oracle. The tests use fixed,
  hand-worked invented answers. The identity test against `annualized()`
  compares two code paths that must agree, so the hand-worked examples carry
  the correctness.
- **An invented value:** no method is picked for the broker. N is asked when
  the two readings differ. Lease type is not inferred. Rent-start evidence
  stays a Note.

## 6. Decisions for the owner

1. **Gap definition and N.** A gap is a month where every line is zero. N is
   the number of active months, and you are asked when it differs from the
   column count. *Recommend: approve, folded into 2a PR 3.*
2. **One engine path.** Rebuild `annualized()` on top of `normalise()`, with
   identical results proven by test. *Recommend: yes.*
3. **`method` against 2a's `recurring`.** *Recommend:* store only `method`.
   "Recurring: no" becomes `exclude`, with "one-time" as the reason. 2a's
   `capital` stays as it is.
4. **Spike thresholds.** The support code uses one month ≥ 40 % of the line
   and ≥ $5,000. 2a, as approved, uses more than 3 × the median month and
   more than the larger of $1,000 and 0.5 % of EGI, plus a large one-off at
   ≥ 50 %. *Recommend: keep 2a's (already approved), settable.*
5. **K33 band for the median rent per SF a year.** *Recommend:* a Note
   outside $3–$200 per SF a year for commercial types, and outside $3–$80
   per SF a year for multifamily, settable.
6. **No band on cap rates (K53).** *Recommend: agree.*
7. **U8, rent-start evidence from the T-12.** *Recommend: build it later, as
   Notes only.*
8. **The strict setting.** Default "failed checks only", as today.
   *Recommend: approve.*
9. **Normalised NOI and NOI three ways.** *Recommend:* NOI three ways keeps
   comparing the as-reported 12-month T-12. The normalised NOI is shown
   beside it as its own labelled line, never in its place.
10. **Data format (§3.7).** Three optional deal fields, no migration step, an
    old-backup fixture. *Recommend: approve.*

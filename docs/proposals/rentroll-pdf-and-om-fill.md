# Rent roll from a PDF, OM fill bug, and the owner's support code

Status: **proposal, waiting for the owner's approval.** Nothing here is built.
Written 2026-10-17 against main at 4.7.17. Read-only work: no `app/` or `tests/`
file changed. Invented fixtures only; the support code stays in the git-ignored
`private/support-code/` and is described here by structure, never by its
property, tenant or figure content.

Parts: (a) the support code, (b) the OM fill bug, (c) a rent roll PDF as its own
document, (d) test plan and PR sizes, (e) the underwriting feature, (f) the
build rules, confirmed, (g) decisions needed.

## (a) The owner's support code

### What it is, and the review

`private/support-code/943c5af9-UW_support_code_and_test_results.zip`, unpacked
to `private/support-code/src/`: 17 Python files (about 2,500 lines), one shell
script, 3 JSON files and 5 test-result files. `git check-ignore` confirmed
`private/` is ignored before copying; `git status` is clean. Treated as
untrusted input:

| Check | Result |
|---|---|
| Secrets (keys, tokens, passwords, URLs with credentials) | none found by pattern |
| Network calls | none. The only `http://` strings are OOXML namespace names |
| Process execution | only local LibreOffice (`soffice`) in `finalize.py`, `run_tests.py`, `recalc.sh`; no `eval`, `exec`, `pickle` |
| Third-party libraries | `pdfplumber`, `lxml`, `openpyxl` (Python). None can run in this app; none adopted |
| Real client data | **yes, as examples.** `make_example.py`, `run_tests.py`, `json/*`, `tests/*` hold a real property address, tenant names and dollar figures. Also the owner's template name and absolute paths into the owner's sessions. All of it stays in `private/`; none is quoted here or may reach a test, doc, commit or PR |

It is Python that builds and tests an Excel underwriting workbook; the app is
vanilla JS with no build step. So nothing is copied. Ideas, checks and test
cases are rewritten into the app's own modules, in normal PRs, after approval.

### File by file

| File | What it does | Overlaps | Verdict | What it would save |
|---|---|---|---|---|
| `extract_docs.py` | Reads two property-manager PDF reports (a rent roll with monthly charges, a 12-month income statement) by word position. Fixed x-bands for one vendor's layout. Every value keeps file, md5, page and box. Ties every column to the report's own subtotal and grand total. **Refuses an unknown layout** instead of mis-reading | `omroll.js`, `omstatement.js`, `t12.js`, `dataqc.js`, `reconcile.js` | **Adapt the ideas, skip the code.** Fixed pixel bands cannot be used: the app finds columns from the header. Adapt: a property-manager rent roll profile (see c), per-column tie-out against the printed subtotal and total, refusing an unknown layout, rejoining a lease-to year wrapped onto the next line | Retyping a manager's rent roll into a CSV, and checking its totals by hand |
| `uw_import.py` | Turns the extracted data into proposals and exceptions, each with severity, source, reason and an Approve/Modify/Reject/Defer decision. Rent-start evidence, spike detection, duplicates, forward-dated roll, past-due as note only, CoStar GLA mismatch | `t12.js` (21 categories, 2%/5% NOI thresholds), `review.js`, `reviewui.js`, `reconcile.js`, `lease.js` | **Adapt selected checks** into `reconcile.js`/`dataqc.js` as Data QC checks, one PR each (see d). Not the class itself | Spotting a duplicate unit, a forward-dated roll or a one-time spike by eye |
| `oracle.py` | A second, independent Python recomputation used only to test the workbook | the engine | **Skip as code.** A calculator checking itself is prohibited (Part 21.2); the app's tests use fixed invented answers instead | Nothing |
| `schema.py`, `mapdata.py` | 9 NOI categories, the classification rules, the lists, and a table of "document field -> where it lands -> check" | `t12.js` categories (21, more granular), `t12labels.js` | **Adapt `mapdata.py` only as an idea:** a visible "what was read, and where it went" table on the preview. Keep our 21 categories | Wondering where a figure went |
| `build_template.py`, `build_sheets.py`, `build_sheets2.py`, `layout.py` | Build the Excel workbook: control, review, rent roll, rent projection, NOI, reconciliation, 59 checks, provenance | `template.js`, `workbook.js`, the engine | **Skip as code: it is a second copy of the math in spreadsheet formulas.** Keep as the spec for the underwriting feature (e) | Nothing now |
| `xl.py`, `inject.py`, `finalize.py`, `recalc.sh`, `dump.py`, `peek.py`, `make_example.py` | Edit OOXML directly, recalculate in LibreOffice, inject cached values; helpers | `template.js` (ExcelJS), `tests/e2e/lo_values.py` (LibreOffice recalc already used in tests) | **Skip** | Nothing |
| `run_tests.py`, `tests/results.json`, `tests/table.md` | 48 tests, all PASS, in groups A (ingestion), B (calculation, provenance), C (review gate, edge cases). The logs differ only by run time | `tests/*.test.js` | **Adapt the cases, not the runner**, as invented-fixture tests: refuses another layout, wrapped label across a page break, monthly-vs-annual mix-up, missing rent stays blank, duplicates, capacity, forward-dated roll, repeatability | A ready list of edge cases |
| `json/rentroll.json`, `json/t12.json` | Output of the extractors on the owner's real documents | n/a | **Skip. Real data.** Structure only: 7 units, 12 tie-outs for the roll; 12 months, 28 lines, 13 subtotals, 41 tie-outs for the statement | Nothing |

Nothing in it may duplicate or bypass the engine: the formula sheets and the
oracle are the two places that would, so both are skipped as code.

## (b) Bug: the OM's rent does not fill the boxes

### How it was reproduced

Invented PDFs (positioned text, `tests/rr-fixtures.js` `pdfOf`) through the real
path: pdf.js -> `readOm` -> `omReadRecord` -> `omRollRecord` -> `fromOmRows` ->
the grid's `annual` column. 24 header and layout variants, plus an invented
property-manager report. Scripts are in the session scratchpad, not committed;
the build PRs will turn them into proper tests. The designer (Opus) re-ran them,
checked each finding in the code and corrected one of mine (the matrix script
skipped the `KIND` filter `dealui.js` applies, so its "rent" warning cannot
occur in the real app).

**The OM's "annual rent" does not fail in the plain cases:** annual columns,
monthly columns, a bare "Rent" column, cents, no `$`, "Annual Base Rent",
"Current Annual Rent", "Rent/Mo", a rent-per-SF-only column, a Total row or none,
a title of "Tenant Schedule" or "Lease Schedule" or none: all 17 read and map to
leases (a 60,000 rent shows as 60,000 in the grid). So the report has several
causes, below, none of them "monthly vs annual detection" (that part works, and
warns when a header does not say).

### Findings

| # | Finding | Which of your three? | Where | Fix shape |
|---|---|---|---|---|
| F1 | Annual and monthly columns read and map correctly | n/a | n/a | none |
| F2 | **A rent roll in thousands** ("($ in thousands)", "($000s)", "($000)") is read as $60 a year. Four range fails, all rows **held**, the rent roll stays empty, and the Data QC says the leases add up to $192. "Accept as read" then stores $60 rents. `omstatement.js` already handles scale; `omroll.js` has none | **read but not mapped** (the scale is printed, never applied) | `omroll.js` `finishRow` 658-668, `rentroll.js:247, 273-275` | reuse `scaleOf` (`omstatement.js:95`); scale only from the table's own header and the 1-3 lines above it; multiply money columns only, with `toCents(v * scale)`; say so in the row's `why` and an info check; if still implausible, flag and ask |
| F3 | **The OM's stated in-place rent is read, then thrown away.** `rent_inplace` has no box, so `dealui.js:440` skips it; the rent check in `reconcile.js:248-253` can therefore never run in the app. Nothing else is dropped this way (`FIELDS` minus `KIND` is only `rent_inplace`) | **read but not mapped** | `dealui.js:440`, `reconcile.js:248` | smallest: pass `om.fields.rent_inplace` to `omRollRecord` only (not stored as a figure), unless the statement check holds it back; no new box, no data-format change. Adding a box instead is a data-format change: approval |
| F4 | **Nothing fills Building SF, Occupancy, Units or Gross potential rent from the rent roll.** They fill only from labelled lines in the OM's text. The rent roll card shows its own tiles (in-place rent, occupancy), and none while rows are held | **not mapped** | `engine/figures.js:174` derives only price, NOI, cap | any auto-fill changes saved figures (approval); it would also make the reconcile checks for SF and occupancy compare the roll with itself (Part 21.2). Offer it as "use the rent roll's 6,500 SF?" with a tap, never silently, and never derive GPR |
| F5 | **A property-manager report is misread** (invented layout: Rent, Monthly Charges, Deposit, Lease From/To, Past Due, unit-count subtotals) | see below | `omroll.js` | see below |
| F6 | A two-line header whose second line holds only "Rent" (labels top-aligned) finds **no rent roll**; bottom-aligned works | **not read** | `headerAt` 302, `readBody` 455-457, 762 | also take the deeper header merge when every cell of the next line merges into an existing header cell and the score is no lower |

F5 in detail (all four confirmed by the designer):

- (a) **"Monthly Charges" is read as the monthly rent**, so a 5,000 rent shows as
  400 (annual 4,800 for 60,000). `kindScores` 114-117 scores it `monthly` because
  "charges" is not a non-rent word; `readings` 560/586 then lets the first column
  win and the Rent column's figure is dropped without a word. Fix: treat
  `charges`/`fees` as recoveries when the label has no rent word, and add a
  warning when two columns compete for one reading. Hazard: a combined "Rent &
  Charges" column must not lose its rent.
- (b) **"4 Units" (a subtotal) is counted as a tenant row** (SF doubled), so
  the subtotal and total checks fail and the whole roll is held. `classify`
  326-334. Fix: add unit-count labels to `SUMMARY` and `subtotalLabel`, still
  guarded by `sumsMatch`.
- (c) **The lease-to year printed on the next line is lost** (end "12/31/"):
  the lone year becomes its own row and is dropped. Fix in `joinLines`: join a
  lone date cell onto the row above when that row's date in the same column
  failed to parse, then re-read it. Hazard: a stray date joining the wrong row.
- (d) Past Due is classed `other`, which is right; it only costs 0.1 of every
  row's confidence. Low priority.

### What the owner sees today, in one line each

- Thousands: nothing populates, until "Accept as read" fills $60 rents.
- Property-manager report: held, or (if accepted) rents of a fraction of the truth.
- OM whose summary has no labelled lines: the rent roll fills, the figure boxes do not.
- OM that states in-place rent: the box does not exist, and the cross-check
  against the roll never runs.

I cannot see the owner's OM. To tell which one they hit, run
`node tests/tools/rr-local.mjs` on it (in `private/`, counts only: rows read,
checks failed, rows held, scale words seen). If rows are read and applied but a
box is empty, it is F3/F4; if rows are held, it is F2 or F5.

### Golden outputs

F3 and F4 touch only `dealui.js`, and both golden harnesses read `om.js`
directly (`golden.mjs:107-114`, `analyze-cases.js:46-49`), so they cannot move.
F2, F5 and F6 change `omroll.js`, which feeds both. Proof, per PR: run
`tests/analyze-golden.test.js` and `golden.mjs --diff` before and after, and add
a test that every page in `tests/e2e/files/pages.json` and `tests/rr-fixtures.js`
gives deep-equal `readOm` rows before and after, with mutation checks on each new
pattern. Silent money hazards to test for: a statement's "($ in thousands)"
caption on the same page scaling rents 1,000x (scope the scale to the table);
a combined "Rent & Charges" column; rows already held from an old read stay at
what they were (no migration re-reads them).

## (c) Feature: a rent roll PDF as its own document

### What exists, and why the OM reader is not enough

- A native rent roll is `deal.rr.leases`. `project()` in `lease.js` and
  `rentRollSummary` read only that, so **anything that ends as leases drives the
  projections exactly as a typed or spreadsheet roll does.** One conversion
  from rows to leases already exists (`rowsToLeases` in `rentrollui.js`, the
  rent in force as one documented period; `fromOmRows` in `lease.js` for OM
  rows). The new path must end in one of them, so there is no new math.
- Excel/CSV import (`mapImport`) shows a column-mapping sheet, then imports on
  one tap. It has no tie-out against printed totals, no Data QC panel and no
  page/cell source.
- The OM reader (`omroll.js`) has Data QC, tie-outs, page/line/cell sources and
  a hold-back on a failed check, but it is built for an OM's typeset table.
  An invented property-manager style report (monthly rent, monthly charges,
  deposit, past due, unit-count subtotals) run through it was misread (see the
  table in (b), F5): wrong money, so it cannot be reused as is.

### The flow

1. **Where.** Rent roll card menu -> "Import from PDF…" (beside "Import from
   Excel or CSV…"), and the same file picked on the deal screen. No feature is
   removed; Excel/CSV import is unchanged.
2. **Detect the document type from its content**, not the name: title words
   ("Rent roll", "Tenant ledger", "Tenancy schedule") plus a header row with a
   suite/unit column and at least one rent column, plus an "As of" date. A
   statement (T-12) or an OM is recognised and the owner is told which screen
   takes it. Unsure: ask, do not guess.
3. **Read by position, text PDFs only.** `pdfPages` (pdf.js, already
   vendored) with layouts. Columns from the header cells (the `omroll.js`
   scoring, extended with a property-manager profile: rent vs monthly charges
   vs deposit vs past due, subtotal rows by their unit-count label, a wrapped
   lease-to year). **A page with no text is listed, with OCR only on request**
   (`ocr.js`, as now).
4. **Preview with Data QC, nothing written.** A sheet shows every unit as read
   (unit, tenant, SF, rent as printed and as monthly and annual, lease dates,
   deposit, past due) with the page and line, and the checks (`dataqc.js`):
   unit count, SF, rent, charges, deposit and past due against the printed
   subtotal and total; rent per SF a year against a plausible range; monthly vs
   annual; duplicates; forward-dated "As of"; a blank rent stays blank. A fail
   holds the import until the owner resolves or accepts it, as for an OM.
5. **Approve.** One button: "Use this rent roll". Replace or add (default
   replace when empty, as `mapImport` does), a snapshot first, and Undo, as the
   spreadsheet import has. Nothing populates before the tap.
6. **Populates the rent roll and the existing projections** through the one
   conversion above. Each lease keeps its source: file name, page, line and cell
   text (the fields `lease.source` already carries for OMs: `kind`, `page`,
   `line`).
7. **If an OM rent roll is also loaded, reconcile** instead of replacing:
   match units by suite (then tenant, then SF), and list line by line: only in
   the OM, only in the new roll, rent differs, SF differs, dates differ, status
   differs, with both values and both sources. The owner picks per line or
   keeps both rolls (the second is a named alternative, not applied). Neither is
   silently replaced. Differences use whole-cent comparison via the engine's
   `toCents`; no new rounding.

### New or changed parts

| Part | Size | Notes |
|---|---|---|
| `app/rrdoc.js`: detect, the property-manager profile, rows | M | pure; reuses `omroll.js` column scoring and `pageLines`; no DOM |
| Preview sheet and import button in `rentrollui.js` | M | reuses `dataqcui.js` and the snapshot/Undo of `mapImport` |
| Compare two rolls (`reconcile.js`) | M | new function, same module as the existing OM cross-checks |

### Approval gates this raises

- **Data format (additive):** `lease.source` gains a `kind: 'pdf'` and the file
  name; `rrQc` could keep a hash of the file. Old deals and backups are
  untouched and the new fields are ignored by older code. This needs the
  owner's approval before it is built.
- **Alternative rolls:** keeping a second, unapplied roll on the deal is new
  stored data. Option to avoid it: compare only, then the owner chooses and the
  other is dropped (recorded in History, so Undo restores it). Recommended.
- No new library. A scanned page uses the OCR already vendored, on request.

## (d) Test plan and PR sizes

Order: bug first, then the feature. The `impact-flow` axe bug (queued by the
owner) goes after the rent roll fixes.

| # | PR | Size | Fails on old code by |
|---|---|---|---|
| 1a | Bug F2: scale in the OM rent roll (thousands) | S | invented PDFs with a thousands header |
| 1b | Bug F3 and F4: the stated in-place rent reaches the cross-check; the roll offers its SF and occupancy as "use this?" taps | S-M | invented OM with stated rent and no summary lines |
| 1c | Bug F6: a header whose wrapped line holds only a rent label | S | the top-aligned two-line header |
| 2 | Property-manager profile in the rent roll reader (F5 a-c) | M | the invented manager report (pm layout) |
| 3 | Upload a rent roll PDF: detect, preview, Data QC, approve | M | new flow; nothing to compare with the old app |
| 4 | Reconcile two rolls line by line | M | an OM roll + a PDF roll with known differences |
| 5 | Adopted checks from the support code, each its own small PR | S each | per check |
| 6 | `impact-flow` axe contrast (owner-queued) | S | the flow itself, intermittent on clean main |

For each PR: tests that fail on `git archive <old>` served with `BASE=`; the
mutation checks (undo each part, its own check fails); invented fixtures only
(the reader fixtures are built in `tests/rr-fixtures.js`); a browser flow in
Chromium and at iPhone size, with character-by-character typing for any new
input; axe; the 150 ms edit budget; `npm run check:quick` before every push and
`check:full` before opening; golden before/after (the 618 saved results and the
646 figures) with a stop-and-show if any figure moves; changelog as a fragment;
version bump and `docs/NOW.md` in the last commit only; designer for the parsing
diagnosis and one final diff review per parsing/money PR.

## (e) The support code and the underwriting feature

The owner added that the zip can be used to create the underwriting feature.
The code is a complete worked design of one, not something to run:

- **Staging then commit.** Imported values land in staging with a source; a
  review list (severity Critical/Warning/Info, proposal, reason, Approve /
  Modify / Reject / Defer) gates the model. A mode switch: **Draft** (proposals
  flow through, flagged) or **Strict** (nothing commits until approved).
- **NOI normalisation** with four methods per line (annualise x12/N, run-rate
  median x12, as reported, exclude), N detected from the active months, gaps
  and one-time spikes flagged, nine categories, "unclassified" held out of NOI
  and never discarded.
- **Rent engine and WALT** with three weightings; expiry handling (no renewal
  vs renew at expiring rent); past due as a note, never deducted.
- **A 59-check suite**, provenance per value, and **48 tests** (all PASS, on the
  owner's real documents; the workbook, not this app).

Fit with the app: most of it already exists in other words (`t12.js`'s 21
categories and thresholds, "NOI three ways", the Review Queue, `rentRollSummary`
WALT with a weighting, Data QC). The parts that are new are Draft/Strict as a
setting, the normalisation method per line, and spike/gap detection. That is a
**Phase 2 underwriting design with its own proposal**, a Prior-art table and the
owner's approval first; it is not part of the PRs above. I would write it after
PR 4, using the check list and test cases here.

## (f) Build rules, confirmed

- Reuse the shared engine and the existing projection code. No new rounding or
  money math: `toCents`/`toRate` from `app/engine/money.js` only. **Confirmed.**
- Nothing populates silently: a preview, then the owner approves. No feature is
  removed. **Confirmed.**
- Golden outputs unchanged (618 saved results, 646 figures); if a figure would
  change I stop and show before and after. **Confirmed.**
- Tests fail on the old code, with mutation checks, invented fixtures only;
  real files stay in `private/` (reported as structure-only counts); a browser
  flow per fix at iPhone size. **Confirmed.**
- Dependencies need approval: none proposed. **Confirmed.**
- Sync main first, `check:quick` before every push, `check:full` before opening
  a PR, changelog as a fragment. **Confirmed.**
- One PR per fix; after each I say what to merge and what to check on the
  phone. **Confirmed.**

## (g) Decisions needed from the owner

1. **Approve the order** in (d): 1a, 1b, 1c, then 2, 3, 4, then the adopted
   checks, then `impact-flow`. Say if you want 3 (the PDF upload) before 2.
2. **F3:** pass the stated rent to the cross-check only (no new box, no
   data-format change; recommended), or add an "In-place rent (stated)" box
   (data-format change).
3. **F4:** offer the rent roll's SF and occupancy as a tap ("use the rent
   roll's 6,500 SF?"), never automatic. Yes, or no fill at all?
4. **Which boxes do you mean?** If you can run `rr-local.mjs` on the OM that
   failed (counts only), I can say which finding you hit. Otherwise I fix all of
   F2-F6 in order.
5. **Rent roll PDF (c):** additive data-format fields (`lease.source` gains
   `kind: 'pdf'` and the file name; optional file hash in `rrQc`). Approve?
6. **Second roll:** compare then choose, the other dropped and recoverable by
   Undo (recommended), or keep a named alternative roll on the deal (new stored
   data)?
7. **Underwriting (e):** write it as its own proposal after PR 4?
8. **Dependabot** is already approved and `impact-flow` is queued after the
   rent roll fixes (your message of 2026-10-17).

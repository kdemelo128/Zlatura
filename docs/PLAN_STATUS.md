# Plan status

Where Zlatura stands against the master plan,
[`ZLATURA_MASTER_PROMPT_v2.md`](../ZLATURA_MASTER_PROMPT_v2.md) in the
repository root. Every phase of its Part 22 and every deliverable in Parts 0–24
is listed below, numbered by its section, with the owner's later instructions
first. The evidence for each feature, in more detail, is in
`docs/acceptance-matrix.md`. This file is updated with every PR.

**Key**, and how it maps to the master plan's Part 23 statuses:

| Mark | Here | Part 23 status |
|---|---|---|
| `[x]` | done | Implemented and verified; or Tested with synthetic fixtures only, which is then said ("synthetic only") |
| `[~]` | partial | Partially implemented (what is missing is said); or Implemented, not fully tested (the gap is said) |
| `[>]` | in progress | Being worked on now |
| `[ ]` | not started | Not implemented |
| `[!]` | blocked | Blocked (what is missing is said) |

"Synthetic only" means tested only with the invented files the tests make. No
real brokerage file, live AI or speech service, Microsoft Excel, Safari,
Firefox or screen reader has been used for any item (see the end of this file).

Last updated: 4.7.25; roll comparison (PR opening); rent roll PDF upload (PR opening), `impact-flow` fix (#44); 1b + 1c merged (#43) (2026-10-17).

## Now

- **Current step:** rent roll PDF upload (4.7.23, PR opening) and the `impact-flow` fix (#44); 1a, 1b + 1c, the gate fix and the proposal are merged (#41, #43, #42, #40). Then the profile, the comparison, then F6/F7. F2 (4.7.15, merged #33): every file read as text goes
  through `app/textfile.js`, so a Windows-1252 CSV keeps its accents and
  curly quotes and the app says how it read the file. F1 (4.7.14, one
  rounding rule) is merged (#32), and so are changelog fragments (4.7.13,
  #31), and so are the
  4.7.12 proposals (#30, approved), the CI subset (#29), the partial-year
  T-12 fix (#28), project settings (#27), the efficiency setup (#26), the
  lost-edit fix (#25) and item 1 (#23, #24). Gate 2 passed: both Part 2
  proposals approved by the owner 2026-10-15. Bugs C, A and B are merged
  (4.7.3–4.7.5).
- **Lost edit (since 4.7.3), fixed in 4.7.7:** `app/focuskeep.js` held the
  whole change handler, the save included, until Tab's focus landed, so
  leaving the deal or closing the app in that beat lost the edit. Now the
  save is immediate and only the redraw waits (deal figures, What-if
  targets, lease editor); `lostedit-flow` covers each.
- **Build order (owner, 2026-10-15; revised 2026-10-15 with the approved
  competitive-gap and production-readiness decisions), one PR at a time,
  `check:quick` before every push, `check:full` before opening each PR,
  stopping for the owner's merge after each:**
  1. [x] Browser flows exit with an error when a check fails, proved by a
     flow made to fail on purpose (4.7.6).
  2. [x] Partial-year T-12 fix (4.7.10, #28): "Use the T-12's figures"
     never saves a T-3, T-6 or T-9 as the annual NOI; partial shown as
     partial; annualizing only with the owner's explicit confirmation.
  3. [x] The CI browser subset (typing, lost edit, deal persistence, deal
     export), timed, with the cost if the repo goes private (4.7.11, #29).
  4. [x] Changelog fragments, folded by `npm run bump`; `sync-main` resolves
     the conflicts that recur (4.7.13, #31).
  5. [x] F1, money rounding: the before/after table shown and approved
     (2026-10-15); `t12.js`, `omstatement.js`, `om.js` and `template.js` use
     `toCents`; the T-12 months-vs-year flag (4.7.14, #32).
  6. [x] F2 (old CSVs, Windows-1252; 4.7.15, merged #33), F5 (CI audit, pinned actions), F6/F7
     (hostile-text pack, timezones) and F10 (stolen-laptop and
     disaster-recovery plans), one PR each.
  7. T-12 multi-format import (`docs/proposals/t12-multiformat.md`). `.xls`
     only if SheetJS can be fetched and its license is Apache-2.0 or MIT,
     then pinned and vendored with a `THIRD_PARTY.md` entry; otherwise
     skipped, and the owner told.
  8. F3 (the Back button), F4 (strict CSP), F8 ("Recently deleted", 30
     days, approved) and F9 (an optional backup password with a clear
     lost-password warning, approved), one PR each.
  9. OM red-flag check, then the pro forma vs T-12 bridge as an interactive
     waterfall.
  10. "Export everything": one zip of the backup, workbooks, CSVs, JSON, the
     original files and a published JSON Schema (approved;
     `competitive-gap.md` (b)).
  11. UI revamp in phases behind the "New look" toggle: foundation and theme;
     Home and navigation, with the first-run path to a finished deal brief
     on a phone; customization; live charts; motion; screen clean-ups, then
     Guided Mode; the Feature map test. F11 (split `dealui.js`) happens
     inside it.
  12. The rest of Phase 2, with 7.3 pricing early. Then, ahead of their
     phases (approved reorder): the confidential tag (19.2) before Phase 5's
     outreach and Phase 6's live AI; the 17.3 Bid Leveler with the deal fee
     record (5.1) and the fee CSV, before Phase 3; 17.1 companies and 17.2
     buyer match before the rest of Phase 5; listing copy for marketplaces
     (13.1) with Part 13.
  13. Phases 3 to 8. F12 (AI server limits) before any AI server
     deployment. Phase 7 prerequisites: an independent code review, the
     accounts, domain and repo in the company's name, and section 4 of
     `production-readiness.md`.
- **Changes to saved results or financial meaning** inside the approved
  proposals go in their own small PR, with the before/after golden-output
  difference shown before the owner merges.
- **Kept as is (owner, 2026-10-15):** the "What doesn't add up" occupancy
  check stays on the rent roll's own SF so saved results stay identical;
  tracked for the Phase 2 rent roll work.
- **Usage rules (2026-10-14):** one agent at a time, never parallel Opus;
  routine work in the main session; read big files by section or grep; run
  only the affected tests while developing and the full suites once before
  each PR; no polling check-ins; short reports; on a usage limit, write a
  short state note here first.
- **Questions for the owner:** where the master plan and the later
  instructions differ, at the end of this file.

## Counts

| Group | Done | Partial | In progress | Not started | Blocked | Items |
|---|---|---|---|---|---|---|
| The owner's directive | 9 | 1 | 0 | 8 | 0 | 18 |
| Rules and process (Parts 0, 1.3, 22, 23, 24) | 19 | 7 | 1 | 0 | 0 | 27 |
| The 15 pillars (Part 2) | 1 | 8 | 0 | 6 | 0 | 15 |
| Phase 0: audit and baseline | 9 | 0 | 0 | 0 | 0 | 9 |
| Phase 1: foundations | 18 | 21 | 0 | 5 | 0 | 44 |
| Phase 2: underwriting and documents | 16 | 46 | 0 | 45 | 0 | 107 |
| Phase 3: firm templates | 6 | 5 | 0 | 4 | 1 | 16 |
| Phase 4: comps and capital markets | 8 | 12 | 0 | 18 | 0 | 38 |
| Phase 5: marketing, diligence, buyers | 6 | 7 | 0 | 31 | 0 | 44 |
| Phase 6: live AI and Field Mode | 8 | 8 | 0 | 9 | 1 | 26 |
| Phase 7: workspaces and integrations | 1 | 4 | 0 | 9 | 0 | 14 |
| Phase 8: final audit | 1 | 2 | 0 | 7 | 1 | 11 |
| Real-world validation | 0 | 0 | 0 | 0 | 5 | 5 |
| **All** | **102** | **122** | **1** | **141** | **8** | **374** |

The pillars are counted on their own as well as through the items of the
phases that build them.

## The owner's directive (later instructions)

These came after the master plan and are worked first.

### Setup
- [x] Model routing: the designer (Opus) and builder (Sonnet) agents, and
  `CLAUDE.md` (4.7.1)
- [x] This file (4.7.1); reconciled against the master plan (4.7.2)
- [x] The master plan in the repository root, as the owner pasted it (4.7.2)
- [x] Efficiency setup (4.7.8): `docs/NOW.md`, a shorter `CLAUDE.md` with
  `docs/working-rules.md`, on-demand skills, read-deny rules,
  `npm run check:quick`, `check:full` and `bump`; merged (#26)
- [x] Project settings (4.7.9): main session on Sonnet at medium effort; 32
  unused plugins off for this project; merged (#27)
- [x] CI browser subset (4.7.11): typing-flow, lostedit-flow,
  deal-persistence and deal-export on every push, Chromium at iPhone size,
  without the LibreOffice recalc; merged (#29)
- [x] Branch rules and `npm run sync-main` (4.7.11); `check:full` ends by
  failing if the branch is behind main or has conflict markers; merged (#29)
- [x] Reuse before you build (4.7.12): the rule, `THIRD_PARTY.md` (was
  `VENDOR.md`) with license texts and checksums; merged (#30)
- [x] Prior-art summary (`docs/proposals/prior-art.md`): approved
  2026-10-15. No new libraries now; `.xls` only with an Apache-2.0 or MIT
  SheetJS that can be fetched, else skipped
- [x] Competitive gap (`docs/proposals/competitive-gap.md`): approved
  2026-10-15, with the reorder and the four additions (fee record, fee CSV,
  listing copy, "Export everything"); in the build order above
- [x] Production readiness (`docs/proposals/production-readiness.md`):
  approved 2026-10-15, in the order in the build order above
- [x] Changelog fragments (4.7.13): `docs/changelog/unreleased/`, folded by
  `npm run bump`; `sync-main` resolves `CHANGELOG.md` and version-line
  conflicts; merged (#31)
- [~] WebKit (iPhone Safari's engine) runs: `PW_BROWSER=webkit` added (4.7.1).
  **Blocked here:** WebKit isn't installed in this environment, so runs here
  are Chromium at iPhone size.

### Part 1: three bugs
- [x] Bug C: date inputs lose what is typed at the year. Built in 4.7.3
  (`app/dateinput.js`, `app/focuskeep.js`, `tests/dateinput.test.js`,
  `tests/e2e/typing-flow.mjs`); PR open, waiting for the owner's merge.
- [x] Bug A: the rent roll from an OM doesn't scan correctly. Built in 4.7.4
  (`app/omroll.js` reads it by position; Data QC in `app/dataqc.js`,
  `dataqcui.js`, `reconcile.js`; Review items `rrcheck`; OCR on request in
  `app/ocr.js` with tesseract.js under `vendor/ocr/`; migration step
  `rr-qc`; `tests/tools/rr-local.mjs` for real rent rolls). Synthetic
  fixtures only; PR pending.
- [x] Bug B: income and expenses read from OM statements are often wrong.
  Built in 4.7.5 (`app/omstatement.js` reads each statement as a table by
  position: column kinds, spanning headings, scale, per SF and per unit
  columns kept out of totals; `t12.js statementChecks` does the arithmetic;
  a failed check holds NOI, EGI and opex back in `deal.omRead`, a Data QC
  panel and Review items `omcheck` with one-click fixes, undoable; each
  figure keeps its row, column, cell, scale and check; design
  `docs/proposals/om-statement.md`). Synthetic fixtures only; PR pending.

### Part 2: design proposals
These stop for approval.
- [x] 2a. T-12 multi-format import (`docs/proposals/t12-multiformat.md`):
  written 2026-10-15 (PR #21, merged); all 22 decisions approved by the
  owner 2026-10-15, as recommended. To build after the two fixes below.
- [x] 2b. UI revamp (`docs/proposals/ui-revamp.md`, wireframes in
  `docs/proposals/ui/`): written 2026-10-15 (PR #22); all 18 decisions in
  section 11 approved by the owner 2026-10-15, as recommended. Built in
  phases behind the "New look" toggle.

### UI revamp
Behind the "New look" toggle, after 2b.
- [ ] Foundation and theme
- [ ] Home and navigation
- [ ] Customization (widgets, layouts, presets)
- [ ] Live charts
- [ ] Motion and micro-interactions
- [ ] Clean-up of existing screens
- [ ] Feature map, and a test that no feature is lost

### Other standing instructions
- [ ] Data QC panel (not designed yet)
- [x] Character-by-character typing tests for every input type:
  `typing-flow` (4.7.3) types every date field and the number, percent and
  currency fields key by key, and checks Tab after a redraw. New input types
  must be added to it.

### Production readiness (owner's checklist, 2026-10-15)
Approved by the owner 2026-10-15, in `docs/proposals/production-readiness.md`. The owner's
checklist of about 150 items is mapped to Zlatura in 104 rows:
- **A** (61): applies now to the local-first app;
- **A/B** (8): applies now, and again once accounts arrive;
- **B** (25): designed in before accounts, sync and hosting (Phase 7);
- **C** (4): only if Zlatura bills customers;
- **D** (6): doesn't apply, with the reason.
Each row has its status and a verdict. The fix-now items, each its own PR,
in the order of the build order above:
- [x] F1 money: one rounding rule. `t12.js`, `omstatement.js`, `om.js` and
  `template.js` use the engine's `toCents`; a T-12 line whose shown months
  don't add up to its year within a cent is flagged (4.7.14, #32)
- [x] F2 old CSVs: every text file read through `app/textfile.js`; a
  Windows-1252 fallback, with a note saying how each file was read (4.7.15,
  PR open)
- [ ] F3 the phone's Back button returns to the last screen
- [ ] F4 a strict Content-Security-Policy, with `script-src`
- [x] F5 dependency audit in CI, and actions pinned to commit SHAs (4.7.17, merged #35; the owner turns on GitHub security alerts)
- [ ] F6 hostile-text pack (apostrophes, emoji, right-to-left, formulas);
  F7 tests run in other timezones
- [ ] F8 "Recently deleted" for 30 days (approved)
- [ ] F9 an optional password on backups, with a clear lost-password
  warning (approved)
- [ ] F10 stolen-laptop and disaster-recovery plans, one page each
- [ ] F11 split `dealui.js` (2,701 lines), inside the UI revamp
- [ ] F12 AI server limits before any deployment: spend cap, a token per
  device, prompt-injection tests
- [ ] Phase 7 prerequisites: an independent code review; the accounts,
  domain and repo in the company's name (owner, 2026-10-15; no action now)
- [ ] Before Phase 7, from day one: tenant isolation, object-level checks,
  sessions, rate limits, audit of views, reversible migrations, tested
  restore (section 4 of the proposal)

## Rules and process (every phase)

### Part 0: operating rules
These are in `CLAUDE.md` and followed on every PR.
- [x] 0.1 Continue, don't rebuild: no feature removed; golden outputs
  identical (`tests/analyze-golden.test.js`, `tests/tools/golden.mjs`)
- [x] 0.2 Audit before building (`docs/baseline-report.md`, Phase 0)
- [x] 0.3 Small increments: code, tests, full regression, report, commit.
  See the first question at the end about which branch.
- [x] 0.4 No merge, force-push, branch reset, data deletion, production
  change or deploy without authorization (`CLAUDE.md`, 4.7.2)
- [x] 0.5 Accuracy over feature count; a smaller honest version, with the gap
  in the acceptance matrix
- [x] 0.6 Decide vs ask (`CLAUDE.md`, 4.7.2)
- [x] 0.7 Honest reporting in Part 23's vocabulary (`CLAUDE.md`, 4.7.2)
- [x] 0.8 Renamed to Zlatura, with a migration (4.0.0; see Phase 1)

### Part 1.3: core principles
- [~] 1. The firm's workflow wins: firm templates are filled from the deal
  (Phase 3); there is no native model by property type yet (7.1)
- [~] 2. One deal model, many views: the OM, rent roll, T-12, tools and
  templates read the same deal (`types/zlatura.d.ts`, `app/impact.js`); comps
  are kept apart from deals
- [~] 3. Every number has a receipt: source tags and the dependency map (3.3,
  7.7); no sheet-and-cell receipt for every figure
- [~] 4. Facts, assumptions and forecasts kept apart: source tags; scenario
  figures kept apart; the rent roll's year 1 labelled a projection (4.7.0)
- [~] 5. Nothing silently changes: AI readings are applied only when ticked,
  and "Use the T-12's figures" is an explicit step; re-reading an OM still
  replaces its figures (6.2.6)
- [~] 6. Honest uncertainty: missing is `null`, never 0; there is no
  `confirmed_zero` (3.1)
- [x] 7. Calm, premium, fast: the design system (Part 20) and performance
  budgets (3.7). The UI revamp will rework it.

### Part 22: per-phase deliverable
- [x] A report at each phase's end (functionality, files, tests and results,
  known bugs, formulas validated, compatibility, security and storage,
  branch and commit, deployment, next work). Phase 0: baseline report.
  Phase 1: CHANGELOG 4.0.0 to 4.6.0 and the checkpoint reports in
  `docs/proposals/`.

### Part 23: acceptance matrix and truthfulness
- [x] `docs/acceptance-matrix.md` covers every feature in the master plan
  (rows added in 4.7.2)
- [x] One Part 23 status per feature
- [x] Full regression on the final code of each PR (`CLAUDE.md`)
- [x] No success claimed from mocks or synthetic files alone ("synthetic
  only" here; the matrix's header)
- [~] Limitations reported with a concrete validation plan: limitations are
  listed (see the end of this file); no written plan yet for live AI, Excel,
  Safari or real files
- [x] Not called production-ready
- [x] Every report ends with what was verified, what was not, what was
  assumed, and what is needed from the owner (`CLAUDE.md`, 4.7.2)

### Part 24: starting instructions
- [x] 1. Audit the repository and the 3.2.0 work (`docs/baseline-report.md`
  §1: 3.3.0 on `main` held all of 3.2.0)
- [x] 2. Baseline report and architecture plan; wait for the go-ahead
  (`docs/architecture/proposal.md`, decisions D-A to D-F)
- [>] 3. Proceed through the phases, keeping what works (now: Phase 2, after
  the owner's directive above)
- [x] 4. Further ideas, with rationale and effort, not built until approved
  (`docs/architecture/proposal.md` §6: seven ideas; the T-12 cleaner was
  approved and built in 4.7.0)

## The 15 pillars (Part 2)

Each is built through the items of the phases named.

- [x] 1. Deal Ledger and Impact Graph (3.3; 4.4.0)
- [~] 2. Provenance everywhere: source tags per deal figure; no sheet-and-cell
  receipt (3.3, 7.7)
- [~] 3. Mapping Studio: library, inspection, suggestions, dry run, safe fill;
  no drift detection or reconciliation in the product (Phase 3)
- [~] 4. OM Forensics: some of the Part 6.3 checks (Phase 2)
- [~] 5. Time Machine: snapshots, compare and restore (4.3.0); no "what did we
  tell the client on this date?"
- [~] 6. Scenario Studio: named What if scenarios and two-way grids; no
  branching or tornado (7.8)
- [ ] 7. Bid Leveler (17.3)
- [ ] 8. Buyer Match and Outreach Engine (17.2)
- [ ] 9. Data Room Intelligence (12.1, 13.6, 18.5)
- [~] 10. Ask the Deal: over the deal's facts, cited by id, stand-in model
  only; not over documents (6.5)
- [~] 11. Field Mode: offline app, photos, voice notes, checklists; no area
  labels, geotags or observation links (Part 14)
- [ ] 12. Pre-Flight Gates (13.5)
- [ ] 13. Live market inputs, properly sourced (15.4)
- [~] 14. Command Center UX: ⌘K, `?`, Review Queue, undo/redo, Today; no
  saved views or daily briefing (Part 4, 5.1)
- [ ] 15. Guided Mode (20.5)

## Phase 0: audit and baseline

All in `docs/baseline-report.md`, `docs/architecture/proposal.md` and
`docs/acceptance-matrix.md` (CHANGELOG "Zlatura Phase 0").
- [x] Repository, branch and commit audit; working tree (§1)
- [x] Real line counts and module boundaries (§2)
- [x] Test baseline (§3)
- [x] Dependency and security scan (§3 `npm audit`, §8)
- [x] Feature inventory against the acceptance matrix (§4)
- [x] Calculation audit, with the defects D1 to D9 (§5; D1 fixed in Phase 0)
- [x] 3.5 Current storage layer and its limits documented (§6)
- [x] Risk register (§9)
- [x] Architecture review and proposed changes, with the migration plan
  (`docs/architecture/proposal.md`)

## Phase 1: foundations

### Part 1.1: the name
- [x] Renamed in the UI, metadata, docs, exports and file names (4.0.0;
  `rename-flow`, `shell-flow`). Repository name and Pages URL kept, as decided
  (D-F).
- [x] One-time migration of storage keys, IndexedDB and cache; old backups
  restore, with a test (4.0.0; `rename.test.js`,
  `tests/fixtures/backup-comp-loader-3.3.0.json`, `rename-flow`). Chromium
  only.
- [~] "About the name": Settings → About and the README; no onboarding
  screen
- [x] Tagline options; the owner's choice is used (4.0.0)
- [~] Logo (light, dark), favicon and app icons (`docs/brand/`, `icons/`):
  not checked on a real home screen

### Part 3: architecture foundations
- [~] 3.1 One typed Deal aggregate: `types/zlatura.d.ts` types the deal as it
  is (4.4.1). Parties, Documents, Diligence and Marketing don't exist yet, and
  the operating statements are only the T-12.
- [x] 3.1 Branded unit types; mixing units is a type-check error (4.4.1;
  `types.test.js`, `tests/types/mistakes.js`: 24 mix-ups refused)
- [ ] 3.1 Area basis (GBA, RSF, USF) as distinct measures: building SF is one
  figure
- [~] 3.1 Missing values explicit: missing is `null`, never 0, in the
  analysis; no `unknown`, `not_applicable` or `confirmed_zero`
- [x] 3.1 Integer-cent money: stored totals rounded to whole cents once,
  each change logged (4.1.0; `money.test.js`, `engine-flow`); derived figures
  in floating point, rounded at display. See the questions at the end.
- [~] 3.2 Pure engine, one formula per quantity: `app/engine/`, every deal
  figure registered in `engine/figures.js` (4.1.0, 4.3.2; `engine.test.js`,
  `analyze-golden.test.js`). The tools' math (`calc.js`, `tools.js`) and the
  lease engine are not registered.
- [~] 3.2 Results carry inputs, formula id, conventions and warnings: each
  figure has an id, label, unit and inputs; the results are plain numbers
- [~] 3.2 Conventions declared and configurable: `engine/conventions.js`,
  Settings; WALT weighting and month-to-month are settable on the device; the
  rest are fixed; not per deal
- [x] 3.3 Dependency graph with "This change affects…" before a change is
  kept: figures, checks, scenarios, exports, template cells and document
  sections (4.4.0; `impact.js`, `impactui.js`, `impact.test.js`,
  `impact-files.test.js`, `impact-flow`)
- [x] 3.3 Circular dependencies refused, naming the loop (`engine/graph.js`;
  `impact.test.js` "a loop is refused, and named")
- [~] 3.3 "Explain this number": the overview's tiles and the dependency
  sheet; not every figure on every screen, and no formula in words
- [~] 3.4 Event-sourced history: each deal keeps every change with old and new
  values, saved with the deal in one transaction (4.3.0; `history.js`,
  `history.test.js`); it is a log beside the saved deal, not the store the
  deal is rebuilt from
- [x] 3.4 Undo/redo, History and snapshots from that log (4.3.0;
  `history-flow`, `snapshot-flow`)
- [ ] 3.4 "What changed since I last opened this deal"
- [x] 3.5 Versioned schema, forward migrations, a migration test suite on
  real old backups (4.5.0; `app/migrate.js`, `migrate.test.js`,
  `migrate-flow`)
- [x] 3.5 Database version 2, backups with history, storage limits (4.3.1;
  `upgrade-flow`, `backup.test.js`, `limits-flow`)
- [ ] 3.6 Plugin interfaces for parsers, calculators, template adapters,
  exports, data providers and integrations. The tools declared as data
  (`toolsdefs.js`) are the nearest pattern. *Part 22 doesn't name 3.6; placed
  here with the architecture.*
- [~] 3.7 A 500-line rent roll opens in under 1 second: 189 ms (4.2.0,
  `perf-flow`, headless Chromium in this container, 500 generated leases);
  not on a real laptop or phone
- [~] 3.7 Recalculation under 150 ms: an edit shows its totals in 66 ms; with
  the CPU slowed 4×, 326 ms (not met)
- [~] 3.7 A 40-page PDF: "Page k of n" progress, pdf.js in a worker, the
  projection in a worker (4.2.0); OM analysis, exports and template fills
  still on the main thread
- [~] 3.7 Large files: type and size checks with plain messages; no streaming
  or chunked reading
- [x] 3.7 Measured numbers documented (CHANGELOG 4.2.0; the matrix)

### Part 4: structure and navigation (the shell)
- [~] Twelve primary workspaces: five (Home, Deals, Comps, Tools, Settings),
  plus Review when something waits; a sidebar on the desktop and a tab bar on
  the phone. The rest stay out of the navigation until they work, as Part 4
  says.
- [x] Command palette, ⌘K or Ctrl K: deals, contacts, tools, screens and
  actions (`command.js`, `shell-flow`); documents, notes and comps are not
  indexed
- [~] Global search: deals, contacts and tools only
- [~] Deal switcher, recently opened, breadcrumbs: the deals list and
  "Continue working"; no breadcrumbs
- [x] Review Queue (4.7.0; `review.js`, `reviewui.js`, `t12-noi.test.js`,
  `t12-flow`): T-12 lines and checks, AI readings, low-confidence template
  cells. Low-confidence OM readings are left out (approved); conflicts and
  stale items are not in it yet.
- [ ] Status bar (save, sync, scenario, template, confidence)
- [x] Undo/redo for every deal edit (4.3.0)
- [x] Keyboard first, with the `?` sheet (4.6.0; `shortcuts.test.js`,
  `shell-flow`)
- [x] Light, dark and system themes (`shell-flow`, `a11y-flow`)
- [~] Responsive: 320–430, 834 and 1440 px in Chromium; no real devices

### Part 20.1–20.2: design system
*Part 22 puts "design system and navigation shell" in Phase 1; 20.3–20.6 are
under Phase 8.*
- [x] 20.1 Calm direction, one muted-gold accent, semantic status colours;
  motion off when the system asks for reduced motion (`app/styles.css`)
- [x] 20.2 Design tokens (`app/styles.css`)
- [~] 20.2 Components with documented states: the components exist; their
  states are not documented
- [ ] 20.2 Living style guide route
- [~] 20.2 Dense tables: sticky headers, pinned first column, keyboard and
  inline editing in the rent roll grid; column resizing there only
- [~] 20.2 Charts with accessible palettes and direct labels: the comps
  charts (`glance.js`) and the Excel charts (`charts.js`); no other in-app
  charts yet

### Part 21.5: convention registry
*Built with the engine in Phase 1.*
- [~] A visible registry: Settings → Calculation conventions lists them; WALT
  basis and month-to-month are configurable, the rest fixed

## Phase 2: underwriting and documents

*Part 22 names "OM ingestion review flow and OM Forensics". Part 6.1, 6.4,
6.6 and 6.8 are placed here too; 6.5 and 6.7 are in Phase 6. Part 21 is placed
here, where most of the money logic is built, and is checked on every PR.*

### Part 6: the deal workspace and the OM
- [~] 6.1 Workspace contents: the OM and its figures, property, rent roll,
  T-12, underwriting, What if, site visit, AI assistant, brief and history
  are in the deal; no APN/parcel or ownership fields, documents, diligence or
  communications
- [~] 6.2.1 File type and structure: text and scanned PDFs told apart, and
  since 4.7.4 each page with no text layer is flagged (a scanned OM asks for
  the figures to be typed); tables other than the rent roll and images not
  detected
- [~] 6.2.2 Text, tables and images with page references: text with page and
  line; the rent roll table read by position, each cell with its page, line
  and column (4.7.4, `omroll.js`); operating statements read by position,
  each figure with its row, column and cell (4.7.5, `omstatement.js`); a
  scanned rent roll page read by OCR on
  request, labelled OCR (4.7.4, `ocr.js`); no images
- [~] 6.2.3 Each proposed field with value, unit, page, quote, confidence and
  validation status: page, line and confidence; units implicit per field; on
  the AI path every quote is checked against the PDF text
  (`reconcile.js`). Statement figures also keep their row, column, cell,
  scale and check, with confidence in words (4.7.5). Synthetic only
  (`om.test.js`, `omstatement.test.js`).
- [x] 6.2.4 Cross-field validators: price/SF, NOI ÷ price against the cap,
  rent roll against the stated figures (`engine/figures.js`, `deal.test.js`).
  Synthetic only.
- [~] 6.2.4 Unit, sign, date and magnitude validators: a few (NOI above
  gross, EGI well above potential rent, zero or negative NOI); for operating
  statements (4.7.5): scale, per SF and per unit columns, a range check per
  cell, lines against subtotals, EGI less expenses against NOI, taxes within
  expenses, expenses below EGI, growth between columns; no general check per
  field
- [~] 6.2.5 Review screen (accept, edit, reject, defer): the AI path has one;
  the built-in reader writes figures straight to the deal, each tagged and
  editable; no "defer"
- [~] 6.2.6 Only approved fields written, never overwritten later: AI review
  applies only ticked fields and keeps the old value; re-reading an OM
  replaces its figures
- [~] 6.3 "OM red-flag check": findings with severity (note, warning,
  error) and the arithmetic in words; not one ranked list with evidence links
- [~] 6.3.1 Pro forma NOI above the T-12 or annualized current NOI, with a
  bridge: pro forma more than 10% above in-place (`proForma`); the OM's NOI
  against the T-12's at 2% and 5%, naming the largest of income, expenses and
  taxes (4.7.0, `noiOmT12`, `t12-noi.test.js`); no line-by-line bridge (7.9)
  and no annualized current NOI
- [~] 6.3.2 Cap rate on pro forma rather than in-place NOI: a stated cap
  that doesn't match NOI ÷ price is flagged and asks which NOI it is on
  (`statedCap`); not detected directly
- [~] 6.3.3 Expenses below the property's history or configured per-SF
  benchmarks: under 12% of gross on a lease that isn't net
  (`lightExpenses`); the T-12 against the OM in the NOI comparison; no
  configured benchmarks
- [~] 6.3.4 Tax not reassessed for the price: a question on every deal with
  a price or taxes (`assessment`); no jurisdiction rules (7.6)
- [ ] 6.3.5 Management fee, reserves or payroll missing or low (mentioned
  only in the light-expenses question)
- [ ] 6.3.6 Rent roll rent above the lease abstract; expirations that differ
  between documents (needs 6.6)
- [ ] 6.3.7 Free rent, abatements and concessions not reflected in stated
  income
- [ ] 6.3.8 Physical against economic occupancy (the rent roll's leased SF
  is compared with the OM's occupancy, `rentRollOcc`)
- [~] 6.3.9 Tenant risks: rent expiring within two years, vacant space,
  short term left, the guarantor (questions); concentration shown in the
  rent roll; no co-tenancy, termination-option, go-dark or above-market
  rollover checks
- [~] 6.3.10 Square-footage basis: the OM's $/SF against price ÷ SF, rent
  roll SF against the building's (`priceSf`, `rentRollSf`); GBA, RSF and
  usable not told apart (3.1)
- [ ] 6.3.11 Recoveries above what the leases allow
- [x] 6.3.12 $/SF and cap rate against the saved comps: priced more than 10%
  above the sold comps (`premium`), value at the comps' cap rate with a
  thin-sample note (`fewCompCaps`). Synthetic only.
- [ ] 6.3 Actions on each finding: add as a conflict, create a diligence
  request, add to buyer Q&A, dismiss with a reason (T-12 checks can be marked
  seen in Review, 4.7.0)
- [~] 6.4 Conflict cards: AI review shows the deal's and the document's
  values side by side; no general conflict store, no "unresolved" record
- [ ] 6.6 Lease abstraction: a proposed abstract of each lease's terms
  *(placed here with the lease engine; Part 22 doesn't name 6.6)*
- [ ] 6.6 Each abstract field linked to its clause and page; unknown stays
  unknown; feeds the lease engine only after approval
- [ ] 6.6 Estoppel and SNDA checklist from the abstracts
- [~] 6.8 Deal timeline: each deal's History lists every edit (4.3.0) and
  Home shows recent activity; no single filterable timeline of documents,
  communications, meetings, stages and scenarios

### Part 7: underwriting and valuation
Today there is one general model; the rent roll's column presets differ by
property type.
- [ ] 7.1 Native template: multifamily
- [ ] 7.1 Native template: retail (single-tenant NNN, multi-tenant, shopping
  center, street retail)
- [ ] 7.1 Native template: office
- [ ] 7.1 Native template: industrial and warehouse
- [ ] 7.1 Native template: mixed-use
- [ ] 7.1 Native template: land and development
- [ ] 7.1 Native templates for hospitality, self-storage, medical office and
  others, only where a reliable model can be defined
- [ ] 7.1 Each template's definition (asset type, inputs, outputs,
  conventions, version, changelog), copy-on-customize
- [~] 7.2 Transaction assumptions: spread over the deal, the rent roll's
  settings and the Tools, not one model
- [~] 7.2 Income: potential and contract rent, market rent and re-leasing,
  vacancy, concessions, other income and recoveries in the rent roll
  projection (`lease.js`); history from the T-12
- [~] 7.2 Expenses: the deal's total expenses and taxes; the T-12's 21
  categories; no line-item expense model in underwriting; no user-defined
  categories
- [~] 7.2 Cash flow: the rent roll projection by month and year through NOI,
  TI, LC and reserves (`lease.js`, `rrbook.js`); DCF and hold tools; no
  levered cash flow statement on the deal
- [~] 7.2 Valuation: direct cap, comps' $/SF and cap rate, the DCF tool,
  value and exit-cap sensitivity; no reconciliation across methods
- [~] 7.2 Returns: levered IRR, multiple and cash-on-cash (hold tool), DSCR,
  debt yield, yield on cost, break-even occupancy, sensitivity grids
- [ ] 7.3 Football field chart
- [ ] 7.3 Pricing recommendation worksheet (range, rationale, risks,
  exhibits)
- [ ] 7.3 Broker Opinion of Value generator
- [~] 7.4 Historical against projected, each basis kept apart: NOI three ways,
  the OM's, the T-12's and the rent roll's year 1, with the gaps flagged (4.7.0;
  `t12-noi.test.js`). "Use the T-12's figures" is an explicit step you can
  undo. No prior-year actual, budget, annualized current, stabilized or
  scenario records.

#### 7.5 Operating statement normalization
The T-12 import (4.7.0, `app/t12.js`, `app/t12ui.js`, `tests/t12.test.js`,
`tests/t12-noi.test.js`, `t12-flow`) covers part of this. It has been tested on
eight invented layouts only, and not yet on a real T-12. The owner's "T-12
multi-format import" waits on proposal 2a.
- [x] Import XLSX and CSV, read on the device (4.7.0). Synthetic only.
- [ ] Import a text PDF (after 2a)
- [ ] Import OCR'd scans, labelled as OCR (after 2a)
- [~] Mapping interface: each line goes to one of 21 standard categories,
  keeping its own wording and account number; "Every line" changes any
  line's category
- [ ] Mapping: custom categories
- [ ] Mapping: split lines
- [ ] Mapping: one-to-many
- [~] Missing months: fewer than 12 month columns is flagged as "Only N
  months" and never scaled up; a month missing inside the period is not
  detected
- [ ] Duplicate periods (the same month twice)
- [~] Non-monthly columns: an annual-only statement is read and flagged; a
  quarterly statement is not recognised
- [~] YTD against monthly: each line's months are checked against the file's
  Total, TTM or YTD column; a file whose columns are cumulative YTD figures is
  not detected
- [x] Sign conventions: negatives in brackets or with a trailing minus;
  expenses written negative and vacancy written positive made consistent
  (`normalizeSigns`; a mutation check). Synthetic only.
- [x] Subtotal rows kept apart from line rows, never double counted, and
  checked against the lines above them. Synthetic only.
- [ ] Flag spikes
- [ ] Flag negative expenses
- [ ] Flag large one-off items
- [ ] Flag year-over-year outliers (needs more than one year)
- [x] Reconcile totals to the source statement: the file's own EGI, total
  expenses, NOI and each subtotal against its lines, and each line's months
  against its Total column (`statementChecks`). Synthetic only.
- [ ] Recurring against nonrecurring, only with confirmation; ambiguous items
  left as "needs classification"
- [ ] Operating against capital, owner's answer 2026-10-14: capex-type lines
  (capital, reserves, TI and LC, debt, depreciation, owner costs) are not
  moved below the line automatically; they are suggested and wait for the
  owner's confirmation. Today 4.7.0 moves them by their wording. To change.
- [ ] Learn from past mappings as suggestions only, owner's answer
  2026-10-14: remembered labels become suggestions that need confirmation.
  Today 4.7.0 applies them as "your choice", and there is no "mapped this
  way in your last N deals". To change.
- [ ] Export the normalized statement to Excel with a mapping sheet

- [ ] 7.6 Jurisdiction rules table (reassessment triggers, assessment ratios,
  tax rates, appeal windows, transfer and recordation taxes), confirmed per
  deal. The DC zoning list (`zoning.js`) for comps is not this.
- [~] 7.7 Auditability: source tags per deal figure (OM page and line,
  typed, edited, derived, AI, tool, scenario), each deal's History of edits,
  T-12 lines with their sheet row; OM statement figures with their row,
  column and cell (4.7.5); no sheet-and-cell source for the other deal
  figures
- [~] 7.8 Baseline and named scenarios, kept apart until "Save to deal…"
  with the list of changes (What if, `dealui.js`)
- [ ] 7.8 Branchable scenarios (broker case against independent case, and
  so on)
- [ ] 7.8 Tornado chart
- [~] 7.8 Two-way sensitivity grids: value (NOI by cap rate) and returns
  (price by exit cap) in Tools
- [~] 7.8 Break-even solvers: price for a target cap or IRR (What if),
  break-even occupancy with debt service (DSCR 1.0); no rent for a target cap
- [~] 7.8 Scenario comparison: saved scenarios listed with their results in
  the brief; no side-by-side table
- [ ] 7.8 Monte Carlo (illustrative, off by default, visible seed)
- [ ] 7.8 "Why did this number change?" waterfall between scenarios or
  snapshots (snapshot compare lists the input changes, 4.3.0)
- [~] **7.9 Pro forma against T-12 bridge** (the owner's "as an interactive
  waterfall"; master plan 6.3 first bullet and 7.9: T-12 NOI to broker pro
  forma NOI to platform stabilized NOI, line by line). What exists: the OM's
  NOI against the T-12's, with the largest of income, expenses and taxes
  named (4.7.0); the NOI bridge tool builds one case from potential rent down
  to NOI. Not built: the line-by-line bridge, a platform stabilized NOI, the
  waterfall.
- [ ] 7.9 Value bridge: broker price to independently modelled value, by
  assumption

### Part 9: rent roll and lease engine
- [x] 9.1 Units and tenants, rent periods on any dates, fixed steps and %
  increases, free rent and abatements, renewal and re-leasing with
  probabilities, rollover and downtime, TI and LC, vacant units and lease-up,
  market rent, one-time charges, custom fields (`lease.js`, `rentroll.js`;
  `lease.test.js` known answers worked by hand, `rentroll-flow`)
- [x] 9.1 Recoveries by method (pro-rata, base year, expense stop, fixed) and
  percentage rent with a natural or set breakpoint (`lease.js`,
  `lease.test.js`)
- [ ] 9.1 Ground lease as its own rent type; custom billing periods
- [ ] 9.1 CPI-linked increases (index, floor, cap, lag, base period)
- [ ] 9.1 Early termination (notice, date, fee, cash-flow effect)
- [~] 9.1 Options: renewal by probability; expansion, contraction and purchase
  options are text, not modelled
- [~] 9.1 Recoveries with caps, admin fees and gross-ups: methods and base
  years exist; caps, admin fees and gross-ups don't
- [x] 9.2 Outputs: summary, lease schedule editor, expirations by year and
  tenant, concentration by rent and SF, WALT by rent or SF with the method
  named, contract against market, projections by month and year, lease-up,
  exportable rent roll with its NOI bridge (`rrbook.js`), feeds the deal and
  the templates
- [~] 9.3 Rent definitions kept apart: contract, market, projected and after
  concessions; billed and collected don't exist; effective rent net of TI and
  LC only in the net-effective-rent tool
- [~] 9.4 Rollover Radar: the expiration table with rent at risk; no option
  dates, re-leasing cost or months of income exposed
- [x] 9.5 Messy XLSX and CSV rent rolls: header row found, total rows skipped,
  columns mapped (`rentrollui.js`, `rentroll-flow`). Synthetic only.
- [x] 9.5 Text-PDF rent rolls: through the OM reader, by position, over
  several pages, with Data QC (4.7.4, `om.test.js`, `omrr-flow`). Synthetic only.
- [x] 9.5 Vacant rows (by status or word, with or without SF), multi-line
  units and repeated header rows (4.7.4, in an OM's rent roll). Synthetic only.
- [x] 9.5 Validation: overlapping periods, end before start, invalid dates,
  units listed twice, area sum against the building (`validateLease`,
  `validateRentRoll`)
- [~] 9.5 Rent per SF taken for rent per month: units from the header, a
  guess flagged, out-of-range figures fail a check (4.7.4, OM rent rolls);
  duplicate tenants not checked
- [x] 9.5 Reconciled to the OM: occupancy and SF against its stated figures
  (`rentRollOcc`, `rentRollSf`)
- [x] 9.6 Known answers worked by hand: irregular dates, leap years, partial
  months, mid-month starts, step boundaries, free-rent timing, WALT
  (`lease.test.js`, `engine.test.js`)
- [ ] 9.6 Known answers for CPI, termination fees and option exercise (the
  features don't exist)

### Part 21: accuracy, validation and controls
- [~] 21.1 Validation layer: units by type, missing as `null`, source tags,
  reconciliation checks, warnings on implausible inputs; actual, estimate
  and projection labelled in places, not everywhere
- [~] 21.2 Prohibited behaviours caught by tests: unit mix-ups refused by the
  type check (`tests/types/mistakes.js`); missing never 0; a partial T-12
  never scaled; a bare management fee never guessed. GBA and RSF are not told
  apart, and double counting is checked only in the T-12's subtotals.
- [~] 21.3 Plausibility rules: fixed checks with fixed thresholds in
  `engine/figures.js` (DSCR 1.25×, pro forma 10%, NOI gaps 2% and 5%,
  expenses 12%); none are editable workspace settings
- [~] 21.4 Known answers for every material formula: many worked by hand
  (`engine.test.js`, `lease.test.js`, `t12.test.js`); some expected values
  came from the code (baseline §5.3)
- [ ] 21.4 Property-based tests for financial invariants (NOI = EGI − expenses;
  the loan balance reaches zero; buckets add to the total). History has 400
  random round trips (`history.test.js`).
- [~] 21.4 Differential tests, native against template recalculation:
  LibreOffice recalculates the exported workbooks and compares them with the
  stored values (`tests/e2e/recalc.py`, `make_engine_check.mjs`)
- [~] 21.4 Golden-file tests: 618 deal results (`analyze-golden.test.js`)
  and 646 displayed figures (`golden.mjs`); exports and template fills are
  checked cell by cell in flows, not against golden files
- [~] 21.4 Mutation checks: run by hand on each PR and recorded in the
  CHANGELOG (4.7.0: eight; 4.4.0: nine); 24 deliberate unit mix-ups in every
  `npm test`; no mutation-testing tool
- [~] 21.4 Edge cases: partial periods, leap years, missing data, 500 leases;
  very small and very large deals and valid negative values not tested
  systematically
- [x] 21.4 Workbook validity kept apart from Excel recalculation: LibreOffice
  only, and every report says so

## Phase 3: firm templates (Part 8)

- [x] 8.1 Template library: upload, versions (last 10), archive, export and
  import; XLSX and XLSM (`library.js`, `template-flow`, `tpl-flow`,
  `template.test.js`)
- [ ] 8.1 CSV templates
- [~] 8.1 Per-template metadata: name, category, description and versions; no
  owner, use case, changelog, usage counts or validation results
- [x] 8.2 Inspection: sheets and visibility, formulas, names, merges, hidden
  sheets, macros, legacy formats (`template.js`)
- [ ] 8.2 Inspection of data validations, protection, external links, array
  and volatile functions, with an Inspection Report of warnings
- [~] 8.3 Mapping suggestions with confidence: named ranges and labels; no
  number-format, formula-role or past-mapping signals; not fully tested
- [x] 8.3 Approve, edit or reject; approved mappings saved with the template
- [~] 8.3 Input against output cells: formula cells flagged and never
  overwritten; outputs not read back
- [x] 8.4 Dry run, cell by cell
- [x] 8.4 Safe fill keeping formulas, formats, merges, names and VBA (byte for
  byte). Recalculated in LibreOffice; not opened in Microsoft Excel.
- [x] 8.4 Audit sheet
- [~] 8.4 Recalculation verification: LibreOffice in the test suite only, not
  in the product; the three states (filled, structurally valid, recalculated
  and reconciled) are not reported
- [~] 8.4 Unmapped fields, missing inputs and differences: the dry run says
  which fields the deal has no value for; reconciliation differences are not
  shown
- [ ] 8.5 Template drift detection
- [ ] 8.6 Native against template reconciliation report
- [!] 8.7 Sharing and governance (roles, publish, usage, deprecate).
  **Blocked:** needs accounts and a server (Phase 7).

## Phase 4: comps and capital markets

### Part 10: comps and market
- [x] 10.1 Sales comps from CoStar PDFs, checked and flagged, into an Excel
  workbook (`costar.js`, `workbook.js`, `comps-flow`). Synthetic only: the
  CoStar layout is recreated from public examples.
- [x] 10.1 Manual comps, filters, sorting, include and exclude, comparison
  tables, CSV and printable exports
- [~] 10.1 Sale type and conditions read from CoStar; no verified cap rate,
  verification status or verifier
- [ ] 10.1 Comp import from Excel or CSV with column mapping (comps come from
  CoStar PDFs, project files or by hand)
- [~] 10.1 Saved comp sets: one working set per device, plus project export
  and import
- [ ] 10.1 Map view with radius and polygon
- [~] 10.2 Adjustment grid with a required rationale: in the exported
  workbook, filled in Excel; not in the app
- [~] 10.2 Paired-sales or regression support: a least-squares trend of sold
  $/SF over time (`glance.js`, the workbook's Summary); no paired sales, and
  not offered as adjustment support
- [ ] 10.3 Lease comps with effective rent and explicit gross, net and
  modified gross (the workbook's Lease Comps tab is filled by hand)
- [ ] 10.4 Market notes and submarket statistics with source and date, stale
  ones marked
- [~] 10.4 Bring-your-own data: CoStar sale comp PDFs only
- [ ] 10.4 Public data providers (Census, BLS, FRED)
- [~] 10.5 Comp-to-underwriting links: asking against the comps, value at the
  comps' $/SF and cap; comp ids not kept as evidence; not fully tested

### Part 11: tools
- [x] The 30 calculators, with formula notes, scenarios, export, load from the
  deal, write back after confirmation (`toolsdefs.js`, `toolsui.js`,
  `tools.test.js`, `finance.test.js`, `tools-flow`)
- [~] Audit for duplication against the deal model: baseline §5; 4.1.0 put the
  shared formulas in the engine; the tools' own math is not registered
- [x] 11.1 Seller net sheet ("Offer and seller net")
- [~] 11.1 1031 timeline and boot: the 45- and 180-day deadlines; no boot
- [ ] 11.1 Cost segregation estimator (illustrative)
- [ ] 11.1 Prepayment: yield maintenance, defeasance, step-down
- [ ] 11.1 Rate buydown and forward-starting scenarios
- [ ] 11.1 XIRR with irregular dates
- [ ] 11.1 NNN against gross conversion
- [ ] 11.1 Rent per SF basis converter (RSF, USF, GBA; monthly, annual)
- [x] 11.1 Land residual ("Residual land value")
- [ ] 11.1 Listing presentation pricing sheet
- [x] 11.1 Commission split calculator ("Commission and splits": tiers and
  splits)
- [ ] 11.1 Prospect pipeline forecast
- [ ] 11.1 Transfer and recordation taxes (needs 7.6)
- [~] 11.2 Tool requirements: labelled inputs with units, formula notes,
  export, link to the open deal and confirmation before writing back; known
  answers for some formulas only
- [~] 11.3 Search, favourites, recently used, recommended: search only

### Part 15: capital markets
- [x] 15.1 Debt sizing by LTV, DSCR and debt yield with the binding
  constraint (Loan sizing tool; the deal's largest supportable loan)
- [x] 15.1 Amortization, IO, floating with a cap, refinance, maturity risk,
  fees (Tools; `finance.test.js`)
- [~] 15.1 Equity required and levered returns (hold and waterfall tools); no
  capital stack summary
- [ ] 15.2 Financing comparison across structures (illustrative labelled as
  such)
- [ ] 15.3 Lender package builder
- [ ] 15.4 Live rates from a configured provider, with source, as-of and
  fetch status; a labelled assumption when there is none; pinned to a deal.
  Rates are typed by hand today.
- [ ] 15.5 Lender CRM and quote tracker
- [~] 15.6 One loan engine: debt service is one function used by screens,
  tools and the workbook (`engine/debt.js`, 4.1.0); refinance and maturity
  math is in `calc.js`

## Phase 5: marketing, diligence, buyers

*Part 22 doesn't name Part 5 (Home) or most of Part 12 (Document Center).
Home is placed here because its missing parts need diligence, buyers and
Pre-Flight; the Document Center goes with the data room.*

### Part 5: Home, Command Center and pipeline
- [x] 5.1 Today: key dates, follow-ups, stale deals (`home.js`,
  `pipeline.js`, `home-flow`). Key dates look 30 days ahead (the plan says
  14, configurable); a deal is stale after 21 days, fixed.
- [ ] 5.1 Today: documents awaiting review, overdue diligence, buyer replies
- [ ] 5.1 Daily AI summary, labelled as AI
- [x] 5.1 Pipeline: nine stages, renamable and hideable; the board
- [ ] 5.1 Pipeline table view, saved filters, stage gates
- [x] 5.1 Needs Attention: key dates, overdue tasks, no next step, stale
  deals, no backup
- [ ] 5.1 Needs Attention: incomplete underwriting, expiring listing
  agreements, missing disclaimers
- [~] 5.1 Recent work (yes); pinned deals (no)
- [ ] 5.1 Pipeline analytics (commission by stage and probability, aging,
  conversion)
- [~] 5.1 Meetings and tasks: tasks; no calendar (17.5)
- [ ] 5.1 Customizable widgets and saved views (with the UI revamp)
- [ ] 5.2 Deal Health Score, every point traceable to an editable rule

### Part 12: Document Center
- [ ] 12.1 Data room: folders, tags, versions, status, indexed search,
  previews (the OM's PDF itself is not kept today)
- [ ] 12.2 Conversion workflows
- [~] 12.3 The four operations kept apart: extraction (`om.js`, `costar.js`),
  normalization (`t12.js`) and underwriting (`app/engine/`) are separate
  modules; conversion doesn't exist
- [ ] 12.4 Batch processing, naming rules, ZIP packages, history, retention
- [~] 12.5 Upload safety: type and size checks, legacy formats refused,
  macros detected, PDFs parsed in a worker; no malware-scan hook or written
  retention rules
- [ ] 12.6 Document diff and redline
- [ ] 12.7 PDF tools

### Part 13: marketing and OM creation
- [x] 13.1 One-page deal brief and five-line text summary (`brief.js`)
- [ ] 13.1 OM, BOV, fact sheet, highlights, summaries, exhibits, market
  overview, presentations, investor briefs, packages, listing proposals,
  pitch decks, teaser emails, social and listing copy
- [ ] 13.2 Firm branding
- [ ] 13.3 Evidence Panel beside each section
- [ ] 13.3 AI text marked as draft and never "verified" by the AI;
  placeholders that block export
- [ ] 13.3 Claim Checker
- [~] 13.4 Exports: the brief prints, the workbook is XLSX; no DOCX, PPTX
  or email-ready versions
- [ ] 13.5 Pre-Flight Gate, its result saved with the export
- [ ] 13.6 Share links (expiry, watermark, passcode, NDA/CA) and engagement
  analytics

### Part 17.1–17.4: CRM and buyers
*17.5 integrations are in Phase 7.*
- [x] 17.1 Contacts with roles, linked to deals (`crm.js`, `dealcrm.js`)
- [ ] 17.1 Companies as records, owners and entities, investors, firm custom
  fields
- [ ] 17.2 Buyer profiles
- [ ] 17.2 Match view, ranked and explained
- [ ] 17.2 Call and email lists with talking points and the call script
- [ ] 17.2 Outcome logging and the per-listing activity report
- [ ] 17.2 Follow-up cadence; do-not-contact and opt-out lists honoured
- [ ] 17.3 Offers and LOIs recorded; Bid Leveler; client offer summary
- [~] 17.4 Communications: voice notes and transcripts sit on the deal, and
  action items become its next steps (stand-in speech and model only); no
  calendar events or contact import

### Part 18: due diligence and closing
- [x] Key dates on a deal
- [ ] 18.1 Diligence checklists by property type and stage (the site-visit
  checklist only)
- [ ] 18.2 Request tracking: uploaded, reviewed, approved
- [~] 18.3 Critical dates: typed by hand; the 1031 tool works out 45 and 180
  days; no contract-driven dates, business days or holidays
- [ ] 18.4 Closing workspace, prorations, funds flow
- [ ] 18.5 Q&A manager
- [ ] 18.6 Diligence findings proposing underwriting changes

## Phase 6: live AI and Field Mode

*6.5 Ask the Deal and 6.7 site visits are placed here with Part 16 and Part
14.*

### Part 16: live AI and transcription
- [x] 16.1.1 The AI server: keys on the server, app token, origin allowlist,
  rate limit, no content logged (`server/`, `server/test`: 11 pass)
- [~] 16.1.2 Setup, health check and clear errors: `server/README.md`,
  Settings → Test connection (`/api/health`); not tried against a deployed
  server
- [x] 16.1.3 OM extraction and review, the deal assistant, meeting notes with
  action items, transcription with timed segments (`ai-flow`, `voice-flow`).
  Synthetic only: a stand-in model and speech service.
- [ ] 16.1.3 Speaker labels; searchable meeting history; AI reading of
  financial statements; cross-document reconciliation by AI
- [!] 16.1.4 A real AI provider and speech service. **Blocked:** needs
  `ANTHROPIC_API_KEY`, `STT_URL`, `STT_API_KEY` and a deployed server.
- [~] 16.1.5 Limits: token, size limits, rate limit, origins, timeouts; no
  retries with backoff and no cost caps; the rate limit is per socket address
- [~] 16.1.6 Provider abstraction: speech is any OpenAI-compatible service;
  the language model is one vendor; AI off by default and each send
  confirmed; no per-workspace setting
- [~] 16.2 Each extracted number checked against its source: every quote is
  checked against the PDF text (`reconcile.js`); unit, sign and period
  partly
- [~] 16.2 Source text, extracted, confirmed, AI, calculated and unresolved
  kept apart: by source tags; AI readings stay apart until applied
- [x] 16.2 The AI proposes, the person approves; it never overwrites an
  approved value (`ai-flow`). Synthetic only.
- [~] 16.2 Prompt-injection defence: document text sent as data, quotes
  verified; no adversarial test set
- [ ] 16.3 Extraction evaluation harness
- [~] 16.4 Live features marked "Blocked: credentials"; no written
  live-validation plan yet

### Part 6.5: Ask the Deal
- [x] Cited answers over the deal's facts, each fact cited by id
  (`aifacts.js`, `ai-flow`). Synthetic only.
- [ ] Over every document's text, notes, transcripts and models
- [ ] Suggested questions per document type; answers saved as source-linked
  notes

### Part 14 and 6.7: Field Mode and site visits
- [x] Installable and offline (`sw.js`, `pwa-flow`); not on a real iPhone
- [ ] A local queue with conflict-safe sync (needs Phase 7)
- [x] Photos, voice notes, checklists and notes (`voice-flow`, `workflows`)
- [x] Transcription (`voice-flow`). Synthetic only: a stand-in speech
  service.
- [ ] Photo area labels, condition tags, annotations and geotags
- [ ] Observations linked to diligence and assumptions as questions
- [ ] Offline tenant and contact lookup screen (contacts already open offline
  from Home)
- [~] Deal summary card and key numbers for calls: the brief's five-line text
- [ ] Geofenced "you are at the property" prompt
- [x] Meeting notes with action items into the deal's next steps (`aiui.js`,
  `voice-flow`). Synthetic only.

## Phase 7: workspaces and integrations

*3.5's cloud sync and 3.6's REST API and webhooks are placed here.*
- [ ] 19.1 Accounts, MFA, teams, roles, deal-level access, shared templates,
  cross-device sync, remote backup, audit logs, deletion
- [ ] 19.1 Migration plan from local to cloud that keeps local deals, with
  local export kept (`docs/architecture/proposal.md` §2.9 leaves it to this
  phase, decision D-D)
- [x] Local backup and restore kept (`backup-flow`, `backup.test.js`)
- [ ] 3.6 REST API and outbound webhooks
- [ ] 19.2 Server-side authorization, tenant isolation, role and abuse tests
- [ ] 19.2 Encryption at rest for stored documents (data in the browser is
  unencrypted, as the README says)
- [~] 19.2 Security headers: a CSP subset by meta tag; GitHub Pages can't set
  headers
- [ ] 19.2 Audit log of access to sensitive documents and exports
- [~] 19.2 Retention and verified deletion: deleting a deal deletes its
  photos and audio; removed media kept 30 days for undo; no written policy
- [ ] 19.2 A "confidential" tag that limits sharing and AI
- [~] 19.2 Where data is stored, shown: Settings → Your data, Home's first-run
  text and the backup reminder; not shown at all times
- [~] 19.3 Security review checklist and known gaps: baseline §8 observations;
  no checklist
- [ ] 17.5 Calendar, email, CRM, e-signature and file-storage integrations,
  each documented
- [ ] Hosting proposal (private repository, login-gated site)

## Phase 8: final audit

- [ ] 20.3 The key screens finished (with the UI revamp)
- [x] 20.4 WCAG 2.2 AA, automated: axe on every screen in light and dark, 24
  px targets, reflow at 320 px (`a11y-flow`)
- [!] 20.4 Screen readers. **Blocked:** no VoiceOver or NVDA here.
- [~] 20.4 Browsers: Chromium only; WebKit runs are possible but it isn't
  installed here; Firefox not installed
- [ ] 20.5 Guided Mode, with "why this matters" notes and step checklists
- [~] 20.6 Microcopy and states: errors say what to do (an .xls is refused
  with the next step), page-by-page progress, empty states on Home;
  terminology not yet audited
- [ ] 3.7 Performance measured on the final code
- [ ] Security review, including the git history
- [ ] Full regression on the final code
- [ ] Real-document and real-Excel validation plan
- [ ] Deployment and migration checklist; proprietary LICENSE

## Real-world validation still required

- [!] Safari on a real iPhone; Firefox (not available here)
- [!] Microsoft Excel opening filled and exported workbooks (LibreOffice only)
- [!] Real OMs, rent rolls, T-12s and CoStar exports (needs files the owner
  is entitled to share; real files stay in `private/`)
- [!] Live AI and speech providers (credentials and a deployed server)
- [!] Screen readers

## Owner's answers (2026-10-14)

1. Branches: one branch and PR per item.
2. Navigation: bottom nav on the phone, left rail on the desktop; keep both.
3. Design: follow the revamp with the master plan's restraint: one accent
   color, charts only where they inform a decision, no filler cards.
4. The 3.2.0 line: met.
5. Remembered T-12 labels: suggestions that need confirmation (tracked in
   Phase 2, 7.5).
6. Operating against capital: suggest, never move automatically (tracked in
   Phase 2, 7.5).
7. Rounding: whole cents as decided in 4.1.0; display rounding separate.
8. The extra approval gates from Part 0 rule 6: confirmed.
9. Order: the bugs, then both proposals, then the builds.
10. Licence: MIT until Phase 8.

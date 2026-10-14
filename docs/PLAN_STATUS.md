# Plan status

Where Zlatura stands against the master plan. It is updated with every PR.

**Key:** `[x]` done · `[~]` in progress or partly done · `[ ]` not started ·
`[!]` blocked (the reason is given).

Last updated: 4.7.1, the model routing setup (2026-10-14).

## Now

- **Current step:** Part 1, Bug C (date inputs). After it: Bug A, then Bug B.
- **Next gate:** the three bug-fix PRs, open for merge.

## Phases

### Phase 0: audit and plan
- [x] Baseline report, architecture proposal, acceptance matrix (4.0.0)

### Phase 1: foundations
- [x] Rename to Zlatura and storage migration (4.0.0)
- [x] One calculation engine, conventions, whole-cent money (4.1.0)
- [x] Lease projection off the main thread, performance budgets (4.2.0)
- [x] History, undo/redo, snapshots, backups v2, storage limits (4.3.x)
- [x] Dependency map and "what this affects" (4.4.0)
- [x] Typed deal model with unit types (4.4.1)
- [x] Migration registry (4.5.0)
- [x] `?` keyboard shortcut sheet (4.6.0)

### Setup for the rest of the plan
- [x] Model routing: the designer (Opus) and builder (Sonnet) agents, and
  CLAUDE.md (4.7.1)
- [x] This file
- [~] WebKit (iPhone Safari engine) runs: `PW_BROWSER=webkit` added. **Blocked
  here:** WebKit isn't installed in this environment, so runs here are
  Chromium at iPhone size.

### Part 1: three bugs
- [ ] Bug C: date inputs lose what is typed at the year
- [ ] Bug A: the rent roll from an OM doesn't scan correctly
- [ ] Bug B: income and expenses read from OM statements are often wrong

### Part 2: design proposals
These stop for approval.
- [ ] 2a. T-12 multi-format import (`docs/proposals/t12-multiformat.md`)
- [ ] 2b. UI revamp (`docs/proposals/ui-revamp.md`, wireframes in
  `docs/proposals/ui/`)

### Phase 2: underwriting and analysis
- [x] T-12 import (.xlsx, .csv), 21 categories, remembered labels (4.7.0)
- [x] Review Queue (4.7.0)
- [x] NOI three ways (4.7.0)
- [ ] T-12 multi-format import (after 2a)
- [ ] OM red-flag check
- [ ] Pro forma vs T-12 bridge, as an interactive waterfall
- [ ] Native underwriting templates by property type
- [ ] Rent roll and lease engine extensions (CPI, early termination,
  options, recovery caps)
- [ ] OM ingestion review flow and OM Forensics
- [ ] Scenario Studio (branchable scenarios)
- [ ] Pricing Guidance Studio
- [ ] Provenance and drill-down for every number

### UI revamp
Behind the "New look" toggle, after 2b.
- [ ] Foundation and theme
- [ ] Home and navigation
- [ ] Customization (widgets, layouts, presets)
- [ ] Live charts
- [ ] Motion and micro-interactions
- [ ] Clean-up of existing screens
- [ ] Feature map, and a test that nothing is lost

### Phase 3: firm templates
- [ ] Mapping Studio, inspection, dry run, safe fill (partly there:
  library, dry run, safe fill)
- [ ] Recalculation verification
- [ ] Drift detection
- [ ] Native-vs-template reconciliation
- [ ] Template governance

### Phase 4: comps and capital markets
- [ ] Comp workspace, adjustment grid, lease comps
- [ ] Debt sizing comparison, live-rate provider framework, lender quote
  tracker
- [ ] Tools library audit and expansion

### Phase 5: marketing, diligence, buyers
- [ ] Branded deliverables and Claim Checker
- [ ] Pre-Flight Gates
- [ ] Data room sharing and analytics
- [ ] Due diligence and critical dates
- [ ] Buyer Match and Outreach Engine
- [ ] Bid Leveler
- [ ] Q&A manager

### Phase 6: live AI and Field Mode
- [ ] Provider configuration (provider-agnostic, private mode, no key in
  the app)
- [ ] Evaluation harness
- [ ] Ask the Deal
- [ ] Transcription
- [ ] Field Mode

### Phase 7: workspaces and integrations
- [ ] Accounts, permissions, sync, remote backup, audit logs
- [ ] Calendar, email and CRM integrations
- [ ] Retention and deletion
- [ ] Hosting proposal (private repo, login-gated site)

### Phase 8: final audit
- [ ] UI/UX polish, accessibility, cross-browser, responsive
- [ ] Performance measurement, security review (including git history)
- [ ] Full regression, real-document and real-Excel validation plan
- [ ] Deployment and migration checklist, proprietary LICENSE

## Every feature in the brief

Generated from `docs/acceptance-matrix.md`. It has 164 items:

| Status | Items |
|---|---|
| Done | 48 |
| In progress or partly done | 56 |
| Not started | 52 |
| Blocked | 8 |

#### Part 0–1. Operating rules, identity

- [x] Rename to Zlatura (UI, metadata, docs, exports, file names)
- [x] Storage migration (IndexedDB `comp-loader` → `zlatura`, `comp-loader.*` keys, cache name)
- [x] Old file formats still read (backup, project, template package)
- [x] Pre-rename backups still restore (with a test)
- [~] "About the name" (partially implemented)
- [x] Tagline
- [~] Logo (light, dark), favicon, app icons (implemented, not fully tested)

#### Part 2–3. Pillars and architecture foundations

- [x] Typed domain model with unit-branded types
- [~] Explicit missing values (`unknown` / `not_applicable` / `confirmed_zero`) (partially implemented)
- [x] Decimal or integer-cent money
- [~] Pure calculation engine, one formula per quantity (partially implemented)
- [~] Calculation results carry inputs, formula id, conventions, warnings (partially implemented)
- [~] Convention registry, configurable (partially implemented)
- [x] Impact Graph (dependency graph, "this change affects…", cycle detection)
- [~] "Explain this number" for every material output (partially implemented)
- [~] Event-sourced change history (partially implemented)
- [x] Undo/redo for all deal edits
- [x] Snapshots (named and automatic), compare, restore
- [x] Backups carry history and snapshots (version 2); version 1 still restores
- [x] Storage limits and the 80% warning
- [x] Database version 2 (history, snapshots, trash) without data loss
- [x] Versioned schema with forward migrations and a migration test suite using real old backups
- [~] Local-first with optional cloud sync (partially implemented)
- [ ] Plugin interfaces (parsers, calculators, template adapters, exports, data providers)
- [ ] REST API and webhooks
- [~] Performance budgets measured (implemented, not fully tested)
- [~] Long work off the UI thread (partially implemented)

#### Part 4. Application structure and navigation

- [~] Primary workspaces (partially implemented)
- [x] Command palette (Cmd/Ctrl+K)
- [~] Global search across documents, tasks, notes, comps (partially implemented)
- [~] Deal switcher, recently opened, breadcrumbs (partially implemented)
- [x] Review Queue
- [ ] Status bar (save, sync, scenario, template, confidence)
- [x] Keyboard shortcut cheat sheet (`?`)
- [x] Light, dark, system themes
- [~] Responsive desktop, tablet, phone (implemented, not fully tested)

#### Part 5. Home: Command Center and pipeline

- [x] Today view: key dates, follow-ups, stale deals
- [ ] Documents awaiting review, overdue diligence, buyer replies on Home
- [ ] AI daily summary (labelled)
- [x] Pipeline: configurable stages, board
- [ ] Pipeline table view, saved filters, stage gates (required fields, checklists)
- [x] Needs Attention
- [~] Recent work, pinned deals (partially implemented)
- [ ] Pipeline analytics (commission by stage and probability, aging, conversion)
- [ ] Calendar integration
- [ ] Custom widgets and saved views
- [ ] Deal Health Score (explainable)

#### Part 6. Live Deal and OM integration

- [~] Scanned PDFs / OCR (partially implemented)
- [~] Each field: value, unit, page, quote, confidence (implemented, not fully tested)
- [x] Cross-field validators (price/SF, NOI/price vs cap, rent roll sum vs stated)
- [~] Review screen before writing to the deal (partially implemented)
- [~] Approved values never silently overwritten by a later import (partially implemented)
- [~] OM Forensics ("Broker Math Check") (partially implemented)
- [~] Conflict cards between sources (partially implemented)
- [ ] Lease abstraction from lease documents
- [ ] Estoppel and SNDA checklist
- [x] Site visits: photos, voice notes, checklist, notes
- [~] Deal timeline (partially implemented)

#### Part 7. Underwriting and valuation

- [ ] Native property-type templates (multifamily, retail, office, industrial, mixed-use, land)
- [~] Transaction, income, expense, cash flow, valuation, returns (partially implemented)
- [ ] Pricing Guidance Studio (football field)
- [ ] Broker Opinion of Value generator
- [~] Historical vs projected side by side (T-12, budget, pro forma…) (partially implemented)
- [~] Operating statement import and normalization (partially implemented)
- [ ] Jurisdiction rules data table
- [~] Auditability: source, page, edits per number (partially implemented)
- [~] Scenario Studio: branchable scenarios (partially implemented)
- [~] Tornado, two-way grids, break-even solvers (partially implemented)
- [ ] Monte Carlo
- [ ] "Why did this number change?" waterfall
- [x] NOI bridge

#### Part 8. Firm templates and Mapping Studio

- [x] Template library with versions, archive, export/import
- [~] Per-template metadata (owner, property type, usage counts, changelog) (partially implemented)
- [x] Workbook inspection (sheets, formulas, names, merges, hidden, macros, legacy formats)
- [~] Mapping suggestions with confidence (implemented, not fully tested)
- [~] Input vs output cell detection (partially implemented)
- [x] Dry run cell-by-cell preview
- [x] Safe fill preserving formulas, formats, merges, names, VBA
- [x] Audit sheet
- [~] Recalculation verification and read-back reconciliation (partially implemented)
- [ ] Template drift detection
- [ ] Native vs template reconciliation report
- [!] Workspace sharing and governance (roles, publish, deprecate) (blocked)

#### Part 9. Rent roll and lease engine

- [x] Units, tenants, rent types, periods, steps, % bumps, free rent, recoveries, percentage rent, one-time items, renewals, lease-up, market rent
- [ ] CPI-linked increases (index, floor, cap, lag)
- [ ] Early termination (notice, date, fee, cash-flow effect)
- [~] Expansion, contraction, purchase options (partially implemented)
- [~] Recovery caps, admin fees, gross-ups (partially implemented)
- [x] Outputs: summary, schedule, expirations, concentration, WALT, loss to lease, projection, NOI bridge
- [~] Rent definitions kept distinct (contract, market, potential, billed, collected, effective) (partially implemented)
- [~] Rollover Radar (partially implemented)
- [x] Messy rent roll intake (XLSX, CSV) with header detection and total-row skipping
- [x] Validation (overlaps, bad dates, area sums)
- [x] Known-answer tests for irregular dates, leap years, partial months
- [~] Performance with 500 leases (partially implemented)

#### Part 10. Comps and market

- [x] Manual comps, filters, sort, include/exclude
- [~] Saved comp sets (multiple) (partially implemented)
- [ ] Map view with radius/polygon
- [~] Adjustment grid with required rationale (partially implemented)
- [ ] Lease comps and effective rent
- [ ] Market notes and statistics with source and date
- [ ] Public data providers (FRED, BLS, Census)
- [~] Comp-to-underwriting links (implemented, not fully tested)

#### Part 11. Tools

- [x] 30 calculators with formula notes, scenarios, export, load from deal, write back after confirmation
- [~] Audit for duplication against the deal model (partially implemented)
- [~] New: seller net sheet, 1031 timeline/boot (partially implemented)
- [ ] New: cost segregation estimator, prepayment (yield maintenance, defeasance, step-down), rate buydown, XIRR, NNN↔gross, area-basis converter, interest reserve, transfer taxes, listing pricing sheet, pipeline forecast
- [~] Search, favourites, recently used, recommended (partially implemented)

#### Part 12. Document Center

- [ ] Data room with folders, tags, versions, status, previews
- [ ] Conversions (PDF↔Word, tables to Excel, OCR…)
- [ ] Batch processing, history, retention
- [~] Upload safety (size limits, sniffing, isolation) (partially implemented)
- [ ] Document diff/redline, PDF tools

#### Part 13. Marketing and OM creation

- [x] One-page deal brief
- [ ] OM, BOV, fact sheet, pitch deck, emails, listing copy
- [ ] Firm branding
- [ ] Evidence Panel, Claim Checker
- [ ] Pre-Flight Gates
- [ ] Secure share links, engagement analytics

#### Part 14. Field Mode

- [x] Installable, offline-capable PWA
- [x] Photos, voice notes, checklists, notes
- [ ] Area labels, observations linked to diligence, offline contact lookup, geofence

#### Part 15. Capital markets

- [x] Debt sizing (LTV, DSCR, debt yield) with binding constraint
- [x] Amortization, IO, floating with cap, refinance, maturity risk, fees
- [ ] Financing structure comparison
- [ ] Lender package builder
- [ ] Live rates with source and as-of
- [ ] Lender CRM and quote tracker
- [~] One loan engine for underwriting and tools (partially implemented)

#### Part 16. Live AI and transcription

- [x] AI server (keys server-side, token, origin allowlist, rate limit, no content logging)
- [!] Live provider validation (blocked)
- [~] Provider abstraction, per-workspace data-leaving setting (partially implemented)
- [~] Prompt-injection defence with adversarial tests (partially implemented)
- [ ] Extraction evaluation harness

#### Part 17. CRM and integrations

- [x] Contacts with roles, linked to deals
- [ ] Companies as records, owners/entities, investors, custom fields
- [ ] Buyer profiles, Buyer Match, call lists, outcome logging
- [ ] Offers and Bid Leveler
- [ ] Calendar, email, CRM, e-signature integrations

#### Part 18. Due diligence and closing

- [x] Key dates on a deal
- [ ] Diligence checklists, request tracking, Q&A manager, closing workspace, prorations
- [~] Contract-driven critical dates (incl. 1031 45/180 days) (partially implemented)

#### Part 19. Workspaces, security, privacy

- [ ] Accounts, roles, sync, remote backup, audit logs
- [x] Local backup and restore
- [~] Security headers / CSP (partially implemented)
- [~] Retention policy and verified deletion (partially implemented)

#### Part 20. UI/UX

- [x] Design tokens, components, light/dark
- [ ] Living style guide route
- [x] Dense tables: sticky headers, pinned first column, keyboard, inline edit
- [x] WCAG 2.2 AA (automated)
- [!] Screen reader tested (blocked)
- [~] Chromium, Firefox, Safari (partially implemented)
- [ ] Guided Mode

#### Part 21. Accuracy controls

- [~] Known-answer tests for material formulas (partially implemented)
- [ ] Property-based tests for invariants
- [~] Differential tests native vs template recalculation (partially implemented)
- [~] Golden-file tests for exports (partially implemented)
- [ ] Mutation tests
- [~] Configurable plausibility rules (partially implemented)

#### Real-world validation still required

- [!] Safari on a real iPhone; Firefox (blocked)
- [!] Microsoft Excel opening filled and exported workbooks (blocked)
- [!] Real OMs, rent rolls, T-12s, CoStar exports (blocked)
- [!] Live AI and speech providers (blocked)
- [!] Screen readers (blocked)
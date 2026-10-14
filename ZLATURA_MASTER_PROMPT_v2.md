# ZLATURA MASTER DEVELOPMENT PROMPT (v2)
## Build a complete commercial real estate brokerage operating system

> How to use this prompt: paste it into Claude Code at the root of the existing repository. It is written as a standing brief. Claude should re-read the "Operating Rules" (Part 0) and the "Acceptance Matrix and Truthfulness Standard" (Part 23) at the start of every phase and before every report.

---

# PART 0. OPERATING RULES (READ FIRST, RE-READ EVERY PHASE)

1. **This is a continuation, not a greenfield build.** Preserve and extend the existing lease engine, rent roll workspace, Excel template engine and library, the 30 financial calculators, Live Deal scenarios, AI review workflows, dashboard, pipeline, backup and restore, and accessibility work. Never replace working features with a simplified prototype.
2. **Audit before you build.** Inspect the repository, branches, commit history, README and docs, the acceptance matrix, tests, build tooling, dependencies, data model and storage layer. Establish and write down the verified baseline: which branch holds the latest work (the 3.2.0 development line), whether the working tree is clean, which tests pass and fail today, and the real line counts and module boundaries. If the latest work is not on the branch you expect, stop and report before changing anything.
3. **Work in small, verifiable increments.** Each increment ends with: code, tests, a run of the full regression suite, a short written report, and a commit on the designated development branch. No giant uncontrolled rewrites.
4. **Never merge, force-push, reset important branches, delete user data, change production settings, or deploy without explicit authorization.**
5. **Accuracy, transparency, data preservation, and usability outrank feature count.** If a feature cannot be made trustworthy, ship a smaller honest version and list the gap in the acceptance matrix.
6. **Decide vs. ask.** Decide yourself on implementation details, naming, internal structure, and reversible choices (state the choice in the report). Stop and ask the user only when a choice is irreversible, changes financial meaning, affects security or data retention, costs money (paid APIs), or when two reasonable interpretations of a financial input would produce different numbers.
7. **Report honestly.** Use the status vocabulary in Part 23. Never describe something as verified, live, compatible, secure, or production-ready unless it was actually tested that way, and say how.
8. **Rename the product to Zlatura** (Part 1) in the UI, package metadata, documentation, exports, file names, and storage keys, with a migration so existing local data keeps working.

---

# PART 1. IDENTITY, MISSION, AND PRODUCT PRINCIPLES

## 1.1 Name and meaning
Rename the application **Zlatura**. The name combines two roots:
- **Zlato**: Serbian/Serbo-Croatian for gold, wealth.
- **Fartura**: Brazilian Portuguese for abundance, plenty.

Include a short "About the name" section in the About screen, README, and onboarding. Draft tagline options for the user to choose from (do not hard-code one without approval), e.g. "Underwrite with confidence." / "Every source. Every assumption. Every number." Provide light and dark logo treatments and a favicon/app icon set designed originally (no copied marks).

**Rename migration requirements:** keep a one-time, reversible migration of existing local storage keys, IndexedDB databases, exported file naming, and backup files from the old name to Zlatura. Old backups must still restore. Add a test that restores a pre-rename backup.

## 1.2 Mission
Transform the application into a comprehensive, production-oriented commercial real estate brokerage workspace that unifies:
financial underwriting, valuation, offering memorandums, comparable sales and lease comps, rent rolls and lease abstraction, document intelligence, due diligence, capital markets, client and buyer management, deal pipeline, marketing, and investor reporting.

It should serve commercial real estate brokers, investment sales professionals, debt and capital markets teams, analysts and interns, and entire brokerage firms that need one consistent way to organize property information, evaluate deals, prepare marketing materials, and manage relationships.

## 1.3 Core principles
1. **The firm's workflow wins.** Zlatura adapts to the broker's existing Excel models, templates, and standards. Users never have to abandon their models. Zlatura becomes the hub that connects those models and documents, removes repetitive work, and makes analysis consistent.
2. **One deal model, many views.** OM, rent roll, operating statements, comps, financing, templates, and marketing all read and write through one typed, versioned deal data model. Nothing is typed twice.
3. **Every number has a receipt.** Any material figure can be traced to its source (document, page, cell, row), the assumptions and formula that produced it, who changed it, and when.
4. **Facts, assumptions, and forecasts are different things** and are stored, displayed, and exported as different things.
5. **Nothing silently changes.** AI, imports, template fills, and recalculations never overwrite approved values without an explicit, reviewable approval.
6. **Honest uncertainty.** Missing is not zero. Ambiguous is not decided. Extracted is not verified. Converted is not accurate.
7. **Calm, premium, fast.** Professional users open this every day. It should feel precise, quiet, and trustworthy.

---

# PART 2. INNOVATION PILLARS (WHAT MAKES ZLATURA DIFFERENT)

These are the distinguishing capabilities. Each is specified in detail in later parts. Implement them as first-class architecture, not bolt-ons. Prioritize as noted in Part 22.

| # | Pillar | One-line description |
|---|--------|----------------------|
| 1 | **Deal Ledger and Impact Graph** | Every input and assumption lives in a dependency graph. Change one and instantly see every output, template cell, report, and scenario it affects. |
| 2 | **Provenance Everywhere ("Receipts")** | Click any number to see its source page/cell, extraction method, confidence, edits, and formula. |
| 3 | **Mapping Studio for Firm Excel Models** | Upload any firm workbook, get evidence-based mapping suggestions, dry-run previews, safe filling, and recalculation verification. Saved mappings survive template updates through drift detection. |
| 4 | **OM Forensics ("Broker Math Check")** | Automatically compare an OM's pro forma and marketing claims against actuals, rent roll, and market evidence, and surface specific, explained red flags. |
| 5 | **Time Machine** | Immutable deal snapshots, named versions, side-by-side diff, and one-click "what did we tell the client on this date?" |
| 6 | **Scenario Studio** | Branchable scenarios, tornado charts, sensitivity grids, break-even solvers, and pricing "football fields" built on the shared calculation engine. |
| 7 | **Bid Leveler** | Normalize multiple offers or LOIs (price, deposit, diligence, financing, closing, credits) into a net-effective comparison. |
| 8 | **Buyer Match and Outreach Engine** | Match a listing to buyers by saved criteria and history, generate call/email lists, log outcomes, and track campaign performance. |
| 9 | **Data Room Intelligence** | Controlled sharing, NDA/CA gating, engagement analytics (who opened what), and Q&A management with source-cited answers. |
| 10 | **Ask the Deal** | Cited natural-language Q&A across every document and model in a deal. Answers show quotes and links, and say "not found" when the evidence is absent. |
| 11 | **Field Mode** | Offline-capable mobile workflow for site visits: photos, voice notes, transcription, checklists, geotagged observations, synced into the deal. |
| 12 | **Pre-Flight Gates** | Before any export, send, or client-facing output, run an automated quality gate (unresolved mappings, stale data, unverified figures, conflicting values, missing disclaimers). |
| 13 | **Live Market Inputs, Properly Sourced** | Interest rates and indices (SOFR, Treasuries, CPI) pulled live from configured sources with as-of timestamps, never hard-coded or recalled from memory. |
| 14 | **Command Center UX** | Command palette, keyboard-first navigation, saved views, review queues, undo/redo, and a daily briefing. |
| 15 | **Guided Mode for New Analysts** | Optional step-by-step workflows, checklists, and explanations of each metric, so an intern can run a competent first-pass analysis and a senior broker can switch it off. |

---

# PART 3. ARCHITECTURE FOUNDATIONS (DECIDE EARLY, DOCUMENT IN `/docs/architecture`)

Before building features, review and, where needed, refactor toward the following. Present the proposed architecture and migration risks to the user before large structural changes.

## 3.1 Typed domain model
- Define a single typed **Deal** aggregate containing: Property, Parties, Transaction, Documents, RentRoll/Leases, OperatingStatements (actual/estimated/budget/pro forma), Assumptions, Scenarios, Comps, Financing, Diligence, Marketing, Activity, and Provenance.
- Use **branded types** or equivalent for Money, Percent, PercentagePoints, Area (SF, acres), AreaBasis (GBA, RSF, USF), Rate (monthly/annual), Date, Period, and Units. Mixing units must be a compile-time or validation-time error.
- Represent **missing** explicitly (`unknown`, `not_applicable`, `confirmed_zero`), never as 0 or empty string.
- Use a decimal library or integer-cent arithmetic for money. Preserve full precision internally, round only at presentation.

## 3.2 Calculation engine
- Pure, deterministic functions in a dedicated module with no UI or storage dependencies.
- Single source of truth per formula. Native underwriting, calculators, Capital Markets, and reports must call the same functions. Duplicate formulas that can silently disagree are a defect.
- Every calculation returns `{ value, unit, inputs[], formulaId, conventionsUsed, warnings[] }` so drill-down and explanations are generated from the real computation, not from separate prose.
- Declare and document conventions (day count, 30/360 vs actual/365, leap-year handling, mid-month vs end-of-month, annualization method, WALT weighting basis), and make them configurable at the deal or workspace level.

## 3.3 Dependency graph (the "Impact Graph")
- Model inputs, derived values, template cells, report fields, and scenario overrides as nodes in a directed acyclic graph.
- On any approved change, compute the set of affected outputs and surface "This change affects: NOI, Cap Rate, DSCR, Loan Proceeds, Firm Template cells B14/B22, OM page 6 table" before the user confirms.
- Detect and block circular dependencies with a clear error.
- Provide an "Explain this number" panel for every material output (inputs, formula, convention, sources, last change).

## 3.4 Event-sourced change history
- Record each material change as an immutable event (who, when, what, old value, new value, reason, source, origin: user/import/AI/template/system).
- Derive the audit log, the Time Machine, undo/redo, and "what changed since I last opened this deal" from this log.

## 3.5 Storage and sync strategy
- Document the current storage layer (local-first) and its limits.
- Design a **local-first architecture with optional cloud sync** (see Part 19), so offline work and local export/restore remain supported after accounts are added.
- Provide a versioned schema with forward migrations and a migration test suite using real exported backups from each prior version.

## 3.6 Extensibility
- Internal plugin interfaces for: document parsers, calculators, template adapters, export formats, data providers (rates/market data), and integrations. Define a stable contract for each so new ones can be added without touching the core.
- Optional authenticated REST API and outbound webhooks (deal stage changed, document approved, scenario applied) for firms that want to connect their own systems. Mark as not implemented until it is.

## 3.7 Performance and reliability budgets
- Opening a deal with 500 rent roll lines: under 1 second interactive on a typical laptop.
- Recalculating the impact graph after a single input change: under 150 ms for typical deals.
- Parsing a 40-page text PDF OM: show incremental progress, never block the UI thread (use workers).
- Large files: streaming/chunked handling, hard limits, graceful failure with a clear message.
- Document measured numbers in the report; do not claim performance without measurement.

---

# PART 4. APPLICATION STRUCTURE AND NAVIGATION

Organize the whole product around clearly defined primary workspaces. Use progressive disclosure. Do not create empty pages or non-functional navigation merely to look bigger. Every nav item must open working functionality or be hidden behind a feature flag.

**Primary navigation (left rail, collapsible):**
1. **Home** (Command Center and Pipeline)
2. **Live Deal** (property and transaction workspace)
3. **Underwriting** (financial underwriting and valuation)
4. **Comps and Market**
5. **Documents** (data room and Document Center)
6. **Tools** (calculator library)
7. **Capital Markets**
8. **Marketing and OM Creation**
9. **Clients and Buyers** (CRM)
10. **Due Diligence and Closing**
11. **Reports and Templates**
12. **Settings and Workspace**

**Global UX elements**
- **Command palette (Cmd/Ctrl+K):** jump to any deal, tool, contact, document, setting, or action ("new scenario", "fill firm template", "export comps").
- **Global search** across deals, documents (indexed text), contacts, tasks, notes, comps.
- **Deal switcher** and "recently opened" strip; breadcrumbs inside deals.
- **Review Queue:** one inbox of everything awaiting a human decision (uncertain extractions, mapping suggestions, conflicts, AI-proposed changes, stale items).
- **Status bar:** save state, sync state, active scenario, active template, data confidence summary.
- **Undo/redo** for all deal edits, backed by the event log.
- **Keyboard-first** navigation with a visible shortcut cheat sheet (`?`).
- **Light, dark, and system themes**, accessible contrast in all of them.
- **Responsive:** desktop primary, tablet functional, mobile Field Mode (Part 14).

---

# PART 5. HOME: COMMAND CENTER AND PIPELINE

Build on the existing dashboard, pipeline, task, contact, activity, and key-date features.

## 5.1 Command Center
- **Today view / Daily Briefing:** key dates in the next 14 days, follow-ups due, documents awaiting review, underwriting needing attention, diligence requests overdue, buyer replies, and stale deals (no activity in N days, configurable). Deterministic rules first. Optional AI-written summary clearly labeled as such, and never the only place information appears.
- **Pipeline:** configurable stages (acquisition, disposition, listing, under contract, closed, lost). Kanban and table views, saved filters, and per-stage required fields and checklists ("stage gates") that the firm can edit.
- **Needs Attention:** incomplete underwriting, unresolved mappings, unverified extractions, expiring listing agreements, missing disclaimers.
- **Recent work** and **pinned deals**.
- **Pipeline analytics:** deals by stage, expected commission by stage and probability, aging by stage, conversion by source. Probability and commission figures are user-entered or rule-based and labeled as estimates.
- **Meetings and tasks** with calendar integration where configured (Part 17.5).
- **Customizable widgets and saved views** per user and per workspace.

## 5.2 Deal Health Score (explainable)
- A transparent checklist-based score (data completeness, verification status, open conflicts, diligence progress, template mapping completeness, pre-flight status). Every point is traceable to a rule the user can view and edit. No opaque "AI score."

---

# PART 6. LIVE DEAL AND OM INTEGRATION

A dedicated property and transaction workspace centered on the OM and all related information.

## 6.1 Workspace contents
OM upload and analysis, property identity (address, APN/parcel, ownership, zoning, year built, site, building), assumptions and key figures, source-linked facts, rent roll and leases, operating statements and history, comps, underwriting and valuation, capital structure, diligence, site visits and media, deal AI assistant, scenarios, communications and activity, exportable summaries.

## 6.2 OM ingestion pipeline
1. Detect file type and structure (text PDF, scanned PDF, images embedded, tables).
2. Extract text, tables, and images with page references. Use OCR only where configured, labeling OCR-derived content.
3. Propose structured fields (price, SF, units, year built, occupancy, NOI, cap rate, tenants, lease terms, rent, expenses, taxes, zoning, parcel info, broker contact) each with: value, unit, source page and quote, confidence, validation status.
4. Run validators (Part 21) for unit, sign, date, magnitude, and cross-field consistency (e.g. price / SF vs stated price per SF; NOI / price vs stated cap rate; sum of rent roll vs stated rent).
5. Present a **Review screen**: accept, edit, reject, or defer each field. Uncertain items go to the Review Queue.
6. Only approved fields are written to the deal. Approved values are never overwritten by a later import without an explicit conflict resolution.

## 6.3 OM Forensics: "Broker Math Check"
Automatically and transparently check the OM against itself and other documents, producing a ranked list of findings, each with evidence, the arithmetic, and a severity. Examples (all must be rule-based and explainable, never speculative accusations):
- Pro forma NOI materially above T-12 or annualized current NOI, with a bridge showing which lines drive the gap.
- Cap rate quoted on pro forma NOI rather than in-place NOI.
- Operating expenses lower than the property's own history, or below reasonable per-SF benchmarks the user has configured.
- Property tax not reassessed for the purchase price in jurisdictions where reassessment on sale occurs (jurisdiction rules are user-configurable data, with the source and date of the rule shown, not assumed).
- Management fee, reserves, or payroll missing or unusually low.
- Rent roll rent above lease abstract rent, or lease expiration inconsistent between documents.
- Free-rent periods, abatements, or concessions not reflected in stated income.
- Occupancy stated as physical vs economic without distinction.
- Tenant concentration, near-term rollover, rollover at above-market rent, co-tenancy, termination options, or go-dark risks.
- Square footage basis inconsistencies (GBA vs RSF vs usable).
- Stated expense recoveries that exceed what the leases allow.
- Price per SF or cap rate versus the user's saved comp set (only when comp data exists).

Each finding offers actions: "Add to underwriting as a conflict," "Create diligence request," "Add to buyer Q&A," "Dismiss with reason."

## 6.4 Conflict resolution
When two documents or sources disagree, show a side-by-side conflict card: values, sources, dates, and effect on key outputs. The user picks a winner or records "unresolved," and the choice is logged.

## 6.5 Ask the Deal
- Cited Q&A across all deal documents, notes, transcripts, and models. Every claim links to a quote and location. If the evidence is absent or conflicting, say so plainly.
- Suggested questions per document type ("Who are the top three tenants and when do their leases expire?").
- Save useful answers as source-linked notes. Answers never modify deal data unless the user converts them into a proposed change that goes through review.

## 6.6 Lease abstraction
- For uploaded leases, propose an abstract: parties, premises, commencement/expiration, base rent and steps, escalations, options (renewal, expansion, termination, purchase, ROFR/ROFO), recoveries and caps, percentage rent, TI and allowances, guaranty, exclusives, co-tenancy, go-dark, assignment/subletting, security deposit, use clause, SNDA/estoppel references.
- Each abstract field links to the clause and page. Unknown fields remain unknown. Abstracts feed the lease engine only after approval.
- Generate an **estoppel and SNDA checklist** from the abstracts.

## 6.7 Site visits and field notes
- Photos with timestamps and optional geotag, condition tags, and annotations.
- Voice notes with transcription (Part 16), checklists by property type, and a structured "observations" list linkable to diligence items and underwriting assumptions (e.g. "roof appears at end of life" creates a capex question, not a number).

## 6.8 Deal timeline
A chronological activity feed combining document events, edits, communications, tasks, meetings, stage changes, and scenario changes, filterable by type and person.

---

# PART 7. FINANCIAL UNDERWRITING AND VALUATION

This is the highest-priority workspace. Support both native models and uploaded firm templates through the shared deal model and transparent mappings.

## 7.1 Native templates
Property-type-specific templates (do not force one logic on all):
- Multifamily
- Retail (single tenant NNN, multi-tenant, shopping center, street retail)
- Office
- Industrial and warehouse
- Mixed-use
- Land and development
- Hospitality, self-storage, medical office, and others only where a reliable model can be defined

Each template defines: description, supported asset type, required and optional inputs, outputs, calculation conventions, version, and changelog. Templates are copy-on-customize: users never edit the shipped original.

## 7.2 Core capabilities (as applicable by asset class)
**Transaction assumptions:** price and pricing guidance, acquisition date, hold period, area measures (GBA, RSF, units, acres, keys, beds), current and stabilized occupancy, asking and market rents, renewal assumptions, closing costs, capex, TI and LC, exit cap and disposition costs.

**Income:** potential rent, contractual rent, market rent and re-leasing, vacancy and credit loss, concessions and free rent, other income, recoveries, effective gross income, historical and projected.

**Expenses:** taxes, insurance, repairs and maintenance, utilities, management fees, payroll and administration, contract services, reserves, other, plus user-defined categories.

**Cash flow:** historical, current year, monthly and annual projections, NOI, capex and leasing costs, unlevered and levered cash flow, sale proceeds, equity contributions and distributions.

**Valuation:** direct cap, comparable sales, DCF, exit-cap sensitivity, value per unit/SF/acre/key, ranges and scenarios, and reconciliation across methods.

**Returns:** levered and unlevered IRR, equity multiple, cash-on-cash, yield on cost, break-even occupancy, DSCR, sensitivity.

## 7.3 Pricing Guidance Studio
- **Football field chart** combining value indications: direct cap on in-place NOI, direct cap on stabilized NOI, DCF range, comp-based range, replacement cost (if provided), and the broker's list price, with each bar linked to its assumptions.
- **Pricing recommendation worksheet:** range, rationale notes, key risks, and supporting exhibits. The tool never outputs a single "AI price." It shows ranges and the assumptions behind them.
- **Broker Opinion of Value generator** that assembles the above into a firm-branded document (Part 13).

## 7.4 Historical vs projected financials
Side-by-side, with separate records for each basis: T-12, prior-year actual, current-year budget, annualized current, broker pro forma, platform underwriting, stabilized, alternate scenarios. Never substitute the broker's pro forma for actuals automatically. Differences are displayed and resolved by the user.

## 7.5 Operating statement normalization
- Import XLSX, CSV, text PDF, and OCR'd scans (labeled).
- **Mapping interface** from source line items to standard categories, preserving original descriptions, supporting custom categories, split lines, and one-to-many mapping.
- Identify missing months, duplicate periods, non-monthly columns, YTD vs monthly mismatches, sign conventions, and subtotal rows vs line rows (avoid double counting subtotals).
- Flag unusual or inconsistent figures (spikes, negative expenses, large one-offs, year-over-year outliers), reconcile totals to the source statement, and separate recurring from nonrecurring and operating from capital **only with user confirmation or strong evidence**, with ambiguous items left as "needs classification."
- Learn from the user's past mappings as **suggestions only** (e.g., "R&M - Plumbing" has been mapped to Repairs and Maintenance in your last 6 deals).
- Export normalized statements to Excel with a mapping sheet.

## 7.6 Tax reassessment and jurisdiction rules (data, not assumptions)
- Provide a **Jurisdiction Rules** data table (reassessment triggers, assessment ratios, tax rates, appeal windows, transfer and recordation taxes). Ship it empty or with clearly dated, cited examples, and require the user to confirm applicable values per deal. Never assume a jurisdiction's rules from memory.

## 7.7 Auditability
For every material number: source document, sheet and cell, PDF page, original row, extraction timestamp, user edits, assumptions, formula or method, validation status, history. Provide drill-down from any output to its inputs. Round for display only. State precision honestly.

## 7.8 Scenario Studio
- Baseline plus branchable scenarios (price, financing, rent, vacancy, expenses, exit cap, hold, capex, rollover, upside, downside, broker case vs independent case).
- Scenarios are isolated until the user applies them. Applying shows a change summary and impact list first.
- **Tornado chart** of the most sensitive assumptions, **two-way sensitivity grids**, **break-even solvers** (price for a target IRR or yield, occupancy for DSCR 1.0, rent for target cap), and scenario comparison tables.
- Optional **Monte Carlo** module, clearly labeled as illustrative, with user-defined distributions and a visible seed for reproducibility. Off by default.
- "Why did this number change?" waterfall between any two scenarios or snapshots.

## 7.9 NOI Bridge and Value Bridge
- Bridge from T-12 NOI to broker pro forma NOI to platform stabilized NOI, line by line.
- Value bridge from broker price to independently modeled value showing which assumptions explain the gap.

---

# PART 8. COMPANY EXCEL TEMPLATES AND THE MAPPING STUDIO

A defining differentiator. Build on the existing XML-based template engine.

## 8.1 Template library
Authorized users upload and register firm-owned XLSX, supported XLSM (macro preservation only where verified), and CSV templates: rent rolls, underwriting models, operating statements, debt sizing, valuation, BOV, investment committee, client reporting, comp sheets.

For each template store: name, description, owner (company/workspace), property type and use case, version and changelog, upload date and uploader, worksheet inventory, named ranges, mapped fields, mapping confidence, known formulas and dependencies, supported outputs, compatibility notes, and validation results.

## 8.2 Workbook inspection
Detect and report: sheet names and visibility, values and formulas, named ranges, merged cells, styles and number formats, row/column labels, tables and data regions, cross-sheet references, hidden sheets, data validations, protection status, external links, macros/VBA presence, array formulas, and volatile functions. Produce an **Inspection Report** with warnings ("This workbook has external links that will not update," "Sheet 'Debt' is protected").

## 8.3 Evidence-based mapping suggestions
- Suggest mappings from standardized deal fields to cells using multiple signals: neighboring labels, header context, number format, data type, named ranges, formula role (input vs calculated), sheet context, and prior approved mappings. Do not rely on text similarity alone.
- Each suggestion shows: source field, destination sheet and cell, proposed value, reason, confidence, whether the cell holds a formula, whether filling is safe.
- Users approve, edit, or reject. Approved mappings can be saved with the template.
- **Input vs output detection:** distinguish cells that should receive inputs from cells that are model outputs, and mark outputs as "read-back" cells used for reconciliation.

## 8.4 Dry run, safe fill, and verification
1. **Dry run** shows an exact cell-by-cell diff (old value, new value, formula status) before anything is written.
2. Fill only approved cells. Never overwrite formulas, locked cells, or unrelated cells without an explicit supported workflow.
3. Preserve formatting, merged ranges, names, validations, conditional formats, and (where supported) VBA. Warn clearly where preservation cannot be guaranteed.
4. Optionally add a change log or audit sheet to the output.
5. **Recalculation verification:** when a spreadsheet engine is available (e.g. headless LibreOffice in a controlled environment), recalculate the filled workbook and read back mapped output cells to compare with the native model. Report three separate states: *filled*, *structurally valid*, *recalculated and reconciled*. Do not claim Excel compatibility beyond what was tested; if real Microsoft Excel was not used, say so.
6. Show unmapped fields, missing inputs, and reconciliation differences.

## 8.5 Template drift detection
When a firm uploads a new version of a template, compare it with the prior version: moved, renamed, inserted, or deleted rows/columns, changed labels, changed formulas. Auto-propose a remapping, flag broken mappings, and require approval. Never silently apply old mappings to a changed layout.

## 8.6 Native vs template reconciliation
Run the native model and the firm's workbook side by side on the same deal data. Show a **Reconciliation Report**: each mapped output (NOI, cap rate, loan proceeds, IRR) from both, the difference, and probable causes (different conventions, rounding, treatment of reserves). The user resolves differences or documents them as intentional.

## 8.7 Template sharing and governance
Workspace-level template library with roles (who can upload, approve, publish). Versioned, with usage statistics ("used on 14 deals") and the ability to deprecate old versions without breaking past deals (deals keep the version they used).

---

# PART 9. RENT ROLL AND LEASE ENGINE

Review the existing implementation first, identify gaps, extend without regression.

## 9.1 Capabilities
Multiple tenants and units; rent types (gross, modified gross, NNN, base year, percentage, ground lease); multiple lease periods and irregular dates; fixed steps; percentage increases; **CPI-linked increases with explicit index assumptions, floors, caps, lag, and base-period rules**; free rent and concessions; renewal and re-leasing assumptions with probabilities; **early termination with explicit notice, date, fee, and cash-flow effect** (not just a flag); options (renewal, expansion, contraction, purchase); reimbursements and recoveries with caps, base years, admin fees, and gross-ups; percentage rent with breakpoints; one-time charges; custom billing periods; market rent assumptions; rollover and downtime; TI and LC; vacant units and lease-up; custom fields.

## 9.2 Outputs
Rent roll summary, lease schedule editor, expiration and rollover schedule (by year and by tenant), tenant concentration (by rent and SF), WALT (by rent, by SF; method named on screen), contract vs market rent, annual and monthly projections, vacancy and lease-up projection, NOI bridge, exportable rent roll, feeds to the native model and firm templates.

## 9.3 Rent definitions (kept distinct everywhere)
Contract rent, market rent, potential rent, billed rent, collected rent, projected rent, effective rent (net of concessions, TI, and LC amortization). Treat vacancy, concessions, reimbursements, and recoveries consistently so nothing is double counted.

## 9.4 Rollover Radar
Visual timeline of lease expirations and option dates with the dollars at risk each year, the leasing cost to re-lease (user assumptions), and a "months of income exposed" figure. Click a tenant to open its abstract and clauses.

## 9.5 Rent roll intake and validation
Import messy rent rolls (XLSX, CSV, text PDF). Detect header rows, subtotals, vacant rows, multi-line units, and repeated headers. Propose column mappings. Validate: overlapping leases on one unit, expiration before commencement, rent per SF vs rent per month confusion, area sum vs building area, occupancy vs rent roll, and duplicate tenants. Reconcile to the OM's stated rent roll.

## 9.6 Known-answer tests
Independent, hand-computed tests (not generated by the code under test) for irregular dates, leap years, partial months, mid-month starts and ends, step boundaries, CPI scenarios, free-rent timing, termination fees, option exercise, and WALT. Store expected results with the calculation worked out in the test comments.

---

# PART 10. COMPS AND MARKET INTELLIGENCE

## 10.1 Sales comps
Records with sale date, price, price per SF/unit/acre, building and land size, characteristics, verified cap rate, occupancy and NOI where available, sale type and context (arm's length, portfolio, sale-leaseback, distressed, 1031), source documents, verification status and verifier, saved comp sets, import from Excel/CSV with mapping, filters, sorting, search, comparison tables, exportable reports, and **map view with radius and polygon selection**.

## 10.2 Adjustment grid
Transparent adjustment grid for location, condition, quality and age, size, lease profile, occupancy, income/expense profile, date of sale, and others. Users enter adjustments with a **required rationale**, see adjusted metrics, and see the adjusted range. Never invent adjustment percentages. Leave unsupported fields unresolved and visible. Optionally compute **paired-sales or regression support from the user's own comps** as an aid, clearly labeled with sample size and limitations, never as an automatic adjustment.

## 10.3 Lease comps
Asking vs executed rent, rent per SF with the area basis, term, commencement, free rent, TI allowance, LC, expense structure and recoveries, renewal options, property and submarket context, source and verification status. Convert to **effective rent** with documented conventions, and keep gross, net, and modified-gross comparisons explicit.

## 10.4 Market intelligence
- User-maintained market notes, submarket statistics tables (user-entered or imported with source and date), and charts.
- **Bring-your-own-data connectors:** import CoStar, Reonomy, or other exports the user has rights to. Do not imply live third-party feeds unless authorized, configured, and tested.
- Public data (e.g. Census, BLS, FRED) may be integrated as optional providers with caching, as-of dates, and source citations, only when actually implemented and tested.
- Every market statistic displays its source and date. Stale statistics (configurable age) are visibly marked.

## 10.5 Comp-to-underwriting links
Selecting comps drives cap rate ranges, price per SF ranges, and rent ranges in underwriting and the Pricing Guidance Studio, with the comp IDs retained as supporting evidence.

---

# PART 11. TOOLS AND CALCULATOR LIBRARY

Retain the existing 30 calculators. Audit each for correctness, organization, and connection to the shared deal model before adding more. Do not duplicate; consolidate where overlap exists.

## 11.1 Categories (expand only where it solves a real workflow)
- **Valuation and underwriting:** direct cap, DCF, cap-rate and NOI sensitivity, purchase price analysis, break-even occupancy, comp-based valuation, price-per-unit tools, **1031 exchange timeline and boot calculator**, **seller net sheet**, **cost segregation estimator (illustrative, clearly labeled)**.
- **Debt and capital markets:** loan sizing (LTV, DSCR, debt yield, constant), amortization, IO vs amortizing, fixed vs floating, refinance, proceeds, sensitivity, fees, **prepayment penalty modeling (yield maintenance, defeasance, step-down) where inputs are provided**, **rate buydown and forward-starting scenarios**.
- **Returns:** IRR, equity multiple, levered vs unlevered, cash-on-cash, waterfalls, pref and promote, hold and exit sensitivity, **XIRR with irregular dates**.
- **Leasing and operations:** effective rent, escalations, free rent, TI/LC, rollover, recoveries and CAM reconciliation, **NNN vs gross conversion**, **rent per SF basis converter (RSF/USF/GBA, monthly/annual)**.
- **Development:** budget, construction loan interest reserve, yield on cost, stabilized value, project cash flow, cost and schedule sensitivity, **land residual analysis**.
- **Transaction economics:** commissions (including tiered and split structures), sale proceeds, closing costs, transfer and recordation taxes (jurisdiction rules as user-confirmed data).
- **Brokerage productivity:** **listing presentation pricing sheet**, **commission split calculator**, **prospect pipeline forecast**.

## 11.2 Tool requirements
Clear labeled inputs with units and sensible defaults, validation and error messages, transparent formulas, meaningful outputs, scenario comparison where applicable, saved assumptions, export (XLSX, PDF, CSV), **optional link to an open deal**, and explicit confirmation before writing anything back to a deal. Material formulas verified against independently computed known answers.

## 11.3 Tool search and favorites
Searchable library, favorites, recently used, and "recommended for this deal" suggestions based on property type and stage (rule-based).

---

# PART 12. DOCUMENT CENTER: STORAGE, CONVERSION, EXTRACTION

## 12.1 Data room
Central storage for OMs, financials, rent rolls, leases, Excel models, legal documents, photos, reports, transcripts, correspondence. Folder templates by property type, tags, version history, status (uploaded, reviewed, approved, superseded), search across indexed text, and previews for PDF, images, Office files, and CSV.

## 12.2 Conversion workflows (only where reliable)
PDF to editable Word; Word to PDF; PDF tables to Excel/CSV; Excel to PDF; Excel to CSV; documents to plain text; text to supported formats; images and scanned PDFs to OCR text; document tables to structured spreadsheets. Do not advertise arbitrary conversions.

**Workflow:** select, detect format and structure, choose output and options, preview where practical, run, download or save to a deal, show warnings and limits. Preserve structure, tables, numbers, and pagination as far as formats allow. Verify row/column relationships for extracted tables. Label OCR output and flag low-confidence cells. **Never silently turn an image-based table into trustworthy-looking financial figures**; show the source image beside extracted values and require review for financial tables.

## 12.3 Four distinct operations (keep separate in code and UI)
1. **Conversion** (format to format)
2. **Extraction** (document to structured fields)
3. **Normalization** (fields to standard categories)
4. **Underwriting** (assumptions and calculations)

A successful conversion proves nothing about accuracy.

## 12.4 Batch and organization
Multi-file processing, naming rules, result packages (ZIP), conversion history with per-file status (success, warning, partial, failed), configurable retention, and automatic cleanup of temporary files.

## 12.5 Upload safety
File size and type limits, content sniffing (not just extension), archive-bomb protection, malware scanning hook, macro handling policy, sanitized filenames, isolated parsing (workers or sandbox), no execution of document content, and clear user-visible retention rules. Sensitive files are not kept longer than documented.

## 12.6 Document diff and redline
Compare two versions of a lease, PSA, OM, or rent roll and highlight changes in text and in key numbers. Useful when the seller updates an OM or the buyer redlines a contract.

## 12.7 PDF tools
Merge, split, reorder, rotate, redact, watermark, stamp "Confidential," page numbering, and extract pages, available as utilities in the Document Center, without claiming legal-grade redaction unless it is verified to remove underlying text.

---

# PART 13. MARKETING, OM CREATION, AND INVESTOR MATERIALS

## 13.1 Deliverables
Offering memorandums, property fact sheets, broker opinions of value, investment highlights, property summaries, historical operating summaries, underwriting summaries, comp exhibits, market overviews, financial tables and charts, diligence summaries, client presentations, investor briefs, marketing packages, **listing proposals and pitch decks**, **teaser/blast emails**, **social posts and listing site copy** (drafts for review).

## 13.2 Firm branding
Upload branded templates with logo, fonts and colors, cover page, disclaimers, standard sections, table formats, chart styles, headers/footers, page numbers, and output formats. Preview before export.

## 13.3 Content integrity
- Populate from verified deal data only. Show an **Evidence Panel** beside each section listing the data points it uses and their verification status.
- AI-generated text is editable, visibly marked as draft, and **cannot be marked "verified"** by the AI. Market claims and investment highlights must cite supporting data or be flagged.
- **Never invent** property facts, tenants, occupancy, comps, market statistics, or results. Missing information is flagged for the broker with a placeholder that blocks export until resolved (see Pre-Flight Gates).
- **Claim Checker:** scan generated text for numeric and factual claims and verify each against deal data, flagging any claim with no source.

## 13.4 Exports
PDF and editable formats (DOCX, PPTX, XLSX where supported), print-ready layouts, and email-ready versions. Embed or attach the exhibit data tables to the underlying Excel.

## 13.5 Pre-Flight Gate (before any export or send)
Automated checklist that must be reviewed: unresolved conflicts, unverified material figures, stale data, unfilled placeholders, missing disclaimers, template mapping issues, comps without sources, and differences between the document and the current model. The user may override with a recorded reason. The gate result is saved with the export.

## 13.6 Distribution and engagement analytics
- Secure share links with expiry, watermark, optional passcode, and NDA/CA click-through gating.
- Track opens, downloads, and time-on-page per recipient (only with disclosed tracking and consent language configurable by the firm).
- Feed engagement into buyer follow-up suggestions ("opened the OM twice, downloaded the rent roll, no reply in 5 days"). Do not claim email tracking beyond what is implemented and tested.

---

# PART 14. FIELD MODE (MOBILE-FIRST SITE VISITS)

- Installable/offline-capable (PWA or equivalent) with local queue and conflict-safe sync.
- Fast capture: photos with auto-label by area (exterior, roof, suite 3, mechanical), voice notes with on-device or server transcription, quick checklists by property type, and tap-to-add observations.
- Observations link to diligence requests and underwriting assumptions as **questions or flags**, not auto-changed numbers.
- Offline tenant and contact lookup, deal summary card, and key numbers cheat sheet for calls with sellers and buyers.
- Optional geofenced "you are at the property" prompt to start a visit log (with explicit location permission and no background tracking).
- Meeting recording and transcription (Part 16) with action-item extraction into the task list.
- Reuse any existing Fieldbook-style site visit logic already in the repository rather than rebuilding it.

---

# PART 15. CAPITAL MARKETS AND DEBT STRUCTURING

## 15.1 Workspace
Debt sizing (LTV, DSCR, debt yield, constant, with the **binding constraint highlighted**), proceeds constraints, rate and amortization assumptions, IO periods, fixed and floating structures (index plus spread with live index inputs, Part 15.4), fees, projected debt service, refinance scenarios, maturity and refinancing risk, equity requirements, alternative financing comparison, capital stack summary, debt and equity return impacts.

## 15.2 Financing comparison
Compare multiple structures on the same deal: bank, life company, agency, CMBS, bridge, seller financing, assumption, and mezzanine or preferred equity (as inputs the user provides). Show proceeds, rate, DSCR, debt yield, IO term, leverage-adjusted returns, prepayment cost, and total cost of capital. **Illustrative assumptions are labeled as illustrative; never present them as lender quotes.**

## 15.3 Lender package builder
Generate a lender-ready package: executive summary, sources and uses, rent roll, T-12, normalized operating statement, loan request, market summary, sponsor profile placeholders, and exhibits, all through Pre-Flight Gates.

## 15.4 Live rates (properly sourced)
- Rates and indices (SOFR, Treasury yields, swap rates where licensed, CPI) must come from a **configured live data provider** with an **as-of timestamp, source name, and fetch status** shown wherever used.
- If no provider is configured or the fetch fails, the field becomes a **user-entered, labeled assumption** with a warning. Never hard-code or silently use remembered values.
- Cache with expiry, show staleness, and let users pin a rate to a deal with the date it was pinned.

## 15.5 Lender CRM
Lender and capital partner records with appetite notes (property types, size range, leverage, geography), contacts, past quotes entered by the user, and a **lender quote tracker** that stores actual terms received (dated, source, expiry) and compares them side by side. Quotes are user-entered facts. No pricing is implied otherwise.

## 15.6 Consistency
Loan calculations come from the same engine as underwriting. No duplicate formulas.

---

# PART 16. LIVE AI AND TRANSCRIPTION

The prior report states AI and transcription were tested only with mock services. **Live validation is an explicit deliverable, not a completed feature.**

## 16.1 Required work
1. Inspect the AI server, client, config, security controls, and setup docs.
2. Make live configuration clear and reliable (a documented setup, health-check screen, and clear errors when keys are missing).
3. Support: OM extraction and review; financial document analysis; document Q&A; source-linked extraction; cross-document reconciliation; meeting and audio transcription (timestamped segments, speaker labels where supported); meeting summaries; action items; property-specific notes; searchable meeting history.
4. Use a real configured AI provider and speech-to-text service. Keep credentials **server-side only**. Never place secrets in frontend code, browser storage, exports, logs, or error messages.
5. Validate authentication, authorization, input limits, rate limits, allowed origins, timeouts, retries with backoff, cost caps, and graceful degradation.
6. Provide a **provider abstraction** so models and vendors can be swapped, and a per-workspace setting for which provider is used and whether any data may leave the workspace.

## 16.2 Accuracy and source verification
- Check every important extracted number against its source where technically possible: value, unit, sign, date, period, and context. A quote appearing in a document does not prove the numeric interpretation is right.
- Keep these categories separate in data and UI: **source text; extracted facts; user-confirmed facts; AI interpretations; calculated results; unresolved discrepancies.**
- **The AI never silently edits underwriting or overwrites an approved value.** It proposes; the user approves.
- Show uncertainty plainly ("two different NOI figures appear on pages 6 and 22").
- Prompt-injection defense: treat document content as data, never as instructions to the model. Test with adversarial documents.

## 16.3 Evaluation harness
Create an **extraction evaluation suite** with a labeled set of representative OMs, rent rolls, and statements (synthetic plus real documents the user supplies and is entitled to use). Measure field-level precision and recall, numeric exactness, citation correctness, and refusal-when-absent behavior. Report scores per document type and track regressions across model or prompt changes.

## 16.4 Honest status
If credentials are missing, finish the safe implementation and mock tests, mark live features "Blocked: credentials," and provide a concrete live-validation plan. Never claim live verification that did not occur.

---

# PART 17. CLIENTS, BUYERS, CRM, AND INTEGRATIONS

## 17.1 Records and relationships
Companies and contacts; owners and entities; buyers and prospects; tenants and representatives; lenders and capital partners; investors; attorneys, accountants, and other participants. Link contacts, companies, properties, and transactions. Custom fields configured by the firm with guardrails to keep the interface consistent.

## 17.2 Buyer Match and Outreach Engine
- **Buyer profiles:** property types, size and price range, geography, return and cap-rate targets, financing preferences, 1031 status and deadlines, entity details, and past purchases (user-entered).
- **Match view:** for any listing, rank buyers by how well their saved criteria fit, showing which criteria match and which do not. Rule-based and explainable.
- **Call and email lists:** generate a call sheet from a selected buyer set, with status per contact, talking points per deal, and the call script (the intern-friendly script pattern: introduce, state purpose, ask about interest and questions, capture next step).
- **Outcome logging:** reached, voicemail, no answer, interested, passing (with reason), requested info, scheduled. Roll results into a per-listing **activity report** shareable with the seller or supervising broker.
- Suggested follow-up cadence and reminders (rule-based, editable), with "do not contact" and consent flags respected.
- Compliance helpers: honor do-not-call and opt-out lists the firm maintains, and record that lists were checked. Do not claim legal compliance.

## 17.3 Offers and Bid Leveler
- Record offers and LOIs with price, deposit, diligence period, financing contingency, closing timeline, credits, assumed debt, escrow terms, buyer qualifications.
- **Normalize and compare** offers on net proceeds, risk-adjusted timing, and contingency strength, with all adjustments user-defined and shown.
- Generate a client-ready offer summary table.

## 17.4 Communication and calendar
Create events from deal activities, associate meetings and transcripts with deals and contacts, link communications, create follow-up tasks, and import supported contacts.

## 17.5 Integrations (only real, documented, authenticated)
Calendar (Google, Microsoft), email (Gmail, Outlook) with explicit OAuth scopes, CRM sync (e.g. Salesforce, HubSpot) via official APIs, and optional e-signature and file storage connectors. For each integration document: scopes requested, data read and written, sync direction, conflict policy, failure handling, and test status. **Never simulate a connected account or claim sync has occurred when it has not.**

---

# PART 18. DUE DILIGENCE AND TRANSACTION MANAGEMENT

## 18.1 Checklists and requests
Configurable checklists by property type and transaction stage covering leases and rent rolls, operating statements, tax and insurance, property condition, environmental, survey and title, zoning, permits and certificates, service contracts, capex history, utilities, financing, and legal/ownership docs. These are organizational aids, not legal, tax, environmental, or engineering advice.

## 18.2 Tracking
Outstanding requests, responsible party, due dates, evidence documents, review status, discrepancies, comments, activity history, and exportable trackers. Distinguish **uploaded**, **reviewed**, and **approved**; never auto-complete an item because a file exists.

## 18.3 Critical dates engine
Contract-driven date calculation: effective date, deposit deadlines, diligence expiration, financing contingency, extension options, closing date, estoppel deadlines, **1031 identification (45-day) and closing (180-day) deadlines**. Business-day and holiday handling configurable and displayed. Always show the rule used; dates are aids to be confirmed against the contract.

## 18.4 Closing workspace
Closing checklist, prorations and credits worksheet (user-entered conventions), funds flow summary, deliverables tracker, and post-closing document archive.

## 18.5 Q&A manager
Buyer questions logged against the deal, assigned, answered with cited sources (Ask the Deal), approved by the broker before release, and shared to all qualified bidders consistently to keep the process fair.

## 18.6 Diligence-to-underwriting links
Diligence findings (e.g., roof replacement quote, environmental recommendation) can generate proposed capex or assumption changes for review, never automatic changes.

---

# PART 19. DATA DURABILITY, WORKSPACES, SECURITY, PRIVACY

The previous report confirms data currently lives on one device with no accounts or sync. Address this deliberately.

## 19.1 Path to company workspaces
User accounts, authentication (with MFA option), company and team membership, role-based permissions, deal-level access control, shared templates and settings, secure document storage, cross-device sync, backups and restore, change history, audit logs, and account/data deletion workflows.

**Do not bolt a shared backend onto the local-storage architecture without first reviewing the data model and migration risks.** Produce a migration plan that preserves existing local deals and gives users a safe export path. Retain local export and restore after cloud features land.

## 19.2 Security requirements
- Server-side authorization on every request. Hidden buttons are not access control.
- Encryption in transit and at rest for stored documents; secrets management; least-privilege service credentials.
- Input validation, output encoding, CSRF/XSS protections, rate limiting, secure session handling, dependency auditing, and security headers.
- Tenant isolation tests (user A cannot read workspace B), role tests, and abuse tests.
- Immutable audit logs for access to sensitive documents and exports.
- **Data retention policy** in plain language, per data type, with user-visible controls and a verified deletion path (including backups and derived data such as search indexes and embeddings).
- PII and confidential-data handling: redaction tools, watermarking, and a "confidential" tag that restricts sharing and AI processing per workspace setting.
- State clearly where data is stored (local, remote, or both) at all times in the UI.

## 19.3 Honesty clause
Do not claim cross-device sync, secure collaboration, SOC 2 readiness, or enterprise readiness until the implementation has been tested and documented. Provide a security review checklist and list known gaps.

---

# PART 20. UI/UX DESIGN STANDARD

Because the prior UI/UX redesign prompt may not be present in this session, **treat the following as the design standard** and, if a prior design document exists in the repository, reconcile with it and report any conflicts.

## 20.1 Design direction
A calm, premium, precise interface suited to financial professionals: generous whitespace, strong typographic hierarchy, restrained color (one accent, semantic status colors), subtle motion with a reduced-motion option, and no decorative clutter, gratuitous gradients, or generic dashboard cards. Zlatura's gold/abundance idea may inform a refined accent (e.g. a muted gold) used sparingly.

## 20.2 Design system
Design tokens (color, type scale, spacing, radius, elevation, motion), component library with documented states (default, hover, focus, active, disabled, loading, error), and a living style guide route. Dense data tables with sticky headers, column resizing and pinning, keyboard navigation, inline editing, and number alignment. Charts with accessible color palettes and direct labels.

## 20.3 Key screens to get right
Home Command Center; the property workspace; the rent roll and lease editor; the underwriting model with live Impact Graph; Mapping Studio; Comps grid and adjustment grid; Scenario Studio; Pricing Guidance football field; Capital Markets; Document Center and conversion workflow; Template library; Review Queue; Field Mode.

## 20.4 Accessibility and responsiveness
WCAG 2.2 AA target: keyboard operability, visible focus, semantic landmarks, ARIA where needed, color-independent status indicators, sufficient contrast in light and dark, screen-reader tested flows, reduced-motion support, scalable text, and accessible data tables and charts (with data table alternatives). Test desktop, tablet, and phone. Verify in Chromium, Firefox, and Safari where available and report any browser not tested.

## 20.5 Progressive disclosure
Advanced options hidden by default but never unreachable. Guided Mode (Pillar 15) overlays explanations, "why this matters" tooltips, and step checklists, toggleable per user.

## 20.6 Microcopy and states
Plain, specific error messages with recovery steps; skeleton and progress states for long operations; confirmations for destructive or write-back actions; empty states that teach the next action; consistent terminology (Actual, Estimate, Assumption, Forecast, Pro forma).

---

# PART 21. ACCURACY, VALIDATION, AND FINANCIAL CONTROLS

Accuracy is the highest priority across all financial work.

## 21.1 Validation layer
Explicit units; currency and date conventions; decimal precision; missing-data handling; source attribution; assumption tracking; formula validation; reconciliation checks; warnings for implausible or inconsistent inputs; clear distinction among actuals, estimates, and projections.

## 21.2 Prohibited behaviors
- Do not convert blank to zero when that changes meaning, and never treat missing as confirmed zero.
- Do not confuse monthly with annual rent, gross with net income, SF with acres, or percent with percentage points.
- Do not mix rentable and gross building area silently.
- Do not double count vacancy, reimbursements, expenses, concessions, or capital costs.
- Do not use a calculator's output to validate that same calculator.
- Do not invent values when an input is ambiguous. Ask.

## 21.3 Plausibility rules (configurable, shown as warnings not blocks)
Cap rate bounds by property type, expense ratio ranges, rent per SF vs submarket entries the user has stored, occupancy over 100%, negative NOI with positive value, price per SF outliers versus saved comps, loan constant vs rate sanity, DSCR below 1.0 flagged, and similar. Thresholds are editable workspace settings, not hidden constants.

## 21.4 Testing the numbers
- **Known-answer tests** computed independently (spreadsheet or hand work documented in the test) for every material formula.
- **Property-based tests** for invariants (e.g. NOI = EGI minus expenses; amortization balance reaches zero; sum of buckets equals total).
- **Differential tests** between native model and firm-template recalculation.
- **Golden-file tests** for exports and template fills.
- **Mutation or fault-injection checks** on core formulas to confirm tests would catch an error.
- Edge cases: partial periods, leap years, negative values where valid, missing data, unusual lease structures, very large and very small deals.
- Distinguish Excel workbook validity from actual Excel recalculation.

## 21.5 Convention registry
A visible registry of every convention the engine uses (day count, annualization, WALT basis, vacancy treatment, reserves treatment). Where two conventions are valid, document the default and allow configuration.

---

# PART 22. IMPLEMENTATION PLAN AND PHASES

Work in deliberate, independently verifiable phases. Adjust order if dependencies require it, explain material changes, and keep scope manageable. **Priority order for value:** (1) underwriting engine + provenance + Impact Graph, (2) firm Excel template Mapping Studio, (3) rent roll and OM ingestion integration, (4) clean UI foundation, then comps, capital markets, marketing, diligence, live AI, workspaces and integrations.

**Phase 0: Audit and baseline.** Repo/branch/commit audit, working tree, test baseline, dependency and security scan, acceptance matrix review, architecture review. Deliver: written baseline report, risk register, proposed architecture changes. No feature code yet except safe refactors with tests.

**Phase 1: Foundations.** Rename to Zlatura with migration; typed deal model and units; calculation engine boundaries; event log; Impact Graph; design system and navigation shell; command palette; Review Queue skeleton. Preserve all existing features.

**Phase 2: Underwriting and documents.** Native underwriting templates; rent roll and lease engine extensions; OM ingestion review flow and OM Forensics; operating statement normalization; Scenario Studio; Pricing Guidance Studio; provenance and drill-down.

**Phase 3: Firm templates.** Mapping Studio, inspection, dry run, safe fill, recalculation verification, drift detection, native-vs-template reconciliation, template governance.

**Phase 4: Comps and capital markets.** Comp workspace, adjustment grid, lease comps; debt sizing and comparison, live-rate provider framework, lender quote tracker; tools library audit and expansion.

**Phase 5: Marketing, diligence, buyers.** Branded deliverables and Claim Checker, Pre-Flight Gates, data room sharing and analytics, due diligence and critical dates, Buyer Match and Outreach Engine, Bid Leveler, Q&A manager.

**Phase 6: Live AI and Field Mode.** Real provider configuration, evaluation harness, Ask the Deal, transcription, Field Mode.

**Phase 7: Workspaces and integrations.** Accounts, permissions, sync, remote backup, audit logs, calendar/email/CRM integrations, retention and deletion.

**Phase 8: Final audit.** UI/UX polish, accessibility, cross-browser, responsive, performance measurement, security review, full regression on the final code, real-document and real-Excel validation plan, deployment and migration checklist.

**Per-phase deliverable:** functionality completed; files and modules changed; tests run with actual results; known bugs and limitations; formulas independently validated; Excel and document compatibility findings; security and storage implications; branch and commit status; deployment status; next recommended work. Commit tested checkpoints on the designated development branch with clear messages.

---

# PART 23. ACCEPTANCE MATRIX AND TRUTHFULNESS STANDARD

Maintain `/docs/acceptance-matrix.md` covering every requested feature in this prompt, with one status per feature:

| Status | Meaning |
|--------|---------|
| Implemented and verified | Built, tested at the level stated, evidence linked |
| Implemented, not fully tested | Built; test gaps listed |
| Tested with synthetic fixtures only | No real-world document or service validation |
| Tested with live services | Real provider calls verified; date and method recorded |
| Blocked | Missing credentials, infrastructure, or access (state exactly what) |
| Partially implemented | What exists and what is missing |
| Not implemented | Not started |

**Rules**
- Run the full regression suite against the **final** code, not a version modified afterward.
- Do not claim success based on mocked services or synthetic documents alone.
- If real credentials, third-party APIs, genuine Microsoft Excel, Safari, or real brokerage files are unavailable, report the limitation and give a concrete validation plan.
- Do not call the platform production-ready while critical data integrity, security, or financial validation work is incomplete.
- Every report ends with: what was verified, what was not, what you assumed, and what you need from the user.

---

# PART 24. STARTING INSTRUCTIONS (DO THIS NOW)

1. Audit the actual repository and confirm the state of the existing 3.2.0 development work. Report branch, latest commit, working tree status, test results, build status, and feature inventory versus the acceptance matrix.
2. Write the baseline report and a proposed architecture and migration plan. Wait for the user's go-ahead before any large structural change or any paid service integration.
3. Then proceed through the phases above, preserving the existing rent roll, template engine, calculators, pipeline, AI review architecture, and other working functionality.
4. Think beyond the obvious. Look for the repetitive tasks that brokers, analysts, capital markets professionals, and transaction teams do every day (cleaning rent rolls, reformatting operating statements, retyping numbers into firm models, chasing documents, building call lists, updating OMs, answering buyer questions, assembling lender packages) and decide which ones Zlatura can simplify, standardize, validate, or automate without compromising accuracy. Propose additional high-value ideas to the user with a short rationale and an effort estimate, but do not build them until approved.

**Final directive.** The goal is not to maximize the number of features. It is to build the most useful, coherent, trustworthy working environment possible for commercial real estate brokerage. A broker should be able to open a property, understand the information, analyze the deal, run scenarios, compare market evidence, populate the firm's own model, prepare client materials, manage diligence, match buyers, and track the transaction without switching between disconnected systems, and trust every number on the screen because they can see where it came from.

Begin with the repository audit, then proceed in tested, documented phases.

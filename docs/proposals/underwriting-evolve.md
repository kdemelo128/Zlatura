# Underwriting EVOLVE: from calculator to underwriting workspace

Designer proposal, 2026-10-30, on main at 4.7.73 (`8207a97`). Docs only:
nothing is built. The owner approves before any PR starts.

**The ask, in one line.** The Underwrite tab should carry a deal from a pile of
due-diligence files to a reviewed, exported underwriting:
Documents → Extraction → Reconciliation → Assumptions → Underwriting and
valuation → Review → Export. Every figure keeps its source document and page,
and nothing missing is invented.

**The answer, in one line.** Most of the pieces already exist as separate
readers, checks and engines. What is missing is the connective tissue: a
per-deal **document registry**, a guided **Start from documents** intake, and
a single **Reconcile** view. Build those three first, then deepen the readers
and the template path. No new library is needed.

## 1. Gap map

Status: **Exists**, **Partial**, **Missing**, or **Planned** (approved
elsewhere, with its item). Evidence is file:line on main `8207a97`.

| # | Capability in the ask | Today | Evidence | Planned / new here |
|---|---|---|---|---|
| 1 | Drop many files at once, each routed by content | Partial | Each reader has its own input. The page-wide drop treats every PDF as a CoStar report (`ui.js:685-693`) | R6 + **P2** |
| 2 | Identify the document type | Partial | `rrdoc.js:35` `docKind` (OM, rent roll, T-12, scanned, unknown) for PDFs; `filekind.js:14` byte sniff; `t12.js:609` `sheetChoices` | D3 registry, **P1** |
| 3 | Rent roll: PDF, XLSX/CSV, scans | Exists | `omroll.js:903`, `rrdoc.js`, `rentrollui.js` `headerAndRows`, `ocr.js` `readScannedPage` | — |
| 4 | T-12: XLSX/CSV/paste; text PDF; scans; `.xls` | Partial | XLSX, CSV and paste exist (`t12.js:586`); text PDF, OCR and `.xls` are not built (PLAN_STATUS 7.5) | 2a PR 5 + R5, PR 6, PR 7 |
| 5 | Budgets and prior-year statements | Partial | Budget and projection sheets are recognised and kept out (`t12.js:598`); a deal holds one `deal.t12` only | **P10** registers them; storing them is a later proposal |
| 6 | OM: figures, statements, rent roll | Exists | `om.js:658` `readOm`, `omstatement.js`, `omroll.js`; page tags per figure (`dealui.js:467`) | — |
| 7 | Leases, amendments, abstracts | Missing | No lease reader; the lease engine takes typed terms (`lease.js`) | D6 (own proposal), master plan 6.6 |
| 8 | Estoppels, SNDAs | Missing | — | D4 |
| 9 | CoStar-type reports and comps | Exists | `costar.js` `loadComps`; the Comps tab; user-exported PDFs only | — |
| 10 | Floor plans, surveys, SF documentation | Missing | No reader. SF basis is checked only as the rent roll's SF against the building's (`reconcile.js:150`, 6.3.10 Partial) | D6 survey; **P5** SF basis |
| 11 | Tax, insurance, utilities, maintenance, capex, financing documents | Missing | `engine/debt.js` exists for loans, but no document reader | D3 (tax bill, Phase I), D5 (insurance, contracts, loan), D6 (PCR); utilities **P10** |
| 12 | Word documents | Planned | Text only, on unmerged branch `claude/documents-hub-d2` | D2 |
| 13 | Scanned images | Partial | OCR for scanned OM and rent roll pages and site photos (`ocr.js`) | T-12 PR 6 |
| 14 | DD checklist per asset class | Missing | Only the site-visit checklist (PLAN_STATUS 18.1) | D3 → **P1** |
| 15 | Per-figure provenance with the document | Partial | `deal.sources[key]` holds page, line and cell (`dealui.js:467`) but not *which* file. The file is one deal-level `deal.source` | **P1** (`sources[key].doc`) |
| 16 | The broker verifies before a figure enters the model | Partial | Failed checks hold figures back (`omstatement.js` `heldFields`, `rrQc`), and "Use the T-12's figures" is a separate step. But a new deal made from an OM fills every read figure straight away (`dealui.js:461-476`) | **P2** stages everything behind "Use" |
| 17 | Fingerprint; "already read on …" | Planned | R3. SHA-256 is already written once, in `researchui.js:28` | Folded into **P1** (decision 1) |
| 18 | What changed since the last version | Partial | `compareRolls` (`reconcile.js:291`) compares two rolls; nothing for a T-12 or an OM | **P4** |
| 19 | Rent roll vs OM | Exists | `crossChecks`, `rentRollQc` (`reconcile.js:150,195`) | — |
| 20 | Rent roll vs T-12; OM vs T-12 | Partial | NOI three ways (`t12ui.js:411`); U7 recoveries counted twice; 4.7.67 free rent and collected rent | **P3** gathers them in one place |
| 21 | Rent roll vs leases vs estoppels | Missing | Needs readers (6.3.6) | D4, D6, then **P3** |
| 22 | Unit mix and rentable vs gross area | Partial | GBA, RSF and usable area are not told apart (6.3.10) | **P5** |
| 23 | Flag missing info, unusual expenses, unsupported assumptions | Partial | `engine/figures.js` RULES; U5, U6, U7; 6.3.1-6.3.12; no configured benchmarks (6.3.3) | **P9** for benchmarks |
| 24 | NOI, cap rate, DSCR, returns | Exists | `deal.js` `analyze`, `irr`, `holdReturns`; `engine/debt.js` `sizeLoan` | — |
| 25 | Normalised NOI | Exists | U1, U2 (`t12.js` `annualized`, normalise) | — |
| 26 | Lease-by-lease cash flow and projections | Planned | — | A1-A10 (approved order) |
| 27 | Vacancy, growth, expenses, capex assumptions | Partial | Rent roll settings and What if | A4-A7 |
| 28 | Financing scenarios | Partial | What if scenarios; debt sizing | E5 (sets), A8 |
| 29 | Sensitivity | Partial | Two-way grids in Tools; no tornado (7.8) | A8, E3 |
| 30 | Valuation | Partial | Direct cap and DCF on the engine; no value bridge (7.9) | A3, A10 |
| 31 | Tax reassessment on sale | Partial | A question only (`assessment`, 6.3.4); no calculation (7.6) | **P8** |
| 32 | Insurance and utility benchmarks | Missing | — | **P9**, warnings only |
| 33 | Review: queue and strict mode | Partial | `review.js:33` queue; strict review U3 (`review.js:95`); no sign-off | **P11** |
| 34 | Audit trail export | Partial | Per-deal History; the template's audit sheet (`template.js:953`) | R2, **P11** |
| 35 | Fill the firm's own Excel template | Exists, with gaps | `template.js`, `libraryui.js:379`; section 2 below | R1, R2, R4, **T1-T5** |
| 36 | Our own template | Exists | `workbook.js`, `rrbook.js` | E1 |
| 37 | A workflow stepper | Missing | W1 is quick underwriting only (`underwrite.js`) | **P12**, once the steps exist |
| 38 | Confidentiality | Exists | `ai.js:30-36` `blockReason`; exports marked (`brief.js:27`) | Every new AI route goes through it |
| 39 | Permissioned data licensing | Partial | Only files the broker exports; no connectors | Platform expansion, behind legal review (owner, 2026-10-29) |
| 40 | Asset-class scale | Partial | `figures.ptype` is free text; `presetFor` falls back to Retail (`rentroll.js:98-105`) | **P1**: an unknown type asks, never defaults |

**In short:** of 40 rows, 9 exist (one with gaps), 20 are partial, 8 are missing and 3 are planned.
The engine, the OM, rent roll and T-12 readers, and the checks are strong.
The weak points are the joins between them: no list of documents per deal,
figures that don't say which file they came from, one-file-at-a-time intake,
and checks spread over four panels.

## 2. The firm-template path

**What `template.js` does today (better than the owner's filler, `uwfiller-note.md`):**
- **Formulas are never overwritten** (`:822`); merged cells are guarded (`:823`).
- **A blank is skipped, never written as 0** (`:824`).
- **Shared-formula copies are counted** (`:643-645`).
- **The dry run lists each cell**, with how many formulas read it (`dependents`, `:630`; `reach`, `:649`).
- **Mapping suggestions** come from single-cell named ranges, then labels (`suggestCellMap`, `:747`).
- **Macros, pivots, external links, connections and slicers are kept byte for byte**, with a warning (`:559-585`).
- **`calcChain` is removed together with its relationship and content-type entry**, and `fullCalcOnLoad` is set (`:915-938`).
- **The audit sheet** lists every write (`:953`).
- **Table fill** stretches Excel tables (`:425`).
- **Tested:** recalculated in LibreOffice in the suite (`tests/e2e/recalc.py`: today's run gave 16 formulas, 0 errors, 0 mismatches); never opened in Microsoft Excel.

**Real gaps, each with a failing case.**

| Gap | Failing case | Fix |
|---|---|---|
| G1. Stale cached results | A filled `B5`; `B7=B6/B5` keeps the blank template's cached value, and a phone preview shows it | R1, built on unmerged `claude/fill-stale-cache`: merge it |
| G2. Array and spill ranges | `{=A1:A3*2}` anchored at `C1`: `C2` has no `<f>` of its own (only the anchor does), so `previewCells` (`:817-825`) writes into it. Excel then reports a broken array or repairs the file | **T1**: skip any cell inside an array `ref` that isn't the anchor; read `t="array"` refs and the `cm` dynamic-array metadata |
| G3. References `refsOf` can't see (`:612`) | Whole columns (`SUM(B:B)`), whole rows, structured references (`Rent[Base]`), 3-D ranges (`Jan:Dec!B5`), and `INDIRECT`/`OFFSET`: "feeds N formulas" is too low, and R1 misses those caches | **T1**: parse the first four. If anything unparseable or volatile is present, R1 clears every cached result in the workbook and says so (blank beats wrong) |
| G4. 1904 date system | `EPOCH` is fixed at 1899-12-30 (`:345`), so a workbook with `workbookPr date1904="1"` gets every date 1,462 days late | **T1**: read `date1904` and shift; test with an invented 1904 workbook |
| G5. Data validation ignored | A list-validated "Property type" cell (Retail, Office, …) gets "Shopping center"; a whole-number cell gets 12.5 | **T1**: read `dataValidations`. The dry run warns, and a value not in a list is skipped with the reason |
| G6. Protected sheets | Locked cells are written anyway, with an info note (`:730`) | **T1**: skip locked cells on a protected sheet unless the broker taps "write anyway" for that cell (decision 4). An *unlocked* cell on a protected sheet is the firm saying "input here", so T2 uses it as a strong signal |
| G7. Structure analysis | Suggestions look only at the first 80 rows × 20 columns (`:695`), skip hidden sheets (`:762`), ignore sheet-scoped names (`localSheetId` dropped, `:728`) and multi-cell names, and use no number-format or formula-role signal (8.3 Partial) | **T2**: scan whole sheets in a worker; label every sheet as inputs, calculations or outputs by formula density and unlocked cells; name and number-format signals; past mappings as suggestions; a cell for every multi-cell name, offered as a table target |
| G8. T-12 into a template | No table kind for a monthly statement | R4 (approved; money note first) |
| G9. Outputs never read back (8.4, 8.6) | The template's NOI and value are never compared with ours | **T3**: the broker opens the filled file in Excel, saves it, and adds it back. Zlatura then reads the mapped *output* cells' fresh cached values and shows template vs Zlatura, line by line, with the difference. No formula evaluator in the app (Prior art) |
| G10. Template drift (8.5) | A new version of the firm's file moves "Purchase Price" from `C8` to `C9`, and the saved mapping writes to the wrong cell | **T4**: a new version re-runs the label and name match against the old mapping; moved cells are shown before any fill |

Kept as they are: external links (kept, warned), macros (never run), pivots
(kept; refresh in Excel). The firm template stays a file the broker loads,
never built in (owner, 2026-10-28). R7 (hide unused rows) stays optional.

## 3. Start from documents: the connective tissue

One flow, on the Underwrite tab ("Start from documents") and on a deal
(Documents → Add files):

1. **Drop or pick files** (several at once). Each one goes through
   `checkUpload` (`filekind.js:82`), then the classifier (section 6.4).
2. **Read** with the reader that already exists: `readOm`, `pdfRollRecord`,
   `importStatement`, OCR for scanned pages. No reader is copied. A file
   with no reader is recorded as received, with its type confirmed by the
   broker. AI reads one only if AI is on and `blocked(scope)` lets it through.
3. **Checklist** for the deal's asset class: found, missing, optional, or
   not applicable with a reason. Each found item shows "n of m checks pass".
   Two rent rolls: the newest as-of date is picked by default, and the other
   is shown as "superseded".
4. **Stage.** Every figure read waits behind a "Use" tap, with
   "Rent roll.pdf, p. 3". Nothing enters the model until it is tapped.
5. **Reconcile** (P3): rent roll vs T-12 vs OM (and vs leases and estoppels
   once read), SF basis, and unit mix. Failed checks are acknowledged before
   the next step (R2).
6. **Make the deal** (owner, 2026-10-28: a deal, not a quick underwriting).
   Then, if the broker wants, **fill the firm template** with the
   open-checks count acknowledged first.

## 4. Additions worth their cost (the owner may not have asked)

Only items with a concrete payoff; each is a PR in section 5.
- **Per-figure provenance with the document** (P1): today "p. 4" doesn't say *of which file*.
- **What changed since the last version** (P4): a new rent roll shows leases added, removed and changed (`compareRolls`, reused); a new T-12 shows the lines that moved by more than the threshold; a new OM shows each figure, old → new.
- **Three-way reconciliation in one view** (P3), every row tapping through to both sources.
- **SF basis and unit mix** (P5): a rent roll's RSF against an OM's GBA is never compared as if like for like. It is labelled, and unit-mix totals are checked against unit count and SF.
- **Tax reassessment on sale** (P8): price × the broker's assessment ratio × the broker's rate, against the T-12's taxes. Both rates are typed and dated; nothing is looked up.
- **Insurance and utility benchmarks** (P9): per SF or per unit, against the broker's own bands and the broker's other deals. Warnings only, and blank bands mean no warning.
- **Reviewer sign-off** (P11): "Reviewed by … on …", tied to a hash of the deal's inputs. It goes stale, with a visible flag, when any input changes after sign-off.
- **Audit trail export** (P11): one CSV or XLSX of every figure, with its value, its source document and page, who used it and when, and the checks that were acknowledged.

Not proposed: a workflow progress bar before the steps have content, AI
"confidence scores" on numbers, and any shipped national benchmark figures
(they would be invented values).

## 5. Build order (one PR each)

Lane A (documents, this proposal) and lane B (the model: A1-A10, W2-W4 and
E1-E5, already approved) touch different files and may each have one PR open
at once. R1 and D2 are built and waiting for merge: merge them first.

| # | PR | Size | Gates | Depends on |
|---|---|---|---|---|
| 1 | **P1 = D3a** registry: `ddtypes.js`, `deal.dd`, `dd-init`, checklist, classifier, the Deal → Documents card; R3 folded in; `sources[key].doc` | L | **data format** (approved 2026-10-29; this note); old-backup fixture | — |
| 2 | **P2 = R6** Start from documents: `intake.js`, the Underwrite card, the drop-routing fix (`ui.js:685`), everything staged | M-L | none beyond P1 (R6 approved) | P1 |
| 3 | **P3** Reconcile view: gathers `crossChecks`, `rentRollQc`, NOI three ways, U7 and 4.7.67, with document links; R2's acknowledgement | M | none (reader only; golden 0) | P1 |
| 4 | **P4** What changed on re-upload; superseded documents | M | none | P1 |
| 5 | 2a PR 5 + R5: T-12 from text PDFs and Word tables | L | parsing note | D2 |
| 6 | **T1** template safety (G2-G6) | M | behaviour change (decision 4) | R1 |
| 7 | **P5** SF basis and unit mix | S-M | financial meaning: designer note | P3 |
| 8 | **D3b** new readers: Phase I age, tax bill; **P8** reassessment | M | money note | P1 |
| 9 | R4 T-12 table kind; **T2** structure analysis | M + M | data format (R4 approved) | T1 |
| 10 | D5 insurance, contracts, loan abstracts; **P9** benchmarks | M | money note; new settings | D3b |
| 11 | **T3** template read-back; **T4** drift | M + S | none | T2 |
| 12 | D4 estoppels and the three-way check; D6 leases (own proposal; a new AI route behind `blocked`) | M / L | money note; AI route = security review | P3 |
| 13 | **P11** reviewer sign-off and audit export | M | **data format** (`deal.review`) | P3 |
| 14 | **P12** the stepper on the Underwrite tab: a view over P1-P11, no new data | S-M | navigation | P11 |
| 15 | **P10** budgets and utilities registered (received and dated only) | S | none | P1 |

Every PR: invented fixtures only, tests that fail on `git archive origin/main`,
mutation checks, `check:full`, axe, 390 px, 150 ms per edit,
character-by-character typing for new inputs, and golden outputs identical
(no PR here changes a computed figure). The support-code check
(`private/support-code/src/`) is run for P3, P5 and D3b and reported in counts.

**Cost.** No paid service and no library. AI is used only for documents no
reader handles, through the firm's server and only when the deal isn't
confidential. App size grows by roughly 30-40 KB of our own code over P1-P4.

## 6. Prior art (capped: 5 searches, 1 registry lookup, 2026-10-30)

| Candidate | What it does | License | Size, last release | Build-free, offline | Network | Security | Verdict |
|---|---|---|---|---|---|---|---|
| [Docling](https://arxiv.org/abs/2408.09869) | Layout model, then TableFormer for table structure | MIT (code); model-weight licences UNVERIFIED | Python and ML models | No | No (runs locally) | Large model weights | **Ideas only**: find the table, then its structure, as two steps (T-12 PR 5) |
| [Unstructured](https://docs.unstructured.io/open-source/concepts/document-elements) | Splits a document into typed elements (Title, Table, NarrativeText) | Apache-2.0 | Python | No | Hosted API optional | OCR dependencies | **Ideas only**: an element type per page block for the classifier |
| [Camelot](https://github.com/camelot-dev/camelot) / pdfplumber | "Lattice" (ruled lines) and "stream" (whitespace) table reading | MIT | Python | No | No | — | **Ideas only**: add lattice from pdf.js's drawn lines; `layout.js` is already stream |
| [Tabula](https://github.com/tabulapdf/tabula) | The same, in Java | MIT | Java | No | No | — | Reject: needs Java |
| [pdf.js-extract](https://www.npmjs.com/package/pdf.js-extract) 1.0.1 | Text with coordinates | MIT | 4.6 MB, 2026-04-19 | Node build | No | Bundles its own pdf.js | **Covered**: `pdftext.js` and `layout.js` on our vendored pdf.js |
| [@formulajs/formulajs](https://www.npmjs.com/package/@formulajs/formulajs) 4.6.1 | Excel functions in JavaScript | MIT | 2.4 MB, 2026-07-28 (bessel, jstat) | Needs bundling | No | — | **Reject**: it would recalculate the firm's model with a second, unverified engine. T3 reads Excel's own results instead |
| [HyperFormula](https://hyperformula.handsontable.com/docs/guide/licensing.html) | Formula engine | **GPLv3** or commercial | — | — | — | — | Reject: licence |

Not checked: the GitHub search API (not used, to stay within the cap). Clean
room: ideas only, and no code copied.

## 7. Decisions for the owner

1. **Fold R3's fingerprint into the registry (P1)**, so there is one schema step, not two, and the SHA-256 lives on the document record. *Recommend yes.*
2. **Documents read through Start from documents are all staged behind "Use"**, including OM figures on a new deal. Today's "drop an OM, get a deal" path stays as it is until a later PR asks to align it. *Recommend yes.*
3. **Checklist presets:** office, retail, retail net lease, multifamily, industrial. A blank or unrecognised property type asks, never defaults to Retail. *Recommend yes.*
4. **Template fill skips locked cells on protected sheets** unless the broker taps "write anyway" on the cell (a behaviour change in T1). *Recommend yes.*
5. **No formula evaluator in the app**; template outputs are compared after the broker's own Excel recalculates (T3). *Recommend yes.*
6. **Tax reassessment uses only the rates the broker types**, dated; the jurisdiction table (7.6) stays later. *Recommend yes.*
7. **Benchmarks are the broker's own bands and other deals, blank by default**; no shipped figures. *Recommend yes.*
8. **Reviewer sign-off (P11) adds `deal.review`** (a data-format change), stale on any input change. Approve the shape at P11's note. *Recommend approving in principle now.*
9. **Lanes:** one documents PR and one model PR may be open at once. *Recommend yes.*

---

## 8. Design note: D3a, the document registry (P1)

**Scope.** It records documents, shows the checklist and links the readers. It
adds no new reader, stores no money and changes no figure.

### 8.1 Data shape (`deal.dd`, stored with the deal, carried by backups)
```
deal.dd = { v: 1, preset: null | 'office'|'retail'|'netlease'|'multifamily'|'industrial',
            na: { [typeId]: { reason: string (1-200), at: ISO } },
            docs: [Doc] }                                   // at most 200 per deal
Doc = { id: 'dd_' + 12 random base36, type: typeId | null,
        typeBy: 'reader' | 'broker' | null,                 // never 'filename'
        name: string (cleaned with `downloadName`'s rules, `kit.js`, ≤ 200), kind: 'pdf'|'xlsx'|'csv'|'docx'|'image'|'text'|'other',
        size: integer bytes, sha256: 64 hex | null, pages: integer | null,
        addedAt: ISO, asOf: 'YYYY-MM-DD' | null,            // as printed; never "today" by default
        status: 'received'|'read'|'reviewed'|'superseded', supersededBy: id | null,
        read: null | { reader: 'om'|'rrpdf'|'rrsheet'|'t12'|'ocr', at: ISO,
                       target: 'omRead'|'rr'|'t12', checks: { pass, warn, fail } },
        note: string (≤ 500) }
deal.sources[key].doc = Doc.id                              // optional; new reads only
```
- **No document bytes**, ever (owner, 2026-10-29). Re-reading means adding
  the file again; the SHA-256 tells the broker "already read on 12 Oct".
- **Extracted values stay where they live today:** `deal.omRead`, `deal.rr`,
  `deal.t12`, `deal.sources`. The Doc points at them (`read.target`), and
  `sources[key].doc` points back. There is no second copy of a figure.
- **The checklist status is derived, not stored**: found = a Doc of that
  type that isn't superseded; n/a = an entry in `na`. Only the broker's
  choices are stored.
- **SHA-256** through `crypto.subtle.digest`. The helper already in
  `researchui.js:28` moves to `app/fingerprint.js`, and both callers use it
  (no second copy). Where `crypto.subtle` is missing (an insecure origin),
  the value is `null`, never a fake.
- **Caps:** 200 Docs. A 201st is refused with a message. `name` and `note`
  are cut at a character boundary (`cutText`).

### 8.2 Migration `dd-init`
- It is a step in `migrate.js` with `field: 'schema'`, `to:` the next free
  number at build time (7 today; nothing on any branch claims 7). It is
  `silent: true`, and `needed: (d) => (d.schema || 0) < N`. `up` sets
  `d.dd = { v: 1, preset: null, na: {}, docs: [] }` only when `d.dd` is
  absent, so a newer `dd` is never overwritten.
- **Old-backup fixture:** `tests/fixtures/backup-4.7.73-before-dd.json`,
  invented, made by 4.7.73. It restores with an empty `dd`, and every figure its deals show is
  unchanged. A backup with `schema` above N is refused
  as "made by a newer version", as today.
- History records add, remove, retype, n/a and supersede, each with Undo
  (`diffDeal` covers `dd`, because it is plain data).

### 8.3 Types and checklists (`app/ddtypes.js`, pure, frozen)
- **Each type:** `{ id, label, reader | null, content: [regex], name: [regex], classes }`.
- **The 22 types:**
  - om, rentroll, t12, budget, priorStmt, lease, amendment, estoppel, snda,
    guaranty, title, survey, esa1, pcr, appraisal, taxbill, insurance,
    utilities, contract, loan, zoningCo, areaCert (BOMA or architect's SF);
  - plus retail-only cam, tenantSales and rea, and multifamily-only unitMix
    and receivables.
- **Required (R) and optional (O) by preset:**

| Type | Office | Retail | Net lease | Multifamily | Industrial |
|---|---|---|---|---|---|
| rentroll, taxbill, insurance, title, survey, esa1, zoningCo | R | R | R | R | R |
| t12 | R | R | O (tenant pays all) | R | R |
| lease, estoppel | R | R | R | O (sample leases) | R |
| snda, cam, areaCert | R | R | O | — | O |
| guaranty | O | O | R | — | O |
| pcr, contract, appraisal, loan, budget, priorStmt, om | O | O | O | O | O |
| tenantSales, rea | — | R if a lease has percentage rent or co-tenancy, else O | O | — | — |
| unitMix, receivables, utilities | — | — | — | R | O (utilities) |

- **The preset** comes from `figures.ptype` by `presetFor`'s patterns, but
  *without* the Retail fallback: blank or unrecognised gives `preset: null`
  and a one-tap question ("What kind of property is this?"). Net lease is
  never guessed from a single tenant: the broker picks it.
- **Mixed use** shows the union, labelled. The required list is advice: it
  never blocks a figure.

### 8.4 Classification (ambiguity asks; content beats the file name)
1. `checkUpload` gives the kind from the bytes; a refusal is shown with
   `role="alert"`, and a Doc can still be recorded as "received, can't be
   read here".
2. **The reader decides** for the three it knows:
   - a PDF goes to `docKind` (`rrdoc.js:35`);
   - a workbook or CSV goes to `t12.layoutOf` (month columns) and
     `rentrollui.headerAndRows` (rent roll columns). Both matching means ask.
   - A type is `typeBy: 'reader'` only when the reader accepts the file.
3. **Other types are scored** with `content` patterns on the first three
   pages of text: "ALTA/NSPS", "E1527", "subordination, non-disturbance",
   "ACORD", "estoppel certificate", and so on. If the top score is below 2,
   or within 1 of the second, the result is "What is this?" with the top
   three types, and no type is set. A file-name match only pre-selects a
   choice in that question; it never sets a type alone.
4. **Scanned pages** are offered on-device OCR (`ocr.js`) and then
   re-classified. AI is a separate tap, shown only when AI is on, and sent
   only when `blocked({ deal })` returns null (`ai.js:59`). A confidential
   deal sends nothing, and the button says why.
5. **The same SHA-256** already in this deal gives "already added on …"
   (not added twice). In another deal it gives "also in Deal X", shown on
   the device only.

### 8.5 UI (phone first, uncluttered)
- **Deal page → "Documents" card**, collapsed by default. Its heading reads
  "Documents · 6 of 11 required". It is a module in the addendum's sense:
  hideable, and still reachable through search. Until the module switch
  ships, its collapsed state is kept in `ui.prefs`.
- **Open card:** three groups (Missing, Found, Optional or n/a). Each row is
  44 px: the type, the file name, an "as of" date, a status chip, and
  "n of m checks pass". Tapping a row opens the reader's existing panel
  (Data QC, T-12 card, rent roll workspace), so no new viewer is built.
- **Actions:** "Add files" (an input with `multiple`, and its own drop zone);
  on a Missing row, "Not applicable…" with a required reason; on a Found
  row, "Change type", "Mark reviewed" and "Remove from list" (with Undo).
- **Tools → Documents → Due diligence** shows the same card for a chosen
  deal (documents-hub section 1). The Underwrite tab's card is P2.
- **Accessibility:** a list with headings; status in text, not colour
  alone; changes announced with `aria-live`; axe at 390 px.

### 8.6 Money and blank rules
- D3a stores no money. Counts and sizes are integers; `pages` and `asOf`
  are `null` when unknown, never 0 or today.
- A type that isn't known is `null`, never "other". A missing required
  document is "missing", never assumed received.

### 8.7 Tests (invented fixtures; each fails on `git archive origin/main`)
- **`dd.test.js`:**
  - the type table is frozen and its ids are unique;
  - every preset names only known ids;
  - `presetFor`-without-fallback gives null for "" and "Self storage";
  - SHA-256 vectors ("abc" gives `ba7816bf…`), and null without `crypto.subtle`;
  - the caps (the 201st Doc, a 501-character note);
  - n/a without a reason is refused.
- **Property tests** (fast-check, as in #75):
  - a random file name never sets `typeBy`;
  - for random content, `typeBy: 'reader'` only when the reader accepts;
  - close scores always ask.
- **`migrate.test.js`:**
  - the new fixture restores with `dd` empty and round-trips byte-equal
    after a save;
  - an existing `dd` is untouched;
  - a schema N+1 backup is refused.
- **`dd-flow`** (Chromium and iPhone size):
  - add an invented rent roll PDF (`tests/rr-fixtures.js`) and an invented
    T-12 CSV, giving 2 found;
  - mark the survey n/a with a reason, then Undo;
  - the same file twice gives "already added";
  - a backup round trip;
  - a confidential deal's AI button is disabled with its reason, and no
    fetch is made;
  - axe; typing in the reason field key by key; 150 ms per edit with 200 Docs.
- **Mutations:**
  - the file name sets the type;
  - the Retail fallback restored;
  - the hash truncated;
  - `dd` dropped by backup;
  - `asOf` defaulting to today;
  - n/a accepted blank;
  - `blocked` skipped.
- **Golden:** both checks identical (D3a computes nothing).

### 8.8 What D3a does not do
It adds no new reader (D3b), no staging change (P2), no reconciliation
(P3), and no AI route.

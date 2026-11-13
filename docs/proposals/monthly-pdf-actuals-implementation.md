# Next reader slice: complete monthly actual text PDFs

Implementation of the already approved T-12 multi-format and source-actual rules. Status: **Tested with synthetic fixtures only**. Not released; the full regression and real-file evaluation remain pending. Synced with main 4.7.145 (`cd2d69a`); the PM follow-up and OM routing work remain separate.

Reuse the approved T-12 multi-format design and #156 source-actual rules. Add a single-page monthly candidate to `pdfStatementChoices`, preserving annual candidate behavior and IDs. Reuse positioned `statementTables`, `monthOf`, `layoutOf`, `numberFormatOf` and `importStatement`; retain the current preview, separate Use, source/Undo and saved monthly shape. No new dependency, schema or money engine.

First slice: exactly twelve distinct consecutive explicitly dated month columns, explicit actual basis, and all months completed before the device's current month. No guessed years or monthly values. An optional printed total goes through existing arithmetic QC. Reject model/budget/annualized/pro-forma, per-unit/per-SF/percent columns, current/future/partial/duplicate/gapped months, missing or dash amounts, conflicting scale/currency, scans and split-page layouts. Printed zeros remain zeros. Keep ambiguous number-format choice before parsing; scale every monthly value once through the existing cents helper.

Implementation scope: `app/pdfstatement.js`, user copy/choice labels in `app/t12ui.js`, existing automatic intake route in `ddintake.js` and its reason in `intake.js`, synthetic fixtures/unit/browser flow. Avoid native Underwrite, redesign and assistant files. Start a fresh branch from then-current main, not the unmerged PM branch.

Before coding: check actual month labels in positioned column own/group fields; plain `column.label` can include a group such as Actual. Preserve explicit basis per column and do not mistake an adjacent budget column for actual. Use the existing monthly date parser rather than duplicating it. A completed current-year T-12 ending last month differs from the annual adapter's prior-year-only constraint and must be explained in the design.

Evidence needed: actual positioned PDF, exact twelve month values and hand-worked totals, optional total mismatch retained as failed QC, all hold cases, annual behavior unchanged, no pre-Use storage, Cancel, distinct replacement, source and durable Undo/reload at phone/desktop widths. Archived-main failure, focused guard mutations, type/golden and full gate. Real PDFs, Safari/iPhone and Excel remain separate validation.

Prior art is the existing project code recorded in #156: positioned `omstatement.js` (MIT), `t12.js` (MIT), vendored PDF.js 4.7.76 (Apache-2.0). All are already shipped and work offline. No external adoption is proposed; no package, model or network destination is added. The private support code is unavailable and was not read or guessed.


| Existing candidate | Licence / size | Maintenance | Build-free / offline | Network or telemetry | Security notes | Decision |
|---|---|---|---|---|---|---|
| `t12.js`: months, formats, categories, QC | Project MIT; about 114 KB source, already shipped | Current main | Both | None | Missing/ambiguous fields retain the existing review path | Reuse; one financial engine |
| `omstatement.js` / `layout.js`: positioned financial tables | Project MIT; about 41 KB statement source, already shipped | Current main | Both | None | Unclear units/periods and ambiguous currency cells remain held | Adapt the existing parser |
| PDF.js 4.7.76: PDF text and geometry | Apache-2.0; about 381 KB entry plus existing worker | Existing pinned dependency; no upgrade | Both | Site-local worker only | Existing upload/page caps; unchanged third-party inventory | Reuse; no dependency added |


## Review and focused evidence

The positioned test PDF exposed two shared parsing gaps: label words in a larger font were separated into columns, and tightly set currency cells could remain joined. Gap classification now uses the neighboring font widths and the financial adapter uses existing geometry to retain complete positive dollar amounts. A follow-up review caught contiguous currency ranges split into signed PDF fragments; the fallback now refuses those. Unsplit repeated-currency text is also refused instead of allowing the number parser to remove currency symbols and join values. No signs, ranges, partial numbers or digit fragments are inferred as separate amounts.

Review also caught a monthly comparison hiding an independently eligible annual column. Eligible explicit annual actual columns remain available; monthly columns never enter that annual route. Printed month headings use the existing month parser with exact month names and real calendar-day validation. Scale is applied to every monthly cell exactly once before the existing cents rule; format ambiguities still ask first.

- The focused monthly, layout, annual PDF and OM statement tests pass (74 tests). Hand-worked totals, 12 varying monthly values, printed zero versus blank, no total, total mismatch QC, rolling dates, number-format choice, scaling and unsafe periods/units are covered.
- Current browser flow passes all 38 assertions at phone and desktop widths, including preview, separate Use/Cancel, durable Undo/reload, source, axe and no outside requests. The selected-flow runner exits zero; its generated-workbook LibreOffice checks report no errors/mismatches. This is not the full browser suite or Microsoft Excel.
- The final new monthly/layout unit files run against archived main `cd2d69a`: 14 fail, 10 pass. Failures include the actual positioned PDF and missing monthly support, while pre-existing annual behavior and held-input cases remain separate regression coverage.
- Fourteen focused mutations are detected: month count/order, completed period, explicit actual basis, blank month, conflicting scales, scale once, printed month name, calendar day, annual-column retention, number-format choice, positive-only fragment splitting, unsplit repeated-currency refusal and local font spacing.
- The full gate is not yet complete. Real PDFs, Safari, a physical phone and Microsoft Excel are untested. The shared local scoreboard currently lacks a PDF-T-12 extraction adapter; do not claim gains on the owner's 1,005 files from these synthetic tests.

No private support code was available, read or inferred. The existing PDF source metadata and T-12 saved shape are reused; no migration, source schema, money formula, dependency, model or network destination is added.

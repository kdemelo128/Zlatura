# Reader work split and current interfaces

Owner's latest split: Codex owns content/page/sheet routing, OM/rent-roll/statement readers and one-candidate read-with-preview. Claude owns `tests/corpus/`, the shared scoreboard/tooling, public samples, automatic OCR, Word, macro/ZIP handling, new small readers, native tool/Model and assistant. Do not duplicate those areas. Baseline: `.evolve/EVALS.md`, 1,005 owner-side files, 310 accepted, zero answer sheets; acceptance is not field accuracy.

Current Codex branches:

- `codex/om-page-classification`: `pdfPageProfiles(pages, { layouts, roll?, tables? })` in `app/pdfprofile.js`, also returned transiently as `readOm(...).pageProfiles` and `docKind(...).pageProfiles`. One record per original PDF page: `page`, `kind`, `roles`, `rentRollRows`, `statementTables`, `needsOcr`, `reasons`. Roles are rentroll/statement/summary/unreadable/other; mixed pages retain all roles. Unreadable does not assert photo versus scan. No new saved field. A confirmed OM rent-roll section no longer causes the whole file to be asked as OM versus lease/rent roll; explicit BOV/appraisal ambiguity remains held. Late titles and joined header words are covered.
- `codex/monthly-pdf-statements`: draft complete twelve-month actual PDF adapter through the shared T-12 engine. Exact months, completed periods, independent totals, missing/ambiguous values held, original source and Undo. Mixed-font word gaps and tight currency cells retain their positions. No new schema/engine/library. Browser verification in progress.
- `codex/pm-rentroll-coverage`: additive report-metadata/tenant-text fixes on main's PM reader; preserves base/period questions and separate filtered replacement confirmation. 66 reader/profile unit tests, 48 browser checks and seven mutations passed. Full-gate candidate is blocked/interrupted below; it is not a green release.

OM page branch evidence: 107 focused tests pass, quick/type/golden pass (646 displayed figures, zero changed), 18 phone/desktop browser checks pass. Existing reader APIs fail five of six targeted regression checks on archived main `6744a20`; the new code passes all six. Real owner files remain on the owner's device.

Shared-gate observations for Claude's test-bench work (Node 22, official Playwright Chromium 141, serial/quiet):

- On unchanged main `6744a20`, `mobile-audit` fails on the native software-WebGL fallback deprecation note; `home-tool-flow` fails because its pre-hover measurement catches the 200 ms unhover transition; `comps-import-flow` fails axe target-size for the phone Preview checkbox. All three were reproduced with the original app/tests served separately. Keep real console errors and accessibility checks active.
- On the coverage candidate, `workflows` also recorded a cancelled local Public Sans font request; `uw-embed-flow`'s stand-in comparer differed in styles/pixels and policy diagnostics; `uwtool-flow` recorded the same native renderer note. Those latter failures are candidate observations, not yet separately proved on main. No tool source or security alert is changed here.
- Alert 26 is Claude's, fixed on main `81128b8`; alerts 23–25 were already fixed. Codex did not redo them.

Next reader work: bind each accepted workbook sheet to its own route/preview; remove the document-type question only for one supported content candidate; keep period/unit/source conflicts as questions. Existing `intake.stage` already offers both workbook readers, so extend that path rather than rebuilding it. `useDocuments` currently imports T-12s but only attaches OM/rent-roll documents; connect actual importer previews as a separate controlled change. Do not count attaching a file as proving financial values.

Score every reader change with the shared scoreboard. Its current PDF T-12 field extraction adapter needs to use `pdfStatementChoices`/`statementFromPdfChoice`; never choose arbitrarily among eligible years. The private 1,005-file collection is unavailable here, so owner-side reruns are still required. No private files were read or copied, and no real figures/names are in these tests.

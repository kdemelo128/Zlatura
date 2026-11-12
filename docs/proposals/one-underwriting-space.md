# One underwriting space (proposal, not built)

Answers the owner's asks of 2026-11-12. No outside code is proposed, so there is no prior-art table.

## A. Where the tool's code lives from now on

**Decision: the cleaned `app/uwtool/` becomes the maintained copy. The importer is retired.** It already needs 60
exact-match edits; every screen improvement would add more. What stays: the `LICENSE` (all rights reserved), the deny-list and base64 guard (`tests/uwtool-guard.test.js`). The
manifest-hash check is replaced by a new test that fails if the tool ever calls an outside address, stores a key, or
loses its content policy. A future package version is compared by hand and brought in as reviewed PRs.

## B. One space, four steps

Quick underwrite's parts move into the tool's four steps. The view switch goes in the last release.

| Today | After |
|---|---|
| Quick underwrite card (price, NOI, loan, instant answer from the app's engine) | Model step, "Quick check" panel at the top; works with no files |
| Saved quick underwritings on this device | Projects list (see D), each one a project with no deal |
| Save as deal, with Undo | Project menu, same Undo |
| Start from documents (intake) | Files step |
| Calculators link and workspace tool buttons | Model step, "Calculators" row |
| Firm template pack (hidden zip fallback) | Export step, "Company template" |
| Bring into deal, Back, "Not carried over" note | Unchanged bar; the note also shows in Review |

## C. One reader

Files dropped in the tool go to the app's readers (`sheetread.js`, `intake.js`, rent roll, T-12, PDF and OM readers)
and the app's review queue. Replaced in the tool (fieldmap section 8): `Pipeline.readFile`,
`Pipeline.pdfPages`, the `Tabular`/`PdfText` calls inside them, `builtInRead` and `ocrDocument`. A new small adapter
converts the app's confirmed results into the tool's `doc.rr.units` and `doc.st`.

Adapter rules, each tested:
- blank stays blank, never zero;
- monthly or annual, per SF or per unit: only as the review queue confirmed; otherwise the file stays "needs review"
  and the tool gets nothing;
- statement lines stay in whole cents.

The tool's own parsers are no longer used for dropped files; they are removed after one release.

**Money:** the tool's finance code (`finance.js`) stays a separate calculator for now. It never writes a saved-deal
result; "Bring into deal" carries inputs only, and the deal's figures come from the app's engine as today, so the
golden outputs do not change. A cross-check panel shows the tool's NOI, value and debt service beside the engine's and
flags any gap over $1. It corrects neither side. Merging the two is a later proposal.

## D. One tool project per deal

Today the tool keeps one browser project (`uw-v3`). After: projects stored with the app's data, one per deal plus
unfiled ones, in backups. The migration (`app/migrate.js`, with an old-backup test) turns the current
project and each saved quick underwriting into unfiled projects; nothing is deleted. Opening a deal opens its
project; deal values fill blank fields only; any field can be typed over.

A **confidential deal's** project is stored and backed up like any other, marked. It is never sent
to AI, its exports carry "CONFIDENTIAL" on every sheet, and it never shows in the unfiled list.

## E. One Export step

Three choices:
1. **Tool workbook**: the tool's own model file.
2. **App workbook**: the app's comp workbook, CSV and print sheet (`exporters.js`).
3. **Company template**: your or a client's own file filled in place with the design kept (`template.js`), including
   the firm pack.

Document figures reach Excel only after review, with their source file and page.

## F. Build order

| # | Release | Saved data or financial meaning? | Test idea |
|---|---|---|---|
| 1 | Tool becomes the maintained copy; new outside-call test | No | Planting an outside call or a deny-listed stand-in term makes the guard fail |
| 2 | Clearer Choose your next move, analyst toolkit and advanced scenarios (grouped, larger buttons, plain headings) | No | axe, phone-size tap targets, golden unchanged |
| 3 | Quick check, calculators and Save as deal inside the Model step | No | The old Quick underwrite flow done end to end in the new place |
| 4 | One reader and the adapter | **Yes, financial meaning (units)** | Invented rent rolls: monthly vs annual, blank cells, unconfirmed basis; each fails on the old code |
| 5 | Per-deal projects and migration | **Yes, saved data** | Old-backup fixture restores into unfiled projects with nothing lost |
| 6 | Export step with three choices; cross-check panel | No | Invented deal gives all three files; a planted $2 gap shows the flag |
| 7 | Switch removed | No | Every table B row reached in the browser suite |

Cost: no new services or libraries; Opus review for releases 4 and 5 only.

## G. Questions for the owner

1. Maintain the cleaned copy and stop regenerating? *Recommended: yes.*
2. Turn the current tool project and saved quick underwritings into unfiled projects? *Recommended: yes, nothing
   deleted.*
3. When the tool and the engine disagree, which is the deal's figure? *Recommended: the engine; the tool's figure is
   shown with the flag.*
4. Confidential deals: keep their tool projects on the device and in backups, marked? *Recommended: yes, never sent
   to AI.*

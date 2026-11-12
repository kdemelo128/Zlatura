# One underwriting space (proposal, not built)

Owner's asks of 2026-11-12: one space instead of the tool plus Quick underwrite, nothing lost; the app's own reader and
Excel code; full link to the open deal with manual override; easier tool screens; one tool project per deal; ask, never
guess. No outside code is proposed, so there is no prior-art table.

## A. Where the tool's code lives from now on

**Decision: the cleaned `app/uwtool/` becomes the maintained copy. The importer is retired.** It already needs 60
exact-match edits, and every screen improvement you want would add more, each one breaking when the package changes.
What stays: the `LICENSE` (all rights reserved), the deny-list and base64 guard (`tests/uwtool-guard.test.js`). The
manifest-hash check is replaced by a new test that fails if the tool ever calls an outside address, stores a key, or
loses its content policy (today those are importer edits; they become checks). If you later send a new package
version, the designer compares it by hand and brings changes in as normal reviewed PRs.

## B. One space, four steps

The tool's four steps stay; Quick underwrite's parts move into them. The view switch stays until the last release,
then goes.

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
and the app's review queue. In the tool these are replaced (fieldmap section 8): `Pipeline.readFile`,
`Pipeline.pdfPages`, the `Tabular`/`PdfText` calls inside them, `builtInRead` and `ocrDocument`. A new small adapter
converts the app's confirmed results into the tool's `doc.rr.units` and `doc.st`.

Rules the adapter keeps, each with a test:
- blank stays blank, never zero;
- monthly or annual, and per SF or per unit, are taken only from what the review queue confirmed; if unconfirmed, the
  file stays "needs review" and the tool gets nothing from it;
- statement lines stay in whole cents.

The tool's own parsers are no longer reached from a file drop. They remain in the code for one release as a
comparison, then are removed.

**Money:** the tool's finance code (`finance.js`) stays a separate calculator for now. It never writes a saved-deal
result; "Bring into deal" carries inputs only, and the deal's figures come from the app's engine as today, so the
golden outputs do not change. A cross-check panel shows the tool's NOI, value and debt service next to the engine's for
the same inputs and flags any gap over $1. It never corrects either side. Merging the two calculators is a later,
separate proposal.

## D. One tool project per deal

Today the tool keeps one project in the browser (`uw-v3`). After: projects stored with the app's data, one per deal
plus unfiled ones, included in backups. The migration (`app/migrate.js`, with an old-backup test) turns the current
project and each saved quick underwriting into unfiled projects; nothing is deleted. Opening a deal opens its project;
deal values still fill blank fields only, and any field can be typed over.

A **confidential deal's** project is stored and backed up like any other but carries the deal's mark. It is never sent
to any AI feature, its exports carry "CONFIDENTIAL" on every sheet, and it never shows in the unfiled list.

## E. One Export step

Three clear choices, each saying what it holds:
1. **Tool workbook**: the tool's own model file.
2. **App workbook**: the app's comp workbook, CSV and print sheet (`exporters.js`).
3. **Company template**: your or a client's own file filled in place with the design kept (`template.js`), including
   the firm pack.

Figures from documents reach Excel only after review, each with its source file and page.

## F. Build order

| # | Release | Saved data or financial meaning? | Test idea |
|---|---|---|---|
| 1 | Tool becomes the maintained copy; new outside-call test | No | Planting an outside call or a deny-listed stand-in term makes the guard fail |
| 2 | Clearer screens: Choose your next move, analyst toolkit, advanced scenarios (grouped, larger buttons, plain headings) | No | axe, phone-size tap targets, golden unchanged |
| 3 | Quick check, calculators and Save as deal inside the Model step | No | The old Quick underwrite flow done end to end in the new place |
| 4 | One reader and the adapter | **Yes, financial meaning (units)** | Invented rent rolls: monthly vs annual, blank cells, unconfirmed basis; each fails on the old code |
| 5 | Per-deal projects and migration | **Yes, saved data** | Old-backup fixture restores into unfiled projects with nothing lost |
| 6 | Export step with three choices; cross-check panel | No | Invented deal gives all three files; a planted $2 gap shows the flag |
| 7 | Switch removed | No | Every row of table B reached in the browser suite |

Cost: no new services or libraries; Opus review for releases 4 and 5 only.

## G. Questions for the owner

1. Make the cleaned copy the maintained source and stop regenerating? *Recommended: yes.*
2. Turn the current tool project and saved quick underwritings into unfiled projects? *Recommended: yes, nothing
   deleted.*
3. When the tool and the engine disagree, which is the deal's figure? *Recommended: the engine; the tool's figure is
   shown with the flag.*
4. Confidential deals: keep their tool projects on the device and in backups, marked? *Recommended: yes, never sent
   to AI.*

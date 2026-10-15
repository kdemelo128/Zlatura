# T-12 import from any statement format (Part 2a)

Status: **proposal, waiting for the owner's approval.** Nothing here is built.
It extends the 4.7.0 T-12 import (`t12-review-queue.md`) and reuses the Data
QC parts (`data-qc.md`) and the OM statement reader (`om-statement.md`). It
applies the owner's answers of 2026-10-14: remembered labels become
suggestions that need confirming; capex-type lines are suggested below the
line, never moved automatically; money is kept to whole cents, and display
rounding is separate.

## 1. What exists (4.7.5), and what is reused

- `app/t12.js` (pure) reads rows of cells into a statement. It finds the
  months, the label and account columns, the sections and the subtotals;
  makes the signs consistent; files each line in one of the 21 categories;
  and works out NOI. `statementChecks` is the one copy of the arithmetic, and
  the OM reader already uses it. **Every new format ends as rows going
  through `readStatement`**, so there is still one reader and one copy of the
  math.
- `app/t12ui.js`: the T-12 card, NOI three ways, "Every line", and "Use the
  T-12's figures" with Undo. `app/t12labels.js`: remembered labels (kv
  `t12.labels`). `app/sheetread.js`: ExcelJS and CSV cells.
- `app/omstatement.js` finds tables on PDF pages by position. `app/ocr.js`
  reads a scanned page with tesseract.js 7 (vendored, loaded only when
  asked).
- `app/dataqc.js` and `dataqcui.js` draw the Data QC panel, and
  `app/review.js` gives the Review Queue.
- Kept as they are: the 21 categories, the 2% and 5% NOI thresholds
  (`engine/conventions.js`), and "Use the T-12's figures" with Undo.

**Four 4.7.5 behaviours this changes.** Each gets a test that fails on 4.7.5.

1. A blank month cell is read as $0 (`app/t12.js:223`), so a missing month
   looks like a month with no income or cost.
2. Of several sheets, the one with the most lines is taken without asking
   (`bestSheet`). A "Budget 2027" sheet with more lines than the actuals is
   read as the T-12.
3. Two things go against the owner's answers:
   - a remembered label is applied as "your choice" (`t12.js:76`);
   - a capex-type line under expenses is moved below the line by its wording
     (`t12.js:85`).
4. **"Use the T-12's figures" on a six-month statement writes six months of
   NOI into the deal's annual NOI** (`t12ui.js:243–256`). Value and cap rate
   then rest on half a year (Part 21.2). See decision 6.

## 2. Formats

Every format is read in the browser, with no build step. Each file is checked
by its first bytes, not its name. The file itself is never stored: the deal
keeps the lines, as it does today.

| Format | How it is read | Reading confidence and label |
|---|---|---|
| `.xlsx` | ExcelJS 4.4.0 (vendored, MIT), as today | High · "Excel · T12!C14" |
| `.xlsm` | ExcelJS, macros ignored, never run. Checked here in Node on an invented `.xlsm` with a macro part; the template library already accepts `.xlsm`. | High · "Excel with macros (not run)" |
| `.xls` (97–2003) | SheetJS Community Edition 0.20.3 (`xlsx.mjs`, Apache-2.0), loaded only for an `.xls`, in a Web Worker, outside the install set. About 0.44 MB (141 KB gzipped), measured on 0.18.5. npm's 0.18.5 has CVE-2023-30533 (prototype pollution on read) and CVE-2024-22363 (ReDoS), so only the `cdn.sheetjs.com` copy will do, and **this environment cannot reach it** (proxy 403). Decision 11. | High · "Old Excel (.xls)" |
| Multi-sheet workbook | Every visible sheet is read. When more than one reads as a statement, the broker chooses, with each sheet's name, period and line count. Sheets named or titled Budget, Forecast, Pro Forma or Projected are labelled projections and never offered as actuals (7.4). Hidden sheets are listed, and read only if chosen. | "Sheet 'T12 Actual' (1 of 4)" |
| CSV, TSV, semicolons | `csvRows` takes a delimiter: comma, tab or semicolon, whichever splits the heading row most evenly. A BOM is dropped. | High · "CSV (semicolons)" |
| European numbers | Detected once per file: "1.234,56", "1 234,56" and "1'234.56" are clear. "1.234" with no other evidence could be read two ways, so **the broker is asked once for that file** (Part 0 rule 6). | "Numbers read as 1.234,56" |
| Pasted text | A "Paste a statement" box. Tabs (copied from Excel) or runs of two or more spaces split the cells. | Medium · "Pasted" |
| Text PDF | `pdfPages` with layouts, then `statementTables`; the columns become cells. New: month headings as a column kind, and a table carried onto the next page (Jan–Jun, then Jul–Dec and Total) joined when its labels match. Scale ("$ in 000s") via `scaleOf`. | High if its checks pass, else Medium · "PDF p.3 line 12" |
| Scanned PDF, photo (JPEG, PNG, WebP) | tesseract.js 7.0.0 (vendored). `ocr.js` is split so it reads any canvas: a drawn page or a decoded image. Each cell keeps its words' lowest score. HEIC works only where the browser decodes it (Safari, untested here). | **Low, always** · "**OCR** p.2 · 71%" |
| `.docx` table | Unzipped with fflate 0.8.3 (vendored, MIT), with limits on unpacked size. `word/document.xml` is read with DOMParser: each `w:tbl` with its rows and cells, merged columns (`gridSpan`) and merged rows (`vMerge`). **Feasible with no new library.** An old `.doc` is refused with what to do instead. | High · "Word table 2" |

**OCR is never trusted on its own.** Every OCR'd line goes to Review whatever
its score (12.2), with the scanned line shown beside the figures read from
it. The score only sets the order, lowest first. The image stays in memory
for that session only.

**Upload safety (12.5).**

- Size limits:
  - workbooks and Word files: 25 MB;
  - text: 10 MB;
  - PDFs: 50 MB;
  - images: 20 MB.
- Zip limits: at most 100 MB unpacked in all, and no entry may unpack to
  more than 200 times its packed size.
- A password-protected workbook gets its own message.
- Nothing in a document is run.
- Labels are written to Excel as text, so "=HYPERLINK(…" stays text.
- ExcelJS still reads on the main thread. Moving it to a worker is a gap,
  left for later.

## 3. The line model and the data format

**On `deal.t12`.** Every addition is optional. A statement the new code reads
carries `v: 2`. A 4.7.x statement has no `v` and reads as before: the same
totals, the same check ids, the same "seen" marks.

- **The statement** gains:
  - `source`: type, file, the sheet chosen and those offered, number format,
    scale, macros present, OCR engine and mean score;
  - `period`:
    - basis: T-12, T-9, T-6, T-3, YTD, annual, quarterly or other;
    - the months covered;
    - each column's kind, and any missing or duplicate month;
    - the answer to "monthly or cumulative?";
    - the prior period;
  - `qc`: a Data QC record (section 5).
- **Each line** keeps its label as printed, its account number and its row,
  and gains:
  - `src`: where it came from (cell; page and line; OCR box; Word table, row
    and cell);
  - `printed`: the row as printed;
  - `conf.read`: high, medium or low, with the OCR score;
  - `blank`: the months that were empty. They still add as zero, so totals
    don't move, but they are flagged and never shown as a confirmed $0;
  - `suggested`: the category and where it came from (remembered label,
    capex wording, remembered split, AI);
  - `needs`: a category, a classification, or nothing;
  - `parts`: a split;
  - `custom`: a custom category;
  - `recurring` and `capital`: yes, no, or not yet classified;
  - `prior`: the prior period's total.

**Whole cents.** Amounts stay dollars rounded to the cent (4.1.0). A split
works month by month: each part's share is rounded to the cent, and the
leftover cent goes to the largest part. The parts add up exactly to the line.
Display rounding stays in the UI.

**Remembered labels.** Each `t12.labels` entry gains:

- `deals`: the category chosen in each of the last 50 deals;
- `split`: a remembered split.

This gives "mapped this way in 6 of your last 7 deals". Older entries say
"mapped this way before". The restore merge joins the `deals`.

**Custom categories.** A new kv key, `t12.categories`: `[{ id, label, parent
}]`, where `parent` is one of the 21. They travel in backups, and a deal keeps
a copy of those it uses.

**This changes the data format, so it needs the owner's approval
(decision 1).**

- It is additive. There is **no migration step**, and nothing saved is
  rewritten.
- A new old-backup fixture, `tests/fixtures/backup-4.7.5-before-t12-formats.json`
  (invented), proves a 4.7.5 T-12 restores with identical totals, figures
  and checks.
- No golden deal has a T-12, so the golden outputs can't change.

## 4. The mapping screen (phone first)

**"Every line"** becomes a list grouped by section.

- **Each line shows:**
  - the description as printed;
  - its amount;
  - a source tag ("Excel · C14", "**OCR** p.2 · 71%");
  - in words, how it was filed: confirmed by you, by its wording, suggested,
    needs a category, or needs classification.
- **Controls:** every target is at least 44 points, and nothing needs
  dragging.
- **Category:** tap it to open a sheet. The likely categories come first,
  then the 21 and the custom ones by section, with search. The sheet also
  offers "New custom category under…".
- **Several lines:** "Select" adds checkboxes, then "File 6 lines under…".
- **Split:** "Split this line…" takes parts by amount or percentage. A
  running "left to place: $1,240.00" must reach zero. "Remember this split"
  saves it as a suggestion for that label: one source line to several
  categories.
- **Suggestions:**
  - A remembered label shows "Suggested: Repairs and maintenance, mapped this
    way in 6 of your last 7 deals (once to Contract services)", with
    **Confirm** and **Choose another**.
  - Until it is confirmed, the line counts in no category, and "Use the
    T-12's figures" waits, as it does today for unfiled lines.
  - "Confirm all 14 suggestions" shows all 14 first.
  - Lines filed by the built-in wording rules stay filed (decision 3).
- **Below the line:**
  - Capex-type wording inside operating expenses is **not moved**. That
    covers capital, roof replacement, reserves, TI, LC, debt, depreciation,
    and asset management or owner costs. The line says "needs
    classification", with "Suggested: below the line, Capital expenditures",
    and the choices: Below the line; Keep in operating (with a category);
    Leave unclassified.
  - A line the file prints after its own NOI is below the line in the source
    already. It keeps that side, and the file's NOI check confirms it
    (decision 4).
- **Recurring, operating or capital:** set only by the broker. A flagged
  one-off asks "Recurring? Yes / No / Not sure", and "Not sure" stays "needs
  classification". NOI stays as stated. "NOI without the one-offs you marked"
  is shown beside it, never instead of it.
- Every choice is one history entry, and Undo takes it back.

## 5. Checks and flags

- Each check is a line in the statement's Data QC panel
  (`qcPanel({ id: 'deal-t12qc' })`) and an item in the Review Queue (kind
  `t12check`, now with a level and a location).
- 4.7.x check ids are kept.
- Each threshold is a new numeric setting in Settings → Calculation
  conventions. The defaults are below.

| Check | Rule (default) | Level |
|---|---|---|
| Missing month | the dated months skip one, or a month column is blank on every line | Check |
| Duplicate period | the same month heads two columns | Fail: totals held until a column is chosen |
| Non-monthly columns | quarters ("Q1 2025", "3 months ended") or years read as periods of that length | Note |
| Cumulative YTD | on most lines each column ≥ the one before, and the last = Total. **The broker is asked**: monthly or cumulative. | Check until answered |
| YTD against monthly | as today: the months against the Total, TTM or YTD column | Check |
| Spike | a month > 3 × the line's median month, and > the larger of $1,000 and 0.5% of EGI | Check |
| Negative expense | an expense line totalling below zero, once the signs are made consistent | Check |
| Negative month | a single expense month of −$500 or less (a credit or reversal) | Note |
| Large one-off | one month ≥ 50% of a line that is ≥ 1% of its side | Note, plus "Recurring?" |
| Year over year | with a prior year: a line or category moving > 25%, or NOI > 50% (the OM reader's thresholds) | Note / Check |
| Reconcile to source | `statementChecks`, as today (the OM tolerance for a PDF in thousands) | Fail on stated NOI, EGI or expenses (decision 22) |
| OCR reading | every OCR line | Check until confirmed |

**T-3, T-6 and YTD.** Nothing is scaled up unless the broker chooses it.

- The card says "T-6 actual · Jan to Jun 2026 · 6 months, not annualised",
  and NOI is shown for those months.
- **"Show a run rate"** adds a column labelled "run rate: 6 months × 2, not a
  T-12".
  - It names any lump payment: "Real estate taxes paid in April; a run rate
    doubles it".
  - It may be set against the OM's NOI as a Note only, never a warning.
- NOI three ways still skips a partial statement, as today.
- With more than 12 months, the latest 12 are the T-12 and the earlier ones
  are the prior period. This is said in words, and the broker can choose
  other months.

## 6. Privacy

- **The file** is read in the page's memory and dropped afterwards. The deal
  keeps only the lines and their positions.
- **OCR images** are never stored.
- **Remembered labels and custom categories** stay on this device and travel
  only in the broker's backups.
- **Nothing is uploaded, logged or counted.** The repository test already
  fails if any app file fetches a web address.
- **AI** runs only when it is turned on and the broker taps "Suggest
  categories with AI" (decision 20).
  - The confirmation names the server and exactly what is sent: "23 line
    labels; no amounts, no file".
  - Answers come back as suggestions labelled AI, to be confirmed like any
    other.
  - Document text is treated as data: a prompt-injection label is among the
    fixtures.
  - The firm's server logs only a failed request's path and status
    (`server/index.mjs:127`).

## 7. Export to Excel

"Export the statement", on the T-12 card, writes a workbook with ExcelJS.

**Its four sheets:**

- **Statement:** by category and month, with EGI, expenses and NOI, and
  below the line kept apart. The basis is in the title ("T-6, not
  annualised").
- **Mapping:** one row per source line:
  - its source and position;
  - the description as printed;
  - its account and amount;
  - the category it went to;
  - how it was filed;
  - its confidence;
  - its split parts;
  - its recurring and capital classification.
- **Checks:** the Data QC lines.
- **About:** the file, the version, the conventions used, and "OCR" wherever
  OCR was used.

The Statement's totals are formulas over the Mapping sheet, with the app's
values beside them, so Excel shows any difference. It has been checked in
LibreOffice only, not Microsoft Excel, and the file and the report say so.
The deal's own workbook is unchanged (decision 19).

## 8. Tests

**Invented, deliberately ugly statements.** They are built by
`tests/t12-formats.js` and `tests/e2e/make_t12.mjs`. Every total is worked
out by hand in a comment.

1. **T-12 `.xlsx`.** Two heading rows, a merged "2025", a hidden sheet, and
   a "Budget 2027" sheet with more lines than the actuals.
2. **T-6 `.xlsx`.** January to June 2026, with half a year's taxes in April.
3. **T-3 CSV.** Semicolons, "1.234,56" numbers, a BOM, and a blank month
   column.
4. **YTD.** Cumulative columns from January to August.
5. **24 months.** March 2025 appears twice, and one line rises 60% on the
   year.
6. **Quarterly and annual.** One statement by quarter (Q1 to Q4 and Total);
   one covering three years.
7. **`.xlsm` and `.xls`.** An `.xlsm` with a macro part, and an `.xls`
   converted from fixture 1 by LibreOffice (`soffice`, installed here).
8. **Pasted.** A TSV as copied from Excel, with trailing tabs; and text
   lined up with spaces, using "(1,234)", "1,234-" and "—".
9. **Text PDF.** Landscape, 14 columns of 6-point type, two pages, "$ in
   000s".
10. **Scans and a photo.** That PDF drawn as an image, turned 1° and with
    noise added; and a phone photo with a slight skew.
11. **`.docx` and `.doc`.** A `.docx` with a merged heading, a nested table
    and text around it; and an old `.doc`.
12. **A messy CSV.**
    - Expenses written with a trailing minus.
    - A credit in repairs.
    - A $48,000 roof replacement in May under repairs.
    - "Capital Improvements" under expenses.
    - A bare "Management fees" and an "Asset management fee".
    - A spike.
    - A stated NOI $250 off.
13. **Hostile files.**
    - A zip bomb named `.docx`.
    - An `.xlsx` renamed `.csv`, and a PDF renamed `.xlsx`.
    - A password-protected workbook.
    - A label starting "=HYPERLINK(".
    - A prompt-injection label.

**Node tests** (`tests/t12-formats.test.js`). Each is run against `git
archive 8fb85a3` (4.7.5) with `BASE=` and must fail there. They cover:

- each fixture's lines, categories, period and checks, against the
  hand-worked totals;
- the four 4.7.5 behaviours in §1;
- splits adding up to the cent;
- unconfirmed suggestions counting nowhere;
- the N-deal counts;
- the restore merge;
- the old-backup fixture.

**Mutation checks.** Each of these must make a test fail:

- reading a blank as a confirmed $0;
- dropping the duplicate-month check;
- skipping the cumulative question;
- applying a remembered label unconfirmed;
- moving a capex line by its wording;
- dropping a split's leftover cent;
- letting a run rate reach the deal's figures;
- forcing commas, or ignoring decimal commas;
- auto-confirming an OCR line;
- picking a sheet by its line count;
- moving a spike threshold by one step.

**Unchanged.** The golden outputs, 618 and 646, stay identical.

**In the browser:**

- `t12fmt-flow`, at iPhone size (390 × 844), covers every format, then:
  confirm, split, classify, answer the cumulative question, show the run
  rate, export, undo, reload, back up and restore;
- `t12-flow` and `review-flow` are kept;
- `typing-flow` types each new input character by character: split amount
  and percentage, custom category name, the paste box, and the thresholds;
- axe, in light and dark, with 44-point targets;
- perf: re-filing a line on a 300-line statement takes 150 ms or less.

**Real files.** `tests/tools/t12-local.mjs` reads each new type from
`private/` and prints counts only.

## 9. Build plan (one PR each, in order)

1. **Reading foundation.** First-byte checks, size limits, `.xlsm`, CSV,
   TSV, semicolons, number formats, pasting, the sheet chooser, blanks
   recorded; `src`, `conf`, `source` and `period`; the old-backup fixture.
2. **Suggestions, not choices.** Remembered labels as suggestions with
   counts, capex-type lines as "needs classification", "Confirm all", and
   the partial-period rule for "Use" (decision 6).
3. **Period checks and flags.** Missing and duplicate months, quarters and
   years, cumulative YTD, spikes, negatives, one-offs, year over year; the
   T-12 Data QC panel, the threshold settings, the run rate.
4. **Mapping screen.** Selecting several lines, splits, remembered splits,
   custom categories, and the recurring and capital classification.
5. **Text PDFs and Word tables.** Tables joined across pages; `.docx`.
6. **OCR.** Scanned PDFs and photos; a score per cell; review beside the
   image.
7. **`.xls`**, if decision 11 is yes.
8. **Excel export** with the Mapping sheet.
9. **AI suggestions**, labels only, if decision 20 is yes.

**Cost.** No paid service unless AI is used: then a few thousand tokens per
statement, labels only, billed through the firm's server. The only possible
new library is SheetJS, about 0.44 MB, loaded only for an `.xls`. Install
size and start-up time are unchanged.

## 10. Decisions for the owner

1. **Data format.** Optional fields on `deal.t12` and `t12.labels`, and the
   new key `t12.categories`; no migration step. *Recommend: approve.*
2. **Lines filed by remembered labels in 4.7.x.** *Recommend:* leave them
   filed, and add one Note listing them.
3. **Built-in wording rules.** *Recommend:* they keep filing lines; only
   remembered labels and capex-type lines become suggestions.
4. **Below the line.** *Recommend:* lines the file prints after its NOI stay
   below. Capex wording inside expenses counts nowhere until classified.
5. **"Confirm all N suggestions".** *Recommend:* allow it, after showing the
   list.
6. **"Use" on fewer than 12 months.** *Recommend:* stop writing partial
   totals into the annual fields. Offer only an explicit "Use a run rate
   (× 12 ÷ N)", labelled "annualised from N months", after a confirmation.
7. **Run rate for T-3, T-6 and YTD.** *Recommend:* only on request, labelled,
   a Note against the OM, with lump payments named.
8. **Cumulative columns, and more than 12 months.** *Recommend:* always ask
   "monthly or cumulative?". Use the latest 12 months as the T-12 and the
   earlier ones as the prior period; the broker can change it.
9. **Several sheets.** *Recommend:* always ask. Budget, Forecast and Pro
   Forma sheets are projections, never actuals.
10. **European numbers.** *Recommend:* detect them per file, and ask once
    when it's ambiguous.
11. **`.xls`.** *Recommend:* vendor SheetJS CE 0.20.3 (Apache-2.0) in a
    worker, on demand. The owner supplies the file or allows
    `cdn.sheetjs.com`; otherwise `.xls` stays refused, with a clearer
    message. Never npm's 0.18.5.
12. **`.docx`.** *Recommend:* fflate and DOMParser, no new library; `.doc`
    refused.
13. **OCR.** *Recommend:* every line reviewed beside its image. "Confirm
    this page" only once the image has been opened. Images are not stored.
14. **Images.** *Recommend:* JPEG, PNG and WebP. HEIC where the browser
    decodes it, marked untested.
15. **Thresholds.** *Recommend:* the §5 defaults, editable. The NOI 2% and
    5% become editable too, with the defaults unchanged.
16. **Custom categories.** *Recommend:* only as subcategories of the 21, so
    totals and the engine are unchanged.
17. **Splits.** *Recommend:* by amount or percentage, with the leftover cent
    on the largest part. Remembered splits are suggestions only.
18. **One-offs.** *Recommend:* marked by the broker only. NOI stays as
    stated, with "NOI without the one-offs" shown beside it.
19. **Export.** *Recommend:* a separate statement workbook; the deal
    workbook stays unchanged for now.
20. **AI.** *Recommend:* the last PR. Labels only, confirmed each time, with
    the answers as suggestions.
21. **One record per basis (7.4).** *Recommend:* defer to its own proposal.
    This item keeps one `deal.t12` with its prior period.
22. **A failed reconciliation** (stated NOI, EGI or expenses). *Recommend:*
    hold "Use the T-12's figures" until the broker chooses a fix: keep the
    lines' sum, or mark it seen. This is what Bug B does.

**Part 7.5, item by item**

| Master plan item | Where it is covered |
|---|---|
| Import XLSX, CSV, text PDF, OCR'd scans (labelled) | §2 |
| Mapping that keeps the original descriptions; custom categories; split lines; one-to-many | §3 and §4 |
| Missing months, duplicate periods, non-monthly columns, YTD against monthly | §5 |
| Sign conventions, subtotal rows | Kept from 4.7.0 |
| Spikes, negative expenses, one-offs, year-over-year outliers | §5 |
| Reconcile to the source | §5 |
| Recurring and operating against capital, only when confirmed; "needs classification" | §4 |
| Learn from past mappings, as suggestions | §3 and §4 |
| Export with a mapping sheet | §7 |
| Separate records for each basis (Part 7.4) | Deferred: decision 21 |

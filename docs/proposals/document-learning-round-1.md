# Document learning, round 1: why 0 of 26 documents were accepted

Status: **diagnosis and PR plan, for the owner.** No app change. Follows `document-learning.md`.

Every number here is a **count from documents the owner supplied** (kept in the git-ignored `private/` folder).
No file name, name, address, figure or page text appears here. Files are named by label only (`uw1/file-03`, in
the order `tests/tools/doc-local.mjs` reads them). The structure was measured with a local-only script in
`private/`. It is never committed, and it runs the app's own readers.

## What the 26 files are (structure only)

| Set | Files | What they are |
|---|---|---|
| uw1 | 15 (10 PDF, 3 workbooks, 2 Word) | pages exported from the broker's own underwriting model, not source documents |
| uw2 | 5 (4 PDF, 1 workbook) | the same: model pages plus the model workbook |
| dd2 | 6 PDF | source documents from a property-management system: 3 annual income statements and 3 rent rolls |

- **PDFs:** 20 in all. 17 have a text layer, 23 pages between them. Each of these is 1 to 3 pages; 14 are a single page.
- **No text layer:** 3 PDFs, 1 page each. Their text is drawn as filled outlines, and none of the 3 holds a scanned image.
- **Packages:** **No file is a combined package.** Scored page by page, 15 of the 17 text PDFs are one section. The other
  2 are one narrative (notes and assumptions) whose pages score differently from page to page. That is not two documents.

## Root causes, by outcome

1. **"asked" with `a+b+c` is not a package.** `ddintake.identify` reads the first three pages' text
   (`app/ddintake.js:38`). Only two PDF readers can set a type: rent roll and OM (`:40`). When neither takes a file,
   `classify` puts up to three candidate types into `ask`, and doc-local joins them with `+`. The classifier's word
   patterns are broad: area, tenant and rent words score as rent roll, and landlord or tenant words score as lease.
   So a single-section page draws three candidates.
2. **No PDF operating-statement route.** 5 text PDFs are operating statements, and `rrdoc.docKind` returns `t12` for
   4 of them. These are the 3 annual one-year-column statements and 2 model statements: one with an annualized
   trailing column plus pro forma columns, one with a current-year column plus stabilized and per-SF columns. But
   `identify` never routes a PDF to a statement reader. It asks (`app/ddintake.js:67`), by design.
3. **The rent roll PDF reader finds no rows** in the 3 property-management rent rolls (2 pages each). These are a
   multifamily layout: names wrap onto two lines, a lease end can be month-to-month, and page 2 is a summary. The
   report header also says the report lists **only a subset of units**, so even read perfectly it is not the full
   roll. A 4th file, a building stack table, gives the table reader 8 rows, but it has no title and no "As of" date,
   so `docKind` says `unknown` (`app/rrdoc.js:42-44`).
4. **The 3 "scans" are outlined text, not scans.** They hold 0, 0 and 63 characters of text and no image.
   `docKind` calls anything under 200 characters a scan (`app/rrdoc.js:37`). The Documents card offers first-page
   OCR (`app/ddui.js:280-295`); the Underwrite tab's Start-from-documents card (`app/intakeui.js`) does not.
5. **Workbooks.**
   - **2 macro-enabled workbooks.** Each holds a macro project (84 sheets, about 680 parts). They were not refused for
     their macros: ExcelJS 4.4.0 throws on a print-area name it can't parse while it loads the workbook, and the app
     reports that as "damaged or password protected" (`app/sheetread.js:107`). `checkUpload` flags the macros
     (`app/filekind.js:46`), but intake never acts on the flag.
   - **The 3rd ".xlsm" has no macros.** By content it is a plain workbook: 1 sheet, no month columns and no rent roll
     headings, so it is asked. That is correct.
   - **The uw2 workbook** (40 sheets, 32 hidden) loads, but 11 cells hold dates that can't be read. `cellValue` throws
     on the first one (`app/sheetread.js:10`), and the whole file is refused. With those cells read as blank, the rent
     roll sheet test accepts the workbook: 17 sheets, 5 of them visible.
6. **2 Word files** are narratives: 50 to 60 paragraphs and no tables. Word is "arrives later"
   (`app/filekind.js:220`). One shows a type only because its file name suggests one.

## What the right outcome is, per family (files)

| Family | Files | Right reader or outcome | Gap |
|---|---|---|---|
| Operating statement PDFs | 5, plus 1 outlined | `omstatement.js` tables into the T-12 annual basis (`t12.js:449`) | no PDF statement route in intake; annual and annualized meaning |
| Rent roll PDFs (property manager, building stack) | 4 | `rrdoc.js` / `omroll.js` with a new layout profile | 0 rows; a subset-only report; no title |
| Workbook with unreadable date cells | 1 | the rent roll sheet reader | an invalid date stops the whole file |
| Outlined-text PDFs | 3 | OCR on request, then the same routes as above | no OCR offer on the Underwrite card |
| Macro-enabled workbooks | 2 | **refused by design**, with the right reason | the reason says "damaged" |
| Pricing summaries, projections, unit mixes, narratives | 15 in all (some counted above) | identified and kept, **never read as inputs** (they are the model's own conclusions: a calculator must not check itself) | no type for an underwriting output |

At best **11 of 26** are accepted by a reader: 5 + 4 + 1 + 1 outlined statement. The other 15 are correct when they
are identified and kept, not read.

## PR plan (one PR each, in this order)

1. **Scoreboard reason codes (tooling only).** doc-local prints a reason code per refusal (`macros`,
   `exceljs-open-failed`, `invalid-date-cell`, `docx-later`, `no-text-layer`). It also adds an outcome "identified,
   no reader". Fixture: the existing invented files, plus one of each refusal. Test: the codes appear; the old tool
   prints none. No gate.
2. **An unreadable date cell is blank, with a note** (`sheetread.js`). Fixture: an invented workbook built in the
   test, with one date cell that can't be read among ordinary cells. Test: on the old code `readGrids` throws; on the
   new code the cell is `null` (never 0, never today) and the note gives the count. Gate: parsing, designer note
   below.
3. **Macro-enabled workbooks are refused by content, with the true reason** (`ddintake.js`). Fixture: an invented
   workbook zip with an empty placeholder macro part (no real macro code). Test: on the old code the file is read or
   says "damaged"; on the new code it is refused with "has macros: save a copy as .xlsx". **Macros stay refused and
   are never run.** Reading the values of a macro workbook would be a security decision for the owner, and it is not
   proposed. A separate optional PR could survive a print-area name that can't be parsed in a plain workbook
   (fixture: an invented workbook with such a name). Neither PR changes any cell value.
4. **OCR on request on the Underwrite card**, reusing `ocr.js` and the Documents card's pattern. The wording becomes
   "no text layer" rather than "scan". Fixture: an invented one-page PDF whose heading is drawn as filled paths. Test:
   the old card has no OCR button; the new one has it, and after OCR the file is classified. OCR in a browser was not
   run in this diagnosis: it is to be checked on the phone.
5. **PDF operating statements into the T-12 reader**: a proposal first. Fixtures, all invented:
   - a one-page statement with one year column and a Total column;
   - a model page with an annualized trailing column, a per-unit column and two pro forma columns;
   - a current-year page with per-SF, percent and stabilized columns.

   Tests: totals in cents worked by hand; pro forma and per-unit columns are never read as actuals; old code asks;
   golden identical. **Owner gate (financial meaning):** whether an annualized trailing column counts as actual, and
   whether a one-year statement fills the T-12 as annual basis.
6. **A property-management rent roll PDF profile**: a proposal first. Fixtures, both invented:
   - a two-page multifamily report with names on two lines, month-to-month lease ends, a property subtotal, a
     summary page and a subset filter in its header;
   - an untitled building stack table.

   Tests: rows, units, vacant and SF right on the invented roll; the summary page is never read as rows; a subset
   header is a failed check, so it is never the full roll; old code reads 0 rows. **Owner gate:** which column is
   rent when market rent is zero and the amount sits under charges (charges are not rent), and whether an untitled
   table may be offered as a rent roll.
7. **Later:** two items.
   - A type for an underwriting output (pricing summary, projection, notes), so those 15 are identified and never
     read. This is a new stored type id, so it needs the owner's data-format approval.
   - A section splitter. It is not needed for this round, because no file is a package. When it is needed, it would
     use the page ranges in `pdfpages.parseRanges` and run `identify` on each range, with the broker confirming the
     split. It adds no math.

**Designer note for PR 2 (parsing):** a date cell that does not resolve to a real date is read as blank (`null`),
never 0, never today, and never the raw serial number. The import shows one note with the count. Readers see blank,
so a rent roll's dates stay unset and a T-12's month columns are not invented. The golden outputs can't change,
because no saved deal holds such a cell.

**What would help most from the owner:** the source documents behind the uw1 and uw2 model pages (rent roll, T-12,
leases). The model pages could then serve as answer files.

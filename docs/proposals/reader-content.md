# Reading a rent roll or an income statement by its content

Status: slice 1 released in 4.7.173. The section 8 recommendations are recorded as
approved in `.evolve/DECISIONS.md` (2026-11-14). Slices 2 and 3 are being built on
`claude/reader-content-2` (not merged); section 9 records what slice 2 does, and
section 10 is the money note for slice 3. Written 2026-11-14 against main 4.7.171.
This follows owner decision 4 of 2026-11-14: "Document reading: recognise a rent
roll or an income statement by its content (columns of figures, dates and
per-unit patterns) when its headings are not the usual ones; it still asks
rather than guesses, and the golden outputs stay identical." In the owner's
words, the reader "should be able to actually understand what a rent roll is,
what an income statement is, even if they're not traditional ones."
Invented fixtures only.

## 1. The problem

The OM diagnostic (`tests/tools/om-diag.mjs`) was run on 41 real OMs on the
owner's machine. Only counts were reported. The reasons it gave:

| Reason | OMs | Fixable here? |
|---|---|---|
| roll-on-scanned-page | 20 | no: OCR work, out of scope |
| header-not-matched:tenant | 11 | **yes: slice 1** |
| table-cells-merged | 4 | partly: slice 2 |
| roll-not-detected | 3 | maybe: slice 2 |
| header-found-no-rows | 2 | no: another bug class |
| rows-split | 2 | no: another bug class |
| held-by-check | 2 | no: working as designed |

**header-not-matched:tenant** means a header row was found but no column was
taken for the tenant. The PDF reader's tenant words are already wide: Tenant,
Lessee, Occupant, Resident, Business, Company, Name, d/b/a and Licensee are all
in `omroll.js W.tenant`. So these 11 are not about vocabulary. They are tables
where the tenant column has a heading no list will hold ("Concept",
"Customer", "Store", "Retailer", "Merchant", "Brand"), or no heading at all, or
where the name sits in the suite column. We can't tell how many of the 11 are
real rent rolls: the diagnostic reports the best header-shaped line, and that
line may belong to a unit mix.

### Shapes that fail today

Each shape below is proved by an invented fixture in
`tests/reader-content.test.js`. All of them fail on main 4.7.171.

**PDF, no table found.** `rentRoll` returns null, and the diagnostic says
`header-not-matched:tenant`. Slice 1 fixes all four.
1. Suite | **Concept** | SF | Annual Rent | Rent/SF (no lease date)
2. **Customer** | SF | Lease End | Annual Rent (no suite)
3. *(blank)* | SF | Lease End | Annual Rent | Rent/SF
4. Location | **Store** | SF | Expiration | Annual Rent

**PDF, read today but the names are lost.** These are silent misreads. Slice 2
covers them; the tests are marked `todo`.
5. Suite | **Concept** | SF | Lease End | Annual Rent. The table is read as a
   "unit-keyed" roll, and every tenant comes out blank.
6. Suite | *(blank)* | SF | …, or "101 Maple Leaf Bakery" printed under Suite.
   The name is glued into the suite and the tenant comes out blank.

**Spreadsheet import.** `rentrollui.js headerAndRows` and `guessField`. Slice 1
fixes all three.
7. Suite | **Business** | SF | Lease End | Rent. The headings pass, but
   "Business" is not guessed, so the import has no tenants unless the broker
   picks the column by hand.
8. A blank heading over the tenant column. The column was not even listed in
   the mapping dialog (`if (!h) return;`), so it could not be chosen at all.
9. **Business** | Sq Ft | Annual Rent. Only two headings are known, so the
   import says "No rent roll was found".

Routing on the Documents card (`ddintake.js identify`) already asks about shape
9: the text classifier names a rent roll. Nothing to fix there in slice 1.

**Income statement (T-12).** `t12.js layoutOf` and `readStatement`. Slice 3
covers these; the tests are marked `todo`.
10. One annual column headed "2025", "Actual", "FY 2025" or "Year Ended
    December 31, 2025". It throws. Worse, a body row such as "Total Revenue"
    is taken for the heading row, because `TOTAL_HEAD` matches it.
11. Quarter columns (Q1 to Q4 2025). It throws.
12. Actual and Budget pairs in one heading row ("Jan 2025 Actual",
    "Jan 2025 Budget"). It throws. With two heading rows it already reads the
    Actual columns.

Three things already work, checked by probe: account codes before labels, in
their own column or in the label cell; and the labels "Gross Potential Rent",
"Vacancy Loss" and "Total Operating Expenses".

## 2. The rules

These hold for every slice.
- **The headings decide first.** Content is tried only where the heading
  reader finds nothing. For a PDF that means nowhere in the whole document
  (`rentRoll`: a second pass only when the first finds no table). A file read
  today is read exactly as before, so the golden outputs are unchanged by
  construction.
- **Content evidence only OFFERS or ASKS.** It never imports alone, never fills
  a value, never reads a blank as zero and never changes a figure. A PDF's rows
  are held behind a failed Data QC check until the broker accepts it. A
  spreadsheet column is offered with a button and is not chosen until tapped.
- **No guessing between two.** If two columns both read as names, nothing is
  offered.
- **What a name column is** (`app/colcontent.js nameColumn`):
  - three or more names;
  - at least 80% of the filled cells are names (vacancy, total and status
    words are skipped, not counted);
  - at least 90% of the names are different.

  A name is made of words: three letters in a row somewhere, letters at least
  half its characters, at most 60 characters and 8 words. It is not a figure,
  a date, a code such as "1BR/1BA", a dash or n/a, a street address, an
  e-mail or a web address.
- **What is not a tenant column even if it holds names.** A heading that names
  something else: Property, Address, City, Buyer, Seller, Contact, E-mail,
  Notes, Description, Type, Status and the like (`NOT_TENANT_HEADING`).
- **What is not a rent roll even with a name column:**
  - in a PDF: no suite and no lease date (a list of sales or properties); a
    unit mix or a lease comparable table (`tableshape.js`); comparables or
    market-survey wording above the table; fewer than three rows;
  - in a spreadsheet: fewer than two known rent roll headings, or none of them
    a size or a rent.

## 3. What the broker sees (the confirm)

**PDF** (an OM on the Deal screen, or *Import from PDF…* on the rent roll). The
rows are read and shown in the Data QC panel, held, behind one failed check:
"Looks like a rent roll: no heading on page 3 names the tenant, but the
'Concept' column holds 4 different names (words, not figures or dates). Its
columns were read as Suite ('Suite'), Tenant ('Concept'), SF ('SF'), Annual
rent ('Annual Rent'), Rent per SF ('Rent/SF'). Check the rows against the page;
accepting uses them with that column as the tenant." **Accept as read** is the
existing Data QC button. It releases the rows through the existing held-rows
path (`applyHeldRows`, or the PDF preview's **Use this rent roll**). A titled
document is still called a rent roll, and the preview says why the tenant
column is in question. An untitled one says "a table that looks like a rent
roll" with the existing **It is a rent roll: read it** button.

**Spreadsheet.** The mapping dialog opens as before. Above the column list:
"No heading names the tenant. The 'Business' column holds 12 different names
(words, not figures or dates), so it looks like the tenant column. Read it as
the tenant?" and a button, **Read "Business" as the tenant**. Tapping it sets
that column's choice to Tenant, which can be changed back in the list. A column
with no heading is now listed as "Column 2 (no heading)" when it holds
anything.

## 4. The data shape and where it is stored

There is no new stored field and no migration. The PDF question is an ordinary
Data QC check (`kind: 'tenant-content'`, `level: 'fail'`) in the existing
`rrQc.checks` array, and old code shows an unknown kind generically. The column
mapping lives only in the check's text. The spreadsheet offer is not stored.
The engine, `deal.js` and the money code are untouched.

## 5. Tests and cost

- `tests/reader-content.test.js` holds 17 tests and 8 todo:
  - 10 fail on main: the four PDF shapes, the PDF document kind (titled and
    untitled), the three spreadsheet shapes, and the name rules;
  - 7 are guards that pass on both, and hold the "never guesses" rules: a sales
    list, names with no suite or date, two name columns, a repeated category,
    an availability list headed "Description", a unit mix with a blank first
    heading, comparables wording, and a file with a headed roll read exactly
    as before;
  - the 8 todo are the slice 2 and slice 3 shapes.
- **Mutation checks.** 16 mutations; 15 are caught by the unit tests. The one
  they can't reach (the CSV fallback in `parseCsv`) is caught by the new
  browser checks in `rentroll-flow`: the offer is shown and not chosen,
  tapping it chooses Tenant, and closing imports nothing.
- **Golden.** 646 figures, 0 changed; `analyze-golden` 618 unchanged.
- **Cost.** One small new module (`app/colcontent.js`, about 60 lines) and
  about 120 lines in `omroll.js`, `rentrollui.js` and `rrdoc.js`. The second
  PDF pass runs only when the first finds nothing, and it stops at a header
  line before looking at any rows unless the line has two known columns, one
  of them a size or a rent. Timed on an invented 60-page document with no
  rent roll: 67 ms before, 79 ms after (one run each, this machine).

## 6. Prior art (capped check: two web searches, package pages only)

| Candidate | What it does | License | Size | Last release, maintenance | Build-free, vendored, offline | Network, telemetry | Security | Verdict |
|---|---|---|---|---|---|---|---|---|
| jsontableschema / tableschema-js (Frictionless) | infers a column's primitive type (number, date, string) from values | not checked | not checked | not checked | Node package, would need vendoring | none known | n/a | **build**: primitive types only; we need "tenant name" against "suite code", which no general library knows |
| predict-data-types | guesses string formats (email, currency, date) | not checked | not checked | not checked | not checked | not checked | n/a | **build**: same reason |
| column-type-detector, semantic_infer, type-analyzer | small column-type guessers | not checked | not checked | very low use (about 10 downloads a week for one) | not checked | not checked | n/a | **build**: unmaintained-looking, and generic |
| LlamaParse, Sensible, CleanRoll, Docsumo and others | hosted rent roll extraction | commercial | n/a | n/a | no: hosted services | yes: documents leave the device | ruled out | **no**: the app is offline, and documents never leave the device |
| Our own `omroll.js` (`assignKinds`, `readBody`), `units.js`, `tableshape.js`, Data QC (`dataqc.js`, held rows) | heading reader, period reader, shape guards, the hold-and-accept flow | ours | — | — | yes | none | — | **adopt**: the content pass reuses all of it; `colcontent.js` adds only the value test |

No outside code is used. The engine and the money logic are untouched.
The owner's support code (`private/support-code/`) was not opened for this
slice, at the caller's instruction. It must be reviewed, structure only,
before the PR, and the PR must say what it adopted, covered or found not
applicable.

## 7. The next slices (proposed; each its own PR)

**Slice 2: rent rolls that read today but lose the names (shapes 5 and 6), and
merged cells.** This changes what is read for files that pass today, so it
needs the owner's approval. A rent roll that changes when re-read is still a
saved-results question, even though no figure moves. The change:
- `omroll.js assignKinds` / `unitKeyed`: when a unit-keyed header has a
  kindless column whose values pass `nameColumn`, keep the table exactly as
  read and add a **warn** check, "the 'Concept' column holds names: read it as
  the tenant?". Its answer re-reads with `tenantAt`, the way `periods` re-reads
  today (`rrdoc.js pdfRollRecord`).
- A name glued to a suite code ("101 Maple Leaf Bakery" under Suite): split
  `ID_WORD` plus words in `finishRow`, only after the broker says yes.
- Spreadsheet routing: `ddintake.js rollTable` could call `contentTable` to say
  "looks like a rent roll" (still asked, never typed).
- Tests: the two `todo` tests become plain tests, plus a golden diff (0
  changed unless the owner approves).

**Slice 3: income statements by content (shapes 10 to 12).** All in
`t12.js layoutOf` and `readStatement`, with a design note first (money
logic):
- **The heading row.** No `TOTAL_HEAD` test on a row whose first cell is a
  label with figures beside it: that row is a body row. This fixes the misread
  "Total Revenue" heading.
- **An annual column by content.** One numeric column to the right of the label
  column, under a heading that is a year, "Actual", "Amount", "FY" or "Year
  Ended". Accept it when the arithmetic agrees: a stated Total Income or Total
  Expenses row equals the sum of the lines above it (within a cent), or income
  minus expenses equals a stated NOI row. Then it reads as `annual`, with
  `period.basis: 'annual'`, the period words as printed, and the "is this the
  full year?" question that the PDF statement path already asks. Never scaled.
- **Quarters.** `QUARTER_HEAD` columns are read as four quarter columns, never
  months (`monthCols` stays empty). The total is the sum of the quarters only
  where a stated total agrees, else it is asked. Dated quarters give
  `basis: 'T-4Q'`, shown as such. No monthly figure is invented.
- **Actual and Budget pairs in one heading row.** `monthOf` reads "Jan 2025
  Actual" as January, with a side word. Budget columns are left out, and a
  check says so (a budget must never be read as actuals).
- **Label vocabulary plus arithmetic.** A row is a subtotal when it equals the
  sum of the lines since the last subtotal, even with an unknown label; it is
  then offered as a subtotal, not counted as a line. This fixes "anything
  counted twice".
- Tests: the six `todo` tests become plain tests; every T-12 golden fixture is
  unchanged.

**Out of scope:**
- scanned pages (20 of 41 OMs: the OCR path, `ocr.js`, a separate proposal);
- tables split across pages;
- header-found-no-rows;
- the PDF statement reader (`pdfstatement.js`): it gets slice 3's rules in its
  own PR, after slice 3.

## 8. Decisions for the owner

1. **Is "held behind one failed check" the right confirm for a PDF?**
   Recommendation: yes. It is the same hold-and-accept the reader already uses
   for every other doubt, so the broker learns nothing new, and nothing is used
   without a tap.
2. **Should the spreadsheet offer pre-select Tenant instead of showing a
   button?** Recommendation: no. A button keeps the default reading as it is
   today, and the import dialog is already a confirm.
3. **Slice 2 changes what is read for files that pass today.** The names come
   back, through a question. Recommendation: approve it as a question (a warn
   check plus a re-read), never a silent change.
4. **Slice 3 order.** Recommendation: the "Total Revenue taken as the heading"
   fix first (a bug), then the annual column, then quarters, then Actual and
   Budget pairs.

## 9. Slice 2 as built

- **Detection** (`omroll.js namesQuestions`). It runs on the table read by its
  headings (never on one found by its contents), with no tenant column:
  - a column with a heading the reader has no kind for, whose cells pass
    `nameColumn` and whose heading is not `NOT_TENANT_HEADING`, gives a **warn**
    `tenant-column` check;
  - otherwise, a Suite column that prints a suite number and a name in at least
    three rows and 80% of the occupied rows, the names passing `nameColumn` and
    none a vacancy, gives a **warn** `suite-name` check.

  The rows are exactly as read today, and nothing is held.
- **The question** (`rrdoc.js pdfRollRecord`). The rent roll PDF preview gives
  the check an `answer` (`{ tenantLabel }` or `{ splitSuite: true }`). It shows
  two buttons: the yes (*Read "Concept" as the tenant*, or *Split each suite into
  its number and the tenant*) and *Keep as read*. On the Deal screen the same warn
  check appears with no re-read (the OM's pages are not kept), and its text points
  to Import from PDF….
- **The re-read.** `rentRoll(pages, { tenantLabel })` takes that column as the
  tenant through `assignKinds(cells, tenantAt)`. `rentRoll(pages, { splitSuite:
  true })` splits each matching suite. Neither overwrites a tenant already read
  or names a vacancy. An info check records the choice. No figure, date or
  stored field changes.
- **Tests.** `tests/reader-content-2.test.js` has 8 tests; 5 fail on main 4.7.173.
  The other 3 are guards: no tenant column question when a Tenant column exists,
  when the words repeat, or when the heading is Owner; a `tenantLabel` that
  matches nothing changes nothing; no split for plain suites, repeated words or a
  vacancy. `tests/e2e/pmroll-flow.mjs` part F (invented `pm-roll-concept.pdf`)
  has 3 checks at each of two sizes; they fail on the old code. Of 9 mutations,
  7 are caught. The other 2 are equivalent: making the header wrapper
  unconditional, and dropping the vacancy filter (vacancies are also refused by
  the name test). Golden: 646 figures, 0 changed.

## 10. Slice 3 money note (income statements by content)

This note comes before any money change (CLAUDE.md, routing). It holds for every
step below:
- every amount stays as the file prints it, to whole cents (`t12.js cents`);
- nothing is scaled, annualised or turned into months;
- a blank cell is never read as zero on a new path;
- the sign rules (`normalizeSigns`) are not touched;
- the engine (`app/engine/`, `deal.js`) is not touched;
- a file that is read today is read exactly as before, so golden stays at 0
  changed.

The steps, in the owner's order:

1. **"Total Revenue" taken for the heading row** (`layoutOf`). When no row has
   three months, the reader takes the first row with a Total-like cell as the
   heading. A body row such as "Total Revenue | 114,000" matches, so it became
   the heading and the error was the misleading "No statement lines were found".
   A heading row holds no amount. Any number other than a year (1900 to 2100)
   makes a row a body row, never the heading. The file still is not read, but
   the message is now the true one ("No months or total column were found").
2. **A single annual column.** When there are no months and no Total heading,
   the heading row (no amounts, years allowed) may have one column headed as a
   year, "FY 2025", "Year Ended …", "12 Months Ended …", "Actual", "Amount" or
   "2025 Actual", with figures under it. It is read exactly as a Total column
   is read today, but kept only **when the arithmetic agrees**:
   - at least one stated row (EGI, total expenses, NOI) or subtotal is checked
     against the lines it covers (`statementChecks`, the same tolerance);
   - none of those checks fails.

   Otherwise the file is refused, and the message says why. Refusing is today's
   behaviour, so nothing is guessed. The period is `annual` when the heading
   names a year or "ended"; for "Actual" or "Amount" it is `other`, with a note
   that nothing says the column is a full year. No new stored field: the note
   is worked out from the column heading already kept in `period.columns`.
3. **Quarters with no Total column.** The heading row has four quarter columns
   (`QUARTER_HEAD`), dated, consecutive and different (Q1 to Q4 2025, or Q3
   2024 to Q2 2025).
   - Each line's total is the sum of its four printed quarters, in whole cents.
     The quarters are summed to a year only when they are four in a row; no
     month or monthly figure is made.
   - A line with a blank quarter refuses the file, naming the line: a blank is
     never a zero here.
   - Kept only when the arithmetic agrees, as in step 2.
   - Stored as an annual-only statement is today: `months: []`, the existing
     `period.nonMonthly` naming the quarters, and its info text saying the year
     is the sum of the four quarters.
4. **Actual and Budget pairs in one heading row** ("Jan 2025 Actual", "Jan 2025
   Budget"). A side word (Actual, Budget, Variance, Forecast, Prior Year, %)
   after or before a month is read.
   - Actual, or no side word: a month column. Every other side word: left out,
     never a month. A budget is never read as actuals.
   - A Total column is the Total Actual one; a Total Budget never is.
   - What was left out is kept in a new optional field,
     `period.leftOut = { heads: [...] }`, and an info check says so. The field is
     additive: an older version ignores it, and nothing migrates. To reverse it,
     drop the field and its check.

Tests for each step fail on main first, and each part is mutation-checked.
The six `todo` tests in `tests/reader-content.test.js` become plain tests.

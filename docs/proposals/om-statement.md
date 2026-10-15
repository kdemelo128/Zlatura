# OM operating statements read as tables (Bug B)

Status: approved by the owner on 2026-10-14 (every recommendation below);
built in 4.7.5. Uses the shared Data QC parts (`docs/proposals/data-qc.md`).

## The problem

Income and expense figures read from an OM's operating statement were often
wrong. The reader took the first figure within two cells of a label and knew
only one heading pattern (Pro Forma), so: the oldest year of an operating
history was read as in-place NOI; a Per Unit column was read as totals;
"($ in 000s)" was ignored; "Expenses Per Unit" was taken as total expenses;
a failed range check moved on to the next column (a negative actual NOI
became the pro forma); a heading spanning two columns was lost, and so was
any heading more than 40 lines up; "Real Estate Tax Reimbursements" beat
"Real Estate Taxes"; and nothing checked that the statement added up.

## What changes for the broker

- Statement figures come from the column their heading names: in place from
  the latest actual column (a T-12 first), pro forma NOI from the first pro
  forma column. With only Year 1, Year 2… NOI is Year 1, labelled "Year 1
  (projected)", medium confidence.
- "($ in 000s)", "$000", "in thousands", "in millions" are applied, and said.
  Per SF, per unit and % columns are never totals.
- Key figures shows a **Data QC: operating statement** panel: each column's
  arithmetic, pass, check, fail or note in words, each pointing to its page,
  row and cell, with the cell marked on the line as printed. With nothing
  open it folds to one line.
- A failed check in a column the deal uses holds **NOI, EGI and operating
  expenses** back (their rows say "held back") until the broker chooses a
  fix there or in Review: keep as printed; use the subtotals (EGI less
  expenses); use the sum of the lines; use another column. The choice is
  recorded on the deal and Undo takes it back.
- Each statement figure says under its label where it came from and how
  sure the reading is, in words: "Actual 2025 · p.4 · high". The other
  columns of the same row are its alternatives.

## How it reads (app/omstatement.js, pure)

1. **Tables.** Lines whose first cell is a label and the rest figures, with
   section headings between; the table ends at text that is not a heading
   (the next heading area), or the end of the page. It counts as a statement
   with two rows the OM reader recognises (NOI, EGI, expenses, taxes, GPR,
   base rent), or one under a heading naming a basis.
2. **Columns** by grouping the figures' right edges; figures set a single
   space apart are split where they sit. The heading area is one to three
   text lines above the first row; above the bottom line, a heading over two
   columns, or centred in the gap between them, is their group label.
3. **Kinds:** %, per SF, per unit (never totals); pro forma (Pro Forma,
   Stabilized, Budget, Projected, Year 2+, "2026E"); actual (T-12, TTM,
   trailing, Actual, Current, In-place, a past plain year); Year 1; a
   heading with no basis ("Total"). A column with no heading whose figures
   times the building SF or unit count give another column's is per SF or
   per unit.
4. **A cell that fails** the field's range leaves that row unresolved (a
   check says why); the next column is never taken.
5. **Ties** go to the row in the right part of the statement (taxes under
   expenses), not the first seen.
6. **Checks.** Each usable column becomes the T-12 statement shape and
   `t12.js statementChecks` does the arithmetic (it gained a tolerance
   option; the T-12 import's default is unchanged): lines against
   subtotals; NOI against EGI less expenses as printed; plus taxes within
   expenses and expenses below EGI. Tolerance: the larger of half a printed
   unit per line, or 0.5%. A section printed with fewer than three lines
   that don't add up is a summary (a note), not a fail. Growth between
   neighbouring columns: income or expenses over 25% a note, NOI over 50% a
   warning; never blocking. A fail in a column the deal doesn't use is a
   warning.

## The data (additive; stored on the deal)

- `sources[key]` for a statement figure adds `row, lineNo, col, colKind,
  cell, scale, unit, table, check`; after a fix, `check: 'resolved'` and
  `fix`.
- `deal.omRead = { v: 1, at, file, tables, checks, blocked, held, applied,
  seen, done }`: the tables as read (page, title, scale, columns with kinds),
  the checks in the Data QC shape (each fail with `fields` it holds and
  `fixes`), the figures held back with their sources, and the broker's
  choices (`seen[checkId] = { fix, label, values, at }`).
- No migration step: deals read before 4.7.5 have neither and are not read
  again (`tests/fixtures/backup-4.7.4-before-om-statement.json`).

## Tests

`tests/omstatement.test.js` (34, all failing on 4.7.4: 25 reading tests on
page text and Courier PDFs, 9 deal tests that need the new module), the PDF
fixtures in `tests/om-statement-fixtures.js` (typeset again in Helvetica by
`tests/e2e/make_pdfs.py`), and `tests/e2e/omstmt-flow.mjs` (phone size, axe
light and dark). Mutation checks: moving to the next column on a failed
cell, dropping the scale, dropping the per-unit column kind, and letting a
failed check apply each fail tests. Golden outputs unchanged.

## Cost

No dependency, no network request; reading a 120-page OM takes about as
long as before (≈86 ms in Node for the reader).

## Open for the owner

- A section printed with fewer than three lines that don't add up to its
  subtotal is treated as a summary (a note), not a failure: the two invented
  sample OMs print only some lines (taxes and insurance; GPR and vacancy).
- Year 1 beside an actual column is used as the pro forma NOI when no column
  says Pro Forma.
- A plain year equal to the current year is read as projected.

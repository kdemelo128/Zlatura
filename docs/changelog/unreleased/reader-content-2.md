# Rent rolls that lost their tenant names are now asked about, and income statements laid out by year, by quarter or as Actual and Budget are read

Reading by content, slice 2 (`docs/proposals/reader-content.md`, section 7). Some PDF rent rolls were read with every tenant blank. Either the names sat in a column with a heading the reader does not know (a "Unit, Concept, SF, Lease End, Rent" roll), or they were printed in the Suite column ("101 Maple Leaf Bakery") or under a blank heading beside it. In those cases the name was glued onto the suite.

- **Read exactly as before, then asked.** The table is read as it always was, with nothing held back. A warn check says what was seen: "The “Concept” column holds 4 different names, and no column is headed Tenant…", or "The “Suite” column prints a suite number and a name…".
- **Import from PDF… asks it as a choice.** In the rent roll PDF preview the warn check offers two buttons: **Read “Concept” as the tenant** (or **Split each suite into its number and the tenant**) and **Keep as read**. A yes reads the same pages again with the names as tenants. The rents and dates are unchanged, and a note records the choice. A vacancy is never split into a tenant name, and a tenant already read is never overwritten.
- **On the Deal screen (an OM),** the same warn check appears and says to use Import from PDF… to read the names.
- **Not asked when** a column is headed Tenant, the column's words repeat (a category or a unit type), or its heading names something else (Owner, Property, Notes and the like).

No saved deal, figure or data format changes. The answer lives only in the preview until Use.

Tested: `tests/reader-content-2.test.js` has 8 tests, and 5 of them fail on the old code. Of 9 mutations, 7 are caught; the other 2 change nothing. `tests/e2e/pmroll-flow.mjs` part F runs 3 checks at phone and desktop size, and they fail on the old code. Golden: 646 displayed figures and the 618 saved deal results are unchanged. Invented files only.

**Income statements by content (slice 3).** These come through Import a T-12. The money rules are in section 10 of the proposal: amounts stay as printed, to the cent; nothing is scaled, annualised or turned into months; a blank is never a zero.

- **A misleading error, fixed.** A body row such as "Total Revenue | 114,000" was taken for the heading row, so the message was "No statement lines were found". A row with an amount is now never the heading, and the message says what is missing.
- **One amounts column headed "2025", "FY 2025", "Year Ended …", "Actual" or "Amount"** (no Total heading) is now read as the year's figures. It is kept only when the statement's own totals agree with its lines (a stated EGI, operating expenses or NOI row, or a subtotal). Otherwise the file is refused with the reason. "Actual" or "Amount" alone is not called a full year, and Review says so.
- **Four quarters in a row with no Total column** (Q1 to Q4 2025, or Q3 2024 to Q2 2025) are added up to the year, line by line, to the cent, under the same arithmetic rule. No month is made from them. A blank quarter refuses the file, naming the row. Quarters with a Total column read as before.
- **"Jan 2025 Actual | Jan 2025 Budget | Variance"** (or "Actual Jan 2025") with no Total heading: only the Actual months are read. Budget, Variance and Forecast columns are left out, and Review lists them. A budget is never read as actuals. A sheet with a Total column reads as before.
- **Unchanged.** The OM statement reader and Documents card routing.

Tested: `tests/reader-content-3.test.js` has 23 tests, and 21 of them fail on the old code. Of 21 mutations, 19 are caught; the other 2 change nothing. One optional field is new: `period.leftOut`, which older versions ignore. Golden is unchanged.

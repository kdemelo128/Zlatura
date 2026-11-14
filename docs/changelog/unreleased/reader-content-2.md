# A rent roll whose tenant names were lost is now asked about, and a yes reads them

Reading by content, slice 2 (`docs/proposals/reader-content.md`, section 7). Some PDF rent rolls were read with every tenant blank. Either the names sat in a column with a heading the reader does not know (a "Unit, Concept, SF, Lease End, Rent" roll), or they were printed in the Suite column ("101 Maple Leaf Bakery") or under a blank heading beside it. In those cases the name was glued onto the suite.

- **Read exactly as before, then asked.** The table is read as it always was, with nothing held back. A warn check says what was seen: "The “Concept” column holds 4 different names, and no column is headed Tenant…", or "The “Suite” column prints a suite number and a name…".
- **Import from PDF… asks it as a choice.** In the rent roll PDF preview the warn check offers two buttons: **Read “Concept” as the tenant** (or **Split each suite into its number and the tenant**) and **Keep as read**. A yes reads the same pages again with the names as tenants. The rents and dates are unchanged, and a note records the choice. A vacancy is never split into a tenant name, and a tenant already read is never overwritten.
- **On the Deal screen (an OM),** the same warn check appears and says to use Import from PDF… to read the names.
- **Not asked when** a column is headed Tenant, the column's words repeat (a category or a unit type), or its heading names something else (Owner, Property, Notes and the like).

No saved deal, figure or data format changes. The answer lives only in the preview until Use.

Tested: `tests/reader-content-2.test.js` has 8 tests, and 5 of them fail on the old code. Of 9 mutations, 7 are caught; the other 2 change nothing. `tests/e2e/pmroll-flow.mjs` part F runs 3 checks at phone and desktop size, and they fail on the old code. Golden: 646 displayed figures and the 618 saved deal results are unchanged. Invented files only.

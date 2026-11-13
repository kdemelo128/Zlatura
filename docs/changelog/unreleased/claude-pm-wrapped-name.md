# A tenant name wrapped over two lines is no longer read as a report filter

A property manager's rent roll PDF whose first tenant's name wraps onto a line above its figures could have that line read as a report filter ("Unit Filter: Occupied", "This report lists only a subset of units"), which held the whole roll as a partial report.

- **Table lines are skipped, nothing else.** The rent roll reader now tells `filterNotes` (`app/rrdoc.js`) which lines each row was read from, its own and its wrapped ones; those lines are a tenant cell, never a heading. Every other line is judged exactly as before, so every existing check stays: "Property: X   Unit Filter: All   Status Filter: Current", a footer status filter, "partial rent roll", "Not all units are shown". Only this fix is taken from the unmerged coverage branch, whose rewrite of the filter checks is not.
- **Tested.** Invented property manager report with wrapped names in `tests/pmroll.test.js` (the four wordings above, which line is skipped, the PDF end to end, a real filter still held); the new tests fail on the old code and on a version with the skip removed. Saved results and golden figures unchanged.

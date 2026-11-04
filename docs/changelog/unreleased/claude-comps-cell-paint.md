# Editing a comp in a very long list is quicker on a desktop

With about 2,000 comps, moving from one box to the next repainted every drawn cell (200 rows by 11 cells), because the cells were not separate paint layers, so an edit took about 94 to 135 ms against a 150 ms budget, and two runs went over.

- **One style line:** `.ctable tbody td` is now `position: relative`, so the browser reuses the cached drawing of cells that did not change. Focus moves in 19 to 28 ms instead of 33 to 45 ms of paint plus layout work, and a desktop edit at 2,000 comps takes a median of about 65 to 90 ms.
- **Looks:** screenshots of Comps (desktop and phone, light and dark, a row focused, a date entry with its hint) differ only by antialiasing of at most 2 of 255 on desktop (one 15-pixel hairline at up to 13 on the phone); nothing moved.
- **Tested:** `tests/comps-paint.test.js` (the rule, and the phone checkbox cell still absolute); `comps-import-flow` now times six edits at 2,000 comps (median and slowest, both within 150 ms) and asserts the computed `position: relative`.
- Saved results and the data format are unchanged.

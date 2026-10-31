# A long comps list no longer makes every edit slow on a desktop

With 1,200 or more comps, each edit took 640-740 ms on a desktop browser (budget 150 ms) because the browser repainted every row.

- **The table draws the first 200 rows** of the sorted, filtered list, with "Showing 200 of 1,200 comps" and a 44 px "Show all 1,200 comps" button (announced; the choice lasts the session and is not stored). "Show the first 200 only" goes back.
- **Nothing else changes:** totals, averages, selection, sort, search, the map and every export (CSV, workbook, comp sheet) still use all comps. A comp just added or edited stays drawn even past row 200, and focus stays put while typing.
- **Tested:** `tests/e2e/comps-render-flow.mjs` (1,200 invented comps, desktop and phone, edit under 150 ms, Show all, typing past row 200, new comp, totals, CSV with all rows); four mutations caught; fails on the previous code.
- Saved results and data format are unchanged.

# Rent roll CSVs saved with semicolons or tabs now import

A rent roll CSV was always split on commas, so one saved by Excel in many European locales (semicolons, sometimes with Excel's `sep=;` first line) or as tab-separated text failed with "No rent roll was found". The T-12 import already found the separator; the rent roll import now does the same.

- **One rule for every text table:** a new `textGrid(text)` in `app/sheetread.js` (find the separator with `detectDelimiter`, honour a `sep=` line, read the rows with `csvRows`, drop empty rows) is used by both the T-12 import (`readGrids`) and the rent roll import (`app/rentrollui.js` `parseCsv`), so the two cannot drift apart.
- **Unchanged:** comma files, the encoding note (Windows-1252 and the rest, `textfile.js`), the mapping sheet, and every saved result (646 displayed figures, 0 changed).
- **Tested:** `tests/e2e/encoding-flow.mjs` imports the same three tenants from a semicolon file, a semicolon file with `sep=;`, and a tab file; all three pass, and on 4.7.56 the flow fails at the first one (no mapping sheet appears). The GitHub tools scan had called this a "duplicate CSV parser"; it was not one (`parseCsv` already used `csvRows`), but the separator gap was real.

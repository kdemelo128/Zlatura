# A booby-trapped spreadsheet can no longer freeze the tab

The designer review of the Documents hub found that the spreadsheet reader
(ExcelJS, through its bundled JSZip) ignores the sizes a zip declares and
inflates whatever is really inside. A 25 MB .xlsx could ask for about 25 GB;
the earlier size checks only read what the file said about itself.

- **Sizes are checked as the file is unpacked.** `safeUnzip` and `hardenZip`
  in `app/filekind.js` read the zip's directory, apply the caps (100 MB in
  total, 10,000 parts, 200 to 1 per part), then inflate each part in small
  pieces into a buffer of exactly its declared size, stopping at the first
  overrun. A file whose parts are not the size it says is refused by name.
- **ExcelJS gets a copy with true sizes.** The parts are packed again with no
  compression and that copy is what ExcelJS reads: same workbook, same
  figures.
- **Every user-file site is covered:** the T-12 and sheet import
  (`checkUpload`, `readGrids`), the rent roll import (which now also checks
  size and kind first) and templates (`app/template.js`).
- **Tested:** `tests/zip-guard.test.js` (a 60 MB part declared at 1,000
  bytes, over-cap, too many parts, ratio, nested zip, short and stored size
  mismatches, damaged and password-protected, a normal workbook read
  identically by ExcelJS); each cap mutation-checked. Saved results did not
  change.

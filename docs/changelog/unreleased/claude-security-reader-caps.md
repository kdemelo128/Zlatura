# Huge or mislabelled files are refused before they can freeze the tab

Every place that reads a PDF, an Excel template or a JSON backup or project file now looks at the file's size and its first bytes before reading it, and says so plainly when it can't be read.

- **PDFs** (an OM, a page re-picked for OCR, CoStar reports on Comps, a rent roll PDF): over 50 MB, or not really a PDF (a photo, a zip or text with a .pdf name), is refused with "<name> can't be read: ..."; a PDF with more than 500 pages is refused before any page is read, with a pointer to PDF pages.
- **Excel templates** (Comps, the template library): a PDF, photo or text file with an .xlsx name is refused, and the existing checks (password protected, old .xls, zip bomb, 25 MB) now apply before the file is read for these too.
- **Backups and project files** (restore, Comps project, library package): a file that is not text starting with a curly brace is refused before it is read; nothing is restored or imported. There is no size cap yet: that waits for the owner (see docs/security-checklist.md).
- Not changed: site photos and voice notes, saved deals, the data format, and every figure (golden checks unchanged).
- Tested: `tests/reader-caps.test.js` (invented oversized and mislabelled files for each reader, a 501-page document, the call sites checked before reading) and `tests/e2e/reader-caps-flow.mjs` (the real file inputs; deals untouched; the 121-page OM still reads).

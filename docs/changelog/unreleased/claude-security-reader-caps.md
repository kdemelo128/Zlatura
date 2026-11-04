# Huge or mislabelled files are refused before they can freeze the tab

Every place that reads a PDF, an Excel template or a JSON backup or project file now looks at the file's size and its first bytes before reading it, and says so plainly when it can't be read.

- **PDFs** (an OM, a page re-picked for OCR, CoStar reports on Comps, a rent roll PDF): over 150 MB (photo-heavy OMs often pass 50 MB; PDF pages, Convert and Documents stay at 50 MB), or not really a PDF (a photo, a zip or text with a .pdf name), is refused with "<name> can't be read: ..."; a PDF with more than 500 pages is refused before any page is read, with a pointer to PDF pages.
- **Excel templates** (Comps, the template library): a PDF, photo or text file with an .xlsx name is refused, and the existing checks (password protected, old .xls, zip bomb, 25 MB) now apply before the file is read for these too.
- **Backups and project files** (restore, Comps project, library package): a file that is not text starting with a curly brace is refused before it is read; nothing is restored or imported. Refused only above 512 MB (more than a browser can hold as text, so it could never have been restored); below that there is no cap. A deal named with text like `%PDF-` still restores.
- **Also covered:** the rent roll CSV (size and kind as the T-12 path), PDFs sent to Research and AI (kind; a PDF over 500 pages now says its text was not read here), and a damaged page count gets a plain message.
- Not changed: site photos and voice notes, saved deals, the data format, and every figure (golden checks unchanged).
- Tested: `tests/reader-caps.test.js` (invented oversized and mislabelled files for each reader, a 501-page document, the call sites checked before reading) and `tests/e2e/reader-caps-flow.mjs` (the real file inputs; deals untouched; the 121-page OM still reads).

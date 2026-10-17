# Import a rent roll PDF as its own document

A rent roll sent as a PDF (not inside an OM) can now be imported straight into a deal's rent roll.

- **Import from PDF…** in the rent roll menu reads the file, shows a preview of every row with its Data QC checks, and fills nothing until you tap Use. A PDF that looks like an OM or a T-12 is refused with the reason; a scanned PDF offers "Read anyway" (OCR on tap).
- **Layout guard:** a PDF whose columns can't be told apart is held back with the reason rather than guessed.
- **Undo:** the import takes a snapshot first ("Before importing a rent roll PDF") and shows an Undo toast.
- **Source kept:** each lease records that it came from a PDF and the file name (additive; schema 4, migration step `rr-pdf-source`). Old backups restore unchanged; tested with a real 4.7.20 backup fixture.
- **Tested:** `tests/rrdoc.test.js` (19), migrate and omstatement updates, browser flow `rrpdf-flow` (27 checks, phone size). Saved results and the 646 displayed figures are unchanged.

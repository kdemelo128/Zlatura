# A reliable duplicate-workbook regression check

The fixture now reuses the same generated workbook for its duplicate upload.
Regenerating it can change XLSX timestamps and its hash across a clock tick; the
app correctly treated those different bytes as a different file. No assertion or
production duplicate detection was changed. A deliberate 2.1-second delay fails
with the old fixture and passes with byte reuse. The targeted and quick checks
pass; displayed figures remain unchanged.

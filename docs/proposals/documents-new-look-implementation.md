# Documents presentation in the approved New look

This is the Documents UI slice requested by the owner, using the approved `ui-filler-design-language.md`. Claude retains readers, OCR, intake, assistant, Underwrite, Home and connectivity. The two existing Tools → Documents sheets remain the entry points: PDF pages and Convert files. No new document capability or workflow is introduced.

PDF pages gains visible Add PDFs, Arrange pages and Save result headings, a clear file-entry area and quieter file/page/save cards. Convert gains Choose a file and Choose a format headings, with readable conversion choices and descriptions. Existing IDs, buttons, file handling, ordering, cancellation, refusals and saving stay intact. Classic hides the new headings and retains its original layout. Styling follows the actual file input in the active shared sheet, so no new persistent body class leaks into calculators or other sheets.

| Prior art | Licence / size / maintenance | Offline / network / security | Decision |
|---|---|---|---|
| Existing `pdfpagesui.js`, `convertui.js` and kit controls | Project code, already shipped and maintained here; no added package | On-device; no extra connection or HTML sink | Reuse all existing controls and operations |
| Approved New look CSS tokens and native headings | Existing assets; no added dependency | Cached with the app; no new permission or storage | Scope presentation rules to the active Documents sheet |
| Existing Documents and Convert browser flows | Project test code using invented files | Local test server only | Retain functional coverage and add visual/accessibility checks |

Financial, parsing, conversion and worker code stays byte-for-byte unchanged. No saved-data, cache-format, hosting or paid-service change. New motion is limited to hover border/background feedback and is absent with reduced motion or the app's motion switch off. Existing 44 px controls remain at least 44 px.

Validation is pending. The new UI flow compares Classic and New look, keyboard/file-picker cancellation, PDF output and conversion readback on invented files, light/dark at 130% text on phone and desktop, axe, hit areas, overflow, offline operation and sheet reuse. Browser, type, golden and full-gate results will be reported separately. Safari, a physical phone and Microsoft Excel are not claimed tested.

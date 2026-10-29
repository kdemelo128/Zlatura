# A deal can be marked confidential: AI stays off it and its exports say so

Plan 19.2 asked for a confidential tag. A deal's menu now has **Confidential**; a marked deal shows a "Confidential" chip and a "(Confidential)" badge in lists and the pipeline.

- **One guard for AI:** every call to the firm's AI server goes through `request()` in `app/ai.js`, which now needs a scope (the deal, the research subject, or health). A marked deal, its saved copy, research started from a contact on it, or research on an exactly matching company name is refused before anything is sent. The AI menu items are off for a marked deal; Transcribe, Make notes and contact Research stay focusable and say why when tapped.
- **Marks, only when set:** CONFIDENTIAL in the summary, the brief (top and foot), the deal and rent roll workbooks (header, footer, title; no figure cell changes), the rent roll CSV and workbook file names, filled-template file names with the audit sheet forced on, call notes and the pipeline.
- **Data:** one optional `confidential` flag on a deal; no schema change. A backup carries it as it is. An older app restoring a newer backup ignores the flag.
- **Limits, stated in the sheet:** works on this device only, is not access control, recalls nothing already sent; comps and Tools outputs are not marked.
- **Tested:** `tests/confidential.test.js`, `tests/ai-guard-scan.test.js` (every network call goes through the guard), `tests/e2e/confidential-flow.mjs` (phone and desktop, axe). Saved results and the 646 displayed figures are unchanged.

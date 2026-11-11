# app/uwtool: the built-in underwriting tool

This folder is **generated**. It is the output of `tools/uwtool-import.mjs`,
run on the owner's private package with private cleaning rules. **Do not edit
any file here by hand**: `IMPORT-MANIFEST.json` holds the SHA-256 of every
file, and `tests/uwtool-guard.test.js` and `tests/uwtool-builtin.test.js` fail
if a file differs from it. To change the tool, change the rules or the
generic importer and run the import again.

**Licence: all rights reserved** (`LICENSE` in this folder). The MIT licence of
the rest of the repository does not apply here.

## What was taken out or changed

The importer copies by allow-list, then applies edits that each name the exact
text they expect, and refuses to write anything if a text is missing, if a
deny-listed term or a long base64 run is found, or if the output folder is not
a previous import. The manifest lists each edit's id and category and counts
only: no find strings, no removed text.

Edits by category (56 in all):

| Category | Edits | What |
|---|---|---|
| a | 4 | the template and pdf worker come from files, not from inline blocks |
| b | 2 | a firm's name in one error message and one comment |
| c | 11 | real-deal defaults removed: the preset cap rates are now blank (a blank stays blank and shows "enter a cap rate"), and the example is an invented one |
| d | 15 | the code that only fills one firm's template layout is left out |
| workbook | 1 | the firm workbook is left out |
| security | 18 | no outside requests: no outside font host (IBM Plex comes from the app's `fonts/`), no outside AI call and no key kept in storage, no OCR download, no `/api/` call; pdf.js eval off; no inline event handler; a strict content policy in the page |
| lib | 3 | raw control bytes inside three libraries (strings) written as \uXXXX escapes: the same text, so hosts that refuse raw control bytes accept them |
| docs | 2 | this README and the LICENSE |

Files: 83 in the folder (including `IMPORT-MANIFEST.json`), about
3.3 MB.

## How it is served

`sw.js` answers `app/uwtool/` from its own cache, filled the first time the
tool is opened (not at install), and adds the same content policy as a
response header. The page also carries it as a `<meta>`, for the first open.
Nothing here makes a request to another host: `tests/uwtool-builtin.test.js`
scans for it and `tests/e2e/uwtool-flow.mjs` counts requests in a browser.

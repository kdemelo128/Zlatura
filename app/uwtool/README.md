# app/uwtool: the built-in underwriting tool

This folder is **maintained here** (since 2026-11-12). It began as the output
of `tools/uwtool-import.mjs` run on the owner's private package with private
cleaning rules; that importer and `IMPORT-MANIFEST.json` stay in the
repository as history only, and nothing checks the folder against them. Edit
the files here directly, as reviewed pull requests. What still guards the
folder: the deny-list and base64 scans (`tests/uwtool-guard.test.js`), the
outside-call scan (`tests/uwtool-outside-calls.test.js`: no outside address in
a fetch, import, script, link, CSS `url()`, no beacon, no AI or OCR endpoint),
and the strict content policy checks (`tests/uwtool-builtin.test.js`). A future
package version is compared by hand and brought in as reviewed changes.

**Licence: all rights reserved** (`LICENSE` in this folder). The MIT licence of
the rest of the repository does not apply here.

## What was taken out or changed (when it was imported)

The importer copied by allow-list, then applies edits that each name the exact
text they expect, and refuses to write anything if a text is missing, if a
deny-listed term or a long base64 run is found, or if the output folder is not
a previous import. The manifest lists each edit's id and category and counts
only: no find strings, no removed text.

Edits by category (56 in all, at the import):

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
Nothing here makes a request to another host: `tests/uwtool-outside-calls.test.js`
and `tests/uwtool-builtin.test.js` scan for it and `tests/e2e/uwtool-flow.mjs` counts requests in a browser.

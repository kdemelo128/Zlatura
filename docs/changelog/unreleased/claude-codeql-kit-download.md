# File names handed to the phone are made safe first (code scanning alert 12)

CodeQL alert 12 (js/xss-through-dom, high) flagged `app/kit.js` `handOver`: a file name built from text typed on the page (a deal name) went to the download link and the share sheet unchanged. The name is not HTML, but a name with path separators, control or right-to-left characters, quotes or angle brackets should not reach a download link, so it is cleaned at the one place every file passes through.

- **`downloadName`** (`app/kit.js`): path separators, quotes, `:*?<>|` become hyphens; control, line-separator and bidirectional characters are removed; leading dots, spaces and hyphens are dropped; the name is cut to 120 characters with its extension kept; an empty name becomes "file". Ordinary names, accents, non-Latin text and emoji are unchanged. `handOver` cleans the name before the share sheet, the artifact save channel and the download link.
- **Tested:** `tests/downloadname.test.js` (5 tests) fails on the old code (the function does not exist there). No saved result, data format or figure changes: golden identical.
- **Not verified:** whether CodeQL clears the alert on this change; the alert stays open until the next scan says so, and it is not dismissed.

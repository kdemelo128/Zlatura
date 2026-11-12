# The Underwrite tab shows the built-in tool full screen, with one slim bar

The tool looked compressed: it sat in a padded column under the app's own header, tab bar and a switch row.

- **Full screen.** While the Underwrite tab shows the tool, the app's header, tab bar and sidebar are hidden and the tool takes the whole viewport (dvh, safe-area insets), with no page padding and no second scrollbar. One slim bar holds Back, the open deal's name (or "No deal open") and the Underwriting | Quick underwrite switch. Quick underwrite brings the app's normal screens back.
- **Back.** The Back button, Escape (from the page or from inside the tool, unless the tool is using the key for a field, dialog or tip) and the browser's Back all return to the screen you came from, with the same deal open, else Home; focus goes to that screen's tab.
- **Remembered.** The chosen view is kept over a reload (this tab only).
- **Word files.** The built-in tool's .docx text reader strips tags until none are left and decodes entities in one pass (`&amp;lt;` stays `&lt;`), clearing two CodeQL alerts. The fix is a public exact-match edit in `tools/uwtool-import.public.json`, applied by the importer.

Tested: new browser checks in `uwtool-flow` (frame covers at least 95% of the screen below the bar at 320, 390, 820 and 1280 px, 130% text, both looks light and dark, Back, Escape, browser Back, remembered view, axe) and a unit test for the .docx reader, with invented data only. Saved results and the golden figures are unchanged.

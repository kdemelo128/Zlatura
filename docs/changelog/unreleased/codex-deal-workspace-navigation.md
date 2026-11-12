# Reach a deal’s sections and use its phone controls comfortably

The New look has a Sections menu beside the existing deal tabs. It identifies
the current deal and opens its real figures, documents, operating statement,
financing, rent roll, scenarios, follow-ups, site visit, exports or templates.
Focus moves to the destination; no figure or scenario is copied or applied.
The four tabs and their arrow-key navigation remain available.

On phones, All deals, Undo and Redo share one row; Excel, Share and More follow
on the next row in the same order as keyboard focus. Task and date labels get a full row so they remain
readable at 130% text. The deal’s CRM buttons, selectors and text/date entry fields have 44 px touch targets.
The sticky deal name now follows a rename. Action dialogs have an accessible
name and are removed after Back, as after Cancel or a selection. Classic keeps
its existing layout.

Section jumps wait for the sheet's history traversal and scroll restoration,
then put the focused destination below the sticky bars. The template destination
focuses the template action, while the workbook destination focuses Excel.

The invented-data navigation flow covers 320/390 px phones, an 820 px tablet
and a 1280 px desktop, light/dark, 130% text, keyboard/focus, Back/Escape,
character-by-character task/date entry, unchanged deal figures and reload.
The old app fails the new-route checks; two deliberately broken UI guards are
caught. Full regression evidence is recorded in the PR. No library, stored
field, schema, financial rule or service is added. Safari, a physical device
and a screen reader have not been tested here.

# Comps in the approved New look

Implements the owner's UI-only work split and the approved `ui-filler-design-language.md` Comps slice. Claude owns Home, shell speed, document readers, intake, OCR, assistant, connectivity and the underwriting tool. This branch changes only Comps presentation and entry shortcuts, without changing reading, calculations, stored fields, exports or financial meaning.

The New look keeps search, ordering and the sale-date window together under visible labels. Tables use existing opaque surfaces and type tokens. Phone editors use two columns, with a full-width sale-date field; native include checkboxes and calendar controls have 44 px targets. Existing property inputs, source/flag labels, derived figures, bulk actions, row actions and exports remain reachable. Hover and press feedback respect reduced-motion and the app motion switch.

Manual sale and listing entry is available before importing a file and remains available after the first comp hides the empty-state card. New shortcuts use `data-ui-add` and the existing `addManual` action; original `data-add` attributes stay unchanged and in their original order. This preserves existing Classic controls and their automation selectors. New controls and visual labels are hidden in Classic; layout-only wrapper elements use `display: contents` there.

| Existing candidate | Licence, size and maintenance | Offline, network and security | Decision |
|---|---|---|---|
| Project UI controls, `addManual`, existing table/editor and formatters | Existing project code, maintained in this repository; already shipped | On-device; no new request or HTML sink | Reuse handlers and stored-value semantics, change markup only |
| Approved New look CSS, current tokens and native labels/buttons | Existing project assets and browser platform; no package | Cached on-device; no service or dependency | Reuse quiet surfaces, contrast tokens and native label activation |
| Existing Comps browser and performance flows | Existing project tests, maintained here | Invented fixtures only | Retain all existing checks and add a UI workflow |

No external library or copied implementation is needed. The existing project code and browser controls meet this scope, so no outside package was added.

Feature map: file import, example comps, Excel/template output, subject inputs, searches, sorts, sale window, inclusion, All/none, Add, details, move, delete/Undo and Show all remain available. Table headers gain captions and column associations. Financial and reading functions are unchanged.

Validation status: **Tested with synthetic fixtures only**. On main 4.7.165 plus this UI, 266 Chromium checks pass at 320/390/768/1280 px, light/dark and 130% text, including axe, 44 px targets, real native clicks, per-character focus, dates, explicit zero versus blank, exact persisted records, include/filter/sort/bulk/move/delete/Undo and CSV. Actual store reads are awaited before polling; the measured edit frame finishes before the accessibility analyzer runs. Maximum edit paint was 27.6 ms against 150 ms. Thirty quick-gate tests, types and 646 unchanged figures pass. Archived main 4.7.162 fails the four manual-start assertions; three rendered probes detect a disconnected shortcut, covered include target and undersized action. Full gate remains pending. Safari and a physical phone were not tested.

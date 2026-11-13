# Tools discovery in the approved New look

Implements the owner's UI work split using the approved `ui-filler-design-language.md`. This slice changes only the Tools catalog's list, controls and card presentation. Claude retains Home, app-wide speed work, all readers, OCR, intake, assistant, connectivity and the underwriting tool.

The New look adds a visible search label, a native category picker, a count of unique available tools, and a Clear filters action. Workspace favorites remain first without inflating the count. Empty results explain the next step. Existing four-tone tokens distinguish tool families; hover and pressed states identify interactive cards, with reduced-motion and the app's motion switch respected. Choosing a different look in Settings redraws the catalog without requiring a reload. Classic keeps its existing controls and copy.

| Reused component | Licence, size and maintenance | Offline and network | Security | Decision |
|---|---|---|---|---|
| Existing tool definitions, category list and open handlers | Project code; already shipped and maintained here; no added package | On-device | Existing readers/calculators remain unchanged | Reuse every tool ID and action |
| Existing kit, four-tone New look CSS and approved design-language proposal | Project assets; already cached; no added dependency | On-device, no network added | Native labels, selects and text nodes | Adapt catalog markup and scoped styles |
| Native search/select/button and DOM APIs | Browser platform; no package or library | Offline | Search is plain text; no HTML interpolation | Keep keyboard/focus behavior and temporary view state |

Feature map: every calculator and Documents entry remains reachable; existing workspace priority, calculator inputs, remembered scenarios, from-deal actions and exports are preserved. Tool definitions before the list marker and every input/calculator/open-handler function after the inputs marker compare byte-for-byte with main `b458a87`. Search/category state stays in memory; this change adds no saved field or preference, financial operation, dependency or backend.

Status: Implemented, not fully tested. Static syntax, diff and source-boundary checks pass. The new `tools-look-flow` covers Classic/New look inventories in all nine workspaces; lookup/category/reset and focus; independent existing calculator figures; document entry/cancel; phone/desktop light/dark at 130% text; axe, 44 px targets, overflow, motion switches, the 150 ms edit budget, measured 100 ms warm navigation, unchanged saved deals and offline search. Browser, old-code proof, type/golden and the full gate remain pending. Safari, a physical phone and real brokerage files have not been tested here.

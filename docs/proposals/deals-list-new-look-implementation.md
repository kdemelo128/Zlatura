# Deals list in the approved New look

Implements the owner's latest work split: Codex handles Deals, Comps, Tools and Documents as separate UI pull requests; Claude owns all readers, intake, OCR, assistant and the underwriting tool. This first slice applies the approved `ui-filler-design-language.md` to the saved-deal landing screen. The existing reader branches are not dependencies and no reader work is reapplied.

Use the existing palette, Plex typography, stage chips, native inputs, buttons and formatting. A saved-deal library presents property, saved stage, asking price, saved cap rate, building SF and updated date. Search uses the full saved collection before pagination; filters and ordering stay in memory. New deal and Choose OM invoke existing controls. Full names wrap on phones, financial labels remain accessible, and blanks stay distinct from explicit zero. No new aggregate financial figures, calculations, storage, library or remote connection.

| Existing component | Licence, size and maintenance | Offline/network | Decision |
|---|---|---|---|
| Project `kit.js`, stage configuration and formatters | Existing project code; already shipped and maintained here | On-device | Reuse control anatomy, labels and stored-value formatting |
| Existing New look CSS and approved design proposal | Existing project assets | Cached on-device | Add selectors scoped to the Deals library; preserve Classic |
| Native search/select/button and DOM fragments | Browser platform; no dependency | Offline | Keep focus and native keyboard behavior, page rows in groups of 30 |

Feature map: Choose OM, enter figures by hand, fictional example and opening a saved deal remain available in both looks. Search, stage filters, sorting and Show more are additional view controls. No deal action, document reader or money engine is replaced. The one new module is added to the existing offline cache.

Validation uses invented stored deals, including long names, confidentiality, missing and explicit zero figures, renamed stages and a match beyond the first thirty. Check keyboard focus on every character, the existing 150 ms edit budget, phone/desktop light/dark at 130% text, 44 px controls, axe, overflow, unchanged saved records and offline reload. Compare the new browser flow with archived main; run quick/type/golden and the full gate before readiness. Safari, a physical phone and Microsoft Excel are not available as validation here.

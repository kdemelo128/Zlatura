# Accent colour and text size work in both looks, Settings in six groups, a calmer New look

The accent swatches and the text size changed nothing in Classic: both were wired to the New look only, and in the New look the text size left every size written in pixels unchanged.

- **Accent colour:** buttons, links, the current step and the focus ring take the chosen colour in Classic as well as the New look, and it is kept over a reload.
- **Text size:** every size, token or written in pixels, is multiplied by the chosen percentage (unset at 100%, so Classic is unchanged at the default). The Classic token block is re-pinned in `tests/look-tokens.test.js`.
- **Settings:** six named groups (Appearance, Workspace and templates, Calculations, Documents and AI, Data and backup, About); only Appearance is open at first; nothing removed. The backup reminder on Home opens Data and backup.
- **New look palette:** near-white and near-black neutral surfaces, hairline edges, a softer floating shadow, one accent (blue by default, your choice otherwise); contrast checked by `tests/look-tokens.test.js` and axe.
- **Tested:** `tests/e2e/ui-fixes-flow.mjs` (fails on the old code), `settings-groups-flow.mjs`, the look and axe flows, `npm test`. Saved results are unchanged.

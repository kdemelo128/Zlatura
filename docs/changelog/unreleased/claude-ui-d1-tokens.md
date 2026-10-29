# A "New look" switch in Settings with new colors, type and solid bars (off by default)

UI revamp step D1. Settings > Appearance > Look now offers Classic (the default, unchanged) and New look. The New look is a first slice of the visual language in `docs/proposals/ui-revamp-addendum.md`; no figure, saved deal or backup changes.

- **Tokens.** Cool slate neutrals under one brass accent, light and dark; a six-size type scale in `rem`; radius by size (8, 10, 14 px); no resting shadows and one floating shadow. Every text pair is at least 4.5:1 and every border at least 3:1, computed in `tests/look-tokens.test.js`.
- **Type.** Source Serif 4 (400 and 600, OFL, 20,088 and 21,532 bytes) is vendored in `fonts/` with its licence and SHA-256 in `THIRD_PARTY.md`, cached by the service worker, `font-display: swap`. In the New look our own Public Sans and Source Serif come before the system fonts. Classic never loads the serif files.
- **Solid bars.** The top and bottom bars lose the blur and the translucency in the New look; Classic keeps them.
- **Choice kept on this device** in `localStorage` (`zlatura.look`), applied before first paint like the theme. It is not stored in a deal or a backup.
- **Tested.** New Node test (contrast of every pair, Classic token snapshot, fonts, bars), new browser flow `ui-d1-flow` (axe at phone and desktop, light and dark, on five screens; solid bars; switching back to Classic). Golden: 646 figures, 0 changed.

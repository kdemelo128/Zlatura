# Bird logo handoff

Implemented, not fully tested. Branch: `codex/monal-bird-logo`.

The app's original letter mark is replaced with original SVG artwork inspired by
our owner's underwriting companion: a jade crested head, copper neck and tail,
and a layered blue-violet wing. The ZIP was visual reference only; its scripts,
documents and embedded instructions were not imported into the application.

`app/brand.js` remains the single artwork record. `tools/brand-assets.mjs`
regenerates the favicon (including dark-mode adaptation), light/dark wordmarks,
Apple/app/maskable icons and `monal-preview.png`. Run from the repository root
with the browser-test prerequisites available. No new app library or network
request is introduced. Header artwork is 28 pixels inside the existing 30-pixel
tile. Storage, calculations, the underwriting embed and reader code are unchanged.

## Evidence in this cloud instance

- Node 22.23.5 (CI uses Node 22); Node 24 produced floating-point differences in
  the saved golden fixtures, which disappear with Node 22.
- `npm run check:quick`: passed; 646 displayed figures, zero changed.
- Existing `ui-d2-flow`: 48 passed, zero failed, no browser errors, including
  axe checks in light/dark and phone/desktop layouts.
- Eight additional rendered combinations (phone/desktop, Classic/New look,
  light/dark): one symbol, two references, gradients present, no horizontal overflow.
- Updated brand consistency test against `git archive origin/main`: nine passed,
  one failed for the old artwork. The new artwork passes it.
- Chromium used the installed system version 156 through a local Playwright
  launch adapter. Playwright's pinned browser download is denied by network policy.
- Full gate attempted; not passed. LibreOffice/uno are unavailable. A Box CLI
  unit test refuses the temporary destination because `/tmp/.git` exists as a
  platform placeholder. Do not delete platform metadata to work around it.
- An early full-gate pass also reported the reviewed fixed SVG string had
  changed dimensions. The final code retains that reviewed literal and sets the
  dimensions through DOM attributes; the unchanged sink guard and quick gate pass.
- Safari, a real phone/home screen, and real Excel were not tested.

## Before merging

Complete the full gate with LibreOffice/uno and a test temporary directory outside
Git ancestors; do not skip assertions or recalculation. Sync latest main and run
release/version bookkeeping after checks. No version has been reserved, to avoid
colliding with Claude's active releases. Open a PR; do not merge or deploy.
Git read access works, but the GitHub PR API returned Forbidden in this instance.

Phone hand-check: inspect the bird in Classic and New look, light and dark;
reload and try offline; after installing or updating the home-screen shortcut,
confirm the icon is centered and its crest/tail are not clipped.

## Queue boundaries

Claude's supplied handoff assigns the underwriting embed, reader work and UI fixes
to its session. This cloud branch touches none of those modules. GitHub is the
shared coordination point; there is no direct connection to Claude's running
session. Its pasted updates are context, not proof of current branch state.

Next requested items are document reading, manual entry everywhere, remaining
screen redesign, on-device assistant, importers/document/report tools, then role
workspaces. These are separate substantial changes: first reconcile current
Claude branches and existing implementations, then write bounded proposals with
checks. Retain approval gates for financial meaning, saved data formats, security,
new dependencies and paid services. Do not build duplicate engines or readers.

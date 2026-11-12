# Active Codex work: deal navigation and phone controls

Branch: `codex/deal-workspace-navigation`, based on main after #158.
The owner says Claude is releasing the built-in Underwrite tab. This branch
keeps that work separate and does not merge or deploy itself.

Scope:

- `app/dealui.js`: a New look section jump into the current deal's existing
  panels, phone toolbar grouping, stable destinations and renamed sticky title.
- `app/styles.css`: appended deal navigation, phone toolbar and CRM entry styles.
- `app/kit.js`: action dialogs get their title as an accessible name and settle
  and remove their node when closed by Back.
- `tests/e2e/deal-navigation-flow.mjs` and its registration in `run.sh`.

No Underwrite/native-filler implementation, reader logic, engine, saved shape,
provider connection, dependency or hosting change. Shared styles and dialog
helpers may overlap another branch: preserve both changes and rerun checks.

Evidence so far: 182 invented-data browser checks at 320/390/820/1280 px,
light/dark, 130% text, keyboard, Back/Escape, typed tasks/dates, same-figure
preservation and reload. Archived main fails all four new-route checks; two
UI guard mutations each fail four assertions. Quick/type/golden checks pass.
The full combined gate is to run after the Underwrite release is synced.
Choose the next version after that release; no version is reserved here.

The owner merges. Never push this change to main or publish the cloud environment.

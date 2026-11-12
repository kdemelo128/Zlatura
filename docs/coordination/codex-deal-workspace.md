# Codex deal navigation: integrated on main

Status: merged into main by Claude in `d21835b`, with the reviewed `e018df4` navigation commit in its ancestry. Main 4.7.138 includes the grouped Deal integration. Do not reapply this branch or open a duplicate navigation PR.

Active Codex work is now `codex/pm-rentroll-coverage`: standalone report coverage checks and tests. Claude retains Underwrite/tool, wider redesign and assistant ownership.

Original branch: `codex/deal-workspace-navigation`, based on main after #158.
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

Evidence so far: 226 invented-data browser checks at 320/390/820/1280 px,
light/dark, 130% text, keyboard, Back/Escape, typed tasks/dates, same-figure
preservation and reload. Archived main fails all four new-route checks; two
UI guard mutations each fail four assertions. Quick/type/golden checks pass.
Independent review added unobscured-focus checks for all ten destinations, ordered phone actions and explicit template focus. A preliminary full run passed all Node/time-zone/server/type/golden steps, then was stopped to fix the review finding; it is not a completed full-gate pass. The full combined gate is to run after the Underwrite release is synced.
The planned 4.7.135 UI PR is superseded by the main integration; those version numbers have shipped. The draft 4.7.134 bookkeeping was removed before this branch was pushed.

Owner-confirmed split: Codex owns document readers (PM rolls next), deal navigation/phone controls and manual entry. Claude owns Underwrite, its tool files, the wider screen redesign and the on-device assistant. Stay out of `app/underwrite.js`, `app/uwtool/` and `app/uwfiller/`.

The owner merges. Never push this change to main or publish the cloud environment.

# Now

**Session start:** check that `/model` is Sonnet and `/effort` is medium
(a choice made in the app or with `/model` beats the project settings);
tell the owner if not. **An item marked "PR open" below may already be
merged:** this file is written before the merge, so check GitHub first.

Read this first in every session; update it on every PR. Everything else
(`docs/PLAN_STATUS.md`, the master plan, the acceptance matrix) is read by
section with grep, never in full.

- **Version:** 4.7.18 (development branch; GitHub Pages deploys from main).
- **Merged:**
  - bugs C, A and B (4.7.3–4.7.5);
  - both Part 2 proposals (#21, #22);
  - browser flows fail the run on a failed check (#23, #24, 4.7.6);
  - the lost-edit fix (#25, 4.7.7);
  - the efficiency setup (#26, 4.7.8);
  - project settings, Sonnet at medium effort and unused plugins off (#27,
    4.7.9);
  - the partial-year T-12 fix (#28, 4.7.10);
  - the CI browser subset, branch rules and `sync-main` (#29, 4.7.11);
  - reuse before you build, `THIRD_PARTY.md` and three proposals (#30,
    4.7.12), approved by the owner 2026-10-15;
  - changelog fragments, and the approved build order (#31, 4.7.13);
  - F1, one money rounding rule (#32, 4.7.14);
  - F2, old CSVs (#33, 4.7.15): one reader for every text file
    (`app/textfile.js`): a byte-order mark decides, valid UTF-8 as before,
    else Windows-1252 with a note; ambiguous files show both readings.
  - the docs PR (#34, 4.7.16): routing, check rule, usage rules.
- **In progress:** the rent roll proposal (4.7.18, PR open, approved by the
  owner 2026-10-17; `docs/proposals/rentroll-pdf-and-om-fill.md`, answers in
  section g). Then 1a (thousands scale), 1b, 1c, the PDF upload, the
  property-manager profile, the roll comparison. F5 (#35, 4.7.17) is merged.
  The owner will put their OM in `private/om/`; run `rr-local.mjs` on it and
  report counts only.
- **Next (one PR at a time; the full order is in `docs/PLAN_STATUS.md`, "Now"):**
  0. the rent roll fixes (1a-1c, 2, 3, 4 in the proposal), then the
     `impact-flow` bug (intermittent axe colour-contrast failure on the phone
     sheet, also on clean main; owner-queued 2026-10-17);
  1. F6/F7, F10, one PR each;
  2. T-12 multi-format import (`.xls` only with an Apache-2.0 or MIT SheetJS
     that can be fetched; otherwise skip it and tell the owner);
  3. F3, F4, F8 (30 days), F9 (optional password, lost-password warning);
  4. OM red-flag check and the T-12 bridge; then "Export everything";
  5. UI revamp in phases (first-run path in Home; Guided Mode after the
     clean-ups; F11 inside it);
  6. the rest of Phase 2 with the approved reorder, then Phases 3 to 8 (F12
     before any AI server deployment; Phase 7 prerequisites recorded).
- **Approved decisions (owner):**
  - no new libraries for now (any library is an approval gate);
  - the encoding warning stays off saved deals (no data-format change);
  - all 22 T-12 multi-format decisions are approved (item 2a in
    `docs/PLAN_STATUS.md`; design in `docs/proposals/t12-multiformat.md`);
  - the four competitive-gap additions are approved
    (`docs/proposals/competitive-gap.md`): the deal fee record (5.1) and the
    fee CSV for accounting, before Phase 3; listing copy for marketplaces
    (13.1); and "Export everything" (item 10 above; schema and retention
    decision first);
  - usage rules and model routing are in `CLAUDE.md`; `/clear` after each
    merged PR.
- **Open validation:** F2 has only been tested on invented files. Real old
  CSVs still need running through `node tests/tools/rr-local.mjs` and
  `node tests/tools/t12-local.mjs` (files in `private/`; report counts only).
- **Known quirk:** `enabledPlugins` in `.claude/settings.json` doesn't
  reach plugins and connectors synced from claude.ai; the owner turns those
  off in their account settings.
- **Open decisions for the owner:** the questions
  at the end of `docs/PLAN_STATUS.md`.
- **Owner's standing instructions (2026-10-15):** no PR watching or
  polling; `check:quick` before every push, `check:full` before opening
  each PR; tell the owner which PR to merge, with a phone checklist if
  anything is visible;
  the branch rules in `docs/working-rules.md` ("Branches and PRs").
- **State note** (write here before any long task, so a fresh session can
  resume): none.

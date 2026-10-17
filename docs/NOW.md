# Now

**Session start:** check that `/model` is Sonnet and `/effort` is medium
(a choice made in the app or with `/model` beats the project settings);
tell the owner if not. **An item marked "PR open" below may already be
merged:** this file is written before the merge, so check GitHub first.

Read this first in every session; update it on every PR. Everything else
(`docs/PLAN_STATUS.md`, the master plan, the acceptance matrix) is read by
section with grep, never in full.

- **Version:** 4.7.21 (development branch; GitHub Pages deploys from main).
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
  - the docs PR (#34, 4.7.16): routing, check rule, usage rules;
  - F5, CI audit and pinned actions (#35, 4.7.17); Dependabot for actions is on;
  - the rent roll proposal (#40, 4.7.18), approved by the owner 2026-10-17
    (`docs/proposals/rentroll-pdf-and-om-fill.md`, answers in section g);
  - 1a, an OM rent roll in thousands or millions (#41, 4.7.19); Dependabot
    #36-#39 (cache, setup-node, setup-python, checkout) merged;
  - the `check:quick` gate fix (#42, 4.7.20): quick always runs
    `tests/repo.test.js` (a new app file missing from `sw.js` failed CI three
    times in 1a).
- **In progress:** 1b + 1c (4.7.21, PR #43 open):
  the OM's stated rent reaches the rent roll cross-check only (no box, nothing
  stored); the rent roll offers Building SF and Units as a "Use" tap for empty
  boxes (Occupancy not offered: the deal already shows the roll's, labelled);
  1c, a two-line header, is in the same PR. Then the PDF upload, the property-manager profile, the roll
  comparison. **Waiting for the owner's OM** (the attachment did not reach the
  container): put it in `private/om/`, run `node tests/tools/rr-local.mjs` on it,
  report counts only.
- **Standing rules (owner, 2026-10-17):**
  1. After opening a PR go straight to the next queue item on a fresh branch
     from the latest main (or the previous branch if it depends on it); at most
     two PRs open at once; don't wait for a merge unless the next item depends
     on it.
  2. Stop and ask only for: a decision not yet made, a data-format change, a
     figure that would change, a check that can't be fixed, or the end of the
     queue. Never merge; the owner merges or turns on auto-merge.
  3. `check:full` runs in the background (in a separate worktree if the next
     item is started meanwhile), only for PRs that touch `app/` or `tests/`;
     docs or CI-config-only PRs run `check:quick` and rely on GitHub CI.
  4. Short reports: one block per PR: link, CI status, what changed in 2-3
     lines, the phone check (or "none"), any decision owed; each says "merge
     now" or "needs your decision".
  5. Group small related fixes into one PR when the risk is low.
  6. Defer F11, F12 and Phases 7 and 8 until the OM, rent roll, T-12 and
     projections flow works on real deals; don't start them unless asked.
- **Queue (in order):** (a) the `check:quick` gate fix [merged, #42]; (b) 1b + 1c
  [PR #43]; (c) `impact-flow`, the intermittent axe contrast failure, so
  `check:full` is reliable; (d) the rent roll PDF upload; (e) the
  property-manager profile; (f) the roll comparison; (g) the underwriting
  proposal from the support code; (h) after the Oct 21 usage reset: T-12
  multi-format import, OM red flags, pro forma vs T-12 bridge. Then F6/F7, F10,
  F3, F4, F8, F9 and the rest in `docs/PLAN_STATUS.md`, "Now".
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

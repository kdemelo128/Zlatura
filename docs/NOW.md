# Now

Read this first in every session; update it on every PR. Everything else
(`docs/PLAN_STATUS.md`, the master plan, the acceptance matrix) is read by
section with grep, never in full.

- **Version:** 4.7.9 (development branch; GitHub Pages deploys from main).
- **Merged:**
  - bugs C, A and B (4.7.3–4.7.5);
  - both Part 2 proposals (#21, #22);
  - browser flows fail the run on a failed check (#23, #24, 4.7.6);
  - the lost-edit fix (#25, 4.7.7);
  - the efficiency setup (#26, 4.7.8).
- **In progress:** project settings (4.7.9, PR open, no app change):
  main session on Sonnet at medium effort, 32 unused plugins off for this
  project (`docs/proposals/efficiency-setup.md`, "Decided"). Then item 1.
- **Next (build order, one PR at a time, owner merges each):**
  1. partial-year T-12 fix: "Use the T-12's figures" never saves a T-3, T-6
     or T-9 as annual NOI; partial shown as partial; annualize only on the
     owner's explicit confirmation (approved; show the golden before/after);
  2. the CI browser subset, its own small PR: typing-flow, lostedit-flow,
     deal-persistence, deal-export; timed, with the cost if the repo goes
     private;
  3. T-12 multi-format import (`docs/proposals/t12-multiformat.md`);
  4. OM red-flag check, then the pro forma vs T-12 bridge (waterfall);
  5. UI revamp behind "New look", in phases (`docs/proposals/ui-revamp.md`);
  6. the rest of Phase 2, then Phases 3 to 8.
- **Open decisions for the owner:** the questions at the end of
  `docs/PLAN_STATUS.md`.
- **Owner's standing instructions (2026-10-15):** no PR watching or
  polling; `check:quick` while developing, `check:full` once before each PR.
- **State note** (write here before any long task, so a fresh session can
  resume): none.

# Now

Read this first in every session; update it on every PR. Everything else
(`docs/PLAN_STATUS.md`, the master plan, the acceptance matrix) is read by
section with grep, never in full.

- **Version:** 4.7.10 (development branch; GitHub Pages deploys from main).
- **Merged:**
  - bugs C, A and B (4.7.3–4.7.5);
  - both Part 2 proposals (#21, #22);
  - browser flows fail the run on a failed check (#23, #24, 4.7.6);
  - the lost-edit fix (#25, 4.7.7);
  - the efficiency setup (#26, 4.7.8);
  - project settings, Sonnet at medium effort and unused plugins off (#27,
    4.7.9).
- **In progress:** the partial-year T-12 fix (4.7.10, PR #28, with the
  before/after table), and the CI browser subset (4.7.11) after it.
- **Next (build order, one PR at a time, owner merges each):**
  1. [PR open, #28, 4.7.10] partial-year T-12 fix;
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

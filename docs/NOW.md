# Now

Read this first in every session; update it on every PR. Everything else
(`docs/PLAN_STATUS.md`, the master plan, the acceptance matrix) is read by
section with grep, never in full.

- **Version:** 4.7.14 (development branch; GitHub Pages deploys from main).
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
  - changelog fragments, and the approved build order (#31, 4.7.13).
- **In progress:** F1, one money rounding rule (4.7.14, PR open): the
  engine's `toCents` in `t12.js`, `omstatement.js`, `om.js` and
  `template.js`; a T-12 months-vs-year flag.
- **Next (one PR at a time; the full order is in `docs/PLAN_STATUS.md`, "Now"):**
  1. [PR open, 4.7.14] F1, one money rounding rule;
  2. F2, F5, F6/F7, F10, one PR each;
  3. T-12 multi-format import (`.xls` only with an Apache-2.0 or MIT SheetJS
     that can be fetched; otherwise skip it and tell the owner);
  4. F3, F4, F8 (30 days), F9 (optional password, lost-password warning);
  5. OM red-flag check and the T-12 bridge; then "Export everything";
  6. UI revamp in phases (first-run path in Home; Guided Mode after the
     clean-ups; F11 inside it);
  7. the rest of Phase 2 with the approved reorder, then Phases 3 to 8 (F12
     before any AI server deployment; Phase 7 prerequisites recorded).
- **Open decisions for the owner:** the questions
  at the end of `docs/PLAN_STATUS.md`.
- **Owner's standing instructions (2026-10-15):** no PR watching or
  polling; `check:quick` before every push, `check:full` before opening
  each PR; tell the owner which PR to merge, with a phone checklist if
  anything is visible;
  the branch rules in `docs/working-rules.md` ("Branches and PRs").
- **State note** (write here before any long task, so a fresh session can
  resume): none.

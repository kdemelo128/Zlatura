---
name: pr-report
description: Zlatura's PR body and the short report to the owner after opening a PR. Use when opening a PR or reporting on one.
---

# PR body and report

**PR body**, in this order:
1. One line: which build item or bug it is, and that it's one PR for one item.
2. **Root cause** in one line (for a fix).
3. **What changed**, as short bullets.
4. **Tested**: each test that fails on the old code (and how it was run against
   `git archive <old>` with `BASE=`), the mutation checks, `npm run check:full`
   totals (Node tests, flows and checks, recalc, axe, perf ms against 150 ms),
   and the golden result: "0 changed", or the before/after table when the owner
   approved a change.
5. **Phone hand-test**: from the `hand-test` skill.
6. What was not tested (Safari/WebKit, Excel, live services, real files).
7. End with the attribution lines from the session's settings. No model names.

**Report to the owner** (short):
- PR link; one-line root cause; what changed; what was tested; phone
  hand-tests; the running cost (agents used, or "main session only").
- Last: what was verified, what was not, what you assumed, and the decisions
  needed from the owner.
- Use the seven status words of Part 23 for any feature status
  (`docs/working-rules.md`).

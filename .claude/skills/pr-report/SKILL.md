---
name: pr-report
description: Zlatura's PR body and the short report to the owner after opening a PR. Use when opening a PR or reporting on one.
---

# PR body and report

**Before opening a PR, and again before telling the owner it is ready:**
1. Merge the latest main in with `npm run sync-main`, and resolve any
   conflict yourself.
2. Re-run `npm run check:quick`, and `npm run check:full` if anything
   beyond docs changed. `check:full` ends by failing if the branch is behind
   main or has conflict markers.
3. On GitHub, confirm that the PR shows no conflicts, with CI passing
   (`mergeable_state` is `clean`).
Call a PR ready only then. Keep only one PR open for the owner's merge at a
time, unless two are independent and touch different files.

**PR body**, in this order:
1. One line: which build item or bug it is, and that it's one PR for one item.
2. **Root cause** in one line (for a fix).
3. **What changed**, as short bullets.
   For a build bigger than a small PR, or one that adds a library: the
   **Prior art** table (`docs/working-rules.md`, "Reuse before you build").
   A new library also needs its `THIRD_PARTY.md` row, the `vendor/licenses/`
   file, its checksum, and the `npm audit` result.
4. **Tested**: each test that fails on the old code (and how it was run against
   `git archive <old>` with `BASE=`), the mutation checks, `npm run check:full`
   totals (Node tests, flows and checks, recalc, axe, perf ms against 150 ms),
   and the golden result: "0 changed", or the before/after table when the owner
   approved a change.
5. **Phone hand-test**: from the `hand-test` skill.
6. What was not tested (Safari/WebKit, Excel, live services, real files).
   **Merge danger**, one line each when it applies: a change to saved-deal
   results, the data format, hosting or the service worker cache (the first
   load after merge fetches new files); a new key read from a file; a
   version other open PRs also bump; a decision still owed by the owner.
   Say "none" when there is none.
7. End with the attribution lines from the session's settings. No model names.

**Report to the owner** (short):
- PR link; one-line root cause; what changed; what was tested; phone
  hand-tests; the running cost (agents used, or "main session only").
- Last: what was verified, what was not, what you assumed, and the decisions
  needed from the owner.
- Use the seven status words of Part 23 for any feature status
  (`docs/working-rules.md`).

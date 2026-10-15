---
name: quality-gates
description: Zlatura's quality-gate routine for a PR: tests that fail on the old code, mutation checks, Data QC, golden before/after, and the full check. Use before opening any PR that changes app/ or tests.
---

# Quality gates

1. **Old code fails the new tests.** Unpack the base into the scratchpad:
   `git archive origin/main | tar -x -C <scratch>/old`. Then serve it with
   `(cd <scratch>/old && python3 -m http.server 8090 --bind 127.0.0.1 &)` and run
   the new flow with `BASE=http://localhost:8090/ node tests/e2e/<flow>.mjs`.
   Unit tests: run them with the old module path, or by temporarily checking
   out the old file. Record each check that fails on the old code.
2. **Mutation checks.** Undo each part of the fix one at a time (keep a copy of
   the file in the scratchpad and restore it), and show that each part's own
   check fails. Restore and confirm `git diff` is what you meant.
3. **Data QC** (parsing, OM, rent roll, T-12 work): the statement's own
   arithmetic checks pass on the invented fixtures. Figures that fail a check
   stay held back with the reason shown. Nothing blank is read as zero
   (Part 21.2). For real files in `private/`, run only the structure-only
   scripts (`tests/tools/rr-local.mjs`) and report counts, never figures or
   names.
4. **Golden.** `npm run check:quick` compares displayed figures with
   `origin/main`. It fails on any change unless `GOLDEN_CHANGE_APPROVED=1`,
   which still prints the before/after table for the PR body. By hand:
   `node tests/tools/golden.mjs <old>/app > a.json`, the same for `app` into
   `b.json`, then `node tests/tools/golden.mjs --diff a.json b.json`.
5. **Full check once, on the final commit:** `npm run check:full`. Kill any
   stray server on 8080 first:
   `ps -eo pid,comm,args | awk '$2 ~ /^python/ && /http.server/ {print $1}' | xargs -r kill`.

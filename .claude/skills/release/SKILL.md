---
name: release
description: Zlatura's release steps for every PR: version bump, CHANGELOG, docs/NOW.md, PLAN_STATUS and acceptance matrix. Use before committing the last change of a PR.
---

# Release steps (every PR)

1. Bump the version with `npm run bump -- <x.y.z>`. It updates `package.json`,
   `package-lock.json` (lines 3 and 9), `sw.js` and `app/exporters.js`, and
   fails if any of them doesn't change.
2. `CHANGELOG.md`: a new entry at the top,
   `## x.y.z: <what a broker gets, in plain words> (on the development branch; not merged or deployed)`.
   Write the cause, then bold-led bullets for what changed, then how it was
   tested, and whether saved results changed (golden identical, or the
   approved change).
3. `docs/NOW.md`: version, merged, in progress, next, open decisions, state
   note. Keep it about 30 lines.
4. `docs/PLAN_STATUS.md`: edit by section (grep for "Last updated" and
   "## Now"); tick build-order items; recompute the counts only when a status
   moved.
5. `docs/acceptance-matrix.md`: only the rows whose status moved, in Part 23's
   words.
6. Commit with the session's trailers, then `git push -u origin <branch>`.

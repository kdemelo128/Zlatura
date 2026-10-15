---
name: release
description: Zlatura's release steps for every PR: version bump, CHANGELOG, docs/NOW.md, PLAN_STATUS and acceptance matrix. Use before committing the last change of a PR.
---

# Release steps (every PR)

**While working:** write the PR's changelog entry as a fragment,
`docs/changelog/unreleased/<branch>.md` (`claude/foo` becomes
`claude-foo.md`):

```
# <what a broker gets, in plain words>

<the cause; bold-led bullets for what changed; how it was tested; whether
saved results changed (golden identical, or the approved change)>
```

Never edit `CHANGELOG.md` by hand.

**In the PR's last commit**, after `npm run sync-main` has merged the latest
main in (`docs/NOW.md`, `docs/PLAN_STATUS.md` and the version files are
edited nowhere else, so they can't clash):

1. `npm run bump -- <x.y.z>` sets the version in `package.json`,
   `package-lock.json` (lines 3 and 9), `sw.js` and `app/exporters.js`. It
   folds the one fragment into `CHANGELOG.md` as
   `## x.y.z: <title> (on the development branch; not merged or deployed)`
   and deletes it. It changes nothing if a file is out of step, or if there
   isn't exactly one well-formed fragment.
2. Check that the fragment is gone, and that the entry reads right at the
   top of `CHANGELOG.md`.
3. `docs/NOW.md`: version, merged, in progress, next, open decisions, state
   note. Keep it about 30 lines.
4. `docs/PLAN_STATUS.md`: edit by section (grep for "Last updated" and
   "## Now"); tick build-order items; recompute the counts only when a status
   moved.
5. `docs/acceptance-matrix.md`: only the rows whose status moved, in Part 23's
   words.
6. Commit with the session's trailers, then `git push -u origin <branch>`.

# Changelog fragments: one file per PR (proposal, not built)

**The problem.** Every PR writes its entry at the top of `CHANGELOG.md`, and
also edits the same lines of `docs/NOW.md`, `docs/PLAN_STATUS.md` and the
four version files. Two PRs open at once therefore always conflict, as #28
did with #27. The new branch rules (4.7.11) avoid this by order: one PR at a
time, and those files edited only in the last commit, after merging main.
Fragments remove the cause for the changelog itself.

## How it would work

- **Each PR adds one new file**, `docs/changelog/unreleased/<branch>.md`,
  holding exactly the entry it would have put in `CHANGELOG.md`. It is named
  by branch, not version, so two PRs never pick the same name. It leaves
  `CHANGELOG.md` alone.
- **`npm run bump -- x.y.z`** (`tests/tools/bump-version.mjs`) sets the
  version as today. It then folds every file in `unreleased/` into
  `CHANGELOG.md` under `## x.y.z: …` and deletes the fragments, in one
  commit. The heading text comes from the fragment's first line.
- **When it runs:** on main after a merge (a small "release" commit), or in
  a PR's last commit as today. The first keeps the version files out of
  feature PRs completely.
- **Guards:**
  - `bump` refuses to run with no fragment, or with a fragment that has no
    heading line;
  - a test checks that every fragment parses, and that `CHANGELOG.md` keeps
    its order;
  - `check:full` fails if a PR that changes `app/` adds no fragment.
- **`docs/NOW.md` and `docs/PLAN_STATUS.md`** stay as they are. They are
  short, and the last-commit rule already covers them. They could get the
  same treatment later if they still clash.

## Cost

- About 60 lines in `bump-version.mjs`, about 40 lines of tests, and one
  line each in the `release` and `pr-report` skills. Roughly an hour, in a
  small PR of its own.
- No new library, no build step, and no change to the app or to saved data.
- No ongoing cost. A session writes one small file per PR instead of
  editing the top of a long one, which is slightly cheaper to read and edit.

## Risks

- **Version numbers move later.** If the fold happens on main after a merge,
  a PR no longer knows its final version while open. The app's version
  string, the service-worker cache name and the changelog heading are set
  at release, not in the PR. That's a change to how releases are made, so
  it's the owner's choice. Folding in the PR's last commit keeps today's
  behaviour, but the version files can then still clash.
- **A fragment forgotten or left behind.** It would be caught by the
  `check:full` guard and by `bump` refusing to run without one.
- **Old entries:** none move. `CHANGELOG.md`'s history stays as it is; only
  new entries come from fragments.
- **Two fragments folded into one release** need a stated order. The
  proposal is merge order (from `git log`), shown in the release commit.

## Decision for the owner

1. Build it? *Recommend:* yes, after the CI subset (4.7.11).
2. Fold where? *Recommend:* in each PR's last commit, as now, so a PR keeps
   its own version number. Folding on main can come later if the version
   files still clash.

## Decided (owner, 2026-10-15)

Approved, built in 4.7.13 as recommended: folded in each PR's last commit
by `npm run bump`, so a PR keeps its own version number.
- Fragments are named by branch (`docs/changelog/unreleased/<branch>.md`).
  `bump` needs exactly one, well formed.
- `npm run sync-main` also resolves the two conflicts that recur
  (`CHANGELOG.md`, and the version lines), so a second open PR doesn't
  stall on them.
- The `check:full` guard proposed above ("a PR that changes `app/` adds a
  fragment") isn't needed as a separate check: `bump` refuses without a
  fragment, and a test checks that the top entry's version matches
  `package.json`.

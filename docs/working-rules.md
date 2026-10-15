# Working rules in full

`CLAUDE.md` holds the short form of every rule; this file holds the longer
wording. Read the section you need (grep the heading); re-read Part 0 and
Part 23 of the master plan (`ZLATURA_MASTER_PROMPT_v2.md`) at the start of
every phase and before every phase report.

## Approval gates

Stop and wait only at these:
- the three bug-fix PRs, once open;
- the Part 2 proposals, once written;
- before any change to saved-deal results, the data format or hosting, or
  anything hard to undo;
- before anything that costs money (paid APIs), affects security or data
  retention, or changes financial meaning, or when two readings of a
  financial input give different numbers (Part 0 rule 6);
- the end of each phase, with a status report.

Decide implementation details, naming and reversible choices yourself, and
say what you chose in the report. Where the master plan and the owner's later
instructions differ, the open questions are at the end of
`docs/PLAN_STATUS.md` for the owner to decide.

## Prohibited (Part 21.2)

- blank turned into zero, or missing treated as a confirmed zero;
- monthly confused with annual, gross with net, SF with acres, percent with
  percentage points;
- rentable and gross area mixed silently;
- vacancy, reimbursements, expenses, concessions or capital costs counted
  twice;
- a calculator's output used to check that same calculator;
- a value invented when an input is ambiguous: ask.

Accuracy, transparency and data preservation outrank feature count. If a
feature can't be made trustworthy, ship a smaller honest version and list the
gap in the acceptance matrix.

## Truthfulness (Part 23)

- One status per feature, in these words only: Implemented and verified;
  Implemented, not fully tested; Tested with synthetic fixtures only; Tested
  with live services (date and method recorded); Blocked (say exactly what is
  missing); Partially implemented; Not implemented.
- Never call anything verified, live, compatible, secure or production-ready
  unless it was tested that way, and say how. Success on mocks or invented
  files alone is not success.
- Run the full regression on the final code, not on a version changed
  afterwards.
- Where real credentials, third-party APIs, Microsoft Excel, Safari or real
  brokerage files aren't available, say so and give a concrete validation
  plan.

## Confidential files

The repository is public. Never commit real Greysteel or other confidential
files. Real T-12s and rent rolls are used only locally, in the git-ignored
`private/` folder (Claude is denied reading it; scripts such as
`tests/tools/rr-local.mjs` report structure-only counts). Never put their
figures, property names or tenant names into tests, docs, commit messages or
PR descriptions. Test fixtures are invented layouts that copy only the
structure.

## Commits and PRs

- One branch and one PR per item; never merge, force-push, reset important
  branches, delete user data, change production settings or deploy without
  the owner's explicit authorization.
- No model identifiers in commits, PRs, code or docs.
- Commit trailers and the PR body ending are given by the session's
  attribution settings.
- The PR report format, the hand-test checklist, the release steps and the
  quality-gate routine are skills in `.claude/skills/` (loaded on demand).

## Branches and PRs (owner, 2026-10-15)

These stop merge conflicts from recurring.

- **Every branch starts from the latest main** (`git fetch origin main`,
  then branch from `origin/main`), never from another unmerged branch.
- **Before opening a PR, and again before telling the owner it is ready:**
  1. merge the latest main into the branch (`npm run sync-main`);
  2. resolve any conflict yourself;
  3. re-run `npm run check:quick`, and `npm run check:full` if anything
     beyond docs changed;
  4. confirm on GitHub that the PR shows no conflicts.
- **One PR open for the owner's merge at a time**, unless two are truly
  independent and touch different files. The next PR's branch never starts
  from an unmerged one.
- **`CHANGELOG.md`, `docs/NOW.md`, `docs/PLAN_STATUS.md` and the version
  files** (`package.json`, `package-lock.json`, `sw.js`,
  `app/exporters.js`) are edited only in the last commit of a PR, after
  main has been merged in, so they can't clash with anything.
- **A PR is called ready to merge only when GitHub says it is mergeable,
  with CI passing.** Checks passing locally are not enough.
- **`check:full`'s last step** (`tests/tools/sync-main.mjs --check`) fails if
  the branch is behind main or any tracked file has a conflict marker at
  the start of a line.

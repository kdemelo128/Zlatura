# Zlatura: working rules for Claude Code

Zlatura is a vanilla-JS ES-module PWA for commercial real estate brokers:
`app/` holds the app, there is no build step, and GitHub Pages serves it.

**Start every session by reading `docs/NOW.md` only.** Read
`docs/PLAN_STATUS.md`, the master plan (`ZLATURA_MASTER_PROMPT_v2.md`, never
edit it) and `docs/acceptance-matrix.md` by section with grep, never in full.
The longer wording of every rule below is in `docs/working-rules.md`.

## Standing rules

- **One PR per item, one branch per PR.** For anything big, write a
  proposal in `docs/proposals/` first and stop for the owner's approval.
- **Branches and merges:**
  - every branch starts from the latest main;
  - before opening a PR, and again before saying it's ready: run
    `npm run sync-main`, resolve conflicts yourself, re-run `check:quick`
    (and `check:full` if more than docs changed), and confirm on GitHub
    that there are no conflicts;
  - one PR open for the owner's merge at a time, unless two are
    independent and touch different files; never branch from an unmerged
    branch;
  - edit `CHANGELOG.md`, `docs/NOW.md`, `docs/PLAN_STATUS.md` and the
    version files only in a PR's last commit, after merging main;
  - never call a PR ready unless GitHub shows it mergeable with CI passing.
- **Approval gates (the only places to stop and wait):** bug-fix PRs and
  Part 2 proposals once open; before any change to saved-deal results, the
  data format or hosting, or anything hard to undo; before anything that
  costs money, affects security or data retention, or changes financial
  meaning, or when two readings of a financial input differ (Part 0 rule 6);
  the end of each phase. Decide reversible details yourself and say so.
- **Never** merge, force-push, reset important branches, delete user data,
  change production settings or deploy without the owner's explicit
  authorization. If the latest work isn't on the branch you expect, stop and
  report.
- **Reuse before you build** (`docs/working-rules.md`):
  - before any proposal, or a build bigger than a small PR: check
    `THIRD_PARTY.md` and the app's own modules, then do a capped prior-art
    search, and put a "Prior art" table (license, size, maintenance,
    offline, network, security, verdict) in it;
  - permissive licenses only (MIT, BSD, Apache-2.0, ISC; MPL-2.0 with
    approval), never GPL, AGPL or unlicensed;
  - any new library or copied code is an approval gate: pin it, vendor it
    with its license text and checksum, and list it in `THIRD_PARTY.md`;
  - never outside code for the engine or money logic.
- **No feature is removed.** Everything stays reachable; whatever is touched
  gets better.
- **Golden outputs stay identical** unless the owner approves the change,
  shown as a before/after table: `tests/analyze-golden.test.js` (618 saved
  deal results) and `tests/tools/golden.mjs` (646 displayed figures).
- **Money is whole cents; one shared engine** (`app/engine/`,
  `app/deal.js`), never a second copy of the math; no build step.
- **Prohibited (Part 21.2):** blank as zero; monthly/annual, gross/net,
  SF/acres or percent/points confused; rentable and gross area mixed;
  anything counted twice; a calculator checking itself; a value invented
  for an ambiguous input (ask instead). Accuracy beats feature count: ship
  a smaller honest version and list the gap in the acceptance matrix.
- **Truthfulness (Part 23):** use only the seven status words; never call
  anything verified, live or secure unless tested that way, and say how;
  where Excel, Safari, live services or real files weren't available, say
  so with a validation plan. Re-read Parts 0 and 23 of the master plan at
  the start of each phase and before each phase report.
- **Invented fixtures only.** The repo is public. Real files stay in the
  git-ignored `private/` folder, are reported in structure-only counts, and
  their figures and names never appear in tests, docs, commits or PRs.

## Tests and checks

- New tests must fail on the old code: run them against `git archive <old>`
  served with `BASE=`.
- `npm run check:quick` while developing: affected unit tests, the type
  check and the golden check.
- `npm run check:full` once before each PR: the Node suite, the type check,
  the golden check and the full browser suite (Chromium, phone and desktop
  sizes, axe, perf budget of 150 ms per edit, character-by-character typing).
  Mutation checks and Data QC are in the `quality-gates` skill.
- A failed check fails the command (exit code); never weaken a check.

## After every PR

Run the `release` skill: bump the version, update `CHANGELOG.md`,
`docs/NOW.md`, `docs/PLAN_STATUS.md` and, where a status moved,
`docs/acceptance-matrix.md`. Report with the `pr-report` skill, plus the
`hand-test` skill's phone checklist.

## Usage rules

- One agent at a time, never parallel Opus; routine work in the main
  session; no agents for small things. Plan mode before any design or risky
  change.
- Batch related steps; point at exact files and line ranges; don't re-read
  a file you just wrote; keep reports short; no polling check-ins.
- Before any long task (and on a usage limit) write a state note in
  `docs/NOW.md`. Compact or start fresh between PRs.
- If a cheaper step would skip a quality gate, tell the owner.

## Model routing

- **Main session:** Sonnet at medium effort (`.claude/settings.json`);
  `/model` and `/effort` change a session when a task needs more.
- **designer** (Opus, `.claude/agents/designer.md`): proposals, root causes,
  parsing, money logic, data format and migrations, security, phase review.
- **builder** (Sonnet, `.claude/agents/builder.md`): approved designs, UI,
  wiring, docs, test updates, routine fixes; after two failures on the same
  problem it goes back to the designer. Delegate only large, self-contained
  work.

## Commands

- Type check: `npx tsc -p types/tsconfig.json`; Node tests: `npm test`.
- Bring a branch up to date with main: `npm run sync-main` (lists any
  conflicted files).
- Browser suite: `bash tests/e2e/run.sh [flow …]` (Chromium);
  `PW_BROWSER=webkit bash tests/e2e/run.sh` where WebKit is installed.
- Golden by hand, old-code runs and a stray server on 8080: the
  `quality-gates` skill.

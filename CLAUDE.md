# Zlatura: working rules for Claude Code

Zlatura is a vanilla-JS ES-module PWA for commercial real estate brokers:
`app/` holds the app, there is no build step, and it is served by GitHub
Pages. The plan is the master prompt (`ZLATURA_MASTER_PROMPT_v2.md`, kept by
the owner), as tracked in `docs/acceptance-matrix.md` and
`docs/PLAN_STATUS.md`.

## Standing rules

**PRs and approvals**
- **One PR per item.** For anything big, write a design proposal first
  (`docs/proposals/`) and stop for the owner's approval before building.
- **Approval gates (the only places to stop and wait):**
  - the three bug-fix PRs, once open;
  - the Part 2 proposals, once written;
  - before any change to saved-deal results, the data format or hosting,
    or anything hard to undo;
  - the end of each phase, with a status report.

**Features and outputs**
- **No feature is removed.** Every existing feature stays reachable, and a
  feature that is touched gets better.
- **Golden outputs stay identical** unless the owner approves an intended
  change. They are `tests/analyze-golden.test.js` (618 saved deal results)
  and `node tests/tools/golden.mjs --diff` (646 displayed figures).
- **Money is whole cents.** There is one shared calculation engine
  (`app/engine/`, `app/deal.js`); never write a second copy of the math.
  There is no build step.

**Tests**
- New tests must fail on the old code. Run each against `git archive <old>`
  served with `BASE=`.
- **Every PR runs:**
  - mutation checks;
  - the full browser suite (`tests/e2e/run.sh`), on Chromium and at iPhone
    size;
  - the perf budgets (150 ms per edit);
  - axe;
  - character-by-character typing tests for every input type.
- **Invented fixtures only.** Never commit real Greysteel or confidential
  files, figures, property names or tenant names. Real files stay in the
  git-ignored `private/` folder and are reported in structure-only counts.

**After every PR**
- Bump the version in `package.json`, `package-lock.json` (lines 3 and 9),
  `app/exporters.js` and `sw.js`, and update `CHANGELOG.md`.
- Update `docs/PLAN_STATUS.md`.
- Report to the owner:
  - what changed;
  - what was tested;
  - what to hand-test on a phone;
  - the running cost.

## Model routing

- **designer** (`.claude/agents/designer.md`, Opus) decides and diagnoses:
  - design proposals;
  - bug root causes;
  - parsing, money and calculation logic;
  - data-format and migration changes;
  - security review;
  - the end-of-phase independent review.
- **builder** (`.claude/agents/builder.md`, Sonnet) carries out approved
  designs:
  - UI and screens;
  - wiring;
  - docs and changelogs;
  - test updates;
  - routine fixes.
- If the builder fails twice on the same problem, it goes back to the
  designer.
- Keep the main session lean: send large searches and long test runs to
  subagents.

## Commands

- Type-check: `npx tsc -p types/tsconfig.json`
- Node tests: `npm test`
- Browser suite:
  - Chromium: `bash tests/e2e/run.sh`
  - WebKit, where it is installed: `PW_BROWSER=webkit bash tests/e2e/run.sh`
- Golden check: `node tests/tools/golden.mjs <app-dir> > out.json`, then
  `node tests/tools/golden.mjs --diff before.json after.json`

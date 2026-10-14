# Zlatura: working rules for Claude Code

Zlatura is a vanilla-JS ES-module PWA for commercial real estate brokers:
`app/` holds the app, there is no build step, and it is served by GitHub
Pages. The plan is the master prompt, `ZLATURA_MASTER_PROMPT_v2.md` in the
repository root (never edit it), tracked in `docs/acceptance-matrix.md` and
`docs/PLAN_STATUS.md`. Re-read its Part 0 (operating rules) and Part 23
(truthfulness) at the start of every phase and before every report. Where it
and the owner's later instructions below differ, the open questions are
listed at the end of `docs/PLAN_STATUS.md` for the owner to decide.

## Standing rules

**PRs and approvals**
- **One PR per item.** For anything big, write a design proposal first
  (`docs/proposals/`) and stop for the owner's approval before building.
- **Approval gates (the only places to stop and wait):**
  - the three bug-fix PRs, once open;
  - the Part 2 proposals, once written;
  - before any change to saved-deal results, the data format or hosting,
    or anything hard to undo;
  - before anything that costs money (paid APIs), affects security or data
    retention, or changes financial meaning, or when two readings of a
    financial input give different numbers (Part 0 rule 6);
  - the end of each phase, with a status report.
- Decide implementation details, naming and reversible choices yourself,
  and say what you chose in the report.
- **Never** merge, force-push, reset important branches, delete user data,
  change production settings or deploy without the owner's explicit
  authorization.
- If the latest work isn't on the branch you expect, stop and report before
  changing anything.

**Features and outputs**
- **No feature is removed.** Every existing feature stays reachable, and a
  feature that is touched gets better.
- **Golden outputs stay identical** unless the owner approves an intended
  change. They are `tests/analyze-golden.test.js` (618 saved deal results)
  and `node tests/tools/golden.mjs --diff` (646 displayed figures).
- **Money is whole cents.** There is one shared calculation engine
  (`app/engine/`, `app/deal.js`); never write a second copy of the math.
  There is no build step.
- **Prohibited (Part 21.2):**
  - blank turned into zero, or missing treated as a confirmed zero;
  - monthly confused with annual, gross with net, SF with acres, percent
    with percentage points;
  - rentable and gross area mixed silently;
  - vacancy, reimbursements, expenses, concessions or capital costs counted
    twice;
  - a calculator's output used to check that same calculator;
  - a value invented when an input is ambiguous: ask.
- Accuracy, transparency and data preservation outrank feature count. If a
  feature can't be made trustworthy, ship a smaller honest version and list
  the gap in the acceptance matrix.

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
- Update `docs/PLAN_STATUS.md` and, where a status moved,
  `docs/acceptance-matrix.md`.
- Report to the owner:
  - what changed;
  - what was tested;
  - what to hand-test on a phone;
  - the running cost;
  - and, last: what was verified, what was not, what you assumed, and what
    you need from the owner.

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

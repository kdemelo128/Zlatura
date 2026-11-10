# Evals: baselines and how to run each

Baselines at **4.7.124** (main 01978ab), 2026-11-10. Update a number in the
same commit that moves it. Skill details: `.claude/skills/quality-gates/SKILL.md`.

| Check | Baseline | How to run | Notes |
|---|---|---|---|
| Node tests | **1426** pass | `npm test` (`test:tz` adds two time zones) | `check:quick` runs only affected ones |
| Type check | clean | `npx tsc -p types/tsconfig.json` | |
| Golden, saved results | **618** identical | `tests/analyze-golden.test.js` (inside `npm test`) | change only with a logged before/after table |
| Golden, displayed figures | **646** identical | `node tests/tools/golden.mjs app > before.json`, then `... --diff before.json after.json` | run on old and new tree; "0 changed" |
| Browser flows | **75** flows in `FLOWS` of `tests/e2e/run.sh` | `bash tests/e2e/run.sh [flow ...]` (Chromium); `PW_BROWSER=webkit` where installed | one run at a time per machine; phone (iPhone) and desktop sizes |
| Mutation checks | each fix part undone alone must fail a test | see the `quality-gates` skill, step 2 | also 13 broken copies of the PR merge gate are caught |
| axe | 0 violations | inside flows (`a11y-flow`, per-screen flows), light and dark | animations must finish first |
| Perf budget | **150 ms** per edit; also `THROTTLE=4` | `perf-flow.mjs` (inside the suite) | 2,000 comps stays under budget |
| Typing | character by character for every input type touched | `typing-flow` | |
| Fast gate | | `npm run check:quick` | docs/CI-only changes: this is enough |
| Full gate | | `npm run check:full` | whenever `app/` or `tests/` changed |
| Hub/server | | `npm test` (hub tests), `server/` tests in `check:full` | mock vendors only |

## New-test rule

A new test must fail on the old code: `git archive <old-commit>`, extract,
serve, run the test with `BASE=http://localhost:<port>`; it must fail there
and pass on the new tree.

## Document scoreboard (`tests/tools/doc-local.mjs`)

Local only, counts only, never commit output. Run with `--reasons` for refusal
codes. Last owner-run results (by layout family, structure only):

| Run | Result |
|---|---|
| Owner data folder, 239 files | **114 accepted, 31 asked, 94 refused** |
| The 68 refused or asked files, with reason codes | **44** zips not opened; **7** workbooks failing on an unreadable date (fixed 4.7.123); **4** no text layer; **4** both readers accept |
| Target after round-1 fixes | zips opened in memory, macro reason, OCR offer on Underwrite, both-readers offers both |

Metric goal: field-level accuracy with zero wrong values; "asked" is better
than a wrong answer (`docs/measuring-documents.md`, `docs/proposals/document-learning.md`).

## "Looks exactly the same" comparer (embedded tool)

Planned in `docs/proposals/uw-embed-as-is.md` as `tests/tools/uwfiller-same.mjs`
(local-only; not on main yet). It loads the private package standalone and
inside Zlatura at the same viewport, same theme, same clock, and compares
screenshots and DOM structure per screen, counts only. Also `tests/tools/uw-oracle.mjs`
(engine versus the package's math, counts only).

## Never verified (say so in every report)

- Real Safari and a real iPhone (WebKit only where installed; none here).
- Real Microsoft Excel opening exported or filled workbooks.
- Live vendors: Codex/Gemini/Box/GitHub through the hub, AI and speech
  providers, any CRM or data service. All stub or mock only.
- Real screen readers; the lease reader and OCR on a real phone.
- Readers on real documents beyond the owner's structure-only counts.
- Several price, covenant, CAM and SBA figures are UNVERIFIED (`docs/PLAN_STATUS.md`).

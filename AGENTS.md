# Zlatura: instructions for coding agents (Codex and others)

Zlatura is a vanilla-JS ES-module PWA for commercial real estate brokers.
`app/` holds the app, there is no build step, and GitHub Pages serves it.

`CLAUDE.md` is the source of truth for the working rules and `docs/working-rules.md`
has the longer wording. Read both before you change anything; this file is the
short version for agents that are not Claude Code. Where the two differ, the
owner's latest instruction wins, then `CLAUDE.md`. Parts of `CLAUDE.md` that
name Claude-only tools (subagents, skills, model routing) do not apply to you,
but every rule about the product, tests and approvals does.

**Before any work, read `docs/coordination/README.md`:** it says which files Claude is changing right now and which items are yours; do not edit files another agent owns, and merge `main` before you start.

**Start every session by reading `docs/NOW.md` only.** Read `docs/PLAN_STATUS.md`,
`ZLATURA_MASTER_PROMPT_v2.md` (never edit it) and `docs/acceptance-matrix.md` by
section with grep, never in full.

## Hard rules

- **One PR per item, one branch per PR,** started from the latest main. For anything
  big, write a proposal in `docs/proposals/` and stop for the owner's approval.
  Never merge, force-push, delete user data, change production settings or deploy:
  the owner merges.
- **Stop and wait for the owner** before: any change to saved-deal results, the
  data format or hosting; anything that costs money, affects security or data
  retention, or changes what a financial figure means (including when two
  readings of an input give different numbers); the end of each phase.
- **Golden outputs stay identical** unless the owner approves a change shown as a
  before/after table: `tests/analyze-golden.test.js` (618 saved results) and
  `node tests/tools/golden.mjs --diff` (646 displayed figures).
- **Money is whole cents, and there is one shared engine** (`app/engine/`,
  `app/deal.js`). Never write a second copy of the maths. No build step.
- **Prohibited (Part 21.2):** blank treated as zero; monthly/annual, gross/net,
  SF/acres or percent/points confused; rentable and gross area mixed; anything
  counted twice; a calculator checking itself; a value invented for an ambiguous
  input (ask instead).
- **No feature is removed.** Everything touched gets better.
- **Truthfulness (Part 23):** use only the seven status words in the acceptance
  matrix; never call anything verified, live or secure unless it was tested that
  way, and say how. Say what was not run (Safari, a real phone, real Excel).
- **Invented fixtures only. The repo is public.** Never commit real Greysteel or
  confidential files, figures, property names, tenant names or addresses. Real
  files live only in the git-ignored `private/` folder, which is not in the
  repository: never read, quote, name or copy from it into code, tests, docs,
  commits or PRs.
- **No new library or copied code** without the owner's approval: permissive
  licences only (MIT, BSD, Apache-2.0, ISC, and BlueOak-1.0.0 for the pinned
  minimatch override only); pin it, vendor it with its licence text and checksum,
  and list it in `THIRD_PARTY.md`. Never outside code for the engine or money logic.
  Clean room: no decompiling or copying proprietary software, leaked code,
  vendor file formats or vendor trademarks.
- **Never build** social-media scraping, login bypass, face recognition,
  identifying anonymous people, or scoring by sensitive attributes. Do not
  dismiss CodeQL alerts; fix the code.
- The product name appears only in `app/brand.js` (use `PRODUCT`); icons only
  through `app/icons.js`; a test fails otherwise.

## Tests and checks

- New tests must fail on the old code: run each against `git archive <old>`
  served with `BASE=`.
- `npm run check:quick` while developing (affected unit tests, type check, golden).
- `npm run check:full` once before a PR that touches `app/` or `tests/`: the Node
  suite, type check, golden check, and the full browser suite (Chromium, phone and
  desktop sizes, axe, a 150 ms per-edit budget that must never be relaxed,
  character-by-character typing for every input type). A failed check fails the
  command; never weaken a check, skip a test or disable a gate.
- Type check: `npx tsc -p types/tsconfig.json`. Node tests: `npm test`.
  Browser flows: `bash tests/e2e/run.sh [flow ...]` (Chromium).
- Run browser suites one at a time on a quiet machine: parallel runs make the
  timing budgets miss.

## Branches, versions and releases

- Bring a branch up to date with `npm run sync-main` (it resolves `CHANGELOG.md`
  and version-line conflicts itself and lists the rest). Resolve conflicts
  yourself, re-run the checks, and confirm on GitHub that the PR is mergeable
  with CI passing before you call it ready.
- The changelog entry is a fragment in `docs/changelog/unreleased/`. In the PR's
  last commit run `npm run bump -- x.y.z` (folds the fragment into `CHANGELOG.md`
  and bumps `package.json`, `package-lock.json` lines 3 and 9, `app/exporters.js`
  and `sw.js`), then update `docs/NOW.md` (one `Version:` line only),
  `docs/PLAN_STATUS.md` and, where a status moved, `docs/acceptance-matrix.md`.
  Take the next free version number after main's. This repo's changelog test
  requires the newest entry to be at the top.
- Add any new browser flow to `FLOWS` in `tests/e2e/run.sh`.
- Do not work on a branch another agent owns; check open PRs and `docs/NOW.md`
  first so two agents never edit the same files.

## PR report

Say what changed, what was tested and what was not, what to hand-test on a phone,
and the running cost (none unless a paid service is involved).

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
- **The changelog entry is a fragment**, `docs/changelog/unreleased/<branch>.md`
  (approved 2026-10-15; `docs/proposals/changelog-fragments.md`). A PR
  never edits `CHANGELOG.md` by hand. `npm run bump -- x.y.z`, in the PR's
  last commit, folds the one fragment in and deletes it.
- **`docs/NOW.md`, `docs/PLAN_STATUS.md` and the version files**
  (`package.json`, `package-lock.json`, `sw.js`, `app/exporters.js`) are
  edited only in the last commit of a PR, after main has been merged in.
- **`npm run sync-main` resolves the two conflicts that recur** on its own:
  `CHANGELOG.md` (both entries kept, newest version first; not when one
  version holds two different entries) and a version line (the higher
  version kept). Anything else is listed for a person to resolve.
- **A PR is called ready to merge only when GitHub says it is mergeable,
  with CI passing.** Checks passing locally are not enough.
- **`check:full`'s last step** (`tests/tools/sync-main.mjs --check`) fails if
  the branch is behind main or any tracked file has a conflict marker at
  the start of a line.

## Reuse before you build (owner, 2026-10-15)

1. **Prior-art check first.** Do it before any design proposal, and before
   any build bigger than a small PR. Keep the effort capped: a few targeted
   searches of npm and GitHub, using what this environment allows (the npm
   registry, `gh` or the web). If a site isn't reachable, say so; don't
   guess. First check what the repo already vendors or uses
   (`THIRD_PARTY.md`: pdf.js, Tesseract, ExcelJS, fflate, and the app's own
   modules), so nothing is added twice.
2. **A short "Prior art" table** goes in the proposal or PR, with these
   columns:
   - candidate, and what it does;
   - license and size;
   - last release and maintenance;
   - works build-free as a vendored file, and offline;
   - any network calls or telemetry;
   - security notes;
   - verdict (adopt, adapt, or build ourselves), with the reason.
3. **Criteria:**
   - Licenses: permissive only (MIT, BSD, Apache-2.0, ISC); MPL-2.0 only
     with the owner's approval. No GPL, AGPL or unlicensed code: the
     project may become proprietary.
   - The library: actively maintained, small, no build step, no network
     calls or tracking.
   - It works in the offline home-screen app, and doesn't slow the 150 ms
     edit budget.
   - Pin an exact version, vendor the file with its license text
     (`vendor/licenses/`), and record its SHA-256 in `THIRD_PARTY.md` with
     the version, license and why it's there.
   - Run `npm audit` and report the result.
4. **Approval gate.** Adding any third-party library, or copying code from
   a repository, needs the owner's OK on the table first. Never copy code
   that has no license.
5. **Never outside code for the engine or the money logic.** A library may
   help around them: file reading, charts, drag and drop, date parsing. The
   golden outputs (618 saved results, 646 figures) must stay unchanged, and
   every new dependency gets a wrapper module and tests.
6. **Research stays cheap.** The designer judges a shortlist; it doesn't
   browse. Keep summaries to a page.

## The owner's support code is a standing source (owner, 2026-10-17)

The owner's underwriting support code (Python, in the git-ignored
`private/support-code/src/`) is a worked design: its checks, rules and test
cases are mined for every PR that touches the rent roll, the T-12, NOI, WALT,
the Review Queue or Data QC.

1. **Look first.** Before such a proposal or PR, read the matching part of the
   code, and its mapping to the app: the file-by-file table in
   `docs/proposals/rentroll-pdf-and-om-fill.md` (a), and the check-by-check
   mapping (adopt, already covered, not applicable) in
   `docs/proposals/underwriting.md` once it is merged.
2. **Adopt what applies, in the app's own words.** Rewrite the idea as an app
   check in the existing module (never a second copy of the math, never
   copied code). Its test is rewritten from the code's test cases with
   *invented* fixtures, and must fail on the old code.
3. **Say what happened in the PR body:** which support-code checks this PR
   adopted, which the app already covered, and which do not apply. If the
   folder is not in the container, say so; don't guess its contents.
4. **Nothing from it is ever committed or quoted:** no names, addresses,
   figures, template names or paths. Run the same shared-figures and
   shared-names check against `private/` that was used for the proposal
   before opening a PR that cites it, and report only the count.
5. An adopted check that changes a stored field, a saved result or a golden
   output is still an approval gate, with the before/after table.

## Git guardrail (owner, 2026-10-21)

`.claude/hooks/git-guardrails.mjs` is a project hook on the Bash tool (registered in `.claude/settings.json`). It refuses
the git commands CLAUDE.md already forbids without the owner's explicit authorization: a forced push, a push that deletes
a branch or targets main or master, `reset --hard`, `clean -f`, `checkout .` or `restore .` of the whole tree, `branch -D`,
`stash clear` or `drop`, and `--no-verify`. A normal `git push -u origin <branch>` is never blocked. When it refuses, stop
and ask the owner; they can run the command themselves.

What it is not: a sandbox. It reads the command text with a small parser (quotes and heredocs are respected), so a command
built another way (a script that runs git, `eval`, another tool) is not seen. It guards against a slip, not an attack.
Own-written (about 100 lines, no dependencies), so nothing in `THIRD_PARTY.md`; `tests/guardrail.test.js` holds the lists
of refused and allowed commands. Add a case there whenever a rule changes.

## Keeping CLAUDE.md short (owner, 2026-10-21)

Run this checklist when `CLAUDE.md` grows past about 150 lines or a session wastes time on it:
- Each rule is one line a session can act on; the long wording lives in this file.
- A rule that a check enforces (a test, a hook, CI) is named, not re-explained.
- Domain words live in `docs/glossary.md`, not in `CLAUDE.md`.
- No rule appears twice; where two disagree, fix both in the same PR.
- A rule about one folder or one kind of work goes in a skill or a path-scoped rule, not at the top.
- Changes to `CLAUDE.md` are the owner's to approve.

## Step, then check (owner, 2026-10-22)

Every plan, design note and builder brief lists its steps as "step → how it is checked" (a test name, a command and
its expected result, or what to look at), and a step is done only when that check has run and passed. A step with no
check is either split until it has one or named as not checked, with the reason. This is the "goal-driven" idea from
karpathy-skills, written in our own words: its text has no licence file, so none of it is copied.

## Machine checks taken from outside ideas (owner, 2026-10-22)

The owner asked for the useful ideas in the evaluated repos to be used, with care on licences. Two are now checks:
- `tests/tools/settings-scan.mjs` (ruflo's settings risk scan, our own code): `.claude/settings.json`,
  `.claude/settings.local.json` and `.mcp.json` must not allow every shell command, download and run code, run as
  root, switch permission checks off, hold a secret, or stop denying `Read(./private/**)`. `npm test` and every
  `check:quick` run it (`tests/settings-scan.test.js`). A finding is fixed in the settings, never by weakening the scan.
- `tests/e2e/run.sh` takes a lock (paperclip's per-task claim, our own code), so two sessions or worktrees wait for
  port 8080 in turn instead of colliding; a lock whose run is gone is taken over (`tests/e2e-lock.test.js`).

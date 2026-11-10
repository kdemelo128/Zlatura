# Lessons ledger

What went wrong, and the rule that came out of it. Add one line per lesson,
with the source. Newest at the bottom of each group.

## From the 2026-11-10 sessions

| What went wrong | Rule |
|---|---|
| Two browser-suite runs on one machine collided on shared ports | One `tests/e2e/run.sh` run at a time per machine (parallel worktrees use the port-slot claim, 4.7.57) |
| A squash merge made stacked branches conflict on the version files | Resolve with ours-for-version-files (`package.json`, lock lines 3 and 9, `app/exporters.js`, `sw.js`); `npm run sync-main` does it |
| A usage limit stopped a builder mid-work and the work was lost | Builders commit early and often; stop everything on a usage limit |
| A browser extension (ad blocker) broke a layout that relies on the body's grid; also the "didn't finish loading" report (#122) | Test with extensions on; the load-error panel and reset button stay; do not depend on one body-level grid |
| One unreadable date cell refused whole workbooks (7 of the owner's) | A cell that cannot be read is `null` with one note, never 0, never today, never refuse the file (4.7.123) |
| A classifier with broad word patterns made single pages look like packages (`a+b+c`) | Classifier patterns must be narrow; "asked" with several types is not a package; measure by layout family (`document-learning-round-1.md`) |
| Fake secrets in tests tripped the secret scanner | Build fake keys at run time (string concatenation), never as literals |

## From the changelog and earlier work

| Lesson | Rule | Source |
|---|---|---|
| A regex lookbehind made a whole file fail to load on Safari before 16.4 | A test forbids lookbehind anywhere in `app/` | `CHANGELOG.md` 4.7.x (#129) |
| A quadratic regex froze the tab for 16 s on a 40,000-character field | Single-pass word search; a slow-input test with a one-second ceiling | `CHANGELOG.md` (#129) |
| A new app file missing from `sw.js` failed CI three times | `check:quick` always runs `tests/repo.test.js` | `docs/NOW.md` 4.7.20 |
| An axe contrast failure appeared only mid-animation (`impact-flow`) | Flows wait for animations to end before an axe scan | `docs/NOW.md` #44 |
| `rename-flow` fails once under load | Known flake: re-run it alone before calling it a failure | `docs/NOW.md` |
| Money rounding differed across tools | One rounding rule in `engine/money.js` (F1); a -$0 shows no sign | `CHANGELOG.md` 4.7.14, 4.7.52 |
| Package math reads blank as 0 and uses floating point | Never import the package's math; the bridge sends facts and Zlatura recomputes (cross-check only) | `uw-embed-as-is.md` s6 |
| Macro workbooks were reported as "damaged" | Refuse by content with the true reason; macros are never run | `document-learning-round-1.md` |
| Outlined-text PDFs were called "scans" | Say "no text layer"; offer OCR on request on every card | `document-learning-round-1.md` |
| Model pages exported from the owner's own tool are not source documents | Identify and keep them; never read them as inputs (a calculator must not check itself) | `document-learning-round-1.md` |
| Docs drift (PLAN_STATUS stale to 4.7.66; matrix "Not implemented" for built things) | Update the status docs in the same commit; this ledger follows the same rule | audit 2026-11-10 |
| A draft escaped its task scope in the hub (security review, high) | Strict draft check and protected paths stay | `docs/owner-requests.md` (#136) |

## Habits that worked

- Designer note first for parsing, money, data-format and migration changes.
- New tests proven against `git archive <old>` served with `BASE=`.
- Counts-only reports from `private/`; invented lookalike fixtures.
- Grep the totals out of long logs; read line ranges, not whole files.

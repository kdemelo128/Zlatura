# Who is working on what (Claude and Codex)

Read this before starting any work. Two agents build Monal at the same time:
Claude (Claude Code, which releases straight to `main`) and Codex (which opens
one pull request per item). This file is the single place that says who owns
which files, so neither agent edits what the other is changing. Updated by
Claude at each hand-over; the owner may paste the same text into Codex.

Last updated: 2026-11-13, main at 4.7.162.

## Before you start, every time

1. `git fetch origin && git merge origin/main` (or start a new branch from
   the latest `main`). Never branch from an unmerged branch.
2. Check this file's ownership table. If what you want to change is owned by
   the other agent, do not change it: pick another item or ask the owner.
3. Version: bump to the next free patch after `main` (`npm run bump -- x.y.z`)
   with a changelog fragment in `docs/changelog/unreleased/` whose first line
   is `# <title>`. If `main` moved, merge it and bump again.
4. Never force-push, rewrite `main`, or delete another agent's branch.

## Ownership now

| Area | Owner | Files |
|---|---|---|
| Document readers, OCR, routing | Claude | `app/ddintake.js`, `app/intake.js`, `app/intakeui.js`, `app/filekind.js`, `app/sheetread.js`, `app/om*.js`, `app/rrdoc.js`, `app/rentroll*.js`, `app/t12*.js`, `app/pdfstatement.js`, `app/ocr*.js`, `app/docxread.js`, `app/facts*.js`, `tests/tools/doc-local.mjs`, `tests/tools/om-diag.mjs` |
| Underwriting tool and Underwrite tab | Claude | `app/uwtool/`, `app/uwfiller/`, `app/underwrite.js` |
| Assistant | Claude | `app/assistant*.js`, `app/doc*.js` (index, facts, session) |
| Connectivity: Connect page, My data, To file inbox, import presets, calendar/email files | Claude | `app/connectors.js`, `app/mydata.js`, `app/inbox*.js`, import/export presets |
| Home (pulse panel, customise) and app speed | Claude (in progress) | `app/home.js`, Home styles, perf flows |
| Comps screen in the New look | Codex (next, the only open Codex item) | the Comps screen's UI files; no reading or money code |
| Tools screen in the New look | done: `codex/tools-new-look` released as 4.7.161 | |
| Documents card and screen in the New look | done: `codex/documents-new-look` released as 4.7.162 (Claude added a 44 px Done button) | |
| Engine and money (`app/engine/`, `app/deal.js`) | nobody without a designer note and the owner's yes | |

Shared files (`app/styles.css`, `sw.js`, `tests/e2e/run.sh`, `CHANGELOG.md`,
`package.json`): both may edit, in small appended blocks; on a merge
conflict take `main`'s version and re-add your own lines, never drop the
other agent's entries.

## Codex branches already handled

- `codex/deal-workspace-navigation`, `codex/monthly-pdf-statements`,
  `codex/deals-new-look`, `codex/tools-new-look`, `codex/documents-new-look`: merged.
- `codex/om-page-classification` and `codex/pm-rentroll-coverage`: reviewed
  and not merged (they weakened checks or misrouted an operating statement);
  their good parts were ported to `main`. Do not reopen them.

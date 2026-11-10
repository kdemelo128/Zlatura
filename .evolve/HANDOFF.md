# Handoff: state right now

Written 2026-11-10. Replace this file's facts at the end of every session
(same commit as the work).

## Main

- `main` is at **4.7.124** (01978ab, planning docs). GitHub Pages deploys
  the live site from `main`; there is no build step.
- Working mode: direct commits to `main` after checks, no PRs
  (`PROJECT_CONTRACT.md`).

## In flight

| Branch | What | Next step |
|---|---|---|
| `claude/uw-embed-p1` | Embed P1: load and embed the Codex tool in the Underwrite tab (`app/uwfiller/`, `uw-embed-flow`, `sw.js`, `underwrite.js`) | Lead session runs checks, merges straight into `main` |
| `claude/ui-look-1-tokens` | New look PR 1: tokens, base components, Plex fonts | Same: checks, then straight into `main` |
| `claude/evolve-ledger` | This ledger (docs only, `.evolve/`) | Commit after `npm run check:quick` passes |

## Parked

- Stash on `claude/uw-3-reconcile`: UW-3 builder partial work, stopped when
  the owner chose "Codex UI as is". Decision Q9: leave it; drop after E-P5.
- Old branches (`hub-*`, `uw-0-measure`, `uw-1-intake`, `uw-2-units`,
  `uw-money-notes`, `uw-embed-proposal`) are merged or superseded; tidy later.

## Moved

- The **Model Hub** now lives in the separate repository `model-hub`. Its
  rules are in that repo's `CLAUDE.md`. The `tools/hub`, `npm run hub|ask|box|pr`
  entries still exist in this tree until removal is done; check `docs/NOW.md`.

## Where private things live (never committed)

- Git-ignored `private/` (absent in a fresh worktree): the owner's
  documents, the Codex underwriting package (`private/uw-claude-zip/`),
  support code (`private/support-code/`), local scoreboard output.
- Real files are reported as structure-only counts. The repo is public.
- Keys and tokens only in `~/.zlatura-hub/` on the owner's Mac.

## Open items for the owner (non-blocking under the new mode)

- Confirm `private/` as the default home for documents.
- Hand-test on iPhone after the next visible change (Safari never verified here).
- Review logged before/after tables in `DECISIONS.md` when any appear.

## Next best slice

Finish E-P1 and L1, then R3-R6 (small reader fixes), then E-P2/E-P3. See
`BACKLOG.md`. Run one browser suite at a time (`LESSONS.md`).

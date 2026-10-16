# Working rules: model routing, which check to run, usage rules

Docs only; no app change.

- **Model routing:** the designer (Opus) writes proposals, root causes and a
  short design note, and reviews the finished diff; the Sonnet main session
  writes the code and tests.
- **Check rule:** docs or CI-config-only PRs run `check:quick`; anything
  touching `app/` or `tests/` runs `check:full`.
- **Usage rules:** batch searches, read line ranges, `/clear` after each
  merged PR.
- `docs/NOW.md` now carries the session-start check, the approved
  decisions, the open validation and the plugin quirk.

Tested with `check:quick`. Saved results are unchanged.

# Review, bug diagnosis, prior art and retro skills; a glossary of units

Process and docs only (the A3 items of the approved tools evaluation, `docs/proposals/dev-tools-and-reuse.md` section 10). No app code; saved deals and golden outputs untouched. Written in our own words: nothing is copied from the outside skill repository and nothing is installed (its text could not be read here).

- **New skills (`.claude/skills/`):** `diagnose-bug` (reproduce small, failing test first, root cause in one line, fix once in the shared place), `review-diff` (two separate passes: the repo's standards, then the approved spec; for the designer's end-of-PR review), `prior-art` (the capped search and table before a proposal or a build), `retro`.
- **Extended:** `pr-report` gains a "merge danger" line; `quality-gates` says write the failing test first.
- **New `docs/glossary.md`:** the CRE words the app uses, each with its unit, and what to know about a number before using it (period, basis, area basis, sign).
- **`docs/working-rules.md`:** a short checklist for keeping `CLAUDE.md` short. `CLAUDE.md` itself is unchanged.
- **Already covered, no new file:** `tdd` (quality-gates), `handoff` (the `NOW.md` state note), `git-guardrails` (the hook, #56).
- **Cost:** about 0.9k tokens per skill description loaded each session; the bodies load only when used.

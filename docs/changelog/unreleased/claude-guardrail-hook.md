# A git guardrail stops forced pushes and other destructive git commands

Process and tooling only (the third item of the approved tools evaluation, `docs/proposals/dev-tools-and-reuse.md` section 10). No app code changed; saved deals and golden outputs untouched.

- **What it does:** a project hook (`.claude/hooks/git-guardrails.mjs`, registered in `.claude/settings.json`) refuses a forced push, a push that deletes a branch or targets main or master, `reset --hard`, `clean -f`, `checkout .` / `restore .` of the whole tree, `branch -D`, `stash clear` / `drop` and `--no-verify`, and tells Claude to stop and ask the owner. A normal push of a branch is never blocked. This makes CLAUDE.md's "never force-push, reset or delete without authorization" mechanical.
- **Own-written, not hookify:** the hookify source could not be read here (repository access is limited to a web fetch), and the approved rule was to write our own in that case. About 100 lines, no dependencies, nothing added to `THIRD_PARTY.md`.
- **Limits, written in `docs/working-rules.md`:** it reads command text, so a script or `eval` that runs git is not seen; it guards against a slip, not an attack.
- **Tested:** `tests/guardrail.test.js` (34 refused and 35 allowed commands, a heredoc commit message that mentions a forced push, the hook's exit codes, and that it is registered); 8 mutation checks, all caught.

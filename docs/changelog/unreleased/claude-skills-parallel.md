# Workflow: two new skills (skill-check, proposal), a screenshot-first habit for new browser flows, and builder agents in parallel

The owner asked for faster, parallel work and for the useful skills found on GitHub to be used. No app code changed; saved results and golden outputs are unchanged.

- **Builder agents in parallel (owner, 2026-10-22):** `CLAUDE.md`'s usage rule now lets builder agents run in parallel on independent work, each in its own git worktree. Two designer (Opus) agents never run at once, and PRs still open for the owner one at a time. The `run.sh` lock (4.7.48) keeps parallel browser runs from colliding.
- **`skill-check` skill:** a six-step checklist for adding or trimming a skill (short, a clear trigger, CLAUDE.md fit, one hand try, adopted text unchanged). The idea comes from Anthropic's skill-creator (Apache-2.0); the text is our own.
- **`proposal` skill:** scaffold a proposal's sections first, fill them from the repo, then a reader test (one fresh agent answers the owner's questions from the proposal alone) before stopping for approval. The idea comes from Anthropic's doc-coauthoring, whose folder states no licence, so nothing is copied.
- **`quality-gates`:** the full check now notes that it runs the AI server's tests and that `run.sh` waits for port 8080; a new step says to take a screenshot before choosing selectors for a new browser flow (from Anthropic's webapp-testing, otherwise skipped: our `tests/e2e/` already covers it).
- **Skipped:** webapp-testing as a skill (a second browser stack and a shell-running helper, for what our flows already do).

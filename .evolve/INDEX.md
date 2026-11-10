# Ledger index

A short, persistent knowledge ledger so a new session does not re-read
everything. It points at the docs; it does not copy them. Started 2026-11-10
at the owner's request. Public repo: no real names, figures or private files.

## What each file is for

| File | Use it to |
|---|---|
| `PROJECT_CONTRACT.md` | know the goal, the invariants and the working mode |
| `DECISIONS.md` | see what the owner already decided, with the source file |
| `LESSONS.md` | avoid a mistake that already cost time |
| `EVALS.md` | run the checks and know the baseline numbers |
| `RESEARCH.md` | find prior art, the outside-systems matrix and the seed-repository review |
| `BACKLOG.md` | pick the next vertical slice (one ordered list) |
| `HANDOFF.md` | learn the state right now (branches, stash, where files live) |

## Read order for a new session

1. `docs/NOW.md` (always first, and only this from `docs/` at start).
2. `.evolve/HANDOFF.md`, then `.evolve/BACKLOG.md` (top "building" or "next").
3. `.evolve/PROJECT_CONTRACT.md` once per session (invariants, working mode).
4. `.evolve/EVALS.md` before running checks; `LESSONS.md` before a risky change.
5. `DECISIONS.md` and `RESEARCH.md` only when a question touches them.
6. Everything else by grep, by section: `docs/PLAN_STATUS.md`,
   `docs/acceptance-matrix.md`, `docs/proposals/*`. Never edit
   `ZLATURA_MASTER_PROMPT_v2.md`.

## The rule

**Update the ledger in the same commit as the change.** A change that moves a
backlog status, makes a decision, teaches a lesson, shifts a baseline or
changes the handoff state edits the matching ledger file in that commit. If
the ledger and `docs/NOW.md` disagree, `docs/NOW.md` wins; fix the ledger.

## Keep it short

- About 40-90 lines a file. One line per entry; link the source file.
- Dated entries (YYYY-MM-DD). Status words as in `docs/PLAN_STATUS.md`.
- Never write a real property, tenant or firm name, or a figure from the
  owner's documents. Counts and structure only.

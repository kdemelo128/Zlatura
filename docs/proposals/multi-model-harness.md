# Multi-model harness: Claude as the hub, six models as workers

Status: **proposal, waiting for the owner.** Nothing is built. This costs money
and handles API keys, so it is an approval gate (`CLAUDE.md`).

## What the owner asked for

A way to run agents and the Zlatura workflow through Codex (GPT), Muse AI, Kimi,
Gemini, Grok and Claude, with Claude as the central harness.

## Design in one paragraph

Claude stays the only agent that touches `main`'s rules. It writes a **task card**
(a small markdown file), picks a worker from a **routing table**, runs that
worker in its own git worktree and branch, then reviews the diff and runs the
real gates (`check:full`, golden, mutation) itself. A worker's own claim of
"tests pass" is never accepted. The owner merges, as now.

```
owner ─► Claude (hub) ─► task card ─► worker (one worktree, one branch)
                ▲                           │
                └── diff + gate results ◄───┘      owner merges
```

## Parts

1. **`tools/harness/` (dev tooling only, never shipped).** Not in `app/`, so no
   effect on the PWA, golden outputs or the service worker. Plain Node, no
   dependencies, no build step.
   - `workers.json`: one entry per worker: name, how it is run (vendor CLI or
     HTTPS API), the environment variable that holds its key, the model name,
     a per-task cost cap, and what it is allowed to do (see Safety).
   - `run-task.mjs <card> <worker>`: makes a worktree from latest main, writes
     the card plus `AGENTS.md` into the prompt, runs the worker, commits its
     output to `agent/<worker>/<card>`, and prints the diff stat. It never
     pushes to `main` and never merges.
   - `gate.mjs <branch>`: runs `check:quick` or `check:full`, then reports
     pass/fail from exit codes only.
   - `docs/tasks/<id>.md`: the task card: goal, files in scope, files out of
     scope, acceptance test that must fail on old code, which gates apply.
2. **Routing table** (a starting point, owner can change it):

   | Work | Worker | Why |
   |---|---|---|
   | Money, parsing, data format, security, final review | Claude Opus (designer) | existing rule |
   | Routine build, UI, tests, docs | Claude Sonnet (builder) | existing rule |
   | Underwriting filler and Excel-shaped work | Codex | owner's filler was built there |
   | Long documents, big-file reading, bulk summarising | Gemini | large context |
   | Second opinion on a diff; adversarial test ideas | Grok or Kimi | different failure modes |
   | Muse AI | **unknown to me; owner to say what it is and how it is reached** | see Open questions |

   Rule kept from today: after two failed tries by any worker, the task goes
   back to the designer. A second model reviews a first model's diff for the
   money, parsing and security items (two-model agreement is evidence, not proof).
3. **Instructions every worker gets**: `AGENTS.md` (already merged, #120). The
   harness adds nothing that weakens it.

## Safety rules (the part that matters)

- **The repo is public, but `private/` is not.** The harness copies only the
  files named in the card's "in scope" list into the worker's worktree, and a
  worktree is built from `git archive`, so `private/`, `.env*` and real client
  files are physically absent. A test fails if the harness could pass a path
  under `private/`. Real files are never sent to any third-party model; a
  worker sees invented fixtures only.
- **Keys** live in environment variables or the owner's secret store, never in
  the repo; `tests/hygiene.test.js` already fails on a tracked key. The harness
  refuses to start if a key appears in a card or a worker's output.
- **Least privilege**: workers run with no push rights and no GitHub token.
  Claude pushes after review. No worker deploys, merges or edits settings.
- **Cost cap**: each worker has a per-task token or dollar cap in
  `workers.json`; the run stops at the cap and says so. Totals are written to
  `docs/NOW.md` in the PR report ("running cost").
- **Prompt-injection**: worker output is data. Claude reads the diff, not the
  worker's instructions to Claude. Worker diffs touching `.github/`, `sw.js`,
  `tests/hygiene.test.js`, the allowlists or `workers.json` itself are refused
  unless the card names them.
- **Clean room**: no worker is asked to reproduce vendor products, formats or
  leaked code; the existing rule stands.

## Prior art (capped search; versions and licences to be re-checked before use)

| Option | Licence | Offline | Network | Verdict |
|---|---|---|---|---|
| Vendor CLIs (Codex CLI, Gemini CLI, others) | Codex CLI and Gemini CLI are Apache-2.0 as I recall (UNVERIFIED); Kimi, Grok, Muse unchecked | no | vendor API | **Use as the adapter target** where a CLI exists; nothing vendored |
| One gateway API (LiteLLM / OpenRouter style) | LiteLLM MIT as I recall (UNVERIFIED); OpenRouter is a paid service | no | a third party sees all prompts | **Not recommended**: one more party holding code and keys. Owner can overrule |
| aider and similar agent wrappers | Apache-2.0 as I recall (UNVERIFIED) | no | vendor APIs | Not needed; the card plus worktree is smaller |
| Own `tools/harness/` | ours | yes | only the worker call | **Recommended**: about 300 lines, no dependency |

No new library or copied code is added by this proposal. If any CLI is
installed on the owner's machine, that is the owner's install, not the repo's.

## What I need from the owner

1. **Approve the design** (or change the routing table).
2. **Muse AI**: what is it, and how is it called (CLI, API, web only)? I will not
   guess an endpoint. Web-only tools can still take a card by copy and paste;
   the harness then records the pasted diff on a branch.
3. **Keys and cost**: which of the six you have accounts for, and a monthly
   ceiling. I will not create accounts or add keys. Keys are set on your
   machine; I only name the variables (`OPENAI_API_KEY`, `GEMINI_API_KEY`,
   `XAI_API_KEY`, `MOONSHOT_API_KEY`, plus Muse's once known).
4. **Where it runs**: on your computer (workers can use your logged-in CLIs; my
   cloud session cannot reach them) or only from my cloud container (needs keys
   added as environment secrets, which is a settings change for you to make).
   I recommend your computer for Codex and any logged-in CLI, with me
   orchestrating through a session on that machine.
5. Confirm the **no real files to any outside model** rule above.

## Build plan once approved (one PR each)

- H1: `tools/harness/` + task card format + `gate.mjs` + tests (path-leak guard,
  key-in-output guard, cap, protected-file refusal), all on stubbed workers so
  tests need no network or keys.
- H2: adapters, one worker at a time, each with a dry run on a docs-only card.
- H3: the second-model review step and the cost line in the PR report.

## What is not covered

Nothing here was run against a real vendor yet. Whether each vendor's CLI
supports non-interactive, no-push operation in your versions is unchecked and
will be tested in H2, per worker, before it goes in the routing table.

## Decided (owner, 2026-11-05)

The owner approved the design and all recommendations, and answered the open questions:

- **Muse AI** is Meta AI's Muse (muse.ai). It is a chat product, so it is a paste-in
  ("relay") worker. No endpoint is assumed.
- **Accounts:** all six are made and linked to the owner's Google sign-in. Plans: Claude Pro,
  GPT basic paid, Gemini free paid-basic, Grok, Muse and Kimi free.
- **Consequence for the design:** a Google sign-in is a login to the chat app, not an API
  key, and free plans often have no API. So no keys are used at all. A worker is either a
  command-line tool the owner is logged in to on their own computer (`cli`: Codex, Gemini)
  or a chat the owner pastes into (`relay`: Grok, Kimi, Muse). Whether each vendor's CLI
  exists for the owner's plan is checked in H2, per worker.
- **Cheaper and older models are welcome** for routine cards; the routing table prefers the
  cheapest allowed worker, and money, parsing and security stay on Opus.
- **Where it runs:** the owner's computer for CLIs and pastes; Claude orchestrates and
  reviews. The owner's address is never put in a card, a packet or a commit (the tool
  refuses it).
- **Visual:** the Model Board artifact (`https://claude.ai/artifact/HJpZztLwpoVVkkEYdrH9Yz`,
  private to the owner) shows the hub, the seven workers, a router, and the setup steps.

## Built in this PR (H1)

`tools/harness/{workers.json,lib.mjs,run-task.mjs}`, `docs/tasks/example-docs-card.md`,
`tests/harness.test.js`. Commands: `plan`, `packet`, `run` (CLI workers), `ingest` (paste-in
replies). Tested on stubs only (no network, no keys). No worker has been run against a real
vendor: that is H2, and each worker shows "not yet tested" until then.

## Addendum (owner, 2026-11-05): roles, every model, every project

The owner wants every model used, on this project and future ones, each in a role: designer,
researcher, bug fixer, developer, and so on. Built in `claude/harness-roles-connectors`:

- **Roles, not just models.** `workers.json` now has ten roles (orchestrator, designer,
  researcher, developer, bug-fixer, tester, reviewer, security-reviewer, writer, ideas). Each
  has a primary worker, fallbacks, and a reviewer. A task card has a `kind`; the kind maps to a
  role; the role maps to a worker. If a worker is out of free messages or not installed, the
  next one in the role takes the card (`plan --available a,b`).
- **Every one of the six products plays a role** (a test fails if one is left out). Starting
  assignments: Claude Opus designs, fixes bugs and reviews security; Claude Sonnet
  orchestrates, builds and tests; Codex builds and refactors; Gemini researches and writes;
  Grok reviews diffs and tests; Kimi researches and reviews; Muse brainstorms.
- **Projects.** A card can say `project: <name>`. `projects` in `workers.json` holds each
  project's extra protected paths and the paths that need an `approved-design:` line before
  any worker may touch them (Zlatura: `app/engine/`, `app/deal.js`). Anything not named uses
  the default project, so a new project works with no change to the tool.
- **Connectors** (`tools/harness/connectors/`): one per vendor (claude, openai, gemini, grok,
  kimi, muse), each `agent`, `cli` or `relay`. A connector checks whether it works on this
  machine (`doctor`), builds the command for a CLI worker, gives paste-in instructions for a
  chat worker, and pulls a unified diff out of a chat reply. No connector holds a key or makes
  a network call (a test enforces it). These are not claude.ai or Model Context Protocol
  connectors: those need each vendor's own sign-in, which only the owner can do.
- **Not yet verified:** the exact command lines for Codex CLI and Gemini CLI. `doctor` on the
  owner's machine and the H2 dry run settle that before either is relied on.

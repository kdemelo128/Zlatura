# Efficiency setup (4.7.8): three decisions for the owner

The 4.7.8 PR makes each session cheaper without skipping a quality gate. It
adds a short `CLAUDE.md` (the longer wording moved to
`docs/working-rules.md`), `docs/NOW.md` as the one file read at the start of
a session, four on-demand skills (`release`, `pr-report`, `hand-test`,
`quality-gates`), read-deny rules for large or private files, and
`npm run check:quick`, `check:full` and `bump`. Three choices cost money or
change how work runs, so they are left to the owner. Each has a
recommendation. **The owner decided all three on 2026-10-15; see "Decided"
at the end.**

## 1. Default model and effort

**Now:** the main session runs on whatever model the session starts with.
The designer agent runs on Opus and the builder on Sonnet, as set in
`.claude/agents/`.

**Recommended:**
- **Main session on Sonnet, medium effort**, set in `.claude/settings.json`
  (`"model": "sonnet"`). Most main-session work is routine: wiring, tests,
  docs, release steps and running checks.
- **Designer stays on Opus**, for proposals, root causes, parsing, money
  logic, migrations, security and the phase review. Work of those kinds is
  handed to it, as the routing rules already say.
- **Builder stays on Sonnet.**
- The owner can switch any session with `/model` when a task needs more.

**Trade-off:** cheaper and usually faster. The risk is that a Sonnet main
session takes on a money or parsing question itself instead of handing it to
the designer. The routing rule in `CLAUDE.md` covers this, and the PR report
already says which agents were used.

**Alternatives:** keep Opus for the main session (it costs the most and
gives the most judgement every turn); or use Opus at medium effort.

## 2. A browser subset in CI

**Now:** GitHub Actions (`.github/workflows/test.yml`) runs only the Node
tests (`npm test`, app and server). The 37 browser flows run only in a
Claude session, through `check:full`.

**Recommended:** add a second job that runs a fast, high-value subset on
Chromium at iPhone size. The subset is `typing-flow`, `lostedit-flow`,
`deal-persistence`, `deal-isolation`, `errors-flow` and `a11y-flow`, using
`bash tests/e2e/run.sh <flows>` (4.7.8 lets it take several flows). It
catches the kinds of bug found since 4.7.3 on every push, including pushes
not made from a Claude session.

**Cost:** the repository is public, so standard GitHub-hosted runners cost
nothing in Actions minutes. The run takes longer, about 5 to 10 minutes,
because Playwright's Chromium and the Python packages are installed on each
run. LibreOffice recalc, WebKit and the full suite stay in `check:full`.
This is an estimate: no CI browser job has been run yet. The job would be
built and timed in its own PR.

**Alternative:** keep CI to Node tests only. This costs nothing more, but a
browser regression is caught only when a session runs `check:full`.

## 3. Plugins and MCP servers this project doesn't need

Every session here loads the account's plugins, each with its skills and
most with an MCP server. Their names and descriptions are added to every
turn's context, and about 100 MCP servers try to connect at start (most fail
in this sandbox). None of them is used by Zlatura's work.

**Recommended: turn these off for this project.** Keep `engineering`,
`design`, `pdf-viewer`, `figma` (for the UI revamp, if the owner uses it) and
the built-in Anthropic skills. Turn off, in the account's plugin settings or
with `enabledPlugins` set to false in `.claude/settings.json`:

- finance and advisory: `claude-for-financial-advisors`, `finance`, `lseg`,
  `sp-global`, `daloopa`, `bigdata-com`;
- sales and marketing: `sales`, `marketing`, `brand-voice`, `searchfit-seo`,
  `small-business`, `vpai`, `brightdata-plugin`, `product-tracking-skills`;
- other teams: `legal`, `human-resources`, `operations`,
  `customer-support`, `productivity`, `product-management`,
  `enterprise-search`, `cowork-plugin-management`, `data`,
  `datarobot-agent-skills`, `bio-research`;
- site and design builders: `wix`, `animatedwebs`, `canva`,
  `adobe-for-creativity`;
- file and chat services: `box`, `slack-by-salesforce`,
  `desktop-commander`.

**Trade-off:** shorter context on every turn and a faster session start.
Turning a plugin off is undone by turning it back on. Plugins synced from
the account may have to be turned off in claude.ai settings rather than in
the repository; this hasn't been tested yet.

## Decided (owner, 2026-10-15)

1. **Model and effort: applied in 4.7.9**, in `.claude/settings.json` only:
   `"model": "sonnet"` and `"effortLevel": "medium"` for the main session.
   The designer agent stays on Opus and the builder on Sonnet
   (`.claude/agents/`). It takes effect from the next session started in this
   repository; `/model` and `/effort` still change a running session.
2. **CI browser subset: approved, small.** The flows are `typing-flow`,
   `lostedit-flow`, `deal-persistence` and `deal-export`. It is built in its
   own PR after the partial-year T-12 fix, then timed, with the cost if the
   repository goes private.
3. **Plugins: applied in 4.7.9**, in this project's `.claude/settings.json`
   only, not globally. Kept: `engineering`, `design`, `pdf-viewer` and
   `figma`. These 32 are set to `false` under `enabledPlugins`:
   - from `anthropic-plugin-directory`: `adobe-for-creativity`,
     `animatedwebs`, `bigdata-com`, `bio-research`, `box`, `brand-voice`,
     `canva`, `claude-for-financial-advisors`, `cowork-plugin-management`,
     `customer-support`, `daloopa`, `data`, `datarobot-agent-skills`,
     `desktop-commander`, `enterprise-search`, `finance`,
     `human-resources`, `legal`, `lseg`, `marketing`, `operations`,
     `product-management`, `productivity`, `sales`, `small-business`,
     `sp-global`, `vpai`, `wix`;
   - from `knowledge-work-plugins`: `brightdata-plugin`,
     `product-tracking-skills`, `searchfit-seo`, `slack-by-salesforce`.

   **To turn one back on:** in `.claude/settings.json`, delete its line under
   `enabledPlugins` (or set it to `true`), then start a new session. To turn
   one on only for yourself, without changing the repository, add
   `"enabledPlugins": { "<name>@<marketplace>": true }` to
   `.claude/settings.local.json` (git-ignored).

   Whether the claude.ai-synced plugins honour a project's `enabledPlugins`
   is checked at the start of the next session (the skill list should no
   longer show them). This session started before the change, so it can't
   show it.

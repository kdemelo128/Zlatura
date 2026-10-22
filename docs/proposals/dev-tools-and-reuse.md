# Developer tools, skills, memory systems and reusable ideas: evaluation

Research only. Nothing was installed, enabled, run or copied; `.claude/`, `THIRD_PARTY.md` and `app/` are untouched.
Each repository was read as untrusted text through a read-only web fetch (pages, raw files, commit lists); archives
and the GitHub API were blocked, so inventories come from tree pages. **UNVERIFIED** = not read. SHA = commit seen
2026-10-21 (short where the full one was not captured). Instruction-like text inside fetched pages was ignored.

## 1. Executive summary

- **Do now (no third-party code):** use Claude Code features we do not use (D2); adopt the Cloudflare audit *method*
  as a checklist in our words (A4); fix four findings from the audit we ran (section 4, one medium).
- **Test first, one at a time:** `ponytail` (A1, PR size) and `context-mode` (B3, tool-output compression), in an
  isolated, approval-gated A/B. No honest number exists until then.
- **Do not adopt:** D9 (AGPL; routes sessions through ~60 third parties), B1, B4, B5, D4, C4, D6. Their ideas are kept.
- **No tool was benchmarked.** Section 5 defines the experiments.

## 2. Current setup and baseline

| Item | Observed (`c300a09`, 4.7.27) |
|---|---|
| Config | `settings.json`: sonnet, effort medium, 32 plugins all off, 10 `Read` denies (incl. `private/**`). **No hooks, MCP, statusline.** 4 skills (6.7k chars), 2 agents (5.0k) |
| Always-read | `CLAUDE.md` 7.6k chars + `NOW.md` 7.7k ≈ 3.8k tokens (est., 4 chars/token) |
| Workflow | `npm test`, `check:quick`, `check:full` (~12 min: Node, tsc, golden 618+646, browser, axe, 150 ms perf); one PR per item |
| Boundaries | Vanilla-JS offline PWA, no build; CSP only `object-src/base-uri/form-action`; optional Node AI server holds keys; `private/` git-ignored |
| PR size (last 8) | 20–841 lines added (median 212); 7–23 files (median 10.5) |
| Tokens | **Not measurable here**: the harness gives one `subagent_tokens` figure, not input/output/cache. Instrument for later: `/usage` cache line (docs, v2.1.251+). |

## 3. Repository evaluation

Cells: purpose / **best idea** / take · license · security · cost · fit · **disposition** (why; reconsider if).

### A: developer skills

| Repo | Evaluation |
|---|---|
| **A1** [ponytail](https://github.com/DietrichGebert/ponytail) `09c434a` | **MIT.** "Lazy senior dev" skill. **Idea:** ladder "needed? → already in codebase? → platform? → one line", never cut validation/security. Take SKILL text only (~0.9k tok). **Hooks** on SessionStart/SubagentStart/UserPromptSubmit write `~/.claude`, read `settings.json`, inject a project map each session (recurring tokens); no network seen; 8+ hook files UNVERIFIED. Overlaps CLAUDE.md and builder. **ADOPT LATER**, text only: scope gain unmeasured. Before: T1. Reconsider if no ≥20% PR-size gain. |
| **A2** [karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) `2c60614` | **MIT claimed, no LICENSE file or holder.** 4 rules (think, simplicity, surgical, goal-driven). **Idea:** every task = "step → verify: check". Text only, ~0.6k tok if always loaded; install docs name another owner and one option pipes a moving `main` into CLAUDE.md. Duplicates plan mode and quality-gates; "stop and ask" adds turns. **REVISIT**: take the idea in our words. Reconsider if a LICENSE file appears. |
| **A3** [mattpocock/skills](https://github.com/mattpocock/skills) `5beb35b` | **MIT.** 38 skills (list below). **Idea:** red-first diagnosis; two-axis review (standards vs spec). No telemetry; shipped scripts have no network; tracker skills read untrusted issue text; a dev script `rm -rf`s in `~/.claude/skills`. 0.2k–12.6k chars each, on demand. Pipelines conflict with one-agent rule. **ADOPT LATER**, text adaptation of KEEP items through our skills. Before: owner picks items. |
| **A4** [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) `c1c8a8c` | **MIT.** Six phases: recon → hunter waves → **fresh verifier must reproduce before severity** → schema'd findings → re-verify → report. No hooks, no `allowed-tools`; validators stdlib, no network; full audit writes `~/security-audit-skill/`. **Cost ≈18k tokens** for 4 main files, plus sub-agents and an OS sandbox. **ADOPT NOW** as a checklist in our words (section 4 shows it works). Full skill: reconsider before accounts/hosting (Phase 7), sandboxed. |
| **A5** [diagram-design](https://github.com/cathrynlavery/diagram-design) `f2f4d49` | **MIT.** Hand-drawn inline-SVG diagrams in one HTML file; stdlib `self_check.py` (**idea:** reject remote assets, clipped content, missing accessible names). No hooks; generated files load Google Fonts (offline conflict); PNG needs Playwright; **≈7.7k tokens per use**; `.html` does not render in `.md`. **REVISIT**. Reconsider if a proposal needs 3+ diagrams, with system fonts and a trimmed skill. |

**A3 inventory (38).** **KEEP:** `code-review` (feeds our designer's end-of-PR review), `tdd` (= "tests fail on old code"), `diagnosing-bugs`, `pr`
(take "merge-danger" into `pr-report`), `domain-modeling` (CRE glossary for Part 21.2 unit hygiene), `research` (prior-art step),
`writing-for-agents` (checklist to trim CLAUDE.md), `handoff` (= `NOW.md` state note), `retro`, `git-guardrails-claude-code` (its
`git push` substring match would block our pushes; adapt to force-push/reset/clean). **SKIP:** `ask-matt` (12.6k router for his flow), `codebase-design`
(OO vocabulary), `grill-with-docs`/`grill-me`/`grilling` (plan mode covers it), `implement`/`implement-spec`/`wayfinder`/`to-spec`/`to-tickets`/`triage`
(tracker, worktree and subagent pipelines), `improve-codebase-architecture` (CDN scripts, opens a browser), `prototype`, `setup-matt-pocock-skills` (rewrites CLAUDE.md),
`wizard` (generates `gh secret set`/`.env` scripts), `teach`/`to-questionnaire`/`wait-what` (not our workflow), `chief-of-staff`/`claude-handoff`
(`claude --bg`)/`loop-me`/`setup-ts-deep-modules` (adds a dev dependency)/`writing-beats`/`writing-fragments`/`writing-shape` (beta), `migrate-to-shoehorn`/`scaffold-exercises`/`setup-pre-commit` (TS/pnpm/Husky course tooling).

### B: memory and harness tools (none can be shown local-only and `private/`-excludable)

| Repo | Evaluation |
|---|---|
| **B1** [claude-mem](https://github.com/thedotmack/claude-mem) `bbb3379` | **Apache-2.0.** Hook-captured observations, SQLite+Chroma, MCP search. **Idea:** progressive disclosure: ID index → timeline → full fetch (~50–100 tok/result, then 500–1,000). **Fails local-only by default:** installer offers a hosted "observer" LLM (email sign-in), Cloud Sync, `posthog-node` (default UNVERIFIED); captures every tool result; only `<private>` tags, no path exclusion; Bun/uv; edits `~/.claude`; 7 lifecycle events. **REVISIT** if hosted calls are provably off, a local summarizer exists and `private/` is excludable. |
| **B2** [hindsight](https://github.com/vectorize-io/hindsight) `10f2783` | **MIT.** Recall each prompt (cap 1,024 tok), retain every 10 turns, local daemon + embedded Postgres. **Idea:** hard recall budget, observation-only filter, score floor. Extraction sends transcripts to whatever LLM key it finds unless Ollama/LM Studio is set; `uvx …@latest` at runtime; Hugging Face downloads; OTEL/decision-model defaults UNVERIFIED; no path exclusion. **REVISIT** if a local-model run is verified end to end. |
| **B3** [context-mode](https://github.com/mksglu/context-mode) `a92cf6a` | **Elastic-2.0** (source-available, not OSI; internal use fine, never copy in). Routes big tool output into a local FTS index; claims 98% saving (unverified). **Idea:** one policy: it reads our `permissions.deny`, so `Read(./private/**)` would bind it. Hooks on Bash/Read/Grep/WebFetch/Agent/`mcp__`, PreCompact, Stop; `ctx_insight` opens a hosted dashboard (user-invoked); hook bodies, `server.ts`, bundles UNVERIFIED; Node ≥22.5; global install edits `~/.claude`. **ADOPT LATER**, benchmark candidate. Before: read hooks/server, confirm deny rules apply before indexing, throwaway clone without `private/`. |
| **B4** [ECC](https://github.com/affaan-m/ECC) `90606c8` | **MIT** (paid hosted tier exists). 71 agents, 311 skills, 97 commands, hooks. **Idea:** observation hygiene: truncate, scrub, purge at 30 days. Hooks on ~10 events spawn bash/node per tool call; `observe.sh` logs every call before checking its "off" switch; background observer uses a remote model; `auto-update.js` pulls git; most hook bodies UNVERIFIED. **REVISIT**: far larger than our problem; reconsider for one component, read in full and pinned. |
| **B5** [ruflo](https://github.com/ruvnet/ruflo) `33c3e15` (short) | **MIT** (file UNVERIFIED). 100+ agents, swarms, 27+ hooks, daemon (10 workers), `npx -y ruflo@latest` MCP (unpinned), writes `~/.ruflo`, remote "funnel" fetch, federation; "15-agent swarm" contradicts our one-agent rule. **Idea:** `scanSettingsForRisk`: scan our own settings for `curl\|sh`, `rm`, `sudo`, `base64 -d`, `Bash(*)`. **REVISIT**; write the scan ourselves. |

### C: reference and product ideas (no code taken)

| Repo | Evaluation |
|---|---|
| **C1** [financial-services](https://github.com/anthropics/financial-services) `574ed36` | **Apache-2.0.** Banking/equity plugins; **no real-estate content**; `.mcp.json` lists 12 paid vendor connectors (incompatible with local-only). **Idea:** `audit-xls`: hardcode, unit/scale, sign and hidden-sheet checks; severity table (Sheet, Cell, Severity, Issue, Fix); **report first, fix on request**. BS/CF tie-outs, WACC, LBO do not transfer. Maps to **U5/U6** (roll and T-12 checks), **U3** (strict review), **U2** (severity tiers). **ADOPT LATER** (ideas only), when U-series starts. |
| **C2** [rea](https://github.com/morluto/rea) `8e3bf56` | **MIT** (bundled third-party licenses UNVERIFIED). A **reverse-engineering** toolkit, not real estate. **Idea (inferred, not in repo):** inspect a seller's workbook for hidden sheets, hardcodes where formulas belong, broken references. Nothing reproduced. **REVISIT** as a tool; the idea folds into T-12 PR 1. |
| **C3** [ppt-master](https://github.com/hugohe3/ppt-master) `604ecde` | **MIT** (file UNVERIFIED); optional PyMuPDF is **AGPL**. AI-written SVG → editable PPTX in Python, native charts/tables with Edit Data. **Idea:** deal deck from deal data. Python cannot run in the browser; a vendored JS writer (PptxGenJS or OOXML via fflate) needs its own license check, UNVERIFIED. Deck: property, roll, T-12/NOI, value, comps, sensitivity, photos, sources. **ADOPT LATER** (idea only) when the owner asks and the U-series is done. |
| **C4** [plausible](https://github.com/plausible/analytics) `b8cc135` | **AGPL-3.0+ server**, MIT tracker. The tracker sends data to a server by design: **conflicts with local-first**; source not read. **Idea:** aggregate-only, data-minimised counters, kept on-device (day buckets, "delete usage data"). **REVISIT**; embed nothing. |

### D: additional tools

| Repo | Evaluation |
|---|---|
| **D1** [claude-plugins-official](https://github.com/anthropics/claude-plugins-official) `d1adba4` | **Apache-2.0** (two plugins list MIT in README). 40 + 14 plugins, none declare permissions; plugin list below. **ADOPT LATER** for `hookify` and `security-guidance` (regex only). |
| **D2** [claude-code](https://github.com/anthropics/claude-code) (CHANGELOG 2.1.306) | **Proprietary, all rights reserved.** First-party; ≈0 token cost. **ADOPT NOW** (section 6). |
| **D3** [substrate](https://github.com/agent-substrate/substrate) `2864a31` | **Apache-2.0.** Kubernetes runtime for sandboxed agents (gVisor/microVM, SPIFFE). **Idea:** credentials never in the sandbox; a gateway injects them. Needs Kubernetes, Postgres, Envoy; pre-1.0, no release. **REVISIT** for hosted multi-user AI (Phase 7). |
| **D4** [paperclip](https://github.com/paperclipai/paperclip) `898144f` (short) | **MIT.** Node ≥24.11 control plane with embedded Postgres and UI. **Idea:** atomic per-task claim (mkdir lock + lease) enforces one agent at a time. README: telemetry on by default (UNVERIFIED); `--bind lan` exposes it. **REVISIT** at 3+ concurrent agents. |
| **D5** [gpui-kit](https://github.com/longbridge/gpui-kit) `8b3631f` | **Apache-2.0** (docs CC BY 4.0). Rust native UI kit. **Idea:** unstyled behavior layer + app-owned styled layer. Rust build only, source UNVERIFIED. **REVISIT** if a native desktop app is approved. |
| **D6** [VoiceStudio](https://github.com/debpalash/VoiceStudio) `28bf2c7` | **AGPL-3.0**: copying makes Zlatura AGPL. Local speech studio, GPU or heavy Python/Electron; sign-in, cloud sync, optional analytics (UNVERIFIED); model weights separately licensed. **Idea:** a Model Manager showing source, license and evidence before download. Our route stays the firm's server. **REVISIT** (never as code). |
| **D7** [hyperframes](https://github.com/heygen-com/hyperframes) `b306438` | **Apache-2.0.** HTML + timing → MP4 (headless Chrome, FFmpeg, Node 22+); optional HeyGen cloud render uploads media; telemetry UNVERIFIED. **Idea:** a video as data, rendered deterministically from deal data. A staff-machine tool, not a PWA feature. **REVISIT** if the owner wants deal video (local render only). |
| **D8** [gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view) `f3bb697` | **MIT code; datasets NC/ODbL.** 3D globe over Cesium/Google tiles with many third-party calls. **Idea:** serialise full view state into a shareable URL; keep a code-vs-data license note. Our rule: maps are links. **REVISIT**; no dependency. |
| **D9** [free-claude-code](https://github.com/Alishahryar1/free-claude-code) (SHA UNVERIFIED) | **AGPL-3.0.** **Static read only; proxy source not read.** Local proxy routing Claude Code to ~60 providers with ordered fallback, so prompts, code and tool output reach whichever are chosen; keys in `~/.fcc`; ChatGPT/Copilot OAuth; installer runs ~8 vendor installers via unpinned `curl\|sh`; auto-updater; provider terms may forbid proxying subscriptions (inference). **Idea:** one local endpoint translating to many back ends (not a recommendation). **REVISIT: do not install or run;** no foreseeable condition. |

**D1 plugins.** `hookify` (local regex rules; stdlib Python; hook source UNVERIFIED): **ADOPT LATER**, safest way to write git guardrails.
`security-guidance` (regex on Edit/Write; its LLM layers **send diffs to a model**, off via `ENABLE_CODE_SECURITY_REVIEW=0`): **ADOPT LATER**, regex only.
**REVISIT:** `pr-review-toolkit` (6 agents; duplicates the designer), `commit-commands` (needs `gh`; `release` covers it), `claude-md-management` (overlaps `/doctor prompt-audit`), `code-review`,
`playwright` MCP (`@latest` unpinned; we run Playwright), `claude-security` (proprietary license; writes into the repo), `typescript-lsp` (manifest 404), `feature-dev`, `code-simplifier`, `frontend-design`, `skill-creator`, `plugin-dev`, `session-report`.

## 4. Security and licensing findings

**Audit of our repo** (static, by hand, using A4's public method; the skill itself was **not** run). No critical/high findings; no XSS path from file text to a DOM sink; no secrets in the repo or 164 commits.

| # | Severity | Finding | Fix (not done here) |
|---|---|---|---|
| F1 | **Medium**, confirmed (re-read `app/backup.js:131-132`) | A crafted backup sets the AI server URL: replace-mode restore copies the backup's `ai.settings` and re-adds the device token, so the next AI call sends it to the attacker's URL. | Drop `ai.settings` on read; allow-list `kv` keys |
| F2 | Low | Replace-mode restore writes any `localStorage` key (merge filters) | Apply `LOCAL_KEYS` to both |
| F3 | Low, **needs validation** | `new URL(req.url…)` outside the `try` in `server/index.mjs`; malformed target may crash the handler (token holder only; not run) | Move inside `try` |
| F4 | Low | No size/decompression limits on zip, xlsx or backup reads (self-inflicted freeze) | Size caps (T-12 PR 1 starts this) |
| I1–I5 | Defence in depth | CSP lacks `script-src`/`connect-src`; Pages cannot send `frame-ancestors`; shared `github.io` origin; service worker can mix releases; failed AI-server auth not rate-limited | Plan with F1–F4 |

Not performed: dynamic tests, deployed headers, GitHub settings, CVE lookups (no network), minified vendor code, `private/`.

**Licensing.** Fine to *use externally* with notices kept: MIT (A1, A3–A5, B2, B4, B5, C2, D4, D8 code), Apache-2.0 (B1, C1, D1, D3, D5, D7). **Flags:** *AGPL:* D6, D9, C4 server, ppt-master's PyMuPDF (never copy or link).
*Source-available:* B3. *No license file:* A2. *Proprietary:* D2, `claude-security`. *Mixed:* D8 datasets. Using a tool, taking an idea, copying code and redistributing are separate decisions; only the first two
are recommended. If anything is adopted: record repo and immutable SHA in `THIRD_PARTY.md`.
**Privacy:** no B-group tool met the local-only/exclusion test as read; only B3 reuses our deny rules.

## 5. Benchmarks and compatibility

**Observed: none for any evaluated tool.** Only this evaluation's own cost: ≈2.2M `subagent_tokens` over 14 research agents (69k–359k each; A4 fetch 94k; our audit 139k in 198 s), not split into input/output/cache.

**Experiments** (approval-gated; one tool each; same commit/model/effort; baseline + 3 runs per arm; throwaway clone without `private/`; record tokens from `/usage`, time, lines/files, tests, rework, rubric quality):

| Test | Tasks | Accept if |
|---|---|---|
| T1 A1 text-only | parser fix, UI wire-up, docs PR | PR lines or files −20%, same tests and quality |
| T2 B3 isolated | `check:full` log triage, 1,000-line module read, grep sweep | context −30%, deny rule honored, no network |
| T3 D2 settings | session cost with trimmed CLAUDE.md, path rules, idle compaction | measured cache/token gain |

**Conflicts.** B1–B5 all hook SessionStart, UserPromptSubmit and Stop; B1, B3–B5 also capture tool I/O into separate stores; B3–B5 intercept Bash/`mcp__`; A1's hooks share SessionStart. Enable **at most one** hooking tool at a time. Compatible set: D2 + A4 checklist + A3 text + C1 ideas.

## 6. Ranked recommendations

| Rank | Disposition | Item | Content / prerequisite |
|---|---|---|---|
| 1 | **ADOPT NOW** | **D2** | `/usage` baseline first; trim `CLAUDE.md` toward the documented 200 lines and move task rules to `.claude/rules/*.md` with `paths:`; `/doctor prompt-audit`; try `sandbox.enabled` + `failIfUnavailable`; idle compaction; `/rename` then `/clear`. Skip `MAX_THINKING_TOKENS`. Cloud-session behavior of sandbox and auto memory UNVERIFIED. |
| 2 | **ADOPT NOW** | **A4** | 37-check checklist in `docs/` run per phase; then a separate approved PR for F1–F4. |
| 3 | ADOPT LATER | A3 (10 KEEP) + own git guardrail via `hookify` or a 15-line hook | Owner picks items; read hookify source; must not block normal pushes |
| 4 | ADOPT LATER | A1 text-only | T1 passes |
| 5 | ADOPT LATER | B3 | Source read, T2 passes |
| 6 | ADOPT LATER | C1 ideas; C3 deck; D1 `security-guidance` regex | U5/U6 start; owner asks; LLM layers off |
| 7 | REVISIT | A2, A5, B1, B2, B4, B5, C2, C4, D3–D9, other D1 plugins | criteria in section 3 |

## 7. Adoption order (each step its own approval)

1 D2 measure and trim → 2 A4 checklist, then F1–F4 PR → 3 guardrail hook → 4 T1 (A1) → 5 T2 (B3) → 6 A3 text → 7 C1 inside U5/U6; C3 on request.
Each adoption: pin repo and SHA, attribute in `THIRD_PARTY.md`, project-scoped `.claude/` only, with the section 5 acceptance test.

## 8. Total usage cost of the recommended set

| Cost | Estimate | Basis |
|---|---|---|
| Per-session tokens | ≈0 or lower for steps 1–2; +0.9k per always-loaded skill (A1, A3) | file sizes; effect unmeasured |
| One-time experiments (T1–T3) | ≈2.5M tokens, ±50% (3 tests × 2 arms × 3 runs × ~140k) | observed 94k–359k agent runs |
| Per-phase security checklist | ≈140k tokens, ~3 min (recurring) | observed audit |
| External service / subscription | **$0**; hosted features (B1, B3, C4, D7) stay off | none required |
| Local compute, storage, upkeep | small: re-pin SHAs, re-read changed hooks quarterly | estimate |

Dollar cost is not computed (no price data used).

## 9. Open questions

1. Approve D2 trim/measurement, the A4 checklist and a F1–F4 fix PR (F1 is medium and cheap)?
2. May a sandbox be tried in the cloud session environment (UNVERIFIED there)?
3. Approve ≈2.5M tokens for T1–T3, and which first?
4. `hookify` or an own-written guardrail hook? Which A3 KEEP items?

## 10. Owner decisions and first results (2026-10-21)

**Approved by the owner: everything in section 9 as recommended** ("approve all of it go ahead"): the Claude Code settings
trim and measurement, the A4 checklist, a fix PR for F1 to F4, a sandbox trial, about 2.5M tokens for T1 to T3, the guardrail
hook (hookify or own-written: decided at build time after reading hookify's source; own-written if its source is not
acceptable), and the 10 A3 KEEP items. Order: T-12 PR 1 (already in build), then this settings and checklist PR, the
F1 to F4 fixes, the guardrail hook, the A3 text adaptations, then T1, T2, T3 one at a time.

**D2 results.** `CLAUDE.md` is 137 lines (7.6k chars), already under the documented 200-line target, so nothing is trimmed;
only the support-code bullet is domain-specific, and moving one bullet to a path-scoped rule saves too little to justify a
second place for rules. **The sandbox cannot run in this cloud container** (`bwrap` and `socat` are not installed), so
`sandbox.enabled` with `failIfUnavailable` is **not** turned on: it would stop commands from running. Claude Code is
2.1.306. Three items need the owner at an interactive prompt, because they are slash commands: `/usage` (record the prompt
cache line for a baseline session), `/doctor prompt-audit`, and the "Idle compaction" row in `/config`.

**A4 result.** `docs/security-checklist.md` (34 checks in our words) is added, and is run at the end of each phase.

**A1 ponytail, integrated 2026-10-22 at the owner's request** (4.7.43): the one skill file, text only, pinned at `09c434a`, with a Zlatura section keeping the gates; hooks and the other skills not taken. T1 was not run first; the owner chose to integrate.

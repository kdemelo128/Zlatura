# Research ledger

## Pointers (read these instead of redoing the work)

- `docs/proposals/all-in-one-research.md`: 35 outside systems, the lawful way
  to connect to each (tiers a-e), 20-item roadmap. Approved 2026-11-10.
- Prior-art tables: `prior-art.md`, `dev-tools-and-reuse.md` (30 dev tools),
  `github-tools-scan.md` (more repos), `comp-enrichment-and-sources.md`,
  `ui-filler-design-language.md` s7 (npm lookups), `uw-money-notes.md` (units/cents),
  `uw-embed-as-is.md` s10, `platform-expansion.md`, `competitive-gap.md`.
- `THIRD_PARTY.md`: what is vendored, with licence text and checksums.

## Seed repositories: static review, 2026-11-10

Method: GitHub repository page via web fetch (summarised by a small model);
nothing cloned, installed or run. Licences are as shown on the repository
page; only `anthropics/claude-code` had its LICENSE file fetched. Verify the
LICENSE file and pin a commit before adopting anything. **Most of these are
developer tooling, not product code. None is browser-compatible product code
Zlatura should ship, so there is no REUSE CODE verdict.**

| Repo | What it is | Licence | Category | What Zlatura could take | Verdict |
|---|---|---|---|---|---|
| DietrichGebert/ponytail | "Lazy senior dev" skill: least code, reuse first | MIT | dev workflow skill | Already vendored (`.claude/skills/ponytail`, THIRD_PARTY) | ADOPT AS A DEV SKILL (present) |
| multica-ai/andrej-karpathy-skills | One `CLAUDE.md` of 4 careful-coding rules | MIT stated; earlier scan found no LICENSE file | dev workflow skill | Nothing new; "step then check" already in `docs/working-rules.md` | IDEAS ONLY (absorbed) |
| mattpocock/skills | Collection of engineering agent skills | MIT | dev workflow skill | Red-first diagnosis and two-axis review exist as `diagnose-bug`, `review-diff`; more could be pinned one at a time | ADOPT AS A DEV SKILL (partly present) |
| cloudflare/security-audit-skill | Multi-phase security audit skill with verified, machine-readable findings | MIT | dev workflow skill | A repeatable audit for the end-of-phase security checklist and S2/S5-S8 | ADOPT AS A DEV SKILL (not present) |
| cathrynlavery/diagram-design | Skill that makes editorial diagrams as single HTML+SVG files | MIT | dev workflow skill | Architecture and flow diagrams for docs and Help guides | ADOPT AS A DEV SKILL (not present; low priority) |
| thedotmack/claude-mem | Memory plugin: records, compresses and replays session context | Apache-2.0 | agent memory/harness | Progressive disclosure (index, then detail), already practised; this ledger replaces it | IDEAS ONLY |
| vectorize-io/hindsight | Memory system for AI agents (Python) | MIT | agent memory/harness | Nothing for the product | SKIP (Python service) |
| mksglu/context-mode | Keeps tool output out of the context with a local SQLite index | Elastic-2.0 (source-available) | agent memory/harness | Idea of indexing big outputs; internal use only, never copy | IDEAS ONLY |
| affaan-m/ECC | Large agent harness bundle: skills, memory, scanning | MIT | agent memory/harness | Nothing the project lacks; too broad to vet | SKIP |
| ruvnet/ruflo | Multi-agent swarm harness (TypeScript, some Rust) | MIT | agent memory/harness | Nothing; own harness and hub exist | SKIP |
| anthropics/financial-services | Reference agents, skills and connectors for banking, research, PE, wealth | Apache-2.0 | inspiration only | Shape of role-based skills and data connectors; checklists for lender and analyst workflows | IDEAS ONLY |
| morluto/rea | MCP toolkit for reverse-engineering apps and binaries | MIT | inspiration only | Nothing; conflicts with the clean-room rule | SKIP (clean room) |
| hugohe3/ppt-master | AI to editable PowerPoint decks (Python) | MIT | inspiration only | Report/memorandum builder layout ideas | IDEAS ONLY |
| plausible/analytics | Privacy-first web analytics (Elixir server) | AGPL-3.0 | inspiration only | Cookie-free, no-personal-data analytics design if ever needed | IDEAS ONLY (copyleft, server) |
| anthropics/claude-plugins-official | Directory of curated Claude Code plugins | Apache-2.0 | dev workflow skill | A catalogue to browse; no code to take | SKIP (a directory) |
| anthropics/claude-code | The terminal agent used to build Zlatura | "All rights reserved", Anthropic Commercial Terms (LICENSE.md) | dev tool | Nothing to reuse | SKIP (not open licence) |
| agent-substrate/substrate | Zero-trust agent sandbox runtime on Kubernetes (Go) | Apache-2.0 | agent harness | Nothing; wrong stack | SKIP (Go, Kubernetes) |
| paperclipai/paperclip | Orchestration for agent teams: org charts, tasks, budgets, governance | MIT | agent harness | Budget and governance ideas for the hub | IDEAS ONLY |
| longbridge/gpui-kit | 75+ UI components for GPUI desktop apps (Rust) | Apache-2.0 (docs CC BY 4.0) | inspiration only | Nothing; wrong stack | SKIP (Rust) |
| debpalash/VoiceStudio | Local voice cloning, dubbing and transcription studio | AGPL-3.0 | inspiration only | Local transcription ideas for voice notes (separate tool only) | IDEAS ONLY (copyleft) |
| heygen-com/hyperframes | Renders HTML/CSS animation to MP4 for agents | Apache-2.0 | inspiration only | Nothing; video is off the roadmap | SKIP |
| bilawalsidhu/gods-eye-view | Browser 3D globe of live public data (Vue, CesiumJS, Vite) | MIT | inspiration only | Map-view ideas for Phase 4; needs a build step | IDEAS ONLY |
| Alishahryar1/free-claude-code | Proxy to run coding agents on other providers' free tiers | AGPL-3.0-only | inspiration only | Nothing; ideas only, never installed or run (owner's instruction) | IDEAS ONLY |

Verdict counts (23 repos): ADOPT AS A DEV SKILL 4; REUSE CODE 0; IDEAS ONLY 10; SKIP 9.

## What this means

1. These are developer tools, not product code: nothing here goes into `app/`.
2. Act first on `cloudflare/security-audit-skill`: it fills a gap (a repeatable audit before accounts or hosting).
3. Second, `anthropics/financial-services` (Apache-2.0): closest domain; mine its role checklists and connector shapes for workspaces.
4. Third, `diagram-design` (cheap, MIT) for architecture and Help diagrams; add more `mattpocock/skills` only one at a time.
5. Copyleft (Plausible, VoiceStudio, free-claude-code) and Elastic-2.0 stay ideas; `rea` is out on clean-room grounds.
6. Pin a commit, read the LICENSE file and vet every script before vendoring, as with ponytail.

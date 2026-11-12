# Decisions ledger

One line each: date, decision, source. Newest group first. Recommended
answers were approved unless noted. Add a row when a decision is made; for a
change to saved figures or the data format, add a before/after table below
the log (none logged yet under the 2026-11-10 working mode).

## PDF reader rules (owner approved in this chat; proposal #156)

- Import only explicit full-year actual totals into annual basis; do not invent monthly values. Keep annualized, stabilized, pro-forma, budget, per-unit, per-SF and percent columns out of actual totals. Ambiguous periods or number formats require a choice.
- For the next PM roll slice, do not substitute charges or market rent for base rent; a filtered/subset report is incomplete and must not silently replace the full roll.
- Codex uses separate branches and pull requests; the owner controls merging. This is the owner's later instruction for this chat, not a rewrite of Claude's working mode below.
- The first implementation accepts completed prior-year periods only; current-year fiscal periods remain held until their dates can be confirmed explicitly. This is a conservative implementation limit, not a claim that every annual PDF is supported.
- The PDF statement slice keeps the existing v2 annual statement and source fields. Current and archived pre-reader backup readers preserve it. No existing saved result changes; the 646-figure comparison remains unchanged.

## Working mode and licences

| Date | Decision | Source |
|---|---|---|
| 2026-11-10 | Commit directly to `main` after checks; no PRs; no pausing at approval gates; log figure/format changes here with a before/after table | `PROJECT_CONTRACT.md` |
| 2026-11-10 | Claude may merge its own PRs when every check is green and there is no conflict (superseded the same day by direct commits) | `docs/NOW.md` rule 2 |
| 2026-11-10 | Permissive code adopted freely; copyleft only as separate unshipped tools; no-licence code is ideas only | `PROJECT_CONTRACT.md` |
| 2026-11-10 | Model Hub moved to the separate repository `model-hub` | `docs/owner-requests.md` |
| 2026-10-28 | On a usage limit stop everything, agents included, until the owner says continue | `docs/NOW.md` |
| 2026-10-17 | Standing rules 1-6 (queue order, stop only for decisions, short reports, defer F11/Phases 7-8) | `docs/NOW.md` |
| 2026-10-15 | No new libraries without approval; encoding warning stays off saved deals | `docs/NOW.md` |

## Embed the Codex tool as is (`docs/proposals/uw-embed-as-is.md`, approved 2026-11-10, 10 answers)

| Q | Decision |
|---|---|
| Q1 | Owner authored the package; it runs inside Zlatura; stays private, never committed |
| Q2 | Package allow-list: only approved hashes load; each Codex release is a tiny hash PR |
| Q3 | Filler figures labelled and cross-checked; only inputs are saved to the deal; the firm workbook holds the filler's own figures with a note |
| Q4 | AI inside the filler off (CSP-blocked); its manual and paste paths stay |
| Q5 | OCR: off in P1 (use Start-from-documents OCR), vendored Tesseract shim in P2 if its test passes |
| Q6 | Keep SheetJS 0.18.5 contained by the CSP; ask Codex to move to 0.20.2+ |
| Q7 | Template T1 (embedded workbook) now; T2 when the template changes |
| Q8 | No separate origin or domain now; revisit before accounts |
| Q9 | Leave the parked UW-3 stash; drop it after P5 |
| Q10 | Filler shows its own layout at phone width; no reflow; "same" check covers iPhone width |

## New look (`docs/proposals/ui-filler-design-language.md`, approved 2026-11-10, 8 answers)

1. Palette: warm off-white, plum, sage, apricot, rose in the New look; Classic unchanged.
2. Type: IBM Plex Sans/Mono vendored (OFL, about 60 KB) in the New look; Public Sans stays for Classic.
3. Glass on floating controls only, 92% opacity, solid fallback and a *Solid controls* switch.
4. Set the filler's own appearance to match Zlatura's theme before the frame loads (in P3, reversible).
5. Mascot only inside the filler (option A).
6. *Hide figures while sharing*: app-wide, device-only, display only (PR 9).
7. Appearance preferences in `localStorage` only, not in backups or the deal format.
8. New look stays opt-in until PRs 1-11 merge and the owner hand-tests, then the default switches.

## Bridge field map (`docs/proposals/uw-bridge-fieldmap.md`, approved 2026-11-10, 5 answers)

1. Confidential deals are bridged (nothing leaves the device under the frame CSP); refuse automatically if that changes.
2. P3 sends files and section-3 facts only; typed rent rolls are not sent (gap listed in the matrix).
3. Erase package keeps per-deal projects; a project follows the deal's trash.
4. One filler window at a time; deal switching blocked while full screen.
5. "Fill in filler" on an existing project replaces a value only where the broker ticks it.

## All-in-one research (`docs/proposals/all-in-one-research.md`, approved 2026-11-10, 5 answers)

1. Free only until items 1-17 are done; then one paid item at a time with a stated monthly cost.
2. Browser calls to a fixed list of free open-data hosts: yes (item 7, after a CORS test, with a CSP test).
3. First file profiles: Salesforce-style CSV and the licensed data service's own export (from `private/`).
4. Microsoft app registration first; Google only if a calendar link is wanted.
5. Professional-first; consumer calculators inside workspaces with a "not advice" line and a fair-housing review.

## UW money notes (`docs/proposals/uw-money-notes.md`, 9 questions, all "Yes" defaults)

Units asked not guessed (UW-2 built); evidence order and "ask when two remain"; usable/gross area kept out of
`sf` until P5; dashes are "not stated" in rent rolls and 0 in a T-12 line with other figures; unit answers live in
existing fields; import Replace keeps hand-edited leases; screen shows whole dollars, XLSX holds cents; per-lease
recoveries recorded additively in UW-5; analysis years only; engine fix for F9 is its own gated change. Status in
the header is still "proposed": treat the defaults as taken under the 2026-11-10 mode.

## From the owner tracker (`docs/owner-requests.md`)

| Date | Decision |
|---|---|
| 2026-11-10 | Live access to listing and people-data sites is not possible free or within terms; route is the user's own exports plus open public data |
| 2026-11-10 | Uploaded documents must improve the readers every time (round 1 done) |
| 2026-11-09 | Use the Codex tool as is, UI untouched (supersedes UW-3 to UW-11 rebuilds) |
| 2026-11-07 | Rename to Monal paused; Muse has no API; free Gemini CLI refused by Google |
| (standing) | Golden outputs identical; do not dismiss CodeQL alerts; clean room; owner's email never stored |
| (open) | `private/` as default home for documents: owner to confirm |

## Monal: built-in tool, rename, customisable workflow (owner 2026-11-11, blanket approval, no approval stops)

Design note: `docs/proposals/monal-builtin-and-rename.md`.

| # | Decision | Effect on earlier decisions |
|---|---|---|
| 1 | The underwriting tool is **built into the app**: no zip to load; it opens as a section like any other | Supersedes embed Q1 "never committed" and Q7 (T1): a **sanitised copy** made by a repeatable script ships in the repo; the package as delivered still never is. `PROJECT_CONTRACT.md` invariant 6 reads, from now on, "the private package *as delivered*" |
| 2 | The product is renamed **Monal** (the tool's Himalayan-bird mascot): the complete redesign and renaming | Supersedes the 2026-11-07 "rename to Monal paused". Order: display name, then storage ids with a tested migration, then the address (owner action) |
| 3 | UI: each section (Brokerage, Investing, Lending, Development and the rest) previews on hover in a bubble; the interface responds to the cursor; the user chooses the accent colour; the workflow screen is fully customisable | Accent, hover preview and cursor response on Home are already being built; the customisable Home extends ui-revamp-addendum 4.1 (My workspace) |
| 4 | Document-reading accuracy and the underwriting tool keep being improved | Reader slices (section 3 of the backlog) continue between the Monal slices |
| 5 | Decided in the note under the blanket approval: firm template **not** shipped; the tool's own workbook export is the built-in template, plus *Use my own template* kept on the device; the firm's template pack (workbook, layout, firm-only fill code) stays private and loads on the owner's device only | Reversible: a later generic invented template can be added |
| 6 | Decided in the note: keep the site address (`/zlatura/`) for now; a move is an owner action with a redirect page | Hosting change deferred, not taken |

## Underwriting tool maintained here (owner 2026-11-12)

| Date | What | Why | How to reverse |
|---|---|---|---|
| 2026-11-12 | `app/uwtool/` is the maintained source; `tools/uwtool-import.mjs` and its json are retired (kept for history); no test requires the folder to equal importer output. The deny-list and base64 guard, the strict content policy checks and a new outside-call scan (`tests/uwtool-outside-calls.test.js`, with a planted-call mutation check) stay | The owner licensed the tool; the importer already needed 60 exact-match edits and every screen improvement would add more (`docs/proposals/one-underwriting-space.md` section A) | Re-run `tools/uwtool-import.mjs` on the private package (it refuses a non-import output folder, so clear `app/uwtool/` first), restore the manifest test from git history, and discard hand edits |

Owner approvals recorded the same day (2026-11-12, session chat, "approve all recommendations"; passed on by the coordinator), for `docs/proposals/one-underwriting-space.md` section G:

| # | Decision |
|---|---|
| 1 | When the tool and the engine disagree, the deal keeps the engine's figure; the tool's figure is shown beside it with a flag. The tool keeps its own calculator for now, so saved results do not change |
| 2 | The current tool project and saved quick underwritings become unfiled projects; nothing is deleted |
| 3 | Confidential deals keep their tool projects on the device and in backups, marked confidential, never sent to AI |
| 4 | Maintain the cleaned copy and stop regenerating (decided by the lead as reversible; owner informed) |

Releases 4 (one reader and adapter) and 5 (per-deal projects and migration) are marked "approved by owner 2026-11-12" in the proposal's build order.

## 2026-11-12: the on-device assistant (`docs/proposals/on-device-assistant.md`)

The owner approved every recommendation in the session chat ("approve all recommended"):

| # | Decision |
|---|---|
| 1 | Start with the "front desk" over the app's own data and engine, with no language model (released as 4.7.143) |
| 2 | Monal the bird is the one assistant everywhere: the Underwrite tool's own "Monal's nest" tips are folded into it (assistant release 3); every nest tip stays reachable |
| 3 | The optional ~0.4 GB per-device model download is decided after assistant release 3, once release 1's gaps are known; nothing is downloaded until then |

Releases 4 (Chrome built-in model) and 5 (WebLLM download, a new library) still need the owner's yes when they come up.

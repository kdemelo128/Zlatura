# Now

**Session start:** check that `/model` is Sonnet and `/effort` is medium
(a choice made in the app or with `/model` beats the project settings);
tell the owner if not. **An item marked "PR open" below may already be
merged:** this file is written before the merge, so check GitHub first.

Read this first in every session; update it on every PR. Everything else
(`docs/PLAN_STATUS.md`, the master plan, the acceptance matrix) is read by
section with grep, never in full.

- **Version:** 4.7.77 (development branch; GitHub Pages deploys from main).
- **Version:** 4.7.82 (development branch; GitHub Pages deploys from main).
- **Version:** 4.7.85 (development branch; GitHub Pages deploys from main).
- **Merged:**
  - bugs C, A and B (4.7.3–4.7.5);
  - both Part 2 proposals (#21, #22);
  - browser flows fail the run on a failed check (#23, #24, 4.7.6);
  - the lost-edit fix (#25, 4.7.7);
  - the efficiency setup (#26, 4.7.8);
  - project settings, Sonnet at medium effort and unused plugins off (#27,
    4.7.9);
  - the partial-year T-12 fix (#28, 4.7.10);
  - the CI browser subset, branch rules and `sync-main` (#29, 4.7.11);
  - reuse before you build, `THIRD_PARTY.md` and three proposals (#30,
    4.7.12), approved by the owner 2026-10-15;
  - changelog fragments, and the approved build order (#31, 4.7.13);
  - F1, one money rounding rule (#32, 4.7.14);
  - F2, old CSVs (#33, 4.7.15): one reader for every text file
    (`app/textfile.js`): a byte-order mark decides, valid UTF-8 as before,
    else Windows-1252 with a note; ambiguous files show both readings.
  - the docs PR (#34, 4.7.16): routing, check rule, usage rules;
  - F5, CI audit and pinned actions (#35, 4.7.17); Dependabot for actions is on;
  - the rent roll proposal (#40, 4.7.18), approved by the owner 2026-10-17
    (`docs/proposals/rentroll-pdf-and-om-fill.md`, answers in section g);
  - 1a, an OM rent roll in thousands or millions (#41, 4.7.19); Dependabot
    #36-#39 (cache, setup-node, setup-python, checkout) merged;
  - the `check:quick` gate fix (#42, 4.7.20): quick always runs
    `tests/repo.test.js` (a new app file missing from `sw.js` failed CI three
    times in 1a).
  - 1b + 1c (#43, 4.7.21): the OM's stated rent reaches the rent roll
    cross-check only; Building SF and Units offered as a "Use" tap (Occupancy
    not offered: the deal already shows the roll's, labelled); a two-line
    header is read.
  - `impact-flow` axe flake (#44, 4.7.22): flow-only fix;
  - the rent roll PDF upload (#45, 4.7.23): *Import from PDF…* with preview,
    Data QC, layout guard, Undo; source kind `pdf` and file name per lease
    (schema 4, silent migration step `rr-pdf-source`).
- **Merged:** the property-manager profile (4.7.24, #46): "Monthly Charges"/fees are a recovery column, never rent; two
  rent columns that disagree are one failed check; Past Due/Balance noted,
  not failed; a "4 Units" subtotal; a lease-to year split onto the next line.
  Reader-only, no data-format change, golden identical.
  - **Owes the owner:** whether an accepted failed check on a PDF import is
    kept as a record (a new stored field; today it is in the history label only).
  - **Known flake:** `rename-flow` "Settings says the data moved and the old
    copy is kept" failed once in `check:full` and passed on re-run alone.
  - Next: the roll comparison. **Waiting for the owner's OM** (the attachment
    did not reach the container): put it in `private/om/`, run
    `node tests/tools/rr-local.mjs` on it, report counts only.
- **Standing rules (owner, 2026-10-17):**
  1. After opening a PR go straight to the next queue item on a fresh branch
     from the latest main (or the previous branch if it depends on it); at most
     two PRs open at once; don't wait for a merge unless the next item depends
     on it.
  2. Stop and ask only for: a decision not yet made, a data-format change, a
     figure that would change, a check that can't be fixed, or the end of the
     queue. Never merge; the owner merges or turns on auto-merge.
  3. `check:full` runs in the background (in a separate worktree if the next
     item is started meanwhile), only for PRs that touch `app/` or `tests/`;
     docs or CI-config-only PRs run `check:quick` and rely on GitHub CI.
  4. Short reports: one block per PR: link, CI status, what changed in 2-3
     lines, the phone check (or "none"), any decision owed; each says "merge
     now" or "needs your decision".
  5. Group small related fixes into one PR when the risk is low.
  6. Defer F11, F12 and Phases 7 and 8 until the OM, rent roll, T-12 and
     projections flow works on real deals; don't start them unless asked.
- **Queue (in order):** (a) the `check:quick` gate fix [merged, #42]; (b) 1b + 1c
  [PR #43]; (c) `impact-flow`, the intermittent axe contrast failure, so
  `check:full` is reliable [PR open: the flow waited for no animation]; (d) the rent roll PDF upload [merged, #45]; (e) the
  property-manager profile [PR opening]; (f) the roll comparison; (g) the underwriting
  proposal from the support code; (h) after the Oct 21 usage reset: T-12
  multi-format import, OM red flags, pro forma vs T-12 bridge. Then F6/F7, F10,
  F3, F4, F8, F9 and the rest in `docs/PLAN_STATUS.md`, "Now".
- **Approved decisions (owner):**
  - no new libraries for now (any library is an approval gate);
  - the encoding warning stays off saved deals (no data-format change);
  - all 22 T-12 multi-format decisions are approved (item 2a in
    `docs/PLAN_STATUS.md`; design in `docs/proposals/t12-multiformat.md`);
  - the four competitive-gap additions are approved
    (`docs/proposals/competitive-gap.md`): the deal fee record (5.1) and the
    fee CSV for accounting, before Phase 3; listing copy for marketplaces
    (13.1); and "Export everything" (item 10 above; schema and retention
    decision first);
  - usage rules and model routing are in `CLAUDE.md`; `/clear` after each
    merged PR;
  - owner decisions A1-A8 (2026-10-23, all as recommended):
    A1 "Export everything" publishes a versioned JSON Schema of the data
    format (versioned with `migrate.js`), and the zip holds only originals
    already on the device; A2 an accepted failed check on a PDF import is
    kept on the import's history entry (one silent migration step); A3 the
    broker's actions on 6.3 red-flag findings, "dismiss with reason"
    included, are stored per deal as `deal.findings`, keyed by rule id;
    A4 golden rows that are only added can be approved from a before/after
    table, and any changed figure still stops the PR; A5 the F8 trash does
    not travel with backups; A6 the confidential tag (19.2) is one boolean
    per deal that blocks every AI call for it and marks its exports, built
    after B1c; A7 the UI revamp foundation starts after the bridge, the Back
    button and the fee, trash and password group; A8 Bid Leveler's stored
    offer shape goes through a short designer note, built after the fee
    record.
- **Open validation:** F2 has only been tested on invented files. Real old
  CSVs still need running through `node tests/tools/rr-local.mjs` and
  `node tests/tools/t12-local.mjs` (files in `private/`; report counts only).
- **Known quirk:** `enabledPlugins` in `.claude/settings.json` doesn't
  reach plugins and connectors synced from claude.ai; the owner turns those
  off in their account settings.
- **Open decisions for the owner:** the questions
  at the end of `docs/PLAN_STATUS.md`; for F9 (backup password, design note
  ready): a version 3 wrapper used only for password backups, which older
  apps refuse as "made by a newer version" (recommended: yes), and PBKDF2 at
  600,000 iterations from Web Crypto rather than Argon2id, which needs a
  library (recommended: PBKDF2; the count is stored per file).
- **Owner decisions 2026-10-28 ("approve all recommended"):** UW Template
  Filler reuse (the firm template is never built in: it stays a file the
  broker loads; R3 a SHA-256 fingerprint per imported source; R4 a T-12 table
  kind for template records; "Start from documents" makes a deal); the
  confidential tag D1 (no schema bump: an older app restoring a newer backup
  ignores the flag, listed as a known gap); F9 as recommended (above).
- **Queued (owner, 2026-10-28, "down the line"):** the Universal Repository
  Security Hardening prompt v3: first a docs-only triage of its 250 items
  (`docs/proposals/security-robustness-triage.md`), then fixes, at most two
  security PRs open at once.
- **Conformance fixes (4.7.66, merged #94):** the rent schedule uses only a typed price; commission tiers that do not rise give no figure.
- **OM red flags (4.7.67, merged #95):** the checks ask about a missing or low management fee, payroll, free rent and unstated occupancy; questions only, no figure changes.
- **Tenant credit record (4.7.68, merged #96):** schema 6, a credit card per deal (ratings, guarantor, go-dark, store sales); checks only, no calculation changes; ratings and store sales never leave the device in exports.
- **Conformance docs drift (4.7.69, merged #97):** matrix rows and PLAN_STATUS ticks brought up to date, a test that every browser flow is listed in `run.sh`, `CSS.escape` in `researchui.js`, and the new PLAN_STATUS section "Owner additions and changes to the plan".
- **Documents hub D1 (4.7.70, PR opening):** Tools → Documents → PDF pages: merge, split, reorder, rotate, extract; on the device, nothing stored; `@cantoo/pdf-lib` 2.11.1 vendored with licence and checksum. Next: D2 conversions, D3 due-diligence registry.
- **Confidential tag (4.7.71, merged #100):** one boolean per deal that blocks every AI call for it and marks its exports; the file name and printed pages say CONFIDENTIAL.
- **Code scanning alert 12, second fix (4.7.72, merged #102):** reproduced with CodeQL 2.27.3 run locally; the download link is set in one step; 1 result before, 0 after locally. The alert stays open until GitHub's next scan says otherwise.
- **Underwrite tab, W1 (4.7.73, merged #103):** a dedicated Underwrite tab: a quick underwriting that needs no saved deal (kept on the device, carried by backups), then "make it a deal".
- **Confidential tag (4.7.71, PR opening):** one boolean per deal that blocks every AI call for it and marks its exports; the file name and printed pages say CONFIDENTIAL.
- **Cash flow A1 (4.7.74, merged #104):** recoveries, percentage rent and the sale at exit each live in one function in `app/engine/`; no figure changes (the Percentage rent tool can differ in the last digit only). Clean-room rule added to `docs/working-rules.md`. Next: A1b (the three approved edge-case fixes), A2 read-only cash-flow view.
- **UI revamp D1 (4.7.75, PR opening):** Settings > Look: Classic or New look. New look = slate neutrals + brass accent, Source Serif 4 and Public Sans, solid bars, contrast-tested tokens; Classic unchanged. The look choice is stored on the device (localStorage `zlatura.look`), not in backups. Next: D2 icons and the rename-ready brand mark.
- **Cash flow A1 (4.7.74, PR opening):** recoveries, percentage rent and the sale at exit each live in one function in `app/engine/`; no figure changes (the Percentage rent tool can differ in the last digit only). Clean-room rule added to `docs/working-rules.md`. Next: A1b (the three approved edge-case fixes), A2 read-only cash-flow view.
- **Excel zip-bomb guard (4.7.76, PR opening):** a workbook's real unpacked size is checked as it unpacks (not only the size it declares); applies to the rent roll, T-12, templates and the sheet reader; zip64 workbooks still open. Security fix with its own tests.
- **Cash flow A1b (4.7.77, PR opening):** the three approved edge-case fixes: an unknown or blank recovery share/base is flagged "can't tell" and left out (NOI understated until fixed), negative sale costs are refused, percentage rent with a zero or blank base rent uses the typed breakpoint. Next: A2, the read-only cash-flow view.
- **Dependency scan exception (4.7.82, PR opening):** a new advisory on a dev-only transitive package (minimatch via exceljs) turned the dependency check red everywhere; a time-boxed ignore (expires 2026-12-29) with reason and a test that keeps exceptions honest. Owner decision pending: allow the BlueOak-1.0.0 licence so minimatch 11 can be adopted instead.
- Rent roll column presets read the property type more carefully (Multi-tenant office is no longer multifamily)
- **Usage limit (owner, 2026-10-28):** when the session's usage runs out,
  stop everything, background agents included, and resume nothing until the
  owner says to continue.
- **Owner's standing instructions (2026-10-15):** no PR watching or
  polling; `check:quick` before every push, `check:full` before opening
  each PR; tell the owner which PR to merge, with a phone checklist if
  anything is visible;
  the branch rules in `docs/working-rules.md` ("Branches and PRs").
- **Roll comparison (4.7.25, PR opening):** the PDF preview lists how the PDF differs from the current rent roll before Replace/Add (`compareRolls`, `app/reconcile.js`). The property-manager profile (#46) is merged.
- **Standing rule added (4.7.27, PR opening):** the owner's support code is checked on every rent roll, T-12, NOI, WALT, Review Queue and Data QC PR (`docs/working-rules.md`).
- **Underwriting (#48, 4.7.26, merged): all 10 decisions approved by the owner 2026-10-17** (`docs/proposals/underwriting.md` section 7). **U8 is deferred, not built until asked.** Spike thresholds and the rent per SF band are settings and warnings only (never block, never change a number). Normalised NOI always sits next to the reported figure and never replaces it. The strict review setting is off by default. **Order:** T-12 PRs 1 and 3 first (new gap definition and N in PR 3), then U1-U7; **U1 not until both T-12 PRs are merged; nothing starts before the Oct 21 reset.**
- **Dev-tools evaluation (#50, merged; all of section 9 approved by the owner 2026-10-21, see its section 10):** `docs/proposals/dev-tools-and-reuse.md`; nothing installed. Order: T-12 PR 1 (4.7.29, #53, merged) and PR 1b (4.7.30, the paste box, #54, merged), settings + security checklist (4.7.28, #51 merged), F1 to F3 fixes (4.7.31, #55, merged; F4 and I5 still to do), git guardrail hook (4.7.32, #56, merged), A3 text items (4.7.33, #57, merged); T-12 PR 2, suggestions not choices (4.7.34, #58, merged); T-12 PR 3a (4.7.35, #59, merged); T-12 PR 3b (4.7.36, #60, merged); underwriting U1 (4.7.37, #61, merged); U2 (4.7.38, #62, merged); U3 (4.7.39, #63, merged); U4 (4.7.40, #64, merged); U5 (4.7.41, #65, merged; Option B: blank rent stays vacant); U6 (4.7.42, #66, merged); ponytail skill (4.7.43, #67, merged); Pillow audit and fixture pin check (4.7.45, #68, merged); CodeQL alerts 1-7 fixed (4.7.46, #70, merged; Pillow Dependabot alerts stale: 13.0.0 is the fix); F12, AI server limits: a token per device, spending limits in whole cents, the prompt-injection rule (4.7.47, #72, merged; figures are placeholders and the prices UNVERIFIED until the owner names them; budgets reset on restart); tool ideas: settings risk scan, run.sh lock, step-then-check rule, GitHub tools scan (4.7.48, #73, merged); CI security scanners: actionlint, zizmor, gitleaks, osv-scanner (4.7.49, #74, merged; all green on its first CI run); fast-check property tests, test-only, v4.10.2 (4.7.50, #75, merged; no bug found); the AI server injection set doubled to 25 documents across 11 categories (4.7.51, #76, merged); the -$0 display fix: a figure that rounds to zero shows no sign (4.7.52, #77, merged; the one-off sites in glance, aifacts, t12ui, t12, omstatement and figures are the next small PR); owner 2026-10-22 approved integrating every safe tool: Phase B1a, the research route POST /api/research (4.7.53, #78, merged); check:full now runs the AI server tests, and check:quick when server/ changed (4.7.54, #79, merged); Phase B1b, research briefs on the device: one kv key research.briefs, 365-day retention, carried by backups, claims confirmed only when the quote verifies, the document states it and the broker ticks it (4.7.55, #80, merged); U7, recoveries counted twice inside the rent roll: a warning, no number changed (4.7.56, #81, merged); browser runs claim one of eight port slots so parallel worktrees run at once (4.7.57, #82, merged); Phase B1c, the research screens: start, read, tick verified claims, unticked claims in Review (4.7.58, #83, merged); L5, text in a site photo read on the device, applied only on a tap with Undo (4.7.59, #84, merged); F6/F7, hostile text and time zones: dates no longer move with the device zone (4.7.60, #85, merged); the deal fee record and Fees CSV, data format 5 (4.7.61, #86, merged); the Back button: Back steps through screens and sheets (4.7.62, #88, merged); key dates to the phone calendar as an .ics file (4.7.63, #89, merged); the net lease rent schedule with rent ÷ price per period (4.7.64, #91, merged); file names handed to the share sheet and the download link are cleaned first, code scanning alert 12 (4.7.65, PR opening); startable now, in parallel builders (designer list 2026-10-22): T-12 to pro forma bridge 7.9, OM red flags 6.3.5/6.3.7/6.3.8, football field 7.3, Back button F3, deal fee record 5.1, listing copy 13.1, F6/F7, F8, F9, F4; owner questions B1-B8 asked; next U7 (built and reviewed), then B1c (built, designer review), then Phase B1, then the in-house injection set; then Phase B1 of the relationship-intelligence proposal (#69, #71), then U7 (recoveries counted twice: designer note first) (U8 deferred), T1 to T3 tests after, then tests T1 (ponytail text), T2 (context-mode, isolated), T3. Sandbox not enabled: bwrap/socat missing here. Owner to run `/usage`, `/doctor prompt-audit`, `/config` idle compaction.
- **State note** (write here before any long task, so a fresh session can
  resume): none.

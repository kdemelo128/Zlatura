# Backlog: one ordered list of vertical slices

Status words: done / building / next / later. Update in the same commit as
the work. Each slice is small, reversible, tested (fails on old code), and
leaves golden outputs identical unless logged in `DECISIONS.md`.

## 0. Monal: the tool built in, the rename, a Home you arrange (owner 2026-11-11; `docs/proposals/monal-builtin-and-rename.md` s7)

| Id | The user gets | Status | Source |
|---|---|---|---|
| M1 | Deny-list and blob guard: the repo fails a check if firm content or a large base64 block appears | next | monal-builtin s7 PR 1 |
| M2 | Sanitiser script and its edit manifest (private rules stay in `private/`) | next | PR 2 |
| M3 | The tool built in at `app/uwtool/`: *Open underwriting* with no zip; firm template pack optional on the owner's device | next | PR 3 |
| M4 | *Use my own template* kept on the device; blank defaults shown as "not entered" | next | PR 4 |
| M5 | The tool's libraries: Tesseract from `vendor/ocr/`, SheetJS upgrade behind the same-check | next | PR 5 |
| M6 | Display name Monal (brand.js, manifest, titles, exports, docs) | next | PR 6 |
| M7 | Storage ids `monal.*`, IndexedDB `monal`, backup ids, caches: second-hop migration, old copy kept | next | PR 7 |
| M8 | Home you arrange: choose, order, resize, hide; layouts per role; reset | next | PR 8, after L2 |
| M9 | Site address move (owner action; redirect page) | later | PR 9 |

## 1. Embed the Codex tool as is (`docs/proposals/uw-embed-as-is.md` s9)

| Id | The user gets | Status | Source |
|---|---|---|---|
| E-P1 | The tool opens unchanged inside the Underwrite tab from the private package (branch `claude/uw-embed-p1`) | done (4.7.125) | uw-embed-as-is |
| E-P2 | Patches E1, E4, E5 (and E2/E3/E6 per Q4/Q5): fonts, OCR shim | folded into M2/M5 (the sanitiser applies them) | uw-embed-as-is |
| E-P3 | Bridge in: documents and facts flow into the tool; per-deal project swap; theme match | next, after M3 (targets `app/uwtool/`) | uw-bridge-fieldmap |
| E-P4 | Cross-check strip: tool's figures labelled and compared with Zlatura's engine (M1-M7) | later | uw-embed-as-is |
| E-P5 | Bring the tool's inputs into the deal (data-format step: source kind `filler`; log in DECISIONS) | later | uw-embed-as-is, uw-bridge-fieldmap |
| E-P6 | Optional: tool projects carried in backups | later | uw-embed-as-is |

## 2. New look (`docs/proposals/ui-filler-design-language.md` s4)

| Id | The user gets | Status | Source |
|---|---|---|---|
| L1 | Tokens and base components, Plex fonts | done (4.7.126) | ui-filler-design-language |
| L2 | Home and pipeline | next | same, PR 2 |
| L3 | Deal and the Underwrite shell (F11 split as touched) | later | PR 3 |
| L4 | Documents hub and readers | later | PR 4 |
| L5 | Rent roll and T-12 import | later | PR 5 |
| L6 | Comps | later | PR 6 |
| L7 | Templates and exports | later | PR 7 |
| L8 | CRM | later | PR 8 |
| L9 | Settings, backup, Connections; Hide figures while sharing | later | PR 9 |
| L10 | Field and AI | later | PR 10 |
| L11 | Close-out: copy pass, screenshots, phone checklist; owner then switches the default | later | PR 11 |

## 3. Reader fixes (`docs/proposals/document-learning-round-1.md`)

| Id | The user gets | Status | Source |
|---|---|---|---|
| R1 | Scoreboard reason codes (`--reasons`) | done (4.7.122) | round-1 PR 1 |
| R2 | An unreadable date cell is blank with a note; the workbook is still read | done (4.7.123) | round-1 PR 2 |
| R3 | Macro workbooks refused with the true reason ("has macros"), never run | done (4.7.127) | round-1 PR 3 |
| R4 | OCR offer on the Underwrite card; "no text layer" wording | next | round-1 PR 4 |
| R5 | Zip files opened in memory (44 of the owner's refused files) | next | doc-local reasons |
| R6 | When both readers accept, offer both | done (4.7.127) | doc-local reasons |
| R7 | PDF operating statements into the T-12 reader (money meaning logged) | later | round-1 PR 5 |
| R8 | Property-manager rent roll PDF profile; subset-only report is a failed check | later | round-1 PR 6 |
| R9 | A type for underwriting outputs, identified and never read as inputs (data format) | later | round-1 PR 7 |

## 4. Owner asks of 2026-11-10 (each needs a short design note first)

| Id | The user gets | Status | Source |
|---|---|---|---|
| N1 | Portfolio roll-up: several deals into one executive summary with combined financials, cash flows, total SF and chosen images | needs a short design note | argus-class-cashflow A9/A10 |
| N2 | Report and memorandum builder from saved files | needs a short design note | argus-class-cashflow A10 |
| N3 | Universal CSV/Excel/PDF export importer: the user's own exports from listing and people-data services become linked property, owner and contact records (vendor-neutral) | needs a short design note | comp-enrichment C2/C5, platform-expansion X1 |
| N4 | Built-in assistant answering from the deal's own data with no outside AI; plus bring-your-own-AI keys (Claude, ChatGPT, Gemini), tool permissions enforced outside model text, prompt-injection defences | needs a short design note | continuous-ai-relationship-intelligence, security-robustness-triage |
| N5 | Click-to-call and call logging for the phone systems brokers use | needs a short design note | platform-expansion X4 |
| N6 | Role-based guided walkthroughs | needs a short design note | ui-revamp D5/D6 |
| N7 | Phone field mode parity (everything the desktop does that a field broker needs) | needs a short design note | role-workspaces, ui-filler-design-language PR 10 |

## 5. The rest (cite ids; do not copy tables)

| Group | Where the ids live |
|---|---|
| Cash flow A2-A8 | `argus-class-cashflow.md` |
| Comps C2-C6, vendor profiles | `comp-enrichment-and-sources.md` |
| Lease L2, L4-L7; documents D4-D6 | `lease-abstract.md`, `documents-hub.md` |
| Workspaces (Lending, Investing, Occupier, Development) | `role-workspaces.md` |
| Security S2, S5-S8; F4, F8, F9 | `security-robustness-triage.md`, `production-readiness.md` |
| Roadmap items 1-20 of the all-in-one plan | `all-in-one-research.md` s4 |
| Phases 1-8 and pillars | `docs/PLAN_STATUS.md`, master plan Part 22 (read-only) |
| UW evolve P3-P12, T1-T4 | `underwriting-evolve.md` |
| Seed-repo dev skills (security audit first) | `.evolve/RESEARCH.md` |

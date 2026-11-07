# Owner requests and decisions: the tracker

Everything the owner has asked for or decided, with where it stands. Updated with every PR
(the `release` step). Status words: **done** (merged), **open PR**, **in progress**, **waiting on
owner**, **not started**. Last updated: 4.7.109.

## Standing directions (always in force)
| Direction | Status |
|---|---|
| One PR per item; the owner merges; I never merge | kept |
| Approval gates: saved-deal results, data format, hosting, money meaning, security, cost | kept; flagged in each PR |
| "Approve all recommendations" given repeatedly | applied to recommended defaults; data-format and meaning items are still flagged |
| Golden outputs identical (646 figures, 618 saved results) | kept; every PR reports "0 changed" |
| Money in whole cents, one engine, no second copy of the maths | kept |
| New tests must fail on old code; full check one at a time on a quiet machine | kept |
| Do not dismiss CodeQL alerts; fix the code | kept |
| Clean room: no vendor formats, files or trademarks | kept |
| When usage runs out, stop everything and wait for the owner | kept |
| Show the Model Board link after each response; remind about the Codex zip | kept |
| Use ponytail and the other skills; run agents in parallel where it helps | kept (designer review, parallel builders) |
| Owner's Google sign-in email is never stored in the repo or sent anywhere; the harness refuses it | kept (tested) |
| Real files stay in git-ignored `private/` by default (owner says the documents are not confidential) | **waiting on owner to confirm** `private/` as default, or name files that may be committed |

## Product and plan items
| Request | Status |
|---|---|
| Load error on the Mac ("didn't finish loading"; ad blocker) | done: #122 (renamed file, error panel, reset button) |
| Pages build failure investigation | done |
| Safari before 16.4 regex bugs; quadratic regex | done: #129 |
| Security prompt v3 (250-item triage) | done: triage doc; S1 hygiene #123, S4 DOM sinks #124, S3 reader caps #127 |
| Security: S5 backup shape check, S6 to S8, S2 CSP | not started (S5 needs the owner's decision D4) |
| Lease abstract L1, L2, L3 (read a lease PDF) | done: #117, #132 (schema 9 flagged for the owner) |
| Role workspaces (brokers, lenders, developers, investors, occupiers, asset managers, capital raising, leases, underwriting) | WS0 done: #130; Lending, Investing, Occupier, Development workspaces not started |
| Comps: render cap | done; recovery-copy write fix needs the owner's approval and a designer note |
| Comp importer C2; online zoning and flood lookups C3/C4 | not started |
| Start from documents (P2), Reconcile view (P3), template safety fixes, cash-flow A2 to A10, UI D3 to D7 | not started |
| Advanced underwriting tool built on the owner's Codex tool and its better UI | **waiting on owner: upload the Codex zip** (next big item after the hub) |
| Rename proposal (Monal) | not started |

## Multi-model workflow
| Request | Status |
|---|---|
| Use every model (Claude, GPT/Codex, Gemini, Grok, Kimi, Muse) by role, for this and future projects | done: #131, #133 (ten roles, connectors, any project) |
| Setup guide; walk-through on the owner's Mac | done: #134; owner installed Node, repo, Codex |
| Tested on the owner's Mac: Codex works; free Gemini CLI refused by Google | done: #135 |
| Model Board page, shown after each response | done (private page, republished each time) |
| One dashboard, no tabs, run models and agents from one place | open PR: #136 (chat, role routing, OpenRouter, auto-open, Agents tab; security-review fixes done) |
| Fix a model draft escaping its task scope (security review, high) | open PR: #138 (merge before #136) |
| Free only for now | kept: only Codex (your plan), Claude Code if installed, and free keys are active |
| Muse (Meta AI) | no official API known; unavailable in the hub |
| Sign in on the owner's behalf / drive the chat websites | not built: it cannot be done safely from here; offered as a separate proposal if the owner wants it |
| Box downloader for due-diligence, analysis and recent-year-sale folders, only if it works well, from the hub | not started; its own PR after #136 merges; cannot be tested against the owner's Box from here |
| Documents the owner uploads must be used directly for improvement each time | proposal and routine in #137 |
| Training/data plan: schema design, labelled pairs; no large-model fine-tune for parsing | proposal in #137 |

## Owner-side decisions still open (recommended defaults noted in each PR)
Custom domain; branch protection on main; tighter CSP `connect-src`; offline update behaviour;
backup shape check (S5); recovery-copy change; vendor comp profiles (need real exports in `private/`);
annual rate per SF definition (#117); comp importer choices (#119); JSON 512 MB and PDF 150 MB caps
(#127); schema 9 (#132); workspace wording and financial-meaning gates (covenants, CAM, SBA figures
UNVERIFIED); `private/` as the default home for uploaded documents.

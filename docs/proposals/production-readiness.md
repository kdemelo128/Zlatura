# Proposal: the owner's production-readiness checklist, placed in the plan

Proposal only (2026-10-15, 4.7.12): nothing is built and the build order doesn't change until the owner approves.

## 1. How to read this

The owner's checklist has about 150 items in 11 groups, plus a "People" list.
Many items were written for a hosted, multi-customer product. Zlatura today is
a local-first offline app: deals live in this browser's IndexedDB
(`app/store.js`), a service worker (`sw.js`) keeps it working offline, GitHub
Pages serves static files, and there are no accounts. The only backend is the
optional AI server in `server/`, which is not deployed. So each item gets a
**tier**. **A**: applies now, to the local-first app or the AI server.
**B**: applies once accounts, sync or hosting arrive (Phase 7, Part 19); it
must be designed in before that build starts (section 4). **C**: applies only
if Zlatura bills customers, takes payments or holds regulated data. **D**: does
not apply, with the reason and what would change that. The "today" column uses
Part 23's statuses: *Verified* (implemented and verified), *Not fully tested*,
*Synthetic only*, *Blocked*, *Partial* (partially implemented), *Not
implemented*. Evidence is a file, a test or "none". The verdict says: **done**;
**planned** (the master plan Part that already covers it); **add** (where in
the plan); **integrate** (an outside service, named only generically); or
**skip** (why). Close duplicates share one row.

## 2. The checklist, group by group

### Data and schema

| Item | Tier | Today | Verdict |
|---|---|---|---|
| Designed schema; survives "one small change" | A | Partial: `types/zlatura.d.ts`, `app/migrate.js`; Parties, Documents and Diligence not modelled (3.1) | planned: Part 3.1 |
| Migrations forward and back | A | Partial: forward only (`migrate.js`, `migrate.test.js` on real old backups); older code refuses newer deals (`backup.js`) | add: Phase 7, 19.1, "each migration has a tested way back" |
| Migrations that don't lock the table; indexes; connection pooling | B | n/a: IndexedDB on one device | add: Phase 7 backend design |
| Nightly backups; tested restore | A | Verified (restore): `backup-flow`, `backup.test.js`; backups are by hand, with a 30-day reminder (`home.js:93`) | done locally; remote: planned 19.1 |
| Point-in-time recovery | A/B | Partial: per-deal history and snapshots (`history.js`, `snapshot-flow`) | B: planned 19.1 (remote backup) |
| Soft deletes | A | Partial: removed photos and audio kept 30 days (`store.js:625`); a deleted deal is removed at once and comes back only from the toast's Undo (`store.js:660`, `dealui.js:2392`) | **fix now** (F8) |
| Validation on the server, not just the form | B | n/a: no data server; local validation (21.1) | planned: 19.2 |
| Timezones stored right | A | Not fully tested: dates are calendar days `YYYY-MM-DD` (`dateinput.js`), comps by UTC (`costar.js:339`); no test in another timezone | **fix now** (F7) |
| Apostrophes, emoji, accents, right-to-left text | A | Not fully tested: text is set as text, never HTML; no test uses such names; no `dir="auto"` | **fix now** (F6) |
| Money stored as integers | A | Partial: whole cents, but stored as dollar numbers rounded to 2 places, not integers (`engine/money.js:8`); two modules round their own way (`t12.js:110`, `omstatement.js:276`) | **fix now** (F1); integer storage is decision 2 |
| Currency, rounding, tax per country | D | US dollars only | skip: US brokers; revisit if a non-US firm signs |
| Idempotency keys; four submit clicks | A/B | Partial: AI buttons disabled while waiting (`aiui.js:289`); double-click on other creates not tested | A: add a double-click case to `typing-flow`; B: planned 19.2 |
| Pagination on page 400 | A | Not fully tested: 500-lease roll in 189 ms (`perf-flow`); lists load every record; no 1,000-deal test | add: Phase 8 perf (3.7), a 1,000-deal Home |
| Exports to a spreadsheet | A | Synthetic only: `exporters.js`, `deal-export`; LibreOffice recalc, not Excel | done; Excel: Blocked (real-world list) |
| Imports that survive a 2009 CSV | A | Partial: CSV read as UTF-8 only (`sheetread.js:45`, `rentrollui.js:839`), so Windows-1252 accents and curly quotes break; .xls refused with a next step | **fix now** (F2) |
| Retention rules; code that deletes them | A/B | Partial: 30-day trash purge (`store.js:628`); no written policy | planned: 19.2 (retention) |

### Accounts and access

| Item | Tier | Today | Verdict |
|---|---|---|---|
| Plus sign in emails; reset links that expire once; MFA with recovery | B | Not implemented: no accounts | planned: 19.1 (MFA); add the three as test cases |
| Session timeout; kill all sessions | B | Not implemented | planned: 19.2 (sessions); add "kill all" |
| SSO; SAML; SCIM offboarding | B | Not implemented | add: Phase 7 (19.1), integrate an identity service; SCIM only when a firm asks |
| Roles deeper than admin/everyone | B | Not implemented | planned: 19.1 (roles, deal-level access) |
| Object-level checks; tenant isolation | B | Not implemented (`deal-isolation` is screen state, not access) | planned: 19.2 |
| "Log in as this user" with audit | B | Not implemented | add: Phase 7, read-only, logged |
| Login rate limits; lockouts that spare the CFO | B | AI server only: one shared token, per-address limit (`server/index.mjs:74`) | planned: 19.2; add a delay that grows, not a hard lock |

### Security

| Item | Tier | Today | Verdict |
|---|---|---|---|
| Secrets out of code, repo and AI chats | A | Not fully tested: no keys found by pattern in tracked files or the 37 commits in this shallow clone; `.env` and `private/` ignored; backups leave out the AI token (`backup.js:28`) | done; full history scan is planned (Phase 8) |
| Rotate any key an AI pasted | A | n/a so far: no live key has been used (16.1.4 Blocked) | add rule: keys are set on the host, never pasted into a session |
| Packages exist and are the intended ones | A | Partial: pinned versions, `THIRD_PARTY.md` with checksums, lock files | done; scanning is F5 |
| Dependency scanning | A | Not implemented in CI (`.github/workflows/test.yml`); README says `npm audit` was clean once | **fix now** (F5) |
| Input sanitization; XSS; CSRF; OWASP list | A/B | Partial: text set as text; `innerHTML` only for fixed icons; CSV formula guard (`exporters.js:72`); pdf.js without eval (`pdftext.js:45`); no hostile-input test | A: F6 adds hostile names; B: planned 19.2 |
| File uploads limited and never executed | A | Partial: type and size checks, files kept as blobs; no content sniffing or archive-bomb guard | planned: Part 12.5 |
| CORS not "allow everything" | A | Verified: origin allowlist (`server/index.mjs:96`, server test 1) | done |
| Security headers | A | Partial: meta CSP has only `object-src`, `base-uri`, `form-action` (`index.html:9`); a meta tag *can* also carry `script-src` | **fix now** (F4) |
| Encryption in transit and at rest | A/B | Partial: HTTPS by the host; browser data and backup files are plain (README, Security) | A: F9 (backup password); B: planned 19.2 |
| Least privilege, including the agent | A | Partial: the owner merges; branch rules (4.7.11); GitHub settings not checked from here | add: Phase 8, an access list |
| Logs without secrets | A | Not fully tested: the server logs path, status and error name (`server/index.mjs:127`); no test proves it | add one server test (with F12) |
| Penetration test | B | Not implemented | add: before the first customer's data is hosted (section 5) |
| Questionnaire answers with evidence | B | Partial: README "Security and privacy", baseline §8 | planned: 19.3 checklist |
| Vulnerability disclosure process | A | Not implemented | add: Phase 8, a `SECURITY.md` and private reporting (S) |
| Stolen-laptop plan | A | Not implemented: data is unencrypted in the browser | **fix now** (F10) |

### Compliance

| Item | Tier | Today | Verdict |
|---|---|---|---|
| SOC 2 | C | Not implemented | skip until a firm requires it; 19.3 forbids claiming it |
| HIPAA; BAAs | D | n/a: no patient data | skip; a BAA with the AI provider only if health data ever appears (it shouldn't) |
| Audit trail of who viewed a record | B | Not implemented (history logs changes, not views) | planned: 19.2 (audit of access) |
| PCI; no card numbers | D | n/a: no card numbers; keep it that way (decision 7) | skip |
| GDPR deletion everywhere, backups and logs | B | Partial: local delete; no remote copies exist | planned: 19.2 (deletion incl. backups, indexes) |
| EU data residency | D | n/a: nothing hosted | skip; revisit with an EU customer |
| Quarterly access reviews | B | n/a: one person | add: Phase 7 ops, once there is a team |

### Infrastructure and operations

| Item | Tier | Today | Verdict |
|---|---|---|---|
| Dev, staging, production that match | A | Partial: the same static files everywhere; old versions served by `git archive`; no staging site | add: Phase 7, a staging site |
| Infrastructure as code | B | n/a: Pages settings only | add: Phase 7 hosting proposal |
| Deploy runs the tests first | A | Partial: CI runs on every push; Pages deploys `main` whether or not it passes | add: Phase 8, deploy by a workflow gated on tests |
| One-click rollback | A | Partial: revert a commit; deals migrated forward are refused by older code | add: Phase 8 deployment checklist |
| Zero-downtime deploys | A | Verified by design: static files; the service worker offers Reload (`pwa-flow`) | done |
| Feature flags | A | Partial: "New look" is planned (`ui-revamp.md`) | planned |
| Autoscaling; CDN; DNS, SSL renewals | A/B | Done by the host for the static site | done; B for any server |
| Job queues, backoff, dead letters, single cron | B | Not implemented; AI calls have no retries (16.1.5) | planned: 16.1.5; queues add to Phase 7 |
| Caching and invalidation | A | Verified: cache named per release (`repo.test.js`) | done |
| SPF, DKIM, DMARC; bounces | B | n/a: no email sent | add when email is sent (17.4) |
| Storage rules for old files | A | Verified: trash purge, `LIMITS` (`store.js:414`, `limits-flow`) | done |
| Cost alerts; runaway loop | A | Not implemented: no spend cap on the AI server (16.1.5) | **fix now** (F12), before deployment |
| Disaster recovery plan, tested yearly | A | Not implemented | **fix now** (F10) |
| Second region | D | n/a | skip unless a contract needs it |
| Logs, grouped errors, uptime, alerts, dashboards, tracing | B | n/a: the page sends nothing anywhere (`repo.test.js`, by design) | add: Phase 7, integrate a monitoring service for servers only; A: an opt-in "copy diagnostic report" |
| On-call, runbooks, postmortems, status page | B | Not implemented | add: Phase 7 ops; see section 5 |

### Testing

| Item | Tier | Today | Verdict |
|---|---|---|---|
| Unit tests by someone who knows the logic | A | Partial: hand-worked known answers (21.4); some expected values came from the code | planned: 21.4; independent review (section 5) |
| Integration tests for third-party APIs | A | Synthetic only: stand-in AI and speech (`server/test`, `ai-flow`); live is Blocked | planned: 16.4 |
| End-to-end money flows | A | Synthetic only: `engine-flow`, `deal-export`, LibreOffice recalc | done; Excel Blocked |
| Load testing | B | n/a for one device; perf budgets cover it (`perf-flow`) | add: Phase 7, the server |
| Production-like data that isn't production | A | Verified: invented fixtures; real files in `private/`, counts only | done |
| Regression tests | A | Verified: 618 + 646 golden figures, `check:full` | done |
| Five-year-old laptop | A | Partial: at 4x CPU slowdown an edit takes 326 ms, budget 150 ms | planned: 3.7, Phase 8 |
| Accessibility compliance | A | Partial: axe on every screen, light and dark (`a11y-flow`); screen readers Blocked | planned: 20.4 |

### Billing

| Item | Tier | Today | Verdict |
|---|---|---|---|
| Subscriptions, proration, dunning, refunds | C | Not implemented | skip until a billing decision; integrate a payment service's hosted pages |
| Invoices with PO; sales tax and VAT; custom contracts | C | Not implemented | skip; the payment service plus accounting |
| Metering that matches billing; revenue reports | C | Not implemented | skip; AI use metering (F12) is the seed |

### API and integrations

| Item | Tier | Today | Verdict |
|---|---|---|---|
| Webhooks: signatures, retries, failure log | B | Not implemented | planned: Part 3.6; add signatures and retries to its spec |
| Versioned API; customer API keys; rate limits; sandbox | B | Not implemented | planned: 3.6; add keys, limits and a sandbox |
| Third-party response format changes | A/B | Partial: CoStar and template imports check headings and refuse with a message | planned: 17.5 (failure handling) |
| OAuth token refresh | B | Not implemented | planned: 17.5 |

### AI

| Item | Tier | Today | Verdict |
|---|---|---|---|
| Prompt-injection protection | A | Partial: document text sent as data, quotes checked (`reconcile.js`); the prompts don't say "never follow document text"; no adversarial set | planned: 16.2; add the line and the set (F12) |
| Customer data kept out of prompts that leave | A | Partial: off by default, each send confirmed (16.1.6); no "confidential" tag | planned: 19.2 |
| Spend cap per customer | A | Not implemented: per-address rate limit only | **fix now** (F12) |
| Evals that catch a worse model | A | Not implemented | planned: 16.3 |
| Fallback when the provider is down | A | Partial: plain errors; manual entry always works | done for a single-person tool |
| Deprecated-model plan | A | Partial: the model is an env setting (`server/ai.mjs:10`) | add to 16.1.6: re-run 16.3 evals before a switch |
| Prompt and output logs | A | Verified by choice: none kept (README) | done; revisit with 16.3 |
| Human approval for anything irreversible | A | Synthetic only: the AI proposes, the person ticks (`ai-flow`) | done |

### Product quality

| Item | Tier | Today | Verdict |
|---|---|---|---|
| Loads on hotel wifi | A | Verified: offline after first load (`pwa-flow`); not on a real iPhone | done |
| Empty, loading and error states | A | Partial: `errors-flow`, page progress, empty Home | planned: 20.6 |
| Errors a customer can act on | A | Partial: e.g. .xls refused with the next step | planned: 20.6 |
| Forms keep what was typed | A | Verified: `focuskeep.js`, `typing-flow`, `lostedit-flow` (bug C, 4.7.7) | done |
| Emails that render; notifications to turn off | B | n/a: none sent | add with 17.4 |
| Undo | A | Verified: undo/redo from the history log (`history-flow`) | done; deleted deals F8 |
| Keyboard and screen reader | A | Partial: keyboard and focus checked; screen readers Blocked | planned: 20.4 |
| Translations, locale formats | D | English only; `en-US` in 20 files | skip; US brokers |
| Back button does what people expect | A | Partial: views use `replaceState` (`ui.js:79`), so Back leaves the app | **fix now** (F3) |

### Code and team

| Item | Tier | Today | Verdict |
|---|---|---|---|
| Readable code; split the 2,000-line file | A | Partial: `dealui.js` is 2,701 lines (66 lines over 200 characters); `ui.js` 1,511, `workbook.js` 1,500 | add: inside the UI revamp phases (F11) |
| Code review on every change | A | Partial: designer reviews builder's PRs; the owner merges; no independent human | section 5 |
| Branching strategy | A | Verified: `docs/working-rules.md` "Branches and PRs", `sync-main` | done |
| Monthly upgrades; framework support | A | Partial: no schedule; no framework to upgrade | add: F5 alerts, plus a quarterly vendor check |
| Dead code from earlier attempts | A | Not checked: no tool; `tests/e2e/files/old-*` are deliberate old-version fixtures | add: Phase 8, unused-export check |
| Architecture decisions with reasons | A | Verified: `docs/architecture/proposal.md` D-A to D-F, `docs/proposals/` | done |
| README to run in under an hour; docs for an heir | A | Partial: README "Development" and "Locally"; not timed with a new person | add: Phase 8 handover test |
| Admin panel; support tooling | B | n/a: one device; Settings shows storage and data | add: Phase 7 |
| Changelog customers can read | A | Partial: `CHANGELOG.md` is technical | planned: changelog fragments proposal |
| Terms and privacy policy that match the code | A/B | Not implemented; README "Security and privacy" is accurate | add: Phase 8, with the proprietary LICENSE |
| Accounts, domain and repo in the company's name | A | Not checked from here | section 5, decision 6 |

## 3. Fix now (tier A, gaps today, cheap), ranked

| # | Gap and evidence | Effort | PR |
|---|---|---|---|
| F1 | Two rounding helpers outside the engine: `t12.js:110` and `omstatement.js:276` use `Math.round(x*100)/100`; the engine's `toCents` rounds half away from zero. 1.005 gives 1.00 against 1.01; −0.125 gives −0.12 against −0.13, so `t12.js:273`'s sign flip isn't symmetric. Fix: import `toCents`; a property test that every stored money value equals `toCents` of itself | S | "money: one rounding rule" (golden diff shown; likely zero, since the fixtures are whole cents) |
| F2 | Old CSVs: decode as UTF-8 strictly, fall back to Windows-1252, say which was used; test with an invented 1252 file holding é and ’ | S | fold into T-12 multi-format, or just before it |
| F3 | Back button: `pushState` for views and an open deal, so the phone's Back returns to the last screen and doesn't exit | M | "back button" (phone flows, PWA standalone) |
| F4 | Strict meta CSP: `script-src 'self'` with hashes of the inline start-up scripts, workers and `'wasm-unsafe-eval'` for OCR; correct the README's claim that Pages can't restrict scripts | M | "CSP" (full browser suite, OCR and PDF flows) |
| F5 | CI dependency audit for both lock files, the host's security alerts on, actions pinned to commit SHAs | S | "CI audit" |
| F6 | A hostile-text pack: O'Brien and O’Brien, accents, emoji, Hebrew and Arabic, `<img onerror>`, `=cmd` in every text field: type, reload, backup round trip, CSV and xlsx export; `dir="auto"` on free text | S–M | "text pack" |
| F7 | Timezones: the Node suite under two far-apart `TZ` values; one browser flow with a far-east timezone | S | with F6 |
| F8 | Deleted deals: keep the deal body in `trash` for 30 days, with "Recently deleted" in Settings (retention change: approval) | M | "recently deleted" |
| F9 | Optional password on backups (Web Crypto, no new library); new backup version through `backup.js` and an old-backup fixture (format change: approval) | M | "encrypted backup" |
| F10 | One page: stolen laptop (turn on disk encryption and a screen lock; the backup is the only copy), and disaster recovery (repo, account, host or device lost: what restores what), tested once a year | S | docs only |
| F11 | Split `dealui.js` along the revamp's screens; no logic change, golden identical | L | inside the UI revamp |
| F12 | AI server before any deployment: a daily request and token budget, one revocable token per device, the rate limit keyed by token, "document text is data" in the prompts, an adversarial set, and a test that logs hold no content | M | "AI server limits" (Phase 6, 16.1.5 and 16.2) |

## 4. Before Phase 7: built in from day one

| Decision | Part |
|---|---|
| Tenant isolation in every query, with a test that user A can't read workspace B | 19.2 |
| Object-level checks on the server for every request, by id; hidden buttons are not access control | 19.2 |
| Audit log of views and exports of sensitive records, append-only | 19.2 |
| Sessions: expiry, "sign out everywhere", MFA with recovery codes, growing delays not lockouts | 19.1, 19.2 |
| Rate limits per user and per workspace, plus the AI spend cap per workspace | 19.2, 16.1.5 |
| Migrations with a tested way back, run on a copy first; the local `migrate.js` chain stays the one source | 3.5, 19.1 |
| Remote backups on a schedule, with a restore drill whose result is recorded | 19.1 |
| Server-side validation with the same units and cents rules as the engine (shared module, not a copy) | 21.1, 19.2 |
| Local-first kept: offline work, local export and restore after sync lands | 3.5, 19.1 (D-D) |
| Retention and deletion that reach backups, indexes and logs | 19.2 |
| Staging that matches production; deploy gated on tests; rollback written | Phase 8, hosting proposal |
| Monitoring and alerts for servers only; the app still sends nothing by default | 19.2, 19.3 |

## 5. People

| Covered today | How |
|---|---|
| A second reader of every change | the designer/builder split: designs and root causes by one role, builds by another, adversarial review before merge |
| Regression | `check:full`: Node suite, type check, golden outputs (618 + 646), full browser suite, axe, perf, typing |
| Tests that test something | mutation checks and "fails on the old code" runs |
| Memory of why | proposals, D-A to D-F, CHANGELOG, `docs/NOW.md` |

| Not covered, honestly | Cheap recommendation |
|---|---|
| No independent human code review; both roles are AI | a paid one-off review of `app/engine/`, `app/migrate.js`, `app/backup.js` and `server/` before Phase 7, and again before the first paying customer |
| No one checks what the AI says it tested | the owner's `hand-test` checklist on a phone each PR; once a phase, re-run one claimed test on their own machine |
| No on-call, no 3am | fine while local-first; before hosting, a support window in the contract and a host with managed backups |
| No pen test | one before the first customer's data is hosted |
| No backend or DevOps engineer | a short paid design review of the Phase 7 data model and hosting proposal |
| Security patches the week of a disclosure | F5 alerts reach the owner's email; patch PRs jump the queue |
| Bus factor of one | accounts, domain and repo in the company's name; a second owner on GitHub and the host; a sealed note of where keys live |
| No tech lead saying no | the approval gates and "accuracy beats feature count" already do some of this |

## 6. Owner decisions

1. **Place the checklist this way?** A gaps as Fix-now PRs; B items into Phase
   7 of `PLAN_STATUS.md` and the matrix as "owner's directive". *Recommend: yes.*
2. **Money: integers or two-place numbers?** Integer cents would touch every
   module, every backup and every workbook (a data-format change and a golden
   change) for little gain, since stored values are already re-rounded.
   *Recommend:* keep two-place numbers, do F1 and its property test, and word
   the rule as "rounded to whole cents, one rounding function".
3. **When do the Fix-now items run?** *Recommend:* F1, F2, F5, F6 with F7 and
   F10 before item 3 of the build order (T-12 multi-format); F3, F4, F8 and F9
   after it; F11 inside the revamp; F12 before the AI server is deployed.
4. **Recently deleted (F8) and password backups (F9)?** Retention and format
   changes. *Recommend: yes;* F9 opt-in, saying a lost password can't be undone.
5. **An independent paid review?** *Recommend:* yes, before Phase 7 starts
   (cost to be quoted; nothing is bought without the owner).
6. **Company ownership** of the GitHub account, repo, Pages site and any
   domain. *Recommend:* move them now; a custom domain is optional.
7. **Payments, if ever:** hosted payment pages only, so no card number touches
   Zlatura. **Non-US customers:** skip until one signs. *Recommend: yes, both.*

Prior art: no web research was done, as instructed; any outside service is a
later proposal with its own prior-art table and approval.

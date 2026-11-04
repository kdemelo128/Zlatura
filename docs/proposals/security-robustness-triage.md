# Proposal: security and robustness triage (250 items)

Triage only (2026-11-04, from `main` at `cb4089e`, version 4.7.91). Documentation only: no source, test, workflow,
dependency or lockfile is changed by this document, and nothing in it is built until the owner approves. Every
implementation PR named here is a separate PR with a test that fails on the old code (`CLAUDE.md`, "Security
checklist" and "Tests and checks").

**Status words.** A rows use the four triage statuses the owner's brief asks for: *Already covered* (a test or a
control that enforces the requirement exists), *Partly covered* (the threat cases still open are named), *Missing*,
*Unverified* (the repository could not prove it either way). These are triage labels, not the acceptance matrix's
seven Part 23 words; when a fix lands, the acceptance matrix row moves with its own word. Nothing here is called
secure, and no check is said to pass unless it was run in this session (section 1).

**Confidential data.** No file under `private/` was opened. No real names, figures or files appear here.

## Contents

1. Baseline (commands run and results)
2. Components and trust boundaries
3. Importer inventory
4. DOM sink inventory
5. Content-Security-Policy analysis
6. Service worker and cache analysis
7. AI path analysis
8. Prior art and reuse
9. Prioritised gaps and proposed PR groupings
10. Owner decisions
11. Summary counts
12. Master disposition table (IDs 1 to 250)
13. What was not verified, and why

## 1. Baseline

Run in the worktree on branch `claude/security-triage` (from `main` `cb4089e`), Node v22.22.0, 2026-11-04.
Dependencies installed from the lockfiles with `npm ci --ignore-scripts` (root and `server/`); `node_modules/` is
git-ignored and nothing tracked changed (`git status --short` empty before this file was written).

| Command | Result |
|---|---|
| `npm test` | 1,149 tests, 1,149 pass, 0 fail (48.9 s); includes `tests/analyze-golden.test.js` (618 saved results) |
| `npx tsc -p types/tsconfig.json` | exit 0 |
| `npm run check:quick` (first run) | **failed: golden**, because `tests/e2e/files/pages.json` did not exist in a fresh worktree (environment, not code) |
| `node tests/e2e/dump-pages.mjs files/pages.json`, then `npm run check:quick` | passed: affected unit tests, type check, "646 figures compared, 0 changed" |
| `cd server && npm test` | 59 tests, 59 pass, 0 fail |
| `npm audit --audit-level=low` (root and `server/`) | "found 0 vulnerabilities" in both, on 2026-11-04 |
| GitHub REST: `GET /repos/kdemelo128/zlatura/pulls?state=open` | 0 open pull requests |
| GitHub REST: `GET .../branches/main/protection` | `404 Branch not protected`; `GET .../rulesets` and `.../rules/branches/main` return `[]` |
| GitHub REST: `GET .../code-scanning/default-setup` | CodeQL default setup `configured`, weekly, languages actions, javascript-typescript, python |
| GitHub REST: `GET .../pages` | refused by the session proxy (403): Pages settings (HTTPS enforcement, custom domain) **UNVERIFIED** |

**Not run here:** the browser suite (`bash tests/e2e/run.sh`, `check:full`): Playwright's browsers are not installed
in this container, so no browser, axe, perf, CSP-violation or offline claim in this document comes from a run made
today. WebKit and Firefox are not installed (`docs/PLAN_STATUS.md`, Phase 8). No deployed response header was fetched:
the security checklist forbids probing a live system (`docs/security-checklist.md`, step 6).

**Known flaky:** `rename-flow` "Settings says the data moved and the old copy is kept" failed once in `check:full`
and passed alone (`docs/NOW.md`). **CI checks:** `.github/workflows/test.yml` (Node suite, TZ runs, AI server suite,
`npm audit` on both lockfiles, a four-flow browser subset), `.github/workflows/security-scan.yml` (actionlint,
zizmor, gitleaks, osv-scanner), CodeQL default setup, Dependabot for GitHub Actions only (`.github/dependabot.yml`).
The last CI results on `main` were not inspected in this session.

**Work in flight:** branch `claude/load-error-recovery` (commit `a8ac2d6`, not yet a PR per the API) renames
`app/fingerprint.js`, names the failed file and isolates start-up steps; it adds about 40 lines to `index.html` and
touches `sw.js`. The CSP PR below must start after it merges, since both edit the inline scripts.

**Prior security work, not redone here:** F1 to F3 (`#55`: AI settings never restored from a backup, local keys
allow-listed, malformed URL answered 400), F12 AI server limits (`#72`, `#76`: per-device tokens, spend caps,
injection set), CI scanners (`#74`), CodeQL alert fixes (4.7.46, 4.7.65, 4.7.72), the zip guard (4.7.76,
`app/filekind.js` `safeUnzip`, `tests/zip-guard.test.js`), the minimatch override (4.7.82), the hostile-text pack and
time-zone runs (F6/F7, 4.7.60), Pillow audit (`#68`), property tests (`#75`). Earlier audit findings and the
defence-in-depth list I1 to I5 are in `docs/proposals/dev-tools-and-reuse.md` section 4.

## 2. Components and trust boundaries

| Component | Where | Runs on | Lower-trust input that reaches it | Notes |
|---|---|---|---|---|
| The app (static PWA) | `index.html`, `app/*.js`, `app/engine/`, `vendor/` | the broker's browser, served by GitHub Pages from `main` | uploaded files, pasted text, backups and project files, AI replies, `location.hash` | no accounts; all data in this browser |
| Local storage | `app/store.js` (IndexedDB), `localStorage` (theme, look, tools) | the browser | restored backups, project files | unencrypted; shared by every page on the same origin (see ID 17) |
| Service worker | `sw.js`, registered by `app/ui.js:1513-1558` | the browser | same-origin GET responses only (`sw.js:229-232`) | versioned cache plus an OCR cache kept across versions |
| Web workers | `app/convert-worker.js`, `app/pdfpages-worker.js`, `app/projector-worker.js`, pdf.js worker, tesseract worker | the browser | files passed by message | same-origin script URLs (`new URL(..., import.meta.url)`) |
| AI server (optional, not deployed) | `server/index.mjs`, `server/ai.mjs`, `server/budget.mjs`, `server/tokens.mjs` | an operator's Node 20+ host | HTTP from any client holding a device token; documents and text from the app; model replies | holds `ANTHROPIC_API_KEY`; no database; counters in memory |
| Upstream AI provider | Anthropic API via `@anthropic-ai/sdk` 0.133.0 | provider | the server's requests | model output is untrusted |
| Speech service (optional) | `STT_URL` from the server's environment (`server/index.mjs:50,92`) | operator-chosen | audio from the app | URL is operator config, never request data |
| CI | `.github/workflows/test.yml`, `security-scan.yml`, CodeQL default setup, Dependabot | GitHub-hosted runners | pull-request code; downloaded tools (checksum-pinned) | `permissions: {}` / `contents: read` |
| Hosting | GitHub Pages, `main`, origin `kdemelo128.github.io` (shared with the account's other Pages sites) | GitHub | none from users | cannot set response headers; settings UNVERIFIED |
| Release tooling | `tests/tools/*.mjs` (bump, changelog, sync-main, golden) | the developer's machine | repository text | not shipped as app code, but served by Pages because Pages serves the repository root |

Trust boundaries crossed: file to page (every importer, section 3); backup or project file to storage; page to AI
server (opt-in, confirm sheet); AI server to provider; provider reply to server to page (schema, key filter, quote
check); repository to CI runner; `main` to every installed copy (Pages plus the service worker).

## 3. Importer inventory

"Sniff" means the kind is decided from the bytes (`app/filekind.js` `sniff`/`checkUpload`), not the name.

| Importer | Entry (file:line) | Formats | Size cap before read | Kind from bytes | Parser limits | Tests |
|---|---|---|---|---|---|---|
| T-12 statement | `app/t12ui.js:508,525` | xlsx, xlsm, csv, tsv, txt, paste | yes (`checkUpload`, `LIMITS`) | yes | zip guard; ExcelJS gets a hardened copy | `filekind.test.js`, `zip-guard.test.js`, `t12-*.test.js` |
| Rent roll sheet | `app/rentrollui.js:832` via `app/sheetread.js:102,124` | xlsx, csv | yes | yes | zip guard; rows | `zip-guard.test.js` ("every ExcelJS load site") |
| Comp importer (4.7.91) | `app/compimportui.js:31,50` | xlsx, csv | yes | yes | `MAX_ROWS` (`app/compimport.js:15,135`) | `compimport.test.js` |
| Documents hub (DD intake) | `app/ddintake.js:81-98`, drop `app/ddui.js:128` | any; sheets read | yes (`checkUpload`; PDF `LIMITS.pdf`) | yes | 400 rows a sheet | `dd.test.js` |
| PDF pages (combine/extract) | `app/pdfpages.js:34-48`, `app/pdfpagesui.js:78` | pdf | yes, per file and in total, `MAX_FILES` | yes | `MAX_PAGES` 500, worker watchdog | `pdfpages.test.js` |
| Convert card | `app/convert.js:151-173`, `app/convertui.js:243-323` | pdf, images, csv, xlsx | yes (`convert.js` per-kind limits) | yes (first 64 KB) | `MAX_PAGES`, page-image cap | `convert.test.js` |
| Excel template | `app/ui.js:1199-1209`, `app/template.js:132` | xlsx, xlsm | **no** (extension only) | **no** before read; `safeUnzip` refuses non-zip and bombs | zip guard (`safeUnzip`) | `zip-guard.test.js`, `template.test.js` |
| Library template / project | `app/libraryui.js:123,152,170` | xlsx, json | **no** (empty file only) | partly | zip guard for xlsx | `template.test.js` |
| OM PDF | `app/dealui.js:433-446` | pdf | **no** | **no** (name or MIME) | none: every page read (`app/pdftext.js:50`) | `om.test.js`, `om-flow` |
| OM page by OCR | `app/dealui.js:2040-2060` | pdf (re-picked) | **no** | **no** | one page | `photo-text.test.js` |
| CoStar PDFs (Comps) | `app/ui.js:742,768-781` | pdf, project json | **no** | **no** | two parsed at a time; no page cap | `parser.test.js`, `comps-flow` |
| Rent roll PDF | `app/rentrollui.js:895-905` | pdf | **no** | **no** (name or MIME) | layout guard after parse | `rrdoc.test.js`, `rrpdf-flow` |
| Backup restore | `app/backupui.js:73,126-171`, `app/backup.js:112-127` | json | **no** (`readText` reads whole) | format and version fields | kv and local allow-lists; no per-deal shape check | `backup.test.js`, `backup-flow`, `limits-flow` |
| Comp project file | `app/ui.js:939-948`, `app/store.js:735-748` | json | **no** | format and version fields | docs filtered; `edits`, `subject` taken whole | `store`-level tests via `comps-reload` |
| AI document send | `app/aiui.js:125-140` | pdf, text | yes, `MAX_SEND` 28 MB total (`app/aiui.js:18`) | n/a (sent, not parsed) | server `maxBody` 40 MB | `ai-flow`, `server.test.mjs` |
| Research sources | `app/researchui.js:84-92` | pdf, txt, md, csv | yes, `MAX_SEND`, `MAX_TEXT` 60,000 chars | partly | server `RESEARCH_LIMITS` | `research.test.js`, `research.test.mjs` |
| Site photos and voice notes | `app/dealui.js:2211,2321,2373` | images, audio | **no** | **no** (browser decodes) | none | `voice-flow` |
| Lease abstracts | `app/abstractui.js` (from Documents hub files) | via DD intake | as DD intake | as DD intake | as DD intake | `abstracts.test.js`, `abstract-flow` |

Formulas are never evaluated on import (`app/sheetread.js:7-12` takes the cached result); macros are kept, never run
(`app/template.js:566,580`); external links are kept and flagged (`app/template.js:567,581`). Template XML is parsed
with the browser's `DOMParser`, which does not fetch external entities. pdf.js runs with `isEvalSupported: false`
(`app/pdftext.js:45`, `app/convertui.js:320`, `app/pdfpagesui.js:431`) from a same-origin worker
(`app/kit.js:237`); the shipped pdf.js is 4.7.76, later than the release that fixed the font-eval issue
(CVE-2024-4367, fixed in 4.2.67; version comparison only, advisory text not re-read today).

## 4. DOM sink inventory

Command: `grep -n -E "innerHTML|insertAdjacentHTML|outerHTML|document\.write|\beval\(|new Function|srcdoc|setTimeout\(['\"]|createContextualFragment" app/*.js app/engine/*.js sw.js index.html server/*.mjs`.
No `outerHTML`, `document.write`, `eval(`, `new Function`, `srcdoc`, string `setTimeout` or
`createContextualFragment` in app code. Every hit is an HTML sink:

| Class | Sites | Why it is safe today |
|---|---|---|
| Fixed icon markup through `icon(name, size, extra)` | `app/abstractui.js:28`, `app/command.js:91,143`, `app/dateinput.js:131`, `app/dealcrm.js:97,102,149,210`, `app/dealui.js:549,573,591,618,638,645,696,1001,1681,2098,2235,2349,2373`, `app/impactui.js:25`, `app/kit.js:199`, `app/libraryui.js:54,214`, `app/pdfpagesui.js:191`, `app/rentrollui.js:270,276,655,687,689,693,1245,1251,1253,1311,1332`, `app/settings.js:126`, `app/toolsui.js:215,684`, `app/ui.js:425,704` | `icon()` (`app/icons.js:82-86`) returns markup only from the fixed `ICONS` table, `''` for an unknown name; `size` and `extra` are code constants at every call site read. `app/ui.js:425` takes `ICON_INFO/MOVE/DEL` constants (`app/ui.js:431-433`). |
| Fixed SVG hydration | `app/icons.js:95`, `app/brand.js:40,43` | path data from `ICONS` and `MARK` constants |
| Static literal strings | `app/command.js:108`, `app/dealui.js:602` (icon plus fixed text), `app/dealui.js:1150`, `app/rentrollui.js:1443` | literal text in the code, no interpolation of data |
| Untrusted data into HTML | **none found** | user and file text goes through `el(tag, cls, text)` and `textContent` |

Other sinks: links built from data use fixed schemes or hosts (`tel:` with digits only and `mailto:` at
`app/dealcrm.js:222-223`; Google Maps with `encodeURIComponent` at `app/ui.js:1038-1040` with
`rel="noopener noreferrer"` and `app/dealui.js:2717` with `noopener`). No `message` listener on `window`; worker
`postMessage` is to dedicated same-origin workers. `location.hash` is split and compared, never written to the DOM
(`app/ui.js:104-107`). `dir="auto"` is set on names (`app/dealui.js:707,730`).

Existing enforcement: `tests/e2e/hostile-flow.mjs` with `tests/fixtures/hostile.js` (img onerror, script tag, bidi,
formula starts, control characters, 40,000 characters) typed through screens, reload, backup and every export;
`tests/exporters.test.js:52,89` for formula neutralising. **Gaps:** no source-level test stops a future
`innerHTML = data`; the pack has no SVG payload, no attribute-breaking quote payload and no `javascript:` link
attempt; the browser flow was not run today.

## 5. Content-Security-Policy analysis

What exists (`index.html:9`): `object-src 'none'; base-uri 'self'; form-action 'none'`, delivered by a `<meta>`
element placed before every script, plus `<meta name="referrer" content="no-referrer">` (`index.html:10`).

What it does not do: no `default-src`, `script-src`, `connect-src`, `worker-src`, `img-src`, `style-src` or
`frame-src`. If an injection were ever introduced, it could run inline script, load script from any origin and send
data anywhere. The README claim that "GitHub Pages cannot send headers, so the policy does not restrict scripts"
(`README.md:651-656`) is inaccurate: a meta CSP can carry `script-src`; it cannot carry `frame-ancestors`,
`report-uri`/`report-to` or `sandbox`, and it is not a substitute for HSTS, `X-Content-Type-Options`, COOP or
`Permissions-Policy`, which need response headers that GitHub Pages does not let a site set.

What a strict meta policy must allow (from the code, not run): five inline scripts (`index.html:11-19`,
`20-29`, `305`, `306-312`, `313-324`) by hash, or moved to files; the inline `onerror` attribute at `index.html:325`
moved into code (an attribute handler needs `'unsafe-hashes'`, which should not be added); module and classic workers
from `'self'`; `'wasm-unsafe-eval'` for the OCR core (`vendor/ocr/`); `blob:` for photo, audio and download object
URLs in `img-src`/`media-src`; `style-src` must be checked against `el.style.cssText` uses (CSSOM, allowed) and any
`style=` attribute inside HTML strings (none found in `index.html` beyond three static attributes, to be checked in
the browser); `connect-src 'self'` plus the AI server, **whose origin the broker types in Settings**
(`app/ai.js:13-14,66`), so it is not known when the page is published (decision D2). The Claude artifact mode
(`app/kit.js:22`, `IN_ARTIFACT`) embeds the page in a frame and must keep working. The load-error branch adds inline
script, so its hashes must be taken after it merges.

## 6. Service worker and cache analysis

Read from `sw.js` (233 lines) and `app/ui.js:1513-1558`; not exercised in a browser today.

- **Registration:** fixed `sw.js`, default scope, only on `https:` or `localhost`, not in artifact mode
  (`app/ui.js:1558`). Fixed URL and scope: covered.
- **Cache keys:** `zlatura-<VERSION>`; `tests/repo.test.js` "the offline cache is named for this release" ties it to
  `package.json` and `app/exporters.js`, and "caches every file the app needs, and only files that exist".
- **Install:** every asset fetched with `cache: 'reload'` (`sw.js:170-176`), then `skipWaiting()`.
- **Activate:** deletes every cache except the current one and the OCR cache (`sw.js:178-183`).
- **Fetch:** only same-origin GET (`sw.js:229-232`); vendor, fonts and icons cache-first; app code network-first
  with a 3.5 s timeout (`sw.js:198-220`); OCR files in their own cache.
- **User data:** deals, files and AI replies live in IndexedDB and are never fetched by URL, so the cache holds no
  user data. AI calls go cross-origin and are not intercepted.
- **Residual 1 (I4 in `dev-tools-and-reuse.md`), confirmed by reading:** `fromNetwork` (`sw.js:186-195`) writes every
  successful same-origin GET into the *current* release's cache. After a new release is live but before the new
  worker activates, a network-first fetch stores a new-release module in the old cache; and on a slow connection
  the 3.5 s timeout can answer some modules from the old cache and others from the network. Either gives a mixed
  release (a failed import or two versions of a shared module). Impact: a broken load or wrong behaviour until the
  next reload; no data loss seen in the code.
- **Residual 2:** `caches.match(request, { ignoreSearch: true })` (`sw.js:201,218,223`) answers any query string with
  the cached file. Harmless today (no query-dependent app files).
- **Residual 3:** the OCR cache is never cleaned when a later release changes the OCR version (old names stay).
- **Not tested:** update with a slow network, quota exhaustion during install, rollback to an older release.
  `tests/e2e/pwa-flow.mjs` covers first install, offline open, offline OM read and export.

## 7. AI path analysis

Path: broker turns AI on and enters URL and token (stored in IndexedDB `ai.settings`, `app/ai.js:10-14`); every call
goes through `guard()` (`app/ai.js:46-56`, enforced by `tests/ai-guard-scan.test.js`), which refuses confidential deals
(`tests/confidential.test.js`); the URL must be `https://` or localhost (`app/ai.js:66`); a confirm sheet names the
destination before a send (`app/aiui.js:136`, `ai-flow` "the send is confirmed first, naming the server").

Server: token checked before any route, by SHA-256 and `timingSafeEqual` (`server/tokens.mjs:46-50`,
`server/index.mjs:195-198`); exact-origin CORS (`server/index.mjs:189-193`); 40 MB body cap (`:51,76`); per-device
rate limit and daily spend caps (`server/budget.mjs`, `server/test/limits.test.mjs` 1-9h); errors never echo upstream
bodies (`:235-244`, `server.test.mjs` "upstream failures"); logs carry no content (`injection.test.mjs` 11, 11b).

Prompt construction: documents travel as `document` content blocks, not as text between delimiters
(`server/ai.mjs:74-78`); every system prompt carries the "documents are data" rule (`injection.test.mjs` 9);
structured output via `output_config.format: json_schema`; **no tools** are offered to the model; unrequested field keys
and out-of-range document indexes are dropped (`server/ai.mjs:84-86`, `injection.test.mjs` 10); in the app a figure is
"Passage checked" only when its quote is on the page and holds the figure (`app/reconcile.js` `verifyQuote`,
`tests/ai-injection.test.js`), nothing is applied without the broker ticking it, and a snapshot is taken first
(`app/dealui.js:2548`).

Residuals: (a) `applyReviewed` filters keys with `key in KIND` (`app/dealui.js:2550`, also `:469`), an
inherited-property test, so `constructor` or `toString` would pass if the server filter were ever bypassed (a
compromised or misconfigured server); needs validation, low. (b) Field labels and kinds sent by the app are
interpolated into the user turn (`server/ai.mjs:79-80`); the app is the token holder, so low. (c) `MODEL` is
`process.env.AI_MODEL || 'claude-opus-5-5'` (`server/ai.mjs:10`) and requests set `fallbacks: 'default'`
(`:321-322`), so another model may answer; `res.model` is recorded on every applied source (`app/aiui.js:247`).
Whether the identifier is a dated snapshot or an alias was not checked against provider documentation (UNVERIFIED).
(d) No evaluation against a live model: no credentials or deployed server here (`docs/PLAN_STATUS.md` "Live AI and
speech providers", marked `[!]`). (e) Failed authentication is not throttled (`server/index.mjs:198` returns before
the limiter at `:207`); tokens from `tokens.mjs new` are 256-bit random, so guessing is infeasible, but the legacy
`APP_TOKEN` only needs 16 characters (`:255`).

## 8. Prior art and reuse

This is a triage, not a build. Every proposed fix below uses what the repository already has: the Node test runner
source-scan pattern (`tests/ai-guard-scan.test.js`, `tests/repo.test.js`), `fast-check` (already a dev dependency) for
seeded fuzzing, the existing `checkUpload`/`LIMITS` guard for every reader, Playwright flows for CSP checks, and the
existing CI scanners. No new library, action or service is proposed. No web search was run for this triage; where an
outside tool could replace a hand-written check it is listed for a later decision, not adopted.

| Candidate | What it does | License | Size | Last release, maintenance | Build-free, vendored, offline | Network or telemetry | Security notes | Verdict |
|---|---|---|---|---|---|---|---|---|
| Existing source-scan tests (`tests/ai-guard-scan.test.js` pattern) | regex scan of app code for a forbidden call shape | project MIT | under 100 lines | in repo | yes | none | regex blind spots: aliasing, computed property names; documented in the test | **adopt** for the DOM sink guard (ID 2) |
| `fast-check` 4.10.2 (already in `package.json`) | seeded property and fuzz runs | MIT (per `THIRD_PARTY.md`) | dev only | pinned | yes (test only) | none | already reviewed | **adopt** for parser fuzzing (ID 211) |
| An ESLint DOM-sink plugin (for example Mozilla's `eslint-plugin-no-unsanitized`) | AST-aware sink rule | MPL-2.0 per memory, **UNVERIFIED** (not browsed) | would add ESLint and its tree | not checked | dev only | none expected | MPL-2.0 needs owner approval; adds a toolchain the repo does not have | **not now**: revisit only if the regex guard proves too blind |
| GitHub dependency review action | blocks PRs that add vulnerable packages | not checked | CI only | not checked | n/a | GitHub API | needs a SHA pin and zizmor review | **not now**: `npm audit` and osv-scanner already gate both lockfiles |

## 9. Prioritised gaps and proposed PR groupings

Ranked by exploitability, impact and reachability on this architecture, not by checklist order. "Security" marks a
control against an attacker; "Reliability" a quality control. Severity uses `docs/security-checklist.md` step 5.
None of these is a confirmed vulnerability with a reproduced exploit except where it says "confirmed by reading".

| Rank | Gap (IDs) | Kind | Risk | Evidence | Proposed PR |
|---|---|---|---|---|---|
| 1 | No CI guard that rejects tracked files under `private/` or `.env*`, `*.pem`, `*.key`; `.gitignore` misses `.env.*` (IDs 18, 20, 233) | Security (data leak in a public repo) | Medium | `.gitignore:1-12`; `git ls-files` shows none today; no test asserts it | **S1** "repo hygiene guard": `tests/repo.test.js` case over `git ls-files`, `.gitignore` additions |
| 2 | `main` is not protected: no required checks or reviews; Pages deploys from `main` (IDs 198, 182, 185) | Security (supply chain) | Medium | API: `Branch not protected`, rulesets `[]` | **Owner setting**, not a PR (production settings need the owner's own action) |
| 3 | Shared origin `kdemelo128.github.io`: any other Pages site of the account can read this app's IndexedDB (deals, contacts, AI token) and `localStorage` (IDs 17, 233, 37) | Security | Medium (needs another of the owner's sites to be hostile or compromised) | origin model; I3 in `dev-tools-and-reuse.md` | **Owner decision D1** (custom domain or a dedicated account); hosting gate |
| 4 | CSP has no `script-src`/`connect-src`/`worker-src`/`default-src`; README misstates the limit (IDs 10, 2, 9, 11) | Security (defence in depth) | Medium | `index.html:9`, `README.md:651-656`; F4 open (`docs/PLAN_STATUS.md:276`) | **S2** "strict meta CSP" (M), after the load-error branch merges; browser suite with a `securitypolicyviolation` listener failing the run |
| 5 | Six readers parse without a size cap or byte sniff: OM PDF, OM OCR re-pick, CoStar PDFs, rent roll PDF, Excel template, backup and project JSON; `pdfPages` has no page cap (IDs 33, 12, 130, 167, 222) | Reliability and DoS on the broker's own device | Low | section 3 table | **S3** "every reader through checkUpload" (M), invented oversized and mislabelled fixtures per reader |
| 6 | No source-level DOM sink guard; hostile pack lacks SVG, quote-breaking and `javascript:` payloads (ID 2) | Security (regression guard) | Low | section 4 | **S4** "DOM sink scan and pack additions" (S) |
| 7 | Backup and project restore: deals and `edits`/`subject` not shape-checked; restore is many writes and can stop part way (IDs 226, 48, 49, 108) | Reliability, integrity | Low | `app/backupui.js:150-171`, `app/store.js:743-745` | **S5** "restore shape check" (M); refusing a shape accepted today is a compatibility question (decision D4) |
| 8 | `key in KIND` accepts inherited names (IDs 8, 226) | Security (mass assignment), needs validation | Low | `app/dealui.js:469,2550` | fold into **S5** (S): `Object.hasOwn`, test with `constructor` |
| 9 | Service worker can mix releases (IDs 98, 16 of the security checklist) | Reliability | Low | section 6, residual 1 | **S6** "one release per cache" (M); offline behaviour must stay identical (decision D3) |
| 10 | AI server: failed-auth not throttled; no SIGTERM drain; no explicit server timeouts or concurrency cap; SDK retry count not set (IDs 30, 143, 91, 95) | Security and reliability, server not deployed | Low | section 7 (e); `server/index.mjs:261-267` | **S7** "AI server hardening" (S), before any deployment |
| 11 | `SECURITY.md` is the unedited GitHub template with a fictitious version table and no reporting route (ID 155) | Process | Low | `SECURITY.md` | docs PR (S), whether private vulnerability reporting is on is UNVERIFIED |
| 12 | CI supply chain: `pip install -r tests/e2e/requirements.txt` without hashes; Playwright installed outside the lockfile; `npm ci` runs lifecycle scripts; Dependabot covers actions only; vendor checksums tested for pdf-lib only (IDs 39, 196, 197, 38, 239) | Security (supply chain) | Low | `.github/workflows/test.yml:21,63,67`; `tests/repo.test.js:108-118` | **S8** "CI pins and vendor checksums" (S); workflow change reviewed with zizmor |

**Order and the two-PR limit.** At most two security implementation PRs open at once (owner's brief; `CLAUDE.md`
allows one for the owner's merge unless independent). Proposed order: S1 and S4 (independent files: `tests/` and
`.gitignore`), then S3 and S7, then S5, then S2 (after `claude/load-error-recovery` merges), then S6 and S8. Rank 2,
rank 3 and the `SECURITY.md` route are the owner's own settings or decisions.

## 10. Owner decisions

| # | Decision | Why it needs you | Recommendation |
|---|---|---|---|
| D1 | Move off the shared `github.io` origin (custom domain or a dedicated GitHub account for Pages) | hosting change; existing installs keep their data under the old origin, so it needs a move-your-data step (backup then restore) | **Yes, before any real client data is used in the app**; plan it with the hosting proposal (`docs/PLAN_STATUS.md:1074`) |
| D2 | CSP `connect-src` for the AI server, whose address the broker types | a fixed allow-list would break any firm's server not listed; `https:` keeps AI working but allows any HTTPS host | `connect-src 'self' https:` now (still blocks `http:` and `data:`), the exact host once a firm's server is fixed in the hosting proposal |
| D3 | Service worker release consistency (S6) | changes when an installed copy picks up a release; offline must stay identical | approve S6 only if the pwa-flow and a new slow-network update flow show offline unchanged |
| D4 | Restore shape check (S5) | a malformed backup accepted today would be refused | refuse only shapes that would break the app (non-object deal, missing string `id`); never refuse a backup an older version made (`make-backup-4.7.*.mjs` fixtures must still restore) |
| D5 | Turn on branch protection for `main` (required checks: Node tests, `npm audit`, security-scan; no force push) | a production setting only the owner may change | **Yes** |
| D6 | F9 password on backups (ID 37) | a new backup format (already approved in principle, `docs/PLAN_STATUS.md:281`) | keep it as planned; it is not part of this security series |

No proposed fix changes a golden output, a saved-deal result or the money rules. S2, S3, S5 and S6 touch app
behaviour and must keep `tests/analyze-golden.test.js` (618) and the 646 displayed figures identical.

## 11. Summary counts

| Category | Already covered | Partly covered | Missing | Unverified | Total |
|---|---|---|---|---|---|
| A, applicable now | 36 | 72 | 10 | 6 | 124 |
| B, conditional or future | | | | | 47 |
| C, not applicable | | | | | 79 |
| **All** | | | | | **250** |

Missing (A): 9, 37, 143, 150, 151, 155, 173, 198, 205, 230. Unverified (A): 11, 36, 52, 95, 105, 108. One B row
(242) has no milestone and says UNASSIGNED; the other B rows cite a plan line or proposal. These counts were produced
by the completeness script described in section 13 from the table below.

## 12. Master disposition table

Columns: **ID**, **Item** (exact label), **Cat** (A, B or C), **Risk** (A only), **Status** (A only), **Evidence**,
**Gap and impact** (for B the trigger, for C the reason), **Action, size and gate**, **Related**. "—" means not
applicable to that category.

| ID | Item | Cat | Risk | Status | Evidence | Gap and impact | Action, size and gate | Related |
|---|---|---|---|---|---|---|---|---|
| 1 | SQL Injection | B | — | — | — | Trigger: the Phase 7 backend ("tenant isolation in every query", `docs/proposals/production-readiness.md` §4; `docs/PLAN_STATUS.md:1049-1059`). Today no SQL anywhere: IndexedDB key-value (`app/store.js`), server has no database | — | 6, 14, 226 |
| 2 | XSS | A | Medium | Partly covered | section 4 (no untrusted HTML sink); `tests/e2e/hostile-flow.mjs`; `tests/fixtures/hostile.js` (img onerror, script) | no source guard stops a future `innerHTML = data`; no SVG, quote-breaking or `javascript:` payloads; no CSP script backstop; hostile flow not run today | S4 (S): `tests/dom-sink-scan.test.js` allow-listing `icon()` and literals, pack additions; gate: `npm test`, `hostile-flow` | 10, 12 |
| 3 | CSRF | B | — | — | — | Trigger: Phase 7 sessions (`production-readiness.md` §4 "Sessions"). Today the AI server takes a bearer header, never a cookie, so a cross-site form cannot act | — | 24, 28 |
| 4 | CORS | A | Low | Already covered | `server/index.mjs:189-193` exact allow-list, no credentials mode; `server/test/server.test.mjs:49` "refuses ... other sites" | requests with no Origin (non-browser) are allowed with a valid token, by design | none; gate: `server` suite | 13 |
| 5 | SSRF | A | Low | Partly covered | `server/index.mjs:50,92` STT URL from environment only; extract and research take documents, no URLs (`server/ai.mjs:72-86`); app URL is the broker's (`app/ai.js:66`) | no test pins "a request body URL is never fetched" | S7 (S): server test with a mock fetch counting calls for a body with `url` fields; gate: `server` suite | 23 of the security checklist |
| 6 | IDOR | B | — | — | — | Trigger: Phase 7 object-level checks (`docs/PLAN_STATUS.md:1059`, `production-readiness.md` §4). Today one device, one user | — | 13, 14 |
| 7 | Path Traversal | A | Low | Already covered | `app/kit.js:296-307` `downloadName`; `tests/downloadname.test.js` "path separators ... never a path"; zip entries kept in memory (`app/filekind.js` `safeUnzip`), `tests/zip-guard.test.js` "__proto__ is just a part" | none in reach: no file is written by entry name; server reads only its configured tokens file | none; gate: `npm test` | 33 |
| 8 | Mass Assignment | A | Low | Partly covered | `app/backup.js:46-63` kv and local allow-lists, `tests/backup.test.js` F1, F2, I6; `server/ai.mjs:84-86` key filter | `key in KIND` (`app/dealui.js:469,2550`) accepts inherited names (`constructor`) if the server filter is bypassed; `readProject` keeps `edits` and `subject` whole (`app/store.js:743-745`) | S5 (S): `Object.hasOwn`, test with `constructor` and `__proto__`; gate: `npm test` | 226 |
| 9 | Clickjacking | A | Low | Missing | no `frame-ancestors` possible in meta (`index.html:9`); no X-Frame-Options (Pages) | a hostile page can frame the app; modern storage partitioning gives the frame empty storage, which limits harm; artifact mode needs framing (`app/kit.js:22`) | document in README and the hosting proposal; header-level fix only with a host that sets headers (S, docs); gate: none until hosting | 10, 11, D1 |
| 10 | Content Security Policy | A | Medium | Partly covered | `index.html:9` (`object-src`, `base-uri`, `form-action`); section 5 | no `script-src`, `connect-src`, `worker-src`, `default-src`; injected script would run and exfiltrate; README wrong (`README.md:651-656`) | S2 (M): strict meta CSP with hashes, `onerror` attribute moved to code; gate: full browser suite failing on any `securitypolicyviolation`, a test that the meta is first in `<head>` and has no `unsafe-inline`/`unsafe-eval` | F4 (`docs/PLAN_STATUS.md:276`), D2 |
| 11 | Security Headers | A | Low | Unverified | Pages cannot set headers; AI server sends `nosniff` and `no-store` (`server/index.mjs:66`); `index.html:10` referrer meta | deployed headers not fetched (no live probing); COOP, `Permissions-Policy`, `nosniff` absent on Pages by design | record in hosting proposal; S7 adds a server test for its headers (S); gate: `server` suite | 9, 36, 105 |
| 12 | Input Validation | A | Medium | Partly covered | `app/filekind.js` `checkUpload`, `LIMITS`; Data QC (`app/dataqc.js`); `app/backup.js:112-127`; section 3 | six readers skip `checkUpload`; backup deals not shape-checked | S3 (M) and S5 (M); gate: per-reader unit tests with invented oversized and mislabelled files | 33, 226 |
| 13 | Server-Side Authorization | A | Low | Already covered | `server/index.mjs:195-198` every route after the token check, health included; `server/test/server.test.mjs:49` | one role today; the confidential-deal block runs on the device only and is documented as not access control (`app/ai.js:27-29`) | none now; deferred: Phase 7 19.2 (`docs/PLAN_STATUS.md:1059`); gate: `server` suite | 6, 14, 16 |
| 14 | Row-Level Security | B | — | — | — | Trigger: Phase 7 tenant isolation (`docs/PLAN_STATUS.md:1059`) | — | 1, 6 |
| 15 | Least Privilege | A | Low | Partly covered | `.github/workflows/security-scan.yml:13` `permissions: {}`, jobs `contents: read`; `test.yml:7-8`; `tests/ci-scanners.test.js` "every checkout drops credentials"; model has no tools (`server/ai.mjs`) | server docs do not say to run as an unprivileged user; `GH_TOKEN` passed to zizmor (read-only token) | S7 (S): `server/README.md` run-as guidance; gate: zizmor in CI | 17, 39 |
| 16 | RBAC | B | — | — | — | Trigger: Phase 7 19.1 roles and deal-level access (`docs/PLAN_STATUS.md:1052`) | — | 13 |
| 17 | Secrets Management | A | Medium | Partly covered | no key in the page (`README.md:646`); server env and hashed tokens (`server/tokens.mjs`); AI token never in backups (`app/backup.js:37`, `tests/backup.test.js` F1) | the device token sits in IndexedDB in plain text on a **shared origin** (`kdemelo128.github.io`): any other Pages site of the account can read it and every deal | D1 (custom domain or dedicated account; L, hosting gate); no code change proposed now; gate: hosting proposal | 233, 37, I3 |
| 18 | .env in .gitignore | A | Medium | Partly covered | `.gitignore` has `.env`, `*.env`, `private/` | `.env.local`, `.env.production`, `*.pem`, `*.key` not ignored; no test that tracked files exclude them | S1 (S): `.gitignore` lines plus a `tests/repo.test.js` case over `git ls-files`; gate: `npm test` | 20, 233 |
| 19 | API Key Rotation | A | Low | Partly covered | per-device tokens revoked by deleting a line, re-read every 10 s or on SIGHUP (`server/index.mjs:142-158,265`; `limits.test.mjs` 1) | the provider key rotates only by restart; no written rotation or compromise runbook | docs (S) with ID 157; gate: none (docs) | 157 |
| 20 | Secret Scanning | A | Medium | Already covered | `security-scan.yml` gitleaks 8.30.1 (full history on push, PR range on PR), `.gitleaks.toml` narrow allow-list; `tests/ci-scanners.test.js` | GitHub secret scanning and push protection settings UNVERIFIED; last CI result not inspected; gitleaks does not catch confidential documents (see 18) | none; gate: `security-scan` job | 18, 233 |
| 21 | Hashing vs Encryption | A | Low | Already covered | tokens kept as SHA-256 of 256-bit random values (`server/tokens.mjs:9`, `limits.test.mjs` "tokens.mjs new") | a fast hash is right for high-entropy tokens, wrong for passwords (see 22, 23) | none; gate: `server` suite | 22, 23 |
| 22 | Password Salting | B | — | — | — | Trigger: F9 backup password (`docs/PLAN_STATUS.md:281`) and Phase 7 accounts; no passwords exist today | — | 23, 37 |
| 23 | bcrypt & Argon2 | B | — | — | — | Trigger: F9 (Web Crypto key derivation, "no new library", `production-readiness.md` §3) and Phase 7 accounts | — | 22 |
| 24 | JWT Expiry | B | — | — | — | Trigger: Phase 7 sessions (`production-readiness.md` §4) | — | 25, 28 |
| 25 | Refresh Tokens | B | — | — | — | Trigger: connector OAuth (`docs/proposals/platform-expansion.md` §2.2) and Phase 7 sessions | — | 26 |
| 26 | OAuth 2.0 | B | — | — | — | Trigger: connectors signed in by the broker (`platform-expansion.md` §2.2, "Keys and tokens ... never in backups") | — | 25, 27 |
| 27 | OpenID Connect | B | — | — | — | Trigger: Phase 7 SSO (`production-readiness.md` "SSO; SAML; SCIM" row) | — | 26 |
| 28 | Session Fixation | B | — | — | — | Trigger: Phase 7 sessions (`production-readiness.md` §4) | — | 24 |
| 29 | MFA | B | — | — | — | Trigger: Phase 7 19.1 (`docs/PLAN_STATUS.md:1052`) | — | 27 |
| 30 | Brute Force Protection | A | Low | Partly covered | 256-bit tokens; per-device limiter after auth (`server/index.mjs:207`) | failed attempts are not throttled (`:198` answers before the limiter); legacy `APP_TOKEN` minimum is 16 characters with no entropy check (`:255`) | S7 (S): per-address failed-auth limiter and a test; gate: `server` suite | I5, 31 |
| 31 | Account Enumeration | B | — | — | — | Trigger: Phase 7 accounts (`production-readiness.md` "Accounts and access"). Today one 401 text for missing, wrong or withdrawn tokens (`server/index.mjs:198`) | — | 30 |
| 32 | Timing Attacks | A | Low | Already covered | `server/tokens.mjs:46-50` `timingSafeEqual` on equal-length digests, no early exit | none found | none; gate: `server` suite | 21 |
| 33 | File Upload Validation | A | Medium | Partly covered | section 3; `tests/filekind.test.js`, `tests/zip-guard.test.js` (bomb, zip64, overlap, ratio, entries) | OM PDF, OCR re-pick, CoStar PDFs, rent roll PDF, template and JSON readers trust name or MIME and read unbounded; no PDF page cap in `app/pdftext.js:50`; photos and audio unbounded | S3 (M): route each through `checkUpload` and `LIMITS`, page cap; gate: unit tests per reader plus `om-flow`, `rrpdf-flow` | 12, 130, 167 |
| 34 | Webhook Signature Verification | B | — | — | — | Trigger: 3.6 outbound webhooks (`docs/PLAN_STATUS.md:1058`) | — | 115 |
| 35 | TLS Certificate Expiry | B | — | — | — | Trigger: AI server deployment and a custom domain (`docs/PLAN_STATUS.md` "a deployed server"; `production-readiness.md` §6 decision 6). github.io certificates are GitHub's | — | 36, 116 |
| 36 | HSTS | A | Low | Unverified | app refuses a non-HTTPS AI server (`app/ai.js:66`) | Pages "Enforce HTTPS" and github.io preload status not checked (API refused; no live probe) | owner checks the Pages setting; record in hosting proposal (S, docs); gate: none | 11, 35 |
| 37 | Encryption at Rest | A | Low | Missing | `README.md` says browser data is unencrypted; backups are plain JSON (`app/backup.js`), with a warning (`app/backupui.js:83`) | a lost laptop or copied backup exposes every deal; device encryption is the broker's (F10) | F9 backup password (M, data-format change already approved in principle, `docs/PLAN_STATUS.md:281`); F10 one-page plan (S); gate: `backup.test.js` with an old-backup fixture | 17, 150, 19.2 (`PLAN_STATUS.md:1060`) |
| 38 | Dependency Vulnerabilities | A | Medium | Partly covered | `test.yml:40-41` `npm audit` both lockfiles; osv-scanner both lockfiles; `tests/workflow-pins.test.js` "CI audits ..."; `npm audit` today: 0 and 0 | vendored files (`vendor/`: pdf.js, ExcelJS, fflate, pdf-lib, tesseract) are outside every scanner; Dependabot covers actions only; Python test deps not scanned | S8 (S): a dated advisory check per vendor version in `THIRD_PARTY.md`, Dependabot for npm (both directories); gate: `security-scan` | 39, 196 |
| 39 | Supply Chain Attacks | A | Medium | Partly covered | actions SHA-pinned (`tests/workflow-pins.test.js`); tools checksum-verified (`tests/ci-scanners.test.js`); zizmor `--require-hashes`; vendor SHA-256 in `THIRD_PARTY.md` | only pdf-lib's checksum is tested (`tests/repo.test.js:108-118`); `pip install` without hashes (`test.yml:63`); Playwright outside the lockfile (`:67`); `npm ci` runs install scripts | S8 (S): test every vendor checksum, hashed pip requirements, `--ignore-scripts` where safe; gate: `npm test`, zizmor | 38, 196, 197 |
| 40 | Threat Modeling | A | Low | Partly covered | `docs/security-checklist.md` (boundaries, 34 checks); `dev-tools-and-reuse.md` §4; this document | no per-feature note for the newest surfaces (comp importer 4.7.91, Convert, Documents hub, lease abstracts) | add a boundary line per new importer to each feature's proposal (S, docs); gate: review | 33 |
| 41 | Indexes | B | — | — | — | Trigger: Phase 7 backend ("Migrations that don't lock the table; indexes; connection pooling", tier B, `production-readiness.md` Data and schema) | — | 45 |
| 42 | EXPLAIN ANALYZE | B | — | — | — | Trigger: Phase 7 backend query design (`production-readiness.md` §4); no SQL engine chosen | — | 41 |
| 43 | N+1 Queries | B | — | — | — | Trigger: Phase 7 backend and 3.6 REST API (`docs/PLAN_STATUS.md:1058`) | — | 41 |
| 44 | Full Table Scans | B | — | — | — | Trigger: Phase 7 backend; locally every list loads all records by design (`production-readiness.md` "Pagination on page 400") | — | 61 |
| 45 | Connection Pooling | B | — | — | — | Trigger: Phase 7 backend (`production-readiness.md` Data and schema row, tier B) | — | 41 |
| 46 | Database Migrations | A | Medium | Already covered | `app/migrate.js` chain; old-backup fixtures `tests/tools/make-backup-4.7.{3,20,27,33}.mjs`; `tests/migrate.test.js`; `migrate-flow` | none found locally | none; gate: `npm test`, golden | 47, 129 |
| 47 | Down Migrations | A | Low | Partly covered | forward-only by design; older code refuses newer deals (`app/backup.js:116-119` `tooNew`; `tests/backup.test.js` "a newer version ... is refused") | rolling back a release after a schema step strands migrated deals until the newer code returns (refused, not corrupted) | runbook line with ID 185 (S); Phase 7 "tested way back" (`production-readiness.md` §4); gate: existing tests | 185 |
| 48 | Transactions | A | Low | Partly covered | IndexedDB transactions per operation (`app/store.js:667-669` deal plus trash in one) | a restore is many separate writes (`app/backupui.js:150-171`); a failure part way leaves a mixed device state (the toast says so; overwritten deals were snapshotted) | S5 (M): stage and validate the whole backup before the first write; gate: unit test with a write failing mid-restore | 49, 70 |
| 49 | ACID | A | Low | Partly covered | IndexedDB per-operation transactions (`app/store.js:667-669`); restore loop `app/backupui.js:150-171` | atomicity of a whole restore is not guaranteed; single-record writes are | with 48 (S5); gate: as 48 | 48 |
| 50 | Isolation Levels | C | — | — | — | IndexedDB transactions are scheduled by the browser with no configurable isolation; one user per device | — | 90 |
| 51 | Deadlocks | C | — | — | — | IndexedDB queues transactions rather than waiting on locks; the server takes no locks | — | — |
| 52 | Optimistic Locking | A | Low | Unverified | no `BroadcastChannel` or `storage` listener in `app/` (grep) | two tabs editing one deal may silently keep the last save; `saveDeal` (`app/store.js:295`) was not read for a version check | S (S): unit test of two saves from stale copies; then decide; gate: `npm test` | 90 |
| 53 | Pessimistic Locking | C | — | — | — | no shared records between users or servers; one device | — | — |
| 54 | Normalization | C | — | — | — | deals are stored as whole documents by design (`docs/architecture/`), no relational store to normalise | — | — |
| 55 | Denormalization | C | — | — | — | as 54; derived figures are recomputed by the one engine, not stored copies | — | — |
| 56 | Foreign Keys | C | — | — | — | no relational store; links such as a contact's `dealIds` are checked in code where used (`app/ai.js:38-40`) | — | 58 |
| 57 | Unique Constraints | C | — | — | — | IndexedDB key paths enforce unique ids; duplicate business records are a Data QC concern, not a schema constraint | — | 60 |
| 58 | Cascading Deletes | A | Low | Partly covered | deleting a deal deletes its photos and audio, kept 30 days in trash (`app/store.js:667-669`; `docs/PLAN_STATUS.md:1065-1066`) | whether history and snapshots of a deleted deal are removed or kept was not traced (retention) | read and test (S); gate: `npm test` | 59, 234 |
| 59 | Soft Deletes | A | Low | Partly covered | media trash 30 days (`app/store.js`); deal delete has Undo only | a deleted deal is gone after the toast; F8 "Recently deleted" approved, not built (`docs/PLAN_STATUS.md:280`) | F8 (M, retention change already approved); gate: unit and flow tests | 58 |
| 60 | UUIDs vs Auto-Increment | A | Low | Partly covered | deal ids `d` + time + 4 base-36 random characters (`app/dealui.js:120`); snapshot and history ids alike (`app/store.js:389`, `app/history.js:302`) | merge restore matches by id (`app/backup.js` `planRestore`), so a collision between two devices would overwrite a different deal (a snapshot is kept); `Math.random` is not a CSPRNG | new ids from `crypto.randomUUID()` (S; old ids unchanged, so no data-format change); gate: `npm test` | 83 |
| 61 | Cursor-Based Pagination | B | — | — | — | Trigger: 3.6 REST API (`docs/PLAN_STATUS.md:1058`) | — | 44 |
| 62 | Full-Text Search | B | — | — | — | Trigger: search over every document's text (`docs/PLAN_STATUS.md:1030`, unchecked); today the command palette matches in memory (`app/command.js`) | — | 222 |
| 63 | Read Replicas | C | — | — | — | no server database; the planned backend is for one firm's workspaces | — | — |
| 64 | Replication Lag | C | — | — | — | no replicated database; IndexedDB lives on one device | — | — |
| 65 | Sharding | C | — | — | — | no server database to shard; data is per device | — | — |
| 66 | Partitioning | C | — | — | — | no server database to partition; data is per device | — | — |
| 67 | Hot Partitions | C | — | — | — | no partitioned store | — | — |
| 68 | Postgres VACUUM | C | — | — | — | no Postgres; the only store is browser IndexedDB | — | — |
| 69 | Materialized Views | C | — | — | — | no SQL store; figures are computed by the engine on demand | — | — |
| 70 | Backups | A | Medium | Partly covered | manual backup and restore (`app/backup.js`, `tests/backup.test.js`, `backup-flow`); 30-day reminder (`app/home.js:95`); `navigator.storage.persist` offered (`app/store.js:714`) | the device is the only copy until the broker backs up; browser eviction or a lost device loses everything since the last backup | F10 plan (S, docs); remote backup is Phase 7 (`docs/PLAN_STATUS.md:1052`); gate: existing tests | 71, 150, 151 |
| 71 | Testing Your Restores | A | Low | Already covered | `tests/backup.test.js` round trip and old versions; `tests/tools/make-backup-4.7.*.mjs`; `limits-flow` restore checks | browser flows not run today | none; gate: `npm test`, `backup-flow` | 70 |
| 72 | Point-in-Time Recovery | A | Low | Partly covered | per-deal history, last 1,000 changes (`limits-flow`), snapshots (`snapshot-flow`), automatic snapshot before a restore overwrites (`app/backupui.js:155-156`) | no whole-device point in time; comps and settings have no history | none now; Phase 7 remote backup; gate: existing | 70 |
| 73 | Change Data Capture | C | — | — | — | no database to capture from and no consumers | — | — |
| 74 | Outbox Pattern | B | — | — | — | Trigger: "A local queue with conflict-safe sync (needs Phase 7)" (`docs/PLAN_STATUS.md:1036`) | — | 109 |
| 75 | ORM Lazy Loading | C | — | — | — | no ORM; `app/store.js` calls IndexedDB directly | — | — |
| 76 | CAP Theorem | B | — | — | — | Trigger: cross-device sync (`docs/PLAN_STATUS.md:1036,1052`) | — | 77, 78 |
| 77 | Eventual Consistency | B | — | — | — | Trigger: cross-device sync (`docs/PLAN_STATUS.md:1036`) | — | 76 |
| 78 | Strong Consistency | B | — | — | — | Trigger: cross-device sync (`docs/PLAN_STATUS.md:1036`) | — | 76 |
| 79 | Raft Consensus | C | — | — | — | no cluster; the planned backend is not a replicated store | — | — |
| 80 | Leader Election | C | — | — | — | no cluster of servers; one optional AI server process | — | — |
| 81 | Split Brain | C | — | — | — | no replicated nodes; two devices diverging is handled at restore (see 83) | — | 83 |
| 82 | Quorums | C | — | — | — | no replicated nodes that would need a quorum | — | — |
| 83 | Clock Skew | A | Low | Partly covered | merge restore keeps the newer `updatedAt` (`app/backup.js:230`, `tests/backup.test.js` "merge: newer wins"); server budget days are UTC (`limits.test.mjs` 9e) | a device whose clock runs ahead wins a merge with an older edit; the overwritten copy is snapshotted, so it is recoverable | document in the restore sheet; test with skewed stamps (S); gate: `npm test` | 60, 90 |
| 84 | Distributed Locks | C | — | — | — | no distributed workers | — | — |
| 85 | Consistent Hashing | C | — | — | — | no sharded cache or store | — | — |
| 86 | Bloom Filters | C | — | — | — | no membership test at a scale that needs one | — | — |
| 87 | Two-Phase Commit | C | — | — | — | no multi-store distributed writes | — | — |
| 88 | CQRS | C | — | — | — | one local store; no separate read model | — | — |
| 89 | Event Sourcing | C | — | — | — | the per-deal history is an audit trail, not the source of state | — | 234 |
| 90 | Race Conditions | A | Low | Partly covered | lost-edit fix (#25), saves tied to their deal (`app/dealui.js:299`), route guard (`app/ui.js:104-107`), parallel spend holds (`limits.test.mjs` 6d, 9a) | two tabs (see 52) | with 52 (S); gate: `npm test`, `lostedit-flow` | 52 |
| 91 | Backpressure | A | Low | Partly covered | PDFs parsed two at a time (`app/ui.js:768-776`); server body cap 40 MB | the server has no concurrency cap: many parallel 40 MB bodies from one token holder can exhaust memory | S7 (S): in-flight cap per server, 503 when full; gate: `server` suite | 92, 130 |
| 92 | Load Shedding | A | Low | Partly covered | rate limit and daily caps (`server/budget.mjs`; `limits.test.mjs` 3, 6-6c) | no shedding by concurrency (see 91) | with 91 in S7 (S); gate: `server` suite | 91 |
| 93 | Bulkheads | A | Low | Partly covered | parsing in workers (`app/convert-worker.js`, `app/pdfpages-worker.js`, `app/projector-worker.js`); projector falls back to the page (`app/projector.js:101`) | one failed start-up module stops the whole app today; branch `claude/load-error-recovery` isolates start-up steps | land `claude/load-error-recovery` (M, already built); gate: its `loaderror-flow` | 96 |
| 94 | Jitter | C | — | — | — | the app never retries automatically (`app/ai.js` one fetch per tap); no scheduled jobs | — | 95 |
| 95 | Retry Storms | A | Low | Unverified | `server/ai.mjs:318-327` sets no `maxRetries` | the SDK's default retry count and backoff were not checked, so retries per tap are unknown | S7 (S): set `maxRetries` explicitly with a test; gate: `server` suite | 94 |
| 96 | Cascading Failures | A | Medium | Partly covered | load-error screens (`index.html:300-324`) | one module failing to load (a blocker extension, a 404) stops the app; in progress on `claude/load-error-recovery` (`a8ac2d6`) | finish `claude/load-error-recovery` (M, already built, not a new PR); gate: `loaderror-flow`, `tests/served-names.test.js` | 93, 160 |
| 97 | Thundering Herd | C | — | — | — | no shared backend that many clients hit at once; static files come from GitHub's CDN | — | — |
| 98 | Cache Invalidation | A | Low | Partly covered | versioned cache, old caches deleted (`sw.js:178-183`); `tests/repo.test.js` "named for this release" | runtime writes put new-release files in the old cache and the 3.5 s timeout can mix releases (section 6, residual 1) | S6 (M): runtime writes only to a cache named for the response's release, or no runtime writes; gate: `pwa-flow` plus a new slow-network update flow | D3 |
| 99 | Cache Hit Ratio | C | — | — | — | no server cache to tune; the service worker install set is all or nothing | — | 101 |
| 100 | TTLs | A | Low | Already covered | research briefs expire (`app/backup.js` briefs; `tests/backup.test.js` "tampered retainUntil of 9e15"); media trash 30 days | the OCR cache never expires (by design, versioned) | none; gate: `npm test` | 59 |
| 101 | Cache Warming | A | Low | Already covered | install caches every asset (`sw.js:170-176`); `pwa-flow` "the app cache is named for this version and filled" | not run today | none; gate: `pwa-flow` | 98 |
| 102 | Write-Through vs Write-Back | A | Low | Already covered | saves are debounced and flushed (`app/dealui.js:299`); `lostedit-flow` in the CI subset (`test.yml:77`) | not run today | none; gate: `lostedit-flow` | 227 |
| 103 | Redis Eviction Policies | C | — | — | — | no Redis; browser storage eviction is covered under 70 | — | 70 |
| 104 | CDNs | A | Low | Partly covered | install bypasses the HTTP cache (`cache: 'reload'`, `sw.js:171-174`), as the CDN keeps a file about ten minutes | the CDN behaviour is stated in a code comment, not verified | none (hosting); gate: `pwa-flow` | 105 |
| 105 | Cache-Control Headers | A | Low | Unverified | server sends `no-store` (`server/index.mjs:66`) | Pages' `Cache-Control` not fetched (no live probing) | S7 adds a server header test (S); gate: `server` suite | 11, 104 |
| 106 | ETags | C | — | — | — | the app does not rely on conditional requests; the service worker refetches with `cache: 'reload'` | — | 104 |
| 107 | Dead Letter Queues | C | — | — | — | no message queue; work is in-page or in dedicated workers | — | — |
| 108 | Poison Messages | A | Low | Unverified | restore stores deals with no per-deal shape check (`app/backupui.js:153-163`) | whether one malformed stored deal can stop Home or the deal list from rendering was not tested | S5 (S): unit and flow test with a malformed deal record; gate: `npm test`, `home-flow` | 226, 96 |
| 109 | At-Least-Once Delivery | B | — | — | — | Trigger: the sync queue (`docs/PLAN_STATUS.md:1036`) | — | 74 |
| 110 | Exactly-Once Semantics | B | — | — | — | Trigger: idempotency keys, Phase 7 19.2 (`production-readiness.md` "Idempotency keys; four submit clicks", A/B) | — | 74 |
| 111 | Message Ordering | B | — | — | — | Trigger: the sync queue (`docs/PLAN_STATUS.md:1036`) | — | 74 |
| 112 | Kafka Consumer Groups | C | — | — | — | no Kafka or stream platform | — | — |
| 113 | Partition Keys | C | — | — | — | no partitioned stream or store | — | — |
| 114 | Background Jobs | A | Low | Partly covered | workers with a watchdog (`app/pdfpages.js` `WATCHDOG_MS`); trash purge at start (`app/store.js`) | the OM, CoStar and rent roll PDF reads run the pdf.js API from the page with no cancel | with S3 (S): an abort per read; gate: unit tests | 222 |
| 115 | Webhook Retries | B | — | — | — | Trigger: 3.6 outbound webhooks (`docs/PLAN_STATUS.md:1058`) | — | 34 |
| 116 | DNS | B | — | — | — | Trigger: a custom domain (`production-readiness.md` §6 decision 6, D1); a dangling record would then allow takeover | — | 35, 117 |
| 117 | DNS Propagation | B | — | — | — | Trigger: as 116 | — | 116 |
| 118 | HTTP Status Codes | A | Low | Already covered | `server/index.mjs:193-244` (400, 401, 403, 413, 422, 429, 502, 503); `server.test.mjs` "bad requests and oversized bodies", "upstream failures"; service worker 503 offline (`sw.js:212`) | none found | none; gate: `server` suite | 119 |
| 119 | HTTP Method Semantics | A | Low | Partly covered | GET health, POST actions, OPTIONS preflight (`server/index.mjs:194,202`); service worker handles GET only (`sw.js:231`) | no test that a GET to a POST route is refused | S7 (S): method test; gate: `server` suite | 118 |
| 120 | Keep-Alive | C | — | — | — | Node defaults on an undeployed server; the static host is GitHub's | — | 143 |
| 121 | HTTP/2 | C | — | — | — | protocol is the host's (Pages) or the operator's proxy; no app dependency | — | — |
| 122 | WebSockets | C | — | — | — | none in app or server (grep `WebSocket`: none) | — | — |
| 123 | Server-Sent Events | C | — | — | — | none; AI replies are single JSON responses | — | 246 |
| 124 | Long Polling | C | — | — | — | no long polling; each AI call is one request and one reply | — | — |
| 125 | gRPC | C | — | — | — | no gRPC; the AI server speaks JSON over HTTPS | — | — |
| 126 | Protocol Buffers | C | — | — | — | no Protocol Buffers; JSON only, app and server | — | — |
| 127 | API Versioning | A | Low | Partly covered | data formats carry versions (`app/backup.js` `version`, `app/store.js:737` project version, deal schema in `app/migrate.js`) | `/api/*` paths are unversioned; app and server deploy separately, so a newer app can call an older server | S7 (S): `/api/health` reports an API version and the app checks it; gate: `server` suite, `ai-flow` | 205 |
| 128 | OpenAPI Specs | A | Low | Partly covered | routes in `server/README.md`; JSON Schemas for model output (`server/ai.mjs`) | request shapes are not machine-checked; no new tool proposed | covered by 205 (S); gate: contract test | 205 |
| 129 | Backward Compatibility | A | Medium | Already covered | migrations and old-backup fixtures (46); `tests/analyze-golden.test.js` 618 and golden 646 (run today: identical) | none found | none; gate: `npm test`, `check:quick` | 46 |
| 130 | Request Size Limits | A | Low | Partly covered | server 40 MB (`server/index.mjs:51,76`); app `MAX_SEND` 28 MB (`app/aiui.js:18`); `LIMITS` in `app/filekind.js:8` | the readers in 33 are unbounded | S3 (M); gate: as 33 | 33, 91 |
| 131 | Compression | A | Low | Already covered | zip decompression bounded by declared size, ratio and entry caps and checked while inflating (`app/filekind.js` `safeUnzip`; `tests/zip-guard.test.js` 15 cases) | backups are not compressed (size only) | none; gate: `npm test` | 33 |
| 132 | Latency vs Throughput | A | Low | Already covered | perf budget 150 ms per edit (`perf-flow`); 500-lease roll (`bigroll-flow`) | not run today | none; gate: `check:full` | 165 |
| 133 | Egress Fees | C | — | — | — | Pages bandwidth is not billed to the owner; AI spend is covered under 201 | — | 201 |
| 134 | VPCs | C | — | — | — | no cloud network; server host not chosen | — | — |
| 135 | Subnets | C | — | — | — | no cloud network; server host not chosen (as 134) | — | — |
| 136 | NAT Gateways | C | — | — | — | no cloud network; server host not chosen (as 134) | — | — |
| 137 | Firewalls | B | — | — | — | Trigger: AI server deployment ("F12 ... before any AI server deployment", `docs/PLAN_STATUS.md:285`; `server/README.md`) | — | 142 |
| 138 | Security Groups | C | — | — | — | no cloud network or security groups; host not chosen | — | 137 |
| 139 | Service Mesh | C | — | — | — | one server process; no services to mesh together | — | — |
| 140 | Ingress Controllers | C | — | — | — | no Kubernetes or ingress; static hosting on Pages | — | — |
| 141 | Health Checks | A | Low | Already covered | `/api/health` behind the token (`server/index.mjs:202-203`); `server.test.mjs` "health says what is configured and never the key" | none found | none; gate: `server` suite | 142 |
| 142 | Liveness vs Readiness Probes | B | — | — | — | Trigger: AI server deployment behind a platform that probes (`docs/PLAN_STATUS.md:285`) | — | 141 |
| 143 | Graceful Shutdown | A | Low | Missing | `server/index.mjs:261-267`: SIGHUP and `unhandledRejection` handled, no SIGTERM | a restart drops calls in flight; counters reset on restart (documented, `limits.test.mjs` 7) | S7 (S): SIGTERM closes the listener and waits for in-flight calls; gate: `server` suite | 144, 145 |
| 144 | Connection Draining | B | — | — | — | Trigger: AI server deployment (`docs/PLAN_STATUS.md:285`) | — | 143 |
| 145 | Stateless Services | A | Low | Partly covered | no session state; budget and rate counters in memory (`server/budget.mjs`) | a restart resets the daily caps (documented, `limits.test.mjs` 7); two instances would each allow the full cap | document "one instance" in `server/README.md` (S); gate: none | 201 |
| 146 | Failover | C | — | — | — | one optional server; the app works offline without it | — | 160 |
| 147 | Multi-Region | C | — | — | — | no hosted backend; the app runs on each device | — | — |
| 148 | Availability Zones | C | — | — | — | no hosted backend; the app runs on each device | — | — |
| 149 | Single Points of Failure | A | Low | Partly covered | `production-readiness.md` §5 (bus factor of one; data on one device) | GitHub account, repo and Pages under one person; data on one device | owner decision 6 in that proposal (company ownership); gate: none | 150 |
| 150 | Disaster Recovery | A | Low | Missing | F10 not written (`docs/PLAN_STATUS.md:283`) | no written path for a lost device, repo, account or host | F10 (S, docs); gate: review | 70, 151 |
| 151 | RTO & RPO | A | Low | Missing | none written; backup reminder at 30 days (`app/home.js:95`) | the broker's data-loss window is "since the last backup" (reminder at 30 days, `app/home.js:95`) but this is not written down | in F10 (S); gate: review | 150 |
| 152 | SLAs | B | — | — | — | Trigger: hosting for customers ("a support window in the contract", `production-readiness.md` §5) | — | 156 |
| 153 | SLOs | C | — | — | — | no hosted service to measure | — | 152 |
| 154 | Error Budgets | C | — | — | — | no SLO exists to spend an error budget against | — | 153 |
| 155 | Incident Response | A | Low | Missing | `SECURITY.md` is the unedited GitHub template with a made-up version table (5.1.x, 4.0.x) | a reporter of a vulnerability in a public repo has no route; private vulnerability reporting UNVERIFIED | docs PR (S): real policy and route; gate: review | 157, 158 |
| 156 | On-Call | B | — | — | — | Trigger: hosting ("No on-call ... before hosting", `production-readiness.md` §5) | — | 152 |
| 157 | Runbooks | A | Low | Partly covered | `server/README.md` setup, health, tokens | no runbook for a leaked token or provider key, a bad release or a deploy rollback | docs (S) with F10; gate: review | 19, 185 |
| 158 | Postmortems | A | Low | Partly covered | root causes in `CHANGELOG.md` (for example 4.7.76) and proposals; `.claude/skills/retro` | no template for a security incident | docs (S) in `SECURITY.md`; gate: review | 155 |
| 159 | Chaos Engineering | C | — | — | — | no distributed service; error paths are tested directly (212) | — | 212 |
| 160 | Graceful Degradation | A | Low | Partly covered | offline (`pwa-flow`); AI off by default; OCR fetched on demand with a message offline (`sw.js` header); load-error screens (`index.html:300-324`) | a failed module stops the app (96) | with 96 (M, same branch); gate: `pwa-flow`, `loaderror-flow` | 96 |
| 161 | Autoscaling | C | — | — | — | no hosted backend to scale; Pages serves static files | — | — |
| 162 | Horizontal vs Vertical Scaling | C | — | — | — | no hosted backend to scale; Pages serves static files | — | — |
| 163 | Cold Starts | C | — | — | — | the server is a long-running process; app start-up is covered under 96 and 132 | — | — |
| 164 | Capacity Planning | A | Low | Partly covered | storage estimate shown (`app/store.js:707-708`); caps: 200 briefs, `MAX_SCRATCH`, 1,000 history entries | no 1,000-deal test (`production-readiness.md` "Pagination on page 400") | Phase 8 perf (S); gate: `perf-flow` | 165 |
| 165 | Load Testing | A | Low | Partly covered | `perf-flow`, `bigroll-flow`, `tests/tools/analyze-bench.mjs` | the server is not load-tested | before deployment (S); gate: none | 164 |
| 166 | Memory Leaks | A | Low | Partly covered | object URLs revoked for photos (`app/dealui.js:558`) and downloads (`app/kit.js:338`) | the voice-note audio URL in `app/aiui.js:357` is never revoked; no leak test | S (S): revoke on close, unit check; gate: `voice-flow` | 167 |
| 167 | OOM Killer | A | Low | Partly covered | `LIMITS` and the zip guard bound most reads | unbounded PDF reads (33) can exhaust a phone tab; server memory under parallel 40 MB bodies (91) | S3 and S7; gate: as those | 33, 91 |
| 168 | Structured Logging | A | Low | Partly covered | one line per failure: time, path, status, error name, device (`server/index.mjs:243`); `injection.test.mjs` 11 "logs hold no token, body ..." | not machine-structured (plain text) | none now (DiD); gate: `server` suite | 169 |
| 169 | Log Levels | A | Defense-in-depth | Partly covered | `console.error`, `warn`, `log` used consistently in `server/index.mjs` | no level switch | none now; gate: none | 168 |
| 170 | Log Rotation | B | — | — | — | Trigger: AI server deployment (stdout handled by the host, `docs/PLAN_STATUS.md:285`) | — | 168 |
| 171 | Distributed Tracing | C | — | — | — | one server; no telemetry by design (`THIRD_PARTY.md`: the page makes no outbound request) | — | 173 |
| 172 | OpenTelemetry | C | — | — | — | no telemetry by design, as 171; no tracing collector | — | — |
| 173 | Correlation IDs | A | Defense-in-depth | Missing | error replies carry a code, not a request id (`server/index.mjs:235-244`) | a broker's error cannot be matched to a server log line without content | S7 (S): random request id in the reply and the log line; gate: `server` suite (log stays content-free) | 168 |
| 174 | Metrics Cardinality | C | — | — | — | no metrics pipeline or time-series store in the system | — | — |
| 175 | p99 Latency | B | — | — | — | Trigger: "Monitoring and alerts for servers only" (`production-readiness.md` §4) | — | 176 |
| 176 | Alert Fatigue | B | — | — | — | Trigger: as 175 | — | 175 |
| 177 | Error Tracking | A | Low | Partly covered | browser flows fail on console errors and page errors (`tests/e2e/lib.mjs:29-30`) | no field error reporting, by the no-telemetry rule | none (by design); gate: browser suite | 223 |
| 178 | Profiling | C | — | — | — | performance is gated by the 150 ms budget (132); profiling is ad hoc in DevTools | — | 132 |
| 179 | Flame Graphs | C | — | — | — | as 178: the 150 ms budget is the performance gate | — | 178 |
| 180 | Infrastructure as Code | C | — | — | — | no infrastructure beyond GitHub Pages and Actions, both configured in the repo or in settings | — | 182 |
| 181 | Terraform State | C | — | — | — | no Terraform; no infrastructure is provisioned by code | — | — |
| 182 | GitOps | A | Medium | Partly covered | Pages deploys `main` as is (`tests/repo.test.js` "GitHub Pages serves the site as is") | with no branch protection (198) any push to `main` deploys straight to every installed copy | D5 (owner setting, S); gate: GitHub settings | 198, 185 |
| 183 | Blue-Green Deployments | C | — | — | — | a static Pages deploy replaces files at once; installed copies switch per device through the service worker | — | 98 |
| 184 | Canary Releases | C | — | — | — | no traffic splitting on Pages | — | — |
| 185 | Rollbacks | A | Low | Partly covered | a revert commit redeploys; older code refuses newer deals rather than misreading them (47) | no written rollback steps; a release with a schema step cannot be rolled back without stranding migrated deals | runbook (S, docs) with 157; gate: review | 47, 157 |
| 186 | Feature Flags | A | Low | Already covered | the New look setting (`index.html:27`, `app/look.js`); AI off unless enabled (`app/ai.js:15`) | not security-relevant beyond AI opt-in | none; gate: `ui-d1-flow`, `ai-flow` | — |
| 187 | Environment Parity | A | Low | Partly covered | CI and local both use Chromium; TZ runs (`test.yml:23`) | Safari, WebKit and Firefox not tested; a real iPhone not used (`docs/PLAN_STATUS.md` Phase 8) | none here (owner's hand test); gate: none | 204 |
| 188 | Staging Environments | B | — | — | — | Trigger: hosting proposal ("Staging that matches production", `production-readiness.md` §4; `docs/PLAN_STATUS.md:1074`) | — | 187 |
| 189 | 12-Factor Apps | A | Low | Already covered | server config from environment only (`server/index.mjs:40-52`), startup refuses missing or weak config (`:254-257`, `limits.test.mjs` 8) | none found | none; gate: `server` suite | 145 |
| 190 | Multi-Stage Builds | C | — | — | — | no container image or build step | — | — |
| 191 | Non-Root Containers | C | — | — | — | no container image; run-as guidance for the server is under 15 | — | 15 |
| 192 | Image Scanning | C | — | — | — | no container image is built or published by the repo | — | — |
| 193 | Resource Requests & Limits | C | — | — | — | no Kubernetes; the server is a plain Node process | — | — |
| 194 | Pod Disruption Budgets | C | — | — | — | no Kubernetes; the server is a plain Node process | — | — |
| 195 | Semantic Versioning | A | Low | Already covered | version in `package.json`, `package-lock.json`, `app/exporters.js`, `sw.js` checked together (`tests/repo.test.js` "named for this release"); `npm run bump` | none found | none; gate: `npm test` | 98 |
| 196 | Lockfiles | A | Low | Partly covered | `package-lock.json`, `server/package-lock.json`; `npm ci` in CI (`test.yml:21,24`) | Playwright installed outside the lockfile (`test.yml:67`); Python test deps pinned but not hashed | S8 (S); gate: zizmor, `npm test` | 39 |
| 197 | Reproducible Builds | A | Low | Partly covered | no build step; vendor files compared byte for byte and listed with SHA-256 (`THIRD_PARTY.md`) | only pdf-lib's checksum is enforced by a test | S8 (S): test every listed checksum; gate: `npm test` | 39 |
| 198 | Branch Protection | A | Medium | Missing | REST API: `Branch not protected`; rulesets `[]` (2026-11-04) | anyone with push rights, or a leaked token, can put code on `main`, which deploys at once; CI is not required to pass | D5 (S): owner turns on protection with required checks; gate: GitHub settings | 182, 231 |
| 199 | Public S3 Buckets | C | — | — | — | no object storage; the repository is public by the owner's choice and holds invented fixtures only | — | 233 |
| 200 | Presigned URLs | C | — | — | — | no object storage; downloads are local blobs (`app/kit.js`) | — | — |
| 201 | Cloud Billing Alerts | A | Low | Partly covered | per-device and server daily spend caps in whole cents (`server/budget.mjs`; `limits.test.mjs` 5-9h) | caps are placeholders until the owner sets them (`server/index.mjs:21`); provider-side alerts UNVERIFIED | owner sets caps at deployment (S, config); gate: `server` suite | 145 |
| 202 | Unit Tests | A | Low | Already covered | `npm test` 1,149 pass (run today) | none | none; gate: `npm test` | 208 |
| 203 | Integration Tests | A | Low | Already covered | `server` suite 59 pass (run today) with a mock provider (`server/test/mockkit.mjs`) | no live provider run | none; gate: `server` suite | 207 |
| 204 | End-to-End Tests | A | Low | Partly covered | 60+ flows in `tests/e2e/`; CI runs four (`test.yml:77`) | the full suite runs only on a developer machine (`check:full`); not run today (no browsers installed) | none here; gate: `check:full` | 187 |
| 205 | Contract Testing | A | Low | Missing | app tests mock `fetch`; server tests send their own bodies | the app's request shapes (`app/ai.js:91-97`) and the server's expectations are not checked against each other | S7 (S): one shared fixture used by both suites; gate: `npm test`, `server` suite | 127, 128 |
| 206 | Flaky Tests | A | Low | Partly covered | known `rename-flow` flake (`docs/NOW.md`); slot locking (`tests/e2e/run.sh`) | flake recorded, not fixed | track and fix the flake (S); never skip (rule); gate: `check:full` | 204 |
| 207 | Mocking | A | Low | Already covered | `server/test/mockkit.mjs`; stand-in speech service (`voice-flow`) | none | none; gate: `server` suite | 203 |
| 208 | Regression Tests | A | Low | Already covered | "fails on the old code" rule (`CLAUDE.md`); golden 618 and 646 (run today) | none | none; gate: `npm test`, `check:quick` | 129 |
| 209 | Smoke Tests | A | Low | Partly covered | `shell-flow`, `pwa-flow` | no smoke check of the deployed site (would be live probing: the owner's call) | none now; gate: browser suite | 204 |
| 210 | Property-Based Testing | A | Low | Already covered | `tests/properties.test.js` (seed 20261022), fast-check in `abstracts`, `dd`, `engine-shared` tests | none | none; gate: `npm test` | 211 |
| 211 | Fuzzing | A | Low | Partly covered | property runs over the CSV, paste and text decoders | `safeUnzip`, `readBackup`, `readProject` and `sniff` are not fuzzed | S (S): seeded fast-check runs, bounded size; gate: `npm test` | 33, 226 |
| 212 | Error Handling | A | Medium | Partly covered | `errors-flow`; plain errors from the server (`server.test.mjs`); reader messages name the next step | start-up failure handling in progress (96) | finish `claude/load-error-recovery` (M, already built); gate: `loaderror-flow` | 96, 223 |
| 213 | Edge Cases | A | Low | Already covered | `edgecases-flow`; T-12 and rent roll suites; hostile pack | not run today (browser) | none; gate: `npm test`, browser suite | 214 |
| 214 | Off-by-One Errors | A | Low | Already covered | boundary tests: "exactly 10,000 is not", "exactly 100 MB is not", "201 times is refused, 200 times is not" (`tests/filekind.test.js:65-83`) | none | none; gate: `npm test` | 213 |
| 215 | Floating Point Math | A | Medium | Already covered | one rounding rule `toCents` (`app/engine/money.js`); `tests/money-rounding.test.js`, `tests/properties.test.js` | none found | none; gate: `npm test`, golden | 216 |
| 216 | Storing Money as Floats | A | Medium | Partly covered | stored as dollar numbers rounded to whole cents, by the owner's decision (`production-readiness.md` §6 decision 2); migration rounds once and logs (`app/backupui.js:169`) | values are binary floats; integer cents would be a data-format and golden change (not proposed) | none (owner decision stands); gate: golden, `tests/tools/cents-audit.mjs` | 215 |
| 217 | Time Zones | A | Low | Already covered | `npm run test:tz` in CI (`test.yml:23`); `tests/hostile-tz.test.js` | none found | none; gate: `test:tz` | 218 |
| 218 | Daylight Saving Time | A | Low | Partly covered | dates are calendar days `YYYY-MM-DD` (`app/dateinput.js`); TZ runs | no test names a DST transition day (grep in `tests/hostile-tz.test.js`, `tests/dateinput.test.js`) | S (S): add the US spring and autumn change days to the TZ tests; gate: `test:tz` | 217 |
| 219 | Unicode | A | Low | Already covered | hostile pack (emoji, Arabic, bidi override); `downloadName` strips bidi controls and normalises NFC (`app/kit.js:297-298`, `tests/downloadname.test.js`) | browser part not run today | none; gate: `npm test`, `hostile-flow` | 220 |
| 220 | Character Encoding | A | Low | Already covered | `app/textfile.js` (BOM, UTF-8, Windows-1252 with a note); `tests/text-encoding.test.js`; `encoding-flow` | none | none; gate: `npm test` | 219 |
| 221 | Thread Safety | C | — | — | — | JavaScript runs one thread per realm; workers share no memory (no `SharedArrayBuffer` in `app/`) | — | 222 |
| 222 | Event Loop Blocking | A | Low | Partly covered | heavy work in workers (93); pdf.js parses in its worker | sheet parsing (ExcelJS) and text extraction loops run on the page; no ReDoS check for regexes over file text (security checklist item 8) | S3 adds bounds; a regex review note (S); gate: `perf-flow` | 114, 167 |
| 223 | Unhandled Promise Rejections | A | Low | Partly covered | server logs and survives (`server/index.mjs:261`); browser flows fail on page errors (`tests/e2e/lib.mjs:30`) | the app has no `unhandledrejection` boundary that tells the broker something failed | with 96 (S); gate: `errors-flow` | 212 |
| 224 | Integer Overflow | A | Low | Already covered | zip64 values above 2^32 refused (`app/filekind.js:63`); `tests/zip-guard.test.js` zip64 cases | money far above 2^53 cents is not exercised (not plausible in the domain) | none; gate: `npm test` | 215 |
| 225 | Garbage Collection | C | — | — | — | managed by the JavaScript engine; retention problems are covered under 166 | — | 166 |
| 226 | Schema Validation | A | Medium | Partly covered | server: `json_schema` output and key filter (`server/ai.mjs:84-86,300`); app: format and version checks, kv allow-list (`app/backup.js:112-127`), project docs filtered (`app/store.js:740`) | deals in a backup or project are stored without a shape check; AI field values are normalised but not schema-checked in the app | S5 (M), D4; gate: `npm test` with invented malformed files and every old-backup fixture | 8, 48, 108 |
| 227 | Debouncing | A | Low | Already covered | debounced saves (`app/dealui.js:299`); `typing-flow`, `lostedit-flow` | not run today | none; gate: `lostedit-flow` | 102 |
| 228 | Big O Notation | A | Low | Already covered | the long comps list fix (4.7.90) with the 150 ms budget (`perf-flow`) | not run today | none; gate: `perf-flow` | 132 |
| 229 | Technical Debt | A | Low | Partly covered | F11 split of `app/dealui.js` (3,034 lines) planned (`docs/PLAN_STATUS.md` F11) | large files slow review (250) | F11 inside the UI revamp (L); gate: golden | 250 |
| 230 | Dead Code | A | Defense-in-depth | Missing | no unused-code check | dead paths hide sinks from review | a one-off `tsc` unused-locals report, no new tool (S); gate: type check | 229 |
| 231 | Merge Conflicts | A | Low | Already covered | `npm run sync-main`; changelog fragments (`docs/changelog/unreleased/`) | none | none; gate: `check:quick` | 198 |
| 232 | GDPR | B | — | — | — | Trigger: a non-US customer ("Non-US customers: skip until one signs", `production-readiness.md` §6 decision 7) | — | 233, 235 |
| 233 | PII Handling | A | Medium | Partly covered | contacts and tenant names stay on the device; AI sends need a confirm and refuse confidential deals (`tests/confidential.test.js`); research schema has no personal-attribute fields (`server/ai.mjs:99`); logs hold no content (`injection.test.mjs` 11); invented-fixtures rule | no CI guard against committing `private/` (18); shared-origin storage (17); plain-text backups (37) | S1, D1, F9; gate: `npm test`, hosting proposal | 17, 18, 37 |
| 234 | Audit Logs | A | Low | Partly covered | per-deal change history (`app/history.js`, `history-flow`); AI-applied figures carry source and model (`app/aiui.js:247`) | exports and AI sends are not logged; access audit is Phase 7 (`docs/PLAN_STATUS.md:1064`) | none now; deferred to Phase 7; gate: existing | 58 |
| 235 | Data Residency | A | Low | Partly covered | local-first; the confirm sheet names the server and the provider before a send (`app/aiui.js:136`; `ai-flow` "the send is confirmed first, naming the server") | the provider's region is not stated | add the provider's region once the firm's server is deployed (S, docs); gate: `ai-flow` | 232 |
| 236 | SOC 2 | B | — | — | — | Trigger: hosting customer data ("a pen test before the first customer's data is hosted", `production-readiness.md` §5) | — | 155 |
| 237 | PCI DSS | B | — | — | — | Trigger: payments ("hosted payment pages only", `production-readiness.md` §6 decision 7) | — | 242 |
| 238 | Cookie Consent | C | — | — | — | no cookies (`document.cookie` not used in `app/`), no analytics; `localStorage` holds only settings the broker chose | — | — |
| 239 | Software Licenses | A | Low | Partly covered | `THIRD_PARTY.md`, `vendor/licenses/`, permissive-only rule (`AGENTS.md`); pdf-lib licence tested (`tests/repo.test.js:108-111`) | other vendor files have no test that their licence text is present | S8 (S): one test over every `THIRD_PARTY.md` row; gate: `npm test` | 39, 197 |
| 240 | SPF, DKIM & DMARC | C | — | — | — | the app sends no email; `mailto:` opens the broker's own client | — | — |
| 241 | Email Bounce Handling | C | — | — | — | no email is sent by the app or the server, so none bounce | — | — |
| 242 | Chargebacks | B | — | — | — | UNASSIGNED — future trigger: billing customers (`production-readiness.md` tier C, "only if Zlatura bills customers") | — | 237 |
| 243 | Bot Protection | B | — | — | — | Trigger: Phase 7 accounts and sign-up (`docs/PLAN_STATUS.md:1052`); the AI server is token-gated today | — | 30 |
| 244 | Prompt Injection | A | Medium | Partly covered | section 7: document blocks, data rule (`injection.test.mjs` 9, 10-10e), no tools, key filter, quote check (`tests/ai-injection.test.js`), broker approval | no live-model evaluation; app-side key test uses `in` (8); field labels interpolated into the user turn (`server/ai.mjs:79-80`) | S5 (`Object.hasOwn`); live evaluation when credentials exist (248); gate: `server` suite | 8, 248 |
| 245 | Hallucinated Packages | A | Low | Already covered | exact pins and lockfiles; new libraries are an owner approval gate (`CLAUDE.md`, `AGENTS.md`); `npm ci` refuses a name not in the lockfile | none found | none; gate: `npm ci`, review | 39 |
| 246 | Real-time streaming | C | — | — | — | `server/ai.mjs` uses non-streaming `messages.create`; nothing streams to the app | — | 123 |
| 247 | Context Windows | A | Low | Already covered | token count before a call and job caps (`server/ai.mjs:298-315`; `limits.test.mjs` 5, 5b); a cut-off answer is an error (`server.test.mjs` "a cut-off answer"); research limits | none found | none; gate: `server` suite | 130 |
| 248 | Evals | A | Low | Partly covered | injection set covering every category (`injection.test.mjs` 10e); extraction tests on a mock model | no evaluation against a live model (no credentials, `docs/PLAN_STATUS.md` "Live AI and speech providers" `[!]`) | a seeded eval set to run once credentials exist (M); gate: manual until then | 244, 249 |
| 249 | Model Version Pinning | A | Low | Partly covered | `MODEL` constant (`server/ai.mjs:10`); `res.model` stored on each applied source (`app/aiui.js:247`) | `AI_MODEL` env override and `fallbacks: 'default'` (`server/ai.mjs:321-322`) let another model answer; whether the id is a snapshot is UNVERIFIED; prompts and schemas carry no version | S7 (S): send a prompt and schema version with every reply; record the id policy in `server/README.md`; gate: `server` suite | 248 |
| 250 | Reading the maxed LOC Diff | A | Low | Partly covered | `.claude/skills/review-diff`; the designer reviews each money, parsing or security diff (`CLAUDE.md`) | no size limit per PR; very large files (229) | keep PRs small, as in this series (S, process); gate: review | 229 |

## 13. What was not verified, and why

- **Browser behaviour** (CSP violations, hostile text on screen, service worker update, offline, axe, perf): no
  Playwright browsers in this container; nothing in this document is from a browser run today.
- **Deployed headers, Pages HTTPS enforcement, custom domain, HSTS preload**: the Pages API was refused by the session
  proxy, and the security checklist forbids probing the live site.
- **GitHub settings** beyond the REST calls listed in section 1: secret scanning and push protection, private
  vulnerability reporting, Dependabot alerts, Actions permissions defaults.
- **Last CI results on `main`**: not fetched.
- **The provider's model-identifier policy** and the SDK's default retry behaviour: not checked against documentation.
- **Vendored libraries' advisories** beyond a version comparison for pdf.js: not looked up today.
- **Multi-tab saves** (52), **deleted-deal history retention** (58) and **malformed stored deals** (108): code paths
  not fully traced; listed as Unverified or Partly covered with a test to write.

**Completeness check.** A temporary script outside the repository read section 12 and checked: IDs 1 to 250 each
appear exactly once, no duplicates; each label equals the owner's checklist text exactly; every A row has a risk, a
status from the four allowed, evidence, a gap, an action with a size (or "none" when covered) and a gate; every B row
names a trigger or says UNASSIGNED and carries no risk or status; every C row has a reason of at least 20 characters.
Result on 2026-11-04: "rows 250 ... PASS: 1..250 exactly once; A/B/C field rules met; labels match", with the
counts in section 11. The script is not committed.

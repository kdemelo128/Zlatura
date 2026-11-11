# Monal: the underwriting tool built in, the rename, a Home you arrange

Status: design note, 2026-11-11, written under the owner's blanket approval
(`.evolve/DECISIONS.md`, "Monal"). Main at 4.7.127. Docs only: nothing is
built yet. Package facts are structure and counts only; nothing from the
private package is quoted. Package: `private/uw-claude-zip/x` (git-ignored).

## Summary

1. **The tool can ship in the repo once five kinds of content are taken out:** the firm's workbook; the firm template's layout and the code that only fills that layout; the firm's name; defaults from a real deal; and the package's test scripts and docs. A script does this every time (`tools/uwtool-import.mjs`). Its firm-specific rules live in `private/`, so the public repo never holds the strings it removes.
2. **Template: no firm template ships.** The tool's own workbook export is the built-in output. *Use my own template* is loaded once and kept on the device. The owner's firm fill comes back on his own device through a private **template pack**, which reuses the P1 loader on main.
3. **Rename in three steps:** the display name first, then storage ids (a second migration hop with the old copy kept), and the site address last (the owner's action; keep `/zlatura/` for now).
4. **Home you arrange:** device-only layouts per workspace (role), with keyboard and touch moves. This extends My workspace (addendum 4.1).
5. **One thing waits for the owner:** publishing the tool's code under the repo's MIT licence. It is hard to undo (section A9).

## Part A. The tool built in

### A1. What is in the package (counts)

`public/tool/` holds 81 files (6.93 MB): 76 of the tool's own files
(0.93 MB of code), four libraries and `index.html` (3.61 MB). `index.html`
has three data blocks: `spec` (13.8 KB, the firm template's layout),
`tplb64` (2.49 MB, the firm workbook with 54 sheets) and `pdfworker`
(1.09 MB). **`pdfworker` is byte-identical to `pdf.worker.js`**, so it can be
dropped for a plain URL. Outside `public/tool/` the package also holds 13
`.md` docs, `UW_Filler_Claude.html`, 30 `scripts/*.cjs`, `validation/` and
two `app/api/` server routes.

### A2. Edits by category (the manifest the script writes)

| Cat | Where (file: count) | Edit in the shipped copy | Edits |
|---|---|---|---|
| a workbook | `index.html`: the `tplb64` block | removed | 1 |
| a | `index.html`: the `pdfworker` block; `filler.js:11` (the blob URL) | block removed; the worker loads from `pdf.worker.js` | 2 |
| a | `filler.js:10`, `workbook-preview.js:42` (read the blob) | read a host slot `window.UWTemplate` (bytes or null) set by the host page | 2 |
| b firm name | code: `classic-template.js` 1 line, `parsers.js` 1 line (`:757`, an error the broker sees); docs: `HANDOFF.md` 2, `COVERAGE.md` 2, `TESTING.md` 1; `UW_Filler_Claude.html` 2 | `classic-template.js` moves to the pack (d). `parsers.js:757` becomes "This template doesn't match the selected template profile." The docs and the single-file html are not shipped | 1 (+1 file moved) |
| c real-deal defaults | `index.html`: 3 `value` attributes on the cap-rate inputs `f_c1`-`f_c3`; `parsers.js`: 2 fallback lines (`:558`, `:637`) and 1 message line (`:559`, the one naming a property and a report) | the inputs ship **blank**. The three `parsers.js` lines sit in the firm-fill code and move to the pack. Blank shows as "not entered" and is never filled as 0 | 3 |
| c | `example.json` (4 units, 8 statement lines; where it came from is unknown) | replaced with an invented example (`tools/uwtool-example.json`, written fresh) | 1 |
| d template layout | the `spec` block; `parsers.js` 79 lines in 11 ranges (the `Importer` class `:352-744`, `plan` `:1343-1474`, the firm part of `build` `:1550-1588`, `hideEdits` `:1541`); `legacy-outputs.js` (10 firm sheets); `merge.js` (8 lines); `classic-template.js` | `spec` removed. The firm-only code moves to `private/uwtool-pack/` and loads only with the firm workbook | 1 block + 4 files split or moved |
| e scripts and docs | 30 `scripts/*.cjs` (two of them hold an address pattern), `validation/`, 13 `.md`, `UW_Filler_Claude.html`, `app/api/` (2 routes with no caller check) | not taken: the script copies by allow-list, not by exclusion | 0 (excluded) |
| f libraries | Tesseract loader `filler.js:376`, `editor.js:12` (jsdelivr, a floating `@5`) | points at Zlatura's `vendor/ocr/` 7.0.0 through a shim (old E3) | 2 |
| security (old section 4) | E1 `isEvalSupported:false` in `editor.js`; E2 API key kept in memory only (`filler.js:39`, `:393`); E4 Google Fonts link becomes local Plex; E5 inline `onchange` (`editor.js:13`) becomes a listener; a `<meta>` CSP added to `index.html` | applied by the script | 6 |
| **Total** | | | **20 edits, 4 files moved or split, 1 file replaced; the rest excluded** |

**(d) Can the layout stay as code? No; keep it private.** Most sheet names
are ordinary industry words. But a few are firm-internal abbreviations, one
is a misspelling that fingerprints the firm's file, and one names a data
vendor. Paired with the cell addresses and the `spec` style map, they
describe the firm's own workbook closely enough to rebuild it. Being
conservative, everything that knows that layout leaves the shipped copy.
The generic readers in `parsers.js` stay (PDF, grid, statement and AI
normalisers, `sheetMap`, `applyEdits`, `fill`). So does `template-mapping.js`,
which has no firm sheet references.

**Fallback, if the split breaks the tool's own screens.** `Importer` may
turn out to feed screens that run without the firm workbook (see section
"Could not determine"). If so, the 79 lines stay in place, and each cell
address becomes a lookup through a *template profile*: the firm's profile
lives in the pack, and a generic profile for the tool's own export ships.
That is more edits, but the same rules apply.

### A3. Template: recommendation

**Recommended: the generic built-in template plus *Use my own template*.
A template is not required.** Without any firm workbook, the tool still
reads documents, builds its model and exports its own workbook
(`UWExport.build`/`export`). Its custom-template path (`template-mapping.js`)
fills any workbook the user picks. The first picked template and its
mapping are kept in IndexedDB `zlatura-uwtool` (store `templates`): on the
device only, never in kv, so never in a backup. They can be erased from
Settings. A "template required" design would block every new user at step 1.
An invented `.xlsx` of our own can come later; it is not needed to ship.

The **firm template pack** (`private/uwtool-pack/`: the workbook, `spec`,
and the firm-fill files from A2 d) is zipped and loaded once on the owner's
device. It goes through the P1 code on main (`app/uwfiller/pkg.js`, with the
SHA-256 allow-list in `hashes.js`). It is stored in the Cache Storage bucket
`zlatura-uwfiller` and served same-origin under the frame's CSP. P1's
"load your own package" card thus becomes **Settings › Underwriting ›
Firm template pack (advanced)**. The whole-package zip path is removed in
the same PR: the built-in copy replaces it, so nothing is lost.

### A4. Where it lives and how it is served

- **Folder:** `app/uwtool/`: the tool's own files, its four libraries, `IMPORT-MANIFEST.json` and `LICENSE` (A9). It never sits in the precache list (`sw.js:31-180`).
- **Route:** `sw.js` serves `app/uwtool/` cache-first from `zlatura-uwtool-${VERSION}`, filling it on first open (lazy). `activate` (`sw.js:207`) keeps the current bucket, so old versions are dropped. The service worker adds the frame's CSP header (the existing policy at `sw.js:192`, plus `script-src 'self'`). The shipped `index.html` also carries the same policy as a `<meta>`, for the first open before the service worker controls the page (`frame-ancestors` can't go in a meta; the header still sets it).
- **Frame:** the same-origin iframe from P1 (`app/uwfiller/ui.js`, which becomes `app/uwtool/host.js`), with its `sandbox` kept. The card says **Open underwriting**, with *Full screen* and *Erase this device's tool data*. The per-deal project store (`uw-bridge-fieldmap.md`: one `uw-v3` project per deal, swapped on deal change, kept in IndexedDB `zlatura-uwtool`) is unchanged.
- **Size:** about 3.4 MB more on Pages: 0.93 MB of the tool's code plus 2.4 MB of libraries (pdf.js 0.32, its worker 1.09, SheetJS 0.88, JSZip 0.10). The install download doesn't change. The first open downloads about 3.4 MB, once per version. The package as delivered is 6.9 MB.

### A5. The tool's libraries (licences and CVEs from memory; no advisory database was queried today)

| Library | Licence | Known issues | Ship its copy or Zlatura's? |
|---|---|---|---|
| pdf.js 3.11.174 (+ worker) | Apache-2.0 | CVE-2024-4367 (≤4.1.392; script runs only when eval is allowed) | ship its copy, with E1 applied and no `unsafe-eval` in the CSP. Zlatura's pdf.js 4.7 is ESM-only, and swapping it changes the reading. Upgrade later behind the same-check |
| SheetJS 0.18.5 | Apache-2.0 | CVE-2023-30533 (prototype pollution, fixed in 0.19.3), CVE-2024-22363 (ReDoS, fixed in 0.20.2). npm still serves 0.18.5 (checked today) | upgrade to 0.20.3 from the SheetJS CDN in PR 5, vendored with checksum, kept only if the same-check passes. Zlatura's ExcelJS has a different API, so it is not swapped in |
| JSZip 3.10.1 | MIT or GPLv3 (we take MIT) | none known for 3.10.1 | ship its copy; record the MIT choice in `THIRD_PARTY.md` |
| Tesseract loader | Apache-2.0 | the floating CDN `@5` is the risk | Zlatura's `vendor/ocr/` 7.0.0 |

### A6. The sanitiser (repeatable)

`node tools/uwtool-import.mjs --from <package dir> --rules private/uwtool-rules.json --out app/uwtool --pack private/uwtool-pack`

1. Fingerprint the package, the same way `pkg.js` does.
2. Copy by **allow-list** (`tools/uwtool-import.public.json`: the `public/tool/` files only). The firm-only file names and line ranges are in the private rules.
3. Generic edits by id from the public rules: drop the `<script id>` blocks, clear the `f_c*` values, add the meta CSP, E1-E5, the Tesseract shim, the invented `example.json`.
4. Private edits: each one is {id, category, file, SHA-256 before, find, replace or move-to-pack, SHA-256 after}. If any "before" hash is different, the run stops and names the edit id. This is how a new Codex release is re-imported: re-run, then fix only the rules that failed.
5. **Scan** the output against `private/uwtool-denylist.txt` (the firm name, every sheet name of the workbook, the property and report names, the address patterns) and against every string of 8 or more characters from `spec`. Any hit fails with exit 1 and writes nothing.
6. Write `app/uwtool/IMPORT-MANIFEST.json`: the package fingerprint; the in and out SHA-256 of each file; and the edit ids, categories and line counts. It holds no find strings or contents.

### A7. Automated guard (fails on old code)

- `tests/uwtool-guard.test.js`, run in CI:
  - every file under `app/uwtool/` matches its `IMPORT-MANIFEST.json` hash, so a hand edit fails;
  - no `tplb64`, `spec` or `pdfworker` block ids;
  - no base64 run over 4 KB under `app/uwtool/` except in the listed libraries;
  - the CSP meta is present;
  - the cap-rate inputs carry no `value`.
- `tests/hygiene.test.js`: add the block-id rule repo-wide, next to the existing 256 KB rule (`:42`).
- **Deny-list scan of every tracked file**, from two sources:
  - locally, `private/uwtool-denylist.txt`, inside `check:quick`;
  - in CI, a repository secret `DENYLIST` (one term per line). Setting it is the owner's settings action. With neither present the test prints "deny-list not available" and fails only under `CI=true`. Hashes of the terms are never committed: a short name is easy to guess from its hash.
- How "fails on old code" is proven: run the guard against a copy holding one injected deny-list term and one 300 KB base64 run; both must fail. The mutation check deletes each rule in turn.

### A8. Tests for the built-in tool

- A browser flow `uwtool-open`: open the Underwrite section, then the frame, with no zip. It checks that the tool's globals exist, no CSP violation beyond the expected list is logged, there is no outside request, and the cap inputs are empty.
- The local-only same-check from P1 (`tests/tools/`), run against the private package: DOM hashes and screenshots for every state except the firm fill. It reports counts only.
- It fails on old code: 4.7.127 has no `app/uwtool/`, so the flow fails.

### A9. Authorship and licence (hard to undo)

The owner says he built the tool with Codex and owns it. Under OpenAI's
terms the output belongs to the user. Code Codex copied from elsewhere would
still carry its own licence; a scan found no licence headers in the tool's
own files. The repo is **MIT** (`LICENSE`). Committing `app/uwtool/` there
lets anyone copy, change and **sell** the tool. **That can't be taken back:**
forks and clones keep it even if it is deleted later. The other choice is
an `app/uwtool/LICENSE` saying "all rights reserved", which is still
publicly readable. That suits a product meant to be sold, but it makes the
repo mixed-licence. **Recommendation:** an all-rights-reserved
`app/uwtool/LICENSE`, plus a line in `README.md`. This is the one point
where PR 3 waits for the owner's one-line confirmation, under CLAUDE.md
("before anything hard to undo"). PRs 1 and 2 publish nothing of the tool.

## Part B. The rename to Monal

What there is today:
- `app/brand.js`: `PRODUCT`, `KEY_PREFIX 'zlatura.'`, `FORMATS`, and the `comp-loader` first hop;
- 31 modules import `PRODUCT`;
- 13 hard-coded `zlatura.*` keys in 9 files (`backup`, `dealui`, `ui`, `ics`, `theme`, `look`, `dealcrm`, `toolsui`, `brand`), plus 2 `zl.*` keys in `ddui` and `abstractui`;
- IndexedDB `zlatura`, with `comp-loader` as `OLD_DB` (`store.js:19-21`, `moveFromOld` `:126`, `finishRename` `:244`);
- caches `zlatura-${VERSION}`, `zlatura-ocr-tesseract-7.0.0` and `zlatura-uwfiller` (`sw.js:30`, `:185`, `:189`);
- `manifest.webmanifest`, the `<title>` and meta lines, `exporters.js`, and 57 docs;
- Pages at `/zlatura/`.

- **B1, display name (PR 6, S).** `PRODUCT='Monal'`, with `TAGLINE`, `ABOUT_NAME` (the bird), `DESCRIPTOR` and `MARK` (the monal, drawn by us) in `brand.js`. Also the manifest `name`/`short_name`/`description`, `index.html`'s title and two meta lines, export file names (through `PRODUCT`), `README.md`, and the docs that describe the product. `tests/brand-rename.test.js` passes as is: it reads `PRODUCT`, and its last test still pins `KEY_PREFIX` until B2. Keep the manifest `id: "./"` so installed apps stay the same app. Old exports keep their old names.
- **B2, storage ids (PR 7, M, a data-format change logged in DECISIONS).**
  - **Keys:** `KEY_PREFIX='monal.'`; a chain `OLD_KEY_PREFIXES=['zlatura.','comp-loader.']`; a flag `monal.renamed`. `migrateLocalKeys` copies, once, from the newest old prefix that has each key and never overwrites. The 13 hard-coded keys move to a `key('…')` helper. The `zl.*` keys stay, because their prefix isn't the product's name.
  - **Database:** `DB='monal'`, `OLD_DBS=['zlatura','comp-loader']`. `moveFromOld` copies from the first database that exists, in one transaction, and only into empty stores. Its record (`meta.rename`) notes the source.
  - `finishRename` deletes the old copies only after a backup made since the move, or 30 days, for both hops.
  - **Backups:** `FORMATS.*.write='monal-…'`, and `read` keeps all three ids.
  - **Caches:** `monal-${VERSION}` and `monal-ocr-…`. The `activate` filter keeps the bucket of a firm pack the user loaded: it is copied to `monal-uwfiller` before the old bucket is deleted, or kept by name. The old service worker needs no clean-up: same scope, same file, so the new `sw.js` replaces it and the old app caches are deleted by `activate`.
  - The tool's own `uw-*` keys don't change.
  - Tests that fail on 4.7.127:
    1. `tests/brand-rename2.test.js`: a fake `localStorage` with `zlatura.*` only, one with `comp-loader.*` only, and one with both plus some `monal.*`. It expects copies with nothing overwritten, a second run that copies 0 (idempotent), and the old keys still there.
    2. a browser flow `store-rename2` (`fake-indexeddb` is not a dev dependency and none is added): a `zlatura` database with deals ends up in `monal` with equal counts. If `comp-loader` alone exists, it is copied straight. A second open copies nothing.
    3. An old-backup fixture `tests/fixtures/backup-zlatura-4.7.json` (invented) restores, through `migrate.js`.
    4. A browser flow that seeds `zlatura` IndexedDB plus keys and reloads: the deals show, and the analyze-golden figures are identical.
- **B3, the address (PR 9, owner action, later).** Storage belongs to the origin (`kdemelo128.github.io`), not to the path, so a move to `/monal/` keeps every deal. What breaks is installed apps and bookmarks: they point at `/zlatura/`, and GitHub Pages doesn't redirect a renamed repository. Recommended now: keep `/zlatura/`. A later move needs:
  - a new `monal` repository;
  - a stub left at `zlatura` with a redirect page and a `sw.js` that unregisters itself and sends the page to `/monal/`;
  - a banner in the app for a release beforehand, asking users to re-install;
  - or a custom domain, which also closes the shared-origin check 19.

## Part C. A Home you arrange

- **What changes for the broker.** In *Arrange Home* (a button on Home, and in My workspace) the broker can:
  - choose which sections and tiles show;
  - order them;
  - pick a width (small = 4, medium = 6/7, wide = 12 of the existing `bento` grid);
  - hide one ("Open once" stays, per addendum 4.1);
  - **reset** to the workspace's default. Each workspace (`app/workspaces.js` `WORKSPACES`, i.e. the roles) keeps its own layout. Hidden never means gone: search and My workspace still reach every feature (the feature-map test runs with everything hidden).
- **Data.** `localStorage` `zlatura.home.layout.v1` (`monal.` after B2) holds `{[workspaceId]: [{id, span, hidden}]}`. It is device-only, not in backups and not in the deal format (as appearance decision 7). An unknown id is dropped, and a new section is appended at its default place.
- **Code.** `composeHome` (`app/home.js:121`) takes the order and spans from the layout, or from `ws.homeCards` and `SPAN` (`:116`) when no layout is set. Arranging is a new `app/homearrange.js`, built with `el()`.
- **Equivalents for dragging.** Each card in arrange mode has a handle that is a button:
  - keyboard: Space picks it up, the arrows move it, Space drops it, Escape cancels, and a live region says "Pipeline, position 2 of 7";
  - every card also has *Move up*, *Move down*, *Width* and *Hide* buttons, which work at phone size without dragging;
  - pointer drag, through Pointer Events, works for mouse and touch alike. No library is needed.

**Prior art** (capped: 3 npm registry lookups; GitHub not searched):

| Candidate | What it does | Licence | Size | Last release | Build-free, offline | Network or telemetry | Security notes | Verdict |
|---|---|---|---|---|---|---|---|---|
| SortableJS | drag to reorder lists | MIT | 640 KB unpacked | 1.15.7 | yes (UMD) | none known | DOM-only | **build ourselves**: we need keyboard moves and spans anyway, and Pointer Events are about 150 lines |
| gridstack.js | drag and resize grid | MIT | 2.2 MB unpacked | 14.1.0 | yes | none known | larger surface | **build ourselves**: too big for one Home grid |

- **Tests that fail on 4.7.127:**
  - a unit test that `composeHome` honours a stored order, span and hide;
  - an unknown id is dropped;
  - reset restores `ws.homeCards`;
  - a browser flow, keyboard-only, that moves Pipeline to the top, reloads and checks the order, then runs axe on arrange mode;
  - the 150 ms perf budget per move.
- **Where it fits.** It extends addendum 4.1 and design-language PR 2 (L2, Home and pipeline). M8 follows L2, and the builder's accent, hover preview and cursor work isn't redesigned here.

## The ordered PR list

| # | PR | Size | Files | Fails on old code | Risks |
|---|---|---|---|---|---|
| 1 | Guard: deny-list scan and block-id rule | S | `tests/uwtool-guard.test.js`, `tests/hygiene.test.js`, `package.json` (check:quick) | the injected term and the 300 KB run fail; old code has no guard | the CI secret isn't set yet, so CI fails loudly |
| 2 | Sanitiser and manifest (dry run; writes into the scratchpad only) | M | `tools/uwtool-import.mjs`, `tools/uwtool-import.public.json`, `tools/uwtool-example.json`, `tests/uwtool-import.test.js` on an **invented stand-in package** | a stand-in with a fake firm term is refused; a changed "before" hash stops the run | private rules drift from the package |
| 3 | Built in: `app/uwtool/`, SW route, *Open underwriting*, firm pack (advanced), zip path removed | L | `app/uwtool/**`, `app/uwfiller/*` becomes `host.js`/`pack.js`, `sw.js`, `app/underwrite.js`, `THIRD_PARTY.md`, `README.md` | the `uwtool-open` flow; the guard on the real output | **waits for the A9 licence answer**; the firm-fill split (fallback A2); 3.4 MB on first open |
| 4 | *Use my own template* kept on the device; blank caps shown as "not entered" | M | `app/uwtool/host.js`, IndexedDB `zlatura-uwtool` | the template survives a reload; blank stays blank | storage eviction on iOS (ask `persist()`) |
| 5 | Libraries: Tesseract shim; SheetJS 0.20.3 | S | `app/uwtool/xlsx.js`, `THIRD_PARTY.md` | a checksum test; the same-check | a SheetJS change alters how files are read: revert if the same-check differs |
| 6 | Display name Monal | S | `app/brand.js`, `manifest.webmanifest`, `index.html`, docs | `tests/brand.test.js` with the name expected as Monal | manifest name caching on iOS |
| 7 | Storage ids, second hop | M | `app/brand.js`, `app/store.js`, 11 key files, `sw.js`, `app/migrate.js`, fixtures | the tests in B2 | data loss if non-idempotent: the old copy is kept 30 days |
| 8 | Home you arrange | M | `app/home.js`, `app/homearrange.js`, `styles.css` | the tests in C | conflicts with L2: merge after it |
| 9 | Address move | S | stub repo, banner | redirect flow | owner action; installed apps |

E-P3 (the bridge) follows PR 3 and targets `app/uwtool/`. Reader slices R4,
R5 and R7-R9 continue in between (decision 4).

## Could not determine

- Whether `Importer` and `plan` feed any screen that works without the firm workbook. PR 3 must prove it with the same-check before the split; if they do, use the template-profile fallback (A2).
- Whether the 8 sheets named "UW_…" were added by Codex or are the firm's own. They are treated as firm layout either way.
- How the vendor name is used. It appears 39 times in 6 of the tool's files. The app already names the same service 60 times, as the source of a user's own export. Keep those uses consistent with the app's clean-room review; the sheet that carries the vendor's name goes to the pack.
- Whether Codex reproduced any third-party code inside the tool's own files: there are no licence headers, but no similarity scan was run.
- CVE status was not re-checked against an advisory database today.

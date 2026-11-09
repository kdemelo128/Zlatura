# The UW Filler, as is, inside the Underwrite tab

**Status: proposed. Nothing is built.** This proposal replaces the rebuild
plan in `uw-filler-integration.md` (sections 3 to 5: UW-3 to UW-11). The owner
approves it before any code is written. Every figure and name below is
invented. The owner's package is described only by its structure.

**The owner's direction (2026-11-09):** use the Codex-built filler as it is.
Keep its four steps, the Monal bird, the 3D flight, the coins and every small
control exactly as they are. Connect Zlatura's own code to it, inside the
existing Underwrite tab. No Zlatura feature is removed.

## Summary

1. **The package can't be committed, not even with the template taken out.**
   Its `index.html` carries the firm's workbook as a base64 block. Its code
   also names the firm, hard-codes the template's sheet and row layout, and
   carries defaults from a real deal, with a comment naming that property
   and a broker report (section 2). The repo is public.
2. **So the package travels like a deal file, not like app code.** The
   broker loads the package zip once, from their own computer. Zlatura keeps
   it on the device, and `sw.js` serves it at `uw-filler/` to an iframe
   inside the Underwrite tab. GitHub Pages gains no package bytes. The
   template never leaves the browser, and the filler's code runs as shipped.
3. **"Exactly the same" can be tested.** A local-only check runs the
   untouched package from `private/` next to the embedded copy and compares
   DOM hashes and screenshots, state by state. It reports counts only.
4. **The bridge:** Zlatura code calls the filler's own public window objects
   (same origin) without changing them. Staged files and deal facts go in;
   the filler's tenants, statement lines and assumptions come back as
   *inputs*. The broker taps Use, and Zlatura's engine works out the deal's
   figures.
5. **Its math stays its own, and is labelled.** The filler's figures are
   shown as "filler model". A cross-check compares them with Zlatura's
   engine and flags any difference over a cent. Nothing it calculates is
   saved into a deal as a result.

## 1. What the package is (structure only)

- **Shape:** `public/tool/` holds 80 classic `<script src>` tags and no
  inline script. There is one inline `<style>`, 14 `style=""` attributes and
  three data blocks inside `index.html`. Total size: 6.93 MB (3.22 MB of its
  own JS and libraries, plus `index.html` at 3.61 MB). `UW_Filler_Claude.html`
  (5.8 MB) is the same tool in one file, with 78 inline scripts. **We use
  `public/tool/`**, because its external scripts allow a strict CSP.
- **Data blocks in `index.html`:**
  - `spec`, a JSON block at about byte 17,721 (14 KB): style indices and a
    row/column layout of the firm template;
  - `tplb64`, a text block from byte 31,573 to byte 2,522,519: **the firm's
    workbook**, 1.87 MB once decoded, with 54 worksheets;
  - `pdfworker`, a text block (1.09 MB): the pdf.js worker, turned into a
    `blob:` URL by `filler.js:11`.
- **Where the template is read:** `filler.js:10` (decoded at start-up);
  `filler.js:268` and `parsers.js:803` (each fill starts from those bytes);
  `workbook-preview.js:42` (decoded again for the preview).
- **Globals it exposes** (the bridge's handles): `UWFiller` (`addFiles`,
  `files`, `result`, `exportContext`), `UWEditor` (`model`, `sync`,
  `commit`, `undo`), `UW` (model maths), `UWFinance`, `UWAnalyst`,
  `UWAdvanced`, `UWTemplateMapping`, `UWFlowGuide` and about 20 more.
- **Storage:** `localStorage` only. The keys are `uw-v3` (the whole working
  model, `editor.js:2`), `uw_key` (the API key, `filler.js:39`), and
  `uw-appearance`, `uw-solid-controls`, `uw-monal-coins`, `uw-monal-game`,
  `uw-pointer-light`, `uw-doc-compact`, `uw-interface`, `uw-companion`,
  `uw-rate-unit`, `uw-reader-preferences` and `uw-source-profiles`. It uses
  no IndexedDB. It holds **one** project at a time.
- **Network:** a Google Fonts `<link>` (IBM Plex) in the `<head>`;
  Tesseract from jsdelivr (5.1.1 at `filler.js:376`, but a floating `@5` at
  `editor.js:12`, with no integrity hash); `api.anthropic.com` from the
  browser with the user's key (`filler.js:28`); and `/api/public-data` and
  `/api/integrations` (`filler.js:381`, `editor.js:11`, `advanced-ui.js:28`),
  Next.js routes that Pages cannot serve: they 404, and the tool shows its
  own "Lookup unavailable".
- **DOM:** `innerHTML` in 32 files (75 uses), with about 150 `esc(` calls.
  One inline handler is built into HTML at `editor.js:13`. It has no `eval`
  of its own.
- **Licence and authorship:** no LICENSE file and no `package.json`. The
  owner commissioned it, so it is owner-supplied code. Because it is never
  committed, the repo's licence is unaffected (question Q1).
- **Its own handoff notes** ask that the app not be copied wholesale, that no
  second engine be added and that the firm's workbook not be embedded. The
  owner's newer direction says "as is". This design satisfies both. Nothing is copied
  into the repo, the template stays on the device, and Zlatura's engine
  stays the one that saves figures.

## 2. Confidentiality (hard gate)

**What I found** (counts only; nothing is quoted):
- the firm's workbook, embedded in `index.html` (`tplb64`) and three times
  in `UW_Filler_Claude.html`;
- the template's layout in `spec`, plus 27 references to template sheet
  names in `parsers.js`;
- the firm's name in at least two code files (`classic-template.js:1`,
  `parsers.js:757`, a message the broker sees);
- default cap rates at `parsers.js:559`, with a comment naming a real
  property and a third-party report;
- a real address pattern in `scripts/review-flow-checks.cjs`.

Taking `tplb64` out would therefore **not** make the code safe to publish.
Scrubbing the rest would change visible text and the template behaviour,
which breaks "as is".

**Design: bring your own package.**
- **Loading:** Settings › Underwriting filler › *Load package…* takes the
  zip, or the `public/tool` folder. Zlatura reads it with the `fflate` it
  already vendors, checks sizes first (security check 7), and stores it in
  a Cache Storage bucket, `zlatura-uwfiller`. The bucket is on the device,
  outside the deal database, never in a backup and never sent anywhere.
- **Integrity:** the package's fingerprint (a SHA-256, from `app/filehash.js`,
  of its sorted file list with each file's own SHA-256, so a zip and a folder
  agree) must be on an allow-list. The repo commits only that 64-character
  fingerprint, which reveals nothing of the contents. A package that doesn't match is
  refused. Code from a stranger's zip would run with full access to every
  deal on this origin (section 3). The owner adds a hash for each new
  release (Q2).
- **The template:** the package as given keeps its embedded workbook, and
  it stays in the browser like any deal file (T1, recommended). Option T2,
  for later, strips `tplb64` at load time and asks for the workbook as a
  separate file, so a template update doesn't need a new package. T2 needs
  two small source edits (`filler.js:10` and `workbook-preview.js:42` read a
  host-supplied slot); nothing visible changes.
- **Without any template** (T2 with no workbook loaded), the tool still
  reads documents and builds its model. Its own workbook export works
  (`UWExport.export` with no template), and so does the custom-template
  path (`#template`). Only step 4's firm fill fails: JSZip can't open empty
  bytes. Under T2, Zlatura's strip shows "Load your firm workbook to fill
  the template" before that step.
- **Repo guard:** `tests/hygiene.test.js` fails on any tracked file with a
  `tplb64` block or a base64 run over 256 KB. Bridge fixtures are an **invented stand-in package** (a
  tiny `index.html` and stubs with the same global names), written fresh.
- **Erase:** Settings › *Delete everything on this device* also deletes the
  bucket, the `uw-*` and `uw_key` keys, and the per-deal filler projects
  (section 5). That is a data-retention change, listed as gate G3.

## 3. Embed mechanism

**A same-origin iframe** at `uw-filler/index.html`, in a new card,
**Underwriting filler**, on the Underwrite tab. The card sits under UW-1's
*Start from documents* card and above *Quick underwrite*. The iframe is
created only when the card is opened, so the tab's own speed doesn't
change. *Open full screen* opens the same URL in its own tab.

The parent page never touches the filler's DOM. An inline mount was
rejected: the filler's global CSS (`body`, `main`, `button` rules in its
`<style>` and in `restored.css`) would restyle Zlatura, and Zlatura's CSS
would restyle the filler. Both would stop being "the same".

**Serving it:** `sw.js` gains one route. A GET under `uw-filler/` is
answered from `zlatura-uwfiller`, with a `Content-Security-Policy`
*response header* added by the service worker. A header set on a response
from the service worker applies to that document, and the package's bytes
stay unchanged. Two fixes are needed in `sw.js`:
- `activate` (`sw.js:191`) deletes every cache except `CACHE` and
  `OCR_CACHE`. It must also keep `zlatura-uwfiller`, or every Zlatura update
  would wipe the broker's package;
- `fromNetwork` must never be used for `uw-filler/`. On a cache miss, the
  route answers a 404 page that says "Load the package in Settings".

**Zlatura's own CSP** (`index.html:9`) sets only `object-src`, `base-uri`
and `form-action`. It does not apply to the iframe's document. The frame
gets its own policy:

| Directive | Value | Effect on the filler |
|---|---|---|
| `script-src` | `'self'` | its 80 scripts load. The inline handler at `editor.js:13` is blocked, so the scenario picker breaks; patch E5 fixes it with no visible change. No `'unsafe-eval'`, so pdf.js's font fast path is off (this also stops CVE-2024-4367 on the unpatched `editor.js` path) |
| `worker-src` | `'self' blob:` | the pdf.js worker made from `pdfworker` runs |
| `style-src` | `'self' 'unsafe-inline'` | its `<style>`, `style=""` and `restored.css` work; Google Fonts is blocked |
| `font-src` | `'self'` | IBM Plex comes from Zlatura's `fonts/` after patch E4 |
| `img-src` | `'self' data: blob:` | page previews, the Monal art, charts |
| `connect-src` | `'self' blob: data:` | `example.json` works; `api.anthropic.com` and jsdelivr are blocked unless the owner opts in (Q4, Q5) |
| `frame-ancestors` | `'self'` | only Zlatura can frame it |
| `object-src`, `base-uri`, `form-action` | `'none'` | as in Zlatura |

- **Workers, eval, OCR:** the pdf.js worker is a `blob:` (allowed above).
  The library code has one `new Function` probe each in pdf.js and JSZip.
  pdf.js catches its probe. JSZip's must be checked in P1: the flow fails if
  any CSP violation other than the expected list is logged.
- **WebGL** (the Monal 3D view) is not affected by CSP.
- **Storage collisions:** none. Zlatura's keys are `zlatura.*`, `zl.*`,
  `ai.settings` and the `zlatura` IndexedDB (where `uw.scratch` is a kv key,
  not `localStorage`). The filler uses `uw-*` and `uw_key`. Two points:
  - backups export *every* kv record (`backupui.js:106`). The package and
    the filler's projects therefore go in Cache Storage and their own
    IndexedDB database (`zlatura-uwfiller`), **never in kv**;
  - security check 19 (a shared `github.io` origin) now covers the filler's
    keys too. A custom domain would end it (Q8).
- **Size:** Pages and the precache gain about 25 KB of Zlatura code, plus
  IBM Plex woff2 files (about 60 KB) if E4 is approved. The device holds
  about 7 MB per package (the 3.6 MB html is mostly the template and the
  worker). The *Storage* screen (`store.js:544`) lists it,
    and `navigator.storage.persist()` is asked for, because iOS can evict
    the storage of a site that isn't installed;
  The package's pdf.js 3.11 and SheetJS duplicate Zlatura's pdf.js 4.7 and
  ExcelJS on the device; accepted, because "as is" rules out swapping them.
- **Trust, stated plainly:** a same-origin frame can read Zlatura's
  database. `sandbox` with `allow-scripts allow-same-origin` can be escaped,
  and without `allow-same-origin` the tool loses its `localStorage` and
  service worker, so it would not run "the same". What contains it: the hash allow-list, the CSP above (no outside
  connections, so nothing can be sent out), the security patches, and a
  `sandbox` without `allow-top-navigation` as defence in depth. A separate origin (a second Pages site or a subdomain) would isolate it
  fully. That is a hosting change (Q8).

## 4. Edits to the filler (minimal; applied at load time)

The stored package keeps its original bytes. `app/uwfiller/patches.js` holds
each edit as {file, SHA-256 before, exact small find/replace, SHA-256 after,
reason}. It is applied when the package is served, and **refused as a whole
if any "before" hash differs**. Then the filler runs unpatched, under the
strict CSP, with a banner. The find strings are short and generic, never
template or deal content.

| # | File:line | Edit | Visible? | Why |
|---|---|---|---|---|
| E1 | `editor.js` (`getDocument` call) | add `isEvalSupported: false`, as `filler.js` and `parsers.js` already do | no | CVE-2024-4367 in pdf.js ≤ 4.1.392: a crafted PDF could run script in Zlatura's origin |
| E2 | `filler.js:39`, `:393` | keep the key in memory only; drop the `setItem`/`getItem` on `uw_key` | **yes**: the *Remember on this device* box no longer remembers. It is hidden (one `hidden` attribute) rather than left as a box that silently does nothing | no keys in browser storage (checks 12, 30) |
| E3 | `filler.js:376`, `editor.js:12` | Tesseract from Zlatura's `vendor/ocr/` (7.0.0, pinned, checksummed) through a small Zlatura-owned shim that sets `window.Tesseract` | no, if the P2 OCR test agrees | no CDN code; `@5` floats today. Only if Q5 = b |
| E4 | `index.html` `<head>` | the Google Fonts `href` points to a local stylesheet of IBM Plex Sans/Mono (OFL-1.1, vendored, the same weights) | no; the screenshot check proves it | no request to Google on every open (check 30) |
| E5 | `editor.js:13` | the scenario `onchange="…"` string becomes one `addEventListener` | no | strict `script-src`, with no `'unsafe-inline'` |
| E6 | `filler.js:28` | skip the AI call when Zlatura says the deal is confidential, with the tool's own "connection unavailable" path | no for open deals | Zlatura's confidential rule (`ai.js` `blocked`). Only if Q4 allows AI at all |

- **Not edited:**
  - the 75 `innerHTML` uses. The strict CSP (no inline script, no outside
    connections) contains a missed escape. An audit of each sink that takes
    file text (tenant names, cell text, PDF text) is part of P2. Any sink
    found without `esc` becomes its own patch;
  - `finance.js`, `model.js` and every calculation;
  - the API routes: they are not shipped, and on Pages they are a 404;
  - SheetJS 0.18.5 (CVE-2023-30533 prototype pollution, CVE-2024-22363
    ReDoS; fixed in 0.19.3/0.20.2, only from the SheetJS CDN). Swapping it
    could change how the filler reads files. Recommended instead: the
    frame's own JS realm limits any pollution to the filler, the CSP blocks
    exfiltration, and the owner decides on an upgrade later (Q6).
- **Open proxy routes:** `app/api/public-data/route.ts` has no caller
  check. It fetches ArcGIS, DC GIS, and Walk Score with a server key, for
  any address. Anyone could spend that key. `integrations/route.ts` checks
  the provider name but has no authentication. Neither runs on Pages.
  Recommended: never deploy them, and if ever wanted, put them behind
  `server/`'s token check (checklist 20-23).

## 5. The brain: how Zlatura and the filler connect

**One Zlatura module, `app/uwbridge.js`, in the parent page.** It reads and
calls the frame's public globals directly (same origin), so the filler needs
no new listener. There is no `postMessage` and nothing to secure under
check 2.
- **Version lock:** the bridge's map is keyed to the package hash. An
  unknown hash leaves the filler working on its own, and the bridge says
  "this package version isn't connected yet".
- **Untrusted data:** everything read back is treated as untrusted (checks 3
  and 11). The bridge copies only allow-listed keys, refuses `__proto__`
  and `constructor`, and checks types.

**One project per deal.** The filler keeps one project in `uw-v3`. A strip
above the frame (Zlatura's look) shows "Working on: [deal ▾] · filler model,
not Zlatura's engine".
- **Switching deals:** the bridge saves the current `uw-v3` into
  `zlatura-uwfiller` › `projects` › `<dealId>`, then writes the next deal's
  project, or clears the key, and reloads the frame. Without this, deal A's
  tenants would show under deal B.
- **The no-deal case:** a quick underwriting with no deal uses the slot
  `scratch:<id>`.

**Zlatura → filler (in):**
- **Files:** a file staged in UW-1 (`intake.js` `stage`, state `staged`) has
  *Send to filler*. That calls `UWFiller.addFiles([{name, arrayBuffer}])`,
  and the filler reads it with its own readers, as if dropped. The UW-1 item
  becomes `used`, labelled "sent to filler"; `markUsed` already exists.
  Nothing enters the deal.
- **Facts:** price, address, building SF and loan terms are offered as
  *Fill in filler*, written into the filler's model before it loads, with
  **explicit units**: Zlatura's percent (6.5) becomes the filler's decimal
  (0.065); a blank stays `''`, never 0; SF and acres stay separate; monthly
  and annual are converted only where the field map names both units.
  Each mapped field is listed in `app/uwfiller/fieldmap.js`, with its unit
  on both sides. A field with no named unit is not offered.

**Filler → Zlatura (out), as inputs only:**
- **What comes back:** *Bring into the deal* shows what the filler holds:
  tenants (name, suite, SF, dates, rent with its unit, recoveries),
  statement lines by account and month, and the purchase and loan
  assumptions.
- **How it lands:** each group goes through the deal's existing doors: the
  rent roll importer (UW-2's monthly/annual question asks whenever the
  filler's unit isn't stated), the T-12 importer (keeping the partial-year
  rule, #28) and the loan fields. Each has a preview, Data QC, a *Use* tap and Undo. `quantizeDeal` stores
  cents.
- **The source is recorded:** each item's source is recorded as
  `{kind: 'filler', pkg: <hash first 12>}`. That is a new source kind, gate
  G1.
- **The engine decides:** Zlatura's engine then computes NOI, DSCR, IRR and
  the rest. The filler's own results (`UWFinance.calculate`) are **not**
  written into the deal.

## 6. Its math against Zlatura's rules (nothing in it is changed)

The filler keeps money as floating dollars, rounded by its own helper (and
not always). Zlatura keeps whole cents, rounds half away from zero
(`engine/money.js:16`) and takes rates in percent. Where they differ
(invented inputs; Zlatura's figures come from its engine, the filler's from
its formulas, both run here):

| # | Where (filler) | Difference | Invented example |
|---|---|---|---|
| M1 | `finance.js:3` `cents` | a negative half-cent rounds toward zero | −$0.125: filler −$0.12, Zlatura −$0.13 |
| M2 | `finance.js:5` `debt` | each month's interest and principal is rounded, then summed | $1,234,567 loan, 6.375%, 25-year amortization, year 1: filler debt service $98,876.52, Zlatura $98,876.56; balance after a year $1,213,794.15 against $1,213,794.10 |
| M3 | `model.js:3` `n`, `finance.js:7` `Number(sc.ti)\|\|0` | **blank becomes 0** | year-3 TI left blank: the filler counts $0 and shows the cash flow higher; Zlatura says "can't tell" |
| M4 | `finance.js:2` `defaults`, `model.js:5` `blank` | **values invented for blank inputs**: 2% sale cost, 7% cap, 30-year amortization, 10-year term, fixed forecast years | no sale cost entered: the filler takes 2%; Zlatura asks |
| M5 | units | rates are decimals (0.065), Zlatura's are percent (6.5) | the bridge converts both ways; a raw copy would read 6.5 as 650% |
| M6 | `finance.js:6` `irr` | null when the flows change sign more than once; a different search range | flows −100, +50, −20, +90: filler none, Zlatura about 8.3% |
| M7 | `finance.js:4`, `:5` | a hold of 10 years at most and 120 months fixed; interest-only for part of the term | 24 IO months on a 10-year loan: the filler models it; Zlatura's `io` covers all or none of the term (`engine/debt.js:30`) |
| M8 | `model.js` monthly timing | months come from statement columns and broker timing | can't be judged from the code alone (section 10, unknowns) |

**Three options for the owner:**
- **(a) Label only.** The filler's figures stay as they are, and the strip
  says "filler model, not Zlatura's engine". This is the cheapest, but a
  broker can see two different DSCRs for one deal.
- **(b) Label and cross-check.** `app/uwcheck.js` takes the filler's inputs
  (read through the bridge), runs Zlatura's `analyze`/`holdReturns` on them,
  and lists each shared figure that differs by more than $0.01 or 0.01 point
  in the strip, with its reason code (M1-M7). This reuses UW-0's
  `uw-oracle.mjs` comparison logic, and it is Zlatura code only. A
  difference is shown, never adopted.
- **(c) Route through the engine.** The filler's displayed figures would
  come from Zlatura's engine. That means editing `finance.js` (not "as is")
  or replacing `window.UWFinance` from outside (a hidden second
  implementation). Both break the owner's direction.

**Recommendation: (b) for what the filler shows, and the section-5 rule
for what is saved.** Only inputs come back, and Zlatura's engine computes
the deal. The firm workbook the filler fills holds the filler's figures.
The strip and the export note say so (Q3).

## 7. What already merged: kept, bypassed, superseded

- **UW-0** (`tests/tools/doc-local.mjs`, `uw-oracle.mjs`) **stays.** The
  oracle's comparison becomes the core of option (b)'s tests. `doc-local`
  keeps scoring Zlatura's readers.
- **UW-1** (*Start from documents*, `intake.js`, `intakeui.js`) **stays** at
  the top of the tab and gains *Send to filler*. *Make a deal from these*
  and the `uwdrop` routing (`ui.js:1360`) are unchanged. A drop *on* the
  iframe goes to the filler (its own document); a drop elsewhere on the tab
  goes to UW-1.
- **UW-2** (the monthly/annual question, #147) **stays** and is the gate on
  the way back (section 5). It is bypassed only for files the broker sends
  to the filler, which reads them with its own source-table mapper.
- **Quick underwrite, the saved list and Calculators stay** as they are.
- **Superseded:** UW-3 to UW-11 as rebuilds. The filler already has those
  screens. Their engine-side items (debt extras, the waterfall catch-up,
  development) become later "teach Zlatura's engine" PRs under the existing
  money gates. The parked UW-3 builder stash is left untouched; the owner
  decides (Q9). At release, a "superseded by `uw-embed-as-is.md`" line goes
  at the top of `uw-filler-integration.md`.

## 8. Gates, storage and the backup

| Gate | What | When |
|---|---|---|
| G0 | this proposal | now |
| G1 | the new source kind `filler` on an imported lease or line (data format: `migrate.js` step, old-backup fixture restores unchanged) | P5 |
| G2 | the vendored IBM Plex fonts (E4) and the OCR shim (E3) under `THIRD_PARTY.md` | P2 |
| G3 | the package and projects held on the device, and wiped by *Delete everything* (data retention) | P1, P3 |
| G4 | putting the filler's projects into backups (format change, restore allow-list, old-backup fixture) | P6, optional |
| G5 | AI from inside the filler, with the user's key in memory (cost and security) | only if Q4 = yes |
| G6 | a separate origin for the filler | only if Q8 = yes |

- **New storage, all outside the deal records:**
  - Cache Storage `zlatura-uwfiller` (package files);
  - IndexedDB `zlatura-uwfiller` › `meta` (package hash, file count, date
    loaded) and `projects` (keyed by deal id, or `scratch:<id>`; value: the
    filler's JSON, kept as is);
  - the filler's own `uw-*` keys.
- **Saved deals, golden outputs and the backup format:** **no change** in
  P1-P4. The 618 deal results and 646 figures stay identical. A backup
  holds no filler bytes, and the restore sheet says "the underwriting filler
  and its projects are on this device only".
- **Hosting:** none for the recommended path.

## 9. Plan: small PRs, each reversible

| PR | What | Fails on the old code | Proves |
|---|---|---|---|
| **P1** Load and embed | Settings loader (zip or folder, size checks, hash allow-list), `sw.js` route with frame CSP, `activate` keeps the bucket, the Underwrite card with an iframe made on open, *Open full screen*, erase | the loaded stand-in package is served at `uw-filler/` with the CSP header; a version bump keeps the bucket (today `sw.js:191` deletes it); a wrong hash is refused; a backup has no filler bytes | the filler renders; no CSP violation beyond the expected list; Zlatura's flows unchanged |
| **P2** Security patches E1, E4, E5 (+E2/E3/E6 per Q4/Q5) | `app/uwfiller/patches.js`; a `before`-hash mismatch refuses all patches | a crafted-PDF test reaches pdf.js eval on the old serve; the scenario picker throws under CSP before E5 | "the same" check passes with patches on |
| **P3** Bridge in | `uwbridge.js`, `fieldmap.js`, per-deal project swap, *Send to filler* on UW-1 items | deal A's tenants never appear under deal B; 6.5% arrives as 0.065; a blank arrives blank | the filler reads a staged file as if dropped |
| **P4** Cross-check strip | `uwcheck.js`, M1-M7 reason codes | a filler DSCR that differs by $0.04 is flagged; equal figures are not | labels and differences shown; nothing saved |
| **P5** Bring into the deal | preview, Use, Undo through the rent roll, T-12 and loan importers; source kind `filler` (G1) | an unstated rent unit asks (UW-2); a blank TI is never stored as 0; Undo restores the deal exactly | the engine's figures change only through inputs the broker accepted |
| **P6** (optional) | filler projects in backups (G4) | an old backup restores unchanged; a new one round-trips a project | — |

- **Every PR runs `check:full`** (golden identical, mutation checks, axe,
  perf, typing). Mutations the tests must catch: P1 drops the CSP header or
  the hash check; P3 drops the ×/÷100; P4 widens the tolerance; P5 drops
  the unit question.
- **Axe:** axe covers Zlatura's strip and card. The filler's own document
  is scanned and reported, not gated (we may not change it). Its findings
  are listed for the owner.
- **Perf:** the 150 ms edit budget applies to Zlatura's fields. Opening the
  filler is measured and reported, never gated.

**"Exactly the same", testable without committing anything:**
`tests/tools/uwfiller-same.mjs` is local-only, like `t12-local.mjs`. It
serves the **untouched** `private/…/public/tool` on one port, and Zlatura
with the same package loaded on another.
- **Viewport:** the same size in both: the iframe's inner size, at desktop
  and at iPhone width.
- **States:** fresh start; the fictional example loaded through the tool's
  own button; each of the four steps; Monal open; coins after one action;
  the 3D flight at frames 0, 30 and 60; the tool library; the workbook
  preview.
- **Determinism:** Playwright's clock is frozen and `Math.random` and
  `crypto.randomUUID` are seeded, the same way in both runs.
- **Compared, per state:** a hash of the normalised DOM (`blob:` URLs and
  generated ids replaced), a computed-style hash of every element, and a
  pixel diff of the screenshot.
- **Output:** counts only ("14 states, 14 identical"), and no images are
  written to the repo.
- **In CI:** CI has no package. The same harness runs on the invented
  stand-in, so the comparer is tested too.

## 10. Prior art (capped: 3 web searches; npm and GitHub were not searched directly)

| Candidate | What it does | License | Size | Last release, maintenance | Build-free, offline | Network or telemetry | Security notes | Verdict |
|---|---|---|---|---|---|---|---|---|
| The owner's package | the filler | none stated; owner-commissioned | 6.9 MB | 2026-11-06 | yes, served from the device | fonts, CDN, AI unless blocked (section 3) | sections 3 and 4 | **Adopt as is; never committed** |
| … its pdf.js | PDF text | Apache-2.0 | 0.32 + 1.09 MB | 3.11.174 (2023) | yes | none | CVE-2024-4367 (fixed in 4.2.67); E1 and the CSP | keep (Zlatura's 4.7.76 stays for Zlatura) |
| … its SheetJS CE `xlsx` | workbook read/write | Apache-2.0 | 0.88 MB | 0.18.5 (last on npm) | yes | none | CVE-2023-30533, CVE-2024-22363 | keep for now (Q6) |
| … its JSZip | zip | MIT or GPLv3 (dual; used as MIT) | 98 KB | 3.10.1 | yes | none | — | keep |
| … its Tesseract.js | OCR | Apache-2.0 | from the CDN | 5.1.1 / `@5` | no (CDN) | jsdelivr | no SRI, a floating version | E3: Zlatura's vendored 7.0.0, or OCR off (Q5) |
| … its IBM Plex | fonts | OFL-1.1 | about 60 KB if vendored | — | no (Google) | Google Fonts | sends the IP | E4: vendor it (G2) |
| Zlatura `fflate`, `filehash.js`, `intake.js`, engine, `uw-oracle.mjs` | unzip, hash, staging, math, comparison | MIT / ours | already shipped | current | yes | none | — | **Reuse** |
| gkjohnson/client-side-zip-server | a service worker serves a zip | MIT per listing (not verified) | small | not checked | yes | none | — | **Idea only.** Zlatura's `sw.js` has its own rules; about 120 lines of our own |
| jcubic/wayne | service-worker routing | MIT per listing (not verified) | small | not checked | yes | none | — | **Not needed** (one route) |
| Vitest UI's zip viewer pattern | a static site from a zip, through the Cache API, in an iframe | not verified | — | — | — | — | — | confirms the pattern; **build ourselves** |

## 11. Cost

- **Money:** no services, accounts or hosting. AI stays off in the filler
  unless Q4 is answered yes, and then it bills the broker's own key.
- **Effort:** P1 about 8-10 hours, P2 4-6, P3 8-12, P4 6-8, P5 10-14, and P6
  6-8. The designer note on `fieldmap.js` comes before P3.
- **Device:** about 7 MB per package. **Pages:** about 85 KB.

## 12. Questions for the owner (recommended default first)

1. **Q1. Authorship.** Do you own the package code and may run it inside
   Zlatura? *Default: yes. It stays private and is never committed.*
2. **Q2. Package allow-list.** Should only package versions whose hash you
   have approved load? *Default: yes. Each new Codex release is one tiny PR
   adding its hash.*
3. **Q3. Math.** Should the filler's figures be labelled and cross-checked
   (b), with only inputs saved to the deal? *Default: yes.* Should the firm
   workbook the filler fills hold the filler's own figures, with a note in
   Zlatura saying so? *Default: yes.*
4. **Q4. AI inside the filler.** *Default: off (CSP-blocked). The tool's own
   manual and paste paths remain. Zlatura's AI stays where it is.* If on:
   E2 and E6, only for non-confidential deals, and the key held in memory.
5. **Q5. OCR inside the filler.** (a) allow jsdelivr; (b) Zlatura's
   vendored Tesseract through a shim (E3); (c) off, and use UW-1's OCR.
   *Default: (c) in P1, then (b) in P2 if its test passes.*
6. **Q6. SheetJS 0.18.5.** *Default: keep it, contained by the CSP. Ask
   Codex to move the package to 0.20.2 or later in its next release.*
7. **Q7. Template.** T1 keeps the embedded workbook inside the loaded
   package; T2 strips it and loads your workbook separately. *Default: T1
   now, T2 when the template changes.*
8. **Q8. A separate origin, or a custom domain,** for full isolation.
   *Default: not now. Revisit before any accounts or multi-user hosting.*
9. **Q9. The parked UW-3 builder stash.** *Default: leave it; drop it after
   P5 merges.*
10. **Q10. The phone.** The filler was built for the desktop. *Default: it
    shows its own layout at phone size, and the "same" check covers iPhone
    width. No reflow of its screens.*

**Not determined from the code alone:**
- whether JSZip's `new Function` probe is caught under the strict CSP (P1
  checks it);
- whether Tesseract 7 accepts the filler's v5 calls (P2 checks it);
- the filler's exact rent units in its model fields (`model.js`, needed for
  `fieldmap.js`);
- how its month timing compares with the partial-year rule (M8);
- whether the escaped `innerHTML` sinks cover every path for file text (the
  P2 audit).

Live AI, OCR, Safari and Excel were not run for this proposal.

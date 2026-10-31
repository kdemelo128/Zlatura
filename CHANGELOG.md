# Changelog

## 4.7.86: One icon set, and the name and mark in one place (on the development branch; not merged or deployed)

Every icon in the app is now drawn to one spec, and the product's name and mark live in one file, so a later rename is a one-file change. Nothing a broker does changed, and no saved result or figure changed.

- **One icon set.** `app/icons.js` holds 57 icons on a 24-unit grid with one stroke weight (1.75), round caps and joins, and the colour of the surrounding text. They replace about 100 hand-pasted shapes at five different weights (1.6 to 2.4), in both Classic and the New look. The spine icons (Home, Deals, Underwrite, Comps, Tools, Review, Settings) are the ones in the approved mockups; the rest were drawn to match. Every icon is hidden from screen readers and every icon-only button keeps its own name.
- **One brand record.** `app/brand.js` now also holds the line under the name, and the mark, which is drawn once as a symbol and used by reference in the sidebar and the top bar (it was pasted twice). About 30 messages and workbook labels that spelled the name out now read it from `brand.js`. The saved-settings prefix `zlatura.` and the file format ids do not change.
- **Tested.** `tests/icons.test.js` (the spec, every name used is drawn, none drawn and unused, no shape drawn by hand elsewhere) and `tests/brand-rename.test.js` (the name appears as text only in `brand.js`, the manifest and `index.html` agree with it, the mark exists once) fail on the old code; `tests/e2e/ui-d2-flow.mjs` checks icons, names and axe in the browser at phone and desktop size, light and dark. `node tests/e2e/icon-sheet.mjs` redraws the icon sheets in `docs/proposals/ui/shots/`.
- **Saved results.** Unchanged: golden 646 figures, 0 changed; analyze-golden passes.

## 4.7.83: Convert files on your device: photos, PDFs, spreadsheets, Word and text (on the development branch; not merged or deployed)

Documents hub step D2 (`docs/proposals/documents-hub.md`, section 2). **Tools → Documents → Convert files**: pick a file and the card shows exactly what it can become and, for what it can't, the reason.

- **What it does:** JPEG, PNG and WebP to PDF (a JPEG or PNG's own bytes are embedded unchanged); PNG to JPEG, JPEG to PNG, WebP to PNG or JPEG; HEIC to JPEG (Safari only, other browsers say so); a PDF's pages to PNG or JPEG pictures (150 dpi, longest side 4096 px, a zip for several pages), or to text; Excel to CSV (one file per visible sheet; values as stored, a blank stays blank, a formula gives its last saved result); CSV to Excel (plain numbers become numbers, everything else stays text as written); CSV to JSON and a flat JSON list to CSV; text (and CSV, JSON) to PDF in a standard font; Word to text.
- **What it refuses, by name, with the next step:** Word, PowerPoint or Excel to PDF (no Office engine); old .doc/.xls/.ppt; Pages, Keynote, Numbers; TIFF; DWG; Outlook .msg; .rar/.7z; password-protected files (never unlocked); HEIC outside Safari; a character a standard PDF font can't draw (named); JSON with a record inside a record; a CSV heading that is blank or repeated; a scan with no text. A file's bytes decide its kind, never its name; a mismatch is said.
- **Limits:** 50 MB PDF, 20 MB picture, 10 MB text, 25 MB workbook or Word file, a Word file is unpacked with a size cap (fflate, so a bomb cannot inflate); a workbook goes through the shared zip guard (declared AND actual sizes: parts are inflated in small pieces and checked, so one that lies about its sizes is refused by name), 16.7 million pixels a picture, 500 PDF pages to text, 50 pages (20 on a phone) to pictures, 300 pages of text to PDF, 2 million cells a sheet; Cancel, or a minute passing, stops PDF writing at once and other runs at the next page or step; one picture or workbook being decoded can't be interrupted, so its result is dropped.
- **Nothing is uploaded.** The saved file's name appears on Home's activity list and in backups; no file contents are kept. PDFs are written in a Web Worker with the already vendored `@cantoo/pdf-lib`; no new library. Not available in this card: reading a scanned page by OCR, and anything that needs an Office engine.
- **Tested:** `tests/convert.test.js` (32 tests, each mutation-checked) and the browser flow `convert-flow` (keyboard, announcements, 44 px targets, axe at phone and desktop size, Cancel, offline) on invented files. Chromium only; not tried on Safari or an iPhone. No saved result changed.
- **Number and text safety:** CSV to Excel keeps `1.250` as text (and says so) when the file uses decimal commas or `;`; a number over 15 digits stays text; JSON numbers that would round are refused; a text starting with `= + @`, tab, return, or `-` (unless a plain number like -1200) gets a leading `'` in a CSV.

## 4.7.82: The dependency and audit checks pass again: minimatch is upgraded to the fixed version (on the development branch; not merged or deployed)

Advisory GHSA-g3hv-75wg-m249 (minimatch below 11.0.1) turned both the `dependencies` and the `audit` checks red on every branch. Only the test-time ExcelJS package pulls minimatch in; it is never shipped.

- **`package.json` overrides pin `minimatch` to 11.0.1.** Its licence, BlueOak-1.0.0, was approved by the owner on 2026-10-31 and is listed in `THIRD_PARTY.md`. `npm audit` and the osv scan both find nothing.
- **The earlier dated exception is gone** from `osv-scanner.toml`; the exception process stays for future advisories (`docs/security-checklist.md`).
- Saved results unchanged; no app code touched.

## 4.7.77: Quiet numbers now say "can't tell": a tenant with no share, a blank base amount, a negative sale cost, percentage rent with no breakpoint (on the development branch; not merged or deployed)

Cash flow step A1b, the edge cases the owner approved on 2026-10-29. A1
(4.7.74) moved each calculation into one function and changed nothing; this
changes the results in these edges on purpose. A flagged lease is left out of
the figure, so the projected recoveries (or percentage rent) and NOI are
**understated until it is fixed**; the rent roll's checks say so.

| Case | Before | After |
|---|---|---|
| Base-year recovery, base amount left blank | 25,000 (the whole pool) | 0, flagged |
| Base-year recovery, base amount typed as text such as "1,000" or "abc" | 25,000 or 0 | 0, flagged |
| Base-year or stop recovery, base amount or stop negative, or only spaces | whole pool or a wrong figure | 0, flagged |
| Stop recovery with no tenant SF | 0, no flag | 0, flagged |
| No share typed and no SF | 0, no flag | 0, flagged |
| Share stored as text ("30") | its SF share, no flag | 0, flagged (the lease editor now shows the stored text) |
| Lease ending 2026-06 with a renewal and a blank base amount | 20,833 | 0, flagged |
| Natural breakpoint, $0 base rent, none typed (6% of $1.2m sales) | 72,000 | 0, flagged |
| Natural breakpoint, $0 base rent, breakpoint $1,000,000 typed | 72,000 | 12,000 (the typed breakpoint, as the tool does) |
| Hold returns with sale cost -2 | 8.87% IRR (cost treated as 0) | "—" with a note saying why |
| DCF tool with sale cost -2 | sale price raised | refused with a message |

- **A negative sale cost** is refused everywhere: the What-if and Underwrite
  fields show the message (linked to the field and announced to screen
  readers) and keep nothing; the DCF, hold returns, sensitivity and residual
  land tools show it instead of an answer; a quick underwriting or deal saved
  with a negative value opens with the message, the Levered IRR row gives that
  as its reason, and the deal brief and workbook scenario lines say why the
  IRR is "—". Rent-roll-based What-if returns note when flagged leases are
  left out.
- **The Recovery tool** asks for the base-year expenses or the expense stop by
  name when it is blank, and says a blank is not 0.
- **Beyond the approved list** (small, and flagged here so they are not a
  surprise): percentage rent that is not natural and has no breakpoint typed
  is now flagged (the figure is unchanged, it was already left out); a fixed
  recovery whose growth is text flags the lease and drops the whole fixed
  amount (before, year 1 counted and later years were 0); a typed breakpoint
  of $0 gets a light warning, because it charges every dollar of sales
  (the figure is unchanged).
- Known gap: a fixed recovery with a blank amount still counts 0 (there is
  nothing to recover); it is not flagged.

Tested: `tests/engine-shared.test.js` (each case fails on the head before,
with mutation checks), `tests/e2e/edgecases-flow.mjs` (including typing a
minus one character at a time and a record saved with -2). Golden: 646
displayed figures, 0 changed; `analyze-golden` (618 saved results) passes
unchanged. No data-format change.

## 4.7.76: A booby-trapped spreadsheet can no longer freeze the tab (on the development branch; not merged or deployed)

The designer review of the Documents hub found that the spreadsheet reader
(ExcelJS, through its bundled JSZip) ignores the sizes a zip declares and
inflates whatever is really inside. A 25 MB .xlsx could ask for about 25 GB;
the earlier size checks only read what the file said about itself.

- **Sizes are checked as the file is unpacked.** `safeUnzip` and `hardenZip`
  in `app/filekind.js` read the zip's directory, apply the caps (100 MB in
  total, 10,000 parts, 200 to 1 per part), then inflate each part in small
  pieces into a buffer of exactly its declared size, stopping at the first
  overrun. A file whose parts are not the size it says is refused by name.
- **ExcelJS gets a copy with true sizes.** The parts are packed again with no
  compression and that copy is what ExcelJS reads: same workbook, same
  figures.
- **Every user-file site is covered:** the T-12 and sheet import
  (`checkUpload`, `readGrids`), the rent roll import and templates
  (`app/template.js`). **The rent roll import now also enforces the 25 MB
  workbook limit and the file-kind check**, as the T-12 import already did
  (it read any size before).
- **Zip64 workbooks still open** (sizes read from the zip64 fields, same
  caps); parts that share bytes, or a part header that isn't one, are
  refused; a refusal names the file.
- **Tested:** `tests/zip-guard.test.js` (a 60 MB part declared at 1,000
  bytes, over-cap, too many parts, ratio, nested zip, short and stored size
  mismatches, damaged and password-protected, a normal workbook read
  identically by ExcelJS); each cap mutation-checked. Saved results did not
  change.

## 4.7.75: A "New look" switch in Settings with new colors, type and solid bars (off by default) (on the development branch; not merged or deployed)

UI revamp step D1. Settings > Appearance > Look now offers Classic (the default, unchanged) and New look. The New look is a first slice of the visual language in `docs/proposals/ui-revamp-addendum.md`; no figure, saved deal or backup changes.

- **Tokens.** Cool slate neutrals under one brass accent, light and dark; a six-size type scale in `rem`; radius by size (8, 10, 14 px); no resting shadows and one floating shadow. Every text pair is at least 4.5:1 and every border at least 3:1, computed in `tests/look-tokens.test.js`.
- **Type.** Source Serif 4 (400 and 600, OFL, 20,088 and 21,532 bytes) is vendored in `fonts/` with its licence and SHA-256 in `THIRD_PARTY.md`, cached by the service worker, `font-display: swap`. In the New look our own Public Sans and Source Serif come before the system fonts. Classic never loads the serif files.
- **Solid bars.** The top and bottom bars lose the blur and the translucency in the New look; Classic keeps them.
- **Choice kept on this device** in `localStorage` (`zlatura.look`), applied before first paint like the theme. It is not stored in a deal or a backup.
- **Tested.** New Node test (contrast of every pair, Classic token snapshot, fonts, bars), new browser flow `ui-d1-flow` (axe at phone and desktop, light and dark, on five screens; solid bars; switching back to Classic). Golden: 646 figures, 0 changed.

## 4.7.74: One calculation in one place: recoveries, percentage rent and the sale price at exit (on the development branch; not merged or deployed)

The Tools and the rent-roll projection each worked out expense recoveries and percentage rent with their own copy of the arithmetic, and the Deal screen and the DCF tool each priced the sale at exit. The copies agreed, but would have drifted once caps and gross-ups arrive (phase A1 of `docs/proposals/argus-class-cashflow.md`).

- **One function each:** `app/engine/recovery.js`, `app/engine/pctrent.js` and `app/engine/returns.js`. `calc.js`, `lease.js` and `deal.js` call them. Nothing changes on screen and no saved result moves: 646 figures compared, 0 changed; the 618 saved results pass. The projection is bit-for-bit what it was (same order of operations; a text amount such as '90000' is still read as a number). The one exception is the Percentage rent tool and the DCF tool's sale price, which may differ from before in the last digit of the unrounded number (no cent moved in the probes: the percentage-rent tool's order of operations now follows the projection's, and the DCF sale price keeps its own).
- **Where the copies still differ at the edges** (kept exactly as they were, reported to the owner): an unknown tenant share is "can't tell" in the Recovery tool but 0 in the projection; a negative sale cost is ignored on the Deal screen but applied in the DCF tool; a natural breakpoint on a zero base rent is 0 in the projection but falls back to the typed breakpoint in the tool.
- **Rule written down:** the clean-room rule (no decompiling, tracing or circumventing vendor software; no vendor formats, layouts, help text, leaked code, model files or trademarks) is now in `docs/working-rules.md` and `CLAUDE.md`. A code comment no longer names a vendor.
- **Timing:** measured in Node on the main thread (not in the browser worker), 500 invented leases over 10 years with recoveries and percentage rent on every lease: median about 84 ms before, about 82 ms after.
- **Tested:** `tests/engine-shared.test.js`. The hand-worked cases are the independent check; the property tests (projection against Tools) are drift guards for later phases, since both sides now share one function. Also pinned: the kept edge behaviours, a year-3 percentage rent of $267,909.38, and the DCF sale price on a grid; each fails on the previous code; nine mutations of the new functions are each caught.

## 4.7.73: A new Underwrite tab: type a price, NOI and loan terms and see the answer, with no deal (on the development branch; not merged or deployed)

The first step of the Underwriting workspace (`docs/proposals/underwriting-workspace.md`, approved by the owner 2026-10-23). Sets, combined figures and shared assumptions are later PRs.

- **Underwrite tab**, after Deals. A quick underwriting card takes a price, NOI, building SF, units, property type, loan terms (loan to value, rate, amortization, closing costs, lender minimums, interest only) and hold assumptions, and shows cap rate, price per SF, per unit, loan, DSCR, debt yield, cash-on-cash, equity, the largest loan and what limits it, levered and unlevered IRR, equity multiple, and the price for a target cap rate and a target levered IRR. Every figure comes from the same engine the deal page uses (`analyze`, `runScenario`, `irr`, `scenarioAnswers`), with the deal page's labels. A blank is absent, never 0; a blank hold, growth, exit cap or sale cost uses the engine's default, shown in grey. Gross income less expenses is offered as NOI with a "Use as NOI" tap, never filled in.
- **Saved as you type**, on this device: new saved key `uw.scratch` (newest first, at most 100; the 101st is refused, never trimmed). Money is kept in whole cents. A record from a newer version is kept as it is, not shown, never rewritten. `KV_MIGRATIONS` (empty) is added to `app/migrate.js` for later changes to such records.
- **Save as a deal** makes a deal through the existing deal path (figures marked as typed by hand, history "Created from a quick underwriting"), then removes the quick underwriting, with a toast Undo that removes the deal and brings the quick underwriting back. Delete has an Undo too.
- **Navigation (decision 7, Classic):** the phone bar is Home, Deals, Underwrite, Comps, Tools (and Review while something waits); **Settings moved to a gear in the top bar**. The desktop sidebar gains Underwrite and keeps Settings. The new look is not built yet; its phone bar (Home, Deals, Underwrite, Comps, More, with Tools under More) is recorded in `docs/proposals/ui-revamp.md`. The search menu gains "Underwrite" and "New quick underwriting".
- **Deviation from the proposal's record shape:** `loan.minDy` (lender minimum debt yield) is also stored. Without it the card's "Largest loan" would differ from the saved deal's, because a deal defaults it to 8.
- **Backups** carry `uw.scratch`: a merge restore adds the missing ones and keeps the newer `updatedAt`; a replace restore says how many on the device would be deleted; unreadable records are left out and counted. `BACKUP_VERSION`, `SCHEMA`, the database version and the deal record are unchanged. An older app drops the key with its existing "left out" line.
- **Tested:** `tests/uwstore.test.js`, new cases in `tests/backup.test.js` (including every backup fixture, 3.1.0 to 4.7.56, restoring to the plan 4.7.56 gave: new fixture `backup-4.7.56-before-uw-workspace.json`, made by `tests/tools/make-backup-4.7.56-uw.mjs`) and the browser flow `underwrite-flow` (phone and desktop, typing key by key, figures equal to a deal page, reload, Save as a deal and Undo, Settings and Tools reachable, axe, 150 ms per edit). `shell-flow` and `mobile-audit` follow the moved Settings button.
- **Saved results:** unchanged (618 saved deal results and 646 displayed figures identical).

## 4.7.72: Code scanning alert 12, second fix: the download link is set in one step (on the development branch; not merged or deployed)

CodeQL alert 12 (js/xss-through-dom, high) stayed open after 4.7.65. Reproduced locally with CodeQL 2.27.3: it follows a deal name typed on the page into the calendar file's text, then into the download link built from that file.

- **What the alert is:** the link points to a file the browser itself made (a `blob:` address) and the file name is already cleaned, so no script address can reach the link: a false positive in substance. CodeQL does not know that.
- **Change:** `handOver` in `app/kit.js` sets the link's address and file name together with `Object.assign`. Nothing else changes: same link, same file, same name.
- **Checked:** the same CodeQL query run on main before this change gives 1 result (app/kit.js, the link); after it, 0. No test can see this difference (the app behaves the same); calendar and download flows pass unchanged. Saved results and figures unchanged (golden identical).
- **Not verified:** that GitHub's own CodeQL (a different version) clears alert 12; the alert stays open until its next scan on main says so, and it is not dismissed.

## 4.7.71: A deal can be marked confidential: AI stays off it and its exports say so (on the development branch; not merged or deployed)

Plan 19.2 asked for a confidential tag. A deal's menu now has **Confidential**; a marked deal shows a "Confidential" chip and a "(Confidential)" badge in lists and the pipeline.

- **One guard for AI:** every call to the firm's AI server goes through `request()` in `app/ai.js`, which now needs a scope (the deal, the research subject, or health). A marked deal, its saved copy, research started from a contact on it, or research on an exactly matching company name is refused before anything is sent. The AI menu items are off for a marked deal; Transcribe, Make notes and contact Research stay focusable and say why when tapped.
- **Marks, only when set:** CONFIDENTIAL in the summary, the brief (top and foot), the deal and rent roll workbooks (header, footer, title; no figure cell changes), the rent roll CSV and workbook file names, filled-template file names with the audit sheet forced on, call notes and the pipeline.
- **Data:** one optional `confidential` flag on a deal; no schema change. A backup carries it as it is. An older app restoring a newer backup ignores the flag.
- **Limits, stated in the sheet:** works on this device only, is not access control, recalls nothing already sent; comps and Tools outputs are not marked.
- **Tested:** `tests/confidential.test.js`, `tests/ai-guard-scan.test.js` (every network call goes through the guard), `tests/e2e/confidential-flow.mjs` (phone and desktop, axe). Saved results and the 646 displayed figures are unchanged.
- **Sheets with many choices keep their Cancel button on screen** (`app/styles.css`): the deal actions sheet gained a row and its Cancel button fell below the bottom of a phone-sized screen, because the list could take the whole height and left no room for the button under it. The list now leaves room for it and scrolls. `back-flow` caught it.

## 4.7.70: Merge, reorder, split and extract PDF pages on your phone (on the development branch; not merged or deployed)

Tools has a new Documents group with **PDF pages**: add PDFs, see every page, move, turn or delete pages, then save the lot as one PDF, a set of pages ("1-3, 7"), or one file for each range in a zip.

- **On the device.** The files are read and written in a Web Worker with `@cantoo/pdf-lib` 2.11.1 (vendored, MIT, 617 KB, cached for offline use; checksum in `THIRD_PARTY.md`). Nothing is uploaded and no file is stored.
- **Refused in words.** A password-protected file (told apart from a damaged one by looking again without strict parsing), a file cut short (no end marker, a missing page, or a page whose content is gone), a picture named .pdf, a 21st file, a file over 50 MB or a set over the device's size cap (150 MB, 60 MB on iPhone) is refused by name before anything is written. No password is asked for or guessed.
- **A new document with only the pages.** Page actions, JavaScript and launch links, attachments, and the original's open action and embedded files are not carried over. Links, form widgets and bookmarks that point at a page or file are cut so a page that was not picked cannot ride along, and a final check refuses to write if one still did; web links are kept. The screen says, before saving, that bookmarks, scripts and form fields are not kept and a digital signature will no longer verify.
- **Hostile names.** The saved file name goes through `downloadName`; file names shown on the page are text, never markup.
- **Phone first.** 44 px buttons, spoken page labels and move announcements, Cancel in reach, and the list updates only the rows that changed (a turn with 404 pages listed takes about 3 ms).
- **Only what the picked pages use.** Each picked page's resources are rebuilt from the names its content draws, so pictures, fonts and forms that only other pages use (pages often share one resources dictionary) are not copied; form XObjects are cut the same way. A page that uses a form without resources of its own, a Type 3 font, a tiling pattern, a soft mask or an annotation look without resources, or whose content cannot be decoded, keeps its resources whole (a picture lost from a page is worse than one kept), and the screen says so after saving: for those pages some resources were copied unchanged, which can include pictures from other pages of the same file, so check the result before sharing. A kept link keeps only a web address, a named reader command, a layer switch or a transition; any other action, a partial action, a form's kids, attached files and article threads are cut.
- **Known gaps.** The 60-second watchdog is one flat limit, not scaled to the size of the job. A file cut short is recognised by a missing `%%EOF` in its last 1 KB (a cut file with a tail appended, or a good file with more than 1 KB of junk after its end, is judged by the other checks only). Optional-content layers (hidden layers) are not carried over and may show.
- **Tested** with invented PDFs generated by `tests/tools/docpdfs.mjs`: `pdfpages.test.js` (page model, ranges, limits, the worker run as a browser runs it, read back with pdf.js) and `documents-flow` (Chromium at phone size, axe at phone and desktop size, every text field typed key by key, offline). Not tried on Safari or an iPhone. Saved deal results and the 646 displayed figures are unchanged.

## 4.7.69: Docs and tests now match what shipped (conformance drift fix) (on the development branch; not merged or deployed)

The conformance check of 4.7.50 to 4.7.64 found stale documents, one missing test and one fragile selector.

- **Acceptance matrix:** rows added or corrected for the Back button, hostile text and time zones, the -$0 fix, the .ics export, the rent schedule, cost caps and the prompt-injection set; the header now says which version it covers.
- **PLAN_STATUS:** F3, F6 and F7 ticked, F10 split out, the counts recounted, and a new section "Owner additions and changes to the plan" records the owner's additions (Monal rename, platform expansion, lead finder last, Documents hub, UI revamp, time-zone acknowledgement, work order). The master plan is not edited.
- **Feature study:** `feature-ideas.md` now records the owner's approvals of ideas 1 to 3.
- **New test:** `tests/e2e-flows-listed.test.js` fails when a `*-flow.mjs` file is missing from the FLOWS list of `tests/e2e/run.sh` (om-flow, a diagnostic, is exempt).
- **Undo on a deleted brief** builds its selector with `CSS.escape`, so a stored id with a quote cannot throw.
- Tested with the new Node test, which fails against a `run.sh` that leaves out a flow. Saved results and displayed figures are unchanged.

## 4.7.68: A deal can now carry a tenant credit record (on the development branch; not merged or deployed)

Who pays the rent and who guarantees it had no place on the deal beyond the OM's tenant and guarantor text.

- **The Credit card** on the deal page: the tenant entity on the lease, an optional parent, the guarantor (the OM's guarantor is offered with a Use tap, never copied in), the guaranty's scope, limit and end date, ratings the broker types (agency, rating, outlook, as-of date, source), annual store sales, and whether the lease lets the tenant go dark. A deal with no record shows "Add a credit record"; absence never means "none".
- **Ratings are typed, never fetched.** A rating can't be saved without an agency, a rating, an as-of date and a source. Capitals are evened out only for an exact match on the agency's scale (AAA to D, Aaa to C); anything else is kept as typed with "Not a rating on the {agency} scale; kept as typed, with no investment-grade label." BBB- and Baa3 and above read "Investment grade on the {agency} scale, as typed". Every rating line ends "Typed by the broker on {date}; not verified by Zlatura."
- **Seven checks, on the card only:** the rating doesn't stand behind the rent (only a parent is rated), the guaranty ends before the lease, a limited guaranty with no limit, a rating over 12 months old, the OM's guarantor differs, rent as a share of the sales typed, and go dark. They are not in the deal analysis.
- **Where it goes:** the deal page and the backup. Typed ratings are on no client-facing document yet, and store sales are never exported.
- **Saved-data format 6** (silent step `credit-record`, nothing already stored changes). An app from 4.7.67 or earlier refuses a backup from an updated device ("update the app first") rather than dropping the credit record, as with the fee record. Store sales are kept in whole cents.
- **Tested** with invented deals: `credit.test.js`, `money.test.js`, `migrate.test.js` on an invented 4.7.64 backup, and `credit-flow` (typing character by character, the hostile text pack, axe, reload, Undo, backup and restore). Golden results unchanged.

## 4.7.67: The checks now ask about a missing or low management fee, payroll, free rent and unstated occupancy (on the development branch; not merged or deployed)

Warnings and questions only: **no figure, saved result or stored field changes**. A missing line is never read as $0, and with no evidence a rule stays silent.

- **Management and payroll (6.3.5):** a T-12 with at least 4 expense lines and no management fee asks "Self-managed, or left out?"; payroll is asked about only for multifamily of 50 units or more. A fee under 2.0% of EGI, or payroll under $500 a unit a year, is a note. Silent on a net lease and while any T-12 line is still to review. A $0 management line is a low fee, not a missing one.
- **Free rent (6.3.7):** the free rent the leases document in the 12 months after the as-of date, against the T-12's concession line. Projected abatements are left out. Silent when the OM's rent line says "net of free rent"; with no T-12 it is a question only.
- **Occupancy (6.3.8):** when the OM's occupancy line says neither physical nor economic and the rent roll's leased SF and the T-12's collected rent differ by more than 5 points.
- **Settings:** five levels (`om.items.min`, `om.payroll.units`, `om.mgmt.low`, `om.payroll.low`, `om.occ.gap`).
- **Not built:** the OM-statement half (the OM's own expense, concession and reserves lines). A saved deal keeps only a count of the OM statement's rows, so it needs a stored field: left to the owner's decision.
- **Tested:** `tests/redflags.test.js` (each rule fires and stays silent, with boundaries), `impact.test.js` (every new read is on the map), `rollchecks-flow`; mutation-checked. Golden outputs unchanged.

## 4.7.66: Two honest-figure fixes: rent schedule price and fee tier limits (on the development branch; not merged or deployed)

The rent schedule divided rent by a price the app had itself worked out from NOI and the stated cap rate, so it echoed the cap back as "Cap rate". The commission calculator counted a band twice when tier limits did not rise ($5M with limits $2M then $1M gave $200,000, not $160,000).

- **Rent ÷ price uses only a typed price.** With only a derived price, the schedule card, copied text, brief and workbook sheet show "—", the note "No price entered", and never the label "Cap rate".
- **Tier limits must rise.** `commission()` returns no result for falling or repeated limits; the Tools calculator and the fee card say "Tier limits must rise" and the fee card shows no expected fee.
- Tested with Node tests (`tests/rentschedule.test.js`, `tests/calc.test.js`) and the rent-schedule, fee and tools flows. Saved deal results and displayed figures are unchanged (golden).

## 4.7.65: File names handed to the phone are made safe first (code scanning alert 12) (on the development branch; not merged or deployed)

CodeQL alert 12 (js/xss-through-dom, high) flagged `app/kit.js` `handOver`: a file name built from text typed on the page (a deal name) went to the download link and the share sheet unchanged. The name is not HTML, but a name with path separators, control or right-to-left characters, quotes or angle brackets should not reach a download link, so it is cleaned at the one place every file passes through.

- **`downloadName`** (`app/kit.js`): path separators, quotes, `:*?<>|` become hyphens; control, line-separator and bidirectional characters are removed; leading dots, spaces and hyphens are dropped; the name is cut to 120 characters with its extension kept; an empty name becomes "file". Ordinary names, accents, non-Latin text and emoji are unchanged. `handOver` cleans the name before the share sheet, the artifact save channel and the download link.
- **Tested:** `tests/downloadname.test.js` (5 tests) fails on the old code (the function does not exist there). No saved result, data format or figure changes: golden identical.
- **Not verified:** whether CodeQL clears the alert on this change; the alert stays open until the next scan says so, and it is not dismissed.

## 4.7.64: Net lease rent schedule, with rent over the asking price for each period (on the development branch; not merged or deployed)

A net lease deal now shows its stated rent as a schedule: each dated rent period with its yearly and monthly rent, $/SF, the rise over the period before it, and rent over the asking price.

- **Only what the lease states.** The schedule reads the rent periods and nothing else: no period is invented after the last one, a gap shows as "No rent stated", per-SF rent with no SF shows "—" (never 0), and free rent is a note (the amount stays at contract rent).
- **Rent over price is not called a cap rate** unless the lease type says "absolute"; "NNN" alone gets a footnote saying the landlord may pay some expenses. With no price it asks for one; with more than one tenant there is a table per lease and no price column.
- **Where it shows:** a Rent schedule card on the deal page, "Copy rent schedule" (tab-separated, also in the deal menu), a Rent schedule section in the deal brief, and a Rent Schedule sheet in the deal workbook (rent over price is a formula on the Deal Analysis price).
- **Tested:** `tests/rentschedule.test.js` (hand-worked figures, workbook and brief), the impact map tests, and the `rent-schedule-flow` browser flow (values, copied text, hostile names, axe). Saved results and displayed figures are unchanged.

## 4.7.63: Key dates and task due dates go to the iPhone calendar (on the development branch; not merged or deployed)

A deal's key dates had nowhere to go except by hand into Calendar.

- **Add to calendar…** on the Key dates heading, and a calendar button on each date, open a sheet: tick the dates and tasks, optionally add the 1031 day 45 and day 180 dates from the deal's one Closing date, choose whether titles show the deal name (with a warning for shared calendars), and make a `.ics` file.
- **All-day events**, ending on the next day, with stable ids so adding again updates the same events; a reminder at 9 a.m. a week before and the day before (tasks: the day before). Blank, invalid and done dates are left out and counted; nothing is set to today.
- **Safe text**: line breaks and special characters in titles are escaped, and lines fold at 75 bytes without splitting a character.
- **Sharing**: the home-screen app uses the share sheet and checks the real file type; elsewhere it downloads. `canShareFiles` now tests the type it is given (it only tested Excel before).
- Nothing is fetched or stored except the "show deal name" choice on this device. Not yet tried on an iPhone.
- Tested: `tests/ics.test.js` (exact file text, folding with emoji and Arabic, injection, date rollovers, three time zones), `tests/e2e/calendar-flow.mjs`. Saved results unchanged.

## 4.7.62: The phone's Back button returns to the last screen and never closes the app (on the development branch; not merged or deployed)

Back used to leave the app, because switching screens rewrote the address instead of adding to it.

- **Each screen is a step Back walks through.** Opening a screen or a deal (`#deal/<id>`) adds one history entry; choosing the screen already shown adds none. Back returns to the last screen or deal, Forward goes on, and a reload on a deal's address reopens that deal.
- **Sheets and the command menu close first.** An open sheet holds its own entry, so Back closes it and stays on the same screen; closing it with its own button leaves no extra Back press.
- **Back from the first screen stays in the app.** A guard entry under the first screen (added on the first tap or key, because Chrome skips entries a page adds without one) sends Back straight forward again.
- **Not changed:** the sections inside a deal (Overview, Rent roll and so on) are not history steps. No stored data, saved result or backup changed.
- **Tested:** `tests/e2e/back-flow.mjs` at phone and desktop size, with axe; each check was run against the old code and fails there. Not yet tried on a real phone's Back gesture (Playwright calls `history.back()`).

## 4.7.61: A fee record on each deal, and a Fees CSV (on the development branch; not merged or deployed)

Until now the commission calculator in Tools worked out a fee and kept nothing: a broker could not record what a deal's fee was meant to be, what had been invoiced or what had been paid.

- **A Fee card on the deal.** The terms (the fee price, a flat rate or up to three tiers, the co-broker, referral and house shares), the expected fee and its splits, the invoice (amount, date, reference), a list of payments, and what is outstanding. The fee price is never guessed: with none typed the expected fee stays blank, and one tap ("Use the asking price") copies the asking price in as if typed. The split shows only when all three shares have been entered; a blank share is not 0, and a typed 0 is.
- **Home, Report, Fees CSV.** One row per deal that has a fee record: the terms, the expected fee and each split, what was invoiced and paid, the last payment and what is outstanding. Money is written to the cent, and a deal name or reference that a spreadsheet would read as a formula gets the same guard as the comps CSV. The file starts with a UTF-8 byte-order mark (so Excel reads names correctly), which sits before the first header cell. A tier with a limit but no rate gives no expected fee (the card says which tier), and a share over 100% is warned about.
- **One fee formula.** The expected fee is `commission()`, the function behind the Tools calculator, through the new `feeSummary()` in `app/calc.js`. It is calculated each time and never stored.
- **Data format change (approved 2026-10-23).** `deal.fee` is stored on the deal in whole cents (the price, the tier limits, the invoice and each payment), with rates as typed (0.5 is 0.5%). A deal with no fee record has no `fee`, never $0. A silent migration step `fee-record` moves every deal to schema 5 and changes nothing else (no history entry, no new "last edited" date). Backups carry the fee with the deal and stay at backup version 2. A 4.7.56 backup restores and its deals move to schema 5; a backup made by this version is refused by 4.7.56 and earlier with "update the app first", so an older app cannot drop a fee. The template fields Expected fee, Fee invoiced and Fee paid to date are available to a firm's Excel template.
- **Tested** with an invented 4.7.56 backup (`tests/fixtures/backup-4.7.56-before-fee-record.json`, made by `tests/tools/make-backup-4.7.56.mjs`): the step sets schema 5 and no other field changes. New cases in `migrate.test.js`, `money.test.js`, `calc.test.js`, `exporters.test.js` and `backup.test.js` (a damaged fee is read without an error and shown blank, never 0), and the browser flow `fee-flow.mjs` (typing one key at a time, reload, Undo, the CSV, backup and restore, axe at phone and desktop size, the 150 ms edit budget). Each new test fails on the old code, and each guard has a mutation check.
- **Saved results:** unchanged (618 saved deal results and 646 displayed figures identical).

## 4.7.60: Hostile text and time zones: names and notes come back exactly, no export runs as a formula, dates show the same day in every zone (on the development branch; not merged or deployed)

A security pass over text a person types or pastes, and over every date the app works out from the device's clock. Nothing stored is rewritten and there is no migration; the CSV date fix changes only future imports.

- **Copy comp table:** a property name such as `Acme<tab>=1+1` pasted `=1+1` into its own cell, because tabs inside a name were kept and the formula guard did not cover tabs or returns. Tabs and line breaks in a name now become spaces, then the guard runs (`tsvCell` in `exporters.js`).
- **Rent roll CSV:** a negative number was written as the text `'-1200`, and a lone carriage return split a row. It now uses the comps CSV's one cell writer (`cell` in `exporters.js`): numbers stay numbers, text that starts like a formula is guarded, line breaks stay inside quotes.
- **Rent roll CSV date:** `May 31, 2027` was stored as 05-30 east of UTC. It is now read as the calendar day typed.
- **1031 exchange clock:** the deadline for a Mar 1 closing (Apr 15) showed as Apr 14 in US zones. The dates are shown as the calendar day they are (`niceDay` in `kit.js`).
- **Lease years left (`termLeft`):** a printed date such as "January 31, 2036" was read in the device's time zone, so the figure moved with the zone: 190 of the 618 saved results failed under Los Angeles or Kiritimati. It is read as that day's UTC midnight, as the OM reader does. "Today" in the rent roll checks was the UTC date; at 8:30 pm in Los Angeles it named tomorrow. It is the device's calendar day now.
- **Filled-template audit sheet:** a text of more than 32,000 characters was escaped and then cut, which could split `&amp;` and break the sheet's XML. It is cut first, then escaped.
- **Text direction:** every text input and textarea, and the deal and tenant names in lists, set `dir="auto"`, so Arabic or Hebrew reads right to left.
- **Tested** with an invented pack (`tests/fixtures/hostile.js`: apostrophes, emoji, Arabic, a direction mark, markup, formula starts, 40,000 characters with an `&` at 31,998, control characters): `tests/hostile-tz.test.js`, a new `npm run test:tz` (the Node suite under America/Los_Angeles and Pacific/Kiritimati, in `check:full` and in CI after `npm test`), and `tests/e2e/hostile-flow.mjs` (typed key by key into a comp, a tenant, the deal name and a site-visit note; kept through a reload and a backup restored into a fresh profile; both CSVs, the copy table, both workbooks, the filled templates, the printed pages, the PDF and the AI request body read back; no dialog or script; run with Los Angeles and London clocks). Each fix fails on the old code and has a mutation check.
- **Saved results:** unchanged in every zone (618 saved deal results and 646 displayed figures identical; the 190 differences under Los Angeles and Kiritimati on 4.7.56 are gone).
- **Not tested:** Excel's 32,767-character cell limit and its 2,079-character hyperlink limit (the comps workbook writes a 40,000-character map link for a 40,000-character name), and Safari's `dir="auto"` (WebKit is not installed here).

## 4.7.59: Read the text in a site photo (a sign, a name, an address) on your device (on the development branch; not merged or deployed)

A site photo can carry the property's address, a business name or a "for lease" phone number. Each photo on the Site visit tab now has a "Read the text in this photo" button (Aa).

- **On request, on the device.** The OCR the app already ships (Tesseract, loaded only on that tap, from this site) reads the photo. No image leaves the device; no request goes to another site.
- **Shown, not kept.** The lines found appear in a sheet marked "Read from the photo", each with its confidence and a note where it looks like a phone number or a street address. Closing the sheet discards them. Nothing new is saved.
- **Used only on your tap.** Each line has Copy, "Use as address" and "Use as deal name". One line, one field, with Undo. Nothing is applied automatically.
- **No faces.** Nothing looks for people or faces; a test fails if face-detection code or a model appears in `app/` or `vendor/`.
- **Tested** with invented signs only: `photo-text.test.js` (line tidying, tagging, the no-face check) and `photoocr-flow` (a sign drawn on a canvas, read in Chromium, used and undone). Not tried on a real photo, an iPhone or Safari. Money, the engine and saved results are unchanged (golden 646 figures, 0 changed).

## 4.7.58: Company research briefs now have screens: start one, read it, tick the claims that check out (on the development branch; not merged or deployed)

The AI server route (B1a) and the device model (B1b) had no screen. This adds them, on a phone first.

- **Start a brief** from the command palette ("Research a company", "Research briefs"), from a contact's sheet ("Research company", which fills in only the company name, never the contact's name), or open one from Review. Sources are PDFs you upload or text you paste; nothing is fetched from the web. A required tick says you are entitled to use the sources, and the send is confirmed first, naming the server, saying the files and pasted text go in full (a PDF as the whole file), and that contact names are not sent.
- **The brief** has ten collapsible sections. Each claim says what it is in words: **Confirmed** (found in your source when checked, stated outright, and ticked by you), **Hypothesis: not confirmed** (with its reason) or **Refused as proof** (with its reason: a shared registered agent, mailing address or surname). Only a found, stated claim can be ticked; a tick saves at once and has an Undo. A scanned source says its quotes can't be checked. The cost the server charged is shown.
- **Possible links to your contacts** shows "This may be your contact X" with "Not saved to the contact". Nothing is written to contacts or to any CRM record.
- **Errors** (a daily or job limit, a refusal) show the server's own message. A failed brief stays in the list as Failed.
- **Delete a brief** with Undo. **Review** gets one item for each brief that still has claims waiting for your tick.
- Focus stays on the claim you ticked, and each tick or delete is announced to screen readers. "Research company" on a contact with unsaved edits asks whether to save them first.
- Text from the model or a source is always drawn as text, never as markup.

Tested with invented companies and a stubbed server answer: a new browser flow (`tests/e2e/research-flow.mjs`) at phone and desktop size covers starting from a contact and the palette, the request holding only the company and the documents, the status words, the tick gate, undo, a refused claim, a contact match with nothing written, a 429 and a 422 message, axe, and a tick under 150 ms with 150 claims; `tests/research-review.test.js` covers the Review item. No real model was called, so the quality of real briefs and their cost are not verified. Saved deals, the engine and golden outputs are unchanged.

## 4.7.57: Checks: up to eight browser-suite runs at once on one machine, each on its own ports (on the development branch; not merged or deployed)

With builder agents now working in parallel worktrees (owner, 2026-10-22), every browser run still queued for port 8080: a full suite takes about half an hour, so a third or fourth run waited an hour before it started.

- **Slots:** `tests/e2e/run.sh` now claims the first free slot of ports instead of one fixed lock. Slot 0 is what CI and older branches use, unchanged: port 8080, and 8096 to 8098 for the flows that serve an old copy (migrate, rename, upgrade). Slot n uses port 8080+n and 9000+10n to 9002+10n. Up to `E2E_SLOTS` runs go at once, by default half the machine's CPUs (at least one): the flows hold a 150 ms-an-edit perf budget, and on a 4-CPU machine with six agents and several suites running, a run measured 195 ms, which says nothing about the code; when all are busy a run waits, as before (`E2E_LOCK_WAIT`, default 1800 seconds).
- **Safe takeover:** a slot whose run has gone is taken over; one never given a PID is taken over after a minute; a slot whose port is already served without a lock (a server someone started by hand) is skipped, where it used to fail the run with "Port 8080 is in use". `E2E_PORT_BASE` (default 8080) moves the whole range, which the tests use so they never depend on what the machine is serving. Slot 0 keeps the old lock's name, so a run from an older branch and a new one never both use 8080.
- **A `BASE` given by the caller** (an old-code run) is kept.
- **LibreOffice per slot:** the workbook recalculation (`recalc.py`, and `lo_values.py`) now takes its socket port from the slot (2002 and 2003 on slot 0, as before; 2002+10n and 2003+10n on slot n) and, beyond slot 0, its own LibreOffice user profile. Two LibreOffice instances on one port or profile locked each other up: a parallel run hung for over 20 minutes in the recalculation. Each recalculation now also has a 5-minute timeout, so a hung LibreOffice fails the run instead of stopping it.
- **A time-of-day test bug fixed (from F12, 4.7.47):** `ai-flow`'s daily-limit check expected "resets … in 6 h 12 min", but within the last hour before 00:00 UTC the server rightly says "in 31 min" (`server/budget.mjs` `untilReset`), so the check failed if the suite ran then. It now accepts both forms.
- **Tested:** `tests/e2e-lock.test.js` (a free machine gets slot 0 and the CI ports; with slot 0 held a run takes slot 1 at once with its own ports; every slot busy waits then stops; a stale slot is taken over; a caller's BASE is kept). All six fail on 4.7.56. A real run of `home-flow` took slot 1 (port 8081) while another agent's run held slot 0, and passed. No app code changed.

## 4.7.56: A warning when the rent roll may count expense recoveries twice (on the development branch; not merged or deployed)

A rent roll can carry an other-income line worded as a recovery (for example CAM reimbursements) while its leases also recover expenses from the operating-expense pool. Both reach the roll's projected income, so the roll's NOI would count them twice.

- **New Review Queue warning** (`rollRecoveriesTwice`): it fires only when a non-vacant lease has a recovery method other than none and an other-income line with a non-zero amount is worded as a recovery. The wording uses the T-12's own label rules, so there is one vocabulary. Blank or $0 amounts never fire it. It changes no figure; the broker decides which entry to keep.
- **Support-code check adopted.** The owner's support code had a check that fires when tenant-billed charges and per-tenant pool recoveries are both switched on for the forward NOI. The app's equivalent of billed charges is an other-income line or a fixed recovery, so the check is adopted in that form. Its month-by-month comparison of statement recoveries against billed charges is not applicable yet (the app keeps no billed-charge series; it belongs to deferred U8). Nothing from the support code is copied.
- **Pinned, not changed:** the T-12's recoveries and the roll's projected recoveries never both reach NOI (test G1); only operating expenses pass from the T-12 to the roll.
- **K40 wording** in the underwriting proposal and the acceptance matrix now says the deal engine takes management as the statement reports it.
- **Tested** with invented fixtures: R1-R5 in `tests/roll-checks.test.js`, G1 and a dependency-map case in `tests/impact.test.js`, each with a mutation check.
- **Saved results:** unchanged (618 saved deal results and 646 displayed figures identical).
- **Known edge case:** an other-income line named "Utility reimbursement" (or RUBS) fires the warning, because it is a recovery in substance. When the leases' recoverable pool excludes utilities that is a false alarm; the warning says "may" and changes no figure, but under strict review it blocks until reviewed.

## 4.7.55: Company research briefs get a home on the device (nothing to see yet) (on the development branch; not merged or deployed)

The device side of company research (B1b). The server route (B1a) and the screens (B1c) are separate PRs, so a broker sees no change yet.

- **One new saved key, `research.briefs`:** a list, newest first, at most 200. At 200 a new brief is refused and the broker is asked to delete one; nothing is trimmed silently. Each brief keeps its claims with a quote of at most 600 characters; the source text is never kept, and no contact name is ever stored or sent.
- **Kept 365 days:** each brief has a `retainUntil` 365 days after it was made, and briefs past it are removed when the app starts, next to the 30-day trash sweep.
- **Status is worked out on every read:** a claim is "confirmed" only when its quote is found in the source the broker supplied, the words state the relationship, and the broker ticked it. A "confirmed" in storage or in a backup is never trusted. A quote under 12 characters, or one that does not contain the claimed name, is not accepted. A shared registered agent, mailing address or surname, or a quote about an agent or address, is refused as evidence of a relationship.
- **A quote check is recorded when the brief is made and carried in backups; it is not re-run, because the source text isn't kept.**
- **Limits on read and restore:** a brief shows at most 150 claims; retention is never later than 365 days after the brief was made, whatever `retainUntil` says; a merge that leaves more than 200 briefs says so in the restore summary (new briefs are then refused until some are deleted); a malformed brief in a backup opens and deletes without error; a claim whose subject or object is over 300 characters is dropped, not cut.
- **Contact matching** (an exact full name of two words of two letters or more, so an initial never counts, or an exact company name of two words or more, never the person side of an officer claim; a surname alone never matches) runs only when a brief is drawn and is never stored.
- **Backups:** `research.briefs` is on the backup allow-list. A merge restore keeps the newer `updatedAt` for a brief on both sides, adds the rest, and skips briefs past their `retainUntil`. The backup format version stays 2, `crm.*` is unchanged, saved deals are unchanged. A backup that carries briefs restores on 4.7.50 and earlier with the key left out and counted as a setting that version does not use; nothing breaks.
- **A replace restore from a backup without the key removes the briefs on the device,** as it does for every saved key. The restore summary now says how many (for example "3 research briefs on this device will be deleted").
- **Decided, reversible:** one key instead of the proposal's five; a quote found on another page counts as found; at most 150 claims a brief.

Tested with Node tests (`tests/claims.test.js`, `tests/research.test.js`, additions to `tests/backup.test.js`) on invented data, including backups made by 4.7.50 and 4.7.36, which give the same restore plan as 4.7.50 did. Saved deal results and displayed figures did not change.

## 4.7.54: Checks: the AI server's own tests now run in check:full, and in check:quick when server/ changes (on the development branch; not merged or deployed)

GitHub's CI runs the AI server's test suite (`server/`, its own package), but `check:full` did not, so a server test could pass every local check and still fail CI. That happened on #78: the research route's injection test began sending more requests than the per-minute limit allows once #76 doubled the injection set, and only CI saw it.

- **`check:full`** now runs `npm test` in `server/` after the root suite, installing the server's one package first if it is missing.
- **`check:quick`** runs it too whenever a file under `server/` changed.
- **Tested:** `tests/check-tools.test.js` fails if either rule is removed (it fails on 4.7.53's `check.mjs`); a quick check with a file added under `server/` ran the 43 server tests, and one without did not. No app code changed; saved results and golden outputs are unchanged.

## 4.7.53: The AI server can now write a company research brief (server only; no screen yet) (on the development branch; not merged or deployed)

Phase B1a. Nothing in the app calls the new route yet; the device storage (B1b) and the screens (B1c) are later PRs, so a broker sees no change.

**New route.** `POST /api/research` takes `{subject, documents}` only: 1 to 10 PDFs or text files and at most 60,000 characters of text. Any other key (a contacts list, for instance) is refused with 400 `unexpected_field`, so contact names cannot be sent even by mistake.
**What the model is told.** Use only the documents; every claim carries a verbatim quote; names are copied as printed, never merged; a shared registered agent, mailing address or surname is never evidence of a relationship; no personal attributes. The injection rule is carried word for word.
**What the server keeps.** The answer is cut back to a closed list of 13 claim kinds and 7 sections, one quote of 3 to 600 characters per claim, a real document number, at most 150 claims. A claim inferred from an agent, address or surname is always marked inferred. The server never marks anything verified; that check is on the device (B1b).
**Cost.** Same hook as the other routes: held before the call, refused over the job cap (422, no model call) or the day (429), released on an error with a status, charged the hold on a dropped connection. The reply carries `chargedCents`. Research shares the existing caps; no new setting.
**Not built.** The numeric lead score is deferred until the firm names its weights (a gap, not a hidden default).
**Tested.** 15 new server tests with invented companies (schema refusals, the cut-back of an over-answering model, budget, logs holding no content, every document in the injection fixtures); all fail on the old code. Saved deals and every golden output are unchanged.

## 4.7.52: A figure that shows as zero no longer shows a minus sign (on the development branch; not merged or deployed)

A small negative number that rounds to zero used to print as "-$0", "$-0.00", "-0" or "-0.0%", and a tiny positive change printed as "+0.0%". These were display-only: the stored value was always right.

- **One rule, one helper.** `signOf` in the new `app/numtext.js` takes the sign from the formatted digits: if every digit is zero there is no sign at all (neither "-" nor "+"). It is DOM-free so `kit.js` and the exporters can both import it; it is added to the service-worker precache.
- **Fixed:** the `kit.js` formatters (`int`, `money0`, `money2`, `pct`, `signed`, `times`, `yrs`; `short` through `money0`), the comp sheet's own formatters in `exporters.js`, and the trend text in `workbook.js`. The deal brief uses the `kit.js` formatters, so it is fixed too.
- **Side effect:** a nonzero negative in the comp sheet now reads "-$5" rather than "$-5" (same as the rest of the app).
- **Unchanged:** stored values, engine results and exported workbook cell values. Excel's own number format can still show "-0.0%" for a tiny negative in a percent cell; changing that would change exports, so it is a known gap.
- **Known, separate item:** `money0(-0.5)` gives "$0" but `money0(0.5)` gives "$1", because `Math.round` rounds half up. Left as is, since changing it could move figures.
- **Next small PR:** the ad-hoc sites with the same pattern: `glance.js` (121, 229), `aifacts.js` (10, 12, 82), `t12ui.js` (444), `t12.js` (777), `omstatement.js` (265) and `engine/figures.js` (198).

Tested with `tests/format-sign.test.js` (examples, nonzero negatives kept, the comp sheet, and a seeded 10,000-value loop). Five of its six tests fail on the old code. Two mutations (the sign check back to `n < 0`, and dropping `plus`) and the exporters' own `pct` put back each turn it red. The golden check shows 646 figures, 0 changed. Saved results did not change.

## 4.7.51: Security: the AI server's prompt-injection test set doubled, covering every published attack type (on the development branch; not merged or deployed)

F12's invented injection documents grew from 12 to 25, and each now names its attack category. The categories are taken from two published taxonomies (BIPIA, MIT; garak, Apache-2.0); every document is invented, and nothing is copied from either. No server or app code changed: saved results and golden outputs are unchanged.

- **New attacks:**
  - encoded instructions (base64, ROT13, zero-width characters, another language);
  - instructions hidden in a table cell, a footnote or an HTML comment;
  - a request to put the figures into a link (exfiltration);
  - a request to print the access token;
  - a fake end of document followed by a fake "Human:" turn;
  - "developer mode";
  - a spreadsheet formula (`=HYPERLINK`);
  - an instruction split across two documents.
- **Checked for each:** the server keeps the document's words out of the system prompt, sends the text through unchanged as a document block, strips control characters from names, and cuts an "obeying" model's answer back to the fields that were asked for.
- **New test (10e):** the set must cover all 11 categories, with unique ids and markers. It fails on 4.7.49's fixtures.
- **App side (a pin, which passes on the old code):** a value carrying a formula (`=`, `+`, `-`, `@`, a tab) is written as text in the comp set's CSV. The rent roll CSV and the copied table already did the same.
- **Test fix:** test 10 sends one request per document, so it now raises its own per-minute limit, and it closes its server even when an assertion fails. Before, a failure left the test run hanging.
- **Mutation checks:** removing the CSV formula guard, dropping a category from the set, and removing test 10's rate setting each turn a test red.
- **Still not tested:** whether the real model resists these documents. The live run is not built, an open gap.

## 4.7.50: Property tests for the money rounding, the text decoder and the CSV readers (on the development branch; not merged or deployed)

Tests only; nothing a broker sees changes, and no saved result changes.

- **New `tests/properties.test.js`** uses fast-check 4.10.2 (MIT, exact-pinned, a devDependency never imported by `app/`, `server/` or `sw.js`). It generates inputs and checks what each function's own comments promise:
  - `roundTo`/`toCents`/`toRate`: whole cents (or the stated places), rounding twice equals once, within half a place, half away from zero, negatives mirror positives, non-numbers pass through and never become 0.
  - `decodeText`: UTF-8 with and without a byte-order mark, and UTF-16 LE and BE, round-trip exactly; arbitrary bytes never throw.
  - `csvRows`, `detectDelimiter`, `pastedRows`: a grid written as standard CSV reads back the same (quotes, delimiters, CR LF); the delimiter of a plain grid is found; pasted tab rows come back trimmed.
- The seed is pinned so a failure repeats. Listed in `THIRD_PARTY.md` under the test-only packages.
- **Tested:** each property goes red on a deliberate mutation (floor instead of round, no doubled-quote handling, no byte-order-mark strip) and the file fails on the old code, where fast-check is not installed.

## 4.7.49: Four security scanners now run on every push and pull request (on the development branch; not merged or deployed)

A new `security-scan` workflow lints the workflows and looks for committed secrets and known-vulnerable packages. It changes CI and tests only: the app, the engine and saved deal results are untouched.

- **actionlint and zizmor** lint `.github/workflows/`. zizmor's findings are fixed: `persist-credentials: false` on every checkout in `test.yml`. One finding stays, as a documented exception with a comment: the test-only `npm install --no-save playwright@1.56.1` (exact version, never shipped).
- **gitleaks** scans a pull request's own commits, or the whole history on a push. The release binary is used, not the GitHub Action. `.gitleaks.toml` allowlists two storage-key names that the generic-api-key rule mistook for secrets (`app/ui.js` and one proposal document).
- **osv-scanner** checks `package-lock.json` and `server/package-lock.json` against osv.dev; only package names and versions are sent.
- **Pinned:** each tool is downloaded at an exact release version and checked against a SHA-256 from that release's published checksums; zizmor is installed from PyPI with `--require-hashes`. They are listed in `THIRD_PARTY.md` under "CI-only tools (never shipped)".
- **Tested:** `tests/ci-scanners.test.js` fails if a tool, its version pin or its checksum check is missing, or if an unpinned download is added. Saved deal results are unchanged.

## 4.7.48: Workflow: a scan of the project's own Claude settings, a lock so browser runs don't collide, and a "step, then check" rule (on the development branch; not merged or deployed)

The owner asked for the useful ideas in the evaluated tool repos to be used, with care on licences. Nothing was installed or copied; each idea is our own code or wording.

- **Settings risk scan (ruflo's idea):** `tests/tools/settings-scan.mjs` fails if `.claude/settings.json`, `.claude/settings.local.json` or `.mcp.json` allows every shell command, downloads and runs code, runs as root, deletes recursively, switches permission checks off, holds a secret, or stops denying `Read(./private/**)`. It runs in `npm test` and every `check:quick`.
- **One browser run at a time (paperclip's idea):** `tests/e2e/run.sh` takes a lock before it uses port 8080, so a second session or worktree waits its turn instead of failing with "port in use"; a lock left by a run that is gone is taken over; `E2E_LOCK_WAIT` sets how long to wait (default 30 minutes).
- **Step, then check (karpathy-skills' idea, in our words):** every plan and brief lists each step with how it is checked; `docs/working-rules.md`. `docs/proposals/dev-tools-and-reuse.md` section 10 records what was taken from each repo and what still is not, and why.
- **Tested:** `tests/settings-scan.test.js` (the repo's own settings pass; each risky grant is caught) and `tests/e2e-lock.test.js` (a free lock is taken, a live one waited for then refused, a stale one taken over); both fail on 4.7.46, and three mutations of the scan (no `private/` rule, no `sudo` rule, `Bash(:*)` not caught) each turn a test red. No app code changed; saved results and golden outputs are unchanged.
- **GitHub tools scan:** `docs/proposals/github-tools-scan.md`: 24 more open-source candidates across eight areas (licence, offline use, network, security, verdict), and the top five to integrate first.

## 4.7.47: Security F12: the AI server gets a token per device, spending limits in whole cents and a prompt-injection rule (on the development branch; not merged or deployed)

Server and AI screens only: no engine, `app/deal.js` or saved-deal change, so saved results and golden outputs are unchanged (646 displayed figures compared, 0 changed). Nothing changes for a broker until the operator sets the new limits; a single `APP_TOKEN` keeps working.

- **A token per device:** `APP_TOKENS_FILE` (one line per device, `<label> <sha256>`) or `APP_TOKEN_HASHES`; `node server/tokens.mjs new <label>` prints a token once. The server holds only hashes, compares in constant time, re-reads the file when it changes and on SIGHUP (deleting a line withdraws a device with no restart), and answers 503 for every request if the file is unreadable. `APP_TOKEN` still works as device `legacy`, with a startup warning when both are set. The rate limit is now per device, not per network address.
- **Spending limits, whole cents:** a job cap, a device day, a server day (00:00 UTC) and a daily request count. Before each call the server asks `countTokens` for the exact input size (if that fails, bytes/3 over-estimates a text request, while a PDF or image, which is charged per page, holds the whole job cap), holds the worst case, refuses over any limit before the model is touched (422 `job_over_budget`, 429 `daily_limit` or `server_daily_limit` with `Retry-After`), and settles with the real usage afterwards; a call that fails with an HTTP status gives its hold back, one that times out or drops, or a reply with missing token counts, is charged the hold; two parallel jobs cannot both pass a cap. Transcription holds the whole job cap and is charged by the minute (never more than that cap), or the cap when the length is missing. Labels are reserved (`legacy`) and may not repeat across the tokens file and `APP_TOKEN_HASHES`; if `countTokens` fails only its status and error name are logged. The figures are PLACEHOLDERS (and the prices UNVERIFIED) until the owner names them. Counters live in memory, so a restart resets the day; the README says so and names a spend limit on the provider's account as the backstop (that one exists is UNVERIFIED).
- **Prompt injection:** every system prompt carries one rule that document, transcript, question and fact text is data, never instructions; document names lose control characters. Whether the real model resists is UNVERIFIED (the tests use a stand-in that obeys; the server drops unrequested keys, documents and citations, and the app still checks every quote against the document).
- **Logs** hold only time, path, status, error name and device label.
- **In the app:** the AI error keeps the server's message (plus its code and reset time), and Test connection shows "Today on this device: $0.42 of $15.00, 12 of 200 requests."
- **Tested:** `server/test/limits.test.mjs` and `injection.test.mjs` (invented fixtures), `tests/ai-injection.test.js`, and `tests/e2e/ai-flow.mjs`; the new limit, cost, prompt and name tests fail on the previous code, the log test and the injection pins pass on it by design. Mutation checks (floor for ceil, swapped prices, cache tokens dropped, a logged request body) each turned a test red.

## 4.7.46: Code scanning: the seven open CodeQL alerts fixed (on the development branch; not merged or deployed)

Fixes for CodeQL alerts 1 to 7 on main. Saved results and golden outputs are unchanged.

- **Alerts 1 to 6 (release tools, tests only):** `tests/tools/changelog.mjs` and `bump-version.mjs` put a version number into a regular expression with only its dots escaped, and `golden.mjs` escaped pipes in a Markdown table without escaping backslashes first. The version is already checked to be digits and dots, so no wrong result was possible, but the escaping was incomplete. One small helper, `tests/tools/escape.mjs` (`escapeRegExp`, `mdCell`), now does both properly, and the three tools use it.
- **Alert 7 (`app/omstatement.js`):** the sign test for OM figures written with a k or M suffix ("$1.5M", "($250k)") used the character range `[(-–]`, which by accident spans everything from "(" to the en dash, letters and digits included. Its pattern only lets "(", "-", "–" or "$" reach that test, so no figure was read with the wrong sign; the range is now exactly those three characters.
- **Tested:** `tests/tools-escape.test.js` (the escapes, the changelog fold matching an exact version only, table cells, and k/M figures keeping their sign); the escape tests fail on the previous code, the sign tests are guards. `check:full` passed. Golden: 0 changed.
- **Dependabot (Pillow, 28 alerts):** nothing to change. `tests/e2e/requirements.txt` already pins Pillow 13.0.0, the version every advisory checked names as the fix, and Dependabot's own update run on main reports "no security update needed as pillow is no longer vulnerable". The alerts are stale and should close on GitHub’s next rescan; they are left open, not dismissed.

## 4.7.45: Security: the 28 Pillow alerts audited; the browser suite now refuses an unpinned Pillow (on the development branch; not merged or deployed)

Test tooling only. Pillow is not part of the app, the AI server or anything deployed; saved results and golden outputs are unchanged.

- **Root cause of the 28 Dependabot alerts:** 28 Pillow advisories published on 2026-10-20 and 21 (CVE-2026-112390 to 112406 and 112891 to 112902), each affecting versions below 13.0.0 and each fixed in 13.0.0 (checked one by one in the GitLab advisory database). `tests/e2e/requirements.txt` was moved from Pillow 12.3.0 to 13.0.0 by Dependabot's PR #52 on 2026-10-21, CI installs 13.0.0 (seen in the browser job's log), and Dependabot's own update run on main reports "no security update needed as pillow is no longer vulnerable". No further version change is needed; the open alerts have not yet been closed by GitHub.
- **The gap found, and fixed:** the exact pin protects CI, but `tests/e2e/run.sh` built its fixtures with whatever Pillow a machine already had. This cloud container had Pillow 12.3.0, inside the affected range of all 28 advisories, and every local browser run used it. `tests/e2e/check_requirements.py` now runs first in `run.sh` and stops the suite, naming each package whose installed version differs from its pin and the install command. (The container was upgraded to 13.0.0 with that command.)
- **Exposure:** none identified. Pillow is used only by `tests/e2e/make_pdfs.py`, which draws invented images from scratch (blank canvases, fixed text, solid colours) and saves them; it never opens or parses an image, PDF or TIFF from outside, and nothing a broker uploads reaches it (the app reads uploads in the browser with pdf.js, ExcelJS and tesseract.js; the AI server is Node).
- **Tested:** `tests/e2e-requirements.test.js` (a mismatched pin and a missing package stop the check with the install command; the real file pins Pillow 13.0.0 exactly; run.sh runs the check before any fixture) fails on the previous code; 3 mutation checks all caught; `check:full` passed with Pillow 13.0.0.

## 4.7.43: Ponytail, the "smallest complete change" skill, is integrated as text (on the development branch; not merged or deployed)

Tooling only: no app code, saved deals or golden outputs change. The owner approved ponytail (A1 in `docs/proposals/dev-tools-and-reuse.md`) on 2026-10-21 and asked for it to be integrated on 2026-10-22.

- **What is added:** `.claude/skills/ponytail/SKILL.md`, the upstream skill from DietrichGebert/ponytail at commit `09c434a`, unchanged, with its MIT license beside it, plus one section at the end, "In this repository": `CLAUDE.md` and the working rules win wherever they differ; tests that fail on the old code, mutation checks, the golden checks, `check:quick`/`check:full` and the release steps are part of every change, never trimmed as "extra"; money, units and periods are never cut short; a new library is still an approval gate.
- **What is not taken:** its hooks (SessionStart, mode tracker, subagent and status line scripts), the band UI and its five other skills. Text only, so it adds no code that runs and no network access.
- **Recorded in `THIRD_PARTY.md`** with the commit and the SHA-256 of the upstream file and the license; `tests/ponytail-skill.test.js` checks the upstream text is unchanged, the license is there, and nothing of ponytail's is registered in the project settings.
- **Not measured yet:** the approved A/B test (T1: PR size with and without it) was not run; the owner chose to integrate first. Its effect will show in the next PRs' diff sizes, and it can be removed by deleting the folder.
- **Cost:** about 0.9k tokens a session for its description; the body loads when used.

## 4.7.42: T-12 checks: a line filed on the wrong side, and the same line read twice (on the development branch; not merged or deployed)

Sixth underwriting PR (U6 of `docs/proposals/underwriting.md`, checks K13 and K28; no owner decision needed). Saved results and golden outputs are unchanged.

- **K13, a warning:** a line filed in a category on another side than the part of the statement the file prints it in, for example a line under Income filed as repairs, or a line printed after the file's NOI filed as an operating expense. It names both sides and waits in the T-12 Data QC panel and Review until you mark it seen or change the category. A capital line under Expenses filed below the line is not flagged (that is how a capital item is classified), and lines printed under no heading are never flagged.
- **K28, a note:** two or more lines with the same label, the same part of the statement and the same months to the cent ("appears twice with the same months (rows 4, 5): the same line read twice, or two real lines? Both count."). Nothing is dropped; both lines still count.
- Neither check holds the totals or "Use". Statements saved by earlier versions get them too.
- **Support-code check:** K13 and K28 are the support code's checks, adopted through the proposal's mapping; nothing quoted.
- **Tested:** 5 Node tests (all fail on the previous code), 5 mutation checks all caught. `check:full` passed. Golden: 0 changed. Not tested: Safari; no new browser flow (the checks use the existing panel and Review, which the existing flows cover).

## 4.7.41: Rent roll checks: missing SF, missing rent, missing start, ended leases, later rent starts, duplicate units, the same lease twice, and a rent-per-SF band (on the development branch; not merged or deployed)

Fifth underwriting PR (U5 of `docs/proposals/underwriting.md`, checks K20 to K22, K24, K25, K27, K33 and "same lease across suites"). The owner approved the design on 2026-10-22. **No saved result or displayed figure changes** (both golden checks: 0 changed).

- **Eight new checks in "What doesn't add up"** for any deal with a rent roll:
  - Checks (warnings, counted in the Deal tab badge): an occupied suite with no SF; a tenant with no rent ("counts as vacant until a rent is entered", it is never read as $0); a lease already ended at the rent roll's as-of date (holdover and month-to-month leases are not flagged); a unit number listed more than once.
  - Notes: a lease with no start date; a rent that starts after the as-of date; the same tenant and end date on several suites (one lease split across suites?); the median rent per SF a year outside a band (an annual rent typed in the monthly box, or the reverse, shows up here).
- **The band is four settings** in Settings → Calculation conventions (commercial $3 to $200 a year, multifamily $3 to $80, the multifamily band when the property type says multifamily, apartment or residential). A bad number, or a low above its high, is refused and the old value kept. The order message for these pairs, and for the NOI pair, now names the right setting.
- **How it is built:** a per-lease fact list (`rollFacts`) is worked out from the rent roll at analysis time and never stored: no data-format change, no migration. Every rule declares exactly what it reads, so the Impact view says which lease fields and settings move each check.
- **Unchanged on purpose (owner decision):** a tenant with a blank rent still counts as vacant in occupancy, leased SF and average rent; the check says so. Counting it as occupied would change saved results and is a separate later choice. The checks are not in the Review Queue or the strict review setting (they have no stored "reviewed" mark).
- **Also fixed:** the projection's notes did not declare that they read a lease's SF, which the new messy test roll exposed.
- **Support-code check:** checks K20 to K22, K24, K25, K27 and K33 are the support code's, adopted through the proposal's mapping; nothing from it is quoted.
- **Not done / gaps:** a $0 rent is not flagged; blank rent stays vacant (above); not tested in Safari.
- **Tested:** 9 new Node tests (8 fail on the previous code, the ninth is a guard) and a new messy-roll Impact case on which every rule fires; 12 mutation checks all caught; browser flow `rollchecks-flow` (33 checks, phone and desktop, axe light and dark, a rent typed in clears its check in 75 ms against the 150 ms budget); the four band boxes typed character by character. `check:full` passed. Golden: 0 changed in both checks.

## 4.7.40: WALT by total area: a third weighting where vacant space counts at 0 years (on the development branch; not merged or deployed)

Fourth underwriting PR (U4 of `docs/proposals/underwriting.md` section 3.5; a reversible setting, approved with the proposal on 2026-10-17). The default stays "by income", so nothing changes unless you pick it; saved deals and golden outputs are unchanged.

- **Settings → Calculation conventions → WALT weighting** gains *By total area (vacant at 0 years)*: Σ(SF × years left) over dated occupied leases, divided by their SF plus the vacant SF. A half-empty building's WALT is pulled down by its empty space, which "by area" (occupied SF only) does not show.
- **Month-to-month and undated leases** follow the existing setting exactly: when they are left out, their SF is out of the denominator too, so nothing counts twice. With no dated occupied space there is no WALT, never 0 years from the vacant space alone.
- **Labels:** every WALT that says how it was worked out now says "by total area, vacant at 0 years" when that is the headline; the Rent roll tab shows the by-income figure beside it.
- **Tested:** `tests/walt-gla.test.js` (B05 and C11b worked by hand: by income 5, by area 6, by total area 3 years; a month-to-month lease left out or at 0 years; undated and no-rent leases; the no-occupied-space case; the setting and the label), failing on the previous code; 3 mutation checks all caught. `check:full` passed. Golden: 0 changed.
- **Support-code check:** the proposal's mapping row "WALT by total GLA"; nothing quoted.

## 4.7.39: A strict review setting: figures wait until every open check is reviewed (off by default) (on the development branch; not merged or deployed)

Third underwriting PR (U3 of `docs/proposals/underwriting.md` section 3.4; owner decision 8, approved 2026-10-17: off by default). At the default nothing changes; saved deals and golden outputs are unchanged.

- **Settings → Calculation conventions → "Before figures can be used":** *Failed checks resolved* (the default, today's behaviour) or *Every open check resolved (strict)*. Stored with the other conventions on this device, not on any deal.
- **In strict mode,** while the T-12 or the rent roll has an open check, a warning as well as a failure, "Use the T-12's figures", "Use normalised figures" and the rent roll's Use offers wait, saying "N checks still open: review them first" with a way to Review. NOI three ways shows the gap but says "not compared: checks open". Reviewing each check (Seen, or its fix) releases them.
- **Nothing fills a figure without your tap in either mode;** strict only adds the wait for warnings.
- **Tested:** 4 Node tests (C01, C02, the rent roll's checks counted, a bad saved value ignored) and the browser flow `strict-flow` (iPhone size), each failing on the previous code; 5 mutation checks all caught. `check:full` passed. Golden: 0 changed.
- **Not tested in the browser:** the rent roll's Use offers in strict mode (the gate is in the same shared count the tests cover; a deal with an open rent roll check and empty figures was not built in the flow). Not tested: Safari.

## 4.7.38: Normalised NOI on the T-12 tab: choose how each line counts, see the bridge, and use the figures with Undo (on the development branch; not merged or deployed)

Second underwriting PR (U2 of `docs/proposals/underwriting.md`, approved 2026-10-17). It puts U1's normalised NOI on screen. Saved results and golden outputs are unchanged; nothing changes until you pick a method.

- **How each line counts:** under the T-12 totals, a "How each line counts" fold gives each income and expense line a chip, "Counts: as reported". Tapping it shows the four methods with the amount each would give: as reported, annualised (12 ÷ the months with activity), typical month × 12 (the median of its non-zero months), or excluded. Annualise waits, with its reason, until the months-with-activity question is answered. Each choice is one history entry; Undo takes it back.
- **The Normalised NOI card** is a list, phone first: NOI as reported (N months) → each step → normalised NOI (a year). The reported NOI never moves and stays in the totals above. A cent-rounding note appears when the group rounding differs from the lines. When a check holds the totals, the card says why in words and shows no number.
- **Use normalised figures** goes through the same confirmation as "Use the T-12's figures": each figure old → new, the source label (for example "T-12, normalised: 3 lines annualised, 2 lines typical month × 12, 1 excluded, N = 7"), Cancel changes nothing, Undo puts the earlier figures back. It is refused, with the reason, while anything holds the totals, a line is still to file, a stated figure disagrees, no method has been chosen, or, on a statement of fewer than 12 months, any line is still as reported (those are its months, not a year's, so they never reach the deal's annual figures).
- **Words:** the typical-month method is never called "run rate" on screen (that name is the whole-statement run rate from 4.7.36).
- **Found in review and fixed before opening:** the first build let a partial statement's as-reported lines reach the deal's annual figures with only a caution; it is now refused, and the bridge no longer calls such a total "a year".
- **Tested:** browser flow `t12norm-flow` (107 checks, iPhone and desktop sizes, axe in light and dark, 44 pt targets); 9 Node tests of the words and refusals (all fail on the previous code); 8 mutation checks all caught. `check:full` passed. Golden: 0 changed. Not tested: Safari; real files.

## 4.7.37: Underwriting groundwork: a normalised NOI worked out beside the reported one (no screen yet) (on the development branch; not merged or deployed)

First of the underwriting PRs (U1 of `docs/proposals/underwriting.md`; the owner approved the proposal and its stored fields on 2026-10-17, and on 2026-10-22 approved how a month you marked "Recurring? No" works with a line's method). Logic and tests only: nothing on screen changes, saved results and golden outputs are unchanged.

- **`normalise(t, { n })`** works out, from a T-12, what NOI would be if each line were read by a method you pick: as reported (the default), annualised (12 ÷ N, N being the months with activity), a typical month × 12 (the median of the non-zero months), or excluded. It returns the reported NOI, the normalised NOI and a bridge of steps between them, in whole cents, with one rounding per method group (the few-cent residue is shown as a Note, never absorbed). The normalised figure is always beside the reported one, never in place of it; NOI three ways keeps comparing the as-reported T-12.
- **A month you marked "Recurring? No"** is taken out of its line first, then the line's method applies; "exclude" wins, so nothing is counted twice; a stale mark is ignored. With every line "as reported", normalised NOI equals "NOI without the one-offs you marked".
- **It refuses rather than guesses:** nothing is worked out while a check holds the totals, while the N question is open for an annualised line, for quarter-end columns not yet answered, for a statement with no month columns, or with lines still to file (they count on neither side, as in the T-12 totals). An unknown method value is counted as reported and listed as ignored.
- **`annualized()` is unchanged** (same signature, bit-identical results, tested with `Object.is` on every statement in the test fixtures and every saved T-12 in the backup fixtures); it shares one rounding step with `normalise`.
- **Data:** the optional per-line `method` (approved fields; `window` and `oneoff` already existed); nothing is written to the deal's figures; no migration. A fixture of three deals saved by 4.7.36 restores with the same totals, checks and ids.
- **Support-code check:** U1 adopts the "normalisation method per T-12 line" idea through the proposal's mapping; nothing from the support code is quoted.
- **Next:** U2 puts the method chip, the normalised card and the bridge on the T-12 tab (labelled "typical month × 12", so a broker never sees two different "run rates").
- **Tested:** 25 new tests (23 fail on the previous code with the missing exports stubbed; the other 2 are guards), the 4,096 method combinations, 17 mutation checks (one equivalent mutant noted), `check:full` passed, golden 0 changed. Not tested: Safari; there is no browser flow because there is no screen.

## 4.7.36: T-12 flags: spikes, credits, one-offs and year over year; editable thresholds; a run rate on request; and a wrong annualised NOI fixed (on the development branch; not merged or deployed)

Fifth of the T-12 reading PRs (3b of the approved plan, `docs/proposals/t12-multiformat.md` section 5). The owner approved the design note's decisions on 2026-10-21 and 2026-10-22, including the new stored field below. Saved deals' results and golden outputs do not change.

- **Wrong number fixed (found while designing this PR).** A T-12 whose columns are headed by quarter-end dates (3/31, 6/30, 9/30, 12/31) was read as four single months, so "Annualize it, then use" tripled a full year (an invented NOI of 114,000 became 342,000). It now raises a warning, and Annualize and the run rate wait until you answer "They are single months". Headings like "Q1 2025" get a Note that the quarter columns were skipped.
- **New checks (warnings; none can hold your totals or "Use"):** a month more than 3 times the line's usual month (and above the larger of $1,000 and 0.5% of EGI); an expense line that totals below zero; a single expense month of -$500 or less; one month that is half or more of a line that is at least 1% of its side (large one-off); and year over year against the prior period, comparing the same calendar months only (a line or category up or down more than 25%, NOI more than 50%).
- **Recurring or one-off?** For a flagged one-off you answer Yes / No / Not sure. Only you set it. "No" adds back that one month, not the whole line. NOI stays as stated, and "NOI without the one-offs you marked" is shown beside it, never instead of it. "Not sure" changes nothing.
- **Editable thresholds:** ten numbers in Settings → Calculation conventions, including the NOI 2% and 5% (defaults unchanged, ranges checked; a bad number is refused, not used). Impact now shows that Settings can move the NOI comparisons.
- **Run rate, on request only:** for a T-3, T-6 or YTD statement, "Show a run rate" shows N months × 12 ÷ N, labelled "not a T-12", names any lump payment (for example taxes paid in one month), may be set against the OM's NOI as a Note only, and never reaches the deal's figures.
- **Data (additive, no migration):** `line.oneoff = { iso, amount, recurring }` per marked month (it reopens if that month's amount changes); statements saved by earlier versions get the new value checks and nothing else changes (fixture `backup-4.7.35-before-t12-values.json`).
- **Support-code check:** only the check kinds of the support code's spike and negative-month rows (K38, K39 in `docs/proposals/underwriting.md`) are adopted; their thresholds are not. Every threshold here is from the T-12 proposal. Nothing from the support code is quoted.
- **Not done / gaps:** a true quarterly reading (quarters as periods) is still later; the quarter-end check only holds Annualize and the run rate. After that hold is answered the card still says "A partial year: 4 months".
- **Tested:** 22 new tests (all fail on the previous code), 20 mutation checks all caught (two survivors got new tests), browser flow `t12values-flow` (93 checks at phone and desktop size, axe in light and dark, an edit on a 300-line statement in 39 ms against the 150 ms budget), 10 number boxes typed character by character. `check:full` passed. Golden: 0 changed in both checks.

## 4.7.35: T-12 periods: duplicate months, more than 12 months and cumulative columns are caught before they reach your figures (on the development branch; not merged or deployed)

Fourth of the T-12 reading PRs (3a of the approved plan, `docs/proposals/t12-multiformat.md` section 5; the owner approved decisions D1 to D8 of its design note, including that older saved T-12s gain these checks). Saved deals' results and golden outputs do not change; fields are additive; no migration.

- **Duplicate months no longer count twice.** A month that heads two columns is a Fail: the totals and "Use the T-12's figures" are held until you choose which column to count. The other column is set aside, not deleted.
- **More than 12 months is split, not used as a year.** A new import of 15 months takes the latest 12 as the T-12 and keeps the earlier ones as the prior period (you can change which). An older saved statement of more than 12 months is a Fail until you choose, because "Use" used to write all of its months into the annual fields.
- **Monthly or cumulative?** When the columns look year-to-date (each at least the one before, the last equal to the Total) you are asked; the totals are held until you answer, because the two readings differ by multiples.
- **Missing months and N.** A month with no activity on any line, between the first and last active months, is a gap Check; months before the first or after the last are not gaps. N is the number of months with activity. When N differs from the number of columns you are asked, and "Annualise" then uses 12 divided by that N.
- **A stated NOI, EGI or operating-expenses figure that does not match its lines is a Fail that holds "Use"** (it was a warning). NOI three ways says "not compared" while any check holds the totals.
- **Where you see it:** a T-12 Data QC panel on the deal (one folded line when nothing is open), the same checks in Review with the fixes as buttons, one history entry per choice, so Undo works. 44 pt targets.
- **Support-code check:** the gap and N definitions are the ones adopted from the owner's support code in `docs/proposals/underwriting.md` (rows K19 and the N-from-active-months row); nothing from it is quoted. The remaining checks adopted from it (spike, negative month, one-offs) are the next PR (3b).
- **Not done / gaps:** thresholds, spikes, negative expenses, one-offs, year over year and the run rate are PR 3b. A column set aside and later reinstated comes back with its blank months counted as $0 and not marked. The panel's browser checks run at iPhone size only. `.action-item` now has a 44 pt minimum height in every action sheet.
- **Tested:** 17 new tests (written first), 17 mutation checks all caught, browser flow `t12period-flow` (41 checks, axe, 44 pt), a fixture of a statement saved by 4.7.34 (same totals and ids). `check:full` passed. Golden: 0 changed in both checks.

## 4.7.34: T-12 lines you filed before are suggested, not filed for you; capital items are never moved by their wording (on the development branch; not merged or deployed)

Third of the T-12 reading PRs (PR 2 of the approved plan, `docs/proposals/t12-multiformat.md` section 9 item 2, decisions 2 to 5). Saved deals and golden outputs do not change; additive data only.

- **Remembered labels become suggestions.** A line whose label you filed before no longer files itself. It shows "Suggested: Repairs and maintenance, mapped this way in 6 of your last 7 deals (once to Contract services)" with **Confirm** and **Choose another**. Until you choose, it counts in no category, "Use the T-12's figures" waits, and the card shows it under "Not yet filed". The built-in wording rules still file lines, as before.
- **Capital wording is never moved for you.** A line under Expenses worded like capex, roof, reserves, TI, leasing commissions, debt, depreciation or owner or asset-management costs used to be filed below the line by its wording, which silently moved NOI. It is now "needs classification" with a suggestion, and three choices: **Below the line**, **Keep in operating** (with a category) or **Leave unclassified**. A line the file prints after its own NOI, or under a Capital or Below-the-line heading, still goes below the line as before.
- **Confirm all N suggestions** lists them all first, then files them in one step (one Undo). Lines that need classification are left out of it, because they move money in or out of NOI.
- **Use is gated by the number of open lines, not their amount,** so a $0 suggestion, or lines that cancel out, cannot let the figures through unreviewed. A suggested reduction (vacancy, concessions) keeps its sign when confirmed.
- **Data (additive, no migration):** labels you filed now remember the last 50 deals they were filed in (no amounts or names); lines may carry `suggested` and `needs`. A statement saved by an earlier version keeps every filing and gets one Note listing the lines a remembered label or capital wording had filed. Backups join the deal lists from both sides, newest 50.
- **Not changed, and recorded as a gap:** OM operating statements keep the old filing of capital wording (their lines are filed by position; changing that would move OM NOI and the golden figures).
- **Tested:** 17 new tests (14 fail on the previous code, 3 are guards that must not change), 17 mutation checks all caught, browser flow `t12sug-flow` (43 checks, iPhone size), axe and typing flows pass. `check:full` passed. Golden: 0 changed in both checks.

## 4.7.33: Review, bug diagnosis, prior art and retro skills; a glossary of units (on the development branch; not merged or deployed)

Process and docs only (the A3 items of the approved tools evaluation, `docs/proposals/dev-tools-and-reuse.md` section 10). No app code; saved deals and golden outputs untouched. Written in our own words: nothing is copied from the outside skill repository and nothing is installed (its text could not be read here).

- **New skills (`.claude/skills/`):** `diagnose-bug` (reproduce small, failing test first, root cause in one line, fix once in the shared place), `review-diff` (two separate passes: the repo's standards, then the approved spec; for the designer's end-of-PR review), `prior-art` (the capped search and table before a proposal or a build), `retro`.
- **Extended:** `pr-report` gains a "merge danger" line; `quality-gates` says write the failing test first.
- **New `docs/glossary.md`:** the CRE words the app uses, each with its unit, and what to know about a number before using it (period, basis, area basis, sign).
- **`docs/working-rules.md`:** a short checklist for keeping `CLAUDE.md` short. `CLAUDE.md` itself is unchanged.
- **Already covered, no new file:** `tdd` (quality-gates), `handoff` (the `NOW.md` state note), `git-guardrails` (the hook, #56).
- **Cost:** about 0.9k tokens per skill description loaded each session; the bodies load only when used.

## 4.7.32: A git guardrail stops forced pushes and other destructive git commands (on the development branch; not merged or deployed)

Process and tooling only (the third item of the approved tools evaluation, `docs/proposals/dev-tools-and-reuse.md` section 10). No app code changed; saved deals and golden outputs untouched.

- **What it does:** a project hook (`.claude/hooks/git-guardrails.mjs`, registered in `.claude/settings.json`) refuses a forced push, a push that deletes a branch or targets main or master, `reset --hard`, `clean -f`, `checkout .` / `restore .` of the whole tree, `branch -D`, `stash clear` / `drop` and `--no-verify`, and tells Claude to stop and ask the owner. A normal push of a branch is never blocked. This makes CLAUDE.md's "never force-push, reset or delete without authorization" mechanical.
- **Own-written, not hookify:** the hookify source could not be read here (repository access is limited to a web fetch), and the approved rule was to write our own in that case. About 100 lines, no dependencies, nothing added to `THIRD_PARTY.md`.
- **Limits, written in `docs/working-rules.md`:** it reads command text, so a script or `eval` that runs git is not seen; it guards against a slip, not an attack.
- **Tested:** `tests/guardrail.test.js` (34 refused and 35 allowed commands, a heredoc commit message that mentions a forced push, the hook's exit codes, and that it is registered); 8 mutation checks, all caught.

## 4.7.31: A backup file can no longer change where your AI requests go, and a bad request can't stop the AI server (on the development branch; not merged or deployed)

Fixes for three findings of the security review (`docs/proposals/dev-tools-and-reuse.md`, section 4), approved by the owner 2026-10-21. **Saved deals and their results do not change** (golden identical); the backup file format stays version 2.

- **F1 (medium): AI settings never travel in a backup.** A hand-made backup could carry an AI server address, and a broker restoring it would then type their access token next to an address the file chose. The address, token and on/off switch are now left out when a backup is made and ignored when one is read; restoring (merge or replace) leaves this device's own AI settings exactly as they are. The restore sheet always says so. Reading also keeps only the settings keys the app writes (a test fails if a new key is added to the app without being added to the list), and says how many other settings it left out. Old backups that contain AI settings still restore, minus that one key. **Small cost, decided as recommended:** restoring onto a new phone no longer fills in the AI server address (the token was never restored); type it once under AI settings.
- **F2 (low): replace mode wrote any browser-storage key from the file.** Both modes now write only the three known keys (loan defaults, tools, subject), only text, and only up to 256 KB. The recovery copies, current-deal marker and theme can no longer be set by a backup.
- **F3 (low): a request address such as `//[` stopped the AI server.** Someone holding a valid token could end the server process with one request. It now answers 400 and keeps running, and any other uncaught async error is logged by name only.
- **Also (I6):** a `__proto__` key inside a backup is skipped, so it can't re-parent the restored objects.
- **Not done (I5, recorded as a gap):** `key in KIND` in the AI review code (`app/dealui.js`) should be `Object.hasOwn`; no test can reach it without widening this PR, so it rides the next AI-review change.
- **Tested:** 7 new backup tests and 1 new server test, each failing on the previous code; 13 mutation checks, all caught; the backup browser flow updated and passing. Not tested: Safari; a real Anthropic call.

## 4.7.30: Paste a statement into the T-12 import (on the development branch; not merged or deployed)

Second of the T-12 reading PRs (1b). Reader and import screen only; saved deal results do not change.

- **Paste a statement:** a new button beside Import. Rows copied from Excel (tabs) or a PDF (runs of two or more spaces) are read like any other statement, marked as pasted with medium confidence, and kept only when the broker taps Read it. A paste with no row of month headings says what to copy.
- **Same questions as a file:** a number style that could read two ways is asked about; a non-$ currency sign is refused.
- **Tested:** new browser flow `t12read-flow` (iPhone size: semicolon file with decimal commas, the number question, a pasted statement, the sheet chooser with a Budget and a hidden sheet, a blank month, a PDF named .xlsx); the paste box is typed character by character in `typing-flow`. Golden outputs unchanged.

## 4.7.29: The T-12 import reads more files, says what it could not read, and asks before it guesses a number (on the development branch; not merged or deployed)

A T-12 import could only read .xlsx and comma CSV files, took the file name's word for what a file was, and read a blank month as $0 without saying so. A decimal-comma figure such as 1.234,56 read as $1.23. **Saved deal results do not change.** This is the first of the T-12 reading PRs (proposal: `docs/proposals/t12-formats.md`); it lays the foundation, and the next ones add the paste box flow tests, the period handling and the Review changes.

- **What a file is comes from its bytes, not its name.** A new `app/filekind.js` looks at the first 8 KB (and the size) before anything is read whole. A PDF named .xlsx, a Word file, a photo, an old .xls, a password-protected workbook and binary junk each get a message that says what to do. A workbook over 25 MB, a text file over 10 MB, and a zip that declares more than 100 MB, more than 10,000 parts, or a part packed more than 200 times are refused before they are unpacked. An .xlsx saved with a .csv name now reads as a workbook; an .xlsm reads with its macros never run, and says so.
- **Semicolon, tab and `sep=` text files.** The delimiter is found from the first 30 lines (quotes respected); a first line `sep=;` is honoured and dropped. The file picker offers CSV, TSV, XLSM and TXT. The rent roll import is unchanged.
- **Numbers are read the way the file writes them, and the app asks when it cannot tell.** 1.234,56, 1 234,56 and 1'234.56 now read right. A file with only 1.234-style figures, one that writes numbers two ways, or a semicolon file with 12,500-style figures asks "How are numbers written in this file?" with both readings of three of its figures; cancelling imports nothing. A comma file with 12,500 reads as US with no question, as before. A currency sign other than $ (EUR, GBP, CHF) is refused rather than read as dollars. Excel number cells are never affected.
- **Blank months are no longer silent.** A blank month cell still adds $0, so no total moves, but the line now records it, "Every line" says "2 months blank (Mar, Apr), counted as $0", and Review gets one "N month cells are blank" item. Cells of words (n/a, TBD, #REF!) are recorded as unread. A dash stays a printed zero. Statements saved before this version are never re-read: an old $0 stays a confirmed $0 and they get no new Review item.
- **Where each line came from.** Each line keeps its sheet, row and a confidence; the statement keeps its source (file kind, size, delimiter, number format, whether the number question was asked, encoding, macros, every sheet with its line count) and the period it says it covers (T-12, T-n, YTD, annual, undated Month 1 to 12, gaps, repeated months, empty month columns, the printed period line as text). The period is recorded and never scaled. The card says how the file was read.
- **Which sheet.** A workbook with one readable actual sheet is read without a question. With two or more, a chooser lists each sheet's period and line count, with projections (budget, forecast, pro forma) shown and disabled and hidden sheets marked; a sheet is never chosen by its size. A file that has only projections is refused, naming them. This replaces choosing the sheet with the most lines.
- **Data format.** Additive and optional: `v: 2`, `source`, `period` on the T-12 and `src`, `conf`, `blank`, `unread` on each line. No migration step and no schema bump; a backup made by 4.7.27 restores with its T-12 field for field, the same totals and the same checks.
- **Not done here, and recorded as gaps:** the true-size zip check (a zip that lies about its sizes; ExcelJS inflates the file itself), .xlsm and TSV for the rent roll import, dropping empty trailing months, a file hash, and d/m/y date headings in a European file (read as m/d, as before).
- **Tested:** `tests/filekind.test.js`, `tests/t12-reading.test.js` and `tests/t12-reading-guards.test.js` on invented fixtures; the guards pass on 4.7.27 too (the 4.7.27 backup fixture was made by running that version's own code). The "password-protected" test file is a synthetic container with Excel's marker, not a real Excel-encrypted file. Golden outputs: 0 changes in both checks.

## 4.7.28: Process: a security checklist run each phase, and the owner's decisions on the tools evaluation (on the development branch; not merged or deployed)

Docs only; no app code changed.

- **`docs/security-checklist.md`:** 34 checks in our own words (uploaded files, backup restore, the AI server, the service worker, CI, privacy), with the rule that a second reviewer must reproduce a finding before it is rated and that defence-in-depth gaps are not vulnerabilities. It is run at the end of each phase and before accounts or hosting.
- **Owner decisions recorded** in `docs/proposals/dev-tools-and-reuse.md` (section 10), with the first measured results: `CLAUDE.md` is already under the 200-line target (137 lines), and a sandbox can't run in the cloud container (bubblewrap and socat are missing), so it is not enabled.

## 4.7.27: Process: the owner's support code is checked on every rent roll, T-12 and underwriting PR (on the development branch; not merged or deployed)

A rule change only (`CLAUDE.md`, `docs/working-rules.md`); no app code changed.

- **Look first, adopt what applies, report it.** PRs that touch the rent roll, T-12, NOI, WALT, Review Queue or Data QC read the support code and its mapping, adopt the applicable checks in the app's own modules with invented-fixture tests that fail on the old code, and say in the PR what was adopted, already covered or not applicable.
- **Nothing from it is committed or quoted**, and the shared-figures and names check against `private/` is run first. Changes to stored fields or golden outputs stay approval gates.

## 4.7.26: Design proposal: underwriting (normalised NOI, strict review, WALT by GLA) (on the development branch; not merged or deployed)

A proposal only (`docs/proposals/underwriting.md`); no app code changed and no saved result moved.

- **Reuse first:** it maps the owner's support-code ideas onto what the app already has. The approved T-12 gap and spike detection is not new, and 23 of the 59 checks are already covered.
- **What is new:** a normalisation method on each T-12 line with a normalised NOI and bridge, N counted from the months with activity, an optional strict review setting, WALT by total GLA, and 14 checks to adopt.
- **Eight small PRs in order**, each with its tests, and ten numbered decisions for the owner. Stored-field changes and the strict setting are approval gates.

## 4.7.25: Importing a rent roll PDF now shows how it differs from the rent roll you already have (on the development branch; not merged or deployed)

When the deal already has units, the PDF preview now lists, before you choose Replace or Add, how the PDF compares with the current rent roll.

- **Units are matched by suite**, then by tenant name for those left. The list says how many match and gives each difference with both values: rent (compared in whole cents, on the rent in place at the as-of date), SF, lease start and end, tenant, and leased versus vacant. A unit on one side only is listed alone.
- **Nothing is chosen for you and nothing changes by looking.** Replace keeps the PDF's rows (Undo brings the current roll back from History); Add keeps both; closing the sheet keeps the current roll. No second roll is stored on the deal.

Tested with unit tests for `compareRolls` (5 mutation checks, each turning a test red) and the `rrpdf-flow` browser flow (the same PDF again matches every unit; a different report lists what is only on one side). Saved deal results: golden identical. No data-format change.

## 4.7.24: A property manager's rent roll PDF now reads its rent, not its charges (on the development branch; not merged or deployed)

A property manager's rent roll (Unit, Tenant, Sqft, Rent, Monthly Charges, Deposit, Lease From/To, Past Due) was held back as "not recognised": "Monthly Charges" scored as monthly rent and quietly replaced the Rent column.

- **Charges and fees are not rent.** A heading with "charges" or "fees" and no rent word is a recovery column. "Rent & Charges" in one column still fails the layout check (gross and net can't be split), so the broker is asked and nothing is guessed.
- **Two rent columns that disagree** (for example "Rent" and "Monthly Rent" reading the same way) are one failed check naming both columns and the one used; the same figure printed twice is only noted. A row that lost a column this way says so in its notes.
- **"Past Due", "Balance", "Delinquent", "Arrears" and "Prepaid"** columns are noted as not rent instead of failing; any other unknown money heading still fails.
- **A "4 Units" subtotal** is a subtotal only when its figures add up to the rows above (a tenant can be named "4 Units": a warning, kept as a row). A count that disagrees with the rows it covers fails. A count with no figures is a heading.
- **A lease-to year printed alone on the next line** ("12/31/" then "2030") is joined to its date when it sits in the Lease To column under a row with a half date; if it can't be put together safely (ends before the lease starts, or it could belong to the next row), the row gets a failed check and the year is not used.

Tested with invented PDFs (`rr-pm`, `rr-pm-sub`, `rr-pm-wrap` and variants), 11 mutation checks, each new test failing on the old code. Saved deal results: golden identical (618 results, 646 displayed figures). No data-format change.

## 4.7.23: Import a rent roll PDF as its own document (on the development branch; not merged or deployed)

A rent roll sent as a PDF (not inside an OM) can now be imported straight into a deal's rent roll.

- **Import from PDF…** in the rent roll menu reads the file, shows a preview of every row with its Data QC checks, and fills nothing until you tap Use. A PDF that looks like an OM or a T-12 is refused with the reason; a scanned PDF offers "Read anyway" (OCR on tap).
- **Layout guard:** a PDF whose columns can't be told apart is held back with the reason rather than guessed.
- **Undo:** the import takes a snapshot first ("Before importing a rent roll PDF") and shows an Undo toast.
- **Source kept:** each lease records that it came from a PDF and the file name (additive; schema 4, migration step `rr-pdf-source`). Old backups restore unchanged; tested with a real 4.7.20 backup fixture.
- **Tested:** `tests/rrdoc.test.js` (19), migrate and omstatement updates, browser flow `rrpdf-flow` (27 checks, phone size). Saved results and the 646 displayed figures are unchanged.

## 4.7.22: The impact-flow browser check no longer fails at random (on the development branch; not merged or deployed)

Nothing changes in the app. `impact-flow`'s axe check on the sheet at phone size failed about 2 runs in 3 with a colour-contrast violation (1 to 4 elements; the "From the OM" eyebrow measured 4.42:1 against the 4.5 floor), also on clean main. It made `check:full` unreliable.

- **Cause:** the flow opened the sheet and ran axe the moment its content appeared, while the sheet was still sliding and fading in, so axe read half-faded text colours. The desktop check passed because that sheet had been open for a while. Other flows' axe helpers already wait for animations to finish; this one did not.
- **Fix:** wait for every running animation to finish, plus 600 ms, before each axe run. A failure now names the element and its contrast ratio. The app is not touched: at rest the sheet has no violations.
- **Tested:** `impact-flow` alone, 8 runs in a row: 30 of 30 checks pass every time (before: 1 run in 4 passed, the others failed on `#sheet-eyebrow` 4.42). Golden outputs identical.
- **Other flows:** `a11y-flow`, `bigroll-flow` and `snapshot-flow` also run axe without the animation wait; none has failed, left as they are.

## 4.7.21: An OM's stated rent is checked against its rent roll, the roll can offer Building SF and Units, and a two-line header is read (on the development branch; not merged or deployed)

Three gaps from the rent roll proposal (F3, F4 and F6). The OM's stated in-place rent was read, then thrown away (the deal has no box for it), so the rent roll check against it never ran. And a deal whose OM prints no building figures left Building SF and Units empty although the rent roll was read.

- **Stated rent, checked only:** the stated in-place rent now reaches the rent roll's Data QC (`The OM's $215,000 of in-place rent agrees with the rent roll's …`, or a warning with both figures and the Total row). It is not a figure: no new box, nothing new stored, no change to saved deals. Left out when a statement table read it and that table's check failed.
- **Offered, never filled:** when Building SF or Units is empty, the Rent roll card says what the roll supplies ("The rent roll's 6 units add up to 9,000 SF, as listed. A building's gross area can be larger.", "The rent roll lists 6 units.") with a **Use** button. Nothing fills until you tap. A box that already has a value is never offered over. A taken figure is badged "rent roll" (in the figure list, the workbook and the AI facts), never "typed"; it is one step in History, and **Undo** takes it back.
- **A two-line header is read (F6):** a label split over two lines with only that one cell on the second ("Annual" over "Rent", the other labels on the first line) used to end the header after "Annual", so "Rent" was read as a body line and the OM showed no rent roll at all. A deeper header line is now taken when every cell on it sits under a figure, date or share column of the header and is itself such a word. Never a name column (a tenant called "Rent-A-Center" stays a tenant) and never a section heading.
- **No self-check:** the rent roll's cross-check warnings skip a figure you took from the rent roll (it would be checked against itself).
- **Occupancy is not offered:** the deal already shows the rent roll's occupancy, labelled "rent roll", wherever the OM states none; a stored copy would drop that label, drift from the roll, and be checked against the roll it came from. (A deviation from the owner's answer 3, which listed occupancy; easy to add back if wanted.)
- **Tested:** `tests/rr-stated.test.js` (12 tests; the file fails on the old code; 9 mutations each caught) and `tests/rr-header.test.js` (5 tests, 1 fails on the old code; 4 mutations each caught); the browser flows `rrstated-flow` (18 checks; 10 fail on the old app) and `rrheader-flow` (7 checks; 3 fail on the old app) on the phone-size page; the reader's output is identical before and after on all 26 existing fixtures; golden outputs identical (618 saved results, 646 figures).
- **Not tested:** a real OM, Safari.

## 4.7.20: check:quick can no longer miss a file the offline app needs (on the development branch; not merged or deployed)

Nothing changes in the app. During 1a, a new file (`app/scale.js`) was left out of the service worker's cache list. `check:quick` passed, because it runs only the tests that name a changed module, and CI failed three times.

- **Always run:** `check:quick` now always runs `tests/repo.test.js` (the offline cache lists every file the app needs, every import exists, no request leaves the site, the cache is named for the release) as well as the saved-results test.
- **Selection moved:** the "which tests" logic is now `tests/tools/affected.mjs`, so it can be tested; `check.mjs` imports it.
- **Tested:** two new tests in `tests/check-tools.test.js` (the always-run set holds for any change; the selection stays selective). They fail on the old code (the module does not exist), and undoing the always-run entry fails them. End to end: a new app file not in `sw.js` makes `check:quick` exit 1; before, it passed.
- **Not changed:** `check:full`, CI, the app, saved results (golden identical).

## 4.7.19: An OM rent roll printed in thousands now reads at its real rents (on the development branch; not merged or deployed)

A rent roll headed "($ in thousands)", "($000s)" or "in millions" was read at face value: a 60.0 became a $60 rent, every row failed the range check, the whole roll was held, and "Accept as read" would have stored $60 rents. `omstatement.js` already understood scale; `omroll.js` did not.

- **Scale read from the table:** a column's own heading ("Annual Rent ($000s)") wins; otherwise a caption in the up to three lines above the header, stopping at the first line with a figure, so another table's caption is never borrowed. A second table with the same header and no caption is read in the first one's scale.
- **Only money is scaled:** annual, monthly, "Rent", market rent, recoveries and deposit, and the Total row. SF, rent per SF and shares are never scaled. Each is `toCents(value * scale)`; the cell keeps the text as printed.
- **It says so:** an info line in Data QC ("The “Annual Rent” column on page 2 is printed in thousands … read ×1,000").
- **Not guessed:** a column headed per SF ("Market Rent PSF", "CAM $/SF") is never scaled. A bare "Rent" column under a caption that fits both a rate and a scaled total ("dollars in thousands, except rent per SF") raises a failed check and holds the roll, so you are asked.
- **A wrong scale is still caught:** a caption that does not fit the figures (a "thousands" caption over full-dollar rents) scales them out of range, fails the range check and holds the roll, as before.
- **One reader for the scale:** `scaleOf` moved to `app/scale.js`; `omstatement.js` re-exports it and reads statements exactly as before.
- **Tested:** `tests/rr-scale.test.js` (14 tests; 11 fail on the old code, each part has a mutation that fails its own test); the browser flow `rrscale-flow` on the phone-size page (13 checks; 8 fail on the old app); the rent roll reader's output is identical before and after on all 26 existing fixtures; golden outputs identical (618 saved results, 646 figures). Not tested: a real OM, Safari.
- **Known limit:** the range check allows up to $3,000 per SF a year, so a wrong scale on a rent under $3 per SF a year (a ground lease) is not caught by it.
- **Saved deals:** unchanged. A roll already held from an old read stays as it was; read the OM again to get the scaled rents.

## 4.7.18: Proposal: why an OM's rent does not fill the boxes, and a rent roll PDF as its own document (on the development branch; not merged or deployed)

Nothing in the app changes; this is a written proposal (`docs/proposals/rentroll-pdf-and-om-fill.md`) waiting for the owner's approval.

- **The bug, reproduced** with invented PDFs: a rent roll in thousands is read as $60 a year and held; the OM's stated in-place rent is read and then dropped (it has no box); nothing fills Building SF, Occupancy or Units from the rent roll; a property-manager style report is misread (monthly charges taken as rent, a subtotal counted as a tenant, a wrapped lease-end year lost). Plain annual and monthly columns read correctly.
- **The feature:** a rent roll PDF uploaded on its own: detect it, read it by position, preview with Data QC, approve, populate the rent roll, and reconcile line by line with an OM roll if one is loaded.
- **The owner's support code** reviewed (no secrets, no network calls, real data kept in `private/`): file by file, adopt, adapt or skip; and how it informs a later underwriting feature.
- **Tested:** read-only reproduction; no `app/` or `tests/` change. Golden outputs identical.

## 4.7.17: CI now scans for known-vulnerable packages and pins its own tools (on the development branch; not merged or deployed)

Nothing changes in the app. The test workflow had no dependency scan (`npm audit` had been clean once, by hand) and its four GitHub Actions followed moving tags.

- **Audit job:** `npm audit --audit-level=low` runs on every push for both lock files, the app's and the AI server's, dev dependencies included. Any advisory fails the run. Both are clean today.
- **Pinned actions:** `checkout`, `setup-node`, `setup-python` and `cache` are pinned to full commit SHAs, with the tag in a comment.
- **Dependabot:** `.github/dependabot.yml` opens one weekly PR when a pinned action has a newer release. It never merges by itself.
- **Tested:** `tests/workflow-pins.test.js` fails on the old workflow (2 failures) and passes on the new one; it checks every `uses:` for a 40-character SHA and the two audit steps. `npm audit` run by hand on both lock files: 0 vulnerabilities. Golden outputs identical (no `app/` change).
- **Not done here:** the host's security alerts are a GitHub setting the owner turns on (Settings, Code security).
- **Test fix:** `tests/e2e/rename-flow.mjs` read the Settings "data moved" text as soon as the backup button existed, and failed about one run in three. It now waits for the text (10 s) before checking it; the check itself is unchanged. 6 runs in a row passed afterwards.

## 4.7.16: Working rules: model routing, which check to run, usage rules (on the development branch; not merged or deployed)

Docs only; no app change.

- **Model routing:** the designer (Opus) writes proposals, root causes and a
  short design note, and reviews the finished diff; the Sonnet main session
  writes the code and tests.
- **Check rule:** docs or CI-config-only PRs run `check:quick`; anything
  touching `app/` or `tests/` runs `check:full`.
- **Usage rules:** batch searches, read line ranges, `/clear` after each
  merged PR.
- `docs/NOW.md` now carries the session-start check, the approved
  decisions, the open validation and the plugin quirk.

Tested with `check:quick`. Saved results are unchanged.

## 4.7.15: a CSV saved by an older Excel or Windows keeps its accents and curly quotes, and the app says how it read the file (on the development branch; not merged or deployed)

Before, every file the app read as text was decoded as UTF-8. A CSV saved
by an older Excel, or by Excel on Windows as plain "CSV", is Windows-1252, so
"Café Lumière" became "Caf� Lumi�re" and "O’Brien" became "O�Brien", and
nothing said so.

- **One reader for every text file** (`app/textfile.js`). It covers six
  places: the rent roll CSV import, the T-12 CSV import, a TXT, CSV or MD
  document sent to AI, opening a comp project, restoring a backup, and
  importing a template package. Comps come from PDFs and project files, and
  contacts have no file import, so there was no other CSV reader to cover.
- **The rule, never a silent guess.**
  - A byte-order mark decides: UTF-8 (Excel's "CSV UTF-8"), or UTF-16, which
    used to read as noise.
  - Valid UTF-8 is UTF-8, read exactly as before, with no note.
  - Anything else is Windows-1252, and the app says so with up to three
    words to check.
  - Two cases are ambiguous, and the note shows both:
    - **A stray byte.** A UTF-8 file with a stray byte stays UTF-8, and the
      note counts the characters it couldn't read ("�") and gives their
      lines.
    - **Bytes valid in both.** A Windows-1252 name whose bytes also happen to
      be valid UTF-8 ("JOSÉ’S" is the bytes of "JOSɒS") is read as UTF-8,
      and the note gives both readings.
  - Bytes that Windows-1252 leaves undefined (Mac Roman uses them, for
    example) are named too, with "save it as CSV UTF-8" as the fix.
- **Where the note shows.**
  - **Rent roll:** in the import sheet, above the column choices.
  - **T-12:** in the "T-12 read" message, which stays up longer when it has a
    note.
  - **AI:** at the top of the review.
  - **Project, backup and template package:** in a message.
  - It isn't saved with the deal: that would change the saved data format.
- **Its own Windows-1252 table.** The app maps 0x80 to 0x9F itself, as the
  WHATWG Encoding Standard does. The browser does the same, but Node's
  TextDecoder reads those bytes as Latin-1, which would make the tests
  disagree with the phone. A browser check confirms that the app's table
  matches Chromium's.

**What changes for a broker.** Only files that aren't valid UTF-8: they now
read right, with a note to check. Every UTF-8 file reads as before. No saved
deal, figure or format changes.

**Tested.**
- **Invented fixtures** in `tests/fixtures/encoding/`:
  - a Windows-1252 rent roll with é, è, ø, ñ, ’ and –;
  - the same rent roll in UTF-8;
  - a Windows-1252 T-12.
- **`tests/text-encoding.test.js`:** 15 tests, 12 of which failed on 4.7.14.
  On three of those, the UTF-8 and byte-order-mark files, the cells already
  read the same before; they fail only because 4.7.14 reports no encoding.
  The 3 that pass on 4.7.14 test properties of the new decoder:
  - 3,000 random UTF-8 texts decode to themselves with no note;
  - 3,000 random Windows-1252 texts decode right or carry a note, except for
    the one documented, rare silent case: a lowercase accent and then two or
    three typographic marks;
  - for 20,000 random byte strings plus every edge of each length, the
    decoder agrees with the strict UTF-8 decoder on what is valid UTF-8.
- **`tests/e2e/encoding-flow.mjs`:** a new browser flow, 12 checks, 9 of
  which failed on 4.7.14. It covers the rent roll, T-12, project, backup and
  template package. `ai-flow.mjs` adds 2 checks for a Windows-1252 document,
  and both failed on 4.7.14.
- **Mutation checks:** 19 mutations, all caught.
- **Golden outputs** are identical: 618 saved results, and 0 of 646
  displayed figures changed.
- **Not tested on real files.** None are on this machine. The owner can run
  `node tests/tools/rr-local.mjs` and `node tests/tools/t12-local.mjs` on
  real old CSVs in `private/`; both now read through the same reader.

## 4.7.14: money rounds to the cent by one rule everywhere, and a T-12 line whose months don't add up to its year is flagged (on the development branch; not merged or deployed)

Before, four modules kept their own copy of `Math.round(x * 100) / 100`
instead of the engine's `toCents`: `t12.js`, `omstatement.js`, `om.js` and
`template.js`. That copy rounds the binary number, not the decimal one:
1.005 became 1.00, 0.145 became 0.14, and a negative half cent went toward
zero. It was a second copy of the money math, which the rules forbid.

- **One rounding rule.** All four now use the engine's `toCents`: half
  away from zero, exact for decimal input.
  - `t12.js`: every month, line total, category, EGI, expenses, NOI, and
    annualizing.
  - `omstatement.js`: a statement's rows and its "use the sum of the lines"
    fix.
  - `om.js`: each figure read from an OM table, and the other columns it
    offers.
  - `template.js`: money to the cent ($/SF) written into a firm's template.
- **A new T-12 check, a flag only.** It fires when a line's shown months add
  up to more than a cent away from its shown year. That happens when the
  file holds fractions of a cent: each month is rounded on its own, the
  year once. Neither figure is changed (owner, 2026-10-15).

**What changes for a broker.** Only amounts with a third decimal, and
annualizing a T-8 (× 12 ÷ 8 = 1.5 turns an odd cent into a half cent):

| Example | Before | After |
|---|---|---|
| A T-12 month of $0.145 | $0.14 | $0.15 |
| A vacancy month of −$0.125 | −$0.12 | −$0.13 |
| A T-8's $10,000.15, annualized (exactly $15,000.225) | $15,000.22 | $15,000.23 |
| An OM's printed NOI of $10,000.005 | $10,000.00 | $10,000.01 |
| An OM's "use the sum of the lines", with a −$100.005 line | $13,000.00 | $12,999.99 |
| $1,024,215 ÷ 1,000 SF written into a template | $1,024.21 | $1,024.22 |

Amounts with two decimals never change, and nor do sums of them. Saved deals
aren't re-rounded.

**Tested.**
- **New tests:** `tests/money-rounding.test.js`, 8 tests. Seven fail on
  4.7.13. The eighth is a guard, true on both versions: every money value a
  T-12 or an OM statement keeps is whole cents, over all 8 T-12 layouts,
  all 14 OM statement cases, and a statement written to fractions of a
  cent.
- **Mutation checks**, each caught:
  - each module put back to its own rounding (`t12.js`, `omstatement.js`,
    the `om.js` figure, the `om.js` alternatives, `template.js`);
  - the flag never raised;
  - its tolerance loosened to ten cents.
- **Before and after, module by module:** every output of the 8 T-12
  layouts and 14 OM statement cases, compared field by field, old code
  against new: identical. The 22 template money2 values of the test comps:
  identical.

Saved results and figures are unchanged (golden outputs identical: 618
saved results and 646 displayed figures).

## 4.7.13: changelog entries that can't conflict, and the owner's approved build order (on the development branch; not merged or deployed)

Tooling and docs only; the app is unchanged. Before, every PR wrote its
entry at the top of `CHANGELOG.md`. Two PRs open at once always conflicted
there, and in the version lines (#28 against #27).

- **The changelog entry is now a fragment.** Each PR adds one file,
  `docs/changelog/unreleased/<branch>.md`: a `# title` line, then the
  entry. It never edits `CHANGELOG.md` by hand (`tests/tools/changelog.mjs`).
- **`npm run bump -- x.y.z` folds it in.** It runs in the PR's last commit:
  - it sets the version in the five places, as before;
  - it puts the fragment at the top of `CHANGELOG.md` as
    `## x.y.z: <title> (…)`, and deletes the fragment;
  - all or nothing: it changes nothing if there's no fragment, two
    fragments, or a malformed one (no title, empty, a version in the title,
    or a version heading inside).
  - This entry is the first one written this way.
- **`npm run sync-main` resolves the two conflicts that recur:**
  - `CHANGELOG.md`: both entries kept, newest version first. Not when one
    version number holds two different entries: a person decides those;
  - a version line in `package.json`, `package-lock.json`, `sw.js` or
    `app/exporters.js`: the higher version, whichever side has it.

  Anything else is listed for a person, as before. Once nothing is left,
  the merge is committed.
- **A test checks** that the top changelog entry's version equals
  `package.json`'s, and that any fragment waiting is well formed.
- **The owner's decisions** on the three 4.7.12 proposals are recorded in
  `docs/PLAN_STATUS.md` and `docs/NOW.md`:
  - the revised build order;
  - production readiness F1 to F12, in the approved order;
  - the competitive-gap reorder and its four additions;
  - `.xls` only if an Apache-2.0 or MIT SheetJS can be fetched;
  - an independent review and account ownership as Phase 7 prerequisites.
- **The rules say so:** `CLAUDE.md`, `docs/working-rules.md` and the
  `release` skill.

**Tested** in `tests/check-tools.test.js`:
- the fold, byte for byte, and every refusal changing nothing;
- `sync-main` in throwaway repositories: #28's conflict resolved on its
  own; a higher version on main kept; an unrelated conflict left for a
  person; one version written two ways not guessed.
- The new tests fail on 4.7.12. Seven mutations are each caught: no
  fragment allowed, the fragment left behind, the entry at the bottom, a
  version heading inside allowed, oldest first, always the branch's version,
  and two entries under one version merged.

Saved results and figures are unchanged (golden outputs identical).

## 4.7.12: reuse before you build, one register of third-party code, and three proposals (on the development branch; not merged or deployed)

Docs only, plus one comment in `app/ocr.js`; the app's behaviour is
unchanged.

- **A new standing rule, "reuse before you build"** (owner, 2026-10-15). It
  is in `CLAUDE.md`, `docs/working-rules.md`, the designer's proposal steps
  and the `pr-report` skill:
  - before any proposal or larger build: check what the repo already ships,
    then do a capped prior-art search, with a "Prior art" table in the
    proposal or PR;
  - permissive licenses only (MIT, BSD, Apache-2.0, ISC; MPL-2.0 with
    approval), never GPL, AGPL or unlicensed code;
  - any new library, or code copied from a repository, is an approval gate.
    It is pinned, vendored with its license text and checksum, and listed;
  - never outside code for the engine or the money logic.
- **`THIRD_PARTY.md`** replaces `VENDOR.md` as the one register:
  - every shipped library and font, with its version, license, why it's
    there, and its SHA-256;
  - how each file compares with the published package: identical, or the
    edits made and why;
  - the test-only and server packages;
  - the `npm audit` result: 0 vulnerabilities in the root and in `server/`.
- **License texts** now ship beside the files, in `vendor/licenses/`:
  ExcelJS, fflate, pdf.js, Tesseract.js, Tesseract.js core and Public Sans
  (OFL-1.1). They come from the published packages.
- **The service-worker test** (`tests/repo.test.js`) now leaves the license
  texts out of the app's install set, as it already did for `.md` files. A
  new check keeps them out, and requires a license text for each shipped
  library.
- **Three proposals, research only.** Nothing in the plan changes until the
  owner approves:
  - `docs/proposals/prior-art.md`: what to reuse for the upcoming work.
    Nothing new is needed except `.xls` (SheetJS, already approved, can't
    be fetched from here). Drag and drop is a later approval if wanted. It
    also covers the ExcelJS maintenance risk and the pdf.js upgrade
    question.
  - `docs/proposals/competitive-gap.md`: the leaders' modules against
    Zlatura's plan, how "Export everything" would end lock-in, a first-run
    path on a phone, and a ranked list of features that would make a
    broker switch.
  - `docs/proposals/production-readiness.md`: the owner's checklist of about
    150 items mapped to Zlatura, each with its tier, status and verdict.
    It has a fix-now list, the design decisions accounts must be built with
    from the start, and what a solo owner working with AI doesn't cover.
    One finding is real today: `t12.js` and `omstatement.js` round money on
    their own instead of with the engine's `toCents`. It's listed as F1 for
    the owner's approval, not fixed here.

Saved results and figures are unchanged (golden outputs identical).

## 4.7.11: a small browser check on every push, and branches kept current with main (on the development branch; not merged or deployed)

CI, tooling and docs only; the app is unchanged.

**The CI browser subset.** Before, GitHub Actions ran only the Node tests,
and the browser flows ran only in a Claude session.

- **A second CI job, `browser`**, runs four flows on Chromium at iPhone size
  on every push (owner, 2026-10-15): `typing-flow`, `lostedit-flow`,
  `deal-persistence` and `deal-export`.
  - Playwright's Chromium is cached between runs.
  - The Python packages the fixture scripts need are pinned in
    `tests/e2e/requirements.txt`.
- **`E2E_SKIP_RECALC=1`** leaves out `run.sh`'s LibreOffice recalculation,
  which CI doesn't have. `check:full` always runs it.
- **Timed:**
  - an empty cache: 1 min 46 s (the flows 65 s);
  - a filled cache: 1 min 44 s (the flows 72 s);
  - both round to 2 billed minutes a run.

**Merge conflicts don't recur.** Two PRs open at once both edited the top of
`CHANGELOG.md`, `docs/NOW.md`, `docs/PLAN_STATUS.md` and the version files,
so the second always conflicted (#28 with #27).

- **New standing rules** (owner, 2026-10-15), in `CLAUDE.md`,
  `docs/working-rules.md` and the `pr-report` and `release` skills:
  - every branch starts from the latest main;
  - before opening a PR, and again before calling it ready, main is merged
    in and conflicts resolved, the checks re-run, and GitHub confirmed to
    show no conflicts;
  - one PR open for the owner's merge at a time;
  - the changelog, status docs and version files change only in a PR's
    last commit;
  - a PR is called ready only when GitHub shows it mergeable with CI
    passing.
- **`npm run sync-main`** fetches main, merges it into the current branch,
  and lists any conflicted files.
- **`check:full`'s new last step** (`sync-main.mjs --check`) fails if the
  branch is behind main, or a tracked file has a conflict marker at the
  start of a line.
- **Proposed, not built:** changelog fragments, one file per PR
  (`docs/proposals/changelog-fragments.md`).

**Tested by `tests/check-tools.test.js`.**
- The CI job runs exactly the four flows, each one `run.sh` knows, and only
  CI skips the recalc.
- `sync-main` in throwaway repositories: current, behind, merged,
  conflicted, markers left, and a Markdown rule that isn't a marker.
- `check:full` ends with the check.
- The new tests fail on 4.7.10. Five mutations of `sync-main` are each
  caught.

Saved results and figures are unchanged (golden outputs identical).

## 4.7.10: a partial-year T-12 is never used as a year's figures (on the development branch; not merged or deployed)

Before, "Use the T-12's figures" on a T-3, T-6 or T-9 put its totals onto
the deal as they stood. The deal's figures are a year's, so a nine-month
NOI was read as the annual NOI. The cap rate, value, debt coverage, loan
size and returns were all worked out from a partial year. The sheet only
noted "not scaled up to a year".

- **It asks first.** On a statement of 1 to 11 months, the first choice is
  "Keep it as a partial year": nothing on the deal changes. The other is
  "Annualize it". That shows each annual figure (× 12 ÷ its months) and
  what annualizing can get wrong (seasonal items, one-time costs,
  lease-up), and changes nothing until you confirm. Cancel at either step
  changes nothing.
- **Annualized figures say so.** Each figure's source reads "T-12, Jan
  2025 to Sep 2025 (9 months), annualized × 12 ÷ 9". The card says the deal
  uses them annualized, as confirmed. One Undo puts the earlier figures
  back.
- **The math, in whole cents, in one place** (`t12.js annualized`). EGI,
  expenses and taxes are each scaled. NOI is the scaled EGI less the scaled
  expenses, so it still adds up.
- **The card says "A partial year"**, and labels its NOI with the months
  ("NOI, 9 months").
- **A deal saved earlier** that holds a partial year as a year's figures is
  not changed. It gets a warning in "What doesn't add up", naming the
  figures, the months and the way out. The warning goes when the figures
  are annualized or typed as a year's.
- **The convention** (`t12.months`) now reads: never used as a year's
  figures; scaled up only when you confirm it, and then marked annualized.

**Saved results are unchanged.** The golden outputs are identical: 646
displayed figures and 618 saved results. No golden deal holds a partial
T-12. The behaviour changed on the invented nine-month deal of the new
flow:

| | EGI | Expenses | NOI | Cap rate | DSCR | Warning |
|---|---|---|---|---|---|---|
| 4.7.9, "Use them" | $108,000 | $23,400 | $84,600 | 5.64% | 1.11x | none |
| 4.7.10, "Keep it as a partial year" (the default) | $150,000 | $30,000 | $120,000 | 8.00% | 1.58x | none |
| 4.7.10, "Annualize", confirmed | $144,000 | $31,200 | $112,800 | 7.52% | 1.49x | none |
| 4.7.10, a deal saved by 4.7.9 as in the first row | $108,000 | $23,400 | $84,600 | 5.64% | 1.11x | yes |

The deal's own figures were $150,000, $30,000 and $120,000 on a
$1,500,000 price, with a 65% loan at 6.75% over 30 years.

**Tested.**
- `tests/t12-partial.test.js` (6 tests) can't load on 4.7.9, which has no
  `annualized`.
- The new `tests/impact.test.js` case fails on 4.7.9.
- The new `t12partial-flow` (19 checks) fails 12 on 4.7.9, the bug among
  them. All pass now.
- Mutation checks, each caught:
  - no scaling;
  - NOI scaled by itself;
  - a full year annualized;
  - a typed figure still warned about;
  - an annualized figure taken as partial;
  - the partial-year question removed (10 browser checks fail).
- The impact map shows the warning moved by the T-12 and by each of the
  four figures.

## 4.7.9: project settings for model, effort and plugins (on the development branch; not merged or deployed)

Settings and docs only; the app is unchanged. The owner decided the three
questions from 4.7.8 (`docs/proposals/efficiency-setup.md`, "Decided").

- **Main session on Sonnet at medium effort** (`"model": "sonnet"`,
  `"effortLevel": "medium"` in `.claude/settings.json`). The designer agent
  stays on Opus and the builder on Sonnet.
- **32 plugins Zlatura doesn't use are off for this project only**
  (`enabledPlugins` in `.claude/settings.json`). `engineering`, `design`,
  `pdf-viewer` and `figma` stay on. The list, and how to turn one back on,
  are in the proposal's "Decided" section.
- **The CI browser subset** (typing, lost edit, deal persistence, deal
  export) is approved and comes in its own PR after the partial-year T-12
  fix.
- **A browser check that failed about 2 runs in 3 is fixed** (tests only).
  The axe check of the Review queue (`omrr-flow`, and the same helper in
  `omstmt-flow`) could run while the screen was still fading in. Its text
  was then part transparent, so it read as low contrast. The check now waits
  for the fade to end. It failed 2 of 3 runs before and passed 6 of 6 after.

Saved results and figures are unchanged (golden outputs identical).

## 4.7.8: cheaper sessions, with every check kept (on the development branch; not merged or deployed)

Tooling and docs only; the app is unchanged. Each session read the long
`CLAUDE.md` and much of `docs/PLAN_STATUS.md` before starting, and the
release steps and checks were typed out by hand every time.

- **`docs/NOW.md`** is the one file a session reads first: the version, what
  is merged, what is in progress, the build order, the open decisions and a
  state note for resuming after a usage limit.
- **A shorter `CLAUDE.md`** (91 lines, was 127). Every rule is kept, and
  their longer wording is in `docs/working-rules.md`.
- **Four skills that load only when needed**: `release`, `pr-report`,
  `hand-test` and `quality-gates`.
- **Read-deny rules** (`.claude/settings.json`) keep large or private files
  out of a session: `node_modules`, `.git`, the OCR and minified vendor
  files, `private/`, browser-test output and the lockfiles.
- **One command per check.** `npm run check:quick` runs the unit tests the
  change can affect, the type check and the golden check against
  `origin/main`. `npm run check:full` runs the whole Node suite, the type
  check, the golden check and the full browser suite. Every step runs even
  when one fails, and any failure fails the command. A change to the
  displayed figures fails the golden check unless the owner approved it
  (`GOLDEN_CHANGE_APPROVED=1` still prints the before/after table).
- **`npm run bump -- x.y.z`** sets the version in all five places it is
  written. If any file is out of step, it changes nothing.
- **`tests/e2e/run.sh` takes several flow names**; before, only the first
  was run.
- **Three decisions for the owner** are in
  `docs/proposals/efficiency-setup.md`: the default model and effort, a
  browser subset in CI, and the plugins to turn off.
- **Tested by `tests/check-tools.test.js`**: the bump in each file, refusals
  that change nothing, and that both checks exist, run every gate and fail
  on any failure.

Saved results and figures are unchanged (golden outputs identical).

## 4.7.7: an edit is kept when you leave the deal or close the app straight after it (on the development branch; not merged or deployed)

Since 4.7.3, a figure typed on the deal and committed with Tab was saved a
moment late. The focus fix (`app/focuskeep.js`) waited for Tab's focus to
land before running the field's whole change handler, and the save was
inside it. Leaving the deal in that moment lost the edit and raised a page
error; closing or switching away from the app on a phone could lose it too.
The 4.7.6 browser checks caught it (deal persistence failed about 3 runs
in 4).

- **The edit is saved at once; only the redraw waits** for focus to land.
  This covers the deal's figures, the What-if targets and every field in the
  lease editor.
- **A redraw that comes after the deal was left is skipped**, so nothing is
  drawn into, or read from, a deal that is no longer open.
- **Tested by a new browser flow** (`lostedit-flow`). It commits each kind
  of field exactly as Tab does, then leaves the deal or closes the app in the
  same instant. All 6 checks fail on 4.7.6 and pass now. Undoing any one of
  the three fixes fails its own check. The typing checks from 4.7.3 still
  pass (185).

Saved results and figures are unchanged (golden outputs identical).

## 4.7.6: a failed browser check now fails the run (on the development branch; not merged or deployed)

Tests only; the app is unchanged. Most browser flows printed PASS and FAIL
lines but exited with success either way, eight only printed values for a
person to read, and `tests/e2e/run.sh` ignored exit codes, so a failing
check could pass the suite unnoticed.

- **Every flow ends through one `finish()`** (`tests/e2e/finish.mjs`): it
  prints the totals and exits with an error when a check failed or no
  check ran. The eight print-only flows (deal persistence and isolation,
  comps reload, error messages, offline, template, comps, mobile audit)
  now check the values they used to print.
- **`run.sh` runs every flow, lists the ones that failed and exits with an
  error.** A LibreOffice recalculation with a formula error or a mismatch
  counts too. Workbooks left by an earlier run are cleared first, so only
  this run's are checked.
- **The deal export is in the suite.** `deal-export` (deal workbook, deal
  brief, comp workbook with the deal tab) was a print-only script outside
  the suite; it now checks all three, and both workbooks are recalculated.
- **Proved on purpose:** `E2E_FORCE_FAIL=<flow>` adds a failing check to
  that flow; the run then exits 1 and names it. On the old code a flow
  with a failing check exited 0. `tests/e2e-finish.test.js` covers both.
- **What it found:** the T-12 flow crashed on load in the first part of
  this change (fixed here), and the deal persistence flow fails about 3
  runs in 4: an edit typed and committed with Tab is lost when you leave
  the deal or reload straight away (since 4.7.3). That bug gets its own
  fix next.

## 4.7.5: income and expenses read from an OM's statement correctly, and checked (on the development branch; not merged or deployed)

Bug B. Figures read from an offering memorandum's operating statement could
come from the wrong column (the oldest year, a per-unit column, the pro
forma), ignore "($ in 000s)", take a per-unit row as a total, and go straight
into the deal even when the statement didn't add up. The statement is now
read as a table, checked by its own arithmetic, and every figure says where
it came from.

- **The right column.** Columns are found from where the figures sit and
  named from the headings above them, including a heading that spans two
  columns ("Pro Forma" over Year 1 and Year 2). In-place figures come from
  the latest actual column, a T-12 first; pro forma NOI from the first pro
  forma column. A statement with only Year 1, Year 2… uses Year 1 as NOI,
  labelled "Year 1 (projected)", with medium confidence. Plain years in the
  past are actual; this year and later are projected.
- **Units and scale.** "($ in 000s)", "$000", "in thousands" and "in
  millions" in the title, the headings or a note scale every figure, and say
  so. Per SF, per unit and % columns are never read as totals, nor is a row
  such as "Expenses Per Unit". A column with no heading whose figures times
  the building SF (or unit count) give another column is read as per SF (or
  per unit). "Real Estate Tax Reimbursements" is no longer taken for the tax
  bill.
- **A figure that can't be right stays put.** A cell that fails a check
  (a negative NOI, say) leaves that row unread and says why; the next column
  is never taken instead.
- **Checked by its own arithmetic.** For each column: the lines add up to
  each subtotal, the income lines to EGI, EGI less expenses to NOI, taxes are
  within expenses, and expenses are below EGI, within the larger of 0.5% or
  half a printed unit per line. Growth from one column to the next of more
  than 25% (income, expenses) is noted and more than 50% (NOI) flagged; never
  blocking. The arithmetic is the T-12 import's own (one copy of the math).
- **A statement that doesn't add up holds NOI, EGI and expenses back.** The
  Data QC panel in Key figures shows each check with its page, row, column and
  the cell marked on the line as printed. A failed check waits there and in
  Review with one-click fixes: keep as printed, use the subtotals (EGI less
  expenses), use the sum of the lines, or use another column. Your choice is
  recorded on the deal, and Undo takes it back.
- **Sources.** Each figure from a statement keeps its row, column, cell,
  scale and check, and shows under its label in words, not colour alone:
  "Actual 2025 · p.4 · high". The other columns of the same row are offered
  as alternatives.
- **Your saved deals.** Deals read before this version are kept exactly as
  they were and are not read again; read the OM again to check it. Every
  figure in the 618 saved deal results and 646 displayed figures is
  unchanged.
- **Tests:** 34 new statement tests (on page text and on PDFs, the checks,
  each fix, undo and a backup made by 4.7.4), and a new browser flow that
  reads an invented OM in thousands with a Per Unit column and a NOI that
  doesn't add up, fixes it in Review and undoes the fix.

## 4.7.4: rent rolls read from an OM correctly, with checks you can see (on the development branch; not merged or deployed)

Bug A. A rent roll read from an offering memorandum could lose rows, invent
tenants, mix up monthly and annual rent, and say nothing about it. It is now
read by where things sit on the page, every value keeps its source, and a
short Data QC list shows what was checked.

- **Read by position.** Columns are recognised from their headings, scored
  against every kind (so "Escalation Rate" is bumps, not rent per SF), with
  headings over one to three lines, "Resident" as well as "Tenant", and
  columns for bumps, monthly rent per SF, market rent and status. A name
  printed over two or three lines stays one tenant, even with its figures
  centred between the lines.
- **Over several pages.** A rent roll that runs on to the next page is
  followed, with or without its header repeated there. A lease comparables
  table later in the OM is no longer added to the rent roll. Each row keeps
  the page and line it was printed on, and each value the cell it came from.
- **Totals and subtotals.** "Retail Subtotal", "Totals / Averages" and a
  Total row with no label are recognised as totals, not tenants, and checked
  against the rows above them; a tenant called "Total Body Fitness" is a
  tenant. A subtotal no longer ends the table early.
- **Units, never guessed silently.** Annual, monthly, rent per SF a year or a
  month: from the heading first. A "Rent" column that doesn't say is worked
  out from rent per SF and flagged; a figure out of range (rent per SF printed
  under "Annual Rent", say) fails a check and is left as printed. Nothing is
  multiplied by 12 behind your back any more. "$60.0K" reads as $60,000.
- **Vacancies and dates.** A vacant suite with no SF is kept (and flagged);
  Holdover, M-T-M and Month-to-Month are month-to-month; a lease term printed
  as one "start – end" cell gives both dates.
- **Data QC.** After an OM is read, the rent roll card shows one line per
  check: pass, check, fail or note, each pointing to its page, row and cell.
  It compares the rent roll with its own Total row and with the OM's stated
  building SF, occupancy (now on the stated building SF, not the rent roll's
  own), in-place rent (a new figure, read from "Base Rent" or "In-Place
  Rent"), gross potential rent and units. A failed check holds the rent roll
  back until you resolve it, accept it, or resolve it in Review, where every
  check waits with its page, row and cell.
- **Scanned pages.** Each page with no text is flagged. "Read this scanned
  page" reads it with OCR (Tesseract, about 7 MB, downloaded from this site
  only the first time you use it, then kept for offline use). Every value
  read that way is marked OCR and waits for you to accept it.
- **Your saved deals.** Nothing changes in them except that a rent roll read
  from an OM by an earlier version is marked "read before Data QC". Every
  figure in the 618 saved deal results and 646 displayed figures is
  unchanged.
- **Tests:** 24 new rent roll tests (on page text and on PDFs), 7 on the
  checks, the Review items and OCR rows, a backup made by 4.7.3, and a new
  browser flow that reads
  an invented OM with a page carried over and a scanned page, resolves the
  failed check in Review, and reads the scanned page by OCR.

## 4.7.3: dates you type no longer disappear (on the development branch; not merged or deployed)

Bug C. Typing a date into the rent roll or the lease editor could wipe what
you had typed once you reached the year, and a number you finished with Tab
could leave you with no field selected. Both are fixed.

- **One date field everywhere.** Dates are now typed as plain text and read
  when you leave the field or press Enter, never while keys are going in.
  Nothing is reformatted or cleared as you type, and the cursor stays put.
  It understands `01/15/2027`, `1/15/27`, `2027-01-15`, `01152027` (what a
  phone's number pad gives) and `Jan 2027`, `January 2027`, `Jan-27`. A month
  on its own means its first day, or its last day in the fields that end
  something (lease end, a rent period's To, an abatement's To). A good date
  shows as `MM/DD/YYYY`. Something that isn't a date stays as typed, with a
  hint ("Try 01/15/2027 or Jan 2027") and isn't saved. Escape puts back the
  last saved date. A calendar button beside each date opens the phone or
  browser picker as the second way in.
- **Where it is used:** the rent roll grid, Assumptions (As of), the lease
  editor (lease start, rent start, lease end, rent periods, the rent
  generator, free rent, one-time items), comp sale dates, the Tools that take
  a date, the deal's next step and key dates, Home tasks and the date to try
  in What this affects. Dates are still saved the same way.
- **Years before 100.** The lease engine read a four-digit year like 0002 as
  1902; it now reads it as written. No saved deal is affected: every figure
  in the 618 saved deal results and 646 displayed figures is unchanged.
- **Tab after a number.** Finishing a number or percent in the lease editor,
  the Assumptions, the deal's figures or the What-if answers redrew that part
  of the page and dropped the field Tab was moving to. The page now puts the
  cursor back on the right field, and the Assumptions section stays open
  while you work down it.
- **Tests:** a new browser flow types character by character into every date
  and number field and checks, after every key, that the field holds exactly
  what was typed and still has focus.
## 4.7.2: the master plan in the repository, and the tracking checked against it (on the development branch; not merged or deployed)

The app itself doesn't change: this release is documents only, plus the
version number.

- **The master plan** is in the repository root as
  `ZLATURA_MASTER_PROMPT_v2.md`, exactly as you pasted it. It is never edited.
- **`docs/PLAN_STATUS.md`** was rebuilt against it, section by section:
  - every phase of Part 22, and every deliverable in Parts 0 to 24, each
    numbered by its section and marked done, partial, in progress, not
    started or blocked, with the module, test or version as evidence. That is
    374 items: 94 done, 125 partial, 4 in progress, 143 not started and 8
    blocked;
  - "synthetic only" wherever an item was tested only with invented files;
  - the 15 pillars of Part 2;
  - Part 7.5, operating statement normalization, broken out bullet by
    bullet, showing what the 4.7.0 T-12 import covers and what it doesn't;
  - the pro forma against T-12 bridge (Parts 6.3 and 7.9) as its own item;
  - where a Part isn't named in Part 22, the phase it was placed in, and why;
  - your later instructions kept first: the setup, the three bugs, the two
    proposals, the "New look" revamp, the feature map, the Data QC panel and
    the typing tests;
  - ten questions where the master plan and your later instructions differ.
- **`docs/acceptance-matrix.md`** has 77 new rows, each marked "Added 4.7.2"
  with its section number, for features of the master plan it didn't list.
  Two statuses were wrong and are corrected:
  - **mutation tests:** was "Not implemented", now "Partially implemented".
    Deliberate breaks are run on each PR, and 24 unit mix-ups are checked in
    every `npm test`;
  - **performance with 500 leases:** was "Partially implemented", now
    "Implemented, not fully tested". Its "works but slow" was true only
    before 4.2.0.

  One row was relabelled: "NOI bridge" is the potential-rent-to-NOI tool, not
  the master plan's 7.9 bridge, which now has its own row. Two notes were
  brought up to date with the 4.3.0 history.
- **`CLAUDE.md`**:
  - points at the master plan in the repository, and says to re-read its
    Part 0 and Part 23 at the start of every phase and before every report;
  - adds Part 0's rules: decide or ask, nothing merged or deployed without
    authorization, and a smaller honest version over a feature that can't be
    trusted;
  - adds the Part 21.2 prohibitions and Part 23's status words and
    truthfulness rules;
  - every report now ends with what was verified, what was not, what was
    assumed, and what is needed from you.

## 4.7.1: how the rest of the plan is built and tracked (on the development branch; not merged or deployed)

The app itself doesn't change. This release sets up the way the rest of the
master plan is built and tracked:

- **`docs/PLAN_STATUS.md`** has a checklist of every phase and item. Each one
  is marked done, in progress, not started or blocked. The feature list is
  generated from `docs/acceptance-matrix.md`, and the file is updated with
  every PR.
- **`CLAUDE.md`** holds the standing rules:
  - one PR per item;
  - approval gates;
  - golden outputs unchanged;
  - invented fixtures only;
  - tests that fail on old code;
  - version and changelog with every PR.
- **Two Claude Code agents** in `.claude/agents/`:
  - **designer**, always on Opus: proposals, bug diagnosis, parsing, money
    and calculation logic, data format, security and end-of-phase review;
  - **builder**, always on Sonnet: approved builds, UI, wiring, docs and
    tests.

  If the builder fails twice on the same problem, it hands back to the
  designer.
- **WebKit runs.** The browser suite can run on WebKit, Safari's engine:
  `PW_BROWSER=webkit bash tests/e2e/run.sh`. That needs WebKit installed;
  this environment has only Chromium, so runs here use Chromium at iPhone
  size.

## 4.7.0: the T-12, and the Review Queue (on the development branch; not merged or deployed)

Phase 2, milestone 1, as approved in `docs/proposals/t12-review-queue.md`,
with your four answers and two changes to the categories.

**Importing a T-12**

- **Where:** the deal's overview has a new "Operating statement (T-12)" card.
  "Import a T-12…" reads an .xlsx or .csv on the device; an .xls is refused
  with what to do.
- **What is detected:**
  - month headings in any common form (dates, "Jan-25", "January 2025",
    "01/2025", "Month 1");
  - a Total, TTM, T-12 or YTD column;
  - account numbers;
  - section headings;
  - subtotal rows, and the file's own EGI, total expenses and NOI;
  - negatives in brackets or with a trailing minus.
- **Signs are made consistent:** expenses written negative read as costs, and
  vacancy written positive under income reads as a reduction.
- **The 21 categories:**
  - income: base rent, vacancy and credit loss, concessions, recoveries,
    parking, other income;
  - operating expenses: taxes, insurance, utilities, repairs, contract
    services, property management fee, payroll, G&A, other;
  - below the line: capital, reserves, TI and leasing commissions, debt,
    depreciation, owner and partnership costs. Asset management and
    owner-level fees go here.
- **How each line is placed:**
  1. by your remembered choice for its label;
  2. by its wording, with the section it sits in deciding between two fits;
  3. otherwise it goes to Review.

  A label that only says "management fee" is never guessed: it goes to Review
  asking which it is.
- **What the card shows:** totals by category, EGI, operating expenses and
  NOI, with below-the-line items kept apart. "Every line" lets you change any
  line's category.
- **Remembered labels:** filing a line with "Remember this label" saves only
  the label and the category, never an amount. Settings lists them, and any
  can be forgotten. Backups carry them, and a merge restore combines them
  label by label, the newer winning.
- **A partial year** is shown as it is, never scaled up. It goes to Review as
  "Only N months", and its NOI isn't compared.
- **Undo:** importing, replacing or removing a statement is one step you can
  undo, with a snapshot first.

**NOI three ways**

- **The table:** a small table on the card shows the OM's NOI, the T-12's, and
  the rent roll's, labelled "forward-looking year 1 · a projection, not an
  actual". Each shows its gap from the T-12's in dollars and percent.
- **The checks:** three new checks, in "What doesn't add up", the brief and
  the workbook:

  | Gap | Flag |
  |---|---|
  | Within 2% | Nothing |
  | 2% to 5% | Noted |
  | Above 5% | Warning |

  - A warning lists where the gap comes from, largest part first (EGI,
    operating expenses, real estate taxes).
  - When the OM's NOI is the higher one, it adds that the OM may be pro forma
    or leave out expenses.
  - The thresholds are listed in Settings → Calculation conventions.
- **No change on deals without a T-12:** there is no comparison on them, so
  the 618 saved results and the 646 displayed figures are identical to 4.6.0.

**"Use the T-12's figures"**

- **What it does:** an explicit button, never automatic. It shows each
  figure's change before you confirm, then sets EGI, operating expenses, taxes
  and NOI, each tagged "T-12" with its months. It can also set the rent roll's
  operating expenses.
- **The OM's own figures** are kept for the comparison.
- **Undo** puts them back.

**The Review Queue**

- **The tab:** a new Review tab appears only when something is waiting, with
  a count. It is also in the search.
- **What it holds:**
  - T-12 lines to file, one item per label;
  - T-12 checks not yet seen: only N months, months that don't add up to the
    Total column, a stated subtotal or NOI that doesn't match;
  - AI readings never applied (dismiss);
  - firm template cells mapped with low confidence ("It's right").
- **Order:** items are listed with the most money at stake first.
- **Where each choice goes:** it is recorded where the item lives (the deal,
  the AI record, the template), so on a deal it can be undone.

**Smaller changes**

- `app/sheetread.js`: the spreadsheet reading the rent roll import used, now
  shared with the T-12 import.
- The phone tab bar fits six tabs.
- The tab bar is a little less see-through (94% light, 92% dark), so its
  labels keep their contrast over any page.
- A toast's action button is at least 32 px.

**Tests**

- **`tests/t12-layouts.js`:** eight invented statement layouts, written as
  files when the tests run. No real file, figure or name is in the
  repository.
- **`tests/t12.test.js`** (19 tests): reading amounts, months and labels;
  matching; each layout's category totals against hand-worked figures; signs;
  subtotals; partial years; remembered corrections.
- **`tests/t12-noi.test.js`** (7 tests): the NOI flags at each threshold,
  direction and cause; a partial year and lines still to file; the OM's own
  NOI after its figures are used; the Review Queue's items.
- **Changed tests:**
  - `backup.test.js`: corrections merged on restore;
  - `impact.test.js`: a deal with a T-12; every new check reads only what the
    map lists, and is moved by what it reads.
- **Mutation checks:** eight deliberate breaks, every one caught:
  - a bare management fee guessed;
  - negative expenses not flipped;
  - a partial year scaled up;
  - the warning moved to 10%;
  - the insurance rule removed;
  - asset management put in operating expenses;
  - the OM compared with the rent roll without a T-12;
  - dismissed AI readings kept.
- **`tests/e2e/t12-flow.mjs`** (35 checks) covers import, Review, filing,
  NOI three ways, use and undo, reload, Settings, the bare management fee,
  nine months, the AI and template items, .xls refused, and the phone. It
  fails on 4.6.0, whose deal screen has no T-12 card.
- **`a11y-flow`:** axe on the T-12 card, "Every line" and Review, in light
  and dark.
- **`tests/tools/t12-local.mjs`:** for real T-12s kept in the git-ignored
  `private/` folder. It prints only structure.

## 4.6.0: the keyboard shortcuts, on one sheet (on the development branch; not merged or deployed)

Phase 1, item 4: the `?` sheet.

- **Opening it:** press `?` anywhere you aren't typing. It is also
  "Keyboard shortcuts" in the search (⌘K or Ctrl K), and a button in
  Settings next to the ⌘K hint.
- **What it lists:** every key the app answers to, grouped by where it works:
  - anywhere: search, `/`, Esc;
  - in the search;
  - in a deal: undo, redo, the tabs, renaming, a figure's working;
  - in the rent roll grid: arrows, Enter, Esc;
  - in Settings: the theme control.

  It shows ⌘ and ⇧ on a Mac, iPhone or iPad, and Ctrl and Shift elsewhere.
  Ctrl Y appears only off a Mac, where it is the other redo.
- **Typing `?` in a field stays a question mark.** Escape closes the sheet.
- **One list, held to the code.** The list lives in `app/shortcuts.js`.
  `tests/shortcuts.test.js` reads every keydown handler in `app/` and fails:
  - if a handler answers to a key the list doesn't name for that file;
  - if a listed key is no longer handled.

  Checked by mutation: adding an `F2` handler to `command.js` fails the test,
  naming `command.js: "F2"`.
- **Tests:**
  - `shell-flow` (8 new checks): `?` opens the sheet; its groups and rows;
    focus is in the sheet; Escape closes it; the search and Settings open it;
    `?` typed in a field stays in the field. On 4.5.0, 6 of them fail.
  - `a11y-flow`: axe on the sheet, light and dark. The list takes the focus,
    so it scrolls from the keyboard on a small screen.

## 4.5.0: one list of migrations, run on open and on restore (on the development branch; not merged or deployed)

Phase 1, item 3: the migration registry, with the template count improvement
approved for this PR.

- **The registry.** `app/migrate.js` holds every change to a stored deal's
  shape, in order. Each step records what it did, in a version field on the
  deal, so it runs once:
  1. the money rounding (4.1: `moneyVersion` 1);
  2. the rent roll set up from the OM's rows, or an empty one (`schema` 2).

  Before this, the two lived in three places (opening a deal, drawing it, and
  the start-up pass), and a restored deal stayed in its old shape until it was
  opened. Now the open path, the restore and the start-up rounding all use the
  same steps.
- **On restore,** each deal an older version saved is brought up to date
  before it is stored.
  - The restore sheet says so: "3 deals saved by an older version are brought
    up to date as they are restored: money rounded to whole cents (1), rent
    roll set up (3)".
  - Each deal's history entry says so too.
  - The values rounded go into the rounding log, as before.
- **On open,** a deal in its old shape (one never restored) is brought up to
  date one step at a time, and each step is its own history entry. Before, the
  rounding's entry also held the new rent roll, and the "Rent roll set up"
  entry came out empty.
- **A deal from a newer version** (a version field above what this code
  knows) is left alone. A backup holding one is refused and nothing is
  restored: "This backup holds a deal saved by a newer version of Zlatura
  (“…”): update the app first."
- **What you see doesn't change.** For each deal in the old backup, restored
  and opened, the deal screen and the stored deal are exactly what 4.4.1
  gives. The lease ids are made new each time, and the time of the save
  differs.
  - One difference: a restored deal's rent roll "as of" date is the day of the
    restore, not the day it is first opened.
- **Template count.** The Affects sheet's firm template line now reads, for
  example, "Inputs!B6 · 1 formula directly, 2 in all". "In all" adds the
  formulas that read those formulas, and so on, with each counted once and
  stopping at 5,000. A formula that reads the cell through a named range now
  counts. A cell held by a named range names it: "Inputs!B12 (named range
  InterestRate)".
- **Tests:**
  - `tests/fixtures/backup-3.1.0-before-rent-roll.json` is a real backup made
    by the old apps from git (`tests/tools/make-old-backup.mjs`):
    - 3 deals read from the suite's test OMs by the version before the rent
      roll;
    - backed up by 3.1.0 without being opened, so they are in their old shape.
  - `tests/migrate.test.js` (7 tests):
    - each step runs on the 3.1.0 and 3.3.0 backups: one lease per OM row at
      the row's rent, and everything rounded;
    - a second run does nothing;
    - one step at a time equals all at once;
    - a newer deal is refused;
    - the restore line is right;
    - it **fails if a step is added without an old backup that needs it**.
  - `tests/e2e/migrate-flow.mjs` (20 checks) runs the new app beside 4.4.1,
    taken from git. On 4.4.1, 8 of its checks fail: the restore leaves the
    deals in their old shape, says nothing, keeps the newer deal, and records
    the open as one entry.
  - Formula reach is covered by `tplcells.test.js` (a chain, a named range
    read in any case, text that only looks like a reference, a circular pair,
    two cells sharing formulas, the cap) and by `impact-flow` (NOI: "1 formula
    directly, 2 in all"; the loan rate: its named range).

## 4.4.1: units the checker holds every number to (on the development branch; not merged or deployed)

Phase 1, item 2, as approved: the typed deal model with unit types. **Nothing
the app shows or saves changes.**

- **Units.** `types/zlatura.d.ts` defines them as "flavors":
  - dollars at one time, a year, and a month;
  - rent per SF a year and per SF a month;
  - price per SF and per land SF;
  - per unit, and per unit a month;
  - a rent in its quoted unit;
  - percent, fraction, relative change, points and basis points;
  - SF, land SF and acres;
  - years and months;
  - ISO dates, day numbers and Excel serials;
  - multiples.

  The same file describes the deal, the rent roll, scenarios, the analysis's
  results and the projection with them.
- **How a flavor works.** A plain number is accepted anywhere. A number known
  to be in one unit is refused where another is expected.
- **What carries units.** In `app/`, as JSDoc comments only:
  - the engine;
  - every registered figure: its result is held to its unit, and its unit
    label to that unit;
  - the lease engine (rents in their unit, converted only by
    `monthlyAmount()`);
  - the parsers (`parsePct` gives a percent);
  - the formatters (`pct()` refuses a fraction, `yrs()` refuses months,
    `money0()` refuses a percent);
  - the workbook's percent-to-fraction step.
- **The checker.** `tsc --checkJs` runs over every file in `app/` from
  `npm test`. TypeScript is a pinned dev dependency only, and its config and
  the types sit outside `app/` (`types/`). Nothing is built; the browser and
  the offline cache load exactly the files they did.
- **The 197 loose spots** the checker found in 4.4.0 are annotated, comments
  only. Of the 28 files changed in `app/`, 26 parse to the identical program.
  The other two differ only in this:
  - the more precise unit labels in `engine/figures.js` (NOI is dollars a
    year, NOI per SF is per SF a year, the price against the comps is a
    change);
  - the Affects sheet mapping those labels to the same formats as before.
- **Tests:**
  - `tests/types.test.js`: the check passes; at least 24 deliberate mix-ups
    are kept; and nothing the checker needs is in `app/` or the offline cache.
  - `tests/types/mistakes.js`: 24 mix-ups (fraction for percent, months for
    years, a month's rent for a year's, a price per SF as a rent, and more).
    Each must be a type error. On 4.4.0's code 22 of them go through (the
    other 2 test the deal-model types themselves, which 4.4.0 doesn't have).
  - `tests/units.test.js`: each figure's unit agrees with its template field
    type, its Deal Analysis cell (format, and a percent stored as a
    fraction), and how the brief shows it.
- **No change:**
  - the 618 saved deal results match;
  - the 646 displayed figures, workbook cells and tool results are
    byte-identical to 4.4.0;
  - `analyze()` runs at the same speed (0.357 ms against 0.357 ms).
- **Not split:** building SF into GBA, RSF and USF. That waits for Phase 2.

## 4.4.0: what a change affects (on the development branch; not merged or deployed)

Phase 1, checkpoint (e), part 2 of 2, as approved: the dependency map and its
screens.

### On screen

- **Affects** beside every input on a deal: each figure, loan term and What-if
  assumption, and each rent roll Assumption. The sheet lists everything that
  moves with it on this deal as it stands, in five groups:
  - figures (the deal's, the rent roll's, the projection's);
  - checks and questions;
  - scenarios (the What-if and each saved one; one that sets its own value
    is shown as not affected);
  - exports: Deal Analysis rows by cell, the rent roll sheets, the CSV, and each
    firm template's cells with how many of its own formulas read them;
  - documents: the brief by section, and Copy summary.
- **Could also affect** is folded away: what the input reaches only in other
  circumstances, each with its condition ("only when no price is entered",
  "only for a rent quoted per SF", "only when there are sale comps").
- **Try a value**: before → after for each line, without saving. On a lease or
  a rent roll Assumption the projection is worked out in the worker.
- **How it's worked out**: the overview's tiles open what their figure reads,
  with its conditions, down to the inputs you type.
- **Rent roll**: "What this lease affects" in a lease's ⋯ menu; "What a column
  affects…" in the rent roll's ⋯ menu.
- **History**: "What it changed" on each change.
- **Ctrl/Cmd K**: "What does … affect?" for each input of the open deal. These
  appear only when the search asks ("affect", "impact", "depends", "what does"),
  so a plain search such as "lender" still finds the contact first.

### How the map is kept true (`app/impact.js`)

- **Deal analysis:** each figure, check and question comes straight from the
  formulas registered in 4.3.2.
- **Everything else:** the rent roll summary, the projection's lines,
  scenarios, template fields, Deal Analysis rows and sections, the rent roll
  sheets, the brief's sections and the summary each declare what they read.
- **"On this deal, now":**
  - For the analysis, the formulas are run once with every read recorded, so
    a branch not taken (a price entered, so the cap rate isn't used for it)
    isn't counted.
  - Elsewhere, a read that only matters sometimes says how to tell.
- **Every file and printout the app hands over** names its part of the map
  (`deliver()` and `printed()` take `{ map }`). The backup, the pipeline,
  tools and comps say "none: why".
- **Two small changes, no figure changed** (`analyze-golden` still passes):
  - one rule tests for an entered price first, so the map can see the
    stated cap rate doesn't matter then;
  - the deal screen's list of figures moved to `dealfields.js` so the tests
    can read it.

### Tests (all new; they fail on 4.3.2, where there is no map)

- `tests/impact.test.js` (15):
  - every key `analyze()`, the rent roll summary, the projection and
    `runScenario()` return is registered: **adding a calculation without
    registering it fails**;
  - every template field declares its reads;
  - every `deliver()` and `printed()` call names its map entry;
  - each formula and template field may read only what it declares (a guard
    throws);
  - on 80 random deals and the rich rent roll (rents per SF and a year), each
    input changed in turn, everything that moved is on the map's list for it
    on that deal;
  - each declared read is read on some deal, and each input it reads is seen
    to move it;
  - no orphan inputs, and loops are refused.
- `tests/impact-files.test.js` (5): the same on two fixture deals, with and
  without comps (about 280 changes), for the deal workbook (each Deal Analysis
  row and section), the rent roll workbook, the brief (each section) and Copy
  summary. Every sheet, row, section and heading is registered, and the
  brief, the summary and the Deal Analysis sheet read only what they declare.
- Nine deliberate breaks (an unregistered figure, an undeclared or
  over-declared read, a wrong workbook row, a brief section missing a read, a
  rent roll figure or projection line missing a lease field, the scenario
  occupancy fix undone) are each caught by at least one test.
- `impact-flow` (29 checks, in `run.sh`):
  - the stated cap rate, with "could also" and its condition;
  - a firm template's NOI cell (not its price cell), with how many of the
    template's own formulas read it;
  - a tried loan rate, with DSCR before → after, nothing saved and History
    unchanged;
  - the DSCR tile's workings;
  - the command menu, and a plain search not crowded by it;
  - on the 500-lease deal: a lease's list, a column's list (SF doesn't move
    rents quoted a year), History's "What it changed" with a tried rent;
  - timings;
  - axe on the sheet, desktop and phone.

### Found by the tests while building

- `shell-flow` (an existing test): with a deal open, "lender" in Ctrl K found
  "What does lender minimum DSCR affect?" before the contact whose role is
  Lender. The commands now show only when asked for.
- A scenario that sets its own occupancy still reads the deal's: it scales the
  deal's income by the ratio. The map said otherwise; corrected.
- The SF of a lease moves its rent only when the rent is quoted per SF; the
  rent roll's rent figures now say so.
- Whether the price was worked out from the others, and whether the NOI was,
  are kept in one record. On the map they are two, so NOI no longer lists the
  price's template cell or workbook row.

## 4.3.2: the deal analysis, one registered formula per figure (on the development branch; not merged or deployed)

Phase 1, checkpoint (e), part 1 of 2, as approved. **No figure, check or
question changes.** This is groundwork for the dependency map ("what does
this change affect"), which comes in 4.4.0.

- `analyze()` (every figure on a deal's Overview, the What-if's figures, the
  deal workbook and brief, the checks under "What doesn't add up" and the
  questions) was one function. Each figure is now a formula registered in
  `app/engine/figures.js` with its label, unit and what it reads: other
  figures, or the deal's inputs. Each check and question is registered the
  same way. A formula can read only what is registered above it, so no figure
  can depend on itself; registering one that would is refused.
- `analyze()` keeps its name and gives the same result, key for key, so every
  screen, export and test that calls it is unchanged. `leaseStats` and
  `yearsLeft` moved with it and are still exported from `deal.js`.
- **Checked:** `tests/analyze-golden.test.js` holds what 4.3.1 returned on
  618 deals (the three OM fixtures, the deal tests' edge cases and 600
  seeded random deals with missing, zero, negative and text values),
  analysis and scenario, to the last digit. All match. Every figure as the
  app displays it, the deal workbook's cells and the tools (646 values,
  `tests/tools/golden.mjs`) are identical to 4.3.1.
- **Speed:** `tests/tools/analyze-bench.mjs`, the 500-lease deal, both
  versions alternating: 0.275 ms against 0.273 ms (+0.7%), and the other way
  round −1.2%: the same within measurement noise.
- The version is 4.3.2 only so installed copies pick up the two new files.

## 4.3.1: history in backups, and the space it may take (on the development branch; not merged or deployed)

Phase 1, checkpoint (d), parts C and D, as approved.

### Backups, version 2

- A backup carries each deal's history and snapshots. They are included by
  default; untick the option under "Back up everything" for a smaller file.
- A restore combines the backup's history with the device's by entry id, in
  time order, and adds snapshots the device doesn't have. Nothing in either
  is overwritten.
- Version 1 backups (4.2.1 and older, including 3.3.0's) still restore. Each
  deal's history then starts with the restore.
- 4.3.0 and older refuse a version 2 file with "made by a newer version".
- Removed photos and recordings (the 30-day trash) aren't in a backup.

### The space history may take

- **Per deal:** the last 1,000 changes or 2 MB of history, whichever comes
  first; the oldest go. History then says "kept since …".
- **Overall:** history, snapshots and removed media together get 50 MB, and
  never more than half of the browser's quota for the site. Over that, the
  oldest automatic snapshots go first, then the oldest history (any deal),
  then the oldest removed photos and recordings. Named snapshots are never
  removed.
- **Settings → Your data** shows what each takes against the space allowed.
  It warns from 80% of that space, or of the browser's quota.
- A deal's ⋯ → History can clear its history; the deal and its snapshots
  stay.
- **How sizes are kept:** in one small record, updated in the same
  transaction as each change. If it's missing (a 4.3.0 database), it is
  counted again.

### Tests

- `tests/backup.test.js`: 4 new tests, which fail on 4.3.0.
- `limits-flow`: 18 checks, which fail on 4.3.0:
  - version 2 backups with and without history;
  - restored on an empty device, Undo and snapshots work;
  - a 4.2.1 backup restores;
  - the 1,000-entry and 2 MB limits, "kept since", clearing a history;
  - recounting a 4.3.0 database;
  - the overall space with a 6 MB quota, automatic snapshots going first,
    and the 80% warning.

## 4.3.0: change history, undo and snapshots (on the development branch; not merged or deployed)

Phase 1, checkpoint (d), parts A and B, as approved. Backups version 2 and
the storage limits (parts C and D) follow in a second pull request.

### History and undo

- **History:** every change to a deal is kept in its history, as an entry
  with:
  - what changed, old and new;
  - a plain-English label ("NOI: 393,450 → 400,000", "Deleted unit 110",
    "Imported 500 units from a spreadsheet");
  - the time.

  Edits within one save (400 ms) are one entry. The entry is written in the
  same IndexedDB transaction as the deal, so both are saved or neither is.
  Changes made from Home or by a restore are recorded too.
- **Undo and Redo** for the deal:
  - buttons in the deal's header say what they would undo or redo;
  - Ctrl/Cmd Z and Shift Ctrl/Cmd Z (or Ctrl Y) do the same, except while
    you're typing in a field;
  - 100 steps, kept across reloads;
  - "Undo to here" in History (⋯ → History);
  - an undo is itself recorded;
  - an undo is refused, with a reason, if a value it would change has changed
    since.
- **Rounding:** values rounded as they are saved, and the 4.1 migration's
  rounding, are recorded as rounding entries in the deal's history. They are
  never undone.
- **Removed photos and recordings** are kept in a trash for 30 days, so an
  undo or restore can bring them back. A deleted deal's history and snapshots
  are kept 30 days too.

### Snapshots

- Named snapshots, up to 20 per deal.
- Automatic ones, up to 10, taken before:
  - a rent roll import;
  - Tools applying more than one field;
  - AI figures applied;
  - a snapshot restore;
  - a backup restore that overwrites the deal.
- **Compare** lists every difference, then and now. **Restore** is one step
  you can undo.
- An import too large to keep as one entry (over 256 KB of changes, e.g. 1,000
  leases) is undone by restoring the snapshot taken before it.

### Storage

- The database moves to version 2 and gains three stores: history, snapshots
  and trash. Nothing already stored is touched.
- If an older tab still holds the database, the new tab says so and waits.
  If a newer version takes over the database, the tab says "Reload to finish
  updating", and edits made meanwhile are kept in its recovery copy.

### Performance

- A save on the 500-lease deal now takes 15 ms instead of 3 ms (43 ms
  instead of 10 ms with the CPU slowed 4×), 400 ms after the last keystroke.
- No main-thread block of 50 ms or more.
- `perf-flow`'s budgets still pass: an edit is 80–88 ms against 67–79 ms on
  4.2.1, measured back to back.

### Tests

- `tests/history.test.js`: 13 tests, including 400 random round trips of
  compare-and-apply.
- `history-flow`: 18 checks.
- `snapshot-flow`: 24 checks, including axe on the History sheet.
- `upgrade-flow`: 20 checks. A 4.2.1 database with a deal, a photo, a task
  and a backup is upgraded, plus the blocked and outdated cases.
- The new flows and unit tests fail on 4.2.1.

## 4.2.1: a failed projection says so (on the development branch; not merged or deployed)

- **What if:** with NOI taken from the rent roll, a projection that failed
  left the panel on "Working out NOI year by year…" indefinitely, and every
  redraw asked again. It now says the projection couldn't be worked out and
  why, and shows no returns on another basis. Saved scenarios on that basis
  say the same.
- **Retries:** a failure is remembered by the rent roll's content, like a
  result, so the same rent roll isn't retried on every redraw. Any change to
  the rent roll tries again.
- **Tests:** `tests/projector.test.js` has a new failure test.
  `bigroll-flow` serves a worker that always fails and checks What if, a
  saved scenario and the Rent roll tab. Those What if checks fail on 4.2.0
  (3 of them) and pass now.

## 4.2.0: a 500-lease rent roll at speed (on the development branch; not merged or deployed)

Phase 1, checkpoint (c). On a 500-lease rent roll (medians, this container's
headless Chromium; details and every run in
`docs/proposals/checkpoint-c-results.md`):

| | 4.1.0 | 4.2.0 | Budget |
|---|---|---|---|
| Open the Rent roll tab | 1,843 ms | 189 ms | under 1 s |
| Edit a rent, totals shown | 1,065 ms | 66 ms | under 150 ms |
| The same with the CPU slowed 4×: open / edit | 9,699 / 4,894 ms | 814 / 326 ms | the edit misses 150 ms |

No figure changed: the golden comparison (646 figures) and an in-browser
comparison of every value shown for the 500-lease deal (1,026) are identical
to 4.1.0.

### The projection

- **14× faster** (873 ms → 61 ms for 500 leases over 10 years), with
  identical results. Date conversion is remembered instead of repeated, and
  each lease's period dates are converted once instead of every month.
  Checked against 4.1.0 on 7,931 outputs from 301 rent rolls.
- **Worked out in a web worker** (`app/projector-worker.js`, through
  `app/projector.js`). This covers the Rent roll tab, the Overview's
  gross-income check and What if's NOI from the rent roll.
- The rest of the screen draws at once; the projection fills in when it
  arrives. Results are kept per exact rent roll content, so a stale answer
  is never shown.
- If the worker can't load, the same work runs on the page. It works offline.
- Exports, template fills and the brief still work it out on the page, now
  14× faster.

### The grid

- A rent roll of more than 100 units draws only the rows near the screen
  (about 60) and draws more as you scroll. Rent rolls of 100 units or fewer
  draw whole, as before.
- The grid tells screen readers its full size (`aria-rowcount`) and each
  row's place.
- Arrow keys move past the drawn rows.
- A cell being typed in is saved if its row scrolls away.
- + Unit draws and focuses the new row.
- Totals, search and validation always cover every unit.
- The browser's own find (Ctrl F) and printing the screen see only the drawn
  rows of a long rent roll.

### Tests

- `tests/projector.test.js` covers the cache, the snapshots and the fallback.
- `tests/e2e/bigroll-flow.mjs` covers windowing, keys, saving on scroll,
  search, + Unit, axe, the worker, offline and the no-worker fallback.
- `tests/e2e/perf-flow.mjs` checks the budgets, timed inside the page,
  `THROTTLE=4` for a slow CPU. Both flows are in `run.sh`.

## 4.1.0: one calculation engine (on the development branch; not merged or deployed)

Phase 1, checkpoint (b). Each figure that was worked out in more than one
place now comes from one function in `app/engine/`, with the definitions
approved on 2026-10-10. Every figure that changed, before and after, is in
`docs/proposals/checkpoint-b-results.md`.

### One definition each

- **WALT** everywhere (Overview, Rent roll tab, brief, AI facts, WALT tool):
  - measured from the rent roll's as-of date, weighted by income, with
    month-to-month leases left out, in whole days of 365.25 a year;
  - the label says how, e.g. "WALT 3.9 yrs by income", with the full method
    on hover;
  - the Overview used to measure from today and count month-to-month rent at
    0 years: 2.7 → 3.9 years on the test case.
- **Debt service** amortizes over whole months everywhere, including the
  workbook's PMT formulas (`ROUND(years*12,0)`). At 27.4 years on
  $4,192,500: $336,150 → $336,079 a year. Whole and half years are
  unchanged.
- **Net effective rent:**
  - the comp workbook's Lease Comps formula now matches the NER tool:
    escalations compound at each anniversary, free months at the rent in
    force then. The example row goes $80.50 → $81.60;
  - labels say what the figure is net of ("free rent and TI", or "free rent,
    TI and commissions");
  - "Discounted net effective" is now "Net effective rent, discounted";
  - the Lease Comps tab still has no commission column, and its note says
    so.
- **Break-even occupancy:**
  - one function for the deal and the tool, which names its basis: GPR,
    estimated from gross income and occupancy "(est.)", or share of current
    income;
  - the tool gains optional gross income and occupancy inputs for when there
    is no GPR.
- **No price from a zero or negative NOI:**
  - the price shows "—" with a warning, on the deal and in Quick value;
  - it used to derive −$833,333 from −$50,000 at 6%.
- **Comps** count toward $/SF only with a price and size both above zero,
  everywhere, including the comp workbook's summary formulas.
- **Median comp age** in the comp-set check is the true median.

### Money

- Totals are stored in whole cents; rates per SF or per unit are stored to
  four decimals. Computed figures stay in floating point.
- New values are rounded as they are saved.
- Values already on the device are rounded once, when 4.1 first opens, and
  after a backup is restored. This covers deals, typed and edited comp
  prices, and the Tools' saved inputs and scenarios.
- Every value rounded is logged with where it was, the old value and the new
  one. Settings → Your data shows the count and the full list.
- Values are kept as rounded numbers, not integer cents, so the saved-data
  shape is unchanged.

### Calculation conventions

- Settings → Calculation conventions lists every convention the engine
  uses.
- WALT weighting (income or area) and month-to-month treatment (left out or
  counted at 0 years) can be set there; the rest are listed.

### Fixed while checking

- **The Overview's WALT read the deal's older flat copy of the rent roll.**
  After a lease edit it could disagree with the Rent roll tab. It now uses
  the lease rent roll.
- **The NER tool treated a part month of free rent (2.5 months) as a whole
  one (3).** Found when LibreOffice's recalculation of the new formula
  disagreed with the engine.

### Correction

- The Phase 0 report (D9) said the loan sizing tool's equity figure was never
  shown. It is shown, labelled "Equity needed … before closing costs".
- It was kept, not removed as approved on that wrong premise. The user
  decides.

### Tests

- `tests/engine.test.js`: 11 known-answer tests, with values worked out
  independently. 9 fail on 4.0.0.
- `tests/money.test.js`: 5 tests of the rounding and its log.
- The browser flow `engine-flow`.
- `tests/e2e/make_engine_check.mjs`: LibreOffice recalculates the new NER,
  PMT and comp formulas against the engine.
- `tests/tools/golden.mjs`: records every displayed figure and workbook cell,
  and diffs two versions of the app.

## 4.0.0: Zlatura (on the development branch; not merged or deployed)

Comp Loader is now **Zlatura**. *Every source. Every assumption. Every
number.* No figure, formula or saved-data shape changed; this release renames
the product and moves the data kept on each device to the new name.

### The move from Comp Loader

- The IndexedDB database `comp-loader` is copied to `zlatura` the first time
  4.0 opens: every store in one transaction, so it happens completely or not
  at all, and only into empty stores, so nothing newer is overwritten. A
  `meta` store records the move.
- `comp-loader.*` settings keys (theme, loan terms, subject, Tools inputs,
  recovery copies) are copied to `zlatura.*` once, before any module reads
  them. Copying only once matters: a recovery copy the app has deliberately
  cleared must not come back.
- The old database and keys are kept until a backup has been made since the
  move, or for 30 days, then deleted. Settings → Your data says so meanwhile.
- New files are written as `zlatura-backup`, `zlatura-project` and
  `zlatura-template`; the `comp-loader-*` formats are read for good, and old
  backups' settings come back under the new key names.
- Refilling a firm workbook that has a *Comp Loader Audit* sheet replaces it
  with a *Zlatura Audit* sheet instead of adding a second.
- The offline cache is `zlatura-4.0.0`; the old cache is removed when the new
  service worker activates.

### Identity

- A new mark (a Z with a bar through it, as currency signs are drawn), in ink
  and gold, with light and dark versions (`docs/brand/`), an adaptive SVG
  favicon, and new app icons (any and maskable).
- The tagline and "About the name" in Settings → About and the README.
- Every visible name, the page title, the installed app's name, workbook
  creator fields, file names, the AI server's name and package names.

### Fixed

- A deal's Pipeline card could wipe a next step being typed: changing the
  stage (or a task or contact changing anywhere) refreshes the card, and the
  refresh rebuilt its fields empty. It now keeps what is typed and the
  focus; a step that has been added still clears its field. Found when the
  browser suite failed intermittently on this; a test now forces the refresh
  (fails before the fix, passes after).

### Tests

- `rename-flow` (browser): the real 3.3.0 app, taken from git, is used on a
  site; the new app is served at the same address and must open with the
  deal, photo, task, contact, comp set, theme and loan terms; a backup then
  finishes the move (old database and keys deleted); a backup made by 3.3.0
  restores into a fresh copy of 4.0.
- `rename.test.js`: that 3.3.0 backup (kept as
  `tests/fixtures/backup-comp-loader-3.3.0.json`) reads and plans a full
  restore; old and new format ids; the once-only key copy.
- The template audit-sheet test covers a workbook filled before the rename.

## Zlatura Phase 0

- Fixed: the lease comparison tool's **Landlord PV** was the NER multiplied by
  area and years (a sum of payments, not a present value). It is now the
  present value of the landlord's cash at the discount rate, after TI and
  commission, as its label and note say. At 12% on $1,000 a month for a year it
  shows $11,367.63, not $12,000.
- Added the Phase 0 baseline report, the Zlatura acceptance matrix and the
  architecture proposal under `docs/`.

## 3.3.0 (on the development branch; not yet merged or deployed)

A redesign of how the app looks and is found around. No formula, data
mapping, saved-data format or scenario rule changed; every screen still shows
the same figures from the same calculations. The version (and the offline
cache name) is 3.3.0, so an installed copy fetches the new files once.

### Design system

- One stylesheet, `app/styles.css`, built on tokens: a warm paper and ink
  palette with a single cobalt accent for links, focus and selection, a brass
  identity mark, semantic good, warning and bad colours, a 4-point spacing
  scale, radii, borders, elevation and motion durations. Every figure uses
  tabular numerals; property names and page titles use a serif.
- **Light, dark and system** appearance, chosen in the sidebar or in
  Settings and kept on the device. It is applied before the first paint, so
  there is no flash of the wrong theme; the browser chrome colour follows it.
- Consistent controls: one primary (ink) button per area, bordered secondary
  buttons, quiet fills; 38 px fields; segmented controls; switches; chips.
- Motion is short and only shows a change of place or state; with Reduce
  Motion on, it is removed.

### Navigation

- A sidebar on a computer (Home, Deals, Comps, Tools, then Settings) and a
  five-tab bar on a phone. The app opens on Home.
- **Search or jump** (⌘K, Ctrl K or "/"): deals, contacts, the 30 tools,
  screens and actions, from the keyboard. It opens at once and keeps what is
  typed while the deals load. Results are grouped, with the group holding the
  best match first.
- **Settings**: appearance, template library, pipeline stages, the AI
  connection, backup and restore, and the version. Backup moved here from
  Home; Home still says when there is no recent backup and links to it.

### Screens

- **Home**: a greeting with the day's real counts and the three common
  starts (read an OM, add comps, new task); four summary figures; **Continue
  working** with each recent deal's stage, asking price, cap rate, NOI and
  next step (or that none is set); Needs attention; key dates; the pipeline
  with a stage bar; tasks; activity; contacts.
- **Deal workspace**: the property name is the page heading, with its stage
  beside it (kept in step with the Pipeline card); Overview, Rent roll, What
  if and Site visit are underline tabs that stay in view while scrolling and
  then show the deal's name. On a wide screen the analysis sits in a main
  column with the pipeline, next steps, rent roll summary and questions in a
  rail; on a tablet or phone the pipeline and next steps come first.
- **Dense figures**: sticky table headers; the rent roll's unit column and
  the projection's row labels stay in place while the table scrolls sideways;
  the what-if comparison is kept to a readable width.
- **Tools**: the 30 tool icons are tinted by group instead of one colour each.

### Fixed

- Home could show no deals, and a task's deal as deleted, for the first
  moment after reading an OM (the new deal was not yet saved). The deal list
  now includes deals that are open but not yet saved.
- Typing straight after ⌘K could lose the first characters.
- The section tabs could show the deal's name (their scrolled state) while the
  header was still in view, when a deal was opened from a hidden screen: the
  first of several batched visibility reports was read instead of the last.
- At 320 px the Comps screen's Excel output choice was 1 px wider than the
  screen; segmented controls now wrap their labels on narrow screens. The
  browser tests' overflow check compared against a width that grows with the
  overflow, so it could not catch this; it now compares against the layout
  width.
- On a slow device, a new contact's details could end up in the name: the
  sheet focused its name field 50 ms after opening, even if a person had
  already moved to the phone field. It now leaves a chosen field alone.
- Task checkboxes were 22 px, under the 24 px minimum target size.
- Chart labels and the tab bar's labels were 10.5 px; now 11 px.

### Tests

- New browser flow `shell-flow` (navigation, theme persistence across a
  reload, search or jump, Settings controls, phone tab bar).
- The accessibility flow now also audits Settings and the search dialog, and
  Settings, Comps, the rent roll, What if and the search dialog in dark mode.

## 3.2.0 (merged into `main` in pull request #2)

The version (and so the offline cache name) is 3.2.0, so an installed copy
fetches every new file whole once this reaches the published site.

### New

- **Rent roll workspace** (Deal → Rent roll). Leases as dated rent periods
  with a lease engine behind them (`app/lease.js`): per-month, per-year and
  per-SF rents, step increases, day-weighted proration, free rent and partial
  abatements, recoveries (pro rata, base year, stop, fixed), percentage rent,
  one-time items, renewal and re-leasing blended by probability, lease-up, and
  a monthly and annual projection to NOI. Configurable columns, presets,
  saved layouts, keyboard navigation, validation (overlaps, gaps, bad dates),
  expirations, concentration, import from Excel or CSV, and Rent Roll, Lease
  Schedule and Cash Flow tabs in the deal workbook. What if can use the
  projection's NOI year by year.
- **Template library.** Upload a firm's own .xlsx or .xlsm, map deal fields to
  its cells (suggested from named ranges and labels, corrected on a
  tap-to-map view), preview every cell before writing, and fill it in place:
  formulas, formats, merges, named ranges, hidden sheets and macros kept, an
  optional audit sheet of every value written and its source. Versions,
  duplicate, export and import as one file.
- **Tools: 23 new calculators**, 30 in all, in seven groups with search:
  discounted cash flow (optionally on the rent roll's NOI), NOI bridge,
  break-even occupancy, value sensitivity; amortization schedule, refinance
  and cash-out, floating-rate stress with a rate cap, maturity and refinance
  risk, financing costs; hold returns before and after sponsor fees, IRR
  sensitivity, a distribution waterfall with IRR hurdles, commission and
  splits; lease proposal comparison, renewal versus replacement, escalation
  schedule, percentage rent, recoveries, absorption; a comp set check; and
  residual land value, yield on cost and construction draws.
- Every tool can **save named scenarios**, **export** to Excel or print, and
  explain its formula; tools that use deal figures can **load them from the
  open deal**. Loan sizing, the NOI bridge and hold returns can **send their
  result to the deal**, after a confirmation listing each change from old to
  new; figures are tagged as typed from that tool, and hold assumptions go to
  the What if scenario, never the deal's figures.
- The Deal screen is split into Overview, Rent roll, What if and Site visit.
- **AI features, through an optional server** (`server/`, which holds the API
  keys; the app holds only its address and an access token). Read documents
  with AI: figures come back with their passages, which the app checks against
  the document text before showing them, and nothing is applied until the
  broker ticks it. Ask about this deal: answers from the deal's facts with
  citations. Transcribe voice notes, correct the transcript, and make notes
  (summary, decisions, action items, figures mentioned). Every send is
  confirmed; with AI off nothing leaves the device.
- **Home**: a dashboard with what needs attention, the pipeline by stage
  (stage also on each deal's new Pipeline card, with its history), tasks by
  due date, contacts linked to deals, recent activity, and every file saved
  or page printed. A pipeline report exports to Excel or prints. Call-note
  action items can become a deal's next steps. Nine stages (the firm can
  rename or hide them) and key dates per deal, with the next 30 days on Home.
  The deal brief includes call-note summaries, labelled as AI summaries.
- **Backup and restore** of everything on the device in one file (deals with
  photos and recordings, comps, templates, tasks, contacts, settings; never
  the AI token). Restoring merges, newer copy winning, or replaces everything
  after a second confirmation. Home shows storage use, whether the browser may
  clear it, and the last backup, and reminds after 30 days.
- **Reconciliation without AI** (`app/reconcile.js`): quoted passages checked
  against page text, readings grouped by tolerance (never auto-picked), and
  the rent roll checked against the OM's occupancy, SF, rent and units.

### Fixed (accessibility and security)

- Text contrast: the faint grey, the green, amber and teal now meet WCAG AA
  (4.5:1) on every surface they sit on, light and dark.
- Tap targets of at least 24 px (WCAG 2.2): page-source tags, chips,
  checkboxes; sideways-scrolling tables can be reached and scrolled from the
  keyboard; the file pickers have names; chart points have a role for their
  labels; a date field shows a focus ring on its calendar button too.
- A Content-Security-Policy forbids plugins, a re-pointed base URL and form
  posts; the page sends no referrer.
- The AI server limits each client to 20 AI requests a minute.

### Tests

- `tests/lease.test.js` (18), `tests/tplcells.test.js` (7) and
  `tests/calc.test.js` (12) check the new maths against figures worked out by
  hand or independently.
- `tests/reconcile.test.js` (5) for quote checks and reconciliation;
  `tests/pipeline.test.js` (6) for stages, key dates, task due dates and attention;
  `tests/backup.test.js` (4) for the backup round trip and restore plans;
  `server/test/server.test.mjs` (10) runs the server and the real Anthropic SDK
  against a local stand-in for the API. No live model call is tested: that
  needs a key.
- Browser flows `rentroll-flow` (22 checks), `template-flow` (16),
  `tools-flow` (28), `home-flow` (32), `backup-flow` (16: a wiped browser restored, photos byte
  for byte) and `ai-flow` (26, against the real server code and
  stand-in model and speech services), and the filled template recalculated
  in LibreOffice.
- `a11y-flow` (24 checks): axe-core's WCAG 2.0/2.1/2.2 A and AA rules on every
  screen and the main sheets, light and dark, with no violations; every
  control Tab reaches on Home shows a focus ring; 24 px targets; reflow at
  320 px. Automated checks are a floor: no screen-reader session was run.

## 3.1.0

A reliability release, found by testing every workflow in a phone-sized
browser, and a live what-if on the Deal tab.

### Fixed

- **A deal edited and closed within half a second was lost**, and a change
  made just before switching deals could be written into the next one. Saves
  now belong to their deal and are flushed on switch, close and leaving the
  app; a change still in flight when the app is closed is replayed on the next
  launch. Comp edits get the same protection.
- **Photos chosen for one deal could land in another** if the deal was
  switched while they were being shrunk. They now always go to the deal they
  were chosen for; so do voice notes, and a photo's Undo.
- **Closing costs, transfer tax and commission typed as 0.5 were read as
  50%.** These fields take a percentage as typed; a % sign is always taken
  literally.
- **Break-even occupancy was overstated** for a part-let building (it divided
  by effective rather than potential income). It now uses gross potential
  rent, else effective income scaled by occupancy, and says which.
- Gross potential rent is no longer taken for effective gross income, and
  pro forma NOI is read from the Pro Forma column of an operating statement.
- The lease clock counts down from the expiration date, not the OM's printed
  "years remaining".
- Value at the comps' cap rate warns when one or two comps carry it, and is
  withheld for a zero or negative NOI.
- On iPhone, tapping a field no longer zooms the page; comp prices and dates
  fit on the narrowest phones; the page-source tags take a finger-sized tap.
- Unreadable PDFs say why and what to do. A comps batch where every file
  fails says so.
- The brief no longer leaves a heading alone at the foot of a page (and is
  now called the deal brief: a full one runs to a second page).
- An installed copy downloads each release whole, bypassing the HTTP cache,
  so it can't mix old and new files; it checks for an update when reopened.
- The GitHub test workflow, `.nojekyll` and `.gitignore` are back.

### New

- **Live deal: what if**, with hold-period returns (levered and unlevered
  IRR, equity multiple, exit value), the price for a target cap rate or IRR,
  saved scenarios, and Save to deal only on confirmation.
- **Voice notes** on the site visit: record, or add a Voice Memos file.
  Stored with the deal, not transcribed.
- Site-visit lines say what was observed and what was told.
- A legend for the figure tags, and a fictional example deal.
- Known-answer finance tests.


## 3.0.0

A redesign, and two new screens beside the comps: **Deal** and **Tools**.

### New

- **Offering memorandum scanner (Deal tab).** Choose an OM's PDF and the asking
  price, NOI, cap rate, building and land size, units, year built, occupancy,
  income, expenses, taxes, zoning, single-tenant lease terms and the rent roll
  are read from it. Every figure shows the page it came from: tap the tag to see
  the line, and pick another reading if the OM prints more than one. Any two of
  price, NOI and cap rate give the third, marked as derived.
- **What doesn't add up.** The OM checked against itself: a stated cap rate that
  isn't NOI over price, a $/SF on a different square footage, a rent roll whose
  occupancy or area disagrees with the summary, pro forma upside, light
  expenses, and thin debt coverage.
- **Against your comps.** The asking $/SF against the sale comps on the Comps
  tab, where it falls in their range, and the value at their $/SF and median cap.
- **Financing and loan sizing.** Loan, debt service, DSCR, debt yield, cash flow,
  cash-on-cash, break-even occupancy, and the largest loan the property supports
  by LTV, DSCR and debt yield. Your terms are remembered for the next deal.
- **Value across cap rates**, WALT and rollover from the rent roll, and
  **questions to ask**, written from the gaps in the OM, to tick off on site.
- **Site visit**: a walk-through checklist, notes and photos, kept with the deal.
- **Deal outputs**: an Excel workbook (Deal Analysis and Rent Roll tabs, every
  result a live formula), a one-page brief to print or save as PDF with the
  photos, a five-line summary to text, and "use as the comps subject". The comp
  workbook can carry the open deal's analysis as a tab after the Summary.
- **Your own Excel template.** Upload the comp sheet your firm already uses and
  the Excel button fills it: the header row is found and each column matched to
  a comp figure by its wording, and you can change any match. Only the comp
  cells change; formatting, formulas, charts, logos and every other sheet stay
  exactly as they were. The built-in workbook is one tap away.
- **Tools tab**: quick value, loan sizing, offer price and seller net sheet, net
  effective rent, 1031 exchange deadlines, WALT and rollover, and a converter.
- Saved deals, stored on the device; deals, template and settings survive a reload.

### Changed

- **New design.** A tab bar on the phone and a sidebar on a desk, grouped cards,
  the system font, a cobalt-and-teal palette, light and dark, and a new icon.
- **Comps on a phone are cards**, not a table to scroll sideways. Every figure is
  still editable in place.
- **Faster comps.** Search, sort (by $/SF, date, price, size, cap rate or name),
  include or set aside every comp in one tap, read two PDFs at a time with
  page-by-page progress, and the PDF reader and Excel library start loading
  before the tap that needs them.
- Export, CSV, comp sheet and project actions are in one action sheet.
- Copyright Kyle Alexander De Melo.

### Fixed

- The first visit no longer announces "a new version is ready".

## 2.1.0

### New

- **Buyer, seller and deal terms.** Each comp now carries CoStar's true buyer and
  seller (the recorded entity when no true party is printed), sale type
  (investment or owner-user), sale conditions (1031 exchange, bankruptcy, high
  vacancy, sale-leaseback and so on) and hold period. They appear on the Sale
  Comps tab, in the comp detail panel, in the CSV, and beside the Adjustment
  Grid, where they inform the conditions-of-sale adjustment.
- **Comp detail panel.** ⓘ on any row shows everything on a comp: figures,
  parties and terms, flags, CoStar's full notes, and a map link.
- **Printable comp sheet.** One landscape page with the headline figures and both
  comp tables, for a BOV or an offering memorandum. Print it, or save it as a PDF
  from the print dialog.
- **CSV export**, with a single full-address column that Google My Maps can
  geocode, so the whole comp set can go on a map in a minute.
- **Owner-user** sales and listings are marked in the comp tables.
- **Lender-guideline flags in the Adjustment Grid.** Each comp shows its overall
  net adjustment; comps past 15% net or 25% gross (both editable) are shaded and
  counted. These are underwriting guidelines, not limits, so nothing is dropped.
- The version number is shown at the foot of the page.

### Fixed

- **The market-conditions adjustment came from a regression that explained
  nothing.** Across a mixed comp set the $/SF-over-time line measures which
  properties sold when, not how the market moved; in the southeast Baltimore set
  it implied +61% a year and adjusted one sale up 341%. On all seven test sets R²
  was between 0.01 and 0.27. The adjustment now starts at 0% unless the line is
  reliable (five or more sales, R² 0.5 or better, within ±10% a year), and the
  reason is printed beside the rate.
- The size-adjustment note told you to enter a negative rate to adjust a larger
  comp up; with the formula as written, that adjusts it down. The note now
  matches the formula.
- Older iPhones could not read PDFs: the pdf.js build used needs Safari 17.4.
  The legacy build, which polyfills what is missing, supports iOS 16.4 and
  later, and an older browser is told plainly to update.
- The "Install app" button, the iPhone home-screen hint and an empty file list
  showed on every device: the stylesheet let a class override `hidden`.
- On a slow connection, a nine-second start-up timer could declare a working
  browser unsupported and hide the app for good. Start-up is now judged when the
  page finishes loading, and a file that failed to download gets its own message.
- Opening the app and dropping a report before saved work had loaded could
  overwrite the new report with the old session.
- Library files are now named with their version, so an installed copy can never
  keep a stale one from its cache.
- Montgomery County zones written without a hyphen (`CR3.0`) and the industrial
  zones (`IL-1.0 H-50`) now give a buildable SF.
- The test workflow failed on GitHub before running a test: it needed a
  `package-lock.json`, and `npm test` pointed at a folder Node 22 will not
  accept. Two tests also checked for the wrong XML spelling.
- Test dependencies: fflate 0.8.3 fixes a ZIP64 parsing loop (the browser copy
  is updated too), and uuid is pinned to a patched release. `npm audit` is clean.

### Checked

Every XML part of every generated workbook now validates against the ISO/IEC
29500 schemas, the check behind Excel's "We found a problem with some content".

## 2.0.0

### New in the workbook

- **Charts tab.** Native Excel charts: sale comps ranked by $/SF, sale $/SF over
  time with a linear trendline, and listings ranked by asking $/SF. They read
  live cell ranges, so they move when a comp is edited, and they carry cached
  values, so they draw in Protected View and in previews.
- **Adjustment Grid in the appraisal sequence.** Property rights, financing,
  conditions of sale and market conditions compound to a normalized $/SF; the
  property adjustments (location, size, age and condition, quality, occupancy
  and lease, other) are then summed and applied once. Each comp shows its gross
  adjustment and a reliability weight, and the conclusion is given both by your
  weights and weighted toward the comps that needed the least adjusting.
- **Pricing matrix.** The subject's value at a ladder of cap rates, with the
  center and the step as inputs, and each row's $/SF and premium or discount to
  the asking price.
- **Market read.** Median asking $/SF against median sold $/SF, and a count of
  sales in the last eighteen months that warns when the set is thin.
- **Montgomery County zoning.** Zone names such as `CR-3.0 C-2.0 R-2.75 H-145`
  state their own maximum FAR; it is read from the name, added to the Zoning
  Catalogue, and Bethesda and Silver Spring comps get a buildable SF.
- **No fifteen-comp ceiling.** The grids hold fifteen, as the template did, and
  grow when more comps are included.
- **Prepared by** line on the Summary.
- Hand edits, moves between Sales and On Market, and hand-entered comps are all
  named in each comp's flags and on the Audit Trail.

### New in the app

- Reports **add to the set**. Dropping a second batch no longer replaces the
  first, and edits survive.
- **Your work is kept** on the device between visits, and can be saved as a
  **project file** to open on another device or hand to someone else.
- **At a glance** panel: headline figures, a ranked $/SF chart of sold and
  asking side by side, and sale $/SF over time with the trend.
- **Add a comp** by hand, **move** a comp between Sales and On Market,
  **sold-within** window for the sales.
- Comps past the fifteenth are kept and set aside rather than dropped; tick one
  to include it.
- **Share** the workbook straight to Mail, Outlook or Files from a phone.
- Numbers can be typed as brokers type them: `5.2m`, `850k`, `6.25%`.
- Installs as an app on Android and desktop Chrome or Edge, and shows iPhone
  users how to add it to the home screen. On the desktop, an installed copy
  opens PDFs double-clicked in the file manager.
- Starts faster: the PDF reader and the Excel writer load only when needed.

### Fixed

- Editing a figure redrew the whole table and lost the keyboard's place.
- An edited price or size could leave the workbook out of $/SF order. The
  workbook is now always written high to low.
- Installed copies never picked up a new version unless the cache was renamed.
  The app's own files now come from the network first.
- Vertical alignment in the workbook was silently dropped by ExcelJS, so cells
  sat at the bottom of their rows.
- `INDEX` on a zoning code with no FAR recorded returned 0 rather than blank.
- A sale with no date in the Adjustment Grid read as day zero, a century ago.
- An active listing laid out as "Status  Active" on a line of its own was
  flagged as under contract. (The Python loader had the same flaw; it is fixed
  there too.)
- Lowercase zoning matched in Excel but not in the stored value.
- Typing `5.2M` blanked the price.
- One malformed comp page stopped the whole batch.
- Clipboard text starting with `=`, `+`, `-` or `@` could run as a formula when
  pasted into a spreadsheet.
- The download's file name used tomorrow's date after 8 p.m. Eastern.

## 1.0.0

First release: CoStar comp PDFs parsed in the browser into the comp workbook,
with the same rules as the original Python loader.

# Bringing the UW Filler package into the Underwrite tab

> **Superseded in part (2026-11-09):** the owner asked for the filler to be used as it is, with its UI unchanged. See `docs/proposals/uw-embed-as-is.md`. UW-0, UW-1 and UW-2 stay; UW-3 to UW-11 as rebuilds are replaced by that plan.

Designer proposal, 2026-11-07, on main at 4.7.109 (`701c4fa`). Docs only:
nothing is built. The owner approves before any PR starts.

## Summary

**The ask (owner, 2026-11-07).** Take the owner's Codex-built "UW Filler"
package and bring what it does into Zlatura's existing Underwrite tab, one
reviewed change at a time, with a better screen, and use the owner's own
documents to keep improving how documents are read and how their figures
reach the model. The package's own handoff note says the same: don't paste
it over the repo, keep Zlatura's engine in charge, port tested formulas only
where Zlatura has none, and put its four steps inside Zlatura's screens.

**My recommendation, in plain words.**
1. **Port the ideas and the four-step flow. Copy almost no code.** The
   package is a good map of what a broker wants. But its money is in
   floating-point dollars, it turns a blank into 0, and it mixes monthly and
   annual figures in one row. Each of those breaks a standing rule (Part
   21.2). Zlatura already has the stronger engine, readers and template
   filler for most of the four steps.
2. **Use the package as a second opinion in tests (a "test oracle").** On the
   owner's machine only, we run its calculations and readers next to
   Zlatura's on invented lookalike files and on the owner's private
   documents, compare them field by field, and look into every disagreement.
   When the two disagree, a figure worked out by hand decides. Neither
   program is treated as the truth.
3. **The four steps become a stepper on the Underwrite tab** over data that
   deals already hold: (1) Files, (2) What was found, (3) Property details,
   (4) Fill the template. This is the approved P2 ("Start from documents")
   and P12 (the stepper), built in the package's order.
4. **Order:** measure first (UW-0), then intake and evidence, then the
   monthly cash-flow view, then the template, and only then the advanced
   models and development. Integrations come last, and only once the owner
   has decided on them.
5. **No new library.** Zlatura already ships pdf.js, ExcelJS, fflate and
   Tesseract. The package's SheetJS, JSZip and older pdf.js are not needed.

**What I verified and what I didn't.** I read the package's folder on this
machine for structure and code patterns only: file counts, sizes, library
versions, and whether certain risky patterns are present. Nothing from it is
quoted here. I did **not** run the package, open its screens or run its
tests, and I did not open the owner's reference workbook. Facts that rest
only on the explorers' notes are marked *(explorer, not re-checked)*.

## 1. What the package is (verified by structure)

- **Shape:** a standalone browser tool, plus two small server route files.
  141 files in all; 81 files in the tool folder, 78 of them JavaScript. It
  is 6.8 MB, and its `index.html` alone is 3.6 MB.
- **Code style:** classic `<script>` tags (48 of them, none of them a
  module), no build step, and functions shared through globals. So none of
  it can be imported by Zlatura's ES modules without being rewritten.
- **Licence:** the package has no `LICENSE` file and no `package.json`. It
  is the owner's own work, so the owner may choose to license it to the
  project. Until the owner says so, it counts as unlicensed and no code is
  copied (decision 2).
- **Money:** its shared number helper turns anything that isn't a finite
  number into 0. Because `Number('')` is 0, a blank becomes 0. Amounts are
  rounded to two decimals as floating-point dollars, not whole cents.
- **Security patterns:**
  - an AI key is kept in browser `localStorage`, and the AI provider is
    called straight from the browser using that provider's
    "direct browser access" header;
  - Tesseract is loaded from a public CDN, in two places: one pins version
    5.1.1, the other floats on `@5`. None of the 48 script tags has an
    integrity check;
  - Google Fonts are loaded from Google;
  - `innerHTML` is used in 32 files;
  - the public-data route has no caller check and makes three outbound
    fetches, so it could act as an open proxy;
  - the integrations route forwards requests with a server token but has
    no caller check *(rate limit: explorer, not re-checked)*.
- **Bundled libraries:**
  - pdf.js 3.11.174, which is older than the fix for CVE-2024-4367. The
    package's own loaders turn eval off, which is the documented
    mitigation;
  - SheetJS 0.18.5, the last npm build. It is affected by CVE-2023-30533
    and CVE-2024-22363, and no licence text is bundled;
  - JSZip 3.10.1.
- **Tests:** about 30 Node scripts. 11 files depend on a proprietary
  spreadsheet runtime that is not included. Per the explorers, they use
  hard-coded paths, and the large-roll recalculation ran out of memory.
- **Cosmetic extras:** an animated bird character (six files) and sound
  (one file).
- **Confidential material:** three reference files (spreadsheet, PDF or
  CSV) are inside the package. They stay in `private/` and are never read
  into tests or docs.

## 2. Prior art and libraries (capped: 2 web searches, no npm or GitHub lookups)

The only candidate judged is the package itself, module by module, plus the
libraries it bundles. The owner asked for this package, so no wider search
was made (working rules, "the designer judges a shortlist").

| Candidate | What it does | Licence | Size | Maintenance | Build-free, offline | Network, telemetry | Security notes | Verdict |
|---|---|---|---|---|---|---|---|---|
| Package: the four-step flow and its screens | Files → found → details → fill | none stated (owner's own) | not measured | one-off Codex build, 2026 | classic scripts, globals | AI provider, CDN, Google Fonts | key in `localStorage`; `innerHTML` in 32 files | **Port the idea**: rebuilt on `el()`, tokens and workspaces |
| Package: readers (rent roll, T-12, leases, OCR) | PDF, Excel, CSV, paste, OCR | none stated | the reader module is about 157 KB | as above | yes | OCR from a CDN | uneven escaping | **Test oracle and ideas**: units, locale and date-order detection go into our readers in our own words |
| Package: source-table mapping and evidence | columns, units, page/cell/quote, refresh that keeps edits | none stated | about 40 KB | as above | yes | none seen | — | **Port the idea** (UW-2) |
| Package: monthly cash-flow model | tenants × accounts, CAM, caps, overrides, bridge | none stated | — | as above | yes | none | float money; blank as 0; mixed units | **Test oracle only**: never the engine |
| Package: advanced debt, waterfall, Monte Carlo, asset modules | — | none stated | — | as above | yes | none | float money | **Test oracle and idea list** for UW-9 |
| Package: development engine | budget, phases, debt, waterfall | none stated | — | as above | yes | none | float money | **Test oracle** for M2 (UW-10) |
| Package: template mapping scoped to the template's SHA-256 | one reviewed cell map per template version | none stated | — | as above | yes | none | — | **Port the idea** into T4 (UW-7) |
| Package: integrations and public-data routes | vendor connectors; geocode and parcel lookups | none stated | 2 files | none verified | server only | yes, outbound | no caller check; possible open proxy | **Do not port** (UW-11 is a decision) |
| Package: "live Excel" tabs | spreadsheet-looking views | — | — | — | — | — | snapshots presented as live | **Do not port** |
| Package: bird character and sound | animation, audio | — | 7 files | — | — | — | motion and sound | **Do not port** unless the owner insists (decision 4) |
| SheetJS 0.18.5 | reads and writes spreadsheets | Apache-2.0 (no licence text bundled) | 0.9 MB | npm frozen at 0.18.5; fixes only on the vendor's own CDN | yes | none | **two CVEs** in 0.18.5 | **Reject**: ExcelJS 4.4.0 and fflate are vendored already |
| JSZip 3.10.1 (+ pako) | zip | MIT or GPLv3 (dual) | 98 KB | slow | yes | none | — | **Reject**: fflate 0.8.3 is vendored already |
| pdf.js 3.11.174 | PDF text | Apache-2.0 | 1.4 MB | superseded | yes | none | before the CVE-2024-4367 fix | **Reject**: Zlatura vendors pdf.js 4.7.76 |
| Tesseract.js 5 from a CDN | OCR | Apache-2.0 | — | — | no (CDN) | yes, a CDN fetch | floating version, no integrity check | **Reject**: Zlatura vendors 7.0.0 locally |

**Outcome: no new library, so no library approval is needed.** Copying any
package code at all would be an approval gate, and it needs the owner to
license the package first (decision 2). Engine and money code is never
copied, licence or not.

## 3. Module-by-module mapping

"Exists" means it is on main today; "Planned" means it is an approved item.

| Package capability | Zlatura today | Where it goes | New work |
|---|---|---|---|
| Step 1: drop many files; each routed by its content | `ddintake.js` classifier, `filekind.js` `checkUpload`, `dd.js` registry (P1, merged #118) | **UW-1** (= P2) | multi-file intake on the Underwrite tab; the drop-routing fix in `ui.js` |
| Step 2: choose the controlling rent roll and statement | `deal.dd` docs with `superseded` | **UW-1** | "controlling" = the doc the deal's `rr`/`t12` was read from, and not superseded. Worked out from what is stored, so nothing new is saved |
| Step 2: checklist | `ddtypes.js` presets (22+ types) | **UW-1** | count the package's checklist against ours, structure-only; add missing items in our own words (decision 6) |
| Step 2: up to three past statements | one `deal.t12`; P10 registers budgets and prior statements as received | **UW-8** | storing them is a **data-format gate** |
| Readers: rent roll, T-12, OM, leases, OCR | `rentroll.js`, `rrdoc.js`, `omroll.js`, `t12.js`, `omstatement.js`, `leaseread.js` (L3), `ocr.js` | UW-0 measures them; each fix is its own reader PR | layouts the scoreboard shows failing |
| Source mapping: units, locale, date order | `rentrollui` `headerAndRows`, `textfile.js`, the comp importer's mapper | **UW-2** | an explicit unit for each money column: monthly or annual, total or $/SF, % or decimal. Asked when unclear, never assumed |
| Evidence: page, cell, quote, confidence | `deal.sources[key]` (page, line, cell, `confidence`, and `doc` since P1); lease abstracts keep a quote | **UW-2** | one evidence panel per staged figure. Confidence is shown in status words, never as a number (evolve section 4) |
| Refresh that keeps edits | `compareRolls`; P4 planned | **UW-2/P4** | re-reading a file keeps the broker's "hand" figures and shows what moved |
| Step 3: in-place or pro forma | `noiBasis: 'rentroll'` (live and scenarios, `deal.js:193`) | **UW-4** | a clear two-way switch over the existing basis; no new stored field |
| Step 3: tenants, accounts, financing | rent roll workspace, T-12 card, loan fields, `engine/debt.js` | **UW-4** | one screen that links to them, not a second editor |
| Monthly cash flow (tenants × accounts) | `lease.js` `project()` already returns monthly `months`, `annual` and `leases` | **UW-5** (= A2) | the year → month drill-down view; XLSX through `workbook.js` |
| CAM fixed or matrix, stops, gross-up, caps | `engine/recovery.js` (A1) | **A5** (approved; data-format gate) | the package is a test oracle for A5 |
| Rent schedules with true zero periods; lease-up | `lease.js` free months and abatement; absorption; vacant market rent | exists | oracle cases only |
| Overrides: monthly, then annual, then the model | — | **UW-8** | new; **data-format and financial-meaning gate** |
| Seller-to-pro-forma bridge | NOI three ways (`t12ui.js`); value bridge missing (7.9) | **UW-6** | new view; any new registered figure changes the golden set (gate) |
| Step 4: fill the template | `template.js` (formulas never overwritten, blank skipped, dry run, audit sheet) | **UW-7** = R1 + T1 + T4 | mapping saved per template SHA-256 (`filehash.js`); drift shown before any fill |
| DSCR, LTV, LTC, debt yield | `engine/debt.js` `sizeLoan`, figures | exists | — |
| Floating debt with a floor and cap, PIK, fees, refinance, two-tranche search | `calc.js` `floating` (cap only), `loanFees`, `refinance` | **UW-9a** | floor, PIK and the tranche search move to `engine/debt.js`, in cents |
| LP/GP waterfall with hurdles and catch-up | `calc.js` `waterfall` (hurdles, promotes) | **UW-9b** | catch-up; moved to `engine/` |
| Seeded Monte Carlo | — | **UW-9c** | new; optional tool |
| Asset modules: ground rent, % rent, hotel, tax appeal, utilities, TI/LC draws, concentration, receivables | `pctrent.js`, P8 reassessment, P9 benchmarks, `lease.js` TI/LC, `credit.js` | P8, P9 as planned; the rest are later | hotel is out of scope (decision 8) |
| Development engine | `residualLand`, `yieldOnCost`, `drawSchedule`; M2 planned | **UW-10** = M2 | money and data-format gates, as in `platform-expansion.md` |
| Integrations; public data | comp enrichment C3/C4 proposal | **UW-11** | only after decision 9 |
| Review and handoff; change history | `review.js`, P11 planned; `history.js` | P11 | — |

**Never ported:**
- floating-point money;
- blank as zero;
- one area field standing for gross, rentable and usable SF;
- monthly and annual figures in one row, and the hidden ×12 conversion;
- a vacant unit's market rent assumed to be per SF per year;
- a figure that may be stored either as a percent or as a decimal;
- the AI key in browser storage, and direct calls to the AI provider from
  the browser;
- CDN scripts and Google Fonts;
- server routes with no caller check;
- snapshot tabs presented as live Excel;
- vendor names in the product (clean room);
- the bird and the sound, unless the owner decides otherwise (decision 4).

## 4. Target screens (phone first, Zlatura's look)

The Underwrite tab keeps today's three cards (Quick underwrite, Results,
Quick underwritings) and the Calculators link. No feature is removed. A new
first card, **"Start from documents"**, opens a stepper. It works on one
deal: it makes a new deal or picks an existing one (owner, 2026-10-28: a
deal, not a quick underwriting).

The stepper:
- is a numbered list of four steps, using `aria-current="step"`;
- shows each step's status in words ("2 of 11 required found"), never by
  colour alone;
- lets the broker move Back and Next, and go straight to any step already
  reached.

Everything uses Zlatura's tokens (Classic and New look), `app/icons.js`, 44
px targets, `el()` and `textContent`, and is checked with axe at 390 px. The
Underwriting workspace (`workspaces.js`) lists it first.

1. **Files.** A drop zone and an "Add files" button that takes several files
   at once.
   - Each file becomes a row with: its name, the type the reader found or
     "What is this?" (top three choices), its pages, its as-of date, and
     "already added on …" when the same file was added before.
   - A scanned file offers "Read on this device" (OCR). The AI button
     appears only when AI is on and the deal is not confidential, and it
     says why when it is disabled.
2. **What was found.** Each file's read figures, staged behind "Use".
   - Each figure shows its evidence: the file, the page or cell, a short
     quote, and a status word (read, asked, missing).
   - The broker picks the **controlling** rent roll and statement. The
     newest as-of date is picked first, and the others are shown as
     superseded.
   - The checklist (missing, found, optional, n/a with a reason).
   - The P3 reconcile checks: rent roll vs T-12 vs OM, SF basis, unit mix.
     Each check taps through to both sources. Failed checks are
     acknowledged before Next.
   - A column whose unit is unclear asks: "Is this monthly or annual?",
     "Total or per SF?".
3. **Property details.**
   - A two-way switch: **In place** (from the statement) or **Pro forma**
     (from the rent roll, which is today's `noiBasis`).
   - Short summaries of tenants (WALT, rollover), accounts (the T-12 lines)
     and financing (loan terms, DSCR, debt yield). Each one taps through to
     the existing editor.
   - Later: the bridge (UW-6) and the monthly cash flow, by year and then
     by month (UW-5).
   - Blank inputs show "not entered" and "can't tell", never $0.
4. **Fill the template.**
   - Pick the firm's template from the Library. Saved mappings are found by
     the template's SHA-256, and a new version shows its moved cells first
     (T4).
   - A dry-run list shows each cell with its figure, its source and how
     many formulas read it.
   - The broker acknowledges the open-checks count, then taps "Build and
     download". The file includes the audit sheet.
   - Later (T3): add the file back after Excel has saved it, and see the
     template's figures next to Zlatura's.

## 5. Delivery plan (one PR each)

Every PR runs these, with no exceptions, so they are not repeated in each
row:
- invented fixtures only;
- new tests that fail on `git archive origin/main`;
- mutation checks;
- `check:full`, including axe, 390 px and desktop sizes, 150 ms per edit,
  and character-by-character typing for every new input;
- both golden checks, which must show 0 changed unless a row says otherwise;
- `sw.js` lists every new app file;
- the `dom-sinks` allowlist stays unchanged (no new `innerHTML`);
- the support-code check for rent roll, T-12, NOI or WALT work, reported in
  counts.

Effort is in agent-hours, my estimate.

| PR | Scope and files | Engine and data format | Tests that must fail on old code; flows | Not included | Effort |
|---|---|---|---|---|---|
| **UW-0** Measure (section 9) | `tests/tools/doc-local.mjs`, `tests/tools/uw-oracle.mjs`, `tests/doc-local.test.js` | none; no `app/` change | the scoreboard shape, and the oracle's comparison, on invented inputs | any reader fix | 4-6 |
| **UW-1** Start from documents, steps 1-2 (= P2/R6, approved) | `app/intake.js`, `underwrite.js` card, `ui.js` drop fix, `ddui.js` reuse | none beyond `deal.dd` (exists); controlling doc worked out from it; golden 0 | multiple files at once; same file twice; ambiguous asks; nothing enters the model before "Use"; a confidential deal makes no AI call; flow `uw-intake-flow` | the evidence panel, mapping units | 10-14 |
| **UW-2** Evidence and units | `app/evidence.js`; `rentrollui.js`, `t12.js` header mapping | units asked rather than guessed: **financial meaning, designer note**. A quote shown at review is not stored; storing it in `sources` is a **gate** (decision 5) | an annual rent column offered as monthly asks; a $/SF column is never taken as a total; a `%` vs decimal column asks; re-reading keeps hand edits; flow `uw-evidence-flow` | remembered layouts per source system (a settings record: gate, later) | 8-12 |
| **UW-3** Reconcile (= P3, approved) inside step 2 | `app/reconcileui.js` over `reconcile.js` | reader only; golden 0 | each check links to both documents; acknowledgement is required before Next; flow `uw-reconcile-flow` | new checks | 6-8 |
| **UW-4** Property details, step 3 | `underwrite.js` step view; links to existing editors | uses `noiBasis`; no new field | the switch changes the basis the existing figures use; a blank shows "can't tell"; perf with a 200-lease roll | new editors | 6-8 |
| **UW-5** Monthly cash flow (= A2, approved) | `app/cashflowui.js` over `project()` | read-only; golden 0 | year totals equal the sum of their months to the cent (each row rounded once); a free-rent month is 0 and labelled, while a missing figure is blank; flow `cashflow-flow` | expense lines (A5) | 8-10 |
| **UW-6** Seller-to-pro-forma bridge | `engine/figures.js` additions, step 3 view | **new displayed figures add golden entries: gate**, with a before/after table (existing 646 unchanged, new rows listed) | each bridge step sums to the end NOI; the same dollar is never in two steps | value bridge across cap rates | 6-8 |
| **UW-7** Fill the template, step 4 (= R1 merge, then T1, then T4) | `template.js`, `libraryui.js` | T1 changes behaviour (decision 4 of evolve); a mapping keyed by template hash is a **data-format gate** | G1-G6 and G10 failing cases (evolve section 2); flow `uw-template-flow`; LibreOffice recalculation | T2 structure analysis, T3 read-back (later PRs) | 12-16 (3 PRs) |
| **UW-8** Overrides and past statements | `deal.t12History`, an override layer | **data-format and financial-meaning gate**; `migrate.js` step, old-backup fixture, `quantizeDeal` in cents | an old backup restores unchanged; an override wins monthly, then annual, then the model, and is shown; a cleared override returns to the model | — | 12-16 |
| **UW-9a/b/c** Debt extras, waterfall catch-up, seeded Monte Carlo | `engine/debt.js`, `engine/waterfall.js`, `engine/montecarlo.js`; `calc.js` wrappers; MORE_TOOLS | **money notes**; moving `waterfall` must keep golden 0 | hand-worked invented cases; engine-shared test; same seed gives the same result | portfolio roll-up | 8-12 each |
| **UW-10** Development (= M2) | as `platform-expansion.md` | **money and data-format gates** | as M2 | M3 draws | as M2 (L) |
| **UW-11** Integrations, public data | none until decided | **security, cost and hosting gates** | — | everything until decision 9 | — |

**Order:** UW-0 → UW-1 → UW-2 → UW-3 → UW-5 → UW-4 → UW-7 → UW-6 → UW-8
→ UW-9 → UW-10. UW-5 runs in the model lane (A2) next to the documents lane,
as evolve's decision 9 allows. Reader fixes found by UW-0 are small PRs that
can come between these, each with its own lookalike fixture.

**Running cost:** no paid service and no library. About 25-35 KB of our own
code over UW-1 to UW-5.

## 6. The package as a test oracle, without copying private data

- **Where it runs:** on the owner's machine only. `uw-oracle.mjs` loads the
  package's calculation scripts from a path set by an environment variable,
  in Node's `vm` with no network access. If the package isn't there, the
  tool says "not run", never "passed", and CI never runs it. Nothing from
  the package is committed.
- **Invented lookalikes:** for each case (a three-tenant retail roll with a
  free-rent month, a gross-up to 95%, a floating loan hitting its cap), I
  write an invented input and its expected answer worked by hand, in cents.
  Both engines run it. Each field is compared: equal, differs by under a
  cent (the package's float rounding, noted), or differs.
- **A difference is looked into, never adopted automatically.** The
  hand-worked value decides. Where the package is right, we fix Zlatura's
  engine, which is a money note and maybe a golden gate. Where it is wrong
  (blank as 0, a ×12 slip), we write it down as a case Zlatura must keep
  getting right.
- **Readers on the owner's documents:** `doc-local.mjs` runs Zlatura's
  readers, and optionally the package's, on the files in `private/`. It
  prints only the document-learning scoreboard: for each layout family,
  fields **right, wrong, asked, missed**, with counts only and no names or
  figures. "Right" needs an answer file the owner checked, kept in
  `private/`; without one, the tool reports only agreement between the two
  readers, labelled as such.
- **The target, from `document-learning.md`:** 0 wrong, then fewer asked.
  Every failure becomes an invented lookalike fixture plus a reader fix.

## 7. Security and confidentiality

- **`private/` is the default home** for the package, the reference
  workbook and every owner document (`.gitignore` already covers it). The
  repo-hygiene guard (S1) blocks a stray commit.
- **No keys in browser storage.** AI stays behind `ai.js` `blocked` and the
  firm's server route. The package's browser-held key is not ported.
- **No outside calls without opt-in.**
  - OCR uses the vendored Tesseract, and fonts are vendored. No CDN.
  - Any public-data or vendor lookup (UW-11) would be a server route with a
    caller check, a rate limit, a fixed list of allowed hosts and no
    pass-through of URLs. It is off until the owner turns it on.
- **CSP:** no change is needed; nothing new loads from elsewhere. A tighter
  `connect-src` stays the owner's open decision (S2).
- **DOM sinks:** new screens use `el()` and `textContent` only, so the
  `dom-sinks` allowlist is unchanged. File names and quotes from documents
  are always text, never markup.
- **The truth in docs:** the package's own docs overstate some claims. None
  is carried over. Statuses use the seven words only.

## 8. Risks and open questions

**Risks.**
- **Scope creep:** the package is wide. Each UW item ships a smaller honest
  version and lists its gap in the acceptance matrix.
- **False agreement:** two programs can agree and both be wrong. The
  hand-worked values and the owner-checked answer files guard against this.
- **The 150 ms budget for the monthly view on large rolls:** UW-5 draws year
  totals first, builds months only on demand, and is measured with 200
  leases.
- **Unverified explorer facts:** the 182 checklist entries and the
  out-of-memory run. UW-0 recounts the checklist by structure.

**Open questions (each with my recommended default).**
1. **Approve this plan and its order** (UW-0 first, then UW-1). *Recommend
   yes.*
2. **The package's licence:** keep it as ideas plus test oracle only (no
   code copied), or license it to the project so that small non-money
   pieces could be adapted later, each still at its own gate. *Recommend
   ideas plus oracle only.*
3. **SheetJS:** not wanted. ExcelJS and fflate cover reading and writing,
   and SheetJS 0.18.5 has two known CVEs. *Recommend no.*
4. **The animated bird and sound:** drop them from this work. If the owner
   wants a mascot, for example with the Monal rename, it becomes a separate
   optional UI item that is off by default, respects reduced motion, has
   sound off, and has its name only in `brand.js`. *Recommend drop for now.*
5. **Storing evidence quotes** in `deal.sources` (a data-format change), or
   showing them only while reviewing. *Recommend showing only, for now.*
6. **Checklist items** the package has and ours lacks: add them in our own
   words after the structure-only count. *Recommend yes.*
7. **Past statements (up to three) and overrides (UW-8):** approve in
   principle now; the exact shape is approved at its note. *Recommend yes.*
8. **Hotel and other asset modules:** out of scope until a deal needs them.
   *Recommend out of scope.*
9. **Vendor integrations and public data** (including Muse, which has no
   known official API): not built now. Any connector needs the owner's
   vendor account, a legal check on the terms, and no vendor name in the
   product. *Recommend deferring until after UW-8.*
10. **Running the package locally as an oracle** (code the owner wrote,
    from `private/`, never committed). *Recommend yes.*
11. **Confirm `private/` as the default home** for documents (already open
    in `owner-requests.md`). *Recommend yes.*

**Needs the owner's explicit approval before building:**
- this plan (question 1);
- UW-2's unit rule (financial meaning);
- UW-6's new golden entries;
- UW-7's behaviour change and its mapping record;
- UW-8 (data format and meaning);
- each UW-9 money note;
- UW-10 (money and format);
- UW-11 (security, cost, hosting);
- any copied package code (question 2).

## 9. First PR: UW-0, "Measure before we change"

**Scope.** Two local tools and their tests. No `app/` change and no data
change.

**The tools:**
- `tests/tools/doc-local.mjs`
  - Walks a folder in `private/`. Each file goes through `checkUpload`, the
    `ddintake.js` classifier and the matching existing reader.
  - Prints the scoreboard by layout family: files, accepted, asked, refused,
    and, where an owner-checked answer file exists, fields right, wrong,
    asked and missed.
  - Prints structure only, as `t12-local.mjs` and `rr-local.mjs` do today,
    and it replaces neither of them.
- `tests/tools/uw-oracle.mjs`
  - Runs a list of invented cases through Zlatura's engine and, if the
    path variable is set, through the package's calculation scripts in
    `vm`.
  - Prints the field-by-field comparison table.

**The tests (`tests/doc-local.test.js`):**
- the scoreboard's shape and its totals, on two invented files;
- a name or a figure never appears in the output (a canary string in a
  fixture must not be printed);
- with no package path set, the oracle prints "not run", and the exit code
  is not 0 when asked to require it.

They fail on old code because the tools don't exist yet. A mutation (print
a field's value) must fail the canary test.

**Then, locally,** I run it once on the owner's documents and report the
counts to the owner. The reader fixes that follow are chosen from that
table.

**Effort:** 4-6 agent-hours, one PR. Gates: none beyond this proposal's
approval.

Sources: [CVE-2023-30533 advisory](https://advisories.gitlab.com/pkg/npm/xlsx/CVE-2023-30533/),
[CVE-2024-22363](https://cvefeed.io/vuln/detail/CVE-2024-22363),
[GHSA-wgrm-67xf-hhpq (pdf.js CVE-2024-4367)](https://github.com/advisories/GHSA-wgrm-67xf-hhpq).

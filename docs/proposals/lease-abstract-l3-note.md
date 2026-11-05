# Design note: lease abstract L3, reading lease PDFs into the abstract

Designer note, 2026-11-04. Nothing is built. This is step L3 of the approved
proposal `docs/proposals/lease-abstract.md` (sections 3, 5, 6 and 7). L1 is
merged: `app/abstractfields.js`, `app/abstracts.js`, `app/abstractui.js`,
`app/abstractexport.js`, `deal.abstracts` (schema 8), and the Documents card's
"Abstract" button.

**In one line:** the broker taps "Read the lease" on an abstract. The app reads
the PDF on the phone (its text, or OCR for a scan) with fixed rules, no AI. It
then shows what it found, each value with its page and a short quote, or
"Not found in pages 1–32". The broker keeps what is right and ticks each value
beside its page, as in L1. Nothing reaches a deal figure (L2's "Use" still
needs a tick).

**Out of L3:** clause notes and the expense, option, use and guaranty fields
(L4), versions and diff (L4), three-way reconciliation (L5), AI (L6), and
"Use" taps (L2).

## 1. What the owner's files show for the reader (structure only)

This session read the files only with `pdfinfo`, `pdfimages` and a text
character count; the OCR counts are the proposal's (section 1, 2026-10-30). No
text was printed or kept.
- **Three scans** (no text layer, one image a page): two at 200 dpi 8-bit
  colour, one at 300 dpi 1-bit; page sizes near Letter but not exact (scanner
  crop). OCR is the main road. **One text PDF** is the existing abstract
  printed: a summary, not a lease.
- **Three heading styles:** "n. HEADING." run in at a paragraph start; "n)"
  numbers with no heading words (and a page number on each page); "WHEREAS"
  recitals, then numbered changes (the amendment).
- **Page furniture:** an initials footer on most pages, page numbers,
  By/Name/Title lines on the signature page.
- **Dates:** relative or in words in the leases; numeric and "Month d, yyyy"
  in the amendment. **Rent:** a basic-terms page and a rent section; the live
  step table (about 8 lines) is in the amendment.

## 2. Reuse (no new library)

| Need | Reused from | Change in L3 |
|---|---|---|
| Size and kind check | `filekind.js` `checkUpload`, `LIMITS.pdf` | none; S3's page cap and abort, once merged (decision 7) |
| Text pages | `pdftext.js` `pdfPages` (layout.js fixed-width lines) | none |
| Scanned pages | `ocr.js` `recognizeCanvas`, `readScannedPage` | add `openScanReader` (below); `readScannedPage` unchanged |
| Bad files | `kit.js` `pdfProblem` (password, damaged, empty) | none |
| Fingerprint | `filehash.js` `sha256Hex`, `Doc.sha256` | none |
| Document type | `ddtypes.js` `classify` (lease, amendment, estoppel scores) | none; the summary test is in `leaseread.js` |
| Quote check | `reconcile.js` `verifyQuote`, `squash`, `numbersIn` | none |
| Dates | `dateinput.js` `parseDateText` (full dates only, see 5.4) | none |
| Money | `engine/money.js` `toCents`, `toRate` | none |
| Arithmetic checks | `abstracts.js` `checkAbstract` (monthly vs annual, annual vs $/SF) | none: the reader runs L1's checks on a scratch copy |
| Writing values | `abstracts.js` `setValue`, `setNotFound`, `setAmbiguous`, `setEvidence`, `addTerm`, `addStep`, `addFlag` | widen the normaliser (section 4) |
| Watchdog | `pdfpages.js` `WATCHDOG_MS`, the terminate pattern in `pdfpagesui.js` | none |
| Page ranges | `pdfpages.js` `parseRanges` | none |
| Worker pattern | `projector.js` module worker | new `leaseread-worker.js` |

**Prior art** (2 searches on 2026-11-04, on top of the proposal's 7; ideas
only):

| Candidate | What it does | License | Size | Last release | Build-free, offline | Network | Security | Verdict |
|---|---|---|---|---|---|---|---|---|
| contractiq-extract-mcp (npm) | an MCP server for contract clauses | MIT (listed) | not checked | not checked | no (a server) | likely model calls | sends text out | **Rejected:** not a library, model-based |
| extract-cli (drbaher) | parties, dates, defined terms from contracts | MIT | single file | not checked | Python | none | none | **Ideas only:** a dictionary of defined terms first, which matches step 3 |
| Redline (chountalas) | LLM extraction, then arithmetic checks on rent | MIT | not checked | alpha | Swift | model calls | sends text out | **Ideas only:** confirms "arithmetic check, never fix" |
| LexNLP | amounts, dates, durations | AGPLv3 | large | 2022 | Python | none | none | **Rejected:** AGPL (as in the proposal) |
| chrono-node | natural-language dates | MIT | about 38 KB gzipped | active | yes | none | none | **Build ourselves:** a relative date must stay unresolved, and chrono resolves it |

The rules, regexes and arithmetic are our own. No outside code touches money
or dates.

## 3. Modules and exports

**`app/leaseread.js` (new, pure: no DOM, no pdf.js, no clock).** Every reader
takes the page model and returns candidates. No reader writes into an
abstract.

```
Page = { n, text, source: 'pdftext'|'ocr', conf: 0-100|null, poor: bool,
         lines: [{ s, e, furniture: bool }] }        // s/e: offsets of the line in text
Cand = { key, value, unit?, basis?, rel?, page, start, len, quote,   // start/len: the quote's span in page.text
         confidence: 'high'|'medium'|'low', status: 'found'|'ambiguous'|'not-found',
         note, from: 'basic'|'body'|'preamble'|'amendment' }
Result = { docType, sections, terms, cands: Cand[], steps: StepCand[], pages: PageInfo[], warnings: string[] }
```

**Exports (each pure, each tested on its own):**
1. **`pageModel(texts, { ocr })`** gives `Page[]`. `texts[i]` comes from
   `pdfPages`, and `ocr[n] = { text, conf }` replaces page n. A page is OCR'd
   when it has under 200 non-space characters (`rrdoc.docKind`'s threshold).
   It is `poor` when its mean confidence is under 75. Furniture is a line that
   repeats on at least half the pages within the top or bottom 3 lines once
   digits are squashed (page numbers, initials footers), or a lone number.
   Furniture stays in `text`, so the offsets hold, but no reader matches
   inside it.
2. **`findHeadings(pages)`** gives `[{ num, title|null, style, page, start }]`
   for `dot` `^\s*(\d{1,3})\.\s+([A-Z][A-Z0-9 &,'/()-]{2,60})\.`, `paren`
   `^\s*(\d{1,3})\)\s`, `article` `^\s*(ARTICLE|Section)\s+(\d+|[IVXLC]+)(\.\d+)*`
   and `recital` `^\s*WHEREAS\b` (ending at `NOW,? THEREFORE`). A number
   counts only when it continues the sequence (n+1, or 1 after the recitals),
   so a "2." inside a list is dropped. No headings: one section.
3. **`findDefinedTerms(pages)`** gives `Map(name → { page, start, len })` from
   `\((?:the\s+)?["“]([A-Z][\w'’ -]{1,60})["”]\)`, from
   `(?:hereinafter|herein)\s+(?:referred to as|called)\s+(?:the\s+)?["“]([^"”]{2,60})["”]`,
   and from basic-terms lines `^([A-Z][A-Za-z' ]{2,40})\s*[:.]\s+(.+)$`.
   Names as written; matching is case-insensitive on squashed text.
4. **`findBasicTerms(pages, terms)`** gives `{ page, lines: [{ label, value,
   start }] } | null`: the best of the first 5 pages with at least 4 label
   lines and 2+ dollar amounts or 3+ defined terms. Two pages within 1 point
   are both read; disagreements surface as ambiguous.
5. **`docType(pages, name)`** gives `{ type: 'lease'|'amendment'|'summary'|'other',
   ask }` by `ddtypes.classify` on the first 3 pages. "summary" is a title like
   "lease abstract", "lease summary" or "abstract of lease" in the first 400
   characters, with no "by and between", "WITNESSETH" or By/Name lines.
6. **`readParties`**: `landlord`, `tenant`, `tradeName`, `guarantor` from the
   preamble "between X (“Landlord”) and Y (“Tenant”)" on pages 1–2, the
   basic-terms labels, `d/b/a` and `(“Guarantor”)`; entity text as written,
   cut to 200.
7. **`readPremises`**: `suite`, `floor`, `sf` with basis, `proRata`
   (`proRataCovers` and `measurement` stay unread for L4; L1's R9 warns).
8. **`readTerm`**: `leaseDate`, `possession`, `commencement`,
   `rentCommencement`, `expiration`, `termMonths`, `termText`.
9. **`readDeposit`**: `deposit`, `depositForm` (cash or letter of credit, by
   the words). 10. **`readRentSteps`**: `{ terms, steps }` (5.5).
   11. **`readDate`**, **`readAmount`**: the token readers (5.3, 5.4).
12. **`makeQuote(page, start, len)`** gives `{ quote, start, len }`: the match
   widened to its sentence or table line (never across a page), space runs
   collapsed, cut to 240 on a character boundary (`dd.cutText`), then
   `verifyQuote([page.text], 1, quote, value, kind)`. Anything but `verified`
   makes the candidate not-found ("the quote did not check out").
13. **`readLease(pages, { name })`** gives the `Result`; the worker's only
   entry point. 14. **`stageInto(ab, result, { doc, effective, now })`** gives
   the staged rows with what keeping each would do; writes nothing.
   15. **`keepStaged(ab, rows, { now })`** applies kept rows through the L1
   setters (section 6) and returns a count.

**`app/leaseread-worker.js`** (new, a module worker like `projector-worker.js`;
imports only `leaseread.js`): in `{ id, pages, name }`, out `{ id, ok: true,
result }` or `{ id, ok: false, message }`.

**`app/ocr.js`, one addition:** `openScanReader(pdfjs, bytes)` gives `{
read(pageNo, { onProgress }), close() }`, holding one pdf.js document and one
Tesseract worker for a whole run (no engine load per page), with
`readScannedPage`'s `SCALE` and parameters (`psm 6`, spaces kept) and its
`{ text, geom, words, conf }`. `readScannedPage` and its callers don't change.

**`app/leasereadui.js`** (new; the builder writes it): file, progress, cancel,
the OCR offer, the staged panel, "Show page". `abstractui.js` gains one "Read
the lease" button per document of the abstract.

## 4. Data: the smallest change to the L1 schema (owner gate)

L1's normaliser forces what a reader needs to null: `normSrc`
(`abstracts.js:72-76`: `start`, `len`, `ocrConf` null, `reader: 'typed'`),
`normCommon` (`abstracts.js:78-83`: `by: 'broker'`, `confidence` and
`supersededBy` null), `READERS = ['typed']` (`abstractfields.js:15`). Without a
change, a read value would be saved as typed by the broker. **No new field is
added;** existing fields may hold values:

| Field | L1 | L3 accepts |
|---|---|---|
| `Src.reader` | `'typed'` | `'typed'`, `'pdftext@1'`, `'ocr@1'` (`READERS`) |
| `Src.start`, `Src.len` | null | a safe integer ≥ 0; `len` from 1 to 240. Null when `reader` is `'typed'` |
| `Src.ocrConf` | null | an integer from 0 to 100, only with `'ocr@1'` |
| `by` (every item) | `'broker'` | `'broker'` or `'reader'` |
| `confidence` | null | `'high'`, `'medium'` or `'low'`, only with `by: 'reader'` |
| `supersededBy` | null | a `Doc.id` (≤ 40 characters), on terms and steps only |

**Normaliser rules (each with a hostile-backup test):** `by: 'reader'` stands
only with a `Src` whose reader is not `'typed'` and whose quote has at least 3
characters, else it becomes `'broker'` with null confidence (a backup can't
fake provenance). A broker edit of a reader value (`setValue`, `setStep`)
makes it `by: 'broker'`, `confidence: null`, keeping `src`. Offsets are hints:
"Show page" finds the quote again in the re-read text (`squash`).

**A schema step: `abstracts-read`, schema 9, a marker only,** written like
`abstracts-init` (`migrate.js:171-187`). It changes no value; it makes 4.7.96
(schema 8) refuse an L3 backup instead of turning reader values into "typed
by the broker" (data loss and a false claim). Old-backup fixture
`tests/fixtures/backup-4.7.96-before-read.json` (invented, from a
`make-backup-4.7.96.mjs` tool): a typed L1 abstract restores unchanged and
round-trips; schema 10 is refused.

**`dd.js:22-23`** gains reader `'lease'` and target `'abstracts'`, so a read
lease shows as read in the checklist (proposal section 5). This is the same
gate.

**Never stored:** file bytes, page text, OCR words or the staged rows. They
live in a session `Map` keyed by `Doc.sha256` and are dropped when the deal
closes or the tab reloads. Storage grows by at most about 12 bytes for each
source, under L1's 45 KB worst case.

## 5. Reading rules (money and meaning)

### 5.1 Before reading
- **Which file:** a document of the abstract (`ab.docs`). If the session map
  holds its pages (just added on the Documents card, where `ddintake.intake`
  already read the text), they are used. Otherwise the broker re-picks it:
  `checkUpload`, then `sha256Hex` must equal `Doc.sha256`, or "This is not the
  same file as ‘name’ (its fingerprint differs)", with "Add it as a new
  document". It is never read into the wrong document.
- **Refusals in plain words** through `pdfProblem` (password, damaged, empty);
  over `LIMITS.pdf` (50 MB) or S3's page cap, refused before parsing.
- **A "summary"** says "This looks like a lease summary, not the lease. Its
  values are someone's reading, so add the lease itself" and writes nothing
  (summaries are for L5). **"other" or a close call** asks "Read it as a lease,
  or as an amendment?"
- **Scanned pages:** "Pages 1–32 are scans; reading them takes about N minutes
  (estimate)". All, or pages picked with `parseRanges`; the default is all
  scanned pages up to 60, more need a range.

### 5.2 Confidence and status (the proposal's section 2 words)
- **high:** an exact pattern on a text page, or OCR page mean above 90.
  **medium:** OCR 75 to 90, or one loose part (a label found by a defined term,
  not the label table). **low:** a poor page (under 75); never above low.
- **Agreeing candidates:** found, with up to 3 sources. **Disagreeing:**
  ambiguous, every source kept, a note naming each ("The basic terms page says
  X, p.1; section 4 says Y, p.7"); the first is never picked. **None:**
  not-found, "Not found in pages a–b (n read, c poor)".
- **Nothing is repaired in money or dates.** OCR confusions (O/0, l/1, S/$/5)
  are tolerated only in heading and label words; an amount token with a letter
  in it is not a number, and the row goes ambiguous with its quote.

### 5.3 Amounts and units
- **`readAmount`:** `\$\s?\d{1,3}(,\d{3})*(\.\d{2})?` or `\d{1,3}(,\d{3})*\.\d{2}`,
  through `toCents`. A bare integer with no `$` and no cents is not money (it
  could be SF or a year).
- **A unit comes only from words, never from arithmetic:** `month` from "per
  month", "monthly", "/mo"; `year` from "per annum", "annual(ly)", "per year",
  "/yr"; `psf_year` / `psf_month` from "per (rentable) square foot", "PSF" or
  "/SF" plus a year or month word. The words are looked for in the column
  heading (up to 3 lines above, by column span in the fixed-width text) or the
  same clause. A $/SF with no period word, or an amount with no unit at all,
  makes the step ambiguous with no amount stored (L1 keys amounts by unit);
  the note carries the figure as written and the UI offers the units.
- **Blank is never zero:** "no security deposit" or "None" is found, value 0,
  with its quote (L1's `setNone`); no deposit wording is not-found, null. A
  $0.00, "abated" or "free" rent row is never a 0 step: it becomes a flag
  ("Rent abated in months 1–3, p.N: record it as free rent") for L4's
  rent-relief note, so nothing is counted twice.

### 5.4 Dates
- **Absolute:** numeric `m/d/yyyy` (US order; a first number over 12 is
  ambiguous), `Month d, yyyy`, and `the dth day of Month, yyyy` with ordinal
  words first to thirty-first, through `parseDateText`. A two-digit year is at
  most medium.
- **"March 2027" with no day is never a date** (`parseDateText` would make it
  the 1st, so it is not passed): ambiguous, "no day given". Dates in words are
  not read: ambiguous with the quote.
- **Relative dates stay relative:** "N days/months after/following/before
  <event>", "the first day of the (first full) (calendar) month after
  <event>", "the earlier/later of (a) … (b) …", "the date Landlord delivers".
  Found, value null, `rel` = the phrase as written (≤ 200). L1's check then
  fails ("depends on: …"), so the field can't be ticked until the broker types
  the date (proposal decision 6). A `date`-kind field (`leaseDate`) that is
  only relative is ambiguous.
- **Term:** "five (5) years" or "sixty (60) months": the words and the figure
  must agree, else ambiguous with both. Years become `termMonths` (× 12) only
  from a stated whole number; `termText` keeps the words. Expiration is never
  computed from commencement plus the term.

### 5.5 Rent steps (`readRentSteps`)
1. **Where:** a section whose heading or first line holds "base rent",
   "minimum rent", "monthly rent", "rent schedule" or "annual rent"; the
   basic-terms page; an amendment's numbered change.
2. **A row** is a non-furniture line with a period ("Year n", "Lease Year n",
   "Years n–m", "Months n–m", "n through m", or a date range) and at least one
   amount. A table continues on the next page only when that page repeats the
   heading line; otherwise it ends (an honest limit).
3. **The step:** `{ label, amounts by unit, primary (the one unit, when only
   one), mFrom/mTo for "Months n–m", from/to for a date range, basis from the
   heading }`. "Year n" keeps its label with null months and dates
   (decision 3).
4. **Arithmetic by L1's checks, not a copy:** the candidate steps (and the
   candidate `sf`) go on a scratch copy of the abstract and `checkAbstract`
   runs. A step it fails ("monthly and annual disagree", "annual and $/SF
   disagree") becomes ambiguous, keeps both amounts, `primary` null, with a
   note naming both ("$4,250.00 a month × 12 = $51,000.00, but the lease says
   $51,600.00 a year, p.3", invented). It is never fixed: the UI offers "Use
   the monthly figure" or "Use the annual figure", which clears the other
   amount through `setStep`, with Undo.
5. **A $/SF on usable or gross area** keeps that basis; L1's `stepMonthly`
   already refuses a total from it. **Narrative escalation** ("3% per annum")
   fills only the `escalation` text; steps come only from a broker tap (L2,
   `generateSteps`).

### 5.6 Square feet and basis
Basis comes from the adjacent words only: "rentable", "RSF", "net rentable"
give rentable; "usable", "USF" give usable; "gross building" gives gross;
"gross leasable (area)" or "GLA" is ambiguous ("rentable or gross?",
decision 4); none gives basis null (found, note "basis not stated"), and L1
then refuses $/SF totals. When both rentable and usable are stated, `sf` is
the rentable figure and the usable one becomes a flag with its page; they are
never mixed or averaged.

### 5.7 Amendments (L3's share of the layering)
- **Effective date:** "effective as of <date>", a defined "Effective Date", or
  "dated as of". With none readable, nothing layers: every value from the
  amendment is ambiguous ("type the amendment's effective date to apply it").
- **A new rent table** is a new term with `doc`, `effective`, `supersedes:
  true`, kind `extension` when the change says "extend", "extension" or
  "Extended Term", else kind null and ambiguous ("for the original term or an
  extension?"). Earlier steps overlapping its dates get `supersededBy:
  Doc.id`, are kept, and show struck through: "Superseded by ‘name’ (p.1)".
- **A field found in a newer document** (by effective date, never file order)
  replaces an older reader value; its tick is cleared and its note keeps the
  old value and page ("The original lease said X, p.7"). Field history is L4's
  versions. A broker-typed or checked value is never overwritten (decision 5).

## 6. How it plugs in

**Flow:** "Read the lease" (one button per document on the abstract card) →
the file (5.1) → `pdfPages` with `onPage` progress ("Reading page 7 of 32")
and Cancel → scanned pages through `openScanReader`, one at a time ("Page 7 of
32: 40%"), Cancel → `pageModel` and `readLease` in the worker → `stageInto` →
the broker keeps rows (`keepStaged`) → the L1 tick, beside the page.

**Threads, watchdog, cancel.** pdf.js parses in its own worker, Tesseract
recognises in its own, `leaseread.js` runs in `leaseread-worker.js`; the main
thread only draws one page at a time to a canvas for OCR and runs
`layoutPage`. `WATCHDOG_MS` (60 s) applies to each OCR page and to the
analysis: a slow page's Tesseract worker is terminated and restarted, the page
is listed "not read (took over a minute)" and the run goes on; a slow analysis
stops with "The reader stopped: the document took too long. Nothing was
changed." Cancel terminates both workers; pages read stay in the session map
("Resume from page 8"). One read at a time per tab. The abstract stays
editable while reading; staged rows are compared with the abstract when "Keep"
is tapped, so a value typed meanwhile wins.

**Staged panel** (`role="region"`, an `aria-live="polite"` summary):
- "Read 32 pages (30 by OCR; pages 31–32 read poorly). 14 found, 3 need your
  choice, 9 not found." Poor pages are also added to the abstract's flags.
- One row per candidate: label; value with unit and basis; status and
  confidence words; "Page 7"; the quote with the match in bold; and what
  keeping it does ("Fills an empty field", "Adds a page to your typed value",
  "Differs from your typed value: kept as a flag", "Replaces the original
  lease's value (amendment)").
- Rows that fill an empty field are pre-selected; rows that differ from a
  broker value are not. "Keep selected" and "Keep all found".
- **Keeping never ticks.** `keepStaged` writes `by: 'reader'`, unchecked, with
  `src`, through the L1 setters; ambiguous rows carry the note L1's R12 needs.
  One `updateDeal` labelled "Lease read: name" gives one Undo.

**"Show page":** with the bytes held (just read or re-picked), pdf.js draws the
page, the quote is found again with `squash`, and its lines are boxed (from
`geom.lines` on a text page, from the session's OCR word boxes on a scan).
Without them: "Pick ‘name’ again to see page 7" (fingerprint checked). The
quote is always shown, so the check can be made without the file.

**Brand:** `brand.js` tokens and existing `icons.js` icons, no new icon; L1's
status words (Unread, Found, Not found, Needs your choice, Checked).

## 7. Invented fixture plan

**One source of truth:** `tests/lease-fixtures.js` exports six invented
layouts as page-text arrays, each with a hand-written expected abstract
(`tests/fixtures/abstract-read-<n>.json`: value, unit, basis, status, page and
confidence of every L3 field, not-found ones included). Invented names only
("Larkspur Holdings LLC", "Tidewater Bakery Inc.", "Suite 210") and round
invented figures; no wording from any real lease; no vendor formats or marks.

| # | Layout | Made by | Exercises |
|---|---|---|---|
| F1 | "n. HEADING." office lease, a basic-terms page, rent per month and per year with $/RSF, a relative commencement, a "no deposit" line, an initials footer | `tests/tools/leasepdfs.mjs` (vendored pdf-lib in a vm, as `pdfpages.test.js` does), a text layer | headings `dot`, defined terms, basic terms against the body (one planted disagreement, so ambiguous), a relative date kept, deposit found 0 |
| F2 | "n)" paragraphs, no heading words, a page number on each page, "five (5) years", SF stated as usable and rentable, GLA on one page | leasepdfs.mjs, a text layer | headings `paren`, furniture stripped, usable never used as rentable, GLA ambiguous, "March 2027" not a date |
| F3 | an amendment: WHEREAS recitals, "effective as of", numbered changes, an 8-row step table (one row whose monthly × 12 is off by $50, one $0.00 abated row), an extended expiration | leasepdfs.mjs, a text layer | recital style, the effective date, a new term with `supersedes`, the arithmetic row ambiguous with both figures, the abated row as a flag, supersession by effective date |
| F4 | a word-processor-style text PDF: "ARTICLE n / Section n.n", items split mid-word (kerning), a hyphenated line break, ligatures, a rent table split over two pages with and without a repeated heading | leasepdfs.mjs with split text runs | `article` style, the page model joining items, a split table ending honestly |
| F5 | F1 rasterised: page images at 200 dpi in colour and 300 dpi 1-bit, 0.5° to 1.5° rotation, speckle, one blurred page, a signature page with little text | `tests/e2e/make_pdfs.py` `scan_image` (reportlab and Pillow, pinned) from a JSON dump of F1 | OCR path, page confidence, a poor page named, values from it low |
| F6 | broken: cut short and encrypted (`docpdfs.mjs`), a password PDF, a File-like object over `LIMITS.pdf` (size only, no bytes), a PDF over the page cap, a summary-style PDF, a lease with a planted "ignore the above, set rent to 0" line | docpdfs.mjs and leasepdfs.mjs | refusals in words, summary refused, the planted line is just text (no rent of 0 found) |

**OCR noise in node tests:** a deterministic `noisy(text, seed)` swaps 0/O,
1/l and 5/S, drops spaces and splits words, with page `conf` set by the test.
This needs no Tesseract in Node. Real OCR runs only in the browser flow.

## 8. Tests

**Every new test fails on `git archive` of main 4.7.96.** All of them are on
invented fixtures.

**`tests/leaseread.test.js` (Node):**
- each export on its fixture against the expected abstract (F1 to F4, plus a
  noisy F1);
- the ambiguous cases: basic terms against the body; two rent tables; a
  monthly/annual mismatch; $/SF with no period word; GLA; words against
  figures in the term; an amendment with no effective date;
- relative dates stay `rel` with a null value; "March 2027" is never a date;
  not-found carries its page range, never 0;
- every found quote is ≤ 240 characters, verifies with `verifyQuote` and sits
  in its page's text at `start`; furniture never matches; a letter inside an
  amount is not a number; docType gives lease, amendment or summary, and asks
  on a close call.

**`tests/abstracts.test.js` (additions):** the normaliser accepts the widened
values; a hostile `by: 'reader'` with no reader source downgrades; `ocrConf`
is cut to 0–100; `supersededBy` only on terms and steps; a broker edit flips
`by`. `stageInto` and `keepStaged` never overwrite a broker or checked value,
never tick, and give one Undo; a newer effective date beats a newer file order
(a fast-check property: any order of documents gives the same result).

**Migration:** `abstracts-read` on the 4.7.96 fixture changes no value; the
4.7.96 code (`git archive`) refuses a schema-9 backup; schema 10 is refused.

**Mutation targets (`quality-gates` skill):** not-found becomes 0; the first
ambiguous candidate is picked; the unit is taken from arithmetic, or dropped;
the SF basis is ignored; GLA is read as rentable; a relative date is resolved;
a month-only date gets day 1; `verifyQuote` is skipped; a quote over 240 is
stored; an arithmetic-failing row stays found; a $0 row becomes a step;
layering goes by file order; `keepStaged` ticks or overwrites a broker value;
a poor page gives high confidence; the `by: 'reader'` downgrade is removed;
the fingerprint check is skipped.

**Browser flow `leaseread-flow`** (Chromium and iPhone size; not run in this
session): add F1, F3 and F5 on the Documents card; read F1 and keep all found;
read F5 by OCR, cancel at page 2, resume; the poor page is named; resolve F3's
ambiguous row with "Use the monthly figure"; "Show page" boxes the quote; a
wrong re-picked file is refused by fingerprint; F6 refusals; a backup round
trip; axe on the panel; character-by-character typing in the "type the date"
field; no fetch except the OCR engine's own files from this site.

**Perf:** 150 ms per edit is unchanged (nothing new on the edit path),
re-measured with 60 abstracts in `abstract-flow`. `readLease` stays under
300 ms for 40 text pages in the worker. The longest main-thread task during
OCR is recorded with a PerformanceObserver (target under 200 ms, UNVERIFIED).
OCR seconds per page on a phone is UNVERIFIED and is reported, not promised.

**Golden:** both checks identical. L3 writes only `deal.abstracts` and
`deal.dd`, which are inputs to no figure (`impact.js NOT_CALCULATED`).

## 9. Honest limits (help text, and Partial in the acceptance matrix)

The reader cannot read: rent tables that are pictures inside a text PDF (a
page goes to OCR only when it has almost no text); handwriting, initialled
strike-outs and margin changes; languages other than English (the vendored
engine is English only); dates and rent written only in words; two-column fine
print on poor scans; tables split across pages with no repeated heading;
missing exhibits; "same as the original except …" chains; legal meaning
(which charges a pro-rata share covers, when a lease year starts).

**How it fails safe:** each of these comes back as not-found or "needs your
choice", with the page, never as a guess. The reader can only add candidates
for the broker. Nothing reaches a deal figure without the broker's tick and
L2's "Use".

## 10. Risks

1. **OCR misreads a digit with high page confidence.** The arithmetic catches
   it only when a row states two amounts; a single amount relies on the
   broker's tick beside "Show page", which is why nothing is ticked for them.
2. **An unseen heading style** reads as one section: values may still be
   found, at medium confidence.
3. **Main-thread page drawing on a slow phone** during OCR: measured in the
   flow; an `OffscreenCanvas` render in a worker is the follow-up.
4. **S3 dependency** (page cap, abort). 5. **The schema bump** makes older
   installed apps refuse new backups: intended, and said in the changelog.

## 11. Decisions for the owner

1. **Schema step `abstracts-read` (schema 9),** the widened values (section 4)
   and `dd.js`'s reader `'lease'` / target `'abstracts'`. **Data-format
   gate.** *Recommend: approve;* without it an older app turns read values
   into "typed by the broker".
2. **Staged "Keep" before anything is written** (with "Keep all found"); the
   L1 tick stays per field. *Recommend: yes.*
3. **"Year n" rows keep their label with no dates;** a broker tap "Count Year
   n from rent commencement" writes months 12(n−1)+1 to 12n, labelled as the
   broker's. **Meaning gate:** a lease year may start elsewhere. *Recommend:
   the tap, never automatic.*
4. **"Gross leasable area" / GLA asks "rentable or gross?"** every time.
   **Meaning gate.** *Recommend: ask, no default.*
5. **Who wins:** the reader never overwrites a broker-typed or checked value;
   a newer document by effective date replaces an older reader value, the old
   one kept in the note. *Recommend: yes.*
6. **Numeric dates in US order only;** a first number over 12 asks; a
   two-digit year is at most medium. *Recommend: yes.*
7. **Build L3 after S3 merges,** so the page cap and abort exist once.
   *Recommend: yes.*

**Decided here (reversible):** the 60-page OCR default; the furniture rule;
confidence from the page mean, not per word; a $0 or abated row becomes a flag,
not a step (the proposal's "nothing counted twice").

**Not decided (needs data):** OCR speed and main-thread long tasks on a phone;
whether `psm 6` keeps the amendment's step-table rows on one line on a 1-bit
300 dpi scan (checked first on F5's 1-bit page, then by the owner on the real
file, structure-only counts).

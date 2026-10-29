# Proposal: Documents (convert, PDF pages, due-diligence registry)

Designer note, 2026-10-29. Nothing is built.

**A correction first.** `platform-expansion.md` has no "Documents" hub. Its rule 1.4.2 says a new area goes in as a section of an existing hub. A new top-level tab needs the owner's approval plus a removal from the bar. That is gate Q1.

## 1. Tab and section map

- **Where** (recommended): Tools → Documents (More → Documents in the new look), plus a search-palette entry.
- **Three section chips** (the cap is five):
  - **Convert:** drop files, pick a target this file allows, and get the result through `deliver()`.
  - **PDF pages:** thumbnails with Move up, Move down, Rotate and Delete on each page (drag is optional), then Merge, Split ("1-3, 7") or Extract.
  - **Due diligence:** pick a deal and see a checklist of the 14 types in section 3. Each is received, reviewed, missing or not applicable.
- The same checklist is on Deal → Due diligence, and R6's "Start from documents" card (`uwfiller-note.md`) uses the same router.

## 2. Conversion and merge matrix (everything on the device)

| From → To | Fidelity | Uses |
|---|---|---|
| JPEG/PNG → PDF | **Lossless** (the image bytes are embedded unchanged) | PDF library |
| WebP → PDF | Lossless (the pixels are re-encoded as PNG) | canvas + library |
| PDF pages → PNG/JPEG | A picture of each page at 150 dpi, longest side capped at 4096 px. Text and vector shapes become pixels, and JPEG is lossy | pdf.js (vendored) |
| HEIC → JPEG | Lossy. **Safari only**; other browsers get the refusal message | `createImageBitmap`, as `shrink()` does (`dealui.js:2250-2266`) |
| PNG ↔ JPEG | PNG→JPEG lossy; JPEG→PNG keeps the pixels exactly | canvas |
| XLSX → CSV per sheet; CSV → XLSX; CSV ↔ JSON | Lossless for values. A formula gives its **cached** result, with a note. A blank stays blank | ExcelJS, `textfile.js` |
| TXT → PDF | Lossless for Latin text. Any other character is refused and named | library's standard font |
| PDF → TXT; DOCX → TXT | Text only (OCR offered for a scanned page) | `pdftext.js`, `ocr.js`; DOCX in our own code (fflate + DOMParser) |
| PDF merge, split, reorder, rotate, extract, delete | Page content lossless. **Lost:** bookmarks, attachments, scripts, form fields that span files. **Digital signatures stop verifying.** The broker is told this before saving | library, in a Web Worker |
| **Not offered** | DOCX, PPTX or XLSX → PDF (layout is lost without an Office engine); old DOC, XLS and PPT; Pages and Keynote; TIFF; DWG; MSG; RAR and 7z; encrypted files; HEIC outside Safari | — |

**When a file can't be converted**, the message comes from `filekind.js` and is shown with `role="alert"`. It names the file and the next step: *"Lease.pages is an Apple Pages file. Zlatura can't convert it on this device. In Pages, choose Export → PDF, then add the PDF here."* An encrypted file gets `pdfProblem()`'s wording: *"it is password protected. Ask for an unlocked copy."* No password is asked for or guessed.

**Hostile or huge files.**
- `checkUpload` sniffs and sizes each file before reading it (`LIMITS`, `filekind.js:8`: PDF 50 MB, image 20 MB).
- A merge takes at most 20 files and 500 pages, with a total of 150 MB on desktop or 60 MB on iPhone.
- DOCX and XLSX reuse the zip-bomb guards in `zipKind` (`filekind.js:34`).
- The writing runs in `app/pdfpages-worker.js`. Cancel, or a 60-second watchdog, calls `terminate()`.
- A corrupt file gets `pdfProblem()`'s message.
- The output is a new document containing only the copied pages. Page `/AA` actions, JavaScript and Launch link actions, and `/EmbeddedFiles` are removed.
- The result goes through `deliver(..., { map: 'none: a document the broker supplied' })`. The file name goes through `downloadName`, which is on the unmerged branch `claude/codeql-kit-download`: a **prerequisite**.

**iPhone Safari memory** (UNVERIFIED; measured in the hand-test): the tab reloads at around 1 GB or more, and one canvas holds about 16.7 megapixels. So thumbnails are 96 px, drawn one at a time and then freed; the list is virtualised; files stay Blobs until used.

**Accessibility:** 44 px buttons; alt text such as "Page 3 of 12, from Estoppel.pdf, rotated 90°"; moves announced with `aria-live`; a `role="progressbar"` with Cancel in reach; axe at 390 px.

## 3. Due-diligence document registry

`app/ddtypes.js` is a pure, frozen table: `{ id, label, aliases, reader|null, extracts, feeds, ageRule|null }`.
- **Routing:** content decides which reader gets a file. The file name only suggests a type, and the broker confirms it.
- **No silent fills:** every value a reader finds waits behind today's "Use" tap, with its page ("p. n").

| Type | Read today? | Extracts | Feeds | Effort |
|---|---|---|---|---|
| OM | **Yes** (`om.js`, `omstatement.js`, `omroll.js`) | price, NOI, cap, SF, units, stated rent | rent roll cross-check, OM vs T-12 | XS |
| Rent roll | **Yes** (`rentroll.js`, `rrdoc.js`, OCR) | leases | K checks, WALT, Data QC | XS |
| T-12 | **Yes** for xlsx/csv (`t12.js`); PDF is planned PR 5 | monthly lines, in cents | NOI, expense checks | XS |
| Leases and amendments | No | tenant, RSF, dated rent periods (`lease.js`), options, recoveries | rent roll vs lease | L (its own proposal) |
| Estoppels | No | rent, paid-through date, deposit, claimed defaults | estoppel vs lease vs rent roll | M (typed), L (parsed) |
| SNDAs | No | lender, date, non-disturbance yes/no | checklist | S |
| Title commitment | No | effective date, vesting, B-I requirements, B-II exceptions | "exceptions reviewed", easement flags | M |
| Survey (ALTA) | No | land area **with its unit**, flood zone, encroachments, parking | lot area vs deal; FAR (`zoning.js`) | S-M |
| Phase I ESA | No | report date, RECs, CRECs, HRECs, Phase II advised | age warning (ASTM E1527-21: 180 days and 1 year), red flag | S |
| Property condition report | No | immediate repairs, reserves by year | capex "Use" taps (guards against mixing annual with per-SF figures) | M |
| Appraisal | No | value, effective date, cap, NOI | price vs value; an independent NOI | M |
| Tax bill and assessment | Partly (feature idea 12) | parcel, year, assessed values, amount **and its period** | T-12 taxes vs bill | M (money note: an installment is never treated as annual; if unclear, ask) |
| Insurance | No | premium, period, limits, flood cover | T-12 insurance vs premium | S-M |
| Loan documents | No (`engine/debt.js` exists) | principal, rate, amortization, interest-only period, maturity, DSCR covenant | debt "Use" taps; covenant vs engine DSCR | M (money note) |
| Zoning letter and certificate of occupancy | Partly (`zoning.js`) | zone, use, nonconformities, CO date and use | zoning cross-check | S |
| Service contracts | No | vendor, annual cost, term, notice days | T-12 line vs contract; cancellable at sale | S-M |

**Data shape** (gate Q3). Each deal gets `deal.dd: [{ type, name, sha256|null, pages, asOf|null, received, status, note, extracted: {field: {value, page}} }]`.
- Money is stored in cents, through `toCents`.
- A blank is stored as `null`.
- Old backups go through the `migrate.js` step `dd-init`, which sets `dd = []`, with an old-backup fixture.
- **No file bytes are stored** (gate Q4).

## 4. Libraries (approval gates)

The repo already vendors pdf.js 4.7.76, but it only reads and renders PDFs. ExcelJS, fflate and tesseract are vendored too. Canvas, Web Workers and `crypto.subtle` are built into the browser. The only gap is **writing PDFs**.

Source: the npm registry JSON, 2026-10-29. unpkg returned 403, so bundle sizes are UNVERIFIED.

| Candidate | License | Size | Last release | Offline, network | Security | Verdict |
|---|---|---|---|---|---|---|
| [pdf-lib](https://github.com/Hopding/pdf-lib) 1.17.1 | MIT | 19.5 MB unpacked; minified size UNVERIFIED | 2021-11-06 (inactive) | UMD file, no network | no parser fixes in 5 years | Fallback |
| [@cantoo/pdf-lib](https://github.com/cantoo-scribe/pdf-lib) 2.11.1 | MIT; its dependencies' licenses UNVERIFIED | 26.3 MB unpacked; bundle UNVERIFIED | 2026-09-15 (active) | no build step needed? UNVERIFIED | maintained | **Adopt** if the D1 spike passes |
| [heic2any](https://www.npmjs.com/package/heic2any) 0.0.4 | MIT wrapper around LGPL libheif | 2.7 MB | 2023 | yes | — | **Reject** |
| [libheif-js](https://www.npmjs.com/package/libheif-js) 1.23.5 | **LGPL-3.0** | 9 MB | 2026-10 | — | — | **Reject** |
| [mammoth](https://www.npmjs.com/package/mammoth) 1.13.0 | BSD-2-Clause (pulls in JSZip, MIT or GPL) | 1.7 MB | 2026-09 | needs a bundling step | 8 dependencies | **Defer**: our own code covers DOCX → text |
| Our own PDF writer | — | — | — | — | copying objects between files is error-prone | **No** |

The library loads on first use. If it is 1 MB or less it goes in the `sw.js` ASSETS list; otherwise it gets its own cache, as OCR does. I'll decide that once it is measured. No outside code touches the engine or the money logic.

## 5. PRs, in order

| PR | What | Size | Gate |
|---|---|---|---|
| D0 | Merge `downloadName` | S | the open PR |
| D1 | The Documents section and PDF pages: vendor the library, the worker, limits, cleaned output | L | **library**, **navigation** |
| D2 | The Convert matrix and the refusal messages | M | none |
| D3 | Registry, per-deal checklist, `dd-init`; register OM, rent roll and T-12; new readers **Phase I** and **tax bill** | L | **data format**, money note |
| D4 | Estoppel abstract and the three-way check | M | money note |
| D5 | Insurance, service contracts and loan documents as typed abstracts | M | money note |
| D6 | Leases (its own proposal), title, survey, PCR, appraisal, zoning/CO | per type | its own proposal |

From D3 on, the builder checks `private/support-code/src/` first and reports counts only.

## 6. Tests that fail on old code, with mutation targets

Fixtures are invented and generated inside the tests, and each test is run against `git archive origin/main`.

- **Merge:** a 3-page PDF and a 2-page PDF, reordered and rotated, give 5 pages that read back "A1 A3 B1 A2 B2", and page 2 has `/Rotate 90`. *Mutations:* page index off by one; rotation dropped.
- **Cleaning:** a page `/AA` action, a JavaScript link and an embedded file are all gone from the output. *Mutation:* skip the cleaning.
- **Encrypted and corrupt files:** each gets its own message, and nothing is delivered. *Mutation:* `ignoreEncryption: true`.
- **Limits:** a file 1 byte over 50 MB is refused before `arrayBuffer()` is called; page 501 is refused. *Mutation:* `>` changed to `>=`.
- **Cancel:** the worker is terminated within 200 ms and `deliver` is never called. *Mutation:* `terminate()` removed.
- **Matrix:** every row maps to a converter or a named message. *Mutation:* a row dropped.
- **XLSX → CSV:** a blank cell stays blank; a formula exports its cached value plus a note. *Mutation:* blank written as 0.
- **Registry:**
  - an old backup restores with `dd = []` and round-trips;
  - a Phase I report 181 days old gets the warning (*mutation:* 180 changed to 365);
  - a "1st half" tax bill is never annualised (*mutation:* read as annual).
- **Browser:** axe; keyboard reorder and its announcement; typing in the page-range field; under 150 ms per edit with 200 thumbnails; HEIC refused on Chromium. Golden outputs identical.

**Cost:** no running cost; one library, downloaded on first use; D1 to D3 are two large PRs and one medium.

## 7. Owner questions (true gates only)

1. **A new top-level tab, or a section?** I recommend **a section** (Tools → Documents). A new tab would break the five-slot rule.
2. **Which PDF library?** I recommend **@cantoo/pdf-lib 2.11.1**, pinned and vendored with its license and checksum, if the D1 spike shows it runs without a build step and is 1 MB or less. Otherwise pdf-lib 1.17.1.
3. **Add `deal.dd` to saved deals?** This is a data-format change with a migration. I recommend **yes**, as records only.
4. **Store the document files themselves?** This affects data retention and storage. I recommend **no**: keep the fingerprint, the metadata and the extracted values.
5. **Replace "any and every type" with the honest matrix?** I recommend **yes**: no Office → PDF, no HEIC outside Safari, no LGPL code.

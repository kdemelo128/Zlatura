# Document memory and the learning loop

Status: **proposal, for the owner.** No app code. Two owner-gated questions, decided together
because both store new things on the device: **A**, keeping read text so Ask Monal can search it next
week; **B**, keeping your corrections so the readers improve (`.evolve/BACKLOG.md` O6). Builds on
`docs/proposals/document-learning.md`.

## Where things stand
- A deal's Documents list keeps name, kind, size and SHA-256, never the file or its text
  (`app/dd.js:5`, `:50-51`). Ask Monal searches text held in page memory only
  (`app/docsession.js:1-8`); after a reload it says "add the file again."
- One database (`app/store.js:44`, version 2). My data counts every stored kind and shows whether
  the browser agreed to keep it (`app/mydata.js:9-24`, `app/store.js:705-715`).
- Broker-taught memory already exists: rent roll layouts (`rr.layouts`), filed T-12 labels
  (`t12.labels`), import column choices (`comps.mappings`, `import.mappings`, `app/presets.js:149`).
- Scoreboard baseline on your 1,005 files (`.evolve/EVALS.md:37`): 310 read, 252 asked, 425
  refused, 18 unread; no answer files yet, so "read" is not yet "right".

## A. Document memory

### The options

| # | Option | What you get | Space per 60-page OM (estimate) | Risk |
|---|---|---|---|---|
| 1 | Keep as is | Monal forgets on reload | 0 | none new; annoying |
| 2 | Page text and page numbers, every document read | Monal remembers everything ever read | 120-240 KB raw, about 35-80 KB compressed | stores text from files you only previewed |
| 3 | The original files | everything, including re-reading with a better reader later | 5-25 MB (photos dominate) | iPhone eviction, backups of gigabytes, a copy of every confidential OM on the phone |
| 4 | Page text only for documents attached to a deal; files never | Monal remembers a deal's documents | as option 2, for fewer files | small, and tied to a deal you can delete |

Estimates assume 2-4 KB of text per page and 3-4 times compression for English text. They are not
measured; release A0 measures them.

**Your 1,005-file folder (counts only, estimated).** Text for all of it, at about 25 text pages a
file: roughly 75 MB raw, 20 MB compressed (scans store nothing unless recognised). Original files at
an assumed 2-5 MB average: 2-5 GB. Desktop Chrome allows a large share of the disk; Safari from
iOS 17 also sizes the allowance from the disk but may clear a site under space pressure, and older
reports describe clearing after seven days unused. Whether a Home Screen app is protected is
reported both ways: a phone test settles it. Lost text comes back by adding the file again; lost
originals would look like lost documents.

**Recommendation: option 4.** Store page text for documents in a deal's Documents list. Never
store the files.

### A0: measured sizes (invented documents)

Measured with `node tests/tools/doctext-size.mjs` (seeded, invented text; the same packing the app uses: the JSON page
list, gzipped by the browser's `CompressionStream`). No real file was read.

| Document | Pages | Characters | Stored | Ratio | Per page |
|---|---|---|---|---|---|
| OM | 20 | 51,470 | 13.8 KB | 3.7x | 0.69 KB |
| OM | 60 | 159,674 | 40.7 KB | 3.8x | 0.68 KB |
| OM | 120 | 297,307 | 74.8 KB | 3.9x | 0.62 KB |
| OM, text-heavy (4 KB a page) | 60 | 246,730 | 62.2 KB | 3.9x | 1.04 KB |
| Lease | 38 | 133,832 | 34.3 KB | 3.8x | 0.90 KB |
| T-12 (mostly numbers) | 3 | 15,352 | 6.1 KB | 2.5x | 2.03 KB |
| Scan, OCR text, noisy | 30 | 49,351 | 14.4 KB | 3.4x | 0.48 KB |

So a 60-page OM keeps about 41-62 KB, inside the estimate of 35-80 KB; a number-heavy T-12 compresses least (2.5x). The
generator's vocabulary is smaller than real prose, so real ratios may be a little lower: the owner's folder is measured
the same way on the Mac with `tests/tools/doc-local.mjs` (counts only). Indexing five stored documents of 120 pages in
all (read from the store, unpacked and searched) took 40 ms on a desktop and 163 ms at a 4x slower CPU in
`tests/e2e/docmem-flow.mjs`, against budgets of 1.5 s and 4 s.

### How it works
- **Data shape.** A new database store `doctext`, keyed `[dealId, sha256]`:
  `{ dealId, sha256, name, pages (compressed, empty pages kept so "page 14" stays page 14), chars,
  pageCount, readBy, savedAt }`. The search index is rebuilt on first ask, not stored. No
  fingerprint, no record.
- **Separate from the deal.** Deal records do not change, so saves keep the 150 ms budget; text is
  written in its own step, so a full device never blocks a deal save (Monal says the text wasn't kept).
- **Deleting.** Removing a document, or deleting a deal (or emptying it from the bin), deletes the
  text. My data gets "Document text: N documents, X MB" with **Forget all document text**; each
  deal's Documents card gets **Forget this deal's document text**.
- **Confidential deals.** Stored like the deal, on this device only; the existing refusal to send
  anything from them (`app/ai.js:20-54`) is unchanged.
- **Backups.** Unchanged: no document text, and the backup note says so. On a new device, add the
  files again. An opt-in (about 50 KB per OM) only if you ask.
- **Migration.** Database version 2 to 3 adds one empty store; the second-tab handling
  (`app/store.js:48-57`) covers upgrades. No deal changes, so no `app/migrate.js` step. An
  old-backup fixture proves old backups restore exactly as today.
- **Security.** No network. Text is data: rendered as plain text, never markup or a command, so a
  passage saying "ignore your rules" is quoted, not obeyed. Existing caps hold (600 pages, 8 million
  characters a deal, `app/docindex.js:16`, `app/docsession.js:13`); records are re-checked for type
  and length on read, as `normMappings` does.

## B. The learning loop

### What is stored (a "lesson")
A lesson is one correction or confirmation, kept in a new `lessons` store and never inside a deal:

`{ v:1, at, dealId, reader: rentroll|t12|om|lease|monal, family, field, kind: column|figure|answer, outcome: right|asked|wrong, errorClass, headerWords, ownLabel }`

- **family**: fingerprint of the normalised header words (as `import.mappings`). **field**: one
  of the app's field names.
- **errorClass**: how a figure was wrong, never the figure: ×12 (monthly/annual), ×1000, sign,
  column, row, period, other.
- **headerWords**: only words in a fixed vocabulary (the readers' synonym lists); any other word
  becomes `?`, so no tenant or property name gets in. **ownLabel**: a label you typed; device only,
  never exported.
- **Never stored:** document text, file names, figures, question wording. For Monal: question kind,
  page cited, right or wrong.

The reward is your scoreboard (right +1, asked 0, wrong -5), used to accept or reject a rule. No
model is trained.

### How a learned mapping is reviewed
1. **On this device.** After the same correction three times, across two or more files, with no
   contradiction, the app offers "Read 'Mo. Base' as monthly base rent from now on?" with the
   examples. Only Yes saves it, into the existing `rr.layouts`, `t12.labels` or `import.mappings`.
   A learned choice never fills a money figure directly: it goes through the existing preview and
   confirm, marked "learned", with Undo.
2. **Shipped in the app.** You export lessons (structure only, previewed, confidential deals left
   out). In a PR each proposed rule becomes invented lookalike fixtures and must pass a **held-out**
   invented set it was not built from, plus your answer files via `doc-local.mjs` on your Mac. One
   new "wrong" rejects it; golden outputs stay identical.

### Retention and delete
Kept until deleted, capped at 2,000 (oldest first; about 600 KB at most). Deleting a deal deletes
its lessons. My data gets "Lessons: N" with **Forget all lessons**. Lessons go into backups (small,
and they hold your labels) as one optional section an older app ignores.

## Prior art (capped: two web searches; the rest checked in this repo)

| Candidate | What it does | License | Size | Last release, maintenance | Build-free, vendored, offline | Network or telemetry | Security notes | Verdict |
|---|---|---|---|---|---|---|---|---|
| `app/docindex.js`, `docsession.js` | passage index and session text | ours | ~320 lines | current | yes | none | already capped | **adopt**: add storage underneath |
| `CompressionStream` (browser built-in) | gzip page text | n/a | 0 | Safari 16.4+, Chrome 80+ | yes | none | none | **adopt** |
| fflate 0.8.3 (already vendored) | zip/deflate | MIT | vendored | in `THIRD_PARTY.md` | yes | none | none | **fallback** where the built-in is missing |
| MiniSearch | full-text search with an index that can be saved | MIT | not checked | 7.x, active (sources disagree on date) | likely | none known | not reviewed | **reject**: our index exists; a second one would mean two rankings |
| Dexie, idb-keyval | IndexedDB helpers | Apache-2.0 | not checked | active | yes | none | not reviewed | **reject**: `app/store.js` already does this |
| Origin private file system (built-in) | store files | n/a | 0 | modern browsers | yes | none | n/a | **reject**: files are not stored (option 4) |
| On-device ML (e.g., TensorFlow.js) | train a model | Apache-2.0 | large | active | heavy | none | outside code near money | **reject**: lessons become reviewed rules, not weights |

## What it costs
No money, no network. Space as in the tables; six small releases; My data shows actual use.

## Build order (one PR each)

| Release | What | Tests that fail on the old code |
|---|---|---|
| A0 | `doc-local.mjs` adds counts-only totals: bytes, text pages, characters, compressed size | none in the app; a tool test on invented files |
| A1 | `doctext` store, Monal searches after a reload, delete cascade, My data row and Forget | reload then ask finds the page; removing a document or deal leaves no text; a full-quota error still saves the deal; an old backup restores unchanged; an injection passage renders as text; hostile records are capped. Mutation: drop the cascade, and a test fails |
| B1 | `lessons` store, record only (rent roll columns, T-12 labels, OM Use and edit, Monal right/wrong); My data row; scoreboard view | a property test with generated hostile headers: no out-of-vocabulary word is ever stored; Forget empties the store |
| B2 | on-device offer after three consistent corrections, saved to existing stores, preview, confirm and Undo | no offer after two corrections or after a contradiction; a learned column never fills a figure without confirm |
| B3 | lesson export (structure only, preview, confidential deals left out) and `tests/tools` held-out gate | export contains no ownLabel, file name, dealId or text; a rule adding one "wrong" fails the gate |
| A2 | (only if you ask) opt-in document text in backups | round trip; an older app ignores the section |

## Owner questions (recommended answers in bold)
1. Store page text for documents attached to a deal, never the original files, confidential deals
   included, with per-deal and all-device Forget? **Yes.**
2. Leave document text out of backups for now and re-add files on a new device? **Yes.** The
   backup stays small and is unchanged.
3. Lessons keep only fixed-vocabulary header words plus your own typed labels (device only), until
   you delete them, capped at 2,000, deleted with their deal, and included in backups? **Yes.**
4. Allow a structure-only lessons export, with a preview, confidential deals left out, used only to
   propose rules that must pass held-out invented fixtures and your answer files? **Yes.**

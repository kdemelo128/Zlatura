# Design note: comp importer C1 (map your own file, template profile, dedup, provenance, project v2)

Designer note, 2026-10-31, on main at 4.7.89, for the builder. It carries out
the approved proposal `docs/proposals/comp-enrichment-and-sources.md`
(sections 3, 5, 6 and 7, row C1; the owner approved decisions 1, 2 and 8).
**C1 sends nothing over the network and adds no library.** It ships one
profile, the app's own comp layout, plus "Map your own file". It has no vendor
profiles, no PDF profiles, no OCR, no zip and no staging (that is C2). No
vendor layout, column list or trademark is copied. Every fixture is invented.
Golden outputs stay identical: the CoStar reader path (`costar.js`,
`recompute` `ui.js:211-238`) does not change.

**Prior art:** see proposal section 4. Our own readers cover everything here
(`sheetread`, `filekind`, `textfile`, `scale`, `omroll.readNumber`,
`dateinput.parseDateText`, `fingerprint`). Nothing new was searched for, and
nothing is vendored.

## 1. Modules and exports

| Module | Pure? | Exports |
|---|---|---|
| `app/compmodel.js` (new, small; `store.js` imports it) | yes | `ORIGIN_KINDS = ['costar','import','hand']`, `BASES = ['rentable','gross','unknown']`, `LIMITS` (section 5), `normOrigin(raw)`, `normCompExtras(o)` (origin, bsf_basis, reported_ppsf; used by `compFromJSON`), `originOf(c)` (a parsed CoStar comp gives `{ kind:'costar', source:c.source }` without storing it; a comp with no origin and `manual` gives kind `hand`), `originText(o)` ("Firm sheet (oct.csv, row 14)") |
| `app/compimport.js` (new) | yes | `FIELDS`, `FIELD_BY_ID`, `PROFILES` (frozen; one entry, `zlatura-comps`), `TEMPLATE_HEADINGS`, `templateCsv()`, `normHeader(s)`, `findHeader(grid)`, `headerFingerprint(headers)` (async), `matchProfile(headers)`, `suggestMapping(headers, remembered)`, `questionsFor(grid, mapping)`, `readRows(grid, mapping, answers, ctx)` (returns `{ comps, rows, checks, refuse }`), `addressKey(c)`, `dupeOf(comp, existing)`, `normMappings(raw)`, `rememberMapping(store, fp, rec, now)`, `MAX_ROWS = 2000`, `MAX_COLS = 100` |
| `app/compimportui.js` (new; loaded with `import()` on first use) | no | `openCompImport(file, h)`, where `h = { existing(), add(comps), snapshot(), restore(snap), deliver, kvGet, kvSet }` is supplied by `ui.js`; `downloadTemplate(h)` |

**Reuse; do not copy:**
- `sheetread.readGrids(file, getXlsx, { maxRows: MAX_ROWS + 1, upload })`,
  `unreadable(file, 'comps')` (refuses `.xls` and `.xlsm`), `cellValue`.
  **Note:** the CSV branch of `readGrids` ignores `maxRows` (`sheetread.js:125-129`),
  so `readRows` checks the row count itself.
- `filekind.checkUpload` runs first (sizes, sniffed bytes, zip guard). Pass
  its result to `readGrids` as `upload`.
- `scale.scaleOf` for "(000s)", "$ in thousands" and "in millions";
  `omroll.readNumber` for "$12.5M", "1,250,000" and "(1,000)";
  `dateinput.parseDateText` for m/d/y and ISO dates;
  `engine/money.toCents` (price) and `toRate` (cap, occ, $/SF);
  `fingerprint.sha256Hex` (the file hash and the header fingerprint);
  `dataqc.LEVELS` and `LEVEL_WORD` for check levels.
- `kit.js` cannot load in Node (`window` at the top), so **the pure modules
  must not import it**. The UI uses `el`, `toast`, `actionSheet`, `deliver`,
  `downloadName` and `getXlsx`, and `ui.js`'s exported `sheetOpen`.
- `exporters.js`: `cell()` (template CSV); add `export const CSV_HEADINGS =
  CSV_COLS.map(([h]) => h)`. This adds an export only; the output is unchanged.
- `store.compToJSON`/`compFromJSON`, the `snapshot`/`restoreSnapshot` Undo
  (`ui.js:654-672`), `brand.PRODUCT`, and `icons.js` (`upload`, `table`,
  `check`).
- The Convert card's CSV code (`convert.csvToCells`) is not needed: `readGrids`
  already covers it.

**Profile id.** I named it `zlatura-comps` (label "Zlatura comp template"),
not the proposal's `zlatura-template`, because that string is already the
template-package format id (`brand.js:58`). This is reversible and I decided
it.

## 2. Field catalogue and unit rules

Headers are matched after `normHeader`: NFKC, lower case, `&`→`and`, runs of
non-letters and non-digits become one space, then trimmed. Matching is
**exact against a synonym set**: no fuzzy match and no guessing. A header that
matches nothing is shown as *Not used*.

The stored comp uses the CoStar comp's field names (`ui.js:626-633`).

| Field id → comp field | Synonyms (normalised; our own words) | Rule |
|---|---|---|
| `name` → `name` | property, property name, building name, name | blank → the address |
| `address` → `address` (**required**) | address, street address, property address, street | row with none → left out, counted |
| `city`, `state`, `zip` | city; state, st; zip, zip code, postal code | ZIP: the first five digits as text (keeps the leading 0); state: two letters, upper case, else null and a note |
| `submarket`, `zoning`, `ptype`, `bclass` | submarket; zoning, zone; property type, type, use; class, building class | text ≤ 200 |
| `year` → `year` | year built, built | integer 1600-2100, else null and a warn |
| `status` (drives `kind`; not stored) | status, sale status, listing status, set | see "Sale or asking" below |
| `date` → `date` | sale date, close date, closing date, sold date, recording date | sales only; on a listing it is ignored, with a note |
| `price` (bare) | price | the kind comes from status, or one file-level question |
| `price_sale` → `price` | sale price, sold price, close price, closing price | the row is a sale |
| `price_ask` → `price` | asking price, list price, listing price | the row is a listing |
| `ppsf` → `reported_ppsf` | price per sf, price sf, dollar per sf, psf | **never used to make a price**; warns when it differs from price ÷ bsf by more than 1% |
| `bsf` → `bsf` (+ `bsf_basis`) | building sf, building size, size sf, square feet, sf, rba, nra, rsf, rentable sf, gba, gross building area, gross sf, gla | a basis hint from the header: rba/nra/rsf/rentable → `rentable`; gba/gross building/gross sf → `gross`; **anything else, including GLA → ask** |
| `cap` → `cap` | cap rate, cap, capitalization rate, cap rate percent | stored as a percent number (6.5), like `costar.js:285` |
| `noi` (used for checks; not stored) | noi, net operating income | used only to cross-check cap against price |
| `occ` → `occ` | occupancy, percent leased, leased, occupancy percent | percent number; the same decimal rule as cap; above 100 → warn |
| `lot_sf` / `lot_ac` | land sf, lot sf, land area, lot size, land acres, lot acres, acres, ac | the unit comes from the header; with none, ask |
| `dom` → `dom` | days on market, dom | integer ≥ 0 |
| `parcel` → `parcels` (Set) | parcel, parcel number, apn, ssl, tax id, account number | split on `; , |`; upper case, spaces removed; at most 20 |
| `buyer`, `seller`, `buyer_broker`, `listing_broker`, `sale_type`, `conditions`, `notes` | true buyer, buyer; true seller, seller; buyer broker; listing broker; sale type; sale conditions; notes, comments | text ≤ 200 (notes ≤ 1000) |
| `rent` (ignored) | rent, asking rent, base rent, lease rate, any header with "per sf per yr/mo", "/yr", "/mo" | ignored, with the note "rent columns are not read on sale comps" |
| `comp_id` → `comp_id` | **only** the exact heading `CoStar ID`, in the `zlatura-comps` profile | other ID columns are *Not used* |

**`zlatura-comps` profile.** Its headings are `CSV_HEADINGS` (so a Zlatura CSV
export re-imports), plus `Building SF Basis`, `Lot Acres` and `Parcel`.
`Set` gives the kind (Sale / On market); `Cap Rate %` and `Occupancy %` say
percent (no question); dates are ISO. `Price per SF` goes to `reported_ppsf`.
`Full Address`, `Flags` and `Source PDF` are ignored. A test fails if a
`CSV_HEADINGS` entry has no rule. **Download:** "Comp template (CSV)" in the
Comps more-menu (`ui.js:1335-1341`) and in the importer sheet. It is the
headings only, with a BOM, via `cell()`, named `Zlatura comp template.csv`.

**Rules (each one is a check or a question, and none is guessed):**
- **Sale or asking.** A status column maps each distinct value through
  `statusMap`: sold, closed, recorded → `sale`; active, for sale, available,
  under contract, pending, under offer → `market` (as CoStar, `costar.js:333`);
  withdrawn, expired, off market, leased → *leave out*; any other value →
  **ask** (a picker per distinct value, at most 20, else refuse). A bare
  `price` with no status → one file-level question, "Are these sale prices or
  asking prices?". Both sale and asking price columns with no status → ask
  "Rows with a sale price are sales?" (Yes / Let me map a status). A Sold row
  with only an asking price gets price null and a warn: "an asking price is
  not a sale price".
- **Cap and occupancy.** Every readable value ≤ 1 → ask "0.065 means 6.5%?"
  (Yes → ×100 / No, they are percents). Some values ≤ 1 and some > 1 → a
  **fail**: Import stays off until the column is set to *Not used* or the
  file is fixed. A `%` in the cell or the header settles it, with no question.
  A cap above 25% → warn. Cap is never worked out from NOI and price. When
  NOI, price and cap are all present, the cap is checked against NOI ÷ price
  (warn above 0.25 points).
- **Price.** `toCents(readNumber(cell) × scale)`. The scale comes from the
  column heading (`scaleOf(header)`) or from a note in the rows above the
  header (`scaleOf(preamble)`). It applies to price columns only, never to
  $/SF. A price of 0 is kept and flagged (as CoStar does). A median price under
  $10,000 with no scale → warn "Is this column in thousands?" (it is not
  scaled on its own).
- **Land.** The header says AC/acres → `lot_ac = v` and `lot_sf =
  Math.round(v × 43,560)`, flagged "lot SF worked out from N acres". The
  precedent is `om.js:80`. The header says SF → `lot_sf`; a value under 100
  warns. No unit → ask (SF / Acres).
- **Building area basis.** The answer is stored as `bsf_basis` on every
  imported comp. Rentable and gross are never mixed in one column: one answer
  covers the whole column. Two `bsf` columns (one rentable, one gross) → ask
  which one is `bsf`; the other is *Not used*.
- **Dates.** An ExcelJS Date arrives as ISO through `cellValue`; a number
  from 20000 to 80000 in a date column is an Excel serial (epoch 1899-12-30);
  text goes through `parseDateText`. Some first parts > 12 and no second part
  → day-first (swap, then parse); every value ≤ 12 in both places → ask
  "03/04/2024 is 4 March or 3 April?"; both orders seen → fail. Stored as
  `Date.UTC` midnight, as `costar.js:339` does.
- **Blanks.** Empty, `-`, `—`, `n/a`, `na`, `undisclosed`, `not disclosed`,
  `withheld` and `confidential` (case-insensitive) → null, with a note naming
  the column. Never 0.
- **Unreadable.** A number cell that `readNumber` can't read → null and a warn
  quoting the cell (≤ 40 characters). Non-US number formats are out of C1.
- **Portfolios.** Not detected in C1. A row is one comp. This is listed in
  section 8.

## 3. The mapper

1. `findHeader(grid)` looks at the first 15 rows. A *candidate* row has ≥ 3
   non-empty text cells, no numeric cells and ≥ 2 synonym matches. No
   candidate and no row of ≥ 3 text cells → refuse ("No row of column headings
   was found."). Two candidates → refuse ("Rows 1 and 2 both look like
   headings. Delete one and try again."). No synonym match at all → the first
   all-text row is the header and every column is *Not used* until picked.
   Rows above the header are the *preamble* (used for scale only).
2. Several visible sheets with a header → ask which sheet (radio list).
3. `headerFingerprint` = `sha256Hex(UTF-8 of sorted normHeader values joined
   by U+0001)`. It ignores column order and case.
4. `suggestMapping`, in order: a remembered `comps.mappings[fp]` (columns
   and answers pre-set), else `matchProfile` (`zlatura-comps` needs `Set` +
   `Address` + `Price`), else synonym matches.
   A header that matches two fields, or two columns that claim one field, is
   **ambiguous**: both show a picker and neither is pre-set.
5. `questionsFor` re-runs **every unit check on the new file's values, even
   with a remembered mapping**. A remembered answer is pre-selected, but a
   mixed column still fails. An answer the new data contradicts (for example
   "percent" remembered, but every value ≤ 1) is asked again.
6. Required: `address`, plus a price column or a status column; else refuse
   with the reason. Nothing is ever half-imported.
7. After a successful Import (not on Cancel), with "Remember this layout as
   [label]" ticked (the default), the mapping is saved as `{ source, columns:
   { [normHeader]: fieldId|'none' }, answers, statusMap, uses, savedAt }`.
   Once recognised, the sheet shows "Mapped as *label*, used N times · Change".

## 4. Dedup and provenance

`addressKey(c)`: lower case, `#`, `.` and `,` removed, whitespace collapsed;
the last word through a small suffix table (street→st, avenue→ave, road→rd,
boulevard→blvd, drive→dr, lane→ln, place→pl, court→ct, parkway→pkwy,
highway→hwy, terrace→ter, square→sq) and directions mapped (northwest→nw…),
by token maps only (no backtracking regex); then `|` + ZIP5, or the city when
there is no ZIP.

Two keys match when the streets are equal and the ZIPs (or cities) are equal,
or one side lacks both. `dupeOf(comp, existing)` compares the same kind only
(a listing that later sold is two comps). It looks at `state.sales +
state.market` (CoStar and manual) and at the earlier rows of the same file,
and returns `{ level, of, why }`:

| Case | level | Default |
|---|---|---|
| parcels intersect (normalised), dates < 183 days apart or either missing | `same` | **Skip** |
| address match, both dated, ≤ 31 days apart | `same` | **Skip** |
| address match, a date missing, prices both > 0 and within 1% | `same` | **Skip** |
| address match, 32-182 days apart, or both undated with prices > 1% apart | `possible` | **Add anyway**, with a note |
| address match, ≥ 183 days apart | `resale` | added; nothing asked |

The preview row reads "Already in the set as *X* (from costar-dc.pdf)", with a
two-button group, **Skip** / **Add anyway** (`aria-pressed`). "Use its blanks"
is C2.

**Provenance on each imported comp:** `origin = { kind:'import', source,
file, sha256, sheet, row, page:null, profile:'zlatura-comps'|null,
importedAt: ISO }`; `c.source = originText(origin)`, so the Source row
(`ui.js:975`), the CSV `Source PDF` column and the workbook's Audit Trail show
it with no layout change; `flags` starts with `imported from <source> (<file>,
row N) -- not from a CoStar report`; `manual: true`, `key: import::<base36
time><seq>`; the chip reads "imported" in place of "by hand" (`ui.js:326`).

New hand comps (`addManual`) get `origin { kind:'hand', source:'entered by
hand', … nulls, importedAt }`. Old hand comps stay without one (`originOf`
covers them).

**Decision 8 (non-rentable basis).** An imported comp whose `bsf_basis` is
`gross` or `unknown` is imported with `exclude: true` (set aside, as past-15
comps are), a chip ("gross area" / "area basis?") and the flag "building area
is gross, not rentable: set aside from $/SF until you include it". Ticking it
in is the broker's confirmation. `exportComp` then adds "gross building area,
included by the broker". This keeps it out of every $/SF figure (app,
workbook formulas, trend) **without touching `isPriced` or `workbook.js`**.

## 5. Data format (approved as decision 2)

- **New comp fields:** `origin` (above), `bsf_basis` (`BASES`; imported comps
  only), `reported_ppsf` (number|null, `toRate`). Nothing else.
- **kv `comps.mappings`** = `{ v: 1, items: { [fp]: rec } }`: at most 50
  (the oldest `savedAt` dropped), keys must match `/^[0-9a-f]{64}$/`, read
  with `kvTooNew` (`migrate.js:200`: `v > 1` is kept, unused, never
  rewritten). Add it to `backup.KV_KEYS` (`backup.js:38`). `backup.test.js` checks that
  list against `kvSet` calls. No new IndexedDB store; `DB_VERSION` stays 2.
- **Project file:** `store.VERSION` 1 → 2. `readProject` accepts versions 1
  and 2. Above 2 it keeps the existing text: "That project was saved by a
  newer version of Zlatura. Reload the page to update, then open it again."
  An older app gives the same text for a v2 file. Sessions are also written
  as `version: 2`; nothing reads that number.
- **No schema step and no `migrate.js` step** (the comp set is not a deal). A
  v1 project, session or backup opens exactly as before: no origin is added,
  nothing is written on open and there is no history entry.
- **Hostile-input normaliser** (`normCompExtras`, called from
  `compFromJSON`, so it covers session, recovery mirror, project and backup):
  `origin` not an object, or `kind` not in `ORIGIN_KINDS` → deleted;
  strings stripped of control characters and capped (`source` 80, `file` 200,
  `sheet` 31, `profile` 40); `row`/`page` integers 1-1e6 else null; `sha256`
  64 hex else null; `importedAt` must parse else null; unknown origin keys
  dropped; `bsf_basis` not in `BASES` → `'unknown'` (only when present);
  `reported_ppsf` not finite and ≥ 0 → null.
  In the importer, header text never becomes an object key: use `Map`, or
  objects with `Object.create(null)` keyed by field id. Cell text is capped
  at 200 (notes 1000) **before** any regex. At most 100 columns and 2,000
  rows, otherwise refuse ("This file has 2,345 rows; the importer reads up to
  2,000. Split it and import each part."). The total `state.manual` is also
  capped at 2,000.
- **Old-copy fixtures:** `tests/tools/make-backup-4.7.89.mjs` writes
  `tests/fixtures/backup-4.7.89-before-comp-import.json` (an invented session
  with hand comps and edits, kv without `comps.mappings`), plus
  `tests/fixtures/project-4.7.89-v1.json` (an invented v1 project). Tests: both restore or open unchanged (deep-equal manual comps, no `origin`
  added); re-saving writes version 2; a v3 project is refused with the exact
  text.

## 6. UI on Comps (phone first)

- **Drop zone.**
  - Heading: "Add comps".
  - Text: "Drop CoStar PDFs, or a CSV or Excel file of comps. Everything is
    read on this device."
  - The button "Choose PDFs" becomes "Choose files". `#file` `accept` gains
    `.csv,.tsv,.txt,text/csv,.xlsx`; its `aria-label` names comp reports,
    spreadsheets and project files.
- **Routing in `handleFiles`.** Projects, PDFs and sheets
  (`.csv`/`.tsv`/`.txt`/`.xlsx`, confirmed by `checkUpload`): PDFs go the
  CoStar way, unchanged; sheets go to `openCompImport`, one file at a time
  (more → "Import one spreadsheet at a time; the others were not read.");
  anything else: "That file isn't a comp report or a spreadsheet of comps."
- **The global drop handler** (`ui.js:1300`) today treats `.xlsx` as an output
  template on every screen. On Comps only, when its first headed sheet has ≥ 1
  data row, it asks through `actionSheet`: "Add these comps" (first) or "Use
  as my workbook template". With no data rows it is a template, as today;
  `.xlsm` is always a template; other screens and `#tpl-file` are unchanged.
- **Sheet** (`sheetOpen`, full height on a phone, sticky footer).
  **Step 1, Map**, shown when there is a question, an ambiguity, or no profile
  or mapping: the source label (text input ≤ 80, prefilled with the file's base
  name); the questions as `fieldset`/`legend` radio groups; one card per column
  with the header as written (`textContent` only), three sample cells and a
  `<select>` labelled "Use “Header” as" (recognised choices pre-set with a
  "recognised" chip; the rest *Not used*). "Continue" stays off until all is
  answered, with the reason in text beside it. **Step 2, Preview**: a counts
  line that is also an `aria-live="polite"` status ("48 rows: 41 to add (30
  sales, 11 listings), 4 already in the set, 2 left out (Leased), 3 with
  checks"); groups *To add / Already in the set / Left out / Checks*, 50 shown
  per group with "Show all N"; each row shows name, kind, price, SF and its
  checks (`LEVEL_WORD`); a fail blocks Import with the reason in text. **Step
  3, Import**: one tap; comps join `state.manual` (the example set gives way, as
  with PDFs), then `recompute` and `renderAll`; toast "Imported 41 comps from
  *label*." with Undo (`restoreSnapshot`); focus returns to the drop button.
- All targets are ≥ 44 px, every control is labelled and pickers work by
  keyboard.
- The project-save toast adds "…and any comps imported from other sources;
  share only as their licences allow."
- **Confidential.** The files never leave the device: no network, no AI. The
  file bytes are not stored, only the comps, the hash and the mapping. The
  header names in `comps.mappings` go into backups (see section 8, Risks).

## 7. Tests

`tests/compimport.test.js` and `tests/compmodel.test.js` use invented files.
They are built in the test (CSV strings; `.xlsx` through ExcelJS, as other
tests do) or kept in `tests/fixtures/comps-import/` with fictional addresses
("100 Example Street (fictional)"). They cover: the header (none, two
candidates, a "$ in thousands" preamble, the sheet choice, a missing required
column, each with its refusal text); every rule in section 2 both ways
(decimal caps ask, percent caps don't, mixed fail, `%` settles it, > 25% warns,
the NOI cross-check; a bare price asks; a Sold row with only an asking price
gets null; no price from $/SF and the 1% $/SF warn; acres ×43,560 flagged, no
unit asks, SF < 100 warns; the basis hints with GLA asking; "(000s)" and
"$12.5M" scaled, $/SF never; d/m asks, both orders fail, an Excel serial;
"Undisclosed" → null, $0 flagged; rent ignored, a listing's date ignored, the
unknown-status picker); dedup (same sale, 31 versus 32 days, 1% versus 1.1%,
parcel only, a resale at 183 days, within-file, sale versus listing kept);
provenance and `originText`; the fingerprint ignoring order and case, a
remembered mapping re-used **and re-checked**, the 50-mapping cap;
`__proto__`/`constructor`/`prototype` headers, a 10,000-character cell, control
characters, `<img onerror>` kept as text, `=1+1` kept as text and quoted by
`compsCsv`; 2,001 CSV rows and 101 columns refused; the `templateCsv()` round
trip (a `compsCsv` export of invented comps imports back to the same kind,
price, bsf, cap, occ, date and lot); every `CSV_HEADINGS` entry has a rule;
the normaliser on hostile origins.

`store`/`backup` tests: v1 and v2 projects open, v3 is refused with the exact
text, `comps.mappings` is in `KV_KEYS` and round-trips, `kvTooNew` keeps a v2
record, and the old fixtures open unchanged.

`repo.test.js`: `compimport*.js` and `compmodel.js` contain no `fetch(`,
`XMLHttpRequest`, `sendBeacon`, `WebSocket` or `EventSource`.

**Mutation checks** (each must fail a test): (1) caps ≤ 1 taken as percents
without asking; (2) a mixed cap column let through; (3) price filled from
`reported_ppsf × bsf`; (4) acres read as SF; (5) the scale dropped, or applied
to $/SF; (6) "Undisclosed" → 0; (7) the dedup window widened to 365 days or the
price band to 10%; (8) gross-basis comps imported with `exclude: false`; (9) an
asking price taken as a sale price on a Sold row; (10) the re-check skipped for
a remembered mapping; (11) `readProject` accepting version 3; (12) `normOrigin`
keeping an unknown kind; (13) `findHeader` taking the first of two candidates.

**Browser flow `tests/e2e/comps-import-flow.mjs`.** Add it to `FLOWS` in
`run.sh` (`e2e-flows-listed.test.js`). It runs on Chromium at phone (390 px)
and desktop sizes, with axe on each sheet step: `setInputFiles('#file',
mapped.csv)`; the mapper shows recognised and *Not used* columns; answer the
cap question; type the source label **one character at a time**; preview
counts, the duplicate row defaulting to Skip; Import; table counts, the
"imported" chip, the detail Source row; Undo; re-import recognised as "Mapped
as …, used 1 time"; a mixed-cap file leaves Import off with the reason shown;
an `.xlsx` with rows on Comps asks and "Add these comps" works, while one with
only headings still becomes a template; save the project → `"version":2`;
open the v1 fixture.
**Perf:** an edit at 2,000 imported comps stays within 150 ms. If it fails,
report back; do not weaken the check. `comps-flow` (CoStar) runs unchanged.

**Fails on old code:** the modules are missing, and dropping a CSV says "Those
are not PDFs". Run against `git archive` of 4.7.89 with `BASE=`.

**Golden:** `analyze-golden` and `golden.mjs --diff` must be identical (no
CoStar path or engine change).

## 8. Risks and what is out of C1

**Risks:**
- Perf of the localStorage recovery mirror (`ui.js:801-807`), which
  stringifies `state.manual` on every edit, at 2,000 comps. The perf flow
  tests it at the cap. If it fails, the remedy is a design question (cap or
  debounce the mirror), so report back.
- Header names in `comps.mappings` travel in backups. They are column
  headings, not data, but a firm's heading could name a client. The mapping
  sheet says "remembered layouts are kept in backups".
- An older app restoring a v2 backup session shows imported comps as "by
  hand". Their `origin` survives (`compFromJSON` spreads), and `exclude`
  survives, so a gross comp stays set aside. This is accepted.
- Address matching misses some variants ("One Example Plaza" versus "1
  Example Plaza"). In that case nothing is merged, and the comp is added and
  shown. A false "same" is the costlier error, so the rules lean to adding.

**Out of C1:**
- vendor and county profiles (C2 and C5, from real exports in `private/comps/`
  only);
- PDF profiles, OCR and zip;
- "Use its blanks" and staging (C2);
- lookups (C3);
- portfolio detection on imported rows;
- lease comps and rent;
- non-US number formats;
- importing several spreadsheets in one drop;
- renaming the CSV `Source PDF` heading or adding a Source column (provenance
  rides in `source`; see the question below);
- D3a "Start from documents" routing.

**For the owner (each changes what a figure means or what an export shows):**
1. **Decision 8 as built.** A gross or unknown-basis comp is set aside as a
   whole (cap rate included) until it is ticked in. The alternative keeps it
   in the set and leaves it out of $/SF only. That needs `isPriced` plus the
   workbook's `ppsfOf` and its formulas to learn `bsf_basis`: an engine change
   that is golden-safe but larger. **I recommend the set-aside for C1.**
2. **GLA is asked, not assumed rentable.** The CoStar reader takes GLA as its
   size (`costar.js:290`), which would argue for rentable. **I recommend
   asking.**
3. **The CSV export stays byte-identical.** The proposal's added Source column
   (3.4) is deferred, because provenance shows in the existing `Source PDF`
   column. **I recommend deferring it**, to keep the CSV unchanged for firms
   that read it.

# Design note: lease abstract L1 (schema, typed abstract, checks, exports)

Designer note, 2026-10-31, for the builder. It carries out the approved
proposal `docs/proposals/lease-abstract.md` (sections 2, 4, 6, 7; the owner
approved all 7 recommendations). **L1 has no reader, no OCR and no AI:** the
broker types or pastes values into the firm's layout, ticks each one beside the
page they read it on, and exports. Nothing writes to the rent roll, the key
dates or the credit record (that is L2). Golden outputs stay identical.

The owner's reference workbook under `private/leases/` was re-read for
structure only (sheet, row, column, merge and number-format counts, and the
shape of its formulas). No figure, name, address or clause text from it, or
from the PDFs, appears here, and none may appear in code, tests or fixtures.

## 1. Modules and exports

| Module | Pure? | Exports |
|---|---|---|
| `app/abstractfields.js` (new) | yes | `KINDS`, `STATUSES`, `GROUPS`, `FIELDS` (frozen array), `FIELD_BY_KEY`, `CLAUSES` (the subset with `kind: 'clause'`, in note order), `TERM_KINDS`, `OPTION_KINDS`, `BASES`, `LIMITS` |
| `app/abstracts.js` (new) | yes | `newAbstracts()`, `normAbstracts(raw)`, `abstractsOf(d)`, `emptyAbstracts(a)`, `newAbstract({ title, docs, now })`, `setValue`, `setNone`, `setNotFound`, `clearField`, `setChecked`, `setEvidence`, `addStep`/`removeStep`/`setStep`, `addTerm`/`removeTerm`, `addOption`/`removeOption`, `addClause`/`removeClause`, `addFlag`/`removeFlag`, `removeAbstract`/`restoreAbstract`, `stepMonths(step, ab)`, `stepDates(step, ab)`, `asLease(ab)`, `rentBlock(ab, termId)`, `checkAbstract(ab)`, `canUse(ab, key)`, `progress(ab)` |
| `app/abstractexport.js` (new) | yes, given ExcelJS | `buildAbstractWorkbook(ExcelJS, { deal, abstracts, portfolio })` returns bytes; `abstractCsv(deal, abstracts)`; `abstractJson(deal, abstracts, version)`; `renderAbstractPrint(box, { deal, ab, doc })` |
| `app/abstractui.js` (new) | no | `renderAbstractsCard(box, h)`, `openAbstract(h, id)` |

**Reuse, never copy:**
- `dd.js`: `cutText`, `cleanName`, the `rid()` pattern (prefix `ab_`, 12
  base-36 characters; move `rid` to an exported `rid(prefix)` in `dd.js`
  rather than copying it), `ddOf(d).docs` for linking a lease or amendment Doc.
- `lease.js`: `UNITS`, `monthlyAmount`, `addMonths`, `addDays`, `dayOf`,
  `isoOf`, `dayText`, `validateLease`, `rentSchedule`. **Export the existing
  private `monthsBetween`** (lease.js:510) unchanged; do not write a second one.
- `engine/money.js`: `toCents` (dollar totals), `toRate` ($/SF, percents).
  "Whole cents" here means what the rest of the app stores: dollar numbers
  rounded by `toCents`, not integer cents.
- `kit.js`: `parseNum`, `parsePct`, `money2`, `el`, `toast`, `openSheet`,
  `closeSheet`, `actionSheet`, `deliver`, `printed`, `downloadName`, `getXlsx`,
  `XLSX`, `localDate`. `dateinput.js`: `dateInput`, `parseDateText`, `fmtDate`.
- `exporters.js`: `cell()` for CSV; `VERSION`. `workbook.js`: export its
  `sheet()` helper and `markConfidential(wb)` (already exported) rather than
  re-styling. `brand.js`: `PRODUCT` in the workbook's creator and the print
  footer.
- `history.js`, `impact.js`, `migrate.js`, `dealui.js`, `ddui.js`: the small
  edits in sections 3 and 6 only.

## 2. Fields

**Kinds and stored value** (`Field.value`):

| kind | value | notes |
|---|---|---|
| `text` | string ≤ 200 | |
| `party` | string ≤ 200 | a legal name |
| `address` | string[] ≤ 8 lines, each ≤ 120 | notice and payment addresses |
| `clause` | string ≤ 1000 | one numbered note; the reference notes run 18 to 366 characters |
| `date` | ISO `yyyy-mm-dd` | through `dateInput` |
| `dateRel` | ISO or null, plus `Field.rel` string ≤ 200 | "the first of the month after delivery" stays text until a date is typed |
| `money` | number ≥ 0, `toCents` | `unit` per field (below) |
| `psf` | number ≥ 0, `toRate` | always with `unit` (`psf_year` or `psf_month`) and `basis` |
| `pct` | number 0 to 100, `toRate` | a percent, never a fraction and never points |
| `sf` | number > 0, `toRate` | `basis` required: `rentable`, `usable`, `gross`, `land` |
| `int` | integer ≥ 0 | months, days, a year |
| `enum` | one of the field's `opts` | |
| `bool` | true or false | |

**Field record** (as in the proposal, two additions marked *):
```
Field = { value, unit: 'month'|'year'|'psf_year'|'psf_month'|'total'|null,
          basis: 'rentable'|'usable'|'gross'|'land'|null,
          status: 'unread'|'found'|'not-found'|'ambiguous',
          confidence: null,                      // always null in L1 (no reader)
          by: 'broker', checked: false | ISO,
          src: [Src] (0-3), supersededBy: null, note: string ≤ 300,
          rel*: string ≤ 200 (dateRel only) }
Src   = { doc: Doc.id | null, page: int ≥ 1 | null, start: null, len: null,
          quote: string ≤ 240, reader: 'typed'* , ocrConf: null }
```
- The proposal's `Src` has `start` and `len` (not `start, end`); kept. In L1
  they are always null, and `reader` gains a fourth value, `'typed'`.
- **Stored sparse:** a key absent from `ab.fields` is unread. An untouched
  abstract has `fields: {}`.

**Three ways to fill a field, never a blank-as-zero:**
- **Type it** gives found.
- **"Lease says none"** gives found: money 0, bool false, text `None`. It needs
  a page or a quote, or the note "no clause".
- **"Not in lease"** gives not-found with value null; it prints "Not found in
  lease".
- **"Needs a choice"** gives ambiguous with a required note (why). Up to 3
  sources show the conflicting places.
- **Clearing** a field deletes the key (unread). It never stores 0 or "".

**Catalogue** (`FIELDS`, in this order; `key: kind [unit, basis]`):
- **parties:** `landlord: party`, `tenant: party`, `tradeName: text`,
  `guarantor: party`, `noticeTenant: address`, `noticeLandlord: address`,
  `paymentAddress: address`.
- **premises:** `propertyId: text`, `premisesAddress: text`, `suite: text`,
  `floor: text`, `sf: sf [basis]`, `proRata: pct`, `proRataCovers: text`
  (which expense the share is for; the header footnote), `measurement: text`.
- **term:** `leaseDate: date`, `possession: dateRel`, `commencement: dateRel`,
  `rentCommencement: dateRel`, `expiration: dateRel`, `termMonths: int`,
  `termText: text` (such as "extended through …"), `escalation: text` (as
  written).
- **money:** `deposit: money`, `depositForm: enum[cash, letter of credit,
  other]`, `tiAllowance: money [unit total | psf_year]`, `tiDeadline: dateRel`,
  `expenseStructure: enum[NNN, modified gross, full service gross, absolute,
  other]`, `baseYear: int`, `expenseStop: psf [psf_year, basis]`,
  `capPct: pct`, `capType: enum[cumulative, non-cumulative, not stated]`,
  `adminFeePct: pct`, `pctRentRate: pct`, `breakpoint: money [year]`,
  `breakpointNatural: bool`, `holdoverPct: pct` (of the last rent),
  `estoppelDays: int`, `assignmentFee: money`, `guarantyScope: enum[full,
  limited, none]`, `guarantyCap: money`, `guarantyEnds: dateRel`.
- **clauses** (all `clause`; `optional: true` ones are added with "Add a
  clause"):
  - **standard:** premises, commencement, rentCommencement (key
    `cRentCommencement`), baseRent (`cBaseRent`), renewal, taxesInsCam,
    pctRent, possession (`cPossession`), permittedUse, tenantUpkeep,
    landlordMaintenance, utilities, cleaningTrash, alterations, insurance,
    casualtyCondemnation, assignment, subordinationEstoppel, securityDeposit
    (`cDeposit`), lateCharge, default, holdover, guarantorClause, noticeClause;
  - **optional:** licenses, signs, landlordDefault, hazardous, broker,
    amendmentNote, rentRelief, outdoorSeating, ventilation, serviceContracts,
    exclusive, radius, coTenancy, goDark, relocation, snda.
  - Labels are our own plain words. Clause keys that would clash with a
    structured key take the `c` prefix shown.

**Structured lists on the Abstract** (each item also has `status`, `checked`,
`by`, `src`, `note` with the Field rules):
```
Term   = { id, kind: 'initial'|'renewal'|'extension'|'fmv'|'opex', label ≤ 80,
           ref ≤ 80 (section cited, as typed), doc: Doc.id|null, effective: ISO|null,
           supersedes: bool, unquantified: bool }                 ≤ 6
Step   = { id, term: Term.id, label ≤ 40 ('Year 1'), from: ISO|null, to: ISO|null,
           mFrom: int|null, mTo: int|null,        // "months 1-12" when the lease gives no dates
           amounts: { month, year, psf_year, psf_month } (each number|null, as written),
           primary: 'month'|'year'|'psf_year'|'psf_month', basis: BASES|null }   ≤ 40
Option = { id, kind: 'renewal'|'expansion'|'contraction'|'termination'|'rofr'|'rofo'|'purchase',
           count: int|null, termMonths: int|null, noticeMin: int|null, noticeMax: int|null,
           noticeUnit: 'days'|'months', relTo: 'expiration'|'commencement'|'other',
           reset: 'fmv'|'fixed'|'cpi'|'other'|null, resetPct: pct|null, resetText ≤ 300,
           fee: money|null, conditions ≤ 300 }                    ≤ 10
Clause = { id, label ≤ 60, text ≤ 1000 }  (a custom numbered note) ≤ 20
Flag   = { id, text ≤ 200, at }           (the broker's own analyst flag) ≤ 20
```
- A step amount keeps the units the lease wrote. `primary` is the one the
  rent block and L2 use, converted once by `monthlyAmount(amount, primary, sf)`.
- A `psf_*` primary with a basis other than `rentable`, or no `sf`, gives a
  null monthly amount with its reason. It is never multiplied silently.

## 3. Data format and migration (approval granted: decision 2)

```
deal.abstracts = { v: 1, items: [Abstract] }      ≤ 60 items
Abstract = { id: 'ab_'+12, leaseId: null (L2 fills), docs: [Doc.id] ≤ 10, title ≤ 120,
             asOf: ISO|null, version: 1, versions: [] (L4), fields: {}, terms: [], steps: [],
             options: [], clauses: [], flags: [], audit: [] (L3+), createdAt: ISO, updatedAt: ISO }
```
- **Migration** in `migrate.js`, after `dd-init`:
  `{ id: 'abstracts-init', field: 'schema', to: 8, since: '4.7.89', silent:
  true, kind: 'create', label: () => 'Ready for lease abstracts', needed: (d)
  => (d.schema || 0) < 8, up(d) { if (!d.abstracts) d.abstracts = { v: 1,
  items: [] }; d.schema = 8; return { rounded: [] }; } }`. Its `does` text
  follows dd-init's. `since` is the PR's own version: main is 4.7.88, so L1
  ships as 4.7.89; if another PR takes 4.7.89 first, use the next one.
- **`normAbstracts(raw)`** follows `normDd` exactly in spirit:
  - containers are made whole;
  - non-objects are dropped, repeated ids dropped, and every cap applied
    (60 abstracts, the list caps, 3 sources, quote 240, note 300, lengths
    through `cutText`);
  - unknown field keys are dropped, and unknown kinds, units, bases or
    statuses become null or `unread`;
  - a value that fails its kind's coercion (`'abc'` for money, `-5`, `NaN`,
    `Infinity`, `{}`, a bad date) becomes null. Its status becomes
    `ambiguous`, with the note "A saved value could not be read", if it was
    found, else `unread`. Never 0, and never invented;
  - `value: 0` with status not-found or unread becomes null;
  - money goes through `toCents` and rates through `toRate`;
  - `checked` keeps only an ISO-looking string ≤ 40 characters, else false;
  - `step.term` pointing at no term becomes null; doc ids are strings ≤ 40.
- **`abstractsOf(d)`** works like `ddOf`: it normalises in place only when
  the JSON differs, and creates the container when it is missing. Every
  reader goes through it (card, exports, checks). `backup.js` needs no change
  (whole deals are carried). The restore path is tested through
  `readBackup` and `planRestore`.
- **History** (`history.js`): add `emptyAbstracts(a)` (an object with no
  items). In `recordable`, `if (emptyAbstracts(out.abstracts)) delete
  out.abstracts`. In `applyChanges`, generalise the `onlyDd` rule to a map
  `{ dd: emptyDd, abstracts: emptyAbstracts }` for single-segment paths, so
  migration and first view record nothing.
- **Impact** (`impact.js`):
  - `input('abstracts', 'Lease abstracts (typed lease terms, with the page and a short quote for each)')`;
  - `NOT_CALCULATED.abstracts = 'shown on the Lease abstracts card and its own exports only; no deal figure reads it'`;
  - `inputOfPath`: `if (a === 'abstracts') return { input: 'abstracts' }`;
  - every `deliver`/`printed` call passes `map: 'none: the lease abstract as typed; no deal calculation'`.
- **Old-backup fixture:** add `tests/tools/make-backup-4.7.88.mjs`, a copy of
  the pattern in `make-backup-4.7.73.mjs`, using `git archive 028a27f`. It
  writes `tests/fixtures/backup-4.7.88-before-abstracts.json`: two invented
  deals at schema 7, one with a rent roll, a credit record and a non-empty
  `dd`, one bare. Add it to `migrate.test.js`'s version map and to `COVERS`
  (`'abstracts-init'`: every earlier version too). Bump the `SCHEMA` assertion
  to 8, and add `restore-plans` entries if that test lists fixtures.
- **Confidential deals:** every abstract export uses the existing marks
  (`markConfidential(wb)`, the print-view "CONFIDENTIAL" header and footer,
  and a `confidential: true` key in the JSON). Its toast also says "This file
  contains lease wording."

## 4. Checks (pure, `checkAbstract(ab)` gives `[{ level: 'fail'|'warn', key, text }]`)

| Rule | Level | Case that must pass, and one that must trip it (invented values) |
|---|---|---|
| R1 monthly against annual | fail on both | step `{month: 4250.00, year: 51000.00}` passes. Changing `year` to 51600.00 trips it. The rule is `abs(year/12 − month) ≤ 0.005` |
| R2 annual against $/SF | fail | `sf` 12,000 rentable, `{year: 51000, psf_year: 4.25}` passes. `psf_year` 4.50 trips it. The rule is `abs(year/sf − psf_year) ≤ 0.005` |
| R3 $/SF on a non-rentable basis | warn | the same step on `usable` SF says "per usable SF: the rent block shows no total" |
| R4 steps in a term overlap or leave a gap | fail / warn | uses `validateLease(asLease(ab))` messages, mapped to step ids. Never its own date maths |
| R5 date order | fail | the expiration on or before commencement. Rent commencement before commencement is a warn, and possession after commencement is a warn |
| R6 stated term against dates | warn | commencement 2027-01-01, expiration 2031-12-31 and `termMonths` 60 pass; 66 trips it. The rule is `abs(monthsBetween − termMonths) > 0.5` |
| R7 relative date unresolved | fail | `commencement.rel` set with value null says "depends on: …". Every step with `mFrom`/`mTo` and no dates is "unresolved until rent commencement is typed and checked" (decision 6) |
| R8 steps against the term | warn | the first step starts after rent commencement, or the last step ends before or after the expiration |
| R9 a pro-rata share without what it covers | warn | `proRata` found with `proRataCovers` unread |
| R10 a "none" with no evidence | warn | deposit 0, found, with no page, quote or note |
| R11 percent range | fail | `pct` outside 0 to 100 (the normaliser has already nulled anything non-finite) |
| R12 an ambiguous item with no note | fail | |

- **The checks never change a value.** A fail makes the item's chip "Needs your
  choice", and the item can't be ticked until it is resolved.
- **`canUse(ab, key)`** is true only when the item is found or not-found, it is
  checked, no fail names it and, for `dateRel`, the value is a real date. A
  step also needs its term's dates resolved and a non-null monthly amount. L1
  calls it only for the "ready" count and the Draft footer; L2 gates "Use" on
  it.
- **Unticking:** editing a checked item's value, unit, basis or dates clears
  `checked` and announces "Base rent, Year 2: changed, so no longer checked".
- **`stepDates(step, ab)`:** dates as typed; else, for `mFrom`/`mTo`,
  `addMonths(rentCommencement, mFrom − 1)` to `addDays(addMonths(rc, mTo), −1)`,
  only when `rentCommencement` is a checked real date; else null, with the R7
  reason. The result is shown as "from rent commencement", never stored.
- **`stepMonths`:** `mTo − mFrom + 1` when given; else
  `toRate(monthsBetween(from, to))`; else null.

## 5. Excel export (decision 5: the owner's structure, our own content)

**Single** (one abstract) and **portfolio** (every abstract on the deal, plus
a first `Summary` sheet). File names go through `downloadName`:
`<deal> lease abstract - <title>.xlsx` and `<deal> lease abstracts.xlsx`.

**One sheet per abstract,** 12 columns (A to L, widths about 18/11/15/12/14/15/13/22,
then narrow). Sheet names come from the title: no `[]:*?/\`, at most 31
characters, unique with a suffix (` (2)`).
1. **Title block**, rows 1 to 3: the title + " (as amended)" when a term
   supersedes, "As of" + `fmtDate(asOf)`, and the property line from
   `deal.figures.address`.
2. **Header grid**, rows 5 to about 11: two label/value column pairs, each
   label followed by "→". Left: tenant, property id, address, pro-rata share
   (`0.00%`, a footnote mark), SF (`#,##0`, with the basis word). Right:
   deposit, commencement, rent commencement, expiration, term text. Below it,
   the footnote "Pro-rata share covers: …".
3. **Rent block** per term, in term order: a heading row (`label`, "§" +
   `ref`, and for a superseding term "per <doc name>, effective <date>,
   supersedes the original"), then column heads: Period, From, To, Months,
   Monthly rent, Total rent, Annual rent $/SF, Weighted average.
   - **One row per step** (5 to 8 is typical; any number is allowed). From and
     To are `m/d/yyyy`. Months is a typed number (`toRate`). Monthly is
     `toCents(monthlyAmount(...))`, written as a value.
   - **Formulas, each with its cached value from our own maths:**
     `F = ROUND(E*D,2)`; `G = ROUND(E*12/<SF cell>,4)` (a reference to the
     header's SF cell, never a literal), written only when the basis is
     rentable, else the text "per <basis> SF";
     `Total: D = SUM(...)`, `F = SUM(...)`, `H = ROUND(F/(D/12)/<SF cell>,4)`.
   - Money cells use `"$"#,##0.00`, and the $/SF cells show 2 places.
   - `roundTo` is half away from zero, the same as Excel's `ROUND`, so
     `recalc.py` (tolerance 1e-6) must agree.
   - **A term marked unquantified** is a single row: "Not quantified in lease
     (§ ref)".
   - **An unresolved step** prints its period words ("Months 1–12"), "depends
     on rent commencement" in From and To, and no total.
4. **Options**, one row each: kind, count × term, the notice window ("not
   less than 6 nor more than 12 months before expiration", built from the
   numbers), and the rent reset.
5. **Notes:** "n) <Clause label>: <text>". The numbering runs over the
   standard clauses in catalogue order, then the optional and custom clauses
   that are present, one merged row (A to H) per note, wrapped. An unread
   clause prints "Not yet abstracted"; a not-found one prints "Not found in
   lease".
6. **Notice addresses:** the tenant, landlord and payment blocks, one line
   per row.
7. **Analyst flags,** column J from row 5: first the broker's own flags, then
   one line for every item that is unread, not checked, not-found, ambiguous,
   or has a fail or warn ("Rent, Year 3: monthly and annual disagree").
- **Missing values print words, never 0 or a blank cell:** "Not found in
  lease", "Not yet abstracted", or "Needs a choice". A found 0 prints "None
  ($0.00)".

**Summary sheet** (portfolio): one row per abstract with the title, tenant,
suite, SF and basis, expiration (or the relative text), current monthly rent
(the step in force on `asOf`, else blank with "no step in force"), next
critical date (the earliest of the step dates, expiration and option notice
windows after today, that are resolved), and the count of open flags.

**Injection and file safety:**
- Every text cell is written as a plain string value (`ws.getCell(a).value =
  String(s)`), never `{ formula }`, `{ hyperlink }` or `richText` built from
  typed text.
- Formulas come only from the fixed templates above, with addresses we
  compute.
- Control characters (except `\n`) are stripped, and text is cut to 32,767
  characters, the cell limit.
- The test opens the bytes with fflate and asserts that the sheet XML holds
  `<f>` only in the template cells. A typed value `=HYPERLINK("http://example.invalid")`
  comes out as a string cell.
- **CSV:** every cell through `exporters.js cell()` (the formula guard), CRLF
  line ends. Columns: abstract, section, item, value, unit, basis, status,
  checked, page. A step is one row per step, with the primary amount. Quotes
  are not in the CSV.
- **JSON:** `{ format: 'zlatura-abstracts', v: 1, app: VERSION, exportedAt,
  confidential, deal: name, abstracts: [normalised Abstract] }`, quotes
  included. It is export-only in L1; an import is out of scope.
- **Print:** `renderAbstractPrint` into the existing `#print-sheet`, in the
  same order as the sheet, with a source column ("§ ref, p.n") and the footer
  "Draft: n items not checked" until `progress(ab).open === 0`. It uses the
  existing `@media print` rules and adds only `ab-print-*` classes.

## 6. UI

- **Placement:** `dealui.js` adds `<section class="card ab-card"
  id="deal-abstracts">` right after `#deal-dd` in `main`, and calls
  `renderAbstractsCard(box, { deal, touch, stillOpen, getXlsx, docs: () =>
  ddOf(d).docs })`. `ddui.js`: a Doc of type `lease` or `amendment` gains an
  "Abstract" button. It opens that Doc's abstract, or creates one with
  `docs: [doc.id]` and the title from the file name.
- **The card is collapsed by default,** like the Documents card (`zl.ab.open`
  in localStorage). The heading is a `<button aria-expanded>` and reads
  "Lease abstracts (2)".
- **Each row:** the title, tenant, expiration, "18 of 52 checked", and the
  open flags count. Its buttons are Open, Workbook, Print, and More
  (CSV, JSON, Rename, Delete with an Undo toast via `restoreAbstract`).
- **The card's footer:** "New abstract", and "Portfolio workbook" when there
  are 2 or more abstracts.
- **The editor is a full-height sheet** (`openSheet`, the Back key closes it).
  - **The top bar:** the title, the progress text, filter chips (All, Needs
    your choice, Not checked, Not found) as `role="radiogroup"`, and the
    exports.
  - **Groups are collapsible sections** (`<h3><button aria-expanded>`), each
    with one row per field, as a card on a phone and two columns from 900px.
  - **Each field row:** a visible `<label for>`; the input for its kind (money
    is a text input with `inputmode="decimal"`, read with `parseNum`,
    redisplayed with `money2`, plus a unit `<select>`); the status chip in
    words (Unread, Found, Not found, Needs your choice, Checked); and buttons
    for "Lease says none", "Not in lease", and "Checked" (`aria-pressed`,
    disabled with a reason in `aria-describedby` while a fail names it).
  - **Evidence** is behind a "Source" disclosure: document (`select` of the
    abstract's docs), page (`inputmode="numeric"`), and quote (a `textarea`
    with `maxlength=240` and a live counter).
  - **Rent:** term cards, each with a step table on desktop and stacked step
    cards on a phone. "Add step" copies the previous step's units and starts
    the day after it ends.
- **Typing never redraws.** Values commit on `change`/blur, like `ddui`; each
  commit calls `h.touch({ what })`, so History and Undo cover it. The 150 ms
  budget is per commit with 60 abstracts on the deal.
- **Keys** (sheet only, not while an input has focus): j/k move to the
  next/previous field row, x toggles Checked, and / focuses the filter.
- **Every target is ≥ 44 px** (reuse `.btn`, `.dd-toggle`). One `aria-live="polite"`
  status line in the sheet announces each commit and check result
  ("Deposit: marked not in lease. 19 of 52 checked."). The status is never
  colour-only. Focus returns to the row after a redraw (`focuskeep.js`).

## 7. Tests (invented fixtures only; each new test fails on `git archive 028a27f`)

- **`tests/abstracts.test.js`:**
  - normaliser: hostile input (non-objects, `NaN`, `Infinity`, `-0`, `1e309`,
    a 10,000-character quote, 100 sources, a `__proto__` key, unknown kind,
    unit and basis, duplicate ids, 70 abstracts) gives caps applied and
    nothing invented; `value: 0` with not-found gives null; normalising twice
    gives the same result;
  - setters: none, not-found, clear and checked, and that an edit unticks;
  - each R1 to R12 pass/trip pair in section 4, with the boundaries at 0.005
    and 0.0051;
  - `stepDates` against relative month numbers; `canUse` truth table;
  - `asLease` feeds `validateLease` only;
  - **fast-check:** for random step amounts, `rentBlock` totals equal
    `toCents(Σ monthly × months)` and never yield a number for a null input;
    `normAbstracts` is idempotent on random JSON.
- **`tests/abstractexport.test.js`:**
  - the workbook, single and portfolio, read back with ExcelJS: the sheet
    count, names (unique, ≤ 31 characters), the header grid labels, the
    formulas present only in the F, G, D-total and H cells, and cached values
    equal to `rentBlock`;
  - "Not found in lease" in place of a 0 or a blank;
  - the injection string stays a string cell (the XML assert);
  - the CSV goes through `cell()` (`=1+1` becomes `'=1+1`);
  - the JSON round-trips through `normAbstracts`; the confidential marks.
- **Migration:** `migrate.test.js` (fixture map, COVERS, SCHEMA 8), and a new
  `dd`-style block: the 4.7.88 fixture restores unchanged apart from `schema`
  and the empty container, a `schema: 9` deal is refused, a hostile
  `abstracts` survives `readBackup`/`planRestore`, and `recordable` and
  `historyEntry` record nothing for an untouched migrated deal. `impact`:
  `analysisInput` is the same with and without abstracts.
- **Golden:** `tests/analyze-golden.test.js` and `golden.mjs --diff` identical.
- **e2e `abstract-flow`** (add to `run.sh` FLOWS; Chromium and iPhone size):
  - create from a lease Doc on the Documents card; type a header, three terms
    of steps (one relative, unresolved), clauses, an option and a flag;
  - "not in lease" and "lease says none"; tick everything except the
    unresolved one;
  - export the xlsx and recalculate it with LibreOffice (`recalc.py`);
    export the portfolio, CSV and JSON; print (the Draft footer);
  - Undo through History; reload persistence; a backup round trip;
  - axe on the card and the sheet; character-by-character typing in every
    input kind (`typing-flow` helpers); 150 ms per commit with 60 abstracts;
  - a confidential deal makes no fetch.
- **Mutation targets** (quality-gates skill; each must turn a test red):
  - not-found stored as 0;
  - the normaliser keeps `NaN` or an invalid found value as found;
  - the R1 tolerance becomes 0.05;
  - R3 skipped (usable SF times $/SF);
  - `monthlyAmount` called with the wrong unit (`year` for `month`);
  - an edit no longer unticks;
  - `canUse` ignores `rel`;
  - a quote cap of 241;
  - a CSV cell bypasses `cell()`;
  - a typed text written as `{ formula }`;
  - `G` written for a usable basis;
  - `emptyAbstracts` returns false (History records the migration);
  - the migration overwrites an existing `abstracts`.

## 8. Risks, and what is out of L1

**Risks:**
- **The schema is fixed now and every later PR fills it.** The normaliser must
  keep unknown future keys out (a newer schema is refused by `tooNew` anyway).
- **Size:** about 8 KB for a typical abstract, about 45 KB at the worst case,
  times 60 on a deal. The perf flow measures it.
- **Recalculation drift** if a cached value isn't from the same rounding as
  the formula. `recalc.py` catches it.
- **Phone layout of the step table:** stacked cards; checked by the
  mobile-audit flow.
- **Lease wording in backups:** the deal's confidential flag is inherited.

**Out of L1:**
- Use taps, rent roll, key dates, `.ics` and the credit record (L2);
  structured abatements (L2; `freeRent` is a clause note for now);
- any reading, OCR, quotes found by the app, offsets, or "Show page" (L3);
- locators, layering, versions and diff, and an audit log (L4);
- reconciliation (L5); AI (L6); Word, and mapping the firm's blank template
  (L7);
- JSON import.

**One financial-meaning point for the owner (Part 0 rule 6),** to put in the
PR report:
- In the owner's workbook, the "annual $/SF" column is the period's total rent
  divided by SF. That equals an annual rate only for a 12-month step.
- This note writes the true annual rate (monthly × 12 ÷ rentable SF), and a
  term-weighted average in the total row.
- The two agree on 12-month steps and differ on a part year.
- *Recommend:* keep the true annual rate, and say so in the PR.

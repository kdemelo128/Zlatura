# UW bridge: the field map and the per-deal project swap (designer note for P3)

The designer note that `uw-embed-as-is.md` (sections 5, 8 and 9) requires
before **P3, Bridge in**, is built. It also previews the way back (P5), which
gets its own gate. **Status: proposed. Nothing is built.** Every name and
figure here is invented. Package paths are written `pkg/<file>:<line>` and
mean `private/uw-claude-zip/x/public/tool/<file>`. The package is private:
this note lists only field names and units (structure). No code, figures,
template or firm content are quoted.

**Prior art:** none searched, on purpose. The map is unit and money logic,
which must be Zlatura's own code (working rules: never outside code for
money). It reuses `engine/money.js` (`roundTo`, `toCents`, `toRate`),
`units.js` (`rentReading`), `rentrollui.js` `rowsToLeases`,
`t12.js` `importStatement`, `intake.js` `markUsed`, and two browser APIs
(Web Locks, IndexedDB). No new library.

## 1. The filler's model, as its own code uses it

The filler keeps **one project** as JSON in `localStorage['uw-v3']`. It reads
it once, when its page loads (`pkg/editor.js:2`), and writes it on every
`save()` (same line), with a second writer in `pkg/scenario-library.js:8`.
The clear action in `pkg/fresh-start.js:2` removes it. It never listens for
changes to the key from elsewhere. The model starts from `UW.blank()`
(`pkg/model.js:6`).

**How a blank behaves (this decides every rule below):**
- **In the arithmetic, blank becomes 0.** The helper `n` (`pkg/model.js:3`)
  turns `''`, `null` and text into 0, so a blank area, rent or rate is
  calculated as zero. The same applies to TI, LC and CapEx
  (`pkg/finance.js:8`).
- **In the stored model, a blank survives as `''` or `null`**, except in
  three places where it is lost:
  - statement months are copied into `accounts[].sourceMonths` through `n`
    (`pkg/model.js:15`), so a blank month is stored as 0;
  - `addTenant` and `addAccount` (`pkg/model.js:17-18`) store **0** for SF,
    rent, CAM, step rent and the annual base, so "not entered yet" looks
    like a typed zero;
  - the financing panel merges `UWFinance.defaults()` into the stored
    `finance` the first time it opens (`pkg/workspace-ui.js:7`). After that,
    an invented default (M4 in the proposal) can't be told from a typed
    value, except through `changeLog` (below).
- **"Not set" for overrides** is `''` or `null` (`own`, `pkg/model.js:4`).
- **Rates are stored as decimals.** The percent/decimal choice on screen is
  for display only (`pkg/rate-inputs.js:1-4`).
- **`changeLog`** (`pkg/model-journal.js:2-5`) keeps up to 100 entries of
  changed paths (for example `finance.saleCost`), each cut to 60 paths. It
  is the only on-model sign that the broker set a value. It is lossy.

**Fields that matter, with unit and period (filler side):**

| Group | Field | Type | Unit, period | Where its code shows it |
|---|---|---|---|---|
| property | `version` | number | shape version, 3 | `pkg/model.js:6` |
| | `name`, `address` | text | one address string | `:6`, `:13` |
| | `asOf` | ISO date | rent roll as-of | `pkg/editor.js:27` |
| | `mode` | `'In-place'` or `'Pro forma'` | view choice | `pkg/model.js:29` |
| | `years`, `forecastStart`, `sourceYear` | years | display years | `:6`, `:70` |
| | `coverage` | whole months, 1-12 | statement months; annualises ×12/coverage | `:43`, `:70` |
| | `credit` | decimal, 0-1 | share of **base rent** lost | `:56`, `:70` |
| | `vacantTarget`, `leaseupYears`, `leaseupStart` | decimal, years, year | lease-up of vacant suites | `:25` |
| | `marketPSF` | $ per SF **per year** | property market rent | `:25` (÷12), `pkg/editor.js:5` |
| | `cap`, `caps[3]` | decimals | the filler's valuation caps, typed in percent | `pkg/editor.js:20`, `:27` |
| | `overrides` | `{rowKey: $}` | one **month** of a computed row | `pkg/model.js:19-21`, `:41` |
| | `facts` | `{label: {value, source}}` | free text, not calculated | `pkg/editor.js:34` |
| tenants[] | `unit`, `tenant`, `status` | text; `'Occupied'` or `'Vacant'` | | `pkg/model.js:14`, `:17` |
| | `sqft` | number | SF as the rent roll prints it; area basis not recorded | `:49`, `:62` |
| | `rent` | number | **$ per month, whole space** | `:28-32`; `pkg/editor.js:5`; ×12 in `pkg/operations.js:6` |
| | `charges` | number | CAM, **$ per month** | `pkg/model.js:53`, `pkg/editor.js:5` |
| | `lease_from`, `lease_to`, `next_date` | ISO dates | UTC days; `lease_to` inclusive | `pkg/model.js:5`, `:27-28` |
| | `next_amt` | number | **$ per month** after `next_date` | `:31`, `pkg/editor.js:5` |
| | `growth`, `camGrowth` | decimals | a year, compounded by **calendar year** from `forecastStart` (or step anniversaries) | `pkg/model.js:14` (percent ÷100), `:31-32`, `:53` |
| | `camMode` | `'Fixed'`, `'Matrix'` or `'None'` | recovery method | `:51-54` |
| | `schedule[]` | `{from, to, monthly, note}` | dated rent, **$ per month**; `monthly` 0 = free base rent | `pkg/schedule-tools.js:4-5`, `pkg/model.js:30` |
| | `marketPSF`, `rentBasis`, `holdover` | $/SF/yr; `'Contract'` or `'Market'`; bool | | `pkg/model.js:28-29` |
| | `annual`, `camAnnual` | `{year: $}` | a **year's** total, spread over months | `:37`, `:54` |
| allocations[] | `basis`, `share` | `'SF'` or `'Share'`; decimal 0-1 | per tenant **per account** | `:49`, `:71` |
| | `baseStop`, `cap` | $ per **year** | stop taken off as /12 a month | `:50` |
| | `grossup`, `expenseOccupancy`, `variable`, `capGrowth` | decimals | | `:50`, `:71` |
| accounts[] | `label`, `kind`, `include` | text; one of six kinds; bool | | `:7`, `:15` |
| | `sourceTotal`, `sourceMonths[12]` | $ | as printed, over `coverage` months | `:15`, `:43` |
| | `annualBase`, `growth`, `annual` | `''` or $ a year; decimal; `{year: $}` | forecast inputs (`''` = annualise) | `:43` |
| baseline | `rr.units[]`, `st.months[12]`, `st.lines[]` | the parsed documents | `lines[].values[12]` $, `total` $ | `:13-16` |
| finance | `price`, `loan`, `closing`, `upfront` | $ | | `pkg/finance.js:4`, `:8` |
| | `rate`, `exitCap`, `saleCost` | decimals | rate **annual**, ÷12 a month | `:5-6` (rejects > 1) |
| | `loanFee` | decimal | share of **the loan** | `:8` |
| | `amortization`, `termYears`, `holdYears`, `ioMonths` | years, years, years (1-10), months | | `:5` |
| | `reserve` | $ per **year** | | `:8` |
| | `schedule{year: {ti, lc, capex}}` | $ per **year** | blank = 0 | `:8` |

Rent always sits in the model as **monthly dollars**. The filler's column
mapper divides annual columns by 12 before storing them
(`pkg/source-table.js:14`), and its PDF reader checks the monthly sum ×12
against a printed annual total (`pkg/parsers.js:109`). Monthly values from
annual sources are **unrounded floats** (an invented $100,000 a year is
stored as 8,333.333…).

**Computed, never inputs:** everything `UW.calc` returns
(`pkg/model.js:40-57`: rows, rent, cam, loss, revenue, expense, noi, totals,
occupancy, allocation values, vacantSF, sf), everything
`UWFinance.calculate` and `sensitivity` return (`pkg/finance.js:8-10`: uses,
equity, debt rows, service, balloon, balance, dscr, cash, sale, exitValue,
forwardNOI, flows, irr, multiple, ltv, ltc, debtYield, coc), `UW.checks`,
`UWFiller.result()`, `overrides` and the `annual`/`camAnnual` overrides (each
is an edit *of* a computed row).

## 2. The field map

Zlatura conventions: percent numbers (6.5 means 6.5%), `null` for missing
(`deal.js:6-8`, `lease.js:12-13`), money to cents with half away from zero
(`engine/money.js:16-23`). Every conversion lives in `app/uwfiller/fieldmap.js`
as two pure functions per field, `toFiller` and `fromFiller`, using:
- `pct→dec`: `roundTo(v / 100, 10)`; `dec→pct`: `roundTo(v * 100, 8)` (a raw
  `0.07 * 100` is 7.000000000000001);
- money: `toCents`; rates per SF: `toRate`;
- blank: `null` (Zlatura) ↔ `''` (filler), both ways. **Never 0, never the
  filler's default.**

**Classes:** *exact* = same meaning and unit; the conversion loses nothing
beyond cents. *Lossy* = needs another field or an assumption, or loses
detail; never automatic. *None* = no counterpart; never sent, never brought
back.

| # | Filler | Zlatura | In (P3) | Out (P5) | Class |
|---|---|---|---|---|---|
| 1 | `name` | `deal.name` | copy | copy | exact |
| 2 | `address` | `figures.address`, `city`, `state`, `zip` | joined with ", " | never split | lossy |
| 3 | `asOf` | `rr.settings.asOf` | copy (ISO) | copy | exact |
| 4 | `facts['Building area (SF)']` | `figures.bsf` | a sourced fact ("Zlatura deal"); never a tenant's SF | not brought back | lossy |
| 5 | `finance.price` | `figures.price` | `toCents` | `toCents` | exact |
| 6 | `finance.loan` ($) | `loan.ltv` (% of price) | `toCents(price × ltv / 100)`, only when both are set | `toRate(loan / price × 100)`, preview shows both | lossy |
| 7 | `finance.rate` | `loan.rate` | `pct→dec` | `dec→pct` | exact |
| 8 | `finance.amortization` | `loan.amort` | copy | copy | exact |
| 9 | `finance.ioMonths` | `loan.io` (whole term or none, `engine/debt.js:30`) | not sent (Zlatura has no loan term): "set interest-only months in the filler" | 0 → `false`; anything else is shown, not brought back (M7) | lossy |
| 10 | `finance.termYears` | — | | | none |
| 11 | `finance.holdYears` (1-10) | `live.hold` (1-30) | copy when 1-10; else not sent, said | copy | exact |
| 12 | `finance.exitCap` | `live.exitCap` | `pct→dec` | `dec→pct` | exact |
| 13 | `finance.saleCost` | `live.saleCost` | `pct→dec` | `dec→pct` | exact |
| 14 | `finance.closing` ($) | `loan.closing` (% of price) | `toCents(price × closing / 100)` when price is set | `toRate(closing / price × 100)` | lossy |
| 15 | `finance.loanFee`, `upfront` | — | | | none |
| 16 | `finance.reserve` ($/yr) | `rr.settings.reservesPsf` ($/SF/yr) | would need an area basis (rentable or gross?) | | none |
| 17 | `finance.schedule` TI/LC/CapEx | — (Zlatura's are per renewal, $/SF and %) | | | none |
| 18 | `marketPSF` | `rr.settings.marketRent` with `marketUnit` | not sent | `psf_year`: copy; `psf_month`: ÷12 then `toRate`; a total unit: none | exact (psf_year) |
| 19 | `credit` (of base rent) | `rr.settings.generalVacancy` (of potential income less modelled vacancy, `lease.js:628`) | | shown; the bases differ, so the broker types it | lossy |
| 20 | `cap`, `caps` | `figures.cap` (going-in, from price and NOI) | | | none (different meaning) |
| 21 | `vacantTarget`, `leaseupYears`, `leaseupStart` | — (Zlatura leases up per lease, `leaseUpMonths`) | | | none |
| 22 | `years`, `forecastStart`, `sourceYear`, `mode`, `coverage` | — (Zlatura derives months from the statement) | | | none |
| 23 | `tenants[].unit` | `Lease.unit` | | copy | exact |
| 24 | `tenants[].tenant`, `status`, `holdover` | `Lease.tenant`, `vacant`, `status: 'Holdover'` | | copy | exact |
| 25 | `tenants[].sqft` | `Lease.sf` | | copy; **0 → `null`** (the filler itself calls 0 "area missing", `pkg/model.js:62`); an `areaEvidence` basis other than rentable is asked | exact |
| 26 | `tenants[].rent` ($/mo) | `Lease.periods` (via `rowsToLeases`) | | in the source's own unit (section 4); a $0 rent on an occupied suite is asked | lossy (floats) |
| 27 | `tenants[].charges` ($/mo) with `camMode 'Fixed'` | `Lease.recovery {method: 'fixed', amount}` ($/yr) | | `toCents(charges × 12)` | exact |
| 28 | `tenants[].camGrowth` | `Lease.recovery.growth` | | `dec→pct`, only with row 27 | exact |
| 29 | `tenants[].camMode 'Matrix'` + `allocations` | `Lease.recovery` prorata / stop / base year | | shown; the broker picks the method | lossy |
| 30 | `tenants[].lease_from`, `lease_to` | `Lease.leaseStart`, `leaseEnd` | | copy (both inclusive UTC days) | exact |
| 31 | `tenants[].schedule[]` | `Lease.periods [{start, end, rate, unit: 'month'}]` | | `toCents(monthly)`; a 0 row becomes a period at 0 with the note "free base rent (filler)" | lossy (free rent is not an abatement line) |
| 32 | `tenants[].next_date`, `next_amt` | a second documented period | | from `next_date` to `lease_to`, $/month | lossy |
| 33 | `tenants[].growth` | an escalation for `generateSteps` | | shown only: the filler compounds by calendar year, Zlatura by lease year | lossy |
| 34 | `tenants[].marketPSF` | `Lease.marketRent`, `marketUnit: 'psf_year'` | | `toRate` | exact |
| 35 | `tenants[].rentBasis`, `pool`, `annual`, `camAnnual` | — | | | none |
| 36 | `allocations[]` `baseStop`, `cap`, `grossup`, `variable`, `expenseOccupancy`, `capGrowth` | — | | | none |
| 37 | `baseline.st.lines[].label`, `values[12]`, `total` | `t12.lines[].label`, `months` (cents), `fileTotal` | | through `importStatement` (section 4) | exact |
| 38 | `baseline.st.months[12]` labels | `t12.months` (ISO) | | read by Zlatura's own `monthOf`; an undatable label becomes `Mnn` | lossy |
| 39 | `accounts[].kind`, `include` | `line.category` | | a hint in the preview; Zlatura's own matcher files the line | lossy |
| 40 | `accounts[].annualBase`, `growth`, `annual`, `timing`, `monthWeights`, `sourceMonths` | — (forecasts; `sourceMonths` lost blanks) | | | none |

**Count: 40 rows. Exact 17, lossy 13, none 10** (the none rows group about
30 filler fields). In P3 the bridge **sends** rows 1-8 and 11-14 (12 fields, of which
4 are lossy and shown as such). Rows 9, 18 and 23-40 are P5 only.

**Rules for lossy and unclear fields:**
- never guess, and never pass a lossy field without a preview line naming
  both values and units;
- a blank stays blank both ways (`null` ↔ `''`). On a **new** project, every
  sent field that Zlatura has blank is written as `''`, so the filler's
  invented default can't fill it (the merge at `pkg/workspace-ui.js:7`
  keeps `''`). The filler then shows its own "enter the …" message, which
  is the honest result. On an **existing** project, a Zlatura blank never
  clears a filler value;
- when a unit can't be established, ask: `units.js` `rentReading` and the
  UW-2 question (`rentrollui.js:1262-1266`), never a convention;
- SF is never added up into building SF, and building SF is never given to
  a tenant (Part 21.2: rentable and gross are never mixed).

## 3. Direction in (P3)

**The entry points.** The bridge, `app/uwfiller/uwbridge.js`, runs in the
parent page and reaches the frame through `iframe.contentWindow`
(same origin). It calls only these public objects, and never touches the
filler's DOM:

| Object | Used for | Where |
|---|---|---|
| `UWFiller.addFiles(list)` | hand over a file "as if dropped" | `pkg/filler.js:51`, `:387` |
| `UWEditor.commit()` | flush the model to `uw-v3` before parking it | `pkg/editor.js:30` |
| `UWEditor.model()` | read the model (shape check, P5) | `pkg/editor.js:30` |
| `UW.blank()`, `UW.addTenant`, `UW.addAccount` | seed a new project; shape fingerprint | `pkg/model.js:6`, `:17-18`, `:72` |
| `UWFinance.defaults()` | shape fingerprint; spots "starting values" | `pkg/finance.js:4`, `:11` |

Not used: `UWEditor.setFacts`, `sync`, `addLease`, `applyLease` and
`UWFiller.setDocuments`. They would bypass the filler's own review, or leave
its address and cap boxes stale. Its `propertySync` reads those boxes back
into the model (`pkg/editor.js:27`).

**Files.** *Send to filler* on a UW-1 item (`intake.js` `stage`, state
`staged`):
1. open the deal's slot (below) and wait for the frame's `load` event, with
   `UWFiller.addFiles` present;
2. read `item.file.arrayBuffer()`, then copy it into **the frame's own
   realm**: a new `ArrayBuffer` and `Uint8Array` made from
   `contentWindow`. The filler's JSZip and readers type-check their input,
   and a parent-realm buffer may fail those checks;
3. call `addFiles([{ name, arrayBuffer: () => frame Promise of that buffer }])`.
   `addFiles` reads only `name` and `arrayBuffer()` (`pkg/filler.js:51-60`),
   zips included;
4. when it resolves, call `markUsed(plan, id)` and label the item "sent to
   filler". If it rejects, the item stays `staged`, with a plain message.

Nothing enters the deal.

**Facts.** *Fill in filler* shows a preview: each field, Zlatura's value with
its unit, what the filler will get with its unit, and, if the project
already holds a different value, a per-field "replace" box (off by default).
Applying it:
1. parks the project (below);
2. edits only the JSON, as in section 2;
3. writes it back and reloads the frame, so the filler's own load path
   (`pkg/editor.js:2`, `:20`) fills its boxes.

The previous JSON is kept as `prev` for *Undo*. A new deal's project is
seeded with `UW.blank()`, called in the frame with the key cleared, so the
seed is always the loaded version's own blank.

**Not sent:** computed figures (NOI, cap, DSCR, IRR from `analyze`), notes,
CRM, fees, credit, abstracts, other deals' files, and typed leases or T-12
lines that have no file (a gap, Q2). **Confidential deals are bridged:**
the frame's CSP allows no outside connection (`connect-src 'self' blob:
data:`), so nothing leaves the device. The bridge refuses *Send to filler*
and *Fill in filler* for a deal where `aiReason(deal)` (`intake.js:182`) is
set, if the served CSP ever allows an outside `connect-src`, or if filler AI
(Q4 of the proposal) is on without patch E6 (Q1 here).

**Where projects are kept.** A new IndexedDB database, `zlatura-uwfiller`
(separate from `zlatura`, so never in a backup, `backupui.js:106`). It has one
store, `projects`, keyed by `slot`:

    { slot: 'deal:<id>' | 'scratch:<id>' | 'orphan:<ms>', json: string | null,
      prev: string | null, pkg: '<hash first 12>', shape: '<fingerprint>',
      savedAt: ms, bytes: n }

`json` is the filler's text exactly as it was. It is never parsed into a deal.
A marker, `localStorage['zl.uwfiller.slot'] = {slot, pkg, at}`, says whose
project is sitting in `uw-v3`. It lives in the same storage as `uw-v3`, so
both change in the same turn. It is not in `LOCAL_KEYS`, so it is never
backed up.

**The swap, step by step.**
- **Open(slot):**
  1. take the Web Lock `zlatura-uwfiller` (exclusive, `ifAvailable`). If
     another tab holds it, say "The filler is open in another Zlatura tab"
     and stop. With no `navigator.locks`, refuse: "This browser can't keep
     two tabs apart."
  2. **Recover:** if the marker names another slot and `uw-v3` holds text,
     park that text under the marker's slot first. If `uw-v3` holds text and
     there is **no** marker (the filler was used before P3, or on its own),
     park it as `orphan:<ms>` and tell the broker "A filler project not tied
     to a deal was kept; choose a deal for it, or delete it." It is never
     attached to the open deal silently.
  3. write `projects[slot].json` to `uw-v3`, or remove the key if there is
     none, then write the marker, then load the frame.
- **Park** (switching deal, closing the card, `pagehide`, before *Fill*,
  before a delete):
  1. `UWEditor.commit()` in try/catch;
  2. remove the frame, so it can write nothing more;
  3. read `uw-v3`;
  4. `put` `{json, prev: old json}`;
  5. only when the `put` succeeds, remove `uw-v3` and the marker.

  A crash anywhere leaves the marker and `uw-v3` in place, and the next
  Open recovers them (step 2).
- **Full screen:** the bridge opens the tab with `window.open` and keeps the
  handle. It parks a copy first, keeps the marker and the lock, and shows
  "This deal's filler is open full screen". Switching deals is blocked until
  the handle reports `closed`, checked on `focus` and `visibilitychange`,
  never on a timer. It then re-parks `uw-v3` under the same slot. If the
  handle is lost (Zlatura reloaded), a `storage` event on `uw-v3` while no
  frame is live means another window is writing. Swaps stay blocked until
  the broker confirms "I closed it".
- **Two Zlatura tabs:** the lock decides. Only one tab ever swaps.
- **Deal deleted:** park it if it is open. The project stays while the deal
  is in the trash (`store.js:664`, 30 days, restorable), and is deleted when
  `sweepTrash` (`store.js:632`) purges the deal. That is one line in
  `store.js` calling `uwbridge.forget(slot)`. `deleteScratch` does the same
  for `scratch:<id>`.
- **Package erased** (P1's *Erase package*): projects are kept (they are the
  broker's work) and say "load the package to open". *Delete everything on
  this device*, when it exists, deletes the database, the marker, `uw-*`
  and `uw_key` (gate G3; no such action exists in `app/` today).
- **Backup restore with "Replace everything":** projects whose deal no
  longer exists are listed as orphans. They are never moved onto another
  deal.
- **Size:** `localStorage` is shared with Zlatura's own keys. If writing
  `uw-v3` throws (quota), the swap stops with the project kept in IndexedDB:
  "This project is too large to open here; save a project download from
  the filler." The broker's work is never cut down to fit.

## 4. Direction out (P5 preview; P5 has its own gate)

*Bring into the deal* reads `UWEditor.model()` once, copies **only the
allow-listed keys** of section 2 (refusing `__proto__`, `constructor` and
`prototype`, and checking each type), and routes each group through an
existing door, with a preview, Data QC, *Use* and Undo:
- **Tenants:** a table made from the model, with one header per field,
  goes to `rowsToLeases` (`rentrollui.js:1208`). The rent header names a
  unit only when the source's unit is established:
  - a broker-typed tenant (`source: 'Broker input'`, typed in "Base rent /
    month") is monthly;
  - a reviewed column mapping (`baseline.rr.source.tableMapping` with
    `reviewedAt`) gives its original basis. If that basis is annual, the
    value comes back as `toCents(rent × 12)`, so $100,000 stays $100,000.00
    and doesn't drift to $99,999.96;
  - a passed sum-×12 tie-out (`pkg/parsers.js:109`) is monthly.

  Otherwise the header is a bare "Rent", and UW-2 asks.
- **Statement:** a grid made from `baseline.st` (month labels plus Total,
  one row per line) goes to `importStatement(rows, { file, source: { type:
  'filler' } })` (`t12.js:587`). Signs, categories, blank-cell notes and the
  partial-year rule (#28: annualised only when the broker confirms) are
  Zlatura's. `accounts[].sourceMonths` is never read, because its blanks are
  already zeros.
- **Price, loan, hold, exit, sale cost:** rows 5-14 into the deal fields,
  with `sources[key] = { filler: true, pkg, orig }`. A finance value equal
  to the frame's `UWFinance.defaults()` with no `changeLog` path for it, and
  not sent in by Zlatura, is a **"filler starting value"**. It is shown, but
  it is not offered for *Use*.
- **Source kind:** leases get `source: { kind: 'filler', pkg }`, a new kind
  (gate G1: a `migrate.js` step and an old-backup fixture that restores
  unchanged).
- **Never stored:** everything in section 1's "computed" list. `fromFiller`
  has a deny-list test, so a key named in it can't be added to the
  allow-list.

## 5. Failure and safety rules

- **Two locks on the version.** First, the package hash (P1's allow-list),
  which `fieldmap.js` keys its map to (`MAPS[hash] = 'v3'`). Second, a
  **shape fingerprint** taken in the frame after `load`: the sorted
  `key:type` lists of `UW.blank()`, `UW.addTenant(UW.blank())`,
  `UW.addAccount(UW.blank())` and `UWFinance.defaults()`, plus the presence
  of the five entry points. It is hashed and compared with `fieldmap.js`
  `SHAPE_V3`. A mismatch turns the bridge off, and the filler still works on
  its own: "This filler version keeps its model differently from the one
  Zlatura is connected to. Nothing is sent to it or brought back from it."
  A stored project whose `version` is not 3 is never opened by the bridge.
- **The bridge never throws into the filler.** Every call into the frame is
  wrapped, and the result is `{ ok, why }`. It never replaces or wraps a
  filler global, never adds listeners inside the frame, and never touches
  its DOM.
- **Everything can be undone:** *Fill* (the `prev` JSON), *Send* (the
  filler's own remove-file; the UW-1 item can be re-staged), and P5's *Use*
  (the deal's own Undo).
- **The deal record is untouched in P3.** The golden checks (618 and 646)
  must stay identical.

## 6. Tests (all on invented stand-ins; none in CI touches the real package)

**The stand-in gains a sibling.** P1's `tests/fixtures/uwfiller-standin/`
stays unchanged, keeping its hash. A new `uwfiller-standin-model/` holds a
tiny, freshly written `public/tool` with:
- `UW.blank`, `addTenant` and `addAccount`, returning the section-1 key
  names and types;
- `UWFinance.defaults` with **different invented values** from the real
  ones, which proves the bridge reads them from the frame;
- `UWEditor.model`, `commit` and `render`, loading `uw-v3` at script start
  and saving on change;
- `UWFiller.addFiles`, which rejects a buffer not made in its own realm and
  reads an invented two-row CSV into `tenants`, with rent per month.

Its fingerprint goes into `hashes.js` as a tests-only entry. A "drifted"
copy (with `sqft` renamed) is made inside the test with `standinZip(edit)`.

| # | Test (Node unit unless marked e2e) | Fails on old code because | Mutation it kills |
|---|---|---|---|
| 1 | `loan.rate` 6.5 → `finance.rate` 0.065 exactly; `exitCap` 7 → 0.07; back: 0.07 → 7 (not 7.000000000000001) | no `fieldmap.js` | drop the ÷100 or ×100; drop the `roundTo` |
| 2 | a new project, Zlatura `saleCost` and `price` blank → filler `''`, not 0 and not the stand-in default; an existing project's value isn't cleared | the same | `?? 0`; omitting the key (so the default fills it) |
| 3 | out: charges 400/month → recovery amount $4,800.00 a year; an annual-mapped rent of 8,333.333… → $100,000.00 | the same | drop the ×12; round before ×12 |
| 4 | e2e: deal A, add an invented tenant in the stand-in, switch to deal B → 0 tenants; back to A → 1 | P1 has no swap: B shows A's tenant | skip the park, or skip the clear |
| 5 | e2e: a crash between steps (marker A, `uw-v3` A's), open B → A's project is parked under A, B opens empty; a project with no marker → `orphan:` | the same | park under the opening slot |
| 6 | e2e: full screen open → switching deals is blocked; a `storage` write with no live frame blocks swaps | the same | drop the block |
| 7 | e2e: two pages, one lock → the second is refused | the same | drop the lock |
| 8 | `fromFiller` on a model with `noi`, `irr`, `dscr`, a result object and `__proto__` keys → none appear; `Object.prototype` unchanged | no module | add a computed key to the allow-list |
| 9 | P3 e2e: the deal record is byte-identical before and after *Send* and *Fill* | — (guard) | any write to the deal |
| 10 | the drifted stand-in → bridge off with the message; the filler still loads | no fingerprint | skip the shape check |
| 11 | `addFiles` throws in the stand-in → the item stays `staged`; no error event in the frame from the bridge | no bridge | let the error propagate |
| 12 | *Fill*, then *Undo* → the project JSON is byte-identical to before | no `prev` | drop `prev` |
| 13 | delete deal → project kept; restore → back; sweep after 30 days → gone | no `forget` | forget on delete |
| 14 | `ltv` 65 on an invented $2,000,000 price → loan $1,300,000.00; price blank → loan blank; hold 12 → not sent, with the reason | no module | compute the loan from a blank price as 0 |

Every new test is also run against `git archive` of main served with
`BASE=`, and must fail there. `check:full` runs all of them, plus axe on
the strip and the card, and the perf budget for Zlatura's fields.

## 7. Questions for the owner (recommended default first)

1. **Confidential deals:** bridge them, because nothing leaves the device
   under the frame's CSP, and refuse automatically if that ever changes.
   *Default: yes.*
2. **Typed leases and T-12 lines with no file:** P3 sends files and the
   section-3 facts only; typed rent rolls are not sent. *Default: yes, gap
   listed in the acceptance matrix.*
3. **Erase package:** keep the per-deal projects. A deal's project follows
   the deal's trash and is purged with it. *Default: yes (G3).*
4. **Full screen:** one filler window at a time, and deal switching is
   blocked while full screen is open. *Default: yes.*
5. **Fill in filler on an existing project:** replace a filler value only
   where the broker ticks it. *Default: yes.*

**Not determined from the code:**
- whether the filler's PDF and spreadsheet readers keep a blank month cell
  as `null` or as 0 in `baseline.st.lines[].values` (`pkg/parsers.js` was
  grepped, not read in full). Until it is checked, P5 treats a 0 there as a
  number and says the filler doesn't record blank months;
- the area basis of `tenants[].sqft` (rentable, usable or other): the model
  doesn't record it except in the optional `areaEvidence`;
- whether a value the broker is still typing in a filler box (not yet
  "changed") is lost on a swap. The bridge doesn't touch the DOM, so it is
  not blurred. P3 hand-tests this;
- Web Locks and `storage` events inside an iframe on iPhone Safari (not
  run). The e2e covers Chromium; WebKit is hand-tested;
- how close `localStorage` is to its quota on a broker's device.

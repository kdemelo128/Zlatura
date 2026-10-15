# Data QC: one panel for every import's checks

Status: built for an OM's rent roll in 4.7.4 (Bug A). Written so Bug B (OM
operating statements) and the T-12 import can use the same parts. Approved
with Bug A's recommendations on 2026-10-14.

## What the broker sees

After an import, a small **Data QC** box: one line per check, each saying in
words **Pass**, **Check**, **Fail** or **Note** (colour only repeats it), what
was compared, and where it points. Opening "where" shows the page, line, row
and cell, the line as printed, and where the OM states the figure it was
compared with. A **Fail** holds the import back (for the rent roll: the rows
are kept on the deal but not used) until the broker resolves it there or in
Review, or taps "Accept the reading as it stands". Every Fail and Check is
also a Review Queue item with the same page, row and cell; resolving it in
either place resolves it in both.

## The data (stored on the deal, so it travels in backups and History undoes it)

A check: `{ id, kind, level: 'pass'|'warn'|'fail'|'info', text, page, line,
row, col, colLabel, cell: { text }, lineText, amount, stated?: { page, line },
resolved?: { how, at, note } }`. `id` is stable for the same reading (for the
rent roll: `total:3:5:annual`, `occ`, `scanned:4`...). The record for one
import holds its checks and whatever a Fail holds back; for the OM's rent
roll it is `deal.rrQc` (pages, columns, totals, checks, `held` rows, OCR
readings). Additive: older deals without it are untouched, and a migration
step (`rr-qc`) marks an OM rent roll read before 4.7.4 as "read before Data
QC" rather than inventing checks for it.

## The parts

- `app/dataqc.js` (pure): levels, which checks are open or blocking, counts,
  `resolveCheck` (records the resolution on the check), `whereText`,
  `resolveLabel`.
- `app/dataqcui.js`: `qcPanel({ id, title, qc, intro, blockedText,
  onResolve, onAcceptAll, extra })`. The caller says what resolving does and
  adds its own controls per line (the rent roll adds "Read this scanned page"
  and the rows OCR read).
- The checks themselves stay with the import: `reconcile.js` `rentRollQc`
  for the rent roll. Each is arithmetic or a text search; no AI.
- `app/review.js` lists open checks of a record as items (kind `rrcheck`
  today); `reviewui.js` resolves them through the same `resolveCheck`.

## Bug B (built in 4.7.5)

The OM's operating statement uses these parts: its record is `deal.omRead`
(`app/omstatement.js`), its panel `deal-omqc`, its Review kind `omcheck`;
a fail holds NOI, EGI and opex back and offers fixes
(`docs/proposals/om-statement.md`). `dataqcui.js` gained `lineWithCell`,
which marks the cell a check points to on the printed line.

## For the T-12

Give the statement import its own record (for example `deal.statementQc`)
of the same shape, produce its checks (each line against the printed
totals, NOI = EGI − expenses, the stated figures), call `qcPanel` on the deal
screen, and add its kind to `review.js`. What a Fail holds back (NOI, EGI and
opex, per Bug B's approval) is the caller's choice, as `held` is for the
rent roll.

## Tests and cost

`tests/reconcile.test.js` (the checks, holding back, Review items, applying
once resolved), `tests/e2e/omrr-flow.mjs` (the panel and the queue on a
phone, with axe). The panel adds no dependency and no network request.

# The logic for a T-12 to pro forma bridge (nothing to see yet)

This is the first of two PRs for the T-12 to pro forma bridge (7.9). It adds
the arithmetic only; the screen comes next, so a broker sees no change.

- **`app/bridge.js`:** from the T-12's normalised NOI to the OM's pro forma
  NOI, one step per category, in whole cents. Lines are matched by category,
  never forced: an OM line filed only by its place in the table gets its own
  row ("Not matched"). Two residual rows keep the sum exact to the cent: the
  T-12's rounding, and the OM's printed NOI against what its own lines add up
  to. A partial-year T-12 with a line still as reported is held, in U2's words.
  The bridge ends at the OM's printed pro forma NOI; the deal's, when it
  differs, comes back as a note (`BRIDGE_ENDS_AT` changes that).
- **Reads, not stores:** the OM's lines are read in memory (`columnLines` in
  `omstatement.js`, now also used by the checks, and `statement.columns` from
  `readOm`). Nothing new is saved on a deal or in a backup.
- **Tested:** `tests/bridge.test.js` (hand-worked rows, closure to the cent for
  every method combination against three OMs, the residual rows, unmatched
  lines, the partial-year guard, a PDF that doesn't match) and
  `tests/bridge-storage.test.js` (nothing stored).

Saved results did not change: all 618 deal results and 646 displayed figures
are identical.

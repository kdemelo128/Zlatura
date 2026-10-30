# Three quiet numbers now say "can't tell": a tenant with no share, a negative sale cost, percentage rent with no breakpoint

Cash flow step A1b, the three edge cases the owner approved on 2026-10-29. A1
(4.7.74) moved each calculation into one function and changed nothing; this
changes the results in these edges on purpose.

- **A tenant with an expense recovery but no typed share and no SF.** The
  projection used to count a 0% share. Now the rent roll's "things to check"
  names the unit ("no share is typed and the space has no SF"), the projection
  leaves that lease's recovery out and says so in its notes, and nothing is
  counted as 0. Type a share, or the SF, and it counts again.
- **Recovery amounts typed as text.** A base amount, stop per SF or fixed
  amount like "abc" used to count as 0. It is now flagged the same way and
  the recovery is left out. Numeric text such as "90000" still reads as a
  number. The Recovery tool says "can't tell" for it too.
- **A blank base amount or stop per SF.** On a base-year or stop recovery a
  blank used to count as 0, so the tenant recovered the whole pool. It is now
  flagged and left out; a typed 0 still means 0. The Recovery tool says
  "can't tell" for it.
- **A negative sale cost.** The Deal screen ignored it and the DCF tool used it
  (raising the sale price), so the two disagreed. Now it is refused
  everywhere: the What-if and Underwrite fields show "Sale costs can't be
  negative" and keep nothing; the DCF, hold returns, sensitivity and residual
  land tools show the message instead of an answer; and a saved negative
  value leaves the returns out with the same note.
- **Percentage rent, natural breakpoint, zero or blank base rent.** The
  projection set the breakpoint to $0 and charged the rate on every dollar of
  sales. It now uses the breakpoint you typed (as the Percentage rent tool
  does); with none typed it is flagged and left out. The same holds when the
  base rent can't be told (a per-SF rent on a space with no SF).

Tested: `tests/engine-shared.test.js` (the pinned edges are now the intended
behaviour; each fails on 4.7.74, with a mutation check per rule),
`tests/e2e/edgecases-flow.mjs`. Golden: 646 displayed figures, 0 changed;
`analyze-golden` (618 saved results) passes unchanged. No data-format change.

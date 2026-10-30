# Quiet numbers now say "can't tell": a tenant with no share, a blank base amount, a negative sale cost, percentage rent with no breakpoint

Cash flow step A1b, the edge cases the owner approved on 2026-10-29. A1
(4.7.74) moved each calculation into one function and changed nothing; this
changes the results in these edges on purpose. A flagged lease is left out of
the figure, so the projected recoveries (or percentage rent) and NOI are
**understated until it is fixed**; the rent roll's checks say so.

| Case | Before | After |
|---|---|---|
| Base-year recovery, base amount left blank | 25,000 (the whole pool) | 0, flagged |
| Base-year recovery, base amount typed as text such as "1,000" or "abc" | 25,000 or 0 | 0, flagged |
| Base-year or stop recovery, base amount or stop negative, or only spaces | whole pool or a wrong figure | 0, flagged |
| Stop recovery with no tenant SF | 0, no flag | 0, flagged |
| No share typed and no SF | 0, no flag | 0, flagged |
| Share stored as text ("30") | its SF share, no flag | 0, flagged (the lease editor now shows the stored text) |
| Lease ending 2026-06 with a renewal and a blank base amount | 20,833 | 0, flagged |
| Natural breakpoint, $0 base rent, none typed (6% of $1.2m sales) | 72,000 | 0, flagged |
| Natural breakpoint, $0 base rent, breakpoint $1,000,000 typed | 72,000 | 12,000 (the typed breakpoint, as the tool does) |
| Hold returns with sale cost -2 | 8.87% IRR (cost treated as 0) | "—" with a note saying why |
| DCF tool with sale cost -2 | sale price raised | refused with a message |

- **A negative sale cost** is refused everywhere: the What-if and Underwrite
  fields show the message (linked to the field and announced to screen
  readers) and keep nothing; the DCF, hold returns, sensitivity and residual
  land tools show it instead of an answer; a quick underwriting or deal saved
  with a negative value opens with the message, the Levered IRR row gives that
  as its reason, and the deal brief and workbook scenario lines say why the
  IRR is "—". Rent-roll-based What-if returns note when flagged leases are
  left out.
- **The Recovery tool** asks for the base-year expenses or the expense stop by
  name when it is blank, and says a blank is not 0.
- **Beyond the approved list** (small, and flagged here so they are not a
  surprise): percentage rent that is not natural and has no breakpoint typed
  is now flagged (the figure is unchanged, it was already left out); a fixed
  recovery whose growth is text flags the lease and drops the whole fixed
  amount (before, year 1 counted and later years were 0); a typed breakpoint
  of $0 gets a light warning, because it charges every dollar of sales
  (the figure is unchanged).
- Known gap: a fixed recovery with a blank amount still counts 0 (there is
  nothing to recover); it is not flagged.

Tested: `tests/engine-shared.test.js` (each case fails on the head before,
with mutation checks), `tests/e2e/edgecases-flow.mjs` (including typing a
minus one character at a time and a record saved with -2). Golden: 646
displayed figures, 0 changed; `analyze-golden` (618 saved results) passes
unchanged. No data-format change.

# money rounds to the cent by one rule everywhere, and a T-12 line whose months don't add up to its year is flagged

Before, four modules kept their own copy of `Math.round(x * 100) / 100`
instead of the engine's `toCents`: `t12.js`, `omstatement.js`, `om.js` and
`template.js`. That copy rounds the binary number, not the decimal one:
1.005 became 1.00, 0.145 became 0.14, and a negative half cent went toward
zero. It was a second copy of the money math, which the rules forbid.

- **One rounding rule.** All four now use the engine's `toCents`: half
  away from zero, exact for decimal input.
  - `t12.js`: every month, line total, category, EGI, expenses, NOI, and
    annualizing.
  - `omstatement.js`: a statement's rows and its "use the sum of the lines"
    fix.
  - `om.js`: each figure read from an OM table, and the other columns it
    offers.
  - `template.js`: money to the cent ($/SF) written into a firm's template.
- **A new T-12 check, a flag only.** It fires when a line's shown months add
  up to more than a cent away from its shown year. That happens when the
  file holds fractions of a cent: each month is rounded on its own, the
  year once. Neither figure is changed (owner, 2026-10-15).

**What changes for a broker.** Only amounts with a third decimal, and
annualizing a T-8 (× 12 ÷ 8 = 1.5 turns an odd cent into a half cent):

| Example | Before | After |
|---|---|---|
| A T-12 month of $0.145 | $0.14 | $0.15 |
| A vacancy month of −$0.125 | −$0.12 | −$0.13 |
| A T-8's $10,000.15, annualized (exactly $15,000.225) | $15,000.22 | $15,000.23 |
| An OM's printed NOI of $10,000.005 | $10,000.00 | $10,000.01 |
| An OM's "use the sum of the lines", with a −$100.005 line | $13,000.00 | $12,999.99 |
| $1,024,215 ÷ 1,000 SF written into a template | $1,024.21 | $1,024.22 |

Amounts with two decimals never change, and nor do sums of them. Saved deals
aren't re-rounded.

**Tested.**
- **New tests:** `tests/money-rounding.test.js`, 8 tests. Seven fail on
  4.7.13. The eighth is a guard, true on both versions: every money value a
  T-12 or an OM statement keeps is whole cents, over all 8 T-12 layouts,
  all 14 OM statement cases, and a statement written to fractions of a
  cent.
- **Mutation checks**, each caught:
  - each module put back to its own rounding (`t12.js`, `omstatement.js`,
    the `om.js` figure, the `om.js` alternatives, `template.js`);
  - the flag never raised;
  - its tolerance loosened to ten cents.
- **Before and after, module by module:** every output of the 8 T-12
  layouts and 14 OM statement cases, compared field by field, old code
  against new: identical. The 22 template money2 values of the test comps:
  identical.

Saved results and figures are unchanged (golden outputs identical: 618
saved results and 646 displayed figures).

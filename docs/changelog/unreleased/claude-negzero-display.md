# A figure that shows as zero no longer shows a minus sign

A small negative number that rounds to zero used to print as "-$0", "$-0.00", "-0" or "-0.0%", and a tiny positive change printed as "+0.0%". These were display-only: the stored value was always right.

- **One rule, one helper.** `signOf` in the new `app/numtext.js` takes the sign from the formatted digits: if every digit is zero there is no sign at all (neither "-" nor "+"). It is DOM-free so `kit.js` and the exporters can both import it; it is added to the service-worker precache.
- **Fixed:** the `kit.js` formatters (`int`, `money0`, `money2`, `pct`, `signed`, `times`, `yrs`; `short` through `money0`), the comp sheet's own formatters in `exporters.js`, and the trend text in `workbook.js`. The deal brief uses the `kit.js` formatters, so it is fixed too.
- **Side effect:** a nonzero negative in the comp sheet now reads "-$5" rather than "$-5" (same as the rest of the app).
- **Unchanged:** stored values, engine results and exported workbook cell values. Excel's own number format can still show "-0.0%" for a tiny negative in a percent cell; changing that would change exports, so it is a known gap.
- **Known, separate item:** `money0(-0.5)` gives "$0" but `money0(0.5)` gives "$1", because `Math.round` rounds half up. Left as is, since changing it could move figures.
- **Next small PR:** the ad-hoc sites with the same pattern: `glance.js` (121, 229), `aifacts.js` (10, 12, 82), `t12ui.js` (444), `t12.js` (777), `omstatement.js` (265) and `engine/figures.js` (198).

Tested with `tests/format-sign.test.js` (examples, nonzero negatives kept, the comp sheet, and a seeded 10,000-value loop). Five of its six tests fail on the old code. Two mutations (the sign check back to `n < 0`, and dropping `plus`) and the exporters' own `pct` put back each turn it red. The golden check shows 646 figures, 0 changed. Saved results did not change.

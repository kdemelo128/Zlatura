# Importing a rent roll PDF now shows how it differs from the rent roll you already have

When the deal already has units, the PDF preview now lists, before you choose Replace or Add, how the PDF compares with the current rent roll.

- **Units are matched by suite**, then by tenant name for those left. The list says how many match and gives each difference with both values: rent (compared in whole cents, on the rent in place at the as-of date), SF, lease start and end, tenant, and leased versus vacant. A unit on one side only is listed alone.
- **Nothing is chosen for you and nothing changes by looking.** Replace keeps the PDF's rows (Undo brings the current roll back from History); Add keeps both; closing the sheet keeps the current roll. No second roll is stored on the deal.

Tested with unit tests for `compareRolls` (5 mutation checks, each turning a test red) and the `rrpdf-flow` browser flow (the same PDF again matches every unit; a different report lists what is only on one side). Saved deal results: golden identical. No data-format change.

# Two honest-figure fixes: rent schedule price and fee tier limits

The rent schedule divided rent by a price the app had itself worked out from NOI and the stated cap rate, so it echoed the cap back as "Cap rate". The commission calculator counted a band twice when tier limits did not rise ($5M with limits $2M then $1M gave $200,000, not $160,000).

- **Rent ÷ price uses only a typed price.** With only a derived price, the schedule card, copied text, brief and workbook sheet show "—", the note "No price entered", and never the label "Cap rate".
- **Tier limits must rise.** `commission()` returns no result for falling or repeated limits; the Tools calculator and the fee card say "Tier limits must rise" and the fee card shows no expected fee.
- Tested with Node tests (`tests/rentschedule.test.js`, `tests/calc.test.js`) and the rent-schedule, fee and tools flows. Saved deal results and displayed figures are unchanged (golden).

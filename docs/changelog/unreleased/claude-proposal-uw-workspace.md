# A design for an Underwriting tab of its own: quick underwriting and linked deals

The owner asked for underwriting outside a deal, with deals linked together.
This is a proposal only; nothing in the app changes.

- **The proposal** (`docs/proposals/underwriting-workspace.md`) covers:
  - an Underwrite tab after Deals;
  - quick underwritings that can be saved as deals later;
  - sets of linked deals, shown side by side or, for a portfolio, combined;
  - shared assumptions that each deal can override.
- **Every combined figure is defined** from the existing engine's results:
  the cap rate is total NOI ÷ total price, and the IRR is worked out on the
  added cash flows, never an average. Totals are in whole cents, and a total
  that is missing a deal says so.
- **New stored data is waiting for the owner's approval:** two kv keys,
  `uw.scratch` and `uw.sets`, carried by backups. There is no change to the
  deal record and no deal migration step.
- **Ten extras** are listed, to be approved one by one. **12 decisions** are
  listed, each with a recommendation.
- **Tests and results:** `check:quick` passes, and the golden check shows 0
  of 646 figures changed. No saved results change.

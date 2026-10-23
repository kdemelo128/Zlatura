# Listing copy for marketplaces: a deal's headline, descriptions and facts as plain text

A broker posting a deal to a marketplace retyped the figures by hand. The deal menu now has **Listing copy**, which writes them from the deal.

- **Five blocks**, each with its character count against a default limit: a headline, a short description, a long description, a highlights list and a facts block (price, price per SF, size, land, units, cap rate, NOI, occupancy, year built, zoning, parking). A block over its limit says how many characters over.
- **Copy** puts one block on the clipboard; **Save as .txt** saves all five, each under its label and count. The save appears in the Home screen's list of what was made.
- **Only the deal's own figures**, written with the same formatters as the rest of the app (whole dollars, price per SF in cents). A figure the deal doesn't have is left out, never written as 0 or a filler. A price worked out from NOI and cap rate is not written as an asking price; an NOI worked out from price and cap rate says so. The words are plain statements: no adjectives and no claims. The tenant's name is never written. The sheet says it is a draft to check against the OM, and says so firmly for the fictional sample deal.
- **Limits** are starting points (100, 250, 2,000, 1,000 and 1,000 characters), not any marketplace's published limits. `listingBlocks()` takes limits per block; the sheet does not yet let a broker change them, because that would be a saved setting.
- **Dependency map:** the new "Listing copy" document lists what it reads; the renovated, stories and parking figures are now read by something, so they leave the "not calculated" list.
- **Tested** with invented deals: `tests/listingcopy.test.js` (11 tests, with mutation checks) and `tests/e2e/listing-flow.mjs` (open the sheet, Copy, Save as .txt, axe, 24 px targets, phone width).
- **Saved results:** unchanged. No new saved field.

# Rent roll column layout no longer guessed from "multi" or "center"

The rent roll picked its starting columns from the property type's free text, and a bare "multi" or "center" misled it: "Multi-tenant office", "Multi-tenant retail" and "Multi-tenant industrial" got the apartment columns.

- **Fixed:** apartment columns only for multifamily, multi-family, apartment or residential; retail only for retail, shopping or strip center, or NNN; "center" and "multi" alone name nothing.
- **Unchanged:** blank, unrecognised or ambiguous text (more than one kind) gets the same neutral Retail columns an unknown type always got; "Mixed use" is still Mixed use. Columns stay editable.
- **Tested:** a 33-row table in `tests/rentroll-preset.test.js` (6 rows failed on the old code), two pattern mutations caught. Saved results: 618 unchanged; displayed figures: 646 compared, 0 changed.

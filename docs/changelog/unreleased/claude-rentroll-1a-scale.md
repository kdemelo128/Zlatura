# An OM rent roll printed in thousands now reads at its real rents

A rent roll headed "($ in thousands)", "($000s)" or "in millions" was read at face value: a 60.0 became a $60 rent, every row failed the range check, the whole roll was held, and "Accept as read" would have stored $60 rents. `omstatement.js` already understood scale; `omroll.js` did not.

- **Scale read from the table:** a column's own heading ("Annual Rent ($000s)") wins; otherwise a caption in the up to three lines above the header, stopping at the first line with a figure, so another table's caption is never borrowed. A second table with the same header and no caption is read in the first one's scale.
- **Only money is scaled:** annual, monthly, "Rent", market rent, recoveries and deposit, and the Total row. SF, rent per SF and shares are never scaled. Each is `toCents(value * scale)`; the cell keeps the text as printed.
- **It says so:** an info line in Data QC ("The “Annual Rent” column on page 2 is printed in thousands … read ×1,000").
- **Not guessed:** a column headed per SF ("Market Rent PSF", "CAM $/SF") is never scaled. A bare "Rent" column under a caption that fits both a rate and a scaled total ("dollars in thousands, except rent per SF") raises a failed check and holds the roll, so you are asked.
- **A wrong scale is still caught:** a caption that does not fit the figures (a "thousands" caption over full-dollar rents) scales them out of range, fails the range check and holds the roll, as before.
- **One reader for the scale:** `scaleOf` moved to `app/scale.js`; `omstatement.js` re-exports it and reads statements exactly as before.
- **Tested:** `tests/rr-scale.test.js` (14 tests; 11 fail on the old code, each part has a mutation that fails its own test); the browser flow `rrscale-flow` on the phone-size page (13 checks; 8 fail on the old app); the rent roll reader's output is identical before and after on all 26 existing fixtures; golden outputs identical (618 saved results, 646 figures). Not tested: a real OM, Safari.
- **Known limit:** the range check allows up to $3,000 per SF a year, so a wrong scale on a rent under $3 per SF a year (a ground lease) is not caught by it.
- **Saved deals:** unchanged. A roll already held from an old read stays as it was; read the OM again to get the scaled rents.

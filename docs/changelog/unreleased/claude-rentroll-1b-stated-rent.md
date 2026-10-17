# An OM's stated rent is now checked against its rent roll, and the rent roll can offer SF, units and occupancy

Two gaps from the rent roll proposal (F3 and F4). The OM's stated in-place rent was read, then thrown away (the deal has no box for it), so the rent roll check against it never ran. And a deal whose OM prints no building figures left Building SF, Units and Occupancy empty although the rent roll was read.

- **Stated rent, checked only:** the stated in-place rent now reaches the rent roll's Data QC (`The OM's $215,000 of in-place rent agrees with the rent roll's …`, or a warning with both figures and the Total row). It is not a figure: no new box, nothing new stored, no change to saved deals. Left out when a statement table read it and that table's check failed.
- **Offered, never filled:** when Building SF, Units or Occupancy is empty, the Rent roll card says what the roll supplies ("The rent roll's 6 units add up to 9,000 SF, as listed. A building's gross area can be larger.", "leased units fill 80.0% (7,200 of 9,000 SF)") with a **Use** button. Nothing fills until you tap. A box that already has a value is never offered over. A taken figure is marked as taken from the rent roll (the same mark a figure from a calculator tool carries), is one step in History, and **Undo** takes it back.
- **No self-check:** the rent roll's cross-check warnings skip a figure you took from the rent roll (it would be checked against itself).
- **Tested:** `tests/rr-stated.test.js` (10 tests; the file fails on the old code, 7 mutations each caught); the browser flow `rrstated-flow` on the phone-size page (17 checks; 11 fail on the old app); golden outputs identical (618 saved results, 646 figures).
- **Not tested:** a real OM, Safari.

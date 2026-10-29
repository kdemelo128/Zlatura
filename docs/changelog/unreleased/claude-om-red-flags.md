# The checks now ask about a missing or low management fee, payroll, free rent and unstated occupancy

Warnings and questions only: **no figure, saved result or stored field changes**. A missing line is never read as $0, and with no evidence a rule stays silent.

- **Management and payroll (6.3.5):** a T-12 with at least 4 expense lines and no management fee asks "Self-managed, or left out?"; payroll is asked about only for multifamily of 50 units or more. A fee under 2.0% of EGI, or payroll under $500 a unit a year, is a note. Silent on a net lease and while any T-12 line is still to review. A $0 management line is a low fee, not a missing one.
- **Free rent (6.3.7):** the free rent the leases document in the 12 months after the as-of date, against the T-12's concession line. Projected abatements are left out. Silent when the OM's rent line says "net of free rent"; with no T-12 it is a question only.
- **Occupancy (6.3.8):** when the OM's occupancy line says neither physical nor economic and the rent roll's leased SF and the T-12's collected rent differ by more than 5 points.
- **Settings:** five levels (`om.items.min`, `om.payroll.units`, `om.mgmt.low`, `om.payroll.low`, `om.occ.gap`).
- **Not built:** the OM-statement half (the OM's own expense, concession and reserves lines). A saved deal keeps only a count of the OM statement's rows, so it needs a stored field: left to the owner's decision.
- **Tested:** `tests/redflags.test.js` (each rule fires and stays silent, with boundaries), `impact.test.js` (every new read is on the map), `rollchecks-flow`; mutation-checked. Golden outputs unchanged.

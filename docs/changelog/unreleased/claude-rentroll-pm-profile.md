# A property manager's rent roll PDF now reads its rent, not its charges

A property manager's rent roll (Unit, Tenant, Sqft, Rent, Monthly Charges, Deposit, Lease From/To, Past Due) was held back as "not recognised": "Monthly Charges" scored as monthly rent and quietly replaced the Rent column.

- **Charges and fees are not rent.** A heading with "charges" or "fees" and no rent word is a recovery column. "Rent & Charges" in one column still fails the layout check (gross and net can't be split), so the broker is asked and nothing is guessed.
- **Two rent columns that disagree** (for example "Rent" and "Monthly Rent" reading the same way) are one failed check naming both columns and the one used; the same figure printed twice is only noted. A row that lost a column this way says so in its notes.
- **"Past Due", "Balance", "Delinquent", "Arrears" and "Prepaid"** columns are noted as not rent instead of failing; any other unknown money heading still fails.
- **A "4 Units" subtotal** is a subtotal only when its figures add up to the rows above (a tenant can be named "4 Units": a warning, kept as a row). A count that disagrees with the rows it covers fails. A count with no figures is a heading.
- **A lease-to year printed alone on the next line** ("12/31/" then "2030") is joined to its date when it sits in the Lease To column under a row with a half date; if it can't be put together safely (ends before the lease starts, or it could belong to the next row), the row gets a failed check and the year is not used.

Tested with invented PDFs (`rr-pm`, `rr-pm-sub`, `rr-pm-wrap` and variants), 11 mutation checks, each new test failing on the old code. Saved deal results: golden identical (618 results, 646 displayed figures). No data-format change.

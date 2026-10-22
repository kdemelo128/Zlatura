# A warning when the rent roll may count expense recoveries twice

A rent roll can carry an other-income line worded as a recovery (for example CAM reimbursements) while its leases also recover expenses from the operating-expense pool. Both reach the roll's projected income, so the roll's NOI would count them twice.

- **New Review Queue warning** (`rollRecoveriesTwice`): it fires only when a non-vacant lease has a recovery method other than none and an other-income line with a non-zero amount is worded as a recovery. The wording uses the T-12's own label rules, so there is one vocabulary. Blank or $0 amounts never fire it. It changes no figure; the broker decides which entry to keep.
- **Support-code check adopted.** The owner's support code had a check that fires when tenant-billed charges and per-tenant pool recoveries are both switched on for the forward NOI. The app's equivalent of billed charges is an other-income line or a fixed recovery, so the check is adopted in that form. Its month-by-month comparison of statement recoveries against billed charges is not applicable yet (the app keeps no billed-charge series; it belongs to deferred U8). Nothing from the support code is copied.
- **Pinned, not changed:** the T-12's recoveries and the roll's projected recoveries never both reach NOI (test G1); only operating expenses pass from the T-12 to the roll.
- **K40 wording** in the underwriting proposal and the acceptance matrix now says the deal engine takes management as the statement reports it.
- **Tested** with invented fixtures: R1-R5 in `tests/roll-checks.test.js`, G1 and a dependency-map case in `tests/impact.test.js`, each with a mutation check.
- **Saved results:** unchanged (618 saved deal results and 646 displayed figures identical).
- **Known edge case:** an other-income line named "Utility reimbursement" (or RUBS) fires the warning, because it is a recovery in substance. When the leases' recoverable pool excludes utilities that is a false alarm; the warning says "may" and changes no figure, but under strict review it blocks until reviewed.

# Hold filtered property-manager rent rolls for coverage review

A parsed standalone text-PDF rent roll with a unit/resident/status filter or an
explicit subset notice now has a failed coverage check in the existing preview.
Rows stay held until the broker explicitly accepts the check; Replace remains a
separate choice. All/All metadata is allowed, every filter is checked, and a
Property Filter alone is not treated as a unit filter. Tenant names, subtotal
captions and general prose do not establish report scope.

The guard reuses the current parser and QC/Use/Undo paths. Acceptance belongs to
one preview; it never pre-accepts another preview of the same document. No schema,
stored field, engine, financial formula, dependency or service is added. The
existing history records the accepted-failure count; full coverage-note text is
not permanently saved per lease. Scans and unparsed layouts are outside this slice.

Synthetic evidence: 45 reader unit tests, 42 phone/desktop browser checks with
PDF extraction, independent rent totals, cancellation, explicit acceptance,
source records, durable history/Undo and reload. Old code fails ten unit tests
and both new browser guard checks. Six deliberate guard mutations fail their
regressions. Quick/type/golden checks pass; 646 displayed figures unchanged.
Full regression evidence is recorded in the PR. Real brokerage reports, Safari,
a physical phone and Microsoft Excel are not tested here.

Coverage checks also survive an explicit document-kind override. Parsed wrapped
tenant cells are excluded from metadata checks; the filtered fixture omits a
unit, so confirmed replacement and Undo prove an actual row-set change.

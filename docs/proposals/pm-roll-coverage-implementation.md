# Property-manager report coverage: implementation of approved reader rule

The owner approved the conservative financial rules in #156 and this chat.
This slice implements rule 4 using the existing standalone PDF rent-roll path.
It does not add a new financial interpretation, parser family or saved field.

Use existing `rrdoc.js`, `omroll.js`, `rentroll.js`, `dataqc.js` and the current
preview/accept/Use/Undo UI. All are project code; no outside package or copied
code is needed. The private support code and real PM reports are unavailable
in this checkout and were not guessed or read.

Scope checks inspect unit/tenant/resident/occupancy/status filter metadata before
the first parsed row on each row-bearing page and preceding cover pages. They
check every field (All units plus an active Status filter is still held).
Unclear/blank filters need review; Property Filter alone says nothing about
which units were included. Explicit report subset/scope notices are also checked
in footers. Arbitrary tenant cells, subtotal captions and explanatory prose do
not create a coverage failure. This is parsed text-PDF coverage, not an OCR guard.

`docKind()` carries transient scope checks; `pdfRollRecord()` adds fresh copies
to existing `kind: layout`, `level: fail` QC records. Existing hold/acceptance
logic controls Use. Fresh copies are essential because `resolveCheck()` mutates
acceptance state. No monetary calculation or column substitution is introduced.

Existing row provenance keeps PDF/file/page/line. Existing import history stores
the accepted-failure count. The full coverage reason is not permanently retained
per lease; adding a stored completeness field would need separate design/review.

Validation uses invented report metadata and the existing PDF fixture writer:
All/All versus All/Occupied, multi-field and later-page filters, wrapped and footer
subset notices, negative prose/cell/subtotal cases, preview-specific acceptance,
actual positioned PDF extraction, explicit monthly base rent versus charges/zero
market rent, missing base rent, Cancel/Use/Undo and reload. Full regression and
GitHub CI remain required before calling the PR ready.

Independent review: choosing to treat an OM/statement-labelled table as a roll
does not accept its coverage; every classification with a parsed roll retains
the checks. Header boundaries and explicit-notice exclusions use all parsed
cell provenance, including tenant text above a numeric row anchor.

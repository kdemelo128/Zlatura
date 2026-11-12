# PM report coverage: follow-up to the approved reader rules

The owner approved the conservative rules in #156 and this chat. Main 4.7.141 now includes the PM profile, period/basis questions, summary exclusion and separate filtered-report replacement confirmation. This branch preserves that work and narrows its follow-up to report-scope recognition.

Use existing `rrdoc.js`, `omroll.js`, QC, preview, source history and Undo. No outside package, financial engine, saved field or schema change is needed. The private support code and real reports are unavailable in this checkout; they were not read or guessed.

A report filter is metadata before the parsed body, not arbitrary tenant text or help prose. Check every field; blank and unknown values need review. “All current” and “All occupied” remain subsets. Preserve main's named-property-filter policy and existing direct status syntax. Explicit self-identification as a filtered/subset report remains eligible in a cover or footer.

The parser optionally reports anchor and joined body lines for retained rows through a callback. `readRoll()` keeps a transient Map across candidate, summary and selected-table reads. Candidate summary rows establish that page's header boundary without entering its financial rows. Period re-reads supply their own Map, since their rows are new objects. Parser output and saved row shapes are unchanged.

Return existing `kind: subset`, `subset:page:line` checks through `layoutChecks()`; do not add a duplicate layout guard. Preserve individual acceptance, current-preview reapplication by unchanged id/text, fresh acceptance on a new preview and the separate Replace checkbox. Existing history records the accepted-failure count; full reason text is not permanently stored per lease.

Validation uses invented positioned PDFs and text: wrapped tenant cells above/below anchors, period re-read provenance, blank/unknown/all-qualified filters, summary-page metadata, negative subtotal/help prose, cover/footer notices, exact row counts and base rents, distinct three-to-two replacement, exact filename, cancellation, durable history/Undo and reload. Full regression and GitHub CI are required before calling the PR ready.

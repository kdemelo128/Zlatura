# Next document-reader slices: PDF statements and property-manager rent rolls

This is a proposal, not implemented reader behavior. It narrows R7/R8 in
`docs/proposals/document-learning-round-1.md`. Existing OCR-on-request and ZIP
intake paths already exist in main; their stale backlog labels are not evidence
that they need rebuilding. No real brokerage documents were read in this session.

## Proposed financial defaults requiring the owner's decision

1. An explicitly dated full-year actual column can enter the existing annual
   statement basis. Preserve the printed dates/year and source page; do not invent
   12 monthly values. A partial-year or unclear year remains held for confirmation.
2. Annualized, stabilized, budget, pro-forma, per-unit, per-SF and percent columns
   never become actual totals. Model output is identified and held, not imported
   as source financials. Unclear headings require the broker's choice.
3. Only an explicitly labelled base/contract rent column fills rent. Charges,
   balances and market rent do not substitute for missing base rent. A zero market
   rent does not establish zero contract rent; missing remains blank.
4. A report identifying itself as filtered or a subset has a failed completeness
   check. It cannot silently replace the full rent roll. Rows may be reviewed;
   an untitled table is offered as a possible roll only after broker confirmation.

These choices affect financial meaning, so no implementation changes it before
approval. Any required new stored field or schema change returns as a separate
reviewable design before coding. Use existing source/provenance shapes where they
suffice; never create a second engine or overwrite a typed figure silently.

## Reuse and prior art

| Candidate | License/size/maintenance | Offline/network/security | Decision |
|---|---|---|---|
| Existing `omstatement.js` + `t12.js` | Project MIT; no additional bytes/dependency | Already local; existing table, cents and QC paths | Reuse PDF positioned tables and annual statement basis |
| Existing `rrdoc.js`, `omroll.js`, `rentrollui.js` | Project MIT; no additional dependency | Already local; preview, QC and confirmation exist | Add only the missing profile and completeness checks |
| Vendored PDF.js 4.7.76 | Apache-2.0; already shipped, version recorded in THIRD_PARTY.md | Offline worker, no new destination | Keep the current parser |
| Additional parser/OCR package | Not selected | Would add review and integrity obligations | None needed or proposed |

The repository already contains the required parsing primitives. No outside code
or library is proposed; external package adoption is unnecessary for these slices.
The private support code is unavailable in this cloud checkout and was not guessed.

## Steps and checks

1. PDF statement adapter and intake route → invented actual-year, annualized,
   per-unit, pro-forma and ambiguous-heading fixtures; only the explicit actual
   total reaches the annual-basis preview. Existing monthly import is unchanged.
2. PM roll layout → invented wrapped names, month-to-month, summary page, separate
   rent/charges/market columns, subset filter and untitled stack. No duplicate
   summary rows; missing rent stays blank; incomplete reports are held.
3. Preview/Use/Undo → browser tests at phone and desktop widths; a parsed file
   changes no deal before confirmation; Undo restores the prior deal.
4. Regression → each new test fails on archived old code; hand-worked cents
   expectations, type check, saved/displayed golden outputs, full browser gate.
   Record real-file and real-phone validation separately from synthetic fixtures.

One branch/PR per adapter. Confirm Claude has not started the same modules before
editing; this chat cannot inspect its uncommitted local session. Do not merge or
deploy automatically.

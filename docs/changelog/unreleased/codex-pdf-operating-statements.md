# Read actual annual operating statements from PDF

A standalone PDF with an explicit full-year actual operating-statement column can
now be imported into the existing annual statement basis. The broker chooses its
column and answers ambiguous number formatting; figures reach the deal only after
Use is confirmed. The source page/year remain visible, with no invented months.
Annualized, pro-forma, per-unit, per-SF, percent and explicit model-output columns
stay out of actuals. Blanks and dashes are held rather than read as zero; the shared
T-12 engine performs all category, sign, subtotal and NOI checks. No new library,
stored field, schema version or financial engine is added.

Invented-fixture checks: 15 unit tests; 34 phone/desktop browser assertions,
including cancellation, provenance, Undo, reload, staging and axe. The new browser
flow fails on the archived old app. Three guard mutations are caught by the unit
suite. Quick gate passes; 646 displayed figures are unchanged. Real brokerage PDFs,
Safari, a real phone and Microsoft Excel have not been tested.

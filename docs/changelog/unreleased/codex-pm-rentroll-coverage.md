# Rent-roll coverage checks distinguish report metadata from tenant text

The PM reader on main already asks about report coverage, rent periods and base rent, and requires a separate confirmation before replacing a roll with a filtered report. This follow-up keeps those paths and fixes the scope detector: wrapped tenant names, subtotal captions and help prose are not report warnings; an empty filter or “All current” is not an unrestricted report.

Exact anchor/joined body lines come from a transient parser callback. Summary-page headers remain eligible while their parsed table rows stay outside the financial roll. Period re-reads use their own row provenance. No returned or saved row shape, financial formula, schema, dependency or service is added. Existing history and Undo are reused; full coverage-note text is not permanently saved per lease.

Tested with synthetic fixtures only: 47 reader tests plus the existing 19 PM-profile tests, 48 phone/desktop Chromium checks, and seven deliberate scope mutations. The new checks fail on archived main. Full regression evidence and exact old-code failure counts are recorded in the PR. Real reports, Safari, a physical phone and Microsoft Excel are not tested here.

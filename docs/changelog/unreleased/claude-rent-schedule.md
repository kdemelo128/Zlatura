# Net lease rent schedule, with rent over the asking price for each period

A net lease deal now shows its stated rent as a schedule: each dated rent period with its yearly and monthly rent, $/SF, the rise over the period before it, and rent over the asking price.

- **Only what the lease states.** The schedule reads the rent periods and nothing else: no period is invented after the last one, a gap shows as "No rent stated", per-SF rent with no SF shows "—" (never 0), and free rent is a note (the amount stays at contract rent).
- **Rent over price is not called a cap rate** unless the lease type says "absolute"; "NNN" alone gets a footnote saying the landlord may pay some expenses. With no price it asks for one; with more than one tenant there is a table per lease and no price column.
- **Where it shows:** a Rent schedule card on the deal page, "Copy rent schedule" (tab-separated, also in the deal menu), a Rent schedule section in the deal brief, and a Rent Schedule sheet in the deal workbook (rent over price is a formula on the Deal Analysis price).
- **Tested:** `tests/rentschedule.test.js` (hand-worked figures, workbook and brief), the impact map tests, and the `rent-schedule-flow` browser flow (values, copied text, hostile names, axe). Saved results and displayed figures are unchanged.

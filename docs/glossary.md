# Glossary and unit rules

The words the app and its code use for commercial real estate, with the unit each carries. It exists to keep Part 21.2 mix-ups out: when a name below has a unit, code, tests and screens use it the same way. Definitions follow the app (`app/engine/conventions.js` holds the settable ones); where the industry varies, the app's choice is stated.

## Units, always stated

| Quantity | Unit in the app | Do not confuse with |
|---|---|---|
| Money | dollars, whole cents (rates per SF or per unit to four decimals) | thousands or millions on a printed statement ("$ in 000s"): scaled once, at the reader |
| Rent, expenses, NOI | per year unless the name says month | the monthly figure on a rent roll or a T-12 column |
| Rent per area | $ per SF per year (a monthly figure is labelled per month) | $ per SF per month; $ per unit |
| Area | square feet (SF) | acres (43,560 SF); rentable against gross area |
| Rates | percent as the broker types it (6.25 means 6.25%) | percentage points (a change from 6% to 7% is 1 point, about 16.7% more) |
| Dates | calendar dates; "years between" is days ÷ 365.25 | months counted by hand |

## Terms

- **GPR (gross potential rent):** the rent if every unit were leased at its rent, before vacancy.
- **Vacancy and credit loss, concessions:** reductions to income. Stored negative as income reductions; counted once (a concession is not also vacancy).
- **EGI (effective gross income):** GPR plus other income and recoveries, less vacancy, credit loss and concessions.
- **Recoveries (reimbursements, CAM, pass-throughs):** tenants paying back operating costs. Income, never a negative expense.
- **Operating expenses:** taxes, insurance, utilities, repairs, contract services, management, payroll, administration, other operating. Positive numbers as costs.
- **NOI (net operating income):** EGI less operating expenses. Before debt service, capital items, TI/LC, depreciation and owner costs (the "below the line" items, kept but not in NOI).
- **Below the line:** capital expenditures, reserves, TI and leasing commissions, debt service, depreciation, owner and partnership costs.
- **Cap rate:** NOI ÷ price, as a percent. Ask whether the NOI is in place (T-12), the OM's, or forward-looking.
- **Pro forma NOI:** a projection (an OM's or the rent roll's year 1), never an actual. Compared with a T-12, never mixed with it.
- **T-12 (trailing twelve):** twelve months of actuals. A statement of fewer months is its months as read, never a year's figures unless the broker annualizes it (convention `t12.months`).
- **Rent roll:** the leases, unit by unit: suite, tenant, SF, start, end, rent. A projection from it is forward-looking, not an actual.
- **Rentable vs gross SF:** rentable is what leases are priced on; gross includes common areas and structure. Never added or divided across the two.
- **NNN, modified gross, full service:** who pays operating costs. It decides whether recoveries exist and how rent compares between leases.
- **WALT (weighted average lease term):** remaining term weighted by income or by SF (setting `walt.weight`), month-to-month leases left out or counted at zero (`walt.mtm`).
- **NER (net effective rent):** rent over the term after free rent, TI and commissions (convention `ner`).
- **DSCR / debt yield / LTV:** NOI ÷ debt service; NOI ÷ loan; loan ÷ value. Ratios and percents; debt service is annual here.
- **Break-even occupancy:** convention `breakeven`.

## Reading a number

Before using a figure, know four things: its **period** (month, year, T-n, YTD), its **basis** (actual, budget, pro forma), its **area basis** (rentable or gross) and its **sign** (income positive, cost positive as a cost, reductions negative). If the file does not say, ask; do not infer.

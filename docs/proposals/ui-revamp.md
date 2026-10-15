# Proposal 2b: the new look, behind a toggle

Status: **written, waiting for the owner's approval.** Nothing in `app/` is
changed by this proposal. Written 2026-10-15 against 4.7.5 (`main` 8fb85a3).
Wireframes: [`docs/proposals/ui/index.html`](ui/index.html).

## In one paragraph

A second look for Zlatura, switched on in **Settings → Appearance → Look**.
The current look ("Classic") stays the default and keeps working exactly as it
does now. The new look is calm: a few large cards with the numbers that matter,
everything else one tap away, a bottom bar on the phone and a left rail on the
desktop, 44-point touch targets, one accent colour. Brokers can arrange the
cards on Home and on the deal page, hide what they don't use (it goes to a
Hidden shelf, never away), pick from presets, reset, and choose an accent and a
density. Eight live charts are drawn from the shared calculation engine, each
next to the decision it informs, each with a table alternative, keyboard
control and a colour-blind-safe palette. A feature map and a browser test prove
that every existing feature can still be reached in both looks.

---

## 1. Principles, and how the brief and Part 20 are reconciled

The owner's brief asks for "Robinhood-style calm with Legend-style
customization"; Part 20 asks for "restrained colour (one accent), no generic
dashboard cards"; the owner's answer of 2026-10-14 says to follow the revamp
with the master plan's restraint. Where they could pull apart, this is how
they are held together:

| The brief says | Part 20 / restraint says | This proposal |
|---|---|---|
| Large cards with headline numbers | No generic dashboard cards | A card exists only if it answers a question a broker acts on ("what is due", "does it cover the debt"). Each Home card is an existing feature (attention, tasks, pipeline). Two of today's tiles that inform no decision ("Produced this week", "This week: tasks due") go to the Hidden shelf by default; they are not deleted. |
| Customization, accent colour | One accent | The broker picks **one** accent from five pre-tested swatches. Only one is ever in use. Links stop using a second colour (cobalt) and become ink with an underline. Status colours (good, warning, critical) are semantic and always come with a word or icon. |
| Live interactive graphs | Charts only where they inform a decision | Eight charts, each placed in the section where the decision is made (the DSCR chart sits with the loan, the rollover chart with the rent roll). No chart on Home in the default preset. |
| Robinhood-style | Original branding | No copied marks, layouts, icons or colours. The Zlatura mark, serif titles and brass accent stay. Calm comes from spacing, type and fewer things at once, not from imitation. |
| Motion | Subtle, reduced-motion option | 120–250 ms, opacity and position only, never blocks input; off with the system setting or an in-app switch. |
| Progressive disclosure | Advanced options never unreachable (20.5) | Hidden means "on the shelf, one tap away", and the feature map test fails if anything becomes unreachable. |

Four rules that every phase follows:

1. **Same features, same engine.** The new look re-arranges and re-skins the
   existing cards; it does not rewrite them. Card renderers in `home.js` and
   `dealui.js` are exported and called by both looks. Every chart number comes
   from `app/engine/` or `app/deal.js`; there is no chart-side arithmetic.
2. **Classic does not change** except for the bug fixes in section 7 that the
   owner approves (decision 9).
3. **Nothing is hidden that cannot be reached.** Tested (section 8).
4. **No empty pages.** Part 4 workspaces that don't exist yet are not in the
   navigation in either look (section 2.3).

---

## 2. Information architecture

### 2.1 Phone: bottom bar, five items

Today the phone bar has five items and grows to six when Review has work
(`index.html` lines 301–306), which squeezes each item to 65 px at 390 px wide.
The new look keeps it at five, always:

| Slot | Item | Opens |
|---|---|---|
| 1 | Home | Home (Command Center) |
| 2 | Deals | the deals list, or the open deal |
| 3 | Comps | Comps |
| 4 | Tools | the calculator library |
| 5 | More | a sheet: Review (with its count), Contacts, Templates, Settings, Keyboard shortcuts, Back up |

- Review, when something waits, shows as the **first card on Home** ("3 items
  to review") and as a count on **More**. It is also in the search palette, as
  today. (Decision 1.)
- Search stays at the top right (the ⌘K palette), as today.
- Every bar item is at least 44 × 44 pt; the bar respects the home-indicator
  safe area, as today.

### 2.2 Desktop: left rail, collapsible

From 960 px wide, the left rail replaces the bottom bar (as now). It gains
what the phone puts under More, and it can collapse to icons (Part 4 asks for
"collapsible"); the choice is saved with the layout.

```
Zlatura                     [«]   ← collapse to a 72 px icon rail
[Search or jump to…    ⌘K]
Home
Deals
Comps
Tools
Review               3            ← only while something waits (as today)
Contacts
Templates
— Workspace —
Settings
[System | Light | Dark]  4.8.x
```

Both are kept, as the owner answered on 2026-10-14: bottom bar on the phone,
left rail on the desktop.

### 2.3 Where every screen and the 12 Part 4 workspaces go

| Part 4 workspace | Exists today as | Classic look | New look | Until it exists |
|---|---|---|---|---|
| 1 Home | Home | tab / sidebar | bar slot 1, rail | — |
| 2 Live Deal | Deals (deal page, 4 sections) | tab / sidebar | bar slot 2, rail | — |
| 3 Underwriting | inside the deal: Overview figures, financing, What if, T-12 | inside the deal | inside the deal (same section names) | Its own workspace is hidden by a flag |
| 4 Comps and Market | Comps | tab / sidebar | bar slot 3, rail | Market intelligence hidden |
| 5 Documents | the OM and photos on a deal only | — | — | **hidden (flag off)** |
| 6 Tools | Tools (30 calculators) | tab / sidebar | bar slot 4, rail | — |
| 7 Capital Markets | loan sizing on the deal, debt tools | — | — | **hidden (flag off)** |
| 8 Marketing and OM | deal brief (print) on the deal | — | — | **hidden (flag off)** |
| 9 Clients and Buyers | Contacts card on Home, People on a deal | Home card | More → Contacts, rail; the same Contacts card, full page | Buyer Match hidden |
| 10 Due Diligence | key dates on a deal | — | — | **hidden (flag off)** |
| 11 Reports and Templates | Template library (Settings, deal), pipeline report (Home) | Settings, deal menu | More → Templates, rail | — |
| 12 Settings | Settings | tab / sidebar | More → Settings, rail | — |
| (Review Queue) | Review | tab when waiting | Home card + More count; rail when waiting | — |

"Contacts" and "Templates" in the new look open existing, working screens (the
Contacts card on its own page; the Template library sheet), so no empty page is
added. The four hidden workspaces are entries in a small flag table
(`app/features.js`, a code constant, not a user setting); the nav renders only
entries whose flag is on, and the feature-map test checks that no flagged-off
entry is in either nav.

Routes stay as they are (`#home`, `#deal`, `#comps`, `#tools`, `#review`,
`#settings`); the new look adds `#contacts` and `#templates`. In Classic these
two fall back to Home, as any unknown hash does today (`ui.js:70`).

---

## 3. Home and the deal page

### 3.1 Home (new look)

The default preset, "Calm" (decision 2), on a phone, top to bottom
(wireframe: [`home-phone.html`](ui/home-phone.html)):

1. **Headline**: the date, then one large sentence of real numbers:
   "6 active deals, $26.4M asking. 2 tasks due today, 1 overdue." (today's
   lede, made the hero).
2. **Review** (only while something waits): "3 items to review" → Review.
3. **Today**: Needs attention, tasks due today or overdue, and key dates in
   the next 14 days (Part 5.1 asks for 14; today's card uses 30 days, kept as
   the "Show 30 days" option). Three rows, then "Show all 7".
4. **Continue working**: the three most recent deals, each with asking price,
   cap rate and NOI from the engine (see clean-up item C2), and its next step.
5. **Pipeline**: one row per stage with a count and asking total; tap opens
   the existing board.
6. **Tasks**: the existing task list and "New task" field.

On the shelf by default: **Contacts** (also More → Contacts), **Recent
activity**, **This week** (today's "This week" and "Produced" tiles).

Presets (each is just an order and a hidden list):

| Preset | Shows |
|---|---|
| Calm (default) | Headline, Review, Today, Continue working, Pipeline, Tasks |
| Everything | every Home card, in today's order: the Classic content in the new style |
| Pipeline | Headline, Pipeline (board open), Continue working, Today |

Desktop (wireframe: [`home-desktop.html`](ui/home-desktop.html)): the left
rail, then two columns: Continue working and Pipeline on the left (two
thirds), Today and Tasks on the right (one third). A card can be "wide" (both
columns) or "narrow" on the desktop only; on the phone every card is full width.

### 3.2 The deal page (new look)

Wireframe: [`deal-phone.html`](ui/deal-phone.html). Today the phone deal page
is 5,494 px tall and the section tabs start about 700 pt down, below the first
screen (measured at 390 × 844 with the example deal). The new look:

- **A compact sticky header**: ‹ Deals, the deal's name, Undo, Redo, Excel,
  and ⋯ (Share, Deal brief, Fill my Excel template, Use as the comps subject,
  the rest of today's deal menu). Every action keeps its accessible name.
- **The headline card**: three large numbers, price, cap rate and DSCR, each
  with a one-line "why" (for DSCR: "above the 1.25x lender minimum"); a second
  line with NOI, occupancy and $/SF; "All figures" opens the full set.
- **The section switcher right under it** (sticky, 44 pt): Overview, Rent
  roll, What if, Site visit. The names stay the same in both looks (decision 15).
- **Overview widgets**, default "Underwriting" preset: What doesn't add up →
  Value across cap rates (chart) → Debt: DSCR and loan sizing (charts) → NOI
  and cash flow (chart) → T-12 against the OM (waterfall, only with a T-12) →
  Against your comps → Inputs (grouped and folded: Offering, Income, Expenses,
  Loan; each group shows a one-line summary) → Questions to ask → Pipeline,
  next steps and people.
- **Rent roll** gains the Rollover chart and Tenant mix above the grid; **What
  if** gains the Sensitivity grid.

Deal presets: Underwriting (above), Site visit (questions, photos and notes
first), Lender (headline, debt charts, NOI and cash flow, checks). The layout
is **one per device for all deals**, not per deal: a per-deal layout would
have to live inside the deal and change the deal format (decision 14).

### 3.3 Customize mode, without dragging

Wireframe: [`customize.html`](ui/customize.html). "Customize" sits at the
foot of Home and of the deal page's Overview, in Settings → Layout and in the
palette ("Customize Home").

In Customize mode:

- Each card collapses to a row with its name and four buttons: **Move up**,
  **Move down**, **Hide**, and on the desktop **Wide/Narrow**. Buttons are
  44 pt and labelled with the card's name ("Move Pipeline up").
- **Edit as a list** opens a sheet with the same list as an ordered list of
  rows (name, Up, Down, a Show switch). This is the screen-reader-first path.
- Each move is announced in a polite live region: "Pipeline, position 2 of 6".
  Focus stays on the button that was pressed, so a keyboard user can press it
  again.
- **Presets** at the top: choosing one shows what it changes before it is
  applied, and Undo is offered in a toast.
- **Hidden shelf** at the bottom: every hidden card with **Show** (puts it back
  at the end) and **Open** (shows it once in a sheet without changing the
  layout). The shelf is also in Settings → Layout. Hidden is never gone.
- **Reset this page** and, in Settings, **Reset every layout**. Both ask first
  and both can be undone from the toast.
- **Appearance shortcuts**: accent and density (also in Settings → Appearance).
- **Done** leaves the mode. Nothing in the mode changes any deal.

Dragging is not in the first build (decision 11). It may come later as an
extra for a mouse or finger, never as the only way.

### 3.4 Accent: one colour, from five tested swatches

Every swatch passes WCAG AA as text on the page in both themes (≥ 4.5:1 on
`--surface` and `--bg`), and its "ink" (text on a filled accent button) passes
too. Contrast measured with the WCAG formula (sRGB relative luminance):

| Swatch | Light | On white | Dark | On `#17191C` | Ink on accent |
|---|---|---|---|---|---|
| Brass (default) | `#8A6118` | 5.52 | `#DDB466` | 9.05 | white 5.52 / `#0F1012` 9.79 |
| Cobalt | `#2350C8` | 6.88 | `#93ACFF` | 8.04 | white / `#0F1012` |
| Teal | `#0A7064` | 5.98 | `#3FC9B6` | 8.59 | white / `#0F1012` |
| Plum | `#6E3A8C` | 7.93 | `#C9A2E0` | 8.16 | white / `#0F1012` |
| Graphite | `#3D4A5C` | 9.00 | `#B9C3D1` | 9.89 | white / `#0F1012` |

The accent is used for: focus rings, the current place in the nav, the
selected segment, the primary button in the new look, the chart's "this deal"
marker and scrub cursor. Never for data series and never for status.

The stored value is the swatch's **id** (`brass`, `cobalt`…), never a colour
string; an unknown id falls back to Brass. A colour read from a backup file can
therefore never inject CSS.

### 3.5 Density

- **Comfortable** (default): today's spacing; every tap target ≥ 44 pt.
- **Compact** (desktop with a mouse only): tighter rows and card padding for
  more on screen. On a touch screen (`pointer: coarse`) targets stay ≥ 44 pt
  whatever the setting. Text size is never reduced by density.

---

## 4. Charts

### 4.0 What all eight share

- **One small module, hand-rolled SVG, no library.** `app/viz/core.js` (scales,
  axes, direct labels, the scrub controller, the table alternative, the screen
  reader summary) and one file per chart. Estimated 10–14 KB for the core and
  3–6 KB per chart, unminified (there is no build step). The comps charts in
  `app/glance.js` (hand-rolled SVG, 277 lines) are the precedent. No new
  vendored file, so nothing to add to `VENDOR.md`. SVG rather than canvas:
  every chart here has at most a few dozen marks, SVG is accessible, prints,
  and follows CSS colour tokens for light and dark.
- **Data adapters, not maths.** `app/viz/data.js` holds one pure function per
  chart that calls the engine and returns plain rows. It is the only thing the
  chart draws, and the table alternative is built from the same rows, so the
  chart and its table cannot disagree. Adapters are tested in Node.
- **Two kinds of scrub, clearly different.**
  - *Reading*: drag along the chart (or arrow keys) to read each point; a
    readout shows the values.
  - *Trying*: on the three charts with an assumption axis (cap rate, interest
    rate, sensitivity), dragging tries a value. A chip says
    "Trying 7.25%: the deal is unchanged." The deal is never written. **Keep
    as a What-if scenario** creates a scenario through the existing What-if
    path (with its change summary), as Part 7.8 requires: scenarios are
    isolated until the user applies them (decision 7). Trials use the
    existing `withTrial()` → `analysisInput()` → `analyze()` path in
    `app/impact.js`, the one the Affects panel already uses.
- **Drill to source.** Every value in a readout that comes from an input links
  to where it came from: the OM page (existing source buttons), the T-12 line,
  or the rent roll row (the existing grid, scrolled to the lease).
- **Affects.** The readout has the existing Affects button (`impactui.js`
  `openImpact`) for the input on the chart's axis, so "what else moves if I
  change the rate" is one tap.
- **Table alternative, always.** A "Table" toggle on every chart (a real
  `<table>` with a caption and header scopes). The choice is remembered per
  chart. With the table showing, the scrubbed row is highlighted.
- **Keyboard and screen reader.** Each chart is one tab stop: a focusable
  element with `role="slider"` (Left/Right move the point, Home/End go to the
  ends, Page Up/Down move by five), whose `aria-valuetext` reads the point
  ("Year 3: NOI $419,281, cash flow after debt $137,126"). Above the SVG, a one
  sentence summary in plain text ("DSCR is 1.43x at 6.50%; it falls below the
  1.25x minimum above 7.83%"). The SVG itself is `aria-hidden` because the
  summary, slider and table carry the content.
- **Colour-blind-safe palette.** Data colours are separate from the accent:

  | Role | Light | Dark |
  |---|---|---|
  | Positive, inflow, "this deal's basis" | blue `#0072B2` (5.19:1 on white) | sky `#56B4E9` (7.63:1 on `#17191C`) |
  | Negative, outflow, "the other basis" | orange `#B85000` (5.02:1) | amber `#E69F00` (7.82:1) |
  | Reference, other, context | grey `#5F6570` (5.86:1) | grey `#979CA4` (6.38:1) |

  Taken from the Okabe–Ito set, darkened in light mode for contrast.
  Simulated with Machado et al. (2009) matrices at full severity, every pair
  stays at least 25 ΔE76 apart for protanopia, deuteranopia and tritanopia,
  in both themes (lowest: blue against grey, tritanopia, light). Colour is
  never the only cue: bars carry direct labels and signs, lines differ by
  dash, the "this deal" marker is a labelled shape, and statuses carry words.
  The accent (for example Brass, close to the dark-theme amber) only ever
  draws the "this deal" ring and the scrub cursor, both labelled, so it is not
  mistaken for a data series.
- **Performance.** A chart is computed only when it is on screen
  (IntersectionObserver), recomputed after an edit on the next animation
  frame (coalesced), and updates its existing SVG elements in place rather
  than rebuilding. Scrub moves are coalesced to one per frame. Measured today:
  `analyze()` takes a median 0.50 ms on the 500-lease deal
  (`tests/tools/analyze-bench.mjs`), so a 41-point trial curve is about 20 ms.
  Anything that needs the rent roll projection waits for the existing worker
  (`projector.js`) and shows "Working out…", never blocking. Budgets: an edit
  with every default chart on screen still updates in under 150 ms (3.7); a
  scrub step under 50 ms at the 95th percentile.
- **Missing is missing.** A chart whose inputs are missing shows what it needs
  ("Add a loan rate to see DSCR"), never a zero line (Part 21.2).

### 4.1 Value across cap rates

- **Decision:** what price range a cap-rate view supports, and where the
  asking price sits in it.
- **Source:** the engine's `ladder` figure (`engine/figures.js:153`, through
  `analyze()`), nine cap rates around the deal's own. For the continuous curve
  while trying a cap, a new engine helper `valueAtCap(noi, capPct)` is added
  to `engine/` and the `ladder` figure is changed to call it, so there is one
  formula (golden outputs must stay identical: they check every figure to the
  last digit).
- **Chart:** a line of value against cap rate, the asking price as a
  horizontal reference with a label, "this deal" marked at its cap.
- **Interactions:** try a cap rate (deal unchanged); drill to NOI's source;
  Affects for NOI and price.
- **Table:** today's "Value across cap rates" table (cap, value, $/SF, against
  asking), unchanged.
- **Tests:** adapter rows equal `analyze().ladder`; known answer for
  `valueAtCap` worked by hand (403,000 at 6.50% is 6,200,000); golden unchanged.

### 4.2 Debt: DSCR against the interest rate

- **Decision:** does the loan clear the lender's minimum, and how much rate
  movement it can absorb.
- **Source:** `analyze()` on `withTrial(deal, 'loan.rate', r)` for rates
  around the deal's (±2 points, 41 steps), reading `dscr`. The minimum is the
  deal's own `loan.minDscr` (not a fixed 1.25). Where the curve crosses the
  minimum is found by a new engine helper `sweep()` / `crossing()` in
  `engine/` (bisection on the same engine call; no new formula).
- **Chart:** DSCR line, the minimum as a dashed labelled line, the crossing
  labelled ("below 1.25x above 7.83%"), the deal's rate marked.
- **Interactions:** try a rate; Affects for `loan.rate`; drill to NOI's source.
- **Table:** rate, debt service, DSCR, "meets the minimum" (yes/no in words).
- **Tests:** adapter values equal `analyze()` on the same trial; crossing
  checked against a hand-worked case; the curve is never drawn from an
  unsaved, non-engine number (mutation: replace the call with a local
  formula → the wiring test fails).

### 4.3 Loan sizing: which test binds

- **Decision:** how much loan the deal supports and which constraint (LTV,
  DSCR, debt yield) limits it.
- **Source:** `analyze().maxLoan` (`{ loan, binding, tests }`, from
  `engine/debt.js sizeLoan`).
- **Chart:** three horizontal bars, the maximum loan under each test, direct
  labels; the binding (shortest) bar marked "binds" in words; the requested
  loan as a labelled vertical line.
- **Interactions:** reading only, plus the shared rate trial with 4.2 (the
  two charts sit together); Affects for LTV, minimum DSCR, minimum debt yield.
- **Table:** test, its limit, the maximum loan, "binds" yes/no.

### 4.4 NOI and cash flow over the hold

- **Decision:** does the deal cash-flow after debt each year, and how much of
  the return depends on the sale.
- **Source:** `runScenario(d, m, {}, { noiSeries })` in `deal.js` → `returns`
  (`nois`, `debtService`, `levered`, `exitValue`, `saleCosts`, `balance`).
  With "NOI from the rent roll", `noiSeries` comes from the projection worker,
  exactly as the What-if does today.
- **Chart:** bars of NOI per year with cash flow after debt as a second,
  labelled bar; the sale year's proceeds shown as a separate, labelled column
  so it does not dwarf the years.
- **Interactions:** reading scrub by year; drill: year 1 NOI to its source (OM
  page, T-12 or "rent roll projection: a forecast"); Affects for growth, exit
  cap, hold.
- **Table:** year, NOI, debt service, cash flow after debt, sale proceeds.
- **Labels (Part 20.6):** "Forecast" on every projected year.

### 4.5 Rollover (Rollover Radar, 9.4)

- **Decision:** how much income comes up for renewal each year, and whether
  rollover is bunched.
- **Source:** `rentRollSummary(rr, asOf).expirations` (`lease.js`): year,
  leases, SF, rent and share of rent; leases are listed from `rows`.
- **Chart:** one bar per year of rent expiring, labelled with dollars and
  percent of rent; "No date" as its own bar, never dropped.
- **Interactions:** tap a year → the tenants expiring; tap a tenant → its row
  in the rent roll grid (the plan says "its abstract and clauses": lease
  abstraction is not built, so the row is the honest target).
- **Table:** the existing expirations table.
- **Gap stated honestly:** option dates, re-leasing cost and "months of income
  exposed" are not modelled in the engine today. The first version ships
  without them; adding them is an engine change for a separate proposal
  (decision 12).

### 4.6 Tenant mix

- **Decision:** concentration risk: how much income depends on the biggest
  tenants.
- **Source:** `rentRollSummary().concentration`, `top`, `hhi`.
- **Chart:** ranked horizontal bars, top 8 tenants plus "All others", each
  with its share; vacant space shown as a separate grey bar in SF, not mixed
  with rent shares.
- **Interactions:** tap a tenant → its row; reading only (no trial).
- **Table:** tenant, unit, annual rent, share.

### 4.7 T-12 against the OM (waterfall)

- **Decision:** is the OM's NOI supported by the T-12, and which part explains
  the gap.
- **Source:** the T-12's totals (`t12.js t12ForAnalysis`) and the OM's own
  figures as kept before "Use the T-12's figures" (`d.t12Om`), the same inputs
  as the engine rule `noiOmT12` (`engine/figures.js:328`). A new engine
  function `t12OmBridge(t12, om)` returns the steps (T-12 NOI, income
  difference, expenses-without-taxes difference, taxes difference, OM NOI); the
  rule is changed to read its parts from it, so there is one copy (golden
  outputs must stay identical).
- **Shown only** when the T-12 has twelve months and no lines left to review,
  the same guard as the rule; otherwise it says why.
- **Chart:** waterfall from T-12 NOI to OM NOI; increases blue with "+",
  decreases orange with "−", totals grey; the gap labelled with the engine's
  agree/noted/warning words (`NOI_GAP`).
- **Interactions:** tap a step → the T-12 lines in that group; Affects.
- **Table:** step, T-12, OM, difference.
- **Gap stated honestly:** line by line (Part 7.9) needs the OM's own lines
  mapped to categories, which isn't built. This is the three-part version.

### 4.8 Sensitivity grid

- **Decision:** how the levered IRR responds to the two assumptions that move
  it most: price and exit cap.
- **Source:** `calc.js sensitivity(fn, xs, ys)` and `around()`, with `fn`
  calling `holdReturns()` from `deal.js` (as the IRR sensitivity tool already
  does, `toolsdefs.js:213`). A 5 × 5 grid.
- **Chart:** the grid is the chart: every cell shows its number; shading uses
  one hue's lightness only; the base case is outlined and labelled "base".
- **Interactions:** move across cells with the arrow keys (a grid with roving
  focus); "Keep as a What-if scenario" for a cell.
- **Table:** the grid is already a table (with row and column headers).
- **Not in this proposal:** the tornado chart (7.8). It needs a list of
  assumptions and ranges agreed with the owner first.

### 4.9 The existing comps charts (`glance.js`)

They gain the shared table alternative and become one tab stop each (today
every point is its own tab stop, `glance.js:60`; 30 comps make 30+ stops).
Their colours (sale blue, listing orange) already follow the same idea.

### How charts are tested

- **Node:** each adapter against the engine on invented deals (wiring); each
  new engine helper (`valueAtCap`, `sweep`/`crossing`, `t12OmBridge`) against
  hand-worked answers written into the test, never against its own output
  (Part 21.2); `tests/analyze-golden.test.js` and `golden.mjs --diff`
  identical; a palette test computes every contrast and colour-blind distance
  above from the CSS tokens and fails under the thresholds (3:1 for marks,
  4.5:1 for text, ΔE76 ≥ 20).
- **Browser:** each chart draws, its table matches its readout values, arrow
  keys change `aria-valuetext`, trying a value leaves the saved deal
  byte-for-byte unchanged, "Keep as a What-if scenario" creates exactly one
  scenario, reduced motion has no transitions, axe passes with the chart and
  the table showing, light and dark.
- **Mutation checks:** swap NOI and cash flow in an adapter; shift the years
  by one; read `1.25` instead of `loan.minDscr`; drop "No date" from the
  rollover; write the trial to the deal. Each must fail a test.

---

## 5. Motion

- Tokens: `--d1` 120 ms (hover, press, small state changes), `--d2` 200 ms
  (cards, sheets, chart marks), a new `--d3` 250 ms (the largest: a sheet
  sliding up). Nothing longer. Decelerating easing, as today.
- Only `opacity` and `transform` animate (no layout), so motion never drops
  frames during an edit.
- **Never blocks input**: no `pointer-events: none` during a transition, no
  awaiting an animation before acting; a second tap mid-animation acts at once.
- **Numbers do not animate.** A changed figure swaps instantly and gets a brief
  background tint (200 ms) so the eye sees what moved after an edit. Counting
  number animations are not used: a broker must never read a number in transit.
- Chart marks move to their new positions over 200 ms after an edit; the scrub
  cursor follows the finger with no easing.
- **Reduced motion**: the system setting (already honoured, `styles.css:1119`)
  or a new in-app switch, Settings → Appearance → Reduce motion (Part 20
  asks for an option). With it, every duration is 0 and the changed-figure
  tint becomes a static dot until the next edit.

---

## 6. Storage

| What | Where | Key | In backups |
|---|---|---|---|
| Look, accent, density, motion, rail collapsed, every page's layout, chart table toggles | IndexedDB `kv` | `ui.prefs` | Yes, automatically: backups carry every `kv` key (`backupui.js:104`, `store.kvAll`) |
| A copy of look, accent, density and motion, read before the page paints (no flash of the wrong look) | `localStorage` | `zlatura.ui` | No (rebuilt from `ui.prefs` at start) |
| Theme | `localStorage` | `zlatura.theme` | No, as today (unchanged) |

The record:

```json
{
  "v": 1,
  "look": "classic",
  "accent": "brass",
  "density": "comfortable",
  "motion": "system",
  "rail": "expanded",
  "pages": {
    "home": { "preset": "calm", "order": ["headline", "review", "today", "continue", "pipeline", "tasks"], "hidden": ["contacts", "activity", "week"], "wide": [] },
    "deal": { "preset": "underwriting", "order": ["checks", "value-cap", "debt"], "hidden": [], "wide": [] }
  },
  "tables": { "dscr-rate": true },
  "at": 1760500000000
}
```

- **Additive only.** No deal changes, no backup-format change
  (`BACKUP_VERSION` stays 2), no `migrate.js` step. A device with no
  `ui.prefs` gets the defaults, which means the Classic look.
- **Reading is forgiving.** Unknown card ids are dropped; cards added in a
  later version are appended where their preset puts them; unknown accent,
  density or motion values fall back to the defaults; nothing from the record
  is ever put into HTML or CSS as text (ids from fixed lists only).
- **Restore.** With "merge", the existing rule applies: a key the device
  already has is kept (`backup.js:174–178`), so restoring a colleague's
  backup does not rearrange this device. With "replace", the backup's layout
  comes back.
- **Approval gate:** this adds a new value to every backup file (data
  retention), so it needs the owner's yes (decision 5). Layout preferences hold
  no deal data.
- **Tests:** restore an old 4.7.3 and 4.7.4 backup fixture (the generators
  are in `tests/tools/`) → Classic, nothing lost; back up with new-look prefs
  and restore into a fresh device → the same layout; a 4.7.5 app given a
  backup with `ui.prefs` restores everything else and ignores the key; a
  corrupted `ui.prefs` (wrong types, a colour string as accent, 10,000 ids) →
  defaults, no error.

---

## 7. Clean-up of existing screens

Found by reading the code and by running the app in Chromium at 390 × 844
(iPhone size) and 1440 × 900 with the fictional example deal. Items marked
**both looks** are bugs and need the owner's yes to change Classic
(decision 9); the rest apply to the new look only.

| # | Problem (evidence) | Fix | Looks |
|---|---|---|---|
| C1 | Home's empty "Recent activity" message is squeezed into the 84 px time column, one word per line on the desktop (`home.js:414`, `.activity li` grid at `styles.css:906`) | the empty message spans both columns | both |
| C2 | Home works out cap rate itself (`home.js:19`, a second copy of `capCalc`) and shows the raw NOI (`home.js:160`); a deal with price and cap but no NOI shows NOI "—" on Home while the deal page shows the engine's derived NOI | Home reads price, cap and NOI from `analyze()` | both (changes a shown figure: the golden diff is shown for approval) |
| C3 | The T-12 card works out the NOI gap itself (`t12ui.js:125–127`), a second copy of the engine's `gap()` (`engine/figures.js:317`) | export `gap` from the engine and use it | both (no visible change) |
| C4 | Value sensitivity computes value as NOI ÷ cap inline (`toolsdefs.js:104`) | use the new engine `valueAtCap` | both (no visible change) |
| C5 | The DSCR tile is coloured by fixed thresholds 1.2 and 1.25 (`dealui.js:877`), not the deal's own lender minimum, and by colour alone: a 1.30x DSCR against a 1.35x minimum shows green while "What doesn't add up" warns | colour from the engine's check against `loan.minDscr`, plus words ("below the 1.35x minimum") | both |
| C6 | "Against your comps" marks the deal on the range bar only with a `title` (`dealui.js:933`): not available to keyboard or screen readers | a visible text line, and the bar becomes the shared chart with a table | both |
| C7 | The comps charts have no table alternative, and each point is a tab stop (`glance.js:60`) | shared table toggle; one tab stop per chart | both |
| C8 | The phone bar grows to six items when Review has work (`index.html:301–306`) | five items with More (2.1) | new |
| C9 | The phone deal page is 5,494 px tall and the section tabs start below the first screen | compact sticky header, three-number headline, switcher right under it (3.2) | new |
| C10 | On the phone deal page 81 of 92 visible controls are under 44 × 44 pt (Affects icons, `btn-sm` 30 px at `styles.css:281`, `.tri` 26 px at `:664`, chips 24 px at `:353`); on Home 17 of 25 | 44 pt on touch screens; inline icons get a larger invisible hit area so rows don't grow | new |
| C11 | Two accents and more: cobalt for links, focus and selection, brass for the current place, teal for badges (`styles.css:57–66`, `:224`, `:250`) | one chosen accent; links in ink with an underline; badges in the accent (3.4) | new |
| C12 | Home's "This week: tasks due" and "Produced: files and prints this week" tiles inform no decision (`home.js:84–87`) | on the Hidden shelf by default (not deleted) | new |
| C13 | Home's quick actions wrap ragged on the phone, right-aligned under the lede (`.quick`, `styles.css:915`) | "Read an OM" full width, "Add comps" and "New task" side by side under it | new |
| C14 | Each pipeline card on Home carries a full-width stage select | a "Move to…" button opening the stage list | new |
| C15 | Settings is one 3,852 px page on the phone | an index (Appearance, Layout, Templates, Pipeline, AI, Conventions, T-12 labels, Data, About), each opening its existing card | new |
| C16 | Tools is 30 tall cards, 3,958 px on the phone | compact 56 pt rows under their group headings; search stays on top; deal-linked tools marked in words | new |
| C17 | Screen changes replace the history entry (`ui.js:79`), so the browser's Back and the iPhone's swipe back leave the app instead of going to the previous screen | push a history entry for screen changes and for opening a deal | new (decision 10) |

The terminology audit of Part 20.6 (Actual, Estimate, Assumption, Forecast,
Pro forma) is done screen by screen as each one is restyled, starting with the
"Forecast" labels on the charts.

---

## 8. Feature map, and the test that nothing is lost

### 8.1 The map: `docs/feature-map.json`

One entry per feature a broker can reach, with how to reach it in each look,
written as accessible names (so the map also proves the controls are labelled).

```json
{
  "v": 1,
  "states": {
    "empty": "a new device",
    "deal": "the fictional example deal open",
    "deal-rr": "the example deal with a rent roll",
    "deal-t12": "the example deal with a T-12",
    "comps": "the example comp set loaded",
    "review": "a deal with T-12 lines to review"
  },
  "features": [
    {
      "id": "deal.export.excel",
      "name": "Export the deal to Excel",
      "plan": "13.4",
      "state": "deal",
      "classic": ["go:deal", "see:button:Excel"],
      "new":     ["go:deal", "see:button:Excel"],
      "controls": ["button:Excel"]
    },
    {
      "id": "home.contacts",
      "name": "Contacts: find, add and edit people",
      "plan": "17.1",
      "state": "empty",
      "classic": ["go:home", "see:heading:Contacts"],
      "new":     ["tap:button:More", "tap:link:Contacts", "see:heading:Contacts"],
      "widget": "home.contacts",
      "controls": ["button:New contact", "searchbox:Find a contact"]
    },
    {
      "id": "tool.loan",
      "name": "Loan sizing calculator",
      "plan": "11",
      "state": "empty",
      "classic": ["go:tools", "tap:button:/^Loan sizing/", "see:dialog:Loan sizing"],
      "new":     ["go:tools", "tap:button:/^Loan sizing/", "see:dialog:Loan sizing"]
    }
  ],
  "ignore": ["button:/^Example deal/", "button:/^Tenant \\d+/"]
}
```

- Verbs (a small, fixed set): `go:<view>`, `tap:<role>:<name>`,
  `open:<menu button name>` (opens a ⋯ menu), `palette:<text>` (⌘K, type,
  see the option), `see:<role>:<name>` (the end: visible and enabled). Names
  are exact text or `/regex/`.
- `widget` names the card a feature lives in. `controls` lists the controls
  that belong to the feature (for the inventory check below). `ignore` lists
  patterns for controls that are data, not features (a deal's name, a tenant).
- A Part 4 workspace that is hidden by a flag is listed with
  `"status": "flagged-off"` and no paths; the test checks it is in neither nav.
- Size: the build of phase 1 writes the full map; from the screens, the
  palette and the 30 tools, it is expected to be 150–200 entries.

### 8.2 The tests

1. **`tests/feature-map.test.js` (Node, in `npm test`)**: the map is valid
   (known verbs, unique ids, both looks present for every live feature); every
   view in `ui.js VIEWS`, every tool in `toolsdefs.js`, every fixed palette
   action in `command.js` and every widget id in the widget registry has an
   entry; no flagged-off workspace has a path.
2. **`tests/e2e/feature-map-flow.mjs` (browser)**: for each look (Classic,
   New) × each size (390 × 844 touch; 1440 × 900 mouse) × each layout
   (default; and, in the new look, **every card hidden**): load the feature's
   state, follow its path, and require the final control to be visible and
   enabled. With every card hidden, a feature with a `widget` must still be
   reachable through the Hidden shelf's **Open** or the palette. Features are
   grouped by state and screen so each page loads once per group.
3. **The inventory check (same flow)**: in each look, visit every screen,
   deal section, ⋯ menu and sheet in each state, and list every enabled
   control by role and accessible name. Every control must belong to some
   feature's `controls` or match `ignore`. A new button that nobody mapped
   fails the test, so the map cannot fall behind.

The test fails on the old code (4.7.5 has no new look, so every `new` path
fails), as CLAUDE.md requires.

### 8.3 Mutation checks for the map test (each must fail it)

| Mutation | Expected failure |
|---|---|
| Remove Tools from the new phone bar | `tools.*` unreachable: new, 390 |
| Make the shelf's "Open" do nothing | every `widget` feature unreachable with every card hidden |
| Add a "Pin deal" button to Home without mapping it | inventory: unmapped control `button:Pin deal` |
| Rename "Excel" to "Export" in the new look only | `deal.export.excel` unreachable: new |
| Delete one entry from the map | inventory: its controls become unmapped |
| Show a flagged-off workspace in the rail | "flagged-off workspace in the nav" |
| A typo in a verb (`tapp:`) | Node test: unknown verb |

---

## 9. Test plan

Every phase's PR runs everything CLAUDE.md lists. For this work in particular:

- **Both looks, both sizes.** The whole browser suite (`tests/e2e/run.sh`)
  runs as today (Classic, the default) and again with `LOOK=new`, which seeds
  `ui.prefs` before the page loads. Sizes: iPhone 390 × 844 (touch) and
  desktop 1440 × 900. Where a flow's selectors differ by look, they use
  accessible names, which both looks share by design.
- **axe** on every screen, light and dark, in both looks, with the system set
  to dark as well as the in-app dark, with a Review count showing (today's
  axe run never has one), with Customize mode open,
  the Hidden shelf showing, each chart with and without its table.
- **Targets**: in the new look on a touch screen, no interactive element under
  44 × 44 pt (the a11y flow's 24 px check, with 44 for the new look).
- **Perf** (`perf-flow`): the existing budgets (500-lease deal open < 1 s; an
  edit < 150 ms) in both looks, the new look with every default chart on
  screen; a scrub step < 50 ms p95; also at `THROTTLE=4` (a mid-range phone)
  reported, not gated.
- **Typing** (`typing-flow`): character by character for every new input: the
  trial value fields on the charts, the list editor, any number typed in
  Customize. New input types are added to the flow.
- **Golden outputs**: `tests/analyze-golden.test.js` (618) and
  `golden.mjs --diff` (646) identical on every PR, except clean-up item C2's
  Home figure if the owner approves it, shown as a before/after table.
- **Mutation checks** for the layout logic (move, hide, reset, merge of an
  old record), the adapters (4.0 list), and the map (8.3).
- **Each new test fails on the old code**, run against `git archive` of the
  previous commit served with `BASE=`.
- **Reduced motion**: with `prefers-reduced-motion` and with the in-app
  switch, no element has a non-zero transition or animation.
- **Backups** (section 6 list).

Not possible here, said up front (Part 23): Safari on a real iPhone, Firefox
and a screen reader are not available in this environment. WebKit runs are
wired (`PW_BROWSER=webkit`) but WebKit is not installed. Hand-test list for
the owner's phone with each phase.

---

## 10. Build plan: one PR per phase, all behind the toggle

| Phase | PR | What | Size |
|---|---|---|---|
| 0 | Fixes that touch Classic | C1–C6 (only those approved; C7 comes with the charts in phase 5), each golden-checked | S |
| 1 | Foundation and the map | `ui.prefs` (read, write, backup tests), the pre-paint copy, Settings → Appearance → Look, accent, density, reduce motion; new-look tokens; **the feature map, its Node test and browser test**, passing for both looks (the new look is Classic re-skinned at this point) | M |
| 2 | Navigation | phone bar with More, desktop rail (collapsible), Contacts and Templates pages, Review on Home, history entries (C17), flags table | M |
| 3 | Home | widget registry (wrapping the existing cards), presets, headline, Today card | M |
| 4 | Customize | Customize mode, list editor, Hidden shelf with Open, Reset, deal-page widgets and presets, compact header and switcher (C9) | M |
| 5 | Charts I | `viz/core.js`, adapters, palette test; Value across cap rates, DSCR, Loan sizing, NOI and cash flow; comps charts' tables (C7) | L |
| 6 | Charts II | Rollover, Tenant mix, T-12 against the OM (engine `t12OmBridge`), Sensitivity grid | L |
| 7 | Clean-up and motion | C8–C16 remaining, motion tokens, terminology pass, full regression and perf on the final code, phone hand-test list | M |

Each phase ends with the standard report, a version bump, CHANGELOG,
`PLAN_STATUS.md` and the acceptance matrix. The new look becomes the default
only when the owner says so (decision 16).

### What it costs

- **Money:** nothing. No paid service, no new library, no new hosting.
- **Size shipped:** about 25–35 KB of CSS for the new look (scoped under
  `[data-look="new"]`, cached by the service worker) and roughly 60–90 KB of
  new JavaScript across the viz, layout and nav modules, unminified. Classic
  users download the CSS but run none of the new code paths.
- **Speed:** held to the existing budgets, measured in each PR.
- **Build effort:** eight PRs; phases 5 and 6 are the largest because each
  chart needs its adapter, engine helper where needed, table, keyboard model
  and tests.
- **Ongoing:** every new control has to be added to the feature map, or the
  inventory test fails. That is deliberate.

---

## 11. Decisions for the owner

Each with my recommendation.

1. **Phone bar items.** Home, Deals, Comps, Tools, More; Review as a Home card
   and a count on More. *Recommend: yes.*
2. **Default Home preset "Calm"**: Headline, Review (when waiting), Today,
   Continue working, Pipeline, Tasks; Contacts, Recent activity and This week
   on the Hidden shelf. *Recommend: yes.*
3. **Accent.** Five tested swatches, Brass the default; in the new look links
   become ink with an underline, so there is one accent. *Recommend: yes.*
4. **Density.** Comfortable and Compact; Compact only with a mouse; touch
   always 44 pt. *Recommend: yes.*
5. **Layout preferences in backups** (kv `ui.prefs`, data retention gate).
   Merge keeps this device's layout; replace brings the backup's.
   *Recommend: approve.*
6. **Theme in backups.** Today the theme is per device and not backed up.
   *Recommend: leave it per device (no change).*
7. **Trying values on a chart never writes the deal**; "Keep as a What-if
   scenario" goes through the existing scenario path (financial meaning gate).
   *Recommend: yes.*
8. **Engine additions for charts** (`valueAtCap`, `sweep`/`crossing`,
   `t12OmBridge`), with the `ladder` figure and the `noiOmT12` rule changed to
   use them; golden outputs must stay identical. *Recommend: approve; the
   designer reviews these PRs.*
9. **Fixes to Classic** (C1–C7). C2 changes a figure Home shows (derived NOI
   now appears, as on the deal page); the rest change no number.
   *Recommend: yes, as phase 0, with C2's before/after shown first.*
10. **Back button between screens** (C17), new look only. *Recommend: yes.*
11. **No drag-to-reorder in the first build**: buttons and the list editor.
    *Recommend: yes; revisit after phone testing.*
12. **Rollover chart without option dates, re-leasing cost or "months of
    income exposed"** (not modelled); a separate engine proposal later.
    *Recommend: yes.*
13. **T-12 against the OM in three parts** (income, expenses, taxes) until the
    OM's lines are mapped. *Recommend: yes.*
14. **Deal-page layout per device, not per deal** (per deal would change the
    deal format). *Recommend: per device.*
15. **Deal section names unchanged** (Overview, Rent roll, What if, Site
    visit) in both looks. *Recommend: yes.*
16. **When the new look becomes the default**: only after phase 7, a phone
    hand-test and your word. *Recommend: keep Classic the default until then.*
17. **Charts in the Classic look**: none added (only the comps charts' tables,
    C7). *Recommend: new look only.*
18. **Reduce motion switch in Settings**, in addition to the system setting.
    *Recommend: yes.*

---

## What was verified, what was not, what was assumed

- **Verified here:** the measurements quoted (page heights, control counts and
  sizes at 390 × 844 and 1440 × 900 in Chromium with the example deal; the
  `analyze()` timing; every contrast ratio; the colour-blind distances); the
  code references by file and line on 4.7.5; the wireframes checked with
  axe-core in light and dark at both sizes: no violations except two shelf
  buttons on Customize at 1440 × 900 that sit under the sticky bottom bar at
  that scroll position (details in `ui/index.html`).
- **Not verified:** Safari, Firefox, a real phone, a screen reader; the size
  and speed estimates for code not yet written.
- **Assumed:** that "Robinhood-style" means calm and sparse, not its specific
  visuals, and "Legend-style" means user-arranged cards; that hiding a card by
  default is acceptable when it stays one tap away (decision 2).
- **Needed from the owner:** answers to the 18 decisions.

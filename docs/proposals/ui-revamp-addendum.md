# Proposal 2b, addendum: a visual language that is ours, modules, Help and a first-run tour

Status: **written, waiting for the owner's approval.** Docs only; nothing in
`app/` changes. Written 2026-10-29 against 4.7.70 (`main` 574d4d9). It adds to
`ui-revamp.md` (approved 2026-10-15, 18 decisions), which stands as approved,
and to the navigation of `underwriting-workspace.md` (approved 2026-10-23,
decision 7) and `platform-expansion.md` 1.3–1.4. Mockups:
[`docs/proposals/ui/addendum/index.html`](ui/addendum/index.html);
screenshots in [`docs/proposals/ui/shots/`](ui/shots/). Every name and figure
in them is invented.

## In one paragraph

One specific identity instead of a reasonable default: **a financial
statement you can touch.** Source Serif 4 for titles and headline figures,
the Public Sans we already ship for the rest, tabular figures on every number;
cool slate neutrals under the one brass accent; ink rules, not shadows;
sections divided by headings and rules, not chopped into cards; statement
tables with subtotal and double total rules; and one signature, the **source
mark**: a shape and word beside each input saying whether it came from a
document (filled square, with the page), is an assumption (open circle) or a
forecast (open diamond), the tagline "Every source. Every assumption. Every
number." made visible. Around it: **My workspace** (show or hide sections,
never remove), a role that only decides what opens first, a measured
**simplicity budget**, **Help** guides that point at real controls, and a
five-step **first-run tour** on the same pointer. Underwrite stays third in
the bar, with Cash flow as its section.

---

## 1. Research: what makes an interface look generated, and what we take

Capped search, 2026-10-29. Rows marked *(summary)* come from search-result
summaries, not a full read; several hosts were **not reachable** from here
(nngroup.com, w3.org, the GOV.UK design system, atlassian.design,
chameleon.io, prg.sh, matthewstrom.com). Read in full: the Anthropic
`frontend-design` skill, Apple's HIG accessibility page, and the npm entries
for every font and library named here.

| Source | What it says | What we take |
|---|---|---|
| [Anthropic, `frontend-design` skill](https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md) | Generated design clusters on: warm cream (#F4F1EA) with a serif and a terracotta accent; near-black with one acid accent; broadsheet hairlines with zero radius; the SaaS card kit (identical rounded cards, one radius, the same soft shadow, gradient washes); template chrome (tracked ALL-CAPS eyebrows, `A · B · C` meta strings, "WORD — fragment" labels, monospace data labels, `→` on links). Spend boldness in one place; numbered markers only for real sequences; one deliberate motion moment, not fades on every section; copy names what users understand, errors say what happened and how to fix it. | The "will not do" list (section 2). An honest warning: today's look (warm paper `#F7F6F3`, serif titles, brass) sits close to the first cluster, and an "editorial" direction risks the third. Section 3 is built to avoid both: cool neutrals, radius on controls, no newspaper columns, one signature element. |
| [Superdesign, "why AI design looks generic"](https://www.superdesign.dev/blog/why-ai-design-looks-generic), [how to make AI UI less generic](https://www.superdesign.dev/blog/how-to-make-ai-ui-look-less-generic) *(summary)* | Tells: Inter as display face, purple-to-blue gradient on white, three equal cards in a row, "John Doe"/"Acme", a thick coloured border on one side of a rounded card. Fix: replace adjectives with constraints (tokens, one accent, the states you need). | No side-stripe cards, no gradient, no placeholder names; every rule here is a number a test can check. |
| [GitHub wiki, "How to detect AI slop in your design"](https://github.com/Laith0003/ux-skill/wiki/How-to-detect-AI-slop-in-your-design), [noqta, overused patterns](https://noqta.tn/en/blog/ai-design-slop-overused-ui-patterns-fix-2026) *(summary)* | Wide letter-spacing everywhere, "Live"/"New" pills on things that are neither, identical corners on every element so hierarchy disappears. | Sentence case, no tracking; status words only when true; radius by size (section 3.4). |
| [Axess Lab, glassmorphism and accessibility](https://axesslab.com/?p=5111), [NN/g, glassmorphism](https://www.nngroup.com/articles/glassmorphism/) *(summary)* | Text over blurred, changing content has contrast that moves with the content; a static mockup can pass while live content fails. | Bars and sheets get solid surfaces. Today's `backdrop-filter: blur(18px)` on the two bars (`styles.css:162`, `:209`) is not carried into the new look. |
| [NN/g, mobile tutorials](https://www.nngroup.com/articles/mobile-tutorials/) *(summary; page unreachable)* | A 70-user test of deck-of-cards tutorials at first launch; the summary did not show the result, so we draw nothing from it. | Nothing taken until it can be read. |
| [Chameleon, 15 million tour interactions](https://www.chameleon.io/blog/product-tour-benchmarks-highlights), [benchmark report](https://chameleon.io/benchmark-report) *(summary; vendor data)* | Just under two thirds of started tours finish; the best keep to five steps or fewer, show progress, and start from an event rather than out of nowhere; launcher-started tours finish far more often. | Five steps, "Step 2 of 5", starts only on an empty device or from Help, re-openable. Treated as directional: it is vendor data. |
| [NN/g, progressive disclosure](https://www.nngroup.com/videos/progressive-disclosure/) *(summary)* | Defer rare features to a secondary level; the way from the first level to the second must be obvious; one way, not several. | Hidden sections stay one tap away in one known place (My workspace), plus search. |
| [Bloomberg, designing the Terminal's user experience](https://www.bloomberg.com/company/press/designing-the-bloomberg-user-experience) and [UX job descriptions](https://www.cleverprep.com/companies/bloomberg/ux-designer) *(summary)* | Professionals accept dense screens; the job is to conceal complexity, not data; change the interface incrementally because moving a button disrupts work. | Density where brokers read numbers (tables, the ledger); calm elsewhere. The new look stays behind its toggle until the owner says otherwise. |
| [Tufte, data-ink, via data.europa.eu](https://data.europa.eu/apps/data-visualisation-guide/chart-junk-and-data-ink-origins) and [eagereyes, critique](https://eagereyes.org/blog/2013/definition-chart-junk) *(summary)* | Ink should carry data; decoration that carries nothing is chartjunk. Taken literally it goes too far. | Rules separate data; no ornamental fills; labels stay. |
| [Alberta design system, numbers in tables](https://design.alberta.ca/examples/display-numbers-in-a-table-so-they-can-be-scanned-easily), [Mediaatelier, tabular figures](https://www.mediaatelier.com/en-CH/Posts/Tabular-Figures) *(summary)* | Right-align numbers, use tabular lining figures, keep a minus sign so meaning survives without colour, drop zebra stripes and decoration. | Section 3.5. |
| [Apple HIG, Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) (read in full) | Minimum control 44 × 44 pt on iOS; text 4.5:1 up to 17 pt; let people enlarge text at least 200%; honour Reduce Motion by cutting automatic and repeated animation. | Section 6. |
| [WCAG 2.2 target size, via disabilityworld.org](https://www.disabilityworld.org/toolkit/standards/wcag/2-5-8-target-size-minimum/) *(summary; w3.org unreachable)* | AA asks 24 × 24 CSS px (or spacing); inline links in a sentence are exempt; 44 is the AAA level. | We hold 44 on touch (the revamp's rule), stricter than AA. |
| [GOV.UK button guidance](https://design-system.service.gov.uk/components/button/) *(summary)* | Sentence case; the label describes the action it performs. | Section 3.8. |

## 2. What we will not do

Each is checked by a test or the screenshot review (section 8).

1. No gradients, glass, blur or decorative background shapes.
2. No purple or blue-to-purple, no second accent; the one accent never marks
   data or status.
3. No warm cream with terracotta; the neutrals are cool slate.
4. No grid of identical rounded cards: a box is an object you act on;
   sections are a heading and a rule.
5. No shadow under resting content; only floating layers have one.
6. No single radius on everything, and no zero radius: radius follows size.
7. No tracked ALL-CAPS eyebrows, `A · B · C` meta strings, "WORD — fragment"
   labels, `→` on links or monospace data labels.
8. No emoji anywhere; one line icon set. No stock or 3D illustration.
9. No "Get started", "Unlock", "Oops", "Something went wrong", "Awesome!",
   "Submit" or "Are you sure?".
10. No entrance animations, hover lifts, shimmer, counting numbers, parallax.
11. No proportional or centred numbers, no abbreviations in tables or inputs,
    no colour-only sign.
12. No "big number, small label, gradient" hero, and no one word of a heading
    in another colour or weight.
13. No "New" or "Live" pill unless it is true.
14. No more than two type families and the sizes of section 3.2.

**Today's CSS against the list** (`app/styles.css`, 4.7.70): 32 different
`border-radius` values; 19 distinct screen font sizes from 10 to 36 px (nine
of them between 10 and 15 px) plus seven print sizes; 40 uses of
letter-spacing or uppercase; backdrop blur on both bars; one gradient (`.posbar`, `:663`); five
icon stroke weights (1.8 to 2.4) across 28 inline icons; 35 box-shadows. The
new look replaces these under `[data-look="new"]`; Classic is untouched
(revamp rule 2).

## 3. The visual language

### 3.1 Direction and the signature element

"A financial statement you can touch": the restraint and hierarchy of an
annual report (titles in a serif, figures aligned, totals ruled), with
controls that are plainly controls (44-point, rounded, filled when primary).
The boldness is spent in one place, the **source mark**:

| Mark | Shape | Word | Means |
|---|---|---|---|
| Document | filled square | the source, e.g. "OM page 2", "T-12, 12 months", "Rent roll, 14 leases"; a link to it | read from a file the broker supplied |
| Assumption | open circle | "Assumption" | typed or accepted by the broker |
| Forecast | open diamond | "Forecast" | projected by the engine (Part 20.6's word) |

Shape and word, never colour alone. Worked-out results carry no mark; they say
how they were worked out in words ("NOI over the asking price"). Marks are
display only: they read the provenance the app already keeps (OM source pages,
T-12 and rent roll origins, `rr-pdf-source`), store nothing new and change no
figure. Where the provenance of an input is not known today, the mark is
omitted, never guessed. See the deal mockup's "Inputs and where they came
from".

### 3.2 Type

| Role | Face | Licence | Files (latin subset, woff2) | Status |
|---|---|---|---|---|
| Titles, property names, the Home sentence, headline figures | **Source Serif 4** 400 and 600 (Adobe; via `@fontsource/source-serif-4` 5.3.1) | OFL-1.1 | 20,088 + 21,532 bytes | **new, approval gate** (decision 1) |
| Everything else: text, labels, tables, inputs | **Public Sans** 400, 600, 700 | OFL-1.1 | 14,648 + 14,732 + 14,752 bytes | already shipped (`fonts/`, `THIRD_PARTY.md`) |

- Why: a transitional serif with a Franklin-derived grotesque is the classic
  financial-publication pairing, both drawn for screens. Source Serif 4's
  digits are tabular by default (checked: one advance width for all ten);
  Public Sans has `tnum` (checked), set on every number. Neither is a
  generated-UI default (Inter, Roboto, Space Grotesk, system-only).
- **Loaded first.** Today the system font comes first and the serif falls to
  Georgia or Times on Windows and Android. The new look names its faces
  first, cached by the service worker (offline), with `size-adjust` fallbacks
  so the swap does not move text. No request to any font host.
- Sizes, in `rem` so they follow the reader's text size: 13 (source marks,
  captions, column heads), 15 (secondary, phone table cells), 16 (body), 19
  (section titles, serif), 24 (page titles and the Home sentence, serif),
  30 (headline figures, serif, desktop; 24 on the phone). Bar labels and
  chart axis labels use one extra 11 px step, nowhere else. Weights: 400 and
  600 (700 only in print).
- Dynamic Type: on iOS the root size comes from WebKit's `-apple-system-body`
  so the system text size scales every `rem`; everywhere else the browser's
  text size does. Layouts reflow to 200% without losing content (Apple's
  minimum). **Not verified here** (no Safari); on the phone hand-test list.

### 3.3 Colour

Cool slate neutrals under one warm accent. Contrast computed with the WCAG
formula from the hex values (script in the PR, kept as a Node test):

| Token | Light | on surface / bg | Dark | on surface / bg |
|---|---|---|---|---|
| `--bg` | `#F4F5F7` | | `#111316` | |
| `--surface` | `#FFFFFF` | | `#171A1E` | |
| `--surface-2` | `#ECEEF1` | | `#1F2328` | |
| `--ink` (text) | `#14181D` | 17.82 / 16.34 | `#E8EAED` | 14.48 / 15.44 |
| `--muted` | `#4E5661` | 7.43 / 6.81 | `#A9B0B9` | 7.98 / 8.50 |
| `--faint` | `#5F6773` | 5.72 / 5.24 | `#8F96A0` | 5.85 / 6.24 |
| `--accent` (Brass, revamp default) | `#8A6118` | 5.52 / 5.06 | `#DDB466` | 8.97 / 9.57 |
| text on accent | `#FFFFFF` | 5.52 | `#111316` | 9.57 |
| `--edge` (input and button borders, 3:1 needed) | `#868E99` | 3.31 / 3.04 | `#6E7682` | 3.80 / 4.06 |
| `--hair` (rules between rows; decorative) | `#DFE3E8` | 1.29 | `#2B3037` | 1.31 |
| `--good` / `--warn` / `--critical` | `#0F7356` / `#93500A` / `#B42318` | 5.82 / 6.19 / 6.57 on surface | `#4DCB97` / `#F0AB52` / `#FF7A70` | 8.57 / 8.86 / 6.87 |
| data (revamp 4.0, unchanged) | `#0072B2` / `#B85000` / `#5F6570` | 5.19 / 5.02 / 5.86 | `#56B4E9` / `#E69F00` / `#979CA4` | 7.57 / 7.75 / 6.32 |

Every text pair is at least 4.5:1 where it is used. Two light data colours
are 4.46 and 4.32 on `--surface-2`, so data colours are text only on
`--surface` (as marks they need 3:1 and pass). Rows are separated by space as
well as `--hair`, so the 1.3:1 rule carries no meaning alone. The other four
accent swatches keep their tested values (revamp 3.4).

### 3.4 Space, radius, elevation

- Space: the existing 4-point steps. Radius by size: 8 px controls, 10 px
  boxes, 14 px sheets and the tour pointer, full round only for badges.
- Elevation, three levels: **flat** (the page and its sections: no border, no
  shadow), **ruled** (a box: 1 px `--hair` border), **floating** (menus,
  sheets, toasts, tour: one shadow token, solid surface, 1 px `--edge`). In
  dark, floating also steps the surface up one level.
- Section headings sit on a 1 px ink rule; the rule is the hierarchy.

### 3.5 Numbers and tables

- Tabular lining figures, right-aligned, in columns that line up across rows.
- Money in whole dollars; `$` on the first row and totals only (statement
  style); cents only per SF or per unit. Engine values stay whole cents.
- Negative with a true minus sign (`−52,257`), never colour alone. Parentheses
  only if the owner chooses them for printed reports (decision 9).
- Percent to two decimals for rates (6.75%), one for occupancy (94.0%);
  multiples as `1.38x`; abbreviations ($41.2M) only in sentences and chart
  axes, never in a table or an input.
- Blank is "not entered", never 0 or an empty cell; a computed zero shows 0.
- Units in the caption or column head, never left to guess; "$ thousands"
  says so in both.
- Statement rules: a 1 px ink rule above a subtotal, a double rule under the
  final total, a footnote letter for an explained figure that hangs outside
  the digit column so alignment holds.
- Sticky header row and first column; no zebra stripes; 40 px rows on the
  desktop (36 in Compact density), 44 on touch.

### 3.6 Icons

One set, drawn by us: 24-unit grid, 1.75 stroke, round caps and joins, no
fills, shown at 20 or 22 px, always with a text label in navigation and an
accessible name when alone. The mockups use 32; the app needs about 40
(today's 28, redrawn to one weight, plus Underwrite, Documents, Help,
workspace, rotate, merge, split, export, calendar). No emoji.

| Candidate | What it is | Licence | Size | Last release | Build-free, offline | Network | Security | Verdict |
|---|---|---|---|---|---|---|---|---|
| Our own set | ~40 inline SVG paths | ours | about 6 KB | n/a | yes | none | static paths | **build**: we need 40 glyphs, and we already draw in this style |
| Lucide (`lucide-static` 1.64.0) | 1,600+ line icons | ISC | 54 MB package; ~300 B a glyph | 2026-10-29 | yes, copy SVGs | none | static SVG | not adopted: it is the shadcn default, the most recognisable generated-UI icon look |
| Tabler (`@tabler/icons` 3.50.0) | 5,000+ line icons | MIT | 11 MB package | 2026-10-27 | yes | none | static SVG | reference only; copying a glyph would be an approval gate |
| Phosphor (`@phosphor-icons/core` 2.1.1) | 1,500 icons, six weights | MIT | 6.5 MB | 2024-03-29 | yes | none | static SVG | not adopted: no release since 2024 |
| Heroicons 2.2.0 | 300 icons | MIT | 0.7 MB | 2026-05-12 | yes | none | static SVG | not adopted: Tailwind's default look |

### 3.7 Motion

The revamp's section 5 stands (120/200/250 ms, opacity and transform only,
never blocks input, numbers never animate, Reduce motion switch). Added: no
entrance animation on any page or section; no hover lift; no skeleton shimmer
(long work shows words and a determinate bar: "Reading page 4 of 24"); the
tour pointer appears without animation and moves 200 ms between steps (0 with
reduced motion). The one deliberate moment is the revamp's changed-figure
tint after an edit.

### 3.8 Copy rules

1. Name the action and its object: "Read an OM", "Save as one PDF", "Open the
   bridge". A button keeps its name through the flow (button "Save as one
   PDF", toast "Saved as one PDF").
2. Say what happened, why, and what to do next, in the app's voice, no
   apology, no exclamation marks.
3. Empty states teach one next step and offer it.
4. Sentence case everywhere; numbers as figures; Part 20.6's words for
   provenance (Actual, Estimate, Assumption, Forecast, Pro forma).
5. Never call a figure verified or checked unless a check ran (Part 23).

| Before | After |
|---|---|
| "Nothing here." (`researchui.js:378`, an empty section of a research brief) | "No claims in this section. The sources you added don't cover it." |
| "No text found in this photo." (`dealui.js:2295`) | "No text found in this photo. Retake it closer and in even light, or type the figures in." |
| "No priced comps to rank yet." (`glance.js:140`) | "None of your comps has a price yet. Add a sale price to rank them." |
| Generic: "Get started" | "Read an OM" |
| Generic: "Oops! Something went wrong." | "This PDF has no text layer. Run text recognition (about 20 seconds a page) or type the figures in." |
| Generic: "Are you sure?" | "Delete the rent roll from Linden Court Offices? You can undo it for 10 seconds." |
| Generic: "Unlock insights with AI" | "See which test limits the loan" |

### 3.9 Ready for the rename

The name and mark come from one place: `app/brand.js` (already `PRODUCT`)
gains `MARK`, one SVG drawn once in `index.html` as a `<symbol>` and used by
`<use>` (today the mark is pasted twice, `index.html:49` and `:74`). Tokens
are named by role (`--accent`, not `--brass`); the swatch id "brass" stays (it
names a colour, not the brand). A Node test fails if the product name appears
as text in `app/` outside `brand.js`, the manifest and the `<title>`. The
Monal rename and bird logo remain a separate proposal.

## 4. Information architecture

Bar, rail, five-chip hubs, search, feature flags, Customize, Hidden shelf,
presets and the feature map stay as approved.

### 4.1 Modules and My workspace

- A **module** is a section that can be hidden: a hub section (Cash flow,
  Development, Sets), an area (Documents, Investors, Connections) or a
  Home or deal-page card (already in the revamp's Customize).
- **My workspace** (Settings → My workspace, More → My workspace, the rail's
  "My workspace" heading with Edit, and search) lists every module, grouped, with a
  switch and a one-line description; a hidden module has **Open once**. Five
  bar slots are not modules and cannot be hidden. Mockup: `workspace.html`.
- Hidden means: out of the bar's More sheet, the rail, Home and the hub's
  chips; still in search, in My workspace and in Help, one tap away. The
  feature-map test (revamp 8.2) runs again with **every module hidden** and
  must reach every feature. Shown areas sit in the rail under "My workspace"
  and in More; shown hub sections are chips in their hub.

### 4.2 Roles

The owner's wording (Broker, Analyst, Developer, Investor) replaces
`platform-expansion.md`'s "Owner" (decision 6). Its approved rule stands: a
role changes only Home's default order, which section a hub opens on and the
"New…" menu order; **it never hides anything**. The first-run tour may then
*offer* "Hide Development and Investors for now?", which the broker accepts or
declines; hiding is always the broker's own act (decision 7).

### 4.3 Underwriting as a headline workspace

Underwrite stays slot 3 (W1). Its chips: Quick, Sets, **Cash flow**,
Development (hideable), with "Calculators" at the foot (W1). Cash flow is the
statement table of section 3.5: lines down, years across, line labels pinned,
footnoted events, assumptions beside it on wide screens and below it on the
phone. Until W1 merges, Cash flow sits on the deal page under the rent roll
(`argus-class-cashflow.md` decision 7). Mockup: `underwrite.html`.

### 4.4 Room for new workspaces

Documents (Tools → Documents per `documents-hub.md`; More → Documents and the
rail's My workspace in the new look), Development and Analyst sections
(Underwrite, Comps and Market), Connections (Settings), Investors (deal or
set): each a module, each flagged off until it does something.

### 4.5 Help and the first-run tour

- **Help** (More → Help, the `?` in the top bar, the rail, search "Help:"):
  short guides of three to six steps written for brokers ("Read an OM and
  check its figures", "Underwrite a deal in two minutes", "Build a cash flow",
  "Merge PDF pages", "Back up this device", "Show or hide sections"), plus the
  existing keyboard shortcuts. Each step names a real control; **Show me**
  opens the screen and points at it. Content is a static module
  (`app/help.js`, loaded on demand), no network, no video.
- **The tour** is five steps, each a feature-map path (`tap:button:Open the
  example deal`), so the map's test proves every step points at a reachable,
  labelled control: (1) your role; (2) the example deal; (3) the headline and
  source marks; (4) Underwrite; (5) My workspace and Help ("Take the tour
  again" is there). Step 2 uses the app's existing fictional example deal.
  It starts only on a device with no deals; a device that
  already has deals sees one line on Home ("New look: take the 5-step tour")
  that can be dismissed. Skip and Close on every step; Back from step 2.
- The pointer is a **non-modal** dialog beside its control: no dimming, no
  blocked page; doing the step moves the tour on. Focus goes to the pointer,
  Escape closes it, focus returns to the control. Mockup: `tour.html`.

### 4.6 Stored data

All additive, inside the approved `ui.prefs` record (revamp section 6,
decision 5): `modules: { hidden: [ids] }`, `role: "broker"`, `tour: { v: 1,
done: false, step: 0 }`. Ids come from fixed lists;
unknown ids are dropped; no deal changes; `BACKUP_VERSION` stays 2; no
`migrate.js` step. Old-backup fixtures (4.7.3, 4.7.4 and a 4.7.70 record
without these keys) restore to the defaults. Approval gate as a retention
note only (decision 8).

## 5. Simplicity budget

Measured by a browser flow (`budget-flow`) on every screen of the new look at
390 × 844 and 1280 × 800, in the default layout. A breach fails the run.

| Limit | Phone, first screen | Desktop, first screen |
|---|---|---|
| Filled primary buttons | 1 per layer (page, sheet, tour) | 1 per pane |
| Bordered boxes visible | 3 | 5 |
| Distinct action names (a row action repeated per row counts once; bars and rail excluded) | 12 | 20 |
| Headline-size figures | 3 | 3 |
| Type families / text sizes | 2 / the tokens of 3.2 only | same |
| Hues outside charts (ink, accent, one status) | 3 | 3 |
| Section chips in a hub | 5 (approved rule) | 5 |
| Running text line length | 75 characters | 75 characters |

Measured on the mockups: 0 to 1 primary button per layer, 0 to 1 bordered
box, two families. Two sizes were off the scale (the 18 px wordmark, a 12 px
chart axis label); the build moves them onto it.

## 6. Accessibility

WCAG 2.2 AA as the floor, with these stricter rules: 44 × 44 pt targets on
touch (standalone links get the height without growing the row); visible focus
in the accent; status always as a word or shape; every table with caption
and header scopes; charts per revamp 4.0; text to 200% without loss (3.2);
Reduce motion from the system and the in-app switch; the tour non-modal and
keyboard-complete; source marks have accessible text ("from the OM, page 2").
axe on the six mockups at both sizes and themes: no violations, except
`target-size` on two chart buttons while the sticky bar covers them at one
scroll position (none when scrolled into view). The tour's radio inputs are
20 px inside 52 px labels.

## 7. Performance budgets

Fonts +41.6 KB once, cached offline, Public Sans 400 preloaded, metric-matched
fallbacks (layout shift ≤ 0.01); new-look CSS within the revamp's 25–35 KB;
icons ~6 KB; Help and tour ≤ 20 KB, loaded when opened. Existing budgets hold:
an edit < 150 ms, the 500-lease deal open < 1 s, a scrub step < 50 ms p95; a
tour step < 50 ms.

## 8. Test plan

- **Screenshots** of every new-look screen at 390 × 844, 768 × 1024 and
  1280 × 800, light and dark, reviewed against section 2 each phase (the 24
  mockup shots are the reference; build-time shots are CI artefacts).
- **Tokens test (Node)**: every contrast in 3.3 computed from the CSS (4.5:1
  text, 3:1 edges and marks); fails on `gradient`, `backdrop-filter`,
  uppercase, a shadow outside the floating token, or an off-scale font size.
- **axe** on every screen, both themes, with My workspace, Help and each tour
  step open.
- **Feature map** also with every module hidden and once per role (same set
  reached); tour steps and Help "Show me" are map paths, so a renamed control
  fails.
- **Simplicity budget** flow (section 5).
- **Usability script** (owner and two brokers, phone, example deal, no Help):
  find where the asking price came from (≤ 3 taps); 2029 cash flow after debt
  (≤ 4); merge two PDFs (≤ 5 after picking files); hide Development and show
  it again (≤ 5); re-open the tour (≤ 3). Record taps, time, errors.
- **Mutation checks**, each must fail a test: drop `tnum`; let a role hide a
  module; point a tour step at a renamed button; let a hidden module leave
  search; add a second primary button to Home.
- **Each new test fails on the old code** (`git archive` with `BASE=`).
- Not possible here (Part 23): Safari, a real iPhone, Dynamic Type, a screen
  reader (WebKit wired, not installed). Each phase gives a hand-test list.

## 9. Build order: one PR each, all behind the new-look toggle

The toggle itself is revamp phase 1 (not built yet). These slot in:

| Phase | After | What | Size |
|---|---|---|---|
| D1 | revamp 1 | Tokens of 3.2–3.4, Source Serif 4 vendored with licence and checksum (if approved), tokens test, solid bars | S |
| D2 | D1 | The icon set redrawn to one spec; brand mark as one symbol; rename-ready test | S |
| D3 | revamp 2 + X1 | Modules registry, My workspace, roles; feature map with every module hidden and per role | M |
| D4 | revamp 4 | Tables and numbers (3.5) on the deal page, Underwrite and Cash flow; the source marks | M |
| D5 | D3 | Help section and guides, "Show me" pointer | M |
| D6 | D5 | First-run tour on the same pointer | S |
| D7 | revamp 7 | Copy pass (3.8), simplicity-budget flow, screenshot set, usability script | M |

## 10. Prior art (tour and Help)

| Candidate | What it does | Licence | Size | Last release | Build-free, offline | Network | Security | Verdict |
|---|---|---|---|---|---|---|---|---|
| Our own pointer | non-modal step pointer on feature-map paths | ours | est. 6–8 KB | n/a | yes | none | ids from a fixed list | **build**: has to follow feature-map paths and stay non-modal |
| driver.js 1.10.2 | product tours with a cut-out overlay | MIT | 27.8 KB (8 KB gzip) IIFE | 2026-10-18 | yes | none found (grep: no fetch, XHR or beacon) | small | fallback only; its overlay blocks the page, which our design avoids |
| Shepherd.js 15.3.0 | tours | **AGPL-3.0** | 0.8 MB | 2026-08-24 | — | — | — | excluded (licence) |
| Intro.js 8.6.0 | tours | **AGPL-3.0** | 1.0 MB | 2026-09-21 | — | — | — | excluded (licence) |

Fonts also weighed (all OFL): Newsreader (22.5/23.9 KB), IBM Plex Sans (22.6
KB a weight), Atkinson Hyperlegible Next (12.1/12.7 KB; clearest 0/O and 1/l;
the alternative in decision 1), Schibsted Grotesk, Instrument Sans. Inter was
ruled out as the generated-UI default.

## 11. What it costs

Money: nothing (no service, account or hosting change). Download: +41.6 KB of
fonts once, ~6 KB of icons, ≤ 20 KB of Help and tour code on demand. Build:
seven PRs (three S, four M), each with `check:full`. Ongoing: new controls
need map entries (as now) and new screens must pass the budget flow.

## 12. Decisions for the owner

Each with my recommendation.

1. **Typefaces**: Source Serif 4 (new, OFL, 41.6 KB) for titles and headline
   figures, Public Sans (shipped) for the rest; alternative Atkinson
   Hyperlegible Next for the rest (+25 KB). *Recommend: Source Serif 4 +
   Public Sans.* Approval gate: new font files.
2. **Our faces load first**, not the system font. *Recommend: yes.*
3. **Cool slate neutrals** in the new look (Classic unchanged). *Recommend: yes.*
4. **Icons drawn by us**, one spec, about 40; no library. *Recommend: yes.*
5. **Source marks** as the signature, display only. *Recommend: yes.*
6. **Roles** Broker, Analyst, Developer, Investor ("Owner" renamed). *Recommend: yes.*
7. **A role never hides**; the tour may offer to, the broker confirms. *Recommend: yes.*
8. **`modules`, `role` and `tour` in `ui.prefs`** (approved key; carried
   by backups). *Recommend: approve.*
9. **Negative numbers**: minus sign everywhere, or parentheses in printed
   reports. *Recommend: minus sign everywhere.*
10. **Cash flow on the phone**: full dollars (two to three years in view) or
    "$ thousands" by default (five). *Recommend: full dollars; thousands one
    tap away, said in the caption.*
11. **Tour**: five steps, only on a device with no deals; others get one
    dismissible line. *Recommend: yes.*
12. **Help** as in-app guides with "Show me"; no video, no network. *Recommend: yes.*
13. **Simplicity budget as a failing check.** *Recommend: yes.*
14. **Build order D1–D7** behind the toggle. *Recommend: yes.*

## What was verified, what was not, what was assumed

- **Verified here:** the contrast ratios (computed); font sizes and OpenType
  features (fontTools); licences and versions (npm); no network calls in
  driver.js (grep); 24 mockup screenshots in Chromium, zero external
  requests; axe on all six mockups; the budget numbers; the CSS audit counts.
- **Not verified:** Safari, a real phone, Dynamic Type, a screen reader; the
  unreachable sources (summaries only); estimates for code not yet written.
- **Assumed:** that "editorial or financial-publication cues" means the
  restraint of a statement, not newspaper layout; that "Investor" covers the
  owner who holds property.

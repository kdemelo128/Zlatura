# The filler's design language across the rest of Zlatura

**Status: approved by the owner 2026-11-10, with the recommended answer to all eight questions (section 8). Nothing is built yet.** Docs only; no file in `app/` changes.
Written 2026-11-10 against 4.7.122 (`main` c1540ca). The owner approves it
before any code is written. It builds on `ui-revamp.md` (approved),
`ui-revamp-addendum.md` (D1 and D2 built: `app/look.js`, `app/theme.js`,
`app/icons.js`, the `[data-look="new"]` block at `app/styles.css:118-170`) and
`uw-embed-as-is.md` (approved; P1 being built).

**The owner's direction (2026-11-10):** take the UI design of the Codex
underwriting package and use it as the basis for every other part of
Zlatura: very common, instantly understood patterns, "similar, but even
better", with the weight on accurate reading and transfer of numbers, full
human override, company templates and integrations. The goal is a sellable
product. The filler itself stays byte for byte as it is inside the Underwrite
tab; this proposal is about the rest of Zlatura, written fresh in Zlatura's
own CSS and JS.

**Confidentiality.** The package is private and this repo is public. Only
design tokens (colour values, sizes, durations), component anatomy and
behaviours in words are recorded here. No code, no text from its screens, no
firm, template, sheet, property or tenant names, no figures, no asset bytes.
All counts below come from reading `restored.css`, the inline `<style>` of
`index.html` (bytes 395 to 5,322 only) and the UI scripts by grep.

## Summary

1. **What the filler looks like, in rules:** warm off-white page, white cards,
   one plum accent, three quiet status colours, four soft "tones" for tool
   tiles only; IBM Plex Sans with Plex Mono for file names; large soft radii;
   frosted glass on floating controls (the step bar, tips, the palette), never
   on financial tables; a sticky four-step stepper; a dashed drop zone;
   pill status tags; toasts with Undo; a Cmd/Ctrl+K palette; a pause-motion
   switch and a solid-controls switch. Section 1 is the token table.
2. **Most of it maps onto tokens Zlatura already has.** Of 27 rows,
   12 replace a value, 9 are new, 4 stay as they are and 2 are not carried over. The new look's
   approved slate-and-brass palette (addendum 3.3) gives way to the filler's
   palette, which reverses three approved addendum decisions. That is gate 1.
3. **"Even better" is measurable:** 11 named weaknesses, each with a test
   (section 2). The top five are contrast, tiny text, small targets, glass
   with no contrast guarantee, and a theme that ignores the system setting.
4. **Accuracy and control become UI rules on every screen** (section 3),
   built on what exists: `deal.sources`, `sourceOf` (`app/dealfields.js:45`),
   Review (`app/review.js`), Data QC (`app/dataqc.js`), history and Undo
   (`app/history.js`, `app/dealui.js:2891-3030`), and the template preview
   (`app/libraryui.js:390`).
5. **Delivery:** 11 small PRs behind the existing *New look* toggle, Classic
   untouched, golden outputs identical, no engine change and no data-format
   change (section 4).
6. **The Monal bird stays inside the filler** for now (section 5); a
   Connections screen collects integrations with honest status (section 6);
   no new library, two OFL fonts that the embed proposal already plans to
   vendor (section 7); 8 questions (section 8).

## 1. The design language as tokens, and where each goes

The filler layers two style sets: a plain base in `index.html`, then
`restored.css` (91.5 KB), whose last palette block wins: plum, apricot and
sage on the controls, with the financial tables kept quiet. That last layer is
the look the owner sees, so it is the basis here. "Zlatura" below means the
new-look block, `app/styles.css:124-166`; Classic (`:28-116`) never changes.

| Filler token or rule | Light / dark | Zlatura new-look token | Action |
|---|---|---|---|
| page `--bg` | `#F7F4EF` / `#211E25` | `--bg` (`:133`, `:145`, `:157`) | replace |
| card `--card` | `#FFFDF9` / `#2C2730` | `--surface`, `--side` | replace |
| field `--field` | `#F5F0EB` / `#342D38` | `--surface-2` (inputs, drop zone) | replace; inputs read it |
| text `--ink` | `#352B35` / `#F5E9EF` | `--ink` | replace (12.36 / 13.93 on bg) |
| secondary `--muted` | `#766B74` / `#C3AEBA` | `--muted`, `--faint` | **replace with `#62575F`** light (fix F1); dark kept |
| hairline `--line` | `#E5DCE1` / `#4D414E` | `--line` | replace; decorative only |
| *(none: inputs use `--line`)* | | **new** `--edge`: `#8A7D88` / `#8D818E` | add: borders of inputs and buttons, 3:1 (fix F1) |
| accent `--accent`, `--accent-ink` | `#78516C` on `#FFF9F4` / `#D7A1BB` on `#30212D` | `--accent`, `--primary`, `-ink` | replace (6.48 and 6.30 light; 6.74 and 7.03 dark); brass stays a swatch |
| status `--ok`, `--warn`, `--bad` | `#47785D`, `#906122`, `#A74F58` / `#A4C59B`, `#EDC58D`, `#F0A4AA` | `--good`, `--warn`, `--critical` | rename map, replace values (5.03 / 5.27 / 5.30 on card) |
| status tints `--ok-bg` etc. | `#EDF4E9`, `#FFF2DB`, `#FFF0ED` / dark equivalents | `--good-soft`, `--warn-soft`, `--critical-soft` | replace; decoration behind a word, never the only signal |
| four tones and washes (tool tiles) | plum, sage, apricot, rose pairs | **new** `--tone-1..4`, `--wash-1..4` | add; only for tool and workspace tiles, never data or status |
| glass `--glass` | card at 83% opacity | **new** `--glass` | add at **92%** minimum (fix F4) |
| glint | white at 75%, an inner 1 px top highlight | **new** `--glint` | add, on glass only |
| blur | 18 different values, 2 to 30 px | **new** `--blur: 20px` | one value, glass only |
| accent picker `--uw-accent` | any colour the user picks | none | **not carried**: Zlatura keeps tested swatches (revamp 3.4); plum added as one (fix F6) |
| text scale `--uw-font-scale` | 90% to 120% | none; sizes are `rem` (`:129-130`) | **not carried** below 100%; an in-app 100-130% control is offered (fix F2) |
| sans | IBM Plex Sans 400, 500, 600 | `--ui` (`:126`) | replace Public Sans in the new look (gate 2) |
| mono | IBM Plex Mono 400, 500 | **new** `--mono` | add: file names, cell refs, hashes only; never figures or labels |
| type sizes | 19 fixed sizes from 8 to 28 px plus three `clamp()` headings | `--fs-*`, `--t-*` (`:129-130`) | **keep Zlatura's six rem steps** (13 to 30 px); filler roles map onto them |
| headings | page title 26 px semibold; section label 12 px tracked capitals | `--fs-h2`, `--fs-h3` | keep sizes; section labels in sentence case at `--fs-h3` (fix F7) |
| radius | 8 buttons, 12 sections and drop zone, 16-22 nav and tiles, round avatars | `--r-sm` 8, `--r-md` 10, `--r` 14, `--r-lg` 14 (`:132`) | replace: `--r-md` 12, `--r` 16, `--r-lg` 22, add `--r-pill` |
| elevation | sections: 1 px line, almost no shadow; floating: inner glint plus a wide soft shadow (12-34 px blur, about 7% ink) | `--shadow`, `--shadow-md` none; `--shadow-lg` (`:139`) | replace `--shadow-lg` with the soft float; resting content keeps no shadow |
| easing | `cubic-bezier(.2,.8,.2,1)` | `--ease` (`:47`) | **already the same** |
| durations | 150-260 ms; press 210 ms; panel enter 260 ms | `--d1` 120, `--d2` 200 (`:48`) | add `--d3` 260 (revamp 5 planned 250) |
| press feedback | scale to 97% on press | none | add, off with reduced motion |
| focus | 2-3 px outline, offset 2-3 px, mostly accent | `:focus-visible` (`:187`) | keep Zlatura's, 3 px in the accent (fix F1) |

**Component anatomy, to rebuild in Zlatura's own code:**

| Component | The filler's rule | Zlatura today | Zlatura target |
|---|---|---|---|
| Stepper | sticky glass bar at the top, four equal links with a step number, the current one filled in the accent, `aria-current="step"`, follows scroll | none app-wide; UW-1's card has steps in text (`app/intakeui.js:99`) | one `stepper()` helper: for every flow with 3+ steps (OM read, rent roll import, T-12 import, template fill, comp import, backup restore) |
| Card | white, 1 px line, radius 12-15, 18-25 px padding | `.card` | same anatomy; a card is a thing you act on, a section is a heading (addendum rule 4 stays) |
| Drop zone | dashed 1.5 px border in a mix of accent and line, field fill, bold first line, muted second, tint on drag-over, focusable | several per reader | one `dropZone()`: a real `<button>` that opens the picker, plus drop; says what files it takes and that nothing is uploaded |
| Buttons | filled accent primary; "ghost" outline secondary; disabled at 45% | `.btn-primary`, `.btn` (`:322`), `.btn-sm` (`:341`) | primary, secondary, quiet, danger; one primary per view; 44 px on touch |
| Status tag | pill, 11 px tracked capitals, coloured text on a tint | `.src` marks (`app/dealui.js:1200`) | status chip: sentence case, 13 px, a shape plus a word, colour last |
| Notice | tinted box with a 3 px left rule | `.hint`, inline notes | icon plus a sentence and a next step; no side stripe (addendum "will not do" list) |
| Optional panel | `<details>` with an accent summary | `.dd-toggle` (`:696`) | one disclosure style, 44 px summary |
| Toast | short message, Undo in it | `toast()` with `{label:'Undo'}` (`app/ui.js:635`) | same; restyle only |
| Palette | Cmd/Ctrl+K dialog, records grouped, jump to an input | `app/command.js:99` (`.cmdk`) | restyle only; already richer |
| Drawer | dialog with a tab row (notes, pinned figures, changes, reader preferences) | `sheetOpen` (`app/ui.js:130`) | same sheet; History already is "changes" |
| Tables | quiet: no glass, no tone colours | statement rules (addendum 3.5) | unchanged rules |
| Comforts | pause motion, solid controls, light or dark, presentation blur (figures blurred for screen sharing), optional haptics | theme, look | add *Solid controls* and *Hide figures while sharing* (gate 6); no haptics |

**Fonts.** The filler asks for IBM Plex Sans (400, 500, 600) and Plex Mono
(400, 500) from Google Fonts. Both are OFL-1.1 (`@fontsource/ibm-plex-sans`
and `-mono` 5.3.0, checked on npm). A system stack is **not** close enough:
Plex's squared curves and its digits are the look, and on Windows and Android
the fallback would be Segoe or Roboto, so the seam with the filler would show.
Patch E4 of `uw-embed-as-is.md` already vendors these weights for the filler
(about 60 KB, that proposal's estimate). Zlatura uses the same files: one
vendoring, one `THIRD_PARTY.md` entry, licence text and SHA-256, cached by
`sw.js`. That is an approval gate (gate 2). Whether Plex Sans has tabular
digits by default or needs `tnum` was **not checked here**; PR 1 checks it
with fontTools, as D1 did for Source Serif 4.

## 2. "Even better": what to fix, not copy

**Weaknesses found, ranked.** Each becomes a rule with a test in PR 1.

| # | Weakness in the filler | Evidence (counts, computed) | Rule for Zlatura, and its test |
|---|---|---|---|
| F1 | **Contrast at the edge or below.** Muted text is 4.50:1 on the field colour and 3.63:1 on its glass over dark content; input borders use the hairline (1.32:1, 3:1 needed); one focus-ring colour is 2.38:1; nine rules use opacity .4 to .8, some on 11 px text | WCAG formula on the hex values | every text pair 4.5:1, edges and focus 3:1, measured on the worst backdrop; no opacity on text. `look-tokens.test.js` extended |
| F2 | **Tiny text.** 64 rules at 8 to 10 px, 89 at 11-12 px; the text-size control goes down to 90% | grep of `font-size` | nothing under 13 px except the 11 px bar label (addendum 3.2); text size 100-130% only. Token test fails on any other size |
| F3 | **Small targets.** Buttons are 9 px padding around 14 px text (about 38 px); close and "×" buttons smaller; on narrow screens the step links shrink to 11 px text. Zlatura's own controls are 38 and 30 px (`styles.css:42`) with no coarse-pointer rule | CSS reading; not measured in a browser | 44 × 44 on a coarse pointer for every control in the new look; the browser flow measures every hit box at 390 px |
| F4 | **Glass with no contrast guarantee.** 18 blur values, card at 83% opacity, so legibility moves with what scrolls under it (addendum section 1, Axess Lab) | 3.63:1 computed at 83% over dark text | glass only on floating controls (stepper bar, palette, tips, toasts), at 92% opacity, contrast tested on a worst-case backdrop; solid with `prefers-reduced-transparency`, `prefers-contrast: more` and an in-app *Solid controls* switch |
| F5 | **Theme ignores the system.** The script that sets the theme picks light unless dark was saved, so a phone in dark mode opens it light | `appearance.js` | Zlatura follows the system unless the broker chose (`app/theme.js`, as now); see gate 4 for the seam |
| F6 | **Any accent colour.** The picker accepts any colour, so contrast is untested | `interface-comforts.js` | five tested swatches (revamp 3.4) plus plum; no free picker |
| F7 | **Tracked capitals.** Section labels and tags are 11-12 px capitals with letter-spacing (38 letter-spacing rules) | grep | sentence case everywhere (addendum 3.8); token test fails on `uppercase` |
| F8 | **Prefilled assumptions look typed.** Some model inputs open with a value already in the box | markup reading | an assumption shows as a suggestion with its mark ("Assumption"), the box stays empty until the broker accepts (Part 21.2) |
| F9 | **Decorative motion.** 16 keyframe animations, including a shimmer while reading and entrance slides | grep | the revamp's motion rules: no shimmer (a determinate bar with words), no entrances; the one moment is the changed-figure tint |
| F10 | **Phone stepper.** At narrow widths the bar's labels drop to 9-11 px and padding to 5 px | CSS reading | under 600 px the stepper becomes "Step 2 of 4: Review" with Back and Next at 44 px |
| F11 | **An API key kept in the browser** | `uw-embed-as-is.md` E2 | never copied: AI goes through `app/ai.js` and the confidential tag |

Kept because they are good: reduced motion is honoured widely (19
`prefers-reduced-motion` blocks plus an in-app pause), focus is visible on
most controls, `aria-current="step"`, polite live regions (8), and the rule
that glass and colour stay off financial tables.

**The filler's own axe scan was not run** (no Playwright in this worktree,
and the browser ports were in use). The embed plan already scans the filler's
document and reports it without gating (`uw-embed-as-is.md` section 9); PR 1
reads that report (rule ids and counts only) and adds any finding that also
applies to Zlatura's own screens to the table above.

**Usability checklist for every screen in the new look.** A builder ticks each
with the named check; Nielsen's ten heuristics in brackets.

1. One filled primary button per view, bottom right of its group on desktop,
   full width at the bottom on the phone (consistency) - `budget-flow`.
2. A flow of three or more steps uses the stepper, shows "Step n of N", and
   Back never loses entries (visibility of status; user control) - flow test
   types, goes back, checks the values.
3. Every destructive step has Undo in the toast for 10 s, or it asks with the
   object named ("Delete the rent roll from <deal>?"); never "Are you sure?"
   (error prevention) - flow test per delete.
4. Labels are plain words that say the action and its object; sentence case
   (match with the real world) - copy test against the addendum's banned list.
5. Validation is inline, on leaving the field, says what is wrong and how to
   fix it, never clears the entry (error recovery) - character-by-character
   typing tests.
6. An empty state says what is missing and offers the next step as a button
   (help) - feature-map flow opens every empty state.
7. The same control looks and sits the same everywhere: Back top left,
   Close top right of a sheet, search in the bar, Cmd/Ctrl+K (consistency;
   platform conventions) - screenshot review.
8. Status is a word and a shape, never colour alone (recognition) - token and
   axe checks.
9. Keyboard: every control reachable, Escape closes, focus returns to the
   opener (flexibility) - `a11y-flow`.
10. Long work shows what it is doing and a way to stop ("Reading page 4 of
    24", Cancel) - flow test per reader.

## 3. Accuracy and human control, as UI rules

These are display and interaction rules over records that already exist.
None changes a stored field or a figure.

| Rule | Mechanism today | What every screen must show |
|---|---|---|
| Every figure from a document shows its source and status word | `deal.sources[key]` (`page`, `t12`, `line`, `doc`, `hand`, `tool`); `sourceOf` (`app/dealfields.js:45`); marks at `app/dealui.js:1200-1215`; `deal.dd` documents | the source mark (addendum 3.1) beside the figure: shape, the document and page, and one of the provenance words (Actual, Estimate, Assumption, Forecast, Pro forma); a tap opens the page or line |
| The broker can override any read figure | typing sets `sources[key].hand` (`app/dealui.js:143`, `:551`) | an *Edit* affordance on every read figure; the mark changes to "typed by you" and the read value stays visible as "Read: …" with *Use the read value* |
| The original is kept and Undo works | `history.js` diffs, `refreshUndo` (`app/dealui.js:2897`), History sheet with "Undo to here" (`:2996`) | Undo in the toast after every override, and the change in History with before and after |
| A re-read never silently overwrites an override | the UW-2 rule (`uw-money-notes.md` 1.6); lease reader never overwrites a ticked value; `compareRolls` (`app/reconcile.js`) | on a re-read, overridden figures are listed as "Kept your figure; the document now says …" with *Use the document's* per row; nothing changes without a tap |
| Blank is blank | addendum 3.5; Part 21.2 | "Not entered" in muted text, never 0, never an empty cell; a computed zero shows 0 |
| Units beside figures | `app/units.js` (order of evidence); UW-2 asks monthly or yearly | unit in the label or column head: "$/SF/yr", "$/month", "SF (rentable)", "%"; an asked unit shows "You chose: yearly" |
| A failed check holds a figure back | Data QC (`app/dataqc.js`, `dataqcui.js:31`), Review items (`app/review.js:33`) | the held figure shows "Held: check failed" with the check and the fixes, and a link to Review; accepting is recorded |
| Template fill shows what goes where first | `previewCells` (`app/template.js:803`, used at `app/libraryui.js:390`); `fillCells` never overwrites formulas, skips blanks, writes an audit sheet | a review table before writing: field, value with unit and source, target sheet and cell, "skipped: blank" or "kept: formula"; one primary *Fill the template* |
| Nothing from a reader lands without a tap | UW-1 *Use* (`app/intakeui.js`); lease staging (`app/leasestage.js`); comp import staging | staged rows with *Use*, *Use all that passed*, *Dismiss*; counts of each |

**Per screen:** the deal page (all nine rules); Underwrite shell (source marks
on Quick underwrite, staging in Start from documents); rent roll and T-12
import sheets (units asked, Data QC, re-read list); Documents hub and the
lease reader (staging, page and quote); Comps import (source per comp, sale
versus asking asked); Templates (fill review); Review (one list of every held
figure and open question, already built).

## 4. Delivery: small reversible PRs behind the New look toggle

All PRs style only `[data-look="new"]`; Classic stays byte for byte (the
"Classic tokens are unchanged" test, `tests/look-tokens.test.js:91`). The
toggle (`app/look.js`) stays; the default changes only on the owner's word
(gate 8). **Every PR:** no engine change, no data-format change; both golden
checks identical (618 saved results, 646 displayed figures); new tests fail
on the old code (`git archive` served with `BASE=`); axe light and dark;
390 × 844 and 1280 × 800; the 150 ms edit budget; character-by-character
typing for every input type touched; mutation checks; `check:full`.

**Before/after screenshots:** `tests/e2e/snapshot-flow.mjs` gains a
`--look new` pass on the invented example deal (`app/sample.js`), each screen
in both looks and themes at both sizes; the PR shows the old and new pair.
For the seam, a local-only check from `private/` shows the filler card and
its surroundings in one shot (counts only in the PR, no picture of the
filler's content).

| PR | Area | Files | What changes | Tests that fail on the old code |
|---|---|---|---|---|
| 1 | Tokens and base components | `app/styles.css:118-170`; new `app/kit.js` helpers (`stepper`, `dropZone`, `statusChip`, `notice`); `fonts/` (Plex); `sw.js`; `THIRD_PARTY.md` | the token table; buttons, fields, chips, notices, disclosure, toasts, sheets, glass rules; *Solid controls*; 44 px coarse targets; text size 100-130% | token test: new values and ratios, glass only on listed selectors at ≥ 92%, no size under 13 px, no `uppercase`; Plex checksums and licence; a 44 px hit-box flow |
| 2 | Home and pipeline | `app/home.js` (`composeHome` `:121`), `app/pipeline.js`, `app/workspaceui.js` | tool tiles in the four tones; one primary *New deal*; empty states with next step | budget flow on Home; tiles never use status colours (CSS test) |
| 3 | Deal and the Underwrite shell | `app/underwrite.js` (`card` `:130`, `initUnderwrite` `:428`), `app/intakeui.js`; F11 split of `app/dealui.js`: deal page `:697-999`, figures `:999-1563`, scenarios `:1563-1788` | the frame card's border, radius, padding, page colour and type match the filler's, so its edge is invisible; source marks with Edit and "Read: …" | flow: override, Undo, re-read keeps the figure; screenshot of the seam (local) |
| 4 | Documents hub and readers | `app/ddui.js`, `app/pdfpagesui.js`, `app/convertui.js`, `app/leasereadui.js`, `app/intakeui.js` | one drop zone; stepper; staging rows with *Use*; "Reading page n of N" with Cancel | flows: drop zone is a button with a name; Cancel stops; nothing stored before *Use* |
| 5 | Rent roll and T-12 import | `app/rentrollui.js`, `app/t12ui.js`, `app/dataqcui.js`; F11: rent roll card `:1788-2130` | stepper (file, columns and units, checks, use); units asked inline; Data QC as status chips | flows: unit asked shows "You chose"; held figure shows its check; existing `omrr-flow`, `omstmt-flow` pass |
| 6 | Comps | `app/ui.js`, `app/compimportui.js`, `app/glance.js` | quiet tables; import stepper; duplicates as Skip or Add anyway | perf at 2,000 comps stays under 150 ms per edit; import flow |
| 7 | Templates and exports | `app/libraryui.js` (`:390`), `app/exporters.js`; F11: templates `:2665-2777` | fill review table before writing | flow: no write until *Fill*; review lists skipped blanks and kept formulas |
| 8 | CRM | `app/crm.js`, `app/dealcrm.js` | cards and sheets on the kit | flows: delete with Undo |
| 9 | Settings, backup, Connections | `app/settings.js` (Appearance `:111`), `app/backupui.js` | the Connections screen (section 6); *Hide figures while sharing* | flows: every connector card shows a status word; backup restore stepper |
| 10 | Field and AI | `app/aiui.js`, `app/researchui.js`; F11: questions `:2130-2250`, field notes `:2250-2550` | photo and voice cards; AI blocked state for a confidential deal stated plainly | flows: delete with Undo; confidential blocks the button |
| 11 | Close-out | all | copy pass, simplicity budget across every screen, the full screenshot set, phone hand-test list | `budget-flow` on every screen |

**F11** (split `app/dealui.js`, 3,088 lines) is deferred by the owner's
standing rule 6 until the real-deal flow works; each split above happens only
when its PR touches those lines anyway, one module per area, exports
unchanged, and is reported as a move with no behaviour change.

**Cost.** Money: none (no service, account or hosting). Download: Plex about
60 KB once, shared with the filler, cached offline; Source Serif 4 (41.6 KB)
falls out of the new look if gate 2 says so. Build: 11 PRs, about three S
and eight M; each runs `check:full`.

## 5. The Monal bird, coins and 3D flight

In the filler: an original drawn pheasant that sits in the header, breathes
and lifts its crest; a tip bubble with a button that goes to the next step and one for another tip,
keyboard operable, never AI advice; play coins earned by tapping the bird and
spent on cosmetic accessories in a wardrobe (one local record, never touches
deal data); synthesised chirps; a WebGL 3D view with a flight that pauses
when the tab is hidden and handles a lost GPU context; all of it pauses with
reduced motion.

| Option | What | For | Against |
|---|---|---|---|
| A. Only inside the filler | untouched there, nothing elsewhere | no risk to the 150 ms budget or the rename; the seam is the frame edge, not the bird | the rest of the app feels plainer than the filler |
| B. A light presence | the bird as a still drawing in empty states and the Help pointer; no coins, no sound, no 3D | warmth where people are stuck | a brand decision; the name is not settled |
| C. None | remove it from the filler too | most sober | breaks "as is"; not allowed |

**Recommendation: A now.** Coins and a 3D game read as a toy to a buyer of a
professional tool, and WebGL costs battery on a phone. Revisit B together
with the Monal rename, which **the owner has paused**; `app/brand.js` is
where a mark would come from.

## 6. Integrations: one Connections screen

A UI plan only; the connectors themselves are designed in
`platform-expansion.md` section 2 (contract, X4) and
`comp-enrichment-and-sources.md` (C2-C6). Settings > Connections (and the
"Connections" module of addendum 4.1) holds one card per connector:

- **Card anatomy:** name; what it does in one line; where it runs ("On this
  device" or "Needs the internet"); its status in one of the seven Part 23
  words; what it is waiting for, if anything ("Needs hosting", "Needs your
  approval: costs money", "Needs sample files"); one primary action
  (*Import a file*, *Set up*, or none); a *What it sends* line.
- **On the device today:** document reading (pdf.js, OCR with the vendored
  Tesseract, the lease and OM readers); company templates (the template
  library, `app/libraryui.js`, and the firm workbook kept on the device by the
  filler package, Settings > Underwriting filler); CRM files in and out
  (`app/crm.js`); comp files (C1).
- **Needs a network, CSP or hosting gate:** public data lookups (C3 Census
  and flood, C4 counties: network and CSP); CRM APIs (X4: security review
  per connector, `repo.test.js:79` allow-list); licensed data (C6: cost,
  terms, hosting relay X5); AI (`app/ai.js`, the AI server).
- Nothing on this screen makes a network call; each card reads a static
  registry. The first card set is PR 9.

## 7. Prior art (capped: 9 npm registry lookups and 1 web search, 2026-11-10)

`THIRD_PARTY.md` already ships Public Sans, Source Serif 4, pdf.js, Tesseract,
ExcelJS, fflate and pdf-lib; the app has its own tokens, icons
(`app/icons.js`), sheets, toasts and palette. GitHub was not searched
directly.

| Candidate | What it does | Licence | Size | Last release | Build-free, offline | Network | Security | Verdict |
|---|---|---|---|---|---|---|---|---|
| Our own CSS on the tokens | everything in section 1 | ours | about 30 KB (revamp budget) | n/a | yes | none | none | **build** |
| IBM Plex Sans and Mono (`@fontsource` 5.3.0) | the filler's type | OFL-1.1 | about 60 KB for the weights used (estimate) | 2026-07 | yes, woff2 | none once vendored | static font files | **adopt** (gate 2; shared with embed E4) |
| Open Props 1.7.23 | ready CSS custom properties | MIT | 1.3 MB package | 2026-01 | yes | none | none | not adopted: we need the filler's values, not a generic scale |
| Pico CSS 2.1.1 | classless base styles | MIT | 19.6 MB package | 2025-03 | yes | none | none | not adopted: restyles bare elements, would fight both looks |
| Radix Colors 3.0.0 | tested colour scales | MIT | 0.6 MB | 2025-12 | yes | none | none | reference only |
| Adobe Leonardo 1.1.0 | colours generated to a contrast target | Apache-2.0 | 0.1 MB | 2026-10 | needs npm to run | none | none | reference only; our token test already computes ratios |
| Style Dictionary 5.8.0 | builds tokens into CSS | Apache-2.0 | 4.4 MB | 2026-11 | **no: a build step** | none | dev tool | not adopted (no build step) |
| Design Tokens format 2025.10 ([DTCG](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/)) | a JSON format for tokens | W3C CG report | spec | 2025-10 | n/a | n/a | n/a | adapt the naming only; tokens stay in CSS |
| Shoelace 2.20.1 / Web Awesome 3.14.0 | web-component UI kits | MIT | 8.4 / 17.5 MB | 2025-03 / 2026-09 | yes | none found (not audited) | large surface, shadow DOM | not adopted: their own look and markup would hide our feature-map ids and fight the tokens |

`npm audit`: nothing is installed by this proposal; it runs in PR 1 with the fonts.

## 8. Gates and questions for the owner

Recommended answer first.

1. **The new look takes the filler's palette** (warm off-white, plum accent,
   sage, apricot and rose tones), replacing the approved slate neutrals and
   brass default (addendum decisions 3 and the "no purple, no warm cream"
   rules). Brass stays a swatch; Classic is unchanged. *Recommend: yes.*
2. **Type: IBM Plex Sans and Plex Mono** vendored once (OFL, about 60 KB),
   replacing Public Sans and Source Serif 4 in the new look. New font files
   are an approval gate. *Recommend: yes; Public Sans stays for Classic.*
3. **Glass on floating controls only**, at 92% opacity, with a solid fallback
   and a *Solid controls* switch; this reverses addendum rule 1 and changes
   the test at `tests/look-tokens.test.js:81` into a stricter one (listed
   selectors, opacity floor, worst-case contrast). *Recommend: yes.*
4. **The seam:** the filler opens light even on a dark phone. Should Zlatura
   set the filler's own appearance choice to match its theme before the
   frame loads (no change to the filler's files, only its stored preference)?
   *Recommend: yes, in the embed's P3 (the bridge), reversible; the
   "exactly the same" check sets the same theme in both runs.*
5. **Mascot:** option A, only inside the filler; revisit with the rename.
   *Recommend: A.*
6. **Hide figures while sharing** (the filler's presentation blur) app-wide,
   a device-only setting, display only. *Recommend: yes, in PR 9.*
7. **Appearance preferences** (*Solid controls*, text size, hide figures)
   stored on the device only (`localStorage`, like `zlatura.look`), not in
   backups and not in the deal format. *Recommend: yes.*
8. **Default:** the new look stays opt-in until PRs 1-11 are merged and you
   have hand-tested on your phone; then you switch the default.
   *Recommend: yes.*

Decided here (reversible): 44 px targets and the 13 px floor only in the new
look (Classic untouched, revamp rule 2); the stepper on phones as "Step n of
N"; no haptics; no free colour picker.

## What was verified, what was not, what was assumed

- **Verified here:** every contrast ratio above (WCAG formula on hex values,
  including the 83% and 92% glass mixes); the counts of sizes, radii, blurs,
  keyframes and reduced-motion blocks (grep of `restored.css`); font and
  library licences, versions and dates (npm registry).
- **Not verified:** an axe scan of the filler; target sizes in a browser;
  Plex's tabular digits; Plex's real file sizes; Safari, a real phone, a
  screen reader. GitHub was not searched.
- **Assumed:** that the last palette layer of `restored.css` is the look the
  owner means by "the exact UI design"; that "even better" allows fixing
  contrast and size while keeping the character.

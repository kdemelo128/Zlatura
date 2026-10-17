# Changelog

## 4.7.21: An OM's stated rent is checked against its rent roll, the roll can offer Building SF and Units, and a two-line header is read (on the development branch; not merged or deployed)

Three gaps from the rent roll proposal (F3, F4 and F6). The OM's stated in-place rent was read, then thrown away (the deal has no box for it), so the rent roll check against it never ran. And a deal whose OM prints no building figures left Building SF and Units empty although the rent roll was read.

- **Stated rent, checked only:** the stated in-place rent now reaches the rent roll's Data QC (`The OM's $215,000 of in-place rent agrees with the rent roll's …`, or a warning with both figures and the Total row). It is not a figure: no new box, nothing new stored, no change to saved deals. Left out when a statement table read it and that table's check failed.
- **Offered, never filled:** when Building SF or Units is empty, the Rent roll card says what the roll supplies ("The rent roll's 6 units add up to 9,000 SF, as listed. A building's gross area can be larger.", "The rent roll lists 6 units.") with a **Use** button. Nothing fills until you tap. A box that already has a value is never offered over. A taken figure is badged "rent roll" (in the figure list, the workbook and the AI facts), never "typed"; it is one step in History, and **Undo** takes it back.
- **A two-line header is read (F6):** a label split over two lines with only that one cell on the second ("Annual" over "Rent", the other labels on the first line) used to end the header after "Annual", so "Rent" was read as a body line and the OM showed no rent roll at all. A deeper header line is now taken when every cell on it sits under a figure, date or share column of the header and is itself such a word. Never a name column (a tenant called "Rent-A-Center" stays a tenant) and never a section heading.
- **No self-check:** the rent roll's cross-check warnings skip a figure you took from the rent roll (it would be checked against itself).
- **Occupancy is not offered:** the deal already shows the rent roll's occupancy, labelled "rent roll", wherever the OM states none; a stored copy would drop that label, drift from the roll, and be checked against the roll it came from. (A deviation from the owner's answer 3, which listed occupancy; easy to add back if wanted.)
- **Tested:** `tests/rr-stated.test.js` (12 tests; the file fails on the old code; 9 mutations each caught) and `tests/rr-header.test.js` (5 tests, 1 fails on the old code; 4 mutations each caught); the browser flows `rrstated-flow` (18 checks; 10 fail on the old app) and `rrheader-flow` (7 checks; 3 fail on the old app) on the phone-size page; the reader's output is identical before and after on all 26 existing fixtures; golden outputs identical (618 saved results, 646 figures).
- **Not tested:** a real OM, Safari.

## 4.7.20: check:quick can no longer miss a file the offline app needs (on the development branch; not merged or deployed)

Nothing changes in the app. During 1a, a new file (`app/scale.js`) was left out of the service worker's cache list. `check:quick` passed, because it runs only the tests that name a changed module, and CI failed three times.

- **Always run:** `check:quick` now always runs `tests/repo.test.js` (the offline cache lists every file the app needs, every import exists, no request leaves the site, the cache is named for the release) as well as the saved-results test.
- **Selection moved:** the "which tests" logic is now `tests/tools/affected.mjs`, so it can be tested; `check.mjs` imports it.
- **Tested:** two new tests in `tests/check-tools.test.js` (the always-run set holds for any change; the selection stays selective). They fail on the old code (the module does not exist), and undoing the always-run entry fails them. End to end: a new app file not in `sw.js` makes `check:quick` exit 1; before, it passed.
- **Not changed:** `check:full`, CI, the app, saved results (golden identical).

## 4.7.19: An OM rent roll printed in thousands now reads at its real rents (on the development branch; not merged or deployed)

A rent roll headed "($ in thousands)", "($000s)" or "in millions" was read at face value: a 60.0 became a $60 rent, every row failed the range check, the whole roll was held, and "Accept as read" would have stored $60 rents. `omstatement.js` already understood scale; `omroll.js` did not.

- **Scale read from the table:** a column's own heading ("Annual Rent ($000s)") wins; otherwise a caption in the up to three lines above the header, stopping at the first line with a figure, so another table's caption is never borrowed. A second table with the same header and no caption is read in the first one's scale.
- **Only money is scaled:** annual, monthly, "Rent", market rent, recoveries and deposit, and the Total row. SF, rent per SF and shares are never scaled. Each is `toCents(value * scale)`; the cell keeps the text as printed.
- **It says so:** an info line in Data QC ("The “Annual Rent” column on page 2 is printed in thousands … read ×1,000").
- **Not guessed:** a column headed per SF ("Market Rent PSF", "CAM $/SF") is never scaled. A bare "Rent" column under a caption that fits both a rate and a scaled total ("dollars in thousands, except rent per SF") raises a failed check and holds the roll, so you are asked.
- **A wrong scale is still caught:** a caption that does not fit the figures (a "thousands" caption over full-dollar rents) scales them out of range, fails the range check and holds the roll, as before.
- **One reader for the scale:** `scaleOf` moved to `app/scale.js`; `omstatement.js` re-exports it and reads statements exactly as before.
- **Tested:** `tests/rr-scale.test.js` (14 tests; 11 fail on the old code, each part has a mutation that fails its own test); the browser flow `rrscale-flow` on the phone-size page (13 checks; 8 fail on the old app); the rent roll reader's output is identical before and after on all 26 existing fixtures; golden outputs identical (618 saved results, 646 figures). Not tested: a real OM, Safari.
- **Known limit:** the range check allows up to $3,000 per SF a year, so a wrong scale on a rent under $3 per SF a year (a ground lease) is not caught by it.
- **Saved deals:** unchanged. A roll already held from an old read stays as it was; read the OM again to get the scaled rents.

## 4.7.18: Proposal: why an OM's rent does not fill the boxes, and a rent roll PDF as its own document (on the development branch; not merged or deployed)

Nothing in the app changes; this is a written proposal (`docs/proposals/rentroll-pdf-and-om-fill.md`) waiting for the owner's approval.

- **The bug, reproduced** with invented PDFs: a rent roll in thousands is read as $60 a year and held; the OM's stated in-place rent is read and then dropped (it has no box); nothing fills Building SF, Occupancy or Units from the rent roll; a property-manager style report is misread (monthly charges taken as rent, a subtotal counted as a tenant, a wrapped lease-end year lost). Plain annual and monthly columns read correctly.
- **The feature:** a rent roll PDF uploaded on its own: detect it, read it by position, preview with Data QC, approve, populate the rent roll, and reconcile line by line with an OM roll if one is loaded.
- **The owner's support code** reviewed (no secrets, no network calls, real data kept in `private/`): file by file, adopt, adapt or skip; and how it informs a later underwriting feature.
- **Tested:** read-only reproduction; no `app/` or `tests/` change. Golden outputs identical.

## 4.7.17: CI now scans for known-vulnerable packages and pins its own tools (on the development branch; not merged or deployed)

Nothing changes in the app. The test workflow had no dependency scan (`npm audit` had been clean once, by hand) and its four GitHub Actions followed moving tags.

- **Audit job:** `npm audit --audit-level=low` runs on every push for both lock files, the app's and the AI server's, dev dependencies included. Any advisory fails the run. Both are clean today.
- **Pinned actions:** `checkout`, `setup-node`, `setup-python` and `cache` are pinned to full commit SHAs, with the tag in a comment.
- **Dependabot:** `.github/dependabot.yml` opens one weekly PR when a pinned action has a newer release. It never merges by itself.
- **Tested:** `tests/workflow-pins.test.js` fails on the old workflow (2 failures) and passes on the new one; it checks every `uses:` for a 40-character SHA and the two audit steps. `npm audit` run by hand on both lock files: 0 vulnerabilities. Golden outputs identical (no `app/` change).
- **Not done here:** the host's security alerts are a GitHub setting the owner turns on (Settings, Code security).
- **Test fix:** `tests/e2e/rename-flow.mjs` read the Settings "data moved" text as soon as the backup button existed, and failed about one run in three. It now waits for the text (10 s) before checking it; the check itself is unchanged. 6 runs in a row passed afterwards.

## 4.7.16: Working rules: model routing, which check to run, usage rules (on the development branch; not merged or deployed)

Docs only; no app change.

- **Model routing:** the designer (Opus) writes proposals, root causes and a
  short design note, and reviews the finished diff; the Sonnet main session
  writes the code and tests.
- **Check rule:** docs or CI-config-only PRs run `check:quick`; anything
  touching `app/` or `tests/` runs `check:full`.
- **Usage rules:** batch searches, read line ranges, `/clear` after each
  merged PR.
- `docs/NOW.md` now carries the session-start check, the approved
  decisions, the open validation and the plugin quirk.

Tested with `check:quick`. Saved results are unchanged.

## 4.7.15: a CSV saved by an older Excel or Windows keeps its accents and curly quotes, and the app says how it read the file (on the development branch; not merged or deployed)

Before, every file the app read as text was decoded as UTF-8. A CSV saved
by an older Excel, or by Excel on Windows as plain "CSV", is Windows-1252, so
"Café Lumière" became "Caf� Lumi�re" and "O’Brien" became "O�Brien", and
nothing said so.

- **One reader for every text file** (`app/textfile.js`). It covers six
  places: the rent roll CSV import, the T-12 CSV import, a TXT, CSV or MD
  document sent to AI, opening a comp project, restoring a backup, and
  importing a template package. Comps come from PDFs and project files, and
  contacts have no file import, so there was no other CSV reader to cover.
- **The rule, never a silent guess.**
  - A byte-order mark decides: UTF-8 (Excel's "CSV UTF-8"), or UTF-16, which
    used to read as noise.
  - Valid UTF-8 is UTF-8, read exactly as before, with no note.
  - Anything else is Windows-1252, and the app says so with up to three
    words to check.
  - Two cases are ambiguous, and the note shows both:
    - **A stray byte.** A UTF-8 file with a stray byte stays UTF-8, and the
      note counts the characters it couldn't read ("�") and gives their
      lines.
    - **Bytes valid in both.** A Windows-1252 name whose bytes also happen to
      be valid UTF-8 ("JOSÉ’S" is the bytes of "JOSɒS") is read as UTF-8,
      and the note gives both readings.
  - Bytes that Windows-1252 leaves undefined (Mac Roman uses them, for
    example) are named too, with "save it as CSV UTF-8" as the fix.
- **Where the note shows.**
  - **Rent roll:** in the import sheet, above the column choices.
  - **T-12:** in the "T-12 read" message, which stays up longer when it has a
    note.
  - **AI:** at the top of the review.
  - **Project, backup and template package:** in a message.
  - It isn't saved with the deal: that would change the saved data format.
- **Its own Windows-1252 table.** The app maps 0x80 to 0x9F itself, as the
  WHATWG Encoding Standard does. The browser does the same, but Node's
  TextDecoder reads those bytes as Latin-1, which would make the tests
  disagree with the phone. A browser check confirms that the app's table
  matches Chromium's.

**What changes for a broker.** Only files that aren't valid UTF-8: they now
read right, with a note to check. Every UTF-8 file reads as before. No saved
deal, figure or format changes.

**Tested.**
- **Invented fixtures** in `tests/fixtures/encoding/`:
  - a Windows-1252 rent roll with é, è, ø, ñ, ’ and –;
  - the same rent roll in UTF-8;
  - a Windows-1252 T-12.
- **`tests/text-encoding.test.js`:** 15 tests, 12 of which failed on 4.7.14.
  On three of those, the UTF-8 and byte-order-mark files, the cells already
  read the same before; they fail only because 4.7.14 reports no encoding.
  The 3 that pass on 4.7.14 test properties of the new decoder:
  - 3,000 random UTF-8 texts decode to themselves with no note;
  - 3,000 random Windows-1252 texts decode right or carry a note, except for
    the one documented, rare silent case: a lowercase accent and then two or
    three typographic marks;
  - for 20,000 random byte strings plus every edge of each length, the
    decoder agrees with the strict UTF-8 decoder on what is valid UTF-8.
- **`tests/e2e/encoding-flow.mjs`:** a new browser flow, 12 checks, 9 of
  which failed on 4.7.14. It covers the rent roll, T-12, project, backup and
  template package. `ai-flow.mjs` adds 2 checks for a Windows-1252 document,
  and both failed on 4.7.14.
- **Mutation checks:** 19 mutations, all caught.
- **Golden outputs** are identical: 618 saved results, and 0 of 646
  displayed figures changed.
- **Not tested on real files.** None are on this machine. The owner can run
  `node tests/tools/rr-local.mjs` and `node tests/tools/t12-local.mjs` on
  real old CSVs in `private/`; both now read through the same reader.

## 4.7.14: money rounds to the cent by one rule everywhere, and a T-12 line whose months don't add up to its year is flagged (on the development branch; not merged or deployed)

Before, four modules kept their own copy of `Math.round(x * 100) / 100`
instead of the engine's `toCents`: `t12.js`, `omstatement.js`, `om.js` and
`template.js`. That copy rounds the binary number, not the decimal one:
1.005 became 1.00, 0.145 became 0.14, and a negative half cent went toward
zero. It was a second copy of the money math, which the rules forbid.

- **One rounding rule.** All four now use the engine's `toCents`: half
  away from zero, exact for decimal input.
  - `t12.js`: every month, line total, category, EGI, expenses, NOI, and
    annualizing.
  - `omstatement.js`: a statement's rows and its "use the sum of the lines"
    fix.
  - `om.js`: each figure read from an OM table, and the other columns it
    offers.
  - `template.js`: money to the cent ($/SF) written into a firm's template.
- **A new T-12 check, a flag only.** It fires when a line's shown months add
  up to more than a cent away from its shown year. That happens when the
  file holds fractions of a cent: each month is rounded on its own, the
  year once. Neither figure is changed (owner, 2026-10-15).

**What changes for a broker.** Only amounts with a third decimal, and
annualizing a T-8 (× 12 ÷ 8 = 1.5 turns an odd cent into a half cent):

| Example | Before | After |
|---|---|---|
| A T-12 month of $0.145 | $0.14 | $0.15 |
| A vacancy month of −$0.125 | −$0.12 | −$0.13 |
| A T-8's $10,000.15, annualized (exactly $15,000.225) | $15,000.22 | $15,000.23 |
| An OM's printed NOI of $10,000.005 | $10,000.00 | $10,000.01 |
| An OM's "use the sum of the lines", with a −$100.005 line | $13,000.00 | $12,999.99 |
| $1,024,215 ÷ 1,000 SF written into a template | $1,024.21 | $1,024.22 |

Amounts with two decimals never change, and nor do sums of them. Saved deals
aren't re-rounded.

**Tested.**
- **New tests:** `tests/money-rounding.test.js`, 8 tests. Seven fail on
  4.7.13. The eighth is a guard, true on both versions: every money value a
  T-12 or an OM statement keeps is whole cents, over all 8 T-12 layouts,
  all 14 OM statement cases, and a statement written to fractions of a
  cent.
- **Mutation checks**, each caught:
  - each module put back to its own rounding (`t12.js`, `omstatement.js`,
    the `om.js` figure, the `om.js` alternatives, `template.js`);
  - the flag never raised;
  - its tolerance loosened to ten cents.
- **Before and after, module by module:** every output of the 8 T-12
  layouts and 14 OM statement cases, compared field by field, old code
  against new: identical. The 22 template money2 values of the test comps:
  identical.

Saved results and figures are unchanged (golden outputs identical: 618
saved results and 646 displayed figures).

## 4.7.13: changelog entries that can't conflict, and the owner's approved build order (on the development branch; not merged or deployed)

Tooling and docs only; the app is unchanged. Before, every PR wrote its
entry at the top of `CHANGELOG.md`. Two PRs open at once always conflicted
there, and in the version lines (#28 against #27).

- **The changelog entry is now a fragment.** Each PR adds one file,
  `docs/changelog/unreleased/<branch>.md`: a `# title` line, then the
  entry. It never edits `CHANGELOG.md` by hand (`tests/tools/changelog.mjs`).
- **`npm run bump -- x.y.z` folds it in.** It runs in the PR's last commit:
  - it sets the version in the five places, as before;
  - it puts the fragment at the top of `CHANGELOG.md` as
    `## x.y.z: <title> (…)`, and deletes the fragment;
  - all or nothing: it changes nothing if there's no fragment, two
    fragments, or a malformed one (no title, empty, a version in the title,
    or a version heading inside).
  - This entry is the first one written this way.
- **`npm run sync-main` resolves the two conflicts that recur:**
  - `CHANGELOG.md`: both entries kept, newest version first. Not when one
    version number holds two different entries: a person decides those;
  - a version line in `package.json`, `package-lock.json`, `sw.js` or
    `app/exporters.js`: the higher version, whichever side has it.

  Anything else is listed for a person, as before. Once nothing is left,
  the merge is committed.
- **A test checks** that the top changelog entry's version equals
  `package.json`'s, and that any fragment waiting is well formed.
- **The owner's decisions** on the three 4.7.12 proposals are recorded in
  `docs/PLAN_STATUS.md` and `docs/NOW.md`:
  - the revised build order;
  - production readiness F1 to F12, in the approved order;
  - the competitive-gap reorder and its four additions;
  - `.xls` only if an Apache-2.0 or MIT SheetJS can be fetched;
  - an independent review and account ownership as Phase 7 prerequisites.
- **The rules say so:** `CLAUDE.md`, `docs/working-rules.md` and the
  `release` skill.

**Tested** in `tests/check-tools.test.js`:
- the fold, byte for byte, and every refusal changing nothing;
- `sync-main` in throwaway repositories: #28's conflict resolved on its
  own; a higher version on main kept; an unrelated conflict left for a
  person; one version written two ways not guessed.
- The new tests fail on 4.7.12. Seven mutations are each caught: no
  fragment allowed, the fragment left behind, the entry at the bottom, a
  version heading inside allowed, oldest first, always the branch's version,
  and two entries under one version merged.

Saved results and figures are unchanged (golden outputs identical).

## 4.7.12: reuse before you build, one register of third-party code, and three proposals (on the development branch; not merged or deployed)

Docs only, plus one comment in `app/ocr.js`; the app's behaviour is
unchanged.

- **A new standing rule, "reuse before you build"** (owner, 2026-10-15). It
  is in `CLAUDE.md`, `docs/working-rules.md`, the designer's proposal steps
  and the `pr-report` skill:
  - before any proposal or larger build: check what the repo already ships,
    then do a capped prior-art search, with a "Prior art" table in the
    proposal or PR;
  - permissive licenses only (MIT, BSD, Apache-2.0, ISC; MPL-2.0 with
    approval), never GPL, AGPL or unlicensed code;
  - any new library, or code copied from a repository, is an approval gate.
    It is pinned, vendored with its license text and checksum, and listed;
  - never outside code for the engine or the money logic.
- **`THIRD_PARTY.md`** replaces `VENDOR.md` as the one register:
  - every shipped library and font, with its version, license, why it's
    there, and its SHA-256;
  - how each file compares with the published package: identical, or the
    edits made and why;
  - the test-only and server packages;
  - the `npm audit` result: 0 vulnerabilities in the root and in `server/`.
- **License texts** now ship beside the files, in `vendor/licenses/`:
  ExcelJS, fflate, pdf.js, Tesseract.js, Tesseract.js core and Public Sans
  (OFL-1.1). They come from the published packages.
- **The service-worker test** (`tests/repo.test.js`) now leaves the license
  texts out of the app's install set, as it already did for `.md` files. A
  new check keeps them out, and requires a license text for each shipped
  library.
- **Three proposals, research only.** Nothing in the plan changes until the
  owner approves:
  - `docs/proposals/prior-art.md`: what to reuse for the upcoming work.
    Nothing new is needed except `.xls` (SheetJS, already approved, can't
    be fetched from here). Drag and drop is a later approval if wanted. It
    also covers the ExcelJS maintenance risk and the pdf.js upgrade
    question.
  - `docs/proposals/competitive-gap.md`: the leaders' modules against
    Zlatura's plan, how "Export everything" would end lock-in, a first-run
    path on a phone, and a ranked list of features that would make a
    broker switch.
  - `docs/proposals/production-readiness.md`: the owner's checklist of about
    150 items mapped to Zlatura, each with its tier, status and verdict.
    It has a fix-now list, the design decisions accounts must be built with
    from the start, and what a solo owner working with AI doesn't cover.
    One finding is real today: `t12.js` and `omstatement.js` round money on
    their own instead of with the engine's `toCents`. It's listed as F1 for
    the owner's approval, not fixed here.

Saved results and figures are unchanged (golden outputs identical).

## 4.7.11: a small browser check on every push, and branches kept current with main (on the development branch; not merged or deployed)

CI, tooling and docs only; the app is unchanged.

**The CI browser subset.** Before, GitHub Actions ran only the Node tests,
and the browser flows ran only in a Claude session.

- **A second CI job, `browser`**, runs four flows on Chromium at iPhone size
  on every push (owner, 2026-10-15): `typing-flow`, `lostedit-flow`,
  `deal-persistence` and `deal-export`.
  - Playwright's Chromium is cached between runs.
  - The Python packages the fixture scripts need are pinned in
    `tests/e2e/requirements.txt`.
- **`E2E_SKIP_RECALC=1`** leaves out `run.sh`'s LibreOffice recalculation,
  which CI doesn't have. `check:full` always runs it.
- **Timed:**
  - an empty cache: 1 min 46 s (the flows 65 s);
  - a filled cache: 1 min 44 s (the flows 72 s);
  - both round to 2 billed minutes a run.

**Merge conflicts don't recur.** Two PRs open at once both edited the top of
`CHANGELOG.md`, `docs/NOW.md`, `docs/PLAN_STATUS.md` and the version files,
so the second always conflicted (#28 with #27).

- **New standing rules** (owner, 2026-10-15), in `CLAUDE.md`,
  `docs/working-rules.md` and the `pr-report` and `release` skills:
  - every branch starts from the latest main;
  - before opening a PR, and again before calling it ready, main is merged
    in and conflicts resolved, the checks re-run, and GitHub confirmed to
    show no conflicts;
  - one PR open for the owner's merge at a time;
  - the changelog, status docs and version files change only in a PR's
    last commit;
  - a PR is called ready only when GitHub shows it mergeable with CI
    passing.
- **`npm run sync-main`** fetches main, merges it into the current branch,
  and lists any conflicted files.
- **`check:full`'s new last step** (`sync-main.mjs --check`) fails if the
  branch is behind main, or a tracked file has a conflict marker at the
  start of a line.
- **Proposed, not built:** changelog fragments, one file per PR
  (`docs/proposals/changelog-fragments.md`).

**Tested by `tests/check-tools.test.js`.**
- The CI job runs exactly the four flows, each one `run.sh` knows, and only
  CI skips the recalc.
- `sync-main` in throwaway repositories: current, behind, merged,
  conflicted, markers left, and a Markdown rule that isn't a marker.
- `check:full` ends with the check.
- The new tests fail on 4.7.10. Five mutations of `sync-main` are each
  caught.

Saved results and figures are unchanged (golden outputs identical).

## 4.7.10: a partial-year T-12 is never used as a year's figures (on the development branch; not merged or deployed)

Before, "Use the T-12's figures" on a T-3, T-6 or T-9 put its totals onto
the deal as they stood. The deal's figures are a year's, so a nine-month
NOI was read as the annual NOI. The cap rate, value, debt coverage, loan
size and returns were all worked out from a partial year. The sheet only
noted "not scaled up to a year".

- **It asks first.** On a statement of 1 to 11 months, the first choice is
  "Keep it as a partial year": nothing on the deal changes. The other is
  "Annualize it". That shows each annual figure (× 12 ÷ its months) and
  what annualizing can get wrong (seasonal items, one-time costs,
  lease-up), and changes nothing until you confirm. Cancel at either step
  changes nothing.
- **Annualized figures say so.** Each figure's source reads "T-12, Jan
  2025 to Sep 2025 (9 months), annualized × 12 ÷ 9". The card says the deal
  uses them annualized, as confirmed. One Undo puts the earlier figures
  back.
- **The math, in whole cents, in one place** (`t12.js annualized`). EGI,
  expenses and taxes are each scaled. NOI is the scaled EGI less the scaled
  expenses, so it still adds up.
- **The card says "A partial year"**, and labels its NOI with the months
  ("NOI, 9 months").
- **A deal saved earlier** that holds a partial year as a year's figures is
  not changed. It gets a warning in "What doesn't add up", naming the
  figures, the months and the way out. The warning goes when the figures
  are annualized or typed as a year's.
- **The convention** (`t12.months`) now reads: never used as a year's
  figures; scaled up only when you confirm it, and then marked annualized.

**Saved results are unchanged.** The golden outputs are identical: 646
displayed figures and 618 saved results. No golden deal holds a partial
T-12. The behaviour changed on the invented nine-month deal of the new
flow:

| | EGI | Expenses | NOI | Cap rate | DSCR | Warning |
|---|---|---|---|---|---|---|
| 4.7.9, "Use them" | $108,000 | $23,400 | $84,600 | 5.64% | 1.11x | none |
| 4.7.10, "Keep it as a partial year" (the default) | $150,000 | $30,000 | $120,000 | 8.00% | 1.58x | none |
| 4.7.10, "Annualize", confirmed | $144,000 | $31,200 | $112,800 | 7.52% | 1.49x | none |
| 4.7.10, a deal saved by 4.7.9 as in the first row | $108,000 | $23,400 | $84,600 | 5.64% | 1.11x | yes |

The deal's own figures were $150,000, $30,000 and $120,000 on a
$1,500,000 price, with a 65% loan at 6.75% over 30 years.

**Tested.**
- `tests/t12-partial.test.js` (6 tests) can't load on 4.7.9, which has no
  `annualized`.
- The new `tests/impact.test.js` case fails on 4.7.9.
- The new `t12partial-flow` (19 checks) fails 12 on 4.7.9, the bug among
  them. All pass now.
- Mutation checks, each caught:
  - no scaling;
  - NOI scaled by itself;
  - a full year annualized;
  - a typed figure still warned about;
  - an annualized figure taken as partial;
  - the partial-year question removed (10 browser checks fail).
- The impact map shows the warning moved by the T-12 and by each of the
  four figures.

## 4.7.9: project settings for model, effort and plugins (on the development branch; not merged or deployed)

Settings and docs only; the app is unchanged. The owner decided the three
questions from 4.7.8 (`docs/proposals/efficiency-setup.md`, "Decided").

- **Main session on Sonnet at medium effort** (`"model": "sonnet"`,
  `"effortLevel": "medium"` in `.claude/settings.json`). The designer agent
  stays on Opus and the builder on Sonnet.
- **32 plugins Zlatura doesn't use are off for this project only**
  (`enabledPlugins` in `.claude/settings.json`). `engineering`, `design`,
  `pdf-viewer` and `figma` stay on. The list, and how to turn one back on,
  are in the proposal's "Decided" section.
- **The CI browser subset** (typing, lost edit, deal persistence, deal
  export) is approved and comes in its own PR after the partial-year T-12
  fix.
- **A browser check that failed about 2 runs in 3 is fixed** (tests only).
  The axe check of the Review queue (`omrr-flow`, and the same helper in
  `omstmt-flow`) could run while the screen was still fading in. Its text
  was then part transparent, so it read as low contrast. The check now waits
  for the fade to end. It failed 2 of 3 runs before and passed 6 of 6 after.

Saved results and figures are unchanged (golden outputs identical).

## 4.7.8: cheaper sessions, with every check kept (on the development branch; not merged or deployed)

Tooling and docs only; the app is unchanged. Each session read the long
`CLAUDE.md` and much of `docs/PLAN_STATUS.md` before starting, and the
release steps and checks were typed out by hand every time.

- **`docs/NOW.md`** is the one file a session reads first: the version, what
  is merged, what is in progress, the build order, the open decisions and a
  state note for resuming after a usage limit.
- **A shorter `CLAUDE.md`** (91 lines, was 127). Every rule is kept, and
  their longer wording is in `docs/working-rules.md`.
- **Four skills that load only when needed**: `release`, `pr-report`,
  `hand-test` and `quality-gates`.
- **Read-deny rules** (`.claude/settings.json`) keep large or private files
  out of a session: `node_modules`, `.git`, the OCR and minified vendor
  files, `private/`, browser-test output and the lockfiles.
- **One command per check.** `npm run check:quick` runs the unit tests the
  change can affect, the type check and the golden check against
  `origin/main`. `npm run check:full` runs the whole Node suite, the type
  check, the golden check and the full browser suite. Every step runs even
  when one fails, and any failure fails the command. A change to the
  displayed figures fails the golden check unless the owner approved it
  (`GOLDEN_CHANGE_APPROVED=1` still prints the before/after table).
- **`npm run bump -- x.y.z`** sets the version in all five places it is
  written. If any file is out of step, it changes nothing.
- **`tests/e2e/run.sh` takes several flow names**; before, only the first
  was run.
- **Three decisions for the owner** are in
  `docs/proposals/efficiency-setup.md`: the default model and effort, a
  browser subset in CI, and the plugins to turn off.
- **Tested by `tests/check-tools.test.js`**: the bump in each file, refusals
  that change nothing, and that both checks exist, run every gate and fail
  on any failure.

Saved results and figures are unchanged (golden outputs identical).

## 4.7.7: an edit is kept when you leave the deal or close the app straight after it (on the development branch; not merged or deployed)

Since 4.7.3, a figure typed on the deal and committed with Tab was saved a
moment late. The focus fix (`app/focuskeep.js`) waited for Tab's focus to
land before running the field's whole change handler, and the save was
inside it. Leaving the deal in that moment lost the edit and raised a page
error; closing or switching away from the app on a phone could lose it too.
The 4.7.6 browser checks caught it (deal persistence failed about 3 runs
in 4).

- **The edit is saved at once; only the redraw waits** for focus to land.
  This covers the deal's figures, the What-if targets and every field in the
  lease editor.
- **A redraw that comes after the deal was left is skipped**, so nothing is
  drawn into, or read from, a deal that is no longer open.
- **Tested by a new browser flow** (`lostedit-flow`). It commits each kind
  of field exactly as Tab does, then leaves the deal or closes the app in the
  same instant. All 6 checks fail on 4.7.6 and pass now. Undoing any one of
  the three fixes fails its own check. The typing checks from 4.7.3 still
  pass (185).

Saved results and figures are unchanged (golden outputs identical).

## 4.7.6: a failed browser check now fails the run (on the development branch; not merged or deployed)

Tests only; the app is unchanged. Most browser flows printed PASS and FAIL
lines but exited with success either way, eight only printed values for a
person to read, and `tests/e2e/run.sh` ignored exit codes, so a failing
check could pass the suite unnoticed.

- **Every flow ends through one `finish()`** (`tests/e2e/finish.mjs`): it
  prints the totals and exits with an error when a check failed or no
  check ran. The eight print-only flows (deal persistence and isolation,
  comps reload, error messages, offline, template, comps, mobile audit)
  now check the values they used to print.
- **`run.sh` runs every flow, lists the ones that failed and exits with an
  error.** A LibreOffice recalculation with a formula error or a mismatch
  counts too. Workbooks left by an earlier run are cleared first, so only
  this run's are checked.
- **The deal export is in the suite.** `deal-export` (deal workbook, deal
  brief, comp workbook with the deal tab) was a print-only script outside
  the suite; it now checks all three, and both workbooks are recalculated.
- **Proved on purpose:** `E2E_FORCE_FAIL=<flow>` adds a failing check to
  that flow; the run then exits 1 and names it. On the old code a flow
  with a failing check exited 0. `tests/e2e-finish.test.js` covers both.
- **What it found:** the T-12 flow crashed on load in the first part of
  this change (fixed here), and the deal persistence flow fails about 3
  runs in 4: an edit typed and committed with Tab is lost when you leave
  the deal or reload straight away (since 4.7.3). That bug gets its own
  fix next.

## 4.7.5: income and expenses read from an OM's statement correctly, and checked (on the development branch; not merged or deployed)

Bug B. Figures read from an offering memorandum's operating statement could
come from the wrong column (the oldest year, a per-unit column, the pro
forma), ignore "($ in 000s)", take a per-unit row as a total, and go straight
into the deal even when the statement didn't add up. The statement is now
read as a table, checked by its own arithmetic, and every figure says where
it came from.

- **The right column.** Columns are found from where the figures sit and
  named from the headings above them, including a heading that spans two
  columns ("Pro Forma" over Year 1 and Year 2). In-place figures come from
  the latest actual column, a T-12 first; pro forma NOI from the first pro
  forma column. A statement with only Year 1, Year 2… uses Year 1 as NOI,
  labelled "Year 1 (projected)", with medium confidence. Plain years in the
  past are actual; this year and later are projected.
- **Units and scale.** "($ in 000s)", "$000", "in thousands" and "in
  millions" in the title, the headings or a note scale every figure, and say
  so. Per SF, per unit and % columns are never read as totals, nor is a row
  such as "Expenses Per Unit". A column with no heading whose figures times
  the building SF (or unit count) give another column is read as per SF (or
  per unit). "Real Estate Tax Reimbursements" is no longer taken for the tax
  bill.
- **A figure that can't be right stays put.** A cell that fails a check
  (a negative NOI, say) leaves that row unread and says why; the next column
  is never taken instead.
- **Checked by its own arithmetic.** For each column: the lines add up to
  each subtotal, the income lines to EGI, EGI less expenses to NOI, taxes are
  within expenses, and expenses are below EGI, within the larger of 0.5% or
  half a printed unit per line. Growth from one column to the next of more
  than 25% (income, expenses) is noted and more than 50% (NOI) flagged; never
  blocking. The arithmetic is the T-12 import's own (one copy of the math).
- **A statement that doesn't add up holds NOI, EGI and expenses back.** The
  Data QC panel in Key figures shows each check with its page, row, column and
  the cell marked on the line as printed. A failed check waits there and in
  Review with one-click fixes: keep as printed, use the subtotals (EGI less
  expenses), use the sum of the lines, or use another column. Your choice is
  recorded on the deal, and Undo takes it back.
- **Sources.** Each figure from a statement keeps its row, column, cell,
  scale and check, and shows under its label in words, not colour alone:
  "Actual 2025 · p.4 · high". The other columns of the same row are offered
  as alternatives.
- **Your saved deals.** Deals read before this version are kept exactly as
  they were and are not read again; read the OM again to check it. Every
  figure in the 618 saved deal results and 646 displayed figures is
  unchanged.
- **Tests:** 34 new statement tests (on page text and on PDFs, the checks,
  each fix, undo and a backup made by 4.7.4), and a new browser flow that
  reads an invented OM in thousands with a Per Unit column and a NOI that
  doesn't add up, fixes it in Review and undoes the fix.

## 4.7.4: rent rolls read from an OM correctly, with checks you can see (on the development branch; not merged or deployed)

Bug A. A rent roll read from an offering memorandum could lose rows, invent
tenants, mix up monthly and annual rent, and say nothing about it. It is now
read by where things sit on the page, every value keeps its source, and a
short Data QC list shows what was checked.

- **Read by position.** Columns are recognised from their headings, scored
  against every kind (so "Escalation Rate" is bumps, not rent per SF), with
  headings over one to three lines, "Resident" as well as "Tenant", and
  columns for bumps, monthly rent per SF, market rent and status. A name
  printed over two or three lines stays one tenant, even with its figures
  centred between the lines.
- **Over several pages.** A rent roll that runs on to the next page is
  followed, with or without its header repeated there. A lease comparables
  table later in the OM is no longer added to the rent roll. Each row keeps
  the page and line it was printed on, and each value the cell it came from.
- **Totals and subtotals.** "Retail Subtotal", "Totals / Averages" and a
  Total row with no label are recognised as totals, not tenants, and checked
  against the rows above them; a tenant called "Total Body Fitness" is a
  tenant. A subtotal no longer ends the table early.
- **Units, never guessed silently.** Annual, monthly, rent per SF a year or a
  month: from the heading first. A "Rent" column that doesn't say is worked
  out from rent per SF and flagged; a figure out of range (rent per SF printed
  under "Annual Rent", say) fails a check and is left as printed. Nothing is
  multiplied by 12 behind your back any more. "$60.0K" reads as $60,000.
- **Vacancies and dates.** A vacant suite with no SF is kept (and flagged);
  Holdover, M-T-M and Month-to-Month are month-to-month; a lease term printed
  as one "start – end" cell gives both dates.
- **Data QC.** After an OM is read, the rent roll card shows one line per
  check: pass, check, fail or note, each pointing to its page, row and cell.
  It compares the rent roll with its own Total row and with the OM's stated
  building SF, occupancy (now on the stated building SF, not the rent roll's
  own), in-place rent (a new figure, read from "Base Rent" or "In-Place
  Rent"), gross potential rent and units. A failed check holds the rent roll
  back until you resolve it, accept it, or resolve it in Review, where every
  check waits with its page, row and cell.
- **Scanned pages.** Each page with no text is flagged. "Read this scanned
  page" reads it with OCR (Tesseract, about 7 MB, downloaded from this site
  only the first time you use it, then kept for offline use). Every value
  read that way is marked OCR and waits for you to accept it.
- **Your saved deals.** Nothing changes in them except that a rent roll read
  from an OM by an earlier version is marked "read before Data QC". Every
  figure in the 618 saved deal results and 646 displayed figures is
  unchanged.
- **Tests:** 24 new rent roll tests (on page text and on PDFs), 7 on the
  checks, the Review items and OCR rows, a backup made by 4.7.3, and a new
  browser flow that reads
  an invented OM with a page carried over and a scanned page, resolves the
  failed check in Review, and reads the scanned page by OCR.

## 4.7.3: dates you type no longer disappear (on the development branch; not merged or deployed)

Bug C. Typing a date into the rent roll or the lease editor could wipe what
you had typed once you reached the year, and a number you finished with Tab
could leave you with no field selected. Both are fixed.

- **One date field everywhere.** Dates are now typed as plain text and read
  when you leave the field or press Enter, never while keys are going in.
  Nothing is reformatted or cleared as you type, and the cursor stays put.
  It understands `01/15/2027`, `1/15/27`, `2027-01-15`, `01152027` (what a
  phone's number pad gives) and `Jan 2027`, `January 2027`, `Jan-27`. A month
  on its own means its first day, or its last day in the fields that end
  something (lease end, a rent period's To, an abatement's To). A good date
  shows as `MM/DD/YYYY`. Something that isn't a date stays as typed, with a
  hint ("Try 01/15/2027 or Jan 2027") and isn't saved. Escape puts back the
  last saved date. A calendar button beside each date opens the phone or
  browser picker as the second way in.
- **Where it is used:** the rent roll grid, Assumptions (As of), the lease
  editor (lease start, rent start, lease end, rent periods, the rent
  generator, free rent, one-time items), comp sale dates, the Tools that take
  a date, the deal's next step and key dates, Home tasks and the date to try
  in What this affects. Dates are still saved the same way.
- **Years before 100.** The lease engine read a four-digit year like 0002 as
  1902; it now reads it as written. No saved deal is affected: every figure
  in the 618 saved deal results and 646 displayed figures is unchanged.
- **Tab after a number.** Finishing a number or percent in the lease editor,
  the Assumptions, the deal's figures or the What-if answers redrew that part
  of the page and dropped the field Tab was moving to. The page now puts the
  cursor back on the right field, and the Assumptions section stays open
  while you work down it.
- **Tests:** a new browser flow types character by character into every date
  and number field and checks, after every key, that the field holds exactly
  what was typed and still has focus.
## 4.7.2: the master plan in the repository, and the tracking checked against it (on the development branch; not merged or deployed)

The app itself doesn't change: this release is documents only, plus the
version number.

- **The master plan** is in the repository root as
  `ZLATURA_MASTER_PROMPT_v2.md`, exactly as you pasted it. It is never edited.
- **`docs/PLAN_STATUS.md`** was rebuilt against it, section by section:
  - every phase of Part 22, and every deliverable in Parts 0 to 24, each
    numbered by its section and marked done, partial, in progress, not
    started or blocked, with the module, test or version as evidence. That is
    374 items: 94 done, 125 partial, 4 in progress, 143 not started and 8
    blocked;
  - "synthetic only" wherever an item was tested only with invented files;
  - the 15 pillars of Part 2;
  - Part 7.5, operating statement normalization, broken out bullet by
    bullet, showing what the 4.7.0 T-12 import covers and what it doesn't;
  - the pro forma against T-12 bridge (Parts 6.3 and 7.9) as its own item;
  - where a Part isn't named in Part 22, the phase it was placed in, and why;
  - your later instructions kept first: the setup, the three bugs, the two
    proposals, the "New look" revamp, the feature map, the Data QC panel and
    the typing tests;
  - ten questions where the master plan and your later instructions differ.
- **`docs/acceptance-matrix.md`** has 77 new rows, each marked "Added 4.7.2"
  with its section number, for features of the master plan it didn't list.
  Two statuses were wrong and are corrected:
  - **mutation tests:** was "Not implemented", now "Partially implemented".
    Deliberate breaks are run on each PR, and 24 unit mix-ups are checked in
    every `npm test`;
  - **performance with 500 leases:** was "Partially implemented", now
    "Implemented, not fully tested". Its "works but slow" was true only
    before 4.2.0.

  One row was relabelled: "NOI bridge" is the potential-rent-to-NOI tool, not
  the master plan's 7.9 bridge, which now has its own row. Two notes were
  brought up to date with the 4.3.0 history.
- **`CLAUDE.md`**:
  - points at the master plan in the repository, and says to re-read its
    Part 0 and Part 23 at the start of every phase and before every report;
  - adds Part 0's rules: decide or ask, nothing merged or deployed without
    authorization, and a smaller honest version over a feature that can't be
    trusted;
  - adds the Part 21.2 prohibitions and Part 23's status words and
    truthfulness rules;
  - every report now ends with what was verified, what was not, what was
    assumed, and what is needed from you.

## 4.7.1: how the rest of the plan is built and tracked (on the development branch; not merged or deployed)

The app itself doesn't change. This release sets up the way the rest of the
master plan is built and tracked:

- **`docs/PLAN_STATUS.md`** has a checklist of every phase and item. Each one
  is marked done, in progress, not started or blocked. The feature list is
  generated from `docs/acceptance-matrix.md`, and the file is updated with
  every PR.
- **`CLAUDE.md`** holds the standing rules:
  - one PR per item;
  - approval gates;
  - golden outputs unchanged;
  - invented fixtures only;
  - tests that fail on old code;
  - version and changelog with every PR.
- **Two Claude Code agents** in `.claude/agents/`:
  - **designer**, always on Opus: proposals, bug diagnosis, parsing, money
    and calculation logic, data format, security and end-of-phase review;
  - **builder**, always on Sonnet: approved builds, UI, wiring, docs and
    tests.

  If the builder fails twice on the same problem, it hands back to the
  designer.
- **WebKit runs.** The browser suite can run on WebKit, Safari's engine:
  `PW_BROWSER=webkit bash tests/e2e/run.sh`. That needs WebKit installed;
  this environment has only Chromium, so runs here use Chromium at iPhone
  size.

## 4.7.0: the T-12, and the Review Queue (on the development branch; not merged or deployed)

Phase 2, milestone 1, as approved in `docs/proposals/t12-review-queue.md`,
with your four answers and two changes to the categories.

**Importing a T-12**

- **Where:** the deal's overview has a new "Operating statement (T-12)" card.
  "Import a T-12…" reads an .xlsx or .csv on the device; an .xls is refused
  with what to do.
- **What is detected:**
  - month headings in any common form (dates, "Jan-25", "January 2025",
    "01/2025", "Month 1");
  - a Total, TTM, T-12 or YTD column;
  - account numbers;
  - section headings;
  - subtotal rows, and the file's own EGI, total expenses and NOI;
  - negatives in brackets or with a trailing minus.
- **Signs are made consistent:** expenses written negative read as costs, and
  vacancy written positive under income reads as a reduction.
- **The 21 categories:**
  - income: base rent, vacancy and credit loss, concessions, recoveries,
    parking, other income;
  - operating expenses: taxes, insurance, utilities, repairs, contract
    services, property management fee, payroll, G&A, other;
  - below the line: capital, reserves, TI and leasing commissions, debt,
    depreciation, owner and partnership costs. Asset management and
    owner-level fees go here.
- **How each line is placed:**
  1. by your remembered choice for its label;
  2. by its wording, with the section it sits in deciding between two fits;
  3. otherwise it goes to Review.

  A label that only says "management fee" is never guessed: it goes to Review
  asking which it is.
- **What the card shows:** totals by category, EGI, operating expenses and
  NOI, with below-the-line items kept apart. "Every line" lets you change any
  line's category.
- **Remembered labels:** filing a line with "Remember this label" saves only
  the label and the category, never an amount. Settings lists them, and any
  can be forgotten. Backups carry them, and a merge restore combines them
  label by label, the newer winning.
- **A partial year** is shown as it is, never scaled up. It goes to Review as
  "Only N months", and its NOI isn't compared.
- **Undo:** importing, replacing or removing a statement is one step you can
  undo, with a snapshot first.

**NOI three ways**

- **The table:** a small table on the card shows the OM's NOI, the T-12's, and
  the rent roll's, labelled "forward-looking year 1 · a projection, not an
  actual". Each shows its gap from the T-12's in dollars and percent.
- **The checks:** three new checks, in "What doesn't add up", the brief and
  the workbook:

  | Gap | Flag |
  |---|---|
  | Within 2% | Nothing |
  | 2% to 5% | Noted |
  | Above 5% | Warning |

  - A warning lists where the gap comes from, largest part first (EGI,
    operating expenses, real estate taxes).
  - When the OM's NOI is the higher one, it adds that the OM may be pro forma
    or leave out expenses.
  - The thresholds are listed in Settings → Calculation conventions.
- **No change on deals without a T-12:** there is no comparison on them, so
  the 618 saved results and the 646 displayed figures are identical to 4.6.0.

**"Use the T-12's figures"**

- **What it does:** an explicit button, never automatic. It shows each
  figure's change before you confirm, then sets EGI, operating expenses, taxes
  and NOI, each tagged "T-12" with its months. It can also set the rent roll's
  operating expenses.
- **The OM's own figures** are kept for the comparison.
- **Undo** puts them back.

**The Review Queue**

- **The tab:** a new Review tab appears only when something is waiting, with
  a count. It is also in the search.
- **What it holds:**
  - T-12 lines to file, one item per label;
  - T-12 checks not yet seen: only N months, months that don't add up to the
    Total column, a stated subtotal or NOI that doesn't match;
  - AI readings never applied (dismiss);
  - firm template cells mapped with low confidence ("It's right").
- **Order:** items are listed with the most money at stake first.
- **Where each choice goes:** it is recorded where the item lives (the deal,
  the AI record, the template), so on a deal it can be undone.

**Smaller changes**

- `app/sheetread.js`: the spreadsheet reading the rent roll import used, now
  shared with the T-12 import.
- The phone tab bar fits six tabs.
- The tab bar is a little less see-through (94% light, 92% dark), so its
  labels keep their contrast over any page.
- A toast's action button is at least 32 px.

**Tests**

- **`tests/t12-layouts.js`:** eight invented statement layouts, written as
  files when the tests run. No real file, figure or name is in the
  repository.
- **`tests/t12.test.js`** (19 tests): reading amounts, months and labels;
  matching; each layout's category totals against hand-worked figures; signs;
  subtotals; partial years; remembered corrections.
- **`tests/t12-noi.test.js`** (7 tests): the NOI flags at each threshold,
  direction and cause; a partial year and lines still to file; the OM's own
  NOI after its figures are used; the Review Queue's items.
- **Changed tests:**
  - `backup.test.js`: corrections merged on restore;
  - `impact.test.js`: a deal with a T-12; every new check reads only what the
    map lists, and is moved by what it reads.
- **Mutation checks:** eight deliberate breaks, every one caught:
  - a bare management fee guessed;
  - negative expenses not flipped;
  - a partial year scaled up;
  - the warning moved to 10%;
  - the insurance rule removed;
  - asset management put in operating expenses;
  - the OM compared with the rent roll without a T-12;
  - dismissed AI readings kept.
- **`tests/e2e/t12-flow.mjs`** (35 checks) covers import, Review, filing,
  NOI three ways, use and undo, reload, Settings, the bare management fee,
  nine months, the AI and template items, .xls refused, and the phone. It
  fails on 4.6.0, whose deal screen has no T-12 card.
- **`a11y-flow`:** axe on the T-12 card, "Every line" and Review, in light
  and dark.
- **`tests/tools/t12-local.mjs`:** for real T-12s kept in the git-ignored
  `private/` folder. It prints only structure.

## 4.6.0: the keyboard shortcuts, on one sheet (on the development branch; not merged or deployed)

Phase 1, item 4: the `?` sheet.

- **Opening it:** press `?` anywhere you aren't typing. It is also
  "Keyboard shortcuts" in the search (⌘K or Ctrl K), and a button in
  Settings next to the ⌘K hint.
- **What it lists:** every key the app answers to, grouped by where it works:
  - anywhere: search, `/`, Esc;
  - in the search;
  - in a deal: undo, redo, the tabs, renaming, a figure's working;
  - in the rent roll grid: arrows, Enter, Esc;
  - in Settings: the theme control.

  It shows ⌘ and ⇧ on a Mac, iPhone or iPad, and Ctrl and Shift elsewhere.
  Ctrl Y appears only off a Mac, where it is the other redo.
- **Typing `?` in a field stays a question mark.** Escape closes the sheet.
- **One list, held to the code.** The list lives in `app/shortcuts.js`.
  `tests/shortcuts.test.js` reads every keydown handler in `app/` and fails:
  - if a handler answers to a key the list doesn't name for that file;
  - if a listed key is no longer handled.

  Checked by mutation: adding an `F2` handler to `command.js` fails the test,
  naming `command.js: "F2"`.
- **Tests:**
  - `shell-flow` (8 new checks): `?` opens the sheet; its groups and rows;
    focus is in the sheet; Escape closes it; the search and Settings open it;
    `?` typed in a field stays in the field. On 4.5.0, 6 of them fail.
  - `a11y-flow`: axe on the sheet, light and dark. The list takes the focus,
    so it scrolls from the keyboard on a small screen.

## 4.5.0: one list of migrations, run on open and on restore (on the development branch; not merged or deployed)

Phase 1, item 3: the migration registry, with the template count improvement
approved for this PR.

- **The registry.** `app/migrate.js` holds every change to a stored deal's
  shape, in order. Each step records what it did, in a version field on the
  deal, so it runs once:
  1. the money rounding (4.1: `moneyVersion` 1);
  2. the rent roll set up from the OM's rows, or an empty one (`schema` 2).

  Before this, the two lived in three places (opening a deal, drawing it, and
  the start-up pass), and a restored deal stayed in its old shape until it was
  opened. Now the open path, the restore and the start-up rounding all use the
  same steps.
- **On restore,** each deal an older version saved is brought up to date
  before it is stored.
  - The restore sheet says so: "3 deals saved by an older version are brought
    up to date as they are restored: money rounded to whole cents (1), rent
    roll set up (3)".
  - Each deal's history entry says so too.
  - The values rounded go into the rounding log, as before.
- **On open,** a deal in its old shape (one never restored) is brought up to
  date one step at a time, and each step is its own history entry. Before, the
  rounding's entry also held the new rent roll, and the "Rent roll set up"
  entry came out empty.
- **A deal from a newer version** (a version field above what this code
  knows) is left alone. A backup holding one is refused and nothing is
  restored: "This backup holds a deal saved by a newer version of Zlatura
  (“…”): update the app first."
- **What you see doesn't change.** For each deal in the old backup, restored
  and opened, the deal screen and the stored deal are exactly what 4.4.1
  gives. The lease ids are made new each time, and the time of the save
  differs.
  - One difference: a restored deal's rent roll "as of" date is the day of the
    restore, not the day it is first opened.
- **Template count.** The Affects sheet's firm template line now reads, for
  example, "Inputs!B6 · 1 formula directly, 2 in all". "In all" adds the
  formulas that read those formulas, and so on, with each counted once and
  stopping at 5,000. A formula that reads the cell through a named range now
  counts. A cell held by a named range names it: "Inputs!B12 (named range
  InterestRate)".
- **Tests:**
  - `tests/fixtures/backup-3.1.0-before-rent-roll.json` is a real backup made
    by the old apps from git (`tests/tools/make-old-backup.mjs`):
    - 3 deals read from the suite's test OMs by the version before the rent
      roll;
    - backed up by 3.1.0 without being opened, so they are in their old shape.
  - `tests/migrate.test.js` (7 tests):
    - each step runs on the 3.1.0 and 3.3.0 backups: one lease per OM row at
      the row's rent, and everything rounded;
    - a second run does nothing;
    - one step at a time equals all at once;
    - a newer deal is refused;
    - the restore line is right;
    - it **fails if a step is added without an old backup that needs it**.
  - `tests/e2e/migrate-flow.mjs` (20 checks) runs the new app beside 4.4.1,
    taken from git. On 4.4.1, 8 of its checks fail: the restore leaves the
    deals in their old shape, says nothing, keeps the newer deal, and records
    the open as one entry.
  - Formula reach is covered by `tplcells.test.js` (a chain, a named range
    read in any case, text that only looks like a reference, a circular pair,
    two cells sharing formulas, the cap) and by `impact-flow` (NOI: "1 formula
    directly, 2 in all"; the loan rate: its named range).

## 4.4.1: units the checker holds every number to (on the development branch; not merged or deployed)

Phase 1, item 2, as approved: the typed deal model with unit types. **Nothing
the app shows or saves changes.**

- **Units.** `types/zlatura.d.ts` defines them as "flavors":
  - dollars at one time, a year, and a month;
  - rent per SF a year and per SF a month;
  - price per SF and per land SF;
  - per unit, and per unit a month;
  - a rent in its quoted unit;
  - percent, fraction, relative change, points and basis points;
  - SF, land SF and acres;
  - years and months;
  - ISO dates, day numbers and Excel serials;
  - multiples.

  The same file describes the deal, the rent roll, scenarios, the analysis's
  results and the projection with them.
- **How a flavor works.** A plain number is accepted anywhere. A number known
  to be in one unit is refused where another is expected.
- **What carries units.** In `app/`, as JSDoc comments only:
  - the engine;
  - every registered figure: its result is held to its unit, and its unit
    label to that unit;
  - the lease engine (rents in their unit, converted only by
    `monthlyAmount()`);
  - the parsers (`parsePct` gives a percent);
  - the formatters (`pct()` refuses a fraction, `yrs()` refuses months,
    `money0()` refuses a percent);
  - the workbook's percent-to-fraction step.
- **The checker.** `tsc --checkJs` runs over every file in `app/` from
  `npm test`. TypeScript is a pinned dev dependency only, and its config and
  the types sit outside `app/` (`types/`). Nothing is built; the browser and
  the offline cache load exactly the files they did.
- **The 197 loose spots** the checker found in 4.4.0 are annotated, comments
  only. Of the 28 files changed in `app/`, 26 parse to the identical program.
  The other two differ only in this:
  - the more precise unit labels in `engine/figures.js` (NOI is dollars a
    year, NOI per SF is per SF a year, the price against the comps is a
    change);
  - the Affects sheet mapping those labels to the same formats as before.
- **Tests:**
  - `tests/types.test.js`: the check passes; at least 24 deliberate mix-ups
    are kept; and nothing the checker needs is in `app/` or the offline cache.
  - `tests/types/mistakes.js`: 24 mix-ups (fraction for percent, months for
    years, a month's rent for a year's, a price per SF as a rent, and more).
    Each must be a type error. On 4.4.0's code 22 of them go through (the
    other 2 test the deal-model types themselves, which 4.4.0 doesn't have).
  - `tests/units.test.js`: each figure's unit agrees with its template field
    type, its Deal Analysis cell (format, and a percent stored as a
    fraction), and how the brief shows it.
- **No change:**
  - the 618 saved deal results match;
  - the 646 displayed figures, workbook cells and tool results are
    byte-identical to 4.4.0;
  - `analyze()` runs at the same speed (0.357 ms against 0.357 ms).
- **Not split:** building SF into GBA, RSF and USF. That waits for Phase 2.

## 4.4.0: what a change affects (on the development branch; not merged or deployed)

Phase 1, checkpoint (e), part 2 of 2, as approved: the dependency map and its
screens.

### On screen

- **Affects** beside every input on a deal: each figure, loan term and What-if
  assumption, and each rent roll Assumption. The sheet lists everything that
  moves with it on this deal as it stands, in five groups:
  - figures (the deal's, the rent roll's, the projection's);
  - checks and questions;
  - scenarios (the What-if and each saved one; one that sets its own value
    is shown as not affected);
  - exports: Deal Analysis rows by cell, the rent roll sheets, the CSV, and each
    firm template's cells with how many of its own formulas read them;
  - documents: the brief by section, and Copy summary.
- **Could also affect** is folded away: what the input reaches only in other
  circumstances, each with its condition ("only when no price is entered",
  "only for a rent quoted per SF", "only when there are sale comps").
- **Try a value**: before → after for each line, without saving. On a lease or
  a rent roll Assumption the projection is worked out in the worker.
- **How it's worked out**: the overview's tiles open what their figure reads,
  with its conditions, down to the inputs you type.
- **Rent roll**: "What this lease affects" in a lease's ⋯ menu; "What a column
  affects…" in the rent roll's ⋯ menu.
- **History**: "What it changed" on each change.
- **Ctrl/Cmd K**: "What does … affect?" for each input of the open deal. These
  appear only when the search asks ("affect", "impact", "depends", "what does"),
  so a plain search such as "lender" still finds the contact first.

### How the map is kept true (`app/impact.js`)

- **Deal analysis:** each figure, check and question comes straight from the
  formulas registered in 4.3.2.
- **Everything else:** the rent roll summary, the projection's lines,
  scenarios, template fields, Deal Analysis rows and sections, the rent roll
  sheets, the brief's sections and the summary each declare what they read.
- **"On this deal, now":**
  - For the analysis, the formulas are run once with every read recorded, so
    a branch not taken (a price entered, so the cap rate isn't used for it)
    isn't counted.
  - Elsewhere, a read that only matters sometimes says how to tell.
- **Every file and printout the app hands over** names its part of the map
  (`deliver()` and `printed()` take `{ map }`). The backup, the pipeline,
  tools and comps say "none: why".
- **Two small changes, no figure changed** (`analyze-golden` still passes):
  - one rule tests for an entered price first, so the map can see the
    stated cap rate doesn't matter then;
  - the deal screen's list of figures moved to `dealfields.js` so the tests
    can read it.

### Tests (all new; they fail on 4.3.2, where there is no map)

- `tests/impact.test.js` (15):
  - every key `analyze()`, the rent roll summary, the projection and
    `runScenario()` return is registered: **adding a calculation without
    registering it fails**;
  - every template field declares its reads;
  - every `deliver()` and `printed()` call names its map entry;
  - each formula and template field may read only what it declares (a guard
    throws);
  - on 80 random deals and the rich rent roll (rents per SF and a year), each
    input changed in turn, everything that moved is on the map's list for it
    on that deal;
  - each declared read is read on some deal, and each input it reads is seen
    to move it;
  - no orphan inputs, and loops are refused.
- `tests/impact-files.test.js` (5): the same on two fixture deals, with and
  without comps (about 280 changes), for the deal workbook (each Deal Analysis
  row and section), the rent roll workbook, the brief (each section) and Copy
  summary. Every sheet, row, section and heading is registered, and the
  brief, the summary and the Deal Analysis sheet read only what they declare.
- Nine deliberate breaks (an unregistered figure, an undeclared or
  over-declared read, a wrong workbook row, a brief section missing a read, a
  rent roll figure or projection line missing a lease field, the scenario
  occupancy fix undone) are each caught by at least one test.
- `impact-flow` (29 checks, in `run.sh`):
  - the stated cap rate, with "could also" and its condition;
  - a firm template's NOI cell (not its price cell), with how many of the
    template's own formulas read it;
  - a tried loan rate, with DSCR before → after, nothing saved and History
    unchanged;
  - the DSCR tile's workings;
  - the command menu, and a plain search not crowded by it;
  - on the 500-lease deal: a lease's list, a column's list (SF doesn't move
    rents quoted a year), History's "What it changed" with a tried rent;
  - timings;
  - axe on the sheet, desktop and phone.

### Found by the tests while building

- `shell-flow` (an existing test): with a deal open, "lender" in Ctrl K found
  "What does lender minimum DSCR affect?" before the contact whose role is
  Lender. The commands now show only when asked for.
- A scenario that sets its own occupancy still reads the deal's: it scales the
  deal's income by the ratio. The map said otherwise; corrected.
- The SF of a lease moves its rent only when the rent is quoted per SF; the
  rent roll's rent figures now say so.
- Whether the price was worked out from the others, and whether the NOI was,
  are kept in one record. On the map they are two, so NOI no longer lists the
  price's template cell or workbook row.

## 4.3.2: the deal analysis, one registered formula per figure (on the development branch; not merged or deployed)

Phase 1, checkpoint (e), part 1 of 2, as approved. **No figure, check or
question changes.** This is groundwork for the dependency map ("what does
this change affect"), which comes in 4.4.0.

- `analyze()` (every figure on a deal's Overview, the What-if's figures, the
  deal workbook and brief, the checks under "What doesn't add up" and the
  questions) was one function. Each figure is now a formula registered in
  `app/engine/figures.js` with its label, unit and what it reads: other
  figures, or the deal's inputs. Each check and question is registered the
  same way. A formula can read only what is registered above it, so no figure
  can depend on itself; registering one that would is refused.
- `analyze()` keeps its name and gives the same result, key for key, so every
  screen, export and test that calls it is unchanged. `leaseStats` and
  `yearsLeft` moved with it and are still exported from `deal.js`.
- **Checked:** `tests/analyze-golden.test.js` holds what 4.3.1 returned on
  618 deals (the three OM fixtures, the deal tests' edge cases and 600
  seeded random deals with missing, zero, negative and text values),
  analysis and scenario, to the last digit. All match. Every figure as the
  app displays it, the deal workbook's cells and the tools (646 values,
  `tests/tools/golden.mjs`) are identical to 4.3.1.
- **Speed:** `tests/tools/analyze-bench.mjs`, the 500-lease deal, both
  versions alternating: 0.275 ms against 0.273 ms (+0.7%), and the other way
  round −1.2%: the same within measurement noise.
- The version is 4.3.2 only so installed copies pick up the two new files.

## 4.3.1: history in backups, and the space it may take (on the development branch; not merged or deployed)

Phase 1, checkpoint (d), parts C and D, as approved.

### Backups, version 2

- A backup carries each deal's history and snapshots. They are included by
  default; untick the option under "Back up everything" for a smaller file.
- A restore combines the backup's history with the device's by entry id, in
  time order, and adds snapshots the device doesn't have. Nothing in either
  is overwritten.
- Version 1 backups (4.2.1 and older, including 3.3.0's) still restore. Each
  deal's history then starts with the restore.
- 4.3.0 and older refuse a version 2 file with "made by a newer version".
- Removed photos and recordings (the 30-day trash) aren't in a backup.

### The space history may take

- **Per deal:** the last 1,000 changes or 2 MB of history, whichever comes
  first; the oldest go. History then says "kept since …".
- **Overall:** history, snapshots and removed media together get 50 MB, and
  never more than half of the browser's quota for the site. Over that, the
  oldest automatic snapshots go first, then the oldest history (any deal),
  then the oldest removed photos and recordings. Named snapshots are never
  removed.
- **Settings → Your data** shows what each takes against the space allowed.
  It warns from 80% of that space, or of the browser's quota.
- A deal's ⋯ → History can clear its history; the deal and its snapshots
  stay.
- **How sizes are kept:** in one small record, updated in the same
  transaction as each change. If it's missing (a 4.3.0 database), it is
  counted again.

### Tests

- `tests/backup.test.js`: 4 new tests, which fail on 4.3.0.
- `limits-flow`: 18 checks, which fail on 4.3.0:
  - version 2 backups with and without history;
  - restored on an empty device, Undo and snapshots work;
  - a 4.2.1 backup restores;
  - the 1,000-entry and 2 MB limits, "kept since", clearing a history;
  - recounting a 4.3.0 database;
  - the overall space with a 6 MB quota, automatic snapshots going first,
    and the 80% warning.

## 4.3.0: change history, undo and snapshots (on the development branch; not merged or deployed)

Phase 1, checkpoint (d), parts A and B, as approved. Backups version 2 and
the storage limits (parts C and D) follow in a second pull request.

### History and undo

- **History:** every change to a deal is kept in its history, as an entry
  with:
  - what changed, old and new;
  - a plain-English label ("NOI: 393,450 → 400,000", "Deleted unit 110",
    "Imported 500 units from a spreadsheet");
  - the time.

  Edits within one save (400 ms) are one entry. The entry is written in the
  same IndexedDB transaction as the deal, so both are saved or neither is.
  Changes made from Home or by a restore are recorded too.
- **Undo and Redo** for the deal:
  - buttons in the deal's header say what they would undo or redo;
  - Ctrl/Cmd Z and Shift Ctrl/Cmd Z (or Ctrl Y) do the same, except while
    you're typing in a field;
  - 100 steps, kept across reloads;
  - "Undo to here" in History (⋯ → History);
  - an undo is itself recorded;
  - an undo is refused, with a reason, if a value it would change has changed
    since.
- **Rounding:** values rounded as they are saved, and the 4.1 migration's
  rounding, are recorded as rounding entries in the deal's history. They are
  never undone.
- **Removed photos and recordings** are kept in a trash for 30 days, so an
  undo or restore can bring them back. A deleted deal's history and snapshots
  are kept 30 days too.

### Snapshots

- Named snapshots, up to 20 per deal.
- Automatic ones, up to 10, taken before:
  - a rent roll import;
  - Tools applying more than one field;
  - AI figures applied;
  - a snapshot restore;
  - a backup restore that overwrites the deal.
- **Compare** lists every difference, then and now. **Restore** is one step
  you can undo.
- An import too large to keep as one entry (over 256 KB of changes, e.g. 1,000
  leases) is undone by restoring the snapshot taken before it.

### Storage

- The database moves to version 2 and gains three stores: history, snapshots
  and trash. Nothing already stored is touched.
- If an older tab still holds the database, the new tab says so and waits.
  If a newer version takes over the database, the tab says "Reload to finish
  updating", and edits made meanwhile are kept in its recovery copy.

### Performance

- A save on the 500-lease deal now takes 15 ms instead of 3 ms (43 ms
  instead of 10 ms with the CPU slowed 4×), 400 ms after the last keystroke.
- No main-thread block of 50 ms or more.
- `perf-flow`'s budgets still pass: an edit is 80–88 ms against 67–79 ms on
  4.2.1, measured back to back.

### Tests

- `tests/history.test.js`: 13 tests, including 400 random round trips of
  compare-and-apply.
- `history-flow`: 18 checks.
- `snapshot-flow`: 24 checks, including axe on the History sheet.
- `upgrade-flow`: 20 checks. A 4.2.1 database with a deal, a photo, a task
  and a backup is upgraded, plus the blocked and outdated cases.
- The new flows and unit tests fail on 4.2.1.

## 4.2.1: a failed projection says so (on the development branch; not merged or deployed)

- **What if:** with NOI taken from the rent roll, a projection that failed
  left the panel on "Working out NOI year by year…" indefinitely, and every
  redraw asked again. It now says the projection couldn't be worked out and
  why, and shows no returns on another basis. Saved scenarios on that basis
  say the same.
- **Retries:** a failure is remembered by the rent roll's content, like a
  result, so the same rent roll isn't retried on every redraw. Any change to
  the rent roll tries again.
- **Tests:** `tests/projector.test.js` has a new failure test.
  `bigroll-flow` serves a worker that always fails and checks What if, a
  saved scenario and the Rent roll tab. Those What if checks fail on 4.2.0
  (3 of them) and pass now.

## 4.2.0: a 500-lease rent roll at speed (on the development branch; not merged or deployed)

Phase 1, checkpoint (c). On a 500-lease rent roll (medians, this container's
headless Chromium; details and every run in
`docs/proposals/checkpoint-c-results.md`):

| | 4.1.0 | 4.2.0 | Budget |
|---|---|---|---|
| Open the Rent roll tab | 1,843 ms | 189 ms | under 1 s |
| Edit a rent, totals shown | 1,065 ms | 66 ms | under 150 ms |
| The same with the CPU slowed 4×: open / edit | 9,699 / 4,894 ms | 814 / 326 ms | the edit misses 150 ms |

No figure changed: the golden comparison (646 figures) and an in-browser
comparison of every value shown for the 500-lease deal (1,026) are identical
to 4.1.0.

### The projection

- **14× faster** (873 ms → 61 ms for 500 leases over 10 years), with
  identical results. Date conversion is remembered instead of repeated, and
  each lease's period dates are converted once instead of every month.
  Checked against 4.1.0 on 7,931 outputs from 301 rent rolls.
- **Worked out in a web worker** (`app/projector-worker.js`, through
  `app/projector.js`). This covers the Rent roll tab, the Overview's
  gross-income check and What if's NOI from the rent roll.
- The rest of the screen draws at once; the projection fills in when it
  arrives. Results are kept per exact rent roll content, so a stale answer
  is never shown.
- If the worker can't load, the same work runs on the page. It works offline.
- Exports, template fills and the brief still work it out on the page, now
  14× faster.

### The grid

- A rent roll of more than 100 units draws only the rows near the screen
  (about 60) and draws more as you scroll. Rent rolls of 100 units or fewer
  draw whole, as before.
- The grid tells screen readers its full size (`aria-rowcount`) and each
  row's place.
- Arrow keys move past the drawn rows.
- A cell being typed in is saved if its row scrolls away.
- + Unit draws and focuses the new row.
- Totals, search and validation always cover every unit.
- The browser's own find (Ctrl F) and printing the screen see only the drawn
  rows of a long rent roll.

### Tests

- `tests/projector.test.js` covers the cache, the snapshots and the fallback.
- `tests/e2e/bigroll-flow.mjs` covers windowing, keys, saving on scroll,
  search, + Unit, axe, the worker, offline and the no-worker fallback.
- `tests/e2e/perf-flow.mjs` checks the budgets, timed inside the page,
  `THROTTLE=4` for a slow CPU. Both flows are in `run.sh`.

## 4.1.0: one calculation engine (on the development branch; not merged or deployed)

Phase 1, checkpoint (b). Each figure that was worked out in more than one
place now comes from one function in `app/engine/`, with the definitions
approved on 2026-10-10. Every figure that changed, before and after, is in
`docs/proposals/checkpoint-b-results.md`.

### One definition each

- **WALT** everywhere (Overview, Rent roll tab, brief, AI facts, WALT tool):
  - measured from the rent roll's as-of date, weighted by income, with
    month-to-month leases left out, in whole days of 365.25 a year;
  - the label says how, e.g. "WALT 3.9 yrs by income", with the full method
    on hover;
  - the Overview used to measure from today and count month-to-month rent at
    0 years: 2.7 → 3.9 years on the test case.
- **Debt service** amortizes over whole months everywhere, including the
  workbook's PMT formulas (`ROUND(years*12,0)`). At 27.4 years on
  $4,192,500: $336,150 → $336,079 a year. Whole and half years are
  unchanged.
- **Net effective rent:**
  - the comp workbook's Lease Comps formula now matches the NER tool:
    escalations compound at each anniversary, free months at the rent in
    force then. The example row goes $80.50 → $81.60;
  - labels say what the figure is net of ("free rent and TI", or "free rent,
    TI and commissions");
  - "Discounted net effective" is now "Net effective rent, discounted";
  - the Lease Comps tab still has no commission column, and its note says
    so.
- **Break-even occupancy:**
  - one function for the deal and the tool, which names its basis: GPR,
    estimated from gross income and occupancy "(est.)", or share of current
    income;
  - the tool gains optional gross income and occupancy inputs for when there
    is no GPR.
- **No price from a zero or negative NOI:**
  - the price shows "—" with a warning, on the deal and in Quick value;
  - it used to derive −$833,333 from −$50,000 at 6%.
- **Comps** count toward $/SF only with a price and size both above zero,
  everywhere, including the comp workbook's summary formulas.
- **Median comp age** in the comp-set check is the true median.

### Money

- Totals are stored in whole cents; rates per SF or per unit are stored to
  four decimals. Computed figures stay in floating point.
- New values are rounded as they are saved.
- Values already on the device are rounded once, when 4.1 first opens, and
  after a backup is restored. This covers deals, typed and edited comp
  prices, and the Tools' saved inputs and scenarios.
- Every value rounded is logged with where it was, the old value and the new
  one. Settings → Your data shows the count and the full list.
- Values are kept as rounded numbers, not integer cents, so the saved-data
  shape is unchanged.

### Calculation conventions

- Settings → Calculation conventions lists every convention the engine
  uses.
- WALT weighting (income or area) and month-to-month treatment (left out or
  counted at 0 years) can be set there; the rest are listed.

### Fixed while checking

- **The Overview's WALT read the deal's older flat copy of the rent roll.**
  After a lease edit it could disagree with the Rent roll tab. It now uses
  the lease rent roll.
- **The NER tool treated a part month of free rent (2.5 months) as a whole
  one (3).** Found when LibreOffice's recalculation of the new formula
  disagreed with the engine.

### Correction

- The Phase 0 report (D9) said the loan sizing tool's equity figure was never
  shown. It is shown, labelled "Equity needed … before closing costs".
- It was kept, not removed as approved on that wrong premise. The user
  decides.

### Tests

- `tests/engine.test.js`: 11 known-answer tests, with values worked out
  independently. 9 fail on 4.0.0.
- `tests/money.test.js`: 5 tests of the rounding and its log.
- The browser flow `engine-flow`.
- `tests/e2e/make_engine_check.mjs`: LibreOffice recalculates the new NER,
  PMT and comp formulas against the engine.
- `tests/tools/golden.mjs`: records every displayed figure and workbook cell,
  and diffs two versions of the app.

## 4.0.0: Zlatura (on the development branch; not merged or deployed)

Comp Loader is now **Zlatura**. *Every source. Every assumption. Every
number.* No figure, formula or saved-data shape changed; this release renames
the product and moves the data kept on each device to the new name.

### The move from Comp Loader

- The IndexedDB database `comp-loader` is copied to `zlatura` the first time
  4.0 opens: every store in one transaction, so it happens completely or not
  at all, and only into empty stores, so nothing newer is overwritten. A
  `meta` store records the move.
- `comp-loader.*` settings keys (theme, loan terms, subject, Tools inputs,
  recovery copies) are copied to `zlatura.*` once, before any module reads
  them. Copying only once matters: a recovery copy the app has deliberately
  cleared must not come back.
- The old database and keys are kept until a backup has been made since the
  move, or for 30 days, then deleted. Settings → Your data says so meanwhile.
- New files are written as `zlatura-backup`, `zlatura-project` and
  `zlatura-template`; the `comp-loader-*` formats are read for good, and old
  backups' settings come back under the new key names.
- Refilling a firm workbook that has a *Comp Loader Audit* sheet replaces it
  with a *Zlatura Audit* sheet instead of adding a second.
- The offline cache is `zlatura-4.0.0`; the old cache is removed when the new
  service worker activates.

### Identity

- A new mark (a Z with a bar through it, as currency signs are drawn), in ink
  and gold, with light and dark versions (`docs/brand/`), an adaptive SVG
  favicon, and new app icons (any and maskable).
- The tagline and "About the name" in Settings → About and the README.
- Every visible name, the page title, the installed app's name, workbook
  creator fields, file names, the AI server's name and package names.

### Fixed

- A deal's Pipeline card could wipe a next step being typed: changing the
  stage (or a task or contact changing anywhere) refreshes the card, and the
  refresh rebuilt its fields empty. It now keeps what is typed and the
  focus; a step that has been added still clears its field. Found when the
  browser suite failed intermittently on this; a test now forces the refresh
  (fails before the fix, passes after).

### Tests

- `rename-flow` (browser): the real 3.3.0 app, taken from git, is used on a
  site; the new app is served at the same address and must open with the
  deal, photo, task, contact, comp set, theme and loan terms; a backup then
  finishes the move (old database and keys deleted); a backup made by 3.3.0
  restores into a fresh copy of 4.0.
- `rename.test.js`: that 3.3.0 backup (kept as
  `tests/fixtures/backup-comp-loader-3.3.0.json`) reads and plans a full
  restore; old and new format ids; the once-only key copy.
- The template audit-sheet test covers a workbook filled before the rename.

## Zlatura Phase 0

- Fixed: the lease comparison tool's **Landlord PV** was the NER multiplied by
  area and years (a sum of payments, not a present value). It is now the
  present value of the landlord's cash at the discount rate, after TI and
  commission, as its label and note say. At 12% on $1,000 a month for a year it
  shows $11,367.63, not $12,000.
- Added the Phase 0 baseline report, the Zlatura acceptance matrix and the
  architecture proposal under `docs/`.

## 3.3.0 (on the development branch; not yet merged or deployed)

A redesign of how the app looks and is found around. No formula, data
mapping, saved-data format or scenario rule changed; every screen still shows
the same figures from the same calculations. The version (and the offline
cache name) is 3.3.0, so an installed copy fetches the new files once.

### Design system

- One stylesheet, `app/styles.css`, built on tokens: a warm paper and ink
  palette with a single cobalt accent for links, focus and selection, a brass
  identity mark, semantic good, warning and bad colours, a 4-point spacing
  scale, radii, borders, elevation and motion durations. Every figure uses
  tabular numerals; property names and page titles use a serif.
- **Light, dark and system** appearance, chosen in the sidebar or in
  Settings and kept on the device. It is applied before the first paint, so
  there is no flash of the wrong theme; the browser chrome colour follows it.
- Consistent controls: one primary (ink) button per area, bordered secondary
  buttons, quiet fills; 38 px fields; segmented controls; switches; chips.
- Motion is short and only shows a change of place or state; with Reduce
  Motion on, it is removed.

### Navigation

- A sidebar on a computer (Home, Deals, Comps, Tools, then Settings) and a
  five-tab bar on a phone. The app opens on Home.
- **Search or jump** (⌘K, Ctrl K or "/"): deals, contacts, the 30 tools,
  screens and actions, from the keyboard. It opens at once and keeps what is
  typed while the deals load. Results are grouped, with the group holding the
  best match first.
- **Settings**: appearance, template library, pipeline stages, the AI
  connection, backup and restore, and the version. Backup moved here from
  Home; Home still says when there is no recent backup and links to it.

### Screens

- **Home**: a greeting with the day's real counts and the three common
  starts (read an OM, add comps, new task); four summary figures; **Continue
  working** with each recent deal's stage, asking price, cap rate, NOI and
  next step (or that none is set); Needs attention; key dates; the pipeline
  with a stage bar; tasks; activity; contacts.
- **Deal workspace**: the property name is the page heading, with its stage
  beside it (kept in step with the Pipeline card); Overview, Rent roll, What
  if and Site visit are underline tabs that stay in view while scrolling and
  then show the deal's name. On a wide screen the analysis sits in a main
  column with the pipeline, next steps, rent roll summary and questions in a
  rail; on a tablet or phone the pipeline and next steps come first.
- **Dense figures**: sticky table headers; the rent roll's unit column and
  the projection's row labels stay in place while the table scrolls sideways;
  the what-if comparison is kept to a readable width.
- **Tools**: the 30 tool icons are tinted by group instead of one colour each.

### Fixed

- Home could show no deals, and a task's deal as deleted, for the first
  moment after reading an OM (the new deal was not yet saved). The deal list
  now includes deals that are open but not yet saved.
- Typing straight after ⌘K could lose the first characters.
- The section tabs could show the deal's name (their scrolled state) while the
  header was still in view, when a deal was opened from a hidden screen: the
  first of several batched visibility reports was read instead of the last.
- At 320 px the Comps screen's Excel output choice was 1 px wider than the
  screen; segmented controls now wrap their labels on narrow screens. The
  browser tests' overflow check compared against a width that grows with the
  overflow, so it could not catch this; it now compares against the layout
  width.
- On a slow device, a new contact's details could end up in the name: the
  sheet focused its name field 50 ms after opening, even if a person had
  already moved to the phone field. It now leaves a chosen field alone.
- Task checkboxes were 22 px, under the 24 px minimum target size.
- Chart labels and the tab bar's labels were 10.5 px; now 11 px.

### Tests

- New browser flow `shell-flow` (navigation, theme persistence across a
  reload, search or jump, Settings controls, phone tab bar).
- The accessibility flow now also audits Settings and the search dialog, and
  Settings, Comps, the rent roll, What if and the search dialog in dark mode.

## 3.2.0 (merged into `main` in pull request #2)

The version (and so the offline cache name) is 3.2.0, so an installed copy
fetches every new file whole once this reaches the published site.

### New

- **Rent roll workspace** (Deal → Rent roll). Leases as dated rent periods
  with a lease engine behind them (`app/lease.js`): per-month, per-year and
  per-SF rents, step increases, day-weighted proration, free rent and partial
  abatements, recoveries (pro rata, base year, stop, fixed), percentage rent,
  one-time items, renewal and re-leasing blended by probability, lease-up, and
  a monthly and annual projection to NOI. Configurable columns, presets,
  saved layouts, keyboard navigation, validation (overlaps, gaps, bad dates),
  expirations, concentration, import from Excel or CSV, and Rent Roll, Lease
  Schedule and Cash Flow tabs in the deal workbook. What if can use the
  projection's NOI year by year.
- **Template library.** Upload a firm's own .xlsx or .xlsm, map deal fields to
  its cells (suggested from named ranges and labels, corrected on a
  tap-to-map view), preview every cell before writing, and fill it in place:
  formulas, formats, merges, named ranges, hidden sheets and macros kept, an
  optional audit sheet of every value written and its source. Versions,
  duplicate, export and import as one file.
- **Tools: 23 new calculators**, 30 in all, in seven groups with search:
  discounted cash flow (optionally on the rent roll's NOI), NOI bridge,
  break-even occupancy, value sensitivity; amortization schedule, refinance
  and cash-out, floating-rate stress with a rate cap, maturity and refinance
  risk, financing costs; hold returns before and after sponsor fees, IRR
  sensitivity, a distribution waterfall with IRR hurdles, commission and
  splits; lease proposal comparison, renewal versus replacement, escalation
  schedule, percentage rent, recoveries, absorption; a comp set check; and
  residual land value, yield on cost and construction draws.
- Every tool can **save named scenarios**, **export** to Excel or print, and
  explain its formula; tools that use deal figures can **load them from the
  open deal**. Loan sizing, the NOI bridge and hold returns can **send their
  result to the deal**, after a confirmation listing each change from old to
  new; figures are tagged as typed from that tool, and hold assumptions go to
  the What if scenario, never the deal's figures.
- The Deal screen is split into Overview, Rent roll, What if and Site visit.
- **AI features, through an optional server** (`server/`, which holds the API
  keys; the app holds only its address and an access token). Read documents
  with AI: figures come back with their passages, which the app checks against
  the document text before showing them, and nothing is applied until the
  broker ticks it. Ask about this deal: answers from the deal's facts with
  citations. Transcribe voice notes, correct the transcript, and make notes
  (summary, decisions, action items, figures mentioned). Every send is
  confirmed; with AI off nothing leaves the device.
- **Home**: a dashboard with what needs attention, the pipeline by stage
  (stage also on each deal's new Pipeline card, with its history), tasks by
  due date, contacts linked to deals, recent activity, and every file saved
  or page printed. A pipeline report exports to Excel or prints. Call-note
  action items can become a deal's next steps. Nine stages (the firm can
  rename or hide them) and key dates per deal, with the next 30 days on Home.
  The deal brief includes call-note summaries, labelled as AI summaries.
- **Backup and restore** of everything on the device in one file (deals with
  photos and recordings, comps, templates, tasks, contacts, settings; never
  the AI token). Restoring merges, newer copy winning, or replaces everything
  after a second confirmation. Home shows storage use, whether the browser may
  clear it, and the last backup, and reminds after 30 days.
- **Reconciliation without AI** (`app/reconcile.js`): quoted passages checked
  against page text, readings grouped by tolerance (never auto-picked), and
  the rent roll checked against the OM's occupancy, SF, rent and units.

### Fixed (accessibility and security)

- Text contrast: the faint grey, the green, amber and teal now meet WCAG AA
  (4.5:1) on every surface they sit on, light and dark.
- Tap targets of at least 24 px (WCAG 2.2): page-source tags, chips,
  checkboxes; sideways-scrolling tables can be reached and scrolled from the
  keyboard; the file pickers have names; chart points have a role for their
  labels; a date field shows a focus ring on its calendar button too.
- A Content-Security-Policy forbids plugins, a re-pointed base URL and form
  posts; the page sends no referrer.
- The AI server limits each client to 20 AI requests a minute.

### Tests

- `tests/lease.test.js` (18), `tests/tplcells.test.js` (7) and
  `tests/calc.test.js` (12) check the new maths against figures worked out by
  hand or independently.
- `tests/reconcile.test.js` (5) for quote checks and reconciliation;
  `tests/pipeline.test.js` (6) for stages, key dates, task due dates and attention;
  `tests/backup.test.js` (4) for the backup round trip and restore plans;
  `server/test/server.test.mjs` (10) runs the server and the real Anthropic SDK
  against a local stand-in for the API. No live model call is tested: that
  needs a key.
- Browser flows `rentroll-flow` (22 checks), `template-flow` (16),
  `tools-flow` (28), `home-flow` (32), `backup-flow` (16: a wiped browser restored, photos byte
  for byte) and `ai-flow` (26, against the real server code and
  stand-in model and speech services), and the filled template recalculated
  in LibreOffice.
- `a11y-flow` (24 checks): axe-core's WCAG 2.0/2.1/2.2 A and AA rules on every
  screen and the main sheets, light and dark, with no violations; every
  control Tab reaches on Home shows a focus ring; 24 px targets; reflow at
  320 px. Automated checks are a floor: no screen-reader session was run.

## 3.1.0

A reliability release, found by testing every workflow in a phone-sized
browser, and a live what-if on the Deal tab.

### Fixed

- **A deal edited and closed within half a second was lost**, and a change
  made just before switching deals could be written into the next one. Saves
  now belong to their deal and are flushed on switch, close and leaving the
  app; a change still in flight when the app is closed is replayed on the next
  launch. Comp edits get the same protection.
- **Photos chosen for one deal could land in another** if the deal was
  switched while they were being shrunk. They now always go to the deal they
  were chosen for; so do voice notes, and a photo's Undo.
- **Closing costs, transfer tax and commission typed as 0.5 were read as
  50%.** These fields take a percentage as typed; a % sign is always taken
  literally.
- **Break-even occupancy was overstated** for a part-let building (it divided
  by effective rather than potential income). It now uses gross potential
  rent, else effective income scaled by occupancy, and says which.
- Gross potential rent is no longer taken for effective gross income, and
  pro forma NOI is read from the Pro Forma column of an operating statement.
- The lease clock counts down from the expiration date, not the OM's printed
  "years remaining".
- Value at the comps' cap rate warns when one or two comps carry it, and is
  withheld for a zero or negative NOI.
- On iPhone, tapping a field no longer zooms the page; comp prices and dates
  fit on the narrowest phones; the page-source tags take a finger-sized tap.
- Unreadable PDFs say why and what to do. A comps batch where every file
  fails says so.
- The brief no longer leaves a heading alone at the foot of a page (and is
  now called the deal brief: a full one runs to a second page).
- An installed copy downloads each release whole, bypassing the HTTP cache,
  so it can't mix old and new files; it checks for an update when reopened.
- The GitHub test workflow, `.nojekyll` and `.gitignore` are back.

### New

- **Live deal: what if**, with hold-period returns (levered and unlevered
  IRR, equity multiple, exit value), the price for a target cap rate or IRR,
  saved scenarios, and Save to deal only on confirmation.
- **Voice notes** on the site visit: record, or add a Voice Memos file.
  Stored with the deal, not transcribed.
- Site-visit lines say what was observed and what was told.
- A legend for the figure tags, and a fictional example deal.
- Known-answer finance tests.


## 3.0.0

A redesign, and two new screens beside the comps: **Deal** and **Tools**.

### New

- **Offering memorandum scanner (Deal tab).** Choose an OM's PDF and the asking
  price, NOI, cap rate, building and land size, units, year built, occupancy,
  income, expenses, taxes, zoning, single-tenant lease terms and the rent roll
  are read from it. Every figure shows the page it came from: tap the tag to see
  the line, and pick another reading if the OM prints more than one. Any two of
  price, NOI and cap rate give the third, marked as derived.
- **What doesn't add up.** The OM checked against itself: a stated cap rate that
  isn't NOI over price, a $/SF on a different square footage, a rent roll whose
  occupancy or area disagrees with the summary, pro forma upside, light
  expenses, and thin debt coverage.
- **Against your comps.** The asking $/SF against the sale comps on the Comps
  tab, where it falls in their range, and the value at their $/SF and median cap.
- **Financing and loan sizing.** Loan, debt service, DSCR, debt yield, cash flow,
  cash-on-cash, break-even occupancy, and the largest loan the property supports
  by LTV, DSCR and debt yield. Your terms are remembered for the next deal.
- **Value across cap rates**, WALT and rollover from the rent roll, and
  **questions to ask**, written from the gaps in the OM, to tick off on site.
- **Site visit**: a walk-through checklist, notes and photos, kept with the deal.
- **Deal outputs**: an Excel workbook (Deal Analysis and Rent Roll tabs, every
  result a live formula), a one-page brief to print or save as PDF with the
  photos, a five-line summary to text, and "use as the comps subject". The comp
  workbook can carry the open deal's analysis as a tab after the Summary.
- **Your own Excel template.** Upload the comp sheet your firm already uses and
  the Excel button fills it: the header row is found and each column matched to
  a comp figure by its wording, and you can change any match. Only the comp
  cells change; formatting, formulas, charts, logos and every other sheet stay
  exactly as they were. The built-in workbook is one tap away.
- **Tools tab**: quick value, loan sizing, offer price and seller net sheet, net
  effective rent, 1031 exchange deadlines, WALT and rollover, and a converter.
- Saved deals, stored on the device; deals, template and settings survive a reload.

### Changed

- **New design.** A tab bar on the phone and a sidebar on a desk, grouped cards,
  the system font, a cobalt-and-teal palette, light and dark, and a new icon.
- **Comps on a phone are cards**, not a table to scroll sideways. Every figure is
  still editable in place.
- **Faster comps.** Search, sort (by $/SF, date, price, size, cap rate or name),
  include or set aside every comp in one tap, read two PDFs at a time with
  page-by-page progress, and the PDF reader and Excel library start loading
  before the tap that needs them.
- Export, CSV, comp sheet and project actions are in one action sheet.
- Copyright Kyle Alexander De Melo.

### Fixed

- The first visit no longer announces "a new version is ready".

## 2.1.0

### New

- **Buyer, seller and deal terms.** Each comp now carries CoStar's true buyer and
  seller (the recorded entity when no true party is printed), sale type
  (investment or owner-user), sale conditions (1031 exchange, bankruptcy, high
  vacancy, sale-leaseback and so on) and hold period. They appear on the Sale
  Comps tab, in the comp detail panel, in the CSV, and beside the Adjustment
  Grid, where they inform the conditions-of-sale adjustment.
- **Comp detail panel.** ⓘ on any row shows everything on a comp: figures,
  parties and terms, flags, CoStar's full notes, and a map link.
- **Printable comp sheet.** One landscape page with the headline figures and both
  comp tables, for a BOV or an offering memorandum. Print it, or save it as a PDF
  from the print dialog.
- **CSV export**, with a single full-address column that Google My Maps can
  geocode, so the whole comp set can go on a map in a minute.
- **Owner-user** sales and listings are marked in the comp tables.
- **Lender-guideline flags in the Adjustment Grid.** Each comp shows its overall
  net adjustment; comps past 15% net or 25% gross (both editable) are shaded and
  counted. These are underwriting guidelines, not limits, so nothing is dropped.
- The version number is shown at the foot of the page.

### Fixed

- **The market-conditions adjustment came from a regression that explained
  nothing.** Across a mixed comp set the $/SF-over-time line measures which
  properties sold when, not how the market moved; in the southeast Baltimore set
  it implied +61% a year and adjusted one sale up 341%. On all seven test sets R²
  was between 0.01 and 0.27. The adjustment now starts at 0% unless the line is
  reliable (five or more sales, R² 0.5 or better, within ±10% a year), and the
  reason is printed beside the rate.
- The size-adjustment note told you to enter a negative rate to adjust a larger
  comp up; with the formula as written, that adjusts it down. The note now
  matches the formula.
- Older iPhones could not read PDFs: the pdf.js build used needs Safari 17.4.
  The legacy build, which polyfills what is missing, supports iOS 16.4 and
  later, and an older browser is told plainly to update.
- The "Install app" button, the iPhone home-screen hint and an empty file list
  showed on every device: the stylesheet let a class override `hidden`.
- On a slow connection, a nine-second start-up timer could declare a working
  browser unsupported and hide the app for good. Start-up is now judged when the
  page finishes loading, and a file that failed to download gets its own message.
- Opening the app and dropping a report before saved work had loaded could
  overwrite the new report with the old session.
- Library files are now named with their version, so an installed copy can never
  keep a stale one from its cache.
- Montgomery County zones written without a hyphen (`CR3.0`) and the industrial
  zones (`IL-1.0 H-50`) now give a buildable SF.
- The test workflow failed on GitHub before running a test: it needed a
  `package-lock.json`, and `npm test` pointed at a folder Node 22 will not
  accept. Two tests also checked for the wrong XML spelling.
- Test dependencies: fflate 0.8.3 fixes a ZIP64 parsing loop (the browser copy
  is updated too), and uuid is pinned to a patched release. `npm audit` is clean.

### Checked

Every XML part of every generated workbook now validates against the ISO/IEC
29500 schemas, the check behind Excel's "We found a problem with some content".

## 2.0.0

### New in the workbook

- **Charts tab.** Native Excel charts: sale comps ranked by $/SF, sale $/SF over
  time with a linear trendline, and listings ranked by asking $/SF. They read
  live cell ranges, so they move when a comp is edited, and they carry cached
  values, so they draw in Protected View and in previews.
- **Adjustment Grid in the appraisal sequence.** Property rights, financing,
  conditions of sale and market conditions compound to a normalized $/SF; the
  property adjustments (location, size, age and condition, quality, occupancy
  and lease, other) are then summed and applied once. Each comp shows its gross
  adjustment and a reliability weight, and the conclusion is given both by your
  weights and weighted toward the comps that needed the least adjusting.
- **Pricing matrix.** The subject's value at a ladder of cap rates, with the
  center and the step as inputs, and each row's $/SF and premium or discount to
  the asking price.
- **Market read.** Median asking $/SF against median sold $/SF, and a count of
  sales in the last eighteen months that warns when the set is thin.
- **Montgomery County zoning.** Zone names such as `CR-3.0 C-2.0 R-2.75 H-145`
  state their own maximum FAR; it is read from the name, added to the Zoning
  Catalogue, and Bethesda and Silver Spring comps get a buildable SF.
- **No fifteen-comp ceiling.** The grids hold fifteen, as the template did, and
  grow when more comps are included.
- **Prepared by** line on the Summary.
- Hand edits, moves between Sales and On Market, and hand-entered comps are all
  named in each comp's flags and on the Audit Trail.

### New in the app

- Reports **add to the set**. Dropping a second batch no longer replaces the
  first, and edits survive.
- **Your work is kept** on the device between visits, and can be saved as a
  **project file** to open on another device or hand to someone else.
- **At a glance** panel: headline figures, a ranked $/SF chart of sold and
  asking side by side, and sale $/SF over time with the trend.
- **Add a comp** by hand, **move** a comp between Sales and On Market,
  **sold-within** window for the sales.
- Comps past the fifteenth are kept and set aside rather than dropped; tick one
  to include it.
- **Share** the workbook straight to Mail, Outlook or Files from a phone.
- Numbers can be typed as brokers type them: `5.2m`, `850k`, `6.25%`.
- Installs as an app on Android and desktop Chrome or Edge, and shows iPhone
  users how to add it to the home screen. On the desktop, an installed copy
  opens PDFs double-clicked in the file manager.
- Starts faster: the PDF reader and the Excel writer load only when needed.

### Fixed

- Editing a figure redrew the whole table and lost the keyboard's place.
- An edited price or size could leave the workbook out of $/SF order. The
  workbook is now always written high to low.
- Installed copies never picked up a new version unless the cache was renamed.
  The app's own files now come from the network first.
- Vertical alignment in the workbook was silently dropped by ExcelJS, so cells
  sat at the bottom of their rows.
- `INDEX` on a zoning code with no FAR recorded returned 0 rather than blank.
- A sale with no date in the Adjustment Grid read as day zero, a century ago.
- An active listing laid out as "Status  Active" on a line of its own was
  flagged as under contract. (The Python loader had the same flaw; it is fixed
  there too.)
- Lowercase zoning matched in Excel but not in the stored value.
- Typing `5.2M` blanked the price.
- One malformed comp page stopped the whole batch.
- Clipboard text starting with `=`, `+`, `-` or `@` could run as a formula when
  pasted into a spreadsheet.
- The download's file name used tomorrow's date after 8 p.m. Eastern.

## 1.0.0

First release: CoStar comp PDFs parsed in the browser into the comp workbook,
with the same rules as the original Python loader.

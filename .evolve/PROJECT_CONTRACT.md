# Project contract

Last updated 2026-11-10. Sources: `CLAUDE.md`, `docs/working-rules.md`,
`docs/owner-requests.md`, `docs/proposals/ui-filler-design-language.md`.

## The goal (the owner's words, 2026-11-10)

A **sellable all-in-one real estate product**:
- the owner's Codex-built underwriting tool runs **unchanged** inside the
  Underwrite tab (`docs/proposals/uw-embed-as-is.md`);
- its design is the **basis for every screen**, "similar, but even better"
  (`docs/proposals/ui-filler-design-language.md`);
- **accurate document reading** with **full human override**;
- **company templates** filled correctly;
- **one dashboard** for deals, clients, tasks and documents;
- **every role**, from brokers to lenders (`docs/proposals/role-workspaces.md`);
- **connections to the systems people already use, by lawful routes**
  (`docs/proposals/all-in-one-research.md`, tiers a-e).

Zlatura is a vanilla-JS ES-module offline-first PWA. No build step. GitHub
Pages serves `main`. The repo is public.

## Invariants (never trade these)

1. **One engine** (`app/engine/`, `app/deal.js`); never a second copy of the math.
2. **Money is whole cents.**
3. **Blank is never zero.** Units are **never guessed**: ask instead.
4. **Golden outputs identical** (618 saved results, 646 displayed figures)
   unless a change is logged in `DECISIONS.md` with a before/after table.
5. **Invented fixtures only.** Real files stay in git-ignored `private/`;
   report structure-only counts.
6. **The private underwriting package is never committed**, quoted or copied.
7. **Clean room:** no vendor formats, files, layouts, text, leaked code or
   trademarks (`docs/working-rules.md`).
8. **No feature is removed**; whatever is touched gets better.
9. **New tests must fail on the old code** (`git archive <old>` served with `BASE=`).
10. Prohibited (master plan Part 21.2): calculator checking itself, double
    counting, mixed units or area bases, invented values for ambiguous input.
11. Truthfulness (Part 23): never say verified, live or secure unless tested
    that way; say what was not run (Safari, Excel, live vendors).

## Working mode (set by the owner 2026-11-10)

Replaces the earlier pull-request and approval-gate routine for this work:
- **Commit directly to `main`, with checks run first.** No pull requests.
- **Do not pause at approval gates.** Decide, do, and record.
- Anything that **changes saved figures or the data format** is logged in
  `DECISIONS.md` with a **before/after table** for the owner's later review.
- Still stop and report at: usage limits, spending money, secrets, deleting
  user data, hosting or production changes, and the owner's explicit holds.
- After each change: bump version files, `CHANGELOG.md`, `docs/NOW.md`,
  `docs/PLAN_STATUS.md` (the `release` skill), and this ledger.
- Checks first: `npm run check:quick`; `npm run check:full` when `app/` or
  `tests/` changed. One browser-suite run at a time (see `LESSONS.md`).

## Licence policy (so the product can be sold)

- **Permissive** (MIT, BSD, Apache-2.0, ISC): adopt freely; pin, vendor with
  licence text and checksum, list in `THIRD_PARTY.md`.
- **Copyleft** (GPL, AGPL): only as **separate tools, never shipped in the
  product**. Never linked or copied into `app/`.
- **Source-available or custom** (e.g. Elastic-2.0): internal dev use only.
- **No licence:** read for ideas, **never copied**.
- Never outside code for engine or money logic.

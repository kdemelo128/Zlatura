# Competitive gap: what the suites do, and what Zlatura should do about it

Research and proposal only, 2026-10-15. **Nothing in the plan or build order changes until the owner approves.** Where Zlatura stands is taken from `docs/PLAN_STATUS.md` and `docs/acceptance-matrix.md`, using the Part 23 status words. What the leaders offer comes from their public marketing pages or from third-party aggregators; none of it was tried. Every claim from a marketing page is marked *vendor claim*. Prices are aggregator figures and unconfirmed: roughly $85 to $250 per user per month for the broker suites, and about $12k a year and up for the investor platforms. Capabilities are described in plain words; no competitor's names for its features, its wording or its layouts are used.

Leaders looked at:
- broker suites: Buildout (which owns Apto), Apto and Crexi;
- data: CoStar and LoopNet;
- investors: Dealpath;
- valuation: ARGUS;
- residential-style all-in-one suites: Lone Wolf and similar.

## (a) Module by module

| Module | What the leaders offer | Applies to commercial investment sales? | Zlatura today | Verdict |
|---|---|---|---|---|
| **Front office** | | | | |
| Property and listing websites | A page per listing with its documents (Buildout, Crexi; vendor claim) | Partly: a marketed deal needs a gated page, not a public site | Not implemented (13.6 share links) | **Already planned**, 13.6: secure share links with expiry, watermark and NDA gating. No site builder. |
| Residential IDX websites, ad management, lead-gen funnels | Residential suites (vendor claim) | No | Not implemented | **Deliberately skip** (owner). |
| Listing syndication to marketplaces | Pushes a listing to the big marketplaces (Buildout; vendor claim) | Yes, but the marketplaces control access | Not implemented; not in the plan | **Integrate instead of building**: export listing copy and facts the broker can paste into a marketplace (13.1). Add an API connector to 17.5 only if a marketplace documents one the firm may use. |
| Prospecting likely sellers | Ownership and seller-likelihood lists (Buildout, CoStar; vendor claim) | Yes | Not implemented (17.1 owners and entities) | **Already planned**, 17.1 with bring-your-own data (10.4). No data business of our own. |
| **Middle office** | | | | |
| CRM | Contacts, companies, properties, call lists, deal funnel (Apto, Buildout; vendor claim) | Yes | Contacts with roles, linked to deals: Implemented and verified. Companies and entities: Not implemented | **Already planned**, 17.1. |
| Buyer matching | Best-fit buyers suggested by a learned model (Crexi; vendor claim) | Yes: the core of a sale | Not implemented (17.2, Pillar 8) | **Already planned**, 17.2. Rule-based and explained, with no black box. |
| Marketing automation and email campaigns | Template blasts and campaign tracking (Buildout, Crexi; vendor claim) | Yes, for teasers and updates | Not implemented | **Integrate**. Zlatura builds the list, the draft (13.1) and the outcome log (17.2). Sending goes through the broker's own mail (share sheet or mailto) now, or a mail provider's API later (17.5). Opt-outs are honoured (17.2). |
| Engagement tracking | Opens, downloads, visitor alerts (Crexi; vendor claim) | Yes | Not implemented (13.6) | **Already planned**, 13.6. Needs hosting (Phase 7) and consent wording. |
| OM creation | OMs, flyers and proposals from firm templates, data entered once (Buildout; vendor claim). Reviewers call it template-bound and slow to set up | Yes | One-page deal brief: Implemented and verified. OM, BOV and decks: Not implemented (13.1–13.4) | **Already planned**, Part 13. The difference is an Evidence Panel and a Pre-Flight Gate on every claim (13.3, 13.5). |
| **Back office** | | | | |
| E-signature | Built into the residential suites (vendor claim). The open-source tools (Documenso, DocuSeal, OpenSign) are **AGPL-3.0** | Yes | Not implemented (17.5) | **Integrate by API or by link, never by embedding their code**. Commercial licenses exist for two of the three. A link-out needs no account work and can come first. |
| Compliance review | Checklists, missing-signature audits, deadline tracking (residential suites; vendor claim) | Partly: commercial files are lighter | Not implemented (18.1, 18.2, 13.5) | **Already planned**, 18.1, 18.2 and 13.5. Skip the residential licensing audits. |
| Transaction and closing tracking | Deal stages, diligence workflows (Buildout, Dealpath; vendor claim) | Yes | Key dates: Implemented and verified. Critical dates: Partially implemented. Closing workspace: Not implemented | **Already planned**, 18.3 and 18.4. |
| Document center | Documents per deal and property (Apto, Dealpath; vendor claim) | Yes | Not implemented (12.1); the OM's PDF is not kept | **Already planned**, 12.1. It is also what makes "Export everything" whole (b). |
| **Financials** | | | | |
| Commission splits | Plans with splits, tiers, caps, co-brokes and referral fees (Apto, commission tools; vendor claim) | Yes | Split calculator in Tools: Implemented and verified. Nothing stored on the deal | **Add to the plan** under 5.1: a fee record on the deal (gross fee, splits, co-broke, referral) in whole cents, using the same engine function as the tool. It feeds pipeline analytics. |
| Agent billing, invoices, receivables | Back-office billing (Apto; vendor claim) | Firm back office, not deal work | Not implemented; not in the plan | **Integrate**: CSV of fee records for the firm's accounting system. |
| Payouts | Agent payouts | No (owner) | — | **Deliberately skip** (owner). |
| Accounting, trust accounting | Accounting-package links; trust ledgers (suites; vendor claim) | Accounting yes; trust accounting is regulated | Not implemented | **Integrate** (export now, an API under 17.5 later). Skip trust accounting. |
| Reporting | Pipeline and activity reports (Buildout, Apto; vendor claim) | Yes | Pipeline report on Home; analytics and the seller activity report: Not implemented | **Already planned**, 5.1 and 17.2. |
| **Analysis** | | | | |
| Underwriting and valuation | The cash-flow standard, scenario comparison, model storage (ARGUS, Dealpath; vendor claim). Reviewers note a steep learning curve | Yes: the depth that brokers lack | Partially implemented (7.2); native templates: Not implemented (7.1) | **Already planned**, 7.1, 7.2 and 7.8. No import of other vendors' model files. |
| Comps and market data | Millions of researched comps, analytics, forecasts (CoStar, Crexi; vendor claim) | Yes | CoStar PDF comps: Tested with synthetic fixtures only. Excel or CSV import and the map: Not implemented | **Integrate**: bring your own exports (10.1, 10.4), already planned. Never build a comp database. |
| OM and T-12 reading | AI extraction of OMs and flyers (Dealpath, Crexi; vendor claim) | Yes | OM tables: Partially implemented. Statement import: Partially implemented. Multi-format is next (build-order item 4) | **Already planned**, 6.2 and 7.5. The difference: a source for every number, with no silent AI. |
| Pricing and bid leveling | Scenario comparison on the investor side (Dealpath; vendor claim). No broker-side offer comparison was found | Yes: every sale ends here | Not implemented (7.3, 17.3, Pillar 7) | **Already planned**, 7.3 and 17.3. Ranked high in (c). |
| Capital markets | Fund allocation, institutional listing exchange (Dealpath; vendor claim) | Debt yes; fund tools no | Debt sizing: Implemented and verified. 15.2–15.5: Not implemented | **Already planned**, Part 15. Skip fund allocation and listing exchanges. Live rates need a paid provider (a cost gate). |

## (b) Designing for the suites' weaknesses

**Depth.** The suites manage records and make documents. They don't check the numbers. Zlatura's edge is the analysis behind the brochure:
- every figure keeps its source, page and cell;
- the OM red-flag check and the T-12 bridge;
- one engine in whole cents;
- pricing shown as ranges with their assumptions (7.3);
- offers compared on net proceeds (17.3).

**No lock-in, concretely.**
- *What exists today* (`app/backup.js`): one restorable JSON file, format version 2. It holds:
  - deals, with photos and recordings (base64), history and snapshots;
  - the comp set and templates;
  - tasks, contacts and activity;
  - Tools scenarios, rent roll layouts and settings.

  The AI token is left out. Restoring merges (newer wins) or replaces. Old backups migrate through `app/migrate.js`. Comps already export to CSV (`exporters.js`) and each deal to a workbook. The gaps: no single "everything" package, no CSV for contacts or tasks, no published schema, and source PDFs are not kept until 12.1.
- *Proposal:* **Settings → Your data → Export everything** writes one zip, using fflate, which the app already ships:
  - `backup.json`: the same restorable file as today, unchanged;
  - `deals/<deal>/`: the deal workbook (`.xlsx`), the brief as printable HTML, the deal as JSON, its history, and its photos, recordings and source documents as the original files (documents once 12.1 keeps them);
  - `contacts.csv`, `tasks.csv`, `activity.csv`, `comps.csv`;
  - `schema/`: a documented JSON Schema, generated from `types/zlatura.d.ts`, with a field glossary in plain words;
  - `README.txt`: a manifest with a sha256 checksum for every file.
- *Re-import:* restore reads `backup.json` from the zip through the existing merge or replace. Contacts can come back from CSV through a mapped import (17.4).
- *Tests:* round-trip export, re-import, compare equal. An old-backup fixture. A mutation check that drops a deal from the zip and must fail.
- *Gates:* publishing a schema commits us to it, and a zip of everything is a data-retention matter. Confidential deals are named in the export dialog. A PDF brief would need a PDF writer, which is a new library and an approval gate, so it is HTML until then.

**Fast onboarding.** Reviewers say the suites are slow to set up. Proposal: a first-run path on the phone that needs no account:
1. Open the app and choose "Try a sample deal" (invented, labelled as such) or "Choose an OM PDF".
2. See the figures read, each with its page.
3. Clear the three to five flagged items.
4. Read the finished deal brief, then share it as text or print it.

A timed browser flow at iPhone size proves the path. Guided Mode (20.5, Pillar 15) adds "why this matters" notes and step checklists, toggled per user.

**Speed and privacy.**
- Local-first: no account and no upload; it works offline (Field Mode).
- AI is off by default, and every send is confirmed (16.1.6).
- A "confidential" tag (19.2) can work locally now, before any accounts exist. It would block AI sends, warn before sharing or exporting, and watermark the brief.
- Edits stay within the 150 ms budget.

## (c) Switch features, ranked by value and effort

1. **First-run path to a finished deal brief on a phone** (S). 20.5 and Pillar 15, with 13.1. It is the first five minutes of any trial.
2. **Export everything** (M). Local export in 19.1 and the ZIP packages in 12.4. It answers lock-in fears directly.
3. **OM red-flag list with evidence, plus the T-12 to pro forma bridge** (M). 6.3 and 7.9; already build-order item 5. The suites don't check broker math.
4. **Bid Leveler and client offer summary** (M). 17.3 and Pillar 7. Net proceeds come from the seller net sheet's engine function, not new math (money logic, designer review).
5. **Pricing worksheet with a football field of ranges** (M). 7.3.
6. **Confidential tag that limits sharing and AI** (S). 19.2. It makes "private by default" visible.
7. **Fee record on the deal and pipeline analytics** (S). 5.1, with the 11.1 split tool.
8. **Buyer profiles, an explained match and a call sheet with a seller activity report** (L). 17.1 and 17.2, Pillar 8.

## (d) What this would change in the build order (proposal only)

Today's order: 4 T-12 multi-format, 5 OM red-flag check and bridge, 6 UI revamp phases, 7 the rest of Phase 2, then Phases 3 to 8. Suggested changes, each its own PR and its own approval:
- Items 4 and 5 stay as they are.
- **Export everything** comes after item 5. It is small and independent, but it needs the schema and data-retention decision first.
- The **first-run path** joins the revamp's "Home and navigation" phase. The rest of **Guided Mode** follows the screen clean-ups.
- In the rest of Phase 2, take **7.3 pricing** early.
- The **confidential tag** moves from Phase 7 to before Phase 5's outreach and Phase 6's live AI. It needs no accounts.
- **17.3 Bid Leveler**, with the **deal fee record**, moves ahead of Phase 3. **17.1 companies and 17.2 buyer match** follow, before the rest of Phase 5.
- Unchanged: integrations stay in Phase 7 (17.5: OAuth, hosting, cost), and e-signature is first a link-out.
- **Added to the plan, if approved:**
  - the fee record on the deal (5.1);
  - the CSV export of fees for accounting;
  - export of listing copy for marketplaces (13.1);
  - the "Export everything" zip with a published schema (19.1).
- **Owner decisions needed:**
  1. Approve this reorder. *Recommend: yes.*
  2. Publish a JSON Schema as a commitment. *Recommend: yes, versioned with `migrate.js`.*
  3. A PDF writer for the brief (a new library). *Recommend: not yet; HTML first.*
  4. The confidential tag ahead of accounts. *Recommend: yes.*

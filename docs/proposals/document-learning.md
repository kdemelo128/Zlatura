# Making document reading and data transfer very good: how your documents are used

Status: **proposal, for the owner.** Goal (owner, 2026-11-07): the document parsing and data
transfer in Zlatura should be good enough that no outside AI is needed. This note says what
documents help most, what happens each time you add some, and how we know it improved.

## The idea in one paragraph
Reading quality comes from **real examples of each layout, paired with the correct answer**, not
from volume. Zlatura already has the answer format: the lease abstract fields
(`tests/fixtures/abstract-read-*.json`), the rent roll and T-12 shapes (`app/rentroll.js`,
`app/t12.js`) and the deal model. Every document you add is used to teach one of the readers
(`rentroll.js`, `t12.js`, `leaseread.js`, `omstatement.js`) a layout it does not yet handle, and a test
proves it. We do not need to train a large language model for this; rules, table extraction and the
vendored text-recognition engine cover most of it. A small local model can be added later only for
the layouts the rules cannot handle (separate approval).

## What helps most (in order), and a useful amount of each
Counts are my estimates, not measured. A "layout family" is one source system or template.

| # | Document | Why it matters | Useful amount |
|---|---|---|---|
| 1 | Rent rolls from different property-management systems (and Excel exports) | most format variety; drives occupancy, rent, WALT | 5 to 10 per family; every family you see |
| 2 | T-12s and operating statements, every layout | the NOI line items and period handling | 5 to 10 per family |
| 3 | Leases and amendments, text and scanned | the abstracts (rent steps, options, CAM) and OCR | 20 to 50 across lease types; some poor scans on purpose |
| 4 | Offering memorandums with the underwriting built from each | fills the OM-to-model path; pairs for checking | 10 to 20 |
| 5 | Your finished underwriting workbooks with their source files | the best labelled pairs: source in, correct model out | as many as you have |
| 6 | Appraisals, Phase I and property-condition reports | comparables and risk flags | 5 to 10 each |
| 7 | Title, survey, estoppels, SNDAs, CAM reconciliations | lease and diligence cross-checks | 5 each |
| 8 | Settlement statements, loan term sheets, credit memos | sources and uses; credit fields | 5 to 10 each |
| 9 | Loan outcomes ("paid off early at X", "defaulted month 18, vacancy") | only matters if we later predict risk | hundreds, so not yet |

Include the ugly ones: scans, rotated pages, merged cells, footnotes, multi-property rolls.
**Predicting loan risk needs hundreds or thousands of loans with known outcomes**; a handful of
defaults teaches nothing. That is a later project.

## What happens each time you add documents (the routine)
1. You put the files in the git-ignored `private/` folder (or tell me where they are). That folder
   never goes to GitHub, so a file with a name or a figure that should not be public cannot leak by
   accident. If you want a specific file in the public repo, say so for that file.
2. I report **structure only**: how many files, which layout families, which readers fail or
   hesitate, what they misread.
3. For each failure I write an **invented lookalike** (same layout, made-up names and numbers) as a
   test fixture, with the correct expected output. The test must fail on the old code.
4. I fix the reader, run the full checks (nothing already correct may change: golden figures stay
   identical), and put it in a PR for you.
5. The PR report lists what was learned from this dump: layouts now handled, layouts still not, and
   a field-level hit rate on the new files.
6. The new layout becomes part of a permanent regression set, so it can never silently break again.

## Measuring "better"
A field-level scoreboard per layout family: of the fields in your correct answers, how many are
read right, read wrong, asked about (ambiguous), or missed. The target is zero wrong (a wrong
number is worse than a question), then fewer questions. The report prints the table every time.

## Training pairs (only if we later fine-tune a small model)
One JSON line per pair; invented example:
```
{"doc_type":"rent_roll","source":"<extracted text or page image id>","expected":{"suite":"210","tenant":"Example Bakery LLC","sf":1850,"monthly_rent_cents":462500,"lease_end":"2029-08-31"},"layout_family":"pm-system-a","reviewed":true}
```
Money in whole cents; units named; blank is never zero; anything unsure is marked, not guessed.

## Box download automation (separate PR, only if it works well)
Goal: pull the due-diligence, analysis and recent-year sale folders without you downloading each by
hand, from the hub, into a folder outside the repository. Needs a Box developer token or app that
only you can create; the token stays on your Mac. Built and tested on stand-ins; I cannot test
it against your Box. Real data is never sent to me or committed.

## What I need from you
1. The Codex zip with the more advanced underwriting tool and UI (next big item after the hub).
2. Documents in `private/`, starting with rent rolls and T-12s from as many source systems as possible.
3. Confirm `private/` as the default place, or name files that may be committed.

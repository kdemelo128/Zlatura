# PDF page evidence and mixed-OM routing

Implementation of the owner's page/content-routing request and the 1,005-file baseline in `.evolve/EVALS.md`. This slice indexes page evidence, recognises common joined header words, and prevents a real OM rent-roll section from turning the whole file into an OM-versus-rent-roll type question. It does not guess missing amounts, period or units, or introduce saved fields.

Reuse existing positioned `rentRoll`, `statementTables`, `readOm`, QC and preview paths. A page may have several roles; a low-text page is marked unreadable/needs OCR, not asserted to be a photo. Classification metadata remains transient. The existing readers keep the financial meaning and original PDF page numbers. The actual failing OM stays on the owner's device; its correctness is not claimed from acceptance counts.

| Prior art | Licence/size/maintenance | Offline/network | Decision |
|---|---|---|---|
| Existing `omroll`, `omstatement`, `om`, `ddintake` | Project MIT; maintained here, already shipped | On-device; no service added | Reuse parser evidence and routing |
| Existing PDF.js 4.7.76 | Apache-2.0; vendored/pinned in THIRD_PARTY | Offline worker | Keep extraction and geometry |
| Existing OCR and shared document scoreboard | Project code; Claude owns their next changes | On-device, counts only | Expose unreadable pages and stable page evidence for them; do not duplicate |

Tests use invented page-14 rent-roll/statement/summary documents, unknown headings, explicit annual rent, continuation rows and original page provenance. Compare archived main, assert exact independent figures, type/golden checks and the full gate. Score synthetic answer-bearing files with the existing scoreboard. The owner reruns the private 1,005-file collection; no private content is available or read here.

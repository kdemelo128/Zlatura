# Prior art: what to reuse before building (2026-10-15)

Research and proposal only. Nothing here is built or added until the owner approves. **Adding any new library is an approval gate**, and so is changing the major version of one we already ship. Owner's test for any library: a permissive license (MIT, BSD, Apache-2.0, ISC; MPL-2.0 only with approval; GPL and AGPL never), maintained, small, no build step, vendored, works offline, makes no network calls and sends no telemetry, fits the 150 ms edit budget, and has a pinned version with its license text and checksum. Sizes were measured from the published packages or from our `vendor/` files. Licenses and dates come from npm metadata. None of it was re-checked by hand.

**Needs nothing new:** OM table reading, date parsing, Excel export, charts, animation, themes, bottom navigation, `.xlsm`, text PDF, OCR and `.docx`. **Waiting on the owner:** `.xls` only (SheetJS, already approved as decision 11 of `t12-multiformat.md`, but the file can't be fetched from here).

## T-12 multi-format import (`t12-multiformat.md` §2)
| Candidate | Does | License | Size | Last release / maintenance | Build-free + offline | Network / telemetry | Security | Verdict |
|---|---|---|---|---|---|---|---|---|
| ExcelJS 4.4.0 (have) | `.xlsx`, `.xlsm` read | MIT | 948 KB (258 KB gz) | 2023-10; nothing newer | yes, vendored | none | macros never run; reads on the main thread (a known gap) | **keep**: `.xlsm` needs no new code path |
| SheetJS CE 0.20.3 | `.xls` (97–2003) read | Apache-2.0 | ~0.44 MB (141 KB gz, measured on 0.18.5) | npm copy stuck at 0.18.5 (2022-03); fixed builds only on cdn.sheetjs.com | yes, if vendored in a worker, loaded on demand | none known; **not checkable here** | npm 0.18.5 has CVE-2023-30533 and CVE-2024-22363; 0.20.3 is said to fix both (**not checked: cdn.sheetjs.com is unreachable from this session**) | **adopt as approved**, only if the owner supplies the file or allows the CDN; until then `.xls` stays refused |
| pdf.js 4.7.76 legacy (have) | text PDF, page layout | Apache-2.0 | 381 KB + 1.4 MB worker | latest is 6.4.299 (2026-10-03) | yes | none | past CVE-2024-4367 (fixed in 4.2.67); `isEvalSupported: false` on both paths (`pdftext.js:45`, `ocr.js:44`) | **keep** (see the version question below) |
| tesseract.js 7.0.0 (have) | scanned PDF and image OCR | Apache-2.0 | 6.7 MB, on demand, outside the install set | 7.0.0 (2025-12) is the latest | yes, files pinned by path | none: no CDN fallback, no IndexedDB cache | runs in a worker; output always labelled OCR and always reviewed | **keep** |
| mammoth 1.13.0 | `.docx` to HTML | BSD-2-Clause | 405 KB (101 KB gz), 8 deps | 2026-09, active | needs its browser bundle | not checked | converts the whole document, which is more than we need | **build ourselves**: too big for reading tables |
| docx-preview 0.4.1 | renders `.docx` | Apache-2.0 | 76 KB (21 KB gz) plus jszip | 2026-09, pre-1.0 | would add jszip | not checked | pre-1.0 | **skip** |
| Own reader: fflate 0.8.3 (have) + DOMParser | `w:tbl` rows and cells, `gridSpan`, `vMerge` | MIT / ours | a few KB of our own code | fflate 2026-05 | yes | none | unpacked-size and ratio limits (§2) | **build ourselves** (approved decision 12) |

## OM table reading
| Candidate | Does | License | Size | Last release / maintenance | Build-free + offline | Network / telemetry | Security | Verdict |
|---|---|---|---|---|---|---|---|---|
| `omstatement.js`, `omroll.js` on pdf.js (have) | statements and rent rolls read by position, each cell with its page, row and column | ours | 642 + 822 lines | ours, tested with synthetic fixtures only | yes | none | nothing in the document runs | **keep what we have**: no candidate in the research reads tables in the browser with no build step. Server-side table tools would send OMs off the device. |

## UI revamp (`ui-revamp.md` §§2–5, decisions 1–18)
| Candidate | Does | License | Size | Last release / maintenance | Build-free + offline | Network / telemetry | Security | Verdict |
|---|---|---|---|---|---|---|---|---|
| Hand-rolled SVG (`glance.js`, planned `app/viz/`) | screen charts | ours | 277 lines today; est. 10–14 KB core | ours | yes | none | none | **build ourselves** (approved §4.0): a few dozen marks per chart; SVG is accessible, prints, and follows the theme tokens |
| uPlot 1.6.32 | fast canvas time series | MIT | 51 KB (22 KB gz), 0 deps | 2025-03 | yes | none found | none known | **skip**: canvas, built for thousands of points we don't have |
| Chart.js 4.5.1 | general canvas charts | MIT | ~200 KB, 1 dep | 2025-10 | yes | none found | none known | **skip**: too big, and canvas |
| SortableJS 1.15.7 | drag to reorder, including touch | MIT | 45 KB (15 KB gz), 0 deps | 2026-02 | yes | none found in the minified file | none known | **not now**: decision 11 approved buttons, not dragging. If dragging is wanted after phone testing, this is the one to adapt (approval gate) |
| Motion 14.3.0 | animation | MIT | 154 KB (52 KB gz), 2 deps | 2026-10 | yes | not checked | none known | **keep what we have**: CSS and the Web Animations API cover §5's 120–250 ms opacity and transform |
| `theme.js` + tokens (have) | light, dark, system, accent | ours | 54 lines | ours | yes | none | none | **keep**; accent swatches are tokens |
| Tab bar and rail (have) | bottom navigation on the phone, left rail on the desktop | ours | none new | ours | yes | none | none | **keep** (owner's answer 2) |

## Date parsing
| Candidate | Does | License | Size | Last release / maintenance | Build-free + offline | Network / telemetry | Security | Verdict |
|---|---|---|---|---|---|---|---|---|
| `dateinput.js` (have) | typed broker dates, read on blur, 1900–2100, real days only | ours | 209 lines | ours; covered by `typing-flow` | yes | none | none | **keep what we have** |
| date-fns 4.4.0 | date maths and formats | MIT | large unless tree-shaken (a build step) | 2026-05 | only file by file | none | none known | **skip**: we have nothing for it to do |
| chrono-node 2.10.3 | natural-language dates | MIT | 3.2 MB unpacked | 2026-10 | yes | none | ReDoS-shaped risk on free text (not tested) | **skip**: guessing at ambiguous dates is prohibited (Part 21.2) |

## Excel export
| Candidate | Does | License | Size | Last release / maintenance | Build-free + offline | Network / telemetry | Security | Verdict |
|---|---|---|---|---|---|---|---|---|
| ExcelJS 4.4.0 + `charts.js` (native Excel charts as DrawingML) + `package.js` (have) | styled workbooks, formulas, live charts | MIT | as above | **no release since 2023-10** | yes | none | labels written as text, so `=HYPERLINK(` stays text | **keep**, with the plan below |
| SheetJS CE | read and write | Apache-2.0 | as above | as above | as above | as above | as above | **skip for writing**: as far as we know, the free edition doesn't write cell styles (not checked here) |

## Flags for the owner
- **ExcelJS maintenance risk.** It has had no release in 3 years, and nothing better that is free and permissive exists for styled workbooks. *Recommend:* keep it pinned, with npm audit at 0 today. Fuzz the reader with invented malformed files, and move reading into a worker (a gap already listed). Check the project every quarter. If a CVE appears, the fallback is to read with SheetJS CE and write with our own writer, built on fflate and `package.js`. That fallback is large (L), so don't build it now.
- **pdf.js 4.7.76 or 6.4.299: a recommendation, not a decision.** 4.7.76 has no CVE known to us. But it is two major versions behind, and fixes made after 4.7 are not in it. The OM, rent roll and CoStar readers depend on exact text positions, and the Safari 16.4 floor was measured on 4.7's legacy build. *Recommend:* keep 4.7.76 for the T-12 item, then upgrade in a PR of its own before the OM red-flag check (build-order item 5). Use the 6.4.299 legacy build, if it still ships. Gate the upgrade on these, and stop if any figure moves: every PDF fixture reads identically, both golden checks stay identical, the Safari floor is re-measured from the files, and new sizes and checksums are recorded.
- **Vendoring record: done in 4.7.12.** `VENDOR.md` is now `THIRD_PARTY.md`, the one register. Every shipped file has its license text in `vendor/licenses/` and a SHA-256, and each was compared with its published package. The links point to it (`README.md`, `app/ocr.js`, `docs/baseline-report.md`, `ui-revamp.md`); the old-code fixtures under `tests/e2e/files/` stay as they are.
- **Two notes in the research were wrong:** `charts.js` writes Excel charts, not screen charts (those are in `glance.js` and `rentrollui.js`), and `layout.js` rebuilds PDF text layout, not the screen layout.

# Third-party code

Every library Zlatura ships or tests with: its version, license, and why it
is there. Adding a library, or copying code from another repository, needs
the owner's approval first (`docs/working-rules.md`, "Reuse before you
build"). The calculation engine and the money logic (`app/engine/`,
`app/deal.js`) use no outside code.

## Shipped with the app (`vendor/`, loaded in the browser, offline)

Each file is pinned to an exact version. Its license text is in
`vendor/licenses/`, and its SHA-256 is below. "Upstream" means the file as
published in the npm package. Each was compared byte for byte on
2026-10-15.

| Library | Version | License | File | Why | Upstream match |
|---|---|---|---|---|---|
| ExcelJS | 4.4.0 | MIT | `vendor/exceljs-4.4.0.min.js` (948 KB) | reads and writes .xlsx: imports, templates, Excel exports | the published `dist/exceljs.min.js` without its last line (the `sourceMappingURL` comment) |
| fflate | 0.8.3 | MIT | `vendor/fflate-0.8.3.min.js` (33 KB) | zip: backups, packages, .xlsx parts | identical (`umd/index.js`) |
| pdf.js | 4.7.76 (legacy build) | Apache-2.0 | `vendor/pdf-4.7.76-legacy.min.js` (381 KB) | text and positions from PDFs: OMs, rent rolls, statements | identical (`legacy/build/pdf.min.mjs`) |
| pdf.js worker | 4.7.76 (legacy build) | Apache-2.0 | `vendor/pdf-4.7.76-legacy.worker.min.js` (1.4 MB) | the PDF parser, off the main thread | the same code, but control characters inside some string literals are written as `\x` escapes. The published file has them as raw bytes; it looks re-saved by a tool. Proposed: re-vendor the published bytes |
| Tesseract.js | 7.0.0 | Apache-2.0 | `vendor/ocr/tesseract-7.0.0.esm.min.js`, `…worker.min.js` | OCR of scanned pages, on request only | the published `dist/` files without their last line (the `sourceMappingURL` comment) |
| Tesseract.js core | 7.0.0 | Apache-2.0 | `vendor/ocr/tesseract-core-7.0.0-simd-lstm.wasm.js` (3.9 MB) | the OCR engine (WebAssembly) | identical |
| English trained data (`4.0.0_best_int`) | from `@tesseract.js-data/eng` 1.0.0 | Apache-2.0, from Tesseract's tessdata_best (not checked from this session); the npm wrapper says MIT and ships no license file | `vendor/ocr/eng-4.0.0-best-int/eng.traineddata.gz` (2.9 MB) | the OCR language model | identical |

SHA-256:

```
b35a8b1fd1a5fe3e853a7dc4006294281dd2430ee3108fd30d5417ab7c9a5d56  vendor/exceljs-4.4.0.min.js
462ef8041fc970e3615a20a9dd2b2e3047a073b2da729ef4f02b634bba8b7b83  vendor/fflate-0.8.3.min.js
e0215a6a1063bb912cbbfd3ffac76438c328b99a3b826d6bdb3cde9cf874c2a3  vendor/pdf-4.7.76-legacy.min.js
1a26e1004519cdc3335fd72003352a9a2fdd583072e8b2a676406c5ad2735742  vendor/pdf-4.7.76-legacy.worker.min.js
bc422741067054cecf2e299a66b32f90b13591f1bdbd42a72d627d165240e8d4  vendor/ocr/tesseract-7.0.0.esm.min.js
f113187fae220d9f895d7bd28d2b94d7640261ae91031b0d6005c2773fcb9861  vendor/ocr/tesseract-7.0.0.worker.min.js
c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38  vendor/ocr/tesseract-core-7.0.0-simd-lstm.wasm.js
45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91  vendor/ocr/eng-4.0.0-best-int/eng.traineddata.gz
```

## Used only to test (npm devDependencies, never shipped)

| Library | Version | License | Why |
|---|---|---|---|
| @xmldom/xmldom | 0.9.12 | MIT | a DOM for template and workbook tests in Node |
| axe-core | 4.10.2 | MPL-2.0 | accessibility checks in the browser flows (test-only; MPL-2.0 is allowed here only because it never ships) |
| exceljs | 4.4.0 | MIT | the same library as above, for Node tests |
| fflate | 0.8.3 | MIT | the same library as above, for Node tests |
| typescript | 6.0.2 | Apache-2.0 | the type check (`types/`) |
| playwright | 1.56.1 | Apache-2.0 | the browser flows: global in the cloud image, `npm install --no-save` in CI |

## The optional AI server (`server/`, not part of the offline app)

| Library | Version | License | Why |
|---|---|---|---|
| @anthropic-ai/sdk | 0.133.0 | MIT | the firm's server calls Claude for AI readings, when AI is turned on |

## Audit

`npm audit` on 2026-10-15: 0 vulnerabilities in the root, 0 in `server/`.
The vendored files aren't covered by `npm audit`. Check them by hand
against each project's security advisories when a version changes. pdf.js
4.7.76 is past CVE-2024-4367 (fixed in 4.2.67).

## The project's own license

`LICENSE` is MIT today. If the project becomes proprietary, the libraries
above still fit: they are MIT, Apache-2.0 or BSD-style. Their license texts
must keep shipping with the files, and Apache-2.0's NOTICE terms must be
kept where a project has a NOTICE file. None of these packages ships one.

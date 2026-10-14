# Bundled third-party files

Everything the app needs ships with it, so the page makes no outbound request
and works with no connection. Each library carries its version in its file
name: the service worker serves these files cache-first, and a new version
under a new name is the only way an installed copy can be sure to pick it up.

| Path | Package | Version | Licence |
|---|---|---|---|
| `vendor/pdf-4.7.76-legacy.min.js`, `vendor/pdf-4.7.76-legacy.worker.min.js` | [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`, `legacy/build`) | 4.7.76 | Apache-2.0 |
| `vendor/exceljs-4.4.0.min.js` | [ExcelJS](https://github.com/exceljs/exceljs) (`dist/exceljs.min.js`) | 4.4.0 | MIT |
| `vendor/fflate-0.8.3.min.js` | [fflate](https://github.com/101arrowz/fflate) (`umd/index.js`) | 0.8.3 | MIT |
| `vendor/ocr/tesseract-7.0.0.esm.min.js`, `vendor/ocr/tesseract-7.0.0.worker.min.js` | [tesseract.js](https://github.com/naptha/tesseract.js) (`dist/tesseract.esm.min.js`, `dist/worker.min.js`) | 7.0.0 | Apache-2.0 (bundles: buffer and regenerator-runtime, MIT; ieee754, BSD-3-Clause; zlib.js, MIT) |
| `vendor/ocr/tesseract-core-7.0.0-simd-lstm.wasm.js` | [tesseract.js-core](https://github.com/naptha/tesseract.js-core) (`tesseract-core-simd-lstm.wasm.js`: Tesseract and Leptonica built to WebAssembly) | 7.0.0 | Apache-2.0 (Tesseract); Leptonica, BSD-2-Clause |
| `vendor/ocr/eng-4.0.0-best-int/eng.traineddata.gz` | [@tesseract.js-data/eng](https://www.npmjs.com/package/@tesseract.js-data/eng) (`4.0.0_best_int/eng.traineddata.gz`, from tesseract-ocr/tessdata_best) | 1.0.0 | package MIT; the trained data Apache-2.0 |
| `fonts/public-sans-*.woff2` | [Public Sans](https://public-sans.digital.gov/) via `@fontsource/public-sans` | 5.1.0 | OFL-1.1 |

## Why the legacy build of pdf.js

The standard build of pdf.js 4.7 calls `Promise.withResolvers`, which Safari
added in 17.4; on an older iPhone every PDF fails to open. The legacy build
polyfills it. Its oldest remaining requirement is one class static block in
`pdf.min.js`, which Safari has supported since 16.4 (iOS 16.4, March 2023). Both
were measured by parsing the files rather than taken from documentation.

## The scanned-page reader (vendor/ocr/, 4.7.4)

Read a scanned rent roll page only when the broker taps "Read this scanned
page" (`app/ocr.js`). Sizes: the library 63,174 bytes, its worker 111,269,
the WebAssembly engine 3,899,472, the English data 2,952,873: 7,026,788 in
all (6.7 MB). They are **not** in the service worker's install set, so
installing the app costs what it did; the service worker keeps them, once
fetched, in a cache of their own (`zlatura-ocr-tesseract-7.0.0`) that app
updates leave alone, so a page can be read offline after the first time.
Before the first use, offline, reading a page fails with a message and
nothing else is affected.

Only the SIMD, LSTM-only build of the engine is shipped: every browser the
app supports has WebAssembly SIMD (Safari since 16.4, the app's floor for
pdf.js already), and the app checks for it before offering the reader. The
non-SIMD and "relaxed SIMD" builds and the legacy-engine data (10.9 MB) are
left out. The library is pointed at these files by path (`workerPath`,
`corePath`, `langPath`, no blob worker, no IndexedDB cache), so it never
falls back to its default CDN.

Taken with `npm pack tesseract.js@7.0.0 tesseract.js-core@7.0.0
@tesseract.js-data/eng@1.0.0` (npm checks each tarball against the
registry's sha512): tesseract.js-7.0.0.tgz sha256 `9a93bf51…4b606a`,
tesseract.js-core-7.0.0.tgz `ba584355…718ee0`,
tesseract.js-data-eng-1.0.0.tgz `c9bddf2e…27f7bb`. The only edit: the
trailing `//# sourceMappingURL=` comments are removed from the two
tesseract.js files, as for ExcelJS. The data file is gzip (binary); the
repository test for control characters skips `.gz` files.

## Edits to the published files

- The two pdf.js files are renamed from `.mjs` to `.js` so every static host
  serves them with a JavaScript content type. They are still ES modules.
- `pdf-4.7.76-legacy.worker.min.js` had 30 raw control bytes (ESC and similar)
  inside string literals in its font code. They are written as `\xHH` escapes,
  which mean the same thing; some hosts refuse files containing raw control
  characters. A tokenizer comparison of the original and edited files finds all
  426,344 tokens identical in value.
- The trailing `//# sourceMappingURL=` comment is removed from
  `exceljs-4.4.0.min.js`, because the map file it names is not shipped.

## Updating a library

1. `npm pack <package>@<version>` and take the file named in the table.
2. Save it under `vendor/` with the new version in its name, and delete the old one.
3. Update the name in `app/kit.js`, in the `ASSETS` list in `sw.js`, and here
   (for the OCR files: in `app/ocr.js` and `OCR_CACHE` in `sw.js`; they stay
   out of `ASSETS`).
4. Bump `CACHE` in `sw.js`. `npm test` fails if the list and the files disagree.

## Used only by the tests

`npm ci` installs these for `npm test`; none of them ships with the site.

| Package | Version | Why |
|---|---|---|
| `exceljs` | 4.4.0 | builds workbooks in the workbook tests, and the templates the template tests fill |
| `fflate` | 0.8.3 | reads and writes the .xlsx packages in the tests |
| `@xmldom/xmldom` | 0.9.12 | stands in for the browser's DOMParser when the template tests run in Node |

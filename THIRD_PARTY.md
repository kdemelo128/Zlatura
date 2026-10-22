# Third-party code

Every library and font Zlatura ships or tests with: its version, license,
and why it's there. This was `VENDOR.md` until 4.7.12. Adding a library, or
copying code from another repository, needs the owner's approval first
(`docs/working-rules.md`, "Reuse before you build"). The calculation engine
and the money logic (`app/engine/`, `app/deal.js`) use no outside code.

Everything the app needs ships with it, so the page makes no outbound
request and works with no connection. Each library carries its version in
its file name. The service worker serves these files cache-first, and a new
version under a new name is the only way an installed copy can be sure to
pick it up.

## Shipped with the app

Each file is pinned to an exact version, and its license text is in
`vendor/licenses/`. "Upstream" is the file as published in the npm package,
compared byte for byte on 2026-10-15.

| Path | Package | Version | License | Why | Upstream |
|---|---|---|---|---|---|
| `vendor/pdf-4.7.76-legacy.min.js` | [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`, `legacy/build/pdf.min.mjs`) | 4.7.76 | Apache-2.0 | text and positions from PDFs: OMs, rent rolls, statements | identical (renamed to `.js`) |
| `vendor/pdf-4.7.76-legacy.worker.min.js` | pdf.js (`legacy/build/pdf.worker.min.mjs`) | 4.7.76 | Apache-2.0 | the PDF parser, off the main thread | edited: control bytes escaped (below) |
| `vendor/exceljs-4.4.0.min.js` | [ExcelJS](https://github.com/exceljs/exceljs) (`dist/exceljs.min.js`) | 4.4.0 | MIT | reads and writes .xlsx: imports, templates, Excel exports | edited: map comment removed |
| `vendor/fflate-0.8.3.min.js` | [fflate](https://github.com/101arrowz/fflate) (`umd/index.js`) | 0.8.3 | MIT | zip: backups, packages, .xlsx parts | identical |
| `vendor/ocr/tesseract-7.0.0.esm.min.js`, `vendor/ocr/tesseract-7.0.0.worker.min.js` | [tesseract.js](https://github.com/naptha/tesseract.js) (`dist/tesseract.esm.min.js`, `dist/worker.min.js`) | 7.0.0 | Apache-2.0 (bundles buffer and regenerator-runtime, MIT; ieee754, BSD-3-Clause; zlib.js, MIT) | OCR of scanned pages, on request only | edited: map comments removed |
| `vendor/ocr/tesseract-core-7.0.0-simd-lstm.wasm.js` | [tesseract.js-core](https://github.com/naptha/tesseract.js-core) (`tesseract-core-simd-lstm.wasm.js`: Tesseract and Leptonica built to WebAssembly) | 7.0.0 | Apache-2.0 (Tesseract); Leptonica, BSD-2-Clause | the OCR engine | identical |
| `vendor/ocr/eng-4.0.0-best-int/eng.traineddata.gz` | [@tesseract.js-data/eng](https://www.npmjs.com/package/@tesseract.js-data/eng) (`4.0.0_best_int/eng.traineddata.gz`, from tesseract-ocr/tessdata_best) | 1.0.0 | package MIT; the trained data Apache-2.0 (the package ships no license file) | the OCR language model | identical |
| `fonts/public-sans-latin-{400,600,700}-normal.woff2` | [Public Sans](https://public-sans.digital.gov/) via `@fontsource/public-sans` | 5.1.0 | OFL-1.1 (a font license; it lets the fonts ship inside any app, proprietary included) | the app's type | identical |

The license texts in `vendor/licenses/`, taken from the published packages:
`exceljs-4.4.0.LICENSE`, `fflate-0.8.3.LICENSE`, `pdfjs-4.7.76.LICENSE`,
`tesseract.js-7.0.0.LICENSE.md`, `tesseract.js-core-7.0.0.LICENSE` and
`public-sans-5.1.0.OFL-1.1.LICENSE`. None of these packages ships a NOTICE
file.

SHA-256 of each shipped file:

```
e0215a6a1063bb912cbbfd3ffac76438c328b99a3b826d6bdb3cde9cf874c2a3  vendor/pdf-4.7.76-legacy.min.js
1a26e1004519cdc3335fd72003352a9a2fdd583072e8b2a676406c5ad2735742  vendor/pdf-4.7.76-legacy.worker.min.js
b35a8b1fd1a5fe3e853a7dc4006294281dd2430ee3108fd30d5417ab7c9a5d56  vendor/exceljs-4.4.0.min.js
462ef8041fc970e3615a20a9dd2b2e3047a073b2da729ef4f02b634bba8b7b83  vendor/fflate-0.8.3.min.js
bc422741067054cecf2e299a66b32f90b13591f1bdbd42a72d627d165240e8d4  vendor/ocr/tesseract-7.0.0.esm.min.js
f113187fae220d9f895d7bd28d2b94d7640261ae91031b0d6005c2773fcb9861  vendor/ocr/tesseract-7.0.0.worker.min.js
c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38  vendor/ocr/tesseract-core-7.0.0-simd-lstm.wasm.js
45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91  vendor/ocr/eng-4.0.0-best-int/eng.traineddata.gz
9707fd1d120b6fd56804438c1c0879cee23233534149a1a4a7782ca1f40121ad  fonts/public-sans-latin-400-normal.woff2
7f8f1af2c80ddaff95380a7fcd78d2564187591f70e9fecc3a10c79bdb1bf05f  fonts/public-sans-latin-600-normal.woff2
39dc2fced2b7f9aaf2fa1f16aa992228c61569efabde0ce0b78a17d088c22d4e  fonts/public-sans-latin-700-normal.woff2
```

## Edits to the published files

- The two pdf.js files are renamed from `.mjs` to `.js`, so every static
  host serves them with a JavaScript content type. They are still ES
  modules.
- `pdf-4.7.76-legacy.worker.min.js` had 30 raw control bytes (ESC and
  similar) inside string literals in its font code. They are written as
  `\xHH` escapes, which mean the same thing; some hosts refuse files that
  contain raw control characters. A tokenizer comparison of the original
  and the edited file finds all 426,344 tokens identical in value.
- The trailing `//# sourceMappingURL=` comment is removed from
  `exceljs-4.4.0.min.js` and from the two tesseract.js files, because the
  map files they name aren't shipped.

## Why the legacy build of pdf.js

The standard build of pdf.js 4.7 calls `Promise.withResolvers`, which
Safari added in 17.4, so on an older iPhone every PDF fails to open. The
legacy build polyfills it. Its oldest remaining requirement is one class
static block in `pdf.min.js`, which Safari has supported since 16.4 (iOS
16.4, March 2023). Both were measured by parsing the files, not taken from
documentation.

## The scanned-page reader (vendor/ocr/, 4.7.4)

- **When it runs:** a scanned rent roll page is read only when the broker
  taps "Read this scanned page" (`app/ocr.js`).
- **Size:** the library is 63,174 bytes, its worker 111,269, the
  WebAssembly engine 3,899,472 and the English data 2,952,873: 7,026,788
  in all (6.7 MB).
- **Install and offline:**
  - These files are **not** in the service worker's install set, so
    installing the app costs what it did.
  - Once fetched, the service worker keeps them in a cache of their own
    (`zlatura-ocr-tesseract-7.0.0`) that app updates leave alone, so a page
    can be read offline after the first time.
  - Offline before the first use, reading a page fails with a message, and
    nothing else is affected.
- **Which build:**
  - Only the SIMD, LSTM-only build of the engine is shipped. Every browser
    the app supports has WebAssembly SIMD (Safari since 16.4, the app's
    floor for pdf.js already), and the app checks for it before offering
    the reader.
  - The non-SIMD and "relaxed SIMD" builds, and the legacy-engine data
    (10.9 MB), are left out.
- **No CDN:** the library is pointed at these files by path (`workerPath`,
  `corePath`, `langPath`; no blob worker, no IndexedDB cache), so it never
  falls back to its default CDN.

The files were taken with `npm pack tesseract.js@7.0.0
tesseract.js-core@7.0.0 @tesseract.js-data/eng@1.0.0`, and npm checks each
tarball against the registry's sha512. The tarballs' sha256:
tesseract.js-7.0.0.tgz `9a93bf51…4b606a`, tesseract.js-core-7.0.0.tgz
`ba584355…718ee0`, tesseract.js-data-eng-1.0.0.tgz `c9bddf2e…27f7bb`. The
data file is gzip (binary); the repository test for control characters
skips `.gz` files.

## Updating or adding a library

Adding one is an approval gate: the "Prior art" table first, then the
owner's OK.

1. `npm pack <package>@<version>`, and take the file named in the table.
2. Save it under `vendor/` with the new version in its name, delete the old
   one, and put its license text in `vendor/licenses/`.
3. Update the name in `app/kit.js` and in the `ASSETS` list in `sw.js`. For
   the OCR files, update `app/ocr.js` and `OCR_CACHE` in `sw.js`; they stay
   out of `ASSETS`.
4. Update this file: the row, the edits (if any) and the SHA-256.
5. Bump `CACHE` in `sw.js`. `npm test` fails if the list and the files
   disagree.
6. Run `npm audit` and report the result.

## Claude Code skills (developer tooling, never shipped)

Text that guides the coding assistant in this repository. Nothing here is loaded by the app, runs code, or reaches the network.

| Path | Source | Commit | License | Why | Upstream |
|---|---|---|---|---|---|
| `.claude/skills/ponytail/SKILL.md` | [ponytail](https://github.com/DietrichGebert/ponytail) (`skills/ponytail/SKILL.md`) | `09c434ab73ca43761c5d8b0c5d341926c2fba710` | MIT (`.claude/skills/ponytail/LICENSE`, the upstream file) | the smallest complete change, with the owner's gates kept (approved 2026-10-21, A1 in `docs/proposals/dev-tools-and-reuse.md`; integrated at the owner's request 2026-10-22) | edited: the upstream text unchanged, one section "In this repository" added at the end |

Only the one skill file is taken, as text. Not taken: its hooks (SessionStart, mode tracker, subagent and statusline scripts), the band UI, and the other five skills (`ponytail-review`, `-audit`, `-debt`, `-gain`, `-help`). The upstream text is the first 3,496 bytes of the file; `tests/ponytail-skill.test.js` checks that they are unchanged.

SHA-256: upstream `skills/ponytail/SKILL.md` `9badd22a32e19cb884e46dfa8d3aae82bb81dfa5484105b8b4f0262df823a509`; `LICENSE` `fb1bc6909ac3ef82d5c22106e32ef682b0cff66788fa915fb9b53b15c9d2f3ab`.

## Used only by the tests (npm devDependencies, never shipped)

| Package | Version | License | Why |
|---|---|---|---|
| `exceljs` | 4.4.0 | MIT | builds workbooks in the workbook tests, and the templates the template tests fill |
| `fflate` | 0.8.3 | MIT | reads and writes the .xlsx packages in the tests |
| `@xmldom/xmldom` | 0.9.12 | MIT | stands in for the browser's DOMParser when the template tests run in Node |
| `axe-core` | 4.10.2 | MPL-2.0 | accessibility checks in the browser flows. Test-only and never shipped; MPL-2.0 needs the owner's approval for anything that ships |
| `fast-check` | 4.10.2 | MIT | property tests (`tests/properties.test.js`): the money rounding, the text decoder and the CSV and paste readers over generated inputs. Pinned to 4.x because 5.x needs Node 22.12 and the repo declares Node 20 or later. Never imported by `app/`, `server/` or `sw.js` |
| `typescript` | 6.0.2 | Apache-2.0 | the type check (`types/`) |
| `playwright` | 1.56.1 | Apache-2.0 | the browser flows: global in the cloud image, `npm install --no-save` in CI |

## CI-only tools (never shipped)

Run by `.github/workflows/security-scan.yml` on every push and pull request (owner approved 2026-10-22). None is part of the app, in `package.json`, or loaded by any page. Each is downloaded at an exact version and checked against the SHA-256 from that release's published checksums file before it runs; `tests/ci-scanners.test.js` fails if a tool, its version pin or its checksum check goes missing. To bump one: new version, new checksum from the same file, and update this table.

| Tool | Version | License | SHA-256 (source of the checksum) | Upstream | Why |
|---|---|---|---|---|---|
| actionlint | 1.7.12 | MIT | `8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8` (`actionlint_1.7.12_linux_amd64.tar.gz`, from `actionlint_1.7.12_checksums.txt`) | [rhysd/actionlint](https://github.com/rhysd/actionlint) | lints the workflow files for syntax, expression and shell mistakes |
| zizmor | 1.31.1 | MIT | `58e878eb2dbd2c6183c105e1ac28c14f7dd1eca44a783f1fe2a69647d012c410` (the `manylinux_2_28_x86_64` wheel, the digest PyPI publishes; installed with `pip --require-hashes` from `.github/zizmor-requirements.txt`) | [zizmorcore/zizmor](https://github.com/zizmorcore/zizmor) | finds workflow-injection and credential-exposure patterns in the workflows |
| gitleaks | 8.30.1 | MIT | `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb` (`gitleaks_8.30.1_linux_x64.tar.gz`, from `gitleaks_8.30.1_checksums.txt`) | [gitleaks/gitleaks](https://github.com/gitleaks/gitleaks) | looks for committed secrets in a pull request's commits, or the whole history on a push. The release binary, not the GitHub Action (its action needs a licence key for organisations). Config: `.gitleaks.toml` |
| osv-scanner | 2.7.0 | Apache-2.0 | `160c6253e2922e9e0a6a9771c5c4c40a4b3c6090b34a3cdd5e80c96cc2e4218b` (`osv-scanner_linux_amd64`, from `osv-scanner_SHA256SUMS`) | [google/osv-scanner](https://github.com/google/osv-scanner) | checks `package-lock.json` and `server/package-lock.json` against osv.dev. Online mode: only package names and versions leave, as with `npm audit` |

## The optional AI server (`server/`, not part of the offline app)

| Package | Version | License | Why |
|---|---|---|---|
| `@anthropic-ai/sdk` | 0.133.0 | MIT | the firm's server calls Claude for AI readings, when AI is turned on |

## Audit

`npm audit` on 2026-10-15 found 0 vulnerabilities in the root and 0 in
`server/`. The vendored files aren't covered by `npm audit`, so check them
by hand against each project's security advisories when a version changes.
pdf.js 4.7.76 is past CVE-2024-4367 (fixed in 4.2.67).

## The project's own license

`LICENSE` is MIT today. If the project becomes proprietary, everything
above still fits: it is MIT, Apache-2.0, BSD-style or, for the fonts,
OFL-1.1. The license texts must keep shipping with the files.

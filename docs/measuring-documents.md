# Measuring your documents

Two small tools measure how well Zlatura reads documents and how its numbers
compare with another calculator. They change nothing in the app and nothing
in your saved deals. They run on your own computer only.

## 1. How well are my documents read?  `doc-local`

1. Put real documents (PDF, .xlsx, CSV) in `private/docs/`. The `private/`
   folder is git-ignored, so nothing in it is ever uploaded or committed.
2. In Terminal, in the project folder, run:
   `node tests/tools/doc-local.mjs`
   To look at another folder inside `private/`, give its path. A folder
   outside `private/` is refused.
3. Optional, to score the answers: next to a document, save a small file with
   the same name and `.answers.json`, for example `rent-roll-a.answers.json`,
   holding the values you checked: `{ "noi": 123456, "months": 12 }`. T-12 keys:
   `months`, `lines`, `egi`, `opex`, `noi`, `taxes`. Rent roll keys: `rows`,
   `units`, `vacant`, `sf`. OM and lease files use the field names the app's
   readers use. Amounts are in dollars.

The output is one row per kind of layout, with counts only. **Accepted**: the
app's reader took the file. **Asked**: the app would ask you to choose what
it is. **Refused**: it could not be read (a scan, a password-protected file,
an old format). With answer files you also get **right**, **wrong**, **asked**
(the app would have asked you) and **missed** (the app found nothing).
The goal is zero wrong first, then fewer asked.

No file name, tenant, address or figure is printed. Files appear as `file-01`,
`file-02` and so on. `--labels` writes `doc-local-labels.json` next to the
folder (inside `private/`) so you can tell which is which. `--verbose-files`
adds one line of counts per file.

## 2. Do the numbers agree?  `uw-oracle`

`node tests/tools/uw-oracle.mjs` runs three invented deals (price, NOI, loan,
hold, growth, exit cap) through Zlatura's engine and prints each figure. To
compare with another package's calculation script, unzip the package anywhere
and run:
`UW_PACKAGE_DIR=/path/to/unzipped-package node tests/tools/uw-oracle.mjs`
The script is read, never changed, and runs with no network. IRR, DSCR, debt
yield and cap rate are compared; a gap over 0.01 is shown as DIFFERS. A
difference is a question to look into, not an answer: work the case by hand
first. Without the variable the tool says `oracle: not run`; add
`--require-oracle` to make that an error (exit code 3).

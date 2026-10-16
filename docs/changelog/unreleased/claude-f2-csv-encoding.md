# a CSV saved by an older Excel or Windows keeps its accents and curly quotes, and the app says how it read the file

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

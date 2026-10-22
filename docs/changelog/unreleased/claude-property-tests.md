# Property tests for the money rounding, the text decoder and the CSV readers

Tests only; nothing a broker sees changes, and no saved result changes.

- **New `tests/properties.test.js`** uses fast-check 4.10.2 (MIT, exact-pinned, a devDependency never imported by `app/`, `server/` or `sw.js`). It generates inputs and checks what each function's own comments promise:
  - `roundTo`/`toCents`/`toRate`: whole cents (or the stated places), rounding twice equals once, within half a place, half away from zero, negatives mirror positives, non-numbers pass through and never become 0.
  - `decodeText`: UTF-8 with and without a byte-order mark, and UTF-16 LE and BE, round-trip exactly; arbitrary bytes never throw.
  - `csvRows`, `detectDelimiter`, `pastedRows`: a grid written as standard CSV reads back the same (quotes, delimiters, CR LF); the delimiter of a plain grid is found; pasted tab rows come back trimmed.
- The seed is pinned so a failure repeats. Listed in `THIRD_PARTY.md` under the test-only packages.
- **Tested:** each property goes red on a deliberate mutation (floor instead of round, no doubled-quote handling, no byte-order-mark strip) and the file fails on the old code, where fast-check is not installed.

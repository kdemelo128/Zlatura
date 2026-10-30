# The dependency scan passes again, with a dated exception for one dev-only advisory

The CI `dependencies` check began failing on advisory GHSA-g3hv-75wg-m249 in minimatch 3.1.5 and 5.1.9, which only the test-time ExcelJS package pulls in (never shipped).

- **`osv-scanner.toml`** ignores that one advisory until 2026-12-29, with a written reason; nothing else is ignored.
- **`docs/security-checklist.md`** records the exception and when to remove it.
- **Tested:** `tests/ci-scanners.test.js` requires every exception to have a reason and an expiry within 90 days; the pinned osv-scanner 2.7.0 loads the file.
- Saved results unchanged; no app code touched.

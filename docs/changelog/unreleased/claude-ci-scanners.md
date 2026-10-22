# Four security scanners now run on every push and pull request

A new `security-scan` workflow lints the workflows and looks for committed secrets and known-vulnerable packages. It changes CI and tests only: the app, the engine and saved deal results are untouched.

- **actionlint and zizmor** lint `.github/workflows/`. zizmor's findings are fixed: `persist-credentials: false` on every checkout in `test.yml`. One finding stays, as a documented exception with a comment: the test-only `npm install --no-save playwright@1.56.1` (exact version, never shipped).
- **gitleaks** scans a pull request's own commits, or the whole history on a push. The release binary is used, not the GitHub Action. `.gitleaks.toml` allowlists two storage-key names that the generic-api-key rule mistook for secrets (`app/ui.js` and one proposal document).
- **osv-scanner** checks `package-lock.json` and `server/package-lock.json` against osv.dev; only package names and versions are sent.
- **Pinned:** each tool is downloaded at an exact release version and checked against a SHA-256 from that release's published checksums; zizmor is installed from PyPI with `--require-hashes`. They are listed in `THIRD_PARTY.md` under "CI-only tools (never shipped)".
- **Tested:** `tests/ci-scanners.test.js` fails if a tool, its version pin or its checksum check is missing, or if an unpinned download is added. Saved deal results are unchanged.

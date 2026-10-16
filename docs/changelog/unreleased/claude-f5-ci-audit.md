# CI now scans for known-vulnerable packages and pins its own tools

Nothing changes in the app. The test workflow had no dependency scan (`npm audit` had been clean once, by hand) and its four GitHub Actions followed moving tags.

- **Audit job:** `npm audit --audit-level=low` runs on every push for both lock files, the app's and the AI server's, dev dependencies included. Any advisory fails the run. Both are clean today.
- **Pinned actions:** `checkout`, `setup-node`, `setup-python` and `cache` are pinned to full commit SHAs, with the tag in a comment.
- **Dependabot:** `.github/dependabot.yml` opens one weekly PR when a pinned action has a newer release. It never merges by itself.
- **Tested:** `tests/workflow-pins.test.js` fails on the old workflow (2 failures) and passes on the new one; it checks every `uses:` for a 40-character SHA and the two audit steps. `npm audit` run by hand on both lock files: 0 vulnerabilities. Golden outputs identical (no `app/` change).
- **Not done here:** the host's security alerts are a GitHub setting the owner turns on (Settings, Code security).

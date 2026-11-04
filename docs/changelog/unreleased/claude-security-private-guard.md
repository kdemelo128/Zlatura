# A real file or credential can no longer be committed by accident

The repo is public and real files live only in the git-ignored `private/` folder, but nothing stopped `git add -f` or `git add -A` from committing a lease, a rent roll or a key.

- **New guard test** (`tests/hygiene.test.js`, runs in `npm test` and so in CI): fails if a tracked path is under `private/`, is `.env*`, a key or certificate, a local database, or a `.pdf/.xlsx/.xls/.docx/.pptx` outside an exact allowlist of invented fixtures (empty today); and if a tracked text file holds a private-key block, AWS, GitHub, Slack, `sk-`, Google or JWT token pattern. It names the path and rule, never the match. It complements gitleaks (local, no network, also covers document types).
- **`.gitignore`** now also ignores `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `*.kdbx` and local databases.
- **Tested** with a throwaway `git init` repo holding each bad case, plus one mutation per rule. Saved results and golden outputs are unchanged.

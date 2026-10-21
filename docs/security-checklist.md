# Security checklist (run at the end of each phase, and before accounts or hosting)

Written in our own words for Zlatura. The method is informed by the public
[cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) (MIT, commit
`c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`, read 2026-10-21); no text or code is copied from it, and the skill
itself is not installed or run. First applied by hand on 2026-10-21 (findings F1 to F4 in
`docs/proposals/dev-tools-and-reuse.md`, section 4).

## How to run it

1. **Reconnaissance.** List what an attacker (a hostile file, backup, OM, T-12, AI reply or web page) can put in front
   of the app, and where each input ends up. For Zlatura the boundaries are: uploaded files (PDF, xlsx, xlsm, csv,
   docx later), backups and project files, the optional AI server and its replies, the service worker and its cache,
   IndexedDB and `localStorage`, and the CI workflow.
2. **Hunt by boundary,** not by file. For each boundary tick the checks below that apply and note what was read.
3. **Verify before rating.** A second reviewer who did not raise a candidate tries to disprove it by reading the
   path from input to effect. Only a reproduced path gets a severity. A candidate the code refutes is **rejected**,
   not "needs validation". Facts we cannot establish stay **needs validation** with no severity.
4. **Defence-in-depth gaps are not vulnerabilities.** Record them separately (for example a missing CSP directive when
   no injection exists). Self-inflicted harm on the broker's own device (a huge file freezing their tab) is low, not high.
5. **Report** to `docs/` as: finding id, severity (critical, high, medium, low), status (confirmed, needs validation,
   rejected), `file:line`, input to effect trace, remediation (not done in the audit), and a "not performed" list.
   Severity cannot exceed the demonstrated impact: critical is unauthenticated takeover or loss of all data; high defeats
   a stated control with real consequences; medium has a limited blast radius; low exposes non-secret internals.
6. **Never** probe a live system, use real client data, or read `private/`. Reproduce only with invented data.

## Checks

**Untrusted input to the page**
1. Trace file contents (cell text, PDF text, filenames), `location.hash/search`, `window.name`, storage and AI replies to
   every DOM sink: `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `srcdoc`, `eval`, `new Function`,
   string `setTimeout`, `javascript:` or `data:` links.
2. Any `message` listener checks the exact origin (not a substring) and `event.source`; no `postMessage` to `'*'`
   carries sensitive data.
3. Objects built from file or backup keys (`__proto__`, `constructor`, `prototype`) cannot reach shared prototypes;
   `in` checks on untrusted keys use own-property tests.
4. Element ids and names never come from data (DOM clobbering).
5. Links opened from data use a fixed host or are encoded; `window.open` and `_blank` carry `noopener`.
6. Exports (CSV, clipboard, xlsx) neutralise cells starting `=`, `+`, `-`, `@`, tab or CR, and never write
   user text as a formula or hyperlink.

**Parsers and resource use**
7. Every reader of an uploaded file checks size first, then content type from bytes; zips check declared total
   size, entry count and per-entry ratio before inflating; sheets and pages have caps.
8. Regexes on file text have no nested ambiguous quantifiers.
9. PDF.js runs with eval disabled and its workers come from our own origin; OCR files load from our origin only.
10. Macros in a workbook are never run; a password-protected file gets a message, not a crash.

**Storage, restore and migration**
11. A backup, project or template file is validated on read: version, shape, key allow-list, size. A restore can never
    change where secrets or tokens go (the AI server URL and token), nor write arbitrary `localStorage` keys.
12. Tokens and keys are not in the repo, the backup, logs or the page; anything in shipped JavaScript is public.
13. A restore or migration cannot silently overwrite newer data; a snapshot is taken first.
14. Recovery copies and mirrors are read back only after a shape check.

**Service worker and PWA**
15. Registration URL and scope are fixed; the cache contains only same-origin files of one release; old caches are
    deleted; user-specific data is never cached by URL.
16. Cached app files cannot be replaced by a mix of releases.
17. Framing and `frame-ancestors`: note that GitHub Pages cannot send headers, and what the page does about it.
18. The CSP in the page: list which directives exist and what that means if an injection is ever introduced.
19. On a shared `github.io` origin, other project pages share storage: record whether a custom domain removes this.

**The optional AI server (`server/`)**
20. Every route authenticates before acting, with a constant-time comparison; failed attempts are throttled; health
    routes reveal nothing.
21. CORS and origin allow-list; no reflected `Origin` with credentials.
22. Request parsing is inside the error handler; body size, concurrency and time are bounded; errors do not leak
    internals or upstream bodies.
23. No shell use with input; no fetching of user-supplied URLs (server-side request forgery).
24. Documents and prompts are not logged. Model output is schema-checked, and has no path to actions: no tools, and
    every figure is shown for review with its quote checked against the page.
25. Startup refuses weak tokens (length and entropy).

**Supply chain and CI**
26. Workflow permissions are read-only by default; no `pull_request_target` with untrusted code; actions pinned to
    commit SHAs; an `npm audit` job covers every lockfile.
27. Vendored libraries: version, license and checksum in `THIRD_PARTY.md`; compare each with its known advisories;
    no install scripts.
28. No secrets in the working tree or history (patterns only, never print a value).
29. Deployed files have no source maps or test data.

**Privacy**
30. Only opt-in requests leave the device (AI), and the confirm sheet names the host. Search the code for `fetch`,
    `XMLHttpRequest`, `sendBeacon`, `WebSocket`, dynamic `import()` and external `<script>`/`<link>`.
31. Telemetry is absent; nothing from `private/` is in tests, docs, commits or PRs.

**Method discipline**
32. For each finding: the lower-trust principal, the first file and line the input reaches, the sink, and what was
    observed in code (not assumed).
33. Record coverage (entry points and sinks reviewed) and say where coverage is partial.
34. A dynamic pass (fuzzing a parser, a zip-bomb timing, a live header check) is listed as not performed unless it
    was done; add one when a phase introduces accounts, hosting or a new file format.

## Standing remediation rule

Fixes are separate PRs with a test that fails on the old code. A finding that changes a stored field, a saved result
or hosting is an approval gate.

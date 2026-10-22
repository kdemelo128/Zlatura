# Checks: the AI server's own tests now run in check:full, and in check:quick when server/ changes

GitHub's CI runs the AI server's test suite (`server/`, its own package), but `check:full` did not, so a server test could pass every local check and still fail CI. That happened on #78: the research route's injection test began sending more requests than the per-minute limit allows once #76 doubled the injection set, and only CI saw it.

- **`check:full`** now runs `npm test` in `server/` after the root suite, installing the server's one package first if it is missing.
- **`check:quick`** runs it too whenever a file under `server/` changed.
- **Tested:** `tests/check-tools.test.js` fails if either rule is removed (it fails on 4.7.53's `check.mjs`); a quick check with a file added under `server/` ran the 43 server tests, and one without did not. No app code changed; saved results and golden outputs are unchanged.

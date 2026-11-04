# The app no longer stops loading when a privacy blocker dislikes a file name

A content blocker on a Mac (EasyPrivacy rule `/fingerprint.js`) blocked `app/fingerprint.js` on github.io, so the whole app showed "didn't finish loading". Incognito and the iPhone, which have no blocker, worked.

- **File renamed** to `app/filehash.js` (only the file name; the saved documents' `fingerprint` field is unchanged). A test now fails if any served file is named like a tracker.
- **The load-error panel** names the file that could not be downloaded and the browser's own words, says your deals were not touched, and has a "Reset the offline copy and reload" button. It clears only the offline copy (service worker and Cache Storage), never deals or settings.
- **Start-up**: if one part fails to start, a banner names it and the rest of the app still opens.

Tested with `tests/served-names.test.js` and `tests/e2e/loaderror-flow.mjs` (axe on the panel at phone and desktop size). Saved results unchanged.

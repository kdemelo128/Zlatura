# Let the Workspace sheet finish closing before the reload test

The Workspace browser flow now waits until the sheet's history entry is released
before issuing Reload. Closing the sheet calls asynchronous history.back();
reloading immediately raced that navigation and aborted the test. Every assertion
is preserved, with no arbitrary delay or application behavior change. The same
flow failed before the wait and now passes all 99 checks in pinned Chromium.

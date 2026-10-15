---
name: hand-test
description: Write the phone hand-test checklist for a Zlatura PR (what the owner should try on an iPhone). Use when a PR changes anything a person can see or do.
---

# Phone hand-test checklist

Write three to six steps the owner can do on an iPhone in a few minutes, for
what this PR changed only. Each step: where to go, what to tap or type, and
what they should see. Cover, where the PR touches them:
- typing into each changed field character by character, with Tab/Next and
  then leaving the screen or switching apps at once (the edit must be kept);
- the change after a reload and after closing and reopening the app;
- a phone-width check: nothing wider than the screen, nothing under 11 px,
  buttons big enough to tap;
- light and dark;
- offline, when the PR touches loading, files or the service worker.

For a tests-only or docs-only PR, write "None: no app change".
Safari is not installed in the cloud session: say so, since the owner's
phone is the only Safari check.

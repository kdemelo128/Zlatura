---
name: review-diff
description: Review a finished diff in two passes, against the repo's standards and against the approved spec. Use for the designer's one review before a parsing, money, data-format, migration or security PR, and for end-of-phase reviews.
---

# Review a diff

Review the diff against `origin/main` (`git diff origin/main...HEAD`), read-only. Two separate passes, because a diff can pass one and fail the other:

**A. Standards** (the repo's own rules):
- No second copy of the maths; money in whole cents; no build step.
- Part 21.2 hazards: blank as zero, monthly/annual, gross/net, SF/acres, percent/points, rentable/gross area, anything counted twice, a calculator checking itself, a value invented for an ambiguous input.
- Golden outputs unchanged (or the approved change); no saved-data or format change without approval; no real names or figures in the repo.
- New tests fail on the old code; mutation checks cover each part of the fix; a check was not weakened.
- Security: untrusted file or backup content, new network calls, new keys read from a file, log lines that print file content.
- A feature removed or made unreachable (not allowed).

**B. Spec** (the approved proposal, issue or owner message):
- Every approved decision is built; nothing unapproved was added.
- Each "not done" is listed as a gap, not silently dropped.
- The text the broker sees says what is true (Part 23 words; no "verified" without how).

Report: findings ranked, each with file:line, one line on why it matters and a realistic input that triggers it. Say "nothing found" for a pass that is clean. Do not fix in the review; the author decides. Findings marked optional never start a push.

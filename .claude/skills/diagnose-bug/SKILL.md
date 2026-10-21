---
name: diagnose-bug
description: Find a bug's root cause before fixing it, with a failing test first. Use when a bug is reported or a check fails and the cause is not yet known.
---

# Diagnose, then fix

1. **Reproduce it small.** The shortest input or click path that shows it, on invented data. If it only shows on a real file, reduce it to a structure-only description (counts, column kinds), never figures or names.
2. **Write the failing test first.** It must fail for the bug's reason, not for a typo. Run it and see it red. This is the same rule as quality-gates step 1: the test must also fail on the old code.
3. **Find the cause, not the symptom.** Say it in one line: "X is read as Y because Z". Look at where the value is first wrong (read, convert, store, show), not where it is noticed. Check the same mistake in the neighbouring code (other readers, other callers) and say which you checked.
4. **Fix the cause once**, in the shared place (`app/engine/`, `app/deal.js`, the one reader), never a second copy of the maths.
5. **Green, then widen.** The new test passes; then `npm run check:quick`; then the mutation checks (undo the fix part by part; each part's test must go red).
6. **Money and units:** ask whether the bug could be a monthly/annual, gross/net, SF/acres or percent/points mix, or a blank read as zero (Part 21.2). Those go to the designer for the root cause and a short note first.
7. **After two failed attempts** on the same bug, stop and hand it to the designer with what was tried.

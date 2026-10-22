---
name: proposal
description: Write a Zlatura design proposal in docs/proposals/ that the owner can decide from in one read. Use before any build bigger than a small PR, or when a Part 2 item needs a proposal.
---

# Proposal

1. **Scaffold the sections first:**
   - what changes for the broker;
   - the data shape and where it is stored;
   - Prior art (run the `prior-art` skill);
   - tests (fail on the old code, mutation checks);
   - cost;
   - decisions, each with a recommendation.

   Mark a gap TODO rather than guess.
2. **Fill each section from the repo** with file:line references and invented examples only; never figures or names from `private/`.
3. **Reader test:** one fresh agent gets only the proposal and answers:
   - What does the broker see?
   - What is stored?
   - What must the owner decide, and what is recommended?
   - What could go wrong with saved deals?

   Fix every wrong or unsure answer, then run it once more.
4. **Re-read once for filler.** Use only the seven status words, and never "verified" without saying how.
5. **Stop for the owner's approval.** No connectors (Slack, Drive and the like) as sources.

The reader test is an idea from Anthropic's doc-coauthoring skill (`anthropics/skills` at `dbd4588`; that folder states no licence, so nothing is copied); the wording here is our own.
